import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../api';

const AdminLogin = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const adminToken = localStorage.getItem('adminToken');
    if (adminToken) {
      navigate('/admin');
    }
  }, [navigate]);

  const handleLogin = async () => {
    if (!password.trim()) {
      setError('请输入管理员密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await adminLogin(password);
      if (res.data.success) {
        localStorage.setItem('adminToken', res.data.token);
        navigate('/admin');
      } else {
        setError(res.data.message || '登录失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '登录失败，请稍后重试');
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
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !password.trim()}
            className="btn btn-primary w-full"
          >
            {loading ? '登录中...' : '登录'}
          </button>

          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-xs text-gray-500 text-center">
              默认密码：admin123（请在环境变量中修改）
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
