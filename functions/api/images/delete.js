// 删除图片接口
import { createSupabaseClient } from '../_lib/supabase.js';
import { requireAuth, jsonResponse, errorResponse, handleOptions } from '../_lib/auth.js';

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
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return errorResponse('缺少图片ID');
    }

    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 先检查图片是否存在且属于该用户
    const { data: images, error: findError } = await supabase
      .from('images')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', userId);

    if (findError) {
      console.error('查询图片失败:', findError);
      return errorResponse(`查询失败: ${findError.message || JSON.stringify(findError)}`, 500);
    }

    if (!images?.[0]) {
      return errorResponse('图片不存在或无权删除', 404);
    }

    // 删除图片
    const { error: deleteError } = await supabase
      .from('images')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('删除图片错误:', deleteError);
      return errorResponse(`删除失败: ${deleteError.message || JSON.stringify(deleteError)}`, 500);
    }

    return jsonResponse({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('删除图片接口错误:', error);
    return errorResponse(`服务器错误: ${error.message || '未知错误'}`, 500);
  }
}
