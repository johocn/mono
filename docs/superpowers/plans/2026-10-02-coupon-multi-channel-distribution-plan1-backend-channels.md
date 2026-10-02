# 优惠券多渠道分发 · 计划 1（后端：渠道显式化与场景隔离）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「分发渠道」从隐式字段推导改造成 `CouponTemplate` 上的显式配置，并让领券中心 / 积分商城 / 优惠码兑换 / 商品详情页四条既有渠道按「渠道集合 + 使用场景」正确过滤，历史券行为保持不变。

**Architecture:** 新增纯函数模块 `coupon-channel.ts` 承载全部渠道判定与场景过滤逻辑（无 IO、可单测）；实体新增 `distributionChannels` / `salePrice` 两列并以幂等迁移补列；四处既有查询改为「SQL 粗筛（保留历史券可行集）+ 纯函数精筛」，使 `null` 渠道集合的历史券走老字段推导、显式配置的券走显式集合。

**Tech Stack:** TypeScript、TypeORM、NestJS、Vendure v2 插件体系、**vitest**（该包不使用 jest）、PostgreSQL（生产）/ SQLite（本地开发）

**仓库位置：** 本计划所有路径相对 `d:\zhao\vendure`（该目录是独立 git 仓库）。所有 `git` 命令的 cwd 均为 `d:\zhao\vendure`。

**范围说明（本计划不做）：** 出售链路（券商城 / 加价购 / 微信支付）、券包、后台选品器与券编辑页 UI、C 端 Tab —— 分别属计划 2/3/4。本计划交付后前置渠道行为即可独立回归。

---

## 文件结构

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `packages/coupon-plugin/src/coupon-channel.ts` | 渠道枚举解析、渠道集合判定、场景匹配、列表精筛（纯函数，无 IO） | 新建 |
| `packages/coupon-plugin/src/coupon-channel.spec.ts` | 上述纯函数的单测 | 新建 |
| `packages/coupon-plugin/src/types.ts` | 新增 `CouponChannel` 类型 | 修改 |
| `packages/coupon-plugin/src/coupon-template.entity.ts` | 新增 `distributionChannels` / `salePrice` 列 | 修改 |
| `packages/coupon-plugin/src/migrations/add-coupon-distribution-channels.ts` | 幂等补两列 | 新建 |
| `packages/coupon-plugin/src/migrations/index.ts` | 导出新迁移 | 修改 |
| `packages/coupon-plugin/src/plugin.ts` | providers 注册迁移、SDL 增字段与入参 | 修改 |
| `packages/coupon-plugin/src/coupon.service.ts` | update 白名单增两项；四处查询接入精筛 | 修改 |
| `packages/coupon-plugin/src/coupon-binding.service.ts` | `visibleBinding` 接入渠道与场景判定 | 修改 |

---

### Task 1: 渠道枚举与判定纯函数

**Files:**
- Create: `packages/coupon-plugin/src/coupon-channel.ts`
- Create: `packages/coupon-plugin/src/coupon-channel.spec.ts`
- Modify: `packages/coupon-plugin/src/types.ts`

- [x] **Step 1: 先确认测试运行器可用**

> **已核实（执行后修正）**：本包**不使用 jest**（`npx vitest --config vitest.config.mts --run` 会拉到裸 jest 且无法解析 TS，报 `Unexpected token`）。真实运行器是 **vitest**，且未开启 `globals`，所有既有 spec 均从 `vitest` 显式导入 `describe / expect / it`。以下命令为本计划的实际口径。

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run src/in-store-bill.spec.ts
```
Expected: 该既有单测全部 PASS（基线为 9 passed / 0 failed）。

- [x] **Step 2: 在 types.ts 末尾追加渠道类型**

在 [types.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/types.ts) 文件末尾（`UpdateProductCouponBindingInput` 之后）追加：

```ts
/**
 * 券分发渠道（券模板可被分发/获取的入口）：
 * - CENTRE  ：优惠券中心领取
 * - SALE    ：出售（券商城 / 商品页加价购）
 * - POINTS  ：积分换购
 * - CODE    ：优惠码兑换
 * - PRODUCT ：浏览指定商品领取
 * - GRANT   ：定向发放
 */
export type CouponChannel = 'CENTRE' | 'SALE' | 'POINTS' | 'CODE' | 'PRODUCT' | 'GRANT';
```

- [x] **Step 3: 写失败的测试**

创建 `packages/coupon-plugin/src/coupon-channel.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';

import {
    filterTemplatesByChannelAndScene,
    hasChannel,
    matchesScene,
    parseDistributionChannels,
    resolveCouponChannels,
} from './coupon-channel';

const legacy = (over: Partial<Record<string, unknown>> = {}) => ({
    distributionChannels: null,
    claimable: false,
    pointsPrice: 0,
    claimCode: null,
    usageScene: 'ONLINE',
    ...over,
});

