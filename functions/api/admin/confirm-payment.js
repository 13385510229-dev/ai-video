import { jsonResponse, errorResponse, handleOptions, requireAdmin } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { activateMembership, MEMBERSHIP_PLANS } from '../_lib/membership.js';

// 根据金额判断套餐类型
function getPackageByAmount(amount) {
  const amountNum = parseFloat(amount);
  
  // 次卡
  if (amountNum === 9.9) return { type: 'credits', credits: 10 };
  if (amountNum === 24.9) return { type: 'credits', credits: 30 };
  if (amountNum === 69.9) return { type: 'credits', credits: 100 };
  
  // 会员
  if (amountNum === 39) return { type: 'membership', membership_type: 'monthly' };
  if (amountNum === 99) return { type: 'membership', membership_type: 'quarterly' };
  if (amountNum === 299) return { type: 'membership', membership_type: 'yearly' };
  
  return { type: 'credits', credits: 0 };
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
    const { orderId } = body;

    if (!orderId) {
      return errorResponse('订单ID不能为空');
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 查询订单
    const { data: orders, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId);

    if (orderError || !orders?.[0]) {
      return errorResponse('订单不存在');
    }

    const order = orders[0];

    if (order.status === 'paid') {
      return errorResponse('订单已支付，无需重复确认');
    }

    // 判断套餐类型
    const pkg = getPackageByAmount(order.amount);

    // 更新订单状态（直接用 fetch）
    const orderUpdateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'paid',
        paid_at: new Date().toISOString(),
      }),
    });

    if (!orderUpdateRes.ok) {
      const err = await orderUpdateRes.json().catch(() => ({}));
      console.error('更新订单状态失败:', err);
      return errorResponse('确认失败，请稍后重试', 500);
    }

    // 根据套餐类型处理
    if (pkg.type === 'membership') {
      // 开通会员
      const result = await activateMembership(
        order.user_id,
        pkg.membership_type,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );

      if (!result.success) {
        return errorResponse('开通会员失败，请手动处理', 500);
      }

      return jsonResponse({
        success: true,
        message: '会员开通成功',
        membership: {
          type: pkg.membership_type,
          name: MEMBERSHIP_PLANS[pkg.membership_type]?.name,
          expire_at: result.expire_at,
          daily_credits: result.daily_credits,
        },
      });
    } else {
      // 次卡：给用户加次数
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('balance')
        .eq('id', order.user_id);

      if (userError || !users?.[0]) {
        return errorResponse('用户不存在');
      }

      const user = users[0];
      const credits = pkg.credits || order.credits || 0;
      const newBalance = (user.balance || 0) + credits;

      // 更新用户余额（直接用 fetch）
      const balanceUpdateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${order.user_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ balance: newBalance }),
      });

      if (!balanceUpdateRes.ok) {
        const err = await balanceUpdateRes.json().catch(() => ({}));
        console.error('更新用户余额失败:', err);
        return errorResponse('余额更新失败，请手动处理', 500);
      }

      return jsonResponse({
        success: true,
        message: '支付确认成功',
        newBalance,
      });
    }
  } catch (error) {
    console.error('确认支付失败:', error);
    return errorResponse('确认失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
