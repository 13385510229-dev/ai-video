import { jsonResponse, errorResponse, handleOptions, requireAdmin } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { writeAdminLog } from '../_lib/adminLog.js';

// 允许的用户状态值
const ALLOWED_STATUS = ['active', 'disabled'];

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
    let keyword = url.searchParams.get('keyword') || '';
    // 关键词长度限制
    if (keyword.length > 100) keyword = keyword.slice(0, 100);
    const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize')) || 20));

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 构建查询：明确只选择非敏感字段（防止把可能存在的 password_hash / 密钥等带出来）
    const safeUserColumns = 'id, email, balance, membership_type, membership_expire_at, daily_credits_used, last_daily_reset, created_at, status';
    let query = supabase.from('users').select(safeUserColumns);

    query = query
      .order('created_at', { ascending: false })
      .limit(1000); // 先查 1000 条，用户量小够用

    const { data: users, error } = await query;

    if (error) {
      console.error('查询用户失败:', error);
      return errorResponse('查询失败，请稍后重试', 500);
    }

    // 关键词过滤（内存过滤，简单实现）
    let filteredUsers = users || [];
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      filteredUsers = filteredUsers.filter(u =>
        u.email?.toLowerCase().includes(lowerKeyword)
      );
    }

    // 分页
    const start = (page - 1) * pageSize;
    const paginatedUsers = filteredUsers.slice(start, start + pageSize);

    return jsonResponse({
      success: true,
      users: paginatedUsers,
      pagination: {
        page,
        pageSize,
        total: filteredUsers.length,
      },
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return errorResponse('获取失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}

// 禁用/启用用户（PATCH /api/admin/users?id=xxx  body: { status: 'disabled' | 'active' }）
export async function onRequestPatch(context) {
  try {
    const { request, env } = context;

    // 管理员认证
    const authResult = await requireAdmin(request, env);
    if (!authResult.valid) {
      return errorResponse(authResult.error || '未授权', 401);
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('id');
    if (!userId) {
      return errorResponse('用户ID不能为空');
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch (_) {
      return errorResponse('请求格式错误');
    }

    const newStatus = String(body.status || '').toLowerCase();
    if (!ALLOWED_STATUS.includes(newStatus)) {
      return errorResponse(`status 必须是 ${ALLOWED_STATUS.join(' / ')} 之一`);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    // 查询用户当前状态，避免重复操作
    const queryRes = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=id,email,status`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    );

    if (!queryRes.ok) {
      return errorResponse('查询用户失败', 500);
    }
    const users = await queryRes.json();
    if (!users?.[0]) {
      return errorResponse('用户不存在', 404);
    }

    const targetUser = users[0];
    const currentStatus = targetUser.status || 'active';

    if (currentStatus === newStatus) {
      return errorResponse(`用户已经是 ${newStatus === 'disabled' ? '禁用' : '正常'} 状态，无需重复操作`);
    }

    // 条件更新：只有 status 还是原值时才更新（防止并发）
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${userId}&status=eq.${currentStatus}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ status: newStatus }),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      console.error('更新用户状态失败:', err);
      // 如果是 400/404 通常是 status 列不存在
      if (updateRes.status === 400 || updateRes.status === 404) {
        return errorResponse(
          '数据库未配置 status 字段，请联系管理员在 users 表添加 status 字段（默认 active）',
          500
        );
      }
      return errorResponse('更新失败，请稍后重试', 500);
    }

    const updated = await updateRes.json();
    if (!updated || updated.length === 0) {
      return errorResponse('用户状态已变更，请刷新后重试', 409);
    }

    // 审计日志
    await writeAdminLog(env, {
      action: newStatus === 'disabled' ? 'disable_user' : 'enable_user',
      targetUserId: userId,
      detail: {
        email: targetUser.email,
        before: currentStatus,
        after: newStatus,
      },
      request,
    });

    return jsonResponse({
      success: true,
      message: newStatus === 'disabled' ? '用户已禁用' : '用户已启用',
      user: {
        id: targetUser.id,
        email: targetUser.email,
        status: newStatus,
      },
    });
  } catch (error) {
    console.error('禁用/启用用户失败:', error);
    return errorResponse('操作失败，请稍后重试', 500);
  }
}
