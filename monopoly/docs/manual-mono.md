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

URL 参数：`?skin=<id>`（切皮肤）· `?debug=1`（显示元素 ID/包围盒/depth/provider 回退级别，**并挂载风格控制台**：点棋盘选元素 → 套 palette / 改 params → 导出 `theme.json`）· **`?theme=<paletteId>`（整体强制套色：`warm-market` / `snow-deer` / `papercut` / `onsen-mist` / `night-neon`；`?theme=off` 回落 `skin.json`）** · `?seed=<n>` · `?speed=<n>`（动画时轴倍率）· **默认 → 首屏弹开局面板**（选完即开局；`?demo=1` 走演示棋盘）· `?play=1`（等价默认；`?play=0` 同 `?demo=1`）· `?nofx=1`（等价 `speed=999`，动画瞬间到终帧）· `?perf=1`（性能覆盖层 + 帧间隔采样）· `?audio=0`（一键全静音：开关初始全关且不创建 `AudioContext`）· `?humans=1..4`（真人数；**缺省 → 首屏弹开局面板**）· `?ai=conservative,aggressive,speculative`（AI 性格序列）· `?tour=1`（强制新手引导）/ `?tour=0`（关闭；缺省首访弹一次）。

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

**M4 结论**：`src/core` 全部单测通过（`board` / `economy` / `dice` / `board-path` / `estate` / `game` 共 53 例，`test/core` 全量 57 例）+ 端到端整局可跑（`__monoMain.sim()` 返回胜者、`round ≤ ROUND_LIMIT + 1`）；该「整局可跑」已由 **M7-4 真实点击整局**复证（973 次点击跑到 `over=true`，不经 `sim()`）。有意偏差：楼体层级仍走演示层级 `slotLevelsOf()`（实时升级动画并入 M6），地砖归属色与棋子位置已跟游戏状态联动。**该偏差已于 M16 关闭**（`BuildingOpts.levelOf` 注入 + `main.ts` 的 `liveLevels()`：演示层级 ∪ 实时地产层级取大值，L4/L5 升级在棋盘上可见）。

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

### M9 AI 对手与开局

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M9-1 | 手机打开 `mono.html`（无参数） | 首屏为开局面板：标题「大富翁 · 双阳」+ 2×2 人数大卡（默认 1 人）+ 3 枚性格徽标卡（保守/激进/投机）+「开始游戏」 | `mono-ai-02-setup.png` |
| M9-2 | 点「开始游戏」 | 面板消失、HUD 就绪；4 条资产条中 3 条带性格徽标，第 1 条（你）无徽标 | `mono-ai-03-started.png` |
| M9-3 | `mono.html?humans=1&tour=0` | 不弹面板直接开局；3 席为 AI，AI 回合主按钮整行显示「AI 思考中 · 保守」且不可点 | `mono-ai-01-setup-skip.png` |
| M9-4 | 观察 AI 回合 | 状态行右侧出现「加速 ×2」「跳过本次」；点「加速 ×2」文案变「加速 ✓」且推进更快；点「跳过本次」当前 AI 回合立刻走完并停在下一个真人席位 | `mono-ai-04-turn.png` |
| M9-5 | 三种性格行为 | 保守：现金 < ￥400 不买地；激进：炸弹/路障打净资产领先者；投机：`round ≥ 8` 才针对领先者，且会迁点到股票交易所抄底 | — |
| M9-6 | `mono.html?humans=4&tour=0` | 与改前 `?play=1` 完全一致（4 真人、无徽标、无快捷键） | — |
| M9-7 | 跑 `node local/mono-shots-ai.mjs` | 8 张 390×844 @dpr2 截图入库，`gate` 全 `true`、`errors` 为空 | 上述全部 |

**口径说明**：本设计让裸入口先出开局面板（`__monoMain.game === null`，`createGame` 在选完席位后才执行），所有 play 模式闸门脚本已统一补 `humans=4&tour=0` 保持旧行为；线上回归的裸入口 gate 改为断言「面板存在 + game 为 null」，并新增 `?humans=1&tour=0` 的 3 席 AI gate。

### M10 新手引导（四步蒙层）

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M10-1 | `mono.html?humans=1&tour=1` | 首屏即弹蒙层第 1 步「点这里掷骰」，高亮主按钮 + 两枚骰面 | `mono-ai-05-tour-1.png` |
| M10-2 | 点「下一步」 | 第 2 步「买地与升级」，高亮底坞左右两枚次要按钮位 | `mono-ai-05-tour-2.png` |
| M10-3 | 点「下一步」 | 第 3 步「资产与手牌」，高亮第 0 条资产条 + 5 个手牌槽 | `mono-ai-05-tour-3.png` |
| M10-4 | 点「下一步」 | 第 4 步「其余是 AI」，高亮第 1 条资产条（AI 席位）；末步按钮文案「开始」 | `mono-ai-05-tour-4.png` |
| M10-5 | 点「开始」/「跳过」 | 蒙层消失、游戏可操作；`localStorage['mono.tour.done'] === '1'` | — |
| M10-6 | 再开 `mono.html` | 不再自动弹；`?tour=1` 仍强制弹；`?tour=0` 不弹 | — |

**实现口径**：高亮矩形一律取自 `hitAreas()` / `src/skin/layout.ts` 常量（主按钮 98×46、骰子 `HUD_DICE_X0/Y`、资产条 `HUD_BAR_X0/W/H`、手牌槽 `PANEL_SLOT_X0/HAND_Y`），不另造坐标；文案集中在 `src/data/tutorial.ts`。

### M11 音效与音乐

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M11-1 | 手机打开 `mono.html?humans=1&tour=0`，点「掷骰」 | 有骰子抖动音；顶部右侧出现两枚 26×26 图标（喇叭 / 音符），均为「开」态（亮色） | `mono-prod-05-audio-on.png` |
| M11-2 | 点右侧喇叭键 | 图标转「关」态（压暗 + 45° 斜杠），此后动作无声；`localStorage['mono.audio'] === '{"sfx":false,"bgm":true}'` | `mono-prod-06-audio-off.png` |
| M11-3 | 再点一次喇叭键 | 图标回「开」态，并补一声确认音（`ui` cue） | — |
| M11-4 | 点音符键 | BGM 立即停；再点恢复循环（4 小节 Am–F–C–G，整段 8s） | — |
| M11-5 | 刷新页面 | 两枚图标的开 / 关与刷新前一致（`mono.audio` 持久化；坏 JSON / 缺字段一律按「开」） | — |
| M11-6 | AI 回合（`?humans=1`）与结算后（`state.over === true`） | 两枚图标仍在且可点（`hitAreas` 的 `over` 早退与 AI 分支均不吞键）；BGM 在 `over` 后停止 | — |
| M11-7 | `mono.html?audio=0` | 全程静音，且 `window.__monoMain.audio.isUnlocked() === false`（**不创建** `AudioContext`） | — |
| M11-8 | 默认皮肤对局，DevTools Network 面板 | **无任何音频请求**（默认皮肤零素材，全部 Web Audio 程序化合成） | — |
| M11-9 | `mono.html?nofx=1` | 音效静音、BGM 照旧（`?nofx` 语义是「无演出」不是「无氛围」） | — |

**实现口径**：音效挂在唯一出画口 `runAction` 的 `fx.play` 对偶位置（`if (!ctx) return;` 守卫之后）——AI 与真人天然共用、买地/升级失败（无 fx）不出声；`aiDriver.skipRest()`（`withFx=false`）连带静音；`?nofx` 由 `sfxOn = !opts.nofx` 显式守卫静音。键位常量在 `src/skin/layout.ts`（`AUDIO_KEY_SIZE` / `AUDIO_SFX_BOX` / `AUDIO_BGM_BOX` / `AUDIO_VOL_*` / `AUDIO_BGM_*`），可见像素是 4 个 proc preset（`uiSoundOn/Off`、`uiMusicOn/Off`）可整包换素材；开关落 `localStorage['mono.audio']`。

### M12 真机音频解锁回归（2026-09-30 事故修复）

> 事故现象（同源四症状）：**骰子没有点数 · 游戏无法运行 · 人物没有前进 · 没有事件提醒**。
> 根因：`src/ui/audio.ts` 的 `tone()` 噪声分支把占位对象 `{ noise: true }` 赋给 `AudioBufferSourceNode.buffer`
> ——真机 WebIDL 类型化属性必抛 `TypeError`。唯一噪声音色 `rattle` 就是默认的掷骰音（`DEFAULT_SFX.dice`），
> 而 `audio.play()` 在 `main.ts` 的 `runAction` 里位于 `paint()` **之前** → 异常逃逸 ⇒
> 状态已落库（`phase='rolled'`、点数已生成）但画面停帧（`pos` 不变、骰面无点数、面板不更新）；
> 第二次点主按钮直接报 `[mono] rollDice @phase=rolled`，整局卡死。
>
> 闸门盲区（为什么 433 例单测 + 两个线上闸门全绿却线上坏）：
>
> | 覆盖方 | 真实手势（`pointerdown` → `unlock()`） | 真实 `AudioContext` | 结果 |
> |---|---|---|---|
> | `test/ui/audio.spec.ts` | 不适用（纯注入装配） | ❌ 假件 `createBufferSource()` 是普通对象，`buffer` 赋值静默成功 | 测不到 |
> | `local/mono-prod-check.mjs` | ✅ `locator().click()` | ❌ `addInitScript` 装了 `AudioContextStub` | 假件吞掉 `TypeError` |
> | `local/mono-e2e-playthrough.mjs` | ❌ 全是合成 `el.click()`（不派发 `pointerdown`） | ✅ 无桩 | `ctx === null` → `play()` 早退 |
>
> 修复三处：① 噪声分支保留 `createBuffer()` 的返回值赋给 `src.buffer`；② `SrcLike.buffer` 收紧为
> `AudioBufferLike | null`（同类 bug 从此在 `npx tsc --noEmit` 阶段即失败）；③ `play()` 整体 `try/catch`
> ——护栏在引擎内部收口，**不在** `runAction` 加 catch（那会吞掉状态机自身缺陷）。

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M12-1 | 手机打开 `mono.html?humans=1&tour=0`，点「掷骰」 | **骰面显示出点数**（2..12）、主按钮转「前进」、全程无 `pageerror` | `mono-prod-07-dice-pips.png` |
| M12-2 | 点「前进」 | **棋子逐格前进**（`pos[0] > 0`）、落格结算正常 | `mono-prod-08-pawn-move.png` |
| M12-3 | 继续推进到命运 / 机会格 | **事件浮层正常展开**（`phase='settled'` 且 `lastDraw` 非空） | `mono-prod-09-event.png` |
| M12-4 | 刷新后重复 M12-1..3 | 不再出现「第二次点主按钮报 `rollDice @phase=rolled`」的卡死 | — |

**新增闸门口径**（`local/mono-prod-check.mjs`）：
- 探针从「替换 `AudioContext` 的假件」改为「真实 `AudioContext` + 在 `AudioBufferSourceNode.prototype` / `OscillatorNode.prototype` 上计数 `start()`」；
- `audioLazy` / `audioUnlock` / `audioForceMute` 改走既有探针 `window.__monoMain.audio.isUnlocked()`；
- `audioPlay` = 页面零 `errors` **且** 真实点击后 `game.state.dice.total ∈ 2..12`（证明 `paint()` 确实执行过）；
- 新增 `fixDice` / `fixMove` / `fixEvent` 三项与 3 张截图。其中 M12-3 的循环推进预算为 300 次：真人一回合要 4 次点击、每轮另有 3 个 AI 回合（≈7 次/轮），`seed=20260928` 下真人首次落到命运/机会格在第 14 轮（≈98 次），预算不足会令 `fixEvent` 恒 false。

**新增闸门口径**（`local/mono-e2e-playthrough.mjs`）：首个动作点击改走 Playwright **真实鼠标点击**（其余保持合成以守住墙钟预算），新增 `gate.audio_unlocked`（真实手势确实建起了 `AudioContext`）；`gate.noErrors` 原本已有。

### M13 画面重设计（配色装配表 + 楼体原型 + 道具 / 环境层 + 名牌 / 棋子 / 气泡 / HUD）

**目标**：把「画面长什么样」从**渲染代码**里搬进**配置**——一套 `public/config/theme.json` 管配色与风格，一套注册表管素材原型；改配置即换风格，`src/render/**` 零改动。落地方案见 `docs/superpowers/specs/2026-09-30-monopoly-visual-redesign-design.md`，逐步实施记录见 `docs/superpowers/plans/2026-09-30-monopoly-visual-redesign.md`。

**改动范围**（Task 0–10，均不触 `src/core/**` 与 `src/data/**`）：

| 层 | 关键文件 | 改了什么 |
|---|---|---|
| 配色装配 | `public/config/theme.json` · `src/skin/theme.ts` · `src/ui/themeConsole.ts` | 5 套 palette × 8 色键 + 段通配 binding；`?theme=<id>` 整体套色；`?debug=1` 风格控制台逐栋选色并导出 |
| 布局常量 | `src/skin/layout.ts` | 棋盘放大（`TILE_*`）、名牌/地块卡/气泡/底坞常量集中一处 |
| 楼体原型 | `src/render/providers/proc-building.ts` · `tools/registry-ids.json` · `public/skins/default/skin.json` | 6 原型（stall / shop / market3 / onsenHouse / gate / barn），全量转读色键 |
| 道具 | `src/render/providers/proc-props.ts` | 16 个 `prop.*`（挂件 / 树 / 灯 / 招牌塔等） |
| 环境层 | `src/render/AtmosphereView.ts` · `proc-atmosphere.ts` | 7 个 `bg.*`（夜空 / 星 / 月 / 远山 / 街市 / 灯笼串 / 街灯） |
| 名牌 | `src/render/LabelView.ts` | 店名上房顶（`LABEL_ROOF`）+ 当前格三重标记（1.25× / 三角 / 金环） |
| 棋子 | `src/render/providers/proc-pawn.ts` | Q 版小朋友：两男两女四造型 × 三表情 × 归属围巾 |
| 气泡 | `src/render/providers/proc-bubble.ts` · `src/ui/BubbleView.ts` | 停留事件头顶气泡四态（买地 / 收租 / 抽卡 / 进监狱） |
| HUD | `src/ui/Hud.ts` | 资产条改 1 条 4 段（无缝）+ 落地地块卡滑入 + 手牌抽屉默认收起 |

#### 13.1 五套配色（`theme.json → palettes`）

每套 8 个色键：`wallL / wallR`（楼体受光面 / 背光面）· `roof`（屋顶）· `win`（窗光）· `sign`（店招底）· `tileFill / tileEdge`（地砖填充 / 描边）· `glow`（灯光光晕）。

| palette id | 定位 | wallL | wallR | roof | win | sign | tileFill | tileEdge | glow |
|---|---|---|---|---|---|---|---|---|---|
| `warm-market` | 暖阳市集（默认） | `#cdb78f` | `#a8926a` | `#8f4a33` | `#ffcf7a` | `#f5c451` | `#4a3b2a` | `#8a7550` | `#ffd9a0` |
| `snow-deer` | 雪原鹿乡 | `#dfe7ee` | `#b7c4d0` | `#6f8296` | `#ffcf7a` | `#ffd98a` | `#8fa3b5` | `#c9d6e0` | `#ffe6b8` |
| `papercut` | 剪纸年味 | `#f5e6c8` | `#e0c49a` | `#c0392b` | `#ffd23f` | `#ffd23f` | `#1f6b3a` | `#f5e6c8` | `#ffd23f` |
| `onsen-mist` | 温泉雾白 | `#e8e6e0` | `#c9c6bd` | `#5a6360` | `#ffe9c0` | `#8fc4b8` | `#3a3d3a` | `#8a8f8b` | `#ffe9c0` |
| `night-neon` | 夜市霓虹 | `#3a3140` | `#2c2532` | `#ff8a3d` | `#ffd23f` | `#ff8a3d` | `#20262e` | `#ff8a3d` | `#ffd23f` |

对照截图：`mono-visual-01a-warm-market` / `01b-snow-deer` / `01c-papercut` / `01d-onsen-mist` / `01e-night-neon`（同一 seed `20260928`、4 真人、`?theme=<id>`）。

#### 13.2 `theme.json` 字段与写法

| 字段 | 含义 |
|---|---|
| `palettes[id]` | 一套 8 键配色，键名固定如上；缺键回落皮肤内建默认 |
| `bindings[].match` | 元素 id 的**段通配**（`*` 匹配整段、不跨 `.`；段数必须相等） |
| `bindings[].preset` | proc preset 名（`stall` / `shop` / `market3` / `onsenHouse` / `gate` / `barn`） |
| `bindings[].palette` | 整条 binding 统一套色 |
| `bindings[].paletteBySlot` | 32 长数组，按地块序号逐格给配色（优先于 `palette`）——现按「每 6 格一街区」轮转 5 套 |
| `bindings[].params` | 元素级参数，**逐键压过** palette（= 单素材独立风格） |
| 覆盖顺序 | **后写的覆盖先写的**（同键覆盖、异键累加）⇒「精确 id」必须写在「通配」之后 |

**单素材独立风格示例**（不改代码，只加一条 binding）：

```json
{ "match": "building.s4.l2", "preset": "onsenHouse", "palette": "onsen-mist", "params": { "steam": true } }
```

