import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { MenuCategory, OrderDetail } from '@restaurant/shared-types';
import { api, setToken } from '../api/client';
import { RealtimeProvider, RealtimeListener } from '../realtime/RealtimeContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: 'bg-status-pending text-status-pending-foreground',
  preparing: 'bg-status-preparing text-status-preparing-foreground',
  done: 'bg-status-done text-status-done-foreground',
};

// 顾客扫码 / 桌台平板共用的点餐页（见 ARCHITECTURE.md 2.4：两者是同一套代码、同一权限）
export default function GuestOrderPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const tokenKind = `guest:${tableId}`;

  const [orderId, setOrderId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // StrictMode 开发模式下同一个 effect 会故意触发两次；join 不是纯读操作（会在桌台空闲时建会话），
  // 这个 ref 保证一次页面访问只真正 join 一次，不产生两个 token 互相覆盖 localStorage 的问题
  const joinedRef = useRef(false);

  const refreshOrder = useCallback(
    async (id: string) => {
      const detail = await api.get<OrderDetail>(`/orders/${id}`, tokenKind);
      setOrder(detail);
    },
    [tokenKind],
  );

  useEffect(() => {
    if (!tableId || joinedRef.current) return;
    joinedRef.current = true;

    async function joinAndLoad() {
      try {
        const joinRes = await api.post<{ sessionToken: string; orderId: string }>(
          `/table-sessions/${tableId}/join`,
          {},
        );
        setToken(tokenKind, joinRes.sessionToken);
        setOrderId(joinRes.orderId);

        const categories = await api.get<MenuCategory[]>('/menu');
        setMenu(categories);
        await refreshOrder(joinRes.orderId);
      } catch (err) {
        if (err instanceof Error && err.message.includes('table_pending_clear')) {
          setError('请稍等，服务员正在清台');
        } else {
          setError('加载失败，请稍后重试');
        }
      }
    }

    joinAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  function addToCart(dishId: string, delta: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[dishId] ?? 0) + delta);
      const updated = { ...prev, [dishId]: next };
      if (next === 0) delete updated[dishId];
      return updated;
    });
  }

  async function submitCart() {
    if (!orderId || Object.keys(cart).length === 0) return;
    setBusy(true);
    try {
      const items = Object.entries(cart).map(([dishId, quantity]) => ({ dishId, quantity }));
      await api.post(`/orders/${orderId}/items`, { items }, tokenKind);
      await api.post(`/orders/${orderId}/submit`, {}, tokenKind);
      setCart({});
      await refreshOrder(orderId);
    } catch {
      setError('提交失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function requestCheckout() {
    if (!orderId) return;
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/checkout-request`, {}, tokenKind);
      await refreshOrder(orderId);
    } catch {
      setError('结账请求失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

  const cartTotal = Object.entries(cart).reduce((sum, [dishId, qty]) => {
    const dish = menu.flatMap((c) => c.dishes).find((d) => d.id === dishId);
    return sum + (dish ? Number(dish.price) * qty : 0);
  }, 0);

  const kitchenStatusLabel: Record<string, string> = {
    pending: '待处理',
    preparing: '制作中',
    done: '已完成',
  };

  return (
    <RealtimeProvider tokenKind={tokenKind}>
      <RealtimeListener event="connect" onEvent={() => orderId && refreshOrder(orderId).catch(() => {})} />
      <RealtimeListener event="item_status_changed" onEvent={() => orderId && refreshOrder(orderId).catch(() => {})} />
      <RealtimeListener event="item_added" onEvent={() => orderId && refreshOrder(orderId).catch(() => {})} />
      <RealtimeListener event="order_paid" onEvent={() => orderId && refreshOrder(orderId).catch(() => {})} />
      <RealtimeListener event="order_cancelled" onEvent={() => orderId && refreshOrder(orderId).catch(() => {})} />
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto flex max-w-md flex-col gap-6 p-4">
        <h1 className="text-lg font-semibold text-foreground">桌台 {tableId}</h1>

        {order.status === 'awaiting_payment' && (
          <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            已发起结账，请等待店员到桌结账
          </div>
        )}
        {order.status === 'cancelled' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            该订单已被店员取消
          </div>
        )}

        <section className="flex flex-col gap-4">
          {menu.map((category) => (
            <div key={category.id} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{category.name}</h2>
              <div className="flex flex-col gap-2">
                {category.dishes?.map((dish) => (
                  <Card key={dish.id}>
                    <CardContent className="flex items-center justify-between gap-3 py-1">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {dish.name} · ¥{Number(dish.price).toFixed(2)}
                        </p>
                        {dish.description && (
                          <p className="text-sm text-muted-foreground">{dish.description}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => addToCart(dish.id, -1)}
                          disabled={!cart[dish.id]}
                        >
                          −
                        </Button>
                        <span className="w-4 text-center text-sm font-medium">{cart[dish.id] ?? 0}</span>
                        <Button size="icon" className="size-7" onClick={() => addToCart(dish.id, 1)}>
                          +
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">本桌已点</h2>
          {order.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有点菜</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">
                    {item.dishNameSnapshot} × {item.quantity}
                  </span>
                  {item.roundNumber === 0 ? (
                    <Badge variant="secondary">未提交</Badge>
                  ) : (
                    <Badge className={STATUS_BADGE_CLASS[item.kitchenStatus]}>
                      {kitchenStatusLabel[item.kitchenStatus]}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between pt-1 text-sm font-medium text-foreground">
            <span>合计</span>
            <span>¥{Number(order.total).toFixed(2)}</span>
          </div>
        </section>

        {order.status === 'open' && order.items.some((i) => i.roundNumber > 0) && (
          <Button variant="outline" onClick={requestCheckout} disabled={busy}>
            结账
          </Button>
        )}
      </div>

      {Object.keys(cart).length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card px-4 py-3">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <span className="text-sm font-medium text-foreground">待提交 ¥{cartTotal.toFixed(2)}</span>
            <Button onClick={submitCart} disabled={busy}>
              提交给厨房
            </Button>
          </div>
        </div>
      )}
    </div>
    </RealtimeProvider>
  );
}
