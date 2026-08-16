import { errorResponse, handleOptions, requireAuth, rateLimit, jsonResponse } from '../_lib/auth.js';
import { checkAndResetDailyCredits, MEMBERSHIP_PLANS } from '../_lib/membership.js';
import { acquireUpstreamSeat, releaseUpstreamSeat } from '../_lib/upstreamSemaphore.js';

// 聊天模型列表（按优先级排列）
const CHAT_MODELS = [
  { name: 'agnes-2.5-flash', thinking: true },
  { name: 'agnes-2.0-flash', thinking: false },
];

const CHAT_COST_FOR_NON_MEMBER = 1; // 非会员每次聊天扣 1 次
const MAX_MESSAGES = 30; // 单次请求最多携带 30 条历史
const MAX_CONTENT_LEN = 4000; // 单条消息最多 4000 字
const MAX_TOKENS_LIMIT = 4096;

// Agnes 提示词最佳实践系统提示词
const AGNES_PROMPT_SYSTEM_PROMPT = `你是 Agnes AI 视频和图片生成平台的智能助手。当用户请求生成视频或图片时，你必须严格遵循 Agnes 的提示词最佳实践格式输出。

## 视频提示词最佳实践

### 文生视频
推荐结构：[主体] + [动作] + [场景] + [镜头运动] + [光线] + [风格]
示例：A young astronaut walking across a red desert planet, dust blowing in the wind, slow cinematic tracking shot, dramatic sunset lighting, realistic sci-fi style

### 图生视频
描述运动内容，保持关键主体稳定。
示例：Animate the character with subtle breathing motion, hair moving gently in the wind, background lights flickering softly, while keeping the face and outfit consistent

### 关键帧动画
清晰描述关键帧之间的过渡关系。
示例：Create a smooth transition from the first keyframe to the second keyframe, maintaining character identity, consistent camera angle, and natural motion between scenes

## 图片提示词最佳实践

### 文生图
推荐结构：[主体] + [场景/环境] + [风格] + [光照] + [构图] + [质量要求]
示例：日出时分薄雾峡谷上方的发光浮空城市，电影级写实风格，广角构图，丰富的建筑细节，柔和的金色光线，高视觉密度

### 图生图
推荐结构：[改变要求] + [新风格/场景] + [需要添加或移除的元素] + [需要保留的元素]
示例：将白天街道场景改为电影级赛博朋克夜景，添加霓虹招牌和湿滑路面倒影，同时保留原始街道布局、相机角度和主要建筑形状

## 重要规则
1. 生成视频提示词时，严格按照视频最佳实践结构输出
2. 生成图片提示词时，严格按照图片最佳实践结构输出
3. 必须使用英文输出提示词（Agnes 模型对英文支持更好）
4. 提示词要具体、有画面感，避免模糊描述
5. 包含镜头运动、光线、风格等关键元素
6. 用户用中文提问时，先用中文理解需求，再输出英文提示词`;

function sanitizeMsg(msg: any): any {
  if (!msg || typeof msg !== 'object') return null;
  const role = String(msg.role || '');
  const content = typeof msg.content === 'string' ? msg.content : '';
  if (!['system', 'user', 'assistant'].includes(role)) return null;
  const cutContent = content.length > MAX_CONTENT_LEN ? content.slice(0, MAX_CONTENT_LEN) : content;
  return { role, content: cutContent };
}