即：把 4 号地块的 L2 换成「汤屋」原型、套温泉配色、并单独打开蒸汽（其余 `building.*.l2` 仍是 `shop` + 各自 `paletteBySlot` 配色）。同理 `prop.signTower` 单独套 `papercut`、`board.tile.chance` 单独套 `night-neon`。

**整体强制套色**：`?theme=<paletteId>` 把全场元素（含 `bg.*`、`prop.*`、`board.tile.*`）一律改用该套色，用于出风格样张与客户挑选；`?theme=off`（或不带）回落 `skin.json` 内建配色。

#### 13.3 棋子形象与停留气泡

| 项 | 口径 |
|---|---|
| 造型 | `piece.p1` 短发（男）· `p2` 双马尾（女）· `p3` 小帽（男）· `p4` 丸子头（女）—— **两男两女** |
| 表情 | `state.mood` = `calm` / `happy` / `sad`，三态几何不同（happy 为弯眼不画瞳孔） |
| 五官必备件 | 瞳孔白高光（睁眼两态各 ≥2）+ 头发 + 腮红，三态恒有 |
| 归属色 | 只染一条围巾（`tokens.owner1..owner4`），衣服统一米白——**看不出归属色的旧问题已消除** |
| 停留气泡 | `ui.bubble` 四态 tone = `buy`（买地）/ `rent`（收租）/ `card`（抽卡）/ `jail`（进监狱），标题 + 金额两行 |
| 气泡层 | `pass: 4` 进 `layers.fxUi`（屏幕空间，不跟相机），**不进 `hitAreas()`**（不挡点击）；`idle` 无气泡 |

对照截图：`mono-visual-09-players.png`（四造型 / 三表情 / 四态气泡合成版式）。

#### 13.4 截图清单（全部 390×844 @dpr2，手机视口，入 `docs/verify/`）

| 文件 | 内容 |
|---|---|
| `mono-visual-01a..01e-<palette>.png` | 五套配色各一张全屏（`?theme=<id>`） |
| `mono-visual-02-labels.png` | 棋盘区放大切图（楼顶名牌可读性 + 当前格金环 / 三角 / 1.25×） |
| `mono-visual-03-hud.png` | 底坞特写（**1 条 4 段**资产条 + 骰面点数 + 主按钮） |
| `mono-visual-04-tilecard.png` | 落地态地块卡滑入（首行「停在 金鹿源 · 你在这里」） |
| `mono-visual-05-street.png` | 中部街市带 + 事件卡面浮层 |
| `mono-visual-06-drawer.png` | 牌袋抽屉打开（5 槽入画，牌袋键文案翻为「收起手牌」） |
| `mono-visual-07-catalog.png` | 素材库总览：**6 原型（3×2）+ 16 道具（4×4）** |
| `mono-visual-07b-atmosphere.png` | **环境层 7 个 preset** 按原台位叠加的实景条带（另有台位文字标注） |
| `mono-visual-08-console.png` | 风格控制台（点棋盘选元素 → 套 `night-neon` → 导出 `theme.json`） |
| `mono-visual-09-players.png` | Q 版人物四造型 + 三表情 + 四态气泡 |

**07 为什么拆成两张（口径偏离，精确记录）**：`bg.*` 一族是**满屏背景层**——provider 取 `box.w/h` 定尺寸（`bg.sky` 390×844、`bg.stars` 390×240、`bg.moon` 60×60、`bg.ridge` 390×90、`bg.street` 390×130、`bg.streetLamp` 40×70、`bg.lanternString` 390×30），`cx/cy` 是**左上角坐标**，**完全不吃 `s`（缩放）** ⇒ 塞进小格会互相压掉、看不出层次。故拆为 `07`（原型 + 道具，可缩放）与 `07b`（环境层按 `src/render/AtmosphereView.ts` 的台位表整体下移叠加，展示真实 z 序）。

#### 13.5 闸门 V1–V14 口径（`node local/mono-prod-check.mjs`，本地与线上同一脚本）

| 判据 | 口径 | 实测（本地 52300） |
|---|---|---|
| V1 | `theme.json` 合法：5 palette × 8 键、`paletteBySlot` 长 32、每条 `match` 至少展开 1 个 id | 5 / `keysOk` / `slotsOk`；展开计数 `32,32,32,32,1,…,16` |
| V2 | `?theme=` × 5 各出一图、**两两画面差异 > 1%**；`?theme=off` 回落 `skin.json` | 十对 15.7%–18.9%；`off` vs 出厂差异 20.28% |
| V3 | `building.s4.l2` 实例 `params.wallL === S4.wallL`；改 binding 即时变化 | 改 `#3a3140` → 还原 `#e8e6e0`（=`onsen-mist.wallL`） |
| V4 | `prop.signTower` 参数覆盖生效且不影响其他 `prop.*` | sign `#ffd23f`→**被覆盖**，同时 `prop.tree` 仍 `#ffd9a0`（未被牵连） |
| V5 | 楼体同层唯一 + 逐层等于 `skin.json` 常量（与 owner 无关） | `l1=32 / l2=30 / l3=200`，`byLevel` 各层均唯一 |
| V6 | 32 名牌齐备且 `strokeW > 0`；4 字宽 ≤48 且 fs 10；3 字 fs 11；5 字 fs 8；>5 截断；当前格 1.25× + 三角 | 32 text + 33 graphic；`ring=1`、`scaled=1`；fs 集合 `{6.2, 10, 11, 12.5}` |
| V6b | 当前格「金环 + 名牌 1.25× + 棋子光晕」三处同时成立；地块卡首行含「停在」 | 前两项由 V6 覆盖；第三项 `active === 1`；标题「停在 金鹿源 · 你在这里」 |
| V7 | `geo.hw === 24`；棋盘纵向 ∈ [40, 320] ⇒ 占比 ≥ 33% | `hw=24`、`[91, 312]` 高 221px ÷ `DOCK_Y 606` = **36.5%** |
| V8 | 中部条带 320..508 非纯背景像素 > 20% | `nonDomPct = 80.7%` |
| V9 | 资产条 4 段连续无缝（由 X0/W/GAP 派生）且与 DOM 命中层零交叠 | 4 段 `96×41 @ x 6/100/195/289`，间距 `94/95/94`，`overlap = []` |
| V10 | `settled` 时地块卡出现且「升级」可点；`idle` 时不可见 | `idle 0`；`settled` 1（标题 / 副行齐备、升级键 `disabled=false`） |
| V11 | 牌袋键可开关；**关闭时 `ui.handSlot` 不参与命中** | `closed → opened 6 → reclosed`；`handSlot` 计数随开合 0↔6（= `HAND_SIZE`，M19 起 5→6） |
| V12 | play 页 16 道具 + 7 环境层全可达、无缺素材、**无未知 preset**；`scene ≤ 200`；`missingAssets === []` | 缺件 `0/0`；`livePresets ⊆ 白名单`；`liveBg = 7`；`scene ≤ 200`。「6 原型全覆盖」口径迁至 V1（`theme.json` 侧 `new Set(presets).size === 6`） |
| V13 | pawn 含 ≥2 眼（含白高光）+ 腮红 + 头发；四 style 覆盖两男两女；`owner` 1..4 且衣服统一米白；三 mood 几何不同 | 四 style `bun/cap/short/twintail`、owner `1..4`、`active=1`；白高光 / 腮红 / 头发由 `test/render/proc-pawn.spec.ts` 断言 |
| V14 | 气泡四态各产出 1 枚 `ui.bubble`；气泡不在 `hitAreas()`；`idle` 无气泡；`e2e:play` 全绿 | 四态各 `n=1`、`overlapped=false`；`idle n=0` |

**口径偏离说明（相对 spec §11.2 原文，精确记录三处）**：

1. **V2**：原文按「量化主色两两不同」判——实测五套的量化主色被深色夜空吞掉，只落到 `8,8,8` / `24,24,24` 两档（`dom` 字段仍保留可查）。改为**棋盘区两两画面差异占比 > 1%**（`diffStats` 像素级比对），实测 15.7%–18.9% 全部通过——该口径直接对应「肉眼能看出是两套风格」。
2. **V5**：原文写「`overrides` 不含 `hue` 键」——在 live 层**不可断言**：`hue` 仍在实例参数里，且来自 `skin.json` 的**楼层常量**（`l1=32 / l2=30 / l3=200`），与 owner 无关。改为「**同层唯一 + 逐层等于 `skin.json` 常量**」，实测 `byLevel = {l1:["32"], l2:["30"], l3:["200"]}`。即：色彩不再随 owner 漂移（这正是原判据想守的性质）。
3. **V9**：原文写「`hitAreas()` 4 段一一对齐」——但 `hitAreas()` 里**没有 `ui.playerBar` 条目**（资产条走 DOM 命中层，不在画布命中层）。改为「**渲染层 4 段无缝**（96×41、x 间距 94.5）+ **与 DOM 命中层零交叠**」两项合成。

#### 13.6 本地复跑与验收

```powershell
npm run dev                                        # http://127.0.0.1:52300
$env:MONO_ORIGIN="http://127.0.0.1:52300"; node local/mono-prod-check.mjs   # 闸门 V1–V14
node local/mono-shots-visual.mjs                   # 14 张手机视口截图 → docs/verify/
npm run check ; npx tsc --noEmit                   # lint + lint:skin + vitest / 类型
```

闸门结果：**全部 `true`、`errors: []`**（含既有 `http200 / gameReady / counts / sim / skinAssets / skinImages / defaultEntry / aiSeat / audio* / fixDice / fixMove / fixEvent` 与新增 `v1…v14 / v2b / v6b`）。

> **线上回归记录**：Task 12 统一执行「本地构建 → 部署 → 线上复跑」后回填（命令见 M7 节；线上复跑 `mono-shots-visual.mjs` 会**覆盖**上述 14 张为线上实拍）。

### M14 体验修复五连（引导高亮 / 选角分行 / 行走播报 / 命中区 / 棋盘改形）

**来源**：业主 2026-10-01 反馈五条（1 引导被引导部分没高亮、操作不明；2 给 AI 选角色不知道给谁选性格，且缺一键随机；3 AI 行走太快、要「谁前进几步」播报，事件卡放大到约 2 倍；4 掷骰/买地/事件关闭/结算等按钮命中区左移；5 棋盘正方形布局内容被遮挡，改长方形/不规则并放大棋盘）。

| # | 现象与根因 | 改法（关键文件） |
|---|---|---|
| 1 | 引导蒙层只压暗全屏、被引导元素无任何视觉标记，且步骤可能指向当步并不存在的元素 | **跟手推进**：一步只高亮**当时确实存在**的元素，完成该操作才进下一步；金环 + 脉冲 + 指示三角 + 说明文案，保留「跳过」（`src/ui/tutorial.ts` · `src/data/tutorial.ts` · `src/ui/setup.ts`） |
| 2 | 三个 AI 席位挤在一行三个性格键上，看不出「给哪个号位选」；无批量入口 | 改为**按号位分行**（`2 号位 · 老王` / `3 号位 · 丽丽` / `4 号位 · 小赵` 各一行三键）；新增**一键随机**（每席独立掷骰）（`src/ui/setup.ts`） |
| 3 | AI 步间停顿 450ms 太快；前进过程无文字播报；事件卡只有 66×88 的 1.6× | 步间停顿 **450 → 900ms**（`AI_STEP_MS`）；新增「前进 N 步」五态气泡第 5 色（`tone: 'move'`）+ **顶部状态条**同文案；前进播报不随 hop 动效（仅 320ms）收起，改由 `BUBBLE_MOVE_HOLD_MS`(820ms) 定时器收起；事件卡放大 **3.2×**（≈2 倍），底板换 `showcase.panelTall`(370×480)、关闭键移到卡面下方（`src/render/BubbleView.ts` · `src/render/providers/proc-bubble.ts` · `src/ui/Hud.ts` · `src/skin/layout.ts`） |
| 4 | 宽视口下画布居中而 DOM 覆盖层 `position:fixed` 靠左 ⇒ 命中区整体左偏 `(视口宽−390)/2`；窄视口画布右侧被裁 | 新增 `#mono-fit` 统一基准 + `fitStage()` 等比缩放平移，5 个挂载层 `fixed → absolute`（`src/main.ts` · `mono.html`）。**390×844 视口下 `k=1`、位移为 0，与改动前逐像素一致** |
| 5 | 9×9 正方形棋盘外框 `18×hw = 432 > 390`，左右各被切 21px；纵向只占 36.5% | 棋盘改 **11×7 倾斜长方形**：`cols+rows` 仍 18 ⇒ 环长恒 32；`geo = {hw:21.5, hh:18, ox:152, oy:64}` ⇒ 外框 **387×324**（不裁切）、纵向占屏 **38.4%**；两处三角空白各放一个内容位（右上轮播 / 左下战报）；名牌横向夹进舞台内（`src/data/board.ts` · `src/skin/layout.ts` · `src/data/inner.ts` · `src/render/{InnerView,BuildingView,LabelView}.ts`） |
| 5b | 改形连带：11×7 最左/最右格心 `x≈44.5`，气泡半宽 50 ⇒ 气泡越出画布左/右缘被裁（实测 `box.x = −21`） | `bubbleSpecs` 把气泡中心夹到 `[BUBBLE_W/2+pad, STAGE_W−BUBBLE_W/2−pad]`（`BUBBLE_EDGE_PAD = 4`，与 `LABEL_EDGE_PAD` 同口径）；三角指向仍按格心水平居中（`src/render/BubbleView.ts` · `src/skin/layout.ts`）。实测夹边后 `box = [3,180,101×53]`，完整落在舞台内 |

**几何口径**（改棋盘前必须复算的两条）：

- 环长 = `2(cols+rows) − 4`；屏幕外包 = `18·hw` 宽 × `18·hh` 高 —— **只取决于 `cols+rows`，与长宽比无关**。9×9 → 11×7 外包不变，放大只能靠抬高 `hh`。
- `(c−r)` 范围 = `1−rows .. cols−1`，11×7 为 `−6..10`（**不对称**）⇒ `ox = STAGE_W/2 − 2·hw` 才居中；须满足 `18·hw ≤ STAGE_W`。

**两处三角内容位**（`11×7` 天然留白，不填会失衡）：右上 = 广告 / 城市主题插画 / 规则小贴士**轮播**（`public/config/board-slots.json` 驱动，改文件即生效、无需重建，图片走静态目录不走上传播目录）；左下 = **事件战报**滚动（每步「谁 · 做了什么」，最多留 4 条）。两矩形均为三角形内接矩形（斜边斜率 `hh/hw`），不会压到棋盘本体（`src/ui/slots.ts` · `src/skin/layout.ts`）。

#### 14.1 截图（全部 390×844 @dpr2，手机视口，入 `docs/verify/`）

| 文件 | 内容 |
|---|---|
| `mono-fix-01-board.png` | 11×7 倾斜长方形整盘 + 右上轮播位 + 左下战报位 |
| `mono-fix-01b-board-left.png` | 左角放大：名牌已夹进舞台内（不再被左边缘裁掉） |
| `mono-fix-01c-board-right.png` | 右角放大：名牌完整 + 轮播位与棋盘不重叠 |
| `mono-fix-02-tour.png` | 引导第 1 步：掷骰键与骰面**金环高亮** + 说明文案（跟手推进） |
| `mono-fix-03-setup.png` | 开局面板：AI 席位**按号位分行**选性格 + 一键随机 |
| `mono-fix-04-draw.png` | 事件卡放大 ≈2 倍（标题 / 正文折行 / 关闭键在卡面下方） |
| `mono-fix-05-move.png` | 行走播报：棋子**头顶气泡**「前进 8 步 / 落在 吉吉特产」+ **顶部状态条**同文案 + 左下战报留痕 |
| `mono-fix-06-bubble-left.png` | 最左格收租气泡**完整落在舞台内**（夹边后 `box.x = 3`，改前被左缘裁 `−21`） |

#### 14.2 回归口径（本轮实测）

```powershell
npx tsc --noEmit                 # 退出码 0
npm run lint:skin                # registry-ids.json 255 ids（新增 showcase.panelTall）
npx vitest run                   # 54 文件 / 496 例全绿
npm run build                    # check-hardcoded clean（28 个文件）
npm run deploy                   # 本地构建 → scp → 服务器解压 + 备份（131 个文件）
npm run check:prod               # 线上 V1–V14 全 true、errors: []（退出码 0）
npm run e2e:play                 # PASS · round=61 · 973 次点击 · 退出码 0
```

- **命中区逐像素对齐**（问题 4）：390×844 下画布矩形 `left=0`；DOM 主按钮换算回逻辑坐标后与注册表**完全一致** —— `roll = (146,738,98×46)`、`hand = (287,607,72×22)`、`audio:sfx = (324,5,26×26)`；点 `roll` 实测 `idle → rolled`。
- **行走播报**（问题 3）：场景内实测 `ui.bubble.state = {title:'前进 8 步', amount:'落在 吉吉特产', tone:'move'}`，顶部状态条 `老王 前进 8 步 · 落在 吉吉特产`，可见时长 ≈925ms。
- 控制台 `errors: []`。

**闸门自身两处口径修正**（`local/mono-prod-check.mjs`，改棋盘/改气泡后必须同步）：

