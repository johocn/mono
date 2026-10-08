# 统一支付计划（预订/分期/租赁）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已定稿设计（方案 C）交付统一「期次调度层」：新建 `payment-schedule-plugin`，改造 `pre-sale-plugin` 接入期次实例与兼容薄壳，新建 `installment-plugin` / `rental-plugin` 两场景插件，nshop C 端新增首笔款弹窗（版式 A）与支付计划条 ScheduleBar，Admin API 提供调度管理。

**Architecture:** 期次调度收敛到独立插件 `payment-schedule-plugin`（实体/触发与违约动作/ScheduledTask/PartiallyPaid 状态机/paySchedulePeriod API）。场景插件（presale/installment/rental）只负责「配置 + 下单时生成期次实例」，经运行时软依赖（`require` + `Injector.get`）调用调度服务，避免编译期耦合。旧 `Deposited` 状态保留别名兼容；预订订单仍走 `Deposited`，新场景走 `PartiallyPaid`。

**Tech Stack:** Vendure 3.6（NestJS/TypeORM/GraphQL/ScheduledTask）、vitest + @vendure/testing e2e（sqljs）、Nuxt 3（nshop layers/base、nuxt-graphql-client、i18n）。

**规格来源:** `d:\zhao\docs\superpowers\specs\2026-10-08-payment-schedule-design.md`（必读，决策记录/违约矩阵/合规硬点以此为准）

---

## 0. 工程约定（所有任务通用）

### 0.1 仓库与路径

| 仓库/位置 | 路径 |
|---|---|
| 主仓（计划/手册/设计文档） | `d:\zhao`（git 根） |
| Vendure 后端 monorepo | `d:\zhao\vendure` |
| nshop 前端 | `d:\zhao\nshop`（layers/base 结构） |
| 参考插件（四件套样板） | `d:\zhao\vendure\packages\pre-sale-plugin\` |
| e2e 公共设施 | `d:\zhao\vendure\e2e-common\`（initialData/testConfig）、`packages\core\e2e\fixtures\test-payment-methods.ts` |

### 0.2 Shell（Windows PowerShell）硬规则

- **不支持 `&&`**：用 `;` 分隔或分两条执行。
- 无 `tail`/`ls -la`：用 `Select-Object -Last N` / `Get-ChildItem`。
- 多行 commit message：先写入临时文件再 `git commit -F`，且**勿用** `Set-Content -Encoding utf8`（BOM 会混入标题）。用：
  ```powershell
  $msg = @'
  feat(payment-schedule): xxx
  xxx
  '@
  [IO.File]::WriteAllText("$env:TEMP\cs.txt", $msg, [Text.UTF8Encoding]::new($false))
  git commit -F "$env:TEMP\cs.txt"
  ```
- vendure 仓提交身份用仓库现有身份；nshop 仓若报 Author identity unknown，先执行 `git config user.name johocn; git config user.email johocn@163.com`。

### 0.3 构建与测试命令

- 新包构建：在 `d:\zhao\vendure\packages\<pkg>` 下 `npm run build`（rimraf lib + tsc）。
- 新包单测：`npm test`（vitest，`src/**/*.spec.ts`）。
- e2e：在包目录 `npm run e2e`。**schema/实体变更后必须删除 e2e 缓存**：`Remove-Item -Recurse -Force packages\<pkg>\e2e\__data__`（若存在）。
- 根目录新包链接：在 `d:\zhao\vendure` 执行 `npm install`（workspaces: packages/*，package-lock 会生成 `node_modules/@vendure/<pkg>` link）。
- **跨包软依赖的类身份问题（关键）**：e2e 中跨插件引用一律用**构建后 lib 包名导入**（`@vendure/payment-schedule-plugin` 等），不要混用 `../src/plugin` 与包名两种来源，否则 Nest DI 按类身份查找会失败。涉及插件改动后先 `npm run build` 再跑相关 e2e。

### 0.4 提交规范

vendure 仓有 commitlint（conventional）：`feat(scope): ...` / `fix(scope): ...`，中文描述。每任务一次提交，完成后立即 commit。

### 0.5 范围说明

- 后台管理 = Admin GraphQL API（沿用 admin resolver 模式，对应设计第 9 节「落在 Vendure Admin」），不做 dashboard 自定义 React UI；操作手册覆盖调用方式。
- 通知复用 `wechat-subscribe-message-plugin` 的 `SubscribeMessageService.sendCustomMessage`（软依赖），模板 id 从渠道 customFields 读取（`scheduleTailOpenedTemplateId` / `scheduleOverdueTemplateId` / `scheduleBreachNoticeTemplateId` / `scheduleRefundTemplateId`），未配置即跳过——不改通知插件本身。
- `feeRule`（分期手续费）仅登记配置，金额计算暂不计费（设计第 11 节：资金方分期/费率引擎不在本次范围）。

### 0.6 文件结构总览（Create/Modify 全量映射）

```
vendure/packages/payment-schedule-plugin/        [新建包]
  package.json / tsconfig.json / tsconfig.build.json / vitest.config.mts / index.ts
  src/constants.ts  src/types.ts  src/schedule-config.ts(+spec) 
  src/order-payment-schedule.entity.ts  src/order-schedule-item.entity.ts
  src/payment-schedule-runtime.ts  src/notification.ts
  src/payment-schedule.service.ts  src/payment-schedule.order-process.ts
  src/order-custom-fields.ts  src/payment-schedule.job.ts
  src/payment-schedule-shop.resolver.ts  src/payment-schedule-admin.resolver.ts
  src/plugin.ts
  e2e/payment-schedule.e2e-spec.ts
vendure/packages/group-buy-plugin/               [微调]
  src/events.ts [新建]  src/group-buy.service.ts [改:发布事件]  index.ts [改:导出]
vendure/packages/pre-sale-plugin/                [改造]
  src/pre-sale-activity.entity.ts [改:新列]  src/plugin.ts [改:schema]
  src/pre-sale.service.ts [改:20%校验/applyPreSale/薄壳]  src/pre-sale-runtime.ts [改:injector]
  src/payment-schedule-bridge.ts [新建]
  e2e/pre-sale.e2e-spec.ts [改:新用例]
vendure/packages/installment-plugin/             [新建包]
  同四件套 + src/installment-plan.entity.ts + admin/shop resolver
  e2e/installment.e2e-spec.ts
vendure/packages/rental-plugin/                  [新建包]
  同四件套 + src/rental-plan.entity.ts + admin/shop resolver
  e2e/rental.e2e-spec.ts
vendure/packages/dev-server/dev-config.ts        [改:注册插件]
nshop/layers/base/
  gql/fragments/payment-schedule.gql [新建]
  gql/queries/payment-schedule.gql [新建]
  app/composables/usePaymentSchedule.ts [新建]
  app/components/schedule/ScheduleDialog.vue [新建]  ScheduleBar.vue [新建]
  app/utils/order-state.ts [改:PartiallyPaid/Deposited]
  app/pages/account/orders/[code].vue [改:接入 ScheduleBar]
  i18n/locales/zh-CN.ts / en-US.ts [改:messages.schedule.*]
nshop/types/payment-schedule.ts [新建:镜像类型]
docs/manual/payment-schedule/index.md [新建:操作手册+手机截图]
```

---

# 阶段 1：payment-schedule-plugin 调度层

### Task 1: 包骨架（四件套）

**Files:**
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\package.json`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\tsconfig.json`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\tsconfig.build.json`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\vitest.config.mts`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\index.ts`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\constants.ts`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\types.ts`

- [x] **Step 1: 创建 package.json**（仿 pre-sale-plugin）

```json
{
    "name": "@vendure/payment-schedule-plugin",
    "version": "0.0.1",
    "license": "GPL-3.0-or-later",
    "main": "lib/index.js",
    "types": "lib/index.d.ts",
    "files": ["lib/**/*"],
    "scripts": {
        "watch": "tsc -p ./tsconfig.build.json --watch",
        "build": "rimraf lib && tsc -p ./tsconfig.build.json",
        "lint": "eslint --fix .",
        "test": "vitest --config vitest.config.mts --run src",
        "e2e": "cross-env PACKAGE=payment-schedule-plugin vitest --config vitest.config.mts --run"
    },
    "dependencies": {},
    "peerDependencies": {
        "@vendure/common": "^3.6.0",
        "@vendure/core": "^3.6.0"
    },
    "devDependencies": {
        "@vendure/common": "3.6.4",
        "@vendure/core": "3.6.4",
        "rimraf": "^5.0.5",
        "typescript": "5.8.2"
    }
}
```

- [x] **Step 2: 创建 tsconfig.json**（与 pre-sale-plugin 相同）

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "removeComments": false,
    "noLib": false,
    "skipLibCheck": true,
    "sourceMap": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [x] **Step 3: 创建 tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "lib",
    "declaration": true,
    "sourceMap": false
  },
  "include": ["src", "index.ts"]
}
```

- [x] **Step 4: 创建 vitest.config.mts**（含单测 include）

```typescript
import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.spec.ts', '**/*.e2e-spec.ts'],
        testTimeout: process.env.E2E_DEBUG ? 1800 * 1000 : process.env.CI ? 30 * 1000 : 15 * 1000,
        allowOnly: true,
    },
    plugins: [
        swc.vite({
            jsc: {
                transform: {
                    useDefineForClassFields: false,
                },
            },
        }),
    ],
});
```

- [x] **Step 5: 创建 src/constants.ts**

```typescript
export const loggerCtx = 'PaymentSchedulePlugin';
export const PAYMENT_SCHEDULE_PLUGIN_OPTIONS = Symbol('PAYMENT_SCHEDULE_PLUGIN_OPTIONS');
```

- [x] **Step 6: 创建 src/types.ts**

```typescript
export interface PaymentSchedulePluginOptions {
    /** 未显式配置宽限期时的默认值（小时） */
    defaultGraceHours?: number;
}
```

- [x] **Step 7: 创建 index.ts（先导出已有文件，后续任务追加）**

```typescript
export * from './src/constants';
export * from './src/types';
```

- [x] **Step 8: 根目录链接依赖并构建验证**

在 `d:\zhao\vendure` 执行：`npm install`
预期：package-lock 出现 `@vendure/payment-schedule-plugin` link。

在 `d:\zhao\vendure\packages\payment-schedule-plugin` 执行：`npm run build`
预期：无报错，生成 `lib/index.js`。

- [x] **Step 9: Commit**

```powershell
git add packages/payment-schedule-plugin
git commit -m "feat(payment-schedule): 新增统一支付计划插件包骨架（四件套）"
```

---

### Task 2: 调度配置纯函数 + 单测（TDD）

**Files:**
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\schedule-config.ts`
- Test: `d:\zhao\vendure\packages\payment-schedule-plugin\src\schedule-config.spec.ts`

- [x] **Step 1: 写失败单测** `src/schedule-config.spec.ts`

```typescript
import { describe, expect, it } from 'vitest';

import {
    addInterval,
    computeDueAt,
    earnestRefundAmount,
    isTriggerSatisfied,
    lateFeeAccrued,
    LEGAL_DEPOSIT_CAP_RATIO,
    parseDepositRule,
    parseTrigger,
    splitInstallmentAmounts,
} from './schedule-config';

describe('parseDepositRule', () => {
    it('合法 kind 解析通过', () => {
        expect(parseDepositRule({ kind: 'legal_deposit', capRatio: 0.2 })).toEqual({
            kind: 'legal_deposit',
            capRatio: 0.2,
        });
    });
    it('earnest 带 partial 策略', () => {
        expect(
            parseDepositRule({ kind: 'earnest', earnestRefundPolicy: { onTimeout: 'partial', partialRate: 0.5 } }),
        ).toEqual({
            kind: 'earnest',
            earnestRefundPolicy: { onTimeout: 'partial', partialRate: 0.5 },
        });
    });
    it('坏 JSON / 非法 kind 返回 null', () => {
        expect(parseDepositRule(null)).toBeNull();
        expect(parseDepositRule('x')).toBeNull();
        expect(parseDepositRule({ kind: 'nope' })).toBeNull();
    });
});

describe('parseTrigger', () => {
    it('date 触发器', () => {
        expect(parseTrigger({ type: 'date', at: '2026-01-01T00:00:00.000Z' })).toEqual({
            type: 'date',
            at: '2026-01-01T00:00:00.000Z',
        });
    });
    it('interval 触发器', () => {
        expect(parseTrigger({ type: 'interval', unit: 'month', count: 2, anchor: 'order_placed' })).toEqual({
            type: 'interval',
            unit: 'month',
            count: 2,
            anchor: 'order_placed',
        });
    });
    it('group_buy / manual', () => {
        expect(parseTrigger({ type: 'group_buy', groupBuyActivityId: 3 })).toEqual({
            type: 'group_buy',
            groupBuyActivityId: 3,
        });
        expect(parseTrigger({ type: 'manual' })).toEqual({ type: 'manual' });
        expect(parseTrigger({ type: 'wat' })).toBeNull();
    });
});

describe('addInterval / computeDueAt', () => {
    it('day/week/month 递增', () => {
        const from = new Date('2026-01-30T00:00:00.000Z');
        expect(addInterval(from, 'day', 1).getUTCDate()).toBe(31);
        expect(addInterval(from, 'week', 1).getUTCDate()).toBe(6);
        // 月末溢出由 Date.setMonth 归约到 3 月 2 日（1月30 + 1月 + 1月 = 3月，非闰年 30+28 天溢出）
        expect(addInterval(from, 'month', 1).getUTCMonth()).toBe(2);
    });
    it('computeDueAt: date→at; interval→anchor+count; manual/group_buy→null', () => {
        const anchor = new Date('2026-01-01T00:00:00.000Z');
        expect(computeDueAt({ type: 'date', at: '2026-02-01T00:00:00.000Z' }, anchor)).toEqual(
            new Date('2026-02-01T00:00:00.000Z'),
        );
        expect(computeDueAt({ type: 'interval', unit: 'day', count: 7, anchor: 'order_placed' }, anchor)).toEqual(
            new Date('2026-01-08T00:00:00.000Z'),
        );
        expect(computeDueAt({ type: 'manual' }, anchor)).toBeNull();
        expect(computeDueAt({ type: 'group_buy', groupBuyActivityId: 1 }, anchor)).toBeNull();
    });
});

describe('isTriggerSatisfied', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    it('date 到点满足', () => {
        expect(isTriggerSatisfied({ type: 'date', at: '2026-05-31T00:00:00.000Z' }, null, now)).toBe(true);
        expect(isTriggerSatisfied({ type: 'date', at: '2026-06-02T00:00:00.000Z' }, null, now)).toBe(false);
    });
    it('interval 按 dueAt 判定', () => {
        expect(isTriggerSatisfied({ type: 'interval', unit: 'day', count: 1, anchor: 'order_placed' }, { dueAt: new Date('2026-05-31T00:00:00.000Z') }, now)).toBe(true);
        expect(isTriggerSatisfied({ type: 'interval', unit: 'day', count: 1, anchor: 'order_placed' }, { dueAt: null }, now)).toBe(false);
    });
    it('manual / group_buy 永不由时间判定满足', () => {
        expect(isTriggerSatisfied({ type: 'manual' }, null, now)).toBe(false);
        expect(isTriggerSatisfied({ type: 'group_buy', groupBuyActivityId: 1 }, null, now)).toBe(false);
    });
});

describe('lateFeeAccrued', () => {
    const rule = { dailyRate: 0.001 };
    it('非 overdue / 无规则 / 宽限期内 → 0', () => {
        const now = new Date('2026-06-01T00:00:00.000Z');
        expect(lateFeeAccrued({ amount: 10000, status: 'payable', dueAt: '2026-05-01T00:00:00.000Z', graceHours: 72, lateFeeRule: rule }, now)).toBe(0);
        expect(lateFeeAccrued({ amount: 10000, status: 'overdue', dueAt: '2026-05-01T00:00:00.000Z', graceHours: 0, lateFeeRule: null }, now)).toBe(0);
        expect(lateFeeAccrued({ amount: 10000, status: 'overdue', dueAt: '2026-05-31T12:00:00.000Z', graceHours: 0, lateFeeRule: rule }, now)).toBe(0);
    });
    it('按天累计：逾期 3 天 = floor(amount * dailyRate * 3)', () => {
        const now = new Date('2026-06-04T00:00:00.000Z');
        expect(lateFeeAccrued({ amount: 100000, status: 'overdue', dueAt: '2026-06-01T00:00:00.000Z', graceHours: 0, lateFeeRule: rule }, now)).toBe(300);
    });
});

describe('earnestRefundAmount', () => {
    it('无策略或 full → 全额', () => {
        expect(earnestRefundAmount({ amount: 30000 }, { kind: 'earnest' })).toBe(30000);
        expect(earnestRefundAmount({ amount: 30000 }, { kind: 'earnest', earnestRefundPolicy: { onTimeout: 'full' } })).toBe(30000);
    });
    it('partial → floor(amount * rate)，rate 钳制 [0,1]', () => {
        expect(
            earnestRefundAmount({ amount: 30001 }, { kind: 'earnest', earnestRefundPolicy: { onTimeout: 'partial', partialRate: 0.5 } }),
        ).toBe(15000);
        expect(
            earnestRefundAmount({ amount: 30000 }, { kind: 'earnest', earnestRefundPolicy: { onTimeout: 'partial', partialRate: 5 } }),
        ).toBe(30000);
        expect(
            earnestRefundAmount({ amount: 30000 }, { kind: 'earnest', earnestRefundPolicy: { onTimeout: 'partial', partialRate: -1 } }),
        ).toBe(0);
    });
});

describe('splitInstallmentAmounts', () => {
    it('首付 + 均分期次，余数并入末期', () => {
        // 1000 分首付 10% → 100；余 900 分 4 期 → 225*4
        expect(splitInstallmentAmounts(1000, 10, 4)).toEqual([100, 225, 225, 225, 225]);
        // 余数：1000 分首付 0% 3 期 → 333/333/334
        expect(splitInstallmentAmounts(1000, 0, 3)).toEqual([0, 333, 333, 334]);
        // 合计守恒
        const parts = splitInstallmentAmounts(9999, 20, 7);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(9999);
    });
});

describe('LEGAL_DEPOSIT_CAP_RATIO', () => {
    it('法定定金上限比例 0.2', () => {
        expect(LEGAL_DEPOSIT_CAP_RATIO).toBe(0.2);
    });
});
```

- [x] **Step 2: 运行确认失败**

在包目录执行：`npm test`
预期：FAIL，报 `Cannot find module './schedule-config'`。

- [x] **Step 3: 实现 schedule-config.ts**

```typescript
/**
 * 统一支付计划：配置结构与纯函数（SSR/调度/单测共用，无 IO）。
 * 金额单位一律「分」，比例一律小数（0.2 = 20%），期次宽限单位小时。
 */

export type ScheduleScenario = 'presale' | 'installment' | 'rental';
export type DeliveryGate = 'all_paid' | 'first_period' | 'deposit_paid';
export type DepositKind = 'legal_deposit' | 'earnest' | 'down_payment' | 'security_deposit';
export type ItemKind = 'deposit' | 'balance' | 'down_payment' | 'installment' | 'rent' | 'buyout';
export type ScheduleStatus = 'pending' | 'in_progress' | 'completed' | 'breached' | 'cancelled';
export type ItemStatus = 'locked' | 'payable' | 'paid' | 'overdue' | 'forfeited' | 'refunded' | 'waived';
export type ScheduleBreachType = 'buyer_timeout' | 'seller_breach' | 'group_buy_failed';

export const LEGAL_DEPOSIT_CAP_RATIO = 0.2;

/** COD 仅允许出现在尾款/租金/分期期（设计 §2：仅尾款期/租金期） */
export const COD_ALLOWED_KINDS: ReadonlyArray<ItemKind> = ['balance', 'installment', 'rent'];

export interface DepositRule {
    kind: DepositKind;
    capRatio?: number;
    earnestRefundPolicy?: { onTimeout: 'full' | 'partial'; partialRate?: number };
}

export interface LateFeeRule {
    /** 每日滞纳金比例（0.001 = 0.1%/天） */
    dailyRate: number;
}

export type ScheduleTrigger =
    | { type: 'date'; at: string }
    | { type: 'interval'; unit: 'day' | 'week' | 'month'; count: number; anchor: 'order_placed' | 'shipped' }
    | { type: 'group_buy'; groupBuyActivityId: number }
    | { type: 'manual' };

const DEPOSIT_KINDS: ReadonlyArray<DepositKind> = [
    'legal_deposit',
    'earnest',
    'down_payment',
    'security_deposit',
];

const INTERVAL_UNITS = ['day', 'week', 'month'] as const;

export function parseDepositRule(v: unknown): DepositRule | null {
    if (!v || typeof v !== 'object') return null;
    const r = v as Record<string, unknown>;
    if (typeof r.kind !== 'string' || !DEPOSIT_KINDS.includes(r.kind as DepositKind)) return null;
    const rule: DepositRule = { kind: r.kind as DepositKind };
    if (typeof r.capRatio === 'number' && r.capRatio > 0 && r.capRatio < 1) rule.capRatio = r.capRatio;
    if (r.earnestRefundPolicy && typeof r.earnestRefundPolicy === 'object') {
        const p = r.earnestRefundPolicy as Record<string, unknown>;
        if (p.onTimeout === 'full' || p.onTimeout === 'partial') {
            rule.earnestRefundPolicy = { onTimeout: p.onTimeout };
            if (p.onTimeout === 'partial' && typeof p.partialRate === 'number') {
                rule.earnestRefundPolicy.partialRate = Math.min(Math.max(p.partialRate, 0), 1);
            }
        }
    }
    return rule;
}

export function parseTrigger(v: unknown): ScheduleTrigger | null {
    if (!v || typeof v !== 'object') return null;
    const t = v as Record<string, unknown>;
    switch (t.type) {
        case 'date':
            return typeof t.at === 'string' ? { type: 'date', at: t.at } : null;
        case 'interval':
            if (
                (typeof t.unit === 'string' && INTERVAL_UNITS.includes(t.unit as any)) &&
                typeof t.count === 'number' && t.count >= 0 &&
                (t.anchor === 'order_placed' || t.anchor === 'shipped')
            ) {
                return {
                    type: 'interval',
                    unit: t.unit as 'day' | 'week' | 'month',
                    count: t.count,
                    anchor: t.anchor,
                };
            }
            return null;
        case 'group_buy':
            return typeof t.groupBuyActivityId === 'number'
                ? { type: 'group_buy', groupBuyActivityId: t.groupBuyActivityId }
                : null;
        case 'manual':
            return { type: 'manual' };
        default:
            return null;
    }
}

export function addInterval(from: Date, unit: 'day' | 'week' | 'month', count: number): Date {
    const d = new Date(from.getTime());
    switch (unit) {
        case 'day':
            d.setDate(d.getDate() + count);
            break;
        case 'week':
            d.setDate(d.getDate() + count * 7);
            break;
        case 'month':
            d.setMonth(d.getMonth() + count);
            break;
    }
    return d;
}

/** 计算期次应付时点：date→at；interval→anchorTime + count 单位；manual/group_buy→null（由事件/手动开启） */
export function computeDueAt(trigger: ScheduleTrigger, anchorTime: Date): Date | null {
    switch (trigger.type) {
        case 'date':
            return trigger.at ? new Date(trigger.at) : null;
        case 'interval':
            return addInterval(anchorTime, trigger.unit, trigger.count);
        default:
            return null;
    }
}

/** 触发条件是否已满足（时间型）；manual/group_buy 由事件/管理员开启，不按时间判定 */
export function isTriggerSatisfied(
    trigger: ScheduleTrigger | null,
    item: { dueAt?: Date | null } | null,
    now: Date,
): boolean {
    if (!trigger) return false;
    switch (trigger.type) {
        case 'date':
            return !!trigger.at && now >= new Date(trigger.at);
        case 'interval':
            return !!item?.dueAt && now >= item.dueAt;
        default:
            return false;
    }
}

/** 滞纳金（仅 overdue 且配置 lateFeeRule；按完整天累计，不足 1 天计 0） */
export function lateFeeAccrued(
    item: {
        amount: number;
        status: string;
        dueAt?: Date | string | null;
        graceHours?: number;
        lateFeeRule?: LateFeeRule | null;
    },
    now: Date,
): number {
    if (item.status !== 'overdue' || !item.lateFeeRule || !item.dueAt) return 0;
    const graceEnd = new Date(new Date(item.dueAt).getTime() + (item.graceHours ?? 0) * 3600 * 1000);
    const days = Math.floor((now.getTime() - graceEnd.getTime()) / 86400000);
    if (days < 1) return 0;
    return Math.floor(item.amount * item.lateFeeRule.dailyRate * days);
}

/** 订金退款金额（买家违约/取消时）：full→全额；partial→floor(amount*rate) */
export function earnestRefundAmount(item: { amount: number }, rule: DepositRule): number {
    const policy = rule.earnestRefundPolicy;
    if (!policy || policy.onTimeout !== 'partial') return item.amount;
    const rate = Math.min(Math.max(policy.partialRate ?? 0, 0), 1);
    return Math.floor(item.amount * rate);
}

/** 分期金额拆分：首付 = floor(total*ratio%)；余款均分，余数并入末期。返回 [首付, 期1..期n] */
export function splitInstallmentAmounts(total: number, downRatioPercent: number, periods: number): number[] {
    const down = Math.floor((total * downRatioPercent) / 100);
    const rest = total - down;
    const base = Math.floor(rest / periods);
    const amounts = Array.from({ length: periods }, () => base);
    amounts[amounts.length - 1] += rest - base * periods;
    return [down, ...amounts];
}
```

- [x] **Step 4: 运行单测确认通过**

在包目录执行：`npm test`
预期：PASS（schedule-config.spec.ts 全部用例通过）。

- [x] **Step 5: 更新 index.ts 导出**

```typescript
export * from './src/constants';
export * from './src/types';
export * from './src/schedule-config';
```

- [x] **Step 6: Commit**

```powershell
git add packages/payment-schedule-plugin
git commit -m "feat(payment-schedule): 调度配置纯函数（触发器/滞纳金/订金退款/分期拆分）+ 单测"
```

---

### Task 3: 实体（OrderPaymentSchedule / OrderScheduleItem）

**Files:**
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\order-payment-schedule.entity.ts`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\order-schedule-item.entity.ts`

- [x] **Step 1: 创建订单级调度实体**

```typescript
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { Channel, ChannelAware, DeepPartial, VendureEntity } from '@vendure/core';

import { DeliveryGate, DepositRule, ScheduleBreachType, ScheduleScenario, ScheduleStatus } from './schedule-config';

/**
 * 订单级支付计划实例（下单时快照，改配置不影响已生成订单）。
 */
@Entity()
export class OrderPaymentSchedule extends VendureEntity implements ChannelAware {
    constructor(input?: DeepPartial<OrderPaymentSchedule>) {
        super(input);
    }

    @Column({ type: 'int' })
    orderId: number;

    @Column({ type: 'int' })
    channelId: number;

    @Column('varchar')
    scenario: ScheduleScenario;

    /** 发货门控：all_paid（预订：付清才发货）| first_period（分期）| deposit_paid（租赁） */
    @Column('varchar')
    deliveryGate: DeliveryGate;

    /** 款项性质规则（null = 无担保语义，如全款预售） */
    @Column('simple-json', { nullable: true })
    depositRule: DepositRule | null;

    /** 协议版本快照（弹窗勾选留痕依据） */
    @Column('varchar')
    agreementVersion: string;

    @Column('varchar', { default: 'pending' })
    status: ScheduleStatus;

    @Column('varchar', { nullable: true })
    breachType: ScheduleBreachType | null;

    /** 发货承诺（超过未发货 → seller_breach 待确认） */
    @Column({ type: 'datetime', nullable: true })
    shipDeadline: Date | null;

    /** 场景扩展快照（如租赁：{ rental: { buyoutPrice, allowBuyout } }，改配置不影响已生成订单） */
    @Column('simple-json', { nullable: true })
    meta: Record<string, unknown> | null;

    @ManyToMany(() => Channel)
    @JoinTable()
    channels: Channel[];
}
```

- [x] **Step 2: 创建期次实体**

```typescript
import { Column, Entity } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

import { ItemKind, ItemStatus, LateFeeRule, ScheduleTrigger } from './schedule-config';

/**
 * 期次（调度实例的一期）。状态机：
 * locked → payable（触发满足/事件/手动）→ paid / overdue → forfeited | refunded | waived
 * 违约动作只作用于 overdue 期。
 */
@Entity()
export class OrderScheduleItem extends VendureEntity {
    constructor(input?: DeepPartial<OrderScheduleItem>) {
        super(input);
    }

    @Column({ type: 'int' })
    scheduleId: number;

    @Column({ type: 'int' })
    seq: number;

    @Column('varchar')
    kind: ItemKind;

    /** 应付金额（分，下单时快照） */
    @Column({ type: 'int' })
    amount: number;

    /** COD 仅限尾款/租金/分期期（见 COD_ALLOWED_KINDS） */
    @Column({ type: 'boolean', default: false })
    allowCod: boolean;

    @Column('simple-json')
    trigger: ScheduleTrigger;

    /** 计算后的应付时点（date/interval 在创建或解锁时落值） */
    @Column({ type: 'datetime', nullable: true })
    dueAt: Date | null;

    /** 宽限期（小时）：dueAt + graceHours 之后转 overdue */
    @Column({ type: 'int', default: 0 })
    graceHours: number;

    @Column('simple-json', { nullable: true })
    lateFeeRule: LateFeeRule | null;

    @Column('varchar', { default: 'locked' })
    status: ItemStatus;

    @Column({ type: 'datetime', nullable: true })
    paidAt: Date | null;

    @Column({ type: 'int', nullable: true })
    paymentId: number | null;

    /**
     * trigger.type=group_buy 时的镜像列（便于按活动索引查询，JSON 字段无法跨方言检索）。
     */
    @Column({ type: 'int', nullable: true })
    groupBuyActivityId: number | null;
}
```

- [x] **Step 3: 构建**

在包目录执行：`npm run build`
预期：成功。

- [x] **Step 4: Commit**

```powershell
git add packages/payment-schedule-plugin
git commit -m "feat(payment-schedule): OrderPaymentSchedule/OrderScheduleItem 实体"
```

---

### Task 4: 运行时注入 + 调度核心服务

**Files:**
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\payment-schedule-runtime.ts`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\notification.ts`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\payment-schedule.service.ts`

- [x] **Step 1: 运行时注入（静态构造的 OrderProcess/通知延迟获取 DB/Injector）**

```typescript
import { Injector, TransactionalConnection } from '@vendure/core';

/**
 * 静态构造的 OrderProcess onTransitionStart 与通知工具需要在运行期访问 DB/容器。
 * 插件 onApplicationBootstrap 时注入。
 */
let connection: TransactionalConnection | undefined;
let injectorRef: Injector | undefined;

export function setPaymentScheduleRuntime(conn: TransactionalConnection, injector: Injector): void {
    connection = conn;
    injectorRef = injector;
}

export function getPaymentScheduleConnection(): TransactionalConnection {
    if (!connection) {
        throw new Error('PaymentSchedulePlugin TransactionalConnection not initialized');
    }
    return connection;
}

export function getPaymentScheduleInjector(): Injector {
    if (!injectorRef) {
        throw new Error('PaymentSchedulePlugin Injector not initialized');
    }
    return injectorRef;
}

/** 软依赖取容器内 provider：未注册/异常时返回 null */
export function tryGetProvider<T = any>(type: any): T | null {
    try {
        return getPaymentScheduleInjector().get(type, { strict: false }) as T;
    } catch {
        return null;
    }
}
```

- [x] **Step 2: 通知工具（软依赖 wechat-subscribe-message-plugin）**

```typescript
import { Logger, Order, RequestContext } from '@vendure/core';

import { loggerCtx } from './constants';
import { tryGetProvider } from './payment-schedule-runtime';

export type ScheduleTemplateKey =
    | 'scheduleTailOpenedTemplateId'
    | 'scheduleOverdueTemplateId'
    | 'scheduleBreachNoticeTemplateId'
    | 'scheduleRefundTemplateId';

