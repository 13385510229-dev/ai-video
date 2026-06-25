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
          <div className="flex justify-center">
            <button
              onClick={handleStart}
              className="px-10 py-4 bg-gray-900 text-white text-sm font-medium tracking-wide rounded-full hover:bg-gray-800 transition-all duration-300 hover:shadow-lg hover:shadow-gray-900/20"
            >
              开始创作
            </button>
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
