# MeiliSearch 统一知识库实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec（docs/superpowers/specs/2026-10-13-meilisearch-knowledge-base-design.md）落地 MeiliSearch 统一知识库：Vendure 商品域 + Strapi 内容域双侧直推、web-admin 索引管理页、nginx 查询入口。

**Architecture:** 方案 A 双侧直推。两个后端各内置一个小同步插件把文档推到 MeiliSearch（按语言拆索引 kb-zh/kb-en）；查询经 nginx 反代直连；管理面挂 web-admin → Vendure admin API（meiliIndexStats/meiliReindex），重建内容域时由 Vendure 插件以 shared secret 调 Strapi 管理路由。

**Tech Stack:** MeiliSearch 1.x（Rust 二进制 + systemd）、Vendure 插件（TypeScript/NestJS，参照 favorite-plugin）、Strapi 插件（参照 zhao-track）、web-admin（uni-app Vue3）、node:test/.mjs 回归脚本。

**范围说明（P1/P2）：** 本计划（P1）交付知识库后端 + 管理面 + 查询 API + 验证。C 端（nshop/vshop）搜索框/结果页接入为后续 P2 独立计划。

**关键路径速查：**

| 事项 | 路径 |
|---|---|
| Vendure 插件模板 | `d:\zhao\vendure\packages\favorite-plugin\src\plugin.ts`（plugin/resolver/service 组织） |
| EventBus 订阅示例 | `d:\zhao\vendure\packages\group-buy-plugin\src\plugin.ts:208` |
| 生产配置源文件 | `d:\zhao\vendure\packages\dev-server\dev-config.ts`（plugins 数组；dist 副本 vendure-prod/dist/dev-config.js 由构建生成） |
| Strapi 插件模板 | `d:\zhao\strapi\plugins\zhao-track\server\src\{register.ts,bootstrap.ts,routes\admin-api.ts}` |
| Strapi 插件注册 | `d:\zhao\strapi\config\plugins.ts` |
| web-admin 页面注册 | `d:\zhao\vshop\web-admin\src\pages.json`；API 层 `src/apis/*.ts`（`getAdminClient` from `'./client'`） |
| 服务器 | SSH 别名 `joho`；pm2 管理 vendure/strapi；2G 内存铁律 |

**环境变量约定（三处 .env 均不硬编码域名/密钥）：**

```bash
# vendure .env / 服务器环境
MEILI_HOST=http://127.0.0.1:7700
MEILI_ADMIN_KEY=<服务器生成的 master key>
ZHAO_SEARCH_REINDEX_URL=http://127.0.0.1:1337/zhao-search/reindex
ZHAO_SEARCH_SHARED_SECRET=<openssl rand -hex 24 生成>
# strapi .env
MEILI_HOST=http://127.0.0.1:7700
MEILI_ADMIN_KEY=<同上>
ZHAO_SEARCH_SHARED_SECRET=<同上>
```

---

### Task 1: 服务器安装 MeiliSearch + systemd + nginx 反代

**Files:**
- Create(服务器): `/usr/local/bin/meilisearch`（二进制）、`/etc/systemd/system/meilisearch.service`、`/var/lib/meilisearch/`（数据目录）
- Modify(服务器): 对应站点 nginx conf（在 `d:\zhao\strapi\nginx` 有本地副本的，同步修改本地副本）

- [ ] **Step 1: 服务器下载安装二进制**

```bash
# 本地通过 ssh（PowerShell 注意：远程命令含 $ 用 base64 传递）
$cmd = @'
set -e
curl -L https://install.meilisearch.com -o /tmp/meili_install.sh
sh /tmp/meili_install.sh --release latest
useradd -r -s /bin/false meili || true
mkdir -p /var/lib/meilisearch
chown meili:meili /var/lib/meilisearch
'@
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cmd))
ssh joho "echo $encoded | base64 -d | bash"
```

- [ ] **Step 2: 生成密钥并写 systemd unit（内存限制）**

```bash
$cmd = @'
set -e
MASTER_KEY=$(openssl rand -hex 24)
echo "MEILI_MASTER_KEY=$MASTER_KEY"   # 记录下来，后续 .env 要用
cat > /etc/systemd/system/meilisearch.service <<EOF
[Unit]
Description=MeiliSearch
After=network.target
[Service]
User=meili
ExecStart=/usr/local/bin/meilisearch --env production --master-key ${MASTER_KEY} --max-indexing-memory 128 MB --db-path /var/lib/meilisearch --http-addr 127.0.0.1:7700
Restart=always
RestartSec=5
Environment=MEILI_NO_ANALYTICS=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable --now meilisearch
'@
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cmd))
ssh joho "echo $encoded | base64 -d | bash"
```

