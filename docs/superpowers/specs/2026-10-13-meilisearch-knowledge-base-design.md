# MeiliSearch 统一知识库设计（Vendure + Strapi）

> 日期：2026-10-13
> 状态：**已交付**（2026-10-14，P1 全部 11 任务完成；C 端搜索 UI 为 P2 待做）
> 范围：vendure（新插件）、strapi（新插件 zhao-search）、web-admin（新页面）、服务器部署（MeiliSearch 服务）

## 1. 背景与目标

用 MeiliSearch 为 Vendure（商品域）与 Strapi（内容域）建设统一知识库：

- **站内统一搜索**：C 端（nshop/vshop/官网）、管理后台用一个搜索入口同时搜到商品与内容
- **AI 问答预留（RAG-ready）**：现阶段无大模型，先做关键词检索；文档结构预留向量检索升级路径，将来接 embedding 模型时开启 MeiliSearch hybrid search、重跑一次全量同步即可，不改架构

### 需求结论（已与用户确认）

| 项 | 结论 |
|---|---|
| 用途 | 站内搜索 + AI 预留，一步到位 |
| 内容源 | Vendure 商品域 + Strapi 内容域 + 知识点/结构化知识 + 其它业务域预留扩展 |
| 消费端 | C 端前台搜索、管理后台检索、AI 应用预留 |
| 租户 | 默认共享、按条件隔离（filter 实现，非物理分库） |
| 数据量级 | 万条以内（小规模） |
| 管理面 | **web-admin**（用户指定，不走 Strapi admin） |
| 服务器约束 | 2G 内存（剩余 buffer ~500M），MeiliSearch 限内存 ~200MB |

### 方案取舍

- **方案 A（采纳）：双侧插件直推**。Vendure 与 Strapi 各写一个小同步插件直推 MeiliSearch，查询经 nginx 直连；数据面去中心化，谁的数据谁同步，无跨系统拉数依赖，不新增常驻 Node 进程。
- 方案 B（否）：Strapi 集中网关——Strapi 成数据面单点，电商数据反向依赖内容平台。
- 方案 C（否）：Vendure 集中网关——知识库主体在 Strapi 却反依赖电商端，依赖方向别扭；Vendure 内存最紧张。

## 2. 总体架构

```
Strapi(zhao-search 插件)  ──推内容──┐
                                    ├──> MeiliSearch(统一知识索引) <──search── C端/后台/AI(nginx 直连)
Vendure(meilisearch-plugin) ─推商品─┘
web-admin「知识库索引」页 ─> Vendure admin API(meiliIndexStats/meiliReindex)
                              └─重建转发(shared secret)─> Strapi POST /zhao-search/reindex
```

## 3. 索引设计

### 3.1 索引拆分

**按语言拆索引**：`kb-zh`、`kb-en`（起步两语言，对齐多语言硬规范；新增语言加索引即可）。检索端按 locale 选 index，避免跨语言权重互相干扰。同步插件写入时按实体多语言字段拆分文档。

### 3.2 文档模型（schema-less，各类型字段兼容）

公共字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `{type}-{sourceId}`，全局唯一 |
| `type` | string | product / article / faq / tutorial / case / download / knowledge-entity / …（可扩展） |
| `sourceId` | string | 源系统主键 |
| `sourceSystem` | string | vendure / strapi |
| `url` | string | C 端落地页地址（动态 origin，禁止硬编码域名） |
| `channelId` | string | 租户/渠道（filterable，默认共享按条件隔离） |
| `status` | string | published / draft / disabled（只索引 published） |
| `tags` | string[] | 标签 |
| `title` | string | 标题（searchable，权重最高） |
| `body` | string | 正文/描述（searchable） |
| `updatedAt` | int | 时间戳（sortable） |

商品扩展字段：`price`（sortable）、`collectionIds`（filterable）、`slug`。

### 3.3 索引设置

- filterable：`type, channelId, status, tags, collectionIds`
- sortable：`updatedAt, price`
- searchableAttributes 权重顺序：`title > body > tags`
- 中文分词：MeiliSearch 内置 Jieba 级 CJK 分词，无需外挂

### 3.4 AI 预留（RAG-ready）

文档自带 `type/sourceId/channelId` 元数据，locale 由所属索引（kb-zh/kb-en）决定。将来接 embedding 模型时：

1. 开启 MeiliSearch hybrid search（文档补 `_vectors` 字段）
2. 两个插件各重跑一次全量同步
3. AI 应用直接用检索 API 取知识片段，无需改本设计结构

