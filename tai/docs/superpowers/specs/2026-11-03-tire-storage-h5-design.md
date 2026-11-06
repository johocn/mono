# 雪地胎寄存预约 H5 · 设计规格

- 日期：2026-11-03
- 状态：已确认（版式 A + 冰雪蓝/暖橙），待进入实现计划
- 技术基线：复用 `d:\zhao\strapi`（Strapi 5.47 + PostgreSQL + 自定义插件体系）与 uni-app H5 前端范式

## 1. 目标与范围

### 1.1 一期目标

面向长春净月车主，提供「雪地胎寄存」的线上预约、轮胎建档、到期提醒与线上续费，替代电话沟通；商家在 Strapi 后台完成接单、入库/出库、仓位登记与报表导出。

### 1.2 一期范围

- C 端 H5 五个页面：首页、预约下单、订单查询、订单详情、协议/FAQ
- 商家后台：订单管理、仓储库存与临期预警、套餐配置、客户管理、消息模板与待发队列、站点内容维护、角色权限
- 到店支付 + 后台收款登记（在线支付仅保留接口位）
- 短信通知：全部触发点、模板、变量与待发队列；通道抽象，阿里云适配器按环境变量启用

### 1.3 明确不做（二期）

微信服务通知、优惠券/团购、会员体系、骑手派单与轨迹、多仓库切换、多城市/多租户、真实在线支付、微信登录。

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| C 端 H5 | uni-app + Vue3 + TS + Vite（`d:\zhao\tai`） | 复用 `tcm-workbench` / `vshop` 的 H5 工程与部署经验；后续可产出微信小程序 |
| 后台 | Strapi Admin 内嵌自定义插件 `zhao-tire`（React + antd） | 复用 `zhao-website` 后台范式、Strapi 账号体系与 RBAC，无需另起一套后台站点 |
| 数据 | PostgreSQL（复用现有实例与连接配置） | 订单/库存需事务与唯一约束 |
| 图片 | Strapi Upload + `zhao-oss` 同步至阿里云 OSS | 轮胎照片长期保存，沿用现有 OSS 配置 |
| 报表 | `xlsx`（Strapi 工程已有依赖） | 后台直接导出订单明细 |
| 二维码 | 前端 `qrcode` 生成（内容为订单查询链接） | 不额外占用服务端能力 |
| 通知 | 插件内 `sms-provider` 接口 + `aliyun` 适配器（env 开关） | 一期落待发队列，资质就绪即开 |

## 3. 架构

```text
微信内置浏览器
  └─ uni-app H5（静态站点）
        │  HTTPS /api/zhao-tire/*（C 端自定义路由，auth:false）
        ▼
  Strapi 5.47
    ├─ plugins/zhao-tire
    │    ├─ server: content-types / 公共 API / 后台 API / 服务层 / cron / sms
    │    └─ admin: 订单工作台、库存、套餐、客户、消息、站点内容
    ├─ plugins/zhao-oss   （图片同步 OSS）
    ├─ plugins/zhao-auth  （后台账号与鉴权复用）
    └─ PostgreSQL
```

- 前端工程：`d:\zhao\tai`，API 基址由 `.env` 的 `VITE_API_BASE_URL` 注入，开发默认 `http://localhost:1337`
- 后端插件：`d:\zhao\strapi\plugins\zhao-tire`，在 `config/plugins.ts` 注册
- 部署：本地构建，服务器只做静态目录替换与 `pm2 restart`（不在服务器构建）

## 4. 数据模型

金额统一以「分」存储（int），展示端转元。

### 4.1 `tire-package`（寄存套餐）

| 字段 | 类型 | 说明 |
|---|---|---|
| name | string | 套餐名，如「标准寄存」 |
| code | uid | 唯一标识 |
| baseMonths | integer | 基础存期月数，默认 6 |
| storePrice | integer | 到店送存价（分） |
| pickupPrice | integer | 上门取送价（分，含上门费） |
| extraMonthPrice | integer | 超出基础存期后的月单价（分） |
| overdueDayPrice | integer | 超期按天单价（分） |
| durationText | string | 展示用存期文案，如「至 2027-05-01」 |
| highlights | json | 套餐细则条目数组 |
| enabled | boolean | 是否上架 |
| sort | integer | 排序 |

### 4.2 `tire-addon`（增值项）

