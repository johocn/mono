# 租户行业类型 + 商品三类型 设计文档

- 日期：2026-10-09
- 状态：已确认（架构/UI/行业清单/迁移方式均经用户确认）
- 范围：vendure cjk-plugin、campus-delivery-plugin、web-admin；外卖端（waimai）零改动

## 1. 背景与目标

平台多租户（租户 = Vendure Channel）需要行业维度管理：外卖频道只对餐饮行业租户开放。
商品需要区分实体/虚拟/服务三种类型（首期纯标记）。

## 2. 已确认决策

| 决策点 | 结论 |
|---|---|
| 商品类型首期深度 | 纯标记：落库 + 表单可选 + 详情页标签，不改结算/运费/库存/外卖过滤 |
| 行业字典管理 | 代码预制 Channel customField options（同 merchantStatus 模式），新增行业需发版 |
| 外卖显示判定 | `industryType=catering` **且** 已配履约配置（AND 叠加，保留现有条件） |
| 存量兼容 | migration 批量把已配履约配置的渠道刷为 catering（campus-delivery-plugin 内） |
| 行业设置权限 | 仅平台管理员（web-admin 平台侧租户管理），租户端不可改 |

## 3. 现状关键位置

- 租户 customFields：`vendure/packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts`
- 外卖店铺列表：`vendure/packages/campus-delivery-plugin/src/waimai-store.service.ts` `listStores()`（当前条件：有 CampusFulfillmentConfig 且非默认渠道）
- 商品表单：`vshop/web-admin/src/components/ProductForm.vue`（ProductDraft 无类型概念）
- 平台侧租户管理：cjk-plugin schema 已有 `tenants`/`updateTenant`/`setTenantEnabled`
- 商品 customFields 既有先例：review-plugin（reviewRating）、marketplace-plugin（videoAssetId）

## 4. 设计方案

### 4.1 数据模型（新增 customFields）

**Channel.industryType**（cjk-plugin `tenant-channel-custom-fields.ts`）

- type: string，public: true，defaultValue: 未设置（nullable）
- options（8 项预制，餐饮为外卖准入项）：
  | value | 中文 |
  |---|---|
  | catering | 餐饮 |
  | retail | 零售商超 |
  | fresh | 生鲜果蔬 |
  | service | 生活服务 |
  | hotel | 酒店民宿 |
  | beauty | 美容美发 |
  | education | 教培 |
  | other | 其他 |

**Product.productType**（cjk-plugin 新增 Product customFields 段）

- type: string，options：physical（实体，defaultValue）/ virtual（虚拟）/ service（服务）
- 挂 Product 级（非 Variant 级），public: true

### 4.2 外卖过滤规则

`waimai-store.service.ts#listStores()` 在现有条件下叠加：

```
显示 = 非默认渠道 且 有 CampusFulfillmentConfig 且 customFields.industryType === 'catering'
```

外卖端（waimai）零改动，后端过滤后列表自然只剩餐饮店铺。

### 4.3 存量迁移

- 位置：campus-delivery-plugin 新增 migration（自持表，避免跨插件耦合；幂等可重复执行）
- 逻辑：`UPDATE channel SET customFields->>'industryType'='catering' WHERE id IN (SELECT channelId FROM campus_fulfillment_config)`
- 上线后语义干净：外卖列表 = 餐饮 且 已配履约，无兼容回退分支

### 4.4 web-admin UI

1. **平台侧租户管理**：新增"行业类型"必选下拉（带"新增"标记的表单块），仅平台管理员可见可改；租户侧 `myUpdateChannelCustomFields` 白名单不含该字段（租户不可改）。
2. **商品编辑表单**（ProductForm.vue 基本信息 Tab）：新增"商品类型"三选一 segmented 控件，默认实体商品；helper 文案注明首期仅标记。

### 4.5 查询层同步

- web-admin 商品读写（ProductDraft、保存逻辑）带上 `productType`；**保存时必须带上该字段，避免整体覆盖 customFields 时被清空**。
- C 端详情页类型标签为可选展示项：仅在已查询商品 customFields 的页面（vshop/waimai 商品查询）顺带补充该字段展示，不为此新增查询改造；未改造前 C 端无感知。
- `shopChannels`（店铺切换器）首期不动。

## 5. 改动清单

| 层 | 文件 | 改动 |
|---|---|---|
| vendure | cjk-plugin `src/tenant/tenant-channel-custom-fields.ts` | + Channel.industryType（8 options） |
| vendure | cjk-plugin（新增或并入 custom-fields 段） | + Product.productType（3 options，默认 physical） |
| vendure | campus-delivery-plugin `src/waimai-store.service.ts` | listStores 叠加行业过滤 |
| vendure | campus-delivery-plugin `src/migrations/` | 存量刷 catering migration |
| web-admin | 平台侧租户管理组件 | 行业类型下拉（平台管理员） |
| web-admin | `src/components/ProductForm.vue` + 相关 apis | 商品类型控件 + ProductDraft 字段 + 保存透传 |
| waimai | 无 | 后端过滤，零改动 |

## 6. 兼容性与风险

- **存量外卖店消失风险**：已由 migration 规避（先刷行业再上过滤，同一部署内 migration 先于服务对外）。
- **customFields 覆盖清空**：ProductForm 保存路径整体写 customFields 的场景必须透传 productType（实现时重点回归）。
- **行业清单发版成本**：已确认接受（代码预制）；后续如需动态字典再演进。
- **商品类型首期不联动**：虚拟/服务商品仍走实体结算链路（运费/库存照旧），详情页仅加标签。

## 7. 非目标（首期不做）

- 行业字典后台管理 UI
- 虚拟/服务商品的免运费、无库存、核销/预约等业务联动
- 外卖端店铺卡片行业标签展示
- shopChannels 店铺切换器行业过滤

## 8. 测试与验收

- e2e/API 回归：listStores 过滤（餐饮显示、非餐饮隐藏、未设置行业隐藏）；存量迁移幂等
- web-admin：租户管理设置行业 → 外卖列表即时生效；商品类型保存 → 重开不丢失（覆盖回归点）
- 手机截图硬规范：外卖首页店铺列表（390×844 dpr=2）截图补充到操作手册
- 交付物：实现 + 回归 + 手机截图 + 操作手册/测试用例文档
