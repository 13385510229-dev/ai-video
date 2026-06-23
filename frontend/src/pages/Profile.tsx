import { useAuthStore } from '../store/auth';
import { Link } from 'react-router-dom';

const Profile = () => {
  const { user, logout } = useAuthStore();

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 animate-fade-in">
      <h1 className="text-3xl font-bold mb-8">个人中心</h1>

      <div className="card mb-6 animate-slide-up">
        <h2 className="text-lg font-semibold mb-6">账户信息</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-800">
            <span className="text-gray-400">邮箱</span>
            <span>{user?.email}</span>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-gray-800">
            <span className="text-gray-400">剩余次数</span>
            <span className="text-2xl font-bold">{user?.balance || 0}</span>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-gray-800">
            <span className="text-gray-400">注册时间</span>
            <span className="text-gray-300">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('zh-CN')
                : '-'}
            </span>
          </div>
        </div>
      </div>

      <div className="card mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <h2 className="text-lg font-semibold mb-4">快捷操作</h2>
        <div className="grid grid-cols-2 gap-4">
          <Link
            to="/"
            className="p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-center"
          >
            <div className="text-2xl mb-1">🎬</div>
            <span className="text-sm">生成视频</span>
          </Link>
          <Link
            to="/history"
            className="p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-center"
          >
            <div className="text-2xl mb-1">📁</div>
            <span className="text-sm">历史记录</span>
          </Link>
          <Link
            to="/recharge"
            className="p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-center"
          >
            <div className="text-2xl mb-1">💎</div>
            <span className="text-sm">充值次数</span>
          </Link>
          <button
            onClick={logout}
            className="p-4 bg-gray-800/50 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors text-center"
          >
            <div className="text-2xl mb-1">🚪</div>
            <span className="text-sm">退出登录</span>
          </button>
        </div>
      </div>

      <div className="card animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <h2 className="text-lg font-semibold mb-4">使用说明</h2>
        <div className="text-sm text-gray-400 space-y-2">
          <p>• 每次生成视频消耗 1-3 次，根据时长不同</p>
          <p>• 5秒视频消耗 1 次，10秒消耗 2 次，30秒消耗 3 次</p>
          <p>• 视频生成大约需要 5-10 分钟，请耐心等待</p>
          <p>• 生成过程中可以关闭页面，稍后在历史记录查看</p>
          <p>• 如有问题请联系管理员</p>
        </div>
      </div>
    </div>
  );
};

export default Profile;
