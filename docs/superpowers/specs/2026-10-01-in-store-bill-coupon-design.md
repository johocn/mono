# 到店买单 · 优惠券核销打折 设计文档

- 日期：2026-10-01
- 涉及仓库：`vendure`（coupon-plugin）、`vshop/web-admin`、`nshop`
- 状态：设计已确认，待写实施计划

## 1. 背景与目标

多租户商城当前只有「线上订单用券」一条链路（券绑定 Vendure Order，下单占用、支付核销）。本次为租户增加**到店买单**场景：

1. 平台**不收款**、不产生线上订单，只做引流工具。
2. 用户主动领取「到店买单券」→ 到店消费时出示券码/二维码。
3. 商户在 web-admin 核销：输入或扫描券码 → 拉取券信息 → **手填消费原价** → 系统按券折扣算出实付（默认 8 折）→ 确认核销。
4. 商户按实付金额**线下收款**，系统记录一条「买单流水」（原价 / 折扣 / 优惠额 / 实付 / 核销人 / 时间）。

## 2. 非目标（Out of Scope）

- 不做在线支付、不生成 Vendure `Order`、不做平台分账与结算。
- **不修改**现有线上购物车用券逻辑（`applyCouponToOrder` / 促销动作 / 订单核销回退）。
- 不做券码的动态刷新（防截图转发）与风控，本期券码为静态明文。
- 不做多商户联合券、跨店通用券。

## 3. 关键决策（已与用户确认）

| 编号 | 决策 | 结论 |
| --- | --- | --- |
| D1 | 场景标记方式 | `CouponTemplate` 新增 `usageScene` 字段（`ONLINE \| IN_STORE \| ALL`，默认 `ONLINE`），**不新增 CouponType** |
| D2 | 流水存储 | **新建独立表** `in_store_bill`，不改 `MerchantSettlementLedger`（其 `orderId` 为 NOT NULL + 索引） |
| D3 | 折扣配置 | 以**券模板 `discountValue`** 为准（`PERCENT` + `80` = 8 折）；新建券表单默认预填 80 |
| D4 | 商户端入口 | web-admin 新建独立菜单「到店买单」，含「核销」与「流水」两页 |

## 4. 现状摸底（复用点）

### 4.1 后端 `vendure/packages/coupon-plugin`

- 实体：[coupon-template.entity.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon-template.entity.ts)（含 `shopId`、`channels: Channel[]`）、[customer-coupon.entity.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/customer-coupon.entity.ts)（`code` 唯一、`status`、`expiredAt`；**无 channelId**）。
- 枚举：[types.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/types.ts) 中 `CouponType = FIXED | PERCENT | FULL | FREE_SHIPPING`，`CouponStatus = UNUSED | USED | RETURNED | EXPIRED | INVALID`，`CouponScope`。
- 服务：[coupon.service.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon.service.ts)，含 `resolveShopIdFromActiveUser` 与 `assertManagedByShop`（店铺隔离范式）、按 `tpl.channels` 判渠道归属（约 `coupon.service.ts:558`）。
- SDL 扩展与解析器注册：[plugin.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/plugin.ts)（`adminApiExtensions` / `shopApiExtensions`）。
- 迁移：[migrations/index.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/migrations/index.ts) 导出，供 `plugin.ts` 的 `providers` 注册。

### 4.2 商户端 `vshop/web-admin`

