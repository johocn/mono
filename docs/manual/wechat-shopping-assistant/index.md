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

## 2. 架构与插件职责

| 插件 | 本次改动 | 职责 |
|------|---------|------|
| `wechat-auth-plugin` | 补强 | 路由级 `express.text` 中间件（text/xml body）；`parseWechatXml` 零依赖解析；AES/明文双模式；发布 `WechatMessageEvent`；`sendCustomText` / `sendCustomNews` 客服消息（支持渠道覆盖凭证 cred 参数） |
| `meilisearch-plugin` | 补强 | `MeiliService.search()`（filter：`type='product' AND status='published' AND channelId=…`，单引号转义）；商品投影新增 `thumbnail`（`PUBLIC_ASSET_URL` + featuredAsset preview） |
| `wechat-shopping-assistant-plugin` | **新建** | 编排器：去重 → 意图 → 搜索 → 会话 → 卡片 → 下单 → 回复；两个实体；跨插件注入 MeiliSearchPlugin / WechatAuthPlugin 服务 |

跨插件依赖：`imports: [PluginCommonModule, MeiliSearchPlugin, WechatAuthPlugin]`，直接注入 `MeiliService` / `WechatAuthService`。

## 3. 配置清单

### 3.1 dev-config 注册条件

插件仅在 `WECHAT_AUTH_APP_ID` 已配置 **或** `DEV_BYPASS_WECHAT=true` 时注册（与 WechatAuthPlugin 同条件）。

### 3.2 服务器 vendure .env 新增/相关项

| 变量 | 说明 |
|------|------|
| `WECHAT_AUTH_APP_ID` / `WECHAT_AUTH_APP_SECRET` | 公众号凭证（既有）；多租户店铺可用 cjk 渠道覆盖（`getAuthOverride(ctx,'wechat')`，含 appSecret） |
| `PUBLIC_STOREFRONT_URL` | 商品卡片跳转 URL 前缀 + 绑定引导登录页 + 支付确认页前缀（`{storefront}/checkout/confirmation/{code}`） |
| `PUBLIC_ASSET_URL` | 商品缩略图前缀（featuredAsset preview）；未配置时卡片省略图片（news 无图可接受） |
| `WECHAT_ASSISTANT_OUTBOUND_MODE` | `api`（默认，真实发送客服消息）/ `echo`（仅日志，联调用） |

### 3.3 插件选项（dev-config.ts init）

`storefrontUrl` / `assetBaseUrl` / `searchLocale: 'zh'` / `sessionTtlMinutes: 30` / `searchLimit: 5` / `outboundMode`。

### 3.4 微信侧要求

- 公众号为**认证服务号**（客服消息接口权限），服务器 IP 在白名单
- 回调 URL：`https://<api域名>/shop-api/wechat/message`（GET 验证 echostr + POST 收消息；AES 模式配 `WECHAT_AUTH_ENCODING_AES_KEY`）
- 客服消息有 **48 小时窗口**限制：用户 48h 内互动过才可主动发卡片（用户发消息即刷新窗口，正常购物流不受影响）

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
| 未绑定用户下单 | 引导跳 H5 登录页绑定（下单前置校验） |
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
| 微信回调配置 | 若此前未配消息回调：公众号后台配 URL/Token/AES Key（见 §3.4） |

重启遵守 OOM 错峰铁律（vendure 与 strapi 绝不同时重启）。

## 10. 已知边界与 P1 待办

- **绑定引导为跳转 H5 登录页**（微信内打开自动 openid 绑定）；聊天内手机号验证码绑定闭环 → P1
- **支付为链接跳 H5 收银台**（P0 边界）；微信支付在聊天内直接闭环 → P1
- **订单状态后续通知**（发货/退款等订阅消息）→ P1
- 中文数字数量（「一瓶」）不解析，仅阿拉伯数字（「2瓶」）进会话数量
- 客服消息 48h 窗口外的主动触达不可用（微信平台限制）
- 缩略图依赖 `PUBLIC_ASSET_URL` 配置与商品 featuredAsset；未配置时卡片无图（不影响下单）
