// 易支付异步通知回调
import { createSupabaseClient } from '../_lib/supabase.js';
import { verifySign } from '../_lib/epay.js';
import { activateMembership } from '../_lib/membership.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 获取表单数据
    const formData = await request.formData();
    const params = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value;
    }

    console.log('收到支付回调:', JSON.stringify(params));

    // 验证签名
    const epayKey = env.EPAY_KEY;
    if (!await verifySign(params, epayKey)) {
      console.error('签名验证失败');
      return new Response('fail', { status: 400 });
    }

    // 检查支付状态
    const tradeStatus = params.trade_status || params.status || params.pay_status;
    if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== '1' && tradeStatus !== 'success') {
      console.log('支付未成功，状态:', tradeStatus);
      return new Response('success'); // 返回 success，避免易支付一直重试
    }

    const orderNo = params.out_trade_no;
    const tradeNo = params.trade_no || '';
    const totalFee = parseFloat(params.money || params.total_fee || 0);

    if (!orderNo) {
      console.error('缺少订单号');
      return new Response('fail', { status: 400 });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    // 第一步：查询订单
    const orderQueryRes = await fetch(`${supabaseUrl}/rest/v1/orders?order_no=eq.${orderNo}&select=*`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });

    if (!orderQueryRes.ok) {
      console.error('查询订单失败');
      return new Response('fail', { status: 500 });
    }

    const orders = await orderQueryRes.json();
    if (!orders?.[0]) {
      console.error('订单不存在:', orderNo);
      return new Response('fail', { status: 404 });
    }

    const order = orders[0];

    // 如果已经支付过了，直接返回成功（幂等处理）
    if (order.status === 'paid') {
      console.log('订单已支付，跳过处理:', orderNo);
      return new Response('success');
    }

    // 验证金额是否一致（允许 0.01 的误差）
    if (Math.abs(parseFloat(order.amount) - totalFee) > 0.01) {
      console.error('金额不匹配:', order.amount, 'vs', totalFee);
      return new Response('fail', { status: 400 });
    }

    // 第二步：尝试更新订单状态（只有 pending 状态的才会更新成功）
    // 用乐观锁防止并发重复处理
    const orderUpdateRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order.id}&status=eq.pending`, {
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
        trade_no: tradeNo,
      }),
    });

    if (!orderUpdateRes.ok) {
      const err = await orderUpdateRes.json().catch(() => ({}));
      console.error('更新订单状态失败:', err);
      return new Response('fail', { status: 500 });
    }

    const updatedOrders = await orderUpdateRes.json();
    
    // 如果没有更新到任何行，说明并发情况下已经被其他请求处理了
    if (!updatedOrders || updatedOrders.length === 0) {
      console.log('订单已被其他请求处理:', orderNo);
      return new Response('success');
    }

    // 第三步：处理订单（加次数或开通会员）
    const credits = order.credits || 0;
    
    if (credits > 0) {
      // 次卡：给用户加次数
      // 先查当前余额
      const userQueryRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${order.user_id}&select=balance`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      });

      if (!userQueryRes.ok) {
        console.error('查询用户失败');
        return new Response('fail', { status: 500 });
      }

      const users = await userQueryRes.json();
      if (!users?.[0]) {
        console.error('用户不存在:', order.user_id);
        return new Response('fail', { status: 404 });
      }

      const currentBalance = users[0].balance || 0;
      const newBalance = currentBalance + credits;

      // 更新余额
      const balanceUpdateRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${order.user_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ balance: newBalance }),
      });

      if (!balanceUpdateRes.ok) {
        const err = await balanceUpdateRes.json().catch(() => ({}));
        console.error('更新用户余额失败:', err);
        return new Response('fail', { status: 500 });
      }

      console.log('充值成功:', orderNo, credits, '次，新余额:', newBalance);
    } else {
      // 会员：开通会员
      // 根据金额判断会员类型
      const amount = parseFloat(order.amount);
      let planType = 'monthly';
      
      if (Math.abs(amount - 39) < 0.01) planType = 'monthly';
      else if (Math.abs(amount - 99) < 0.01) planType = 'quarterly';
      else if (Math.abs(amount - 299) < 0.01) planType = 'yearly';

      const result = await activateMembership(
        order.user_id,
        planType,
        supabaseUrl,
        serviceKey
      );

      if (!result.success) {
        console.error('开通会员失败:', result.error);
        return new Response('fail', { status: 500 });
      }

      console.log('会员开通成功:', orderNo, planType);
    }

    // 返回 success 给易支付
    return new Response('success');
  } catch (error) {
    console.error('支付回调处理失败:', error);
    return new Response('fail', { status: 500 });
  }
}

// 也支持 GET 请求（有些易支付平台用 GET）
export async function onRequestGet(context) {
  return onRequestPost(context);
}

export async function onRequestOptions() {
  return new Response('', { status: 200 });
}
