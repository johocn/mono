# 领域手册 · 搜索知识库（search-kb）

> 面向开发者的领域速查：概念模型、文件地图、踩坑记录
> 关联操作手册：[docs/manual/meilisearch-kb/index.md](../manual/meilisearch-kb/index.md)

---

## 1. 概念模型

**统一知识库** = MeiliSearch 里的一组双语索引（kb-zh / kb-en），装着来自两个后端的同构文档。C 端/管理面将来用 `/search-api/`（nginx 反代 Meili）一个入口搜全部。

### 1.1 KbDocument（统一文档 schema）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 主键。商品：`product-<id>`；内容：`<type>-<documentId>-<locale>`（zh/en 后缀） |
| `type` | string | `product` \| `article` \| `faq` \| `tutorial` \| `case` \| `download` |
| `sourceId` | string | 源系统内 id |
| `sourceSystem` | string | `vendure` \| `strapi` |
| `url` | string | C 端跳转路径（商品 `/diy-custom-carrier` 风格 slug 路径由 urlBase 拼；内容 `/kb/<type>/<id>`） |
| `channelId` | string | 商品：第一个非默认渠道（`__default_channel__` 之外）id，无则 `'1'`；内容：恒 `'0'`（strapi 无租户字段） |
| `status` | string | `published` \| `draft`（仅已发布进索引，draft 用于删除判定） |
| `tags` | string[] | 商品域暂空；内容域取 zhao-tag 关系的 name |
| `title` / `body` | string | 检索主体（body 经 stripHtml 截 5000） |
| `updatedAt` | number | 毫秒时间戳（排序用） |
| 仅商品域 | | `price`（分）、`collectionIds`（string[]）、`slug` |

### 1.2 双语索引为什么按语言拆分

MeiliSearch 的 searchableAttributes 权重、排序规则是**索引级**的，单索引混双语会互相污染排序；按语言拆索引后查询侧按用户 locale 直查对应索引。内容域 zh 系 locale（zh-CN 等）归 kb-zh、其余归 kb-en——文档 id 带 locale 后缀因此必要（同一条内容的中英文版本是两个文档）。

### 1.3 同步拓扑（双侧直推）

- **vendure 侧**：JobQueue（`meili-reindex-products`）承载全量 + 单品；EventBus 订阅 ProductEvent（deleted 直删）/ ProductVariantEvent（取 productId 去重入队）。admin `meiliReindex(CONTENTS|ALL)` 通过 `triggerContentReindex()` 服务间 POST strapi 完整 URL（`ZHAO_SEARCH_REINDEX_URL`，带 `x-zhao-secret` 头，body `{}`，无路径拼接——配错路径不会自动补全）
- **strapi 侧**：`strapi.db.lifecycles.subscribe`（db 层，admin 后台编辑与 documents API 写入均触发）+ 启动 setImmediate 全量（幂等 upsert，失败不阻塞启动）
- 两端 MeiliService 同构（createIndex+settings 幂等 / upsert / delete-batch / stats / health），索引设置两端一致，互写不破坏 schema

## 2. 文件地图

### vendure（d:\zhao\vendure\packages\meilisearch-plugin\）

| 文件 | 职责 |
|------|------|
| `src/meili.service.ts` | Meili HTTP 客户端（req/ensureIndexes/upsert/delete/stats/health） |
| `src/product-document.mapper.ts` | `ProductProjection` → 按语言 `KbDocument[]`（纯函数，含取价/slug/collections） |
| `src/product-sync.service.ts` | 队列 process（syncOne/syncAll → projectAll 500/块）、enqueue、removeProduct、resolveChannelId/resolvePrice |
| `src/plugin.ts` | onApplicationBootstrap：initQueue → subscribeEvents → ensureIndexes（全 catch 降级）；adminApiExtensions |
| `src/admin-api/meili-admin.resolver.ts` | `meiliIndexStats`（Authenticated）/ `meiliReindex`（SuperAdmin + @Transaction） |
| `src/admin-api/schema.graphql` | MeiliIndexStatus / MeiliReindexResult / MeiliReindexScope(PRODUCTS\|CONTENTS\|ALL) |
| `dev-server/dev-config.ts` | MeiliSearchPlugin.init 注册（host/adminKey/indexPrefix/locales/reindexUrl/sharedSecret 全 env） |

