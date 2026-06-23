import { jsonResponse, errorResponse, handleOptions, rateLimit, signJWT } from '../_lib/auth.js';
import { sendVerificationCode } from '../_lib/emailService.js';
import { createSupabaseClient } from '../_lib/supabase.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 速率限制：每分钟最多发送 5 次验证码
    const rateLimitResult = await rateLimit(request, env, {
      max: 5,
      windowSeconds: 60,
      prefix: 'ratelimit:login',
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResult.response;
    }
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return errorResponse('邮箱不能为空');
    }

    // 简单的邮箱格式校验
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse('邮箱格式不正确');
    }

    // 发送验证码
    const result = await sendVerificationCode(email, env);

    return jsonResponse({
      success: true,
      message: result.mode === 'simulation' || result.mode === 'simulation-fallback'
        ? '验证码已发送（模拟模式，请查看控制台日志）'
        : '验证码已发送，请查收邮件',
      mode: result.mode,
    });
  } catch (error) {
    console.error('发送验证码失败:', error);
    return errorResponse('发送失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  try {
    const { env } = context;

    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (error || !users || users.length === 0) {
      return jsonResponse({ success: false, message: '没有找到用户记录' }, 404);
    }

    const user = users[0];

    const secret = env.JWT_SECRET || 'default-secret-change-me';
    const token = await signJWT(
      { sub: user.id.toString(), email: user.email },
      secret,
      { expiresIn: 60 * 60 * 24 * 30 }
    );

    return jsonResponse({
      success: true,
      token,
      user: {
        id: user.id.toString(),
        email: user.email,
        balance: user.balance,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('测试登录失败:', error);
    return jsonResponse({ success: false, message: '登录失败' }, 500);
  }
}
