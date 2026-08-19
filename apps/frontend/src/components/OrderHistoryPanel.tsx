import { useEffect, useState } from 'react';
import type { OrderDetail, OrderListItem } from '@restaurant/shared-types';
import { api } from '../api/client';

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

// 历史订单查看（精简版）：列表 + 只读详情，不带任何编辑操作——要改单还是回桌台看板那边走
// OrderDetailPanel。这里纯粹是"翻回去看某一单当时点了什么、收了多少钱"。
export default function OrderHistoryPanel() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = statusFilter ? `?status=${statusFilter}` : '';
    api
      .get<OrderListItem[]>(`/orders${query}`, 'staffToken')
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  }, [statusFilter]);

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
    <section>
      <h2>历史订单</h2>
      {error && <p style={{ color: 'red' }}>操作失败：{error}</p>}

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="">全部状态</option>
        <option value="open">进行中</option>
        <option value="awaiting_payment">待结账</option>
        <option value="paid">已支付</option>
        <option value="cancelled">已取消</option>
      </select>

      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            <button onClick={() => setSelectedId(order.id)}>
              {new Date(order.createdAt).toLocaleString()} · {tableLabel(order)} · ¥{Number(order.total).toFixed(2)} ·{' '}
              {STATUS_LABEL[order.status]}
            </button>
          </li>
        ))}
        {orders.length === 0 && <li>没有符合条件的订单</li>}
      </ul>

      {detail && (
        <div>
          <h3>
            订单详情 · {TYPE_LABEL[detail.type]} · {STATUS_LABEL[detail.status]}
            <button onClick={() => setSelectedId(null)}>关闭</button>
          </h3>
          <ul>
            {detail.items.map((item) => (
              <li key={item.id}>
                {item.dishNameSnapshot} x{item.quantity} — ¥{(Number(item.unitPriceSnapshot) * item.quantity).toFixed(2)}
                {item.roundNumber > 0 && ` — ${KITCHEN_STATUS_LABEL[item.kitchenStatus]}`}
              </li>
            ))}
          </ul>
          <p>
            小计 ¥{Number(detail.subtotal).toFixed(2)} － 折扣 ¥{Number(detail.discountTotal).toFixed(2)} ＝ 合计 ¥
            {Number(detail.total).toFixed(2)}
          </p>
          {detail.payments.length > 0 && (
            <ul>
              {detail.payments.map((p) => (
                <li key={p.id}>
                  收款 ¥{Number(p.amount).toFixed(2)}（{p.method}）· {new Date(p.collectedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
