# 计划4：优惠券多渠道分发 —— nshop C 端

> 关联 spec：`docs/superpowers/specs/2026-10-02-coupon-multi-channel-distribution-design.md`（§11.1 / §12）
> 依赖：计划1（分发渠道 + salePrice）、计划2（券包 / 出售单 / 加价购后端）、计划3（web-admin 商户端）
> 代码库：`d:\zhao\nshop`（Nuxt3 + Nuxt UI，layers/base）
> 硬规范：多语言 zh-CN/en-US 同步；禁止硬编码域名；手机视口截图 + 操作手册。

## 0. 已定稿的交互取向（用户确认，2026-10-02）

| 项 | 选择 | 说明 |
| --- | --- | --- |
| 券页 Tab 版式 | **B 图标 tab 栏** | 5 项等分固定，图标在上文字在下，窄屏不挤压 |
| 券商城卡片 | **A 券包大卡** | 包名 + 含券明细 chips + 原价/售价对比；单券用同款卡 |
| 商品页加价购入口 | **A 券块内分隔区** | 沿用现有 `ProductCouponBlock`，虚线分隔后加一行「加价购」 |
| 支付方式 | **微信 JSAPI + 余额 双通道** | 微信内走 JSAPI；非微信/无 openid 回退余额支付 |

### 支付链路（关键结论）

- 后端 `createWechatCouponPayment(saleOrderId, tradeType?, openid?)` 中 openid **可省略**：由 `wechatpay-plugin` 的 `resolveCustomerOpenid` 从 `Customer.customFields.wechatOpenid / wechatMiniOpenid` 推导（该字段由微信授权登录写入）。
- 因此 C 端**不需要自己走公众号 OAuth 取 openid**，只需传 `tradeType`：
  - 微信内置浏览器（`/MicroMessenger/i`）→ `JSAPI` → 用 `WeixinJSBridge.invoke('getBrandWCPayRequest', pay)` 拉起。
  - 其它浏览器 → `H5` → 跳转 `pay.payUrl`。
- `WeixinJSBridge` 不可用/未绑定 openid 时，前端提示并回退「余额支付」（`payCouponSaleWithBalance`）。

## 1. 后端契约（已实现，plan1/plan2）

| 能力 | SDL | 备注 |
| --- | --- | --- |
| 券商城目录 | `couponSaleCatalogue(scene: CouponUsageScene): CouponSaleCatalogue!` | `{ templates: [CouponTemplate!]!, bundles: [CouponBundle!]! }` |
| 出售单 | `createCouponSaleOrder(templateId: ID, bundleId: ID): CouponSaleOrder!` | 二选一 |
| 微信支付 | `createWechatCouponPayment(saleOrderId: ID!, tradeType: String, openid: String): CouponWechatPayResult!` | `{ saleOrderId, outTradeNo, pay{ payType, prepayId, appId, timeStamp, nonceStr, package, signType, paySign, payUrl } }` |
| 余额支付 | `payCouponSaleWithBalance(id: ID!): CouponSaleOrder!` | 同步结算 |
| 取消 | `cancelCouponSaleOrder(id: ID!): CouponSaleOrder!` | |
| 我的出售单 | `myCouponSaleOrders: [CouponSaleOrder!]!` | |
| 加价购 | `attachCouponToOrder(orderId: ID!, templateId: ID!): CouponSaleOrder!` / `detachCouponFromOrder(orderId: ID!, templateId: ID!): Boolean!` | |
| 积分商城 | `pointsMallTemplates: [CouponTemplate!]!` / `exchangeCouponWithPoints(templateId: ID!): ExchangeCouponResult!` | 既有，本次接入 Tab |
| 券模板字段 | `CouponTemplate.distributionChannels: String`、`salePrice: Int!`；`CouponIssuedBy` 含 `SALE` | shop SDL 已开放 |

要点：
- `CouponBundle.items`（shop SDL）**仅含** `templateId` + `quantity`，**不含模板详情**；前端用 `catalogue.templates` 按 `templateId` 映射券名/面额，映射不到时降级为「券 ×N」（不新增后端字段，避免超范围）。
- `salePrice` / `amount` 单位**分**。
- 全部接口要求登录（`Permission.Authenticated`）；未登录进券商城/我的券需引导登录。

## 2. 交付物

