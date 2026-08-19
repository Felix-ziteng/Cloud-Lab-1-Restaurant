import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { StoreConfig, TableWithSession } from '@restaurant/shared-types';
import { api, setToken, getToken, clearToken, onAuthInvalidated } from '../api/client';
import ManagementPanel from '../components/ManagementPanel';
import OrderDetailPanel from '../components/OrderDetailPanel';
import OrderHistoryPanel from '../components/OrderHistoryPanel';
import ReservationsPanel from '../components/ReservationsPanel';
import DeliveryPanel from '../components/DeliveryPanel';

const TABLE_STATUS_LABEL: Record<string, string> = {
  idle: '空闲',
  occupied: '占用',
  pending_clear: '待清台',
};

// 前台终端：普通店员 / 店长共用同一登录入口，登录后按 role 解锁不同功能（见 API_DESIGN.md 第 2 节）
// 厨房看板 / 外卖 / 预定这几个模块是否露出，由 StoreConfig 这份门店能力配置决定
// （见 ARCHITECTURE.md 关于"产品化配置"的决策：同一套代码，靠配置适配不同客户的硬件/功能组合）
export default function FrontDeskPage() {
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<string | null>(() => localStorage.getItem('staffRole'));
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [config, setConfig] = useState<StoreConfig | null>(null);
  const [tables, setTables] = useState<TableWithSession[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const loggedIn = Boolean(getToken('staffToken'));

  const loadTables = useCallback(async () => {
    const res = await api.get<TableWithSession[]>('/tables', 'staffToken');
    setTables(res);
  }, []);

  function logout() {
    clearToken('staffToken');
    localStorage.removeItem('staffRole');
    setRole(null);
    setTables([]);
    setSelectedTableId(null);
  }

  // 账号失效这个信号是 client.ts 统一广播的（任何一个用 staffToken 发的请求收到 401 都会触发），
  // 不管是按钮点击触发的请求，还是下面轮询定时器自己发的请求，都会走到这里退回登录页——
  // 不用在每个发请求的地方（包括轮询、包括 ManagementPanel/OrderDetailPanel 内部）各自去接
  useEffect(() => {
    return onAuthInvalidated('staffToken', () => {
      logout();
      setActionError('登录状态已失效，请重新输入 PIN 码登录');
    });
  }, []);

  useEffect(() => {
    api.get<StoreConfig>('/store-config').then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    loadTables().catch(() => {});
    // 还没接 WebSocket，先用轮询看到其他终端的变化（比如厨房把菜标记完成）
    const timer = setInterval(() => loadTables().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [loggedIn, loadTables]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post<{ token: string; role: string }>('/auth/staff/login', { pin });
      setToken('staffToken', res.token);
      localStorage.setItem('staffRole', res.role);
      setRole(res.role);
    } catch {
      setError('PIN 码不正确');
    }
  }

  // 统一包一层：请求失败不再静默吞掉，报错会显示在页面上，而不是只在控制台能看到。
  // 账号失效的情况不用在这里特殊处理——client.ts 检测到 401 会自动清令牌并广播事件，
  // 上面的 onAuthInvalidated 监听器负责退回登录页，这里只管把错误显示出来就行
  async function runAction(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function toggleFeature(feature: keyof StoreConfig, value: boolean) {
    await runAction(async () => {
      const updated = await api.patch<StoreConfig>('/store-config', { [feature]: value }, 'staffToken');
      setConfig(updated);
    });
  }

  async function openTable(tableId: string) {
    const partySize = Number(window.prompt('用餐人数？', '2'));
    if (!partySize || partySize < 1) return;
    await runAction(async () => {
      await api.post('/table-sessions', { tableIds: [tableId], partySize }, 'staffToken');
      await loadTables();
    });
  }

  async function clearTable(tableId: string) {
    await runAction(async () => {
      await api.post(`/tables/${tableId}/clear`, {}, 'staffToken');
      setSelectedTableId(null);
      await loadTables();
    });
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

  const selectedTable = tables.find((t) => t.id === selectedTableId);

  return (
    <div>
      <h1>
        前台{role === 'manager' ? '（店长/管理员）' : ''}
        <button onClick={logout}>退出登录</button>
      </h1>

      {actionError && <p style={{ color: 'red' }}>操作失败：{actionError}</p>}

      <section>
        <h2>桌台看板</h2>
        <ul>
          {tables.map((table) => (
            <li key={table.id}>
              <button onClick={() => setSelectedTableId(table.id)}>
                {table.tableNumber}（{TABLE_STATUS_LABEL[table.status]}
                {table.activeSession ? ` · ${table.activeSession.partySize}人 · ¥${Number(table.activeSession.order.total).toFixed(2)}` : ''}）
              </button>
              {table.status === 'idle' && <button onClick={() => openTable(table.id)}>开台</button>}
              {table.status === 'pending_clear' && <button onClick={() => clearTable(table.id)}>清台完成</button>}
            </li>
          ))}
        </ul>
      </section>

      {selectedTable?.activeSession && (
        <OrderDetailPanel
          table={selectedTable}
          allTables={tables}
          isManager={role === 'manager'}
          onChanged={() => loadTables()}
          onClose={() => setSelectedTableId(null)}
        />
      )}

      <OrderHistoryPanel />

      {config?.reservationEnabled && <ReservationsPanel />}
      {config?.deliveryEnabled && <DeliveryPanel />}

      <nav>
        <h2>其他模块</h2>
        <ul>{config?.kdsScreenEnabled && <li>厨房看板（见 /kitchen）</li>}</ul>
      </nav>

      {role === 'manager' && config && <ManagementPanel config={config} />}

      {role === 'manager' && config && (
        <section>
          <h2>门店设置</h2>
          <label>
            <input
              type="checkbox"
              checked={config.kdsScreenEnabled}
              onChange={(e) => toggleFeature('kdsScreenEnabled', e.target.checked)}
            />
            启用厨房电子看板
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.deliveryEnabled}
              onChange={(e) => toggleFeature('deliveryEnabled', e.target.checked)}
            />
            启用外卖/配送模块
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.reservationEnabled}
              onChange={(e) => toggleFeature('reservationEnabled', e.target.checked)}
            />
            启用预定模块
          </label>
        </section>
      )}
    </div>
  );
}
