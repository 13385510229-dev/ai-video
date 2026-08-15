import { jsonResponse, errorResponse, handleOptions, requireAdmin } from '../_lib/auth.js';
import { activateMembership, MEMBERSHIP_PLANS } from '../_lib/membership.js';
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
    const { orderId } = body;

    if (!orderId) {
      return errorResponse('订单ID不能为空');
    }

    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    // 第一步：查询订单
    const orderQueryRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=*`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });

    if (!orderQueryRes.ok) {
      return errorResponse('查询订单失败');
    }

    const orders = await orderQueryRes.json();
    if (!orders?.[0]) {
      return errorResponse('订单不存在');
    }

    const order = orders[0];

    if (order.status === 'paid') {
      return errorResponse('订单已支付，无需重复确认');
    }

    // 第二步：乐观锁更新订单状态（只有 pending 才会更新成功）
    const orderUpdateRes = await fetch(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          status: 'paid',
          paid_at: new Date().toISOString(),
        }),
      }
    );

    if (!orderUpdateRes.ok) {
      const err = await orderUpdateRes.json().catch(() => ({}));
      console.error('更新订单状态失败:', err);
      return errorResponse('确认失败，请稍后重试', 500);
    }

    const updatedOrders = await orderUpdateRes.json();
    if (!updatedOrders || updatedOrders.length === 0) {
      return errorResponse('订单状态已变更，无需重复操作');
    }

    const credits = order.credits || 0;

    // 第三步：处理订单
    if (credits > 0) {
      // 次卡：给用户加次数
      const userQueryRes = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${order.user_id}&select=balance`,
        {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
        }
      );

      if (!userQueryRes.ok) {
        console.error('查询用户失败');
        return errorResponse('用户查询失败，请手动处理', 500);
      }

      const users = await userQueryRes.json();
      if (!users?.[0]) {
        return errorResponse('用户不存在');
      }

      const currentBalance = users[0].balance || 0;
      const newBalance = currentBalance + credits;

      // 更新用户余额
      const balanceUpdateRes = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${order.user_id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ balance: newBalance }),
        }
      );

      if (!balanceUpdateRes.ok) {
        const err = await balanceUpdateRes.json().catch(() => ({}));
        console.error('更新用户余额失败:', err);
        return errorResponse('余额更新失败，请手动处理', 500);
      }

      // 审计日志：次卡充值
      await writeAdminLog(env, {
        action: 'confirm_payment',
        targetUserId: order.user_id,
        targetOrderId: orderId,
        amount: credits,
        detail: {
          type: 'credits',
          order_no: order.order_no,
          order_amount: order.amount,
        },
        request,
      });

      return jsonResponse({
        success: true,
        message: '支付确认成功',
        newBalance,
      });
    } else {
      // 会员：优先使用订单中存储的 membership_type（更可靠），否则从金额推断
      let planType = order.membership_type;
      if (!planType) {
        const amount = parseFloat(order.amount);
        if (Math.abs(amount - 29) < 0.01) planType = 'monthly';
        else if (Math.abs(amount - 69) < 0.01) planType = 'quarterly';
        else if (Math.abs(amount - 199) < 0.01) planType = 'yearly';
        else planType = 'monthly'; // 默认兜底
      }

      const result = await activateMembership(
        order.user_id,
        planType,
        supabaseUrl,
        serviceKey
      );

      if (!result.success) {
        return errorResponse('开通会员失败，请手动处理', 500);
      }

      // 审计日志：开通会员
      await writeAdminLog(env, {
        action: 'confirm_payment',
        targetUserId: order.user_id,
        targetOrderId: orderId,
        amount: null,
        detail: {
          type: 'membership',
          plan: planType,
          order_no: order.order_no,
          order_amount: order.amount,
          is_renewal: !!result.is_renewal,
          expire_at: result.expire_at,
        },
        request,
      });

      return jsonResponse({
        success: true,
        message: '会员开通成功',
        membership: {
          type: planType,
          name: MEMBERSHIP_PLANS[planType]?.name,
          expire_at: result.expire_at,
          daily_credits: result.daily_credits,
          is_renewal: result.is_renewal,
        },
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