### 2.1 `layers/base/app/composables/useCoupon.ts`（扩展）
- 类型：`CouponTemplate` 增 `distributionChannels?: string | null`、`salePrice: number`；`CouponIssuedBy` 增 `"SALE"`。
- 新增类型：`CouponSaleCatalogue`、`CouponBundle`、`CouponBundleItem`、`CouponSaleOrder`、`CouponWechatPayResult`、`CouponWechatPayParams`、`ExchangeCouponResult`。
- 新增函数（沿用 `resolveClient()` + `couponErrorMessage` 错误映射）：
  - `getCouponSaleCatalogue(scene?)`
  - `createCouponSaleOrder({ templateId?, bundleId? })`
  - `createWechatCouponPayment(saleOrderId, tradeType?, openid?)`
  - `payCouponSaleWithBalance(id)`
  - `cancelCouponSaleOrder(id)`
  - `getMyCouponSaleOrders()`
  - `getPointsMallTemplates()` / `exchangeCouponWithPoints(templateId)`
  - `attachCouponToOrder(orderId, templateId)` / `detachCouponFromOrder(orderId, templateId)`
- `COUPON_TEMPLATE_FIELDS` 增 `distributionChannels salePrice`。
- 错误映射补充：余额不可用、openid 缺失、未售罄、重复挂载、非本人单据等。

### 2.2 `layers/base/app/pages/coupon/index.vue`（改造）
- Tab 改为 **B 图标 tab 栏**：领券中心 / 券商城 / 积分商城 / 兑换码 / 我的券（inline SVG 图标，选中态 `text-primary`）。
- **领券中心**：沿用现有 `getCouponCentre` + 领取卡片；到店券（`usageScene` 为 `IN_STORE`/`ALL`）加「到店可用」标签。
  - 注意：后端 `couponCentre` 只返回 `ONLINE` 场景（`filterTemplatesByChannelAndScene(own, 'CENTRE', 'ONLINE')`），故**领券中心不做线上/到店分组**；场景切换落在券商城 `saleScene`（ONLINE/IN_STORE）与我的券 `walletScene`（ALL/ONLINE/IN_STORE）子筛。
- **券商城**：`getCouponSaleCatalogue(scene)` → 券包大卡（A 版式）+ 单券卡，支持 `saleScene`（线上/到店）切换；点「立即购买」→ 建单 → 支付方式弹层（微信 JSAPI / 余额）→ 成功后切「我的券」。
- **积分商城**：`pointsMallTemplates` 列表（展示积分价 + 兑换按钮）→ `exchangeCouponWithPoints`。
- **兑换码**：现有 `redeemCouponByCode` 输入框迁入独立 Tab。
- **我的券**：保留 `unused/used/expired/returned` 状态筛，新增「全部/线上/到店」场景子筛；到店券保留「出示券码」入口。
- 未登录访客：券商城/我的券/积分兑换需登录，展示登录引导（沿用现有 `isAuthenticated` 逻辑）。

### 2.3 `layers/base/app/components/product-detail/ProductCouponBlock.vue`（改造）
- 现有可领取券列表保持不变；新增「到店可用」标签（`usageScene` 为 `IN_STORE`/`ALL`）。
- 新增**加价购区**（A 版式：虚线分隔 + 一行「¥N 加价购券」+「加价购」按钮）：
  - 数据来源：当前商品绑定的券中，`distributionChannels` 含 `SALE` 且 `salePrice > 0` 者（用 `getProductCoupons` 已返回的 binding.template）。
  - 点击：`useOrderStore` 取活动订单（无则先 `fetchOrder('base')`）；无活动订单提示「请先加入购物车」；有则 `attachCouponToOrder(order.id, templateId)`，成功后 toast 并提示随单结算。
  - 已挂载的展示「已加购」并可摘除（`detachCouponFromOrder`）。

### 2.4 i18n（`layers/base/i18n/locales/zh-CN.ts` + `en-US.ts`）
- `messages.coupon` 增：`tabCentre/tabSale/tabPoints/tabCode/tabWallet`（可复用现值）、`tabSale`「券商城」、`tabPoints`「积分商城」、`sceneOnline/sceneStore/sceneAll`「线上/到店/全部」、`bundleContains`「含 {n} 种券 · 共 {m} 张」、`bundleSave`「合计可省 ¥{n}」、`buyNow`「立即购买」、`payTitle`「确认购买」、`payWechat`「微信支付」、`payBalance`「余额支付」、`payConfirm`「确认支付 ¥{n}」、`paySuccess`「购买成功，券已入账」、`payFailed`「支付失败」、`noOpenid`「未获取到微信授权，请改用余额支付」、`pointsPrice`「{n} 积分」、`exchange`「兑换」、`exchangeSuccess`「兑换成功」、`saleEmpty`「暂无可购买的券」、`pointsEmpty`「暂无可兑换的券」、`surchargeTitle`「加价购券」、`surchargeBuy`「加价购」、`surchargeAdded`「已加购，随单结算」、`surchargeNeedCart`「请先加入购物车」、`surchargeRemove`「取消加购」、`storeUsable`「到店可用」。
- **zh-CN 与 en-US 同步新增**，禁止单语言写死。

### 2.5 静态资源
- 券包/券图使用动态 origin，禁止硬编码域名（多城市规范）。

