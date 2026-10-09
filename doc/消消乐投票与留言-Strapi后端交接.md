# 消消乐「最受欢迎投票 + 留言建议」后端交接书

> 面向对象：Strapi（h.joho.cn）后端开发同事
> 前端状态：**代码已完成并构建通过**，投票与留言的写入链路**零后端改动即可工作**（复用现有 `zhao-website` 插件）。
> 本文档说明「前端已经做了什么」「后端还需要做什么」「域名怎么配」。

---

## 一、功能与现状

长辈在「认知中心」可以看到两个新入口：

| 入口 | 玩法 | 数据落点（Strapi content-type） |
|---|---|---|
| 🏆 最受欢迎 | 问卷页**单选**「最喜欢的一款」；单个玩法页可各自**点赞**（可多选） | `zhao-website.interaction`（`type=like`） |
| 💬 留言建议 | 昵称（可不填）+ 留言内容 | `zhao-website.lead`（后台「线索/留资」） |

前端实现落在 `d:/zhao/xiaoxiaole`：

- `src/core/CommunityApi.ts` —— 接口层（匿名 visitorId、点赞、单选、留言、排行榜预留）
- `src/scenes/VoteScene.ts` —— 统一问卷页
- `src/scenes/MessageScene.ts` —— 留言页
- `src/scenes/LevelSelectScene.ts` —— 单个玩法页的点赞按钮
- `src/scenes/BrainCenterScene.ts` / `src/Main.ts` —— 入口与路由

### 用到的两个既有接口（无需后端改动）

**1）投票 / 点赞**

```http
POST https://h.joho.cn/api/zhao-website/v1/interactions/track?domain=game.yourbao.cn
Content-Type: application/json

{
  "type": "like",
  "targetType": "game-favorite",   // 问卷页单选；单页点赞用 "game"
  "targetId": "memory",            // 玩法 id，见下
  "visitorId": "<本地生成的匿名 UUID>"
}
```

返回 `{"success":true,"action":"created"|"removed"}`。
同一 `(site + type + targetType + targetId + visitorId)` 再调一次即**取消**（toggle），因此天然去重、可改选。

`targetId` 取值（11 个玩法，固定业务键）：

```
match3  audio  poetry  corsi  face  memory  stroop  money  pm  clock  nostalgia
```

**2）留言**

```http
POST https://h.joho.cn/api/zhao-website/v1/leads/submit?domain=game.yourbao.cn
Content-Type: application/json

{
  "type": "contact",
  "contactName": "李阿姨",        // 可为空
  "message": "想加个戏曲玩法",
  "sourceType": "game",
  "sourceId": "xiaoxiaole",
  "sourceUrl": "https://game.yourbao.cn/tour/xxl/"
}
```

返回 `{"success":true,"id":"<documentId>"}`。

> ⚠️ **不要提交 `website` 字段**——那是后端 honeypot，填了会被静默丢弃（前端已确认未提交）。

---

## 二、后端待办（按优先级）

### P0（必做，不做会投错数据）：新建 `site-config`，domain = `game.yourbao.cn`

**这是本次唯一必须先做的配置。**

原因：留言/投票的归属站点由 `zhao-common` 的 `site-resolver` 中间件解析，顺序是
`query.domain` → `x-site-domain` 头 → `Host`。
我在 `d:/zhao/strapi` 全仓库搜索 `game.yourbao.cn` **零命中**，判断该站点记录尚未建立。

**风险不是报错，而是静默投错**：`site-resolver` 解析不到时会回退到「数字 id 最小的站点」，
请求照样返回成功，但数据进了别人的站点——这类问题极难发现。

请执行：

1. Strapi 后台（或 SQL）新增站点配置，`domain` 字段**精确填** `game.yourbao.cn`
   （不带 `https://`、不带路径、不带端口；该字段 `unique`）
2. 用下面的命令自检，确认返回的不是「最小 id 的兜底站点」：

```bash
curl "https://h.joho.cn/api/zhao-website/v1/site-info?domain=game.yourbao.cn"
```

---

### P1（排行榜依赖）：新增投票统计接口

**现状**：`zhao-website` 的公开路由**只有 `POST /interactions/track`，没有任何 GET 统计接口**
（我已核对 `plugins/zhao-website/server/src/routes/content-api.ts` 全表）。
因此前端**不造假数据**，问卷页目前显示「大家的选择正在统计中」。

**需要后端补一个公开统计接口**，建议新增（**请勿复用 zhao-track**，避免污染营销 A/B 数据）：

```http
GET /api/zhao-website/v1/interactions/stats?domain=game.yourbao.cn&targetType=game-favorite
```

建议返回（前端已按此结构写好解析，见 `CommunityApi.fetchRanking`）：

```json
{
  "data": [
    { "targetId": "memory",  "count": 128 },
    { "targetId": "nostalgia", "count": 96 }
  ]
}
```

