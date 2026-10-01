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

- [x] **Step 1: 写失败测试**

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

- [x] **Step 2: 运行测试确认失败**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-nightly-pricing.spec.ts`
Expected: FAIL — `Failed to resolve import "./hotel-nightly-pricing"`

- [x] **Step 3: 实现纯函数**

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

- [x] **Step 4: 运行测试确认通过**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-nightly-pricing.spec.ts`
Expected: PASS（3 个 describe 全绿）

- [x] **Step 5: 提交**

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

- [x] **Step 1: 写失败测试**

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

- [x] **Step 2: 运行测试确认失败**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-order-line-custom-fields.spec.ts`
Expected: FAIL — `Failed to resolve import "./hotel-order-line-custom-fields"`

- [x] **Step 3: 实现字段声明**

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

- [x] **Step 4: 运行测试确认通过**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-order-line-custom-fields.spec.ts`
Expected: PASS

- [x] **Step 5: 在 plugin.ts 注册**

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

- [x] **Step 6: 类型检查并提交**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：`npm run build`
Expected: 编译通过、无 TS 报错

```bash
git add packages/cjk-plugin/src/hotel/hotel-order-line-custom-fields.ts packages/cjk-plugin/src/hotel/hotel-order-line-custom-fields.spec.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(hotel): 注册 OrderLine 入住日期与晚数 customFields"
```

---

### Task 2.5: 后端 — OrderLine 酒店字段列补齐 migration（计划缺口补充）

**背景（计划外补充）：** `dev-config.ts` 的 `dbConnectionOptions.synchronize = false`（L210），Vendure 不会自动为新增 customFields 建列。若缺此步，插件启动后 `order_line` 表无 `customFieldsHotelcheckin` 等列，查询订单行将报 `column does not exist`。仓库既有同类补列范式：`src/migrations/migrate-tenant-member-column.ts`、`migrate-collection-icon.ts`（`OnApplicationBootstrap` + `hasColumn` → `addColumn`，幂等、失败不阻塞启动）。

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-hotel-order-line-columns.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\index.ts`（追加 export）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（import 行 ~L74 追加；providers 列表 ~L212 之后追加）

- [x] **Step 1: 创建 migration**

列名规则：Vendure 自定义字段列名 = `customFields` + 字段名（首字母大写、其余小写），例如 `stockLocationId` → `customFieldsStocklocationid`。

```ts
// 确保 order_line 表存在酒店订单行自定义字段列（入住/离店/晚数）。
// Vendure 自定义字段列名规则 = customFields + 首字母大写字段名，其余小写：
//   hotelCheckIn → customFieldsHotelcheckin
//   hotelCheckOut → customFieldsHotelcheckout
//   hotelNights → customFieldsHotelnights
// 生产（PostgreSQL）与本地开发（SQLite）均可能关闭 synchronize，故此 migration 幂等地补列；
// 失败仅 console.error，不阻塞启动。
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, TableColumn } from 'typeorm';

@Injectable()
export class HotelOrderLineColumnMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    async onApplicationBootstrap() {
        try {
            const tableName = this.connection.getMetadata('OrderLine').tableName;
            const qr = this.connection.createQueryRunner();
            try {
                const ensure = async (name: string, type: string) => {
                    if (!(await qr.hasColumn(tableName, name))) {
                        await qr.addColumn(tableName, new TableColumn({ name, type, isNullable: true }));
                        // eslint-disable-next-line no-console
                        console.log(`[HotelOrderLineColumnMigration] added ${tableName}.${name}`);
                    }
                };
                await ensure('customFieldsHotelcheckin', 'varchar(255)');
                await ensure('customFieldsHotelcheckout', 'varchar(255)');
                await ensure('customFieldsHotelnights', 'integer');
            } finally {
                await qr.release();
            }
        } catch (e: any) {
            // 补列失败不阻塞启动，等待下次启动重试
            // eslint-disable-next-line no-console
            console.error('[HotelOrderLineColumnMigration] failed to ensure columns:', e?.message);
        }
    }
}
```

- [x] **Step 2: 在 `src/migrations/index.ts` 追加 export**

```ts
export { HotelOrderLineColumnMigration } from './migrate-hotel-order-line-columns';
```

- [x] **Step 3: 在 `src/plugin.ts` 注册 provider**

3a. L74 的 `import { ... } from './migrations';` 大括号内追加 `HotelOrderLineColumnMigration`。

3b. providers 列表中（`CollectionIconMigration,` 之后）追加：

```ts
        HotelOrderLineColumnMigration,
