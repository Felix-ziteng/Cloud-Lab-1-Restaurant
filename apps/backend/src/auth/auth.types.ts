// 对应 docs/API_DESIGN.md 第 2 节的调用方身份。
// 厨房 KDS 曾设想过无个人登录的站点级令牌（kitchen_station），评估后决定不做：
// 收益（省去店员输 PIN 这一步）撑不起单独的签发/设备预配置流程，KDS 直接复用店员登录即可
// （决策记录 2026-08-20）。
export type AuthPayload =
  | { type: 'staff'; sub: string; role: 'staff' | 'manager' }
  // tableSessionId 为 null：外卖/自提顾客自助下单（见 OrdersService.createGuestOrder），
  // 没有桌台可绑定，只挂在订单上
  | { type: 'guest'; sub: string; tableSessionId: string | null; orderId: string };

declare module 'express' {
  interface Request {
    auth?: AuthPayload;
  }
}
