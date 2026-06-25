import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { Link } from 'react-router-dom';
import { exportUserData } from '../api';

const Profile = () => {
  const { user, logout } = useAuthStore();
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    try {
      const res = await exportUserData();
      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('导出数据失败:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 animate-fade-in">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">个人中心</h1>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 animate-slide-up shadow-sm">
        <h2 className="text-lg font-semibold mb-6 text-gray-900">账户信息</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-gray-500">邮箱</span>
            <span className="text-gray-900">{user?.email}</span>
          </div>

          {/* 会员状态 */}
          {user?.is_member ? (
            <>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">会员状态</span>
                <span className="text-green-600 font-medium flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  {user.membership_name || '会员'}
                </span>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">今日剩余</span>
                <span className="text-2xl font-bold text-gray-900">
                  {user.daily_credits_remaining || 0}
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    / {user.daily_credits_total || 0} 次
                  </span>
                </span>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">到期时间</span>
                <span className="text-gray-700">
                  {user.membership_expire_at
                    ? new Date(user.membership_expire_at).toLocaleDateString('zh-CN')
                    : '-'}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">会员状态</span>
              <span className="text-gray-400">未开通</span>
            </div>
          )}

          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-gray-500">余额次数</span>
            <span className="text-2xl font-bold text-gray-900">{user?.balance || 0}</span>
          </div>

          <div className="flex items-center justify-between py-3">
            <span className="text-gray-500">注册时间</span>
            <span className="text-gray-600">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('zh-CN')
                : '-'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 animate-slide-up shadow-sm" style={{ animationDelay: '0.1s' }}>
        <h2 className="text-lg font-semibold mb-4 text-gray-900">快捷操作</h2>
        <div className="grid grid-cols-2 gap-4">
          <Link
            to="/video"
            className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center text-gray-700"
          >
            <span className="text-sm">生成视频</span>
          </Link>
          <Link
            to="/image"
            className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center text-gray-700"
          >
            <span className="text-sm">生成图片</span>
          </Link>
          <Link
            to="/history"
            className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center text-gray-700"
          >
            <span className="text-sm">视频历史</span>
          </Link>
          <Link
            to="/image-history"
            className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center text-gray-700"
          >
            <span className="text-sm">图片历史</span>
          </Link>
          <Link
            to="/recharge"
            className="p-4 bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors text-center text-white"
          >
            <span className="text-sm font-medium">充值 / 会员</span>
          </Link>
          <button
            onClick={handleExportData}
            disabled={exporting}
            className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center text-gray-700"
          >
            <span className="text-sm">{exporting ? '导出中...' : '导出数据'}</span>
          </button>
          <button
            onClick={logout}
            className="p-4 bg-gray-50 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors text-center text-gray-700 col-span-2"
          >
            <span className="text-sm">退出登录</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 animate-slide-up shadow-sm" style={{ animationDelay: '0.2s' }}>
        <h2 className="text-lg font-semibold mb-4 text-gray-900">使用说明</h2>
        <div className="text-sm text-gray-500 space-y-2">
          <p>• 每次生成视频消耗 1-3 次，根据时长不同</p>
          <p>• 5秒视频消耗 1 次，10秒消耗 2 次，30秒消耗 3 次</p>
          <p>• 每次生成图片消耗 1 次</p>
          <p>• 会员优先扣每日次数，用完再扣余额</p>
          <p>• 每日次数每天凌晨自动重置</p>
          <p>• 视频生成大约需要 1-8 分钟，请耐心等待</p>
          <p>• 生成过程中可以关闭页面，稍后在历史记录查看</p>
          <p>• 如有问题请联系管理员</p>
        </div>
      </div>
    </div>
  );
};

export default Profile;
