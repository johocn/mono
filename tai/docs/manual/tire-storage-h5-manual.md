# 雪地胎寄存预约 H5 · 操作手册

> 版本：标准版（不含骑手调度，商家手动派单）
> 适用：长春净月本地轮胎门店 / 仓储
> 相关文档：[设计说明](../superpowers/specs/2026-11-03-tire-storage-h5-design.md) · [实现计划](../superpowers/plans/2026-11-03-tire-storage-h5.md)

## 一、交付物一览

| 模块 | 位置 | 说明 |
| --- | --- | --- |
| C 端 H5 | `d:\zhao\tai` | uni-app + Vue3 + TS + Vite，5 个页面 |
| 商家后台 | `d:\zhao\strapi\plugins\zhao-tire` | Strapi 自定义插件，菜单「雪地胎寄存」 |
| 页面截图 | `docs/manual/shots/2026-11-03-tire-storage/` | 390×844 dpr=2 真机视口 + 后台 1440×900 |
| 接口联调脚本 | `d:\zhao\strapi\.tmp\tire-e2e.js` | 20 项全链路断言（仅本地验证用） |

H5 页面：首页 / 预约下单 / 订单查询 / 订单详情 / 协议 / FAQ（共 6 个路由，协议与 FAQ 为独立页）。

## 二、本地运行

### 1. 后端（Strapi 5）

```powershell
cd d:\zhao\strapi
npm run develop -- --no-build-admin --no-watch-admin
```

- 默认 `http://localhost:1337`，后台 `http://localhost:1337/admin`。
- 本地 `.env` 未配置数据库时会落 SQLite；本项目验证使用 PostgreSQL（库名 `strapi`）。
- 完整 `config/plugins.ts` 中的 `zhao-studio` 依赖 Redis，本地无 Redis 时启动会卡在队列初始化。仅调试本插件时可临时只保留 `zhao-tire` 配置（验证完务必还原）。
- 首次启动会自动执行 `bootstrap`：创建角色、同步角色权限、创建 `tire-config` 单例、注册每日提醒 cron、种子套餐/增值项/FAQ/评价与站点配置。
- 修改插件代码后需重建：`cd d:\zhao\strapi\plugins\zhao-tire; npm run build`；管理面板改动还需在项目根执行 `npm run build` 重建 Admin。

### 2. 前端（uni-app H5）

```powershell
cd d:\zhao\tai
npm run dev:h5      # 开发，默认 http://localhost:5173
npm run build:h5    # 生产，产物 dist/build/h5
```

- `VITE_API_BASE_URL`：开发默认 `http://localhost:1337`；生产默认 `/`，建议与 Strapi 同域部署，避免跨域与微信域名校验问题。
- 部署：将 `dist/build/h5` 作为静态站点，反向代理 `/api/zhao-tire/v1` 到 Strapi 即可。

### 3. 地图与导航（C 端）

- 首页「服务范围」下方、订单详情「寄存网点」卡片均展示地图与导航入口。
- 地图 SDK：腾讯位置服务 JS API GL，key 走构建期 `VITE_QQMAP_KEY`，复用现有腾讯地图 key，**不入库**；本地写在 `.env.local`（已被 `.gitignore` 的 `*.local` 忽略），未注入 key 时自动走无 SDK 兜底。
- 导航：优先高德 URI（无需 key），点击「导航前往」或地图卡片后打开
  `https://uri.amap.com/navigation?to=经度,纬度,名称&mode=car&coordinate=gaode&callnative=1`；仅有地址时退化为
  `https://uri.amap.com/search?keyword=地址&city=长春`；站点内容配置了 `mapUrl` 时优先使用该链接。
- 运营端：后台「站点内容 → 仓库地址 / 仓库纬度 / 仓库经度 / 地图链接」维护；经纬度缺失时按地址搜索兜底，建议补全经纬度以获得精确导航。
- 验证：Playwright 390×844 dpr=2 实测 SDK 正常渲染、模拟 `map.qq.com` 失败时兜底视图可用，导航请求 URL 见 `docs/manual/shots/2026-11-04-navigation/verification.json`。

## 三、商家后台使用

后台菜单：订单管理 / 仓储库存 / 套餐配置 / 客户管理 / 消息通知 / 站点内容。

### 1. 订单管理

