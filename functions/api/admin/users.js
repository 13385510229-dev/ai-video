import { jsonResponse, errorResponse, handleOptions, requireAdmin } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';

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
    const keyword = url.searchParams.get('keyword');
    const page = parseInt(url.searchParams.get('page')) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize')) || 20;

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 构建查询
    let query = supabase.from('users').select('*');

    // Supabase REST API 的模糊搜索用 ilike
    // 这里简化处理，先查所有，后面再过滤
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
