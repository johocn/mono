# 计划3：优惠券多渠道分发 —— web-admin 商户端

> 关联 spec：`docs/superpowers/specs/2026-10-02-coupon-multi-channel-distribution-design.md`（§11 前端改动）
> 依赖：计划1（分发渠道 + salePrice 字段）、计划2（券包 / 出售单 / 加价购后端）
> 代码库：`d:\zhao\vshop\web-admin`（uni-app 移动端 H5 管理台，Vue3 + SCSS `$wa-*` 令牌）

## 0. 已定稿的交互取向（用户确认）

1. **批量选品器 = 独立页面**：券编辑页新增「适用商品」区块 → 点「批量选品」跳转 `pages/coupon/pick-products/index`，页面内关键词/分类筛选 + 多选商品 + 展开查看 SKU + 全选本页，确定后回填选中数并调用 `bindProductsToCoupon`。
2. **出售单流水提供「退款」入口**：仅 `PAID` 单可退（`refundCouponSaleOrder`）；已使用券会被后端拒退并提示原因。
3. **券包管理 = 列表页 + 独立编辑页**：列表含名称 / 出售价 / 含券明细 / 启用态 + 新建/编辑/删除；编辑页选券模板 + 数量。

## 1. 后端契约（已实现，plan1/plan2）

| 能力 | SDL |
| --- | --- |
| 模板渠道/售价 | `CouponTemplate.distributionChannels: String`、`salePrice: Int!`；`Create/UpdateCouponTemplateInput` 同名可选字段 |
| 券包 | `couponBundles(options){items,totalItems}` / `couponBundle(id)` / `createCouponBundle(input)` / `updateCouponBundle(id,input)` / `deleteCouponBundle(id)`；`CouponBundleInput{name,description,salePrice!,enabled,shopId,items:[{templateId,quantity}]}` |
| 出售单 | `couponSaleOrders(options{skip,take,status})` / `couponSaleOrder(id)` / `refundCouponSaleOrder(id,reason)` |
| 批量绑品 | `bindProductsToCoupon(templateId: ID!, productIds: [ID!]!, variantIds: [ID!]): Int!` |
| 已绑商品 | `couponBoundProducts(templateId: ID!): [ProductCouponBinding!]!` |

要点：
- 渠道代号 `CENTRE | SALE | POINTS | CODE | PRODUCT | GRANT`；`distributionChannels` 为**逗号分隔字符串**。
- `salePrice` 单位**分**（前端元 ↔ 分换算）。
- `bindProductsToCoupon` 的 `variantIds` 对**全部 productIds 统一生效**（后端 uniform 语义），故选品页只做**商品级**批量绑定（全规格适用）；SKU 级绑定仍走商品编辑页「商品专属券」（已支持 per-product variantIds）。
- 券包/出售单均按 `ctx.channelId` 渠道隔离；`refundCouponSaleOrder` 权限 `UpdateOrder`。
- 加价购单（`payMode=ORDER_SURCHARGE`）由主订单支付/取消驱动，不在 web-admin 手工操作。

## 2. 交付物

### 2.1 API 层：`src/apis/coupon.ts`（扩展）
- `CouponTemplateItem` / `CouponTemplateInput` 增 `distributionChannels?: string`、`salePrice?: number`；`FIELDS` 增两字段。
- 常量：`COUPON_CHANNEL_OPTIONS`（6 渠道，顺序=CENTRE,SALE,POINTS,CODE,PRODUCT,GRANT）、`COUPON_CHANNEL_LABEL`、`SALE_STATUS_LABELS`、`SALE_PAY_MODE_LABELS`。
- 新增类型：`CouponBundleRow`、`CouponBundleItemRow`、`CouponSaleOrderRow`。
- 新增函数：`fetchCouponBundles`、`fetchCouponBundle`、`createCouponBundle`、`updateCouponBundle`、`deleteCouponBundle`、`fetchCouponSaleOrders`、`refundCouponSaleOrder`、`bindProductsToCoupon`、`fetchCouponBoundProducts`。

### 2.2 券编辑页：`src/pages/coupon/edit/index.vue`（改造）
- 新增 `分发渠道（多选）`：chip 网格多选（6 渠道），提交时 join(',')；空=不传（保留历史券回退语义）。
- 新增 `出售价（元）`：仅当渠道含 `SALE` 时显示；元→分；0/空=不可售。
- 新增 `适用商品` 区块：显示已绑商品数（`couponBoundProducts`），按钮「批量选品」→ 跳选品页（携带 `templateId`）；新建时因无 id，需先保存后再进入选品（未保存则提示先保存）。

### 2.3 选品页：`src/pages/coupon/pick-products/index.vue`（新增）
- 关键词搜索（`fetchProductList({term})`）+ 分类筛选 + 分页加载更多。
- 商品多选（checkbox）、展开查看该商品 SKU（只读）、全选本页。
- 底部：已选 N 商品 → 「确定绑定」调 `bindProductsToCoupon(templateId, productIds)`，成功回退上一页。

