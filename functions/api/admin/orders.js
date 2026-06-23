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

    // 获取查询参数
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page')) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize')) || 20;

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 构建查询
    let query = supabase.from('orders').select('*');

    if (status) {
      query = query.eq('status', status);
    }

    query = query
      .order('created_at', { ascending: false })
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const { data: orders, error } = await query;

    if (error) {
      console.error('查询订单失败:', error);
      return errorResponse('查询失败，请稍后重试', 500);
    }

    // 获取关联的用户信息
    const userIds = [...new Set(orders?.map(o => o.user_id).filter(Boolean) || [])];
    const usersMap = {};

    if (userIds.length > 0) {
      // 批量查询用户（简单实现，逐个查或者用 in 查询）
      // 这里简化处理，先查所有用户，后面再优化
      const { data: users } = await supabase
        .from('users')
        .select('id, email')
        .limit(1000);

      if (users) {
        for (const user of users) {
          usersMap[user.id] = user;
        }
      }
    }

    // 组装返回数据
    const ordersWithUser = orders?.map(order => ({
      ...order,
      user: usersMap[order.user_id] || null,
    })) || [];

    return jsonResponse({
      success: true,
      orders: ordersWithUser,
      pagination: {
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error('获取订单列表失败:', error);
    return errorResponse('获取失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
