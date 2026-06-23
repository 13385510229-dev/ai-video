// 邮件服务 - 支持 Resend API 和模拟模式
// Cloudflare Workers 不支持 SMTP，所以用 HTTP API 方式

// 模拟模式下的验证码存储（内存存储，多实例可能有问题，用户量小没问题）
const verificationCodes = new Map();

// 发送验证码
export async function sendVerificationCode(email, env) {
  const code = generateCode();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 分钟有效

  // 保存验证码
  verificationCodes.set(email, { code, expiresAt });

  // 清理过期验证码
  for (const [key, value] of verificationCodes) {
    if (value.expiresAt < Date.now()) {
      verificationCodes.delete(key);
    }
  }

  const resendApiKey = env.RESEND_API_KEY;
  const fromEmail = env.SMTP_FROM_EMAIL || 'noreply@example.com';
  const fromName = env.SMTP_FROM_NAME || 'AI视频生成平台';

  // 如果没有配置 Resend API Key，使用模拟模式
  if (!resendApiKey) {
    console.log(`[模拟邮件] 验证码: ${code} (发送给: ${email})`);
    return { success: true, mode: 'simulation' };
  }

  // 使用 Resend API 发送
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [email],
        subject: '登录验证码',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>登录验证码</h2>
            <p>您好，</p>
            <p>您的登录验证码是：</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; padding: 20px; background: #f5f5f5; border-radius: 8px; text-align: center;">
              ${code}
            </div>
            <p>验证码 10 分钟内有效，请勿泄露给他人。</p>
            <p>如果不是您本人操作，请忽略此邮件。</p>
            <hr>
            <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Resend API error:', err);
      // 发送失败时降级到模拟模式
      console.log(`[模拟邮件] 验证码: ${code} (发送给: ${email})`);
      return { success: true, mode: 'simulation-fallback' };
    }

    return { success: true, mode: 'resend' };
  } catch (error) {
    console.error('Send email error:', error);
    // 出错时降级到模拟模式
    console.log(`[模拟邮件] 验证码: ${code} (发送给: ${email})`);
    return { success: true, mode: 'simulation-fallback' };
  }
}

// 验证验证码
export function verifyCode(email, code) {
  const record = verificationCodes.get(email);

  if (!record) {
    return { valid: false, error: '验证码不存在或已过期' };
  }

  if (record.expiresAt < Date.now()) {
    verificationCodes.delete(email);
    return { valid: false, error: '验证码已过期' };
  }

  if (record.code !== code) {
    return { valid: false, error: '验证码错误' };
  }

  // 验证成功后删除验证码（一次性使用）
  verificationCodes.delete(email);
  return { valid: true };
}

// 生成 6 位数字验证码
function generateCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}
