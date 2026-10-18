# 租户券店模式（t1 只卖买单券）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给多租户商城新增租户级「券店模式」：t1 等 `storefrontMode=coupon` 的租户，nshop 首页渲染券店版式（楼层导购/券卡宫格双版式），拦截普通商品链路，TabBar/Header 券店化，券目录匿名可浏览（购买仍需登录）。

**Architecture:** 配置驱动——`Channel.customFields` 新增 `storefrontMode`/`storefrontHomeLayout`（vendure cjk-plugin，web-admin 平台侧设置），nshop 经既有 `GetChannelTheme` 管线读取后全局分支渲染；购券/支付/积分兑换链路从券商城页抽取为 `useCouponSaleFlow` composable 供券店首页复用；新增全局 route middleware 拦截商品路由。

**Tech Stack:** Vendure（NestJS GraphQL 插件）、vshop/web-admin（uni-app + Vue3）、nshop（Nuxt 4 + Nuxt UI + graphql-request）。

**Spec:** [2026-10-18-coupon-storefront-mode-design.md](../specs/2026-10-18-coupon-storefront-mode-design.md)

**工作目录：** `d:\zhao\vendure`、`d:\zhao\vshop\web-admin`、`d:\zhao\nshop` 三个独立 git 仓库。PowerShell 环境不支持 `&&`，命令分步执行。

---

## Task 1: vendure — Channel customFields 新增店面模式字段

**Files:**
- Modify: `packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts`（在 `industryType` 字段后追加，约 L358 之后）
- Modify: `packages/cjk-plugin/src/plugin.ts:1066-1072`（UpdateTenantInput）
- Modify: `packages/cjk-plugin/src/tenant/tenant-admin.resolver.ts:99`（updateTenant args 类型）
- Modify: `packages/cjk-plugin/src/tenant/tenant-member.service.ts:397-406`（updateChannel 白名单）

- [ ] **Step 1.1: 在 customFields 定义中追加两个字段**

在 `tenant-channel-custom-fields.ts` 的 `industryType` 定义块（L336-358）之后、数组收尾 `],` 之前插入：

```ts
        {
            name: 'storefrontMode',
            type: 'string',
            nullable: true,
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '店面模式' },
                { languageCode: LanguageCode.en, value: 'Storefront Mode' },
            ],
            description: [
                { languageCode: LanguageCode.zh_Hans, value: 'normal=普通商城（默认）；coupon=券店（整店只卖买单券，nshop 首页/导航/路由随之切换）。仅平台管理员可改。' },
            ],
            options: [
                { value: 'normal', label: [{ languageCode: LanguageCode.zh_Hans, value: '普通商城' }, { languageCode: LanguageCode.en, value: 'Normal' }] },
                { value: 'coupon', label: [{ languageCode: LanguageCode.zh_Hans, value: '券店（只卖买单券）' }, { languageCode: LanguageCode.en, value: 'Coupon store' }] },
            ],
        },
        {
            name: 'storefrontHomeLayout',
            type: 'string',
            nullable: true,
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '券店首页版式' },
                { languageCode: LanguageCode.en, value: 'Coupon Store Home Layout' },
            ],
            description: [
                { languageCode: LanguageCode.zh_Hans, value: '仅 storefrontMode=coupon 时生效：floors=楼层导购（默认）；grid=券卡宫格。' },
            ],
            options: [
                { value: 'floors', label: [{ languageCode: LanguageCode.zh_Hans, value: '楼层导购' }, { languageCode: LanguageCode.en, value: 'Floors' }] },
                { value: 'grid', label: [{ languageCode: LanguageCode.zh_Hans, value: '券卡宫格' }, { languageCode: LanguageCode.en, value: 'Grid' }] },
            ],
        },
```

注意：该文件 import 顶部已有 `LanguageCode`（其余字段同用法），不要新增 import。

- [ ] **Step 1.2: 扩展 UpdateTenantInput schema**

`plugin.ts` L1066-1072 的 `input UpdateTenantInput` 改为：

```graphql
                input UpdateTenantInput {
                    name: String
                    tenantNo: Int
                    isOfficial: Boolean
                    domain: String
                    industryType: String
                    storefrontMode: String
                    storefrontHomeLayout: String
                }
```

- [ ] **Step 1.3: 扩展 resolver args 类型**

`tenant-admin.resolver.ts` L99 的 args 类型改为：

```ts
        @Args() args: { id: string; input: { name?: string; tenantNo?: number; isOfficial?: boolean; domain?: string; industryType?: string; storefrontMode?: string; storefrontHomeLayout?: string } },
```

- [ ] **Step 1.4: service 白名单写入 customFields**

`tenant-member.service.ts`：L397 的 input 类型加 `storefrontMode?: string; storefrontHomeLayout?: string`，并在 L406 `industryType` 行后加：

```ts
        if (input.storefrontMode !== undefined && input.storefrontMode !== null) cf.set('storefrontMode', input.storefrontMode);
        if (input.storefrontHomeLayout !== undefined && input.storefrontHomeLayout !== null) cf.set('storefrontHomeLayout', input.storefrontHomeLayout);
```

（L1082 的 `protectedKeys` 是租户自助更新白名单，**不加**这两个字段——仅平台管理员可改。）

- [ ] **Step 1.5: 构建验证**

```powershell
cd d:\zhao\vendure
pnpm build
```

Expected: 编译通过，无类型错误（与部署流水线同一构建入口；若根目录无 build 脚本则按仓库既有构建方式执行 cjk-plugin 编译）。

- [ ] **Step 1.6: Commit**

```powershell
git add packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/src/tenant/tenant-admin.resolver.ts packages/cjk-plugin/src/tenant/tenant-member.service.ts
git commit -m "feat(tenant): Channel customFields 新增 storefrontMode/storefrontHomeLayout（租户券店模式配置）"
```

---

## Task 2: vendure — couponSaleCatalogue 放开匿名

**Files:**
- Modify: `packages/coupon-plugin/src/coupon-sale-shop.resolver.ts:6-22`

- [ ] **Step 2.1: 移除目录查询的登录限制**

把 L6-9 的文件头注释改为：

```ts
/**
 * 券商城（shop-api）：可售目录、出售单购买（微信 / 余额）、我的出售单，
 * 以及商品页加价购的挂载 / 摘除。
 * 目录 couponSaleCatalogue 匿名可查（券店首页新客可浏览，渠道过滤/场景过滤在
 * CouponSaleService.saleCatalogue 内完成，仅依赖 ctx.channelId，无登录态耦合）；
 * 其余购买/支付/退款等写操作仍要求登录（Permission.Authenticated），
 * 归属校验（本人 / 本渠道）在 CouponSaleService 内完成。
 */
```

把 L18-22 改为（删除 `@Allow(Permission.Authenticated)` 一行）：

```ts
    @Query()
    async couponSaleCatalogue(@Ctx() ctx: RequestContext, @Args('scene', { nullable: true }) scene?: string) {
        return this.couponSaleService.saleCatalogue(ctx, scene ?? undefined);
    }
```

其余方法（myCouponSaleOrders / createCouponSaleOrder / payCouponSaleWithBalance / createWechatCouponPayment / cancelCouponSaleOrder / refundCouponSaleOrder / attachCouponToOrder / detachCouponFromOrder）的 `@Allow(Permission.Authenticated)` **全部保留**，`Allow`/`Permission` import 仍被使用，勿删 import。

