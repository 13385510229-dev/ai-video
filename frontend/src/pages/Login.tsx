import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import WaveBackground from '../components/WaveBackground';

const Login = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const navigate = useNavigate();
  const { setToken, setUser, isLoggedIn } = useAuthStore();

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/');
    }
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('请输入邮箱地址');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (data.success) {
        setStep(2);
        setCountdown(60);
      } else {
        setError(data.error || '发送失败，请重试');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!code) {
      setError('请输入验证码');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();

      if (data.success && data.token) {
        setToken(data.token);
        setUser(data.user);
        navigate('/video');
      } else {
        setError(data.error || '验证失败，请重试');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <WaveBackground />

      {/* 主内容 */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* 返回首页 */}
        <Link
          to="/"
          className="absolute top-8 left-8 text-gray-400 hover:text-gray-600 text-sm transition-colors flex items-center gap-2"
        >
          <span>←</span>
          返回首页
        </Link>

        {/* 登录卡片 */}
        <div className="w-full max-w-md">
          {/* 顶部标签 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-6 text-gray-400 text-xs font-medium tracking-widest uppercase">
              <span className="w-6 h-px bg-gray-200"></span>
              欢迎回来
              <span className="w-6 h-px bg-gray-200"></span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
              登录账户
            </h1>
          </div>

          {/* 卡片 */}
          <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
            {step === 1 ? (
              <form onSubmit={handleSendCode} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    邮箱地址
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入你的邮箱"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-300 focus:bg-white transition-all"
                  />
                </div>

                {error && (
                  <div className="text-red-500 text-sm text-center animate-shake">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '发送中...' : '发送验证码'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    验证码
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="请输入6位验证码"
                    maxLength={6}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-300 focus:bg-white transition-all text-center text-2xl tracking-widest font-mono"
                  />
                </div>

                <div className="text-center text-sm text-gray-400">
                  验证码已发送至{' '}
                  <span className="text-gray-600 font-medium">{email}</span>
                </div>

                {error && (
                  <div className="text-red-500 text-sm text-center animate-shake">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '登录中...' : '登录'}
                </button>

                {countdown > 0 ? (
                  <div className="text-center text-sm text-gray-400">
                    {countdown} 秒后可重新发送
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    重新发送验证码
                  </button>
                )}
              </form>
            )}
          </div>

          {/* 底部说明 */}
          <p className="text-center text-xs text-gray-400 mt-8">
            登录即表示你同意我们的{' '}
            <Link to="/terms" className="text-gray-500 hover:text-gray-700 underline">
              用户协议
            </Link>{' '}
            和{' '}
            <Link to="/privacy" className="text-gray-500 hover:text-gray-700 underline">
              隐私政策
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
