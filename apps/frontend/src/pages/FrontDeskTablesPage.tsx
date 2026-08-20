import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { TableWithSession } from '@restaurant/shared-types';
import { api } from '../api/client';
import { RealtimeListener } from '../realtime/RealtimeContext';
import OrderDetailPanel from '../components/OrderDetailPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { FrontDeskContext } from './FrontDeskLayout';

const TABLE_STATUS_LABEL: Record<string, string> = {
  idle: '空闲',
  occupied: '占用',
  pending_clear: '待清台',
};

const TABLE_STATUS_BADGE_CLASS: Record<string, string> = {
  idle: 'bg-secondary text-secondary-foreground',
  occupied: 'bg-primary/10 text-primary',
  pending_clear: 'bg-status-preparing text-status-preparing-foreground',
};

// 前台的默认首页：桌台看板 + 选中桌台的账单详情。这是店员每天用得最多的核心操作，
// 单独占一个路由，不跟报表/管理这些低频页面挤在一起（见前台重构计划）。
export default function FrontDeskTablesPage() {
  const { role } = useOutletContext<FrontDeskContext>();
  const [tables, setTables] = useState<TableWithSession[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadTables = useCallback(async () => {
    const res = await api.get<TableWithSession[]>('/tables', 'staffToken');
    setTables(res);
  }, []);

  useEffect(() => {
    loadTables().catch(() => {});
  }, [loadTables]);

  async function runAction(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function openTable(tableId: string) {
    const partySize = Number(window.prompt('用餐人数？', '2'));
    if (!partySize || partySize < 1) return;
    await runAction(async () => {
      await api.post('/table-sessions', { tableIds: [tableId], partySize }, 'staffToken');
      await loadTables();
    });
  }

  async function clearTable(tableId: string) {
    await runAction(async () => {
      await api.post(`/tables/${tableId}/clear`, {}, 'staffToken');
      setSelectedTableId(null);
      await loadTables();
    });
  }

  const selectedTable = tables.find((t) => t.id === selectedTableId);

  return (
    <>
      <RealtimeListener event="connect" onEvent={() => loadTables().catch(() => {})} />
      <RealtimeListener event="table_status_changed" onEvent={() => loadTables().catch(() => {})} />
      <RealtimeListener event="order_created" onEvent={() => loadTables().catch(() => {})} />
      <RealtimeListener event="checkout_requested" onEvent={() => loadTables().catch(() => {})} />

      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          操作失败：{actionError}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">桌台看板</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {tables.map((table) => {
            const clickable = table.status !== 'idle';
            const isSelected = table.id === selectedTableId;
            return (
              <Card
                key={table.id}
                className={
                  clickable
                    ? `cursor-pointer transition-colors hover:border-primary/50${isSelected ? ' border-primary' : ''}`
                    : undefined
                }
                onClick={clickable ? () => setSelectedTableId(isSelected ? null : table.id) : undefined}
              >
                <CardContent className="flex flex-col gap-2 py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-foreground">{table.tableNumber}</span>
                    <Badge className={TABLE_STATUS_BADGE_CLASS[table.status]}>
                      {TABLE_STATUS_LABEL[table.status]}
                    </Badge>
                  </div>
                  {table.activeSession && (
                    <p className="text-sm text-muted-foreground">
                      {table.activeSession.partySize} 人 · ¥{Number(table.activeSession.order.total).toFixed(2)}
                    </p>
                  )}
                  {table.status === 'idle' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTable(table.id);
                      }}
                    >
                      开台
                    </Button>
                  )}
                  {table.status === 'pending_clear' && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearTable(table.id);
                      }}
                    >
                      清台完成
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {selectedTable?.activeSession && (
        <OrderDetailPanel
          table={selectedTable}
          allTables={tables}
          isManager={role === 'manager'}
          onChanged={() => loadTables()}
          onClose={() => setSelectedTableId(null)}
        />
      )}
    </>
  );
}
