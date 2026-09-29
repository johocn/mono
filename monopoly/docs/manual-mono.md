# 大富翁 · 吉林双阳邻里商业版 操作手册与测试用例

## 1. 启动与调试

| 项 | 值 |
|---|---|
| 本地开发 | `npm run dev` → http://127.0.0.1:52300/mono.html |
| 移动视口预览 | Playwright `viewport=390×844, deviceScaleFactor=2` |
| 构建 | `npm run build` → `release/mono.html` + `release/js/mono.js` |
| 部署 | `npm run deploy`（= `node ../scripts/deploy-mono.mjs`，`--dry` 只本地构建+打包） |
| 线上回归 | `npm run check:prod`（打真实 URL `https://game.joho.cn/tour/mono.html`） |
| 校验 | `npm run check`（lint + lint:skin + test） |

URL 参数：`?skin=<id>`（切皮肤）· `?debug=1`（显示元素 ID/包围盒/depth/provider 回退级别）· `?seed=<n>` · `?speed=<n>`（动画时轴倍率）· **默认即交互局**（裸链接进站即玩）· `?demo=1`（演示棋盘，= 旧裸入口行为）· `?play=1`（等价默认；`?play=0` 同 `?demo=1`）· `?nofx=1`（等价 `speed=999`，动画瞬间到终帧）· `?perf=1`（性能覆盖层 + 帧间隔采样）。

## 2. 测试用例

### M1 工程骨架

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M1-1 | 打开 `mono.html?debug=1` | 出现 390×844 画布、底部 debug 面板、无控制台错误 | `mono-m1-01-boot.png` |
| M1-2 | `npm run lint:skin` | `[skin:default] OK` | — |
| M1-3 | 在 `src/render/*.ts` 写一个 `#ff0000` 或 `26` | `npm run lint` 报错 | — |

### M2 等距棋盘

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M2-1 | 打开 `mono.html?debug=1` | 32 个菱形地砖，类型配色正确（core/shop/chance/fate/bonus/jail/stock） | `mono-m2-01-board.png` |
| M2-2 | 观察内环 | 草地/石板路/广场分区正确，中心喷泉可见，8 栋装饰楼压暗 | `mono-m2-02-board-inner.png` |
| M2-3 | 检查 32 个字牌 | 全部汉字店名可读、无一被前排建筑遮挡 | `mono-m2-03-board-labels.png` |
| M2-4 | 观察当前格 | 四枚棋子一排站在格前沿，未盖格名；当前格金框高亮 | `mono-m2-04-board-pawns.png` |

### M3 三级建筑与地块橱窗

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M3-1 | 打开 `mono.html?debug=1&show=0` | 32 格上的等距楼按层级成形：L1 坡顶摊位、L2 两层暖光窗 + 金色店招、L3 玻璃幕墙 + 霓虹 + 招牌塔 + 天线；店招文字随墙面角度旋转（约 −26.57°） | `mono-m3-01-board.png` |
| M3-2 | 打开 `mono.html?debug=1&show=b` | 地块橱窗 B 版式：夜空渐变 + 月亮 + 亮窗天际线 + 石板广场 + 两树两灯 + 温泉馆（出檐 / 竖招牌「温泉」/ 双灯笼「汤」/ 池面蒸汽）+ 顶部药丸 + 底部信息条 | `mono-m3-02-showcase-b.png` |
| M3-3 | 打开 `mono.html?debug=1&show=c` | C 版式三级对照：三张等宽迷你卡同一地平线，L1/L2/L3 体量差一眼可辨；卡下标签 `L1 摊位 · ￥60` / `L2 门店 · ￥180` / `L3 商超楼 · ￥420` 字号一致 | `mono-m3-03-codex-c.png` |
| M3-4 | 右下角版式切换行点「棋盘 / 橱窗 B / 对照 C」 | 只改 URL 的 `show` 参数并重载，画面随之更换 | — |
| M3-5 | 打开 `mono.html?debug=1&skin=photo&show=0` | **零代码换风格**：中心喷泉 / 两棵树 / 四盏灯 / 玩家一棋子变图片素材，其余仍是默认皮肤；控制台执行 `__monoMain.missingAssets.length` 得 `0` | `mono-m3-04-skin-photo-board.png` |
| M3-6 | 打开 `mono.html?debug=1&skin=photo&show=c` | 三张迷你卡变图片素材（`tex/card.png`），卡下标签文字仍由文字通道绘制、字号不变 | `mono-m3-06-skin-photo-codex-c.png` |
| M3-7 | 跑 `node local/mono-shots-m3.mjs` | 6 张 390×844 @dpr2 截图入库，`gate` 全 `true`、`errors` 为空 | 上述全部 |

**v5 对齐结论**：M3-1 / M3-2 / M3-3 三张截图已与 `v5-A.png` / `v5-B.png` / `v5-C.png` 目视对齐。两处**有意偏差**：① 迷你卡天际线高度分档做 `((lx % 3) + 3) % 3` 归一化（v5 负 `px` 会算出负楼高）；② v5 卡外标签是 HTML `div`，本工程改用文字通道画在卡下方、字号不随卡缩放。

### M4 回合 HUD 与整局对战

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M4-1 | 打开 `mono.html?debug=1&play=1&seed=20260928` | 上=等距棋盘，**中=当前落点地块的橱窗**（spec §6 版式 A：夜空 + 天际线 + 广场 + 楼体 + 店名药丸 + 信息条，随 `paint()` 在 move/settle/upgrade 后同步；play 下不画 CTA 金按钮，棋盘上已有真实买卖键），下=底部操作坞：顶部金色提示条 + 状态行「第 1 轮 · 轮到 你」+ 4 条玩家资产条（当前玩家金框）+ 两个骰面（未掷为暗底空面）+ 金色「掷骰」按钮；地砖归属色与棋子位置跟游戏状态联动 | `mono-m4-01-hud.png` |
| M4-2 | 依次点主按钮「掷骰」→「前进」→「结算」 | 三个动作按回合阶段递进（`idle→rolled→moved→settled`），骰面显示本回合点数（`seed=20260928` 时为 6+2）；结算后按钮变「结束回合」，若落格无主 shop 则在左侧出现「买地 ￥60」、若自有则在右侧出现「升级 ￥180」 | `mono-m4-02-settled.png` |
| M4-3 | 控制台执行 `__monoMain.sim()` | headless 一路自动跑到分出胜负，返回胜者 id（1..4）；状态行变「本局结束 · 胜者 老王」，主按钮变为灰置禁用的「本局结束」（不再可点，胜者按净资产判定）；`__monoMain.game.state.round` ≤ 61 | `mono-m4-03-final.png` |
| M4-4 | 现金不足时点「买地」（把 `__monoMain.game.state.players[0].cash` 改成 10 后 `__monoMain.paint()`） | 按钮仍在但变灰且点不动（边界校验，不隐藏） | — |
| M4-5 | 跑 `node local/mono-shots-m4.mjs` | 3 张 390×844 @dpr2 截图入库；`gate` 全 `true`、`errors` 为空 | 上述全部 |

**默认入口（2026-09-29 起）**：裸链接 `mono.html` 即交互局，HUD（资产条/手牌/骰子）首屏齐备；演示棋盘与 B/C 版式改由 `?demo=1&show=b|c` 进入（play 分支不经过 `demoView`，故橱窗版式必须显式加 `demo=1`）。此前裸入口为演示棋盘，曾导致「主页面没有玩家信息 / 没道具 / 看不见骰子」的误判，根因与修复见 `docs/superpowers/specs/2026-09-29-mono-default-entry-design.md`。