### 2.4 券包管理
- 列表 `src/pages/coupon/bundle/index.vue`（新增）：KPI（券包数/启用中）、列表卡片（名称/出售价/含 N 种券/启用态）、新建/编辑/删除、下拉刷新 + 触底加载。
- 编辑 `src/pages/coupon/bundle/edit/index.vue`（新增）：名称、说明、出售价(元)、启用开关、明细（选券模板 + 数量，可增删行）。

### 2.5 出售单流水：`src/pages/coupon/sale-orders/index.vue`（新增）
- 状态筛选 chips：全部/待支付/已支付/已退款/已取消。
- 行：单号、来源（券商城/券包/加价购）、支付方式、金额、状态、时间。
- 已支付单显示「退款」→ 确认弹窗（可填原因）→ `refundCouponSaleOrder`。

### 2.6 路由与菜单
- `src/pages.json`：注册 4 个新页面。
- `src/constants/menus.ts`：`menu.domain.marketing` 增 `menu.couponBundle`、`menu.couponSaleOrders`（tier 2）。

### 2.7 i18n
- `src/locale/zh-Hans.json` + `src/locale/en.json` 同步新增：`couponEdit`（渠道/售价/适用商品）、`couponPick`、`couponBundle`、`couponSaleOrders`、`menu.*`。禁止只补单语言。

## 3. 验收
- `npm run build:h5`（或项目等价命令）编译通过，无 TS 报错。
- 手机视口（390×844，dpr=2）截图：券编辑（渠道多选+出售价）、选品页、券包列表/编辑、出售单流水（含退款确认）。
- 后端 e2e 已覆盖 API 正确性（计划2），前端以手工/截图回归为主。
- 截图补充进 web-admin 操作手册（`src/static/manual/index.html`）。

---

## 执行记录（计划 3 实际执行结果）

执行方式：按 §2 交付物落地，随后手机视口截图验证 + 收口提交推送。

### 提交

- `vshop` 提交 **`c5cc368`**：`feat(web-admin): 优惠券多渠道分发（渠道多选/出售价/批量选品/券包管理/出售单流水）`。
  - 20 files changed, +1522 / -30；新增 4 个页面（`coupon/bundle`、`coupon/bundle/edit`、`coupon/pick-products`、`coupon/sale-orders`）与 7 张手机视口截图（`coupon3_01`–`coupon3_07`）。
  - 已推送：`06bc80e..c5cc368  master -> master`。

### 交付物落地

| 交付物 | 落点 |
| --- | --- |
| API 扩展（渠道/售价/券包/出售单/批量绑品） | `web-admin/src/apis/coupon.ts`（+253）、`web-admin/src/apis/product.ts`（+44） |
| 券编辑页渠道多选 + 出售价 + 适用商品区块 | `web-admin/src/pages/coupon/edit/index.vue` |
| 批量选品页 | `web-admin/src/pages/coupon/pick-products/index.vue`（新建） |
| 券包管理（列表 + 编辑） | `web-admin/src/pages/coupon/bundle/index.vue`、`bundle/edit/index.vue`（新建） |
| 出售单流水（含退款弹层） | `web-admin/src/pages/coupon/sale-orders/index.vue`（新建） |
| 路由与菜单 | `web-admin/src/pages.json`（+4 页）、`web-admin/src/constants/menus.ts`（营销域 +2 项） |
| i18n | `web-admin/src/locale/zh-Hans.json` / `en.json` 各 +112 行（同步） |
| 操作手册 | `web-admin/src/static/manual/index.html` 新增 `op-14c` 章节（6 渠道表 + 回退规则 + 7 图） |
| 验收脚本 | `web-admin/_e2e/_shot_coupon_multichannel.py` |

### 验收结果

- 构建：`npm run build:h5`（cwd `d:\zhao\vshop\web-admin`）→ **EXIT 0**，`DONE Build complete.`（仅 Sass legacy-js-api 弃用告警，非本次引入）。
- 截图：`web-admin/src/static/manual/shots/coupon3_01..07`（手机视口 390×844、dpr=2）：券编辑渠道多选+出售价 / 适用商品区块 / 批量选品页 / 券包列表 / 券包编辑 / 出售单流水 / 退款确认弹层。
- API 正确性由计划 2 后端 e2e 覆盖；本轮前端以手机视口截图回归为主。

### 说明

- 计划 2「残留/待处理事项」#3（到店收银券列表 GraphQL 未暴露）与 #4（整单退款未订阅 `RefundStateTransitionEvent`）**不在本计划内**，仍待后续计划确认。
- 未纳入提交：`web-admin/scripts/_shot_after_sales_admin.py`（售后期功能脚本，与本计划无关）。