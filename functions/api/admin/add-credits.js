import { jsonResponse, errorResponse, handleOptions, verifyJWT, extractToken } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';

async function requireAdmin(request, env) {
  const token = extractToken(request);
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }

  const secret = env.JWT_SECRET || 'default-secret-change-me';
  const result = await verifyJWT(token, secret);

  if (!result.valid) {
    return { valid: false, error: result.error || 'Invalid token' };
  }

  if (!result.payload?.isAdmin && result.payload?.role !== 'admin') {
    return { valid: false, error: 'Not admin' };
  }

  return { valid: true, payload: result.payload };
}

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

    // 更新余额
    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', userId);

    if (updateError) {
      console.error('更新用户余额失败:', updateError);
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
