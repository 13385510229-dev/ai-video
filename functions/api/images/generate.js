// 生成图片接口
import { createSupabaseClient } from '../_lib/supabase.js';
import { requireAuth, jsonResponse, errorResponse, handleOptions } from '../_lib/auth.js';
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

    const userId = authResult.user.sub;
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGNES_API_KEY } = env;

    const body = await request.json();
    const { prompt, negativePrompt, style, size } = body;

    if (!prompt || !prompt.trim()) {
      return errorResponse('请输入图片描述');
    }

    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 检查用户余额
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return errorResponse('用户不存在', 404);
    }

    const cost = 1; // 每张图片消耗 1 次

    if (user.balance < cost) {
      return errorResponse('次数不足，请先充值');
    }

    // 扣除次数
    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: user.balance - cost })
      .eq('id', userId);

    if (updateError) {
      return errorResponse('扣除次数失败');
    }

    // 先插入记录，状态为 processing
    const { data: imageRecord, error: insertError } = await supabase
      .from('images')
      .insert({
        user_id: userId,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt?.trim() || null,
        style: style || null,
        size: size || '1024x768',
        status: 'processing',
        cost,
      })
      .select()
      .single();

    if (insertError) {
      // 回滚余额
      await supabase
        .from('users')
        .update({ balance: user.balance })
        .eq('id', userId);
      return errorResponse('创建记录失败');
    }

    // 同步生成图片
    try {
      const result = await generateImage({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt?.trim(),
        size: size || '1024x768',
        style: style,
        apiKey: AGNES_API_KEY || '',
      });

      if (result.success) {
        // 更新记录为成功
        await supabase
          .from('images')
          .update({
            status: 'succeeded',
            image_url: result.imageUrl,
          })
          .eq('id', imageRecord.id);

        return jsonResponse({
          success: true,
          message: '生成成功',
          image: {
            ...imageRecord,
            status: 'succeeded',
            image_url: result.imageUrl,
          },
        });
      } else {
        throw new Error('生成失败');
      }
    } catch (genError) {
      console.error('图片生成失败:', genError);

      // 更新记录为失败
      await supabase
        .from('images')
        .update({
          status: 'failed',
          error_message: genError.message || '生成失败',
        })
        .eq('id', imageRecord.id);

      // 退还次数
      await supabase
        .from('users')
        .update({ balance: user.balance })
        .eq('id', userId);

      return errorResponse(genError.message || '生成失败，请稍后重试');
    }
  } catch (error) {
    console.error('生成图片接口错误:', error);
    return errorResponse('服务器内部错误', 500);
  }
}
