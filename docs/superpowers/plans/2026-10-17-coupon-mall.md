# 券商城独立页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 [2026-10-17-coupon-mall-design.md](file:///d:/zhao/docs/superpowers/specs/2026-10-17-coupon-mall-design.md) 交付券商城独立页：nshop 新页 `/coupon-mall`（版式 A 楼层导购 + 详情弹层）+ vshop 券商城页版式对齐 + web-admin 券详情编辑（图文混排/图库插入）+ 两端入口。

**Architecture:** 后端零改动（`description` LocalizedText 已存在且两端查询已拉取）。nshop 新增 4 个展示组件 + 1 个页面，购买/支付流程完整复用 `useCoupon` 现有函数与 PaySheet 接线模式。首页宫格入口两端均为**装修配置驱动**（NavSection/NavGrid items），代码零改动，交付时提供配置说明。券介绍图文混排用行级 `![图](url)` 标记，不引入富文本。

**Tech Stack:** Nuxt 3 + @nuxt/ui（nshop）、uni-app H5 + vue-i18n（vshop）、uni-app H5 admin（vshop/web-admin）、Vitest（两端单测）、Vendure shop-api（只读）。

**仓库与测试命令：**

| 仓库 | 路径 | 单测 | 构建 |
|---|---|---|---|
| nshop | `d:\zhao\nshop` | `npm test`（vitest run） | `npm run build` + `scripts/deploy.mjs` |
| vshop | `d:\zhao\vshop` | `npm test`（vitest run --config vitest.config.ts） | `npm run build:h5` |
| web-admin | `d:\zhao\vshop\web-admin` | — | `scripts/deploy.mjs` |

**已核实的代码事实（执行者无需重新调研）：**

- nshop `layers/base/app/composables/useCoupon.ts`：`COUPON_TEMPLATE_FIELDS`（L246-257）已含 `description`；导出 `getCouponSaleCatalogue(scene)`、`getPointsMallTemplates()`、`createCouponSaleOrder({templateId}|{bundleId})`、`payCouponSaleWithBalance(id)`、`createWechatCouponPayment(id,'JSAPI')`、`cancelCouponSaleOrder(id)`、`getMyCouponSaleOrders()`。
- nshop 购买流程模板：`layers/base/app/pages/coupon/index.vue` L260-346（startBuy → PaySheet → confirmPay 余额/微信 JSAPI → waitForPaid 轮询 → onPaid；closePaySheet 取消 PENDING 单）。
- nshop 组件自动注册：`nuxt.config.ts` 无 components 配置 → Nuxt 默认 pathPrefix=true：`components/coupon-mall/CouponCard.vue` → 注册名 `CouponMallCouponCard`。
- nshop `localizeText(text, locale)` 位于 `layers/base/app/utils/detail-config.ts`。
- nshop i18n：`layers/base/i18n/locales/zh-CN.ts`、`en-US.ts`（messages.* 命名空间）。
- nshop 首页宫格：`components/home/blocks/NavGrid.vue` 渲染装修配置 section.items，无硬编码默认项 → 首页入口走后台装修配置。
- vshop `src/pkg-promotion/pages/coupon-mall.vue`：TABS 含 claim/sale/points/code/wallet；`loadSale()` → `getCouponSaleCatalogue(saleScene)`；购买 startBuy/confirmPay 弹层 L249-278。
- vshop 我的页：`src/pages/profile/index.vue` L29 `menu-item` + `navTo()` 模式。
- vshop 首页宫格：`src/templates/shared/sections/NavSection.vue` 渲染装修配置 items → 首页入口走装修配置。
- web-admin：`src/pages/coupon/edit/index.vue` 已有 `form.descZh`/`form.descEn` textarea（L116-123）；`src/components/MediaPicker.vue` props `{max?, value?: string[], mediaType?}` emits `change(ids:string[])`；id→url 解析用 `fetchAssets(1, 0, undefined, ids)` 返回 `items[0].preview`（shop-info 页 L224-232 先例）；i18n 在 `src/locale/zh-Hans.json`、`en.json`（couponEdit 命名空间）。

---

## Task 1: nshop 券商城纯逻辑工具（TDD）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\coupon-mall.ts`
- Test: `d:\zhao\nshop\layers\base\app\utils\__tests__\coupon-mall.spec.ts`

- [ ] **Step 0: 核对类型字段名**

读 `d:\zhao\nshop\layers\base\app\composables\useCoupon.ts` L41-103，记录：`CouponTemplate` 的 `pointsPrice`（积分价，若无此字段记 `exchangePrice`）、`CouponBundle` 的券包明细字段名（`items` 或 `templates`，及明细项内 `name`/`discountValue` 字段路径）。后续 Task 4/5/6 用记录的名字；本任务代码先用 `pointsPrice`，若 Step 0 核出不同名，同步改测试与本任务实现。

- [ ] **Step 1: 写失败测试**

```ts
// d:\zhao\nshop\layers\base\app\utils\__tests__\coupon-mall.spec.ts
import { describe, it, expect } from "vitest";
import {
  saleProgress,
  hasDetail,
  parseDetailParagraphs,
  detailAssetUrl,
} from "../coupon-mall";

describe("saleProgress", () => {
  it("限量券：按已抢/总量算百分比", () => {
    expect(saleProgress({ claimedCount: 82, totalCount: 100, claimable: true })).toEqual({
      percent: 82,
      soldOut: false,
    });
  });
  it("百分比封顶 100，满格即售罄", () => {
    expect(saleProgress({ claimedCount: 120, totalCount: 100, claimable: true })).toEqual({
      percent: 100,
      soldOut: true,
    });
  });
  it("totalCount=0 不限量：无进度条，仅按 claimable 判售罄", () => {
    expect(saleProgress({ claimedCount: 5, totalCount: 0, claimable: true })).toEqual({
      percent: null,
      soldOut: false,
    });
    expect(saleProgress({ claimedCount: 5, totalCount: 0, claimable: false }).soldOut).toBe(true);
  });
  it("claimable=false 直接售罄", () => {
    expect(saleProgress({ claimedCount: 3, totalCount: 10, claimable: false }).soldOut).toBe(true);
  });
  it("字段缺失/脏数据不抛错", () => {
    expect(saleProgress({ claimedCount: undefined, totalCount: undefined, claimable: undefined })).toEqual({
      percent: null,
      soldOut: false,
    });
  });
});

describe("hasDetail", () => {
  it("description 有当前语言内容 → true", () => {
    expect(hasDetail({ "zh-CN": "介绍", "en-US": "intro" }, "zh-CN")).toBe(true);
  });
  it("空白内容 → false", () => {
    expect(hasDetail({ "zh-CN": "   " }, "zh-CN")).toBe(false);
  });
  it("空/缺字段 → false", () => {
    expect(hasDetail(null, "zh-CN")).toBe(false);
    expect(hasDetail({}, "zh-CN")).toBe(false);
  });
});

describe("parseDetailParagraphs", () => {
  it("文本行与整行图片标记分开渲染", () => {
    expect(
      parseDetailParagraphs("第一行\n![图](https://cdn.example.com/a.png)\n第二行"),
    ).toEqual([
      { type: "text", content: "第一行" },
      { type: "image", content: "https://cdn.example.com/a.png" },
      { type: "text", content: "第二行" },
    ]);
  });
  it("URL 为空的非法标记按普通文本回退", () => {
    expect(parseDetailParagraphs("![图]()")).toEqual([{ type: "text", content: "![图]()" }]);
  });
  it("空串返回空数组", () => {
    expect(parseDetailParagraphs("")).toEqual([]);
  });
});

describe("detailAssetUrl", () => {
  it("http(s) 开头原样返回", () => {
    expect(detailAssetUrl("https://a.com/x.png", "https://shop.com")).toBe("https://a.com/x.png");
  });
  it("相对路径拼当前 origin", () => {
    expect(detailAssetUrl("/media/x.png", "https://shop.com")).toBe("https://shop.com/media/x.png");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run（cwd=`d:\zhao\nshop`）: `npm test -- coupon-mall`
Expected: FAIL（Cannot find module '../coupon-mall'）

- [ ] **Step 3: 实现**

```ts
// d:\zhao\nshop\layers\base\app\utils\coupon-mall.ts
import { localizeText } from "./detail-config";

