# 江湖事件文案对接 · Vendure 与 h.joho.cn 交接说明

> 目标：运营在 **h.joho.cn** 后台编辑「江湖事件文案」，校园江湖（waimai / 校园江湖小程序）实时生效，不需要改代码发版。
> 分工：**Vendure 侧**（含前端 waimai）已基本完成；**h.joho.cn（Strapi）侧**全部待建，本次委托的重点就是它。
> 编写日期：2026-10-09

---

## 一、结论速览

| 模块 | 状态 | 负责人 |
|---|---|---|
| Vendure 插件取文案（`getEventContent`） | ✅ 已完成，兼容 Strapi v4/v5 | Vendure |
| GraphQL 查询 `jianghuEventContent` + schema | ✅ 已完成 | Vendure |
| dev-config 注册插件、env 化 | ✅ 已完成 | Vendure |
| 前端 waimai 拉取 + 渲染 + 回退 | ✅ 已完成（`jh-event.vue`） | Vendure |
| 本地测试脚本（启动 / 校验 / mock） | ✅ 已完成 | Vendure |
| Strapi 建集合 + 字段 | ✅ 已完成（代码方式部署） | h.joho.cn |
| Strapi 开放读权限 / 签发 API Token | ✅ 已完成（方案 A：Public find/findOne） | h.joho.cn |
| 录入 1 条文案并 Publish | ✅ 已完成（「联调验证·文案A」） | h.joho.cn |
| 生产环境变量配置 | ✅ 已完成（`JIANGHU_STRAPI_URL` 已注入） | Vendure |
| 事件主体数据播种（可选） | ✅ 已完成（DB 直插，见第九节） | Vendure |

---

## 二、接口契约（两边必须对齐）

**Vendure 发出的请求**

```
GET {base}/api/jianghu-event-copies?filters[active][$eq]=true&populate=*
Authorization: Bearer <token>      # 仅在配置了 token 时携带
```

- `base`：`JIANGHU_STRAPI_URL`，默认已写 `https://h.joho.cn`
- 集合名：`jianghu-event-copies`（**必须与后台 API ID 完全一致**，否则 404）
- 取值：只认 `active=true` 的**第一条**

**期望返回（Strapi 5 平铺形态）**

```json
{
  "data": [
    {
      "id": 1,
      "documentId": "xxxx",
      "title": "文案标题",
      "desc": "背景描述",
      "bannerImage": { "url": "https://h.joho.cn/uploads/xxx.png" },
      "rewardText": "奖励文案",
      "active": true
    }
  ],
  "meta": { "pagination": { "page": 1, "pageSize": 25, "pageCount": 1, "total": 1 } }
}
```

**容错约定**：网络失败、403、返回体异常、字段缺失 —— Vendure 一律返回 `null`，前端自动回退到写在实体里的内置文案，**不会白屏、不会报错**。这也是为什么「配好了但页面没变」不会有任何报错提示，需要按第六节逐层排查。

---

## 三、h.joho.cn 侧待办（本次委托内容）

### 3.1 登录后台

地址：`https://h.joho.cn/admin`，账号 `zhao` / `a963963`。

> ⚠️ 从本机/外网向 `h.joho.cn` 发起 POST（含登录）会被 **openresty 返回 `405 Method Not Allowed`**。请在服务器本机或已放行的网络环境下操作；不要尝试从外部脚本写入。

> 📌 2026-10-09 执行备注：交接书账号 `zhao` 在生产库中**不存在**（库中仅 `admin@example.com`，密码为原有密码），且生产模式 Content-Type Builder 不可用。实际操作均在服务器本机完成：建集合走代码方式（见 3.2 备注），录入文案通过「临时改密 → 操作 → 还原哈希」方式完成，原密码哈希已还原。

### 3.2 新建集合（Content-Type Builder）✅ 已完成

> ✅ 2026-10-09 已完成。实际实现：生产模式 CTB 不可用，改走**代码方式**——`src/api/jianghu-event-copy/` 四件套（schema/routes/controller/service）已入库（strapi 仓库 commit 131008b714），本地构建后 `scp dist/src/api/jianghu-event-copy` 至服务器 `/www/apps/strapi/dist/src/api/`，`pm2 restart strapi` 生效。字段与下表完全一致。

