# 到店核销「租户归属 + 销售员配送档案范围」设计

- 日期：2026-10-02
- 状态：待用户评审
- 关联代码：vendure/packages/cjk-plugin、vendure/packages/coupon-plugin、vshop/web-admin
- 关联文档：`docs/superpowers/plans/2026-10-02-coupon-multi-channel-distribution-plan2-backend-sale-bundle.md`（触发本次的残留项）、`docs/superpowers/specs/2026-08-23-shipping-payment-profile-enhancement-design.md`（配送档案三级作用域）

## 1. 背景与目标

`inStoreBills` / `inStoreBillSummary` 目前仍为 `@Allow(Permission.UpdateOrder)` 平台级，店主（`ManageOwnShop`）打不开到店流水页；同时到店自提核销（cjk-plugin `redemption`）与到店买单核销（coupon-plugin `in-store-bill`）的核销接口只按 `ctx.channelId` 隔离——`sales` 角色自带 `UpdateOrder`，因此**销售员能看到、能核销本租户全部单据**，属越权。

用户目标是：

- **归属**改为按**登录租户**（activeChannel）归属；超管未选租户时归默认租户；
- 引入**销售员**层级：店主可核销本租户全部；销售员只能在**被授权的配送档案范围**内核销；
- 核销面覆盖两类对象：**商品订单**（到店自提单）与**商品关联的到店支付优惠券**；
- 销售员只能看见自己有权核销的订单与到店券；
- 到店流水/汇总对店主开放。

## 2. 关键决策

| 决策点 | 结论 |
|---|---|
| 核销归属 | `ctx.channelId`（登录租户）；未选租户 → 默认租户。**不新增 `InStoreBill.shopId` 快照列** |
| 同租户跨门店 | 对店主/超管互相可见（不再按门店隔离） |
| 授权载体 | **`TenantMember`（租户人员）** 上挂配送档案白名单 `shippingProfileIds` |
| 身份判据 | **新增专用核销权限**：复用 cjk-plugin 既有但未实现的 `VerifyOrder`。持有=受限核销员 |
| 空白名单 | **默认拒绝**（看不到/核销不了任何单据） |
| 命中语义 | **必须全部命中**：订单所有商品行、券模板所有关联商品都须落在白名单内 |
| 通用券（未关联任何商品） | 对受限核销员**一律拒绝**核销 |
| 受限核销员的流水/汇总 | **只看自己经手的笔数**（`operatorId = ctx.activeUserId`），不做档案反查 |
| 档案取值时机 | 取**实时**档案值（核销是当下行为），不做下单快照 |
| 既有租户如何生效 | 店主在**角色管理**勾 `VerifyOrder` + **人员管理**配档案；新建租户由 `sales` 角色模板默认带上 |

## 3. 概念模型：判定链

```
登录人 + 当前租户 channelId
  └─ 是否持有 VerifyOrder 权限
       ├─ 否 → 本租户全量（平台超管 / 店主 / 租户管理员）
       └─ 是 → 读 TenantMember(administratorId, channelId) 的 shippingProfileIds
            ├─ 无成员记录 或 白名单为空 → 空集：一律拒绝（默认拒绝）
            └─ 非空 → 对象是否「全部命中」授权档案
                 ├─ 否 → 拒绝核销
                 └─ 是 → 放行：可见 + 可核销
```

判定链封装为**单一入口** `resolveRedeemScope(ctx)` → `{ restricted: boolean; shippingProfileIds: string[] }`，所有调用点统一消费，避免各 resolver 自行拼装条件。

### 3.1 对象 → 档案 的映射

| 对象 | 档案来源 |
|---|---|
| 到店自提单 | `order.lines[].productVariant.customFields.shippingProfileId`（cjk-plugin 既有分箱键） |
| 到店支付券 | `ProductCouponBinding(couponTemplateId)` → `productId` / `variantIds` → 变体的 `customFields.shippingProfileId` |

「全部命中」的严格口径：

- 自提单：`order.lines` **任一行**档案为空（变体未绑档案）或不在白名单 → 不通过；
- 到店券：`ProductCouponBinding` **无记录** → 一律拒绝；有记录但**任一**关联商品/变体的档案不在白名单 → 拒绝。

## 4. 数据模型改动

### 4.1 `TenantMember` 加白名单列

`vendure/packages/cjk-plugin/src/tenant/tenant-member.entity.ts` 新增：

```ts
/** 可核销配送档案白名单（ShippingProfile.id）。为空 = 默认拒绝（仅在持有 VerifyOrder 时生效） */
@Column({ type: 'simple-json', default: [] })
shippingProfileIds!: string[];
```

迁移：`packages/cjk-plugin/src/migrations/AddTenantMemberRedeemProfiles.ts`，以 provider 形式注册进 `@VendurePlugin`（与既有迁移一致）。生产 DDL 由 psql 手工执行（本项目既有路径）。

### 4.2 `InStoreBill` 不改

