import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const STORAGE_KEY = 'chat_conversations';
const ACTIVE_KEY = 'chat_active_conversation';

// 从 localStorage 加载会话列表
const loadConversations = (): Conversation[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('加载聊天历史失败', e);
  }
  return [];
};

// 保存会话列表到 localStorage
const saveConversations = (conversations: Conversation[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.error('保存聊天历史失败', e);
  }
};

// 生成唯一 ID
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// 获取会话标题（取第一条用户消息的前20字）
const getTitle = (messages: Message[]): string => {
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    return firstUserMsg.content.slice(0, 20) + (firstUserMsg.content.length > 20 ? '...' : '');
  }
  return '新对话';
};

interface ChatPanelProps {
  // 可选的初始提示词，用于引导用户写 prompt
  initialPrompt?: string;
  // 可选的上下文提示，告诉 AI 当前在什么场景
  contextHint?: string;
}

const ChatPanel = ({ initialPrompt = '', contextHint = '' }: ChatPanelProps) => {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_KEY);
    return saved || '';
  });
  const [input, setInput] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 当前活跃会话
  const activeConversation = conversations.find(c => c.id === activeId);
  const messages = activeConversation?.messages || [
    {
      role: 'assistant' as const,
      content: contextHint || '你好！我是 AI 助手，有什么可以帮你的吗？',
    },
  ];

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 保存活跃会话 ID
  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  // 同步保存到 localStorage
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

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

  // 新建对话
  const newConversation = () => {
    const newConv: Conversation = {
      id: genId(),
      title: '新对话',
      messages: [
        {
          role: 'assistant',
          content: contextHint || '你好！我是 AI 助手，有什么可以帮你的吗？',
        },
      ],
      createdAt: Date.now(),
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveId(newConv.id);
    setInput('');
    setShowHistory(false);
  };

  // 删除对话
  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeId === id) {
      const remaining = conversations.filter(c => c.id !== id);
      setActiveId(remaining[0]?.id || '');
    }
  };

  // 发送消息（流式）
  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    let currentConvId = activeId;
    let updatedMessages: Message[];

    if (!currentConvId || !activeConversation) {
      // 新建会话
      const newConv: Conversation = {
        id: genId(),
        title: '新对话',
        messages: [
          { role: 'assistant', content: contextHint || '你好！我是 AI 助手，有什么可以帮你的吗？' },
          userMessage,
        ],
        createdAt: Date.now(),
      };
      currentConvId = newConv.id;
      updatedMessages = newConv.messages;
      setConversations(prev => [newConv, ...prev]);
      setActiveId(currentConvId);
    } else {
      // 追加到现有会话
      updatedMessages = [...messages, userMessage];
      setConversations(prev =>
        prev.map(c =>
          c.id === currentConvId
            ? { ...c, messages: updatedMessages, title: getTitle(updatedMessages) }
            : c
        )
      );
    }

    setInput('');
    setLoading(true);

    // 添加一个空的 AI 消息占位
    const aiMessageIndex = updatedMessages.length;
    const messagesWithPlaceholder = [...updatedMessages, { role: 'assistant' as const, content: '' }];
    setConversations(prev =>
      prev.map(c =>
        c.id === currentConvId
          ? { ...c, messages: messagesWithPlaceholder, title: getTitle(updatedMessages) }
          : c
      )
    );

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
          messages: updatedMessages,
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
              setConversations(prev =>
                prev.map(c => {
                  if (c.id !== currentConvId) return c;
                  const updated = [...c.messages];
                  updated[aiMessageIndex] = {
                    ...updated[aiMessageIndex],
                    content: updated[aiMessageIndex].content + chunk,
                  };
                  return { ...c, messages: updated };
                })
              );
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errorMsg = err.message || '发送失败，请重试';
        setConversations(prev =>
          prev.map(c => {
            if (c.id !== currentConvId) return c;
            const updated = [...c.messages];
            updated[aiMessageIndex] = {
              role: 'assistant',
              content: `抱歉，出错了：${errorMsg}`,
            };
            return { ...c, messages: updated };
          })
        );
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

  // 切换会话
  const switchConversation = (id: string) => {
    setActiveId(id);
    setShowHistory(false);
  };

  return (
    <div className="h-full flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-1.5 rounded-lg hover:bg-gray-200/60 transition-colors text-gray-500 hover:text-gray-700"
            title="历史对话"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <h3 className="text-sm font-medium text-gray-900">AI 助手</h3>
        </div>
        <button
          onClick={newConversation}
          className="p-1.5 rounded-lg hover:bg-gray-200/60 transition-colors text-gray-500 hover:text-gray-700"
          title="新对话"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* 历史记录侧边栏 */}
      {showHistory && (
        <div className="border-b border-gray-100 bg-white max-h-48 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-400 text-center">暂无历史对话</div>
          ) : (
            <div className="py-1">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => switchConversation(conv.id)}
                  className={`group flex items-center justify-between px-4 py-2 cursor-pointer text-sm transition-colors ${
                    conv.id === activeId
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate flex-1">{conv.title}</span>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 ml-2 p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-all"
                    title="删除对话"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-900 border border-gray-100'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">
                {msg.content}
                {loading && index === messages.length - 1 && msg.role === 'assistant' && (
                  <span className="inline-block w-1 h-3 bg-gray-400 ml-0.5 animate-pulse align-middle"></span>
                )}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="border-t border-gray-100 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            className="flex-1 resize-none border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-gray-50"
            rows={2}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
          >
            {loading ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