- [ ] **Step 3: 生成 search key 并验证健康**

```bash
# search key 用 master key 通过 API 创建（只读、限 indexes:kb-*）
$cmd = @'
curl -s http://127.0.0.1:7700/health
curl -s -X POST http://127.0.0.1:7700/keys -H "Authorization: Bearer <MASTER_KEY>" -H "Content-Type: application/json" -d "{\"description\":\"public search\",\"actions\":[\"search\"],\"indexes\":[\"kb-*\"],\"expiresAt\":null}"
'@
```

预期：health 返回 `{"status":"available"}`；keys 返回生成的小写 key（记录到密码管理处，前端后续用）。

- [ ] **Step 4: nginx 反代 /search-api/**

在对应公网站点 conf 增加（本地副本同步改）：

```nginx
location /search-api/ {
    proxy_pass http://127.0.0.1:7700/;
    proxy_set_header Host $host;
    limit_except GET POST { deny all; }
}
```

执行 `nginx -t && nginx -s reload`，隔轮 `curl -s https://<域名>/search-api/health` 验证。

- [ ] **Step 5: 记录交付物**

把 `MEILI_MASTER_KEY`、search key、`ZHAO_SEARCH_SHARED_SECRET`（`openssl rand -hex 24` 生成）写入本地 `.env` 与部署文档草稿（Task 11 汇总）。

---

### Task 2: vendure meilisearch-plugin 骨架 + MeiliService（HTTP 客户端）

**Files:**
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\package.json`（参照 favorite-plugin/package.json，name 改 `@vendure/meilisearch-plugin`）
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\src\constants.ts`
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\src\types.ts`
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\src\meili.service.ts`
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\src\plugin.ts`
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\src\index.ts`
- Modify: `d:\zhao\vendure\tsconfig` 聚合/lerna 包配置（若 favorite-plugin 有 tsconfig references，照抄一份改路径）

- [ ] **Step 1: 写 types 与 constants**

```ts
// src/types.ts
export interface MeiliPluginOptions {
  host: string;            // http://127.0.0.1:7700
  adminKey: string;        // master key
  indexPrefix: string;     // 'kb'
  locales: string[];       // ['zh','en']
  reindexUrl?: string;     // Strapi 管理路由
  sharedSecret?: string;
}
export interface KbDocument {
  id: string; type: string; sourceId: string; sourceSystem: 'vendure' | 'strapi';
  url: string; channelId: string; status: string; tags: string[];
  title: string; body: string; updatedAt: number;
  price?: number; collectionIds?: string[]; slug?: string;
}
export interface MeiliIndexStatus { index: string; documents: number; healthy: boolean; }
```

```ts
// src/constants.ts
export const MEILI_PLUGIN_OPTIONS = 'MEILI_PLUGIN_OPTIONS';
export const loggerCtx = 'MeiliSearchPlugin';
```

- [ ] **Step 2: 写 MeiliService（失败测试先行：先写 `__tests__` 断言请求构造）**

```ts
// src/meili.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { MEILI_PLUGIN_OPTIONS } from './constants';
import { MeiliPluginOptions, KbDocument, MeiliIndexStatus } from './types';

@Injectable()
export class MeiliService {
  constructor(@Inject(MEILI_PLUGIN_OPTIONS) private opts: MeiliPluginOptions) {}

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.opts.host}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.opts.adminKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Meili ${method} ${path} -> ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }

  indexUid(locale: string) { return `${this.opts.indexPrefix}-${locale}`; }

  async ensureIndexes(): Promise<void> {
    for (const locale of this.opts.locales) {
      const uid = this.indexUid(locale);
      await this.req('POST', '/indexes', { uid, primaryKey: 'id' }).catch(e => {
        if (!String(e).includes('index_already_exists')) throw e;   // 幂等
      });
      await this.req('PATCH', `/indexes/${uid}/settings`, {
        searchableAttributes: ['title', 'body', 'tags'],
        filterableAttributes: ['type', 'channelId', 'status', 'tags', 'collectionIds'],
        sortableAttributes: ['updatedAt', 'price'],
      });
    }
  }

  async upsertDocuments(locale: string, docs: KbDocument[]): Promise<void> {
    if (!docs.length) return;
    await this.req('POST', `/indexes/${this.indexUid(locale)}/documents?primaryKey=id`, docs);
  }

  async deleteDocuments(locale: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.req('POST', `/indexes/${this.indexUid(locale)}/documents/delete-batch`, ids);
  }

  async stats(): Promise<MeiliIndexStatus[]> {
    const s = await this.req('GET', '/stats');
    return this.opts.locales.map(locale => {
      const uid = this.indexUid(locale);
      return { index: uid, documents: s.indexes?.[uid]?.numberOfDocuments ?? 0, healthy: true };
    });
  }

  async health(): Promise<boolean> {
    try { return (await (await fetch(`${this.opts.host}/health`)).json()).status === 'available'; }
    catch { return false; }
  }

  async triggerContentReindex(): Promise<boolean> {
    if (!this.opts.reindexUrl || !this.opts.sharedSecret) return false;
    const res = await fetch(this.opts.reindexUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-zhao-secret': this.opts.sharedSecret }, body: '{}',
    });
    if (!res.ok) throw new Error(`Strapi reindex -> ${res.status}: ${await res.text()}`);
    return true;
  }
}
```

- [ ] **Step 3: 写 plugin.ts（先只注册 provider + onApplicationBootstrap 调 ensureIndexes）**

```ts
// src/plugin.ts
import { PluginCommonModule, VendurePlugin, Logger } from '@vendure/core';
import { MEILI_PLUGIN_OPTIONS } from './constants';
import { MeiliPluginOptions } from './types';
import { MeiliService } from './meili.service';

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    { provide: MEILI_PLUGIN_OPTIONS, useFactory: () => MeiliSearchPlugin.options },
    MeiliService,
  ],
  exports: [MeiliService],
})
export class MeiliSearchPlugin {
  static options: MeiliPluginOptions;
  static init(options: MeiliPluginOptions) { this.options = options; return this; }

  async onApplicationBootstrap(): Promise<void> {
    try { await MeiliSearchPlugin.prototype && (await (await import('./meili.service')).MeiliService); } catch {}
  }
}
```

> 注意：`onApplicationBootstrap` 直接注入 `MeiliService`（构造器注入到插件类需用 constructor + @Inject；按 favorite-plugin/plugin.ts 的既有写法实现），bootstrap 里调用 `this.meiliService.ensureIndexes()` 并 `Logger.info('MeiliSearchPlugin initialized', loggerCtx)`。

```ts
// src/index.ts
export * from './plugin';
export * from './types';
export * from './constants';
```

- [ ] **Step 4: 构建校验**

Run: `cd d:\zhao\vendure; npm run build -w @vendure/meilisearch-plugin`（若无 -w 支持，用 `npx lerna run build --scope=@vendure/meilisearch-plugin`）
Expected: 编译通过，无类型错误。

- [ ] **Step 5: Commit**

```bash
git -C d:\zhao\vendure add packages/meilisearch-plugin
git -C d:\zhao\vendure commit -m "feat(meilisearch-plugin): 插件骨架与 MeiliService HTTP 客户端"
```

---

### Task 3: 商品文档投影器（纯函数，TDD）

**Files:**
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\src\product-document.mapper.ts`
- Test: `d:\zhao\vendure\packages\meilisearch-plugin\src\product-document.mapper.test.mts`（node:test，用 tsx 运行；若仓库无 tsx，编译后对 lib 里的 .d.ts+.js 跑）

- [ ] **Step 1: 写失败测试**

```ts
// product-document.mapper.test.mts
import { test } from 'node:test'; import assert from 'node:assert';
import { toProductDocuments, productDocId } from './product-document.mapper.js';

const base = {
  productId: '42', channelId: '37', status: 'published', updatedAt: 1728777600000,
  nameZh: '温泉门票', nameEn: 'Hot Spring Ticket', descZh: '节假日通用', descEn: 'Valid on holidays',
  slugZh: 'hot-spring', slugEn: 'hot-spring', price: 9900, collectionIds: ['7'], tags: ['温泉'],
  urlBase: 'https://www.youshop.cn/products',
};

test('produces one doc per locale with stable id', () => {
  const docs = toProductDocuments(base as any, ['zh', 'en']);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].id, 'product-42');
  assert.equal(docs[0].type, 'product');
  assert.equal(docs[0].channelId, '37');
  assert.equal(docs[0].title, '温泉门票');
  assert.equal(docs[1].title, 'Hot Spring Ticket');
  assert.equal(docs[1].slug, 'hot-spring');
});

test('en falls back to zh when translation missing', () => {
  const docs = toProductDocuments({ ...base, nameEn: '' } as any, ['zh', 'en']);
  assert.equal(docs[1].title, '温泉门票');
  assert.equal(docs[1].body, '节假日通用');
});

test('excludes draft products', () => {
  assert.deepEqual(toProductDocuments({ ...base, status: 'draft' } as any, ['zh']), []);
});

test('productDocId format', () => assert.equal(productDocId('9'), 'product-9'));
```

- [ ] **Step 2: 运行确认失败**

Run: `npx tsx --test packages/meilisearch-plugin/src/product-document.mapper.test.mts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现映射器**

```ts
// src/product-document.mapper.ts
import { KbDocument } from './types';

export interface ProductProjection {
  productId: string; channelId: string; status: string; updatedAt: number;
  nameZh: string; nameEn: string; descZh: string; descEn: string;
  slugZh: string; slugEn: string; price: number; collectionIds: string[]; tags: string[];
  urlBase: string;   // 从 env/动态 origin 注入，禁止硬编码域名
}

export function productDocId(productId: string): string { return `product-${productId}`; }

const pick = (zh: string, en: string) => (en && en.trim() ? en : zh);

export function toProductDocuments(p: ProductProjection, locales: string[]): KbDocument[] {
  if (p.status !== 'published') return [];
  const id = productDocId(p.productId);
  return locales.map(locale => ({
    id, type: 'product', sourceId: p.productId, sourceSystem: 'vendure' as const,
    url: `${p.urlBase}/${locale === 'zh' ? (p.slugZh || p.productId) : (p.slugEn || p.slugZh || p.productId)}`,
    channelId: p.channelId, status: p.status, tags: p.tags,
    title: locale === 'zh' ? p.nameZh : pick(p.nameZh, p.nameEn),
    body: locale === 'zh' ? p.descZh : pick(p.descZh, p.descEn),
    updatedAt: p.updatedAt, price: p.price, collectionIds: p.collectionIds, slug: p.slugZh || p.slugEn,
  }));
}
```

- [ ] **Step 4: 运行测试通过**

Run: `npx tsx --test packages/meilisearch-plugin/src/product-document.mapper.test.mts`
Expected: 4 passing。

- [ ] **Step 5: Commit**

```bash
git -C d:\zhao\vendure add packages/meilisearch-plugin/src/product-document.mapper.ts packages/meilisearch-plugin/src/product-document.mapper.test.mts
git -C d:\zhao\vendure commit -m "feat(meilisearch-plugin): 商品文档投影器与单测"
```

---

### Task 4: 全量重建 JobQueue + EventBus 增量监听

**Files:**
- Modify: `d:\zhao\vendure\packages\meilisearch-plugin\src\plugin.ts`（注册 JobQueue、订阅事件）
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\src\product-sync.service.ts`

- [ ] **Step 1: 写 ProductSyncService（全量重建 + 单品同步）**

```ts
// src/product-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, Product, ProductVariant, Collection, JobQueueService } from '@vendure/core';
import { MeiliService } from './meili.service';
import { ProductProjection, toProductDocuments } from './product-document.mapper';

@Injectable()
export class ProductSyncService {
  private queue: any;
  constructor(private meili: MeiliService, private jobQueueService: JobQueueService) {}

  async onModuleInit() {
    this.queue = await this.jobQueueService.createQueue({
      name: 'meili-reindex-products',
      process: async ({ data, id }) => {
        if (data.productId) await this.syncOne(data.productId);
        else await this.syncAll();
        Logger.info(`reindex done (job ${id})`, loggerCtx);
      },
    });
  }

  async enqueue(productIds?: string[]) {
    await this.queue.add({ productId: productIds?.[0], all: !productIds }, { retries: 5 });
  }

  /** 单品/全量共用投影查询；chunk 处理防大表 */
  async projectAll(em: EntityManager, locales: string[], urlBase: string): Promise<Map<string, KbDocPair[]>> { /* 见 Step 2 */ }
  // KbDocPair = { locale: string; doc: KbDocument }
}
```

> Step 2 实现要点（完整写入，不省略）：
> 1. `em.getRepository(Product).find({ relations: ['translations','variants','variants.price','collections','channels'] })`（按 vendure 版本价格取法：`variants.find(v => v.priceMin/price)` 或用 ProductPriceService；以仓库内现有取价代码为准，搜 `priceMin` 用法照抄）。
> 2. 每个产品组装 `ProductProjection`：`nameZh/nameEn` 取 `product.translations` 中 `languageCode === 'zh_Hans' / 'en'`（以仓库 `VENDURE_LOCALE_MAP` 常量为准，nshop 已确认 zh-CN ↔ zh_Hans）；`channelId` 取 `product.channels` 第一个非默认渠道 id；`status = product.enabled ? 'published' : 'draft'`；`urlBase = process.env.PUBLIC_STOREFRONT_URL ?? ''`。
> 3. `toProductDocuments` 产出 → `meili.upsertDocuments(locale, docs)` 分 locale 批量推（500 条/批）。

- [ ] **Step 3: EventBus 增量（plugin.ts onApplicationBootstrap 内）**

```ts
// plugin.ts 增量部分（参照 group-buy-plugin/src/plugin.ts:208 写法）
import { ProductEvent, ProductVariantEvent, ID } from '@vendure/core';
// constructor(private eventBus: EventBus, private productSync: ProductSyncService) {}
this.eventBus.ofType(ProductEvent).subscribe(e => this.productSync.enqueue([e.entity.id as ID]));
this.eventBus.ofType(ProductVariantEvent).subscribe(async e => {
  const pid = e.entity.productId ?? e.entity.product?.id;
  if (pid) await this.productSync.enqueue([pid]);
});
```

删除处理：`ProductEvent` 里删除场景（`e.type === 'deleted'`）调用 `meili.deleteDocuments(locale, [productDocId(id)])`。

- [ ] **Step 4: 构建通过 + Commit**

Run: `npm run build -w @vendure/meilisearch-plugin` → 无错误。
```bash
git -C d:\zhao\vendure add -A packages/meilisearch-plugin && git -C d:\zhao\vendure commit -m "feat(meilisearch-plugin): 全量重建队列与事件增量同步"
```

---

### Task 5: admin-api 扩展（meiliIndexStats / meiliReindex）

**Files:**
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\src\admin-api\schema.graphql`
- Create: `d:\zhao\vendure\packages\meilisearch-plugin\src\admin-api\meili-admin.resolver.ts`
- Modify: `src/plugin.ts`（adminApiExtensions + resolvers）

