import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import ParticleBackground from '../components/ParticleBackground';

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
    <div className="relative min-h-screen overflow-hidden bg-black">
      <ParticleBackground />

      {/* 主内容 */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* Logo 和标题 */}
        <div className="text-center mb-16 animate-fade-in">
          <Link to="/" className="text-4xl md:text-5xl font-bold tracking-tight inline-block mb-6 text-white">
            AI 创意工坊
          </Link>
          <p className="text-gray-500 text-lg font-light">
            登录开启你的 AI 创作之旅
          </p>
        </div>

        {/* 登录框 */}
        <div
          className="w-full max-w-md p-8 md:p-10 rounded-2xl animate-slide-up"
          style={{
            background: 'rgba(20, 20, 20, 0.5)',
            backdropFilter: 'blur(30px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          {step === 1 ? (
            <form onSubmit={handleSendCode} className="space-y-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2 font-light">邮箱地址</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入你的邮箱"
                  className="w-full px-4 py-3 bg-black/40 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-all"
                />
              </div>

              {error && (
                <div className="text-gray-400 text-sm text-center animate-shake">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-medium text-black bg-white hover:bg-gray-100 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
                    发送中...
                  </span>
                ) : (
                  '发送验证码'
                )}
              </button>

              <p className="text-center text-gray-600 text-xs">
                登录即表示同意 <a href="/terms" className="text-gray-400 hover:text-white transition-colors">服务条款</a> 和 <a href="/privacy" className="text-gray-400 hover:text-white transition-colors">隐私政策</a>
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-6">
              <div className="text-center mb-6">
                <p className="text-gray-500 text-sm">
                  验证码已发送至
                </p>
                <p className="text-white font-medium mt-1">{email}</p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2 font-light">验证码</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="请输入6位验证码"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-black/40 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-all text-center text-2xl tracking-widest font-mono"
                />
              </div>

              {error && (
                <div className="text-gray-400 text-sm text-center animate-shake">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-medium text-black bg-white hover:bg-gray-100 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
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
                  className="text-sm text-gray-500 hover:text-white transition-colors disabled:text-gray-700 disabled:cursor-not-allowed"
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
          className="mt-10 text-gray-600 text-sm hover:text-gray-400 transition-colors flex items-center gap-2"
        >
          <span>←</span>
          <span>返回首页</span>
        </Link>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-fade-in {
          animation: fade-in 0.8s ease-out;
        }
        .animate-slide-up {
          animation: slide-up 0.8s ease-out 0.2s both;
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Login;
