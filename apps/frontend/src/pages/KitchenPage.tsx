import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { KitchenQueueItem } from '@restaurant/shared-types';
import { api, getToken, setToken, clearToken, onAuthInvalidated } from '../api/client';

// 厨房 KDS 看板：设计上是站点级访问、无个人登录（见 API_DESIGN.md 第 2 节），
// 但站点级令牌的签发流程还没做（见 auth.types.ts），MVP 阶段先借用店员 PIN 登录顶上
export default function KitchenPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<KitchenQueueItem[]>([]);

  const loggedIn = Boolean(getToken('staffToken'));

  function logout() {
    clearToken('staffToken');
    setQueue([]);
    setError(null);
  }

  // 账号失效是 client.ts 统一广播的（任何用 staffToken 发的请求收到 401 都会触发），
  // 轮询定时器发的请求也会走到这里退回登录页，不用在 loadQueue 里单独接
  useEffect(() => {
    return onAuthInvalidated('staffToken', () => {
      logout();
      setError('登录状态已失效，请重新输入 PIN 码登录');
    });
  }, []);

  const loadQueue = useCallback(async () => {
    const res = await api.get<KitchenQueueItem[]>('/order-items/queue', 'staffToken');
    setQueue(res);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    loadQueue().catch(() => {});
    const timer = setInterval(() => loadQueue().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [loggedIn, loadQueue]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post<{ token: string }>('/auth/staff/login', { pin });
      setToken('staffToken', res.token);
    } catch {
      setError('PIN 码不正确');
    }
  }

  async function markStatus(itemId: string, status: 'preparing' | 'done') {
    setError(null);
    try {
      await api.patch(`/order-items/${itemId}/kitchen-status`, { status }, 'staffToken');
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  function tableLabel(item: KitchenQueueItem) {
    const tableNumbers = item.order.tableSession?.tables.map((t) => t.table.tableNumber).join('+');
    return tableNumbers ?? item.order.type;
  }

  if (!loggedIn) {
    return (
      <form onSubmit={handleLogin}>
        <h1>厨房看板登录</h1>
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
      <h1>
        厨房看板
        <button onClick={logout}>退出登录</button>
      </h1>
      {error && <p style={{ color: 'red' }}>操作失败：{error}</p>}
      <ul>
        {queue.map((item) => (
          <li key={item.id}>
            [{tableLabel(item)}] {item.dishNameSnapshot} x{item.quantity}
            {item.notes && `（${item.notes}）`} — {item.kitchenStatus === 'pending' ? '待处理' : '制作中'}
            {item.kitchenStatus === 'pending' && (
              <button onClick={() => markStatus(item.id, 'preparing')}>开始制作</button>
            )}
            <button onClick={() => markStatus(item.id, 'done')}>完成</button>
          </li>
        ))}
        {queue.length === 0 && <li>暂无待处理订单</li>}
      </ul>
    </div>
  );
}
