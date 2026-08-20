import { useCallback, useEffect, useState } from 'react';
import type { MenuCategory, OrderDetail, TableWithSession } from '@restaurant/shared-types';
import { api } from '../api/client';
import { useRealtimeEvent } from '../realtime/RealtimeContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const KITCHEN_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  preparing: '制作中',
  done: '已完成',
};

const KITCHEN_STATUS_BADGE_CLASS: Record<string, string> = {
  pending: 'bg-status-pending text-status-pending-foreground',
  preparing: 'bg-status-preparing text-status-preparing-foreground',
  done: 'bg-status-done text-status-done-foreground',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  open: '进行中',
  awaiting_payment: '待结账',
  paid: '已支付',
  cancelled: '已取消',
};

interface Props {
  table: TableWithSession;
  allTables: TableWithSession[];
  isManager: boolean;
  onChanged: () => void;
  onClose: () => void;
}

// 选中一桌之后的账单/操作面板：加菜、改购物车、提交、改价（manager）、收款、拆台/换桌/改人数。
// 独立成组件而不是内联在 pages/FrontDeskTablesPage.tsx 里，不然那个文件要爆炸了。
export default function OrderDetailPanel({ table, allTables, isManager, onChanged, onClose }: Props) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPriceAdjust, setShowPriceAdjust] = useState(false);

  const orderId = table.activeSession?.order.id;

  const load = useCallback(async () => {
    if (!orderId) return;
    const detail = await api.get<OrderDetail>(`/orders/${orderId}`, 'staffToken');
    setOrder(detail);
  }, [orderId]);

  useEffect(() => {
    load().catch(() => {});
    api.get<MenuCategory[]>('/menu').then(setMenu).catch(() => {});
  }, [load]);

  // 别的终端（比如厨房把菜标记完成、店长改价）改了这张单，这里跟着刷新，不用手动点一下才看到
  useRealtimeEvent('order_updated', (payload) => {
    if ((payload as { orderId?: string })?.orderId === orderId) load().catch(() => {});
  });

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function addItem(dishId: string) {
    await run(async () => {
      await api.post(`/orders/${orderId}/items`, { items: [{ dishId, quantity: 1 }] }, 'staffToken');
    });
  }

  async function changeQty(itemId: string, quantity: number) {
    if (quantity < 1) return;
    await run(async () => {
      await api.patch(`/orders/${orderId}/items/${itemId}`, { quantity }, 'staffToken');
    });
  }

  async function removeItem(itemId: string) {
    await run(async () => {
      await api.delete(`/orders/${orderId}/items/${itemId}`, 'staffToken');
    });
  }

  async function submitCart() {
    await run(async () => {
      await api.post(`/orders/${orderId}/submit`, {}, 'staffToken');
    });
  }

  async function requestCheckout() {
    await run(async () => {
      await api.post(`/orders/${orderId}/checkout-request`, {}, 'staffToken');
    });
  }

  // 记录收款这个入口暂时从界面上去掉了：现在没有对接 POS，"发起结账"直接让桌台进入
  // 待清台状态（见后端 OrdersService.requestCheckout 的改动），不需要在这里收款确认这一步。
  // 后端 POST /orders/:id/payments 接口本身没删，等接了 POS 再把入口加回来。

  async function cancelTableOpen() {
    if (!window.confirm('确定要取消这次开台吗？这桌当前的账单和已提交给厨房的菜品都会被取消，且不能撤销。')) return;
    await run(async () => {
      await api.post(`/orders/${orderId}/cancel`, {}, 'staffToken');
      onClose();
    });
  }

  async function applyDiscount() {
    const amount = Number(window.prompt('打折金额（从总价里扣多少）？', '5'));
    if (!amount || amount <= 0) return;
    await run(async () => {
      await api.post(`/orders/${orderId}/price-adjustments`, { type: 'discount', amount }, 'staffToken');
    });
  }

  async function voidItem(itemId: string) {
    await run(async () => {
      await api.post(`/orders/${orderId}/price-adjustments`, { type: 'void', amount: 0, orderItemId: itemId }, 'staffToken');
    });
  }

  async function overrideItemPrice(itemId: string, currentAmount: string) {
    const amount = Number(window.prompt('这道菜改成多少钱（这一项的总价，不是单价）？', currentAmount));
    if (amount === null || Number.isNaN(amount) || amount < 0) return;
    await run(async () => {
      await api.post(
        `/orders/${orderId}/price-adjustments`,
        { type: 'price_override', amount, orderItemId: itemId },
        'staffToken',
      );
    });
  }

  async function overrideOrderTotal() {
    if (!order) return;
    const amount = Number(window.prompt('整单直接改成多少钱（会覆盖上面算出来的合计）？', order.total));
    if (amount === null || Number.isNaN(amount) || amount < 0) return;
    await run(async () => {
      await api.post(`/orders/${orderId}/price-adjustments`, { type: 'price_override', amount }, 'staffToken');
    });
  }

  async function unmergeTable(tableId: string) {
    if (!table.activeSession) return;
    await run(async () => {
      await api.post(`/table-sessions/${table.activeSession!.id}/unmerge`, { tableId }, 'staffToken');
    });
  }

  async function transferTable() {
    if (!table.activeSession) return;
    const idleTables = allTables.filter((t) => t.status === 'idle');
    if (idleTables.length === 0) {
      setError('没有空闲的桌台可以换过去');
      return;
    }
    const options = idleTables.map((t) => `${t.tableNumber}`).join('、');
    const target = window.prompt(`换到哪一桌？可选：${options}`, idleTables[0].tableNumber);
    const toTable = idleTables.find((t) => t.tableNumber === target);
    if (!toTable) return;
    await run(async () => {
      await api.post(
        `/table-sessions/${table.activeSession!.id}/transfer`,
        { fromTableId: table.id, toTableId: toTable.id },
        'staffToken',
      );
      onClose();
    });
  }

  async function updatePartySize() {
    if (!table.activeSession) return;
    const partySize = Number(window.prompt('改成几位客人？', String(table.activeSession.partySize)));
    if (!partySize || partySize < 1) return;
    await run(async () => {
      await api.patch(`/table-sessions/${table.activeSession!.id}/party-size`, { partySize }, 'staffToken');
    });
  }

  if (!order) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">加载中…</CardContent>
      </Card>
    );
  }

  const sessionTables = allTables.filter((t) => t.activeSession?.id === table.activeSession?.id);
  const hasUnsubmitted = order.items.some((i) => i.roundNumber === 0);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{table.tableNumber} 账单</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {table.activeSession?.partySize} 位客人
            {sessionTables.length > 1 && ` · 并台：${sessionTables.map((t) => t.tableNumber).join('+')}`}
            {' · '}
            {ORDER_STATUS_LABEL[order.status]}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          ×
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            操作失败：{error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={updatePartySize}>
            改人数
          </Button>
          <Button variant="outline" size="sm" onClick={transferTable}>
            换桌
          </Button>
          {sessionTables.length > 1 &&
            sessionTables.map((t) => (
              <Button key={t.id} variant="outline" size="sm" onClick={() => unmergeTable(t.id)}>
                把 {t.tableNumber} 拆出去
              </Button>
            ))}
        </div>

        <Separator />

        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-foreground">
                  {item.dishNameSnapshot} × {item.quantity}
                </p>
                <p className="text-muted-foreground">
                  ¥{(Number(item.unitPriceSnapshot) * item.quantity).toFixed(2)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.roundNumber === 0 ? (
                  <>
                    <Badge variant="secondary">未提交</Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => changeQty(item.id, item.quantity - 1)}
                    >
                      −
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => changeQty(item.id, item.quantity + 1)}
                    >
                      +
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)}>
                      删除
                    </Button>
                  </>
                ) : (
                  <Badge className={KITCHEN_STATUS_BADGE_CLASS[item.kitchenStatus]}>
                    {KITCHEN_STATUS_LABEL[item.kitchenStatus]}
                  </Badge>
                )}
                {isManager && item.roundNumber > 0 && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => voidItem(item.id)}>
                      作废
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        overrideItemPrice(item.id, String(Number(item.unitPriceSnapshot) * item.quantity))
                      }
                    >
                      改价
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        {hasUnsubmitted && <Button onClick={submitCart}>提交给厨房</Button>}

        <Separator />

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">加菜（代客点餐）</h3>
          {menu.map((category) => (
            <div key={category.id} className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">{category.name}</p>
              <ul className="flex flex-col gap-1">
                {category.dishes
                  .filter((d) => d.isAvailable)
                  .map((dish) => (
                    <li key={dish.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {dish.name} · ¥{Number(dish.price).toFixed(2)}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => addItem(dish.id)}>
                        加入
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator />

        <p className="text-sm text-foreground">
          小计 ¥{Number(order.subtotal).toFixed(2)} － 折扣 ¥{Number(order.discountTotal).toFixed(2)} ＝ 合计 ¥
          {Number(order.total).toFixed(2)}
        </p>

        {isManager && (
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setShowPriceAdjust((v) => !v)}
            >
              调整价格
            </Button>
            {showPriceAdjust && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={applyDiscount}>
                  整单打折
                </Button>
                <Button variant="outline" size="sm" onClick={overrideOrderTotal}>
                  整单直接改价
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {order.status === 'open' && (
            <Button variant="outline" onClick={requestCheckout}>
              发起结账
            </Button>
          )}
          {isManager && order.status !== 'paid' && order.status !== 'cancelled' && (
            <Button variant="destructive" onClick={cancelTableOpen}>
              取消开台
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