- **V7**：`hw === 24` → `21.5`，纵向带下界 `320` → `SHOWCASE_Y = 406`（街市带上沿）。新几何实测 `top=46 / bottom=352 / height=306`，占底坞 `50.5% ≥ 33%`。
- **V14 气泡四态**：`card` 用例曾偶发 `n = 0`。根因不是实现——`card` 动效仅 **540ms**（`fx.totalMs()`），而 Playwright「点击 → 读取」往返可达数百毫秒，读到时气泡已随终帧收起；`rent/buy` 动效更长故一直通过。修法：**取景前 `fx.speed(0)` 冻结时轴、读完 `speed(1)` 解冻**（只停观感不动状态），并在每条用例前等 `!fx.busy()`（真机上动效期间按钮本就是禁用的，用例用 `evaluate` 直改状态绕过了那道门）。

### M15 P0+P1+P2 · 解耦·相机基座 → 取景编排 → 近景建筑增强（2026-10-01）

**目标**：为「相机取景（放大近景，spec `2026-10-01-monopoly-camera-framing`）」落地——P0 把**世界层**与**UI 层**彻底解耦、并让取景算法（纯函数）与相机驱动（容器变换）就位（**该部分硬要求无任何可见变化**：390×844 首屏逐像素一致）；P1 把相机**接入主循环**，走位时自动「起势 → 跟拍 → 落点 → 归位」；P2 给近景建筑加**体型变体 / 轮廓阶梯 / 台阶铺装**（放大后才看得见，故排最后）。§15.1–15.2 记 P0，§15.3–15.5 记 P1，§15.6–15.8 记 P2。

| # | 改动 | 关键文件 |
|---|---|---|
| 1 | 原 `#mono-fit` 拆成 **`#mono-world`**（只装 canvas）与 **`#mono-ui`**（全部 DOM 覆盖层挂点），二者平级、各自 `transform-origin:0 0`；`#mono-ui` 自身 `pointer-events:none`（交互子元素仍 `auto`，不挡 canvas 点击） | `mono.html` |
| 2 | `fitStage()` 只作用于 `#mono-world`；新增 **`fitUi()`**（桌面 `vw ≥ UI_BREAK_W(900)` 只跟高 `k = vh/844`，窄屏沿用 `min()`）；`fitRoot` 改挂 `#mono-ui`；`resize` / `orientationchange` 两个监听改调 `fitAll()`（同时触发两个 fit） | `src/main.ts` |
| 3 | 画布内新增 **`world`** 容器（相机作用域，`cullable = true`）与 **`fxUi`**；容器树 = `app.stage → { world → (ground → labels → pieces → fxWorld), fxUi }`；原 `layers.fx` 拆为 **`fxWorld` / `fxUi`** | `src/render/stage.ts` · `src/render/Scene.ts` |
| 4 | 动效按**落点来源**归属空间：`FX_SPACE`（穷尽表）= world `hop/buy/upgrade/rent/deck/stock/end`、ui `dice/card`；`spawn()` 按表投递；`bounds()` 双容器过滤 | `src/render/fx.ts` |
| 5 | 新增**纯函数取景算法**：`bboxOf` / `bboxUnion` / `frameFor` / `choreography`（三段编排 + 退化规则，空序列/坏输入均安全） | `src/core/framing.ts` |
| 6 | 新增**相机驱动**：`createCamera({world})` → `to/snap/reset/follow/current/busy/setTimeScale/destroy`，映射 = `world.scale.set(z)` + `world.position.set(CAM_VIEW_CX−cx·z, CAM_VIEW_CY−cy·z)`；初始恒等（`z=1`、`cx/cy` = 视口中心）⇒ 首屏零回归 | `src/render/camera.ts` |
| 7 | 引导蒙层 `#mono-tour` 容器：`width/height` → **`inset:0`**（填满 UI 根，故 `TUTORIAL_STEPS` 的 rect 仍是 390×844 舞台坐标、无需换算） | `src/ui/tutorial.ts` |
| 8 | 相机全部常量集中在布局层（禁写死 gate 覆盖 `src/render/**`）：`CAM_VIEW_*` / `CAM_IDLE|MIN|MAX|FOLLOW_ZOOM` / `CAM_*_MS` / `CAM_TILE_PAD` / `CAM_DEGRADE_EPS` + 拆层常量 `UI_BREAK_W` / `UI_SIDE_W` / `UI_MIN_HIT` / `UI_MIN_FONT` / `BAKE_DPR_CAP` | `src/skin/layout.ts` |

**拆层语义**（P1 及以后的地基）：`world` 内的一切（地面/名牌/棋子/世界空间动效）跟相机放大；`fxUi` 内的一切（HUD / 浮层 / 气泡 / 骰子与卡牌动效 / pass 4 屏幕空间元素）**不跟相机**，故 UI 不会被放大、命中区不漂移。

**闸门三处口径**（`local/mono-prod-check.mjs`）：

- **V15 分辨率未降**：canvas 后备缓冲 = 逻辑尺寸 × `devicePixelRatio`（实测 `780×1688 @dpr2`），CSS 逻辑尺寸仍 `390×844` —— 拆层不得动分辨率。
- **V16 UI 解耦（只断言解耦，命中高按逻辑尺寸）**：`#mono-ui` 是 `#mono-world` 的**平级兄弟**（非其子节点）且其 transform 只含页面适配 `k`（390 视口下 `k=1`，无任何相机缩放）；主按钮**逻辑布局高** `offsetHeight ≥ 44`（`offsetHeight` 不受 CSS transform 影响，即不乘页面适配 `k`）。**已知项**：更窄视口（如 361×640）下按钮等比缩到实高 <44，留待 P2 做窄屏 UI 适配。
- **V17 宽屏几何（侧栏留待后续）**：1440×900 下 `#mono-world` 占宽 ≤ 40% 且**左右各留 ≥ `UI_SIDE_W`(220)**——实测 `left=512 / width=416(28.9%) / right=512`，给后续侧栏与 UI 空间。

#### 15.1 P0 回归口径（本轮实测）

```powershell
npx tsc --noEmit                 # 退出码 0
npm run check                    # lint 0 错 / lint:skin 3 项 OK / vitest 55 文件 513 例全绿
npm run build                    # check-hardcoded clean（29 个文件）
npm run deploy                   # 本地构建 → scp → 服务器解压 + 备份（20261001-154411）
npm run check:prod               # 线上 V1–V17 共 39 项 gate 全 true、errors: []（退出码 0）
```

- **首屏零回归**：390×844 @dpr2 下 `k=1`、`fitStage` 位移为 0，且 `world` 初始为恒等变换 ⇒ 与 P0 前逐像素一致。
- **单测新增**：`test/core/framing.spec.ts` 17 例（包围盒 / 并集 / `frameFor` 夹取 / 时间轴单调 / 1·2·6·8·9·16·32 格 / 笔直与跨拐角路径 / **退化阈值实测 8 格不过线、9 格过线** / 落点取景口径）。
- 控制台 `errors: []`。

#### 15.2 P0 截图（390×844 @dpr2 手机视口，入 `docs/verify/`）

| 文件 | 内容 |
|---|---|
| `mono-prod-10-p0-mobile.png` | 拆层后手机首屏（390×844 @dpr2 闸门内留证）：与 P0 前一致，UI 未被放大 |
| `mono-prod-11-p0-desktop.png` | 1440×900 宽屏：`#mono-world` 居中占宽 28.9%，左右各留 512px（≥ `UI_SIDE_W`） |

#### 15.3 P1 · 取景编排接线（2026-10-01）

P0 交付的相机本体（`src/core/framing.ts` + `src/render/camera.ts`）本轮**接入主循环**：走位时自动完成「**起势 → 跟拍 → 落点 → 归位**」四段（spec §4 触发时机表、§6 P1 第 11–18 项）。

| # | 改动 | 关键文件 |
|---|---|---|
| 1 | 新增 `?cam=0` 总回退开关（**缺省开启**）；`camOn = opts.cam && !opts.nofx` —— `nofx` 下 `timeScale=999` 会让相机补间瞬间到位并停在近景，违背 V19「nofx 下恒 1.0」的断言，故 nofx 一律不取景 | `src/main.ts` |
| 2 | **C 三段编排**按 spec §4 接线：`roll` ⇒ **起势** `frameFor(整条路径 bbox)`（`CAM_PUSH_MS`，与轻推合并进骰子窗口）；`move` ⇒ **跟拍** `camera.follow([起点, 落点], hop 时长)` + **落点** `frameFor(落点 ∪ 前1 ∪ 后1)`（`CAM_SETTLE_MS`）；`settle` ⇒ 命运/机会/补给/股票 **归位**、收租 **近景**（收租格 ∪ 地主格）、其余保留；`buy`/`upgrade` ⇒ 周边近景；`close`/`end`/`skip` ⇒ **归位**（`CAM_BACK_MS`） | `src/main.ts` |
| 3 | **实现事实落地**：`fx` 的 `hop` 是**单段**「起点 → 落点」直线位移（`motionFor('hop')` 恒 `FX_HOP_MS`，不可被 skin 覆盖），**不是逐格** —— 故跟拍取**首尾两格**、时长取 fx 自身 hop 时长（规格 §3.2 的「逐格 ×(格数−1)」按实现落地）；否则立刻与棋子脱同步 | `src/main.ts` |
| 4 | 与 `fx` **同时轴**：`camera.setTimeScale()` 与 `fx.speed()` 并联（都落在 `gsap.globalTimeline.timeScale`），故 `?speed=` / `?nofx=1` 对相机与动效同时生效 | `src/main.ts` |
| 5 | **面板期禁区**：`overlayOf(st) !== null`（结算面板/事件浮层展开）时禁止新的**推近**，但 `reset` 不受限 —— 避免浮层与近景互相打架 | `src/main.ts` |
| 6 | AI 回合**压缩**：按 `seats[st.current]` 判定，AI 时长 × `CAM_AI_SCALE`；`aiDriver.onSkip` ⇒ `camera.reset(0)` | `src/main.ts` · `src/ui/aiDriver.ts` |
| 7 | **R3 降级回路**：`?perf=1` 采样跑满 `FX_FRAMES` 后定档 `perf.degraded = p95 > budget.frameP95Ms`，命中则把倍率上限降为 `CAM_FALLBACK_MAX_ZOOM(3)` | `src/main.ts` |
| 8 | `?debug=1` 控制台加**相机面板**（位姿读数 + 跟拍倍率滑杆）；取景态下的画布点选先过 `toWorld()` 反变换（否则点到的永远是放大后的别处） | `src/ui/themeConsole.ts` |
| 9 | 闸门 V18–V20（`mono-prod-check.mjs`）+ e2e `cam_nofx_idle` / `cam_framing` / `cam_reset` + 五态截图脚本 | `local/*.mjs` |

**开关语义**（三档，互不影响）：

- **缺省**：取景全开（`cam=true`）。
- **`?cam=0`**：相机完全不介入，`world.scale.x` 恒 1（G7 线上兜底 / A/B 回归对比）。
- **`?nofx=1`**：动效瞬间到终帧，相机**不参与补间**，恒等（G6）。

**退化规则**：`frameFor` 的 fit 若 ≤ `CAM_MIN_ZOOM(1.6) + CAM_DEGRADE_EPS(0.02)`（**≥9 步**的长路径）则**跳过起势段**、直接跟拍（避免越走越远）；判定在 `choreography()` 内部完成，调用方不参与。

#### 15.4 五态截图（390×844 @dpr2 手机视口，入 `docs/verify/`）

`npm run shots:cam`（`local/mono-cam-shots.mjs`）一键产出；前四态取「6 步笔直段」`choreography` 的代表关键帧并 **snap**（确定性、与 `framing.spec.ts` 同源），「归位」走**真实点击**（roll → move → 结算）等相机补间回恒等后再截，故画面是「已走位、已结算」的真实局面。

| 文件 | 态 | 实测位姿 `(cx, cy, zoom)` |
|---|---|---|
| `mono-cam-01-idle.png` | **全景**（恒等，首屏零回归基线） | `195, 320, 1` |
| `mono-cam-02-lead.png` | **起势**（整条路径 bbox 的 fit） | `173.5, 334, 1.814` |
| `mono-cam-03-follow.png` | **跟拍**（固定倍率 `CAM_FOLLOW_ZOOM`） | `130.5, 298, 3.6` |
| `mono-cam-04-settle.png` | **落点**（落点 ∪ 前 1 ∪ 后 1） | `238, 379, 3.023` |
| `mono-cam-05-reset.png` | **归位**（真实走位结算后回到恒等） | `195, 320, 1` |

**窄屏命中回归（360×640）**：取景态下画布坐标 ≠ 世界坐标，`?debug=1` 的点选必须先过 `toWorld()` 反变换。脚本用 **round-trip** 取证 —— 同**一个世界点**分别在「取景态（zoom 3.6）」与「恒等态」各点一次，两次必须选到**同一格**：实测两侧均为 `board.tile.chance` ✅（不依赖任何写死的像素位置）。**注意**：控制台面板本身是 `position:fixed` 浮层，在 360×640 下会盖住棋盘上中部，脚本测试前把该面板 `display:none`（DOM 仍在、'选中' 输入框仍可读），被测的画布命中逻辑不受影响。

#### 15.5 P1 回归口径（本轮实测）

```powershell
npx tsc --noEmit                 # 退出码 0
npm run check                    # lint 0 错 / lint:skin OK / vitest 55 文件 517 例全绿
npm run build                    # check-hardcoded clean（29 个文件；camera.ts / framing.ts 无裸倍率·裸时长）
npm run deploy                   # 本地构建 → scp → 服务器解压 + 备份（20261001-162413）
npm run check:prod               # 线上 V1–V20 全 true、errors: []（退出码 0）
npm run e2e:play                 # PASS · round=61 · clicks=973 · 含 cam_nofx_idle / cam_framing / cam_reset
npm run shots:cam                # PASS · 五态截图 + 窄屏命中 round-trip 一致
```

- **V19 实测**：`move` 期 30 帧 `world.scale.x` max `3.03`（∈ [1.6, 4] 且 > 1）✅、退出后 `resetZoom = 1` ✅、`?cam=0` 与 `?nofx=1` 各 12 帧恒 `1.0` ✅。
- **V20 口径说明（诚实声明）**：闸门原文是「p95 **帧间隔** ≤ 16.7ms；超限时已降级」。但 headless Chromium 的 rAF 被浏览器限到 **~8–20fps**（本机实测 frameP50 ≈ 133ms、frameP95 ≈ 217ms，`local/mono-perf.mjs` 早已记录此限制并改用 `redrawP95` 作代理），帧间隔在此环境**不能当真机帧率用**；且 `perf.degraded` 只在采样跑满 `FX_FRAMES = 300` 后才定档（30s 只收到 ~240 帧 ⇒ `degraded` 恒 false 的假失败）。故本闸门在 headless 上**恒走 spec §8 明文允许的「超限 ⇒ 已降级」分支**：实测 `frames 300 / p95 183.4ms / degraded true` ✅，原始数值如实记录、未改阈值口径。**真机帧率仍以手机打开 `?perf=1` 的读数为准**（保留人工勾选 ☐）。

#### 15.6 P2 · 近景建筑增强（2026-10-01）

近景放大后楼体才看得清，故 P2 排最后：给**近景建筑**加三类「加法件」，全部以 **params 键**落地（走取值器，受 `check-hardcoded.mjs` gate 约束），并在 `skin.json` 显式开启。

| # | 改动 | 关键文件 |
|---|---|---|
| 1 | **体型变体**：名册 `['plain','veranda','dormer','annex']`，按 `state.slot % 名册长` 选款 —— 门廊立柱外廊（`veranda`）/ 屋顶老虎窗（`dormer`）/ 侧接偏屋（`annex`）/ 素体（`plain`，不绘制） | `src/render/providers/proc-building.ts` |
| 2 | **轮廓阶梯 B（落地）**：屋顶线下叠 `stepN` 道逐级收进的横向檐带（色带 + 檐线），**零结构改动** | 同上 |
| 3 | **轮廓阶梯 A（预留，默认关）**：屋顶上退进一层更小的体块（真进退台），`setback` 开且 `levels ≠ 1` 才绘制 | 同上 |
| 4 | **台阶铺装**：门前以 `apronDx/apronFy` 定位、`apronN` 层同心菱形梯台（越内越窄越高），`shop` / `market3` / `stall` 三处插桩 | 同上 |
| 5 | 楼体 spec 的 `state` 增加 **`slot`** 透传 ⇒ 变体按格位轮换（`BuildingView.buildingSpecs()`） | `src/render/BuildingView.ts` |
| 6 | `building.*.l1` / `.l2` 开 `variant` 名册 + `step` + `apron`；`.l3` 开 `step` + `apron` | `public/skins/default/skin.json` |
| 7 | **P2 专项取证脚本**（定格出图 + 像素哈希 gate） | `local/mono-shots-p2.mjs` · `npm run shots:p2` |

**新增 params 键**（L4 内建默认在 `proc-building.ts` 的 `D = fb({...})` 内；键值可由 skin.json / theme.json 覆盖）：

