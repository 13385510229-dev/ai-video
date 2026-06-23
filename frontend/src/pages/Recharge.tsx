import { useState } from 'react';
import { createOrder, verifyOrder } from '../api';
import type { Package } from '../types';

const packages: Package[] = [
  { id: 1, name: '体验套餐', credits: 10, amount: 9.9 },
  { id: 2, name: '标准套餐', credits: 30, amount: 24.9 },
  { id: 3, name: '专业套餐', credits: 100, amount: 69.9 },
];

const Recharge = () => {
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleCreateOrder = async () => {
    if (!selectedPackage) return;

    setLoading(true);
    setError('');

    try {
      const res = await createOrder(selectedPackage.id);
      if (res.data.success) {
        setOrderNo(res.data.order.order_no);
        setShowPayment(true);
      } else {
        setError(res.data.message || '创建订单失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '创建订单失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckPayment = async () => {
    if (!orderNo) return;

    setChecking(true);
    setError('');

    try {
      const res = await verifyOrder(orderNo);
      if (res.data.success && res.data.order?.status === 'paid') {
        setSuccess(true);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setError('尚未收到支付，请稍后再试');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '查询失败，请稍后重试');
    } finally {
      setChecking(false);
    }
  };

  if (showPayment) {
    return (
      <div className="max-w-md mx-auto px-6 py-12 animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">扫码支付</h1>
          <p className="text-gray-400">
            {selectedPackage?.name} · {selectedPackage?.credits} 次
          </p>
        </div>

        <div className="card text-center">
          <div className="text-5xl font-bold mb-6">
            ¥{selectedPackage?.amount}
          </div>

          {/* 收款码占位 */}
          <div className="w-48 h-48 mx-auto bg-white rounded-lg flex items-center justify-center mb-6">
            <div className="text-gray-400 text-sm text-center px-4">
              收款码图片
              <br />
              <span className="text-xs">（配置 PAYMENT_QR_CODE 后显示）</span>
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-6">
            订单号：{orderNo}
          </p>

          {success ? (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 mb-6">
              ✅ 支付成功！正在刷新...
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
                  {error}
                </div>
              )}

              <button
                onClick={handleCheckPayment}
                disabled={checking}
                className="btn btn-primary w-full mb-3"
              >
                {checking ? '查询中...' : '我已支付，查询'}
              </button>

              <button
                onClick={() => setShowPayment(false)}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                返回选择套餐
              </button>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-xs text-gray-500">
              💡 手动支付说明：扫码付款后，请联系管理员确认到账，或点击上方按钮查询
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 animate-fade-in">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-3">充值套餐</h1>
        <p className="text-gray-400">选择适合你的套餐，开始创作</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {packages.map((pkg, index) => (
          <div
            key={pkg.id}
            onClick={() => setSelectedPackage(pkg)}
            className={`card cursor-pointer transition-all hover:scale-105 animate-slide-up ${
              selectedPackage?.id === pkg.id
                ? 'border-white bg-gray-900'
                : 'border-gray-800 hover:border-gray-600'
            }`}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-2">{pkg.name}</h3>
              <div className="text-4xl font-bold mb-2">
                ¥{pkg.amount}
              </div>
              <p className="text-gray-400 mb-6">
                共 {pkg.credits} 次生成机会
              </p>
              <div className="text-sm text-gray-500 space-y-1">
                <p>✓ 高清视频生成</p>
                <p>✓ 多种风格可选</p>
                <p>✓ 永久保存</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-center">
          {error}
        </div>
      )}

      <div className="text-center">
        <button
          onClick={handleCreateOrder}
          disabled={loading || !selectedPackage}
          className="btn btn-primary text-lg px-12 py-4"
        >
          {loading ? '处理中...' : '立即充值'}
        </button>
      </div>

      <div className="mt-12 text-center text-sm text-gray-500">
        <p>⚠️ 虚拟商品，一经充值不支持退款</p>
        <p className="mt-1">如有问题请联系客服</p>
      </div>
    </div>
  );
};

export default Recharge;
