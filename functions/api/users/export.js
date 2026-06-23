import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';
import { createSupabaseClient } from '../_lib/supabase.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const userId = authResult.user.sub;

    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return errorResponse('用户不存在', 404);
    }

    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select('*')
      .eq('user_id', userId);

    const { data: images, error: imagesError } = await supabase
      .from('images')
      .select('*')
      .eq('user_id', userId);

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId);

    const exportData = {
      exportTime: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        balance: user.balance,
        created_at: user.created_at,
      },
      videos: videos || [],
      images: images || [],
      orders: orders || [],
      totalVideos: (videos || []).length,
      totalImages: (images || []).length,
      totalOrders: (orders || []).length,
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="user-data-${userId}-${Date.now()}.json"`,
        ...{
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      },
    });
  } catch (error) {
    console.error('导出数据失败:', error);
    return errorResponse('导出失败，请稍后重试', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}