**M4 结论**：`src/core` 全部单测通过（`board` / `economy` / `dice` / `board-path` / `estate` / `game` 共 53 例，`test/core` 全量 57 例）+ 端到端整局可跑（`__monoMain.sim()` 返回胜者、`round ≤ ROUND_LIMIT + 1`）；该「整局可跑」已由 **M7-4 真实点击整局**复证（973 次点击跑到 `over=true`，不经 `sim()`）。有意偏差：楼体层级仍走演示层级 `slotLevelsOf()`（实时升级动画并入 M6），地砖归属色与棋子位置已跟游戏状态联动。

### M5 卡牌 / 股票 / 特殊格

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M5-1 | 打开 `mono.html?debug=1&play=1&seed=20260928` | 底部出现手牌 5 槽（炸弹/路障/免罚/迁点/租金翻倍），持有为亮、免罚为被动灰槽 | `mono-m5-01-hand.png` |
| M5-2 | 点「炸弹」再点对手地块 | 目标楼降 1 级（L1 炸回无主），手牌炸弹消耗、地块归属色消失 | `mono-m5-02-bomb.png` |
| M5-3 | 控制台把 `players[0].pos` 移到命运/机会格前并走一步 | 浮层出现抽卡翻牌，`state.lastDraw.deck` 与牌面文案来自 `cards.ts`；右上角可见「关闭」键（点掉浮层） | `mono-m5-03-draw.png` |
| M5-4 | 走到 index 19 股票交易所 | 弹出股票盘：4 支行（上排 代码/名称/现价/涨跌，下排「持股 n / 市值 ￥n」）+ 近价折线走势图（端点涨跌色脉冲）；盘底可见「买 1」「卖 1」键，点「买 1」后持股 +1、现金 −价 | `mono-m5-04-stock.png` |
| M5-5 | 落到 index 12 监狱 | 状态行显示「禁行 2 回合」，主按钮变「跳过（1）」；持有免罚卡则自动抵消、不进监 | `mono-m5-05-jail.png` |
| M5-6 | 控制台 `__monoMain.sim()` | 跑到胜负，结算面板展开含 4 行名次（净资产含地产 + 股票市值）（真实点击整局见 M7-4） | `mono-m5-06-settle.png` |
| M5-7 | 跑 `node local/mono-shots-m5.mjs` | 6 张截图入库；`gate` 全 `true`、`errors` 为空 | 上述全部 |

**M5 结论**：卡牌/股票/特殊格三套系统接入 `Game` 门面，`src/core` 新增 `cards`/`stocks`/`special`/`game-cards` 单测全绿；牌堆各 6 张、棋盘仍 5 fate + 5 chance 格（口径解耦）。

### M6 动画层（§5.6 全清单）与性能

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M6-1 | `mono.html?play=1&speed=0.25` 点「掷骰」 | 骰体绕轴旋转 + 弹跳后停下（≥12 帧观感；点屏可加速） | `mono-m6-01-dice.png` |
| M6-2 | 点「前进」 | 棋子放大后逐格起跳（kick 起跳段腾空 52px + 抛物线落向目标格），起跳点与落点各扬起一圈落尘（6 粒/圈） | `mono-m6-02-hop.png` |
| M6-3 | 落格无主空地后点「买地」 | 红章旋正盖下 + 一圈金币飞出飞向持有者 | `mono-m6-03-buy.png` |
| M6-4 | 点「升级」 | 脚手架淡入 → 落成 → 逐层点亮火花（L1→L2→L3） | `mono-m6-04-upgrade.png` |
| M6-5 | 走到对家地块结算 | 金币飞向持有者 + 落点火花脉冲 | `mono-m6-05-rent.png` |
| M6-6 | 走到命运 / 机会格 | 卡面横向自侧面展开（翻面入场）+ 高光横扫；中间帧卡面已展到近满宽、标题与正文可读（非边缘朝上） | `mono-m6-06-card.png` |
| M6-7 | 使用手牌（炸弹等） | 牌背放大后左右/上下轻微震动 + 淡出 | `mono-m6-07-deck.png` |
| M6-8 | 买 / 卖股票 | 菱形脉冲块放大到红/绿脉冲峰值示意涨跌 | `mono-m6-08-stock.png` |
| M6-9 | 控制台 `__monoMain.sim()` | 16 枚四角火花自屏心环形迸发、半径展开到 ≈210px（铺满屏）+ 结算面板展开 | `mono-m6-09-end.png` |
| M6-10 | 跑 `node local/mono-shots-m6.mjs` | 9 张中间帧 + 1 段录像（`mono-m6-anim.webm`）入库；`gate` 全 `true`、`errors=[]`；**9 张截图内容哈希两两不同且均 ≠ 空场景 baseline**，每张 `fx.bounds()` ≥ 40×40 | 上述全部 |

**动画权威性**：`?speed=0.25` 慢放下逐条断言「动画播放中 `game.state.phase` 不变化」与「`fx.skip()` 后 phase 与不加动画一致」——状态机先落库、动画只回放。`?nofx=1` 等价 `speed=999`（瞬间到终帧）；动画播放中主按钮变「跳过」（点屏即加速到终帧，不取消、不吞点击）。

**中间帧截取口径**：闸门用 `fx.progress()`（GSAP 时轴**真实相位**）轮询定位，不再按 `motionFor().durationMs` + 墙钟推算——后者对 `buy`/`rent`（金币错峰使时轴 900ms > 声明的 460/520ms）与 `end`（时轴 900ms、火花 620ms）会算错，曾截在动画结束 `cleanup()` 之后得到空帧。新增 `fxHandle.progress()/totalMs()/bounds()`（`bounds` 只统计本次 `spawn` 的元素，不含 HUD）。动效元素一律「preset 局部坐标绘制（`cx/cy=0`）+ 容器 `position` 承载台位」，避免 preset 绝对坐标与 GSAP 绝对补间二次叠加。

**版式 A 中部橱窗**：`?play=1` 时中部条带（≈300..606）渲染当前玩家落点地块的橱窗，**完整复用** B 版式同一批注册表元素/preset（`showcase.panel/sky/skyline/ground/tree/lamp/shop/sign/lantern/banner/hud`），不另造美术；`showcaseHud` 新增 `state.barDy`/`state.btnOn` 两个开关（经 state 传参，避免 `only()` 整替换 provider 丢 skin params）。布局常量在 `src/skin/layout.ts`（`PLAY_SHOWCASE_Y=300` / `PLAY_HUD_BAR_DY=-40` / `PLAY_SHOP_S=2.6`），`src/render/**` 零新增字面量。`?show=b|c|0` 仍作独立版式开关（非 play 路径完全不经过 play 分支）。

**性能核对行**（两种成本分开测：`node local/mono-perf.mjs` 桌面代理 + `npm run perf:android` 的 CDP CPU 节流代理；真机 60fps 最终仍需人工勾选）：

| 指标 | 门槛 | 实测（default / photo） | 结论 |
|---|---|---|---|
| 首屏可交互 | < 3000ms | 248 / 1096 ms | ✅ |
| 单次全量重绘 p95（状态切换卡顿） | ≤ 20ms | 15.6 / 17.6 ms | ✅ |
| 场景绘制元素数（pass 1–3） | < 200 | 189 | ✅ |
| fx 峰值 overlay 元素数 | < 40 | 12 | ✅ |
| 真机 60fps（中端安卓）→ CDP 节流代理（4× ≈ 中端安卓，**非真机实测**） | **每帧渲染** p95 < 16.7ms | 空闲 p50 1.0–2.2 / **p95 4.4–10.0 ms**；动效中 p50 1.8–2.6 / p95 3.1–14.7 ms | ✅ 代理帧预算内；真机待人工 ☐ |

