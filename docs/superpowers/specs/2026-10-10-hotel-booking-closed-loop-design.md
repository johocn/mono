# 预订业务闭环（房态库存/锁房 · 多房价方案 · 预订状态机 · 改期取消退款）设计文档

**日期**：2026-10-10
**接续**：`vshop/docs/superpowers/specs/2026-09-14-hotel-room-variant-design.md`（S1 数据模型 + S4 前端版式已交付）、`2026-09-30-hotel-order-line-and-tenant-brand-design.md`（S2 逐晚计价入订单已交付）、统一支付计划（预订金/分期/租赁，2026-10-08/09 已上线）
**本设计范围**：S3 预订下单闭环 + 原 spec §8 挂起的三个深度能力（房态实时库存与锁房、多房价方案、在线改期/取消退款）
**mockup 定稿**（2026-10-10 用户确认）：
- C 端房态日历：**A/B 双版式都做、后台可配置**（接入四级可回退风格体系，作为积木块）
- 确认模式：**自动确认**（订金付清自动转「已确认」，商家只做到店核销）

---

## 1. 目标与总览

把酒店预订从「逐晚计价下单」补齐为完整业务闭环：

```
选房下单(hold 15min) → 待付订金 → 已确认(锁转预订) → 到店入住(核销) → 离店完成
        ↘ 超时未支付 → 自动释放          ↘ 取消/退款(按政策)    ↘ 在线改期(重验房态·多退少补)
```

四个子项目（实施顺序 = 依赖顺序）：
- **P1 房态库存与锁房**：按房型逐日房量 + 下单锁房 + 防超订（其余三者的地基）
- **P2 多房价方案 rate plan**：折扣/固定/加价 × 会员/协议专属，C 端方案 chips 切换
- **P3 预订下单闭环**：HotelBooking 状态机 + 入住码核销 + 衔接预订金支付计划
- **P4 在线改期/取消退款**：按取消政策自助取消退款、自助改期

**非目标（YAGNI）**：物理房间号指派（锁到房型不锁具体房间）、OTA 渠道分销、发票、连续住客画像。

## 2. 关键决策记录

| # | 决策 | 结论 |
|---|---|---|
| 1 | 库存粒度 | 房型（变体）× 日，不锁具体房间号 |
| 2 | 占用来源 | 显式锁房单（不反查订单行）：状态 hold→booked→released，职责单一、可审计、并发可控 |
| 3 | 房量缺省 | 无 `HotelRoomDay` 行时回退 `hotelRoomConfig.totalRooms`；两者都无 → 视为不限房（沿用现状） |
| 4 | 锁房时机 | `AddItemToOrderHook`：加购/改行时事务内 hold（15 分钟 TTL），支付成功转 booked，取消/退款/超时释放 |
| 5 | rate plan 存储 | 独立实体 `HotelRatePlan`（变体维度），不改 `hotelRoomConfig` 快照语义；计价策略按 OrderLine 的 `ratePlanCode` 实时套用 |
| 6 | 确认模式 | 自动确认：订金 PaymentSettled 事件 → booking confirmed；未启用支付计划的房型 = 全额付清即确认 |
| 7 | 核销端 | V1 仅 web-admin「预订管理」扫/输入住码；不做小程序/POS 端 |
| 8 | 退款通道 | 复用 after-sales-plugin：取消预订 = 创建售后单（类型 cancel），金额按取消政策计算 |
| 9 | C 端日历版式 | A 平铺 / B 弹层双版式都做，`DetailConfig.hotel.calendarMode: 'inline' \| 'sheet'`，缺省 `inline`；两个版式共用同一日历核心组件（积木式） |
| 10 | TypeORM 日期列 | 沿用跨库铁律：省略 type + 纯可选 Date（`?: Date`），字符串日期一律 `YYYY-MM-DD` 存 varchar |

## 3. 数据模型（cjk-plugin `src/hotel/`）

### 3.1 HotelRoomDay（房量日历）
| 字段 | 类型 | 说明 |
|---|---|---|
| productVariantId | ID! | 房型（变体） |
| date | varchar(10)! | `YYYY-MM-DD`（入住当晚归属） |
| totalRooms | int! | 当日总房量 |
| closed | boolean! | 关房（主动停售），默认 false |
| 约束 | unique(productVariantId, date) | |

### 3.2 HotelBookingLock（锁房单）
| 字段 | 类型 | 说明 |
|---|---|---|
| productVariantId | ID! | 房型 |
| date | varchar(10)! | 被占用的晚 |
| orderLineId | ID! | 来源订单行 |
| bookingId | ID? | P3 建立后回填 |
| status | varchar! | `hold` / `booked` / `released` |
| holdExpiresAt | Date? | hold 过期时间（15min）；booked/released 为 null |
| 约定 | | 一张订单行 × N 晚 = N 行 lock；released 保留作审计，不参与占用统计 |