```

- [x] **Step 4: 类型检查并提交**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：`npm run build`
Expected: 编译通过、无 TS 报错

```bash
git add packages/cjk-plugin/src/migrations/migrate-hotel-order-line-columns.ts packages/cjk-plugin/src/migrations/index.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(hotel): 幂等补 order_line 酒店订单行字段列"
```

---

### Task 3: 后端 — 酒店订单行单价计价策略

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-order-item-price-strategy.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-order-item-price-strategy.spec.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（import 区、configuration 内 `return config;` 之前 ~L2556）

- [x] **Step 1: 写失败测试**

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

- [x] **Step 2: 运行测试确认失败**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-order-item-price-strategy.spec.ts`
Expected: FAIL — `Failed to resolve import "./hotel-order-item-price-strategy"`

- [x] **Step 3: 实现策略**

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

- [x] **Step 4: 运行测试确认通过**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/hotel/hotel-order-item-price-strategy.spec.ts`
Expected: PASS（4 个用例全绿）

- [x] **Step 5: 在 plugin.ts 注册策略**

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

- [x] **Step 6: 类型检查并提交**

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

- [x] **Step 1: 扩展 OrderBoxLine 接口**

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

- [x] **Step 2: 在行映射中填充新字段**

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

- [x] **Step 3: 扩展 GraphQL SDL**

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

- [x] **Step 4: 类型检查并回归既有分箱测试**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npm run build`
Expected: 编译通过、无 TS 报错

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）：
`npx vitest --config vitest.config.mts --run src/order/order-box-aggregation.spec.ts`
Expected: PASS（既有断言不因新增字段而失败）

- [x] **Step 5: 提交**

```bash
git add packages/cjk-plugin/src/order/order-box.service.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(hotel): orderBoxes 下发酒店行入离日期、晚数与逐晚明细"
```

---

### Task 5: 前端 — GraphQL 文档（mutation 参数 + fragment + orderBoxes 字段）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\order.gql`（`AddItemToOrder` L52-L67、`AdjustOrderLine` L80-L89、`GetOrderBoxes` L210-L220）
- Modify: `d:\zhao\nshop\layers\base\gql\fragments\order.gql`（`OrderBase.lines` L16-L33、`OrderDetail.lines` L79-L98）

- [x] **Step 1: 改 AddItemToOrder 与 AdjustOrderLine**

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

- [x] **Step 2: 扩展 orderBoxes 行字段**

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

- [x] **Step 3: 两个 fragment 的 lines 补 customFields**

在 `layers/base/gql/fragments/order.gql` 中，`OrderBase` 的 `lines { ... }` 块末尾（`featuredAsset { id preview }` 之后）追加：

```graphql
    customFields {
      hotelCheckIn
      hotelCheckOut
      hotelNights
    }
```

并对 `OrderDetail` 的 `lines { ... }` 块做同样追加（内容完全相同）。

- [x] **Step 4: 生成类型并校验**

Run（cwd `d:\zhao\nshop`）：`npx nuxi prepare`
Expected: 生成 `~~/.nuxt/gql/default` 且无 schema 校验报错

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错（此时新字段尚未被业务代码消费，应全绿）

- [x] **Step 5: 提交**

```bash
git add layers/base/gql/queries/order.gql layers/base/gql/fragments/order.gql
git commit -m "feat(gql): 订单行 customFields 参数与酒店行字段"
```

---

### Task 6: 前端 — useOrderStore 透传订单行 customFields

**Files:**
- Modify: `d:\zhao\nshop\layers\base\stores\useOrderStore.ts`（`addItemToOrder` L44-L70、`adjustOrderLine` L96-L122）

- [x] **Step 1: 改 addItemToOrder 签名与调用**

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

- [x] **Step 2: 改 adjustOrderLine 签名与调用**

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

- [x] **Step 3: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

- [x] **Step 4: 提交**

```bash
git add layers/base/stores/useOrderStore.ts
git commit -m "feat(order): 订单行增减支持透传 customFields"
```

---

### Task 7: 前端 — useBuyActions 传日期与晚数

**Files:**
- Modify: `d:\zhao\nshop\layers/base\app\composables\useBuyActions.ts`（全文 67 行）
- Create: `d:\zhao\nshop\layers\base\app\composables\useHotelStay.ts`

- [x] **Step 1: 新建酒店下单参数 composable**

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

- [x] **Step 2: 接入 useBuyActions**

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

- [x] **Step 3: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错（`messages.hotel.*` 词条在 Task 11 补齐前会报 i18n key 类型错；若仓库未开启 i18n key 强类型则忽略）

- [x] **Step 4: 提交**

```bash
git add layers/base/app/composables/useHotelStay.ts layers/base/app/composables/useBuyActions.ts
git commit -m "feat(hotel): 下单选日期折算晚数并传订单行日期字段"
```

---

