import { useState, useRef, useCallback, useEffect } from 'react';

interface SliderCaptchaProps {
  onVerify: (verified: boolean) => void;
}

const SliderCaptcha = ({ onVerify }: SliderCaptchaProps) => {
  const [status, setStatus] = useState<'idle' | 'dragging' | 'success' | 'fail'>('idle');
  const [offset, setOffset] = useState(0);
  const startXRef = useRef(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 滑块最大可移动距离
  const maxOffset = useRef(0);

  useEffect(() => {
    if (containerRef.current) {
      // 容器宽度 - 滑块宽度 = 最大移动距离
      maxOffset.current = containerRef.current.offsetWidth - 44;
    }
  }, []);

  const handleStart = useCallback((clientX: number) => {
    if (status === 'success') return;
    startXRef.current = clientX;
    setStatus('dragging');
  }, [status]);

  const handleMove = useCallback((clientX: number) => {
    if (status !== 'dragging') return;
    const diff = clientX - startXRef.current;
    const newOffset = Math.max(0, Math.min(diff, maxOffset.current));
    setOffset(newOffset);
  }, [status]);

  const handleEnd = useCallback(() => {
    if (status !== 'dragging') return;

    // 允许一定的误差范围（最后 10%）
    if (offset >= maxOffset.current * 0.92) {
      setStatus('success');
      setOffset(maxOffset.current);
      onVerify(true);
    } else {
      setStatus('fail');
      // 回弹动画
      setTimeout(() => {
        setOffset(0);
        setStatus('idle');
      }, 400);
    }
  }, [status, offset, onVerify]);

  // 鼠标事件
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX);
  };

  // 全局鼠标事件
  useEffect(() => {
    if (status === 'dragging') {
      const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
      const onMouseUp = () => handleEnd();

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      return () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
    }
  }, [status, handleMove, handleEnd]);

  // 触摸事件
  const handleTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  // 进度百分比
  const progress = maxOffset.current > 0 ? (offset / maxOffset.current) * 100 : 0;

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative w-full h-11 bg-gray-100 rounded-xl overflow-hidden border border-gray-200 select-none"
      >
        {/* 进度条背景 */}
        <div
          className="absolute left-0 top-0 h-full transition-none"
          style={{
            width: `${progress}%`,
            backgroundColor: status === 'success' ? '#10b981' : status === 'fail' ? '#ef4444' : '#e5e7eb',
          }}
        />

        {/* 提示文字 */}
        <div
          className="absolute inset-0 flex items-center justify-center text-sm font-medium transition-opacity"
          style={{
            color: status === 'success' ? '#fff' : '#9ca3af',
            opacity: status === 'dragging' ? 0.3 : 1,
          }}
        >
          {status === 'success'
            ? '验证通过'
            : status === 'fail'
            ? '验证失败，请重试'
            : '向右拖动滑块完成验证'}
        </div>

        {/* 滑块 */}
        <div
          ref={sliderRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="absolute top-0 left-0 w-11 h-11 flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform"
          style={{
            transform: `translateX(${offset}px)`,
            transition: status === 'dragging' ? 'none' : 'transform 0.3s ease',
            backgroundColor: status === 'success' ? '#10b981' : status === 'fail' ? '#ef4444' : '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '11px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {status === 'success' ? (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : status === 'fail' ? (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

export default SliderCaptcha;