- 列表支持状态（待接单/待入库/寄存中/待出库/已完成/已拒绝/已取消）、服务类型（到店/上门）、下单日期区间、关键词（订单号/手机号/车牌）筛选，可导出 Excel。
- 主流程：`接单 → 入库（填仓位 + 上传轮胎照片）→ 客户申请出库 → 通过出库申请 → 出库（上传出库照片）→ 已完成`。
- 拒绝订单需填写原因；「收款」用于到店支付 / 定金 / 取货付款登记，每次收款都会写入支付流水（`tire-payment`），订单已收金额由流水汇总。
- 出库需先通过客户的出库申请；未结清的订单点「出库」会提示「未结清不可出库」，需先在收银对账里收款。
- 出库时必须输入客户出示的 6 位核销码，核销码错误会被拒绝；同一订单重复出库会被拒绝。
- 修改订单仅限未入库订单的关键信息（以后台校验为准）。

### 2. 仓储库存

- 「在存」：按仓位、手机号、车牌检索，展示入库时间、到期日、剩余天数。
- 「临期超期」：到期预警清单，可勾选批量生成提醒短信（写入消息队列，不直接调用运营商）。

### 3. 套餐配置

- 套餐：到店价 / 上门价 / 基础月数 / 超月单价 / 超期日价 / 时长文案 / 亮点，金额按「元」录入，数据库按分存储。
- 增值项：如「精存（打油缠保鲜膜）」。
- 支付开关：在线支付、定金模式、定金比例（一期仅登记收款，预留微信支付接口）。

### 4. 客户管理

按手机号 / 姓名 / 车牌搜索，查看订单数、在存数、累计金额、最近订单与历史订单。

### 5. 消息通知

- 记录每次业务事件生成的短信（下单成功、接单、入库完成、到期前 7/3 天、出库完成），状态为「待发送」时可一键复制文案并标记「已发送」。
- 模板文案可在页面下方编辑，变量：`{name}` `{orderNo}` `{expireAt}` `{daysLeft}` `{locationCode}` `{pickupText}` `{content}`。
- 到期提醒由 cron `tire-expiry-reminder` 每日 09:00（Asia/Shanghai）生成。

### 6. 站点内容

FAQ、用户评价、实拍相册（含图片与排序）、寄存协议、服务范围、仓库地址与地图链接、每日上门时段上限等，均在此维护，保存后 H5 立即生效。

### 7. 收银对账（A 版：待办为主，对账为辅）

- 「待办确认」：列出 `pending` 流水（mock / 微信下单但未回调、或线下收款待确认），可点「确认到账」转为 `paid`。
- 「支付台账」：按订单号 / 渠道 / 状态 / 日期筛选全部流水，含退款负数记录。
- 「邀请记录」：直接查询 `tire-share-record` 与 `tire-referral-reward`，展示分享人、被邀请人、绑定时间、是否入库生效、奖励发放/使用状态，支持按状态 + 日期筛选与服务端分页，可导出 CSV（UTF-8 BOM，Excel 直接打开不乱码）。
- 数据来源为明细表实时查询，不使用聚合计数；筛选与分页均在服务端完成。

## 四、账号与权限

| 角色 | 代码 | 权限 |
| --- | --- | --- |
| 超级管理员 | `strapi-super-admin` | 全部 |
| 轮胎管理员 | `tire-admin` | 订单、库存、套餐、客户、消息、内容全部插件权限 |
| 仓库操作员 | `tire-warehouse` | 订单只读 + 入库/出库（含上传照片），其余接口返回 403 |
| 收银员 | `tire-cashier` | 订单只读 + 收款登记（`order.payment`）+ 支付台账（`payment.read`）；不能入库/出库、不能退款、不能改套餐 |

- 收款路由由 `full` 改为独立动作 `order.payment`，并在 `admin-role.ts` 白名单中放行 `payment` 档；收银员无法调用退款接口（仍是 `full`）。

- 角色由 `bootstrap` 幂等创建，并在每次启动时同步插件 RBAC 权限（否则自定义角色看不到后台菜单）。
- 接口层另有独立策略 `plugin::zhao-tire.admin-role`，按 `read / storage / full` 三档校验，不依赖 Strapi 原生 RBAC。
- 新增员工：后台「设置 → 管理员」创建账号并分配上述角色。

## 五、关键配置项

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `TIRE_TIMEZONE` | `Asia/Shanghai` | 计价与提醒时区 |
| `SMS_PROVIDER` | `queue` | 短信通道：`queue` 仅落库待人工发送 |
| `VITE_API_BASE_URL` | 开发 `http://localhost:1337`；生产 `/` | H5 接口地址 |
| `VITE_QQMAP_KEY` | 空（本地 `.env.local` 注入） | 腾讯位置服务 JS API GL key，复用现有项目 key，不入库；缺失时导航走无 SDK 兜底 |

