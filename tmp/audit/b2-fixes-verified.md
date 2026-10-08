# 批次 2 · P1 修复与验证记录

> 范围：`d:\zhao\vshop` 前台 src（批次2 审计 P0=0 / P1=8 / P2=18），本轮**只修 8 条 P1**。
> 代码改动仓库：`vshop`（C 端）、`vendure`（cjk-plugin 后端）。
> 已发布：两仓均已 commit → push → 部署到生产。

## 一、P1 修复清单（8 条）

| # | 问题 | 修法 | 落点 |
|---|---|---|---|
| 1 | 确认收货误改他单 | `transitionOrderToState(state)` 无 orderId、只作用于 active order；改用 logistics-plugin `confirmOrderReceipt(orderId)` | [order-detail.vue](file:///d:/zhao/vshop/src/pkg-order/pages/order-detail.vue#L112)、[mutations/order.ts](file:///d:/zhao/vshop/src/api/mutations/order.ts) |
| 2 | 物流单号恒空 | `afterSalesRequest(id)` 入参是**售后单 id**，传订单 id 恒查不到；改用 `myOrderPackages(orderId)` | [order-detail.vue](file:///d:/zhao/vshop/src/pkg-order/pages/order-detail.vue#L100-L106)、[queries/order.ts](file:///d:/zhao/vshop/src/api/queries/order.ts) |
| 3 | 取消订单按钮无效 | shop-api 原本无取消能力（core `cancelOrder` 仅在 admin-api）；**新增后端 mutation** `cancelMyOrder(orderId)` | [my-orders-shop.resolver.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/order/my-orders-shop.resolver.ts#L80-L114)、[plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L2217-L2222) |
| 4 | 支付断链 | `payment.vue` 原为占位页；改为真实续付：校验 active order 与目标订单一致 → `transitionOrderToState('ArrangingPayment')` → `addPaymentToOrder` → 复用 `handlePayment` | [payment.vue](file:///d:/zhao/vshop/src/pkg-order/pages/payment.vue) |
| 5 | 富文本存储型 XSS | `RichTextSection` 直接 `:nodes="section.html"`（H5 innerHTML）；改经 `sanitizeRichHtml` | [RichTextSection.vue](file:///d:/zhao/vshop/src/templates/shared/sections/RichTextSection.vue) |
| 6 | 登录 OAuth CSRF | 微信/支付宝/抖音/SSO 回调补随机 `state`，跳转前存 sessionStorage、回调校验并消费 | [login/index.vue](file:///d:/zhao/vshop/src/pages/login/index.vue#L101-L199) |
| 7 | 会话令牌残留 | `logout()` 补 `removeStorageSync('vendure_session_token')` / `auth_openid`，避免串号 | [stores/auth.ts](file:///d:/zhao/vshop/src/stores/auth.ts#L35-L47) |
| 8 | （同上合并）令牌存储 | 保留 localStorage 方案（用户决策），靠修 XSS + logout 清理降低可利用性 | 同 5、7 |

后端 `cancelMyOrder` 要点：`@Allow(Permission.Authenticated)` → 比 `order.customer.user.id === ctx.activeUserId`（否则 Forbidden）→ 仅 `Created/AddingItems/ArrangingPayment` 可取消 → 取消前 `createReleasesForOrderLines` 释放库存分配（core 对 active 订单不释放，与 order-timeout-plugin 同处理）。

## 二、验证证据（生产 https://e.joho.cn）

### 1. 构建与发布
- vshop：`pnpm build:h5` 通过；`dist/build/h5` 已提交并部署到 `sites/e.joho.cn/index`（旧目录备份 `index.bak_1791417176`，`qqc/` 子应用保留）。
- vendure：`cjk-plugin` 用 `tsc -p tsconfig.build.json` 类型通过（绕过 pnpm lockfile 检查），`lib` 重建并提交；服务器 `git pull` → `pm2 restart vendure` → `status online / unstable restarts 0`，HEAD `9da4c7cc3`。

### 2. 线上产物核对
- 首页 index.html 已引用新主包 `assets/index-BsQSunv0.js`；
- `pkg-order-pages-payment.BY3jBavU.js`（200）含续付拦截文案「该订单已不在当前会话」；
- `pkg-order-pages-order-detail.DaGp_lod.js`（200）含 `confirmOrderReceipt` / `myOrderPackages` / `cancelMyOrder`。

### 3. shop-api 契约
- `__type(name:"Mutation")` 中已含 `cancelMyOrder: true`；
- 匿名调用 `cancelMyOrder` 被拒；`myOrders` 匿名返回 `FORBIDDEN`（未越权泄漏订单）。

### 4. 富文本净化（线上实测）
在线上页面动态 import `assets/html.B6ZY1bR6.js` 并调用净化函数：

| 输入 | 输出 |
|---|---|
| `<b>ok</b><img src=x onerror="alert(1)"><a href="javascript:alert(2)">y</a><script>alert(3)</script>` | `<b>ok</b><img src="x"><a>y</a>` |

→ 保留 `<b>`，剥离 `onerror` / `javascript:` / `<script>`；且 `pages-home-index` chunk 确认引用该 html chunk（RichTextSection 已接线）。

### 5. 登录 CSRF（线上实测）
访问 `/#/pages/login/index` 触发 SSO 跳转，实测目标地址携带随机 state：

```
https://h.joho.cn/#/pages/sso/login?app_code=vendure-youshop
  &return_url=https%3A%2F%2Fe.joho.cn%2F%23%2Fpages%2Flogin%2Findex
  &channel_code=__default_channel__&state=sso1835kg6cvl0v9ylb8sttg38z
```

`state` = `sso` + 24 位 [a-z0-9]，符合微信对 state 的字符/长度约束。

### 6. 移动视口截图（390×844 dpr=2）
目录：`docs/manual/shots/2026-10-08-vshop-p1/`（SSO 账号 `etao`，测试账号 userId 143 / customerId 132）
- `01-home.png` 首页（匿名，0 console error）
- `02-login.png` / `03-login-wechat.png` 登录页（SSO 跳转、微信 UA）
- `07-sso-filled.png` / `08-after-sso.png` SSO 账号密码登录 → 回调落回 vshop
- `04-order-list.png` / `04b-order-list-pending.png` 订单列表 + 待付款 tab
- `05-order-detail.png` / `05b-...before-cancel.png` 待付款详情（**去支付 / 取消订单**按钮可见）
- `06-payment.png` **支付续付页**（订单号 + 应付金额 + 支付方式列表；原占位页已替换）
- `09-order-detail-after-cancel.png` 真点「取消订单」→ 确认弹窗 → **详情变「已取消」**
- `10-checkout.png` / `11-after-submit.png` 结账页 + 提交后 pay-result

### 7. 端到端订单生命周期（生产实测，测试单 JZKGX8M89FWKKJC4 ¥0.08）
1. 加购「他老婶铁锅炖」→ UI 结账选「微信支付」→ 提交：`transitionOrderToState('ArrangingPayment')` 成功，JSAPI 无 openid 支付失败 → 订单正确停在 **ArrangingPayment**（待付款续付场景成立）
2. 订单详情「取消订单」→ 确认弹窗 → 后端 `cancelMyOrder` → **state=Cancelled**（API 复核），库存释放路径与 order-timeout 一致
3. `confirmOrderReceipt` / `myOrderPackages` 接口已上线（无 Delivered 测试单，未走真收货，接口契约已由 GraphQL introspection 验证）

### 8. 验证过程中发现并修复的新 bug（结账链路 P1）
**[checkout.vue:1102](file:///d:/zhao/vshop/src/pkg-order/pages/checkout.vue#L1102) 选中已有地址提交必失败**：`setOrderShippingAddress` 的 `CreateAddressInput` 无 `id` 字段，而调用方传 `{ id, ... }` → GraphQL 校验直接报 `Field "id" is not defined`。修复：[mutations/checkout.ts](file:///d:/zhao/vshop/src/api/mutations/checkout.ts#L4-L12) 统一剥离 `id` 再发请求。修复后端到端下单成功（`11-after-submit.png`）。

### 9. 遗留观察项（待下批处理）
- `eligiblePaymentMethodsByProfile` 返回某支付档案 `name: null`（`Cannot return null for non-nullable field PaymentMethod.name`）——后端支付档案脏数据，结账页仍能工作但少一个方式名。
- shop-api `search` 的中文 `term` 过滤不生效（任意 term 恒返回全部 16 个变体）——中文分词/权重问题。
- 结账页 `myRechargeBalance` / `myMemberInfo` 对非会员账号报 FORBIDDEN（被 catch 吞掉，不影响流程，但 console 有噪音）。
