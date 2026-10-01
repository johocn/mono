# 到店买单 · 优惠券核销打折 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让多租户商城的顾客领「到店买单券」→ 到店出示券码 → 商户在 web-admin 核销并手填原价 → 按券折扣（默认 8 折）算实付 → 线下收款 → 落一条买单流水；平台全程不收款、不生成线上订单。

**Architecture:** 复用既有券体系：`CouponTemplate` 新增 `usageScene`（ONLINE｜IN_STORE｜ALL，默认 ONLINE）标记场景；新建独立表 `in_store_bill` 存买单流水（不动 `MerchantSettlementLedger`）；金额规则由纯函数 `computeInStoreBill` 实现；核销走 `@Transaction()` + 「条件更新 `status='USED' WHERE status='UNUSED'` 判 affectedRows」保证幂等与并发安全。

**Tech Stack:** Vendure 3.6 插件（TypeScript + TypeORM + NestJS + vitest）、vshop/web-admin（uni-app H5，vue3）、nshop（Nuxt 3 + Tailwind + `qrcode`）。

**权威设计来源:** [2026-10-01-in-store-bill-coupon-design.md](file:///d:/zhao/docs/superpowers/specs/2026-10-01-in-store-bill-coupon-design.md)（下称 spec）。本计划对 spec 有两处**刻意细化**，实现时以本计划为准：

1. spec §9.1 中 `inStoreBillQuote(code: String!, originalAmount: Int!)` 改为 **`originalAmount: Int`（可空）**：受理 null 时只返回券信息（券名/折扣/顾客/有效期，金额字段为 null），否则按金额试算。原因：spec §11.2 要求核销页在「手填原价之前」先展示券信息卡，可空入参才能一次接口满足两步 UX。
2. spec §4.1 提到逻辑写在 `coupon.service.ts`；本计划**新建 `in-store-bill.service.ts`**（`coupon.service.ts` 已 1080 行），仅将 `CouponService.templateBelongsToChannel` 由 `private` 提为 `public` 以复用渠道归属判断，不动其它既有逻辑。

**硬规范（务必遵守）:**
- 每个 Task 走 TDD：先写失败测试 → 跑红 → 最小实现 → 跑绿 → 提交。
- 所有后端单测/e2e 用 **vitest**（不是 jest）：`vitest --config vitest.config.mts --run`。
- 多语言：nshop 新增词条必须**同步全部 12 个语言包**；web-admin 同步 `zh-Hans.json` + `en.json`。
- 功能验证必须用**手机视口 390×844、dpr=2** 截图，并写入操作手册。
- 收尾**一气呵成**：提交 → 推送 → 部署，不留半成品。
- 所有构建**本地执行**，服务器只做解压 / `pm2 restart`。

---

## 文件结构（先定边界，再拆任务）

### 后端 `d:\zhao\vendure\packages\coupon-plugin`

| 文件 | 职责 |
| --- | --- |
| `src/types.ts`（改） | 新增 `CouponUsageScene` 类型 |
| `src/coupon-template.entity.ts`（改） | 新增 `usageScene` 列 |
| `src/in-store-bill.ts`（新） | **纯函数** `computeInStoreBill` + 原因码常量 + 中文文案表（无 DB、无副作用） |
| `src/in-store-bill.entity.ts`（新） | `InStoreBill` 实体（流水表） |
| `src/in-store-bill.service.ts`（新） | 校验链 `locate` + `quote` / `redeem` / `list` / `summary` |
| `src/in-store-bill-admin.resolver.ts`（新） | admin-api 的 4 个 GraphQL 入口 |
| `src/migrations/add-coupon-usage-scene.ts`（新） | `coupon_template.usageScene` 幂等补列 |
| `src/migrations/create-in-store-bill.ts`（新） | `in_store_bill` 幂等建表 + 索引 |
| `src/migrations/index.ts`（改） | 导出两个新迁移 |
| `src/plugin.ts`（改） | entities / providers / SDL（admin+shop）/ resolvers 注册 |
| `src/coupon.service.ts`（改） | 仅把 `templateBelongsToChannel` 提为 public |
| `src/in-store-bill.spec.ts`（新） | 纯函数单测 |
| `src/in-store-bill.service.spec.ts`（新） | 服务单测（mock 连接） |
| `e2e/in-store-bill.e2e-spec.ts`（新） | 全链路 e2e |

### 商户端 `d:\zhao\vshop\web-admin`

| 文件 | 职责 |
| --- | --- |
| `src/apis/in-store-bill.ts`（新） | 4 个接口封装 + 类型 + 金额格式化 |
| `src/pages/in-store/redeem/index.vue`（新） | 核销页 |
| `src/pages/in-store/bills/index.vue`（新） | 流水页 |
| `src/pages.json`（改） | 注册两个页面 |
| `src/constants/menus.ts`（改） | 新增「到店买单」菜单组 |
| `src/locale/zh-Hans.json` / `src/locale/en.json`（改） | 新增 `inStoreRedeem` / `inStoreBills` / `menu.domain.inStore` / `menu.inStore*` |
| `src/apis/coupon.ts`（改） | `usageScene` 类型 + 查询字段 + 入参 |
| `src/pages/coupon/edit/index.vue`（改） | 「使用场景」选择器 + 8 折预填 |
| `docs/superpowers/manual/in-store-bill/README.md`（新） | 操作手册 |

### C 端 `d:\zhao\nshop`

| 文件 | 职责 |
| --- | --- |
| `layers/base/app/composables/useCoupon.ts`（改） | `usageScene` 类型 + 查询字段 |
| `layers/base/app/pages/coupon/code.vue`（新） | 券码出示页（二维码 + 大字券码） |
| `layers/base/app/pages/coupon/index.vue`（改） | 券包「出示券码」入口 |
| `layers/base/i18n/locales/*.ts`（改，12 个） | 新增到店买单词条 |
| `docs/superpowers/manual/coupon-in-store/README.md`（新） | 操作手册 |

---

## Task 1: 后端 — `usageScene` 类型、实体列与迁移

**Files:**
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\types.ts`
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\coupon-template.entity.ts`
- Create: `d:\zhao\vendure\packages\coupon-plugin\src\migrations\add-coupon-usage-scene.ts`
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\migrations\index.ts`
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\plugin.ts`（仅 providers 注册迁移）

- [ ] **Step 1: 在 `types.ts` 末尾追加场景类型**

在 `d:\zhao\vendure\packages\coupon-plugin\src\types.ts` 中 `CouponScope` 定义之后追加：

```ts
/**
 * 券使用场景：
 * - ONLINE   ：仅可用于线上订单（历史数据默认值，语义与改造前一致）
 * - IN_STORE ：仅可用于到店买单核销
 * - ALL      ：线上与到店皆可
 */
export type CouponUsageScene = 'ONLINE' | 'IN_STORE' | 'ALL';
```

- [ ] **Step 2: 给 `CouponTemplate` 实体加列**

修改 `d:\zhao\vendure\packages\coupon-plugin\src\coupon-template.entity.ts`：把 import 改为

```ts
import { CouponScope, CouponType, CouponUsageScene } from './types';
```

并在 `@ManyToMany(() => Channel)` 之前插入：

```ts
    /** 使用场景：ONLINE（仅线上，默认）| IN_STORE（仅到店买单）| ALL（两者皆可） */
    @Column('varchar', { default: 'ONLINE' }) usageScene: CouponUsageScene;
```

- [ ] **Step 3: 新建迁移 `add-coupon-usage-scene.ts`**

创建 `d:\zhao\vendure\packages\coupon-plugin\src\migrations\add-coupon-usage-scene.ts`：

```ts
// 确保 coupon_template 表存在 usageScene 列（生产 PostgreSQL 与本地开发 SQLite 都可能关闭
// synchronize，故此 migration 幂等补列；出错只打日志不抛错，不阻塞启动，等待下次启动重试）。
// 历史数据默认 'ONLINE'，券行为与改造前完全一致。
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, TableColumn } from 'typeorm';

@Injectable()
export class AddCouponUsageSceneMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    async onApplicationBootstrap() {
        try {
            const metadata = this.connection.getMetadata('CouponTemplate');
            const tableName = metadata.tableName;
            const queryRunner = this.connection.createQueryRunner();
            try {
                const column = new TableColumn({
                    name: 'usageScene',
                    type: 'varchar(255)',
                    isNullable: false,
                    default: "'ONLINE'",
                });
                if (!(await queryRunner.hasColumn(tableName, column.name))) {
                    await queryRunner.addColumn(tableName, column);
                }
            } finally {
                await queryRunner.release();
            }
        } catch (e: any) {
            // 补列失败不阻塞启动，等待下次启动重试
            // eslint-disable-next-line no-console
            console.error('[AddCouponUsageSceneMigration] failed to ensure column:', e?.message);
        }
    }
}
```

- [ ] **Step 4: 导出迁移**

把 `d:\zhao\vendure\packages\coupon-plugin\src\migrations\index.ts` 整体改为：

```ts
// packages/coupon-plugin/src/migrations/index.ts
export { AddCouponFieldsMigration } from './add-coupon-fields';
export { CreateProductCouponBindingMigration } from './create-product-coupon-binding';
export { AddCouponIndexes20260919 } from './20260919-coupon-indexes';
export { AddCouponUsageSceneMigration } from './add-coupon-usage-scene';
```

- [ ] **Step 5: 在 plugin.ts 注册迁移**

修改 `d:\zhao\vendure\packages\coupon-plugin\src\plugin.ts`：

```ts
import {
    AddCouponFieldsMigration,
    AddCouponIndexes20260919,
    AddCouponUsageSceneMigration,
    CreateProductCouponBindingMigration,
} from './migrations';
```

`providers` 数组追加一项：

```ts
        AddCouponUsageSceneMigration,
```

- [ ] **Step 6: 类型检查 + 构建**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `pnpm build`
Expected: 无 TS 报错，生成 `lib/`；`lib/coupon-template.entity.d.ts` 中出现 `usageScene: CouponUsageScene;`

- [ ] **Step 7: 提交**

```bash
git -C d:/zhao/vendure add packages/coupon-plugin/src/types.ts packages/coupon-plugin/src/coupon-template.entity.ts packages/coupon-plugin/src/migrations/add-coupon-usage-scene.ts packages/coupon-plugin/src/migrations/index.ts packages/coupon-plugin/src/plugin.ts packages/coupon-plugin/lib
git -C d:/zhao/vendure commit -m "feat(coupon): 券模板新增 usageScene 场景标记（ONLINE/IN_STORE/ALL）"
```

---

## Task 2: 后端 — 纯函数 `computeInStoreBill`（TDD）

**Files:**
- Create: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.ts`
- Test: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { IN_STORE_REASON, computeInStoreBill } from './in-store-bill';

/** 构造最小模板（只取计算所需的三字段） */
function tpl(type: string, discountValue: number, minSpend = 0): any {
    return { type, discountValue, minSpend };
}

describe('computeInStoreBill 到店买单金额试算', () => {
    it('PERCENT：8 折券，原价 20000 分 → 优惠 4000，实付 16000', () => {
        expect(computeInStoreBill(tpl('PERCENT', 80), 20000)).toEqual({
            ok: true,
            originalAmount: 20000,
            discountAmount: 4000,
            finalAmount: 16000,
        });
    });

    it('PERCENT 边界：1 折 / 50 折 / 99 折', () => {
        expect(computeInStoreBill(tpl('PERCENT', 10), 10000)).toEqual({
            ok: true, originalAmount: 10000, discountAmount: 9000, finalAmount: 1000,
        });
        expect(computeInStoreBill(tpl('PERCENT', 50), 10000)).toEqual({
            ok: true, originalAmount: 10000, discountAmount: 5000, finalAmount: 5000,
        });
        expect(computeInStoreBill(tpl('PERCENT', 99), 10000)).toEqual({
            ok: true, originalAmount: 10000, discountAmount: 100, finalAmount: 9900,
        });
    });

    it('PERCENT：非整除金额四舍五入（13333 × 80% = 10666.4 → 10666）', () => {
        expect(computeInStoreBill(tpl('PERCENT', 80), 13333)).toEqual({
            ok: true, originalAmount: 13333, discountAmount: 2667, finalAmount: 10666,
        });
    });

    it('FIXED：直减 2000，原价 10000 → 实付 8000', () => {
        expect(computeInStoreBill(tpl('FIXED', 2000), 10000)).toEqual({
            ok: true, originalAmount: 10000, discountAmount: 2000, finalAmount: 8000,
        });
    });

    it('FULL：无门槛直减，语义同 FIXED', () => {
        expect(computeInStoreBill(tpl('FULL', 500), 3000)).toEqual({
            ok: true, originalAmount: 3000, discountAmount: 500, finalAmount: 2500,
        });
    });

    it('直减超过原价：优惠额封顶为原价，实付不为负', () => {
        expect(computeInStoreBill(tpl('FIXED', 5000), 3000)).toEqual({
            ok: true, originalAmount: 3000, discountAmount: 3000, finalAmount: 0,
        });
    });

    it('minSpend 门槛：未达标拒绝，刚好达标放行', () => {
        expect(computeInStoreBill(tpl('FIXED', 2000, 10000), 9999)).toEqual({
            ok: false, reason: IN_STORE_REASON.MIN_SPEND_NOT_MET,
        });
        expect(computeInStoreBill(tpl('FIXED', 2000, 10000), 10000)).toEqual({
            ok: true, originalAmount: 10000, discountAmount: 2000, finalAmount: 8000,
        });
    });

    it('FREE_SHIPPING 不支持到店买单', () => {
        expect(computeInStoreBill(tpl('FREE_SHIPPING', 0), 10000)).toEqual({
            ok: false, reason: IN_STORE_REASON.TYPE_NOT_SUPPORTED,
        });
    });

    it('非法原价（0 / 负数 / 小数 / NaN）一律拒绝', () => {
        for (const bad of [0, -1, 12.5, Number.NaN]) {
            expect(computeInStoreBill(tpl('FIXED', 100), bad as number)).toEqual({
                ok: false, reason: IN_STORE_REASON.INVALID_AMOUNT,
            });
        }
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run src/in-store-bill.spec.ts`
Expected: FAIL — `Failed to resolve import "./in-store-bill"`

- [ ] **Step 3: 写最小实现**

创建 `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.ts`：

```ts
/**
 * 到店买单：金额试算（纯函数）与失败原因码。
 * 金额单位统一为「分」（int）。本文件不依赖 DB / Nest，可直接单测。
 */
import { CouponTemplate } from './coupon-template.entity';

/** 核销失败原因码（quote 原样返回，redeem 转 UserInputError 文案） */
export const IN_STORE_REASON = {
    COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
    TEMPLATE_DISABLED: 'TEMPLATE_DISABLED',
    COUPON_NOT_UNUSED: 'COUPON_NOT_UNUSED',
    COUPON_EXPIRED: 'COUPON_EXPIRED',
    SCENE_MISMATCH: 'SCENE_MISMATCH',
    TENANT_MISMATCH: 'TENANT_MISMATCH',
    TYPE_NOT_SUPPORTED: 'TYPE_NOT_SUPPORTED',
    MIN_SPEND_NOT_MET: 'MIN_SPEND_NOT_MET',
    INVALID_AMOUNT: 'INVALID_AMOUNT',
} as const;

export type InStoreReason = (typeof IN_STORE_REASON)[keyof typeof IN_STORE_REASON];

/** 原因码 → 中文文案（admin 端 UserInputError 消息） */
export const IN_STORE_REASON_MESSAGES: Record<InStoreReason, string> = {
    COUPON_NOT_FOUND: '优惠券不存在',
    TEMPLATE_DISABLED: '该优惠券已下架',
    COUPON_NOT_UNUSED: '该优惠券已使用或当前不可用',
    COUPON_EXPIRED: '该优惠券已过期',
    SCENE_MISMATCH: '该券不支持到店买单',
    TENANT_MISMATCH: '该券不属于当前门店',
    TYPE_NOT_SUPPORTED: '该券类型不支持到店买单',
    MIN_SPEND_NOT_MET: '未达到该券使用门槛',
    INVALID_AMOUNT: '请输入有效的消费金额',
};

export type InStoreComputeResult =
    | { ok: true; originalAmount: number; discountAmount: number; finalAmount: number }
    | { ok: false; reason: InStoreReason };

/**
 * 按券规则计算到店买单金额。
 * - PERCENT：finalAmount = round(originalAmount * discountValue / 100)
 * - FIXED / FULL：discountAmount = min(discountValue, originalAmount)
 * - FREE_SHIPPING：到店买单不支持
 */
export function computeInStoreBill(
    template: Pick<CouponTemplate, 'type' | 'discountValue' | 'minSpend'>,
    originalAmount: number,
): InStoreComputeResult {
    if (!Number.isInteger(originalAmount) || originalAmount <= 0) {
        return { ok: false, reason: IN_STORE_REASON.INVALID_AMOUNT };
    }
    if (template.type === 'FREE_SHIPPING') {
        return { ok: false, reason: IN_STORE_REASON.TYPE_NOT_SUPPORTED };
    }
    const minSpend = template.minSpend ?? 0;
    if (minSpend > 0 && originalAmount < minSpend) {
        return { ok: false, reason: IN_STORE_REASON.MIN_SPEND_NOT_MET };
    }
    let discountAmount: number;
    if (template.type === 'PERCENT') {
        const finalAmount = Math.round((originalAmount * template.discountValue) / 100);
        discountAmount = originalAmount - finalAmount;
    } else {
        discountAmount = Math.min(template.discountValue, originalAmount);
    }
    const finalAmount = Math.max(0, originalAmount - discountAmount);
    return { ok: true, originalAmount, discountAmount, finalAmount };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run src/in-store-bill.spec.ts`
Expected: PASS — `9 passed`

- [ ] **Step 5: 提交**

```bash
git -C d:/zhao/vendure add packages/coupon-plugin/src/in-store-bill.ts packages/coupon-plugin/src/in-store-bill.spec.ts
git -C d:/zhao/vendure commit -m "feat(coupon): 到店买单金额试算纯函数 computeInStoreBill + 单测"
```

---

## Task 3: 后端 — `InStoreBill` 实体与建表迁移

**Files:**
- Create: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.entity.ts`
- Create: `d:\zhao\vendure\packages\coupon-plugin\src\migrations\create-in-store-bill.ts`
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\migrations\index.ts`
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\plugin.ts`

- [ ] **Step 1: 新建实体**

创建 `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.entity.ts`：

```ts
import { Column, Entity, Index } from 'typeorm';
import { DeepPartial, ID, VendureEntity } from '@vendure/core';

/**
 * 到店买单流水：平台不收款、不生成线上订单，仅记录「商户线下收款 + 用券优惠」留痕。
 * 冗余券名/顾客名/折扣等快照，模板或顾客改名后仍可追溯。
 */
@Entity()
@Index(['channelId', 'billedAt'])
export class InStoreBill extends VendureEntity {
    constructor(input?: DeepPartial<InStoreBill>) {
        super(input);
    }

    /** 核销发生的租户渠道 id（流水按此隔离） */
    @Column('bigint') channelId: ID;

    /** 被核销的用户券 id（customer_coupon.id） */
    @Column() customerCouponId: number;

    /** 券码快照 */
    @Column('varchar') @Index() couponCode: string;

    /** 券模板 id 快照 */
    @Column() couponTemplateId: number;

    /** 券名快照（模板改名后仍可追溯） */
    @Column('varchar', { nullable: true }) couponName?: string;

    /** 顾客 id */
    @Column() @Index() customerId: number;

    /** 顾客名快照 */
    @Column('varchar', { nullable: true }) customerName?: string;

    /** 顾客手机号快照 */
    @Column('varchar', { nullable: true }) customerPhone?: string;

    /** 券类型快照：PERCENT | FIXED | FULL */
    @Column('varchar') discountType: string;

    /** 券折扣值快照：PERCENT 为折数（80 = 8 折），FIXED/FULL 为分 */
    @Column() discountValue: number;

    /** 原价（分），商户手填 */
    @Column() originalAmount: number;

    /** 优惠额（分） */
    @Column() discountAmount: number;

    /** 实付（分） */
    @Column() finalAmount: number;

    /** 核销管理员 id */
    @Column() operatorId: number;

    /** 核销人名称快照 */
    @Column('varchar', { nullable: true }) operatorName?: string;

    /** 备注 */
    @Column('varchar', { nullable: true }) remark?: string;

    /** 核销（买单）时间 */
    @Column() billedAt: Date;
}
```

- [ ] **Step 2: 新建建表迁移**

创建 `d:\zhao\vendure\packages\coupon-plugin\src\migrations\create-in-store-bill.ts`：

```ts
// 确保 in_store_bill 表存在（生产 PostgreSQL 与本地开发 SQLite 都可能关闭 synchronize，
// 故此 migration 幂等建表；表/索引均 IF NOT EXISTS，出错只打日志不抛错，不阻塞启动，
// 等待下次启动重试）。列类型对齐实体：channelId 为 bigint，时间列 timestamptz，
// 金额列 integer（分），createdAt/updatedAt 默认 now()。
// id 自增写法 SQLite 与 PostgreSQL 不同（AUTOINCREMENT / SERIAL），按 driver 分支生成。
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';

@Injectable()
export class CreateInStoreBillMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    async onApplicationBootstrap() {
        try {
            const metadata = this.connection.getMetadata('InStoreBill');
            const tableName = metadata.tableName;
            const queryRunner = this.connection.createQueryRunner();
            try {
                const type = this.connection.driver.options.type;
                const isSqlite = type === 'sqljs' || type === 'better-sqlite3' || type === 'sqlite';
                const createTableSql = isSqlite
                    ? `
                    CREATE TABLE IF NOT EXISTS "${tableName}" (
                        "id" integer PRIMARY KEY AUTOINCREMENT,
                        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
                        "channelId" bigint NOT NULL,
                        "customerCouponId" integer NOT NULL,
                        "couponCode" varchar(255) NOT NULL,
                        "couponTemplateId" integer NOT NULL,
                        "couponName" varchar(255) NULL,
                        "customerId" integer NOT NULL,
                        "customerName" varchar(255) NULL,
                        "customerPhone" varchar(255) NULL,
                        "discountType" varchar(255) NOT NULL,
                        "discountValue" integer NOT NULL,
                        "originalAmount" integer NOT NULL,
                        "discountAmount" integer NOT NULL,
                        "finalAmount" integer NOT NULL,
                        "operatorId" integer NOT NULL,
                        "operatorName" varchar(255) NULL,
                        "remark" varchar(255) NULL,
                        "billedAt" datetime NOT NULL
                    )`
                    : `
                    CREATE TABLE IF NOT EXISTS "${tableName}" (
                        "id" SERIAL PRIMARY KEY,
                        "createdAt" timestamptz NOT NULL DEFAULT now(),
                        "updatedAt" timestamptz NOT NULL DEFAULT now(),
                        "channelId" bigint NOT NULL,
                        "customerCouponId" integer NOT NULL,
                        "couponCode" varchar(255) NOT NULL,
                        "couponTemplateId" integer NOT NULL,
                        "couponName" varchar(255) NULL,
                        "customerId" integer NOT NULL,
                        "customerName" varchar(255) NULL,
                        "customerPhone" varchar(255) NULL,
                        "discountType" varchar(255) NOT NULL,
                        "discountValue" integer NOT NULL,
                        "originalAmount" integer NOT NULL,
                        "discountAmount" integer NOT NULL,
                        "finalAmount" integer NOT NULL,
                        "operatorId" integer NOT NULL,
                        "operatorName" varchar(255) NULL,
                        "remark" varchar(255) NULL,
                        "billedAt" timestamptz NOT NULL
                    )`;
                await queryRunner.query(createTableSql);
                // 券码查询、顾客查询、租户+时间维度查询三个索引（幂等）
                await queryRunner.query(
                    `CREATE INDEX IF NOT EXISTS idx_in_store_bill_code ON "${tableName}" ("couponCode")`,
                );
                await queryRunner.query(
                    `CREATE INDEX IF NOT EXISTS idx_in_store_bill_customer ON "${tableName}" ("customerId")`,
                );
                await queryRunner.query(
                    `CREATE INDEX IF NOT EXISTS idx_in_store_bill_channel_time ON "${tableName}" ("channelId", "billedAt")`,
                );
            } finally {
                await queryRunner.release();
            }
        } catch (e: any) {
            // 建表失败不阻塞启动，等待下次启动重试
            // eslint-disable-next-line no-console
            console.error('[CreateInStoreBillMigration] failed to ensure table:', e?.message);
        }
    }
}
```

- [ ] **Step 3: 导出迁移**

`d:\zhao\vendure\packages\coupon-plugin\src\migrations\index.ts` 末尾追加：

```ts
export { CreateInStoreBillMigration } from './create-in-store-bill';
```

- [ ] **Step 4: plugin.ts 注册实体、迁移与（占位）服务**

修改 `d:\zhao\vendure\packages\coupon-plugin\src\plugin.ts`：

```ts
import {
    AddCouponFieldsMigration,
    AddCouponIndexes20260919,
    AddCouponUsageSceneMigration,
    CreateInStoreBillMigration,
    CreateProductCouponBindingMigration,
} from './migrations';
import { InStoreBill } from './in-store-bill.entity';
```

`entities` 数组改为：

```ts
    entities: [CouponTemplate, CustomerCoupon, ProductCouponBinding, InStoreBill],
