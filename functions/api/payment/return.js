// 易支付同步返回（用户支付完成后跳转回来）
import { securityHeaders } from '../_lib/auth.js';

// 只允许跳转到站内的路径（白名单前缀），防止开放重定向漏洞
function safeRedirect(path: string): Response {
  // 必须以 / 开头且不含 //（防止 //evil.com 协议相对跳转），不能包含 javascript: data: 等伪协议
  let safePath = '/';
  const clean = String(path || '/').replace(/[\r\n\t]/g, ''); // 去掉换行，防止 CRLF 注入 header
  if (
    clean.startsWith('/') &&
    !clean.includes('//') &&
    !clean.includes('http:') &&
    !clean.includes('https:') &&
    !clean.includes('javascript:') &&
    !clean.includes('data:')
  ) {
    safePath = clean;
  }
  // 给跳转响应也加上安全响应头（302 浏览器会忽略大部分 header，但防点击劫持等仍有意义）
  return Response.redirect(safePath, 302);
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    let outTradeNo = url.searchParams.get('out_trade_no') || '';
    const payStatus = url.searchParams.get('pay_status') || '';

    // 订单号做简单清理：只留字母数字，防止 URL 注入
    outTradeNo = outTradeNo.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

    // 判断支付是否成功
    const isSuccess = payStatus === 'TRADE_SUCCESS' || payStatus === '1' || payStatus === 'success';
    
    // 重定向到前端充值页面，带上订单号和成功状态
    // 使用前端期望的参数格式：success 和 order
    const redirectUrl = `/recharge?success=${isSuccess ? '1' : '0'}&order=${encodeURIComponent(outTradeNo)}`;
    
    return safeRedirect(redirectUrl);
  } catch (error) {
    console.error('支付返回处理失败:', error);
    // 出错了就跳转到首页（安全跳转）
    return safeRedirect('/');
  }
}

export async function onRequestPost(context) {
  return onRequestGet(context);
}

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: { ...securityHeaders } });
}
