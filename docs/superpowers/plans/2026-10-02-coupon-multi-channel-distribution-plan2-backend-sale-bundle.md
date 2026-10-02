# 优惠券多渠道分发 · 计划 2（后端：出售链路 / 券包 / 加价购 / 退款回收）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `coupon-plugin` 内落地 `SALE` 渠道的两种出售形态（独立券商城微信/余额支付 + 商品页加价购）、出售型券包、以及「未使用可退 / 已使用不可退」的退款回收，并补齐后台券包 / 选品 / 成交流水 GraphQL。

**Architecture:** 新增纯函数模块 `coupon-sale.ts`（退款判定、券包展开、目录过滤，无 IO 可单测）；新增三个实体 `CouponSaleOrder` / `CouponBundle` / `CouponBundleItem` 并以幂等迁移补表；新增 `CouponSaleService` 承载全部出售/支付/结算/退款编排，券的最终生成统一走 `CouponService.issueForSale()`（复用既有 `atomicIncrementClaimed` + `createUserCoupon` 不变量）；微信支付镜像 `recharge-card-plugin` 的 `RC-` 范式（`CS-` 前缀 + `WechatpaySettlementRegistry` + 原子 `UPDATE ... WHERE status='PENDING'`），余额能力经 `coupon-balance-port.ts` 端口**可选依赖** `recharge-card-plugin`。

**Tech Stack:** TypeScript、TypeORM、NestJS、Vendure v2 插件体系、**vitest**（该包不使用 jest）、PostgreSQL（生产）/ SQLite（本地开发）、微信支付（`@vendure/wechatpay-plugin`）、余额（`@vendure/recharge-card-plugin`）

**仓库位置：** 本计划所有路径相对 `d:\zhao\vendure`（该目录是独立 git 仓库）。所有 `git` 命令的 cwd 均为 `d:\zhao\vendure`。测试命令 cwd 为 `d:\zhao\vendure\packages\coupon-plugin`。

**前置：** 计划 1（渠道显式化与场景隔离）已完成并提交。`coupon-channel.ts` 已导出 `parseDistributionChannels` / `resolveCouponChannels` / `hasChannel` / `matchesScene` / `filterTemplatesByChannelAndScene`；`CouponTemplate` 已有 `distributionChannels` / `salePrice` 列。

---

## 已拍板决策（本次开工前的 §16 核实结论）

| 编号 | 结论 |
| --- | --- |
| §16-1 余额支付 | **做**。经 `coupon-balance-port.ts` 端口可选注入 `recharge-card-plugin` 的 `RechargeCardService`（`getBalance` / `deductBalance` / `addBalance` 均为 public）。未注册该插件时余额入口报「余额支付不可用」，其余功能不受影响。 |
| §16-2 微信退款 | **不支持裸单退款**（已核实 `wechatpay-plugin/src/wechatpay.service.ts` 的 `createBarePayment` 无退款对应方法；`wechatpay-handler.ts` 的 `createRefund` 依赖 Vendure `Payment` 实体）。故退款一律走**余额补偿**：回收券 + 单据置 `REFUNDED` + `addBalance` 入客户余额。 |
| §16-3 amount 单位 | **分**。已核实 `RechargeOrder.amount` 为 `int` 且注释「分」，Vendure money 子单位一致。 |
| §16-4 加价购券价 | **不参与满减/促销**。`OrderService.addSurchargeToOrder` 往 `order.surcharges` 加 `Surcharge`（`listPrice`），Vendure 促销只作用于 order lines，故 surcharge 全额计入 `order.totalWithTax` 但不被打折。 |
| §16-5 过期券退款 | **视为未使用，可退**。判定口径：出售单生成的券中**没有任何一张状态为 `USED`** 即可退。 |
| §16-6 到店券呈现 | 券商城**按场景分组展示**（线上可用 / 到店可用），不做独立场景切换入口；后端 `couponSaleCatalogue(scene)` 预留 `scene` 入参。 |

## 相对设计文档的实现取舍（偏离点，需在提交信息中注明）

1. **`CouponSaleOrder` 增加 `surchargeId` 列**（设计 §5.3 未列）：加价购摘除时需要精确定位挂在主订单上的 `Surcharge`（`removeSurchargeFromOrder` 需要 surchargeId），靠 description 匹配不可靠。
2. **支付方式枚举扩为三值**：`CouponSalePayMode = 'WECHAT' | 'BALANCE' | 'ORDER_SURCHARGE'`（设计 §5.5 只有两值，因 §16-1 决策新增 `BALANCE`）。
3. **`CouponBundle` / `CouponSaleOrder` 用 `@ManyToOne(Channel) + channelId` 而非 `ManyToMany(Channel)`**：直接镜像已跑通的 `RechargeOrder` 实体范式，避免 ManyToMany 中间表的迁移手工建表风险；券包/出售单均属单一渠道。
4. **路径 B（加价购）退款随主订单**：`refundCouponSaleOrder` 对 `ORDER_SURCHARGE` 单据**拒绝**并提示「请对主订单发起退款」；主订单整单退款/取消时由事件订阅自动回收券并置 `REFUNDED`（不重复做余额补偿，钱随主订单退回）。
5. **`CouponIssuedBy` 增加 `'SALE'`**：出售渠道生成的券需可溯源（`CustomerCoupon.issuedBy`）。

---

## 文件结构

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `packages/coupon-plugin/package.json` | 增加 `@vendure/wechatpay-plugin`、`@vendure/recharge-card-plugin` 依赖 | 修改 |
| `packages/recharge-card-plugin/index.ts` | 导出 `RechargeCardService`（当前未导出，coupon-plugin 无法拿到类令牌） | 修改 |
| `packages/coupon-plugin/src/types.ts` | 新增 `CouponSaleStatus` / `CouponSalePayMode`，`CouponIssuedBy` 增 `'SALE'` | 修改 |
| `packages/coupon-plugin/src/localize.ts` | 导出 `localizedTextColumn` 供券包实体复用 | 修改 |
| `packages/coupon-plugin/src/coupon-template.entity.ts` | 改为从 `localize.ts` 导入 `localizedTextColumn`（去重） | 修改 |
| `packages/coupon-plugin/src/coupon-balance-port.ts` | 余额能力端口（可选注入），无 IO | 新建 |
| `packages/coupon-plugin/src/coupon-sale.ts` | 纯函数：退款判定 / 券包展开 / 出售目录过滤 | 新建 |
| `packages/coupon-plugin/src/coupon-sale.spec.ts` | 上述纯函数单测 | 新建 |
| `packages/coupon-plugin/src/coupon-sale-order.entity.ts` | 出售单实体 | 新建 |
| `packages/coupon-plugin/src/coupon-bundle.entity.ts` | `CouponBundle` + `CouponBundleItem` 实体 | 新建 |
| `packages/coupon-plugin/src/customer-coupon.entity.ts` | 新增 `saleOrderId` 列（溯源） | 修改 |
| `packages/coupon-plugin/src/migrations/create-coupon-sale.ts` | 幂等建表 + 补列 | 新建 |
| `packages/coupon-plugin/src/migrations/index.ts` | 导出新迁移 | 修改 |
| `packages/coupon-plugin/src/coupon.service.ts` | 新增 `issueForSale`；`createUserCoupon` 支持 `saleOrderId`/`SALE`；`grantCouponIssue` 补 `GRANT` 渠道校验；新增 `listInStoreCoupons`（接手计划 1 缺口） | 修改 |
| `packages/coupon-plugin/src/coupon-sale.service.ts` | 出售单 / 券包 / 支付 / 结算 / 退款编排 | 新建 |
| `packages/coupon-plugin/src/coupon-sale-shop.resolver.ts` | shop-api 出售 / 加价购 / 券商城 / 我的出售单 | 新建 |
| `packages/coupon-plugin/src/coupon-sale-admin.resolver.ts` | admin-api 券包 / 出售单流水 / 退款 | 新建 |
| `packages/coupon-plugin/src/coupon-binding-admin.resolver.ts` | 券侧批量选品（读写既有 `ProductCouponBinding`） | 修改 |
| `packages/coupon-plugin/src/plugin.ts` | entities / providers / SDL / resolvers / bootstrap（`CS-` 结算注册 + 余额端口 + 加价购事件） | 修改 |

---

### Task 1: 依赖接线与类型基础

**Files:**
- Modify: `packages/coupon-plugin/package.json`
- Modify: `packages/recharge-card-plugin/index.ts`
- Modify: `packages/coupon-plugin/src/types.ts`
- Create: `packages/coupon-plugin/src/coupon-balance-port.ts`

- [x] **Step 1: 给 coupon-plugin 增加两个可选依赖**

修改 `packages/coupon-plugin/package.json`，在 `peerDependencies` 之前插入 `dependencies`（镜像 `recharge-card-plugin` 对 wechatpay 的声明方式）：

```json
    "dependencies": {
        "@vendure/recharge-card-plugin": "^0.0.1",
        "@vendure/wechatpay-plugin": "^0.0.1"
    },
```

- [x] **Step 2: 导出 RechargeCardService**

修改 `packages/recharge-card-plugin/index.ts`，在 `export * from './src/balance-transaction.entity';` 之后追加一行：

```ts
export * from './src/recharge-card.service';
```

- [x] **Step 3: 安装工作区依赖并确认可解析**

Run（cwd `d:\zhao\vendure`）:
```
yarn install
```
Expected: 成功；`d:\zhao\vendure\node_modules\@vendure\recharge-card-plugin` 与 `...\@vendure\wechatpay-plugin` 为指向 `packages/*` 的链接。随后确认可解析：

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
node -e "console.log(require.resolve('@vendure/recharge-card-plugin'))"
```
Expected: 打印 `.../packages/recharge-card-plugin/lib/index.js`（若报错，需先在 `d:\zhao\vendure` 执行 `yarn build:packages` 或 `cd packages/recharge-card-plugin && npx tsc -p ./tsconfig.build.json` 产出 `lib/`）。

- [x] **Step 4: types.ts 增加出售相关类型**

在 `packages/coupon-plugin/src/types.ts` 的 `CouponIssuedBy` 行改为：

```ts
/** 发券来源（SALE = 出售渠道生成，计划 2 新增） */
export type CouponIssuedBy = 'CENTRE' | 'ADMIN' | 'EXCHANGE' | 'SALE';
```

并在文件末尾（`CouponChannel` 之后）追加：

```ts
/**
 * 出售单支付方式：
 * - WECHAT            ：券商城独立微信支付（outTradeNo 前缀 CS-）
 * - BALANCE           ：券商城余额支付（可选依赖 recharge-card 余额服务）
 * - ORDER_SURCHARGE   ：商品页加价购，券价随主订单结算
 */
export type CouponSalePayMode = 'WECHAT' | 'BALANCE' | 'ORDER_SURCHARGE';

/** 出售单状态 */
export type CouponSaleStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED';

/** 券包内单项入参 */
export interface CouponBundleItemInput {
    templateId: number;
    quantity?: number | null;
}
```

- [x] **Step 5: 新建余额端口**

创建 `packages/coupon-plugin/src/coupon-balance-port.ts`：

```ts
import { RequestContext } from '@vendure/core';

