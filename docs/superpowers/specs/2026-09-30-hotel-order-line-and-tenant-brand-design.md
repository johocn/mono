# 酒店订单行（晚数即数量·逐晚价）与租户页头品牌去重设计

> 日期：2026-09-30
> 范围：vendure(cjk-plugin) + nshop
> 状态：设计定稿，待拆实施计划

## 1. 背景与目标

两个独立问题，一次收口：

- **问题 1**：nshop 目录头部（t2 租户「二月兰会员」）出现两个同名品牌文本，左侧 logo 位那个被压扁变形。
- **问题 2**：国信南山温泉节假日房间，入住日选 2 天，结算时商品数量仍为 1（应为 2）、金额仍按基础价 880 计（应为 1880），且同一商品在节假日上浮时存在 880/1000 两个价格，结算页如何显示与处理需符合中国本地习惯。

目标：

1. 页头只保留一处租户名文本，消除变形。
2. 酒店房型的「晚数」成为订单行的第一等公民：`quantity = 晚数`、订单行金额 = 逐晚价格之和。
3. 结算页/购物车/订单确认页以符合本地习惯的方式呈现住宿信息（不暴露均价单价、不可随意加减晚数）。

## 2. 问题1：页头重复品牌文本

### 2.1 根因

`nshop/layers/base/app/components/LogoElement.vue` 在租户路由（URL 首段命中租户 code）下渲染站点名**文本**，其外层 wrapper 为 `w-full h-[40px] md:h-[50px]` + `flex`，文本被压缩为 18px 宽后逐字竖排溢出。

线上实测 DOM：logo 位 span `x=48 y=12 w=18 h=40`（变形）；TenantSelector 按钮 label span `x=114 y=22 w=70 h=20`（正常）。

`/t2` 页面「二月兰会员」共 9 处，页头可见 2 处（LogoElement 文本 + TenantSelector 按钮）。

### 2.2 设计

- `LogoElement.vue` 删除 `tenantName` 分支，恒渲染 `UColorModeImage`（保持既有 `logoLight` / `logoDark` / `wrapperClass` props 契约）。
- 随之删除组件内 `useTenantChannel()`、`useSiteName()`、`tenantName` computed。
- 租户名文本仅由 `header/TenantSelector.vue` 的按钮 label 展示（全站唯一）。
- 影响面（同组件，故意统一）：页头、页脚、登录/注册/验证/找回密码页的品牌位一律回到 logo 图。

### 2.3 验收

- `/t2` 页头「二月兰会员」文本仅 1 处（切换器按钮）。
- logo 位无 18px 宽的竖排文本溢出；`w=18 h=40` 的畸形盒不存在。
- 非租户路由（平台店）页头渲染不变。

## 3. 问题2：酒店订单行

### 3.1 现状与根因

- 日期/晚数只活在前端预览链路：`ProductDetailDateBar` → `productStore.hotelDates` → `ProductDetailPricePreview` 的 `calcNightPrices`（`app/utils/hotel-pricing.ts`）。
- 下单时 `composables/useBuyActions.ts` 恒传 `addItemToOrder(variantId, 1)`，既不传日期也不传晚数。
- 后端 cjk-plugin 的 hotel 模块**只有房型模板管理**（`hotel/hotel-custom-fields.ts`、`hotel/hotel-config.ts`、`room-template*`）：无订单行逐日计价策略、无订单行日期字段、无酒店价格 API。

### 3.2 核心决策（已确认）

1. **晚数即数量**：`OrderLine.quantity = 晚数`，由入离日期算出，不由用户步进。
2. **订单行金额 = 逐晚价格之和**：后端按变体 `hotelRoomConfig` + 入离日期逐晚计价（含节假日上浮、连住折扣）。
3. **去步进器**：酒店订单行不显示 ＋/−，改为「共 N 晚」+「修改日期」。
4. **特殊展示仅限酒店变体**：判定依据为订单行存在 `hotelCheckIn`，普通商品订单行渲染逻辑完全不变。
5. 结算页：不显单价，数量位显示「共 2 晚」，金额位显示住宿总价 ¥1880，下方可展开逐晚明细（周末/节假日标注）。

### 3.3 后端设计（vendure / cjk-plugin）

