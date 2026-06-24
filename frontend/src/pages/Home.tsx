import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ParticleBackground from '../components/ParticleBackground';
import { useAuthStore } from '../store/auth';

const navItems = [
  { id: 'video', label: '视频生成', path: '/video' },
  { id: 'image', label: '图片生成', path: '/image' },
  { id: 'history', label: '创作历史', path: '/history' },
  { id: 'profile', label: '个人中心', path: '/profile' },
];

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [rotation, setRotation] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 自动旋转
  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => prev + 0.2);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const handleNavClick = (path: string) => {
    navigate(path);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      <ParticleBackground />

      {/* 主内容 */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* 标题 */}
        <div className="text-center mb-20 animate-fade-in">
          <h1 className="text-7xl md:text-8xl font-bold mb-6 tracking-tight text-white">
            AI 创意工坊
          </h1>
          <p className="text-gray-400 text-xl max-w-2xl mx-auto font-light">
            用 AI 释放你的创造力
          </p>
          {user && (
            <p className="text-gray-500 mt-6 text-sm">
              剩余次数：<span className="text-white font-medium">{user.balance}</span> 次
            </p>
          )}
        </div>

        {/* 3D 圆环导航 */}
        <div
          className="relative w-96 h-96 md:w-[500px] md:h-[500px]"
          style={{ perspective: '1200px' }}
        >
          <div
            className="relative w-full h-full"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateX(65deg) rotateZ(${rotation}deg)`,
              transition: 'transform 0.1s linear',
            }}
          >
            {navItems.map((item, index) => {
              const angle = (index / navItems.length) * Math.PI * 2;
              const radius = 200;
              const x = Math.cos(angle) * radius;
              const z = Math.sin(angle) * radius;
              const isHovered = hoveredId === item.id;

              return (
                <div
                  key={item.id}
                  className="absolute left-1/2 top-1/2 cursor-pointer"
                  style={{
                    transform: `translate(-50%, -50%) translate3d(${x}px, 0, ${z}px) rotateX(-65deg) rotateZ(${-rotation}deg)`,
                    transformStyle: 'preserve-3d',
                  }}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleNavClick(item.path)}
                >
                  {/* 玻璃小球 */}
                  <div
                    className={`relative w-28 h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isHovered ? 'scale-125' : 'scale-100'
                    }`}
                    style={{
                      background: isHovered
                        ? 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))'
                        : 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01))',
                      backdropFilter: 'blur(20px)',
                      border: isHovered
                        ? '1px solid rgba(255, 255, 255, 0.4)'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: isHovered
                        ? '0 0 60px rgba(255, 255, 255, 0.15), inset 0 0 40px rgba(255, 255, 255, 0.05)'
                        : '0 0 30px rgba(255, 255, 255, 0.05), inset 0 0 20px rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    {/* 高光 */}
                    <div
                      className="absolute top-3 left-6 w-10 h-5 rounded-full"
                      style={{
                        background: 'radial-gradient(ellipse, rgba(255, 255, 255, 0.3), transparent)',
                      }}
                    />
                    <span
                      className={`text-sm font-medium tracking-wide transition-all duration-300 ${
                        isHovered ? 'text-white' : 'text-gray-300'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>

                  {/* 悬停时的光晕 */}
                  {isHovered && (
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1), transparent 70%)',
                        transform: 'scale(2)',
                        animation: 'pulse-glow 2s ease-in-out infinite',
                      }}
                    />
                  )}
                </div>
              );
            })}

            {/* 圆环轨道 */}
            <div
              className="absolute left-1/2 top-1/2 w-[400px] h-[400px] md:w-[440px] md:h-[440px] rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 0 40px rgba(255, 255, 255, 0.03), inset 0 0 40px rgba(255, 255, 255, 0.02)',
              }}
            />

            {/* 内圈轨道 */}
            <div
              className="absolute left-1/2 top-1/2 w-[280px] h-[280px] md:w-[300px] md:h-[300px] rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{
                border: '1px solid rgba(255, 255, 255, 0.04)',
              }}
            />
          </div>
        </div>

        {/* 底部提示 */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-gray-600 text-xs tracking-widest uppercase">
          移动鼠标与粒子互动
        </div>
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; transform: scale(1.8); }
          50% { opacity: 1; transform: scale(2.3); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 1s ease-out;
        }
      `}</style>
    </div>
  );
};

export default Home;
