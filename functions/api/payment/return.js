// 易支付同步返回（用户支付完成后跳转回来）
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const outTradeNo = url.searchParams.get('out_trade_no') || '';
    const payStatus = url.searchParams.get('pay_status') || '';

    // 重定向到前端充值页面，带上订单号
    const redirectUrl = `/recharge?order_no=${outTradeNo}&status=${payStatus}`;
    
    return Response.redirect(redirectUrl, 302);
  } catch (error) {
    console.error('支付返回处理失败:', error);
    // 出错了就跳转到首页
    return Response.redirect('/', 302);
  }
}

export async function onRequestPost(context) {
  return onRequestGet(context);
}

export async function onRequestOptions() {
  return new Response('', { status: 200 });
}