- [ ] **Step 2.2: 构建验证**

```powershell
cd d:\zhao\vendure
pnpm build
```

Expected: 编译通过（`Allow` 仍被其余方法引用，无 unused import 报错）。

- [ ] **Step 2.3: Commit**

```powershell
git add packages/coupon-plugin/src/coupon-sale-shop.resolver.ts
git commit -m "feat(coupon): couponSaleCatalogue 放开匿名浏览（券店首页新客可看目录，购买仍需登录）"
```

---

## Task 3: web-admin — 平台侧租户管理表单加「店面模式」

**Files:**
- Modify: `src/apis/tenant-admin.ts`（TenantItem/mapTenant/TENANT_FIELDS/updateTenant）
- Modify: `src/pages/platform/tenants/detail.vue`（表单块 + 脚本）
- Modify: `src/locale/zh-Hans.json`、`src/locale/en.json`（platformTenantsDetail 块，industry 词条在 L2924-2926 附近）

- [ ] **Step 3.1: api 封装扩展**

`tenant-admin.ts`：

`TenantItem` 接口（L4-15）`industryType` 行后追加：

```ts
  storefrontMode?: string | null;
  storefrontHomeLayout?: string | null;
```

`mapTenant`（L67-80）`industryType` 行后追加：

```ts
    storefrontMode: t.customFields?.storefrontMode ?? null,
    storefrontHomeLayout: t.customFields?.storefrontHomeLayout ?? null,
```

`TENANT_FIELDS`（L82）改为：

```ts
const TENANT_FIELDS = `id code token customFields { shopName enabled tenantNo isOfficial merchantStatus domain industryType storefrontMode storefrontHomeLayout }`;
```

`updateTenant` input 类型（L113）加两个可选字段：

```ts
export async function updateTenant(id: string, input: { name?: string; tenantNo?: number; isOfficial?: boolean; domain?: string; industryType?: string; storefrontMode?: string; storefrontHomeLayout?: string }): Promise<TenantItem> {
```

- [ ] **Step 3.2: detail.vue 脚本加选择器逻辑**

在 `saveIndustry` 函数（L203-211）之后追加（模式完全对齐 industryType 先例）：

```ts
// 店面模式（仅平台管理员可改；coupon=整店只卖买单券，见设计文档 2026-10-18）
const STOREFRONT_MODE_OPTIONS = ['normal', 'coupon'] as const;
const STOREFRONT_LAYOUT_OPTIONS = ['floors', 'grid'] as const;
const tenantStorefrontMode = ref<string | null>(null);
const tenantStorefrontLayout = ref<string | null>(null);
const storefrontModeLabels = computed(() => STOREFRONT_MODE_OPTIONS.map(v => locale.t(`platformTenantsDetail.storefrontMode_${v}`)));
const storefrontModeIndex = computed(() => Math.max(0, STOREFRONT_MODE_OPTIONS.indexOf((tenantStorefrontMode.value || 'normal') as any)));
const storefrontModeLabel = computed(() => {
  const i = STOREFRONT_MODE_OPTIONS.indexOf((tenantStorefrontMode.value || 'normal') as any);
  return i >= 0 ? locale.t(`platformTenantsDetail.storefrontMode_${STOREFRONT_MODE_OPTIONS[i]}`) : '';
});
const storefrontLayoutLabels = computed(() => STOREFRONT_LAYOUT_OPTIONS.map(v => locale.t(`platformTenantsDetail.storefrontLayout_${v}`)));
const storefrontLayoutIndex = computed(() => Math.max(0, STOREFRONT_LAYOUT_OPTIONS.indexOf((tenantStorefrontLayout.value || 'floors') as any)));
const storefrontLayoutLabel = computed(() => {
  const i = STOREFRONT_LAYOUT_OPTIONS.indexOf((tenantStorefrontLayout.value || 'floors') as any);
  return i >= 0 ? locale.t(`platformTenantsDetail.storefrontLayout_${STOREFRONT_LAYOUT_OPTIONS[i]}`) : '';
});
function onStorefrontModeChange(e: any) {
  tenantStorefrontMode.value = STOREFRONT_MODE_OPTIONS[Number(e.detail.value)];
}
function onStorefrontLayoutChange(e: any) {
  tenantStorefrontLayout.value = STOREFRONT_LAYOUT_OPTIONS[Number(e.detail.value)];
}
async function saveStorefront() {
  try {
    await updateTenant(channelId.value, {
      storefrontMode: tenantStorefrontMode.value || 'normal',
      storefrontHomeLayout: tenantStorefrontMode.value === 'coupon' ? (tenantStorefrontLayout.value || 'floors') : undefined,
    });
    uni.showToast({ title: locale.t('platformTenantsDetail.storefrontUpdated'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('platformTenantsDetail.saveFailed')), icon: 'none' });
  }
}
```

`loadTenant`（L219-230）在 `tenantIndustry.value = ...` 行后追加：

```ts
    tenantStorefrontMode.value = t.storefrontMode ?? 'normal';
    tenantStorefrontLayout.value = t.storefrontHomeLayout ?? 'floors';
```

- [ ] **Step 3.3: detail.vue 模板加表单块**

在行业类型 field 块（模板 L33-42，`<text class="tip">{{ $t('platformTenantsDetail.industryTip') }}</text>` 之后、该 `</view>` 结束后）追加同构表单块：

```html
      <view class="field" style="margin-bottom: 0;">
        <text class="label">{{ $t('platformTenantsDetail.storefrontLabel') }}</text>
        <view class="save-row">
          <picker :range="storefrontModeLabels" :value="storefrontModeIndex" @change="onStorefrontModeChange">
            <view class="input picker-val">{{ storefrontModeLabel }}</view>
          </picker>
          <picker v-if="tenantStorefrontMode === 'coupon'" :range="storefrontLayoutLabels" :value="storefrontLayoutIndex" @change="onStorefrontLayoutChange">
            <view class="input picker-val">{{ storefrontLayoutLabel }}</view>
          </picker>
          <button class="btn save-btn" @tap="saveStorefront">{{ $t('platformTenantsDetail.save') }}</button>
        </view>
        <text class="tip">{{ $t('platformTenantsDetail.storefrontTip') }}</text>
      </view>
```

- [ ] **Step 3.4: i18n 词条**

`src/locale/zh-Hans.json` 与 `src/locale/en.json` 的 `platformTenantsDetail` 块（industry 词条旁，约 L2924 区域）同步追加：

zh-Hans：

```json
    "storefrontLabel": "店面模式",
    "storefrontTip": "券店模式下 C 端整店只卖买单券：首页为券楼层、商品/分类/搜索/结算入口拦截；切回普通商城立即恢复。",
    "storefrontMode_normal": "普通商城",
    "storefrontMode_coupon": "券店（只卖买单券）",
    "storefrontLayout_floors": "楼层导购",
    "storefrontLayout_grid": "券卡宫格",
    "storefrontUpdated": "店面模式已更新",
```

en：

