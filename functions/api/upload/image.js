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

    // 生成文件名（简化，不用子目录，避免路径问题）
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
    const uploadUrl = `${env.SUPABASE_URL}/storage/v1/object/${bucketName}/${finalFilename}`;

    console.log('上传图片到:', uploadUrl);
    console.log('文件大小:', bytes.length, '字节');
    console.log('Content-Type:', mimeType);

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

    console.log('上传响应状态:', uploadRes.status);

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      console.error('上传图片失败:', uploadRes.status, errText);
      let errMsg = '';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.message || errJson.error || JSON.stringify(errJson);
      } catch {
        errMsg = errText;
      }
      return errorResponse(`上传失败 (${uploadRes.status}): ${errMsg}`);
    }

    // 构建公开 URL
    const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${bucketName}/${finalFilename}`;

    return jsonResponse({
      success: true,
      url: publicUrl,
      path: finalFilename,
    });

  } catch (error) {
    console.error('上传图片错误:', error);
    return errorResponse(`上传失败: ${error.message}`);
  }
});
