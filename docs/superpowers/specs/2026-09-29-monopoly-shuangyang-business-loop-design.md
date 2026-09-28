# 大富翁 · 吉林双阳邻里商业版 — 商业闭环立项 / 设计文档

**日期**：2026-09-29
**作者**：立项（承接 `2026-09-28-monopoly-shuangyang-design.md` §9）
**状态**：立项待确认（本文即 §9 要求的「单独立项与确认」产物，不与 MVP 耦合）
**上游**：`d:\zhao\docs\superpowers\specs\2026-09-28-monopoly-shuangyang-design.md` §9 商业闭环（待确认）、§12 风险与待确认项
**现状**：MVP（M1–M7）已完成，线上 https://game.joho.cn/tour/mono.html ，334 测试绿

---

## §0 一句话

把棋盘上 32 个地块变成**真实商家的门面**，用游戏内产出的**券 / 积分**把玩家导到**线下到店消费**，再用**真实消费反哺游戏内资源**形成复购闭环。本文件只解决「接什么、怎么接、谁承担、怎么验收」，**不写生产代码**。

---

## §1 目标与判断

### 1.1 核心假设（**推测，待商家/业主确认**）

> 邻里商业（双阳街区）的痛点是「周边 3 公里内的熟人客群不知道我、来了不复购」。
> 大富翁 H5 是**低成本的注意力与情感载体**：玩家反复看到「太平温泉」「双阳火锅店」的店招、踩格立牌子、掷骰踩到就中券——**把广告位做成玩法**，比横幅广告的到达率与好感度高。

以下三条**均为推测**，须业主确认后才进入实现（对齐上游 §9「实现前需单独立项与确认」）：

1. 商家愿意**为地块付费 / 认领**（买的是「游戏内曝光 + 到店券」）。
2. 玩家愿意为「游戏内奖励」**到店核销 / 复访**。
3. 「游戏内券」= **商家让利**，而非平台补贴（关系到成本承担方，见 §8）。

### 1.2 可度量目标（每个目标都指名口径与数据源）

| 目标 | 口径（建议） | 数据源（须真实存在，见 §3） | 备注 |
|---|---|---|---|
| 到店核销率 | 核销数 ÷ 发放数 | 积分核销记录 / 券核销记录 | 券当前无独立到店核销（§3.2 结论），**待确认**落地路径 |
| 复访率 | 30 天内二次到店核销的玩家占比 | 积分用户维度统计 | 需按用户聚合 |
| 引流转化 | 领券 → 到店核销 的漏斗 | coupon / point 事件 | — |
| 游戏侧活跃 | 局数、次日留存 | 游戏前端埋点（**尚未做**，见 §7 本轮不做） | 前端埋点需单独立项 |

### 1.3 明确不做判断的事

- 不承诺 ROI 数字（缺基线数据）。
- 不把「游戏内货币（￥）」当真实资金（上游 §2.2 非目标：无真实资金结算）。
- 不在本文决定商家定价（归商业运营）。

---

## §2 三方角色与流程

### 2.1 角色

| 角色 | 是谁 | 核心诉求 |
|---|---|---|
| 商家 | 双阳街区真实门店（太平温泉、火锅店…） | 曝光 + 到店客流 + 可核销的券 |
| 玩家 | H5 玩家（潜在周边居民/游客） | 好玩、有奖励、奖励能真实用 |
| 平台运营 | 本项目运营方 | 卖地块、控券成本、看核销数据 |

### 2.2 商家认领地块的两条路（**待确认选哪条**）

| 方案 | 形态 | 成本 | 适用 |
|---|---|---|---|
| **A 运营配置**（阶段一） | 运营在**游戏侧配置文件**里填商家→地块映射与素材；无商家自助界面 | 低，运营手工 | 商家数 ≤ 32，早期验证 |
| **B 自助后台**（阶段二） | 商家在后台自助认领地块、上传店招/图片素材、设券 | 高，需新后台 | 商家规模化、可自动上架 |

> **推测**：早期走 A，验证「地块=广告位」值多少钱后再上 B。上游 §9 写的「后台配置 / 付费」与 A/B 一致。