要求：
- `auth: false`，走 `publicRoute`（与 `leads/submit` 同款）
- 支持 `targetType=game`（点赞榜）与 `game-favorite`（最喜欢榜）两种

**好消息：工作量比想象小——服务层已有现成方法，只是没公开路由**（见
`plugins/zhao-website/server/src/services/interaction.ts`）：

| 已有方法 | 作用 | 状态 |
|---|---|---|
| `stats(siteId, targetType, targetId)` | 按 `deletedAt: null` 统计某 target 的 like/collect/share 数 | 无公开路由 |
| `check(siteId, params)` | 查某访客是否已互动，返回 `{liked:boolean}` | 无公开路由 |

所以主要工作是**加路由并做聚合**，统计逻辑不必重写。

⚠️ **两个实现要点（会影响票数正确性）**：

1. **取消是「软删除」，不是物理删除**——`toggle()` 取消时把 `deletedAt` 置为当前时间。
   因此统计**必须过滤 `deletedAt: null`**，否则用户改选/取消过的票仍会被算进去，票数虚高。
2. **现有 `stats()` 只统计单个 `targetId`**，而排行榜需要的是「同 `targetType` 下按 `targetId` 分组」的列表。
   请新增一个聚合方法（group by `targetId`），或在新路由里对 11 个 `targetId` 循环调用现有 `stats()`。

**后端就绪后，前端只需把 `CommunityApi.ts` 里的 `RANKING_PATH` 常量填上该路径，排行榜即自动生效、无需改 UI。**

---

### P2（运营支撑）：后台查看与导出

请同步告诉运营同事：

- 留言 → 后台 `zhao-website` 的**「线索 / lead」**里看，`type=contact`，内容在 `message`，来源标记 `sourceType=game` / `sourceId=xiaoxiaole`
- 投票 → 后台 `zhao-website` 的**「interaction」**里看，按 `targetType` 过滤
- 建议在后台加一个按 `targetId` 聚合的视图，便于直接看「哪款游戏最受欢迎」

---

## 三、关于「直连 h.joho.cn 是否可行、是否需要走 v.joho.cn」

### 结论：**可行，且推荐直连 h.joho.cn，不需要走 v.joho.cn，也不需要改域名。**

依据（已核对服务器配置）：

1. **两者是同一个 Strapi 实例**
   `v.joho.cn` 的 nginx 配置（`d:/zhao/v_joho_cn_nginx.conf`）中：

   ```
   location /api/ { proxy_pass http://127.0.0.1:1337/api/; }
   ```

   与 `h.joho.cn` 一样，都是反代到**本机同一个 Strapi（127.0.0.1:1337）**，同一套代码、同一个库。
   `v.joho.cn` 只是「课程内容」的另一个**前端入口域名**（其 `root` 指向 `/www/sites/v.joho.cn/index` 静态站），
   `/api/` 落到同一个后端。所以调用哪个域名取到的数据完全一致。

2. **站点归属与「调哪个域名」无关，只与 `domain` 参数有关**
   这是最容易误解的一点：即便走 `v.joho.cn`，如果不传 `domain=game.yourbao.cn`，
   站点仍会被解析成 `v.joho.cn` 自己的站点（或兜底站点）。
   **前端已在每次请求强制拼接 `?domain=`，所以走哪个域名都不影响正确性**——
   选 `h.joho.cn` 只是为了与现有营销统计（`MARKETING_API_BASE`）共用同一宿主，少配一个变量。

3. **CORS 已放通，跨域可直连**
   `d:/zhao/strapi/config/middlewares.ts` 中 `strapi::cors` **未限制 origin**（默认放行），
   且 `headers` 已包含 `Content-Type`、`x-site-domain`，因此 `game.yourbao.cn` 的页面
   跨域请求 `h.joho.cn` 可以正常通过。前端不携带 cookie，无 credentials 问题。

### 需要的域名相关配置（清单）

| # | 位置 | 配置项 | 是否必须 |
|---|---|---|---|
| 1 | Strapi 后台 | 新增 `site-config`，`domain = game.yourbao.cn` | **必须**（P0） |
| 2 | 前端 `ENV.siteUrl` | 设为 `https://game.yourbao.cn`（让 `domain` 参数固定，不依赖 `location.hostname`） | 推荐（否则本地调试时 hostname 是 `localhost`，解析不到站点） |
| 3 | Strapi CORS | 现状默认放行即可；若要收紧，需把 `https://game.yourbao.cn` 加入 `origin` 白名单，**并保留 `x-site-domain` 头** | 可选 |
| 4 | v.joho.cn | **无需任何配置** | —— |

> 补充：若将来希望消消乐数据完全独立，**不需要新建 Strapi 实例**，
> 在同一个实例里新建一个 `site-config` 即可，成本最低（这也正是当前方案）。

