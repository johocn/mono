# 微信购物助手 · 操作手册

> 微信公众号消息侧「搜商品 → 回卡片 → 回复编号下单」闭环
> 交付日期：2026-10-14（P0：文本消息搜索 + news 卡片 + 编号下单 + 支付链接；2026-10-14 晚升级：绑定建档聊天内闭环——sso 绑定用户免输入自动建档 + 未绑定用户聊天内两步补录，见 §1.2；P1 剩余：短信验证码强实名、微信支付聊天内闭环、订单状态通知）

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

### 1.2 绑定两路径（2026-10-14 起，聊天内闭环免 H5 跳转）

sso 转调 vendure 时若该 openid 已绑定 sso 用户（`sso-third-party-binding` + 用户 mobile 合法），转调 body 附带 `boundPhone`：

- **路径 A（免输入自动建档）**：openid 在 vendure 无顾客 + `boundPhone` 未被注册 → 自动建 User(`wechat_mp_<openid>`) + Customer(phoneNumber=boundPhone) 并关联，用户无感知直接下单
- **路径 B（聊天内两步补录）**：无 boundPhone（sso 未绑定该微信）→ 回复「买1」时引导补录：回复手机号 → 回复收货地址 → 建档（含地址）下单；不做短信验证码；**已被注册的手机号回退 H5 登录页验证（防冒领）**
- 两路径建的账号 identifier 与 H5 微信登录一致（`wechat_mp_<openid>`），后续 H5 微信登录自动收敛同一账号，支付链接（vshop 收银台按 openid activeOrder 匹配）直接可用

## 2. 架构与插件职责

| 插件 | 本次改动 | 职责 |
|------|---------|------|
| `wechat-auth-plugin` | 补强 | 路由级 `express.text` 中间件（text/xml body）；`parseWechatXml` 零依赖解析；AES/明文双模式；发布 `WechatMessageEvent`；`sendCustomText` / `sendCustomNews` 客服消息（支持渠道覆盖凭证 cred 参数） |
| `meilisearch-plugin` | 补强 | `MeiliService.search()`（filter：`type='product' AND status='published' AND channelId=…`，单引号转义）；商品投影新增 `thumbnail`（`PUBLIC_ASSET_URL` + featuredAsset preview）与 `slug`，url 投影 = `{PUBLIC_STOREFRONT_URL}/{slug}` |
| `wechat-shopping-assistant-plugin` | **新建** | 编排器：去重 → 意图 → 搜索 → 会话 → 卡片 → 下单 → 回复；卡片以 slug 拼详情页绝对地址 `{storefront}/product/{slug}`；两个实体；跨插件注入 MeiliSearchPlugin / WechatAuthPlugin 服务 |
| strapi `zhao-sso` | 补强 | 公众号回调入口（验签/落库/关键字规则/被动回复 XML）；text 未命中关键字规则时经 `askShoppingAssistant` 转调 vendure 决策接口（3.5s 超时），组装被动回复 XML；**转调前查 openid 绑定的 sso 用户手机号，body 附 `boundPhone`（路径 A 免输入建档，见 §1.2）** |

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
| `19900000004`（11 位手机号） | 补录·手机号 | **路径 B 第 1 步**（会话 `state=awaiting_phone`）：去连字符/空格后匹配 `1[3-9]\d{9}`，不符回提示；已被注册 → 提示回 H5 登录验证（防冒领）；可用 → 提示回复收货地址 |
| `北京市朝阳区xx路xx号`（≥8 字符任意文本） | 补录·地址 | **路径 B 第 2 步**（会话 `state=awaiting_address`）：长度 <8 拒绝；建档（User+Customer+Address）→ 自动续单下单成功 |
| `取消` / `退出` | 补录·退出 | 清除补录状态（state/draft），回到正常对话 |
| `帮助` / `你好` / `help` | help | 使用说明 |
| `绑定` / `登录` / `注册` | bind | 引导跳 H5 登录页（微信内打开自动 openid 绑定） |
| 图片/语音/位置等非文本 | 忽略 | P0 仅处理文本 |

规则引擎为纯函数（`intent.ts`），长词优先（`搜索|查询|想买|想要` → `买|要`），全角数字自动转半角。补录态优先级最高（state 命中直接进入对应分支，不做意图识别）。

## 5. 边界与降级行为

