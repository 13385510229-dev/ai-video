import { useState, useRef, useCallback, useEffect } from 'react';

interface SliderCaptchaProps {
  onVerify: (verified: boolean) => void;
}

// 画布参数
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 150;
const PUZZLE_SIZE = 40; // 拼图块大小（正方形）
const TOLERANCE = 3; // 验证容差像素

// 生成随机整数
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// 生成随机颜色
const randColor = (min: number, max: number) => `rgb(${randInt(min, max)}, ${randInt(min, max)}, ${randInt(min, max)})`;

// 用 Canvas 程序化生成彩色装饰背景 + 挖缺口
const generateCaptcha = () => {
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = CANVAS_WIDTH;
  bgCanvas.height = CANVAS_HEIGHT;
  const bgCtx = bgCanvas.getContext('2d')!;

  // 1. 绘制随机渐变背景
  const colors = [randColor(80, 180), randColor(100, 200), randColor(120, 220)];
  const angle = Math.random() * Math.PI;
  const grd = bgCtx.createLinearGradient(
    0, 0,
    Math.cos(angle) * CANVAS_WIDTH,
    Math.sin(angle) * CANVAS_HEIGHT
  );
  grd.addColorStop(0, colors[0]);
  grd.addColorStop(0.5, colors[1]);
  grd.addColorStop(1, colors[2]);
  bgCtx.fillStyle = grd;
  bgCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 2. 绘制随机装饰圆
  const circleCount = randInt(6, 12);
  for (let i = 0; i < circleCount; i++) {
    bgCtx.beginPath();
    bgCtx.globalAlpha = 0.15 + Math.random() * 0.3;
    bgCtx.fillStyle = randColor(200, 255);
    bgCtx.arc(
      randInt(0, CANVAS_WIDTH),
      randInt(0, CANVAS_HEIGHT),
      randInt(10, 50),
      0,
      Math.PI * 2
    );
    bgCtx.fill();
  }

  // 3. 绘制随机装饰矩形
  bgCtx.globalAlpha = 0.25;
  const rectCount = randInt(4, 8);
  for (let i = 0; i < rectCount; i++) {
    bgCtx.fillStyle = randColor(200, 255);
    const w = randInt(20, 60);
    const h = randInt(15, 50);
    const x = randInt(0, CANVAS_WIDTH - w);
    const y = randInt(0, CANVAS_HEIGHT - h);
    const rotate = Math.random() * Math.PI;
    bgCtx.save();
    bgCtx.translate(x + w / 2, y + h / 2);
    bgCtx.rotate(rotate);
    bgCtx.fillRect(-w / 2, -h / 2, w, h);
    bgCtx.restore();
  }
  bgCtx.globalAlpha = 1;

  // 4. 随机选择缺口形状：正方形 / 长方形（2:1）/ 长方形（1:2）
  const shapeIdx = randInt(0, 2);
  let puzzleW = PUZZLE_SIZE;
  let puzzleH = PUZZLE_SIZE;
  if (shapeIdx === 1) {
    puzzleW = PUZZLE_SIZE + 20; // 横长方形
    puzzleH = PUZZLE_SIZE - 5;
  } else if (shapeIdx === 2) {
    puzzleW = PUZZLE_SIZE - 5; // 竖长方形
    puzzleH = PUZZLE_SIZE + 20;
  }

  // 5. 计算缺口随机位置（注意避开最左，因为拼图从左出发）
  const targetX = randInt(80 + puzzleW, CANVAS_WIDTH - puzzleW - 10);
  const targetY = randInt(10, CANVAS_HEIGHT - puzzleH - 10);

  // 6. 在背景上挖掉缺口（先保存那块再挖）
  // 先把缺口区域像素数据取出，作为拼图块的内容
  const pieceImgData = bgCtx.getImageData(targetX, targetY, puzzleW, puzzleH);

  // 7. 在背景上清除缺口，并用半透明阴影标识缺口位置
  // 先画一个深色半透明坑底
  bgCtx.fillStyle = 'rgba(20, 20, 20, 0.45)';
  bgCtx.fillRect(targetX, targetY, puzzleW, puzzleH);
  // 再画一个白色的虚线边框
  bgCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  bgCtx.lineWidth = 1.5;
  bgCtx.setLineDash([4, 3]);
  bgCtx.strokeRect(targetX + 1, targetY + 1, puzzleW - 2, puzzleH - 2);
  bgCtx.setLineDash([]);

  // 8. 创建拼图块 canvas（作为滑块上的图案）
  const pieceCanvas = document.createElement('canvas');
  pieceCanvas.width = puzzleW;
  pieceCanvas.height = puzzleH;
  const pieceCtx = pieceCanvas.getContext('2d')!;
  pieceCtx.putImageData(pieceImgData, 0, 0);

  // 给拼图块加个白色边框，增加视觉感
  pieceCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  pieceCtx.lineWidth = 1.5;
  pieceCtx.strokeRect(0.5, 0.5, puzzleW - 1, puzzleH - 1);

  return {
    bgDataUrl: bgCanvas.toDataURL('image/png'),
    pieceDataUrl: pieceCanvas.toDataURL('image/png'),
    targetX,
    targetY,
    puzzleW,
    puzzleH,
  };
};

