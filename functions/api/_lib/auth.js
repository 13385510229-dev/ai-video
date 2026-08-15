// JWT 工具 - 纯 Web Crypto API 实现，无外部依赖
// 使用 HS256 算法

// ============= 安全工具 =============

// 时间安全字符串比较（防时序攻击）
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) {
    // 即使长度不同也要做一次比较，避免被长度差异判断
    const dummy = new Uint8Array(Math.max(aBuf.byteLength, bBuf.byteLength));
    await crypto.subtle.digest('SHA-256', dummy);
    return false;
  }
  return crypto.subtle.timingSafeEqual(aBuf, bBuf);
}

// Base64URL 编码（支持字符串和 ArrayBuffer）
function base64UrlEncode(data: string | ArrayBuffer) {
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
function base64UrlDecode(str: string) {
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
async function importKey(secret: string) {
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
async function hmacSign(message: string, secret: string) {
  const key = await importKey(secret);
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return base64UrlEncode(signature);
}

// HMAC-SHA256 验证（使用时间安全比较）
async function hmacVerify(message: string, signature: string, secret: string) {
  const key = await importKey(secret);
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const expectedSig = base64UrlEncodeToBuffer(signature);
  const actualSig = await crypto.subtle.sign('HMAC', key, data);
  return crypto.subtle.timingSafeEqual(new Uint8Array(actualSig), new Uint8Array(expectedSig));
}

// Base64URL 解码（返回 ArrayBuffer）
function base64UrlDecodeToBuffer(str: string) {
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

// ============= JWT =============

// 生成 JWT
export async function signJWT(payload: Record<string, any>, secret: string, options: { expiresIn?: number } = {}) {
  if (!secret || secret === 'default-secret-change-me') {
    throw new Error('JWT_SECRET must be configured and not the default value');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + (options.expiresIn || 60 * 60 * 24),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSign(message, secret);

  return `${message}.${signature}`;
}

// 验证 JWT
export async function verifyJWT(token: string, secret: string) {
  try {
    if (!secret || secret === 'default-secret-change-me') {
      return { payload: null, valid: false, error: 'Server JWT secret misconfigured' };
    }

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
  } catch (error: any) {
    return { payload: null, valid: false, error: error.message };
  }
}

// ============= 认证 =============

// 从请求中提取 token
export function extractToken(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

// 认证中间件
export async function requireAuth(request: Request, env: Record<string, any>) {
  const token = extractToken(request);
  if (!token) {
    return { user: null, error: 'No token provided' };
  }

  const secret = env.JWT_SECRET;
  if (!secret) {
    return { user: null, error: 'Server authentication misconfigured' };
  }
  const result = await verifyJWT(token, secret);

  if (!result.valid) {
    return { user: null, error: 'Invalid or expired token' };
  }

  return { user: result.payload, error: null };
}

// 管理员认证中间件
export async function requireAdmin(request: Request, env: Record<string, any>) {
  const adminKey = request.headers.get('X-Admin-Key');
  const adminPassword = env.ADMIN_PASSWORD;

  // 禁止使用默认或空密码
  if (!adminPassword || adminPassword === 'admin123' || adminPassword.length < 10) {
    return { valid: false, error: '后台密码未安全配置，请联系网站管理员' };
  }

  if (!adminKey) {
    return { valid: false, error: '未授权' };
  }

  // 使用时间安全比较防时序攻击
  const match = await timingSafeEqual(adminKey, adminPassword);
  if (!match) {
    return { valid: false, error: '未授权' };
  }

  return { valid: true };
}

// ============= 验证码生成（安全随机） =============
export function generateCode(length = 6) {
  if (length < 4) length = 4;
  if (length > 12) length = 12;

  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += (array[i] % 10).toString();
  }
  return code;
}

// ============= 安全响应头 & CORS =============

// 严格的安全响应头（全站）
export const securityHeaders = {
  // 防点击劫持：不允许任何页面嵌入 iframe
  'X-Frame-Options': 'DENY',
  // 防止 MIME 嗅探
  'X-Content-Type-Options': 'nosniff',
  // 基础 XSS 防护
  'X-XSS-Protection': '1; mode=block',
  // 严格 Referrer 策略
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // 允许 HTTPS 降级跳转（部署后可用 max-age=31536000; includeSubDomains）
  // 'Strict-Transport-Security': 'max-age=15768000',
  // 权限策略：禁用不常用的浏览器 API
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=()',
};

// CORS：允许的来源（从环境变量读取，也可根据 request.url 动态同源）
function getAllowedOrigin(request: Request, env: Record<string, any>): string {
  const configured = env.ALLOWED_ORIGINS; // 逗号分隔，如 "https://a.com,https://b.com"
  const originHeader = request.headers.get('Origin') || '';

  // 同源（Worker 本身域名）的请求永远放行
  try {
    const reqUrl = new URL(request.url);
    if (!originHeader || originHeader === `${reqUrl.protocol}//${reqUrl.host}`) {
      return originHeader || reqUrl.origin;
    }
  } catch (_) {}

  // 配置了白名单
  if (configured) {
    const list = configured.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.includes(originHeader)) {
      return originHeader;
    }
  }

  // 开发环境：Vite 本地开发 5173 放行；生产环境返回第一个配置的 origin 或严格禁止
  if (originHeader.startsWith('http://localhost:') || originHeader.startsWith('http://127.0.0.1:')) {
    return originHeader;
  }

  // 白名单都不匹配：返回 null（不允许）
  return '';
}

// 根据请求构造 CORS 头
export function getCorsHeaders(request: Request, env: Record<string, any>): Record<string, string> {
  const origin = getAllowedOrigin(request, env);
  return {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// 兼容旧代码：默认的 CORS 头（如果配置了 ALLOWED_ORIGINS，请在环境变量里配置并使用 jsonResponseCors 做严格校验）
// 注意：浏览器默认会阻止 Access-Control-Allow-Origin: * + withCredentials:true
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
  'Access-Control-Max-Age': '86400',
};

// ============= 响应工具 =============

// JSON 响应（兼容旧接口：附带安全头 + 默认 CORS）
export function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...securityHeaders,
      ...corsHeaders,
      ...(extraHeaders as any),
    },
  });
}

// 带 CORS 的 JSON 响应（对需要跨域的接口）
export function jsonResponseCors(request: Request, env: Record<string, any>, data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...securityHeaders,
      ...getCorsHeaders(request, env),
    },
  });
}

