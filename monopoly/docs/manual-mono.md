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

URL 参数：`?skin=<id>`（切皮肤）· `?debug=1`（显示元素 ID/包围盒/depth/provider 回退级别）· `?seed=<n>` · `?speed=<n>`（动画时轴倍率）· `?play=1`（交互局）· `?nofx=1`（等价 `speed=999`，动画瞬间到终帧）· `?perf=1`（性能覆盖层 + 帧间隔采样）。

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

**M4 结论**：`src/core` 全部单测通过（`board` / `economy` / `dice` / `board-path` / `estate` / `game` 共 53 例，`test/core` 全量 57 例）+ 端到端整局可跑（`__monoMain.sim()` 返回胜者、`round ≤ ROUND_LIMIT + 1`）。有意偏差：楼体层级仍走演示层级 `slotLevelsOf()`（实时升级动画并入 M6），地砖归属色与棋子位置已跟游戏状态联动。

### M5 卡牌 / 股票 / 特殊格

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M5-1 | 打开 `mono.html?debug=1&play=1&seed=20260928` | 底部出现手牌 5 槽（炸弹/路障/免罚/迁点/租金翻倍），持有为亮、免罚为被动灰槽 | `mono-m5-01-hand.png` |
| M5-2 | 点「炸弹」再点对手地块 | 目标楼降 1 级（L1 炸回无主），手牌炸弹消耗、地块归属色消失 | `mono-m5-02-bomb.png` |
| M5-3 | 控制台把 `players[0].pos` 移到命运/机会格前并走一步 | 浮层出现抽卡翻牌，`state.lastDraw.deck` 与牌面文案来自 `cards.ts`；右上角可见「关闭」键（点掉浮层） | `mono-m5-03-draw.png` |
| M5-4 | 走到 index 19 股票交易所 | 弹出股票盘：4 支行（上排 代码/名称/现价/涨跌，下排「持股 n / 市值 ￥n」）+ 近价折线走势图（端点涨跌色脉冲）；盘底可见「买 1」「卖 1」键，点「买 1」后持股 +1、现金 −价 | `mono-m5-04-stock.png` |
| M5-5 | 落到 index 12 监狱 | 状态行显示「禁行 2 回合」，主按钮变「跳过（1）」；持有免罚卡则自动抵消、不进监 | `mono-m5-05-jail.png` |
| M5-6 | 控制台 `__monoMain.sim()` | 跑到胜负，结算面板展开含 4 行名次（净资产含地产 + 股票市值） | `mono-m5-06-settle.png` |
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

**性能核对行**（`node local/mono-perf.mjs`；headless 仅给代理指标，真机 60fps 需人工勾选）：

| 指标 | 门槛 | 实测（default / photo） | 结论 |
|---|---|---|---|
| 首屏可交互 | < 3000ms | 248 / 1096 ms | ✅ |
| 单次全量重绘 p95 | ≤ 20ms | 15.6 / 17.6 ms | ✅ |
| 场景绘制元素数（pass 1–3） | < 200 | 189 | ✅ |
| fx 峰值 overlay 元素数 | < 40 | 12 | ✅ |
| 真机 60fps（中端安卓） | 稳定 60fps | 待人工勾选 ☐ | — |

**M6 结论**：§5.6 九条动效全部落地（GSAP 编排；时长/弧高/粒子数一律经 `src/skin/layout.ts` 的 FX 段 + `skin.json` 的 `fx` token 注入，`fx.ts` 零裸色值/裸时长，`check-hardcoded` 通过）；动画只消费 `instantiate()` 产出的实例、绝不写 `state`。

**M6 有意偏差（精确记录）**：spec §11.5 预算「单帧绘制调用 < 200」按**场景渲染（pass 1–3）= 189** 计（✅）；若把**屏幕空间 HUD/浮层（pass 4）也算进整帧元素则 = 205**（M4/M5 常驻的底坞/资产条/骰面/手牌共 16 件）。该 205 是**元素实例数**而非 GPU 绘制调用数——Pixi 会对同状态图元合批，且 HUD 为静态屏幕空间图元，故不影响「绘制调用 < 200」。另：headless Chromium 的 rAF 被浏览器限到 ~20fps（帧间隔 p95 ≈ 66.7ms），**不可当真机帧率**，故门槛以「单次全量重绘 p95 ≤ 20ms」作为可测代理，真机 60fps 由人工核对行兜底。GSAP 打进 `release/js/mono.js`：471.68 kB（gzip 158.48 kB）。

