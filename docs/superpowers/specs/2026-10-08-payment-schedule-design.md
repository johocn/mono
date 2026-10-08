# 统一支付计划：商品预订 / 分期 / 租赁 设计文档

- 日期：2026-10-08
- 状态：已确认（方案 C，五节设计逐节评审通过）
- 范围：vendure 后端插件 + nshop C 端 + Vendure Admin 后台

## 1. 背景与目标

在现有 `pre-sale-plugin`（定金/全款预售、两阶段支付、库存锁定、限购、固定尾款窗口）基础上，按用户拍板的**方案 C**一次性交付三个场景：

1. **预订/预售**：定金（法律罚则）或订金（可退）+ 尾款（三种触发条件，支持货到付款）
2. **分期付款**：首付 + n 期自动周期扣款
3. **租赁**：押金 + 周期租金 + 归还退押 / 买断

三场景共性收敛为「期次调度层」，差异（金额算法、交付时机、违约语义）按场景分开。

## 2. 决策记录

| 决策点 | 结论 |
|---|---|
| 实现路径 | 方案 C：统一支付计划模型，三场景一次交付 |
| 订金违约 | 可配置：全额退 / 扣约定比例手续费，默认全额退 |
| 团购不成团 | 定金/订金全额原路退还 |
| 卖家违约触发 | 自动提醒标记 + 管理员确认后执行双倍返还 |
| 定金 20% 上限 | 硬校验（创建时 depositAmount > 总价 20% 拒绝保存） |
| C 端弹窗版式 | 版式 A：结构化规则清单式 |
| COD 范围 | 仅尾款期/租金期，期次级 allowCod 标记 |

## 3. 法律语义界定

- **定金（legal_deposit）**：民法典 §586-588。担保性质；上限 ≤ 主合同标的额 20%，超出部分无定金效力；买方违约无权返还，卖方违约双倍返还。弹窗须明示罚则。
- **订金（earnest）**：预付款性质，无担保罚则，原则上可退；扣除约定须弹窗+协议明示，默认全额退。
- **分期首付（down_payment）**：货款一部分，无罚则；分期违约靠合同约定（催收→止付/收回）。
- **押金（security_deposit）**：担保但损失填补语义（非双倍返还）；逾期还物滞纳金、损坏扣押金。
- **尾款/租金/买断**：货款余款，支付窗口与条件按约定；COD 属现货交易尾款，签收时收款。

## 4. 插件划分

| 插件 | 状态 | 职责 |
|---|---|---|
| `payment-schedule-plugin` | **新建** | 期次调度层：OrderPaymentSchedule/OrderScheduleItem 实体、触发器注册表、违约动作注册表、调度任务、PartiallyPaid 状态机、paySchedulePeriod API |
| `pre-sale-plugin` | 改造 | 保留活动语义（窗口/库存/限购/团购联动）；支付字段收敛为「预订模板配置」，下单时生成期次实例；deposit/full 旧 API 变薄壳 |
| `installment-plugin` | 新建 | variant 级 InstallmentPlan 配置（首付比/期数/周期/手续费），下单生成期次实例 |
| `rental-plugin` | 新建 | variant 级 RentalPlan 配置（押金/租金周期/买断价/预付后付），租期选择、还物退押、买断 |
| `group-buy-plugin` | 微调 | 成团/失败发出领域事件（新增），供调度层订阅 |

## 5. 数据模型

### OrderPaymentSchedule（订单级实例，下单时快照）
- `orderId`、`channelId`
- `scenario`: `presale | installment | rental`
- `depositRule?`: `{ kind: legal_deposit | earnest | down_payment | security_deposit, capRatio?: 0.2, earnestRefundPolicy?: { onTimeout: full | partial, partialRate? } }`
- `deliveryGate`: `all_paid`（预订：付清才发货）| `first_period`（分期）| `deposit_paid`（租赁）
- `agreementVersion`: 协议版本快照
- `status`: `pending | in_progress | completed | breached | cancelled`
- `breachType?`: `buyer_timeout | seller_breach | group_buy_failed`

### OrderScheduleItem（期次）
- `scheduleId`、`seq`
- `kind`: `deposit | balance | down_payment | installment | rent | buyout`
- `amount`（下单时快照）、`allowCod`
- `trigger`: `{ type: date, at } | { type: interval, unit, count, anchor } | { type: group_buy, groupBuyActivityId } | { type: manual }`
- `dueAt`（计算后应付时点）、`graceHours`、`lateFeeRule?`（固定比例按天）
- `status`: `locked | payable | paid | overdue | forfeited | refunded | waived`
- `paidAt`、`paymentId`

### 场景配置实体
- `PreSaleActivity`（改造）：mode(deposit/full) + depositKind(legal_deposit/earnest) + tailTriggerType(date/group_buy/manual) + groupBuyActivityId? + tailWindowHours + graceHours + earnestRefundPolicy? + shipDeadline 规则
- `InstallmentPlan`（新）：variantId、downPaymentRatio、periods、intervalUnit/intervalCount、feeRule?
- `RentalPlan`（新）：variantId、depositAmount、rentAmount、rentUnit(day/week/month)、prepaidOrPostpaid、buyoutPrice?、allowBuyout

### Order 关联
- customFields：`paymentScheduleId`（替代原 preSaleMode/preSaleDepositTotal 散字段，迁移期双读兼容）

## 6. 状态机与调度

