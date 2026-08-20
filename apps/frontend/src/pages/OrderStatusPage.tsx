import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { OrderDetail } from '@restaurant/shared-types';
import { api, getToken } from '../api/client';
import { RealtimeProvider, RealtimeListener } from '../realtime/RealtimeContext';
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
  open: '制作中',
  awaiting_payment: '待结账',
  paid: '已完成',
  cancelled: '已取消',
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

  if (!orderId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">缺少订单信息</p>
      </div>
    );
  }

  if (!hasToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="mx-auto flex max-w-sm flex-col gap-2 text-center">
          <p className="text-sm text-muted-foreground">没有找到这张订单的登录信息。</p>
          <a href="/track-order" className="text-sm text-primary underline underline-offset-2">
            点这里用订单号 + 手机号查询
          </a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-destructive">{error}</p>
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

  return (
    <RealtimeProvider tokenKind={tokenKind}>
      <RealtimeListener event="connect" onEvent={() => refresh()} />
      <RealtimeListener event="order_updated" onEvent={() => refresh()} />
      <div className="min-h-screen bg-background p-4">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>订单 #{order.orderNumber}</CardTitle>
              <Badge variant="secondary">{ORDER_STATUS_LABEL[order.status]}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p>类型：{order.type === 'delivery' ? '配送到家' : '到店自提'}</p>
                {order.type === 'delivery' && order.deliveryInfo && (
                  <p>配送状态：{DELIVERY_STATUS_LABEL[order.deliveryInfo.status]}</p>
                )}
                {order.type === 'takeout' && order.pickupTime && (
                  <p>期望取餐时间：{new Date(order.pickupTime).toLocaleString()}</p>
                )}
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">菜品</h2>
                <ul className="flex flex-col gap-2">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-foreground">
                        {item.dishNameSnapshot} × {item.quantity}
                      </span>
                      <Badge className={KITCHEN_STATUS_BADGE_CLASS[item.kitchenStatus]}>
                        {KITCHEN_STATUS_LABEL[item.kitchenStatus]}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <p className="text-sm font-medium text-foreground">
                  合计：¥{Number(order.total).toFixed(2)}（到店/送达时付款）
                </p>
              </div>

              <p className="text-sm text-muted-foreground">
                记好订单号 #{order.orderNumber}，换设备/清缓存后可以用它 + 手机号重新查到这张单。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </RealtimeProvider>
  );
}
