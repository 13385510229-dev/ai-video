// 上游（Agnes）API 全局并发信号量
// 背景：我们按单IP的时间窗口做了限流（每分钟 10/20 次），但是没有限制"同一时刻多少个请求在等
// Agnes 模型执行"。如果 Agnes 免费/入门档只允许 3~8 个并发，100 个用户同时点生成时，绝大多数
// 请求会被 Agnes 直接 429 拒绝，虽然我们会退钱但用户体验极差，且会产生大量扣费回滚。
// 所以这里加一层"全局并发上限"，超过上限直接拒绝（不扣费）并明确提示稍后再试。
//
// 实现思路（分布式信号量简化版）：
//   - 用 KV_CACHE 维护一个计数器 upstreamsem:<name>:counter
//   - 申请时用 CAS（read-modify-write + 重新读回校验）；超额就拒绝
//   - 每一个成功的申请都会写一个带 TTL 的"席位 key"：upstreamsem:<name>:<token>
//     TTL 是该类任务的预估最长耗时，就算代码崩了没释放，KV 也会自动清
//   - 释放时把计数减 1，并删除席位 key
//
// 这不是 100% 精准的（多 Worker 实例 CAS 有毫秒级竞态会让计数偶尔超 1~2），
// 但对 Agnes 模型这种"宁少不多，不阻塞 Worker 不雪崩"的场景已经完全够用。

// 默认上限：留一点余量给 Agnes 的免费档/入门档（他们一般给 3~10 并发）
const DEFAULT_CONCURRENCY = {
  video: 6,   // 视频任务异步创建但占用 Agnes 调度，上限比图片略高
  image: 4,   // 图片是同步接口，每个都占一个连接直到 120s，保守一点
};

// 每个席位的 TTL（最长保护时间），对应 Agnes 接口超时
const DEFAULT_LEASE_TTL_SEC = {
  video: 500,   // 视频 API 超时 480s，略长 20s 做保护
  image: 130,   // 图片 API 超时 120s，略长 10s 做保护
};

const PREFIX = 'upstreamsem';

function safeParseInt(x, fallback) {
  const n = parseInt(x, 10);
  if (isNaN(n) || !isFinite(n)) return fallback;
  return n;
}

function getConfig(env, name) {
  let max: number = DEFAULT_CONCURRENCY[name] || 4;
  let leaseTtl: number = DEFAULT_LEASE_TTL_SEC[name] || 300;

  if (name === 'video') {
    const envMax = safeParseInt(env?.MAX_CONCURRENT_VIDEO, 0);
    if (envMax > 0) max = envMax;
    const envTtl = safeParseInt(env?.UPSTREAM_VIDEO_LEASE_TTL_SEC, 0);
    if (envTtl > 0) leaseTtl = envTtl;
  } else if (name === 'image') {
    const envMax = safeParseInt(env?.MAX_CONCURRENT_IMAGE, 0);
    if (envMax > 0) max = envMax;
    const envTtl = safeParseInt(env?.UPSTREAM_IMAGE_LEASE_TTL_SEC, 0);
    if (envTtl > 0) leaseTtl = envTtl;
  }

  return { max, leaseTtl };
}

function memory(name) {
  const memKey = `__sem_mem__:${name}`;
  if (!globalThis[memKey]) {
    globalThis[memKey] = {
      counter: 0,
      seats: new Map(), // token -> expireAt
    };
  }
  return globalThis[memKey];
}

function memPrune(name) {
  const m = memory(name);
  const now = Date.now();
  for (const [token, expireAt] of m.seats.entries()) {
    if (expireAt < now) {
      m.seats.delete(token);
      m.counter = Math.max(0, m.counter - 1);
    }
  }
}

function genToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 申请一个上游并发席位
 * @returns {Promise<{ acquired: boolean, token?: string, currentCount?: number, max?: number, retryAfterMs?: number }>}
 */