/** 券商城目录卡片的库存进度与售罄判定（纯函数，SSR 友好） */
export interface SaleProgress {
  /** 0-100 整数；totalCount<=0（不限量）为 null */
  percent: number | null;
  soldOut: boolean;
}

export function saleProgress(input: {
  claimedCount?: number | null;
  totalCount?: number | null;
  claimable?: boolean | null;
}): SaleProgress {
  const { claimedCount, totalCount, claimable } = input;
  if (claimable === false) {
    return { percent: totalCount && totalCount > 0 ? 100 : null, soldOut: true };
  }
  if (totalCount && totalCount > 0) {
    const percent = Math.min(100, Math.round(((claimedCount ?? 0) / totalCount) * 100));
    return { percent, soldOut: percent >= 100 };
  }
  return { percent: null, soldOut: false };
}

/** 券详情可选增强：description 本地化后非空白才有详情入口 */
export function hasDetail(description: unknown, locale: string): boolean {
  if (!description) return false;
  const text = localizeText(description as never, locale);
  return typeof text === "string" && text.trim().length > 0;
}

export interface DetailParagraph {
  type: "text" | "image";
  content: string;
}

const IMG_LINE_RE = /^!\[[^\]]*\]\(([^)]+)\)$/;

/** description 按行分段：整行 `![图](url)` 为图片段，其余为文本段；非法标记回退文本 */
export function parseDetailParagraphs(text: string): DetailParagraph[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map<DetailParagraph>((line) => {
      const m = IMG_LINE_RE.exec(line);
      return m && m[1] ? { type: "image", content: m[1] } : { type: "text", content: line };
    });
}