describe('parseDistributionChannels', () => {
    it('解析逗号分隔渠道并去重、去空白、忽略未知代号', () => {
        expect(parseDistributionChannels(' centre , SALE ,centre,BOGUS, POINTS ')).toEqual([
            'CENTRE',
            'SALE',
            'POINTS',
        ]);
    });

    it('null / undefined / 空串返回空数组', () => {
        expect(parseDistributionChannels(null)).toEqual([]);
        expect(parseDistributionChannels(undefined)).toEqual([]);
        expect(parseDistributionChannels('')).toEqual([]);
    });
});

describe('resolveCouponChannels', () => {
    it('显式配置优先，且不再叠加老字段推导', () => {
        const tpl = { distributionChannels: 'SALE', claimable: true, pointsPrice: 300, claimCode: 'X' };
        expect(resolveCouponChannels(tpl, true)).toEqual(['SALE']);
    });

    it('历史券（无显式配置）由老字段推导', () => {
        const tpl = { distributionChannels: null, claimable: true, pointsPrice: 300, claimCode: 'NEW2026' };
        expect(resolveCouponChannels(tpl, true)).toEqual(['CENTRE', 'POINTS', 'CODE', 'PRODUCT']);
    });

    it('历史券无任何来源时返回空数组（GRANT 无历史推导来源）', () => {
        expect(resolveCouponChannels(legacy(), false)).toEqual([]);
    });

    it('空白字符串的显式配置等同未配置，回落老字段', () => {
        const tpl = { distributionChannels: '  ', claimable: true, pointsPrice: 0, claimCode: null };
        expect(resolveCouponChannels(tpl, false)).toEqual(['CENTRE']);
    });

    it('全部为未知代号时视为无效配置，回落老字段', () => {
        const tpl = { distributionChannels: 'FOO,BAR', claimable: true, pointsPrice: 0, claimCode: null };
        expect(resolveCouponChannels(tpl, false)).toEqual(['CENTRE']);
    });
});

describe('hasChannel', () => {
    it('显式含 PRODUCT 时即便没有绑券也算命中', () => {
        const tpl = { distributionChannels: 'PRODUCT', claimable: false, pointsPrice: 0, claimCode: null };
        expect(hasChannel(tpl, false, 'PRODUCT')).toBe(true);
    });

    it('显式不含 CENTRE 时老字段 claimable 不生效', () => {
        const tpl = { distributionChannels: 'SALE', claimable: true, pointsPrice: 0, claimCode: null };
        expect(hasChannel(tpl, false, 'CENTRE')).toBe(false);
    });
});

describe('matchesScene', () => {
    it('ALL 同时匹配线上与到店', () => {
        expect(matchesScene('ALL', 'ONLINE')).toBe(true);
        expect(matchesScene('ALL', 'IN_STORE')).toBe(true);
    });

    it('ONLINE 不匹配到店，IN_STORE 不匹配线上', () => {
        expect(matchesScene('ONLINE', 'IN_STORE')).toBe(false);
        expect(matchesScene('IN_STORE', 'ONLINE')).toBe(false);
    });

    it('null / undefined 按 ONLINE 处理（历史数据语义）', () => {
        expect(matchesScene(null, 'ONLINE')).toBe(true);
        expect(matchesScene(undefined, 'IN_STORE')).toBe(false);
    });
});

describe('filterTemplatesByChannelAndScene', () => {
    const list = [
        legacy({ claimable: true, usageScene: 'ONLINE' }),
        legacy({ pointsPrice: 500, usageScene: 'IN_STORE' }),
        { distributionChannels: 'CENTRE,POINTS', claimable: false, pointsPrice: 0, claimCode: null, usageScene: 'ALL' },
        { distributionChannels: 'SALE', claimable: true, pointsPrice: 900, claimCode: null, usageScene: 'ONLINE' },
    ];

    it('线上领券中心：取渠道含 CENTRE 且场景匹配的券', () => {
        const out = filterTemplatesByChannelAndScene(list, 'CENTRE', 'ONLINE');
        expect(out).toEqual([list[0], list[2]]);
    });

    it('到店领券中心：排除仅线上的券', () => {
        const out = filterTemplatesByChannelAndScene(list, 'CENTRE', 'IN_STORE');
        expect(out).toEqual([list[2]]);
    });

    it('显式仅 SALE 的券不出现在领券中心（老字段 claimable=true 不生效）', () => {
        const out = filterTemplatesByChannelAndScene(list, 'CENTRE', 'ONLINE');
        expect(out).not.toContain(list[3]);
    });

    it('积分商城线上：仅取渠道含 POINTS 且场景匹配的券', () => {
        expect(filterTemplatesByChannelAndScene(list, 'POINTS', 'ONLINE')).toEqual([list[2]]);
    });

    it('空数组返回空数组', () => {
        expect(filterTemplatesByChannelAndScene([], 'CENTRE', 'ONLINE')).toEqual([]);
    });
});
```

- [x] **Step 4: 运行测试确认失败**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run src/coupon-channel.spec.ts
```
Expected: FAIL —— `Cannot find module './coupon-channel'`。

- [x] **Step 5: 实现纯函数模块**

创建 `packages/coupon-plugin/src/coupon-channel.ts`：