核销归属即 `channelId`，现有列已满足；配套**取消**上一版设计中的 `shopId` 快照列与 `AddInStoreBillShopMigration`。

### 4.3 GraphQL 增量

- `type TenantMember` 加字段 `shippingProfileIds: [ID!]!`
- 新增 mutation `setTenantMemberRedeemProfiles(id: ID!, shippingProfileIds: [ID!]!): TenantMember!`，权限 `TenantMemberManage`
- `InStoreBill` / `Redemption` 相关类型**无新字段**

## 5. 跨插件集成（关键实现约束）

`cjk-plugin` 的 `package.json` **已依赖** `@vendure/coupon-plugin`（反向依赖会成环），而 `TenantMember` 实体在 cjk-plugin。因此 coupon-plugin **不能直接 import** cjk-plugin 的任何东西。

采用**注册式适配器**，保持依赖方向不变：

1. coupon-plugin 新增 `src/redeem-scope.ts`：定义 `RedeemScope` 类型、`setRedeemScopeResolver(fn)` 与 `resolveRedeemScope(ctx)`。
   - 未注册实现时返回 `{ restricted: false }`（向后兼容；也是 coupon-plugin 既有 150 个单测不被破坏的前提）。
2. cjk-plugin 新增 `src/tenant/redeem-scope.service.ts`：实现判定（读 `TenantMember` + `ShippingProfile`，含订单侧与券侧两个判定方法）。
3. cjk-plugin 在插件 `onApplicationBootstrap` 中调用 `setRedeemScopeResolver(...)` 完成注册。
4. 权限名：`VerifyOrder` 的 `PermissionDefinition` **只在 cjk-plugin 注册**（同名重复注册会冲突）。coupon-plugin 侧用带断言的字面量常量并注明单一来源：

```ts
/** 单一来源：cjk-plugin tenant-permissions.ts 的 VerifyOrder；此处用字面量避免反向依赖 */
export const VERIFY_ORDER_PERMISSION = 'VerifyOrder' as Permission;
```

## 6. 收口点（接口级）

### 6.1 到店自提核销（cjk-plugin）

`packages/cjk-plugin/src/redemption/redemption.resolver.ts`：

| 接口 | 改动 |
|---|---|
| `myPendingRedemptions` | `@Allow(UpdateOrder, VerifyOrder)`；受限时只返回「所有行档案 ∈ 白名单」的自提单 |
| `redemptionLookup` | 同上；受限时命中范围外一律返回 `{ order: null, ... }` |
| `redemptionClaim` | 同上；受限时范围外抛拒绝（沿用 `ERR_NOT_FOUND` 口径，不泄漏存在性） |
| `redemptionReissue` | 同上 |

实现要点：`listPending` 现在是「先取全量 → 解密筛选 → `slice` 分页 → 仅对当页 hydrate lines」。加范围过滤后**必须在分页前完成行档案判定**（否则 `totalItems` 与分页错位）；仅在 `restricted` 分支才做逐单 hydrate，避免给不受限的店主/超管增加开销。

### 6.2 到店买单（coupon-plugin）

`packages/coupon-plugin/src/in-store-bill-admin.resolver.ts`：

| 接口 | 改动 |
|---|---|
| `inStoreCustomerCoupons` | 加 `VerifyOrder`；受限时券列表按「券模板全部关联商品档案命中」过滤，通用券不返回 |
| `inStoreBillQuote` | 加 `VerifyOrder`；受限时不通过 → 返回 `ok:false` + `reason='SCOPE_MISMATCH'` |
| `inStoreBillRedeem` | 加 `VerifyOrder`；受限时不通过 → `UserInputError`（新增 `SCOPE_MISMATCH` 提示文案） |
| `inStoreBills` | `@Allow(UpdateOrder, manageOwnShop.Permission, VerifyOrder)`；受限核销员强制 `b.operatorId = :activeUserId` |
| `inStoreBillSummary` | 同上（店主 = 本租户全量，受限核销员 = 自己经手） |

`InStoreBillService` 侧改动：

- `locate()` 的校验链末尾（现有 `assertManagedByShop` 之后）追加**档案范围校验**：`resolveRedeemScope` 为受限时，要求券模板全部关联商品档案命中白名单，通用券直接判 `SCOPE_MISMATCH`。`quote` 与 `redeem` 共用 `locate`，天然一致。
- `IN_STORE_REASON` 新增 `SCOPE_MISMATCH` 及其 message（zh/en）。
- `buildBillsQuery` 增加受限分支（`b.operatorId = :activeUserId`）；`list`/`summary` 共用，天然一致。

## 7. 前端（vshop/web-admin）

