import { jsonResponse, errorResponse, handleOptions, rateLimit, requireAdmin } from '../_lib/auth.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 速率限制：每分钟最多尝试 10 次
    const rateLimitResult = await rateLimit(request, env, {
      max: 10,
      windowSeconds: 60,
      prefix: 'ratelimit:admin',
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResult.response;
    }

    const body = await request.json().catch(() => ({}));
    const { password } = body || {};

    if (!password) {
      return errorResponse('密码不能为空');
    }

    // 使用统一的 requireAdmin（带时序安全比较 + 禁止默认弱密码）
    // requireAdmin 从 X-Admin-Key 取密码，所以我们伪造一个带 X-Admin-Key 头的请求对象
    // 或者直接比较：但 requireAdmin 里有安全策略，让我们复用—— 最简单的办法：
    // 把 password 放进 headers
    const fakeHeaders = new Headers(request.headers);
    fakeHeaders.set('X-Admin-Key', password);
    const fakeRequest = new Request(request.url, { headers: fakeHeaders });
    const adminResult = await requireAdmin(fakeRequest, env);

    if (!adminResult.valid) {
      return errorResponse(adminResult.error || '密码错误', 401);
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

export async function onRequestOptions(context) {
  // 旧兼容：调用方可能没传 context，判断下
  if (context?.request && context?.env) {
    return handleOptions(context.request, context.env);
  }
  return handleOptions();
}
