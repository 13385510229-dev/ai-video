// 删除图片接口
import { createSupabaseClient } from '../_lib/supabase.js';
import { requireAuth, jsonResponse, errorResponse, handleOptions } from '../_lib/auth.js';

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

    const userId = authResult.user.sub;
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return errorResponse('缺少图片ID');
    }

    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 先检查图片是否存在且属于该用户
    const { data: image, error: findError } = await supabase
      .from('images')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (findError || !image) {
      return errorResponse('图片不存在', 404);
    }

    if (image.user_id !== userId) {
      return errorResponse('无权限删除', 403);
    }

    // 删除图片
    const { error } = await supabase
      .from('images')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除图片错误:', error);
      return errorResponse('删除失败');
    }

    return jsonResponse({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('删除图片接口错误:', error);
    return errorResponse('服务器内部错误', 500);
  }
}
