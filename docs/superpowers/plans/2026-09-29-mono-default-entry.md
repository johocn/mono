# 大富翁 · 默认入口即交互局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让线上裸链接 `mono.html` 进站即进入交互局（玩家资产条 / 手牌 / 骰子齐备），把「演示棋盘」改为显式入口 `?demo=1`。

**Architecture:** 只翻转 `parseOptions()` 中 `play` 的默认值（`?demo=1` 或 `?play=0` 关掉），HUD / 中部橱窗 / 分享 CTA 全部复用既有 play 分支，渲染层零改动。同时把 6 个依赖「无参数=演示」的脚本改为显式 `?demo=1`，并给线上回归补上「裸入口」用例——这正是本次漏掉的看守。

**Tech Stack:** TypeScript + Vite 6 + PixiJS 8 + Vitest 2；Playwright（390×844 @dpr2）闸门脚本；Node 22（脚本用内置 `fetch`）。

**依据 spec:** `docs/superpowers/specs/2026-09-29-mono-default-entry-design.md`

**工作目录约定：** 下述相对路径均相对 `d:\zhao\monopoly`（=`ROOT`）；涉及根仓库的命令显式用 `d:\zhao`。

---

## 文件结构（改动面）

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/main.ts` | URL 参数解析（唯一真源） | 改 1 行默认值 |
| `test/smoke.spec.ts` | `parseOptions` 单测 | 改 3 处期望 + 新增 demo 例 |
| `tools/gen-share-card.mjs` | 分享缩略图（必须纯棋盘） | URL 加 `demo=1` |
| `local/mono-shots-m1.mjs` / `m2.mjs` / `m3.mjs` | M1–M3 截图闸门 | URL 加 `demo=1` |
| `local/mono-shots-real-shops.mjs` / `mono-shots-shops.mjs` | 商家数据/配置截图闸门 | URL 加 `demo=1` |
| `local/mono-prod-check.mjs` | 线上回归（**补第 0 条：裸入口**） | 新增用例 + 截图 |
| `docs/manual-mono.md` | 操作手册 | URL 口径 + 验收行 |
| `local/_diag-noplay.mjs` + `docs/verify/_diag-online-*.png` | 本次诊断临时物 | 删除 |

不改：`src/render/**`、`src/skin/**`、`src/ui/**`、`skins/**`、经济数值、`skin.json`。

---

## Task 1: `parseOptions` 默认 play=true（TDD）

**Files:**
- Modify: `src/main.ts:49-65`
- Test: `test/smoke.spec.ts:10-31`

- [ ] **Step 1: 改测试为期望新行为（先失败）**

把 `test/smoke.spec.ts` 第 10–31 行的整个 `describe('parseOptions', ...)` 替换为：

```ts
describe('parseOptions', () => {
  it('缺省：进站即交互局（play=true）；skin=default, debug=false, seed=1, speed=1, show=b, nofx=false, perf=false', () => {
    expect(parseOptions('')).toEqual({
      skin: 'default', debug: false, seed: 1, speed: 1, show: 'b', play: true, nofx: false, perf: false,
    });
  });
  it('解析 ?skin ?debug ?seed ?speed（play 仍默认 true）', () => {
    expect(parseOptions('?skin=photo&debug=1&seed=7&speed=4'))
      .toEqual({ skin: 'photo', debug: true, seed: 7, speed: 4, show: 'b', play: true, nofx: false, perf: false });
  });
  it('解析 ?show=0|c', () => {
    expect(parseOptions('?show=0').show).toBe('0');
    expect(parseOptions('?show=c').show).toBe('c');
  });
  it('解析 ?play / ?demo（M4 交互局）', () => {
    expect(parseOptions('?debug=1&play=1&seed=20260928').play).toBe(true);
    expect(parseOptions('?play=0').play).toBe(false);
    expect(parseOptions('?demo=1').play).toBe(false);
    expect(parseOptions('?demo=1&play=1').play).toBe(false); // demo 优先于 play
  });
  it('非法数字回落到缺省', () => {
    expect(parseOptions('?seed=abc&speed=-2').seed).toBe(1);
    expect(parseOptions('?speed=-2').speed).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（`cwd=d:\zhao\monopoly`）: `npx vitest run test/smoke.spec.ts`
Expected: FAIL — 3 个用例报 `expected false to be true` / 对象 `play: false` 与 `play: true` 不符。

- [ ] **Step 3: 改实现（唯一一行逻辑）**

在 `src/main.ts` 的 `parseOptions` 中，把第 61 行 `play: q.get('play') === '1',` 替换为：

```ts
    /* 默认即交互局（design §3.1）：裸链接 = 进站即玩；`?demo=1` 或 `?play=0` 回演示棋盘 */
    play: q.get('demo') !== '1' && q.get('play') !== '0',
