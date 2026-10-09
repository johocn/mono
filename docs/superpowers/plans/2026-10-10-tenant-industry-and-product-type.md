# 租户行业类型 + 商品三类型 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 租户（Channel）增加预制行业类型字段；仅餐饮行业租户在外卖频道显示；商品增加实体/虚拟/服务三类型（首期纯标记）。

**Architecture:** 后端在 cjk-plugin 注册 Channel/Product customFields（枚举 options），平台侧 `updateTenant` 扩展 `industryType` 写入并禁止租户端越权修改；campus-delivery-plugin 的 `waimaiStoreList` 叠加行业过滤 + 启动迁移刷存量；web-admin（uni-app H5）在租户详情页加行业编辑行、商品表单加类型三选一。

**Tech Stack:** Vendure 3.6.4（NestJS/TypeORM，PostgreSQL）、Vue3 uni-app（web-admin）、GraphQL。

**设计文档:** `docs/superpowers/specs/2026-10-09-tenant-industry-and-product-type-design.md`

**环境注意（Windows PowerShell）:**
- 不支持 `&&`，用 `;` 分隔
- GraphQL 请求 JSON body 写临时文件再 `--data-binary "@..."`（内层引号会被吞）
- 多行文本写文件用 `[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))`（避免 BOM）
- 本地 shop-api 地址以 dev-server 实际端口为准（下文以 `http://localhost:3020/shop-api` 为例，先 `curl` 探活确认）

---

### Task 1: cjk-plugin 注册 Channel.industryType（行业类型）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-channel-custom-fields.ts`（`Channel` 数组末尾、`multiLanguageConfig` 之后）

- [ ] **Step 1: 在 `tenantChannelCustomFields.Channel` 数组末尾追加字段**

在 `multiLanguageConfig` 定义对象之后（数组收口 `],` 之前）追加：

```ts
{
    name: 'industryType',
    type: 'string',
    nullable: true,
    public: true,
    label: [
        { languageCode: LanguageCode.zh_Hans, value: '行业类型' },
        { languageCode: LanguageCode.en, value: 'Industry Type' },
    ],
    description: [
        { languageCode: LanguageCode.zh_Hans, value: '预制行业清单；catering=餐饮，为外卖频道准入条件。仅平台管理员可改。' },
    ],
    options: [
        { value: 'catering', label: [{ languageCode: LanguageCode.zh_Hans, value: '餐饮' }, { languageCode: LanguageCode.en, value: 'Catering' }] },
        { value: 'retail', label: [{ languageCode: LanguageCode.zh_Hans, value: '零售商超' }, { languageCode: LanguageCode.en, value: 'Retail' }] },
        { value: 'fresh', label: [{ languageCode: LanguageCode.zh_Hans, value: '生鲜果蔬' }, { languageCode: LanguageCode.en, value: 'Fresh' }] },
        { value: 'service', label: [{ languageCode: LanguageCode.zh_Hans, value: '生活服务' }, { languageCode: LanguageCode.en, value: 'Services' }] },
        { value: 'hotel', label: [{ languageCode: LanguageCode.zh_Hans, value: '酒店民宿' }, { languageCode: LanguageCode.en, value: 'Hotel' }] },
        { value: 'beauty', label: [{ languageCode: LanguageCode.zh_Hans, value: '美容美发' }, { languageCode: LanguageCode.en, value: 'Beauty' }] },
        { value: 'education', label: [{ languageCode: LanguageCode.zh_Hans, value: '教培' }, { languageCode: LanguageCode.en, value: 'Education' }] },
        { value: 'other', label: [{ languageCode: LanguageCode.zh_Hans, value: '其他' }, { languageCode: LanguageCode.en, value: 'Other' }] },
    ],
},
```

说明：无需改 `plugin.ts`——`CjkPlugin.options.tenant?.enabled` 分支（plugin.ts L2341-2358）自动合并 `tenantChannelCustomFields.Channel`。

- [ ] **Step 2: 构建验证**

```powershell
cd d:\zhao\vendure\packages\cjk-plugin ; bun run build
```
Expected: 构建成功无 TS 报错。