| 键 | 默认 | 含义 |
|---|---|---|
| `variant` | `['plain']` | 体型变体名册（`string[]`）；`state.slot % length` 选款，`plain` 不绘制 |
| `step` / `stepN` / `stepInset` / `stepDrop` / `stepTH` / `stepLW` | `false` / `2` / `0.05` / `0.055` / `0.03` / `1.2` | 轮廓阶梯 B 开关 / 道数 / 每道水平收进（u 比例） / 每道下移（v 比例） / 带厚（v 比例） / 檐线宽（px·s） |
| `setback` / `sbW` / `sbD` / `sbH` / `sbEdgeW` | `false` / `0.6` / `0.62` / `0.3` / `1.2` | 轮廓阶梯 A 开关 / 退台体块宽·深（w·d 比例） / 高（h 比例） / 棱线宽（px·s） |
| `apron` / `apronN` / `apronShrink` / `apronLift` / `apronDx` / `apronFy` / `apronRx` / `apronRy` | `false` / `3` / `0.6` / `0.7` / `0.28` / `0.42` / `0.42` / `0.38` | 铺装开关 / 层数 / 每层收缩 / 每层抬升（px·s） / 锚点前向·右向偏移（w·d 比例） / 首层菱形半径（w·d 比例） |
| `vrPad` / `vrOut` / `vrH` / `vrW` / `vrRoofRise` | `0.07` / `0.2` / `0.6` / `2.2` / `7` | veranda：柱位外扩（u 比例） / 出挑（w·d 比例） / 柱高（h 比例） / 柱宽（px·s，同 `ridgeW` 口径） / 披檐升起（px·s） |
| `dmW` / `dmD` / `dmH` / `dmV` / `dmRise` / `dmWinU1..V2` | `0.24` / `0.22` / `0.2` / `0.34` / `5` / … | dormer：体块宽·深（w·d 比例） / 高（h 比例） / L1 沿坡抬升系数 / 双坡升起（px·s） / 前脸暖窗范围 |
| `axX` / `axY` / `axW` / `axH` / `axRoofRise` | `0.7` / `0.62` / `0.34` / `0.32` / `6` | annex：锚点前向·右向偏移 / 体块宽·深（w 比例） / 高（h 比例） / 双坡升起（px·s） |

**零回归口径**（`board.inner.d1..d8` 橱窗、`showcase.shop` 等其它消费者）：`D` 里 `step` / `apron` / `setback` 默认 **`false`**、`variant` 默认 **`['plain']`**，且 `plain` 分支**不绘制任何几何** ⇒ 未显式开启的消费者逐像素回到 P2 前。`variant` 只挂在 `shop`（L2），`stall` 只挂 `apron`，`market3` 挂 `apron + step` —— 由 `theme.json` 的真实分派决定（`building.*.l1 → stall`、`.l2 → shop`、`.l3 → market3`）。

**`tools/registry-ids.json` 本轮未变动（如实说明）**：规格 #20 写的「登记」按实际口径解读 —— 该文件由 `tools/gen-registry-ids.mjs` 从 `src/skin/registry.ts` 的 `allElementIds()` 自动生成，**只存元素 id**（本轮未新增元素 id，仍 `255 ids`）；`tools/lint-skin.mjs` 对 skin 只校验 `provider.preset` 是否存在，**不校验 params 键**。故 P2 的新键由 `check-hardcoded.mjs`（新增几何不得写死）+ `npm run shots:p2` 的像素哈希 gate 兜住，而非 registry。

#### 15.7 P2 取证截图（390×844 @dpr2 手机视口，入 `docs/verify/`）

`npm run shots:p2`（`local/mono-shots-p2.mjs`）在 `?demo=1` 下用 `scene.buildOne({ fixed, overrides })` **逐件定格出图**：`overrides` 直接给 provider（L1 级、不并 theme）⇒ 每张都是**受控对照**。除目视外，对**同一画面区域**取像素哈希做机器判据：

| 文件 | 内容 |
|---|---|
| `mono-p2-01-variants-plain/-veranda/-dormer/-annex.png` | 体型变体四款（同一栋 L2，仅 `variant` 不同；`slot` 摆 0/1/2/3 复现轮换） |
| `mono-p2-02-step-on/-off.png` | 轮廓阶梯 B：同一栋 L2 仅 `step` 开/关 |
| `mono-p2-03-apron-on/-off.png` | 台阶铺装：同一栋 L3 仅 `apron` 开/关 |
| `mono-p2-04-setback-on/-off.png` | 结构退台 A：同一栋 L3 仅 `setback` 开/关（默认关，仅取证） |

- **像素哈希 gate**：四款变体两两不同（`variantsDistinct`）；`step` / `apron` / `setback` 开/关均改变像素（`stepChangesPixels` / `apronChangesPixels` / `setbackChangesPixels`）——「新增几何真的画出来了」的机器判据，非逐像素黄金图。
- **调参记录（目视后修正）**：`vrW` 初值 `0.05` 被误当「绝对宽」用（实际 `×s` ⇒ 亚像素、立柱不可见），改为 **`2.2`**（与 `ridgeW` 同口径 `px·s`）；`annex` 初值 `axX/axY = 1.08/0.86` 使小屋离体像木箱，收到 **`0.7/0.62`** 贴住右前立面；`stepTH/stepDrop/stepLW` 加粗到 `0.03/0.055/1.2` 才读得出檐带。

#### 15.8 P2 回归口径（本轮实测）

```powershell
npx tsc --noEmit                 # 退出码 0
npm run check                    # lint 0 错 / lint:skin OK（255 ids）/ vitest 55 文件 517 例全绿
npm run build                    # check-hardcoded clean（29 个文件；新增几何全走取值器）
npm run deploy                   # 本地构建 → scp → 服务器解压 + 备份（20261001-180842）
npm run check:prod               # 线上 V1–V20 全 true、errors: []（退出码 0）
npm run e2e:play                 # PASS · round=61 · clicks=973（含 cam_nofx_idle / cam_framing / cam_reset）
npm run shots:cam                # PASS · 五态截图 + 窄屏命中 round-trip 一致（P2 几何生效后复拍）
npm run shots:p2                 # PASS · 变体四款两两不同 · step/apron/setback 开关均改变像素
```

### M16 玩法与形象升级（对齐并超越《大富翁 5》· 西游 IP · 战报遮挡修复 · 棋子放大）2026-10-01

**范围**：本轮四项用户需求 —— ① 修复「浮层展开遮挡左下战报 / 右上轮播」；② 玩法对齐并超越《大富翁 5》（角色技能 / 事件卡扩容 / 地产 3→5 级 / 特殊格补全）；③ 角色形象 IP 化（西游·取经四众，台词忠于原著并标注回目）；④ 棋子过小 → 主角化放大并给推荐尺寸。

**硬约束（合规 + 商业）**：
- **不牺牲 17 个商家格**（业主书面授权清单是产品价值所在）——新特殊格从 `TILE_LEVEL = 0` 的「命运 / 机会」腾挪，商家格索引一个不动。
- 三国 / 西游属**公有领域**，形象与**原著原文台词**可自由使用；**影视与网络二创台词一律不收**；美术造型**不照搬任何商业游戏 / 影视剧**。

#### 16.1 战报遮挡事件卡修复（需求 ①）

**根因**：`#mono-slots`（左下战报 + 右上轮播）是 DOM 层，恒在 canvas 之上；浮层（事件卡 / 手牌 / 结算 / 股票盘）展开时其左下角被压住。