```

并在同文件第 34–40 行的 `UrlOptions` 接口内、`play: boolean;` 上方插入一行注释（仅注释，字段不变，避免扩散）：

```ts
  /** 默认 true（进站即交互局）；`?demo=1` / `?play=0` 为显式反义，不单独暴露字段 */
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/smoke.spec.ts test/ui/hud-fx.spec.ts`
Expected: PASS（两个文件全绿；`hud-fx.spec.ts:56-58` 的 `?play=1&nofx=1` / `?play=1` / `?nofx=0` 断言不受影响）。

- [ ] **Step 5: 提交**

```bash
git -C d:\zhao add monopoly/src/main.ts monopoly/test/smoke.spec.ts
git -C d:\zhao commit -m "feat(mono): 默认入口即交互局（play 默认 true，新增 ?demo=1 回演示棋盘）"
```

---

## Task 2: 脚本口径搬迁（6 个依赖「无参数=演示」的脚本）

**Files:**
- Modify: `tools/gen-share-card.mjs:37`
- Modify: `local/mono-shots-m1.mjs:4`、`local/mono-shots-m2.mjs:4`、`local/mono-shots-m3.mjs:38,59`
- Modify: `local/mono-shots-real-shops.mjs:24,35`、`local/mono-shots-shops.mjs:49,53,57,66`

- [ ] **Step 1: 分享卡（最关键，必须保持纯棋盘）**

`tools/gen-share-card.mjs:37`：

```js
  await game.goto(`${ORIGIN}/mono.html?demo=1&nofx=1&seed=20260928`, { waitUntil: 'networkidle' });
```

- [ ] **Step 2: M1 / M2 截图闸门**

`local/mono-shots-m1.mjs:4`：

```js
const URL = process.env.MONO_URL || 'http://127.0.0.1:52300/mono.html?demo=1&debug=1';
```

`local/mono-shots-m2.mjs:4`：

```js
const BASE = process.env.MONO_URL || 'http://127.0.0.1:52300/mono.html?demo=1&debug=1';
```

- [ ] **Step 3: M3 截图闸门（两处）**

`local/mono-shots-m3.mjs:38`：

```js
  const page = await open(`${ORIGIN}/mono.html?demo=1&debug=1&show=${show}`);
```

`local/mono-shots-m3.mjs:59`：

```js
  const page = await open(`${ORIGIN}/mono.html?demo=1&debug=1&skin=photo&show=${show}`);
```

- [ ] **Step 4: 商家数据闸门**

`local/mono-shots-real-shops.mjs:24`：

```js
await open('?demo=1&show=0');
```

`local/mono-shots-real-shops.mjs:35`：

```js
await open('?demo=1&show=b');
```

- [ ] **Step 5: 商家配置闸门（三处，注意第 49 与 66 行字符串相同）**

`local/mono-shots-shops.mjs:53`：

```js
await open('?demo=1&show=b');
```

`local/mono-shots-shops.mjs:57`：

```js
await open('?demo=1&show=0&skin=photo');
```

`local/mono-shots-shops.mjs:49` 与 `:66`（两处 `await open('?show=0');`，用 `replace_all` 一次替换）：

```js
await open('?demo=1&show=0');
```

- [ ] **Step 6: 起 dev 服务器**

Run（`cwd=d:\zhao\monopoly`，后台）: `npm run dev`
Expected: `http://127.0.0.1:52300/mono.html` 可访问（端口 52300）。

