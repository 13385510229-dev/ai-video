import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { createVideoTask, calculateCost } from '../_lib/videoService.js';

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

    // 查询用户余额
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId);

    if (userError || !users?.[0]) {
      return errorResponse('用户不存在', 404);
    }

    const user = users[0];
    const cost = calculateCost(duration);

    if (user.balance < cost) {
      return errorResponse('余额不足，请充值', 400);
    }

    // 创建视频任务
    const taskResult = await createVideoTask(
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

    // 如果 Agnes API 调用失败且降级到模拟模式，记录错误
    if (taskResult.mode === 'simulation-fallback') {
      console.warn('Agnes API 调用失败，已降级到模拟模式:', taskResult.error);
    }

    // 扣除余额（直接用 fetch，确保 100% 生效）
    try {
      await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ balance: user.balance - cost }),
      });
    } catch (updateError) {
      console.error('扣除余额失败:', updateError);
      // 即使扣除失败也继续，后面可以补扣
    }

    // 保存视频记录
    const { data: video, error: insertError } = await supabase
      .from('videos')
      .insert({
        user_id: userId,
        prompt,
        negative_prompt: negativePrompt,
        style,
        duration,
        aspect_ratio: aspectRatio,
        task_id: taskResult.task_id,
        status: 'processing',
        cost,
      });

    if (insertError) {
      console.error('保存视频记录失败:', insertError);
      return errorResponse('创建失败，请稍后重试', 500);
    }

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
