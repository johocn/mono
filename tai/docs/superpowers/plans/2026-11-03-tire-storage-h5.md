# 雪地胎寄存预约 H5 + Strapi zhao-tire 插件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可上线的雪地胎寄存 H5（5 个 C 端页面）+ Strapi 后台插件（订单/库存/套餐/客户/通知/内容），复用现有 `d:\zhao\strapi` 工程与 uni-app H5 范式。

**Architecture:** C 端 uni-app H5 静态站点通过 `/api/zhao-tire/v1/*` 调用插件内 `auth:false` 自定义路由；后台页面内嵌 Strapi Admin，通过 `/api/zhao-tire/v1/admin/*` 调用同一插件的后台路由，路由统一挂 `plugin::zhao-tire.admin-role` 策略按原生 admin 角色放行。数据层用 7 个 Content-Type，图片走 Strapi Upload + `zhao-oss`，通知落 `tire-sms-log` 队列。

**Tech Stack:** Strapi 5.47（PostgreSQL）、React 18 + antd 5（插件后台）、uni-app + Vue3 + TS + Vite（H5）、xlsx、qrcode、Playwright（手机视口验收）。

**规格来源:** [docs/superpowers/specs/2026-11-03-tire-storage-h5-design.md](../../superpowers/specs/2026-11-03-tire-storage-h5-design.md)

---

## 文件结构

### 后端 `d:\zhao\strapi\plugins\zhao-tire`

```
package.json                       # 仿 zhao-website，name: zhao-tire
strapi-server.js / strapi-admin.js # 指向 dist 的入口
server/src/
  index.ts                         # register/bootstrap/config/controllers/routes/services/policies/contentTypes
  register.ts                      # 注册权限动作、日志
  bootstrap.ts                     # 建 tire-admin / tire-warehouse 角色、种子数据、cron
  config.ts                        # default config（provider、时区）
  content-types/index.ts
  content-types/{tire-package,tire-addon,tire-order,tire-sms-log,tire-faq,tire-review,tire-gallery,tire-config}/schema.json
  routes/index.ts
  routes/content-api.ts            # C 端 8 条公开路由
  routes/admin-api.ts              # 后台路由（auth:false + admin-role 策略）
  controllers/index.ts
  controllers/content-api/{site,order,content}.ts
  controllers/admin-api/{order,inventory,catalog,customer,sms,content,export}.ts
  services/index.ts
  services/{pricing,slot,order-no,order,notify,sms-provider,admin-role,export,catalog,site}.ts
  policies/admin-role.ts
  cron/expiry-reminder.ts
admin/src/
  index.ts / pluginId.ts
  pages/App.tsx                    # 菜单 + 子路由
  pages/OrdersPage.tsx             # 订单工作台（列表 + 详情抽屉 + 入库/出库）
  pages/InventoryPage.tsx          # 库存与临期预警
  pages/CatalogPage.tsx            # 套餐 + 增值项
  pages/CustomersPage.tsx          # 客户聚合
  pages/MessagesPage.tsx           # 模板与待发队列
  pages/ContentPage.tsx            # 站点内容 / FAQ / 评价 / 相册 / 协议
  components/{Layout,StatusTag,PhotoUploader,PriceText}.tsx
  utils/api.ts
  translations/zh-Hans.json
```

### 前端 `d:\zhao\tai`

```
package.json / vite.config.ts / tsconfig.json / .env.development / .env.production
src/main.ts / App.vue / pages.json / manifest.json / uni.scss
src/styles/tokens.scss             # 冰雪蓝 + 暖橙令牌
src/api/http.ts                    # request 封装 + 错误码
src/api/{site,order}.ts
src/locales/zh-CN.ts               # 文案集中管理
src/utils/{format,share,phone}.ts
src/components/{PackageCard,StickyCta,SectionHeader,FormField,SlotPicker,PriceSummary,StatusTag,PhotoGrid,FaqItem,QrModal}.vue
src/pages/index/index.vue
src/pages/order/create.vue
src/pages/order/query.vue
src/pages/order/detail.vue
src/pages/content/agreement.vue
src/pages/content/faq.vue
scripts/api-regression.mjs          # API 回归
tests/e2e/*.spec.ts                 # Playwright 手机视口
docs/manual/tire-storage-h5-manual.md
```