- [ ] **Step 7: 重跑 5 个闸门，确认与改前逐张等价**

```bash
node local/mono-shots-m1.mjs
node local/mono-shots-m2.mjs
node local/mono-shots-m3.mjs
node local/mono-shots-real-shops.mjs
node local/mono-shots-shops.mjs
```

Expected: 五个脚本各自 `gate` 全 `true`、`errors` 为空、退出码 0；截图落 `docs/verify/` 且**内容与改前一致**（证明是纯口径搬迁）。任一门失败即回查该脚本 URL。

- [ ] **Step 8: 生成分享缩略图，用字节数证明「棋盘区域未被 HUD 污染」**

dev 服务器仍在运行（Step 6）：

```bash
node tools/gen-share-card.mjs
```

Expected: 退出码 0；写出 `public/share/share-card.png`，**800×640、字节数 274903**（与 `docs/manual-mono.md:184` 记录的改前值完全一致——棋盘区域逐像素不变即证明 `demo=1` 生效、HUD 未进画；若字节数变大到 >274903，说明 URL 的 `demo=1` 没生效，回查 Step 1）。

- [ ] **Step 9: 提交**

```bash
git -C d:\zhao add monopoly/tools/gen-share-card.mjs monopoly/local/mono-shots-m1.mjs monopoly/local/mono-shots-m2.mjs monopoly/local/mono-shots-m3.mjs monopoly/local/mono-shots-real-shops.mjs monopoly/local/mono-shots-shops.mjs
git -C d:\zhao commit -m "test(mono): 依赖演示画面的脚本改为显式 ?demo=1（默认翻转后口径搬迁）"
```

---

## Task 3: 线上回归补「裸入口」用例（补上盲点）

**Files:**
- Modify: `local/mono-prod-check.mjs`（文件头注释 4–18 行；断言段紧跟第 31 行后新增；`facts.screenshots` 97–101 行）

- [ ] **Step 1: 新增裸入口探针（插在 `const browser = await chromium.launch();` 之后、现有 `attach` 之后）**

在 `local/mono-prod-check.mjs` 中 `attach` 定义（第 34–37 行）之后插入：

```js
/* 0) 裸入口（无参数）= 默认即交互局：HUD 必须齐备（本次回归盲点的看守） */
const entryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(entryPage);
await entryPage.goto(`${ORIGIN}/mono.html`, { waitUntil: 'networkidle' });
await entryPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

facts.defaultEntry = await entryPage.evaluate(() => {
  const m = window.__monoMain;
  const hud = document.querySelector('#mono-hud');
  const ids = m.scene.instancesOf().map((i) => i.id);
  const r = hud ? hud.getBoundingClientRect() : null;
  return {
    hasGame: Boolean(m.game),
    hasHud: Boolean(hud),
    hudW: r ? Math.round(r.width) : 0,
    hudH: r ? Math.round(r.height) : 0,
    tile: ids.filter((id) => id.startsWith('board.tile.')).length,
    playerBar: ids.filter((id) => id === 'ui.playerBar').length,
    diceBody: ids.filter((id) => id === 'dice.body').length,
    handSlot: ids.filter((id) => id === 'ui.handSlot').length,
  };
});
gate.defaultEntry =
  facts.defaultEntry.hasGame &&
  facts.defaultEntry.hasHud &&
  facts.defaultEntry.hudW === 390 &&
  facts.defaultEntry.hudH === 844 &&
  facts.defaultEntry.tile === 32 &&
  facts.defaultEntry.playerBar === 4 &&
  facts.defaultEntry.diceBody === 2 &&
  facts.defaultEntry.handSlot === 5;

await entryPage.screenshot({ path: `${OUT}/mono-prod-00-default.png` });
await entryPage.close();
```

