// 获取当前用户信息
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

    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId);

    if (error || !users?.[0]) {
      return errorResponse('用户不存在', 404);
    }

    const user = users[0];

    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        balance: user.balance,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return errorResponse('获取失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
