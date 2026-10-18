# 租户券店模式（t1 只卖买单券）设计文档

- 日期：2026-10-18
- 状态：设计已确认（方案 A + 双版式 mockup 均经用户拍板）
- 涉及仓库：vendure（cjk-plugin + coupon-plugin）、vshop/web-admin（平台侧设置）、nshop（券店首页 + 拦截 + 导航）
- 关联：券商城（2026-10-17）、到店买单券（2026-10-01）、优惠券多渠道分发（2026-10-02）

## 1. 背景与目标

t1 租户（新生）定位调整为**买单券专营店**：C 端店面（nshop `/t1/`）只卖自己发行的各类买单券（`usageScene` 含 `IN_STORE` 的券模板），不再展示与售卖普通商品。

目标：

- 租户级可配置的「券店模式」，开启后整店切换为券店形态；其他租户零影响，可随时切回普通商城
- 券店首页 = 店招 + 买单券楼层（双版式可切换：楼层导购 / 券卡宫格）
- 普通商品链路彻底隐藏 + 直连 URL 拦截
- 券目录匿名可浏览（购买仍需登录），降低新客转化门槛

## 2. 决策记录（已与用户确认）

| 编号 | 决策点 | 结论 |
| --- | --- | --- |
| D1 | 券来源 | t1 只卖**自己发行**的买单券（券模板渠道归属 t1，不走跨租户代卖） |
| D2 | 店面形态 | **整店券店模式**：租户级配置开关，首页分支渲染 + 导航券店化，可配置可回退 |
| D3 | 商品链路 | **彻底隐藏 + 拦截**：入口全隐藏，直连商品/分类/搜索/结算 URL 显示「本店仅售买单券」提示页；t1 存量商品由运营下架（前端拦截双保险） |
| D4 | 匿名浏览 | **目录匿名可看**：`couponSaleCatalogue` 放开匿名（后端改动），购买/支付仍需登录 |
| D5 | 首页版式 | **双版式都做**：A 楼层导购（吸顶锚点+三楼层）+ B 券卡宫格（2列面额卡），作为券店风格可选项，配置切换 |
| D6 | 实现方案 | 方案 A：`Channel.customFields.storefrontMode` 配置驱动 + 首页分支渲染 + 拦截中间件（否决 rewrite 与纯运营配置方案） |

## 3. 数据模型与后端改动（vendure）

### 3.1 Channel customFields（cjk-plugin）

`packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts` 新增两个字段（同 `industryType`/`merchantStatus` 代码预制模式）：

| 字段 | 类型 | 默认 | options | 说明 |
| --- | --- | --- | --- | --- |
| `storefrontMode` | string | `'normal'` | `normal`（普通商城）/ `coupon`（券店） | public: true，shop-api 可读 |
| `storefrontHomeLayout` | string | `'floors'` | `floors`（楼层导购）/ `grid`（券卡宫格） | public: true；仅 `storefrontMode=coupon` 时生效 |

- 存量渠道不设置即为 `normal`，行为与现状完全一致，**零迁移**。
- 权限：仅平台管理员可改（web-admin 平台侧租户管理入口）；租户侧 `myUpdateChannelCustomFields` 白名单不含这两个字段。

### 3.2 券目录放开匿名（coupon-plugin）

`packages/coupon-plugin/src/coupon-sale-shop.resolver.ts` 的 `couponSaleCatalogue` 查询移除 `@Allow(Permission.Authenticated)`（Vendure 无装饰器即公开），其余 mutation（`createCouponSaleOrder` / `payCouponSaleWithBalance` / `createWechatCouponPayment` / `exchangeCouponWithPoints` 等）保持登录。

已核实安全边界：`CouponSaleService.saleCatalogue()` 仅依赖 `ctx.channelId` 做渠道过滤（`templateBelongsToChannel` + `filterTemplatesByChannelAndScene`），无 `activeUserId` 耦合；渠道隔离语义不变（他渠道券不可见，无渠道归属的平台券仍全店可见）。

### 3.3 不改的东西

- 购券/支付/退款/积分兑换链路（`createCouponSaleOrder` → PaySheet）原样复用
- 到店买单核销闭环（券码、`in_store_bill` 流水）原样复用
- `/coupon-mall` 独立券商城页对所有租户照常（券店模式下它成为首页的「同源姊妹页」，不冲突）

## 4. web-admin（商户端）

- 平台侧租户管理表单新增「店面模式」区块：`storefrontMode` 下拉（普通商城/券店）+ `storefrontHomeLayout` 下拉（楼层导购/券卡宫格，仅券店模式时显示），带「新增」标记的表单块样式对齐 `industryType` 先例
- t1 运营侧照常在优惠券模块创建各类买单券模板（`usageScene=IN_STORE` 或 `ALL`、`salePrice` 定价、分发渠道含 `SALE`）与券包——**运营无需新能力**

## 5. nshop（C 端）

### 5.1 模式读取

- `layers/base/gql/queries/context.gql` 的 `GetChannelTheme` 补拉 `storefrontMode`、`storefrontHomeLayout`
- 新增 `composables/useStorefrontMode.ts`：从渠道 theme 共享 state 取值，导出 `{ isCouponStore, storefrontHomeLayout }`（SSR 友好，未配置回退 normal/floors）

### 5.2 券店首页 `CouponStoreHome`

新组件 `layers/base/app/components/home/CouponStoreHome.vue`（+ 双版式子组件），`app/pages/index.vue` 按模式分支：`isCouponStore` 为 true 时渲染券店首页，否则现有京东布局不动。

结构（自上而下，对应已确认 mockup）：