```json
    "storefrontLabel": "Storefront Mode",
    "storefrontTip": "In coupon-store mode the C-end sells in-store bill coupons only: coupon floors on home, product/category/search/checkout routes blocked; switch back anytime.",
    "storefrontMode_normal": "Normal mall",
    "storefrontMode_coupon": "Coupon store (vouchers only)",
    "storefrontLayout_floors": "Floors",
    "storefrontLayout_grid": "Coupon grid",
    "storefrontUpdated": "Storefront mode updated",
```

- [ ] **Step 3.5: 构建验证**

运行 web-admin 既有构建脚本（package.json `scripts` 中与 `scripts/deploy.mjs` 同源的构建命令）。

Expected: 编译通过，无 TS/模板错误。

- [ ] **Step 3.6: Commit**

```powershell
git add src/apis/tenant-admin.ts src/pages/platform/tenants/detail.vue src/locale/zh-Hans.json src/locale/en.json
git commit -m "feat(tenants): 平台侧租户管理支持配置店面模式（普通商城/券店 + 首页版式）"
```

---

## Task 4: nshop — 模式读取（GetChannelTheme + useStorefrontMode）与基础词条

**Files:**
- Modify: `layers/base/gql/queries/context.gql:15-34`
- Create: `layers/base/app/composables/useStorefrontMode.ts`
- Modify: `layers/base/i18n/locales/zh-CN.ts`、`layers/base/i18n/locales/en-US.ts`

- [ ] **Step 4.1: GetChannelTheme 查询补字段**

`context.gql` 的 `query GetChannelTheme` customFields 内 `shopIntro` 行后追加两行：

```graphql
      storefrontMode
      storefrontHomeLayout
```

（`useChannelTheme.ts` 把整个 customFields 存入 `useState("channel-theme-customfields")`，app.vue SSR 期间 `await loadTheme()` 已完成——无需改 composable，新增字段自动随 state 可用。）

- [ ] **Step 4.2: 新建 useStorefrontMode composable**

创建 `layers/base/app/composables/useStorefrontMode.ts`：

```ts
/**
 * 租户店面模式（Channel.customFields.storefrontMode）：
 * normal=普通商城（默认）；coupon=券店（整店只卖买单券）。
 * 值由 app.vue 的 loadTheme 在 SSR 期间写入共享 state，此处纯解析（坏值回退默认）。
 */
export function useStorefrontMode() {
  const { customFields } = useChannelTheme();

  const mode = computed<"normal" | "coupon">(() =>
    customFields.value?.storefrontMode === "coupon" ? "coupon" : "normal",
  );
  const homeLayout = computed<"floors" | "grid">(() =>
    customFields.value?.storefrontHomeLayout === "grid" ? "grid" : "floors",
  );
  const isCouponStore = computed(() => mode.value === "coupon");

  return { mode, homeLayout, isCouponStore };
}
```

- [ ] **Step 4.3: i18n 词条（两语言同步）**

`zh-CN.ts` 在 `couponMall` 块（L342-372）之后追加同层块：

```ts
    couponStore: {
      heroSlogan: '到店出示券码 · 按折结算',
      blockedTitle: '本店仅售买单券',
      blockedDesc: '这是一家买单券专营店，商品/分类/搜索功能未开放。返回首页即可选购各类买单券。',
      backHome: '返回券店',
      gridBuy: '抢购',
      floorIntro: '到店通用 · 出示券码按折结算',
      empty: '买单券即将上架，敬请期待',
    },
    couponSaleOrders: {
      title: '券单',
      statusPENDING: '待支付',
      statusPAID: '已支付',
      statusCANCELLED: '已取消',
      statusREFUNDED: '已退款',
      payAgain: '继续支付',
      templateItem: '单券',
      bundleItem: '券包',
      empty: '暂无券单',
      loadFailed: '加载失败',
    },
```

`nav` 块追加两个 tab 词条（在既有 `home/cart/categories/my` 旁）：

```ts
      couponPack: '券包',
      orders: '券单',
```

`en-US.ts` 对应追加（同键名）：

```ts
    couponStore: {
      heroSlogan: 'Show the coupon code in store · settle by discount',
      blockedTitle: 'This store sells in-store bill coupons only',
      blockedDesc: 'This is a coupon-specialty store. Products, categories and search are not available. Go back to the home to buy bill coupons.',
      backHome: 'Back to coupon store',
      gridBuy: 'Buy',
      floorIntro: 'Valid in store · show code to settle',
      empty: 'New bill coupons are coming soon',
    },
    couponSaleOrders: {
      title: 'Coupon Orders',
      statusPENDING: 'Pending payment',
      statusPAID: 'Paid',
      statusCANCELLED: 'Cancelled',
      statusREFUNDED: 'Refunded',
      payAgain: 'Pay again',
      templateItem: 'Coupon',
      bundleItem: 'Bundle',
      empty: 'No coupon orders yet',
      loadFailed: 'Failed to load',
    },
```

`nav` 块：

```ts
      couponPack: 'Coupons',
      orders: 'Orders',
```

- [ ] **Step 4.4: 构建验证**

```powershell
cd d:\zhao\nshop
pnpm build
```

Expected: Nuxt 构建通过（新查询字段后端 Task 1/2 未部署前，dev 下 storefrontMode 返回 undefined → normal，无影响）。

- [ ] **Step 4.5: Commit**

```powershell
git add layers/base/gql/queries/context.gql layers/base/app/composables/useStorefrontMode.ts layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(coupon-store): 读取租户店面模式 + 券店/券单 i18n 词条（zh/en）"
```

---

## Task 5: nshop — 抽取 useCouponSaleFlow composable（券商城页重构）

**Files:**
- Create: `layers/base/app/composables/useCouponSaleFlow.ts`
- Modify: `layers/base/app/pages/coupon-mall/index.vue`（script 换用 composable，template 不变）

- [ ] **Step 5.1: 新建 composable**

创建 `layers/base/app/composables/useCouponSaleFlow.ts`，内容为从 `pages/coupon-mall/index.vue` L74-206 原样搬移的购买/支付/兑换/详情逻辑（函数体逐行保持一致，仅包进 composable 并 return）：