- [ ] **Step 2: 更新文件头断言清单**

`local/mono-prod-check.mjs:9-15` 的注释块在 `1 GET ...` 之后插入一行（其余条目顺延不改语义）：

```js
 *   0 裸入口（无参数）→ 默认即交互局：#mono-hud 存在 390×844、game 就绪、计数 32/4/2/5
```

并把第 14 行截图说明改为：

```js
 *   6 四张 390×844 @dpr2 截图入库 docs/verify/mono-prod-0{0,1,2,3}-*.png
```

- [ ] **Step 3: 截图清单加第 0 张**

`local/mono-prod-check.mjs:97-101` 的 `facts.screenshots` 数组改为：

```js
facts.screenshots = [
  `${OUT}/mono-prod-00-default.png`,
  `${OUT}/mono-prod-01-board.png`,
  `${OUT}/mono-prod-02-play.png`,
  `${OUT}/mono-prod-03-skin-photo.png`,
];
```

- [ ] **Step 4: 本地预演（打 dev 服务器，先确认新用例逻辑成立）**

Run（`cwd=d:\zhao\monopoly`）: `$env:MONO_ORIGIN='http://127.0.0.1:52300'; node local/mono-prod-check.mjs`
Expected: `gate.defaultEntry` 为 `true`，`errors` 为空，退出码 0（`?skin=photo` 一项在 dev 下同样可过）。

- [ ] **Step 5: 提交**

```bash
git -C d:\zhao add monopoly/local/mono-prod-check.mjs
git -C d:\zhao commit -m "test(mono): 线上回归补裸入口用例（默认即交互局 gate + 截图）"
```

---

## Task 4: 手册同步

**Files:**
- Modify: `docs/manual-mono.md:14`（URL 参数行）、M7 表（第 132 行附近）、文末验收清单

- [ ] **Step 1: 更新 URL 参数行**

`docs/manual-mono.md:14` 改为：

```markdown
URL 参数：`?skin=<id>`（切皮肤）· `?debug=1`（显示元素 ID/包围盒/depth/provider 回退级别）· `?seed=<n>` · `?speed=<n>`（动画时轴倍率）· **默认即交互局**（裸链接进站即玩）· `?demo=1`（演示棋盘，= 旧裸入口行为）· `?play=1`（等价默认；`?play=0` 同 `?demo=1`）· `?nofx=1`（等价 `speed=999`，动画瞬间到终帧）· `?perf=1`（性能覆盖层 + 帧间隔采样）。
```

- [ ] **Step 2: M7 增第 0 条验收行**

在 `docs/manual-mono.md` 的 M7 表格中、现有 M7-1 之前插入：