### 3.3 HotelRatePlan（房价方案）
| 字段 | 类型 | 说明 |
|---|---|---|
| productVariantId | ID! | 归属房型 |
| code | varchar! | 方案码（行内唯一），下单写入 OrderLine.customFields.ratePlanCode |
| name | varchar! | 展示名（支持 LocalizedText，走既有多语言机制） |
| adjustType | varchar! | `discount`（×rate）/ `fixed`（固定每晚价）/ `surcharge`（+每晚加价） |
| adjustValue | int! | discount 存千分比（900=×0.9）；fixed/surcharge 存分 |
| memberOnly | varchar? | 会员组 code，null=全员可见 |
| dateFrom/dateTo | varchar(10)? | 售卖期，null=长期 |
| cancelPolicyOverride | JSON? | 覆盖房型取消政策 |
| enabled | boolean! | 启停 |
| 约束 | unique(productVariantId, code) | |

### 3.4 HotelBooking（预订单，per 订单行）
| 字段 | 类型 | 说明 |
|---|---|---|
| orderLineId / orderId / orderCode / channelToken | ID/varchar | 关联与租户隔离 |
| productVariantId | ID! | 房型 |
| checkIn / checkOut | varchar(10)! | 入住/离店日 |
| nights | int! | 晚数 |
| status | varchar! | `pendingDeposit` → `confirmed` → `checkedIn` → `completed`；分支 `cancelled` / `noShow` |
| bookingCode | varchar(8)! | 入住码（8 位数字，唯一，确认时生成） |
| ratePlanCode | varchar? | 套用的房价方案 |
| totalCent | int! | 成交总额（分） |
| guestName / guestPhone | varchar? | 入住人（下单 customFields 带入，缺省取订单收货人） |
| cancelDeadlineAt | Date? | 免费取消截止点（由取消政策 + checkIn 推导，确认时固化） |
| confirmedAt / checkedInAt / completedAt / cancelledAt | Date? | 各状态时间戳 |

**状态机流转（自动确认）**
- 创建：订单创建/含酒店行支付计划启动 → `pendingDeposit`
- → `confirmed`：监听订单支付事件；启用支付计划时 = 首期（预订金）PaymentSettled；未启用 = 订单 PaymentSettled。生成入住码 + 固化 cancelDeadlineAt + hold 批量转 booked
- → `checkedIn`：admin 核销（bookingCode）；前置校验 status=confirmed 且当日 ∈ [checkIn, checkOut)
- → `completed`：离店日 0 点定时任务自动流转（或核销离店操作）
- → `cancelled`：C 端自助取消（P4，走政策退款）或 admin 强制取消；释放 locks
- → `noShow`：checkOut 日结束仍未 checkIn 的定时流转（V1 仅记录，不自动扣款）

## 4. 可用性与防超订（P1 核心）

```
remaining(date) = totalRooms(roomDay 行 ?? hotelRoomConfig.totalRooms ?? ∞)
                − count(lock: status∈{hold(未过期), booked} AND date=当日 AND variant=房型)
```
- **校验点 1**：`AddItemToOrderHook`（cjk-plugin）——酒店行加购/调整时，逐晚校验 remaining ≥ 变更后占用增量，不满足 → 抛 `HOTEL_SOLD_OUT`（附可订区间建议）
- **校验点 2**：hold 落库与校验在同一事务；对涉及日期的 `HotelRoomDay` 行 `SELECT … FOR UPDATE`（无行时先 upsert 缺省行）防并发超订
- **过期释放**：hold 过期不物理删；`remaining` 统计只算未过期 hold；另有定时任务每小时把过期 hold 置 released（清理统计面）
- **订单行变更**：`adjustOrderLine`（改日期/数量）= 先释放旧 hold 再按新日期 hold，校验失败整体回滚

## 5. 计价扩展（P2）

- 逐晚基价仍由 `calcNightlyPricing(hotelRoomConfig, checkIn, checkOut)` 产出（节假日/周末/连住优惠）
- rate plan 套用（策略层内，OrderLine.customFields.ratePlanCode 存在时）：
  - `discount`：每晚 `price × adjustValue/1000`
  - `fixed`：每晚 `adjustValue`（连住优惠不再叠加，取两者更低者语义=固定价直接生效）
  - `surcharge`：每晚 `price + adjustValue`