### Task 8: 前端 — 详情页日期条支持 query 预填

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\ProductDetailDateBar.vue`（L9-L30）

- [x] **Step 1: 读取 query 并作为初值**

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

- [x] **Step 2: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

- [x] **Step 3: 提交**

```bash
git add layers/base/app/components/product-detail/ProductDetailDateBar.vue
git commit -m "feat(hotel): 日期条支持 query 预填以承接修改日期跳回"
```

---

### Task 9: 前端 — 结算页酒店行渲染

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\checkout\BoxLines.vue`（L59-L125）

- [x] **Step 1: 增加酒店行分支与展开态**

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

- [x] **Step 2: 补脚本（展开态、日类型标签、localePath）**

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

- [x] **Step 3: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

- [x] **Step 4: 提交**

```bash
git add layers/base/app/components/checkout/BoxLines.vue
git commit -m "feat(hotel): 结算页酒店行显示晚数、起止日期与可展开逐晚明细"
```

---

### Task 10: 前端 — 购物车酒店行渲染

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\cart\CartItem.vue`（L32-L116）

- [x] **Step 1: 增加酒店判定与跳转**

在 `CartItem.vue` 的 `<script setup>` 中，`const currency = ...` 之后追加：

```ts
const localePath = useTenantLocalePath();

/** 酒店房型行：有入住日期即按酒店渲染（隐藏单价与步进器） */
const isHotel = computed(() => !!line.customFields?.hotelCheckIn && !!line.customFields?.hotelCheckOut);
const hotelNights = computed(() => line.customFields?.hotelNights ?? line.quantity);
const hotelSlug = computed(() => line.productVariant?.product?.slug ?? "");
```

- [x] **Step 2: 模板加酒店分支**

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

- [x] **Step 3: 右侧操作区按酒店分支**

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

- [x] **Step 4: 校验**

Run（cwd `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无 TS 报错

- [x] **Step 5: 提交**

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

- [x] **Step 1: OrderItems.vue 显示住宿信息**

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

- [x] **Step 2: OrderCardItems.vue 同步**

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

- [x] **Step 3: GuestOrderConfirmation.vue 同步**

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

- [x] **Step 4: 补 i18n 词条（zh-CN）**

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

- [x] **Step 5: 补 i18n 词条（en-US）**

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

- [x] **Step 6: 校验并提交**

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

- [x] **Step 1: 删除租户名文本分支**

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

- [x] **Step 2: 确认无残留引用**

Run（在 `d:\zhao`）：`git grep -n "useTenantChannel" -- nshop/layers/base/app/components/LogoElement.vue`
Expected: 无输出（该文件已不再引用租户上下文）

- [x] **Step 3: 校验并提交**

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

- [x] **Step 1: 后端 e2e 脚本（Shop API 断言）**

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
// 真实数据：02-14（周六，非节假日）取 basePriceCent 88000；02-15 命中春节 holiday 段 = 100000
assertions.push(['逐晚 02-14=88000/weekend', boxLine?.hotelNightly?.[0]?.priceCent === 88000 && boxLine.hotelNightly[0].type === 'weekend']);
assertions.push(['逐晚 02-15=100000/holiday', boxLine?.hotelNightly?.[1]?.priceCent === 100000 && boxLine.hotelNightly[1].type === 'holiday']);
assertions.push(['productSlug 非空（供修改日期跳回）', !!boxLine?.productSlug]);

let failed = 0;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [x] **Step 2: 跑后端 e2e**

Run（cwd `d:\zhao`）：
`$env:HOTEL_VARIANT_ID="<酒店房型变体ID>"; node scripts/hotel-orderline-e2e.mjs`
Expected: 全部 `PASS`，退出码 0

- [x] **Step 3: 普通商品回归**

Run（cwd `d:\zhao`）：
`$env:HOTEL_VARIANT_ID="<普通商品变体ID>"; node scripts/hotel-orderline-e2e.mjs`
Expected: `数量`/`单价/行小计` 断言按该商品基础价 FAIL 属正常（脚本为酒店专用）；**改为**手工核对：`orderBoxes` 中该行 `isHotel=false`、`hotelNightly=null`、`linePriceWithTax` 与改造前一致，并在手册中记录该结果。

- [x] **Step 4: 手机视口截图脚本**

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

- [x] **Step 5: 跑截图并归档操作手册**

Run（cwd `d:\zhao`）：
`$env:HOTEL_SLUG="<酒店商品slug>"; node scripts/_shot-hotel-checkout.mjs`
Expected: `docs/manual/shots/2026-09-30-hotel-orderline/` 生成 4 张 780×1688 截图

