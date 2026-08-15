import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 全局 React 渲染错误兜底，防止未捕获的渲染异常导致整页白屏。
 *
 * - 生产环境只展示友好提示 + 「刷新页面 / 返回首页」按钮，不向用户暴露 stack
 * - 开发环境额外展示错误堆栈，方便排查
 * - 同时把错误打到 console.error，便于后续接入 sentry-like 上报
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 上报错误（生产环境可扩展为发送到日志服务）
    try {
      console.error('[ErrorBoundary] 未捕获的渲染错误:', error, errorInfo);
    } catch (_) {
      /* ignore */
    }
    this.setState({ errorInfo });
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch (_) {
      /* ignore */
    }
  };

  handleGoHome = () => {
    try {
      window.location.href = '/';
    } catch (_) {
      /* ignore */
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo } = this.state;
    const isDev = import.meta.env?.DEV === true || import.meta.env?.MODE === 'development';

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 py-12">
        <div className="max-w-lg w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-8 animate-fade-in">
          <div className="flex items-start gap-4 mb-6">
            <div className="text-3xl select-none" aria-hidden>
              🧯
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 mb-2">页面出错了</h1>
              <p className="text-sm text-gray-600 leading-relaxed">
                抱歉，页面在渲染时遇到了一个意外错误。这不是您的操作问题，刷新页面通常可以解决。
                如果问题持续出现，请联系管理员。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              刷新页面
              <span aria-hidden>↻</span>
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              返回首页
              <span aria-hidden>→</span>
            </button>
          </div>

          {isDev && error && (
            <details className="mt-4 border-t border-gray-100 pt-4">
              <summary className="cursor-pointer text-xs text-gray-500 select-none">
                开发模式：查看错误堆栈
              </summary>
              <pre className="mt-3 p-3 bg-gray-900 text-gray-100 text-xs rounded-lg overflow-auto max-h-64 whitespace-pre-wrap break-all">
                {error.toString()}
                {errorInfo?.componentStack ? `\n\nComponent stack:${errorInfo.componentStack}` : ''}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