/** 图库图片 URL 归一：相对路径拼当前访问 origin，禁止硬编码域名 */
export function detailAssetUrl(url: string, origin: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- coupon-mall`
Expected: PASS（14 tests）

- [ ] **Step 5: Commit（nshop 仓库）**

```bash
git -C d:\zhao\nshop add layers/base/app/utils/coupon-mall.ts layers/base/app/utils/__tests__/coupon-mall.spec.ts
git -C d:\zhao\nshop commit -m "feat(coupon-mall): 券商城纯逻辑工具（进度/详情判定/图文分段）"
```

---

## Task 2: nshop i18n 词条

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts`

- [ ] **Step 1: zh-CN.ts 增加命名空间**

在 `messages` 对象内新增（与 `coupon` 平级）：

```ts
couponMall: {
  navTitle: "券商城",
  heroTitle: "券商城",
  heroSub: "好券低至折扣价，积分也能换",
  pointsBalance: "积分",
  floorSale: "热销单券",
  floorBundle: "超值券包",
  floorPoints: "积分兑换",
  buyNow: "立即抢购",
  soldOut: "已抢罄",
  claimedProgress: "已抢 {p}%",
  remaining: "剩余 {n} 张",
  viewDetail: "详情",
  secIntro: "券介绍",
  secScope: "适用范围",
  secUsage: "使用信息",
  secNotice: "购买须知",
  noticeText: "券类虚拟商品，售出后不支持退款；未使用请联系客服处理；每单限用一张，下单自动抵扣，可与会员折扣叠加。",
  scopeAll: "全部商品",
  scopeLimited: "指定范围可用",
  validDays: "自购 {d} 天内有效",
  perUserLimit: "每人限购 {n} 张",
  exchange: "兑换",
  pointsPrice: "{p} 积分",
  promoToMall: "逛券商城 ›",
  imageFail: "图片加载失败",
  loadFailed: "加载失败",
  retry: "重试",
  empty: "暂无可售优惠券",
  bundleCount: "共 {n} 张",
},
```

- [ ] **Step 2: en-US.ts 增加同名 key**

```ts
couponMall: {
  navTitle: "Coupon Mall",
  heroTitle: "Coupon Mall",
  heroSub: "Coupons at a discount, points redeemable",
  pointsBalance: "Points",
  floorSale: "Hot Coupons",
  floorBundle: "Value Packs",
  floorPoints: "Points Exchange",
  buyNow: "Buy Now",
  soldOut: "Sold Out",
  claimedProgress: "{p}% claimed",
  remaining: "{n} left",
  viewDetail: "Detail",
  secIntro: "Introduction",
  secScope: "Scope",
  secUsage: "Usage",
  secNotice: "Notice",
  noticeText: "Coupons are virtual goods and non-refundable once sold. Contact support if unused. One coupon per order, auto-applied at checkout, stackable with member discounts.",
  scopeAll: "All products",
  scopeLimited: "Selected items only",
  validDays: "Valid {d} days after purchase",
  perUserLimit: "Limit {n} per user",
  exchange: "Redeem",
  pointsPrice: "{p} pts",
  promoToMall: "Visit Coupon Mall ›",
  imageFail: "Image failed to load",
  loadFailed: "Failed to load",
  retry: "Retry",
  empty: "No coupons for sale",
  bundleCount: "{n} coupons",
},
```

- [ ] **Step 3: 验证 + Commit**

Run（cwd=`d:\zhao\nshop`）: `npx nuxi typecheck 2>$null; npm test -- home-skeleton`
Expected: 既有测试不受影响，无 i18n 语法错误

```bash
git -C d:\zhao\nshop add layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git -C d:\zhao\nshop commit -m "feat(coupon-mall): i18n 词条（zh-CN/en-US）"
```

---

## Task 3: nshop 单券抢购卡 `CouponMallCouponCard`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\coupon-mall\CouponCard.vue`

- [ ] **Step 1: 创建组件**

```vue
<!-- d:\zhao\nshop\layers\base\app\components\coupon-mall\CouponCard.vue -->
<script setup lang="ts">
import { saleProgress, hasDetail } from "../../utils/coupon-mall";
import { couponYuan } from "../../utils/coupon";

const props = defineProps<{
  tpl: Record<string, any>;
  buying?: boolean;
}>();
const emit = defineEmits<{ (e: "buy"): void; (e: "detail"): void }>();
const { t, locale } = useI18n();
const progress = computed(() =>
  saleProgress({
    claimedCount: props.tpl.claimedCount,
    totalCount: props.tpl.totalCount,
    claimable: props.tpl.claimable ?? null,
  }),
);
const detailable = computed(() => hasDetail(props.tpl.description, locale.value));
</script>

<template>
  <view class="mall-card" :class="{ soldout: progress.soldOut }" @click="detailable && emit('detail')">
    <view class="left">
      <text class="amount">{{ couponYuan(tpl.discountValue) }}</text>
      <text class="cond">{{ tpl.minSpend > 0 ? `满${couponYuan(tpl.minSpend)}可用` : "无门槛" }}</text>
    </view>
    <view class="right">
      <view class="row1">
        <text class="name">{{ localizeText(tpl.name, locale) }}</text>
        <text class="scene">{{ tpl.usageScene === "IN_STORE" ? "到店" : "线上" }}</text>
      </view>
      <view v-if="progress.percent !== null" class="track">
        <view class="fill" :style="{ width: progress.percent + '%' }" />
      </view>
      <view class="row2">
        <text class="meta">
          {{ progress.soldOut
            ? t("messages.couponMall.soldOut")
            : progress.percent !== null
              ? t("messages.couponMall.claimedProgress", { p: progress.percent })
              : "" }}
        </text>
        <view class="actions">
          <text v-if="detailable" class="detail" @click.stop="emit('detail')">{{ t("messages.couponMall.viewDetail") }}</text>
          <UButton
            size="sm"
            :disabled="progress.soldOut || buying"
            :loading="buying"
            @click.stop="emit('buy')"
          >
            {{ t("messages.couponMall.buyNow") }} {{ couponYuan(tpl.salePrice) }}
          </UButton>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.mall-card { display: flex; gap: 12px; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 12px; }
.mall-card.soldout { opacity: 0.55; }
.left { min-width: 72px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px dashed var(--ui-border); padding-right: 12px; }
.amount { font-size: 20px; font-weight: 700; color: var(--ui-primary); }
.cond { font-size: 11px; color: var(--ui-text-muted); }
.right { flex: 1; display: flex; flex-direction: column; gap: 6px; justify-content: center; }
.row1, .row2 { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.name { font-size: 14px; font-weight: 600; }
.scene { font-size: 10px; color: var(--ui-primary); background: var(--ui-bg-elevated); border-radius: 999px; padding: 1px 8px; }
.track { height: 6px; border-radius: 999px; background: var(--ui-bg-elevated); overflow: hidden; }
.fill { height: 100%; background: var(--ui-primary); border-radius: 999px; }
.meta { font-size: 11px; color: var(--ui-text-muted); }
.actions { display: flex; align-items: center; gap: 8px; }
.detail { font-size: 12px; color: var(--ui-text-muted); }
</style>
```

- [ ] **Step 2: 验证 + Commit**

Run（cwd=`d:\zhao\nshop`）: `npm run build 2>&1 | Select-Object -Last 5`
Expected: 构建无组件报错（auto-import 类型告警可忽略）

```bash
git -C d:\zhao\nshop add layers/base/app/components/coupon-mall/CouponCard.vue
git -C d:\zhao\nshop commit -m "feat(coupon-mall): 单券抢购卡组件（进度/售罄/详情入口）"
```

---

## Task 4: nshop 券包卡 `CouponMallBundleCard`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\coupon-mall\BundleCard.vue`

- [ ] **Step 0: 确认券包明细字段**

读 `useCoupon.ts` L41-103 的 `CouponBundle` 类型与 `SaleList.vue` L61-123 券包卡模板，记录明细集合字段（`items`/`templates`）与单项字段路径。Task 6 弹层的券包明细用同一字段。

- [ ] **Step 1: 创建组件**

```vue
<!-- d:\zhao\nshop\layers\base\app\components\coupon-mall\BundleCard.vue -->
<script setup lang="ts">
import { hasDetail } from "../../utils/coupon-mall";
import { couponYuan } from "../../utils/coupon";

const props = defineProps<{ bundle: Record<string, any>; buying?: boolean }>();
const emit = defineEmits<{ (e: "buy"): void; (e: "detail"): void }>();
const { t, locale } = useI18n();
const detailable = computed(() => hasDetail(props.bundle.description, locale.value));
</script>

<template>
  <view class="bundle-card" @click="detailable && emit('detail')">
    <view class="head">
      <text class="name">{{ localizeText(bundle.name, locale) }}</text>
      <text v-if="detailable" class="detail" @click.stop="emit('detail')">{{ t("messages.couponMall.viewDetail") }}</text>
    </view>
    <view class="chips">
      <text v-for="(it, i) in (bundle.items || [])" :key="i" class="chip">
        {{ localizeText(it.name ?? it.template?.name, locale) }} {{ couponYuan(it.discountValue ?? it.template?.discountValue) }}
      </text>
    </view>
    <view class="foot">
      <text class="price">{{ couponYuan(bundle.salePrice) }}</text>
      <UButton size="sm" :disabled="buying" :loading="buying" @click.stop="emit('buy')">
        {{ t("messages.couponMall.buyNow") }}
      </UButton>
    </view>
  </view>
</template>

<style scoped>
.bundle-card { background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.head { display: flex; justify-content: space-between; align-items: center; }
.name { font-size: 15px; font-weight: 700; }
.detail { font-size: 12px; color: var(--ui-text-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: 11px; color: var(--ui-text-muted); background: var(--ui-bg-elevated); border-radius: 999px; padding: 2px 8px; }
.foot { display: flex; justify-content: space-between; align-items: center; }
.price { font-size: 18px; font-weight: 700; color: var(--ui-primary); }
</style>
```

- [ ] **Step 2: 验证 + Commit**

Run: `npm run build 2>&1 | Select-Object -Last 5`
Expected: 无报错

```bash
git -C d:\zhao\nshop add layers/base/app/components/coupon-mall/BundleCard.vue
git -C d:\zhao\nshop commit -m "feat(coupon-mall): 券包卡组件"
```

---

## Task 5: nshop 积分兑换行卡 `CouponMallPointsCard`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\coupon-mall\PointsCard.vue`

- [ ] **Step 0: 确认积分字段**

读 `components/coupon/PointsList.vue`，记录积分模板的积分价字段名（`pointsPrice`/`exchangePrice`，下例用 `pointsPrice`，不同则同步改）与兑换调用所需参数。

- [ ] **Step 1: 创建组件**

```vue
<!-- d:\zhao\nshop\layers\base\app\components\coupon-mall\PointsCard.vue -->
<script setup lang="ts">
import { couponYuan } from "../../utils/coupon";

defineProps<{ tpl: Record<string, any>; exchanging?: boolean }>();
const emit = defineEmits<{ (e: "exchange"): void }>();
const { t, locale } = useI18n();
</script>

<template>
  <view class="points-card">
    <view class="left">
      <text class="amount">{{ couponYuan(tpl.discountValue) }}</text>
      <text class="name">{{ localizeText(tpl.name, locale) }}</text>
    </view>
    <view class="right">
      <text class="price">{{ t("messages.couponMall.pointsPrice", { p: tpl.pointsPrice }) }}</text>
      <UButton size="sm" variant="soft" :disabled="exchanging" :loading="exchanging" @click="emit('exchange')">
        {{ t("messages.couponMall.exchange") }}
      </UButton>
    </view>
  </view>
</template>

<style scoped>
.points-card { display: flex; justify-content: space-between; align-items: center; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 10px 12px; }
.left { display: flex; align-items: baseline; gap: 8px; }
.amount { font-size: 18px; font-weight: 700; color: var(--ui-primary); }
.name { font-size: 13px; }
.right { display: flex; align-items: center; gap: 10px; }
.price { font-size: 13px; color: var(--ui-text-muted); }
</style>
```

- [ ] **Step 2: 验证 + Commit**

Run: `npm run build 2>&1 | Select-Object -Last 5`

```bash
git -C d:\zhao\nshop add layers/base/app/components/coupon-mall/PointsCard.vue
git -C d:\zhao\nshop commit -m "feat(coupon-mall): 积分兑换行卡组件"
```

---

## Task 6: nshop 券详情弹层 `CouponMallDetailSheet`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\coupon-mall\DetailSheet.vue`

- [ ] **Step 0: 确认弹层容器**

读 `components/coupon/PaySheet.vue` 前 30 行，确认其弹层容器（`UModal`/`USlideover`/自研）。下例按 `UModal`；若 PaySheet 用别的，容器替换为同款。

- [ ] **Step 1: 创建组件**

```vue
<!-- d:\zhao\nshop\layers\base\app\components\coupon-mall\DetailSheet.vue -->
<script setup lang="ts">
import { hasDetail, parseDetailParagraphs, detailAssetUrl } from "../../utils/coupon-mall";
import { couponYuan } from "../../utils/coupon";

const props = defineProps<{
  open: boolean;
  tpl: Record<string, any> | null;
  /** 券包明细（券包卡传入） */
  bundleItems?: Array<Record<string, any>>;
  buying?: boolean;
}>();
const emit = defineEmits<{ (e: "close"): void; (e: "buy"): void }>();
const { t, locale } = useI18n();
const requestURL = useRequestURL();

const paragraphs = computed(() => {
  const desc = props.tpl?.description;
  if (!hasDetail(desc, locale.value)) return [];
  const raw = localizeText(desc as never, locale.value) as string;
  return parseDetailParagraphs(raw);
});
const scopeAll = computed(() => (props.tpl?.scope ?? "ALL") === "ALL");
const introImageFailed = ref(false);
watch(() => props.open, () => { introImageFailed.value = false; });
</script>

<template>
  <UModal :open="open" @update:open="!$event && emit('close')">
    <template #content>
      <view v-if="tpl" class="sheet">
        <view class="head">
          <view class="head-left">
            <text class="amount">{{ couponYuan(tpl.discountValue) }}</text>
            <text class="cond">{{ tpl.minSpend > 0 ? `满${couponYuan(tpl.minSpend)}可用` : "无门槛" }}</text>
          </view>
          <view class="head-info">
            <view class="row"><text class="name">{{ localizeText(tpl.name, locale) }}</text>
              <text class="scene">{{ tpl.usageScene === "IN_STORE" ? "到店" : "线上" }}</text></view>
            <text class="price">{{ couponYuan(tpl.salePrice) }}</text>
          </view>
        </view>

        <template v-if="paragraphs.length">
          <text class="sec">{{ t("messages.couponMall.secIntro") }}</text>
          <view class="intro">
            <template v-for="(p, i) in paragraphs" :key="i">
              <text v-if="p.type === 'text'" class="para">{{ p.content }}</text>
              <img
                v-else-if="!introImageFailed"
                class="para-img"
                loading="lazy"
                :src="detailAssetUrl(p.content, requestURL.origin)"
                :alt="t('messages.couponMall.secIntro')"
                @error="introImageFailed = true"
              >
              <text v-else class="img-fail">{{ t("messages.couponMall.imageFail") }}</text>
            </template>
          </view>
        </template>

        <text class="sec">{{ t("messages.couponMall.secScope") }}</text>
        <view class="chips">
          <text class="pill">{{ scopeAll ? t("messages.couponMall.scopeAll") : t("messages.couponMall.scopeLimited") }}</text>
          <text class="pill">{{ tpl.usageScene === "IN_STORE" ? "到店" : "线上" }}</text>
        </view>

        <text class="sec">{{ t("messages.couponMall.secUsage") }}</text>
        <view class="usage">
          <view v-if="tpl.validDays" class="urow"><text class="k">{{ t("messages.couponMall.secUsage") }}</text><text class="v">{{ t("messages.couponMall.validDays", { d: tpl.validDays }) }}</text></view>
          <view v-if="tpl.perUserLimit" class="urow"><text class="k">—</text><text class="v">{{ t("messages.couponMall.perUserLimit", { n: tpl.perUserLimit }) }}</text></view>
        </view>

        <view v-if="bundleItems?.length" class="chips">
          <text v-for="(it, i) in bundleItems" :key="'b' + i" class="pill">
            {{ localizeText(it.name ?? it.template?.name, locale) }} {{ couponYuan(it.discountValue ?? it.template?.discountValue) }}
          </text>
        </view>

        <view class="notice"><text class="notice-b">{{ t("messages.couponMall.secNotice") }}：</text><text class="notice-t">{{ t("messages.couponMall.noticeText") }}</text></view>

        <view class="cta">
          <text class="big">{{ couponYuan(tpl.salePrice) }}</text>
          <UButton :disabled="buying" :loading="buying" @click="emit('buy')">{{ t("messages.couponMall.buyNow") }}</UButton>
        </view>
      </view>
    </template>
  </UModal>
</template>

<style scoped>
.sheet { padding: 16px; display: flex; flex-direction: column; gap: 10px; max-height: 70vh; overflow-y: auto; }
.head { display: flex; gap: 12px; }
.head-left { min-width: 64px; display: flex; flex-direction: column; align-items: center; border-right: 1px dashed var(--ui-border); padding-right: 12px; }
.amount { font-size: 22px; font-weight: 700; color: var(--ui-primary); }
.cond { font-size: 11px; color: var(--ui-text-muted); }
.head-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.row { display: flex; justify-content: space-between; align-items: center; }
.name { font-size: 16px; font-weight: 600; }
.scene { font-size: 10px; color: var(--ui-primary); background: var(--ui-bg-elevated); border-radius: 999px; padding: 1px 8px; }
.price { font-size: 14px; font-weight: 700; color: var(--ui-primary); }
.sec { font-size: 13px; font-weight: 600; margin-top: 6px; border-left: 3px solid var(--ui-primary); padding-left: 6px; }
.intro { display: flex; flex-direction: column; gap: 6px; }
.para { font-size: 13px; color: var(--ui-text-muted); line-height: 1.6; }
.para-img { width: 100%; border-radius: 8px; }
.img-fail { font-size: 12px; color: var(--ui-text-dimmed); text-align: center; padding: 12px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.pill { font-size: 11px; color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 999px; padding: 2px 10px; }
.usage { display: flex; flex-direction: column; gap: 4px; }
.urow { display: flex; justify-content: space-between; font-size: 12px; }
.k { color: var(--ui-text-dimmed); }
.v { font-weight: 500; }
.notice { background: var(--ui-bg-elevated); border-radius: 8px; padding: 8px 12px; }
.notice-b { font-size: 12px; font-weight: 600; }
.notice-t { font-size: 12px; color: var(--ui-text-muted); line-height: 1.6; }
.cta { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
.big { font-size: 18px; font-weight: 700; color: var(--ui-primary); }
</style>
```

- [ ] **Step 2: 验证 + Commit**

Run: `npm run build 2>&1 | Select-Object -Last 5`

```bash
git -C d:\zhao\nshop add layers/base/app/components/coupon-mall/DetailSheet.vue
git -C d:\zhao\nshop commit -m "feat(coupon-mall): 券详情弹层（图文混排介绍/范围/须知）"
```

---

## Task 7: nshop 券商城页面

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\pages\coupon-mall\index.vue`

- [ ] **Step 1: 创建页面（完整代码）**

取数/购买/支付完整复用 `useCoupon`，支付接线与 `pages/coupon/index.vue` L260-346 同模式：

```vue
<!-- d:\zhao\nshop\layers\base\app\pages\coupon-mall\index.vue -->
<script setup lang="ts">
import { useCoupon } from "../../composables/useCoupon";
import { couponErrorMessage } from "../../utils/coupon";

definePageMeta({ layout: "default" });
useHead({ title: () => "券商城" });

const { t } = useI18n();
const localePath = useLocalePath();
const toast = useToast();
const {
  getCouponSaleCatalogue, getPointsMallTemplates,
  createCouponSaleOrder, payCouponSaleWithBalance,
  createWechatCouponPayment, cancelCouponSaleOrder, getMyCouponSaleOrders,
} = useCoupon();

const loadError = ref(false);
const templates = ref<any[]>([]);
const bundles = ref<any[]>([]);
const pointsTemplates = ref<any[]>([]);
const loading = ref(true);

const saleScene = ref("ALL");
const activeFloor = ref("sale");
const floors = computed(() => [
  { key: "sale", label: t("messages.couponMall.floorSale"), show: templates.value.length > 0 },
  { key: "bundle", label: t("messages.couponMall.floorBundle"), show: bundles.value.length > 0 },
  { key: "points", label: t("messages.couponMall.floorPoints"), show: pointsTemplates.value.length > 0 },
].filter((f) => f.show));

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    const [sale, points] = await Promise.all([
      getCouponSaleCatalogue(saleScene.value),
      getPointsMallTemplates(),
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

// ── 购买/支付（与 pages/coupon/index.vue 同模式） ──
const buyingId = ref<string | null>(null);
const paying = ref(false);
const paySheetOpen = ref(false);
const payMode = ref<"WECHAT" | "BALANCE">("WECHAT");
const pendingOrder = ref<any>(null);
const buyName = ref("");
const buyAmount = ref(0);
const sheetTarget = ref<any>(null);
const sheetBundleItems = ref<any[] | undefined>(undefined);

async function startBuy(target: Record<string, any>, kind: "template" | "bundle") {
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

function openDetail(tpl: Record<string, any>, bundleItems?: any[]) {
  sheetTarget.value = tpl;
  sheetBundleItems.value = bundleItems;
}

function buyFromSheet() {
  const tpl = sheetTarget.value;
  if (!tpl) return;
  const kind = sheetBundleItems.value?.length ? "bundle" : "template";
  paySheetOpen.value = false;
  startBuy(tpl, kind);
}

async function waitForPaid(saleOrderId: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      const orders = await getMyCouponSaleOrders();
      if (orders.find((o: any) => o.id === saleOrderId && o.status === "PAID")) return;
    } catch { /* 继续重试 */ }
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
      if (!isWechatBrowser()) { toast.add({ title: t("messages.coupon.notInWechat"), color: "warning" }); return; }
      const res = await createWechatCouponPayment(order.id, "JSAPI");
      if (!res?.pay?.paySign) { toast.add({ title: t("messages.coupon.noOpenid"), color: "warning" }); return; }
      try { await invokeWechatPay(res.pay); } catch (e) {
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

async function closePaySheet() {
  const order = pendingOrder.value;
  paySheetOpen.value = false;
  pendingOrder.value = null;
  if (order) { try { await cancelCouponSaleOrder(order.id); } catch { /* 忽略 */ } }
}

// ── 积分兑换 ──
const exchangingId = ref<string | null>(null);
async function exchange(c: Record<string, any>) {
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
</script>

<template>
  <div class="mall-page mx-auto max-w-3xl px-3 pb-24 pt-3">
    <!-- 页头 -->
    <div class="mb-3 flex items-center justify-between">
      <div>
        <h1 class="text-lg font-bold">{{ t("messages.couponMall.heroTitle") }}</h1>
        <p class="text-xs text-muted">{{ t("messages.couponMall.heroSub") }}</p>
      </div>
    </div>

    <!-- 吸顶锚点 -->
    <nav v-if="floors.length" class="sticky top-0 z-10 -mx-3 mb-3 flex gap-2 bg-default/90 px-3 py-2 backdrop-blur">
      <UButton
        v-for="f in floors" :key="f.key" size="xs"
        :variant="activeFloor === f.key ? 'solid' : 'soft'"
        @click="goTo(f.key)"
      >{{ f.label }}</UButton>
    </nav>

    <UAlert v-if="loadError" color="error" variant="soft" :title="t('messages.couponMall.loadFailed')">
      <UButton size="xs" variant="link" @click="load">{{ t("messages.couponMall.retry") }}</UButton>
    </UAlert>
    <UCard v-else-if="!loading && !floors.length" class="text-center text-muted">
      {{ t("messages.couponMall.empty") }}
    </UCard>

    <USkeleton v-if="loading" class="mb-3 h-24" />

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
          :bundle="b" :buying="buyingId === b.id"
          @buy="startBuy(b, 'bundle')"
          @detail="openDetail(b, b.items || [])"
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

    <CouponMallDetailSheet
      :open="!!sheetTarget"
      :tpl="sheetTarget"
      :bundle-items="sheetBundleItems"
      @close="sheetTarget = null"
      @buy="buyFromSheet"
    />

    <CouponPaySheet
      v-model:open="paySheetOpen"
      :name="buyName"
      :amount="buyAmount"
      :paying="paying"
      v-model:mode="payMode"
      @confirm="confirmPay"
      @close="closePaySheet"
    />
  </div>
</template>
```

- [ ] **Step 2: 核对 PaySheet props**

对照 `components/coupon/PaySheet.vue` L7-18 的 props/emits（`name/amount/paying`、`confirm/close`、mode 的绑定方式）。若 PaySheet 用 `open` prop 而非 `v-model:open`、mode 不受控，按实际签名调整上页 `<CouponPaySheet>` 用法。

- [ ] **Step 3: 构建 + 本地预览验证**

Run（cwd=`d:\zhao\nshop`）: `npm run dev` 启动后浏览器访问 `http://localhost:3000/coupon-mall`
Expected: 页面渲染；有可售券时显示楼层；售罄券置灰。验证后停 dev。

- [ ] **Step 4: Commit**

```bash
git -C d:\zhao\nshop add layers/base/app/pages/coupon-mall/index.vue
git -C d:\zhao\nshop commit -m "feat(coupon-mall): 券商城独立页（楼层导购+支付接线）"
```

---

## Task 8: nshop 入口（我的页菜单 + 券页推广条）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\account\AccountMenu.vue`（L76-81 coupons 项后）
- Modify: `d:\zhao\nshop\layers\base\app\pages\coupon\index.vue`（`<CouponSaleList` 与 `<CouponPointsList` 上方）

- [ ] **Step 1: AccountMenu 加菜单项**

在 L76-81 的 coupons 项后插入：

```ts
{
  label: t("messages.couponMall.navTitle"),
  icon: "i-lucide-store",
  to: localePath("/coupon-mall"),
  class: "items-center",
},
```

- [ ] **Step 2: 券页推广条**

在 `pages/coupon/index.vue` 中定位 `<CouponSaleList`（grep），在其外层容器顶部插入：

```html
<NuxtLink :to="localePath('/coupon-mall')" class="mall-promo">
  {{ t("messages.couponMall.promoToMall") }}
</NuxtLink>
```

样式（加到该页 style 块）：

```css
.mall-promo { display: flex; align-items: center; justify-content: flex-end; padding: 4px 2px 8px; font-size: 12px; color: var(--ui-primary); }
```

- [ ] **Step 3: 构建验证 + Commit**

Run: `npm run build 2>&1 | Select-Object -Last 5`

```bash
git -C d:\zhao\nshop add layers/base/app/components/account/AccountMenu.vue layers/base/app/pages/coupon/index.vue
git -C d:\zhao\nshop commit -m "feat(coupon-mall): 我的页菜单与券页推广条入口"
```

---

## Task 9: vshop 详情解析工具与 i18n

**Files:**
- Create: `d:\zhao\vshop\src\utils\coupon-detail.ts`
- Test: `d:\zhao\vshop\src\utils\__tests__\coupon-detail.spec.ts`
- Modify: `d:\zhao\vshop\src\i18n\locales\zh-CN.json`、`zh-TW.json`、`en.json`、`ko.json`、`ja.json`

- [ ] **Step 1: 失败测试**

```ts
// d:\zhao\vshop\src\utils\__tests__\coupon-detail.spec.ts
import { describe, expect, it } from 'vitest';
import { hasDetail, parseDetailParagraphs } from '../coupon-detail';

describe('hasDetail', () => {
  it('有内容 true / 空白与缺省 false', () => {
    expect(hasDetail({ 'zh-CN': '介绍' }, 'zh-CN')).toBe(true);
    expect(hasDetail({ 'zh-CN': ' ' }, 'zh-CN')).toBe(false);
    expect(hasDetail(null, 'zh-CN')).toBe(false);
  });
});
describe('parseDetailParagraphs', () => {
  it('图文分段 + 非法标记回退', () => {
    expect(parseDetailParagraphs('行一\n![图](https://a.com/1.png)\n![图]()')).toEqual([
      { type: 'text', content: '行一' },
      { type: 'image', content: 'https://a.com/1.png' },
      { type: 'text', content: '![图]()' },
    ]);
  });
});
```

- [ ] **Step 2: 运行失败**

Run（cwd=`d:\zhao\vshop`）: `npm test -- coupon-detail`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// d:\zhao\vshop\src\utils\coupon-detail.ts
/** 券详情图文分段（与 nshop utils/coupon-mall.ts 同规则：整行 ![图](url) 为图片段） */
export interface DetailParagraph { type: 'text' | 'image'; content: string }
const IMG_LINE_RE = /^!\[[^\]]*\]\(([^)]+)\)$/;

export function parseDetailParagraphs(text: string): DetailParagraph[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map<DetailParagraph>((line) => {
      const m = IMG_LINE_RE.exec(line);
      return m && m[1] ? { type: 'image', content: m[1] } : { type: 'text', content: line };
    });
}

export function hasDetail(description: unknown, locale: string): boolean {
  if (!description) return false;
  const map = description as Record<string, string>;
  const text = map[locale] || Object.values(map)[0] || '';
  return text.trim().length > 0;
}
```

- [ ] **Step 4: 通过 + i18n 词条**

Run: `npm test -- coupon-detail` → PASS

在 5 个语言 json 的 `couponMall` 命名空间（已存在）追加：

```json
"mallHeroSub": "好券低至折扣价，积分也能换",
"floorSale": "热销单券", "floorBundle": "超值券包", "floorPoints": "积分兑换",
"buyNow": "立即抢购", "soldOut": "已抢罄", "claimedProgress": "已抢 {p}%",
"viewDetail": "详情", "secIntro": "券介绍", "secScope": "适用范围", "secUsage": "使用信息",
"secNotice": "购买须知",
"noticeText": "券类虚拟商品，售出后不支持退款；未使用请联系客服处理；每单限用一张，下单自动抵扣，可与会员折扣叠加。",
"scopeAll": "全部商品", "scopeLimited": "指定范围可用",
"validDaysTip": "自购 {d} 天内有效", "perUserLimitTip": "每人限购 {n} 张",
"pointsPrice": "{p} 积分", "imageFail": "图片加载失败",
"empty": "暂无可售优惠券", "bundleCount": "共 {n} 张", "bundleSave": "立省"
```

zh-TW 用繁体、en 用英文、ko/ja 用对应译文（语义与 zh/en 一致，逐语言翻译写入）。

- [ ] **Step 5: Commit（vshop 仓库）**

```bash
git -C d:\zhao\vshop add src/utils/coupon-detail.ts src/utils/__tests__/coupon-detail.spec.ts src/i18n/locales
git -C d:\zhao\vshop commit -m "feat(coupon-mall): 详情解析工具与五语言词条"
```

---

## Task 10: vshop 购券/积分 Tab 版式对齐 + 详情弹层

**Files:**
- Create: `d:\zhao\vshop\src\pkg-promotion\components\CouponDetailSheet.vue`
- Modify: `d:\zhao\vshop\src\pkg-promotion\pages\coupon-mall.vue`

- [ ] **Step 1: 详情弹层组件（uni-app 版）**

```vue
<!-- d:\zhao\vshop\src\pkg-promotion\components\CouponDetailSheet.vue -->
<template>
  <view v-if="visible" class="cds-mask" @tap="$emit('close')">
    <view class="cds-sheet" @tap.stop>
      <view class="cds-head">
        <view class="cds-left">
          <text class="cds-amount">{{ tpl ? '¥' + tpl.discountValue : '' }}</text>
          <text class="cds-cond">{{ tpl && tpl.minSpend > 0 ? '满' + tpl.minSpend + '可用' : '无门槛' }}</text>
        </view>
        <view class="cds-info">
          <view class="cds-row"><text class="cds-name">{{ tpl && tpl.name }}</text></view>
          <text class="cds-price">{{ tpl ? '¥' + tpl.salePrice : '' }}</text>
        </view>
      </view>
      <template v-if="paragraphs.length">
        <text class="cds-sec">{{ $t('couponMall.secIntro') }}</text>
        <view class="cds-intro">
          <template v-for="(p, i) in paragraphs" :key="i">
            <text v-if="p.type === 'text'" class="cds-para">{{ p.content }}</text>
            <image v-else class="cds-img" mode="widthFix" :src="p.content" @error="imgFail = true" />
          </template>
        </view>
      </template>
      <text class="cds-sec">{{ $t('couponMall.secScope') }}</text>
      <view class="cds-chips"><text class="cds-pill">{{ (tpl && tpl.usageScene === 'IN_STORE') ? '到店' : '线上' }}</text></view>
      <view class="cds-notice">
        <text class="cds-notice-b">{{ $t('couponMall.secNotice') }}：</text>
        <text class="cds-notice-t">{{ $t('couponMall.noticeText') }}</text>
      </view>
      <view class="cds-cta">
        <text class="cds-big">{{ tpl ? '¥' + tpl.salePrice : '' }}</text>
        <button class="cds-buy" @tap="$emit('buy')">{{ $t('couponMall.buyNow') }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { parseDetailParagraphs } from '../../utils/coupon-detail';

const props = defineProps<{ visible: boolean; tpl: Record<string, any> | null }>();
defineEmits<{ (e: 'close'): void; (e: 'buy'): void }>();
const { locale } = useI18n();
const imgFail = ref(false);
watch(() => props.visible, () => { imgFail.value = false; });
const paragraphs = computed(() => {
  const desc = props.tpl?.description;
  const raw = desc && (desc[locale.value] || Object.values(desc)[0] || '');
  return raw ? parseDetailParagraphs(String(raw)) : [];
});
</script>

<style scoped>
.cds-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 999; display: flex; align-items: flex-end; }
.cds-sheet { width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 24rpx 32rpx 40rpx; max-height: 72vh; overflow-y: auto; }
.cds-head { display: flex; gap: 24rpx; }
.cds-left { min-width: 128rpx; display: flex; flex-direction: column; align-items: center; border-right: 2rpx dashed #e5e7eb; padding-right: 24rpx; }
.cds-amount { font-size: 44rpx; font-weight: 700; color: #16a34a; }
.cds-cond { font-size: 22rpx; color: #9ca3af; }
.cds-info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.cds-row { display: flex; justify-content: space-between; }
.cds-name { font-size: 32rpx; font-weight: 600; }
.cds-price { font-size: 28rpx; font-weight: 700; color: #16a34a; }
.cds-sec { display: block; font-size: 26rpx; font-weight: 600; margin: 24rpx 0 8rpx; border-left: 6rpx solid #16a34a; padding-left: 12rpx; }
.cds-intro { display: flex; flex-direction: column; gap: 12rpx; }
.cds-para { font-size: 26rpx; color: #6b7280; line-height: 1.6; }
.cds-img { width: 100%; border-radius: 16rpx; }
.cds-chips { display: flex; flex-wrap: wrap; gap: 8rpx; }
.cds-pill { font-size: 22rpx; border: 2rpx solid #e5e7eb; border-radius: 999rpx; padding: 4rpx 20rpx; }
.cds-notice { background: #f6f6f8; border-radius: 16rpx; padding: 16rpx 24rpx; margin-top: 24rpx; }
.cds-notice-b { font-size: 24rpx; font-weight: 600; }
.cds-notice-t { font-size: 24rpx; color: #6b7280; line-height: 1.6; }
.cds-cta { display: flex; justify-content: space-between; align-items: center; margin-top: 24rpx; }
.cds-big { font-size: 36rpx; font-weight: 700; color: #16a34a; }
.cds-buy { background: #16a34a; color: #fff; font-size: 28rpx; padding: 16rpx 64rpx; border-radius: 999rpx; line-height: 1.4; }
</style>
```

- [ ] **Step 2: coupon-mall.vue 接线**

修改 `src/pkg-promotion/pages/coupon-mall.vue`：

1. script 导入并加状态：

```ts
import CouponDetailSheet from '../components/CouponDetailSheet.vue';
import { hasDetail } from '../../utils/coupon-detail';

const detailVisible = ref(false);
const detailTpl = ref<Record<string, any> | null>(null);
function openDetail(tpl: Record<string, any>) {
  detailTpl.value = tpl;
  detailVisible.value = true;
}
function buyFromDetail() {
  const tpl = detailTpl.value;
  detailVisible.value = false;
  if (tpl) startBuy({ id: tpl.id, name: tpl.name, amount: tpl.salePrice, kind: 'template' });
}
```

2. 「购券」tab 模板（L52-123 区段）单券卡片改造：卡片 `@tap="openDetail(t)"`；按钮文案 `buyFor` 改为售罄时 `soldOut`；在卡片内加进度条（已有 claimedCount/totalCount 数据）：

```html
<view v-if="t.totalCount > 0" class="track"><view class="fill" :style="{ width: Math.min(100, Math.round((t.claimedCount / t.totalCount) * 100)) + '%' }" /></view>
<text class="meta">{{ t.totalCount > 0 ? $t('couponMall.claimedProgress', { p: Math.min(100, Math.round((t.claimedCount / t.totalCount) * 100)) }) : '' }}</text>
<button class="buy" :disabled="t.claimable === false || (t.totalCount > 0 && t.claimedCount >= t.totalCount)">
  {{ (t.claimable === false || (t.totalCount > 0 && t.claimedCount >= t.totalCount)) ? $t('couponMall.soldOut') : $t('couponMall.buyNow') }}
</button>
```

3. 页面底部挂载弹层：

```html
<CouponDetailSheet :visible="detailVisible" :tpl="detailTpl" @close="detailVisible = false" @buy="buyFromDetail" />
```

4. 积分 tab 卡片价格文案改用 `$t('couponMall.pointsPrice', { p: t.pointsPrice })`（字段名对照该页现有积分渲染逻辑，若已有则保留）。

- [ ] **Step 3: 构建 + Commit**

Run（cwd=`d:\zhao\vshop`）: `npm run build:h5 2>&1 | Select-Object -Last 5`
Expected: 构建成功

```bash
git -C d:\zhao\vshop add src/pkg-promotion/components/CouponDetailSheet.vue src/pkg-promotion/pages/coupon-mall.vue
git -C d:\zhao\vshop commit -m "feat(coupon-mall): 购券卡片版式对齐（进度/售罄/详情弹层）"
```

---

## Task 11: vshop 入口（我的页 + 券页推广条）

**Files:**
- Modify: `d:\zhao\vshop\src\pages\profile\index.vue`（L29 附近）
- Modify: `d:\zhao\vshop\src\pkg-promotion\pages\coupon-mall.vue`（sale/points tab 顶部）

- [ ] **Step 1: profile 菜单项**

在 L29 coupons menu-item 后复制同结构：

```html
<view class="menu-item" @click="navTo('/pkg-promotion/pages/coupon-mall')">
  <text class="mi-icon">🎟️</text>
  <text class="mi-label">{{ $t('nav.couponMall') }}</text>
</view>
```

（图标/文案结构对照 L29 现有项的实际写法微调，保持一致。）

- [ ] **Step 2: 券页推广条**

coupon-mall.vue「购券」与「积分」tab 容器顶部加：

```html
<view class="mall-promo" @tap="switchTab('sale')">{{ $t('couponMall.promoToMall') }}</view>
```

vshop 的券商城页本身就是 mall，此推广条放 `pkg-promotion/pages/coupons.vue`（领券中心页）顶部跳转券商城：

```html
<view class="mall-promo" @tap="navToMall">{{ $t('couponMall.promoToMall') }}</view>
```

```ts
function navToMall() { uni.navigateTo({ url: '/pkg-promotion/pages/coupon-mall' }); }
```

（若 coupons.vue 存在对应容器，两处都加；以 grep `pkg-promotion/pages/coupons` 结果为准。）

- [ ] **Step 3: 构建 + Commit**

Run: `npm run build:h5 2>&1 | Select-Object -Last 5`

```bash
git -C d:\zhao\vshop add src/pages/profile/index.vue src/pkg-promotion/pages/coupons.vue
git -C d:\zhao\vshop commit -m "feat(coupon-mall): 我的页与领券中心入口"
```

---

## Task 12: web-admin 券详情编辑（图文混排 + 有详情标记）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\coupon\edit\index.vue`（L116-123 descZh/descEn 区段）
- Modify: `d:\zhao\vshop\web-admin\src\pages\coupon\index.vue`（列表行）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`、`en.json`

- [ ] **Step 1: 编辑页「插入图片」**

在 descZh textarea（L118）下方加（descEn 同构，函数名 `onInsertImgEn`）：

```html
<view class="img-row">
  <MediaPicker :max="1" media-type="image" :value="descImgIdsZh" @change="onInsertImgZh" />
  <text class="hint-inline">{{ $t('couponEdit.insertImageHint') }}</text>
</view>
```

```ts
import MediaPicker from '../../../components/MediaPicker.vue';
import { fetchAssets } from '../../../api/media'; // 对照 shop-info/index.vue L224-232 的实际 import 路径

const descImgIdsZh = ref<string[]>([]);
const descImgIdsEn = ref<string[]>([]);
async function insertMarker(formKey: 'descZh' | 'descEn', ids: string[], idsRef: Ref<string[]>) {
  idsRef.value = ids;
  if (!ids.length) return;
  try {
    const r = await fetchAssets(1, 0, undefined, ids);
    const url = r.items[0]?.preview;
    if (url) form.value[formKey] = `${form.value[formKey] || ''}\n![图](${url})`.trim();
  } catch { /* 选择器侧错误自行提示，插入失败静默 */ }
}
const onInsertImgZh = (ids: string[]) => insertMarker('descZh', ids, descImgIdsZh);
const onInsertImgEn = (ids: string[]) => insertMarker('descEn', ids, descImgIdsEn);
```

```css
.img-row { display: flex; align-items: center; gap: 12px; margin: 8px 0 16px; }
```

- [ ] **Step 2: 列表「有详情」标记**

在 `src/pages/coupon/index.vue` 列表行找到模板名渲染处，旁加：

```html
<text v-if="hasDescription(row)" class="tag-detail">{{ $t('couponEdit.hasDetail') }}</text>
```

```ts
function hasDescription(row: Record<string, any>): boolean {
  const d = row.description;
  if (!d) return false;
  return Object.values(d as Record<string, string>).some((v) => v && String(v).trim().length > 0);
}
```

若列表查询 GraphQL 未含 `description`，在该列表查询字段串中补 `description`。

- [ ] **Step 3: i18n 词条**

`src/locale/zh-Hans.json` 的 `couponEdit` 命名空间：

```json
"insertImageHint": "选图后在介绍末尾插入（支持多张，逐张插入）",
"hasDetail": "有详情"
```

`en.json`：`"insertImageHint": "Pick an image to append to the detail (repeatable)"`, `"hasDetail": "Has detail"`。

- [ ] **Step 4: 构建验证 + Commit**

Run（cwd=`d:\zhao\vshop\web-admin`）: `npm run build 2>&1 | Select-Object -Last 5`

```bash
git -C d:\zhao\vshop\web-admin add src/pages/coupon/edit/index.vue src/pages/coupon/index.vue src/locale
git -C d:\zhao\vshop\web-admin commit -m "feat(coupon): 券详情编辑支持图库插图与有详情标记"
```

---

## Task 13: e2e 回归 + 手机截图 + 手册 + 部署

**Files:**
- Modify: `d:\zhao\docs\manual\` 操作手册（券商城章节，含截图）
- Deploy: nshop（`scripts/deploy.mjs`）、vshop H5（构建产物按既有部署流程）、web-admin（`scripts/deploy.mjs`）

- [ ] **Step 1: e2e 四态回归（nshop + vshop 各一）**

用 webapp-testing/Playwright 移动视口 390×844 dpr=2 验证：① 匿名浏览（可看楼层，购买引导登录）② 登录购买成功 ③ 售罄态置灰 ④ 无详情券不显示入口、有详情券弹层图文正常。记录结果。

- [ ] **Step 2: 手机截图补充操作手册**

截图：券商城首页（楼层）、详情弹层（图文混排）、售罄态、入口三处。存 `d:\zhao\docs\manual\shots\`，手册新增「券商城」章节（入口、购买/兑换流程、详情说明、装修配置加首页宫格项的说明：nav 区块 items 添加 `{label: 券商城, link: /coupon-mall}`）。

- [ ] **Step 3: 一气呵成收口**

本地构建 → 提交剩余变更 → 推送各仓库 → 部署 nshop/vshop/web-admin → 线上验证 `/t2/coupon-mall` 与默认商城。

```bash
git -C d:\zhao\nshop push
git -C d:\zhao\vshop push
git -C d:\zhao\vshop\web-admin push 2>$null
git -C d:\zhao add docs/manual
git -C d:\zhao commit -m "docs: 券商城操作手册与手机截图"
git -C d:\zhao push
```

---

## Self-Review 记录

1. **Spec 覆盖**：§3 信息架构（Task 7/10/11）、§4 版式 A（Task 7）、§5 组件（Task 3-6）、§6 详情弹层+图文混排（Task 1/6/9/10）、§7 后台（Task 12）、§8 数据流（零后端改动，已核实字段）、§9 入口（Task 8/11；首页宫格两端为装修配置，零代码，手册说明）、§10 i18n（Task 2/9）、§11 边界（Task 1 测试 + Task 6/7 组件处理）、§12 测试交付（Task 13）、§13 YAGNI 未引入富文本。✓ 无缺口。
2. **占位符扫描**：Task 4/5/6 Step 0 与 Task 7 Step 2、Task 11 Step 1/2 为「核实并按实际签名调整」步骤，均给出了确切核对对象（文件+行号）与默认代码，非 TBD。✓
3. **类型一致性**：`saleProgress/hasDetail/parseDetailParagraphs/detailAssetUrl` 在 Task 1 定义、Task 3-7 引用一致；vshop 侧 `hasDetail/parseDetailParagraphs` 独立实现，命名与规则一致。✓