在 `d:\zhao\docs\manual\` 既有手册中新增一节「酒店房型订单行（2026-09-30）」，包含：改动说明、上述 4 张截图引用、后端 e2e 断言清单、普通商品回归结论、`/t2` 页头品牌去重截图（用同一脚本加一段 `/t2` 首页截图即可）。

- [x] **Step 6: 提交并收口（构建→推送→部署）**

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

1. ~~核查「国信南山温泉节假日房间」各变体的 `trackInventory` / 库存设置~~ **已完成（2026-09-30）**：3 个 `hotelRoomConfig` 非空变体（id 58 / 64 / 69）原本 `trackInventory = 'TRUE'`，经用户确认已改为 `'FALSE'`（关闭库存追踪）；备份表 `_bak_hotel_trackinventory_20260930`（生产库 vendure）。原因：晚数即数量后，「件数库存」既会截断晚数（`constrainQuantityToSaleable` → `InsufficientStockError`），也会被逐晚扣减，语义不再成立。
2. **记录酒店变体 ID 与商品 slug**（供 Task 13 e2e/截图）：
   - 国信南山温泉节假日房间：variantId `58`，product slug `国信南山温泉节假日房间`，basePriceCent `88000`，minNights 1 / maxNights 30
   - 国信南山温泉工作日房间（验收商品-图片库存11351）：variantId `64`，basePriceCent `68800`
   - 酒店测试-豪华套房（hotel-suite-test）：variantId `69`，basePriceCent `88800`
   - t2 渠道 token：`66ruvnhh34svhckaa2i`；线上 Shop API：`http://39.97.54.5/shop-api`（服务器 API_PORT=3020）
