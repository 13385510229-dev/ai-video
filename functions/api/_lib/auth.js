// JWT 工具 - 纯 Web Crypto API 实现，无外部依赖
// 使用 HS256 算法

// Base64URL 编码（支持字符串和 ArrayBuffer）
function base64UrlEncode(data) {
  let binary = '';
  if (typeof data === 'string') {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
  } else if (data instanceof ArrayBuffer) {
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Base64URL 解码
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

// 导入密钥
async function importKey(secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// HMAC-SHA256 签名
async function hmacSign(message, secret) {
  const key = await importKey(secret);
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return base64UrlEncode(signature);
}

// HMAC-SHA256 验证
async function hmacVerify(message, signature, secret) {
  const key = await importKey(secret);
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const sigBytes = base64UrlDecodeToBuffer(signature);
  return crypto.subtle.verify('HMAC', key, sigBytes, data);
}

// Base64URL 解码（返回 ArrayBuffer）
function base64UrlDecodeToBuffer(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// 生成 JWT
export async function signJWT(payload, secret, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + (options.expiresIn || 60 * 60 * 24), // 默认 24 小时
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSign(message, secret);

  return `${message}.${signature}`;
}

// 验证 JWT
export async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const message = `${encodedHeader}.${encodedPayload}`;

    const isValid = await hmacVerify(message, signature, secret);
    if (!isValid) {
      throw new Error('Invalid signature');
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }

    return { payload, valid: true };
  } catch (error) {
    return { payload: null, valid: false, error: error.message };
  }
}

// 从请求中提取 token
export function extractToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

// 认证中间件
export async function requireAuth(request, env) {
  const token = extractToken(request);
  if (!token) {
    return { user: null, error: 'No token provided' };
  }

  const secret = env.JWT_SECRET || 'default-secret-change-me';
  const result = await verifyJWT(token, secret);

  if (!result.valid) {
    return { user: null, error: result.error || 'Invalid token' };
  }

  return { user: result.payload, error: null };
}

// 管理员认证中间件（简单 API Key 方式，稳定可靠）
export async function requireAdmin(request, env) {
  const adminKey = request.headers.get('X-Admin-Key');
  const adminPassword = env.ADMIN_PASSWORD || 'admin123';

  if (!adminKey || adminKey !== adminPassword) {
    return { valid: false, error: '未授权' };
  }

  return { valid: true };
}

// 生成随机验证码
export function generateCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

// CORS 响应头
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// JSON 响应
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// 错误响应
export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

// 处理 OPTIONS 预检请求
export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// 速率限制中间件
export async function rateLimit(request, env, options = {}) {
  const {
    max = 10,
    windowSeconds = 60,
    prefix = 'ratelimit',
  } = options;

  const clientIp = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For') || 
                   'unknown';
  const key = `${prefix}:${clientIp}`;

  if (!env?.KV_CACHE) {
    return { allowed: true };
  }

  try {
    const current = await env.KV_CACHE.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= max) {
      return {
        allowed: false,
        response: errorResponse('请求过于频繁，请稍后重试', 429),
      };
    }

    await env.KV_CACHE.put(key, String(count + 1), {
      expirationTtl: windowSeconds,
    });

    return { allowed: true };
  } catch (err) {
    console.warn('速率限制检查失败:', err);
    return { allowed: true };
  }
}