- [ ] **Step 3: 重启 dev-server 后确认列同步**

重启 vendure dev-server（按本地既有方式），确认启动日志无 customFields 报错；在 PostgreSQL 确认列存在：

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'channel' AND column_name ILIKE 'customFieldsInd%';
```
Expected: 返回 `customFieldsIndustrytype`（记下实际列名，Task 4 迁移 SQL 依赖它；若命名不同以实测为准）。

- [ ] **Step 4: Commit**

```powershell
git -C d:\zhao add vendure/packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts
git -C d:\zhao commit -m "feat(cjk-plugin): Channel 增加行业类型 customField（8 项预制行业，catering 为外卖准入）"
```

---

### Task 2: cjk-plugin 注册 Product.productType（商品三类型）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\product\product-custom-fields.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（import 区 + tenant Channel 合并块之后 ~L2358）

- [ ] **Step 1: 新建 product-custom-fields.ts**

```ts
import { CustomFields, LanguageCode } from '@vendure/core';

/** 商品类型：实体/虚拟/服务。首期纯标记（落库+表单+详情标签），不联动结算/运费/库存/外卖过滤。 */
export const productTypeCustomFields: CustomFields = {
    Product: [
        {
            name: 'productType',
            type: 'string',
            defaultValue: 'physical',
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '商品类型' },
                { languageCode: LanguageCode.en, value: 'Product Type' },
            ],
            description: [
                { languageCode: LanguageCode.zh_Hans, value: 'physical=实体商品（默认）；virtual=虚拟商品；service=服务商品。' },
            ],
            options: [
                { value: 'physical', label: [{ languageCode: LanguageCode.zh_Hans, value: '实体商品' }, { languageCode: LanguageCode.en, value: 'Physical' }] },
                { value: 'virtual', label: [{ languageCode: LanguageCode.zh_Hans, value: '虚拟商品' }, { languageCode: LanguageCode.en, value: 'Virtual' }] },
                { value: 'service', label: [{ languageCode: LanguageCode.zh_Hans, value: '服务商品' }, { languageCode: LanguageCode.en, value: 'Service' }] },
            ],
        },
    ],
};
```

- [ ] **Step 2: plugin.ts 注册合并**

顶部 import 区（与 `tenantChannelCustomFields` import 相邻）加：

```ts
import { productTypeCustomFields } from './product/product-custom-fields';
```

在 `if (CjkPlugin.options.tenant?.enabled) { ... }`（tenant Channel 合并块，~L2341-2358）结束后追加（不受 tenant 开关限制，所有租户可用）：

```ts
// 注册商品类型 customFields（实体/虚拟/服务；按 name 去重，dev-config 已定义的同名字段以既有为准）
config.customFields = {
    ...config.customFields,
    Product: [
        ...(config.customFields?.Product || []),
        ...(productTypeCustomFields.Product || []).filter(
            f => !(config.customFields?.Product || []).some(e => e.name === f.name),
        ),
    ],
};
```

- [ ] **Step 3: 构建验证 + 重启**

```powershell
cd d:\zhao\vendure\packages\cjk-plugin ; bun run build
```
Expected: 构建成功。重启 dev-server 无报错，product 表出现 `customFieldsProducttype` 列（information_schema 同法确认）。

- [ ] **Step 4: Commit**

```powershell
git -C d:\zhao add vendure/packages/cjk-plugin/src/product/product-custom-fields.ts vendure/packages/cjk-plugin/src/plugin.ts
git -C d:\zhao commit -m "feat(cjk-plugin): Product 增加 productType customField（实体/虚拟/服务，默认实体）"
```

---

### Task 3: updateTenant 支持 industryType + 租户端禁改

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts:892-897`（UpdateTenantInput）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts:97-103`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts:364-380`（updateChannel）与 `:1051`（protectedKeys）

- [ ] **Step 1: UpdateTenantInput 增加 industryType**

plugin.ts L892-897 的 `input UpdateTenantInput` 内追加一行：

```graphql
                input UpdateTenantInput {
                    name: String
                    tenantNo: Int
                    isOfficial: Boolean
                    domain: String
                    industryType: String
                }
```