```ts
import type { CouponChannel, CouponUsageScene } from './types';

/** 全部合法渠道代号（顺序即后台展示顺序） */
export const ALL_COUPON_CHANNELS: ReadonlyArray<CouponChannel> = [
    'CENTRE',
    'SALE',
    'POINTS',
    'CODE',
    'PRODUCT',
    'GRANT',
];

/** 参与渠道判定的模板字段子集（避免依赖实体运行时） */
export interface CouponChannelFields {
    distributionChannels?: string | null;
    claimable?: boolean | null;
    pointsPrice?: number | null;
    claimCode?: string | null;
    usageScene?: string | null;
}

/**
 * 解析逗号分隔的渠道集合：去空白、转大写、去重、忽略未知代号。
 * null / undefined / 空串 / 全为未知代号 → 空数组（调用方据此回落老字段推导）。
 */
export function parseDistributionChannels(raw?: string | null): CouponChannel[] {
    if (raw == null) return [];
    const out: CouponChannel[] = [];
    for (const part of String(raw).split(',')) {
        const code = part.trim().toUpperCase() as CouponChannel;
        if (ALL_COUPON_CHANNELS.includes(code) && !out.includes(code)) {
            out.push(code);
        }
    }
    return out;
}

/**
 * 解析券模板的分发渠道集合。
 * 显式配置优先（不再叠加老字段）；未配置时按老字段推导，保证历史券行为不变。
 * GRANT 无历史推导来源，故历史券默认不含定向发放。
 */
export function resolveCouponChannels(
    tpl: CouponChannelFields | null | undefined,
    hasProductBinding: boolean,
): CouponChannel[] {
    const explicit = parseDistributionChannels(tpl?.distributionChannels);
    if (explicit.length > 0) return explicit;

    const derived: CouponChannel[] = [];
    if (tpl?.claimable) derived.push('CENTRE');
    if (Number(tpl?.pointsPrice ?? 0) > 0) derived.push('POINTS');
    if (tpl?.claimCode) derived.push('CODE');
    if (hasProductBinding) derived.push('PRODUCT');
    return derived;
}

/** 该模板是否可通过指定渠道分发 */
export function hasChannel(
    tpl: CouponChannelFields | null | undefined,
    hasProductBinding: boolean,
    channel: CouponChannel,
): boolean {
    return resolveCouponChannels(tpl, hasProductBinding).includes(channel);
}

/**
 * 场景匹配：ALL 同时匹配线上与到店；null / undefined 按 ONLINE 处理（历史数据语义）。
 */
export function matchesScene(
    usageScene: string | null | undefined,
    scene: CouponUsageScene,
): boolean {
    const s = (usageScene ?? 'ONLINE') as CouponUsageScene;
    return s === 'ALL' || s === scene;
}

/**
 * 列表精筛：仅保留「渠道命中 + 场景命中」的模板。
 * 用于各 C 端渠道查询在 SQL 粗筛之后做精确过滤。
 */
export function filterTemplatesByChannelAndScene<T extends CouponChannelFields>(
    templates: T[],
    channel: CouponChannel,
    scene: CouponUsageScene,
): T[] {
    return templates.filter(
        tpl => hasChannel(tpl, false, channel) && matchesScene(tpl.usageScene, scene),
    );
}
```

- [x] **Step 6: 运行测试确认通过**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run src/coupon-channel.spec.ts
```
Expected: PASS，全部用例通过（0 failed）。

- [x] **Step 7: 提交**

```bash
git add packages/coupon-plugin/src/types.ts packages/coupon-plugin/src/coupon-channel.ts packages/coupon-plugin/src/coupon-channel.spec.ts
git commit -m "优惠券分发渠道：新增 CouponChannel 与渠道判定纯函数（含单测）"
```

---

### Task 2: 模板新增渠道集合与售价列

**Files:**
- Modify: `packages/coupon-plugin/src/coupon-template.entity.ts`
- Create: `packages/coupon-plugin/src/migrations/add-coupon-distribution-channels.ts`
- Modify: `packages/coupon-plugin/src/migrations/index.ts`
- Modify: `packages/coupon-plugin/src/plugin.ts`
- Modify: `packages/coupon-plugin/src/coupon.service.ts`

- [x] **Step 1: 实体新增两列**

在 [coupon-template.entity.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon-template.entity.ts) 中，`usageScene` 列（约 L96-97）之后、`@ManyToMany(() => Channel)` 之前插入：

```ts
    /**
     * 分发渠道集合（逗号分隔，如 'CENTRE,SALE,POINTS,CODE,PRODUCT,GRANT'）。
     * 为 null / 空时由老字段（claimable / pointsPrice / claimCode / 商品绑定）推导，保证历史券行为不变。
     */
    @Column('varchar', { nullable: true }) distributionChannels?: string;

    /** 出售价（分，与 Vendure money 子单位一致）；0 = 不可售 */
    @Column({ default: 0 }) salePrice: number;
