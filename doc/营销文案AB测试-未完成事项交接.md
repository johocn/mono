# 营销文案 A/B 测试 — 未完成事项交接文档

> 交接日期：2026-10-07
> 模块：消消乐（xiaoxiaole）分享裂变接入 Strapi zhao-studio / zhao-track 的 A/B 效果统计
> 状态：**✅ P0/P1/P2 已于 2026-10-07 全部完成并通过端到端验证（见文末「完成情况与执行差异」）；仅剩 P3 观察期由运营执行。**

---

## 一、已澄清的关键事实（务必先读）

1. **Strapi 后端 API 域名 = `https://h.joho.cn`**，不是 `api.yourbao.cn`。
   - 证据：`strapi-backend/nginx/h.joho.cn.conf` 与 `strapi/docs/deployment/nginx-h-joho-cn.conf` 均把 `/api/`、`/admin/`、`/uploads/` 反代到本机 Strapi（1337）。
   - `strapi/` 仓库 = `h.joho.cn` 实例（zhao-sso / zhao-studio / zhao-track 都在此仓库）；多处脚本 `API_BASE=https://h.joho.cn/api`。
   - `api.yourbao.cn` 是**另一台服务器**（Vendure shop-api / wechat-auth），与本次无关；消消乐微信签名 `api.yourbao.cn/wechat-auth/jssdk-signature` 是独立服务。
2. **域名拓扑**（存于记忆"域名与部署拓扑"）：
   - `game.yourbao.cn`（含 `game.joho.cn`）= 所有游戏 H5 入口，单台服务器（反代本机 node 3000）。
   - `h.joho.cn` = Strapi 后端 + 运营后台(uniapp 前端，目录名 `strapi-backend` 实为前端) + SSO 中转。
   - `v.joho.cn` = 同一 strapi 仓库的"课程内容"部署变体。
   - `e.joho.cn` = Vendure 商城(vshop)。`www.yourbao.cn`/`api.yourbao.cn` 在另一台服务器。
3. **`strapi-backend/` 目录是 h.joho.cn 的 uniapp 运营后台前端，不是后端代码**，不要在此目录找接口实现。

---

## 二、已完成（代码侧，可移交）

### Strapi（`strapi/`，部署目标 h.joho.cn）
- `plugins/zhao-studio/.../ab-variant/schema.json`：新增 `shareTitle` / `shareDesc` / `shareImage` / `shareLink`。
- `plugins/zhao-studio/.../browser-log/schema.json`：新增 `abVariant` 关联（→ ab-variant）。
- `plugins/zhao-studio/.../ab-test.ts`：`pickVariant` 支持按 `promo-campaign.code` 解析（原只认 documentId）；变体文档天然带出分享文案字段。
- `plugins/zhao-studio/.../analytics.ts`：`trackPageView` / `trackAdClick` 透传 `abVariant` 写入 browser-log。
- `plugins/zhao-studio/.../channel-report.ts`：实现 `groupBy:'variant'`（按变体聚合 曝光 / 点击 / CTR / 转化）。
- `plugins/zhao-track/.../click-orchestrator.ts`：放开 `couponId` 必填（可选），新增 `abVariantId`（传入则直接归因），无 coupon 时跳过链接置换。
- `plugins/zhao-track/.../controllers/click.ts`：透传 `abVariantId`，缺失 couponId 传 `undefined`。

### 游戏端（`xiaoxiaole/`）
- `src/core/Env.ts`：新增 `marketingApiBase` / `marketingCampaignCode`（运行时 `window.__APP_ENV__` 注入，缺省为空=自动跳过）。
- `src/core/MarketingShare.ts`（新增）：拉取 A/B 文案 → 注入微信卡片 → 链接打标 `?camp=&v=&st=` → 上报"曝光"(page-view) 与"打开"(click)。
- `src/Main.ts`：`bootstrap()` 早期 `void initMarketingShare()`。
- `src/scenes/ResultScene.ts`：分享链接改用 `getMarketingShareLink()`。
- 校验：`npm run typecheck` 通过（0 错误）。