- **人员管理**编辑弹窗新增「可核销配送档案」多选（`shippingProfiles` 列表过滤当前租户可见档案）；仅当该成员角色含 `VerifyOrder` 时展示该区块，走新 mutation。
- **到店自提核销页 / 到店买单核销页 / 到店流水页**：补空态文案（如「你尚未被授权核销任何配送档案范围，请联系店主配置」）；受限时隐藏与范围无关的筛选（如平台视角的门店筛选）。
- **到店流水菜单**：店长端 `menu.domain.inStore` 已含 `menu.inStoreBills` 指向 `/pages/in-store/bills/index`，无需新增菜单；本次仅服务端放行权限。
- i18n：新增词条同步 `zh-Hans` / `zh-Hant` / `en` 语言包。

## 8. 生效范围与边界

### 8.1 角色模板改动（只影响新建角色，不回填既有角色）

模板改动共 **2 处，缺一不可**：

| 文件 | 位置 | 改动 | 不改的后果 |
|---|---|---|---|
| `role-templates.ts` | `OFFICIAL_ROLE_TEMPLATES` 的 `sales` | `permissions` 追加 `'VerifyOrder'` | 新租户销售员仍不受限（看本租户全量） |
| `tenant-member.service.ts` | `PERMISSION_CATALOG` 的 `order` 分组 | `VerifyOrder` 由 `tenant` 分组移入 `order` 分组，label「核销·预留」→「核销·按配送档案」 | 该权限本已在白名单内，此项仅为角色管理页可发现性 |

`BUSINESS_PERMISSIONS` 由 `PERMISSION_CATALOG` 扁平派生，移动分组后 `VerifyOrder` 仍在白名单内，`assertBusinessPermissions` 不会拒绝。

**差异（仅针对新建租户/新建角色）**

| 角色 | 改动前 | 改动后 |
|---|---|---|
| 销售（`sales`） | 仅 `UpdateOrder` → 不受限，可看/核销本租户全量 | 增加 `VerifyOrder` → **受限核销员**；白名单为空 = 看不到任何单据，店主配置后才放行 |
| 租户管理员（`tenant-admin`） | 含 `ManageOwnShop` | **不变**：不是受限核销员，仍看本租户全量（店主层） |
| 收银员（`cashier`） | 含 `ManageOwnShop` | **不变**：到店收银按整租户口径，不按配送档案划片 |
| 库存（`stock`） | 无 `UpdateOrder` / `ManageOwnShop` | **不变**：本无核销入口 |

**不回填既有角色**：`createTenantRoleDirect` / `createTenantRoleRecord` 仅在角色不存在时创建，`importDefaultRoles` 已初始化即返回空数组。因此生产既有租户的销售角色**不会**凭空获得 `VerifyOrder`，需店主手工勾选——刻意避免既有销售员在未配白名单时突然失明。这与 `ensurePOSRolesForChannel` 主动给 `tenant-admin` 补 `ManageOwnShop` 的做法不同：补角色安全，补权限会失明。

**既有租户的上线步骤**：

1. 店主/平台在**角色管理**给销售角色勾上「核销·按配送档案」；
2. 在**人员管理**为该成员勾选可核销配送档案。

### 8.2 已知边界

- **实时档案**：白名单与商品档案均取实时值，档案调整会影响「历史未核销单据」的可见性（核销属当下行为，接受此语义）；
- **受限核销员的流水口径**为「自己经手的笔数」而非「档案范围内」，与核销可见范围不完全等价（店主全量、销售员仅自身）；
- 到店自提核销仍只覆盖 `deliveryType = pickup` 的订单（不新建配送单核销面）。

## 9. 验证

- **单测 / e2e**
  - cjk-plugin（redemption）：空白名单 → 列表空、扫码返回 null、claim 拒绝；跨档案单 → 不可见；全命中 → 可见可核销；店主/超管不受限。
  - coupon-plugin（in-store-bill）：通用券 → 受限核销员拒绝；部分商品未命中 → 拒绝；全命中 → 放行；流水/汇总受限时只含自己经手的笔数。
  - 既有 150 个 coupon-plugin 用例（未注册 scope 实现 → `restricted:false`）保持全绿。
- **截图**：手机视图 390×844、dpr=2，覆盖「人员授权配置」「受限核销员列表（含空态）」「店主可见的本租户全量流水」；截图补进操作手册。
- **部署**：本地构建 → joho `git pull` + `pm2 restart`（vendure 与 vendure-worker）。

## 10. 不实现（YAGNI）

- 不做下单时配送档案快照；
- 不做按角色绑定档案范围（已选人员级）；
- 不新建配送单核销面；
- 不做「授权档案的所见即所得运营报表」。

## 11. 风险与注意事项

- **依赖方向**：禁止让 coupon-plugin 依赖 cjk-plugin（会成环）；范围判定一律经注册式适配器或字面量常量。
- **分页正确性**：`listPending` 的范围过滤必须在 `slice` 之前。
- **权限名唯一**：`VerifyOrder` 的 `PermissionDefinition` 只注册一次（cjk-plugin），重复注册会冲突。
- **不泄漏存在性**：受限核销员对范围外单据统一按「查不到」处理，不区分「不存在」与「无权限」。
