import { useEffect, useState } from 'react';
import type { OrderDetail, OrderListItem } from '@restaurant/shared-types';
import { api } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_LABEL: Record<string, string> = {
  open: '进行中',
  awaiting_payment: '待结账',
  paid: '已支付',
  cancelled: '已取消',
};

const TYPE_LABEL: Record<string, string> = {
  dine_in: '堂食',
  takeout: '自提',
  delivery: '外卖',
};

const KITCHEN_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  preparing: '制作中',
  done: '已完成',
};

interface Props {
  // 传了 from/to 就是从经营概览报表某一天下钻进来的，只看那一天的订单
  // （不传就是默认的"翻全部历史订单"模式，行为跟之前一样）
  from?: string;
  to?: string;
}

// 历史订单查看（精简版）：列表 + 只读详情，不带任何编辑操作——要改单还是回桌台看板那边走
// OrderDetailPanel。这里纯粹是"翻回去看某一单当时点了什么、收了多少钱"。
export default function OrderHistoryPanel({ from, to }: Props) {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (from && to) {
      params.set('from', from);
      params.set('to', to);
      params.set('limit', '200'); // 下钻看某一天的单，默认 50 条可能不够，放宽一点
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    api
      .get<OrderListItem[]>(`/orders${query}`, 'staffToken')
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  }, [statusFilter, from, to]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api
      .get<OrderDetail>(`/orders/${selectedId}`, 'staffToken')
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : '加载详情失败'));
  }, [selectedId]);

  function tableLabel(order: OrderListItem) {
    const tableNumbers = order.tableSession?.tables.map((t) => t.table.tableNumber).join('+');
    return tableNumbers ?? TYPE_LABEL[order.type];
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle>{from && to ? `${from} 订单明细` : '历史订单'}</CardTitle>
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="open">进行中</SelectItem>
            <SelectItem value="awaiting_payment">待结账</SelectItem>
            <SelectItem value="paid">已支付</SelectItem>
            <SelectItem value="cancelled">已取消</SelectItem>
          </SelectContent>
        </Select>
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
              <TableHead>桌台/来源</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id} className="cursor-pointer" onClick={() => setSelectedId(order.id)}>
                <TableCell>{new Date(order.createdAt).toLocaleString()}</TableCell>
                <TableCell>{tableLabel(order)}</TableCell>
                <TableCell>¥{Number(order.total).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{STATUS_LABEL[order.status]}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  没有符合条件的订单
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {detail && (
          <>
            <Separator />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  订单详情 · {TYPE_LABEL[detail.type]} · {STATUS_LABEL[detail.status]}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                  关闭
                </Button>
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {detail.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span className="text-foreground">
                      {item.dishNameSnapshot} × {item.quantity}
                    </span>
                    <span className="text-muted-foreground">
                      ¥{(Number(item.unitPriceSnapshot) * item.quantity).toFixed(2)}
                      {item.roundNumber > 0 && ` · ${KITCHEN_STATUS_LABEL[item.kitchenStatus]}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-foreground">
                小计 ¥{Number(detail.subtotal).toFixed(2)} － 折扣 ¥{Number(detail.discountTotal).toFixed(2)} ＝ 合计 ¥
                {Number(detail.total).toFixed(2)}
              </p>
              {detail.payments.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {detail.payments.map((p) => (
                    <li key={p.id}>
                      收款 ¥{Number(p.amount).toFixed(2)}（{p.method}）· {new Date(p.collectedAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
