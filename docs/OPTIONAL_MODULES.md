# 外卖/自提 + 预定模块 — 开发参考文档

> 前置阅读：[ARCHITECTURE.md](./ARCHITECTURE.md)、[DATA_MODEL.md](./DATA_MODEL.md)、[API_DESIGN.md](./API_DESIGN.md)
> 状态：2026-08-20 起，这两个模块的功能代码是完整、可用的，但在标准部署下**默认关闭**
> （`StoreConfig.deliveryEnabled = false`、`reservationEnabled = false`，见 schema.prisma 的
> `20260820083327_store_config_default_off` migration）。

## 为什么默认关闭

1. **外卖/自提自助下单需要暴露到公网**，这跟 ARCHITECTURE.md 2.1/2.2/2.3 定的"本地优先、不
   依赖云、顾客点餐必须走店内局域网"这条核心原则天然冲突——不是代码问题，是这个功能本身
   决定了必须有一条"公网 -> 店内服务器"的路径。只有客户明确需要外卖/配送这个业务场景，
   才值得承担这条公网入口带来的复杂度和安全暴露面。
2. 预定模块本身不需要公网暴露（V1 的预定是电话/到店预约，见 ARCHITECTURE.md 2.3），但同样
   属于"不是每个客户都要"的可选功能，跟着一起默认关闭，按需为具体客户打开。
3. 审计发现 `.env` 里的 `JWT_SECRET`/数据库密码还是开发默认值（`change-me`/`postgres`）。
   与其现在就轮换（还没有真实上线需求），不如先把唯一需要公网暴露的功能整体关掉——公网
   攻击面清零之后，弱密钥暂时不构成风险，等真正要给某个客户开外卖模块时再换成真实密钥。

## 外卖/自提自助下单模块

### 涉及的代码

| 位置 | 文件 |
|---|---|
| 顾客自助下单/查状态 | `POST /orders/guest`、`GET /orders/lookup`（`orders.controller.ts`/`orders.service.ts`），都挂 `@RequireFeature('deliveryEnabled')` |
| 顾客侧页面 | `apps/frontend/src/pages/TakeoutOrderPage.tsx`（`/takeout`）、`OrderStatusPage.tsx`（`/order-status/:orderId`）、`TrackOrderPage.tsx`（`/track-order`） |
| 店员侧代客下单/配送状态/收款 | `apps/frontend/src/components/DeliveryPanel.tsx`，同样挂 `deliveryEnabled` |
| 数据模型 | `DeliveryInfo`；`Order.orderNumber`（顾客手机号 + 订单号查询用的人类可读顺序号） |
| 实时推送 | `order:{orderId}` WebSocket 房间（`RealtimeGateway`），顾客的 guest token 连接会自动加入 |
| 公网反向代理 | `ops/Caddyfile` + `docker-compose.yml` 的 `caddy` 服务 |

### 身份模型

顾客不需要注册账号。下单成功（`POST /orders/guest`）后签发一个"订单专属"的 guest JWT——
payload 跟堂食桌台 token 是同一种形状（`{ type: 'guest', sub, tableSessionId, orderId }`），
只是 `tableSessionId` 为 `null`。前端把这个 token 存进 `localStorage`（key 是
`guest-order:{orderId}`），凭它调用 `GET /orders/:id` 查看订单状态。

换设备/清了浏览器缓存导致 token 丢了，走 `/track-order` 页面用"订单号 + 下单手机号"重新
签发（`GET /orders/lookup`）。**这里没有短信验证码这一关**——本地部署没有短信网关这类基础
设施，接受的取舍是：泄露的最坏情况是被人看到配送地址这类信息，跟"订单号"这个凭证本身的
敏感度是匹配的。详见 `OrdersService.lookupGuestOrder` 的代码注释。

### 公网暴露方案

`ops/Caddyfile` 是一个反向代理白名单：只放行外卖/自提顾客用得到的接口（菜单、店铺配置、
自助下单、订单查询/查询找回、加菜/提交/结账、WebSocket）+ 前端静态文件，白名单之外的
`/api/*` 一律返回 404——前台/厨房/收银/店员登录这些接口完全碰不到公网入口，就算隧道地址
被人拿到也没用（真正的权限校验仍然在后端各个 guard 上，这层白名单只是缩小暴露面，不是
唯一防线）。

