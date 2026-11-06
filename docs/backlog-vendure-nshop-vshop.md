# 三仓库可执行开发任务清单（vendure / nshop / vshop）

> 编制日期：2026-11-05
> 核实方式：仅做静态核实（grep / 读文件 / git log），未运行服务、未连数据库、未改动任何代码。
> 仓库：`d:\zhao\vendure`（后端 + plugins + dev-server 配置）、`d:\zhao\nshop`（Nuxt C 端）、`d:\zhao\vshop`（uni-app C 端 + `web-admin` 管理端）
> 编号说明：VM = vendure（原候选 1–9），NS = nshop（原候选 10–14），VS = vshop（原候选 15–19）。

---

## 0. 总览

| 仓库 | 任务数 | P0 | P1 | P2 | P3 |
|---|---:|---:|---:|---:|---:|
| vendure | 9 | 1 | 3 | 4 | 1 |
| nshop | 5 | 0 | 3 | 2 | 0 |
| vshop | 5 | 0 | 2 | 3 | 0 |
| **合计** | **19** | **1** | **8** | **9** | **1** |

状态分布：待开发 14、部分完成 1、已修待确认 2、待验证 2。

- **P0** = 已确认的功能性硬失败或正在被利用的安全问题，阻断核心业务且无已验证的绕行方案。
- **P1** = 阻断某一真实业务流程、或有可被利用的安全面，但影响面/触发条件受限，或已有临时绕行。
- **P2** = 功能缺口/体验缺陷，不阻断主流程。
- **P3** = 仅需验证或文档层面的收尾。

> 优先级不是"代码问题严重程度"，而是"是否阻断真实业务/是否可被利用"。每条都写了判断理由。

---

## 1. vendure（VM）

### 汇总

| ID | 标题 | 优先级 | 状态 | 工时(人日) |
|---|---|---|---|---|
| VM-01 | 配送模板 checker/calculator 输入类型不匹配，保存必失败 | P0 | 待开发 | 0.5–1 |
| VM-02 | VoucherPlugin / SubscriptionPlugin 完全未注册（无迁移） | P2 | 待开发 | 1.5–2.5 |
| VM-03 | 江湖自定义技能 4 个端点（含实体/迁移）缺失 | P2 | 待开发 | 3–5 |
| VM-04 | 校园隐私号三字段：后端实际已实现 | P3 | 已修待确认 | 0.1–0.2 |
| VM-05 | campus-delivery `lib` 构建产物落后于 `src`（`integrated` 等） | P2 | 待开发 | 0.5–1 |
| VM-06 | POS 终端存在历史 pos_session 时删除被外键拒绝 | P1 | 待开发 | 0.5–1 |
| VM-07 | `[CampusHall] Property "shippingAddress" was not found in "Order"` | P1 | 待开发 | 0.25–0.5 |
| VM-08 | 微信 H5 `payer_client_ip` 兜底 127.0.0.1；多渠道静默回退默认渠道账号 | P1 | 待开发 | 1–1.5 |
| VM-09 | 游客取货单手机号一致性校验（确认唯一写入入口） | P2 | 已修待确认 | 0.25–0.5 |

---

### VM-01 配送模板 checker/calculator 输入类型不匹配，保存必失败

