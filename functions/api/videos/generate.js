import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { createVideoTask, calculateCost } from '../_lib/videoService.js';
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
      duration = 5,
      aspectRatio = '16:9',
      mode = 'ti2vid', // ti2vid: 文生视频, i2v: 图生视频, multi-image: 多图, keyframes: 关键帧
      image = null, // 单张参考图 URL
      images = null, // 多张参考图 URL 数组
      seed = null,
      numInferenceSteps = null,
    } = body;

    if (!prompt || !prompt.trim()) {
      return errorResponse('视频描述不能为空');
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
    const cost = calculateCost(duration);

    // 创建视频任务（先创建任务，成功了再扣次数，避免超时白扣）
    let taskResult;
    try {
      taskResult = await createVideoTask(
        {
          prompt,
          negative_prompt: negativePrompt,
          style,
          duration,
          aspect_ratio: aspectRatio,
          mode,
          image,
          images,
          seed,
          num_inference_steps: numInferenceSteps,
        },
        env
      );
    } catch (taskError) {
      throw taskError;
    }

    // 如果 Agnes API 调用失败且降级到模拟模式，记录错误
    if (taskResult.mode === 'simulation-fallback') {
      console.warn('Agnes API 调用失败，已降级到模拟模式:', taskResult.error);
    }

    // 任务创建成功后，再扣除次数（优先扣每日次数，再扣余额）
    const deductResult = await deductCredits(
      userId,
      cost,
      null,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!deductResult.success) {
      // 扣次数失败，任务已经创建了，但是次数没扣成功...
      // 这种情况概率很低，先返回成功，用户相当于免费获得一次
      console.warn('扣次数失败，但任务已创建:', deductResult.error);
    }

    // 保存视频记录（直接用 fetch，确保 100% 生效）
    const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/videos`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt?.trim() || null,
        style: style || null,
        duration,
        aspect_ratio: aspectRatio,
        task_id: taskResult.task_id,
        status: 'processing',
        cost,
      }),
    });

    if (!insertRes.ok) {
      const err = await insertRes.json().catch(() => ({}));
      console.error('保存视频记录失败:', err);
      
      // 保存记录失败，退还次数
      try {
        if (deductResult.used_daily) {
          const currentUsed = user.daily_credits_used || 0;
          await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
            method: 'PATCH',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              daily_credits_used: Math.max(0, currentUsed - cost) 
            }),
          });
        } else {
          await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
            method: 'PATCH',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ balance: user.balance }),
          });
        }
      } catch (refundError) {
        console.error('退还次数失败:', refundError);
      }
      
      return errorResponse(`创建失败: ${err.message || JSON.stringify(err)}`);
    }

    const insertData = await insertRes.json();
    const video = Array.isArray(insertData) ? insertData[0] : insertData;

    return jsonResponse({
      success: true,
      video: video,
      cost,
      mode: taskResult.mode,
    });
  } catch (error) {
    console.error('生成视频失败:', error);
    return errorResponse(`生成失败: ${error.message || JSON.stringify(error)}`, 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
