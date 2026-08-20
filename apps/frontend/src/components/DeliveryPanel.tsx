import { useEffect, useState, type FormEvent } from 'react';
import type { MenuCategory, OrderListItem } from '@restaurant/shared-types';
import { api } from '../api/client';
import { useRealtimeEvent } from '../realtime/RealtimeContext';

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  unassigned: '未出发',
  delivering: '配送中',
  delivered: '已送达',
};

// 外卖/配送管理（精简版）：店家自己送，没有骑手账号体系，配送状态和收款都由店员在前台直接记录。
export default function DeliveryPanel() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ customerContact: '', deliveryAddress: '' });
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<OrderListItem[]>('/orders?type=delivery', 'staffToken').then(setOrders).catch(() => {});

  useEffect(() => {
    load();
    api.get<MenuCategory[]>('/menu').then(setMenu).catch(() => {});
  }, []);

  useRealtimeEvent('connect', () => load());
  useRealtimeEvent('order_created', () => load());
  useRealtimeEvent('order_updated', () => load());
  useRealtimeEvent('delivery_status_changed', () => load());

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  function addToCart(dishId: string, delta: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[dishId] ?? 0) + delta);
      const updated = { ...prev, [dishId]: next };
      if (next === 0) delete updated[dishId];
      return updated;
    });
  }

  async function createOrder(e: FormEvent) {
    e.preventDefault();
    const items = Object.entries(cart).map(([dishId, quantity]) => ({ dishId, quantity }));
    if (!form.customerContact.trim() || !form.deliveryAddress.trim() || items.length === 0) return;
    await run(async () => {
      await api.post(
        '/orders',
        { type: 'delivery', items, customerContact: form.customerContact, deliveryAddress: form.deliveryAddress },
        'staffToken',
      );
      setCart({});
      setForm({ customerContact: '', deliveryAddress: '' });
    });
  }

  async function markDeparted(orderId: string) {
    await run(() => api.patch(`/orders/${orderId}/delivery/status`, { status: 'delivering' }, 'staffToken'));
  }

  async function recordPayment(orderId: string, total: string) {
    const amount = Number(window.prompt('实收金额？', total));
    if (!amount || amount < 0) return;
    await run(() => api.post(`/orders/${orderId}/payments`, { method: 'cash', amount }, 'staffToken'));
  }

  return (
    <section>
      <h2>外卖/配送管理</h2>
      {error && <p style={{ color: 'red' }}>操作失败：{error}</p>}

      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            {new Date(order.createdAt).toLocaleString()} · {order.customerContact} · {order.deliveryInfo?.address} · ¥
            {Number(order.total).toFixed(2)} · {order.deliveryInfo ? DELIVERY_STATUS_LABEL[order.deliveryInfo.status] : ''} ·{' '}
            {order.status === 'paid' ? '已收款' : '未收款'}
            {(!order.deliveryInfo || order.deliveryInfo.status === 'unassigned') && (
              <button onClick={() => markDeparted(order.id)}>标记已出发</button>
            )}
            {order.status !== 'paid' && <button onClick={() => recordPayment(order.id, order.total)}>记录收款</button>}
          </li>
        ))}
        {orders.length === 0 && <li>暂无外卖订单</li>}
      </ul>

      <h3>新建外卖单（代客下单）</h3>
      <form onSubmit={createOrder}>
        <input
          placeholder="顾客联系电话"
          value={form.customerContact}
          onChange={(e) => setForm({ ...form, customerContact: e.target.value })}
        />
        <input
          placeholder="配送地址"
          value={form.deliveryAddress}
          onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
        />

        {menu.map((category) => (
          <div key={category.id}>
            <strong>{category.name}</strong>
            <ul>
              {category.dishes
                .filter((d) => d.isAvailable)
                .map((dish) => (
                  <li key={dish.id}>
                    {dish.name} ¥{Number(dish.price).toFixed(2)}
                    <button type="button" onClick={() => addToCart(dish.id, -1)} disabled={!cart[dish.id]}>
                      −
                    </button>
                    <span>{cart[dish.id] ?? 0}</span>
                    <button type="button" onClick={() => addToCart(dish.id, 1)}>
                      +
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}

        <button type="submit">创建外卖订单</button>
      </form>
    </section>
  );
}