### 2.3 认领后地块上「呈现什么」

落到游戏侧皮肤体系（详见 §6），可呈现三层信息：

1. **店名 / 短名**：复用现有 `src/data/board.ts` 的 `name` / `short` / `brand` 字段（32 格已就位）。
2. **店招 / 竖招 / 灯笼等构件**：复用现有 `building.<slot>.sign`、`prop.*` 注册表 ID。
3. **真实素材（店招图 / 门店照片）**：通过**元素级覆盖（overrides）**注入图片 provider（`kind:'image'` / `atlas`），**不改渲染代码**（上游 §3.6/§3.7 硬约束）。

### 2.4 结算（**推测，待确认**）

- 上游 §2.2 明确「无真实资金结算」——**地块费 / 券成本如何结算不在游戏内闭环**，属线下商务协议。
- 游戏内**只记账**：发出多少券、核销多少，供运营对账（见 §4 / §6）。

---

## §3 与仓库既有能力的接法（**证据为准，未证实即标待确认**）

> 本节所有「已确认」均指向本仓库真实文件；**未找到或契约不明的一律标「待确认」，不臆造端点**。

### 3.0 重要更正

- 上游 §9 写「`zhao-wealth`（积分）」。**实为误记**：`d:\zhao\strapi\plugins\zhao-wealth\package.json` 的 description 是「**理财基金管理插件**」，路由前缀 `/v1/wealth/*`（`server/src/routes/content-api.ts`）。
- **真实的积分插件是 `zhao-point`**（`description: 积分管理插件`）。本文件后续以 `zhao-point` 为准。

### 3.1 券（Coupon）— **已确认存在**

| 项 | 内容 |
|---|---|
| 插件路径 | `d:\zhao\vendure\packages\coupon-plugin\` |
| 形态 | Vendure **Shop API GraphQL**（`src/coupon-shop.resolver.ts`、`src/coupon-admin.resolver.ts`），SDL 见 `src/plugin.ts:286–300` |
| Shop 查询 | `couponCentre`、`myCoupons(status)`、`pointsMallTemplates`、`productCoupons(productId)` |
| Shop 变更 | `claimCoupon(templateId)`、`claimProductCoupon(bindingId)`、`redeemCouponByCode(claimCode)`、`applyCouponToOrder(code)`、`clearCouponFromOrder`、`exchangeCouponWithPoints(templateId)` |
| Admin 变更 | `grantCoupon(templateId, customerIds)`、`grantCouponIssue(templateId, customerIds, notify)`、`revokeCustomerCoupon(id)`；Admin 查询 `couponTemplates`、`couponChannelCustomers`；权限 `Permission.UpdateOrder` |
| 券实例字段 | `code`、`status`(UNUSED/USED/RETURNED/EXPIRED/INVALID)、`issuedBy`(CENTRE/ADMIN/EXCHANGE)、`usedOrderId`、`usedAt`、`expiredAt`（`src/customer-coupon.entity.ts`、`src/types.ts`） |
| 模板字段 | `claimCode`、`validDays`、`totalCount`、`claimedCount`、`perUserLimit`、`pointsPrice`、`memberLevel`、`newCustomerOnly`、`shopId`、`scope` |
| **核销语义** | **「核销」= 支付成功后核销（`usedOrderId` 落单，`src/coupon.service.ts:881`）**，即券只在**商城订单**上抵扣；`coupon-settlement.ts` 做结算。**没有**独立的「到店核销」动作 |
| 鉴权（C 端） | `Authorization: Bearer <vendure 会话 token>` + `vendure-token: <channelToken>` + `Accept-Language`；token 由响应头 `vendure-auth-token` 下发。证据：`d:\zhao\nshop\layers\base\app\composables\useCoupon.ts:153–180` |
| 部署路径 | Shop API 默认 `shop-api`（`vcash/server/vendure-config.ts:44`），生产反代 `https://www.youshop.cn/shop-api`（`nshop/nuxt.config.ts:31–38`、`nshop/nshop-www.conf:100`） |
| CORS | Vendure 配置 `cors: { credentials: true }`（`vcash/server/vendure-config.ts:47–49`）；**允许来源白名单未确认** |

