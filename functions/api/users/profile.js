// 获取当前用户信息
import { createSupabaseClient } from '../_lib/supabase.js';
import { requireAuth, jsonResponse, errorResponse, handleOptions } from '../_lib/auth.js';
import { checkAndResetDailyCredits, MEMBERSHIP_PLANS } from '../_lib/membership.js';

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

    // 检查并重置每日次数，同时获取用户信息
    const userInfo = await checkAndResetDailyCredits(userId, {
      supabaseUrl: env.SUPABASE_URL,
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });

    if (!userInfo) {
      return errorResponse('用户不存在', 404);
    }

    // 构建返回数据
    const result = {
      id: userInfo.id,
      email: userInfo.email,
      balance: userInfo.balance,
      created_at: userInfo.created_at,
      is_member: userInfo.is_member || false,
    };

    // 如果是会员，返回会员详情
    if (userInfo.is_member) {
      result.membership_type = userInfo.membership_type;
      result.membership_expire_at = userInfo.membership_expire_at;
      result.daily_credits_total = userInfo.daily_credits_total;
      result.daily_credits_remaining = userInfo.daily_credits_remaining;
      result.membership_name = MEMBERSHIP_PLANS[userInfo.membership_type]?.name || '会员';
    }

    return jsonResponse({
      success: true,
      user: result,
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return errorResponse('获取失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
