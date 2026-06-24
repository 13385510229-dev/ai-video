import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';

export async function onRequest(context) {
  const { request, env } = context;

  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  // 只允许 DELETE 方法
  if (request.method !== 'DELETE') {
    return errorResponse('方法不允许', 405);
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
      return errorResponse(`查询失败: ${queryError.message || JSON.stringify(queryError)}`, 500);
    }

    if (!videos?.[0]) {
      return errorResponse('视频不存在或无权删除', 404);
    }

    // 删除视频
    const { error: deleteError } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId);

    if (deleteError) {
      console.error('删除视频失败:', deleteError);
      return errorResponse(`删除失败: ${deleteError.message || JSON.stringify(deleteError)}`, 500);
    }

    return jsonResponse({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('删除视频接口错误:', error);
    return errorResponse(`服务器错误: ${error.message || '未知错误'}`, 500);
  }
}
