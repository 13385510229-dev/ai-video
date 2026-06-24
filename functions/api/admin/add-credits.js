import { jsonResponse, errorResponse, handleOptions, requireAdmin } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 管理员认证
    const authResult = await requireAdmin(request, env);
    if (!authResult.valid) {
      return errorResponse(authResult.error || '未授权', 401);
    }

    const body = await request.json();
    const { userId, credits } = body;

    if (!userId || !credits) {
      return errorResponse('用户ID和次数不能为空');
    }

    const creditsNum = parseInt(credits);
    if (isNaN(creditsNum) || creditsNum === 0) {
      return errorResponse('次数必须是有效数字');
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 查询用户
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId);

    if (userError || !users?.[0]) {
      return errorResponse('用户不存在');
    }

    const user = users[0];
    const newBalance = Math.max(0, (user.balance || 0) + creditsNum);

    // 更新余额（直接用 fetch，确保 100% 生效）
    const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ balance: newBalance }),
    });

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      console.error('更新用户余额失败:', err);
      return errorResponse('操作失败，请稍后重试', 500);
    }

    return jsonResponse({
      success: true,
      message: creditsNum > 0 ? `成功增加 ${creditsNum} 次` : `成功扣除 ${Math.abs(creditsNum)} 次`,
      newBalance,
    });
  } catch (error) {
    console.error('调整余额失败:', error);
    return errorResponse('操作失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