---

## 三、未完成事项（接手人逐条处理）

### P0 — 上线前置
- [x] **重启 Strapi 让 schema 字段生效**（✅ 2026-10-07）：本地构建 dist bundle → scp → pm2 restart（服务器不构建），schema 自动迁移生效；已确认 `zhao_ab_variants` 4 个 share_* 列、`zhao_browser_logs_ab_variant_lnk`、`zhao_track_click_events_ab_variant_lnk` 等表/列存在。
- [x] **部署注入环境变量**（✅ 2026-10-07）：`bin/index.html` 的 `window.__APP_ENV__` 注入 `MARKETING_API_BASE=https://h.joho.cn`、`MARKETING_CAMPAIGN_CODE=xxl-share-2026`；bundle 已部署 game.yourbao.cn（odoo 服务器 `/opt/1panel/.../game.joho.cn/tour/xxl/`）并公网验证。

### P1 — 数据录入（TAdmin，h.joho.cn 后台）

> 入口：h.joho.cn → 内容管理 → 推广渠道 / 营销活动 / AB实验 / AB变体（均 `visible:true`）。
> 关键约束（来自 `ab-test.pickVariant`）：游戏按 `campaign.code` 拉取，实验**必须 `status=running`** 且**至少 1 个变体**才会返回文案；变体按 `weight` 加权随机。下面带 ✅=必填、🔲=可选、🎯=本场景需重点填。

#### 1) 推广渠道 promo-channel（建 1 条）
| 字段 | 类型 | 录入要求 | 示例值 |
| --- | --- | --- | --- |
| `name` ✅ | string(≤100) | 必填 | `消消乐微信裂变` |
| `code` ✅ | string(唯一) | 必填，建议见名知意 | `xxl-wechat` |
| `scene` 🔲 | enum | 选 `wechat_group`（默认 `other`） | `wechat_group` |
| `status` 🔲 | boolean | 保持 `true`（启用） | `true` |
| `description` 🔲 | text | 备注 | `脑力花园分享裂变渠道` |
| `budget`/`actualCost` 🔲 | decimal | 不填 | — |
| `sortOrder` 🔲 | int | 默认 0 | `0` |
| `platformConfigs`/`campaigns`/`experiments`/`coupons` 🔲 | 关联 | 系统自动挂，无需手填 | — |

#### 2) 营销活动 promo-campaign（建 1 条，code 须与游戏端 `MARKETING_CAMPAIGN_CODE` 完全一致）
| 字段 | 类型 | 录入要求 | 示例值 |
| --- | --- | --- | --- |
| `name` ✅ | string(≤100) | 必填 | `消消乐分享裂变 2026` |
| `code` ✅ | string(唯一) | 必填，**游戏端配置即此值** | `xxl-share-2026` |
| `channel` ✅ | m2o→promo-channel | 选第 1 步建的渠道 | `xxl-wechat` |
| `startAt` ✅ | datetime | 必填（建议设为活动开始日 00:00） | `2026-10-08 00:00` |
| `endAt` ✅ | datetime | 必填（建议覆盖观察期，如 +14 天） | `2026-10-22 00:00` |
| `status` 🔲 | boolean | `true`（启用） | `true` |
| `description` 🔲 | text | 备注 | — |
| `budget`/`actualCost` 🔲 | decimal | 不填 | — |

> 注：`pickVariant` 只按 `campaign` + `status=running` 过滤，**不校验活动起止时间**；起止时间用于报表与运营口径，请如实填写。

