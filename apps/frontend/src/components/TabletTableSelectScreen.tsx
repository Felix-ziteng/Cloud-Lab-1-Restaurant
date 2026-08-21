import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface IdleTable {
  id: string;
  tableNumber: string;
  capacity: number;
  zone: string | null;
}

const QUICK_PARTY_SIZES = [1, 2, 3, 4, 5];

// 桌台平板第二屏：密码验证通过后，服务员在这台平板上现场选空闲桌 + 填人数，
// 确认后直接调 tablet-open 开台（复用 GuestOrderPage 那套 join 逻辑，见后端 tabletOpen）。
export default function TabletTableSelectScreen({
  passcode,
  onOpened,
}: {
  passcode: string;
  onOpened: (result: { tableId: string; tableNumber: string; orderId: string; sessionToken: string }) => void;
}) {
  const [tables, setTables] = useState<IdleTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(2);
  const [customPartySize, setCustomPartySize] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<IdleTable[]>('/tables/idle')
      .then((list) => {
        setTables(list);
        setSelectedTableId((prev) => prev ?? list[0]?.id ?? null);
      })
      .catch(() => setError('桌台列表加载失败，请重试'));
  }, []);

  const selectedTable = tables.find((t) => t.id === selectedTableId);

  async function confirmOpen() {
    if (!selectedTableId || !partySize || partySize < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ sessionToken: string; orderId: string; tableNumber: string }>(
        `/table-sessions/${selectedTableId}/tablet-open`,
        { partySize, passcode },
      );
      onOpened({ tableId: selectedTableId, tableNumber: res.tableNumber, orderId: res.orderId, sessionToken: res.sessionToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : '开台失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-screen bg-[oklch(98%_0.006_40)] font-['Nunito_Sans',system-ui,sans-serif] text-[oklch(22%_0.01_30)]">
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-10">
        <div>
          <h1 className="font-['Baloo_2',system-ui,sans-serif] text-2xl font-bold">选择空闲桌台</h1>
          <p className="text-sm text-[oklch(50%_0.02_40)]">点一张桌子，再选人数，确认后就能把平板交给客人</p>
        </div>

        {error && (
          <div className="rounded-2xl bg-[oklch(93%_0.06_25)] px-4 py-2.5 text-sm text-[oklch(45%_0.18_25)]">{error}</div>
        )}

        <div className="grid grid-cols-4 gap-5">
          {tables.map((table) => {
            const isSelected = table.id === selectedTableId;
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => setSelectedTableId(table.id)}
                className={
                  isSelected
                    ? 'flex flex-col gap-2.5 rounded-[20px] bg-[oklch(60%_0.21_35)] p-5 text-left shadow-[0_2px_4px_oklch(20%_0.02_30_/_0.06),0_8px_20px_oklch(20%_0.02_30_/_0.08)]'
                    : 'flex flex-col gap-2.5 rounded-[20px] border border-[oklch(92%_0.01_40)] bg-white p-5 text-left shadow-[0_2px_4px_oklch(20%_0.02_30_/_0.06),0_8px_20px_oklch(20%_0.02_30_/_0.08)]'
                }
              >
                <span
                  className={
                    isSelected
                      ? "font-['Baloo_2',system-ui,sans-serif] text-3xl font-bold text-white"
                      : "font-['Baloo_2',system-ui,sans-serif] text-3xl font-bold"
                  }
                >
                  {table.tableNumber}
                </span>
                <span className={isSelected ? 'text-sm font-semibold text-white/85' : 'text-sm font-semibold text-[oklch(50%_0.02_40)]'}>
                  {table.capacity} 人桌{table.zone ? ` · ${table.zone}` : ''}
                </span>
              </button>
            );
          })}
          {tables.length === 0 && !error && (
            <p className="col-span-4 text-sm text-[oklch(50%_0.02_40)]">暂无空闲桌台</p>
          )}
        </div>
      </div>

      <div className="flex w-[380px] shrink-0 flex-col gap-6 bg-white p-9 shadow-[-4px_0_20px_oklch(20%_0.02_30_/_0.06)]">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[oklch(50%_0.02_40)]">已选桌台</p>
          <p className="font-['Baloo_2',system-ui,sans-serif] text-4xl font-bold text-[oklch(60%_0.21_35)]">
            {selectedTable?.tableNumber ?? '—'}
          </p>
        </div>

        <div className="h-px bg-[oklch(92%_0.01_40)]" />

        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[oklch(50%_0.02_40)]">用餐人数</p>
          <div className="grid grid-cols-3 gap-3">
            {QUICK_PARTY_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setPartySize(n);
                  setCustomPartySize(false);
                }}
                className={
                  !customPartySize && partySize === n
                    ? "flex aspect-square items-center justify-center rounded-2xl bg-[oklch(60%_0.21_35)] font-['Baloo_2',system-ui,sans-serif] text-xl font-bold text-white"
                    : "flex aspect-square items-center justify-center rounded-2xl bg-[oklch(94%_0.01_40)] font-['Baloo_2',system-ui,sans-serif] text-xl font-bold"
                }
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCustomPartySize(true);
                setPartySize(6);
              }}
              className={
                customPartySize
                  ? "flex aspect-square items-center justify-center rounded-2xl bg-[oklch(60%_0.21_35)] font-['Baloo_2',system-ui,sans-serif] text-xl font-bold text-white"
                  : "flex aspect-square items-center justify-center rounded-2xl bg-[oklch(94%_0.01_40)] font-['Baloo_2',system-ui,sans-serif] text-xl font-bold"
              }
            >
              6+
            </button>
          </div>

          {customPartySize && (
            <input
              type="number"
              min={6}
              value={partySize}
              onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 6))}
              placeholder="具体人数"
              className="w-full rounded-2xl border border-[oklch(90%_0.01_40)] bg-white px-4 py-3 text-center text-lg font-bold outline-none focus:border-[oklch(60%_0.21_35)]"
            />
          )}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          disabled={!selectedTableId || busy}
          onClick={confirmOpen}
          className="rounded-[20px] bg-[oklch(60%_0.21_35)] p-5 text-center font-['Baloo_2',system-ui,sans-serif] text-lg font-bold text-white disabled:opacity-50"
        >
          确认开台
        </button>
      </div>
    </div>
  );
}