`docker-compose.yml` 的 `caddy` 服务默认是**停着的**（`docker compose stop caddy`），配置
保留但不运行。公网入口本身用 Cloudflare Tunnel（`cloudflare/cloudflared` 官方镜像），当前
验证过的是免费的临时隧道（`cloudflared tunnel --url ...`，每次重启地址都会变）。

### 要给某个客户正式启用，需要做的事

1. **先轮换密钥**：`.env` 里的 `JWT_SECRET` 和 `docker-compose.yml` 里 Postgres 的密码都要
   换成真实的随机值，不能带着开发默认值上公网。
2. **拿到一个域名挂到 Cloudflare 上**，把免费临时隧道换成命名隧道（固定地址），不然每次
   服务器重启顾客手里的二维码/收藏的链接就失效了。
3. **重新构建前端**（`npm run build --workspace=apps/frontend`）——`dist/` 是 Caddy 直接
   服务的静态文件，不会跟着源码自动更新。
4. **考虑给 `POST /orders/guest`、`GET /orders/lookup` 加限流**：这是唯一对公网开放的、
   不需要认证就能调用的写/查接口，有被刷单/被枚举手机号滥用的风险，之前讨论限流时是针对
   店员登录（决定不加，因为店员登录不打算公开），但这两个接口的暴露前提不一样，值得重新
   评估。
5. **打开开关**：
   ```
   PATCH /api/store-config
   { "deliveryEnabled": true }
   ```
6. 把 `apps/frontend/src/pages/FrontDeskPage.tsx` 里"门店设置"区域被移除的
   `启用外卖/配送模块` 开关 UI 加回来（2026-08-20 决策：暂时从界面隐藏，见下面
   "跟这两个模块相关但暂不启用的其它能力"）——或者继续只用 `PATCH /store-config` 直接改，
   不一定需要界面。

## 预定模块

### 涉及的代码

| 位置 | 文件 |
|---|---|
| 预定管理 | `POST/GET /reservations`、`PATCH /reservations/:id/cancel`、`POST /reservations/:id/arrive`（`reservations.controller.ts`），整体挂 `@RequireFeature('reservationEnabled')` |
| 店员侧界面 | `apps/frontend/src/components/ReservationsPanel.tsx` |
| 数据模型 | `Reservation` |

### 现状

V1 的预定是电话/到店预约、店员在前台录入（见 ARCHITECTURE.md 2.3），不支持顾客在店外自助
在线预约——那需要一个公网可访问的组件，是独立于这次"外卖/自提"公网暴露的另一件事，还没
设计。到点提醒是前端界面上的高亮/置顶展示，不通过短信/推送通知顾客或店员的手机
（DATA_MODEL.md 3.5）。

### 未接入前端的能力：no_show 标记

`PATCH /reservations/:id/no-show`（`ReservationsService.noShow`）已经实现——只允许从
"待到店"（`pending`）转成"未到"（`no_show`），已到店/已取消的预定不能再标记。但
`ReservationsPanel.tsx` 目前只有"取消"和"到店"两个操作按钮，没有对应的"未到"按钮。要接入
只需要在面板里给状态为 `pending` 的预定加一个按钮调用这个接口，参考现有的 `cancel`/`arrive`
写法。

### 启用步骤

```
PATCH /api/store-config
{ "reservationEnabled": true }
```

这个模块本身不需要公网暴露（顾客不能自助预约），可以独立于外卖模块单独打开，不受
"密钥要不要先轮换"这条限制。

## 相关但独立的：暂不启用的订单取消功能

跟以上两个模块本身没有直接关系，但同一轮决策（2026-08-20）里一起实现的：
`POST /orders/:id/cancel`（`OrdersService.cancelOrder`，manager 专属）——已支付的订单不能
取消，堂食订单取消后会自动释放桌台（走跟收款完成一样的 `closeSession` 流程）。已经实现并
有完整的 e2e 测试覆盖（`apps/backend/test/order-cancel.e2e-spec.ts`），但没有任何前端入口
调用它。

**启用时注意**：`ReportsService.getOverview` 已经把 `status = 'cancelled'` 的订单排除在
"订单量"统计之外（否则一旦真的开始用这个功能，报表的订单量会被虚增）——这条排除逻辑已经
写好了，不需要额外改动，接前端 UI 就够了。