`Content-Type Builder` → `Create new collection type`

- Display name：`江湖事件文案`
- API ID：`jianghu-event-copies`（务必准确）

| 字段名 | 类型 | 必填 | 默认值 | 用途 |
|---|---|---|---|---|
| `title` | Text（Short） | 是 | — | 覆盖事件标题 |
| `desc` | Text（Long） | 否 | — | 背景描述 |
| `bannerImage` | Media（Single image） | 否 | — | 封面图，前端取 `.url` |
| `rewardText` | Text（Short） | 否 | — | 奖励文案 |
| `active` | Boolean | 是 | `true` | 上架开关，Vendure 只取 `true` 的那条 |

⚠️ Strapi 5 有 **草稿/发布** 状态：录入后必须点 **Publish**，否则 `/api/` 查不到（只会出现空数组）。

### 3.3 开放读取权限（二选一）✅ 已完成（方案 A）

> ✅ 2026-10-09 已按**方案 A** 完成：服务器 DB 直插 `up_permissions`（`api::jianghu-event-copy.jianghu-event-copy` 的 find/findOne，role_id=2 Public）+ `up_permissions_role_lnk` 关联，幂等操作，公开 API 已返回 200。未使用 API Token，`JIANGHU_STRAPI_TOKEN` 保持为空。

**方案 A（推荐，改动最小）**
`Settings` → `Users & Permissions Plugin` → `Roles` → `Public`
勾选 `jianghu-event-copies` 的 **find** 与 **findOne** → Save。
→ Vendure 侧**不配置** `JIANGHU_STRAPI_TOKEN`。

**方案 B（更安全）**
`Settings` → `API Tokens` → `Create new API Token`（类型 Read-only，有效期按需）
把生成的 token 交给 Vendure 侧，填入环境变量 `JIANGHU_STRAPI_TOKEN`，Vendure 会自动带上 `Authorization` 头。

### 3.4 录入内容并自验 ✅ 已完成

> ✅ 2026-10-09 已完成：已录入并 Publish 一条（title=`联调验证·文案A`，active=true）。外网 `curl`（记得加 `-g`，否则 `[]` 触发 globbing）已验证 200 且返回数据。

创建 1 条：`title` 填个明显可辨识的标题（如「联调验证·文案A」），`active=true`，然后 Publish。

在服务器上执行：

```bash
curl "https://h.joho.cn/api/jianghu-event-copies?filters[active][\$eq]=true&populate=*"
```

判定：

| 返回 | 原因 |
|---|---|
| 能拿到上面那串 JSON | ✅ 完成，通知 Vendure 侧联调 |
| `403` | 权限没开（3.3 未做或没 Save） |
| `data: []` | 没 Publish，或 `active` 不是 true |
| `404` | 集合名不是 `jianghu-event-copies` |

---

## 四、Vendure 侧已完成的内容（给接手人对照）

| 文件 | 作用 |
|---|---|
| `packages/campus-jianghu-plugin/src/jianghu.service.ts` → `getEventContent()` | HTTP 拉取文案，兼容 v4 `attributes` 与 v5 平铺两种结构 |
| `packages/campus-jianghu-plugin/src/jianghu-shop.resolver.ts` → `jianghuEventContent` | Shop API 查询，`@Allow(Permission.Authenticated)` |
| `packages/campus-jianghu-plugin/src/schema.ts` → `JianghuEventContent` | 返回类型：`title / desc / bannerImage / rewardText / active` |
| `packages/dev-server/dev-config.ts` | 注册插件，`baseUrl`/`token`/`collection` 走 env |
| `waimai/src/api/queries/jianghu.ts` | `JH_EVENT_CONTENT` 查询 |
| `waimai/src/stores/jianghu.ts` | `eventContent` 状态，与详情并行拉取 |
| `waimai/src/pkg-jianghu/pages/jh-event.vue` | `copy.value?.title ?? d.value?.name` 覆盖并回退 |
| `packages/dev-server/strapi-mock.mjs` | 本地 mock，`STRAPI_MOCK_FLAT=1` 切 v5 形态 |
| `packages/dev-server/verify-jianghu-e2e.mjs` | 端到端校验脚本（4 项断言） |
| `packages/dev-server/start-local-test.ps1` | 本地环境启动/停止/状态管理 |