3. **补充缺口**：本仓库 `synchronize: false`，新增 OrderLine customFields 必须配套补列 migration（见 Task 2.5），否则启动后查询订单行报 `column does not exist`。
4. **节假日上浮数据（已按用户确认配置，2026-09-30）**：变体 58 的 `hotelRoomConfig` 原本**没有 `priceCalendar`**，故「1000元」在数据中并不存在、无法复现用户场景。已给其补 `priceCalendar = [{"type":"holiday","priceCent":100000,"dates":["2026-02-15"…"2026-02-22"]}]`（依据国务院办公厅《关于2026年部分节假日安排的通知》：2026 春节 2/15–2/23 放假，2/14 为调休上班日）。备份表 `_bak_hotelroomconfig_20260930`（生产库 vendure）。`basePriceCent` 88000 / minNights 1 / maxNights 30 未改动。
   - 由此 Task 13 验证口径为：**02-14（周六，非节假日）¥880 + 02-15（春节）¥1000 = ¥1880，均价 ¥940**（合计与设计文档一致，仅逐晚顺序互换）。
   - **补充（2026-10-01）**：上述春节日期（2026-02-15~22）已过期，而 C 端日期条限定「明天 ~ 今天+`advanceDays`」，页面上选不到 → 截图无法复现节假日场景。已**追加**一段 `{"type":"holiday","priceCent":100000,"dates":["2026-10-01"…"2026-10-07"]}`（国庆），既有春节段与其它字段保持不动；备份 `d:\zhao\_backup\t2-hotel-holiday-20261001-0406\`。C 端可复现口径改为 `2026-10-07 → 2026-10-09`（2 晚：10-07 国庆 ¥1000 + 10-08 平日 ¥880 = ¥1880）。

---

## 执行完成记录（2026-10-01 收口）

计划内 Task 1-13 与 Task 2.5 全部执行完毕；计划外追加两项缺口修复。三仓库均已提交、推送、部署到生产。

| 范围 | 提交 | 说明 |
| --- | --- | --- |
| 后端 vendure（`packages/cjk-plugin`） | `4b58fecef` / `adc03d544` / `45c90835b` / `1ea2a3db9` | 逐晚计价纯函数、OrderLine customFields、补列 migration、单价计价策略、orderBoxes 下发 |
| 后端 vendure（计划外） | `31b36ea0e` | 游客订单查询（pickup-plugin）补酒店行字段（Task 11b） |
| 后端 vendure（线上热修） | `94b51ee3d` | `availableStock` 32 位溢出导致酒店详情页 500 → resolver 边界钳制到 `2147483647` |
| 前端 nshop | `4578c68` `ea539e5` `fe01427` `bfa722f` `f27d4be` `99f4796` `9c2e87c` `d75321d` | store 透传 customFields、useHotelStay、日期条 query 预填、结算/购物车/订单页酒店行、页头品牌去重、游客订单页字段 |
| 前端 nshop（收口修复） | `154c797` | 结算页酒店行 390px 布局：展开态 `basis-full` 无法换行导致日期逐字竖排 → 酒店行加 `flex-wrap` 并去掉冗余晚数列 |
| 伞仓库（e2e/截图/手册） | `5473e81` `12f69c8` | e2e 脚本（断言由入离日期推导）、手机视口截图、手册第 6 节 |

验证结论：
- 后端 e2e：国庆口径 `2026-10-07 → 2026-10-09` **8/8 PASS**；默认旧口径 `2026-02-14 → 2026-02-16` **8/8 PASS**（无回归）
- 生产实测：`quantity=2`、`unitPriceWithTax=94000`、`linePriceWithTax=188000`
- 截图：5 张 780×1688（390×844 dpr2）已归档 `docs/manual/shots/2026-09-30-hotel-orderline/`，含脚本内 DOM 文本断言
- 前端 `pnpm typecheck` 保持 18 条既有基线（无新增）
- 手册：`docs/manual/product-detail/index.md` 第 6 节（6.1-6.9）

未纳入本次范围（已知边界，见手册 6.6）：`messages.hotel.*` 仅补了 `zh-CN` / `en-US`，其余语言包依赖 `merge.ts` 以中文为基底的回退；仓库既有其它命名空间同样未逐语言包补齐，如需严格逐语言包覆盖请另行开单。

### 收口补记 · 结算页普通商品行折行布局 + 缩略图放大（2026-10-01）

计划外追加。起因：上一轮回归截图 `06-checkout-normal-product.png` 暴露普通商品行在 390px 下商品名被右侧固定列（单价 / 步进器 / 行小计 `w-14` / 删除）挤到约 1 个字宽后 `truncate`——**改动前既有问题**，非酒店行改动引入。

按「设计变更先出内联 mockup 定稿」规范，先出 A/B/C 三版式内联预览（PureShowWidget），用户选定 **方案 A · 折行式**；随后追加要求「商品图放大」并确认折行方案。

改动（`layers/base/app/components/checkout/BoxLines.vue`）：

| 项 | 改前 | 改后 |
| --- | --- | --- |
| 商品行 `<li>` | `:class="l.isHotel ? 'flex-wrap' : ''"`（仅酒店行换行） | 恒 `flex-wrap`（两分支共用） |
| 普通商品行价格与操作 | 与商品名同排的 4 个 `shrink-0` 块 | 折入 `basis-full` 第二行容器，`pl-22`（88px）与商品名左边缘对齐，行内加 `flex-wrap` 兜底多语言 |
| 缩略图 | `h-9 w-9`（36px） | `h-14 w-14`（56px，`width/height=56`） |
| 缩略图取图宽度 | `assetSrc(full, 48)` | `assetSrc(full, 128)`（56px @dpr2 的 2× 位图） |

验证：
- 前端 `pnpm build` 成功（`pnpm typecheck` 无 `BoxLines.vue` 报错，其余 18 条为既有基线）
- 生产实测（390×844 dpr=2）`06` 段断言全 PASS：缩略图 56×56、商品名可用宽 **244.0px**（改造前约 49px）、商品名与价格 y 中心差 69.2px（已折行）、单价与步进器 y 中心差 0.0px、行小计 ¥336.00、截图 780×1688
- 酒店行 e2e 与页面断言（详情页 ¥1880/¥1000/¥880、购物车「共 2 晚」、结算页「住宿合计」1880.00）全部保持 PASS，无回归
- 手册 `docs/manual/product-detail/index.md` 6.5 重写为折行布局说明（含选型表与断言输出），6.6 已知边界改为「第二行宽度的多语言余量」，6.9 同步更正「普通商品行不加 `flex-wrap`」的旧表述

未纳入本轮（仍属已知边界）：酒店房型无 `featureAssetSource` 时缩略图位显示为浅灰占位块（`bg-neutral-100`），属既有行为；如需为酒店变体补商品图请在后台配置。

### 收口补记 · 页头移动端 390px 溢出修复 + i18n 12 语言包补全（2026-10-01）

计划外追加。起因：390px 全站巡检发现结算页（t2，租户名「二月兰会员」5 字）文档 `scrollWidth=398 > 视口 390`（横向可滚、购物车角标被切），品牌 logo 被右侧组挤压成 **32px 细缝**。

定位过程与结论：
- 临时脚本 `_audit-mobile-390.mjs`（整页截图 + 横向溢出元素清单）先发现 `scrollWidth=398`，溢出元素全部来自页头；`/cart` 实为 404 页（真实购物车是 `CartPanel` 抽屉），其对比结论作废。
- 临时脚本 `_audit-header.mjs`（对比两页页头各元素盒模型）定位到右侧组宽度：404 页回退站点名「优商铺」3 字 → 右侧组 310px（不溢出）；结算页租户名「二月兰会员」5 字 → 右侧组 **338px**，加 logo 组 32px + 间距后越过 390px。
- 两个临时脚本与临时截图目录 `docs/manual/shots/2026-10-01-mobile-audit/` 用完即删，不入库。

改动（方案 A，用户选定）：

| 文件 | 项 | 改后 |
| --- | --- | --- |
| `layers/base/app/components/AppHeader.vue` | `#right` 内 `HeaderTenantSelector` | 包 `hidden sm:flex`，移动端（<640px）不渲染；租户入口保留在抽屉 `#body` 的另一份（功能不丢失）；城市选择器保留 |
| `layers/base/i18n/locales/{fa-IR,bg-BG,ru-RU,ko-KR,it-IT,ja-JP,pt-BR,fr-FR,es-ES,de-DE}.ts` | `messages.hotel.*` | 各补 7 键，占位符 `{n}/{in}/{out}/{min}/{max}` 原样保留，插入位置以语义邻居键（`tWeekend`/`tHoliday`/`tCustom`/`bedType`）定位 |