/**
 * 调度通知：模板 id 从渠道 customFields 读取（与 orderPaidTemplateId 同机制），
 * 经 wechat-subscribe-message-plugin 的 SubscribeMessageService.sendCustomMessage 发送。
 * 软依赖：插件未安装 / 渠道未配置模板 / 无 openid 一律静默跳过。
 */
export async function sendScheduleNotice(
    ctx: RequestContext,
    order: Order | null | undefined,
    templateKey: ScheduleTemplateKey,
    data: Record<string, { value: string; color?: string }>,
): Promise<void> {
    try {
        if (!order?.customer) return;
        const cf = (ctx.channel as any)?.customFields ?? {};
        const templateId = cf[templateKey];
        if (!templateId) {
            Logger.debug(`Channel ${ctx.channelId} has no ${templateKey}, skip schedule notice`, loggerCtx);
            return;
        }
        const svc = tryGetProvider<any>(
            require('@vendure/wechat-subscribe-message-plugin').SubscribeMessageService,
        );
        if (!svc) {
            Logger.debug('wechat-subscribe-message-plugin not installed, skip schedule notice', loggerCtx);
            return;
        }
        await svc.sendCustomMessage(ctx, order.customer.id, templateId, data);
    } catch (e: any) {
        Logger.warn(`Schedule notice failed for order ${order?.code}: ${e?.message ?? e}`, loggerCtx);
    }
}
```

- [x] **Step 3: 调度核心服务**

```typescript
import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import {
    ID,
    idsAreEqual,
    Injector,
    ListQueryBuilder,
    ListQueryOptions,
    Logger,
    Order,
    OrderService,
    PaginatedList,
    Payment,
    PaymentService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { sendScheduleNotice } from './notification';
import { loggerCtx } from './constants';
import { OrderPaymentSchedule } from './order-payment-schedule.entity';
import { OrderScheduleItem } from './order-schedule-item.entity';
import {
    COD_ALLOWED_KINDS,
    computeDueAt,
    DepositRule,
    earnestRefundAmount,
    ItemKind,
    lateFeeAccrued,
    parseDepositRule,
    parseTrigger,
    ScheduleStatus,
    ScheduleTrigger,
} from './schedule-config';

export interface CreateScheduleItemInput {
    seq: number;
    kind: ItemKind;
    amount: number;
    allowCod?: boolean;
    trigger: ScheduleTrigger;
    graceHours?: number;
    lateFeeRule?: { dailyRate: number } | null;
}

export interface CreateScheduleInput {
    orderId: ID;
    scenario: 'presale' | 'installment' | 'rental';
    deliveryGate: 'all_paid' | 'first_period' | 'deposit_paid';
    depositRule?: DepositRule | null;
    agreementVersion: string;
    shipDeadline?: Date | null;
    /** 场景扩展快照（租赁买断等），原样落库到实体 meta 列 */
    meta?: Record<string, unknown> | null;
    items: CreateScheduleItemInput[];
}

export interface ScheduleWithItems {
    schedule: OrderPaymentSchedule;
    items: OrderScheduleItem[];
}

// PaymentSettled：租赁买断场景——期次付清→completed→追加买断项拉回 in_progress 后仍需可付（Task 18）
const PAYABLE_SOURCE_STATES = ['ArrangingPayment', 'Deposited', 'PartiallyPaid', 'PaymentSettled'];
const OPEN_SCHEDULE_STATUSES: ReadonlyArray<ScheduleStatus> = ['pending', 'in_progress'];
const TERMINAL_ITEM_STATUSES = ['paid', 'refunded', 'waived', 'forfeited'];

@Injectable()
export class PaymentScheduleService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private orderService: OrderService,
        private paymentService: PaymentService,
    ) {}

    init(_injector: Injector): void {
        // 运行时连接/注入器由 plugin.onApplicationBootstrap 写入 payment-schedule-runtime
    }

    /* ------------------------- 仓储工具 ------------------------- */

    private scheduleRepo(ctx: RequestContext) {
        return this.connection.getRepository(ctx, OrderPaymentSchedule);
    }

    private itemRepo(ctx: RequestContext) {
        return this.connection.getRepository(ctx, OrderScheduleItem);
    }

    private async findItems(ctx: RequestContext, scheduleId: number): Promise<OrderScheduleItem[]> {
        return this.itemRepo(ctx).find({ where: { scheduleId }, order: { seq: 'ASC' } });
    }

    private async orderWithPayments(ctx: RequestContext, orderId: ID): Promise<Order> {
        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId as any },
            relations: ['payments', 'payments.refunds'],
        });
        if (!order) {
            throw new UserInputError(`Order ${orderId} not found`);
        }
        return order;
    }

    private assertOrderOwner(ctx: RequestContext, order: Order): void {
        if ((order as any)?.customer?.user?.id !== ctx.activeUserId) {
            throw new UserInputError('You can only access your own order schedule');
        }
    }

    /* ------------------------- 创建（场景插件调用） ------------------------- */

    async createSchedule(ctx: RequestContext, input: CreateScheduleInput): Promise<OrderPaymentSchedule> {
        const order = await this.orderService.findOne(ctx, input.orderId);
        if (!order) {
            throw new UserInputError(`Order ${input.orderId} not found`);
        }
        const existing = (order.customFields as any)?.paymentScheduleId;
        if (existing) {
            throw new UserInputError(`Order already has a payment schedule (${existing})`);
        }
        if (!input.items.length) {
            throw new UserInputError('Schedule requires at least one item');
        }
        const sorted = [...input.items].sort((a, b) => a.seq - b.seq);
        sorted.forEach((item, i) => {
            if (!(item.amount >= 0)) {
                throw new UserInputError('Item amount must be >= 0');
            }
            if (item.allowCod && !COD_ALLOWED_KINDS.includes(item.kind)) {
                throw new UserInputError(`COD is not allowed for kind ${item.kind} (only balance/installment/rent)`);
            }
            if (i > 0 && item.seq <= sorted[i - 1].seq) {
                throw new UserInputError('Item seq must be strictly increasing');
            }
        });

        const now = new Date();
        const schedule = new OrderPaymentSchedule({
            orderId: Number(input.orderId),
            channelId: ctx.channelId as number,
            scenario: input.scenario,
            deliveryGate: input.deliveryGate,
            depositRule: input.depositRule ?? null,
            agreementVersion: input.agreementVersion,
            shipDeadline: input.shipDeadline ?? null,
            meta: input.meta ?? null,
            status: 'pending',
        });
        schedule.channels = [ctx.channel];
        const savedSchedule = await this.scheduleRepo(ctx).save(schedule);

        const itemEntities = sorted.map((item, idx) => {
            const trigger = item.trigger;
            return new OrderScheduleItem({
                scheduleId: savedSchedule.id,
                seq: item.seq,
                kind: item.kind,
                amount: item.amount,
                allowCod: item.allowCod ?? false,
                trigger,
                dueAt: computeDueAt(trigger, now),
                graceHours: item.graceHours ?? 0,
                lateFeeRule: item.lateFeeRule ?? null,
                // 首期立即可付（首笔款），其余锁定等触发
                status: idx === 0 ? 'payable' : 'locked',
                paidAt: null,
                paymentId: null,
                groupBuyActivityId: trigger.type === 'group_buy' ? trigger.groupBuyActivityId : null,
            });
        });
        await this.itemRepo(ctx).save(itemEntities);

        await this.orderService.updateCustomFields(ctx, order.id, { paymentScheduleId: savedSchedule.id });
        Logger.info(
            `PaymentSchedule ${savedSchedule.id} created for order ${order.code} (${input.scenario}, ${itemEntities.length} items)`,
            loggerCtx,
        );
        return savedSchedule;
    }

    /** 追加期次（租赁买断场景；调度须为 rental 且尚无买断项） */
    async addScheduleItem(
        ctx: RequestContext,
        scheduleId: number,
        input: { kind: ItemKind; amount: number; trigger?: ScheduleTrigger },
    ): Promise<ScheduleWithItems> {
        const schedule = await this.scheduleRepo(ctx).findOne({ where: { id: scheduleId } });
        if (!schedule) {
            throw new UserInputError(`PaymentSchedule ${scheduleId} not found`);
        }
        if (schedule.scenario !== 'rental') {
            throw new UserInputError('Only rental schedules can accept appended items');
        }
        const items = await this.findItems(ctx, scheduleId);
        if (input.kind === 'buyout' && items.some(i => i.kind === 'buyout')) {
            throw new UserInputError('Buyout item already exists');
        }
        if (items.some(i => TERMINAL_ITEM_STATUSES.includes(i.status))) {
            // 已有完结期次（租金付清→completed）时允许追加买断并把调度拉回进行中
        }
        const item = new OrderScheduleItem({
            scheduleId,
            seq: Math.max(0, ...items.map(i => i.seq)) + 1,
            kind: input.kind,
            amount: input.amount,
            allowCod: false,
            trigger: input.trigger ?? { type: 'manual' },
            dueAt: new Date(),
            graceHours: 0,
            lateFeeRule: null,
            status: 'payable',
            paidAt: null,
            paymentId: null,
            groupBuyActivityId: null,
        });
        await this.itemRepo(ctx).save(item);
        if (schedule.status === 'completed') {
            schedule.status = 'in_progress';
            await this.scheduleRepo(ctx).save(schedule);
        }
        return this.getScheduleForOrder(ctx, schedule.orderId) as Promise<ScheduleWithItems>;
    }

    /* ------------------------- 查询 ------------------------- */

    async getScheduleForOrder(
        ctx: RequestContext,
        orderId: ID,
        opts?: { requireOwner?: boolean },
    ): Promise<ScheduleWithItems | null> {
        const order = await this.orderService.findOne(ctx, orderId, ['customer', 'customer.user']);
        if (!order) {
            throw new UserInputError(`Order ${orderId} not found`);
        }
        if (opts?.requireOwner) {
            this.assertOrderOwner(ctx, order);
        }
        const scheduleId = (order.customFields as any)?.paymentScheduleId;
        return this.getScheduleById(ctx, scheduleId ? Number(scheduleId) : null, opts);
    }

    async getScheduleById(
        ctx: RequestContext,
        scheduleId: number | null,
        opts?: { requireOwner?: boolean },
    ): Promise<ScheduleWithItems | null> {
        if (!scheduleId) return null;
        const schedule = await this.scheduleRepo(ctx).findOne({ where: { id: scheduleId } });
        if (!schedule) return null;
        const items = await this.findItems(ctx, schedule.id);
        if (opts?.requireOwner) {
            const order = await this.orderService.findOne(ctx, schedule.orderId, ['customer', 'customer.user']);
            if (!order) {
                throw new UserInputError(`Order ${schedule.orderId} not found`);
            }
            this.assertOrderOwner(ctx, order);
        }
        return { schedule, items };
    }

    async listSchedules(ctx: RequestContext, options?: ListQueryOptions<OrderPaymentSchedule>): Promise<PaginatedList<OrderPaymentSchedule>> {
        return this.listQueryBuilder
            .build(OrderPaymentSchedule, options, {
                ctx,
                channelId: ctx.channelId,
                relations: ['channels'],
            })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    /** GraphQL 呈现（滞纳金/已付统计现算，不落库） */
    presentSchedule(withItems: ScheduleWithItems, now = new Date()) {
        const { schedule, items } = withItems;
        return {
            ...schedule,
            items: items.map(i => ({
                ...i,
                trigger: i.trigger,
                paidAmount: i.status === 'paid' ? i.amount : 0,
                lateFeeAccrued: lateFeeAccrued(i, now),
            })),
            paidTotal: items.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0),
            totalAmount: items.reduce((s, i) => s + i.amount, 0),
        };
    }

    /* ------------------------- 支付 ------------------------- */

    /**
     * 付任意期次（在线/COD 均经此）。
     * Settled → item paid + 推进订单状态；Authorized（COD handler）→ item 留待 confirmCodReceived。
     */
    async paySchedulePeriod(ctx: RequestContext, orderId: ID, seq: number, method: string): Promise<ScheduleWithItems> {
        const order = await this.orderService.findOne(ctx, orderId, ['customer', 'customer.user']);
        if (!order) {
            throw new UserInputError(`Order ${orderId} not found`);
        }
        this.assertOrderOwner(ctx, order);
        if (!PAYABLE_SOURCE_STATES.includes(order.state)) {
            throw new UserInputError(`Order state ${order.state} does not allow period payment`);
        }
        const scheduleId = (order.customFields as any)?.paymentScheduleId;
        const withItems = await this.getScheduleById(ctx, scheduleId);
        if (!withItems) {
            throw new UserInputError('Order has no payment schedule');
        }
        const { schedule, items } = withItems;
        if (!OPEN_SCHEDULE_STATUSES.includes(schedule.status)) {
            throw new UserInputError(`Schedule status ${schedule.status} does not allow payment`);
        }
        const item = items.find(i => i.seq === Number(seq));
        if (!item) {
            throw new UserInputError(`Schedule period ${seq} not found`);
        }
        if (item.status === 'paid' || item.paidAt) {
            throw new UserInputError(`Period ${seq} is already paid`);
        }
        if (!['payable', 'overdue', 'locked'].includes(item.status)) {
            throw new UserInputError(`Period ${seq} is not payable (status: ${item.status})`);
        }
        if (item.status === 'locked' && !this.unlockByTrigger(item, new Date())) {
            throw new UserInputError(`Period ${seq} is locked (trigger not satisfied)`);
        }
        const payment = await this.paymentService.createPayment(ctx, order, item.amount, method, {
            scheduleId: schedule.id,
            seq: item.seq,
        });
        if (payment instanceof Error || (payment as any).errorCode) {
            throw new UserInputError(
                `Payment failed: ${(payment as any).message ?? (payment as any).errorCode ?? 'unknown'}`,
            );
        }
        const state = (payment as Payment).state;
        if (state !== 'Settled' && state !== 'Authorized') {
            throw new UserInputError(`Unexpected payment state: ${state}`);
        }
        if (state === 'Settled') {
            item.status = 'paid';
            item.paidAt = new Date();
        }
        item.paymentId = payment.id;
        await this.itemRepo(ctx).save(item);

        await this.afterItemPaymentRecorded(ctx, order, schedule, items, state);
        const after = await this.getScheduleById(ctx, schedule.id);
        return after as ScheduleWithItems;
    }

    /** locked 期次在支付时刻补偿触发（补偿扫描任务最长 1 分钟延迟）：date 到点 / interval 到点 */
    private unlockByTrigger(item: OrderScheduleItem, now: Date): boolean {
        const trigger = parseTrigger(item.trigger);
        if (trigger?.type === 'date' && trigger.at && now >= new Date(trigger.at)) {
            item.status = 'payable';
            if (!item.dueAt) item.dueAt = new Date(trigger.at);
            return true;
        }
        if (trigger?.type === 'interval' && item.dueAt && now >= item.dueAt) {
            item.status = 'payable';
            return true;
        }
        return false;
    }

    private async afterItemPaymentRecorded(
        ctx: RequestContext,
        order: Order,
        schedule: OrderPaymentSchedule,
        items: OrderScheduleItem[],
        paymentState: 'Settled' | 'Authorized',
    ): Promise<void> {
        if (OPEN_SCHEDULE_STATUSES.includes(schedule.status) && items.some(i => i.status === 'paid')) {
            schedule.status = 'in_progress';
            await this.scheduleRepo(ctx).save(schedule);
        }
        const allTerminal = items.every(i => TERMINAL_ITEM_STATUSES.includes(i.status));
        if (allTerminal && !['breached', 'cancelled'].includes(schedule.status)) {
            schedule.status = 'completed';
            await this.scheduleRepo(ctx).save(schedule);
        }
        if (paymentState !== 'Settled') {
            return; // COD 授权：不动订单状态，等 confirmCodReceived
        }
        const fresh = await this.orderService.findOne(ctx, order.id);
        if (!fresh) return;
        if (allTerminal) {
            if (fresh.state !== 'PaymentSettled') {
                await this.transition(ctx, order.id, 'PaymentSettled');
            }
            return;
        }
        if (fresh.state === 'ArrangingPayment') {
            // 迁移期双读：预订旧语义订单继续走 Deposited；新场景统一 PartiallyPaid
            const legacy = !!(fresh.customFields as any)?.preSaleActivityId;
            await this.transition(ctx, order.id, legacy ? 'Deposited' : 'PartiallyPaid');
        }
    }

    /** COD 环收尾：签收后管理员确认 → settle 授权支付 → item paid → 可能 PaymentSettled */
    async confirmCodReceived(ctx: RequestContext, orderId: ID): Promise<ScheduleWithItems> {
        const withItems = await this.getScheduleForOrder(ctx, orderId);
        if (!withItems) {
            throw new UserInputError('Order has no payment schedule');
        }
        const { schedule, items } = withItems;
        const pendingCod = items.filter(i => i.status === 'payable' && i.paymentId);
        if (!pendingCod.length) {
            throw new UserInputError('No pending COD payments to confirm');
        }
        for (const item of pendingCod) {
            const result = await this.paymentService.settlePayment(ctx, item.paymentId as number);
            if ((result as any)?.errorCode) {
                throw new UserInputError(`Settle payment failed: ${(result as any).message ?? (result as any).errorCode}`);
            }
            item.status = 'paid';
            item.paidAt = new Date();
            await this.itemRepo(ctx).save(item);
        }
        const order = await this.orderService.findOne(ctx, schedule.orderId);
        if (!order) {
            throw new UserInputError(`Order ${schedule.orderId} not found`);
        }
        const refreshed = await this.findItems(ctx, schedule.id);
        await this.afterItemPaymentRecorded(ctx, order, schedule, refreshed, 'Settled');
        return (await this.getScheduleById(ctx, schedule.id)) as ScheduleWithItems;
    }

    /* ------------------------- 取消 / 违约 ------------------------- */

    /**
     * 买家主动取消：
     * - legal_deposit：须 confirmForfeit=true，定金没收（forfeited），其余已付期次全退
     * - earnest：按 earnestRefundPolicy 退（默认全额）
     * - 其他（首付/押金语义）：已付期次全退
     * 未支付期次 → waived；调度 → cancelled；订单 → Cancelled（库存经各插件 Cancelled 订阅释放）。
     */
    async cancelSchedule(ctx: RequestContext, orderId: ID, confirmForfeit: boolean): Promise<ScheduleWithItems> {
        const order = await this.orderService.findOne(ctx, orderId, ['customer', 'customer.user']);
        if (!order) {
            throw new UserInputError(`Order ${orderId} not found`);
        }
        this.assertOrderOwner(ctx, order);
        if (!['AddingItems', 'ArrangingPayment', 'Deposited', 'PartiallyPaid'].includes(order.state)) {
            throw new UserInputError(`Order state ${order.state} does not allow cancellation`);
        }
        const withItems = await this.getScheduleForOrder(ctx, orderId);
        if (!withItems) {
            throw new UserInputError('Order has no payment schedule');
        }
        const { schedule, items } = withItems;
        if (!OPEN_SCHEDULE_STATUSES.includes(schedule.status)) {
            throw new UserInputError(`Schedule cannot be cancelled from status ${schedule.status}`);
        }
        const rule = parseDepositRule(schedule.depositRule);
        const isLegalDeposit = rule?.kind === 'legal_deposit';
        if (isLegalDeposit && !confirmForfeit) {
            throw new UserInputError('legal deposit is non-refundable; pass confirmForfeit=true to accept the penalty');
        }
        const payments = await this.orderService.getOrderPayments(ctx, order.id);
        for (const item of items) {
            if (item.status === 'paid') {
                const payment = payments.find(p => idsAreEqual(p.id, item.paymentId) && p.state === 'Settled');
                let refundAmount = 0;
                if (!isLegalDeposit) {
                    refundAmount =
                        item.kind === 'deposit' && rule?.kind === 'earnest'
                            ? earnestRefundAmount(item, rule)
                            : item.amount;
                }
                if (payment && refundAmount > 0) {
                    const ok = await this.refundPaymentOnce(ctx, order, payment, refundAmount, 'payment schedule cancelled');
                    item.status = ok ? 'refunded' : 'paid';
                    if (!ok) {
                        Logger.warn(`Refund failed for item ${item.id}, kept as paid for manual handling`, loggerCtx);
                    }
                } else if (isLegalDeposit && item.kind === 'deposit') {
                    item.status = 'forfeited';
                } else {
                    item.status = 'refunded';
                }
                continue;
            }
            if (['locked', 'payable', 'overdue'].includes(item.status)) {
                item.status = 'waived';
            }
        }
        await this.itemRepo(ctx).save(items);
        schedule.status = 'cancelled';
        await this.scheduleRepo(ctx).save(schedule);
        await this.cancelOrderSafe(ctx, order.id, 'payment schedule cancelled by buyer');
        return (await this.getScheduleById(ctx, schedule.id)) as ScheduleWithItems;
    }

    /* ------------------------- 调度扫描（ScheduledTask / Admin runScheduleScan 共用） ------------------------- */

    private async channelScheduleIds(ctx: RequestContext): Promise<number[]> {
        const rows = await this.scheduleRepo(ctx)
            .createQueryBuilder('s')
            .innerJoin('s.channels', 'channel', 'channel.id = :cid', { cid: ctx.channelId })
            .getMany();
        return rows.map(r => r.id);
    }

    /** 触发扫描：locked → payable（date 到点 / interval 到点 / group_buy 活动完成或失败） */
    async processTriggers(ctx: RequestContext, now = new Date()): Promise<{ activated: number; failedSchedules: number }> {
        const ids = await this.channelScheduleIds(ctx);
        if (!ids.length) return { activated: 0, failedSchedules: 0 };
        const items = await this.itemRepo(ctx).find({ where: { scheduleId: In(ids), status: 'locked' } });
        let activated = 0;
        let failedSchedules = 0;
        for (const item of items) {
            const trigger = parseTrigger(item.trigger);
            if (!trigger) continue;
            if (trigger.type === 'group_buy') {
                const handled = await this.handleGroupBuyTrigger(ctx, item, trigger.groupBuyActivityId, now);
                if (handled === 'failed') failedSchedules++;
                if (handled === 'activated') activated++;
                continue;
            }
            if (trigger.type === 'date' && trigger.at && now >= new Date(trigger.at)) {
                item.status = 'payable';
                if (!item.dueAt) item.dueAt = new Date(trigger.at);
                await this.itemRepo(ctx).save(item);
                await this.notifyTailOpened(ctx, item);
                activated++;
                continue;
            }
            if (trigger.type === 'interval' && item.dueAt && now >= item.dueAt) {
                item.status = 'payable';
                await this.itemRepo(ctx).save(item);
                await this.notifyTailOpened(ctx, item);
                activated++;
            }
        }
        return { activated, failedSchedules };
    }

    /** group_buy 触发器：软依赖团购活动状态（completed→解锁；expired/过期→按不成团处理） */
    private async handleGroupBuyTrigger(
        ctx: RequestContext,
        item: OrderScheduleItem,
        activityId: number,
        now: Date,
    ): Promise<'activated' | 'failed' | 'none'> {
        const activity = await this.findGroupBuyActivity(activityId);
        if (!activity) return 'none';
        const failed =
            (activity as any).status === 'expired' ||
            ((activity as any).status === 'active' && new Date((activity as any).endAt) < now);
        if (failed) {
            await this.failSchedulesForGroupBuy(ctx, activityId, now);
            return 'failed';
        }
        if ((activity as any).status === 'completed') {
            item.status = 'payable';
            item.dueAt = new Date();
            await this.itemRepo(ctx).save(item);
            await this.notifyTailOpened(ctx, item);
            return 'activated';
        }
        return 'none';
    }

    private async findGroupBuyActivity(activityId: number): Promise<any | null> {
        try {
            const { GroupBuyActivity } = require('@vendure/group-buy-plugin');
            return await this.connection.rawConnection.getRepository(GroupBuyActivity).findOne({
                where: { id: activityId },
            });
        } catch {
            return null;
        }
    }

    /** 团购不成团：已付期次全额原路退，未付 → waived，调度 breached(group_buy_failed)，订单取消 */
    async failSchedulesForGroupBuy(ctx: RequestContext, activityId: number, now = new Date()): Promise<number> {
        const items = await this.itemRepo(ctx).find({ where: { groupBuyActivityId: Number(activityId) } });
        const scheduleIds = Array.from(new Set(items.map(i => i.scheduleId)));
        let count = 0;
        for (const scheduleId of scheduleIds) {
            const schedule = await this.scheduleRepo(ctx).findOne({ where: { id: scheduleId } });
            if (!schedule || !OPEN_SCHEDULE_STATUSES.includes(schedule.status)) continue;
            const all = await this.findItems(ctx, scheduleId);
            const order = await this.orderWithPayments(ctx, schedule.orderId);
            for (const it of all) {
                if (it.status === 'paid') {
                    const payment = (order.payments ?? []).find(
                        p => idsAreEqual(p.id, it.paymentId) && p.state === 'Settled',
                    );
                    if (payment) {
                        await this.refundPaymentOnce(ctx, order, payment, it.amount, 'group buy failed refund');
                    }
                    it.status = 'refunded';
                } else if (['locked', 'payable', 'overdue'].includes(it.status)) {
                    it.status = 'waived';
                }
            }
            await this.itemRepo(ctx).save(all);
            schedule.breachType = 'group_buy_failed';
            schedule.status = 'breached';
            await this.scheduleRepo(ctx).save(schedule);
            const plain = await this.orderService.findOne(ctx, schedule.orderId);
            if (plain) {
                await sendScheduleNotice(ctx, plain, 'scheduleBreachNoticeTemplateId', {
                    orderNo: { value: String(plain.code) },
                    reason: { value: 'group buy failed' },
                });
            }
            await this.cancelOrderSafe(ctx, schedule.orderId, 'group buy failed');
            count++;
            Logger.info(`PaymentSchedule ${scheduleId} failed by group buy ${activityId}`, loggerCtx);
        }
        return count;
    }

    /** 事件入口：团购成团（事件与扫描双通道，事件先行即时解锁） */
    async handleGroupBuyCompleted(ctx: RequestContext, activityId: number): Promise<number> {
        const items = await this.itemRepo(ctx).find({ where: { groupBuyActivityId: Number(activityId), status: 'locked' } });
        let n = 0;
        for (const item of items) {
            item.status = 'payable';
            item.dueAt = new Date();
            await this.itemRepo(ctx).save(item);
            await this.notifyTailOpened(ctx, item);
            n++;
        }
        return n;
    }

    /** 事件入口：团购失败 */
    async handleGroupBuyFailed(ctx: RequestContext, activityId: number): Promise<number> {
        return this.failSchedulesForGroupBuy(ctx, activityId);
    }

    /** 逾期扫描：payable 超 dueAt+graceHours → overdue + 违约动作（仅作用于本次转 overdue 期） */
    async processOverdue(ctx: RequestContext, now = new Date()): Promise<{ overdue: number; cancelledOrders: number }> {
        const ids = await this.channelScheduleIds(ctx);
        if (!ids.length) return { overdue: 0, cancelledOrders: 0 };
        const items = await this.itemRepo(ctx).find({ where: { scheduleId: In(ids), status: 'payable' } });
        let overdue = 0;
        let cancelledOrders = 0;
        for (const item of items) {
            if (!item.dueAt) continue;
            const deadline = new Date(item.dueAt.getTime() + item.graceHours * 3600 * 1000);
            if (now <= deadline) continue;
            const schedule = await this.scheduleRepo(ctx).findOne({ where: { id: item.scheduleId } });
            if (!schedule || !OPEN_SCHEDULE_STATUSES.includes(schedule.status)) continue;
            item.status = 'overdue';
            await this.itemRepo(ctx).save(item);
            overdue++;
            const acted = await this.applyBreachAction(ctx, schedule, item);
            if (acted) cancelledOrders++;
        }
        return { overdue, cancelledOrders };
    }

    /** 违约矩阵（设计 §7）——只对逾期期执行 */
    private async applyBreachAction(ctx: RequestContext, schedule: OrderPaymentSchedule, item: OrderScheduleItem): Promise<boolean> {
        const rule = parseDepositRule(schedule.depositRule);
        const order = await this.orderService.findOne(ctx, schedule.orderId, ['customer', 'customer.user']);

        // 买家超时未付定金
        if (item.kind === 'deposit' && rule?.kind === 'legal_deposit') {
            item.status = 'forfeited';
            await this.itemRepo(ctx).save(item);
            schedule.breachType = 'buyer_timeout';
            schedule.status = 'breached';
            await this.scheduleRepo(ctx).save(schedule);
            if (order) {
                await sendScheduleNotice(ctx, order, 'scheduleBreachNoticeTemplateId', {
                    orderNo: { value: String(order.code) },
                    reason: { value: 'legal deposit forfeited (buyer timeout)' },
                });
                await this.cancelOrderSafe(ctx, order.id, 'legal deposit forfeited (buyer timeout)');
            }
            Logger.info(`PaymentSchedule ${schedule.id}: legal deposit forfeited (buyer timeout)`, loggerCtx);
            return true;
        }
        // 买家超时未付订金：按策略退
        if (item.kind === 'deposit' && rule?.kind === 'earnest') {
            const refundAmount = earnestRefundAmount(item, rule);
            if (order && refundAmount > 0) {
                const payments = await this.orderWithPayments(ctx, order.id);
                const payment = (payments.payments ?? []).find(
                    p => idsAreEqual(p.id, item.paymentId) && p.state === 'Settled',
                );
                if (payment) {
                    const ok = await this.refundPaymentOnce(ctx, payments, payment, refundAmount, 'earnest refunded on timeout per policy');
                    if (ok) {
                        item.status = 'refunded';
                        await this.itemRepo(ctx).save(item);
                        await sendScheduleNotice(ctx, order, 'scheduleRefundTemplateId', {
                            orderNo: { value: String(order.code) },
                            amount: { value: String(Math.floor(refundAmount / 100)) },
                        });
                    }
                }
            }
            schedule.breachType = 'buyer_timeout';
            schedule.status = 'cancelled';
            await this.scheduleRepo(ctx).save(schedule);
            if (order) {
                await this.cancelOrderSafe(ctx, order.id, 'earnest refunded (buyer timeout)');
            }
            return true;
        }
        // 分期/租金/尾款逾期：仅标记 + 催收提醒（止付/收回/扣押金由管理员执行）
        if (order) {
            await sendScheduleNotice(ctx, order, 'scheduleOverdueTemplateId', {
                orderNo: { value: String(order.code) },
                seq: { value: String(item.seq) },
            });
        }
        Logger.info(`PaymentSchedule ${schedule.id} item ${item.seq} overdue (reminder sent)`, loggerCtx);
        return false;
    }

    /** 发货超期扫描：超过发货承诺未发货 → 标记 seller_breach 待管理员确认 */
    async processShipDeadlines(ctx: RequestContext, now = new Date()): Promise<number> {
        const ids = await this.channelScheduleIds(ctx);
        if (!ids.length) return 0;
        const schedules = await this.scheduleRepo(ctx)
            .createQueryBuilder('s')
            .where('s.id IN (:...ids)', { ids })
            .andWhere('s.shipDeadline IS NOT NULL')
            .andWhere('s.shipDeadline < :now', { now })
            .andWhere('s.status IN (:...statuses)', { statuses: [...OPEN_SCHEDULE_STATUSES] })
            .andWhere('s.breachType IS NULL')
            .getMany();
        let marked = 0;
        for (const schedule of schedules) {
            const items = await this.findItems(ctx, schedule.id);
            if (!items.some(i => i.status === 'paid')) continue;
            schedule.breachType = 'seller_breach';
            await this.scheduleRepo(ctx).save(schedule);
            const order = await this.orderService.findOne(ctx, schedule.orderId);
            if (order) {
                await sendScheduleNotice(ctx, order, 'scheduleBreachNoticeTemplateId', {
                    orderNo: { value: String(order.code) },
                    reason: { value: 'seller ship deadline breached' },
                });
            }
            Logger.warn(
                `PaymentSchedule ${schedule.id} marked seller_breach (ship deadline missed) — awaiting admin confirmation`,
                loggerCtx,
            );
            marked++;
        }
        return marked;
    }

    /**
     * 卖家违约确认（管理员）：
     * - legal_deposit 定金：双倍返还（本金 refund + 等额赔偿 refund，两笔留痕）
     * - 其余已付期次：全额退
     * 未付期次 → waived；调度 → cancelled；订单取消。
     */
    async confirmSellerBreach(ctx: RequestContext, scheduleId: number): Promise<ScheduleWithItems> {
        const schedule = await this.scheduleRepo(ctx).findOne({ where: { id: scheduleId } });
        if (!schedule) {
            throw new UserInputError(`PaymentSchedule ${scheduleId} not found`);
        }
        if (schedule.breachType !== 'seller_breach') {
            throw new UserInputError('Schedule is not marked as seller breach');
        }
        const order = await this.orderWithPayments(ctx, schedule.orderId);
        const items = await this.findItems(ctx, scheduleId);
        const rule = parseDepositRule(schedule.depositRule);
        const depositItem = items.find(i => i.kind === 'deposit' && i.status === 'paid');
        for (const item of items) {
            if (item.status !== 'paid') {
                if (['locked', 'payable', 'overdue'].includes(item.status)) item.status = 'waived';
                continue;
            }
            const payment = (order.payments ?? []).find(p => idsAreEqual(p.id, item.paymentId) && p.state === 'Settled');
            if (!payment) continue;
            if (depositItem && idsAreEqual(item.id, depositItem.id) && rule?.kind === 'legal_deposit') {
                await this.refundPaymentOnce(ctx, order, payment, item.amount, 'seller breach: principal refund');
                await this.refundPayment(ctx, order, payment, item.amount, 'seller breach: statutory compensation (double refund)');
            } else {
                await this.refundPaymentOnce(ctx, order, payment, item.amount, 'seller breach: full refund');
            }
            item.status = 'refunded';
        }
        await this.itemRepo(ctx).save(items);
        schedule.status = 'cancelled';
        await this.scheduleRepo(ctx).save(schedule);
        await this.cancelOrderSafe(ctx, order.id, 'seller breach confirmed');
        return (await this.getScheduleById(ctx, scheduleId)) as ScheduleWithItems;
    }

    /** 手动开启尾款窗口（manual/group_buy 期次 → payable） */
    async openTailWindow(ctx: RequestContext, scheduleId: number): Promise<ScheduleWithItems> {
        const schedule = await this.scheduleRepo(ctx).findOne({ where: { id: scheduleId } });
        if (!schedule) {
            throw new UserInputError(`PaymentSchedule ${scheduleId} not found`);
        }
        if (!OPEN_SCHEDULE_STATUSES.includes(schedule.status)) {
            throw new UserInputError(`Schedule status ${schedule.status} does not allow opening tail window`);
        }
        const items = await this.findItems(ctx, scheduleId);
        let opened = 0;
        for (const item of items) {
            if (item.status !== 'locked') continue;
            const trigger = parseTrigger(item.trigger);
            if (trigger?.type !== 'manual' && trigger?.type !== 'group_buy') continue;
            item.status = 'payable';
            item.dueAt = new Date();
            await this.itemRepo(ctx).save(item);
            opened++;
        }
        if (opened === 0) {
            throw new UserInputError('No locked manual/group_buy periods to open');
        }
        const order = await this.orderService.findOne(ctx, schedule.orderId);
        if (order) {
            await this.notifyTailOpened(ctx, items.find(i => i.status === 'payable') as OrderScheduleItem);
        }
        return (await this.getScheduleById(ctx, scheduleId)) as ScheduleWithItems;
    }

    /** 租赁还物退押（管理员）：押金期已付 → 全额原路退 → refunded */
    async releaseDepositForRental(ctx: RequestContext, orderId: ID): Promise<ScheduleWithItems> {
        const withItems = await this.getScheduleForOrder(ctx, orderId);
        if (!withItems) {
            throw new UserInputError('Order has no payment schedule');
        }
        const { schedule, items } = withItems;
        if (schedule.scenario !== 'rental') {
            throw new UserInputError('Not a rental schedule');
        }
        const depositItem = items.find(i => i.kind === 'deposit');
        if (!depositItem || depositItem.status !== 'paid') {
            throw new UserInputError('Deposit is not paid / not refundable');
        }
        const order = await this.orderWithPayments(ctx, schedule.orderId);
        const payment = (order.payments ?? []).find(
            p => idsAreEqual(p.id, depositItem.paymentId) && p.state === 'Settled',
        );
        if (!payment) {
            throw new UserInputError('Deposit payment not found');
        }
        const ok = await this.refundPaymentOnce(ctx, order, payment, depositItem.amount, 'rental deposit released');
        if (!ok) {
            throw new UserInputError('Refund failed');
        }
        depositItem.status = 'refunded';
        await this.itemRepo(ctx).save(depositItem);
        const all = await this.findItems(ctx, schedule.id);
        if (all.every(i => TERMINAL_ITEM_STATUSES.includes(i.status)) && !['breached', 'cancelled'].includes(schedule.status)) {
            schedule.status = 'completed';
            await this.scheduleRepo(ctx).save(schedule);
        }
        return (await this.getScheduleById(ctx, schedule.id)) as ScheduleWithItems;
    }

    /* ------------------------- 订单取消联动 ------------------------- */

    async handleOrderCancelled(ctx: RequestContext, orderId: ID): Promise<void> {
        const scheduleId = (await this.readOrderScheduleId(ctx, orderId));
        if (!scheduleId) return;
        const schedule = await this.scheduleRepo(ctx).findOne({ where: { id: scheduleId } });
        if (!schedule) return;
        if (['breached', 'cancelled', 'completed'].includes(schedule.status)) return;
        schedule.status = 'cancelled';
        await this.scheduleRepo(ctx).save(schedule);
        const items = await this.findItems(ctx, schedule.id);
        for (const item of items) {
            if (['locked', 'payable', 'overdue'].includes(item.status)) {
                item.status = 'waived';
            }
        }
        await this.itemRepo(ctx).save(items);
    }

    /* ------------------------- 私有工具 ------------------------- */

    private async readOrderScheduleId(ctx: RequestContext, orderId: ID): Promise<number | null> {
        const order = await this.orderService.findOne(ctx, orderId);
        return ((order?.customFields as any)?.paymentScheduleId as number | undefined) ?? null;
    }

    private async notifyTailOpened(ctx: RequestContext, item: OrderScheduleItem): Promise<void> {
        const schedule = await this.scheduleRepo(ctx).findOne({ where: { id: item.scheduleId } });
        if (!schedule) return;
        const order = await this.orderService.findOne(ctx, schedule.orderId);
        if (!order) return;
        await sendScheduleNotice(ctx, order, 'scheduleTailOpenedTemplateId', {
            orderNo: { value: String(order.code) },
            seq: { value: String(item.seq) },
        });
    }

    private async transition(ctx: RequestContext, orderId: ID, state: string): Promise<void> {
        const result = await this.orderService.transitionToState(ctx, orderId, state as any);
        const err = result as any;
        if (err instanceof Error || err.errorCode) {
            const reason = err.transitionError ?? err.message ?? err.errorCode ?? 'unknown';
            throw new UserInputError(`Transition to ${state} failed: ${reason}`);
        }
    }

    private async cancelOrderSafe(ctx: RequestContext, orderId: ID, reason: string): Promise<void> {
        try {
            const result = await this.orderService.cancelOrder(ctx, { orderId, reason } as any);
            const err = result as any;
            if (err?.errorCode) {
                Logger.warn(`Cancel order ${orderId} failed: ${err.message ?? err.errorCode}`, loggerCtx);
            }
        } catch (e: any) {
            Logger.warn(`Cancel order ${orderId} failed: ${e?.message ?? e}`, loggerCtx);
        }
    }

    /** 原路退（Vendure PaymentService.createRefund；shipping/adjustment 为 NOT NULL 必须显式置 0） */
    private async refundPayment(
        ctx: RequestContext,
        order: Order,
        payment: Payment,
        amount: number,
        reason: string,
    ): Promise<boolean> {
        try {
            const result = await this.paymentService.createRefund(
                ctx,
                { paymentId: payment.id, amount, reason, shipping: 0, adjustment: 0 } as any,
                order,
                payment,
            );
            if (result instanceof Error) {
                Logger.warn(`Refund for payment ${payment.id} returned error: ${result.message}`, loggerCtx);
                return false;
            }
            if ((result as any)?.errorCode) {
                Logger.warn(`Refund for payment ${payment.id} failed: ${(result as any).message}`, loggerCtx);
                return false;
            }
            return true;
        } catch (e: any) {
            Logger.error(`Failed to refund payment ${payment.id}: ${e?.message ?? e}`, loggerCtx);
            return false;
        }
    }

    /** 幂等退款：已 Settled 退款合计 + 本次 > 支付额 时拒绝（防团购与调度双通道重复退款） */
    private async refundPaymentOnce(
        ctx: RequestContext,
        order: Order,
        payment: Payment,
        amount: number,
        reason: string,
    ): Promise<boolean> {
        const settled = ((payment as any).refunds ?? [])
            .filter((r: any) => r.state === 'Settled')
            .reduce((s: number, r: any) => s + r.amount, 0);
        if (settled + amount > payment.amount) {
            Logger.warn(
                `Refund skipped for payment ${payment.id}: settled ${settled} + ${amount} exceeds ${payment.amount}`,
                loggerCtx,
            );
            return false;
        }
        return this.refundPayment(ctx, order, payment, amount, reason);
    }
}
```

**注意（实现时修正一处笔误）**：`getScheduleForOrder` 中有一行占位表达式 `order0(orderId)` 属笔误，实现时该方法应为：

```typescript
    async getScheduleForOrder(
        ctx: RequestContext,
        orderId: ID,
        opts?: { requireOwner?: boolean },
    ): Promise<ScheduleWithItems | null> {
        const order = await this.orderService.findOne(ctx, orderId, ['customer', 'customer.user']);
        if (!order) {
            throw new UserInputError(`Order ${orderId} not found`);
        }
        if (opts?.requireOwner) {
            this.assertOrderOwner(ctx, order);
        }
        const scheduleId = ((order.customFields as any)?.paymentScheduleId as number | undefined) ?? null;
        return this.getScheduleById(ctx, scheduleId, opts);
    }
