// 与 docs/DATA_MODEL.md 对应的共享类型定义。
// 后端（Prisma 生成的类型）与前端共用这些类型，避免接口契约漂移。

// 门店能力配置：决定这份部署要不要暴露厨房看板 / 外卖 / 预定这些可选模块
export interface StoreConfig {
  kdsScreenEnabled: boolean;
  deliveryEnabled: boolean;
  reservationEnabled: boolean;
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

export interface Order {
  id: string;
  type: OrderType;
  tableSessionId: string | null;
  status: OrderStatus;
  subtotal: number;
  discountTotal: number;
  total: number;
  createdByType: "customer" | "staff";
  createdById: string | null;
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
  unitPriceSnapshot: number;
  quantity: number;
  notes: string | null;
  kitchenStatus: KitchenStatus;
  roundNumber: number;
  isVoided: boolean;
  addedByType: "customer" | "staff";
  addedById: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Dish {
  id: string;
  categoryId: string;
  name: string;
  price: number;
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

export interface Rider {
  id: string;
  name: string;
  status: AccountStatus;
}

export type DeliveryStatus =
  | "unassigned"
  | "assigned"
  | "picked_up"
  | "delivering"
  | "delivered";

export interface DeliveryInfo {
  orderId: string;
  address: string;
  contactPhone: string;
  riderId: string | null;
  status: DeliveryStatus;
  codAmount: number;
  paymentConfirmed: boolean;
  confirmedAt: string | null;
}

export type PaymentMethod = "cash" | "staff_qr" | "rider_cod";

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  collectedByType: "staff" | "rider";
  collectedById: string;
  collectedAt: string;
}

export type PriceAdjustmentType = "discount" | "comp" | "void" | "price_override";

export interface PriceAdjustment {
  id: string;
  orderId: string;
  orderItemId: string | null;
  type: PriceAdjustmentType;
  amount: number;
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
  sessionId: string | null;
}
