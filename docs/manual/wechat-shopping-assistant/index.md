# 微信购物助手 · 操作手册

> 微信公众号消息侧「搜商品 → 回卡片 → 回复编号下单」闭环
> 交付日期：2026-10-14（P0：文本消息搜索 + news 卡片 + 编号下单 + 支付链接；P1：聊天内短信绑定、微信支付直接闭环、订单状态通知）

---

## 目录

- [1. 功能总览](#1-功能总览)
- [2. 架构与插件职责](#2-架构与插件职责)
- [3. 配置清单](#3-配置清单)
- [4. 用户交互规则（意图表）](#4-用户交互规则意图表)
- [5. 边界与降级行为](#5-边界与降级行为)
- [6. 数据表](#6-数据表)
- [7. 测试与验证](#7-测试与验证)
- [8. 对话演示截图](#8-对话演示截图)
- [9. 部署机制](#9-部署机制)
- [10. 已知边界与 P1 待办](#10-已知边界与-p1-待办)

---

## 1. 功能总览

> 下图为 vendure 侧功能编排（直连链路视角）；**生产回调入口已改道 strapi zhao-sso**，见 §1.1。sso 链路下第 5 步「组装客服消息」改为「返回结构化决策给 sso 组装被动回复」，其余编排（去重/意图/搜索/会话/下单）完全相同。

```
用户在公众号发「买一瓶酱油」
   │ 微信回调 POST /wechat/message (text/xml)
   ▼
wechat-auth-plugin：验签/解密(AES) → XML 解析 → 发布 WechatMessageEvent（5 秒内回 success）
   ▼
wechat-shopping-assistant-plugin（异步编排）
   1. MsgId 幂等去重（wechat_processed_message 表，防微信重试重复下单）
   2. 意图识别（纯函数规则引擎：search / order / help / bind）
   3. search → MeiliSearchPlugin.search() 检索（type=product, status=published, channelId 过滤）
   4. 结果写入会话表（openid 维度，默认 30 分钟 TTL，带数量）
   5. 组装客服消息：news 图文卡片（方案 A）→ 失败自动降级纯文本编号列表（方案 B）
   ▼
用户回复「买1」/「买1和3」
   ▼
下单处理：校验会话有效期 → openid→Customer 绑定校验 → 服务端建单
   （RequestContext(shop, channelId) → createOrder → addItemToOrder×N → ArrangingPayment）
   ▼
回复下单成功通知（订单号 + 明细 + 合计 + 支付链接 → H5 收银台确认页）
```

### 1.1 生产回调链路（2026-10-14 起改道 strapi zhao-sso）

公众号后台只能配**一个**回调 URL，生产已改指 strapi zhao-sso（其消息回复体系更完整：事件落库、绑定维护、关键字规则、被动回复 XML 多类型）：

```
公众号消息 → POST https://<strapi域名>/api/zhao-sso/v1/wechat/callback（明文模式验签）
   ▼
zhao-sso sso-wx-callback：验签 → 事件落库 → 管理员留言回复 → 关键字规则匹配
   ▼ 关键字规则未命中（HTTP 内网直连 127.0.0.1，body 带 WX_ASSISTANT_CHANNEL_TOKEN 指定渠道）
vendure 决策接口 POST http://127.0.0.1:3020/wechat-assistant/handle（WX_ASSISTANT_URL）
   → 纯决策不发送：返回 { kind:'news', articles } / { kind:'text', content } / { handled:false }
   ▼
zhao-sso 用 buildReplyXml 组装被动回复 XML（news 最多 8 条 / text），受微信 5 秒窗口约束
（转调超时 3.5s；超时/异常/不处理 → 回 success 静默）
```

**卡片内容（2026-10-14 补齐）**：news article 含 `PicUrl`（商品主图 = `{PUBLIC_ASSET_URL}/{featuredAsset.preview}`）与 `Url`（点击直达商品详情页：优先 `PUBLIC_PRODUCT_URL_TEMPLATE` 模板，未配置退回 `{PUBLIC_STOREFRONT_URL}/product/{slug}`）；未绑定用户下单时回复引导文案（登录链接取 `PUBLIC_LOGIN_URL_TEMPLATE` + 手机号验证码登录自动绑定 + 「个人中心 → 地址簿」维护电话/收货地址指引），达成公众号内「看卡片 → 进详情页 → 绑定 → 回复编号下单 → 支付链接」闭环。

vendure 直连链路（`POST /wechat/message` → WechatMessageEvent → 客服消息发送）保留为备选，客服消息受 48h 窗口限制；被动回复链路无此限制。

## 2. 架构与插件职责

| 插件 | 本次改动 | 职责 |
|------|---------|------|
| `wechat-auth-plugin` | 补强 | 路由级 `express.text` 中间件（text/xml body）；`parseWechatXml` 零依赖解析；AES/明文双模式；发布 `WechatMessageEvent`；`sendCustomText` / `sendCustomNews` 客服消息（支持渠道覆盖凭证 cred 参数） |
| `meilisearch-plugin` | 补强 | `MeiliService.search()`（filter：`type='product' AND status='published' AND channelId=…`，单引号转义）；商品投影新增 `thumbnail`（`PUBLIC_ASSET_URL` + featuredAsset preview）与 `slug`，url 投影 = `{PUBLIC_STOREFRONT_URL}/{slug}` |
| `wechat-shopping-assistant-plugin` | **新建** | 编排器：去重 → 意图 → 搜索 → 会话 → 卡片 → 下单 → 回复；卡片以 slug 拼详情页绝对地址 `{storefront}/product/{slug}`；两个实体；跨插件注入 MeiliSearchPlugin / WechatAuthPlugin 服务 |
| strapi `zhao-sso` | 补强 | 公众号回调入口（验签/落库/关键字规则/被动回复 XML）；text 未命中关键字规则时经 `askShoppingAssistant` 转调 vendure 决策接口（3.5s 超时），组装被动回复 XML |

跨插件依赖：`imports: [PluginCommonModule, MeiliSearchPlugin, WechatAuthPlugin]`，直接注入 `MeiliService` / `WechatAuthService`。

## 3. 配置清单

### 3.1 dev-config 注册条件

插件仅在 `WECHAT_AUTH_APP_ID` 已配置 **或** `DEV_BYPASS_WECHAT=true` 时注册（与 WechatAuthPlugin 同条件）。

### 3.2 服务器 vendure .env 新增/相关项

| 变量 | 说明 |
|------|------|
| `WECHAT_AUTH_APP_ID` / `WECHAT_AUTH_APP_SECRET` | 公众号凭证（既有）；多租户店铺可用 cjk 渠道覆盖（`getAuthOverride(ctx,'wechat')`，含 appSecret） |
| `PUBLIC_STOREFRONT_URL` | 绑定引导登录页/支付确认页未配模板时的前缀 + 支付确认页前缀（`{storefront}/checkout/confirmation/{code}`）。生产已配 `https://e.joho.cn`（packages/dev-server/.env） |
| `PUBLIC_ASSET_URL` | 商品缩略图前缀（featuredAsset preview）。生产已配 `https://e.joho.cn/assets`；未配置时 meili 文档省略 thumbnail、卡片无图（不影响下单） |
| `PUBLIC_PRODUCT_URL_TEMPLATE` | 商品详情页地址模板，`{slug}` 占位（替换时 encodeURIComponent）。生产已配 `"https://e.joho.cn/#/pkg-product/pages/detail?slug={slug}"`（vshop uni-app hash 路由，detail 页读 `options.slug`）；未配置退回 `{PUBLIC_STOREFRONT_URL}/product/{slug}` |
| `PUBLIC_LOGIN_URL_TEMPLATE` | 绑定引导登录页（无占位符，整串绝对地址）。生产已配 `"https://e.joho.cn/#/pages/login/index"` |
| `PUBLIC_PAY_URL_TEMPLATE` | 下单成功通知支付链接模板，`{code}` 占位（订单号 encodeURIComponent）。生产已配 `"https://e.joho.cn/#/pkg-order/pages/payment?code={code}"`（vshop 收银台 payment 页读 `query.code`） |
| `WECHAT_ASSISTANT_OUTBOUND_MODE` | `api`（默认，真实发送客服消息）/ `echo`（仅日志，联调用） |
| `ZHAO_SEARCH_SHARED_SECRET` | vendure 侧（`packages/dev-server/.env`，进程 cwd）；与 strapi 同值，`x-zhao-secret` 头服务间鉴权 |

> **.env 值含 `#` 必须加双引号**（如上三行模板）——dotenv 把未加引号值里的 `#` 当行内注释截断，hash 路由会被截掉。

**strapi 侧 .env（/www/apps/strapi）：**

| 变量 | 说明 |
|------|------|
| `WX_ASSISTANT_URL` | `http://127.0.0.1:3020/wechat-assistant/handle`（**根路径无 /shop-api 前缀**——Nest controller 挂根路径，/shop-api/* 下的 POST 会被 Apollo GraphQL 中间件拦截）；未配置时 sso 不转调 |
| `WX_ASSISTANT_CHANNEL_TOKEN` | 公众号绑定的 vendure 渠道 token（如利洋汽修 t2=`66ruvnhh34svhckaa2i`），决定搜索/下单渠道；未配置时 vendure 回退默认渠道 1。**strapi 对外域名是 v.joho.cn（/api→1337），e.joho.cn 无 strapi 转发** |
| `ZHAO_SEARCH_SHARED_SECRET` | 与 vendure 同值 |

**MeiliSearch 商品文档全量重建**（修改 `PUBLIC_STOREFRONT_URL` / `PUBLIC_ASSET_URL` 后需重建才生效；管理端 `meiliReindex` mutation 需 SuperAdmin 凭据，运维可直接 INSERT job_record 取件，需 vendure `RUN_JOB_QUEUE=1`）：

```sql
-- 列名为驼峰带引号（以 information_schema 为准）；createdAt/updatedAt 自动填充
INSERT INTO job_record ("queueName", data, state, retries, "isSettled")
VALUES ('meili-reindex-products', '{"all":true}', 'PENDING', 5, false);
```

> 完成后 `state='COMPLETED'`、progress=100；抽查：`curl http://127.0.0.1:7700/indexes/kb-zh/documents/product-73` 确认文档含 `thumbnail` 与绝对 `url`/`slug`。

### 3.3 插件选项（dev-config.ts init）

`storefrontUrl` / `assetBaseUrl` / `searchLocale: 'zh'` / `sessionTtlMinutes: 30` / `searchLimit: 5` / `outboundMode`。

### 3.4 微信侧要求

- 公众号为**认证服务号**（客服消息接口权限），服务器 IP 在白名单
- **生产回调 URL（2026-10-14 起）**：`https://v.joho.cn/api/zhao-sso/v1/wechat/callback`（strapi 对外域名是 **v.joho.cn**，/api→1337；e.joho.cn 无 strapi 转发，勿用）。明文模式 + Token（Token 取 zhao-sso 后台「服务器配置」`sso-oauth-config(wechat/official_account).extraConfig.serverToken`，GET 验证 echostr）
- vendure 直连备选回调 URL：`https://<api域名>/wechat/message`（**根路径**，nginx `location /wechat/message` 原样透传 3020；此前文档误记为 `/shop-api/wechat/message`——/shop-api/* 前缀下的 POST 会被 Apollo GraphQL 中间件拦截，勿配）
- 客服消息有 **48 小时窗口**限制：用户 48h 内互动过才可主动发卡片（用户发消息即刷新窗口，正常购物流不受影响）；生产被动回复链路（sso）无此限制

## 4. 用户交互规则（意图表）

| 用户输入示例 | 识别 | 行为 |
|------|------|------|
| `买一瓶酱油` / `想要洗衣液` / `大米` | search | 中文数量词不解析，整词进 meili 模糊搜；回复 news 卡片（≤5 条，`searchLimit`） |
| `买2瓶酱油` / `来3袋盐` | search+数量 | 剥离「数字+单位」后搜关键词，**数量存入会话**，下单按该数量加购 |
| `1` / `买1` / `下单 2` / `买1和3` / `买１`（全角） | order | 回查会话编号下单；多编号合并一单；无会话/过期 → 引导重搜 |
| `帮助` / `你好` / `help` | help | 使用说明 |
| `绑定` / `登录` / `注册` | bind | 引导跳 H5 登录页（微信内打开自动 openid 绑定） |
| 图片/语音/位置等非文本 | 忽略 | P0 仅处理文本 |

规则引擎为纯函数（`intent.ts`），长词优先（`搜索|查询|想买|想要` → `买|要`），全角数字自动转半角。

## 5. 边界与降级行为

| 场景 | 行为 |
|------|------|
| 搜索无结果 | 兜底文案「没有找到「xx」相关的商品，换个说法试试？」 |
| Meili 超时/异常（5s race） | 降级文案「开小差」+ 引导重试；不阻塞回调 |
| news 卡片发送失败 | 自动降级纯文本编号列表（`sendOrFallback`） |
| 回复无效编号 | 引导提示（当前会话有效编号范围） |
| 会话过期（默认 30 分钟） | 引导重新搜索 |
| 未绑定用户下单 | 引导文案：H5 登录链接（微信内打开，手机号验证码登录自动绑定）+「个人中心 → 地址簿」维护电话/收货地址（下单前置校验） |
| 库存不足 / 无可用变体 | 「库存不足」文案（`addItemToOrder` 返回 `INSUFFICIENT_STOCK_ERROR` 时中止建单） |
| 建单异常 | 「下单失败」文案 + 引导重试 |
| 同一 MsgId 重试推送 | 幂等表唯一键挡住，只处理一次 |
| 非文本消息 / 其他事件 | 静默忽略（subscribe 事件回欢迎语） |
| 回调处理超时 | 事件发布在异步链路吞异常，控制器恒回 `success` |

## 6. 数据表

| 表 | 用途 | 关键字段 |
|----|------|---------|
| `wechat_shopping_session` | openid 维度最近一次搜索结果（编号→商品），下单回查 | openid（唯一）、channelId、results（simple-json，含 index/quantity）、query、expireAt |
| `wechat_processed_message` | MsgId 幂等去重 | dedupKey（唯一，`mid:{MsgId}` 或 `evt:{from}:{createTime}:{event}`）、receivedAt |

> 去重表只增不改；如需控制体量可定期清理 `receivedAt` 超 7 天记录（P1 可加定时任务）。

## 7. 测试与验证

### 7.1 单测（三包 72 用例全绿）

```powershell
# 各包目录下
npx vitest run
```

- `wechat-auth-plugin`（17）：XML 解析 CDATA/纯文本/加密信封、crypto、official resolver
- `meilisearch-plugin`（28）：mapper 投影含 thumbnail、search() filter 组装/channelId 转义/分页
- `wechat-shopping-assistant-plugin`（27）：意图识别 10 例（自然语言/数量/编号/全角/帮助绑定）、卡片组装 7 例、**全链路冒烟 10 例**（假件 DI：搜索命中→卡片→下单成功+幂等→数量传递→库存不足→无匹配→搜索异常→会话过期→无效编号→关注欢迎）

### 7.2 真机回归（P0 部署后）

1. 公众号发「买一瓶酱油」→ 收到 news 卡片（含编号/标题/价格/图）
2. 回复「买1」→ 未绑定则收引导；绑定后收下单成功通知（订单号/明细/合计/支付链接）
3. 点支付链接 → H5 收银台确认页（`{storefront}/checkout/confirmation/{code}`）
4. 后台核对：订单渠道正确、明细数量正确、库存已扣减
5. 重复推送验证：日志出现 `Duplicated wechat message skipped`（可用微信重试机制或重放同 MsgId 报文）

### 7.3 sso 转调链路验证（2026-10-14 已通过，改道后）

模拟微信服务器（服务器内网，sha1(sort([token,ts,nonce])) 签名）：

1. GET `/api/zhao-sso/v1/wechat/callback?...&echostr=SIM-ECHO-123` → 200 回显 echostr（验签通过，公众号接入验证同原理）
2. POST text「买一瓶酱油」→ 200 text XML「没有找到…」（关键字未命中 → 转调 vendure 搜索 → 降级文案）
3. POST text「DIY」→ 200 **news XML**（ArticleCount=1，Title/Description/Url 齐全）——搜索→卡片→被动回复完整闭环
4. vendure handle 直测：`POST http://127.0.0.1:3020/wechat-assistant/handle` + `x-zhao-secret`（搜索 200 news/text、帮助 200 text、错误 secret 403）
5. POST text「洗车服务一次」→ 200 **news XML 含 `<PicUrl>`（商品主图绝对地址）与 `<Url>https://e.joho.cn/#/pkg-product/pages/detail?slug=%E5%88%A9%E6%B4%8B%E6%B1%BD%E4%BF%AE</Url>`（hash 路由详情页绝对地址）**——卡片图片 + 详情页跳转全链路通过（2026-10-14 复验，PASS）

## 8. 对话演示截图

- [01-search-cards.png](../shots/2026-10-14-wechat-shopping-assistant/01-search-cards.png)：搜索 → news 图文卡片（编号 1/2/3）→ 降级文本列表样式
- [02-order-success.png](../shots/2026-10-14-wechat-shopping-assistant/02-order-success.png)：回复「买1和3」→ 下单成功通知（订单号/明细/合计/支付按钮）
- 动效版可在浏览器直接打开 [chat-preview.html](../shots/2026-10-14-wechat-shopping-assistant/chat-preview.html) 查看
- Playwright 移动视口 390×844 @2x（780×1688）

## 9. 部署机制

| 组件 | 机制 |
|------|------|
| vendure | 本地构建（`npx tsc -p tsconfig.prod.json`，dev-server/dist 入库）→ git push → 服务器 `git pull` + `pm2 restart vendure`；**绝不服务器构建** |
| MeiliSearch | 无改动（复用既有 kb-zh 索引与商品域同步） |
| strapi zhao-sso | 插件 dist 入库（vite bundle，git pull 即生效）；改 `.env` 需 `pm2 restart 44 --update-env` |
| 微信回调配置 | 生产回调 URL 已改指 strapi `/api/zhao-sso/v1/wechat/callback`（明文 + serverToken，见 §3.4 / §1.1） |

重启遵守 OOM 错峰铁律（vendure 与 strapi 绝不同时重启）。

## 10. 已知边界与 P1 待办

- **绑定引导为跳转 H5 登录页**（微信内打开自动 openid 绑定）；聊天内手机号验证码绑定闭环 → P1
- **支付为链接跳 H5 收银台**（P0 边界）；微信支付在聊天内直接闭环 → P1
- **订单状态后续通知**（发货/退款等订阅消息）→ P1
- 中文数字数量（「一瓶」）不解析，仅阿拉伯数字（「2瓶」）进会话数量
- 客服消息 48h 窗口外的主动触达不可用（微信平台限制）
- 缩略图依赖 `PUBLIC_ASSET_URL` 配置与商品 featuredAsset；生产已配置（`https://e.joho.cn/assets`）且卡片图片已验证；未配置时卡片无图（不影响下单）
- **被动回复链路（sso）会话/下单说明**：vendure handle 为纯决策接口（不主动发送），下单成功通知由 assistant 服务层生成 text 回复经 sso 被动返回；客服消息 48h 窗口限制不适用于被动回复
- ~~news 卡片 Url 为站内相对路径~~ **已解决（2026-10-14）**：search-adapter 统一以 slug 拼 `{PUBLIC_STOREFRONT_URL}/product/{slug}` 绝对地址；无 slug/未配 storefrontUrl 时退回文档 url 原样
- **storefront 为 hash 路由前端（vshop uni-app H5）时 history path 被前端忽略**（`/product/{slug}`、`/account/login`、`/checkout/confirmation/{code}` 均落首页，2026-10-14 勘误）——三个链接必须经 `PUBLIC_PRODUCT_URL_TEMPLATE` / `PUBLIC_LOGIN_URL_TEMPLATE` / `PUBLIC_PAY_URL_TEMPLATE` 配 hash 真实地址（已配，见 §3.2；值含 `#` 须加双引号）
- 搜索无命中排查：MeiliSearch kb-zh 索引（商品+内容统一索引）无对应商品时走降级文案，属正常行为非链路故障
