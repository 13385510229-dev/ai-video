import { useState, useEffect } from 'react';
import { getAdminStats } from '../../api';
import type { Stats } from '../../types';

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await getAdminStats();
      if (res.data.success) {
        setStats(res.data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
      </div>
    );
  }

  const statCards = [
    { label: '总用户数', value: stats?.totalUsers || 0, icon: '👥' },
    { label: '总订单数', value: stats?.totalOrders || 0, icon: '📋' },
    { label: '已支付订单', value: stats?.totalPaid || 0, icon: '✅' },
    { label: '待确认订单', value: stats?.totalPending || 0, icon: '⏳' },
    { label: '总营收', value: `¥${stats?.totalRevenue || '0.00'}`, icon: '💰' },
    { label: '总生成次数', value: stats?.totalVideos || 0, icon: '🎬' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">仪表盘</h1>
        <p className="text-gray-400">平台数据概览</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {statCards.map((card, index) => (
          <div
            key={card.label}
            className="card animate-slide-up"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">{card.label}</p>
                <p className="text-3xl font-bold">{card.value}</p>
              </div>
              <div className="text-4xl">{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">快速操作</h2>
          <div className="grid grid-cols-2 gap-4">
            <a
              href="/admin/orders?status=pending"
              className="p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-center"
            >
              <div className="text-2xl mb-1">⏳</div>
              <span className="text-sm">待确认订单</span>
            </a>
            <a
              href="/admin/users"
              className="p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-center"
            >
              <div className="text-2xl mb-1">👥</div>
              <span className="text-sm">用户管理</span>
            </a>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">系统提示</h2>
          <div className="text-sm text-gray-400 space-y-2">
            <p>• 待确认订单需要管理员手动确认支付</p>
            <p>• 确认支付后会自动给用户增加次数</p>
            <p>• 可以在用户管理中手动调整用户余额</p>
            <p>• 管理员密码请通过环境变量修改</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
