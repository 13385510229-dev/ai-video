import { jsonResponse, errorResponse, handleOptions, verifyJWT, extractToken } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';

async function requireAdmin(request, env) {
  const token = extractToken(request);
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }

  const secret = env.JWT_SECRET || 'default-secret-change-me';
  const result = await verifyJWT(token, secret);

  if (!result.valid) {
    return { valid: false, error: result.error || 'Invalid token' };
  }

  if (!result.payload?.isAdmin && result.payload?.role !== 'admin') {
    return { valid: false, error: 'Not admin' };
  }

  return { valid: true, payload: result.payload };
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    // 管理员认证
    const authResult = await requireAdmin(request, env);
    if (!authResult.valid) {
      return errorResponse(authResult.error || '未授权', 401);
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 统计用户数
    const { count: userCount, error: userError } = await supabase
      .from('users')
      .select('*', { count: 'exact' });

    // 统计订单数
    const { count: orderCount, error: orderError } = await supabase
      .from('orders')
      .select('*', { count: 'exact' });

    // 统计已支付订单
    const { data: paidOrders, error: paidError } = await supabase
      .from('orders')
      .select('amount, credits')
      .eq('status', 'paid');

    // 统计视频数
    const { count: videoCount, error: videoError } = await supabase
      .from('videos')
      .select('*', { count: 'exact' });

    // 待确认订单数
    const { count: pendingCount, error: pendingError } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('status', 'pending');

    // 计算总营收
    let totalRevenue = 0;
    let totalCredits = 0;
    if (paidOrders) {
      for (const order of paidOrders) {
        totalRevenue += parseFloat(order.amount) || 0;
        totalCredits += order.credits || 0;
      }
    }

    return jsonResponse({
      success: true,
      stats: {
        totalUsers: userCount || 0,
        totalOrders: orderCount || 0,
        totalPaid: paidOrders?.length || 0,
        totalPending: pendingCount || 0,
        totalRevenue: totalRevenue.toFixed(2),
        totalCredits,
        totalVideos: videoCount || 0,
      },
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    return errorResponse('获取失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
