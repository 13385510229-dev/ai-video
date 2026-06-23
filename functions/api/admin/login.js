import { jsonResponse, errorResponse, handleOptions, signJWT } from '../_lib/auth.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return errorResponse('密码不能为空');
    }

    const adminPassword = env.ADMIN_PASSWORD || 'admin123';

    if (password !== adminPassword) {
      return errorResponse('密码错误', 401);
    }

    // 生成管理员 token
    const jwtSecret = env.JWT_SECRET || 'default-secret-change-me';
    const token = await signJWT(
      {
        role: 'admin',
        isAdmin: true,
      },
      jwtSecret,
      { expiresIn: 60 * 60 * 24 } // 24 小时有效
    );

    return jsonResponse({
      success: true,
      token,
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
