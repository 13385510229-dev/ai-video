import { jsonResponse, errorResponse, handleOptions, requireAuth, rateLimit } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { MEMBERSHIP_PLANS } from '../_lib/membership.js';
import { generateSign } from '../_lib/epay.js';

// 次卡套餐配置
const creditPackages = [
  { id: 1, name: '体验套餐', type: 'credits', credits: 10, amount: 9.9 },
  { id: 2, name: '标准套餐', type: 'credits', credits: 30, amount: 19.9 },
  { id: 3, name: '专业套餐', type: 'credits', credits: 100, amount: 49.9 },
];

// 会员套餐配置
const membershipPackages = [
  { id: 10, name: '月卡会员', type: 'membership', membership_type: 'monthly', amount: 29, daily_credits: 5 },
  { id: 11, name: '季卡会员', type: 'membership', membership_type: 'quarterly', amount: 69, daily_credits: 8 },
  { id: 12, name: '年卡会员', type: 'membership', membership_type: 'yearly', amount: 199, daily_credits: 12 },
];

// 所有套餐
const allPackages = [...creditPackages, ...membershipPackages];

// 允许的支付方式（白名单）
const ALLOWED_PAY_TYPES = ['alipay', 'wxpay'];

// 生成订单号（使用 crypto 安全随机数，避免碰撞和预测）
function generateOrderNo(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const randBuf = new Uint32Array(2);
  crypto.getRandomValues(randBuf);
  const random = (randBuf[0] % 1000000).toString().padStart(6, '0')
    + (randBuf[1] % 1000).toString().padStart(3, '0');
  return `ORD${year}${month}${day}${random}`;
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 创建订单限速：每分钟最多 10 次
    const rate = await rateLimit(request, env, {
      max: 10,
      windowSeconds: 60,
      prefix: 'ratelimit:create-order',
    });
    if (!rate.allowed) return rate.response!;

    // 认证
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = parseInt(authResult.user.sub, 10) || authResult.user.sub;
    let body: any = {};
    try {
      body = await request.json();
    } catch (_) {
      return errorResponse('请求格式错误');
    }
    const { packageId, payType } = body;

    // payType 白名单校验
    if (payType && !ALLOWED_PAY_TYPES.includes(String(payType))) {
      return errorResponse('支付方式参数非法');
    }

    // 查找套餐
    const pkg = allPackages.find(p => p.id === packageId);
    if (!pkg) {
      return errorResponse('套餐不存在');
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 生成订单号
    const orderNo = generateOrderNo();

    // 创建订单（会员套餐 credits 存 0，存储套餐类型和ID方便回调判断）
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        order_no: orderNo,
        amount: pkg.amount,
        credits: pkg.type === 'credits' ? pkg.credits : 0,
        status: 'pending',
        package_id: pkg.id,
        membership_type: pkg.type === 'membership' ? pkg.membership_type : null,
      });

    if (error) {
      console.error('创建订单失败:', error);
      return errorResponse('创建订单失败，请稍后重试', 500);
    }

    const paymentMode = env.PAYMENT_MODE || 'manual';

    // 易支付模式
    if (paymentMode === 'epay') {
      const epayApiUrl = env.EPAY_API_URL;
      const epayPid = env.EPAY_PID;
      const epayKey = env.EPAY_KEY;

      if (!epayApiUrl || !epayPid || !epayKey) {
        return errorResponse('易支付配置不完整', 500);
      }

      // 获取请求的域名，用于回调地址
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      // 构造支付参数
      const payParams = {
        pid: epayPid,
        type: payType || 'alipay', // wxpay 微信，alipay 支付宝
        out_trade_no: orderNo,
        notify_url: `${baseUrl}/api/payment/notify`,
        return_url: `${baseUrl}/recharge?success=1&order=${orderNo}`,
        name: pkg.name,
        money: pkg.amount.toFixed(2),
      };

      // 生成签名
      const sign = await generateSign(payParams, epayKey);
      payParams.sign = sign;
      payParams.sign_type = 'MD5';

      // 构造支付链接
      const payUrl = `${epayApiUrl}?${new URLSearchParams(payParams).toString()}`;

      return jsonResponse({
        success: true,
        order: order,
        package: pkg,
        paymentMode: 'epay',
        payUrl,
      });
    }

    // 手动支付模式
    const qrCode = env.PAYMENT_QR_CODE || '';

    return jsonResponse({
      success: true,
      order: order,
      package: pkg,
      qrCode,
      paymentMode: 'manual',
      tips: '请扫码支付，支付完成后联系管理员确认到账',
    });
  } catch (error) {
    console.error('创建订单失败:', error);
    return errorResponse('创建订单失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
