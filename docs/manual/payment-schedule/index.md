# 支付计划（预订 / 分期 / 租赁）操作手册

> 适用站点：C 端商城（nshop）｜服务端：Vendure payment-schedule-plugin + pre-sale / installment / rental 三计划插件
> 覆盖内容：三场景期次模型、Admin 配置（GraphQL）、C 端交互（含手机截图）、调度管理、测试用例清单。

---

## 目录

- [1. 功能说明](#1-功能说明)
- [2. Admin 配置（GraphQL 调用示例）](#2-admin-配置graphql-调用示例)
- [3. 调度管理与售后处置](#3-调度管理与售后处置)
- [4. C 端交互（手机视口）](#4-c-端交互手机视口)
- [5. 测试用例清单](#5-测试用例清单)
- [6. 常见问题](#6-常见问题)

---

## 1. 功能说明

「支付计划」把一笔订单的价款拆成多个**期次（PaymentScheduleItem）**，按触发条件逐期解锁支付。三场景共用同一套期次模型与组件：

| 场景 | 期次结构 | 发货门控（deliveryGate） | COD 支持 |
|------|----------|--------------------------|----------|
| 预订（预售定金） | 定金期（payable）+ 尾款期（locked，商家手动/日期/成团开启） | `all_paid`（付清才发货；仅存在未支付且 allowCod 期次时 COD 豁免放行） | 仅尾款期可配 |
| 分期 | 首付期 + N 期分期款（interval 周期触发） | `first_period`（首付到账即可发货） | 仅分期期次可配 |
| 租赁 | 押金期 + 租金期（prepaid 下单一次付清 / postpaid 按周期后付） | `deposit_paid`（押金到账即可发货） | 仅租金期次可配 |

期次状态机：`locked（未开启）→ payable（待支付）→ paid（已支付）`；违约侧 `overdue（已逾期，按天计滞纳金）→ forfeited（已没收）`；另有 `refunded / waived`。

法律性质（depositRule.kind）决定违约后果：

| 性质 | 罚则 |
|------|------|
| `legal_deposit` 定金 | 买方逾期无权要求返还定金（《民法典》586-588 条）；卖方违约**双倍返还** |
| `earnest` 订金 | 买方超时按 `earnestRefundPolicy` 全额或扣比例手续费退还 |
| `down_payment` 首付 | 货款一部分，无担保罚则 |
| `security_deposit` 押金 | 担保租赁履约：逾期滞纳金、损坏扣押金、还物验收后退还 |

---

## 2. Admin 配置（GraphQL 调用示例）

> Admin API 均为 `POST /admin-api`，带 `Authorization: Bearer <token>` 与渠道头 `vendure-token`。金额单位一律**分**。

### 2.1 预售活动（pre-sale-plugin）

`createPreSaleActivity` / `updatePreSaleActivity` 支持的定金预售新字段：

| 字段 | 取值 | 说明 |
|------|------|------|
| `depositKind` | `legal_deposit` / `earnest` | 定金（有罚则）/ 订金（可退） |
| `tailTriggerType` | `date` / `group_buy` / `manual` | 尾款开启方式：到货日期 / 成团事件 / 商家手动 |
| `tailWindowHours` | 小时数 | 尾款支付窗口 |
| `graceHours` | 小时数 | 宽限期（逾期滞纳金起算前） |
| `earnestRefundPolicy` | `{ onTimeout: full / partial, partialRate }` | 订金超时退款策略（depositKind=earnest 生效） |
| `shipDeadlineAt` | 时间戳 | 承诺发货截止（超期触发 seller_breach） |
| `agreementVersion` | 字符串 | 预售/支付协议版本号（C 端弹窗展示） |

```graphql
mutation {
  createPreSaleActivity(input: {
    name: "定金预售"
    mode: deposit
    startAt: "2026-10-01T00:00:00.000Z"
    endAt: "2026-10-31T00:00:00.000Z"
    presalePrice: 99900        # 预售价（分），0 = 原价
    depositAmount: 19980       # 定金（分）
    totalStock: 50
    limitPerUser: 1
    productId: "51"
    variantId: "53"
    depositKind: "legal_deposit"
    tailTriggerType: "manual"
    tailWindowHours: 72
    graceHours: 72
    agreementVersion: "v1.0"
  }) { id status }
}
```

> **合规硬校验**：`depositAmount` 超过基准价（presalePrice，为 0 时取变体价）20% 时保存被拒；恰好 20% 可保存。

成团开启尾款时需另配 `tailTriggerType: "group_buy"` + `groupBuyActivityId` 指向团购活动。

### 2.2 分期计划（installment-plugin）

| 字段 | 约束 | 说明 |
|------|------|------|
| `downPaymentRatio` | 0–90 | 首付比例（整数百分比；0 = 无首付） |
| `periods` | 1–36 | 分期期数 |
| `intervalUnit` | day / week / month | 周期单位 |
| `intervalCount` | ≥0 | 间隔数（0 = 立即应付，>0 = 每隔 N 个单位一期） |
| `allowCod` | boolean | 分期期次是否支持货到付款 |

```graphql
mutation {
  createInstallmentPlan(input: {
    name: "首付20%分3期"
    variantId: 54
    downPaymentRatio: 20
    periods: 3
    intervalUnit: "month"
    intervalCount: 1
    allowCod: false
    enabled: true
  }) { id }
}
```

### 2.3 租赁计划（rental-plugin）

| 字段 | 约束 | 说明 |
|------|------|------|
| `depositAmount` | >0 | 押金（security_deposit 损失填补语义，不适用定金 20% 上限） |
| `rentAmount` / `rentUnit` | >0；day / week / month | 单位租金 |
| `prepaidOrPostpaid` | prepaid / postpaid | prepaid = 租金下单一次付清（rentAmount × periods）；postpaid = 按周期后付 |
| `allowBuyout` + `buyoutPrice` | buyoutPrice ≥0 | 可买断；实际买断款 = max(0, buyoutPrice − 已付租金) |

```graphql
mutation {
  createRentalPlan(input: {
    name: "押金500月租100"
    variantId: 55
    depositAmount: 50000
    rentAmount: 10000
    rentUnit: "month"
    prepaidOrPostpaid: "postpaid"
    allowBuyout: true
    buyoutPrice: 80000
    allowCod: true
    enabled: true
  }) { id }
}
```

> 顾客侧查询入口：`activePreSaleActivities`、`installmentPlans(variantId)`、`rentalPlans(variantId)` 均只返回启用中的计划/活动。

---

## 3. 调度管理与售后处置

计划与期次的 Admin 查询 / 处置入口（payment-schedule-plugin）：

```graphql
# 计划列表
query {
  paymentSchedules(options: { take: 20 }) {
    items { id orderId scenario status deliveryGate paidTotal totalAmount }
    totalItems
  }
}

# 手动开启尾款窗口（tailTriggerType=manual 的预订单）
mutation { openTailWindow(scheduleId: "4") { id status items { seq status } } }

# 确认卖家违约（超期未发货；执行双倍返还定金）
mutation { confirmSellerBreach(scheduleId: "4") { id status breachType } }

# COD 签收收款确认（Authorized 授权期次 → paid 收口）
mutation { confirmCodReceived(orderId: "49") { id status } }

# 租赁还物退押（押金期次置 refunded）
mutation { releaseRentalDeposit(orderId: "50") { id status } }

# 手动触发一次调度扫描（日期解锁/逾期/发货违约）；亦为定时任务通道
mutation { runScheduleScan { activated overdue shipBreaches } }
```

- 期次支付走 `paySchedulePeriod(orderId, seq, method)`：支付方式 Settled 即收口；COD handler 返回 Authorized 时留待 `confirmCodReceived` 确认。
- 买家违约处置：`legal_deposit` 没收 + 订单取消 + 库存释放；`earnest` 经 `cancelSchedule` 按退款策略处理。

---

## 4. C 端交互（手机视口）

顾客登录后，在 **我的 → 订单详情** 页查看支付计划。以下截图均为 390×844（dpr=2）真实视口。

### 4.1 预订单：定金已付、尾款待商家开启

订单详情页底部展示「支付计划」条：定金期已支付，尾款期未开启并显示触发条件（`manual` 类型显示「待商家开启」，日期/成团类型显示对应文案）。

![预订订单支付计划条](images/order-schedule-bar.png)

商家执行 `openTailWindow` 后尾款期翻为「待支付」，顾客即可在线支付。

### 4.2 分期单：首付 + 3 期

分期单计划条默认展示前两期，点击「展开全部 N 期」查看全部期次。首付期「待支付」带「在线支付」按钮；后续期次显示周期触发条件（如「每月 1 期（到期日 …）」）。

![分期计划条展开](images/schedule-bar-installment.png)

### 4.3 首笔款弹窗：罚则明示 + 协议勾选

点击首笔款期次（定金/首付/押金，seq=1）的「在线支付」时，弹窗**明示法律性质与罚则**（徽章 + 结构化规则清单），顾客须勾选《预售/支付协议》后才能「立即支付」。

![首笔款支付弹窗](images/schedule-dialog.png)

### 4.4 租赁单：押金 + 租金

租赁单计划条展示押金期（待支付）与租金期。`deposit_paid` 门控下押金到账即可发货。

![租赁计划条](images/schedule-bar-rental.png)

### 4.5 C 端入口（GraphQL）

```graphql
# 预订：对当前活动订单应用预售活动（生成期次实例）
mutation { applyPreSale(activityId: "11") { id code state } }

# 分期：对已下单订单启用分期计划
mutation { enableInstallment(orderId: "49", planId: "11") { id state } }

# 租赁：对已下单订单开始租赁
mutation { startRental(orderId: "50", planId: "11", periods: 1) { id state } }

# 查询订单支付计划 / 支付某一期
query { paymentSchedule(orderId: "49") { id scenario status deliveryGate paidTotal items { seq kind amount status trigger } } }
mutation { paySchedulePeriod(orderId: "49", seq: 1, method: "dummy-payment") { id status } }
```

> 期次状态/触发条件/逾期滞纳金/违约提示均在计划条与弹窗内以文案展示，逾期显示「该期次已逾期，滞纳金 ¥…（按天计）」。

---

## 5. 测试用例清单

四包 e2e 覆盖（`vendure/packages/*/e2e/`）：

**payment-schedule-plugin（期次调度主流程）**
- date 触发 + 通用 paySchedulePeriod：扫描解锁尾款期，直付到期次
- COD 环：Authorized 授权留待确认 → confirmCodReceived 收款收口
- 买家超时未付定金（legal_deposit）：没收 + 订单取消 + 库存释放
- 买家超时未付订金（earnest）：overdue + 订单取消；已付订金经 cancelSchedule 按策略退（全额/比例）
- cancelSchedule：定金须确认罚则；订金主动取消退全款
- 团购成团事件触发：group_buy 尾款期 locked → payable
- 团购失败：已付期次全额退 + 调度 breached(group_buy_failed) + 订单取消
- 卖家超期未发货：runScheduleScan 标记 seller_breach → confirmSellerBreach 双倍返还

**pre-sale-plugin（预售/定金预售）**
- 活动管理 CRUD 与状态流转（active→delivered）；时区/窗口校验
- 全款预售一次收清；预售价格分档（绑定活动后折扣价生效）
- 定金两阶段支付：未到货不可付尾款
- 库存原子扣减与售罄直置 ended；取消回滚库存
- 每人限购；活动结束后不可再预售
- 合规硬点：定金超基准价 20% 拒绝保存，恰好 20% 可保存
- applyPreSale 生成期次实例：deposit 双项 / full 单 balance / earnest 订金落入 depositRule
- 薄壳支付走期次路径：payPreSaleDeposit→Deposited；到货 + payPreSaleTail→PaymentSettled

**installment-plugin（分期）**
- Admin CRUD：首付比（0–90）/ 期数（1–36）越界拒绝
- shop installmentPlans(variantId) 仅返回启用计划
- enableInstallment 期次拆分：首付 + 3 期金额正确
- 付首付 → PartiallyPaid + 发货门控放行；未付首付门控拦截

**rental-plugin（租赁）**
- Admin CRUD：押金/租金非正拒绝
- shop rentalPlans(variantId) 仅返回启用计划
- 买断：租金付清后 buyoutRental 追加买断期次（扣减已付租金）→ 支付 → 调度 completed
- postpaid 期次结构：押金 + N 期租金（interval + allowCod）；不可买断时拒绝
- 还物退押：releaseRentalDeposit → 押金期次 refunded
- prepaid 全流程：押金到账 PartiallyPaid → 发货门控 deposit_paid 放行

---

## 6. 常见问题

- **尾款期一直「待商家开启」？** 该活动 `tailTriggerType=manual`，需商家执行 `openTailWindow`（或到货自动开启：deposit 模式到货时 tailStartAt=releaseAt）。
- **发货被拦截？** 检查计划 `deliveryGate`：预订 `all_paid` 需全部付清（allowCod 期次除外）；分期需首付到账；租赁需押金到账。
- **期次支付后订单状态没变？** 支付方式需最终 Settled 才推进订单状态（COD 为 Authorized 时须 `confirmCodReceived`）。
- **创建预售活动报「定金超比例」？** `depositAmount` 不得超过基准价 20%，先调低定金或提高 presalePrice。