- [ ] **Step 1: SDL**

```graphql
# admin-api/schema.graphql
extend type Query {
  meiliIndexStats: [MeiliIndexStatus!]!
}
extend type Mutation {
  meiliReindex(scope: MeiliReindexScope!): MeiliReindexResult!
}
enum MeiliReindexScope { PRODUCTS CONTENTS ALL }
type MeiliIndexStatus { index: String!, documents: Int!, healthy: Boolean! }
type MeiliReindexResult { queued: Boolean!, contentsTriggered: Boolean! }
```

- [ ] **Step 2: Resolver**

```ts
// admin-api/meili-admin.resolver.ts
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { Allow, Permission, Transaction } from '@vendure/core';
import { MeiliService } from '../meili.service';
import { ProductSyncService } from '../product-sync.service';

@Resolver()
export class MeiliAdminResolver {
  constructor(private meili: MeiliService, private sync: ProductSyncService) {}

  @Query()
  @Allow(Permission.Authenticated)
  async meiliIndexStats() {
    const health = await this.meili.health();
    return health ? this.meili.stats() : [];
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.SuperAdmin)
  async meiliReindex(@Args('scope') scope: 'PRODUCTS' | 'CONTENTS' | 'ALL') {
    let contentsTriggered = false;
    if (scope === 'CONTENTS' || scope === 'ALL') contentsTriggered = await this.meili.triggerContentReindex();
    let queued = false;
    if (scope === 'PRODUCTS' || scope === 'ALL') { await this.sync.enqueue(undefined); queued = true; }
    return { queued, contentsTriggered };
  }
}
```

