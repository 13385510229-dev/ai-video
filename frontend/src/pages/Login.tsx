import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import WaveBackground from '../components/WaveBackground';
import SliderCaptcha from '../components/SliderCaptcha';
import FriendlyErrorBox from '../components/FriendlyErrorBox';
import { formatError } from '../utils/errors';
import type { FriendlyError } from '../utils/errors';

const Login = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [captchaVerified, setCaptchaVerified] = useState(false);

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
    setError(null);

    const emailVal = email.trim();
    if (!emailVal) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '请输入邮箱地址',
        detail: '我们需要邮箱来给你发送一次性登录验证码。\n请填写一个你能正常收信的邮箱。',
      });
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(emailVal)) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '邮箱格式不对',
        detail: `当前填写的是「${emailVal}」。\n请检查有没有漏掉 @ 和域名，比如 abc@example.com 这样的格式。`,
      });
      return;
    }
    if (emailVal.length > 254) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '邮箱太长了',
        detail: `你输入的邮箱有 ${emailVal.length} 个字符，超过了 254 的上限。\n请换成更短的邮箱再试。`,
      });
      return;
    }

    if (!captchaVerified) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '请先完成滑块验证',
        detail: '拖动下面的拼图滑块，把缺口对到正确的位置。\n通过验证后才能发送登录验证码，这是为了防止机器人刷接口。',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailVal }),
      });
      const data = await response.json();

      if (data.success) {
        setStep(2);
        setCountdown(60);
        setError({
          category: 'UNKNOWN',
          title: '验证码已发送',
          detail: `验证码邮件已发送到 ${emailVal}。\n请查收收件箱（如果没看到，去「垃圾邮件」文件夹找一下），然后把 6 位数字填到下面的输入框。`,
        });
      } else {
        setError(formatError(data, '发送验证码失败'));
        // 发送失败后重置滑块验证
        setCaptchaVerified(false);
      }
    } catch (err) {
      setError(formatError(err, '发送验证码失败'));
      setCaptchaVerified(false);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const codeVal = code.trim();
    if (!codeVal) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '请输入验证码',
        detail: '验证码是我们刚刚发送到你邮箱的 6 位数字。\n请查收邮件后把数字填进来。',
      });
      return;
    }
    if (!/^\d{4,8}$/.test(codeVal)) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '验证码格式不对',
        detail: `当前输入的是「${codeVal}」。\n验证码应该是 4~8 位纯数字，请检查有没有多打空格或字母。`,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: codeVal }),
      });
      const data = await response.json();

      if (data.success && data.token) {
        setToken(data.token);
        setUser(data.user);
        navigate('/video');
      } else {
        setError(formatError(data, '验证失败'));
      }
    } catch (err) {
      setError(formatError(err, '验证失败'));
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

                {/* 滑块验证 */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    安全验证
                  </label>
                  {captchaVerified ? (
                    <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-600 text-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      验证通过
                    </div>
                  ) : (
                    <SliderCaptcha onVerify={(verified) => setCaptchaVerified(verified)} />
                  )}
                </div>

                {error && (
                  <FriendlyErrorBox
                    error={error}
                    onDismiss={() => setError(null)}
                  />
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
                    onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
                    placeholder="请输入6位验证码"
                    maxLength={8}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-300 focus:bg-white transition-all text-center text-2xl tracking-widest font-mono"
                  />
                </div>

                <div className="text-center text-sm text-gray-400">
                  验证码已发送至{' '}
                  <span className="text-gray-600 font-medium">{email}</span>
                  <div className="mt-1 text-xs text-gray-400">
                    如果 1 分钟内没收到邮件：请检查「垃圾邮件」或「广告邮件」文件夹
                  </div>
                </div>

                {error && (
                  <FriendlyErrorBox
                    error={error}
                    onDismiss={() => setError(null)}
                  />
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
