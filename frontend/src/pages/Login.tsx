import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import ParticleBackground from '../components/ParticleBackground';

const Login = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1); // 1: 输入邮箱，2: 输入验证码
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const navigate = useNavigate();
  const { login, isLoggedIn } = useAuthStore();

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
        login(data.token, data.user);
        navigate('/');
      } else {
        setError(data.error || '验证码错误');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    if (countdown > 0) return;
    setStep(1);
    setCode('');
    setCountdown(0);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <ParticleBackground />

      {/* 主内容 */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* Logo 和标题 */}
        <div className="text-center mb-12 animate-fade-in">
          <Link to="/" className="text-4xl font-bold tracking-tight inline-block mb-6">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              AI 创意工坊
            </span>
          </Link>
          <p className="text-gray-400 text-lg">
            登录开启你的 AI 创作之旅
          </p>
        </div>

        {/* 登录框 */}
        <div
          className="w-full max-w-md p-8 rounded-2xl animate-slide-up"
          style={{
            background: 'rgba(20, 20, 40, 0.6)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(100, 120, 255, 0.2)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 60px rgba(100, 120, 255, 0.1)',
          }}
        >
          {step === 1 ? (
            <form onSubmit={handleSendCode} className="space-y-6">
              <div>
                <label className="block text-sm text-gray-300 mb-2">邮箱地址</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入你的邮箱"
                  className="w-full px-4 py-3 bg-black/40 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>

              {error && (
                <div className="text-red-400 text-sm text-center animate-shake">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-medium text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #6464ff 0%, #7c3aed 100%)',
                  boxShadow: '0 4px 20px rgba(100, 100, 255, 0.4)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    发送中...
                  </span>
                ) : (
                  '发送验证码'
                )}
              </button>

              <p className="text-center text-gray-500 text-xs">
                登录即表示同意 <a href="/terms" className="text-blue-400 hover:underline">服务条款</a> 和 <a href="/privacy" className="text-blue-400 hover:underline">隐私政策</a>
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-6">
              <div className="text-center mb-4">
                <p className="text-gray-400 text-sm">
                  验证码已发送至
                </p>
                <p className="text-white font-medium">{email}</p>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">验证码</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="请输入6位验证码"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-black/40 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-center text-2xl tracking-widest font-mono"
                />
              </div>

              {error && (
                <div className="text-red-400 text-sm text-center animate-shake">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-medium text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #6464ff 0%, #7c3aed 100%)',
                  boxShadow: '0 4px 20px rgba(100, 100, 255, 0.4)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    登录中...
                  </span>
                ) : (
                  '登录'
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={countdown > 0}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  {countdown > 0 ? `${countdown}秒后重新发送` : '重新发送验证码'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* 返回首页 */}
        <Link
          to="/"
          className="mt-8 text-gray-500 text-sm hover:text-gray-300 transition-colors flex items-center gap-2"
        >
          <span>←</span>
          <span>返回首页</span>
        </Link>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        .animate-slide-up {
          animation: slide-up 0.6s ease-out 0.2s both;
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Login;
