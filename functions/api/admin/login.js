import { jsonResponse, errorResponse, handleOptions, rateLimit } from '../_lib/auth.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 速率限制：每分钟最多尝试 5 次
    const rateLimitResult = await rateLimit(request, env, {
      max: 5,
      windowSeconds: 60,
      prefix: 'ratelimit:admin',
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResult.response;
    }

    const body = await request.json();
    const { password } = body;

    if (!password) {
      return errorResponse('密码不能为空');
    }

    const adminPassword = env.ADMIN_PASSWORD || 'admin123';

    if (password !== adminPassword) {
      return errorResponse('密码错误', 401);
    }

    return jsonResponse({
      success: true,
      message: '登录成功',
    });
  } catch (error) {
    console.error('管理员登录失败:', error);
    return errorResponse('登录失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