#### 3) AB实验 ab-experiment（建 1 条，绑定上述 campaign）
| 字段 | 类型 | 录入要求 | 示例值 |
| --- | --- | --- | --- |
| `name` ✅ | string(≤200) | 必填 | `分享文案 A/B - 10月` |
| `campaign` ✅ | m2o→promo-campaign | 选第 2 步建的活动（`xxl-share-2026`）；`createExperiment` 要求 channel 或 campaign 至少其一 | `xxl-share-2026` |
| `channel` 🔲 | m2o→promo-channel | 建议同填第 1 步渠道（便于筛选） | `xxl-wechat` |
| `status` ✅ | enum | **必须设 `running`**（draft/paused/completed 都不会被拉到） | `running` |
| `startAt` 🔲 | datetime | 实验实际开始；`startExperiment` 会自动补，直接手填也可 | `2026-10-08 00:00` |
| `endAt` 🔲 | datetime | 实验结束 | `2026-10-22 00:00` |
| `description` 🔲 | text | 备注 | — |
| `variants` | 关联 | 下一步建变体后自动挂；**至少 1 个** | — |

> 若后台有"启动/停止"操作按钮（对应 `startExperiment`/`stopExperiment`），也可先存为 `draft` 再点启动，效果同直接设 `running`。

#### 4) AB变体 ab-variant（建 N 条，N≥2 才有 A/B 意义；本场景 N=2~3）
| 字段 | 类型 | 录入要求 | 示例值（文案 A） | 示例值（文案 B） |
| --- | --- | --- | --- | --- |
| `experiment` ✅ | m2o→ab-experiment | 选第 3 步实验 | 同上 | 同上 |
| `name` ✅ | string(≤100) | 必填，便于识别 | `温情版` | `挑战版` |
| `weight` ✅ | int(默认1) | 必填，**按权重分配流量**；多变体权重和=100 最直观 | `50` | `50` |
| `shareTitle` 🎯 | string(新增) | **本场景核心**：微信卡片标题；空则游戏端用默认"脑力花园" | `脑力花园｜每天 5 分钟，给大脑做个操` | `通关脑力花园第8关，你敢来挑战吗？` |
| `shareDesc` 🎯 | text(新增) | **核心**：卡片描述；空则游戏端用默认文案 | `和爸妈一起练脑，预防认知衰退~` | `我已通关，看你能否破我的记录！` |
| `shareImage` 🎯 | string(新增) | **核心**：卡片缩略图 URL（建议 300×300 以上、https）；空则游戏端用默认图 | `https://h.joho.cn/uploads/xxl-a.png` | `https://h.joho.cn/uploads/xxl-b.png` |
| `shareLink` 🔲 | string(新增) | 可选落地页；**不填则游戏端回退到当前页 `siteUrl`**（即消消乐结算页） | 不填 | 不填 |
| `description` 🔲 | text | 备注 | — | — |
| `article` 🔲 | m2o→article-draft | 本场景不填（分享文案走 `share*` 字段） | — | — |
| `coupon` 🔲 | m2o→coupon | 本场景不填（分享裂变不发券，点击归因走 `abVariantId`，非 coupon） | — | — |

> 说明：`shareTitle/shareDesc/shareImage/shareLink` 为本次新增字段，已在 `ab-variant/schema.json` 声明。游戏端 `pickVariant` 返回的变体文档天然带出这 4 个字段；三者任一为空时游戏端按兜底文案/默认图渲染，但**为得到有效的 A/B 对比，请每个变体都填齐 `shareTitle/shareDesc/shareImage`**。`weight` 决定随机概率（如 A:B=50:50 或 70:30）。

#### 5) 确认可见性（无需新建，检查即可）
- [x] `zhao-track` 的 `source-tag`、`click-event` 内容类型在后台内容管理中可见（✅ 表已随 schema 同步生成并可查询）。
- [x] 若不可见，确认 Strapi 已重启并完成**字段迁移**（见 P0），迁移后这些类型会自动出现。（✅ 已确认）