`name` / `code` / `price`（分）/ `unitText` / `enabled` / `sort`。一期预置「精存（打油缠保鲜膜）」。

### 4.3 `tire-order`（订单，主表）

| 分组 | 字段 |
|---|---|
| 标识 | `orderNo`（唯一）、`clientToken`（唯一，幂等）、`source`(h5) |
| 客户 | `customerName`、`phone`、`plateNo`、`carType`(sedan/suv/pickup)、`tireSpec`、`withWheelRim`(bool) |
| 服务 | `serviceType`(store/pickup)、`returnMethod`(pickup_delivery)、`pickupDate`、`pickupSlot`(morning/afternoon) |
| 存期 | `storageStartDate`、`expectedReturnDate`、`expireAt`、`months` |
| 费用 | `packageSnapshot`(json)、`addons`(json)、`amountPackage`、`amountAddon`、`amountTotal`、`paymentMethod`(store_pay/deposit/full)、`paymentStatus`(unpaid/deposit_paid/paid)、`paidAmount` |
| 状态 | `status`、`outboundRequestStatus`(none/pending/approved/rejected)、`outboundRequestedAt`、`outboundNote` |
| 仓储 | `inboundPhotos`(media×n)、`outboundPhotos`(media×n)、`locationCode`、`inboundAt`、`outboundAt`、`storageOperator`(admin user rel) |
| 其他 | `note`、`agreementAcceptedAt`、`renewals`(json)、`timeline`(json)、`createdAt` |

`renewals` 条目：`{ months, amount, paymentMethod, paidAt, newExpireAt, operatorId }`
`timeline` 条目：`{ at, event, operatorId?, detail? }`

### 4.4 `tire-sms-log`（通知队列）

`order`(rel) / `type`(order_created|accepted|inbound|due_7|due_3|outbound_done|manual) / `phone` / `content` / `status`(pending|sent|skipped) / `sentAt` / `operator`(rel)。

### 4.5 `tire-config`（单类型）

Banner 标题/副标题/图、服务说明（richtext）、仓库条件、保障条目（json）、服务范围文案、仓库地址与经纬度、地图链接、客服电话、企微二维码（media）、每日上门上限（上午/下午）、在线支付开关、定金模式开关、定金比例、寄存协议正文（richtext）、`maxStorageDate`（默认 2027-05-01）、公告。

### 4.6 内容类

- `tire-faq`：`question`、`answer`、`sort`、`enabled`
- `tire-review`：`nickname`、`content`、`rating`、`showOnHome`、`sort`
- `tire-gallery`：`image`、`caption`、`sort`

## 5. 订单状态机与流转

```text
待接单 pending_accept
  ├─ 接单 → 待取胎 accepted（到店单展示为「待到店」）
  │     └─ 入库登记（照片 + 仓位）→ 寄存中 stored
  │           ├─ 出库申请 approved → 待出库 pending_outbound
  │           │     └─ 出库登记（照片）→ 已完成 completed
  │           └─ 续费 → 寄存中（expireAt 顺延）
  ├─ 拒绝 → 已拒绝 rejected
  └─ 用户/后台取消 → 已取消 canceled
```

- **出库申请**：用户提交 → `outboundRequestStatus=pending`（状态不变），后台「通过」后转 `pending_outbound`，「驳回」回到 `none` 并记录备注
- **续费**：只允许 `stored` / `pending_outbound` 状态的订单；提交后 `renewals` 追加记录，`expireAt` 顺延，支付状态按到店支付登记更新
- **超期**：`expireAt < 今天` 时详情页显示超期天数与超期费用估算（按套餐 `overdueDayPrice`），后台进入临期/超期清单，不做自动处置（协议中约定无主处理由商家线下执行）

## 6. 计价与校验规则

1. 计价：`amountPackage` = 按服务类型取 `storePrice` 或 `pickupPrice`；`months` > `baseMonths` 时追加 `(months - baseMonths) × extraMonthPrice`；`amountAddon` = 所选增值项价格之和；`amountTotal = amountPackage + amountAddon`
2. `storageStartDate` ≥ 今天；`expectedReturnDate` > `storageStartDate` 且 ≤ `maxStorageDate`
3. `pickupDate` 仅 `serviceType=pickup` 时可填，且不得早于 `storageStartDate`；`pickupSlot` 必填
4. 上门时段容量：按「`pickupDate` + `pickupSlot`」统计未取消订单数，与 config 的上午/下午上限比较；超限返回 409 并给出可替代时段
5. 幂等：`clientToken` 由前端 `uuid` 生成，唯一索引命中时直接返回已创建订单
6. 协议：必须勾选，落库 `agreementAcceptedAt`
7. 手机号展示脱敏：`138****1234`；查询详情需手机号精确匹配订单号

