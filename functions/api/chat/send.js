import { errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';

// Agnes 2.0 Flash 聊天接口（流式输出）
export async function onRequestPost(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  try {
    // 需要登录
    const authResult = await requireAuth(request, env);
    if (authResult.error) {
      return errorResponse(authResult.error, 401);
    }

    const body = await request.json();
    const { messages, temperature = 0.7, max_tokens = 2048, stream = true } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return errorResponse('消息内容不能为空');
    }

    const apiKey = env.AGNES_API_KEY;
    if (!apiKey) {
      return errorResponse('API Key 未配置');
    }

    // 调用 Agnes 2.0 Flash API（流式）
    const apiRes = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'agnes-2.0-flash',
        messages,
        temperature,
        max_tokens,
        stream: true,
      }),
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      console.error('Agnes Chat API 错误:', apiRes.status, errorText);
      return errorResponse(`AI 响应失败: ${apiRes.status}`, 500);
    }

    // 透传流式响应
    const { readable, writable } = new TransformStream();
    const reader = apiRes.body.getReader();
    const writer = writable.getWriter();

    // 异步处理流
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } catch (e) {
        console.error('流式传输错误:', e);
      } finally {
        writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('聊天接口错误:', error);
    return errorResponse(`请求失败: ${error.message || '未知错误'}`, 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
