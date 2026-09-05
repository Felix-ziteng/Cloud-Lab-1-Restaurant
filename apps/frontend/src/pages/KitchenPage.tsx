import { useCallback, useEffect, useState } from 'react';
import type { KitchenQueueItem } from '@restaurant/shared-types';
import { api } from '../api/client';
import { RealtimeProvider, RealtimeListener } from '../realtime/RealtimeContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  preparing: '制作中',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: 'bg-status-pending text-status-pending-foreground',
  preparing: 'bg-status-preparing text-status-preparing-foreground',
};

// 厨房 KDS 看板：站点级访问，不登录（2026-08-20 决策，见 kitchen.controller.ts）——
// 这台设备固定摆在厨房，谁都能看谁都能操作，不需要区分是哪个店员在标记完成
export default function KitchenPage() {
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<KitchenQueueItem[]>([]);

  const loadQueue = useCallback(async () => {
    const res = await api.get<KitchenQueueItem[]>('/order-items/queue');
    setQueue(res);
  }, []);

  useEffect(() => {
    loadQueue().catch(() => setError('加载失败，请刷新重试'));
  }, [loadQueue]);

  async function markStatus(itemId: string, status: 'preparing' | 'done') {
    setError(null);
    try {
      await api.patch(`/order-items/${itemId}/kitchen-status`, { status });
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  function tableLabel(item: KitchenQueueItem) {
    const tableNumbers = item.order.tableSession?.tables.map((t) => t.table.tableNumber).join('+');
    return tableNumbers ?? item.order.type;
  }

  return (
    <RealtimeProvider channel="kitchen">
      <RealtimeListener event="connect" onEvent={() => loadQueue().catch(() => {})} />
      <RealtimeListener event="new_order_item" onEvent={() => loadQueue().catch(() => {})} />
      <RealtimeListener event="item_status_changed" onEvent={() => loadQueue().catch(() => {})} />
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <h1 className="text-xl font-semibold text-foreground">厨房看板</h1>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              操作失败：{error}
            </div>
          )}

          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无待处理订单</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {queue.map((item) => (
                <Card key={item.id}>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-base">{tableLabel(item)}</CardTitle>
                    <Badge className={STATUS_BADGE_CLASS[item.kitchenStatus]}>
                      {STATUS_LABEL[item.kitchenStatus]}
                    </Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div>
                      <p className="text-base font-medium text-foreground">
                        {item.dishNameSnapshot} × {item.quantity}
                      </p>
                      {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {item.selectedModifiers.map((m) => m.optionLabel).join(' · ')}
                        </p>
                      )}
                      {item.notes && <p className="text-sm text-muted-foreground">备注：{item.notes}</p>}
                    </div>
                    <div className="flex gap-2">
                      {item.kitchenStatus === 'pending' && (
                        <Button variant="outline" className="flex-1" onClick={() => markStatus(item.id, 'preparing')}>
                          开始制作
                        </Button>
                      )}
                      <Button className="flex-1" onClick={() => markStatus(item.id, 'done')}>
                        完成
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </RealtimeProvider>
  );
}
