import { useEffect, useState, type FormEvent } from 'react';
import type { MenuCategory, OrderListItem, Rider } from '@restaurant/shared-types';
import { api } from '../api/client';

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  unassigned: '未分配',
  assigned: '已分配',
  picked_up: '已取货',
  delivering: '配送中',
  delivered: '已送达',
};

// 外卖/配送管理（精简版）：建单、看列表、分配骑手。骑手那边的取货/送达/收款
// 走单独的骑手端页面（/rider），不在这里操作——店员和骑手是两个不同的物理设备。
export default function DeliveryPanel() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ customerContact: '', deliveryAddress: '' });
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<OrderListItem[]>('/orders?type=delivery', 'staffToken').then(setOrders).catch(() => {});
  const loadRiders = () => api.get<Rider[]>('/riders', 'staffToken').then(setRiders).catch(() => {});

  useEffect(() => {
    load();
    loadRiders();
    api.get<MenuCategory[]>('/menu').then(setMenu).catch(() => {});
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

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

  async function assignRider(orderId: string) {
    const activeRiders = riders.filter((r) => r.status === 'active');
    if (activeRiders.length === 0) {
      setError('没有在职骑手可以分配');
      return;
    }
    const options = activeRiders.map((r) => r.name).join('、');
    const picked = window.prompt(`分配给哪个骑手？可选：${options}`, activeRiders[0].name);
    const rider = activeRiders.find((r) => r.name === picked);
    if (!rider) return;
    await run(() => api.post(`/orders/${orderId}/delivery/assign`, { riderId: rider.id }, 'staffToken'));
  }

  return (
    <section>
      <h2>外卖/配送管理</h2>
      {error && <p style={{ color: 'red' }}>操作失败：{error}</p>}

      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            {new Date(order.createdAt).toLocaleString()} · {order.customerContact} · {order.deliveryInfo?.address} · ¥
            {Number(order.total).toFixed(2)} · {order.deliveryInfo ? DELIVERY_STATUS_LABEL[order.deliveryInfo.status] : ''}
            {order.deliveryInfo?.rider ? ` · 骑手：${order.deliveryInfo.rider.name}` : ' · 未分配骑手'}
            {(!order.deliveryInfo || order.deliveryInfo.status === 'unassigned') && (
              <button onClick={() => assignRider(order.id)}>分配骑手</button>
            )}
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
