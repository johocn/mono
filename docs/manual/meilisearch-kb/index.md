# MeiliSearch 统一知识库 · 操作手册

> 运维与开发操作指南：架构、配置、重建操作、故障排查
> 交付日期：2026-10-14（P1：知识库后端 + 管理面 + 查询 API；C 端搜索 UI 为 P2）

---

## 目录

- [1. 架构总览](#1-架构总览)
- [2. 环境变量与密钥清单](#2-环境变量与密钥清单)
- [3. 日常操作](#3-日常操作)
- [4. 验证与回归脚本](#4-验证与回归脚本)
- [5. 故障排查](#5-故障排查)
- [6. 部署机制与注意事项](#6-部署机制与注意事项)
- [7. 页面截图](#7-页面截图)

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
- **生产 strapi i18n 仅配置 en locale**（暂无 zh-CN）：内容域 zh 文案待补 locale，e2e 断言 ③ 走 en 内容（归档 kb-en，链路等价）；后续补 zh-CN locale 无需改代码
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