- [ ] **Step 2: resolver 参数类型扩展**

tenant-admin.resolver.ts `updateTenant`（L97-103）args 类型加字段：

```ts
    async updateTenant(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; input: { name?: string; tenantNo?: number; isOfficial?: boolean; domain?: string; industryType?: string } },
    ): Promise<any> {
        await this.tenantMemberService.updateChannel(ctx, args.id, args.input);
        return this.channelService.findOne(ctx, args.id as any);
    }
```

- [ ] **Step 3: service.updateChannel 写入 customFields**

tenant-member.service.ts `updateChannel`（L364-380）：入参类型加 `industryType?: string`，在 `if (input.domain ...)` 行后追加：

```ts
        if (input.industryType !== undefined && input.industryType !== null) cf.set('industryType', input.industryType);
```

- [ ] **Step 4: 租户端越权保护（关键安全点）**

tenant-member.service.ts L1051，把 `industryType` 加入禁止租户端修改的保护键（否则租户可经 `myUpdateChannelCustomFields` 自改行业混入外卖）：

```ts
        const protectedKeys = ['enabled', 'tenantNo', 'isOfficial', 'industryType'];
```

- [ ] **Step 5: 构建 + 重启**

```powershell
cd d:\zhao\vendure\packages\cjk-plugin ; bun run build
```
Expected: 构建成功；dev-server 重启无报错。

- [ ] **Step 6: Commit**

```powershell
git -C d:\zhao add vendure/packages/cjk-plugin/src/plugin.ts vendure/packages/cjk-plugin/src/tenant/tenant-admin.resolver.ts vendure/packages/cjk-plugin/src/tenant/tenant-member.service.ts
git -C d:\zhao commit -m "feat(cjk-plugin): 平台侧 updateTenant 支持设置行业类型；租户端禁止越权修改 industryType"
```

---

### Task 4: 外卖准入过滤 + 存量刷数迁移（campus-delivery-plugin）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.ts:61-94`（listStores）
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\migrations\backfill-waimai-industry.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts:78-100`（providers 注册）

- [ ] **Step 1: 先写验证查询（基线）**

dev-server 启动状态下，记录当前外卖列表基线（PowerShell，JSON 走临时文件）：

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\wml.json" '{"query":"{ waimaiStoreList { channelId name } }"}'
curl.exe -s -X POST http://localhost:3020/shop-api -H "Content-Type: application/json" --data-binary "@$env:TEMP\wml.json"
```
Expected: 返回当前全部有履约配置的店铺（记下数量与 channelId 列表，供 Step 4 对比）。

- [ ] **Step 2: listStores 叠加行业过滤**

waimai-store.service.ts `listStores()` 循环内，`const cf = (ch.customFields ?? {}) as any;` 行之后插入：

```ts
            // 外卖准入：仅餐饮行业租户展示（设计文档 2026-10-09 §4.2；存量由 BackfillWaimaiIndustryMigration 刷数）。
            // 仅过滤 C 端列表；listStoreConfigs（admin 配置视图）不过滤，避免管理员看不到已配履约的非餐饮渠道。
            if (cf.industryType !== 'catering') continue;
```

注意：只改 `listStores`，不动 `listStoreConfigs`/骑手大厅 admin 视图。

- [ ] **Step 3: 新建存量刷数迁移**

`migrations/backfill-waimai-industry.ts`（照抄 CreateCampusTablesMigration 挂载模式：@Injectable + OnApplicationBootstrap，出错只打日志不阻塞启动）：

```ts
// 外卖准入存量刷数（设计文档 2026-10-09 §4.3）：把已配履约配置的渠道批量置为餐饮行业，
// 避免上线行业过滤后存量外卖店从外卖首页消失。幂等：仅当 industryType 为空时写入。
// 列名 customFieldsIndustrytype 为 Vendure customFields 同步命名（实测首字母大写+小写化规则，
// 同 Order customFieldsRiderlat 先例）；若 Task 1 Step 3 实测列名不同，此处同步修改。
// 挂载机制与 CreateCampusTablesMigration 一致：注册进 plugin providers，出错等待下次启动重试。
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';

export const backfillWaimaiIndustrySql = `
UPDATE channel
SET "customFieldsIndustrytype" = 'catering'
WHERE "customFieldsIndustrytype" IS NULL
  AND id IN (SELECT "channelId" FROM campus_fulfillment_config);