---

## 任务分解

### Task 1: 插件脚手架与注册

**Files:** `d:\zhao\strapi\plugins\zhao-tire\package.json`、`strapi-server.js`、`strapi-admin.js`、`tsconfig.json`、`tsconfig.server.json`、`server/src/{index,register,bootstrap,config}.ts`、`d:\zhao\strapi\config\plugins.ts`

- [ ] 复制 `plugins/zhao-website` 的构建配置骨架：`package.json` 名称改 `zhao-tire`，`strapi.name`、`displayName` 改「雪地胎寄存」，依赖保留 `antd`、`@ant-design/icons`。
- [ ] `server/src/index.ts` 导出 `{ register, bootstrap, config, contentTypes, controllers, routes, services, policies }`。
- [ ] `register.ts` 注册 admin 权限动作（供角色 UI 展示）：`order.read/order.accept/order.reject/order.update/order.inbound/order.outbound/order.export/package.manage/config.manage/content.manage/customer.read/sms.manage`，并在日志打印 `[zhao-tire] register`。
- [ ] `bootstrap.ts` 幂等创建两个原生 admin 角色：`tire-admin`（轮胎管理员）、`tire-warehouse`（仓库操作员）；确保 `tire-config` 存在一条默认记录；调用 `cron/expiry-reminder` 注册每日 09:00 任务。
- [ ] 在 `d:\zhao\strapi\config\plugins.ts` 增加：

```ts
"zhao-tire": {
  enabled: true,
  resolve: "./plugins/zhao-tire",
  config: {
    timezone: "Asia/Shanghai",
    smsProvider: env("SMS_PROVIDER", "queue"),
  },
},
```

- [ ] 运行 `npm run build`（`d:\zhao\strapi\plugins\zhao-tire`）后 `npm run develop`（strapi 根目录），确认日志出现 `[zhao-tire] register`，Admin 左侧出现插件菜单。
- [ ] Commit：`feat(tire): 初始化 zhao-tire 插件骨架与注册`

**验收：** 插件可构建、可启动，Admin 菜单可见，无类型错误。

### Task 2: 数据模型（8 个 schema）

**Files:** `server/src/content-types/index.ts` + 8 个 `schema.json`

- [ ] `tire-package` 字段：`name`(string,required)、`code`(uid→name)、`baseMonths`(integer,default 6)、`storePrice`(integer)、`pickupPrice`(integer)、`extraMonthPrice`(integer)、`overdueDayPrice`(integer)、`durationText`(string)、`highlights`(json)、`enabled`(boolean,default true)、`sort`(integer,default 0)。`collectionName: zhao_tire_packages`。
- [ ] `tire-addon` 字段：`name`、`code`(uid)、`price`(integer)、`unitText`、`enabled`、`sort`。`collectionName: zhao_tire_addons`。
- [ ] `tire-order` 字段（全部按规格 §4.3）：`orderNo`(string,unique)、`clientToken`(string,unique)、`source`(enumeration [h5])、客户 6 字段、服务 4 字段（`pickupDate` 用 date，`pickupSlot` enumeration [morning,afternoon]）、`storageStartDate`(date)、`expectedReturnDate`(date)、`expireAt`(date)、`months`(integer)、`packageSnapshot`(json)、`addons`(json)、`amountPackage/amountAddon/amountTotal/paidAmount`(integer)、`paymentMethod`(enumeration [store_pay,deposit,full])、`paymentStatus`(enumeration [unpaid,deposit_paid,paid])、`status`(enumeration [pending_accept,accepted,stored,pending_outbound,completed,rejected,canceled]，default pending_accept)、`outboundRequestStatus`(enumeration [none,pending,approved,rejected]，default none)、`outboundRequestedAt`(datetime)、`outboundNote`(text)、`inboundPhotos`(media multiple)、`outboundPhotos`(media multiple)、`locationCode`(string)、`inboundAt`/`outboundAt`(datetime)、`storageOperator`(relation admin::user)、`note`(text)、`agreementAcceptedAt`(datetime)、`renewals`(json)、`timeline`(json)。`options.draftAndPublish: false`。
- [ ] `tire-sms-log` 字段：`order`(relation manyToOne tire-order)、`type`(enumeration [order_created,accepted,inbound,due_7,due_3,outbound_done,manual])、`phone`、`content`(text)、`status`(enumeration [pending,sent,skipped]，default pending)、`sentAt`(datetime)、`operator`(relation admin::user)。
- [ ] `tire-config`（`kind: "singleType"`）：Banner 3 字段、`serviceIntro`(richtext)、`warehouseConditions`(text)、`guarantees`(json)、`serviceAreaText`(text)、`warehouseAddress`(string)、`warehouseLat/warehouseLng`(float)、`mapUrl`(string)、`contactPhone`(string)、`wechatQr`(media single)、`dailyPickupLimitMorning/Afternoon`(integer,default 6)、`paymentOnlineEnabled`(boolean,default false)、`depositEnabled`(boolean,default false)、`depositRatio`(integer,default 30)、`agreementText`(richtext)、`maxStorageDate`(date)、`announcement`(string)。
- [ ] `tire-faq`（question/answer/sort/enabled）、`tire-review`（nickname/content/rating/integer/showOnHome/sort）、`tire-gallery`（image/single media、caption、sort）。
- [ ] 启动后确认 8 张表建表成功（`zhao_tire_orders` 等），Content Manager 中可编辑。
- [ ] Commit：`feat(tire): 新增订单/库存/套餐/通知/内容数据模型`