plugin.ts 注册：`adminApiExtensions: { schema: adminApiSchema, resolvers: [MeiliAdminResolver] }`（adminApiSchema 用 `gql` 从 schema.graphql 读取，参照 favorite-plugin 的 shop-api schema 加载方式）。

- [ ] **Step 3: 构建 + 提交**

Run: `npm run build -w @vendure/meilisearch-plugin` → 通过。
```bash
git -C d:\zhao\vendure add -A packages/meilisearch-plugin && git -C d:\zhao\vendure commit -m "feat(meilisearch-plugin): admin-api 索引统计与重建 mutation"
```

---

### Task 6: 生产配置注册 + 部署 + 线上冒烟

**Files:**
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`（plugins 数组加 `MeiliSearchPlugin.init({...})`，读 env）
- Modify: `d:\zhao\vendure\.env`（本地）与服务器环境（MEILI_* / ZHAO_SEARCH_*，见头部约定）

- [ ] **Step 1: 注册插件**

```ts
import { MeiliSearchPlugin } from '@vendure/meilisearch-plugin';
// plugins: [...] 内追加：
MeiliSearchPlugin.init({
  host: process.env.MEILI_HOST ?? 'http://127.0.0.1:7700',
  adminKey: process.env.MEILI_ADMIN_KEY ?? '',
  indexPrefix: 'kb',
  locales: ['zh', 'en'],
  reindexUrl: process.env.ZHAO_SEARCH_REINDEX_URL,
  sharedSecret: process.env.ZHAO_SEARCH_SHARED_SECRET,
}),
```

- [ ] **Step 2: 本地构建验证**

Run: `cd d:\zhao\vendure; npm run build`（核心+插件全量构建）
Expected: 通过。

- [ ] **Step 3: 部署（vendure 铁律：git pull + pm2 restart）**

```bash
git -C d:\zhao\vendure push
ssh joho "cd /path/to/vendure && git pull && pm2 restart vendure"
# 服务器 .env 追加 MEILI_* / ZHAO_SEARCH_*（Task 1 产生的值），重启后生效
```

- [ ] **Step 4: 线上冒烟（脚本 `d:\zhao\scripts\_meili_smoke.mjs`）**

```js
// _meili_smoke.mjs —— 登录 admin GraphQL → meiliIndexStats 应返回 healthy 索引
const ADMIN = 'https://<后台域名>/admin-api';
const r = await fetch(ADMIN, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ meiliIndexStats { index documents healthy } }` }) });
console.log(JSON.stringify(await r.json(), null, 2));
// 预期：[{index:'kb-zh',...},{index:'kb-en',...}] healthy:true
```