```markdown
| M7-0 | 手机打开 `https://game.joho.cn/tour/mono.html`（**无参数**） | 进站即交互局：底部资产条 4 条 + 手牌 5 槽 + 两枚骰面齐备，`#mono-hud` 满屏 390×844，无控制台错误 | `mono-prod-00-default.png` |
```

- [ ] **Step 3: 补「默认入口」说明段**

在 M4 段落的「**M4 结论**」之前插入一段：

```markdown
**默认入口（2026-09-29 起）**：裸链接 `mono.html` 即交互局，HUD（资产条/手牌/骰子）首屏齐备；演示棋盘与 B/C 版式改由 `?demo=1&show=b|c` 进入（play 分支不经过 `demoView`，故橱窗版式必须显式加 `demo=1`）。此前裸入口为演示棋盘，曾导致「主页面没有玩家信息 / 没道具 / 看不见骰子」的误判，根因与修复见 `docs/superpowers/specs/2026-09-29-mono-default-entry-design.md`。
```

- [ ] **Step 4: 提交**

```bash
git -C d:\zhao add monopoly/docs/manual-mono.md
git -C d:\zhao commit -m "docs(mono): 手册同步默认入口即交互局（?demo=1 口径 + M7-0 验收）"
```

---

## Task 5: 全量回归 → 构建 → 部署 → 线上回归

- [ ] **Step 1: 全量校验**

Run（`cwd=d:\zhao\monopoly`）: `npm run check`
Expected: lint 0 错；`[skin:default] OK` / `[skin:photo] OK`；vitest 全绿（45 文件 / **365 例**——`parseOptions` 仍是 5 个 it，例数不变）。

- [ ] **Step 2: 删掉本次诊断临时物**

```bash
git -C d:\zhao rm --cached monopoly/local/_diag-noplay.mjs
```

删除文件 `d:\zhao\monopoly\local\_diag-noplay.mjs`、`d:\zhao\monopoly\docs\verify\_diag-online-noplay.png`、`d:\zhao\monopoly\docs\verify\_diag-online-play.png`（若未被 git 跟踪则直接删文件即可）。

- [ ] **Step 3: 本地构建 + 部署（服务器只解压，绝不在服务器构建）**

Run（`cwd=d:\zhao`）: `node d:\zhao\scripts\deploy-mono.mjs`
Expected: 七步全过 —— `release/js/mono.js` 生成、tar 整包、scp 到 `odoo`、服务器解压到 `/opt/1panel/apps/openresty/openresty/www/sites/game.joho.cn/tour`、备份 `tour.bak-<ts>`；三项校验：`mono.html` 200 / `js/mono.js` 线上字节数 == 本地 / `skins/photo/skin.json` 200。

- [ ] **Step 4: 线上回归（含新裸入口 gate）**

Run（`cwd=d:\zhao\monopoly`）: `node local/mono-prod-check.mjs`
Expected: 退出码 0；`gate` 全 `true`（含新增 `defaultEntry`）；`facts.defaultEntry.playerBar=4 / diceBody=2 / handSlot=5 / tile=32 / hudW=390 / hudH=844`；`errors=[]`；四张截图入库。

- [ ] **Step 5: 人工复核裸入口截图**

打开 `docs/verify/mono-prod-00-default.png`（390×844@dpr2），确认底部可见 4 条资产条 + 5 槽手牌 + 两枚骰面，且未遮挡棋盘与中部橱窗。

- [ ] **Step 6: 提交部署留档**

```bash
git -C d:\zhao add monopoly/docs/verify monopoly/docs/manual-mono.md
git -C d:\zhao commit -m "chore(mono): 部署默认入口即交互局 + 线上回归（含裸入口 gate）"
```

- [ ] **Step 7: 停止 dev 服务器，并明确不推送**

停掉 Step Task2-6 起的后台 `npm run dev`；向用户报告结果并说明**未推送**（用户已指示「先不推送」；根仓库无远端）。

---

## 完成标准（对照 spec §4）

1. 裸入口 `mono.html`：`#mono-hud` 存在且 390×844，资产条 4 / 骰面 2 / 手牌 5，无控制台错误 → Task 3 Step 4 + Task 5 Step 4。
2. `?demo=1`：与改前裸入口一致（纯棋盘 + 中部橱窗，无 HUD）→ Task 1 单测 + Task 2 Step 7。
3. `?demo=1&show=b|c` 正常 → Task 2 Step 7（m3 / real-shops / shops 闸门）。
4. `?play=1` 与默认等价 → Task 1 单测。
5. `gen-share-card` 缩略图不含 HUD → Task 2 Step 1（URL 加 `demo=1`）。
6. `npm run check` 全绿 + `check:prod` 退出码 0 → Task 5 Step 1/4。
7. 390×844@dpr2 截图入库（`mono-prod-00-default.png` 等）→ Task 5 Step 4。
8. 各截图闸门补 `demo=1` 后与改前逐张等价 → Task 2 Step 7。