**验收：** 无 migration 报错；`tire-order.orderNo` 与 `clientToken` 唯一约束存在。

### Task 3: 计价、时段、单号与状态机服务

**Files:** `server/src/services/{pricing,slot,order-no,order}.ts`、`services/index.ts`

- [ ] `pricing.ts`：

```ts
export type PriceInput = {
  serviceType: "store" | "pickup";
  months: number;
  packageDoc: { baseMonths: number; storePrice: number; pickupPrice: number; extraMonthPrice: number };
  addons: Array<{ price: number }>;
};
export const calcPrice = ({ serviceType, months, packageDoc, addons }: PriceInput) => {
  const base = serviceType === "store" ? packageDoc.storePrice : packageDoc.pickupPrice;
  const extraMonths = Math.max(0, months - packageDoc.baseMonths);
  const amountPackage = base + extraMonths * packageDoc.extraMonthPrice;
  const amountAddon = addons.reduce((s, a) => s + a.price, 0);
  return { amountPackage, amountAddon, amountTotal: amountPackage + amountAddon };
};
```

- [ ] `slot.ts`：`remaining(date, slot)` 查 `tire-order` 中 `pickupDate=date, pickupSlot=slot, status not in [canceled,rejected]` 计数，与 `tire-config.dailyPickupLimitMorning/Afternoon` 比较；`assertAvailable(date, slot)` 不足则抛 `{ code: "SLOT_FULL", status: 409 }`。
- [ ] `order-no.ts`：`XT + YYMMDD + '-' + 序号4位`；当日计数 + 唯一约束冲突重试 3 次。
- [ ] `order.ts` 提供：`create(input)`（校验日期/时段/协议/幂等 → 计算费用 → 落库 → 写 timeline → 触发 order_created 通知）、`detail(orderNo, phone)`（手机号精确匹配 + 脱敏）、`accept/reject/inbound/outbound/complete`、`renew(orderNo, months, paymentMethod)`、`requestOutbound(orderNo, note)`、`approveOutbound/rejectOutbound`。状态流转严格按规格 §5，非法流转抛 `{ code: "STATE_INVALID", status: 400 }`。
- [ ] 单元测试（Jest，`plugins/zhao-tire/tests/`）：计价 3 个用例（未超 baseMonths、超期加月、增值项叠加）、单号格式、非法状态流转。
- [ ] Commit：`feat(tire): 计价/单号/时段/订单状态机服务与单测`

**验收：** `npm test` 全绿。

### Task 4: C 端公开接口

**Files:** `server/src/routes/content-api.ts`、`controllers/content-api/{site,order,content}.ts`、`services/site.ts`

- [ ] 路由（`auth:false`，`paths` 以 `/v1` 前缀）：

