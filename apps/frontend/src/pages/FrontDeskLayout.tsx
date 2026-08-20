import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { StoreConfig } from '@restaurant/shared-types';
import { api, setToken, getToken, clearToken, onAuthInvalidated } from '../api/client';
import { RealtimeProvider } from '../realtime/RealtimeContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// 子路由用 useOutletContext<FrontDeskContext>() 取这几样，不用另起一个 Context Provider——
// react-router 的 Outlet context 就是给这种"壳持有状态、子页面读"的场景准备的
export interface FrontDeskContext {
  role: string | null;
  config: StoreConfig | null;
  setConfig: (config: StoreConfig) => void;
}

const NAV_ITEM_CLASS =
  'rounded-md px-3 py-2 text-sm transition-colors hover:bg-secondary hover:text-secondary-foreground';
const NAV_ITEM_ACTIVE_CLASS = 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary';

// 前台终端：普通店员 / 店长共用同一登录入口，登录后按 role 解锁不同导航项（见 API_DESIGN.md 第 2 节）
// 厨房看板 / 外卖 / 预定这几个模块是否露出，由 StoreConfig 这份门店能力配置决定
// （见 ARCHITECTURE.md 关于"产品化配置"的决策：同一套代码，靠配置适配不同客户的硬件/功能组合）
//
// 这是导航壳：登录表单 + 登录后的侧边栏 + <Outlet />。桌台看板/历史订单/报表/管理这些
// 各自的数据和交互都在对应的子路由页面里，这里只管"登录状态"和"该给哪个角色看哪些导航项"。
export default function FrontDeskLayout() {
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<string | null>(() => localStorage.getItem('staffRole'));
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<StoreConfig | null>(null);

  const loggedIn = Boolean(getToken('staffToken'));

  function logout() {
    clearToken('staffToken');
    localStorage.removeItem('staffRole');
    setRole(null);
  }

  // 账号失效这个信号是 client.ts 统一广播的（任何一个用 staffToken 发的请求收到 401 都会触发）——
  // 集中在壳这一层接住，不用每个子页面各自订阅
  useEffect(() => {
    return onAuthInvalidated('staffToken', () => {
      logout();
      setError('登录状态已失效，请重新输入 PIN 码登录');
    });
  }, []);

  useEffect(() => {
    api.get<StoreConfig>('/store-config').then(setConfig).catch(() => {});
  }, []);

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

  if (!loggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>前台登录</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <Input
                type="password"
                inputMode="numeric"
                placeholder="PIN 码"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
              <Button type="submit">登录</Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const context: FrontDeskContext = { role, config, setConfig };

  return (
    <RealtimeProvider tokenKind="staffToken">
      <div className="flex min-h-screen bg-background">
        <nav className="flex w-56 shrink-0 flex-col gap-4 border-r border-border p-4">
          <div>
            <h1 className="text-sm font-semibold text-foreground">前台</h1>
            {role === 'manager' && <p className="text-sm text-muted-foreground">店长/管理员</p>}
          </div>

          <div className="flex flex-col gap-1">
            <NavLink
              to="/front-desk"
              end
              className={({ isActive }) => `${NAV_ITEM_CLASS} ${isActive ? NAV_ITEM_ACTIVE_CLASS : ''}`}
            >
              桌台
            </NavLink>
            <NavLink
              to="/front-desk/orders"
              className={({ isActive }) => `${NAV_ITEM_CLASS} ${isActive ? NAV_ITEM_ACTIVE_CLASS : ''}`}
            >
              历史订单
            </NavLink>
            {config?.reservationEnabled && (
              <NavLink
                to="/front-desk/reservations"
                className={({ isActive }) => `${NAV_ITEM_CLASS} ${isActive ? NAV_ITEM_ACTIVE_CLASS : ''}`}
              >
                预定
              </NavLink>
            )}
            {config?.deliveryEnabled && (
              <NavLink
                to="/front-desk/delivery"
                className={({ isActive }) => `${NAV_ITEM_CLASS} ${isActive ? NAV_ITEM_ACTIVE_CLASS : ''}`}
              >
                外卖/配送
              </NavLink>
            )}
            {role === 'manager' && (
              <>
                <NavLink
                  to="/front-desk/reports"
                  className={({ isActive }) => `${NAV_ITEM_CLASS} ${isActive ? NAV_ITEM_ACTIVE_CLASS : ''}`}
                >
                  报表
                </NavLink>
                <NavLink
                  to="/front-desk/admin"
                  className={({ isActive }) => `${NAV_ITEM_CLASS} ${isActive ? NAV_ITEM_ACTIVE_CLASS : ''}`}
                >
                  管理
                </NavLink>
              </>
            )}
            {config?.kdsScreenEnabled && (
              <a
                href="/kitchen"
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
              >
                厨房看板 ↗
              </a>
            )}
          </div>

          <Button variant="outline" size="sm" className="mt-auto" onClick={logout}>
            退出登录
          </Button>
        </nav>

        <main className="flex-1 p-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <Outlet context={context} />
          </div>
        </main>
      </div>
    </RealtimeProvider>
  );
}