/**
 * 余额能力端口：由 `recharge-card-plugin` 在启动时通过 setCouponBalancePort 可选注册。
 * coupon-plugin 不直接依赖其内部实现，未注册时余额相关入口一律报「余额支付不可用」。
 */
export interface CouponBalancePort {
    getBalance(ctx: RequestContext, customerId: number): Promise<number>;
    /** 扣减余额（不足时抛 UserInputError） */
    deductBalance(ctx: RequestContext, customerId: number, amount: number): Promise<number>;
    /** 增加余额（退款补偿用） */
    addBalance(ctx: RequestContext, customerId: number, amount: number): Promise<number>;
}

let port: CouponBalancePort | null = null;

export function setCouponBalancePort(p: CouponBalancePort | null): void {
    port = p;
}

export function getCouponBalancePort(): CouponBalancePort | null {
    return port;
}
```

- [x] **Step 6: 类型检查**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx tsc --noEmit -p tsconfig.json
```
Expected: EXIT 0（若 `@vendure/recharge-card-plugin` 未构建则先按 Step 3 构建）。

- [x] **Step 7: Commit**

```
git add packages/coupon-plugin/package.json packages/recharge-card-plugin/index.ts packages/coupon-plugin/src/types.ts packages/coupon-plugin/src/coupon-balance-port.ts
git commit -m "feat(coupon): add sale types, balance port and cross-plugin deps"
```

---

### Task 2: 实体与幂等迁移

**Files:**
- Create: `packages/coupon-plugin/src/coupon-sale-order.entity.ts`
- Create: `packages/coupon-plugin/src/coupon-bundle.entity.ts`
- Modify: `packages/coupon-plugin/src/customer-coupon.entity.ts`
- Modify: `packages/coupon-plugin/src/localize.ts:12-16`
- Modify: `packages/coupon-plugin/src/coupon-template.entity.ts:12-16`
- Create: `packages/coupon-plugin/src/migrations/create-coupon-sale.ts`
- Modify: `packages/coupon-plugin/src/migrations/index.ts`

- [x] **Step 1: 把 localizedTextColumn 提升到 localize.ts 导出**

在 `packages/coupon-plugin/src/localize.ts` 的 `LocalizedText` 类型定义之后插入：

```ts
/**
 * 多语言文本的 DB 列转换：DB 内始终以字符串落库（纯字符串原样存；对象/JSON 字符串存
 * 序列化结果），读写时原样保留。券模板与券包实体共用。
 */
export const localizedTextColumn = {
    to: (value: LocalizedText | null | undefined) =>
        value == null ? value : typeof value === 'string' ? value : JSON.stringify(value),
    from: (value: LocalizedText | null | undefined) => value,
};
```

然后修改 `packages/coupon-plugin/src/coupon-template.entity.ts`：删除本文件 L12-16 的 `const localizedTextColumn = {...}` 定义，并把 import 改为

```ts
import { LocalizedText, localizedTextColumn } from './localize';
```

- [x] **Step 2: 新建出售单实体**

创建 `packages/coupon-plugin/src/coupon-sale-order.entity.ts`（显式 `varchar` 防 Object 反射，沿用充值卡铁律）：

```ts
import { Channel, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne } from 'typeorm';

import { CouponSalePayMode, CouponSaleStatus } from './types';

/**
 * 券出售单：独立单据，不生成 Vendure Order（对标 RechargeOrder）。
 * 金额单位：分。
 */
@Entity()
export class CouponSaleOrder extends VendureEntity {
    constructor(input?: DeepPartial<CouponSaleOrder>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    customerId: number;

    @Column({ type: 'varchar' })
    payMode: CouponSalePayMode;

    /** 单券出售时指向券模板 */
    @Column({ type: 'int', nullable: true })
    templateId: number | null;

    /** 券包出售时指向券包 */
    @Column({ type: 'int', nullable: true })
    bundleId: number | null;

    /** ORDER_SURCHARGE 时指向主订单 */
    @Column({ type: 'int', nullable: true })
    orderId: number | null;

    /** 加价购挂在主订单上的 Surcharge id（摘除用） */
    @Column({ type: 'int', nullable: true })
    surchargeId: number | null;

    @Column({ type: 'int' })
    amount: number;

    @Column({ type: 'varchar' })
    status: CouponSaleStatus;

    @Column({ type: 'varchar', nullable: true })
    paymentMethod: string | null;

    /** 网关商户单号 out_trade_no（幂等核对） */
    @Column({ type: 'varchar', nullable: true })
    externalRef: string | null;

    @Column({ nullable: true })
    paidAt?: Date;

    @Column({ nullable: true })
    refundedAt?: Date;

    @Column({ type: 'text', nullable: true })
    remark: string | null;

    @ManyToOne(() => Channel, { eager: false })
    channel: Channel;

    @Column()
    channelId: number;
}
```

- [x] **Step 3: 新建券包实体**

创建 `packages/coupon-plugin/src/coupon-bundle.entity.ts`：

```ts
import { Channel, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, ManyToOne } from 'typeorm';

import { LocalizedText, localizedTextColumn } from './localize';

/**
 * 出售型券包：购买一次按 CouponBundleItem 循环生成包内全部券。
 * 名称/说明为 LocalizedText（存 text 列，transformer 序列化）。
 */
@Entity()
export class CouponBundle extends VendureEntity {
    constructor(input?: DeepPartial<CouponBundle>) {
        super(input);
    }

    @Column('text', { nullable: false, transformer: localizedTextColumn })
    name: LocalizedText;

    @Column('text', { nullable: true, transformer: localizedTextColumn })
    description?: LocalizedText;

    /** 整包售价（分） */
    @Column({ type: 'int' })
    salePrice: number;

    @Column({ type: 'boolean', default: true })
    enabled: boolean;

    /** 发行归属店铺（店铺隔离，null = 平台级） */
    @Column({ type: 'int', nullable: true })
    shopId: number | null;

    @ManyToOne(() => Channel, { eager: false })
    channel: Channel;

    @Column()
    channelId: number;
}

/** 券包内单项：某券模板在包内的张数 */
@Entity()
export class CouponBundleItem extends VendureEntity {
    constructor(input?: DeepPartial<CouponBundleItem>) {
        super(input);
    }

    @Column({ type: 'int' })
    bundleId: number;

    @Column({ type: 'int' })
    templateId: number;

    @Column({ type: 'int', default: 1 })
    quantity: number;
}
```

- [x] **Step 4: CustomerCoupon 增加 saleOrderId**

在 `packages/coupon-plugin/src/customer-coupon.entity.ts` 的 `expiredAt` 之后追加：

```ts
    /** 溯源：该券由哪笔出售单生成（退款回收按此定位；非出售券为 null） */
    @Column({ type: 'int', nullable: true }) saleOrderId: number | null;
```

- [x] **Step 5: 幂等迁移**

创建 `packages/coupon-plugin/src/migrations/create-coupon-sale.ts`（沿用 `add-coupon-distribution-channels.ts` 的幂等范式：`hasTable` / `hasColumn` 守卫 + 出错只打日志）：

```ts
// 幂等建出售相关表：coupon_sale_order / coupon_bundle / coupon_bundle_item，
// 并补 customer_coupon.saleOrderId 列。生产 PG 与本地 SQLite 都可能关闭 synchronize。
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, Table, TableColumn } from 'typeorm';

@Injectable()
export class CreateCouponSaleMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    async onApplicationBootstrap() {
        try {
            const queryRunner = this.connection.createQueryRunner();
            try {
                const saleTable = 'coupon_sale_order';
                if (!(await queryRunner.hasTable(saleTable))) {
                    await queryRunner.createTable(
                        new Table({
                            name: saleTable,
                            columns: [
                                { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
                                { name: 'createdAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
                                { name: 'updatedAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
                                { name: 'customerId', type: 'int', isNullable: false },
                                { name: 'payMode', type: 'varchar', isNullable: false },
                                { name: 'templateId', type: 'int', isNullable: true },
                                { name: 'bundleId', type: 'int', isNullable: true },
                                { name: 'orderId', type: 'int', isNullable: true },
                                { name: 'surchargeId', type: 'int', isNullable: true },
                                { name: 'amount', type: 'int', isNullable: false },
                                { name: 'status', type: 'varchar', isNullable: false },
                                { name: 'paymentMethod', type: 'varchar', isNullable: true },
                                { name: 'externalRef', type: 'varchar', isNullable: true },
                                { name: 'paidAt', type: 'datetime', isNullable: true },
                                { name: 'refundedAt', type: 'datetime', isNullable: true },
                                { name: 'remark', type: 'text', isNullable: true },
                                { name: 'channelId', type: 'int', isNullable: false },
                            ],
                        }),
                    );
                }

                const bundleTable = 'coupon_bundle';
                if (!(await queryRunner.hasTable(bundleTable))) {
                    await queryRunner.createTable(
                        new Table({
                            name: bundleTable,
                            columns: [
                                { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
                                { name: 'createdAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
                                { name: 'updatedAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
                                { name: 'name', type: 'text', isNullable: false },
                                { name: 'description', type: 'text', isNullable: true },
                                { name: 'salePrice', type: 'int', isNullable: false },
                                { name: 'enabled', type: 'boolean', isNullable: false, default: true },
                                { name: 'shopId', type: 'int', isNullable: true },
                                { name: 'channelId', type: 'int', isNullable: false },
                            ],
                        }),
                    );
                }

                const itemTable = 'coupon_bundle_item';
                if (!(await queryRunner.hasTable(itemTable))) {
                    await queryRunner.createTable(
                        new Table({
                            name: itemTable,
                            columns: [
                                { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
                                { name: 'createdAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
                                { name: 'updatedAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
                                { name: 'bundleId', type: 'int', isNullable: false },
                                { name: 'templateId', type: 'int', isNullable: false },
                                { name: 'quantity', type: 'int', isNullable: false, default: 1 },
                            ],
                        }),
                    );
                }

                const ccMeta = this.connection.getMetadata('CustomerCoupon');
                const ccTable = ccMeta.tableName;
                const saleOrderId = new TableColumn({ name: 'saleOrderId', type: 'int', isNullable: true });
                if (!(await queryRunner.hasColumn(ccTable, saleOrderId.name))) {
                    await queryRunner.addColumn(ccTable, saleOrderId);
                }
            } finally {
                await queryRunner.release();
            }
        } catch (e: any) {
            // 建表失败不阻塞启动，等待下次启动重试
            // eslint-disable-next-line no-console
            console.error('[CreateCouponSaleMigration] failed to ensure tables:', e?.message);
        }
    }
}
```

- [x] **Step 6: 导出迁移**

在 `packages/coupon-plugin/src/migrations/index.ts` 末尾追加：

```ts
export { CreateCouponSaleMigration } from './create-coupon-sale';
```

（若该文件为 `export * from` 风格，则改为同样的 `export * from './create-coupon-sale';` 以与其一致。）

