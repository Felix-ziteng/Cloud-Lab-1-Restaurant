import { useState } from 'react';
import type { Table } from '@restaurant/shared-types';
import { api } from '../api/client';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'] as const;

function LockIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function BackspaceIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="oklch(50% 0.02 40)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
      <path d="M18 9l-6 6M12 9l6 6" />
    </svg>
  );
}

// 桌台平板的第一屏：每张桌自己固定的 4 位密码（贴在桌上），不挂店员登录（见项目决策记录）。
// 密码只是挡客人瞎捣乱，不是真安全边界，所以不限制重试次数，错了直接提示重来。
// 密码直接定位到是哪张桌——不管这张桌当前空闲还是已被占用（比如前台已经开台了）。
export default function TabletPasscodeScreen({
  onSuccess,
}: {
  onSuccess: (result: { table: Table; passcode: string }) => void;
}) {
  const [digits, setDigits] = useState('');
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);

  async function submit(passcode: string) {
    setChecking(true);
    try {
      const table = await api.post<Table>('/tables/resolve-passcode', { passcode });
      onSuccess({ table, passcode });
    } catch {
      setWrong(true);
      setDigits('');
    } finally {
      setChecking(false);
    }
  }

  function press(key: (typeof KEYS)[number]) {
    if (checking) return;
    setWrong(false);
    if (key === 'backspace') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (key === '') return;
    const next = digits.length < 4 ? digits + key : digits;
    setDigits(next);
    if (next.length === 4) submit(next);
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[oklch(98%_0.006_40)] font-['Nunito_Sans',system-ui,sans-serif] text-[oklch(22%_0.01_30)]">
      <div className="flex w-[460px] flex-col items-center gap-9">
        <div className="flex flex-col items-center gap-2.5">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[oklch(60%_0.21_35)]">
            <LockIcon />
          </div>
          <h1 className="font-['Baloo_2',system-ui,sans-serif] text-2xl font-bold">请输入开台密码</h1>
          <p className="text-sm text-[oklch(50%_0.02_40)]">这张桌自己的密码，贴在桌上</p>
          {wrong && <p className="text-sm font-bold text-[oklch(50%_0.2_25)]">密码错误，请重新输入</p>}
        </div>

        <div className="flex gap-4.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={
                i < digits.length
                  ? 'size-5 rounded-full bg-[oklch(60%_0.21_35)]'
                  : wrong
                    ? 'size-5 rounded-full border-2 border-[oklch(60%_0.2_25)]'
                    : 'size-5 rounded-full border-2 border-[oklch(85%_0.02_50)]'
              }
            />
          ))}
        </div>

        <div className="grid w-full grid-cols-3 gap-4.5">
          {KEYS.map((key, i) => (
            <button
              key={i}
              type="button"
              disabled={key === ''}
              onClick={() => press(key)}
              className="flex aspect-square items-center justify-center rounded-3xl bg-white shadow-[0_2px_4px_oklch(20%_0.02_30_/_0.06),0_8px_20px_oklch(20%_0.02_30_/_0.08)] disabled:opacity-0"
            >
              {key === 'backspace' ? (
                <BackspaceIcon />
              ) : (
                <span className="font-['Baloo_2',system-ui,sans-serif] text-[34px] font-bold">{key}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
