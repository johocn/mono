# 优惠券多渠道分发（含到店券）设计文档

- 日期：2026-10-02
- 涉及仓库：`vendure`（coupon-plugin）、`vshop/web-admin`、`nshop`
- 状态：设计已确认，待写实施计划

## 1. 背景与目标

`coupon-plugin` 当前已有 6 种「领取方式」，但它们**不是一等公民**：能否通过某条渠道分发，是由 `claimable` / `pointsPrice` / `claimCode` / `ProductCouponBinding` 四个字段**隐式推导**出来的，运营无法显式开关某条渠道；且除到店核销外，各渠道查询**均未按 `usageScene` 做场景隔离**，到店券会混入线上入口。

本次目标：把「分发渠道」建成显式配置，并让**线上商品券与到店券在 6 条渠道上都能分发**。

六条渠道：

| 代号 | 渠道 | 现状 |
| --- | --- | --- |
| `CENTRE` | 优惠券中心领取 | 已有（`couponCentre` / `claimCoupon`） |
| `SALE` | 出售 | **缺失** |
| `POINTS` | 积分换购 | 已有（`pointsMallTemplates` / `exchangeWithPoints`） |
| `CODE` | 优惠码兑换 | 已有（`redeemByClaimCode`） |
| `PRODUCT` | 浏览指定商品领取 | 已有（`listProductCoupons` / `claimProductCoupon`） |
| `GRANT` | 定向发放 | 已有（`grantCouponIssue`） |

## 2. 非目标（Out of Scope）

- 不做领取型/定向型券包（本次仅「出售型」券包）。
- 不重写既有线上购物车用券逻辑（`applyCouponToOrder` / 促销动作 / 订单核销回退）。
- 不为到店券做券码动态刷新（防截图转发）与风控。
- 不引入新的渠道参数表（如「渠道 × 库存 × 时间窗」的独立实体）。
- 不做跨店通用券、多商户联合券。

## 3. 关键决策（已与用户确认）

| 编号 | 决策 | 结论 |
| --- | --- | --- |
| D1 | 覆盖范围 | 6 条渠道 × 线上券 / 到店券**全开**（含 `PRODUCT` 用于特殊需求场景） |
| D2 | 出售形态 | **两种都要**：独立「券商城」+ 商品页「加价购券」 |
| D3 | 退款规则 | **未使用可退**（回收/作废券 + 原路退款）；**已使用不可退** |
| D4 | 渠道建模 | **模板内显式渠道集合**：`CouponTemplate.distributionChannels` + 出售专用 `salePrice`，不新建渠道表 |
| D5 | 指定商品选品 | **双向**：新增券侧批量选品，同时保留商品页快捷挂券，两者读写同一张 `ProductCouponBinding` |
| D6 | 选品粒度 | 默认按商品（SPU），可细化到规格（SKU/variant）；支持关键词搜索 + 按分类批量勾选 |
| D7 | 券包 | 仅**出售型**券包；购买一次生成包内全部券；退款按**整包**维度 |

## 4. 现状摸底（复用点）

### 4.1 后端 `vendure/packages/coupon-plugin`

- 实体：[coupon-template.entity.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon-template.entity.ts) —— 关键既有列：`claimable`（L79）、`claimCode`（L82）、`pointsPrice`（L61）、`perUserLimit`（L64）、`totalCount` / `claimedCount`（L55-58）、`shopId`（L94）、`usageScene`（L96-97，默认 `'ONLINE'`）、`channels: Channel[]`（L99-101）。
- 实体：[customer-coupon.entity.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/customer-coupon.entity.ts)（`code` 唯一、`status`、`expiredAt`）。
- 实体：[product-coupon-binding.entity.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/product-coupon-binding.entity.ts)（`productId` + `variantIds`，本次不改表）。
- 服务：[coupon.service.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon.service.ts) —— 店铺隔离范式 `resolveShopIdFromActiveUser` / `assertManagedByShop`；按 `tpl.channels` 判渠道归属。
- SDL 扩展与解析器注册：[plugin.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/plugin.ts)（`adminApiExtensions` / `shopApiExtensions`）。

