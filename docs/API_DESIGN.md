# 餐厅点餐系统 — API / 接口设计 V1

> 前置阅读：[PRD.md](./PRD.md)、[ARCHITECTURE.md](./ARCHITECTURE.md)、[DATA_MODEL.md](./DATA_MODEL.md)
> 本文档记录接口风格、身份模型和核心端点设计及理由。

## 1. 整体风格：REST（动作）+ WebSocket（广播）

**决策**：客户端发起的"动作"（提交订单、登录、开台、收款、改价）走 REST；服务端主动推给多个相关方的"状态变化"（新订单到厨房、菜品状态变化、桌台状态变化）走 WebSocket 广播。WebSocket 只用于服务端 → 客户端的通知，客户端的写操作一律走 REST，不通过 WS 发起。

**理由**：REST 语义清晰，鉴权和审计天然适配（每个请求带身份令牌，中间件统一校验），适合"一个动作、一个结果"的场景。但订单/厨房/桌台状态需要毫秒级推给多个不在同一次请求里的相关方（顾客加了一道菜，厨房屏幕和前台要立刻看到）——这种"一变多知"用 REST 轮询体验很差，必须用 WebSocket。把"写"和"广播通知"分开，两边职责单一：权限校验只需要在 REST 一侧做，不用在 WS 消息里重复鉴权逻辑。

## 2. 身份与会话模型

对应 ARCHITECTURE.md 中已定的三级权限：

| 调用方 | 凭证 | 作用域 |
|---|---|---|
| 桌台会话（顾客手机 / 桌台平板） | 加入会话时换取的 session token | 只能读写自己绑定的 `table_session_id` / `order_id`，看不到别的桌 |
| 店员 / 店长账号 | PIN 码登录换取的 JWT，带 `role` | `staff` 看不到敏感操作接口；`manager` 额外解锁改价/打折/作废/菜单管理 |
| 配送员账号 | PIN 码登录换取的 JWT | 只能操作分配给自己的配送单 |
| 厨房 KDS | 站点级访问，无个人登录 | 只能读写厨房相关接口，不做个人身份区分（标记完成不属于敏感操作，不需要个人追责） |

**决策记录：店员/店长登录用 PIN 码。** 理由：前台/桌台等共享硬件上切换操作人非常频繁，PIN 码输入快、无需记忆复杂密码，比工号+密码更适合这个场景。

## 3. 桌台会话：自动开台 + 待清台防护

**决策**：`join` 接口不要求会话必须由店员预先创建。顾客扫码时：

- 若目标桌台 `status = idle`：自动创建 `TableSession` + `Order`，桌台状态转为 `occupied`，返回新的 session token；人数由顾客自己在点餐前填写
- 若目标桌台已有 `status = occupied` 且存在进行中的会话：直接加入该会话，返回 session token（不重复创建）
- 若目标桌台 `status = pending_clear`：**拒绝自动开台**，返回明确的阻塞状态（如 `table_pending_clear`），前端提示"请稍等，服务员正在清台"

店员仍可通过前台手动开台（`POST /api/table-sessions`），用于不使用手机/平板的顾客，或 POS 纯代客场景；手动开台后，顾客后续扫码会走"加入已有会话"分支，不会重复创建。

**理由**：允许顾客扫码自动开台能减少对店员操作的依赖，体验更流畅，但如果不加"待清台"防护，顾客结账后桌子还没物理清理干净时，别人再扫码会让新客人的订单和旧账单状态搅在一起。`occupied → pending_clear → idle` 这条状态链必须由店员显式完成清台动作（`idle`）才能重新开放自动开台，这是自动开台模式下必须补的一道防线。

## 4. WebSocket 房间设计

| 房间 | 订阅方 | 收到的事件 |
|---|---|---|
| `table:{table_session_id}` | 该桌所有设备（顾客手机 + 桌台平板） | `item_added` `item_status_changed` `checkout_requested` `order_paid` |
| `kitchen` | 所有 KDS 设备 | `new_order_item` `item_status_changed` |
| `frontdesk` | 前台/管理终端 | `table_status_changed` `checkout_requested` `reservation_reminder` |
| `delivery:{rider_id}` | 对应骑手 | `delivery_assigned` `delivery_status_changed` |

## 5. 核心 REST 端点

### 认证

```
POST /api/auth/staff/login   { pin }              -> { token, role }
POST /api/auth/rider/login   { pin }               -> { token }
```

### 桌台与会话

