import { Navigate, useOutletContext } from 'react-router-dom';
import ReservationsPanel from '../components/ReservationsPanel';
import type { FrontDeskContext } from './FrontDeskLayout';

// 预定模块默认关闭（见项目记忆 delivery_reservation_modules_off_by_default）：config 还没
// 拉回来之前先不下结论，避免刷新瞬间闪一下"未开放"再跳走
export default function FrontDeskReservationsPage() {
  const { config } = useOutletContext<FrontDeskContext>();
  if (config && !config.reservationEnabled) return <Navigate to="/front-desk" replace />;
  return <ReservationsPanel />;
}
