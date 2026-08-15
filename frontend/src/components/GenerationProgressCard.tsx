import { useEffect, useRef, useState } from 'react';

interface Props {
  /** 是否正在生成（显示进度卡片） */
  active: boolean;
  /** 预估总耗时（秒），进度条按时长走 */
  estimatedSeconds: number;
  /** 生成类型文案：'视频' | '图片' */
  kind: '视频' | '图片';
  /** 历史记录路径：'/history' | '/image-history' */
  historyPath: string;
  /** 用户点击"去历史记录查看"时触发（默认用 window.location 跳转，可外部接管） */
  onGoHistory?: () => void;
  /** 用户点击"取消"关闭卡片（生成已发起，取消只是隐藏卡片） */
  onCancel?: () => void;
  /**
   * 外部强制完成（适用于同步接口：图片生成）。
   * - true：立即把进度条跳到 100% 并显示"完成"状态
   * - false/undefined：进度条按预估时长自治走
   */
  forceDone?: boolean;
}

/**
 * 生成进度卡片：按预估时长匀速走到 100%，到 100% 后显示"去历史记录查看"按钮。
 *
 * 设计要点：
 * - 进度条是"时长预估"而非真实任务状态（后端任务异步执行，前端无法精确感知）
 * - 到 100% 后不会自动跳转，等用户点按钮才走，避免打断用户阅读
 * - 视频实际生成可能比预估慢，所以完成后提示"历史记录里可能还在生成中"
 */
export default function GenerationProgressCard({
  active,
  estimatedSeconds,
  kind,
  historyPath,
  onGoHistory,
  onCancel,
  forceDone,
}: Props) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const startRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  // 自治进度条（按预估时长匀速走到 100%）
  useEffect(() => {
    if (!active) {
      setProgress(0);
      setDone(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // active 变 true：启动进度条
    setProgress(0);
    setDone(false);
    startRef.current = Date.now();

    timerRef.current = window.setInterval(() => {
      const elapsedSec = (Date.now() - startRef.current) / 1000;
      const pct = Math.min(100, (elapsedSec / estimatedSeconds) * 100);
      setProgress(pct);
      if (pct >= 100) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setDone(true);
      }
    }, 200);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, estimatedSeconds]);

  // 外部强制完成（图片同步接口返回时立即跳到 100%）
  useEffect(() => {
    if (forceDone && !done) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setProgress(100);
      setDone(true);
    }
  }, [forceDone, done]);

  if (!active) return null;

  const remainingSec = Math.max(0, Math.ceil(estimatedSeconds * (1 - progress / 100)));
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const remainingText = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;

  const handleGoHistory = () => {
    if (onGoHistory) {
      onGoHistory();
    } else {
      window.location.href = historyPath;
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm animate-slide-up"
    >
      {done ? (
        <div className="text-center">
          <div className="text-4xl mb-3 select-none" aria-hidden>
            ✅
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {kind}已生成完成
          </h3>
          <p className="text-sm text-gray-500 mb-5 leading-relaxed">
            您的{kind}已经生成完毕，请前往历史记录查看结果。
            <br />
            <span className="text-xs text-gray-400">
              （如果历史记录里还显示"生成中"，请耐心等待几秒，系统会自动刷新）
            </span>
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleGoHistory}
              className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors inline-flex items-center gap-1.5"
            >
              去历史记录查看
              <span aria-hidden>→</span>
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-100 transition-colors"
              >
                留在当前页
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
              <span className="text-sm font-medium text-gray-900">
                正在生成{kind}...
              </span>
            </div>
            <span className="text-sm text-gray-500 tabular-nums">
              {Math.round(progress)}%
            </span>
          </div>

          {/* 进度条 */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gray-700 to-gray-900 transition-all duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
            <span>预计还需 {remainingText}</span>
            <span>生成过程中可关闭页面，稍后在历史记录查看</span>
          </div>

          {onCancel && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                隐藏进度条（不影响生成）
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