**两种成本必须分开（读 `src/main.ts` / `render/Scene.ts` / `render/stage.ts` 的结论）**：**每帧**跑的是 Pixi `TickerPlugin` 以 `UPDATE_PRIORITY.LOW` 每帧调用的 `app.renderer.render({container: app.stage})`——只渲染**既有**场景图、**不** `instantiate`；`paint()` 全仓仅在 boot 与离散动作（`runAction`）时调用，**绝不逐帧**；GSAP 补间跑在 gsap 自己的 rAF ticker 上。故「能否稳定 60fps」只能由**每帧渲染成本**支撑；`paint()` 是**状态切换的一次性卡顿**。

**真机帧率的可复现代理（CDP CPU 节流，`npm run perf:android`）**：打线上 URL（390×844 dpr2，`play=1&nofx=1&perf=1`）；4× ≈ 中端安卓（判定基准）、6× ≈ 低端压力（只报告）。每帧渲染 patch `app.renderer.render`（ticker 每帧真实调用的入口，不额外多渲染）逐帧采 ≥30 帧；状态切换 rAF 逐帧计时 `paint()`。同机连测 3 次区间：

| 指标 | 1× 桌面基线 | 4× 中端安卓代理 | 6× 低端压力 |
|---|---|---|---|
| 每帧渲染 空闲 p50 / p95 | 0.4 / 0.5–0.8 ms | 1.0–2.2 / **4.4–10.0 ms** | 2.2–3.9 / 7.6–15.8 ms |
| 每帧渲染 动效中 p50 / p95 | 0.4–0.5 / 0.6–0.8 ms | 1.8–2.6 / **3.1–14.7 ms** | 3.0–4.1 / 6.4–22.0 ms |
| 状态切换重绘 p50 / p95 | 4.6–5.6 / 7.9–12.2 ms | 20–23 / **42–56 ms** | 37–41 / 56–84 ms |
| 首屏可交互 | 0.30–0.84 s | 1.27–1.36 s | 1.27–1.37 s |
| 场景元素 pass 1–3 / 整帧 total | 189 / 219 | 189 / 219 | 189 / 219 |

- **60fps 结论（由每帧渲染驱动）**：4× 代理下每帧渲染 p95 = **4.4–10.0 ms**（动效中 3.1–14.7 ms）**< 16.7 ms 帧预算** → 代理口径**支持**「中端安卓可 60fps」；6× 低端压力动效帧 p95 达 22 ms（≈45fps）。**绝非真机实测**。
- **状态切换卡顿（单独、有界）**：4× 下 `paint()` p95 = 42–56 ms ≈ **2.5–3.4 帧预算**（每次动作切换一次性卡顿 ≈ 占 3–4 帧 / 掉 2–3 帧）；**整局 ≈ 928 次状态切换**（`rollDice/moveCurrent/settleCurrent/endTurn` 各 218 + 买 17 / 升级 17 / 跳过 22），即每次动作点按带一次 ≈20–56 ms 切换卡顿——**「全量重建」架构的常态**（感知为点按后轻微延迟，非持续掉帧）。整局 `sim()`（4×）墙钟 38–155 ms 且 `winner=2 / round=61 / over=true` → 玩法逻辑非瓶颈。
- **诚实声明**：真机 60fps **从未在真机测量**（本机无中端安卓设备）；headless rAF 被限到 ~20fps（帧间隔不可当真机帧率）；代理测的是**主线程**渲染提交成本（GPU 光栅在软件 GL 下异步、真机为硬件加速），用软件 GL + 4× 节流近似中端安卓 CPU。**真机 60fps 最终以手机打开 `?perf=1` 的读数为准**，该项保留人工在真机勾选 ☐。`perf:android` 在**每帧渲染** p95 > 16.7ms 或首屏 ≥ 3000ms 时 `exit(1)`（`--report-only` 恒 `exit 0`）。

**M6 结论**：§5.6 九条动效全部落地（GSAP 编排；时长/弧高/粒子数一律经 `src/skin/layout.ts` 的 FX 段 + `skin.json` 的 `fx` token 注入，`fx.ts` 零裸色值/裸时长，`check-hardcoded` 通过）；动画只消费 `instantiate()` 产出的实例、绝不写 `state`。

**M6 有意偏差（精确记录）**：spec §11.5 预算「单帧绘制调用 < 200」按**场景渲染（pass 1–3）= 189** 计（✅）；若把**屏幕空间 HUD/浮层（pass 4）也算进整帧元素则 = 205**（M4/M5 常驻的底坞/资产条/骰面/手牌共 16 件）。该 205 是**元素实例数**而非 GPU 绘制调用数——Pixi 会对同状态图元合批，且 HUD 为静态屏幕空间图元，故不影响「绘制调用 < 200」。另：headless Chromium 的 rAF 被浏览器限到 ~20fps（帧间隔 p95 ≈ 66.7ms），**不可当真机帧率**，故门槛以「单次全量重绘 p95 ≤ 20ms」作为可测代理，真机 60fps 由人工核对行兜底。GSAP 打进 `release/js/mono.js`：473.04 kB（gzip 159.08 kB）。

### M7 部署与线上回归

| # | 步骤 | 期望 | 证据/截图 |
|---|---|---|---|
| M7-0 | 手机打开 `https://game.joho.cn/tour/mono.html`（**无参数**） | 进站即交互局：底部资产条 4 条 + 手牌 5 槽 + 两枚骰面齐备，`#mono-hud` 满屏 390×844，无控制台错误 | `mono-prod-00-default.png` |
| M7-1 | `node scripts/deploy-mono.mjs`（=`npm run deploy`） | 本地构建 → tar 整包 → scp → 服务器仅解压（无服务器构建）；`mono.html` 200、`js/mono.js` 线上字节数=本地、`skins/photo/skin.json` 200 | 七步输出见下 |
| M7-2 | `node local/mono-prod-check.mjs`（=`npm run check:prod`） | 线上无报错、元素计数一致、`?skin=photo` 可用、整局可跑（程序化 `sim()`；**真实点击整局**另见 M7-4） | `mono-prod-01..03` |
| M7-3 | 手机打开 `https://game.joho.cn/tour/mono.html?play=1` | 与本地同 seed 同画面、可完整打一局 | — |
| M7-4 | `node local/mono-e2e-playthrough.mjs`（=`npm run e2e:play`） | **真实点击整局**（只用透明命中层 `#mono-hud button[data-action]` / `#mono-panels button[data-action]`，**非 `sim()`**）：seed=20260928 一路点到 `state.over=true`、结算面板给出胜者 + 4 行名次，未见「点击不变状态」；逐次断言状态、硬上限 61 轮 + 墙钟超时兜底；7 张关键截图两两内容哈希不同且非空；无 pageerror / console error | `mono-e2e-01-start.png` … `mono-e2e-07-final.png` |

**部署记录**（ts `20260929-024938`；本次为修复 `upgradeOffer` 的「施工中」边界后重部署，用于 M7-4）：
- `ROOT = /opt/1panel/apps/openresty/openresty/www/sites/game.joho.cn/tour`（`location ^~ /tour/` alias 到此目录，替换即时生效、无需 nginx reload）
- 备份 `tour.bak-20260929-024938`（脚本保留最近 **3** 份、多余自动删；本次现存 3 份：`024938` / `021448` / `020158`）
- 校验：`https://game.joho.cn/tour/mono.html` → **200** ✅；`js/mono.js` 线上/本地 = **473051 / 473051 bytes** ✅（现行值）；`skins/photo/skin.json` → **200** ✅
- 线上 URL：<https://game.joho.cn/tour/mono.html>

