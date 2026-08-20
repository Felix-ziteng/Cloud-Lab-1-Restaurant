import { Navigate, useOutletContext } from 'react-router-dom';
import DeliveryPanel from '../components/DeliveryPanel';
import type { FrontDeskContext } from './FrontDeskLayout';

// 外卖/配送模块默认关闭（见项目记忆 delivery_reservation_modules_off_by_default）：同上，
// config 没拉回来之前先不下结论
export default function FrontDeskDeliveryPage() {
  const { config } = useOutletContext<FrontDeskContext>();
  if (config && !config.deliveryEnabled) return <Navigate to="/front-desk" replace />;
  return <DeliveryPanel />;
}
