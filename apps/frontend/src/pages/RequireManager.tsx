import { Navigate } from 'react-router-dom';

// 纯前端兜底：店员直接改地址栏访问报表/管理页面时退回桌台看板，不是真正的权限边界——
// 真正的权限校验后端已经做了（这几个接口本来就要求 role='manager'，见 API_DESIGN.md 第 2 节）
export default function RequireManager({ role, children }: { role: string | null; children: React.ReactNode }) {
  if (role !== 'manager') return <Navigate to="/front-desk" replace />;
  return <>{children}</>;
}
