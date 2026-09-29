# 大富翁 · 默认入口即交互局 设计文档

- 日期：2026-09-29
- 范围：`monopoly` 工程 · 线上默认入口（裸链接）缺失 HUD 的修复
- 关联：`docs/superpowers/specs/2026-09-29-monopoly-shuangyang-business-loop-design.md` §7.1（阶段一）；线上 URL `https://game.joho.cn/tour/mono.html`

## 1. 背景与问题

线上主页面（`mono.html`，无参数）打开后：只有等距棋盘 + 中部橱窗，**没有玩家资产条、没有手牌、看不见骰子**。经线上实测对照（2026-09-29，Playwright 390×844@dpr2）：

| URL | `#mono-hud` | 资产条 | 骰面 | 手牌槽 | 控制台报错 |
|---|---|---|---|---|---|
| `mono.html`（裸入口） | 不存在 | 0 | 0 | 0 | 无 |
| `mono.html?play=1` | 存在 390×844 | 4 | 2 | 5 | 无 |

**根因**（非部署缺文件）：`src/main.ts` 中 `const game = opts.play ? createGame(...) : null`——**默认入口即「演示模式」**，HUD 仅由 play 分支（`mountHud`）挂载。这不是缺文件，是缺入口。

**连带盲点**：线上回归脚本（`local/mono-prod-check.mjs`）三条用例全部带 `?play=1`，**从未覆盖裸入口**，故「本地绿、裸入口没人看守」。

## 2. 方案选择（用户已批准：默认即交互局）

| 方案 | 描述 | 结论 |
|---|---|---|
| A 默认即交互局（**采纳**） | 裸链接 = 进站即游戏（等同现 `?play=1`）；演示棋盘改由 `?demo=1` 进入 | 最少改动、最少惊喜 |
| B 演示棋盘 + 开局 CTA | 首屏补「开局」按钮，点入交互局 | 玩家多走一步 |
| C 演示页常驻只读 HUD | 无参页也画只读资产条/手牌/骰子 | 改动最大、收益最小，不推荐 |

## 3. 设计

### 3.1 URL 口径（唯一行为变化发生在裸链接）

| URL | 改前 | 改后 |
|---|---|---|
| `mono.html` | 演示棋盘（无 HUD） | **交互局**（资产条/手牌/骰子齐备） |
| `mono.html?demo=1` | — | 演示棋盘（= 改前裸入口） |
| `mono.html?play=1` | 交互局 | 交互局（等价默认，老链接不变） |
| `mono.html?show=b\|c` | 独立橱窗/对照 | **须配 `?demo=1&show=b`**（play 分支不经过 `demoView`，既有结构不动） |

其余开关（`skin`/`debug`/`seed`/`speed`/`nofx`/`perf`）一律不动。

### 3.2 实现要点

- 仅改 `src/main.ts` 中 `play` 参数默认值：`play` 默认 `true`；`?demo=1` 或 `?play=0` 关掉。
- HUD、中部橱窗（版式 A 复用）、分享 CTA 全部走既有 play 分支，**已在线上验证过**。
- 渲染层、注册表、`skin.json`、经济数值**零改动**。

### 3.3 连带修正（否则闸门与分享图被污染）

下列脚本当前依赖「无参数 = 演示」，默认翻转后必须显式加 `?demo=1`：

- `tools/gen-share-card.mjs` —— 分享缩略图**必须保持纯棋盘**（否则卡片带 HUD）
- `local/mono-shots-m1.mjs` / `m2.mjs` / `m3.mjs` / `mono-shots-real-shops.mjs` / `mono-shots-shops.mjs`

不受影响（已显式 `play=1`）：`local/mono-prod-check.mjs`、`local/mono-shots-m4/m5/m6.mjs`、`local/mono-share-check.mjs`、`local/mono-e2e-playthrough.mjs`、`local/mono-perf.mjs`、`perf:android`。

### 3.4 补回归盲点

`local/mono-prod-check.mjs` 新增**第 0 条用例：裸入口**（无参数）——断言 `game` 就绪、`#mono-hud` 存在、`playerBar=4 / diceBody=2 / handSlot=5 / tile=32`、无报错，出图 `mono-prod-00-default.png` 纳入 gate。

### 3.5 代价（已量化）

- 首屏元素 203 → 219，多 16 件全在 pass 4（HUD）；**场景 pass 1–3 仍为 189**，spec §11.5「<200」预算口径不变。
- 首屏多一次 `createGame`；整局 `sim()` 墙钟 38–155ms，玩法逻辑非瓶颈。

## 4. 验收

1. 裸入口 `mono.html`：`#mono-hud` 存在且 390×844 全尺寸，资产条 4 / 骰面 2 / 手牌 5，无控制台错误。
2. `?demo=1`：与改前裸入口一致（纯棋盘 + 中部橱窗，无 HUD）。
3. `?demo=1&show=b` / `?demo=1&show=c`：橱窗 B / 对照 C 正常。
4. `?play=1`：与默认等价，老链接行为不变。
5. `tools/gen-share-card.mjs`：分享缩略图**不含 HUD**（纯棋盘）。
6. `npm run check` 全绿；`npm run check:prod`（含新第 0 条用例）退出码 0、gate 全 true。
7. 手机视口 390×844@dpr2 截图入库：`mono-prod-00-default.png`（裸入口）等。
8. 补 `?demo=1` 后重跑各截图闸门（`mono-shots-m1/m2/m3`、`mono-shots-real-shops`、`mono-shots-shops`），gate 全 `true`，且截图与改前**逐张等价**（证明「默认翻转 + 显式 demo」是纯口径搬迁、无副作用）。

## 5. 部署与交付

- 按用户硬规范「一气呵成」：实现 → `npm run check` → 本地构建 → `node d:\zhao\scripts\deploy-mono.mjs`（服务器仅解压）→ `node local/mono-prod-check.mjs` 退出码 0 → 手机截图补入 `docs/manual-mono.md` → 提交。
- **推送**：用户已明确「先不推送」（根仓库无远端）；推送另行授权。