然后后台改一个商品标题 → `curl -s "http://127.0.0.1:7700/indexes/kb-zh/search" -H "Authorization: Bearer <search key>" -d '{"q":"<新标题>"}'`（服务器内执行）能搜到 → 增量链路通。

- [ ] **Step 5: Commit**

```bash
git -C d:\zhao\vendure add packages/dev-server/dev-config.ts && git -C d:\zhao\vendure commit -m "chore: 生产配置注册 MeiliSearchPlugin"
```

---

### Task 7: strapi zhao-search 插件骨架 + 管理路由

**Files:**
- Create: `d:\zhao\strapi\plugins\zhao-search\server\src\index.ts`（导出 register/bootstrap，结构照抄 zhao-track）
- Create: `...\server\src\register.ts`（空注册即可）
- Create: `...\server\src\bootstrap.ts`（健康日志）
- Create: `...\server\src\routes\admin-api.ts`
- Create: `...\server\src\controllers\admin-reindex.ts`
- Create: `...\server\src\services\meili.ts`（与 vendure 侧同构的 req/upsert/delete/stats，复用 Task 2 代码，去掉 Nest 装饰器）
- Create: `...\server\src\services\content-sync.ts`（Task 8 填充）
- Modify: `d:\zhao\strapi\config\plugins.ts`（启用 `'zhao-search': { enabled: true }`，参照现有 zhao-* 注册写法）
- Modify: `d:\zhao\strapi\package.json`（若插件需 workspace 声明，照 zhao-track 处理）

