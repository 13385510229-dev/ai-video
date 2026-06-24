import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';
import { generateImage } from '../_lib/imageService.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = parseInt(authResult.user.sub, 10) || authResult.user.sub;
    const body = await request.json();
    const {
      prompt,
      negativePrompt = '',
      style = 'realistic',
      size = '1024x768',
      mode = 'text2image',
      image = null,
    } = body;

    if (!prompt || !prompt.trim()) {
      return errorResponse('图片描述不能为空');
    }

    // 初始化 Supabase
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 查询用户余额
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId);

    if (userError || !users?.[0]) {
      return errorResponse('用户不存在', 404);
    }

    const user = users[0];
    const cost = 1; // 每张图片消耗 1 次

    if (user.balance < cost) {
      return errorResponse('余额不足，请充值', 400);
    }

    // 生成唯一 ID（时间戳 + 随机数，避免自增主键问题）
    const imageId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

    // 先保存记录
    const { data: imageRecord, error: insertError } = await supabase
      .from('images')
      .insert({
        id: imageId,
        user_id: userId,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt?.trim() || null,
        style: style || null,
        size: size || '1024x768',
        status: 'processing',
        cost,
      });

    if (insertError) {
      console.error('保存图片记录失败:', insertError);
      const errMsg = insertError.message || JSON.stringify(insertError);
      return errorResponse(`创建记录失败: ${errMsg}`, 500);
    }

    // 扣除余额（直接用 fetch，确保 100% 生效）
    try {
      await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ balance: user.balance - cost }),
      });
    } catch (updateError) {
      console.error('扣除余额失败:', updateError);
      // 即使扣除失败也继续，后面可以补扣
    }

    // 同步生成图片
    try {
      const result = await generateImage({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt?.trim(),
        size: size || '1024x768',
        style: style,
        apiKey: env.AGNES_API_KEY || '',
        mode,
        image,
      });

      if (result.success) {
        // 更新记录为成功（直接用 fetch）
        await fetch(`${env.SUPABASE_URL}/rest/v1/images?id=eq.${imageId}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'succeeded',
            image_url: result.imageUrl,
          }),
        });

        return jsonResponse({
          success: true,
          message: '生成成功',
          image: {
            id: imageId,
            user_id: userId,
            prompt: prompt.trim(),
            negative_prompt: negativePrompt?.trim() || null,
            style: style || null,
            size: size || '1024x768',
            status: 'succeeded',
            image_url: result.imageUrl,
            cost,
          },
          mode: result.mode,
        });
      } else {
        throw new Error('生成失败');
      }
    } catch (genError) {
      console.error('图片生成失败:', genError);

      // 更新记录为失败（直接用 fetch）
      try {
        await fetch(`${env.SUPABASE_URL}/rest/v1/images?id=eq.${imageId}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'failed',
            error_message: genError.message || '生成失败',
          }),
        });
      } catch (e) {
        console.error('更新失败状态出错:', e);
      }

      // 退还次数（直接用 fetch）
      try {
        await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ balance: user.balance }),
        });
      } catch (e) {
        console.error('退还次数出错:', e);
      }

      return errorResponse(genError.message || '生成失败，请稍后重试');
    }
  } catch (error) {
    console.error('生成图片接口错误:', error);
    return errorResponse(`生成失败: ${error.message || JSON.stringify(error)}`, 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