**部署记录（最新，ts `20260929-064040`）**：商家真名**授权放行后**重部署（含阶段一「静态认领」配置加载能力；出厂 `public/config/shops.json` 仍为 `shops: []`，故线上零配置变化）。
- 校验：`https://game.joho.cn/tour/mono.html` → **200** ✅；`js/mono.js` 线上/本地 = **483744 / 483744 bytes** ✅；`skins/photo/skin.json` → **200** ✅
- 备份 `tour.bak-20260929-064040`（现存最近 3 份：`064040` / `031606` / `024938`）
- 线上回归 `node local/mono-prod-check.mjs` → 退出码 **0**、7 项 gate 全 `true`、`errors=[]`（元素计数 32/4/2/5；`sim()` 胜者 4、`round=61`；`?skin=photo` `missingAssets=0`、image 实例 8）
- 授权状态同步：`src/data/board.ts` 文件头与本节 §4 的「未授权·禁止部署」守卫已改为「已获授权 · 已公开部署」（详见 §4.4）

**线上回归记录**（`node local/mono-prod-check.mjs`，退出码 **0**，`gate` 全 `true`、`errors=[]`）：
- `board.tile.*`=32 / `ui.playerBar`=4 / `dice.body`=2 / `ui.handSlot`=5（与本地闸门一致）
- `__monoMain.sim()` → 胜者 4、`state.over=true`、`round=61`
- `?skin=photo`：`__monoMain.missingAssets=0`、image provider 实例 8（图片素材线上就位）
- 截图：`docs/verify/mono-prod-01-board.png` / `mono-prod-02-play.png` / `mono-prod-03-skin-photo.png`

**真实点击整局记录**（`node local/mono-e2e-playthrough.mjs` = `npm run e2e:play`，退出码 **0**，`gate` 全 `true`、`errors=[]`）：
- 完成方式：**真实点击**（逐次点透明命中层 `#mono-hud`/`#mono-panels` 的 `data-action` 按钮，全程**不经 `sim()`**）；URL = `https://game.joho.cn/tour/mono.html?play=1&seed=20260928&nofx=1`
- seed=`20260928` · `round=61` · `state.over=true` · 胜者「小赵」（结算面板 4 行名次）
- **点击总数 973**：掷骰 209 / 前进 209 / 结算 209 / 结束回合 209 / 跳过 31 / 买地 17 / 升级 27 / 抽卡关闭 60 / 用卡（租金翻倍）1 / 股票买 1；全程无一次「点击未改变状态」
- 首末截图：首 = `docs/verify/mono-e2e-01-start.png`，末 = `docs/verify/mono-e2e-07-final.png`；另含 `mono-e2e-02-firstbuy` / `03-firstupgrade` / `04-jail` / `05-draw` / `06-stock`（7 张 390×844 @dpr2，哈希两两不同且均非空）

**环境偏差（精确记录）**：① 脚本步骤 1 在 Windows 上经 `powershell.exe -NoProfile -Command "npm run build"` 调起（等价 `npm run build`）——经 `cmd.exe` 间接 spawn npm 时 vite 6.4 抛 `[vite:html-inline-proxy] No matching HTML proxy module found`（已实测复现），改走 PowerShell 即稳；② 远程校验用 Node 内置 `fetch` 替代计划里的 `curl | wc -c`（Windows 无 `wc`、`curl` 为 PowerShell 别名），字节数比对等价。服务器侧始终只 `cp`/`tar -x`，绝无 `npm`/`vite`/`node`。

### M8 微信分享 / 裂变入口

**定位**：M1–M7 完成后新增的**独立分享层**（`src/ui/share.ts` + `src/data/share.ts`），不依赖券/积分/认领等商业闭环决策。可见像素全在 **DOM/CSS 层**（按 M1–M7 约定：只有画在画布上的可见像素才走注册表 + `skin.json`），故 `src/render/**` 零改动、`npm run lint`（禁写死 gate）不受影响。

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M8-1 | 打开 `mono.html?play=1&seed=20260928&nofx=1` | 左上角顶栏留白带出现金色药丸「分享」CTA（`#mono-share button[data-action="share"]`，台位 `{left:8, top:5, w:78, h:26}`），不压底部操作坞 / 手牌浮层 / 中部橱窗 / 棋盘 / 右上角 `?debug=1` 切换器 | `mono-share-01-cta.png` |
| M8-2 | 点「分享」 | 底部弹出分享浮层：标题「分享给街坊」+ 分享卡预览（标题 / 描述）+ 按钮「复制链接」「关闭」；点「复制链接」得「标题\\n描述\\n<无 `#` 的页面 URL>」 | `mono-share-02-result.png` |
| M8-3 | 控制台 `__monoMain.sim()` 终局后再点「分享」 | 浮层多出「复制战绩」按钮，文案为「我在双阳邻里大富翁里赢麻了 / 被街坊们收了租（净资产 ￥X）」，随胜负切换 | 同上 |
| M8-4 | **非微信**环境打开 | `window.__monoShareStatus === 'skipped'`；页头 `og:*` / `twitter:*` meta 就位；无控制台报错 | — |
| M8-5 | 微信 UA + 签名端点**未配置**（返回空签名）打开 | `window.__monoShareStatus === 'fallback'`；不加载 SDK、静默降级到「复制链接」兜底；**无控制台报错 / 无未捕获异常** | `mono-share-03-fallback.png` |
| M8-6 | 跑 `node local/mono-share-check.mjs` | 13 项 `gate` 全 `true`、`errors=[]`、退出码 0 | 上述全部 |

**分享卡参数**（改文案只动 `src/data/share.ts`，**不在渲染代码里写死**）：

| 项 | 值 |
|---|---|
| `og:title` | 双阳邻里大富翁 · 掷骰逛遍 32 家街坊好店 |
| `og:description` | 吉林双阳的邻里商业版大富翁：买地、升级、收租、炒股，一局打完看谁是街坊首富。 |
| `og:image` | `<页面同源>/share/share-card.png?v=<SHARE_VERSION>`（绝对 URL，`?v=` 破微信缓存） |
| `og:url` | `<页面 URL 去掉 # 之后>`（微信签名/卡片要求不含 `#`） |
| 尺寸 | 800×640（5:4，`summary_large_image`） |

**分享缩略图生成**：`node tools/gen-share-card.mjs`——Playwright 打开本地 dev（默认 `http://127.0.0.1:52300`）隐藏 UI 后截真棋盘 dpr2 主视觉，再合成 800×640 品牌卡（标题 / 副标题 / 城市徽标），写 `public/share/share-card.png`；产物体积 > 300KB 即 `exit(1)`（微信对大图不友好）。当前产物 **800×640 · 274903 bytes（268.5 KB）**。该图随 `npm run build` 复制进 `release/` 被 deploy 整包带上线。

**微信 JS-SDK 签名契约（复用 zhao-sso，勿另造）**：