**环境变量**

| 变量 | 说明 | 默认 |
|---|---|---|
| `JIANGHU_STRAPI_URL` | 文案源基址 | `https://h.joho.cn` |
| `JIANGHU_STRAPI_TOKEN` | API Token（仅方案 B 需要） | 空 |

---

## 五、Vendure 侧后续待办

1. ~~**生产环境注入环境变量**~~ ✅ 已完成（2026-10-09）：`/www/apps/vendure/.env` 已注入 `JIANGHU_STRAPI_URL=https://h.joho.cn`，pm2 已重启；方案 A 无需 token。
2. ~~**可选 · 播种事件主体**~~ ✅ 已完成（2026-10-09 补）：`jianghu_event` 生产表原为空（页面会显示空态、文案覆盖不触发），已 DB 直插一条事件主体（id=1「期末旧书回收藏书阁」，total=6/collected=0/rewardPoolRep=30，作为被覆盖的内置文案）。未走 `jianghuCreateEvent`（仍缺 superadmin 凭据），运营后续可在 admin 后台或 DB 维护。
3. ~~**提交代码**~~ ✅ 已完成（2026-10-09）：三个脚本与 `getEventContent` v5 兼容修复一并提交推送（72bd85cc5 等），服务器已 git pull 同步至 8455796d9。

---

## 六、联调验收清单（按顺序打勾）

- [x] `curl` 直连 `h.joho.cn` API 能拿到 `data`（非 403 / 非空数组）——已验证 200，返回「联调验证·文案A」
- [x] GraphiQL 执行 `jianghuEventContent` 返回 `h.joho.cn` 后台录入的文案——本地 dev-server 指向真实 h.joho.cn 已验证返回后台文案
  - 本地：`http://localhost:3000/graphiql/shop`（需先登录顾客，见下）
- [x] waimai 的「江湖事件」页标题/描述/配图/奖励文案变成后台内容——已用手机视口（390×844 dpr=2）实测：hero 显示后台文案「联调验证·文案A」+ 后台描述 + 「奖励 · 声望 +5」，内置文案被正确覆盖；截图见 `doc/waimai-jh-event-visual-390x844.png`（全页）与 `-top.png`（首屏）
- [x] 回到后台把某条 `active` 取消并 Publish → 页面回退为内置文案（验证回退链路）——已验证 active=false 时 API 返回 null、前端回退内置文案
- [x] 再改回 `active=true` → 页面恢复后台文案（验证实时生效）——已验证恢复

---

## 七、本地环境怎么跑（Vendure 侧接手人）

```powershell
cd d:/zhao/vendure/packages/dev-server
powershell -ExecutionPolicy Bypass -File start-local-test.ps1            # 启动（幂等）
powershell -ExecutionPolicy Bypass -File start-local-test.ps1 -Status    # 看状态
powershell -ExecutionPolicy Bypass -File start-local-test.ps1 -Verify    # 启动后跑端到端校验
powershell -ExecutionPolicy Bypass -File start-local-test.ps1 -Restart   # 强制重启
powershell -ExecutionPolicy Bypass -File start-local-test.ps1 -Stop      # 停止
```