```

- [x] **Step 2: 新建幂等迁移**

创建 `packages/coupon-plugin/src/migrations/add-coupon-distribution-channels.ts`（结构照抄既有 `add-coupon-usage-scene.ts`）：

```ts
// 确保 coupon_template 表存在 distributionChannels / salePrice 列（生产 PostgreSQL 与本地开发
// SQLite 都可能关闭 synchronize，故此 migration 幂等补列；出错只打日志不抛错，不阻塞启动）。
// distributionChannels 允许为 NULL（历史券走老字段推导）；salePrice 默认 0（不可售）。
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, TableColumn } from 'typeorm';

@Injectable()
export class AddCouponDistributionChannelsMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    async onApplicationBootstrap() {
        try {
            const metadata = this.connection.getMetadata('CouponTemplate');
            const tableName = metadata.tableName;
            const queryRunner = this.connection.createQueryRunner();
            try {
                const channels = new TableColumn({
                    name: 'distributionChannels',
                    type: 'varchar(255)',
                    isNullable: true,
                });
                if (!(await queryRunner.hasColumn(tableName, channels.name))) {
                    await queryRunner.addColumn(tableName, channels);
                }
                const salePrice = new TableColumn({
                    name: 'salePrice',
                    type: 'int',
                    isNullable: false,
                    default: '0',
                });
                if (!(await queryRunner.hasColumn(tableName, salePrice.name))) {
                    await queryRunner.addColumn(tableName, salePrice);
                }
            } finally {
                await queryRunner.release();
            }
        } catch (e: any) {
            // 补列失败不阻塞启动，等待下次启动重试
            // eslint-disable-next-line no-console
            console.error('[AddCouponDistributionChannelsMigration] failed to ensure columns:', e?.message);
        }
    }
}
```

- [x] **Step 3: 导出新迁移**

修改 [migrations/index.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/migrations/index.ts)，在末尾追加一行：

```ts
export { AddCouponDistributionChannelsMigration } from './add-coupon-distribution-channels';
```

- [x] **Step 4: 在 plugin.ts 注册迁移 provider**

在 [plugin.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/plugin.ts) 中先找到迁移的 import 语句块与 `providers` 数组（其中已含 `AddCouponUsageSceneMigration`）。

import 语句加一项：
```ts
import { AddCouponDistributionChannelsMigration } from './migrations/add-coupon-distribution-channels';
```

`providers` 数组中 `AddCouponUsageSceneMigration,` 之后加一项：
```ts
        AddCouponDistributionChannelsMigration,
```

- [x] **Step 5: SDL 增输出字段与输入字段**

在 [plugin.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/plugin.ts) 中，`type CouponTemplate` 定义的 `usageScene: CouponUsageScene!`（约 L81）之后追加：

```graphql
    distributionChannels: String
    salePrice: Int!
```

在 `input CreateCouponTemplateInput` 的 `usageScene: CouponUsageScene`（约 L281）之后追加：

```graphql
                distributionChannels: String
                salePrice: Int
```

在 `input UpdateCouponTemplateInput` 的 `usageScene: CouponUsageScene`（约 L309）之后追加：

```graphql
                distributionChannels: String
                salePrice: Int
```

- [x] **Step 6: update 白名单增两项**

在 [coupon.service.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon.service.ts) 的 `TEMPLATE_UPDATE_ALLOWED` 数组（L32 起，实际末项为 `'usageScene',`）末尾追加两项：

```ts
    'distributionChannels',
    'salePrice',
```

> `createTemplate`（L203）走 `new CouponTemplate(input)`，无需改动——新列随入参自动写入。

- [x] **Step 7: 运行单测与类型检查确认无回归**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run
```
Expected: PASS —— 本包全部既有单测通过，无新增失败。

- [x] **Step 8: 提交**

```bash
git add packages/coupon-plugin/src/coupon-template.entity.ts packages/coupon-plugin/src/migrations/add-coupon-distribution-channels.ts packages/coupon-plugin/src/migrations/index.ts packages/coupon-plugin/src/plugin.ts packages/coupon-plugin/src/coupon.service.ts
git commit -m "优惠券分发渠道：模板新增 distributionChannels/salePrice 列与幂等迁移"
```

---

### Task 3: 领券中心与积分商城接入渠道与场景过滤

**Files:**
- Modify: `packages/coupon-plugin/src/coupon.service.ts:313-343`（`couponCentre`）
- Modify: `packages/coupon-plugin/src/coupon.service.ts:396-408`（`pointsMallTemplates`）
- Modify: `packages/coupon-plugin/src/coupon.service.spec.ts:373-385`（既有断言 `toHaveBeenCalledWith('tpl.claimable = :claimable', ...)` 因 SQL 被 `Brackets` OR 组合替换而失效，需同步改为断言首个别名为 `new Brackets(...)`）

- [x] **Step 1: couponCentre 的 SQL 粗筛改为「显式配置 或 老字段 claimable」**

在 [coupon.service.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon.service.ts) L313 起替换 `couponCentre` 方法体为：