#### 3.3.1 OrderLine customFields（新增）

新文件 `src/hotel/hotel-order-line-custom-fields.ts`，导出 `hotelOrderLineCustomFields: CustomFields = { OrderLine: [...] }`：

| 字段 | 类型 | public | 说明 |
|---|---|---|---|
| `hotelCheckIn` | `string` | true | 入住日 `YYYY-MM-DD`（date-only，避免时区漂移） |
| `hotelCheckOut` | `string` | true | 离店日 `YYYY-MM-DD` |
| `hotelNights` | `int` | true | 晚数，冗余存储便于展示/审计（与 `quantity` 一致） |

在 `src/plugin.ts` 的 `configure()` 中按现有 `Order` 注册范式追加 `OrderLine`（去重合并，参照 `orderCustomFields.Channel` 的写法）。

声明后 Vendure 自动为 `addItemToOrder` / `adjustOrderLine` 注入 `customFields` 参数（`core/src/api/config/graphql-custom-fields.ts` L521-L546），无需手写 schema 扩展。

#### 3.3.2 酒店计价策略（新增）

新文件 `src/hotel/hotel-order-item-price-strategy.ts`，实现 `OrderItemPriceCalculationStrategy.calculateUnitPrice(ctx, productVariant, orderLineCustomFields, order, quantity)`。

逻辑：

1. `productVariant.customFields.hotelRoomConfig` 缺失 / JSON 解析失败 / `basePriceCent` 非数字 → **返回 `{ price: productVariant.listPrice, priceIncludesTax: productVariant.listPriceIncludesTax }`**（等价默认策略，普通商品零影响）。
2. `hotelCheckIn` / `hotelCheckOut` 缺失或不可解析、或日期差 `< 1` → 同样回退默认策略（按 `listPrice`），**不做猜测性计价**。
3. 逐晚计价：`nights = 日期差`，复用 `hotel/hotel-config.ts` 的 `dayTypeFor`（判定优先级 `custom > holiday > weekend > weekday`）与 `PriceSegment`（`priceCent` 优先，否则 `basePriceCent × rate`），得 `stayTotal`。
4. 连住折扣：`longStayDiscount` 中取满足 `nights >= minNights` 且 `minNights` 最大的一条，`stayTotal × rate`。
5. 返回 `{ price: round(stayTotal / quantity), priceIncludesTax: productVariant.listPriceIncludesTax }`。
   **分母用 `quantity` 而非 `nights`**：因为 `linePrice = unitPrice × quantity` 恒成立，用 `quantity` 作分母可保证 `linePrice ≈ stayTotal`；由前端保证 `quantity === nights`（见 §5 不变量），故实际等价且不引入不可控偏差。

金额自洽：`OrderLine.linePrice = roundMoney(unitPrice, quantity)`（`core/src/entity/order-line/order-line.entity.ts` L249-L263），故 `linePrice = 均价 × 晚数`。

注册：`config.orderOptions.orderItemPriceCalculationStrategy`（`core/src/config/vendure-config.ts` L595）。

#### 3.3.3 `orderBoxes` 扩展（结算页数据源）

- `src/order/order-box.service.ts` 的 `OrderBoxLine` 接口与行映射（L346-L376）新增：
  - `isHotel: boolean`
  - `hotelCheckIn: string | null`、`hotelCheckOut: string | null`、`hotelNights: number | null`
  - `hotelNightly: Array<{ date: string; priceCent: number; type: string }> | null`（非酒店行一律 null）
- 逐晚明细**由后端计算**（与计价策略同一纯函数），与行小计同源，前端不重算、不可篡改。
- `src/plugin.ts` 的 `OrderBoxLine` typedef（L2068-L2078）同步补字段，并新增 `type HotelNightPrice { date: String!, priceCent: Int!, type: String! }`。

#### 3.3.4 前置条件

Vendure 的 `constrainQuantityToSaleable` 会按可售库存截断数量，晚数大于库存将直接返回 `InsufficientStockError`。

**已确认可关闭库存追踪或把库存设足**；实施时先核查「国信南山温泉节假日房间」各变体的 `trackInventory` / 库存设置，不满足则在后台调整（本设计不改库存模型）。

### 3.4 前端设计（nshop）