const SliderCaptcha = ({ onVerify }: SliderCaptchaProps) => {
  // 拼图数据
  const [captcha, setCaptcha] = useState<ReturnType<typeof generateCaptcha> | null>(null);
  // 滑动状态
  const [status, setStatus] = useState<'idle' | 'dragging' | 'success' | 'fail'>('idle');
  const [sliderOffset, setSliderOffset] = useState(0);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const maxSliderOffset = useRef(0);

  // 初始化 / 刷新拼图
  const refresh = useCallback(() => {
    setCaptcha(generateCaptcha());
    setSliderOffset(0);
    setStatus('idle');
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 根据轨道宽度计算可滑动范围
  useEffect(() => {
    const updateMax = () => {
      if (trackRef.current && captcha) {
        // 轨道宽度 - 滑块宽度（滑块宽度 = 拼图宽度 + 内边距+把手？这里统一设为 puzzleW + 16）
        maxSliderOffset.current = trackRef.current.offsetWidth - (captcha.puzzleW + 16);
      }
    };
    updateMax();
    window.addEventListener('resize', updateMax);
    return () => window.removeEventListener('resize', updateMax);
  }, [captcha]);

  // 开始拖动
  const handleStart = useCallback((clientX: number) => {
    if (status === 'success') return;
    startXRef.current = clientX;
    startOffsetRef.current = sliderOffset;
    setStatus('dragging');
  }, [status, sliderOffset]);

  // 拖动中
  const handleMove = useCallback((clientX: number) => {
    if (status !== 'dragging') return;
    const diff = clientX - startXRef.current;
    const newOffset = Math.max(0, Math.min(startOffsetRef.current + diff, maxSliderOffset.current));
    setSliderOffset(newOffset);
  }, [status]);

  // 拖动结束：判断是否对齐
  const handleEnd = useCallback(() => {
    if (status !== 'dragging' || !captcha) return;

    // 把滑块 offset 映射回拼图画布上的实际 X 坐标
    // 滑块的起点（0）对应拼图块放在 x = 0 的位置
    // 滑块终点对应拼图块放在 x = maxPieceX = CANVAS_WIDTH - puzzleW
    const maxPieceX = CANVAS_WIDTH - captcha.puzzleW;
    const pieceX = maxSliderOffset.current > 0
      ? (sliderOffset / maxSliderOffset.current) * maxPieceX
      : 0;

    if (Math.abs(pieceX - captcha.targetX) <= TOLERANCE) {
      setStatus('success');
      onVerify(true);
    } else {
      setStatus('fail');
      // 失败后延迟刷新一张新图
      setTimeout(() => {
        refresh();
      }, 700);
    }
  }, [status, sliderOffset, captcha, onVerify, refresh]);

  // 鼠标事件
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX);
  };

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
  const handleTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX);
  const handleTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);
  const handleTouchEnd = () => handleEnd();

  if (!captcha) return null;

  // 把滑块 offset 映射回画布上拼图块的位置（与 handleEnd 一致）
  const maxPieceX = CANVAS_WIDTH - captcha.puzzleW;
  const pieceX = maxSliderOffset.current > 0
    ? (sliderOffset / maxSliderOffset.current) * maxPieceX
    : 0;

  return (
    <div className="w-full space-y-3">
      {/* 拼图画布区域 */}
      <div
        className="relative mx-auto overflow-hidden rounded-xl border border-gray-200 select-none"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          maxWidth: '100%',
        }}
      >
        {/* 背景（带缺口） */}
        <img
          src={captcha.bgDataUrl}
          alt=""
          className="absolute inset-0 w-full h-full pointer-events-none"
          draggable={false}
        />

        {/* 可移动的拼图块 */}
        <img
          src={captcha.pieceDataUrl}
          alt=""
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: captcha.targetY,
            width: captcha.puzzleW,
            height: captcha.puzzleH,
            transform: `translateX(${pieceX}px)`,
            transition: status === 'dragging' ? 'none' : 'transform 0.3s ease',
            filter:
              status === 'success'
                ? 'drop-shadow(0 0 4px rgba(16,185,129,0.9))'
                : status === 'fail'
                ? 'drop-shadow(0 0 4px rgba(239,68,68,0.9))'
                : 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
          draggable={false}
        />

        {/* 状态角标 */}
        {status === 'success' && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-green-500/90 text-white text-xs font-medium shadow">
            验证通过
          </div>
        )}
        {status === 'fail' && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-red-500/90 text-white text-xs font-medium shadow animate-shake">
            验证失败
          </div>
        )}
      </div>

      {/* 滑块轨道 */}
      <div
        ref={trackRef}
        className="relative w-full h-11 bg-gray-100 rounded-xl overflow-hidden border border-gray-200 select-none"
      >
        {/* 进度背景 */}
        <div
          className="absolute left-0 top-0 h-full"
          style={{
            width: `${maxSliderOffset.current > 0 ? (sliderOffset / maxSliderOffset.current) * 100 : 0}%`,
            backgroundColor:
              status === 'success' ? '#10b981' : status === 'fail' ? '#ef4444' : '#e5e7eb',
          }}
        />

        {/* 提示文字 */}
        <div
          className="absolute inset-0 flex items-center justify-center text-sm font-medium"
          style={{
            color: status === 'success' ? '#fff' : '#9ca3af',
            opacity: status === 'dragging' ? 0.3 : 1,
          }}
        >
          {status === 'success'
            ? '验证通过'
            : status === 'fail'
            ? '验证失败，正在刷新...'
            : '向右拖动方块对齐缺口'}
        </div>

        {/* 滑块（带拼图缩略图） */}
        <div
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="absolute top-0 left-0 h-11 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-xl"
          style={{
            width: captcha.puzzleW + 16,
            transform: `translateX(${sliderOffset}px)`,
            transition: status === 'dragging' ? 'none' : 'transform 0.3s ease',
            backgroundColor:
              status === 'success' ? '#10b981' : status === 'fail' ? '#ef4444' : '#ffffff',
            border: '1px solid #e5e7eb',
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
            <div className="flex items-center gap-1">
              {/* 滑块上显示一个缩小的拼图预览，让用户知道拖的是什么 */}
              <img
                src={captcha.pieceDataUrl}
                alt=""
                className="rounded-sm pointer-events-none"
                style={{ width: 22, height: 22 * (captcha.puzzleH / captcha.puzzleW) }}
                draggable={false}
              />
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* 刷新按钮 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={refresh}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
          disabled={status === 'dragging' || status === 'success'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          换一张
        </button>
      </div>
    </div>
  );
};

export default SliderCaptcha;
