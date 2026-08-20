import { useEffect, useState, type FormEvent } from 'react';
import type { MenuCategory, OrderListItem } from '@restaurant/shared-types';
import { api } from '../api/client';
import { useRealtimeEvent } from '../realtime/RealtimeContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    <Card>
      <CardHeader>
        <CardTitle>外卖/配送管理</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            操作失败：{error}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>联系方式</TableHead>
              <TableHead>地址</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>配送状态</TableHead>
              <TableHead>收款</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{new Date(order.createdAt).toLocaleString()}</TableCell>
                <TableCell>{order.customerContact}</TableCell>
                <TableCell className="text-muted-foreground">{order.deliveryInfo?.address}</TableCell>
                <TableCell>¥{Number(order.total).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {order.deliveryInfo ? DELIVERY_STATUS_LABEL[order.deliveryInfo.status] : DELIVERY_STATUS_LABEL.unassigned}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={order.status === 'paid' ? 'secondary' : 'outline'}>
                    {order.status === 'paid' ? '已收款' : '未收款'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {(!order.deliveryInfo || order.deliveryInfo.status === 'unassigned') && (
                      <Button variant="outline" size="sm" onClick={() => markDeparted(order.id)}>
                        标记已出发
                      </Button>
                    )}
                    {order.status !== 'paid' && (
                      <Button size="sm" onClick={() => recordPayment(order.id, order.total)}>
                        记录收款
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  暂无外卖订单
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Separator />

        <form onSubmit={createOrder} className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">新建外卖单（代客下单）</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="顾客联系电话"
              className="max-w-40"
              value={form.customerContact}
              onChange={(e) => setForm({ ...form, customerContact: e.target.value })}
            />
            <Input
              placeholder="配送地址"
              className="max-w-48"
              value={form.deliveryAddress}
              onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
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
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7"
                            onClick={() => addToCart(dish.id, -1)}
                            disabled={!cart[dish.id]}
                          >
                            −
                          </Button>
                          <span className="w-4 text-center text-sm font-medium">{cart[dish.id] ?? 0}</span>
                          <Button
                            type="button"
                            size="icon"
                            className="size-7"
                            onClick={() => addToCart(dish.id, 1)}
                          >
                            +
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>

          <Button type="submit" className="self-start">
            创建外卖订单
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
