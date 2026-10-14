# MeiliSearch 统一知识库 · 操作手册

> 运维与开发操作指南：架构、配置、重建操作、故障排查
> 交付日期：2026-10-14（P1：知识库后端 + 管理面 + 查询 API；P2：nshop C 端搜索 UI）

---

## 目录

- [1. 架构总览](#1-架构总览)
- [2. 环境变量与密钥清单](#2-环境变量与密钥清单)
- [3. 日常操作](#3-日常操作)
- [4. 验证与回归脚本](#4-验证与回归脚本)
- [5. 故障排查](#5-故障排查)
- [6. 部署机制与注意事项](#6-部署机制与注意事项)
- [7. 页面截图](#7-页面截图)
- [8. C 端搜索 UI（P2，nshop）](#8-c-端搜索-uip2nshop)

---

## 1. 架构总览

```
                    ┌──────────────────────────────────────────┐
                    │        MeiliSearch v1.11.3 (服务器)        │
                    │   127.0.0.1:7700 · systemd 守护            │
                    │   索引: kb-zh / kb-en (双语各一)            │
                    └────────▲──────────────▲───────────────────┘
                             │ 直推          │ 直推
   ┌─────────────────────────┴───┐   ┌──────┴──────────────────────────┐
   │ vendure meilisearch-plugin  │   │ strapi zhao-search 插件          │
   │ 商品域: Product → KbDocument │   │ 内容域: article/faq/tutorial/    │
   │ JobQueue 全量 + EventBus 增量│   │ case/download → KbDocument       │
   │                             │   │ db.lifecycles 增量 + 启动全量     │
   └────────────▲────────────────┘   └──────▲──────────────────────────┘
                │ meiliReindex(CONTENTS)     │
                │ 服务间 HTTP (x-zhao-secret) │
   ┌────────────┴───────────────────────────┴──────────────────────────┐
   │  web-admin「知识库索引」管理页  https://e.joho.cn/guanli/#/pages/kb/index/index  │
   │  admin-api GraphQL: meiliIndexStats / meiliReindex(PRODUCTS|CONTENTS|ALL)      │
   └───────────────────────────────────────────────────────────────────┘

   查询侧: nginx /search-api/ 反代 → 127.0.0.1:7700 (仅 GET/POST，search key)
```

- **统一文档模型 KbDocument**：`{ id, type, sourceId, sourceSystem, url, channelId, status, tags, title, body, updatedAt, price?, collectionIds?, slug? }`
- `sourceSystem`: `vendure`（商品域）| `strapi`（内容域）；`type`: `product` | `article` | `faq` | `tutorial` | `case` | `download`
- 双语索引 kb-zh / kb-en：商品域每语言一份文档；内容域按 entry locale 归档（zh 系 → kb-zh，其余 → kb-en，文档 id 带 locale 后缀如 `article-xxx-zh`）

## 2. 环境变量与密钥清单

> 密钥值一律不落 git。master key 在服务器 `/etc/meilisearch/keys.env`（Meili systemd 使用），同时以 `MEILI_ADMIN_KEY` 形式存在于 vendure / strapi 的服务器 .env 中。

### 2.1 服务器 vendure（/www/apps/vendure/packages/dev-server/.env）

| 变量 | 说明 |
|------|------|
| `MEILI_HOST` | Meili 地址，`http://127.0.0.1:7700` |
| `MEILI_ADMIN_KEY` | Meili master key |
| `indexPrefix` / `locales` | 在 dev-config.ts 的 MeiliSearchPlugin.init 中（`kb` / `['zh','en']`），非 env |
| `ZHAO_SEARCH_REINDEX_URL` | **完整 URL**：`http://127.0.0.1:1337/v1/zhao-search/reindex`（vendure 收到 CONTENTS/ALL 重建请求时直 POST 此地址） |
| `ZHAO_SEARCH_SHARED_SECRET` | 与 strapi 侧一致的服务间密钥（x-zhao-secret 头） |
| `RUN_JOB_QUEUE=1` | **关键**：server 进程消费全部队列（当前生产无 worker 拓扑） |
| `PUBLIC_STOREFRONT_URL` | 商品文档 urlBase 来源 |

### 2.2 服务器 strapi（/www/apps/strapi/.env）

| 变量 | 说明 |
|------|------|
| `MEILI_HOST` | `http://127.0.0.1:7700` |
| `MEILI_ADMIN_KEY` | 同一 master key |
| `ZHAO_SEARCH_SHARED_SECRET` | 与 vendure 侧一致（管理路由鉴权；未配置时 reindex/health 一律 401） |

### 2.3 MeiliSearch 自身

- systemd unit：`/etc/systemd/system/meilisearch.service`；env 文件 `/etc/meilisearch/keys.env`（`MEILI_MASTER_KEY` / `MEILI_SEARCH_KEY`）
- 启动参数含 `--max-indexing-memory 128 MB`（2G 服务器内存保护）；版本 **v1.11.3**（受服务器 GLIBC 2.32 限制，不可盲升最新版）
- 搜索 key（只读、限 `indexes:kb-*`）供 C 端查询侧使用；nginx `/search-api/` 反代仅放行 GET/POST

### 2.3.1 C 端搜索 key 注入（P2，nshop）

nshop C 端使用**专用 key** `nshop-kb-c-end`（2026-10-14 用 master key 创建，uid `0c0a000a-deb1-45ae-80d1-b6af552ce3b8`）：只读、限 `indexes:kb-*`、actions `["search", "documents.get"]`。**必须含 documents.get**——/kb 详情页走 `GET /indexes/:uid/documents/:id` 直取文档（sourceId 不是 filterable，无法用 search+filter 代替）；Meili 内建的 Default Search key 只有 search 权限会 401。

| 变量 | 位置 | 说明 |
|------|------|------|
| `NUXT_PUBLIC_MEILI_SEARCH_KEY` | nshop **本地** .env（gitignored） | 构建期烧进 runtimeConfig.public，值为 `nshop-kb-c-end` 的 key。只读公钥随构建产物下发是既定路径；**不要**放服务器 REMOTE_DIR .env（deploy.mjs 每次部署 `rm -rf` 清空该目录） |
| `NUXT_MEILI_HOST` | nshop 构建期（默认 `http://127.0.0.1:7700`） | **SSR 直连通道**：生产 nitro 无 /search-api 路由，node 内相对路径 fetch 只会 404，服务端必须用绝对地址直连本机 Meili。useKbSearch 里回退用 `\|\|` 而非 `??`（runtimeConfig 缺失时是空串，nullish 合并不回退） |
| `MEILI_DEV_PROXY_TARGET` | nshop 本地 dev | devProxy /search-api 目标；默认 `https://www.youshop.cn/search-api`（走线上 nginx），本地调试可配 `http://127.0.0.1:7700`（配 ssh 隧道） |

重建该 key（遗失时）：

```bash
MK=$(grep MEILI_ADMIN_KEY /www/apps/vendure/packages/dev-server/.env | cut -d= -f2 | tr -d '"' | tr -d "'")
curl -s -X POST http://127.0.0.1:7700/keys -H "Authorization: Bearer $MK" -H "Content-Type: application/json" \
  -d '{"name":"nshop-kb-c-end","description":"nshop C-end kb search + document get (read-only kb-*)","expiresAt":null,"actions":["search","documents.get"],"indexes":["kb-*"]}'
```

### 2.4 密钥轮换

1. 生成新 master key → 更新 `/etc/meilisearch/keys.env` → `systemctl restart meilisearch`
2. 同步更新 vendure .env、strapi .env 的 `MEILI_ADMIN_KEY`
3. 如需换 `ZHAO_SEARCH_SHARED_SECRET`：vendure 与 strapi 两处 .env **同值同步**改，分别 `pm2 restart`
4. pm2 重启遵守错峰铁律（见 §6）

## 3. 日常操作

### 3.1 重建索引（管理页，推荐）

入口：web-admin → https://e.joho.cn/guanli/#/pages/kb/index/index

| 按钮 | scope | 行为 |
|------|-------|------|
| 重建商品域 | PRODUCTS | vendure 队列跑全量商品投影（JobQueue 异步） |
| 重建内容域 | CONTENTS | vendure 服务间 POST strapi `/v1/zhao-search/reindex`（strapi 全量同步 5 类内容） |
| 全部重建 | ALL | 两者都触发 |

重建为**异步入队**：提交后 toast「已提交重建」，稍候刷新页面看文档数变化。索引卡片显示每个索引的文档数与健康状态。

### 3.2 重建索引（命令行）

```bash
# admin GraphQL（token 用 Authorization: Bearer 传，勿用 vendure-auth-token 请求头）
curl -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"query":"mutation { meiliReindex(scope: ALL) { queued contentsTriggered } }"}'

# 直接触发 strapi 内容域全量（服务间密钥）
curl -X POST http://127.0.0.1:1337/v1/zhao-search/reindex \
  -H "x-zhao-secret: <ZHAO_SEARCH_SHARED_SECRET>"   # 服务器本机执行
```

### 3.3 增量同步（自动，无需人工）

- vendure：Product/ProductVariant 事件 → 队列 `meili-reindex-products` 单品同步；商品删除 → 直接清理文档
- strapi：5 类内容 afterCreate/afterUpdate/afterDelete → 单条同步/删除；**strapi 启动时自动跑一次全量**（失败仅记日志不阻塞启动）

## 4. 验证与回归脚本

| 脚本 | 覆盖 | 用法 |
|------|------|------|
| `d:\zhao\scripts\_meili_smoke.mjs` | 索引统计 + 商品域增量链路（改名→搜到→还原→搜回） | `ADMIN_P=<密码> node scripts/_meili_smoke.mjs` |
| `d:\zhao\scripts\_meili_e2e.mjs` | ① reindex 路由鉴权 ② meiliReindex(ALL) ③ strapi 生命周期增量 ④ 渠道 filter | `ADMIN_P=<vendure密码> STRAPI_ADMIN_EMAIL/STRAPI_ADMIN_P（见 §5.5）node scripts/_meili_e2e.mjs`；**四断言 2026-10-14 实测全绿** |

两脚本密钥/密码全走 env，不落文件。

## 5. 故障排查

### 5.1 排查顺序（索引不同步）

1. **Meili 本体**：`curl http://127.0.0.1:7700/health`（服务器本机）→ `systemctl status meilisearch`
2. **索引状态**：管理页卡片 / `meiliIndexStats`，或 `curl -H "Authorization: Bearer <key>" http://127.0.0.1:7700/indexes/kb-zh/stats`
3. **队列积压**：查 job_record（**列名是 camelCase**）：
   `SELECT id,"queueName",state,"isSettled" FROM job_record WHERE "queueName" LIKE '%meili%' ORDER BY id DESC LIMIT 12;`
4. **消费者活着吗**：vendure 日志应有 `Starting queue: meili-reindex-products`；确认 .env `RUN_JOB_QUEUE=1`
5. **具体 job 错误**：job_record 的 error 列；Meili 任务失败看 `POST /indexes/:uid/documents` 响应

### 5.2 Meili 不可用时的降级行为（设计保证，业务不受阻）

- vendure：插件启动 ensureIndexes 全 catch 降级，不阻塞启动；重建 job 失败自动重试（retries 5）
- strapi：syncOne/removeOne 全 catch 只记日志；内容写入不受影响；启动全量失败不影响启动
- 恢复后：商品域重跑一次「重建商品域」；内容域重跑「重建内容域」或等下次 strapi 重启自动全量

### 5.3 卡死 RUNNING job（硬 kill / OOM 残留）

消费者重启后**不会**拾取 RUNNING 状态的 job。症状：队列有积压但无新日志、文档数不涨。清理：

```sql
UPDATE job_record SET state='CANCELLED', "isSettled"=true, "settledAt"=now()
WHERE "queueName" LIKE '%meili%' AND state='RUNNING';
```

然后重新触发重建。

### 5.4 strapi 内容改了但索引没更新

- 内容类型必须在映射表内（article/faq/tutorial/case/download，uid 前缀 `plugin::zhao-website.`）
- 发布条件（三者同时满足）：`publishedAt` 非空 + `status='published'` + `deletedAt` 空 → 不满足会被移出索引
- 排查：strapi 日志 `[zhao-search] 已同步 <docId>` / `增量同步失败`；或直接跑「重建内容域」
- **软删场景兜底**：zhao-common 的全局软删过滤会让 db.update 收尾 findOne 读不到刚软删的行（`afterUpdate` 拿到 result=null），zhao-search 用 knex 直查兜底移除索引（bootstrap.ts `readDocumentIdRaw`，日志 `afterUpdate result 为空（软删过滤），按 documentId 移除索引 <docId>`）
- **document_id 匹配逻辑（易错点）**：`afterUpdate` 事件里 `event.params.where.id` 是**数字主键**（如 `6`），而表列 `document_id` 存的是字符串文档 ID（如 `bgkuluo2laen7oo7wh2w78o9`），两者语义不同、不可互配。raw 查询必须「主键列定位行 → 取 document_id 列」，表名/列名经 `strapi.db.metadata.get(uid)` 解析：

  ```js
  const meta = strapi.db.metadata.get(uid);                        // tableName + attributes 列名映射
  const pkColumn  = meta?.attributes?.id?.columnName || "id";              // 主键列（匹配 where.id）
  const docColumn = meta?.attributes?.documentId?.columnName || "document_id"; // 文档列（取值）
  const row = await strapi.db.connection(meta.tableName).where(pkColumn, id).first(docColumn);
  ```

  若误写成 `.where("document_id", id)`（用字符串列匹配数字主键），恒返回 `row=undefined`、兜底静默失效——即 2026-10-14 断言 ③ 故障的实锤根因。排查时看日志是否出现 `afterUpdate result 为空（软删过滤），按 documentId 移除索引` 即可判断兜底是否生效；异常路径会打 `raw 查询异常` 错误日志

### 5.5 已知遗留与凭据

- **strapi admin 凭据**：`admin@example.com` / `a963963`（2026-10-14 落定）。e2e 断言 ③ 已实测通过：创建 FAQ → kb-en 搜到 → 软删 → 搜不到（软删兜底见 §5.4）
- ~~**生产 strapi i18n 仅配置 en locale**~~ **已修复（2026-10-14 晚）**：zh-CN locale 已通过 admin API `POST /i18n/locales` 添加（DB 层 `i18n_locale` 表，isDefault=false；config/plugins.ts 既有 `defaultLocale: "zh-CN"` 声明不回写 DB，需 API/后台手工加）；geo-article 已纳入 CONTENT_MAP，kb-zh 内容域 4 条 GEO 文章（详见 §9）
- **FAQ 内容类型必填 site（关联 site-config）与 slug**：脚本/e2e 创建 FAQ 需先取 site-config 的 documentId 作为 site 关联
- **无 worker 拓扑**：当前生产 vendure 未跑 worker 进程（2G 内存限制），`RUN_JOB_QUEUE=1` 由 server 进程消费全部队列。**定时任务（ScheduledTask，runTasksInWorkerOnly=true）因此不会运行**——预留单超时释放/订单超时补偿等既有缺口，属本任务之前的状态，非本次引入
- **服务器 strapi 根 dist 的 plugins.js 注册段为手工注入**（服务器不 build 铁律的权宜）：下次本地全量 build 上传 strapi 根 dist 时自然带上 zhao-search 注册，届时此手工状态消失

## 6. 部署机制与注意事项

| 组件 | 机制 |
|------|------|
| MeiliSearch | systemd（服务器本地二进制），一般不动 |
| vendure | 服务器 `git pull` + `pm2 restart vendure` |
| strapi | 服务器 `git pull` + `pm2 restart strapi`（插件 dist 入库，pull 即生效） |
| web-admin | 本地 `node scripts/deploy.mjs`（vshop 仓库，scp 产物→服务器解压） |
| nginx | `/search-api/` 反代配置在 strapi 仓库 nginx/multi-site.conf |

**OOM 铁律（2G 服务器）**：strapi 启动峰值 ~490MB、vendure ~440MB，**绝不同时重启**。顺序：停 vendure → strapi 独立启动稳定（~60s）→ 起回 vendure → `pm2 save`。改 .env 后必须重启对应进程。**实测补充（2026-10-14）**：稳定共存后内存充裕（vendure ~395MB + strapi ~63MB + nshop ~125MB），危险窗口仅在两者启动期互相挤兑；若观察到 pm2 崩溃循环（uptime 仅数秒、↺ 快速增长、dmesg 大量 OOM kill），立即停 vendure 让 strapi 独启稳定后再回起。

## 7. 页面截图

- [01-stats-board.png](../shots/2026-10-14-meilisearch-kb/01-stats-board.png)：知识库索引看板（kb-zh/kb-en 各 78 文档、健康状态、三按钮）
- [02-reindex-toast.png](../shots/2026-10-14-meilisearch-kb/02-reindex-toast.png)：全部重建提交成功 toast
- Playwright 移动视口 390×844 @2x（780×1688）

## 8. C 端搜索 UI（P2，nshop）

> 交付日期：2026-10-14。nshop（Nuxt 3）方案 C 混合：搜索弹窗分组预览 + /search 结果页 + /kb 内容详情页，数据直取 Meili，**无新后端**。

### 8.1 页面与代码位置

| 入口 | 实现 | 说明 |
|------|------|------|
| 搜索弹窗（AppHeader 放大镜 / Ctrl+K） | `layers/base/app/components/SearchModal.vue` | 防抖 300ms、≥2 字符；商品组（type=product Top2，缩略图+价格）+ 知识组（type!=product Top3，徽标+高亮+日期）；底部「查看全部 N 条结果」进 /search |
| 结果页 `/search?q=` | `layers/base/app/pages/search.vue` | SSR 首屏；分段筛选（全部/商品/知识）+ 知识类型 chips + 加载更多（offset 追加）；robots 已 disallow |
| 内容详情页 `/kb/[type]/[id]` | `layers/base/app/pages/kb/[type]/[id].vue` | 文档 id 构造 `${type}-${documentId}-${zh\|en}`；徽标+更新时间+正文（\n 分段）+ 相关内容（同 type 最新 2 篇）；type=product 恒 404；definePageMeta key=fullPath 防 /kb 内跳转陈旧数据 |
| JD 风格 PC 顶栏搜索 | `components/home/jd/JdPcHeader.vue` | 同源迁移到 useKbSearch（原 GraphQL SearchProducts 下线） |
| 共用 composable | `composables/useKbSearch.ts` | useKbSearch（搜索）/ useKbDocument（单文档）/ kbFormatDate / kbTypeLabelKey / kbIndexFor |

已删除：`composables/useSimpleSearch.ts`（GraphQL SearchProducts 旧链路；gql 定义保留避免 codegen 波及）。

### 8.2 双通道请求（关键设计）

- **CSR**（弹窗/加载更多）：同源相对路径 `/search-api/` → nginx 反代 → 127.0.0.1:7700，`Authorization: Bearer <search key>`
- **SSR**（/search 首屏、/kb 详情、相关内容）：node 内相对路径 fetch 只会命中 nitro 自身（生产无 /search-api 路由 → 404），必须绝对地址直连 `NUXT_MEILI_HOST`（默认 `http://127.0.0.1:7700`，服务器本机回环）
- locale 归档：`zh* → kb-zh`，其余 → `kb-en`（与 strapi content-mapper 的 toIndexLocale 一致）
- 降级：key 缺失 / 网络错误 / 空词且无 filter（无界 browse 防护）一律返回空结果渲染空态，不抛错
- 高亮：Meili 原生 `attributesToHighlight: ['title','body']`（`<mark>` 包裹，`_formatted` 已转义可安全 v-html）+ `attributesToCrop: ['body']`（30 词摘片）；日期一律 `kbFormatDate` 手拼 YYYY-MM-DD（防 hydration mismatch）

### 8.3 i18n

- 新增 `messages.search.*`（24 词条：placeholder/分段/chips/空态/加载更多/相关内容/类型徽标等）+ `messages.kb.*`（2 词条）
- zh-CN / en-US 全译；其余 10 语言补英文文案（merge.ts zhFallbackLocale 深合并，缺失自动回退中文）
- 已知稀疏：~~生产 strapi 仅 en 内容 → kb-zh 内容域 0 文档~~ **已修复（2026-10-14，见 §9）**：kb-zh 现有 4 条 GEO 文章，zh 弹窗/搜索页知识组正常出内容

### 8.4 验证与截图

- 移动视口截图（Playwright 390×844 @2x，本地 dev + ssh 隧道取真实数据）：
  - [kb1-modal-zh.png](../shots/2026-10-14-kb-search-p2/kb1-modal-zh.png)：搜索弹窗分组预览（商品组 + 高亮 mark + 「查看全部 N 条结果」）
  - [kb2-search.png](../shots/2026-10-14-kb-search-p2/kb2-search.png)：/search 结果页（分段筛选 All/Products/Knowledge + 高亮卡片 + No more results）
  - [kb3-kb-detail.png](../shots/2026-10-14-kb-search-p2/kb3-kb-detail.png)：/kb/[type]/[id] 内容详情页（FAQ 徽标 + Updated 日期 + 正文 + Related content 排除自身；en 路线，zh 内容稀疏）
- 本地验收脚本：`python scripts/_shot_kb_search.py`（自动从 Meili 取真实关键词与文档；前置：ssh 隧道 7700 + 本地 dev；弹窗验证必须走 dev——本地 prod 预览无 devProxy，CSR /search-api 会 404）
- 本地冒烟断言（prod 预览）：/search?q=蓝牙 mark=2、/en/kb 详情 200 含标题、/kb/faq/伪id → 404、SPA 跳离 /search 无 dispose/mismatch 报错
- 部署后复测：线上弹窗预览 / /search 筛选 / /kb 直链与伪 id 404
- 既有 `scripts/_meili_e2e.mjs` 四断言不受影响（纯前端改动）

**顺手修复的既有缺陷（2026-10-14）**：`JdAllCategoryDrawer` 的 `<Teleport to="body">` SSR 直出导致全站 hydration mismatch（dev 下 /en 路由甚至整树重挂载白屏）→ 已包 `<ClientOnly>` 修复（抽屉默认关闭，零视觉影响）。另：/search 页 `useHead` getter 曾在 `q` 声明前引用（TDZ），会致 unhead entry 未创建、跳离页面时报 `Cannot read properties of undefined (reading 'dispose')`，已调整声明顺序。首页尚余 1 条既有 hydration mismatch（横幅轮播时变渲染，非 P2 范围，未动）。

### 8.5 部署（nshop）

1. 本地构建 `node scripts/deploy.mjs`（scp 产物 → 服务器解压 → pm2 restart；服务器绝不构建）
2. search key 随构建产物下发（本地 .env → runtimeConfig.public），**无需**服务器 .env
3. nginx `/search-api/` location 已在 P1 配好（www.youshop.cn.conf 443 server 块，仅 GET/POST）
4. 验证：`curl -X POST https://www.youshop.cn/search-api/indexes/kb-en/search -H "Authorization: Bearer <key>" --data-binary @body.json`（body 文件防 BOM：`[IO.File]::WriteAllText`，勿用 PS5.1 `Set-Content -Encoding utf8`）

---

## 9. kb-zh 内容域 0 文档修复（2026-10-14 晚）

### 9.1 三层根因（与表象差异）

表象「kb-zh 内容域 0 文档」，实际排查出**三层独立问题**：

| 层 | 问题 | 修复 |
|----|------|------|
| ① 内容源 | 生产内容域真实数据 = 9 条**已软删的测试 FAQ**（en，P1/P2 开发过程产生）+ **4 条活的 zh-CN GEO 文章**；article/tutorial/case/download 全为空表 | 测试 FAQ 连同 lnk 关联行物理删除；GEO 文章为真实业务内容，保留 |
| ② 映射缺口 | `zhao_website_geo_articles`（GEO 文章，zh-CN 原生）**不在 zhao-search 的 CONTENT_MAP**，从未入索引 | CONTENT_MAP 新增 `plugin::zhao-website.geo-article`（title/content/publishedAt/status/deletedAt/tags 全兼容，localized） |
| ③ locale 缺失 | strapi i18n DB 层仅 en（config 里 `defaultLocale: "zh-CN"` 声明**不会**回写 DB） | admin API `POST /i18n/locales {"code":"zh-CN","name":"中文 (简体)","isDefault":false}`（isDefault 为必填字段） |

修复后：**kb-zh = 78 商品 + 4 geo-article；kb-en = 78 商品（6 条测试 FAQ 索引残留同步清零）**。

### 9.2 全量重建语义升级：权威快照

原 `doFullReindex` 只 upsert 不删除——已软删/下架文档**永远滞留索引**（kb-en 里 6 条已删 FAQ 即此残留）。现改为**每类型先按 `type = "xxx"` filter 清空两索引旧文档再全量写入**（`POST /indexes/:uid/documents/delete`，Meili 异步 task 同索引 FIFO，「先删后写」语义成立）。重建即权威快照。

### 9.3 附带事故：strapi OOM crash loop 与错峰铁律

排查过程中 strapi 陷入 **OOM crash loop**（pm2 ↺ 6200+ 次，dmesg 连续 `Killed process (node) anon-rss ~460MB`）：1.87G 内存被 vendure(400MB)+nshop(147MB)+postgres(~400MB) 占满，strapi 启动到 ~460MB 必被 OOM killer 杀掉，且 strapi 启动 bootstrap 会自动跑一次 zhao-search 全量（内存雪上加霜），重启后再全量 → 恒死循环。

**恢复方法（实测有效）**：`pm2 stop strapi && pm2 stop vendure` → `pm2 start strapi` → 等 ~100s（「Strapi started successfully」+ health 401=fail-closed 活着）→ `pm2 start vendure` → 稳态共存（available ~225MB，无新 OOM）。**教训：绝不在 vendure 运行中启动 strapi**；日后扩容服务器内存是治本方案。

### 9.4 nshop C 端适配

- `kbTypeLabelKey` kebab→camel（`geo-article → typeGeoArticle`），保证 i18n 键合法
- 12 locale 补 `messages.search.typeGeoArticle` 词条；/search 知识类型 chips 增加 GEO 文章

### 9.5 验证

- reindex 返回：`{"ok":true,"counts":{"article":0,"faq":0,"tutorial":0,"case":0,"download":0,"geo-article":4},"errors":[]}`
- 索引 facet：kb-zh `{geo-article:4, product:78}`、kb-en `{product:78}`（faq 残留清零）
- C 端截图（Playwright 390×844 @2x，线上）：[kb1-modal-zh.png](../shots/2026-10-14-kb-zh-fix/kb1-modal-zh.png) / [kb2-search.png](../shots/2026-10-14-kb-zh-fix/kb2-search.png) / [kb3-kb-detail.png](../shots/2026-10-14-kb-zh-fix/kb3-kb-detail.png)

### 9.6 错峰重启脚本化 + crash-loop 防护（2026-10-14 晚落地）

> 9.3 的手工错峰流程已固化为脚本，并给 strapi 加了 pm2 防护参数。此后 **strapi 部署/重启一律走脚本，禁止 `pm2 restart strapi` 直拉**。

**① `scripts/safe-restart.sh`**（strapi 仓库，服务器 `/www/apps/strapi/scripts/`，git 分发）

```
停 vendure+nshop → strapi 以 ecosystem.config.cjs 为准重建（delete+start，参数随文件）
→ 轮询健康（1337 任意 HTTP 响应即通，production 下 /admin 404 不能作判据）
→ settle 90s（关键！见下）→ 回起 vendure（等 /admin-api GraphQL 应答）→ 回起 nshop → pm2 save
```

- **settle 的由来**：实测 strapi 端口 ~28s 就开始响应，但 bootstrap 全量索引继续灌内存、峰值 ~690MB 在其后。首次演练「健康即回起 vendure」被顶爆三连 OOM（strapi ↺ 至 4）。settle 90s 后端口响应+settle≈120s，与 9.3 的历史安全经验（独启等 100-110s）吻合。可用 `STRAPI_SETTLE=120 bash scripts/safe-restart.sh` 覆盖。
- **失败路径**：strapi 健康探测/settle 失败 → 保持 vendure/nshop 停止（避免回起再挤死 strapi），打印 `pm2 logs strapi --lines 30`，人工排查后 `pm2 start vendure nshop`。

**② crash-loop 防护**（`ecosystem.config.cjs`）

```js
min_uptime: 150000,            // 150s > strapi 启动 ~110s：启动期死亡判 unstable
max_restarts: 5,               // 连续 5 次 unstable 后 pm2 放弃重启（截断死循环）
exp_backoff_restart_delay: 10000,  // 重试退避 10s→20s→40s…
```

- **为什么原配置拦不住**：`max_restarts` 只计 unstable 重启（存活 < min_uptime）；默认 min_uptime=1s 时，strapi 每次活 ~100s 才被 OOM 杀 → 判 stable、计数清零 → max_restarts 形同虚设（曾 ↺ 6200+）。min_uptime 提到 150s 后 OOM 死亡全部计 unstable。
- 注意：pm2 监控的内存是 npm 父进程（~33MB），真实 strapi node 子进程（峰值 ~690MB）不在其视野内，故 `max_memory_restart` 实际不生效，防护靠 min_uptime/max_restarts。

**③ deploy.mjs 已接入**：重启步骤由 `pm2 restart strapi --update-env` 改为 `bash scripts/safe-restart.sh`（这也修掉了「部署即踩 OOM 坑」的隐患）。vendure/nshop 自身的部署重启不受铁律约束，勿混用脚本。

**④ 两轮演练实录（2026-10-14）**

*第一轮（失败，暴露 settle 缺失）*——脚本初版无 settle，六步流程自身全绿但埋雷：

```
1/5 停 vendure+nshop        → ✓
2/5 strapi 重建（ecosystem） → pid 47，↺ 归零
3/5 strapi 健康              → [OK] 耗时 28s   ← 此时 bootstrap 全量索引仍在灌内存！
4/5 回起 vendure            → [OK] 健康 54s（432MB）
5/5 回起 nshop + pm2 save   → [DONE]
```

约 1 分钟后 vendure(388MB) + strapi 内存爬坡(峰值 690MB) 顶穿 1.87G，strapi 被连续 OOM：

```
dmesg -T | grep "Killed process"          # 共 5 条，strapi ↺ 一路涨到 4
[Wed Oct 14 22:42:04 2026] Out of memory: Killed process 24491 (node) anon-rss:689704kB
[Wed Oct 14 22:42:32 2026] Out of memory: Killed process 25052 (node) anon-rss:485920kB
[Wed Oct 14 22:43:02 2026] Out of memory: Killed process 25610 (node) anon-rss:501396kB
[Wed Oct 14 22:43:32 2026] Out of memory: Killed process 26637 (node) anon-rss:389236kB
[Wed Oct 14 22:44:01 2026] Out of memory: Killed process 26755 (node) anon-rss:437504kB
```

**手工止血（= 正确时序）**：`pm2 stop vendure nshop` → `pm2 restart strapi` → 等 130s（strapi node 子进程 rss 393MB、available 667MB 回落）→ `pm2 start vendure`（55s 后 GraphQL OK）→ `pm2 start nshop && pm2 save` → 三进程 online 不再重启。基于此实测补上 settle 窗口（commit `460d3f978c`）。

*第二轮（settle 修正后，全绿）*——服务器 git pull → `bash -n` 语法校验通过 → `bash scripts/safe-restart.sh`：

```
=== 1/6 停 vendure + nshop（释放内存给 strapi 启动）===
  nshop stopped / vendure stopped
=== 2/6 重建 strapi（以 ecosystem.config.cjs 为准，含 crash-loop 防护参数）===
  delete pid 47 → start pid 48（27.3MB，↺ 0）
=== 3/6 等待 strapi 健康（最长 300s）===
  ..... [OK] strapi 健康（耗时 28s）
=== 4/6 settle 90s：等 bootstrap 全量索引内存峰值回落 ===
  内存: 1577MB used / 293MB available        ← 峰值已过，可安全回起 vendure
=== 5/6 回起 vendure ===
  pid 33647 → [OK] vendure 健康（耗时 145s 为脚本全局计时，vendure 实际等待 ~25s，432MB）
=== 6/6 回起 nshop + pm2 save ===
  nshop online 78.7MB；dump.pm2 已保存
[DONE] 错峰重启完成                          → Mem: 1630MB used / 240MB available
```

*成功指标（第二轮 + 回归，70s 后复测）*

| 指标 | 实测 | 判定 |
|------|------|------|
| strapi 重启次数 | 全程 `↺=0`（pid 48 稳定，uptime 4m+） | ✓ |
| strapi 健康探测 | 28s 通过（1337 任意 HTTP 响应判据） | ✓ |
| settle 后内存 | available 293MB（bootstrap 峰值已回落） | ✓ |
| vendure 健康 | /admin-api GraphQL `{"data":...}`，432MB 稳态 | ✓ |
| 新增 OOM（dmesg） | 演练后 0 条（最后一条 22:44:01 为第一轮尾巴） | ✓ |
| 索引幂等 | kb-zh 82（78 商品 + 4 GEO 文章）/ kb-en 78 | ✓ |
| C 端回归 | youshop.cn `/` 200、e.joho.cn admin-api 200 | ✓ |
| pm2 dump | 三进程配置已存 dump.pm2（reboot 可恢复） | ✓ |