- 端点：`POST https://h.joho.cn/api/zhao-sso/v1/auth/jssdk-signature`（`game.joho.cn` 自身 nginx **无** `/api/` 代理，故客户端**跨域**直连 `h.joho.cn`；Strapi CORS 反射 `Origin`，已实测 `Access-Control-Allow-Origin: https://game.joho.cn`）。
- 请求体：`{ "url": "<不含 # 的页面 URL>", "appType": "official_account" }`。
- 响应体：`{ appId, timestamp, nonceStr, signature }`（`signature` = `jsapi_ticket=..&noncestr=..&timestamp=..&url=..` 的 SHA1）。
- 服务端 `access_token` / `jsapi_ticket` **已缓存**（`tokenCache` / `ticketCache`，TTL 提前 60s 过期），不会触发微信接口频率限制。
- 客户端拿到签名后：加载 `res.wx.qq.com` JS-SDK → `wx.config` → `wx.ready` 调 `updateAppMessageShareData` / `updateTimelineShareData` 推卡；任一步失败（非微信 / 无签名 / SDK 不可用 / config 抛错 / ready 超时 4s）一律收口到 `fallback`，**绝不抛错**。

**⚠️ 上线前置条件（须公众号管理员在微信公众平台操作，代码侧无法自证）**：把 **`game.joho.cn`** 加入该公众号的「**JS 接口安全域名**」（同一公众号的该名单可配多个域名，本项目与 zhao-sso 各商城**共用同一签名接口**）。**未配置前**，微信内 `wx.config` 会返回 `invalid signature` → 本模块按设计降级为 `fallback`（复制链接兜底，功能不坏、卡片不生效）。

**线上记录**（本地构建 → tar → scp → 服务器仅解压，ts `20260929-031606`；备份 `tour.bak-20260929-031606`）：
- `https://game.joho.cn/tour/mono.html` → **200** ✅；`js/mono.js` 线上/本地 = **481671 / 481671 bytes** ✅；`skins/photo/skin.json` → **200** ✅
- 线上 `og:image` = `https://game.joho.cn/tour/share/share-card.png?v=v1` → **200 · `image/png` · 274903 bytes（= 本地 `public/share/share-card.png`）** ✅；线上 `mono.html` 静态 `<head>` 内 `og:type/site_name/title/description/image/width/height/url` 全部就位 ✅
- `node local/mono-prod-check.mjs` → 退出码 **0**、`gate` 全 `true`、`errors=[]`（元素计数 32/4/2/5；`sim()` 胜者 4、`round=61`；`?skin=photo` `missingAssets=0`）
- `node local/mono-e2e-playthrough.mjs` → 退出码 **0**、`gate` 全 `true`、`errors=[]`（**973 次真实点击**跑到 `over=true`，CTA 不拦截任何点击）

**未在真机微信内自测（诚实声明）**：`bound`（`wx.config` 成功 + 推卡生效）**从未在真实微信客户端验证**——需先完成上面的「JS 接口安全域名」配置；本地闸门只能证明 `skipped`（非微信）与 `fallback`（微信内但签名/SDK 不可用）两条降级链**零报错**，以及签名端点**可达且返回合法签名**（本轮已用 `curl` 实测过端点响应）。真机微信内分享卡片观感（标题 / 缩略图 / 描述）保留人工核对 ☐。

**环境偏差**：`?perf=1` 的性能覆盖层（`left:4, top:4`）与 CTA（`left:8, top:5`）同在左上角，**仅调试开关下**会轻微重叠；正常访问（不带 `?perf=1`）无冲突。若后续要并存，可把 CTA 右移或把覆盖层下移。

### 最终验收（对照 spec §11 硬性标准）

| # | spec §11 条目 | 证据 |
|---|---|---|
| 1 | 手机视口截图（390×844 dpr2） | M1–M8 全部 `docs/verify/mono-*.png`（M7 新增线上 `mono-prod-01..03`；M7-4 真实点击整局另出 `mono-e2e-01..07`——首末 `mono-e2e-01-start` / `07-final`，973 次点击跑到 `over=true`；M8 新增 `mono-share-01-cta` / `02-result` / `03-fallback`） |
| 2 | `src/core` + `src/skin` 单测全覆盖 | `npx vitest run` → **45 文件 / 365 例全绿**（含骰子分布/移动越界/租金/升级互斥/卡牌效果/破产/胜负/回退链；M8 新增 `test/ui/share.spec.ts` 19 例；阶段一新增 `test/skin/shop-config.spec.ts` 9 例 + `instantiate` 覆盖优先级 1 例） |
| 3 | 视觉回归与 v5 样张对齐 | M2-1..4 / M3-1..3 目视结论 |
| 4 | 可换素材（`?skin=photo` 零改代码、缺素材走回退） | M3-5 / M7-2；线上 `missingAssets === []`、image 实例 8 |
| 5 | 性能（中端安卓 60fps、首屏 <3s） | **每帧渲染**（60fps 判定口径）：4× CDP 节流代理 `npm run perf:android` 空闲 p95 4.4–10.0 ms、动效中 p95 3.1–14.7 ms **<16.7ms 帧预算 ✅**；首屏 1.27–1.36s **<3s ✅**；状态切换 `paint()` p95 42–56 ms 属**一次性卡顿**（≈掉 2–3 帧/动作，整局 ≈928 次，架构常态非缺陷）。真机人工勾选 ☐ |
| 6 | 规则化实例化（无裸值、只改注册表 + skin.json、`?debug=1` 可定位） | `npm run lint` 0 错 / `npm run lint:skin` → `[skin:default] OK`、`[skin:photo] OK` / `?debug=1` 面板 |
| 7 | 部署（本地构建 → scp → 服务器仅解压） | M7-1 七步输出 |
| 8 | **M8 微信分享入口（本任务新增，超出 spec §11）** | `node local/mono-share-check.mjs` 13 项 gate 全 true / 退出码 0；线上 `og:image` 200 · `image/png` · 274903 bytes；`local/mono-prod-check.mjs` + `local/mono-e2e-playthrough.mjs` 均退出码 0（详见 M8 节） |
| 9 | **商业闭环·阶段一「静态认领」配置加载（本任务新增，超出 spec §11）** | `node local/mono-shots-shops.mjs` 8 项 gate 全 true / 退出码 0；4 张 390×844 @dpr2 截图（`docs/verify/mono-shops-01..04`）；`npm run check` 45 文件 / 365 例（详见 §5） |

**§11.5 性能实测**（两种成本分开测；`node local/mono-perf.mjs` 桌面代理 + `npm run perf:android` CDP 节流代理；受本机负载影响会抖动，同机连测 3 次的区间如下）：
- 首屏可交互：桌面 default 235–255 ms / photo 1739–1784 ms；4× 节流代理 1.27–1.36 s（门槛 <3000 ✅）
- 状态切换全量重绘（桌面）：**p50 ≈ 7.2 ms**（稳定）；**p95 15.9–28.9 ms（default）/ 19.9–23.5 ms（photo）**——临界于 20 ms 门槛且随负载抖动
- 场景绘制元素数（pass 1–3）：189 < 200 ✅；fx 峰值 16 < 40 ✅
- **4× CDP 节流代理（`npm run perf:android`，中端安卓近似，非真机）——每帧渲染 vs 状态切换分开**：**每帧渲染**（60fps 判定口径）空闲 p50 1.0–2.2 / **p95 4.4–10.0 ms**、动效中 p50 1.8–2.6 / p95 3.1–14.7 ms，**均 < 16.7 ms 帧预算 ✅**；6× 低端压力空闲 p95 7.6–15.8、动效中 p95 6.4–22.0 ms（动效帧会掉到 ~45fps）。**状态切换 `paint()`** p50 20–23 / **p95 42–56 ms** ≈ 2.5–3.4 帧预算——一次性卡顿，每次动作 ≈ 掉 2–3 帧，**整局 ≈ 928 次状态切换**（全量重建架构常态，非缺陷）。整局 `sim()` 4× 墙钟 38–155 ms 且 `winner=2/round=61/over=true`（玩法逻辑非瓶颈）。
- **诚实声明**：**中端安卓真机 60fps 从未在真机测量**（本机无中端安卓设备）。headless Chromium 的 rAF 被限到 ~20fps（帧间隔 p95 ≈ 100 ms），不能当真机帧率。**CDP 4× 节流代理的结论是「代理口径下每帧渲染 p95 4.4–14.7 ms < 16.7 ms 帧预算，支持可稳定 60fps」，但绝非「真机实测 60fps」**；该代理测**主线程**渲染提交成本（GPU 光栅在软件 GL 下异步、真机为硬件加速），用软件 GL + 4× 节流近似中端安卓 CPU，且 `paint()` 只在状态变化时调用（非每帧）。**真机 60fps 最终仍以手机打开 `?perf=1` 的读数为准**，该项保留人工在真机勾选 ☐。

