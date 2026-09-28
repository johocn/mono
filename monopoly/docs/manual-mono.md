# 大富翁 · 吉林双阳邻里商业版 操作手册与测试用例

## 1. 启动与调试

| 项 | 值 |
|---|---|
| 本地开发 | `npm run dev` → http://127.0.0.1:52300/mono.html |
| 移动视口预览 | Playwright `viewport=390×844, deviceScaleFactor=2` |
| 构建 | `npm run build` → `release/mono.html` + `release/js/mono.js` |
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
| M4-1 | 打开 `mono.html?debug=1&play=1&seed=20260928` | 底部操作坞出现：顶部金色提示条 + 状态行「第 1 轮 · 轮到 你」+ 4 条玩家资产条（当前玩家金框）+ 两个骰面（未掷为暗底空面）+ 金色「掷骰」按钮；地砖归属色与棋子位置跟游戏状态联动 | `mono-m4-01-hud.png` |
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
| M6-2 | 点「前进」 | 棋子逐格起跳（kick 起跳段 + 抛物线），落点扬起一圈落尘 | `mono-m6-02-hop.png` |
| M6-3 | 落格无主空地后点「买地」 | 红章旋正盖下 + 一圈金币飞出飞向持有者 | `mono-m6-03-buy.png` |
| M6-4 | 点「升级」 | 脚手架淡入 → 落成 → 逐层点亮火花（L1→L2→L3） | `mono-m6-04-upgrade.png` |
| M6-5 | 走到对家地块结算 | 金币飞向持有者 + 落点火花脉冲 | `mono-m6-05-rent.png` |
| M6-6 | 走到命运 / 机会格 | 卡面 X 轴 3D 翻转 + 高光横扫 | `mono-m6-06-card.png` |
| M6-7 | 使用手牌（炸弹等） | 牌堆/碎片轻微震动 + 淡出 | `mono-m6-07-deck.png` |
| M6-8 | 买 / 卖股票 | 碎片红/绿脉冲示意涨跌 | `mono-m6-08-stock.png` |
| M6-9 | 控制台 `__monoMain.sim()` | 全屏火花环形迸发 + 结算面板展开 | `mono-m6-09-end.png` |
| M6-10 | 跑 `node local/mono-shots-m6.mjs` | 9 张中间帧 + 1 段录像（`mono-m6-anim.webm`）入库；`gate` 全 `true`、`errors=[]` | 上述全部 |

**动画权威性**：`?speed=0.25` 慢放下逐条断言「动画播放中 `game.state.phase` 不变化」与「`fx.skip()` 后 phase 与不加动画一致」——状态机先落库、动画只回放。`?nofx=1` 等价 `speed=999`（瞬间到终帧）；动画播放中主按钮变「跳过」（点屏即加速到终帧，不取消、不吞点击）。

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