1. **店招 hero**：`shopName` + slogan（新增可选字段见 §7，未配置回退 i18n 通用文案「到店出示券码 · 按折结算」）+ 积分余额胶囊（已登录时）
2. **版式 A（floors，默认）**：吸顶锚点（热销买单券 / 超值券包 / 积分兑换）+ 三楼层平铺
3. **版式 B（grid）**：2 列面额大字券卡宫格 + 券包横幅卡 + 积分兑换行
4. **底部说明条**：平台统一规则摘要（复用券商城文案）

取数与复用：

- 数据源 `getCouponSaleCatalogue('IN_STORE')` + `getPointsMallTemplates()`（只出买单券，场景过滤在查询参数层完成）
- 楼层卡片复用已上线券商城组件：`MallCouponCard / MallBundleCard / MallPointsCard`；版式 B 宫格卡为新增展示组件（`components/home/coupon-store/` 内，纯展示）
- 进度/售罄/空楼层/匿名登录引导逻辑全部复用券商城现有实现（售罄置灰「已抢罄」、空楼层整层隐藏、未登录可浏览点购买引导登录）

### 5.3 商品链路拦截

- 新增全局 route middleware：`isCouponStore` 且目标路径命中 `product/**`、`category/**`、`search`、`checkout/**` 时渲染「本店仅售买单券」提示页（含返回券店首页按钮），不发商品查询
- 首页京东布局（分类导航/商品楼层/搜索）在券店模式下天然不渲染（首页整体分支），功能宫格券店模式只保留券相关入口（券商城、我的券、签到等既有非商品项——实施时按现有宫格配置裁剪）

### 5.4 导航券店化

- `JdTabBar.vue` 券店模式四 tab：首页 / 券包（`/coupon`）/ 券单 / 我的（`/account`）；分类抽屉与购物车弹层入口移除
- **券单页（新增轻量页 `pages/coupon/orders.vue`）**：目前 nshop 无券单列表页（`getMyCouponSaleOrders` 仅用于支付轮询），券店模式 TabBar 需要落点——列表展示 `CouponSaleOrder`（单券/券包、金额、状态 未支付/已支付/已取消），未支付订单支持「继续支付」（复用 PaySheet 链路）；普通商城模式下该页也存在但无入口（券商城后续可挂），不额外做入口改造
- `AppHeader` 券店模式隐藏搜索框与购物车图标（保留城市/多语言/Logo）
- PC 端（≥1024px）：券店首页沿用移动版式居中容器 + 精简头部；无分类侧栏、无商品楼层、无快讯栏

### 5.5 i18n 与多语言

- zh-CN / en-US 同步补全部新词条（券店 tab 名、拦截提示、店招回退 slogan、宫格卡按钮等），禁止单语言硬编码
- 店招文案本身走渠道配置（多语言后续如需再接 `LocalizedText`，首期单值即可——YAGNI）

## 6. 边界与错误处理

| 场景 | 处理 |
| --- | --- |
| 未登录 | 券店首页可浏览全部楼层；点抢购/兑换引导登录（复用券商城处理） |
| 券售罄 | 按钮置灰「已抢罄」、进度条满格（复用券商城逻辑） |
| 全部楼层为空 | 显示券店空态（「买单券即将上架」） |
| 接口失败 | 楼层级错误态 + 重试（复用券商城） |
| `storefrontMode` 异常值 | 按 `normal` 处理（纯函数解析，坏值回退默认） |
| 切回 normal | 配置即生效，无迁移；商品若未重新上架则按普通商城空楼层呈现 |
| t1 存量商品 | 运营下架处理；拦截中间件兜底 |
| 大字版显示模式 | 券店楼层标题与卡片文案适配大字模式（对齐券商城已有适配） |

## 7. 可选项与预留

- 店招 slogan：首期用 i18n 固定回退文案；如需租户自定义，后续在 Channel customFields 追加 `storefrontSlogan`（本次不做，mockup 中示意位即该预留位）
- 楼层运营配置（楼层显隐/排序自助化）：预留配置位常量，不接五级配置体系（对齐券商城 YAGNI 决策）

## 8. 测试与交付

### 8.1 后端

- `couponSaleCatalogue` 匿名请求返回 200 且仅含本渠道（t1 token）可售券；换他渠道 token 目录隔离回归
- 购券/支付 mutation 匿名仍 401/未授权
- cjk-plugin：`storefrontMode`/`storefrontHomeLayout` 读写与默认值回归

### 8.2 前端（nshop）

- e2e/API：`/t1/` 券店首页渲染（floors 与 grid 两版式）、`/t1/product/xxx` 拦截页、TabBar 券店语义、券单页列表与继续支付、匿名浏览→登录→购券全链路
- 对照回归：默认渠道（normal）首页京东布局零变化
- 交付硬规范：手机视口 390×844（dpr=2）截图（券店首页双版式 + 拦截页 + 购券链路）补充操作手册
- 操作手册：`nshop/docs/superpowers/manual/coupon-storefront/README.md`（含平台侧配置路径、t1 券模板运营路径）

### 8.3 部署（铁律：一律本地构建）

- vendure：本地构建 → push → 服务器 `git pull` + `pm2 restart`（及 vendure-worker）
- nshop：本地 `pnpm build` → `node scripts/deploy.mjs`
- web-admin：本地构建 → `node scripts/deploy.mjs`

## 9. 非目标（YAGNI）

- 跨租户代卖（其他租户券分发到 t1 展示）——本期 t1 只卖自己的券
- 券店首页楼层自助装修配置
- 券店独立的微信分享卡片配置（复用现有渠道级 WechatShare 配置）
- 店招 slogan 后台自定义字段
- 券店模式下的商品搜索/分类残缺态优化（直接拦截，不做降级浏览）
