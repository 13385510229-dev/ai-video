import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { createOrder, verifyOrder } from '../api';
import type { Package } from '../types';
import FriendlyErrorBox from '../components/FriendlyErrorBox';
import { formatError } from '../utils/errors';
import type { FriendlyError } from '../utils/errors';

// 次卡套餐
const creditPackages: Package[] = [
  { id: 1, name: '体验套餐', credits: 10, amount: 9.9 },
  { id: 2, name: '标准套餐', credits: 30, amount: 19.9 },
  { id: 3, name: '专业套餐', credits: 100, amount: 49.9 },
];

// 会员套餐
interface MembershipPackage {
  id: number;
  name: string;
  type: 'membership';
  membership_type: string;
  amount: number;
  daily_credits: number;
  duration_days: number;
  tag?: string;
}

const membershipPackages: MembershipPackage[] = [
  { 
    id: 10, 
    name: '月卡会员', 
    type: 'membership',
    membership_type: 'monthly',
    amount: 29, 
    daily_credits: 5, 
    duration_days: 30,
  },
  { 
    id: 11, 
    name: '季卡会员', 
    type: 'membership',
    membership_type: 'quarterly',
    amount: 69, 
    daily_credits: 8, 
    duration_days: 90,
    tag: '推荐',
  },
  { 
    id: 12, 
    name: '年卡会员', 
    type: 'membership',
    membership_type: 'yearly',
    amount: 199, 
    daily_credits: 12, 
    duration_days: 365,
    tag: '最划算',
  },
];

