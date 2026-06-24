// 上传图片到 Supabase Storage
import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';

export const onRequestOptions = handleOptions;

export const onRequestPost = requireAuth(async (context) => {
  try {
    const { env, data } = context;
    const userId = data.userId;

    // 读取请求体
    const body = await context.request.json();
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
      method: 'PUT',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': mimeType,
      },
      body: bytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return errorResponse(`Supabase上传失败 (${uploadRes.status}): ${errText}`);
    }

    // 构建公开 URL
    const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${uploadPath}`;

    return jsonResponse({
      success: true,
      url: publicUrl,
      path: finalFilename,
    });

  } catch (error) {
    return errorResponse(`服务器错误: ${error.message}`);
  }
});