- [x] **Step 7: 类型检查**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx tsc --noEmit -p tsconfig.json
```
Expected: EXIT 0。

- [x] **Step 8: Commit**

```
git add packages/coupon-plugin/src/coupon-sale-order.entity.ts packages/coupon-plugin/src/coupon-bundle.entity.ts packages/coupon-plugin/src/customer-coupon.entity.ts packages/coupon-plugin/src/localize.ts packages/coupon-plugin/src/coupon-template.entity.ts packages/coupon-plugin/src/migrations/create-coupon-sale.ts packages/coupon-plugin/src/migrations/index.ts
git commit -m "feat(coupon): add sale/bundle entities and idempotent migration"
```

---

### Task 3: 纯函数模块（退款判定 / 券包展开 / 目录过滤）

**Files:**
- Create: `packages/coupon-plugin/src/coupon-sale.ts`
- Create: `packages/coupon-plugin/src/coupon-sale.spec.ts`

- [x] **Step 1: 写失败的测试**

创建 `packages/coupon-plugin/src/coupon-sale.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { expandBundleItems, filterSaleCatalogue, isSaleOrderRefundable } from './coupon-sale';

describe('isSaleOrderRefundable', () => {
    it('全部未使用 → 可退', () => {
        expect(isSaleOrderRefundable(['UNUSED', 'UNUSED'])).toBe(true);
    });

    it('过期券视为未使用 → 可退', () => {
        expect(isSaleOrderRefundable(['UNUSED', 'EXPIRED'])).toBe(true);
    });

    it('回退券（RETURNED）视为未使用 → 可退', () => {
        expect(isSaleOrderRefundable(['RETURNED'])).toBe(true);
    });

    it('存在一张 USED → 不可退', () => {
        expect(isSaleOrderRefundable(['UNUSED', 'USED', 'EXPIRED'])).toBe(false);
    });

    it('空数组（无券可回收）→ 不可退', () => {
        expect(isSaleOrderRefundable([])).toBe(false);
    });

    it('null/undefined 状态按未使用处理', () => {
        expect(isSaleOrderRefundable([null, undefined])).toBe(true);
    });
});

describe('expandBundleItems', () => {
    it('quantity 缺省按 1 张展开', () => {
        expect(expandBundleItems([{ templateId: 7 }, { templateId: 9 }])).toEqual([7, 9]);
    });

    it('quantity 为 3 时重复 3 次', () => {
        expect(expandBundleItems([{ templateId: 7, quantity: 3 }])).toEqual([7, 7, 7]);
    });

    it('quantity 为 0/负数/小数时下限为 1 并取整', () => {
        expect(expandBundleItems([{ templateId: 1, quantity: 0 }])).toEqual([1]);
        expect(expandBundleItems([{ templateId: 1, quantity: -5 }])).toEqual([1]);
        expect(expandBundleItems([{ templateId: 1, quantity: 2.9 }])).toEqual([1, 1]);
    });

    it('空列表返回空数组', () => {
        expect(expandBundleItems([])).toEqual([]);
    });
});

describe('filterSaleCatalogue', () => {
    it('仅保留 salePrice > 0 的模板', () => {
        const list = [
            { id: 1, salePrice: 990 },
            { id: 2, salePrice: 0 },
            { id: 3, salePrice: null },
            { id: 4, salePrice: 100 },
        ];
        expect(filterSaleCatalogue(list).map(t => t.id)).toEqual([1, 4]);
    });
});
```

- [x] **Step 2: 运行测试确认失败**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run src/coupon-sale.spec.ts
```
Expected: FAIL —— `Cannot find module './coupon-sale'`。

- [x] **Step 3: 实现纯函数模块**

创建 `packages/coupon-plugin/src/coupon-sale.ts`：

```ts
/**
 * 券出售相关的纯函数（无 IO、SSR 可用）：
 * 退款判定、券包展开、出售目录过滤。
 */

/**
 * 出售单可退判定：出售单生成的券中「没有任何一张状态为 USED」即可退。
 * 过期券（EXPIRED）与回退券（RETURNED）均视为未使用（设计 §16-5：过期券可退）。
 * 空集合（异常数据，无券可回收）→ 拒绝，避免空退款。
 */
export function isSaleOrderRefundable(
    statuses: ReadonlyArray<string | null | undefined>,
): boolean {
    if (statuses.length === 0) {
        return false;
    }
    return statuses.every(s => s !== 'USED');
}

/**
 * 券包展开：把 [{templateId, quantity}] 展开为逐张的 templateId 序列。
 * quantity 缺省 / 非法 / 小于 1 时按 1 张处理。
 */
export function expandBundleItems(
    items: ReadonlyArray<{ templateId: number; quantity?: number | null }>,
): number[] {
    const out: number[] = [];
    for (const item of items) {
        const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1)) || 1);
        for (let i = 0; i < qty; i++) {
            out.push(item.templateId);
        }
    }
    return out;
}

/** 出售目录过滤：仅保留 salePrice > 0 的可售模板（0 / null = 不可售）。 */
export function filterSaleCatalogue<T extends { salePrice?: number | null }>(
    templates: ReadonlyArray<T>,
): T[] {
    return templates.filter(t => Number(t.salePrice ?? 0) > 0);
}
```