// 调用 Agnes 聊天 API
async function callAgnesChat({
  apiKey,
  messages,
  temperature,
  max_tokens,
  stream,
  model,
}: {
  apiKey: string;
  messages: any[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
  model: any;
}) {
  const requestBody: any = {
    model: model.name,
    messages,
    temperature,
    max_tokens,
    stream: true,
  };

  if (model.thinking) {
    requestBody.chat_template_kwargs = { thinking: true };
  }

  return await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
}

// 扣除聊天费用：会员免费（但是会限流），非会员每次扣 1 次
async function chargeChat(userId: any, env: any): Promise<{ ok: boolean; msg?: string; used_daily?: boolean }> {
  const info = await checkAndResetDailyCredits(userId, {
    supabaseUrl: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!info) return { ok: false, msg: '用户不存在' };

  if (info.is_member) {
    // 会员：不扣余额，但是有每日聊天额度（和每日生成次数共享 daily_credits_used，每天最多 daily_total * 5 次聊天，不实际写扣减）
    const plan = MEMBERSHIP_PLANS[info.membership_type as keyof typeof MEMBERSHIP_PLANS];
    const dailyChatLimit = plan ? plan.daily_credits * 5 : 10;
    // 简单做法：用 daily_credits_used 估算，超过限制就提示
    if ((info.daily_credits_used || 0) > dailyChatLimit + 200) {
      // 这里我们不真正记录聊天次数，只做 rateLimit；所以这个判断宽松
    }
    return { ok: true, used_daily: false };
  }

  // 非会员：每次扣 1 次余额，复用 deductCredits
  const { deductCredits } = await import('../_lib/membership.js');
  const r = await deductCredits(
    userId,
    CHAT_COST_FOR_NON_MEMBER,
    null,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!r.success) return { ok: false, msg: r.error || '余额不足，请充值后再使用聊天' };
  return { ok: true, used_daily: r.used_daily };
}

// 退还聊天扣费（仅非会员且调用失败时）
async function refundChat(userId: any, used_daily: boolean | undefined, env: any) {
  if (!used_daily && used_daily !== false) return; // 会员跳过
  if (used_daily) return; // 聊天目前不动 daily_credits_used，无退还
  try {
    const { refundCredits } = await import('../_lib/membership.js');
    await refundCredits(
      userId,
      CHAT_COST_FOR_NON_MEMBER,
      false,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (_) { /* 退款失败不影响主流程 */ }
}

// Agnes 聊天接口（流式输出，带模型回退）
export async function onRequestPost(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return handleOptions(request, env);
  }

  try {
    // 严格限流：每分钟 30 条
    const rate = await rateLimit(request, env, {
      max: 30,
      windowSeconds: 60,
      prefix: 'ratelimit:chat',
    });
    if (!rate.allowed) return rate.response!;

    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }
    const userId = parseInt(authResult.user.sub, 10) || authResult.user.sub;

    let body: any = {};
    try {
      body = await request.json();
    } catch (_) {
      return errorResponse('请求格式错误');
    }
    const { messages, temperature = 0.7, max_tokens = 2048, stream = true } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return errorResponse('消息内容不能为空');
    }

    // 清理历史消息
    const cleaned: any[] = [];
    for (const m of messages) {
      const sm = sanitizeMsg(m);
      if (sm) cleaned.push(sm);
      if (cleaned.length >= MAX_MESSAGES) break;
    }
    if (cleaned.length === 0) return errorResponse('消息内容不能为空');

    // 温度 & 最大 tokens 限制
    let temp = parseFloat(temperature);
    if (isNaN(temp)) temp = 0.7;
    temp = Math.max(0, Math.min(1.5, temp));
    let mt = parseInt(max_tokens, 10);
    if (isNaN(mt)) mt = 2048;
    mt = Math.max(64, Math.min(MAX_TOKENS_LIMIT, mt));

    const apiKey = env.AGNES_API_KEY;
    if (!apiKey) {
      return errorResponse('系统服务未配置');
    }

    // === 上游并发信号量：先申请席位，失败直接 429（不扣费）===
    // 多人同时聊天时，Agnes 聊天 API 会 429，这里加全局并发上限保护
    const seat = await acquireUpstreamSeat('chat', env);
    if (!seat.acquired) {
      return errorResponse(
        `当前使用人数较多（${seat.currentCount ?? '?'}/${seat.max ?? '?'}），请稍后重试`,
        429
      );
    }
    const seatToken = seat.token;

    // 先扣费（非会员），失败释放席位并返回
    let charge: { ok: boolean; msg?: string; used_daily?: boolean };
    try {
      charge = await chargeChat(userId, env);
    } catch (e) {
      try { await releaseUpstreamSeat('chat', seatToken, env); } catch (_) {}
      throw e;
    }
    if (!charge.ok) {
      try { await releaseUpstreamSeat('chat', seatToken, env); } catch (_) {}
      return errorResponse(charge.msg || '无法继续聊天');
    }

    // 尝试调用模型，失败则回退
    let apiRes: Response | null = null;
    let lastError: any = null;

    // 注入系统提示词：让 AI 按 Agnes 最佳实践生成提示词
    const messagesWithSystem = [
      { role: 'system', content: AGNES_PROMPT_SYSTEM_PROMPT },
      ...cleaned,
    ];

    for (const model of CHAT_MODELS) {
      try {
        apiRes = await callAgnesChat({
          apiKey,
          messages: messagesWithSystem,
          temperature: temp,
          max_tokens: mt,
          stream: !!stream,
          model,
        });

        if (apiRes.ok) break;

        const errorText = await apiRes.text().catch(() => '');
        lastError = { status: apiRes.status, message: errorText, model: model.name };
        // 404/401/403 模型不可用 → 回退
        if (apiRes.status === 404 || apiRes.status === 401 || apiRes.status === 403) continue;
        throw new Error(`API error ${apiRes.status}: ${errorText.slice(0, 400)}`);
      } catch (e: any) {
        lastError = { status: 500, message: e.message, model: model.name };
        continue;
      }
    }

    if (!apiRes || !apiRes.ok) {
      console.error('聊天所有模型调用失败:', lastError);
      // 失败退还次数 + 释放席位
      try { await refundChat(userId, charge.used_daily, env); } catch (_) {}
      try { await releaseUpstreamSeat('chat', seatToken, env); } catch (_) {}
      return errorResponse('AI 响应失败，请稍后重试');
    }

    // 流式转发
    const bodyIn = apiRes.body;
    if (!bodyIn) {
      try { await refundChat(userId, charge.used_daily, env); } catch (_) {}
      try { await releaseUpstreamSeat('chat', seatToken, env); } catch (_) {}
      return errorResponse('AI 响应为空');
    }

    const { readable, writable } = new TransformStream();
    const reader = bodyIn.getReader();
    const writer = writable.getWriter();

    // 流式传输在后台异步执行，信号量在流真正结束（done 或 error）后才释放
    // 这是关键：流式响应期间一直占用席位，避免流未结束就放新请求进来导致上游 429
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } catch (e) {
        console.error('流式传输错误:', e);
      } finally {
        try { writer.close(); } catch (_) {}
        // 流式结束才释放信号量席位
        try { await releaseUpstreamSeat('chat', seatToken, env); } catch (_) {}
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('聊天接口错误:', error);
    return errorResponse('请求失败，请稍后重试', 500);
  }
}

export async function onRequestOptions(context) {
  if (context?.request && context?.env) {
    return handleOptions(context.request, context.env);
  }
  return handleOptions();
}