| 方法 | 路径 | handler |
|---|---|---|
| GET | `/v1/site` | `site.get` |
| GET | `/v1/slots` | `order.slots` |
| POST | `/v1/orders` | `order.create` |
| GET | `/v1/orders/:orderNo` | `order.detail` |
| POST | `/v1/orders/:orderNo/renew` | `order.renew` |
| POST | `/v1/orders/:orderNo/outbound` | `order.requestOutbound` |
| GET | `/v1/agreement` | `content.agreement` |
| GET | `/v1/faqs` | `content.faqs` |

- [ ] `site.get` 返回 `{ config, packages, addons, faqs, reviews, gallery }`（只取 enabled，按 sort）。
- [ ] `order.create` 接收 `{ clientToken, customerName, phone, plateNo, carType, tireSpec, withWheelRim, serviceType, returnMethod, storageStartDate, expectedReturnDate, pickupDate?, pickupSlot?, addonCodes?, note?, agreementAccepted }`；返回 `{ orderNo, amountTotal, status }`；错误统一 `{ code, message }`。
- [ ] `order.detail` 需 `?phone=`，返回脱敏手机号、剩余天数、超期天数与估算超期费、入库档案（照片 URL、仓位、入库时间）、可续费与可出库标记。
- [ ] 联调：`curl` 创建 → 查询 → 续费 → 出库申请全链路；补 `scripts/api-regression.mjs`（前端仓库）覆盖时段满（409）、幂等（同 clientToken 返回同单）、日期越界（400）。
- [ ] Commit：`feat(tire): C 端站点/下单/查询/续费/出库公开接口`

**验收：** 回归脚本全 PASS，重复提交不产生第二条订单。

### Task 5: 通知队列、短信适配器与到期 cron

**Files:** `server/src/services/{notify,sms-provider}.ts`、`server/src/cron/expiry-reminder.ts`、`services/index.ts`

- [ ] `notify.ts`：`enqueue(type, order, extra?)` 渲染模板（变量 `{name}{orderNo}{expireAt}{daysLeft}{locationCode}`），写 `tire-sms-log`；同订单同 type 当日去重。
- [ ] `sms-provider.ts`：接口 `send({phone, content})`；`queue` 实现直接返回 `{ queued: true }`；`aliyun` 实现读 `ALIYUN_SMS_ACCESS_KEY_ID/SECRET/SIGN_NAME/TEMPLATE_CODE`，缺失则降级为 queue 并打 warn。
- [ ] `cron/expiry-reminder.ts`：每日 09:00（`Asia/Shanghai`）扫 `status=stored` 且 `expireAt` 为 7/3 天后的订单，调用 `notify.enqueue("due_7"|"due_3")`；幂等靠当日去重。
- [ ] 在 `bootstrap.ts` 调用注册 cron（`strapi.cron.add`）。
- [ ] 后台模板文案放 `tire-config` 之外的常量文件 `server/src/constants/sms-templates.ts`，支持后续后台编辑（一期先常量 + 后台可改文案字段在 config 里加 `smsTemplateOverride` json）。
- [ ] Commit：`feat(tire): 通知队列/短信适配器/临期 cron`

**验收：** 手动把某订单 `expireAt` 改为 7 天后，重启或触发 cron 后 `tire-sms-log` 出现 pending 记录。

### Task 6: 后台角色策略与订单管理接口

**Files:** `server/src/policies/admin-role.ts`、`routes/admin-api.ts`、`controllers/admin-api/order.ts`、`services/export.ts`

- [ ] `admin-role.ts`：读 `Authorization: Bearer`，用 `strapi.config.get('admin.auth.secret')` 验签 → 查 `admin::user` 含 `roles`；映射：`strapi-super-admin`/`tire-admin` 放行全部；`tire-warehouse` 仅放行 `config.allow` 为 `read`/`storage` 的路由；否则 403。把用户写入 `ctx.state.user`。
- [ ] 后台路由（`/v1/admin` 前缀，`auth:false, policies:[plugin::zhao-tire.admin-role]`，每条声明 `config.allow`）：

