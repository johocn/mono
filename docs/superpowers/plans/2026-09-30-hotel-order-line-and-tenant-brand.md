# 酒店订单行（晚数即数量·逐晚价）与租户页头品牌去重 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让酒店房型订单行以「晚数 = 数量、订单行金额 = 逐晚价格之和」落库并在购物车/结算页/订单页按中国本地习惯呈现；同时消除租户页头重复且变形的品牌文本。

**Architecture:** 后端 cjk-plugin 新增 OrderLine customFields（入住/离店/晚数）+ 自定义 `OrderItemPriceCalculationStrategy`（按 `hotelRoomConfig` 逐晚计价），并把逐晚明细随 `orderBoxes` 下发给前端；前端 nshop 在下单时传日期与晚数、在酒店订单行走独立渲染分支。普通商品全链路走默认策略与原有渲染，零行为变化。

**Tech Stack:** Vendure 3.6.4 + cjk-plugin（TypeScript、vitest、GraphQL SDL 内联扩展）、Nuxt 4 + Vue 3 + Pinia + nuxt-graphql-client + @nuxtjs/i18n（nshop）。

**设计依据：** [2026-09-30-hotel-order-line-and-tenant-brand-design.md](../specs/2026-09-30-hotel-order-line-and-tenant-brand-design.md)

**关键路径**
- 后端仓库：`d:\zhao\vendure`
- 前端仓库：`d:\zhao\nshop`

**通用命令**
- 后端单测（在 `d:\zhao\vendure\packages\cjk-plugin`）：`npx vitest --config vitest.config.mts --run src/hotel/hotel-nightly-pricing.spec.ts`
- 后端类型检查：`npm run build`（在 `d:\zhao\vendure\packages\cjk-plugin`）
- 前端类型检查（在 `d:\zhao\nshop`）：`npm run typecheck`
- 前端单测（在 `d:\zhao\nshop`）：`npm test`

---

### Task 1: 后端 — 酒店逐晚计价纯函数

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-nightly-pricing.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-nightly-pricing.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/hotel/hotel-nightly-pricing.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
    buildHotelLineInfo,
    calcNightlyPricing,
    parseHotelRoomConfig,
} from './hotel-nightly-pricing';

const cfg = {
    basePriceCent: 88000,
    priceCalendar: [{ type: 'holiday' as const, priceCent: 100000, dates: ['2026-02-14'] }],
    minNights: 1,
    maxNights: 30,
};

describe('parseHotelRoomConfig', () => {
    it('合法 JSON 字符串解析为对象', () => {
        expect(parseHotelRoomConfig(JSON.stringify(cfg))?.basePriceCent).toBe(88000);
    });
    it('坏 JSON / 非字符串 / 缺 basePriceCent 一律 null', () => {
        expect(parseHotelRoomConfig('{oops')).toBeNull();
        expect(parseHotelRoomConfig(null)).toBeNull();
        expect(parseHotelRoomConfig(JSON.stringify({ priceCalendar: [] }))).toBeNull();
    });
});

describe('calcNightlyPricing', () => {
    it('节假日 1000 + 周末 880，2 晚合计 1880', () => {
        const r = calcNightlyPricing(cfg, '2026-02-14', '2026-02-16');
        expect(r?.nights.map(n => [n.date, n.priceCent, n.type])).toEqual([
            ['2026-02-14', 100000, 'holiday'],
            ['2026-02-15', 88000, 'weekend'],
        ]);
        expect(r?.stayTotalCent).toBe(188000);
    });
    it('连住折扣取满足 minNights 且门槛最高的一条', () => {
        const r = calcNightlyPricing(
            { ...cfg, longStayDiscount: [{ minNights: 2, rate: 0.9 }, { minNights: 5, rate: 0.8 }] },
            '2026-02-14', '2026-02-16',
        );
        expect(r?.stayTotalCent).toBe(169200); // 188000 * 0.9
    });
    it('离店早于/等于入住、缺日期一律 null', () => {
        expect(calcNightlyPricing(cfg, '2026-02-16', '2026-02-16')).toBeNull();
        expect(calcNightlyPricing(cfg, '', '2026-02-16')).toBeNull();
    });
    it('cfg 为 null 时 null', () => {
        expect(calcNightlyPricing(null, '2026-02-14', '2026-02-16')).toBeNull();
    });
});

