// 图片列表接口
import { createSupabaseClient } from '../_lib/supabase.js';
import { requireAuth, jsonResponse, errorResponse, handleOptions } from '../_lib/auth.js';

export async function onRequestGet(context) {
  // 处理 OPTIONS 请求
  if (context.request.method === 'OPTIONS') {
    return handleOptions();
  }

  try {
    // 验证用户身份
    const authResult = await requireAuth(context);
    if (!authResult.success) {
      return errorResponse(authResult.message, 401);
    }

    const userId = authResult.userId;
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = context.env;

    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 查询用户的图片列表，按创建时间倒序
    const { data: images, error } = await supabase
      .from('images')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('查询图片列表错误:', error);
      return errorResponse('查询失败');
    }

    return jsonResponse({
      success: true,
      images: images || [],
    });
  } catch (error) {
    console.error('图片列表接口错误:', error);
    return errorResponse('服务器内部错误', 500);
  }
}