```

- [x] **Step 4: 构建验证**

在包目录执行：`npm run build`
预期：成功（`payment-schedule.service.js` 生成于 lib）。

- [x] **Step 5: Commit**

```powershell
git add packages/payment-schedule-plugin
git commit -m "feat(payment-schedule): 调度核心服务（创建/支付/违约矩阵/取消/团购桥接/COD 收尾）"
```

---

### Task 5: PartiallyPaid 订单状态机 + 发货门控 + Order customFields

**Files:**
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\payment-schedule.order-process.ts`
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\order-custom-fields.ts`

- [x] **Step 1: 创建订单状态机（PartiallyPaid 正式态 + 发货门控）**

```typescript
import { OrderProcess } from '@vendure/core';

import { OrderPaymentSchedule } from './order-payment-schedule.entity';
import { OrderScheduleItem } from './order-schedule-item.entity';
import { getPaymentScheduleConnection } from './payment-schedule-runtime';

declare module '@vendure/core' {
    interface OrderStates {
        PartiallyPaid: never;
    }
}

/**
 * 统一支付计划订单状态机（新增正式态 PartiallyPaid；Deposited 由 pre-sale 插件保留为别名兼容）：
 * ArrangingPayment → PartiallyPaid（首期支付成功）
 * PartiallyPaid → PaymentSettled（全部期次付清）/ Shipped（门控放行）/ Cancelled
 * mergeTransitionDefinitions 会把本进程转移与默认进程并集。
 *
 * 发货门控（设计 §6）：
 * - deliveryGate=deposit_paid（租赁）→ 放行
 * - deliveryGate=first_period（分期）→ 放行（首付后即可发货）
 * - deliveryGate=all_paid（预订）→ 仅当存在未支付且 allowCod 的期次（COD 环：送达收款）放行
 */
export const paymentScheduleOrderProcess: OrderProcess<any> = {
    transitions: {
        ArrangingPayment: { to: ['AddingItems', 'PartiallyPaid', 'PaymentSettled', 'Cancelled'] },
        PartiallyPaid: { to: ['PaymentSettled', 'Shipped', 'Cancelled'] },
        // 发货/送达后继续付余下期次，付清时结算（默认状态机无此两条转移；merge 为并集）
        Shipped: { to: ['PaymentSettled'] },
        Delivered: { to: ['PaymentSettled'] },
    },
    async onTransitionStart(fromState, toState, data) {
        if (fromState !== 'PartiallyPaid' || toState !== 'Shipped') {
            return;
        }
        let schedule: OrderPaymentSchedule | null = null;
        try {
            const conn = getPaymentScheduleConnection();
            schedule = await conn
                .getRepository(data.ctx, OrderPaymentSchedule)
                .findOne({ where: { orderId: data.order.id } });
        } catch {
            return; // 运行时未初始化（理论上不可能），不拦截
        }
        if (!schedule) return;
        if (schedule.deliveryGate === 'deposit_paid' || schedule.deliveryGate === 'first_period') {
            return;
        }
        // all_paid：COD 豁免
        const items = await getPaymentScheduleConnection()
            .getRepository(data.ctx, OrderScheduleItem)
            .find({ where: { scheduleId: schedule.id } });
        const unpaidCod = items.some(i => ['locked', 'payable', 'overdue'].includes(i.status) && i.allowCod);
        if (unpaidCod) return;
        return '未付清全部期次，不能发货';
    },
};
```

- [x] **Step 2: 创建 Order customFields**

```typescript
import { CustomFields, LanguageCode } from '@vendure/core';

export const paymentScheduleOrderCustomFields: CustomFields = {
    Order: [
        {
            name: 'paymentScheduleId',
            type: 'int',
            nullable: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '支付计划ID' }],
        },
    ],
};
```

- [x] **Step 3: 构建 + Commit**

在包目录执行：`npm run build`，预期成功。

```powershell
git add packages/payment-schedule-plugin
git commit -m "feat(payment-schedule): PartiallyPaid 状态机 + deliveryGate 发货门控 + paymentScheduleId customField"
```

---

### Task 6: ScheduledTask（每分钟三扫描）

**Files:**
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\payment-schedule.job.ts`

- [x] **Step 1: 创建定时任务（逐渠道构建 ctx，参照 GroupBuyJob 模式）**

```typescript
import { Injectable } from '@nestjs/common';
import { ChannelService, Injector, Logger, RequestContext, ScheduledTask } from '@vendure/core';

import { loggerCtx } from './constants';
import { PaymentScheduleService } from './payment-schedule.service';

@Injectable()
export class PaymentScheduleJob {
    constructor(
        private channelService: ChannelService,
        private scheduleService: PaymentScheduleService,
    ) {}

    /** 触发扫描 → 逾期扫描 → 发货超期扫描（逐渠道，避免跨租户误伤） */
    async run(ctx: RequestContext): Promise<{ activated: number; overdue: number; shipBreaches: number }> {
        const triggers = await this.scheduleService.processTriggers(ctx);
        const overdues = await this.scheduleService.processOverdue(ctx);
        const shipBreaches = await this.scheduleService.processShipDeadlines(ctx);
        return { activated: triggers.activated, overdue: overdues.overdue, shipBreaches };
    }

    /** 供 ScheduledTask 注入器调用：遍历渠道 */
    async runAllChannels(injector: Injector): Promise<{ activated: number; overdue: number; shipBreaches: number }> {
        const baseCtx = new RequestContext({
            apiType: 'admin',
            authorizedAsOwnerOnly: false,
            isAuthorized: true,
        });
        const channels = await this.channelService.findAll(baseCtx);
        let total = { activated: 0, overdue: 0, shipBreaches: 0 };
        for (const channel of channels.items) {
            const channelCtx = new RequestContext({
                apiType: 'admin',
                channel,
                isAuthorized: true,
                authorizedAsOwnerOnly: false,
            });
            try {
                const r = await this.run(channelCtx);
                total = { activated: total.activated + r.activated, overdue: total.overdue + r.overdue, shipBreaches: total.shipBreaches + r.shipBreaches };
            } catch (e: any) {
                Logger.error(`Schedule scan failed for channel ${channel.code}: ${e.message}`, loggerCtx);
            }
        }
        return total;
    }
}

export const paymentScheduleTask = new ScheduledTask({
    id: 'payment-schedule-scan',
    description: 'Scan payment schedule triggers, overdue periods and ship deadlines',
    schedule: '* * * * *',
    timeout: 60 * 1000,
    preventOverlap: true,
    async execute({ injector }) {
        return injector.get(PaymentScheduleJob).runAllChannels(injector);
    },
});
```

- [x] **Step 2: 构建 + Commit**

在包目录执行：`npm run build`，预期成功。

```powershell
git add packages/payment-schedule-plugin
git commit -m "feat(payment-schedule): 每分钟调度扫描任务（触发/逾期/发货超期）"
```

---

### Task 7: Shop API resolver

**Files:**
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\payment-schedule-shop.resolver.ts`

- [x] **Step 1: 创建 Shop resolver**

```typescript
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, RequestContext, Transaction } from '@vendure/core';

import { PaymentScheduleService, ScheduleWithItems } from './payment-schedule.service';

@Resolver()
export class PaymentScheduleShopResolver {
    constructor(private scheduleService: PaymentScheduleService) {}

    @Query()
    async paymentSchedule(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
    ): Promise<any | null> {
        const withItems = await this.scheduleService.getScheduleForOrder(ctx, orderId, { requireOwner: true });
        return withItems ? this.scheduleService.presentSchedule(withItems) : null;
    }

    @Mutation()
    @Transaction()
    async paySchedulePeriod(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('seq') seq: number,
        @Args('method') method: string,
    ): Promise<any> {
        const result: ScheduleWithItems = await this.scheduleService.paySchedulePeriod(ctx, orderId, seq, method);
        return this.scheduleService.presentSchedule(result);
    }

    @Mutation()
    @Transaction()
    async cancelSchedule(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('confirmForfeit', { nullable: true }) confirmForfeit?: boolean,
    ): Promise<any> {
        const result = await this.scheduleService.cancelSchedule(ctx, orderId, confirmForfeit ?? false);
        return this.scheduleService.presentSchedule(result);
    }
}
```

- [x] **Step 2: 构建 + Commit**

在包目录执行：`npm run build`，预期成功。

```powershell
git add packages/payment-schedule-plugin
git commit -m "feat(payment-schedule): Shop API（paymentSchedule/paySchedulePeriod/cancelSchedule）"
```

---

### Task 8: Admin API resolver

**Files:**
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\payment-schedule-admin.resolver.ts`

- [x] **Step 1: 创建 Admin resolver**

```typescript
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, ListQueryOptions, PaginatedList, RequestContext, Transaction } from '@vendure/core';

import { OrderPaymentSchedule } from './order-payment-schedule.entity';
import { PaymentScheduleService } from './payment-schedule.service';

@Resolver()
export class PaymentScheduleAdminResolver {
    constructor(private scheduleService: PaymentScheduleService) {}

    @Query()
    async paymentSchedules(
        @Ctx() ctx: RequestContext,
        @Args('options', { nullable: true }) options: ListQueryOptions<OrderPaymentSchedule>,
    ): Promise<PaginatedList<any>> {
        const page = await this.scheduleService.listSchedules(ctx, options);
        const withItems = await Promise.all(
            page.items.map(async s => ({
                schedule: s,
                items: await this.scheduleService['findItemsForPresent'](ctx, s.id),
            })),
        );
        return {
            items: withItems.map(w => this.scheduleService.presentSchedule(w as any)),
            totalItems: page.totalItems,
        };
    }

    @Query()
    async adminPaymentSchedule(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<any | null> {
        const withItems = await this.scheduleService.getScheduleById(ctx, Number(id));
        return withItems ? this.scheduleService.presentSchedule(withItems) : null;
    }

    @Mutation()
    @Transaction()
    async openTailWindow(@Ctx() ctx: RequestContext, @Args('scheduleId') scheduleId: ID): Promise<any> {
        const result = await this.scheduleService.openTailWindow(ctx, Number(scheduleId));
        return this.scheduleService.presentSchedule(result);
    }

    @Mutation()
    @Transaction()
    async confirmSellerBreach(@Ctx() ctx: RequestContext, @Args('scheduleId') scheduleId: ID): Promise<any> {
        const result = await this.scheduleService.confirmSellerBreach(ctx, Number(scheduleId));
        return this.scheduleService.presentSchedule(result);
    }

    @Mutation()
    @Transaction()
    async confirmCodReceived(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID): Promise<any> {
        const result = await this.scheduleService.confirmCodReceived(ctx, orderId);
        return this.scheduleService.presentSchedule(result);
    }

    @Mutation()
    @Transaction()
    async releaseRentalDeposit(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID): Promise<any> {
        const result = await this.scheduleService.releaseDepositForRental(ctx, orderId);
        return this.scheduleService.presentSchedule(result);
    }

    /** 手动触发调度扫描（运维工具 + e2e 依赖；与每分钟 ScheduledTask 等价） */
    @Mutation()
    @Transaction()
    async runScheduleScan(@Ctx() ctx: RequestContext): Promise<{ activated: number; overdue: number; shipBreaches: number }> {
        const triggers = await this.scheduleService.processTriggers(ctx);
        const overdues = await this.scheduleService.processOverdue(ctx);
        const shipBreaches = await this.scheduleService.processShipDeadlines(ctx);
        return { activated: triggers.activated, overdue: overdues.overdue, shipBreaches };
    }
}
```

**注意**：resolver 里用了 `this.scheduleService['findItemsForPresent']`——为避免越界访问私有方法，在 `payment-schedule.service.ts` 追加一个公开方法（放在 `presentSchedule` 旁）：

```typescript
    /** Admin 列表批量取期次（供 resolver 组装 present） */
    async findItemsForPresent(ctx: RequestContext, scheduleId: number) {
        return this.findItems(ctx, scheduleId);
    }
```

- [x] **Step 2: 构建 + Commit**

在包目录执行：`npm run build`，预期成功。

```powershell
git add packages/payment-schedule-plugin
git commit -m "feat(payment-schedule): Admin API（调度列表/开启尾款/卖家违约确认/COD 签收/退押/手动扫描）"
```

---

### Task 9: plugin.ts 组装（schema + 配置注册 + 事件订阅桥）与 dev-server 注册

**Files:**
- Create: `d:\zhao\vendure\packages\payment-schedule-plugin\src\plugin.ts`
- Modify: `d:\zhao\vendure\packages\payment-schedule-plugin\index.ts`
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`

- [x] **Step 1: 创建 plugin.ts（Shop/Admin schema 内联，参照 pre-sale 模式）**

```typescript
import { Inject, OnApplicationBootstrap, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
    EventBus,
    Injector,
    Logger,
    OrderStateTransitionEvent,
    PluginCommonModule,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';

import { PAYMENT_SCHEDULE_PLUGIN_OPTIONS, loggerCtx } from './constants';
import { OrderPaymentSchedule } from './order-payment-schedule.entity';
import { OrderScheduleItem } from './order-schedule-item.entity';
import { PaymentScheduleAdminResolver } from './payment-schedule-admin.resolver';
import { paymentScheduleOrderCustomFields } from './order-custom-fields';
import { paymentScheduleTask } from './payment-schedule.job';
import { paymentScheduleOrderProcess } from './payment-schedule.order-process';
import { PaymentScheduleService } from './payment-schedule.service';
import { setPaymentScheduleRuntime } from './payment-schedule-runtime';
import { PaymentScheduleShopResolver } from './payment-schedule-shop.resolver';
import { PaymentSchedulePluginOptions } from './types';

/** 幂等合并 customFields（防 preBootstrapConfig 重复注册），与 pre-sale 同款 */
function mergeCustomFields<T extends { name: string }>(
    existingFields: T[] | undefined,
    additions: T[] | undefined,
): T[] {
    const names = new Set((existingFields ?? []).map(f => f.name));
    return [...(existingFields ?? []), ...(additions ?? []).filter(f => !names.has(f.name))];
}

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [OrderPaymentSchedule, OrderScheduleItem],
    providers: [
        { provide: PAYMENT_SCHEDULE_PLUGIN_OPTIONS, useFactory: () => PaymentSchedulePlugin.options },
        PaymentScheduleService,
        PaymentScheduleAdminResolver,
        PaymentScheduleShopResolver,
        // 供 ScheduledTask injector.get(PaymentScheduleJob)
        PaymentScheduleJobProvider,
    ],
    exports: [PaymentScheduleService],
    adminApiExtensions: {
        schema: () => gql`
            enum PaymentScheduleScenario { presale installment rental }
            enum PaymentScheduleStatus { pending in_progress completed breached cancelled }
            enum PaymentScheduleBreachType { buyer_timeout seller_breach group_buy_failed }
            enum PaymentScheduleItemStatus { locked payable paid overdue forfeited refunded waived }
            enum PaymentScheduleItemKind { deposit balance down_payment installment rent buyout }

            type PaymentScheduleItem implements Node {
                id: ID!
                createdAt: DateTime!
                updatedAt: DateTime!
                seq: Int!
                kind: PaymentScheduleItemKind!
                amount: Int!
                paidAmount: Int!
                allowCod: Boolean!
                status: PaymentScheduleItemStatus!
                dueAt: DateTime
                graceHours: Int!
                trigger: JSON!
                paidAt: DateTime
                lateFeeAccrued: Int!
            }

            type PaymentSchedule implements Node {
                id: ID!
                createdAt: DateTime!
                updatedAt: DateTime!
                orderId: ID!
                scenario: PaymentScheduleScenario!
                status: PaymentScheduleStatus!
                breachType: PaymentScheduleBreachType
                depositRule: JSON
                deliveryGate: String!
                agreementVersion: String!
                shipDeadline: DateTime
                meta: JSON
                items: [PaymentScheduleItem!]!
                paidTotal: Int!
                totalAmount: Int!
            }

            input PaymentScheduleListOptions

            type PaymentScheduleList implements PaginatedList {
                items: [PaymentSchedule!]!
                totalItems: Int!
            }

            extend type Query {
                paymentSchedules(options: PaymentScheduleListOptions): PaymentScheduleList!
                adminPaymentSchedule(id: ID!): PaymentSchedule
            }

            extend type Mutation {
                openTailWindow(scheduleId: ID!): PaymentSchedule!
                confirmSellerBreach(scheduleId: ID!): PaymentSchedule!
                confirmCodReceived(orderId: ID!): PaymentSchedule!
                releaseRentalDeposit(orderId: ID!): PaymentSchedule!
                runScheduleScan: PaymentScheduleScanResult!
            }

            type PaymentScheduleScanResult {
                activated: Int!
                overdue: Int!
                shipBreaches: Int!
            }
        `,
        resolvers: [PaymentScheduleAdminResolver],
    },
    shopApiExtensions: {
        schema: () => gql`
            enum PaymentScheduleScenario { presale installment rental }
            enum PaymentScheduleStatus { pending in_progress completed breached cancelled }
            enum PaymentScheduleBreachType { buyer_timeout seller_breach group_buy_failed }
            enum PaymentScheduleItemStatus { locked payable paid overdue forfeited refunded waived }
            enum PaymentScheduleItemKind { deposit balance down_payment installment rent buyout }

            type PaymentScheduleItem implements Node {
                id: ID!
                createdAt: DateTime!
                updatedAt: DateTime!
                seq: Int!
                kind: PaymentScheduleItemKind!
                amount: Int!
                paidAmount: Int!
                allowCod: Boolean!
                status: PaymentScheduleItemStatus!
                dueAt: DateTime
                graceHours: Int!
                trigger: JSON!
                paidAt: DateTime
                lateFeeAccrued: Int!
            }

            type PaymentSchedule implements Node {
                id: ID!
                createdAt: DateTime!
                updatedAt: DateTime!
                orderId: ID!
                scenario: PaymentScheduleScenario!
                status: PaymentScheduleStatus!
                breachType: PaymentScheduleBreachType
                depositRule: JSON
                deliveryGate: String!
                agreementVersion: String!
                shipDeadline: DateTime
                meta: JSON
                items: [PaymentScheduleItem!]!
                paidTotal: Int!
                totalAmount: Int!
            }

            extend type Query {
                paymentSchedule(orderId: ID!): PaymentSchedule
            }

            extend type Mutation {
                paySchedulePeriod(orderId: ID!, seq: Int!, method: String!): PaymentSchedule!
                cancelSchedule(orderId: ID!, confirmForfeit: Boolean): PaymentSchedule!
            }
        `,
        resolvers: [PaymentScheduleShopResolver],
    },
    configuration: config => {
        config.customFields.Order = mergeCustomFields(config.customFields.Order, paymentScheduleOrderCustomFields.Order);

        const orderProcesses = config.orderOptions?.process ?? [];
        const registered = orderProcesses.some((p: any) => (p as any).__paymentScheduleRegistered);
        if (!registered) {
            (paymentScheduleOrderProcess as any).__paymentScheduleRegistered = true;
            config.orderOptions.process = [...orderProcesses, paymentScheduleOrderProcess];
        }

        if (!config.schedulerOptions) {
            config.schedulerOptions = { tasks: [] } as any;
        }
        if (!config.schedulerOptions.tasks) {
            config.schedulerOptions.tasks = [];
        }
        config.schedulerOptions.tasks.push(paymentScheduleTask);

        return config;
    },
    compatibility: '^3.0.0',
})
export class PaymentSchedulePlugin implements OnApplicationBootstrap {
    private static options: PaymentSchedulePluginOptions = {};
    private injector!: Injector;

    constructor(
        @Inject(PAYMENT_SCHEDULE_PLUGIN_OPTIONS) private options: PaymentSchedulePluginOptions,
        private scheduleService: PaymentScheduleService,
        private eventBus: EventBus,
        private moduleRef: ModuleRef,
    ) {}

    static init(options?: PaymentSchedulePluginOptions): Type<PaymentSchedulePlugin> {
        PaymentSchedulePlugin.options = options ?? {};
        return PaymentSchedulePlugin;
    }

    async onApplicationBootstrap(): Promise<void> {
        this.injector = new Injector(this.moduleRef);
        setPaymentScheduleRuntime(this.injector.get(TransactionalConnectionForRuntime), this.injector);
        this.scheduleService.init(this.injector);

        // 订单取消 → 调度联动（未付期次 waived、调度 cancelled）
        this.eventBus.ofType(OrderStateTransitionEvent).subscribe(async event => {
            if (event.toState !== 'Cancelled') return;
            if (!(event.order as any)?.customFields?.paymentScheduleId) return;
            try {
                await this.scheduleService.handleOrderCancelled(event.ctx, event.order.id);
            } catch (e: any) {
                Logger.error(`Failed to handle schedule on order cancel: ${e.message}`, loggerCtx);
            }
        });

        // 团购领域事件桥（软依赖 group-buy-plugin）
        this.registerGroupBuyBridge();

        Logger.info('PaymentSchedulePlugin initialized', loggerCtx);
    }

    private registerGroupBuyBridge(): void {
        try {
            const gb = require('@vendure/group-buy-plugin');
            this.eventBus.ofType(gb.GroupBuyCompletedEvent).subscribe((e: any) =>
                this.scheduleService.handleGroupBuyCompleted(e.ctx, e.activityId).catch((err: any) => {
                    Logger.error(`GroupBuyCompleted schedule handling failed: ${err.message}`, loggerCtx);
                }),
            );
            this.eventBus.ofType(gb.GroupBuyFailedEvent).subscribe((e: any) =>
                this.scheduleService.handleGroupBuyFailed(e.ctx, e.activityId).catch((err: any) => {
                    Logger.error(`GroupBuyFailed schedule handling failed: ${err.message}`, loggerCtx);
                }),
            );
            Logger.info('Group-buy event bridge registered', loggerCtx);
        } catch {
            Logger.info('group-buy-plugin not installed, group_buy triggers use scanner only', loggerCtx);
        }
    }
}