```
GET   /api/tables                         桌台列表（含每桌当前会话/账单，前台看板用）
POST/PUT/DELETE /api/tables               桌台/包间管理（仅 manager；删除要求桌台是空闲状态）
POST  /api/table-sessions                 店员开台 { table_ids[], party_size }
POST  /api/table-sessions/:id/merge       并台 { additional_table_ids[] }
POST  /api/table-sessions/:id/unmerge     拆台 { table_id }（会话至少留一张桌，拆最后一张会被拒绝）
POST  /api/table-sessions/:id/transfer    换桌 { from_table_id, to_table_id }（目标桌须空闲）
PATCH /api/table-sessions/:id/party-size  改人数 { party_size }
POST  /api/table-sessions/:id/close       发起清台（结账完成后调用）
POST  /api/table-sessions/:table_id/join  顾客/桌台平板加入或自动开台 -> { session_token, order_id }
POST  /api/tables/:id/clear               店员确认清台完成，status -> idle
```

### 菜单

```
GET   /api/menu                     菜单（顾客视角只见可售项；staff/manager 视角见全部）
PATCH /api/dishes/:id/availability  售罄开关（普通店员即可，非敏感操作）
POST/PUT/DELETE /api/dishes         菜品管理（仅 manager）
POST/PUT/DELETE /api/categories     分类管理（仅 manager；删除要求分类下没有菜品）
```

### 员工 / 骑手账号

```
GET/POST/PUT /api/staff        员工账号管理（仅 manager；不能把系统里唯一在职的 manager 降级/停用）
PATCH /api/staff/:id/pin       重置 PIN（仅 manager）
GET/POST/PUT /api/riders       骑手账号管理（仅 manager，挂在 deliveryEnabled 开关下）
PATCH /api/riders/:id/pin      重置 PIN（仅 manager）
```

### 订单

```
POST   /api/orders                       创建外卖/自提订单，或店员代客创建
GET    /api/orders/:id                   查询订单（guest 仅限自己会话；staff/manager 不受限）
POST   /api/orders/:id/items             加菜（guest 或 staff）
PATCH  /api/orders/:id/items/:itemId     改购物车项数量（仅限还没提交给厨房的项）
DELETE /api/orders/:id/items/:itemId     删除购物车项（仅限还没提交给厨房的项；已提交的走 price-adjustments 的 void）
POST   /api/orders/:id/submit            提交当前一轮点餐，推送厨房，生成 round_number
POST   /api/orders/:id/checkout-request  发起结账请求（guest 或 staff）
POST   /api/orders/:id/payments          记录收款（仅 staff）
POST   /api/orders/:id/price-adjustments 改价/打折/赠菜/作废（仅 manager；price_override 语义见 DATA_MODEL.md 3.6）
```

### 厨房

```
PATCH /api/order-items/:id/kitchen-status   { status: preparing | done }（KDS 站点级）
```

### 配送

> 整个分组挂在 `deliveryEnabled` 开关下（见门店能力配置），未启用时这些接口整体不可用；
> `POST /api/orders` 创建 `type=delivery` 订单时也会单独校验这个开关，不止靠下面这几个专属接口把关。

```
POST  /api/orders/:id/delivery/assign          分配骑手（staff）{ rider_id }
PATCH /api/orders/:id/delivery/status          配送状态更新（rider，仅限分配给自己的单）
POST  /api/orders/:id/delivery/confirm-payment 骑手确认已收款（rider）
```

### 门店能力配置

对应 ARCHITECTURE.md 2.7"产品化：用运行时配置覆盖客户差异"——决定这份部署要不要暴露厨房看板 / 外卖 / 预定模块，同一套代码靠这个配置适配不同客户。

```
GET   /api/store-config    读取当前门店能力配置（无需登录：所有终端启动时都要读它来决定展示哪些功能，内容不敏感）
PATCH /api/store-config    更新配置（仅 manager）
```

### 预定

> 整个分组挂在 `reservationEnabled` 开关下，未启用时这些接口整体不可用。

```
POST/GET/PATCH /api/reservations       预定管理（staff）
POST /api/reservations/:id/arrive      到店，触发开台流程
```

### 报表

```
GET /api/reports/...   仅 manager
```

## 6. 待细化事项

- 具体的错误码/响应体格式规范
- session token / staff JWT 的过期时间与刷新机制
- `round_number` 的服务端生成规则（详见 DATA_MODEL.md 待确认事项）
