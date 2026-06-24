import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { sendLoginCode, verifyLogin } from '../api';

const Login = () => {
  const navigate = useNavigate();
  const { setToken, setUser, isLoggedIn } = useAuthStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1); // 1: 输入邮箱, 2: 输入验证码
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');

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

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError('请输入邮箱');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await sendLoginCode(email);
      if (res.data.success) {
        setStep(2);
        setCountdown(60);
      } else {
        setError(res.data.message || '发送失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim()) {
      setError('请输入验证码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await verifyLogin(email, code);
      if (res.data.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        navigate('/');
      } else {
        setError(res.data.message || '验证失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '验证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      {/* 背景渐变动画 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-pink-500/5 to-transparent rounded-full blur-3xl animate-pulse-soft"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-purple-500/5 to-transparent rounded-full blur-3xl animate-pulse-soft" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10 animate-slide-up">
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-pink-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">
            AI-HTY
          </h1>
          <p className="text-gray-400">登录以继续使用</p>
        </div>

        <div className="card animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="relative overflow-hidden">
            {/* 步骤1 */}
            <div className={`transition-all duration-500 ease-out ${step === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full absolute inset-0'}`}>
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  邮箱地址
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入你的邮箱"
                  className="w-full"
                  onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                />
              </div>

              {error && (
                <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm animate-shake">
                  {error}
                </div>
              )}

              <button
                onClick={handleSendCode}
                disabled={loading || !email.trim()}
                className="btn btn-primary w-full relative overflow-hidden group"
              >
                <span className={`transition-all duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}>
                  发送验证码
                </span>
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
                  </div>
                )}
              </button>
            </div>

            {/* 步骤2 */}
            <div className={`transition-all duration-500 ease-out ${step === 2 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full absolute inset-0'}`}>
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  验证码
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="请输入6位验证码"
                    className="flex-1"
                    maxLength={6}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                  />
                  <button
                    onClick={handleSendCode}
                    disabled={loading || countdown > 0}
                    className="btn btn-secondary whitespace-nowrap"
                  >
                    {countdown > 0 ? `${countdown}s` : '重新发送'}
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  验证码已发送至 {email}
                </p>
              </div>

              {error && (
                <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm animate-shake">
                  {error}
                </div>
              )}

              <button
                onClick={handleVerify}
                disabled={loading || !code.trim()}
                className="btn btn-primary w-full mb-4 relative overflow-hidden"
              >
                <span className={`transition-all duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}>
                  登录
                </span>
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
                  </div>
                )}
              </button>

              <button
                onClick={() => setStep(1)}
                className="text-sm text-gray-400 hover:text-white transition-colors w-full text-center"
              >
                ← 更换邮箱
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <p>新用户登录即注册，首次登录赠送 3 次免费生成机会</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
