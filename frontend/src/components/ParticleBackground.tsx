import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  baseX: number;
  baseY: number;
  baseZ: number;
}

const ParticleBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const animationRef = useRef<number>();
  const rotationRef = useRef({ x: 0, y: 0 });

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

    // 生成螺旋粒子
    const particleCount = 200;
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      // 螺旋形状
      const angle = (i / particleCount) * Math.PI * 8;
      const radius = 150 + (i / particleCount) * 100;
      const y = (i / particleCount - 0.5) * 300;

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
        baseX: x,
        baseY: y,
        baseZ: z,
      });
    }

    particlesRef.current = particles;

    // 鼠标事件
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    // 3D 投影
    const project = (x: number, y: number, z: number) => {
      const fov = 500;
      const scale = fov / (fov + z);
      return {
        x: x * scale + canvas.width / 2,
        y: y * scale + canvas.height / 2,
        scale,
      };
    };

    // 旋转点
    const rotatePoint = (x: number, y: number, z: number, rx: number, ry: number) => {
      // 绕 Y 轴旋转
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      // 绕 X 轴旋转
      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const y1 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      return { x: x1, y: y1, z: z2 };
    };

    // 动画循环
    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 缓慢自动旋转
      rotationRef.current.y += 0.003;
      rotationRef.current.x = Math.sin(Date.now() * 0.0003) * 0.2;

      // 鼠标影响旋转
      if (mouseRef.current.active) {
        rotationRef.current.y += mouseRef.current.x * 0.01;
        rotationRef.current.x += mouseRef.current.y * 0.005;
      }

      const projected: { x: number; y: number; z: number; scale: number; size: number }[] = [];

      // 更新粒子
      particlesRef.current.forEach((p) => {
        // 鼠标吸引效果
        if (mouseRef.current.active) {
          const mouseX = mouseRef.current.x * 200;
          const mouseY = mouseRef.current.y * 200;
          const mouseZ = 0;

          const dx = mouseX - p.x;
          const dy = mouseY - p.y;
          const dz = mouseZ - p.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < 200) {
            const force = (200 - dist) / 200 * 0.5;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
            p.vz += (dz / dist) * force;
          }
        }

        // 回到原位的弹力
        p.vx += (p.baseX - p.x) * 0.01;
        p.vy += (p.baseY - p.y) * 0.01;
        p.vz += (p.baseZ - p.z) * 0.01;

        // 阻尼
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.vz *= 0.95;

        // 更新位置
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        // 旋转
        const rotated = rotatePoint(p.x, p.y, p.z, rotationRef.current.x, rotationRef.current.y);

        // 投影
        const proj = project(rotated.x, rotated.y, rotated.z);
        projected.push({ ...proj, z: rotated.z, size: p.size });
      });

      // 按 z 排序，先画后面的
      projected.sort((a, b) => a.z - b.z);

      // 绘制连线（距离近的粒子）
      ctx.strokeStyle = 'rgba(100, 150, 255, 0.1)';
      ctx.lineWidth = 0.5;

      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x - projected[j].x;
          const dy = projected[i].y - projected[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 80) {
            const alpha = (1 - dist / 80) * 0.15;
            ctx.strokeStyle = `rgba(100, 150, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[j].x, projected[j].y);
            ctx.stroke();
          }
        }
      }

      // 绘制粒子
      projected.forEach((p) => {
        const size = p.size * p.scale;

        // 计算粒子到鼠标的距离，改变颜色
        let color = `rgba(200, 220, 255, ${0.6 * p.scale})`;
        if (mouseRef.current.active) {
          const mouseX = canvas.width / 2 + mouseRef.current.x * 200 * p.scale;
          const mouseY = canvas.height / 2 + mouseRef.current.y * 200 * p.scale;
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            const intensity = 1 - dist / 150;
            color = `rgba(120, 100, 255, ${(0.6 + intensity * 0.4) * p.scale})`;

            // 发光效果
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3);
            gradient.addColorStop(0, `rgba(120, 100, 255, ${intensity * 0.8 * p.scale})`);
            gradient.addColorStop(1, 'rgba(120, 100, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
      style={{ background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000000 70%)' }}
    />
  );
};

export default ParticleBackground;