/** 运行时连接占位：避免在装饰器阶段引用 TransactionalConnection 类型造成循环 */
import { TransactionalConnection as TransactionalConnectionForRuntime } from '@vendure/core';
import { PaymentScheduleJobProvider } from './payment-schedule-job-provider';
```

**实现注意（两处修正，写文件时直接按下面方式）**：
1. 不要用上面的「占位 import」写法——直接在顶部 import 里加 `TransactionalConnection`，onApplicationBootstrap 中写 `setPaymentScheduleRuntime(this.injector.get(TransactionalConnection), this.injector);`。
2. `PaymentScheduleJobProvider` 不需要单独文件：providers 数组里直接放 `PaymentScheduleJob`（从 `./payment-schedule.job` 导入），即：

```typescript
import { PaymentScheduleJob, paymentScheduleTask } from './payment-schedule.job';
// providers 数组中：
//   PaymentScheduleJob,
```

- [x] **Step 2: 更新 index.ts（最终版）**

```typescript
export * from './src/constants';
export * from './src/types';
export * from './src/schedule-config';
export * from './src/order-payment-schedule.entity';
export * from './src/order-schedule-item.entity';
export * from './src/payment-schedule.service';
export * from './src/payment-schedule.order-process';
export * from './src/payment-schedule.job';
export * from './src/plugin';
```

- [x] **Step 3: 构建并修复编译错误**

在包目录执行：`npm run build`，预期成功（若 `PaymentScheduleJob` 未加 `@Injectable()` 装饰器导致 Nest 报错，确认 Task 6 的类已带 `@Injectable()`）。

- [x] **Step 4: dev-server 注册插件**

修改 `d:\zhao\vendure\packages\dev-server\dev-config.ts`：

在 import 区（`import { PreSalePlugin } from '@vendure/pre-sale-plugin';` 附近）加：

```typescript
import { PaymentSchedulePlugin } from '@vendure/payment-schedule-plugin';
```

在 `PreSalePlugin.init({}),`（约 522 行）之后加：

```typescript
        PaymentSchedulePlugin.init({}),
```

- [x] **Step 5: Commit**

```powershell
git add packages/payment-schedule-plugin packages/dev-server/dev-config.ts
git commit -m "feat(payment-schedule): 插件组装（Shop/Admin schema、PartiallyPaid 注册、调度任务、团购事件桥）+ dev-server 注册"
```

---

### Task 10: group-buy-plugin 发出成团/失败领域事件

**Files:**
- Create: `d:\zhao\vendure\packages\group-buy-plugin\src\events.ts`
- Modify: `d:\zhao\vendure\packages\group-buy-plugin\src\group-buy.service.ts`（两处发布）
- Modify: `d:\zhao\vendure\packages\group-buy-plugin\index.ts`（导出）

- [x] **Step 1: 创建事件类**

```typescript
import { RequestContext, VendureEvent } from '@vendure/core';

/** 成团：targetCount 达成，activity 置 completed 后发布 */
export class GroupBuyCompletedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public activityId: number,
        public orderIds: string[],
    ) {
        super();
    }
}

/** 不成团：endAt 过期且未达 targetCount，activity 置 expired 后发布 */
export class GroupBuyFailedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public activityId: number,
        public orderIds: string[],
    ) {
        super();
    }
}
```

- [x] **Step 2: group-buy.service.ts 注入 EventBus 并发布**

修改构造函数（`group-buy.service.ts` 第 54-61 行区域），追加 `eventBus`：

```typescript
import { Injectable } from '@nestjs/common';
import {
    ChannelService,
    CustomerService,
    EventBus,
    ID,
    Injector,
    ListQueryBuilder,
    ListQueryOptions,
    Logger,
    Order,
    OrderService,
    PaginatedList,
    PaymentService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { In } from 'typeorm';

import { loggerCtx } from './constants';
import { GroupBuyActivity } from './group-buy-activity.entity';
import { GroupBuyOrder } from './group-buy-order.entity';
import { GroupBuyCompletedEvent, GroupBuyFailedEvent } from './events';
import { setGroupBuyConnection } from './group-buy-runtime';
```

```typescript
@Injectable()
export class GroupBuyService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private channelService: ChannelService,
        private customerService: CustomerService,
        private orderService: OrderService,
        private paymentService: PaymentService,
        private eventBus: EventBus,
    ) {}
```

在 `joinGroupBuy` 成团联动分支（`if (fresh && fresh.currentCount >= fresh.targetCount) { ... markAllSuccess ... }` 内，`markAllSuccess` 之后）追加：

```typescript
                // 成团领域事件（供支付计划等下游订阅）
                const joined = await orderRepo.find({ where: { groupBuyActivityId: String(activity.id) } });
                this.eventBus.publish(new GroupBuyCompletedEvent(ctx, Number(activity.id), joined.map(j => j.orderId)));
```

在 `processExpired` 的 `if (activity.status === 'expired') { ... }` 块末尾（`for (const gbo of pendingOrders) {...}` 之后、该 if 块内）追加：

```typescript
                // 不成团领域事件（供支付计划等下游订阅）
                const allJoined = await orderRepo.find({ where: { groupBuyActivityId: String(activity.id) } });
                this.eventBus.publish(new GroupBuyFailedEvent(ctx, Number(activity.id), allJoined.map(j => j.orderId)));
```

- [x] **Step 3: index.ts 导出**

在 `d:\zhao\vendure\packages\group-buy-plugin\index.ts` 追加一行（若无该行）：

```typescript
export * from './src/events';
```

- [x] **Step 4: 构建 group-buy**

在 `d:\zhao\vendure\packages\group-buy-plugin` 执行：`npm run build`
预期：成功。

- [x] **Step 5: Commit**

```powershell
git add packages/group-buy-plugin
git commit -m "feat(group-buy): 新增 GroupBuyCompletedEvent/GroupBuyFailedEvent 领域事件（成团/过期发布）"
```

---

# 阶段 2：pre-sale-plugin 改造（期次实例 + 兼容薄壳）

### Task 11: PreSaleActivity 新列 + 定金 20% 硬校验 + schema 扩展

**Files:**
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\src\pre-sale-activity.entity.ts`
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\src\constants.ts`
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\src\pre-sale.service.ts`
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\src\plugin.ts`（admin+shop 两端 schema）
- Test: `d:\zhao\vendure\packages\pre-sale-plugin\e2e\pre-sale.e2e-spec.ts`

- [x] **Step 1: 写失败 e2e（20% 硬校验）**

在 `pre-sale.e2e-spec.ts` 的 describe 末尾追加用例（放在最后一个 `it(...)` 之后、describe 闭括号之前）：

```typescript
    it('合规硬点：定金超出基准价 20% 拒绝保存；恰好 20% 可保存', async () => {
        // 基准价 = presalePrice(99900) > 0 时用预售价；cap = floor(99900 * 0.2) = 19980
        await assertShopError(
            () =>
                adminClient.query(gql`
                    mutation {
                        createPreSaleActivity(input: {
                            name: "超限-${seq++}"
                            mode: deposit
                            startAt: "${ts(-60)}"
                            endAt: "${ts(24 * 60)}"
                            presalePrice: ${PRESALE_PRICE}
                            depositAmount: 19990
                            totalStock: 10
                            productId: "${variantId}"
                            variantId: "${variantId}"
                        }) { id }
                    }
                `),
            '20%',
        );
        // 恰好 cap：可保存
        const ok = (await adminClient.query(gql`
            mutation {
                createPreSaleActivity(input: {
                    name: "合规-${seq++}"
                    mode: deposit
                    startAt: "${ts(-60)}"
                    endAt: "${ts(24 * 60)}"
                    presalePrice: ${PRESALE_PRICE}
                    depositAmount: 19980
                    totalStock: 10
                    productId: "${variantId}"
                    variantId: "${variantId}"
                }) { id depositKind tailTriggerType graceHours agreementVersion }
            }
        `)) as any;
        expect(ok.createPreSaleActivity.id).toBeDefined();
        // presalePrice=0 → 基准价 = variant 原价 129900；cap = 25980；25981 拒绝
        await assertShopError(
            () =>
                adminClient.query(gql`
                    mutation {
                        createPreSaleActivity(input: {
                            name: "原价超限-${seq++}"
                            mode: deposit
                            startAt: "${ts(-60)}"
                            endAt: "${ts(24 * 60)}"
                            presalePrice: 0
                            depositAmount: 25981
                            totalStock: 10
                            productId: "${variantId}"
                            variantId: "${variantId}"
                        }) { id }
                    }
                `),
            '20%',
        );
    });
```

- [x] **Step 2: 跑测试确认失败**

先删 e2e 缓存（schema/实体将变更）：`Remove-Item -Recurse -Force e2e\__data__`（若存在）。
在 `d:\zhao\vendure\packages\pre-sale-plugin` 执行：`npm run e2e`
预期：新用例 FAIL（`Expected the operation to throw, but it succeeded`），其余用例 PASS。

- [x] **Step 3: 实体新列**

在 `pre-sale-activity.entity.ts` 的 `@Column('varchar', { default: 'upcoming' }) status` 之前插入：

```typescript
    /** 定金性质：legal_deposit（法律定金，有罚则）/ earnest（订金，原则上可退） */
    @Column('varchar', { default: 'legal_deposit' })
    depositKind: 'legal_deposit' | 'earnest';

    /** 尾款触发方式：date（到点自动）/ group_buy（成团解锁）/ manual（管理员开启） */
    @Column('varchar', { default: 'date' })
    tailTriggerType: 'date' | 'group_buy' | 'manual';

    /** 团购活动 id（tailTriggerType=group_buy 时必填） */
    @Column({ type: 'int', nullable: true })
    groupBuyActivityId?: number;

    /** 尾款支付窗口时长（小时，展示/协议用） */
    @Column({ type: 'int', nullable: true })
    tailWindowHours?: number;

    /** 期次宽限小时数（逾期判定） */
    @Column({ type: 'int', default: 72 })
    graceHours: number;

    /** 订金退款策略（depositKind=earnest 时生效） */
    @Column('simple-json', { nullable: true })
    earnestRefundPolicy?: { onTimeout: 'full' | 'partial'; partialRate?: number } | null;

    /** 发货承诺时间（卖家违约判定基准） */
    @Column({ type: 'datetime', nullable: true })
    shipDeadlineAt?: Date;

    /** 协议版本快照（下单时写入期次实例，改配置不影响已生成订单） */
    @Column('varchar', { default: 'v1' })
    agreementVersion: string;
```

在 `constants.ts` 追加：

```typescript
/** 定金法定上限：主合同标的额 20%（民法典 §586；与 payment-schedule-plugin 各自持有，避免编译期耦合） */
export const LEGAL_DEPOSIT_CAP_RATIO = 0.2;
```

- [x] **Step 4: service 校验 + 白名单扩展**

`pre-sale.service.ts`：

4a. import 区补两个导入：

```typescript
import { ProductVariant } from '@vendure/core';   // 并入现有 @vendure/core import 块

import { LEGAL_DEPOSIT_CAP_RATIO, loggerCtx } from './constants';
```

4b. `UPDATE_ALLOWED_FIELDS` 数组替换为：

```typescript
const UPDATE_ALLOWED_FIELDS: ReadonlyArray<keyof PreSaleActivity> = [
    'name',
    'mode',
    'startAt',
    'endAt',
    'releaseAt',
    'tailStartAt',
    'tailEndAt',
    'presalePrice',
    'depositAmount',
    'totalStock',
    'limitPerUser',
    'productId',
    'variantId',
    'depositKind',
    'tailTriggerType',
    'groupBuyActivityId',
    'tailWindowHours',
    'graceHours',
    'earnestRefundPolicy',
    'shipDeadlineAt',
    'agreementVersion',
];
```

4c. `create` 方法在 `const activity = new PreSaleActivity(input as any);` 之前插入一行调用，`update` 方法在字段白名单循环之前插入，两处均为：

```typescript
        await this.assertLegalDepositCap(ctx, input);
```

（`update` 处用 `input` 原样传入即可，方法内部自行兜底活动既有值。）

4d. 在私有工具区（`requirePreSaleOrder` 之前）新增：

```typescript
    /**
     * 定金 20% 法定上限硬校验（设计 §10 合规硬点 1：超出拒绝保存）。
     * 基准价：presalePrice > 0 ? presalePrice : variant.priceWithTax（原价）。
     */
    private async assertLegalDepositCap(ctx: RequestContext, input: Partial<PreSaleActivity>): Promise<void> {
        const mode = input.mode;
        const depositAmount = Number(input.depositAmount ?? 0);
        if (mode !== 'deposit' || !(depositAmount > 0)) return;
        let base = Number(input.presalePrice ?? 0);
        if (!(base > 0) && input.variantId != null) {
            const variant = await this.connection.getRepository(ctx, ProductVariant).findOne({
                where: { id: Number(input.variantId) as any },
            });
            if (variant) base = variant.priceWithTax;
        }
        if (!(base > 0)) {
            throw new UserInputError('Cannot validate deposit cap: base price unknown (set presalePrice or ensure variant exists)');
        }
        const cap = Math.floor(base * LEGAL_DEPOSIT_CAP_RATIO);
        if (depositAmount > cap) {
            throw new UserInputError(`Deposit ${depositAmount} exceeds legal cap ${cap} (20% of base price ${base})`);
        }
    }
```

- [x] **Step 5: 两端 schema 扩展**

`plugin.ts` admin schema 的 `type PreSaleActivity`（`status: PreSaleStatus!` 行后、`createdAt` 行前）插入：

```graphql
                depositKind: String!
                tailTriggerType: String!
                groupBuyActivityId: Int
                tailWindowHours: Int
                graceHours: Int!
                earnestRefundPolicy: JSON
                shipDeadlineAt: DateTime
                agreementVersion: String!
```

admin 的 `CreatePreSaleActivityInput`（`variantId: ID!` 行后）与 `UpdatePreSaleActivityInput`（`variantId: ID` 行后）各插入：

```graphql
                depositKind: String
                tailTriggerType: String
                groupBuyActivityId: Int
                tailWindowHours: Int
                graceHours: Int
                earnestRefundPolicy: JSON
                shipDeadlineAt: DateTime
                agreementVersion: String
```

shop schema 的 `type PreSaleActivity` 同 admin 的 type 部分插入（只读展示，shop 无 input）。

- [x] **Step 6: 跑测试确认通过**

在 `d:\zhao\vendure\packages\pre-sale-plugin` 执行：`npm run e2e`
预期：全部 PASS。

- [x] **Step 7: 构建 + Commit**

在 `d:\zhao\vendure\packages\pre-sale-plugin` 执行：`npm run build`（预期成功）

```powershell
git add packages/pre-sale-plugin
git commit -m "feat(pre-sale): 活动新增定金性质/尾款触发/宽限期/协议版本等字段并落地定金20%硬校验"
```

### Task 12: pre-sale 下单生成期次实例（软依赖桥）

**Files:**
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\src\pre-sale-runtime.ts`
- Create: `d:\zhao\vendure\packages\pre-sale-plugin\src\payment-schedule-bridge.ts`
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\src\pre-sale.service.ts`（applyPreSale 接入）
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\src\pre-sale-admin.resolver.ts`（create/update input 透传新字段）
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\e2e\pre-sale.e2e-spec.ts`（配置 + 用例）

**前置依赖：** payment-schedule-plugin 已构建（Task 1~10 完成后 `npm run build`，且已在 vendure 根 `npm install` 链接）。

- [x] **Step 1: pre-sale-runtime 注入 Injector**

`pre-sale-runtime.ts` 整文件替换为：

```typescript
import { Injector, TransactionalConnection } from '@vendure/core';

/**
 * 运行时依赖注入点：
 * - connection：Promotion 条件/动作在结算期同步路径里访问 DB
 * - injector：软依赖桥（payment-schedule-bridge）经 tryGet 获取跨插件服务
 */
let connection: TransactionalConnection | undefined;
let injector: Injector | undefined;

export function setPreSaleConnection(conn: TransactionalConnection): void {
    connection = conn;
}

export function getPreSaleConnection(): TransactionalConnection {
    if (!connection) {
        throw new Error('PreSalePlugin TransactionalConnection not initialized');
    }
    return connection;
}

export function setPreSaleInjector(inj: Injector): void {
    injector = inj;
}

export function getPreSaleInjector(): Injector {
    if (!injector) {
        throw new Error('PreSalePlugin Injector not initialized');
    }
    return injector;
}
```

`pre-sale.service.ts` 的 `init` 改为（`setPreSaleConnection` 导入行追加 `setPreSaleInjector`）：

```typescript
    init(injector: Injector): void {
        // 供 Promotion 条件/动作在结算期动态取活动配置；供软依赖桥取跨插件服务
        setPreSaleConnection(this.connection);
        setPreSaleInjector(injector);
    }
```

- [x] **Step 2: 写失败 e2e（期次实例生成）**

2a. e2e 文件顶部 import 区追加：

```typescript
import { PaymentSchedulePlugin } from '@vendure/payment-schedule-plugin';
```

2b. `config` 常量替换为（**跨插件一律用 lib 包名导入**，见工程约定 0.3）：

```typescript
    const config = mergeConfig(testConfig(), {
        plugins: [PreSalePlugin.init({}), PaymentSchedulePlugin.init({})],
        paymentOptions: { paymentMethodHandlers: [singleStageRefundablePaymentMethod] },
    });
```

2c. `createActivity` helper 的 input 参数追加可选字段并透传（整个函数替换）：

```typescript
    async function createActivity(input: {
        presalePrice?: number;
        depositAmount?: number;
        totalStock?: number;
        limitPerUser?: number;
        mode?: string;
        depositKind?: string;
        tailTriggerType?: string;
        groupBuyActivityId?: number;
        tailStartAt?: string;
        graceHours?: number;
        earnestRefundPolicy?: string;
        shipDeadlineAt?: string;
    }): Promise<string> {
        const mode = input.mode ?? 'deposit';
        const presalePrice = input.presalePrice ?? 0;
        const depositAmount = input.depositAmount ?? 30000;
        const totalStock = input.totalStock ?? 100;
        const limitPerUser = input.limitPerUser ?? 10;
        // 可选字段逐条拼接（undefined 不输出，避免 gql 模板出现 "undefined" 字面量）
        const optional = [
            input.depositKind ? `depositKind: "${input.depositKind}"` : '',
            input.tailTriggerType ? `tailTriggerType: "${input.tailTriggerType}"` : '',
            input.groupBuyActivityId != null ? `groupBuyActivityId: ${input.groupBuyActivityId}` : '',
            input.tailStartAt ? `tailStartAt: "${input.tailStartAt}"` : '',
            input.graceHours != null ? `graceHours: ${input.graceHours}` : '',
            input.earnestRefundPolicy ? `earnestRefundPolicy: ${input.earnestRefundPolicy}` : '',
            input.shipDeadlineAt ? `shipDeadlineAt: "${input.shipDeadlineAt}"` : '',
        ]
            .filter(Boolean)
            .join('\n                    ');
        const res = (await adminClient.query(gql`
            mutation {
                createPreSaleActivity(input: {
                    name: "预售-${seq++}"
                    mode: ${mode}
                    startAt: "${ts(-60)}"
                    endAt: "${ts(24 * 60)}"
                    presalePrice: ${presalePrice}
                    depositAmount: ${depositAmount}
                    totalStock: ${totalStock}
                    limitPerUser: ${limitPerUser}
                    ${optional}
                    productId: "${variantId}"
                    variantId: "${variantId}"
                }) { id name mode status soldCount totalStock depositAmount presalePrice depositKind tailTriggerType graceHours }
            }
        `)) as any;
        const act = res.createPreSaleActivity;
        expect(act.status).toBe('active'); // startAt 在过去 → 建单即 active
        return act.id;
    }
```

> 说明：可选字段经 `optional` 字符串拼接注入，避免 gql 模板内插 `undefined` 产生字面量 `"undefined"`；`earnestRefundPolicy` 由调用方直接给出 GraphQL 对象文本（如 `'{ onTimeout: full }'`）。

2d. describe 末尾追加用例：

```typescript
    it('applyPreSale 生成期次实例：deposit 双项（定金 payable + 尾款 locked）', async () => {
        const actId = await createActivity({
            presalePrice: PRESALE_PRICE,
            depositAmount: 19980,
            tailTriggerType: 'date',
            tailStartAt: ts(-1),
            graceHours: 72,
        });
        const orderId = await applyPreSale(actId);
        const res = (await shopClient.query(gql`
            query {
                paymentSchedule(orderId: "${orderId}") {
                    id scenario status depositRule totalAmount paidTotal
                    items { seq kind amount status allowCod graceHours trigger dueAt }
                }
            }
        `)) as any;
        const sched = res.paymentSchedule;
        expect(sched.scenario).toBe('presale');
        expect(sched.status).toBe('pending');
        expect(sched.depositRule.kind).toBe('legal_deposit');
        expect(sched.items).toHaveLength(2);
        expect(sched.items[0]).toMatchObject({ seq: 1, kind: 'deposit', amount: 19980, status: 'payable' });
        expect(sched.items[1]).toMatchObject({ seq: 2, kind: 'balance', amount: PRESALE_PRICE - 19980, status: 'locked' });
        expect(JSON.parse(sched.items[1].trigger).type).toBe('date');
        expect(sched.totalAmount).toBe(PRESALE_PRICE);
        expect(sched.paidTotal).toBe(0);
    });

    it('applyPreSale 生成期次实例：full 单 balance 项（首期立即可付）', async () => {
        const actId = await createActivity({ mode: 'full', presalePrice: PRESALE_PRICE });
        const orderId = await applyPreSale(actId);
        const res = (await shopClient.query(gql`
            query {
                paymentSchedule(orderId: "${orderId}") {
                    scenario items { seq kind amount status }
                }
            }
        `)) as any;
        const sched = res.paymentSchedule;
        expect(sched.items).toHaveLength(1);
        expect(sched.items[0]).toMatchObject({ seq: 1, kind: 'balance', amount: PRESALE_PRICE, status: 'payable' });
    });

    it('applyPreSale 生成期次实例：earnest 订金性质落入 depositRule', async () => {
        const actId = await createActivity({
            presalePrice: PRESALE_PRICE,
            depositAmount: 19980,
            depositKind: 'earnest',
            earnestRefundPolicy: '{ onTimeout: full }',
        });
        const orderId = await applyPreSale(actId);
        const res = (await shopClient.query(gql`
            query { paymentSchedule(orderId: "${orderId}") { depositRule items { seq kind status } } }
        `)) as any;
        expect(res.paymentSchedule.depositRule.kind).toBe('earnest');
        expect(res.paymentSchedule.depositRule.earnestRefundPolicy).toEqual({ onTimeout: 'full' });
    });
```

2e. 删缓存并跑：`Remove-Item -Recurse -Force e2e\__data__`（若存在）；`npm run e2e`
预期：三个新用例 FAIL（paymentSchedule query 不存在/未生成期次），旧用例 PASS。

- [x] **Step 3: 创建软依赖桥**

新建 `payment-schedule-bridge.ts`：

```typescript
import { Injector, Logger, Order, RequestContext } from '@vendure/core';

import { loggerCtx } from './constants';
import { PreSaleActivity } from './pre-sale-activity.entity';

/**
 * 软依赖桥：运行时经 require + Injector.get(strict:false) 获取 payment-schedule-plugin 调度服务。
 * 未启用/未注册 → 返回 null，pre-sale 回退旧行为（无期次）。
 * 跨插件一律用构建后 lib 包名 require（工程约定 0.3：规避类身份不一致）。
 */
export function tryGetScheduleService(injector: Injector): any | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PaymentScheduleService } = require('@vendure/payment-schedule-plugin');
        return injector.get(PaymentScheduleService, { strict: false }) ?? null;
    } catch {
        return null;
    }
}

/** 尾款期触发器（按活动配置；date 的时间取尾款窗口起点，未定则退 releaseAt/endAt） */
function tailTrigger(activity: PreSaleActivity): Record<string, unknown> {
    switch (activity.tailTriggerType) {
        case 'group_buy':
            return { type: 'group_buy', groupBuyActivityId: activity.groupBuyActivityId };
        case 'manual':
            return { type: 'manual' };
        default:
            return {
                type: 'date',
                at: (activity.tailStartAt ?? activity.releaseAt ?? activity.endAt).toISOString(),
            };
    }
}

/**
 * 下单（applyPreSale）时生成期次实例：
 * - full：单 balance 项（首期立即可付）
 * - deposit：deposit + balance 双项；尾款期 trigger 按活动 tailTriggerType
 * 生成失败仅告警不阻断抢购（期次缺失时薄壳回退旧支付路径）。
 */
export async function createScheduleForOrder(
    ctx: RequestContext,
    injector: Injector,
    order: Order,
    activity: PreSaleActivity,
): Promise<void> {
    const scheduleService = tryGetScheduleService(injector);
    if (!scheduleService) return;
    if ((order.customFields as any)?.paymentScheduleId) return; // 幂等：已有期次
    try {
        if (activity.mode === 'full') {
            await scheduleService.createSchedule(ctx, {
                orderId: order.id,
                scenario: 'presale',
                deliveryGate: 'all_paid',
                depositRule: null,
                agreementVersion: activity.agreementVersion,
                shipDeadline: activity.shipDeadlineAt ?? null,
                items: [
                    {
                        seq: 1,
                        kind: 'balance',
                        amount: order.totalWithTax,
                        trigger: { type: 'date', at: new Date().toISOString() },
                        graceHours: activity.graceHours,
                    },
                ],
            });
        } else {
            const depositTotal = activity.depositAmount;
            const balanceTotal = Math.max(0, order.totalWithTax - depositTotal);
            const depositRule: Record<string, unknown> = { kind: activity.depositKind };
            if (activity.depositKind === 'earnest') {
                depositRule.earnestRefundPolicy = activity.earnestRefundPolicy ?? { onTimeout: 'full' };
            }
            await scheduleService.createSchedule(ctx, {
                orderId: order.id,
                scenario: 'presale',
                deliveryGate: 'all_paid',
                depositRule,
                agreementVersion: activity.agreementVersion,
                shipDeadline: activity.shipDeadlineAt ?? null,
                items: [
                    {
                        seq: 1,
                        kind: 'deposit',
                        amount: depositTotal,
                        trigger: { type: 'date', at: new Date().toISOString() },
                        graceHours: activity.graceHours,
                    },
                    {
                        seq: 2,
                        kind: 'balance',
                        amount: balanceTotal,
                        trigger: tailTrigger(activity),
                        graceHours: activity.graceHours,
                    },
                ],
            });
        }
        Logger.info(`Payment schedule created for pre-sale order ${order.code}`, loggerCtx);
    } catch (e: any) {
        Logger.error(`createScheduleForOrder failed for order ${order.code}: ${e.message}`, loggerCtx);
    }
}
```

- [x] **Step 4: applyPreSale 接入**

`pre-sale.service.ts` 顶部追加导入：

```typescript
import { createScheduleForOrder } from './payment-schedule-bridge';
import { getPreSaleInjector } from './pre-sale-runtime';   // 并入现有 pre-sale-runtime 导入
```

`applyPreSale` 的售罄置 ended 块之后、`return` 之前插入：

```typescript
        // 生成期次实例（软依赖 payment-schedule-plugin；未启用时跳过，薄壳回退旧路径）。
        // 重新取价格重算后的订单（Promotion 预售价此时已生效）。
        const pricedOrder = await this.orderService.findOne(ctx, order.id);
        if (pricedOrder) {
            await createScheduleForOrder(ctx, getPreSaleInjector(), pricedOrder, activity);
        }
```

- [x] **Step 5: admin resolver input 透传**

`pre-sale-admin.resolver.ts` 的 `create` / `update` 方法确认把 input 整体传给 service（现有实现即如此则不改）。若 resolver 对 input 做了字段挑选，补齐新字段。查看文件确认后进入下一步。

- [x] **Step 6: 跑测试确认通过**

在 `d:\zhao\vendure\packages\pre-sale-plugin` 执行：`npm run e2e`
预期：全部 PASS（含 Task 11 用例）。

- [x] **Step 7: 构建 + Commit**

在 `d:\zhao\vendure\packages\pre-sale-plugin` 执行：`npm run build`

```powershell
git add packages/pre-sale-plugin
git commit -m "feat(pre-sale): 下单时经软依赖桥生成支付期次实例（deposit双项/full单项）"
```

### Task 13: 旧支付 API 薄壳化（经期次支付，无期次回退旧路径）

**Files:**
- Modify: `d:\zhao\vendure\packages\payment-schedule-plugin\src\payment-schedule.service.ts`（追加 unlockTailForOrder）
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\src\payment-schedule-bridge.ts`（追加支付桥函数）
- Modify: `d:\zhao\vendure\packages\pre-sale-plugin\src\pre-sale.service.ts`（三薄壳）
- Test: `d:\zhao\vendure\packages\pre-sale-plugin\e2e\pre-sale.e2e-spec.ts`

- [x] **Step 1: 调度服务追加 unlockTailForOrder**

`payment-schedule.service.ts` 在 `confirmCodReceived` 方法之后追加：

```typescript
    /**
     * 薄壳桥专用：预售尾款窗口已开（窗口校验由 pre-sale-plugin 负责）→ 强制解锁 locked 尾款期。
     * 属 legacy 兼容通道（旧 API 语义：到货+窗口 ⇒ 尾款可付），优先级高于期次 trigger。
     */
    async unlockTailForOrder(ctx: RequestContext, orderId: ID): Promise<void> {
        const order = await this.orderService.findOne(ctx, orderId);
        if (!order) return;
        const scheduleId = (order.customFields as any)?.paymentScheduleId;
        const withItems = await this.getScheduleById(ctx, scheduleId);
        if (!withItems) return;
        const tail = withItems.items.find(i => i.kind === 'balance' && i.status === 'locked');
        if (!tail) return;
        tail.status = 'payable';
        if (!tail.dueAt) tail.dueAt = new Date();
        await this.itemRepo(ctx).save(tail);
        Logger.info(`Tail item ${tail.id} unlocked for order ${order.code} (legacy tail window open)`, loggerCtx);
    }
```

在 `d:\zhao\vendure\packages\payment-schedule-plugin` 执行 `npm run build`（pre-sale 将以 lib require 它）。

- [x] **Step 2: bridge 追加支付桥函数**

`payment-schedule-bridge.ts` 末尾追加：

```typescript
/**
 * 薄壳支付转发：订单已有期次 → 调 paySchedulePeriod 支付指定 seq。
 * 返回 true=已走期次路径；false=无期次/未启用（调用方回退旧路径）。
 */
export async function payViaSchedule(
    ctx: RequestContext,
    injector: Injector,
    order: Order,
    seq: number,
    method: string,
): Promise<boolean> {
    const scheduleService = tryGetScheduleService(injector);
    if (!scheduleService) return false;
    if (!(order.customFields as any)?.paymentScheduleId) return false;
    await scheduleService.paySchedulePeriod(ctx, order.id, seq, method);
    return true;
}

/**
 * 薄壳尾款转发：强制解锁尾款期（legacy 窗口语义）→ 期次支付尾款期。
 */
export async function payTailViaSchedule(
    ctx: RequestContext,
    injector: Injector,
    order: Order,
    method: string,
): Promise<boolean> {
    const scheduleService = tryGetScheduleService(injector);
    if (!scheduleService) return false;
    if (!(order.customFields as any)?.paymentScheduleId) return false;
    await scheduleService.unlockTailForOrder(ctx, order.id);
    const withItems = await scheduleService.getScheduleForOrder(ctx, order.id);
    const tail = (withItems?.items ?? []).find(
        (i: any) => i.kind === 'balance' && !['paid', 'refunded', 'waived', 'forfeited'].includes(i.status),
    );
    if (!tail) return false;
    await scheduleService.paySchedulePeriod(ctx, order.id, tail.seq, method);
    return true;
}
```

- [x] **Step 3: 三薄壳改造**

`pre-sale.service.ts` 追加导入：

```typescript
import { payTailViaSchedule, payViaSchedule } from './payment-schedule-bridge';   // 与既有 bridge 导入合并
```

三个支付方法整段替换：