#### 6) 录入后自检（对照 P2 冒烟）
- [x] 访问 `GET /api/zhao-studio/v1/variants/pick?campaignId=xxl-share-2026` 应返回 `status=running` 实验下、按 weight 命中的某变体，且带 `shareTitle/shareDesc/shareImage`。（✅ 公网验证通过，4:2 随机分布正常）
- [x] 返回的 `experiment`/`variant` 的 `documentId` 即上报时用的 `camp`/`v` 参数值。（✅ 实际录入：渠道 `tbox3x8ms9edt7f58y5mc0m1` / 活动 `6e9c1af36bf5335241f1bbb1` / 实验 `87269abd787e0d80292c4528` / 温情版 `10473a584fe79f3262dd09c6` / 挑战版 `2d981bf30d828312072d5f0d`）

### P2 — 联调验证
- [x] 冒烟：`GET https://h.joho.cn/api/zhao-studio/v1/variants/pick?campaignId=xxl-share-2026` 返回带 `shareTitle/shareDesc/shareImage` 的变体（按 weight 随机）。（✅）
- [x] 冒烟：`POST https://h.joho.cn/api/zhao-studio/v1/analytics/page-view`，body `{data:{sessionId, abVariant, userAgent, language, screen}}` → browser-log 新增一条且 `abVariant` 有值。（✅ DB 确认 lnk 表关联到变体）
- [x] 冒烟：`POST https://h.joho.cn/api/zhao-track/v1/zhao-track/click`，body `{sourceTagId, deviceFingerprint, abVariantId}`（无 couponId）→ click-event 新增一条 `abVariant` 有值、`coupon` 为空。（✅）
- [x] 端到端：在 `game.yourbao.cn` 生成分享链接（带 `?camp=xxl-share-2026&v=<variantId>&st=<tag>`），用另一浏览器/隐身打开 → 确认 click-event 写入且 `abVariant` = 分享者展示的变体。（✅ Playwright 390×844 手机视口验证，pick/identify/page-view/click 全 200，DB 归因闭环；截图见 `docs/manual/shots/2026-10-07-xxl-ab-e2e/` 与方案文档第五节）
- [x] 报表：`GET https://h.joho.cn/api/zhao-studio/v1/admin/channel-report?channelCode=xxl-wechat&groupBy=variant` 返回各变体的 `impressions/clicks/ctr/orders`。（✅ 2026-10-07 已验证，见下方「报表鉴权验证」）

### P3 — 观察与回滚
- [ ] 观察 3~7 天各文案变体 CTR，挑优。
- [ ] 回滚：游戏端把 `MARKETING_CAMPAIGN_CODE` 置空即恢复旧分享逻辑（默认文案 + 原分享码）；Strapi 改动为纯增量字段，不影响现有 coupon/订单链路（couponId 仍可选填）。

---

## 四、接口契约速查（游戏端 → h.joho.cn）

| 用途 | 方法 / 路径 | 关键字段 |
| --- | --- | --- |
| 拉取文案变体 | `GET /api/zhao-studio/v1/variants/pick?campaignId=<code>` | 返回 `shareTitle/shareDesc/shareImage` |
| 来源标签 | `POST /api/zhao-track/v1/zhao-track/source/identify` | `{deviceFingerprint, utm:{utmSource:code, utmContent:variantId}}` |
| 曝光 | `POST /api/zhao-studio/v1/analytics/page-view` | `{data:{sessionId, abVariant, userAgent, language, screen}}` |
| 打开/点击 | `POST /api/zhao-track/v1/zhao-track/click` | `{sourceTagId, deviceFingerprint, abVariantId}`（无 couponId） |

> 全部为 `auth:false` 公开路由，无需登录即可上报。

---

## 五、已知风险 / 注意
- **归因精度**：click 的 `sourceTag` 由 `utm.utmSource=code` 回查，若同一活动有多人分享，可能归因到首个匹配的 source-tag（运营报表以 `abVariant`+`promoCampaign` 为准，影响极小）。
  - ✅ **2026-10-07 已修复**：`source-resolver.ts` utm 组合匹配限同设备 + 新建 tag 直接以 `deviceFingerprint` 为 tagId，click 归因到设备自有 tag，campaign 归因闭环。