- [x] **Step 4: 运行测试确认通过**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run src/coupon-sale.spec.ts
```
Expected: PASS —— 14 passed。

- [x] **Step 5: Commit**

```
git add packages/coupon-plugin/src/coupon-sale.ts packages/coupon-plugin/src/coupon-sale.spec.ts
git commit -m "feat(coupon): add sale pure functions with tests"
```

---

### Task 4: CouponService 桥接（发券 / GRANT 校验 / 到店券列表）

**Files:**
- Modify: `packages/coupon-plugin/src/coupon.service.ts`
- Modify: `packages/coupon-plugin/src/coupon-channel.spec.ts`（若需补 `hasChannel` 用例；否则跳过）

- [x] **Step 1: createUserCoupon 支持 saleOrderId 与 SALE 来源**

在 `packages/coupon-plugin/src/coupon.service.ts` 修改 `createUserCoupon` 签名（约 L1092）与 `new CustomerCoupon({...})` 入参：

```ts
    private async createUserCoupon(
        ctx: RequestContext,
        customerId: number,
        tpl: CouponTemplate,
        issuedBy: 'CENTRE' | 'ADMIN' | 'EXCHANGE' | 'SALE',
        saleOrderId?: number | null,
    ): Promise<CustomerCoupon> {
```

并在 `new CustomerCoupon({ ... })` 的对象字面量中加入一行：

```ts
                saleOrderId: saleOrderId ?? null,
```

（其余字段保持不变，切勿改动已有 `expiredAt` 计算逻辑。）

- [x] **Step 2: 新增 issueForSale 公开桥接**

在同一文件 `createUserCoupon` 之前（`countHeld` 之后）插入：

```ts
    /**
     * 出售发券桥接：复用发券不变量（原子扣余量 → 建券并记录出售单溯源）。
     * 券包逐张调用本方法，任一张售罄即抛错，由调用方事务回滚整包。
     */
    public async issueForSale(
        ctx: RequestContext,
        customerId: number,
        tpl: CouponTemplate,
        saleOrderId: number,
    ): Promise<CustomerCoupon> {
        const ok = await this.atomicIncrementClaimed(ctx, tpl.id, tpl);
        if (!ok) {
            throw new UserInputError('Coupon sold out');
        }
        return this.createUserCoupon(ctx, customerId, tpl, 'SALE', saleOrderId);
    }
```

- [x] **Step 3: grantCouponIssue 补 GRANT 渠道校验**

找到 `packages/coupon-plugin/src/coupon.service.ts` 中的 `grantCouponIssue` 方法（grep 定位），在其载入模板 `tpl` 之后、开始发券之前插入渠道校验（与 `redeemByClaimCode` 的写法对称）：

```ts
        if (!hasChannel(tpl, false, 'GRANT')) {
            throw new UserInputError('Coupon is not available for targeted grant');
        }
```

- [x] **Step 4: 新增到店可用券列表（接手计划 1 缺口）**

在同一文件 `listMyCoupons` 之后插入（场景过滤复用 `matchesScene`，渠道归属复用 `templateBelongsToChannel`；供到店收银按顾客查看可核销券）：

```ts
    /**
     * 到店收银：列出某顾客在当前渠道「可到店核销」的券（未使用 / 未过期 / 场景含 IN_STORE）。
     * 仅到店场景过滤，不做渠道集合判定（券可由任意渠道获得，到店核销只看场景与归属）。
     */
    public async listInStoreCoupons(
        ctx: RequestContext,
        customerId: number,
    ): Promise<CustomerCoupon[]> {
        const repo = this.connection.getRepository(ctx, CustomerCoupon);
        const list = await repo.find({
            where: { customerId },
            relations: { template: { channels: true } },
            order: { id: 'DESC' },
        });
        const now = Date.now();
        return list.filter(cc => {
            const tpl = cc.template;
            if (!tpl || !tpl.enabled) return false;
            if (cc.status !== 'UNUSED' && cc.status !== 'RETURNED') return false;
            if (cc.expiredAt && new Date(cc.expiredAt).getTime() <= now) return false;
            if (!matchesScene(tpl.usageScene, 'IN_STORE')) return false;
            return this.templateBelongsToChannel(ctx, tpl);
        });
    }
```

- [x] **Step 5: 单测：到店券列表场景过滤**

在 `packages/coupon-plugin/src/coupon.service.spec.ts` 末尾追加（沿用该文件既有的 mock 范式：构造带 `connection.getRepository` 桩的 service 实例；若既有 spec 未提供构造工具，则用 `Object.create(CouponService.prototype)` 注入 `connection` 与 `customerService`）：

```ts
describe('CouponService.listInStoreCoupons', () => {
    const baseCc = (over: any = {}) => ({
        id: 1,
        customerId: 5,
        status: 'UNUSED',
        expiredAt: null,
        template: {
            id: 9,
            enabled: true,
            usageScene: 'IN_STORE',
            channels: [],
            ...over.template,
        },
        ...over,
    });

    it('仅返回到店/全场景且未使用未过期的券', async () => {
        const rows = [
            baseCc({ id: 1, template: { usageScene: 'IN_STORE' } }),
            baseCc({ id: 2, template: { usageScene: 'ALL' } }),
            baseCc({ id: 3, template: { usageScene: 'ONLINE' } }),
            baseCc({ id: 4, status: 'USED', template: { usageScene: 'IN_STORE' } }),
            baseCc({ id: 5, expiredAt: new Date(Date.now() - 1000), template: { usageScene: 'IN_STORE' } }),
        ];
        const service: any = Object.create(CouponService.prototype);
        service.connection = { getRepository: () => ({ find: async () => rows }) };
        const out = await service.listInStoreCoupons({ channelId: 1 } as any, 5);
        expect(out.map((c: any) => c.id)).toEqual([1, 2]);
    });
});
```

> 说明：`templateBelongsToChannel` 在 `channels: []` 时返回 `true`；`matchesScene` 由计划 1 的 `coupon-channel.ts` 提供。该用例只覆盖过滤分支，不触碰 DB。

- [x] **Step 6: 运行单测**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run src/coupon.service.spec.ts
```
Expected: PASS（含新增用例）。

- [x] **Step 7: Commit**

```
git add packages/coupon-plugin/src/coupon.service.ts packages/coupon-plugin/src/coupon.service.spec.ts
git commit -m "feat(coupon): sale issuance bridge, GRANT channel check, in-store coupon list"
```

---

### Task 5: CouponSaleService（路径 A · 券商城）

**Files:**
- Create: `packages/coupon-plugin/src/coupon-sale.service.ts`

- [x] **Step 1: 新建出售服务**

创建 `packages/coupon-plugin/src/coupon-sale.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import {
    ChannelService,
    Customer,
    CustomerService,
    ID,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { CouponService } from './coupon.service';
import { CouponTemplate } from './coupon-template.entity';
import { CustomerCoupon } from './customer-coupon.entity';
import { CouponSaleOrder } from './coupon-sale-order.entity';
import { CouponBundle, CouponBundleItem } from './coupon-bundle.entity';
import {
    expandBundleItems,
    filterSaleCatalogue,
    isSaleOrderRefundable,
} from './coupon-sale';
import { filterTemplatesByChannelAndScene, hasChannel, matchesScene } from './coupon-channel';
import { getCouponBalancePort } from './coupon-balance-port';
import { WechatpayService, resolveCustomerOpenid } from '@vendure/wechatpay-plugin';

/**
 * 进程内网关引用（镜像 recharge-card-plugin 的 setWechatpayGateway 模式）：
 * 由 plugin.ts 在启动时经 Injector 取到 WechatpayService 后 setCouponSaleGateway 注入；
 * 未装载 WechatpayPlugin 时为 null，微信支付入口提示网关未配置。
 */
let gatewayService: WechatpayService | null = null;
export function setCouponSaleGateway(gw: WechatpayService | null): void {
    gatewayService = gw;
}

/**
 * 出售链路编排：独立券商城（微信 / 余额）+ 加价购 + 退款回收。
 * 所有金额单位为「分」。订单/券的最终发放在 CouponService 内完成，本服务只做编排与状态机。
 */
@Injectable()
export class CouponSaleService {
    constructor(
        private connection: TransactionalConnection,
        private couponService: CouponService,
        private customerService: CustomerService,
    ) {}

    /** 当前请求的 customerId */
    private async currentCustomerId(ctx: RequestContext): Promise<number> {
        const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId!);
        if (!customer) {
            throw new UserInputError('No customer for the current user');
        }
        return customer.id as number;
    }

    /** 券商城目录：可售模板（渠道含 SALE 且 salePrice>0）+ 启用券包 */
    async saleCatalogue(
        ctx: RequestContext,
        scene?: string,
    ): Promise<{ templates: CouponTemplate[]; bundles: CouponBundle[] }> {
        const repo = this.connection.getRepository(ctx, CouponTemplate);
        const all = await repo.find({ relations: { channels: true } });
        const effectiveScene = (scene ?? 'ONLINE') as any;
        const saleable = filterSaleCatalogue(
            filterTemplatesByChannelAndScene(all, 'SALE', effectiveScene),
        ).filter(t => t.enabled);

        const bundleRepo = this.connection.getRepository(ctx, CouponBundle);
        const bundles = await bundleRepo.find({
            where: { enabled: true, channelId: ctx.channelId as any },
            order: { id: 'DESC' },
        });
        return { templates: saleable, bundles };
    }

    /** 创建出售单（路径 A）：校验渠道含 SALE / 可售 / 未售罄，落 PENDING 单 */
    async createSaleOrder(
        ctx: RequestContext,
        templateId?: ID | null,
        bundleId?: ID | null,
    ): Promise<CouponSaleOrder> {
        if (!templateId && !bundleId) {
            throw new UserInputError('templateId or bundleId is required');
        }
        if (templateId && bundleId) {
            throw new UserInputError('Only one of templateId / bundleId is allowed');
        }
        const customerId = await this.currentCustomerId(ctx);
        let amount = 0;
        if (templateId) {
            const tpl = await this.loadSaleableTemplate(ctx, templateId);
            amount = tpl.salePrice;
        } else {
            const { bundle, items } = await this.loadSaleableBundle(ctx, bundleId as ID);
            this.assertBundleStock(bundle, items);
            amount = bundle.salePrice;
        }
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        return repo.save(
            new CouponSaleOrder({
                customerId,
                payMode: 'WECHAT',
                templateId: templateId ? Number(templateId) : null,
                bundleId: bundleId ? Number(bundleId) : null,
                orderId: null,
                surchargeId: null,
                amount,
                status: 'PENDING',
                paymentMethod: null,
                externalRef: null,
                remark: null,
                channelId: ctx.channelId as number,
            }),
        );
    }

    /** 余额支付（同步结算）：扣余额 → 置 PAID → 发券 */
    async paySaleOrderWithBalance(ctx: RequestContext, id: ID): Promise<CouponSaleOrder> {
        const port = getCouponBalancePort();
        if (!port) {
            throw new UserInputError('Balance payment is not available');
        }
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        const order = await this.loadOwnedPendingOrder(ctx, id);
        await port.deductBalance(ctx, order.customerId, order.amount);
        order.paymentMethod = 'balance';
        await repo.save(order);
        await this.settleSaleOrder(ctx, order.id as number);
        const fresh = await repo.findOne({ where: { id: order.id } });
        return fresh as CouponSaleOrder;
    }

    /** 生成微信支付参数（仅本人 PENDING 单），镜像 recharge-card 的 RC- 范式 */
    async createWechatCouponPayment(
        ctx: RequestContext,
        saleOrderId: ID,
        tradeType?: string,
        openid?: string,
    ): Promise<any> {
        const order = await this.loadOwnedPendingOrder(ctx, saleOrderId);
        if (!gatewayService) {
            throw new UserInputError('Payment gateway not configured');
        }
        const outTradeNo = `CS-${order.id}`;
        const effectiveTradeType = tradeType || 'JSAPI';
        const effectiveOpenid =
            openid ||
            (await resolveCustomerOpenid(ctx, order.customerId, {
                preferMini: effectiveTradeType === 'JSAPI',
            }));
        const pay = await gatewayService.createBarePayment({
            outTradeNo,
            amount: order.amount,
            tradeType: effectiveTradeType,
            openid: effectiveOpenid,
            description: `Coupon ${outTradeNo}`,
        });
        order.paymentMethod = 'wechatpay';
        order.externalRef = outTradeNo;
        await this.connection.getRepository(ctx, CouponSaleOrder).save(order);
        return { saleOrderId: order.id, outTradeNo, pay };
    }

    /** 微信回调结算入口：解析 CS-<id>，原子置 PAID 后发券（幂等） */
    async settleCouponSaleOrderByOutTradeNo(ctx: RequestContext, outTradeNo: string): Promise<void> {
        const m = String(outTradeNo).match(/^CS-(\d+)$/);
        if (!m) {
            throw new UserInputError('Invalid coupon sale out_trade_no');
        }
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        const order = await repo.findOne({
            where: { id: m[1] as any, channelId: ctx.channelId as any },
        });
        if (!order) {
            throw new UserInputError('Coupon sale order not found');
        }
        if (order.status !== 'PENDING') {
            return; // 幂等：已结算直接返回
        }
        await this.connection.startTransaction(ctx);
        try {
            const claim = await repo
                .createQueryBuilder()
                .update(CouponSaleOrder)
                .set({ status: 'PAID', paidAt: new Date() })
                .where('id = :id AND status = :status', { id: order.id, status: 'PENDING' })
                .execute();
            if ((claim.affected ?? 0) === 0) {
                await this.connection.commitOpenTransaction(ctx);
                return; // 并发下已被他人结算
            }
            await this.issueCouponsForOrder(ctx, order);
            await this.connection.commitOpenTransaction(ctx);
        } catch (e) {
            await this.connection.rollBackTransaction(ctx);
            throw e;
        }
    }

    /** 取消未支付出售单 */
    async cancelSaleOrder(ctx: RequestContext, id: ID): Promise<CouponSaleOrder> {
        const order = await this.loadOwnedPendingOrder(ctx, id);
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        order.status = 'CANCELLED';
        return repo.save(order);
    }

    /**
     * 退款回收（路径 A：微信 / 余额）：券全部未使用才可退。
     * 回收券（INVALID）+ 单据 REFUNDED + 余额补偿（微信/余额支付均已入客户余额，见 §16-2 决策）。
     */
    async refundSaleOrder(ctx: RequestContext, id: ID, reason?: string): Promise<CouponSaleOrder> {
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        const order = await repo.findOne({
            where: { id: id as any, channelId: ctx.channelId as any },
        });
        if (!order) {
            throw new UserInputError('Coupon sale order not found');
        }
        if (order.payMode === 'ORDER_SURCHARGE') {
            throw new UserInputError('Please refund the main order instead');
        }
        if (order.status !== 'PAID') {
            throw new UserInputError(`Coupon sale order is ${order.status}`);
        }
        const coupons = await this.loadSaleCoupons(ctx, order.id as number);
        if (!isSaleOrderRefundable(coupons.map(c => c.status))) {
            throw new UserInputError('Coupon already used, refund rejected');
        }
        const port = getCouponBalancePort();
        if (!port) {
            throw new UserInputError('Balance refund is not available');
        }
        await this.connection.startTransaction(ctx);
        try {
            const claim = await repo
                .createQueryBuilder()
                .update(CouponSaleOrder)
                .set({ status: 'REFUNDED', refundedAt: new Date(), remark: reason ?? order.remark })
                .where('id = :id AND status = :status', { id: order.id, status: 'PAID' })
                .execute();
            if ((claim.affected ?? 0) === 0) {
                throw new UserInputError('Coupon sale order is not refundable now');
            }
            await this.invalidateCoupons(ctx, order.id as number);
            await port.addBalance(ctx, order.customerId, order.amount);
            await this.connection.commitOpenTransaction(ctx);
        } catch (e) {
            await this.connection.rollBackTransaction(ctx);
            throw e;
        }
        return (await repo.findOne({ where: { id: order.id } })) as CouponSaleOrder;
    }

    /** 我的出售单 */
    async mySaleOrders(ctx: RequestContext): Promise<CouponSaleOrder[]> {
        const customerId = await this.currentCustomerId(ctx);
        return this.connection.getRepository(ctx, CouponSaleOrder).find({
            where: { customerId, channelId: ctx.channelId as any },
            order: { id: 'DESC' },
        });
    }

    // ===== 加价购（路径 B）=====

    /**
     * 商品页加价购：把券价作为 Surcharge 挂到主订单，落 PENDING 出售单。
     * orderId 必须是本人的活动订单。同一 orderId + templateId 只允许一条 PENDING。
     */
    async attachCouponToOrder(
        ctx: RequestContext,
        orderId: ID,
        templateId: ID,
        orderService: any,
    ): Promise<CouponSaleOrder> {
        const customerId = await this.currentCustomerId(ctx);
        const tpl = await this.loadSaleableTemplate(ctx, templateId);
        if (!matchesScene(tpl.usageScene, 'ONLINE')) {
            throw new UserInputError('Coupon is not available for online orders');
        }
        const order = await orderService.getOrderOrThrow(ctx, orderId);
        const orderCustomerId = order.customer?.id ?? order.customerId;
        if (String(orderCustomerId) !== String(customerId)) {
            throw new UserInputError('Order does not belong to the current customer');
        }
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        const existing = await repo.findOne({
            where: {
                orderId: Number(orderId),
                templateId: Number(templateId),
                status: 'PENDING',
                channelId: ctx.channelId as any,
            },
        });
        if (existing) {
            throw new UserInputError('Coupon already attached to this order');
        }
        const updated = await orderService.addSurchargeToOrder(ctx, orderId, {
            description: `Coupon surcharge #${templateId}`,
            listPrice: tpl.salePrice,
            listPriceIncludesTax: ctx.channel.pricesIncludeTax,
        });
        const surcharge = updated.surcharges[updated.surcharges.length - 1];
        return repo.save(
            new CouponSaleOrder({
                customerId,
                payMode: 'ORDER_SURCHARGE',
                templateId: Number(templateId),
                bundleId: null,
                orderId: Number(orderId),
                surchargeId: surcharge ? Number(surcharge.id) : null,
                amount: tpl.salePrice,
                status: 'PENDING',
                paymentMethod: null,
                externalRef: null,
                remark: null,
                channelId: ctx.channelId as number,
            }),
        );
    }

    /** 摘除加价购：移除 Surcharge + 置 CANCELLED */
    async detachCouponFromOrder(
        ctx: RequestContext,
        orderId: ID,
        templateId: ID,
        orderService: any,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        const order = await repo.findOne({
            where: {
                orderId: Number(orderId),
                templateId: Number(templateId),
                status: 'PENDING',
                channelId: ctx.channelId as any,
            },
        });
        if (!order) {
            return false;
        }
        if (order.surchargeId != null) {
            await orderService.removeSurchargeFromOrder(ctx, orderId, order.surchargeId);
        }
        order.status = 'CANCELLED';
        await repo.save(order);
        return true;
    }

    /**
     * 主订单支付成功 → 结算全部 PENDING 加价购单（幂等）。
     * 由 plugin.ts 订阅 OrderStateTransitionEvent(toState='PaymentSettled') 调用。
     */
    async settleSurchargeOrdersForOrder(ctx: RequestContext, orderId: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        const orders = await repo.find({
            where: {
                orderId: Number(orderId),
                payMode: 'ORDER_SURCHARGE',
                status: 'PENDING',
            },
        });
        for (const order of orders) {
            await this.settleSaleOrderWithTx(ctx, order);
        }
    }

    /**
     * 主订单整单退款/取消 → 回收加价购券并置 REFUNDED（钱随主订单退回，不做余额补偿）。
     */
    async refundSurchargeOrdersForOrder(ctx: RequestContext, orderId: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        const orders = await repo.find({
            where: {
                orderId: Number(orderId),
                payMode: 'ORDER_SURCHARGE',
                status: 'PAID',
            },
        });
        for (const order of orders) {
            await this.connection.startTransaction(ctx);
            try {
                const claim = await repo
                    .createQueryBuilder()
                    .update(CouponSaleOrder)
                    .set({ status: 'REFUNDED', refundedAt: new Date() })
                    .where('id = :id AND status = :status', { id: order.id, status: 'PAID' })
                    .execute();
                if ((claim.affected ?? 0) === 0) {
                    await this.connection.commitOpenTransaction(ctx);
                    continue;
                }
                await this.invalidateCoupons(ctx, order.id as number);
                await this.connection.commitOpenTransaction(ctx);
            } catch (e) {
                await this.connection.rollBackTransaction(ctx);
                throw e;
            }
        }
    }

    // ===== 券包（admin + 购买编排）=====

    async listBundles(
        ctx: RequestContext,
        options?: { skip?: number; take?: number },
    ): Promise<{ items: CouponBundle[]; totalItems: number }> {
        const qb = this.connection
            .getRepository(ctx, CouponBundle)
            .createQueryBuilder('b')
            .where('b.channelId = :channelId', { channelId: Number(ctx.channelId) });
        qb.orderBy('b.id', 'DESC');
        qb.skip(Math.max(0, options?.skip ?? 0)).take(Math.min(options?.take ?? 20, 200));
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    async findBundle(ctx: RequestContext, id: ID): Promise<CouponBundle | undefined> {
        return this.connection.getRepository(ctx, CouponBundle).findOne({
            where: { id: id as any, channelId: ctx.channelId as any },
        });
    }

    async listBundleItems(ctx: RequestContext, bundleId: ID): Promise<CouponBundleItem[]> {
        return this.connection.getRepository(ctx, CouponBundleItem).find({
            where: { bundleId: Number(bundleId) },
            order: { id: 'ASC' },
        });
    }

    /** 创建/更新券包（仅管理当前渠道） */
    async saveBundle(ctx: RequestContext, input: any, id?: ID): Promise<CouponBundle> {
        const repo = this.connection.getRepository(ctx, CouponBundle);
        const bundle =
            id != null
                ? await repo.findOne({ where: { id: id as any, channelId: ctx.channelId as any } })
                : new CouponBundle({ channelId: ctx.channelId as number });
        if (!bundle) {
            throw new UserInputError('Coupon bundle not found');
        }
        const salePrice = Math.floor(Number(input?.salePrice ?? 0));
        if (!Number.isFinite(salePrice) || salePrice <= 0) {
            throw new UserInputError('salePrice must be a positive integer (cents)');
        }
        bundle.name = input?.name ?? bundle.name;
        if (input?.description !== undefined) {
            bundle.description = input.description ?? undefined;
        }
        bundle.salePrice = salePrice;
        if (input?.enabled !== undefined) {
            bundle.enabled = !!input.enabled;
        }
        if (input?.shopId !== undefined) {
            bundle.shopId = input.shopId == null ? null : Number(input.shopId);
        }
        const saved = await repo.save(bundle);

        if (Array.isArray(input?.items)) {
            const itemRepo = this.connection.getRepository(ctx, CouponBundleItem);
            await itemRepo.delete({ bundleId: saved.id as number });
            for (const raw of input.items) {
                const templateId = Number(raw?.templateId);
                if (!Number.isFinite(templateId)) {
                    throw new UserInputError('items[].templateId is required');
                }
                const qty = Math.max(1, Math.floor(Number(raw?.quantity ?? 1)) || 1);
                await itemRepo.save(
                    new CouponBundleItem({ bundleId: saved.id as number, templateId, quantity: qty }),
                );
            }
        }
        return saved;
    }

    async deleteBundle(ctx: RequestContext, id: ID): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, CouponBundle);
        const bundle = await repo.findOne({
            where: { id: id as any, channelId: ctx.channelId as any },
        });
        if (!bundle) {
            return false;
        }
        await this.connection.getRepository(ctx, CouponBundleItem).delete({ bundleId: bundle.id as number });
        await repo.remove(bundle);
        return true;
    }

    /** admin 出售单流水（列表 + 单查） */
    async listSaleOrders(
        ctx: RequestContext,
        options?: { skip?: number; take?: number; status?: string },
    ): Promise<{ items: CouponSaleOrder[]; totalItems: number }> {
        const qb = this.connection
            .getRepository(ctx, CouponSaleOrder)
            .createQueryBuilder('s')
            .where('s.channelId = :channelId', { channelId: Number(ctx.channelId) });
        if (options?.status) {
            qb.andWhere('s.status = :status', { status: options.status });
        }
        qb.orderBy('s.id', 'DESC');
        qb.skip(Math.max(0, options?.skip ?? 0)).take(Math.min(options?.take ?? 20, 200));
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    async findSaleOrder(ctx: RequestContext, id: ID): Promise<CouponSaleOrder | undefined> {
        return this.connection.getRepository(ctx, CouponSaleOrder).findOne({
            where: { id: id as any, channelId: ctx.channelId as any },
        });
    }

    // ===== 内部：加载与校验 =====

    private async loadSaleableTemplate(ctx: RequestContext, templateId: ID): Promise<CouponTemplate> {
        const tpl = await this.connection.getRepository(ctx, CouponTemplate).findOne({
            where: { id: templateId as any },
            relations: { channels: true },
        });
        if (!tpl) {
            throw new UserInputError(`CouponTemplate ${templateId} not found`);
        }
        if (!tpl.enabled) {
            throw new UserInputError('Coupon template is disabled');
        }
        if (!hasChannel(tpl, false, 'SALE')) {
            throw new UserInputError('Coupon is not for sale');
        }
        if (!this.couponService.templateBelongsToChannel(ctx, tpl)) {
            throw new UserInputError('Coupon is not available in this shop');
        }
        if (Number(tpl.salePrice ?? 0) <= 0) {
            throw new UserInputError('Coupon has no sale price');
        }
        if (tpl.totalCount > 0 && tpl.claimedCount >= tpl.totalCount) {
            throw new UserInputError('Coupon sold out');
        }
        return tpl;
    }

    private async loadSaleableBundle(
        ctx: RequestContext,
        bundleId: ID,
    ): Promise<{ bundle: CouponBundle; items: CouponBundleItem[] }> {
        const bundle = await this.findBundle(ctx, bundleId);
        if (!bundle || !bundle.enabled) {
            throw new UserInputError('Coupon bundle not found');
        }
        if (Number(bundle.salePrice ?? 0) <= 0) {
            throw new UserInputError('Coupon bundle has no sale price');
        }
        const items = await this.listBundleItems(ctx, bundleId);
        if (items.length === 0) {
            throw new UserInputError('Coupon bundle is empty');
        }
        return { bundle, items };
    }

    private async assertBundleStock(bundle: CouponBundle, items: CouponBundleItem[]): Promise<void> {
        // 无法 bundle 内模板一次性带 ctx 精查（省 IO 由发券时的原子扣减兜底），此处仅确认模板存在且启用
        const repo = this.connection.rawConnection.getRepository(CouponTemplate);
        for (const item of items) {
            const tpl = await repo.findOne({ where: { id: item.templateId as any } });
            if (!tpl || !tpl.enabled) {
                throw new UserInputError(`Bundle template ${item.templateId} is not available`);
            }
        }
    }

    private async loadOwnedPendingOrder(ctx: RequestContext, id: ID): Promise<CouponSaleOrder> {
        const customerId = await this.currentCustomerId(ctx);
        const order = await this.connection.getRepository(ctx, CouponSaleOrder).findOne({
            where: { id: id as any, customerId, channelId: ctx.channelId as any },
        });
        if (!order) {
            throw new UserInputError('Coupon sale order not found');
        }
        if (order.status !== 'PENDING') {
            throw new UserInputError(`Coupon sale order is ${order.status}`);
        }
        return order;
    }

    private async loadSaleCoupons(ctx: RequestContext, saleOrderId: number): Promise<CustomerCoupon[]> {
        return this.connection.getRepository(ctx, CustomerCoupon).find({
            where: { saleOrderId },
            order: { id: 'ASC' },
        });
    }

    /** 结算 + 发券（自带事务；供余额支付与加价购复用） */
    private async settleSaleOrderWithTx(ctx: RequestContext, order: CouponSaleOrder): Promise<void> {
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        await this.connection.startTransaction(ctx);
        try {
            const claim = await repo
                .createQueryBuilder()
                .update(CouponSaleOrder)
                .set({ status: 'PAID', paidAt: new Date() })
                .where('id = :id AND status = :status', { id: order.id, status: 'PENDING' })
                .execute();
            if ((claim.affected ?? 0) === 0) {
                await this.connection.commitOpenTransaction(ctx);
                return;
            }
            await this.issueCouponsForOrder(ctx, order);
            await this.connection.commitOpenTransaction(ctx);
        } catch (e) {
            await this.connection.rollBackTransaction(ctx);
            throw e;
        }
    }

    /** 余额支付：已在事务内的结算（避免嵌套问题，直接发券） */
    private async settleSaleOrder(ctx: RequestContext, saleOrderId: number): Promise<void> {
        const repo = this.connection.getRepository(ctx, CouponSaleOrder);
        const order = await repo.findOne({ where: { id: saleOrderId as any } });
        if (!order) {
            throw new UserInputError('Coupon sale order not found');
        }
        await this.issueCouponsForOrder(ctx, order);
        order.status = 'PAID';
        order.paidAt = order.paidAt ?? new Date();
        await repo.save(order);
    }

    /** 按出售单发券：单券 1 张 / 券包按 item 展开逐张签发 */
    private async issueCouponsForOrder(ctx: RequestContext, order: CouponSaleOrder): Promise<void> {
        if (order.templateId != null) {
            const tpl = await this.connection.getRepository(ctx, CouponTemplate).findOne({
                where: { id: order.templateId as any },
            });
            if (!tpl) {
                throw new UserInputError(`CouponTemplate ${order.templateId} not found`);
            }
            await this.couponService.issueForSale(ctx, order.customerId, tpl, order.id as number);
            return;
        }
        if (order.bundleId != null) {
            const items = await this.listBundleItems(ctx, order.bundleId);
            const sequences = expandBundleItems(items);
            for (const templateId of sequences) {
                const tpl = await this.connection.getRepository(ctx, CouponTemplate).findOne({
                    where: { id: templateId as any },
                });
                if (!tpl) {
                    throw new UserInputError(`CouponTemplate ${templateId} not found`);
                }
                await this.couponService.issueForSale(ctx, order.customerId, tpl, order.id as number);
            }
            return;
        }
        throw new UserInputError('Coupon sale order has neither templateId nor bundleId');
    }

    private async invalidateCoupons(ctx: RequestContext, saleOrderId: number): Promise<void> {
        await this.connection
            .getRepository(ctx, CustomerCoupon)
            .createQueryBuilder()
            .update(CustomerCoupon)
            .set({ status: 'INVALID' })
            .where('saleOrderId = :saleOrderId AND status IN (:...statuses)', {
                saleOrderId,
                statuses: ['UNUSED', 'RETURNED', 'EXPIRED'],
            })
            .execute();
    }
}
```

> **注意（供执行者）**：`loadSaleableBundle` 的入参 `bundle` 在 `assertBundleStock` 中未使用，若 lint 报未使用参数，可将签名改为 `assertBundleStock(items: CouponBundleItem[])` 并同步调用点。已核实：`@vendure/wechatpay-plugin` 导出 `WechatpayService`（L68）与 `resolveCustomerOpenid(ctx, customerId, { preferMini })`（L53），故 `setCouponSaleGateway` + `resolveCustomerOpenid` 方案可直接落地（镜像 `recharge-card-plugin` 自有的 `setWechatpayGateway`）。

- [x] **Step 2: 类型检查**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx tsc --noEmit -p tsconfig.json
```
Expected: EXIT 0（若报 `@vendure/wechatpay-plugin` 未导出 `getWechatpayGateway`，按上方「注意」改为 setter 注入后再验证）。

