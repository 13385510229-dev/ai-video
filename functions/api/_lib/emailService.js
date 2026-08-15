// 邮件服务 - 支持 Resend API 和模拟模式
// Cloudflare Workers 不支持 SMTP，所以用 HTTP API 方式
import { generateCode as secureGenerateCode } from './auth.js';

// 降级用的内存存储（当 KV 不可用时）
const verificationCodes = new Map();

// 发送验证码
export async function sendVerificationCode(email, env) {
  const code = secureGenerateCode(6); // 使用 auth.js 中的安全随机数生成
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const data = JSON.stringify({ code, expiresAt });

  // 优先使用 Cloudflare KV
  if (env?.KV_CACHE) {
    try {
      await env.KV_CACHE.put(`verify:${email}`, data, {
        expirationTtl: 600,
      });
    } catch (err) {
      console.warn('KV 存储失败，降级到内存存储:', err);
      verificationCodes.set(email, { code, expiresAt });
    }
  } else {
    verificationCodes.set(email, { code, expiresAt });
  }

  const resendApiKey = env.RESEND_API_KEY;
  const fromEmail = env.SMTP_FROM_EMAIL || 'noreply@example.com';
  const fromName = env.SMTP_FROM_NAME || 'Htyorin AI 宏图灵境';

  if (!resendApiKey) {
    console.log(`[模拟邮件] 验证码: ${code} (发送给: ${email})`);
    return { success: true, mode: 'simulation' };
  }

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
      console.log(`[模拟邮件] 验证码: ${code} (发送给: ${email})`);
      return { success: true, mode: 'simulation-fallback' };
    }

    return { success: true, mode: 'resend' };
  } catch (error) {
    console.error('Send email error:', error);
    console.log(`[模拟邮件] 验证码: ${code} (发送给: ${email})`);
    return { success: true, mode: 'simulation-fallback' };
  }
}

// 验证验证码
export async function verifyCode(email, code, env) {
  let record = null;
  let storageType = null; // 'kv' or 'memory'

  // 优先从 KV 读取
  if (env?.KV_CACHE) {
    try {
      const data = await env.KV_CACHE.get(`verify:${email}`, 'json');
      if (data) {
        record = data;
        storageType = 'kv';
      }
    } catch (err) {
      console.warn('KV 读取失败，尝试内存存储:', err);
    }
  }

  // KV 没有就从内存读取
  if (!record) {
    record = verificationCodes.get(email);
    if (record) {
      storageType = 'memory';
    }
  }

  if (!record) {
    return { valid: false, error: '验证码不存在或已过期，请重新获取' };
  }

  if (record.expiresAt < Date.now()) {
    // 过期了才删除
    if (storageType === 'kv' && env?.KV_CACHE) {
      await env.KV_CACHE.delete(`verify:${email}`).catch(() => {});
    } else if (storageType === 'memory') {
      verificationCodes.delete(email);
    }
    return { valid: false, error: '验证码已过期，请重新获取' };
  }

  if (record.code !== code) {
    // 验证码错误，不删除，允许用户重试
    return { valid: false, error: '验证码错误，请重新输入' };
  }

  // 验证成功，删除验证码
  if (storageType === 'kv' && env?.KV_CACHE) {
    await env.KV_CACHE.delete(`verify:${email}`).catch(() => {});
  } else if (storageType === 'memory') {
    verificationCodes.delete(email);
  }

  return { valid: true };
}

// 注意：验证码生成现在使用 auth.js 中的 generateCode()（crypto.getRandomValues 安全随机）
