import { errorResponse, handleOptions, requireAuth } from '../_lib/auth.js';

// 聊天模型列表（按优先级排列）
const CHAT_MODELS = [
  { name: 'agnes-2.5-flash', thinking: true },
  { name: 'agnes-2.0-flash', thinking: false },
];

// 调用 Agnes 聊天 API
async function callAgnesChat({ apiKey, messages, temperature, max_tokens, stream, model }) {
  const requestBody = {
    model: model.name,
    messages,
    temperature,
    max_tokens,
    stream: true,
  };
  
  if (model.thinking) {
    requestBody.chat_template_kwargs = { thinking: true };
  }

  return await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
}

// Agnes 聊天接口（流式输出，带模型回退）
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

    const body = await request.json();
    const { messages, temperature = 0.7, max_tokens = 2048, stream = true } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return errorResponse('消息内容不能为空');
    }

    const apiKey = env.AGNES_API_KEY;
    if (!apiKey) {
      return errorResponse('API Key 未配置');
    }

    // 尝试调用模型，失败则回退到下一个
    let apiRes;
    let lastError;
    
    for (const model of CHAT_MODELS) {
      try {
        console.log(`尝试调用模型: ${model.name}`);
        apiRes = await callAgnesChat({ apiKey, messages, temperature, max_tokens, stream, model });
        
        if (apiRes.ok) {
          console.log(`模型 ${model.name} 调用成功`);
          break;
        }
        
        const errorText = await apiRes.text();
        lastError = { status: apiRes.status, message: errorText, model: model.name };
        console.error(`模型 ${model.name} 调用失败: ${apiRes.status}`, errorText);
        
        // 404/401/403 表示模型不可用，尝试下一个
        if (apiRes.status === 404 || apiRes.status === 401 || apiRes.status === 403) {
          continue;
        }
        
        // 其他错误直接返回
        throw new Error(`API error ${apiRes.status}: ${errorText}`);
        
      } catch (e) {
        lastError = { status: 500, message: e.message, model: model.name };
        console.error(`模型 ${model.name} 请求异常:`, e.message);
        // 继续尝试下一个模型
        continue;
      }
    }

    if (!apiRes || !apiRes.ok) {
      console.error('所有模型调用失败:', lastError);
      return errorResponse(`AI 响应失败: ${lastError?.message || '未知错误'}`, 500);
    }

    const { readable, writable } = new TransformStream();
    const reader = apiRes.body.getReader();
    const writer = writable.getWriter();

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
