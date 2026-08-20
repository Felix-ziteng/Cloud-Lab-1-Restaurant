// 对应 docs/API_DESIGN.md 第 2 节的调用方身份。
// kitchen_station 是站点级令牌（无个人登录，见 API_DESIGN.md），具体签发方式待定，
// 目前先在类型层面占位，后续加设备预配置流程时再补 issuing 逻辑。
export type AuthPayload =
  | { type: 'staff'; sub: string; role: 'staff' | 'manager' }
  // tableSessionId 为 null：外卖/自提顾客自助下单（见 OrdersService.createGuestOrder），
  // 没有桌台可绑定，只挂在订单上
  | { type: 'guest'; sub: string; tableSessionId: string | null; orderId: string }
  | { type: 'kitchen_station'; sub: string };

declare module 'express' {
  interface Request {
    auth?: AuthPayload;
  }
}