### 订单状态机（Vendure OrderProcess 扩展）
- 新增正式态 `PartiallyPaid`（`Deposited` 保留别名兼容，老订单与既有 e2e 不破坏）
- `ArrangingPayment → PartiallyPaid`（首期支付成功）
- `PartiallyPaid → PaymentSettled`（全部期次付清）
- **发货门控**：`deliveryGate` 决定 PartiallyPaid 是否可转 Shipped；期次 `allowCod=true` 豁免付清门控（COD 环：送达收款 → 补 Payment → PaymentSettled）
- `PartiallyPaid → Cancelled`（违约/取消）

### 期次状态机
`locked → payable（触发器满足）→ paid / overdue → forfeited | refunded | waived`
违约动作只作用于 overdue 期。

### 定时任务（ScheduledTask，每分钟）
1. **触发扫描**：locked 期次触发条件满足（date 到点 / groupBuy 成团事件 / manual 开启）→ payable + 通知买家
2. **逾期扫描**：payable 超 dueAt+graceHours → overdue + 催收提醒；按违约矩阵执行动作
3. **发货超期扫描**：超过发货承诺未发货 → 标记 `seller_breach` 待确认 + 通知管理员

### 事件订阅
- 订单 Cancelled → 复用 `releaseStockForOrder` 库存释放
- 团购 `GroupBuyCompletedEvent` → 触发器=group_buy 的期次转 payable
- 团购 `GroupBuyFailedEvent` → breachType=group_buy_failed，已付期次全额退，订单关闭

## 7. 违约处理矩阵

| 违约 | 场景/性质 | 动作 |
|---|---|---|
| 买家超时未付 | 定金 | 期次 forfeited，订单 Cancelled，定金不退，库存释放 |
| 买家超时未付 | 订金 | 按 earnestRefundPolicy 全额/比例原路退，订单 Cancelled |
| 买家超时未付 | 分期 | 逾期标记 + 多级催收提醒；止付/收回由管理员执行 |
| 买家逾期 | 租赁 | 滞纳金按 lateFeeRule 累计标记；扣押金由管理员确认 |
| 卖家超期未发货 | 定金 | 管理员确认后双倍返还（本金 refund + 等额赔偿 refund，留痕） |
| 卖家超期未发货 | 订金/押金 | 管理员确认后全额退 |
| 团购不成团 | 全部 | 已付期次全额原路退，订单 Cancelled |

退款统一走 Vendure `PaymentService.refund`（原路退回）。

## 8. API 设计

### Shop API（payment-schedule-plugin）
- `paymentSchedule(orderId)`：期次列表 + 状态 + 倒计时（C 端渲染源）
- `paySchedulePeriod(orderId, seq, method)`：付任意期次（在线）；旧 `payPreSaleDeposit/Tail/Full` 为兼容薄壳
- `cancelSchedule(orderId)`：买家主动取消（订金按策略退 / 定金明示不退后确认）

### Admin API
- 配置 CRUD：预售活动（改造字段）、`installmentPlans`、`rentalPlans`
- 调度管理：`paymentSchedules(filter)`、`openTailWindow(scheduleId)`、`confirmSellerBreach(scheduleId)`、`confirmCodReceived(orderId)`

### 通知
复用 `wechat-subscribe-message-plugin`：尾款开启 / 逾期催收 / 违约通知 / 退款通知。

## 9. C 端与后台 UI

- **付首笔款弹窗（版式 A）**：金额 + 性质徽章（法律定金·有罚则 / 订金·可退 / 首付 / 押金）+ 3-4 条结构化规则（窗口与逾期后果、双倍返还、团购失败全额退）+ 勾选《预售协议》+ 主按钮。文案按 depositRule 自动切换，走 i18n 字典（zh-CN/en-US 同步补齐）。
- **支付计划条（通用组件 ScheduleBar）**：期次行动态展开；锁定态显示触发条件（日期倒计时 / 成团进度 / 待手动开启）；payable 态出现「在线支付 / 货到付款」选择；违约提示条按场景展示法律后果。分期/租赁复用（期次行数动态）。
- **后台**：场景配置表单（20% 硬校验实时提示、触发条件三选一、发货承诺、宽限期、COD 开关）+ 违约管理页（待确认/已执行/已退款，双倍返还确认按钮、手动开启尾款窗口）。落在 Vendure Admin（沿用 admin resolver 模式）。

## 10. 合规硬点

1. 定金 20% 硬校验（超出拒绝保存）
2. 弹窗罚则明示 + 协议版本 + 勾选时间落库（下单快照，改配置不影响已生成订单）
3. 订金扣除约定须弹窗+协议明示
4. 双倍返还按法定默认（本金+等额赔偿）
5. COD 尾款签收收款，视为现货交易

## 11. 边界（本次不做，留扩展位）

定金膨胀、价保（presalePrice 已由 Promotion 保证）、租赁验收扣损（先手动退押）、资金方分期（平台自营记账）、自动化止付/收回（提醒+标记，人工执行）、滞纳金仅固定比例按天、发票拆分不特殊处理。

## 12. 测试与验收

- e2e：三场景「下单 → 期次生成 → 触发 → 支付 → 违约分支」全覆盖；旧 pre-sale e2e 兼容（Deposited 别名）
- 手机视口截图（390×844，dpr=2）补充操作手册
- 部署：本地构建，服务器解压 + pm2 restart（既有流程）