### M7 部署与线上回归

| # | 步骤 | 期望 | 证据/截图 |
|---|---|---|---|
| M7-1 | `node scripts/deploy-mono.mjs`（=`npm run deploy`） | 本地构建 → tar 整包 → scp → 服务器仅解压（无服务器构建）；`mono.html` 200、`js/mono.js` 线上字节数=本地、`skins/photo/skin.json` 200 | 七步输出见下 |
| M7-2 | `node local/mono-prod-check.mjs`（=`npm run check:prod`） | 线上无报错、元素计数一致、`?skin=photo` 可用、整局可跑 | `mono-prod-01..03` |
| M7-3 | 手机打开 `https://game.joho.cn/tour/mono.html?play=1` | 与本地同 seed 同画面、可完整打一局 | — |

**部署记录**（ts `20260929-020158`）：
- `ROOT = /opt/1panel/apps/openresty/openresty/www/sites/game.joho.cn/tour`（`location ^~ /tour/` alias 到此目录，替换即时生效、无需 nginx reload）
- 备份 `tour.bak-20260929-020158`（脚本保留最近 **3** 份、多余自动删；本次现存 1 份）
- 校验：`https://game.joho.cn/tour/mono.html` → **200** ✅；`js/mono.js` 线上/本地 = **472974 / 472974 bytes** ✅；`skins/photo/skin.json` → **200** ✅
- 线上 URL：<https://game.joho.cn/tour/mono.html>

**线上回归记录**（`node local/mono-prod-check.mjs`，退出码 **0**，`gate` 全 `true`、`errors=[]`）：
- `board.tile.*`=32 / `ui.playerBar`=4 / `dice.body`=2 / `ui.handSlot`=5（与本地闸门一致）
- `__monoMain.sim()` → 胜者 4、`state.over=true`、`round=61`
- `?skin=photo`：`__monoMain.missingAssets=0`、image provider 实例 8（图片素材线上就位）
- 截图：`docs/verify/mono-prod-01-board.png` / `mono-prod-02-play.png` / `mono-prod-03-skin-photo.png`

**环境偏差（精确记录）**：① 脚本步骤 1 在 Windows 上经 `powershell.exe -NoProfile -Command "npm run build"` 调起（等价 `npm run build`）——经 `cmd.exe` 间接 spawn npm 时 vite 6.4 抛 `[vite:html-inline-proxy] No matching HTML proxy module found`（已实测复现），改走 PowerShell 即稳；② 远程校验用 Node 内置 `fetch` 替代计划里的 `curl | wc -c`（Windows 无 `wc`、`curl` 为 PowerShell 别名），字节数比对等价。服务器侧始终只 `cp`/`tar -x`，绝无 `npm`/`vite`/`node`。

### 最终验收（对照 spec §11 硬性标准）

| # | spec §11 条目 | 证据 |
|---|---|---|
| 1 | 手机视口截图（390×844 dpr2） | M1–M7 全部 `docs/verify/mono-*.png`（M7 新增线上 `mono-prod-01..03`） |
| 2 | `src/core` + `src/skin` 单测全覆盖 | `npx vitest run` → **43 文件 / 333 例全绿**（含骰子分布/移动越界/租金/升级互斥/卡牌效果/破产/胜负/回退链） |
| 3 | 视觉回归与 v5 样张对齐 | M2-1..4 / M3-1..3 目视结论 |
| 4 | 可换素材（`?skin=photo` 零改代码、缺素材走回退） | M3-5 / M7-2；线上 `missingAssets === []`、image 实例 8 |
| 5 | 性能（中端安卓 60fps、首屏 <3s） | `node local/mono-perf.mjs` 实测（见下）+ 真机人工勾选 ☐ |
| 6 | 规则化实例化（无裸值、只改注册表 + skin.json、`?debug=1` 可定位） | `npm run lint` 0 错 / `npm run lint:skin` → `[skin:default] OK`、`[skin:photo] OK` / `?debug=1` 面板 |
| 7 | 部署（本地构建 → scp → 服务器仅解压） | M7-1 七步输出 |

