import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';

export async function onRequestDelete(context) {
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

    // 获取视频 ID
    const url = new URL(request.url);
    const videoId = url.searchParams.get('id');

    if (!videoId) {
      return errorResponse('视频ID不能为空');
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 先查询确认是用户自己的视频
    const { data: videos, error: queryError } = await supabase
      .from('videos')
      .select('id')
      .eq('id', videoId)
      .eq('user_id', userId);

    if (queryError) {
      console.error('查询视频失败:', queryError);
      return errorResponse('操作失败，请稍后重试', 500);
    }

    if (!videos?.[0]) {
      return errorResponse('视频不存在', 404);
    }

    // 删除视频
    const { error: deleteError } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId);

    if (deleteError) {
      console.error('删除视频失败:', deleteError);
      return errorResponse('删除失败，请稍后重试', 500);
    }

    return jsonResponse({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('删除视频失败:', error);
    return errorResponse('删除失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