- **`v.joho.cn` 同源**：若消消乐日后挂在 `v.joho.cn` 发布，API 仍指向 `h.joho.cn` 即可（同一 strapi 实例）。
- **未做"发布位置"维度**：promo 模型未单独建模广告位，本期以 `promo-channel.scene` 表示"方式"；如需位置维度后续在 ab-variant 加 `position` 枚举。

---

## 六、完成情况与执行差异（2026-10-07 收口）

### ✅ 已完成
1. **P0**：Strapi dist bundle 部署 + pm2 restart，schema 自动迁移确认；游戏端 `__APP_ENV__` 注入并部署 game.yourbao.cn。
2. **P1**：渠道/活动/实验(running)/两变体（weight=50、share* 字段填齐、300×300 分享图上传 `/uploads/xxl-a.png`、`xxl-b.png`）全部录入并发布。documentId 见 P2 自检第 6 条。
3. **P2**：冒烟 + 手机视口（390×844 dpr=2）端到端验证全通过 —— pick → identify → page-view → click 四请求全 200；DB 确认 browser-log 曝光带变体、click-event 带变体 + 设备自有 source_tag + promoCampaign。截图：`docs/manual/shots/2026-10-07-xxl-ab-e2e/`。

### 🔧 联调中额外修复的 bug（超出原计划，均已部署验证）
| 位置 | 问题 | 修复 |
| --- | --- | --- |
| `zhao-studio` ab-test.ts / channel-report.ts | v5 `findMany` 关联过滤必须 `{ campaign: { documentId } }` 包裹，直接传 documentId 报 500 | 9 处过滤改写 |
| `zhao-studio` analytics.ts | v5 `documents.create` 关联字段只收数值 id，传 documentId 报 400 "Invalid relations" | 加 `resolveVariantId` helper |
| `zhao-track` source-resolver.ts / click-orchestrator.ts | 同上（create 数值 id）+ utm 组合跨设备共享 tag | `matchedCampaignId=String(id)`；utm 匹配限同设备；tagId=deviceFingerprint |
| 游戏端 `Main.ts` | **`initMarketingShare` 只 import 未调用**，营销请求从未发出 | `bootstrap()` 早期 `void initMarketingShare()`（置于 SSO 跳转检查前） |
| 游戏端 `SsoAuth.ts` | SSO return_url 丢 query，未登录打开者登录回来 `camp/v/st` 全丢 | returnUrl fallback 追加 `location.search` |

### ⚠️ 录入方式的执行差异
- 原计划经 TAdmin/Content-Manager API 录入，但 CM create/update 的 body 中名为 `status` 的字段与 D&P 发布状态校验撞名（400 "Invalid status"），**改用幂等 SQL 直插**（lnk 表关联 + published_at=now()）。后续在后台编辑这些记录不受影响。

### 📌 报表鉴权验证（2026-10-07 补验通过）
- 接口：`GET /api/zhao-studio/v1/admin/channel-report`（Bearer JWT，策略链 is-authenticated → has-permission → has-channel-scope → has-tenant-access）。
- 鉴权矩阵：无 token=401 / 伪 token=401 / admin(zhaoRoles)=200 / channel-admin（权限表含 `zhao-studio.channel-report.view`）=200（正确放行）/ 普通用户=403 PolicyError。
- 数据自洽：温情版 impressions=3 / clicks=2 / CTR=66.67%（与 DB 一致），挑战版 0/0（测试期未曝光）。
- 测试数据修正：两条 v1 bundle 时期的测试曝光补齐 `promo_channel_code=xxl-wechat`（v1 的 trackPageView 无渠道码解析，会被报表渠道过滤排除；v2 起新流量自动带渠道码，不受影响）。
- TAdmin 前端只需带上登录 JWT 调该接口即可展示变体对比报表。

### 📌 剩余事项（仅运营侧）
- P3 观察期（3~7 天 CTR 对比挑优）由运营执行。