## 7. C 端接口（`/api/zhao-tire`，`auth:false` 自定义路由）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/site` | 站点聚合：config + 套餐 + 增值项 + FAQ + 评价 + 相册 |
| GET | `/slots?date=YYYY-MM-DD` | 当日上/下午剩余可约数 |
| POST | `/orders` | 创建订单（校验见 §6） |
| GET | `/orders/:orderNo?phone=` | 订单详情（脱敏手机号、费用明细、入库档案、剩余天数） |
| POST | `/orders/:orderNo/renew` | `{ months }` → 续费记录与应付金额 |
| POST | `/orders/:orderNo/outbound` | `{ note }` → 出库申请 pending |
| GET | `/agreement` | 协议正文 |
| GET | `/faqs` | FAQ 列表 |

错误返回统一 `{ code, message }`，`code` 枚举：`VALIDATION_FAILED`、`SLOT_FULL`、`ORDER_NOT_FOUND`、`PHONE_MISMATCH`、`DUPLICATE_REQUEST`、`STATE_INVALID`。

## 8. 商家后台（Strapi Admin 插件页）

| 页面 | 能力 |
|---|---|
| 订单管理 | 筛选（状态/时间/服务类型/区域 上门或到店）、搜索（手机号/车牌/订单号）、详情抽屉、接单、拒绝、修改、入库（多图上传 + 仓位编号）、出库（上传照片）、收款登记、导出 Excel |
| 仓储库存 | 在存清单（按仓位/手机号/车牌检索）、临期与超期预警、批量勾选生成提醒记录 |
| 套餐配置 | 套餐 CRUD（含超时单价、上门费、基础存期）、增值项 CRUD、在线支付/定金开关 |
| 客户管理 | 按手机号聚合客户，查看历史寄存订单 |
| 消息模板 | 模板文案编辑（变量：姓名、订单号、到期时间、剩余天数）、待发队列、复制/标记已发、批量提醒 |
| 站点内容 | Banner、服务说明、保障、服务范围、仓库地址、客服信息、评价、FAQ、相册、协议正文 |

## 9. 权限模型

插件 action 与角色：

| action | 管理员 | 仓库操作员 |
|---|---|---|
| `order.read` | ✓ | ✓ |
| `order.accept` / `order.reject` / `order.update` | ✓ | – |
| `order.inbound` / `order.outbound` | ✓ | ✓ |
| `order.export` | ✓ | – |
| `package.manage` / `config.manage` / `content.manage` | ✓ | – |
| `customer.read` / `sms.manage` | ✓ | – |

- 角色在 Strapi「设置 → 用户与权限 → 角色」中分配，仓库操作员为独立角色
- 后台前端按权限隐藏按钮，服务端路由二次校验，不依赖前端隐藏

## 10. 通知规则

| 触发 | type | 文案变量 |
|---|---|---|
| 下单成功 | order_created | 姓名、订单号 |
| 商家接单 | accepted | 姓名、订单号、上门时段 |
| 入库完成 | inbound | 姓名、订单号、仓位、到期时间 |
| 到期前 7 天 | due_7 | 姓名、订单号、到期时间、剩余天数 |
| 到期前 3 天 | due_3 | 姓名、订单号、到期时间、剩余天数 |
| 出库完成 | outbound_done | 姓名、订单号 |
| 后台手动 | manual | 自定义 |

- 每天 09:00 cron 扫描 `expireAt` 为 7 天/3 天后的在存订单，生成 pending 记录（同订单同类型当日去重）
- 通道：`sendSms({phone, content})` 接口；`SMS_PROVIDER=aliyun` 时走阿里云（读 `ALIYUN_SMS_*` 环境变量），未配置时仅落队列
- 后台一键复制文案并标记已发，用于短信资质未就绪阶段

## 11. C 端页面与设计令牌

### 11.1 页面