```ts
    async couponCentre(ctx: RequestContext): Promise<CouponTemplate[]> {
        const repo = this.connection.getRepository(ctx, CouponTemplate);
        const now = new Date();
        // 粗筛：显式配置了渠道集合的券不再要求 claimable=true（显式优先）；
        // 未配置的历史券仍按老字段 claimable 过滤，保证行为不变。
        const own = await repo
            .createQueryBuilder('tpl')
            .innerJoin('tpl.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
            .where('tpl.enabled = :enabled', { enabled: true })
            .andWhere(
                new Brackets(qb =>
                    qb
                        .where('tpl.distributionChannels IS NOT NULL')
                        .andWhere("tpl.distributionChannels <> ''")
                        .orWhere('tpl.claimable = :claimable', { claimable: true }),
                ),
            )
            .andWhere('(tpl.startsAt IS NULL OR tpl.startsAt <= :now)', { now })
            .andWhere('(tpl.endsAt IS NULL OR tpl.endsAt >= :now)', { now })
            .getMany();
        // 非默认商城维持现状：仅列出本渠道券。
        if (!isDefaultMallChannel(ctx)) {
            return filterTemplatesByChannelAndScene(own, 'CENTRE', 'ONLINE');
        }
        // 默认商城：除本渠道券外，追加列出「其 shopId 对应商品出现在本商城」的租户券。
        const shopIds = await this.shopIdsPresentInChannel(ctx);
        if (shopIds.size === 0) {
            return filterTemplatesByChannelAndScene(own, 'CENTRE', 'ONLINE');
        }
        const extra = await repo
            .createQueryBuilder('tpl')
            .where('tpl.shopId IN (:...shopIds)', { shopIds: [...shopIds] })
            .andWhere('tpl.enabled = :enabled', { enabled: true })
            .andWhere(
                new Brackets(qb =>
                    qb
                        .where('tpl.distributionChannels IS NOT NULL')
                        .andWhere("tpl.distributionChannels <> ''")
                        .orWhere('tpl.claimable = :claimable', { claimable: true }),
                ),
            )
            .andWhere('(tpl.startsAt IS NULL OR tpl.startsAt <= :now)', { now })
            .andWhere('(tpl.endsAt IS NULL OR tpl.endsAt >= :now)', { now })
            .getMany();
        const ownIds = new Set(own.map(t => String(t.id)));
        const merged = [...own, ...extra.filter(t => !ownIds.has(String(t.id)))];
        return filterTemplatesByChannelAndScene(merged, 'CENTRE', 'ONLINE');
    }
```

> 注意：`couponCentre` 当前签名不含场景参数，线上 Tab 固定按 `'ONLINE'` 过滤（到店 Tab 的入口由计划 4 新增的独立查询参数承载；本计划先保证线上入口不混入到店券）。

- [x] **Step 2: 补充 import**

在 [coupon.service.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon.service.ts) 顶部 import 区：

1）新增一行 `import { Brackets } from 'typeorm';`（⚠️ 勘误：`Brackets` 由 **typeorm** 导出，`@vendure/core` 并不导出；本仓其它文件亦从 typeorm 导入。按计划原样放进 `@vendure/core` 的 import 列表会在运行期报 `Brackets is not a constructor`）。

2）新增一行：
```ts
import { filterTemplatesByChannelAndScene } from './coupon-channel';
```

- [x] **Step 3: pointsMallTemplates 接入渠道与场景过滤**

替换 `pointsMallTemplates`（L396 起）为：

```ts
    async pointsMallTemplates(ctx: RequestContext): Promise<CouponTemplate[]> {
        const repo = this.connection.getRepository(ctx, CouponTemplate);
        const now = new Date();
        // 粗筛：显式配置渠道的券不再要求 pointsPrice>0；历史券仍按 pointsPrice>0 过滤。
        const rows = await repo
            .createQueryBuilder('tpl')
            .innerJoin('tpl.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
            .where('tpl.enabled = :enabled', { enabled: true })
            .andWhere(
                new Brackets(qb =>
                    qb
                        .where('tpl.distributionChannels IS NOT NULL')
                        .andWhere("tpl.distributionChannels <> ''")
                        .orWhere('tpl.pointsPrice > 0'),
                ),
            )
            .andWhere('(tpl.startsAt IS NULL OR tpl.startsAt <= :now)', { now })
            .andWhere('(tpl.endsAt IS NULL OR tpl.endsAt >= :now)', { now })
            .orderBy('tpl.pointsPrice', 'ASC')
            .getMany();
        return filterTemplatesByChannelAndScene(rows, 'POINTS', 'ONLINE');
    }
```