`;

@Injectable()
export class BackfillWaimaiIndustryMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    async onApplicationBootstrap() {
        try {
            const queryRunner = this.connection.createQueryRunner();
            try {
                await queryRunner.query(backfillWaimaiIndustrySql);
            } finally {
                await queryRunner.release();
            }
        } catch (e: any) {
            // 首次启动若 customFields 列尚未同步（先于 Vendure schema 同步执行时），只打日志等待下次启动重试
            // eslint-disable-next-line no-console
            console.error('[BackfillWaimaiIndustryMigration] failed:', e?.message);
        }
    }
}
```

- [ ] **Step 4: 注册 provider + 构建重启验证**

campus-delivery.plugin.ts：顶部 import `import { BackfillWaimaiIndustryMigration } from './migrations/backfill-waimai-industry';`；providers 数组 `CreateCampusTablesMigration,`（L79）之后加 `BackfillWaimaiIndustryMigration,`。

```powershell
cd d:\zhao\vendure\packages\campus-delivery-plugin ; bun run build
```

重启 dev-server 后验证：

```powershell
Set-Content -Encoding utf8 -NoNewline "$env:TEMP\wml2.json" '{"query":"{ waimaiStoreList { channelId name } }"}'
curl.exe -s -X POST http://localhost:3020/shop-api -H "Content-Type: application/json" --data-binary "@$env:TEMP\wml2.json"
```
Expected: 返回店铺集合与 Step 1 基线**一致**（存量已被刷成 catering，过滤后不丢失）；PostgreSQL 查 `SELECT id, "customFieldsIndustrytype" FROM channel WHERE id IN (SELECT "channelId" FROM campus_fulfillment_config)` 全部为 `catering`。

再手动把一个测试渠道 industryType 置空（或置 retail）后重启/直接改库，`waimaiStoreList` 应不再返回该渠道；改回 catering 恢复。

- [ ] **Step 5: Commit**

```powershell
git -C d:\zhao add vendure/packages/campus-delivery-plugin/src/waimai-store.service.ts vendure/packages/campus-delivery-plugin/src/migrations/backfill-waimai-industry.ts vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts
git -C d:\zhao commit -m "feat(campus-delivery): 外卖店铺列表按行业过滤（仅餐饮准入）+ 存量履约渠道刷数迁移"
```

---

### Task 5: web-admin 租户详情页行业编辑

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\tenants\detail.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`、`d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: apis/tenant-admin.ts 扩展**

1. `TenantItem` 接口加：`industryType?: string | null;`
2. `mapTenant` 返回对象加：`industryType: t.customFields?.industryType ?? null,`
3. `TENANT_FIELDS`（L80）的 customFields 选择集加 `industryType`：
   ```ts
   const TENANT_FIELDS = `id code token customFields { shopName enabled tenantNo isOfficial merchantStatus domain industryType }`;
   ```
4. `updateTenant` 入参类型加 `industryType?: string`。

- [ ] **Step 2: detail.vue 模板加行业编辑行**

在"基本信息"卡片内、域名 field（L25-32）之后插入（沿用 save-row 既有样式）：

```html
      <view class="field" style="margin-bottom: 0;">
        <text class="label">{{ $t('platformTenantsDetail.industryLabel') }}</text>
        <view class="save-row">
          <picker :range="industryLabels" :value="industryIndex" @change="onIndustryChange">
            <view class="input picker-val">{{ industryLabel || $t('platformTenantsDetail.industryPh') }}</view>
          </picker>
          <button class="btn save-btn" @tap="saveIndustry">{{ $t('platformTenantsDetail.save') }}</button>
        </view>
        <text class="tip">{{ $t('platformTenantsDetail.industryTip') }}</text>
      </view>
```

- [ ] **Step 3: detail.vue 脚本**