```

`providers` 数组追加：

```ts
        CreateInStoreBillMigration,
```

- [ ] **Step 5: 构建验证**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `pnpm build`
Expected: 无 TS 报错；`lib/in-store-bill.entity.js` 与 `lib/migrations/create-in-store-bill.js` 生成

- [ ] **Step 6: 提交**

```bash
git -C d:/zhao/vendure add packages/coupon-plugin/src/in-store-bill.entity.ts packages/coupon-plugin/src/migrations/create-in-store-bill.ts packages/coupon-plugin/src/migrations/index.ts packages/coupon-plugin/src/plugin.ts packages/coupon-plugin/lib
git -C d:/zhao/vendure commit -m "feat(coupon): 新增到店买单流水表 in_store_bill（实体 + 幂等建表迁移）"
```

---

## Task 4: 后端 — `InStoreBillService.locate/quote` 校验链与试算（TDD）

**Files:**
- Create: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.ts`
- Test: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.spec.ts`
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\coupon.service.ts`（`templateBelongsToChannel` 提为 public）

- [ ] **Step 1: 把渠道归属判断提为 public**

修改 `d:\zhao\vendure\packages\coupon-plugin\src\coupon.service.ts` 第 554 行附近：

```ts
    /** 模板渠道归属校验：channels 为空（不限渠道）→ true；否则要求包含当前渠道（供到店买单复用） */
    public templateBelongsToChannel(ctx: RequestContext, tpl: CouponTemplate): boolean {
```

（仅改 `private` → `public` 与注释，方法体不变。）

- [ ] **Step 2: 写失败测试（locate 分支 + quote）**

创建 `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Administrator, Customer } from '@vendure/core';

import { InStoreBill } from './in-store-bill.entity';
import { InStoreBillService } from './in-store-bill.service';
import { IN_STORE_REASON } from './in-store-bill';
import { CustomerCoupon } from './customer-coupon.entity';

/** 构造一张可用到店买单券模板 */
function tplStub(over: Record<string, any> = {}): any {
    return {
        id: 7,
        type: 'PERCENT',
        discountValue: 80,
        minSpend: 0,
        enabled: true,
        shopId: null as number | null,
        name: '到店 8 折',
        channels: [{ id: 3 }],
        ...over,
    };
}

function ccStub(over: Record<string, any> = {}): any {
    return {
        id: 11,
        code: 'C-ABCD-EFGH',
        customerId: 5,
        templateId: 7,
        status: 'UNUSED',
        expiredAt: null as Date | null,
        template: tplStub(),
        ...over,
    };
}

describe('InStoreBillService.quote', () => {
    const ctx: any = { channelId: 3, activeUserId: 99, languageCode: 'zh_Hans' };

    let ccRepo: any;
    let billRepo: any;
    let customerRepo: any;
    let adminRepo: any;
    let connection: any;
    let couponService: any;
    let service: InStoreBillService;

    beforeEach(() => {
        ccRepo = { findOne: vi.fn(), createQueryBuilder: vi.fn() };
        billRepo = { save: vi.fn(async (b: any) => ({ id: 1, ...b })), createQueryBuilder: vi.fn() };
        customerRepo = { findOne: vi.fn(async () => ({ firstName: '三', lastName: '张', phoneNumber: '13800000000', emailAddress: 'a@b.c' })) };
        adminRepo = { findOne: vi.fn(async () => ({ firstName: '掌', lastName: '柜', emailAddress: 'op@shop.c' })) };
        connection = {
            getRepository: vi.fn((_c: any, entity: any) => {
                if (entity === CustomerCoupon) return ccRepo;
                if (entity === InStoreBill) return billRepo;
                if (entity === Customer) return customerRepo;
                if (entity === Administrator) return adminRepo;
                throw new Error(`unknown entity: ${entity?.name}`);
            }),
        };
        couponService = {
            templateBelongsToChannel: vi.fn(() => true),
            assertManagedByShop: vi.fn(async () => undefined),
        };
        service = new InStoreBillService(connection, couponService);
    });

    it('券码为空 → COUPON_NOT_FOUND，不查库', async () => {
        const r = await service.quote(ctx, '   ', 10000);
        expect(r).toMatchObject({ ok: false, reason: IN_STORE_REASON.COUPON_NOT_FOUND });
        expect(ccRepo.findOne).not.toHaveBeenCalled();
    });

    it('券不存在 → COUPON_NOT_FOUND', async () => {
        ccRepo.findOne.mockResolvedValueOnce(null);
        const r = await service.quote(ctx, 'C-NOPE-0001', 10000);
        expect(r).toMatchObject({ ok: false, reason: IN_STORE_REASON.COUPON_NOT_FOUND });
    });

    it('模板停用 → TEMPLATE_DISABLED', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ enabled: false }) }));
        const r = await service.quote(ctx, 'C-ABCD-EFGH', 10000);
        expect(r).toMatchObject({ ok: false, reason: IN_STORE_REASON.TEMPLATE_DISABLED });
    });

    it('券已使用 → COUPON_NOT_UNUSED', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ status: 'USED' }));
        const r = await service.quote(ctx, 'C-ABCD-EFGH', 10000);
        expect(r).toMatchObject({ ok: false, reason: IN_STORE_REASON.COUPON_NOT_UNUSED });
    });

    it('券已过期 → COUPON_EXPIRED', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ expiredAt: new Date(Date.now() - 1000) }));
        const r = await service.quote(ctx, 'C-ABCD-EFGH', 10000);
        expect(r).toMatchObject({ ok: false, reason: IN_STORE_REASON.COUPON_EXPIRED });
    });

    it('场景为 ONLINE → SCENE_MISMATCH', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ usageScene: 'ONLINE' }) }));
        const r = await service.quote(ctx, 'C-ABCD-EFGH', 10000);
        expect(r).toMatchObject({ ok: false, reason: IN_STORE_REASON.SCENE_MISMATCH });
    });

    it('场景为 ALL 放行', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ usageScene: 'ALL' }) }));
        const r = await service.quote(ctx, 'C-ABCD-EFGH', 10000);
        expect(r).toMatchObject({ ok: true, finalAmount: 8000 });
    });

    it('跨渠道 → TENANT_MISMATCH（渠道判断返回 false）', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ usageScene: 'IN_STORE' }) }));
        couponService.templateBelongsToChannel.mockReturnValueOnce(false);
        const r = await service.quote(ctx, 'C-ABCD-EFGH', 10000);
        expect(r).toMatchObject({ ok: false, reason: IN_STORE_REASON.TENANT_MISMATCH });
    });

    it('非本店券（assertManagedByShop 抛错）→ TENANT_MISMATCH', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ usageScene: 'IN_STORE', shopId: 88 }) }));
        couponService.assertManagedByShop.mockRejectedValueOnce(new Error('COUPON_NOT_OWNED'));
        const r = await service.quote(ctx, 'C-ABCD-EFGH', 10000);
        expect(r).toMatchObject({ ok: false, reason: IN_STORE_REASON.TENANT_MISMATCH });
    });

    it('originalAmount 省略 → 只回券信息，金额字段为 null', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ usageScene: 'IN_STORE' }) }));
        const r = await service.quote(ctx, 'C-ABCD-EFGH');
        expect(r).toMatchObject({
            ok: true,
            couponCode: 'C-ABCD-EFGH',
            couponName: '到店 8 折',
            discountType: 'PERCENT',
            discountValue: 80,
            finalAmount: null,
        });
        expect(r.customerName).toBe('三 张');
        expect(r.customerPhone).toBe('13800000000');
    });

    it('试算成功：8 折券原价 20000 → 优惠 4000 / 实付 16000（并回券信息）', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ usageScene: 'IN_STORE' }) }));
        const r = await service.quote(ctx, 'C-ABCD-EFGH', 20000);
        expect(r).toMatchObject({
            ok: true, originalAmount: 20000, discountAmount: 4000, finalAmount: 16000, couponName: '到店 8 折',
        });
    });

    it('未达门槛 → ok=false + MIN_SPEND_NOT_MET，但仍带回券信息（供页面展示券卡）', async () => {
        ccRepo.findOne.mockResolvedValueOnce(
            ccStub({ template: tplStub({ usageScene: 'IN_STORE', minSpend: 10000 }) }),
        );
        const r = await service.quote(ctx, 'C-ABCD-EFGH', 5000);
        expect(r).toMatchObject({ ok: false, reason: IN_STORE_REASON.MIN_SPEND_NOT_MET, couponName: '到店 8 折' });
        expect(r.finalAmount).toBeNull();
    });

    it('查询券时按 code 且带 template.channels 关系', async () => {
        ccRepo.findOne.mockResolvedValueOnce(null);
        await service.quote(ctx, 'C-ABCD-EFGH', 10000);
        expect(ccRepo.findOne).toHaveBeenCalledWith({
            where: { code: 'C-ABCD-EFGH' },
            relations: { template: { channels: true } },
        });
    });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run src/in-store-bill.service.spec.ts`