**§11.5 性能实测**（`node local/mono-perf.mjs`，headless 代理指标；受本机负载影响会抖动，同机连测 3 次的区间如下）：
- 首屏可交互：default 235–255 ms / photo 1739–1784 ms（门槛 <3000 ✅）
- 单次全量重绘：**p50 ≈ 7.2 ms**（稳定）；**p95 15.9–28.9 ms（default）/ 19.9–23.5 ms（photo）**——临界于 20 ms 门槛且随负载抖动（p50 远低于门槛，p95 尾部分位受本机后台负载抬高）
- 场景绘制元素数（pass 1–3）：189 < 200 ✅；fx 峰值 16 < 40 ✅
- **诚实声明**：**中端安卓真机 60fps 未在真机测量**（本机无中端安卓设备）；headless Chromium 的 rAF 被限到 ~20fps（帧间隔 p95 ≈ 100 ms），不能当真机帧率，故该项仍留人工在真机勾选。

**M7 结论**：M1–M6 产物已发布到 `https://game.joho.cn/tour/mono.html`，线上回归七项闸门全绿（200 / 无报错 / 元素计数 / `?skin=photo` / 整局 / 三张截图 / `errors=[]`）；部署固化为「本地构建 → tar 整包 → scp → 服务器仅解压」，自带最近 3 份备份与三项字节数校验。

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

现状：32 格沿用 v5 样张的**占位 / 派生**商家名与楼层（spec §12 待办项 1「真实双阳商家清单与租金数值」）。本节给出一次性替换指引，**只改数据、不动代码逻辑**。

### 4.1 改哪个文件、哪些字段

唯一真源 `src/data/board.ts`。逐格数据是 5 个等长数组（长度 32，`index` 0..31），`TILES` 由它们汇总：

| 数组（`TileDef` 字段） | 含义 / 消费点 |
|---|---|
| `TILE_NAMES`（`name`） | 商家**全名**（如「双阳鹿产品特产店」）；当前渲染未读全名，作主表保留（导出 `nameAt(index)`） |
| `TILE_SHORT`（`short`） | **棋盘 32 格地名字牌**文字（`LabelView.drawLabels` 直画；`labelTextOf → shortAt`） |
| `TILE_BRAND`（`brand`） | **店招 / 楼体 / 橱窗信息条**文字（`building.s*.sign`、`building.s*.l{1,2,3}`、`showcase.*` 均取它） |
| `TILE_TYPES`（`type`） | 格子功能，取值 `core / shop / chance / fate / bonus / jail / stock`；决定地砖元素 ID `board.tile.<type>` |
| `TILE_LEVEL`（`level`） | 演示初始楼层 `0..3`（0 = 空地砖、无楼） |

**租金 / 建造价不是逐格字段**：全局按级 `RENT_BY_LEVEL = [0, 15, 45, 105]`、`PRICE_BY_LEVEL = [0, 60, 180, 420]`（同在 `board.ts`），经 `src/data/economy.ts` 的 `rentOf(level)` / `buyPrice(level)` 消费。**维持现有三级经济模型时，换商家无需改它们**；若要让**每格租金差异化**，须先扩 `TileDef` 与 economy 口径（属功能变更，另立任务）。

**32 格现占位名单**（`index`：`name` / `short` / `brand` / `type` / `level`）：

