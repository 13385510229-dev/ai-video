import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ParticleBackground from '../components/ParticleBackground';
import { useAuthStore } from '../store/auth';

const navItems = [
  { id: 'video', label: '视频生成', icon: '🎬', path: '/video' },
  { id: 'image', label: '图片生成', icon: '🖼️', path: '/image' },
  { id: 'history', label: '创作历史', icon: '📜', path: '/history' },
  { id: 'profile', label: '个人中心', icon: '👤', path: '/profile' },
];

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [rotation, setRotation] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 自动旋转
  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => prev + 0.3);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const handleNavClick = (path: string) => {
    navigate(path);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <ParticleBackground />

      {/* 主内容 */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* 标题 */}
        <div className="text-center mb-16 animate-fade-in">
          <h1 className="text-6xl md:text-7xl font-bold mb-6 tracking-tight">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              AI 创意工坊
            </span>
          </h1>
          <p className="text-gray-400 text-xl max-w-2xl mx-auto">
            用 AI 释放你的创造力，一键生成专业级视频与图片
          </p>
          {user && (
            <p className="text-gray-500 mt-4 text-sm">
              剩余次数：<span className="text-blue-400 font-semibold">{user.balance}</span> 次
            </p>
          )}
        </div>

        {/* 3D 圆环导航 */}
        <div
          className="relative w-96 h-96 md:w-[500px] md:h-[500px]"
          style={{ perspective: '1000px' }}
        >
          <div
            className="relative w-full h-full"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateX(60deg) rotateZ(${rotation}deg)`,
              transition: 'transform 0.1s linear',
            }}
          >
            {navItems.map((item, index) => {
              const angle = (index / navItems.length) * Math.PI * 2;
              const radius = 180;
              const x = Math.cos(angle) * radius;
              const z = Math.sin(angle) * radius;
              const isHovered = hoveredId === item.id;

              return (
                <div
                  key={item.id}
                  className="absolute left-1/2 top-1/2 cursor-pointer"
                  style={{
                    transform: `translate(-50%, -50%) translate3d(${x}px, 0, ${z}px) rotateX(-60deg) rotateZ(${-rotation}deg)`,
                    transformStyle: 'preserve-3d',
                  }}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleNavClick(item.path)}
                >
                  {/* 玻璃小球 */}
                  <div
                    className={`relative w-24 h-24 md:w-28 md:h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 ${
                      isHovered ? 'scale-125' : 'scale-100'
                    }`}
                    style={{
                      background: isHovered
                        ? 'radial-gradient(circle at 30% 30%, rgba(150, 180, 255, 0.4), rgba(80, 100, 200, 0.2), rgba(50, 50, 100, 0.3))'
                        : 'radial-gradient(circle at 30% 30%, rgba(200, 220, 255, 0.2), rgba(100, 120, 200, 0.1), rgba(30, 30, 60, 0.2))',
                      backdropFilter: 'blur(10px)',
                      border: isHovered
                        ? '1px solid rgba(150, 180, 255, 0.6)'
                        : '1px solid rgba(150, 180, 255, 0.2)',
                      boxShadow: isHovered
                        ? '0 0 40px rgba(100, 120, 255, 0.5), inset 0 0 30px rgba(150, 180, 255, 0.2)'
                        : '0 0 20px rgba(100, 120, 255, 0.2), inset 0 0 20px rgba(150, 180, 255, 0.1)',
                    }}
                  >
                    {/* 高光 */}
                    <div
                      className="absolute top-2 left-4 w-8 h-4 rounded-full"
                      style={{
                        background: 'radial-gradient(ellipse, rgba(255, 255, 255, 0.4), transparent)',
                      }}
                    />
                    <span className="text-3xl mb-1">{item.icon}</span>
                    <span
                      className={`text-xs font-medium transition-all duration-300 ${
                        isHovered ? 'text-blue-200' : 'text-gray-300'
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
                        background: 'radial-gradient(circle, rgba(100, 120, 255, 0.3), transparent 70%)',
                        transform: 'scale(2)',
                        animation: 'pulse-glow 1.5s ease-in-out infinite',
                      }}
                    />
                  )}
                </div>
              );
            })}

            {/* 圆环轨道 */}
            <div
              className="absolute left-1/2 top-1/2 w-[360px] h-[360px] md:w-[400px] md:h-[400px] rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{
                border: '1px solid rgba(100, 120, 255, 0.15)',
                boxShadow: '0 0 30px rgba(100, 120, 255, 0.1), inset 0 0 30px rgba(100, 120, 255, 0.05)',
              }}
            />
          </div>
        </div>

        {/* 底部提示 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-gray-500 text-sm animate-pulse">
          移动鼠标与粒子互动 · 点击小球进入功能
        </div>
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; transform: scale(1.8); }
          50% { opacity: 0.8; transform: scale(2.2); }
        }
      `}</style>
    </div>
  );
};

export default Home;