```typescript
    /**
     * 全款预售：一次收清。
     * 新路径：期次实例存在 → paySchedulePeriod(seq=1)；否则旧路径直接收全额。
     */
    async payPreSaleFull(ctx: RequestContext, orderId: ID, method: string): Promise<Order> {
        const order = await this.requirePreSaleOrder(ctx, orderId);
        const activity = await this.requireActiveActivity(ctx, order);
        if (activity.mode !== 'full') {
            throw new UserInputError('This activity requires deposit pre-sale payment flow');
        }
        if (await payViaSchedule(ctx, getPreSaleInjector(), order, 1, method)) {
            return this.reload(ctx, orderId);
        }
        await this.createSettledPayment(ctx, order, order.totalWithTax, method);
        return this.reload(ctx, orderId);
    }

    /**
     * 定金预售：付定金。
     * 新路径：期次实例存在 → paySchedulePeriod(seq=1)（内部负责 ArrangingPayment→Deposited）；
     * 旧路径：createSettledPayment + 手动转 Deposited。
     */
    async payPreSaleDeposit(ctx: RequestContext, orderId: ID, method: string): Promise<Order> {
        const order = await this.requirePreSaleOrder(ctx, orderId);
        if (order.state !== 'ArrangingPayment') {
            throw new UserInputError('Order must be in ArrangingPayment state to pay deposit');
        }
        const activity = await this.requireActiveActivity(ctx, order);
        if (activity.mode !== 'deposit') {
            throw new UserInputError('This activity requires full pre-sale payment flow');
        }
        if (await payViaSchedule(ctx, getPreSaleInjector(), order, 1, method)) {
            return this.reload(ctx, orderId);
        }
        const depositTotal = (order as any).customFields?.preSaleDepositTotal ?? activity.depositAmount;
        if (!(depositTotal > 0)) {
            throw new UserInputError('Deposit amount must be greater than zero');
        }
        await this.createSettledPayment(ctx, order, depositTotal, method);
        await this.transition(ctx, orderId, 'Deposited');
        return this.reload(ctx, orderId);
    }

    /**
     * 定金预售：付尾款。
     * 校验状态 Deposited + 活动已到货 + 尾款窗口内（旧语义保留）。
     * 新路径：unlockTailForOrder + paySchedulePeriod（尾款期）；旧路径按剩余金额收款。
     */
    async payPreSaleTail(ctx: RequestContext, orderId: ID, method: string): Promise<Order> {
        const order = await this.requirePreSaleOrder(ctx, orderId);
        if (order.state !== 'Deposited') {
            throw new UserInputError('Order must be in Deposited state to pay tail');
        }
        const activityId = (order.customFields as any)?.preSaleActivityId;
        const activity = await this.findOne(ctx, activityId);
        if (!activity || activity.mode !== 'deposit') {
            throw new UserInputError('Pre-sale deposit activity not found');
        }
        if (activity.status !== 'delivered') {
            throw new UserInputError('Activity has not been delivered yet, tail payment not opened');
        }
        const now = new Date();
        if (activity.tailStartAt && now < activity.tailStartAt) {
            throw new UserInputError('Tail payment window has not started');
        }
        if (activity.tailEndAt && now > activity.tailEndAt) {
            throw new UserInputError('Tail payment window has ended');
        }
        if (await payTailViaSchedule(ctx, getPreSaleInjector(), order, method)) {
            return this.reload(ctx, orderId);
        }
        const covered = await this.settledCovered(ctx, order.id);
        const tailAmount = order.totalWithTax - covered;
        if (tailAmount <= 0) {
            throw new UserInputError('Order already fully paid');
        }
        await this.createSettledPayment(ctx, order, tailAmount, method);
        return this.reload(ctx, orderId);
    }
```

- [x] **Step 4: e2e 薄壳回归**

4a. describe 末尾追加用例：

```typescript
    it('薄壳支付走期次路径：payPreSaleDeposit→Deposited；到货+payPreSaleTail→PaymentSettled', async () => {
        const actId = await createActivity({
            presalePrice: PRESALE_PRICE,
            depositAmount: 19980,
            tailTriggerType: 'manual',
        });
        const orderId = await applyPreSale(actId);

        // 付定金（薄壳 → 期次 seq=1）
        await shopClient.query(gql`
            mutation { payPreSaleDeposit(orderId: "${orderId}", method: "${PAY_METHOD}") { id state } }
        `);
        expect(await orderState(orderId)).toBe('Deposited');
        let sched = (await shopClient.query(gql`
            query { paymentSchedule(orderId: "${orderId}") { status paidTotal items { seq kind status } } }
        `)) as any;
        expect(sched.paymentSchedule.status).toBe('in_progress');
        expect(sched.paymentSchedule.items[0].status).toBe('paid');
        expect(sched.paymentSchedule.items[1].status).toBe('locked');

        // 到货 → 手动开尾款窗（manual 型）→ 薄壳付尾款
        await adminClient.query(gql`mutation { deliverPreSale(id: "${actId}") { id status } }`);
        const schedId = (
            (await shopClient.query(gql`
                query { paymentSchedule(orderId: "${orderId}") { id } }
            `)) as any
        ).paymentSchedule.id;
        await adminClient.query(gql`
            mutation { openTailWindow(scheduleId: "${schedId}") { id items { seq status } } }
        `);
        await shopClient.query(gql`
            mutation { payPreSaleTail(orderId: "${orderId}", method: "${PAY_METHOD}") { id state } }
        `);
        expect(await orderState(orderId)).toBe('PaymentSettled');
        sched = (await shopClient.query(gql`
            query { paymentSchedule(orderId: "${orderId}") { status paidTotal items { seq status } } }
        `)) as any;
        expect(sched.paymentSchedule.status).toBe('completed');
        expect(sched.paymentSchedule.paidTotal).toBe(PRESALE_PRICE);
    });

    it('全款预售薄壳走期次路径：payPreSaleFull → PaymentSettled + 期次 completed', async () => {
        const actId = await createActivity({ mode: 'full', presalePrice: PRESALE_PRICE });
        const orderId = await applyPreSale(actId);
        await shopClient.query(gql`
            mutation { payPreSaleFull(orderId: "${orderId}", method: "${PAY_METHOD}") { id state } }
        `);
        expect(await orderState(orderId)).toBe('PaymentSettled');
        const sched = (await shopClient.query(gql`
            query { paymentSchedule(orderId: "${orderId}") { status items { seq status } } }
        `)) as any;
        expect(sched.paymentSchedule.status).toBe('completed');
    });
```

4b. 跑全量：在 `d:\zhao\vendure\packages\pre-sale-plugin` 执行：`npm run e2e`
预期：**全部 PASS**（既有旧路径用例因期次实例存在自动走新路径，行为等价）。

- [x] **Step 5: 构建 + Commit**

在 `d:\zhao\vendure\packages\pre-sale-plugin` 执行：`npm run build`

```powershell
git add packages/payment-schedule-plugin packages/pre-sale-plugin
git commit -m "feat(pre-sale): 旧支付API薄壳化——期次存在时转发paySchedulePeriod，无期次回退旧路径"
```

### Task 14: payment-schedule e2e 主套件（调度/违约/COD/团购/卖家违约）

**Files:**
- Test: `d:\zhao\vendure\packages\payment-schedule-plugin\e2e\payment-schedule.e2e-spec.ts`

**前置依赖：** `@vendure/pre-sale-plugin`、`@vendure/group-buy-plugin` 已构建（Task 10/13 后各 `npm run build`）。

- [x] **Step 1: 创建 e2e 文件（完整内容）**

```typescript
import { createTestEnvironment, registerInitializer, SqljsInitializer } from '@vendure/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import gql from 'graphql-tag';
import { LanguageCode, mergeConfig, PaymentMethodHandler } from '@vendure/core';
import { initialData } from '../../../e2e-common/e2e-initial-data';
import { TEST_SETUP_TIMEOUT_MS, testConfig } from '../../../e2e-common/test-config';
import { PaymentSchedulePlugin } from '../src/plugin';
import { PreSalePlugin } from '@vendure/pre-sale-plugin';
import { GroupBuyPlugin } from '@vendure/group-buy-plugin';
import { singleStageRefundablePaymentMethod } from '../../core/e2e/fixtures/test-payment-methods';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

/** 内联 COD handler：createPayment 返回 Authorized（送达收款），settlePayment 恒成功 */
const testCodHandler = new PaymentMethodHandler({
    code: 'test-cod',
    description: [{ languageCode: LanguageCode.en, value: 'Test COD handler' }],
    args: {},
    createPayment: (ctx, order, amount, args, metadata) => ({
        amount,
        state: 'Authorized' as const,
        transactionId: `cod-${order.code}`,
        metadata,
    }),
    settlePayment: async () => ({ success: true }),
});

/**
 * 期次调度主流程 e2e：
 * 预售期次生成/薄壳（详见 pre-sale e2e）→ 此处覆盖通用调度：
 * date 触发 / 通用 paySchedulePeriod / COD 环 / 买家违约（定金没收·订金退款）/
 * cancelSchedule / 团购成团与失败 / 卖家违约双倍返还。
 */
describe('PaymentSchedulePlugin · 期次调度主流程', () => {
    const config = mergeConfig(testConfig(), {
        plugins: [PaymentSchedulePlugin.init({}), PreSalePlugin.init({}), GroupBuyPlugin.init({})],
        paymentOptions: { paymentMethodHandlers: [singleStageRefundablePaymentMethod, testCodHandler] },
    });
    const { server, adminClient, shopClient } = createTestEnvironment(config);

    const PAY_METHOD = singleStageRefundablePaymentMethod.code;
    const PRESALE_PRICE = 99900; // Laptop 13" 预售价（pricesIncludeTax=true）

    let variantId: string;
    let seq = 0;

    /* ------------------------- helpers ------------------------- */

    function ts(offsetMinutes: number): string {
        return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
    }

    async function setChannelPricesIncludeTax(): Promise<void> {
        const channels = (await adminClient.query(gql`
            query { channels { items { id } } }
        `)) as any;
        const id = channels.channels.items[0].id;
        await adminClient.query(gql`
            mutation { updateChannel(input: { id: "${id}", pricesIncludeTax: true }) { ... on Channel { id } } }
        `);
    }

    async function createActivity(input: {
        depositAmount?: number;
        depositKind?: string;
        tailTriggerType?: string;
        groupBuyActivityId?: number;
        tailStartAt?: string;
        graceHours?: number;
        earnestRefundPolicy?: string;
        shipDeadlineAt?: string;
    }): Promise<string> {
        const optional = [
            input.depositKind ? `depositKind: "${input.depositKind}"` : '',
            input.tailTriggerType ? `tailTriggerType: "${input.tailTriggerType}"` : '',
            input.groupBuyActivityId != null ? `groupBuyActivityId: ${input.groupBuyActivityId}` : '',
            input.tailStartAt ? `tailStartAt: "${input.tailStartAt}"` : '',
            input.graceHours != null ? `graceHours: ${input.graceHours}` : '',
            input.earnestRefundPolicy ? `earnestRefundPolicy: ${input.earnestRefundPolicy}` : '',
            input.shipDeadlineAt ? `shipDeadlineAt: "${input.shipDeadlineAt}"` : '',
        ]
            .filter(Boolean)
            .join('\n                    ');
        const res = (await adminClient.query(gql`
            mutation {
                createPreSaleActivity(input: {
                    name: "调度-${seq++}"
                    mode: deposit
                    startAt: "${ts(-60)}"
                    endAt: "${ts(24 * 60)}"
                    presalePrice: ${PRESALE_PRICE}
                    depositAmount: ${input.depositAmount ?? 19980}
                    totalStock: 50
                    ${optional}
                    productId: "${variantId}"
                    variantId: "${variantId}"
                }) { id status }
            }
        `)) as any;
        return res.createPreSaleActivity.id as string;
    }

    async function createGroupBuyActivity(input: { targetCount: number; endAt: string }): Promise<string> {
        const res = (await adminClient.query(gql`
            mutation {
                createGroupBuyActivity(input: {
                    name: "团购-${seq++}"
                    description: "e2e"
                    targetCount: ${input.targetCount}
                    startAt: "${ts(-60)}"
                    endAt: "${input.endAt}"
                    groupPrice: 89900
                    productId: "${variantId}"
                    variantId: "${variantId}"
                }) { id status }
            }
        `)) as any;
        return res.createGroupBuyActivity.id as string;
    }

    /** 活动期次化下单：freshOrder + applyPreSale，返回 orderId */
    async function applyPreSale(activityId: string): Promise<string> {
        const active = (await shopClient.query(gql`
            query { activeOrder { id } }
        `)) as any;
        if (active.activeOrder?.id) {
            await adminClient.query(gql`
                mutation { cancelOrder(input: { orderId: "${active.activeOrder.id}" }) { ... on Order { id } } }
            `);
        }
        await shopClient.query(gql`
            mutation { addItemToOrder(productVariantId: "${variantId}", quantity: 1) {
                ... on Order { id } ... on ErrorResult { errorCode message }
            } }
        `);
        const res = (await shopClient.query(gql`
            mutation { applyPreSale(activityId: "${activityId}") { id state } }
        `)) as any;
        return res.applyPreSale.id as string;
    }

    async function scheduleOf(orderId: string): Promise<any> {
        const res = (await shopClient.query(gql`
            query {
                paymentSchedule(orderId: "${orderId}") {
                    id status breachType depositRule totalAmount paidTotal
                    items { seq kind amount status allowCod paymentId }
                }
            }
        `)) as any;
        return res.paymentSchedule;
    }

    async function adminSchedule(scheduleId: string): Promise<any> {
        const res = (await adminClient.query(gql`
            query {
                adminPaymentSchedule(id: "${scheduleId}") {
                    id status breachType items { seq kind status }
                }
            }
        `)) as any;
        return res.adminPaymentSchedule;
    }
    // 注：adminPaymentSchedule 供调试使用；用例断言统一走 shop 端 scheduleOf（requireOwner 不适用于 admin 查询）

    async function runScan(): Promise<{ activated: number; overdue: number; shipBreaches: number }> {
        const res = (await adminClient.query(gql`
            mutation { runScheduleScan { activated overdue shipBreaches } }
        `)) as any;
        return res.runScheduleScan;
    }

    /** 返回 order { state, payments[{ state, refunds[{ total }] }] } */
    async function orderState(id: string): Promise<any> {
        const res = (await adminClient.query(gql`
            query { order(id: "${id}") { state payments { state refunds { total } } } }
        `)) as any;
        return res.order;
    }

    async function assertShopError(fn: () => Promise<any>, substring: string): Promise<void> {
        try {
            await fn();
        } catch (e: any) {
            const msg = e?.response?.errors?.[0]?.message ?? e?.message ?? '';
            expect(msg.toLowerCase()).toContain(substring);
            return;
        }
        throw new Error('Expected the operation to throw, but it succeeded');
    }

    /** 违约扫描依赖 now > dueAt+graceHours；graceHours=0 时预留 1s 时钟余量 */
    async function tick(seconds = 1): Promise<void> {
        await new Promise(r => setTimeout(r, seconds * 1000));
    }

    /* ------------------------- beforeAll / afterAll ------------------------- */

    beforeAll(async () => {
        await server.init({
            initialData: {
                ...initialData,
                paymentMethods: [
                    { name: PAY_METHOD, handler: { code: PAY_METHOD, arguments: [] } },
                    { name: testCodHandler.code, handler: { code: testCodHandler.code, arguments: [] } },
                ],
            },
            productsCsvPath: path.join(__dirname, '../../core/e2e/fixtures/e2e-products-minimal.csv'),
            customerCount: 1,
        });
        await adminClient.asSuperAdmin();
        await setChannelPricesIncludeTax();
        const products = (await adminClient.query(gql`
            query { products(options: { take: 1 }) { items { id variants { id } } } }
        `)) as any;
        variantId = products.products.items[0].variants[0].id;
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
    }, TEST_SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await server.destroy();
    });

    /* ------------------------- 用例 ------------------------- */

    it('date 触发 + 通用 paySchedulePeriod：扫描解锁尾款期，直付到期次', async () => {
        const actId = await createActivity({ tailTriggerType: 'date', tailStartAt: ts(-1) });
        const orderId = await applyPreSale(actId);
        await shopClient.query(gql`
            mutation { payPreSaleDeposit(orderId: "${orderId}", method: "${PAY_METHOD}") { id state } }
        `);
        const scan = await runScan();
        expect(scan.activated).toBeGreaterThanOrEqual(1);
        let sched = await scheduleOf(orderId);
        expect(sched.items[1].status).toBe('payable');

        const res = (await shopClient.query(gql`
            mutation { paySchedulePeriod(orderId: "${orderId}", seq: 2, method: "${PAY_METHOD}") { status items { seq status } } }
        `)) as any;
        expect(res.paySchedulePeriod.status).toBe('completed');
        expect(await orderState(orderId)).toMatchObject({ state: 'PaymentSettled' } as any);
        sched = await scheduleOf(orderId);
        expect(sched.items[1].status).toBe('paid');
    });

    it('COD 环：Authorized 授权留待确认 → confirmCodReceived 收款收口', async () => {
        const actId = await createActivity({ tailTriggerType: 'manual' });
        const orderId = await applyPreSale(actId);
        await shopClient.query(gql`
            mutation { payPreSaleDeposit(orderId: "${orderId}", method: "${PAY_METHOD}") { id state } }
        `);
        const sched = await scheduleOf(orderId);
        await adminClient.query(gql`mutation { openTailWindow(scheduleId: "${sched.id}") { id } }`);

        // COD 支付尾款期：item 留 payable+paymentId，订单不动
        await shopClient.query(gql`
            mutation { paySchedulePeriod(orderId: "${orderId}", seq: 2, method: "test-cod") { id } }
        `);
        let after = await scheduleOf(orderId);
        expect(after.items[1].status).toBe('payable');
        expect(after.items[1].paymentId).not.toBeNull();
        expect((await orderState(orderId)).state).toBe('Deposited');

        // 管理员签收确认 → settle → PaymentSettled
        await adminClient.query(gql`mutation { confirmCodReceived(orderId: "${orderId}") { id } }`);
        after = await scheduleOf(orderId);
        expect(after.items[1].status).toBe('paid');
        expect((await orderState(orderId)).state).toBe('PaymentSettled');
    });

    it('买家超时未付定金（legal_deposit）：没收 + 订单取消 + 库存释放', async () => {
        const actId = await createActivity({ graceHours: 0 });
        const orderId = await applyPreSale(actId); // 不付定金
        await tick();
        const scan = await runScan();
        expect(scan.overdue).toBeGreaterThanOrEqual(1);

        const sched = await scheduleOf(orderId);
        expect(sched.status).toBe('breached');
        expect(sched.breachType).toBe('buyer_timeout');
        expect(sched.items[0].status).toBe('forfeited');
        expect((await orderState(orderId)).state).toBe('Cancelled');
        // 库存释放（pre-sale 订阅订单取消）
        const act = (await adminClient.query(gql`
            query { preSaleActivity(id: "${actId}") { soldCount } }
        `)) as any;
        expect(act.preSaleActivity.soldCount).toBe(0);
    });

    it('买家超时未付订金（earnest）：按策略退款（全额/比例）+ 订单取消', async () => {
        // 全额退
        const actFull = await createActivity({
            depositKind: 'earnest',
            earnestRefundPolicy: '{ onTimeout: full }',
            graceHours: 0,
        });
        const orderFull = await applyPreSale(actFull);
        await tick();
        await runScan();
        const schedFull = await scheduleOf(orderFull);
        expect(schedFull.items[0].status).toBe('refunded');
        expect(schedFull.status).toBe('cancelled');
        const fullOrder = await orderState(orderFull);
        expect(fullOrder.state).toBe('Cancelled');
        expect(fullOrder.payments[0].refunds.map((r: any) => r.total)).toContain(19980);

        // 比例退（50%）
        const actPart = await createActivity({
            depositKind: 'earnest',
            earnestRefundPolicy: '{ onTimeout: partial, partialRate: 0.5 }',
            graceHours: 0,
        });
        const orderPart = await applyPreSale(actPart);
        await tick();
        await runScan();
        const partOrder = await orderState(orderPart);
        expect(partOrder.payments[0].refunds.map((r: any) => r.total)).toContain(9990);
    });

    it('cancelSchedule：定金须确认罚则；订金主动取消退全款', async () => {
        // 定金：未付 → confirmForfeit=false 报错；true → 取消
        const actLegal = await createActivity({ tailTriggerType: 'manual' });
        const orderLegal = await applyPreSale(actLegal);
        await assertShopError(
            () => shopClient.query(gql`mutation { cancelSchedule(orderId: "${orderLegal}") { id } }`),
            'confirmforfeit',
        );
        await shopClient.query(gql`
            mutation { cancelSchedule(orderId: "${orderLegal}", confirmForfeit: true) { status items { seq status } } }
        `);
        expect((await orderState(orderLegal)).state).toBe('Cancelled');
        const legalSched = await scheduleOf(orderLegal);
        expect(legalSched.items[0].status).toBe('waived'); // 未付定金 → waived（无款可没）

        // 订金：已付 → 主动取消全额退
        const actEarnest = await createActivity({ depositKind: 'earnest', tailTriggerType: 'manual' });
        const orderEarnest = await applyPreSale(actEarnest);
        await shopClient.query(gql`
            mutation { payPreSaleDeposit(orderId: "${orderEarnest}", method: "${PAY_METHOD}") { id state } }
        `);
        await shopClient.query(gql`
            mutation { cancelSchedule(orderId: "${orderEarnest}") { status items { seq status } } }
        `);
        const earnestSched = await scheduleOf(orderEarnest);
        expect(earnestSched.items[0].status).toBe('refunded');
        const earnestOrder = await orderState(orderEarnest);
        expect(earnestOrder.payments[0].refunds.map((r: any) => r.total)).toContain(19980);
    });

    it('团购成团事件触发：group_buy 尾款期 locked → payable', async () => {
        const gbId = await createGroupBuyActivity({ targetCount: 1, endAt: ts(60) });
        const actId = await createActivity({
            tailTriggerType: 'group_buy',
            groupBuyActivityId: Number(gbId),
        });
        const orderId = await applyPreSale(actId);
        await shopClient.query(gql`
            mutation { payPreSaleDeposit(orderId: "${orderId}", method: "${PAY_METHOD}") { id state } }
        `);
        // 参团（targetCount=1 → 即刻成团 → GroupBuyCompletedEvent → 期次解锁）
        await shopClient.query(gql`
            mutation { joinGroupBuy(activityId: "${gbId}", orderId: "${orderId}", isLeader: true) { status } }
        `);
        const sched = await scheduleOf(orderId);
        expect(sched.items[1].status).toBe('payable');
    });

    it('团购失败：已付期次全额退 + 调度 breached(group_buy_failed) + 订单取消', async () => {
        const gbId = await createGroupBuyActivity({ targetCount: 2, endAt: ts(-5) }); // 已过期且不成团
        const actId = await createActivity({
            tailTriggerType: 'group_buy',
            groupBuyActivityId: Number(gbId),
        });
        const orderId = await applyPreSale(actId);
        await shopClient.query(gql`
            mutation { payPreSaleDeposit(orderId: "${orderId}", method: "${PAY_METHOD}") { id state } }
        `);
        await runScan(); // 触发扫描兜底：group_buy 活动 active 且 endAt<now → failed

        const sched = await scheduleOf(orderId);
        expect(sched.status).toBe('breached');
        expect(sched.breachType).toBe('group_buy_failed');
        expect(sched.items[0].status).toBe('refunded');
        const order = await orderState(orderId);
        expect(order.state).toBe('Cancelled');
        expect(order.payments[0].refunds.map((r: any) => r.total)).toContain(19980);
    });

    it('卖家超期未发货：runScheduleScan 标记 seller_breach → confirmSellerBreach 双倍返还', async () => {
        const actId = await createActivity({ tailTriggerType: 'manual', shipDeadlineAt: ts(-5) });
        const orderId = await applyPreSale(actId);
        await shopClient.query(gql`
            mutation { payPreSaleDeposit(orderId: "${orderId}", method: "${PAY_METHOD}") { id state } }
        `);
        const scan = await runScan();
        expect(scan.shipBreaches).toBeGreaterThanOrEqual(1);
        const sched = await scheduleOf(orderId);
        expect(sched.breachType).toBe('seller_breach');

        const res = (await adminClient.query(gql`
            mutation { confirmSellerBreach(scheduleId: "${sched.id}") { status items { seq status } } }
        `)) as any;
        expect(res.confirmSellerBreach.status).toBe('cancelled');
        expect(res.confirmSellerBreach.items[0].status).toBe('refunded');

        const order = await orderState(orderId);
        expect(order.state).toBe('Cancelled');
        // 双倍返还：本金 + 等额赔偿两笔，合计 2×19980
        const refundTotals = order.payments[0].refunds.map((r: any) => r.total);
        expect(refundTotals.filter((t: number) => t === 19980)).toHaveLength(2);
    });
});
```

- [x] **Step 2: 删缓存并跑**

在 `d:\zhao\vendure\packages\payment-schedule-plugin` 执行：

```powershell
Remove-Item -Recurse -Force e2e\__data__    # 若存在
npm run e2e
```

预期：8 个用例全部 PASS。

**失败排查对照：**
- `paymentSchedule` 返回 null：applyPreSale 期次生成失败 → 查服务器日志 `createScheduleForOrder failed`；
- `joinGroupBuy` 报错：确认预售订单变体与团购活动 variantId 一致、订单在 ArrangingPayment；
- `runScheduleScan` 计数为 0：时钟竞态 → 增大 `tick()` 秒数重试。

- [x] **Step 3: Commit**

```powershell
git add packages/payment-schedule-plugin
git commit -m "test(payment-schedule): 期次调度主流程e2e（触发/COD环/违约矩阵/团购/卖家违约）"
```

---

# 阶段 3：installment-plugin（分期场景）

### Task 15: installment 包骨架 + InstallmentPlan 实体 + Admin CRUD

**Files:**
- Create: `d:\zhao\vendure\packages\installment-plugin\package.json`
- Create: `d:\zhao\vendure\packages\installment-plugin\tsconfig.json`
- Create: `d:\zhao\vendure\packages\installment-plugin\tsconfig.build.json`
- Create: `d:\zhao\vendure\packages\installment-plugin\vitest.config.mts`
- Create: `d:\zhao\vendure\packages\installment-plugin\index.ts`
- Create: `d:\zhao\vendure\packages\installment-plugin\src\constants.ts`
- Create: `d:\zhao\vendure\packages\installment-plugin\src\types.ts`
- Create: `d:\zhao\vendure\packages\installment-plugin\src\installment-plan.entity.ts`
- Create: `d:\zhao\vendure\packages\installment-plugin\src\installment.service.ts`
- Create: `d:\zhao\vendure\packages\installment-plugin\src\installment-admin.resolver.ts`
- Create: `d:\zhao\vendure\packages\installment-plugin\src\plugin.ts`

- [x] **Step 1: 四件套骨架**

`package.json`：

```json
{
    "name": "@vendure/installment-plugin",
    "version": "0.0.1",
    "license": "GPL-3.0-or-later",
    "main": "lib/index.js",
    "types": "lib/index.d.ts",
    "files": ["lib/**/*"],
    "scripts": {
        "watch": "tsc -p ./tsconfig.build.json --watch",
        "build": "rimraf lib && tsc -p ./tsconfig.build.json",
        "lint": "eslint --fix .",
        "test": "vitest --config vitest.config.mts --run src",
        "e2e": "cross-env PACKAGE=installment-plugin vitest --config vitest.config.mts --run"
    },
    "dependencies": {},
    "peerDependencies": {
        "@vendure/common": "^3.6.0",
        "@vendure/core": "^3.6.0"
    },
    "devDependencies": {
        "@vendure/core": "^3.6.0",
        "@vendure/testing": "^3.6.0",
        "rimraf": "^3.0.2",
        "typescript": "5.8.2",
        "vitest": "^3.2.4",
        "cross-env": "^7.0.3",
        "graphql-tag": "^2.12.6"
    }
}
```

`tsconfig.json` / `tsconfig.build.json` / `vitest.config.mts` / `index.ts` / `src\constants.ts`：与 Task 1 中 pre-sale 样板逐字相同，仅做以下替换：`extends: ../tsconfig.base` 等相对路径按包位置原样保留；`index.ts` 此步先只导出：

```typescript
export * from './src/plugin';
export * from './src/installment-plan.entity';
export * from './src/installment.service';
export * from './src/types';
export * from './src/constants';
```

`src\constants.ts`：

```typescript
export const loggerCtx = 'InstallmentPlugin';
export const INSTALLMENT_PLUGIN_OPTIONS = Symbol('INSTALLMENT_PLUGIN_OPTIONS');
```

`src\types.ts`：

```typescript
export interface InstallmentPluginOptions {
    /** 期次默认宽限小时数（未在生成时指定时） */
    defaultGraceHours?: number;
}
```

- [x] **Step 2: InstallmentPlan 实体**

`src\installment-plan.entity.ts`：

```typescript
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { Channel, ChannelAware, DeepPartial, VendureEntity } from '@vendure/core';

export type IntervalUnit = 'day' | 'week' | 'month';

/**
 * 分期计划（variant 级配置）。
 * - downPaymentRatio：首付比例（整数百分比 0-90；0 = 无首付）
 * - periods：分期期数（1-36）
 * - intervalCount：间隔数（0 = 立即应付，>0 = 每隔 N 个 unit 一期）
 * - feeRule：手续费规则（仅登记，本次不计费——设计 §11 边界）
 */
@Entity()
export class InstallmentPlan extends VendureEntity implements ChannelAware {
    constructor(input?: DeepPartial<InstallmentPlan>) {
        super(input);
    }

    @Column('varchar')
    name: string;

    @Column({ type: 'int' })
    variantId: number;

    /** 首付比例（0-90，整数百分比） */
    @Column({ type: 'int', default: 0 })
    downPaymentRatio: number;

    /** 分期期数（1-36） */
    @Column({ type: 'int', default: 3 })
    periods: number;

    @Column('varchar', { default: 'month' })
    intervalUnit: IntervalUnit;

    /** 期次间隔（0 = 立即应付；e2e/特殊场景用） */
    @Column({ type: 'int', default: 1 })
    intervalCount: number;

    /** 手续费规则（仅登记） */
    @Column('simple-json', { nullable: true })
    feeRule?: { rate?: number; fixed?: number } | null;

    @Column({ type: 'boolean', default: false })
    allowCod: boolean;

    @Column({ type: 'boolean', default: true })
    enabled: boolean;

    @ManyToMany(() => Channel)
    @JoinTable()
    channels: Channel[];
}
```

- [x] **Step 3: Service + Admin resolver + plugin 组装**

`src\installment.service.ts`：

```typescript
import { Injectable } from '@nestjs/common';
import {
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { InstallmentPlan } from './installment-plan.entity';

const INTERVAL_UNITS: ReadonlyArray<string> = ['day', 'week', 'month'];

@Injectable()
export class InstallmentService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    private repo(ctx: RequestContext) {
        return this.connection.getRepository(ctx, InstallmentPlan);
    }

    async findAll(ctx: RequestContext, options?: ListQueryOptions<InstallmentPlan>): Promise<PaginatedList<InstallmentPlan>> {
        return this.listQueryBuilder
            .build(InstallmentPlan, options, { ctx, channelId: ctx.channelId, relations: ['channels'] })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    async findByVariant(ctx: RequestContext, variantId: ID): Promise<InstallmentPlan[]> {
        return this.repo(ctx)
            .createQueryBuilder('plan')
            .innerJoin('plan.channels', 'channel', 'channel.id = :cid', { cid: ctx.channelId })
            .where('plan.variantId = :vid', { vid: Number(variantId) })
            .andWhere('plan.enabled = :enabled', { enabled: true })
            .getMany();
    }

    async findOne(ctx: RequestContext, id: ID): Promise<InstallmentPlan | undefined> {
        return (await this.repo(ctx).findOne({ where: { id: id as any } })) ?? undefined;
    }

    async create(ctx: RequestContext, input: Partial<InstallmentPlan>): Promise<InstallmentPlan> {
        this.assertValid(input);
        const plan = new InstallmentPlan(input as any);
        plan.channels = [ctx.channel];
        return this.repo(ctx).save(plan);
    }

    async update(ctx: RequestContext, input: any): Promise<InstallmentPlan> {
        const plan = await this.repo(ctx).findOne({ where: { id: input.id } });
        if (!plan) {
            throw new UserInputError(`InstallmentPlan ${input.id} not found`);
        }
        const merged = { ...plan, ...input };
        this.assertValid(merged);
        Object.assign(plan, input);
        return this.repo(ctx).save(plan);
    }

    async delete(ctx: RequestContext, id: ID): Promise<void> {
        await this.repo(ctx).delete(id);
    }

    /** 参数硬校验（设计 §5：首付比 0-90 / 期数 1-36） */
    private assertValid(plan: Partial<InstallmentPlan>): void {
        if (plan.downPaymentRatio != null && (plan.downPaymentRatio < 0 || plan.downPaymentRatio > 90)) {
            throw new UserInputError('downPaymentRatio must be between 0 and 90');
        }
        if (plan.periods != null && (plan.periods < 1 || plan.periods > 36)) {
            throw new UserInputError('periods must be between 1 and 36');
        }
        if (plan.intervalUnit != null && !INTERVAL_UNITS.includes(plan.intervalUnit)) {
            throw new UserInputError('intervalUnit must be day/week/month');
        }
        if (plan.intervalCount != null && plan.intervalCount < 0) {
            throw new UserInputError('intervalCount must be >= 0');
        }
    }
}
```