`tenantDomain` 声明（L177）附近加状态与逻辑：

```ts
// 行业类型（仅平台管理员可改；catering 为外卖准入，见设计文档 2026-10-09）
const INDUSTRY_OPTIONS = ['catering', 'retail', 'fresh', 'service', 'hotel', 'beauty', 'education', 'other'] as const;
const tenantIndustry = ref<string | null>(null);
const industryLabels = computed(() => INDUSTRY_OPTIONS.map(v => locale.t(`platformTenantsDetail.industry_${v}`)));
const industryIndex = computed(() => Math.max(0, INDUSTRY_OPTIONS.indexOf((tenantIndustry.value || '') as any)));
const industryLabel = computed(() => {
  const i = INDUSTRY_OPTIONS.indexOf((tenantIndustry.value || '') as any);
  return i >= 0 ? locale.t(`platformTenantsDetail.industry_${INDUSTRY_OPTIONS[i]}`) : '';
});
function onIndustryChange(e: any) {
  tenantIndustry.value = INDUSTRY_OPTIONS[Number(e.detail.value)];
}
async function saveIndustry() {
  if (!tenantIndustry.value) { uni.showToast({ title: locale.t('platformTenantsDetail.industryRequired'), icon: 'none' }); return; }
  try {
    await updateTenant(channelId.value, { industryType: tenantIndustry.value });
    uni.showToast({ title: locale.t('platformTenantsDetail.industryUpdated'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('platformTenantsDetail.saveFailed')), icon: 'none' });
  }
}
```

`loadTenant()`（L187-197）内加回填：`tenantIndustry.value = t.industryType ?? null;`

import 区确认已有 `computed`（从 vue 导入，若无则补）。

样式：`.picker-val` 若与 `.input` 复用即可（`<picker>` 包裹的 view 继承 input 样式），必要时在 style 区补 `.picker-val { min-width: 320rpx; }`。

- [ ] **Step 4: 语言包补词条（zh-Hans.json 与 en.json 同步补，缺一不可）**

`platformTenantsDetail` 下新增：

```json
"industryLabel": "行业类型",
"industryPh": "请选择行业",
"industryTip": "仅平台管理员可改；仅「餐饮」租户可在外卖频道展示",
"industryRequired": "请先选择行业",
"industryUpdated": "行业已更新",
"industry_catering": "餐饮",
"industry_retail": "零售商超",
"industry_fresh": "生鲜果蔬",
"industry_service": "生活服务",
"industry_hotel": "酒店民宿",
"industry_beauty": "美容美发",
"industry_education": "教培",
"industry_other": "其他"
```

en.json 对应：`"Industry"` / `"Select industry"` / `"Admin only; only Catering tenants appear in Waimai"` / `"Select industry first"` / `"Industry updated"` / `"Catering"` / `"Retail"` / `"Fresh"` / `"Services"` / `"Hotel"` / `"Beauty"` / `"Education"` / `"Other"`。

- [ ] **Step 5: 本地验证**

启动 web-admin 本地 dev（vshop/web-admin 目录既有 dev 命令），平台管理员登录 → 租户管理 → 任一租户详情：选择行业保存 → 刷新页面回显正确；直接调用 `myUpdateChannelCustomFields` 传 `industryType` 应被忽略（Step 4 保护生效）。

- [ ] **Step 6: Commit**

```powershell
git -C d:\zhao add vshop/web-admin/src/apis/tenant-admin.ts vshop/web-admin/src/pages/platform/tenants/detail.vue vshop/web-admin/src/locale/zh-Hans.json vshop/web-admin/src/locale/en.json
git -C d:\zhao commit -m "feat(web-admin): 平台侧租户详情支持设置行业类型（8 项预制，租户端禁改）"
```

---

### Task 6: web-admin 商品表单商品类型

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts`
- Modify: `d:\zhao\vshop\web-admin\src\components\ProductForm.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\product\edit\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`、`d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: apis/product.ts 读写链路**