---

## 四、风险与注意事项（交接重点）

1. **绝不要依赖数字 `site.id`**
   它是数据库自增主键，随环境与数据恢复变化。前端已完全不传、不硬编码站点 id，
   请后端也不要在接口契约里要求前端传数字 id。若必须传，请用 `documentId`。

2. **`sourceId` 是纯字符串、后端不校验**
   前端传的是稳定业务键 `xiaoxiaole`，不依赖任何自增主键，环境迁移不会失效。

3. **留言限流**
   `zhao-website` 的 bootstrap 里有**每 IP 每分钟 30 次**的内存限流，超限会静默失败。
   前端未做重试队列，若运营发现留言丢失请优先查限流。

4. **`interaction.type` 枚举只有 `like / collect / share`**
   没有 `vote` / `comment`。当前用 `like` 表达投票，**若要语义更清晰请勿直接改枚举**
   （会影响其它站点已有数据），建议新增统计接口时按 `targetType` 区分即可。

5. **投票去重依赖 `visitorId`**
   该 id 由前端生成并存在 localStorage（key `bg_visitor`）。
   用户清缓存后会视为新访客，可能重复计一票——统计时请以 `visitorId` 去重，后端统计接口请按此实现。

6. **离线降级**
   未配置 `MARKETING_API_BASE`（当前为 `https://h.joho.cn`）或网络失败时，前端**静默降级**：
   投票只记本地（key `bg_votes`），留言提示「暂时没发出去，内容已留着，稍后再试」。
   这不会向用户暴露错误，但也意味着**后端收不到数据却无人报警**——建议对统计接口加监控。

---

## 五、验收清单

按顺序执行，全部通过即算交付：

```bash
# 1. 站点解析正确（关键：确认返回的站点不是兜底的最小 id 站点）
curl "https://h.joho.cn/api/zhao-website/v1/site-info?domain=game.yourbao.cn"

# 2. 留言能进库，且归属正确
curl -X POST "https://h.joho.cn/api/zhao-website/v1/leads/submit?domain=game.yourbao.cn" \
  -H "Content-Type: application/json" \
  -d '{"type":"contact","contactName":"联调测试","message":"联调留言","sourceType":"game","sourceId":"xiaoxiaole"}'
# 期望：{"success":true,"id":"..."}；后台「线索」里能看到且站点是 game.yourbao.cn

# 3. 投票 toggle 正常
VID="test-visitor-001"
curl -X POST "https://h.joho.cn/api/zhao-website/v1/interactions/track?domain=game.yourbao.cn" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"like\",\"targetType\":\"game-favorite\",\"targetId\":\"memory\",\"visitorId\":\"$VID\"}"
# 第一次期望 action=created；再发一次期望 action=removed

# 4.（P1 完成后）统计接口
curl "https://h.joho.cn/api/zhao-website/v1/interactions/stats?domain=game.yourbao.cn&targetType=game-favorite"
```

前端侧验收：认知中心 → 「🏆 最受欢迎」能改选/取消并有提示；单个玩法页右上角点赞能切换；
「💬 留言建议」能唤起键盘输入并提交成功。

---

## 六、联系与代码位置

- 前端仓库：`d:/zhao/xiaoxiaole`（构建 `node scripts/build.mjs` → `bin/bundle.js`，部署到 `game.yourbao.cn/tour/xxl/`）
- 接口层：`src/core/CommunityApi.ts`（含 `RANKING_PATH` 预留常量）
- 本文档相关插件源码：`d:/zhao/strapi/plugins/zhao-website/server/src/`
- 插件设计文档：`d:/zhao/strapi/docs/superpowers/specs/2026-07-06-zhao-website-plugin-design.md`

---

## 七、补充事项（可选增强与联调提示）

1. **可选：暴露 `check` 接口，消除本地状态偏差**
   前端用 localStorage 记录点赞状态（key `bg_votes`）。用户清缓存后本地状态丢失，
   此刻点一下可能实际是「取消」而非「点赞」。
   若后端把已有的 `check(siteId, {type,targetType,targetId,visitorId})` 暴露为公开接口，
   前端可在进入页面时校正一次，彻底消除该偏差。

2. **联调 / 本地环境：建议也为 `localhost` 建站点**
   前端未配 `ENV.siteUrl` 时用 `location.hostname` 作为 domain，本地调试即为 `localhost`。
   建站 SQL 示例中已有 `domain='localhost'` 的站点；若目标环境没有，
   本地提交的留言/投票同样会静默落到兜底站点，联调时请留意。

3. **`ENV.siteUrl` 的耦合提示**
   `CommunityApi.siteDomain()` 优先取 `ENV.siteUrl` 的 hostname 作为 domain 参数。
   若该变量已被分享链接等其它功能使用，改动它会同时影响投票/留言的站点归属，
   建议明确设为游戏对外地址 `https://game.yourbao.cn`。

