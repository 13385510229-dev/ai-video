import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '你好！我是 Agnes AI 助手，有什么可以帮你的吗？',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 解析 SSE 行数据
  const parseSSELine = (line: string) => {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') return null;
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    return null;
  };

  // 发送消息（流式）
  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // 添加一个空的 AI 消息占位
    const aiMessageIndex = newMessages.length;
    setMessages([...newMessages, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newMessages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const parsed = parseSSELine(line);
            if (parsed && parsed.choices?.[0]?.delta?.content) {
              const chunk = parsed.choices[0].delta.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[aiMessageIndex] = {
                  ...updated[aiMessageIndex],
                  content: updated[aiMessageIndex].content + chunk,
                };
                return updated;
              });
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errorMsg = err.message || '发送失败，请重试';
        setMessages((prev) => {
          const updated = [...prev];
          updated[aiMessageIndex] = {
            role: 'assistant',
            content: `抱歉，出错了：${errorMsg}`,
          };
          return updated;
        });
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // 回车发送
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* 顶部标题 */}
      <div className="border-b border-gray-100 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">AI 智能对话</h1>
        <p className="text-sm text-gray-500 mt-1">Agnes 2.0 Flash 语言模型 · 流式输出</p>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-4xl mx-auto w-full">
        <div className="space-y-6">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                  msg.role === 'user'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-50 text-gray-900 border border-gray-100'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                  {loading && index === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle"></span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="border-t border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，按 Enter 发送..."
            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gray-400 transition-colors bg-gray-50"
            rows={2}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
          >
            {loading ? '生成中' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