Expected: FAIL — `Failed to resolve import "./in-store-bill.service"`

- [ ] **Step 4: 实现 service 的 locate 与 quote**

创建 `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import {
    Administrator,
    Customer,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { CouponService } from './coupon.service';
import { CouponTemplate } from './coupon-template.entity';
import { CustomerCoupon } from './customer-coupon.entity';
import { InStoreBill } from './in-store-bill.entity';
import {
    IN_STORE_REASON,
    IN_STORE_REASON_MESSAGES,
    InStoreReason,
    computeInStoreBill,
} from './in-store-bill';
import { localizeText } from './localize';

/** 核销表单试算返回（金额单位：分；originalAmount 省略时金额字段为 null，仅回券信息） */
export interface InStoreBillQuote {
    ok: boolean;
    reason?: string | null;
    couponCode?: string | null;
    couponName?: string | null;
    discountType?: string | null;
    discountValue?: number | null;
    minSpend?: number | null;
    originalAmount?: number | null;
    discountAmount?: number | null;
    finalAmount?: number | null;
    customerName?: string | null;
    customerPhone?: string | null;
    expiresAt?: Date | null;
}

/** 流水查询条件 */
export interface InStoreBillListOptions {
    skip?: number;
    take?: number;
    couponCode?: string;
    from?: Date;
    to?: Date;
}

type LocateResult =
    | { ok: true; cc: CustomerCoupon; tpl: CouponTemplate }
    | { ok: false; reason: InStoreReason };

@Injectable()
export class InStoreBillService {
    constructor(
        private connection: TransactionalConnection,
        private couponService: CouponService,
    ) {}

    /**
     * 券码 → 可用到店买单券（校验顺序见 spec §7）：
     * 存在 → 模板启用 → 未使用 → 未过期 → 场景含 IN_STORE → 渠道归属 → 属店权限。
     * 失败不抛错，返回原因码（quote 用；redeem 再转为 UserInputError）。
     */
    private async locate(ctx: RequestContext, code: string): Promise<LocateResult> {
        const trimmed = (code ?? '').trim();
        if (!trimmed) {
            return { ok: false, reason: IN_STORE_REASON.COUPON_NOT_FOUND };
        }
        const cc = await this.connection.getRepository(ctx, CustomerCoupon).findOne({
            where: { code: trimmed },
            relations: { template: { channels: true } },
        });
        if (!cc) {
            return { ok: false, reason: IN_STORE_REASON.COUPON_NOT_FOUND };
        }
        const tpl = cc.template;
        if (!tpl || !tpl.enabled) {
            return { ok: false, reason: IN_STORE_REASON.TEMPLATE_DISABLED };
        }
        if (cc.status !== 'UNUSED') {
            return { ok: false, reason: IN_STORE_REASON.COUPON_NOT_UNUSED };
        }
        if (cc.expiredAt && new Date(cc.expiredAt).getTime() <= Date.now()) {
            return { ok: false, reason: IN_STORE_REASON.COUPON_EXPIRED };
        }
        const scene = tpl.usageScene ?? 'ONLINE';
        if (scene !== 'IN_STORE' && scene !== 'ALL') {
            return { ok: false, reason: IN_STORE_REASON.SCENE_MISMATCH };
        }
        if (!this.couponService.templateBelongsToChannel(ctx, tpl)) {
            return { ok: false, reason: IN_STORE_REASON.TENANT_MISMATCH };
        }
        try {
            await this.couponService.assertManagedByShop(ctx, tpl.shopId);
        } catch {
            return { ok: false, reason: IN_STORE_REASON.TENANT_MISMATCH };
        }
        return { ok: true, cc, tpl };
    }

    /** 核销表单试算：originalAmount 省略 → 仅回券信息；否则回试算金额 */
    async quote(
        ctx: RequestContext,
        code: string,
        originalAmount?: number | null,
    ): Promise<InStoreBillQuote> {
        const located = await this.locate(ctx, code);
        if (!located.ok) {
            return { ok: false, reason: located.reason };
        }
        const { cc, tpl } = located;
        const info = await this.loadCustomerInfo(ctx, cc.customerId);
        const base: InStoreBillQuote = {
            ok: true,
            reason: null,
            couponCode: cc.code,
            couponName: localizeText(tpl.name, ctx.languageCode),
            discountType: tpl.type,
            discountValue: tpl.discountValue,
            minSpend: tpl.minSpend ?? 0,
            customerName: info.name ?? null,
            customerPhone: info.phone ?? null,
            expiresAt: cc.expiredAt ?? null,
            originalAmount: null,
            discountAmount: null,
            finalAmount: null,
        };
        if (originalAmount == null) {
            return base;
        }
        const computed = computeInStoreBill(tpl, originalAmount);
        if (!computed.ok) {
            // 保留券信息，便于页面同时展示券卡与金额校验提示
            return { ...base, ok: false, reason: computed.reason };
        }
        return {
            ...base,
            originalAmount: computed.originalAmount,
            discountAmount: computed.discountAmount,
            finalAmount: computed.finalAmount,
        };
    }

    /** 顾客姓名/手机号快照（查询失败不阻断核销） */
    private async loadCustomerInfo(
        ctx: RequestContext,
        customerId: number,
    ): Promise<{ name?: string; phone?: string }> {
        try {
            const c = await this.connection.getRepository(ctx, Customer).findOne({
                where: { id: customerId } as any,
            });
            if (!c) return {};
            const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.emailAddress || undefined;
            return { name, phone: c.phoneNumber ?? undefined };
        } catch {
            return {};
        }
    }

    /** 核销人名称快照（查询失败不阻断核销） */
    private async resolveOperatorName(ctx: RequestContext): Promise<string | undefined> {
        try {
            const admin = await this.connection.getRepository(ctx, Administrator).findOne({
                where: { user: { id: ctx.activeUserId } } as any,
            });
            if (!admin) return undefined;
            return [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.emailAddress || undefined;
        } catch {
            return undefined;
        }
    }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run src/in-store-bill.service.spec.ts`
Expected: PASS — `13 passed`

- [ ] **Step 6: 提交**

```bash
git -C d:/zhao/vendure add packages/coupon-plugin/src/in-store-bill.service.ts packages/coupon-plugin/src/in-store-bill.service.spec.ts packages/coupon-plugin/src/coupon.service.ts
git -C d:/zhao/vendure commit -m "feat(coupon): 到店买单校验链与试算 quote（含单测）"
```

---