## 4. Vendure 侧：`packages/meilisearch-plugin`

- **增量同步**：监听 EventBus 的 Product/ProductVariant/Collection 变更事件 → upsert/删除对应文档
- **全量重建**：JobQueue 任务（带指数退避重试），不阻塞请求线程
- **admin-api 扩展**（admin schema）：
  - `meiliIndexStats: [MeiliIndexStatus]`——各索引文档数、最后同步时间、健康态
  - `meiliReindex(scope: MeiliReindexScope!)`——`PRODUCTS` 只重建商品域；`CONTENTS` 只以 shared secret 内部 HTTP 调 Strapi 管理路由重建内容域；`ALL` 两者都执行
- **配置**（env，动态注入，不硬编码）：`MEILI_HOST`、`MEILI_ADMIN_KEY`、`MEILI_SEARCH_KEY_PUBLIC`、`ZHAO_SEARCH_REINDEX_URL`、`ZHAO_SEARCH_SHARED_SECRET`
- 复用现有 custom-fields / 插件注册模式；MeiliSearch 不可用时事件入队等待重试，不丢数据

## 5. Strapi 侧：`plugins/zhao-search`

- **增量同步**：lifecycle 钩子（afterCreate/afterUpdate/afterDelete）覆盖 zhao-website（article/faq/tutorial/case/download）与 zhao-studio（knowledge-entity 等知识实体）内容类型
- **全量同步**：启动时幂等全量同步（类似 seed 机制），失败可重跑
- **管理路由**：
  - `POST /zhao-search/reindex`——shared secret 鉴权（header 校验），触发全量重建
  - `GET /zhao-search/health`——索引状态健康检查
- 不做 Strapi admin UI（管理面在 web-admin）

## 6. 查询接入

- nginx 反代：`https://<域名>/search-api/` → `127.0.0.1:7700`（仅内网回环，MeiliSearch 不暴露公网端口）
- 前端仅持有 **search key**（只读 + 可 filter）；master/admin key 永不出服务器
- 租户隔离：查询端拼 `filter: channelId = '<当前渠道>' AND status = 'published'`；「共享/隔离」由查询条件决定
- 多语言：前端按当前 locale 选 `kb-zh` / `kb-en`
- 消费方：nshop/vshop C 端搜索框与结果页、web-admin 全局检索、未来 AI 应用（程序化调用）

## 7. web-admin 管理页「知识库索引」

- **看板**：各索引文档数、最后同步时间、健康态（调 `meiliIndexStats`）
- **操作**：重建商品域 / 重建内容域 / 全部重建（调 `meiliReindex`）
- **认证**：复用现有 Vendure admin 登录态与权限体系，无新增认证
- 页面注册进 web-admin 路由，遵循现有多语言词条规范（zh/en 同步补齐）

## 8. 部署（2G 服务器）

- 服务器安装 MeiliSearch 官方二进制 + systemd 守护（非 pm2），监听 `127.0.0.1:7700`
- 内存限制：`--max-indexing-memory 128MB`、`MEILI_ENV=production`、`MEILI_MASTER_KEY` 设置、关闭 telemetry
- 内存预算：+180~250MB，落在剩余 ~500M buffer 内
- Rust 二进制无本地构建，符合「服务器不构建」铁律；配置变更即 `systemctl restart meilisearch`

## 9. 错误处理

- 同步失败：JobQueue 指数退避重试；Strapi 侧全量同步幂等可重跑；管理页可见失败状态
- MeiliSearch 不可用：查询端降级开关（C 端回退现有搜索/空态提示），不影响商品下单主链路
- 重建期间查询不中断（MeiliSearch 原子换索引）

## 10. 测试与交付

- e2e 验证脚本：增/删/改商品与文章 → 断言索引文档同步；租户 filter 隔离断言；中英文检索断言
- 手机视口截图（390×844 dpr=2）验证 C 端搜索框与结果页
- 操作手册 + 测试用例文档；领域手册沉淀（domains/search-kb.md）
- 交付物：vendure 插件、strapi 插件、web-admin 页面、nginx 配置片段、systemd unit、操作手册

## 11. 非目标（本次不做）

- 向量/embedding 实际接入（无大模型，仅预留结构）
- tenant token 动态签发（当前用 filter 即可，需要时再加）
- 搜索联想/热词运营功能
- Strapi admin 内的管理 UI
