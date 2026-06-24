import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  opacity: number;
  originalX: number;
  originalY: number;
  originalZ: number;
}

const ParticleBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const animationRef = useRef<number>(0);
  const angleRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 初始化更多粒子（400个）
    const particleCount = 400;
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      // 螺旋分布
      const angle = (i / particleCount) * Math.PI * 8;
      const radius = 50 + (i / particleCount) * 200;
      const y = (i / particleCount - 0.5) * 400;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      particles.push({
        x,
        y,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.3,
        originalX: x,
        originalY: y,
        originalZ: z,
      });
    }

    particlesRef.current = particles;

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

      // 黑色背景
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 缓慢旋转角度
      angleRef.current += 0.002;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const fov = 500;

      // 更新和绘制粒子
      const projectedParticles: { x: number; y: number; size: number; opacity: number; z: number }[] = [];

      for (const particle of particlesRef.current) {
        // 鼠标吸引效果
        if (mouseRef.current.active) {
          const dx = mouseRef.current.x - centerX;
          const dy = mouseRef.current.y - centerY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const force = Math.max(0, 200 - distance) / 200;

          particle.vx += (dx / distance) * force * 0.5;
          particle.vy += (dy / distance) * force * 0.5;
        }

        // 回到原位的力
        particle.vx += (particle.originalX - particle.x) * 0.005;
        particle.vy += (particle.originalY - particle.y) * 0.005;
        particle.vz += (particle.originalZ - particle.z) * 0.005;

        // 阻尼
        particle.vx *= 0.95;
        particle.vy *= 0.95;
        particle.vz *= 0.95;

        // 更新位置
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.z += particle.vz;

        // 3D 旋转
        const cosA = Math.cos(angleRef.current);
        const sinA = Math.sin(angleRef.current);
        const rotatedX = particle.x * cosA - particle.z * sinA;
        const rotatedZ = particle.x * sinA + particle.z * cosA;

        // 透视投影
        const scale = fov / (fov + rotatedZ + 200);
        const projX = centerX + rotatedX * scale;
        const projY = centerY + particle.y * scale;
        const projSize = particle.size * scale;
        const projOpacity = particle.opacity * scale;

        projectedParticles.push({
          x: projX,
          y: projY,
          size: projSize,
          opacity: projOpacity,
          z: rotatedZ,
        });
      }

      // 按 z 排序，远的先画
      projectedParticles.sort((a, b) => a.z - b.z);

      // 绘制粒子连线（距离近的连起来）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;

      for (let i = 0; i < projectedParticles.length; i++) {
        for (let j = i + 1; j < projectedParticles.length; j++) {
          const p1 = projectedParticles[i];
          const p2 = projectedParticles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 80) {
            ctx.globalAlpha = (1 - dist / 80) * 0.1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;

      // 绘制粒子（白色）
      for (const particle of projectedParticles) {
        // 粒子发光效果
        const gradient = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          particle.size * 3
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${particle.opacity})`);
        gradient.addColorStop(0.5, `rgba(255, 255, 255, ${particle.opacity * 0.3})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 3, 0, Math.PI * 2);
        ctx.fill();

        // 粒子核心
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, particle.opacity + 0.3)})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }

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
      style={{ background: '#000000' }}
    />
  );
};

export default ParticleBackground;