- [x] **Step 3: Commit**

```
git add packages/coupon-plugin/src/coupon-sale.service.ts
git commit -m "feat(coupon): coupon sale service (wechat/balance/surcharge/refund)"
```

---

### Task 6: GraphQL 契约与插件装配

**Files:**
- Create: `packages/coupon-plugin/src/coupon-sale-shop.resolver.ts`
- Create: `packages/coupon-plugin/src/coupon-sale-admin.resolver.ts`
- Modify: `packages/coupon-plugin/src/coupon-binding-admin.resolver.ts`
- Modify: `packages/coupon-plugin/src/plugin.ts`

- [x] **Step 1: shop resolver**

创建 `packages/coupon-plugin/src/coupon-sale-shop.resolver.ts`：

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, OrderService, Permission, RequestContext, Transaction, UserInputError } from '@vendure/core';

import { CouponSaleService } from './coupon-sale.service';

@Resolver()
export class CouponSaleShopResolver {
    constructor(
        private couponSaleService: CouponSaleService,
        private orderService: OrderService,
    ) {}

    @Query()
    @Allow(Permission.Authenticated)
    async couponSaleCatalogue(@Ctx() ctx: RequestContext, @Args('scene', { nullable: true }) scene?: string) {
        return this.couponSaleService.saleCatalogue(ctx, scene ?? undefined);
    }