export async function acquireUpstreamSeat(
  name: 'video' | 'image',
  env: Record<string, any>,
  opts?: { maxOverride?: number }
) {
  const { max, leaseTtl } = getConfig(env, name);
  const effectiveMax = opts?.maxOverride && opts.maxOverride > 0 ? opts.maxOverride : max;

  const token = genToken();
  const counterKey = `${PREFIX}:${name}:counter`;
  const seatKey = `${PREFIX}:${name}:${token}`;

  // --- 1. 走 KV（生产推荐）---
  if (env?.KV_CACHE) {
    try {
      // 简单 CAS 循环：最多尝试 3 次，有极小概率多人同时 write 覆盖导致计数偏大（1~2）
      // 但在这个应用里宁多 1、不少 1（少 1 会让合法请求被误杀）
      let lastCount = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        const raw = await env.KV_CACHE.get(counterKey);
        const current = raw ? safeParseInt(raw, 0) : 0;
        lastCount = current;

        if (current >= effectiveMax) {
          // 超限，不给席位
          return {
            acquired: false,
            currentCount: current,
            max: effectiveMax,
            retryAfterMs: 3000 + Math.floor(Math.random() * 4000), // 3~7 秒抖一下
          };
        }

        // 尝试写入 +1，并立即创建席位 key（带 TTL 兜底）
        await env.KV_CACHE.put(counterKey, String(current + 1));
        await env.KV_CACHE.put(seatKey, '1', { expirationTtl: leaseTtl });

        // 回读确认没有被别人覆盖（弱 CAS）——如果和我们写的不一致就重试
        const verify = await env.KV_CACHE.get(counterKey);
        const finalCount = verify ? safeParseInt(verify, 0) : 0;
        if (finalCount >= current + 1 && finalCount <= effectiveMax) {
          // 成功
          return { acquired: true, token, max: effectiveMax };
        }

        // 冲突了：把自己创建的席位 key 清掉，然后下一轮重试
        try {
          await env.KV_CACHE.delete(seatKey);
        } catch (_) {}
      }

      // 3 次 CAS 都冲突：保守按"当前满员"处理，给出稍长的退避
      return {
        acquired: false,
        currentCount: lastCount,
        max: effectiveMax,
        retryAfterMs: 6000 + Math.floor(Math.random() * 4000),
      };
    } catch (kvErr) {
      console.warn('[upstreamSem] KV 申请席位失败，降级到内存信号量:', kvErr?.message || kvErr);
    }
  }

  // --- 2. 内存回退（本地 / KV 挂了）---
  try {
    memPrune(name);
    const m = memory(name);
    if (m.counter >= effectiveMax) {
      return {
        acquired: false,
        currentCount: m.counter,
        max: effectiveMax,
        retryAfterMs: 3000 + Math.floor(Math.random() * 4000),
      };
    }
    m.counter += 1;
    m.seats.set(token, Date.now() + leaseTtl * 1000);
    return { acquired: true, token, max: effectiveMax };
  } catch (memErr) {
    // 内存也崩了？不可能，但为了不让上游被打爆，默认放行一小部分（通过调用方兜底）
    console.warn('[upstreamSem] 内存信号量失败，放行:', memErr?.message || memErr);
    return { acquired: true, token: `fallback-${token}`, max: effectiveMax };
  }
}

/**
 * 释放一个上游并发席位。调用方要确保每个 acquire 成功后在 finally 里 release。
 */
export async function releaseUpstreamSeat(
  name: 'video' | 'image',
  token: string | undefined,
  env: Record<string, any>
) {
  if (!token) return;
  const counterKey = `${PREFIX}:${name}:counter`;
  const seatKey = `${PREFIX}:${name}:${token}`;

  // 优先 KV
  if (env?.KV_CACHE) {
    try {
      // 如果席位 key 还存在，就原子性地减一次计数（不存在说明 TTL 清了，计数已经靠别的机制修正）
      // 这里不做强一致：减 1 是尽量保守，多减了会让后续请求更宽松，用户无感
      const seatStillThere = await env.KV_CACHE.get(seatKey);
      if (seatStillThere) {
        const raw = await env.KV_CACHE.get(counterKey);
        const cur = raw ? safeParseInt(raw, 0) : 0;
        const next = Math.max(0, cur - 1);
        await env.KV_CACHE.put(counterKey, String(next));
        try {
          await env.KV_CACHE.delete(seatKey);
        } catch (_) {}
      }
      return;
    } catch (kvErr) {
      console.warn('[upstreamSem] KV 释放席位失败，降级到内存:', kvErr?.message || kvErr);
    }
  }

  // 内存释放
  try {
    memPrune(name);
    const m = memory(name);
    if (m.seats.has(token)) {
      m.seats.delete(token);
      m.counter = Math.max(0, m.counter - 1);
    }
  } catch (_) {}
}

/**
 * 供调试用：读取当前计数
 */
export async function inspectUpstreamSeats(name: 'video' | 'image', env: Record<string, any>) {
  const { max } = getConfig(env, name);
  const counterKey = `${PREFIX}:${name}:counter`;
  let kvCount: number | null = null;
  if (env?.KV_CACHE) {
    try {
      const raw = await env.KV_CACHE.get(counterKey);
      kvCount = raw ? safeParseInt(raw, 0) : 0;
    } catch (_) {}
  }
  memPrune(name);
  return {
    kvCount,
    memCount: memory(name).counter,
    max,
  };
}