**M7 结论**：M1–M6 产物已发布到 `https://game.joho.cn/tour/mono.html`，线上回归七项闸门全绿（200 / 无报错 / 元素计数 / `?skin=photo` / 整局 / 三张截图 / `errors=[]`）；整局「可跑」另有 **M7-4 真实点击整局**（973 次点击、`over=true`、退出码 0）作为非 `sim()` 的独立证据；部署固化为「本地构建 → tar 整包 → scp → 服务器仅解压」，自带最近 3 份备份与三项字节数校验。

## 3. 真机性能自测（3 步）

性能覆盖层用 `?perf=1`（**注意带 `=1`**；裸 `?perf` 不生效，与其它开关同一 `parseOptions` 口径）。手机直接打线上 URL 即可读数。

| 步 | 操作 | 读什么 |
|---|---|---|
| 1 | 手机浏览器打开 `https://game.joho.cn/tour/mono.html?perf=1` | 左上角出现青色小字覆盖层 |
| 2 | 读覆盖层，滑动 / 掷骰观察是否掉帧 | 覆盖层格式 `fps <n> · scene <n> · total <n>`（11px monospace，固定 `left:4 / top:4`，390×844 下实测 **184×17px**（`x=4, y=4`，右边界 188 < 棋盘左缘），落在棋盘左上角**外侧**，不压棋盘 / 橱窗 / 底坞）。三个字段：`fps` = 1000 ÷ 相邻 `requestAnimationFrame` 间隔（瞬时值）；**`scene` = 场景绘制元素数（render pass 1–3），即「< 200」预算所指的口径**；`total` = 含屏幕空间 HUD / 浮层（pass 4）的整帧元素实例数 |
| 3 | 填下方记录表 | 判定真机 60fps 与卡顿观感 |

**预算与口径**：单帧绘制调用 **< 200** 对应的就是覆盖层的 **`scene`**（= 场景 pass 1–3 ≈ **189**，线上实测 `fps 15 · scene 189 · total 203`）。`total` 是**含 pass 4 屏幕空间 HUD / 浮层的整帧元素实例数**（demo ≈203；play 视局面含手牌 / 浮层 ≈205–219）——这是**元素实例数**（Pixi 会同状态合批，HUD 为静态屏幕空间图元），**非 GPU draw call 数**，故 `total` 高于 200 **不代表超预算**，只看 `scene` 是否 < 200。桌面代理口径（`node local/mono-perf.mjs`）：一次全量重绘 **p50 ≈ 7.2ms**。

**诚实声明（必读）**：`p95` 在开发机实测 **15.9–28.9ms 抖动**，临界 20ms 门槛；**headless Chromium 的 rAF 被限制在 ~20fps**，所以覆盖层在桌面开发机上也会显示约 15–20，**不能当真机帧率**。**真机 60fps 必须人工在手机上确认**（本机无中端安卓设备，该项从未在真机测量）。

**记录表（每次真机自测填一行）**：

| 机型 | 系统 | 浏览器 | 观感帧率 | 是否卡顿 |
|---|---|---|---|---|
| | | | | |

## 4. 替换为真实双阳商家数据

> ✅ **授权状态：已获授权 · 已公开部署**（2026-09-29 业主确认「已取得商家书面授权 + 业主核准」并放行）
> `src/data/board.ts` 的 32 格名称已由 v5 样张的**占位 / 派生**名替换为**双阳本地候选真名**（spec §12 待办项 1），并已随 `20260929-064040` 部署上线（详见 §4.4 执行记录）。
> 授权前本节为「候选清单 · 待确认（禁止公开部署）」；**该守卫已于放行后解除**，线上现行即为下表真名。
> 本文件头（`src/data/board.ts` 顶部）的授权告警已同步为「已获授权 · 已公开部署」。
> 本次仅**改数据**，未改任何代码逻辑、未改棋盘结构 / 格数 / 索引 / 类型序列；经济数值**未**改动（见 §4.5「建议分级价目 · 待平衡」）。

### 4.1 改哪个文件、哪些字段

唯一真源 `src/data/board.ts`。逐格数据是 5 个等长数组（长度 32，`index` 0..31），`TILES` 由它们汇总：

| 数组（`TileDef` 字段） | 含义 / 消费点 |
|---|---|
| `TILE_NAMES`（`name`） | 商家**全名**（如「金鹿源参茸经销处」）；当前渲染未读全名，作主表保留（导出 `nameAt(index)`） |
| `TILE_SHORT`（`short`） | **棋盘 32 格地名字牌**文字（`LabelView.drawLabels` 直画；`labelTextOf → shortAt`） |
| `TILE_BRAND`（`brand`） | **店招 / 楼体 / 橱窗信息条**文字（`building.s*.sign`、`building.s*.l{1,2,3}`、`showcase.*` 均取它） |
| `TILE_TYPES`（`type`） | 格子功能，取值 `core / shop / chance / fate / bonus / jail / stock`；决定地砖元素 ID `board.tile.<type>` |
| `TILE_LEVEL`（`level`） | 演示初始楼层 `0..3`（0 = 空地砖、无楼） |

**租金 / 建造价不是逐格字段**：全局按级 `RENT_BY_LEVEL = [0, 15, 45, 105]`、`PRICE_BY_LEVEL = [0, 60, 180, 420]`（同在 `board.ts`），经 `src/data/economy.ts` 的 `rentOf(level)` / `buyPrice(level)` 消费。**维持现有三级经济模型时，换商家无需改它们**；若要让**每格租金差异化**，须先扩 `TileDef` 与 economy 口径（属功能变更，另立任务）。

**32 格对照表**（格号 | 现占位名 | 候选真名（棋盘字牌 `short`） | 类型 | 依据 / 来源 | 待授权）：