    @Query()
    @Allow(Permission.Authenticated)
    async myCouponSaleOrders(@Ctx() ctx: RequestContext) {
        return this.couponSaleService.mySaleOrders(ctx);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async createCouponSaleOrder(
        @Ctx() ctx: RequestContext,
        @Args('templateId', { nullable: true }) templateId?: ID,
        @Args('bundleId', { nullable: true }) bundleId?: ID,
    ) {
        return this.couponSaleService.createSaleOrder(ctx, templateId ?? null, bundleId ?? null);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async payCouponSaleWithBalance(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.couponSaleService.paySaleOrderWithBalance(ctx, id);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async createWechatCouponPayment(
        @Ctx() ctx: RequestContext,
        @Args('saleOrderId') saleOrderId: ID,
        @Args('tradeType', { nullable: true }) tradeType?: string,
        @Args('openid', { nullable: true }) openid?: string,
    ) {
        return this.couponSaleService.createWechatCouponPayment(ctx, saleOrderId, tradeType, openid);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async cancelCouponSaleOrder(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.couponSaleService.cancelSaleOrder(ctx, id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async refundCouponSaleOrder(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('reason', { nullable: true }) reason?: string,
    ) {
        return this.couponSaleService.refundSaleOrder(ctx, id, reason);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async attachCouponToOrder(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('templateId') templateId: ID,
    ) {
        return this.couponSaleService.attachCouponToOrder(ctx, orderId, templateId, this.orderService);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async detachCouponFromOrder(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('templateId') templateId: ID,
    ) {
        return this.couponSaleService.detachCouponFromOrder(ctx, orderId, templateId, this.orderService);
    }
}
```

- [x] **Step 2: admin resolver**

创建 `packages/coupon-plugin/src/coupon-sale-admin.resolver.ts`：

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext, Transaction } from '@vendure/core';

import { CouponSaleService } from './coupon-sale.service';

@Resolver()
export class CouponSaleAdminResolver {
    constructor(private couponSaleService: CouponSaleService) {}

    @Query()
    @Allow(Permission.UpdateOrder)
    async couponBundles(@Ctx() ctx: RequestContext, @Args('options', { nullable: true }) options?: any) {
        return this.couponSaleService.listBundles(ctx, {
            skip: options?.skip ?? 0,
            take: options?.take ?? 20,
        });
    }

    @Query()
    @Allow(Permission.UpdateOrder)
    async couponBundle(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.couponSaleService.findBundle(ctx, id);
    }

    @Query()
    @Allow(Permission.UpdateOrder)
    async couponSaleOrders(@Ctx() ctx: RequestContext, @Args('options', { nullable: true }) options?: any) {
        return this.couponSaleService.listSaleOrders(ctx, {
            skip: options?.skip ?? 0,
            take: options?.take ?? 20,
            status: options?.status ?? undefined,
        });
    }

    @Query()
    @Allow(Permission.UpdateOrder)
    async couponSaleOrder(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.couponSaleService.findSaleOrder(ctx, id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateOrder)
    async createCouponBundle(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.couponSaleService.saveBundle(ctx, input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateOrder)
    async updateCouponBundle(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('input') input: any,
    ) {
        return this.couponSaleService.saveBundle(ctx, input, id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateOrder)
    async deleteCouponBundle(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.couponSaleService.deleteBundle(ctx, id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateOrder)
    async refundCouponSaleOrder(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('reason', { nullable: true }) reason?: string,
    ) {
        return this.couponSaleService.refundSaleOrder(ctx, id, reason);
    }
}
```

- [x] **Step 3: 券侧批量选品（改造既有 binding admin resolver）**

在 `packages/coupon-plugin/src/coupon-binding-admin.resolver.ts` 追加三个成员（复用既有 `CouponBindingService`；若其未提供批量方法，则按下述直接经其 connection 操作，需先核实 `coupon-binding.service.ts` 是否已有 `listByTemplate` / `bindProducts`）。**执行前先读该 resolver 与 `coupon-binding.service.ts`，确认既有方法名后再落地**：

```ts
    @Query()
    @Allow(Permission.UpdateOrder)
    async couponBoundProducts(@Ctx() ctx: RequestContext, @Args('templateId') templateId: ID) {
        return this.couponBindingService.listByTemplate(ctx, Number(templateId));
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateOrder)
    async bindProductsToCoupon(
        @Ctx() ctx: RequestContext,
        @Args('templateId') templateId: ID,
        @Args('productIds', { type: () => [ID] }) productIds: ID[],
        @Args('variantIds', { type: () => [ID], nullable: true }) variantIds?: ID[],
    ) {
        return this.couponBindingService.bindProducts(ctx, Number(templateId), productIds, variantIds ?? null);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateOrder)
    async unbindProductFromCoupon(
        @Ctx() ctx: RequestContext,
        @Args('templateId') templateId: ID,
        @Args('productId') productId: ID,
    ) {
        return this.couponBindingService.unbindProduct(ctx, Number(templateId), Number(productId));
    }
```

同时在 `packages/coupon-plugin/src/coupon-binding.service.ts` 补齐 `listByTemplate` / `bindProducts` / `unbindProduct` 三个方法（读写既有 `ProductCouponBinding`，`channelId` 取 `ctx.channelId`；`bindProducts` 对已存在绑定跳过、返回新建条数；`unbindProduct` 删除并返回布尔）。**具体签名以该文件既有风格为准**（方法内用 `this.connection.getRepository(ctx, ProductCouponBinding)`）。

- [x] **Step 4: plugin.ts 装配（entities / providers / SDL / resolvers）**

在 `packages/coupon-plugin/src/plugin.ts`：

1. import 新模块：

```ts
import { CouponBundle, CouponBundleItem } from './coupon-bundle.entity';
import { CouponSaleOrder } from './coupon-sale-order.entity';
import { CouponSaleService, setCouponSaleGateway } from './coupon-sale.service';
import { CouponSaleAdminResolver } from './coupon-sale-admin.resolver';
import { CouponSaleShopResolver } from './coupon-sale-shop.resolver';
import { setCouponBalancePort } from './coupon-balance-port';
import { CreateCouponSaleMigration } from './migrations';
```

2. `entities` 数组追加：

```ts
    entities: [CouponTemplate, CustomerCoupon, ProductCouponBinding, InStoreBill, CouponSaleOrder, CouponBundle, CouponBundleItem],
```

3. `providers` 追加 `CouponSaleService, CreateCouponSaleMigration`；`exports` 追加 `CouponSaleService`。

4. admin SDL 追加类型与操作（放在 `extend type Mutation` 之前）：

```graphql
            type CouponBundleItem {
                id: ID!
                bundleId: ID!
                templateId: ID!
                quantity: Int!
            }

            type CouponBundle implements Node {
                id: ID!
                name: String!
                description: String
                salePrice: Int!
                enabled: Boolean!
                shopId: ID
                channelId: ID!
                items: [CouponBundleItem!]!
            }

            type CouponBundleList implements PaginatedList {
                items: [CouponBundle!]!
                totalItems: Int!
            }

            input CouponBundleItemInput {
                templateId: ID!
                quantity: Int
            }

            input CouponBundleInput {
                name: String
                description: String
                salePrice: Int!
                enabled: Boolean
                shopId: ID
                items: [CouponBundleItemInput!]
            }

            type CouponSaleOrder implements Node {
                id: ID!
                customerId: ID!
                payMode: String!
                templateId: ID
                bundleId: ID
                orderId: ID
                amount: Int!
                status: String!
                paymentMethod: String
                externalRef: String
                paidAt: DateTime
                refundedAt: DateTime
                createdAt: DateTime!
            }

            type CouponSaleOrderList implements PaginatedList {
                items: [CouponSaleOrder!]!
                totalItems: Int!
            }

            input CouponSaleOrderListOptions {
                skip: Int
                take: Int
                status: String
            }
```

并在 admin `extend type Query` 内追加：

```graphql
                couponBundles(options: CouponBundleListOptions): CouponBundleList!
                couponBundle(id: ID!): CouponBundle
                couponSaleOrders(options: CouponSaleOrderListOptions): CouponSaleOrderList!
                couponSaleOrder(id: ID!): CouponSaleOrder
                couponBoundProducts(templateId: ID!): [ProductCouponBinding!]!
```

admin `extend type Mutation` 内追加：

```graphql
                createCouponBundle(input: CouponBundleInput!): CouponBundle!
                updateCouponBundle(id: ID!, input: CouponBundleInput!): CouponBundle!
                deleteCouponBundle(id: ID!): Boolean!
                refundCouponSaleOrder(id: ID!, reason: String): CouponSaleOrder!
                bindProductsToCoupon(templateId: ID!, productIds: [ID!]!, variantIds: [ID!]): Int!
                unbindProductFromCoupon(templateId: ID!, productId: ID!): Boolean!
```

并在 admin SDL 补 `input CouponBundleListOptions { skip: Int take: Int }`。

5. shop SDL 追加类型与操作（`extend type Query` 前）：

```graphql
            type CouponSaleCatalogue {
                templates: [CouponTemplate!]!
                bundles: [CouponBundle!]!
            }

            type CouponBundleItem {
                id: ID!
                bundleId: ID!
                templateId: ID!
                quantity: Int!
            }

            type CouponBundle implements Node {
                id: ID!
                name: String!
                description: String
                salePrice: Int!
                enabled: Boolean!
                channelId: ID!
                items: [CouponBundleItem!]!
            }

            type CouponSaleOrder implements Node {
                id: ID!
                customerId: ID!
                payMode: String!
                templateId: ID
                bundleId: ID
                orderId: ID
                amount: Int!
                status: String!
                paidAt: DateTime
                refundedAt: DateTime
                createdAt: DateTime!
            }

            type CouponWechatPayResult {
                saleOrderId: ID!
                outTradeNo: String!
                pay: String
            }
```

shop `extend type Query` 内追加：

```graphql
                couponSaleCatalogue(scene: CouponUsageScene): CouponSaleCatalogue!
                myCouponSaleOrders: [CouponSaleOrder!]!
```

shop `extend type Mutation` 内追加：

```graphql
                createCouponSaleOrder(templateId: ID, bundleId: ID): CouponSaleOrder!
                payCouponSaleWithBalance(id: ID!): CouponSaleOrder!
                createWechatCouponPayment(saleOrderId: ID!, tradeType: String, openid: String): CouponWechatPayResult!
                cancelCouponSaleOrder(id: ID!): CouponSaleOrder!
                refundCouponSaleOrder(id: ID!, reason: String): CouponSaleOrder!
                attachCouponToOrder(orderId: ID!, templateId: ID!): CouponSaleOrder!
                detachCouponFromOrder(orderId: ID!, templateId: ID!): Boolean!
```

6. resolvers 数组追加：admin `CouponSaleAdminResolver`，shop `CouponSaleShopResolver`。

- [x] **Step 5: bootstrap 接线（微信结算 / 余额端口 / 加价购事件）**

在 `onApplicationBootstrap()` 内，`setBindingService(...)` 之后插入：

```ts
        // 余额能力端口（可选依赖 recharge-card-plugin）
        try {
            const { RechargeCardService } = await import('@vendure/recharge-card-plugin');
            const svc = this.injector.get(RechargeCardService);
            setCouponBalancePort({
                getBalance: (ctx, cid) => svc.getBalance(ctx, cid),
                deductBalance: (ctx, cid, amt) => svc.deductBalance(ctx, cid, amt),
                addBalance: (ctx, cid, amt) => svc.addBalance(ctx, cid, amt, null, null),
            });
            Logger.info('Coupon balance port registered (recharge-card)', loggerCtx);
        } catch (e: any) {
            setCouponBalancePort(null);
            Logger.info('Coupon balance port unavailable (recharge-card not registered)', loggerCtx);
        }

        // 微信回调结算注册（前缀 CS-）+ 网关引用注入
        try {
            const { WechatpaySettlementRegistry, WechatpayService } = await import('@vendure/wechatpay-plugin');
            const registry = this.injector.get(WechatpaySettlementRegistry);
            const gateway = this.injector.get(WechatpayService);
            setCouponSaleGateway(gateway);
            const saleService = this.injector.get(CouponSaleService);
            registry.register({
                prefix: 'CS-',
                settle: (ctx, outTradeNo) => saleService.settleCouponSaleOrderByOutTradeNo(ctx, outTradeNo),
            });
            Logger.info('CouponSaleOrder ~CS- settlement registered (wechatpay gateway)', loggerCtx);
        } catch (e: any) {
            setCouponSaleGateway(null);
            Logger.warn('Wechatpay settlement registry unavailable for coupon sale', loggerCtx);
        }
```

并在既有 `OrderStateTransitionEvent` 订阅中扩展（**在 Cancelled 分支之后新增 PaymentSettled 分支**，或新增一个独立 `ofType(OrderStateTransitionEvent)` 订阅，二选一，勿重复核销逻辑）：

```ts
        // 加价购：主订单支付成功 → 结算 PENDING 加价购单并发券
        this.eventBus.ofType(OrderStateTransitionEvent).subscribe(async (event) => {
            if (event.toState !== 'PaymentSettled') return;
            try {
                await this.injector
                    .get(CouponSaleService)
                    .settleSurchargeOrdersForOrder(event.ctx, event.order.id);
            } catch (e: any) {
                Logger.error(`Failed to settle coupon surcharge on order ${event.order.id}: ${e.message}`, loggerCtx);
            }
        });

        // 加价购：主订单取消 / 整单退款 → 回收加价购券（钱随主订单退回）
        this.eventBus.ofType(OrderStateTransitionEvent).subscribe(async (event) => {
            if (event.toState !== 'Cancelled') return;
            try {
                await this.injector
                    .get(CouponSaleService)
                    .refundSurchargeOrdersForOrder(event.ctx, event.order.id);
            } catch (e: any) {
                Logger.error(`Failed to recycle coupon surcharge on order ${event.order.id}: ${e.message}`, loggerCtx);
            }
        });
```

- [x] **Step 6: 类型检查 + 全量单测**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx tsc --noEmit -p tsconfig.json
```
Expected: EXIT 0。

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run src/
```
Expected: 全部 PASS（计划 1 基线 103 passed + 本计划新增用例；无 failed）。

- [x] **Step 7: Commit**

```
git add packages/coupon-plugin/src/coupon-sale-shop.resolver.ts packages/coupon-plugin/src/coupon-sale-admin.resolver.ts packages/coupon-plugin/src/coupon-binding-admin.resolver.ts packages/coupon-plugin/src/coupon-binding.service.ts packages/coupon-plugin/src/plugin.ts
git commit -m "feat(coupon): sale/bundle graphql + plugin wiring (CS- settlement, balance port, surcharge events)"
```

---

### Task 7: 收口回归与执行记录

**Files:**
- Modify: `d:\zhao\docs\superpowers\plans\2026-10-02-coupon-multi-channel-distribution-plan2-backend-sale-bundle.md`（勾选 + 执行记录）

- [x] **Step 1: 全量单测回归**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx vitest --config vitest.config.mts --run src/
```
Expected: 全 PASS、0 failed；记录 passed 数（相对计划 1 基线 103 的增量）。

- [x] **Step 2: 类型检查回归**

Run（cwd `d:\zhao\vendure\packages\coupon-plugin`）:
```
npx tsc --noEmit -p tsconfig.json
```
Expected: EXIT 0。

- [x] **Step 3: 构建产物可用（跨包依赖）**

Run（cwd `d:\zhao\vendure`）:
```
yarn build:packages
```
Expected: 成功（若该脚本不存在，则分别构建 `packages/recharge-card-plugin` 与 `packages/coupon-plugin`：`npx tsc -p ./tsconfig.build.json`）。确认 `packages/coupon-plugin/lib/` 产出。

- [x] **Step 4: 工作区干净核对**

Run（cwd `d:\zhao\vendure`）:
```
git status --porcelain
```
Expected: 空输出（所有改动已提交）。

- [x] **Step 5: 写执行记录**

在本计划文件末尾追加「执行记录」小节，记录：各 Task 提交 hash、单测 passed/failed 数、`tsc` 结果、构建结果、以及**残留/待处理事项**（至少含：① 未做本地 DB 运行态 e2e（无本地 DB），`CS-` 结算与退款回收需真实 DB 覆盖；② 加价购 `addSurchargeToOrder` 在真实订单金额计算中的表现需 e2e 验证「surcharge 不参与满减」；③ 到店收银券列表 `listInStoreCoupons` 需接入 admin SDL 后由计划 3/4 前端消费）。

- [x] **Step 6: Commit**

```
git add -A
git commit -m "docs(coupon): plan2 execution log and checklist"
```

---

## 自检（Self-Review）

**1. Spec 覆盖核对**

| Spec 章节 | 落地 Task |
| --- | --- |
| §5.1 模板列（已由计划 1 完成） | 计划 1 |
| §5.2 券包实体 | Task 2 |
| §5.3 出售单实体 | Task 2（+ `surchargeId` 偏离点 1、`ManyToOne channel` 偏离点 3） |
| §5.4 CustomerCoupon.saleOrderId | Task 2 |
| §5.5 新枚举 | Task 1（`CouponSalePayMode` 三值，偏离点 2） |
| §6.1 渠道判定（已完成） | 计划 1 |
| §6.2 场景隔离（含到店收银列表） | Task 4 `listInStoreCoupons` |
| §7.1 路径 A 券商城微信支付 | Task 5 + Task 6（`CS-` 注册） |
| §7.1 余额支付（§16-1 新增） | Task 1 端口 + Task 5 `paySaleOrderWithBalance` |
| §7.2 路径 B 加价购 | Task 5 `attach/detach` + Task 6 事件 |
| §7.3 退款与回收 | Task 5 `refundSaleOrder` / `refundSurchargeOrdersForOrder` + Task 3 判定 |
| §8 幂等与并发 | Task 5 原子 `UPDATE ... WHERE status=...` + Task 6 唯一 PENDING 查重 + `issueForSale` 售罄原子扣减 |
| §9.1 admin GraphQL | Task 6 |
| §9.2 shop GraphQL | Task 6 |
| §10 权限 | Task 6（`Permission.UpdateOrder` 对齐既有券 resolver；C 端 `Permission.Authenticated`） |
| §13.1 后端单测 | Task 3 / Task 4 |
| §13.2 e2e | **未覆盖（残留）**：记入 Task 7 执行记录，需真实 DB |
| §11 / §12 前端与 i18n | 计划 3 / 计划 4 |
| §16 待确认 6 项 | 本计划开头「已拍板决策」 |

**2. 占位符扫描**：无 TBD / TODO；每处代码步骤均给出可粘贴实现与确切命令。Task 5 Step 1、Task 6 Step 3 含「执行前核实」提示——这是**必须核实的既有事实**（网关访问器与 binding 服务方法名），并非占位符，且已给出两种确定落地路径。

**3. 类型一致性核对**：`CouponSalePayMode` / `CouponSaleStatus` 在 `types.ts`（Task 1）定义，实体（Task 2）与服务（Task 5）统一引用；`isSaleOrderRefundable` / `expandBundleItems` / `filterSaleCatalogue` 在 Task 3 定义并被 Task 5 调用；`issueForSale(ctx, customerId, tpl, saleOrderId)` 在 Task 4 定义并被 Task 5 调用；`settleCouponSaleOrderByOutTradeNo` / `settleSurchargeOrdersForOrder` / `refundSurchargeOrdersForOrder` / `getBalance`+`deductBalance`+`addBalance` 端口方法在 Task 5 定义并被 Task 6 引用。命名一致。

**4. 已知偏离**：见开头「相对设计文档的实现取舍」1–5，需在提交信息与执行记录中注明。

---

## 执行记录（2026-10-02）

**执行方式**：Subagent 驱动（每 Task 派 fresh subagent 实现 + 主 agent 两阶段审查：读 `git show HEAD` 实际 diff + 亲自复跑 tsc/vitest）。仓库 `d:\zhao\vendure`。

### 各 Task 提交

| Task | 内容 | commit |
| --- | --- | --- |
| Task 1 | 依赖接线 + 类型 + 余额端口 | `4228277c9`（+ lock 最小同步 `0d125d008`） |
| Task 2 | 实体 + 幂等迁移 + localize 去重 | `c2636d770` |
| Task 3 | 纯函数 `coupon-sale.ts` + spec（TDD） | `58b316ff0` |
| Task 4 | `coupon.service` 桥接（`issueForSale` / GRANT 校验 / `listInStoreCoupons`）+ spec | `21c39aaa0` |
| Task 5 | `CouponSaleService`（微信/余额/加价购/退款/券包） | `efd9735eb` |
| Task 6 | 出售/券包 GraphQL 契约 + 插件装配（`CS-` 结算、余额端口、加价购事件） | `656d9de5e` |
| Task 7 | 收口回归 + 执行记录 + 构建产物 | 见本文件所在提交 |

### 回归结果

- **单测**：`npx vitest --config vitest.config.mts --run src/` → **9 文件 / 115 用例全 PASS，0 failed**（计划 1 基线 103 → 增 12）。
- **类型检查**：`npx tsc --noEmit -p tsconfig.json` → **EXIT 0**。
- **构建**（根无 `build:packages` 脚本、无 yarn，改为分别构建）：
  - `packages/recharge-card-plugin` → `npx tsc -p ./tsconfig.build.json` EXIT 0（`lib/index.d.ts`、`lib/index.js` 补出 `RechargeCardService` 导出）。
  - `packages/coupon-plugin` → `npx tsc -p ./tsconfig.build.json` EXIT 0，`lib/src/` 产出新文件（`coupon-sale.service.js`、`coupon-sale-{shop,admin}.resolver.js`、`coupon-bundle.resolver.js` 等）。
  - 两包 `lib/` 均为 git 跟踪产物，构建改动已随本计划一并提交（部署走 `git pull` + `pm2 restart`，服务器不构建）。
- **工作区**：提交后 `git status --porcelain` 为空。

### 执行期发现并修正的计划偏差（计划原文 → 实际落地）

1. **Task 4**：计划 spec 中 `...over` 会覆盖 `template` 导致断言失败 → 改为解构合并。计划写「14 passed」为笔误，实际 11。
2. **Task 5**：`createWechatCouponPayment` 的 `tradeType` 计划为 `string`，与 `WechatpayService.createBarePayment` 的联合类型不符 → 收窄为 `'JSAPI'|'NATIVE'|'H5'|'APP'`；`assertBundleStock(bundle, items)` 的未使用参数 `bundle` → 改为 `assertBundleStock(items)`；`findBundle`/`findSaleOrder` 的 `T | null` 与 `T | undefined` 不符 → `?? undefined` 归一。
3. **Task 6**（较多）：
   - `CouponBindingAdminResolver` 注入字段实为 `bindingService`（计划写 `couponBindingService`）→ 修正。
   - 计划让后台选品器调 `listByTemplate`，但该方法带「客户可见」过滤（要求模板含 `PRODUCT` 渠道），对 SALE 渠道券恒返回空 → 新增 `listByTemplateAdmin`（不过滤可见性、按渠道隔离）。
   - 计划未给 `bindProducts` / `unbindProduct` 实现 → 按既有风格补齐（跳过已存在、返回新建条数 / 返回布尔）。
   - 计划缺 `CouponBundle` 字段解析器（`name`/`description` 为 `LocalizedText`、`items` 需展开）→ 新增 `coupon-bundle.resolver.ts`，并在 admin 与 shop 两套 resolvers 数组**都注册**。
   - 计划 shop SDL 写 `pay: String` 与 service 返回对象不符 → 改为 `CouponWechatPayParams`（刻意避开 recharge-card 已占用的 `WechatPayParams` 类型名） + `CouponWechatPayResult`。
   - 计划遗漏 admin `input CouponBundleListOptions` → 补上。
   - `@Args('productIds', { type: () => [ID] })`：`ID` 是纯类型，作值用报 TS2693 → 去掉 `type`。
   - `import { RechargeCardService } from '@vendure/recharge-card-plugin'` 当时编译失败（该包 git 跟踪的 `lib/index.d.ts` 为旧构建、未导出该类）；先以深路径动态 import 规避，**Task 7 重建该包 lib 后已还原为标准包导入**（DI token 与 recharge-card 自身 `require('./recharge-card.service')` 指向同一模块实例，端口注入成立）。

### 运行态 e2e 暴露并修复的缺陷（2026-10-02）

1. **余额支付遇到「券包部分售罄」会扣款并留下半套券**：`paySaleOrderWithBalance` 原顺序为「扣余额 → 置 PAID → 发券」，而 `RechargeCardService.deductBalance` 内部会 `commitOpenTransaction`（提前提交外层 `@Transaction()`），导致其后发券失败（如券包某张售罄）时：已提交的扣款无法回滚、已 `issueForSale` 的券残留、单据停在 PENDING。
   **修复**：改为「先发券 + 置 PAID（仍在事务内）→ 最后 `deductBalance` 提交」，使「发券 / 置 PAID / 扣款」三者原子落库；任一步失败仅回滚外层事务（测试 ③-2 断言「失败不落券、不入账、不扣余额」）。
2. **`createSaleOrder` 未 `await` `assertBundleStock`**：券包内模板缺失/停用时，校验抛错会变成未处理的 Promise 拒绝，校验形同失效。**修复**：补 `await`。

### 残留 / 待处理事项

1. ~~**未做真实 DB 运行态 e2e**~~ → **已完成（2026-10-02）**：新增 `packages/coupon-plugin/e2e/coupon-sale.e2e-spec.ts`（13 用例），覆盖 ①`CS-` 微信结算回调（注册表路径，与 `/wechatpay/notify` 同一入口）与重复回调幂等 / ②退款回收（路径 A 余额补偿、已核销拒绝、重复退款幂等、路径 B 整单退款回收）/ ③券包逐张签发与任一张售罄整包回滚 / ④并发幂等（并发回调仅发 1 张、限量 1 张并发购买仅一笔成功）。**双 DB 全绿**：sqljs 13/13、`DB=postgres`（本机 PostgreSQL 18，Initializer 另建 `e2e_*` 库）13/13。
2. **加价购 `addSurchargeToOrder`** 在真实订单金额中的表现：e2e ⑤ 已验证「surcharge 全额计入 `order.totalWithTax`」（整单退款金额含券价 2500）；「不参与满减/促销」尚未断言（该用例未挂门槛促销），待计划 3/4 联调时补。
3. **到店收银券列表** `listInStoreCoupons` 已就绪但尚未接入 GraphQL 暴露面，由计划 3（web-admin）/ 计划 4（nshop）消费。
4. ~~**加价购券的整单退款回收未订阅 `RefundStateTransitionEvent → Settled`**~~ → **已补齐并验证**：`plugin.ts` 的 `RefundStateTransitionEvent → Settled` 订阅内已调 `refundSurchargeOrdersForOrder`，e2e ⑤ 断言整单退款 Settled 后加价购单 `REFUNDED` 且券 `INVALID`。
5. 事务分层：`paySaleOrderWithBalance` / `refundSaleOrder` 等带 `@Transaction()` 的入口内部再调 `startTransaction`/`commitOpenTransaction`（Vendure 的 `startTransaction` 已做「已激活则跳过」保护，内部 commit 会提前提交外层事务）。此为镜像 recharge-card 既有范式的取舍；其具体后果已由本页缺陷 1 修复（发券置于扣款之前）。

### e2e 环境注意（复用他处）

- `testConfig()` 使用 `TestingEntityIdStrategy`：GraphQL 层 ID 形如 `T_1`，而 Service 层 `order.id` 是 DB 自增主键、`out_trade_no` 由 `CS-${order.id}` 拼成 `CS-1`。测试中构造/断言需 `decodeId()` 归一，否则会出现 `CS-T_1` 不匹配 `/^CS-(\d+)$/` 或 `Number('T_1') === NaN`。
- `EventBus.ofType()` 订阅在**事务提交后异步触发**（`publish()` 只 await 阻塞式处理器），事件驱动的断言必须轮询（本套件用 `waitFor`），否则 sqljs 上偶过、真实 DB 上必现竞态。