- 券 API：[coupon.ts](file:///d:/zhao/vshop/web-admin/src/apis/coupon.ts)（[client.ts](file:///d:/zhao/vshop/web-admin/src/apis/client.ts) 的 `getAdminClient()` + `vendure-token` 头）。
- 券模板编辑：[pages/coupon/edit/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/coupon/edit/index.vue)（`PERCENT` 折数输入做 `折数 × 10`）。
- 核销页参照：[pages/pickup/redeem/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/pickup/redeem/index.vue)（输码/扫码 + 确认收款）。
- 路由注册：`src/pages.json`。

### 4.3 C 端 `nshop`

- 券能力：[useCoupon.ts](file:///d:/zhao/nshop/layers/base/app/composables/useCoupon.ts)（`getMyCoupons` / `claimCoupon` / `redeemCouponByCode`，本地 TS 类型 + `graphql-request` 运行时查询，`VENDURE_LOCALE_MAP` 做 `zh-CN → zh_Hans` 映射）。
- 券页面：[pages/coupon/index.vue](file:///d:/zhao/nshop/layers/base/app/pages/coupon/index.vue)（兑换码 / 券中心 / 我的钱包三 Tab）。
- 商品页券块：`layers/base/app/components/product-detail/ProductCouponBlock.vue`。

## 5. 数据模型

### 5.1 `CouponTemplate` 新增列

| 列 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `usageScene` | `varchar` | `'ONLINE'` | `ONLINE` 仅线上订单券；`IN_STORE` 仅到店买单券；`ALL` 两者皆可 |

- 历史数据默认 `ONLINE`，行为与现状完全一致。
- 迁移文件：`packages/coupon-plugin/src/migrations/add-coupon-usage-scene.ts`（`ALTER TABLE coupon_template ADD COLUMN usageScene ...` + 幂等守卫）。

### 5.2 新表 `in_store_bill`

`packages/coupon-plugin/src/in-store-bill.entity.ts`，继承 `VendureEntity`（自带 `id / createdAt / updatedAt`）。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `channelId` | `bigint` | NOT NULL, 索引 | 核销发生的租户渠道 |
| `customerCouponId` | `int` | NOT NULL | 被核销的用户券 id |
| `couponCode` | `varchar` | NOT NULL, 索引 | 券码快照 |
| `couponTemplateId` | `int` | NOT NULL | 券模板 id |
| `couponName` | `varchar` | nullable | 券名快照（模板改名后仍可追溯） |
| `customerId` | `int` | NOT NULL, 索引 | 顾客 id |
| `customerName` | `varchar` | nullable | 顾客名快照 |
| `customerPhone` | `varchar` | nullable | 顾客手机号快照 |
| `discountType` | `varchar` | NOT NULL | `PERCENT \| FIXED \| FULL` 快照 |
| `discountValue` | `int` | NOT NULL | 快照（`PERCENT` 为折数，如 80） |
| `originalAmount` | `int` | NOT NULL | 原价（分），商户手填 |
| `discountAmount` | `int` | NOT NULL | 优惠额（分） |
| `finalAmount` | `int` | NOT NULL | 实付（分） |
| `operatorId` | `int` | NOT NULL | 核销管理员 id |
| `operatorName` | `varchar` | nullable | 核销人名称快照 |
| `remark` | `varchar` | nullable | 备注 |
| `billedAt` | `datetime` | NOT NULL | 核销（买单）时间 |

- 复合索引：`(channelId, billedAt)`；单列索引：`couponCode`、`customerId`。
- 迁移文件：`packages/coupon-plugin/src/migrations/create-in-store-bill.ts`。
- 两个迁移均需在 `migrations/index.ts` 导出，并在 `plugin.ts` 的 `providers` 中注册。

### 5.3 新枚举

```
enum CouponUsageScene { ONLINE IN_STORE ALL }
```

## 6. 计算规则

统一由**纯函数** `computeInStoreBill(template, originalAmount)` 实现（新文件 `packages/coupon-plugin/src/in-store-bill.ts`，无副作用、可单测）：

- `PERCENT`：`finalAmount = Math.round(originalAmount * discountValue / 100)`，`discountAmount = originalAmount - finalAmount`
- `FIXED` / `FULL`：`discountAmount = Math.min(discountValue, originalAmount)`，`finalAmount = originalAmount - discountAmount`
- `FREE_SHIPPING`：**不支持到店买单**，核销时拒绝（错误码 `TYPE_NOT_SUPPORTED`）
- `minSpend > 0` 时要求 `originalAmount >= minSpend`，否则拒绝（`MIN_SPEND_NOT_MET`）
- 金额单位统一为**分（int）**；`originalAmount` 必须为正整数
- 兜底：`finalAmount` 不小于 0

**示例**：`PERCENT` + `discountValue=80`，原价 `20000` 分 → 优惠 `4000` 分，实付 `16000` 分（¥160.00）。

## 7. 核销校验顺序

1. `code` 非空
2. `CustomerCoupon` 按 `code` 存在，否则 `COUPON_NOT_FOUND`
3. 关联 `CouponTemplate` 存在且 `enabled`，否则 `TEMPLATE_DISABLED`
4. `status === 'UNUSED'`，否则 `COUPON_NOT_UNUSED`
5. 未过期：`expiredAt` 为空或 `> now`，否则 `COUPON_EXPIRED`
6. `usageScene` 含 `IN_STORE`，否则 `SCENE_MISMATCH`
7. 券模板 `channels` 含当前 `ctx.channelId`（跨租户隔离），否则 `TENANT_MISMATCH`
8. admin 核销时额外校验：`template.shopId` 为空（平台级券）或 `=== 当前管理员店铺`，否则 `TENANT_MISMATCH`
9. 类型/门槛/金额规则见第 6 节

失败一律**不写流水**，券状态不变。

## 8. 幂等与并发

- `inStoreBillRedeem` 为 `@Transaction()`：校验 → 更新 `CustomerCoupon.status = 'USED'`、`usedAt = now` → 插入 `in_store_bill`，三步同事务。
- 并发防护：`UPDATE customer_coupon SET status='USED' WHERE id = ? AND status='UNUSED'`，判断 `affectedRows`；为 0 则抛 `COUPON_NOT_UNUSED`。
- **不**额外给 `in_store_bill.couponCode` 加唯一约束——券码唯一性已由 `customer_coupon.code` 唯一索引 + 上述状态条件更新共同保证。

## 9. GraphQL 契约

### 9.1 admin-api（`adminApiExtensions`）

```graphql
enum CouponUsageScene { ONLINE IN_STORE ALL }

type CouponTemplate {
  # ...既有字段
  usageScene: CouponUsageScene!
}

input CreateCouponTemplateInput { # ...既有字段
  usageScene: CouponUsageScene
}
input UpdateCouponTemplateInput { # ...既有字段
  usageScene: CouponUsageScene
}

type InStoreBillQuote {
  ok: Boolean!
  reason: String
  couponCode: String
  couponName: String
  discountType: String
  discountValue: Int
  minSpend: Int
  originalAmount: Int
  discountAmount: Int
  finalAmount: Int
  customerName: String
  customerPhone: String
  expiresAt: DateTime
}

type InStoreBill implements Node {
  id: ID!
  channelId: ID!
  couponCode: String!
  couponTemplateId: ID!
  couponName: String
  customerId: ID!
  customerName: String
  customerPhone: String
  discountType: String!
  discountValue: Int!
  originalAmount: Int!
  discountAmount: Int!
  finalAmount: Int!
  operatorId: ID!
  operatorName: String
  remark: String
  billedAt: DateTime!
  createdAt: DateTime!
}

type InStoreBillList implements PaginatedList {
  items: [InStoreBill!]!
  totalItems: Int!
}

type InStoreBillSummary {
  count: Int!
  originalTotal: Int!
  discountTotal: Int!
  finalTotal: Int!
}

input InStoreBillListOptions {
  skip: Int
  take: Int
  couponCode: String
  from: DateTime
  to: DateTime
}
input InStoreBillSummaryOptions { from: DateTime, to: DateTime }

extend type Query {
  inStoreBillQuote(code: String!, originalAmount: Int!): InStoreBillQuote!
  inStoreBills(options: InStoreBillListOptions): InStoreBillList!
  inStoreBillSummary(options: InStoreBillSummaryOptions): InStoreBillSummary!
}

extend type Mutation {
  inStoreBillRedeem(code: String!, originalAmount: Int!, remark: String): InStoreBill!
}
```

- `inStoreBillQuote` 供**核销表单实时试算**，失败返回 `ok=false` + 中文 `reason`，不抛错；`reason` 取值即第 7 节错误码。
- `inStoreBillRedeem` 失败抛 `UserInputError`，消息为对应中文文案。

### 9.2 shop-api（`shopApiExtensions`）

```graphql
enum CouponUsageScene { ONLINE IN_STORE ALL }

type CouponTemplate {
  # ...既有字段
  usageScene: CouponUsageScene!
}
```

- C 端**不新增**试算接口：原价由商户核销时填写，顾客侧只需知道「到店可享 X 折」，直接读 `template.discountValue` 渲染即可。
- 仅需把 `CouponTemplate.usageScene` 暴露给 shop-api，C 端据此判断券卡是否显示「出示券码」入口。

## 10. 权限

- 沿用 coupon-plugin 既有范式（参考 [tenant-config-admin.resolver.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/admin/tenant-config-admin.resolver.ts)）：SuperAdmin 放行；普通管理员须通过 `assertManagedByShop` 校验。
- 流水查询按 `ctx.channelId` 强制过滤，管理员无法跨租户查看。
- C 端 `inStoreBillQuote` 走登录态（`ctx.activeUserId` 必须存在）。

## 11. 前端改动

### 11.1 nshop（C 端）

| 项 | 内容 |
| --- | --- |
| `composables/useCoupon.ts` | 本地类型补 `usageScene` |
| 新增页 `layers/base/app/pages/coupon/code.vue` | 券码出示页：券名 / 折扣 / 有效期 / **二维码** / 大字券码 / 提示「向商户出示此码，核销后按 X 折结算」 |
| `pages/coupon/index.vue` | 「我的钱包」券卡：当 `usageScene` 含 `IN_STORE` 且 `status === 'UNUSED'` 时显示「出示券码」按钮，跳转券码页（query 传 `code`） |
| 二维码 | 复用 nshop 现有二维码方案；内容为**券码明文**（`CustomerCoupon.code`） |
| i18n | 新增词条须同步 **zh-CN 与 en-US** 两套语言包 |

### 11.2 vshop/web-admin（商户端）

| 项 | 内容 |
| --- | --- |
| 新增 `src/apis/in-store-bill.ts` | `inStoreBillQuote` / `inStoreBillRedeem` / `inStoreBills` / `inStoreBillSummary` 封装 |
| 新增页 `src/pages/in-store/redeem/index.vue` | 输码 / 扫码 → 券信息卡 → 手填原价 → 实时试算（原价 / 优惠 / 实付）→ 备注 → 确认核销 → 成功态展示流水号 |
| 新增页 `src/pages/in-store/bills/index.vue` | 汇总条（笔数 / 实收 / 优惠）+ 明细分页列表 + 券码 / 时间筛选 |
| `src/pages.json` | 注册「到店买单」菜单（核销、流水两个子页） |
| `src/pages/coupon/edit/index.vue` | 新增「使用场景」选择（默认 `ONLINE`；选 `IN_STORE` 时提示并按 8 折预填 `discountValue=80`） |
| i18n | 同步全部语言包 |

### 11.3 视觉规范

- 已按用户硬规范以 **PureShowWidget 内联 mockup** 呈现并确认三屏：C 端券码页、商户端核销页、商户端流水页。
- 金额展示统一 `¥` + 两位小数；折扣展示「8 折」。

## 12. 测试策略

### 12.1 后端单测（jest，`coupon-plugin`）

- `computeInStoreBill` 纯函数：`PERCENT` 边界（1 / 50 / 99 折）、`FIXED`/`FULL` 直减、直减超过原价、`minSpend` 边界、`FREE_SHIPPING` 拒绝、金额为 0 / 负数。
- 核销分支：不存在 / 已使用 / 已过期 / 场景不符 / 跨渠道 / 非本店 / 模板停用 / 未达门槛 / 非法原价。
- 并发：状态条件更新 `affectedRows = 0` 时抛 `COUPON_NOT_UNUSED`。

### 12.2 e2e

「领券 → 我的卡包 → 出示券码 → 商户端输码 → 试算 → 确认核销 → 券置已用 → 流水列表可见」全链路。

### 12.3 交付物

- 每次功能测试用**手机视口 390×844（dpr=2）** 截图，并补充到操作手册：`vshop/web-admin/docs/superpowers/manual/<topic>/README.md`。
- 功能交付 = 实现 + 单测/e2e 回归 + 手机截图 + 操作手册。

## 13. 交付与部署

- `vendure`：本地构建 `packages/coupon-plugin/lib`（lib 入库）→ push → 服务器 `/www/apps/vendure` `git pull` + `pm2 restart vendure --update-env`，并 `pm2 restart vendure-worker`。
- `vshop/web-admin`：`npm run build:h5` → `node scripts/deploy.mjs`。
- `nshop`：`npm run deploy`。
- **一律本地构建**，服务器只解压 / `pm2 restart`。

## 14. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| `CustomerCoupon` 无 `channelId`，跨渠道券码理论上可被别的渠道核销 | 核销时经 `CouponTemplate.channels` + `shopId` 双重校验兜住；不做数据迁移 |
| 商户手填原价可能填错 | 前端二次确认 + 备注字段 + 流水可追溯核销人；不引入原价校验阈值 |
| 迁移影响线上券行为 | `usageScene` 默认 `ONLINE`，历史券语义不变；迁移含幂等守卫 |
| 券模板改名后流水难追溯 | 流水表冗余 `couponName` 快照 |

## 15. 待确认

无。第 3 节四项决策已由用户确认，实施前无需再决。