| 格号 | 现占位名 | 候选真名（`name`／`short`） | 类型 | 依据 / 来源 | 待授权 |
|---|---|---|---|---|---|
| 0 | 优美惠市集生鲜超市 | 鹿乡特色小镇（鹿乡小镇） | core · 起点 | 鹿乡镇「中国梅花鹿第一乡」（存栏 20 万只 / 占全国 1/6）· 鹿乡特色小镇 | 地点名 · 待业主核准 |
| 1 | 双阳鹿产品特产店 | 金鹿源参茸经销处（金鹿源） | shop | 鹿乡镇金水街 | 待商家授权 |
| 2 | 命运卡 | 命运卡 | fate | 功能格（非商家），沿用占位命名 | — |
| 3 | 双阳本地农家果蔬店 | 长峰土特产品商店（长峰特产） | shop | 鹿乡镇（李长吉） | 待商家授权 |
| 4 | 太平温泉 | 国信南山温泉酒店（国信温泉） | shop | 国信南山温泉（长清公路 16 公里） | 待商家授权 |
| 5 | 机会卡 | 机会卡 | chance | 功能格（非商家），沿用占位命名 | — |
| 6 | 双阳特色烧烤店 | 御龙温泉度假村（御龙温泉） | shop | 御龙温泉度假村（平湖街道杨家村） | 待商家授权 |
| 7 | 福利中心 | 福利中心 | bonus | 功能格（非商家），沿用占位命名 | — |
| 8 | 农家杂粮店 | 吉吉土特产品商店（吉吉特产） | shop | 鹿乡镇 | 待商家授权 |
| 9 | 命运卡 | 命运卡 | fate | 功能格（非商家），沿用占位命名 | — |
| 10 | 双阳民宿小院 | 国玉庄园（国玉庄园） | shop | 国玉庄园（鹿乡镇鹿缘社区） | 待商家授权 |
| 11 | 双阳糕点面食铺 | 王连申鹿膏／王氏古法熬制鹿膏（王氏鹿膏） | shop | 2025 长春市非遗 · 第四代传承人王姗 · 铜锅百年 | 待商家授权 |
| 12 | 监狱 | 监狱 | jail | 功能格（非商家），沿用占位命名 | — |
| 13 | 山泉饮用水门店 | 鹿产品一条街（鹿品街） | shop | 鹿乡镇「鹿产品一条街」 | 地点名 · 待业主核准 |
| 14 | 机会卡 | 机会卡 | chance | 功能格（非商家），沿用占位命名 | — |
| 15 | 双阳本地松子特产店 | 刘氏鹿茸炮制技艺（刘氏鹿茸） | shop | 市级非遗 · 第五代传承人刘昊 | 待商家授权 |
| 16 | 农家采摘园 | 守鏊仁煎饼（守鏊仁） | shop | 守鏊仁煎饼（鹿乡镇方家村） | 待商家授权 |
| 17 | 命运卡 | 命运卡 | fate | 功能格（非商家），沿用占位命名 | — |
| 18 | 双阳火锅店 | 双阳鹿茸交易市场（鹿茸市场） | shop | 鹿茸交易市场（凌晨开市 · 全国 23 省采购商） | 地点名 · 待业主核准 |
| 19 | 股票交易所 | 股票交易所 | stock | 功能格（非商家），沿用占位命名 | — |
| 20 | 双阳露营基地 | 梅花鹿博物馆（鹿博物馆） | shop | 双阳梅花鹿博物馆 | 地点名 · 待业主核准 |
| 21 | 机会卡 | 机会卡 | chance | 功能格（非商家），沿用占位命名 | — |
| 22 | 粮油米面店 | 广生村农产品（广生农产） | shop | 齐家镇广生村 · 销售点鹿城中央区 | 待商家授权 |
| 23 | 命运卡 | 命运卡 | fate | 功能格（非商家），沿用占位命名 | — |
| 24 | 双阳洗衣生活馆 | 黑鱼葡萄采摘园（黑鱼葡萄） | shop | 黑鱼村（金霞／老王头／广东葡萄园） | 待商家授权 |
| 25 | 机会卡 | 机会卡 | chance | 功能格（非商家），沿用占位命名 | — |
| 26 | 乡村酒厂 | 东龙度假村（东龙度假） | shop | 东龙度假村（齐家镇双顶村） | 待商家授权 |
| 27 | 福利中心 | 福利中心 | bonus | 功能格（非商家），沿用占位命名 | — |
| 28 | 双阳照相馆 | 绿色巨农采摘园（巨农采摘） | shop | 绿色巨农采摘园（齐家镇郭家村） | 待商家授权 |
| 29 | 命运卡 | 命运卡 | fate | 功能格（非商家），沿用占位命名 | — |
| 30 | 农家乐饭店 | 神鹿峰旅游度假区（神鹿峰） | shop | 神鹿峰旅游度假区（山河街道旅游路 18888 号） | 待商家授权 |
| 31 | 机会卡 | 机会卡 | chance | 功能格（非商家），沿用占位命名 | — |

> **统计**：18 栋可建楼（17 `shop` + 1 `core`/起点）**全部**填入上述有据可查的真名；**0 格**需要「待核对」的兜底命名。
> **功能格**（2/5/7/9/12/14/17/19/21/23/25/27/29/31 共 14 格）为命运 / 机会 / 福利 / 监狱 / 股票，非商家，**沿用占位命名不变**。
> **备选（未录取）**：曙光朝鲜族民俗饭店（齐家镇曙光村）——与已录取名单同为有据真名，留作后续替换备选。
> 所有商家名在取得**书面授权**前一律「待授权」；地点 / 公共设施名（鹿乡特色小镇、鹿茸交易市场、鹿产品一条街、梅花鹿博物馆）为**地名**，需业主核准命名而非商家授权。

**配套映射（本次已同步）**：`SLOT_BANNER`（竖幌子文字，仍仅 0 / 4 / 6 / 18 / 26，取值随候选商家改为`鹿乡／温泉／御龙／鹿茸／东龙`）、`SLOT_LANTERN_CHAR`（灯笼字，仍仅 4 / 6 / 18 / 26，改为`汤／泉／鹿／龙`）、`DEMO_OWNER`（演示归属）、`OWNER_HUE`（归属色相）——均在 `board.ts`。格位与键集合**未变**，仅文字随商家同步。

### 4.2 命运 / 机会牌堆

牌堆数据在 `src/data/cards.ts`：`FATE_DECK` 6 张、`CHANCE_DECK` 6 张、`ITEM_CARDS` 5 张（`DECK_SIZE = 6`）。**牌堆各 6 张与棋盘 `fate` 5 格 / `chance` 5 格解耦**（见 `cards.ts` 顶部注释；棋盘上 `fate` = 2 / 9 / 17 / 23 / 29、`chance` = 5 / 14 / 21 / 25 / 31，各 5 格）——改**商家名单不必动牌堆**，只有改**牌面文案 / 金额**才动 `cards.ts`。

### 4.3 改店名 / 店招会牵动哪些元素 ID 与 `skin.json`

- **店名字牌**：由 `LabelView.drawLabels` 直接绘制（**非**注册表元素）→ **无元素 ID、无 `skin.json` 条目**；配色取 `skins/*/skin.json` 的 `tokens.labelBg / labelText / labelOwnedText`。
- **店招 sign**：元素 ID `building.s<slot>.sign`（`slot` 0..31，**仅 L2 / L3 有**）与 `showcase.sign`；`skin.json` 条目 `building.*.sign`（默认 `brand: 门店`）/ `showcase.sign`（默认 `brand: 太平温泉`）——文本按格由 `proc('sign', { brand })` 覆盖。
- **幌子 banner**：`prop.banner` / `showcase.banner`；`skin.json` 条目 `prop.banner`（默认 `text: 市集`）/ `showcase.banner`（默认 `text: 温泉`），文本取 `SLOT_BANNER`。
- **灯笼字**：`prop.lantern` / `showcase.lantern`，字取 `SLOT_LANTERN_CHAR`。
- **楼体 shop**：`building.s*.l{1,2,3}` / `showcase.shop`，`brand` 取 `TILE_BRAND`、`hue` 取 `OWNER_HUE[owner]`。

### 4.4 重建 + 部署 + 线上回归（**已获授权 · 已执行**）

> **执行记录（ts `20260929-064040`）**：2026-09-29 业主确认「已取得商家书面授权 + 业主核准」并放行 → 本地构建 → tar 整包 → scp → 服务器仅解压 → 三项校验全绿；备份 `tour.bak-20260929-064040`（现存最近 3 份）；线上回归 `node local/mono-prod-check.mjs` 退出码 **0**、7 项 gate 全 `true`、`errors=[]`（元素计数 32/4/2/5；`sim()` 胜者 4、`round=61`；`?skin=photo` `missingAssets=0`、image 实例 8）。线上 URL：<https://game.joho.cn/tour/mono.html>
> 后续改数据 / 改 `public/config/shops.json` 后需再次部署时，执行下面的命令。