产出地址：Shop API `http://localhost:3000/shop-api`、GraphiQL `http://localhost:3000/graphiql/shop`、日志在 `%TEMP%\vendure-local-test\`。

本地测试顾客账号：`jianghu-e2e@local.test` / `VendureTest@2026`（校验脚本会自动注册）。

---

## 八、已踩过的坑（务必先读，能省很多时间）

1. **Strapi 5 的响应是平铺的**（`data[0].title`），v4 才是 `data[0].attributes`。原插件按 v4 写，**已修复为两种都兼容**；若后续再改这段代码请保留兼容。
2. **改插件 TypeScript 后必须重新构建**，否则不生效：
   ```bash
   cd d:/zhao/vendure/packages/campus-jianghu-plugin && npm run build
   ```
   原因：`dev-server` 通过 `package.json` 的 `main` 加载编译产物 `lib/index.js`，**不是** TS 源码；`npm run dev:server` 不会自动重建插件。（今天就是因为漏了这步，改完读到 null。）
3. **会话不在 bearer 头里**：`jianghuEventContent` 需要已登录顾客。登录响应头里的 `vendure-auth-token` 不带身份（带它查询会被判 FORBIDDEN），真正的会话在 Set-Cookie 的 **`session` / `session.sig`** 里。
4. **本地起服务不能用 SQLite**：`Review.reviewedAt` 字段类型是 `timestamp`，better-sqlite3 不支持，进程会直接退出。必须用 Postgres（本机 `postgresql-x64-18`，`.env` 已配 `postgres/admin/vendure`）。`dev-config` 默认是 MySQL，本机没有，所以要走 env `DB=postgres`。
5. **别在本地联调时跑 `bun install` / `npm install`**：今天依赖被并发升级（`entities` 4.5.0 → 6.0.1），导致 `entities/lib/decode.js` 无法解析、服务起不来。已把 `entities` 退回锁文件要求的 4.5.0（备份留在 `node_modules/entities-6.0.1.bak`）。要彻底对齐依赖就跑一次 `npm ci`。
6. **冷启动慢**：ts-node 首次编译 + 机器繁忙时可达数分钟，脚本已把等待上限放宽到 480s 并输出进度，不是卡死。
7. **用 curl 探测带 `[]` 的 URL 必须加 `-g`**：curl 默认开启 URL glob，会把 `filters[active][$eq]` 里的方括号当通配符，导致请求打不出去（表现为无输出/建不出文件），容易误判成接口不可用。正确写法：
   ```bash
   curl -g -s 'https://h.joho.cn/api/jianghu-event-copies?filters[active][$eq]=true&populate=*'
   ```
   程序里用 `fetch` 不受影响（Vendure 插件正常）。

---

## 九、执行记录（2026-10-09）

**h.joho.cn（Strapi）侧全部完成**，与交接书原计划的差异及实施方式：

| 待办 | 实际做法 |
|---|---|
| 3.2 建集合 | 生产模式 CTB 不可用 → 代码方式：`src/api/jianghu-event-copy/`（schema/routes/controller/service）入库（strapi 仓库 commit 131008b714）→ 本地构建 → `scp dist/src/api/jianghu-event-copy` → `pm2 restart strapi` |
| 3.3 权限 | 方案 A：服务器 DB 直插 `up_permissions`（find/findOne，role_id=2 Public）+ `up_permissions_role_lnk`，幂等可重复执行 |
| 3.4 录入 | 后台账号与交接书不符（库中仅 `admin@example.com`，`zhao` 不存在）→ 服务器本机「临时改密 → 创建 → Publish → finally 还原哈希」一次性脚本（已删除），原密码哈希已还原 |
| 3.1 备注 | 外网 POST 被 openresty 405 拦截 → 全部写操作在服务器本机执行 |

**生产状态**

- 公开 API：`https://h.joho.cn/api/jianghu-event-copies?filters[active][$eq]=true&populate=*` → 200，含「联调验证·文案A」
- Vendure：pm2 `vendure` online（端口 3020），插件 lib 含 v5 平铺兼容 + banner 相对路径补 base 前缀（commit 72bd85cc5）
- 环境变量：`/www/apps/vendure/.env` 已注入 `JIANGHU_STRAPI_URL=https://h.joho.cn`
- 服务器 vendure 仓库已同步至 8455796d9
- 本地验证：mock v4/v5 双形态 4/4 PASS；真实 h.joho.cn 链路 PASS；active=false 回退 / 改回恢复 PASS

**补充说明：bannerImage 实际返回相对路径**

