# 预订业务闭环 Implementation Plan（P1-P4 分阶段）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有酒店逐晚计价（S2）之上交付四子项目闭环：P1 房态库存与锁房、P2 多房价方案、P3 预订状态机与核销、P4 在线改期/取消退款。
**设计依据:** [2026-10-10-hotel-booking-closed-loop-design.md](../specs/2026-10-10-hotel-booking-closed-loop-design.md)（mockup 已定稿：A/B 双版式可配置 + 自动确认）

**关键路径**
- 后端：`d:\zhao\vendure\packages\cjk-plugin`（新增 `src/hotel/booking/` 子域）
- C 端：`d:\zhao\nshop`
- 商家端：`d:\zhao\vshop\web-admin`
- 主仓手册：`d:\zhao\docs\manual\hotel-booking\`

**环境注意（Windows PowerShell）:** 不支持 `&&`（用 `;`）；GraphQL JSON body 写临时文件 `--data-binary "@..."`；多行文本 `[IO.File]::WriteAllText` 防 BOM；本地 shop-api 以 dev-server 端口为准（探活 `http://localhost:3020/shop-api`）；TypeORM 日期列省略 type + 纯可选 Date；服务器 pnpm symlink 用绝对路径。

**每阶段收尾铁律:** 单测过 → 构建/类型检查过 → e2e 过 → commit；涉及可演示 UI 的阶段补 390×844 dpr=2 手机截图 + 手册段落。

---

## Phase P1 房态库存与锁房

### Task 1: 后端实体与服务
- Create: `src/hotel/booking/room-day.entity.ts`、`booking-lock.entity.ts`、`hotel-inventory.service.ts`、`hotel-inventory.spec.ts`
- [ ] HotelRoomDay / HotelBookingLock 实体（unique(variant,date)；varchar 日期；状态枚举 hold/booked/released）
- [ ] remaining(date) 计算：roomDay 行 ?? hotelRoomConfig.totalRooms ?? ∞；统计 hold(未过期)+booked；closed → 0
- [ ] holdVariantRange(variantId, checkIn, checkOut, orderLineId)：事务 + `SELECT…FOR UPDATE`（无行先 upsert）逐晚校验并落 hold（TTL 15min）；失败抛 HOTEL_SOLD_OUT
- [ ] confirmLocks(orderLineId)（hold→booked 回填 bookingId 占位）/ releaseLocks(orderLineId) / expireStaleHolds()
- [ ] vitest：可用性回退、关房、过期 hold、并发守卫（sqljs 单测口径）

### Task 2: 加购/改行校验接入
- Modify: `src/plugin.ts`（注册实体/服务）、新增 `src/hotel/booking/order-hook.ts`
- [ ] AddItemToOrderHook / adjustOrderLine 钩子：酒店行先 release 旧 hold 再 hold 新日期（同一事务语义），非酒店行零侵入
- [ ] 定时任务：每小时 expireStaleHolds（Vendure scheduled task 或进程内 interval，与既有插件模式一致）
- [ ] 构建 `npm run build` + e2e 探针：加购满房日期返回 HOTEL_SOLD_OUT 错误码

### Task 3: Shop/Admin GraphQL（P1 部分）
- [ ] Shop：`hotelAvailability(variantId, from, to)`（date/priceCent/dayType/remaining/closed，复用 calcNightlyPricing 出价）
- [ ] Admin：`hotelRoomDays(variantId, month)` / `setHotelRoomDay` / `batchSetHotelRoomDays`
- [ ] SDL 同步 src 与 lib；GraphQL 探针脚本验证

### Task 4: web-admin 房量日历
- Create: `src/components/hotel/RoomDayCalendar.vue`；Modify: 商品编辑变体矩阵 Tab 挂入口
- [ ] 月视图网格（日/房量/剩N/满房/关房），编辑单日、批量设置（范围+房量+关房开关）
- [ ] Admin API 封装 `src/apis/hotel-inventory.ts`；空态/加载态；390px 可用
- [ ] 截图入库 + 手册段落

### Task 5: nshop C 端余量展示（先接 A 版式数据层）
- [ ] `hotelAvailability` gql + composable `useHotelAvailability`
- [ ] DateBar 显示选中区间「余 N 间/紧张/满房」；满房日期禁选
- [ ] HOTEL_SOLD_OUT 错误码 toast（i18n zh 基准 12 语言）
- [ ] 手机视口截图（详情页余量提示）入库

## Phase P2 多房价方案 rate plan

### Task 6: 后端实体与计价
- Create: `src/hotel/booking/rate-plan.entity.ts`、`rate-plan.service.ts`、`rate-plan.spec.ts`；Modify: `hotel-order-item-price-strategy.ts`
- [ ] HotelRatePlan 实体（discount 千分比/fixed/surcharge + memberOnly + 售卖期 + cancelPolicyOverride + enabled）
- [ ] 计价策略：OrderLine.customFields.ratePlanCode 存在时套用（fixed 不叠加连住优惠，取更低者语义=固定价生效）；坏 code 回退基价
- [ ] OrderLine 新增 customFields.ratePlanCode（幂等补列，沿用酒店行模式）
- [ ] vitest：三种 adjustType × 连住优惠/节假日组合