```ts
import type { CouponSaleOrder } from "./useCoupon";
import {
  createCouponSaleOrder,
  createWechatCouponPayment,
  payCouponSaleWithBalance,
  cancelCouponSaleOrder,
  getMyCouponSaleOrders,
  exchangeCouponWithPoints,
  couponErrorMessage,
} from "./useCoupon";
import { invokeWechatPay, isWechatBrowser } from "../utils/coupon";

/**
 * 券购/支付/兑换共享流程（原 coupon-mall 页内逻辑抽离，供券商城页与券店首页复用）：
 * 详情弹层 → 下单 → PaySheet（微信/余额）→ 支付确认/取消；积分兑换；登录引导。
 */
export function useCouponSaleFlow() {
  const { t } = useI18n();
  const localePath = useTenantLocalePath();
  const toast = useToast();
  const { isAuthenticated } = storeToRefs(useAuthStore());

  // ── 详情弹层 ──
  const sheetTarget = ref<any>(null);
  const sheetBundle = ref<any>(null);

  function openDetail(target: Record<string, any>, bundle: Record<string, any> | null = null) {
    sheetTarget.value = target;
    sheetBundle.value = bundle;
  }

  // ── 购买/支付（与 pages/coupon/index.vue 同模式） ──
  const buyingId = ref<string | null>(null);
  const paying = ref(false);
  const paySheetOpen = ref(false);
  const payMode = ref<"WECHAT" | "BALANCE">("WECHAT");
  const pendingOrder = ref<CouponSaleOrder | null>(null);
  const buyName = ref("");
  const buyAmount = ref(0);

  function requireLogin(): boolean {
    if (isAuthenticated.value) return true;
    navigateTo(localePath("/account/login"));
    return false;
  }

  async function startBuy(target: Record<string, any>, kind: "template" | "bundle") {
    if (!requireLogin()) return;
    if (buyingId.value) return;
    buyingId.value = target.id;
    try {
      const order = await createCouponSaleOrder(kind === "bundle" ? { bundleId: target.id } : { templateId: target.id });
      pendingOrder.value = order;
      buyName.value = target.name;
      buyAmount.value = order.amount ?? target.salePrice ?? 0;
      payMode.value = isWechatBrowser() ? "WECHAT" : "BALANCE";
      paySheetOpen.value = true;
    } catch (e) {
      toast.add({ title: t("messages.coupon.purchaseFailed"), description: couponErrorMessage(e), color: "error" });
    } finally {
      buyingId.value = null;
    }
  }

  function buyFromSheet() {
    const target = sheetTarget.value;
    if (!target) return;
    const kind: "template" | "bundle" = sheetBundle.value ? "bundle" : "template";
    sheetTarget.value = null;
    sheetBundle.value = null;
    startBuy(target, kind);
  }

  /** 微信回调结算为异步：短轮询确认已支付（最多 5 次 × 1.2s） */
  async function waitForPaid(saleOrderId: string): Promise<void> {
    for (let i = 0; i < 5; i++) {
      try {
        const orders = await getMyCouponSaleOrders();
        if (orders.find((o) => o.id === saleOrderId && o.status === "PAID")) return;
      } catch {
        // 忽略轮询异常，继续重试
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  async function confirmPay() {
    const order = pendingOrder.value;
    if (!order || paying.value) return;
    paying.value = true;
    try {
      if (payMode.value === "BALANCE") {
        await payCouponSaleWithBalance(order.id);
        await onPaid();
      } else {
        if (!isWechatBrowser()) {
          toast.add({ title: t("messages.coupon.notInWechat"), color: "warning" });
          return;
        }
        const res = await createWechatCouponPayment(order.id, "JSAPI");
        if (!res?.pay?.paySign) {
          toast.add({ title: t("messages.coupon.noOpenid"), color: "warning" });
          return;
        }
        try {
          await invokeWechatPay(res.pay);
        } catch (e) {
          toast.add({ title: t("messages.coupon.payCancelled"), description: couponErrorMessage(e), color: "error" });
          return;
        }
        await waitForPaid(order.id);
        await onPaid();
      }
    } catch (e) {
      toast.add({ title: t("messages.coupon.payFailed"), description: couponErrorMessage(e), color: "error" });
    } finally {
      paying.value = false;
    }
  }

  async function onPaid() {
    paySheetOpen.value = false;
    pendingOrder.value = null;
    toast.add({ title: t("messages.coupon.paySuccess"), color: "success" });
  }

  /** 关闭支付弹层：未支付则取消出售单，避免残留 PENDING */
  async function closePaySheet() {
    const order = pendingOrder.value;
    paySheetOpen.value = false;
    pendingOrder.value = null;
    if (order) {
      try {
        await cancelCouponSaleOrder(order.id);
      } catch {
        // 已支付/已取消时取消会失败，忽略
      }
    }
  }

  // ── 积分兑换 ──
  const exchangingId = ref<string | null>(null);
  async function exchange(c: Record<string, any>) {
    if (!requireLogin()) return;
    if (exchangingId.value) return;
    exchangingId.value = c.id;
    try {
      await exchangeCouponWithPoints(c.id);
      toast.add({ title: t("messages.coupon.exchangeSuccess"), color: "success" });
    } catch (e) {
      toast.add({ title: t("messages.coupon.exchangeFailed"), description: couponErrorMessage(e), color: "error" });
    } finally {
      exchangingId.value = null;
    }
  }

  function closeDetail() {
    sheetTarget.value = null;
    sheetBundle.value = null;
  }

  return {
    sheetTarget, sheetBundle, openDetail, closeDetail, buyFromSheet,
    buyingId, paying, paySheetOpen, payMode, pendingOrder, buyName, buyAmount,
    requireLogin, startBuy, confirmPay, closePaySheet,
    exchangingId, exchange,
  };
}
```

注意：`useI18n/useTenantLocalePath/useToast/useAuthStore/storeToRefs/ref/computed` 在 Nuxt 自动导入范围内，无需 import（与既有 composable 一致）。

- [ ] **Step 5.2: coupon-mall 页改用 composable**

`pages/coupon-mall/index.vue` script：

1. import 区删除 `createCouponSaleOrder, createWechatCouponPayment, payCouponSaleWithBalance, cancelCouponSaleOrder, getMyCouponSaleOrders, exchangeCouponWithPoints, couponErrorMessage`（保留 `getCouponSaleCatalogue, getPointsMallTemplates` 与 `invokeWechatPay, isWechatBrowser` 若模板仍直接使用——不再使用则一并删除）；`CouponSaleOrder` 类型 import 删除。
2. 删除 L74-206 的整段逻辑（sheetTarget…exchange），替换为一行：

```ts
const {
  sheetTarget, sheetBundle, openDetail, closeDetail, buyFromSheet,
  buyingId, paying, paySheetOpen, payMode, buyName, buyAmount,
  startBuy, confirmPay, closePaySheet, exchangingId, exchange,
} = useCouponSaleFlow();
```

3. 模板中 L276-294 的 `CouponMallDetailSheet` `@close="sheetTarget = null; sheetBundle = null"` 改为 `@close="closeDetail"`；其余 template 不动（floors/goTo/load/needLogin/goLogin/loadError 留在页面）。

- [ ] **Step 5.3: 回归验证**

```powershell
cd d:\zhao\nshop
pnpm build
```

Expected: 构建通过。

再 `pnpm dev` 起本地（默认渠道），浏览器开 `/coupon-mall`：楼层渲染、点购买（未登录跳登录）、详情弹层开关、支付弹层开/关正常——与重构前行为一致。

- [ ] **Step 5.4: Commit**

```powershell
git add layers/base/app/composables/useCouponSaleFlow.ts layers/base/app/pages/coupon-mall/index.vue
git commit -m "refactor(coupon-mall): 购买/支付/兑换流程抽取 useCouponSaleFlow（券店首页复用）"
```

---

## Task 6: nshop — CouponStoreHome 双版式组件 + 首页分支

**Files:**
- Create: `layers/base/app/components/coupon-store/CouponStoreHome.vue`
- Create: `layers/base/app/components/coupon-store/CouponGridCard.vue`
- Modify: `app/pages/index.vue`（顶部分支）

- [ ] **Step 6.1: CouponGridCard（版式 B 宫格卡，纯展示）**

创建 `layers/base/app/components/coupon-store/CouponGridCard.vue`：

