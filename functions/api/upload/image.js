// 上传图片到 Supabase Storage（安全加固版）
import { jsonResponse, errorResponse, handleOptions, requireAuth, rateLimit } from '../_lib/auth.js';

// 安全常量
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 单张图片最大 8MB
const ALLOWED_EXTS = ['jpg', 'jpeg', 'png'];

// 校验 PNG/JPEG 文件的"魔数"（文件开头的字节签名），防止伪装扩展名
function checkMagicNumbers(bytes: Uint8Array, mimeType: 'png' | 'jpeg'): boolean {
  if (bytes.length < 4) return false;
  if (mimeType === 'png') {
    // PNG: 89 50 4E 47
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  // JPEG: FF D8 FF
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// 安全生成随机文件名（使用 crypto 安全随机）
function safeRandom(len = 12): string {
  const set = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) out += set[arr[i] % set.length];
  return out;
}

// 过滤用户提供的 filename：去掉路径穿越字符、不可见字符、只留安全的
function sanitizeFilename(original: string, ext: string): string {
  if (!original) return '';
  // 只取最后一个 '/' 或 '\\' 后面的部分（防止 ../../xx.jpg 路径穿越）
  let base = original.split(/[\\/]/).pop() || '';
  // 只保留 字母 / 数字 / _ / - / .  / 中文
  base = base.replace(/[^\p{L}\p{N}_.-]/gu, '_');
  // 截掉多余的点
  base = base.replace(/\.+/g, '.').replace(/^[.\-]+|[.\-]+$/g, '');
  if (!base) return '';
  // 把扩展名统一换成我们检测到的真实扩展名（防止伪装成.png的shell.php）
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx !== -1) base = base.slice(0, dotIdx);
  return `${base}.${ext}`;
}

