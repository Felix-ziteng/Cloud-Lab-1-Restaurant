import { useEffect, useState } from 'react';
import type { StoreConfig, Table } from '@restaurant/shared-types';
import { api, setToken, clearToken } from '../api/client';
import { RealtimeProvider, RealtimeListener } from '../realtime/RealtimeContext';
import TabletPasscodeScreen from '../components/TabletPasscodeScreen';
import TabletPartySizeScreen from '../components/TabletPartySizeScreen';
import TabletOrderingCompact from '../components/TabletOrderingCompact';
import TabletOrderingBrowse from '../components/TabletOrderingBrowse';

type Phase = 'passcode' | 'select' | 'ordering';

interface ActiveSession {
  tableId: string;
  tableNumber: string;
  orderId: string;
}

// 平板固定 10-12 寸横屏使用（产品决策，非响应式设计目标）。低于这个宽度或竖屏时，
// 菜单网格/侧栏这些横屏专用布局会挤成一团不成样子，不如直接提示摆正设备。
const MIN_LANDSCAPE_WIDTH = 900;

function useIsLandscapeTablet() {
  const [ok, setOk] = useState(
    () => window.innerWidth >= MIN_LANDSCAPE_WIDTH && window.innerWidth > window.innerHeight,
  );
  useEffect(() => {
    function check() {
      setOk(window.innerWidth >= MIN_LANDSCAPE_WIDTH && window.innerWidth > window.innerHeight);
    }
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return ok;
}

function RotateIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="16" rx="2" transform="rotate(90 12 10)" />
      <path d="M20 13a8 8 0 1 1-2-7" />
      <path d="M20 2v5h-5" />
    </svg>
  );
}

function LandscapeGuardScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[oklch(98%_0.006_40)] p-8 font-['Nunito_Sans',system-ui,sans-serif] text-[oklch(22%_0.01_30)]">
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-[oklch(60%_0.21_35)]">
          <RotateIcon />
        </div>
        <h1 className="font-['Baloo_2',system-ui,sans-serif] text-xl font-bold">请横向摆放平板</h1>
        <p className="text-sm text-[oklch(50%_0.02_40)]">点餐台需要在 10-12 寸平板的横屏模式下使用，请将设备转为横屏后重新打开</p>
      </div>
    </div>
  );
}

// 桌台平板固定打开的这一个页面（所有平板都配置成同一个网址，见项目决策记录）：
// 密码 -> 人数确认/直接接入 -> 点餐视图，三段状态机，不用 URL 参数记录当前在服务哪张桌
// （平板不换页面，只切内部视图）。清台后自动退回密码页靠监听 table_session_ended。
// 密码不再是全店统一的（见项目决策记录）：每张桌自己固定一个密码，输入后直接定位到
// 是哪张桌，不管这张桌当前空闲还是已被占用。
export default function TabletStationPage() {
  const [phase, setPhase] = useState<Phase>('passcode');
  const [passcode, setPasscode] = useState('');
  const [resolvedTable, setResolvedTable] = useState<Table | null>(null);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [config, setConfig] = useState<StoreConfig | null>(null);
  const isLandscapeTablet = useIsLandscapeTablet();

  useEffect(() => {
    api.get<StoreConfig>('/store-config').then(setConfig).catch(() => {});
  }, []);

  if (!isLandscapeTablet) {
    return <LandscapeGuardScreen />;
  }

  function resetToPasscode() {
    if (session) clearToken(`guest:${session.tableId}`);
    setSession(null);
    setPasscode('');
    setResolvedTable(null);
    setPhase('passcode');
  }

  if (phase === 'passcode') {
    return (
      <TabletPasscodeScreen
        onSuccess={({ table, passcode: pin }) => {
          setResolvedTable(table);
          setPasscode(pin);
          setPhase('select');
        }}
      />
    );
  }

  if (phase === 'select') {
    if (!resolvedTable) {
      resetToPasscode();
      return null;
    }
    return (
      <TabletPartySizeScreen
        table={resolvedTable}
        passcode={passcode}
        onBack={resetToPasscode}
        onOpened={({ tableId, tableNumber, orderId, sessionToken }) => {
          setToken(`guest:${tableId}`, sessionToken);
          setSession({ tableId, tableNumber, orderId });
          setPhase('ordering');
        }}
      />
    );
  }

  // phase === 'ordering'
  if (!session) {
    resetToPasscode();
    return null;
  }

  const tokenKind = `guest:${session.tableId}`;
  const OrderingView = config?.tabletMenuLayout === 'browse' ? TabletOrderingBrowse : TabletOrderingCompact;

  return (
    <RealtimeProvider tokenKind={tokenKind}>
      {/* 店员在前台点"清台完成"，这一桌的会话房间会收到这一声——平板自动复位回密码页，
          不需要客人或店员在平板上做任何操作 */}
      <RealtimeListener event="table_session_ended" onEvent={resetToPasscode} />
      <OrderingView orderId={session.orderId} tokenKind={tokenKind} tableNumber={session.tableNumber} config={config} />
    </RealtimeProvider>
  );
}