- [ ] **Step 1: 管理路由（shared secret，不走 zhao-auth——服务间调用无登录态）**

```ts
// routes/admin-api.ts
export default () => ({
  type: 'admin' as const,
  routes: [
    { method: 'POST', path: '/v1/zhao-search/reindex', handler: 'admin-reindex.reindex',
      config: { auth: false, policies: [] } },
    { method: 'GET', path: '/v1/zhao-search/health', handler: 'admin-reindex.health',
      config: { auth: false, policies: [] } },
  ],
});
```

- [ ] **Step 2: 控制器（校验 shared secret）**

```ts
// controllers/admin-reindex.ts
export default ({ strapi }) => ({
  async health(ctx) { ctx.body = { ok: true }; },
  async reindex(ctx) {
    if (ctx.request.headers['x-zhao-secret'] !== process.env.ZHAO_SEARCH_SHARED_SECRET) {
      ctx.status = 401; ctx.body = { error: 'unauthorized' }; return;
    }
    const { contentSync } = strapi.plugin('zhao-search').service;
    ctx.body = await contentSync.fullReindex();
  },
});
```

（services 导出方式按 zhao-track 的 service 组织：`content-sync` 服务对象内暴露 `fullReindex/syncOne/removeOne`。）

- [ ] **Step 3: 注册插件 + 本地构建**

`config/plugins.ts` 启用；`npm run build`（strapi 根构建含插件，参照 memory 的「插件级构建优先」策略）。
Expected: 构建通过。

- [ ] **Step 4: Commit**

```bash
git -C d:\zhao\strapi add plugins/zhao-search config/plugins.ts && git -C d:\zhao\strapi commit -m "feat(zhao-search): 插件骨架与 shared secret 管理路由"
```

---

### Task 8: 内容域文档映射 + lifecycle 增量 + 启动全量同步

**Files:**
- Create: `...\server\src\content-mapper.ts`
- Modify: `...\server\src\bootstrap.ts`（lifecycles 订阅 + 启动全量）
- Modify: `...\server\src\services\content-sync.ts`

- [ ] **Step 1: 先核对该内容类型真实字段（防映射错位）**

