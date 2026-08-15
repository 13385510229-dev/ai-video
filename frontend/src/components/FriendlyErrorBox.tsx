import { Link } from 'react-router-dom';
import type { FriendlyError as FE } from '../utils/errors';

interface Props {
  error: FE | null;
  /** 当用户点击"重试"时触发（组件内不提供重试按钮的逻辑，只负责抛出事件） */
  onRetry?: () => void;
  /** 要不要显示关闭按钮 */
  onDismiss?: () => void;
  className?: string;
}

/**
 * 所有页面错误提示的统一样式。
 * 展示「什么错了 + 为什么 + 怎么处理」三要素，避免只给用户一句"生成失败"。
 */
export default function FriendlyErrorBox({ error, onRetry, onDismiss, className = '' }: Props) {
  if (!error) return null;

  const borderColor =
    error.category === 'AUTH_UNAUTHORIZED' ||
    error.category === 'AUTH_FORBIDDEN'
      ? 'border-orange-200 bg-orange-50 text-orange-700'
      : error.category === 'RATE_LIMIT' ||
          error.category === 'CREDIT_CONCURRENT' ||
          error.category === 'UPSTREAM_BUSY' ||
          error.category === 'UPSTREAM_LIMIT'
        ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
        : error.category === 'NETWORK' || error.category === 'SERVER_ERROR'
          ? 'border-purple-200 bg-purple-50 text-purple-700'
          : error.category === 'UPSTREAM_ADMIN'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : error.category === 'UPSTREAM_TEMP'
              ? 'border-sky-200 bg-sky-50 text-sky-700'
              : error.category === 'UPSTREAM_BAD_INPUT'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-red-200 bg-red-50 text-red-700';

  const icon =
    error.category === 'CREDIT_BALANCE' ||
    error.category === 'CREDIT_DAILY' ||
    error.category === 'CREDIT_TOTAL'
      ? '💰'
      : error.category === 'AUTH_UNAUTHORIZED' || error.category === 'AUTH_FORBIDDEN'
        ? '🔐'
        : error.category === 'RATE_LIMIT'
          ? '⏱️'
          : error.category === 'NETWORK'
            ? '📡'
            : error.category === 'SERVER_ERROR'
              ? '🧯'
              : error.category === 'UPLOAD_FAILED'
                ? '🖼️'
                : error.category === 'INPUT_VALIDATION'
                  ? '📝'
                  : error.category === 'UPSTREAM_BUSY'
                    ? '🚦'
                    : error.category === 'UPSTREAM_LIMIT'
                      ? '🛑'
                      : error.category === 'UPSTREAM_ADMIN'
                        ? '👨‍💻'
                        : error.category === 'UPSTREAM_TEMP'
                          ? '⚡'
                          : error.category === 'UPSTREAM_BAD_INPUT'
                            ? '🧹'
                            : '❌';

  // 展示「重试」按钮的类别：网络/5xx/并发冲突/限流/上游排队/上游限流/上游临时故障/未知
  const shouldShowRetry =
    !!onRetry &&
    (error.category === 'NETWORK' ||
      error.category === 'SERVER_ERROR' ||
      error.category === 'CREDIT_CONCURRENT' ||
      error.category === 'RATE_LIMIT' ||
      error.category === 'UPSTREAM_BUSY' ||
      error.category === 'UPSTREAM_LIMIT' ||
      error.category === 'UPSTREAM_TEMP' ||
      error.category === 'UNKNOWN');

  return (
    <div
      role="alert"
      className={`rounded-xl border px-4 py-3 text-sm shadow-sm animate-shake ${borderColor} ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-xl leading-none pt-0.5 select-none" aria-hidden>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold mb-1">{error.title}</div>
          <div className="whitespace-pre-line text-[13px] leading-relaxed opacity-90">
            {error.detail}
          </div>

          {/* 操作建议：充值 / 登录 / 重试 */}
          <div className="mt-2 flex flex-wrap gap-2">
            {error.suggestedAction?.to && (
              <Link
                to={error.suggestedAction.to}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white/70 border border-current/30 hover:bg-white font-medium text-xs transition-colors"
              >
                {error.suggestedAction.label}
                <span aria-hidden>→</span>
              </Link>
            )}
            {error.suggestedAction?.externalUrl && (
              <a
                href={error.suggestedAction.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white/70 border border-current/30 hover:bg-white font-medium text-xs transition-colors"
              >
                {error.suggestedAction.label}
                <span aria-hidden>↗</span>
              </a>
            )}
            {shouldShowRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white/70 border border-current/30 hover:bg-white font-medium text-xs transition-colors"
              >
                重试
                <span aria-hidden>↻</span>
              </button>
            )}
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            aria-label="关闭提示"
            onClick={onDismiss}
            className="opacity-60 hover:opacity-100 transition-opacity text-base leading-none pt-0.5"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