| 方法 | 路径 | allow | 说明 |
|---|---|---|---|
| GET | `/orders` | read | 筛选 state/dateFrom/dateTo/serviceType/keyword/status/page |
| GET | `/orders/:id` | read | 详情（含照片、timeline、renewals） |
| PATCH | `/orders/:id` | full | 改单（客户/车辆/日期/备注） |
| POST | `/orders/:id/accept` | full | 接单 |
| POST | `/orders/:id/reject` | full | 拒绝（reason） |
| POST | `/orders/:id/inbound` | storage | multipart：`photos[]` + `locationCode` |
| POST | `/orders/:id/outbound` | storage | multipart：`photos[]` |
| POST | `/orders/:id/payment` | full | 收款登记（amount/method） |
| GET | `/orders/export.xlsx` | full | 导出 |
| GET | `/inventory` | read | 在存清单（locationCode/keyword） |
| GET | `/inventory/expiring` | read | days 内到期 |
| POST | `/inventory/remind` | full | 批量生成提醒（ids[]） |
| GET | `/customers` | full | 按手机号聚合 |
| CRUD | `/packages`、`/addons` | full | 套餐/增值项 |
| GET/PUT | `/config` | full | 站点配置 |
| CRUD | `/faqs`、`/reviews`、`/gallery` | full | 内容 |
| GET/PATCH | `/sms-logs` | full | 队列 + 标记已发/跳过 |