| 文件 | 改动 |
|---|---|
| `gql/queries/order.gql` | `AddItemToOrder` / `AdjustOrderLine` 增加 `$customFields: OrderLineCustomFieldsInput` 并传参 |
| `gql/queries/order.gql` | `orderBoxes` 查询的 `lines` 补 `isHotel` / `hotelCheckIn` / `hotelCheckOut` / `hotelNights` / `hotelNightly { date priceCent type }` |
| `gql/fragments/order.gql` | `OrderBase.lines` 与 `OrderDetail.lines` 补 `customFields { hotelCheckIn hotelCheckOut hotelNights }` |
| `stores/useOrderStore.ts` | `addItemToOrder(variantId, quantity, customFields?)`、`adjustOrderLine(orderLineId, quantity, customFields?)` 透传 |
| `composables/useBuyActions.ts` | 识别酒店变体（`hotelRoomConfig` 可解析）→ 从 `productStore.hotelDates` 算晚数 → 校验 min/max（越界 toast 且不加入）→ `addItemToOrder(variantId, nights, { hotelCheckIn, hotelCheckOut, hotelNights })`；普通商品维持 `(id, 1)`。加入购物车与立即购买同逻辑 |
| `components/product-detail/ProductDetailDateBar.vue` | 初始化读 `route.query.checkIn/checkOut` 预填（配合「修改日期」跳回） |
| `components/checkout/BoxLines.vue` | 新增酒店行分支（`l.isHotel`）：无单价列、无步进器；数量位显示「共 N 晚」；金额位显示行小计（大字）；名称下方一行「YYYY-MM-DD 至 YYYY-MM-DD」；「逐晚明细」可折叠展开；「修改日期」+「删除」 |
| `components/cart/CartItem.vue` | 新增酒店行分支：显示「N 晚 · 起止日期」+ 住宿总价，隐藏单价行与步进器，保留勾选/删除 |
| `components/order/OrderItems.vue`、`components/order/OrderCardItems.vue`、`components/order/GuestOrderConfirmation.vue` | 酒店行增加「起止日期 · N 晚」展示（订单详情/订单确认） |
| `i18n/locales/zh-CN.ts`、`en-US.ts` | 新增词条（下表），其余语言包缺省回退 en-US |

「修改日期」交互：点击 = 删除该订单行 + 跳转商品详情页并带 `?checkIn=&checkOut=`，由 DateBar 预填；避免同变体不同日期生成两条并行订单行。

新增 i18n 词条（示意，键名以实施为准）：

| key | zh-CN | en-US |
|---|---|---|
| `messages.hotel.stayNights` | 共 {n} 晚 | {n} nights |
| `messages.hotel.dateRange` | {in} 至 {out} | {in} → {out} |
| `messages.hotel.nightlyDetail` | 逐晚明细 | Nightly breakdown |
| `messages.hotel.changeDates` | 修改日期 | Change dates |
| `messages.hotel.stayTotal` | 住宿合计 | Stay total |
| `messages.hotel.selectDatesFirst` | 请先选择入住与离店日期 | Select check-in and check-out dates first |

（日类型标签复用既有 `messages.detail.tHoliday` / `tWeekend` / `tCustom`。）

## 4. 计价规则与舍入取舍

- 逐晚价判定优先级：`custom > holiday > weekend（周五~周日）> weekday（周一~周四）`，与前端 `hotel-pricing.ts` 完全一致。
- `unitPrice = round(总价 / 晚数)`，`linePrice = unitPrice × 晚数`。
  - 2 晚 1880 → 940 × 2 = **1880 精确**。
  - 除不尽时（如 3 晚 2500 → 833 × 3 = 2499）存在 ≤ (晚数−1) 分尾差，属行业惯例，不做特殊处理。
- 结算页逐晚明细之和与行小计的尾差（≤1 分）**在明细末行吸收**，保证「明细之和 = 行小计」。
- 权威口径：**订单行小计以后端 `linePrice` 为准**，逐晚明细仅作解释性展示。

## 5. 边界与不变量