const Recharge = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, setUser, refreshUser } = useAuthStore();
  const [selectedPackage, setSelectedPackage] = useState<Package | MembershipPackage | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [success, setSuccess] = useState(false);
  const [payUrl, setPayUrl] = useState('');
  const [paymentMode, setPaymentMode] = useState('manual');

  // 检查 URL 里的成功参数（易支付同步跳转）
  useEffect(() => {
    const successParam = searchParams.get('success');
    const orderParam = searchParams.get('order');
    
    if (successParam === '1' && orderParam) {
      setOrderNo(orderParam);
      
      // 显示支付状态页面，让用户看到反馈
      setShowPayment(true);
      setChecking(true);
      
      // 轮询查询订单状态（最多轮询 5 次，每次间隔 3 秒）
      let attempts = 0;
      const maxAttempts = 5;
      
      const pollOrder = async () => {
        if (attempts >= maxAttempts) {
          setChecking(false);
          return;
        }
        
        try {
          const res = await verifyOrder(orderParam);
          if (res.data.success && res.data.order?.status === 'paid') {
            setSuccess(true);
            await refreshUser();
            setChecking(false);
            return;
          }
        } catch (e) {
          console.error('轮询查询订单失败:', e);
        }
        
        attempts++;
        setTimeout(pollOrder, 3000);
      };
      
      // 延迟 2 秒后开始轮询（给回调一点时间）
      setTimeout(pollOrder, 2000);
    }
  }, [searchParams, refreshUser]);

  // 判断是不是会员套餐
  const isMembershipPackage = (pkg: any): pkg is MembershipPackage => {
    return pkg && pkg.type === 'membership';
  };

  const handleCreateOrder = async () => {
    if (!selectedPackage) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '请先选择一个套餐',
        detail: '点击上面的任意一个套餐卡片先选中它，\n然后再点底部的「立即购买」按钮。',
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await createOrder(selectedPackage.id);
      if (res.data.success) {
        setOrderNo(res.data.order.order_no);
        setPaymentMode(res.data.paymentMode || 'manual');

        // 易支付模式，直接跳转到支付页面
        if (res.data.paymentMode === 'epay' && res.data.payUrl) {
          window.location.href = res.data.payUrl;
          return;
        }

        setShowPayment(true);
      } else {
        setError(formatError(res.data, '创建订单失败'));
      }
    } catch (err: any) {
      setError(formatError(err, '创建订单失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckPayment = async () => {
    if (!orderNo) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '缺少订单号',
        detail: '没有订单号无法查询支付状态。\n请回到上一步，重新选择套餐并下单。',
      });
      return;
    }

    setChecking(true);
    setError(null);

    try {
      const res = await verifyOrder(orderNo);
      if (res.data.success && res.data.order?.status === 'paid') {
        setSuccess(true);
        // 刷新用户信息（会员状态或余额）
        await refreshUser();
      } else {
        const status = res.data.order?.status;
        const statusText: Record<string, string> = {
          pending: '我们还在等支付回调，可能你刚付完款银行还没通知。',
          failed: '这笔订单之前支付失败了，建议换个方式重新下单。',
          cancelled: '这笔订单已经取消了，无法再查询。请重新选择套餐下单。',
        };
        setError({
          category: 'PAYMENT_FAILED',
          title: '尚未收到支付确认',
          detail:
            '你扫码付款成功了，但系统这边暂时还没收到到账通知。\n' +
            (status
              ? `当前订单状态：${statusText[status] || status}`
              : '请耐心等待 1~2 分钟，然后再点击查询一次。\n如果几分钟后还是这个结果，请联系管理员手动确认。'),
        });
      }
    } catch (err: any) {
      setError(formatError(err, '查询订单失败'));
    } finally {
      setChecking(false);
    }
  };

  if (showPayment) {
    return (
      <div className="max-w-md mx-auto px-6 py-12 animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 text-gray-900">扫码支付</h1>
          <p className="text-gray-500">
            {selectedPackage?.name}
            {!isMembershipPackage(selectedPackage) && ` · ${selectedPackage?.credits} 次`}
            {isMembershipPackage(selectedPackage) && ` · 每天${selectedPackage.daily_credits}次`}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="text-5xl font-bold mb-6 text-gray-900">
            ¥{selectedPackage?.amount}
          </div>

          {/* 收款码 */}
          <div className="w-48 h-48 mx-auto bg-gray-50 rounded-lg flex items-center justify-center mb-6 overflow-hidden border border-gray-100">
            <img 
              src="/payment-qr.jpg" 
              alt="收款码" 
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden text-gray-400 text-sm text-center px-4">
              收款码加载失败
              <br />
              <span className="text-xs">请联系管理员</span>
            </div>
          </div>

          <p className="text-sm text-gray-500 mb-6">
            订单号：{orderNo}
          </p>

          {success ? (
            <div className="mb-6">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-600 mb-4">
                <div className="text-xl font-bold mb-2">支付成功！</div>
                <div className="text-sm">
                  {isMembershipPackage(selectedPackage) 
                    ? '会员已开通，快去体验吧！' 
                    : `已充值 ${selectedPackage?.credits} 次`}
                </div>
              </div>
              <button
                onClick={() => navigate('/')}
                className="w-full px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors mb-3"
              >
                开始创作
              </button>
              <button
                onClick={() => {
                  setSuccess(false);
                  setShowPayment(false);
                  setSelectedPackage(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors w-full text-center"
              >
                继续充值
              </button>
            </div>
          ) : (
            <>
              {error && (
                <FriendlyErrorBox
                  error={error}
                  onRetry={() => handleCheckPayment()}
                  onDismiss={() => setError(null)}
                  className="mb-4"
                />
              )}

              <button
                onClick={handleCheckPayment}
                disabled={checking}
                className="w-full px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors mb-3 disabled:opacity-50"
                title="付款成功后点这里刷新订单状态"
              >
                {checking ? '查询中...' : '我已支付，查询'}
              </button>

              <button
                onClick={() => setShowPayment(false)}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                返回选择套餐
              </button>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              手动支付说明：扫码付款后，请联系管理员确认到账，或点击上方按钮查询
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4 text-gray-900 tracking-tight">充值套餐</h1>
        <p className="text-gray-500 text-lg">选择适合你的套餐，开始创作</p>
      </div>

      {/* 会员套餐 */}
      <div className="mb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">会员套餐</h2>
          <p className="text-gray-500">每天送次数，更划算，适合高频使用</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {membershipPackages.map((pkg, index) => (
            <div
              key={pkg.id}
              onClick={() => setSelectedPackage(pkg)}
              className={`cursor-pointer transition-all hover:-translate-y-2 animate-slide-up rounded-2xl p-8 border-2 relative ${
                selectedPackage?.id === pkg.id
                  ? 'border-gray-900 bg-gray-50 shadow-xl'
                  : 'border-gray-200 bg-white hover:border-gray-300 shadow-sm hover:shadow-md'
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {pkg.tag && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gray-900 text-white text-xs font-medium rounded-full">
                  {pkg.tag}
                </div>
              )}
              
              <div className="text-center">
                <h3 className="text-xl font-semibold mb-2 text-gray-900">{pkg.name}</h3>
                <div className="text-5xl font-bold mb-2 text-gray-900">
                  ¥{pkg.amount}
                </div>
                <p className="text-gray-500 mb-6">
                  每天 {pkg.daily_credits} 次 · 有效期 {pkg.duration_days} 天
                </p>
                <div className="text-sm text-gray-500 space-y-2">
                  <p>每日自动重置次数</p>
                  <p>优先扣每日次数</p>
                  <p>视频图片通用</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 次卡套餐 */}
      <div className="mb-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">次卡套餐</h2>
          <p className="text-gray-500">按需购买，永久有效，适合偶尔使用</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {creditPackages.map((pkg, index) => (
            <div
              key={pkg.id}
              onClick={() => setSelectedPackage(pkg)}
              className={`cursor-pointer transition-all hover:-translate-y-2 animate-slide-up rounded-2xl p-8 border-2 ${
                selectedPackage?.id === pkg.id
                  ? 'border-gray-900 bg-gray-50 shadow-xl'
                  : 'border-gray-200 bg-white hover:border-gray-300 shadow-sm hover:shadow-md'
              }`}
              style={{ animationDelay: `${(index + 3) * 0.1}s` }}
            >
              <div className="text-center">
                <h3 className="text-xl font-semibold mb-4 text-gray-900">{pkg.name}</h3>
                <div className="text-5xl font-bold mb-4 text-gray-900">
                  ¥{pkg.amount}
                </div>
                <p className="text-gray-500 mb-6">
                  共 {pkg.credits} 次生成机会
                </p>
                <div className="text-sm text-gray-500 space-y-2">
                  <p>高清视频生成</p>
                  <p>多种风格可选</p>
                  <p>永久有效</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-6">
          <FriendlyErrorBox
            error={error}
            onRetry={() => handleCreateOrder()}
            onDismiss={() => setError(null)}
          />
        </div>
      )}

      <div className="text-center">
        <button
          onClick={handleCreateOrder}
          disabled={loading || !selectedPackage}
          className="px-12 py-4 bg-gray-900 text-white rounded-lg font-medium text-lg hover:bg-gray-800 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          title={
            !selectedPackage
              ? '请先点击上面的任意一个套餐卡片选中它'
              : loading
                ? '正在创建订单，请稍候...'
                : '点击创建订单并跳转到支付'
          }
        >
          {loading ? '处理中...' : '立即购买'}
        </button>
      </div>

      <div className="mt-12 text-center text-sm text-gray-400">
        <p>虚拟商品，一经充值不支持退款</p>
        <p className="mt-1">如有问题请联系客服</p>
      </div>
    </div>
  );
};

export default Recharge;