```vue
<script setup lang="ts">
import { saleProgress } from "../../utils/coupon-mall";
import { couponYuan } from "../../utils/coupon";

/** 券店首页版式 B：面额大字宫格卡（对齐 mockup 版式 B）。购买动作 emit。 */
const props = defineProps<{
  tpl: Record<string, any>;
  buying?: boolean;
}>();
const emit = defineEmits<{ (e: "buy"): void }>();
const { t } = useI18n();
const progress = computed(() =>
  saleProgress({
    claimedCount: props.tpl.claimedCount,
    totalCount: props.tpl.totalCount,
    claimable: props.tpl.claimable ?? null,
  }),
);
</script>

<template>
  <div class="grid-card" :class="{ soldout: progress.soldOut }">
    <span class="face">¥{{ couponYuan(tpl.discountValue) }}</span>
    <span class="cond">
      {{ tpl.minSpend > 0 ? t("messages.coupon.minSpend", { n: couponYuan(tpl.minSpend) }) : t("messages.coupon.noThreshold") }}
      · {{ tpl.discountValue && tpl.type === "PERCENT" ? `${(tpl.discountValue / 10).toString().replace(/\.0$/, "")}折` : t("messages.couponStore.floorIntro") }}
    </span>
    <div class="foot">
      <span class="price">¥{{ couponYuan(tpl.salePrice) }}</span>
      <UButton size="xs" :disabled="progress.soldOut || buying" :loading="buying" @click="emit('buy')">
        {{ progress.soldOut ? t("messages.couponMall.soldOut") : t("messages.couponStore.gridBuy") }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.grid-card { display: flex; flex-direction: column; gap: 4px; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 12px; }
.grid-card.soldout { opacity: .55; }
.face { font-size: 20px; font-weight: 700; color: var(--ui-primary); }
.cond { font-size: 12px; color: var(--ui-text-muted); }
.foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.price { font-size: 15px; font-weight: 600; }
</style>
```

（Nuxt 组件自动注册前缀为目录名：模板中用 `<CouponStoreCouponGridCard>`；见 Task 6.3。）

- [ ] **Step 6.2: CouponStoreHome（店招 + 双版式楼层 + 复用卡片与弹层）**

创建 `layers/base/app/components/coupon-store/CouponStoreHome.vue`：

```vue
<script setup lang="ts">
import {
  getCouponSaleCatalogue,
  getPointsMallTemplates,
} from "~~/layers/base/app/composables/useCoupon";
import { saleProgress } from "../../utils/coupon-mall";
import { couponYuan } from "../../utils/coupon";

/**
 * 券店首页（Channel.customFields.storefrontMode=coupon）：
 * 店招 + 楼层（floors 导购 / grid 宫格，由 storefrontHomeLayout 配置）。
 * 只取 scene=IN_STORE 的买单券；楼层卡片/购买/支付/详情全部复用券商城实现。
 */
const props = defineProps<{ layout?: "floors" | "grid" }>();
const layout = computed(() => props.layout ?? "floors");

const { t, locale } = useI18n();
const { customFields } = useChannelTheme();
const localePath = useTenantLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());
const {
  sheetTarget, sheetBundle, openDetail, closeDetail, buyFromSheet,
  buyingId, paying, paySheetOpen, payMode, buyName, buyAmount,
  startBuy, confirmPay, closePaySheet, exchangingId, exchange,
} = useCouponSaleFlow();

const loadError = ref(false);
const templates = ref<any[]>([]);
const bundles = ref<any[]>([]);
const pointsTemplates = ref<any[]>([]);
const loading = ref(true);

const activeFloor = ref("sale");
const floors = computed(() => [
  { key: "sale", label: t("messages.couponMall.floorSale"), show: templates.value.length > 0 },
  { key: "bundle", label: t("messages.couponMall.floorBundle"), show: bundles.value.length > 0 },
  { key: "points", label: t("messages.couponMall.floorPoints"), show: layout.value === "floors" && pointsTemplates.value.length > 0 },
].filter((f) => f.show));

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    const [sale, points] = await Promise.all([
      getCouponSaleCatalogue("IN_STORE"),
      layout.value === "floors" ? getPointsMallTemplates() : Promise.resolve([]),
    ]);
    templates.value = sale?.templates ?? [];
    bundles.value = sale?.bundles ?? [];
    pointsTemplates.value = points ?? [];
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function goTo(key: string) {
  activeFloor.value = key;
  document.getElementById(`floor-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const shopName = computed(() => customFields.value?.shopName || "");
const slogan = computed(() => t("messages.couponStore.heroSlogan"));
</script>

<template>
  <main class="mx-auto w-full max-w-3xl px-3 pb-24">
    <!-- 店招 hero -->
    <header class="hero">
      <div>
        <div class="hero-name">{{ shopName }}</div>
        <div class="hero-slogan">{{ slogan }}</div>
      </div>
      <NuxtLink v-if="isAuthenticated" :to="localePath('/coupon')" class="pts-pill">
        {{ t("messages.couponMall.pointsBalance") }}
      </NuxtLink>
    </header>

    <!-- 版式 A：吸顶锚点 -->
    <nav v-if="layout === 'floors' && floors.length" class="sticky top-0 z-10 -mx-3 mb-3 flex gap-2 bg-(--ui-bg)/90 px-3 py-2 backdrop-blur">
      <UButton v-for="f in floors" :key="f.key" size="xs" :variant="activeFloor === f.key ? 'solid' : 'soft'" @click="goTo(f.key)">
        {{ f.label }}
      </UButton>
    </nav>

    <UAlert v-if="loadError" color="error" variant="soft" :title="t('messages.couponMall.loadFailed')">
      <UButton size="xs" variant="link" @click="load">{{ t("messages.couponMall.retry") }}</UButton>
    </UAlert>
    <UCard v-else-if="!loading && !templates.length && !bundles.length && !pointsTemplates.length" class="text-center text-(--ui-text-muted)">
      {{ t("messages.couponStore.empty") }}
    </UCard>

    <BaseLoader v-if="loading" width="sm:w-xs md:w-sm" />

    <!-- 版式 A：楼层 -->
    <template v-if="layout === 'floors'">
      <section v-if="templates.length" id="floor-sale" class="mb-6">
        <h2 class="mb-2 text-sm font-semibold">{{ t("messages.couponMall.floorSale") }}</h2>
        <div class="flex flex-col gap-2">
          <CouponMallCouponCard
            v-for="tpl in templates" :key="tpl.id"
            :tpl="tpl" :buying="buyingId === tpl.id"
            @buy="openDetail(tpl)"
            @detail="openDetail(tpl)"
          />
        </div>
      </section>
      <section v-if="bundles.length" id="floor-bundle" class="mb-6">
        <h2 class="mb-2 text-sm font-semibold">{{ t("messages.couponMall.floorBundle") }}</h2>
        <div class="flex flex-col gap-2">
          <CouponMallBundleCard
            v-for="b in bundles" :key="b.id"
            :bundle="b" :templates="templates" :buying="buyingId === b.id"
            @buy="startBuy(b, 'bundle')"
            @detail="openDetail(b, b)"
          />
        </div>
      </section>
      <section v-if="pointsTemplates.length" id="floor-points" class="mb-6">
        <h2 class="mb-2 text-sm font-semibold">{{ t("messages.couponMall.floorPoints") }}</h2>
        <div class="flex flex-col gap-2">
          <CouponMallPointsCard
            v-for="pt in pointsTemplates" :key="pt.id"
            :tpl="pt" :exchanging="exchangingId === pt.id"
            @exchange="exchange(pt)"
          />
        </div>
      </section>
    </template>

    <!-- 版式 B：券卡宫格（单券 2 列宫格 + 券包横幅 + 积分行） -->
    <template v-else>
      <section v-if="templates.length" class="mb-4">
        <div class="grid grid-cols-2 gap-2">
          <CouponStoreCouponGridCard
            v-for="tpl in templates" :key="tpl.id"
            :tpl="tpl" :buying="buyingId === tpl.id"
            @buy="openDetail(tpl)"
          />
        </div>
      </section>
      <section v-if="bundles.length" class="mb-4">
        <div class="flex flex-col gap-2">
          <CouponMallBundleCard
            v-for="b in bundles" :key="b.id"
            :bundle="b" :templates="templates" :buying="buyingId === b.id"
            @buy="startBuy(b, 'bundle')"
            @detail="openDetail(b, b)"
          />
        </div>
      </section>
      <section v-if="pointsTemplates.length" class="mb-4">
        <div class="flex flex-col gap-2">
          <CouponMallPointsCard
            v-for="pt in pointsTemplates" :key="pt.id"
            :tpl="pt" :exchanging="exchangingId === pt.id"
            @exchange="exchange(pt)"
          />
        </div>
      </section>
    </template>

    <CouponMallDetailSheet
      :open="!!sheetTarget"
      :tpl="sheetTarget"
      :bundle="sheetBundle"
      :templates="templates"
      @close="closeDetail"
      @buy="buyFromSheet"
    />

    <CouponPaySheet
      v-if="paySheetOpen"
      v-model="payMode"
      :name="buyName"
      :amount="buyAmount"
      :paying="paying"
      @confirm="confirmPay"
      @close="closePaySheet"
    />
  </main>