- **对应原清单**：#1
- **证据**
  - 后端 create 输入：`checker: ConfigArgInput!`、`calculator: ConfigArgInput` — [plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L596-L601)
  - 后端 update 输入：同样声明 — [plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L604-L612)
  - `ConfigArgInput` 本身只有 `{ name, value }`（Vendure 内置）— [common-types.graphql](file:///d:/zhao/vendure/packages/core/src/api/schema/common/common-types.graphql#L69-L73)
  - 实体/服务按 `{ code, arguments }` 落库 — [shipping-template.entity.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-template.entity.ts#L39-L43)、[shipping-template.service.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-template.service.ts#L94-L99)
  - 前端发送 `{ code, arguments }` — [shipping-template.ts](file:///d:/zhao/vshop/web-admin/src/apis/shipping-template.ts#L54-L69)、[method-config/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/shipping/method-config/index.vue#L116-L141)
- **结论**：只要带了 checker/calculator，GraphQL 变量在输入校验阶段即失败（字段 `arguments` 不被 schema 接受）。**create 与 update 两条路径都受影响**，不是只有 update。
- **优先级 P0 + 理由**：确认必失败、且未找到等价的替代入口来完成"按区域/重量等条件计费"的模板配置；运费模板是下单履约的前置配置。若确认线上仍有"统一运费"兜底且商家可绕过，则降为 P1。
- **状态**：待开发
- **依赖**：无外部依赖；改完需 `cjk-plugin` 重新构建 + 后端发布。
- **验收标准**
  1. 新增 `ShippingCheckerInput { code: String!; arguments: [ConfigArgInput!]! }`（或直接复用 Vendure 的 `ConfigurableOperationInput` 结构），替换两处输入的字段类型。
  2. `createShippingTemplate` / `updateShippingTemplateConfig` 分别用 checker=`{code:"weight",arguments:[{name:"minWeight",value:"1"}]}` 调用返回 200 且 DB 中 JSON 与入参一致。
  3. 用 web-admin 「区域与运费 → 保存」实际保存一次，刷新页面后 checker/calculator 回显不回退为空。
  4. 回归：不传 checker/calculator 时仍保存成功（字段可空）。
- **工时**：0.5–1 人日

---

### VM-02 VoucherPlugin / SubscriptionPlugin 完全未注册

- **对应原清单**：#2
- **证据**
  - 插件导入区无 Voucher/Subscription — [dev-config.ts](file:///d:/zhao/vendure/packages/dev-server/dev-config.ts#L36-L75)
  - plugins 数组无对应条目（校园插件 615–623 之后直接是 SalesPlugin）— [dev-config.ts](file:///d:/zhao/vendure/packages/dev-server/dev-config.ts#L596-L625)
  - 根 `package.json` 全文无 `voucher-plugin` / `subscription-plugin` 依赖 — [package.json](file:///d:/zhao/vendure/package.json)
  - 5 张业务表定义都在：`voucher.plugin.ts` 的 `entities: [ServiceVoucher, VoucherBooking]` — [voucher.plugin.ts](file:///d:/zhao/vendure/packages/voucher-plugin/src/voucher.plugin.ts#L98)；`plugin.ts` 的 `entities: [SubscriptionPlan, Subscription, SubscriptionOccurrence]` — [plugin.ts](file:///d:/zhao/vendure/packages/subscription-plugin/src/plugin.ts#L113)
  - 两个包**均无** `src/migrations` 目录（`Test-Path` 均为 False）；`lib` 已有构建产物
  - 生产库同步开关：`synchronize: process.env.DB_SYNC !== '0'` — [dev-config.ts](file:///d:/zhao/vendure/packages/dev-server/dev-config.ts#L716)
  - 前端仅在 waimai 打开开关，且默认关闭 — [features.ts](file:///d:/zhao/waimai/src/config/features.ts#L19-L25)
- **结论**：确认存在。由于未注册，这两个插件的 resolver/实体/表在现网全部不可用；同时缺迁移（若线上 `DB_SYNC=0`，注册后表也不会自动建）。
- **优先级 P2 + 理由**：对应前端功能默认关闭（`VITE_FEATURE_SUBSCRIPTION`），当前不阻断在售业务；但一旦打开会全量 500，必须在开启前完成。
- **状态**：待开发
- **依赖**：产品侧确认订阅/服务券是否上线；生产 DB 迁移窗口（需服务器权限）；`waimai` 前端开关配合。
- **验收标准**
  1. 两个插件在 `dev-config.ts` 注册（`VoucherPlugin`、`SubscriptionPlugin.init({...})`），根 `package.json` 增加 workspace 依赖，`package-lock` 同步。
  2. 新增迁移并成功执行：`service_voucher`、`voucher_booking`、`subscription_plan`、`subscription`、`subscription_occurrence` 5 张表在库中存在，`migration` 表有对应记录。
  3. `admin-api`/`shop-api` introspection 能查到两插件类型；`query { subscriptionPlans { items { id } } }` 返回 200（空列表不报错）。
  4. `waimai` 打开 `VITE_FEATURE_SUBSCRIPTION=true` 后，套餐列表/续费页端到端可用。
- **工时**：1.5–2.5 人日

---

### VM-03 江湖自定义技能 4 个端点缺失

- **对应原清单**：#3
- **证据**
  - 前端 shop 查询（标注 `TODO(backend): 后端暂未提供该查询`）— [jianghu.ts](file:///d:/zhao/waimai/src/api/queries/jianghu.ts#L200-L210)
  - 前端 shop 提交（标注 `TODO(backend)`）— [jianghu.ts](file:///d:/zhao/waimai/src/api/mutations/jianghu.ts#L178-L190)
  - 前端 admin 列表/审核 — [jianghu.ts](file:///d:/zhao/waimai/src/api/admin/jianghu.ts#L60-L72)
  - 后端 `campus-jianghu-plugin/src` 中 `CustomSkill` 零命中；`schema.ts` 只有事件/成就等既有类型 — [schema.ts](file:///d:/zhao/vendure/packages/campus-jianghu-plugin/src/schema.ts)
  - 功能开关默认关闭 — [features.ts](file:///d:/zhao/waimai/src/config/features.ts#L21-L25)
- **结论**：确认四个端点 `jianghuCustomSkillList`（shop query）、`jianghuCustomSkillSubmit`（shop mutation）、`jianghuListCustomSkills`（admin query）、`jianghuAuditCustomSkill`（admin mutation）均不存在，且无对应实体表。
- **优先级 P2 + 理由**：江湖玩法后端能力缺口，前端开关默认关闭，不阻断现网。
- **状态**：待开发
- **依赖**：产品/运营需先定技能字段与审核规则（提交限制、审核状态机）；DB 迁移；waimai 打开开关联动。
- **验收标准**
  1. 新增实体 + 迁移建表（如 `jianghu_custom_skill`），含 `status`（pending/approved/rejected）、提交人、审核人、审核时间字段。
  2. 4 个端点可调用：提交→列表可见（仅本人 pending/approved）；admin 列表按状态过滤；审核通过/驳回后状态与驳回原因正确。
  3. 权限：shop 端点仅登录用户可用；admin 端点需对应权限（非 SuperAdmin 直连应被拒）。
  4. 审核通过后的技能在玩家技能列表可见，未通过不可见。
  5. waimai `VITE_FEATURE_JIANGHU_SKILL_AUDIT=true` 下提交+审核端到端通过。
- **工时**：3–5 人日

---

### VM-04 校园隐私号三字段：后端实际已实现

- **对应原清单**：#4（原描述：三个字段后端不存在、前端已删）
- **证据**
  - 后端 schema 已定义 `privacyNumberEffectiveProvider` / `privacyNumberDegraded` / `privacyNumberNote` — [campus-delivery.plugin.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts#L1723-L1726)
  - 服务层读写并给出降级提示 — [waimai-store.service.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/waimai-store.service.ts#L122-L128)、[waimai-store.service.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/waimai-store.service.ts#L1002-L1006)
  - `lib` 产物同样包含三字段（`packages/campus-delivery-plugin/lib/src/campus-delivery.plugin.js` 命中）
  - 前端 web-admin **仍在消费**这三个字段 — [campus.ts](file:///d:/zhao/vshop/web-admin/src/apis/campus.ts#L75-L83)
- **结论**：原描述与代码不符，后端（含 lib）已实现、前端也未被删除。
- **优先级 P3 + 理由**：无开发工作量，只需确认线上部署版本已包含。
- **状态**：已修待确认
- **依赖**：生产环境版本核对（后端发布记录）。
- **验收标准**
  1. 线上 admin-api introspection 中 `CampusPrivacyConfig` 含三字段。
  2. web-admin 校园配置页"隐私号"区块能展示 provider 名称与降级提示，保存后回显一致。
- **工时**：0.1–0.2 人日（仅验证）

---

### VM-05 campus-delivery `lib` 构建产物落后于 `src`

- **对应原清单**：#5
- **证据**
  - `src` 有三处 `integrated`：`CampusUnmannedProvider`、`CampusUnmannedChannel`、`CampusUnmannedDeliveryChannelInfo` — [campus-delivery.plugin.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts#L2325)、[同文件](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts#L2340)、[同文件](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts#L3591)
  - `lib/src/campus-delivery.plugin.js` 对 `integrated` **0 命中**；该文件被 git 跟踪且还有未提交改动（`git status` 显示 modified），说明入库产物早于上述 src 提交
  - 前端因此"回避字段"：waimai 明确注释线上 schema 暂无该字段 — [locker.ts](file:///d:/zhao/waimai/src/api/queries/locker.ts#L13-L18)；web-admin 的通道字段选择串也删掉了 `integrated`，但类型声明仍保留 — [campus.ts](file:///d:/zhao/vshop/web-admin/src/apis/campus.ts#L3817-L3832)、[campus.ts](file:///d:/zhao/vshop/web-admin/src/apis/campus.ts#L3848-L3849)
- **结论**：确认存在。并且不只是 `integrated`：本地 lib 还带有未提交的 p42 迁移 / 骑手合规任务 / 遥测留存等差异，整体产物已与 `src` 漂移。
- **优先级 P2 + 理由**：不阻断下单/履约，只影响"无人配送通道是否已接入"的展示与真实下发判断；但 lib 漂移会掩盖其他后端改动，有回归风险。
- **状态**：待开发
- **依赖**：**必须先重建 lib 并部署后端，前端才能改回字段**（跨仓库强依赖，见 §4 执行顺序）。
- **验收标准**
  1. 在仓库内 `npm run build -w @vendure/campus-delivery-plugin`，`lib` 重新生成并提交；`lib/src/campus-delivery.plugin.js` grep `integrated` 命中 ≥3。
  2. 部署后 `admin-api` introspection `CampusUnmannedChannel` 含 `integrated: Boolean!`。
  3. 前端改回：waimai `locker.ts` 与 web-admin `UNMANNED_CHANNEL_FIELDS`（3848-3849 行）重新请求 `integrated` 并按 true/false 显示"已接入/未接入"；删除 locker.ts 中的临时回避注释。
  4. 两个前端 mock 通道联动：`integrated=false` 时"下发"按钮禁用或提示 unsupported。
- **工时**：0.5–1 人日（含构建与三端联动）

---

### VM-06 POS 终端存在历史 pos_session 时删除被外键拒绝

- **对应原清单**：#6
- **证据**
  - 删除走硬删 — [admin-terminal.resolver.ts](file:///d:/zhao/vendure/packages/vcash-pos-plugin/src/resolvers/admin-terminal.resolver.ts#L60-L66)、[pos-terminal.service.ts](file:///d:/zhao/vendure/packages/vcash-pos-plugin/src/services/pos-terminal.service.ts#L82-L85)
  - `PosSession.terminal` 为 `@ManyToOne(...)`，**未设 onDelete** — [pos-session.entity.ts](file:///d:/zhao/vendure/packages/vcash-pos-plugin/src/entities/pos-session.entity.ts#L42-L44)
  - `PosTerminal` 实体无软删列（无 `DeleteDateColumn`）— [pos-terminal.entity.ts](file:///d:/zhao/vendure/packages/vcash-pos-plugin/src/entities/pos-terminal.entity.ts)
- **结论**：确认存在。只要该终端产生过交接班/收款会话，删除即命中外键约束（违反 `NO ACTION`），前端收到 500。
- **优先级 P1 + 理由**：门店换机/关店等高频运维操作直接失败；虽有"停用"类字段可绕行，但属于真实运维阻断。
- **状态**：待开发
- **依赖**：需要在有历史 `pos_session` 的环境复现（测试数据或影子库）；若改软删需迁移。
- **验收标准**
  1. 复现：对一个有 ≥1 条 `pos_session` 的终端调用删除 → 返回明确的业务错误（如"该终端存在历史交接班记录，已停用"），不再抛数据库 500。
  2. 无历史会话的终端仍可物理删除，返回成功。
  3. 有历史会话时：终端 `enabled=false`（或 `deletedAt` 置值），列表默认不再展示，`pos_session` 关联数据完整可查。
  4. 回归：交接班查询/对账仍能取到该终端名称。
- **工时**：0.5–1 人日

---

### VM-07 `[CampusHall] Property "shippingAddress" was not found in "Order"`

- **对应原清单**：#7
- **证据**
  - 错误来源之一：`relations: ['shippingAddress']` — [hall.service.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/hall.service.ts#L100-L103)
  - 同类第二处 — [third-party-delivery.service.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/third-party-delivery.service.ts#L118-L121)
  - 该 hook 的错误以 `CampusHall` 为 tag 记录 — [campus-delivery.plugin.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts#L3788-L3791)
  - **根因**：本仓库 fork 的 core 已把地址改成 JSON 列（不是关系）— [order.entity.ts](file:///d:/zhao/vendure/packages/core/src/entity/order/order.entity.ts#L130-L132)。TypeORM 在解析 `relations` 时会查关系元数据，找不到即抛 `EntityPropertyNotFoundError`。
- **结论**：确认存在，且是**两处**（食堂大厅 + 第三方配送），任一触发都会在订单事件回调里失败（异常被捕获后只打日志，主流程不中断但大厅/配送占位不生成）。
- **优先级 P1 + 理由**：食堂大厅订单不进入备餐/派单流程 → 该业务链路实际不可用；普通商城订单不受影响。
- **状态**：待开发
- **依赖**：改动后需重建 campus-delivery lib + 发布后端。
- **验收标准**
  1. 删除两处 `relations: ['shippingAddress']`（JSON 列无需 relations）。
  2. 下单后日志中 `CampusHall` 不再出现 `Property "shippingAddress" was not found`。
  3. 校园食堂订单在 `campusHallOrders`/大厅列表可见，且地址字段（收货人/电话/楼栋）正确展示。
  4. 第三方配送下单后配送单能创建并带出地址。
- **工时**：0.25–0.5 人日

---

### VM-08 微信 H5 IP 兜底 + 多渠道静默回退默认渠道账号

- **对应原清单**：#8（含 8a / 8b 两个独立修复点）
- **证据**
  - 8a：handler 路径取 `ctx.req?.ip || '127.0.0.1'` — [wechatpay-handler.ts](file:///d:/zhao/vendure/packages/wechatpay-plugin/src/wechatpay-handler.ts#L141-L148)
  - 8a：service 路径**写死** `'127.0.0.1'` — [wechatpay.service.ts](file:///d:/zhao/vendure/packages/wechatpay-plugin/src/wechatpay.service.ts#L237-L246)
  - 8b：当前渠道无匹配方法时，`findPaymentMethod` 依次回退到"渠道内任一 wechatpay-*"→"默认渠道同名方法"，且不报错 — [wechatpay.service.ts](file:///d:/zhao/vendure/packages/wechatpay-plugin/src/wechatpay.service.ts#L193-L204)
- **结论**：两处确认存在。8a 的 `ctx.req.ip` 在 nginx 反代后通常是代理 IP（除非配置 trust proxy），兜底再落到 127.0.0.1；微信 H5 下单要求真实付款人 IP，弱网/风控场景易被拒。8b 在多租户场景会把钱收到平台默认商户号，属于**资金归属错误**且无任何告警。
- **优先级 P1 + 理由**：8a 若线上已出现 H5 支付失败/风控拦截，应升 P0；8b 只在"某渠道未绑微信支付方法"时触发，但一旦触发就是收错账户，需尽快加显式失败。
- **状态**：待开发
- **依赖**：真实微信商户号 + 已备案 H5 授权域名；nginx `X-Forwarded-For` / `trust proxy` 配置（服务器权限）；真实小额订单回归。
- **验收标准**
  1. 8a：H5 下单的 `scene_info.payer_client_ip` 取 `X-Forwarded-For` 首个有效 IP（校验 IPv4/IPv6 格式），无有效 IP 时返回明确业务错误而非 `127.0.0.1`；两条路径（handler / service）行为一致。
  2. 8a：用真实手机在微信内 H5 下单一次，商户平台订单详情中"付款方 IP"为真实公网 IP 且城市正确。
  3. 8b：当当前渠道无可用微信支付方法时，抛出可读错误（如"当前店铺未配置微信支付"）并记录渠道 code；不再回退默认渠道。
  4. 8b：渠道 A 配置了 override 时，支付流水的商户号/MchId 属于渠道 A；渠道 B 未配置时不会被扣到渠道 A 的账号。
- **工时**：1–1.5 人日

---

### VM-09 游客取货单手机号一致性校验

- **对应原清单**：#9
- **证据**
  - 校验已实现：订单已有手机号时要求数字一致，仅"订单尚无手机号"允许首次补录 — [pickup-guest-order.resolver.ts](file:///d:/zhao/vendure/packages/pickup-plugin/src/pickup-guest-order.resolver.ts#L55-L65)
  - 该 mutation 需"窗口内可访问 + 游客单" — [pickup-guest-order.resolver.ts](file:///d:/zhao/vendure/packages/pickup-plugin/src/pickup-guest-order.resolver.ts#L49-L53)
  - 写入入口唯一性：全仓库 `contactPhone` 写入只出现在此 resolver（pickup-plugin / campus-delivery-plugin grep 均无第二处写入）
  - 本地 git：该文件已在 master 且无未提交改动（HEAD 2026-11-04）
- **结论**：代码层面已修复，**未发现其他未加校验的写入入口**；`guestOrderLookup` 是只读（但会触发 `ensurePickupRedemptionForOrder` 的写副作用，见 NS-01）。
- **优先级 P2 + 理由**：安全修复已落地，剩余价值是确认线上版本与补充越权回归用例。
- **状态**：已修待确认
- **依赖**：生产部署记录；一条"已存手机号订单"的测试数据。
- **验收标准**
  1. 线上对已有 `contactPhone=A` 的订单，提交 `phone=B` → 返回 `not found`（不泄露订单存在）。
  2. 对无 `contactPhone` 的订单，首次补录成功；再次提交不同号码被拒。
  3. 非游客单（有客户账号）调用该 mutation → 拒绝。
- **工时**：0.25–0.5 人日

---

## 2. nshop（NS）

### 汇总

| ID | 标题 | 优先级 | 状态 | 工时(人日) |
|---|---|---|---|---|
| NS-01 | 游客订单查询/写入无任何限流（后端缺口） | P1 | 部分完成 | 1–1.5 |
| NS-02 | Meili search key 以明文下发到 HTML，权限范围待核 | P1 | 待验证 | 0.5–1 |
| NS-03 | 租户解析失败时静默回退根渠道（错店内容窗口） | P1 | 待开发 | 0.5–1 |
| NS-04 | 页面 `<title>` 未本地化 + 后台商品/分类缺英文翻译 | P2 | 待开发 | 1–1.5 |
| NS-05 | GQL 分页查询缺 `take` 的同类隐患 | P2 | 待开发 | 0.5–1 |

---

### NS-01 游客订单查询/写入无任何限流

- **对应原清单**：#10
- **证据**
  - `guestOrderLookup` / `guestSetOrderCustomFields` 均为 `@Allow(Permission.Public)`，无任何限流/冷却 — [pickup-guest-order.resolver.ts](file:///d:/zhao/vendure/packages/pickup-plugin/src/pickup-guest-order.resolver.ts#L24-L48)
  - 查询命中时还会触发写副作用 `ensurePickupRedemptionForOrder` — [pickup-guest-order.resolver.ts](file:///d:/zhao/vendure/packages/pickup-plugin/src/pickup-guest-order.resolver.ts#L38-L40)
  - 现有唯一的限流只作用于登录/认证，不覆盖这两个公开端点 — [login-rate-limit.ts](file:///d:/zhao/vendure/packages/dev-server/login-rate-limit.ts)
  - nshop 调用点（订单查询页）— [lookup.vue](file:///d:/zhao/nshop/layers/base/app/pages/order/lookup.vue#L10-L23)
- **结论**：确认存在（本项虽列在 nshop，实际修改在 **vendure 后端**）。手机号与订单号双要素降低了"纯订单号枚举"的可行性，但没有失败次数上限，可被批量撞库；同时公开查询会创建核销记录，存在被刷写风险。
- **优先级 P1 + 理由**：公开无鉴权端点 + 可枚举 + 有写副作用，属可被利用的攻击面。
- **状态**：部分完成（手机号一致性校验已有，限流缺失）
- **依赖**：需确认生产是否已在网关层限流（nginx `limit_req`）；若已有可降级为 P2。
- **验收标准**
  1. 以 IP + 订单号维度限流：同一 IP 对 `guestOrderLookup` 失败尝试 ≥ N 次/10 分钟返回 429 或统一 `not found`（不区分）。
  2. `guestSetOrderCustomFields` 独立冷却（如 3 次/小时/订单），超限返回可读错误。
  3. 正常用户 1 次查询不受影响；两个端点限流计数互不干扰。
  4. 压测脚本：单 IP 连续 200 次错误请求，触发限流且服务不 OOM/不产生 200 条核销记录。
- **工时**：1–1.5 人日

---

### NS-02 Meili search key 以明文下发到 HTML

- **对应原清单**：#11
- **证据**
  - key 放在 `runtimeConfig.public` — [nuxt.config.ts](file:///d:/zhao/nshop/nuxt.config.ts#L73-L75)（注释自称"本就是随前端下发的公钥，限 indexes:kb-*"，但仅是注释断言）
  - 客户端直接 `Authorization: Bearer <key>` 调 Meili — [useKbSearch.ts](file:///d:/zhao/nshop/layers/base/app/composables/useKbSearch.ts#L94-L107)
  - `public` 配置在 Nuxt 3 会被序列化进首屏 `__NUXT__` payload（HTML 内可见）
- **结论**：明文下发确认存在；"只有 search 权限"**无法从代码证实**（取决于 Meili 侧 key 的 indexes/actions 配置）。
- **优先级 P1 + 理由**：若这是 search-only key，风险可控（P2）；若误配为 admin/master key，等同把可写索引权限公开，属 P0。优先级按"待核实的最大风险"定 P1。
- **状态**：待验证
- **依赖**：Meili 管理端/服务器权限（可调 `/keys` 或查看 key 前 8 位 UID）；确认 nginx `/search-api` 是否只放行 search 路径。
- **验收标准**
  1. `curl -H "Authorization: Bearer <该key>" <meili>/keys` 返回 403（非管理 key）。
  2. 用该 key 尝试 `POST /indexes/kb-xxx/documents` 返回 403，`POST /indexes/kb-xxx/search` 返回 200。
  3. key 的 `indexes` 限定为 `kb-*`，`actions` 仅 `search`。
  4. 若第 1–3 不满足：立即轮换 key 并改为服务端代理（Nitro `/search-api` 注入，前端不持有 key）。
- **工时**：0.5–1 人日（若需改服务端代理则 +0.5）

---

### NS-03 租户解析失败时静默回退根渠道

- **对应原清单**：#12
- **证据**
  - `token` 在无租户时回退根渠道 — [useTenantChannel.ts](file:///d:/zhao/nshop/layers/base/app/composables/useTenantChannel.ts#L35-L37)
  - 客户端冷启动解析失败即 `applyDefault`（catch 吞掉错误）— [tenant-channel.ts](file:///d:/zhao/nshop/layers/base/app/plugins/tenant-channel.ts#L43-L52)
  - SSR 侧 `ctx.tenant` 缺失时同样落到 `status:"none"` — [tenant-channel.ts](file:///d:/zhao/nshop/layers/base/app/plugins/tenant-channel.ts#L40-L42)
  - 软导航失败会 404，但插件路径失败不会 — [tenant.global.ts](file:///d:/zhao/nshop/layers/base/app/middleware/tenant.global.ts#L53-L64)
- **结论**：确认存在，但机制与描述略有差异：不是"未解析时短暂回退"，而是**解析失败（接口异常/SSR 未注入）时整页降级为平台默认店**；正常路径下 `applyResolved` 与 `useGqlHeaders` 是同步的，不存在"先发请求后切 token"的窗口。
- **优先级 P1 + 理由**：失败态会把 `/t2` 访客渲染成平台默认店的商品与价格（错店内容），且用户无法感知；不是持续数据串写，但会造成错误下单与客诉。
- **状态**：待开发
- **依赖**：无外部依赖；需要一个可模拟 `/api/tenant/resolve` 失败的环境验证。
- **验收标准**
  1. 解析失败时不再 `applyDefault`：页面进入显式错误态（"店铺信息加载失败，请重试"），不渲染任何商品/价格。
  2. 首屏 `__NUXT__` 中 `tenantResolve.status` 为 `error/unknown` 时不发起商品类 GQL（Network 面板可验证）。
  3. SSR：Nitro 中间件未注入 `ctx.tenant` 但 URL 首段是租户时，返回 502/错误页而不是默认店内容。
  4. 正常路径回归：`/t2` 首屏所有 GQL 请求头 `vendure-token` 均为 t2 token。
- **工时**：0.5–1 人日

---

### NS-04 页面 `<title>` 未本地化 + 缺英文翻译

- **对应原清单**：#13
- **证据**
  - 布局把 `route.meta.title` 直接丢给 `t()` — [default.vue](file:///d:/zhao/nshop/app/layouts/default.vue#L13-L17)
  - `lookup` 页 title 就是路由名 `'lookup'`（i18n 无该 key → 原样输出）— [lookup.vue](file:///d:/zhao/nshop/layers/base/app/pages/order/lookup.vue#L4)
  - 其余页面：11 个 `definePageMeta({title})` 中 4 个写死中文（如 `搜索`），其余走 `messages.*`；
  - `Checkout` 页**没有** `definePageMeta.title`，会落到站点名（不是路由名）— [checkout/index.vue](file:///d:/zhao/nshop/layers/base/app/pages/checkout/index.vue)
  - 语言头已全局注入 `languageCode` — [app.vue](file:///d:/zhao/nshop/app/app.vue#L16)
  - 演示数据只写 `zh_Hans` 翻译 — [seed-t2-products.mjs](file:///d:/zhao/nshop/scripts/seed-t2-products.mjs#L61)
- **结论**：title 问题确认但范围比描述小（仅 `lookup` 等少数页；`Checkout` 不是路由名）。`/en` 内容中文属**数据缺失**（翻译未录入后台），代码层已正确传 `languageCode`。
- **优先级 P2 + 理由**：影响 SEO 与多语言体验，不阻断交易。
- **状态**：待开发
- **依赖**：英文商品/分类翻译需要运营在后台录入（外部配合）；title 改造为代码工作。
- **验收标准**
  1. `lookup` 页 `<title>` 为当前语言下的"订单查询"（zh/en 各一份词条），不再出现 `lookup` 字样。
  2. 4 个写死中文 title 改为 i18n key，`/en/...` 下标题为英文。
  3. 所有 C 端页面 `<head><title>` 非空且非路由名（写脚本遍历 sitemap 前 30 个 URL 断言）。
  4. `/en/product/<slug>` 返回英文商品名（后台已录入翻译的前提下）；若未录入，页面显示默认语言并有可见提示。
- **工时**：1–1.5 人日（不含运营录入翻译）

---

### NS-05 GQL 分页查询缺 `take` 的同类隐患

- **对应原清单**：#14
- **证据**
  - `.gql` 目录内分页查询绝大多数显式带 `take`（`GetOrderHistory`/`GetFacets`/`MyFeedbacks` 调用点均为常量）
  - **具体隐患**：售后留言首次加载不传 `take` — [AfterSalesMessages.vue](file:///d:/zhao/nshop/layers/base/app/components/afterSales/AfterSalesMessages.vue#L26-L35)，而 composable 允许 `take` 为空 — [useAfterSales.ts](file:///d:/zhao/nshop/layers/base/app/composables/useAfterSales.ts#L109-L113)
  - 生产复杂度上限 3000，超过即 500 — [dev-config.ts](file:///d:/zhao/vendure/packages/dev-server/dev-config.ts#L433-L435)
- **结论**：不存在大面积"未带 take"的查询；但存在至少 1 处真实隐患（留言卡片首屏取全量），与"Harden 500"同类。
- **优先级 P2 + 理由**：只有留言量大的售后单才会触发；但一旦触发就是页面 500，且随数据增长必然发生。
- **状态**：待开发
- **依赖**：无。
- **验收标准**
  1. `load()` 改为 `fetchMessages(id, 0, 50)`，分页行为与 `loadMore` 一致。
  2. 用一条 ≥200 条留言的售后单验证首屏只请求 50 条、`hasMore` 为 true、点"加载更多"正确追加。
  3. 增加静态检查（CI 脚本或 eslint 规则）：`.gql` 中带 `$options` 的列表查询在调用点必须显式传 `take`（至少覆盖 components/ 与 pages/）。
  4. 输出一份"所有列表查询 take 现状"清单，作为 500 类问题的基线。
- **工时**：0.5–1 人日

---

## 3. vshop（VS）

### 汇总

| ID | 标题 | 优先级 | 状态 | 工时(人日) |
|---|---|---|---|---|
| VS-01 | 管理端 131 页中 108 页无页面级权限守卫 | P1 | 待开发 | 2–4 |
| VS-02 | 两端 token 明文存 localStorage | P2 | 待开发 | 3–5 |
| VS-03 | 操作手册静态页无鉴权 | P2 | 待开发 | 1–1.5 |
| VS-04 | 未登录深链先请求 dashboardOverview 再被踢回登录 | P2 | 待开发 | 0.5 |
| VS-05 | H5 取消支付后继续支付 / 过期会话重登链路待真实回归 | P1 | 待验证 | 1–2 |

---

### VS-01 管理端页面级权限守卫覆盖不足

- **对应原清单**：#15
- **证据**
  - 现有守卫实现（缺权限时 toast + 返回）— [usePermGuard.ts](file:///d:/zhao/vshop/web-admin/src/composables/usePermGuard.ts#L12-L28)
  - 覆盖统计：`web-admin/src/pages` 共 **131** 个 `.vue`，仅 **23** 个调用 `usePermGuard`，**108** 个无页面级守卫
  - 其中平台/资金级页面全部未守卫：`platform/tenants/index.vue`、`platform/roles/index.vue`、`platform/global-config/index.vue`、`platform/stores/index.vue`、`balance/withdraw/index.vue`、`rider/withdraw/index.vue`、`settle/ledger/index.vue`、`distribution/settle/index.vue`、`coupon/settlements/index.vue` 等
  - `hasPermission` 调用：12 个文件 / 23 处（与描述一致），主要集中在 `constants/menus.ts` 与 campus 页面
  - 后端并未"只靠前端菜单隐藏"：抽查 `tenants` 查询有 `@Allow(Permission.SuperAdmin)` — [tenant-admin.resolver.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/tenant/tenant-admin.resolver.ts#L67-L69)
- **结论**：前端守卫覆盖不足确认（108/131）；但"管理端权限只靠前端菜单隐藏"不成立——后端仍有 `@Allow` 兜底（抽查通过）。真实缺口是"无权限用户可进入页面并看到 FORBIDDEN/空白"，不是越权取数。
- **优先级 P1 + 理由**：属于纵深防御与可用性问题；若某个自定义 resolver 漏了 `@Allow`，就会从"体验问题"升级为越权，必须一次性核对。
- **状态**：待开发
- **依赖**：后端 `@Allow` 全量核对需后端同学配合（约 15 个自定义 resolver）；本轮先补高危页面。
- **验收标准**
  1. 20 个平台/资金/账号角色相关页面全部加 `usePermGuard(<对应 perm>)`。
  2. 用"仅门店店员"账号直接粘贴 URL 进入上述页面：提示无权限并返回，且 Network 中不出现该页首个业务请求（或出现但被后端拒绝）。
  3. 后端核对清单归档：每个前端页面 → 对应 admin 操作 → 是否有 `@Allow`；不少于 15 个自定义 resolver 签字确认，缺口补 `@Allow`。
  4. 剩余 108 页给出分批计划（按菜单权限树），并在 CI 增加规则：新增页面若无 `usePermGuard` 或白名单则告警。
- **工时**：2–4 人日

---

### VS-02 两端 token 明文存 localStorage

- **对应原清单**：#16
- **证据**
  - web-admin 存储层直接 `localStorage.getItem/setItem`，令牌键 `wa_auth_token` — [session.ts](file:///d:/zhao/vshop/web-admin/src/apis/session.ts#L1-L25)、[session.ts](file:///d:/zhao/vshop/web-admin/src/apis/session.ts#L34-L38)
  - vshop uni-app H5 走 `uni.setStorageSync`（H5 即 localStorage）— [client.ts](file:///d:/zhao/vshop/src/api/client.ts#L129-L139)
  - 后端**已支持** cookie 令牌形态 — [dev-config.ts](file:///d:/zhao/vendure/packages/dev-server/dev-config.ts#L277-L281)（`tokenMethod: ['bearer','cookie','api-key']`）
- **结论**：明文存储确认存在。描述中"彻底修复需后端改 httpOnly Cookie"不准确——后端已有 cookie tokenMethod 能力，真正的改造是**切换默认令牌形态 + 两端 withCredentials/CSRF 处理**。
- **优先级 P2 + 理由**：需要 XSS 前置条件才可被利用；当前无已知 XSS 入口。但管理端是高价值目标，仍应排期。
- **状态**：待开发
- **依赖**：后端 `authOptions` 调整 + CORS 凭据配置（服务器/网关）；两端同步发版（登录态不兼容）；需回归所有需要鉴权的接口。
- **验收标准**
  1. 后端 `tokenMethod` 收敛为 `['cookie']`（或保留 bearer 过渡期但前端不再持久化）后，`vendure-auth-token` 以 `HttpOnly; Secure; SameSite=Lax` 下发。
  2. 登录后 `localStorage`/`sessionStorage` 中不存在任何 token 明文（用 DevTools 搜索 `vendure-auth-token` 值断言）。
  3. 管理端与 H5 均能正常鉴权（含跨子域场景），退出登录后 cookie 失效。
  4. 写操作（下单/支付/审核）在 cookie 模式下有 CSRF 防护（SameSite 或双提交 token）。
  5. 回归清单：登录/续期/退出/多标签/深链 5 类场景全通过。
- **工时**：3–5 人日

---

### VS-03 操作手册静态页无鉴权

- **对应原清单**：#17
- **证据**
  - 手册页为静态文件（约 280KB）— [index.html](file:///d:/zhao/vshop/web-admin/src/static/manual/index.html)
  - 仅有 meta 反爬：`<meta name="robots" content="noindex,nofollow">` — [index.html](file:///d:/zhao/vshop/web-admin/src/static/manual/index.html#L7)
  - 仓库内**没有** `robots.txt`（`Get-ChildItem -Recurse -Filter robots.txt` 无结果），即"robots 降低暴露"并不存在
  - 手册内嵌一份文档 JS — [waimai-docs.js](file:///d:/zhao/vshop/web-admin/src/static/manual/waimai-docs.js)
- **结论**：确认存在；描述中的 robots.txt 兜底不成立（只有 noindex meta）。任何知道路径的人都能直接拿到完整运营手册。
- **优先级 P2 + 理由**：泄露的是内部操作文档（非用户数据），但可能暴露后台路径/业务规则；noindex 已降低被搜索引擎收录的概率。
- **状态**：待开发
- **依赖**：服务器权限（nginx `auth_request` 或 location 级鉴权）；或后端新增"手册下发"接口（校验 admin token）。
- **验收标准**
  1. 未登录直接访问 `/guanli/static/manual/index.html` 返回 401/302 到登录页，响应体不含手册正文。
  2. 登录后从管理端入口打开手册正常浏览，样式与内嵌文档 JS 完整。
  3. 补充 `robots.txt`（`Disallow: /static/manual/`）并与 noindex 双保险。
  4. 手册内容与当前版本菜单一致（抽查 5 个页面截图对照）。
- **工时**：1–1.5 人日

---

### VS-04 未登录深链先请求 dashboardOverview 再被踢回

- **对应原清单**：#18
- **证据**
  - 启动期只注册导航拦截 + H5 深链 `reLaunch`（异步）— [routeGuard.ts](file:///d:/zhao/vshop/web-admin/src/utils/routeGuard.ts#L42-L59)、[App.vue](file:///d:/zhao/vshop/web-admin/src/App.vue#L25)
  - 但首页组件 `onMounted` 无条件连发 4 个请求 — [dashboard/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/data/dashboard/index.vue#L440-L445)
  - 该页无 `usePermGuard`，也无 `isAuthed` 前置判断
- **结论**：确认存在。H5 首屏按 hash 直接挂载目标页，`onLaunch` 里的 `reLaunch` 是异步的，页面 `onMounted` 先跑完 → 401/FORBIDDEN 请求与错误 toast 必现。
- **优先级 P2 + 理由**：无数据泄露（后端拒绝），仅产生错误日志/提示噪音，不影响安全。
- **状态**：待开发
- **依赖**：无。
- **验收标准**
  1. 未登录清缓存后直接打开 `#/pages/data/dashboard/index`：Network 中**不出现** `dashboardOverview`/`salesTrend` 等业务请求。
  2. 页面在 ≤1 次跳转内到达登录页，且无 FORBIDDEN toast。
  3. 已登录深链进入仪表盘：请求正常，无额外跳转。
  4. 同类页面（`pages/data/*` 等）统一在 `onMounted` 首行加鉴权短路。
- **工时**：0.5 人日

---

### VS-05 H5 取消支付后继续支付 / 过期会话重登链路（真实回归）

- **对应原清单**：#19
- **证据**
  - 支付结果页 pending 态主按钮"继续支付"跳订单详情 — [pay-result.vue](file:///d:/zhao/vshop/src/pkg-order/pages/pay-result.vue#L79-L80)
  - 订单详情"去支付"入口 — [order-detail.vue](file:///d:/zhao/vshop/src/pkg-order/pages/order-detail.vue#L54)、[order-detail.vue](file:///d:/zhao/vshop/src/pkg-order/pages/order-detail.vue#L124)
  - 支付页会校验"当前活动订单仍是该单"，否则提示不可支付 — [payment.vue](file:///d:/zhao/vshop/src/pkg-order/pages/payment.vue#L89-L94)
  - 会话失效探测与重登（C 端）— [client.ts](file:///d:/zhao/vshop/src/api/client.ts#L98-L127)；管理端同类实现与响应头捕获 — [client.ts](file:///d:/zhao/vshop/web-admin/src/apis/client.ts#L20-L23)
  - 历史修复仅按代码路径完成，无支付渠道真机回归记录
- **结论**：代码路径齐全，但**无真实渠道回归证据**（取消支付后的订单状态恢复、超时关单与重开支付、token 过期后重新登录能否继续支付，都依赖真实会话与渠道回调）。
- **优先级 P1 + 理由**：涉及真实资金链路；代码看似正确但未验证，失败即用户已付款/重复付款风险。
- **状态**：待验证
- **依赖**：真实微信/支付宝商户与测试号；真实用户账号；**必须先完成 VM-08（H5 IP/渠道账号）**，否则回归结论会被支付渠道侧问题污染。
- **验收标准**
  1. 用例 A（取消后继续）：H5 拉起支付→用户取消→返回 `pay-result` 显示未支付→点"继续支付"→完成支付→订单状态 `PaymentSettled`，且**不产生重复支付流水**（后台支付记录 1 条成功）。
  2. 用例 B（超时关单后继续）：待支付订单等过自动关单时间→"去支付"提示不可支付并引导重新下单；不出现白屏/卡死。
  3. 用例 C（会话过期）：清除 token 后点"继续支付"→跳登录→登录后回到该订单并可继续支付，订单归属仍为该用户。
  4. 用例 D（弱网/回落）：支付成功后回调延迟，`pay-result` 轮询上限内能转为成功；超时后手动刷新能正确显示最终态。
  5. 四组用例各产出手机截图（390×844）并入操作手册/测试用例文档。
- **工时**：1–2 人日（回归与文档，不含修 bug 时间）

---

## 4. 建议的跨仓库执行顺序

> 原则：**后端 lib 重建/发布必须早于依赖该字段的前端改动**；同文件互斥的改动合并同一批；支付类回归必须排在支付侧修复之后。

### 阶段 0：对齐与判定（0.5 人日，可并行）

1. 核 NS-02 的 Meili key 权限（决定是否升级 P0）。
2. 产品确认 VM-02（订阅/服务券）与 VM-03（江湖技能）是否本期上线。
3. 运维确认生产 `DB_SYNC` 取值（决定 VM-02 是否必须手写迁移先行）。

### 阶段 1：vendure 后端（第一批，1–2 个发布窗口）

按依赖排序：

1. **VM-05 的重建前置**：`campus-delivery-plugin` 重新构建 lib（含 VM-07 的修复），一次构建覆盖两项。
2. **VM-07 + VM-06 + VM-08 + VM-01**（代码互不相交，可并行开发，同一批发布）。
3. **NS-01**（限流）属后端改动，与上批同发，避免两次发布。
4. **VM-02 / VM-03** 需要新建表 → 独立迁移窗口，与上批分开（便于失败回滚）。
5. 发布后立即验证 VM-05 的 introspection（`integrated` 是否出现），这是阶段 2 的前置门禁。

### 阶段 2：vshop（第二批，依赖阶段 1）

1. **VS-04 + VS-01**：同属启动期/权限域，`App.vue`、`routeGuard.ts`、`dashboard` 改动集中一次（VS-04 先做，成本最低）。
2. **VM-05 前端部分**（waimai `locker.ts` + web-admin `campus.ts`）必须在阶段 1 第 5 步通过后做；与 VS-01 都会触碰 `campus/*` 页面，建议 VS-01 的 campus 页面放在 VM-05 之后，避免同文件冲突。
3. **VS-03**（nginx/后端鉴权）独立，需服务器窗口，可与 VS-01 并行。
4. **VS-02**（cookie 令牌）放最后：会改变全局登录态，避免阻塞前面所有功能的回归。

### 阶段 3：nshop（与阶段 2 并行，仓库独立无冲突）

1. **NS-03**（租户失败态）独立，风险最低、收益最高，优先做。
2. **NS-05**（take）与 **NS-04**（title/i18n 代码部分）可并行；NS-04 的翻译录入交运营并行推进。
3. NS-02 若需改服务端代理，与阶段 1 的后端发布合并。

### 阶段 4：支付与文档回归（最后）

1. **VS-05** 必须在 VM-08 上线后进行，用真实商户号与真实账号跑完 4 组用例。
2. 产出手机截图 + 测试用例文档（交付硬规范）。

**冲突提示**

- `vshop/web-admin/src/apis/campus.ts` 同时被 VM-05 与 VS-01 触及 → 串行。
- `waimai/src/api/queries/locker.ts` 仅 VM-05 触及。
- `vendure/packages/dev-server/dev-config.ts` 被 VM-02（注册）与 NS-02（若加代理）触及 → 若同批发布需合并检查。
- 所有 vendure plugin 改动都要重新构建对应 `lib`，否则线上仍跑旧产物（VM-05 已证明这是真实风险）。

---

## 5. 需要用户 / 外部配合的事项

| # | 事项 | 关联任务 | 需要的角色/权限 | 阻塞程度 |
|---|---|---|---|---|
| 1 | 核实 Meili search key 的真实权限（search-only？admin？） | NS-02 | Meili 管理端或服务器 shell | 决定 P1/P0，阻塞结论 |
| 2 | 提供真实微信商户号 + 已备案 H5 授权域名，跑小额真实订单 | VM-08、VS-05 | 商户资质/运营 | 阻塞验收 |
| 3 | 提供真实用户账号（含"取消支付后待支付订单"）用于分层回归 | VS-05 | 测试账号 | 阻塞验收 |
| 4 | 确认生产 `DB_SYNC` 与迁移执行窗口 | VM-02、VM-03 | 服务器/DB 权限 | 阻塞上线 |
| 5 | 后台录入商品/分类英文翻译，并确认 `/en` 验收口径 | NS-04 | 运营/内容 | 阻塞该项验收 |
| 6 | 确认订阅/服务券、江湖技能是否本期上线 | VM-02、VM-03 | 产品负责人 | 决定优先级 |
| 7 | nginx `auth_request` 或后端手册接口的方案确认与权限 | VS-03 | 运维/服务器权限 | 阻塞实施 |
| 8 | 后端 `@Allow` 全量核对签字（约 15 个自定义 resolver） | VS-01 | 后端负责人 | 阻塞 P1 收尾 |
| 9 | 提供一条有 ≥1 条 `pos_session` 的 POS 终端测试数据 | VM-06 | 运营/测试环境 | 阻塞复现 |
| 10 | 确认生产是否已有网关层限流（`limit_req`） | NS-01 | 运维 | 影响优先级判定 |
| 11 | 部署窗口与发布审批（vendure 需重建 lib + 迁移） | 全部后端任务 | 发布负责人 | 阻塞交付 |

---

## 6. 核实过程中发现与原始描述不一致的地方

1. **VM-04（原 #4）完全不成立**：`privacyNumberEffectiveProvider/Degraded/Note` 在 `src` 与 `lib` 均已存在，且 web-admin 前端**仍在使用**，并非"后端不存在、前端已删"。
2. **VM-09（原 #9）已是提交状态**：校验代码在 master 且无未提交改动；全仓库仅有这一个 `contactPhone` 写入入口，不存在"其他未加校验入口"。剩余只是部署确认。
3. **VM-01（原 #1）范围更大**：`createShippingTemplateInput` 与 `update...Input` **两个**输入都有同样问题，缺陷不止 update。
4. **VM-05（原 #5）比描述更严重**：campus-delivery `lib` 不只缺 `integrated`，本地 `lib` 还有未提交的 p42 迁移、骑手合规任务、遥测留存等差异，整体落后于 `src`。
5. **VM-07（原 #7）根因不同**：不是普通关系加载问题，而是本仓库 fork 的 core 把 `Order.shippingAddress` 改成了 `simple-json` 列（`order.entity.ts#L130-L132`），任何 `relations: ['shippingAddress']` 必抛错；共 **2 处**（`hall.service.ts`、`third-party-delivery.service.ts`），不止报错的那一处。
6. **VM-08（原 #8）实际是两套代码路径**：handler 用 `ctx.req.ip || 127.0.0.1`（受 nginx 代理影响），service 用**硬编码** `127.0.0.1`；修一处不修另一处仍会复现。
7. **NS-03（原 #12）机制不同**：正常解析路径无"窗口"，问题在**解析失败时整页降级为默认店**（客户端 plugin catch、SSR `ctx.tenant` 缺失两处），比"短暂串店窗口"更确定、也更容易复现。
8. **NS-04（原 #13）范围更小**：只有 `lookup` 等少数页 title 是路由名；`Checkout` 没有 `definePageMeta.title`，会落到站点名。另有 4 个页面写死中文标题。`/en` 中文是**数据未翻译**（代码已正确传 `languageCode`），不是代码缺陷。
9. **VS-01（原 #15）后端并非"只靠前端菜单隐藏"**：抽查 `tenants` 查询有 `@Allow(Permission.SuperAdmin)`；实际缺口是 **108/131** 页面无 `usePermGuard`（`hasPermission` 12 文件/23 处与描述一致）。
10. **VS-02（原 #16）后端已支持 cookie**：`authOptions.tokenMethod` 已包含 `'cookie'`（`dev-config.ts#L277-L281`），无需"修改后端新增能力"，需要的是切换形态 + 两端改造 + CSRF 防护。
11. **VS-03（原 #17）没有 robots.txt**：仓库内不存在 `robots.txt`，兜底只有 HTML meta `noindex,nofollow`。
12. **VM-02（原 #2）生产同步开关**：`synchronize: DB_SYNC !== '0'`，若线上关闭同步则必须手写迁移，注册插件并不会自动建表。
13. **NS-05（原 #14）没有大面积问题**：只定位到 1 处确凿隐患（售后留言首屏不带 `take`），其余 `.gql` 列表查询均已显式分页。

---

## 7. 构建/发布风险提示：campus-delivery `lib` 处于手工 splice 状态

> 更新时间：2026-11-06（commit `91ab82866`）

- `packages/campus-delivery-plugin/lib` 与 `src` 历史不同步：`lib` 落后于 `src`，且本地曾存在 p42 迁移、骑手合规任务、遥测留存等**未批准差异**（见 VM-05 与 §6.4）。
- 本次 C-5（埋点 `createdAt` 解析 + 非法时间回落 warn）对 `lib/src/telemetry.js`、`lib/src/telemetry.service.js` 采用**手工 splice**：只按 `src` 的最小差异手工修改产物，未对 campus-delivery-plugin 整包重编译。
- 原因：整包 `tsc` 会把本包 `src` 中所有未批准/未上线的改动一并带进 `lib`（上次实测 84 个文件），等于绕过发布审批。
- **后续规则（强制）**：任何人做 campus-delivery-plugin 整包构建前，必须先回到 `src` 并与「已批准改动清单」逐项核对；`src` 与清单不一致时禁止整包构建。手工 splice 的产物在整包构建后会以 `src` 为准被覆盖，构建后必须重新核对并重跑验证。
- 本次随提交批准入库的 campus 改动仅两条：`src/telemetry.ts`（`parseEventTime` + 回落 warn）、`src/telemetry.service.ts`（写入 `createdAt`）。

---

## 8. 配置管理遗留（2026-11-06，A1/A4 收尾）

> 背景：2026-11-06 已在生产完成 A1（`/guanli/` 三个安全响应头）与 A4（`/guanli/static/manual/` 整前缀 basic auth），当时只落在服务器 nginx 配置，未进仓库。

### CM-01 e.joho.cn 的响应头与手册鉴权只存在于服务器配置

- **现状**：`X-Frame-Options: DENY`、`Content-Security-Policy: frame-ancestors 'none'`、`Strict-Transport-Security: max-age=31536000` 与 `/guanli/static/manual/` 的 `auth_basic` 均只写在服务器 `conf.d/e.joho.cn.conf`；仓库内只有摘录片段 [deploy/nginx/e.joho.cn.conf](file:///d:/zhao/vshop/deploy/nginx/e.joho.cn.conf)，非可直接部署的完整配置。
- **风险**：重建容器、迁移服务器、他人改配置或站点重建时容易被静默覆盖/丢失，安全头与鉴权回退且无人察觉。
- **建议**：把 e.joho.cn 的 nginx 配置纳入配置管理（至少把 `conf.d/e.joho.cn.conf` 整体纳入仓库或运维配置仓库），发布/变更走 diff 审核；并在上线后加一条巡检：`curl -I /guanli/` 必须含三个头、匿名访问 `/guanli/static/manual/index.html` 必须 401。
- **优先级**：P2（不影响功能，影响安全基线可追溯性）

### CM-02 手册 basic auth 凭据需定期轮换

- **现状**：凭据文件为服务器 `/www/sites/e.joho.cn/log/.manual_htpasswd`（权限 600），账号 `joho-staff`，由运维签发；仓库只记录路径，不含账号密码。
- **要求**：按季度轮换，或人员变动/离职时立即轮换；轮换后无需 reload nginx（文件热生效），但要复验「匿名 401 / 带凭据 200」。
- **后续（可选）**：若要求与后台登录态复用，需改 `auth_request` + 后端校验 admin token 的方案（对应 VS-03 的另一条路径）。
- **优先级**：P2

---

## 9. SSR 表单 hydration 前原生提交会把凭据带进 URL（2026-11-06）

### NS-06 账号表单未拦截 hydration 前的原生提交

- **现象**：SSR 页面（`/account/login`）在 JS 产物尚未加载/未 hydration 时点击提交按钮，浏览器按原生表单 GET 提交，账号与密码会以 `?identifier=...&password=...` 形式进入地址栏，同时向服务器发出一次携带凭据的请求。
- **影响**：凭据进入浏览器历史、代理/网关访问日志与 Referer；属于凭据泄漏面，正常用户慢网/首屏快速点击时可触发。
- **修复（nshop）**：给含凭据字段的账号表单加**不依赖组件逻辑**的内联拦截 `onsubmit="return false"`，覆盖：
  - `layers/base/app/components/account/LoginForm.vue`（identifier/password）
  - `layers/base/app/components/account/RegisterForm.vue`（email/password×2）
  - `layers/base/app/components/account/ResetPasswordForm.vue`（password×2）
  - `layers/base/app/components/account/RequestPasswordResetForm.vue`（email）
  - 提交：`497dbc0`；线上验证：拦截 JS 产物模拟 hydration 前提交，三个 SSR 表单 URL 均无 `identifier=`/`password=`/`email=`；`password-reset` 页在 SSR 不渲染表单（`onMounted` 后才出现），JS 正常时属性存在。
- **限制**：浏览器**完全禁用 JS** 时，内联事件处理器同样不执行，因此该模式仍会发生原生提交；这是内联方案的固有限制（要彻底覆盖需把提交按钮改为非 submit 并放弃 Enter 提交，代价更大）。
- **后续约定（强制）**：新增任何把 `identifier`/`password`/验证码作为表单字段的 SSR 页面，`UForm`/`<form>` 必须带 `onsubmit="return false"`；合并前用「拦截 JS 产物」模式复验：点击提交后 URL 不出现凭据参数。
- **优先级**：P2（已修复；约定待后续表单遵守）

---

## 10. Schema 契约与产物治理（2026-11-06，SDL 漂移盘点后）

> 背景：外卖审计把生产实际存在的 `MyMessageListOptions` 判成「类型不存在」，原因是本地仓库与生产 schema 漂移；同一天还发现生产运行态的 `myMessages` 契约与服务器磁盘 `lib` 不一致。仓库已按生产契约恢复 `MyMessageListOptions`，但不解决基线漂移这个根因。

### SC-01 生产 SDL 快照入仓作为契约基线

- **做法**：从有 introspection 权限的环境导出 shop-api / admin-api 的 SDL（或由生产侧构建流程导出 `schema.graphql`），存到仓库固定路径（如 `schema/production-shop.graphql`、`schema/production-admin.graphql`），随版本更新。
- **用途**：前端调用、审计、后端改造都以快照为「生产现状」，不再拿 `src` 反推生产。
- **注意**：生产 introspection 被 HardenPlugin 禁用，导出需在有权限的环境或 CI 部署后执行，不能直接依赖线上内省。
- **优先级**：P1（漂移已造成误报与契约风险）

### SC-02 CI 做 schema 兼容 diff

- **做法**：每次合并前，把「本次构建产物生成的 SDL」与仓库快照 diff；只允许兼容性变更（新增可选字段/类型、新增枚举值需评估），破坏性变更（删字段、改参数类型、必填化）必须显式审批并在快照中同步。
- **补充**：diff 结果作为构建日志附件，失败时阻断合并。
- **优先级**：P1

### SC-03 禁止手改 lib 产物，产物只能来自已提交 src

- **规则**：`packages/*/lib` 与 `packages/dev-server/dist` 只能由 `npx tsc -p tsconfig.json` / `tsconfig.prod.json` 从已提交的 `src` 生成；禁止 scp 覆盖或手工编辑产物上线。
- **发现行为与磁盘不一致时**：先按已提交 `src` 重新构建部署，再复测，不允许「保留手工产物 + 只在仓库改 src」的双轨状态。
- **优先级**：P1

### SC-04 上线后 schema 冒烟

- **做法**：每次部署后跑一组固定探针（关键查询 + 参数类型探针），确认 `myMessages(options:{take:5})`、`myVouchers`、`availablePlans`、`mySubscriptions` 等 C 端入口不报 400 或「字段不存在」。
- **优先级**：P2