Run: 读取以下 schema.json，记录 title/body/status 类字段名：
`d:\zhao\strapi\plugins\zhao-website\server\src\content-types\{article,faq,tutorial,case,download}\schema.json`、`d:\zhao\strapi\plugins\zhao-studio\server\src\content-types\knowledge-point-index\schema.json`

- [ ] **Step 2: 配置驱动的映射器（字段名来自 Step 1，非硬编码猜测）**

```ts
// content-mapper.ts
export const CONTENT_MAP: Record<string, { type: string; titleField: string; bodyField: string; publishedField: string; localeField?: string }> = {
  'api::article.article': { type: 'article', titleField: 'title', bodyField: 'content', publishedField: 'publishedAt' },
  'api::faq.faq':         { type: 'faq',     titleField: 'question', bodyField: 'answer', publishedField: 'publishedAt' },
  // …tutorial/case/download/knowledge 同结构填充，字段名以 Step 1 实测为准
};
export function toContentDocuments(modelUid: string, entry: any, locales: string[]): Array<{ locale: string; doc: any }> {
  const m = CONTENT_MAP[modelUid]; if (!m || !entry.publishedAt) return [];
  return locales.map(locale => ({
    locale,
    doc: { id: `${m.type}-${entry.documentId ?? entry.id}`, type: m.type, sourceId: String(entry.documentId ?? entry.id),
      sourceSystem: 'strapi', url: `/kb/${m.type}/${entry.documentId ?? entry.id}`, channelId: String(entry.tenantId ?? '0'),
      status: 'published', tags: entry.tags ?? [], title: entry[m.titleField] ?? '', body: stripHtml(entry[m.bodyField] ?? ''),
      updatedAt: new Date(entry.updatedAt).getTime() },
  }));
}
const stripHtml = (s: string) => String(s).replace(/<[^>]*>/g, ' ').slice(0, 5000);
```

- [ ] **Step 3: bootstrap 订阅 lifecycle + 启动全量**

```ts
// bootstrap.ts
const WATCHED = Object.keys(CONTENT_MAP);
strapi.db.lifecycles.subscribe({
  'afterCreate': e => schedule(e), 'afterUpdate': e => schedule(e),
  'afterDelete': e => remove(e),
});
function schedule(e) { if (WATCHED.includes(e.model.uid)) strapi.plugin('zhao-search').service['content-sync'].syncOne(e.model.uid, e.result); }
// 启动全量：setImmediate 延迟到服务就绪后跑 fullReindex()（幂等，失败仅记日志不阻塞启动）
```

- [ ] **Step 4: 构建通过 + Commit**

Run: `npm run build` → 通过。
```bash
git -C d:\zhao\strapi add plugins/zhao-search && git -C d:\zhao\strapi commit -m "feat(zhao-search): 内容映射、lifecycle 增量与启动全量同步"
```

---

### Task 9: strapi 部署 + 两端联调验证

**Files:**
- Create: `d:\zhao\scripts\_meili_e2e.mjs`（回归脚本归档）

- [ ] **Step 1: 部署 strapi（铁律：git pull + pm2 restart strapi）**

```bash
git -C d:\zhao\strapi push
ssh joho "cd /path/to/strapi && git pull && pm2 restart strapi"
# 服务器 strapi .env 追加 MEILI_HOST/MEILI_ADMIN_KEY/ZHAO_SEARCH_SHARED_SECRET
```

- [ ] **Step 2: e2e 回归脚本（写后运行）**

`_meili_e2e.mjs` 断言链：
1. `POST /v1/zhao-search/reindex`（带 x-zhao-secret）→ 200 且 healthy
2. `meiliReindex(scope: ALL)`（admin GraphQL）→ `{queued:true, contentsTriggered:true}`
3. 新建一篇 FAQ（strapi API）→ 5s 内 `kb-zh` 搜到；删除 → 搜不到
4. 渠道 filter：`filter: channelId = '37'` 只回该渠道商品

```bash
node d:\zhao\scripts\_meili_e2e.mjs   # Expected: 全部 PASS
```

- [ ] **Step 3: 修复至全绿后 Commit**

```bash
git -C d:\zhao\scripts add _meili_e2e.mjs && git -C d:\zhao commit -m "test: MeiliSearch 知识库 e2e 回归脚本"
```

---

### Task 10: web-admin「知识库索引」管理页

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\meili.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\kb\index\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`（注册页面，置于 review/list 之后）
- Modify: i18n 词条文件（位置按现有页面同款——先看 `src/pages/review/list/index.vue` 的词条 import 路径，zh/en 同步补齐，硬规范）

- [ ] **Step 1: apis/meili.ts**

```ts
// 参照 src/apis/coupon.ts 的 getAdminClient 用法
import { getAdminClient } from './client';

