// 与 docs/DATA_MODEL.md 对应的共享类型定义。
// 后端（Prisma 生成的类型）与前端共用这些类型，避免接口契约漂移。

// 门店能力配置：决定这份部署要不要暴露厨房看板 / 外卖 / 预定这些可选模块
export type UiTheme = "modern" | "warm";

export interface StoreConfig {
  kdsScreenEnabled: boolean;
  deliveryEnabled: boolean;
  reservationEnabled: boolean;
  uiTheme: UiTheme;
}

export type TableStatus = "idle" | "occupied" | "pending_clear";

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  zone: string | null;
  status: TableStatus;
}

export type TableSessionStatus = "open" | "pending_checkout" | "closed";

// 概念型定义，实际接口目前都只返回它的精简/嵌套形式（见下面 TableWithSession），
// 没有任何端点直接返回这个完整形状，`tableIds` 在真实查询里是通过关联表带出来的，不是一个直接字段
export interface TableSession {
  id: string;
  tableIds: string[];
  partySize: number;
  status: TableSessionStatus;
  openedByStaffId: string | null;
  openedAt: string;
  closedAt: string | null;
  reservationId: string | null;
}

export type OrderType = "dine_in" | "takeout" | "delivery";
export type OrderStatus = "open" | "awaiting_payment" | "paid" | "cancelled";

// 金额字段是 Prisma Decimal，序列化成 JSON 时是字符串而不是 number（已用 curl 验证），
// 前端要展示/计算时自己 Number(...) 转换，不要信 TS 的 number 直觉
export interface Order {
  id: string;
  // 顾客自助下单外卖/自提用"订单号 + 手机号"找回订单（UUID 主键不适合手打），见 lookupGuestOrder
  orderNumber: number;
  type: OrderType;
  tableSessionId: string | null;
  status: OrderStatus;
  subtotal: string;
  discountTotal: string;
  total: string;
  createdByType: "customer" | "staff";
  createdByStaffId: string | null;
  customerContact: string | null;
  pickupTime: string | null;
  createdAt: string;
}

export type KitchenStatus = "pending" | "preparing" | "done";

export interface OrderItem {
  id: string;
  orderId: string;
  dishId: string;
  dishNameSnapshot: string;
  unitPriceSnapshot: string;
  quantity: number;
  notes: string | null;
  kitchenStatus: KitchenStatus;
  roundNumber: number;
  submittedAt: string | null;
  isVoided: boolean;
  addedByType: "customer" | "staff";
  addedByStaffId: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

// GET /api/menu
export interface MenuCategory extends Category {
  dishes: Dish[];
}

export interface Dish {
  id: string;
  categoryId: string;
  name: string;
  price: string;
  description: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
}

export type StaffRole = "staff" | "manager";
export type AccountStatus = "active" | "inactive";

export interface StaffAccount {
  id: string;
  name: string;
  role: StaffRole;
  status: AccountStatus;
}

// 骑手模块暂时删除：店家自己配送，配送状态只是个简单字段，不挂账号体系。
export type DeliveryStatus = "unassigned" | "delivering" | "delivered";

export interface DeliveryInfo {
  orderId: string;
  address: string;
  contactPhone: string;
  status: DeliveryStatus;
  codAmount: string;
  paymentConfirmed: boolean;
  confirmedAt: string | null;
}

export type PaymentMethod = "cash" | "staff_qr" | "rider_cod";

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: string;
  collectedByType: "staff";
  collectedByStaffId: string | null;
  collectedAt: string;
}

export type PriceAdjustmentType = "discount" | "comp" | "void" | "price_override";

export interface PriceAdjustment {
  id: string;
  orderId: string;
  orderItemId: string | null;
  type: PriceAdjustmentType;
  amount: string;
  reason: string | null;
  approvedByStaffId: string;
  createdAt: string;
}

export type ReservationStatus = "pending" | "arrived" | "cancelled" | "no_show";

export interface Reservation {
  id: string;
  customerName: string;
  phone: string;
  partySize: number;
  reservedTime: string;
  tableId: string | null;
  status: ReservationStatus;
  note: string | null;
  createdByStaffId: string;
  createdAt: string;
  arrivedAt: string | null;
}

// --- 组合响应类型：对应几个带 include 的读接口，见 API_DESIGN.md ---

// GET /api/tables
export interface TableWithSession extends Table {
  activeSession: {
    id: string;
    partySize: number;
    status: TableSessionStatus;
    order: Order;
  } | null;
}

// GET /api/orders/:id
export interface OrderDetail extends Order {
  items: OrderItem[];
  payments: Payment[];
  priceAdjustments: PriceAdjustment[];
  deliveryInfo: DeliveryInfo | null;
}

// GET /api/orders/lookup 的响应：顾客找回订单后拿到的新凭证
export interface GuestOrderToken {
  orderId: string;
  token: string;
}

// POST /api/orders/guest 的响应：顾客自助下单成功后拿到的凭证 + 订单摘要
export interface GuestOrderCreated extends GuestOrderToken {
  order: Order;
}

// GET /api/order-items/queue
export interface KitchenQueueItem extends OrderItem {
  order: {
    id: string;
    type: OrderType;
    tableSessionId: string | null;
    tableSession: {
      tables: { table: Pick<Table, "id" | "tableNumber"> }[];
    } | null;
  };
}

// GET /api/orders（店员视角，历史订单列表，精简版：只带表头信息，不带菜品明细）
export interface OrderListItem extends Order {
  tableSession: {
    tables: { table: Pick<Table, "id" | "tableNumber"> }[];
  } | null;
  deliveryInfo: DeliveryInfo | null;
}

// GET /api/reports/overview（店长经营概览，仅 manager 可看）
export interface ReportOverview {
  from: string;
  to: string;
  revenue: { total: number; byType: Record<OrderType, number> };
  orderCount: { total: number; byType: Record<OrderType, number> };
  // 堂食翻台率：这段时间内完成的桌台会话数 / (桌台数 * 天数)
  tableTurnoverRate: number;
  dailyBreakdown: { date: string; revenue: number; orderCount: number }[];
}

// --- 打印队列：ARCHITECTURE.md 2.7"打印代理"，backend 生产、apps/print-agent 消费 ---

export type PrintJobType = "kitchen" | "receipt";
export type PrintJobStatus = "pending" | "printed" | "failed";

// 建单/收款那一刻的快照，不是实时反查订单当前状态，见 PrintJobsService 的注释
export interface KitchenTicketPayload {
  orderId: string;
  orderNumber: number;
  orderType: OrderType;
  tableLabel: string | null;
  roundNumber: number;
  items: { dishName: string; quantity: number; notes: string | null }[];
  createdAt: string;
}

export interface ReceiptPayload {
  orderId: string;
  orderNumber: number;
  orderType: OrderType;
  tableLabel: string | null;
  items: { dishName: string; quantity: number; unitPrice: string }[];
  subtotal: string;
  discountTotal: string;
  total: string;
  paymentMethod: string;
  paidAt: string;
}

// GET /api/print-jobs/pending（打印代理专用，PrintAgentGuard 鉴权）
export interface PrintJob {
  id: string;
  type: PrintJobType;
  orderId: string;
  payload: KitchenTicketPayload | ReceiptPayload;
  status: PrintJobStatus;
  errorMessage: string | null;
  createdAt: string;
  printedAt: string | null;
}
