import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useState, useEffect } from 'react';
import WaveBackground from './WaveBackground';

const Layout = () => {
  const { user, isLoggedIn, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    
    // 内页使用浅色主题
    document.body.classList.add('light-theme');
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.body.classList.remove('light-theme');
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/video', label: '视频生成' },
    { path: '/history', label: '视频历史' },
    { path: '/image', label: '图片生成' },
    { path: '/image-history', label: '图片历史' },
    { path: '/recharge', label: '充值' },
    { path: '/profile', label: '个人中心' },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900 relative">
      <WaveBackground />
      
      {/* 导航栏 */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
        scrolled 
          ? 'bg-white/80 backdrop-blur-xl border-gray-200/50 py-3 shadow-lg shadow-gray-200/20' 
          : 'bg-white/60 backdrop-blur-md border-transparent py-4'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between transition-all duration-300">
          <Link to="/" className="text-2xl font-bold tracking-tight text-gray-900">
            AI<span className="text-gray-400">-HTY</span>
          </Link>

          {isLoggedIn && (
            <div className="flex items-center gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm transition-all duration-300 relative group ${
                    location.pathname === item.path
                      ? 'text-gray-900 font-medium'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                  <span className={`absolute -bottom-1 left-0 h-0.5 bg-gray-900 transition-all duration-300 ${
                    location.pathname === item.path ? 'w-full' : 'w-0 group-hover:w-full'
                  }`}></span>
                </Link>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-500">
                  剩余 <span className="text-gray-900 font-medium">{user?.balance || 0}</span> 次
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  退出
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-sm text-gray-900 hover:text-gray-600 transition-colors"
              >
                登录
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* 主内容 */}
      <main className="pt-20 pb-12 relative z-10">
        <Outlet />
      </main>

      {/* 页脚 */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-400 text-sm">
          © 2026 AI-HTY. All rights reserved.
          <div className="mt-2 space-x-6">
            <a href="/terms" className="hover:text-gray-300 transition-colors">服务条款</a>
            <a href="/privacy" className="hover:text-gray-300 transition-colors">隐私政策</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
