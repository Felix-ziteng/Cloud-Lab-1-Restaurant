import { useState } from 'react';
import type { Table } from '@restaurant/shared-types';
import { api } from '../api/client';

const QUICK_PARTY_SIZES = [1, 2, 3, 4, 5];

// 桌台平板第二屏：密码校验时已经知道是哪张桌了（见 TabletPasscodeScreen 的
// resolve-passcode）。空闲桌问人数再开台；已被占用的桌（比如前台已经开台，或者
// 另一台平板已经开了）直接接入现有会话，不问人数——两种情况都复用同一个
// tablet-open 接口，服务端按桌台当前状态决定是新开还是接入（joinOrAutoOpen）。
export default function TabletPartySizeScreen({
  table,
  passcode,
  onOpened,
  onBack,
}: {
  table: Table;
  passcode: string;
  onOpened: (result: { tableId: string; tableNumber: string; orderId: string; sessionToken: string }) => void;
  onBack: () => void;
}) {
  const [partySize, setPartySize] = useState(2);
  const [customPartySize, setCustomPartySize] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isIdle = table.status === 'idle';
  const isPendingClear = table.status === 'pending_clear';

  async function confirmOpen() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ sessionToken: string; orderId: string; tableNumber: string }>(
        `/table-sessions/${table.id}/tablet-open`,
        isIdle ? { partySize, passcode } : { passcode },
      );
      onOpened({ tableId: table.id, tableNumber: res.tableNumber, orderId: res.orderId, sessionToken: res.sessionToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : '开台失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[oklch(98%_0.006_40)] font-['Nunito_Sans',system-ui,sans-serif] text-[oklch(22%_0.01_30)]">
      <div className="flex w-[460px] flex-col items-center gap-7 rounded-[24px] bg-white p-9 shadow-[0_2px_4px_oklch(20%_0.02_30_/_0.06),0_8px_20px_oklch(20%_0.02_30_/_0.08)]">
        <div className="flex flex-col items-center gap-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[oklch(50%_0.02_40)]">已识别桌台</p>
          <p className="font-['Baloo_2',system-ui,sans-serif] text-4xl font-bold text-[oklch(60%_0.21_35)]">
            {table.tableNumber}
          </p>
          <p className="text-sm text-[oklch(50%_0.02_40)]">
            {table.capacity} 人桌{table.zone ? ` · ${table.zone}` : ''}
          </p>
        </div>

        {error && (
          <div className="w-full rounded-2xl bg-[oklch(93%_0.06_25)] px-4 py-2.5 text-center text-sm text-[oklch(45%_0.18_25)]">
            {error}
          </div>
        )}

        {isPendingClear ? (
          <div className="flex w-full flex-col items-center gap-4">
            <p className="text-center text-sm font-semibold text-[oklch(45%_0.18_25)]">
              这张桌待清台，请先联系店员清台后再试
            </p>
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl bg-[oklch(94%_0.01_40)] px-5 py-2.5 text-sm font-bold"
            >
              重新输入密码
            </button>
          </div>
        ) : isIdle ? (
          <>
            <div className="flex w-full flex-col gap-3">
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

            <button
              type="button"
              disabled={!partySize || busy}
              onClick={confirmOpen}
              className="w-full rounded-[20px] bg-[oklch(60%_0.21_35)] p-4 text-center font-['Baloo_2',system-ui,sans-serif] text-lg font-bold text-white disabled:opacity-50"
            >
              确认开台
            </button>
          </>
        ) : (
          <div className="flex w-full flex-col items-center gap-4">
            <p className="text-center text-sm font-semibold text-[oklch(50%_0.02_40)]">
              这张桌正在使用中，接入后可以直接加菜
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={confirmOpen}
              className="w-full rounded-[20px] bg-[oklch(60%_0.21_35)] p-4 text-center font-['Baloo_2',system-ui,sans-serif] text-lg font-bold text-white disabled:opacity-50"
            >
              接入这张桌
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