### 4.2 后端「付费发放非商品产物」既有范式（本次出售链路的蓝本）

`recharge-card-plugin`（充值卡）已跑通「客户付钱 → 后台入账」的完整链路，**出售券直接镜像该范式**：

- 独立单据实体而非 Vendure `Order`：[recharge-order.entity.ts](file:///d:/zhao/vendure/packages/recharge-card-plugin/src/recharge-order.entity.ts)。
- 解析器：[recharge-order.resolver.ts](file:///d:/zhao/vendure/packages/recharge-card-plugin/src/recharge-order.resolver.ts) —— `createRechargeOrder` / `payRechargeOrder` / `cancelRechargeOrder` / `createWechatRechargePayment(rechargeOrderId, tradeType?, openid?)`。
- 建支付：[recharge-card.service.ts](file:///d:/zhao/vendure/packages/recharge-card-plugin/src/recharge-card.service.ts#L247-L284) —— `outTradeNo = 'RC-<id>'`，经 `gatewayService.createBarePayment({ outTradeNo, amount, tradeType, openid, description })`。
- 回调结算：同文件 `settleRechargeOrderByOutTradeNo`（L287）—— 正则解析 `^RC-(\d+)$`，**原子 `UPDATE ... WHERE status='pending'`** 实现幂等。
- 结算注册：[plugin.ts](file:///d:/zhao/vendure/packages/recharge-card-plugin/src/plugin.ts#L274-L280) —— `onApplicationBootstrap` 经 `ModuleRef` 可选取得 `WechatpaySettlementRegistry`，`registry.register({ prefix: 'RC-', settle })`。
- 自定义支付方式（余额支付）范式：[balance-payment-handler.ts](file:///d:/zhao/vendure/packages/recharge-card-plugin/src/balance-payment-handler.ts)（`PaymentMethodHandler` + `createPayment` / `settlePayment` / `createRefund`）。
- 订单加价项能力：[order.service.ts](file:///d:/zhao/vendure/packages/core/src/service/services/order.service.ts#L1008) 的 `addSurchargeToOrder(ctx, orderId, amount, description)` —— 商品页加价购券的挂载点。

### 4.3 商户端 `vshop/web-admin`

- 券 API：[coupon.ts](file:///d:/zhao/vshop/web-admin/src/apis/coupon.ts)（`client.ts` 的 `getAdminClient()` + `vendure-token` 头）。
- 券模板编辑：[pages/coupon/edit/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/coupon/edit/index.vue)。
- 现有菜单注册：[pages.json](file:///d:/zhao/vshop/web-admin/src/pages.json#L60-L64) —— `pages/coupon/index`（优惠券发行）、`pages/coupon/edit/index`（优惠券）、`pages/coupon/issue/index`（定向发券）。

### 4.4 C 端 `nshop`

- 券能力：[useCoupon.ts](file:///d:/zhao/nshop/layers/base/app/composables/useCoupon.ts) —— 现有 `getCouponCentre` / `getMyCoupons` / `claimCoupon`；本地 TS 类型 + `graphql-request` 运行时查询，`VENDURE_LOCALE_MAP` 做 `zh-CN → zh_Hans` 映射。
- 券页面：[pages/coupon/index.vue](file:///d:/zhao/nshop/layers/base/app/pages/coupon/index.vue) —— 现为「券中心 / 我的钱包」+ 状态 Tab（`unused/used/expired/returned`）。
- 商品页券块：`layers/base/app/components/product-detail/ProductCouponBlock.vue`。

## 5. 数据模型

### 5.1 `CouponTemplate` 新增列

| 列 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `distributionChannels` | `varchar` | `null` | 逗号分隔渠道集合，如 `'CENTRE,SALE,POINTS,CODE,PRODUCT,GRANT'`；**为 `null`/空时按老字段推导**（见 §6.1），保证历史券行为不变 |
| `salePrice` | `int` | `0` | 出售价（**分**，与 Vendure money 单位一致），`0` = 不可售 |

迁移：`packages/coupon-plugin/src/migrations/add-coupon-distribution-channels.ts`（`ALTER TABLE coupon_template ADD COLUMN ...` + 幂等守卫，参照 `add-coupon-usage-scene.ts`）。

### 5.2 新实体 `CouponBundle` / `CouponBundleItem`

`packages/coupon-plugin/src/coupon-bundle.entity.ts`，继承 `VendureEntity` + `ChannelAware`。

`CouponBundle`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `text` | `LocalizedText`（复用 `localizedTextColumn` transformer） |
| `description` | `text` nullable | `LocalizedText` |
| `salePrice` | `int` | 整包售价（分） |
| `enabled` | `boolean` | 上下架，默认 `true` |
| `shopId` | `bigint` nullable | 发行归属店铺（店铺隔离） |
| `channels` | `ManyToMany(Channel)` | 渠道归属 |

`CouponBundleItem`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `bundleId` | `int` | 所属券包 |
| `templateId` | `int` | 券模板 id |
| `quantity` | `int` | 该券在包内的张数，默认 `1` |

### 5.3 新实体 `CouponSaleOrder`

`packages/coupon-plugin/src/coupon-sale-order.entity.ts`，继承 `VendureEntity` + `ChannelAware`。**独立单据，不生成 Vendure `Order`**（对标 `RechargeOrder`）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `customerId` | `int` | 购买人 |
| `payMode` | `varchar` | `WECHAT`（券商城独立支付） \| `ORDER_SURCHARGE`（商品页加价购） |
| `templateId` | `int` nullable | 单券出售时指向券模板 |
| `bundleId` | `int` nullable | 券包出售时指向券包 |
| `orderId` | `int` nullable | `ORDER_SURCHARGE` 时指向主订单 |
| `amount` | `int` | 应付（分） |
| `status` | `varchar` | `PENDING` \| `PAID` \| `CANCELLED` \| `REFUNDED` |
| `paymentMethod` | `varchar` nullable | 如 `wechatpay` |
| `externalRef` | `varchar` nullable | `outTradeNo`（`CS-<id>`） |
| `paidAt` | `Date` nullable | 支付完成时间 |
| `refundedAt` | `Date` nullable | 退款完成时间 |

用 `orderId` 关联加价购意图，**不改 Order customFields**（避免与其他插件的 Order 自定义字段冲突）。

### 5.4 `CustomerCoupon` 新增列

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `saleOrderId` | `int` nullable | 溯源：该券由哪笔出售单生成（退款回收时按此定位） |

### 5.5 新枚举

`types.ts` 新增：

```ts
export type CouponChannel = 'CENTRE' | 'SALE' | 'POINTS' | 'CODE' | 'PRODUCT' | 'GRANT';
export type CouponSaleStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED';
export type CouponSalePayMode = 'WECHAT' | 'ORDER_SURCHARGE';
```

## 6. 分发渠道判定与场景隔离

### 6.1 渠道判定（纯函数，SSR 可用）

```ts
export function resolveCouponChannels(
    tpl: Pick<CouponTemplate, 'distributionChannels' | 'claimable' | 'pointsPrice' | 'claimCode'>,
    hasProductBinding: boolean,
): CouponChannel[]
```

- `distributionChannels` 为 `null`/空（历史券）→ 按老字段推导：`claimable` → `CENTRE`；`pointsPrice > 0` → `POINTS`；`claimCode` 非空 → `CODE`；`hasProductBinding` → `PRODUCT`。
- 显式配置时以其为准，**不再叠加**老字段推导（显式优先）。
- `GRANT` 无历史推导来源，历史券默认不含定向发放。

坏数据（未知代号）忽略；函数为纯函数，不抛异常。

### 6.2 场景隔离（各渠道统一过滤）

| 渠道查询 | 场景过滤 |
| --- | --- |
| `couponCentre` / `pointsMallTemplates` / `redeemByClaimCode` / `listProductCoupons` —— 线上分组 | `usageScene IN ('ONLINE', 'ALL')` |
| 同上 —— 到店分组 | `usageScene IN ('IN_STORE', 'ALL')` |
| `grantCouponIssue`（后台定向） | **不按场景过滤**（后台显式指定对象），但校验渠道集合含 `GRANT` |
| 到店收银可用券列表 | `usageScene IN ('IN_STORE', 'ALL')` |

C 端**同一 Tab 内按场景分组**展示（「线上可用」/「到店可用」），不混排，避免用户误领误用。

## 7. 出售链路

### 7.1 路径 A · 独立券商城（微信支付）

镜像 `recharge-card-plugin` 的 `RC-` 范式，`outTradeNo` 前缀取 **`CS-`**（Coupon Sale）：

```
createCouponSaleOrder(templateId | bundleId)
      │  校验：enabled / 渠道含 SALE / salePrice>0 / 未售罄 / 场景合法
      ▼
createWechatCouponPayment(saleOrderId, tradeType?, openid?)
      │  gatewayService.createBarePayment({ outTradeNo: 'CS-<id>', amount, tradeType, openid })
      │  回写 paymentMethod='wechatpay' + externalRef
      ▼
微信回调 → WechatpaySettlementRegistry 按前缀 'CS-' 命中
      ▼
settleCouponSaleOrderByOutTradeNo(ctx, outTradeNo)
      │  正则 ^CS-(\d+)$
      │  原子 UPDATE ... WHERE status='PENDING'（幂等）
      ▼
待支付态 → 已支付 + 发券（单券 1 张 / 券包按 CouponBundleItem 循环生成）
```

### 7.2 路径 B · 商品页加价购券

不新增购买流程，券价随主订单一起结算：

```
attachCouponToOrder(orderId, templateId)
      │  校验：主订单为本人草稿单 / 渠道含 SALE / 场景合法
      │  建 CouponSaleOrder{ payMode: ORDER_SURCHARGE, orderId, amount: salePrice, status: PENDING }
      ▼
OrderService.addSurchargeToOrder(ctx, orderId, amount, description)
      ▼
主订单支付成功事件（OrderStateTransitionEvent → PaymentSettled）
      │  按 orderId 查 PENDING 的 CouponSaleOrder
      ▼
标记 PAID + 发券（幂等：同一 saleOrder 只结算一次）

detachCouponFromOrder(orderId, templateId) → 取消加价购（移除 surcharge + saleOrder 置 CANCELLED）
```

### 7.3 退款与回收

| 情形 | 处理 |
| --- | --- |
| 出售单 `PAID`，其生成的券**全部未被使用**（`UNUSED`） | 回收：券置 `INVALID`；出售单置 `REFUNDED`；路径 A 走微信退款，路径 B 由主订单退款随单退回 |
| 出售单 `PAID`，其生成的券**存在已使用/已核销** | **拒绝退款**，返回明确错误 |
| 券包（含 N 张） | 按**整包**判定：包内任一张已使用即整包不可退 |
| `PENDING` / `CANCELLED` | 不可退（无支付发生） |
| 过期券 | 视为未使用，可退（按业务口径，见 §16 待确认 5） |

## 8. 幂等与并发

- **回调幂等**：结算以 `UPDATE coupon_sale_order SET status='PAID' WHERE id=? AND status='PENDING'` 的受影响行数判定，`0` 行则直接返回，不重复发券。
- **重复建支付**：仅 `PENDING` 且属本人的出售单可建支付；否则拒绝。
- **加价购重复挂载**：同一 `orderId + templateId` 仅允许一条 `PENDING` 记录（唯一约束或查重拒绝）。
- **售罄保护**：发券时校验 `totalCount`（`0` = 不限）；券包按包内各项分别校验，任一项不足则整包失败并回滚。
- **越权**：非本人出售单、非本人草稿订单一律拒绝。

## 9. GraphQL 契约

### 9.1 admin-api（`adminApiExtensions`）

```
# 券模板扩展
CouponTemplate: + distributionChannels: String, + salePrice: Int
CreateCouponInput / UpdateCouponInput: + distributionChannels: String, + salePrice: Int

# 券侧批量选品（读写既有 ProductCouponBinding）
couponBoundProducts(templateId: ID!): [ProductCouponBinding!]!
bindProductsToCoupon(templateId: ID!, productIds: [ID!]!, variantIds: [ID!]): Int!
unbindProductFromCoupon(templateId: ID!, productId: ID!): Boolean!

# 券包
couponBundles(options: CouponBundleListOptions): CouponBundleList!
couponBundle(id: ID!): CouponBundle
createCouponBundle(input: CouponBundleInput!): CouponBundle!
updateCouponBundle(id: ID!, input: CouponBundleInput!): CouponBundle!
deleteCouponBundle(id: ID!): Boolean!

# 出售单（成交 / 退款流水）
couponSaleOrders(options: CouponSaleOrderListOptions): CouponSaleOrderList!
couponSaleOrder(id: ID!): CouponSaleOrder
refundCouponSaleOrder(id: ID!, reason: String): CouponSaleOrder!
```

### 9.2 shop-api（`shopApiExtensions`）

```
# 券商城
couponSaleCatalogue(scene: CouponUsageScene): CouponSaleCatalogue!

# 出售单（路径 A）
createCouponSaleOrder(templateId: ID, bundleId: ID): CouponSaleOrder!
createWechatCouponPayment(saleOrderId: ID!, tradeType: String, openid: String): CouponWechatPayResult!
cancelCouponSaleOrder(id: ID!): CouponSaleOrder!
refundCouponSaleOrder(id: ID!): CouponSaleOrder!
myCouponSaleOrders: [CouponSaleOrder!]!

# 加价购（路径 B）
attachCouponToOrder(orderId: ID!, templateId: ID!): CouponSaleOrder!
detachCouponFromOrder(orderId: ID!, templateId: ID!): Boolean!
```

`CouponWechatPayResult` 形参对齐充值卡：`{ saleOrderId, outTradeNo, pay }`。

## 10. 权限

- 后台券包 / 选品 / 出售单流水：`Permission.UpdateSettings`（沿用券模板既有权限口径，实施时对齐 `coupon-admin.resolver.ts` 现有装饰器）。
- C 端全部出售 / 加价购接口：`Permission.Authenticated`。
- 所有读写按 `channelId` + `shopId` 双重隔离，沿用 `resolveShopIdFromActiveUser` / `assertManagedByShop`。

## 11. 前端改动

### 11.1 nshop（C 端）

- 券页面 [pages/coupon/index.vue](file:///d:/zhao/nshop/layers/base/app/pages/coupon/index.vue) Tab 扩展为：**领券中心 / 券商城 / 积分商城 / 兑换码 / 我的券**；每个 Tab 内按 `usageScene` 分组（线上可用 / 到店可用）。
- 「我的券」保留 `unused/used/expired/returned` 状态筛，并增加「到店券」分组。
- 券商城支持券包卡片（展示包内券、原价、省额）与支付拉起（`createCouponSaleOrder` → `createWechatCouponPayment` → 微信 JSAPI）。
- 商品详情页 `ProductCouponBlock`：增加「加价购券」入口（调 `attachCouponToOrder`）；到店券加「到店可用」标签。
- [useCoupon.ts](file:///d:/zhao/nshop/layers/base/app/composables/useCoupon.ts) 新增：`getCouponSaleCatalogue` / `createCouponSaleOrder` / `createWechatCouponPayment` / `attachCouponToOrder` / `getMyCouponSaleOrders`。
- 商品图与静态资源 URL 一律用动态 origin（多城市规范）。

### 11.2 vshop/web-admin（商户端）

- 券编辑页增加：**分发渠道多选**（6 个渠道复选）+ **出售价**（`salePrice`，分↔元换算）。
- 券编辑页增加**「指定商品」批量选品器**：关键词搜索 + 按分类批量勾选 + 展开到规格（SKU）。
- 新增菜单（`pages.json`）：「优惠券发行」下增加 `pages/coupon/bundle/index`（券包管理）、`pages/coupon/sale-orders/index`（出售单流水）。
- 券包编辑页：券包信息 + 包内券项（选券模板 + 张数）。

### 11.3 视觉规范

沿用现有 C 端券卡片与后台表格样式；不新增设计系统组件。

## 12. 多语言

- 新增固定文案（Tab 名「券商城」、按钮「立即购买」「加价购券」、退款失败提示等）**同步进 zh-CN / en-US 字典**，走 i18n key，切语言即时生效。
- 券包 `name` / `description` 使用 `LocalizedText` + `localizeText()` 逐级回退。
- 禁止只在单一语言写死文字。

## 13. 测试策略

### 13.1 后端单测（jest，`coupon-plugin`）

- `resolveCouponChannels`：显式集合优先；历史券按老字段推导；未知代号忽略；坏数据不抛异常。
- 场景隔离：线上渠道不返回到店券，反之亦然；`ALL` 两侧都返回。
- 退款判定：全未使用可退；含一张已使用则拒退；券包整包口径。
- 幂等：重复结算不重复发券；重复建支付被拒；越权被拒。

### 13.2 e2e

- 出售单全链路（建单 → 建微信支付 → 回调结算 → 发券 → 幂等重放）。
- 加价购（挂载 surcharge → 主订单支付成功 → 发券）。
- 未使用退款回收；已使用拒退。
- 到店券在线上入口**不可见**、线上券在到店收银列表**不可见**。

### 13.3 交付物（硬性）

- 实现 + API/e2e 回归通过。
- **手机浏览视图截图**（标准视口 390×844，dpr=2 → 780×1688，Playwright 移动视口）覆盖：券商城、券包详情、券页新 Tab、商品页加价购入口、后台渠道多选与选品器。
- 截图补充进操作手册 / 测试用例文档。

## 14. 交付与部署

- 一律**本地构建**，服务器只解压 + `pm2 restart`，**不在服务器构建**。
- `vendure` 后端：git pull + `pm2 restart`（含迁移执行）。
- `vshop/web-admin`、`nshop`：走各自 `scripts/deploy.mjs`（scp 产物 → 服务器解压/拷入）。
- 部署顺序：后端（迁移 + 新 GraphQL）→ web-admin → nshop。

## 15. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 加价购 `surcharge` 与满减/优惠券叠加顺序影响实付 | 实施前先验证活动与促销对 surcharge 的处理；必要时明确 surcharge 不参与券折扣 |
| 微信网关是否支持 bare payment 退款未核实 | 实施首步核实 `gatewayService` 退款能力；不支持则路径 A 退款改为线下/余额补偿（列入待确认） |
| 历史券无显式渠道集合 | 兼容推导分支 + 单测覆盖，保证行为与现状一致 |
| 「显式优先」导致老字段失效引起运营困惑 | 后台券编辑页保存时按当前推导结果**预填**渠道集合，并提示「已改为显式配置」 |
| 到店券走线上支付后核销，退款口径冲突 | 以「包内/单内任一张已使用即拒退」为准，后台退款按钮置灰并给出原因 |
| 与既有 `usageScene` 逻辑冲突 | 场景过滤集中到一处纯函数/查询构造器，避免散落判断 |

## 16. 待确认

1. 出售单是否需支持**余额支付**（需可选注入 `recharge-card` 的余额服务，引入跨插件依赖）。
2. 出售单退款若微信网关不支持 bare payment 退款，走何种补偿方式。
3. `amount` 单位以「分」为准（Vendure money 子单位），需与 `RechargeOrder.amount` 实际口径核对一致。
4. 加价购的券价是否参与满减 / 是否可用平台券抵扣。
5. 过期券是否允许出售单退款（当前口径：视为未使用、可退）。
6. 到店券在券商城是否需要独立场景切换入口，或仅按分组展示。