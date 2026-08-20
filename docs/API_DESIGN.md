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
| 厨房 KDS | 无——站点级访问，不登录 | 标记完成不属于敏感操作，也不需要个人追责；`/api/order-items/*` 不挂鉴权守卫。真正兜住暴露面的是 `ops/Caddyfile` 的白名单，这两个接口不在其中，公网隧道天然碰不到，只有厨房设备所在局域网能访问（决策记录：曾评估过无个人登录的站点级 JWT，因收益撑不起单独签发/预配置流程而放弃——但那次评估针对的是"要不要发令牌"，不代表这两个接口必须挂在店员登录后面，2026-08-20 修正为直接不鉴权） |

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
| `order:{order_id}` | 该订单的顾客设备——外卖/自提顾客自助下单没有桌台可绑定，走这个房间（guest token 的 `tableSessionId` 为空，见 2. 身份与会话模型） | `item_added` `item_status_changed` `order_paid` `order_updated` |
| `kitchen` | 所有 KDS 设备（不登录，握手传 `channel: 'kitchen'` 而不是 token）+ 打印代理（`apps/print-agent`，用 `PRINT_AGENT_TOKEN` 直连，不是 JWT） | `new_order_item` `item_status_changed` `print_job_created` |
| `frontdesk` | 前台/管理终端 | `table_status_changed` `checkout_requested` `reservation_reminder` `delivery_status_changed` |

## 5. 核心 REST 端点

### 认证

```
POST /api/auth/staff/login   { pin }              -> { token, role }
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

### 员工账号

```
GET/POST/PUT /api/staff        员工账号管理（仅 manager；不能把系统里唯一在职的 manager 降级/停用）
PATCH /api/staff/:id/pin       重置 PIN（仅 manager；新 PIN 撞上其他在职账号会被拒绝，见决策记录）
```

> 决策记录：曾经有独立的骑手账号体系（`GET/POST/PUT /api/riders`），已经整体下线——V1
> 没有配送员这个角色，配送由普通店员完成，见 DATA_MODEL.md 关于 `Rider` 实体的说明。

### 订单

```
POST   /api/orders                       创建外卖/自提订单，或店员代客创建
POST   /api/orders/guest                 顾客自助下单外卖/自提（公开接口，挂 deliveryEnabled 开关）-> { orderId, token, order }
GET    /api/orders/lookup                订单号 + 手机号找回顾客自助下单的 token（公开接口，挂 deliveryEnabled 开关）
GET    /api/orders                       历史订单列表（仅 staff），可选 status/type/limit/from/to 筛选，from/to 是报表"点某天看当天订单"下钻用的
GET    /api/orders/:id                   查询订单（guest 仅限自己会话；staff/manager 不受限）
POST   /api/orders/:id/items             加菜（guest 或 staff）
PATCH  /api/orders/:id/items/:itemId     改购物车项数量（仅限还没提交给厨房的项）
DELETE /api/orders/:id/items/:itemId     删除购物车项（仅限还没提交给厨房的项；已提交的走 price-adjustments 的 void）
POST   /api/orders/:id/submit            提交当前一轮点餐，推送厨房，生成 round_number
POST   /api/orders/:id/checkout-request  发起结账请求（guest 或 staff）
POST   /api/orders/:id/payments          记录收款（仅 staff）
POST   /api/orders/:id/cancel            取消订单（仅 manager；已支付的订单不能取消）——已实现但暂无前端入口，见 docs/OPTIONAL_MODULES.md
POST   /api/orders/:id/price-adjustments 改价/打折/赠菜/作废（仅 manager；price_override 语义见 DATA_MODEL.md 3.6）
```

### 厨房

```
GET   /api/order-items/queue                出品队列（不鉴权，站点级访问，见 2. 身份与会话模型）
PATCH /api/order-items/:id/kitchen-status   { status: preparing | done }（不鉴权，同上）
```

### 配送

> 整个分组挂在 `deliveryEnabled` 开关下（见门店能力配置），未启用时这些接口整体不可用；
> `POST /api/orders`/`POST /api/orders/guest` 创建 `type=delivery` 订单时也会单独校验这个开关，
> 不止靠下面这个专属接口把关。V1 没有骑手账号体系，配送由普通店员完成，不需要"分配"这一步。

```
PATCH /api/orders/:orderId/delivery/status   配送状态更新（staff）{ status: delivering | delivered }
```

收款走通用的 `POST /api/orders/:id/payments`（见上面"订单"分组），不需要单独的配送收款确认接口。

### 门店能力配置

对应 ARCHITECTURE.md 2.7"产品化：用运行时配置覆盖客户差异"——决定这份部署要不要暴露厨房看板 / 外卖 / 预定模块，同一套代码靠这个配置适配不同客户。

```
GET   /api/store-config    读取当前门店能力配置（无需登录：所有终端启动时都要读它来决定展示哪些功能，内容不敏感）
PATCH /api/store-config    更新配置（仅 manager）
```

### 预定

> 整个分组挂在 `reservationEnabled` 开关下，未启用时这些接口整体不可用。

```
POST  /api/reservations                预定登记（staff）
GET   /api/reservations                预定列表
PATCH /api/reservations/:id/cancel     取消预定
PATCH /api/reservations/:id/no-show    标记未到（仅"待到店"状态可标记）——已实现但暂无前端入口，见 docs/OPTIONAL_MODULES.md
POST  /api/reservations/:id/arrive     到店，触发开台流程
```

### 报表

```
GET /api/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD   经营概览（仅 manager）
```

营业额/订单量按类型（堂食/自提/配送）细分，另外给堂食翻台率、每日明细，具体口径见
`ReportsService.getOverview`：营业额按实际收款时间算（不是下单时间），订单量按下单时间算
且排除已取消的订单，翻台率 = 这段时间内完成（清台）的桌台会话数 / (桌台总数 × 天数)。
`from`/`to` 按服务器本地时区解析当天的起止边界，不是 UTC。

### 打印队列

> 只给 `apps/print-agent`（本地打印代理，见 ARCHITECTURE.md 2.7）用，不是店员/顾客接口。
> 鉴权是固定共享密钥（`X-Print-Agent-Token` 头，对应 `PRINT_AGENT_TOKEN` 环境变量），
> 不是 JWT——打印代理是无人值守的本地服务，不走 PIN 登录换令牌那一套。

```
GET   /api/print-jobs/pending   待打印任务列表（按创建时间正序）
PATCH /api/print-jobs/:id       { status: printed | failed, errorMessage? }
```

## 6. 待细化事项

- 具体的错误码/响应体格式规范
- session token / staff JWT 的过期时间与刷新机制（目前都是签发后 12 小时过期，没有刷新机制，过期后重新登录/重新扫码）