1. `ProductSaveInput`（L216-241）加：`productType?: string; // 商品类型（customFields 落库；physical/virtual/service）`
2. `fetchProductFull` 查询 L279 的 customFields 选择集加 `productType`：
   ```ts
   customFields { marketingTags sellingPoint tenantCategoryRef videoAssetId promos services productType }
   ```
   同时该请求类型定义（L258）customFields 加 `productType?: string | null`。
3. 返回映射 `productCustomFields`（L335-343）加：`productType: product.customFields?.productType ?? null,`
4. `ProductFull.productCustomFields` 类型（L213）加 `productType?: string | null;`
5. `applyBrandAndMarketing`（L598-622）——**防覆盖清空的关键点**：
   - 守卫条件（L603）末尾追加 `&& input.productType == null`
   - customFields 构造区（L611 `videoAssetId` 行后）加：
     ```ts
     if (input.productType != null) customFields.productType = input.productType;
     ```
   说明：createProductFull/updateProductFull 保存链路都经 applyBrandAndMarketing（L696/L836），productType 随之落库，无需另改。

- [ ] **Step 2: ProductForm.vue 表单**

1. `ProductDraft`（L161-190）加字段：`productType: string; // 商品类型 physical/virtual/service（customFields 落库）`
2. `props.initial` 的 `Partial<{...}>` 类型加 `productType?: string;`
3. 模板"基本信息" Tab：在价格/库存控件区（配送/支付/分类卡片内，~L70-101 区域）加三选一 segmented：

```html
        <view class="field">
          <text class="label">{{ $t('productForm.typeLabel') }}</text>
          <view class="type-seg">
            <view class="seg-opt" :class="{ on: d.productType === 'physical' }" @tap="d.productType = 'physical'">{{ $t('productForm.typePhysical') }}</view>
            <view class="seg-opt" :class="{ on: d.productType === 'virtual' }" @tap="d.productType = 'virtual'">{{ $t('productForm.typeVirtual') }}</view>
            <view class="seg-opt" :class="{ on: d.productType === 'service' }" @tap="d.productType = 'service'">{{ $t('productForm.typeService') }}</view>
          </view>
          <text class="tip">{{ $t('productForm.typeHelper') }}</text>
        </view>
```

4. 草稿初始化：在 `d` 的创建/`props.initial` 回填处（搜 ProductForm.vue script 中 `initial` 的消费位置）保证：
   ```ts
   productType: props.initial?.productType ?? 'physical',
   ```
   （新建页无 initial，默认 'physical'；编辑页回填见 Step 3。）
5. `submit()` 无需改动——`out` 由 `d` 深拷贝而来，productType 自动随 ProductSaveInput 提交。
6. style 区补样式（沿用现有 scss 变量风格）：

```scss
.type-seg { display: flex; gap: 8rpx; background: #f5f5f5; border-radius: 12rpx; padding: 6rpx; }
.seg-opt { flex: 1; text-align: center; padding: 14rpx 0; border-radius: 10rpx; font-size: 26rpx; color: #666; }
.seg-opt.on { background: #4f8cff; color: #fff; font-weight: 600; }
```

- [ ] **Step 3: 编辑页回填**

`pages/product/edit/index.vue` 的 `initial.value = { ... }`（L224-248）内加：

```ts
    productType: data.productCustomFields?.productType ?? 'physical',
```

- [ ] **Step 4: 语言包补词条（zh/en 同步）**

`productForm` 下新增（zh-Hans.json）：

```json
"typeLabel": "商品类型",
"typePhysical": "实体商品",
"typeVirtual": "虚拟商品",
"typeService": "服务商品",
"typeHelper": "首期仅标记展示，不影响运费 / 库存 / 结算"
```

en.json：`"Type"` / `"Physical"` / `"Virtual"` / `"Service"` / `"Label only for now; no shipping/stock/checkout impact"`。

- [ ] **Step 5: 本地验证（含覆盖回归点）**

1. 新建商品：默认选中"实体商品"，保存后 DB `customFieldsProducttype='physical'`。
2. 编辑商品：切为"服务商品"保存 → 重开表单回显"服务商品"；DB 值正确。
3. **覆盖回归**：编辑一个已设为 virtual 的商品，只改价格保存 → productType 仍为 virtual（applyBrandAndMarketing 透传生效，未被清空）。
4. 存量老商品（customFieldsProducttype=NULL）：编辑页显示"实体商品"，保存后落 physical。

