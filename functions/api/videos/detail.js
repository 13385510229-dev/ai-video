import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    // 认证
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = authResult.user.sub;

    // 获取视频 ID
    const url = new URL(request.url);
    const videoId = url.searchParams.get('id');

    if (!videoId) {
      return errorResponse('视频ID不能为空');
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 查询视频
    const { data: videos, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId);

    if (error) {
      console.error('查询视频详情失败:', error);
      return errorResponse('查询失败，请稍后重试', 500);
    }

    if (!videos?.[0]) {
      return errorResponse('视频不存在', 404);
    }

    return jsonResponse({
      success: true,
      video: videos[0],
    });
  } catch (error) {
    console.error('获取视频详情失败:', error);
    return errorResponse('查询失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
