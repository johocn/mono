# 大富翁画面重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `d:\zhao\monopoly` 的画面从「青色霓虹」纠正为「双阳鹿乡邻里」暖调，交付「5 套配色 + 可逐元素指派 + 单素材独立风格」的装配体系，素材扩到建筑 6 / 道具 16 / 环境 7，店名浮上楼顶并放大 +61%，棋子换成 Q 版小朋友（两男两女），停留事件用头顶气泡显性呈现。

**Architecture:** 全部在**数据层**做文章——新增 `public/config/theme.json`（配色方案 + 元素绑定 + paletteBySlot 分区轮转），由纯函数 `src/skin/theme.ts` 编译成 `Record<elementId, ProviderSpec>`，喂给既有 `instantiate()` 的 `deps.overrides`（[instantiate.ts L84](file:///d:/zhao/monopoly/src/skin/instantiate.ts#L84) 合并 → [resolve.ts L73-93](file:///d:/zhao/monopoly/src/skin/resolve.ts#L73-L93) 四级回退 L1 命中）。**零新增渲染通路**，`src/core/**` 一行不改。

**Tech Stack:** TypeScript + Pixi.js v8（`Graphics.poly/ellipse/roundRect/circle`，链式 `.fill()/.stroke()`）+ vitest + esbuild（`tools/gen-registry-ids.mjs` 打包 registry 求值）+ Playwright（`local/mono-e2e-playthrough.mjs` / `mono-prod-check.mjs`）。

**Spec:** [2026-09-30-monopoly-visual-redesign-design.md](file:///d:/zhao/docs/superpowers/specs/2026-09-30-monopoly-visual-redesign-design.md)（本文所有几何/色值/字号口径以 spec 为准；两者冲突时按本文的「实测校正」执行）

**Patched to A（用户已拍板）：** 棋子 = **Q 版邻里小朋友**（休闲装，两男两女）；角色名沿用 P1 小满 / P2 阿桃 / P3 石头 / P4 雪见。

---

## 实测校正（写计划时核对代码得出，与 spec 旧稿不同，一律以本节为准）

| # | spec 旧稿 | 实测真相 | 出处 |
|---|---|---|---|
| C1 | `public/registry-ids.json` | 实际生成到 **`tools/registry-ids.json`** | [gen-registry-ids.mjs L11](file:///d:/zhao/monopoly/tools/gen-registry-ids.mjs#L11) |
| C2 | `ui.playerBar` 需新增 | **已存在**（box `86×40`） | [registry.ts L141](file:///d:/zhao/monopoly/src/skin/registry.ts#L141) |
| C3 | `state.lastEvent` 需新增 | **已存在**，`GameState` 字段 + 多处赋值 | [game.ts L94-132](file:///d:/zhao/monopoly/src/core/game.ts#L94-L132)、[L283-318](file:///d:/zhao/monopoly/src/core/game.ts#L283-L318) |
| C4 | 底坞按钮 `Y = 606+148` | 实际 `BOTTOM_BTN_Y = 738`、`HUD_BTN_H = 46`、`HUD_BTN_SECONDARY_W = 110`、`HUD_BTN_UPGRADE_X = 249`、`HUD_BTN_PRIMARY_X = 146 / W = 98` | [layout.ts L9/L26-L31](file:///d:/zhao/monopoly/src/skin/layout.ts#L9-L31) |
| C5 | 「1 条 4 段资产条」需新 id | **不加 id**：把 `HUD_BAR_W 86→94.5`、`HUD_BAR_GAP 11→0` ⇒ 4 段无缝拼成 1 条（6..384） | [layout.ts L17-L21](file:///d:/zhao/monopoly/src/skin/layout.ts#L17-L21)、[Hud.ts L102](file:///d:/zhao/monopoly/src/ui/Hud.ts#L102) |
| C6 | 新增 id 共 16 | **实际 +17** = 8 道具 + 7 环境 + 1 `ui.bubble` + 1 `ui.tileCard` | [registry.ts L184-192](file:///d:/zhao/monopoly/src/skin/registry.ts#L184-L192) |
| C7 | HUD 改造可能连带教程失效 | `HUD_BAR_*` 被 [tutorial.ts](file:///d:/zhao/monopoly/src/data/tutorial.ts) 引用做高亮框 ⇒ **改 layout 常量即自动跟随，勿改 tutorial.ts** | [tutorial.ts L3-L6/L45/L53](file:///d:/zhao/monopoly/src/data/tutorial.ts#L3-L53) |

---

## File Structure

**新建（6 个）**

| 文件 | 职责 |
|---|---|
| `public/config/theme.json` | 权威配置：5 套 palette + bindings（match/preset/palette/paletteBySlot/params） |
| `src/skin/theme.ts` | 纯函数：glob 匹配 + `compileTheme()` + `parseTheme()`（坏数据静默跳过） |
| `src/render/AtmosphereView.ts` | 环境层 7 元素（pass 0，静态不重绘） |
| `src/render/providers/proc-bubble.ts` | 头顶事件气泡 preset（4 态参数化） |
| `src/ui/themeConsole.ts` | `?debug=1` 风格控制台（逐栋选色 / 批量 / 单素材微调 / 导出 JSON） |
| `local/mono-shots-visual.mjs` | 手机视口截图 390×844 @dpr2，产出 9 张到 `docs/verify/` |

**新建测试（3 个）**：`test/skin/theme.spec.ts`、`test/render/label.spec.ts`、`test/render/pawn.spec.ts`

**修改（渲染侧）**：`proc-building.ts`（+5 原型，删 neon）、`proc-props.ts`（+8）、`proc-base.ts`（+7 环境）、`proc-pawn.ts`（**重写**）、`proc-panel.ts`（+地块卡）、`BuildingView.ts`（**解除写死**）、`LabelView.ts`、`paint.ts`

**修改（皮肤/布局）**：`registry.ts`（+17 id、棋子 box 改 `12×6×20`）、`layout.ts`、`skinLoader.ts`、`types.ts`、`instantiate.ts`（如需透传）、`public/skins/default/skin.json`、`public/skins/photo/skin.json`

**修改（UI/入口）**：`Hud.ts`、`panels.ts`、`main.ts`

**修改（工具/文档）**：`tools/lint-skin.mjs`、`local/mono-prod-check.mjs`、`local/mono-e2e-playthrough.mjs`、`docs/manual-mono.md`

**零改动**：`src/core/**`、`src/data/**`（含 tutorial.ts）、`fx.ts`、全部 `FX_*` 时长。

---

## Task 0: 基线与病根（必须先做，否则后面全是白干）

**Files:**
- Modify: `src/render/BuildingView.ts:37-127`
- 记录产物: `docs/verify/mono-baseline-before-*.png`（改前样张）

- [ ] **Step 1: 记录改前样张（A/B 对比用）**

```powershell
cd d:\zhao\monopoly
npm run dev            # 后台起，端口看输出
# 另开：用 Playwright 或手工截 3 张，存 docs/verify/
#   http://localhost:<port>/?play=1        → mono-baseline-before-play.png
#   http://localhost:<port>/?demo=1        → mono-baseline-before-demo.png
#   http://localhost:<port>/?play=1&debug=1 → mono-baseline-before-debug.png
```

- [ ] **Step 2: 跑四项基线并记下数字（必须全绿才能动手）**

```powershell
npm run check          # 期望：51 文件 / 435 例全绿
npx tsc --noEmit       # 期望：退出码 0
npm run check:prod     # 期望：退出码 0
npm run e2e:play       # 期望：973 次点击整局通过
```
若任一失败 → 停，先修既有问题，不要往下做。

- [ ] **Step 3: 解除 `BuildingView` 写死（spec §1.1 病根）**

把 `buildingSpecs()` 里的

```ts
overrides: only(wallId, proc('shop', { levels: lv, hue, brand }))
```

改为**只传状态、不指定 preset/色值**：

```ts
overrides: {}
```
并从 `ElementSpec.state` 传 `{ level: lv, owner: hueOwner, brand }`（`hue` 与 `OWNER_HUE` 的取用一并从楼体规格中移除；`hueOf()` 若在其他地方仍被使用则保留函数、只解除它对本条的注入）。

- [ ] **Step 4: 验证解除后仍能跑通（外观会变回 default 皮肤的楼体，属预期）**

```powershell
npm run check          # 期望：全绿（若有 spec 快照断言楼体 overrides，同步更新为「不再含 hue 键」）
npm run e2e:play       # 期望：通过
```

- [ ] **Step 5: 加一条防回归测试**

在既有 skin 测试目录新增断言：`BuildingView` 产物中**任何 building spec 的 overrides 都不含 `hue` 键**（对应 spec V5）。

- [ ] **Step 6: Commit**

```bash
git add monopoly/src/render/BuildingView.ts monopoly/test
git commit -m "fix(mono): 解除 BuildingView 对楼体 preset 与归属色相的写死，配色改由数据层装配"
```

---

## Task 1: 主题装配（theme.json + theme.ts）

**Files:**
- Create: `public/config/theme.json`, `src/skin/theme.ts`, `test/skin/theme.spec.ts`
- Modify: `src/main.ts`（装配 overrides）、`tools/lint-skin.mjs`（校验）

- [ ] **Step 1: 写失败测试**

```ts
// test/skin/theme.spec.ts
import { describe, it, expect } from 'vitest';
import { parseTheme, compileTheme, globMatch } from '../../src/skin/theme';

const IDS = ['building.s4.l2', 'building.s5.l2', 'prop.signTower', 'board.tile.chance'];

describe('theme 装配', () => {
  it('glob 精确段通配', () => {
    expect(globMatch('building.*.l2', 'building.s4.l2')).toBe(true);
    expect(globMatch('building.*.l2', 'building.s4.l3')).toBe(false);
    expect(globMatch('prop.*', 'prop.signTower')).toBe(true);
  });

  it('compileTheme 展开 palette 8 色键 + binding.params 最后展开（单素材独立风格压过 palette）', () => {
    const th = parseTheme({
      palettes: { S1: { wallL: '#cdb78f', glow: '#ffd9a0' } },
      bindings: [
        { match: 'prop.*', preset: 'signTower', palette: 'S1', params: { glow: '#ff0000' } },
      ],
    });
    const out = compileTheme(th, IDS);
    expect(out['prop.signTower'].kind).toBe('proc');
    expect(out['prop.signTower'].preset).toBe('signTower');
    expect(out['prop.signTower'].params.wallL).toBe('#cdb78f');
    expect(out['prop.signTower'].params.glow).toBe('#ff0000'); // params 赢
  });

  it('坏数据静默跳过、不抛错', () => {
    const th = parseTheme({
      palettes: { S1: { wallL: '#fff' } },
      bindings: [
        { match: 42, palette: 'S1' },
        { match: 'prop.*', palette: 'NOT_EXIST' },
        { match: 'prop.*', palette: 'S1', paletteBySlot: ['short'] },
      ],
    });
    expect(() => compileTheme(th, IDS)).not.toThrow();
    expect(compileTheme(th, IDS)).toEqual({});
  });

  it('paletteBySlot 优先于 palette', () => {
    const slots = Array.from({ length: 32 }, (_, i) => i);
    const th = parseTheme({
      palettes: { A: { wallL: '#aaa' }, B: { wallL: '#bbb' } },
      bindings: [{ match: 'building.*.l2', palette: 'A', paletteBySlot: slots.map((s) => (s === 4 ? 'B' : 'A')) }],
    });
    const out = compileTheme(th, IDS);
    expect(out['building.s4.l2'].params.wallL).toBe('#bbb');
    expect(out['building.s5.l2'].params.wallL).toBe('#aaa');
  });
});
```

- [ ] **Step 2: 运行确认失败**

```powershell
npx vitest run test/skin/theme.spec.ts
```
期望：FAIL —— 找不到模块 `src/skin/theme`。

- [ ] **Step 3: 写实现**

```ts
// src/skin/theme.ts
import type { ProviderSpec } from './types';

export interface Palette { [k: string]: string }
export interface ThemeBinding {
  match: string;
  preset?: string;
  palette?: string;
  paletteBySlot?: string[];
  params?: Record<string, unknown>;
}
export interface Theme { palettes: Record<string, Palette>; bindings: ThemeBinding[] }

/** 段通配：'building.*.l2' 只匹配同段数的 id；'*' 不跨 '.' */
export function globMatch(pattern: string, id: string): boolean {
  const p = pattern.split('.');
  const s = id.split('.');
  if (p.length !== s.length) return false;
  for (let i = 0; i < p.length; i++) if (p[i] !== '*' && p[i] !== s[i]) return false;
  return true;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 坏数据一律丢弃该条，绝不抛错（沿用 parseShopConfig 口径） */
export function parseTheme(raw: unknown): Theme {
  const palettes: Record<string, Palette> = {};
  const bindings: ThemeBinding[] = [];
  if (!isRec(raw)) return { palettes, bindings };
  if (isRec(raw.palettes)) {
    for (const [k, v] of Object.entries(raw.palettes)) {
      if (!isRec(v)) continue;
      const pal: Palette = {};
      for (const [ck, cv] of Object.entries(v)) if (typeof cv === 'string') pal[ck] = cv;
      if (Object.keys(pal).length) palettes[k] = pal;
    }
  }
  if (Array.isArray(raw.bindings)) {
    for (const b of raw.bindings) {
      if (!isRec(b) || typeof b.match !== 'string') continue;
      if (b.palette !== undefined && typeof b.palette !== 'string') continue;
      if (b.preset !== undefined && typeof b.preset !== 'string') continue;
      let bySlot: string[] | undefined;
      if (Array.isArray(b.paletteBySlot)) {
        if (b.paletteBySlot.length !== 32) continue;           // 长度不符 → 整条丢弃
        bySlot = b.paletteBySlot.filter((x): x is string => typeof x === 'string');
        if (bySlot.length !== 32) continue;
      }
      bindings.push({
        match: b.match,
        preset: typeof b.preset === 'string' ? b.preset : undefined,
        palette: typeof b.palette === 'string' ? b.palette : undefined,
        paletteBySlot: bySlot,
        params: isRec(b.params) ? b.params : undefined,
      });
    }
  }
  return { palettes, bindings };
}

/** 元素 id → ProviderSpec；slot 由 id 反解（building.s{n}.* / board.tile 按序） */
export function compileTheme(theme: Theme, ids: string[]): Record<string, ProviderSpec> {
  const out: Record<string, ProviderSpec> = {};
  for (const b of theme.bindings) {
    for (const id of ids) {
      if (!globMatch(b.match, id)) continue;
      const slot = slotOf(id);
      const key = b.paletteBySlot && slot !== null ? b.paletteBySlot[slot] : b.palette;
      const pal = key ? theme.palettes[key] : undefined;
      if (b.palette || b.paletteBySlot) {
        if (!pal) continue;                                     // 引用无效 palette → 跳过该 id
      }
      out[id] = {
        kind: 'proc',
        preset: b.preset ?? (out[id]?.preset ?? ''),
        params: { ...(pal ?? {}), ...(b.params ?? {}) },        // params 最后展开 ⇒ 单素材独立风格
      };
      if (!b.preset) delete (out[id] as { preset?: string }).preset; // 不指定 preset → 交 skin 解析
    }
  }
  return out;
}

/** 从 id 反解地块序号：building.s{n}.* → n；board.tile.* 无序号 → null */
export function slotOf(id: string): number | null {
  const m = /^building\.s(\d+)\./.exec(id);
  return m ? Number(m[1]) : null;
}
```

- [ ] **Step 4: 运行确认通过**

```powershell
npx vitest run test/skin/theme.spec.ts
```
期望：PASS（4 例）。

- [ ] **Step 5: 写 `public/config/theme.json`（权威配置，5 套配色 + 分区轮转）**

```jsonc
{
  "_readme": "画面配色装配表。改本文件即生效，无需改渲染代码。字段说明见 docs/manual-mono.md §M13。",
  "_schema": {
    "palettes": "配色方案表：id → 8 个色键（wallL/wallR/roof/win/sign/tileFill/tileEdge/glow）",
    "bindings[].match": "元素 id 的段通配（* 匹配一段，不跨 '.'）",
    "bindings[].preset": "proc preset 名（缺省 → 沿用 skin.json / 内建）",
    "bindings[].palette": "整条 binding 统一配色",
    "bindings[].paletteBySlot": "32 长度数组，按地块序号逐格给配色；优先于 palette",
    "bindings[].params": "元素级参数，逐键压过 palette（单素材独立风格）"
  },
  "palettes": {
    "warm-market": { "wallL": "#cdb78f", "wallR": "#a8926a", "roof": "#8f4a33", "win": "#ffcf7a", "sign": "#f5c451", "tileFill": "#4a3b2a", "tileEdge": "#8a7550", "glow": "#ffd9a0" },
    "snow-deer":   { "wallL": "#dfe7ee", "wallR": "#b7c4d0", "roof": "#6f8296", "win": "#ffcf7a", "sign": "#ffd98a", "tileFill": "#8fa3b5", "tileEdge": "#c9d6e0", "glow": "#ffe6b8" },
    "papercut":    { "wallL": "#f5e6c8", "wallR": "#e0c49a", "roof": "#c0392b", "win": "#ffd23f", "sign": "#ffd23f", "tileFill": "#1f6b3a", "tileEdge": "#f5e6c8", "glow": "#ffd23f" },
    "onsen-mist":  { "wallL": "#e8e6e0", "wallR": "#c9c6bd", "roof": "#5a6360", "win": "#ffe9c0", "sign": "#8fc4b8", "tileFill": "#3a3d3a", "tileEdge": "#8a8f8b", "glow": "#ffe9c0" },
    "night-neon":  { "wallL": "#3a3140", "wallR": "#2c2532", "roof": "#ff8a3d", "win": "#ffd23f", "sign": "#ff8a3d", "tileFill": "#20262e", "tileEdge": "#ff8a3d", "glow": "#ffd23f" }
  },
  "bindings": [
    { "match": "building.*.l1", "preset": "stall", "paletteBySlot": ["warm-market","warm-market","warm-market","warm-market","warm-market","warm-market","snow-deer","snow-deer","snow-deer","snow-deer","snow-deer","snow-deer","papercut","papercut","papercut","papercut","papercut","papercut","onsen-mist","onsen-mist","onsen-mist","onsen-mist","onsen-mist","onsen-mist","night-neon","night-neon","night-neon","night-neon","night-neon","night-neon","warm-market","warm-market"] },
    { "match": "building.*.l2", "preset": "shop", "paletteBySlot": ["warm-market","warm-market","warm-market","warm-market","warm-market","warm-market","snow-deer","snow-deer","snow-deer","snow-deer","snow-deer","snow-deer","papercut","papercut","papercut","papercut","papercut","papercut","onsen-mist","onsen-mist","onsen-mist","onsen-mist","onsen-mist","onsen-mist","night-neon","night-neon","night-neon","night-neon","night-neon","night-neon","warm-market","warm-market"] },
    { "match": "building.*.l3", "preset": "market3", "paletteBySlot": ["warm-market","warm-market","warm-market","warm-market","warm-market","warm-market","snow-deer","snow-deer","snow-deer","snow-deer","snow-deer","snow-deer","papercut","papercut","papercut","papercut","papercut","papercut","onsen-mist","onsen-mist","onsen-mist","onsen-mist","onsen-mist","onsen-mist","night-neon","night-neon","night-neon","night-neon","night-neon","night-neon","warm-market","warm-market"] },
    { "match": "building.*.sign", "palette": "warm-market" },
    { "match": "building.s4.*", "preset": "onsenHouse", "palette": "onsen-mist", "params": { "steam": true } },
    { "match": "building.s19.*", "preset": "gate", "palette": "papercut" },
    { "match": "board.inner.*", "preset": "shop", "palette": "warm-market", "params": { "dim": 0.72 } },
    { "match": "prop.*", "palette": "warm-market" },
    { "match": "prop.signTower", "palette": "papercut", "params": { "glow": false } },
    { "match": "board.tile.chance", "palette": "night-neon" },
    { "match": "board.tile.jail", "palette": "night-neon" }
  ]
}
```

> 注：`building.s4.*` / `building.s19.*` 这两条**精确段优先于通配**——`compileTheme` 按 bindings 顺序展开，后写者覆盖先写者，故须放在 `building.*.l*` 三条**之后**（本文件已如此排序）。

- [ ] **Step 6: 接进 `main.ts`（零新增通路）**

在 `boot()` 里加载 theme 并与 shops 合并（[main.ts L101-156](file:///d:/zhao/monopoly/src/main.ts#L101-L156) 内、构造 `instantiateDeps` 之前）：

```ts
const themeRaw = await fetch('config/theme.json').then((r) => r.json()).catch(() => null);
const theme = parseTheme(themeRaw);
const themeOverrides = opts.theme === 'off' ? {} : compileTheme(theme, allElementIds());
const forced = opts.theme && opts.theme !== 'off' ? forcePalette(theme, opts.theme, allElementIds()) : {};
const instantiateDeps = {
  skin, defaultSkin,
  overrides: { ...themeOverrides, ...forced, ...shops.overrides },   // 商家实拍素材永远赢
  slotLevels: slotLevelsOf(),
};
```
`forcePalette(theme, id, ids)` = 把 `theme.palettes[id]` 施加到全部 `building.*` / `prop.*` / `board.tile.*`（`?theme=<paletteId>` 预览用，写在 `main.ts` 内的小函数，同样纯函数）。

- [ ] **Step 7: 加 `?theme=` URL 参数**

在 [parseOptions()](file:///d:/zhao/monopoly/src/main.ts#L40-L90) 的 `UrlOptions` 增 `theme?: string`，解析 `p.get('theme') ?? undefined`；默认 `undefined`（= 用 theme.json 原生分区轮转）。

- [ ] **Step 8: `lint-skin` 增 theme.json 校验**

在 [tools/lint-skin.mjs](file:///d:/zhao/monopoly/tools/lint-skin.mjs) 的 CLI 流程（L78-108）中追加：读 `public/config/theme.json` →
① 5 套 palette 键名全部存在且 8 键齐全；
② 每条 binding 的 `paletteBySlot` 长度 === 32；
③ 每条 `match` 至少展开 1 个 `tools/registry-ids.json` 里的 id（用 `globMatch` 同构逻辑）。
任一不满足 → 打印错误 + 退出码 1。

- [ ] **Step 9: 跑闸门**

```powershell
npx vitest run test/skin/theme.spec.ts      # PASS
npm run lint:skin                            # 期望 OK
npm run check                                # 期望全绿
```

- [ ] **Step 10: Commit**

```bash
git add monopoly/public/config/theme.json monopoly/src/skin/theme.ts monopoly/test/skin/theme.spec.ts monopoly/src/main.ts monopoly/tools/lint-skin.mjs
git commit -m "feat(mono): 新增 theme.json 配色装配表与 compileTheme 编译链，接入 resolve 覆盖层"
```

---

## Task 2: 几何与布局常量（棋盘放大 + 名牌/地块卡/HUD 常量）

**Files:**
- Modify: `public/skins/default/skin.json:4`、`public/skins/photo/skin.json`、`src/skin/layout.ts`

- [ ] **Step 1: 放大棋盘**

`public/skins/default/skin.json` 的 `geo`：`{ "hw": 21, "hh": 10.5, "ox": 195, "oy": 96 }` → **`{ "hw": 24, "hh": 13, "ox": 195, "oy": 104 }`**（盘面 384×208，占屏 33.2%，spec V7）。`photo` 包同步。

同时把 [layout.ts L49 `DEFAULT_GEO`](file:///d:/zhao/monopoly/src/skin/layout.ts#L49) 改为 `{ hw: 24, hh: 13, ox: 195, oy: 104 }`。

- [ ] **Step 2: 加名牌与地块卡常量**

在 `layout.ts` 的 HUD 段之后追加：

```ts
/* —— 名牌（spec §6.2/§6.3）：纵向被 2×hh=26 / 13 锁死，故胶囊 h=13、字号靠横向吃满格宽 —— */
export const LABEL_ROOF = { fs: 10, fsShort: 11, fsNarrow: 8, padX: 6, h: 13, rx: 6, lift: 5, strokeW: 1.1 };
export const LABEL_GROUND = { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 };
export const LABEL_CURRENT_SCALE = 1.25;
export const LABEL_MAX_CHARS = 4;            // >4 字截断加 '…'

/* —— 落地地块卡（spec §7.3）：位于棋盘（底 312）与底坞（顶 606）之间 —— */
export const TILE_CARD_X = 8;
export const TILE_CARD_Y = 508;
export const TILE_CARD_W = 374;
export const TILE_CARD_H = 76;

/* —— 停留气泡（spec §6.7）：锚在棋子头顶上方 8px —— */
export const BUBBLE_W = 100;
export const BUBBLE_H = 44;
export const BUBBLE_GAP = 8;
```

并把 `LABEL_PARAMS` 从 [main.ts L62-63](file:///d:/zhao/monopoly/src/main.ts#L62-L63) **删除**，改引 `LABEL_GROUND`。

- [ ] **Step 3: 资产条改 1 条 4 段（不加 id，C5）**

`layout.ts`：`HUD_BAR_W = 86 → 94.5`，`HUD_BAR_GAP = 11 → 0`（4 段 6..384 无缝拼成一条）。`Hud.ts` 的 `barCx(i)` 与 `tutorial.ts` 的高亮框都从这两个常量派生，自动跟随，**勿手改这两处**。

- [ ] **Step 4: 验证**

```powershell
npx tsc --noEmit          # 期望 0
npm run check             # 期望全绿（若有 geo 快照断言，按新值更新）
npm run e2e:play          # 期望通过（棋盘放大后命中区仍走同源几何）
```

- [ ] **Step 5: Commit**

```bash
git add monopoly/src/skin/layout.ts monopoly/public/skins monopoly/src/main.ts
git commit -m "feat(mono): 棋盘放大至 384×208，新增楼顶名牌/地块卡/气泡布局常量，资产条并入 1 条 4 段"
```

---

## Task 3: 建筑 6 原型（`proc-building.ts`）

**Files:**
- Modify: `src/render/providers/proc-building.ts`

- [ ] **Step 1: 抽 `market3` 并删 neon**

把既有 `shop()` 的 `levels===3` 分支抽成独立 `export function market3(g, ctx)`：**保留**灰瓦/成排暖窗/招牌塔/旗杆；**删除** `neon` 青描边与 `glass3` 青幕墙两组图元。`shop()` 只保留 L1/L2 分支。

- [ ] **Step 2: 新增 4 原型（各 1 个 export 函数）**

| 函数 | 形态 | 关键参数（写在 `fb({...})` 容器里，取值为 `num(p,'k',DEFAULT)` 形式的实参） |
|---|---|---|
| `stall` | 坡顶摊位：木架 + 布篷 + 一盏暖灯 + 平摊台面 | `postW 1.4` / `canopyRise 10` / `bulbR 2.2` |
| `onsenHouse` | 温泉汤屋：暖帘门 + 汤池 + 汤雾 | `steam: true` / `poolW 0.62` / `steamRise 14` |
| `gate` | 牌楼门：双柱 + 横匾 + 顶檐 + 石狮位 | `pillarW 3.2` / `lintelH 5` / `eaveRise 8` |
| `barn` | 鹿舍仓房：大坡瓦顶 + 横木门 + 干草堆 | `roofRise 18` / `doorW 0.5` / `hayR 4.5` |

四个函数一律读 `ctx.params` 里的 8 个色键（`wallL/wallR/roof/win/sign/glow`），**不写死任何色值**（写死会被 `check-hardcoded` 拦下）。

- [ ] **Step 3: 注册 5 个新 preset**

在 [proc.ts `PROC_PRESETS`](file:///d:/zhao/monopoly/src/render/providers/proc.ts#L118-L181) 注册：`stall` / `market3` / `onsenHouse` / `gate` / `barn`（`shop` / `sign` 保留原位）。

- [ ] **Step 4: `brand` 改从 `state` 读**

`sign()` 内 `brand` 取值改为 `str(ctx.state as Record<string, unknown>, 'brand', str(p, 'brand', DEFAULT))`（`state` 优先，`params` 兜底）。

- [ ] **Step 5: 单测（每个新 preset 至少 1 例）**

`test/render/building.spec.ts` 追加：用假 `Graphics` 收集调用序列（既有测试的 mock 方式照抄），断言 ① 不抛错 ② 颜色取自 `params` ③ `market3` 产物中**不含**青描边调色值（`#29a9e0` 类冷色）。

- [ ] **Step 6: 验证 + Commit**

```powershell
npx vitest run test/render       # PASS
npm run check                    # 全绿
git add monopoly/src/render/providers monopoly/test/render
git commit -m "feat(mono): 建筑扩至 6 原型（stall/market3/onsenHouse/gate/barn），删除 L3 青幕墙与霓虹描边"
```

---

## Task 4: 道具 16（`proc-props.ts` + registry）

**Files:**
- Modify: `src/skin/registry.ts`（`PROPS` 数组 + 8 条 `reg[...]`）、`src/render/providers/proc-props.ts`

- [ ] **Step 1: registry 扩 `PROPS`**

`PROPS` 数组追加 `'flagpole','chimney','barrel','lionStone','snowPile','clothesline','steamVent','stoneLantern'`，并在 L95-102 后追加 8 条：

```ts
reg['prop.flagpole'] = prop('flagpole', { w: 4, d: 2, h: 34 }, 0, 'ground');
reg['prop.chimney'] = prop('chimney', { w: 8, d: 5, h: 18 }, 1, 'roof');
reg['prop.barrel'] = prop('barrel', { w: 10, d: 6, h: 12 }, 0, 'ground');
reg['prop.lionStone'] = prop('lionStone', { w: 10, d: 6, h: 16 }, 0, 'ground');
reg['prop.snowPile'] = prop('snowPile', { w: 18, d: 9, h: 6 }, 0, 'ground');
reg['prop.clothesline'] = prop('clothesline', { w: 30, d: 2, h: 12 }, 0.9);
reg['prop.steamVent'] = prop('steamVent', { w: 12, d: 7, h: 10 }, 0, 'ground');
reg['prop.stoneLantern'] = prop('stoneLantern', { w: 8, d: 5, h: 20 }, 0, 'ground');
```

- [ ] **Step 2: 写 8 个 preset 函数**

沿用 [proc-props.ts L69-84 `frame(ctx)`](file:///d:/zhao/monopoly/src/render/providers/proc-props.ts#L69-L84) 拿宿主坐标系；每个函数签名 `export function xxx(g: Graphics, ctx: ProcCtx): void`；色值一律走 `params`（`glow` 用作灯/雾/雪高光）。**`prop.snowPile` 与 `prop.steamVent` 的冷色只许取 `params.glow` 或 `params.wallR`，不得新增裸色值。**

- [ ] **Step 3: 注册 + 验证 + Commit**

```powershell
npm run lint:skin     # 期望 OK（新 id 齐全）
npx vitest run        # PASS
npm run check         # 全绿
git add monopoly/src/skin/registry.ts monopoly/src/render/providers/proc-props.ts
git commit -m "feat(mono): 道具扩至 16（+旗杆/烟囱/木桶/石狮/雪堆/晾衣绳/汤雾口/石灯笼）"
```

---

## Task 5: 环境层 7 + `AtmosphereView`

**Files:**
- Create: `src/render/AtmosphereView.ts`
- Modify: `src/skin/registry.ts`（+7 `bg.*`）、`src/render/providers/proc-base.ts`（+7 preset）、`src/render/paint.ts`（接 pass 0）

- [ ] **Step 1: registry 加 7 条（`showcaseEntry` 同构，ground 挂载）**

```ts
reg['bg.sky'] = showcaseEntry('bg.sky', { w: 390, d: 1, h: 844 });
reg['bg.stars'] = showcaseEntry('bg.stars', { w: 390, d: 1, h: 240 });
reg['bg.moon'] = showcaseEntry('bg.moon', { w: 60, d: 1, h: 60 });
reg['bg.ridge'] = showcaseEntry('bg.ridge', { w: 390, d: 1, h: 90 });
reg['bg.street'] = showcaseEntry('bg.street', { w: 390, d: 1, h: 130 });
reg['bg.streetLamp'] = showcaseEntry('bg.streetLamp', { w: 40, d: 1, h: 70 });
reg['bg.lanternString'] = showcaseEntry('bg.lanternString', { w: 390, d: 1, h: 30 });
```

- [ ] **Step 2: 7 个 preset（`proc-base.ts` 内新增，参数化）**

`skyGradient{top,bottom}` / `starField{count,rMin,rMax,fill,alpha}` / `moonDisc{x,y,r,fill,haloR,haloAlpha}` / `ridgeSilhouette{peaks[],fill,alpha}` / `streetBand{y,h,fill,silhouettes[],windowFill}` / `streetLamp{x,y,poleH,glowFill,glowR}` / `lanternString{x0,x1,y,sag,n,fill,glowAlpha}`。`starField` 用**单 `Graphics` 多点绘制**（合批，控元素预算）。

- [ ] **Step 3: 新建 `AtmosphereView.ts`**

导出 `atmosphereSpecs(): ElementSpec[]`，7 条 `fixed` 台位（`pass: 0`），坐标全部取自 `layout.ts` 常量或写在本文件顶部的常量表；在 `paint.ts` 的视图组装**最前**插入 `atmosphereSpecs()`。**静态层**：只在 boot 与换配色时构建一次，不随状态重绘（spec §12 性能口径）。

- [ ] **Step 4: 验证**

```powershell
npx vitest run
npm run check
npm run dev    # 目视：中部 320..508 条带非纯黑；?perf=1 看 scene ≤ 200
```

- [ ] **Step 5: Commit**

```bash
git add monopoly/src/render/AtmosphereView.ts monopoly/src/render/providers/proc-base.ts monopoly/src/skin/registry.ts monopoly/src/render/paint.ts
git commit -m "feat(mono): 新增环境层 7 元素（夜空/星点/月/远山/街市带/街灯/灯笼串），pass 0 静态底遍"
```

---

## Task 6: 店名上房顶 + 当前格三重标记

**Files:**
- Modify: `src/render/LabelView.ts`、`src/render/paint.ts`、`src/main.ts`
- Create: `test/render/label.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// test/render/label.spec.ts
import { describe, it, expect } from 'vitest';
import { labelSize, roofLabelY, clampLabelText } from '../../src/render/LabelView';
import { LABEL_ROOF, LABEL_CURRENT_SCALE } from '../../src/skin/layout';

describe('名牌几何（spec §6.2）', () => {
  it('4 字 fs10、3 字 fs11、5 字自动降 fs8、>5 字截断', () => {
    expect(labelSize('长峰特产').fs).toBe(LABEL_ROOF.fs);        // 4 字
    expect(labelSize('金鹿源').fs).toBe(LABEL_ROOF.fsShort);     // 3 字
    expect(labelSize('鹿茸市场部').fs).toBe(LABEL_ROOF.fsNarrow);// 5 字
    expect(clampLabelText('一二三四五六')).toBe('一二三四…');
  });
  it('4 字胶囊宽 ≤ 相邻格横向间距 48', () => {
    expect(labelSize('长峰特产').w).toBeLessThanOrEqual(48);
  });
  it('当前格放大 1.25×', () => {
    expect(labelSize('长峰特产', true).fs).toBeCloseTo(LABEL_ROOF.fs * LABEL_CURRENT_SCALE, 1);
  });
  it('楼顶落位 = 格心 − 楼高 − lift − h/2', () => {
    expect(roofLabelY(200, 72)).toBe(200 - 72 - LABEL_ROOF.lift - LABEL_ROOF.h / 2);
  });
});
```

- [ ] **Step 2: 运行确认失败** → `npx vitest run test/render/label.spec.ts`（FAIL：无导出）

- [ ] **Step 3: 实现（LabelView.ts）**

新增并导出三个纯函数：

```ts
export function clampLabelText(text: string, max = LABEL_MAX_CHARS): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}
export function labelSize(text: string, current = false): { fs: number; w: number; h: number } {
  const n = clampLabelText(text).length;
  const base = n <= 3 ? LABEL_ROOF.fsShort : n === 4 ? LABEL_ROOF.fs : LABEL_ROOF.fsNarrow;
  const fs = current ? base * LABEL_CURRENT_SCALE : base;
  return { fs, w: n * fs + LABEL_ROOF.padX, h: LABEL_ROOF.h };
}
export function roofLabelY(cy: number, buildingH: number): number {
  return cy - buildingH - LABEL_ROOF.lift - LABEL_ROOF.h / 2;
}
```

`labelPlacement()` 增第三参 `buildingH?: number`：有楼走 `roofLabelY`，无楼走原地面分支（`LABEL_GROUND`）。

- [ ] **Step 4: `drawLabels` 增描边 / 放大 / 指示三角 / 当前格**

签名扩为 `drawLabels(layer, geo, params: { bg, text, ownedText, ownerOf, textOf?, levelOf?, currentSlot? }, label)`；逐格：`const cur = index === currentSlot`；`bg.roundRect(...).fill({color}).stroke({ color: GOLD, width: cur ? 1.8 : LABEL_ROOF.strokeW })`；文字色 `cur ? '#ffffff' : (owned ? ownedText : text)`；`cur` 时在胶囊下方画金色指示三角。字号取 `labelSize(text, cur).fs`，宽度取 `labelSize(text, cur).w`。

- [ ] **Step 5: `paint.ts` 加地砖金色双环**

在既有 `board.tile.*.edge` 绘制处，对 `currentSlot` 多画两层 `dia(...HW±1.5, HH±1.5)` 金环：内 `1.6px` 实金 `#ffd76a` + 外 `3px` `rgba(255,215,106,.30)`。

- [ ] **Step 6: `main.ts` 接线**

`paint()` 调用处（[L236-242](file:///d:/zhao/monopoly/src/main.ts#L236-L242)）传 `levelOf: (i) => slotLevels[i]`（复用 `slotLevelsOf()`，与楼体同源）与 `currentSlot: currentPlayer(g.state).pos`。

- [ ] **Step 7: 验证 + Commit**

```powershell
npx vitest run test/render/label.spec.ts     # PASS
npm run check && npm run e2e:play
git add monopoly/src/render/LabelView.ts monopoly/src/render/paint.ts monopoly/src/main.ts monopoly/test/render/label.spec.ts
git commit -m "feat(mono): 店名浮上楼顶并放大至 fs10/11（+61%），当前格加金环/放大/指示三角三重标记"
```

---

## Task 7: 棋子重写为 Q 版小朋友（两男两女）

**Files:**
- Modify: `src/render/providers/proc-pawn.ts`（重写）、`src/skin/registry.ts:105-112`（box 放大）
- Create: `test/render/pawn.spec.ts`

- [ ] **Step 1: box 放大**

`piece.p{p}` 的 `box`：`{ w: 8.4, d: 4.2, h: 13 }` → **`{ w: 12, d: 6, h: 20 }`**（spec §6.6 尺寸校验：12 < 格宽 48；同格 4 枚错开步距 12 → 36 ≤ 48）。

- [ ] **Step 2: 写失败测试**

```ts
// test/render/pawn.spec.ts
import { describe, it, expect } from 'vitest';
import { pawn } from '../../src/render/providers/proc-pawn';

const calls: string[] = [];
const g = new Proxy({}, {
  get: (_t, k) => (...a: unknown[]) => { calls.push(String(k)); if (String(k) === 'poly') calls.push(JSON.stringify(a[0]).slice(0, 80)); return g; },
}) as never;
const ctx = (params: Record<string, unknown>, state: Record<string, unknown>) =>
  ({ cx: 100, cy: 200, s: 1, params, state, geo: { hw: 24, hh: 13 }, box: { w: 12, d: 6, h: 20 } }) as never;

describe('Q 版小朋友棋子', () => {
  it('含人形五官：眼 + 白高光 + 腮红 + 头发', () => {
    calls.length = 0; pawn(g, ctx({ style: 'short' }, { owner: 1, mood: 'calm' }));
    expect(calls.filter((c) => c === 'ellipse').length).toBeGreaterThanOrEqual(4);
    expect(calls.filter((c) => c === 'circle').length).toBeGreaterThanOrEqual(4);
  });
  it('三表情几何互不相同', () => {
    const sig = (mood: string) => { calls.length = 0; pawn(g, ctx({ style: 'short' }, { owner: 1, mood })); return calls.length; };
    expect(new Set([sig('calm'), sig('happy'), sig('sad')]).size).toBe(3);
  });
  it('四 style 互不相同且不抛错', () => {
    for (const style of ['short', 'twintail', 'cap', 'bun']) {
      expect(() => pawn(g, ctx({ style }, { owner: 2, mood: 'calm' }))).not.toThrow();
    }
  });
  it('归属色只上围巾/头饰（衣服统一米白）', () => {
    calls.length = 0; pawn(g, ctx({ style: 'short' }, { owner: 1, mood: 'calm' }));
    const joined = calls.join('|');
    expect(joined).toContain('fdf6e8');   // 衣服米白
    expect(joined).toContain('3fbf7f');   // owner1 绿 → 围巾
  });
});
```

- [ ] **Step 3: 运行确认失败** → `npx vitest run test/render/pawn.spec.ts`（FAIL）

- [ ] **Step 4: 重写 `proc-pawn.ts`（Pixi Graphics 版画法，设计单位：脚底 y=0，向上为负）**

```ts
import type { Graphics } from 'pixi.js';
import type { ProcCtx } from './proc';

const hit = (hex: string, a: number) => ({ color: hex, alpha: a });

/**
 * Q 版小朋友棋子（spec §6.6 / 计划 Task 7）。
 * 二头身、大眼睛 + 白高光、腮红、围巾铃铛；归属只染「围巾 + 头饰」，衣服统一米白。
 * params.style: short（男）/ twintail（女）/ cap（男）/ bun（女）；state.mood: calm|happy|sad；state.owner: 1..4
 */
export function pawn(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, params, state } = ctx;
  const p = params as Record<string, unknown>;
  const st = state as Record<string, unknown>;
  const n = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
  const c = (k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);

  const s = ctx.s * (n('scale', 1) * 20) / 24.2;               // 设计单位 → 屏幕：总高 24.2
  const owner = typeof st.owner === 'number' ? st.owner : 1;
  const trim = c(`owner${owner}`, c('trim', '#3fbf7f'));
  const mood = typeof st.mood === 'string' ? st.mood : 'calm';
  const style = c('style', 'short');
  const skin = c('skin', '#ffe2c8');
  const cloth = c('cloth', '#fdf6e8');
  const hair = c('hair', '#3b2b22');
  const shoe = c('shoe', '#3a2f28');
  const eye = c('eye', '#2b2320');
  const lit = c('lit', '#f5c451');

  g.setTransform?.(cx, cy, s, s);   // 若既有管线用 ctx 坐标直接落点，则改为手算 cx+dx*s
  const X = (dx: number) => dx;
  const Y = (dy: number) => dy;

  // ① 当前玩家光晕（AI 无）
  if (st.active === true || n('glow', 0) === 1) {
    g.ellipse(X(0), Y(1.3), 8.2 * 1, 3.2).fill(hit('#ffdc8c', 0.44));
  }
  // ② 地面投影
  g.ellipse(X(0), Y(0.9), 6.0, 2.1).fill(hit('#000000', 0.26));
  // ③ 腿 + 鞋
  g.roundRect(X(-2.9), Y(-6.6), 2.4, 6.8, 1.1).fill({ color: cloth });
  g.roundRect(X(0.5), Y(-6.6), 2.4, 6.8, 1.1).fill({ color: cloth });
  g.roundRect(X(-3.2), Y(-1.5), 3.0, 1.9, 0.9).fill({ color: shoe });
  g.roundRect(X(0.2), Y(-1.5), 3.0, 1.9, 0.9).fill({ color: shoe });
  // ④ 身体 + 双臂 + 双手
  g.roundRect(X(-4.3), Y(-13.8), 8.6, 8.4, 3.2).fill({ color: cloth });
  g.roundRect(X(-6.2), Y(-13.2), 2.2, 6.4, 1.1).fill({ color: cloth });
  g.roundRect(X(4.0), Y(-13.2), 2.2, 6.4, 1.1).fill({ color: cloth });
  g.circle(X(-5.1), Y(-6.6), 1.25).fill({ color: skin });
  g.circle(X(5.1), Y(-6.6), 1.25).fill({ color: skin });
  // ⑤ 围巾 + 铃铛（归属色）
  g.roundRect(X(-4.5), Y(-15.2), 9.0, 2.7, 1.35).fill({ color: trim });
  g.roundRect(X(-1.5), Y(-13.6), 3.0, 3.4, 0.9).fill({ color: trim });
  g.circle(X(0), Y(-10.7), 1.2).fill({ color: lit });
  // ⑥ 头发后层（女）
  if (style === 'twintail') {
    g.ellipse(X(-6.6), Y(-17.4), 2.2, 3.0).fill({ color: hair });
    g.ellipse(X(6.6), Y(-17.4), 2.2, 3.0).fill({ color: hair });
  }
  if (style === 'bun') g.circle(X(0), Y(-24.8), 2.4).fill({ color: hair });
  // ⑦ 耳 + 头 + 刘海
  g.circle(X(-5.3), Y(-18.9), 1.15).fill({ color: skin });
  g.circle(X(5.3), Y(-18.9), 1.15).fill({ color: skin });
  g.circle(X(0), Y(-18.9), 5.3).fill({ color: skin });
  g.ellipse(X(0), Y(-21.9), 5.45, 2.95).fill({ color: hair });
  // ⑧ 头饰（归属色）
  if (style === 'twintail') { g.circle(X(-5.7), Y(-18.9), 1.0).fill({ color: trim }); g.circle(X(5.7), Y(-18.9), 1.0).fill({ color: trim }); }
  if (style === 'bun') g.ellipse(X(0), Y(-23.5), 2.5, 0.8).fill({ color: trim });
  if (style === 'cap') { g.ellipse(X(0), Y(-22.3), 5.6, 3.0).fill({ color: trim }); g.roundRect(X(-3.4), Y(-21.7), 6.8, 1.5, 0.75).fill({ color: trim }); }
  // ⑨ 表情（离散三态）
  const cheekA = mood === 'happy' ? 0.5 : mood === 'sad' ? 0.35 : 0.42;
  if (mood === 'happy') {
    g.moveTo(X(-3.1), Y(-19.2)).lineTo(X(-1.95), Y(-20.7)).lineTo(X(-0.8), Y(-19.2)).stroke({ color: eye, width: 0.95 });
    g.moveTo(X(0.8), Y(-19.2)).lineTo(X(1.95), Y(-20.7)).lineTo(X(3.1), Y(-19.2)).stroke({ color: eye, width: 0.95 });
    g.ellipse(X(-3.5), Y(-17.3), 1.5, 1.05).fill(hit('#f0938f', cheekA));
    g.ellipse(X(3.5), Y(-17.3), 1.5, 1.05).fill(hit('#f0938f', cheekA));
    g.ellipse(X(0), Y(-16.6), 2.0, 1.1).fill({ color: '#c05050' });
  } else if (mood === 'sad') {
    g.moveTo(X(-3.2), Y(-21.7)).lineTo(X(-1.5), Y(-20.9)).stroke({ color: eye, width: 0.85 });
    g.moveTo(X(3.2), Y(-21.7)).lineTo(X(1.5), Y(-20.9)).stroke({ color: eye, width: 0.85 });
    g.ellipse(X(-1.95), Y(-18.9), 1.3, 1.45).fill({ color: eye });
    g.ellipse(X(1.95), Y(-18.9), 1.3, 1.45).fill({ color: eye });
    g.circle(X(-2.35), Y(-19.4), 0.5).fill({ color: '#ffffff' });
    g.circle(X(1.55), Y(-19.4), 0.5).fill({ color: '#ffffff' });
    g.ellipse(X(-3.4), Y(-17.2), 1.15, 0.8).fill(hit('#f0938f', cheekA));
    g.ellipse(X(3.4), Y(-17.2), 1.15, 0.8).fill(hit('#f0938f', cheekA));
    g.ellipse(X(2.9), Y(-15.2), 0.55, 1.1).fill({ color: '#8fd4ff' });   // 泪珠
    g.moveTo(X(-1.3), Y(-16.8)).lineTo(X(0), Y(-17.5)).lineTo(X(1.3), Y(-16.8)).stroke({ color: '#b5726a', width: 0.85 });
  } else {
    g.ellipse(X(-1.95), Y(-19.3), 1.35, 1.55).fill({ color: eye });
    g.ellipse(X(1.95), Y(-19.3), 1.35, 1.55).fill({ color: eye });
    g.circle(X(-2.4), Y(-19.85), 0.55).fill({ color: '#ffffff' });
    g.circle(X(1.5), Y(-19.85), 0.55).fill({ color: '#ffffff' });
    g.ellipse(X(-3.5), Y(-17.3), 1.15, 0.8).fill(hit('#f0938f', cheekA));
    g.ellipse(X(3.5), Y(-17.3), 1.15, 0.8).fill(hit('#f0938f', cheekA));
    g.moveTo(X(-1.1), Y(-17.3)).lineTo(X(0), Y(-16.4)).lineTo(X(1.1), Y(-17.3)).stroke({ color: '#b5726a', width: 0.85 });
  }
}
```

> **落点方式必须与既有管线一致**：先读 `proc-building.ts` 的 `shop()` 看它如何把设计坐标映射到屏幕（是 `ctx.cx + dx*s` 还是 `g.setTransform`），**照抄同一种**，不要引入第二种。上面 `X()/Y()` 只是占位符，实现时替换成管线既有写法。

- [ ] **Step 5: 四套造型接线**

在 `paint.ts` 生成 `piece.p*` 的 spec 时写入 `params: { style }`（`p1 short` / `p2 twintail` / `p3 cap` / `p4 bun`）与 `state: { owner, mood, active }`（`active` = 是否当前玩家，用于光晕）。

- [ ] **Step 6: 三表情由 `runAction` 落库写入**

在 [runAction()](file:///d:/zhao/monopoly/src/main.ts#L248-L338) 里按 `state.lastEvent` 映射 `mood`：买地/收租/升级/掷出 6 → `happy`；付租/破产/进监狱 → `sad`；`fx.play()` 结束时回落 `calm`。**只写 `state`（或 spec 层透传），不在动画里改。**

- [ ] **Step 7: 验证 + Commit**

```powershell
npx vitest run test/render/pawn.spec.ts    # PASS
npm run check && npx tsc --noEmit && npm run e2e:play
git add monopoly/src/render/providers/proc-pawn.ts monopoly/src/skin/registry.ts monopoly/test/render/pawn.spec.ts monopoly/src/render/paint.ts monopoly/src/main.ts
git commit -m "feat(mono): 棋子重写为 Q 版小朋友（两男两女·大眼睛高光·三表情），归属只染围巾与头饰"
```

---

## Task 8: 停留事件气泡

**Files:**
- Create: `src/render/providers/proc-bubble.ts`
- Modify: `src/skin/registry.ts`（+`ui.bubble`）、`src/render/providers/proc.ts`（注册）、`src/render/paint.ts`

- [ ] **Step 1: registry + 注册**

```ts
reg['ui.bubble'] = showcaseEntry('ui.bubble', { w: 100, d: 1, h: 44 });
```
`PROC_PRESETS` 注册 `bubble`。

- [ ] **Step 2: 写 preset**

```ts
import type { Graphics } from 'pixi.js';
import type { ProcCtx } from './proc';

/** 头顶事件气泡（spec §6.7）：暖白底金边，与深底名牌反相；不进 hitAreas()、不吞点击 */
export function bubble(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as Record<string, unknown>;
  const n = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
  const c = (k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);
  const s = ctx.s;
  const w = n('w', 100) * s, h = n('h', 44) * s;
  const x = ctx.cx - w / 2, y = ctx.cy - h;
  g.roundRect(x, y, w, h, 8 * s).fill({ color: c('fill', '#fff7e6') }).stroke({ color: c('edge', '#f5c451'), width: 1.3 * s });
  g.poly([ctx.cx - 6 * s, y + h, ctx.cx + 6 * s, y + h, ctx.cx, y + h + 7 * s])
    .fill({ color: c('fill', '#fff7e6') }).stroke({ color: c('edge', '#f5c451'), width: 1.0 * s });
  // 文字（标题/金额）走 ctx.text 请求，见既有 makeText 通路：
  //   标题 = p.title，fs 11，fill c('titleColor','#241a12')
  //   金额 = p.amount，fs 10，fill c('tone','#2f8f5e')
  ctx.text?.({ text: String(p.title ?? ''), x: ctx.cx, y: y + 16 * s, fs: 11 * s, fill: c('titleColor', '#241a12'), bold: true });
  ctx.text?.({ text: String(p.amount ?? ''), x: ctx.cx, y: y + 31 * s, fs: 10 * s, fill: c('tone', '#2f8f5e') });
}
```

> `ctx.text` 的**真实签名**以 `ProcCtx` 为准（[proc.ts L33-55](file:///d:/zhao/monopoly/src/render/providers/proc.ts#L33-L55) 的 `text?:` 字段），实现前先读它并按实际字段名写。

- [ ] **Step 3: `paint.ts` 条件绘制（pass 4 之后）**

仅当「有停留事件且未处于 idle」时追加一条 `ui.bubble` spec：台位 = 当前玩家棋子头顶 `BUBBLE_GAP` 上方、水平居中（`cx = pawnCx`，`cy = pawnFeetY - 20*s - BUBBLE_GAP`）。四态映射（spec §6.7 表）：买地（绿 `#2f8f5e`）/ 收租（金 `#a8761c`）/ 抽卡（紫 `#7b46d6`）/ 进监狱（红 `#c0392b`），标题取 `TILE_SHORT[pos]` 或卡名，文案与 `state.lastEvent` 同源。

- [ ] **Step 4: 不吞点击**

确认气泡**不出现在** [Hud.ts `hitAreas()`](file:///d:/zhao/monopoly/src/ui/Hud.ts#L189-L254) 与 [panels.ts `panelHitAreas()`](file:///d:/zhao/monopoly/src/ui/panels.ts#L253-L329) 里。

- [ ] **Step 5: 验证 + Commit**

```powershell
npx vitest run && npm run check && npm run e2e:play   # 973 次点击仍全绿
git add monopoly/src/render/providers/proc-bubble.ts monopoly/src/skin/registry.ts monopoly/src/render/providers/proc.ts monopoly/src/render/paint.ts
git commit -m "feat(mono): 新增停留事件头顶气泡（买地/收租/抽卡/进监狱四态），inpointer-events 不吞点击"
```

---

## Task 9: HUD 分段资产条 + 落地地块卡 + 手牌抽屉

**Files:**
- Modify: `src/ui/Hud.ts`、`src/ui/panels.ts`、`src/skin/registry.ts`（+`ui.tileCard`）、`src/render/providers/proc-panel.ts`

- [ ] **Step 1: registry + 地块卡 preset**

```ts
reg['ui.tileCard'] = showcaseEntry('ui.tileCard', { w: 374, d: 1, h: 76 });
```
`proc-panel.ts` 新增 `tileCard` preset：深底圆角 + 金色首行「● 停在 <店名> · 你在这里」+ 第二行「等级 L{n} · 持有 <玩家>」+ 右侧两枚按钮位（视觉由 `ui.button.secondary` 复用）。

- [ ] **Step 2: 资产条 4 段（常量已在 Task 2 改完，这里只核对）**

`Hud.ts` 的 `barCx(i)`（[L102](file:///d:/zhao/monopoly/src/ui/Hud.ts#L102)）不需改；每段内保留「色条 + 名 + 现金」，当前玩家段加金框 + 淡金底（[L134-141](file:///d:/zhao/monopoly/src/ui/Hud.ts#L134-L141) 处补 `params`）。

- [ ] **Step 3: 地块卡滑入（条件显示）**

在 `Hud.ts` 或 `panels.ts` 中，仅当 `phase === 'settled'` 且无浮层（`overlayOf() === null`）时追加 `ui.tileCard` spec（`TILE_CARD_X/Y/W/H`）+ 两枚 `ui.button.secondary`（`Y = TILE_CARD_Y + 40`，宽高取既有 `HUD_BTN_SECONDARY_W/H`）。

- [ ] **Step 4: 手牌收进牌袋抽屉**

关闭态：`ui.handSlot` 不参与命中（`panelHitAreas()` 里按 `panels.handOpen` 条件裁剪）；打开态：沿用既有 `PANEL_HAND_Y` 一行 5 槽。牌袋键复用既有键位（**不新增 id**）。

- [ ] **Step 5: 命中区同源（关键，spec §12 高风险项）**

`hitAreas()` 的 4 段可点区必须由同一个 `HUD_BAR_X0/W/GAP` 计算；地块卡两枚按钮的命中区必须与视觉按钮同一组常量计算。

- [ ] **Step 6: 验证（先点后截）**

```powershell
npm run e2e:play     # 973 次点击；HUD 重排后必须仍全绿，不过则先修命中区
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add monopoly/src/ui monopoly/src/skin/registry.ts monopoly/src/render/providers/proc-panel.ts
git commit -m "feat(mono): HUD 资产条合并为 1 条 4 段、新增落地地块卡、手牌收进牌袋抽屉（命中区同源）"
```

---

## Task 10: 游戏内风格控制台（`?debug=1`）

**Files:**
- Create: `src/ui/themeConsole.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: 实现**

`?debug=1` 时挂载（生产版零占用）：点棋盘任一格 → 弹 5 套 palette 色卡 → 选中即 `paint()` 实时预览；「全部 L1/L2/L3」「全部道具」「全部环境层」批量指派；选中元素后展开其 `params` 表单；「导出 theme.json」按钮 → 输出完整 JSON（可复制回填）。**改动只存内存，不写 `localStorage`。**

- [ ] **Step 2: 验证 + Commit**

```powershell
npm run check
npm run dev   # ?play=1&debug=1 目视：逐栋选色实时变；导出 JSON 与 theme.json 同构
git add monopoly/src/ui/themeConsole.ts monopoly/src/main.ts
git commit -m "feat(mono): 新增游戏内风格控制台（逐栋选色/批量/单素材微调/导出 JSON），仅 ?debug=1"
```

---

## Task 11: 闸门、截图、手册

**Files:**
- Create: `local/mono-shots-visual.mjs`
- Modify: `local/mono-prod-check.mjs`、`local/mono-e2e-playthrough.mjs`、`docs/manual-mono.md`

- [ ] **Step 1: V 系列闸门写进 `mono-prod-check.mjs`**

| # | 判据 |
|---|---|
| V1 | theme.json 合法（5 palette × 8 键、`paletteBySlot` 长 32、每条 match 至少展开 1 个 id） |
| V2 | `?theme=` × 5 各出一图、两两主色不同；`?theme=off` 回落 skin.json |
| V3 | `building.s4.l2` 实例 `params.wallL === S4.wallL`；改 binding 即时变化 |
| V4 | `prop.signTower.params` 覆盖生效且不影响其他 `prop.*` |
| V5 | building spec 的 overrides **不含 `hue` 键** |
| V6 | 32 名牌齐备且 `strokeW > 0`；4 字宽 ≤48 且 fs10；3 字 fs11；5 字 fs8；>5 截断；当前格 1.25× + 三角 |
| V6b | 当前格 金环 + 名牌 1.25× + 棋子光晕 **三处同时成立**；地块卡首行含「停在」 |
| V7 | `geo.hw === 24`；棋盘纵向 ∈ [40, 320] ⇒ 占比 ≥33% |
| V8 | 中部条带 320..508 非纯背景像素 > 20% |
| V9 | `ui.playerBar` 4 段连续无缝（X0/W/GAP 派生）且 `hitAreas()` 4 段一一对齐 |
| V10 | `settled` 时地块卡出现且「升级」可点；`idle` 时不可见 |
| V11 | 牌袋键可开关；关闭时 `ui.handSlot` 不参与命中 |
| V12 | 6 原型 + 16 道具 + 7 环境 preset 全可达；`scene ≤ 200`；`missingAssets === []` |
| V13 | pawn 含 ≥2 眼（含白高光）+ 腮红 + 头发；四 `style` 覆盖两男两女；`trim` === `owner1..4` 且衣服统一米白；三 mood 几何不同 |
| V14 | 气泡四态各产出 1 枚 `ui.bubble`；气泡不在 `hitAreas()`；`idle` 无气泡；`e2e:play` 全绿 |

- [ ] **Step 2: 写截图脚本（硬性口径 390×844, dpr=2）**

`local/mono-shots-visual.mjs` → 产出到 `monopoly/docs/verify/`：

```
mono-visual-01a..01e-<palette>.png   五套配色各一张全屏
mono-visual-02-labels.png            棋盘区放大（楼顶名牌可读性核对）
mono-visual-03-hud.png               底坞特写（1 条 4 段资产条 + 骰面 + 主按钮）
mono-visual-04-tilecard.png          落地态地块卡滑入
mono-visual-05-street.png            中部街市带 + 事件浮层
mono-visual-06-drawer.png            牌袋抽屉打开
mono-visual-07-catalog.png           素材库总览（6 原型 + 16 道具 + 7 环境层）
mono-visual-08-console.png           风格控制台
mono-visual-09-players.png           Q 版人物四造型 + 三表情 + 停留气泡
```

- [ ] **Step 3: 跑全部闸门**

```powershell
npm run check        # lint + lint:skin + vitest
npx tsc --noEmit
npm run check:prod
npm run e2e:play     # 973 次点击
node local/mono-shots-visual.mjs
```

- [ ] **Step 4: 手册**

`monopoly/docs/manual-mono.md` 增 **M13 画面重设计**：目标 / 改动范围 / 五套配色对照表 / `theme.json` 字段说明（含单素材独立风格示例）/ 棋子形象与停留气泡说明 / 9 张截图（**必须含手机视口截图**）/ V1–V14 口径 / 部署与线上回归记录。同步更新 §1 URL 参数表（+`?theme=`、控制台）与「最终验收」表（+第 12 项）。

- [ ] **Step 5: Commit**

```bash
git add monopoly/local monopoly/docs monopoly/docs/verify
git commit -m "test(mono): 补齐 V1–V14 闸门与 9 张手机视口截图，手册新增 M13 画面重设计"
```

---

## Task 12: 收口（提交 → 推送 → 部署）

- [ ] **Step 1: 五项闸门最后一遍全绿**

```powershell
npm run check; npx tsc --noEmit; npm run check:prod; npm run e2e:play
git diff --stat src/core    # 期望：空（core 零改动）
```

- [ ] **Step 2: 本地构建 + 部署（服务器只解压，绝不在服务器构建）**

```powershell
npm run build      # 含 check-hardcoded
npm run deploy     # node ../scripts/deploy-mono.mjs
```

- [ ] **Step 3: 线上回归**

```powershell
# 线上 game.joho.cn/tour/mono.html 用手机视口复跑 9 张截图口径的关键 3 项（配色可换 / 店名可读 / 停留标记）
```

- [ ] **Step 4: 提交并推送**

```bash
git add -A monopoly docs
git commit -m "chore(mono): 画面重设计验收收口（闸门全绿 + 手册 M13 + 线上部署）"
git push
```

---

## 执行期校正（开工后核对代码得出，优先级高于上方任务原文）

| # | 计划原文 | 实测结论 | 处理 |
|---|---|---|---|
| D1 | Task 6 新建 `test/render/label.spec.ts` | **已存在**（3 例，断言 `labelPlacement`/`labelTextOf`） | 改为**追加**新用例，勿覆盖 |
| D2 | Task 1 Step 6「themeOverrides 喂 `deps.overrides`」 | `resolve()` 的 L1 走 `isValidProvider()`，**proc 必须带非空 `preset`**；而 `prop.*` 一族各自 preset 不同，单条通配 binding 无法给对 | 改为**解析后合并**：`InstantiateDeps` 新增 `theme?: Record<id, ThemePatch>`，`instantiate()` 在 `resolve()` 之后把 patch 的 `preset`/`params` 合并到 L2/L3/L4 的结果上；**`r.level === 1` 时不合并**（商家实拍永远赢）。`compileTheme()` 返回 `ThemePatch` 而非 `ProviderSpec` |
| D3 | Task 3「四个新原型读 8 个色键」 | `shop()`/`sign()`/`tile`/`prop.*` 同样必须读色键，否则 palette 无效果 | Task 3 范围扩为：`shop`（L1/L2）+ `market3` + `sign` + `tile`（`tileFill`/`tileEdge` 优先于 `fill`/`edge`）+ 各 prop 读 `glow`/`sign`；`fb` 默认值改暖调 |
| D4 | Task 0「`hueOf()` 若仍被使用则保留」 | 除自身测试外**无任何引用** | 已删除 `hueOf` / `HUE_FALLBACK_OWNER` / `OWNER_HUE` 导入，并同步改 `test/render/building-view.spec.ts`（新增 V5 防回归例） |
| D5 | 各任务的「跑 `npm run e2e:play` / `check:prod` 验证」 | 二者 `MONO_ORIGIN` 默认 **`https://game.joho.cn/tour`（线上）**，验证的是**线上已部署版本**，非本地改动 | 本地验证以 `npm run check` + `npx tsc --noEmit` + 本地截图脚本为准；`e2e:play` / `check:prod` 放到 Task 12 部署后回归 |
| D6 | Task 1 Step 5 的 `theme.json` 直接写 `preset: stall/market3/onsenHouse/gate/barn` | `procPreset()` 对**未注册** preset 静默回退 `builtin`（纯色块 + 文字）——Task 1 与 Task 3 之间的提交会把全部 L1/L3 楼打成灰块（本地可见、线上未部署也难看） | Task 1 的 `theme.json` **先不写这些 preset**（只留 `shop`）；**Task 3 注册那 5 个 preset 时再补回** `building.*.l1` / `building.*.l3` / 五条精确 id 的 `preset` 字段（已在 `theme.json._schema.preset` 留说明）。补回后跑 `npm run lint:skin` + 本地截图确认 |
| D7 | 断言「Task 1 是零视觉变化的纯管线」 | 探针（`local/mono-theme-probe.mjs`）实测：`?theme=off` 与出厂 theme 有 **1000 px 差异**（dpr2 下 bbox `[206,377,330,453]` ≈ CSS 62×38，两栋楼的屋顶/墙面装饰小圆斑；`maxDelta=55` / `avgDelta=17.06`）；同 URL 连拍字节稳定（非动画抖动）；而 `?theme=night-neon` 与裸链接**像素完全一致**。已排除：`preset` 字段、`Object.keys/entries/values(params)` 遍历派生随机、8 个 palette 色键在 `src/` 内的显式读取（全库 grep 仅命中 `proc-showcase.ts:120` 的 `'win'`，而 `showcase.*` 不在 bindings/FORCE_MATCH 内）、`proc-base` 取值器（params 只按键读、未知键惰性） | 影响面 **0.08%**、幅度小、集中装饰物，判定为**可接受的暂态**：`shop()` 仍用 `hue` 派生墙色（skin.json 给 30/32/200），色键尚未接入。**Task 3 把 `shop()`/`sign()`/`tile`/各 prop 全部转读色键后**，以真实 before/after 手机截图复核并关闭此项 |

### 已跑基线（开工时实测）

- `npm run check` → **51 文件 / 435 例全绿**
- `npx tsc --noEmit` → **退出码 0**
- `npm run check:prod` → **全 gate true，errors 空**
- `npm run e2e:play` → **退出码 0**（线上 973 次点击整局通过）
- 改前样张 = `monopoly/docs/verify/mono-prod-0*.png`（线上旧版，作为 A/B 的「before」）

---

## Self-Review

**Spec 覆盖**：§1 取证 → Task 0；§3 视觉规范 → Task 2/3/6/7/8；§4 三层装配 → Task 1；§4.3 分区轮转 → Task 1 Step 5；§5.1–5.4 素材库 → Task 3/4/5/7/8；§6.1–6.5 店名与当前格 → Task 6；§6.6 棋子 → Task 7；§6.7 气泡 → Task 8；§7 布局/HUD → Task 2/9；§8 文件清单 → 全任务；§9 控制台 → Task 10；§10 回退链 → Task 1 Step 6（`?theme=off`）；§11 回归 → Task 11；§12 风险 → Task 9 Step 5（命中同源）/Task 0（基线）；§13 待办 → 用户已拍板 A + 名字沿用，其余（分区边界/建筑归属/副标题/气泡文案）留待实施时按 spec 建议值先做；§14 验收 → Task 11 Step 1。

**类型一致性**：`compileTheme(theme, ids) → Record<elementId, ProviderSpec>`（Task 1 定义，Task 1 Step 6 消费）；`labelSize/clampLabelText/roofLabelY`（Task 6 定义与消费同名同参）；`pawn(g, ctx)` 读 `params.style` / `state.{owner,mood,active}`（Task 7 定义，Task 7 Step 5/6 写入）；`bubble(g, ctx)` 读 `params.{title,amount,tone,w,h,fill,edge}`（Task 8 定义与消费一致）。

**占位符扫描**：无 TBD/TODO；两处「按实物核对」已明确标注为**读源码对齐**（`ctx.text` 真实签名、坐标落点方式），因为它们是运行时契约而非设计缺口。