- C 端 `hotelRatePlans(variantId)`：按登录态过滤 memberOnly（会员组 code 比对），返回各方案的「日均价预估」
- 会员组来源：沿用 vcash-pos myMemberPrice 的会员等级判定通道，避免新造一套会员模型

## 6. GraphQL 接口清单

**Shop API**
- `hotelAvailability(variantId, from, to): [HotelDay!]!`（date/priceCent/dayType/remaining/closed）
- `hotelRatePlans(variantId): [HotelRatePlanPublic!]!`
- `myHotelBookings(options): HotelBookingList`
- `cancelMyHotelBooking(bookingId, reason?): HotelBooking`（P4：校验政策→创建售后退款→取消）
- `rescheduleMyHotelBooking(bookingId, checkIn, checkOut): HotelBooking`（P4：重验房态→改行→差额处理）

**Admin API**
- `hotelRoomDays(variantId, month): [HotelRoomDay!]!` / `setHotelRoomDay(...)` / `batchSetHotelRoomDays(...)`
- `hotelRatePlans(variantId)` CRUD（create/update/delete）
- `hotelBookings(filter, options): HotelBookingList` / `hotelBookingCheckIn(code)` / `hotelBookingComplete(id)` / `hotelBookingForceCancel(id, reason)`

## 7. 前端设计

### 7.1 nshop C 端
- **DetailConfig 扩展（L2）**：`hotel: { calendarMode: 'inline' | 'sheet' }`，四级回退：块配置 → DetailConfig.hotel → 内建默认 `inline`
- **新积木块**（`product-detail/`，两个版式共用核心）：
  - `ProductDetailRoomCalendar`：日历核心（月视图、余量/满房/节假日价、连住优惠提示、日期选择）
  - 版式 A：`calendarMode=inline` → 日历卡片常驻（现 DateBar 位置扩展）
  - 版式 B：`calendarMode=sheet` → 日期条 + 底部弹层（弹层内日历 + 方案 + 确定）
  - `ProductDetailRatePlanChips`：方案选择 chips（切换即重算逐晚价）
- **下单链路**：useHotelStay/useBuyActions 增传 `ratePlanCode`；下单前置检查余量错误码文案（i18n）
- **订单中心**：订单详情/卡片新增预订卡（状态步骤条、入住码、政策倒计时、改期/取消按钮）；i18n zh 基准 12 语言同步
- **余量错误**：加购返回 HOTEL_SOLD_OUT → toast 引导改期

### 7.2 web-admin 商家端
- 商品编辑页（变体矩阵 Tab）新增三个入口：
  1. **房量日历**：变体维度月视图，格内房量/剩 N/满房/关房，批量设置（日期范围+房量+关房）
  2. **房价方案**：方案列表卡（名称/类型/调整值/专属/启停）+ 新建/编辑表单
- 新页面 **预订管理**：状态 tab（全部/待确认/已确认/已入住/待退退款）+ 列表行（客人/日期/晚数/方案/状态）+ 操作（核销入住/强制取消/详情）；核销支持输码或扫入住码

## 8. P4 取消与改期规则

- **取消窗口**：cancelPolicy（房型级）或 ratePlan.cancelPolicyOverride（方案级优先）：
  - `freeBefore`：checkIn 前 N 小时免费；`freeDeadlineAt = checkIn 00:00 − N 小时`
  - 超时扣首晚或全款（policy.partial = firstNight | full）
- **退款金额**：已付总额 − 扣除额 → 创建 after-sales 售后单（类型 cancel，原因自动带「预订取消」）→ 走既有退款链路；释放该行全部 lock → booking.cancelled
- **改期**：仅 `confirmed` 状态、且新日期满足 advanceDays/minNights/maxNights；重验房态 → adjustOrderLine（新日期/新晚数）→ 新旧价差「多退少补」（补差走追加支付，退差走售后）；每单 V1 限改 1 次（记录 rescheduleCount）

## 9. 测试与交付口径

- **单测**（vitest，cjk-plugin）：可用性计算（含缺省回退/关房/hold 过期）、防超订并发、rate plan 三种 adjustType、状态机全流转、取消政策金额计算
- **e2e**：沿用既有四包模式新增 hotel-booking 包：加购锁房→支付→确认→核销→完成；取消退款；改期；满房拦截
- **截图**：390×844 dpr=2 手机视口（详情页 A 版式、B 版式弹层、订单预订卡、后台房量/预订管理），入库 `docs/manual/shots/`
- **手册**：`docs/manual/hotel-booking/`（商家配置流程 + C 端预订流程 + 核销流程）
- **部署**：本地构建；vendure 走 git pull + pm2 restart；nshop/web-admin 走 scripts/deploy.mjs；服务器 pnpm symlink 用绝对路径（既有铁律）
