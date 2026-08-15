import { jsonResponse, errorResponse, handleOptions, requireAuth, rateLimit } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { createVideoTask, calculateCost } from '../_lib/videoService.js';
import { deductCredits } from '../_lib/membership.js';

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

    // ========== 先扣次数，再调用 Agnes ==========
    // 这样扣费失败就直接拒绝，不会白嫖 Agnes
    const deductResult = await deductCredits(
      userId,
      cost,
      null,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!deductResult.success) {
      return errorResponse(deductResult.error || '余额不足，请充值后再生成');
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
      // Agnes 调用失败，需要回滚已扣次数
      console.warn('Agnes 视频任务创建失败，准备退还次数:', taskError?.message);
      try {
        await rollbackDeducted(userId, cost, deductResult.used_daily, env);
      } catch (rbErr) {
        console.error('退还次数失败:', rbErr);
      }
      return errorResponse('视频生成失败，请稍后重试');
    }

    // Agnes 降级到模拟模式（免费），也退回次数 —— 避免用户以为用了但实际没生成
    if (taskResult.mode && taskResult.mode.startsWith('simulation')) {
      try {
        await rollbackDeducted(userId, cost, deductResult.used_daily, env);
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

// 回滚扣除的次数（API 失败时使用）
async function rollbackDeducted(userId: any, cost: number, usedDaily: boolean | undefined, env: any) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (usedDaily) {
    // 扣的是每日次数：回退 daily_credits_used（不用条件，直接减就行，最多减成 0）
    await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        daily_credits_used: Math.max(
          0,
          `(daily_credits_used - ${cost})` as any
        ),
      }),
    }).catch(() => {});
    // 上面的表达式在 PostgREST 里不能直接用字符串当数字计算，改用查询后再更新
    try {
      const u = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=daily_credits_used`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (u.ok) {
        const arr = await u.json();
        if (arr?.[0]) {
          const cur = arr[0].daily_credits_used || 0;
          await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
            method: 'PATCH',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ daily_credits_used: Math.max(0, cur - cost) }),
          });
        }
      }
    } catch (_) {}
  } else {
    // 扣的是余额：加回去
    try {
      const u = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=balance`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (u.ok) {
        const arr = await u.json();
        if (arr?.[0]) {
          const cur = arr[0].balance || 0;
          await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
            method: 'PATCH',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ balance: cur + cost }),
          });
        }
      }
    } catch (_) {}
  }
}

export async function onRequestOptions(context) {
  if (context?.request && context?.env) {
    return handleOptions(context.request, context.env);
  }
  return handleOptions();
}