export async function onRequestOptions(context) {
  if (context?.request && context?.env) {
    return handleOptions(context.request, context.env);
  }
  return handleOptions();
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 上传接口也要限速：每分钟最多 20 次
    const rate = await rateLimit(request, env, {
      max: 20,
      windowSeconds: 60,
      prefix: 'ratelimit:upload',
    });
    if (!rate.allowed) return rate.response!;

    // 认证
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = parseInt(authResult.user.sub, 10) || authResult.user.sub;

    // 限制整体请求体大小（DoS 防护），避免超大 base64 撑爆内存
    const contentLen = request.headers.get('Content-Length');
    if (contentLen) {
      const len = parseInt(contentLen, 10);
      // base64 比二进制大 ~1.37 倍，给点余量
      if (len > MAX_UPLOAD_BYTES * 2) {
        return errorResponse('图片过大，最大支持 8MB', 413);
      }
    }

    // 读取请求体
    let body: { image?: string; filename?: string } = {};
    try {
      body = await request.json();
    } catch (_) {
      return errorResponse('请求格式错误');
    }
    const { image: base64Image, filename } = body;

    if (!base64Image || typeof base64Image !== 'string') {
      return errorResponse('请提供图片数据');
    }

    // 初步长度校验（base64 字符数）
    if (base64Image.length > (MAX_UPLOAD_BYTES * 4) / 3 + 1024) {
      return errorResponse('图片过大，最大支持 8MB', 413);
    }

    // 解析 MIME 类型
    const hasDataUrlPrefix = base64Image.startsWith('data:');
    let declaredMime: string | null = null;
    if (hasDataUrlPrefix) {
      const m = base64Image.match(/^data:([a-zA-Z0-9/+\-.]+);base64,/);
      if (m) declaredMime = m[1].toLowerCase();
    }
    const base64Data = hasDataUrlPrefix
      ? base64Image.slice(base64Image.indexOf(',') + 1)
      : base64Image;

    // 确定扩展名（先按声明的 MIME，然后用魔数校验真实格式）
    let expectedExt: 'png' | 'jpeg' = 'jpeg';
    if (declaredMime === 'image/png') expectedExt = 'png';
    else if (declaredMime === 'image/jpeg') expectedExt = 'jpeg';

    // Base64 解码
    let bytes: Uint8Array;
    try {
      const binaryString = atob(base64Data);
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
    } catch (e) {
      return errorResponse('图片数据格式错误');
    }

    if (bytes.length === 0) return errorResponse('图片数据为空');
    if (bytes.length > MAX_UPLOAD_BYTES) return errorResponse('图片过大，最大支持 8MB', 413);

    // 【关键】按字节级魔数验证真实格式 — 防止上传伪装的 php/html/webp 等
    const isPngReal = checkMagicNumbers(bytes, 'png');
    const isJpegReal = checkMagicNumbers(bytes, 'jpeg');

    if (!isPngReal && !isJpegReal) {
      return errorResponse('图片格式不合法，仅支持 PNG / JPEG', 415);
    }
    // 以真实格式为准（覆盖声明的 MIME，避免 data:image/png 但实际是 shell）
    const realMime: 'image/png' | 'image/jpeg' = isPngReal ? 'image/png' : 'image/jpeg';
    const realExt = isPngReal ? 'png' : 'jpg';

    // 生成安全文件名（用户可控的 filename 必须过滤，防止 ../xxx.php 覆盖路径）
    let finalFilename: string;
    const timestamp = Date.now();
    const rand = safeRandom(10);
    if (filename && typeof filename === 'string') {
      const clean = sanitizeFilename(filename, realExt);
      if (clean) {
        // 即使过滤过，也拼接 user/time/rand 前缀防碰撞 + 防覆盖
        finalFilename = `img_${userId}_${timestamp}_${rand}_${clean}`;
      } else {
        finalFilename = `img_${userId}_${timestamp}_${rand}.${realExt}`;
      }
    } else {
      finalFilename = `img_${userId}_${timestamp}_${rand}.${realExt}`;
    }

    // 二次校验扩展名白名单
    const lower = finalFilename.toLowerCase();
    const okExt = ALLOWED_EXTS.some((e) => lower.endsWith(`.${e}`));
    if (!okExt) finalFilename += `.${realExt}`;

    // 上传到 Supabase Storage
    const bucketName = 'reference-images';
    const uploadPath = `${bucketName}/${finalFilename}`;
    const uploadUrl = `${env.SUPABASE_URL}/storage/v1/object/${uploadPath}`;

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': realMime,
        // 【安全】禁用 x-upsert，防止攻击者猜中文件名覆盖别人的图片
        'x-upsert': 'false',
      },
      body: bytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      // 409 = 文件已存在，我们已禁用 upsert，所以这种情况下重命名一次再试
      if (uploadRes.status === 409) {
        const retryPath = `${bucketName}/img_${userId}_${timestamp}_${safeRandom(16)}.${realExt}`;
        const retryUrl = `${env.SUPABASE_URL}/storage/v1/object/${retryPath}`;
        const retryRes = await fetch(retryUrl, {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': realMime,
            'x-upsert': 'false',
          },
          body: bytes,
        });
        if (retryRes.ok) {
          const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${retryPath}`;
          const finalRetryName = retryPath.slice(bucketName.length + 1);
          return jsonResponse({
            success: true,
            url: publicUrl,
            path: finalRetryName,
          });
        }
        console.error('Supabase上传失败(重试):', retryRes.status, await retryRes.text().catch(() => ''));
      }
      console.error('Supabase上传失败:', uploadRes.status, errText.slice(0, 400));
      return errorResponse('上传失败，请稍后重试');
    }

    // 构建公开 URL
    const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${uploadPath}`;

    return jsonResponse({
      success: true,
      url: publicUrl,
      path: finalFilename,
    });
  } catch (error: any) {
    console.error('上传图片失败:', error);
    return errorResponse('服务器错误，请稍后重试', 500);
  }
}