- [ ] **Step 6: Commit**

```powershell
git -C d:\zhao add vshop/web-admin/src/apis/product.ts vshop/web-admin/src/components/ProductForm.vue vshop/web-admin/src/pages/product/edit/index.vue vshop/web-admin/src/locale/zh-Hans.json vshop/web-admin/src/locale/en.json
git -C d:\zhao commit -m "feat(web-admin): 商品表单支持实体/虚拟/服务三类型（首期纯标记，保存透传防覆盖）"
```

---

### Task 7: 回归验证 + 手机截图 + 手册交付

**Files:**
- Modify: `d:\zhao\docs\manual\`（操作手册，按既有结构补章节与截图）
- Create: `d:\zhao\docs\manual\shots\2026-10-10-industry-product-type\`（截图目录）

- [ ] **Step 1: 后端回归清单（curl 校准，PowerShell 临时文件模式）**

1. `waimaiStoreList`：餐饮+有履约 → 显示；retail/NULL+有履约 → 不显示；餐饮+无履约 → 不显示（AND 语义）
2. `updateTenant(id, { industryType: 'retail' })`（平台管理员 token）→ `tenant(id)` 回读正确
3. 租户 token 调 `myUpdateChannelCustomFields(input:{industryType:"catering"})` → 回读不变（越权保护）
4. 商品 save → `product`（admin-api）回读 `customFields.productType` 正确
5. 迁移幂等：连续重启 dev-server 两次，industryType 不被重置（IS NULL 守卫）

- [ ] **Step 2: 手机视口截图（硬规范：390×844 dpr=2）**

Playwright 移动视口（390×844，deviceScaleFactor=2）截取：
1. 外卖首页店铺列表（仅餐饮店）
2. web-admin 租户详情行业编辑态
3. web-admin 商品表单类型三选一态
存入 `docs/manual/shots/2026-10-10-industry-product-type/`。

- [ ] **Step 3: 操作手册/测试用例补充**

按 docs/manual 既有结构补：功能说明（行业准入规则、商品类型语义）、上述截图、回归清单（Step 1 的 5 条作为测试用例）。

- [ ] **Step 4: Commit**

```powershell
git -C d:\zhao add docs/manual
git -C d:\zhao commit -m "docs(manual): 行业类型与商品类型功能操作手册+测试用例+手机截图"
```

---

### Task 8: 构建部署收口（一气呵成）

- [ ] **Step 1: 本地构建（铁律：绝不在服务器构建）**

- vendure 两插件：`bun run build`（cjk-plugin、campus-delivery-plugin），确认 lib 产物更新
- web-admin：按 `vshop/web-admin`（或 vshop 根）既有 `scripts/deploy.mjs` 流程本地构建产物

- [ ] **Step 2: push + 部署**

```powershell
git -C d:\zhao push
```

- vendure 后端：按既有流程（git push 后服务器 `git pull` + `pm2 restart`）
- web-admin：`scripts/deploy.mjs`（scp 产物 → 服务器解压/拷入）
- 部署后线上验证：外卖首页仅餐饮店铺（与本地 Step 7 清单一致）；注意 nginx/旧 worker 可能短暂应答旧配置，隔轮再验

- [ ] **Step 3: 线上冒烟**

外卖首页店铺数与预期一致；任一餐饮店下单主流程不回归（过滤只在列表层，未动下单链路）。

---

## 自审记录（Self-Review）

1. **Spec 覆盖**：§4.1 两字段 → Task 1/2；§4.2 过滤 → Task 4；§4.3 迁移 → Task 4；§4.4 两处 UI → Task 5/6；§4.5 保存透传防清空 → Task 6 Step 1.5；C 端标签按 spec「可选、未改造前无感知」延后不做；§7 非目标均未引入。✓
2. **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码。✓
3. **类型一致性**：`industryType`（Channel）/`productType`（Product）命名全链路一致；列名以 Task 1 Step 3 实测为准并在 Task 4 注明回改点。✓