`src\installment-admin.resolver.ts`：

```typescript
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, ListQueryOptions, PaginatedList, RequestContext, Transaction } from '@vendure/core';

import { InstallmentPlan } from './installment-plan.entity';
import { InstallmentService } from './installment.service';

@Resolver()
export class InstallmentAdminResolver {
    constructor(private installmentService: InstallmentService) {}

    @Query()
    installmentPlans(
        @Ctx() ctx: RequestContext,
        @Args('options', { nullable: true }) options?: ListQueryOptions<InstallmentPlan>,
    ): Promise<PaginatedList<InstallmentPlan>> {
        return this.installmentService.findAll(ctx, options);
    }

    @Query()
    installmentPlan(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<InstallmentPlan | undefined> {
        return this.installmentService.findOne(ctx, id);
    }

    @Mutation()
    @Transaction()
    createInstallmentPlan(@Ctx() ctx: RequestContext, @Args('input') input: any): Promise<InstallmentPlan> {
        return this.installmentService.create(ctx, input);
    }

    @Mutation()
    @Transaction()
    updateInstallmentPlan(@Ctx() ctx: RequestContext, @Args('input') input: any): Promise<InstallmentPlan> {
        return this.installmentService.update(ctx, input);
    }

    @Mutation()
    @Transaction()
    async deleteInstallmentPlan(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<boolean> {
        await this.installmentService.delete(ctx, id);
        return true;
    }
}
```

`src\plugin.ts`：

```typescript
import { Type } from '@nestjs/common';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { INSTALLMENT_PLUGIN_OPTIONS } from './constants';
import { InstallmentPlan } from './installment-plan.entity';
import { InstallmentAdminResolver } from './installment-admin.resolver';
import { InstallmentService } from './installment.service';
import { InstallmentPluginOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [InstallmentPlan],
    providers: [
        { provide: INSTALLMENT_PLUGIN_OPTIONS, useFactory: () => InstallmentPlugin.options },
        InstallmentService,
    ],
    exports: [InstallmentService],
    adminApiExtensions: {
        schema: () => gql`
            type InstallmentPlan implements Node {
                id: ID!
                name: String!
                variantId: ID!
                downPaymentRatio: Int!
                periods: Int!
                intervalUnit: String!
                intervalCount: Int!
                feeRule: JSON
                allowCod: Boolean!
                enabled: Boolean!
                createdAt: DateTime!
                updatedAt: DateTime!
            }

            type InstallmentPlanList implements PaginatedList {
                items: [InstallmentPlan!]!
                totalItems: Int!
            }

            input CreateInstallmentPlanInput {
                name: String!
                variantId: ID!
                downPaymentRatio: Int
                periods: Int
                intervalUnit: String
                intervalCount: Int
                feeRule: JSON
                allowCod: Boolean
                enabled: Boolean
            }

            input UpdateInstallmentPlanInput {
                id: ID!
                name: String
                downPaymentRatio: Int
                periods: Int
                intervalUnit: String
                intervalCount: Int
                feeRule: JSON
                allowCod: Boolean
                enabled: Boolean
            }

            input InstallmentPlanListOptions

            extend type Query {
                installmentPlans(options: InstallmentPlanListOptions): InstallmentPlanList!
                installmentPlan(id: ID!): InstallmentPlan
            }

            extend type Mutation {
                createInstallmentPlan(input: CreateInstallmentPlanInput!): InstallmentPlan!
                updateInstallmentPlan(input: UpdateInstallmentPlanInput!): InstallmentPlan!
                deleteInstallmentPlan(id: ID!): Boolean!
            }
        `,
        resolvers: [InstallmentAdminResolver],
    },
    compatibility: '^3.0.0',
})
export class InstallmentPlugin {
    private static options: InstallmentPluginOptions = {};

    static init(options?: InstallmentPluginOptions): Type<InstallmentPlugin> {
        InstallmentPlugin.options = options ?? {};
        return InstallmentPlugin;
    }
}
```

- [x] **Step 4: 根目录链接 + 构建 + Commit**

在 `d:\zhao\vendure` 执行 `npm install`（workspaces 链接）。
在 `d:\zhao\vendure\packages\installment-plugin` 执行 `npm run build`（预期成功）。

```powershell
git add packages/installment-plugin
git commit -m "feat(installment): 分期计划插件骨架（InstallmentPlan 实体 + Admin CRUD + 参数校验）"
```

### Task 16: installment Shop API + 期次生成 + e2e

**Files:**
- Create: `d:\zhao\vendure\packages\installment-plugin\src\installment-schedule-bridge.ts`
- Create: `d:\zhao\vendure\packages\installment-plugin\src\installment-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\installment-plugin\src\plugin.ts`（shop schema）
- Modify: `d:\zhao\vendure\packages\installment-plugin\index.ts`
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`
- Test: `d:\zhao\vendure\packages\installment-plugin\e2e\installment.e2e-spec.ts`

- [x] **Step 1: 软依赖桥（期次生成）**

`src\installment-schedule-bridge.ts`：

```typescript
import { Injector, Logger, Order, RequestContext } from '@vendure/core';

import { loggerCtx } from './constants';
import { InstallmentPlan } from './installment-plan.entity';

/** 软依赖：未启用 payment-schedule-plugin → 返回 null（分期退化为普通订单支付） */
export function tryGetScheduleService(injector: Injector): any | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PaymentScheduleService } = require('@vendure/payment-schedule-plugin');
        return injector.get(PaymentScheduleService, { strict: false }) ?? null;
    } catch {
        return null;
    }
}

/**
 * 结算页选择分期（enableInstallment）时生成期次实例：
 * 首付项（down_payment，ratio>0 时）+ N 期 installment（interval trigger）。
 * deliveryGate=first_period（付首付即可发货）；depositRule=down_payment（无罚则）。
 */
export async function createInstallmentSchedule(
    ctx: RequestContext,
    injector: Injector,
    order: Order,
    plan: InstallmentPlan,
    graceHours: number,
): Promise<void> {
    const scheduleService = tryGetScheduleService(injector);
    if (!scheduleService) return;
    if ((order.customFields as any)?.paymentScheduleId) return; // 幂等
    try {
        const total = order.totalWithTax;
        const down = plan.downPaymentRatio > 0 ? Math.floor((total * plan.downPaymentRatio) / 100) : 0;
        const balance = total - down;
        // 余数并入末期（Task 2 纯函数）
        const { splitInstallmentAmounts } = require('@vendure/payment-schedule-plugin');
        const amounts: number[] = splitInstallmentAmounts(balance, plan.periods);
        const now = new Date();
        const items: Record<string, unknown>[] = [];
        let seq = 1;
        if (down > 0) {
            items.push({
                seq: seq++,
                kind: 'down_payment',
                amount: down,
                trigger: { type: 'date', at: now.toISOString() },
                graceHours,
            });
        }
        amounts.forEach((amount, i) => {
            items.push({
                seq: seq++,
                kind: 'installment',
                amount,
                allowCod: plan.allowCod,
                trigger: {
                    type: 'interval',
                    unit: plan.intervalUnit,
                    count: plan.intervalCount * (i + 1),
                    anchor: 'order_placed',
                },
                graceHours,
            });
        });
        await scheduleService.createSchedule(ctx, {
            orderId: order.id,
            scenario: 'installment',
            deliveryGate: 'first_period',
            depositRule: { kind: 'down_payment' },
            agreementVersion: 'v1',
            items,
        });
        Logger.info(`Installment schedule created for order ${order.code} (plan ${plan.id})`, loggerCtx);
    } catch (e: any) {
        Logger.error(`createInstallmentSchedule failed for order ${order.code}: ${e.message}`, loggerCtx);
        throw e;
    }
}
```

> 注意：`createSchedule` 失败时向上抛（区别于 pre-sale 的吞错）——分期是主动选择，失败必须让用户感知。

- [x] **Step 2: Shop service 方法 + resolver**

`installment.service.ts` 追加导入与方法（`delete` 方法之后）：

```typescript
    /**
     * 结算页启用分期：校验归属/状态/无既有期次 → 生成期次实例。
     */
    async enableInstallment(ctx: RequestContext, orderId: ID, planId: ID): Promise<Order> {
        const orderService = ctx.injector.get(OrderService);
        const order = await orderService.findOne(ctx, orderId, ['customer', 'customer.user']);
        if (!order) {
            throw new UserInputError(`Order ${orderId} not found`);
        }
        if ((order as any)?.customer?.user?.id !== ctx.activeUserId) {
            throw new UserInputError('You can only enable installment on your own order');
        }
        if (order.state !== 'ArrangingPayment') {
            throw new UserInputError(`Order state ${order.state} does not allow enabling installment`);
        }
        const plan = await this.findOne(ctx, planId);
        if (!plan || !plan.enabled) {
            throw new UserInputError(`InstallmentPlan ${planId} not found or disabled`);
        }
        const hasLines = (order as any)?.lines?.some(
            (l: any) => String(l.productVariant?.id) === String(plan.variantId),
        );
        if (!hasLines) {
            throw new UserInputError('Order does not contain the installment variant');
        }
        await createInstallmentSchedule(ctx, ctx.injector, order, plan, this.defaultGraceHours);
        return (await orderService.findOne(ctx, orderId)) as Order;
    }
```

构造函数追加 `@Inject(INSTALLMENT_PLUGIN_OPTIONS) private options: InstallmentPluginOptions`，并加 getter：

```typescript
    private get defaultGraceHours(): number {
        return this.options.defaultGraceHours ?? 72;
    }
```

顶部导入补充：`Inject` from '@nestjs/common'、`Order`、`OrderService` from '@vendure/core'、`INSTALLMENT_PLUGIN_OPTIONS` from './constants'、`createInstallmentSchedule` from './installment-schedule-bridge'。

> `ctx.injector`：Vendure 3 RequestContext 自带 injector（同插件内跨服务、软依赖跨插件均可取），无需插件级注入。

`src\installment-shop.resolver.ts`（新建）：

```typescript
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, Order, RequestContext, Transaction } from '@vendure/core';

import { InstallmentPlan } from './installment-plan.entity';
import { InstallmentService } from './installment.service';

@Resolver()
export class InstallmentShopResolver {
    constructor(private installmentService: InstallmentService) {}

    @Query()
    installmentPlans(@Ctx() ctx: RequestContext, @Args('variantId') variantId: ID): Promise<InstallmentPlan[]> {
        return this.installmentService.findByVariant(ctx, variantId);
    }

    @Mutation()
    @Transaction()
    enableInstallment(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('planId') planId: ID,
    ): Promise<Order> {
        return this.installmentService.enableInstallment(ctx, orderId, planId);
    }
}
```

`plugin.ts` 的 `@VendurePlugin` 追加 shop schema（shopApiExtensions 属性）与 resolver：

```typescript
    shopApiExtensions: {
        schema: () => gql`
            type InstallmentPlan implements Node {
                id: ID!
                name: String!
                variantId: ID!
                downPaymentRatio: Int!
                periods: Int!
                intervalUnit: String!
                intervalCount: Int!
                allowCod: Boolean!
            }

            extend type Query {
                installmentPlans(variantId: ID!): [InstallmentPlan!]!
            }

            extend type Mutation {
                enableInstallment(orderId: ID!, planId: ID!): Order!
            }
        `,
        resolvers: [InstallmentShopResolver],
    },
```

`index.ts` 追加：

```typescript
export * from './src/installment-shop.resolver';
```

- [x] **Step 3: dev-config 注册**

`d:\zhao\vendure\packages\dev-server\dev-config.ts`：import 区追加 `InstallmentPlugin`（from '@vendure/installment-plugin'），plugins 数组 `PreSalePlugin.init({})`（约 522 行）之后追加：

```typescript
    InstallmentPlugin.init({}),
```

- [x] **Step 4: e2e（完整文件）**

先构建依赖：`@vendure/payment-schedule-plugin`、`@vendure/pre-sale-plugin`（若未构建）→ 在 `d:\zhao\vendure` 执行 `npm run build -w @vendure/payment-schedule-plugin && npm run build -w @vendure/pre-sale-plugin`（PowerShell 分两条执行）。

`e2e\installment.e2e-spec.ts`：

```typescript
import { createTestEnvironment, registerInitializer, SqljsInitializer } from '@vendure/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import gql from 'graphql-tag';
import { mergeConfig } from '@vendure/core';
import { initialData } from '../../../e2e-common/e2e-initial-data';
import { TEST_SETUP_TIMEOUT_MS, testConfig } from '../../../e2e-common/test-config';
import { InstallmentPlugin } from '../src/plugin';
import { PaymentSchedulePlugin } from '@vendure/payment-schedule-plugin';
import { singleStageRefundablePaymentMethod } from '../../core/e2e/fixtures/test-payment-methods';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

describe('InstallmentPlugin · 分期', () => {
    const config = mergeConfig(testConfig(), {
        plugins: [InstallmentPlugin.init({}), PaymentSchedulePlugin.init({})],
        paymentOptions: { paymentMethodHandlers: [singleStageRefundablePaymentMethod] },
    });
    const { server, adminClient, shopClient } = createTestEnvironment(config);

    const PAY_METHOD = singleStageRefundablePaymentMethod.code;
    const TOTAL = 129900; // Laptop 13" 原价

    let variantId: string;
    let seq = 0;

    function ts(offsetMinutes: number): string {
        return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
    }

    async function createPlan(input: {
        downPaymentRatio?: number;
        periods?: number;
        intervalUnit?: string;
        intervalCount?: number;
        allowCod?: boolean;
    }): Promise<string> {
        const res = (await adminClient.query(gql`
            mutation {
                createInstallmentPlan(input: {
                    name: "分期-${seq++}"
                    variantId: "${variantId}"
                    downPaymentRatio: ${input.downPaymentRatio ?? 20}
                    periods: ${input.periods ?? 3}
                    intervalUnit: ${input.intervalUnit ? `"${input.intervalUnit}"` : `"month"`}
                    intervalCount: ${input.intervalCount ?? 1}
                    allowCod: ${input.allowCod ?? false}
                }) { id downPaymentRatio periods }
            }
        `)) as any;
        return res.createInstallmentPlan.id as string;
    }

    async function freshOrder(): Promise<string> {
        const res = (await shopClient.query(gql`
            mutation { addItemToOrder(productVariantId: "${variantId}", quantity: 1) { ... on Order { id } } }
        `)) as any;
        return res.addItemToOrder.id as string;
    }

    async function scheduleOf(orderId: string): Promise<any> {
        const res = (await shopClient.query(gql`
            query {
                paymentSchedule(orderId: "${orderId}") {
                    scenario status depositRule totalAmount paidTotal
                    items { seq kind amount status allowCod trigger }
                }
            }
        `)) as any;
        return res.paymentSchedule;
    }

    async function orderState(id: string): Promise<any> {
        const res = (await adminClient.query(gql`
            query { order(id: "${id}") { state } }
        `)) as any;
        return res.order;
    }

    async function setChannelPricesIncludeTax(): Promise<void> {
        const channels = (await adminClient.query(gql`query { channels { items { id } } }`)) as any;
        const id = channels.channels.items[0].id;
        await adminClient.query(gql`
            mutation { updateChannel(input: { id: "${id}", pricesIncludeTax: true }) { ... on Channel { id } } }
        `);
    }

    beforeAll(async () => {
        await server.init({
            initialData: {
                ...initialData,
                paymentMethods: [{ name: PAY_METHOD, handler: { code: PAY_METHOD, arguments: [] } }],
            },
            productsCsvPath: path.join(__dirname, '../../core/e2e/fixtures/e2e-products-minimal.csv'),
            customerCount: 1,
        });
        await adminClient.asSuperAdmin();
        await setChannelPricesIncludeTax();
        const products = (await adminClient.query(gql`
            query { products(options: { take: 1 }) { items { variants { id } } } }
        `)) as any;
        variantId = products.products.items[0].variants[0].id;
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
    }, TEST_SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await server.destroy();
    });

    it('Admin CRUD：首付比/期数越界拒绝；合法创建成功', async () => {
        try {
            await adminClient.query(gql`
                mutation { createInstallmentPlan(input: { name: "x", variantId: "${variantId}", downPaymentRatio: 95 }) { id } }
            `);
            throw new Error('should have thrown');
        } catch (e: any) {
            expect(String(e?.response?.errors?.[0]?.message ?? e.message)).toContain('downPaymentRatio');
        }
        const id = await createPlan({ periods: 36 });
        expect(id).toBeDefined();
    });

    it('shop installmentPlans(variantId) 仅返回启用计划', async () => {
        const id = await createPlan({});
        const res = (await shopClient.query(gql`
            query { installmentPlans(variantId: "${variantId}") { id name periods } }
        `)) as any;
        expect(res.installmentPlans.map((p: any) => p.id)).toContain(id);
    });

    it('enableInstallment 生成期次：首付 + 3 期金额拆分正确', async () => {
        const planId = await createPlan({ downPaymentRatio: 20, periods: 3, intervalCount: 1 });
        const orderId = await freshOrder();
        await shopClient.query(gql`
            mutation { enableInstallment(orderId: "${orderId}", planId: "${planId}") { id state } }
        `);
        const sched = await scheduleOf(orderId);
        expect(sched.scenario).toBe('installment');
        expect(sched.depositRule.kind).toBe('down_payment');
        expect(sched.items).toHaveLength(4);
        expect(sched.items[0]).toMatchObject({ seq: 1, kind: 'down_payment', amount: 25980, status: 'payable' });
        // 余额 103920 平分 3 期，余数并入末期
        expect(sched.items[1].amount).toBe(34640);
        expect(sched.items[2].amount).toBe(34640);
        expect(sched.items[3].amount).toBe(34640);
        expect(sched.totalAmount).toBe(TOTAL);
    });

    it('付首付 → PartiallyPaid + 发货门控放行；未付首付门控拦截', async () => {
        const planId = await createPlan({ downPaymentRatio: 20, periods: 3, intervalCount: 0 });
        const orderId = await freshOrder();
        await shopClient.query(gql`
            mutation { enableInstallment(orderId: "${orderId}", planId: "${planId}") { id } }
        `);
        // 未付首付（仍在 ArrangingPayment）→ 门控拦截：默认状态机不允许 ArrangingPayment → Shipped
        const blocked = (await adminClient.query(gql`
            mutation { transitionOrderToState(id: "${orderId}", state: "Shipped") { ... on Order { id state } ... on ErrorResult { errorCode } } }
        `)) as any;
        expect(blocked.transitionOrderToState.errorCode).toBeTruthy();
        await shopClient.query(gql`
            mutation { paySchedulePeriod(orderId: "${orderId}", seq: 1, method: "${PAY_METHOD}") { id } }
        `);
        expect((await orderState(orderId)).state).toBe('PartiallyPaid');
        // first_period 门控：首付已付 → 可发货
        await adminClient.query(gql`
            mutation { transitionOrderToState(id: "${orderId}", state: "Shipped") { ... on Order { id state } ... on ErrorResult { errorCode } }
        `);
        // 订单已 Shipped，后续分期照付（intervalCount=0 → 扫描/补偿解锁）
        const sched = await scheduleOf(orderId);
        for (const item of sched.items.slice(1)) {
            await shopClient.query(gql`
                mutation { paySchedulePeriod(orderId: "${orderId}", seq: ${item.seq}, method: "${PAY_METHOD}") { id } }
            `);
        }
        expect((await orderState(orderId)).state).toBe('PaymentSettled');
    });
});
```

> 注：`paySchedulePeriod` 对 locked 期次在 `date/interval` 已到点时补偿解锁（Task 4），`intervalCount=0` 的期次 `dueAt=下单时刻`，故无需等待扫描。倒数第二段 transition 断言以返回无 ErrorResult 为准（如需强断言可改 `expect(res.transitionOrderToState.state).toBe('Shipped')`）。

- [x] **Step 5: 删缓存 + 跑 e2e + 构建 + Commit**

```powershell
Remove-Item -Recurse -Force e2e\__data__   # 若存在
npm run e2e                                # 预期 4 用例 PASS
npm run build
git add packages/installment-plugin packages/dev-server/dev-config.ts
git commit -m "feat(installment): Shop API（installmentPlans/enableInstallment）+ 期次生成 + e2e"
```

# 阶段 4：rental-plugin（租赁场景）

### Task 17: rental 包骨架 + RentalPlan 实体 + Admin CRUD

**Files:**
- Create: `d:\zhao\vendure\packages\rental-plugin\package.json`
- Create: `d:\zhao\vendure\packages\rental-plugin\tsconfig.json`
- Create: `d:\zhao\vendure\packages\rental-plugin\tsconfig.build.json`
- Create: `d:\zhao\vendure\packages\rental-plugin\vitest.config.mts`
- Create: `d:\zhao\vendure\packages\rental-plugin\index.ts`
- Create: `d:\zhao\vendure\packages\rental-plugin\src\constants.ts`
- Create: `d:\zhao\vendure\packages\rental-plugin\src\types.ts`
- Create: `d:\zhao\vendure\packages\rental-plugin\src\rental-plan.entity.ts`
- Create: `d:\zhao\vendure\packages\rental-plugin\src\rental.service.ts`
- Create: `d:\zhao\vendure\packages\rental-plugin\src\rental-admin.resolver.ts`
- Create: `d:\zhao\vendure\packages\rental-plugin\src\plugin.ts`

- [x] **Step 1: 四件套骨架**

`package.json`：

```json
{
    "name": "@vendure/rental-plugin",
    "version": "0.0.1",
    "license": "GPL-3.0-or-later",
    "main": "lib/index.js",
    "types": "lib/index.d.ts",
    "files": ["lib/**/*"],
    "scripts": {
        "watch": "tsc -p ./tsconfig.build.json --watch",
        "build": "rimraf lib && tsc -p ./tsconfig.build.json",
        "lint": "eslint --fix .",
        "test": "vitest --config vitest.config.mts --run src",
        "e2e": "cross-env PACKAGE=rental-plugin vitest --config vitest.config.mts --run"
    },
    "dependencies": {},
    "peerDependencies": {
        "@vendure/common": "^3.6.0",
        "@vendure/core": "^3.6.0"
    },
    "devDependencies": {
        "@vendure/core": "^3.6.0",
        "@vendure/testing": "^3.6.0",
        "rimraf": "^3.0.2",
        "typescript": "5.8.2",
        "vitest": "^3.2.4",
        "cross-env": "^7.0.3",
        "graphql-tag": "^2.12.6"
    }
}
```

`tsconfig.json` / `tsconfig.build.json` / `vitest.config.mts` / `index.ts` / `src\constants.ts`：与 Task 15 中 installment 样板逐字相同（相对路径按包位置原样保留），仅做替换：`@vendure/installment-plugin` → `@vendure/rental-plugin`。`index.ts` 此步先只导出：

```typescript
export * from './src/plugin';
export * from './src/rental-plan.entity';
export * from './src/rental.service';
export * from './src/types';
export * from './src/constants';
```

`src\constants.ts`：

```typescript
export const loggerCtx = 'RentalPlugin';
export const RENTAL_PLUGIN_OPTIONS = Symbol('RENTAL_PLUGIN_OPTIONS');
```

`src\types.ts`：

```typescript
export interface RentalPluginOptions {
    /** 期次默认宽限小时数（未在生成时指定时） */
    defaultGraceHours?: number;
}
```

- [x] **Step 2: RentalPlan 实体**

`src\rental-plan.entity.ts`：

```typescript
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { Channel, ChannelAware, DeepPartial, VendureEntity } from '@vendure/core';

export type RentUnit = 'day' | 'week' | 'month';
export type PrepaidOrPostpaid = 'prepaid' | 'postpaid';

/**
 * 租赁计划（variant 级配置）。
 * - depositAmount：押金（security_deposit 损失填补语义，不适用定金 20% 上限——设计 §3/§10）
 * - rentAmount / rentUnit：单位租金（分）
 * - prepaidOrPostpaid：prepaid = 租金下单时一次付清（rentAmount × periods）；postpaid = 按周期后付
 * - buyoutPrice：买断价快照基准（null = 未定价；实际买断款 = max(0, buyoutPrice - 已付租金)）
 * - 期次金额在 startRental 时按本计划快照生成，改配置不影响已生成订单
 */
@Entity()
export class RentalPlan extends VendureEntity implements ChannelAware {
    constructor(input?: DeepPartial<RentalPlan>) {
        super(input);
    }

    @Column('varchar')
    name: string;

    @Column({ type: 'int' })
    variantId: number;

    /** 押金（分，> 0） */
    @Column({ type: 'int' })
    depositAmount: number;

    /** 单位租金（分，> 0） */
    @Column({ type: 'int' })
    rentAmount: number;

    @Column('varchar', { default: 'month' })
    rentUnit: RentUnit;

    @Column('varchar', { default: 'prepaid' })
    prepaidOrPostpaid: PrepaidOrPostpaid;

    /** 买断价（分，null = 不可定价买断） */
    @Column({ type: 'int', nullable: true })
    buyoutPrice: number | null;

    @Column({ type: 'boolean', default: true })
    allowBuyout: boolean;

    /** postpaid 租金期是否允许 COD（COD 仅限租金期——设计 §8；调度层 COD_ALLOWED_KINDS 兜底） */
    @Column({ type: 'boolean', default: false })
    allowCod: boolean;

    @Column({ type: 'boolean', default: true })
    enabled: boolean;

    @ManyToMany(() => Channel)
    @JoinTable()
    channels: Channel[];
}
```

- [x] **Step 3: Service + Admin resolver + plugin 组装**

`src\rental.service.ts`：

```typescript
import { Injectable } from '@nestjs/common';
import {
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { RentalPlan } from './rental-plan.entity';

const RENT_UNITS: ReadonlyArray<string> = ['day', 'week', 'month'];
const PAYMENT_MODES: ReadonlyArray<string> = ['prepaid', 'postpaid'];

@Injectable()
export class RentalService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    private repo(ctx: RequestContext) {
        return this.connection.getRepository(ctx, RentalPlan);
    }

    async findAll(ctx: RequestContext, options?: ListQueryOptions<RentalPlan>): Promise<PaginatedList<RentalPlan>> {
        return this.listQueryBuilder
            .build(RentalPlan, options, { ctx, channelId: ctx.channelId, relations: ['channels'] })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    async findByVariant(ctx: RequestContext, variantId: ID): Promise<RentalPlan[]> {
        return this.repo(ctx)
            .createQueryBuilder('plan')
            .innerJoin('plan.channels', 'channel', 'channel.id = :cid', { cid: ctx.channelId })
            .where('plan.variantId = :vid', { vid: Number(variantId) })
            .andWhere('plan.enabled = :enabled', { enabled: true })
            .getMany();
    }

    async findOne(ctx: RequestContext, id: ID): Promise<RentalPlan | undefined> {
        return (await this.repo(ctx).findOne({ where: { id: id as any } })) ?? undefined;
    }

    async create(ctx: RequestContext, input: Partial<RentalPlan>): Promise<RentalPlan> {
        this.assertValid(input);
        const plan = new RentalPlan(input as any);
        plan.channels = [ctx.channel];
        return this.repo(ctx).save(plan);
    }

    async update(ctx: RequestContext, input: any): Promise<RentalPlan> {
        const plan = await this.repo(ctx).findOne({ where: { id: input.id } });
        if (!plan) {
            throw new UserInputError(`RentalPlan ${input.id} not found`);
        }
        const merged = { ...plan, ...input };
        this.assertValid(merged);
        Object.assign(plan, input);
        return this.repo(ctx).save(plan);
    }

    async delete(ctx: RequestContext, id: ID): Promise<void> {
        await this.repo(ctx).delete(id);
    }

    /** 参数硬校验（押金/租金必须为正；买断价可为 null 但不可为负） */
    private assertValid(plan: Partial<RentalPlan>): void {
        if (plan.depositAmount != null && plan.depositAmount <= 0) {
            throw new UserInputError('depositAmount must be > 0');
        }
        if (plan.rentAmount != null && plan.rentAmount <= 0) {
            throw new UserInputError('rentAmount must be > 0');
        }
        if (plan.rentUnit != null && !RENT_UNITS.includes(plan.rentUnit)) {
            throw new UserInputError('rentUnit must be day/week/month');
        }
        if (plan.prepaidOrPostpaid != null && !PAYMENT_MODES.includes(plan.prepaidOrPostpaid)) {
            throw new UserInputError('prepaidOrPostpaid must be prepaid/postpaid');
        }
        if (plan.buyoutPrice != null && plan.buyoutPrice < 0) {
            throw new UserInputError('buyoutPrice must be >= 0');
        }
    }
}
```

`src\rental-admin.resolver.ts`：

```typescript
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, ListQueryOptions, PaginatedList, RequestContext, Transaction } from '@vendure/core';

import { RentalPlan } from './rental-plan.entity';
import { RentalService } from './rental.service';

@Resolver()
export class RentalAdminResolver {
    constructor(private rentalService: RentalService) {}

    @Query()
    rentalPlans(
        @Ctx() ctx: RequestContext,
        @Args('options', { nullable: true }) options?: ListQueryOptions<RentalPlan>,
    ): Promise<PaginatedList<RentalPlan>> {
        return this.rentalService.findAll(ctx, options);
    }

    @Query()
    rentalPlan(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<RentalPlan | undefined> {
        return this.rentalService.findOne(ctx, id);
    }

    @Mutation()
    @Transaction()
    createRentalPlan(@Ctx() ctx: RequestContext, @Args('input') input: any): Promise<RentalPlan> {
        return this.rentalService.create(ctx, input);
    }

    @Mutation()
    @Transaction()
    updateRentalPlan(@Ctx() ctx: RequestContext, @Args('input') input: any): Promise<RentalPlan> {
        return this.rentalService.update(ctx, input);
    }

    @Mutation()
    @Transaction()
    async deleteRentalPlan(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<boolean> {
        await this.rentalService.delete(ctx, id);
        return true;
    }
}
```

`src\plugin.ts`：

```typescript
import { Type } from '@nestjs/common';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { RENTAL_PLUGIN_OPTIONS } from './constants';
import { RentalPlan } from './rental-plan.entity';
import { RentalAdminResolver } from './rental-admin.resolver';
import { RentalService } from './rental.service';
import { RentalPluginOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [RentalPlan],
    providers: [
        { provide: RENTAL_PLUGIN_OPTIONS, useFactory: () => RentalPlugin.options },
        RentalService,
    ],
    exports: [RentalService],
    adminApiExtensions: {
        schema: () => gql`
            type RentalPlan implements Node {
                id: ID!
                name: String!
                variantId: ID!
                depositAmount: Int!
                rentAmount: Int!
                rentUnit: String!
                prepaidOrPostpaid: String!
                buyoutPrice: Int
                allowBuyout: Boolean!
                allowCod: Boolean!
                enabled: Boolean!
                createdAt: DateTime!
                updatedAt: DateTime!
            }

            type RentalPlanList implements PaginatedList {
                items: [RentalPlan!]!
                totalItems: Int!
            }

            input CreateRentalPlanInput {
                name: String!
                variantId: ID!
                depositAmount: Int!
                rentAmount: Int!
                rentUnit: String
                prepaidOrPostpaid: String
                buyoutPrice: Int
                allowBuyout: Boolean
                allowCod: Boolean
                enabled: Boolean
            }

            input UpdateRentalPlanInput {
                id: ID!
                name: String
                depositAmount: Int
                rentAmount: Int
                rentUnit: String
                prepaidOrPostpaid: String
                buyoutPrice: Int
                allowBuyout: Boolean
                allowCod: Boolean
                enabled: Boolean
            }

            input RentalPlanListOptions

            extend type Query {
                rentalPlans(options: RentalPlanListOptions): RentalPlanList!
                rentalPlan(id: ID!): RentalPlan
            }

            extend type Mutation {
                createRentalPlan(input: CreateRentalPlanInput!): RentalPlan!
                updateRentalPlan(input: UpdateRentalPlanInput!): RentalPlan!
                deleteRentalPlan(id: ID!): Boolean!
            }
        `,
        resolvers: [RentalAdminResolver],
    },
    compatibility: '^3.0.0',
})
export class RentalPlugin {
    private static options: RentalPluginOptions = {};

