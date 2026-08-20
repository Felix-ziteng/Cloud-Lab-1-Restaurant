import { Routes, Route } from 'react-router-dom';
import GuestOrderPage from './pages/GuestOrderPage';
import FrontDeskPage from './pages/FrontDeskPage';
import KitchenPage from './pages/KitchenPage';
import TakeoutOrderPage from './pages/TakeoutOrderPage';
import TrackOrderPage from './pages/TrackOrderPage';
import OrderStatusPage from './pages/OrderStatusPage';

// 路由对应 docs/ARCHITECTURE.md 2.4 的角色划分：
//   /order/:tableId    -> 堂食顾客手机 / 桌台平板（同一视图，靠桌台锚定身份）
//   /takeout           -> 外卖/自提顾客自助下单（不需要登录，没有桌台锚点）
//   /order-status/:id  -> 外卖/自提顾客查看自己这单的状态（凭下单时签发的 guest token）
//   /track-order       -> 换设备/清了缓存后，用"订单号 + 手机号"找回订单
//   /front-desk        -> 店员 / 店长登录站点
//   /kitchen           -> 厨房 KDS 看板
// 骑手自助端（/rider）暂时不需要：配送状态改为店员在前台直接记录，见 DeliveryPanel
function App() {
  return (
    <Routes>
      <Route path="/order/:tableId" element={<GuestOrderPage />} />
      <Route path="/takeout" element={<TakeoutOrderPage />} />
      <Route path="/order-status/:orderId" element={<OrderStatusPage />} />
      <Route path="/track-order" element={<TrackOrderPage />} />
      <Route path="/front-desk" element={<FrontDeskPage />} />
      <Route path="/kitchen" element={<KitchenPage />} />
    </Routes>
  );
}

export default App;
