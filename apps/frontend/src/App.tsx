import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import type { StoreConfig } from '@restaurant/shared-types';
import { api } from './api/client';
import { applyTheme } from './theme/applyTheme';
import GuestOrderPage from './pages/GuestOrderPage';
import FrontDeskLayout from './pages/FrontDeskLayout';
import FrontDeskTablesPage from './pages/FrontDeskTablesPage';
import FrontDeskOrdersPage from './pages/FrontDeskOrdersPage';
import FrontDeskReservationsPage from './pages/FrontDeskReservationsPage';
import FrontDeskDeliveryPage from './pages/FrontDeskDeliveryPage';
import FrontDeskReportsPage from './pages/FrontDeskReportsPage';
import FrontDeskManagementPage from './pages/FrontDeskManagementPage';
import KitchenPage from './pages/KitchenPage';
import TakeoutOrderPage from './pages/TakeoutOrderPage';
import TrackOrderPage from './pages/TrackOrderPage';
import OrderStatusPage from './pages/OrderStatusPage';

// 路由对应 docs/ARCHITECTURE.md 2.4 的角色划分：
//   /order/:tableId    -> 堂食顾客手机 / 桌台平板（同一视图，靠桌台锚定身份）
//   /takeout           -> 外卖/自提顾客自助下单（不需要登录，没有桌台锚点）
//   /order-status/:id  -> 外卖/自提顾客查看自己这单的状态（凭下单时签发的 guest token）
//   /track-order       -> 换设备/清了缓存后，用"订单号 + 手机号"找回订单
//   /front-desk        -> 店员 / 店长登录站点，左侧边栏 + 子路由（桌台/历史订单/预定/外卖/报表/管理）
//   /kitchen           -> 厨房 KDS 看板
// 骑手自助端（/rider）暂时不需要：配送状态改为店员在前台直接记录，见 DeliveryPanel
function App() {
  // 主题是门店级配置，不是某个页面的私有状态——不管从哪个路由进来（顾客扫码点餐、
  // 厨房看板、前台）都要读同一份 StoreConfig 应用到 <html data-theme>，所以放在
  // 最顶层跑一次，而不是在各个页面里各自 fetch 各自 apply。/store-config 不需要鉴权。
  useEffect(() => {
    api
      .get<StoreConfig>('/store-config')
      .then((config) => applyTheme(config.uiTheme))
      .catch(() => {});
  }, []);

  return (
    <Routes>
      <Route path="/order/:tableId" element={<GuestOrderPage />} />
      <Route path="/takeout" element={<TakeoutOrderPage />} />
      <Route path="/order-status/:orderId" element={<OrderStatusPage />} />
      <Route path="/track-order" element={<TrackOrderPage />} />
      <Route path="/front-desk" element={<FrontDeskLayout />}>
        <Route index element={<FrontDeskTablesPage />} />
        <Route path="orders" element={<FrontDeskOrdersPage />} />
        <Route path="reservations" element={<FrontDeskReservationsPage />} />
        <Route path="delivery" element={<FrontDeskDeliveryPage />} />
        <Route path="reports" element={<FrontDeskReportsPage />} />
        <Route path="admin" element={<FrontDeskManagementPage />} />
      </Route>
      <Route path="/kitchen" element={<KitchenPage />} />
    </Routes>
  );
}

export default App;