    static init(options?: RentalPluginOptions): Type<RentalPlugin> {
        RentalPlugin.options = options ?? {};
        return RentalPlugin;
    }
}
```

- [x] **Step 4: 根目录链接 + 构建 + Commit**

在 `d:\zhao\vendure` 执行 `npm install`（workspaces 链接）。
在 `d:\zhao\vendure\packages\rental-plugin` 执行 `npm run build`（预期成功）。

```powershell
git add packages/rental-plugin
git commit -m "feat(rental): 租赁计划插件骨架（RentalPlan 实体 + Admin CRUD + 参数校验）"
```

---

### Task 18: rental Shop API（startRental/buyoutRental）+ 期次生成 + e2e

**Files:**
- Create: `d:\zhao\vendure\packages\rental-plugin\src\rental-schedule-bridge.ts`
- Create: `d:\zhao\vendure\packages\rental-plugin\src\rental-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\rental-plugin\src\rental.service.ts`（startRental / buyoutRental）
- Modify: `d:\zhao\vendure\packages\rental-plugin\src\plugin.ts`（shop schema）
- Modify: `d:\zhao\vendure\packages\rental-plugin\index.ts`
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`
- Test: `d:\zhao\vendure\packages\rental-plugin\e2e\rental.e2e-spec.ts`

- [x] **Step 1: 软依赖桥（期次生成）**

`src\rental-schedule-bridge.ts`：

```typescript
import { Injector, Logger, Order, RequestContext } from '@vendure/core';

import { loggerCtx } from './constants';
import { RentalPlan } from './rental-plan.entity';

/** 软依赖：未启用 payment-schedule-plugin → 返回 null（租赁退化为普通订单支付） */
export function tryGetScheduleService(injector: Injector): any | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PaymentScheduleService } = require('@vendure/payment-schedule-plugin');
        return injector.get(PaymentScheduleService, { strict: false }) ?? null;
    } catch {
        return null;
    }
}

/**
 * 结算页选择租赁（startRental）时生成期次实例：
 * - seq1 押金（deposit / security_deposit，date now → 立即可付；COD 不适用押金）
 * - prepaid：租金单项（rentAmount × periods，date now，与押金同时付）
 * - postpaid：租金 × periods（interval trigger，count = i，allowCod 按计划配置）
 * deliveryGate=deposit_paid（押金到账即可发货）；买断配置快照进 schedule.meta。
 * postpaid 各期 dueAt = 下单时间 + count × rentUnit（后付：先用电后付费，首期租金在租期 1 结束时到期；
 * 若届时货物尚未送达，COD 语义由运营侧保证——调度层只负责期次触发与 allowCod 放行）。
 */
export async function createRentalSchedule(
    ctx: RequestContext,
    injector: Injector,
    order: Order,
    plan: RentalPlan,
    periods: number,
    graceHours: number,
): Promise<void> {
    const scheduleService = tryGetScheduleService(injector);
    if (!scheduleService) return;
    if ((order.customFields as any)?.paymentScheduleId) return; // 幂等
    try {
        const now = new Date();
        const items: Record<string, unknown>[] = [
            {
                seq: 1,
                kind: 'deposit',
                amount: plan.depositAmount,
                trigger: { type: 'date', at: now.toISOString() },
                graceHours,
            },
        ];
        if (plan.prepaidOrPostpaid === 'prepaid') {
            items.push({
                seq: 2,
                kind: 'rent',
                amount: plan.rentAmount * periods,
                trigger: { type: 'date', at: now.toISOString() },
                graceHours,
            });
        } else {
            for (let i = 1; i <= periods; i++) {
                items.push({
                    seq: i + 1,
                    kind: 'rent',
                    amount: plan.rentAmount,
                    allowCod: plan.allowCod,
                    trigger: { type: 'interval', unit: plan.rentUnit, count: i, anchor: 'order_placed' },
                    graceHours,
                });
            }
        }
        await scheduleService.createSchedule(ctx, {
            orderId: order.id,
            scenario: 'rental',
            deliveryGate: 'deposit_paid',
            depositRule: { kind: 'security_deposit' },
            agreementVersion: 'v1',
            // 买断配置下单快照（改配置不影响已生成订单）
            meta: {
                rental: {
                    buyoutPrice: plan.buyoutPrice ?? null,
                    allowBuyout: plan.allowBuyout && plan.buyoutPrice != null,
                },
            },
            items,
        });
        Logger.info(`Rental schedule created for order ${order.code} (plan ${plan.id}, ${periods} period(s))`, loggerCtx);
    } catch (e: any) {
        Logger.error(`createRentalSchedule failed for order ${order.code}: ${e.message}`, loggerCtx);
        throw e;
    }
}
```

> 注意：与 installment 相同——`createSchedule` 失败时向上抛（租赁是主动选择，失败必须让用户感知）。计划金额与订单商品总价相互独立：`paySchedulePeriod` 按期次金额收款（`PaymentService.createPayment(ctx, order, item.amount, ...)`），不校验与订单总价的合计关系。

- [x] **Step 2: Shop service 方法 + resolver**

`rental.service.ts` 追加导入与方法（`delete` 方法之后）：

```typescript
    /**
     * 结算页选择租赁：校验归属/状态/含对应商品行 → 生成期次实例（押金 + 租金）。
     */
    async startRental(ctx: RequestContext, orderId: ID, planId: ID, periods: number): Promise<Order> {
        const orderService = ctx.injector.get(OrderService);
        const order = await orderService.findOne(ctx, orderId, ['customer', 'customer.user']);
        if (!order) {
            throw new UserInputError(`Order ${orderId} not found`);
        }
        if ((order as any)?.customer?.user?.id !== ctx.activeUserId) {
            throw new UserInputError('You can only start rental on your own order');
        }
        if (order.state !== 'ArrangingPayment') {
            throw new UserInputError(`Order state ${order.state} does not allow starting a rental`);
        }
        if (!Number.isInteger(periods) || periods < 1 || periods > 36) {
            throw new UserInputError('periods must be an integer between 1 and 36');
        }
        const plan = await this.findOne(ctx, planId);
        if (!plan || !plan.enabled) {
            throw new UserInputError(`RentalPlan ${planId} not found or disabled`);
        }
        const hasLines = (order as any)?.lines?.some(
            (l: any) => String(l.productVariant?.id) === String(plan.variantId),
        );
        if (!hasLines) {
            throw new UserInputError('Order does not contain the rental variant');
        }
        await createRentalSchedule(ctx, ctx.injector, order, plan, periods, this.defaultGraceHours);
        return (await orderService.findOne(ctx, orderId)) as Order;
    }

    /**
     * 租期付清后的所有权买断：按下单快照买断价扣除已付租金，追加 buyout 期次（payable，date now）。
     * 买断款随后经 paySchedulePeriod 支付——调度被 addScheduleItem 拉回 in_progress，
     * 订单处于 PaymentSettled 也可付（PAYABLE_SOURCE_STATES 含 PaymentSettled，见 Task 4）。
     */
    async buyoutRental(ctx: RequestContext, orderId: ID): Promise<{ scheduleId: number; seq: number; amount: number }> {
        const scheduleService = tryGetScheduleService(ctx.injector);
        if (!scheduleService) {
            throw new UserInputError('Payment schedule plugin is not available');
        }
        const order = await ctx.injector.get(OrderService).findOne(ctx, orderId, ['customer', 'customer.user']);
        if (!order) {
            throw new UserInputError(`Order ${orderId} not found`);
        }
        if ((order as any)?.customer?.user?.id !== ctx.activeUserId) {
            throw new UserInputError('You can only buy out your own rental');
        }
        const withItems = await scheduleService.getScheduleForOrder(ctx, orderId, { requireOwner: true });
        if (!withItems || withItems.schedule.scenario !== 'rental') {
            throw new UserInputError('Order has no rental schedule');
        }
        if (!['in_progress', 'completed'].includes(withItems.schedule.status)) {
            throw new UserInputError(`Schedule status ${withItems.schedule.status} does not allow buyout`);
        }
        const rental = ((withItems.schedule as any).meta ?? {}).rental;
        if (!rental?.allowBuyout || rental?.buyoutPrice == null) {
            throw new UserInputError('Buyout is not allowed for this rental');
        }
        const paidRent = withItems.items
            .filter((i: any) => i.kind === 'rent' && i.status === 'paid')
            .reduce((sum: number, i: any) => sum + i.amount, 0);
        const amount = Math.max(0, rental.buyoutPrice - paidRent);
        if (amount <= 0) {
            throw new UserInputError('Paid rent already covers the buyout price');
        }
        const added = await scheduleService.addScheduleItem(ctx, withItems.schedule.id, {
            kind: 'buyout',
            amount,
            trigger: { type: 'date', at: new Date().toISOString() },
        });
        const buyoutItem = added.items.find((i: any) => i.kind === 'buyout');
        return { scheduleId: withItems.schedule.id, seq: buyoutItem.seq, amount: buyoutItem.amount };
    }
```

构造函数追加 `@Inject(RENTAL_PLUGIN_OPTIONS) private options: RentalPluginOptions`，并加 getter：

```typescript
    private get defaultGraceHours(): number {
        return this.options.defaultGraceHours ?? 72;
    }
```

顶部导入补充：`Inject` from '@nestjs/common'、`Order`、`OrderService` from '@vendure/core'、`RENTAL_PLUGIN_OPTIONS` from './constants'、`createRentalSchedule` from './rental-schedule-bridge'。

`src\rental-shop.resolver.ts`（新建）：

```typescript
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, Order, RequestContext, Transaction } from '@vendure/core';

import { RentalPlan } from './rental-plan.entity';
import { RentalService } from './rental.service';

@Resolver()
export class RentalShopResolver {
    constructor(private rentalService: RentalService) {}

    @Query()
    rentalPlans(@Ctx() ctx: RequestContext, @Args('variantId') variantId: ID): Promise<RentalPlan[]> {
        return this.rentalService.findByVariant(ctx, variantId);
    }

    @Mutation()
    @Transaction()
    startRental(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('planId') planId: ID,
        @Args('periods', { nullable: true }) periods?: number,
    ): Promise<Order> {
        return this.rentalService.startRental(ctx, orderId, planId, periods ?? 1);
    }

    @Mutation()
    @Transaction()
    buyoutRental(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
    ): Promise<{ scheduleId: number; seq: number; amount: number }> {
        return this.rentalService.buyoutRental(ctx, orderId);
    }
}
```

`plugin.ts` 的 `@VendurePlugin` 追加 shop schema（shopApiExtensions 属性）与 resolver。返回类型用本地 `RentalBuyoutResult` 而非 `PaymentSchedule`——后者属于软依赖插件，未启用时 schema 会因未知类型而报错：

```typescript
    shopApiExtensions: {
        schema: () => gql`
            type RentalPlan implements Node {
                id: ID!
                name: String!
                variantId: ID!
                depositAmount: Int!
                rentAmount: Int!
                rentUnit: String!
                prepaidOrPostpaid: String!
                buyoutPrice: Int
                allowBuyout: Boolean!
                allowCod: Boolean!
            }

            type RentalBuyoutResult {
                scheduleId: ID!
                seq: Int!
                amount: Int!
            }

            extend type Query {
                rentalPlans(variantId: ID!): [RentalPlan!]!
            }

