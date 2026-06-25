// 易支付异步通知回调
import { createSupabaseClient } from '../_lib/supabase.js';
import { jsonResponse, errorResponse } from '../_lib/auth.js';
import { verifySign } from '../_lib/epay.js';
import { activateMembership } from '../_lib/membership.js';

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

    // 获取表单数据
    const formData = await request.formData();
    const params = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value;
    }

    console.log('收到支付回调:', params);

    // 验证签名
    const epayKey = env.EPAY_KEY;
    if (!verifySign(params, epayKey)) {
      console.error('签名验证失败');
      return new Response('fail', { status: 400 });
    }

    // 检查支付状态
    const tradeStatus = params.trade_status || params.status;
    if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== '1') {
      console.log('支付未成功:', tradeStatus);
      return new Response('success');
    }

    const orderNo = params.out_trade_no;
    const tradeNo = params.trade_no || '';
    const totalFee = parseFloat(params.money || params.total_fee || 0);

    if (!orderNo) {
      console.error('缺少订单号');
      return new Response('fail', { status: 400 });
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 查询订单
    const { data: orders, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_no', orderNo);

    if (orderError || !orders?.[0]) {
      console.error('订单不存在:', orderNo);
      return new Response('fail', { status: 404 });
    }

    const order = orders[0];

    // 如果已经支付过了，直接返回成功
    if (order.status === 'paid') {
      console.log('订单已支付，跳过处理:', orderNo);
      return new Response('success');
    }

    // 验证金额是否一致
    if (Math.abs(parseFloat(order.amount) - totalFee) > 0.01) {
      console.error('金额不匹配:', order.amount, 'vs', totalFee);
      return new Response('fail', { status: 400 });
    }

    // 更新订单状态
    const orderUpdateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
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

    // 判断套餐类型
    const pkg = getPackageByAmount(order.amount);

    // 处理订单
    if (pkg.type === 'membership') {
      // 开通会员
      const result = await activateMembership(
        order.user_id,
        pkg.membership_type,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );

      if (!result.success) {
        console.error('开通会员失败:', result.error);
        return new Response('fail', { status: 500 });
      }

      console.log('会员开通成功:', orderNo, pkg.membership_type);
    } else {
      // 次卡：给用户加次数
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('balance')
        .eq('id', order.user_id);

      if (userError || !users?.[0]) {
        console.error('用户不存在:', order.user_id);
        return new Response('fail', { status: 404 });
      }

      const user = users[0];
      const credits = pkg.credits || order.credits || 0;
      const newBalance = (user.balance || 0) + credits;

      // 更新用户余额
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
        return new Response('fail', { status: 500 });
      }

      console.log('充值成功:', orderNo, credits, '次');
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