### Task 7: Shop/Admin GraphQL（P2）
- [ ] Shop：`hotelRatePlans(variantId)`（按登录会员组过滤 memberOnly + 售卖期，附日均价预估）
- [ ] Admin：rate plan CRUD；SDL 同步
- [ ] e2e：会员/非会员可见性、下单带 ratePlanCode 价格正确

### Task 8: C 端方案选择
- Create: `ProductDetailRatePlanChips.vue`；Modify: useHotelStay/useBuyActions 传 ratePlanCode；PricePreview 按方案重算
- [x] chips 切换重算逐晚价与合计（A/B 两版式共用）
- [x] i18n 12 语言；手机截图（chips 态）

### Task 9: web-admin 方案管理
- [x] 商品编辑页「房价方案」卡：列表（名称/类型/调整/专属/启停）+ 新建/编辑表单 + 删除确认（A 行内快捷改 + B 弹层编辑融合，mockup 定稿「两者都要」）
- [x] 截图 + 手册段落（手册第 11 节；4 张 390×844 dpr=2 截图；CRUD 冒烟 ALL PASS）

## Phase P3 预订下单闭环

### Task 10: HotelBooking 实体与状态机
- Create: `src/hotel/booking/booking.entity.ts`、`booking.service.ts`、`booking.spec.ts`
- [x] 实体（字段见 spec §3.4；bookingCode 唯一 8 位数字，nullable——确认时才生成，pending 阶段不占码）
- [x] 状态机：pendingDeposit→confirmed（handleOrderUpdated 按订单状态 PartiallyPaid=首期付清/PaymentSettled=全清 确认；生成入住码+固化 cancelDeadlineAt+confirmLocks）→checkedIn（核销）→completed（离店日定时/手动）；cancelled/noShow 分支（事件订阅在 Task 11 接通）
- [x] 定时任务：hotel-booking-daily-transition（离店日 completed、过离店日 noShow 不动锁）
- [x] vitest 全流转（27 用例绿；全包 383 不破；vendure f1b52861c）

### Task 11: GraphQL 与联动
- [x] Shop：`myHotelBookings`；Admin：`hotelBookings(filter)` / `hotelBookingCheckIn(code)` / `hotelBookingComplete` / `hotelBookingForceCancel`
- [x] 下单成功（含酒店行）自动建 booking(pendingDeposit) 并把 locks.bookingId 回填（事件双路：OrderEvent 'updated' + OrderStateTransitionEvent，后者按 id 重取完整订单）
- [x] e2e：下单→订金付清→自动确认→核销→完成 全链路（5 用例全绿：确认/核销完成/满房拦截/强制取消释放/未支付 pending；vendure e231d4d0e）

### Task 12: C 端订单预订卡
- [ ] 订单详情/卡片：状态步骤条、入住码+政策倒计时、「联系酒店」；i18n 12 语言
- [ ] 手机截图（已确认态预订卡）+ 手册

### Task 13: web-admin 预订管理页
- [ ] 新页面：状态 tabs + 列表 + 核销（输码/扫入住码）/强制取消/详情
- [ ] 截图 + 手册段落

## Phase P4 在线改期/取消退款

### Task 14: 取消退款
- Create: `src/hotel/booking/cancel.service.ts`、`cancel-policy.spec.ts`
- [ ] cancelDeadline 推导（policy.freeBefore；方案级 override 优先）
- [ ] `cancelMyHotelBooking`：窗口校验→扣款额（firstNight/full）→创建 after-sales 售后单退款→releaseLocks→cancelled
- [ ] Admin 强制取消复用同服务（全退）+ vitest 金额矩阵

### Task 15: 在线改期
- [ ] `rescheduleMyHotelBooking`：仅 confirmed + rescheduleCount<1 + advanceDays/min/max 校验→重验房态→adjustOrderLine→差额多退少补（补差追加支付/退差售后）→更新 booking 日期与 cancelDeadline
- [ ] e2e：改期成功路径 + 满房拦截路径

### Task 16: C 端改期/取消入口
- [ ] 预订卡按钮接 mutation；政策提示文案（免费取消截止点倒计时）
- [ ] i18n 12 语言；手机截图（取消确认弹层/改期日期选择）

## Phase 收尾（全量）

### Task 17: 全链路 e2e + 回归
- [ ] hotel-booking e2e 包全绿：预订全生命周期/满房/取消/改期
- [ ] 既有四包 e2e 回归（payment-schedule/pre-sale/installment/rental）不破

### Task 18: 手册与截图收口
- [ ] `docs/manual/hotel-booking/`：商家配置（房量/方案）+ 预订/核销/改期取消流程 + 手机截图 ≥8 张
- [ ] 主仓 commit；三仓 push；本地构建 → 部署（vendure git pull + pm2；nshop/web-admin deploy.mjs）→ 生产探针验证 schema 含 hotelBooking/hotelAvailability/hotelRatePlans