            extend type Mutation {
                startRental(orderId: ID!, planId: ID!, periods: Int): Order!
                buyoutRental(orderId: ID!): RentalBuyoutResult!
            }
        `,
        resolvers: [RentalShopResolver],
    },
```

`index.ts` 追加：

```typescript
export * from './src/rental-shop.resolver';
```

- [x] **Step 3: dev-config 注册**

`d:\zhao\vendure\packages\dev-server\dev-config.ts`：import 区追加 `RentalPlugin`（from '@vendure/rental-plugin'），plugins 数组 `InstallmentPlugin.init({})`（Task 16 Step 3 追加的行）之后追加：

```typescript
    RentalPlugin.init({}),
```

- [x] **Step 4: e2e（完整文件）**

先构建依赖：`@vendure/payment-schedule-plugin`（若 Task 16 后无实体/schema 变更则不必重建）→ 在 `d:\zhao\vendure` 执行 `npm run build -w @vendure/payment-schedule-plugin`。

`e2e\rental.e2e-spec.ts`：

```typescript
import { createTestEnvironment, registerInitializer, SqljsInitializer } from '@vendure/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import gql from 'graphql-tag';
import { mergeConfig } from '@vendure/core';
import { initialData } from '../../../e2e-common/e2e-initial-data';
import { TEST_SETUP_TIMEOUT_MS, testConfig } from '../../../e2e-common/test-config';
import { RentalPlugin } from '../src/plugin';
import { PaymentSchedulePlugin } from '@vendure/payment-schedule-plugin';
import { singleStageRefundablePaymentMethod } from '../../core/e2e/fixtures/test-payment-methods';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

describe('RentalPlugin · 租赁', () => {
    const config = mergeConfig(testConfig(), {
        plugins: [RentalPlugin.init({}), PaymentSchedulePlugin.init({})],
        paymentOptions: { paymentMethodHandlers: [singleStageRefundablePaymentMethod] },
    });
    const { server, adminClient, shopClient } = createTestEnvironment(config);

    const PAY_METHOD = singleStageRefundablePaymentMethod.code;
    const DEPOSIT = 50000; // 押金 ¥500（低于 Laptop 总价 129900，期次金额与订单总价相互独立）
    const RENT = 10000; // 月租金 ¥100

    let variantId: string;
    let seq = 0;

    async function createPlan(input: {
        depositAmount?: number;
        rentAmount?: number;
        rentUnit?: string;
        prepaidOrPostpaid?: string;
        buyoutPrice?: number | null;
        allowBuyout?: boolean;
        allowCod?: boolean;
    }): Promise<string> {
        // 可选字段用数组拼接注入（undefined 内插会产生字面量 "undefined" 破坏 GraphQL）
        const optional = [
            input.buyoutPrice === undefined ? '' : `buyoutPrice: ${input.buyoutPrice}`,
            input.allowBuyout === undefined ? '' : `allowBuyout: ${input.allowBuyout}`,
            input.allowCod === undefined ? '' : `allowCod: ${input.allowCod}`,
        ].filter(Boolean).join('\n                    ');
        const res = (await adminClient.query(gql`
            mutation {
                createRentalPlan(input: {
                    name: "租赁-${seq++}"
                    variantId: "${variantId}"
                    depositAmount: ${input.depositAmount ?? DEPOSIT}
                    rentAmount: ${input.rentAmount ?? RENT}
                    rentUnit: ${input.rentUnit ? `"${input.rentUnit}"` : `"month"`}
                    prepaidOrPostpaid: ${input.prepaidOrPostpaid ? `"${input.prepaidOrPostpaid}"` : `"prepaid"`}
                    ${optional}
                }) { id depositAmount rentAmount }
            }
        `)) as any;
        return res.createRentalPlan.id as string;
    }

    async function freshOrder(): Promise<string> {
        const res = (await shopClient.query(gql`
            mutation { addItemToOrder(productVariantId: "${variantId}", quantity: 1) { ... on Order { id } } }
        `)) as any;
        return res.addItemToOrder.id as string;
    }

    async function startRental(orderId: string, planId: string, periods = 1): Promise<void> {
        await shopClient.query(gql`
            mutation { startRental(orderId: "${orderId}", planId: "${planId}", periods: ${periods}) { id state } }
        `);
    }

    async function scheduleOf(orderId: string): Promise<any> {
        const res = (await shopClient.query(gql`
            query {
                paymentSchedule(orderId: "${orderId}") {
                    scenario status deliveryGate depositRule totalAmount paidTotal
                    items { seq kind amount status allowCod trigger }
                }
            }
        `)) as any;
        return res.paymentSchedule;
    }

    async function orderState(id: string): Promise<any> {
        const res = (await adminClient.query(gql`
            query { order(id: "${id}") { state } }
        `)) as any;
        return res.order;
    }

    async function transition(id: string, state: string): Promise<any> {
        return (await adminClient.query(gql`
            mutation { transitionOrderToState(id: "${id}", state: "${state}") { ... on Order { id state } ... on ErrorResult { errorCode } } }
        `)) as any;
    }

    async function setChannelPricesIncludeTax(): Promise<void> {
        const channels = (await adminClient.query(gql`query { channels { items { id } } }`)) as any;
        const id = channels.channels.items[0].id;
        await adminClient.query(gql`
            mutation { updateChannel(input: { id: "${id}", pricesIncludeTax: true }) { ... on Channel { id } } }
        `);
    }

    beforeAll(async () => {
        await server.init({
            initialData: {
                ...initialData,
                paymentMethods: [{ name: PAY_METHOD, handler: { code: PAY_METHOD, arguments: [] } }],
            },
            productsCsvPath: path.join(__dirname, '../../core/e2e/fixtures/e2e-products-minimal.csv'),
            customerCount: 1,
        });
        await adminClient.asSuperAdmin();
        await setChannelPricesIncludeTax();
        const products = (await adminClient.query(gql`
            query { products(options: { take: 1 }) { items { variants { id } } } }
        `)) as any;
        variantId = products.products.items[0].variants[0].id;
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
    }, TEST_SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await server.destroy();
    });

    it('Admin CRUD：押金非正拒绝；合法创建成功', async () => {
        try {
            await adminClient.query(gql`
                mutation { createRentalPlan(input: { name: "x", variantId: "${variantId}", depositAmount: 0, rentAmount: 100 }) { id } }
            `);
            throw new Error('should have thrown');
        } catch (e: any) {
            expect(String(e?.response?.errors?.[0]?.message ?? e.message)).toContain('depositAmount');
        }
        const id = await createPlan({});
        expect(id).toBeDefined();
    });

    it('shop rentalPlans(variantId) 仅返回启用计划', async () => {
        const id = await createPlan({});
        const res = (await shopClient.query(gql`
            query { rentalPlans(variantId: "${variantId}") { id name prepaidOrPostpaid } }
        `)) as any;
        expect(res.rentalPlans.map((p: any) => p.id)).toContain(id);
    });

    it('prepaid 全流程：押金+租金期次 → 付押金 PartiallyPaid → 发货门控 deposit_paid 放行 → 付租金 → PaymentSettled', async () => {
        const planId = await createPlan({ buyoutPrice: 80000 });
        const orderId = await freshOrder();
        await startRental(orderId, planId, 3);
        const sched = await scheduleOf(orderId);
        expect(sched.scenario).toBe('rental');
        expect(sched.depositRule.kind).toBe('security_deposit');
        expect(sched.deliveryGate).toBe('deposit_paid');
        expect(sched.items).toHaveLength(2);
        expect(sched.items[0]).toMatchObject({ seq: 1, kind: 'deposit', amount: DEPOSIT, status: 'payable' });
        expect(sched.items[1]).toMatchObject({ seq: 2, kind: 'rent', amount: RENT * 3, status: 'locked' });
        expect(sched.totalAmount).toBe(DEPOSIT + RENT * 3);

        // 付押金 → PartiallyPaid（首期立即可付；租金期 date now → 支付时刻补偿解锁）
        await shopClient.query(gql`
            mutation { paySchedulePeriod(orderId: "${orderId}", seq: 1, method: "${PAY_METHOD}") { id } }
        `);
        expect((await orderState(orderId)).state).toBe('PartiallyPaid');
        // deposit_paid 门控放行
        const shipped = await transition(orderId, 'Shipped');
        expect(shipped.transitionOrderToState.state).toBe('Shipped');

        // 付清租金 → 全部期次 paid → PaymentSettled（Shipped → PaymentSettled，Task 5 状态机补转移）
        await shopClient.query(gql`
            mutation { paySchedulePeriod(orderId: "${orderId}", seq: 2, method: "${PAY_METHOD}") { id } }
        `);
        expect((await orderState(orderId)).state).toBe('PaymentSettled');
    });

    it('buyout：租金付清后 buyoutRental 追加买断期次（扣减已付租金）→ 支付 → 调度 completed', async () => {
        // 沿用上一用例的订单（押金+租金已付清，PaymentSettled）
        const orderId = (await adminClient.query(gql`
            query { orders(options: { sort: { createdAt: "DESC" }, take: 1 }) { items { id } } }
        `)) as any;
        const id = orderId.orders.items[0].id;
        const buyout = (await shopClient.query(gql`
            mutation { buyoutRental(orderId: "${id}") { scheduleId seq amount } }
        `)) as any;
        // 买断价 80000 - 已付租金 30000 = 50000
        expect(buyout.buyoutRental.amount).toBe(50000);
        await shopClient.query(gql`
            mutation { paySchedulePeriod(orderId: "${id}", seq: ${buyout.buyoutRental.seq}, method: "${PAY_METHOD}") { id } }
        `);
        const sched = await scheduleOf(id);
        expect(sched.status).toBe('completed');
        expect(sched.items).toHaveLength(3);
        expect(sched.items[2]).toMatchObject({ kind: 'buyout', amount: 50000, status: 'paid' });
        expect((await orderState(id)).state).toBe('PaymentSettled');
    });

    it('postpaid 期次结构：押金 + 3 期租金（interval trigger + allowCod）；不可买断时 buyoutRental 拒绝', async () => {
        const planId = await createPlan({ prepaidOrPostpaid: 'postpaid', allowCod: true, allowBuyout: false, buyoutPrice: null });
        const orderId = await freshOrder();
        await startRental(orderId, planId, 3);
        const sched = await scheduleOf(orderId);
        expect(sched.items).toHaveLength(4);
        expect(sched.items[0]).toMatchObject({ seq: 1, kind: 'deposit', amount: DEPOSIT, status: 'payable' });
        for (let i = 1; i <= 3; i++) {
            expect(sched.items[i]).toMatchObject({ kind: 'rent', amount: RENT, status: 'locked', allowCod: true });
            expect(sched.items[i].trigger).toMatchObject({ type: 'interval', unit: 'month', count: i });
        }
        // 未生成订单未付押金即尝试买断 → 拒绝（allowBuyout=false 快照）
        try {
            await shopClient.query(gql`
                mutation { buyoutRental(orderId: "${orderId}") { scheduleId seq amount } }
            `);
            throw new Error('should have thrown');
        } catch (e: any) {
            expect(String(e?.response?.errors?.[0]?.message ?? e.message)).toContain('Buyout');
        }
    });

    it('还物退押：admin releaseRentalDeposit → 押金期次 refunded', async () => {
        const planId = await createPlan({});
        const orderId = await freshOrder();
        await startRental(orderId, planId, 1);
        await shopClient.query(gql`
            mutation { paySchedulePeriod(orderId: "${orderId}", seq: 1, method: "${PAY_METHOD}") { id } }
        `);
        const released = (await adminClient.query(gql`
            mutation { releaseRentalDeposit(orderId: "${orderId}") { status items { seq kind status } } }
        `)) as any;
        expect(released.releaseRentalDeposit.items[0]).toMatchObject({ kind: 'deposit', status: 'refunded' });
    });
});
```

> 排查对照：
> - `buyoutRental` 报 `Payment schedule plugin is not available` → payment-schedule-plugin 未注册或未构建（lib 包名 require 失败）。
> - 买断支付报 `Order state PaymentSettled does not allow period payment` → Task 4 常量 `PAYABLE_SOURCE_STATES` 未含 `PaymentSettled`（见 Task 4 修正）。
> - 付租金报 `Shipped → PaymentSettled` 转移错误 → Task 5 状态机缺 `Shipped: { to: ['PaymentSettled'] }`（见 Task 5 修正）。

- [x] **Step 5: 删缓存 + 跑 e2e + 构建 + Commit**

```powershell
Remove-Item -Recurse -Force e2e\__data__   # 若存在
npm run e2e                                # 预期 6 用例 PASS
npm run build
git add packages/rental-plugin packages/dev-server/dev-config.ts
git commit -m "feat(rental): Shop API（rentalPlans/startRental/buyoutRental）+ 期次生成 + 买断 + e2e"
```

# 阶段 5：nshop C 端（弹窗 + 计划条 + 页面接入 + 手册）

C 端只消费 payment-schedule-plugin 的 Shop API（Task 9）：`paymentSchedule` / `paySchedulePeriod` / `cancelSchedule`。约定：

- 金额字段均为**分**，展示层除以 100；
- `trigger` / `depositRule` / `meta` 为 schema `JSON` 标量，按 `types/payment-schedule.ts` 镜像类型断言消费；
- Gql 函数由 nuxt-graphql-client codegen 生成；codegen 的 schema 来自本地 `graphql.schema.json`（layers/base/nuxt.config.ts 配置 `clients.default.schema`），该文件经 `scripts/update-schema.cjs` 从 dev-server 内省刷新，且**已 gitignore 不入库**——新增后端字段后必须先刷新它再 codegen。

### Task 19: gql 文档 + 镜像类型 + usePaymentSchedule

**Files:**
- Create: `d:\zhao\nshop\layers\base\gql\fragments\payment-schedule.gql`
- Create: `d:\zhao\nshop\layers\base\gql\queries\payment-schedule.gql`
- Create: `d:\zhao\nshop\types\payment-schedule.ts`
- Create: `d:\zhao\nshop\layers\base\app\composables\usePaymentSchedule.ts`

- [x] **Step 1: fragment + query/mutation 文档**（字段与 Task 9 Shop schema 逐字对应）

`gql\fragments\payment-schedule.gql`：

```graphql
fragment ScheduleItemFields on PaymentScheduleItem {
  id
  seq
  kind
  amount
  paidAmount
  allowCod
  status
  dueAt
  graceHours
  trigger
  paidAt
  lateFeeAccrued
}

fragment PaymentScheduleFields on PaymentSchedule {
  id
  orderId
  scenario
  status
  breachType
  depositRule
  deliveryGate
  agreementVersion
  meta
  totalAmount
  paidTotal
  items {
    ...ScheduleItemFields
  }
}
```

`gql\queries\payment-schedule.gql`：

```graphql
query GetPaymentSchedule($orderId: ID!) {
  paymentSchedule(orderId: $orderId) {
    ...PaymentScheduleFields
  }
}

mutation PaySchedulePeriod($orderId: ID!, $seq: Int!, $method: String!) {
  paySchedulePeriod(orderId: $orderId, seq: $seq, method: $method) {
    ...PaymentScheduleFields
  }
}

mutation CancelSchedule($orderId: ID!, $confirmForfeit: Boolean) {
  cancelSchedule(orderId: $orderId, confirmForfeit: $confirmForfeit) {
    ...PaymentScheduleFields
  }
}
```

> 注：`GqlGetPaymentSchedule` / `GqlPaySchedulePeriod` / `GqlCancelSchedule` 由 codegen 全局注入（无需 import，用法与 `useAfterSales` 中的 Gql 函数一致）。

- [x] **Step 2: 刷新 schema + codegen**

```powershell
# 启动本地 vendure dev-server（Task 9 已注册全部插件；若已在运行则跳过）
cd d:\zhao\vendure\packages\dev-server
npm run dev

# 另开终端：从 dev-server 拉最新 schema（含 paymentSchedule 类型），端口以 dev-server 输出为准
cd d:\zhao\nshop
$env:GQL_HOST = "http://localhost:30XX/shop-api"
node scripts/update-schema.cjs     # 内省覆写 graphql.schema.json（gitignored）
npm run postinstall                # nuxt prepare → codegen 生成三个 Gql 函数
```

dev server 若正在运行需重启一次；若 Gql 函数未生成，跑一次 `npm run dev` 或 `npm run build` 触发模块 codegen。

- [x] **Step 3: 镜像 TS 类型**

`types\payment-schedule.ts`（与 `types/order.ts` 同级，经 `~~/types/...` 别名引用；日期一律 string）：

```typescript
export type ScheduleScenario = "presale" | "installment" | "rental";
export type ScheduleStatus = "pending" | "in_progress" | "completed" | "breached" | "cancelled";
export type ScheduleBreachType = "buyer_timeout" | "seller_breach" | "group_buy_failed";
export type ScheduleItemStatus = "locked" | "payable" | "paid" | "overdue" | "forfeited" | "refunded" | "waived";
export type ScheduleItemKind = "deposit" | "balance" | "down_payment" | "installment" | "rent" | "buyout";

export type ScheduleTrigger =
  | { type: "date"; at: string }
  | { type: "interval"; unit: "day" | "week" | "month"; count: number; anchor: string }
  | { type: "group_buy"; groupBuyActivityId: string }
  | { type: "manual" };

/** depositRule（下单快照，JSON 标量） */
export interface ScheduleDepositRule {
  kind: "legal_deposit" | "earnest" | "down_payment" | "security_deposit";
  capRatio?: number;
  earnestRefundPolicy?: { onTimeout: "full" | "partial"; partialRate?: number };
  [key: string]: any;
}

/** meta（下单快照：rental 买断/可买断、installment/pre-sale 扩展，JSON 标量） */
export interface ScheduleMeta {
  rental?: { buyoutPrice: number | null; allowBuyout: boolean };
  installment?: Record<string, any>;
  presale?: Record<string, any>;
  [key: string]: any;
}

export interface PaymentScheduleItem {
  id: string;
  seq: number;
  kind: ScheduleItemKind;
  /** 分 */
  amount: number;
  paidAmount: number;
  allowCod: boolean;
  status: ScheduleItemStatus;
  dueAt: string | null;
  graceHours: number;
  trigger: ScheduleTrigger | null;
  paidAt: string | null;
  lateFeeAccrued: number;
}

export interface PaymentSchedule {
  id: string;
  orderId: string;
  scenario: ScheduleScenario;
  status: ScheduleStatus;
  breachType: ScheduleBreachType | null;
  depositRule: ScheduleDepositRule | null;
  deliveryGate: "all_paid" | "first_period" | "deposit_paid";
  agreementVersion: string;
  meta: ScheduleMeta | null;
  items: PaymentScheduleItem[];
  /** 分 */
  paidTotal: number;
  /** 分 */
  totalAmount: number;
}
```

- [x] **Step 4: usePaymentSchedule composable**

`layers\base\app\composables\usePaymentSchedule.ts`（错误取 `gqlErrors[0].message`，与 `useAfterSales` 一致）：

```typescript
import type { PaymentSchedule } from "~~/types/payment-schedule";

/**
 * 支付计划（期次调度）C 端状态与操作。
 * - fetchSchedule：拉取订单期次（无计划返回 null，订单详情页据此隐藏 ScheduleBar）
 * - payPeriod：支付指定期次；method = Vendure PaymentMethod code
 *   （在线默认 cloud-payment-template、COD 用 cod-payment-template，调用方可覆盖）
 * - cancel：买家主动取消；confirmForfeit=true 表示确认定金不退（legal_deposit 必须确认）。
 *   C 端暂无独立取消入口（订单取消走既有 cancelOrder，后端经 OrderStateTransitionEvent
 *   联动调度，见 Task 9），此方法保留供后续接入
 */
export function usePaymentSchedule() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const schedule = ref<PaymentSchedule | null>(null);

  async function fetchSchedule(orderId: string): Promise<PaymentSchedule | null> {
    loading.value = true;
    error.value = null;
    try {
      const res = await GqlGetPaymentSchedule({ orderId });
      schedule.value = (res?.paymentSchedule as PaymentSchedule | null) ?? null;
      return schedule.value;
    } catch (e: any) {
      error.value = e?.gqlErrors?.[0]?.message ?? e?.message ?? "fetch payment schedule failed";
      schedule.value = null;
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function payPeriod(orderId: string, seq: number, method = "cloud-payment-template"): Promise<PaymentSchedule | null> {
    loading.value = true;
    error.value = null;
    try {
      const res = await GqlPaySchedulePeriod({ orderId, seq, method });
      schedule.value = (res?.paySchedulePeriod as PaymentSchedule) ?? null;
      return schedule.value;
    } catch (e: any) {
      error.value = e?.gqlErrors?.[0]?.message ?? e?.message ?? "pay period failed";
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function cancel(orderId: string, confirmForfeit = false): Promise<PaymentSchedule | null> {
    loading.value = true;
    error.value = null;
    try {
      const res = await GqlCancelSchedule({ orderId, confirmForfeit: confirmForfeit || undefined });
      schedule.value = (res?.cancelSchedule as PaymentSchedule) ?? null;
      return schedule.value;
    } catch (e: any) {
      error.value = e?.gqlErrors?.[0]?.message ?? e?.message ?? "cancel schedule failed";
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, schedule, fetchSchedule, payPeriod, cancel };
}
```

- [x] **Step 5: 构建 + Commit**

```powershell
cd d:\zhao\nshop
npm run typecheck
git add layers/base/gql/fragments/payment-schedule.gql layers/base/gql/queries/payment-schedule.gql types/payment-schedule.ts layers/base/app/composables/usePaymentSchedule.ts
git commit -m "feat(schedule): 支付计划 gql/镜像类型/usePaymentSchedule"
```

### Task 20: ScheduleDialog（版式 A 弹窗）+ ScheduleBar（计划条）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\schedule\ScheduleDialog.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\schedule\ScheduleBar.vue`

版式 A 边界（设计 §9）：

- **弹窗仅用于首笔款**（押金/定金/订金/首付性质期次）：罚则明示 + 协议勾选后支付；其余期次（尾款/租金/分期/买断）在 ScheduleBar 直接支付，不重复弹窗。
- 组件注册名：`components/schedule/ScheduleDialog.vue` → `<ScheduleDialog>`、`ScheduleBar.vue` → `<ScheduleBar>`（Nuxt 目录前缀去重）。**模板必须用完整注册名**，否则 SSR 渲染空注释导致 hydration mismatch（与 product-detail 组件同坑）。本任务完成后在 `.nuxt/components.d.ts` 核对实际注册名，以生成结果为准。
- Nuxt UI v4 的 UModal 用 `v-model:open`（与既有 `AfterSalesCreateModal` 一致）。

- [x] **Step 1: ScheduleDialog.vue**

```vue
<script setup lang="ts">
import type { PaymentSchedule, PaymentScheduleItem } from "~~/types/payment-schedule";

/**
 * 付首笔款弹窗（版式 A：结构化规则清单式，设计 §9）。
 * 仅用于首笔款期次（押金/定金/订金/首付）：罚则明示 + 协议勾选（agreementVersion 展示）后调 payPeriod。
 * props:
 * - orderId：订单 id
 * - seq：待支付期次 seq（不传则自动取首个 payable）
 * emit: paid(schedule) 支付成功
 */
const props = defineProps<{ orderId: string; seq?: number }>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ (e: "paid", schedule: PaymentSchedule): void }>();

const { t } = useI18n();
const toast = useToast();
const { loading, error, schedule, fetchSchedule, payPeriod } = usePaymentSchedule();

const agreed = ref(false);
const paying = ref(false);

const item = computed<PaymentScheduleItem | null>(() => {
  if (!schedule.value) return null;
  if (props.seq) return schedule.value.items.find(i => i.seq === props.seq) ?? null;
  return schedule.value.items.find(i => i.status === "payable") ?? null;
});

/** 性质徽章文案（depositRule.kind → i18n；无规则按尾款兜底） */
const badge = computed(() => {
  switch (schedule.value?.depositRule?.kind) {
    case "legal_deposit": return t("messages.schedule.badgeLegalDeposit");
    case "earnest": return t("messages.schedule.badgeEarnest");
    case "down_payment": return t("messages.schedule.badgeDownPayment");
    case "security_deposit": return t("messages.schedule.badgeSecurityDeposit");
    default: return t("messages.schedule.badgeBalance");
  }
});

/** 结构化规则（3-4 条，按 depositRule.kind 切换；团购触发追加全额退条款） */
const rules = computed<string[]>(() => {
  const s = schedule.value;
  if (!s) return [];
  const list: string[] = [t("messages.schedule.ruleWindow", { hours: item.value?.graceHours ?? 0 })];
  switch (s.depositRule?.kind) {
    case "legal_deposit":
      list.push(t("messages.schedule.ruleLegalDeposit"));
      break;
    case "earnest": {
      const p = s.depositRule?.earnestRefundPolicy;
      list.push(
        p?.onTimeout === "partial" && p.partialRate
          ? t("messages.schedule.ruleEarnestPartial", { rate: Math.round(p.partialRate * 100) })
          : t("messages.schedule.ruleEarnestFull"),
      );
      break;
    }
    case "security_deposit":
      list.push(t("messages.schedule.ruleDeposit"));
      break;
    default:
      list.push(t("messages.schedule.ruleDownPayment"));
  }
  if (s.items.some(i => i.trigger?.type === "group_buy")) {
    list.push(t("messages.schedule.ruleGroupBuy"));
  }
  return list;
});

watch(open, async v => {
  if (v) {
    agreed.value = false;
    await fetchSchedule(props.orderId);
  }
});

async function onPay() {
  if (!item.value) return;
  paying.value = true;
  const updated = await payPeriod(props.orderId, item.value.seq, "cloud-payment-template");
  paying.value = false;
  if (updated) {
    toast.add({ title: t("messages.schedule.paidSuccess"), color: "success" });
    emit("paid", updated);
    open.value = false;
  }
}

function yuan(amount: number) {
  return (amount / 100).toFixed(2);
}
</script>

<template>
  <UModal v-model:open="open">
    <UCard>
      <div v-if="!schedule || !item" class="py-8 text-center text-sm text-neutral-400">
        {{ t("messages.schedule.loading") }}
      </div>
      <template v-else>
        <div class="text-center">
          <UBadge :color="schedule.depositRule?.kind === 'legal_deposit' ? 'error' : 'primary'" variant="soft">
            {{ badge }}
          </UBadge>
          <p class="mt-3 text-3xl font-semibold">¥{{ yuan(item.amount) }}</p>
          <p class="mt-1 text-xs text-neutral-500">
            {{ t("messages.schedule.periodLabel", { seq: item.seq, total: schedule.items.length }) }}
          </p>
        </div>

        <ul class="mt-5 space-y-2 rounded-lg bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-600">
          <li v-for="(r, idx) in rules" :key="idx" class="flex gap-2">
            <UIcon name="i-lucide-info" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{{ r }}</span>
          </li>
        </ul>

        <p class="mt-3 text-xs text-neutral-500">
          {{ t("messages.schedule.agreementTitle", { version: schedule.agreementVersion }) }}
        </p>
        <UCheckbox v-model="agreed" :label="t('messages.schedule.agreeCheckbox')" class="mt-2" />

        <p v-if="error" class="mt-2 text-xs text-red-500">{{ error }}</p>

        <UButton
          class="mt-4 w-full justify-center"
          :disabled="!agreed || paying || loading"
          :loading="paying"
          :label="t('messages.schedule.payNow')"
          @click="onPay"
        />
      </template>
    </UCard>
  </UModal>
</template>
```

- [x] **Step 2: ScheduleBar.vue**

```vue
<script setup lang="ts">
import type { PaymentSchedule, PaymentScheduleItem } from "~~/types/payment-schedule";

/**
 * 支付计划条（通用组件，设计 §9）：预订/分期/租赁复用，期次行动态展开。
 * - locked：显示触发条件（日期 / 周期到期 / 成团 / 手动开启）
 * - payable：「在线支付」；首笔款期次 emit pay（页面打开 ScheduleDialog 明示罚则），
 *   其余期次直接 payPeriod；allowCod 期次附「货到付款」
 * - overdue / forfeited / breached：违约提示按场景展示法律后果
 * props:
 * - orderId：订单 id
 * - schedule：外部已取到的计划（页面传入则不再自取；外部刷新后本组件自动跟随）
 * - payMethod：在线支付 PaymentMethod code（默认 cloud-payment-template，
 *   按租户接入的支付模板经 props 覆盖；对接收银台组件后替换为实际选择逻辑）
 */
const props = withDefaults(
  defineProps<{ orderId: string; schedule?: PaymentSchedule | null; payMethod?: string }>(),
  { schedule: null, payMethod: "cloud-payment-template" },
);
const emit = defineEmits<{ (e: "pay", item: PaymentScheduleItem): void; (e: "refresh"): void }>();

const { t } = useI18n();
const toast = useToast();
const { loading, error, schedule: localSchedule, fetchSchedule: localFetch, payPeriod } = usePaymentSchedule();

const expanded = ref(false);
const sched = computed<PaymentSchedule | null>(() => props.schedule ?? localSchedule.value);

onMounted(() => {
  if (!props.schedule) localFetch(props.orderId);
});

const topItems = computed(() => (sched.value?.items ?? []).slice(0, 2));
const restItems = computed(() => (sched.value?.items ?? []).slice(2));

/** 是否首笔款期次（押金/首付性质）——需弹窗明示罚则 */
function isFirstPayment(i: PaymentScheduleItem) {
  return i.seq === 1 && ["deposit", "down_payment"].includes(i.kind);
}

const breachNotice = computed(() => {
  switch (sched.value?.breachType) {
    case "buyer_timeout": return t("messages.schedule.breachBuyerTimeout");
    case "seller_breach": return t("messages.schedule.breachSellerBreach");
    case "group_buy_failed": return t("messages.schedule.breachGroupBuyFailed");
    default: return "";
  }
});

function kindLabel(i: PaymentScheduleItem) {
  const map: Record<string, string> = {
    deposit: "messages.schedule.kindDeposit",
    balance: "messages.schedule.kindBalance",
    down_payment: "messages.schedule.kindDownPayment",
    installment: "messages.schedule.kindInstallment",
    rent: "messages.schedule.kindRent",
    buyout: "messages.schedule.kindBuyout",
  };
  return t(map[i.kind] ?? "messages.schedule.kindBalance");
}

function statusLabel(i: PaymentScheduleItem) {
  return t(`messages.schedule.status.${i.status}`);
}

function triggerLabel(i: PaymentScheduleItem): string {
  const tr = i.trigger;
  if (!tr) return "";
  switch (tr.type) {
    case "date": return t("messages.schedule.triggerDate", { date: fmtDate(tr.at) });
    case "interval":
      return t("messages.schedule.triggerInterval", { unit: t(`messages.schedule.unit.${tr.unit}`), date: i.dueAt ? fmtDate(i.dueAt) : "-" });
    case "group_buy": return t("messages.schedule.triggerGroupBuy");
    case "manual": return t("messages.schedule.triggerManual");
    default: return "";
  }
}

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yuan(amount: number) {
  return (amount / 100).toFixed(2);
}

function onPayClick(i: PaymentScheduleItem) {
  if (isFirstPayment(i)) {
    emit("pay", i); // 页面打开 ScheduleDialog（seq）
  } else {
    pay(i, props.payMethod);
  }
}

async function pay(i: PaymentScheduleItem, method: string) {
  const updated = await payPeriod(props.orderId, i.seq, method);
  if (updated) {
    toast.add({ title: t("messages.schedule.paidSuccess"), color: "success" });
    emit("refresh"); // 页面刷新计划与订单状态（props.schedule 更新后本组件跟随）
  }
}
</script>

<template>
  <section v-if="sched" class="my-4 rounded-xl border border-neutral-200 bg-white p-4">
    <header class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold">{{ t("messages.schedule.title") }}</h2>
      <UBadge v-if="breachNotice" color="error" variant="soft">{{ breachNotice }}</UBadge>
    </header>

    <ul class="mt-1 divide-y divide-neutral-100">
      <li v-for="i in (expanded ? sched.items : topItems)" :key="i.id" class="flex items-center gap-3 py-3">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-sm">
            <span class="font-medium">{{ kindLabel(i) }}</span>
            <UBadge
              size="xs"
              variant="subtle"
              :color="i.status === 'paid' ? 'success' : i.status === 'overdue' || i.status === 'forfeited' ? 'error' : i.status === 'payable' ? 'warning' : 'neutral'"
            >
              {{ statusLabel(i) }}
            </UBadge>
          </p>
          <p class="mt-0.5 text-xs text-neutral-500">
            ¥{{ yuan(i.amount) }}
            <template v-if="i.status === 'locked'"> · {{ triggerLabel(i) }}</template>
            <template v-else-if="i.status === 'payable' && i.dueAt"> · {{ t("messages.schedule.dueAt", { date: fmtDate(i.dueAt) }) }}</template>
          </p>
          <p v-if="i.status === 'overdue' && i.lateFeeAccrued > 0" class="mt-0.5 text-xs text-red-500">
            {{ t("messages.schedule.overdueNotice", { fee: yuan(i.lateFeeAccrued) }) }}
          </p>
          <p v-if="i.status === 'forfeited'" class="mt-0.5 text-xs text-red-500">{{ t("messages.schedule.forfeitNotice") }}</p>
          <p v-if="i.status === 'refunded'" class="mt-0.5 text-xs text-neutral-500">{{ t("messages.schedule.refundNotice") }}</p>
        </div>

        <div v-if="i.status === 'payable'" class="flex shrink-0 gap-2">
          <UButton size="xs" :loading="loading" :label="t('messages.schedule.payOnline')" @click="onPayClick(i)" />
          <UButton v-if="i.allowCod" size="xs" variant="soft" :label="t('messages.schedule.payCod')" @click="pay(i, 'cod-payment-template')" />
        </div>
      </li>
    </ul>

    <p v-if="error" class="mt-1 text-xs text-red-500">{{ error }}</p>

    <UButton v-if="restItems.length" variant="ghost" size="xs" class="mt-1 w-full justify-center" @click="expanded = !expanded">
      {{ expanded ? t("messages.schedule.expandLess") : t("messages.schedule.expandMore", { count: restItems.length }) }}
    </UButton>
  </section>
</template>
```

- [x] **Step 3: 构建 + Commit**

```powershell
cd d:\zhao\nshop
npm run typecheck
git add layers/base/app/components/schedule/ScheduleDialog.vue layers/base/app/components/schedule/ScheduleBar.vue
git commit -m "feat(schedule): 付首笔款弹窗（版式A）+ 支付计划条 ScheduleBar"
```

### Task 21: 状态映射 + i18n 词条 + 订单详情页接入

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\utils\order-state.ts`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts`
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\orders\[code].vue`

i18n 机制（重要）：zh-CN 是兜底语言——其余 10 语言包经 `merge.ts` 的 deepMerge 以 zhMessages 为基底，**缺失词条自动回退中文**。故只需补 zh-CN（全量）与 en-US（英文翻译），其余语言包无需逐包补。

- [x] **Step 1: order-state.ts**

两处修改：

```typescript
// 1) PAYMENT_PENDING 集合加入两个状态（待付后续期次的订单归入待支付 tab）
const PAYMENT_PENDING = new Set([
  "AddingItems",
  "ArrangingPayment",
  "Deposited",      // 预售定金已付（PartiallyPaid 别名，老订单兼容）
  "PartiallyPaid",  // 支付计划进行中（预订尾款 / 分期 / 租赁）
]);

// 2) stateBadge 在 "PaymentAuthorized" case 之前插入：
    case "Deposited":
    case "PartiallyPaid":
      return { labelKey: "messages.order.statePartiallyPaid", color: "info" };
```

`progressIndex` 无需改：两状态不在任何集合中，默认返回 0（进度条停在「支付」步，正确）。

- [x] **Step 2: zh-CN.ts 词条**

`order` 节点 `stateProcessing` 后加一行；`zhMessages` 顶层（与 `order` 平级）新增 `schedule` 节点：

```typescript
// order 节点内：
      statePartiallyPaid: "部分付款",

// zhMessages 顶层新增 schedule 节点：
  schedule: {
    loading: "加载中…",
    title: "支付计划",
    periodLabel: "第 {seq} 期 / 共 {total} 期",
    payNow: "立即支付",
    payOnline: "在线支付",
    payCod: "货到付款",
    dueAt: "应付 {date}",
    agreementTitle: "《预售/支付协议》版本 {version}",
    agreeCheckbox: "我已阅读并同意上述规则与协议",
    badgeLegalDeposit: "法律定金 · 有罚则",
    badgeEarnest: "订金 · 可退",
    badgeDownPayment: "首付",
    badgeSecurityDeposit: "押金",
    badgeBalance: "尾款",
    ruleWindow: "请在应付时间（含宽限期 {hours} 小时）内完成支付，逾期将标记逾期并按约定处理。",
    ruleLegalDeposit: "定金担保：买方违约无权要求返还定金；卖方违约双倍返还定金（《民法典》第586-588条）。",
    ruleEarnestFull: "订金可退：买方超时未付，订金全额原路退还。",
    ruleEarnestPartial: "订金可退：买方超时未付，订金扣除 {rate}% 手续费后原路退还。",
    ruleDownPayment: "首付为货款一部分，无担保罚则；后续分期按约定周期支付。",
    ruleDeposit: "押金担保租赁履约：逾期还物计收滞纳金，损坏可依约扣押金；归还验收后退还。",
    ruleGroupBuy: "若团购未能成团，已付款项将全额原路退还。",
    kindDeposit: "定金/押金",
    kindBalance: "尾款",
    kindDownPayment: "首付",
    kindInstallment: "分期",
    kindRent: "租金",
    kindBuyout: "买断",
    triggerDate: "{date} 开启支付",
    triggerInterval: "每{unit} 1 期（到期日 {date}）",
    triggerGroupBuy: "成团后开启支付",
    triggerManual: "待商家开启",
    unit: { day: "日", week: "周", month: "月" },
    status: { locked: "未开启", payable: "待支付", paid: "已支付", overdue: "已逾期", forfeited: "已没收", refunded: "已退款", waived: "已免除" },
    breachBuyerTimeout: "存在逾期未付期次，订单已按约定处理",
    breachSellerBreach: "商家未按承诺发货，正在处理赔付",
    breachGroupBuyFailed: "团购未成团，已付款项将全额退还",
    overdueNotice: "该期次已逾期，滞纳金 ¥{fee}（按天计）",
    forfeitNotice: "该期次已按约定没收",
    refundNotice: "该期次已退款",
    expandMore: "展开全部 {count} 期",
    expandLess: "收起",
    paidSuccess: "支付成功",
  },
```

- [x] **Step 3: en-US.ts 词条**

en-US.ts 结构为 `defineI18nLocale(() => zhFallbackLocale({ ... }))`（以 zh 为基底 deepMerge），在其对象内 `order` 节点加 `statePartiallyPaid: "Partially paid"`，顶层加 `schedule` 节点：

```typescript
  schedule: {
    loading: "Loading…",
    title: "Payment plan",
    periodLabel: "Period {seq} of {total}",
    payNow: "Pay now",
    payOnline: "Pay online",
    payCod: "Cash on delivery",
    dueAt: "Due {date}",
    agreementTitle: "Pre-sale/Payment Agreement v{version}",
    agreeCheckbox: "I have read and agree to the rules and the agreement",
    badgeLegalDeposit: "Legal deposit · Forfeitable",
    badgeEarnest: "Earnest money · Refundable",
    badgeDownPayment: "Down payment",
    badgeSecurityDeposit: "Security deposit",
    badgeBalance: "Balance",
    ruleWindow: "Pay within the due window (including a {hours}-hour grace period); overdue periods are marked and handled per the agreement.",
    ruleLegalDeposit: "Legal deposit: if the buyer defaults, the deposit is not refundable; if the seller breaches, double the deposit is returned (Civil Code §§586-588).",
    ruleEarnestFull: "Earnest money is refundable: on buyer timeout it is refunded in full via the original payment method.",
    ruleEarnestPartial: "Earnest money is refundable: on buyer timeout a {rate}% handling fee is deducted before refund.",
    ruleDownPayment: "The down payment is part of the price with no penalty clause; remaining installments follow the agreed schedule.",
    ruleDeposit: "The security deposit covers the rental: late returns accrue late fees, damage may be deducted; refunded after return acceptance.",
    ruleGroupBuy: "If the group buy fails, all paid amounts are refunded in full via the original payment method.",
    kindDeposit: "Deposit",
    kindBalance: "Balance",
    kindDownPayment: "Down payment",
    kindInstallment: "Installment",
    kindRent: "Rent",
    kindBuyout: "Buyout",
    triggerDate: "Opens on {date}",
    triggerInterval: "1 period every {unit} (due {date})",
    triggerGroupBuy: "Opens when the group is complete",
    triggerManual: "Awaiting seller activation",
    unit: { day: "day", week: "week", month: "month" },
    status: { locked: "Locked", payable: "Due", paid: "Paid", overdue: "Overdue", forfeited: "Forfeited", refunded: "Refunded", waived: "Waived" },
    breachBuyerTimeout: "Some periods are overdue and handled per the agreement",
    breachSellerBreach: "The seller missed the shipping promise; compensation is being processed",
    breachGroupBuyFailed: "The group buy failed; paid amounts will be refunded in full",
    overdueNotice: "This period is overdue; late fee ¥{fee} (per day)",
    forfeitNotice: "This period has been forfeited per the agreement",
    refundNotice: "This period has been refunded",
    expandMore: "Show all {count} periods",
    expandLess: "Collapse",
    paidSuccess: "Payment successful",
  },
```

- [x] **Step 4: 订单详情页接入**

`layers\base\app\pages\account\orders\[code].vue`，script setup 追加：

```typescript
import type { PaymentScheduleItem } from "~~/types/payment-schedule";

// --- 支付计划（ScheduleBar / 首笔款弹窗）---
const { schedule, fetchSchedule } = usePaymentSchedule();
const scheduleDialogOpen = ref(false);
const scheduleSeq = ref<number | undefined>(undefined);

function openScheduleDialog(item: PaymentScheduleItem) {
  scheduleSeq.value = item.seq;
  scheduleDialogOpen.value = true;
}

/** 弹窗支付成功 / 计划条直付成功 → 刷新计划与订单状态 */
async function onScheduleChanged() {
  if (order.value) await fetchSchedule(order.value.id);
  await refresh();
}

onMounted(async () => {
  if (!order.value) return;
  const s = await fetchSchedule(order.value.id);
  if (!s) return;
  // 首个 payable 的首笔款期次自动弹一次弹窗（按 orderId 防重，会话内只提醒一次）
  const key = `scheduleDialogShown:${order.value.id}`;
  const first = s.items.find(i => i.status === "payable" && i.seq === 1);
  if (first && !sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    scheduleSeq.value = first.seq;
    scheduleDialogOpen.value = true;
  }
});
```

template 在 `<OrderDetailRenderer>` 之后、`<AfterSalesCreateModal>` 之前插入：

```vue
    <ScheduleBar :order-id="order.id" :schedule="schedule" @pay="openScheduleDialog" @refresh="onScheduleChanged" />

    <ScheduleDialog v-model:open="scheduleDialogOpen" :order-id="order.id" :seq="scheduleSeq" @paid="onScheduleChanged" />
```

- [x] **Step 5: 构建 + Commit**

```powershell
cd d:\zhao\nshop
npm run build
git add layers/base/app/utils/order-state.ts layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts "layers/base/app/pages/account/orders/[code].vue"
git commit -m "feat(schedule): 订单详情接入支付计划条与首笔款弹窗，i18n 词条（zh/en）"
```

### Task 22: 手机视口截图 + 操作手册

**Files:**
- Create: `d:\zhao\docs\manual\payment-schedule\index.md`
- Create: `d:\zhao\docs\manual\payment-schedule\images\*.png`（手机截图）

- [x] **Step 1: 准备三场景数据**

vendure dev-server（Task 9 已注册全部插件）+ nshop dev（`npm run dev`，GQL_HOST / CHANNEL_TOKEN 指向本地）。准备三笔顾客订单：

1. 预售订单：legal_deposit 定金预售活动 → 下单 → 已付定金（Deposited，尾款期锁定）
2. 分期订单：InstallmentPlan（首付 20% + 3 期）→ 下单 → 首期 payable
3. 租赁订单：RentalPlan（押金 + prepaid 租金）→ 下单 → 押金 payable

- [x] **Step 2: Playwright 手机视口截图（390×844，dpr=2）**

脚本要点（临时脚本，参照 `nshop/scripts/_shot_*.py` 既有模式，截图后即删）：

- `browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })`
- 登录顾客 → `/account/orders/<code>`：订单详情含 ScheduleBar → `order-schedule-bar.png`
- 分期订单：计划条展开全部期次 → `schedule-bar-installment.png`
- 租赁订单：押金+租金期次 → `schedule-bar-rental.png`
- 分期订单点击首期「在线支付」→ ScheduleDialog（徽章/规则/协议勾选/主按钮）→ `schedule-dialog.png`
- 截图存 `d:\zhao\docs\manual\payment-schedule\images\`

> 截图空白优先检查组件注册名（应为 `<ScheduleBar>` / `<ScheduleDialog>`，SSR 渲染空注释即注册名不对）。

- [x] **Step 3: 操作手册**

`docs\manual\payment-schedule\index.md` 结构（Admin 示例字段名与 Task 11/15/17/18/8 的 schema 逐字对应）：

```markdown
# 支付计划（预订 / 分期 / 租赁）操作手册

## 1. 功能说明
三场景（预订/分期/租赁）、期次模型、发货门控（all_paid / first_period / deposit_paid）、
COD 范围（仅尾款/租金期）、违约矩阵摘要（引设计文档 §7）。

## 2. Admin 配置（GraphQL 调用示例）
### 2.1 预售活动新字段
createPreSaleActivity / updatePreSaleActivity 新增：depositKind(legal_deposit|earnest)、
tailTriggerType(date|group_buy|manual)、tailWindowHours、graceHours、earnestRefundPolicy、shipDeadline。
（depositAmount > 总价 20% 时保存被拒——合规硬校验）

### 2.2 分期计划
mutation { createInstallmentPlan(input: { name: "…", variantId: 1, downPaymentRatio: 20,
periods: 3, intervalUnit: "month", intervalCount: 1, allowCod: false }) { id } }

### 2.3 租赁计划
mutation { createRentalPlan(input: { name: "…", variantId: 1, depositAmount: 50000,
rentAmount: 10000, rentUnit: "month", prepaidOrPostpaid: "postpaid",
allowBuyout: true, buyoutPrice: 80000, allowCod: true }) { id } }

### 2.4 调度管理
- query { paymentSchedules(options: {...}) { items { id orderId scenario status paidTotal totalAmount } } }
- mutation { openTailWindow(scheduleId: "…") { id } }      # 手动开启尾款窗口
- mutation { confirmSellerBreach(scheduleId: "…") { id } }  # 确认卖家违约（执行双倍返还）
- mutation { confirmCodReceived(orderId: "…") { id } }      # COD 签收收款确认
- mutation { releaseRentalDeposit(orderId: "…") { id } }    # 租赁还物退押

## 3. C 端交互
（嵌入 images/ 下手机截图；首笔款弹窗规则与协议勾选、计划条期次状态与触发条件、逾期/违约提示）

## 4. 测试用例清单
四包 e2e 用例列表（payment-schedule / pre-sale / installment / rental），标注覆盖点：
date/interval/group_buy/manual 触发、COD 环、定金没收、订金退款、团购失败退款、
卖家违约双倍返还、买断扣减已付租金、还物退押、发货门控、PartiallyPaid 状态机。
```

- [x] **Step 4: 主仓提交**

```powershell
cd d:\zhao
git add docs/manual/payment-schedule
git commit -m "docs(payment-schedule): 操作手册（功能/Admin API/C端截图/测试清单）"
```

# 阶段 6：全量回归与收尾

### Task 23: 四包 e2e 回归 + 构建核验 + 文档收尾 + 三仓提交部署

- [x] **Step 1: 四包 e2e 回归**（PowerShell 逐条执行；统一先删缓存避免 sqljs 旧库干扰）

```powershell
cd d:\zhao\vendure\packages\payment-schedule-plugin
Remove-Item -Recurse -Force e2e\__data__
npm run e2e
cd ..\pre-sale-plugin
Remove-Item -Recurse -Force e2e\__data__
npm run e2e
cd ..\installment-plugin
Remove-Item -Recurse -Force e2e\__data__
npm run e2e
cd ..\rental-plugin
Remove-Item -Recurse -Force e2e\__data__
npm run e2e
```

- [x] **Step 2: group-buy 构建核验**（events 导出无回归）

```powershell
cd d:\zhao\vendure\packages\group-buy-plugin
npm run build
```

- [x] **Step 3: nshop 构建核验**

```powershell
cd d:\zhao\nshop
npm run build
```

- [x] **Step 4: 计划文档勾选 + 三清单自检**

- 本文件所有 `- [ ]` → `- [x]`（执行过程逐任务已勾的核对一遍）。
- 手册四要素核对：功能说明 / Admin API 示例 / C 端手机截图 / 测试用例清单。
- 三清单：
  1. **spec 覆盖**：设计文档 §4-12 逐节可回溯——§4 插件划分→Task 1-18；§5 数据模型→Task 3/11/15/17；§6 状态机与调度→Task 4/5/6；§7 违约矩阵→Task 4/14；§8 API→Task 7/8/16/18 与 C 端 Task 19；§9 C 端与后台→Task 8/15/17/20/21；§10 合规硬点→Task 11 硬校验、Task 20 弹窗明示+协议版本、Task 12/16/18 下单快照；§11 边界未越界（feeRule 仅登记、止付人工、租赁扣损手动退押）；§12 测试→Task 14/16/18/22/23。
  2. **占位符扫描**：对本计划文档 grep `TODO|FIXME|placeholder|待补|略` 应无结果。
  3. **类型/签名一致性**：Task 2 `splitInstallmentAmounts` ↔ Task 16 require 引用；Task 13 `unlockTailForOrder` 签名 ↔ bridge `payTailViaSchedule`；Task 4 `paySchedulePeriod`/`getScheduleForOrder` ↔ Task 18/21 消费端；`meta` 链路 Task 3→4→9→18；Task 19 gql fragment 字段 ↔ Task 9 Shop schema 逐字一致。

- [x] **Step 5: 三仓提交、推送与部署**

- vendure 仓：回归若产生修复，单独 `fix(...)` 提交后 `git push`；后端部署按既有流程（服务器 `git pull` + `pm2 restart`，**本地构建铁律：服务器不构建**）。
- nshop 仓：Task 19-21 各任务已提交；若有修复补提交后 `git push`，随后部署：`npm run deploy`（scripts/deploy.mjs，本地构建产物 scp 上服务器）。
- 主仓（d:\zhao）：提交本文件勾选（commit message 按 0.2 无 BOM 方式写临时文件后 `git commit -F`）：

```powershell
cd d:\zhao
git add docs/superpowers/plans/2026-10-08-payment-schedule.md
```

message：`docs(payment-schedule): 实施计划全部完成勾选`

**验收标准（本计划完成的定义）：**

1. 四包 e2e 全 PASS（payment-schedule / pre-sale 兼容 / installment / rental）
2. 构建通过（vendure 四包 + group-buy + nshop）
3. 手机截图 4-5 张入库手册，手册四要素齐
4. 三仓工作区干净、已推送、已部署
5. 设计文档 §10 合规硬点逐条落实（20% 硬校验 / 弹窗明示+协议版本 / 订金扣除明示 / 双倍返还 / COD 签收收款）





