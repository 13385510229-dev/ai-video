import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number;
  size: number;
  opacity: number;
  originalX: number;
  originalY: number;
  originalZ: number;
}

interface BgParticle {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speedX: number;
  speedY: number;
}

const ParticleBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const bgParticlesRef = useRef<BgParticle[]>([]);
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
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ========== 中心编织粒子 ==========
    const particles: Particle[] = [];
    
    const R = 180; // 主半径
    const r = 80;  // 管半径
    const twists = 3; // 扭曲次数
    const particleCount = 2500; // 粒子数量

    for (let i = 0; i < particleCount; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI * 2;
      
      const twistAngle = u * twists;
      const radius = R + r * Math.cos(v + twistAngle * 0.5);
      
      const x = radius * Math.cos(u);
      const y = radius * Math.sin(u) * 0.6;
      const z = r * Math.sin(v + twistAngle * 0.5) + Math.sin(u * 2) * 20;

      const noise = (Math.random() - 0.5) * 3;

      particles.push({
        x: x + noise,
        y: y + noise,
        z: z + noise,
        size: Math.random() * 1 + 0.5,
        opacity: Math.random() * 0.5 + 0.3,
        originalX: x,
        originalY: y,
        originalZ: z,
      });
    }

    // 外层散点
    for (let i = 0; i < 300; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const radius = 250 + Math.random() * 80;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta) * 0.6;
      const z = radius * Math.cos(phi);

      particles.push({
        x,
        y,
        z,
        size: Math.random() * 0.8 + 0.3,
        opacity: Math.random() * 0.2 + 0.1,
        originalX: x,
        originalY: y,
        originalZ: z,
      });
    }

    particlesRef.current = particles;

    // ========== 全屏背景粒子（四边也有） ==========
    const bgParticles: BgParticle[] = [];
    const bgParticleCount = 200; // 全屏200个散点

    for (let i = 0; i < bgParticleCount; i++) {
      bgParticles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.3 + 0.1,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
      });
    }

    bgParticlesRef.current = bgParticles;

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

      timeRef.current += 0.005;

      // 黑色背景
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ========== 绘制全屏背景粒子 ==========
      for (const p of bgParticlesRef.current) {
        // 移动
        p.x += p.speedX;
        p.y += p.speedY;

        // 边界循环
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // 鼠标靠近时变亮
        let brightness = p.opacity;
        if (mouseRef.current.active) {
          const dx = mouseRef.current.x - p.x;
          const dy = mouseRef.current.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            brightness = p.opacity + (1 - dist / 150) * 0.5;
          }
        }

        // 绘制粒子
        const gradient = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          p.size * 3
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${brightness})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, brightness + 0.2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ========== 绘制中心编织粒子 ==========
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const fov = 500;

      let rotX = 0.3;
      let rotY = timeRef.current;
      
      if (mouseRef.current.active) {
        const dx = (mouseRef.current.x - centerX) / centerX;
        const dy = (mouseRef.current.y - centerY) / centerY;
        rotY += dx * 0.5;
        rotX += dy * 0.3;
      }

      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      const projected: {
        x: number;
        y: number;
        z: number;
        size: number;
        opacity: number;
      }[] = [];

      for (const particle of particlesRef.current) {
        let x = particle.originalX;
        let y = particle.originalY;
        let z = particle.originalZ;

        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;

        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        const scale = fov / (fov + z2 + 300);
        const projX = centerX + x1 * scale;
        const projY = centerY + y2 * scale;
        const projSize = particle.size * scale;
        const projOpacity = particle.opacity * scale;

        projected.push({
          x: projX,
          y: projY,
          z: z2,
          size: projSize,
          opacity: Math.min(1, projOpacity),
        });
      }

      projected.sort((a, b) => a.z - b.z);

      for (const p of projected) {
        if (p.opacity < 0.02) continue;

        const gradient = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          p.size * 3
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${p.opacity})`);
        gradient.addColorStop(0.5, `rgba(255, 255, 255, ${p.opacity * 0.3})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, p.opacity + 0.2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
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
