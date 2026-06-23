import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { getVideoTaskStatus } from '../_lib/videoService.js';

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    // 认证
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = authResult.user.sub;

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 查询视频列表
    const { data: videos, error } = await supabase
      .from('videos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('查询视频列表失败:', error);
      return errorResponse('查询失败，请稍后重试', 500);
    }

    // 更新进行中的视频状态
    const processingVideos = videos?.filter(v => v.status === 'processing' || v.status === 'pending') || [];

    for (const video of processingVideos) {
      if (!video.task_id) continue;

      try {
        const statusResult = await getVideoTaskStatus(video.task_id, env);

        if (statusResult.status === 'succeeded') {
          // 视频生成成功
          await supabase
            .from('videos')
            .update({
              status: 'succeeded',
              video_url: statusResult.video_url,
              thumbnail_url: statusResult.thumbnail_url,
            })
            .eq('id', video.id);

          video.status = 'succeeded';
          video.video_url = statusResult.video_url;
          video.thumbnail_url = statusResult.thumbnail_url;
        } else if (statusResult.status === 'failed') {
          // 视频生成失败
          await supabase
            .from('videos')
            .update({
              status: 'failed',
              error_message: statusResult.error_message || '生成失败',
            })
            .eq('id', video.id);

          // 失败时退还次数
          const { data: users } = await supabase
            .from('users')
            .select('balance')
            .eq('id', userId);

          if (users?.[0]) {
            await supabase
              .from('users')
              .update({ balance: users[0].balance + (video.cost || 1) })
              .eq('id', userId);
          }

          video.status = 'failed';
          video.error_message = statusResult.error_message;
        }
      } catch (err) {
        console.log(`更新视频 ${video.id} 状态失败:`, err.message);
        // 更新失败不影响列表返回
      }
    }

    return jsonResponse({
      success: true,
      videos: videos || [],
    });
  } catch (error) {
    console.error('获取视频列表失败:', error);
    return errorResponse('查询失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