4. **留言的电话 / 邮箱为空属正常**
   适老化考虑只收集「昵称 + 内容」，`contactPhone` / `contactEmail` 会为空，
   运营在后台「线索」里看到空联系方式**不是数据丢失**。

5. **`type` 枚举里没有 `comment`**
   服务代码存在 `type === "comment"` 分支，但 Schema 枚举只允许 `like / collect / share`。
   因此留言**不要**走 interaction，必须走 `lead`（当前实现已如此）。

6. **投票与问卷是两个独立维度，别统计混**
   单页点赞 `targetType=game`、问卷单选 `targetType=game-favorite`，
   排行榜看的是 `game-favorite`，统计时请勿把两者相加。

---

## 八、验收记录（2026-10-09，全部通过）

### P0 站点配置

- 已创建 `site-config`：`siteName=消消乐`，`domain=game.yourbao.cn`，
  数字 id=4，documentId `tyry8wjg36nkpqjsp14gybau`
- `GET /site-info?domain=game.yourbao.cn` 返回「消消乐 / game.yourbao.cn」，不再落兜底站点 ✓

### P1 统计接口（已上线）

- 新增 `GET /api/zhao-website/v1/interactions/stats?domain=...&targetType=...`（`publicRoute`，匿名可调）
- 实现落点：
  - `services/interaction.ts` 新增 `ranking(siteId, targetType, type?)`：按 targetId 分组计数，
    **过滤 `deletedAt: null`** + **按 visitorId 去重**（交接书第四节第 5 点的兜底），按 count 降序
  - `controllers/content-api/lead.ts` 新增 `interactionStats`（支持可选 `type` 查询参数）
  - `routes/content-api.ts` 注册 `publicRoute("GET", "/interactions/stats", "lead.interactionStats")`
- 插件 dist 已部署 joho 服务器 + `pm2 restart`（线上探活 `/_health` 204）

### 验收清单执行结果

| # | 项目 | 结果 |
|---|---|---|
| 1 | site-info 归属 | ✓ 返回消消乐站点（id=4），非兜底 |
| 2 | leads/submit | ✓ `{"success":true,"id":...}`；DB 联表确认归属 `game.yourbao.cn`（现有 5 条有效留言） |
| 3 | interactions/track toggle | ✓ created → removed；DB 终态活跃 interaction 为 0（全部正确软删） |
| 4 | interactions/stats | ✓ `targetType=game-favorite` 与 `game` 均返回 `{data:[{targetId,count}]}`，软删票不计入 |

### 前端 E2E（手机视口 390×844 dpr=2，Playwright）

脚本：`xiaoxiaole/tools/e2e_vote_message.py`（SSO 登录 → 认知中心 → 投票/留言/点赞全链路），
截图存档：`xiaoxiaole/design/e2e-vote/`。

- 🏆 最受欢迎：点击「时光整理师」→ toast「已选…」→ **排行榜实时显示真实数据**（`🌸 时光整理师 ▬▬ 1`，
  见 `5-vote-ranking.png`）→ 改选/取消 → stats 回落 `[]` ✓
- 💬 留言建议：DOM 浮层输入昵称+内容 → 提交 toast「收到啦，谢谢您的建议！」（`10-message-submitted-toast.png`）→ DB 入库 ✓
- 单玩法页点赞：右上角「👍 点赞 ↔ ❤️ 已赞」切换成功（`11-like-on.png`）✓

### 本次顺手修复的两个前端 bug（已随 bundle 上线）

1. **投票后排行榜不刷新**：`VoteScene` 只在进入时拉一次榜单，投票后仍显示「正在统计中」。
   现改为每次投票/取消落库后重新拉取；且接口返回空数组时也清空榜单（避免残留旧数据）。
2. **关卡页「👍 点赞」被全局「🏠 主页」按钮完全遮挡**：两按钮右上角重叠，点赞点击被主页按钮
   吞掉（表现为「想点赞却回到主页」）。现关卡选择页隐藏全局主页按钮（左上 ‹ 可返回）。

### 已知备注

- 插件部署#1 时曾出现 `POST /interactions/track` 瞬态 404（DB 行已创建、handler 完整执行），
  重新部署 #2 后消失，判定为进程瞬态异常；控制器已保留 `[lead.track]` 成功/异常诊断日志备查。
- E2E 期间唯一 console 错误为 `POST /api/client/v1/xiao/points/earn` 400（积分领取接口，
  与本次投票/留言功能无关的既有问题，待另查）。
- 验收数据终态：投票/点赞全部 toggle 清理（活跃 0 条）；留言保留「联调测试」与「E2E验收」样例
  数条作为归属证据，运营可在后台「线索」中按 `sourceId=xiaoxiaole` 过滤查看。
