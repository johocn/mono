# 商品详情页六项修复 · 操作与验收手册

> 适用站点：C 端商城 www.youshop.cn（nshop）｜运营后台 e.joho.cn/guanli（web-admin）
> 本次修复覆盖：商品图片多图展示、促销/服务方案后台配置、就近库存城市兜底、营销标签角标、面包屑层级、底部导航栏。

---

## 目录

- [1. 六项修复一览](#1-六项修复一览)
- [2. 运营端操作：促销方案 / 服务保障配置](#2-运营端操作促销方案--服务保障配置)
- [3. 运营端操作：营销标签与商品图片](#3-运营端操作营销标签与商品图片)
- [4. C 端验收点（手机视口）](#4-c-端验收点手机视口)
- [5. 常见问题](#5-常见问题)
- [6. 酒店房型订单行（2026-09-30）](#6-酒店房型订单行2026-09-30)

---

## 1. 六项修复一览

| # | 修复项 | 修复前 | 修复后 |
|---|--------|--------|--------|
| 1 | 商品图片 | 多图被裁切、无法滑动 | 缩略图条可横滑完整查看；大图显示 `n/m` 角标 |
| 2 | 促销/服务方案 | 前端写死文案 | 运营后台维护「方案库」，商品可多选覆盖，C 端按「商品→频道→i18n」回退 |
| 3 | 就近库存 | 无定位时不显示门店库存 | 无定位但有城市时按城市兜底查询；无城市才显示定位引导 |
| 4 | 营销标签 | 仅列表页有标签 | 详情页主图右上角以角标叠层显示；灯箱 caption 同步；12 语言包映射 |
| 5 | 面包屑 | 同级分类出现伪层级（休闲娱乐 > 特色） | 只取首个顶级分类：`首页 > 休闲娱乐 > 商品名` |
| 6 | 底部导航栏 | 四列导航挤压双按钮、文字换行变形 | 仅保留「返回 + 首页(宽屏) + 加入购物车 + 立即购买」，宽窄屏自适应 |

---

## 2. 运营端操作：促销方案 / 服务保障配置

### 2.1 第一步：维护频道方案库（店铺信息）

1. 登录运营后台 `e.joho.cn/guanli`，进入 **店铺信息**
2. 找到 **「促销方案库」** 卡片：每行填写 `code`、中文文案、英文文案
3. 点击 **「+ 添加方案」** 增加条目，不需要的条目点 **「删」** 移除
4. **「服务保障库」** 卡片同理
5. 点击 **「保存」**

> 方案库是**频道默认**：只要商品未单独勾选，C 端展示方案库全部文案。

```
┌────────────────────────────────────────────┐
│ 促销方案库（频道默认；商品可覆盖）           │
│ ┌──────────┬────────────┬────────────┐ ┐   │
│ │ freeShip99│ 满99元包邮  │Free ship 99│ │删 │
│ └──────────┴────────────┴────────────┘ ┘   │
│ [+ 添加方案]                                │
│ 服务保障库（频道默认；商品可覆盖）           │
│ ┌──────────┬────────────┬────────────┐ ┐   │
│ │ refund7   │7天无理由退换│7-day return│ │删 │
│ └──────────┴────────────┴────────────┘ ┘   │
│ [+ 添加方案]                                │
│                                [保存]      │
└────────────────────────────────────────────┘
```

### 2.2 第二步：商品选择促销/服务（商品编辑 → 品牌营销）

1. 进入 **商品管理 → 编辑商品**
2. 切换到 **「品牌营销」** Tab
3. **「促销方案」** 卡片：勾选该商品要展示的方案（来自方案库）
4. **「服务保障」** 卡片：勾选该商品要展示的保障
5. 保存商品

> 商品勾选后为**商品覆盖**：C 端只显示勾选项；若方案库为空，页面提示先去店铺信息配置。

```
┌────────────────────────────────────────────┐
│ 促销方案                                    │
│ ☑ 满99元包邮   ☐ 下单立减20   ☐ 买一送一     │
│ 服务保障                                    │
│ ☑ 7天无理由退换  ☑ 顺丰包邮   ☐ 极速退款     │
└────────────────────────────────────────────┘
```

### 2.3 C 端展示回退链

```
商品勾选（promos/services） → 频道方案库（promoSchemes/serviceSchemes） → i18n 默认文案
```

### 2.4 运营端截图

![店铺信息-方案库](assets/wa-shop-info-scheme-library.png)

- 「促销方案库 / 服务保障库」卡片：每行填写 code + 中文 + 英文，`+ 添加方案` 增行，`删` 移除
- 未配置时商品侧显示「请先在店铺信息-促销方案库配置」空态引导

![商品编辑-品牌营销](assets/wa-product-brand-marketing-schemes.png)

- 「促销方案 / 服务保障」多选：选项来自频道方案库，勾选即商品覆盖；不勾选则回退频道默认
- 「营销标签」：新品/热卖/特价/限时折扣/包邮/满减/清仓/有货 8 个可选

---

## 3. 运营端操作：营销标签与商品图片

### 3.1 营销标签

1. 商品编辑 → **「品牌营销」** Tab → **「营销标签」**
2. 勾选标签（新品/热卖/特价/限时折扣/包邮/满减/清仓/有货）
3. 保存后 C 端详情页主图右上角以**红色角标叠层**显示；点开大图（灯箱）caption 同步标签

> 12 种语言均已内置标签翻译，未知 code 会按原文兜底显示，不会报错。

### 3.2 商品图片

- 图片区显示 **「已关联 N 张」**，最多 9 张
- C 端缩略图条**可横向滑动**，点击切换大图；大图左上角显示 `n/m` 当前位置

---

## 4. C 端验收点（手机视口）

> 以下截图均为手机视口（390×844、dpr=2）实拍。

### 4.1 商品图片与营销标签角标

![商品详情-多图与角标](assets/verify-final-hotel.png)

- 缩略图条可横滑、大图 `n/m` 角标
- 主图右上角营销标签角标（如「降价」「新品」）

### 4.2 促销/服务与就近库存

![就近库存城市兜底](assets/verify-final-city-fallback.png)

- 促销/服务条来自后台方案库配置
- **无定位、有城市**时按城市查询就近库存（不再出现「开启定位可查看就近库存」）

### 4.3 就近库存·城市切换库存三态

> 前提：主仓库（默认）绑定至「上海市」，另建「北京前置仓」并绑定同商品；两仓库服务城市分别配置为上海市 / 北京市。切换已选城市时，详情页主图下方「就近库存」数值随城市变化。

![切城市-上海就近50](assets/verify-city-stock-shanghai-50.png)　![切城市-北京就近10](assets/verify-city-stock-beijing-10.png)

- **上海（服务城市）**：`就近库存 50 件可售 共 1 个门店`（命中本市默认仓）
- **北京（服务城市）**：`就近库存 10 件可售 共 1 个门店`（命中北京前置仓）
- **未覆盖城市**（如广州）：回退镜像虚拟仓可售数；**未选城市**：聚合全部绑定门店库存
- **纯虚拟商品**（未绑定任何门店仓）：任意城市均恒定同一可售数，不受城市切换影响（防回归）

### 4.4 面包屑

- 面包屑 = `首页 > 休闲娱乐 > 商品名`（只取首个顶级分类，无伪层级）

### 4.5 底部导航栏

![底栏-宽屏](assets/verify-final-ticket.png)　![底栏-窄屏360](assets/verify-final-bottombar-narrow.png)

- 宽屏（≥375px）：返回 | 首页 | 加入购物车 | 立即购买
- 窄屏（<375px）：返回 | 加入购物车 | 立即购买（首页隐藏，双按钮不换行）

---

## 5. 常见问题

### Q1：C 端促销条没显示后台配的方案？

1. 确认「店铺信息」已保存方案库，且 **code 非空**
2. 确认商品「品牌营销」勾选的 code 与方案库 code 一致
3. 商品勾选了 code 就只显示勾选项——想恢复频道默认，取消全部勾选

### Q2：营销标签显示成了英文 code？

- 标签 code 不在 12 语言包翻译表内（按原文兜底）。请在语言包 `messages.detail.marketingTags` 补充该 code 的翻译，或用后台内置的 8 个标签 code

### Q3：就近库存提示「开启定位」？

- 说明当前**既无定位、也无已选城市**：在首页/定位组件手动选择城市后即按城市兜底查询

### Q4：底栏在窄屏变形？

- 窄屏（<375px）自动隐藏「首页」项，仅保留返回+双按钮；若仍变形，检查是否命中 `min-[375px]:flex` 断点

---

## 6. 酒店房型订单行（2026-09-30）

> 范围：酒店房型（变体 `customFields.hotelRoomConfig` 非空）的**详情页 → 购物车 → 结算页 → 订单页**全链路。
> 口径：**订单行数量 = 住宿晚数**，按入/离日期**逐晚计价**。
> 样例数据（生产 t2「二月兰会员」）：`国信南山温泉节假日房间`（variantId=58）。

### 6.1 计价口径

- 选择入住/离店日期后：**晚数 = 离店 − 入住**（入住当日计第 1 晚），并作为下单数量 `quantity`
- 单价 = 逐晚价格合计 ÷ 晚数；逐晚价格类型判定优先级：`custom > holiday > weekend > weekday`
- 例（e2e 口径）：入住 `2026-02-14`、离店 `2026-02-16`（2 晚）→ `quantity=2`、`unitPriceWithTax=94000`、`linePriceWithTax=188000`；逐晚 `2026-02-14=88000/weekend`、`2026-02-15=100000/holiday`

### 6.2 C 端验收点（手机视口 390×844 dpr=2）

![详情页：入住/离店日期条 + 逐日计价 + 预估总价](../shots/2026-09-30-hotel-orderline/01-detail-datebar.png)

![购物车：酒店行显示「共 N 晚 · 起止日期」与修改日期/删除](../shots/2026-09-30-hotel-orderline/02-cart-hotel-line.png)

![结算页（折叠）：酒店行显示晚数与日期区间](../shots/2026-09-30-hotel-orderline/03-checkout-collapsed.png)

![结算页（展开逐晚明细）：每晚日期 + 类型 + 价格](../shots/2026-09-30-hotel-orderline/04-checkout-expanded.png)

![页头品牌去重：品牌位仅一个标识，不再重复渲染租户名](../shots/2026-09-30-hotel-orderline/05-header-brand.png)

- 详情页：日期条可改期；底部「加入购物车/立即购买」受库存与晚数范围校验
- 购物车/结算/订单：酒店行统一显示「共 N 晚 · YYYY-MM-DD 至 YYYY-MM-DD」，结算页可展开「逐晚明细」
- 页头：品牌位（Logo）与租户名切换器去重，不再叠加渲染租户名文本

### 6.3 后台配置：房源与逐晚价

商品变体自定义字段 `hotelRoomConfig`（文本，存 **JSON 字符串**；坏 JSON / 缺 `basePriceCent` 一律回退为非酒店）：

```json
{
  "basePriceCent": 88000,
  "minNights": 1,
  "maxNights": 30,
  "priceCalendar": [
    { "type": "holiday", "priceCent": 100000, "dates": ["2026-02-15", "2026-02-16"] }
  ]
}
```

- `priceCalendar[].type`：`weekday | weekend | holiday | custom`；`rate`（相对 `basePriceCent` 的系数）与 `priceCent`（固定价）二选一；`holiday/custom` 需带 `dates`
- 未命中任何段时回退 `basePriceCent`；`longStayDiscount`（连住折扣）可选

### 6.4 自动化回归（对生产 e2e）

```
$env:SHOP_API='https://www.youshop.cn/shop-api'
$env:HOTEL_VARIANT_ID='58'
$env:CHANNEL_TOKEN='66ruvnhh34svhckaa2i'
node scripts/hotel-orderline-e2e.mjs
```

脚本 `scripts/hotel-orderline-e2e.mjs` 断言 7 条（运行输出原文）：

```
PASS  数量=2
PASS  单价=94000
PASS  行小计=188000
PASS  orderBoxes.isHotel=true
PASS  逐晚 02-14=88000/weekend
PASS  逐晚 02-15=100000/holiday
PASS  productSlug 非空（供修改日期跳回）
```

> 注意：Shop API 以 cookie 关联匿名活动订单，脚本内已用 cookieJar 维持同一会话，否则 `orderBoxes` 查不到刚加购的行。

### 6.5 普通商品回归

取 t2 渠道非酒店变体（`温泉门票` variantId=57）加购，断言：`isHotel === false`、`hotelNightly` 为空（`null` 或空数组，GraphQL 列表类型查询需带子字段）、`linePriceWithTax === unitPriceWithTax × quantity`。结果 3 条全 PASS。

### 6.6 已知边界（i18n 兜底）

- `messages.hotel.*`（`nights / dateRange / nightlyDetail / changeDates / stayTotal / selectDatesFirst / nightsOutOfRange`）目前**仅 `zh-CN` 与 `en-US` 两个语言包完整定义**，其余语言包未定义该命名空间，按回退链落到中文兜底；新增语言时需同步补词条。

### 6.7 本次线上 500 缺陷记录

- **现象**：线上 `/t2/product/国信南山温泉节假日房间` 返回 **500**（「服务暂时不可用」），SSR 抛 `Cannot read properties of undefined (reading 'product')`；而普通商品页正常 200
- **根因**：`ProductVariant.availableStock` 的 GraphQL 类型为 `Int`（32 位有符号），而未跟踪库存（`trackInventory=FALSE`）的变体其 `getSaleableStockLevel()` 返回 `Number.MAX_SAFE_INTEGER`（9007199254740991），超出范围导致**整个 product 查询序列化失败**：

  ```
  [{"message":"Int cannot represent non 32-bit signed integer value: 9007199254740991",
    "path":["product","variants",0,"availableStock"]}]
  ```

  该字段由更早的「加购上限跟随真实库存」需求新增（未考虑未跟踪库存的极大值），酒店变体恰好未跟踪库存而触发。
- **修复**：`packages/core/src/api/resolvers/entity/product-variant-entity.resolver.ts` 在 resolver 边界钳制到 32 位上限 `Math.min(stock, 2147483647)`（保持返回 number；前端 `CartAddButton.vue` 仍按 999 上限自行钳制，加购上限不受影响）
- **验证**：Shop API 返回 `availableStock: 2147483647` 且无 GraphQL 错误；页面 HTTP **200**；酒店 e2e **7/7 PASS**

### 6.8 部署与回滚

- 后端（vendure，`d:\zhao\vendure`）：本地改 `src` → `packages/core` 执行 `npm run build` 重建 `dist`（dist 受控入库）→ commit + push → 服务器 `cd /www/apps/vendure && git pull --ff-only && pm2 restart vendure vendure-worker`
- 前端（nshop，`d:\zhao\nshop`）：本地 `npm run build` → `node scripts/deploy.mjs`（scp 产物 → 服务器解压 → `pm2 restart nshop`）
- **回滚**：`git revert <commit>` 后重跑上述部署即可；重新录图用 `scripts/_shot-hotel-checkout.mjs`（环境变量 `BASE`、`HOTEL_SLUG`）

---

> **文档版本**：v1.0 ｜ **适用系统**：nshop（Nuxt 3）+ vendure + web-admin（uni-app）
> **更新日期**：2026-09-13 ｜ **截图**：手机视口 390×844 dpr=2