> 品牌位去重（`LogoElement.vue` 恒渲染 logo 图）在 Task 12 已完成；本轮仅处理移动端溢出与 i18n 缺口。i18n 补全纠正了收口记录中「未纳入本次范围」的表述——12 语言包现已全部定义 `messages.hotel.*`（各 7 键，已核验）。

验证：
- 前端 `pnpm build` 成功；`node scripts/deploy.mjs` 部署 → 生产 `pm2 restart nshop`（online）
- 生产实测（390×844 dpr=2，`scripts/_shot-hotel-checkout.mjs` 新增页头段）：结算页/首页 `scrollWidth ≤ 390`、logo 可用宽 ≥80px，全部 PASS；酒店行与普通商品行既有断言无回归
- 手册 `docs/manual/product-detail/index.md`：6.2 页头验收点与 05 图 alt 更新、6.6 i18n 已知边界改写、新增 6.10

### 收口补记 · 商品卡价格本地化 + 币种缺省修正（2026-10-01）

计划外追加。起因：390px 巡检顺带核对首页/分类页商品卡时发现价格渲染为 `168.00 CNY`（值 + 空格 + 裸币种代码），与详情页 / 购物车 / 结算页的 `¥168.00` 两套写法并存。

根因：
- `layers/base/app/components/product/ProductCard.vue` 价格用模板字符串硬拼 `${值} ${币种}`，未走货币本地化格式化 → 与站点语言无关（浏览器语言为英文时渲染成 `CNY 168.00`）；
- 同一处币种缺省值写成 `"EUR"`（`product.currencyCode ?? "EUR"`），本店结算币种为 CNY，字段缺失时会显示欧元；
- 同源问题：`pages/product/[slug].vue` 的 Schema.org `offers.priceCurrency` 缺省值同为 `"EUR"`（结构化数据币种错误影响搜索引擎价格展示）。

改动：

| 文件 | 改前 | 改后 |
| --- | --- | --- |
| `components/product/ProductCard.vue` L26-40 | `${值} ${币种}` + `?? "EUR"` | 复用 `utils/format-money.ts` 的 `formatMoney(值, 币种, locale.value)`；缺省改 `"CNY"`；`useI18n()` 增取 `locale` |
| `pages/product/[slug].vue` L165 | `priceCurrency: ... ?? "EUR"` | `?? "CNY"` |

验证：
- 各语言输出（`formatMoney(16800,"CNY",locale)`）：`zh-CN→¥168.00`、`en-US→CN¥168.00`、`ja-JP→元 168.00`、`de-DE→168,00 CN¥`
- 前端 `pnpm build` 成功、`pnpm typecheck` 保持 18 条既有基线（无新增）；`node scripts/deploy.mjs` 部署 → 生产 `pm2 restart nshop`（online）
- 生产实测（`scripts/_shot-hotel-checkout.mjs` 新增价格段）：分类页 `["¥168.00","¥880.00","¥688.00","¥198.00"]`、首页 `["¥168.00 ¥215.00","¥880.00 ¥1120.00","¥688.00 ¥880.00","¥198.00 ¥255.00","¥20.00 ¥35.00","¥0.00 ¥10.00"]`，均无裸币种代码，PASS；截图 `07-category-price.png` / `08-home-price.png`（780×1688）
- 手册 `docs/manual/product-detail/index.md` 新增 6.11