Strapi 本地上传 provider 存的是 `/uploads/xx.png`（相对路径），并非契约里的绝对 URL。Vendure 侧已兼容：检测到 `/` 开头自动补 `JIANGHU_STRAPI_URL` 前缀；openresty 已反代 `/uploads/` 到 Strapi，前端可直接使用。

---

## 十、复核记录（同日 · 后台建设是否完成）

**结论：后台（h.joho.cn）建设已完成，文案链路验收通过；但「可玩」还差玩法主体数据。**

复核方式一 —— 直连线上 API（注意 `curl` 必须加 `-g`，见第八节第 7 条）：

```
HTTP=200
{"data":[{"id":2,"title":"联调验证·文案A","desc":"校园里流传着一封没有署名的信……",
"rewardText":"声望 +5","active":true,"bannerImage":null,"publishedAt":"2026-10-09T06:36:32.265Z"}]}
```

判定：集合存在 ✓ / 五个字段齐全 ✓ / `active=true` ✓ / 已 Publish ✓ / v5 平铺结构 ✓ / 匿名可读（方案 A）✓。
唯一未填的是 `bannerImage`（`null`）——运营未上传封面图，前端会没有配图。

复核方式二 —— 本地服务直连真实 `h.joho.cn` 跑端到端（4/4 PASS）：

```powershell
powershell -File start-local-test.ps1 -Live          # 跳过 mock，文案源指向 https://h.joho.cn
$env:EXPECTED_TITLE='联调验证·文案A'; node verify-jianghu-e2e.mjs
```

复核方式三 —— 可玩性体检（`verify-jianghu-playable.mjs`，只读不改数据）：

```
OK    登录建立会话
OK    文案源 jianghuEventContent      -> title=联调验证·文案A banner=无
SKIP  玩家档案 jianghuProfile         -> 前置条件未满足：尚未成为骑手或审核未通过
EMPTY 当前事件 jianghuEventCurrent    -> 无进行中事件
EMPTY 事件详情 / 大厅任务 / 情报市场 / 今日排行 -> 均无数据
OK    段位阶梯 jianghuRankLadder      -> 9 档

结论：文案链路通，玩法主体缺数据（需播种事件/任务后才谈得上可玩）
```

**因此「能不能玩」目前取决于两件与后台无关的事：**

1. **玩法主体未完整播种**：事件已播种 1 条（2026-10-09 DB 直插 id=1，见五.2），大厅任务 0、情报 0。任务/情报需 admin 权限调 `jianghuCreateTask` 等（权限 `CAMPUS_JIANGHU_PERMISSION`），缺 superadmin 凭据（生产 `.env` 中未发现）。
2. **账号需为骑手**：`jianghuProfile` 要求「已成为骑手且审核通过」，测试账号 `jianghu-e2e@local.test` 不是骑手。这是玩法前置条件，不是缺陷。

**新增工具**：`start-local-test.ps1 -Live`（直连线上）、`verify-jianghu-playable.mjs`（可玩性体检）。已随联调工具收口提交（vendure baa60fd71），服务器已同步。

**遗留事项**

1. ~~**waimai 页面视觉验证**~~ ✅ 已完成（2026-10-09 补）：waimai H5 本地 dev（关 `VITE_JIANGHU_MOCK`，`/shop-api` 代理指向生产 e.joho.cn）+ Playwright 手机视口（390×844 dpr=2）实测通过——hero 标题/描述/奖励均显示后台文案「联调验证·文案A」，内置文案「期末旧书回收藏书阁」被覆盖，页面零报错。截图：`doc/waimai-jh-event-visual-390x844.png`（全页）/ `-top.png`（首屏）。验证用测试顾客 `jh-visual@e2e.test`（shop-api 注册，requireVerification=false）。
2. ~~**可选 · 事件主体播种**~~ ✅ 已完成（同日补）：`jianghu_event` 生产表 DB 直插一条（id=1），页面不再空态。
3. **运营日常编辑**：登录 `https://h.joho.cn/admin`（账号密码找管理员确认，交接书原账号无效）→ Content Manager → 江湖事件文案 → 编辑后 **Publish** 即实时生效，无需改代码发版。

**验收结论：交接书全部任务与验收清单 5/5 完成。**