```powershell
# 本地构建 → tar 整包 → scp → 服务器仅解压（绝不在服务器构建）
node d:\zhao\scripts\deploy-mono.mjs

# 线上回归（打真实 URL；gate 全 true、exit 0）
node local/mono-prod-check.mjs
```

### 4.5 建议分级价目（**待平衡** · 未接入）

现状：租金 / 建造价是**全局按级**（`RENT_BY_LEVEL` / `PRICE_BY_LEVEL`），并非逐格，无法体现「核心商圈地价高、乡镇地价低」。下表按 **核心商圈 / 文旅 / 乡镇** 三档给出**建议乘数与价目**（相对现网基线 `RENT [0,15,45,105]` / `PRICE [0,60,180,420]`），供业主与策划拍板：

| 分档 | 建议乘数 | 建议租金 `rent[L0..L3]` | 建议建造价 `price[L0..L3]` | 归属格号 |
|---|---|---|---|---|
| 核心商圈 | ×1.4 | 0 / 20 / 60 / 150 | 0 / 80 / 240 / 600 | 0 / 1 / 3 / 8 / 11 / 13 / 15 / 18 / 22 |
| 文旅 | ×1.2 | 0 / 18 / 54 / 126 | 0 / 72 / 216 / 504 | 4 / 6 / 10 / 20 / 26 / 30 |
| 乡镇 | ×0.8 | 0 / 12 / 36 / 84 | 0 / 48 / 144 / 336 | 16 / 24 / 28 |

该提案已导出为 `src/data/board.ts` 的 `PROPOSED_RENT_TIER_PLAN`（含 `status: '待平衡'` 与基线对照）与 `PROPOSED_TILE_TIER`（格号 → 分档），**仅供引用、未接入 economy，游戏数值保持原样未被静默改动**。
若要真正启用「逐格差异化」，属**功能变更**（须另立任务）：① `TileDef` 增 `tier` 字段；② `economy.ts` 的 `rentOf / buyPrice` 改为 `(index, level)` 口径按 `tier` 查表；③ 同步橱窗 / 对照卡 / 结算调用点。

### 4.6 上屏预览留证（不部署也能看）

在本地 dev（`npm run dev` → `http://127.0.0.1:52300`）跑 `node local/mono-shots-real-shops.mjs`，产出 **390×844 @dpr2** 三张（均入 `docs/verify/`），业主**无需部署**即可核对候选名单上屏效果：

| 文件 | 内容 |
|---|---|
| `docs/verify/mono-real-01-board.png` | 整块棋盘（`?show=0`，含 32 张汉字字牌） |
| `docs/verify/mono-real-02-labels.png` | 棋盘区放大切图（字牌可读性核对） |
| `docs/verify/mono-real-03-showcase-b.png` | B 版式橱窗（样板地块 slot 4 = 国信南山温泉酒店） |

脚本自带闸门：32 张字牌、含新名（鹿乡小镇 / 国信温泉 / 鹿茸市场 / 神鹿峰）、不含任何旧占位名、`errors=[]`。

**✅ 授权放行记录**：业主已于 2026-09-29 给出该类指令（「确认已授权 → 部署线上」），助手随之执行 `node d:\zhao\scripts\deploy-mono.mjs` 并跑线上回归，结果见 §4.4 执行记录。此后如需再次放行，仍以同类明确指令为准。

## 5. 商家配置加载（商业闭环 · 阶段一「静态认领」）

> 对应立项文档 `docs/superpowers/specs/2026-09-29-monopoly-shuangyang-business-loop-design.md` §6.3 / §6.4 与 §7.1 阶段一验收 ①③。
> **本机制只为「获授权后改配置即可上屏」服务**：授权前 `public/config/shops.json` 保持 `shops: []`，线上零变化。
> 阶段一验收 ②「出码 → 店员核销」走积分 `verify/{qrcode,scan,manual}`，属**服务端/商家侧**，不在本工程内（见立项文档 §3.2）。

### 5.1 怎么用（运营）

- 唯一配置文件 `public/config/shops.json`（构建后 = 线上 `/tour/config/shops.json`）；文件内 `_readme` / `_schema` 自带字段说明。
- 逐条字段：`slot`（0..31 必填）· `merchantName`（全名，展示用）· `short`（**字牌** ≤5 字）· `brand`（**店招 / 楼体 / 橱窗信息条**文字）· `sign:{src}`（店招图）· `building:{src|null}`（楼体图）· `couponTemplateId` / `validDays`（阶段二券联动用，本阶段不消费）。
- 图片 `src` 是**相对皮肤包目录**的路径：`shop/s4-sign.png` → `skins/default/shop/s4-sign.png`（放在任一已加载包 `skins/default/` 或 `skins/photo/` 内均可；启动时按配置即时预装，**无需**写进 `skin.json`）。
- 只列出的地块才被覆盖，其余逐格回退内建名单。

### 5.2 生效链路（工程）

| 环节 | 位置 |
|---|---|
| 读取（相对路径 `fetch`；404 / 坏 JSON → 零配置 `SHOP_DEFAULTS`） | `main.ts` → `loadShopConfig()` |
| 宽松解析 + 回退（纯函数，绝不抛错、不改写入参） | `src/skin/shop-config.ts` → `parseShopConfig()` |
| 图片素材预装（多包逐个尝试，全落空才记 `missingAssets`） | `src/render/assets.ts` → `preloadRelative()` |
| 合成 `overrides` → **回退链第 1 级**（商家覆盖优先于渲染层自带 proc） | `src/skin/instantiate.ts` → `instantiate()` |
| 文案注入（字牌 / 店招 / 橱窗） | `LabelView.drawLabels(textOf)` · `BuildingView(brandOf)` · `ShowcaseView(brandOf)` |

**回退链**（不动渲染代码，符合上游 §3.6/§3.7 硬约束）：商家 `overrides` → 皮肤包 `skin.json` → 全局默认皮肤 → 内建兜底。
配了但缺素材时：该元素回退皮肤 / 内建外观，仅在 `__monoMain.missingAssets` 留痕，**不报错**。

### 5.3 验证（不部署也能看）

```powershell
npm run dev                          # http://127.0.0.1:52300
node local/mono-shots-shops.mjs      # 8 项 gate 全 true、exit 0
```

截图（**390×844 @dpr2**，均入 `docs/verify/`）：

| 文件 | 内容 |
|---|---|
| `mono-shops-01-board.png` | 注入演示清单后棋盘：字牌「示例甲 / 示例乙」替换默认名 |
| `mono-shops-02-showcase-b.png` | B 版式橱窗：店招 / 信息条文案取自配置 |
| `mono-shops-03-photo-sign.png` | `?skin=photo` + 图片店招：`sign.src` 覆盖生效、`missingAssets = []` |
| `mono-shops-04-board-zero-config.png` | **零配置**（不拦截、走 shipped 空清单）→ 与内建默认逐格一致 |

gate 8 项：32 张字牌 / 字牌含注入名 / 默认名已被替换 / `building.s18.sign` 映射为 image / `missingAssets` 为空 / 零配置无 overrides / 零配置字牌为内建默认 / `errors = []`。
> 脚本用 Playwright 拦截 `config/shops.json` 注入**演示名（非真实商家）**，全程不触碰授权问题，也**不部署**。