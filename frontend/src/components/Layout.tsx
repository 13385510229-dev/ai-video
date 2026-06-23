import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

const Layout = () => {
  const { user, isLoggedIn, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: '视频生成' },
    { path: '/history', label: '视频历史' },
    { path: '/image-generate', label: '图片生成' },
    { path: '/image-history', label: '图片历史' },
    { path: '/recharge', label: '充值' },
    { path: '/profile', label: '个人中心' },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold tracking-tight">
            AI<span className="text-gray-400">Video</span>
          </Link>

          {isLoggedIn && (
            <div className="flex items-center gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm transition-colors ${
                    location.pathname === item.path
                      ? 'text-white font-medium'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-400">
                  剩余 <span className="text-white font-medium">{user?.balance || 0}</span> 次
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  退出
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-sm text-white hover:text-gray-300 transition-colors"
              >
                登录
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* 主内容 */}
      <main className="pt-20 pb-12">
        <Outlet />
      </main>

      {/* 页脚 */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500 text-sm">
          © 2024 AI Video Generator. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default Layout;