脚本可重入性一并加固（`scripts/_shot-hotel-checkout.mjs`）：
- 价格段取样口径由 `article` 改为「卡片根 = `article` 或 `a[href*="/product/"]`」：分类页卡片根为 `ProductCard` 的 `<article>`，首页装修楼层为 `JdProductGrid` / `GoodsCardBlock` 的 NuxtLink 卡片（无 `<article>`），原结构性定位在首页必然超时；并只取真实可见卡片（首页轮播含不可见副本）。
- 加购 → 开购物车面板段加重试：首帧 hydration 未完成时首次点击可能落空，按「面板是否含 `共 2 晚`」判定，且仅在面板确为「购物车是空的」时才补点加购，避免重复加购把数量变成 2 致金额断言失配。
- 价格段截图前滚动到「首个含价格的可见卡片」再截，否则首页首屏（轮播 / 金刚区）看不到价格，截图无法作为证据。

已知边界（本轮未处理，待决策）：i18n 各语言包相对 zh-CN（773 键）仍存在既有缺口（bg-BG 缺 273 键等），依赖 `merge.ts` 中文兜底，非本任务引入。

> **更正（2026-10-01，见下方「收口补记 · i18n 全语言包审计与漏译修复」）**：上述「bg-BG 缺 273 键」为**误报**。首版审计脚本只读了 `zhFallbackLocale` 的**第一个**参数对象，而该函数是 `(...overrides)` rest 参数、内部 reduce 深合并**全部**参数，写在第二个对象里的译文同样生效。修正后真实缺失 = **0**。

---

### 收口补记 · 首页「为你推荐」楼层空态修复（2026-10-01）

计划外追加。起因：390px 巡检发现 t2 首页「热门商品」楼层正常（9 件）而「为你推荐」楼层渲染「当前城市/配送方式下暂无可用商品」。按「设计变更先出内联 mockup 定稿」规范，先出 A/B 两版式内联预览（PureShowWidget），用户选定 **方案 A · 回退未去重列表**。

定位过程（两次误判，务必记录）：
1. **首次归因错误**：判为装修积木 `useCuratedGoods.ts` 的同页去重把区块清空。实际经 Admin API 查证 `t2.customFields.shopContent = null` → 首页根本没走装修积木，而是走京东兜底楼层；改完 `useCuratedGoods` 部署后生产空态**依旧**（断言 FAIL 命中 1 处），据此推翻该判断。
2. **真正根因**：`app/pages/index.vue` 兜底取数 `home-fallback-search` 一次 `SearchProducts(take: 20)` 后切 `hot = enriched.slice(0,10)` / `more = enriched.slice(10,20)`。t2 全站仅 9 件商品（`search.totalItems = 9`）→ `more` 恒空 → 骨架自动补位的 `recommend` 槽位（`HomeBlockRenderer.vue` 以 `autoGoods.more` 直渲 `GoodsCardBlock`）渲染空态。
3. 定位手段：临时探针 `scripts/_probe_recommend.mjs`（Admin API 读渠道 `shopContent` + Playwright 390px dump 各楼层卡片数与空态归属，输出「热门商品 cards=9 / 为你推荐 cards=0 empty=true」）。用完即删。

改动：

| 文件 | 改动 |
| --- | --- |
| `app/pages/index.vue` L139-145 | `const hot = enriched.slice(0,10); const more = enriched.slice(10,20); return { hot, more: more.length ? more : hot }` |
| `layers/base/app/composables/useCuratedGoods.ts` L200-214 | 同类缺陷的装修积木路径一并加固：去重排除后为空则回退未去重列表（`rest.length ? rest : items`）——仅在「原本会为空」时生效，非空场景行为完全不变 |

验证：
- 首次部署（仅 `useCuratedGoods` 改动）生产断言 **FAIL**（可见命中 1 处）→ 证伪归因，二次部署（补 `index.vue`）后 **PASS**（可见命中 0 处）
- 截图 `09-home-recommend.png`（780×1688）：「为你推荐」楼层内为商品卡（¥168.00 / ¥880.00 等）
- 酒店行 / 普通商品行 / 页头 / 价格本地化既有断言无回归；`pnpm build` 成功、`deploy.mjs` 部署 → 生产 `pm2 restart nshop`（online）
- 断言按**可见元素**计数（PC 版式在 390px 下 `display:none`，其楼层同样存在，全 DOM 计数会误判）
- 手册 `docs/manual/product-detail/index.md` 新增 6.12

已知取舍：总商品数 ≤10 件时两个楼层内容重复；运营需区分应在后台 `shopContent` 配置「热门 / 推荐」积木而非依赖兜底切片。

---

### 收口补记 · i18n 全语言包审计与漏译修复（2026-10-01）

承接上一节「已知边界」中悬置的 i18n 缺口问题（用户批准执行）。**结论先行：该「缺口」为误报，真实缺失 0；本轮实际修掉 33 条真漏译。**

**审计脚本踩的两个坑（首版 → 修正）**：