| 场景 | 行为 |
|------|------|
| 搜索无结果 | 兜底文案「没有找到「xx」相关的商品，换个说法试试？」 |
| Meili 超时/异常（5s race） | 降级文案「开小差」+ 引导重试；不阻塞回调 |
| news 卡片发送失败 | 自动降级纯文本编号列表（`sendOrFallback`） |
| 回复无效编号 | 引导提示（当前会话有效编号范围） |
| 会话过期（默认 30 分钟） | 引导重新搜索 |
| 未绑定用户下单（无 boundPhone） | **聊天内补录引导**（§1.2 路径 B）：回复手机号 → 回复收货地址 → 建档下单；不再强制跳 H5（登录链接保留在引导文案末尾） |
| sso 已绑定用户首次下单（有 boundPhone） | **免输入自动建档**（§1.2 路径 A）：用 boundPhone 建 Customer 关联 openid，直接下单 |
| 补录手机号已被注册 | **防冒领**：拒绝自动合并，提示回 H5 登录页验证（`buildPhoneTakenText`） |
| 补录地址 <8 字符 | 回「地址好像不完整」提示，停留待回复状态 |
| 补录中回复「取消/退出」 | 清态退出，恢复正常对话 |
| 助手无头单（服务类商品无物流） | 订单标 `orderKind='assistant'`：默认进程放宽 Customer/Shipping 守卫（dev-config RelaxArrangingPaymentGuardPlugin）+ marketplace 进程豁免逐行 shippingLineId 校验，进 ArrangingPayment 由 H5 收银台直付 |
| 库存不足 / 无可用变体 | 「库存不足」文案（`addItemToOrder` 返回 `INSUFFICIENT_STOCK_ERROR` 时中止建单） |
| 建单异常 | 「下单失败」文案 + 引导重试 |
| 同一 MsgId 重试推送 | 幂等表唯一键挡住，只处理一次 |
| 非文本消息 / 其他事件 | 静默忽略（subscribe 事件回欢迎语） |
| 回调处理超时 | 事件发布在异步链路吞异常，控制器恒回 `success` |

## 6. 数据表

| 表 | 用途 | 关键字段 |
|----|------|---------|
| `wechat_shopping_session` | openid 维度最近一次搜索结果（编号→商品），下单回查；**补录状态机**（2026-10-14 增） | openid（唯一）、channelId、results（simple-json，含 index/quantity）、query、expireAt、**state**（null/awaiting_phone/awaiting_address）、**draft**（simple-json：{phone, indices}） |
| `wechat_processed_message` | MsgId 幂等去重 | dedupKey（唯一，`mid:{MsgId}` 或 `evt:{from}:{createTime}:{event}`）、receivedAt |

> 去重表只增不改；如需控制体量可定期清理 `receivedAt` 超 7 天记录（P1 可加定时任务）。

## 7. 测试与验证

### 7.1 单测（三包 91 用例全绿，2026-10-14 更新）

```powershell
# 各包目录下
npx vitest run
```

- `wechat-auth-plugin`（17）：XML 解析 CDATA/纯文本/加密信封、crypto、official resolver
- `meilisearch-plugin`（28）：mapper 投影含 thumbnail、search() filter 组装/channelId 转义/分页
- `wechat-shopping-assistant-plugin`（46）：意图识别 10 例、卡片组装 10 例（含绑定引导/补录提示文案）、搜索 4 例、建档绑定 5 例（路径 A/B/防冒领/地址容错）、**全链路冒烟 17 例**（假件 DI：搜索命中→卡片→下单成功+幂等→数量传递→库存不足→无匹配→搜索异常→会话过期→无效编号→关注欢迎→补录状态机 await_phone/await_address→建档续单→取消→防冒领→路径 A boundPhone）

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

### 7.4 绑定建档双路径验证（2026-10-14，PASS）

服务器内网直测 vendure 决策接口（`POST /wechat-assistant/handle` + `x-zhao-secret` + `WX_ASSISTANT_CHANNEL_TOKEN` 渠道），测试标记数据（openid 前缀 `oSIMTEST`、手机号 199 段、地址含「测试」）：

| 路径 | 步骤 | 结果 |
|------|------|------|
| A（boundPhone 免输入） | oSIMTEST-A1 + boundPhone=19900000002：「洗车」→「买1」 | 自动建档 customer（phone/email=wechat_mp_ 前缀/openid customFields 齐全）→ 直接回复下单成功（订单 386，ArrangingPayment，orderKind=assistant） |
| B（已绑定用户） | oSIMTEST-B2：「洗车」→「买1」 | 已绑 openid 直接下单成功（订单 385） |
| B（全新用户四步） | oSIMTEST-D4：「洗车」→「买1」→「19900000005」→「测试市测试区测试路2号」 | 四步文案全部正确（引导→手机号确认→地址提示→下单成功），customer 170 + address 落库（streetLine1/ phoneNumber）+ 订单 388 |

