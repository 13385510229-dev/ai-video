import { useNavigate } from 'react-router-dom';
import WaveBackground from '../components/WaveBackground';
import { useAuthStore } from '../store/auth';

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const handleStart = () => {
    if (user) {
      navigate('/video');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <WaveBackground />

      {/* 主内容 */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* 内容区域 */}
        <div className="text-center max-w-4xl mx-auto">
          {/* 顶部小字标签 */}
          <div className="inline-flex items-center gap-2 mb-8 text-gray-500 text-sm font-medium tracking-widest uppercase">
            <span className="w-8 h-px bg-gray-300"></span>
            AI 创意生成平台
            <span className="w-8 h-px bg-gray-300"></span>
          </div>

          {/* 大标题 */}
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold mb-8 tracking-tight text-gray-900 leading-tight">
            释放你的
            <br />
            <span className="text-gray-400">创意想象力</span>
          </h1>

          {/* 描述文字 */}
          <p className="text-gray-500 text-lg md:text-xl max-w-2xl mx-auto mb-12 font-light leading-relaxed">
            一键生成 AI 视频和图片，无需专业技能，
            <br className="hidden md:block" />
            让每个人都能轻松创作出惊艳的视觉作品
          </p>

          {/* 按钮组 */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <button
              onClick={handleStart}
              className="px-8 py-4 bg-gray-900 text-white text-sm font-medium tracking-wide rounded-full hover:bg-gray-800 transition-all duration-300 hover:shadow-lg hover:shadow-gray-900/20"
            >
              开始创作
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-4 border border-gray-200 text-gray-700 text-sm font-medium tracking-wide rounded-full hover:border-gray-300 hover:bg-gray-50 transition-all duration-300"
            >
              了解更多
            </button>
          </div>

          {/* 特性标签 */}
          <div className="flex flex-wrap items-center justify-center gap-6 mb-16 text-xs text-gray-400 font-medium tracking-wider uppercase">
            <span>✨ 视频生成</span>
            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
            <span>🖼️ 图片生成</span>
            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
            <span>⚡ 快速出图</span>
            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
            <span>🎨 多种风格</span>
          </div>

          {/* 统计数据 */}
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-12 border-t border-gray-100">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">320+</div>
              <div className="text-xs text-gray-400 tracking-wider uppercase">已生成作品</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">8s</div>
              <div className="text-xs text-gray-400 tracking-wider uppercase">平均生成时间</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">120+</div>
              <div className="text-xs text-gray-400 tracking-wider uppercase">活跃用户</div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部小字 */}
      <div className="absolute bottom-8 left-0 right-0 text-center text-xs text-gray-300 z-10">
        移动鼠标与波浪互动
      </div>
    </div>
  );
};

export default Home;
