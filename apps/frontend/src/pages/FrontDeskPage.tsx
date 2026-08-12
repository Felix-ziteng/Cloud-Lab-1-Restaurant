import { useState, type FormEvent } from 'react';
import { api, setToken, getToken } from '../api/client';

// 前台终端：普通店员 / 店长共用同一登录入口，登录后按 role 解锁不同功能（见 API_DESIGN.md 第 2 节）
export default function FrontDeskPage() {
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loggedIn = Boolean(getToken('staffToken'));

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post<{ token: string; role: string }>('/auth/staff/login', { pin });
      setToken('staffToken', res.token);
      setRole(res.role);
    } catch {
      setError('PIN 码不正确');
    }
  }

  if (!loggedIn) {
    return (
      <form onSubmit={handleLogin}>
        <h1>前台登录</h1>
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN 码"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <button type="submit">登录</button>
        {error && <p>{error}</p>}
      </form>
    );
  }

  return (
    <div>
      <h1>前台{role === 'manager' ? '（店长/管理员）' : ''}</h1>
      {/* TODO: 桌台看板、开台/并台、菜单管理（manager）、订单收款 —— 下一阶段实现 */}
    </div>
  );
}
