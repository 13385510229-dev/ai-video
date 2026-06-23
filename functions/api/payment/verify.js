import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    // 认证
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = authResult.user.sub;

    // 获取订单号
    const url = new URL(request.url);
    const orderNo = url.searchParams.get('orderNo');

    if (!orderNo) {
      return errorResponse('订单号不能为空');
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 查询订单
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_no', orderNo)
      .eq('user_id', userId);

    if (error) {
      console.error('查询订单失败:', error);
      return errorResponse('查询失败，请稍后重试', 500);
    }

    if (!orders?.[0]) {
      return errorResponse('订单不存在', 404);
    }

    const order = orders[0];

    // 如果订单已支付，返回用户最新余额
    let userBalance = null;
    if (order.status === 'paid') {
      const { data: users } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userId);
      userBalance = users?.[0]?.balance;
    }

    return jsonResponse({
      success: true,
      order: order,
      userBalance,
    });
  } catch (error) {
    console.error('查询订单失败:', error);
    return errorResponse('查询失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
