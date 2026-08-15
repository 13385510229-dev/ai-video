import { jsonResponse, errorResponse, errorResponseEx, handleOptions, requireAuth, rateLimit } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { createVideoTask, calculateCost } from '../_lib/videoService.js';
import { deductCredits, refundCredits, ERROR_CODES } from '../_lib/membership.js';
import { acquireUpstreamSeat, releaseUpstreamSeat } from '../_lib/upstreamSemaphore.js';

// 把 videoService 抛出的结构化 UpstreamError 映射到 ERROR_CODES
function upstreamToErrorCode(type) {
  switch (type) {
    case 'UPSTREAM_AUTH': return ERROR_CODES.UPSTREAM_AUTH;
    case 'UPSTREAM_BALANCE': return ERROR_CODES.UPSTREAM_BALANCE;
    case 'UPSTREAM_RATE_LIMIT': return ERROR_CODES.UPSTREAM_RATE_LIMIT;
    case 'UPSTREAM_OVERLOAD': return ERROR_CODES.UPSTREAM_OVERLOAD;
    case 'UPSTREAM_TIMEOUT': return ERROR_CODES.UPSTREAM_TIMEOUT;
    case 'UPSTREAM_NETWORK': return ERROR_CODES.UPSTREAM_NETWORK;
    case 'UPSTREAM_BAD_REQUEST': return ERROR_CODES.UPSTREAM_BAD_REQUEST;
    case 'UPSTREAM_5XX': return ERROR_CODES.UPSTREAM_5XX;
    default: return null;
  }
}

// 输入参数白名单 + 长度限制
function sanitizeString(s: any, maxLen = 1000): string {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  if (t.length > maxLen) return t.slice(0, maxLen);
  return t;
}

const ALLOWED_STYLES = ['realistic', 'anime', '3d', 'cinematic'];
const ALLOWED_MODES = ['ti2vid', 'i2v', 'multi-image', 'keyframes'];
const ALLOWED_ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4'];

