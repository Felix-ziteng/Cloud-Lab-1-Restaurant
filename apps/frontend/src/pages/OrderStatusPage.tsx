import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { OrderDetail } from '@restaurant/shared-types';
import { api, getToken } from '../api/client';
import { RealtimeProvider, RealtimeListener } from '../realtime/RealtimeContext';

const KITCHEN_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  preparing: '制作中',
  done: '已完成',
};

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  unassigned: '未出发',
  delivering: '配送中',
  delivered: '已送达',
};

// 外卖/自提顾客的订单状态查看页。前提是本地存着这张单的 guest token——
// 要么刚下单跳转过来（TakeoutOrderPage 已经存好了），要么刚从 /track-order 查回来的。
// 两种情况都保证了：走到这个页面时 token 已经在 localStorage 里，不在这里现场处理"没 token"
// 的找回逻辑（那是 /track-order 一个页面单独的职责，两边不重复）
export default function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const tokenKind = `guest-order:${orderId}`;
  const hasToken = Boolean(orderId && getToken(tokenKind));

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orderId) return;
    try {
      const detail = await api.get<OrderDetail>(`/orders/${orderId}`, tokenKind);
      setOrder(detail);
    } catch {
      setError('加载失败，请刷新重试');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (hasToken) refresh();
  }, [hasToken, refresh]);

  if (!orderId) return <p>缺少订单信息</p>;

  if (!hasToken) {
    return (
      <div>
        <p>没有找到这张订单的登录信息。</p>
        <p>
          <a href="/track-order">点这里用订单号 + 手机号查询</a>
        </p>
      </div>
    );
  }

  if (error) return <p>{error}</p>;
  if (!order) return <p>加载中…</p>;

  return (
    <RealtimeProvider tokenKind={tokenKind}>
      <RealtimeListener event="connect" onEvent={() => refresh()} />
      <RealtimeListener event="order_updated" onEvent={() => refresh()} />
      <div>
        <h1>订单 #{order.orderNumber}</h1>
        <p>类型：{order.type === 'delivery' ? '配送到家' : '到店自提'}</p>
        <p>
          状态：
          {order.status === 'open' && '制作中'}
          {order.status === 'awaiting_payment' && '待结账'}
          {order.status === 'paid' && '已完成'}
          {order.status === 'cancelled' && '已取消'}
        </p>

        {order.type === 'delivery' && order.deliveryInfo && (
          <p>配送状态：{DELIVERY_STATUS_LABEL[order.deliveryInfo.status]}</p>
        )}
        {order.type === 'takeout' && order.pickupTime && (
          <p>期望取餐时间：{new Date(order.pickupTime).toLocaleString()}</p>
        )}

        <section>
          <h2>菜品</h2>
          <ul>
            {order.items.map((item) => (
              <li key={item.id}>
                {item.dishNameSnapshot} x{item.quantity} — {KITCHEN_STATUS_LABEL[item.kitchenStatus]}
              </li>
            ))}
          </ul>
          <p>合计：¥{Number(order.total).toFixed(2)}（到店/送达时付款）</p>
        </section>

        <p>记好订单号 #{order.orderNumber}，换设备/清缓存后可以用它 + 手机号重新查到这张单。</p>
      </div>
    </RealtimeProvider>
  );
}
