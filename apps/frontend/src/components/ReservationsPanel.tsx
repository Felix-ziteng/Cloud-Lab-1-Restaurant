import { useEffect, useState, type FormEvent } from 'react';
import type { Reservation, TableWithSession } from '@restaurant/shared-types';
import { api } from '../api/client';

const STATUS_LABEL: Record<string, string> = {
  pending: '待到店',
  arrived: '已到店',
  cancelled: '已取消',
  no_show: '未到',
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
    const timer = setInterval(load, 30000);
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
    <section>
      <h2>预定管理</h2>
      {error && <p style={{ color: 'red' }}>操作失败：{error}</p>}

      <ul>
        {reservations.map((r) => (
          <li key={r.id} style={isUpcoming(r) ? { color: 'red', fontWeight: 'bold' } : undefined}>
            {new Date(r.reservedTime).toLocaleString()} · {r.customerName} · {r.phone} · {r.partySize}人 ·{' '}
            {STATUS_LABEL[r.status]}
            {r.note && ` · 备注：${r.note}`}
            {r.status === 'pending' && (
              <>
                <button onClick={() => arrive(r.id)}>到店开台</button>
                <button onClick={() => cancelReservation(r.id)}>取消</button>
              </>
            )}
          </li>
        ))}
        {reservations.length === 0 && <li>暂无预定</li>}
      </ul>

      <form onSubmit={createReservation}>
        <input
          placeholder="客人姓名"
          value={form.customerName}
          onChange={(e) => setForm({ ...form, customerName: e.target.value })}
        />
        <input placeholder="电话" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input
          placeholder="人数"
          type="number"
          value={form.partySize}
          onChange={(e) => setForm({ ...form, partySize: e.target.value })}
        />
        <input
          type="datetime-local"
          value={form.reservedTime}
          onChange={(e) => setForm({ ...form, reservedTime: e.target.value })}
        />
        <input placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button type="submit">新增预定</button>
      </form>
    </section>
  );
}
