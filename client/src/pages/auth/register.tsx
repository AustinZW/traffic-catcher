import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth-store';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localErr, setLocalErr] = useState('');
  const { register, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalErr('');
    if (password !== confirm) {
      setLocalErr('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setLocalErr('密码至少需要6个字符');
      return;
    }
    try {
      await register(username, password, email || undefined);
      navigate('/lobby');
    } catch {}
  };

  const displayErr = localErr || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6">交通鬼抓人</h1>
        <p className="text-gray-500 text-center mb-6">创建新账号</p>

        {displayErr && (
          <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg mb-4 text-sm flex justify-between">
            <span>{displayErr}</span>
            <button onClick={() => { setLocalErr(''); clearError(); }} className="font-bold">&times;</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            required
            autoComplete="username"
          />
          <input
            type="email"
            placeholder="邮箱（选填）"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            required
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="确认密码"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            required
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold text-base hover:bg-blue-700 disabled:opacity-50 btn-touch"
          >
            {isLoading ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="text-center text-gray-500 mt-6 text-sm">
          已有账号？<Link to="/auth/login" className="text-blue-600 font-semibold">登录</Link>
        </p>
      </div>
    </div>
  );
}