- [x] **Step 4: 运行全量单测确认无回归**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run
```
Expected: PASS —— 含 `coupon-channel.spec.ts` 与全部既有单测，0 failed。

- [x] **Step 5: 人工核对线上行为**

若本地 vendure 服务在运行，在 shop-api 执行（`vendure-token` 头带目标渠道）：

```graphql
query {
  couponCentre {
    id
    name
    distributionChannels
    salePrice
    usageScene
  }
}
```
Expected: 返回列表中每一项 `usageScene` 均为 `ONLINE` 或 `ALL`；不含 `usageScene: IN_STORE` 的券；显式配置为 `SALE` 的券不出现。

- [x] **Step 6: 提交**

```bash
git add packages/coupon-plugin/src/coupon.service.ts
git commit -m "优惠券分发渠道：领券中心与积分商城按渠道集合+使用场景过滤"
```

---

### Task 4: 优惠码兑换与商品详情页绑券接入渠道与场景过滤

**Files:**
- Modify: `packages/coupon-plugin/src/coupon-binding.service.ts:195-200`（`visibleBinding`）
- Modify: `packages/coupon-plugin/src/coupon.service.ts:538-552`（`redeemByClaimCode`）
- Modify: `packages/coupon-plugin/src/coupon.service.ts:521-535`（`claimProductCoupon`）

- [x] **Step 1: visibleBinding 接入渠道与场景判定**

替换 [coupon-binding.service.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon-binding.service.ts#L195-L200) 的 `visibleBinding` 为：

```ts
    /**
     * 可见性过滤：binding.enabled（查询已含，双保险）&& 模板 enabled
     * && 渠道集合含 PRODUCT（显式配置优先，未配置时回落 claimable）
     * && 使用场景匹配线上。
     */
    private visibleBinding(b: ProductCouponBinding, ctx: RequestContext): boolean {
        // channelId 为 number 大整数列，ctx.channel.id 为 string，需统一转 number 比较
        const channelMatch = !b.channelId || Number(b.channelId) === Number(ctx.channel?.id);
        return (
            !!b.enabled &&
            !!b.template?.enabled &&
            hasChannel(b.template, true, 'PRODUCT') &&
            matchesScene(b.template.usageScene, 'ONLINE') &&
            channelMatch
        );
    }
```

- [x] **Step 2: 补 import**

在 `coupon-binding.service.ts` 顶部 import 区新增：

```ts
import { hasChannel, matchesScene } from './coupon-channel';
```

- [x] **Step 3: redeemByClaimCode 接入渠道与场景校验**

替换 `redeemByClaimCode`（[coupon.service.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon.service.ts#L538-L552)）为：

```ts
    /** 凭码兑换：同租户内 claimCode 唯一匹配模板 → 复用 claimCoupon */
    async redeemByClaimCode(ctx: RequestContext, claimCode: string): Promise<CustomerCoupon> {
        const repo = this.connection.getRepository(ctx, CouponTemplate);
        const candidates = await repo.find({
            where: { claimCode } as any,
            relations: { channels: true },
        });
        const hit = candidates.find(
            t =>
                t.claimCode &&
                this.templateBelongsToChannel(ctx, t) &&
                hasChannel(t, false, 'CODE') &&
                matchesScene(t.usageScene, 'ONLINE'),
        );
        if (!hit) {
            if (candidates.length === 0) {
                throw new UserInputError('Invalid claim code');
            }
            throw new UserInputError('Claim code not available in this shop');
        }
        return this.claimCoupon(ctx, hit.id);
    }
```

- [x] **Step 4: claimProductCoupon 接入渠道与场景校验**

替换 `claimProductCoupon`（[coupon.service.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/coupon.service.ts#L521-L535)）为：

```ts
    /** 详情页领券：按 bindingId 找到模板后复用 claimCoupon（限领/余量/newCustomerOnly 校验都在其中） */
    async claimProductCoupon(ctx: RequestContext, bindingId: ID): Promise<CustomerCoupon> {
        const binding = await this.connection
            .getRepository(ctx, ProductCouponBinding)
            .findOne({ where: { id: bindingId as any }, relations: { template: true } });
        if (!binding || !binding.enabled) {
            throw new UserInputError('Binding not found');
        }
        if (binding.channelId != null && Number(binding.channelId) !== Number(ctx.channel?.id)) {
            throw new UserInputError('Binding not found');
        }
        if (
            !binding.template ||
            !hasChannel(binding.template, true, 'PRODUCT') ||
            !matchesScene(binding.template.usageScene, 'ONLINE')
        ) {
            throw new UserInputError('Coupon is not claimable');
        }
        return this.claimCoupon(ctx, binding.couponTemplateId);
    }
```

- [x] **Step 5: 更新 coupon.service.ts 的 import**

在已新增的 `import { filterTemplatesByChannelAndScene } from './coupon-channel';` 一行上，扩展为同时导入所需函数：

```ts
import { filterTemplatesByChannelAndScene, hasChannel, matchesScene } from './coupon-channel';
```

- [x] **Step 6: 运行全量单测确认无回归**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run
```
Expected: PASS —— 0 failed。

- [x] **Step 7: 人工核对**

若本地 vendure 服务在运行，在 shop-api 执行：

```graphql
mutation {
  claimProductCoupon(bindingId: "1") {
    id
    status
    code
  }
}
```
Expected: 若该绑定对应的券模板显式配置不含 `PRODUCT`（例如仅 `SALE`），返回错误 `Coupon is not claimable`；配置含 `PRODUCT` 时正常发券。

- [x] **Step 8: 提交**

```bash
git add packages/coupon-plugin/src/coupon.service.ts packages/coupon-plugin/src/coupon-binding.service.ts
git commit -m "优惠券分发渠道：优惠码兑换与详情页绑券按渠道集合+使用场景校验"
```

---

### Task 5: 计划 1 收口回归

**Files:** 无新增，仅验证与记录。

