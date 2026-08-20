import { useEffect, useState, type FormEvent } from 'react';
import type { Reservation, TableWithSession } from '@restaurant/shared-types';
import { api } from '../api/client';
import { useRealtimeEvent } from '../realtime/RealtimeContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_LABEL: Record<string, string> = {
  pending: '待到店',
  arrived: '已到店',
  cancelled: '已取消',
  no_show: '未到',
};

const STATUS_BADGE_VARIANT: Record<string, 'secondary' | 'outline'> = {
  pending: 'secondary',
  arrived: 'secondary',
  cancelled: 'outline',
  no_show: 'outline',
};

// 到点提醒是系统内高亮，不是外部通知（见 DATA_MODEL.md 3.5）：预定时间在 30 分钟内、
// 还没到店的记录，在列表里标红提醒店员注意
const REMINDER_WINDOW_MS = 30 * 60 * 1000;

export default function ReservationsPanel() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<TableWithSession[]>([]);
  const [form, setForm] = useState({ customerName: '', phone: '', partySize: '2', reservedTime: '', note: '' });
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<Reservation[]>('/reservations', 'staffToken').then(setReservations).catch(() => {});
  const loadTables = () => api.get<TableWithSession[]>('/tables', 'staffToken').then(setTables).catch(() => {});

  useEffect(() => {
    load();
    loadTables();
    // 数据变化已经靠 WebSocket 推送了，这个定时器只是为了让"临近提醒"那条高亮逻辑
    // （纯前端按 Date.now() 算的）能定期重新算一遍，不然数据没变时页面不会自己重渲染
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  useRealtimeEvent('connect', () => {
    load();
    loadTables();
  });
  useRealtimeEvent('reservation_changed', () => load());

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function createReservation(e: FormEvent) {
    e.preventDefault();
    if (!form.customerName.trim() || !form.phone.trim() || !form.reservedTime) return;
    await run(async () => {
      await api.post(
        '/reservations',
        {
          customerName: form.customerName,
          phone: form.phone,
          partySize: Number(form.partySize),
          reservedTime: new Date(form.reservedTime).toISOString(),
          note: form.note || undefined,
        },
        'staffToken',
      );
      setForm({ customerName: '', phone: '', partySize: '2', reservedTime: '', note: '' });
    });
  }

  async function cancelReservation(id: string) {
    await run(() => api.patch(`/reservations/${id}/cancel`, {}, 'staffToken'));
  }

  async function arrive(id: string) {
    const idleTables = tables.filter((t) => t.status === 'idle');
    if (idleTables.length === 0) {
      setError('没有空闲桌台可以开台');
      return;
    }
    const options = idleTables.map((t) => t.tableNumber).join('、');
    const picked = window.prompt(`客人到店，开哪张桌？可选：${options}`, idleTables[0].tableNumber);
    const table = idleTables.find((t) => t.tableNumber === picked);
    if (!table) return;
    await run(async () => {
      await api.post(`/reservations/${id}/arrive`, { tableIds: [table.id] }, 'staffToken');
      loadTables();
    });
  }

  function isUpcoming(reservation: Reservation) {
    if (reservation.status !== 'pending') return false;
    const diff = new Date(reservation.reservedTime).getTime() - Date.now();
    return diff >= 0 && diff <= REMINDER_WINDOW_MS;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>预定管理</CardTitle>
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
              <TableHead>预定时间</TableHead>
              <TableHead>客人</TableHead>
              <TableHead>人数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>备注</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservations.map((r) => (
              <TableRow key={r.id} className={isUpcoming(r) ? 'bg-destructive/10' : undefined}>
                <TableCell className={isUpcoming(r) ? 'font-semibold text-destructive' : undefined}>
                  {new Date(r.reservedTime).toLocaleString()}
                </TableCell>
                <TableCell>
                  {r.customerName} · {r.phone}
                </TableCell>
                <TableCell>{r.partySize} 人</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.note ?? '—'}</TableCell>
                <TableCell className="text-right">
                  {r.status === 'pending' && (
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => arrive(r.id)}>
                        到店开台
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => cancelReservation(r.id)}>
                        取消
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {reservations.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  暂无预定
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <form onSubmit={createReservation} className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="客人姓名"
            className="max-w-32"
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
          />
          <Input
            placeholder="电话"
            className="max-w-36"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            placeholder="人数"
            type="number"
            className="w-20"
            value={form.partySize}
            onChange={(e) => setForm({ ...form, partySize: e.target.value })}
          />
          <Input
            type="datetime-local"
            value={form.reservedTime}
            onChange={(e) => setForm({ ...form, reservedTime: e.target.value })}
          />
          <Input
            placeholder="备注（可选）"
            className="max-w-40"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <Button type="submit">新增预定</Button>
        </form>
      </CardContent>
    </Card>
  );
}