**能否被静态游戏消费（game.joho.cn）**：技术上可行（跨域 GraphQL），但需同时满足 ① 服务端 CORS 放行 `https://game.joho.cn` 且允许 credentials；② 游戏侧先拿到 **Vendure 客户会话 token**（当前游戏无登录，见 §3.4）。**两点均待确认。**

### 3.2 到店核销 — **真实能力在积分插件，不在券插件**

- 券侧无「到店核销」（§3.1 结论）。
- **积分侧有真实核销引擎**：`d:\zhao\strapi\plugins\zhao-point\server\src\services\verification.ts`
  - `POST /v1/my/point/verify/qrcode`（生成一次性核销码，5 分钟有效，`verification.ts:16–52`）
  - `POST /v1/my/point/verify/scan`（扫码核销）
  - `POST /v1/my/point/verify/manual`（人工核销）
  - `GET /v1/my/point/verify/log`；管理员 `GET /v1/verifications`、`GET /v1/verifications/stats`、`POST /v1/point-redemptions/verify-pickup`
- **结论（推测）**：「到店核销」应挂在**积分核销**上（生成码 → 店员扫/人工确认），券则继续承担**商城下单抵扣**。两者是两条腿，不应混为一谈。**推荐做法待业主确认。**

### 3.3 积分（Points）— **已确认存在**

