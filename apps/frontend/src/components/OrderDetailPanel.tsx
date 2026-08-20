import { useCallback, useEffect, useState } from 'react';
import type { MenuCategory, OrderDetail, TableWithSession } from '@restaurant/shared-types';
import { api } from '../api/client';
import { useRealtimeEvent } from '../realtime/RealtimeContext';

const KITCHEN_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  preparing: '制作中',
  done: '已完成',
};

interface Props {
  table: TableWithSession;
  allTables: TableWithSession[];
  isManager: boolean;
  onChanged: () => void;
  onClose: () => void;
}

// 选中一桌之后的账单/操作面板：加菜、改购物车、提交、改价（manager）、收款、拆台/换桌/改人数。
// 从 FrontDeskPage 拆出来单独一个组件，不然那个文件要爆炸了。
export default function OrderDetailPanel({ table, allTables, isManager, onChanged, onClose }: Props) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  async function recordPayment() {
    if (!order) return;
    const amount = Number(window.prompt('实收金额？', order.total));
    if (!amount || amount < 0) return;
    await run(async () => {
      await api.post(`/orders/${orderId}/payments`, { method: 'cash', amount }, 'staffToken');
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

  if (!order) return <section>加载中…</section>;

  const sessionTables = allTables.filter((t) => t.activeSession?.id === table.activeSession?.id);
  const hasUnsubmitted = order.items.some((i) => i.roundNumber === 0);

  return (
    <section>
      <h2>{table.tableNumber} 账单</h2>
      {error && <p style={{ color: 'red' }}>操作失败：{error}</p>}

      <p>
        {table.activeSession?.partySize} 位客人
        <button onClick={updatePartySize}>改人数</button>
        {sessionTables.length > 1 && <span>（并台：{sessionTables.map((t) => t.tableNumber).join('+')}）</span>}
      </p>

      {sessionTables.length > 1 &&
        sessionTables.map((t) => (
          <button key={t.id} onClick={() => unmergeTable(t.id)}>
            把 {t.tableNumber} 拆出去
          </button>
        ))}
      <button onClick={transferTable}>换桌</button>

      <ul>
        {order.items.map((item) => (
          <li key={item.id}>
            {item.dishNameSnapshot} x{item.quantity} — ¥{(Number(item.unitPriceSnapshot) * item.quantity).toFixed(2)} —{' '}
            {item.roundNumber === 0 ? (
              <>
                未提交
                <button onClick={() => changeQty(item.id, item.quantity - 1)}>−</button>
                <button onClick={() => changeQty(item.id, item.quantity + 1)}>+</button>
                <button onClick={() => removeItem(item.id)}>删除</button>
              </>
            ) : (
              KITCHEN_STATUS_LABEL[item.kitchenStatus]
            )}
            {isManager && item.roundNumber > 0 && (
              <>
                <button onClick={() => voidItem(item.id)}>作废</button>
                <button onClick={() => overrideItemPrice(item.id, String(Number(item.unitPriceSnapshot) * item.quantity))}>
                  改这项价格
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {hasUnsubmitted && <button onClick={submitCart}>提交给厨房</button>}

      <div>
        <h3>加菜（代客点餐）</h3>
        {menu.map((category) => (
          <div key={category.id}>
            <strong>{category.name}</strong>
            <ul>
              {category.dishes
                .filter((d) => d.isAvailable)
                .map((dish) => (
                  <li key={dish.id}>
                    {dish.name} ¥{Number(dish.price).toFixed(2)}
                    <button onClick={() => addItem(dish.id)}>加入</button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      <p>
        小计 ¥{Number(order.subtotal).toFixed(2)} － 折扣 ¥{Number(order.discountTotal).toFixed(2)} ＝ 合计 ¥
        {Number(order.total).toFixed(2)}
      </p>
      <p>状态：{order.status}</p>

      {isManager && (
        <div>
          <button onClick={applyDiscount}>整单打折</button>
          <button onClick={overrideOrderTotal}>整单直接改价</button>
        </div>
      )}

      {order.status === 'open' && <button onClick={requestCheckout}>发起结账</button>}
      {order.status !== 'paid' && <button onClick={recordPayment}>记录收款</button>}
    </section>
  );
}
