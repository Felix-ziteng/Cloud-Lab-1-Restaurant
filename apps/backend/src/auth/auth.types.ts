// 对应 docs/API_DESIGN.md 第 2 节的调用方身份。
// 厨房 KDS 不在这两种身份里：它是站点级访问、无个人登录（2026-08-20 决策），
// 相关接口（kitchen.controller.ts）直接不挂鉴权守卫，不签发、也不需要专门的
// AuthPayload 变体——见 ops/Caddyfile 关于暴露面的说明。
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
