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
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md animate-scale-in">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-2">
            AI<span className="text-gray-400">-HTY</span>
          </h1>
          <p className="text-gray-400">登录以继续使用</p>
        </div>

        <div className="card">
          {step === 1 ? (
            <>
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
                <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleSendCode}
                disabled={loading || !email.trim()}
                className="btn btn-primary w-full"
              >
                {loading ? '发送中...' : '发送验证码'}
              </button>
            </>
          ) : (
            <>
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
                <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleVerify}
                disabled={loading || !code.trim()}
                className="btn btn-primary w-full mb-4"
              >
                {loading ? '验证中...' : '登录'}
              </button>

              <button
                onClick={() => setStep(1)}
                className="text-sm text-gray-400 hover:text-white transition-colors w-full text-center"
              >
                ← 更换邮箱
              </button>
            </>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>新用户登录即注册，首次登录赠送 3 次免费生成机会</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