describe('buildHotelLineInfo', () => {
    it('非酒店行：isHotel=false 且其余字段为 null', () => {
        expect(buildHotelLineInfo({}, undefined)).toEqual({
            isHotel: false, hotelCheckIn: null, hotelCheckOut: null,
            hotelNights: null, hotelNightly: null,
        });
    });
    it('酒店行：回填日期/晚数/逐晚明细', () => {
        const info = buildHotelLineInfo(
            { hotelCheckIn: '2026-02-14', hotelCheckOut: '2026-02-16', hotelNights: 2 },
            JSON.stringify(cfg),
        );
        expect(info.isHotel).toBe(true);
        expect(info.hotelNights).toBe(2);
        expect(info.hotelNightly?.length).toBe(2);
    });
    it('有日期但配置坏 JSON：仍标 isHotel（前端要隐藏步进器），明细为 null', () => {
        const info = buildHotelLineInfo({ hotelCheckIn: '2026-02-14', hotelCheckOut: '2026-02-16' }, '{oops');
        expect(info.isHotel).toBe(true);
        expect(info.hotelNights).toBe(2);
        expect(info.hotelNightly).toBeNull();
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-nightly-pricing.spec.ts`
Expected: FAIL — `Failed to resolve import "./hotel-nightly-pricing"`

- [ ] **Step 3: 实现纯函数**

创建 `src/hotel/hotel-nightly-pricing.ts`：

```ts
// 酒店逐晚计价纯函数（与 nshop app/utils/hotel-pricing.ts 同规则；无副作用、坏数据返回 null）
import { dayTypeFor, HotelConfig, PriceSegmentType } from './hotel-config';

export interface NightPriceRow {
    date: string;
    priceCent: number;
    type: PriceSegmentType;
}

export interface NightlyPricingResult {
    nights: NightPriceRow[];
    stayTotalCent: number;
}

export interface HotelLineInfo {
    isHotel: boolean;
    hotelCheckIn: string | null;
    hotelCheckOut: string | null;
    hotelNights: number | null;
    hotelNightly: NightPriceRow[] | null;
}

/** hotelRoomConfig 存的是 JSON 字符串；坏 JSON / 缺 basePriceCent 一律 null（不抛异常） */
export function parseHotelRoomConfig(raw: unknown): HotelConfig | null {
    if (raw == null) return null;
    let obj: unknown = raw;
    if (typeof raw === 'string') {
        try {
            obj = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    const cfg = obj as HotelConfig | null;
    if (!cfg || typeof cfg !== 'object') return null;
    if (typeof cfg.basePriceCent !== 'number' || cfg.basePriceCent < 0) return null;
    return cfg;
}

function toDateOnly(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** 晚数 = 离店 − 入住（入住当日计第 1 晚）；判定优先级 custom > holiday > weekend > weekday */
export function calcNightlyPricing(
    cfg: HotelConfig | null | undefined,
    checkIn: string,
    checkOut: string,
): NightlyPricingResult | null {
    if (!cfg || typeof cfg.basePriceCent !== 'number') return null;
    const inD = new Date(`${checkIn}T00:00:00`);
    const outD = new Date(`${checkOut}T00:00:00`);
    if (Number.isNaN(inD.getTime()) || Number.isNaN(outD.getTime())) return null;
    const nights = Math.round((outD.getTime() - inD.getTime()) / 86400000);
    if (nights < 1) return null;

    const segments = Array.isArray(cfg.priceCalendar) ? cfg.priceCalendar : [];
    const rows: NightPriceRow[] = [];
    let baseTotal = 0;
    for (let i = 0; i < nights; i++) {
        const d = new Date(inD.getTime() + i * 86400000);
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const type = dayTypeFor(date, segments);
        const seg = segments.find(s => s.type === type && s.dates?.includes(date))
            ?? segments.find(s => s.type === type);
        const price = seg
            ? (seg.priceCent != null ? seg.priceCent : Math.round(cfg.basePriceCent * (seg.rate ?? 1)))
            : cfg.basePriceCent;
        rows.push({ date, priceCent: price, type });
        baseTotal += price;
    }

    const discounts = (cfg.longStayDiscount ?? [])
        .filter(x => nights >= x.minNights)
        .sort((a, b) => b.minNights - a.minNights);
    const rate = discounts.length ? discounts[0].rate : 1;
    return { nights: rows, stayTotalCent: Math.round(baseTotal * rate) };
}

/** orderBoxes 行映射用：非酒店行返回全 null；酒店行回填日期/晚数，明细可因坏配置为 null */
export function buildHotelLineInfo(
    customFields: Record<string, any> | null | undefined,
    hotelRoomConfigRaw: unknown,
): HotelLineInfo {
    const cf = customFields ?? {};
    const checkIn = toDateOnly(cf.hotelCheckIn);
    const checkOut = toDateOnly(cf.hotelCheckOut);
    if (!checkIn || !checkOut) {
        return { isHotel: false, hotelCheckIn: null, hotelCheckOut: null, hotelNights: null, hotelNightly: null };
    }
    const nights = Math.round(
        (new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) / 86400000,
    );
    const pricing = calcNightlyPricing(parseHotelRoomConfig(hotelRoomConfigRaw), checkIn, checkOut);
    return {
        isHotel: true,
        hotelCheckIn: checkIn,
        hotelCheckOut: checkOut,
        hotelNights: nights > 0 ? nights : null,
        hotelNightly: pricing?.nights ?? null,
    };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-nightly-pricing.spec.ts`
Expected: PASS（3 个 describe 全绿）

- [ ] **Step 5: 提交**

```bash
git add packages/cjk-plugin/src/hotel/hotel-nightly-pricing.ts packages/cjk-plugin/src/hotel/hotel-nightly-pricing.spec.ts
git commit -m "feat(hotel): 新增逐晚计价纯函数与订单行酒店信息映射"
```

---

### Task 2: 后端 — OrderLine 酒店 customFields 声明与注册

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-order-line-custom-fields.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-order-line-custom-fields.spec.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（import 区 ~L104、configuration 内 ProductVariant 注册后 ~L2394）

- [ ] **Step 1: 写失败测试**

创建 `src/hotel/hotel-order-line-custom-fields.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { hotelOrderLineCustomFields } from './hotel-order-line-custom-fields';

describe('hotelOrderLineCustomFields', () => {
    it('声明 3 个 OrderLine 字段且 public', () => {
        const fields = hotelOrderLineCustomFields.OrderLine!;
        expect(fields.map(f => f.name).sort()).toEqual(['hotelCheckIn', 'hotelCheckOut', 'hotelNights']);
        expect(fields.every(f => f.public === true && f.nullable === true)).toBe(true);
    });
    it('日期为 string、晚数为 int', () => {
        const byName = Object.fromEntries(hotelOrderLineCustomFields.OrderLine!.map(f => [f.name, f.type]));
        expect(byName.hotelCheckIn).toBe('string');
        expect(byName.hotelCheckOut).toBe('string');
        expect(byName.hotelNights).toBe('int');
    });
    it('字段带中英 label', () => {
        const f = hotelOrderLineCustomFields.OrderLine!.find(x => x.name === 'hotelCheckIn')!;
        const langs = (f.label ?? []).map(l => l.languageCode);
        expect(langs).toContain('zh_Hans');
        expect(langs).toContain('en');
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-order-line-custom-fields.spec.ts`
Expected: FAIL — `Failed to resolve import "./hotel-order-line-custom-fields"`

- [ ] **Step 3: 实现字段声明**

创建 `src/hotel/hotel-order-line-custom-fields.ts`：

```ts
import { CustomFields, LanguageCode } from '@vendure/core';

// 酒店订单行字段：入住/离店日期（date-only，避免时区漂移）+ 晚数冗余。
// 声明后 Vendure 会自动给 addItemToOrder / adjustOrderLine 注入 customFields 参数。
export const hotelOrderLineCustomFields: CustomFields = {
    OrderLine: [
        {
            name: 'hotelCheckIn',
            type: 'string',
            public: true,
            nullable: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '入住日期' },
                { languageCode: LanguageCode.en, value: 'Check-in date' },
            ],
        },
        {
            name: 'hotelCheckOut',
            type: 'string',
            public: true,
            nullable: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '离店日期' },
                { languageCode: LanguageCode.en, value: 'Check-out date' },
            ],
        },
        {
            name: 'hotelNights',
            type: 'int',
            public: true,
            nullable: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '入住晚数' },
                { languageCode: LanguageCode.en, value: 'Nights' },
            ],
        },
    ],
};
```

- [ ] **Step 4: 运行测试确认通过**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-order-line-custom-fields.spec.ts`
Expected: PASS

- [ ] **Step 5: 在 plugin.ts 注册**

5a. 在 `src/plugin.ts` L104 那行 `import { hotelRoomCustomFields } from './hotel/hotel-custom-fields';` 下面新增一行：

```ts
import { hotelOrderLineCustomFields } from './hotel/hotel-order-line-custom-fields';
```

5b. 在 `configuration: config => { ... }` 内、「注册 ProductVariant customFields（hotelRoomConfig）」块（结束于 L2394 的 `}`）之后，插入：

```ts
        // 注册 OrderLine customFields（酒店入住日期/晚数）—— 去重防止重复注册
        {
            const existingHotelOlFields = (config.customFields?.OrderLine || []).map(f => f.name);
            const newHotelOlFields = (hotelOrderLineCustomFields.OrderLine || []).filter(
                f => !existingHotelOlFields.includes(f.name),
            );
            if (newHotelOlFields.length > 0) {
                config.customFields = {
                    ...config.customFields,
                    OrderLine: [...(config.customFields?.OrderLine || []), ...newHotelOlFields],
                };
            }
        }
```

- [ ] **Step 6: 类型检查并提交**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：`npm run build`
Expected: 编译通过、无 TS 报错

```bash
git add packages/cjk-plugin/src/hotel/hotel-order-line-custom-fields.ts packages/cjk-plugin/src/hotel/hotel-order-line-custom-fields.spec.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(hotel): 注册 OrderLine 入住日期与晚数 customFields"
```

---

### Task 3: 后端 — 酒店订单行单价计价策略

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-order-item-price-strategy.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-order-item-price-strategy.spec.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（import 区、configuration 内 `return config;` 之前 ~L2556）

- [ ] **Step 1: 写失败测试**

创建 `src/hotel/hotel-order-item-price-strategy.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { HotelOrderItemPriceCalculationStrategy } from './hotel-order-item-price-strategy';

const hotelCfg = {
    basePriceCent: 88000,
    priceCalendar: [{ type: 'holiday', priceCent: 100000, dates: ['2026-02-14'] }],
};

function variant(hotelRoomConfig?: string, listPrice = 88000) {
    return { listPrice, listPriceIncludesTax: true, customFields: { hotelRoomConfig } } as any;
}
const ctx = {} as any;
const order = {} as any;

describe('HotelOrderItemPriceCalculationStrategy', () => {
    it('酒店 2 晚 1880 → 均价 940（linePrice 恰为 1880）', async () => {
        const s = new HotelOrderItemPriceCalculationStrategy();
        const r = await s.calculateUnitPrice(
            ctx, variant(JSON.stringify(hotelCfg)),
            { hotelCheckIn: '2026-02-14', hotelCheckOut: '2026-02-16', hotelNights: 2 },
            order, 2,
        );
        expect(r).toEqual({ price: 94000, priceIncludesTax: true });
    });
    it('普通商品直通默认价', async () => {
        const s = new HotelOrderItemPriceCalculationStrategy();
        const r = await s.calculateUnitPrice(ctx, variant(undefined, 9900), {}, order, 1);
        expect(r).toEqual({ price: 9900, priceIncludesTax: true });
    });
    it('酒店变体缺日期 → 回退默认价（不猜测计价）', async () => {
        const s = new HotelOrderItemPriceCalculationStrategy();
        const r = await s.calculateUnitPrice(ctx, variant(JSON.stringify(hotelCfg)), {}, order, 1);
        expect(r).toEqual({ price: 88000, priceIncludesTax: true });
    });
    it('坏 JSON 配置 → 回退默认价', async () => {
        const s = new HotelOrderItemPriceCalculationStrategy();
        const r = await s.calculateUnitPrice(
            ctx, variant('{oops'), { hotelCheckIn: '2026-02-14', hotelCheckOut: '2026-02-16' }, order, 2,
        );
        expect(r).toEqual({ price: 88000, priceIncludesTax: true });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-order-item-price-strategy.spec.ts`
Expected: FAIL — `Failed to resolve import "./hotel-order-item-price-strategy"`

- [ ] **Step 3: 实现策略**

创建 `src/hotel/hotel-order-item-price-strategy.ts`：

```ts
import {
    Order,
    OrderItemPriceCalculationStrategy,
    PriceCalculationResult,
    ProductVariant,
    RequestContext,
    roundMoney,
} from '@vendure/core';
import { calcNightlyPricing, parseHotelRoomConfig } from './hotel-nightly-pricing';

/**
 * 酒店房型订单行单价策略：
 * - 非酒店变体 / 缺日期 / 坏配置 → 直通默认定价（productVariant.listPrice），普通商品零影响；
 * - 酒店变体 → 按 hotelRoomConfig + 入离日期逐晚计价，单价 = 住宿总价 ÷ 数量，
 *   因 OrderLine.linePrice = unitPrice × quantity，故行小计 ≈ 住宿总价（晚数=数量）。
 */
export class HotelOrderItemPriceCalculationStrategy implements OrderItemPriceCalculationStrategy {
    calculateUnitPrice(
        ctx: RequestContext,
        productVariant: ProductVariant,
        orderLineCustomFields: { [key: string]: any },
        order: Order,
        quantity: number,
    ): PriceCalculationResult {
        const fallback: PriceCalculationResult = {
            price: productVariant.listPrice,
            priceIncludesTax: productVariant.listPriceIncludesTax,
        };
        const cfg = parseHotelRoomConfig((productVariant as any).customFields?.hotelRoomConfig);
        if (!cfg) return fallback;

        const checkIn = orderLineCustomFields?.hotelCheckIn;
        const checkOut = orderLineCustomFields?.hotelCheckOut;
        if (typeof checkIn !== 'string' || typeof checkOut !== 'string') return fallback;

        const pricing = calcNightlyPricing(cfg, checkIn, checkOut);
        if (!pricing) return fallback;

        const denom = Number.isFinite(quantity) && quantity > 0 ? quantity : pricing.nights.length;
        return {
            price: roundMoney(pricing.stayTotalCent / denom),
            priceIncludesTax: productVariant.listPriceIncludesTax,
        };
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-order-item-price-strategy.spec.ts`
Expected: PASS（4 个用例全绿）

- [ ] **Step 5: 在 plugin.ts 注册策略**

5a. 在 `src/plugin.ts` 的 import 区（Task 2 新增行下面）追加：

```ts
import { HotelOrderItemPriceCalculationStrategy } from './hotel/hotel-order-item-price-strategy';
```

5b. 在 `configuration: config => { ... }` 内、`return config;`（L2556）**之前**插入：

```ts
        // 注册订单行单价策略：酒店房型按入离日期逐晚计价，其它变体直通默认价
        config.orderOptions = {
            ...(config.orderOptions ?? {}),
            orderItemPriceCalculationStrategy: new HotelOrderItemPriceCalculationStrategy(),
        } as any;
```

- [ ] **Step 6: 类型检查并提交**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：`npm run build`
Expected: 编译通过、无 TS 报错

```bash
git add packages/cjk-plugin/src/hotel/hotel-order-item-price-strategy.ts packages/cjk-plugin/src/hotel/hotel-order-item-price-strategy.spec.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(hotel): 酒店房型订单行按入离日期逐晚计价策略"
```

---

### Task 4: 后端 — orderBoxes 下发酒店行信息

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\order\order-box.service.ts`（`OrderBoxLine` 接口 L78-L93、行映射 L346-L376）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（shopApiExtensions 内 `type OrderBoxLine` L2068-L2078）

- [ ] **Step 1: 扩展 OrderBoxLine 接口**

在 `src/order/order-box.service.ts` 的 `OrderBoxLine` 接口末尾（`sku: string | null;` 之后、`}` 之前）追加：

```ts
    /** 是否酒店房型行（有入住/离店日期即 true） */
    isHotel: boolean;
    /** 入住日 YYYY-MM-DD（非酒店行为 null） */
    hotelCheckIn: string | null;
    /** 离店日 YYYY-MM-DD（非酒店行为 null） */
    hotelCheckOut: string | null;
    /** 晚数（非酒店行为 null） */
    hotelNights: number | null;
    /** 逐晚明细（非酒店行或坏配置为 null） */
    hotelNightly: Array<{ date: string; priceCent: number; type: string }> | null;
    /** 商品 slug，供前端「修改日期」跳回详情页（缺失可为 null） */
    productSlug: string | null;
```

- [ ] **Step 2: 在行映射中填充新字段**

在 `src/order/order-box.service.ts` 的 L346-L376 行映射内：

2a. 在文件顶部 import 区加入：

```ts
import { buildHotelLineInfo } from '../hotel/hotel-nightly-pricing';
```

2b. 在 `const feat = ...` 之后、`return { ... }` 之前插入：

```ts
                const variantCf = (variant?.customFields ?? {}) as Record<string, any>;
                const lineCf = ((barrel as any).customFields ?? {}) as Record<string, any>;
                const hotelInfo = buildHotelLineInfo(lineCf, variantCf.hotelRoomConfig);
                const productSlug = variant?.product?.slug ?? null;
```

2c. 在 `return { ... }` 对象中、`sku: variant?.sku ?? null,` 之后追加：

```ts
                    ...hotelInfo,
                    productSlug,
```

- [ ] **Step 3: 扩展 GraphQL SDL**

在 `src/plugin.ts` 的 `type OrderBoxLine { ... }`（L2068-L2078）内、`sku: String` 之后追加：

```graphql
                    isHotel: Boolean!
                    hotelCheckIn: String
                    hotelCheckOut: String
                    hotelNights: Int
                    hotelNightly: [HotelNightPrice!]
                    productSlug: String
```

并在同一个 gql 模板中、`type OrderBoxLine { ... }` 之后插入：

```graphql
                type HotelNightPrice {
                    date: String!
                    priceCent: Int!
                    type: String!
                }
```

- [ ] **Step 4: 类型检查并回归既有分箱测试**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npm run build`
Expected: 编译通过、无 TS 报错

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/order/order-box-aggregation.spec.ts`
Expected: PASS（既有断言不因新增字段而失败）

- [ ] **Step 5: 提交**

```bash
git add packages/cjk-plugin/src/order/order-box.service.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(hotel): orderBoxes 下发酒店行入离日期、晚数与逐晚明细"
```

---

### Task 5: 前端 — GraphQL 文档（mutation 参数 + fragment + orderBoxes 字段）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\order.gql`（`AddItemToOrder` L52-L67、`AdjustOrderLine` L80-L89、`GetOrderBoxes` L210-L220）
- Modify: `d:\zhao\nshop\layers\base\gql\fragments\order.gql`（`OrderBase.lines` L16-L33、`OrderDetail.lines` L79-L98）

- [ ] **Step 1: 改 AddItemToOrder 与 AdjustOrderLine**

在 `layers/base/gql/queries/order.gql` 中，把 `AddItemToOrder` 改为：

```graphql
mutation AddItemToOrder($variantId: ID!, $quantity: Int!, $customFields: OrderLineCustomFieldsInput) {
  addItemToOrder(productVariantId: $variantId, quantity: $quantity, customFields: $customFields) {
    __typename
    ...OrderBase
    ... on ErrorResult {
      errorCode
      message
    }
    ... on InsufficientStockError {
      quantityAvailable
      order {
        ...OrderBase
      }
    }
  }
}
```

并把 `AdjustOrderLine` 改为：

```graphql
mutation AdjustOrderLine($orderLineId: ID!, $quantity: Int!, $customFields: OrderLineCustomFieldsInput) {
  adjustOrderLine(orderLineId: $orderLineId, quantity: $quantity, customFields: $customFields) {
    __typename
    ...OrderBase
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
```

- [ ] **Step 2: 扩展 orderBoxes 行字段**

在 `layers/base/gql/queries/order.gql` 的 `GetOrderBoxes` 中，把 `lines { ... }` 块改为：

```graphql
    lines {
      orderLineId
      productVariantId
      productName
      unitPrice
      quantity
      lineTotal
      featureAssetSource
      variantName
      sku
      isHotel
      hotelCheckIn
      hotelCheckOut
      hotelNights
      hotelNightly {
        date
        priceCent
        type
      }
      productSlug
    }
```

- [ ] **Step 3: 两个 fragment 的 lines 补 customFields**

在 `layers/base/gql/fragments/order.gql` 中，`OrderBase` 的 `lines { ... }` 块末尾（`featuredAsset { id preview }` 之后）追加：

```graphql
    customFields {
      hotelCheckIn
      hotelCheckOut
      hotelNights
    }
```

并对 `OrderDetail` 的 `lines { ... }` 块做同样追加（内容完全相同）。

- [ ] **Step 4: 生成类型并校验**

Run（cwd `d:\zhao\nshop`）：`npx nuxi prepare`
Expected: 生成 `~~/.nuxt/gql/default` 且无 schema 校验报错

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错（此时新字段尚未被业务代码消费，应全绿）

- [ ] **Step 5: 提交**

```bash
git add layers/base/gql/queries/order.gql layers/base/gql/fragments/order.gql
git commit -m "feat(gql): 订单行 customFields 参数与酒店行字段"
```

---

### Task 6: 前端 — useOrderStore 透传订单行 customFields

**Files:**
- Modify: `d:\zhao\nshop\layers\base\stores\useOrderStore.ts`（`addItemToOrder` L44-L70、`adjustOrderLine` L96-L122）

- [ ] **Step 1: 改 addItemToOrder 签名与调用**

把 `layers/base/stores/useOrderStore.ts` 的 `addItemToOrder` 改为：

```ts
  async function addItemToOrder(
    variantId: string,
    quantity: number,
    customFields?: Record<string, unknown>,
  ): Promise<OrderStatus> {
    loading.value = true;
    error.value = null;

    try {
      const { addItemToOrder: result } = await GqlAddItemToOrder({
        variantId,
        quantity,
        customFields,
      });

      if (!result) return { status: "error", message: "No result" };
      const res = useOrderMutation(order, result);
      if (res.status === "error") error.value = res.message;
      return res;
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to add item to order";
        return { status: "error", message: error.value };
      }
      return { status: "error", message: "Failed to add item to order" };
    } finally {
      loading.value = false;
    }
  }
```

- [ ] **Step 2: 改 adjustOrderLine 签名与调用**

把 `layers/base/stores/useOrderStore.ts` 的 `adjustOrderLine` 改为：

```ts
  async function adjustOrderLine(
    orderLineId: string,
    quantity: number,
    customFields?: Record<string, unknown>,
  ): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { adjustOrderLine: result } = await GqlAdjustOrderLine({
        orderLineId,
        quantity,
        customFields,
      });

      if (result) {
        const res = useOrderMutation(order, result);
        if (res.status === "error") {
          error.value = res.message;
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        error.value = err.message || "Failed to adjust order line";
      }
    } finally {
      loading.value = false;
    }
  }
```

- [ ] **Step 3: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

- [ ] **Step 4: 提交**

```bash
git add layers/base/stores/useOrderStore.ts
git commit -m "feat(order): 订单行增减支持透传 customFields"
```

---

### Task 7: 前端 — useBuyActions 传日期与晚数

**Files:**
- Modify: `d:\zhao\nshop\layers/base\app\composables\useBuyActions.ts`（全文 67 行）
- Create: `d:\zhao\nshop\layers\base\app\composables\useHotelStay.ts`

- [ ] **Step 1: 新建酒店下单参数 composable**

创建 `layers/base/app/composables/useHotelStay.ts`：

```ts
// 酒店房型下单参数：把详情页选定的入离日期折算为数量(customFields)。
// 非酒店变体返回 null，调用方按普通商品流程处理。
export interface HotelOrderLineFields {
  hotelCheckIn: string;
  hotelCheckOut: string;
  hotelNights: number;
}

export function useHotelStay() {
  const productStore = useProductStore();

  const parseHotel = (raw: unknown) => {
    if (typeof raw !== "string") return null;
    try {
      return JSON.parse(raw) as { minNights?: number; maxNights?: number } | null;
    } catch {
      return null;
    }
  };

  /** 当前选中变体的酒店配置（非酒店返回 null） */
  const hotelConfig = computed(() => {
    const raw = (productStore.selectedVariant as any)?.customFields?.hotelRoomConfig;
    return parseHotel(raw);
  });

  const isHotelVariant = computed(() => hotelConfig.value !== null);

  /** 校验通过时返回下单参数；不通过返回 { error } */
  function resolveStay():
    | { ok: true; quantity: number; customFields: HotelOrderLineFields }
    | { ok: false; error: "selectDatesFirst" | "nightsOutOfRange" } {
    const cfg = hotelConfig.value!;
    const { checkIn, checkOut } = productStore.hotelDates ?? { checkIn: "", checkOut: "" };
    if (!checkIn || !checkOut) return { ok: false, error: "selectDatesFirst" };
    const nights = Math.round(
      (new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) / 86400000,
    );
    const min = cfg.minNights ?? 1;
    const max = cfg.maxNights ?? 30;
    if (!Number.isFinite(nights) || nights < min || nights > max) {
      return { ok: false, error: "nightsOutOfRange" };
    }
    return {
      ok: true,
      quantity: nights,
      customFields: { hotelCheckIn: checkIn, hotelCheckOut: checkOut, hotelNights: nights },
    };
  }

  return { hotelConfig, isHotelVariant, resolveStay };
}
```

- [ ] **Step 2: 接入 useBuyActions**

把 `layers/base/app/composables/useBuyActions.ts` 的 `<script setup>` 整体替换为：

```ts
import { storeToRefs } from "pinia";

export function useBuyActions() {
  const { t } = useI18n();
  const localePath = useTenantLocalePath();
  const toast = useToast();
  const orderStore = useOrderStore();
  const { loading } = storeToRefs(orderStore);
  const { addItemToOrder } = orderStore;
  const productStore = useProductStore();
  const { selectedVariant } = storeToRefs(productStore);
  const { isServiceable } = useCityService();
  const { isHotelVariant, hotelConfig, resolveStay } = useHotelStay();

  const canBuy = computed(() => {
    const v = selectedVariant.value;
    return !!v?.id && isServiceable(v);
  });

  /** 解析下单参数：酒店走日期→晚数，普通商品恒为 1 件 */
  function resolveLine():
    | { ok: true; quantity: number; customFields?: Record<string, unknown> }
    | { ok: false; message: string } {
    if (!isHotelVariant.value) return { ok: true, quantity: 1 };
    const stay = resolveStay();
    if (stay.ok) {
      return { ok: true, quantity: stay.quantity, customFields: stay.customFields };
    }
    if (stay.error === "selectDatesFirst") {
      return { ok: false, message: t("messages.hotel.selectDatesFirst") };
    }
    const cfg = hotelConfig.value ?? {};
    return {
      ok: false,
      message: t("messages.hotel.nightsOutOfRange", { min: cfg.minNights ?? 1, max: cfg.maxNights ?? 30 }),
    };
  }

  async function addToCartHandler() {
    const id = selectedVariant.value?.id;
    if (!id || !canBuy.value) return;
    const line = resolveLine();
    if (!line.ok) {
      toast.add({ title: t("messages.detail.addToCart"), description: line.message, color: "error" });
      return;
    }
    const res = await addItemToOrder(id, line.quantity, line.customFields);
    if (res.status === "error") {
      toast.add({
        title: t("messages.detail.addToCart"),
        description: res.message || t("messages.shop.addToCart"),
        color: "error",
      });
    } else if (res.status === "partial") {
      toast.add({
        title: t("messages.detail.addToCart"),
        description: t("messages.detail.stockShortage", { n: res.quantityAvailable ?? 0 }),
        color: "warning",
      });
    } else {
      toast.add({
        title: t("messages.detail.addToCart"),
        description: t("messages.detail.addedToCart"),
        color: "success",
      });
    }
  }

  async function buyNowHandler() {
    const id = selectedVariant.value?.id;
    if (!id || !canBuy.value) return;
    const line = resolveLine();
    if (!line.ok) {
      toast.add({ title: t("messages.detail.buyNow"), description: line.message, color: "error" });
      return;
    }
    const res = await addItemToOrder(id, line.quantity, line.customFields);
    if (res.status === "error") {
      toast.add({
        title: t("messages.detail.buyNow"),
        description: res.message || t("messages.detail.buyNowFailed"),
        color: "error",
      });
      return;
    }
    if (res.status === "partial") {
      toast.add({
        title: t("messages.detail.buyNow"),
        description: t("messages.detail.stockShortage", { n: res.quantityAvailable ?? 0 }),
        color: "warning",
      });
      return;
    }
    await navigateTo(localePath("/checkout"));
  }

  return { loading, canBuy, addToCartHandler, buyNowHandler };
}
```

- [ ] **Step 3: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错（`messages.hotel.*` 词条在 Task 11 补齐前会报 i18n key 类型错；若仓库未开启 i18n key 强类型则忽略）

- [ ] **Step 4: 提交**

```bash
git add layers/base/app/composables/useHotelStay.ts layers/base/app/composables/useBuyActions.ts
git commit -m "feat(hotel): 下单选日期折算晚数并传订单行日期字段"
```

---

### Task 8: 前端 — 详情页日期条支持 query 预填

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\ProductDetailDateBar.vue`（L9-L30）

- [ ] **Step 1: 读取 query 并作为初值**

把 `ProductDetailDateBar.vue` 的日期初始化段（L9-L19 的 `const today = ...` 到 `const checkOut = ref(...)`）替换为：

```ts
const route = useRoute();
const today = new Date();
const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minDate = toDateStr(new Date(today.getTime() + 86400000)); // 最早明天入住
const maxAdvance = computed(() => {
  const adv = hotel.value?.advanceDays ?? 30;
  const d = new Date(today.getTime() + adv * 86400000);
  return toDateStr(d);
});

// 「修改日期」从结算页跳回时带 ?checkIn=&checkOut=，以 query 预填（命中格式且不早于明天才采用）
const qIn = typeof route.query.checkIn === "string" ? route.query.checkIn : "";
const qOut = typeof route.query.checkOut === "string" ? route.query.checkOut : "";
const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= minDate;
const checkIn = ref(dateOk(qIn) ? qIn : minDate);
const checkOut = ref(dateOk(qOut) && dateOk(qIn) && qOut > qIn
  ? qOut
  : toDateStr(new Date(today.getTime() + 2 * 86400000)));
```

- [ ] **Step 2: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

- [ ] **Step 3: 提交**

```bash
git add layers/base/app/components/product-detail/ProductDetailDateBar.vue
git commit -m "feat(hotel): 日期条支持 query 预填以承接修改日期跳回"
```

---

### Task 9: 前端 — 结算页酒店行渲染

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\checkout\BoxLines.vue`（L59-L125）

- [ ] **Step 1: 增加酒店行分支与展开态**

把 `BoxLines.vue` 的 `<template>` 整体替换为：

```vue
<template>
  <li
    v-for="l in box.lines ?? []"
    :key="l.orderLineId"
    class="flex items-start gap-2 px-3 py-2 text-sm"
  >
    <input
      type="checkbox"
      :checked="sel.isLineChecked(box.boxKey, l.orderLineId)"
      class="mt-1 h-4 w-4 shrink-0 accent-primary-500"
      @change="sel.setLineChecked(box.boxKey, l.orderLineId, ($event.target as HTMLInputElement).checked)"
    />

    <img
      v-if="lineImage(l)"
      :src="lineImage(l)"
      :alt="l.productName"
      class="h-9 w-9 shrink-0 rounded-md object-cover"
      width="36"
      height="36"
      loading="lazy"
    />
    <span v-else class="h-9 w-9 shrink-0 rounded-md bg-neutral-100 dark:bg-neutral-800" />

    <div class="min-w-0 flex-1 leading-tight">
      <div class="truncate text-neutral-900 dark:text-neutral-100">{{ l.productName }}</div>
      <div
        v-if="l.variantName && l.variantName !== l.productName"
        class="truncate text-[11px] text-neutral-500 dark:text-neutral-400"
      >
        {{ l.variantName }}<span v-if="l.sku"> ｜ {{ l.sku }}</span>
      </div>
      <div v-else-if="l.sku" class="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
        {{ l.sku }}
      </div>

      <!-- 酒店房型：显示入离日期与晚数，不出单价与步进器 -->
      <template v-if="l.isHotel">
        <div class="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          {{ t("messages.hotel.dateRange", { in: l.hotelCheckIn, out: l.hotelCheckOut }) }}
        </div>
        <button
          v-if="l.hotelNightly?.length"
          type="button"
          class="mt-0.5 text-[11px] text-primary-600 dark:text-primary-400"
          @click="toggleDetail(l.orderLineId)"
        >
          {{ t("messages.hotel.nightlyDetail") }}
          {{ expanded[l.orderLineId] ? "▴" : "▾" }}
        </button>
      </template>
    </div>

    <template v-if="l.isHotel">
      <span class="mt-1 w-14 shrink-0 text-center text-neutral-600 dark:text-neutral-300">
        {{ t("messages.hotel.nights", { n: l.hotelNights ?? l.quantity }) }}
      </span>
      <div class="shrink-0 text-right">
        <div class="font-semibold text-neutral-900 dark:text-neutral-100">{{ fmt(l.lineTotal) }}</div>
        <div class="mt-0.5 flex justify-end gap-2 text-[11px]">
          <NuxtLink
            v-if="l.productSlug && l.hotelCheckIn && l.hotelCheckOut"
            :to="`${localePath(`/product/${l.productSlug}`)}?checkIn=${l.hotelCheckIn}&checkOut=${l.hotelCheckOut}`"
            class="text-primary-600 dark:text-primary-400"
          >{{ t("messages.hotel.changeDates") }}</NuxtLink>
          <button
            :disabled="orderLoading"
            class="text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            @click="removeLine(l)"
          >{{ t("messages.account.delete") }}</button>
        </div>
      </div>
    </template>

    <!-- 普通商品：保持原有单价 / 步进 / 小计 / 删除 -->
    <template v-else>
      <span class="mt-1 shrink-0 text-neutral-500 dark:text-neutral-400">{{ fmt(l.unitPrice) }}</span>

      <div class="mt-0.5 flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          :disabled="orderLoading"
          class="flex h-6 w-6 items-center justify-center rounded border border-neutral-200 text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="减少数量"
          @click="adjustQty(l, l.quantity - 1)"
        >−</button>
        <b class="w-7 shrink-0 text-center text-neutral-700 dark:text-neutral-200">{{ l.quantity }}</b>
        <button
          type="button"
          :disabled="orderLoading"
          class="flex h-6 w-6 items-center justify-center rounded border border-neutral-200 text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="增加数量"
          @click="adjustQty(l, l.quantity + 1)"
        >＋</button>
      </div>

      <span class="mt-1 w-14 shrink-0 text-right font-medium text-neutral-900 dark:text-neutral-100">
        {{ fmt(l.lineTotal) }}
      </span>

      <button
        :disabled="orderLoading"
        class="mt-1 shrink-0 text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        @click="removeLine(l)"
      >{{ t("messages.account.delete") }}</button>
    </template>

    <!-- 逐晚明细：横跨整行，仅在展开时出现 -->
    <div
      v-if="l.isHotel && expanded[l.orderLineId] && l.hotelNightly?.length"
      class="w-full basis-full rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800/50"
    >
      <div
        v-for="n in l.hotelNightly"
        :key="n.date"
        class="flex justify-between text-[11px] text-neutral-500 dark:text-neutral-400"
      >
        <span>
          {{ n.date }}
          <span v-if="n.type !== 'weekday'" class="ml-1 rounded bg-orange-50 px-1 text-orange-500 dark:bg-orange-900/30">
            {{ typeLabel(n.type) }}
          </span>
        </span>
        <span>{{ fmt(n.priceCent) }}</span>
      </div>
      <div class="mt-1 flex justify-between border-t border-neutral-200 pt-1 text-[11px] font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
        <span>{{ t("messages.hotel.stayTotal") }}</span>
        <span>{{ fmt(l.lineTotal) }}</span>
      </div>
    </div>
  </li>
</template>
```

- [ ] **Step 2: 补脚本（展开态、日类型标签、localePath）**

在 `BoxLines.vue` 的 `<script setup>` 中，把 `const fmt = (amount: number) => \`¥${(amount / 100).toFixed(2)}\`;` 保留，并在其上方追加：

```ts
const localePath = useTenantLocalePath();

/** 逐晚明细展开态（按订单行 id 记录，默认折叠） */
const expanded = reactive<Record<string, boolean>>({});
function toggleDetail(orderLineId: string) {
  expanded[orderLineId] = !expanded[orderLineId];
}

/** 日类型 → 本地化标签（复用详情页既有词条） */
const typeLabel = (ty: string): string =>
  ({
    weekday: t("messages.detail.tWeekday"),
    weekend: t("messages.detail.tWeekend"),
    holiday: t("messages.detail.tHoliday"),
    custom: t("messages.detail.tCustom"),
  } as Record<string, string>)[ty] ?? ty;
```

- [ ] **Step 3: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

- [ ] **Step 4: 提交**

```bash
git add layers/base/app/components/checkout/BoxLines.vue
git commit -m "feat(hotel): 结算页酒店行显示晚数、起止日期与可展开逐晚明细"
```

---

### Task 10: 前端 — 购物车酒店行渲染

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\cart\CartItem.vue`（L32-L116）

- [ ] **Step 1: 增加酒店判定与跳转**

在 `CartItem.vue` 的 `<script setup>` 中，`const currency = ...` 之后追加：

```ts
const localePath = useTenantLocalePath();

/** 酒店房型行：有入住日期即按酒店渲染（隐藏单价与步进器） */
const isHotel = computed(() => !!line.customFields?.hotelCheckIn && !!line.customFields?.hotelCheckOut);
const hotelNights = computed(() => line.customFields?.hotelNights ?? line.quantity);
const hotelSlug = computed(() => line.productVariant?.product?.slug ?? "");
```

- [ ] **Step 2: 模板加酒店分支**

在 `CartItem.vue` 模板中，把「中间商品描述」块（L75-L85）改为：

```vue
    <!-- 中间商品描述：名称/单价/规格；酒店行改为起止日期与晚数 -->
    <div class="min-w-0 flex-1 flex flex-col justify-center">
      <div class="truncate text-sm font-medium">
        {{ displayName }}
      </div>
      <template v-if="isHotel">
        <div class="mt-1 text-xs text-neutral-500">
          {{ t("messages.hotel.nights", { n: hotelNights }) }} ·
          {{ t("messages.hotel.dateRange", { in: line.customFields?.hotelCheckIn, out: line.customFields?.hotelCheckOut }) }}
        </div>
        <div class="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {{ (lineTotal / 100).toFixed(2) }} {{ currency }}
        </div>
      </template>
      <template v-else>
        <div class="mt-1 text-xs text-neutral-500">
          {{ t("messages.shop.price") }}: {{ (unitPrice / 100).toFixed(2) }} {{ currency }}
        </div>
        <div v-if="line.quantity > 1" class="mt-0.5 text-xs text-neutral-400">
          {{ t("messages.shop.subtotal") }}: {{ (lineTotal / 100).toFixed(2) }} {{ currency }}
        </div>
      </template>
    </div>
```

- [ ] **Step 3: 右侧操作区按酒店分支**

把 `CartItem.vue` 模板的「右侧操作区」块（L87-L115）改为：

```vue
    <!-- 右侧操作区：普通商品为步进器；酒店行为「修改日期 + 删除」 -->
    <div class="flex shrink-0 flex-col items-end justify-center gap-1.5">
      <NuxtLink
        v-if="isHotel && hotelSlug"
        :to="`${localePath(`/product/${hotelSlug}`)}?checkIn=${line.customFields?.hotelCheckIn}&checkOut=${line.customFields?.hotelCheckOut}`"
        class="text-xs text-primary-600 dark:text-primary-400"
      >{{ t("messages.hotel.changeDates") }}</NuxtLink>
      <div v-else-if="!isHotel" class="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="减少数量"
          :disabled="loading"
          class="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700"
          @click="onAdjust(line.quantity - 1)"
        >−</button>
        <b class="min-w-8 px-1 shrink-0 text-center text-[15px] font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{{ line.quantity }}</b>
        <button
          type="button"
          aria-label="增加数量"
          :disabled="loading"
          class="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700"
          @click="onAdjust(line.quantity + 1)"
        >＋</button>
      </div>
      <button
        type="button"
        :disabled="loading"
        class="flex items-center gap-0.5 text-xs text-red-500 disabled:opacity-40"
        @click="remove"
      >
        <span class="i-lucide-trash-2 h-3.5 w-3.5" />
        {{ t("messages.account.delete") }}
      </button>
    </div>
```

- [ ] **Step 4: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

- [ ] **Step 5: 提交**

```bash
git add layers/base/app/components/cart/CartItem.vue
git commit -m "feat(hotel): 购物车酒店行显示晚数与起止日期并隐藏步进器"
```

---

### Task 11: 前端 — 订单详情/订单卡片/游客查询展示住宿信息与 i18n 词条

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\order\OrderItems.vue`（L30-L39）
- Modify: `d:\zhao\nshop\layers\base\app\components\order\OrderCardItems.vue`（L33-L39）
- Modify: `d:\zhao\nshop\layers\base\app\components\order\GuestOrderConfirmation.vue`（L112-L121）
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`、`en-US.ts`

- [ ] **Step 1: OrderItems.vue 显示住宿信息**

把 `OrderItems.vue` 模板的中间描述块（L30-L35）改为：

```vue
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium">{{ line.productVariant?.name }}</p>
        <template v-if="line.customFields?.hotelCheckIn">
          <p class="text-sm text-neutral-500">
            {{ t("messages.hotel.nights", { n: line.customFields.hotelNights ?? line.quantity }) }} ·
            {{ t("messages.hotel.dateRange", { in: line.customFields.hotelCheckIn, out: line.customFields.hotelCheckOut }) }}
          </p>
        </template>
        <p v-else class="text-sm text-neutral-500">
          {{ t("messages.shop.price") }}: {{ fmt(line.unitPriceWithTax) }}
        </p>
      </div>
```

并把右侧数量块（L36-L39）改为：

```vue
      <div class="text-right">
        <p class="text-sm">
          {{ line.customFields?.hotelCheckIn
            ? t("messages.hotel.nights", { n: line.customFields.hotelNights ?? line.quantity })
            : `×${line.quantity}` }}
        </p>
        <p class="font-semibold">{{ fmt(line.linePriceWithTax) }}</p>
      </div>
```

- [ ] **Step 2: OrderCardItems.vue 同步**

把 `OrderCardItems.vue` 模板的中间描述块（L33-L38）改为：

```vue
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">
          {{ line.productVariant?.name }}
        </p>
        <p class="text-xs text-neutral-500">
          {{ line.customFields?.hotelCheckIn
            ? `${t("messages.hotel.nights", { n: line.customFields.hotelNights ?? line.quantity })} · ${line.customFields.hotelCheckIn} ~ ${line.customFields.hotelCheckOut}`
            : `×${line.quantity}` }}
        </p>
      </div>
```

并把 `const { locale } = useI18n();` 改为 `const { t, locale } = useI18n();`。

- [ ] **Step 3: GuestOrderConfirmation.vue 同步**

在 `GuestOrderConfirmation.vue` 的 L112-L121 商品行中，把 `<p>x{{ line.quantity }}</p>` 改为：

```vue
          <p>
            {{ line.customFields?.hotelCheckIn
              ? t("messages.hotel.nights", { n: line.customFields.hotelNights ?? line.quantity })
              : `x${line.quantity}` }}
          </p>
```

并在该组件同级的日期/晚数提示行（同一 `li` 内名称下方）追加一行：

```vue
          <p v-if="line.customFields?.hotelCheckIn" class="text-xs text-neutral-500">
            {{ t("messages.hotel.dateRange", { in: line.customFields.hotelCheckIn, out: line.customFields.hotelCheckOut }) }}
          </p>
```

（若该组件未使用 `useI18n()`，需在 `<script setup>` 中补 `const { t } = useI18n();`。）

- [ ] **Step 4: 补 i18n 词条（zh-CN）**

在 `layers/base/i18n/locales/zh-CN.ts` 的 `detail: { ... }` 块（L64-L150 区间）**之后**、同级位置插入：

```ts
    hotel: {
      nights: '共 {n} 晚',
      dateRange: '{in} 至 {out}',
      nightlyDetail: '逐晚明细',
      changeDates: '修改日期',
      stayTotal: '住宿合计',
      selectDatesFirst: '请先选择入住与离店日期',
      nightsOutOfRange: '需 {min}-{max} 晚',
    },
```

- [ ] **Step 5: 补 i18n 词条（en-US）**

在 `layers/base/i18n/locales/en-US.ts` 的对应 `detail: { ... }` 块之后、同级位置插入：

```ts
    hotel: {
      nights: '{n} nights',
      dateRange: '{in} – {out}',
      nightlyDetail: 'Nightly breakdown',
      changeDates: 'Change dates',
      stayTotal: 'Stay total',
      selectDatesFirst: 'Please select check-in and check-out dates first',
      nightsOutOfRange: '{min}-{max} nights required',
    },
```

- [ ] **Step 6: 校验并提交**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

Run（cwd `d:\zhao\nshop`）：`npm test`
Expected: 既有 vitest 用例全绿（无新增失败）

```bash
git add layers/base/app/components/order/OrderItems.vue layers/base/app/components/order/OrderCardItems.vue layers/base/app/components/order/GuestOrderConfirmation.vue layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(hotel): 订单详情与确认页展示住宿晚数并补中英词条"
```

---

### Task 12: 前端 — 页头品牌去重（问题1）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\LogoElement.vue`（全文 36 行）

- [ ] **Step 1: 删除租户名文本分支**

把 `LogoElement.vue` 整体替换为：

```vue
<script setup lang="ts">
const {
  logoLight = "/logo-full.svg",
  logoDark = "/logo-full.svg",
  wrapperClass = "w-full",
} = defineProps<{
  logoLight?: string;
  logoDark?: string;
  wrapperClass?: string;
}>();
</script>

<template>
  <div :class="wrapperClass" class="flex">
    <UColorModeImage
      :light="logoLight"
      :dark="logoDark"
      alt="Site Logo"
    />
  </div>
</template>

<style lang="css" scoped></style>
```

- [ ] **Step 2: 确认无残留引用**

Run（在 `d:\zhao`）：`git grep -n "useTenantChannel" -- nshop/layers/base/app/components/LogoElement.vue`
Expected: 无输出（该文件已不再引用租户上下文）

- [ ] **Step 3: 校验并提交**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

```bash
git add layers/base/app/components/LogoElement.vue
git commit -m "fix(header): 页头品牌位不再渲染租户名文本，消除与切换器重复及变形"
```

---

### Task 13: 验证 — 后端 e2e、手机视口截图与操作手册

**Files:**
- Create: `d:\zhao\scripts\hotel-orderline-e2e.mjs`
- Create: `d:\zhao\scripts\_shot-hotel-checkout.mjs`
- Modify: `d:\zhao\docs\manual\`（本仓库既有操作手册文件，追加本节）

- [ ] **Step 1: 后端 e2e 脚本（Shop API 断言）**

创建 `d:\zhao\scripts\hotel-orderline-e2e.mjs`：

```js
// 酒店订单行 e2e：加购 2 晚 → 断言数量/单价/行小计/逐晚明细
const API = process.env.SHOP_API || 'http://localhost:3020/shop-api';
const TOKEN = process.env.CHANNEL_TOKEN || '66ruvnhh34svhckaa2i'; // t2
const VARIANT_ID = process.env.HOTEL_VARIANT_ID;

if (!VARIANT_ID) {
  console.error('缺少 HOTEL_VARIANT_ID 环境变量');
  process.exit(1);
}

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'vendure-token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const CHECK_IN = '2026-02-14';
const CHECK_OUT = '2026-02-16';

const add = await gql(
  `mutation($v: ID!, $q: Int!, $cf: OrderLineCustomFieldsInput) {
     addItemToOrder(productVariantId: $v, quantity: $q, customFields: $cf) {
       __typename
       ... on Order { lines { id quantity unitPriceWithTax linePriceWithTax customFields { hotelCheckIn hotelCheckOut hotelNights } } }
       ... on ErrorResult { errorCode message }
     }
   }`,
  { v: VARIANT_ID, q: 2, cf: { hotelCheckIn: CHECK_IN, hotelCheckOut: CHECK_OUT, hotelNights: 2 } },
);

const line = add.addItemToOrder.lines.find(l => l.customFields?.hotelCheckIn === CHECK_IN);
const assertions = [
  ['数量=2', line?.quantity === 2],
  ['单价=94000', line?.unitPriceWithTax === 94000],
  ['行小计=188000', line?.linePriceWithTax === 188000],
];

const boxes = await gql(`query { orderBoxes { lines { orderLineId isHotel hotelCheckIn hotelCheckOut hotelNights productSlug hotelNightly { date priceCent type } } } }`);
const boxLine = boxes.orderBoxes.flatMap(b => b.lines).find(l => l.hotelCheckIn === CHECK_IN);
assertions.push(['orderBoxes.isHotel=true', boxLine?.isHotel === true]);
assertions.push(['逐晚 02-14=100000/holiday', boxLine?.hotelNightly?.[0]?.priceCent === 100000 && boxLine.hotelNightly[0].type === 'holiday']);
assertions.push(['逐晚 02-15=88000', boxLine?.hotelNightly?.[1]?.priceCent === 88000]);
assertions.push(['productSlug 非空（供修改日期跳回）', !!boxLine?.productSlug]);

let failed = 0;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: 跑后端 e2e**

Run（cwd `d:\zhao`）：
`$env:HOTEL_VARIANT_ID="<酒店房型变体ID>"; node scripts/hotel-orderline-e2e.mjs`
Expected: 全部 `PASS`，退出码 0

- [ ] **Step 3: 普通商品回归**

Run（cwd `d:\zhao`）：
`$env:HOTEL_VARIANT_ID="<普通商品变体ID>"; node scripts/hotel-orderline-e2e.mjs`
Expected: `数量`/`单价/行小计` 断言按该商品基础价 FAIL 属正常（脚本为酒店专用）；**改为**手工核对：`orderBoxes` 中该行 `isHotel=false`、`hotelNightly=null`、`linePriceWithTax` 与改造前一致，并在手册中记录该结果。

- [ ] **Step 4: 手机视口截图脚本**

创建 `d:\zhao\scripts\_shot-hotel-checkout.mjs`：

```js
// 手机视口（390x844 dpr2）截图：详情页日期条 → 购物车酒店行 → 结算页折叠/展开
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000/t2';
const SLUG = process.env.HOTEL_SLUG;
const OUT = 'docs/manual/shots/2026-09-30-hotel-orderline';
if (!SLUG) { console.error('缺少 HOTEL_SLUG'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

await page.goto(`${BASE}/product/${SLUG}`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/01-detail-datebar.png`, fullPage: false });

await page.getByRole('button', { name: /加入购物车|Add to cart/ }).first().click();
await page.waitForTimeout(1500);
await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/02-cart-hotel-line.png`, fullPage: false });

await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/03-checkout-collapsed.png`, fullPage: false });
const toggle = page.getByText(/逐晚明细|Nightly breakdown/).first();
if (await toggle.count()) {
  await toggle.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/04-checkout-expanded.png`, fullPage: false });
}

await browser.close();
console.log('screenshots →', OUT);
```

- [ ] **Step 5: 跑截图并归档操作手册**

Run（cwd `d:\zhao`）：
`$env:HOTEL_SLUG="<酒店商品slug>"; node scripts/_shot-hotel-checkout.mjs`
Expected: `docs/manual/shots/2026-09-30-hotel-orderline/` 生成 4 张 780×1688 截图

在 `d:\zhao\docs\manual\` 既有手册中新增一节「酒店房型订单行（2026-09-30）」，包含：改动说明、上述 4 张截图引用、后端 e2e 断言清单、普通商品回归结论、`/t2` 页头品牌去重截图（用同一脚本加一段 `/t2` 首页截图即可）。

- [ ] **Step 6: 提交并收口（构建→推送→部署）**

```bash
git add scripts/hotel-orderline-e2e.mjs scripts/_shot-hotel-checkout.mjs docs/manual
git commit -m "test(hotel): 酒店订单行 e2e 脚本、手机视口截图与操作手册"
```

本地构建（严禁在服务器构建）：
- 后端（cwd `d:\zhao\vendure\packages\cjk-plugin`）：`npm run build`，随后按 vendure 既有部署方式上线（git pull + `pm2 restart`）
- 前端（cwd `d:\zhao\nshop`）：`npm run build`，随后 `npm run deploy`（`scripts/deploy.mjs`，scp 产物 → 服务器解压/拷入）

---

## 自查记录

**1. Spec 覆盖**
- §2 页头品牌去重 → Task 12（+Task 13 Step 5 截图）
- §3.3.1 OrderLine customFields → Task 2
- §3.3.2 计价策略 → Task 3（依赖 Task 1 的纯函数）
- §3.3.3 orderBoxes 扩展（含 productSlug）→ Task 4
- §3.3.4 库存前置 → Task 13 Step 2 备注（实施前需先在后台核查/关闭房型变体库存追踪，见「执行前必做」）
- §3.4 前端表格逐行 → Task 5（gql）、Task 6（store）、Task 7（buyActions）、Task 8（DateBar）、Task 9（BoxLines）、Task 10（CartItem）、Task 11（订单页 + i18n）
- §4 计价与舍入 → Task 1/Task 3 实现与断言
- §5 边界与不变量 → Task 1（坏 JSON/缺日期回退）、Task 3（回退默认价）、Task 7（未选日期/越界拦截）
- §7 验收标准 → Task 13 全部步骤

**2. 占位符扫描**：无 TBD/TODO，所有代码步骤均给出完整代码。

**3. 类型一致性**：`HotelLineInfo` 字段名在 Task 1 定义、Task 4 消费一致；`resolveStay()` 返回的 `customFields` 键名 `hotelCheckIn/hotelCheckOut/hotelNights` 与 Task 2 后端声明、Task 5 gql 字段完全一致；前端消费的 `l.isHotel / hotelCheckIn / hotelCheckOut / hotelNights / hotelNightly / productSlug` 与 Task 4 的 SDL 与接口一致。

## 执行前必做

1. 核查「国信南山温泉节假日房间」各变体的 `trackInventory` / 库存设置：若开启库存追踪，先在后台关闭或把库存设足（否则晚数会被 `constrainQuantityToSaleable` 截断为 `InsufficientStockError`）。
2. 记录酒店变体 ID 与商品 slug，供 Task 13 的 e2e 与截图脚本使用。