import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../api';
import FriendlyErrorBox from '../components/FriendlyErrorBox';
import { formatError } from '../utils/errors';
import type { FriendlyError } from '../utils/errors';

const AdminLogin = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  useEffect(() => {
    // 管理员凭据仅用 sessionStorage 存（关闭浏览器自动清除，降低被 XSS 长期窃取明文密码风险）
    const adminKey = sessionStorage.getItem('adminKey');
    if (adminKey) {
      navigate('/admin');
    }
  }, [navigate]);

  const handleLogin = async () => {
    const pwd = password.trim();
    if (!pwd) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '请输入管理员密码',
        detail: '登录管理后台需要管理员密码。\n如果你是网站所有者，密码通过部署时的 ADMIN_PASSWORD 环境变量配置。',
      });
      return;
    }
    if (pwd.length > 256) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '密码太长了',
        detail: `当前输入了 ${pwd.length} 个字符。\n管理员密码不会这么长，请检查是否误粘贴了其他内容。`,
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await adminLogin(pwd);
      if (res.data.success) {
        // 管理员密码仅存 sessionStorage（非持久化 localStorage）
        sessionStorage.setItem('adminKey', pwd);
        // 兼容旧命名的清理
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminKey');
        navigate('/admin');
      } else {
        setError(formatError(res.data, '登录失败'));
      }
    } catch (err: any) {
      setError(formatError(err, '登录失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gray-900">
      <div className="w-full max-w-md animate-scale-in">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">管理后台</h1>
          <p className="text-gray-400">请输入管理员密码登录</p>
        </div>

        <div className="card">
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              管理员密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          {error && (
            <div className="mb-6">
              <FriendlyErrorBox
                error={error}
                onRetry={() => handleLogin()}
                onDismiss={() => setError(null)}
              />
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !password.trim()}
            className="btn btn-primary w-full"
            title={
              loading
                ? '正在验证密码...'
                : !password.trim()
                  ? '请先输入管理员密码'
                  : '点击登录管理后台'
            }
          >
            {loading ? '登录中...' : '登录'}
          </button>

          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-xs text-gray-500 text-center">
              管理员密码通过系统环境变量配置
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-sm text-gray-500 hover:text-white transition-colors"
          >
            ← 返回首页
          </a>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
