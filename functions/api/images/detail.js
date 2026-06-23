// 图片详情接口
import { createSupabaseClient } from '../_lib/supabase.js';
import { requireAuth, jsonResponse, errorResponse, handleOptions } from '../_lib/auth.js';

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
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return errorResponse('缺少图片ID');
    }

    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 查询图片详情
    const { data: image, error } = await supabase
      .from('images')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !image) {
      return errorResponse('图片不存在', 404);
    }

    return jsonResponse({
      success: true,
      image,
    });
  } catch (error) {
    console.error('图片详情接口错误:', error);
    return errorResponse('服务器内部错误', 500);
  }
}
