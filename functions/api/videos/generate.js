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

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 查询用户余额和会员信息
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('balance, daily_credits_used, membership_type, membership_expire_at')
      .eq('id', userId);

    if (userError || !users?.[0]) {
      return errorResponse('用户不存在', 404);
    }

    const user = users[0];
    const cost = calculateCost(duration);

    if (user.balance < cost) {
      return errorResponse('余额不足，请充值', 400);
    }

    // 先扣除次数（优先扣每日次数，再扣余额）
    const deductResult = await deductCredits(
      userId,
      cost,
      null,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!deductResult.success) {
      return errorResponse(deductResult.error || '余额不足，请充值', 400);
    }

    // 创建视频任务
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
      // 创建任务失败，退还次数
      try {
        if (deductResult.used_daily) {
          // 扣的是每日次数，退还
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
          // 扣的是余额，退还
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
      throw taskError;
    }

    // 如果 Agnes API 调用失败且降级到模拟模式，记录错误
    if (taskResult.mode === 'simulation-fallback') {
      console.warn('Agnes API 调用失败，已降级到模拟模式:', taskResult.error);
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