export interface MeiliIndexStatus { index: string; documents: number; healthy: boolean }

export async function fetchIndexStats(): Promise<MeiliIndexStatus[]> {
  const client = getAdminClient();
  const { data } = await client.query({
    query: gql`query { meiliIndexStats { index documents healthy } }`,
    fetchPolicy: 'no-cache',
  });
  return data.meiliIndexStats;
}
export async function reindex(scope: 'PRODUCTS' | 'CONTENTS' | 'ALL'): Promise<{ queued: boolean; contentsTriggered: boolean }> {
  const client = getAdminClient();
  const { data } = await client.mutate({ mutation: gql`mutation($scope: MeiliReindexScope!) { meiliReindex(scope: $scope) { queued contentsTriggered } }`, variables: { scope } });
  return data.meiliReindex;
}
```

（gql 导入与 client 用法照抄 coupon.ts 实际写法。）

- [ ] **Step 2: 页面 kb/index/index.vue**

骨架：`onMounted` 拉 `fetchIndexStats()` 展示卡片列表（索引名/文档数/健康点）；底部三个按钮：重建商品域 / 重建内容域 / 全部重建 → `uni.showLoading` + `reindex(scope)` + 成功 toast + 刷新。错误展示 graphQlErrorMsg。样式照现有列表页。文案全部走 i18n 词条（zh-Hans/en 双份）。

- [ ] **Step 3: pages.json 注册 + 本地构建**

```json
{ "path": "pages/kb/index/index", "style": { "navigationBarTitleText": "知识库索引" } },
```

Run: `cd d:\zhao\vshop\web-admin; npm run build:h5`
Expected: 构建成功。

- [ ] **Step 4: 部署 web-admin + 手机视口截图**

`node scripts/deploy.mjs`（vshop 仓库机制）。Playwright 390×844 dpr=2 截图：管理页看板 + 重建成功 toast，存 `docs/` 手册目录。

- [ ] **Step 5: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src && git -C d:\zhao\vshop commit -m "feat(web-admin): 知识库索引管理页"
```

---

### Task 11: 文档交付 + 收尾（提交/推送/部署收口）

**Files:**
- Create: `d:\zhao\docs\manual\meilisearch-kb\index.md`（操作手册：架构图、env 清单、密钥轮换、重建操作、故障排查：Meili 不可用降级、索引不同步排查顺序）
- Create: 领域手册 `docs/domains/search-kb.md`（概念模型/文件地图/坑：Strapi afterDelete 的 result 可能只有 id、vendure 取价口径、kb 索引按语言拆分原因）
- Modify: `d:\zhao\docs\superpowers\specs\2026-10-13-meilisearch-knowledge-base-design.md`（状态改为已交付）

- [ ] **Step 1: 写操作手册 + 领域手册（含 Task 6/9/10 的三张手机截图与冒烟脚本清单）**
- [ ] **Step 2: 全仓收尾提交推送**

```bash
git -C d:\zhao add docs && git -C d:\zhao commit -m "docs: MeiliSearch 知识库操作手册与领域手册"
git -C d:\zhao\vendure push; git -C d:\zhao\strapi push; git -C d:\zhao\vshop push; git -C d:\zhao push
```

- [ ] **Step 3: 更新 project_memory.md 速查卡指针（search-kb 领域手册路径 + 密钥位置）**

---

## Self-Review 记录

1. **Spec 覆盖**：§3 索引设计→Task 2/3/8；§4 vendure 插件→Task 2/4/5；§5 strapi 插件→Task 7/8；§6 查询接入→Task 1(nginx/key)；§7 web-admin→Task 10；§8 部署→Task 1/6/9；§9 错误处理→Task 4(重试)/9(e2e)；§10 测试交付→Task 3/9/10/11。C 端 UI 为 P2（计划头部已注明）。✅
2. **占位符**：Task 4 Step 2 标注「以仓库现有取价代码为准，照抄 priceMin 用法」与 Task 8 Step 1/2 的字段名实测步骤为「防映射错位的显式核对步骤」，其余均为完整代码。可接受（它们是核对动作而非留白）。⚠️→已用配置驱动映射器收窄改动面。
3. **类型一致性**：`KbDocument`（Task 2）↔ mapper 产出（Task 3）↔ strapi content-mapper（Task 8）字段对齐（id/type/sourceId/sourceSystem/url/channelId/status/tags/title/body/updatedAt/price/collectionIds/slug）；`MeiliReindexScope PRODUCTS|CONTENTS|ALL`（Task 5）↔ web-admin（Task 10）三按钮对齐。✅
