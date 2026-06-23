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
      },
      env
    );

    // 扣除余额
    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: user.balance - cost })
      .eq('id', userId);

    if (updateError) {
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
    return errorResponse('生成失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