**实现**：`SlotsHandle.setHidden(on)`（[slots.ts](file:///d:/zhao/monopoly/src/ui/slots.ts#L61-L68)）→ `layer.style.display = on ? 'none' : ''`；`paint()` 内 `slots?.setHidden(game !== null && overlayOf(game.state) !== null)`（`overlayOf` = 浮层判定唯一真源）。无浮层时 `false` ⇒ 逐像素回现状、零回归。

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M16-1 | 打开 `mono.html?play=1&seed=20260928&nofx=1`，保持无浮层 | 左下战报 + 右上轮播正常显示 | `mono-m9-07-slots-idle.png` |
| M16-2 | 置 `state.lastDraw` 后 `paint()`（或真实走到命运 / 机会格） | 浮层展开时 `#mono-slots` 整块 `display:none`，事件卡左下角无遮挡、关闭键可见 | `mono-m9-08-overlay-slots-hidden.png` |
| M16-3 | 清空 `lastDraw` 再 `paint()` | `#mono-slots` 回到 `display:''`（无浮层零回归） | — |

#### 16.2 棋子放大（需求 ④，C 档 32px 主角化）

**推荐尺寸：32px（C 档）**。原 `pawnScale 0.62`（≈12px 高）在 390×844 下「看不清脸」；放大到 `1.6` 后单枚棋子屏幕高 **≈26–32px**（`getBounds().h ≥ 26` 为本轮机器闸门），金箍 / 钉耙 / 毗卢帽等轮廓均可辨；**再大（40px+）同格多人会明显压盖邻格**，故 32px 是本盘格距下的上限甜点。同格 ≥3 人改 **2×2 方阵**（前排 2 人 + 后排上移 22px），避免一排四人互压。

**实现**：`main.ts` 的 `PLACEMENT = { pawnGap: 19, pawnFrontDy: 1.2, pawnRowDy: 22, pawnScale: 1.6, ... }`；`Scene.resolvePlacement` 的 `n >= 3` 分支走 2×2（后排索引更小 ⇒ 先出画 ⇒ 被前排遮住，深度方向正确）。

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M16-4 | 把 4 人 `pos` 同置一格并 `paint()` | 2×2 方阵：跨度 ≈19×22px、单枚 `bounds.h ≥ 26px`（已放大），不压邻格 | `mono-m9-01-pawns-2x2.png` |
| M16-5 | 正常开局 | 棋盘上四枚棋子清晰可辨、站姿不互压 | `mono-m9-02-pawns-board.png` |

#### 16.3 角色形象 IP 化 + 原著台词（需求 ③）

- **形象**：西游·取经四众（孙悟空 / 猪八戒 / 沙悟净 / 唐三藏）。[proc-pawn.ts](file:///d:/zhao/monopoly/src/render/providers/proc-pawn.ts) 的 `params.style` 四键（`wukong` / `bajie` / `wujing` / `sanzang`），由 `skins/*/skin.json` 的 `piece.p1..p4` 装配（p1 悟空 / p2 八戒 / p3 悟净 / p4 三藏）。造型依**原著文字**（「毛脸雷公嘴」「长嘴大耳朵」「披袈裟、执锡杖」），**不照搬商业游戏 / 影视剧**。
- **台词**：[lines.ts](file:///d:/zhao/monopoly/src/data/lines.ts) 唯一真源，**只收《西游记》原著原文**（公有领域），每条带 `chapterNo` + `chapter`（回目全称）可溯源；**影视二创台词一律剔除**（如「大师兄，师父被妖怪抓走了」非原著，已剔）。取词确定性：`pickLine(role, seed)`（不用 `Math.random`，回放 / e2e 可复现）。
- **气泡**：停留气泡显示当前席位角色的原著引文；`QUOTE_LINE_CHARS = 11` / `QUOTE_MAX_CHARS = 22`（两行排完，不溢出 100×64 气泡）。

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M16-6 | 真实点击掷骰 → 前进 → 落格（**不带 `nofx`**），settle 后 ~220ms 取证 | 气泡含原著引文（本轮示例「莫胡说，为人为彻。」）且完全在舞台内、不溢出 | `mono-m9-09-bubble-quote.png` |

#### 16.4 角色技能系统（需求 ②，对齐并超越《大富翁 5》特技）

[abilities.ts](file:///d:/zhao/monopoly/src/data/abilities.ts) 唯一真源。四人各一技，覆盖「移动 / 置产 / 现金流 / 防守」四条**正交轴**，无重叠、无上位替代；技能全部**确定性**（无随机，不引入新随机源）：

| 角色 | 技能 | 效果 | 原著依据（`source`） |
|---|---|---|---|
| 孙悟空 | 筋斗云 | 每回合额外前进 1 格 | 第二回：祖师传「筋斗云」，一筋斗十万八千里 |
| 猪八戒 | 九齿钉耙 | 买地八折 | 第十九回：云栈洞「九齿钉耙」 |
| 沙悟净 | 任劳任怨 | 经过起点额外领 ￥100 | 第二十二回：流沙河受戒，此后一路挑担 |
| 唐三藏 | 慈悲为怀 | 应付租金减免 25% | 第十三回：「路中逢庙烧香，遇佛拜佛」 |

**开关**：`GameOptions.abilities`（[game.ts](file:///d:/zhao/monopoly/src/core/game.ts#L117-L130)），**默认关** = 传统无技能基线（既有回归 / 单测逐值不变）；正式对局由 `main.ts` 显式 `abilities: true`。关闭时全部倍率退回中性值（0 / 1）。

#### 16.5 事件卡扩容（需求 ②）

牌堆 [cards.ts](file:///d:/zhao/monopoly/src/data/cards.ts)：`FATE_DECK` 6 → **20 张**（`FateKind` 14 种）、`CHANCE_DECK` 6 → **20 张**（`ChanceKind` 10 种），`DECK_SIZE = 20`；`ITEM_CARDS` 仍 5 张。原 6 张的 **id 与文案逐值保留**（既有用例不变），新牌在此之上按「金额档位拉开 / 走位 / 道具指定」扩列。

#### 16.6 地产 3 → 5 级 + 特殊格补全（需求 ②）

- **地产 5 级**（[board.ts](file:///d:/zhao/monopoly/src/data/board.ts#L139-L156)）：`RENT_BY_LEVEL = [0, 15, 45, 105, 220, 420]`、`PRICE_BY_LEVEL = [0, 60, 180, 420, 860, 1600]`。`building.s*.l{1..5}` 元素 id 已在 `registry-ids.json` 注册（L4 / L5 为新楼体）。
- **特殊格**：`TILE_TYPES` 新增 `bank` / `lottery` / `tax` / `hospital`（对齐《大富翁 5》的银行 · 乐透 · 税金 · 医院），落在 index **9 鹿乡银行 / 21 乐透彩 / 23 税务局 / 25 医院**——四格原为 `TILE_LEVEL = 0` 的「命运 / 机会」，**17 个商家格一个不动**；命运 / 机会各留 3 格（2 / 17 / 29 与 5 / 14 / 31），配 20 张牌堆足够。
  - 银行 `BANK_RATE 0.1` / 封顶 ￥300；税金 `TAX_RATE 0.1` / 封顶 ￥500；乐透 `LOTTERY_STAKE ￥100` 按权重表开奖；医院 `HOSPITAL_TURNS 1`（停 1 回合）。实现见 [special.ts](file:///d:/zhao/monopoly/src/core/special.ts)。

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M16-7 | 定位 index 9 / 21 / 23 / 25 并 crop | 四格地砖配色各异、功能名可辨（鹿乡银行 / 乐透彩 / 税务局 / 医院） | `mono-m9-05-special-{bank-9,lottery-21,tax-23,hospital-25}.png` + `mono-m9-06-special-board.png` |

#### 16.7 楼体实时层级（让 5 级地产在棋盘上看得见）

**关闭 M4 的「有意偏差」**：此前 `buildingSpecs` / `drawLabels` 的层级恒走静态 `slotLevelsOf()` ⇒ 买地 / 升级到 L4 / L5 在棋盘上**不可见**。本轮新增 `BuildingOpts.levelOf` 注入（[BuildingView.ts](file:///d:/zhao/monopoly/src/render/BuildingView.ts#L19-L27)）+ `main.ts` 的 `liveLevels()`——口径为「**演示层级 ∪ 实时地产层级取大值**」：未售地块与 v5 样张**逐像素一致**（零回归），买下不会把装饰高楼缩回 L1，升级 L4 / L5 则逐级长高。三处**同源**（楼体 `buildingSpecs` / 楼顶名牌 `drawLabels` / 贴墙挂件抬升 `instantiateDeps.slotLevels`），避免灯笼招牌落在旧高度。

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M16-8 | 置 `estates[6] = {level:5}`、`estates[8] = {level:4}` 并 `paint()` | L5 明显高于 L4，楼体 id `building.s6.l5` / `building.s8.l4` 与层级同步 | `mono-m9-03-l4-l5.png` |
| M16-9 | 看全盘 | L4 / L5 高楼与楼顶名牌层次正确、不遮后排地块；未动地块仍 18 栋演示楼 | `mono-m9-04-l4-l5-board.png` |

#### 16.8 回归口径（本轮实测）

```powershell
npx tsc --noEmit                 # 退出码 0
npm run check                    # lint 0 错 / lint:skin OK / vitest 58 文件 571 例全绿
npm run build                    # check-hardcoded clean
node local/mono-shots-m9.mjs     # [m9-shots] PASS · 14 项 gate 全 true、errors: []
npm run deploy                   # 本地构建 → scp → 服务器解压 + 备份（20261001-205809）
npm run check:prod               # 线上闸门全 true、errors: []
```

**截图清单（12 张，均 390×844 @dpr2 手机视口，入 `docs/verify/`）**：`mono-m9-01-pawns-2x2` / `02-pawns-board` / `03-l4-l5` / `04-l4-l5-board` / `05-special-bank-9` / `05-special-lottery-21` / `05-special-tax-23` / `05-special-hospital-25` / `06-special-board` / `07-slots-idle` / `08-overlay-slots-hidden` / `09-bubble-quote`。

**取证脚本**：[local/mono-shots-m9.mjs](file:///d:/zhao/monopoly/local/mono-shots-m9.mjs)（`MONO_ORIGIN` 默认本地 dev `http://127.0.0.1:52301`，可覆盖为线上）。关键口径：格子 → 舞台像素用**页面内动态 `import('/src/render/*.ts')`** 复用 `boardCells` / `ipos`，与渲染层同源、避免坐标手算漂移；棋子落位量 `layers.pieces` 的 `getBounds()`（proc 画在绝对舞台坐标上、pass 容器恒不动）。

### M17 角色形象 Q 版化（更可爱 · 仍合原著）2026-10-01

**范围**：在 M16 的西游·取经四众棋子基础上做 Q 版化 / 可爱化，同时**保持原著特征可辨**。仅动**几何比例**，归属色与造型符号（金箍 / 钉耙 / 络腮胡 / 毗卢帽）不变。

**口径（推荐档 B）**：

| 指标 | 值 | 说明 |
|---|---|---|
| 头身比 | **1.75 头身** | 下半身压缩到 10.4 设计单位（躯干 5.8 + 腿 5.4） |
| 头径 / 总高 | **≈ 57%** | 头半径 5.3 → **6.9**（设计单位） |
| 大眼宽 / 头宽 | **≈ 28%** | 睁眼椭圆 `[±3, -18, 2, 2.1]` ⇒ 眼宽 4.0 / 头宽 13.8 |
| 腮红浓度 | 0.42 → **0.5** | 上 / 下表情分别 0.58 / 0.42 |

**实现（唯一落点）**：[proc-pawn.ts](file:///d:/zhao/monopoly/src/render/providers/proc-pawn.ts) 的 `const D = fb({...})`（L4 内建兜底）几何整体重排。**头顶恒 `-24.2` = `designH` 不动**，头心 `-18.9 → -17.3`、头底 `-13.6 → -10.4`；面部五官（眼 / 瞳孔 / 腮红 / 嘴 / 眉 / 泪）按「相对头心的原比例」等比外扩，故四众仍各具原著辨识度。归属色仍**只染「披肩 `scarf` + 腰带 `sash`」**（`trim = ownerColors[owner] ?? col('trim')`），`robeMap` / `headMap` / `hairMap` 未改。

**八戒二次微调（更贴「长嘴大耳朵」）**：垂耳放低加长 `baEarL/R [-7.5, -18, 3, 5.6]`、拱嘴放大 `baSnout [0, -13.2, 4.2, 2.9]`、鼻孔 `[±1.8, -13.3, 0.65]`，避免首版偏圆偏高的「鼠感」。

**同格间距**：`PLACEMENT.pawnGap` **19 → 24**（[main.ts](file:///d:/zhao/monopoly/src/main.ts#L255-L262)）。Q 版后头宽达 18px、八戒垂耳外缘 28px，24 间距下相邻两头仍留 **6px 净空**，两人并肩而不糊成一团；`pawnFrontDy` / `pawnRowDy` / `pawnScale` 不变。

**确定性闸门（新增用例）**：[proc-pawn.spec.ts](file:///d:/zhao/monopoly/test/render/proc-pawn.spec.ts) 第 8 例「Q 版比例」——头径 / 总高 ∈ [0.54, 0.60]、大眼宽 / 头宽 ∈ [0.25, 0.33]。不依赖截图即可回归比例口径。

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M17-1 | 直出四众 × 三表情（平静 / 开心 / 难过）总表 | 四列三行全部 Q 版可爱、原著特征可辨，标注不碰撞 | `mono-m17-01-sheet-4x3.png` |
| M17-2 | 四众单枚近景（平静行） | 金箍 / 长嘴大耳 / 络腮胡 / 毗卢帽各自可辨、可爱 | `mono-m17-02-closeup-{wukong,bajie,wujing,sanzang}.png` |
| M17-3 | 4 人同置一格并 `paint()` | 2×2 方阵跨度 `24 × 23px`，相邻两头留 6px 净空 | `mono-m17-03-pawns-2x2.png` + `mono-m17-04-pawns-board.png` |
| M17-4 | 看全屏 | 390×844 观感正常，HUD 四技能卡 + 掷骰无遮挡 | `mono-m17-05-board-full.png` |

**回归口径（本轮实测）**：

```powershell
npx tsc --noEmit                              # 退出码 0
npx vitest run test/render/proc-pawn.spec.ts  # 8 passed（含新增 Q 版比例例）
npm run check                                 # 全绿
node local/mono-shots-m17.mjs                 # [m17-shots] PASS · 7 项 gate 全 true、errors: []
```

**实测 facts**：总表 `bounds {x:35, y:84, w:303, h:433}`；同格 `gapX = 24`、`rowDy = 23`、`union {x:84, y:261, w:51, h:69}`；四众绘制外接框互不相同 —— 悟空 **26×43** / 八戒 **28×40** / 悟净 **22×41** / 三藏 **22×45**（`silhouettes_distinct` 闸门按 `${w}x${h}` 四元组判定）。

**截图清单（8 张，均 390×844 @dpr2 手机视口，入 `docs/verify/`）**：`mono-m17-01-sheet-4x3` / `02-closeup-wukong` / `02-closeup-bajie` / `02-closeup-wujing` / `02-closeup-sanzang` / `03-pawns-2x2` / `04-pawns-board` / `05-board-full`。

**取证脚本**：[local/mono-shots-m17.mjs](file:///d:/zhao/monopoly/local/mono-shots-m17.mjs)。关键口径：总表页**先清空五层 + 移除 `#mono-ui`** 再在 `ground` 画深底，避免棋盘喧宾夺主；直接 `import('/src/render/providers/proc-pawn.ts')` 取**生产 `pawn()`**绘制，与线上同源；`Graphics` 构造器从背景元素 `stage.layers.ground.children[0].constructor` 取得（playwright 不走 vite 改用裸模块名）。对局取证另开一页，避免总表污染真实画面。

### M18 棋盘生长与归属可视化（开局空盘 · 五级换代 · 业主配色）2026-10-01

**范围**：对齐 spec `2026-10-01-monopoly-interaction-roadmap-design` §4.1 与决策 **D1–D4**。

**四项需求与落点**：

| # | 需求（D） | 落点 | 结果 |
|---|---|---|---|
| 1 | 开局只 4 栋公共设施楼，商家格全空（D1） | [board.ts](file:///d:/zhao/monopoly/src/data/board.ts) 新增 `START_PUBLIC_LEVEL = { 0: 3, 9: 2, 19: 2, 25: 2 }`；[BuildingView.ts](file:///d:/zhao/monopoly/src/render/BuildingView.ts) 新增 `startLevelsOf()`；[main.ts](file:///d:/zhao/monopoly/src/main.ts) 的 `liveLevels()` 在 play 下以它起算 | 开局 `building.s*.l*` 实例 = **4**，且恒为 `s0.l3 / s9.l2 / s19.l2 / s25.l2` |
| 2 | L1→L5 五段式换代（D2） | [proc-building.ts](file:///d:/zhao/monopoly/src/render/providers/proc-building.ts)：`shop` 内加 **L1 幡旗** / **L2 雨棚**（`flag` / `canopy` 开关，零新增元素）；`market3` 的顶部体块在 L4 起换成**更宽更矮的退台**（`l4W/l4D/l4H`），L5 加**塔楼尖顶 + 霓虹描边 + 五星徽记** | L3 < L4 < L5 绘制指令数严格递增（单测闸门），且五级截图像素哈希两两不同 |
| 3 | 业主色只染屋面 + 门面 + 描边（D3） | 复用 `Scene.ts` 已注入的 `state.ownerColors`；新增 `ownerTintOf()`；`shop` / `market3` 的屋面、门洞立面、脊线 / 女儿墙 / 檐线四处走业主色 | 有业主时 `#abcdef` 至少出现 3 次且**占比不过半**；`wallL/wallR` 仍是 hue 派生的 `hsl(...)` |
| 4 | L5 五星徽记 + 地砖发光环（D4） | `market3` 的 ①c（双环 + 光晕，画在墙之前）与 ⑧（尖顶 + 霓虹 + 五星） | L5 地面 ellipse 比 L4 多 **3**（内/外发光环 2 个描边 + 业主色光晕 1 个填充）；霓虹 `rgba(255,236,170,.9)` 与星色 `#ffe9a8` 只在 L5 出现 |

**归属通路（为什么不用新注入）**：`monopoly/src/render/Scene.ts` 的 `ownerColors()` 已把 skin tokens 的 `owner1..owner4` 折成 `{ 1: '#3fbf7f', ... }` 并注入**每一个** proc 上下文的 `state.ownerColors`（`tile` preset 与 `proc-hud.ts` 早已在用）。建筑 preset 直接复用同一条通路，**未新增任何注入口**，四级可回退体系（L1 元素覆盖 → L2 skin.json → L3 默认皮肤 → L4 `fb` 兜底）不受影响：裸值只出现在 `fb({...})` 内，`npm run build` 的 `check-hardcoded` 前置闸门保持 clean。

**15 个商家格归属不可信的修正（D3 附带）**：`main.ts` 的 `ownedOf()` 原先对无主格回落到 `DEMO_OWNER`（v5 样张的演示归属），导致 play 下**未买入的地块也显示业主色**。M18 改为「**play 只认真实地产**，非 play 样张仍走 `DEMO_OWNER`」——同一函数同时供地砖归属色、楼体业主色与楼顶名牌名色，三处天然同源。

**确定性**：本里程碑**未引入任何随机源**（无 `Math.random`、无 `makeRng` 调用），回放与 e2e 不受影响。

**回归口径（本轮实测）**：

```powershell
npx tsc --noEmit                                  # 退出码 0、无输出
npx vitest run                                    # 58 文件 / 586 例全绿
npm run check                                     # eslint src tools 0 错；[theme] OK / [skin:default] OK / [skin:photo] OK；58 文件 / 586 例全绿
npm run build                                     # [check-hardcoded] clean（29 个文件）→ ✓ built in 3.84s
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-shots-m18.mjs   # [m18-shots] PASS · 6 项 gate 全 true、errors: []
```

**截图清单（12 张，均 390×844 @dpr2 手机视口，入 `docs/verify/`）**：`mono-m18-01-levels-none-l1..l5`（五级换代 · 无业主）/ `mono-m18-02-levels-owner1-l1..l5`（五级换代 · 业主色绿）/ `mono-m18-03-street-owner`（街廓连片同色 vs 异业主）/ `mono-m18-04-start-empty`（真实对局开局空盘）/ `mono-m18-05-grown`（注入 L1/L3/L5 三块地产后的生长与归属）。目视复核要点：L1 有幡旗小摊、L2 有雨棚双层、L3 三层 + 小阁楼、L4 四层 + 更宽更矮的退台、L5 塔尖 + 五星 + 地面双光环；有业主版五张的屋面 / 门面 / 描边变绿而**墙身仍是深蓝**（不整楼发绿）。

**取证脚本**：[local/mono-shots-m18.mjs](file:///d:/zhao/monopoly/local/mono-shots-m18.mjs)。关键口径：与 `mono-shots-p2.mjs` 同源，用 `?demo=1` + `scene.buildOne()` + `overrides` 逐件定格（受控对照，不吃 `theme.json` 分派）；另开一页打 `?play=1&seed=20261001&nofx=1&humans=4&tour=0` 取真实开局与生长画面。**五级总表逐级 `scene.reset()` + 居中整幅取景**（因 L5 高过 L4、L4 高过 L3，并排摆放会互相遮挡且把 L4/L5 的退台 / 塔尖裁出画外）。机器闸门 6 项：`01_levels_distinct` / `02_levels_owner1_levels_distinct` / `street_two_colors` / `start_buildings_4` / `start_wall_ids` / `grown_buildings_7`。

### M19 对抗玩法与落子沉浸（拆迁令 · 选目标 · 落格特写 · 路障明确 · 破坏表现）2026-10-02

**范围**：对齐 spec `docs/superpowers/specs/2026-10-02-monopoly-m19-combat-and-landing-design.md` 的决策 **M19-D1..D5**（覆盖路线图诉求 ① 落子沉浸 与 ② 路障 / 炸弹 / 拆屋 + 选目标）。只作用于 `typeAt(i) === 'shop'` 的 17 个商家格，**不动地砖与店招**；不引入破产拍卖 / 银行 / 股票 / 设施入股 / 新闻（属 M20）。

**五项需求与落点**：

| # | 需求（D） | 落点 | 结果 |
|---|---|---|---|
| 1 | 新增「拆迁令」`demolish`，一次夷平归无主（D1） | [cards.ts](file:///d:/zhao/monopoly/src/data/cards.ts)：`ITEM_CARDS` 5 → 6（增 `demolish`）、`HAND_SIZE` 5 → 6 | 开局手牌 **6 种全送**，手牌槽 5 → 6；与炸弹区别：炸弹 `BOMB_RANGE = 1` 拆 1 级（L1 归无主），拆迁令任意级**一次归无主** |
| 2 | 棋盘选目标态（D2） | [targeting.ts](file:///d:/zhao/monopoly/src/core/targeting.ts) 纯函数 `candidatesFor` / `canTarget` / `previewFor`；[iso.ts](file:///d:/zhao/monopoly/src/render/iso.ts) `tileAtPoint`；[panels.ts](file:///d:/zhao/monopoly/src/ui/panels.ts) 去掉 `cardTarget()` 自动挑目标 + 预演条 `ui.preview` + 取消键 `ui.cancel`；[main.ts](file:///d:/zhao/monopoly/src/main.ts) 命中层 `#mono-pick` | 点需目标道具 → 候选格高亮（`board.tile.candidate`）→ 点候选格提交 / 点空白或「取消」退出；相机冻结 idle 全景 |
| 3 | 落格特写相机第 ④ 拍（D3） | [framing.ts](file:///d:/zhao/monopoly/src/core/framing.ts) `landingPose`；[camera.ts](file:///d:/zhao/monopoly/src/render/camera.ts) `landing()`；[fx.ts](file:///d:/zhao/monopoly/src/render/fx.ts) `fx.land` | 推近 `CAM_LAND_ZOOM`（≈3.2）→ 地块脉冲环 `fx.pulse` → 停顿 `FX_LAND_PUNCH_MS`（≈400ms）+ 落格重音 → 回落点取景；特写期间不展开浮层（取景禁区） |
| 4 | 路障规则明确（D4） | [game.ts](file:///d:/zhao/monopoly/src/core/game.ts) `moveCurrent` | **core 不改**：`moveCurrent` 已在起点前方第 1 个路障处截断 → `clearBarrier` → 玩家停在该格并**照常结算**；M19 只补 UI 选目标（前方 1–6 格）与文档明确 |
| 5 | 破坏表现 `fx.wreck`（D5） | [fx.ts](file:///d:/zhao/monopoly/src/render/fx.ts) 新增 `FxKind:'wreck'`（含 `FX_SPACE` / `motionFor`）；[registry.ts](file:///d:/zhao/monopoly/src/skin/registry.ts) 新增碎屑元素 `fx.rubble` | 用**旧层级** `building.s{idx}.l{oldLv}` 幽灵副本承载「下沉」+ `fx.rubble` 碎屑扇形飞散；不触碰地砖与店招（`building.s{idx}.sign`），仅 `shop` 格 |

**归属通路 / 四级回退**：M19 新增/新用的可见元素 `ui.preview` / `ui.cancel` / `board.tile.candidate` / `fx.pulse` / `fx.rubble` 全走**既有** `skin.json` 的 `elements` 映射（如 `ui.preview → proc/uiPreview`、`board.tile.candidate → proc/tileEdge`、`fx.rubble → proc/fxRubble`），并由 `tools/lint-skin.mjs` 校验（`[theme] OK` / `[skin:default] OK` / `[skin:photo] OK`；`registry-ids.json: 332 ids`）。裸值只出现在 L4 内建兜底 `fb({...})`，`npm run build` 的 `check-hardcoded` 前置闸门保持 clean。

**确定性**：M19 **未引入任何随机源**（无 `Math.random`、无 `makeRng` 调用）——拆迁令为确定性指定目标，候选格 / 预演条均由 state 纯函数派生，回放与 e2e 不受影响。

**回归口径（本轮实测）**：

```powershell
npx tsc --noEmit                                 # 退出码 0、无输出
npm run check                                    # eslint src tools 0 错；[theme] OK / [skin:default] OK / [skin:photo] OK；registry-ids.json: 332 ids；59 文件 / 602 例全绿
npm run build                                    # [check-hardcoded] clean（29 个文件）→ ✓ built in 4.13s
npx vitest run test/data/cards-data.spec.ts test/core/cards.spec.ts test/core/targeting.spec.ts test/render/iso.spec.ts test/core/game-cards.spec.ts test/core/ai.spec.ts test/ui/panels.spec.ts test/render/fx.spec.ts test/core/framing.spec.ts test/data/audio.spec.ts   # 10 文件 / 130 例全绿
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-shots-m19.mjs   # [m19-shots] PASS · 8 项 gate 全 true、errors: []
```

**截图清单（3 张，均 390×844 @dpr2 手机视口，出 780×1688 PNG，入 `docs/verify/`）**：`mono-m19-01-hand-6`（展开手牌抽屉后的 6 个槽，含「拆迁令」）/ `mono-m19-02-select-target`（点「拆迁令」进入选目标态：候选格高亮 + 预演条 + 取消键）/ `mono-m19-03-wreck-hit`（拆迁令命中后：目标格归无主 + 破坏表现「旧楼层幽灵下沉 + 碎屑」，此页**不加 `nofx=1`** 以显真实动效）。目视复核要点：①② 同一手机视口下抽屉 6 槽不溢出、预演条三行文案清晰；③ 命中帧能同时看到楼体下沉与飞散碎屑。

**取证脚本**：[local/mono-shots-m19.mjs](file:///d:/zhao/monopoly/local/mono-shots-m19.mjs)。关键口径：打 `?play=1&seed=20261002&humans=4&tour=0` **真实对局**（第 ①② 项加 `nofx=1`、第 ③ 项去掉以显动效），全程走与用户相同的 UI 路径（HUD 牌袋键 → 手牌槽 `card:demolish` → 棋盘 `#mono-pick` 命中层点选），由 `__monoMain.cellXY(idx)` 取舞台坐标再按 `#mono-ui` 放映矩形换算为页面 CSS 坐标后真实点击；因开局无「对手成楼商家格」⇒ 拆迁键默认不可点，脚本先给当前真人补一张「拆迁令」、在 `SHOP_TILE = 13` 安置一栋对手楼（`level: 1`）再操作（确定性布置，与 `local/mono-e2e-m19-select.mjs` 同源）。机器闸门 8 项：`hand_six_slots` / `demolish_enabled` / `ui_sel_demolish` / `candidates_present` / `target_intact_before_pick` / `cancel_key_present` / `wreck_target_cleared` / `ui_sel_cleared`（第 ③ 项先等 `fx.busy()` 抢拍动画中途帧，gate 只取「目标格 estate 已消失 + `uiSel()` 回到 null」的终态，保证确定性）。

### M20.1 破产拍卖与自由出售（拍卖改所有权 · 真人档位出价 · 卖地筹钱）2026-10-02

**范围**：对齐 spec `docs/superpowers/specs/2026-10-02-monopoly-m20-1-auction-and-sale-design.md` 的决策 **M20.1-D1..D10**（路线图诉求 ⑤「破产拍卖土地，价高者得」+ §4.3「破产拍卖改所有权转移」「自由出售房产」）。只改 `estates` 归属与 `cash`，**17 个商家格一个不动**；不引入银行信贷 / 抵押（M20.2）、股票 UI（M20.3）、设施入股（M20.4）。

**五项需求与落点**：

| # | 需求（D） | 落点 | 结果 |
|---|---|---|---|
| 1 | 破产拍卖裁决（D1/D3） | [auction.ts](file:///d:/zhao/monopoly/src/core/auction.ts) 纯函数 `lotOf` / `resolveLot` / `aiBidFor`；[economy.ts](file:///d:/zhao/monopoly/src/data/economy.ts) 增 `BID_RENT_MULT=6`；[ai.ts](file:///d:/zhao/monopoly/src/data/ai.ts) `AiParams.bidMult`（保守 0.6 / 激进 1.4 / 投机 1.0） | 单地块一轮密封报价，起拍价 = `sellAt()`；有效报价 `amount ≥ 起拍价`，最高价中标、**并列取小 id**，无有效报价流拍 |
| 2 | 所有权转移（D2） | [estate.ts](file:///d:/zhao/monopoly/src/core/estate.ts) 新增 `transferEstate`（唯一改 `owner` 的入口） | 成交后只换 `owner`，`level` / `processing` **原样保留**（不从零复建） |
| 3 | 清算路径改造（D3/D4/D5） | [game.ts](file:///d:/zhao/monopoly/src/core/game.ts) `settleDebt`：现金不足且有地 → 进入拍卖（`ownedBy` 按 `sellAt` 升序）；所得先清偿欠款、余额归破产者、不足由债权人承担差额；拍够即停 | 流拍且债权人为人 → 转移抵债；流拍且债权人为银行 → 删键回归「可购买」 |
| 4 | 待拍态 + 真人档位出价（D7） | `GameState.auction` / `seats`；`Game.sellEstate` / `bidAuction` / `autoResolveAuction`；[panels.ts](file:///d:/zhao/monopoly/src/ui/panels.ts) 拍卖浮层（版式 B）；[Hud.ts](file:///d:/zhao/monopoly/src/ui/Hud.ts) 真人「出售」键 | 待出价时游戏挂起（`settleCurrent` 返回 `{ kind:'auction' }`）；真人三档「起拍 / ×1.5 / ×2.4」+ 放弃 |
| 5 | 自由出售（D8）+ AI 同源（D9） | [targeting.ts](file:///d:/zhao/monopoly/src/core/targeting.ts) `PickKind` + `sell` 候选 / 预演；[main.ts](file:///d:/zhao/monopoly/src/main.ts) 复用 M19 选目标命中层 | 价 = `sellAt()`×100%、仅自己回合、售出删键回归「可购买」；`aiBidFor` 与真人共用 `resolveLot`，AI 不主动自由出售 |

**已知限制（M20.1-D6）**：多人分账路径（进贡 `tribute` 逐个债权人、抽成 `collect` 逐个付款人）本轮**保持既有自动变卖**，未改走拍卖；这些路径一次结算串行触发多笔债务，改造面大、回归风险高，M20.2 统一。即：**仅「单一债权人 / 收款人」的收租、税务等清算改走拍卖；多人分账债务仍按旧「自动变卖」处理。**

**归属通路 / 四级回退**：新增两个可见元素 `ui.bid`（出价键）/ `ui.bidDebt`（债务条）走 L2/L3 [skin.json](file:///d:/zhao/monopoly/public/skins/default/skin.json) → `uiBid` / `uiBidDebt` preset（见 Task 7）；几何常数集中在 [layout.ts](file:///d:/zhao/monopoly/src/skin/layout.ts) 的 `PANEL_BID_*` / `PANEL_DEBT_*`，色值走 [proc-panel.ts](file:///d:/zhao/monopoly/src/render/providers/proc-panel.ts) 的 L4 `PANEL_D` 内建兜底；地契卡复用既有 `ui.tileCard`（`PANEL_BID_CARD_S = 0.5`，`s=1` 时 HUD 逐值不变 ⇒ 零回归）。其余全部复用既有元素。

**确定性**：拍卖全链路**零随机**（顺序按 `sellAt` 升序 + 小格号；裁决最高价、并列取小 id；`aiBidFor` 为纯函数）——回放与 e2e 可复现。

**回归口径（本轮实测）**：

```powershell
npx tsc --noEmit                                 # 退出码 0、无输出
npm run check                                    # eslint src tools 0 错；[theme] OK / [skin:default] OK / [skin:photo] OK；registry-ids.json: 334 ids；63 文件 / 638 例全绿
npm run build                                    # [check-hardcoded] clean → ✓ built in 6.25s
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-e2e-m20-1.mjs     # OK（待拍 pending=[2,3,4]；三档 + 放弃；成交归玩家 2 / 保留 L3 / 原主不破产；出售删键、现金 100 → 430、uiSel 清空）
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-shots-m20-1.mjs   # [m20-1-shots] PASS · 10 项 gate 全 true、errors: []
npm run check:prod                               # 线上 gate 全 true、errors: []（退出码 0）
```

**线上闸门口径同步（本轮顺带清理 M18/M19 遗留债）**：`check:prod` 自 M16 后未再跑，M18 棋盘改形（撤 play 版式中部橱窗，spec §7.2）+ M19 手牌槽 5→6 使 4 项陈旧闸门恒红（v3/v5/v11/v12）。已用 A/B 对照实验确证与 M20.1 无关（把 `monopoly/src|public|mono.html` 切到 M20.1 前的 `4b18641` 重建，重跑同一脚本得到**完全相同的 4 项 false**），并按「保留原意图、只改口径」最小修正 [mono-prod-check.mjs](file:///d:/zhao/monopoly/local/mono-prod-check.mjs)：**v11** 手牌槽 5→6（= `HAND_SIZE`）；**v3** 候选元素由写死的 `building.s4.l2` 改为「theme.json 中带精确 `palette` 的 5 席里当前实际在场的第一席」（现取 `building.s0.l3`）；**v5** 保留「同层 hue 唯一 + 与 skin.json 常量一致」，去掉「L1/L2/L3 三档必须同时在场」；**v12** 由「6 原型全在 play 页可见」改为「在场 preset ⊆ 白名单」，并把「6 原型全覆盖」上移为 **V1** 的 `new Set(presets).size === 6`（`theme.json` 侧，静态可断言）。修正后本地与线上 `check:prod` 均退出码 0。

**截图清单（3 张，均 390×844 @dpr2 手机视口，出 780×1688 PNG，入 `docs/verify/`）**：`mono-m20-1-01-auction`（破产拍卖浮层：角标「破产拍卖 · 第 1/1 块」+ 债务条「待清偿 ￥105」+ 左侧地契卡「长峰特产 / Lv3 · 起拍 ￥330」+ 右侧三档「￥330 / ￥495 / ￥792」+ 放弃）/ `mono-m20-1-02-sell-select`（点 HUD「出售」后悬停候选格的选目标态：自有地块金框 + 预演条「出售 · 长峰特产 / 售价 ￥330（变卖价 100%）/ 售出后地块回归可购买」）/ `mono-m20-1-03-auction-done`（落槌后：3 号地块业主色变为玩家 2、楼层仍 L3）。目视复核要点：①② 同一手机视口下浮层不溢出、三档文案与债务条读数清晰；③ 产权转移（地契卡显示「持有 猪八戒」）而楼体层级不变。

**取证脚本**：[local/mono-shots-m20-1.mjs](file:///d:/zhao/monopoly/local/mono-shots-m20-1.mjs)（10 项机器闸门）与 [local/mono-e2e-m20-1.mjs](file:///d:/zhao/monopoly/local/mono-e2e-m20-1.mjs)（真实点击整链路）。关键口径：打 `?play=1&seed=20261002&nofx=1&humans=4&tour=0` 真实对局，全程走 `#mono-hud` / `#mono-panels` / `#mono-pick` 命中层；确定性布置由 `__monoMain` 在进站后完成——布置 `estates` / `cash`、**移除起始手牌中的「免罚」`pardon`**（否则收租被自动抵消而进不了清算），掷骰后读 `state.dice.total` 预校正 `pos`、**「前进」后再把 `pos` 钉到 `RENT_TILE = 13`**（因 `createGame({ abilities: true })` 使当前玩家带技能「筋斗云」`stepBonus=1`、实际前进 = `total + 1`），随后「前进 → 结算」必触发 13 号 shop 格收租破产拍卖。机器闸门 10 项：`auction_overlay` / `auction_badge` / `auction_bid_visual` / `auction_debt_bar` / `auction_card` / `auction_resolved` / `estate_owner2` / `level_preserved` / `sell_sel` / `sell_candidates`。

### M20.2 银行信贷（存款 · 信用贷款 · 抵押贷款 · 逾期罚息 · 两条违约链）2026-10-02

**范围**：对齐 spec `docs/superpowers/specs/2026-10-02-monopoly-m20-2-bank-credit-design.md` 的决策 **M20.2-D1..D14**（路线图诉求 ⑥「银行信贷」+ §4.3「存款 / 抵押 / 逾期处置」）。三条产品线（存款 / 信用贷款 / 抵押贷款）+ 两条违约链（逾期罚息 / 逾期强执），**17 个商家格一个不动**；不改股票 UI（M20.3）、设施入股（M20.4）。

**六项需求与落点**：

| # | 需求（D） | 落点 | 结果 |
|---|---|---|---|
| 1 | 数值真源（D2） | [bank.ts](file:///d:/zhao/monopoly/src/data/bank.ts) | 存款 +3%/轮、信用贷 6%/轮 · 8 轮 · 额度 min(￥2000, 净资产×30%)、抵押 4%/轮 · 6 轮 · 变卖价×80%、罚息 +50%、逾期满 3 轮强执、落 9 号格存款红包 5% |
| 2 | 信贷纯函数（D3） | [bank.ts](file:///d:/zhao/monopoly/src/core/bank.ts) | `loanLimitOf` / `mortgageLimitOf` / `interestOf` / `overdueOf` / `penaltyOf`（零随机、不 import `game` 运行时） |
| 3 | 六 API + 抵押锁定（D4/D7） | [game.ts](file:///d:/zhao/monopoly/src/core/game.ts) `deposit` / `withdraw` / `takeLoan` / `repayLoan` / `takeMortgage` / `redeemMortgage`；`creditLocked` | 借款 / 抵押须站 9 号格；抵押地块被锁（不可卖、不可升级、不进强执队列） |
| 4 | 轮末计息与逾期推进（D5/D6） | `game.ts` `settleBooks` / `runOverdueChains` | 存款与债务轮末复利；贷款首轮免息跳 1 次；`round > due` 记逾期 |
| 5 | 逾期罚息 + 两条违约链（D5/D6） | `game.ts` `chargeOverduePenalty` / `startAuction(trigger)` | 逾期者付租额外 +50%（直冲本金、不给地主）；贷款逾期满 3 轮强执拍未抵押地块（起拍 = 变卖价）；抵押超期拍抵押物（起拍 = 借款额） |
| 6 | 银行浮层 + 债务条 + AI（D9–D12） | [panels.ts](file:///d:/zhao/monopoly/src/ui/panels.ts) 版式 C / [Hud.ts](file:///d:/zhao/monopoly/src/ui/Hud.ts) 银行键 + 债务条 / [ai.ts](file:///d:/zhao/monopoly/src/core/ai.ts) `pickBank` | 真人站 9 号格结算后自动弹面板；每回合至多 1 步银行决策（还款优先 → 站格抵押 / 借款 → 存余钱） |

**归属通路 / 四级回退**：新增两个可见元素 `ui.debtBar`（顶部 HUD 债务条）与 `ui.bankRow`（银行浮层产品行 / 详情行）走 L2/L3 [skin.json](file:///d:/zhao/monopoly/public/skins/default/skin.json) → `uiDebtBar` / `uiBankRow` preset；几何常数集中在 [layout.ts](file:///d:/zhao/monopoly/src/skin/layout.ts) 的 `PANEL_BANK_*` / `HUD_DEBT_*`，色值走 [proc-panel.ts](file:///d:/zhao/monopoly/src/render/providers/proc-panel.ts) 的 L4 `PANEL_D` 内建兜底；浮层底板 / 角标 / 两枚操作键 / 关闭键全部复用既有元素。

**确定性**：信贷全链路**零随机**（利率、额度、罚息、逾期推进、强执队列均为纯算术；两条违约链顺序固定）——回放与 e2e 可复现。

**已知限制（spec §8）**：

1. **多人分账仍走自动变卖**：进贡 / 抽成等「多收款人」清算路径保持既有 `settleDebtAuto`，未改走拍卖（与 M20.1-D6 同一遗留）。
2. **额度基数不扣既有债务**：信用贷款额度 = 净资产 × 30%，净资产含现金 + 地产投入 + 持股市值，**不减未结清贷款本金**（spec §3.2 口径）。
3. **抵押物不进强执队列**：贷款强执只拍**未抵押**自有地块；抵押物由「抵押超期」链单独处置，避免重复拍卖。
4. **债务条在顶部条中段（有意偏差）**：底坞状态行已被「银行 / 出售 / 手牌」三键占满，债务条改放顶部 HUD 条中段 `HUD_DEBT_X=88, W=234`（避开分享键 8..86 与静音键 324..384）；四段等分（存款 / 债务 / 抵押 / 逾期），逾期段走警示色 `#e8a33d`。
5. **AI 不主动取款 / 赎回**：`pickBank` 只做「还款 / 抵押 / 借款 / 存款」四类，取款与赎回留给真人（避免 AI 无谓地来回搬运资金）。

**回归口径（本轮实测）**：

```powershell
npx tsc --noEmit                                 # 退出码 0、无输出
npm run check                                    # eslint 0 错；[theme] OK / [skin:default] OK / [skin:photo] OK；registry-ids.json: 336 ids；66 文件 / 706 例全绿
npm run build                                    # [check-hardcoded] clean → ✓ built in 8.10s
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-e2e-m20-2.mjs     # OK（六链：存取款 / 借款还款 / 逾期罚息 / 抵押赎回 / 贷款强执 / 抵押超期）
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-shots-m20-2.mjs   # [m20-2-shots] PASS · 6 项 gate 全 true、errors: []
```

**截图清单（4 张，均 390×844 @dpr2 手机视口，出 780×1688 PNG，入 `docs/verify/`）**：`mono-m20-2-01-bank-deposit`（银行浮层 · 存款页：版式 C 左三行产品「存款 / 信用贷款 / 抵押」+ 右详情「存款余额 ￥0 · 可用现金 ￥2000 · 轮息 +3% · 落 9 号格领红包 5%」+ 存入 / 取出）/ `mono-m20-2-02-bank-mortgage`（抵押页：抵押块数 1 · 利率 4%/轮 · 期限 6 轮 · 成数 80% 变卖价 · 可抵押 长峰特产（借 ￥264）+ 抵押 / 赎回）/ `mono-m20-2-03-debt-overdue`（顶部债务条「存款 ￥1240 · 债务 ￥600 · 抵押 0 块 · 逾期 2 轮」，逾期段走警示色）/ `mono-m20-2-04-mortgage-auction`（抵押超期拍卖：角标「破产拍卖 · 第 1/1 块」+ 债务条「待清偿 ￥208 / 已筹 ￥0 / 还差 ￥208」+ 地契卡「王氏鹿膏 Lv3 · 起拍 ￥208」+ 三档 ￥208 / ￥312 / ￥499 + 放弃；顶部债务条同步显示「债务 ￥208 · 抵押 1 块 · 逾期 1 轮」）。目视复核要点：①②③④ 同一手机视口下浮层与债务条均不溢出、四段读数清晰；③ 逾期段色与普通段可区分。

**取证脚本**：[local/mono-shots-m20-2.mjs](file:///d:/zhao/monopoly/local/mono-shots-m20-2.mjs)（6 项机器闸门）与 [local/mono-e2e-m20-2.mjs](file:///d:/zhao/monopoly/local/mono-e2e-m20-2.mjs)（真实点击六链）。关键口径：打 `?play=1&seed=20261002&nofx=1&humans=4&tour=0` 真实对局，全程走 `#mono-hud` / `#mono-panels` 命中层；六链确定性布置由 `__monoMain` 在进站后完成——

- **A 存取款**：站 9 号格现金 ￥2000 → 点「存入」→ 存款 ￥2000 / 现金 ￥0 / 债务条入画；点「取出」回 ￥2000、债务条整条隐藏（零回归）。
- **B 借款还款**：站 9 号格现金 ￥500 + 一块 L1 地产 → 「借款」入账额度（净资产 × 30%）、首轮免息、到期 = round + 8；「还款」全额结清（现金回 ￥500）。
- **C 逾期罚息**：持逾期贷款落 13 号 L3 商铺收租 → 租金 ￥105 归地主 + 罚息 ￥53（= round(105×50%)）直冲本金（本金 100 → 47、现金 1000 → 842）；**须先移除起始手牌里的「免罚」`pardon`**（否则收租被自动抵消而进不了罚息分支）；「前进」后把 `pos` 钉到 13 并把现金重置为 ￥1000（消除技能「筋斗云」`stepBonus=1` 与过起点红包的不确定）。
- **D 抵押赎回**：站 9 号格持 L3 地产 → 「抵押」得 ￥264（= 330×80%）并锁定地块；「赎回」付清回 ￥500。
- **E 贷款强执**：末位玩家（`current=3`）持逾期满 3 轮的贷款 + 一块未抵押 L1 地产 → HUD「结束回合」推一轮 → 触发 `loan-overdue` 拍卖（起拍 = 变卖价 ￥30），成交款冲抵本金至结清（现金 200 → 124、原主不破产）。
- **F 抵押超期**：末位玩家持 `round > due` 的抵押（index 11）→ HUD「结束回合」推一轮 → 触发 `mortgage-overdue` 拍卖（起拍 = 借款额 ￥208 = 200×1.04），成交后抵押清账、地块转移。

### M20.3-A 手牌排序与道具商店（含相机命中回归修复）2026-10-02

**范围**：对齐 spec `docs/superpowers/specs/2026-10-02-monopoly-m20-3-hand-and-item-shop-design.md` 的决策 **D-A / D-B / D-C**（路线图诉求 ②手牌排布 + ③道具商店，外加用户报障的 P0）。三件事：① 相机命中回归修复；② 手牌三键排序 + 单行横滑；③ 道具商店买卖。**股票轨（涨跌卡 / 红利卡 / 杠杆 / 爆仓 / 股票浮层 A 版式）留给 M20.3-B 单独交付。**

**三项需求与落点**：

| # | 需求（D） | 落点 | 结果 |
|---|---|---|---|
| 1 | 相机命中回归（D-A） | [main.ts](file:///d:/zhao/monopoly/src/main.ts) `pickIdxAt` | `#mono-pick` 选目标命中层补相机逆变换 `toWorld`，容差同口径折算 `TOL / zoom`；恒等位姿下与修复前**逐像素一致**（非取景态零回归） |
| 2 | 手牌排序 + 横滑（D-B） | [cards.ts](file:///d:/zhao/monopoly/src/data/cards.ts) `priority` / [panels.ts](file:///d:/zhao/monopoly/src/ui/panels.ts) `handSlots` / `handLayout` / `handBarView` / `main.ts` 横滑手势 | 三键稳定排序（持有 → 常用 `priority` 升序 → `ITEM_CARDS` 表序兜底）；槽宽 55 不变、槽数由 `ITEM_CARDS.length` 驱动；`contentW = n·W + (n−1)·G`、`maxScroll = max(0, contentW − 390)` |
| 3 | 道具商店（D-C） | [item-shop.ts](file:///d:/zhao/monopoly/src/data/item-shop.ts) / `game.ts` `buyItem`/`sellItem` / `panels.ts` 商店浮层 / [Hud.ts](file:///d:/zhao/monopoly/src/ui/Hud.ts) 商店键 / [ai.ts](file:///d:/zhao/monopoly/src/core/ai.ts) `pickStore` | 售价表 6 项（免罚 250 / 翻倍 250 / 炸弹 300 / 路障 150 / 迁点 200 / 拆迁令 500）+ 回收价 = 售价 × 50%（向下取整）；**每种至多持 1 张**；HUD 常驻「商店」键（不依赖走位）；AI 每回合至多 1 步采购 |

**优先级与互斥**：`overlayOf()` 在 `bank` 之后插入 `store`，得 `auction > settle > bank > store > stock > draw`；商店与银行同为「常驻 HUD 入口」且**互斥开合**（开一个即关另一个）。

**四级回退**：唯一新增可见元素 `ui.handBar`（手牌滑动条）已在 [registry.ts](file:///d:/zhao/monopoly/src/skin/registry.ts) 登记 + 内建 `fb` 兜底，`npm run lint:skin` 通过（`registry-ids.json` 由 336 → **337 ids**）；商店浮层**零新增皮肤元素**，100% 复用 `showcase.panel` / `ui.badge` / `ui.bankRow` / `ui.button.primary` / `ui.button.secondary` / `ui.qk`；几何集中在 [layout.ts](file:///d:/zhao/monopoly/src/skin/layout.ts) 的 `PANEL_STORE_ROW_H/GAP/Y0`（6 项装不进银行 40/8 行距，故行距独立），x / 宽 / 键位仍 100% 复用 `PANEL_BANK_*`。

**确定性**：排序三键、`resaleOf`、`buyItem` / `sellItem`、`pickStore` 四条规则全部为纯算术，**零随机**（`test/smoke.spec.ts` 的 `Math.random` 源码闸门通过）。

**已知限制**：

1. **滑动条本轮不入画（有意 · 待 M20.3-B 自动启用）**：6 张手牌 × 55px + 5 × 6px = 360px ≤ 390px，**恰好一屏** ⇒ `maxScroll = 0`、`ui.handBar` 不入画、`setHandScroll(v)` 恒被 clamp 到 0，横滑手势不进入拖拽态。M20.3-B 把 `ITEM_CARDS` 补到 8 种后（482px > 390px）滑动条与手势**自动启用、零版式返工**——本轮 e2e 闸门 `hand_row_fits` 即为此断言（防「为 8 槽留的横滑在 6 槽下误入画 / 误吞点击」）。**M20.3-B 已兑现**：8 槽下 `contentW = 482`、`maxScroll = 92`、`ui.handBar` 入画（见 M20.3-B 节，`mono-shots-m20-3.mjs` 复拍）。
2. **AI 只买不卖**：`pickStore` 不产出 `sellItem`（卖牌会与「保命线」规则相互抵消，收益不确定）。
3. **买卖逐张无档位**：每次 1 张（单键动作），与股票「1 手 / 5 手 / 全仓」三档刻意区分，避免手感混淆。

**回归口径（本轮实测）**：

```powershell
npx tsc --noEmit                                 # 退出码 0、无输出
npm run check                                    # eslint 0 错；[theme] OK / [skin:default] OK / [skin:photo] OK；registry-ids.json: 337 ids；72 文件 / 754 例全绿
npm run build                                    # [check-hardcoded] clean（29 个文件）→ ✓ built in 5.51s
$env:MONO_ORIGIN='http://127.0.0.1:52302'; node local/mono-e2e-campick.mjs      # [campick] PASS（5 项 gate 全 true、errors: []）
$env:MONO_ORIGIN='http://127.0.0.1:52302'; node local/mono-shots-m20-3.mjs      # [m20-3-shots] PASS（10 项 gate 全 true、errors: []）
$env:MONO_ORIGIN='http://127.0.0.1:52302'; node local/mono-e2e-playthrough.mjs  # [playthrough] PASS · 退出码 0 · 17 项 gate 全 true · problems=[] · errors=[]（整局 984 次点击跑到 over=true；AI 段 167s、auctionClicks=6）
```

**整局卡死回归（本轮发现并修复 · 两处）**：复跑 `mono-e2e-playthrough.mjs` 时 `gate.aiGame === false`，AI 段 300s 预算耗尽而状态**永久冻结**。逐层取证后确认是**两个独立缺陷串联**（修掉①后②才暴露）：

① **AI 规划必败步**（`round=20 / phase='settled' / pos=1` 冻结）：包装 `Game` 全部 API 计数后调 `skipRest()` → `counts = { upgradeCurrent: 65 }` 而 `state` **零变化** ⇒ 每步都是同一个必败步。**根因**：AI 站在**自有但已抵押**的地块上，[ai.ts](file:///d:/zhao/monopoly/src/core/ai.ts) `settledPlan` ② 只校验 `owner / canUpgrade / upgradeEager / !processing`、**漏检 `creditLocked`**，于是每步规划同一个 `upgrade`；而引擎 [game.ts](file:///d:/zhao/monopoly/src/core/game.ts) `upgradeCurrent()` 以 `creditLocked` 前置（spec §3.4 抵押期间锁出售 / 锁升级）返回 `{ ok:false, reason:'mortgaged' }` 且**不改 state** ⇒ `skipRest` 空转满 `AI_SKIP_MAX_STEPS`(64) 步返回、`tick` 同样空转 ⇒ 整局静默卡死（**非**测试预算问题）。**修复**：`settledPlan` ② 补 `&& !creditLocked(state, pos)`（与引擎同一前置），并新增 `test/core/ai.spec.ts`「抵押锁升级」3 例（未抵押 → 规划 upgrade / 抵押 → 不规划且以 `end` 收口可换手 / 根因复现：引擎返回 `mortgaged` 且 `state` 不变）。

② **e2e 未代真人出价**（修掉①后冻结点移到 `round=21 / pos=28`，换言之①只是把②掩盖了）：探针显示 `state.auction === true` 且 `counts = {}`（**一个 Game API 都没被调**）——`skipRest` 的循环守卫 `!(state.over || state.auction || state.current !== seat)` 一见待拍态即返回。**结论：引擎与 AI 均无缺陷** —— [game.ts](file:///d:/zhao/monopoly/src/core/game.ts) `openLot` 只把**真人**竞拍人挂进 `pending`（AI 席位当场 `aiBidFor` 即时算价入 `bids`），故 `state.auction` 挂起**必然**是「轮到真人出价」，而 `aiDriver.tick` / `skipRest` 在待拍态立即让位（`aiDriver.ts` 第 57 行「M20.1 待真人出价：拍卖挂起，AI 不推进」）本身就是正确设计。缺陷在**取证脚本**：两个整局段都只按「当前玩家是不是真人」决策，从不去点拍卖浮层，于是真人竞拍人被永久搁置。**修复**（[mono-e2e-playthrough.mjs](file:///d:/zhao/monopoly/local/mono-e2e-playthrough.mjs)）：① `readState()` 增 `auction` 快照并**计入状态签名**（出价本身不写 `lastEvent`，只有落槌才写 `auctionDone`，不带它会把「点出价」误判成「点了没反应」）；② 主整局与 AI 两段都在一切分支**之前**插入「待拍态优先」分支，代真人点首个可用出价档（`auction:bid:not([disabled])`）否则点放弃（`auction:pass`）；③ 墙钟上限 `420s → 600s`（4 真人整局实测 ≈ 984 次点击 × ~0.45s/次，原上限在机器有负载时会误报「墙钟超时」）。修复后 AI 段只用 167s 就跑完（`auctionClicks=6` 证明该分支确实被走到）。

**P0 回归取证（相机取景下「点不上棋盘 / 道具不生效」）**：`local/mono-e2e-campick.mjs` **刻意不带 `nofx=1`**（既有 `mono-shots-*.mjs` 全带 `nofx` ⇒ `camOn = false` ⇒ `zoom ≡ 1`，恰好掩盖该缺陷），把相机顶到 `zoom = 3.4` 后走真实点击链「HUD 手牌键 → 炸弹槽 → 目标格屏幕坐标」，5 项机器闸门：`cam_zoom_active`（zoom > 1.5，确实处于取景态）/ `bomb_armed`（进入选目标态且 `#mono-pick` 可点）/ `pick_would_miss`（**旧算法**在同一像素上解出 7 号格 ≠ 目标 3 号格，证明用例有效、能捕获该缺陷）/ `bomb_landed`（`lastEvent = { kind:'card', card:'bomb', target:3 }`）/ `estate_demoted`（目标地块 L2 → L1、手牌不再含炸弹）。

**截图清单（4 张，均 390×844 @dpr2 手机视口，出 780×1688 PNG，入 `docs/verify/`）**：`mono-m20-3-01-hand-sorted`（手牌行三键排序：持有的「免罚 / 炸弹 / 迁点」在前且亮显，未持有的「租金翻倍 / 路障 / 拆迁令」淡显在后 —— 正是 `priority` 10/30/50 ｜ 20/40/60 的两段）/ `mono-m20-3-02-store-panel`（道具商店浮层：角标「道具商店」+ 左列目录（行数 = `ITEM_CARDS.length`，本轮 6 行；M20.3-B 追加两卡后已由 `mono-shots-m20-3.mjs` 复拍为 8 行，见下节）+ 右列 4 行详情「用途描述（折行）/ 售价 ￥300 · 回收 ￥150 / 持有 1 张 / 现金 ￥3000」+ 买入（置灰）/ 卖出 / 关闭）/ `mono-m20-3-03-store-bought`（真实点击「炸弹」行 + 买入 → 现金 ￥1000 → ￥700、炸弹转「持有 1 张」、买入键置灰、卖出键点亮、面板保持开启（非模态））/ `mono-m20-3-04-store-sold`（真实点击卖出 → 回收 ￥150 到账（￥850）、炸弹转「持有 0 张」、卖出键置灰、买入键点亮）。目视复核要点：①②③④ 同一手机视口下浮层不溢出、目录行与 4 行详情间距清晰；① 持有 / 未持有的亮暗对比可辨；③④ 键位置灰 / 点亮状态与「持有」列一致。

**取证脚本**：[local/mono-shots-m20-3.mjs](file:///d:/zhao/monopoly/local/mono-shots-m20-3.mjs)（10 项机器闸门）与 [local/mono-e2e-campick.mjs](file:///d:/zhao/monopoly/local/mono-e2e-campick.mjs)（相机开启下的选目标回归）。关键口径：打 `?play=1&seed=20261002&nofx=1&humans=4&tour=0` 真实对局，全程走 `#mono-hud` / `#mono-panels` 命中层；闸门 `store_rows = ITEM_CARDS.length + 4`（本轮 10 = 6 目录行 + 4 详情行；M20.3-B 复拍后 12 = 8 + 4，均由 `ui.bankRow` 承载）、`store_buttons` 直查 DOM（`store:select` 数 = `ITEM_CARDS.length` 带 `data-target` = kind、`store:buy` / `store:sell` / `store:close` 各 1，且浮层展开时无其他 `#mono-panels` 键位残留）；`hand_row_fits` 在 8 槽口径下翻转为「出滑动条（`ui.handBar === 1`）+ 初始滚动量 0」。

### M20.3-B 股票轨（浮层 A · 买三档 / 卖三档 · 涨跌卡 · 红利卡 · 杠杆与爆仓）2026-10-02

**范围**：对齐 spec `docs/superpowers/specs/2026-10-02-monopoly-m20-3b-stock-track-design.md` 的口径 **B-D1 ～ B-D9**（股票轨主批，M20.3-A 已给出「手牌由 `ITEM_CARDS.length` 驱动」的干净底子）。三件事：① 股票**可指定标的与数量**（逐行选中 + 买三档 / 卖三档，支持只卖其中一支）；② 两张股票卡——涨跌卡 `bullBear` / 红利卡 `dividend`；③ 第 8 轮起**保证金杠杆**（2× / 3×）与**爆仓强平**。

**三项需求与落点**：

| # | 需求（B-D） | 落点 | 结果 |
|---|---|---|---|
| 1 | 指定标的与数量（B-D1 / B-D6） | [layout.ts](file:///d:/zhao/monopoly/src/skin/layout.ts) `PANEL_STOCK_*` / [panels.ts](file:///d:/zhao/monopoly/src/ui/panels.ts) 股票分支 / [main.ts](file:///d:/zhao/monopoly/src/main.ts) `stepOfPanel` | 浮层 A：4 行 `ui.stockRow`**可点选中**（恰一行金描边）+ `ui.stockChart` 跟随选中标的 + 买三档 / 卖三档各 3 键；命中区 `data-target` 编码 `` `${code}:${tier}` ``（`tier ∈ '1' \| '5' \| 'all'`）；档位→股数走纯函数 `lotShares`；**持有 0 股时卖档 3 键全禁用** |
| 2 | 涨跌卡 / 红利卡（B-D2 / B-D7） | [cards.ts](file:///d:/zhao/monopoly/src/data/cards.ts) `ITEM_CARDS` 追加（priority 70 / 80，`target` 新增 `'stock'` / `'none'`）/ [game.ts](file:///d:/zhao/monopoly/src/core/game.ts) `useCard(kind, target?, stock?)` + `state.stockForce` / `panels.ts` `bullbear` 浮层 | 涨跌卡：**选方向（默认押涨）+ 点股票行即成交** → 写 `state.stockForce[i] = { code, dir }`，下一轮 `market.tick` 按方向强制涨跌；失败分支 `no-target` / `unknown-code`。红利卡：**点即结算、无浮层** —— 每股 ￥20，无持仓折现 ￥100 |
| 3 | 杠杆与爆仓（B-D3 / B-D4 / B-D5 / B-D8 / B-D9） | [stocks.ts](file:///d:/zhao/monopoly/src/data/stocks.ts) 常量 / [game.ts](file:///d:/zhao/monopoly/src/core/game.ts) `MarginBook` · `trade` · `liquidate` · `onRoundBoundary` | `round >= 8` 才产出「无 / 2× / 3×」分段；杠杆**只在新买入时可选**（B-D4）；`own = ceil(cost / lev)`、`borrowed = cost − own`；借入 **6%/轮复利**；轮末固定 5 步：`settleBooks()` → 保证金复利 → `market.tick(force)` → 爆仓判定（`marketValue < principal × 1.2`）→ 清空强制方向表；爆仓**只用股票账户清偿**（清仓 → 先还借入 → 余债转信用贷款 / 有余额入现金），`lastEvent = { kind:'marginCall' }` |

**优先级与互斥**：`overlayOf()` 得 `auction > settle > bank > store > stock > bullbear > draw` —— 涨跌卡**随时可开**（不再要求 `phase === 'settled'` 早退），但仍被股票盘压住；`bullbearOpen` 与银行 / 商店同为互斥的常驻浮层，AI 驱动在这三种浮层展开时暂停。

**AI 策略**：`dividend` 无脑打出（Σ 持仓 > 0）、`bullBear` 押**自己持仓最重**那支为「涨」（并列取 `STOCKS` 表序小者，`heaviestHolding` / `heldShares` 两个纯函数）；股票交易恒 `trade(code, 1)`，**AI 不碰杠杆**（避免自杀式爆仓）。

**确定性**：`market.tick(force)` 在 `force` 命中该标的时**不调用 `rng()`**（与既有 `tips.includes(code) ? … : …` 的短路结构逐字节一致），既有 seed 回放序列不变 —— 单测「同 seed 下用 force 与不传 force 的后续 `rng()` 序列一致」即此断言。

**四级回退**：股票浮层 A **零新增皮肤元素**（复用 `ui.stockRow` / `ui.stockChart` / `ui.tradeBuy` / `ui.tradeSell` / `ui.qk` / `ui.badge`，底板是 M20.3-A 就登记的 `showcase.panelStock`）；涨跌卡浮层复用 `showcase.panel`（不新增注册项）；全部台位常量落 `src/skin/layout.ts`，`src/render` 内零裸值（`tools/check-hardcoded.mjs` clean）。

**取证发现的三个真实回归（本轮修复）** —— 均为「元素被更高层的命中键压住 ⇒ 点不中」类：

| 现象 | 根因 | 修复 |
|---|---|---|
| 股票浮层「卖」三档**点不中** | 卖档 598.6..625.2 与 HUD 快键行 607..629 重叠，而快键行（商店 / 银行 / 出售 / 手牌）画在浮层**之上**且照常可点 ⇒ 整条卖行被盖 | 改**标题行**（角标居左 `PANEL_STOCK_BADGE_CX` + 杠杆分段右对齐同线）腾出纵向空间；买 / 卖两行整体上移到 547..573.6 / 576.6..603.2（底 603.2 < 607） |
| 商店 **8 行越出底板** | 沿用银行的 34 行高 / 6 行距，8 行推到 618 > 面板底 600 | 整行按 `s = 0.8` 缩放（行盒 121.6×32、step 32）→ 8 行铺满 342..598；命中区与视觉**同一表达式**同源；新增单测断言行底 ≤ 面板底、行间不重叠 |
| 涨跌卡「取消」**压住第 4 支标的** | 取消键 502..524 与末行标的 490..524 重叠，取消画在行之上 ⇒ 中心区被盖、SY04 点不中 | 取消键下移到 536..558（末行底 524 + 12 缝，仍在 300..600 底板内）；新增单测断言「取消键与末行命中区不相交」 |

**回归口径（本轮实测）**：

```powershell
npx tsc --noEmit                                 # 退出码 0、无输出
npm run check                                    # eslint 0 错；[theme] OK / [skin:default] OK / [skin:photo] OK；registry-ids.json: 338 ids（M20.3-A 的 337 + 本轮 `showcase.panelStock`）；74 文件 / 787 例全绿
npm run build                                    # [check-hardcoded] clean（29 个文件）→ ✓ built in 8.47s
$env:MONO_ORIGIN='http://127.0.0.1:52302'; node local/mono-shots-m20-3b.mjs   # [m20-3b-shots] PASS（14 项 gate 全 true、errors: []）
$env:MONO_ORIGIN='http://127.0.0.1:52302'; node local/mono-shots-m20-3.mjs    # [m20-3-shots] PASS（10 项 gate 全 true —— 8 槽手牌出入画滑动条、商店 8 目录行 + 4 详情行）
$env:MONO_ORIGIN='http://127.0.0.1:52302'; node local/mono-e2e-playthrough.mjs # [e2e:play] PASS · round=61 · clicks=984 · 退出码 0 · tally 含 stock:buy（三档路径）
```

**截图清单（4 张，均 390×844 @dpr2 手机视口，出 780×1688 PNG，入 `docs/verify/`）**：① `mono-m20-3b-01-stock-panel`（浮层 A：SY02 选中行金描边 + 走势图角标「SY02 走势」+ 买三档「买 1 手 / 买 5 手 / 买全仓」+ 卖三档全灰禁用 —— 持股 0）；② `mono-m20-3b-02-leverage`（第 8 轮解锁杠杆分段「无 / 2× / 3×」选中 2×；2× 买 5 手后 `own ￥200 / 借入 ￥200`、持仓 5 股 ￥400、现金 ￥2800、走势图角标追加「借款 ￥200」）；③ `mono-m20-3b-03-bullbear`（涨跌卡浮层：角标 + 押涨 / 押跌（押跌金底选中）+ 4 行标的 + 取消键**落在末行之下不压盖**）；④ `mono-m20-3b-04-dividend`（红利卡结算后：手牌横滑到最右，红利卡槽转淡显、现金 ￥0 → ￥500 —— 25 股 × ￥20）。目视复核要点：①② 买 / 卖两行**整段在 HUD 快键行之上**、均可点；② 杠杆段与角标同一行不互相压盖；③ 取消键与第 4 行留缝；④ 8 槽手牌出现滑动条且槽 7..8 可滑入视野。

**取证脚本**：[local/mono-shots-m20-3b.mjs](file:///d:/zhao/monopoly/local/mono-shots-m20-3b.mjs)（14 项机器闸门：`stock_rows` / `stock_chart_follows` / `stock_tiers` / `stock_lev_locked` / `overlay_panel` / `lev_unlocked` / `lev_selected` / `lev_buy_split` / `lev_chart_debt` / `bullbear_open` / `bullbear_panel` / `bullbear_play` / `dividend_holding` / `dividend_paid`）。关键口径：打 `?play=1&seed=20261002&nofx=1&humans=4&tour=0` 真实对局，停格走「真实掷骰 + 反推起点」落到 19 号股票格，全程点 `#mono-hud` / `#mono-panels` 命中层（唯一例外是 M20.3-A 就登记的 `__monoMain.setHandScroll` 取证 API，用于手牌横滑）。

### 最终验收（对照 spec §11 硬性标准）

| # | spec §11 条目 | 证据 |
|---|---|---|
| 1 | 手机视口截图（390×844 dpr2） | M1–M8 全部 `docs/verify/mono-*.png`（M7 新增线上 `mono-prod-01..03`；M7-4 真实点击整局另出 `mono-e2e-01..07`——首末 `mono-e2e-01-start` / `07-final`，973 次点击跑到 `over=true`；M8 新增 `mono-share-01-cta` / `02-result` / `03-fallback`；M9/M10 新增 `mono-ai-01-setup-skip` / `02-setup` / `03-started` / `04-turn` / `05-tour-1..4` + 线上 `mono-prod-00-default`（开局面板）/ `mono-prod-04-ai-seat` / `mono-e2e-08-ai-final`；M11 新增 `mono-prod-05-audio-on` / `mono-prod-06-audio-off`） |
| 2 | `src/core` + `src/skin` 单测全覆盖 | `npx vitest run` → **48 文件 / 394 例全绿**（含骰子分布/移动越界/租金/升级互斥/卡牌效果/破产/胜负/回退链；M8 新增 `test/ui/share.spec.ts` 19 例；阶段一新增 `test/skin/shop-config.spec.ts` 9 例 + `instantiate` 覆盖优先级 1 例；本轮新增 `test/core/ai.spec.ts` 10 例 + `test/ui/ai-driver.spec.ts` 8 例 + `test/ui/tutorial.spec.ts` 5 例；M11 新增 `test/data/audio.spec.ts` 6 例 + `test/ui/audio.spec.ts` 21 例 + `test/render/proc-audio.spec.ts` 6 例 + `test/ui/hud.spec.ts` 增 4 例 + `test/smoke.spec.ts` 增 1 例） |
| 3 | 视觉回归与 v5 样张对齐 | M2-1..4 / M3-1..3 目视结论 |
| 4 | 可换素材（`?skin=photo` 零改代码、缺素材走回退） | M3-5 / M7-2；线上 `missingAssets === []`、image 实例 8 |
| 5 | 性能（中端安卓 60fps、首屏 <3s） | **每帧渲染**（60fps 判定口径）：4× CDP 节流代理 `npm run perf:android` 空闲 p95 4.4–10.0 ms、动效中 p95 3.1–14.7 ms **<16.7ms 帧预算 ✅**；首屏 1.27–1.36s **<3s ✅**；状态切换 `paint()` p95 42–56 ms 属**一次性卡顿**（≈掉 2–3 帧/动作，整局 ≈928 次，架构常态非缺陷）。真机人工勾选 ☐ |
| 6 | 规则化实例化（无裸值、只改注册表 + skin.json、`?debug=1` 可定位） | `npm run lint` 0 错 / `npm run lint:skin` → `[skin:default] OK`、`[skin:photo] OK` / `?debug=1` 面板 |
| 7 | 部署（本地构建 → scp → 服务器仅解压） | M7-1 七步输出 |
| 8 | **M8 微信分享入口（本任务新增，超出 spec §11）** | `node local/mono-share-check.mjs` 13 项 gate 全 true / 退出码 0；线上 `og:image` 200 · `image/png` · 274903 bytes；`local/mono-prod-check.mjs` + `local/mono-e2e-playthrough.mjs` 均退出码 0（详见 M8 节） |
| 9 | **商业闭环·阶段一「静态认领」配置加载（本任务新增，超出 spec §11）** | `node local/mono-shots-shops.mjs` 8 项 gate 全 true / 退出码 0；4 张 390×844 @dpr2 截图（`docs/verify/mono-shops-01..04`）；`npm run check` 45 文件 / 365 例（详见 §5） |
| 10 | **M11 音效与音乐（本任务新增，超出 spec §11）** | `npm run check` 全绿（51 文件 / 433 例）/ `registry-ids.json: 237 ids` / `npx tsc --noEmit` 无错；线上 `mono-prod-check.mjs` 9 项音频 gate（`audioLazy` 懒建 ctx / `audioUnlock` 单实例 / `audioPlay` 真实发声 / `audioPrefsDefault` / `audioIconsOn` / `audioMute` 静音后无声 + 落库 / `audioResume` 点回恢复 / `audioKeys` 结算后常驻 / `audioForceMute` `?audio=0` 不建 ctx）、`mono-e2e-playthrough.mjs` 新增 `audio_keys` + `ai_audio_keys`；2 张 390×844 @dpr2 截图（`mono-prod-05-audio-on` / `06-audio-off`）；默认皮肤零音频网络请求 |
| 11 | **M12 真机音频解锁回归（本任务新增，超出 spec §11）** | `npm run check` 全绿（51 文件 / 435 例）/ `npx tsc --noEmit` 无错；本地 preview（52301）与线上双闸门全绿且 `errors=[]`，`mono-prod-check.mjs` 全部 gate 为 `true`（音频项改真机口径：`audioLazy`/`audioUnlock`/`audioForceMute` 走 `isUnlocked()`、`audioPlay` 走 `dice.total`；并新增 `fixDice`/`fixMove`/`fixEvent`）、`mono-e2e-playthrough.mjs` 新增 `audio_unlocked`；3 张 390×844 @dpr2 截图（`mono-prod-07-dice-pips` / `-08-pawn-move` / `-09-event`）；根因与闸门盲区详见 M12 节 |
| 12 | **M13 画面重设计（本任务新增，超出 spec §11）** | `npm run check` 全绿 / `npx tsc --noEmit` 无错；`node local/mono-prod-check.mjs` 全部 gate 为 `true` 且 `errors=[]`（新增 `v1…v14 / v2b / v6b` 共 16 项）；**14 张 390×844 @dpr2 手机视口截图**（`mono-visual-01a..01e` 五套配色 + `02..06` 局部特写 + `07-catalog` / `07b-atmosphere` 素材库 + `08-console` 风格控制台 + `09-players` 人物气泡）；`theme.json` 改配置即换风格、`src/render/**` 零改动、`git diff --stat src/core` 为空（详见 M13 节） |
| 13 | **M15 P0 解耦与相机基座（本任务新增，超出 spec §11）** | `npx tsc --noEmit` 退出码 0；`npm run check` 55 文件 / 513 例全绿（新增 `test/core/framing.spec.ts` 17 例）；`npm run build` check-hardcoded clean（29 文件）；线上 `mono-prod-check.mjs` **V1–V17 共 39 项 gate 全 true、errors: []**（新增 V15 分辨率未降 / V16 UI 解耦 / V17 宽屏几何）；**2 张截图**（`mono-prod-10-p0-mobile` 390×844 @dpr2 / `mono-prod-11-p0-desktop` 1440×900）；该部分**无可见变化**，相机本体留待 P1 接线（详见 M15 节 §15.1–15.2） |
| 14 | **M15 P1 相机取景编排（本任务新增，超出 spec §11）** | `npx tsc --noEmit` 退出码 0；`npm run check` 55 文件 / 517 例全绿；`npm run build` check-hardcoded clean（29 文件，`camera.ts`/`framing.ts` 无裸倍率·裸时长）；线上 `mono-prod-check.mjs` **V1–V20 全 true、errors: []**（新增 V18 静止态烘焙 N/A / V19 取景 `world.scale.x ∈[1.6,4]` + 归位 1±0.01 + `?cam=0`·`?nofx=1` 恒 1 / V20 `?perf=1` 300 帧已按降级兜底）；`mono-e2e-playthrough.mjs` PASS（973 次点击、含 `cam_nofx_idle`/`cam_framing`/`cam_reset`）；`npm run shots:cam` PASS，**五态截图**（`mono-cam-01-idle`/`02-lead`/`03-follow`/`04-settle`/`05-reset`，390×844 @dpr2）+ **360×640 窄屏命中 round-trip 一致**（详见 M15 节 §15.3–15.5） |
| 15 | **M15 P2 近景建筑增强（本任务新增，超出 spec §11）** | `npx tsc --noEmit` 退出码 0；`npm run check` 55 文件 / 517 例全绿；`npm run build` check-hardcoded clean（29 文件，新增几何全走取值器）；线上 `mono-prod-check.mjs` **V1–V20 全 true、errors: []**；`mono-e2e-playthrough.mjs` PASS（973 次点击）；`npm run shots:cam` PASS（五态复拍）；**`npm run shots:p2` PASS** —— 体型变体 4 款（`plain`/`veranda`/`dormer`/`annex`，按 `state.slot % 4` 轮换，`?debug` 与橱窗消费者零回归）、轮廓阶梯 B 加法檐带（A 结构退台预留开关默认关）、台阶铺装，**10 张 390×844 @dpr2 受控对照截图** + 像素哈希 gate（四款两两不同、开关均改变像素）（详见 M15 节 §15.6–15.8） |
| 16 | **M16 玩法与形象升级（本任务新增，超出 spec §11）** | `npx tsc --noEmit` 退出码 0；`npm run check` 58 文件 / 571 例全绿；`npm run build` check-hardcoded clean；`node local/mono-shots-m9.mjs` **PASS**（14 项 gate 全 true、`errors: []`）；**12 张 390×844 @dpr2 手机视口截图**（`mono-m9-01..09`）；四项需求：① 浮层展开时 `#mono-slots` 整块让位（`setHidden` + `overlayOf`，无浮层零回归）② 角色技能 / 事件卡 6→20 / 地产 3→5 级 / 特殊格补全（银行·乐透·税金·医院，17 商家格不动）③ 西游·取经四众形象 + 原著台词（逐条标回目、剔影视二创）④ 棋子放大 C 档 32px（`pawnScale 1.6`、同格 2×2）——另关闭 M4 楼体层级「有意偏差」（详见 M16 节） |

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

牌堆数据在 `src/data/cards.ts`：`FATE_DECK` **20 张**（`FateKind` 14 种）、`CHANCE_DECK` **20 张**（`ChanceKind` 10 种）、`ITEM_CARDS` 5 张（`DECK_SIZE = 20`）。**牌堆张数与棋盘格数解耦**（见 `cards.ts` 顶部注释；M16 起棋盘上 `fate` = 2 / 17 / 29、`chance` = 5 / 14 / 31，各 3 格——腾出的 4 格改为 `bank` / `lottery` / `tax` / `hospital`）——改**商家名单不必动牌堆**，只有改**牌面文案 / 金额**才动 `cards.ts`。

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