| # | name | short | brand | type | level |
|---|---|---|---|---|---|
| 0 | 优美惠市集生鲜超市 | 优美惠超市 | 优美惠 | core | 3 |
| 1 | 双阳鹿产品特产店 | 鹿产品特产 | 鹿特产 | shop | 1 |
| 2 | 命运卡 | 命运卡 | 命运 | fate | 0 |
| 3 | 双阳本地农家果蔬店 | 农家果蔬 | 果蔬店 | shop | 1 |
| 4 | 太平温泉 | 太平温泉 | 太平温泉 | shop | 2 |
| 5 | 机会卡 | 机会卡 | 机会 | chance | 0 |
| 6 | 双阳特色烧烤店 | 特色烧烤 | 烧烤店 | shop | 2 |
| 7 | 福利中心 | 福利中心 | 福利 | bonus | 0 |
| 8 | 农家杂粮店 | 农家杂粮 | 杂粮店 | shop | 1 |
| 9 | 命运卡 | 命运卡 | 命运 | fate | 0 |
| 10 | 双阳民宿小院 | 民宿小院 | 民宿 | shop | 2 |
| 11 | 双阳糕点面食铺 | 糕点面食 | 面食铺 | shop | 1 |
| 12 | 监狱 | 监狱 | 监狱 | jail | 0 |
| 13 | 山泉饮用水门店 | 山泉水 | 山泉水 | shop | 2 |
| 14 | 机会卡 | 机会卡 | 机会 | chance | 0 |
| 15 | 双阳本地松子特产店 | 松子特产 | 松子 | shop | 1 |
| 16 | 农家采摘园 | 采摘园 | 采摘园 | shop | 1 |
| 17 | 命运卡 | 命运卡 | 命运 | fate | 0 |
| 18 | 双阳火锅店 | 火锅店 | 火锅店 | shop | 3 |
| 19 | 股票交易所 | 股票所 | 股票所 | stock | 0 |
| 20 | 双阳露营基地 | 露营基地 | 露营 | shop | 2 |
| 21 | 机会卡 | 机会卡 | 机会 | chance | 0 |
| 22 | 粮油米面店 | 粮油米面 | 粮油 | shop | 1 |
| 23 | 命运卡 | 命运卡 | 命运 | fate | 0 |
| 24 | 双阳洗衣生活馆 | 洗衣馆 | 洗衣馆 | shop | 1 |
| 25 | 机会卡 | 机会卡 | 机会 | chance | 0 |
| 26 | 乡村酒厂 | 乡村酒厂 | 酒厂 | shop | 2 |
| 27 | 福利中心 | 福利中心 | 福利 | bonus | 0 |
| 28 | 双阳照相馆 | 照相馆 | 照相馆 | shop | 1 |
| 29 | 命运卡 | 命运卡 | 命运 | fate | 0 |
| 30 | 农家乐饭店 | 农家乐 | 农家乐 | shop | 3 |
| 31 | 机会卡 | 机会卡 | 机会 | chance | 0 |

**配套映射（按需同步）**：`SLOT_BANNER`（竖幌子文字，仅 0 / 4 / 6 / 18 / 26）、`SLOT_LANTERN_CHAR`（灯笼字，仅 4 / 6 / 18 / 26）、`DEMO_OWNER`（演示归属）、`OWNER_HUE`（归属色相）——均在 `board.ts`。

### 4.2 命运 / 机会牌堆

牌堆数据在 `src/data/cards.ts`：`FATE_DECK` 6 张、`CHANCE_DECK` 6 张、`ITEM_CARDS` 5 张（`DECK_SIZE = 6`）。**牌堆各 6 张与棋盘 `fate` 5 格 / `chance` 5 格解耦**（见 `cards.ts` 顶部注释；棋盘上 `fate` = 2 / 9 / 17 / 23 / 29、`chance` = 5 / 14 / 21 / 25 / 31，各 5 格）——改**商家名单不必动牌堆**，只有改**牌面文案 / 金额**才动 `cards.ts`。

### 4.3 改店名 / 店招会牵动哪些元素 ID 与 `skin.json`

- **店名字牌**：由 `LabelView.drawLabels` 直接绘制（**非**注册表元素）→ **无元素 ID、无 `skin.json` 条目**；配色取 `skins/*/skin.json` 的 `tokens.labelBg / labelText / labelOwnedText`。
- **店招 sign**：元素 ID `building.s<slot>.sign`（`slot` 0..31，**仅 L2 / L3 有**）与 `showcase.sign`；`skin.json` 条目 `building.*.sign`（默认 `brand: 门店`）/ `showcase.sign`（默认 `brand: 太平温泉`）——文本按格由 `proc('sign', { brand })` 覆盖。
- **幌子 banner**：`prop.banner` / `showcase.banner`；`skin.json` 条目 `prop.banner`（默认 `text: 市集`）/ `showcase.banner`（默认 `text: 温泉`），文本取 `SLOT_BANNER`。
- **灯笼字**：`prop.lantern` / `showcase.lantern`，字取 `SLOT_LANTERN_CHAR`。
- **楼体 shop**：`building.s*.l{1,2,3}` / `showcase.shop`，`brand` 取 `TILE_BRAND`、`hue` 取 `OWNER_HUE[owner]`。

### 4.4 重建 + 部署 + 线上回归

```powershell
# 本地构建 → tar 整包 → scp → 服务器仅解压（绝不在服务器构建）
node d:\zhao\scripts\deploy-mono.mjs

# 线上回归（打真实 URL；gate 全 true、exit 0）
node local/mono-prod-check.mjs
```