## 3. 验收
- `npm run build`（或 nshop 等价命令）通过，无 TS 报错。
- 手机视口（390×844，dpr=2，Playwright mobile）截图覆盖：券页 5 Tab（券商城/积分商城/兑换码/我的券）、券包大卡、支付方式弹层、商品页加价购入口。
- 截图 + 说明补充进 nshop 操作手册（`docs/superpowers/manual/coupon/`）。
- API 正确性以后端 e2e（计划2）为准，前端以手工/截图回归为主。

## 4. 收口
- 三仓库统一：vendure（已提交 `fb1a10044`）/ web-admin / nshop 提交 + 推送。
- 部署顺序：vendure → web-admin → nshop；本地构建，服务器只解压 + `pm2 restart`。

---

## 执行记录（计划 4 实际执行结果）

执行方式：按 §2 交付物落地，随后三端构建验证 + 手机视口截图 + 收口提交推送。

### 提交

| 仓库 | 提交 | 说明 |
| --- | --- | --- |
| `nshop` | **`457c811`** | `feat(nshop): 优惠券多渠道分发 C 端（券商城/积分商城/兑换码/我的券/加价购/支付）`；15 files changed, +1210 / -98 |
| `vendure` | **`f8bf25ede`** | `fix(coupon): listByProduct 接纳 SALE 渠道绑定，供 C 端加价购入口取数`；7 files（src + lib 构建产物）, +80 / -13 |
| `vshop` | **`c5cc368`** | 计划 3（web-admin），见计划 3 执行记录 |

推送结果：`6c2ffe8..457c811  nshop -> nshop`、`33b40441e..f8bf25ede  master -> master`、`06bc80e..c5cc368  master -> master`。

### 交付物落地（nshop）

| 交付物 | 落点 |
| --- | --- |
| C 端能力扩展 | `layers/base/app/composables/useCoupon.ts`（+323：券商城/出售单/加价购/积分商城接口 + 错误映射 + `templateHasChannel`） |
| 券页 5 Tab | `layers/base/app/pages/coupon/index.vue`（+660/-，B 图标 tab 栏；券商城券包大卡 + 场景切换 + 支付弹层 `z-[70]`；积分商城；兑换码；我的券状态/场景双筛） |
| 商品页券块 | `layers/base/app/components/product-detail/ProductCouponBlock.vue`（到店标签 + 加价购区 + `claimableViaProduct()` 渠道区分） |
| i18n | `layers/base/i18n/locales/zh-CN.ts` / `en-US.ts` 各 +44 行（同步） |
| 操作手册 | `docs/superpowers/manual/coupon/README.md` 新增 §8（8.1–8.10，含修复项表与验收） |

### 计划外但必要（修复项，已随 nshop/vendure 提交）

1. **商品页加价购入口取不到数据**：`listByProduct` 走 `visibleBinding` 要求模板含 `PRODUCT` 渠道，把 `SALE`-only 券滤掉 → vendure 新增 `visibleEntryBinding`（`PRODUCT` 或 `SALE` 均可见，仍校验 enabled/场景/channelId；结算侧 `listByTemplate` 不受影响），并补 1 条单测（含 CENTRE-only / SALE+IN_STORE / 跨渠道三类反例）。
2. **手机支付弹层按钮点不动**：弹层 `z-50` < 固定底部导航 `z-[60]` → 改 `z-[70]`。
3. **`SALE`-only 券误入商品页「领取」区**：领取区新增 `claimableViaProduct()`（显式渠道优先、未配置回落 `claimable`）。

### 验收结果

- nshop 构建：`npm run build`（cwd `d:\zhao\nshop`）→ **EXIT 0**，`✨ Build complete!`（Σ 28.4 MB）。
- vendure：`npx tsc --noEmit -p tsconfig.json`（cwd `packages/coupon-plugin`）→ **EXIT 0**；`npx vitest --config vitest.config.mts --run src/` → **9 files / 115 passed / 0 failed**。
- 手机视口（390×844、dpr=2、Playwright mobile）截图 8 张：`plan4-01-tabs` / `02-sale-bundle` / `03-sale-instore` / `04-pay-sheet` / `05-points` / `06-code` / `07-wallet` / `08-product-addon`（+ `08b-product-page`）。
- 裸 i18n key 检查 = `[]`（`messages.coupon.*` 无遗漏，zh-CN 与 en-US 同步）。

### 待处理（沿用计划 2 残留事项，不在本计划内）

1. 真实 DB 运行态 e2e（微信结算回调、退款回收、券包逐张签发、并发幂等）。
2. 加价购 `addSurchargeToOrder` 在真实订单金额计算中的表现。
3. 到店收银券列表 `listInStoreCoupons` 接入 GraphQL 暴露面。
4. 加价购整单退款（未取消）未订阅 `RefundStateTransitionEvent → Settled`，回收口径与 `returnCouponOnFullRefund` 不一致。