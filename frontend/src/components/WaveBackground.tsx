import { useEffect, useRef } from 'react';

interface WaveLine {
  points: { x: number; y: number; baseY: number }[];
  amplitude: number;
  speed: number;
  offset: number;
  color: string;
  lineWidth: number;
}

const WaveBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wavesRef = useRef<WaveLine[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const animationRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initWaves();
    };

    // 初始化波浪线
    const initWaves = () => {
      const waves: WaveLine[] = [];
      const waveCount = 5;
      const colors = [
        'rgba(0, 0, 0, 0.03)',
        'rgba(0, 0, 0, 0.05)',
        'rgba(0, 0, 0, 0.04)',
        'rgba(0, 0, 0, 0.06)',
        'rgba(0, 0, 0, 0.03)',
      ];

      for (let i = 0; i < waveCount; i++) {
        const points: { x: number; y: number; baseY: number }[] = [];
        const pointCount = 20;
        const baseY = canvas.height * (0.3 + i * 0.1);
        const amplitude = 30 + i * 15;

        for (let j = 0; j <= pointCount; j++) {
          const x = (j / pointCount) * canvas.width;
          points.push({
            x,
            y: baseY,
            baseY,
          });
        }

        waves.push({
          points,
          amplitude,
          speed: 0.0005 + i * 0.0002,
          offset: i * 0.5,
          color: colors[i],
          lineWidth: 1 + i * 0.5,
        });
      }

      wavesRef.current = waves;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 鼠标移动
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    // 动画循环
    const animate = () => {
      if (!canvas || !ctx) return;

      timeRef.current += 0.01;

      // 白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制每条波浪线
      for (const wave of wavesRef.current) {
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = wave.lineWidth;

        for (let i = 0; i < wave.points.length; i++) {
          const point = wave.points[i];
          
          // 基础波浪运动
          const waveY = point.baseY + Math.sin(timeRef.current * wave.speed * 100 + point.x * 0.01 + wave.offset) * wave.amplitude;
          
          // 鼠标交互影响
          let mouseInfluence = 0;
          if (mouseRef.current.active) {
            const dx = mouseRef.current.x - point.x;
            const dy = mouseRef.current.y - waveY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = 200;
            if (dist < maxDist) {
              mouseInfluence = (1 - dist / maxDist) * 40;
              // 鼠标推开波浪
              const angle = Math.atan2(dy, dx);
              point.y = waveY + Math.sin(angle) * mouseInfluence;
            } else {
              point.y = waveY;
            }
          } else {
            point.y = waveY;
          }

          if (i === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            // 用二次贝塞尔曲线让线条更平滑
            const prev = wave.points[i - 1];
            const cpx = (prev.x + point.x) / 2;
            const cpy = (prev.y + point.y) / 2;
            ctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy);
          }
        }

        ctx.stroke();
      }

      // 添加一些细微的渐变效果
      const gradient = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        0,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.7
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.5)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ background: '#ffffff' }}
    />
  );
};

export default WaveBackground;