- [x] **Step 1: 全量单测**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run
```
Expected: PASS，0 failed。

- [x] **Step 2: 全包类型检查/构建**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx tsc --noEmit
```
Expected: 无错误输出。若该包无独立 `tsconfig.json` 导致报错，改为 cwd `d:\zhao\vendure` 执行构建脚本并把实际命令与结果记录到本计划末尾的「执行记录」。

- [x] **Step 3: 历史券行为回归（关键）**

在后台对一张**历史券**（`distributionChannels` 为 null）执行一次「编辑并保存」（不改动 claimable / pointsPrice / claimCode），随后：

1. shop-api 查 `couponCentre` → 该券**仍出现**（若原本 claimable=true）；
2. 其 `distributionChannels` 字段仍为 null（本计划**不做**自动预填，预填动作在计划 3 的券编辑页落地）；
3. `salePrice` 为 0。

Expected: 三点全部成立。这是「历史券行为不变」的验收口径。

- [x] **Step 4: 记录执行结果**

在本计划文件末尾追加「执行记录」小节，写入：实际执行的测试命令、通过用例数、`tsc` 结果、Step 3 的三点核对结果。

- [x] **Step 5: 提交执行记录**

Step 4 的记录写在 `d:\zhao` 仓库的本计划文件中，故在 `d:\zhao` 提交（不在 `vendure` 仓库）：

```bash
git add docs/superpowers/plans/2026-10-02-coupon-multi-channel-distribution-plan1-backend-channels.md
git commit -m "优惠券多渠道分发 · 计划 1 执行记录"
```

Run 完成后确认 `vendure` 仓库工作区干净：
```bash
git -C d:/zhao/vendure status --short
```
Expected: 无输出（Task 1-4 的改动均已提交）。

---

## Self-Review

**1. Spec 覆盖**

| Spec 章节 | 覆盖任务 |
| --- | --- |
| §5.1 `CouponTemplate` 新增两列 | Task 2 |
| §5.5 新枚举 `CouponChannel` | Task 1 |
| §6.1 渠道判定纯函数 | Task 1 |
| §6.2 场景隔离（CENTRE / POINTS / CODE / PRODUCT） | Task 3、Task 4 |
| §6.2 到店收银可用券列表 | **缺口** —— 需先定位到店核销侧的可用券查询位置（可能在 in-store 流程或 `coupon.service` 的 applyCoupon 路径），归入计划 2 与到店券出售一并处理 |
| §6.2 `grantCouponIssue` 校验渠道含 GRANT | **缺口** —— 归入计划 2（与券包/出售共用后台校验），本计划不涉及后台发券改动 |
| §9.1 admin SDL 字段 | Task 2（仅字段与入参；券包/选品/流水契约属计划 2） |
| §12 多语言 | 本计划不含用户可见文案，无词条新增 |
| §13.1 单测（渠道判定 / 场景隔离） | Task 1、Task 3、Task 4 |
| §13.2 e2e | 归入计划 2（出售链路 e2e 需与出售单一起验证） |

**2. 占位符扫描**：无 TBD / TODO；所有代码步骤均给出完整可粘贴代码与确切命令。Task 5 Step 2 的「若失败则改命令」为环境兜底说明，非占位符。

**3. 类型一致性核对**