1. **只读第一个覆盖对象 → 误报 2635 条缺失**。语言包为 `defineI18nLocale(() => zhFallbackLocale({...覆盖1...}, {...覆盖2...}))`；`merge.ts` 的 `zhFallbackLocale(...overrides)` 是 rest 参数，内部 `deepMerge` reduce **全部**参数 —— 写在第二个对象里的译文同样生效。修正 `readOverride` 为「收集 `zhFallbackLocale(` 的全部顶层参数对象字面量并逐一 deepMerge」后，缺失归零。
2. **把 zh-CN.ts 的尾部导出语句吞进对象字面量 → SyntaxError**。首版用 `lastIndexOf('}')` 定位对象结尾，把后面的 `export default defineI18nLocale(...)` 一并带入；改为按括号配平（跳过字符串与转义）的 `extractObject`。该函数同时被运行时探针复用（zh-CN 单列 `extractObject(src, src.indexOf('{'))` 分支，因为 zh-CN.ts 是 `export const zhMessages = {...}`，**没有** `zhFallbackLocale(` 包裹）。

**过程事故（自我纠正）**：修正审计口径前，曾按错误清单派出 5 个子代理去「补齐」bg-BG / es-ES / ru-RU / de-DE / fr-FR，造成无谓改动（bg-BG/es-ES 删掉 obj2；ru-RU/de-DE/fr-FR 把键复制进 obj1 产生重复键）。发现归因错误后 **`git checkout --` 全部回滚这 5 个文件**，重新按修正后的清单执行。

**审计结论**（`d:\zhao\scripts\_audit-i18n.mjs`）：zh-CN 773 叶子词条；12 语言包缺失 **0**、含汉字泄漏 **0**（`ja-JP`/`zh-CN` 豁免）；`ja-JP` 13 条「值等于中文」为汉字同形词（未使用/保存/配送/商品/数量/件…），属正常；8 语言包各有 2 条死键 `billing.firstName` / `billing.lastName`（zh-CN 无此键、全仓库代码未使用）→ 待清理，本轮不动。

**本轮落地改动（9 个语言包，33 条）**：

| 文件 | 改动 |
| --- | --- |
| `layers/base/i18n/locales/{bg-BG,de-DE,es-ES,fa-IR,fr-FR,it-IT,pt-BR,ru-RU}.ts` | 各 4 条 `shop.packageShipping` / `shop.warehouse` / `shop.shippingAdjustmentCharge` / `shop.shippingAdjustmentRefund`，原值照抄中文，已按各语言翻译 |
| `layers/base/i18n/locales/en-US.ts` L24 | `site.shareDesc` 由中文改为英文 |

- `shop.*` 渲染点：`layers/base/app/components/order/OrderShippingBreakdown.vue` L49/L54/L66
- `site.shareDesc` 渲染点：`app/app.vue` L157/L159、`app/layouts/default.vue` L19、`layers/base/app/components/WechatShare.vue` L81（**无法用线上 meta description 验证**——t2 渠道 `shopIntro` 会覆盖）

**验证**：

- 本地 `_audit-i18n.mjs` 全表：缺失 0 / 含汉字 0
- 新增运行时探针 `scripts/_probe-i18n-runtime.mjs`：从各语言包提取键（`home.hotGoods` / `home.recommendGoods` / `nav.my` / `nav.cart` / `nav.search`）→ 抓 `/t2` 与 `/{code}/t2` 的 SSR HTML → 断言命中本语言译文且无 `messages.*` 原始 key 泄漏。**12 语言全 PASS**
- URL 形态确认：语言前缀在租户前缀**之前**（`/en/t2`），默认中文无前缀（`/t2`）；12 个 URL 全 HTTP 200
- 手机视口截图（`scripts/_shot-i18n-locale.mjs`，390×844 dpr=2）：`docs/manual/shots/2026-10-01-i18n/home-{zh-CN,en,de,ja,ru,ko,fa}.png` 共 7 张，全部 200、无原始 key 泄漏；肉眼确认德语 chrome 全德语、波斯语整页 RTL
- 本地 `pnpm build` + `node scripts/deploy.mjs`（本地构建，服务器仅 `pm2 restart nshop`，pm2 nshop online）
- 手册 `docs/manual/product-detail/index.md` 新增 6.13

边界（数据层，非本轮范围）：截图残留中文（休闲娱乐 / 养车 / 日常用品 / 美食）为 Vendure 后台**分类名/商品名**（单语种字段），不经 i18n 字典；i18n 字典层已干净。

后续可选（未做）：清理 8 语言包死键 `billing.firstName` / `billing.lastName`；把 `_audit-i18n.mjs` 收敛为仓库常驻守卫（新增词条时防漏译）。