## Task 5: 后端 — `redeem` 幂等核销（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.ts`
- Test: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.spec.ts`（追加 describe）

- [ ] **Step 1: 追加失败测试**

在 `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.spec.ts` 末尾追加：

```ts
describe('InStoreBillService.redeem', () => {
    const ctx: any = { channelId: 3, activeUserId: 99, languageCode: 'zh_Hans' };

    let ccRepo: any;
    let billRepo: any;
    let updateQb: any;
    let connection: any;
    let couponService: any;
    let service: InStoreBillService;

    beforeEach(() => {
        updateQb = {
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi.fn(async () => ({ affected: 1 })),
        };
        ccRepo = { findOne: vi.fn(), createQueryBuilder: vi.fn(() => updateQb) };
        billRepo = { save: vi.fn(async (b: any) => ({ id: 21, ...b })) };
        connection = {
            getRepository: vi.fn((_c: any, entity: any) => {
                if (entity === CustomerCoupon) return ccRepo;
                if (entity === InStoreBill) return billRepo;
                if (entity === Customer) return { findOne: vi.fn(async () => ({ firstName: '三', lastName: '张', phoneNumber: '13800000000' })) };
                if (entity === Administrator) return { findOne: vi.fn(async () => ({ firstName: '掌', lastName: '柜' })) };
                throw new Error(`unknown entity: ${entity?.name}`);
            }),
        };
        couponService = {
            templateBelongsToChannel: vi.fn(() => true),
            assertManagedByShop: vi.fn(async () => undefined),
        };
        service = new InStoreBillService(connection, couponService);
    });

    it('成功核销：条件更新置 USED → 写流水（含券/顾客/核销人/金额快照）', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ usageScene: 'IN_STORE' }) }));
        const bill: any = await service.redeem(ctx, ' C-ABCD-EFGH ', 20000, '老客户');

        expect(updateQb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'USED' }));
        expect(updateQb.where).toHaveBeenCalledWith('id = :id AND status = :unused', {
            id: 11,
            unused: 'UNUSED',
        });
        expect(bill).toMatchObject({
            id: 21,
            channelId: 3,
            customerCouponId: 11,
            couponCode: 'C-ABCD-EFGH',
            couponTemplateId: 7,
            couponName: '到店 8 折',
            customerId: 5,
            customerName: '三 张',
            customerPhone: '13800000000',
            discountType: 'PERCENT',
            discountValue: 80,
            originalAmount: 20000,
            discountAmount: 4000,
            finalAmount: 16000,
            operatorId: 99,
            operatorName: '掌 柜',
            remark: '老客户',
        });
        expect(bill.billedAt).toBeInstanceOf(Date);
    });

    it('券不存在 → 抛 UserInputError（优惠券不存在），不写流水', async () => {
        ccRepo.findOne.mockResolvedValueOnce(null);
        await expect(service.redeem(ctx, 'C-NOPE-0001', 20000)).rejects.toThrow('优惠券不存在');
        expect(billRepo.save).not.toHaveBeenCalled();
        expect(updateQb.execute).not.toHaveBeenCalled();
    });

    it('未达门槛 → 抛 UserInputError，不置 USED、不写流水', async () => {
        ccRepo.findOne.mockResolvedValueOnce(
            ccStub({ template: tplStub({ usageScene: 'IN_STORE', minSpend: 10000 }) }),
        );
        await expect(service.redeem(ctx, 'C-ABCD-EFGH', 5000)).rejects.toThrow('未达到该券使用门槛');
        expect(updateQb.execute).not.toHaveBeenCalled();
        expect(billRepo.save).not.toHaveBeenCalled();
    });

    it('并发/重复核销（affectedRows=0）→ 抛 COUPON_NOT_UNUSED 文案，不写流水', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ usageScene: 'IN_STORE' }) }));
        updateQb.execute.mockResolvedValueOnce({ affected: 0 });
        await expect(service.redeem(ctx, 'C-ABCD-EFGH', 20000)).rejects.toThrow('该优惠券已使用或当前不可用');
        expect(billRepo.save).not.toHaveBeenCalled();
    });

    it('FREE_SHIPPING 券 → 抛类型不支持文案', async () => {
        ccRepo.findOne.mockResolvedValueOnce(
            ccStub({ template: tplStub({ usageScene: 'IN_STORE', type: 'FREE_SHIPPING' }) }),
        );
        await expect(service.redeem(ctx, 'C-ABCD-EFGH', 20000)).rejects.toThrow('该券类型不支持到店买单');
    });

    it('非法原价（0）→ 抛金额文案', async () => {
        ccRepo.findOne.mockResolvedValueOnce(ccStub({ template: tplStub({ usageScene: 'IN_STORE' }) }));
        await expect(service.redeem(ctx, 'C-ABCD-EFGH', 0)).rejects.toThrow('请输入有效的消费金额');
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run src/in-store-bill.service.spec.ts`
Expected: FAIL — `service.redeem is not a function`

- [ ] **Step 3: 实现 redeem**

在 `InStoreBillService` 的 `quote` 方法之后（`loadCustomerInfo` 之前）插入：

```ts
    /**
     * 到店买单核销：校验 → 原子占用（仅 UNUSED 可置 USED）→ 写流水。
     * 需在 @Transaction() 内调用。
     */
    async redeem(
        ctx: RequestContext,
        code: string,
        originalAmount: number,
        remark?: string,
    ): Promise<InStoreBill> {
        const located = await this.locate(ctx, code);
        if (!located.ok) {
            throw new UserInputError(IN_STORE_REASON_MESSAGES[located.reason]);
        }
        const { cc, tpl } = located;
        const computed = computeInStoreBill(tpl, originalAmount);
        if (!computed.ok) {
            throw new UserInputError(IN_STORE_REASON_MESSAGES[computed.reason]);
        }
        // 并发防护：状态条件更新，affectedRows=0 说明已被其它请求核销
        const consume = await this.connection
            .getRepository(ctx, CustomerCoupon)
            .createQueryBuilder()
            .update()
            .set({ status: 'USED', usedAt: new Date() })
            .where('id = :id AND status = :unused', { id: cc.id, unused: 'UNUSED' })
            .execute();
        if ((consume.affected ?? 0) === 0) {
            throw new UserInputError(IN_STORE_REASON_MESSAGES[IN_STORE_REASON.COUPON_NOT_UNUSED]);
        }

        const info = await this.loadCustomerInfo(ctx, cc.customerId);
        const operatorName = await this.resolveOperatorName(ctx);
        const bill = new InStoreBill({
            channelId: ctx.channelId,
            customerCouponId: cc.id as number,
            couponCode: cc.code,
            couponTemplateId: tpl.id as number,
            couponName: localizeText(tpl.name, ctx.languageCode),
            customerId: cc.customerId,
            customerName: info.name,
            customerPhone: info.phone,
            discountType: tpl.type,
            discountValue: tpl.discountValue,
            originalAmount: computed.originalAmount,
            discountAmount: computed.discountAmount,
            finalAmount: computed.finalAmount,
            operatorId: ctx.activeUserId as number,
            operatorName,
            remark: remark?.trim() || undefined,
            billedAt: new Date(),
        });
        return this.connection.getRepository(ctx, InStoreBill).save(bill);
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run src/in-store-bill.service.spec.ts`
Expected: PASS — `19 passed`

- [ ] **Step 5: 提交**

```bash
git -C d:/zhao/vendure add packages/coupon-plugin/src/in-store-bill.service.ts packages/coupon-plugin/src/in-store-bill.service.spec.ts
git -C d:/zhao/vendure commit -m "feat(coupon): 到店买单核销 redeem（条件更新幂等 + 流水落库）"
```

---

## Task 6: 后端 — `list` 与 `summary`（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.ts`
- Test: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.spec.ts`（追加 describe）

- [ ] **Step 1: 追加失败测试**

在 `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill.service.spec.ts` 末尾追加：

```ts
describe('InStoreBillService.list / summary', () => {
    const ctx: any = { channelId: 3, activeUserId: 99, languageCode: 'zh_Hans' };

    let listQb: any;
    let connection: any;
    let service: InStoreBillService;

    beforeEach(() => {
        listQb = {
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            addOrderBy: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            take: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            addSelect: vi.fn().mockReturnThis(),
            getManyAndCount: vi.fn(async () => [[{ id: 1 }], 1]),
            getRawOne: vi.fn(async () => ({ count: '3', originalTotal: '30000', discountTotal: '6000', finalTotal: '24000' })),
        };
        connection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => listQb) })),
        };
        service = new InStoreBillService(connection, {} as any);
    });

    it('list：强制按 ctx.channelId 过滤，默认时间倒序 + 分页上限 200', async () => {
        await service.list(ctx, { skip: 0, take: 500 });
        expect(listQb.where).toHaveBeenCalledWith('b.channelId = :channelId', { channelId: 3 });
        expect(listQb.orderBy).toHaveBeenCalledWith('b.billedAt', 'DESC');
        expect(listQb.addOrderBy).toHaveBeenCalledWith('b.id', 'DESC');
        expect(listQb.take).toHaveBeenCalledWith(200);
    });

    it('list：券码 / 时间区间筛选生效', async () => {
        const from = new Date('2026-10-01T00:00:00.000Z');
        const to = new Date('2026-10-31T23:59:59.999Z');
        await service.list(ctx, { couponCode: 'C-ABCD-EFGH', from, to });
        expect(listQb.andWhere).toHaveBeenCalledWith('b.couponCode = :code', { code: 'C-ABCD-EFGH' });
        expect(listQb.andWhere).toHaveBeenCalledWith('b.billedAt >= :from', { from });
        expect(listQb.andWhere).toHaveBeenCalledWith('b.billedAt <= :to', { to });
    });

    it('summary：字符串聚合值转数字，并按渠道 isolate', async () => {
        const s = await service.summary(ctx, {});
        expect(listQb.where).toHaveBeenCalledWith('b.channelId = :channelId', { channelId: 3 });
        expect(s).toEqual({ count: 3, originalTotal: 30000, discountTotal: 6000, finalTotal: 24000 });
    });

    it('summary：空结果回退 0', async () => {
        listQb.getRawOne.mockResolvedValueOnce({ count: null, originalTotal: null, discountTotal: null, finalTotal: null });
        expect(await service.summary(ctx, {})).toEqual({
            count: 0, originalTotal: 0, discountTotal: 0, finalTotal: 0,
        });
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run src/in-store-bill.service.spec.ts`
Expected: FAIL — `service.list is not a function`

- [ ] **Step 3: 实现 list / summary**

在 `redeem` 之后插入：

```ts
    /** 流水列表：按当前渠道强制隔离 + 券码/时间筛选 + 时间倒序分页 */
    async list(
        ctx: RequestContext,
        options?: InStoreBillListOptions,
    ): Promise<{ items: InStoreBill[]; totalItems: number }> {
        const qb = this.buildBillsQuery(ctx, options);
        qb.orderBy('b.billedAt', 'DESC').addOrderBy('b.id', 'DESC');
        qb.skip(Math.max(0, options?.skip ?? 0)).take(Math.min(options?.take ?? 20, 200));
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    /** 流水汇总：笔数 / 原价合计 / 优惠合计 / 实收合计（金额单位：分） */
    async summary(
        ctx: RequestContext,
        options?: { from?: Date; to?: Date },
    ): Promise<{ count: number; originalTotal: number; discountTotal: number; finalTotal: number }> {
        const qb = this.buildBillsQuery(ctx, options);
        const raw = await qb
            .select('COUNT(*)', 'count')
            .addSelect('COALESCE(SUM(b.originalAmount), 0)', 'originalTotal')
            .addSelect('COALESCE(SUM(b.discountAmount), 0)', 'discountTotal')
            .addSelect('COALESCE(SUM(b.finalAmount), 0)', 'finalTotal')
            .getRawOne();
        return {
            count: Number(raw?.count ?? 0),
            originalTotal: Number(raw?.originalTotal ?? 0),
            discountTotal: Number(raw?.discountTotal ?? 0),
            finalTotal: Number(raw?.finalTotal ?? 0),
        };
    }

    /** 流水查询基座：渠道隔离 + 可选筛选（list / summary 共用） */
    private buildBillsQuery(ctx: RequestContext, options?: InStoreBillListOptions & { take?: number }) {
        const qb = this.connection
            .getRepository(ctx, InStoreBill)
            .createQueryBuilder('b')
            .where('b.channelId = :channelId', { channelId: Number(ctx.channelId) });
        if (options?.couponCode) {
            qb.andWhere('b.couponCode = :code', { code: options.couponCode.trim() });
        }
        if (options?.from) {
            qb.andWhere('b.billedAt >= :from', { from: options.from });
        }
        if (options?.to) {
            qb.andWhere('b.billedAt <= :to', { to: options.to });
        }
        return qb;
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run src/in-store-bill.service.spec.ts`
Expected: PASS — `23 passed`

- [ ] **Step 5: 提交**

```bash
git -C d:/zhao/vendure add packages/coupon-plugin/src/in-store-bill.service.ts packages/coupon-plugin/src/in-store-bill.service.spec.ts
git -C d:/zhao/vendure commit -m "feat(coupon): 到店买单流水列表与汇总查询（渠道隔离）"
```

---

## Task 7: 后端 — GraphQL SDL、resolver 与全链路 e2e

**Files:**
- Create: `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\plugin.ts`
- Create: `d:\zhao\vendure\packages\coupon-plugin\e2e\in-store-bill.e2e-spec.ts`

- [ ] **Step 1: 写失败 e2e**

创建 `d:\zhao\vendure\packages\coupon-plugin\e2e\in-store-bill.e2e-spec.ts`：

```ts
import { createTestEnvironment, registerInitializer, SqljsInitializer } from '@vendure/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import gql from 'graphql-tag';
import { mergeConfig } from '@vendure/core';
import { initialData } from '../../../e2e-common/e2e-initial-data';
import { TEST_SETUP_TIMEOUT_MS, testConfig } from '../../../e2e-common/test-config';
import { CouponPlugin } from '../src/plugin';
import { ShopPlugin } from '../../shop-plugin/src/plugin';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

describe('CouponPlugin · 到店买单（领券 → 试算 → 核销 → 流水）', () => {
    const { server, adminClient, shopClient } = createTestEnvironment(
        mergeConfig(testConfig(), { plugins: [CouponPlugin.init(), ShopPlugin.init()] }),
    );

    async function createTemplate(input: Record<string, unknown>): Promise<string> {
        const res = (await adminClient.query(gql`
            mutation {
                createCouponTemplate(input: {
                    name: "${input.name}"
                    type: ${input.type}
                    discountValue: ${input.discountValue}
                    minSpend: ${input.minSpend ?? 0}
                    usageScene: ${input.usageScene}
                    totalCount: 0
                    perUserLimit: 0
                    enabled: true
                }) { id usageScene }
            }
        `)) as any;
        expect(res.createCouponTemplate.usageScene).toBe(input.usageScene);
        return res.createCouponTemplate.id;
    }

    async function claim(templateId: string): Promise<any> {
        const res = (await shopClient.query(gql`
            mutation { claimCoupon(templateId: "${templateId}") { id code status } }
        `)) as any;
        return res.claimCoupon;
    }

    async function quote(code: string, originalAmount?: number | null): Promise<any> {
        const arg = originalAmount == null ? '' : `, originalAmount: ${originalAmount}`;
        const res = (await adminClient.query(gql`
            query { inStoreBillQuote(code: "${code}"${arg}) {
                ok reason couponCode couponName discountType discountValue minSpend
                originalAmount discountAmount finalAmount customerName customerPhone expiresAt
            } }
        `)) as any;
        return res.inStoreBillQuote;
    }

    async function redeem(code: string, originalAmount: number, remark?: string): Promise<any> {
        const res = (await adminClient.query(gql`
            mutation { inStoreBillRedeem(code: "${code}", originalAmount: ${originalAmount}${
                remark ? `, remark: "${remark}"` : ''
            }) {
                id couponCode couponName customerId customerName discountType discountValue
                originalAmount discountAmount finalAmount operatorId operatorName remark billedAt
            } }
        `)) as any;
        return res.inStoreBillRedeem;
    }

    beforeAll(async () => {
        await server.init({
            initialData,
            productsCsvPath: path.join(__dirname, '../../core/e2e/fixtures/e2e-products-minimal.csv'),
            customerCount: 2,
        });
        await adminClient.asSuperAdmin();
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
    }, TEST_SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await server.destroy();
    });

    it('全链路：IN_STORE 券 → 领券 → 试算 8 折 → 核销落流水 → 券置 USED → 流水可见', async () => {
        const tplId = await createTemplate({
            name: '到店 8 折',
            type: 'PERCENT',
            discountValue: 80,
            usageScene: 'IN_STORE',
        });
        const cc = await claim(tplId);
        expect(cc.status).toBe('UNUSED');

        // 试算：仅券信息（不传原价）
        const info = await quote(cc.code);
        expect(info.ok).toBe(true);
        expect(info.finalAmount).toBeNull();
        expect(info.discountValue).toBe(80);

        // 试算：原价 20000 分 → 优惠 4000 / 实付 16000
        const q = await quote(cc.code, 20000);
        expect(q).toMatchObject({ ok: true, originalAmount: 20000, discountAmount: 4000, finalAmount: 16000 });

        // 核销
        const bill = await redeem(cc.code, 20000, 'e2e');
        expect(bill).toMatchObject({
            couponCode: cc.code,
            couponName: '到店 8 折',
            discountType: 'PERCENT',
            discountValue: 80,
            originalAmount: 20000,
            discountAmount: 4000,
            finalAmount: 16000,
            remark: 'e2e',
        });
        expect(bill.billedAt).toBeTruthy();

        // 券已置 USED
        const used = (await shopClient.query(gql`
            query { myCoupons(status: USED) { code status } }
        `)) as any;
        expect(used.myCoupons.some((c: any) => c.code === cc.code)).toBe(true);

        // 流水汇总 + 列表可见
        const sum = (await adminClient.query(gql`
            query { inStoreBillSummary { count originalTotal discountTotal finalTotal } }
        `)) as any;
        expect(sum.inStoreBillSummary).toMatchObject({
            count: 1, originalTotal: 20000, discountTotal: 4000, finalTotal: 16000,
        });
        const list = (await adminClient.query(gql`
            query { inStoreBills(options: { take: 10 }) { totalItems items { id couponCode finalAmount } } }
        `)) as any;
        expect(list.inStoreBills.totalItems).toBe(1);
        expect(list.inStoreBills.items[0].couponCode).toBe(cc.code);
    });

    it('重复核销同一券码 → 报错且不新增流水', async () => {
        const tplId = await createTemplate({
            name: '到店 9 折',
            type: 'PERCENT',
            discountValue: 90,
            usageScene: 'IN_STORE',
        });
        const cc = await claim(tplId);
        await redeem(cc.code, 10000);
        await expect(redeem(cc.code, 10000)).rejects.toThrow(/已使用|不可用/);

        const sum = (await adminClient.query(gql`
            query { inStoreBillSummary { count } }
        `)) as any;
        expect(sum.inStoreBillSummary.count).toBe(2);
    });

    it('ONLINE 场景券不可到店核销 → ok=false SCENE_MISMATCH', async () => {
        const tplId = await createTemplate({
            name: '线上满减',
            type: 'FIXED',
            discountValue: 2000,
            usageScene: 'ONLINE',
        });
        const cc = await claim(tplId);
        const q = await quote(cc.code, 10000);
        expect(q).toMatchObject({ ok: false, reason: 'SCENE_MISMATCH' });
        await expect(redeem(cc.code, 10000)).rejects.toThrow(/不支持到店买单/);
    });

    it('未达门槛 → quote ok=false MIN_SPEND_NOT_MET；核销被拒', async () => {
        const tplId = await createTemplate({
            name: '到店满100减20',
            type: 'FIXED',
            discountValue: 2000,
            minSpend: 10000,
            usageScene: 'IN_STORE',
        });
        const cc = await claim(tplId);
        const q = await quote(cc.code, 5000);
        expect(q).toMatchObject({ ok: false, reason: 'MIN_SPEND_NOT_MET' });
        await expect(redeem(cc.code, 5000)).rejects.toThrow(/门槛/);
    });

    it('shop-api 暴露 CouponTemplate.usageScene（C 端据此展示券码入口）', async () => {
        const res = (await shopClient.query(gql`
            query { couponCentre { id name usageScene discountValue } }
        `)) as any;
        expect(res.couponCentre.every((c: any) => typeof c.usageScene === 'string')).toBe(true);
    });
});
```

- [ ] **Step 2: 跑 e2e 确认失败**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run e2e/in-store-bill.e2e-spec.ts`
Expected: FAIL — `Cannot query field "usageScene" on type "CouponTemplate"`（SDL 未加）

- [ ] **Step 3: 新建 resolver**

创建 `d:\zhao\vendure\packages\coupon-plugin\src\in-store-bill-admin.resolver.ts`：

```ts
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext, Transaction } from '@vendure/core';

import { InStoreBillService } from './in-store-bill.service';

/**
 * 到店买单（admin-api）：商户端核销 + 流水查询。
 * 权限沿用 coupon-plugin 范式：@Allow(Permission.UpdateOrder)，
 * 属店隔离由 service 内的 assertManagedByShop（券模板）+ ctx.channelId（流水）共同保证。
 */
@Resolver()
export class InStoreBillAdminResolver {
    constructor(private inStoreBillService: InStoreBillService) {}

    @Query()
    @Allow(Permission.UpdateOrder)
    async inStoreBillQuote(
        @Ctx() ctx: RequestContext,
        @Args('code') code: string,
        @Args('originalAmount', { type: () => Int, nullable: true }) originalAmount?: number,
    ) {
        return this.inStoreBillService.quote(ctx, code, originalAmount ?? null);
    }

    @Query()
    @Allow(Permission.UpdateOrder)
    async inStoreBills(@Ctx() ctx: RequestContext, @Args('options', { nullable: true }) options?: any) {
        return this.inStoreBillService.list(ctx, {
            skip: options?.skip ?? 0,
            take: options?.take ?? 20,
            couponCode: options?.couponCode ?? undefined,
            from: options?.from ? new Date(options.from) : undefined,
            to: options?.to ? new Date(options.to) : undefined,
        });
    }

    @Query()
    @Allow(Permission.UpdateOrder)
    async inStoreBillSummary(@Ctx() ctx: RequestContext, @Args('options', { nullable: true }) options?: any) {
        return this.inStoreBillService.summary(ctx, {
            from: options?.from ? new Date(options.from) : undefined,
            to: options?.to ? new Date(options.to) : undefined,
        });
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateOrder)
    async inStoreBillRedeem(
        @Ctx() ctx: RequestContext,
        @Args('code') code: string,
        @Args('originalAmount', { type: () => Int }) originalAmount: number,
        @Args('remark', { nullable: true }) remark?: string,
    ) {
        return this.inStoreBillService.redeem(ctx, code, originalAmount, remark);
    }
}
```

- [ ] **Step 4: 在 plugin.ts 补 SDL 与注册**

修改 `d:\zhao\vendure\packages\coupon-plugin\src\plugin.ts`：

（a）import 追加：

```ts
import { InStoreBillAdminResolver } from './in-store-bill-admin.resolver';
import { InStoreBillService } from './in-store-bill.service';
```

（b）`couponTemplateType`（admin 与 shop 共用的模板类型定义）里，`updatedAt: DateTime!` 之前插入：

```graphql
    usageScene: CouponUsageScene!
```

（c）`providers` 数组追加：

```ts
        InStoreBillService,
```

（d）admin SDL：在 `enum CouponIssuedBy { CENTRE ADMIN EXCHANGE }` 之后加一行枚举，并在文件末尾 `extend type Mutation { ... }` 内追加 4 个入口（到店买单类型定义紧随 `CustomerCouponList` 之后）：

```graphql
            enum CouponUsageScene { ONLINE IN_STORE ALL }
```

```graphql
            type InStoreBillQuote {
                ok: Boolean!
                reason: String
                couponCode: String
                couponName: String
                discountType: String
                discountValue: Int
                minSpend: Int
                originalAmount: Int
                discountAmount: Int
                finalAmount: Int
                customerName: String
                customerPhone: String
                expiresAt: DateTime
            }

            type InStoreBill implements Node {
                id: ID!
                channelId: ID!
                couponCode: String!
                couponTemplateId: ID!
                couponName: String
                customerId: ID!
                customerName: String
                customerPhone: String
                discountType: String!
                discountValue: Int!
                originalAmount: Int!
                discountAmount: Int!
                finalAmount: Int!
                operatorId: ID!
                operatorName: String
                remark: String
                billedAt: DateTime!
                createdAt: DateTime!
            }

            type InStoreBillList implements PaginatedList {
                items: [InStoreBill!]!
                totalItems: Int!
            }

            type InStoreBillSummary {
                count: Int!
                originalTotal: Int!
                discountTotal: Int!
                finalTotal: Int!
            }

            input InStoreBillListOptions {
                skip: Int
                take: Int
                couponCode: String
                from: DateTime
                to: DateTime
            }

            input InStoreBillSummaryOptions {
                from: DateTime
                to: DateTime
            }
```

```graphql
                inStoreBillQuote(code: String!, originalAmount: Int): InStoreBillQuote!
                inStoreBills(options: InStoreBillListOptions): InStoreBillList!
                inStoreBillSummary(options: InStoreBillSummaryOptions): InStoreBillSummary!
                inStoreBillRedeem(code: String!, originalAmount: Int!, remark: String): InStoreBill!
```

（e）`adminApiExtensions.resolvers` 数组追加 `InStoreBillAdminResolver`：

```ts
        resolvers: [CouponAdminResolver, CouponTemplateResolver, CustomerCouponResolver, CouponBindingAdminResolver, InStoreBillAdminResolver],
```

（f）shop SDL：在 `enum CouponIssuedBy { CENTRE ADMIN EXCHANGE }` 之后加一行：

```graphql
            enum CouponUsageScene { ONLINE IN_STORE ALL }
```

> 说明：`couponTemplateType` 为 admin / shop 共用常量，加一处即两端同时暴露 `usageScene`（spec §9.2 要求）。

- [ ] **Step 5: 跑 e2e 确认通过**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `npx vitest --config vitest.config.mts --run e2e/in-store-bill.e2e-spec.ts`
Expected: PASS — `5 passed`

- [ ] **Step 6: 跑整个插件回归（含既有线上券 e2e）**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）: `pnpm test`
Expected: 全绿；既有 `e2e/coupon.e2e-spec.ts` 不受影响（`usageScene` 默认 ONLINE）

- [ ] **Step 7: 构建 + 提交**

```bash
pnpm build
git -C d:/zhao/vendure add packages/coupon-plugin/src packages/coupon-plugin/e2e packages/coupon-plugin/lib
git -C d:/zhao/vendure commit -m "feat(coupon): 到店买单 GraphQL 契约与 resolver（含全链路 e2e）"
```

---

## Task 8: 商户端 — API 封装

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\in-store-bill.ts`

- [ ] **Step 1: 新建 API 文件**

创建 `d:\zhao\vshop\web-admin\src\apis\in-store-bill.ts`：

```ts
// 到店买单 admin-api 调用（coupon-plugin，schema 见 spec §9.1）。
// 金额单位一律为「分」；页面展示时用 fenToYuan 转元。
import { getAdminClient, graphQlErrorMsg } from './client';

export interface InStoreBillQuote {
  ok: boolean;
  reason?: string | null;
  couponCode?: string | null;
  couponName?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
  minSpend?: number | null;
  originalAmount?: number | null;
  discountAmount?: number | null;
  finalAmount?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  expiresAt?: string | null;
}

export interface InStoreBillRow {
  id: string;
  channelId: string;
  couponCode: string;
  couponTemplateId: string;
  couponName?: string | null;
  customerId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  discountType: string;
  discountValue: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  operatorId: string;
  operatorName?: string | null;
  remark?: string | null;
  billedAt: string;
  createdAt: string;
}

export interface InStoreBillSummary {
  count: number;
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
}

export interface InStoreBillQueryOptions {
  skip?: number;
  take?: number;
  couponCode?: string;
  from?: string | null;
  to?: string | null;
}

const QUOTE_FIELDS = `ok reason couponCode couponName discountType discountValue minSpend originalAmount discountAmount finalAmount customerName customerPhone expiresAt`;
const BILL_FIELDS = `id channelId couponCode couponTemplateId couponName customerId customerName customerPhone discountType discountValue originalAmount discountAmount finalAmount operatorId operatorName remark billedAt createdAt`;

/** 分 → 元（两位小数） */
export function fenToYuan(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return (cents / 100).toFixed(2);
}

/** 折扣展示：PERCENT 80 → “8 折”；FIXED/FULL → “减 ¥x” */
export function discountLabel(type?: string | null, discountValue?: number | null): string {
  if (discountValue == null) return '—';
  if (type === 'PERCENT') {
    const zhe = discountValue / 10;
    return `${zhe % 1 === 0 ? zhe : zhe.toFixed(1)} 折`;
  }
  return `减 ¥${fenToYuan(discountValue)}`;
}

/** 试算（不传 originalAmount = 只取券信息） */
export async function quoteInStoreBill(code: string, originalAmount?: number | null): Promise<InStoreBillQuote> {
  try {
    const { inStoreBillQuote } = await getAdminClient().request<{ inStoreBillQuote: InStoreBillQuote }>(
      `query InStoreBillQuote($code: String!, $originalAmount: Int) {
        inStoreBillQuote(code: $code, originalAmount: $originalAmount) { ${QUOTE_FIELDS} }
      }`,
      { code, originalAmount: originalAmount ?? null },
    );
    return inStoreBillQuote;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询优惠券失败'));
  }
}

/** 核销并落流水（平台不收款，实付金额由商户线下收取） */
export async function redeemInStoreBill(code: string, originalAmount: number, remark?: string): Promise<InStoreBillRow> {
  try {
    const { inStoreBillRedeem } = await getAdminClient().request<{ inStoreBillRedeem: InStoreBillRow }>(
      `mutation InStoreBillRedeem($code: String!, $originalAmount: Int!, $remark: String) {
        inStoreBillRedeem(code: $code, originalAmount: $originalAmount, remark: $remark) { ${BILL_FIELDS} }
      }`,
      { code, originalAmount, remark: remark?.trim() || null },
    );
    return inStoreBillRedeem;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '核销失败'));
  }
}

/** 流水明细分页 */
export async function fetchInStoreBills(options: InStoreBillQueryOptions = {}): Promise<{ items: InStoreBillRow[]; totalItems: number }> {
  try {
    const { inStoreBills } = await getAdminClient().request<{
      inStoreBills: { items: InStoreBillRow[]; totalItems: number };
    }>(
      `query InStoreBills($options: InStoreBillListOptions) {
        inStoreBills(options: $options) { items { ${BILL_FIELDS} } totalItems }
      }`,
      {
        options: {
          skip: options.skip ?? 0,
          take: options.take ?? 20,
          couponCode: options.couponCode || null,
          from: options.from || null,
          to: options.to || null,
        },
      },
    );
    return { items: inStoreBills?.items ?? [], totalItems: inStoreBills?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载买单流水失败'));
  }
}

/** 流水汇总（笔数 / 原价 / 优惠 / 实收） */
export async function fetchInStoreBillSummary(options: { from?: string | null; to?: string | null } = {}): Promise<InStoreBillSummary> {
  try {
    const { inStoreBillSummary } = await getAdminClient().request<{ inStoreBillSummary: InStoreBillSummary }>(
      `query InStoreBillSummary($options: InStoreBillSummaryOptions) {
        inStoreBillSummary(options: $options) { count originalTotal discountTotal finalTotal }
      }`,
      { options: { from: options.from || null, to: options.to || null } },
    );
    return inStoreBillSummary ?? { count: 0, originalTotal: 0, discountTotal: 0, finalTotal: 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载买单汇总失败'));
  }
}
```

- [ ] **Step 2: 类型检查**

Run（cwd `d:\zhao\vshop\web-admin`）: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: 无新增报错（若仓库基线本就存在报错，确认无本文件相关项）

- [ ] **Step 3: 提交**

```bash
git -C d:/zhao/vshop add web-admin/src/apis/in-store-bill.ts
git -C d:/zhao/vshop commit -m "feat(admin): 到店买单 API 封装（试算/核销/流水/汇总）"
```

---

## Task 9: 商户端 — 券编辑页「使用场景」

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\coupon.ts`
- Modify: `d:\zhao\vshop\web-admin\src\pages\coupon\edit\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: coupon.ts 增加 usageScene**

在 `d:\zhao\vshop\web-admin\src\apis\coupon.ts` 中：

（a）类型区新增：

```ts
export type CouponUsageScene = 'ONLINE' | 'IN_STORE' | 'ALL';
```

（b）`CouponTemplateItem` 增加字段：

```ts
  usageScene: CouponUsageScene;
```

（c）`CouponTemplateInput` 增加字段：

```ts
  usageScene?: CouponUsageScene;
```

（d）`FIELDS` 常量末尾（`updatedAt` 之前）插入 `usageScene `：

```ts
const FIELDS = `id name nameZh nameEn description descZh descEn type discountValue minSpend startsAt endsAt totalCount claimedCount pointsPrice perUserLimit scope categoryId variantId enabled claimable claimCode validDays newCustomerOnly memberLevel shopId usageScene createdAt updatedAt`;
```

- [ ] **Step 2: 编辑页加「使用场景」选择器 + 8 折预填**

修改 `d:\zhao\vshop\web-admin\src\pages\coupon\edit\index.vue`：

（a）模板：在「券类型」field 之后插入：

```html
      <view class="field">
        <text class="label">{{ $t('couponEdit.sceneLabel') }}</text>
        <picker :range="sceneLabels" @change="onSceneChange">
          <view class="ipt vpicker">
            <text>{{ sceneLabel(form.usageScene) }}</text>
            <text class="caret">▾</text>
          </view>
        </picker>
        <text v-if="form.usageScene === 'IN_STORE'" class="tip">{{ $t('couponEdit.sceneInStoreTip') }}</text>
      </view>
```

（b）脚本 import 追加 `CouponUsageScene`：

```ts
import {
  fetchCouponTemplate, createCouponTemplate, updateCouponTemplate, createProductCouponBinding,
  couponTypeLabel, CouponType, CouponTemplateInput, CouponUsageScene,
} from '../../../apis/coupon';
```

（c）在 `typeLabel` 之后加场景相关定义：

```ts
const sceneKeys: CouponUsageScene[] = ['ONLINE', 'IN_STORE', 'ALL'];
const sceneLabels = [locale.t('couponEdit.sceneOnline'), locale.t('couponEdit.sceneInStore'), locale.t('couponEdit.sceneAll')];
const SCENE_LABEL: Record<CouponUsageScene, string> = {
  ONLINE: 'couponEdit.sceneOnline',
  IN_STORE: 'couponEdit.sceneInStore',
  ALL: 'couponEdit.sceneAll',
};
const sceneLabel = (s: CouponUsageScene) => locale.t(SCENE_LABEL[s] || 'couponEdit.sceneOnline');

function onSceneChange(e: any) {
  const s = sceneKeys[e.detail.value];
  form.value.usageScene = s;
  // 到店买单券默认 8 折：切场景时按 8 折预填折扣（商户可改）
  if (s === 'IN_STORE') {
    form.value.type = 'PERCENT';
    if (!form.value.discountYuan || Number(form.value.discountYuan) > 9) form.value.discountYuan = '8';
  }
}
```

（d）`form` 初始值中加入：

```ts
  usageScene: 'ONLINE' as CouponUsageScene,
```

（e）`buildInput()` 中 `model` 对象加入：

```ts
    usageScene: f.usageScene,
```

（f）编辑回显（`onMounted` 内的 `form.value = {...}`）加入：

```ts
        usageScene: (c.usageScene || 'ONLINE') as CouponUsageScene,
```

- [ ] **Step 3: 语言包补词条**

`d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` 的 `couponEdit` 对象中（`typeLabel` 之后）插入：

```json
    "sceneLabel": "使用场景 *",
    "sceneOnline": "仅线上订单",
    "sceneInStore": "仅到店买单",
    "sceneAll": "线上 + 到店",
    "sceneInStoreTip": "到店买单券：顾客到店出示券码，商户核销并按折扣线下收款（默认 8 折，可改）",
```

`d:\zhao\vshop\web-admin\src\locale\en.json` 的 `couponEdit` 对象中对应位置插入：

```json
    "sceneLabel": "Usage scene *",
    "sceneOnline": "Online orders only",
    "sceneInStore": "In-store payment only",
    "sceneAll": "Online + in-store",
    "sceneInStoreTip": "In-store coupon: customer shows the code, merchant redeems and collects offline at the discount (8 off by default)",
```

- [ ] **Step 4: 验证（dev 服务器 + 手测）**

Run（cwd `d:\zhao\vshop\web-admin`）: `npm run dev:h5`
Expected: 访问 `http://localhost:5173/#/pages/coupon/edit/index`，能看到「使用场景」下拉；选「仅到店买单」后券类型自动变「折扣」且折数预填 `8`

- [ ] **Step 5: 提交**

```bash
git -C d:/zhao/vshop add web-admin/src/apis/coupon.ts web-admin/src/pages/coupon/edit/index.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git -C d:/zhao/vshop commit -m "feat(admin): 券编辑支持使用场景（到店买单默认 8 折预填）"
```

---

## Task 10: 商户端 — 核销页

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\in-store\redeem\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: 注册页面路由**

`d:\zhao\vshop\web-admin\src\pages.json` 的 `pages` 数组中，`pages/coupon/issue/index` 之后插入：

```json
    { "path": "pages/in-store/redeem/index", "style": { "navigationBarTitleText": "到店买单核销" } },
    { "path": "pages/in-store/bills/index", "style": { "navigationBarTitleText": "买单流水" } },
```

- [ ] **Step 2: 新建核销页**

创建 `d:\zhao\vshop\web-admin\src\pages\in-store\redeem\index.vue`：

```vue
<template>
  <view class="page">
    <view class="head">
      <text class="head-title">{{ $t('inStoreRedeem.headTitle') }}</text>
      <text class="sub">{{ $t('inStoreRedeem.headSub') }}</text>
    </view>

    <!-- 输码 / 扫码 -->
    <view class="card" :class="{ pulse: pulsing }">
      <input
        class="code-input"
        v-model="rawCode"
        :placeholder="$t('inStoreRedeem.inputPlaceholder')"
        :maxlength="64"
        confirm-type="done"
        @confirm="onLookup"
      />
      <view class="row">
        <button class="btn scan" @tap="onScan">{{ $t('inStoreRedeem.scan') }}</button>
        <button class="btn main" :disabled="looking" @tap="onLookup">{{ $t('inStoreRedeem.lookup') }}</button>
      </view>
    </view>

    <!-- 券信息卡 -->
    <view v-if="quoteError" class="alert">{{ quoteError }}</view>
    <view v-if="quote && quote.couponCode" class="card coupon-card">
      <view class="cc-top">
        <text class="cc-name">{{ quote.couponName || $t('inStoreRedeem.voucher') }}</text>
        <text class="cc-tag">{{ discountText }}</text>
      </view>
      <view class="cc-line">
        <text class="k">{{ $t('inStoreRedeem.code') }}</text>
        <text class="v mono">{{ quote.couponCode }}</text>
      </view>
      <view class="cc-line">
        <text class="k">{{ $t('inStoreRedeem.customer') }}</text>
        <text class="v">{{ quote.customerName || '—' }}<text v-if="quote.customerPhone"> · {{ quote.customerPhone }}</text></text>
      </view>
      <view class="cc-line" v-if="quote.minSpend">
        <text class="k">{{ $t('inStoreRedeem.minSpend') }}</text>
        <text class="v">¥{{ fenToYuan(quote.minSpend) }}</text>
      </view>
      <view class="cc-line" v-if="quote.expiresAt">
        <text class="k">{{ $t('inStoreRedeem.expires') }}</text>
        <text class="v">{{ fmtDate(quote.expiresAt) }}</text>
      </view>
    </view>

    <!-- 原价 + 试算 -->
    <view v-if="quote && quote.couponCode" class="card">
      <view class="field">
        <text class="label">{{ $t('inStoreRedeem.originalLabel') }}</text>
        <input class="ipt" v-model="originalYuan" type="digit" :placeholder="$t('inStoreRedeem.phOriginal')" />
      </view>
      <view class="calc">
        <view class="calc-row">
          <text class="k">{{ $t('inStoreRedeem.original') }}</text>
          <text class="v">¥{{ fenToYuan(quote.originalAmount) }}</text>
        </view>
        <view class="calc-row">
          <text class="k">{{ $t('inStoreRedeem.discount') }}</text>
          <text class="v minus">-¥{{ fenToYuan(quote.discountAmount) }}</text>
        </view>
        <view class="calc-row total">
          <text class="k">{{ $t('inStoreRedeem.final') }}</text>
          <text class="v">{{ fenToYuan(quote.finalAmount) }}</text>
        </view>
      </view>
      <view class="field">
        <text class="label">{{ $t('inStoreRedeem.remarkLabel') }} <text class="opt">{{ $t('inStoreRedeem.optional') }}</text></text>
        <input class="ipt" v-model="remark" :placeholder="$t('inStoreRedeem.phRemark')" />
      </view>
      <button class="confirm" :disabled="!canRedeem || redeeming" @tap="onRedeem">
        {{ redeeming ? $t('inStoreRedeem.redeeming') : $t('inStoreRedeem.confirm') }}
      </button>
      <text class="hint">{{ $t('inStoreRedeem.collectHint') }}</text>
    </view>

    <!-- 成功态 -->
    <view v-if="done" class="card done">
      <text class="done-title">{{ $t('inStoreRedeem.doneTitle') }}</text>
      <text class="done-amount">¥{{ fenToYuan(done.finalAmount) }}</text>
      <text class="done-tip">{{ $t('inStoreRedeem.doneTip', { no: done.id }) }}</text>
      <button class="btn main again" @tap="reset">{{ $t('inStoreRedeem.again') }}</button>
    </view>

    <view style="height: 80rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  quoteInStoreBill, redeemInStoreBill, fenToYuan, discountLabel,
  InStoreBillQuote, InStoreBillRow,
} from '../../../apis/in-store-bill';
import { scanCode } from '../../../utils/scanner';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const rawCode = ref('');
const quote = ref<InStoreBillQuote | null>(null);
const quoteError = ref('');
const originalYuan = ref('');
const remark = ref('');
const looking = ref(false);
const redeeming = ref(false);
const pulsing = ref(false);
const done = ref<InStoreBillRow | null>(null);

const discountText = computed(() => discountLabel(quote.value?.discountType, quote.value?.discountValue));
const canRedeem = computed(() => !!quote.value?.ok && quote.value?.finalAmount != null);

/** 分 → 元（两位小数）。本地未引入的数值（券卡展示用）用价格格式化兜底。 */
function fen(v: number | null | undefined): string {
  return v == null ? '—' : (v / 100).toFixed(2);
}
function fmtDate(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 拉取券信息（不传原价）；原价已在填时顺带试算 */
async function load(code: string, amountYuan?: string) {
  const c = code.trim();
  if (!c) return;
  looking.value = true;
  quoteError.value = '';
  try {
    const amount = amountYuan && Number(amountYuan) > 0 ? Math.round(Number(amountYuan) * 100) : null;
    const q = await quoteInStoreBill(c, amount);
    quote.value = q;
    if (!q.ok && q.reason) quoteError.value = reasonText(q.reason);
  } catch (e: any) {
    quote.value = null;
    quoteError.value = e?.message || locale.t('inStoreRedeem.lookupFailed');
  } finally {
    looking.value = false;
  }
}

/** 后端原因码 → 本地化文案（兜底用后端中文消息） */
function reasonText(reason: string): string {
  const map: Record<string, string> = {
    COUPON_NOT_FOUND: locale.t('inStoreRedeem.errNotFound'),
    TEMPLATE_DISABLED: locale.t('inStoreRedeem.errDisabled'),
    COUPON_NOT_UNUSED: locale.t('inStoreRedeem.errUsed'),
    COUPON_EXPIRED: locale.t('inStoreRedeem.errExpired'),
    SCENE_MISMATCH: locale.t('inStoreRedeem.errScene'),
    TENANT_MISMATCH: locale.t('inStoreRedeem.errTenant'),
    TYPE_NOT_SUPPORTED: locale.t('inStoreRedeem.errType'),
    MIN_SPEND_NOT_MET: locale.t('inStoreRedeem.errMinSpend'),
    INVALID_AMOUNT: locale.t('inStoreRedeem.errAmount'),
  };
  return map[reason] || reason;
}

async function onLookup() {
  await load(rawCode.value, originalYuan.value);
}

function onScan() {
  scanCode()
    .then((text: string) => {
      const c = (text || '').trim();
      if (!c) {
        uni.showToast({ title: locale.t('inStoreRedeem.scanFailed'), icon: 'none' });
        return;
      }
      rawCode.value = c;
      pulsing.value = true;
      setTimeout(() => (pulsing.value = false), 600);
      return load(c, originalYuan.value);
    })
    .catch((e: any) => {
      if (e?.code === 'MANUAL' || e?.code === 'FAILED') {
        uni.showToast({ title: e?.message || locale.t('inStoreRedeem.scanFailed'), icon: 'none' });
      }
      // CANCEL 静默
    });
}

/** 原价输入 400ms 防抖试算 */
let timer: any;
function onAmountInput() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => load(rawCode.value, originalYuan.value), 400);
}

function onRedeem() {
  const amount = Math.round(Number(originalYuan.value) * 100);
  if (!quote.value?.couponCode || !amount) return;
  uni.showModal({
    title: locale.t('inStoreRedeem.confirmTitle'),
    content: locale.t('inStoreRedeem.confirmContent', {
      code: quote.value.couponCode,
      final: fen(quote.value.finalAmount),
    }),
    confirmText: locale.t('inStoreRedeem.confirmBtn'),
    cancelText: locale.t('inStoreRedeem.cancel'),
    success: async (r) => {
      if (!r.confirm) return;
      redeeming.value = true;
      try {
        done.value = await redeemInStoreBill(quote.value!.couponCode!, amount, remark.value);
        uni.showToast({ title: locale.t('inStoreRedeem.redeemed'), icon: 'success' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('inStoreRedeem.redeemFailed'), icon: 'none' });
      } finally {
        redeeming.value = false;
      }
    },
  });
}

function reset() {
  rawCode.value = '';
  quote.value = null;
  quoteError.value = '';
  originalYuan.value = '';
  remark.value = '';
  done.value = null;
}

// 原价输入变化触发防抖试算（用 watch 保持模板简洁）
import { watch } from 'vue';
watch(originalYuan, () => {
  if (quote.value?.couponCode) onAmountInput();
});

onLoad((q: any) => {
  const c = (q?.code as string) || '';
  if (c) {
    rawCode.value = c;
    load(c);
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 60rpx;
  .head { margin-bottom: 20rpx;
    .head-title { display: block; font-size: 36rpx; font-weight: 700; color: $wa-ink; }
    .sub { display: block; margin-top: 6rpx; font-size: 24rpx; color: $wa-muted; }
  }
  .card { background: $wa-card; border-radius: 20rpx; padding: 24rpx; margin-bottom: 24rpx;
    box-shadow: 0 2rpx 12rpx rgba(31, 41, 55, 0.06); border: 2rpx solid transparent;
    transition: border-color .2s;
    &.pulse { border-color: $wa-accent; }
    .code-input { height: 84rpx; padding: 0 24rpx; font-size: 34rpx; font-weight: 700; letter-spacing: 4rpx;
      font-family: ui-monospace, Menlo, Consolas, monospace; background: $wa-bg; border-radius: 16rpx; color: $wa-ink; }
    .row { display: flex; gap: 16rpx; margin-top: 16rpx;
      .btn { flex: 1; margin: 0; height: 80rpx; line-height: 80rpx; font-size: 28rpx; border-radius: 16rpx; }
      .scan { background: $wa-ink; color: #fff; }
      .main { background: $wa-accent; color: #fff; }
    }
  }
  .alert { background: #fef3c7; border: 1rpx solid #fcd34d; color: #b45309; border-radius: 16rpx;
    padding: 18rpx 24rpx; margin-bottom: 20rpx; font-size: 26rpx; }
  .coupon-card {
    .cc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;
      .cc-name { font-size: 32rpx; font-weight: 700; color: $wa-ink; }
      .cc-tag { font-size: 26rpx; font-weight: 700; color: #d04b00; background: #fff4ec;
        border: 1rpx solid #ffd9bc; border-radius: 10rpx; padding: 4rpx 16rpx; }
    }
    .cc-line { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx;
      .k { color: $wa-muted; } .v { color: $wa-ink; } .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
    }
  }
  .calc { border-top: 1rpx dashed $wa-rule; padding-top: 16rpx; margin-bottom: 16rpx;
    .calc-row { display: flex; justify-content: space-between; padding: 6rpx 0; font-size: 26rpx;
      .k { color: $wa-muted; } .v { color: $wa-ink; } .minus { color: #059669; }
      &.total { margin-top: 8rpx; padding-top: 14rpx; border-top: 1rpx solid $wa-rule;
        .k { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
        .v { font-size: 40rpx; font-weight: 800; color: $wa-accent; }
      }
    }
  }
  .field { margin-bottom: 20rpx;
    .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; .opt { font-size: 22rpx; color: #aaa; } }
    .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; width: 100%; }
  }
  .confirm { margin: 0; height: 88rpx; line-height: 88rpx; font-size: 30rpx; font-weight: 600;
    background: $wa-accent; color: #fff; border-radius: 16rpx; &[disabled] { opacity: .55; } }
  .hint { display: block; margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; }
  .done { text-align: center;
    .done-title { display: block; font-size: 28rpx; color: $wa-muted; }
    .done-amount { display: block; margin: 12rpx 0; font-size: 56rpx; font-weight: 800; color: $wa-accent; }
    .done-tip { display: block; font-size: 24rpx; color: $wa-muted; margin-bottom: 24rpx; }
    .again { margin: 0; height: 80rpx; line-height: 80rpx; font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: 16rpx; }
  }
}
</style>
```

- [ ] **Step 3: 语言包补 `inStoreRedeem`**

`zh-Hans.json` 顶层追加（放在 `"couponEdit"` 之后，注意前置逗号）：

```json
  "inStoreRedeem": {
    "headTitle": "到店买单核销",
    "headSub": "顾客出示券码 → 输入消费原价 → 系统按券折扣算实付",
    "inputPlaceholder": "输入 / 扫描券码",
    "scan": "扫码",
    "lookup": "查询",
    "code": "券码",
    "customer": "顾客",
    "minSpend": "使用门槛",
    "expires": "有效期至",
    "voucher": "优惠券",
    "originalLabel": "消费原价（元）*",
    "phOriginal": "如 200",
    "original": "原价",
    "discount": "优惠",
    "final": "顾客实付",
    "remarkLabel": "备注",
    "optional": "选填",
    "phRemark": "如 老客户 / 桌号",
    "confirm": "确认核销",
    "redeeming": "核销中…",
    "collectHint": "核销后请按「顾客实付」金额线下收款，平台不参与收款",
    "confirmTitle": "确认核销",
    "confirmContent": "券码 {code}，顾客实付 ¥{final}。核销后不可撤销，确认继续？",
    "confirmBtn": "确认核销",
    "cancel": "取消",
    "redeemed": "核销成功",
    "redeemFailed": "核销失败",
    "lookupFailed": "查询失败",
    "scanFailed": "扫码失败，请手动输入",
    "doneTitle": "核销成功 · 请线下收款",
    "doneTip": "流水号 #{no}",
    "again": "继续核销",
    "errNotFound": "优惠券不存在",
    "errDisabled": "该优惠券已下架",
    "errUsed": "该优惠券已使用或当前不可用",
    "errExpired": "该优惠券已过期",
    "errScene": "该券不支持到店买单",
    "errTenant": "该券不属于当前门店",
    "errType": "该券类型不支持到店买单",
    "errMinSpend": "未达到该券使用门槛",
    "errAmount": "请输入有效的消费金额"
  },
```

`en.json` 顶层追加对应英文：

```json
  "inStoreRedeem": {
    "headTitle": "In-store redemption",
    "headSub": "Customer shows the coupon code → enter the amount → the payable is calculated by the coupon discount",
    "inputPlaceholder": "Enter / scan coupon code",
    "scan": "Scan",
    "lookup": "Look up",
    "code": "Code",
    "customer": "Customer",
    "minSpend": "Min. spend",
    "expires": "Valid until",
    "voucher": "Coupon",
    "originalLabel": "Original amount (CNY) *",
    "phOriginal": "e.g. 200",
    "original": "Original",
    "discount": "Discount",
    "final": "Customer pays",
    "remarkLabel": "Remark",
    "optional": "optional",
    "phRemark": "e.g. regular customer / table no.",
    "confirm": "Confirm redemption",
    "redeeming": "Redeeming…",
    "collectHint": "Collect the payable amount offline after redemption; the platform does not handle payments",
    "confirmTitle": "Confirm redemption",
    "confirmContent": "Code {code}, customer pays ¥{final}. This cannot be undone. Continue?",
    "confirmBtn": "Confirm",
    "cancel": "Cancel",
    "redeemed": "Redeemed",
    "redeemFailed": "Redemption failed",
    "lookupFailed": "Lookup failed",
    "scanFailed": "Scan failed, please type the code",
    "doneTitle": "Redeemed · collect offline",
    "doneTip": "Bill #{no}",
    "again": "Redeem another",
    "errNotFound": "Coupon not found",
    "errDisabled": "This coupon is disabled",
    "errUsed": "This coupon is already used or unavailable",
    "errExpired": "This coupon has expired",
    "errScene": "This coupon does not support in-store payment",
    "errTenant": "This coupon does not belong to this shop",
    "errType": "This coupon type is not supported in store",
    "errMinSpend": "Minimum spend not reached",
    "errAmount": "Please enter a valid amount"
  },
```

- [ ] **Step 4: 验证（dev 服务器 + 手测）**

Run（cwd `d:\zhao\vshop\web-admin`）: `npm run dev:h5`
Expected: 访问 `http://localhost:5173/#/pages/in-store/redeem/index`，能看到输码区；填一个已领取的 IN_STORE 券码 → 出现券卡；填原价 200 → 实付显示 160.00

- [ ] **Step 5: 提交**

```bash
git -C d:/zhao/vshop add web-admin/src/pages/in-store/redeem/index.vue web-admin/src/pages.json web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git -C d:/zhao/vshop commit -m "feat(admin): 到店买单核销页（券码查询 + 手填原价 + 实时试算 + 二次确认）"
```

---

## Task 11: 商户端 — 流水页、菜单与 i18n

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\in-store\bills\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\constants\menus.ts`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: 新建流水页**

创建 `d:\zhao\vshop\web-admin\src\pages\in-store\bills\index.vue`：

```vue
<template>
  <view class="page">
    <!-- 汇总条 -->
    <view class="summary">
      <view class="sm-item">
        <text class="sm-v">{{ summary.count }}</text>
        <text class="sm-k">{{ $t('inStoreBills.sumCount') }}</text>
      </view>
      <view class="sm-item">
        <text class="sm-v">¥{{ fenToYuan(summary.finalTotal) }}</text>
        <text class="sm-k">{{ $t('inStoreBills.sumFinal') }}</text>
      </view>
      <view class="sm-item">
        <text class="sm-v minus">-¥{{ fenToYuan(summary.discountTotal) }}</text>
        <text class="sm-k">{{ $t('inStoreBills.sumDiscount') }}</text>
      </view>
    </view>

    <!-- 筛选 -->
    <view class="filter">
      <input class="f-ipt" v-model="couponCode" :placeholder="$t('inStoreBills.phCode')" @confirm="reload" />
      <picker mode="date" :value="from" @change="onFrom">
        <view class="f-date"><text>{{ from || $t('inStoreBills.startDate') }}</text><text class="caret">▾</text></view>
      </picker>
      <picker mode="date" :value="to" @change="onTo">
        <view class="f-date"><text>{{ to || $t('inStoreBills.endDate') }}</text><text class="caret">▾</text></view>
      </picker>
      <button class="f-btn" @tap="reload">{{ $t('inStoreBills.search') }}</button>
    </view>

    <!-- 明细 -->
    <view class="card" v-for="b in items" :key="b.id">
      <view class="bhead">
        <text class="code mono">{{ b.couponCode }}</text>
        <text class="amt">¥{{ fenToYuan(b.finalAmount) }}</text>
      </view>
      <view class="brow">
        <text class="k">{{ $t('inStoreBills.coupon') }}</text>
        <text class="v">{{ b.couponName || '—' }} · {{ discountLabel(b.discountType, b.discountValue) }}</text>
      </view>
      <view class="brow">
        <text class="k">{{ $t('inStoreBills.customer') }}</text>
        <text class="v">{{ b.customerName || '—' }}<text v-if="b.customerPhone"> · {{ b.customerPhone }}</text></text>
      </view>
      <view class="brow">
        <text class="k">{{ $t('inStoreBills.amount') }}</text>
        <text class="v">¥{{ fenToYuan(b.originalAmount) }} <text class="minus">-¥{{ fenToYuan(b.discountAmount) }}</text> = ¥{{ fenToYuan(b.finalAmount) }}</text>
      </view>
      <view class="brow" v-if="b.remark">
        <text class="k">{{ $t('inStoreBills.remark') }}</text>
        <text class="v">{{ b.remark }}</text>
      </view>
      <view class="bfoot">
        <text>{{ fmtTime(b.billedAt) }}</text>
        <text>{{ $t('inStoreBills.operator') }}：{{ b.operatorName || b.operatorId }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('inStoreBills.empty') }}</view>
    <view v-if="hasMore" class="more" @tap="loadMore">{{ loading ? $t('inStoreBills.loading') : $t('inStoreBills.loadMore') }}</view>

    <view style="height: 60rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchInStoreBills, fetchInStoreBillSummary, fenToYuan, discountLabel,
  InStoreBillRow, InStoreBillSummary,
} from '../../../apis/in-store-bill';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const PAGE_SIZE = 20;

const items = ref<InStoreBillRow[]>([]);
const total = ref(0);
const skip = ref(0);
const loading = ref(false);
const summary = ref<InStoreBillSummary>({ count: 0, originalTotal: 0, discountTotal: 0, finalTotal: 0 });
const couponCode = ref('');
const from = ref('');
const to = ref('');

const hasMore = computed(() => items.value.length < total.value);

/** 本地日期 → 当天起始/结束 ISO（与后端 billedAt 比较） */
function dayStart(v: string): string { return `${v}T00:00:00.000Z`; }
function dayEnd(v: string): string { return `${v}T23:59:59.999Z`; }

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadPage(append: boolean) {
  loading.value = true;
  try {
    const r = await fetchInStoreBills({
      skip: append ? skip.value : 0,
      take: PAGE_SIZE,
      couponCode: couponCode.value.trim(),
      from: from.value ? dayStart(from.value) : null,
      to: to.value ? dayEnd(to.value) : null,
    });
    items.value = append ? [...items.value, ...r.items] : r.items;
    total.value = r.totalItems;
    skip.value = items.value.length;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inStoreBills.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function loadSummary() {
  try {
    summary.value = await fetchInStoreBillSummary({
      from: from.value ? dayStart(from.value) : null,
      to: to.value ? dayEnd(to.value) : null,
    });
  } catch {
    /* 汇总失败不阻塞明细 */
  }
}

async function reload() {
  skip.value = 0;
  await Promise.all([loadPage(false), loadSummary()]);
}

function loadMore() {
  if (!hasMore.value || loading.value) return;
  loadPage(true);
}

function onFrom(e: any) { from.value = e.detail.value; reload(); }
function onTo(e: any) { to.value = e.detail.value; reload(); }

// 每次进入/返回本页刷新（核销后可立即看到新流水）
onShow(() => { reload(); });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .summary { display: flex; background: $wa-card; border-radius: 20rpx; padding: 28rpx 24rpx; margin-bottom: 24rpx;
    .sm-item { flex: 1; display: flex; flex-direction: column; align-items: center;
      & + .sm-item { border-left: 1rpx solid $wa-rule; }
      .sm-v { font-size: 34rpx; font-weight: 800; color: $wa-ink; &.minus { color: #059669; } }
      .sm-k { margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; }
    }
  }
  .filter { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 24rpx;
    .f-ipt { flex: 1 1 320rpx; min-width: 320rpx; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; }
    .f-date { display: flex; align-items: center; gap: 8rpx; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-muted;
      .caret { color: #bbb; font-size: 22rpx; }
    }
    .f-btn { margin: 0; height: 72rpx; line-height: 72rpx; padding: 0 32rpx; font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; }
  }
  .card { background: $wa-card; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx;
    .bhead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16rpx;
      .code { font-size: 28rpx; font-weight: 700; color: $wa-ink; }
      .code.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
      .amt { font-size: 34rpx; font-weight: 800; color: $wa-accent; }
    }
    .brow { display: flex; justify-content: space-between; gap: 24rpx; padding: 8rpx 0; font-size: 26rpx;
      .k { flex: 0 0 auto; color: $wa-muted; }
      .v { flex: 1; text-align: right; color: $wa-ink; word-break: break-all;
        .minus { color: #059669; }
      }
    }
    .bfoot { display: flex; justify-content: space-between; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx dashed $wa-rule; font-size: 22rpx; color: $wa-muted; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 80rpx 0; }
  .more { text-align: center; color: $wa-accent; font-size: 26rpx; padding: 24rpx 0; }
}
</style>
```

- [ ] **Step 2: 注册菜单与路由**

`src/constants/menus.ts`：在返回的菜单数组末尾追加一个分组（`D` 为已 import 的配色常量映射，`d5` 沿用其它分组同款结构；若现有文件无 `d5`，取该文件里最后一个未被使用的主色键，保持下方 `color`/`grad` 成对）:

```ts
{
  domain: 'menu.domain.inStore',
  color: D.d5.main,
  grad: D.d5.grad,
  items: [
    { label: 'menu.inStoreRedeem', url: '/pages/in-store/redeem/index', tier: 1 },
    { label: 'menu.inStoreBills', url: '/pages/in-store/bills/index', tier: 2 },
  ],
},
```

`src/pages.json`：确认 `pages` 数组已含两个新页面（Task 10 已加核销页，此处补流水页；`navigationBarTitleText` 用 i18n key 时与现有页面写法一致，否则写中文标题 `到店买单流水`）：

```json
    { "path": "pages/in-store/bills/index", "style": { "navigationBarTitleText": "到店买单流水" } },
```

- [ ] **Step 3: 语言包补 `inStoreBills` 与菜单词条**

`zh-Hans.json` 顶层追加（放在 `"inStoreRedeem"` 之后，注意前置逗号）：

```json
  "inStoreBills": {
    "headTitle": "到店买单流水",
    "sumCount": "核销笔数",
    "sumFinal": "实收合计",
    "sumDiscount": "优惠合计",
    "phCode": "按券码筛选",
    "startDate": "开始日期",
    "endDate": "结束日期",
    "search": "查询",
    "coupon": "优惠券",
    "customer": "顾客",
    "amount": "金额",
    "remark": "备注",
    "operator": "操作人",
    "empty": "暂无买单流水",
    "loadMore": "加载更多",
    "loading": "加载中…",
    "loadFailed": "加载失败"
  },
```

`en.json` 顶层追加对应英文：

```json
  "inStoreBills": {
    "headTitle": "In-store bills",
    "sumCount": "Redemptions",
    "sumFinal": "Collected",
    "sumDiscount": "Discount",
    "phCode": "Filter by code",
    "startDate": "Start date",
    "endDate": "End date",
    "search": "Search",
    "coupon": "Coupon",
    "customer": "Customer",
    "amount": "Amount",
    "remark": "Remark",
    "operator": "Operator",
    "empty": "No bills yet",
    "loadMore": "Load more",
    "loading": "Loading…",
    "loadFailed": "Failed to load"
  },
```

`zh-Hans.json` 的 `menu` 对象内追加：

```json
    "domain": {
      "...existing...": "...",
      "inStore": "到店买单"
    },
    "inStoreRedeem": "买单核销",
    "inStoreBills": "买单流水",
```

`en.json` 的 `menu` 对象内追加：

```json
    "domain": {
      "...existing...": "...",
      "inStore": "In-store"
    },
    "inStoreRedeem": "Redeem",
    "inStoreBills": "Bills",
```

（`menu.domain` 若在现有文件中为扁平键 `menu.domain.xxx` 而非嵌套对象，则改按现有扁平写法追加 `menu.domain.inStore`，不要改动既有结构。）

- [ ] **Step 4: 验证（dev 服务器 + 手测）**

Run（cwd `d:\zhao\vshop\web-admin`）: `npm run dev:h5`
Expected: 左侧菜单出现「到店买单」分组（含「买单核销」「买单流水」）；进入流水页无报错，空数据时显示「暂无买单流水」；Step 1 核销一笔后可查到该流水并更新汇总

- [ ] **Step 5: 提交**

```bash
git -C d:/zhao/vshop add web-admin/src/pages/in-store/bills/index.vue web-admin/src/pages.json web-admin/src/constants/menus.ts web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git -C d:/zhao/vshop commit -m "feat(admin): 到店买单流水页 + 菜单分组 + 中英文案"
```

---

## Task 12: 商户端验证 — 构建、手机截图与操作手册

**Files:**
- Create: `d:\zhao\vshop\web-admin\docs\superpowers\manual\in-store-bill\README.md`
- Create: `d:\zhao\vshop\web-admin\docs\superpowers\manual\in-store-bill\*.png`（截图）

- [ ] **Step 1: 构建 H5**

Run（cwd `d:\zhao\vshop\web-admin`）: `npm run build:h5`
Expected: 构建成功，产物落在 `dist/build/h5`

- [ ] **Step 2: 起本地服务并手机视口截图**

用 Playwright 以**手机视口 390×844、dpr=2**（截图输出 780×1688）打开 dev/build 站点，完成三张截图：

1. 券编辑页：`http://localhost:5173/#/pages/coupon/edit/index`（新建模式）→ 可见「使用场景」选项，默认选中「仅线上」；切换到「到店买单」后保存成功（截图 `coupon-usage-scene.png`）
2. 核销页：`http://localhost:5173/#/pages/in-store/redeem/index` → 输入 IN_STORE 券码 → 券卡出现；原价输入 200 → 实付显示 `¥160.00`（截图 `redeem-calc.png`）
3. 核销成功态 + 流水页：确认核销后出现「核销成功 · 请线下收款」；再进 `#/pages/in-store/bills/index` 能看到刚生成的流水与汇总（截图 `redeem-done.png`、`bills-list.png`）

- [ ] **Step 3: 写操作手册**

创建 `d:\zhao\vshop\web-admin\docs\superpowers\manual\in-store-bill\README.md`，包含以下小节，并把 Step 2 的四张截图以相对路径嵌入：

```markdown
# 到店买单（商户端）操作手册

## 功能说明
平台不收款，仅为商家引流。顾客领取「到店买单券」→ 到店出示券码 → 商户核销并按券折扣算实付 → 商户线下收款 → 记录买单流水。

## 前置：新建到店买单券（优惠券编辑页）
1. 进入「营销 → 优惠券 → 新建」
2. 名称/类型（满减或折扣）/折扣值（折扣券填 80 表示 8 折）/最低消费/有效期/总量按需填写
3. **使用场景**选「到店买单」（或「通用」）
4. 保存

![使用场景](coupon-usage-scene.png)

## 核销流程（买单核销页）
1. 进入「到店买单 → 买单核销」
2. 输入或扫描顾客券码 → 点「查询」，出现券信息卡（券名/折扣/顾客/有效期/门槛）
3. 输入顾客**消费原价**（元）→ 实时显示「优惠」与「顾客实付」
4. 核对无误 → 点「确认核销」→ 二次确认 → 核销成功
5. 按「顾客实付」金额**线下收款**

![试算](redeem-calc.png)
![核销成功](redeem-done.png)

## 流水查询（买单流水页）
- 顶部汇总：核销笔数 / 实收合计 / 优惠合计
- 可按券码、日期区间筛选
- 每条流水含：券码、券名与折扣、顾客、原价/优惠/实付、备注、操作人、时间

![流水](bills-list.png)

## 常见问题
- 「该券不支持到店买单」：券模板使用场景为「仅线上」
- 「该券不属于当前门店」：券为其他租户/渠道发放
- 「未达到该券使用门槛」：消费原价低于最低消费
```

- [ ] **Step 4: 提交**

```bash
git -C d:/zhao/vshop add web-admin/docs/superpowers/manual/in-store-bill
git -C d:/zhao/vshop commit -m "docs(admin): 到店买单操作手册（含手机视口截图）"
```

---

## Task 13: 顾客端（nshop）— 券码页、钱包入口与多语言

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\composables\useCoupon.ts`
- Create: `d:\zhao\nshop\layers\base\app\pages\coupon\code.vue`
- Modify: `d:\zhao\nshop\layers\base\app\pages\coupon\index.vue`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\*.ts`（全部 12 个语言包）

- [ ] **Step 1: `useCoupon.ts` 暴露 `usageScene` 与券码字段**

在 `CustomerCoupon` 类型（或等价的券条目 interface）中追加两个字段：

```ts
  /** 券使用场景：ONLINE 仅线上 / IN_STORE 到店买单 / ALL 通用（后端现有字段，仅补充类型） */
  usageScene?: 'ONLINE' | 'IN_STORE' | 'ALL' | null;
  /** 券码（展示/出示用） */
  code?: string | null;
```

并在查询该列表的 GraphQL 选择集中补上 `usageScene`（`code` 若已在选择集内则无需重复）。选择集位置：`useCoupon.ts` 中拉取「我的优惠券 / 券包」的那段 `query`（含 `id status template { ... }` 的那处），在 `status` 之后加：

```graphql
          usageScene
```

- [ ] **Step 2: 新建券码页 `pages/coupon/code.vue`**

创建 `d:\zhao\nshop\layers\base\app\pages\coupon\code.vue`（二维码范式参考 `layers/base/app/components/order/OrderRedemptionCard.vue`；i18n 用 `useI18n()` 的 `t`）：

```vue
<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();

const code = computed(() => String(route.query.code || ''));
const name = computed(() => String(route.query.name || ''));
const expiresAt = computed(() => String(route.query.expiresAt || ''));
const discount = computed(() => String(route.query.discount || ''));

const qrDataUrl = ref('');
onMounted(async () => {
  if (!code.value) return;
  try {
    const QRCode = (await import('qrcode')).default;
    qrDataUrl.value = await QRCode.toDataURL(code.value, { width: 420, margin: 1 });
  } catch {
    qrDataUrl.value = '';
  }
});

const expiresText = computed(() => {
  if (!expiresAt.value) return '';
  const d = new Date(expiresAt.value);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});
</script>

<template>
  <view class="page">
    <view class="card">
      <text class="vname">{{ name }}</text>
      <text class="vdisc" v-if="discount">{{ discount }}</text>
      <image v-if="qrDataUrl" class="qr" :src="qrDataUrl" mode="widthFix" />
      <text class="code mono">{{ code }}</text>
      <text class="vtime" v-if="expiresText">{{ t('coupon.codeValidUntil') }} {{ expiresText }}</text>
      <text class="tip">{{ t('coupon.codeTip') }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page { min-height: 100vh; background: var(--nshop-bg, #f5f5f5); padding: 40rpx 32rpx; }
.card { background: #fff; border-radius: 24rpx; padding: 48rpx 32rpx; display: flex; flex-direction: column; align-items: center;
  .vname { font-size: 34rpx; font-weight: 700; color: #1a1a1a; text-align: center; }
  .vdisc { margin-top: 12rpx; font-size: 28rpx; font-weight: 700; color: #ff5000; }
  .qr { width: 420rpx; height: 420rpx; margin: 32rpx 0 24rpx; }
  .code { font-size: 40rpx; font-weight: 800; letter-spacing: 4rpx; color: #1a1a1a; }
  .code.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .vtime { margin-top: 16rpx; font-size: 24rpx; color: #999; }
  .tip { margin-top: 32rpx; font-size: 26rpx; color: #666; text-align: center; line-height: 1.6; }
}
</style>
```

- [ ] **Step 3: 钱包页加「出示券码」入口**

`pages/coupon/index.vue`：在每张券卡（未使用且 `usageScene` 为 `IN_STORE` 或 `ALL`）的操作区，新增一个跳转按钮，点击进入券码页：

```vue
<view
  v-if="c.status === 'UNUSED' && (c.usageScene === 'IN_STORE' || c.usageScene === 'ALL')"
  class="show-code"
  @tap="goCode(c)"
>
  {{ t('coupon.showCode') }}
</view>
```

同文件 `script` 中新增方法：

```ts
function goCode(c: any) {
  const discount = c.template?.type === 'PERCENT'
    ? t('coupon.discountPercent', { n: (c.template?.discountValue ?? 0) / 10 })
    : c.template?.type === 'FIXED'
      ? t('coupon.discountFixed', { n: (c.template?.discountValue ?? 0) / 100 })
      : '';
  navigateTo({
    path: '/coupon/code',
    query: {
      code: c.code ?? '',
      name: c.template?.name ?? '',
      expiresAt: c.expiresAt ?? '',
      discount,
    },
  });
}
```

（`navigateTo` 若该文件用 `uni.navigateTo`，按文件现有写法替换；`discountValue` 单位沿用券模板既有约定：PERCENT 为 80=8 折，FIXED 为分。）

- [ ] **Step 4: 12 个语言包补词条**

对 `d:\zhao\nshop\layers\base\i18n\locales\` 下**全部 12 个**语言包，在 `coupon` 块内追加以下键（`zh-CN.ts` 用中文，其余 11 个用英文兜底值）：

```ts
    codeValidUntil: '有效期至',
    codeTip: '请向商户出示此券码，核销后按券折扣结算',
    showCode: '出示券码',
    discountPercent: '{n} 折',
    discountFixed: '减 {n} 元',
```

其余 11 个语言包对应英文：

```ts
    codeValidUntil: 'Valid until',
    codeTip: 'Show this code to the merchant; settle at the coupon discount after redemption.',
    showCode: 'Show code',
    discountPercent: '{n}0% off',
    discountFixed: '¥{n} off',
```

（`zh-CN.ts` 的 `discountPercent` 用「{n} 折」符合中文习惯；英文包用百分比表述。数值计算已在 Step 3 完成，此处 `n` 仅用于展示。）

- [ ] **Step 5: 本地验证**

Run（cwd `d:\zhao\nshop`）: `npm run dev`
Expected: 打开「我的优惠券」→ 到店买单券卡片出现「出示券码」→ 点击进入券码页，展示二维码 + 大字券码 + 有效期 + 提示语；切换语言后文案随之切换

- [ ] **Step 6: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/composables/useCoupon.ts layers/base/app/pages/coupon/code.vue layers/base/app/pages/coupon/index.vue layers/base/i18n/locales
git -C d:/zhao/nshop commit -m "feat(nshop): 到店买单券码页 + 券包出示入口 + 12 语言包"
```

---

## Task 14: 顾客端验证 — 构建、手机截图与操作手册

**Files:**
- Create: `d:\zhao\nshop\docs\superpowers\manual\coupon-in-store\README.md`
- Create: `d:\zhao\nshop\docs\superpowers\manual\coupon-in-store\*.png`（截图）

- [ ] **Step 1: 构建**

Run（cwd `d:\zhao\nshop`）: `npm run build`
Expected: 构建成功，产物落在 `.output/public`（构建命令若为 `npm run generate` 或 `npm run build`，按 `package.json` 现有脚本执行）

- [ ] **Step 2: 手机视口截图**

Playwright，手机视口 390×844、dpr=2：

1. 我的优惠券列表：「到店买单」券卡片显示「出示券码」按钮（截图 `coupon-list.png`）
2. 券码页：二维码 + 大字券码 + 有效期 + 提示语齐全（截图 `coupon-code.png`）

- [ ] **Step 3: 写操作手册**

创建 `d:\zhao\nshop\docs\superpowers\manual\coupon-in-store\README.md`：

```markdown
# 到店买单（顾客端）操作手册

## 功能说明
平台不收款。顾客领取「到店买单券」，到店向商户出示券码，商户核销后按券折扣线下结算。

## 领券
在「我的优惠券 / 券包」中查看已领取的到店买单券（使用场景为「到店买单」或「通用」）。

![券列表](coupon-list.png)

## 到店出示券码
1. 在券卡上点「出示券码」
2. 把二维码或券码出示给商户
3. 商户核销后，按券折扣付款给商户（平台不参与收款）

![券码](coupon-code.png)

## 常见问题
- 看不到「出示券码」按钮：该券为「仅线上」场景，或已使用/已过期
```

- [ ] **Step 4: 提交**

```bash
git -C d:/zhao/nshop add docs/superpowers/manual/coupon-in-store
git -C d:/zhao/nshop commit -m "docs(nshop): 到店买单操作手册（含手机视口截图）"
```

---

## Task 15: 三端提交 → 推送 → 部署（一气呵成）

**Files:** 无（发布动作）

- [ ] **Step 1: 本地构建 vendure（服务器不解压构建）**

Run（cwd `d:\zhao\vendure`）: `yarn build`（若为 `npm run build` 按 `package.json` 执行）
Expected: `packages/coupon-plugin/lib` 等产物更新

- [ ] **Step 2: 提交三端仓库改动**

```bash
git -C d:/zhao/vendure add packages/coupon-plugin
git -C d:/zhao/vendure commit -m "feat(coupon): 到店买单券（usageScene + in_store_bill 表 + 核销/流水 API）"

git -C d:/zhao/vshop add web-admin
git -C d:/zhao/vshop commit -m "feat(admin): 到店买单核销页/流水页/菜单/文案 + 手册"

git -C d:/zhao/nshop add layers docs
git -C d:/zhao/nshop commit -m "feat(nshop): 到店买单券码页与券包入口 + 手册"
```

- [ ] **Step 3: 推送**

```bash
git -C d:/zhao/vendure push
git -C d:/zhao/vshop push
git -C d:/zhao/nshop push
```

- [ ] **Step 4: 部署 vendure（git pull + pm2）**

服务器执行（vendure 仓库 `/www/apps/vendure`）：

```bash
cd /www/apps/vendure && git pull
pm2 restart vendure --update-env
pm2 restart vendure-worker --update-env
```

Expected: 启动日志出现 `InStoreBill` 实体与迁移执行；`in_store_bill` 表已建、`coupon_template.usageScene` 列已补

- [ ] **Step 5: 部署 web-admin**

Run（cwd `d:\zhao\vshop\web-admin`）: `node scripts/deploy.mjs`
Expected: 产物上传并解压到服务器静态目录，无报错

- [ ] **Step 6: 部署 nshop**

Run（cwd `d:\zhao\nshop`）: `npm run deploy`
Expected: 静态产物部署到 nshop 站点目录，无报错

- [ ] **Step 7: 线上冒烟**

Expected:
- 后台新建/编辑一张 IN_STORE 券 → 顾客端领取 → 后台核销页可查到券 → 核销成功 → 流水页可见该笔
- 顾客端券包可见「出示券码」并可打开券码页

---

## Self-Review

**1. Spec 覆盖**

| Spec 条目 | 覆盖任务 |
| --- | --- |
| §5 券模板 `usageScene` 字段 + 迁移 | Task 1 |
| §6 折扣计算纯函数（PERCENT/FIXED、门槛、非法金额、FREE_SHIPPING 不支持） | Task 2 |
| §7 `in_store_bill` 实体与建表迁移 | Task 3 |
| §8 核销校验链（定位/场景/渠道/状态/过期）与试算 | Task 4 |
| §9 核销落库与并发（条件更新判 affected） | Task 5 |
| §10 流水列表与汇总（按渠道隔离、时间倒序、上限） | Task 6 |
| §11 SDL / Resolver / e2e（含权限 UpdateOrder） | Task 7 |
| §11.2 核销页（券信息卡 + 手填原价 + 实时试算 + 二次确认） | Task 10 |
| §11.1 流水页 + 菜单 + i18n | Task 11 |
| §11.3 顾客端券码页与钱包入口 | Task 13 |
| §12 多语言（nshop 12 包 / web-admin 2 包） | Task 11、Task 13 |
| §13 手册与手机视口截图 | Task 12、Task 14 |
| §14 提交/推送/部署 | Task 15 |

无未覆盖条目。

**2. 占位符扫描**

- 计划中不存在 TBD / TODO / 「稍后实现」/「类似 Task N」等占位表达。
- 所有代码步骤均给出可粘贴的完整代码块。
- 唯一「按现有文件写法调整」的说明集中在两处（`menus.ts` 配色键、nshop `navigateTo` 调用形式），已给出明确替换范围，不留空白。

**3. 类型与命名一致性**

- `CouponUsageScene = 'ONLINE' | 'IN_STORE' | 'ALL'`：Task 1 定义，Task 7（SDL enum）、Task 13（前端类型）引用一致。
- 纯函数 `computeInStoreBill` / 常量 `IN_STORE_REASON`、`IN_STORE_REASON_MESSAGES`：Task 2 定义，Task 4（`locate`）引用一致。
- 实体 `InStoreBill` 字段名（`couponCode` / `originalAmount` / `discountAmount` / `finalAmount` / `billedAt` / `operatorName`）：Task 3 定义，Task 5/6/7、Task 11 流水页字段名一致。
- 服务方法 `quote()` / `redeem()` / `list()` / `summary()`：Task 4/5/6 定义，Task 7 Resolver 调用一致。
- 前端 API `fetchInStoreBills` 返回 `{ items, totalItems }`，与 Task 6 `list()` 返回结构一致；`fetchInStoreBillSummary` 返回 `{ count, originalTotal, discountTotal, finalTotal }`，与 Task 6 `summary()` 一致。
- GraphQL 入参 `inStoreBillQuote(originalAmount: Int)` 可空：Task 7 SDL 与 Task 10 调用一致（计划头「刻意细化 1」）。

**4. 与 spec 的两处刻意细化（以本计划为准）**

1. `inStoreBillQuote.originalAmount` 改为可空，null 时只回券信息；解决「填原价前需先展示券信息卡」与 spec 的 `Int!` 冲突。
2. 业务逻辑落在新建 `in-store-bill.service.ts`，仅将 `CouponService.templateBelongsToChannel` 由 private 提为 public 复用（`coupon.service.ts` 已 1080 行，避免继续膨胀）。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-01-in-store-bill-coupon.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**