// 错误响应（不暴露内部堆栈细节，统一中文提示；附带安全头+CORS）
export function errorResponse(message: string, status = 400) {
  // 5xx 错误不暴露具体原因
  const safeMessage = status >= 500 ? '服务器内部错误，请稍后重试' : message;
  return jsonResponse({ error: safeMessage }, status);
}

export function errorResponseCors(request: Request, env: Record<string, any>, message: string, status = 400) {
  const safeMessage = status >= 500 ? '服务器内部错误，请稍后重试' : message;
  return jsonResponseCors(request, env, { error: safeMessage }, status);
}

// 处理 OPTIONS 预检请求（兼容旧调用：无参时使用通用 CORS 头）
export function handleOptions(request?: Request, env?: Record<string, any>) {
  if (request && env) {
    return new Response(null, {
      status: 204,
      headers: {
        ...securityHeaders,
        ...getCorsHeaders(request, env),
      },
    });
  }
  // 兼容旧代码
  return new Response(null, {
    status: 204,
    headers: {
      ...securityHeaders,
      ...corsHeaders,
    },
  });
}

// ============= 速率限制（KV + 内存双备份） =============

// 内存 Map 回退（KV 未配置或出错时使用）
const memoryRateStore = new Map<string, { count: number; expireAt: number }>();

export async function rateLimit(
  request: Request,
  env: Record<string, any>,
  options: { max?: number; windowSeconds?: number; prefix?: string } = {}
) {
  const { max = 10, windowSeconds = 60, prefix = 'ratelimit' } = options;

  const clientIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';
  const key = `${prefix}:${clientIp}`;
  const now = Date.now();

  // 1. 优先 KV
  if (env?.KV_CACHE) {
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
      console.warn('KV 速率限制检查失败，降级到内存存储:', err);
    }
  }

  // 2. 内存回退（本地调试 & KV 故障时生效，避免无限制放行）
  try {
    const record = memoryRateStore.get(key);
    if (record && record.expireAt < now) {
      memoryRateStore.delete(key);
    }
    const cur = memoryRateStore.get(key);
    const count = cur ? cur.count : 0;
    if (count >= max) {
      return {
        allowed: false,
        response: errorResponse('请求过于频繁，请稍后重试', 429),
      };
    }
    memoryRateStore.set(key, { count: count + 1, expireAt: now + windowSeconds * 1000 });

    // 简单清理，防止内存无限增长
    if (memoryRateStore.size > 5000) {
      for (const [k, v] of memoryRateStore) {
        if (v.expireAt < now) memoryRateStore.delete(k);
      }
    }

    return { allowed: true };
  } catch (_) {
    // 最后兜底：未知 IP 或者存储出问题时，保守禁止，防止被刷
    if (clientIp === 'unknown') {
      return {
        allowed: false,
        response: errorResponse('请求来源异常', 403),
      };
    }
    return { allowed: true };
  }
}
