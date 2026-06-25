import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { MEMBERSHIP_PLANS } from '../_lib/membership.js';

// 次卡套餐配置
const creditPackages = [
  { id: 1, name: '10次套餐', type: 'credits', credits: 10, amount: 9.9 },
  { id: 2, name: '30次套餐', type: 'credits', credits: 30, amount: 24.9 },
  { id: 3, name: '100次套餐', type: 'credits', credits: 100, amount: 69.9 },
];

// 会员套餐配置
const membershipPackages = [
  { id: 10, name: '月卡会员', type: 'membership', membership_type: 'monthly', amount: 39, daily_credits: 10 },
  { id: 11, name: '季卡会员', type: 'membership', membership_type: 'quarterly', amount: 99, daily_credits: 15 },
  { id: 12, name: '年卡会员', type: 'membership', membership_type: 'yearly', amount: 299, daily_credits: 20 },
];

// 所有套餐
const allPackages = [...creditPackages, ...membershipPackages];

// 生成订单号
function generateOrderNo() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `ORD${year}${month}${day}${random}`;
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 认证
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = parseInt(authResult.user.sub, 10) || authResult.user.sub;
    const body = await request.json();
    const { packageId } = body;

    // 查找套餐
    const pkg = allPackages.find(p => p.id === packageId);
    if (!pkg) {
      return errorResponse('套餐不存在');
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 生成订单号
    const orderNo = generateOrderNo();

    // 创建订单（会员套餐 credits 存 0，用 packageId 区分类型）
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        order_no: orderNo,
        amount: pkg.amount,
        credits: pkg.type === 'credits' ? pkg.credits : 0,
        status: 'pending',
      });

    if (error) {
      console.error('创建订单失败:', error);
      return errorResponse('创建订单失败，请稍后重试', 500);
    }

    // 获取收款码
    const qrCode = env.PAYMENT_QR_CODE || '';
    const paymentMode = env.PAYMENT_MODE || 'manual';

    return jsonResponse({
      success: true,
      order: order,
      package: pkg,
      qrCode,
      paymentMode,
      tips: paymentMode === 'manual'
        ? '请扫码支付，支付完成后联系管理员确认到账'
        : '请完成支付',
    });
  } catch (error) {
    console.error('创建订单失败:', error);
    return errorResponse('创建订单失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
