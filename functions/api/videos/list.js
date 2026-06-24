import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { getVideoTaskStatus } from '../_lib/videoService.js';

export async function onRequestGet(context) {
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
          // 视频生成成功（直接用 fetch）
          await fetch(`${env.SUPABASE_URL}/rest/v1/videos?id=eq.${video.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: 'succeeded',
              video_url: statusResult.video_url,
              thumbnail_url: statusResult.thumbnail_url,
            }),
          });

          video.status = 'succeeded';
          video.video_url = statusResult.video_url;
          video.thumbnail_url = statusResult.thumbnail_url;
        } else if (statusResult.status === 'failed') {
          // 视频生成失败（直接用 fetch）
          await fetch(`${env.SUPABASE_URL}/rest/v1/videos?id=eq.${video.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: 'failed',
              error_message: statusResult.error_message || '生成失败',
            }),
          });

          // 失败时退还次数（直接用 fetch）
          const { data: users } = await supabase
            .from('users')
            .select('balance')
            .eq('id', userId);

          if (users?.[0]) {
            await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
              method: 'PATCH',
              headers: {
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ balance: users[0].balance + (video.cost || 1) }),
            });
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
