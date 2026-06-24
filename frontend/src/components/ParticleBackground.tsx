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

const ParticleBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
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

    // 生成编织形状的粒子（参数化3D曲面）
    const particles: Particle[] = [];
    
    // 参数：生成一个扭曲的圆环面，类似编织效果
    const R = 180; // 主半径
    const r = 80;  // 管半径
    const twists = 3; // 扭曲次数
    const particleCount = 2500; // 粒子数量，非常密集

    for (let i = 0; i < particleCount; i++) {
      // 随机参数
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI * 2;
      
      // 扭曲的圆环面参数方程
      const twistAngle = u * twists;
      const radius = R + r * Math.cos(v + twistAngle * 0.5);
      
      const x = radius * Math.cos(u);
      const y = radius * Math.sin(u) * 0.6; // 稍微压扁一点
      const z = r * Math.sin(v + twistAngle * 0.5) + Math.sin(u * 2) * 20;

      // 再加一些随机偏移，让它更自然
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

    // 再加一些外层散点，增加层次感
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

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const fov = 500;

      // 鼠标影响旋转
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

      // 存储投影后的粒子
      const projected: {
        x: number;
        y: number;
        z: number;
        size: number;
        opacity: number;
      }[] = [];

      for (const particle of particlesRef.current) {
        // 3D 旋转（先绕Y轴，再绕X轴）
        let x = particle.originalX;
        let y = particle.originalY;
        let z = particle.originalZ;

        // 绕 Y 轴旋转
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;

        // 绕 X 轴旋转
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        // 透视投影
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

      // 按 z 排序，远的先画
      projected.sort((a, b) => a.z - b.z);

      // 绘制粒子
      for (const p of projected) {
        if (p.opacity < 0.02) continue;

        // 粒子发光
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

        // 粒子核心
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
