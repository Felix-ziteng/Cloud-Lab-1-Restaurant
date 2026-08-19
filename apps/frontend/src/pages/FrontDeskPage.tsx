import { useEffect, useState, type FormEvent } from 'react';
import type { StoreConfig } from '@restaurant/shared-types';
import { api, setToken, getToken } from '../api/client';

// 前台终端：普通店员 / 店长共用同一登录入口，登录后按 role 解锁不同功能（见 API_DESIGN.md 第 2 节）
// 厨房看板 / 外卖 / 预定这几个模块是否露出，由 StoreConfig 这份门店能力配置决定
// （见 ARCHITECTURE.md 关于"产品化配置"的决策：同一套代码，靠配置适配不同客户的硬件/功能组合）
export default function FrontDeskPage() {
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<StoreConfig | null>(null);

  const loggedIn = Boolean(getToken('staffToken'));

  useEffect(() => {
    api.get<StoreConfig>('/store-config').then(setConfig).catch(() => {});
  }, []);

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

  async function toggleFeature(feature: keyof StoreConfig, value: boolean) {
    const updated = await api.patch<StoreConfig>('/store-config', { [feature]: value }, 'staffToken');
    setConfig(updated);
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

      <nav>
        <ul>
          <li>桌台看板（开台/并台/结账）</li>
          {config?.kdsScreenEnabled && <li>厨房看板</li>}
          {config?.deliveryEnabled && <li>外卖/配送管理</li>}
          {config?.reservationEnabled && <li>预定管理</li>}
        </ul>
        {/* TODO: 以上均为占位导航，具体页面 —— 下一阶段实现 */}
      </nav>

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