### strapi（d:\zhao\strapi\plugins\zhao-search\）

| 文件 | 职责 |
|------|------|
| `strapi-server.js` / `strapi-admin.js` | **根级入口必须存在**，否则 strapi 5 加载器静默跳过插件 |
| `server/src/routes/admin-api.ts` | `type:'admin'` + `prefix:''` + `auth:false` → 挂载即声明路径 `/v1/zhao-search/{reindex,health}` |
| `server/src/controllers/admin-reindex.ts` | x-zhao-secret 校验（未配置 secret 时 fail-closed 全 401） |
| `server/src/services/meili.ts` | 同构 Meili 客户端（KbDocument 类型也在此） |
| `server/src/services/content-sync.ts` | fullReindex（分页 200/页，publishedAt+status+deletedAt 过滤）/ syncOne / removeOne，统一 catch 降级 |
| `server/src/content-mapper.ts` | CONTENT_MAP 配置驱动映射（字段实测自各 schema.json）、isPublishedEntry、documentIdsFor（删除候选双 locale） |
| `server/src/bootstrap.ts` | lifecycles 订阅 + 启动全量 |

### web-admin（d:\zhao\vshop\web-admin\src\）

| 文件 | 职责 |
|------|------|
| `apis/meili.ts` | fetchIndexStats / reindex(scope)，getAdminClient().request |
| `pages/kb/index/index.vue` | 索引看板 + 三按钮（pending 防重复、silent 刷新），i18n 词条 `kb.index.*` ×2 语言 |
| `locale/zh-Hans.json` `locale/en.json` | 词条同步硬规范 |

### 测试脚本（d:\zhao\scripts\）

`_meili_smoke.mjs`（商品域冒烟）、`_meili_e2e.mjs`（四断言 e2e）。

## 3. 踩坑记录（按痛感排序）

1. **admin API token 必须用 `Authorization: Bearer <token>`**：本项目 `tokenMethod: ['bearer','cookie','api-key']`，extractSessionToken 只认 cookie/Authorization/api-key 三种来源——`vendure-auth-token` 请求头**不被识别**（全程匿名 → 满屏 FORBIDDEN）。响应头名仍是 `vendure-auth-token`（取 token 从这取）
2. **JobRecord 表列名是 camelCase**：`"queueName"`/`"isSettled"`——按 snake_case 查会报 column not exist（本项目未开 snakeCase 命名策略）
3. **硬 kill 后 job 卡死 RUNNING**：SqlJobQueueStrategy 消费者重启**不拾取** RUNNING job（无 stale 重置），症状=队列积压零日志。清理 SQL 见操作手册 §5.3
4. **ProductVariant.price 是 @Calculated**：原始查询（relations/find）下恒 0，真实价格须读 `variants.productVariantPrices` 按 channelId 匹配取最低（照 vcash-pos-plugin 口径）
5. **Product 实体没有 collections 关联**：collectionIds 要从 `variants.collections` flatMap 去重
6. **strapi 5 插件必须有根级 strapi-server.js/strapi-admin.js**：缺了加载器**静默跳过**（无报错、路由 404，极难排查）
7. **strapi `type:'admin'` 路由的挂载路径**：router 级 `prefix: ''` 才能去掉默认的 `/{pluginName}` 前缀，最终路径=声明路径（`/v1/zhao-search/reindex`，无 /admin /api 前缀）
8. **strapi afterDelete 事件**：`event.result` 可能只有 id/documentId（批量删时几乎为空），要用 `event.params.where` 兜底取 id
9. **2G 服务器 OOM**：strapi 峰值 ~490MB、vendure ~440MB，同时重启必 OOM 循环；错峰法：停 vendure → strapi 独启 → 回起 vendure。MeiliSearch 只能装 v1.11.3（GLIBC 232 限制）
10. **生产无 worker 拓扑**：`RUN_JOB_QUEUE=1` 让 server 进程消费全部队列（零额外内存代价）；代价是 ScheduledTask（runTasksInWorkerOnly）不运行——既有缺口，部署拓扑变更时需一并规划
11. **web-admin 移动端截图规范**：Playwright 390×844 dpr=2；登录态注入 localStorage token 后再进 hash 路由