| 页面 | 路径 | 关键交互 |
|---|---|---|
| 首页 | `pages/index/index` | 套餐卡展开细则、FAQ 展开、底部悬浮「立即预约」、地图跳转、客服拨号 |
| 预约下单 | `pages/order/create` | 车型/规格选择、服务类型切换、日期限制、时段置灰、实时计价、协议弹窗、防重复提交、成功展示订单号与二维码 |
| 订单查询 | `pages/order/query` | 手机号 + 订单号，成功跳详情 |
| 订单详情 | `pages/order/detail` | 状态标签、费用明细、入库档案（照片/仓位/时间）、剩余天数、续费、出库申请、拨号、分享 |
| 协议与 FAQ | `pages/content/*` | 协议全文、FAQ 展开，可单独转发 |

组件：`PackageCard`、`StickyCta`、`SectionHeader`、`FormField`、`SlotPicker`、`PriceSummary`、`StatusTag`、`PhotoGrid`、`FaqItem`、`QrModal`。

首页模块顺序：Banner（slogan + 预约按钮）→ 服务介绍与仓库条件 → 套餐价格 → 服务范围与仓库地址/地图 → 服务保障 → 实拍相册 → 用户评价 → FAQ → 客服电话与企微二维码 → 底部悬浮「立即预约」。

### 11.2 设计令牌（冰雪蓝 + 暖橙）

| 令牌 | 值 |
|---|---|
| 主色 `--color-primary` | `#2563EB` |
| 主色浅底 `--color-primary-soft` | `#DBEAFE` |
| 主色深文字 `--color-primary-text` | `#1E3A8A` |
| 强调色 `--color-accent` | `#E0523F`（价格、剩余天数、临期标签） |
| 页面底 `--color-bg` | `#F5F7FA` |
| 卡片面 `--color-surface` | `#FFFFFF` |
| 正文 `--color-text` | `#171717` |
| 次要文字 `--color-text-muted` | `#52525B` |
| 分割线 `--color-border` | `rgba(23,23,23,0.12)` |
| 圆角 | `8px` / 卡片 `12px` / 胶囊 `999px` |

- 尺寸按 `rpx` 实现，设计基准 750；真机以 390×844 视口验收
- 主 CTA 用主色实底，暖橙只做强调，避免白字对比度不足
- 文案集中存放在 `src/locales/zh-CN.ts` 单一字典，预留后续 i18n

## 12. 非功能与安全

- 移动端优先，图片懒加载，首屏关键资源 ≤ 2 个请求；H5 兼容 iOS/Android 微信内置浏览器
- PC 预览：仅做居中 `max-width: 750px` 容器与宽度自适应，不单独开发 PC 版式
- 表单按钮锁 + `clientToken` 幂等，防重复下单
- 图片走 OSS，订单与库存持久化在 PostgreSQL，关键操作写 `timeline`
- 手机号在 C 端展示脱敏；后台按权限可见完整手机号
- 协议免责文案由业务方确认合规；协议未勾选不可提交
- 上传限制：单图 ≤ 10MB，仅图片类型；入库/出库照片最少 1 张

## 13. 测试与交付

- API 回归脚本：创建（含时段满、幂等、日期越界）→ 接单 → 入库 → 续费 → 出库申请 → 审核 → 出库 → 完成 → 导出
- 前端 e2e：Playwright 390×844、dpr=2 截图，覆盖五个页面与下单主流程；截图存入 `docs/manual/shots/2026-11-03-tire-storage/`
- 操作手册：`docs/manual/tire-storage-h5-manual.md`（C 端下单、后台接单/入库/出库/导出）
- 构建：前端 `npm run build:h5` 产出静态包；后端 `strapi build` 后本地打包，服务器解压 + `pm2 restart`

## 14. 风险与对策

| 风险 | 对策 |
|---|---|
| 上门时段并发超卖 | 唯一约束 + 事务内计数，冲突返回 `SLOT_FULL` |
| 短信资质未就绪 | 队列 + 一键复制/标记已发，通道开关后补发 |
| 轮胎规格自由输入不规范 | 提供常用规格下拉 + 允许自定义输入 |
| 无主轮胎处置争议 | 协议写明到期提醒、超期计费与处理方式，留痕 `timeline` |
| Strapi Admin 插件构建耗时 | 复用 `zhao-website` 脚手架与构建脚本，只新增页面与路由 |
