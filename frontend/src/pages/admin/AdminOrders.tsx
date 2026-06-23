import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAdminOrders, confirmPayment } from '../../api';
import type { Order } from '../../types';

const AdminOrders = () => {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await getAdminOrders({
        status: statusFilter || undefined,
        pageSize: 50,
      });
      if (res.data.success) {
        setOrders(res.data.orders || []);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (orderId: number) => {
    if (!confirm('确认该订单已支付吗？确认后会给用户增加次数')) {
      return;
    }

    setConfirmingId(orderId);
    try {
      const res = await confirmPayment(orderId);
      if (res.data.success) {
        fetchOrders();
      } else {
        alert(res.data.message || '操作失败');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失败');
    } finally {
      setConfirmingId(null);
    }
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '待确认',
      paid: '已支付',
      cancelled: '已取消',
    };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'text-yellow-400 bg-yellow-400/10',
      paid: 'text-green-400 bg-green-400/10',
      cancelled: 'text-gray-400 bg-gray-400/10',
    };
    return map[status] || 'text-gray-400 bg-gray-400/10';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">订单管理</h1>
          <p className="text-gray-400">共 {orders.length} 条订单</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              !statusFilter
                ? 'bg-white text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              statusFilter === 'pending'
                ? 'bg-yellow-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            待确认
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              statusFilter === 'paid'
                ? 'bg-green-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            已支付
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400">暂无订单</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">订单号</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">用户</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">套餐</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">金额</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">状态</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">时间</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-3 px-4 text-sm font-mono text-gray-300">
                    {order.order_no}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {order.user?.email || '-'}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {order.credits} 次
                  </td>
                  <td className="py-3 px-4 text-sm font-medium">
                    ¥{order.amount}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(order.status)}`}>
                      {getStatusText(order.status)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-400">
                    {new Date(order.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="py-3 px-4">
                    {order.status === 'pending' && (
                      <button
                        onClick={() => handleConfirm(order.id)}
                        disabled={confirmingId === order.id}
                        className="text-sm text-green-400 hover:text-green-300 transition-colors"
                      >
                        {confirmingId === order.id ? '确认中...' : '确认支付'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
