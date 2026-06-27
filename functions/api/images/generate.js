import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { generateImage } from '../_lib/imageService.js';
import { deductCredits } from '../_lib/membership.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = parseInt(authResult.user.sub, 10) || authResult.user.sub;
    const body = await request.json();
    const {
      prompt,
      negativePrompt = '',
      style = 'realistic',
      size = '1024x768',
      mode = 'text2image',
      image = null,
    } = body;

    if (!prompt || !prompt.trim()) {
      return errorResponse('图片描述不能为空');
    }

    // 查询用户余额和会员信息（改用原生 fetch，确保稳定）
    const userQueryRes = await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=balance,daily_credits_used,membership_type,membership_expire_at`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!userQueryRes.ok) {
      return errorResponse('查询用户信息失败', 500);
    }

    const users = await userQueryRes.json();

    if (!users?.[0]) {
      return errorResponse('用户不存在', 404);
    }

    const user = users[0];
    const cost = 1; // 每张图片消耗 1 次

    // 生成唯一 ID（时间戳 + 随机数，避免自增主键问题）
    const imageId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

    // 同步生成图片（先生成，成功了再扣次数，避免超时白扣）
    let genResult;
    try {
      genResult = await generateImage({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt?.trim(),
        size: size || '1024x768',
        style: style,
        apiKey: env.AGNES_API_KEY || '',
        mode,
        image,
        apiBase: env.AGNES_API_BASE || 'https://apihub.agnes-ai.com/v1',
      });

      if (!genResult.success) {
        throw new Error('生成失败');
      }
    } catch (genError) {
      console.error('图片生成失败:', genError);
      return errorResponse(genError.message || '生成失败，请稍后重试');
    }

    // 生成成功后，再扣除次数（优先扣每日次数，再扣余额）
    const deductResult = await deductCredits(
      userId,
      cost,
      null,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!deductResult.success) {
      // 扣次数失败，但图片已经生成了... 这种情况概率很低，直接返回成功
      console.warn('扣次数失败，但图片已生成:', deductResult.error);
    }

    // 保存记录（直接用 fetch，确保稳定）
    try {
      const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/images`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          id: imageId,
          user_id: userId,
          prompt: prompt.trim(),
          negative_prompt: negativePrompt?.trim() || null,
          style: style || null,
          size: size || '1024x768',
          status: 'succeeded',
          image_url: genResult.imageUrl,
          cost,
        }),
      });

      if (!insertRes.ok) {
        const insertErr = await insertRes.text();
        console.error('保存图片记录失败:', insertErr);
        // 保存记录失败，但图片已经生成了，次数也扣了，还是返回成功
      }
    } catch (insertError) {
      console.error('保存图片记录失败:', insertError);
      // 保存记录失败不影响返回，用户已经拿到图片了
    }

    return jsonResponse({
      success: true,
      message: '生成成功',
      image: {
        id: imageId,
        user_id: userId,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt?.trim() || null,
        style: style || null,
        size: size || '1024x768',
        status: 'succeeded',
        image_url: genResult.imageUrl,
        cost,
      },
      mode: genResult.mode,
    });
  } catch (error) {
    console.error('生成图片接口错误:', error);
    return errorResponse(`生成失败: ${error.message || JSON.stringify(error)}`, 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