- [ ] `export.ts` 用 `xlsx` 生成 Buffer，`ctx.set` 输出 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`，文件名 `雪地胎订单-YYYYMMDD.xlsx`。
- [ ] 入库：照片经 `strapi.plugin('upload').service('upload').upload` 落库并关联；`inboundAt` 当前时间；状态 `accepted → stored`；写 timeline；触发 inbound 通知。
- [ ] 出库：`pending_outbound → completed`；写 `outboundAt`；触发 outbound_done。
- [ ] 用 curl 以 admin token 跑一遍接单→入库→出库；再用 `tire-warehouse` 账号验证只能读与入库/出库。
- [ ] Commit：`feat(tire): 后台角色策略与订单/库存/客户/内容管理接口`

**验收：** 两个角色权限矩阵与规格 §9 一致；导出文件可被 Excel 打开。

### Task 7: Admin 前端骨架与订单工作台

**Files:** `admin/src/{index.ts,pluginId.ts}`、`pages/App.tsx`、`components/{Layout,StatusTag,PhotoUploader}.tsx`、`utils/api.ts`、`pages/OrdersPage.tsx`、`translations/zh-Hans.json`

- [ ] `index.ts` 注册菜单 `组件: () => import('./pages/App')`，permissions 指向 `plugin::zhao-tire.order.read`。
- [ ] `utils/api.ts` 用 `useFetchClient()` 封装 `/api/zhao-tire/v1/admin/*`，统一错误提示。
- [ ] 订单工作台：筛选栏（状态 5 个 chip + 服务类型 + 日期区间 + 关键词）、表格（订单号/客户/车牌/服务/状态/金额/到期/操作）、分页；详情抽屉展示全部字段与 timeline。
- [ ] 入库抽屉：`PhotoUploader`（antd Upload，最多 6 张，调 Strapi upload 后拿 id）、仓位编号输入、确认入库；出库抽屉同。
- [ ] `StatusTag` 映射状态中文与颜色（仅状态语义色）。
- [ ] 按 `ctx.state.user` 角色隐藏「接单/拒绝/改单/导出」（仓库操作员只显示入库/出库/查看）。
- [ ] `npm run build` 插件 + 重启 strapi，浏览器验证完整操作链。
- [ ] Commit：`feat(tire-admin): 订单工作台与入库/出库抽屉`

**验收：** 入库后列表状态变「寄存中」，库存页同步出现该订单。

### Task 8: Admin 库存/套餐/客户/消息/内容页面

**Files:** `pages/{InventoryPage,CatalogPage,CustomersPage,MessagesPage,ContentPage}.tsx`、`pages/App.tsx`

- [ ] 库存页：Tab「在存」「临期/超期」；在存支持仓位/手机号/车牌检索；临期列表显示剩余天数（≤7 天暖橙）与批量「生成提醒」。
- [ ] 套餐页：套餐表格 + 编辑弹窗（价格以元展示、存分提交）、增值项 CRUD、支付开关（在线支付/定金）。
- [ ] 客户页：手机号聚合列表（姓名、订单数、最近订单、在存数），点开抽屉看历史订单。
- [ ] 消息页：待发队列（类型/订单号/内容/状态）、一键复制、标记已发/跳过、模板文案编辑。
- [ ] 内容页：Banner/服务说明/保障/地址/客服/协议编辑；FAQ、评价、相册的增删改与排序。
- [ ] `App.tsx` 挂 6 个子路由与左侧菜单。
- [ ] Commit：`feat(tire-admin): 库存/套餐/客户/消息/站点内容页面`

**验收：** 改套餐价格后 H5 首页价格同步；改协议正文后 H5 协议页同步。

### Task 9: 前端工程脚手架与主题

**Files:** `d:\zhao\tai\{package.json,vite.config.ts,tsconfig.json,manifest.json,pages.json,src/main.ts,src/App.vue,src/uni.scss,src/styles/tokens.scss,src/api/http.ts,src/locales/zh-CN.ts}`、`.env.development`、`.env.production`

- [ ] 用 `npx degit dcloudio/uni-preset-vue#vite-ts` 或按 `tcm-workbench` 结构创建 uni-app H5 工程，仅保留 H5 构建（`dev:h5`、`build:h5`）。
- [ ] `pages.json`：5 个页面 + `globalStyle`（导航栏标题、`#F5F7FA` 背景、`h5.maxWidth: 750`）。
- [ ] `tokens.scss` 落冰雪蓝/暖橙令牌（规格 §11.2），页面统一 `rpx`。
- [ ] `http.ts`：`BASE_URL = import.meta.env.VITE_API_BASE_URL`，统一处理 `{ code, message }`、超时与 loading。
- [ ] `zh-CN.ts`：所有固定文案（按钮、提示、FAQ 标题、订单状态、错误码文案）。
- [ ] `npm run dev:h5` 启动，确认 H5 首页可访问（`http://localhost:5173`）。
- [ ] Commit：`feat(tire-h5): uni-app H5 工程脚手架与主题令牌`

**验收：** 手机视口下无横向滚动，主题色与规格一致。

### Task 10: 首页 + 协议/FAQ 页

**Files:** `src/pages/index/index.vue`、`src/pages/content/{agreement,faq}.vue`、`src/components/{PackageCard,StickyCta,SectionHeader,FaqItem,PhotoGrid}.vue`、`src/api/site.ts`

- [ ] 首页按顺序渲染：Banner（slogan + 预约按钮）、服务介绍与仓库条件、套餐价格（可展开细则，选中高亮）、服务范围与地图跳转、服务保障、实拍相册（懒加载 + 点击预览）、用户评价、FAQ 展开、客服电话/企微二维码、底部悬浮「立即预约」。
- [ ] `PackageCard` 展示到店/上门两档价格与增值项，展开细则。
- [ ] 拨号用 `uni.makePhoneCall`；地图用 `uni.openLocation` 或 `mapUrl` 外跳。
- [ ] 协议页：`GET /agreement` 渲染 richtext；FAQ 页独立可转发。
- [ ] 手机截图（390×844）验收首屏与折叠态。
- [ ] Commit：`feat(tire-h5): 首页与协议/FAQ 页`

**验收：** 首页所有模块由接口驱动，后台改内容即时生效。

### Task 11: 预约下单页

**Files:** `src/pages/order/create.vue`、`src/components/{FormField,SlotPicker,PriceSummary,QrModal}.vue`、`src/api/order.ts`、`src/utils/format.ts`

- [ ] 表单字段与校验按规格 §6：姓名/手机号/车牌（选填）/车型/规格（常用下拉 + 自定义）/带轮毂/服务类型/取回方式/起止日期/时段（上门时）/备注/协议勾选。
- [ ] 日期：起始日 ≥ 今天；预估取回 ≤ `maxStorageDate`；上门日期 ≥ 起始日。
- [ ] `SlotPicker` 调 `GET /slots`，余量为 0 时置灰并提示。
- [ ] 实时计价调本地纯函数（与后端同规则），提交以后端金额为准并校验一致。
- [ ] 提交：生成 `clientToken`（uuid），按钮锁定；成功展示订单号 + 二维码（`qrcode` 生成查询链接），按钮「复制订单号」「查看订单」跳详情。
- [ ] 协议弹窗全文来自 `GET /agreement`。
- [ ] Commit：`feat(tire-h5): 预约下单页与实时计价/时段校验`

**验收：** 连点提交只产生一单；时段满时无法选择。

### Task 12: 订单查询与详情页

**Files:** `src/pages/order/{query,detail}.vue`、`src/components/{StatusTag,PhotoGrid}.vue`、`src/utils/{share,phone}.ts`

- [ ] 查询页：手机号 + 订单号，成功跳详情（URL 带 `no`、`phone`）。
- [ ] 详情页：状态标签（5 态 + 已拒绝/取消）、客户与车辆、费用明细、入库档案（照片九宫格、仓位、入库时间）、到期时间与剩余天数（≤7 天暖橙，超期显示超期费估算）。
- [ ] 续费：选延长月数 → 显示应付金额 → 提交（到店支付）；成功后刷新详情。
- [ ] 出库申请：填备注 → 提交 → 状态显示「审核中」；已通过转「待出库」。
- [ ] 联系客服拨号、分享订单（微信内复制链接）、保存二维码。
- [ ] Commit：`feat(tire-h5): 订单查询与详情（续费/出库申请/分享）`

**验收：** 详情页所有数据来自接口；出库申请与后台审核联动。

### Task 13: 种子数据、回归与验收物料

**Files:** `d:\zhao\strapi\plugins\zhao-tire\server\src\seed.ts`（被 bootstrap 调用）、`d:\zhao\tai\scripts\api-regression.mjs`、`tests/e2e/*.spec.ts`、`docs/manual/tire-storage-h5-manual.md`

- [ ] 种子：2 个套餐（到店/上门，含 6 个月基础价与超月单价）、1 个增值项（精存）、8 条 FAQ、3 条评价、3 张相册图、默认 config（长春净月、2027-05-01、上午/下午各 6）。
- [ ] 回归脚本覆盖：正常下单、时段满 409、幂等、日期越界、查询、续费、出库申请、后台接单/入库/出库/导出。
- [ ] Playwright：`390×844 dpr=2`，截图首页/下单/查询/详情/协议 + 后台订单工作台，存入 `docs/manual/shots/2026-11-03-tire-storage/`。
- [ ] 操作手册：C 端下单流程、后台接单/入库/出库/续费/导出、角色说明、常见问题。
- [ ] Commit：`test(tire): 种子数据/API 回归/手机视口截图/操作手册`

**验收：** 回归全 PASS，截图齐全，手册可照着走通。

### Task 14: 构建与上线

**Files:** `d:\zhao\tai\docs\deploy.md`（命令记录）、`d:\zhao\strapi\ecosystem.config.cjs`（如需）

- [ ] 本地构建：`strapi build` + `npm run build`（插件）+ `npm run build:h5`。
- [ ] 后端：本地打包插件与 dist → 上传 → 服务器 `pm2 restart`；确认 `/api/zhao-tire/v1/site` 返回 200。
- [ ] 前端：静态产物上传到站点目录 → 浏览器手机视口打开，确认 HTTPS 下接口与图片正常。
- [ ] 回归线上：下单 → 后台接单 → 入库 → 查询详情。
- [ ] Commit：`chore(tire): 构建与上线配置`

**验收：** 线上完成一笔全流程订单，无 4xx/5xx。

---

## 依赖与并行

- Task 1 → 2 → 3 → 4 串行（后端地基）
- Task 5/6 依赖 2、3，可与 4 并行
- Task 7/8 依赖 6
- Task 9 → 10 → 11 → 12 串行（前端）
- Task 13/14 依赖全部完成
- 前端与后端可在 Task 4 接口冻结后并行（接口契约以规格 §7 为准）

## 风险与技术决定

| 决定 | 原因 |
|---|---|
| 后台路由不用 `zhao-auth.is-authenticated` | 它把任意 Admin 用户映射成 `admin`，仓库操作员会拿到全权限；改用插件自有 `admin-role` 策略读原生角色 |
| 金额存分、前端只读展示 | 避免浮点误差；后端计算为准，前端提交后校验一致 |
| 幂等靠 `clientToken` 唯一索引 | 微信内弱网重复提交是高频问题；冲突即返回原订单 |
| 时段容量用「计数 + 唯一约束冲突重试」 | 单店量级足够，避免引入分布式锁 |
| 短信先落队列 | 资质未定，队列 + 一键复制保证业务不阻塞 |
| 前端不做多城市/多语言切换 | 单店单城；文案集中 `zh-CN.ts`，后续可扩 i18n |
