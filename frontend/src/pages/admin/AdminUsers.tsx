import { useState, useEffect } from 'react';
import { getAdminUsers, addCredits } from '../../api';
import type { User } from '../../types';

const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editCredits, setEditCredits] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await getAdminUsers({
        keyword: keyword || undefined,
        pageSize: 100,
      });
      if (res.data.success) {
        setUsers(res.data.users || []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  const handleEditCredits = (user: User) => {
    setEditingUserId(user.id);
    setEditCredits(String(user.balance));
  };

  const handleSaveCredits = async (userId: number) => {
    const credits = parseInt(editCredits);
    if (isNaN(credits)) {
      alert('请输入有效数字');
      return;
    }

    // 计算差值
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const diff = credits - user.balance;
    if (diff === 0) {
      setEditingUserId(null);
      return;
    }

    try {
      const res = await addCredits(userId, diff);
      if (res.data.success) {
        fetchUsers();
        setEditingUserId(null);
      } else {
        alert(res.data.message || '操作失败');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失败');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">用户管理</h1>
          <p className="text-gray-400">共 {users.length} 个用户</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索邮箱..."
            className="w-64"
          />
          <button type="submit" className="btn btn-secondary">
            搜索
          </button>
        </form>
      </div>

      {users.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400">暂无用户</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">ID</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">邮箱</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">剩余次数</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">注册时间</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-3 px-4 text-sm text-gray-400">
                    {user.id}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {user.email}
                  </td>
                  <td className="py-3 px-4">
                    {editingUserId === user.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editCredits}
                          onChange={(e) => setEditCredits(e.target.value)}
                          className="w-24 py-1 px-2 text-sm"
                        />
                        <button
                          onClick={() => handleSaveCredits(user.id)}
                          className="text-sm text-green-400 hover:text-green-300"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="text-sm text-gray-400 hover:text-gray-300"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium">{user.balance}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-400">
                    {new Date(user.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="py-3 px-4">
                    {editingUserId !== user.id && (
                      <button
                        onClick={() => handleEditCredits(user)}
                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        调整次数
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
