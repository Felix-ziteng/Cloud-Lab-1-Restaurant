import { Routes, Route } from 'react-router-dom';
import GuestOrderPage from './pages/GuestOrderPage';
import FrontDeskPage from './pages/FrontDeskPage';
import KitchenPage from './pages/KitchenPage';

// 路由对应 docs/ARCHITECTURE.md 2.4 的角色划分：
//   /order/:tableId -> 顾客手机 / 桌台平板（同一视图）
//   /front-desk     -> 店员 / 店长登录站点
//   /kitchen        -> 厨房 KDS 看板
function App() {
  return (
    <Routes>
      <Route path="/order/:tableId" element={<GuestOrderPage />} />
      <Route path="/front-desk" element={<FrontDeskPage />} />
      <Route path="/kitchen" element={<KitchenPage />} />
    </Routes>
  );
}

export default App;
