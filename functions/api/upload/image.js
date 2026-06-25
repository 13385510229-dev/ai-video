// 上传图片到 Supabase Storage
import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 认证
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = parseInt(authResult.user.sub, 10) || authResult.user.sub;

    // 读取请求体
    const body = await request.json();
    const { image: base64Image, filename } = body;

    if (!base64Image) {
      return errorResponse('请提供图片数据');
    }

    // 解析 Base64
    const base64Data = base64Image.split(',')[1] || base64Image;
    const mimeType = base64Image.includes('image/png') ? 'image/png' : 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';

    // 生成文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const finalFilename = filename || `img_${userId}_${timestamp}_${random}.${ext}`;

    // Base64 转二进制
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 上传到 Supabase Storage
    const bucketName = 'reference-images';
    const uploadPath = `${bucketName}/${finalFilename}`;
    const uploadUrl = `${env.SUPABASE_URL}/storage/v1/object/${uploadPath}`;

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: bytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '未知错误');
      console.error('Supabase上传失败:', uploadRes.status, errText);
      return errorResponse(`上传失败: ${errText}`);
    }

    // 构建公开 URL
    const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${uploadPath}`;

    return jsonResponse({
      success: true,
      url: publicUrl,
      path: finalFilename,
    });

  } catch (error) {
    console.error('上传图片失败:', error);
    return errorResponse(`服务器错误: ${error.message || '未知错误'}`);
  }
}