- **图片存储**：默认存本地 `public/uploads`；生产建议启用现有 `zhao-oss` 插件（阿里云 OSS），轮胎照片长期保留。
- **支付**：一期为到店支付 + 后台收款登记；`onlinePayEnabled`、`depositEnabled`、`depositPercent` 可在后台切换。
- **短信**：接入运营商时实现 `server/src/services/sms-provider.ts` 中的发送适配器，并把 `SMS_PROVIDER` 切到对应通道即可，业务侧无需改动。
- **地图/电话**：站点内容中维护仓库地址、经纬度（`warehouseLat` / `warehouseLng`）与客服电话；H5 地图卡片使用腾讯 GL JS，导航按钮使用高德 URI 兜底（不依赖 key），电话使用 `uni.makePhoneCall`。

## 六、业务规则速查

- 计价 = 套餐基础价（含基础月数）+ 超出月数 × 超月单价 + 增值项 + 上门费；金额单位为分。
- 寄存到期日 = 客户填写的「预估取回日期」；超出按超期日价计费，最长存至站点配置的 `maxStorageDate`（默认 2027-05-01）。
- 订单状态机：`pending_accept → accepted → stored → pending_outbound → completed`，旁支 `rejected / canceled`。
- 续费仅「寄存中」可申请；出库申请仅「寄存中」且无待审申请时可提交。
- 防重复提交：下单使用 `clientToken` 唯一索引；表单按钮提交后置灰。
- 隐私：订单查询需手机号 + 订单号，返回手机号脱敏（如 `138****8000`）。
- 上门时段：按日期查询剩余名额，满额时段置灰；上限在站点内容维护（默认上午/下午各 6）。
- 支付方式：`wechat`（在线支付）/ `store_pay`（到店支付）/ `pickup_pay`（取货付款）；旧值 `full` / `deposit` 仍兼容。
- 收款：所有到账先写 `tire-payment` 流水（渠道、金额、状态、外部单号、幂等键、操作人、备注），订单上的 `paidAmount` 只由流水汇总驱动；单笔收款不得超过未结金额。
- 取货付款：出库前必须结清（含逾期费）；未结清调用出库接口返回 `PAYMENT_REQUIRED`。
- 核销码：入库成功生成 6 位数字核销码，出库必须携带正确核销码，重复出库会被拒绝。
- 分享奖励：每满 3 个「有效邀请」发 1 次免单；有效邀请 = 被邀请人首单完成入库；免单仅抵扣基础套餐费（单次封顶 6900 分、有效期 365 天、年上限 4 次，均可在 `tire-config` 配置）；奖励用于下一笔订单，退款时未使用奖励回滚、已使用奖励恢复可用。
- 防刷：禁止自邀；同一手机号/openid/设备只能绑定一个邀请人；单邀请人每日绑定上限（默认 5）；命中风控进入 `pending_review`。

## 七、验收记录（2026-11-03）

- 接口全链路 20 项：站点配置、时段余量、下单与幂等、详情脱敏、手机号不匹配 403、时段满 409、未入库续费/出库拒绝、接单、入库（多图 multipart）、续费、出库申请、审核、出库、后台列表、Excel 导出、短信日志 —— 全部 PASS。
- 权限边界 8 项：仓库操作员可读订单/可入库；访问客户、套餐、短信、导出、接单均 403 —— 全部 PASS。
- H5 六页与后台五页浏览器实测截图见下方索引。
- 寄存网点导航（2026-11-04）：首页与订单详情均展示腾讯地图 SDK 与「导航前往」入口；点击实际打开
  `https://uri.amap.com/navigation?to=125.4233,43.7833,...`；模拟 `map.qq.com` 加载失败后兜底视图与导航均正常 —— PASS。
- 线上验收（https://www.joho.cn/tire/）：地图 SDK 正常渲染，无失败请求；拦截 `map.qq.com` 后兜底文案出现，导航请求 URL 与本地一致 —— PASS。

### 支付 / 邀请奖励验收（2026-11-04，本地 PostgreSQL 测试库 + mock 支付通道）

- 端到端 46 项全部 PASS：mock 预下单、签名错误 401 `INVALID_SIGNATURE`、签名正确置 `paid`、重放幂等 `duplicated=true`、到店收款入流水、超额收款 `AMOUNT_EXCEEDED`、未结清出库 `PAYMENT_REQUIRED`、核销码错误 `REDEMPTION_CODE_INVALID`、核销码正确出库、重复出库拒绝、邀请绑定写入、满 3 个有效邀请发券、奖励券抵扣、退款归还奖励券、退款回滚有效邀请并作废未使用奖励、邀请记录筛选/导出、收银员可登录可收款但不能入库/退款。
- 新增表已建索引：`zhao_tire_payments`（`payment_no` / `idempotency_key` 唯一）、`zhao_tire_share_records`（`dedupe_key` 唯一）、`zhao_tire_referral_rewards`（`reward_no` 唯一）。

## 八、截图索引

C 端（390×844，dpr=2）：