验证过程修复的三个问题（都已提交部署）：

1. **dev-server dist 未重建致守卫放宽未生效**：生产实际运行 `prod-start.js → dist/index`（**不是** ts-node 直跑 dev-config.ts 源码），dev-config.ts 新增的 `RelaxArrangingPaymentGuardPlugin`（放宽默认进程 Customer/Shipping 守卫）必须 `npx tsc -p tsconfig.prod.json` 重建 dist 才生效。教训：**改 dev-config.ts 后必须重建 dist 再部署**。
2. **ArrangingPayment 拦截原因不可见**：GraphQL 生成错误类 `.message` 硬编码为裸错误码 `ORDER_STATE_TRANSITION_ERROR`，真实拦截者在 `.transitionError` 字段；assistant order.service 已透出该字段并 Logger.warn，报错文案现在直接显示具体守卫（如 `message.cannot-transition-to-payment-without-shipping-method`）。
3. **建档地址字段名**：本 fork 的 `CreateAddressInput` 字段为 `streetLine1`（上游 vendure 为 `streetLine`），旧字段名展开进 Address 实体被忽略、`streetLine1` 为 null 触发非空约束（被 catch 吞掉，日志 `Assistant bind: create address skipped`）；已对齐 fork schema。

无头单转态说明：助手单（服务类商品无物流）标记 `orderKind='assistant'` 后跳过逐行 shippingLineId 校验（marketplace 进程豁免，对齐 campus `orderKind='errand'` 先例），且默认进程放宽 `arrangingPaymentRequiresCustomer/Shipping`；订单落 `ArrangingPayment` 态，用户点支付链接进 vshop 收银台（PAYABLE_STATES 含该态）直付。

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

- ~~绑定引导为跳转 H5 登录页~~ **已升级（2026-10-14）**：聊天内两步补录闭环（§1.2 路径 B）+ sso 绑定用户免输入建档（路径 A）；H5 登录链接保留为防冒领回退与「绑定」指令入口。**风险注记（免验证码）**：路径 B 不做短信验证码，任何人知道一个未注册手机号即可用它建档；已被注册的手机号不受影响（回退 H5 验证）。sso 侧仅在该 openid 未绑定任何 sso 用户时走路径 B（sso 无绑定样本无法回填手机号），如需强实名可后续在补录第 1 步接入短信验证码（P1）
- **支付为链接跳 H5 收银台**（P0 边界）；微信支付在聊天内直接闭环 → P1
- **订单状态后续通知**（发货/退款等订阅消息）→ P1
- 中文数字数量（「一瓶」）不解析，仅阿拉伯数字（「2瓶」）进会话数量
- 客服消息 48h 窗口外的主动触达不可用（微信平台限制）
- 缩略图依赖 `PUBLIC_ASSET_URL` 配置与商品 featuredAsset；生产已配置（`https://e.joho.cn/assets`）且卡片图片已验证；未配置时卡片无图（不影响下单）
- **被动回复链路（sso）会话/下单说明**：vendure handle 为纯决策接口（不主动发送），下单成功通知由 assistant 服务层生成 text 回复经 sso 被动返回；客服消息 48h 窗口限制不适用于被动回复
- ~~news 卡片 Url 为站内相对路径~~ **已解决（2026-10-14）**：search-adapter 统一以 slug 拼 `{PUBLIC_STOREFRONT_URL}/product/{slug}` 绝对地址；无 slug/未配 storefrontUrl 时退回文档 url 原样
- **storefront 为 hash 路由前端（vshop uni-app H5）时 history path 被前端忽略**（`/product/{slug}`、`/account/login`、`/checkout/confirmation/{code}` 均落首页，2026-10-14 勘误）——三个链接必须经 `PUBLIC_PRODUCT_URL_TEMPLATE` / `PUBLIC_LOGIN_URL_TEMPLATE` / `PUBLIC_PAY_URL_TEMPLATE` 配 hash 真实地址（已配，见 §3.2；值含 `#` 须加双引号）
- 搜索无命中排查：MeiliSearch kb-zh 索引（商品+内容统一索引）无对应商品时走降级文案，属正常行为非链路故障
- **改 dev-config.ts 后必须重建 dist 再部署**（2026-10-14 教训，见 §7.4）：生产运行 `prod-start.js → dist/index`（编译产物），ts-node 仅用于本地开发；`npx tsc -p tsconfig.prod.json` 重建后 dist/dev-config.js 随 git 入库