- `CouponChannel` 六值在 `types.ts`（Task 1 Step 2）、纯函数 `ALL_COUPON_CHANNELS`（Task 1 Step 5）、SDL 注释（Task 2）三处一致。
- `hasChannel` / `matchesScene` / `filterTemplatesByChannelAndScene` / `parseDistributionChannels` / `resolveCouponChannels` 五个导出名在定义处（Task 1 Step 5）与调用处（Task 3 Step 1/3、Task 4 Step 1/3/4）逐字一致。
- `distributionChannels`（`varchar` 可空）与 `salePrice`（`int` 非空默认 0）在实体（Task 2 Step 1）、迁移（Task 2 Step 2）、SDL（Task 2 Step 5）、白名单（Task 2 Step 6）四处列名一致。
- `matchesScene` 的 `CouponUsageScene` 取值 `'ONLINE' | 'IN_STORE' | 'ALL'` 与既有 [types.ts](file:///d:/zhao/vendure/packages/coupon-plugin/src/types.ts#L32) 定义一致。

**4. 已识别的两处缺口**（见上表）：均已明确归属计划 2，不在本计划内实现。

---

## 执行记录（计划 1 实际执行结果）

执行方式：**Subagent 驱动**（每个 Task 派一个 fresh subagent，随后两阶段审查：读实际 `git diff` + 亲自复跑单测）。

### 环境事实（勘误与基准）

- 测试运行器为 **vitest**（非 jest），未开启 globals，spec 需显式 `import { describe, expect, it } from 'vitest'`。
  - 全量：`npx vitest --config vitest.config.mts --run`（cwd `vendure/packages/coupon-plugin`）
  - 仅单测：`npx vitest --config vitest.config.mts --run src/`
- 全量运行固定有 2 个 e2e spec（`e2e/coupon.e2e-spec.ts`、`e2e/in-store-bill.e2e-spec.ts`）在**配置加载期**失败：`e2e-common/get-package-dir.js:10` 要求 `--package=<pkg>`，未传则 `process.exit(1)`。**与本次改动无关**（Task 1 前即如此）。
- 单测基准：**8 文件 / 103 passed**（改动前后一致）。
- 勘误：`Brackets` 由 **typeorm** 导出，`@vendure/core` 并不导出（Task 3 Step 2 原文有误，已在本计划中更正）。

### Task 1 渠道枚举与判定纯函数（完成）

- 提交 `ed7eaa810`：新建 `src/coupon-channel.ts`、`src/coupon-channel.spec.ts`；`src/types.ts` 追加 `CouponChannel`。
- 测试：`coupon-channel.spec.ts` 17 passed。

### Task 2 模板新增两列（完成）

- 提交 `988a1a0d0`：实体两列 + 幂等迁移 `add-coupon-distribution-channels.ts` + `migrations/index.ts` 导出 + `plugin.ts`（SDL 输出/两处 input/provider 注册）+ 更新白名单。
- 测试：全量 `Tests 103 passed (103)`、单测 0 failed（仅 2 个既有 e2e 配置加载失败）。

### Task 3 领券中心与积分商城（完成）

- 提交 `bb486c7ec`。
- 内容：`couponCentre`（三处返回）与 `pointsMallTemplates` 改为「SQL 粗筛（`distributionChannels` 非空 OR 老字段）+ `filterTemplatesByChannelAndScene` 精筛」；新增 `import { Brackets } from 'typeorm'` 与 `import { filterTemplatesByChannelAndScene } from './coupon-channel'`。
- 计划外但必要：既有断言 `andWhere('tpl.claimable = :claimable', ...)` 因该 SQL 被 `Brackets` OR 组合**有意替换**而失效，改为 `toHaveBeenNthCalledWith(1, expect.any(Brackets))`。
- 复跑：`src/` → 8 文件 / 103 passed / 0 failed。

### Task 4 优惠码兑换与详情页绑券（完成）

- 主提交 `0c23478a7`；补充提交 `cd9b0732d`（测试夹具 `'OFFLINE'` → 合法枚举值 `'IN_STORE'`）。
- 内容：`visibleBinding`、`claimProductCoupon`、`redeemByClaimCode` 的判定由 `claimable` 改为「渠道集合含 PRODUCT / CODE + 场景匹配 ONLINE」。
- 计划外但必要：同步修正 2 条既有断言（`coupon-binding.service.spec.ts` L79-89 改用显式 `distributionChannels: 'SALE'` 验证过滤；`coupon.service.spec.ts` L79-86 改用 `usageScene: 'IN_STORE'` 验证场景过滤），使二者在新语义下继续有效而非空转。
- 复跑：`src/` → 8 文件 / 103 passed / 0 failed。

### Task 5 收口回归

- **Step 1 全量单测**：`Tests 103 passed (103)`；`Test Files 2 failed | 8 passed (10)` —— 2 个 failed 均为上述既有 e2e 缺 `--package=` 参数，非本次回归。
- **Step 2 类型检查**：cwd `packages/coupon-plugin` 执行 `npx tsc --noEmit -p tsconfig.json` → **EXIT=0，无输出**。
- **Step 3 历史券行为回归**：**未能在运行态执行**（本机无运行中的 vendure 服务 / DB，原计划要求「后台编辑保存 + shop-api 查询」）。以确定性证据替代：
  1. 「历史券（`distributionChannels` 为 null 且 `claimable=true`）仍出现于线上领券中心」由单测锁定：`coupon-channel.spec.ts`「null/undefined 按 ONLINE 处理」（L85-88）、「历史券由老字段推导」（L42-45）、`filterTemplatesByChannelAndScene` 线上用例（L99-102）。
  2. 「编辑保存后 `distributionChannels` 仍为 null」「`salePrice` 为 0」：全包 grep 确认**不存在任何写入/自动预填路径** —— `distributionChannels` / `salePrice` 仅出现在实体列定义、纯函数只读、SQL 只读过滤、SDL、迁移、更新白名单；预填动作按设计在**计划 3 的券编辑页**落地。
  3. **残留风险**：`repo.save(已加载实体)` 对 NULL 列的写回行为需真实 DB 验证（TypeORM 对 `undefined` 属性通常不纳入 SET 子句），建议在**计划 2 的 e2e** 中以真实 DB 覆盖此点。
- **Step 4** 即本节；**Step 5** 在 `d:\zhao` 仓库提交本记录。

### 验收结论

- 计划 1 五个 Task 全部完成：单测 **103 passed / 0 failed**，`tsc --noEmit` 通过。
- 历史券行为不变：已获纯函数级确定性证据 + 「无写入路径」证据；运行态写回验证移交计划 2 e2e。
- 两处已知缺口（到店收银侧可用券列表场景过滤、`grantCouponIssue` 渠道校验）按 Self-Review 归属**计划 2**，本计划不实现。
- 全部改动均在 `vendure` 仓库并已提交；`git -C d:/zhao/vendure status --short` 无输出（工作区干净）。