</template>

<style scoped>
.hero { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; border-radius: 12px; background: var(--ui-primary); color: #fff; padding: 16px; }
.hero-name { font-size: 17px; font-weight: 700; }
.hero-slogan { margin-top: 2px; font-size: 12px; opacity: .85; }
.pts-pill { border-radius: 999px; background: rgba(255, 255, 255, .18); padding: 4px 10px; font-size: 12px; color: #fff; }
</style>
```

实现注意：
- 组件自动注册名 = 目录前缀 + 文件名：`components/coupon-mall/CouponCard.vue` → `CouponMallCouponCard`；`components/coupon-store/CouponGridCard.vue` → `CouponStoreCouponGridCard`（Step 6.1 模板内如需自引用同理）。
- `saleProgress` 若入参字段名与 `CouponGridCard` 用法不符（以 `utils/coupon-mall.ts` 实际签名为准），宫格卡直接用 `claimedCount/totalCount/claimable` 计算售罄与进度，勿造新字段（如 `tpl_count_total` 不存在则删除）。
- `CouponGridCard` 折扣值展示：`PERCENT` 类型 `discountValue` 为 85=8.5折，按 `discountValue/10` 展示；其余类型只显示门槛文案（`type` 字段已在 `CouponTemplate` 接口中）。

- [ ] **Step 6.3: 首页分支**

`app/pages/index.vue`：在 `<HomeBlockRenderer>` 所在分支外包一层模式判断（保留 `resolvedSections` 逻辑给普通模式）：

```vue
    <!-- 券店模式：整店只卖买单券，首页渲染券店版式（楼层导购/券卡宫格） -->
    <CouponStoreHome v-if="isCouponStore" :layout="homeLayout" />
    <template v-else>
      <!-- 原 HomeBlockRenderer / 快讯栏等京东布局，原样保留 -->
    </template>
```

script 增加：

```ts
const { isCouponStore, homeLayout } = useStorefrontMode();
```

（`app/pages/index.vue` 原有 `useShopContent`/宫格/快讯等逻辑全部保留在 `v-else` 分支内，不删除。）

- [ ] **Step 6.4: 构建与双版式验证**

```powershell
cd d:\zhao\nshop
pnpm build
```

Expected: 构建通过。随后 `pnpm dev`，临时把 `useStorefrontMode` 的 `mode` 强制为 `"coupon"`（本地验证用，验证后还原）在浏览器确认：`/` 渲染券店首页（floors 版式）；`:layout="'grid'"` 时渲染宫格版式；未登录可看楼层、点抢购跳登录。

- [ ] **Step 6.5: Commit**

```powershell
git add layers/base/app/components/coupon-store layers/base/app/pages/index.vue
git commit -m "feat(coupon-store): 券店首页双版式组件（楼层导购/券卡宫格）+ 首页按店面模式分支"
```

---

## Task 7: nshop — 商品链路拦截中间件 + 提示页

**Files:**
- Create: `layers/base/app/middleware/coupon-store.global.ts`
- Create: `layers/base/app/pages/coupon-only.vue`

- [ ] **Step 7.1: 全局拦截中间件**

创建 `layers/base/app/middleware/coupon-store.global.ts`：

```ts
/**
 * 券店模式路由拦截：storefrontMode=coupon 的租户，直连商品/分类/搜索/结算 URL
 * 一律导到「本店仅售买单券」提示页。前缀剥离逻辑对齐 layouts/default.vue 的
 * stripRoutePrefixes（语言前缀 + 租户前缀），避免 /t1/product/x 被误判。
 */
const BLOCKED_PREFIXES = ["/product/", "/category", "/search", "/checkout"];

export default defineNuxtRouteMiddleware((to) => {
  const { isCouponStore } = useStorefrontMode();
  if (!isCouponStore.value) return;

  const { locale } = useI18n();
  const segs = to.path.split("/").filter(Boolean);
  let i = 0;
  if (segs[i]?.toLowerCase() === (locale.value ?? "").toLowerCase()) i++;
  const tenant = to.params.tenantCode as string | undefined;
  if (tenant && segs[i] === tenant) i++;
  const cleanPath = "/" + segs.slice(i).join("/");

  if (BLOCKED_PREFIXES.some((p) => cleanPath.startsWith(p)) && cleanPath !== "/coupon-only") {
    const localePath = useTenantLocalePath();
    return navigateTo(localePath("/coupon-only"), { replace: true });
  }
});
```

- [ ] **Step 7.2: 提示页**

创建 `layers/base/app/pages/coupon-only.vue`：

```vue
<script setup lang="ts">
definePageMeta({ title: "messages.couponStore.blockedTitle" });
const { t } = useI18n();
const localePath = useTenantLocalePath();
const { customFields } = useChannelTheme();
const shopName = computed(() => customFields.value?.shopName || "");
</script>

<template>
  <main class="mx-auto my-16 w-full max-w-md px-4 text-center">
    <UIcon name="i-lucide-ticket" class="mx-auto h-12 w-12 text-(--ui-primary)" />
    <h1 class="mt-4 text-lg font-semibold">
      {{ shopName ? `${shopName} · ` : "" }}{{ t("messages.couponStore.blockedTitle") }}
    </h1>
    <p class="mt-2 text-sm text-(--ui-text-muted)">{{ t("messages.couponStore.blockedDesc") }}</p>
    <UButton class="mt-6" :to="localePath('/')">{{ t("messages.couponStore.backHome") }}</UButton>
  </main>
</template>
```

（`definePageMeta.title` 为 i18n key 时 layouts/default.vue 的 `t(metaTitle)` 会自动翻译——若该机制不支持嵌套 key，则去掉 meta，由页面自渲染标题。）

- [ ] **Step 7.3: 验证**

`pnpm dev` + 强制 coupon 模式（同 Task 6.4）：访问 `/t1/product/anything`、`/t1/search`、`/t1/checkout` → 均落到 `/t1/coupon-only`；`/t1/coupon`、`/t1/coupon-mall`、`/t1/account` 不受影响。改回 normal 后同样路径直达商品页。

- [ ] **Step 7.4: Commit**

```powershell
git add layers/base/app/middleware/coupon-store.global.ts layers/base/app/pages/coupon-only.vue
git commit -m "feat(coupon-store): 券店模式拦截商品/分类/搜索/结算路由 + 提示页"
```

---

## Task 8: nshop — TabBar/Header 券店化 + 券单页

**Files:**
- Modify: `layers/base/app/components/home/jd/JdTabBar.vue`
- Modify: `layers/base/app/components/AppHeader.vue`
- Modify: `app/layouts/default.vue`
- Create: `layers/base/app/pages/coupon/orders.vue`

- [ ] **Step 8.1: JdTabBar 券店四 tab**

`JdTabBar.vue` script 增加：

```ts
const { isCouponStore } = useStorefrontMode();
```

template 在既有 `<nav>` 前加券店分支（原 nav 加 `v-else`）：

```vue
  <nav v-if="isCouponStore" class="fixed inset-x-0 bottom-0 z-[60] grid grid-cols-4 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] text-xs lg:hidden" :aria-label="t('messages.nav.bottomNav')">
    <NuxtLink :to="localePath('/')" class="flex flex-col items-center gap-0.5 py-2" :class="active === 'home' ? 'text-primary' : 'text-gray-500'">
      <UIcon name="i-lucide-home" class="h-6 w-6" />
      <span>{{ t('messages.nav.home') }}</span>
    </NuxtLink>
    <NuxtLink :to="localePath('/coupon')" class="flex flex-col items-center gap-0.5 py-2" :class="active === 'pack' ? 'text-primary' : 'text-gray-500'">
      <UIcon name="i-lucide-ticket" class="h-6 w-6" />
      <span>{{ t('messages.nav.couponPack') }}</span>
    </NuxtLink>
    <NuxtLink :to="localePath('/coupon/orders')" class="flex flex-col items-center gap-0.5 py-2" :class="active === 'orders' ? 'text-primary' : 'text-gray-500'">
      <UIcon name="i-lucide-receipt-text" class="h-6 w-6" />
      <span>{{ t('messages.nav.orders') }}</span>
    </NuxtLink>
    <NuxtLink :to="localePath('/account')" class="flex flex-col items-center gap-0.5 py-2" :class="active === 'account' ? 'text-primary' : 'text-gray-500'">
      <UIcon name="i-lucide-user" class="h-6 w-6" />
      <span>{{ t('messages.nav.my') }}</span>
    </NuxtLink>
  </nav>
```

script 的 `active` computed 扩展：

```ts
const active = computed(() => {
  if (route.path.startsWith(localePath("/coupon/orders"))) return "orders";
  if (route.path === localePath("/coupon") || route.path.startsWith(localePath("/coupon") + "/")) return "pack";
  if (route.path === "/") return "home";
  if (route.path.startsWith("/account")) return "account";
  return "home";
});
```

注意：券店分支不再需要 `isCartOpen/isAllCatOpen/cartCount`（购物车/分类入口已移除），保留给普通分支使用即可。

- [ ] **Step 8.2: AppHeader 券店精简**

`AppHeader.vue` script 增加 `const { isCouponStore } = useStorefrontMode();`，模板改动：

1. `UNavigationMenu`（L57-61 两处，含 #body 内那份）包 `v-if="!isCouponStore"`
2. `<SearchModal />`（L71）与 `<CartTrigger />`（L73）包 `v-if="!isCouponStore"`
3. `<CartPanel />`（L88）包 `v-if="!isCouponStore"`
4. 保留 Logo、城市/租户选择器、AccountMenu。

- [ ] **Step 8.3: default.vue 分类抽屉券店隐藏**

`app/layouts/default.vue` L98 `<JdAllCategoryDrawer />` 改为：

```vue
          <JdAllCategoryDrawer v-if="!isCouponStore" />
```

script 增加 `const { isCouponStore } = useStorefrontMode();`。

- [ ] **Step 8.4: 券单页**

创建 `layers/base/app/pages/coupon/orders.vue`：

```vue
<script setup lang="ts">
import type { CouponSaleOrder } from "~~/layers/base/app/composables/useCoupon";
import { getMyCouponSaleOrders, createWechatCouponPayment, payCouponSaleWithBalance, couponErrorMessage } from "~~/layers/base/app/composables/useCoupon";
import { invokeWechatPay, isWechatBrowser } from "~~/layers/base/app/utils/coupon";

/**
 * 券单（我的券购买订单）：单券/券包出售单列表 + 未支付单继续支付（复用 PaySheet 链路）。
 */
definePageMeta({ title: "messages.couponSaleOrders.title" });

const { t } = useI18n();
const toast = useToast();
const loading = ref(true);
const orders = ref<CouponSaleOrder[]>([]);
const catalogueNames = ref<Record<string, string>>({});

const paySheetOpen = ref(false);
const paying = ref(false);
const payMode = ref<"WECHAT" | "BALANCE">("WECHAT");
const pendingOrder = ref<CouponSaleOrder | null>(null);

async function load() {
  loading.value = true;
  try {
    orders.value = (await getMyCouponSaleOrders()) ?? [];
  } catch (e) {
    toast.add({ title: t("messages.couponSaleOrders.loadFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function statusText(s: string) {
  const key = `messages.couponSaleOrders.status${s}` as const;
  const text = t(key);
  return text === key ? s : text;
}

function kindText(o: CouponSaleOrder) {
  return o.bundleId ? t("messages.couponSaleOrders.bundleItem") : t("messages.couponSaleOrders.templateItem");
}

async function payAgain(o: CouponSaleOrder) {
  pendingOrder.value = o;
  payMode.value = isWechatBrowser() ? "WECHAT" : "BALANCE";
  paySheetOpen.value = true;
}

async function confirmPay() {
  const order = pendingOrder.value;
  if (!order || paying.value) return;
  paying.value = true;
  try {
    if (payMode.value === "BALANCE") {
      await payCouponSaleWithBalance(order.id);
      paySheetOpen.value = false;
      toast.add({ title: t("messages.coupon.paySuccess"), color: "success" });
      await load();
    } else {
      if (!isWechatBrowser()) {
        toast.add({ title: t("messages.coupon.notInWechat"), color: "warning" });
        return;
      }
      const res = await createWechatCouponPayment(order.id, "JSAPI");
      if (!res?.pay?.paySign) {
        toast.add({ title: t("messages.coupon.noOpenid"), color: "warning" });
        return;
      }
      await invokeWechatPay(res.pay);
      paySheetOpen.value = false;
      toast.add({ title: t("messages.coupon.paySuccess"), color: "success" });
      await load();
    }
  } catch (e) {
    toast.add({ title: t("messages.coupon.payFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    paying.value = false;
  }
}

function closePaySheet() {
  paySheetOpen.value = false;
  pendingOrder.value = null;
}
</script>

<template>
  <main class="mx-auto my-6 w-full max-w-3xl px-3 pb-24">
    <h1 class="mb-3 text-lg font-semibold">{{ t("messages.couponSaleOrders.title") }}</h1>

    <BaseLoader v-if="loading" width="sm:w-xs" />
    <UCard v-else-if="!orders.length" class="text-center text-(--ui-text-muted)">
      {{ t("messages.couponSaleOrders.empty") }}
    </UCard>

    <ul v-else class="flex flex-col gap-2">
      <li v-for="o in orders" :key="o.id" class="flex items-center justify-between rounded-xl border border-default bg-(--ui-bg) px-3 py-2.5">
        <div>
          <div class="text-sm font-medium">{{ kindText(o) }} · ¥{{ (o.amount / 100).toFixed(2) }}</div>
          <div class="mt-0.5 text-xs text-(--ui-text-muted)">{{ new Date(o.createdAt).toLocaleString() }}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs" :class="o.status === 'PENDING' ? 'text-(--ui-warning)' : 'text-(--ui-text-muted)'">
            {{ statusText(o.status) }}
          </span>
          <UButton v-if="o.status === 'PENDING'" size="xs" @click="payAgain(o)">
            {{ t("messages.couponSaleOrders.payAgain") }}
          </UButton>
        </div>
      </li>
    </ul>

    <CouponPaySheet
      v-if="paySheetOpen"
      v-model="payMode"
      :name="t('messages.couponSaleOrders.title')"
      :amount="pendingOrder?.amount ?? 0"
      :paying="paying"
      @confirm="confirmPay"
      @close="closePaySheet"
    />
  </main>
</template>
```

实现注意：未支付单在 PaySheet 关闭时**不**自动取消（区别于购买页——券单页允许保留 PENDING 稍后支付）；`CouponPaySheet` 组件名以 `components/` 实际目录为准（与券商城页用法一致）。

- [ ] **Step 8.5: 验证**

```powershell
cd d:\zhao\nshop
pnpm build
```

Expected: 构建通过。`pnpm dev` + coupon 模式强制：TabBar 四 tab 齐全可点、Header 无搜索/购物车、`/t1/coupon/orders` 列表渲染（登录后）、PENDING 单可继续支付。

- [ ] **Step 8.6: Commit**

```powershell
git add layers/base/app/components/home/jd/JdTabBar.vue layers/base/app/components/AppHeader.vue app/layouts/default.vue layers/base/app/pages/coupon/orders.vue
git commit -m "feat(coupon-store): TabBar/Header 券店化（首页/券包/券单/我的）+ 券单页（继续支付）"
```

---

## Task 9: 联调验证 + 手机截图 + 操作手册 + 部署

**Files:**
- Create: `d:\zhao\nshop\docs\superpowers\manual\coupon-storefront\README.md`
- Create: `scripts/screenshot-coupon-store.mjs`（nshop 仓库，Playwright 截图脚本；如仓库已有同类脚本则复用改参数）

- [ ] **Step 9.1: 后端联调前置**

```powershell
cd d:\zhao\vendure
pnpm build
```

按仓库部署流程上线 vendure（本地构建 → push → 服务器 `git pull` + `pm2 restart`（含 worker））。用 curl 验证（JSON body 写临时文件 + `--data-binary "@file"`，PowerShell 引号坑）：

1. 匿名 + t1 渠道 token 调 `couponSaleCatalogue(scene: "IN_STORE")` → 200 且 templates 全部 usageScene=IN_STORE/ALL
2. 换默认渠道 token 同查询 → 只见该渠道券（渠道隔离回归）
3. 匿名调 `createCouponSaleOrder` → 未授权错误（购买仍需登录）

- [ ] **Step 9.2: web-admin 配置 t1**

构建部署 web-admin 后：平台侧 租户管理 → 新生（t1）→ 店面模式 → 券店（只卖买单券）+ 版式（楼层导购/券卡宫格按运营意愿）→ 保存。

- [ ] **Step 9.3: nshop 本地构建 + 部署**

```powershell
cd d:\zhao\nshop
pnpm build
node scripts/deploy.mjs
```

- [ ] **Step 9.4: 手机视口截图（硬规范：390×844 dpr=2）**

Playwright 脚本（nshop 仓库既有截图脚本模式）对以下页面截图存 `docs/superpowers/manual/coupon-storefront/`：

1. `/t1/` 券店首页 floors 版式（含店招、锚点、楼层）
2. `/t1/` grid 版式（临时切配置或本地强制）
3. `/t1/coupon-only` 拦截提示页（直连 `/t1/product/x` 的落地页）
4. `/t1/coupon/orders` 券单页（登录态）
5. 匿名访问 `/t1/`（未登录可浏览楼层）
6. 对照：默认渠道 `/`（normal 京东布局无变化）

- [ ] **Step 9.5: 操作手册**

创建 `nshop/docs/superpowers/manual/coupon-storefront/README.md`，内容含：功能说明（券店模式语义）、平台侧配置路径（含截图）、t1 运营侧买单券上架路径（优惠券模块创建模板：usageScene=IN_STORE、salePrice 定价、分发渠道含 SALE；券包同理）、C 端动线说明（浏览→登录→购券→我的券包→到店出示→商户核销）、测试用例清单（对齐 Step 9.1/9.4）、已知边界（切回 normal 恢复普通商城；存量商品需运营下架；全部售罄/空目录空态）。

- [ ] **Step 9.6: Commit + 收尾（一气呵成：提交→推送→部署）**

```powershell
git add docs/superpowers/manual/coupon-storefront scripts/screenshot-coupon-store.mjs
git commit -m "docs(coupon-store): 券店模式操作手册 + 手机视口截图（390x844 dpr=2）"
git push
```

vendure / web-admin 仓库各自完成对应提交推送与部署（铁律：一律本地构建，服务器只解压/重启）。

---

## 自审记录（Spec 覆盖对照）

| Spec 条目 | 任务 |
| --- | --- |
| §3.1 storefrontMode/storefrontHomeLayout 字段 | Task 1 |
| §3.2 couponSaleCatalogue 匿名 | Task 2 |
| §4 web-admin 表单 + i18n | Task 3 |
| §5.1 GetChannelTheme + useStorefrontMode | Task 4 |
| §5.2 CouponStoreHome 双版式 + 复用楼层组件 | Task 5/6 |
| §5.3 拦截中间件 + 提示页 | Task 7 |
| §5.4 TabBar/Header 券店化 + 券单页 | Task 8 |
| §5.5 i18n 双语言 | Task 4（其余词条随任务落位） |
| §6 边界（售罄/空态/坏值/切回） | Task 6（复用券商城逻辑）+ Task 7（坏值回退） |
| §8.1-8.3 测试/截图/手册/部署 | Task 9 |

类型一致性：`storefrontMode: "normal"|"coupon"`、`storefrontHomeLayout: "floors"|"grid"` 在后端 options、web-admin 表单、nshop composable 三处拼写一致；`useCouponSaleFlow` 返回值与 Task 6/8 消费的解构名一致。