- 普通商品（无 `hotelRoomConfig`）：计价策略直通默认价，`orderBoxes` 酒店字段为 null，前端渲染零变化。
- 酒店行必须满足 `quantity === hotelNights === 日期差`，且 `1 ≤ nights ≤ maxNights`；不满足则拒绝加入并提示。
- 库存不足时按既有 `InsufficientStockError` 路径提示（前置条件已确认可关闭追踪）。
- 未选日期时禁止加入酒店商品（toast 提示）。
- `hotelRoomConfig` 坏 JSON：前端不渲染日期条/价签，后端走默认价（不抛异常）。
- 多语言：前端固定文案走 i18n；后端字段 label 按既有 `LanguageCode` 惯例标注。

## 6. 影响文件清单

**vendure**
- 新增 `packages/cjk-plugin/src/hotel/hotel-order-line-custom-fields.ts`
- 新增 `packages/cjk-plugin/src/hotel/hotel-order-item-price-strategy.ts`
- 改 `packages/cjk-plugin/src/plugin.ts`（OrderLine customFields 注册、orderOptions 策略注册、OrderBoxLine typedef）
- 改 `packages/cjk-plugin/src/order/order-box.service.ts`（OrderBoxLine 接口与行映射）

**nshop**
- `layers/base/app/components/LogoElement.vue`
- `layers/base/gql/queries/order.gql`、`layers/base/gql/fragments/order.gql`
- `layers/base/stores/useOrderStore.ts`
- `layers/base/app/composables/useBuyActions.ts`
- `layers/base/app/components/product-detail/ProductDetailDateBar.vue`
- `layers/base/app/components/checkout/BoxLines.vue`
- `layers/base/app/components/cart/CartItem.vue`
- `layers/base/app/components/order/OrderItems.vue`、`components/order/OrderCardItems.vue`、`components/order/GuestOrderConfirmation.vue`
- `layers/base/i18n/locales/zh-CN.ts`、`en-US.ts`

## 7. 验收标准

1. **问题1**：`/t2` 页头仅 1 处「二月兰会员」文本，logo 位无变形（手机视口 390×844 dpr2 截图）。
2. **问题2 后端 e2e**（Shop API）：`addItemToOrder(酒店变体, 2, { hotelCheckIn: '2026-02-14', hotelCheckOut: '2026-02-16', hotelNights: 2 })` → 断言 `quantity=2`、`unitPriceWithTax=94000`、`linePriceWithTax=188000`；`orderBoxes` 返回 `isHotel=true` 且 `hotelNightly` 为 `[{02-14, 100000, holiday}, {02-15, 88000, weekend}]`。
3. **普通商品回归**：同一环境下普通变体下单价格与改造前一致；`orderBoxes` 酒店字段为 null。
4. **前端 e2e（手机视口 390×844 dpr2 截图）**：详情页选 2 晚 → 加入购物车（购物车行显示「2 晚 · 日期 · ¥1880」）→ 结算页显示「共 2 晚 / ¥1880」，展开逐晚明细为 ¥1000 + ¥880，合计 ¥1880，无步进器；「修改日期」能跳回详情页且日期已预填。
5. **订单确认页/订单详情**展示起止日期与晚数。
6. 截图归档至操作手册；交付 = 实现 + API/e2e 回归 + 手机截图 + 文档。

## 8. 风险

| 风险 | 应对 |
|---|---|
| 酒店变体库存追踪未关闭导致晚数被截断 | 实施第一步核查库存设置；已确认可关闭/设足 |
| `OrderItemPriceCalculationStrategy` 仅在 new/adjusted line 与地址变更时触发 | 本流程仅依赖 add/adjust 两个入口；不引入其他定价来源 |
| 前后端逐晚计价算法漂移（两份实现） | 后端为权威口径；结算页明细取自后端；前端 `hotel-pricing.ts` 仅用于详情页预览 |
| 同变体不同日期生成多条订单行 | 「修改日期」先删行再跳转；`customFieldsAreEqual` 保证相同日期自动合并 |

## 9. 非目标

- 不改库存模型与库存扣减逻辑（仅核查/调整房型变体库存设置）。
- 不做酒店日历库存（按日房量）与房态管理。
- 不做订单行日期的后台编辑 UI（管理端仅能看到字段）。
- 不改订单列表卡片（`components/order/OrderList*.vue`）的摘要渲染，仅改订单详情/确认页的商品行。
- 不改动酒店房型模板管理（`room-template*`）与详情页既有版式。