| 项 | 内容 |
|---|---|
| 插件路径 | `d:\zhao\strapi\plugins\zhao-point\` |
| 形态 | Strapi **REST content-api**，前缀 `/v1`（`server/src/routes/content-api.ts`） |
| C 端路由（需登录） | `GET /v1/my/point/balance`、`/records`、`/statistics`；`POST /v1/my/point/redeem`、`/sign-in`、`/earn/share`、`/earn/action`；`GET /v1/my/point/tasks`、`/eligible-actions`、`/share/status` |
| 核销路由 | 见 §3.2 |
| 管理端路由 | `POST /v1/point/earn`、`POST /v1/point/deduct`（权限 `point.grant`）；积分类型/规则/模板/记录/兑换/自提点/商品/配置/仪表盘等（同上文件） |
| 服务能力 | `point.ts`：`earnPoints`（含 `expiresAt` 过期、`one-time` 一次性、`cooldown` 冷却、日计数去重）、`deductPoints`、`refundPoints`、`getBalance`、`getRecords`；`verification.ts`：QR/人工核销；`redemption.ts`：兑换 |
| 鉴权 | 用户路由 `auth:false` + 策略 `plugin::zhao-auth.is-authenticated`（Bearer）；管理路由 `plugin::zhao-auth.has-permission` + `has-channel-scope` + `has-tenant-access` |

**能否被静态游戏消费**：需 ① 跨域放行 + ② 游戏侧持有 SSO/`zhao-auth` 的 Bearer 令牌（见 §3.4）。**具体基址与 CORS 待确认。**

### 3.4 登录 / SSO — **已确认存在**

| 项 | 内容 |
|---|---|
| 插件路径 | `d:\zhao\strapi\plugins\zhao-sso\` |
| 形态 | OAuth2 授权码模式（`server/src/routes/api.ts`、`controllers/oauth-controller.ts`、`services/sso-jwt.ts`） |
| 关键路由 | `GET /v1/auth/authorize`、`POST /v1/auth/token`、`POST /v1/auth/exchange-token`、`POST /v1/auth/login`、`POST /v1/auth/password-authorize`；微信：`GET /v1/auth/wechat` + `/wechat/callback`、`POST /v1/auth/wechat/miniprogram`、`POST /v1/auth/wechat/app`、`GET /v1/auth/jssdk-signature`；`POST /v1/auth/verify`、`/logout`、`GET /v1/user/me` |
| 会话校验策略 | `plugin::zhao-sso.sso-authenticated`（`server/src/policies/sso-authenticated.ts`） |

**关键缺口**：游戏当前是**纯前端单机、无登录**（上游 §8：服务端为联机阶段非 MVP）。任何「按人发券 / 记积分 / 到店核销」都必须先有**玩家身份**。**在游戏内引入 SSO/微信登录是本闭环的前置项，待确认以何种方式接入（跳转授权码 / 微信内 H5 / 小程序）。**

### 3.5 商城 / 订单 — **已确认存在**

| 项 | 内容 |
|---|---|
| 商城后端 | Vendure（`d:\zhao\vendure\`） |
| C 端 | `d:\zhao\nshop\`（Nuxt；`GQL_HOST` = `/shop-api`） |
| 管理端 | `d:\zhao\vshop\web-admin\`（含**定向发券**页 `src/pages/coupon/issue/index.vue`） |
| 券-订单耦合 | `applyCouponToOrder(code)` 写订单 customFields 并做价格调整（`coupon-plugin/src/order-custom-fields.ts`） |
| 订单来源 | 既有商城下单流程；反向转化（订单→游戏资源）见 §5 |

### 3.6 能力接法汇总表

| 能力 | 真实路径 | 关键端点 | 鉴权 | 静态游戏可否消费 | 结论 |
|---|---|---|---|---|---|
| 券 | `vendure/packages/coupon-plugin` | `claimCoupon` / `myCoupons` / `grantCouponIssue` | Vendure 会话 + channel | 跨域可行，需先登录 | **已确认**；券=商城抵扣，非到店核销 |
| 积分 | `strapi/plugins/zhao-point` | `/v1/my/point/*`、`/v1/point/earn|deduct` | `zhao-auth` Bearer | 跨域可行，需先登录 | **已确认** |
| 到店核销 | `strapi/plugins/zhao-point` | `/v1/my/point/verify/{qrcode,scan,manual}` | `zhao-auth` Bearer | 需店员端承载 | **已确认**（在积分侧） |
| 登录 | `strapi/plugins/zhao-sso` | `/v1/auth/authorize|token|wechat/*` | OAuth2 | 需跳转/微信环境 | **已确认** |
| 商城订单 | `vendure` + `nshop` | Shop API 订单流程 | Vendure 会话 | 后端对接，非游戏直连 | **已确认** |
| 游戏消费端 | `monopoly/` | 本地配置文件 + `overrides` | 无（静态） | — | 需新增配置加载（见 §6.4） |
| 地块-商家清单 | **未找到** | — | — | — | **待确认**（须新建数据源，§6） |
| 游戏侧埋点 | **未找到** | — | — | — | **待确认**（§7 本轮不做） |

---

## §4 券 / 积分 的产出与消耗设计

### 4.1 产出（mint）——「什么事件给什么」（**推测，待确认**）

| 游戏事件 | 产出 | 落点系统 | 备注 |
|---|---|---|---|
| 胜利（淘汰赛第一） | 大额券（如满 50 减 20） | coupon（`grantCouponIssue` / `claimCoupon`） | 需登录 + 渠道校验 |
| 踩到某商家地块 | 该商家的**小额到店券/积分** | coupon 或 point | 「踩格=广告位」的核心爽点 |
| 升级到 L3（商超楼） | 积分（可兑换） | point（`earnPoints`） | 复用积分的冷却/一次性约束 |
| 到店核销后回填 | 游戏内资源（见 §5） | — | 反向转化 |
| 日常签到（游戏内） | 少量积分 | point（`/my/point/sign-in`） | 复用现成签到 |

> **待确认**：以上「事件→产出」的**具体兑换比例**属平衡数值，不在此定。

### 4.2 消耗（burn）

- 券：在**商城下单**时抵扣（`applyCouponToOrder`）；到店场景是否可用券需业主确认（券当前无到店核销）。
- 积分：`POST /v1/my/point/redeem` 兑换积分商品（`redemption.ts`）。

### 4.3 风控 / 反作弊（**「刷券」是头号风险**）

| 风险 | 现有可复用能力 | 需补齐 |
|---|---|---|
| 同一账号反复刷券 | `perUserLimit`（模板级）、`totalCount` 限量 | 游戏侧「本局已领」本地去重 + 服务端二次校验 |
| 洗号（新号领新客券） | `newCustomerOnly`、`memberLevel` 限制 | 手机号/微信实名 |
| 高频刷取 | 积分 `cooldown` / `one-time` / 日计数去重（`point.ts`） | 游戏事件的服务端确认（**单机结果不可信**，见 §7） |
| 重复核销 | 积分核销是**一次性 token（5 分钟）**（`verification.ts:24–25`） | 核销幂等（同一 token 只成功一次） |
| 结算回调重复 | — | 参考微信支付：**幂等 + 数据锁**（见文末参考） |

> **硬结论**：单机游戏客户端**不能作为可信发奖源**。阶段一可用「运营手工/后台发券」规避；一旦要自动化发奖，**必须**服务端校验事件（对齐上游 §8 `monopoly-economy` 模块）。

### 4.4 有效期与核销方式

- 有效期：券用模板 `validDays`（领取后 N 天）；积分用 `expiresAt`（`point.ts`）。**具体天数待运营确认。**
- 核销方式：
  - 券（商城）→ 支付成功自动核销（现有）。
  - 到店 → **积分核销**：玩家出码 `POST /v1/my/point/verify/qrcode`，店员扫 `/verify/scan` 或 `/verify/manual` 确认。
- **参考（外部，非仓库能力）**：微信支付代金券(全场券)为「伴随交易自动核销/抵扣」，分预充值/免充值两种成本模式，核销回调强调**验签 + 幂等**。来源：微信支付官方文档（见文末「参考」）。是否需要直接对接微信支付代金券，**待确认**（若对接，成本模式决定「谁出资」）。

---

## §5 反向转化（真实消费 → 游戏内资源）

### 5.1 触发与映射（**推测，待确认**）

| 真实行为 | 游戏内资源 | 依托 |
|---|---|---|
| 商城下单成功 | 游戏内货币 / 道具卡 / 地块升级券 | 订单事件 → `monopoly-economy` 记账 |
| 到店核销完成 | 积分 →（可再换）游戏内资源 | `point` 核销事件 |
| 复访（二次到店） | 增量奖励 | 需按用户聚合到店记录 |

### 5.2 幂等与对账（**硬性，不可省**）

- **幂等键**：以「订单号 / 核销记录 ID」为幂等键，**同一笔真实事件只发一次游戏资源**。
- **对账**：游戏侧资源发放流水 ↔ 商城订单 / 积分核销记录，按日对账，差异挂「人工复核」。
- **补偿**：发放失败进重试队列；成功不重复发放。
- **参考（外部）**：微信支付文档明确「**同样的通知可能多次发送，必须幂等处理**」并要求并发锁——反向转化回调按同标准设计。

---

## §6 数据与后台

### 6.1 数据模型（哪些进 Vendure / 哪些进游戏侧配置）

| 数据 | 建议落点 | 理由 |
|---|---|---|
| 券模板（含商家券） | **Vendure `CouponTemplate`**（customFields 扩展 `shopId`/`claimCode` 已具备） | 券的生老病死全在 Vendure |
| 券发放记录 | Vendure `CustomerCoupon` | 现有实体 |
| 积分账户 / 记录 | **Strapi `zhao-point`**（point-record） | 现有 |
| 到店核销记录 | Strapi `zhao-point.channel-verification`（`verification.ts`） | 现有 |
| **商家清单 / 地块认领** | **待确认**（候选：Strapi 新建 content-type，或游戏侧配置文件） | 目前仓库**未找到**现成模型 |

> **推测**：阶段一（手工认领）用**游戏侧配置文件**最省；阶段二（自助）再落 Strapi content-type，供后台与游戏共同读取。**两方案取舍待确认。**

### 6.2 运营后台最小界面需求

- 复用 `vshop/web-admin`：**定向发券页已存在**（`src/pages/coupon/issue/index.vue`），可直接用于「给某批玩家发某商家券」。
- 需新增（最小）：**商家清单 / 地块认领**列表（商家名 · 地块 slot · 素材 · 有效期 · 状态）。
- 需新增（最小）：**核销看板**（发放 / 核销 / 到店数）——积分侧已有 `GET /v1/dashboard`、`/v1/verifications/stats` 可复用。

### 6.3 游戏侧如何消费（结合既有皮肤分层）

游戏现有皮肤解析为**四级回退**（`src/skin/resolve.ts:73–93`，返回 `level: 1|2|3|4`），加上其上的**注册表声明层**（`src/skin/registry.ts`），构成「声明 + 四级回退」的五层结构：

| 层 | 名称 | 代码位置 | 商家素材应落此层？ |
|---|---|---|---|
| ① | **注册表声明**（元素 ID 契约） | `src/skin/registry.ts` | 否（只声明 ID 与包围盒） |
| ② | **元素级覆盖 overrides**（= 「店铺 / 地块覆盖」） | `resolve()` 的 `overrides`（level 1） | **✅ 商家素材落此层** |
| ③ | 皮肤包 `skin.json` | level 2 | 否（放通用风格） |
| ④ | 全局默认皮肤 | level 3 | 否 |
| ⑤ | 内建兜底（纯色块+文字） | level 4 | 否（缺素材时兜底） |

> **证据**：`resolve()` 的回退链是 ①`overrides` → ②`skin` → ③`defaultSkin` → ④`builtin`，其中 `overrides` 以 `elementId` 为键（`src/skin/resolve.ts:83–92`）；`src/render/BuildingView.ts` 已在用「按 slot 的 override」（第 64 行 `override?: ProviderSpec`）。
> **已补齐（2026-09-29 阶段一·游戏侧配置加载）**：原 `src/main.ts` 传 `overrides: null` 的缺口已消除 —— 新增纯模块 `src/skin/shop-config.ts`（宽松解析 `public/config/shops.json` → `overrides` + `shortAt/brandAt`），`main.ts` 于 boot 读取并注入 `instantiateDeps.overrides`（`instantiate()` 中商家覆盖优先于渲染层自带 proc）与 `LabelView/BuildingView/ShowcaseView` 文案；图片素材经 `assets.ts:preloadRelative` 多包预装，缺失只记 `missingAssets` 不报错。验收：`node local/mono-shots-shops.mjs` 8 项 gate 全 true + 4 张 390×844@dpr2 截图，见 `docs/manual-mono.md` §5。

### 6.4 商家素材清单（阶段一最小）

对每个已认领地块，配置文件至少给出：

```
{ slot, merchantName, short, brand, sign:{src}, building:{src|null}, couponTemplateId?, validDays? }
```

→ 游戏启动时读入并合成为 `overrides`（映射到 `building.<slot>.sign` 等元素 ID），**不改渲染代码**（符合上游 §3.6/§3.7 硬约束）。

---

## §7 分期与不做的部分

### 7.1 建议分期

| 阶段 | 内容 | 验收标准（硬性） |
|---|---|---|
| **阶段一：静态认领 + 到店核销** | 运营配置商家清单；游戏读配置出商家店招/店名；到店核销走积分 `verify/{qrcode,scan,manual}` | ① 改配置文件后游戏内店招变化（截图）；② 一次「出码→店员核销」真实跑通并留记录；③ 单测：配置→overrides 映射正确、缺素材回退不报错 |
| **阶段二：自助后台 + 券系统联动** | 商家自助认领/上传素材；游戏内领券走 coupon Shop API；游戏内登录（SSO） | ① 商家后台可认领并生效；② 游戏内领券 → 券包可见（端到端）；③ 反作弊：每人限领生效 |
| **阶段三：订单反向转化** | 商城订单 → 游戏资源；幂等 + 对账 | ① 一笔订单只发一次；② 对账报表无误；③ 重放回调不重复发奖 |

> 每阶段均应遵守上游 §11 硬性流程：**390×844/dpr2 移动视口截图 + 单测 + 线上回归**。

### 7.2 本轮（阶段一）**不做**

- ❌ 商家自助后台（B 方案）。
- ❌ 游戏内登录 / SSO 接入。
- ❌ 游戏内自动发券（单机结果不可信，见 §4.3）。
- ❌ 订单反向转化。
- ❌ 游戏侧数据埋点 / 留存看板。
- ❌ 直接对接微信支付代金券。
- ❌ 真实资金结算。

---

## §8 风险与待确认项

| # | 项 | 类型 | 影响 | 处置 |
|---|---|---|---|---|
| 1 | 使用真实商家名称/logo/照片需**授权** | 合规/授权 | 侵权风险 | 上线前逐户签授权；未见授权不得上线商家素材 |
| 2 | 券成本承担方（平台补贴 vs 商家让利） | 成本 | 亏损/预算失控 | 业主拍板；券模板成本模式据此定 |
| 3 | 到店核销作弊（店员合谋、伪造核销） | 风控 | 券被薅 | 一次性码 + 人工确认 + 核销看板异常告警 |
| 4 | 单机游戏发奖不可信（刷券） | 风控 | 券流失 | 阶段一改为运营后台发；自动化前必须服务端校验 |
| 5 | 「到店核销」该挂券还是积分（券无到店核销） | 设计 | 架构走向 | **待确认**（§3.2 推荐挂积分） |
| 6 | 商家清单/地块认领数据落点未定 | 数据 | 后台与游戏耦合方式 | **待确认**（§6.1，A/B 方案） |
| 7 | Vendure / Strapi 跨域白名单未确认 | 技术 | 游戏能否直连 | 需放行 `game.joho.cn` 且允许 credentials，**待确认** |
| 8 | 玩家身份（登录）如何接入 | 技术 | 一切按人能力的前置 | **待确认**（授权码跳转 / 微信 H5 / 小程序） |
| 9 | 数据口径（核销率分母、复访窗口）未统一 | 度量 | 报表不可比 | 立项后先定口径表 |
| 10 | 游戏内货币 ≠ 真实资金 | 合规 | 误解为资金 | 全局文案声明「虚拟、不可提现」 |

---

## §9 验收标准（硬性）

沿用上游 §11 风格：**可执行、可验证**。

1. **配置驱动（阶段一）**：仅修改商家配置文件（含：新增一家商家 / 改店招图片 / 临时下线一家）→ 游戏内正确呈现对应变化，**零渲染代码改动**；附 390×844/dpr2 前后截图。
2. **回退不崩（硬性）**：配置文件缺失 / 素材 404 / 坏 JSON 时，游戏仍正常渲染（走皮肤回退链），不抛错。单测覆盖。
3. **映射单测**：`配置 → overrides`（`building.<slot>.*`）映射的纯函数单测；slot 越界 / 字段缺失用例。
4. **到店核销端到端**：一次真实「玩家出码 → 店员扫码核销」跑通，核销记录可在后台查询；重复核销被拒（一次性码）。
5. **反作弊**：同一账号超出 `perUserLimit` 领券被拒；错误文案可读。
6. **可换素材（硬性）**：换 `?skin=<皮肤包>` 或换商家 overrides 后，画面整包变化、布局不变、零代码改动。
7. **线上回归**：`game.joho.cn/tour/mono.html` 线上 200 + 移动端截图回归；本地构建 → 上传 → 服务器仅解压/重启（**禁止服务器构建**，上游 §11.7）。
8. **对账（阶段三）**：重放同一订单/核销回调不产生二次发奖；日对账报表无未解释差异。

---

## 参考（外部，非仓库能力，仅作设计参考）

- 微信支付「代金券(全场券)使用手册」——代金券随交易自动核销/抵扣，分预充值/免充值成本模式：https://pay.wechatpay.cn/doc/v3/institution/4019866038
- 微信支付「核销事件回调通知」——通知可能重复，**商户须幂等处理并加并发锁、验签**：https://pay.weixin.qq.com/doc/v3/partner/4012285807

> 以上为**外部参考**，非本仓库已验证能力；是否对接微信支付代金券**待确认**。

---

## 附：本文与上游的关系

- 本文**只做立项与设计**，不产出代码；实现前需业主对 §1.1、§2.2、§3.2、§6.1、§8 的**待确认项**给出结论。
- 结论确定后 → 调用 `writing-plans` 按 §7.1 阶段拆分任务 → 逐任务实现。
