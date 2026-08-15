import { jsonResponse, errorResponse, handleOptions, requireAdmin } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { writeAdminLog } from '../_lib/adminLog.js';

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

    if (!userId || credits === undefined || credits === null) {
      return errorResponse('用户ID和次数不能为空');
    }

    const creditsNum = parseInt(credits);
    if (isNaN(creditsNum) || creditsNum === 0) {
      return errorResponse('次数必须是有效数字');
    }

    // 加减范围限制（防止单次操作过大造成溢出或误操作）
    const MAX_CHANGE = 100000;
    if (creditsNum > MAX_CHANGE || creditsNum < -MAX_CHANGE) {
      return errorResponse(`单次调整范围不能超过 ±${MAX_CHANGE}`);
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // CAS 原子调整用户余额：最多 5 次重试，防止并发覆盖
    const MAX_RETRY = 5;
    let finalBalance = null;

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      // 查询用户
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userId);

      if (userError) {
        console.error('查询用户失败:', userError);
        return errorResponse('用户不存在或查询失败', 500);
      }
      if (!users?.[0]) {
        return errorResponse('用户不存在');
      }

      const user = users[0];
      const currentBalance = Number(user.balance) || 0;
      const targetBalance = Math.max(0, currentBalance + creditsNum);

      // 条件更新：只有余额还是刚才读的值才更新，否则重试
      const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}&balance=eq.${currentBalance}`, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ balance: targetBalance }),
      });

      if (updateRes.ok) {
        const result = await updateRes.json().catch(() => []);
        if (Array.isArray(result) && result.length > 0) {
          finalBalance = targetBalance;
          break;
        }
      }
      // 否则并发冲突，下一轮重试
    }

    if (finalBalance === null) {
      return errorResponse('操作过于频繁，请稍后重试', 409);
    }

    // 审计日志（容错，失败不影响主流程）
    await writeAdminLog(env, {
      action: 'add_credits',
      targetUserId: userId,
      amount: creditsNum,
      detail: {
        before_balance: null, // 不再暴露原值，避免日志泄露
        after_balance: finalBalance,
      },
      request,
    });

    return jsonResponse({
      success: true,
      message: creditsNum > 0 ? `成功增加 ${creditsNum} 次` : `成功扣除 ${Math.abs(creditsNum)} 次`,
      newBalance: finalBalance,
    });
  } catch (error) {
    console.error('调整余额失败:', error);
    return errorResponse('操作失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