export async function onRequestPost(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return handleOptions(request, env);
  }

  try {
    // 速率限制：每分钟最多 10 次（防止批量刷爆 Agnes API 欠账）
    const rate = await rateLimit(request, env, {
      max: 10,
      windowSeconds: 60,
      prefix: 'ratelimit:video-gen',
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
    const {
      prompt,
      negativePrompt = '',
      style = 'realistic',
      duration = 5,
      aspectRatio = '16:9',
      mode = 'ti2vid',
      image = null,
      images = null,
      seed = null,
      numInferenceSteps = null,
    } = body;

    const cleanPrompt = sanitizeString(prompt, 1500);
    if (!cleanPrompt) {
      return errorResponse('视频描述不能为空');
    }

    // 枚举值校验
    if (!ALLOWED_STYLES.includes(String(style))) return errorResponse('风格参数非法');
    if (!ALLOWED_MODES.includes(String(mode))) return errorResponse('生成模式参数非法');
    if (!ALLOWED_ASPECTS.includes(String(aspectRatio))) return errorResponse('画面比例参数非法');
    // 时长限制：5/10/18
    let cleanDuration = parseInt(duration, 10);
    if (![5, 10, 18].includes(cleanDuration)) cleanDuration = 5;
    // seed 限制
    const cleanSeed = seed === null || seed === undefined ? null : Math.max(0, parseInt(seed, 10) || 0);
    const cleanSteps = numInferenceSteps == null
      ? null
      : Math.max(1, Math.min(50, parseInt(numInferenceSteps, 10) || 20));

    // 图生图 / 多图模式下，对传入 URL 做格式校验
    const urlRegex = /^https?:\/\/[^\s<>"']+$/i;
    const cleanImage = typeof image === 'string' && urlRegex.test(image) ? image : null;
    let cleanImages: string[] | null = null;
    if (Array.isArray(images)) {
      cleanImages = images.filter((u) => typeof u === 'string' && urlRegex.test(u)).slice(0, 16);
    }

    // 计算成本
    const cost = calculateCost(cleanDuration);

    // 未配置 AGNES_API_KEY：直接走模拟模式，不占用"上游席位"
    // （否则本地 dev 时用户永远被拦截为"上游很忙"）
    const useRealAgnes = !!env.AGNES_API_KEY;
    let semToken: string | undefined;
    if (useRealAgnes) {
      // ========== 先拿上游并发席位，不先扣费 ==========
      // 如果 Agnes 上游的并发已经满了，直接告诉用户"稍后再试"，不会碰用户任何余额，
      // 避免"先扣钱再发现模型打不进去、再退款，用户余额闪变"的极差体验。
      const sem = await acquireUpstreamSeat('video', env);
      if (!sem.acquired) {
        const retrySec = Math.max(3, Math.ceil((sem.retryAfterMs || 5000) / 1000));
        return errorResponseEx(
          `当前正在生成视频的人较多（${sem.currentCount || '已有'}/${sem.max || '上限'}），系统为避免请求被模型方拒绝而暂未为您创建任务。`,
          {
            status: 429,
            error_code: ERROR_CODES.UPSTREAM_BUSY,
            retry_after_ms: sem.retryAfterMs || 5000,
            details: { current: sem.currentCount, max: sem.max, retrySec },
          }
        );
      }
      semToken = sem.token;
    }

    // ========== 扣次数 ==========
    const deductResult = await deductCredits(
      userId,
      cost,
      null,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!deductResult.success) {
      if (useRealAgnes && semToken) {
        try { await releaseUpstreamSeat('video', semToken, env); } catch (_) {}
      }
      return errorResponseEx(deductResult.error || '余额不足，请充值后再生成', {
        status: 400,
        error_code: deductResult.error_code || ERROR_CODES.BALANCE_INSUFFICIENT,
        details: {
          need: deductResult.need,
          have: deductResult.have,
        },
      });
    }

    // ========== 扣费成功，调用 Agnes 创建任务 ==========
    let taskResult;
    try {
      taskResult = await createVideoTask(
        {
          prompt: cleanPrompt,
          negative_prompt: sanitizeString(negativePrompt, 1000),
          style: String(style),
          duration: cleanDuration,
          aspect_ratio: String(aspectRatio),
          mode: String(mode),
          image: cleanImage,
          images: cleanImages,
          seed: cleanSeed,
          num_inference_steps: cleanSteps,
        },
        env
      );
    } catch (taskError: any) {
      // Agnes 调用失败：退还次数（席位释放由下面统一的 finally 做）
      try {
        await refundCredits(userId, cost, !!deductResult.used_daily,
          env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      } catch (rbErr) {
        console.error('退还次数失败:', rbErr);
      }
      const mappedCode = upstreamToErrorCode(taskError?.upstreamType);
      if (mappedCode) {
        return errorResponseEx(
          '视频生成失败：模型方临时返回异常。请稍候重试；如果持续失败，请联系管理员。',
          {
            status: 502,
            error_code: mappedCode,
            details: {
              upstream_status: taskError?.upstreamStatus || 0,
              upstream_type: taskError?.upstreamType,
            },
          }
        );
      }
      return errorResponse(taskError?.message || '视频生成失败，请稍后重试', 502);
    } finally {
      // 无论成功/失败：如果有席位，统一在这里释放，避免漏/重释放
      if (useRealAgnes && semToken) {
        try {
          await releaseUpstreamSeat('video', semToken, env);
        } catch (_) {}
      }
    }

    // Agnes 降级到模拟模式（免费），也退回次数 —— 避免用户以为用了但实际没生成
    if (taskResult.mode && taskResult.mode.startsWith('simulation')) {
      try {
        await refundCredits(userId, cost, !!deductResult.used_daily,
          env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      } catch (_) {}
      if (taskResult.mode === 'simulation-fallback') {
        console.warn('Agnes API 调用失败，已降级模拟并退还次数:', taskResult.error);
      }
    }

    // 保存视频记录
    const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/videos`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        prompt: cleanPrompt,
        negative_prompt: sanitizeString(negativePrompt, 1000) || null,
        style: String(style) || null,
        duration: cleanDuration,
        aspect_ratio: String(aspectRatio),
        task_id: taskResult.task_id,
        video_id: taskResult.video_id || null,
        status: 'processing',
        cost,
      }),
    });

    let video: any = {
      task_id: taskResult.task_id,
      video_id: taskResult.video_id || null,
      status: 'processing',
    };
    if (insertRes.ok) {
      try {
        const insertData = await insertRes.json();
        video = Array.isArray(insertData) ? insertData[0] : insertData;
      } catch (_) {}
    } else {
      const err = await insertRes.text().catch(() => '');
      console.error('保存视频记录失败:', err.slice(0, 400));
    }

    return jsonResponse({
      success: true,
      video,
      cost,
      mode: taskResult.mode,
    });
  } catch (error: any) {
    console.error('生成视频失败:', error);
    return errorResponse('生成失败，请稍后重试', 500);
  }
}

export async function onRequestOptions(context) {
  if (context?.request && context?.env) {
    return handleOptions(context.request, context.env);
  }
  return handleOptions();
}
