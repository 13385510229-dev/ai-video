import { jsonResponse, errorResponse, handleOptions, signJWT } from '../_lib/auth.js';
import { verifyCode } from '../_lib/emailService.js';
import { createSupabaseClient } from '../_lib/supabase.js';

// 新用户免费次数
const FREE_CREDITS = 3;

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { email, code } = body;

    if (!email || !code) {
      return errorResponse('邮箱和验证码不能为空');
    }

    // 验证验证码
    const codeResult = await verifyCode(email, code, env);
    if (!codeResult.valid) {
      return errorResponse(codeResult.error || '验证码错误');
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 查询用户
    const { data: users, error: queryError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);

    if (queryError) {
      console.error('查询用户失败:', queryError);
      return errorResponse('登录失败，请稍后重试', 500);
    }

    let user = users?.[0];

    // 如果用户不存在，创建新用户
    if (!user) {
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          email,
          balance: FREE_CREDITS,
        });

      if (insertError) {
        console.error('创建用户失败:', insertError);
        return errorResponse('登录失败，请稍后重试', 500);
      }

      user = newUser;
    }

    // 生成 JWT token
    const jwtSecret = env.JWT_SECRET || 'default-secret-change-me';
    const token = await signJWT(
      {
        sub: user.id,
        email: user.email,
      },
      jwtSecret,
      { expiresIn: 60 * 60 * 24 * 7 } // 7 天有效
    );

    return jsonResponse({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        balance: user.balance,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('登录失败:', error);
    return errorResponse('登录失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
