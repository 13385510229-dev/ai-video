import { jsonResponse, errorResponse, errorResponseEx, handleOptions, requireAuth, rateLimit } from '../_lib/auth.js';
import { generateImage } from '../_lib/imageService.js';
import { deductCredits, ERROR_CODES } from '../_lib/membership.js';
import { acquireUpstreamSeat, releaseUpstreamSeat } from '../_lib/upstreamSemaphore.js';

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

function sanitizeString(s: any, maxLen = 1000): string {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  if (t.length > maxLen) return t.slice(0, maxLen);
  return t;
}

const ALLOWED_STYLES = ['realistic', 'anime', '3d', 'cinematic'];
const ALLOWED_SIZES = [
  '1024x768',
  '768x1024',
  '1024x1024',
  '832x1216',
  '1216x832',
  '1K',
  '2K',
  '4:3',
  '3:4',
  '1:1',
  '16:9',
  '9:16',
];
const ALLOWED_MODES = ['text2image', 'image2image'];

export async function onRequestPost(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return handleOptions(request, env);
  }

  try {
    // 速率限制：每分钟 20 次
    const rate = await rateLimit(request, env, {
      max: 20,
      windowSeconds: 60,
      prefix: 'ratelimit:image-gen',
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
    const { prompt, negativePrompt = '', style = 'realistic', size = '1024x768', mode = 'text2image', image = null } = body;

    const cleanPrompt = sanitizeString(prompt, 1500);
    if (!cleanPrompt) return errorResponse('图片描述不能为空');
    if (!ALLOWED_STYLES.includes(String(style))) return errorResponse('风格参数非法');
    if (!ALLOWED_MODES.includes(String(mode))) return errorResponse('生成模式参数非法');
    if (typeof size !== 'string' || size.length > 32) return errorResponse('尺寸参数非法');
    const cleanSize = ALLOWED_SIZES.includes(size) ? size : '1024x768';

    // 图生图 URL 校验
    const urlRegex = /^https?:\/\/[^\s<>"']+$/i;
    const cleanImage = typeof image === 'string' && urlRegex.test(image) ? image : null;

    const cost = 1;

    // ========== 先拿上游并发席位，不先扣费 ==========
    // 图片接口是同步接口（每个请求占一个上游连接直到生成完毕，最多 120s）。
    // 如果我们不主动限制并发，Agnes 会用 429 拒掉 90%，然后我们的服务就会陷入大量
    // 扣费-回滚的闪变，用户体验极差。
    const sem = await acquireUpstreamSeat('image', env);
    if (!sem.acquired) {
      const retrySec = Math.max(3, Math.ceil((sem.retryAfterMs || 5000) / 1000));
      return errorResponseEx(
        `当前正在生成图片的人较多（${sem.currentCount || '已有'}/${sem.max || '上限'}），系统为避免请求被模型方拒绝而暂未为您创建任务。`,
        {
          status: 429,
          error_code: ERROR_CODES.UPSTREAM_BUSY,
          retry_after_ms: sem.retryAfterMs || 5000,
          details: { current: sem.currentCount, max: sem.max, retrySec },
        }
      );
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
      try {
        await releaseUpstreamSeat('image', sem.token, env);
      } catch (_) {}
      return errorResponseEx(deductResult.error || '余额不足，请充值后再生成', {
        status: 400,
        error_code: deductResult.error_code || ERROR_CODES.BALANCE_INSUFFICIENT,
        details: {
          need: deductResult.need,
          have: deductResult.have,
        },
      });
    }

    // ========== 调用 Agnes 生成图片 ==========
    // 图片同步生成：席位从开始占用到结束才释放
    let genResult: any = null;
    try {
      genResult = await generateImage({
        prompt: cleanPrompt,
        negativePrompt: sanitizeString(negativePrompt, 1000),
        size: cleanSize,
        style: String(style),
        apiKey: env.AGNES_API_KEY || '',
        mode: String(mode),
        image: cleanImage,
        apiBase: env.AGNES_API_URL || env.AGNES_API_BASE || 'https://apihub.agnes-ai.com/v1',
      });
      if (!genResult || !genResult.success) {
        throw new Error(genResult?.error || 'API returned failed');
      }
    } catch (genError: any) {
      // 失败必须退还次数 + 释放席位
      try {
        await releaseUpstreamSeat('image', sem.token, env);
      } catch (_) {}
      try {
        await rollbackDeducted(userId, cost, deductResult.used_daily, env);
      } catch (_) {}

      const mappedCode = upstreamToErrorCode(genError?.upstreamType);
      if (mappedCode) {
        return errorResponseEx(
          '图片生成失败：模型方临时返回异常。请稍候重试；如果持续失败，请联系管理员。',
          {
            status: 502,
            error_code: mappedCode,
            details: {
              upstream_status: genError?.upstreamStatus || 0,
              upstream_type: genError?.upstreamType,
            },
          }
        );
      }
      return errorResponse(genError.message || '生成失败，请稍后重试', 502);
    } finally {
      try {
        await releaseUpstreamSeat('image', sem.token, env);
      } catch (_) {}
    }

    // 模拟模式（本地测试用），也退次数
    if (genResult.mode && genResult.mode.startsWith('simulation')) {
      try {
        await rollbackDeducted(userId, cost, deductResult.used_daily, env);
      } catch (_) {}
    }

    // 生成成功且真实调用 Agnes：写入图片记录
    const imageId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    try {
      await fetch(`${env.SUPABASE_URL}/rest/v1/images`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          id: imageId,
          user_id: userId,
          prompt: cleanPrompt,
          negative_prompt: sanitizeString(negativePrompt, 1000) || null,
          style: String(style) || null,
          size: cleanSize,
          status: 'succeeded',
          image_url: genResult.imageUrl,
          cost,
        }),
      });
    } catch (insertError) {
      console.error('保存图片记录失败（但图片已生成），不影响用户结果:', insertError);
    }

    return jsonResponse({
      success: true,
      message: '生成成功',
      image: {
        id: imageId,
        user_id: userId,
        prompt: cleanPrompt,
        negative_prompt: sanitizeString(negativePrompt, 1000) || null,
        style: String(style) || null,
        size: cleanSize,
        status: 'succeeded',
        image_url: genResult.imageUrl,
        cost,
      },
      mode: genResult.mode,
    });
  } catch (error: any) {
    console.error('生成图片接口错误:', error);
    return errorResponse('生成失败，请稍后重试', 500);
  }
}

async function rollbackDeducted(userId: any, cost: number, usedDaily: boolean | undefined, env: any) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    if (usedDaily) {
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
    } else {
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
    }
  } catch (_) {}
}

export async function onRequestOptions(context) {
  if (context?.request && context?.env) {
    return handleOptions(context.request, context.env);
  }
  return handleOptions();
}