- [首页首屏](shots/2026-11-03-tire-storage/01-home.png) · [首页整页](shots/2026-11-03-tire-storage/02-home-full.png)
- [预约下单](shots/2026-11-03-tire-storage/03-create.png) · [下单整页](shots/2026-11-03-tire-storage/04-create-full.png)
- [订单查询](shots/2026-11-03-tire-storage/05-query.png)
- [订单详情](shots/2026-11-03-tire-storage/06-detail.png) · [详情整页](shots/2026-11-03-tire-storage/07-detail-full.png)
- [寄存协议](shots/2026-11-03-tire-storage/08-agreement.png) · [FAQ](shots/2026-11-03-tire-storage/09-faq.png)

寄存网点导航（2026-11-04，390×844 dpr=2）：

- [首页整页（含寄存网点）](shots/2026-11-04-navigation/01-home-location.png) · [首页寄存网点卡片](shots/2026-11-04-navigation/02-home-location-card.png)
- [SDK 加载失败兜底](shots/2026-11-04-navigation/03-nav-fallback.png)
- [订单详情寄存网点卡片](shots/2026-11-04-navigation/04-detail-location-card.png) · [订单详情整页](shots/2026-11-04-navigation/05-detail-full.png)
- [英文界面（en-US）寄存网点卡片](shots/2026-11-04-navigation/06-home-en-card.png)
- [线上首页寄存网点卡片](shots/2026-11-04-navigation/07-online-home-card.png) · [线上 SDK 失败兜底](shots/2026-11-04-navigation/08-online-fallback.png)

后台（1440×900）：

- [订单工作台](shots/2026-11-03-tire-storage/admin-02-orders.png) · [仓储库存](shots/2026-11-03-tire-storage/admin-03-inventory.png)
- [套餐配置](shots/2026-11-03-tire-storage/admin-04-catalog.png) · [客户管理](shots/2026-11-03-tire-storage/admin-05-customers.png)
- [消息通知](shots/2026-11-03-tire-storage/admin-06-messages.png)

支付 / 邀请奖励（2026-11-04，C 端 390×844 dpr=2 / 后台 1440×900）：

- [下单-支付方式（C 版）](shots/2026-11-04-payment-referral/01-create-payment.png) · [下单-奖励券抵扣](shots/2026-11-04-payment-referral/02-create-reward.png)
- [订单详情-支付状态（B 版）](shots/2026-11-04-payment-referral/03-detail-payment.png)
- [分享页-海报（B 版）](shots/2026-11-04-payment-referral/05-referral-poster.png) · [分享页-邀请记录与进度](shots/2026-11-04-payment-referral/06-referral-records.png)
- [订单查询-手机号验证码登录](shots/2026-11-04-payment-referral/07-query-sms-login.png)
- [收银对账-待办确认（A 版）](shots/2026-11-04-payment-referral/08-admin-payments-todo.png) · [收银对账-支付台账](shots/2026-11-04-payment-referral/09-admin-payments-ledger.png)
- [邀请记录明细（运营端）](shots/2026-11-04-payment-referral/10-admin-share-records.png) · [订单管理-核销码与未结清](shots/2026-11-04-payment-referral/11-admin-orders-redemption.png)
- [出库-未结清拦截（弹窗红字提示）](shots/2026-11-04-payment-referral/13-admin-outbound-blocked.png) · [出库-结清后核销码登记](shots/2026-11-04-payment-referral/14-admin-outbound-ready.png)
- [出库成功（核销码失效）](shots/2026-11-04-payment-referral/15-admin-outbound-passed.png)

## 九、已知限制 / 二期

- 短信仅为队列 + 人工发送，未接运营商；SSO 的 `send-sms` 在 `SMS_PROVIDER=mock` 时使用固定测试码（`1234`），**仅限非生产环境**；生产需先配置真实短信通道，否则非微信环境验证码登录不可用。
- 微信 JSAPI 支付尚未接真实通道：`PAY_PROVIDER` 默认 `mock`，仅用于本地/测试演练；微信 provider 只保留接口占位。真实上线需先确认 `wechatpay-yourbao-h5` 对应 AppID 是否具备网页授权能力（能拿到该 AppID 下的 openid），并在公众号后台配置网页授权域名；若不具备，需改用 SSO 的 AppID 支付或补授权域名。
- H5 的微信内 JSAPI 下单入口已预留，但未在真实微信环境验证（缺公众号授权与商户号前置）。
- 无骑手派单、取送轨迹、多仓库/多城市、优惠券、会员体系（均在二期范围）。
- 后台 Strapi Admin 的插件名字段缺少 zh-Hans 翻译文件，控制台会打印 `MISSING_TRANSLATION` 告警，界面按中文兜底显示，不影响使用。
