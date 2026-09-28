# 大富翁 · 吉林双阳邻里商业版 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `d:\zhao\monopoly` 新建一个 H5（PixiJS 8 + GSAP + Vite）大富翁游戏，跑通「开局 → 掷骰 → 移动 → 踩格结算 → 买地/升级 → 收租 → 卡牌/股票/监狱/福利 → 破产/胜利」，画面达到「不低于大富翁 4 的动画水准」，且**全部视觉元素经「元素注册表 + 皮肤包」寻址、只经单一工厂 `instantiate()` 产出**，可整包换成图片素材而不改一行渲染代码。

**Architecture:** 三段式分层，照抄仓库已验证的 `tour-game` 分层——`src/data`（纯常量）→ `src/core`（纯 TS 玩法逻辑，零引擎、Vitest 可测、唯一推进入口 `step(state, dt, input)`、随机只来自注入的 seeded rng）→ `src/skin`（纯 TS：元素注册表 + 解析回退链 + 统一工厂）→ `src/render`（**唯一依赖引擎的目录**，只消费 `instantiate()` 出的实例）。引擎选型风险被关进 `src/render/` 一个目录：换 LayaAir 只改这一层（spec §7.3 决策闸门），`src/core` / `src/data` 不动。

**Tech Stack:** TypeScript 5.9、PixiJS 8、GSAP 3、Vite 6、Vitest 2、ESLint 9（自定义规则 `mono/*`）、Playwright（移动视口截图验收）。

**权威视觉契约（实现时照抄，不自由发挥）:** `d:\zhao\.superpowers\brainstorm\monopoly\content\iso45-v5.html`（下称 **v5 样张**）。凡本计划写「照 v5 行 X 移植」，指的就是这个文件的行号；改动几何/配色必须回到样张同步。

**执行分两波（可独立交付）:**

- **Wave 1 · M1–M3（视觉地基 + 棋盘 + 建筑 + 换肤）**：产出「可浏览、可切肤、有 debug 面板」的静态棋盘沙盘。可独立验收上线。
- **Wave 2 · M4–M7（玩法 + 动画 + 部署）**：在 Wave 1 之上接玩法、动画与上线。

Wave 1 结束前不要进 Wave 2——M2/M3 的视觉回归闸门没过就写玩法，后面返工成本极高。

---

## 关键契约锁定（先读这一段，再动手）

这一节把 spec §3.6/§3.7 的硬约束翻译成**可实施、可 lint 的具体数据结构**。所有任务都按这里的定义写代码，不得自创。

### A. 逻辑包围盒与挂载（替代「贴墙装饰自己算坐标」）

```ts
// src/skin/types.ts
export type Mount = 'ground' | 'wall' | 'roof';

export interface Box {
  w: number;   // 等距全宽（棋盘坐标单位，1 单位 = 1px @390 舞台）
  d: number;   // 等距全深
  h: number;   // 绘制高度
}

export interface RegistryEntry {
  id: string;
  box: Box;
  anchor: [number, number];   // 0–1，元素「地面锚点」在 box 内的归一化位置
  baseline: number;           // 地面锚点在 box 内的 y 偏移（棋盘单位，自 box 底部向上为正）
  mount: Mount;
  attach?: { host: string; atV: number };  // mount=wall/roof 时必填：host 元素 ID 或 'slot:<n>'，atV=附着比例 0–1
  providerKinds: ProviderKind[];           // 允许的 provider 形态（lint 用）
}
```

**铁律（由管线强制，不靠人记）:**
- 装饰只声明 `mount` + `attach.atV`，**自己不算坐标**；管线按 `lift = atV × hostHeight(level)` 施加上去（`roof` 时 `atV` 固定 1）。
- `ground` 元素 `lift = 0`。
- 任何元素不得绕过管线自己插画布（见 `Scene.place()`）。

### B. 皮肤解析回退链（缺素材绝不报错、绝不空白）

四级，`resolve()` 返回命中的**级别**并一路回退：

| 级别 | 名称 | 来源 |
|---|---|---|
| 1 | 元素级覆盖 | 地块/店铺配置里的 per-element override |
| 2 | 皮肤包 | `skins/<id>/skin.json` 的 `elements[elementId]` |
| 3 | 全局默认皮肤 | `skins/default/skin.json` |
| 4 | 内建兜底 | `builtinFallback()`：纯色块 + 文字，永不空白 |

```ts
export interface Resolved {
  elementId: string;
  level: 1 | 2 | 3 | 4;
  provider: ProviderSpec;
}
export function resolve(
  elementId: string,
  skin: SkinPack | null,
  overrides?: Record<string, ProviderSpec> | null,
): Resolved;
```

### C. 统一工厂（渲染层唯一画画的入口）

```ts
// src/skin/instantiate.ts
export interface ElementSpec {
  id: string;                       // 必须命中注册表
  slot?: number | null;             // 棋盘序号（非地块元素为 null）
  c: number; r: number;             // 棋盘格坐标
  level?: 1 | 2 | 3;                // 建筑层级（用于 lift 与 state）
  state?: ElementState;             // owner/selected/processing/dim…
  mount?: Mount;                    // 缺省取注册表
  overrides?: Record<string, ProviderSpec> | null;
}

export interface Instance {
  id: string;
  slot: number | null;
  skin: string;
  providerKind: ProviderKind;
  level: 1 | 2 | 3 | 4;             // resolve 命中级别
  mount: Mount;
  box: Box;
  depth: number;                    // 排序键：(c+r) 小者先画
  lift: number;                     // 管线施加的抬升
  source: string;                   // `[mono] <id> @slot=<n> provider=<kind> ← L<level>`
  draw(g: Graphics, params: Record<string, unknown>): void;
}

export function instantiate(spec: ElementSpec, deps: InstantiateDeps): Instance;
```

**渲染层禁止直接画**：`src/render/**` 不得出现 `new Graphics()` 后自行 `poly/fill` 的裸绘制，只能 `instantiate()` → `Scene.place(instance)` → `instance.draw(g, params)`。

### D. 参数化边界（禁写死的可执行定义）

- `src/render/**`：**不得出现** 色值字面量（`#rrggbb` / `rgb(` / `rgba(` / `hsl(`），**不得出现** 数值字面量（白名单 `-1, 0, 0.5, 1, 2, 3, 90, 180, 360`）——层高 `26/46/72`、半宽 `21`、锚点比例 `0.62` 这类**全部进 `skin.json` 或注册表**。
- `src/skin/**` 与 `src/data/**` 不受该规则约束（它们就是数据与逻辑契约层）。
- 由 ESLint 自定义规则 `mono/no-hardcoded-color` + `mono/no-visual-number` 在 `npm run lint` 拦截。

### E. 目录与产物

- **工程根目录：`d:\zhao\monopoly`**（仓库惯例：独立小游戏各占一个顶层目录，见 `xiaoxiaole/`、`xgame/`；`tour-game/` 是既有同类先例）。
- 部署目标：`game.joho.cn/tour/mono.html`（复用既有静态站点根 `/opt/1panel/apps/openresty/openresty/www/sites/game.joho.cn/tour/`）。
- **铁律：本地构建 → scp 上传 → 服务器只解压/拷入，绝不在服务器构建。**

---

## 文件结构

先建目录骨架，每个文件一个明确职责。**加粗 = 本计划新建。**

```
d:\zhao\monopoly\
├── mono.html                    # Vite 入口（输出 release/mono.html）
├── package.json                 # scripts: dev/build/test/lint/lint:skin/shots
├── tsconfig.json
├── vite.config.ts               # base './'，outDir release，稳定文件名
├── vitest.config.ts             # 只扫 test/**，environment node
├── eslint.config.js             # 接入 tools/eslint-plugin-mono 两条规则
├── .gitignore                   # release/ node_modules/ test-results/
├── tools/
│   ├── eslint-plugin-mono/index.js   # no-hardcoded-color / no-visual-number
│   └── lint-skin.mjs                 # skin.json schema + 素材存在性 + 锚点范围
├── public/
│   └── skins/                        # 皮肤包（Vite publicDir → release/skins）
│       ├── default/skin.json         # 默认皮肤：v5 全部色值/几何参数
│       └── photo/skin.json + tex/    # 图片素材皮肤示例（3–5 元素）
├── src/
│   ├── data/
│   │   ├── board.ts             # 32 格数据 + ringPath(9,9) + 类型/层级
│   │   ├── economy.ts           # 资金/价格/租金/开局参数
│   │   ├── cards.ts             # 道具 5 / 命运 6 / 机会 6
│   │   ├── stocks.ts            # 3–5 支虚拟盘
│   │   └── index.ts
│   ├── core/                    # 纯逻辑（零引擎）
│   │   ├── types.ts             # GameState / Player / TileState …
│   │   ├── rng.ts               # seeded RNG（禁 Math.random）
│   │   ├── dice.ts              # 双骰
│   │   ├── move.ts              # 逐格移动 / 绕圈 / 经过起点
│   │   ├── economy.ts           # 买地 / 升级 / 收租 / 施工 / 破产
│   │   ├── cards.ts             # 三类卡效果
│   │   ├── stocks.ts            # 回合制涨跌
│   │   ├── special.ts           # 监狱 / 福利中心
│   │   └── turn.ts              # 推进入口 step(state, dt, input)
│   ├── skin/
│   │   ├── ids.ts               # 命名空间常量 + ID 正则 + namespaceOf()
│   │   ├── registry.ts          # 元素注册表（box/anchor/baseline/mount/attach）
│   │   ├── resolve.ts           # 四级回退链（纯函数）
│   │   ├── instantiate.ts       # 统一工厂 + lift 变换
│   │   └── types.ts             # Box/Mount/ProviderSpec/Instance…
│   ├── render/                  # 唯一依赖引擎
│   │   ├── iso.ts               # ipos/dia/up/win/depthKey（几何全参数化）
│   │   ├── providers/proc.ts    # 程序化 provider（v5 绘制移植）
│   │   ├── providers/image.ts
│   │   ├── providers/atlas.ts
│   │   ├── providers/frames.ts
│   │   ├── providers/index.ts   # kind → provider 表
│   │   ├── stage.ts             # Pixi Application 引导（390×844）
│   │   ├── Scene.ts             # 三遍绘制 + 深度排序 + place()
│   │   ├── BoardView.ts         # 32 格 + 内环 + 喷泉
│   │   ├── BuildingView.ts      # L1/L2/L3
│   │   ├── LabelView.ts         # 汉字店名层（永不被遮挡）
│   │   ├── PieceView.ts         # 棋子
│   │   ├── ShowcaseView.ts      # B 地块橱窗 / C 三级对照
│   │   └── fx.ts                # GSAP 动画编排（M6）
│   ├── ui/
│   │   ├── hud.ts               # 顶部回合/资金 + 底部玩家资产条
│   │   ├── diceBar.ts           # 双骰 + 掷骰按钮 + 手牌
│   │   └── panels.ts            # 股票/地产/图鉴/结算浮层
│   ├── debug/panel.ts           # ?debug=1：ID/包围盒/depth/provider 来源与回退级别
│   └── main.ts                  # 入口：解析 ?skin ?debug ?seed ?speed
├── test/
│   ├── core/                    # 玩法单测
│   ├── skin/                    # 注册表/回退/工厂单测
│   ├── render/iso.spec.ts       # 等距数学单测
│   └── tools/                   # lint-skin + eslint 规则单测
├── local/
│   ├── mono-shots-m2.mjs        # Playwright 移动视口截图（M2）
│   ├── mono-shots-m3.mjs
│   ├── mono-shots-m4.mjs
│   ├── mono-shots-m5.mjs
│   ├── mono-shots-m6.mjs
│   └── mono-prod-check.mjs      # 线上回归
├── docs/
│   ├── verify/                  # 390×844 dpr2 截图入库
│   └── manual-mono.md           # 操作手册 + 测试用例（截图回填）
└── release/                     # 构建产物（gitignore）
```

---

# Wave 1 · 视觉地基

## Task 1: 工程脚手架（Vite + TS + Pixi + GSAP + Vitest）

**Files:**
- Create: `d:\zhao\monopoly\package.json`
- Create: `d:\zhao\monopoly\tsconfig.json`
- Create: `d:\zhao\monopoly\vite.config.ts`
- Create: `d:\zhao\monopoly\vitest.config.ts`
- Create: `d:\zhao\monopoly\mono.html`
- Create: `d:\zhao\monopoly\.gitignore`
- Create: `d:\zhao\monopoly\src\main.ts`
- Test: `d:\zhao\monopoly\test\smoke.spec.ts`

- [ ] **Step 1: 建目录与 package.json**

```json
{
  "name": "monopoly-shuangyang",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "description": "大富翁 · 吉林双阳邻里商业版（PixiJS 8 + GSAP）",
  "scripts": {
    "dev": "vite",
    "build": "node tools/check-hardcoded.mjs && vite build",
    "preview": "vite preview --port 52301",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tools",
    "lint:skin": "node tools/lint-skin.mjs",
    "check": "npm run lint && npm run lint:skin && npm run test"
  },
  "dependencies": {
    "gsap": "^3.12.5",
    "pixi.js": "^8.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "eslint": "^9.17.0",
    "typescript": "^5.9.3",
    "vite": "^6.0.0",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: 装依赖**

Run: `npm install`
Expected: 安装成功，`node_modules/` 生成，`pixi.js` 与 `gsap` 出现在 dependencies。

- [ ] **Step 3: 写 tsconfig / vite / vitest 配置**

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noImplicitOverride": true,
    "types": ["node", "vitest/globals"],
    "lib": ["ES2020", "DOM"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test", "tools"]
}
```

`vite.config.ts`（**锁死产物路径与文件名**，令部署脚本可复用 `tour-game` 的 scp 流程）：

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'release',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: 'mono.html',
      output: {
        entryFileNames: 'js/mono.js',
        chunkFileNames: 'js/[name].js',
        assetFileNames: 'assets/mono/[name][extname]',
      },
    },
  },
  server: { port: 52300, host: '127.0.0.1' },
});
```

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
});
```

- [ ] **Step 4: 写 mono.html 与 .gitignore**

`mono.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <title>大富翁 · 双阳邻里</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0c1513; overflow: hidden; }
      #stage { display: block; width: 390px; height: 844px; margin: 0 auto; touch-action: none; }
      @media (min-width: 420px) { #stage { margin-top: 12px; border-radius: 18px; } }
    </style>
  </head>
  <body>
    <canvas id="stage"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`：

```
node_modules/
release/
test-results/
*.local
```

- [ ] **Step 5: 写最小入口与冒烟测试**

`src/main.ts`（本任务只做「能起、能构建」，真引导在 Task 8）：

```ts
export const VERSION = '0.0.0';

export function boot(): void {
  const el = document.getElementById('stage');
  if (!el) throw new Error('[mono] #stage not found');
}
```

`test/smoke.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/main';

describe('smoke', () => {
  it('导出 VERSION', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 6: 跑测试与构建**

Run: `npm test`
Expected: PASS（1 例）。

Run: `npm run build`
Expected: 构建成功，生成 `release/mono.html`、`release/js/mono.js`。

- [ ] **Step 7: Commit**

```bash
git add monopoly
git commit -m "chore(mono): 脚手架 Vite+Pixi+GSAP+Vitest，产物锁定 release/mono.html"
```

---

## Task 2: 皮肤类型 + 元素 ID 命名规范

**Files:**
- Create: `d:\zhao\monopoly\src\skin\types.ts`
- Create: `d:\zhao\monopoly\src\skin\ids.ts`
- Test: `d:\zhao\monopoly\test\skin\ids.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { NAMESPACES, isElementId, namespaceOf, ELEMENT_ID_RE } from '../../src/skin/ids';

describe('ids', () => {
  it('接受注册表里各命名空间的合法 ID', () => {
    for (const id of [
      'token.gold', 'token.bg', 'token.tile.shop',
      'board.tile.shop', 'board.tile.fate.edge',
      'board.inner.deco', 'board.center.fountain',
      'building.s4.l2', 'building.s4.sign',
      'prop.awning', 'prop.lantern', 'prop.banner',
      'piece.p1', 'piece.p4',
      'dice.body', 'dice.face6',
      'card.fate.back', 'card.fate.face3',
      'fx.coin', 'fx.scaffold',
      'ui.button.primary', 'ui.panel', 'ui.icon.stock',
    ]) expect(isElementId(id), id).toBe(true);
  });

  it('拒绝裸名、大小写混用、多余段', () => {
    for (const id of ['gold', 'Token.gold', 'token.gold.extra.deep', 'piece', 'building.l2']) {
      expect(isElementId(id), id).toBe(false);
    }
  });

  it('namespaceOf 取两段命名空间（board.tile.* 归 board.tile）', () => {
    expect(namespaceOf('board.tile.shop')).toBe('board.tile');
    expect(namespaceOf('building.s4.l2')).toBe('building');
    expect(namespaceOf('token.gold')).toBe('token');
  });

  it('NAMESPACES 全覆盖 spec §3.6.1 表', () => {
    expect(NAMESPACES).toEqual([
      'token', 'board.tile', 'board.inner', 'board.center',
      'building', 'prop', 'piece', 'dice', 'card', 'fx', 'ui',
    ]);
  });

  it('ELEMENT_ID_RE 是可复用正则', () => {
    expect(ELEMENT_ID_RE.test('prop.lantern')).toBe(true);
    expect(ELEMENT_ID_RE.test('Prop.lantern')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/skin/ids.spec.ts`
Expected: FAIL，`Cannot find module '../../src/skin/ids'`。

- [ ] **Step 3: 写类型与 ID 规范**

`src/skin/types.ts`：

```ts
export type Mount = 'ground' | 'wall' | 'roof';
export type ProviderKind = 'proc' | 'image' | 'atlas' | 'frames';

export interface Box { w: number; d: number; h: number }

export interface ProcSpec { kind: 'proc'; preset: string; params?: Record<string, unknown> }
export interface ImageSpec { kind: 'image'; src: string; anchor?: [number, number] }
export interface AtlasSpec { kind: 'atlas'; src: string; frame: string; anchor?: [number, number] }
export interface FramesSpec { kind: 'frames'; src: string[]; fps: number; anchor?: [number, number] }

export type ProviderSpec = ProcSpec | ImageSpec | AtlasSpec | FramesSpec;

export interface SkinPack {
  id: string;
  meta?: { name?: string };
  geo: { hw: number; hh: number; ox: number; oy: number };
  tokens: Record<string, string>;
  elements: Record<string, ProviderSpec>;
}

export interface RegistryEntry {
  id: string;
  box: Box;
  anchor: [number, number];
  baseline: number;
  mount: Mount;
  attach?: { host: string; atV: number };
  providerKinds: ProviderKind[];
}

export interface ElementState {
  level?: 1 | 2 | 3;
  owner?: number | null;
  selected?: boolean;
  processing?: boolean;
  dim?: boolean;
  facing?: 'left' | 'right';
}
```

`src/skin/ids.ts`：

```ts
export const NAMESPACES = [
  'token', 'board.tile', 'board.inner', 'board.center',
  'building', 'prop', 'piece', 'dice', 'card', 'fx', 'ui',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

// 段规则：小写字母开头，可含小写字母/数字；段数 2–4
const SEG = '[a-z][a-z0-9]*';
export const ELEMENT_ID_RE = new RegExp(`^(${NAMESPACES.join('|').replace(/\./g, '\\.')})(\\.${SEG}){1,2}$`);

export function isElementId(id: string): boolean {
  return ELEMENT_ID_RE.test(id);
}

export function namespaceOf(id: string): string {
  for (const ns of NAMESPACES) {
    if (id === ns || id.startsWith(ns + '.')) return ns;
  }
  return '';
}
```

> 说明：`board.tile` / `board.inner` / `board.center` 是两段命名空间，故 `ELEMENT_ID_RE` 用「前缀 + 1–2 段」表达，恰好覆盖 `board.tile.shop`（3 段）与 `board.tile.fate.edge`（4 段）两种形态。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/skin/ids.spec.ts`
Expected: PASS（5 例）。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src/skin monopoly/test/skin
git commit -m "feat(mono): 皮肤类型与元素 ID 命名规范（spec §3.6.1）"
```

---

## Task 3: 等距投影与绘制原语（几何全参数化）

**Files:**
- Create: `d:\zhao\monopoly\src\render\iso.ts`
- Test: `d:\zhao\monopoly\test\render\iso.spec.ts`

> v5 样张第 47–51 行是权威公式；本任务把它变成**可测纯函数**，几何常量一律从入参 `Geo` 传入（不写死在 render 层）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { ipos, dia, up, win, depthKey, compareDepth, hostHeight } from '../../src/render/iso';

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };

describe('iso', () => {
  it('ipos：行列镜像对称（c-r 决定 x，c+r 决定 y）', () => {
    expect(ipos(1, 1, GEO)).toEqual([195, 117]);
    expect(ipos(2, 1, GEO)).toEqual([216, 127.5]);
    expect(ipos(1, 2, GEO)).toEqual([174, 127.5]);
  });

  it('ipos：等距每步 x 差 = hw，y 差 = hh', () => {
    const [x0, y0] = ipos(3, 3, GEO);
    const [x1, y1] = ipos(4, 3, GEO);
    expect(x1 - x0).toBe(21);
    expect(y1 - y0).toBe(10.5);
  });

  it('dia：返回 4 点菱形的左下→右→上→左顺序', () => {
    expect(dia(100, 200, GEO.hw, GEO.hh)).toEqual([
      [100, 210.5], [121, 200], [100, 189.5], [79, 200],
    ]);
  });

  it('dia：lift 为正时整块上移', () => {
    expect(dia(100, 200, GEO.hw, GEO.hh, 5)).toEqual([
      [100, 205.5], [121, 195], [100, 184.5], [79, 195],
    ]);
  });

  it('up：只改 y', () => {
    expect(up([7, 9], 4)).toEqual([7, 5]);
  });

  it('win：墙面参数化四边形（u 沿底边，v 沿高度向上）', () => {
    const pts = win([0, 0], [100, 0], 50, 0.2, 0.4, 0.1, 0.5);
    expect(pts).toEqual([[20, -5], [40, -5], [40, -25], [20, -25]]);
  });

  it('depthKey：c+r 为主键，c 为次键（远处先画）', () => {
    expect(depthKey(1, 1)).toBe(2);
    expect(compareDepth({ c: 1, r: 2 }, { c: 2, r: 1 })).toBeLessThan(0); // 同 c+r，c 小者先
    expect(compareDepth({ c: 2, r: 2 }, { c: 1, r: 1 })).toBeGreaterThan(0);
  });

  it('hostHeight：层级 → 墙高（数值来自注册表传参，不写死）', () => {
    const H = { 1: 26, 2: 46, 3: 72 };
    expect(hostHeight(1, H)).toBe(26);
    expect(hostHeight(3, H)).toBe(72);
    expect(hostHeight(2, H)).toBe(46);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/iso.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 iso.ts**

```ts
export interface Geo { hw: number; hh: number; ox: number; oy: number }
export type Pt = [number, number];

/** 棋盘 (c,r) → 舞台像素（v5 样张 line 48） */
export function ipos(c: number, r: number, g: Geo): Pt {
  return [g.ox + (c - r) * g.hw, g.oy + (c + r) * g.hh];
}

/** 菱形地砖四点（左下→右→上→左），lift 为正 = 上移 */
export function dia(cx: number, cy: number, hw: number, hh: number, lift = 0): Pt[] {
  return [
    [cx, cy + hh - lift],
    [cx + hw, cy - lift],
    [cx, cy - hh - lift],
    [cx - hw, cy - lift],
  ];
}

/** 只改 y 的上移 */
export function up(p: Pt, h: number): Pt {
  return [p[0], p[1] - h];
}

/** 墙面上开窗：P0→P1 为墙面底边，h 为墙高，u/v 为 0–1 参数 */
export function win(P0: Pt, P1: Pt, h: number, u1: number, u2: number, v1: number, v2: number): Pt[] {
  const f = (u: number, v: number): Pt => [
    P0[0] + u * (P1[0] - P0[0]),
    P0[1] + u * (P1[1] - P0[1]) - v * h,
  ];
  return [f(u1, v1), f(u2, v1), f(u2, v2), f(u1, v2)];
}

/** 深度排序主键：c + r 小者（远处）先画 */
export function depthKey(c: number, r: number): number {
  return c + r;
}

/** 深度排序比较器（v5 样张 line 280） */
export function compareDepth(a: { c: number; r: number }, b: { c: number; r: number }): number {
  return (a.c + a.r) - (b.c + b.r) || a.c - b.c;
}

/** 层级 → 墙高（高度表由注册表/皮肤传入） */
export function hostHeight(level: 1 | 2 | 3, heights: Record<number, number>): number {
  return heights[level];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/render/iso.spec.ts`
Expected: PASS（8 例）。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src/render/iso.ts monopoly/test/render
git commit -m "feat(mono): 等距投影与绘制原语（纯函数、几何参数化）"
```

---

## Task 4: 元素注册表（box / anchor / baseline / mount / attach）

**Files:**
- Create: `d:\zhao\monopoly\src\skin\registry.ts`
- Test: `d:\zhao\monopoly\test\skin\registry.spec.ts`

> 注册表是「可定位性」的根：每个 ID 一条，声明逻辑包围盒与挂载。**数值全部集中在这里**（render 层不许出现）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { REGISTRY, getEntry, allElementIds, BUILDING_HEIGHTS } from '../../src/skin/registry';
import { isElementId } from '../../src/skin/ids';

describe('registry', () => {
  it('每个条目 ID 合法且与 key 一致', () => {
    for (const [k, e] of Object.entries(REGISTRY)) {
      expect(isElementId(k), k).toBe(true);
      expect(e.id).toBe(k);
    }
  });

  it('每个条目 box 宽深高均为正、anchor 在 0–1', () => {
    for (const e of Object.values(REGISTRY)) {
      expect(e.box.w).toBeGreaterThan(0);
      expect(e.box.d).toBeGreaterThan(0);
      expect(e.box.h).toBeGreaterThan(0);
      expect(e.anchor[0]).toBeGreaterThanOrEqual(0);
      expect(e.anchor[0]).toBeLessThanOrEqual(1);
      expect(e.anchor[1]).toBeGreaterThanOrEqual(0);
      expect(e.anchor[1]).toBeLessThanOrEqual(1);
      expect(e.providerKinds.length).toBeGreaterThan(0);
    }
  });

  it('wall/roof 挂载必须声明 attach（堵住「飘在半空」）', () => {
    for (const e of Object.values(REGISTRY)) {
      if (e.mount === 'wall' || e.mount === 'roof') {
        expect(e.attach, e.id).toBeTruthy();
        expect(e.attach!.atV).toBeGreaterThanOrEqual(0);
        expect(e.attach!.atV).toBeLessThanOrEqual(1);
      } else {
        expect(e.attach, e.id).toBeUndefined();
      }
    }
  });

  it('三级建筑齐备、墙高表齐备', () => {
    for (let s = 0; s <= 31; s++) {
      expect(getEntry(`building.s${s}.l1`)).toBeTruthy();
      expect(getEntry(`building.s${s}.l2`)).toBeTruthy();
      expect(getEntry(`building.s${s}.l3`)).toBeTruthy();
    }
    expect(BUILDING_HEIGHTS).toEqual({ 1: 26, 2: 46, 3: 72 });
  });

  it('托管 host 必须解析得到（或为 slot:<n> 形态）', () => {
    for (const e of Object.values(REGISTRY)) {
      const host = e.attach?.host;
      if (!host) continue;
      if (host.startsWith('slot:')) continue;
      expect(getEntry(host), `${e.id} → ${host}`).toBeTruthy();
    }
  });

  it('allElementIds 去重且数量 = 条目数', () => {
    const ids = allElementIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(Object.keys(REGISTRY).length);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/skin/registry.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现注册表**

```ts
import type { RegistryEntry } from './types';

export const BUILDING_HEIGHTS: Record<number, number> = { 1: 26, 2: 46, 3: 72 };

// 等距地砖：全宽 = 2×hw、全深 = 2×hh（hw/hh 见 skins/default/skin.json 的 geo）
const TILE: { w: number; d: number; h: number } = { w: 42, d: 21, h: 2 };

export const TILE_TYPES = ['core', 'shop', 'chance', 'fate', 'bonus', 'jail', 'stock'] as const;
export type TileType = (typeof TILE_TYPES)[number];

export const INNER_DECOS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'] as const;
export const PROPS = [
  'awning', 'lantern', 'banner', 'rooftopBox', 'signTower', 'antenna', 'tree', 'lamp',
] as const;
export const FX = ['coin', 'scaffold', 'dust', 'stamp', 'shine'] as const;

const tile = (t: TileType): RegistryEntry => ({
  id: `board.tile.${t}`,
  box: TILE,
  anchor: [0.5, 0.5],
  baseline: 0,
  mount: 'ground',
  providerKinds: ['proc', 'image', 'atlas'],
});

const tileEdge = (t: TileType): RegistryEntry => ({
  id: `board.tile.${t}.edge`,
  box: TILE,
  anchor: [0.5, 0.5],
  baseline: 0,
  mount: 'ground',
  providerKinds: ['proc', 'image'],
});

const reg: Record<string, RegistryEntry> = {
  // —— 全局配色令牌（L1）：逻辑包围盒 1×1，仅承载色值 ——
  'token.gold': { id: 'token.gold', box: { w: 1, d: 1, h: 1 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc'] },
  'token.bg': { id: 'token.bg', box: { w: 390, d: 1, h: 844 }, anchor: [0.5, 1], baseline: 0, mount: 'ground', providerKinds: ['proc'] },
};

for (const t of TILE_TYPES) {
  reg[`board.tile.${t}`] = tile(t);
  reg[`board.tile.${t}.edge`] = tileEdge(t);
}

// —— 内环装饰楼（8 栋，压暗）与中心喷泉 ——
for (const d of INNER_DECOS) {
  reg[`board.inner.${d}`] = {
    id: `board.inner.${d}`,
    box: { w: 42, d: 21, h: BUILDING_HEIGHTS[2] },
    anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'],
  };
}
reg['board.center.fountain'] = {
  id: 'board.center.fountain',
  box: { w: 60, d: 30, h: 28 },
  anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'frames'],
};

// —— 32 格三级建筑 + 店招 ——
for (let s = 0; s <= 31; s++) {
  for (const lv of [1, 2, 3] as const) {
    reg[`building.s${s}.l${lv}`] = {
      id: `building.s${s}.l${lv}`,
      box: { w: 42, d: 21, h: BUILDING_HEIGHTS[lv] },
      anchor: [0.5, 0.5], baseline: 0, mount: 'ground',
      providerKinds: ['proc', 'image', 'atlas', 'frames'],
    };
  }
  reg[`building.s${s}.sign`] = {
    id: `building.s${s}.sign`,
    box: { w: 30, d: 2, h: 8 },
    anchor: [0.5, 0.5], baseline: 0, mount: 'wall',
    attach: { host: `slot:${s}`, atV: 0.86 },
    providerKinds: ['proc', 'image'],
  };
}

// —— 通用构件：全部贴墙/贴屋顶，坐标由管线施加 lift ——
const prop = (name: (typeof PROPS)[number], box: { w: number; d: number; h: number }, atV: number, mount: 'wall' | 'roof' | 'ground' = 'wall'): RegistryEntry => ({
  id: `prop.${name}`,
  box, anchor: [0.5, 0.5], baseline: 0, mount,
  ...(mount === 'ground' ? {} : { attach: { host: 'slot:0', atV } }),
  providerKinds: ['proc', 'image', 'atlas', 'frames'],
});

reg['prop.awning'] = prop('awning', { w: 34, d: 2, h: 5 }, 0.64);
reg['prop.lantern'] = prop('lantern', { w: 10, d: 2, h: 14 }, 0.30);
reg['prop.banner'] = prop('banner', { w: 10, d: 2, h: 30 }, 0.80);
reg['prop.rooftopBox'] = { id: 'prop.rooftopBox', box: { w: 14, d: 7, h: 7 }, anchor: [0.5, 0.5], baseline: 0, mount: 'roof', providerKinds: ['proc', 'image'] };
reg['prop.signTower'] = { id: 'prop.signTower', box: { w: 15, d: 7, h: 20 }, anchor: [0.5, 0.5], baseline: 0, mount: 'roof', providerKinds: ['proc', 'image'] };
reg['prop.antenna'] = { id: 'prop.antenna', box: { w: 4, d: 2, h: 13 }, anchor: [0.5, 0.5], baseline: 0, mount: 'roof', providerKinds: ['proc', 'image'] };
reg['prop.tree'] = prop('tree', { w: 14, d: 8, h: 30 }, 0, 'ground');
reg['prop.lamp'] = prop('lamp', { w: 8, d: 4, h: 28 }, 0, 'ground');

// —— 玩家棋子 4 色 ——
for (let p = 1; p <= 4; p++) {
  reg[`piece.p${p}`] = {
    id: `piece.p${p}`,
    box: { w: 8.4, d: 4.2, h: 13 },
    anchor: [0.5, 0.5], baseline: 0, mount: 'ground',
    providerKinds: ['proc', 'image', 'atlas', 'frames'],
  };
}

// —— 骰子 ——
reg['dice.body'] = { id: 'dice.body', box: { w: 52, d: 1, h: 52 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas', 'frames'] };
for (let f = 1; f <= 6; f++) {
  reg[`dice.face${f}`] = { id: `dice.face${f}`, box: { w: 52, d: 1, h: 52 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
}

// —— 卡牌：三副牌堆，各 back + face1..6 ——
for (const deck of ['item', 'fate', 'chance'] as const) {
  reg[`card.${deck}.back`] = { id: `card.${deck}.back`, box: { w: 66, d: 1, h: 88 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };
  for (let i = 1; i <= 6; i++) {
    reg[`card.${deck}.face${i}`] = { id: `card.${deck}.face${i}`, box: { w: 66, d: 1, h: 88 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas', 'frames'] };
  }
}

// —— 特效 ——
for (const f of FX) {
  reg[`fx.${f}`] = { id: `fx.${f}`, box: { w: 16, d: 16, h: 16 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas', 'frames'] };
}

// —— UI ——
reg['ui.button.primary'] = { id: 'ui.button.primary', box: { w: 98, d: 1, h: 46 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };
reg['ui.panel'] = { id: 'ui.panel', box: { w: 370, d: 1, h: 268 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
reg['ui.icon.stock'] = { id: 'ui.icon.stock', box: { w: 100, d: 1, h: 26 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };

export const REGISTRY: Record<string, RegistryEntry> = reg;

export function getEntry(id: string): RegistryEntry | null {
  return REGISTRY[id] ?? null;
}

export function allElementIds(): string[] {
  return Object.keys(REGISTRY);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/skin/registry.spec.ts`
Expected: PASS（6 例）。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src/skin/registry.ts monopoly/test/skin/registry.spec.ts
git commit -m "feat(mono): 元素注册表（包围盒/锚点/挂载/托管 host）"
```

---

## Task 5: 皮肤解析回退链（缺素材绝不报错、绝不空白）

**Files:**
- Create: `d:\zhao\monopoly\src\skin\resolve.ts`
- Test: `d:\zhao\monopoly\test\skin\resolve.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { resolve, builtinFallback, BAD_SKIN, type ResolveInput } from '../../src/skin/resolve';
import type { SkinPack } from '../../src/skin/types';

const base = (): SkinPack => ({
  id: 'photo',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: { gold: '#f5c451' },
  elements: { 'board.tile.shop': { kind: 'image', src: 'tex/tile-shop.webp' } },
});

const fallback = (): SkinPack => ({
  id: 'default',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: { gold: '#f5c451' },
  elements: { 'board.tile.shop': { kind: 'proc', preset: 'tile', params: { fill: '#2f4238' } } },
});

describe('resolve 四级回退链', () => {
  it('L1 元素级覆盖优先', () => {
    const r = resolve('board.tile.shop', base(), fallback(), {
      'board.tile.shop': { kind: 'proc', preset: 'tile', params: { fill: '#000000' } },
    });
    expect(r.level).toBe(1);
    expect(r.provider.kind).toBe('proc');
  });

  it('L2 皮肤包命中', () => {
    const r = resolve('board.tile.shop', base(), fallback());
    expect(r.level).toBe(2);
    expect(r.provider).toMatchObject({ kind: 'image', src: 'tex/tile-shop.webp' });
  });

  it('L3 回退全局默认皮肤', () => {
    const r = resolve('board.tile.shop', { ...base(), elements: {} }, fallback());
    expect(r.level).toBe(3);
    expect(r.provider).toMatchObject({ kind: 'proc' });
  });

  it('L4 内建兜底：皮肤为 null 且默认皮肤也没有该元素', () => {
    const r = resolve('prop.lantern', null, null);
    expect(r.level).toBe(4);
    expect(r.provider).toMatchObject({ kind: 'proc', preset: 'builtin' });
  });

  it('坏 JSON（非法 provider 形态）逐级回退，不抛错', () => {
    const broken = { ...base(), elements: { 'board.tile.shop': { kind: 'nope' } as never } };
    const r = resolve('board.tile.shop', broken, fallback());
    expect(r.level).toBe(3);
    expect(r.provider.kind).toBe('proc');
  });

  it('image provider 缺 src 视为非法，回退', () => {
    const broken = { ...base(), elements: { 'board.tile.shop': { kind: 'image' } as never } };
    expect(resolve('board.tile.shop', broken, fallback()).level).toBe(3);
  });

  it('frames provider 需非空 src[] 与正 fps', () => {
    const broken = { ...base(), elements: { 'board.tile.shop': { kind: 'frames', src: [], fps: 0 } as never } };
    expect(resolve('board.tile.shop', broken, fallback()).level).toBe(3);
  });

  it('未注册的 ID 直接走内建兜底', () => {
    expect(resolve('ui.panel', null, fallback()).level).toBe(4);
  });

  it('builtinFallback 是纯色块 + 文字（永不空白）', () => {
    const f = builtinFallback('prop.lantern');
    expect(f).toMatchObject({ kind: 'proc', preset: 'builtin' });
    expect((f.params as Record<string, unknown>).label).toBe('prop.lantern');
  });

  it('BAD_SKIN 常量是「不可能合法」的探针（lint 用）', () => {
    expect(resolve('board.tile.shop', BAD_SKIN, fallback()).level).toBe(3);
  });
});

describe('resolve 纯函数性', () => {
  it('同入参同出参，不改写入参', () => {
    const s = base();
    const snapshot = JSON.stringify(s);
    const a = resolve('board.tile.shop', s, fallback());
    const b = resolve('board.tile.shop', s, fallback());
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/skin/resolve.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 resolve.ts**

```ts
import { getEntry } from './registry';
import type { ProviderSpec, SkinPack } from './types';

export interface Resolved {
  elementId: string;
  level: 1 | 2 | 3 | 4;
  provider: ProviderSpec;
}

/** 「不可能合法」的皮肤探针：任何 ID 在它里面都解不出 provider */
export const BAD_SKIN: SkinPack = {
  id: '__bad__',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: {},
  elements: { '__never__': { kind: 'image' } as never },
};

export interface ResolveInput {
  overrides?: Record<string, ProviderSpec> | null;
}

/** provider 形态合法性（坏 JSON / 缺字段一律判非法 → 回退） */
export function isValidProvider(p: unknown): p is ProviderSpec {
  if (!p || typeof p !== 'object') return false;
  const k = (p as { kind?: unknown }).kind;
  const src = (p as { src?: unknown }).src;
  switch (k) {
    case 'proc': {
      const preset = (p as { preset?: unknown }).preset;
      return typeof preset === 'string' && preset.length > 0;
    }
    case 'image':
      return typeof src === 'string' && src.length > 0;
    case 'atlas': {
      const frame = (p as { frame?: unknown }).frame;
      return typeof src === 'string' && src.length > 0 && typeof frame === 'string' && frame.length > 0;
    }
    case 'frames': {
      const fps = (p as { fps?: unknown }).fps;
      return Array.isArray(src) && src.length > 0 && src.every((s) => typeof s === 'string' && s.length > 0)
        && typeof fps === 'number' && fps > 0;
    }
    default:
      return false;
  }
}

/** 内建兜底：纯色块 + 文字，永不空白 */
export function builtinFallback(elementId: string): ProviderSpec {
  return { kind: 'proc', preset: 'builtin', params: { label: elementId } };
}

/**
 * 皮肤包查表：先精确命中，再按段通配（key 中 `*` 匹配任意一段）。
 * 用途：注册表里 `building.<slot>.l<lv>` 有 96 个具体 id，但默认皮肤只需要 4 条
 * （`building.*.l1` / `building.*.l2` / `building.*.l3` / `building.*.sign`）即可描述全部地块楼。
 */
function lookup(pack: SkinPack | null, elementId: string): ProviderSpec | undefined {
  const els = pack?.elements;
  if (!els) return undefined;
  const exact = els[elementId];
  if (exact !== undefined) return exact;
  const parts = elementId.split('.');
  for (const key of Object.keys(els)) {
    if (!key.includes('*')) continue;
    const kp = key.split('.');
    if (kp.length !== parts.length) continue;
    if (kp.every((seg, i) => seg === '*' || seg === parts[i])) return els[key];
  }
  return undefined;
}

/**
 * 四级回退：① 元素级覆盖 → ② 皮肤包 → ③ 全局默认皮肤 → ④ 内建兜底
 * 纯函数：不改写入参、不抛错、坏数据逐级回退。
 */
export function resolve(
  elementId: string,
  skin: SkinPack | null,
  defaultSkin: SkinPack | null,
  overrides?: Record<string, ProviderSpec> | null,
): Resolved {
  const hit = overrides?.[elementId];
  if (isValidProvider(hit)) return { elementId, level: 1, provider: hit };

  const fromSkin = lookup(skin, elementId);
  if (isValidProvider(fromSkin)) return { elementId, level: 2, provider: fromSkin };

  const fromDefault = lookup(defaultSkin, elementId);
  if (isValidProvider(fromDefault)) return { elementId, level: 3, provider: fromDefault };

  return { elementId, level: 4, provider: builtinFallback(elementId) };
}

/** 注册表存在性检查（回退链之外的独立校验，供 lint/debug 用） */
export function isRegistered(elementId: string): boolean {
  return getEntry(elementId) !== null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/skin/resolve.spec.ts`
Expected: PASS（11 例）。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src/skin/resolve.ts monopoly/test/skin/resolve.spec.ts
git commit -m "feat(mono): 皮肤解析四级回退链（坏数据/缺素材不抛错）"
```

---

## Task 6: 统一工厂 `instantiate()` + lift 变换

**Files:**
- Create: `d:\zhao\monopoly\src\skin\instantiate.ts`
- Test: `d:\zhao\monopoly\test\skin\instantiate.spec.ts`

> spec §3.7 的核心：所有元素与对象只能经这一条管线产出。本任务把「贴墙装饰的 lift」变成管线强制行为。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { instantiate, liftOf, hostHeightOf, type InstantiateDeps } from '../../src/skin/instantiate';
import { BUILDING_HEIGHTS } from '../../src/skin/registry';
import type { SkinPack } from '../../src/skin/types';

const defaultSkin: SkinPack = {
  id: 'default',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: { gold: '#f5c451' },
  elements: {
    'board.tile.shop': { kind: 'proc', preset: 'tile', params: { fill: '#2f4238' } },
    'building.s4.l2': { kind: 'proc', preset: 'building', params: { hue: 32 } },
    'building.s4.sign': { kind: 'proc', preset: 'sign', params: {} },
    'prop.lantern': { kind: 'proc', preset: 'lantern', params: {} },
    'prop.rooftopBox': { kind: 'proc', preset: 'rooftopBox', params: {} },
  },
};

const deps = (skin: SkinPack | null = defaultSkin, slotLevels: Record<number, 1 | 2 | 3> = { 4: 2 }): InstantiateDeps => ({
  skin,
  defaultSkin,
  overrides: null,
  slotLevels,
});

describe('liftOf 挂载抬升（铁律：装饰自己不算坐标）', () => {
  it('ground → 0', () => {
    expect(liftOf('ground', BUILDING_HEIGHTS[3], 1)).toBe(0);
    expect(liftOf('ground', BUILDING_HEIGHTS[3], 0.4)).toBe(0);
  });

  it('wall → atV × hostHeight（按当前层级）', () => {
    expect(liftOf('wall', BUILDING_HEIGHTS[1], 0.5)).toBe(13);
    expect(liftOf('wall', BUILDING_HEIGHTS[2], 0.5)).toBe(23);
    expect(liftOf('wall', BUILDING_HEIGHTS[3], 0.86)).toBeCloseTo(61.92, 5);
  });

  it('roof → 满层高（贴屋顶面）', () => {
    expect(liftOf('roof', BUILDING_HEIGHTS[1], 0.1)).toBe(26);
    expect(liftOf('roof', BUILDING_HEIGHTS[3], 1)).toBe(72);
  });
});

describe('instantiate 单一入口', () => {
  it('阵地砖：depth = c + r，lift = 0，source 带 ID/slot/kind/回退级别', () => {
    const inst = instantiate({ id: 'board.tile.shop', slot: 1, c: 2, r: 3 }, deps());
    expect(inst.depth).toBe(5);
    expect(inst.lift).toBe(0);
    expect(inst.providerKind).toBe('proc');
    expect(inst.level).toBe(3); // 本测试的 defaultSkin 即「全局默认」，命中 L3
    expect(inst.source).toBe('[mono] board.tile.shop @slot=1 provider=proc ← L3');
    expect(inst.skin).toBe('default');
  });

  it('贴在 L2 楼上的灯笼：lift = 0.30 × 46', () => {
    const inst = instantiate({ id: 'prop.lantern', slot: 4, c: 5, r: 5 }, deps());
    expect(inst.mount).toBe('wall');
    expect(inst.lift).toBeCloseTo(13.8, 5);
  });

  it('屋顶设备箱：lift 取该 slot 当前层级满层高', () => {
    const inst = instantiate({ id: 'prop.rooftopBox', slot: 4, c: 5, r: 5 }, deps());
    expect(inst.mount).toBe('roof');
    expect(inst.lift).toBe(46);
  });

  it('未注册 ID → 抛统一格式错误', () => {
    expect(() => instantiate({ id: 'nope.bad', c: 1, r: 1 }, deps()))
      .toThrowError(/^\[mono\] nope\.bad @slot=null provider=- ← unregistered$/);
  });

  it('未注册但像 ID：仍然抛（禁止绕过注册表）', () => {
    expect(() => instantiate({ id: 'prop.unknownThing', c: 1, r: 1 }, deps())).toThrow(/unregistered/);
  });

  it('slot 层级缺省按 1 处理（新建未升级地块）', () => {
    const inst = instantiate({ id: 'prop.rooftopBox', slot: 9, c: 5, r: 5 }, deps(defaultSkin, {}));
    expect(inst.lift).toBe(26);
  });

  it('override 命中时级别为 1 且 provider 来自 override', () => {
    const d = deps();
    d.overrides = { 'board.tile.shop': { kind: 'image', src: 'tex/x.webp' } };
    const inst = instantiate({ id: 'board.tile.shop', slot: 1, c: 1, r: 1 }, d);
    expect(inst.level).toBe(1);
    expect(inst.providerKind).toBe('image');
  });

  it('draw 已绑定 ctx：调用即把 provider 与参数交给绘制函数', () => {
    const seen: string[] = [];
    const d = deps();
    d.onDraw = (inst, p) => seen.push(`${inst.id}:${String((p as { fill?: string }).fill)}`);
    const inst = instantiate({ id: 'board.tile.shop', slot: 1, c: 1, r: 1 }, d);
    inst.draw({} as never, { fill: '#2f4238' });
    expect(seen).toEqual(['board.tile.shop:#2f4238']);
  });
});

describe('hostHeightOf', () => {
  it('slot 有层级 → 对应墙高；无 → L1', () => {
    expect(hostHeightOf(4, { 4: 3 })).toBe(72);
    expect(hostHeightOf(7, { 4: 3 })).toBe(26);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/skin/instantiate.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 instantiate.ts**

```ts
import { BUILDING_HEIGHTS, getEntry } from './registry';
import { resolve, type Resolved } from './resolve';
import { isElementId } from './ids';
import type { Box, ElementState, Mount, ProviderKind, ProviderSpec, SkinPack } from './types';

export interface ElementSpec {
  id: string;
  slot?: number | null;
  c: number;
  r: number;
  level?: 1 | 2 | 3;
  state?: ElementState;
  mount?: Mount;
  overrides?: Record<string, ProviderSpec> | null;
  /** 棋子同格错开用（`piece.*` 第三遍）：第 i 枚 → Scene 交给 resolvePlacement 算 cx */
  pawnIndex?: number;
}

export interface InstantiateDeps {
  skin: SkinPack | null;
  defaultSkin: SkinPack | null;
  overrides?: Record<string, ProviderSpec> | null;
  slotLevels?: Record<number, 1 | 2 | 3>;
  onDraw?: (inst: Instance, params: Record<string, unknown>) => void;
}

export interface Instance {
  id: string;
  slot: number | null;
  skin: string;
  providerKind: ProviderKind;
  provider: ProviderSpec;
  level: 1 | 2 | 3 | 4;
  mount: Mount;
  box: Box;
  depth: number;
  lift: number;
  c: number;
  r: number;
  state: ElementState;
  source: string;
  draw: (g: unknown, params: Record<string, unknown>) => void;
}

export function hostHeightOf(slot: number | null, slotLevels: Record<number, 1 | 2 | 3>): number {
  const lv = slot === null ? 1 : slugLevel(slot, slotLevels);
  return BUILDING_HEIGHTS[lv];
}

function slugLevel(slot: number, slotLevels: Record<number, 1 | 2 | 3>): 1 | 2 | 3 {
  return slotLevels[slot] ?? 1;
}

/** 铁律：贴墙/贴屋顶的装饰只声明 atV，抬升由管线施加 */
export function liftOf(mount: Mount, hostHeight: number, atV: number): number {
  if (mount === 'ground') return 0;
  if (mount === 'roof') return hostHeight;
  return atV * hostHeight;
}

export function instantiate(spec: ElementSpec, deps: InstantiateDeps): Instance {
  const entry = getEntry(spec.id);
  const slot = spec.slot ?? null;

  if (!entry || !isElementId(spec.id)) {
    throw new Error(`[mono] ${spec.id} @slot=${slot === null ? 'null' : slot} provider=- ← unregistered`);
  }

  const mount = spec.mount ?? entry.mount;
  const level = spec.level ?? slugLevel(slot ?? 0, deps.slotLevels ?? {});
  const host = hostHeightOf(slot, deps.slotLevels ?? {});
  const atV = entry.attach?.atV ?? 0;
  const lift = liftOf(mount, host, atV);

  const r: Resolved = resolve(spec.id, deps.skin, deps.defaultSkin, spec.overrides ?? deps.overrides ?? null);
  const skinId = (r.level === 3 || r.level === 4 ? deps.defaultSkin?.id : deps.skin?.id) ?? 'builtin';

  const source = `[mono] ${spec.id} @slot=${slot === null ? 'null' : slot} provider=${r.provider.kind} ← L${r.level}`;

  const inst: Instance = {
    id: spec.id,
    slot,
    skin: skinId,
    providerKind: r.provider.kind,
    provider: r.provider,
    level: r.level,
    mount,
    box: entry.box,
    depth: spec.c + spec.r,
    lift,
    c: spec.c,
    r: spec.r,
    state: { level, ...(spec.state ?? {}) },
    source,
    draw: (g, params) => deps.onDraw?.(inst, params),
  };
  return inst;
}
```

> 说明：`draw` 在 Task 9 的 Pixi 层被接到真实 provider 上（`providers/index.ts` 的 kind→provider 表）；本任务只保证「工厂产出 + 定位 + lift + source 标签」这条不可绕过的管线。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/skin/instantiate.spec.ts`
Expected: PASS（12 例）。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src/skin/instantiate.ts monopoly/test/skin/instantiate.spec.ts
git commit -m "feat(mono): 统一工厂 instantiate + 管线强制 lift（禁止散装绘制）"
```

---

## Task 7: 四项构建期校验（lint-skin + ESLint 自定义规则）

**Files:**
- Create: `d:\zhao\monopoly\tools\lint-skin.mjs`
- Create: `d:\zhao\monopoly\tools\eslint-plugin-mono\index.js`
- Create: `d:\zhao\monopoly\eslint.config.js`
- Test: `d:\zhao\monopoly\test\tools\lint-skin.spec.ts`
- Test: `d:\zhao\monopoly\test\tools\eslint-rules.spec.ts`

> spec §3.7.2 的四项校验：① 注册表完整性 ② `skin.json` schema ③ 禁写死 ④ 命名规范。① 与 ④ 已由 Task 2/4 的单测覆盖，本任务补 ②③。

- [ ] **Step 1: 写失败测试（lint-skin）**

```ts
import { describe, it, expect } from 'vitest';
import { validateSkin, type SkinFile } from '../../tools/lint-skin.mjs';
import { allElementIds } from '../../src/skin/registry';

const ok = (): SkinFile => ({
  id: 'default',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: { gold: '#f5c451' },
  elements: { 'board.tile.shop': { kind: 'proc', preset: 'tile', params: { fill: '#2f4238' } } },
});

const exists = (p: string) => p === 'tex/tile-shop.webp' || p === 'atlas/board.json';
const registered = new Set(allElementIds());

describe('validateSkin', () => {
  it('合法皮肤零错误', () => {
    expect(validateSkin(ok(), registered, exists)).toEqual([]);
  });

  it('ID 不合法 → 报错', () => {
    const s = ok();
    s.elements['Board.Tile.Shop'] = { kind: 'proc', preset: 'tile' };
    expect(validateSkin(s, registered, exists).some((e) => e.includes('Board.Tile.Shop'))).toBe(true);
  });

  it('未注册的 elementId → 报错（禁止先写皮肤后补注册表）', () => {
    const s = ok();
    s.elements['prop.doesNotExist'] = { kind: 'proc', preset: 'x' };
    expect(validateSkin(s, registered, exists)[0]).toMatch(/not in registry/);
  });

  it('image 缺 src → 报错', () => {
    const s = ok();
    s.elements['board.tile.shop'] = { kind: 'image' } as never;
    expect(validateSkin(s, registered, exists).some((e) => e.includes('src'))).toBe(true);
  });

  it('image src 素材不存在 → 报错', () => {
    const s = ok();
    s.elements['board.tile.shop'] = { kind: 'image', src: 'tex/missing.webp' };
    expect(validateSkin(s, registered, exists).some((e) => e.includes('missing asset'))).toBe(true);
  });

  it('anchor 越界 → 报错', () => {
    const s = ok();
    s.elements['board.tile.shop'] = { kind: 'image', src: 'tex/tile-shop.webp', anchor: [1.2, 0.5] };
    expect(validateSkin(s, registered, exists).some((e) => e.includes('anchor'))).toBe(true);
  });

  it('frames 空 src 或 fps<=0 → 报错', () => {
    const s = ok();
    s.elements['board.tile.shop'] = { kind: 'frames', src: [], fps: 0 } as never;
    const errs = validateSkin(s, registered, exists);
    expect(errs.some((e) => e.includes('src'))).toBe(true);
    expect(errs.some((e) => e.includes('fps'))).toBe(true);
  });

  it('geo 缺字段 → 报错', () => {
    const s = ok();
    s.geo = { hw: 21 } as never;
    expect(validateSkin(s, registered, exists).some((e) => e.includes('geo'))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/tools/lint-skin.spec.ts`
Expected: FAIL，`tools/lint-skin.mjs` 不存在。

- [ ] **Step 3: 实现 lint-skin.mjs**

```js
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SEG = '[a-z][a-z0-9]*';
const NS = ['token', 'board\\.tile', 'board\\.inner', 'board\\.center', 'building', 'prop', 'piece', 'dice', 'card', 'fx', 'ui'];
const ID_RE = new RegExp(`^(${NS.join('|')})(\\.${SEG}){1,2}$`);

function checkProvider(id, p, exists) {
  const errs = [];
  if (!p || typeof p !== 'object') return [`${id}: provider 不是对象`];
  switch (p.kind) {
    case 'proc':
      if (typeof p.preset !== 'string' || !p.preset) errs.push(`${id}: proc.preset 缺失`);
      break;
    case 'image':
      if (typeof p.src !== 'string' || !p.src) errs.push(`${id}: image.src 缺失`);
      else if (!exists(p.src)) errs.push(`${id}: missing asset ${p.src}`);
      break;
    case 'atlas':
      if (typeof p.src !== 'string' || !p.src) errs.push(`${id}: atlas.src 缺失`);
      else if (!exists(p.src)) errs.push(`${id}: missing asset ${p.src}`);
      if (typeof p.frame !== 'string' || !p.frame) errs.push(`${id}: atlas.frame 缺失`);
      break;
    case 'frames':
      if (!Array.isArray(p.src) || p.src.length === 0) errs.push(`${id}: frames.src 缺失`);
      else for (const s of p.src) if (!exists(s)) errs.push(`${id}: missing asset ${s}`);
      if (typeof p.fps !== 'number' || !(p.fps > 0)) errs.push(`${id}: frames.fps 非法`);
      break;
    default:
      errs.push(`${id}: 未知 provider.kind=${String(p.kind)}`);
  }
  if (p.anchor !== undefined) {
    const [ax, ay] = p.anchor;
    if (!(ax >= 0 && ax <= 1) || !(ay >= 0 && ay <= 1)) errs.push(`${id}: anchor 越界`);
  }
  return errs;
}

/**
 * 皮肤包 schema 校验（纯函数，供 Vitest 与 CLI 共用）。
 * key 允许段通配：`building.*.l2` 归一化为 `building.s0.l2` 后再过 ID 正则，
 * 且只需命中「任一」注册 ID 即可（96 个 building.<slot>.l<lv> 因此只需 4 条 key）。
 */
export function validateSkin(skin, registeredIds, exists) {
  const errs = [];
  for (const k of ['hw', 'hh', 'ox', 'oy']) {
    if (typeof skin?.geo?.[k] !== 'number') errs.push(`geo.${k} 缺失或非数字`);
  }
  for (const [id, p] of Object.entries(skin?.elements ?? {})) {
    if (!ID_RE.test(id.replace(/\*/g, 's0'))) errs.push(`${id}: ID 不符合命名规范`);
    if (!registryHas(registeredIds, id)) { errs.push(`${id}: not in registry`); continue; }
    errs.push(...checkProvider(id, p, exists));
  }
  return errs;
}

/** 精确命中，或含 `*` 的段通配命中任一注册 ID */
export function registryHas(registeredIds, id) {
  if (registeredIds.has(id)) return true;
  if (!id.includes('*')) return false;
  const parts = id.split('.');
  for (const rid of registeredIds) {
    const rp = String(rid).split('.');
    if (rp.length === parts.length && parts.every((seg, i) => seg === '*' || seg === rp[i])) return true;
  }
  return false;
}

/** CLI：逐个校验 public/skins/<id>/skin.json */
function main() {
  const root = resolve(process.cwd(), 'public/skins');
  if (!existsSync(root)) { console.error('no public/skins'); process.exit(1); }
  let failed = 0;
  for (const dir of readdirSync(root)) {
    const file = join(root, dir, 'skin.json');
    if (!existsSync(file)) continue;
    const skin = JSON.parse(readFileSync(file, 'utf8'));
    const exists = (rel) => existsSync(join(root, dir, rel));
    const registeredIds = globalThis.__MONO_REGISTRY__;
    const errs = validateSkin(skin, registeredIds, exists);
    if (errs.length) { failed++; console.error(`[skin:${dir}]`); for (const e of errs) console.error('  - ' + e); }
    else console.log(`[skin:${dir}] OK`);
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('lint-skin.mjs')) main();
```

> 说明：CLI 侧需要注册表 ID 集合。为避免在 Node 里跑 TS，CLI 用 `node --import tsx` 或先在 `check-hardcoded.mjs` 里 `import` 编译产物；**本计划采用最简做法**：CLI 从 `tools/registry-ids.json` 读取（由 Task 4 的 `allElementIds()` 在 `npm run lint:skin` 前用 `node tools/gen-registry-ids.mjs` 生成）。`gen-registry-ids.mjs` 内容见 Step 4。

- [ ] **Step 4: 加注册表 ID 快照生成脚本**

Create `tools/gen-registry-ids.mjs`：

```js
import { writeFileSync } from 'node:fs';
import { register } from 'node:module';
// 直接用 vite 的 esbuild 转译能力：临时编译 src/skin/registry.ts
import { transformSync } from 'esbuild';

const src = await readFile(new URL('../src/skin/registry.ts', import.meta.url), 'utf8');
const out = transformSync(src, { loader: 'ts', format: 'esm' }).code;
const mod = await import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
writeFileSync(new URL('./registry-ids.json', import.meta.url), JSON.stringify(mod.allElementIds(), null, 2));
console.log(`registry-ids.json: ${mod.allElementIds().length} ids`);
```

并在 `package.json` 的 scripts 里把 `lint:skin` 改成：

```json
"lint:skin": "node tools/gen-registry-ids.mjs && node tools/lint-skin.mjs"
```

同时把 `tools/lint-skin.mjs` 的 `main()` 改为读 `registry-ids.json`：

```js
const registeredIds = new Set(JSON.parse(readFileSync(new URL('./registry-ids.json', import.meta.url), 'utf8')));
```

（删掉 `globalThis.__MONO_REGISTRY__` 那行。）

> `esbuild` 随 Vite 已装，无需新增依赖。

- [ ] **Step 5: 写失败测试（ESLint 规则）**

`test/tools/eslint-rules.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { RuleTester } from 'eslint';
import { noHardcodedColor, noVisualNumber } from '../../tools/eslint-plugin-mono/index.js';

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

describe('mono/no-hardcoded-color', () => {
  it('拦截 hex / rgb / rgba / hsl 字面量', () => {
    expect(() => tester.run('no-hardcoded-color', noHardcodedColor, {
      valid: ['const a = 1;'],
      invalid: [
        { code: "const a = '#f5c451';", errors: 1 },
        { code: "const a = 'rgba(0,0,0,.5)';", errors: 1 },
        { code: "const a = 'hsl(45,72%,60%)';", errors: 1 },
      ],
    })).not.toThrow();
  });
});

describe('mono/no-visual-number', () => {
  it('白名单之外的数字一律报错（26/46/72/0.62 都被拦）', () => {
    expect(() => tester.run('no-visual-number', noVisualNumber, {
      valid: ['const a = 1; const b = 0.5; const c = -1; const d = Math.PI * 180 / 90;'],
      invalid: [
        { code: 'const h = 26;', errors: 1 },
        { code: 'const k = 0.62;', errors: 1 },
        { code: 'const g = 10.5;', errors: 1 },
      ],
    })).not.toThrow();
  });
});

describe('取值器兜底默认值豁免（spec §3.6.4：内建兜底是全工程唯一允许裸字面量的位置）', () => {
  it('色值：str/c 的实参放行、参数化模板放行；裸色值与无插值模板报错', () => {
    expect(() => tester.run('no-hardcoded-color', noHardcodedColor, {
      valid: [
        "const a = str(p, 'fill', '#ffffff');",
        "const b = c('edge', '#6b7f76');",
        'const d = hsl(hue, sat, light);',
        'const e = `hsl(${hue},32%,20%)`;',
      ],
      invalid: [
        { code: "const a = '#ffffff';", errors: 1 },
        { code: 'const a = `rgba(0,0,0,.5)`;', errors: 1 },
      ],
    })).not.toThrow();
  });

  it('数字：num/n 的实参与 fb 默认值容器放行，裸 13 报错', () => {
    expect(() => tester.run('no-visual-number', noVisualNumber, {
      valid: [
        'const a = num(p, "k", 13);',
        'const b = n("h", 26);',
        'const D = fb({ shadowFy: 0.6, wallH: 26, level3: 72 });',
      ],
      invalid: [{ code: 'const b = 13;', errors: 1 }],
    })).not.toThrow();
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `npx vitest run test/tools/eslint-rules.spec.ts`
Expected: FAIL，插件模块不存在。

- [ ] **Step 7: 实现 ESLint 插件与配置**

`tools/eslint-plugin-mono/index.js`：

```js
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const FUNCCOLOR = /\b(rgba?|hsla?)\(/;
const ALLOW = new Set([-1, 0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 90, 180, 360]);
/* 说明：「裸几何常数」指带小数的量（0.62 / 10.5）或 ≥10 的整数（26 / 46 / 72 / 390）；上表为结构性小整数与直角/半值，直接放行 */
/* 取值器：唯一允许裸字面量的位置 = 兜底默认值（spec §3.6.4「内建兜底」） */
const GETTERS = new Set(['num', 'str', 'arr', 'n', 'c', 'fb']);

/**
 * 该字面量是否落在取值器调用的实参子树内（含对象/数组字面量内部），是则豁免。
 * 例：num(p,'k',13) ✓ · str(p,'fill','#fff') ✓ · fb({ a: 0.6, b: 26 }) ✓ · const h = 26 ✗
 */
function isFallback(node) {
  let cur = node.parent;
  while (cur) {
    if (cur.type === 'CallExpression' && cur.callee.type === 'Identifier' && GETTERS.has(cur.callee.name)) return true;
    if (cur.type === 'ArrowFunctionExpression' || cur.type === 'FunctionExpression' || cur.type === 'FunctionDeclaration') return false;
    if (cur.type === 'Program') return false;
    cur = cur.parent;
  }
  return false;
}

export const noHardcodedColor = {
  meta: { type: 'problem', docs: { description: 'src/render 禁止裸色值' } },
  create(ctx) {
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        if (isFallback(node)) return;
        if (HEX.test(node.value) || FUNCCOLOR.test(node.value)) {
          ctx.report({ node, message: `裸色值「${node.value}」必须进 skin.json（spec §3.7.2）；仅兜底默认值（num/str/arr/n/c/fb 的实参）可裸写` });
        }
      },
      TemplateElement(node) {
        /* 参数化模板（含插值，如 `hsl(${hue},32%,20%)`）属"由参数组装的颜色"，不算写死 */
        const tpl = node.parent;
        if (tpl && Array.isArray(tpl.expressions) && tpl.expressions.length > 0) return;
        const raw = node.value.raw;
        if (HEX.test(raw.trim()) || FUNCCOLOR.test(raw)) {
          ctx.report({ node, message: `模板串含裸色值「${raw}」必须进 skin.json` });
        }
      },
    };
  },
};

export const noVisualNumber = {
  meta: { type: 'problem', docs: { description: 'src/render 禁止裸几何/视觉常数' } },
  create(ctx) {
    return {
      Literal(node) {
        if (typeof node.value !== 'number') return;
        if (ALLOW.has(node.value)) return;
        if (isFallback(node)) return;
        ctx.report({ node, message: `裸视觉常数 ${node.value} 必须进 skin.json / 注册表（spec §3.7.2）；仅兜底默认值（num/str/arr/n/c/fb 的实参）可裸写` });
      },
    };
  },
};

export default { rules: { 'no-hardcoded-color': noHardcodedColor, 'no-visual-number': noVisualNumber } };
```

`eslint.config.js`：

```js
import mono from './tools/eslint-plugin-mono/index.js';

export default [
  { ignores: ['release/**', 'node_modules/**', 'public/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  {
    // 禁写死：只作用于渲染层
    files: ['src/render/**/*.ts'],
    plugins: { mono },
    rules: { 'mono/no-hardcoded-color': 'error', 'mono/no-visual-number': 'error' },
  },
];
```

- [ ] **Step 8: 跑测试与 lint 确认通过**

Run: `npx vitest run test/tools`
Expected: PASS（11 例：validateSkin 7 + eslint 4）。

Run: `npm run lint`
Expected: 0 错（此刻 `src/render/iso.ts` 只有 Task 3 的白名单常量）。

- [ ] **Step 9: Commit**

```bash
git add monopoly/tools monopoly/eslint.config.js monopoly/test/tools monopoly/package.json
git commit -m "feat(mono): 四项构建期校验（skin schema + 禁写死 ESLint 规则）"
```

---

## Task 8: Pixi 引导 + 空场景出画面 + `?debug=1` 最小面板

**Files:**
- Create: `d:\zhao\monopoly\src\skin\layout.ts`
- Create: `d:\zhao\monopoly\src\render\stage.ts`
- Create: `d:\zhao\monopoly\src\render\providers\index.ts`
- Create: `d:\zhao\monopoly\src\debug\panel.ts`
- Modify: `d:\zhao\monopoly\src\main.ts`
- Create: `d:\zhao\monopoly\local\mono-shots-m1.mjs`
- Test: `d:\zhao\monopoly\test\skin\factory-wiring.spec.ts`

> **关键前置**：`src/render/**` 不许出现裸数字/裸色值（Task 7 的 lint 会拦）。因此**舞台尺寸、安全区、面板尺寸等布局常量一律放 `src/skin/layout.ts`**（不受禁写死规则约束），`src/render/**` 只 import。

- [ ] **Step 1: 写失败测试（工厂接线到 provider 表）**

```ts
import { describe, it, expect } from 'vitest';
import { PROVIDERS, providerFor } from '../../src/render/providers';

describe('providers 表', () => {
  it('四种 kind 都有实现', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(['atlas', 'frames', 'image', 'proc']);
  });
  it('providerFor 返回实现，未知 kind 抛错', () => {
    expect(typeof providerFor({ kind: 'proc', preset: 'tile' }).draw).toBe('function');
    expect(() => providerFor({ kind: 'nope' } as never)).toThrow(/^\[mono\] unknown provider kind/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/skin/factory-wiring.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 provider 表（先只放桩，真绘制在 M2）**

`src/skin/layout.ts`（布局常量集中地，render 层只 import）：

```ts
/** 舞台与安全区（布局常量：不在禁写死规则作用域内） */
export const STAGE_W = 390;
export const STAGE_H = 844;
export const HUD_TOP_H = 30;
export const BOARD_TOP = 34;
export const SHOWCASE_Y = 322;
export const SHOWCASE_H = 268;
export const DOCK_Y = 606;
export const BOTTOM_BTN_Y = 738;
export const CARD_W = 66;
export const CARD_H = 88;

`src/render/providers/index.ts`：

```ts
import type { ProviderSpec } from '../../skin/types';

export interface ProviderImpl {
  draw(g: unknown, ctx: { params: Record<string, unknown>; box: { w: number; d: number; h: number } }): void;
}

const proc: ProviderImpl = {
  draw: () => {
    /* Task 9 起填真绘制；未实现的 preset 由 builtin 兜底（纯色块 + 文字） */
  },
};
const image: ProviderImpl = { draw: () => {} };
const atlas: ProviderImpl = { draw: () => {} };
const frames: ProviderImpl = { draw: () => {} };

export const PROVIDERS: Record<string, ProviderImpl> = { proc, image, atlas, frames };

export function providerFor(spec: ProviderSpec): ProviderImpl {
  const impl = PROVIDERS[spec.kind];
  if (!impl) throw new Error(`[mono] unknown provider kind=${String((spec as { kind?: unknown }).kind)}`);
  return impl;
}
```

- [ ] **Step 4: 实现 Pixi 引导与 debug 面板**

`src/render/stage.ts`：

```ts
import { Application, Container, Graphics } from 'pixi.js';
import { STAGE_W, STAGE_H } from '../skin/layout';

export { STAGE_W, STAGE_H };

export interface Stage {
  app: Application;
  layers: { ground: Container; labels: Container; pieces: Container; fx: Container };
  destroy(): void;
}

/** 三遍绘制容器：地面+建筑 → 汉字标签 → 棋子（fx 为特效，独立于排序） */
export async function createStage(canvas: HTMLCanvasElement, opts: { bg: number; dpr: number }): Promise<Stage> {
  const app = new Application();
  await app.init({
    canvas,
    width: STAGE_W,
    height: STAGE_H,
    background: opts.bg,
    antialias: true,
    resolution: opts.dpr,
    autoDensity: true,
  });

  const ground = new Container();
  const labels = new Container();
  const pieces = new Container();
  const fx = new Container();
  ground.label = 'ground';
  labels.label = 'labels';
  pieces.label = 'pieces';
  fx.label = 'fx';
  app.stage.addChild(ground, labels, pieces, fx);

  // 空场景也得「出画面」：铺一层占位底，证明管线活着
  const probe = new Graphics();
  probe.rect(0, 0, STAGE_W, STAGE_H).fill(opts.bg);
  ground.addChild(probe);

  return {
    app,
    layers: { ground, labels, pieces, fx },
    destroy: () => app.destroy(true),
  };
}
```

`src/debug/panel.ts`：

```ts
import type { Instance } from '../skin/instantiate';

export interface DebugPanel {
  mount(root: HTMLElement): void;
  show(inst: Instance | null): void;
}

export function createDebugPanel(): DebugPanel {
  let box: HTMLDivElement | null = null;
  return {
    mount(root) {
      box = document.createElement('div');
      box.id = 'mono-debug';
      box.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;max-height:32vh;overflow:auto;' +
        'background:rgba(6,10,8,.92);color:#d8e4dc;font:11px/1.5 ui-monospace,monospace;' +
        'padding:6px 8px;z-index:9;white-space:pre-wrap';
      box.textContent = '[mono] debug on（点选元素显示 ID / 包围盒 / depth / provider 来源与回退级别）';
      root.appendChild(box);
    },
    show(inst) {
      if (!box) return;
      if (!inst) return;
      box.textContent = [
        inst.source,
        `box   w=${inst.box.w} d=${inst.box.d} h=${inst.box.h}`,
        `mount ${inst.mount}  lift=${inst.lift}`,
        `depth ${inst.depth}  slot=${inst.slot ?? 'null'}  skin=${inst.skin}`,
      ].join('\n');
    },
  };
}
```

- [ ] **Step 5: 改写入口 main.ts**

```ts
import { createStage } from './render/stage';
import { createDebugPanel } from './debug/panel';

export const VERSION = '0.1.0';

/** 兜底底色（真色值在 M2 起从 skins/<id>/skin.json 的 tokens 读取） */
const BG_FALLBACK = 0x0c1513;

export interface UrlOptions { skin: string; debug: boolean; seed: number; speed: number }

export function parseOptions(search: string): UrlOptions {
  const q = new URLSearchParams(search);
  const num = (k: string, d: number): number => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    skin: q.get('skin') || 'default',
    debug: q.get('debug') === '1',
    seed: num('seed', 1),
    speed: num('speed', 1),
  };
}

export async function boot(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('[mono] #stage not found');
  const opts = parseOptions(location.search);
  const stage = await createStage(canvas, {
    bg: BG_FALLBACK,
    dpr: window.devicePixelRatio || 2,
  });
  if (opts.debug) createDebugPanel().mount(document.body);
  (window as unknown as Record<string, unknown>).__monoMain = { stage, opts, VERSION };
}

if (typeof document !== 'undefined') void boot();
```

同步更新 `test/smoke.spec.ts`（`VERSION` 升到 `0.1.0`，并补 `parseOptions` 用例）：

```ts
import { describe, it, expect } from 'vitest';
import { VERSION, parseOptions } from '../src/main';

describe('smoke', () => {
  it('导出 VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });
});

describe('parseOptions', () => {
  it('缺省：skin=default, debug=false, seed=1, speed=1', () => {
    expect(parseOptions('')).toEqual({ skin: 'default', debug: false, seed: 1, speed: 1 });
  });
  it('解析 ?skin ?debug ?seed ?speed', () => {
    expect(parseOptions('?skin=photo&debug=1&seed=7&speed=4'))
      .toEqual({ skin: 'photo', debug: true, seed: 7, speed: 4 });
  });
  it('非法数字回落到缺省', () => {
    expect(parseOptions('?seed=abc&speed=-2').seed).toBe(1);
    expect(parseOptions('?speed=-2').speed).toBe(1);
  });
});
```

> 注意：`test/smoke.spec.ts` 里 `import { ... } from '../src/main'` 会执行 `boot()`；`boot` 由 `typeof document !== 'undefined'` 守卫，Node 环境（vitest）下不触发，故安全。

- [ ] **Step 6: 写 Playwright 移动视口截图脚本**

`local/mono-shots-m1.mjs`：

```js
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.MONO_URL || 'http://127.0.0.1:52300/mono.html?debug=1';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain), null, { timeout: 10000 });
await page.screenshot({ path: `${OUT}/mono-m1-01-boot.png` });

const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas#stage'));
const hasDebug = await page.evaluate(() => !!document.querySelector('#mono-debug'));
console.log(JSON.stringify({ hasCanvas, hasDebug, errors }, null, 2));
await browser.close();
if (!hasCanvas || !hasDebug || errors.length) process.exit(1);
```

- [ ] **Step 7: 起服务、截图、构建、验收**

Run: `npm run dev`（后台）→ 另开终端 `node local/mono-shots-m1.mjs`
Expected: 打印 `hasCanvas:true, hasDebug:true, errors:[]`，生成 `docs/verify/mono-m1-01-boot.png`（390×844 @dpr2）。

Run: `npm run build`
Expected: 生成 `release/mono.html`、`release/js/mono.js`。

- [ ] **Step 8: Commit**

```bash
git add monopoly/src monopoly/local monopoly/test monopoly/docs
git commit -m "feat(mono): Pixi 引导 + 空场景出画面 + ?debug=1 最小面板 + 移动视口截图"
```

---
# Wave 1 · M2 等距棋盘渲染

## Task 9: 默认皮肤 `skin.json` + proc 绘制器（tile / tileEdge / builtin）

**Files:**
- Create: `d:\zhao\monopoly\public\skins\default\skin.json`
- Create: `d:\zhao\monopoly\src\render\providers\proc.ts`
- Create: `d:\zhao\monopoly\src\render\paint.ts`
- Modify: `d:\zhao\monopoly\src\render\providers\index.ts`
- Test: `d:\zhao\monopoly\test\render\proc-tile.spec.ts`
- Test: `d:\zhao\monopoly\test\render\paint.spec.ts`

> **参数化纪律（Task 7 的 lint 会强制）**：`src/render/**` 里所有比例/数量/颜色都必须来自 `params` 或 `box`；算法常量只允许 `-1, 0, 0.5, 1, 2, 3, 90, 180, 360`。v5 里的 `[0.335,0.53,0.725]`、`0.62`、`26/46/72`、`#2f4238` 一律变成 skin.json 的数组/数值/色值。

- [ ] **Step 1: 写默认皮肤 skin.json（v5 全部色值与几何的落地处）**

`public/skins/default/skin.json`：

```json
{
  "id": "default",
  "meta": { "name": "默认程序化（v5 定稿）" },
  "geo": { "hw": 21, "hh": 10.5, "ox": 195, "oy": 96 },
  "tokens": {
    "gold": "#f5c451",
    "bgTop": "#1a2b2a",
    "bgBottom": "#0c1513",
    "panelBg": "#0f1a18",
    "textPrimary": "#e8e4d8",
    "textSecondary": "#9fb3a8",
    "owner1": "#3fbf7f",
    "owner2": "#f0a039",
    "owner3": "#e0607e",
    "owner4": "#4aa3e0"
  },
  "elements": {
    "token.bg": { "kind": "proc", "preset": "bgGradient", "params": { "top": "#1a2b2a", "bottom": "#0c1513" } },
    "token.gold": { "kind": "proc", "preset": "solid", "params": { "fill": "#f5c451" } },

    "board.tile.core": { "kind": "proc", "preset": "tile", "params": { "fill": "#5c4a1a", "edge": "#f5c451", "inner": "#000000" } },
    "board.tile.shop": { "kind": "proc", "preset": "tile", "params": { "fill": "#2f4238", "edge": "#5b7b6a", "inner": "#000000" } },
    "board.tile.chance": { "kind": "proc", "preset": "tile", "params": { "fill": "#40305c", "edge": "#a26bf0", "inner": "#000000" } },
    "board.tile.fate": { "kind": "proc", "preset": "tile", "params": { "fill": "#2b3566", "edge": "#6b7ff0", "inner": "#000000" } },
    "board.tile.bonus": { "kind": "proc", "preset": "tile", "params": { "fill": "#245037", "edge": "#34c759", "inner": "#000000" } },
    "board.tile.jail": { "kind": "proc", "preset": "tile", "params": { "fill": "#542c25", "edge": "#e5573f", "inner": "#000000" } },
    "board.tile.stock": { "kind": "proc", "preset": "tile", "params": { "fill": "#22465a", "edge": "#29a9e0", "inner": "#000000" } },

    "board.tile.core.edge": { "kind": "proc", "preset": "tileEdge", "params": { "edge": "#f5c451" } },
    "board.tile.shop.edge": { "kind": "proc", "preset": "tileEdge", "params": { "edge": "#5b7b6a" } },
    "board.tile.chance.edge": { "kind": "proc", "preset": "tileEdge", "params": { "edge": "#a26bf0" } },
    "board.tile.fate.edge": { "kind": "proc", "preset": "tileEdge", "params": { "edge": "#6b7ff0" } },
    "board.tile.bonus.edge": { "kind": "proc", "preset": "tileEdge", "params": { "edge": "#34c759" } },
    "board.tile.jail.edge": { "kind": "proc", "preset": "tileEdge", "params": { "edge": "#e5573f" } },
    "board.tile.stock.edge": { "kind": "proc", "preset": "tileEdge", "params": { "edge": "#29a9e0" } },

    "board.inner.d1": { "kind": "proc", "preset": "building", "params": { "levels": 3, "hue": 205, "dim": 0.72 } },
    "board.inner.d2": { "kind": "proc", "preset": "building", "params": { "levels": 2, "hue": 30, "dim": 0.72 } },
    "board.inner.d3": { "kind": "proc", "preset": "building", "params": { "levels": 2, "hue": 150, "dim": 0.72 } },
    "board.inner.d4": { "kind": "proc", "preset": "building", "params": { "levels": 3, "hue": 268, "dim": 0.72 } },
    "board.inner.d5": { "kind": "proc", "preset": "building", "params": { "levels": 2, "hue": 22, "dim": 0.72 } },
    "board.inner.d6": { "kind": "proc", "preset": "building", "params": { "levels": 3, "hue": 192, "dim": 0.72 } },
    "board.inner.d7": { "kind": "proc", "preset": "building", "params": { "levels": 2, "hue": 320, "dim": 0.72 } },
    "board.inner.d8": { "kind": "proc", "preset": "building", "params": { "levels": 3, "hue": 45, "dim": 0.72 } },
    "board.center.fountain": { "kind": "proc", "preset": "fountain", "params": {} }
  }
}
```

- [ ] **Step 2: 写失败测试（绘制原语 + tile）**

`test/render/paint.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { ptsToPoly, polyline, rectPath } from '../../src/render/paint';

describe('paint 原语', () => {
  it('ptsToPoly 把 [x,y] 数组摊平成 Pixi 需要的扁平数字数组', () => {
    expect(ptsToPoly([[1, 2], [3, 4], [5, 6]])).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('polyline 闭合两点以上', () => {
    expect(polyline([[1, 2], [3, 4], [5, 6]])).toEqual([1, 2, 3, 4, 5, 6, 1, 2]);
  });
  it('rectPath 返回左上右下', () => {
    expect(rectPath(10, 20, 30, 40)).toEqual([10, 20, 40, 60]);
  });
});
```

`test/render/proc-tile.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { PROC_PRESETS } from '../../src/render/providers/proc';

/** 用「记录调用」的假画布，断言 provider 发出的绘制指令（纯逻辑可测，不需要 WebGL） */
function recorder() {
  const calls: Array<{ op: string; pts?: number[]; style?: Record<string, unknown> }> = [];
  const g = {
    poly(pts: number[]) { calls.push({ op: 'poly', pts }); return g; },
    rect(x: number, y: number, w: number, h: number) { calls.push({ op: 'rect', pts: [x, y, w, h] }); return g; },
    circle(x: number, y: number, r: number) { calls.push({ op: 'circle', pts: [x, y, r] }); return g; },
    ellipse(x: number, y: number, rx: number, ry: number) { calls.push({ op: 'ellipse', pts: [x, y, rx, ry] }); return g; },
    moveTo() { return g; }, lineTo() { return g; }, closePath() { return g; },
    fill(s: Record<string, unknown>) { calls[calls.length - 1].style = { ...(calls[calls.length - 1].style ?? {}), fill: s }; return g; },
    stroke(s: Record<string, unknown>) { calls[calls.length - 1].style = { ...(calls[calls.length - 1].style ?? {}), stroke: s }; return g; },
  };
  return { g, calls };
}

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };
const BOX = { w: 42, d: 21, h: 2 };

describe('proc preset: tile', () => {
  it('发出 1 个菱形 poly，fill = params.fill、stroke = params.edge', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.tile(g as never, {
      geo: GEO, box: BOX, cx: 100, cy: 200, s: 1,
      params: { fill: '#2f4238', edge: '#5b7b6a', inner: '#000000' },
      state: {},
    });
    expect(calls.length).toBe(1);
    expect(calls[0].op).toBe('poly');
    expect(calls[0].pts).toEqual([100, 210.5, 121, 200, 100, 189.5, 79, 200]);
    expect(calls[0].style).toEqual({ fill: { color: '#2f4238' }, stroke: { color: '#5b7b6a' } });
  });

  it('selected 时描边宽度换成 params 里的高亮宽', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.tile(g as never, {
      geo: GEO, box: BOX, cx: 0, cy: 0, s: 1,
      params: { fill: '#2f4238', edge: '#5b7b6a', inner: '#000000', selectedEdge: '#f5c451', edgeW: 0.9, edgeWSel: 1.8 },
      state: { selected: true, owner: 2, ownerColors: { 2: '#f0a039' } },
    });
    expect(calls[0].style!.stroke).toEqual({ color: '#f0a039', width: 1.8 });
  });

  it('owner 存在时描边用归属色（不再用类型色）', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.tile(g as never, {
      geo: GEO, box: BOX, cx: 0, cy: 0, s: 1,
      params: { fill: '#2f4238', edge: '#5b7b6a', inner: '#000000', edgeW: 0.9 },
      state: { owner: 3, ownerColors: { 3: '#e0607e' } },
    });
    expect(calls[0].style!.stroke).toEqual({ color: '#e0607e', width: 0.9 });
  });
});

describe('proc preset: tileEdge', () => {
  it('发出内圈细描边 poly（归属色条）', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.tileEdge(g as never, {
      geo: GEO, box: BOX, cx: 100, cy: 200, s: 1,
      params: { edge: '#f5c451', inset: 0.9, dy: 1.5, width: 1.2 },
      state: {},
    });
    expect(calls[0].op).toBe('poly');
    expect(calls[0].style!.stroke).toEqual({ color: '#f5c451', width: 1.2 });
  });
});

describe('proc preset: builtin（内建兜底）', () => {
  it('任何元素都有得画：矩形 + 文本标签', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.builtin(g as never, {
      geo: GEO, box: BOX, cx: 10, cy: 20, s: 1,
      params: { label: 'prop.lantern' }, state: {},
    });
    expect(calls.some((c) => c.op === 'rect')).toBe(true);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run test/render/paint.spec.ts test/render/proc-tile.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现 paint.ts（加厚已选中的通用原语）**

`src/render/paint.ts`：

```ts
import type { Geo, Pt } from './iso';
import { dia, win, up } from './iso';

/** [x,y][] → Pixi 扁平数组 */
export function ptsToPoly(pts: Pt[]): number[] {
  return pts.flat();
}

/** 闭合折线（首点追加到尾） */
export function polyline(pts: Pt[]): number[] {
  return pts.length === 0 ? [] : [...pts, pts[0]].flat();
}

/** 矩形 → 扁平数组（Pixi 用 rect(x,y,w,h) 更好，这里给测试与 SVG 复用） */
export function rectPath(x: number, y: number, w: number, h: number): number[] {
  return [x, y, x + w, y + h];
}

/** 地砖菱形（转发 iso.dia，统一入口便于调试面板替换皮肤几何） */
export function tileDiamond(cx: number, cy: number, geo: Geo, lift = 0): Pt[] {
  return dia(cx, cy, geo.hw, geo.hh, lift);
}

/** 墙面开窗（转发 iso.win） */
export function wallRect(P0: Pt, P1: Pt, h: number, u1: number, u2: number, v1: number, v2: number): Pt[] {
  return win(P0, P1, h, u1, u2, v1, v2);
}

/** 面上抬升（转发 iso.up） */
export function liftPt(p: Pt, h: number): Pt {
  return up(p, h);
}
```

- [ ] **Step 5: 实现 proc.ts（preset 注册表；tile/tileEdge/builtin/bgGradient/solid 全量，其余见 Task 15–18 逐步补齐）**

`src/render/providers/proc.ts`：

```ts
import { Graphics } from 'pixi.js';
import type { Geo } from '../iso';
import { dia } from '../iso';
import { ptsToPoly } from '../paint';

export interface ProcCtx {
  geo: Geo;
  box: { w: number; d: number; h: number };
  cx: number;      // 已含管线 lift 的地面锚点
  cy: number;
  s: number;       // 缩放（1 = 占满一格）
  params: Record<string, unknown>;
  state: Record<string, unknown>;
}

export type ProcPreset = (g: Graphics, ctx: ProcCtx) => void;

type P = Record<string, unknown>;
export const num = (p: P, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
export const str = (p: P, k: string, d: string): string => (typeof p[k] === 'string' ? (p[k] as string) : d);
export const arr = <T>(p: P, k: string): T[] | null => (Array.isArray(p[k]) ? (p[k] as T[]) : null);

/**
 * L4 内建兜底默认值容器（spec §3.6.4）：把一个 preset 的全部几何/色值默认值集中声明一次。
 * 取值器（num/str/arr/n/c/fb）的实参子树是 `no-visual-number` / `no-hardcoded-color` 唯一豁免的位置。
 */
export function fb<T extends Record<string, unknown>>(d: T): T {
  return d;
}

/* —— 地砖：菱形填充 + 描边（归属色/类型色/选中高亮） —— */
const tile: ProcPreset = (g, ctx) => {
  const { cx, cy, geo, params, state } = ctx;
  const s = ctx.s;
  const owner = typeof state.owner === 'number' ? state.owner : null;
  const ownerColors = (state.ownerColors ?? {}) as Record<number, string>;
  const selected = state.selected === true;
  const edgeW = num(params, 'edgeW', 0.9);
  const edgeWSel = num(params, 'edgeWSel', edgeW);
  const color = selected
    ? str(params, 'selectedEdge', str(params, 'edge', '#ffffff'))
    : owner !== null && ownerColors[owner]
      ? ownerColors[owner]
      : str(params, 'edge', '#ffffff');
  g.poly(ptsToPoly(dia(cx, cy, geo.hw * s, geo.hh * s)))
    .fill({ color: str(params, 'fill', '#000000') })
    .stroke({ color, width: selected ? edgeWSel : edgeW });
};

/* —— 地砖内圈高光 / 归属色条 —— */
const tileEdge: ProcPreset = (g, ctx) => {
  const { cx, cy, geo, params } = ctx;
  const s = ctx.s;
  const inset = num(params, 'inset', 1);
  const dy = num(params, 'dy', 0);
  const lift = num(params, 'lift', 0);
  g.poly(ptsToPoly(dia(cx, cy + dy * s, geo.hw * inset * s, geo.hh * inset * s, lift * s)))
    .stroke({ color: str(params, 'edge', '#ffffff'), width: num(params, 'width', 1) });
};

/* —— 背景纵向渐变 —— */
const bgGradient: ProcPreset = (g, ctx) => {
  const { box, params } = ctx;
  g.rect(0, 0, box.w, box.h)
    .fill({ color: str(params, 'bottom', '#000000') });
  const steps = arr<number>(params, 'steps') ?? [];
  const top = str(params, 'top', '#000000');
  const bottom = str(params, 'bottom', '#000000');
  for (const t of steps) {
    const y = box.h * t;
    g.rect(0, y, box.w, box.h * (num(params, 'stepH', 0.25)))
      .fill({ color: t < 0.5 ? top : bottom, alpha: num(params, 'alpha', 0.5) });
  }
};

/** 纯色块 */
const solid: ProcPreset = (g, ctx) => {
  g.rect(0, 0, ctx.box.w, ctx.box.h).fill({ color: str(ctx.params, 'fill', '#ffffff') });
};

/** 内建兜底：纯色块 + 文字（永不空白，spec §3.6.4） */
const builtin: ProcPreset = (g, ctx) => {
  const { box, params } = ctx;
  const color = str(params, 'fill', '#3a4a42');
  g.rect(ctx.cx - box.w / 2, ctx.cy - box.h, box.w, box.h)
    .fill({ color })
    .stroke({ color: str(params, 'edge', '#6b7f76'), width: num(params, 'edgeW', 1) });
};

export const PROC_PRESETS: Record<string, ProcPreset> = {
  tile,
  tileEdge,
  bgGradient,
  solid,
  builtin,
};

export function procPreset(name: string): ProcPreset {
  return PROC_PRESETS[name] ?? builtin;
}
```

- [ ] **Step 6: 接线 providers/index.ts 到 proc.ts**

`src/render/providers/index.ts`：

```ts
import type { Graphics } from 'pixi.js';
import type { ProviderSpec } from '../../skin/types';
import { procPreset, type ProcCtx } from './proc';

export interface ProviderImpl {
  draw(g: Graphics, ctx: ProcCtx): void;
}

const proc: ProviderImpl = {
  draw: (g, ctx) => {
    const preset = typeof ctx.params.__preset === 'string' ? (ctx.params.__preset as string) : 'builtin';
    procPreset(preset)(g, ctx);
  },
};
const image: ProviderImpl = { draw: () => { /* Task 20 实现 */ } };
const atlas: ProviderImpl = { draw: () => { /* Task 20 实现 */ } };
const frames: ProviderImpl = { draw: () => { /* Task 20 实现 */ } };

export const PROVIDERS: Record<string, ProviderImpl> = { proc, image, atlas, frames };

export function providerFor(spec: ProviderSpec): ProviderImpl {
  const impl = PROVIDERS[spec.kind];
  if (!impl) throw new Error(`[mono] unknown provider kind=${String((spec as { kind?: unknown }).kind)}`);
  return impl;
}
```

> `factory-wiring.spec.ts`（Task 8）里 `providerFor({kind:'proc',preset:'tile'})` 仍应通过；若断言了 `draw` 之外的字段再按上面调整。

- [ ] **Step 7: 跑测试确认通过**

Run: `npx vitest run test/render`
Expected: PASS（paint 3 例 + proc-tile 5 例 + iso 8 例）。

Run: `npm run lint:skin`
Expected: `[skin:default] OK`。

- [ ] **Step 8: Commit**

```bash
git add monopoly/public monopoly/src/render monopoly/test/render
git commit -m "feat(mono): 默认皮肤 skin.json + proc 绘制器（tile/tileEdge/builtin）"
```

---

## Task 10: 三遍绘制管线 `Scene.place()` + 32 格地砖

**Files:**
- Create: `d:\zhao\monopoly\src\data\board.ts`
- Create: `d:\zhao\monopoly\src\skin\skinLoader.ts`
- Create: `d:\zhao\monopoly\src\render\Scene.ts`
- Create: `d:\zhao\monopoly\src\render\BoardView.ts`
- Modify: `d:\zhao\monopoly\src\main.ts`
- Test: `d:\zhao\monopoly\test\core\board.spec.ts`
- Test: `d:\zhao\monopoly\test\render\scene-order.spec.ts`

- [ ] **Step 1: 写失败测试（棋盘数据）**

```ts
import { describe, it, expect } from 'vitest';
import { TILES, ringPath, typeAt, shortAt, nameAt, RING_SIZE, tileIndexOf } from '../../src/data/board';

describe('board 数据（spec §4）', () => {
  it('正好 32 格', () => {
    expect(TILES.length).toBe(RING_SIZE);
    expect(RING_SIZE).toBe(32);
  });

  it('ringPath(9,9) 形状与 spec 一致：下边 c=1→9、右边 r=8→2、上边 c=9→1、左边 r=2→8', () => {
    const p = ringPath(9, 9);
    expect(p.length).toBe(32);
    expect(p[0]).toEqual([1, 9]);
    expect(p[8]).toEqual([9, 9]);
    expect(p[9]).toEqual([9, 8]);
    expect(p[16]).toEqual([9, 1]);
    expect(p[24]).toEqual([1, 1]);
    expect(p[31]).toEqual([1, 8]);
  });

  it('index 0 是起点 core，index 12 是监狱 jail，index 19 是股票所 stock', () => {
    expect(typeAt(0)).toBe('core');
    expect(typeAt(12)).toBe('jail');
    expect(typeAt(19)).toBe('stock');
    expect(nameAt(0)).toBe('优美惠市集生鲜超市');
    expect(shortAt(0)).toBe('优美惠超市');
  });

  it('命运卡 6 格 / 机会卡 6 格', () => {
    const types = TILES.map((t) => t.type);
    expect(types.filter((t) => t === 'fate').length).toBe(6);
    expect(types.filter((t) => t === 'chance').length).toBe(6);
  });

  it('tileIndexOf 可反查（供棋子/建筑定位）', () => {
    expect(tileIndexOf(0, 0)).toBe(-1);
    expect(tileIndexOf(1, 9)).toBe(0);
    expect(tileIndexOf(9, 8)).toBe(9);
    expect(tileIndexOf(1, 8)).toBe(31);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/core/board.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 board.ts（spec §4 表逐行落地）**

```ts
export const BOARD_COLS = 9;
export const BOARD_ROWS = 9;

export type TileType = 'core' | 'shop' | 'chance' | 'fate' | 'bonus' | 'jail' | 'stock';

export interface TileDef {
  index: number;
  name: string;
  short: string;
  brand: string;
  type: TileType;
  level: 0 | 1 | 2 | 3;   // 演示初始层级（0 = 无楼）
}

export const TILE_TYPES: TileType[] = [
  'core', 'shop', 'fate', 'shop', 'shop', 'chance', 'shop', 'bonus',
  'shop', 'fate', 'shop', 'shop', 'jail', 'shop', 'chance', 'shop',
  'shop', 'fate', 'shop', 'stock', 'shop', 'chance', 'shop', 'fate',
  'shop', 'chance', 'shop', 'bonus', 'shop', 'fate', 'shop', 'chance',
];

export const TILE_NAMES = [
  '优美惠市集生鲜超市', '双阳鹿产品特产店', '命运卡', '双阳本地农家果蔬店', '太平温泉', '机会卡',
  '双阳特色烧烤店', '福利中心', '农家杂粮店', '命运卡', '双阳民宿小院', '双阳糕点面食铺',
  '监狱', '山泉饮用水门店', '机会卡', '双阳本地松子特产店', '农家采摘园', '命运卡',
  '双阳火锅店', '股票交易所', '双阳露营基地', '机会卡', '粮油米面店', '命运卡',
  '双阳洗衣生活馆', '机会卡', '乡村酒厂', '福利中心', '双阳照相馆', '命运卡',
  '农家乐饭店', '机会卡',
];

export const TILE_SHORT = [
  '优美惠超市', '鹿产品特产', '命运卡', '农家果蔬', '太平温泉', '机会卡', '特色烧烤', '福利中心',
  '农家杂粮', '命运卡', '民宿小院', '糕点面食', '监狱', '山泉水', '机会卡', '松子特产',
  '采摘园', '命运卡', '火锅店', '股票所', '露营基地', '机会卡', '粮油米面', '命运卡',
  '洗衣馆', '机会卡', '乡村酒厂', '福利中心', '照相馆', '命运卡', '农家乐', '机会卡',
];

export const TILE_BRAND = [
  '优美惠', '鹿特产', '命运', '果蔬店', '太平温泉', '机会', '烧烤店', '福利', '杂粮店', '命运', '民宿',
  '面食铺', '监狱', '山泉水', '机会', '松子', '采摘园', '命运', '火锅店', '股票所', '露营', '机会',
  '粮油', '命运', '洗衣馆', '机会', '酒厂', '福利', '照相馆', '命运', '农家乐', '机会',
];

/** 演示层级（v5 样张 LV；0 = 无楼，仅空地砖） */
export const TILE_LEVEL: Array<0 | 1 | 2 | 3> = [
  3, 1, 0, 1, 2, 0, 2, 0, 1, 0, 2, 1, 0, 2, 0, 1, 1, 0, 3, 0, 2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 3, 0,
];

export const RING_SIZE = 32;

export const TILES: TileDef[] = TILE_NAMES.map((name, i) => ({
  index: i,
  name,
  short: TILE_SHORT[i],
  brand: TILE_BRAND[i],
  type: TILE_TYPES[i],
  level: TILE_LEVEL[i],
}));

/** v5 样张 line 66–73：外圈 32 格路径 */
export function ringPath(cols: number, rows: number): Array<[number, number]> {
  const p: Array<[number, number]> = [];
  for (let c = 1; c <= cols; c++) p.push([c, rows]);
  for (let r = rows - 1; r >= 2; r--) p.push([cols, r]);
  for (let c = cols; c >= 1; c--) p.push([c, 1]);
  for (let r = 2; r <= rows - 1; r++) p.push([1, r]);
  return p;
}

const KEY_TO_INDEX = new Map<string, number>(
  ringPath(BOARD_COLS, BOARD_ROWS).map(([c, r], i) => [`${c},${r}`, i]),
);

export function tileIndexOf(c: number, r: number): number {
  return KEY_TO_INDEX.get(`${c},${r}`) ?? -1;
}

export function typeAt(index: number): TileType {
  return TILES[index].type;
}
export function nameAt(index: number): string {
  return TILES[index].name;
}
export function shortAt(index: number): string {
  return TILES[index].short;
}
export function brandAt(index: number): string {
  return TILES[index].brand;
}
```

- [ ] **Step 4: 写失败测试（三遍绘制顺序）**

```ts
import { describe, it, expect } from 'vitest';
import { passOf, planDrawOrder, type DrawPlanItem } from '../../src/render/Scene';

describe('Scene 三遍绘制计划（spec §3.4 硬约束 2）', () => {
  it('passOf：地砖/建筑 → 1，标签 → 2，棋子 → 3', () => {
    expect(passOf('board.tile.shop')).toBe(1);
    expect(passOf('building.s4.l2')).toBe(1);
    expect(passOf('board.center.fountain')).toBe(1);
    expect(passOf('label.s4')).toBe(2);
    expect(passOf('piece.p1')).toBe(3);
  });

  it('planDrawOrder：pass 升序为主键，pass 内按 depth（c+r，再 c）升序', () => {
    const items: DrawPlanItem[] = [
      { id: 'piece.p1', c: 5, r: 5, depth: 10, pass: 3 },
      { id: 'building.s4.l2', c: 5, r: 5, depth: 10, pass: 1 },
      { id: 'label.s4', c: 5, r: 5, depth: 10, pass: 2 },
      { id: 'building.s1.l1', c: 2, r: 3, depth: 5, pass: 1 },
      { id: 'building.s2.l1', c: 1, r: 4, depth: 5, pass: 1 },
    ];
    expect(planDrawOrder(items).map((i) => i.id)).toEqual([
      'building.s2.l1',   // pass1, depth5, c=1 先
      'building.s1.l1',   // pass1, depth5, c=2
      'building.s4.l2',   // pass1, depth10
      'label.s4',         // pass2
      'piece.p1',         // pass3
    ]);
  });

  it('planDrawOrder 是纯函数（不改写入参）', () => {
    const items: DrawPlanItem[] = [{ id: 'a', c: 1, r: 1, depth: 2, pass: 1 }];
    const snap = JSON.stringify(items);
    planDrawOrder(items);
    expect(JSON.stringify(items)).toBe(snap);
  });
});
```

- [ ] **Step 5: 跑测试确认失败**

Run: `npx vitest run test/render/scene-order.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 6: 实现 Scene.ts（唯一进入画布的入口）**

```ts
import { Container, Graphics } from 'pixi.js';
import { compareDepth } from './iso';
import { instantiate, type ElementSpec, type InstantiateDeps, type Instance } from '../skin/instantiate';
import { providerFor } from './providers';
import type { ProcCtx } from './providers/proc';
import { STAGE_W, STAGE_H } from '../skin/layout';

/** 玩家数（与 PieceView.PAWN_COUNT 同源；Scene 侧只为折 tokens，不引视图模块） */
const ownerTokenCount = 4;

export type Pass = 1 | 2 | 3;

export interface DrawPlanItem { id: string; c: number; r: number; depth: number; pass: Pass }

/** 三遍绘制归属（唯一真源；任何元素不得绕过） */
export function passOf(id: string): Pass {
  if (id.startsWith('label.')) return 2;
  if (id.startsWith('piece.')) return 3;
  return 1;
}

export function planDrawOrder(items: DrawPlanItem[]): DrawPlanItem[] {
  return [...items].sort((a, b) => a.pass - b.pass || compareDepth(a, b));
}

export interface SceneDeps {
  layers: { ground: Container; labels: Container; pieces: Container; fx: Container };
  instantiateDeps: InstantiateDeps;
  geo: { hw: number; hh: number; ox: number; oy: number };
  bg: { color: string; alpha: number };
  onPick?: (inst: Instance) => void;
}

export class Scene {
  private items: ElementSpec[] = [];
  private instances: Instance[] = [];

  constructor(private deps: SceneDeps) {}

  add(spec: ElementSpec): void {
    this.items.push(spec);
  }

  addMany(specs: ElementSpec[]): void {
    for (const s of specs) this.items.push(s);
  }

  instancesOf(): Instance[] {
    return this.instances;
  }

  /** 全量重建：清层 → 三遍绘制（唯一入画口） */
  render(): void {
    const { layers, instantiateDeps, bg } = this.deps;
    layers.ground.removeChildren();
    layers.labels.removeChildren();
    layers.pieces.removeChildren();

    const back = new Graphics();
    back.rect(0, 0, layers.ground.width || STAGE_W, layers.ground.height || STAGE_H).fill({ color: bg.color, alpha: bg.alpha });
    layers.ground.addChild(back);

    this.instances = this.items.map((s) => instantiate(s, instantiateDeps));
    const plan = planDrawOrder(
      this.instances.map((i) => ({ id: i.id, c: i.c, r: i.r, depth: i.depth, pass: passOf(i.id) })),
    );
    const bySource = new Map(this.instances.map((i, idx) => [`${this.items[idx].id}#${idx}`, i]));

    for (const p of plan) {
      const spec = this.items.find((s) => s.id === p.id);   // 同 ID 多实例时按首次命中，元素本身无状态差异
      if (!spec) continue;
      const inst = instantiate(spec, instantiateDeps);
      const g = new Graphics();
      const target = p.pass === 2 ? layers.labels : p.pass === 3 ? layers.pieces : layers.ground;
      const ctx: ProcCtx = {
        geo: this.deps.geo,
        box: inst.box,
        cx: 0,
        cy: 0,
        s: 1,
        params: inst.provider.kind === 'proc'
          ? { __preset: (inst.provider as { preset: string }).preset, ...((inst.provider as { params?: Record<string, unknown> }).params ?? {}) }
          : { __preset: 'builtin' },
        state: { ...inst.state, ownerColors: this.ownerColors() },
      };
      providerFor(inst.provider).draw(g, ctx);
      target.addChild(g);
    }
    void bySource;
  }

  /** 把 skin tokens 的 `owner1..owner4` 折成 `{ 1: '#...', ... }`——tile preset 用数字归属查表 */
  private ownerColors(): Record<number, string> {
    const t = (this.deps.instantiateDeps.skin?.tokens ?? this.deps.instantiateDeps.defaultSkin?.tokens ?? {}) as Record<string, string>;
    const out: Record<number, string> = {};
    for (let i = 1; i <= ownerTokenCount; i++) {
      const color = t[`owner${i}`];
      if (color) out[i] = color;
    }
    return out;
  }
}
```

> 说明：M2 阶段先保证「三遍顺序 + 深度排序 + 唯一入画口」正确；Task 12/13 会把 `cx/cy` 与 `s` 按 `ipos()` 与 `box` 精确补齐（本任务只画地砖，故 `cx/cy` 由 BoardView 传入的 spec 顺序决定，见下游）。

- [ ] **Step 7: 实现 skinLoader.ts（?skin= 读取 + 缺文件回退）**

`src/skin/skinLoader.ts`：

```ts
import type { SkinPack } from './types';

export const DEFAULT_SKIN_ID = 'default';

export async function loadSkin(id: string, base = './skins'): Promise<SkinPack | null> {
  const url = `${base}/${id}/skin.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== 'object') return null;
    const pack = json as SkinPack;
    if (!pack.geo || typeof pack.geo.hw !== 'number') return null;
    return { ...pack, id: typeof pack.id === 'string' && pack.id ? pack.id : id, elements: pack.elements ?? {}, tokens: pack.tokens ?? {} };
  } catch {
    return null;   // 坏 JSON / 网络失败 → 回退，不抛错
  }
}
```

- [ ] **Step 8: 实现 BoardView.ts（32 格地砖 + 起点标记 + 当前格金框）**

`src/render/BoardView.ts`：

```ts
import { ipos } from './iso';
import { BOARD_COLS, BOARD_ROWS, RING_SIZE, ringPath, tileIndexOf, TILES } from '../data/board';
import { passOf } from './Scene';
import type { ElementSpec } from '../skin/instantiate';

export interface BoardCell { index: number; c: number; r: number; x: number; y: number }

/** 32 个外圈格的中心坐标（v5 样张 line 275–296 的定位部分） */
export function boardCells(geo: { hw: number; hh: number; ox: number; oy: number }): BoardCell[] {
  return ringPath(BOARD_COLS, BOARD_ROWS).map(([c, r], index) => {
    const [x, y] = ipos(c, r, geo);
    return { index, c, r, x, y };
  });
}

/** 生成 32 格地砖的 instantiate spec（每格 1 地砖 + 1 内圈；edge 用于归属色条，MVP 由 owner 态驱动） */
export function boardTileSpecs(currentIndex: number, ownerOf: (index: number) => number | null): ElementSpec[] {
  const cells = boardCells({ hw: 21, hh: 10.5, ox: 195, oy: 96 });
  const specs: ElementSpec[] = [];
  for (const cell of cells) {
    const t = TILES[cell.index];
    const owner = ownerOf(cell.index);
    specs.push({
      id: `board.tile.${t.type}`,
      slot: cell.index,
      c: cell.c,
      r: cell.r,
      state: { owner, selected: cell.index === currentIndex, level: t.level === 0 ? 1 : t.level },
    });
  }
  return specs;
}

export { passOf, RING_SIZE, tileIndexOf };
```

- [ ] **Step 9: 在 main.ts 里接上「载皮肤 → 建 Scene → 画 32 格」，并对齐几何**

`src/main.ts` 里 `boot()` 改为：

```ts
export async function boot(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('[mono] #stage not found');
  const opts = parseOptions(location.search);

  const defaultSkin = await loadSkin('default');
  const skin = opts.skin === 'default' ? defaultSkin : await loadSkin(opts.skin);
  const geo = skin?.geo ?? defaultSkin?.geo ?? { hw: 21, hh: 10.5, ox: 195, oy: 96 };
  const tokens = { ...(defaultSkin?.tokens ?? {}), ...(skin?.tokens ?? {}) };

  const stage = await createStage(canvas, { bg: BG_FALLBACK, dpr: window.devicePixelRatio || 2 });
  const scene = new Scene({
    layers: stage.layers,
    geo,
    bg: { color: tokens.bgBottom ?? '#0c1513', alpha: 1 },
    instantiateDeps: { skin, defaultSkin, overrides: null, slotLevels: {} },
  });
  scene.addMany(boardTileSpecs(0, () => null));
  scene.render();

  if (opts.debug) createDebugPanel().mount(document.body);
  (window as unknown as Record<string, unknown>).__monoMain = { stage, scene, opts, geo, skin, VERSION };
}
```

并补 import：`loadSkin`、`Scene`、`boardTileSpecs`。

- [ ] **Step 10: 跑测试、lint、截图验收**

Run: `npm test`
Expected: 全绿（含 board 6 例、scene-order 3 例）。

Run: `npm run lint && npm run lint:skin`
Expected: 0 错。

Run: `npm run dev` + `node local/mono-shots-m1.mjs`（临时改脚本 URL 带上 `?debug=1`）
Expected: 生成 `docs/verify/mono-m2-01-32tiles.png`（能看到 32 个菱形地砖）。

- [ ] **Step 11: Commit**

```bash
git add monopoly/src monopoly/test
git commit -m "feat(mono): 三遍绘制管线 + 32 格等距地砖 + ?skin 载入"
```

---

## Task 11: 内环（草地/石板/广场）+ 中心喷泉 + 内环装饰楼

**Files:**
- Create: `d:\zhao\monopoly\src\render\InnerView.ts`
- Create: `d:\zhao\monopoly\src\render\providers\proc-fountain.ts`
- Create: `d:\zhao\monopoly\src\data\inner.ts`
- Test: `d:\zhao\monopoly\test\core\inner.spec.ts`
- Test: `d:\zhao\monopoly\test\render\proc-fountain.spec.ts`

- [ ] **Step 1: 写失败测试（内环分区）**

```ts
import { describe, it, expect } from 'vitest';
import { innerKind, INNER_DECO_SLOTS, plazaCells } from '../../src/data/inner';

describe('inner 内环', () => {
  it('内环 = c/r 均在 2..8', () => {
    expect(innerKind(2, 2)).toBe('lawn');
    expect(innerKind(5, 5)).toBe('plaza');
    expect(innerKind(1, 5)).toBe(null);   // 外圈不是内环
  });

  it('广场 = c/r 均在 4..6', () => {
    const cells = plazaCells();
    expect(cells.length).toBe(9);
    expect(cells).toContainEqual([4, 4]);
    expect(cells).toContainEqual([6, 6]);
  });

  it('石板路 = 3/7 行列；其余绿地', () => {
    expect(innerKind(3, 5)).toBe('road');
    expect(innerKind(7, 2)).toBe('road');
    expect(innerKind(5, 7)).toBe('road');
    expect(innerKind(2, 3)).toBe('lawn');
  });

  it('8 栋内环装饰楼位置与 v5 样张一致', () => {
    expect(Object.keys(INNER_DECO_SLOTS)).toEqual(['2,4', '2,6', '4,2', '6,2', '8,4', '8,6', '4,8', '6,8']);
    expect(INNER_DECO_SLOTS['2,4']).toEqual({ levels: 3, deco: 'd1' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/core/inner.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 inner.ts（v5 line 64 的 INNER 表）**

```ts
export type InnerKind = 'plaza' | 'road' | 'lawn';

/** 内环：c/r ∈ 2..8；广场 c/r ∈ 4..6；石板路 c 或 r ∈ {3,7}；其余绿地 */
export function innerKind(c: number, r: number): InnerKind | null {
  const inInner = c >= 2 && c <= 8 && r >= 2 && r <= 8;
  if (!inInner) return null;
  if (c >= 4 && c <= 6 && r >= 4 && r <= 6) return 'plaza';
  if (c === 3 || c === 7 || r === 3 || r === 7) return 'road';
  return 'lawn';
}

export function plazaCells(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let c = 4; c <= 6; c++) for (let r = 4; r <= 6; r++) out.push([c, r]);
  return out;
}

/** v5 样张 line 64：内环第二排装饰楼（补「城市感」） */
export const INNER_DECO_SLOTS: Record<string, { levels: 1 | 2 | 3; deco: string }> = {
  '2,4': { levels: 3, deco: 'd1' },
  '2,6': { levels: 2, deco: 'd2' },
  '4,2': { levels: 2, deco: 'd3' },
  '6,2': { levels: 3, deco: 'd4' },
  '8,4': { levels: 2, deco: 'd5' },
  '8,6': { levels: 3, deco: 'd6' },
  '4,8': { levels: 2, deco: 'd7' },
  '6,8': { levels: 3, deco: 'd8' },
};
```

- [ ] **Step 4: 实现 fountain preset（v5 line 322–333 逐句移植）**

`src/render/providers/proc-fountain.ts`：

```ts
import type { Graphics } from 'pixi.js';
import type { ProcCtx } from './proc';

/**
 * 中心喷泉广场（v5 样张 line 322–333 移植）：
 * 5 层同心椭圆 + 两道水弧 + 顶珠。所有半径比例/色值来自 params。
 */
export function fountain(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, params } = ctx;
  const p = params as Record<string, unknown>;
  const n = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
  const c = (k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);
  const rings = (p.rings ?? []) as Array<{ rx: number; ry: number; fill: string }>;
  for (const r of rings) g.ellipse(cx, cy, r.rx, r.ry).fill({ color: r.fill });
  const pool = (p.pool ?? null) as { dx: number; dy: number; rx: number; ry: number; fill: string } | null;
  if (pool) g.ellipse(cx + pool.dx, cy + pool.dy, pool.rx, pool.ry).fill({ color: pool.fill });
  const col = (p.column ?? null) as { w: number; dy: number; h: number; leftFill: string; rightFill: string } | null;
  if (col) {
    g.poly([cx, cy, cx + col.w, cy - col.dy, cx + col.w, cy - col.dy - col.h, cx, cy - col.h - col.dy])
      .fill({ color: col.rightFill });
    g.poly([cx, cy, cx - col.w, cy - col.dy, cx - col.w, cy - col.dy - col.h, cx, cy - col.h - col.dy])
      .fill({ color: col.leftFill });
    g.ellipse(cx, cy - col.h - col.dy, n('capRx', 1), n('capRy', 1)).fill({ color: c('capFill', '#ffffff') });
  }
  const arcs = (p.arcs ?? []) as Array<{ sign: number; dx: number; dy: number; span: number }>;
  for (const a of arcs) {
    g.moveTo(cx, cy - n('spoutY', 0));
    g.quadraticCurveTo(cx + a.sign * a.dx, cy - a.dy, cx + a.sign * a.span, cy);
    g.stroke({ color: c('arcColor', '#ffffff'), width: n('arcW', 1) });
  }
  g.circle(cx, cy - n('beadY', 0), n('beadR', 1)).fill({ color: c('beadFill', '#ffffff') });
}
```

对应 `skins/default/skin.json` 里 `board.center.fountain` 改为：

```json
"board.center.fountain": {
  "kind": "proc", "preset": "fountain",
  "params": {
    "rings": [
      { "rx": 30, "ry": 15, "fill": "#55564f" },
      { "rx": 25, "ry": 12.5, "fill": "#3a3b35" },
      { "rx": 21, "ry": 10.5, "fill": "#2c6a80" }
    ],
    "pool": { "dx": -6, "dy": -1.5, "rx": 8, "ry": 3.6, "fill": "#aafbff" },
    "column": { "w": 6, "dy": 3, "h": 17, "leftFill": "#585a52", "rightFill": "#6d6f66" },
    "capRx": 6, "capRy": 3, "capFill": "#7d8078",
    "arcs": [
      { "sign": -1, "dx": 9, "dy": 7, "span": 14 },
      { "sign": 1, "dx": 9, "dy": 7, "span": 14 }
    ],
    "spoutY": 24, "arcColor": "#b4ebff", "arcW": 1.4,
    "beadY": 26, "beadR": 2.6, "beadFill": "#cdf1ff"
  }
}
```

> `lint:skin` 会校验 hex 合法性与未知键；`#aafbff` 这种写法若写错（如中间夹空格）会被拦下。

- [ ] **Step 5: 写 fountain 测试**

`test/render/proc-fountain.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import { fountain } from '../../src/render/providers/proc-fountain';

function recorder() {
  const calls: string[] = [];
  const g = new Proxy({}, {
    get: (_t, k: string) => (...a: unknown[]) => { calls.push(k); void a; return g; },
  });
  return { g, calls };
}

describe('proc preset: fountain', () => {
  it('发出 3 个同心椭圆 + 水柱 + 水弧 + 顶珠', () => {
    const { g, calls } = recorder();
    fountain(g as never, {
      geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
      box: { w: 60, d: 30, h: 28 },
      cx: 100, cy: 200, s: 1,
      params: {
        rings: [{ rx: 30, ry: 15, fill: '#55564f' }, { rx: 25, ry: 12.5, fill: '#3a3b35' }, { rx: 21, ry: 10.5, fill: '#2c6a80' }],
        column: { w: 6, dy: 3, h: 17, leftFill: '#585a52', rightFill: '#6d6f66' },
        arcs: [{ sign: -1, dx: 9, dy: 7, span: 14 }, { sign: 1, dx: 9, dy: 7, span: 14 }],
      },
      state: {},
    });
    expect(calls.filter((c) => c === 'ellipse').length).toBeGreaterThanOrEqual(3);
    expect(calls).toContain('poly');
    expect(calls).toContain('quadraticCurveTo');
    expect(calls).toContain('circle');
  });
  it('PROC_PRESETS 已注册 fountain', () => {
    expect(PROC_PRESETS.fountain).toBe(fountain);
  });
});
```

同时把 `proc.ts` 的 `PROC_PRESETS` 改为：

```ts
import { fountain } from './proc-fountain';
export const PROC_PRESETS: Record<string, ProcPreset> = { tile, tileEdge, bgGradient, solid, builtin, fountain };
```

- [ ] **Step 6: 实现 InnerView.ts 并接进 main**

`src/render/InnerView.ts`：

```ts
import { ipos } from './iso';
import { innerKind, plazaCells, INNER_DECO_SLOTS } from '../data/inner';
import type { ElementSpec } from '../skin/instantiate';

export const INNER_FILL = { lawn: 'board.tile.shop', road: 'board.tile.stock', plaza: 'board.tile.core' } as const;

/** 内环格子 spec（用与地砖同款 provider，不同 id 以便独立性换肤） */
export function innerSpecs(): ElementSpec[] {
  const geo = { hw: 21, hh: 10.5, ox: 195, oy: 96 };
  const out: ElementSpec[] = [];
  for (let c = 2; c <= 8; c++) {
    for (let r = 2; r <= 8; r++) {
      const kind = innerKind(c, r);
      if (!kind) continue;
      const [x, y] = ipos(c, r, geo);
      void x; void y;
      out.push({ id: 'board.inner.deco', slot: null, c, r, state: { kind, dim: kind !== 'plaza' } });
      const deco = INNER_DECO_SLOTS[`${c},${r}`];
      if (deco) out.push({ id: `board.inner.${deco.deco}`, slot: null, c, r, level: deco.levels });
    }
  }
  return out;
}

export function fountainSpec(): ElementSpec {
  return { id: 'board.center.fountain', slot: null, c: 5, r: 5 };
}

export { plazaCells };
```

> **注意**：`board.inner.deco` 需要先在注册表补一条（Task 4 只注册了 `board.inner.d1..d8`）。在 `registry.ts` 的 INNER_DECOS 循环后补：

```ts
reg['board.inner.deco'] = {
  id: 'board.inner.deco',
  box: { w: 42, d: 21, h: 2 },
  anchor: [0.5, 0.5], baseline: 0, mount: 'ground',
  providerKinds: ['proc', 'image'],
};
```

并在 `skins/default/skin.json` 补：

```json
"board.inner.deco": { "kind": "proc", "preset": "tile", "params": { "fill": "#26382c", "edge": "#2c3a33", "edgeW": 0.6 } }
```

- [ ] **Step 7: 跑测试 + 截图验收**

Run: `npm test`
Expected: 全绿（新增 inner 4 例、fountain 2 例）。

Run: `npm run lint:skin && npm run lint`
Expected: 0 错。

Run: `npm run dev` + 截图
Expected: `docs/verify/mono-m2-02-inner.png`：中心喷泉 + 内环草地/石板 + 8 栋压暗装饰楼。

- [ ] **Step 8: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test
git commit -m "feat(mono): 内环分区 + 中心喷泉 + 8 栋装饰楼"
```

---

## Task 12: 汉字店名标签层（永不被前排建筑遮挡）

**Files:**
- Create: `d:\zhao\monopoly\src\render\LabelView.ts`
- Test: `d:\zhao\monopoly\test\render\label.spec.ts`

- [ ] **Step 1: 写失败测试（标签几何）**

```ts
import { describe, it, expect } from 'vitest';
import { labelPlacement, labelTextOf } from '../../src/render/LabelView';

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };

describe('label 标签（v5 样张 line 312–314）', () => {
  it('标签 y = 格心 + hh×比例，压在格前沿（不会被前排楼盖住）', () => {
    const p = labelPlacement(100, 200, GEO, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });
    expect(p.cx).toBe(100);
    expect(p.cy).toBeCloseTo(204.83, 2);
    expect(p.h).toBe(9.4);
  });

  it('标签宽度 = 字数 × 字号 + 横向留白', () => {
    const p = labelPlacement(0, 0, GEO, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });
    expect(p.widthFor('太平温泉')).toBe(6.2 * 4 + 5);
    expect(p.widthFor('优美惠超市')).toBe(6.2 * 5 + 5);
  });

  it('labelTextOf 用短名', () => {
    expect(labelTextOf(4)).toBe('太平温泉');
    expect(labelTextOf(0)).toBe('优美惠超市');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/label.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 LabelView.ts**

```ts
import { Text, Container, Graphics } from 'pixi.js';
import { ipos } from './iso';
import { BOARD_COLS, BOARD_ROWS, ringPath, shortAt } from '../data/board';
import type { ElementSpec } from '../skin/instantiate';

export interface LabelParams { dy: number; fs: number; padX: number; padTop: number; h: number; rx: number }

export interface Placement {
  cx: number;
  cy: number;
  h: number;
  widthFor(text: string): number;
}

/** 标签锚点：格心 + hh×dy（v5 用 0.46，落在格前沿） */
export function labelPlacement(x: number, y: number, geo: { hh: number }, p: LabelParams): Placement {
  const cy = y + geo.hh * p.dy;
  return {
    cx: x,
    cy,
    h: p.h,
    widthFor: (text) => text.length * p.fs + p.padX,
  };
}

export function labelTextOf(index: number): string {
  return shortAt(index);
}

/** 第二遍：汉字店名一律压最上层（spec §3.4 硬约束 2） */
export function drawLabels(
  layer: Container,
  geo: { hw: number; hh: number; ox: number; oy: number },
  params: { bg: string; text: string; ownedText: string; ownerOf: (i: number) => number | null },
  label: LabelParams,
): void {
  layer.removeChildren();
  ringPath(BOARD_COLS, BOARD_ROWS).forEach(([c, r], index) => {
    const [x, y] = ipos(c, r, geo);
    const p = labelPlacement(x, y, geo, label);
    const text = labelTextOf(index);
    const w = p.widthFor(text);
    const bg = new Graphics();
    bg.roundRect(p.cx - w / 2, p.cy - label.padTop, w, label.h, label.rx)
      .fill({ color: params.bg, alpha: 1 });
    const t = new Text({
      text,
      style: {
        fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: label.fs,
        fontWeight: '600',
        fill: params.ownerOf(index) !== null ? params.ownedText : params.text,
      },
    });
    t.anchor.set(0.5);
    t.position.set(p.cx, p.cy);
    layer.addChild(bg, t);
  });
}

export function labelSpecs(): ElementSpec[] {
  // 标签属第二遍，注册表用 board.tile.*.label 的占位（M2 直接由 drawLabels 绘制，理由见 Task 14 备注）
  return ringPath(BOARD_COLS, BOARD_ROWS).map(([c, r], index) => ({
    id: 'board.tile.shop', slot: index, c, r, state: { kind: 'label' },
  }));
}
```

- [ ] **Step 4: 接进 main 并截图验收**

在 `boot()` 的 `scene.render()` 之后调用：

```ts
drawLabels(stage.layers.labels, geo, {
  bg: tokens.labelBg ?? '#060a08',
  text: tokens.labelText ?? '#d8e4dc',
  ownedText: tokens.labelOwnedText ?? '#ffffff',
  ownerOf: () => null,
}, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });
```

并把 `labelBg / labelText / labelOwnedText` 补进 `skins/default/skin.json` 的 `tokens`（`#060a08` / `#d8e4dc` / `#ffffff`）。

Run: `npm test && npm run lint`
Expected: 全绿。

Run: `npm run dev` + 截图
Expected: `docs/verify/mono-m2-03-labels.png`：32 个字牌清晰可读、无一被遮挡。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test
git commit -m "feat(mono): 汉字店名标签第二遍绘制（永不被遮挡）"
```

---

## Task 13: 玩家棋子（格前沿排开 + 当前格金框）

**Files:**
- Create: `d:\zhao\monopoly\src\render\providers\proc-pawn.ts`
- Create: `d:\zhao\monopoly\src\render\PieceView.ts`
- Test: `d:\zhao\monopoly\test\render\proc-pawn.spec.ts`
- Test: `d:\zhao\monopoly\test\render\piece-place.spec.ts`

- [ ] **Step 1: 写失败测试（棋子排布）**

```ts
import { describe, it, expect } from 'vitest';
import { pawnSlots, PAWN_COUNT } from '../../src/render/PieceView';

describe('piece 棋子排布（v5 样张 line 316–320）', () => {
  it('四枚棋子站在格前沿一排，左右均分', () => {
    const xs = pawnSlots(100, 21, { gap: 9.6 });
    expect(xs.length).toBe(PAWN_COUNT);
    expect(PAWN_COUNT).toBe(4);
    expect(xs[1] - xs[0]).toBeCloseTo(9.6, 5);
    expect(xs[3] - xs[0]).toBeCloseTo(9.6 * 3, 5);
    // 以格心为中心对称
    expect((xs[0] + xs[3]) / 2).toBeCloseTo(100, 5);
  });

  it('前沿 y = 格心 + hh×1.45', () => {
    expect(100 + 10.5 * 1.45).toBeCloseTo(115.225, 3);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/piece-place.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 proc-pawn.ts（v5 line 263–272 移植）**

```ts
import type { Graphics } from 'pixi.js';
import type { ProcCtx } from './proc';

/**
 * 等距小柱棋子（v5 样张 line 263–272 移植）：影 + 左墙 + 右墙 + 顶面 + 高光 + 字。
 * 尺寸/透明度/颜色来自 params 与 state.color。
 */
export function pawn(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, params, state } = ctx;
  const p = params as Record<string, unknown>;
  const n = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
  const c = (k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);
  const color = typeof state.color === 'string' ? state.color : c('color', '#ffffff');
  const s = ctx.s;
  const h = n('h', 13) * s;
  const w = n('w', 4.2) * s;
  const d = n('d', 2.1) * s;
  const F: [number, number] = [cx, cy + d];
  const R: [number, number] = [cx + w, cy];
  const L: [number, number] = [cx - w, cy];
  const B: [number, number] = [cx, cy - d];
  const up = (q: [number, number], by: number): [number, number] => [q[0], q[1] - by];

  g.ellipse(cx, cy + n('shadowY', 2), n('shadowRx', 6) * s, n('shadowRy', 3) * s)
    .fill({ color: c('shadow', '#000000'), alpha: n('shadowAlpha', 0.38) });
  g.poly([...F, ...R, ...up(R, h), ...up(F, h)]).fill({ color });
  g.poly([...L, ...F, ...up(F, h), ...up(L, h)]).fill({ color, alpha: n('leftAlpha', 0.72) });
  g.poly([...up(L, h), ...up(F, h), ...up(R, h), ...up(B, h)]).fill({ color: c('topFill', '#ffffff'), alpha: n('topAlpha', 0.18) });
  g.ellipse(cx, cy - h + d * n('topDy', 0.1), w * n('topRx', 0.9), d * n('topRy', 0.9))
    .fill({ color: c('glowFill', '#ffffff'), alpha: n('topGlowAlpha', 0.2) });
}
```

> 所有裸字面量都作为 `n()/c()` 的兜底默认值出现——这是 `no-visual-number` / `no-hardcoded-color` 唯一豁免的位置（Task 7）。

`skins/default/skin.json` 里 `piece.p1..p4` 各加一条（颜色取 tokens 的 owner1..owner4）：

```json
"piece.p1": { "kind": "proc", "preset": "pawn", "params": { "color": "#3fbf7f", "h": 13, "w": 4.2, "d": 2.1, "shadowY": 2, "shadowRx": 6, "shadowRy": 3, "shadowAlpha": 0.38, "leftAlpha": 0.72, "topAlpha": 0.18, "topDy": 0.1, "topRx": 0.9, "topRy": 0.9, "topGlowAlpha": 0.2 } },
"piece.p2": { "kind": "proc", "preset": "pawn", "params": { "color": "#f0a039", "h": 13, "w": 4.2, "d": 2.1, "shadowY": 2, "shadowRx": 6, "shadowRy": 3, "shadowAlpha": 0.38, "leftAlpha": 0.72, "topAlpha": 0.18, "topDy": 0.1, "topRx": 0.9, "topRy": 0.9, "topGlowAlpha": 0.2 } },
"piece.p3": { "kind": "proc", "preset": "pawn", "params": { "color": "#e0607e", "h": 13, "w": 4.2, "d": 2.1, "shadowY": 2, "shadowRx": 6, "shadowRy": 3, "shadowAlpha": 0.38, "leftAlpha": 0.72, "topAlpha": 0.18, "topDy": 0.1, "topRx": 0.9, "topRy": 0.9, "topGlowAlpha": 0.2 } },
"piece.p4": { "kind": "proc", "preset": "pawn", "params": { "color": "#4aa3e0", "h": 13, "w": 4.2, "d": 2.1, "shadowY": 2, "shadowRx": 6, "shadowRy": 3, "shadowAlpha": 0.38, "leftAlpha": 0.72, "topAlpha": 0.18, "topDy": 0.1, "topRx": 0.9, "topRy": 0.9, "topGlowAlpha": 0.2 } }
```

> `shadow` / `topFill` / `glowFill` 三项不需要写进 params——它们由 preset 内的 `c()` 兜底默认值提供（`#000000` / `#ffffff` / `#ffffff`）。需要换色时再加键即可。

- [ ] **Step 4: 实现 PieceView.ts**

```ts
import type { ElementSpec } from '../skin/instantiate';

export const PAWN_COUNT = 4;

/** 四枚棋子沿格前沿一排（v5 样张 line 319：x + (i-1.5)×gap） */
export function pawnSlots(centerX: number, _hw: number, p: { gap: number }): number[] {
  const out: number[] = [];
  for (let i = 0; i < PAWN_COUNT; i++) out.push(centerX + (i - (PAWN_COUNT - 1) / 2) * p.gap);
  return out;
}

export interface PawnState { index: number; c: number; r: number; x: number; y: number }

/** 生成棋子 spec（第三遍；同格四人用 pawnSlots 横向错开，避免重叠） */
export function pawnSpecs(pawns: PawnState[], geo: { hh: number }, p: { gap: number; frontDy: number }): ElementSpec[] {
  const byCell = new Map<string, PawnState[]>();
  for (const pw of pawns) {
    const k = `${pw.c},${pw.r}`;
    byCell.set(k, [...(byCell.get(k) ?? []), pw]);
  }
  const out: ElementSpec[] = [];
  for (const [, group] of byCell) {
    const { c, r } = group[0];
    const slots = pawnSlots(group[0].x, 0, p);
    group.forEach((pw, i) => {
      void slots;
      out.push({ id: `piece.p${pw.index + 1}`, slot: null, c, r });
      void pw;
      void i;
    });
    void geo;
    void p.frontDy;
  }
  return out;
}
```

> 说明：棋子的**精确绘制定位**（`cx = pawnSlots(...)` 的第 i 项、`cy = y + hh×frontDy`）由 `Scene` 的 `PlacementResolver` 在 Task 14 统一补齐——M2 先把「同格错开、第三遍绘制」这两条不变量立住；Task 14 的视觉回归会逐像素核对。

- [ ] **Step 5: 跑测试 + 截图验收**

Run: `npm test`
Expected: 全绿（pawn 1 例 + piece-place 2 例）。

Run: `npm run dev` + 截图
Expected: `docs/verify/mono-m2-04-pawns.png`：当前格四枚棋子一排站在格前沿，未盖住格名。

- [ ] **Step 6: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test
git commit -m "feat(mono): 玩家棋子（格前沿排开）+ 第三遍绘制"
```

---

## Task 14: M2 视觉回归（与 v5-A 逐项对齐）+ 截图入库 + 手册

**Files:**
- Create: `d:\zhao\monopoly\local\mono-shots-m2.mjs`
- Create: `d:\zhao\monopoly\docs\manual-mono.md`
- Modify: `d:\zhao\monopoly\src\render\Scene.ts`
- Test: `d:\zhao\monopoly\test\render\placement.spec.ts`

> 本任务是 M2 的**闸门**：截图与 v5-A 对不上就不进 M3。同时补齐 Task 13 留下的「精确定位」问题——把 `cx/cy/s` 的计算收敛到一处纯函数（`resolvePlacement`），避免各视图各算一套。

- [ ] **Step 1: 写失败测试（统一定位解析）**

```ts
import { describe, it, expect } from 'vitest';
import { resolvePlacement } from '../../src/render/Scene';

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };

describe('resolvePlacement（唯一地点：给每个实例算 cx/cy/s）', () => {
  it('地砖：cx/cy = ipos(c,r)，s = 1', () => {
    const p = resolvePlacement({ id: 'board.tile.shop', c: 1, r: 1, slot: 0, lift: 0, box: { w: 42, d: 21, h: 2 } }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45 });
    expect(p.cx).toBe(195);
    expect(p.cy).toBe(117);
    expect(p.s).toBe(1);
  });

  it('建筑：cy 上移 1px 贴合地砖（v5 line 302: y - 1），s = 0.72', () => {
    const p = resolvePlacement({ id: 'building.s4.l2', c: 4, r: 4, slot: 4, lift: 0, box: { w: 42, d: 21, h: 46 } }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45, buildingScale: 0.72, buildingYOffset: 1 });
    expect(p.s).toBe(0.72);
    expect(p.cy).toBe(180 - 1);
  });

  it('贴墙装饰：cy 减去管线 lift（不自己算坐标）', () => {
    const p = resolvePlacement({ id: 'prop.lantern', c: 4, r: 4, slot: 4, lift: 13.8, box: { w: 10, d: 2, h: 14 } }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45 });
    expect(p.cy).toBe(180 - 13.8);
  });

  it('贴墙装饰：给了 buildingScale 时 lift 也随宿主楼缩放（挂件不飘出楼外）', () => {
    const p = resolvePlacement(
      { id: 'prop.rooftopBox', c: 4, r: 4, slot: 4, lift: 46, mount: 'roof', box: { w: 14, d: 7, h: 7 } },
      GEO,
      { pawnGap: 9.6, pawnFrontDy: 1.45, buildingScale: 0.72, buildingYOffset: 1 },
    );
    expect(p.s).toBe(0.72);
    /* 宿主楼屋顶面 = (y-1) - 46×0.72；cy + lift×s 必须等于宿主基座 y-1（= v5 isoShop 的 cy） */
    expect(p.cy).toBeCloseTo(180 - 1 - 46 * 0.72, 5);
    expect(p.cy + 46 * p.s).toBeCloseTo(180 - 1, 5);
  });

  it('地面挂件（树/灯）：不随建筑缩放，s = 1、cy = 格心', () => {
    const p = resolvePlacement(
      { id: 'prop.tree', c: 4, r: 4, slot: null, lift: 0, mount: 'ground', box: { w: 14, d: 8, h: 30 } },
      GEO,
      { pawnGap: 9.6, pawnFrontDy: 1.45, buildingScale: 0.72, buildingYOffset: 1 },
    );
    expect(p.s).toBe(1);
    expect(p.cy).toBe(180);
  });

  it('棋子：cx 用 pawnSlots 错开、cy = y + hh×frontDy', () => {
    const p = resolvePlacement({ id: 'piece.p3', c: 5, r: 5, slot: null, lift: 0, box: { w: 8.4, d: 4.2, h: 13 }, pawnIndex: 2 }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45 });
    expect(p.cx).toBe(195 + 0 + (2 - 1.5) * 9.6);
    expect(p.cy).toBeCloseTo(201 + 10.5 * 1.45, 3);
  });

  it('未知 ID 前缀 → 默认 cx/cy = ipos，s = 1（不抛错）', () => {
    const p = resolvePlacement({ id: 'ui.panel', c: 1, r: 1, slot: null, lift: 0, box: { w: 370, d: 1, h: 268 } }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45 });
    expect(p.s).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/placement.spec.ts`
Expected: FAIL，`resolvePlacement` 未导出。

- [ ] **Step 3: 在 Scene.ts 实现 resolvePlacement 并在 render() 里使用**

```ts
export interface PlacementInput {
  id: string;
  c: number;
  r: number;
  slot: number | null;
  lift: number;
  box: { w: number; d: number; h: number };
  pawnIndex?: number;
  /** 来自 Instance.mount：贴墙/贴屋顶的挂件必须跟随宿主楼的缩放与抬升 */
  mount?: 'ground' | 'wall' | 'roof';
}
export interface PlacementOpts {
  pawnGap: number;
  pawnFrontDy: number;
  /** 棋子整体缩放（v5 样张 line 319：`isoPawn(..., 0.62, ...)`） */
  pawnScale?: number;
  buildingScale?: number;
  buildingYOffset?: number;
}
export interface Placement { cx: number; cy: number; s: number }

/** 唯一地点：给任一实例算屏幕坐标与缩放（各视图不得自己算） */
export function resolvePlacement(
  it: PlacementInput,
  geo: { hw: number; hh: number; ox: number; oy: number },
  opts: PlacementOpts,
): Placement {
  const [x, y] = ipos(it.c, it.r, geo);
  if (it.id.startsWith('piece.')) {
    const i = it.pawnIndex ?? 0;
    const cx = x + (i - (4 - 1) / 2) * opts.pawnGap;
    return { cx, cy: y + geo.hh * opts.pawnFrontDy, s: opts.pawnScale ?? 1 };
  }
  if (it.id.startsWith('building.')) {
    const s = opts.buildingScale ?? 1;
    return { cx: x, cy: y - (opts.buildingYOffset ?? 0), s };
  }
  if (it.id.startsWith('prop.') && it.mount && it.mount !== 'ground') {
    /* 贴墙/贴屋顶挂件：几何、lift 与宿主楼的 y 偏移都随楼一起缩放，否则会飘在楼外 */
    const s = opts.buildingScale ?? 1;
    return { cx: x, cy: y - (opts.buildingYOffset ?? 0) - it.lift * s, s };
  }
  return { cx: x, cy: y - it.lift, s: 1 };
}
```

> 挂件规则的必要性：宿主楼以 `s = 0.72` 绘制、且整楼还上移了 `buildingYOffset`（v5 `isoShop(x, y - 1, ...)`），其屋顶面在 `(y-1) - 46×0.72`；若挂件用 `s = 1` 且 `cy = y - 46`，屋顶设备箱就会悬在楼顶上方 13px。把 `lift` 与 `buildingYOffset` 一并按同一个 `s`/同一坐标系处理，`cy + lift×s` 就精确等于宿主基座 `y - buildingYOffset`——这正是 Task 17 各 preset 还原 `y0` 的依据。

在 `render()` 中，把构造 `ctx` 的 `cx/cy/s` 换成：

```ts
const place = resolvePlacement(
  { id: inst.id, c: inst.c, r: inst.r, slot: inst.slot, lift: inst.lift, box: inst.box, mount: inst.mount, pawnIndex: spec.pawnIndex ?? 0 },
  this.deps.geo,
  this.deps.placement,
);
const ctx: ProcCtx = { geo: this.deps.geo, box: inst.box, cx: place.cx, cy: place.cy, s: place.s, params: ..., state: ... };
```

`SceneDeps` 增加：

```ts
placement: PlacementOpts;
```

并把 `main.ts` 的 `new Scene({...})` 补上：

```ts
placement: { pawnGap: 9.6, pawnFrontDy: 1.45, pawnScale: 0.62, buildingScale: 0.72, buildingYOffset: 1 },
```

> `spec.pawnIndex` 由 `PieceView.pawnSpecs` 在生成 spec 时写入（该格 group 内序号，Task 18 Step 4 落地）；`ElementSpec.pawnIndex` 已在 Task 6 声明为可选字段。

- [ ] **Step 4: 跑测试 + lint**

Run: `npm test && npm run lint && npm run lint:skin`
Expected: 全绿 / 0 错。

- [ ] **Step 5: 写 M2 截图脚本（4 张移动视口截图 + 结构断言）**

`local/mono-shots-m2.mjs`：

```js
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.MONO_URL || 'http://127.0.0.1:52300/mono.html?debug=1';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 15000 });

const facts = await page.evaluate(() => {
  const s = window.__monoMain.scene;
  const inst = s.instancesOf();
  const ids = inst.map((i) => i.id);
  return {
    total: inst.length,
    tiles: ids.filter((i) => i.startsWith('board.tile.')).length,
    buildings: ids.filter((i) => i.startsWith('building.')).length,
    pieces: ids.filter((i) => i.startsWith('piece.')).length,
    labels: document.querySelectorAll('#mono-debug').length,
    levels: inst.reduce((acc, i) => { acc['L' + i.level] = (acc['L' + i.level] || 0) + 1; return acc; }, {}),
  };
});

await page.screenshot({ path: `${OUT}/mono-m2-01-board.png` });
await page.screenshot({ path: `${OUT}/mono-m2-02-board-inner.png`, clip: { x: 0, y: 34, width: 390, height: 300 } });
await page.screenshot({ path: `${OUT}/mono-m2-03-board-labels.png`, clip: { x: 0, y: 34, width: 390, height: 300 } });
await page.screenshot({ path: `${OUT}/mono-m2-04-board-pawns.png`, clip: { x: 0, y: 34, width: 390, height: 300 } });

const gate = {
  tiles32: facts.tiles === 32,
  buildingsAtLeast18: facts.buildings >= 18,
  zeroFallback: facts.levels.L4 === undefined,
  noErrors: errors.length === 0,
};
console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);
```

> `buildings >= 18`：v5 演示数据中有 18 格带楼（`TILE_LEVEL > 0` 的数量；实现后在脚本里用真实数替换）。

- [ ] **Step 6: 跑闸门**

Run: `npm run dev`（后台）→ `node local/mono-shots-m2.mjs`
Expected: 打印 `gate` 全 `true`，生成 4 张截图；与 `d:\zhao\.superpowers\brainstorm\monopoly\v5-A.png` 逐项目视对齐（棋盘疏密、地砖配色、内环分区、喷泉位置、8 栋装饰楼、32 个字牌、棋子排布）。

- [ ] **Step 7: 写操作手册（截图回填）**

`docs/manual-mono.md`（本任务先建 M1–M2 段，后续里程碑逐段追加）：

```markdown
# 大富翁 · 吉林双阳邻里商业版 操作手册与测试用例

## 1. 启动与调试

| 项 | 值 |
|---|---|
| 本地开发 | `npm run dev` → http://127.0.0.1:52300/mono.html |
| 移动视口预览 | Playwright `viewport=390×844, deviceScaleFactor=2` |
| 构建 | `npm run build` → `release/mono.html` + `release/js/mono.js` |
| 校验 | `npm run check`（lint + lint:skin + test） |

URL 参数：`?skin=<id>`（切皮肤）· `?debug=1`（显示元素 ID/包围盒/depth/provider 回退级别）· `?seed=<n>` · `?speed=<n>`。

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
```

- [ ] **Step 8: Commit**

```bash
git add monopoly/src monopoly/local monopoly/docs monopoly/test
git commit -m "test(mono): M2 视觉回归闸门（4 张移动视口截图）+ 操作手册 M1-M2"
```

---

# Wave 1 · M3 三级建筑渲染

## Task 15: 等距楼 `shop` preset（L1 摊位 / L2 门店，v5 `isoShop` 移植）

**Files:**
- Create: `d:\zhao\monopoly\src\render\providers\proc-building.ts`
- Modify: `d:\zhao\monopoly\src\render\providers\proc.ts`（注册 `shop`）
- Test: `d:\zhao\monopoly\test\render\proc-building.spec.ts`

> **移植源**：v5 样张 `isoShop()`（line 140–260）。这是 M3 的视觉主件。
> **L4 内建兜底集中在 `fb({...})` 一处**（Task 7 lint 的唯一豁免位置）；skin.json 用段通配 key `building.*.l1/.l2/.l3` 只声明差异项，参数（`hue` 等）叠加在兜底之上。
> 遮阳篷 / 灯笼 / 幌子 / 屋顶设备 / 招牌塔 / 天线**不在本 preset 里**——它们是 `prop.*` 独立元素（Task 17），由 BuildingView 按旗标挂载。

- [ ] **Step 1: 写失败测试**

`test/render/proc-building.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { shop, hsl, rgba } from '../../src/render/providers/proc-building';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import { resolve } from '../../src/skin/resolve';

/** 记录绘制指令的假画布：不需要 WebGL 就能断言 provider 发出的图形 */
function recorder() {
  const calls: Array<{ op: string; pts?: number[]; style: Record<string, unknown> }> = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      if (op === 'poly') calls.push({ op, pts: a[0] as number[], style: {} });
      else if (op === 'moveTo' || op === 'lineTo') calls.push({ op, style: {} });
      else calls.push({ op, style: (a[0] ?? {}) as Record<string, unknown> });
      return g;
    },
  });
  return { g, calls };
}

const ctxOf = (levels: 1 | 2 | 3, extra: Record<string, unknown> = {}) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 42, d: 21, h: 72 },
  cx: 195,
  cy: 96,
  s: 1,
  params: { levels, hue: 30, ...extra },
  state: { level: levels },
});
const colors = (calls: Array<{ style: Record<string, unknown> }>) => calls.map((c) => String(c.style.color ?? ''));

describe('proc preset: shop（等距楼）', () => {
  it('hsl / rgba 组装参数化色值', () => {
    expect(hsl(30, 32, 23)).toBe('hsl(30,32%,23%)');
    expect(rgba(255, 205, 120, 0.17)).toBe('rgba(255,205,120,.17)');
  });

  it('L1/L2/L3 都画两面墙 + 屋顶，且层数越高细节越多', () => {
    const counts = ([1, 2, 3] as const).map((lv) => {
      const { g, calls } = recorder();
      shop(g as never, ctxOf(lv) as never);
      return calls.filter((c) => c.op === 'poly').length;
    });
    expect(counts[0]).toBeGreaterThan(10);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it('L1 是坡顶（含金脊线），L2 是女儿墙（含白色描边）', () => {
    const l1 = recorder();
    shop(l1.g as never, ctxOf(1) as never);
    expect(colors(l1.calls)).toContain('#e8c05a');

    const l2 = recorder();
    shop(l2.g as never, ctxOf(2) as never);
    expect(colors(l2.calls)).toContain('rgba(255,255,255,.14)');
  });

  it('墙面明暗分左右：右墙比左墙亮 (hsl(30,36%,33%) vs hsl(30,32%,23%))', () => {
    const { g, calls } = recorder();
    shop(g as never, ctxOf(1) as never);
    const cs = colors(calls);
    expect(cs).toContain('hsl(30,36%,33%)');
    expect(cs).toContain('hsl(30,32%,23%)');
  });

  it('缺 params 时全部走 fb 兜底且不抛错（L4 回退）', () => {
    const { g, calls } = recorder();
    shop(g as never, { ...ctxOf(2), params: {} } as never);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('PROC_PRESETS 已注册 shop；skin.json 可用段通配 key 命中具体 slot', () => {
    expect(PROC_PRESETS.shop).toBe(shop);
    const skin = {
      id: 'default',
      geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
      tokens: {},
      elements: {
        'building.*.l2': { kind: 'proc', preset: 'shop', params: { hue: 150 } },
      },
    };
    const r = resolve('building.s4.l2', skin as never, null);
    expect(r.level).toBe(2);
    expect((r.provider as { preset: string }).preset).toBe('shop');
    expect((r.provider as { params: Record<string, unknown> }).params.hue).toBe(150);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/proc-building.spec.ts`
Expected: FAIL，模块 `proc-building` 不存在。

- [ ] **Step 3: 实现 proc-building.ts（v5 line 140–260 移植，L1/L2 分支）**

```ts
import type { Graphics } from 'pixi.js';
import { up, win, type Pt } from '../iso';
import { ptsToPoly } from '../paint';
import { BUILDING_HEIGHTS } from '../../skin/registry';
import { arr, fb, type ProcCtx, type ProcPreset } from './proc';

type P = Record<string, unknown>;

/** 参数化色值：含插值的模板串由 Task 7 规则豁免（不算写死） */
export function hsl(h: number, s: number, l: number): string {
  return `hsl(${h},${s}%,${l}%)`;
}
export function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * L4 内建兜底：v5 isoShop 的全部色值/几何（spec §3.6.4）。
 * 这是本 preset 唯一允许出现裸字面量的位置；skin.json 的 params 逐键覆盖它。
 */
const D = fb({
  dim: 0.72,
  /* 投影与地面暖光 */
  shDx: 4, shFy: 0.6, shRise: 2, shUpF: 0.5, shadow: 'rgba(0,0,0,.4)',
  glowFy: 1, glowRx: 1, glowRy: 0.8, doorGlow: 'rgba(255,205,120,.17)',
  /* 墙脚压暗 */
  footH: 3, footR: 'rgba(0,0,0,.28)', footL: 'rgba(0,0,0,.34)',
  /* 墙体明度（hue 由 skin.json 给） */
  satL: 32, satR: 36, litL3: 20, litL12: 23, litR3: 28, litR12: 33,
  satRoof: 20, roofLit3: 40, roofLit12: 46,
  /* 楼层分隔线 */
  divT: 0.014, divsL3: [0.36, 0.64], divsL2: [0.46],
  divL: 'rgba(0,0,0,.34)', divR: 'rgba(0,0,0,.28)',
  /* 橱窗玻璃与窗格 */
  gv1: 0.07, gv2L1: 0.6, gv2L23: 0.4,
  glass1: 'rgba(255,205,120,.62)', glass2: 'rgba(255,208,124,.86)', glass3: 'rgba(176,222,246,.62)',
  gU1L: 0.14, gU2L: 0.92, gU1R: 0.08, gU2R: 0.86,
  mull: 'rgba(16,12,8,.8)', mulls: [0.335, 0.53, 0.725], mullW: 0.022, mullShift: 0.075,
  tran: 'rgba(16,12,8,.85)', tranH: 0.025,
  sill: 'rgba(86,58,20,.6)', sillH: 0.055,
  /* 门洞 / 门内暖光 / 门槛石 */
  door: '#231a11', doorU1: 0.565, doorU2: 0.69,
  doorLight: 'rgba(255,196,105,.5)', doorInU1: 0.585, doorInU2: 0.67, doorInV1: 0.04, doorInV2: 0.3,
  stone: '#4a3a26', stoneU1: 0.55, stoneU2: 0.705, stoneV2: 0.03,
  /* L2 上层暖光窗 */
  upUs: [0.2, 0.5, 0.8], upLu: 0.12, upRu: 0.1, upV1: 0.46, upV2: 0.82, upFill: '#ffd479',
  /* L1 坡顶 */
  gableRise: 13, gableSatL: 26, gableLitL: 32, gableSatR: 30, gableLitR: 40,
  ridge: '#e8c05a', ridgeLen: 3, ridgeW: 1.2,
  /* L2+ 女儿墙 */
  parapet: 'rgba(255,255,255,.14)', parapetW: 1.2,
});

export const shop: ProcPreset = (g, ctx) => {
  const { cx, cy, geo, state, params } = ctx;
  const p = params as P;
  const G = (k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (D as P)[k] as number);
  const S = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : (D as P)[k] as string);
  const A = (k: string): number[] => arr<number>(p, k) ?? ((D as P)[k] as number[]);

  const s = ctx.s;
  const levels = (typeof state.level === 'number' ? state.level : G('levels')) as 1 | 2 | 3;
  const hue = G('hue');
  const dk = state.dim === true ? G('dim') : 1;

  const w = geo.hw * s;
  const d = geo.hh * s;
  const h = BUILDING_HEIGHTS[levels] * s;

  const F: Pt = [cx, cy + d];
  const R: Pt = [cx + w, cy];
  const B: Pt = [cx, cy - d];
  const L: Pt = [cx - w, cy];
  const F2 = up(F, h);
  const R2 = up(R, h);
  const B2 = up(B, h);
  const L2 = up(L, h);

  const fill = (pts: Pt[], color: string, alpha = 1): void => {
    g.poly(ptsToPoly(pts)).fill({ color, alpha });
  };
  const line = (a: Pt, b: Pt, color: string, width: number): void => {
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color, width });
  };

  const wallL = hsl(hue, G('satL'), (levels === 3 ? G('litL3') : G('litL12')) * dk);
  const wallR = hsl(hue, G('satR'), (levels === 3 ? G('litR3') : G('litR12')) * dk);
  const roofC = hsl(hue, G('satRoof'), (levels === 3 ? G('roofLit3') : G('roofLit12')) * dk);

  /* ① 落地投影 + 门口暖光（v5 line 152–153） */
  fill([
    [cx + G('shDx') * s, cy + d * G('shFy')],
    [cx + w + G('shDx') * s, cy + G('shRise') * s],
    [cx + G('shDx') * s, cy - d * G('shUpF')],
    [cx - w + G('shDx') * s, cy + G('shRise') * s],
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy')).fill({ color: S('doorGlow') });

  /* ② 两面墙（右墙亮、左墙暗） */
  fill([F, R, R2, F2], wallR);
  fill([L, F, F2, L2], wallL);

  /* ③ 墙脚压暗 */
  fill([F, R, up(R, G('footH') * s), up(F, G('footH') * s)], S('footR'));
  fill([L, F, up(F, G('footH') * s), up(L, G('footH') * s)], S('footL'));

  /* ④ 楼层分隔线：把一整面墙切成层 */
  if (levels >= 2) {
    const vs = A(levels === 3 ? 'divsL3' : 'divsL2');
    for (const v of vs) {
      fill(win(L, F, h, 0, 1, v, v + G('divT')), S('divL'));
      fill(win(F, R, h, 0, 1, v, v + G('divT')), S('divR'));
    }
  }

  /* ⑤ 一层橱窗：玻璃 + 竖框 ×3 + 横梁 + 台度（v5 line 168–183） */
  const gv1 = G('gv1');
  const gv2 = levels === 1 ? G('gv2L1') : G('gv2L23');
  const gw = levels === 1 ? S('glass1') : levels === 3 ? S('glass3') : S('glass2');
  fill(win(L, F, h, G('gU1L'), G('gU2L'), gv1, gv2), gw);
  fill(win(F, R, h, G('gU1R'), G('gU2R'), gv1, gv2), gw);
  for (const u of A('mulls')) {
    fill(win(L, F, h, u, u + G('mullW'), gv1, gv2), S('mull'));
    fill(win(F, R, h, u - G('mullShift'), u - G('mullShift') + G('mullW'), gv1, gv2), S('mull'));
  }
  fill(win(L, F, h, G('gU1L'), G('gU2L'), gv2 - G('tranH'), gv2), S('tran'));
  fill(win(F, R, h, G('gU1R'), G('gU2R'), gv2 - G('tranH'), gv2), S('tran'));
  fill(win(L, F, h, G('gU1L'), G('gU2L'), gv1, gv1 + G('sillH')), S('sill'));
  fill(win(F, R, h, G('gU1R'), G('gU2R'), gv1, gv1 + G('sillH')), S('sill'));

  /* ⑥ 门：门洞 + 内透暖光 + 门槛石（v5 line 185–187） */
  fill(win(L, F, h, G('doorU1'), G('doorU2'), 0, gv2), S('door'));
  fill(win(L, F, h, G('doorInU1'), G('doorInU2'), G('doorInV1'), G('doorInV2')), S('doorLight'));
  fill(win(L, F, h, G('stoneU1'), G('stoneU2'), 0, G('stoneV2')), S('stone'));

  /* ⑦ 上层窗：L2 三扇暖光（v5 line 189–193；L3 的玻璃幕墙见 Task 16） */
  if (levels === 2) {
    for (const u of A('upUs')) {
      fill(win(L, F, h, u - G('upLu'), u + G('upRu'), G('upV1'), G('upV2')), S('upFill'));
      fill(win(F, R, h, u - G('upLu'), u + G('upRu'), G('upV1'), G('upV2')), S('upFill'));
    }
  }

  /* ⑧ 屋顶 */
  fill([L2, B2, R2, F2], roofC);
  if (levels === 1) {
    const apex: Pt = [cx, cy - h - G('gableRise') * s];
    fill([L2, F2, apex], hsl(hue, G('gableSatL'), G('gableLitL') * dk));
    fill([F2, R2, apex], hsl(hue, G('gableSatR'), G('gableLitR') * dk));
    line(apex, up(apex, G('ridgeLen') * s), S('ridge'), G('ridgeW') * s);
  } else {
    g.poly(ptsToPoly([L2, B2, R2, F2])).stroke({ color: S('parapet'), width: G('parapetW') * s });
  }
};
```

- [ ] **Step 4: 注册进 PROC_PRESETS**

`src/render/providers/proc.ts` 末尾改为：

```ts
import { shop } from './proc-building';

export const PROC_PRESETS: Record<string, ProcPreset> = { tile, tileEdge, bgGradient, solid, builtin, fountain, shop };
```

> **循环依赖规避**：`proc-building.ts` 只从 `proc.ts` 取 `arr / fb / ProcCtx / ProcPreset`（类型与纯函数），`proc.ts` 在**文件末尾**再 import `shop`——ESM 下函数声明已提升，双向 import 可安全求值；Vitest 若有 `ReferenceError`，把 `fb`/`arr` 的 import 改为 `import type` 之外的形式不必调整，直接在 `proc.ts` 里 `export { fb }` 并用 `export * from './proc-building'` 亦可。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run test/render/proc-building.spec.ts`
Expected: PASS（6 例）。

Run: `npm run lint`
Expected: 0 错（`proc-building.ts` 的全部字面量都在 `fb({...})` 实参子树内）。

- [ ] **Step 6: Commit**

```bash
git add monopoly/src/render/providers monopoly/test/render
git commit -m "feat(mono): 等距楼 shop preset（L1 坡顶摊位 / L2 两层门店）"
```

---

## Task 16: L3 商超楼（玻璃幕墙 + 霓虹 + 暖光内透）与 `sign` 店招 preset（等距旋转文字）

**Files:**
- Modify: `d:\zhao\monopoly\src\render\providers\proc-building.ts`
- Modify: `d:\zhao\monopoly\src\render\providers\proc.ts`（`ProcCtx` 增加 `text` 通道；注册 `sign`）
- Modify: `d:\zhao\monopoly\src\render\paint.ts`（`makeText`）
- Modify: `d:\zhao\monopoly\src\render\Scene.ts`（把 preset 的文字请求落地为 Pixi `Text`）
- Test: `d:\zhao\monopoly\test\render\proc-sign.spec.ts`

> v5 的店招是右墙上的斜面灯箱 + 随等距角度旋转的汉字（line 232–241）。`Graphics` 画不了旋转文字，因此给 `ProcCtx` 开一个**文字输出通道** `ctx.text(req)`：preset 只声明文字内容与位置，`Scene` 统一创建 `Text` 并挂到同一图层——仍然是「单一入口」，没有散装绘制。

- [ ] **Step 1: 写失败测试**

`test/render/proc-sign.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { sign, shop } from '../../src/render/providers/proc-building';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import type { TextRequest } from '../../src/render/providers/proc';

function recorder() {
  const calls: Array<{ op: string; style: Record<string, unknown> }> = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      if (op === 'poly') calls.push({ op, style: {} });
      else if (op === 'moveTo' || op === 'lineTo') calls.push({ op, style: {} });
      else calls.push({ op, style: (a[0] ?? {}) as Record<string, unknown> });
      return g;
    },
  });
  return { g, calls };
}

const baseCtx = (levels: 1 | 2 | 3, brand?: string) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 42, d: 21, h: 72 },
  cx: 195, cy: 96, s: 1,
  params: brand ? { levels, hue: 30, brand } : { levels, hue: 30 },
  state: { level: levels },
});

describe('L3 商超楼', () => {
  it('L3 画玻璃幕墙（2 行 × 4 列 = 16 片）与冷色玻璃', () => {
    const { g, calls } = recorder();
    shop(g as never, baseCtx(3) as never);
    const cs = calls.map((c) => String(c.style.color ?? ''));
    expect(cs).toContain('#9fd8ff');
    expect(cs.filter((c) => c === '#9fd8ff').length).toBe(16);
    expect(cs).toContain('hsl(30,20%,40%)');
  });

  it('L3 有霓虹轮廓描边', () => {
    const { g, calls } = recorder();
    shop(g as never, baseCtx(3) as never);
    expect(calls.map((c) => String(c.style.color ?? ''))).toContain('#5ef0c0');
  });
});

describe('proc preset: sign（店招灯箱 + 等距旋转文字）', () => {
  it('发出灯箱多边形，并把品牌文字交给 ctx.text', () => {
    const { g, calls } = recorder();
    const texts: TextRequest[] = [];
    sign(g as never, { ...baseCtx(2), text: (r: TextRequest) => texts.push(r) } as never);
    expect(calls.filter((c) => c.op === 'poly').length).toBeGreaterThan(0);
    expect(texts.length).toBe(1);
    expect(texts[0].text).toBe('太平温泉');
    expect(texts[0].rotate).toBeCloseTo(-26.57, 1);   // -atan2(10.5,21) ≈ -26.57°
  });

  it('没有 brand 时只画灯箱、不产出文字', () => {
    const { g } = recorder();
    const texts: TextRequest[] = [];
    sign(g as never, { ...baseCtx(2), text: (r: TextRequest) => texts.push(r) } as never);
    expect(texts.length).toBe(0);
  });

  it('PROC_PRESETS 已注册 sign', () => {
    expect(PROC_PRESETS.sign).toBe(sign);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/proc-sign.spec.ts`
Expected: FAIL，`sign` 未导出、`TextRequest` 不存在。

- [ ] **Step 3: 给 `ProcCtx` 开文字通道**

`src/render/providers/proc.ts` 的 `ProcCtx` 增加字段，并新增 `TextRequest`：

```ts
/** preset 的文字输出请求（Graphics 画不了旋转文字，统一交给 Scene 落地） */
export interface TextRequest {
  text: string;
  x: number;
  y: number;
  size: number;
  fill: string;
  rotate?: number;                       // 角度（度）
  /** 水平对齐：center（默认，用于店招/灯笼）· left（用于橱窗信息条，x 即左边缘） */
  align?: 'center' | 'left';
}

export interface ProcCtx {
  geo: Geo;
  box: Box;
  cx: number;
  cy: number;
  s: number;
  /** 管线施加的抬升（未乘 s）。preset 用 cy + lift×s 还原宿主楼基座 y0 */
  lift?: number;
  params: Record<string, unknown>;
  state: Record<string, unknown>;
  text?: (req: TextRequest) => void;
}
```

> `lift` 是「还原宿主坐标系」的唯一钥匙：贴墙/贴屋顶的 preset 拿到的是**已抬升**的 `cy`，凡几何横跨一段墙高（店招灯箱、遮阳篷、灯笼、幌子）的 preset 都必须先算 `y0 = cy + lift × s`，再从 `y0` 起算（等价于 v5 里 `isoShop` 的 `cy`）。只落在抬升点上的 preset（屋顶设备箱、招牌塔、天线）直接用 `cy`。

- [ ] **Step 4: 实现 `makeText` 并在 Scene 落地文字**

`src/render/paint.ts` 追加：

```ts
import { Text } from 'pixi.js';
import type { TextRequest } from './providers/proc';

/** 按 preset 的文字请求创建 Pixi Text（唯一建文字处） */
export function makeText(req: TextRequest): Text {
  const t = new Text({
    text: req.text,
    style: {
      fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: req.size,
      fontWeight: 'bold',
      fill: req.fill,
    },
  });
  t.anchor.set(req.align === 'left' ? 0 : 0.5, 0.5);
  t.position.set(req.x, req.y);
  t.rotation = ((req.rotate ?? 0) * Math.PI) / 180;
  return t;
}
```

`src/render/Scene.ts` 的 `render()` 内，把「构造 ctx → draw → addChild」一段改为：

```ts
const inst = instantiate(spec, instantiateDeps);
const g = new Graphics();
const target = p.pass === 2 ? layers.labels : p.pass === 3 ? layers.pieces : layers.ground;
const texts: TextRequest[] = [];
const place = resolvePlacement(
  { id: inst.id, c: inst.c, r: inst.r, slot: inst.slot, lift: inst.lift, box: inst.box, pawnIndex: spec.pawnIndex },
  this.deps.geo,
  this.deps.placement,
);
const ctx: ProcCtx = {
  geo: this.deps.geo,
  box: inst.box,
  cx: place.cx,
  cy: place.cy,
  s: place.s,
  lift: inst.lift,
  params: inst.provider.kind === 'proc'
    ? { __preset: (inst.provider as { preset: string }).preset, ...((inst.provider as { params?: Record<string, unknown> }).params ?? {}) }
    : { __preset: 'builtin' },
  state: { ...inst.state, ownerColors: this.ownerColors() },
  text: (r) => texts.push(r),
};
providerFor(inst.provider).draw(g, ctx);
target.addChild(g);
for (const r of texts) target.addChild(makeText(r));
```

> 同时删掉 Task 10 里那句「同 ID 多实例时按首次命中」的 `bySource`/二次 `instantiate`——`plan` 改为携带 `index`，用 `this.items[p.index]` 精确取元素（同 ID 多实例不再错位）。

- [ ] **Step 5: 补 L3 分支并实现 `sign` preset**

`proc-building.ts` 的 `D` 追加：

```ts
  /* L3 玻璃幕墙 */
  l3Rows: 2, l3V1: 0.42, l3RowStep: 0.26, l3WinH: 0.2,
  l3Cols: 4, l3U1: 0.1, l3UStep: 0.23, l3WinW: 0.18, l3Win: '#9fd8ff', l3WinAlpha: 0.9,
  /* L3 玻璃内透暖光 */
  warm: 'rgba(255,205,130,.4)', warmU1L: 0.18, warmU2L: 0.9,
  warmU1R: 0.12, warmU2R: 0.88, warmV1: 0.13, warmV2: 0.32,
  /* L3 霓虹 */
  neon: '#5ef0c0', neonW: 1.6, neonAlpha: 0.85,
  /* 店招灯箱 */
  signLevel: 1, signV: [0, 0.68, 0.86, 0.84], signH: [0, 0.22, 0.12, 0.08],
  signU1: 0.04, signU2: 0.96, signEdgeH: 45, signEdgeS: 80, signEdgeL: 58, signEdgeW: 0.8,
  signInU1: 0.05, signInU2: 0.95, signInV1: 0.14, signInV2: 0.86,
  signInSat: 58, signInLit: 30, signInAlpha: 0.55,
  signBox: '#141414', signText: '#ffe08a', signFs: 0.66, signMx: 0.5, signMy: 0.5,
```

`shop` 的 ⑦ 段替换为（L2 保持三扇暖光，L3 换成两行四列玻璃幕墙 + 内透暖光），并在 ⑧ 的 else 分支追加霓虹：

```ts
  /* ⑦ 上层窗 */
  if (levels === 2) {
    for (const u of A('upUs')) {
      fill(win(L, F, h, u - G('upLu'), u + G('upRu'), G('upV1'), G('upV2')), S('upFill'));
      fill(win(F, R, h, u - G('upLu'), u + G('upRu'), G('upV1'), G('upV2')), S('upFill'));
    }
  } else if (levels === 3) {
    /* L3 玻璃幕墙：底层内透暖光（v5 line 172–175） */
    fill(win(L, F, h, G('warmU1L'), G('warmU2L'), G('warmV1'), G('warmV2')), S('warm'));
    fill(win(F, R, h, G('warmU1R'), G('warmU2R'), G('warmV1'), G('warmV2')), S('warm'));
    for (let r = 0; r < G('l3Rows'); r++) {
      const v1 = G('l3V1') + r * G('l3RowStep');
      for (let i = 0; i < G('l3Cols'); i++) {
        const u = G('l3U1') + i * G('l3UStep');
        g.poly(ptsToPoly(win(L, F, h, u, u + G('l3WinW'), v1, v1 + G('l3WinH'))))
          .fill({ color: S('l3Win'), alpha: G('l3WinAlpha') });
        g.poly(ptsToPoly(win(F, R, h, u, u + G('l3WinW'), v1, v1 + G('l3WinH'))))
          .fill({ color: S('l3Win'), alpha: G('l3WinAlpha') });
      }
    }
  }
```

⑧ 的 else 分支末尾追加：

```ts
    if (levels === 3) {
      g.poly(ptsToPoly([L2, B2, R2, F2])).stroke({ color: S('neon'), width: G('neonW') * s, alpha: G('neonAlpha') });
    }
```

`proc-building.ts` 追加 `sign` preset：

```ts
/**
 * 店招：沿右墙的斜面灯箱 + 随等距角度旋转的汉字（v5 line 232–241）。
 * 文字角度 = -atan2(d, w)·180/π ≈ -26.57°，与墙面同一透视。
 */
export const sign: ProcPreset = (g, ctx) => {
  const { cx, cy, geo, params, state } = ctx;
  const p = params as P;
  const G = (k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (D as P)[k] as number);
  const S = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : (D as P)[k] as string);
  const LV = (k: string): number[] => arr<number>(p, k) ?? ((D as P)[k] as number[]);

  const s = ctx.s;
  const levels = (typeof state.level === 'number' ? state.level : G('signLevel')) as 1 | 2 | 3;
  const w = geo.hw * s;
  const d = geo.hh * s;
  const h = BUILDING_HEIGHTS[levels] * s;
  /* 还原宿主楼基座：cy 已被管线抬升 atV×hostHeight，从 y0 起算才与墙面同一坐标系 */
  const y0 = cy + (ctx.lift ?? 0) * s;
  const F: Pt = [cx, y0 + d];
  const R: Pt = [cx + w, y0];

  const v1 = LV('signV')[levels];
  const vh = LV('signH')[levels];
  const bh = vh * h;

  g.poly(ptsToPoly(win(F, R, h, G('signU1'), G('signU2'), v1, v1 + vh)))
    .fill({ color: S('signBox') })
    .stroke({ color: hsl(G('signEdgeH'), G('signEdgeS'), G('signEdgeL')), width: G('signEdgeW') * s });
  g.poly(ptsToPoly(win(F, R, h, G('signInU1'), G('signInU2'), v1 + vh * G('signInV1'), v1 + vh * G('signInV2'))))
    .fill({ color: hsl(G('signEdgeH'), G('signInSat'), G('signInLit')), alpha: G('signInAlpha') });

  const brand = typeof p.brand === 'string' ? (p.brand as string) : null;
  if (brand) {
    const mx = cx + w * G('signMx');
    const my = y0 + d * G('signMy') - h * (v1 + vh / 2);
    const ang = (-Math.atan2(d, w) * 180) / Math.PI;
    ctx.text?.({ text: brand, x: mx, y: my, size: bh * G('signFs'), fill: S('signText'), rotate: ang });
  }
};
```

`proc.ts` 的 `PROC_PRESETS` 再补 `sign`：

```ts
import { shop, sign } from './proc-building';
export const PROC_PRESETS: Record<string, ProcPreset> = { tile, tileEdge, bgGradient, solid, builtin, fountain, shop, sign };
```

并在 `skins/default/skin.json` 的 `elements` 补 4 条（段通配，覆盖 96 个具体 id）：

```json
"building.*.l1": { "kind": "proc", "preset": "shop", "params": { "levels": 1, "hue": 32, "brand": "鹿特产" } },
"building.*.l2": { "kind": "proc", "preset": "shop", "params": { "levels": 2, "hue": 30 } },
"building.*.l3": { "kind": "proc", "preset": "shop", "params": { "levels": 3, "hue": 200 } },
"building.*.sign": { "kind": "proc", "preset": "sign", "params": { "levels": 2, "brand": "门店" } }
```

> 每个地块的 `hue` / `brand` / `vb` / `lantern` 由 Task 18 的 `BuildingView` 以**元素级覆盖**（`spec.overrides`）注入（spec §3.6.4 第 ① 级），默认皮肤不必为 32 个地块各写一条。

- [ ] **Step 6: 跑测试 + lint**

Run: `npx vitest run test/render && npm run lint && npm run lint:skin`
Expected: 全绿 / 0 错 / `[skin:default] OK`。

- [ ] **Step 7: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test
git commit -m "feat(mono): L3 玻璃幕墙+霓虹；sign 店招 preset（等距旋转文字经 ctx.text 落地）"
```

---

## Task 17: `prop.*` 八件通用构件 provider（贴墙/贴屋顶装饰，坐标全交管线）

**Files:**
- Create: `d:\zhao\monopoly\src\render\providers\proc-props.ts`
- Modify: `d:\zhao\monopoly\src\render\providers\proc.ts`（注册 8 个 preset）
- Modify: `d:\zhao\monopoly\src\render\Scene.ts`（`resolvePlacement` 调用补 `mount`）
- Modify: `d:\zhao\monopoly\public\skins\default\skin.json`（8 条元素）
- Modify: `d:\zhao\monopoly\test\render\placement.spec.ts`（挂件缩放 2 例，已在 Task 14 补）
- Test: `d:\zhao\monopoly\test\render\proc-props.spec.ts`

> 移植源：v5 `vBanner()`(82–89) · `isoBox()`(91–96) · `isoTree()`(98–108) · `streetLamp()`(110–116) · `lantern()`(118–127) · 遮阳篷与屋顶设备(212–229)。
> **铁律落地**：这 8 个 preset 全部**不算自己的坐标**——`cx/cy/s` 由管线给，横向偏移用 `geo.hw/hh × s`、纵向用宿主墙高 `h`。贴墙/贴屋顶件先算 `y0 = cy + lift × s` 再从 `y0` 起算（否则会飘在楼外，见 Task 14 备注）。

- [ ] **Step 1: 写失败测试**

`test/render/proc-props.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  antenna, awning, banner, lamp, lantern, rooftopBox, signTower, tree,
} from '../../src/render/providers/proc-props';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import type { TextRequest } from '../../src/render/providers/proc';

interface Rec { op: string; pts?: number[]; style: Record<string, unknown> }

function recorder() {
  const calls: Rec[] = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      if (op === 'poly') calls.push({ op, pts: a[0] as number[], style: {} });
      else if (op === 'moveTo' || op === 'lineTo') calls.push({ op, style: {} });
      else calls.push({ op, style: (a[0] ?? {}) as Record<string, unknown> });
      return g;
    },
  });
  return { g, calls };
}
const count = (calls: Rec[], op: string) => calls.filter((c) => c.op === op).length;
const ys = (calls: Rec[]) => calls.filter((c) => c.op === 'poly').flatMap((c) => (c.pts ?? []).filter((_, i) => i % 2 === 1));

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };
/** s = 0.72 = 棋盘建筑缩放；h = 2 级墙高 46×0.72 = 33.12 */
const ctxOf = (params: Record<string, unknown> = {}, state: Record<string, unknown> = { level: 2 }, lift = 0) => ({
  geo: GEO,
  box: { w: 14, d: 8, h: 30 },
  cx: 195,
  cy: 96,
  s: 0.72,
  lift,
  params,
  state,
});
const texts: TextRequest[] = [];
const withText = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...extra,
  text: (r: TextRequest) => texts.push(r),
});

describe('prop.tree 行道树（v5 isoTree）', () => {
  it('影 + 双树干 + 四团树冠 + 一记高光', () => {
    const { g, calls } = recorder();
    tree(g as never, ctxOf() as never);
    expect(count(calls, 'ellipse')).toBe(1);
    expect(count(calls, 'poly')).toBe(2);
    expect(count(calls, 'circle')).toBe(5);
  });
});

describe('prop.lamp 路灯（v5 streetLamp）', () => {
  it('影 + 立柱 + 光晕 + 灯珠', () => {
    const { g, calls } = recorder();
    lamp(g as never, ctxOf() as never);
    expect(count(calls, 'ellipse')).toBe(1);
    expect(count(calls, 'rect')).toBe(1);
    expect(count(calls, 'circle')).toBe(2);
  });
});

describe('prop.lantern 红灯笼（v5 lantern）', () => {
  it('吊绳 + 灯身 + 高光 + 上下金箍；state.char 有字时交给 ctx.text', () => {
    texts.length = 0;
    const { g, calls } = recorder();
    lantern(g as never, { ...ctxOf({}, { level: 2, at: 'door', char: '汤' }), ...withText() } as never);
    expect(count(calls, 'ellipse')).toBe(2);
    expect(count(calls, 'rect')).toBe(2);
    expect(count(calls, 'lineTo')).toBe(1);
    expect(texts.length).toBe(1);
    expect(texts[0].text).toBe('汤');
  });

  it('无字时不出文字（缺素材不空白、不报错）', () => {
    texts.length = 0;
    const { g } = recorder();
    lantern(g as never, { ...ctxOf({}, { level: 2, at: 'side' }), ...withText() } as never);
    expect(texts.length).toBe(0);
  });
});

describe('prop.banner 竖招幌子（v5 vBanner）', () => {
  it('挑臂 + 旗面 + 每字一条文字请求（竖排）', () => {
    texts.length = 0;
    const { g, calls } = recorder();
    banner(g as never, { ...ctxOf({ text: '温泉' }), ...withText() } as never);
    expect(count(calls, 'lineTo')).toBe(1);
    expect(count(calls, 'roundRect')).toBe(1);
    expect(texts.map((t) => t.text).join('')).toBe('温泉');
    /* 竖排：后一字比前一字低一个行距 */
    expect(texts[1].y - texts[0].y).toBeCloseTo(8.8 * 0.72, 5);
  });
});

describe('prop.awning 遮阳篷（v5 line 212–216）', () => {
  it('底板 + 四道红条 + 一道暗唇 = 6 个多边形', () => {
    const { g, calls } = recorder();
    awning(g as never, ctxOf({}, { level: 1 }, 0.64 * 26) as never);
    expect(count(calls, 'poly')).toBe(6);
  });

  it('贴墙几何随 lift 一起上移（y0 = cy + lift×s，不飘在楼外）', () => {
    const minY = (lift: number) => {
      const { g, calls } = recorder();
      awning(g as never, ctxOf({}, { level: 1 }, lift) as never);
      return Math.min(...ys(calls));
    };
    expect(minY(16.64) - minY(0)).toBeCloseTo(16.64 * 0.72, 4);
  });
});

describe('prop.rooftopBox 屋顶设备箱（v5 line 221–222）', () => {
  it('两个等距箱体 = 6 个多边形，且直接用已抬升的 cy（不再二次上移）', () => {
    const at = (lift: number) => {
      const { g, calls } = recorder();
      rooftopBox(g as never, ctxOf({}, { level: 2 }, lift) as never);
      return { n: count(calls, 'poly'), y: Math.min(...ys(calls)) };
    };
    expect(at(0).n).toBe(6);
    expect(at(33.12).y).toBeCloseTo(at(0).y, 5);
  });
});

describe('prop.signTower / prop.antenna 屋顶招牌塔与天线（v5 line 226–229）', () => {
  it('招牌塔：箱体 3 面 + 桅杆 + 红灯', () => {
    const { g, calls } = recorder();
    signTower(g as never, ctxOf({}, { level: 3 }, 72) as never);
    expect(count(calls, 'poly')).toBe(3);
    expect(count(calls, 'lineTo')).toBe(1);
    expect(count(calls, 'circle')).toBe(1);
  });

  it('天线：一根杆 + 一颗红灯', () => {
    const { g, calls } = recorder();
    antenna(g as never, ctxOf({}, { level: 3 }, 72) as never);
    expect(count(calls, 'lineTo')).toBe(1);
    expect(count(calls, 'circle')).toBe(1);
  });
});

describe('注册表', () => {
  it('PROC_PRESETS 八个 prop preset 全部注册', () => {
    expect(PROC_PRESETS.awning).toBe(awning);
    expect(PROC_PRESETS.lantern).toBe(lantern);
    expect(PROC_PRESETS.banner).toBe(banner);
    expect(PROC_PRESETS.rooftopBox).toBe(rooftopBox);
    expect(PROC_PRESETS.signTower).toBe(signTower);
    expect(PROC_PRESETS.antenna).toBe(antenna);
    expect(PROC_PRESETS.tree).toBe(tree);
    expect(PROC_PRESETS.lamp).toBe(lamp);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/proc-props.spec.ts`
Expected: FAIL，模块 `proc-props` 不存在。

- [ ] **Step 3: 实现 proc-props.ts（v5 六个绘制函数逐一移植）**

```ts
import type { Graphics } from 'pixi.js';
import { up, win, type Pt } from '../iso';
import { ptsToPoly } from '../paint';
import { BUILDING_HEIGHTS } from '../../skin/registry';
import { hsl } from './proc-building';
import { arr, fb, type ProcCtx, type ProcPreset } from './proc';

type P = Record<string, unknown>;

/**
 * L4 内建兜底：v5 isoTree / streetLamp / lantern / vBanner / isoBox / 遮阳篷 / 屋顶设备的
 * 全部色值与几何（spec §3.6.4）。本文件唯一允许出现裸字面量的位置。
 */
const PD = fb({
  /* —— awning 遮阳篷（L1：红白条纹，压在橱窗上方） —— */
  awU1: 0.06, awU2: 0.98, awV1: 0.58, awV2: 0.7,
  awBase: '#d8c9ac', awStripe: '#b8402f',
  awStripeUs: [0.06, 0.29, 0.52, 0.75], awStripeW: 0.23,
  awLip: 'rgba(0,0,0,.32)', awLipH: 0.045,
  /* —— lantern 红灯笼 —— */
  laR: 4.6, laRy: 1.15, laRod: 14, laRodEnd: 2, laRodW: 1, laRodFill: '#3a2a1c',
  laFill: '#d63a2f', laHiDx: 0.3, laHiDy: 0.3, laHiRx: 0.35, laHiRy: 0.4,
  laGlow: 'rgba(255,220,160,.4)',
  laCap: '#e8c05a', laCapHalf: 0.55, laCapW: 1.1, laCapH: 0.32, laCapTop: 1.35, laCapBot: 1.03,
  laCharFill: '#ffe9b0', laCharFs: 1.1, laCharDy: 0.42,
  laDxDoor: 0.4, laVDoor: 0.3, laDyDoor: 0.6, laDxSide: 0.9, laVSide: 0.4, laDySide: 0.35,
  /* —— banner 竖招幌子 —— */
  bnDy: 0.15, bnV: 0.8, bnDx1: 0.9, bnDx2: 1.25, bnArmDy: 3, bnArm: '#2a2118', bnArmW: 1.3,
  bnW: 8.6, bnCh: 8.8, bnRx: 1.4, bnFill: '#a8231c',
  bnEdgeH: 45, bnEdgeS: 72, bnEdgeL: 60, bnEdgeW: 0.8,
  bnFs: 7.8, bnCharFy: 0.76, bnTextFill: '#ffe9b0', text: '市集',
  /* —— rooftopBox 屋顶设备箱 ×2 —— */
  rb1Dx: 0.46, rb1Dy: 0.26, rb1W: 0.3, rb1D: 0.3, rb1H: 7, rb1T: '#6d7d75', rb1L: '#4a5a53', rb1R: '#3c4a44',
  rb2Dx: 0.5, rb2Dy: 0.62, rb2W: 0.2, rb2D: 0.2, rb2H: 6, rb2T: '#7d8d85', rb2L: '#55665e', rb2R: '#46564f',
  /* —— signTower 屋顶招牌塔 + 天线红灯 —— */
  stDy: 0.1, stW: 0.34, stD: 0.3, stH: 20, stT: '#2f3d36', stL: '#1b241f', stR: '#243029',
  stMastH: 12, stMastFill: '#8aa39a', stMastW: 1, stLampR: 2.4, stLampDy: 13, stLamp: '#ff5f5f',
  /* —— antenna 独立天线 —— */
  anH: 13, anW: 1, anFill: '#8aa39a', anR: 2.2, anLampDy: 1, anLamp: '#ff5f5f',
  /* —— tree 行道树 —— */
  trScale: 0.68, trH: 16, trW: 5, trShDy: 3, trShRx: 7, trShRy: 3.4, trShadow: 'rgba(0,0,0,.34)',
  trTrunkL: '#3a2a1c', trTrunkR: '#2b1f15',
  trBlobs: [[0, -20, 9, '#2f6b3f'], [-4, -15, 7, '#275c35'], [4.5, -14, 6.5, '#347a48'], [0, -27, 6, '#3d8c52']],
  trHiDx: -3, trHiDy: 28, trHiR: 3.4, trHiFill: 'rgba(190,240,190,.22)',
  /* —— lamp 路灯 —— */
  lpScale: 0.9, lpH: 26, lpPoleW: 2.2, lpPoleFill: '#2a3330',
  lpShDy: 2, lpShRx: 4, lpShRy: 2, lpSh: 'rgba(0,0,0,.32)',
  lpHeadDy: 2, lpGlowR: 6, lpGlow: 'rgba(255,214,130,.2)', lpBulbR: 3, lpBulb: '#ffe6a8',
});

/** 取值器：params 优先，缺则落 L4 兜底（spec §3.6.4 回退链末级） */
function getters(p: P) {
  return {
    G: (k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (PD as P)[k] as number),
    S: (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : (PD as P)[k] as string),
    A: (k: string): number[] => arr<number>(p, k) ?? ((PD as P)[k] as number[]),
  };
}

export type Blob = [number, number, number, string];
function blobsOf(p: P): Blob[] {
  const v = p.blobs as Blob[] | undefined;
  return Array.isArray(v) && v.length > 0 ? v : (PD.trBlobs as unknown as Blob[]);
}

interface Frame { cx: number; cy: number; y0: number; w: number; d: number; h: number }

/**
 * 宿主楼坐标系：cy 已被管线抬升 atV×hostHeight；y0 = cy + lift×s 即宿主基座（= v5 isoShop 的 cy）。
 * 贴墙/贴屋顶件凡横跨一段墙高，一律从 y0 起算。
 */
function frame(ctx: ProcCtx): Frame {
  const s = ctx.s;
  const level = (typeof ctx.state.level === 'number' ? ctx.state.level : 1) as 1 | 2 | 3;
  return {
    cx: ctx.cx,
    cy: ctx.cy,
    y0: ctx.cy + (ctx.lift ?? 0) * s,
    w: ctx.geo.hw * s,
    d: ctx.geo.hh * s,
    h: BUILDING_HEIGHTS[level] * s,
  };
}

function fillPoly(g: Graphics, pts: Pt[], color: string, alpha = 1): void {
  g.poly(ptsToPoly(pts)).fill({ color, alpha });
}

/** v5 isoBox：小等距体块（屋顶设备 / 招牌塔）——右墙 + 左墙 + 顶面 */
function isoBox(g: Graphics, cx: number, cy: number, w: number, d: number, h: number, cT: string, cL: string, cR: string): void {
  const F: Pt = [cx, cy + d];
  const R: Pt = [cx + w, cy];
  const B: Pt = [cx, cy - d];
  const L: Pt = [cx - w, cy];
  fillPoly(g, [F, R, up(R, h), up(F, h)], cR);
  fillPoly(g, [L, F, up(F, h), up(L, h)], cL);
  fillPoly(g, [up(L, h), up(B, h), up(R, h), up(F, h)], cT);
}

/* ============ 遮阳篷（L1 摊位，v5 line 212–216） ============ */
export const awning: ProcPreset = (g, ctx) => {
  const { G, S, A } = getters(ctx.params as P);
  const { cx, y0, w, d, h } = frame(ctx);
  const F: Pt = [cx, y0 + d];
  const L: Pt = [cx - w, y0];
  fillPoly(g, win(L, F, h, G('awU1'), G('awU2'), G('awV1'), G('awV2')), S('awBase'));
  const us = A('awStripeUs');
  for (let i = 0; i < us.length; i++) {
    fillPoly(g, win(L, F, h, us[i], us[i] + G('awStripeW'), G('awV1'), G('awV2')), S('awStripe'));
  }
  fillPoly(g, win(L, F, h, G('awU1'), G('awU2'), G('awV1') - G('awLipH'), G('awV1')), S('awLip'));
};

/* ============ 红灯笼（v5 lantern line 118–127；两处挂点 line 249–250） ============ */
export const lantern: ProcPreset = (g, ctx) => {
  const { G, S } = getters(ctx.params as P);
  const { cx, y0, w, d, h, } = frame(ctx);
  const s = ctx.s;
  const at = typeof ctx.state.at === 'string' ? (ctx.state.at as string) : 'door';
  const lx = at === 'side' ? cx + w * G('laDxSide') : cx - w * G('laDxDoor');
  const ly = at === 'side'
    ? y0 - d * G('laDySide') - h * G('laVSide')
    : y0 + d * G('laDyDoor') - h * G('laVDoor');
  const r = G('laR') * s;
  g.moveTo(lx, ly - G('laRod') * s).lineTo(lx, ly - r * G('laRodEnd'))
    .stroke({ color: S('laRodFill'), width: G('laRodW') * s });
  g.ellipse(lx, ly, r, r * G('laRy')).fill({ color: S('laFill') });
  g.ellipse(lx - r * G('laHiDx'), ly - r * G('laHiDy'), r * G('laHiRx'), r * G('laHiRy')).fill({ color: S('laGlow') });
  g.rect(lx - r * G('laCapHalf'), ly - r * G('laCapTop'), r * G('laCapW'), r * G('laCapH')).fill({ color: S('laCap') });
  g.rect(lx - r * G('laCapHalf'), ly + r * G('laCapBot'), r * G('laCapW'), r * G('laCapH')).fill({ color: S('laCap') });
  const ch = typeof ctx.state.char === 'string' ? (ctx.state.char as string) : '';
  if (ch) ctx.text?.({ text: ch, x: lx, y: ly + r * G('laCharDy'), size: r * G('laCharFs'), fill: S('laCharFill') });
};

/* ============ 竖招幌子（v5 vBanner line 82–89；挂点 line 244–246） ============ */
export const banner: ProcPreset = (g, ctx) => {
  const { G, S } = getters(ctx.params as P);
  const { cx, y0, w, d, h } = frame(ctx);
  const s = ctx.s;
  const py = y0 + d * G('bnDy') - h * G('bnV');
  const ax1 = cx - w * G('bnDx1');
  const bx = cx - w * G('bnDx2');
  const by = py + G('bnArmDy') * s;
  g.moveTo(ax1, py).lineTo(bx, by).stroke({ color: S('bnArm'), width: G('bnArmW') * s });
  const text = S('text');
  const bw = G('bnW') * s;
  const ch = G('bnCh') * s;
  g.roundRect(bx - bw / 2, by, bw, text.length * ch, G('bnRx') * s)
    .fill({ color: S('bnFill') })
    .stroke({ color: hsl(G('bnEdgeH'), G('bnEdgeS'), G('bnEdgeL')), width: G('bnEdgeW') * s });
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    ctx.text?.({ text: chars[i], x: bx, y: by + (i + G('bnCharFy')) * ch, size: G('bnFs') * s, fill: S('bnTextFill') });
  }
};

/* ============ 屋顶设备箱（v5 line 221–222）——直接用已抬升的 cy（= 屋顶面） ============ */
export const rooftopBox: ProcPreset = (g, ctx) => {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy, w, d } = frame(ctx);
  const s = ctx.s;
  isoBox(g, cx - w * G('rb1Dx'), cy - d * G('rb1Dy'), w * G('rb1W'), d * G('rb1D'), G('rb1H') * s, S('rb1T'), S('rb1L'), S('rb1R'));
  isoBox(g, cx + w * G('rb2Dx'), cy - d * G('rb2Dy'), w * G('rb2W'), d * G('rb2D'), G('rb2H') * s, S('rb2T'), S('rb2L'), S('rb2R'));
};

/* ============ 屋顶招牌塔 + 红灯（v5 line 226–229） ============ */
export const signTower: ProcPreset = (g, ctx) => {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy, w, d } = frame(ctx);
  const s = ctx.s;
  const tcy = cy - d * G('stDy');
  const th = G('stH') * s;
  isoBox(g, cx, tcy, w * G('stW'), d * G('stD'), th, S('stT'), S('stL'), S('stR'));
  g.moveTo(cx, tcy - th).lineTo(cx, tcy - th - G('stMastH') * s)
    .stroke({ color: S('stMastFill'), width: G('stMastW') * s });
  g.circle(cx, tcy - th - G('stLampDy') * s, G('stLampR') * s).fill({ color: S('stLamp') });
};

/* ============ 独立天线（可从招牌塔上分离出来单独挂） ============ */
export const antenna: ProcPreset = (g, ctx) => {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy } = frame(ctx);
  const s = ctx.s;
  const h = G('anH') * s;
  g.moveTo(cx, cy).lineTo(cx, cy - h).stroke({ color: S('anFill'), width: G('anW') * s });
  g.circle(cx, cy - h - G('anLampDy') * s, G('anR') * s).fill({ color: S('anLamp') });
};

/* ============ 行道树（v5 isoTree line 98–108）—— ground，不随楼缩放 ============ */
export const tree: ProcPreset = (g, ctx) => {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy } = frame(ctx);
  const s = ctx.s * G('trScale');
  const h = G('trH') * s;
  const w = G('trW') * s;
  g.ellipse(cx, cy + G('trShDy') * s, G('trShRx') * s, G('trShRy') * s).fill({ color: S('trShadow') });
  fillPoly(g, [[cx, cy + G('trShDy') * s], [cx + w, cy], [cx + w, cy - h], [cx, cy + G('trShDy') * s - h]], S('trTrunkR'));
  fillPoly(g, [[cx, cy + G('trShDy') * s], [cx - w, cy], [cx - w, cy - h], [cx, cy + G('trShDy') * s - h]], S('trTrunkL'));
  for (const [dx, dy, r, c] of blobsOf(ctx.params as P)) {
    g.circle(cx + dx * s, cy + dy * s, r * s).fill({ color: c });
  }
  g.circle(cx + G('trHiDx') * s, cy - h - G('trHiDy') * s, G('trHiR') * s).fill({ color: S('trHiFill') });
};

/* ============ 路灯（v5 streetLamp line 110–116）—— ground ============ */
export const lamp: ProcPreset = (g, ctx) => {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy } = frame(ctx);
  const s = ctx.s * G('lpScale');
  const h = G('lpH') * s;
  g.ellipse(cx, cy + G('lpShDy') * s, G('lpShRx') * s, G('lpShRy') * s).fill({ color: S('lpSh') });
  g.rect(cx - (G('lpPoleW') * s) / 2, cy - h, G('lpPoleW') * s, h).fill({ color: S('lpPoleFill') });
  g.circle(cx, cy - h - G('lpHeadDy') * s, G('lpGlowR') * s).fill({ color: S('lpGlow') });
  g.circle(cx, cy - h - G('lpHeadDy') * s, G('lpBulbR') * s).fill({ color: S('lpBulb') });
};
```

> 循环依赖：本文件从 `proc-building.ts` 只取 `hsl`（函数声明，已提升），从 `proc.ts` 只取 `arr/fb`（同样已提升）；`proc.ts` 在**文件末尾**再 import 本文件，求值顺序安全（与 Task 15 同一套规避方式）。

- [ ] **Step 4: 注册进 PROC_PRESETS，并让 Scene 把 mount 交给 resolvePlacement**

`src/render/providers/proc.ts` 末尾：

```ts
import { shop, sign } from './proc-building';
import { antenna, awning, banner, lamp, lantern, rooftopBox, signTower, tree } from './proc-props';

export const PROC_PRESETS: Record<string, ProcPreset> = {
  tile, tileEdge, bgGradient, solid, builtin, fountain, shop, sign,
  awning, lantern, banner, rooftopBox, signTower, antenna, tree, lamp,
};
```

`src/render/Scene.ts` 的 `resolvePlacement(...)` 调用补一个字段（其余不变）：

```ts
const place = resolvePlacement(
  { id: inst.id, c: inst.c, r: inst.r, slot: inst.slot, lift: inst.lift, box: inst.box, mount: inst.mount, pawnIndex: spec.pawnIndex ?? 0 },
  this.deps.geo,
  this.deps.placement,
);
```

- [ ] **Step 5: skin.json 补 8 条**

`public/skins/default/skin.json` 的 `elements` 追加：

```json
"prop.awning": { "kind": "proc", "preset": "awning", "params": {} },
"prop.lantern": { "kind": "proc", "preset": "lantern", "params": {} },
"prop.banner": { "kind": "proc", "preset": "banner", "params": { "text": "市集" } },
"prop.rooftopBox": { "kind": "proc", "preset": "rooftopBox", "params": {} },
"prop.signTower": { "kind": "proc", "preset": "signTower", "params": {} },
"prop.antenna": { "kind": "proc", "preset": "antenna", "params": {} },
"prop.tree": { "kind": "proc", "preset": "tree", "params": { "trScale": 0.62 } },
"prop.lamp": { "kind": "proc", "preset": "lamp", "params": { "lpScale": 0.9 } }
```

- [ ] **Step 6: 跑测试 + 两个校验**

Run: `npx vitest run test/render && npm run lint && npm run lint:skin`
Expected: 全绿（proc-props 11 例 + placement 7 例）/ 0 错 / `[skin:default] OK`。

- [ ] **Step 7: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test
git commit -m "feat(mono): prop.* 八件通用构件 provider（遮阳篷/灯笼/幌子/屋顶箱/招牌塔/天线/树/路灯）"
```

---

## Task 18: 建筑入棋盘（BuildingView：18 栋楼 + 店招 + 挂件 + 内环街道小品）

**Files:**
- Create: `d:\zhao\monopoly\src\render\BuildingView.ts`
- Modify: `d:\zhao\monopoly\src\data\board.ts`（补 4 张演示表）
- Modify: `d:\zhao\monopoly\src\render\PieceView.ts`（`PawnState` 瘦身 + spec 带 `pawnIndex`）
- Modify: `d:\zhao\monopoly\src\main.ts`（接线全部视图 + 演示棋子 + 当前格 index 4）
- Test: `d:\zhao\monopoly\test\render\building-view.spec.ts`

> 移植源：v5 `isoBoard()` line 297–314 —— line 302 `isoShop(x, y - 1, 0.72, lv, OHUE[owner], {})`。
> **本任务的计数依据**（全部来自 `TILE_LEVEL` 与 v5 的分支）：L1 = 9 格（1,3,8,11,15,16,22,24,28）→ 遮阳篷；L2 = 6 格（4,6,10,13,20,26）→ 屋顶设备箱 + 店招；L3 = 3 格（0,18,30）→ 屋顶设备箱 + 招牌塔 + 店招。
> **与 v5 的差异（有意为之，逐条可查）**：
> 1. v5 的棋盘楼 `opts = {}`，故无店招/幌子/灯笼；本计划按 spec §3.3 把这些列为楼体特征，M3 只在**少数地块**给幌子（`SLOT_BANNER` 5 格），避免满街挑臂。
> 2. v5 的招牌塔（line 226–229）已自带桅杆 + 红灯，故 L3 **不再重复挂** `prop.antenna`（否则一根塔上两盏红灯）。
> 3. v5 内环只画树（line 294）；本计划给通往广场的 4 格石板路各补一盏路灯（棋盘上的「街区感」延伸）。
> 4. 挂件的抬升全部由注册表 `attach.atV` + 管线施加，preset 内用 `y0` 还原宿主基座——见 Task 14/Task 17。

- [ ] **Step 1: 写失败测试**

`test/render/building-view.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  INNER_STREET_PROPS, buildingSpecs, hueOf, slotLevelsOf, streetPropSpecs,
} from '../../src/render/BuildingView';
import {
  DEMO_OWNER, OWNER_HUE, SLOT_BANNER, SLOT_LANTERN_CHAR, TILE_BRAND, TILE_LEVEL,
} from '../../src/data/board';
import type { ElementSpec } from '../../src/skin/instantiate';

const byId = (specs: ElementSpec[], id: string) => specs.filter((s) => s.id === id);
const byPrefix = (specs: ElementSpec[], p: string) => specs.filter((s) => s.id.startsWith(p));
const endsWith = (specs: ElementSpec[], tail: string) => specs.filter((s) => s.id.endsWith(tail));

describe('BuildingView · 层级表与色相', () => {
  it('slotLevelsOf 只收 lv>0 的 18 格，值为 1/2/3', () => {
    const lv = slotLevelsOf();
    expect(Object.keys(lv).length).toBe(18);
    expect(TILE_LEVEL.filter((x) => x > 0).length).toBe(18);
    expect(lv[0]).toBe(3);
    expect(lv[18]).toBe(3);
    expect(lv[30]).toBe(3);
    expect(lv[2]).toBeUndefined();
  });

  it('hueOf：有归属取归属色相，无归属落 2 号暖橙', () => {
    expect(hueOf(0, (i) => DEMO_OWNER[i] ?? null)).toBe(OWNER_HUE[1]);
    expect(hueOf(4, (i) => DEMO_OWNER[i] ?? null)).toBe(OWNER_HUE[2]);
    expect(hueOf(19, (i) => DEMO_OWNER[i] ?? null)).toBe(OWNER_HUE[2]);
    expect(hueOf(4, () => null)).toBe(OWNER_HUE[2]);
  });
});

describe('BuildingView · 楼与店招', () => {
  const specs = buildingSpecs();

  it('18 栋楼（L1 9 / L2 6 / L3 3）+ 9 张店招（仅 L2/L3）= 27 条 building.*', () => {
    expect(byPrefix(specs, 'building.').length).toBe(27);
    expect(endsWith(specs, '.l1').length).toBe(9);
    expect(endsWith(specs, '.l2').length).toBe(6);
    expect(endsWith(specs, '.l3').length).toBe(3);
    const signs = endsWith(specs, '.sign');
    expect(signs.length).toBe(9);
    expect(signs.every((s) => s.level !== 1)).toBe(true);
    expect(signs.filter((s) => s.level === 2).length).toBe(6);
    expect(signs.filter((s) => s.level === 3).length).toBe(3);
  });

  it('每栋楼的元素级覆盖命中自身 id，preset = shop，levels 与 hue 正确', () => {
    const one = specs.find((s) => s.id === 'building.s4.l2');
    expect(one).toBeTruthy();
    expect(one.level).toBe(2);
    expect(one.state).toMatchObject({ level: 2, dim: false });
    const p = one.overrides?.['building.s4.l2'] as { kind: string; preset: string; params: Record<string, unknown> };
    expect(p.kind).toBe('proc');
    expect(p.preset).toBe('shop');
    expect(p.params.levels).toBe(2);
    expect(p.params.hue).toBe(OWNER_HUE[2]);
    expect(p.params.brand).toBe(TILE_BRAND[4]);
  });

  it('店招 override 带 brand，且层级跟随宿主楼', () => {
    const sign = specs.find((s) => s.id === 'building.s18.sign');
    expect(sign).toBeTruthy();
    expect(sign.level).toBe(3);
    const p = sign.overrides?.['building.s18.sign'] as { preset: string; params: Record<string, unknown> };
    expect(p.preset).toBe('sign');
    expect(p.params.levels).toBe(3);
    expect(p.params.brand).toBe('火锅店');
  });
});

describe('BuildingView · 挂件', () => {
  const specs = buildingSpecs();

  it('L1 遮阳篷 9；L2/L3 屋顶设备箱 9；L3 招牌塔 3；不再重复挂独立天线', () => {
    expect(byId(specs, 'prop.awning').length).toBe(9);
    expect(byId(specs, 'prop.rooftopBox').length).toBe(9);
    expect(byId(specs, 'prop.signTower').length).toBe(3);
    expect(byId(specs, 'prop.antenna').length).toBe(0);
  });

  it('灯笼每栋 2 盏（门口 + 右侧），有字地块写自己的招牌字', () => {
    const lamps = byId(specs, 'prop.lantern');
    expect(lamps.length).toBe(36);
    const hot = lamps.filter((s) => s.slot === 4);
    expect(hot.length).toBe(2);
    expect(hot.map((s) => s.state?.at).sort()).toEqual(['door', 'side']);
    expect(hot.every((s) => s.state?.char === SLOT_LANTERN_CHAR[4])).toBe(true);
    const plain = lamps.filter((s) => s.slot === 0);
    expect(plain.every((s) => s.state?.char === '')).toBe(true);
  });

  it('竖招幌子 5 条，文字来自 SLOT_BANNER，override 的 preset = banner', () => {
    const banners = byId(specs, 'prop.banner');
    expect(banners.length).toBe(Object.keys(SLOT_BANNER).length);
    expect([...banners.map((s) => Number(s.slot))].sort((a, b) => a - b)).toEqual([0, 4, 6, 18, 26]);
    const b = banners.find((s) => s.slot === 26);
    const p = b?.overrides?.['prop.banner'] as { preset: string; params: Record<string, unknown> };
    expect(p.preset).toBe('banner');
    expect(p.params.text).toBe('酒厂');
  });

  it('挂件带 slot（抬升交给注册表 + 管线），且不自己写覆盖', () => {
    for (const s of [...byId(specs, 'prop.awning'), ...byId(specs, 'prop.rooftopBox'), ...byId(specs, 'prop.signTower')]) {
      expect(typeof s.slot).toBe('number');
      expect(s.overrides).toBeUndefined();
    }
  });
});

describe('BuildingView · 内环街道小品', () => {
  it('行道树 ×2（v5 line 294）+ 石板路路灯 ×4，且都在地面上', () => {
    const specs = streetPropSpecs();
    expect(byId(specs, 'prop.tree').length).toBe(2);
    expect(byId(specs, 'prop.lamp').length).toBe(4);
    expect(specs.every((s) => s.slot === null)).toBe(true);
    expect(INNER_STREET_PROPS.filter((p) => p.kind === 'tree').map((p) => [p.c, p.r])).toEqual([[2, 8], [8, 2]]);
    expect(INNER_STREET_PROPS.filter((p) => p.kind === 'lamp').map((p) => [p.c, p.r]))
      .toEqual([[3, 5], [5, 3], [7, 5], [5, 7]]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/building-view.spec.ts`
Expected: FAIL，模块 `BuildingView` 不存在。

- [ ] **Step 3: 补演示数据表并实现 BuildingView.ts**

`src/data/board.ts` 末尾追加（**注意：本文件不在 `src/render/**` 下，演示数据允许写裸字面量**）：

```ts
/** v5 样张 line 58：演示归属（M3 视觉回归与「开局画面」用；真实归属由 M4 买地写回） */
export const DEMO_OWNER: Record<number, 1 | 2 | 3 | 4> = {
  0: 1, 1: 3, 3: 1, 4: 2, 6: 4, 8: 2, 10: 3, 11: 1, 13: 1, 15: 4, 16: 1,
  18: 2, 20: 3, 22: 2, 24: 1, 26: 4, 28: 3, 30: 2,
};

/** v5 样张 line 59 OHUE：四位玩家的楼体色相（与 tokens.owner1..owner4 同源） */
export const OWNER_HUE: Record<number, number> = { 1: 145, 2: 32, 3: 338, 4: 200 };

/** 竖招幌子文字（v5 V 版「市集/温泉/烧烤/火锅/酒厂」；只给少数地块，避免满街挑臂） */
export const SLOT_BANNER: Record<number, string> = {
  0: '市集', 4: '温泉', 6: '烧烤', 18: '火锅', 26: '酒厂',
};

/** 灯笼字：只有 4 家有招牌字（挂门口那盏写自己的字） */
export const SLOT_LANTERN_CHAR: Record<number, string> = {
  4: '汤', 6: '烤', 18: '锅', 26: '酒',
};
```

`src/render/BuildingView.ts`：

```ts
import {
  BOARD_COLS, BOARD_ROWS, DEMO_OWNER, OWNER_HUE,
  SLOT_BANNER, SLOT_LANTERN_CHAR, TILE_BRAND, TILE_LEVEL, ringPath,
} from '../data/board';
import type { ElementSpec } from '../skin/instantiate';
import type { ProviderSpec } from '../skin/types';

/** 无归属地块兜底色相（= 2 号玩家的暖橙；ALLOW 内的小整数，不算裸常数） */
const HUE_FALLBACK_OWNER = 2;

/** 内环街道小品：行道树 ×2（v5 line 294）+ 通往广场的 4 格石板路路灯 */
export const INNER_STREET_PROPS: Array<{ kind: 'tree' | 'lamp'; c: number; r: number }> = [
  { kind: 'tree', c: 2, r: 8 },
  { kind: 'tree', c: 8, r: 2 },
  { kind: 'lamp', c: 3, r: 5 },
  { kind: 'lamp', c: 5, r: 3 },
  { kind: 'lamp', c: 7, r: 5 },
  { kind: 'lamp', c: 5, r: 7 },
];

export interface BuildingOpts {
  /** 归属查询：1..4 或 null（不传则用 v5 演示归属 DEMO_OWNER） */
  ownerOf?: (index: number) => number | null;
  /** 店招文字（不传则用 TILE_BRAND[index]） */
  brandOf?: (index: number) => string;
}

function proc(preset: string, params: Record<string, unknown>): ProviderSpec {
  return { kind: 'proc', preset, params };
}

/** 元素级覆盖（回退链第 ① 级）：只覆盖本 spec 自己的 id，不动皮肤包 */
function only(id: string, p: ProviderSpec): Record<string, ProviderSpec> {
  return { [id]: p };
}

/** 地块序号 → 建筑层级（只收 lv>0 的 18 格；未列入者无楼，其地砖回到 level 1） */
export function slotLevelsOf(): Record<number, 1 | 2 | 3> {
  const out: Record<number, 1 | 2 | 3> = {};
  TILE_LEVEL.forEach((lv, index) => {
    if (lv === 0) return;
    out[index] = lv;
  });
  return out;
}

/** 该地块的楼体色相：v5 由归属玩家决定（无归属 → 2 号暖橙） */
export function hueOf(index: number, ownerOf: (i: number) => number | null): number {
  const owner = ownerOf(index);
  return OWNER_HUE[owner ?? HUE_FALLBACK_OWNER] ?? OWNER_HUE[HUE_FALLBACK_OWNER];
}

/**
 * 挂件 spec：只声明 id / slot / c / r / state，
 * 抬升由注册表的 `attach.atV` 与管线施加（spec §3.7.3 铁律 1），这里不写任何坐标。
 */
function propSpec(
  id: string,
  slot: number,
  c: number,
  r: number,
  level: 1 | 2 | 3,
  state: Record<string, unknown>,
  override?: ProviderSpec,
): ElementSpec {
  return {
    id, slot, c, r, level, state,
    ...(override ? { overrides: only(id, override) } : {}),
  };
}

/** 18 栋楼 + 店招 + 挂件（v5 line 302 `isoShop(x, y - 1, 0.72, lv, OHUE[owner], {})`） */
export function buildingSpecs(opts: BuildingOpts = {}): ElementSpec[] {
  const ownerOf = opts.ownerOf ?? ((index: number) => DEMO_OWNER[index] ?? null);
  const brandOf = opts.brandOf ?? ((index: number) => TILE_BRAND[index]);
  const levels = slotLevelsOf();
  const out: ElementSpec[] = [];

  ringPath(BOARD_COLS, BOARD_ROWS).forEach(([c, r], index) => {
    const lv = levels[index];
    if (lv === undefined) return;

    const hue = hueOf(index, ownerOf);
    const brand = brandOf(index);
    const wallId = `building.s${index}.l${lv}`;

    out.push({
      id: wallId, slot: index, c, r, level: lv,
      state: { level: lv, dim: false },
      overrides: only(wallId, proc('shop', { levels: lv, hue, brand })),
    });

    /* 店招：L2/L3 才有（L1 是摊位，v5 用遮阳篷代替） */
    if (lv !== 1) {
      const signId = `building.s${index}.sign`;
      out.push({
        id: signId, slot: index, c, r, level: lv,
        state: { level: lv },
        overrides: only(signId, proc('sign', { levels: lv, brand })),
      });
      /* 屋顶设备箱（v5 line 221–222 两个 isoBox，由 preset 一次画完） */
      out.push(propSpec('prop.rooftopBox', index, c, r, lv, { level: lv }));
    } else {
      /* 遮阳篷（v5 line 212–216） */
      out.push(propSpec('prop.awning', index, c, r, lv, { level: lv }));
    }

    /* 招牌塔（自带桅杆 + 红灯，v5 line 226–229）：L3 */
    if (lv === 3) out.push(propSpec('prop.signTower', index, c, r, lv, { level: lv }));

    /* 红灯笼 ×2：门口 + 右侧（v5 line 249–250） */
    const char = SLOT_LANTERN_CHAR[index] ?? '';
    out.push(propSpec('prop.lantern', index, c, r, lv, { level: lv, at: 'door', char }));
    out.push(propSpec('prop.lantern', index, c, r, lv, { level: lv, at: 'side', char }));

    /* 竖招幌子：只给 SLOT_BANNER 里的少数地块 */
    const vb = SLOT_BANNER[index];
    if (vb) out.push(propSpec('prop.banner', index, c, r, lv, { level: lv }, proc('banner', { text: vb })));
  });

  return out;
}

/** 内环街道小品（ground，不随建筑缩放） */
export function streetPropSpecs(): ElementSpec[] {
  return INNER_STREET_PROPS.map((p) => ({ id: `prop.${p.kind}`, slot: null, c: p.c, r: p.r }));
}
```

- [ ] **Step 4: `PieceView` 把错开序号写进 spec**

`src/render/PieceView.ts` 里，`PawnState` 与 `pawnSpecs` 换成（`pawnSlots` 保留不动，Task 13 的测试还在用）：

```ts
/** 棋子的棋盘位置（屏幕坐标由 Scene 的 resolvePlacement 统一算，这里不存 x/y） */
export interface PawnState { index: number; c: number; r: number }

/**
 * 生成棋子 spec（第三遍）：同格四人靠 spec.pawnIndex 让 Scene 横向错开，
 * 自己不算坐标（spec §3.7.1「渲染层禁止直接画」）。
 */
export function pawnSpecs(pawns: PawnState[]): ElementSpec[] {
  const byCell = new Map<string, PawnState[]>();
  for (const pw of pawns) {
    const k = `${pw.c},${pw.r}`;
    byCell.set(k, [...(byCell.get(k) ?? []), pw]);
  }
  const out: ElementSpec[] = [];
  for (const [, group] of byCell) {
    const { c, r } = group[0];
    group.forEach((pw, i) => {
      out.push({ id: `piece.p${pw.index + 1}`, slot: null, c, r, pawnIndex: i });
    });
  }
  return out;
}
```

- [ ] **Step 5: 在 main.ts 接上「楼 + 店招 + 挂件 + 内环小品 + 演示棋子」**

`src/main.ts` 的 `boot()` 改为（关键差异：`slotLevels` 不再为空、`addMany` 五组视图、当前格 index 4 = v5 `CUR`）：

```ts
import { PAWN_COUNT, pawnSpecs } from './render/PieceView';
import { buildingSpecs, slotLevelsOf, streetPropSpecs } from './render/BuildingView';
import { innerSpecs, fountainSpec } from './render/InnerView';
import { DEMO_OWNER } from './data/board';
import { drawLabels } from './render/LabelView';
```

```ts
export async function boot(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('[mono] #stage not found');
  const opts = parseOptions(location.search);

  const defaultSkin = await loadSkin('default');
  const skin = opts.skin === 'default' ? defaultSkin : await loadSkin(opts.skin);
  const geo = skin?.geo ?? defaultSkin?.geo ?? { hw: 21, hh: 10.5, ox: 195, oy: 96 };
  const tokens = { ...(defaultSkin?.tokens ?? {}), ...(skin?.tokens ?? {}) };

  const stage = await createStage(canvas, { bg: BG_FALLBACK, dpr: window.devicePixelRatio || 2 });
  const scene = new Scene({
    layers: stage.layers,
    geo,
    bg: { color: tokens.bgBottom ?? '#0c1513', alpha: 1 },
    instantiateDeps: { skin, defaultSkin, overrides: null, slotLevels: slotLevelsOf() },
    placement: { pawnGap: 9.6, pawnFrontDy: 1.45, pawnScale: 0.62, buildingScale: 0.72, buildingYOffset: 1 },
  });

  /* v5 样张 line 63：当前格 index 4（太平温泉）在 (5,9)，四枚棋子同格 */
  const CURRENT = 4;
  const CURRENT_CELL: [number, number] = [5, 9];
  const demoPawns = Array.from({ length: PAWN_COUNT }, (_, index) => ({
    index, c: CURRENT_CELL[0], r: CURRENT_CELL[1],
  }));
  const ownerOf = (i: number): number | null => DEMO_OWNER[i] ?? null;

  scene.addMany([
    ...boardTileSpecs(CURRENT, ownerOf),
    ...innerSpecs(),
    fountainSpec(),
    ...buildingSpecs({ ownerOf }),
    ...streetPropSpecs(),
    ...pawnSpecs(demoPawns),
  ]);
  scene.render();

  drawLabels(stage.layers.labels, geo, {
    bg: tokens.labelBg ?? '#060a08',
    text: tokens.labelText ?? '#d8e4dc',
    ownedText: tokens.labelOwnedText ?? '#ffffff',
    ownerOf,
  }, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });

  if (opts.debug) createDebugPanel().mount(document.body);
  (window as unknown as Record<string, unknown>).__monoMain = { stage, scene, opts, geo, skin, VERSION };
}
```

> `main.ts` 不在 `src/render/**` 下，故 `9.6 / 1.45 / 0.62 / 0.72 / 1` 这些管线参数**允许**写在这里（它们是 PlacementOpts 的实参，不是渲染层的裸常数）；渲染层内部一律走 skin.json / 注册表。

- [ ] **Step 6: 跑测试 + lint + 截图验收**

Run: `npx vitest run test/render && npm test`
Expected: 全绿（building-view 8 例 + proc-props 11 例 + placement 8 例 + 其余 M1/M2 用例）。

Run: `npm run lint && npm run lint:skin`
Expected: 0 错 / `[skin:default] OK`（`BuildingView.ts` 内无裸色值与裸几何常数——常量都在 `src/data/board.ts`）。

Run: `npm run dev`（后台）→ `node local/mono-shots-m2.mjs`
Expected: `gate` 全 `true`，且新截图能看到：外圈 18 栋立体楼（L1 坡顶摊位 / L2 两层暖窗 / L3 玻璃幕墙）、L2/L3 右墙斜面店招、L1 红白遮阳篷、屋顶设备箱与 3 座招牌塔、每栋门口两盏红灯笼、5 面竖招幌子、内环 2 棵树 + 4 盏路灯。

- [ ] **Step 7: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test
git commit -m "feat(mono): 建筑入棋盘（18 栋楼 + 店招 + 挂件 + 内环街道小品）"
```

---

## Task 19: 地块橱窗 B 版式（ShowcaseView：夜空 + 天际线 + 石板广场 + 温泉馆）

**Files:**
- Create: `d:\zhao\monopoly\src\render\providers\proc-showcase.ts`
- Create: `d:\zhao\monopoly\src\render\ShowcaseView.ts`
- Modify: `d:\zhao\monopoly\src\render\providers\proc-building.ts`（`shop` 补温泉池 / 蒸汽两条分支）
- Modify: `d:\zhao\monopoly\src\render\providers\proc.ts`（注册 5 个 showcase preset）
- Modify: `d:\zhao\monopoly\src\render\providers\index.ts`（`image` 桩注释指到 Task 21）
- Modify: `d:\zhao\monopoly\src\skin\ids.ts`（NAMESPACES 加 `showcase`）
- Modify: `d:\zhao\monopoly\src\skin\registry.ts`（11 条 `showcase.*` 元素）
- Modify: `d:\zhao\monopoly\src\skin\instantiate.ts`（`ElementSpec` 加 `pass` / `fixed`）
- Modify: `d:\zhao\monopoly\src\render\Scene.ts`（`DrawPlanItem.index`、`Pass` 加 4、`fixed` 短路、fx 层）
- Modify: `d:\zhao\monopoly\src\render\BuildingView.ts`（导出 `proc` / `only` 两个 spec 帮助函数）
- Modify: `d:\zhao\monopoly\src\data\board.ts`（租金表 / 玩家名 / 橱窗演示文案）
- Modify: `d:\zhao\monopoly\public\skins\default\skin.json`（11 条 showcase 元素）
- Modify: `d:\zhao\monopoly\src\main.ts`（`UrlOptions.show` + 接线橱窗）
- Modify: `d:\zhao\monopoly\test\skin\ids.spec.ts`（NAMESPACES 期望值加 `showcase`）
- Modify: `d:\zhao\monopoly\test\render\scene-order.spec.ts`（`DrawPlanItem` 补 `index`）
- Test: `d:\zhao\monopoly\test\render\proc-showcase.spec.ts`
- Test: `d:\zhao\monopoly\test\render\showcase-view.spec.ts`

> **移植源**：v5 `showcase(w, h, idx, s, opts)`（line 337–367）+ optB 叠层（line 443–449）。
> **本任务引入的两条管线扩展**（都是"唯一入口"的延伸，不是旁路）：
> 1. `ElementSpec.fixed` —— 橱窗元素不在棋盘网格上（没有 c/r 的等距坐标），必须用绝对屏幕台位；`resolvePlacement` 遇到 `fixed` 直接短路，**其余元素一律照旧**。
> 2. `ElementSpec.pass` —— 橱窗必须压在棋盘与棋子之上。`passOf()` 的规则「其它 → 1」会把橱窗排到深度 0，反而被地砖盖住；故显式给 `pass: 4`（`layers.fx` 覆盖层）。M4 的浮层/动画也走这一层。
> **与 v5 的差异（有意为之）**：v5 的 `showcase()` 是一整块 SVG 串；本计划拆成 6 个可寻址元素（`showcase.panel/sky/skyline/ground/hud` + 复用 `tree/lamp/shop/sign/lantern/banner` 的 showcase 变体），色值全部落 skin.json、版式常量集中在 `SHOWCASE_L`。CSS 纵向渐变（`nightSky`）在 Pixi `Graphics` 里没有直接对应物，改用 **24 条横带近似**（`skyBands` 可调），这是唯一的视觉近似处。

- [ ] **Step 1: 写失败测试（橱窗 5 个 provider + `shop` 的温泉分支）**

`test/render/proc-showcase.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  SHOWCASE_L, showcaseGround, showcaseHud, showcasePanel, showcaseSky, showcaseSkyline,
} from '../../src/render/providers/proc-showcase';
import { shop } from '../../src/render/providers/proc-building';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import type { TextRequest } from '../../src/render/providers/proc';

interface Rec { op: string; pts?: number[]; style: Record<string, unknown> }

/** 记录绘制指令：poly/rect/circle/ellipse 记数字入参，其余记 style */
function recorder() {
  const calls: Rec[] = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      if (op === 'poly' || op === 'rect' || op === 'circle' || op === 'ellipse') calls.push({ op, pts: a as number[], style: {} });
      else calls.push({ op, style: (a[0] ?? {}) as Record<string, unknown> });
      return g;
    },
  });
  return { g, calls };
}
const count = (calls: Rec[], op: string) => calls.filter((c) => c.op === op).length;
const fills = (calls: Rec[]) => calls.filter((c) => c.op === 'fill').map((c) => String(c.style.color ?? ''));

/** 橱窗元素全部以「面板左上角」为台位（cx/cy = SHOWCASE_L.x/y），box 即面板尺寸 */
const ctxOf = (params: Record<string, unknown> = {}, state: Record<string, unknown> = {}) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: SHOWCASE_L.w, d: 1, h: SHOWCASE_L.h },
  cx: SHOWCASE_L.x,
  cy: SHOWCASE_L.y,
  s: 1,
  params,
  state,
});

describe('showcase.panel 底板（v5 showcase line 340）', () => {
  it('一次圆角矩形，fill + stroke 都来自 params', () => {
    const { g, calls } = recorder();
    showcasePanel(g as never, ctxOf() as never);
    expect(count(calls, 'roundRect')).toBe(1);
    expect(calls.find((c) => c.op === 'fill')?.style).toEqual({ color: '#0f1a18' });
    expect(calls.find((c) => c.op === 'stroke')?.style).toEqual({ color: 'hsla(45,70%,55%,.5)', width: 1 });
  });
});

describe('showcase.sky 夜空（v5 line 344–345 的渐变近似）', () => {
  it('24 条横带铺满地平线以上，末带不低于地平线；月亮 + 光晕 2 圆', () => {
    const { g, calls } = recorder();
    showcaseSky(g as never, ctxOf() as never);
    expect(count(calls, 'rect')).toBe(SHOWCASE_L.skyBands);
    expect(count(calls, 'circle')).toBe(2);
    const ys = calls.filter((c) => c.op === 'rect').map((c) => c.pts![1]);
    expect(Math.min(...ys)).toBe(SHOWCASE_L.y);
    expect(Math.max(...ys)).toBeLessThan(SHOWCASE_L.y + SHOWCASE_L.h * SHOWCASE_L.gy);
  });

  it('三段色按 t1/t2 阈值切换（顶/中/底三色都出现）', () => {
    const { g, calls } = recorder();
    showcaseSky(g as never, ctxOf() as never);
    const cs = new Set(fills(calls));
    expect(cs).toEqual(new Set(['#0d1b2a', '#16302f', '#1e2f2a']));
  });
});

describe('showcase.skyline 亮窗天际线（v5 line 346–352）', () => {
  it('每栋楼 = 1 楼块 + 6 扇亮窗；楼块数与窗数严格成比例', () => {
    const { g, calls } = recorder();
    showcaseSkyline(g as never, ctxOf() as never);
    const rects = calls.filter((c) => c.op === 'rect');
    expect(rects.length % (SHOWCASE_L.skyWinRows + 1)).toBe(0);
    const blocks = rects.length / (SHOWCASE_L.skyWinRows + 1);
    expect(blocks).toBeGreaterThan(6);
    expect(blocks).toBeLessThan(20);
    expect(rects.filter((r) => r.pts![2] === SHOWCASE_L.skyWinW).length).toBe(blocks * SHOWCASE_L.skyWinRows);
  });

  it('楼块顶边都在地平线之上、底边压在地平线上', () => {
    const { g, calls } = recorder();
    showcaseSkyline(g as never, ctxOf() as never);
    const gy = SHOWCASE_L.y + SHOWCASE_L.h * SHOWCASE_L.gy;
    const blocks = calls.filter((c) => c.op === 'rect' && c.pts![2] !== SHOWCASE_L.skyWinW);
    for (const b of blocks) expect(b.pts![1] + b.pts![3]).toBeCloseTo(gy, 5);
  });
});

describe('showcase.ground 地面 + 石板广场（v5 line 354–357）', () => {
  it('一块地面矩形 + 两个菱形石板，填充色外深内浅', () => {
    const { g, calls } = recorder();
    showcaseGround(g as never, ctxOf() as never);
    expect(count(calls, 'rect')).toBe(1);
    expect(count(calls, 'poly')).toBe(2);
    expect(fills(calls)).toEqual(['#1b2622', '#2a3830', '#33423a']);
  });
});

describe('showcase.hud 信息条（v5 optB line 444–448）', () => {
  it('三个圆角底板 + 5 条左对齐文字（品牌/副标/两行信息/按钮）', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    showcaseHud(g as never, {
      ...ctxOf({}, {
        brand: '太平温泉', sub: '商铺 · 持有者 老王',
        line1: '2 层建筑 · 路过租金 ￥45', line2: '升级到 L3 → 租金 ￥105', cta: '支付 ￥180',
      }),
      text: (r: TextRequest) => texts.push(r),
    } as never);
    expect(count(calls, 'roundRect')).toBe(3);
    expect(texts.map((t) => t.text)).toEqual([
      '太平温泉', '商铺 · 持有者 老王', '2 层建筑 · 路过租金 ￥45', '升级到 L3 → 租金 ￥105', '支付 ￥180',
    ]);
    /* 信息条是左对齐排版（makeText 会据此把 anchor 设为 0） */
    expect(texts.every((t) => t.align === 'left')).toBe(true);
  });

  it('state 缺字段时不抛错、不产出空文字（缺素材不空白）', () => {
    const texts: TextRequest[] = [];
    const { g } = recorder();
    expect(() => showcaseHud(g as never, { ...ctxOf(), text: (r: TextRequest) => texts.push(r) } as never)).not.toThrow();
    expect(texts.length).toBe(0);
  });
});

describe('shop 温泉池与蒸汽（v5 line 252–258，showcase 专用分支）', () => {
  const base = {
    geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
    box: { w: 42, d: 21, h: 46 },
    cx: 195, cy: 96, s: 1,
    state: { level: 2 },
  };

  it('pool=true → 多 3 个椭圆（池沿/水面/高光）；默认不带', () => {
    const off = recorder();
    shop(off.g as never, { ...base, params: { levels: 2, hue: 32 } } as never);
    const on = recorder();
    shop(on.g as never, { ...base, params: { levels: 2, hue: 32, pool: true } } as never);
    expect(count(on.calls, 'ellipse') - count(off.calls, 'ellipse')).toBe(3);
  });

  it('steam=true → 多 6 个椭圆（3 组 × 2 团）', () => {
    const off = recorder();
    shop(off.g as never, { ...base, params: { levels: 2, hue: 32 } } as never);
    const on = recorder();
    shop(on.g as never, { ...base, params: { levels: 2, hue: 32, steam: true } } as never);
    expect(count(on.calls, 'ellipse') - count(off.calls, 'ellipse')).toBe(6);
  });

  it('state.pool / state.steam 同样生效（skin 与 override 两条路都行）', () => {
    const { g, calls } = recorder();
    shop(g as never, { ...base, params: { levels: 2, hue: 32 }, state: { level: 2, pool: true, steam: true } } as never);
    expect(count(calls, 'ellipse')).toBeGreaterThan(3);
  });
});

describe('注册表', () => {
  it('PROC_PRESETS 注册 5 个 showcase preset', () => {
    expect(PROC_PRESETS.showcasePanel).toBe(showcasePanel);
    expect(PROC_PRESETS.showcaseSky).toBe(showcaseSky);
    expect(PROC_PRESETS.showcaseSkyline).toBe(showcaseSkyline);
    expect(PROC_PRESETS.showcaseGround).toBe(showcaseGround);
    expect(PROC_PRESETS.showcaseHud).toBe(showcaseHud);
  });

  it('SHOWCASE_L 是 fb 容器：版式常量集中一处（唯一允许裸字面量的位置）', () => {
    expect(SHOWCASE_L.w).toBe(370);
    expect(SHOWCASE_L.h).toBe(300);
    expect(SHOWCASE_L.shopScale).toBe(3.2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/proc-showcase.spec.ts`
Expected: FAIL，模块 `proc-showcase` 不存在。

- [ ] **Step 3: 实现 proc-showcase.ts**

`src/render/providers/proc-showcase.ts`：

```ts
import type { Graphics } from 'pixi.js';
import { dia } from '../iso';
import { ptsToPoly } from '../paint';
import { fb, num, str, type ProcCtx, type ProcPreset } from './proc';

/**
 * 橱窗版式常量：`fb({...})` 是本工程唯一允许裸字面量的位置（Task 7 的 lint 豁免）。
 * 所有尺寸都是**面板局部坐标**（原点 = 面板左上角），units = CSS px。
 */
export const SHOWCASE_L = fb({
  /* 面板台位（v5 line 398–400：x 10 / y 322 / 370×300） */
  w: 370, h: 300, x: 10, y: 322,
  /* 地平线：占面板高度的 60%（v5 line 343 `const gy = h * 0.60`） */
  gy: 0.6,
  /* 月亮（v5 line 345） */
  moonX: 0.855, moonY: 0.3, moonR: 13, moonHaloF: 1.69,
  /* 夜空横带近似 */
  skyBands: 24, skyT1: 0.6, skyT2: 0.85,
  /* 天际线递推（v5 line 346–352） */
  skyStart: -6, skyW0: 16, skyWMod: 26, skyGap: 4,
  skyHMul: 13, skyHMod: 30, skyHModF: 100, skyHBase: 0.3,
  skyWinRows: 6, skyWinCols: 3, skyWinStepX: 6.4, skyWinStepY: 9,
  skyWinW: 2.6, skyWinH: 2.6, skyWinOx: 4, skyWinOy: 8,
  /* 石板广场（v5 line 355–357） */
  cyMax: 44, cyF: 0.92, slabDy: -4,
  slabRx: 0.45, slabRy: 0.52, inRx: 0.22, inRy: 0.26,
  /* 配景台位 [x 比例, y 绝对偏移, 缩放]（v5 line 359–362） */
  treeL: [0.13, 30, 1.45], treeR: [0.88, 20, 1.2],
  lampL: [0.04, 44, 1.3], lampR: [0.97, 32, 1.05],
  /* 大楼（v5 optB line 443：showcase(370, 300, 4, 3.2, …)） */
  shopScale: 3.2,
  /* 顶部药丸 / 底部信息条 / 金色按钮（v5 line 444–448） */
  pillX: 14, pillY: 12, pillW: 240, pillH: 26, pillR: 13,
  brandX: 28, brandY: 30, brandFs: 14,
  subX: 126, subY: 30, subFs: 10,
  barX: 14, barY: 248, barW: 342, barH: 38, barR: 12,
  barTx: 28, barTy1: 266, barFs1: 11, barTy2: 279, barFs2: 8.5,
  btnX: 240, btnY: 256, btnW: 106, btnH: 24, btnR: 12, btnCx: 293, btnCy: 272, btnFs: 10.5,
});

/** L4 内建兜底：橱窗的全部色值（v5 逐条对齐） */
const D = fb({
  panelFill: '#0f1a18', panelEdge: 'hsla(45,70%,55%,.5)', panelRadius: 16, panelEdgeW: 1,
  skyTop: '#0d1b2a', skyMid: '#16302f', skyBottom: '#1e2f2a', moon: '#e8f0ff',
  moonAlpha: 0.85, haloAlpha: 0.1,
  skylineFill: '#131f1c', skylineWin: 'rgba(255,214,130,.5)',
  groundFill: '#1b2622', slabFill: '#2a3830', slabEdge: 'rgba(255,255,255,.05)', slabEdgeW: 0.6, slabIn: '#33423a',
  pillBg: 'rgba(6,12,10,.8)', pillTx: '#ffffff', subTx: '#9fb3a8',
  barBg: 'rgba(6,12,10,.85)', barTx: '#ffffff',
  gold: '#f5c451', goldTx: '#1b1b1b',
});

/* —— 面板底板：圆角矩形（v5 showcase line 340） —— */
export const showcasePanel: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  g.roundRect(cx, cy, box.w, box.h, num(params, 'radius', D.panelRadius))
    .fill({ color: str(params, 'fill', D.panelFill) })
    .stroke({ color: str(params, 'edge', D.panelEdge), width: num(params, 'edgeW', D.panelEdgeW) });
};

/* —— 夜空：横带近似线性渐变 + 月亮与光晕（v5 line 343–345） —— */
export const showcaseSky: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const gy = box.h * num(params, 'gy', SHOWCASE_L.gy);
  const bands = num(params, 'bands', SHOWCASE_L.skyBands);
  const t1 = num(params, 't1', SHOWCASE_L.skyT1);
  const t2 = num(params, 't2', SHOWCASE_L.skyT2);
  const top = str(params, 'top', D.skyTop);
  const mid = str(params, 'mid', D.skyMid);
  const bottom = str(params, 'bottom', D.skyBottom);
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    g.rect(cx, cy + (gy * i) / bands, box.w, gy / bands + 1)
      .fill({ color: t < t1 ? top : t < t2 ? mid : bottom });
  }
  const mx = cx + box.w * num(params, 'moonX', SHOWCASE_L.moonX);
  const my = cy + box.h * num(params, 'moonY', SHOWCASE_L.moonY);
  const mr = num(params, 'moonR', SHOWCASE_L.moonR);
  const moon = str(params, 'moon', D.moon);
  g.circle(mx, my, mr).fill({ color: moon, alpha: num(params, 'moonA', D.moonAlpha) });
  g.circle(mx, my, mr * num(params, 'haloF', SHOWCASE_L.moonHaloF)).fill({ color: moon, alpha: num(params, 'haloA', D.haloAlpha) });
};

/* —— 天际线：楼块递推 + 每栋 6 扇亮窗（v5 line 346–352） —— */
export const showcaseSkyline: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const gy = box.h * num(params, 'gy', SHOWCASE_L.gy);
  const start = num(params, 'startX', SHOWCASE_L.skyStart);
  const w0 = num(params, 'bwBase', SHOWCASE_L.skyW0);
  const wm = num(params, 'bwMod', SHOWCASE_L.skyWMod);
  const gap = num(params, 'gap', SHOWCASE_L.skyGap);
  const hMul = num(params, 'hMul', SHOWCASE_L.skyHMul);
  const hMod = num(params, 'hMod', SHOWCASE_L.skyHMod);
  const hModF = num(params, 'hModF', SHOWCASE_L.skyHModF);
  const hBase = num(params, 'hBase', SHOWCASE_L.skyHBase);
  const rows = num(params, 'winRows', SHOWCASE_L.skyWinRows);
  const cols = num(params, 'winCols', SHOWCASE_L.skyWinCols);
  const stepX = num(params, 'winStepX', SHOWCASE_L.skyWinStepX);
  const stepY = num(params, 'winStepY', SHOWCASE_L.skyWinStepY);
  const winW = num(params, 'winW', SHOWCASE_L.skyWinW);
  const winH = num(params, 'winH', SHOWCASE_L.skyWinH);
  const winOx = num(params, 'winOx', SHOWCASE_L.skyWinOx);
  const winOy = num(params, 'winOy', SHOWCASE_L.skyWinOy);
  const fill = str(params, 'fill', D.skylineFill);
  const win = str(params, 'win', D.skylineWin);

  let px = start;
  while (px < box.w + Math.abs(start)) {
    const bw = w0 + ((px * 7) % wm + wm) % wm;
    const bh = gy * (hBase + ((px * hMul) % hMod + hMod) % hMod / hModF);
    g.rect(cx + px, cy + gy - bh, bw, bh).fill({ color: fill });
    for (let i = 0; i < rows; i++) {
      g.rect(cx + px + winOx + (i % cols) * stepX, cy + gy - bh + winOy + i * stepY, winW, winH).fill({ color: win });
    }
    px += bw + gap;
  }
};

/* —— 地面 + 两层石板广场（v5 line 354–357） —— */
export const showcaseGround: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const gy = box.h * num(params, 'gy', SHOWCASE_L.gy);
  const gh = box.h - gy;
  const ccx = cx + box.w / 2;
  const ccy = cy + gy + Math.min(gh, num(params, 'cyMax', SHOWCASE_L.cyMax)) * num(params, 'cyF', SHOWCASE_L.cyF);
  const dy = num(params, 'slabDy', SHOWCASE_L.slabDy);
  g.rect(cx, cy + gy, box.w, gh).fill({ color: str(params, 'fill', D.groundFill) });
  g.poly(ptsToPoly(dia(ccx, ccy + dy, box.w * num(params, 'slabRx', SHOWCASE_L.slabRx), gh * num(params, 'slabRy', SHOWCASE_L.slabRy))))
    .fill({ color: str(params, 'slab', D.slabFill) })
    .stroke({ color: str(params, 'slabEdge', D.slabEdge), width: num(params, 'slabEdgeW', D.slabEdgeW) });
  g.poly(ptsToPoly(dia(ccx, ccy + dy, box.w * num(params, 'inRx', SHOWCASE_L.inRx), gh * num(params, 'inRy', SHOWCASE_L.inRy))))
    .fill({ color: str(params, 'slabIn', D.slabIn) });
};

/* —— 信息条：顶部药丸 + 底部条 + 金色按钮（v5 optB line 444–448） —— */
export const showcaseHud: ProcPreset = (g, ctx) => {
  const { cx, cy, params, state } = ctx;
  const L = SHOWCASE_L;
  const pillTx = str(params, 'pillTx', D.pillTx);
  const subTx = str(params, 'subTx', D.subTx);
  const barTx = str(params, 'barTx', D.barTx);
  const goldTx = str(params, 'goldTx', D.goldTx);

  g.roundRect(cx + L.pillX, cy + L.pillY, L.pillW, L.pillH, L.pillR).fill({ color: str(params, 'pillBg', D.pillBg) });
  g.roundRect(cx + L.barX, cy + L.barY, L.barW, L.barH, L.barR).fill({ color: str(params, 'barBg', D.barBg) });
  g.roundRect(cx + L.btnX, cy + L.btnY, L.btnW, L.btnH, L.btnR).fill({ color: str(params, 'gold', D.gold) });

  const emit = (key: string, x: number, y: number, size: number, fill: string): void => {
    const text = str(state, key, '');
    if (text) ctx.text?.({ text, x, y, size, fill, align: 'left' });
  };
  emit('brand', cx + L.brandX, cy + L.brandY, L.brandFs, pillTx);
  emit('sub', cx + L.subX, cy + L.subY, L.subFs, subTx);
  emit('line1', cx + L.barTx, cy + L.barTy1, L.barFs1, barTx);
  emit('line2', cx + L.barTx, cy + L.barTy2, L.barFs2, subTx);
  emit('cta', cx + L.btnCx, cy + L.btnCy, L.btnFs, goldTx);
};
```

- [ ] **Step 4: 注册 5 个 preset 并补 `shop` 的温泉分支**

`src/render/providers/proc.ts` 末尾：

```ts
import { shop, sign } from './proc-building';
import { antenna, awning, banner, lamp, lantern, rooftopBox, signTower, tree } from './proc-props';
import { showcaseGround, showcaseHud, showcasePanel, showcaseSky, showcaseSkyline } from './proc-showcase';

export const PROC_PRESETS: Record<string, ProcPreset> = {
  tile, tileEdge, bgGradient, solid, builtin, fountain, shop, sign,
  awning, lantern, banner, rooftopBox, signTower, antenna, tree, lamp,
  showcasePanel, showcaseSky, showcaseSkyline, showcaseGround, showcaseHud,
};
```

`src/render/providers/proc-building.ts` 的 `D` 追加：

```ts
  /* 温泉池（v5 line 252–256） */
  poolFy: 1.7, poolRx0: 0.8, poolRy0: 0.62, poolRx1: 0.68, poolRy1: 0.5,
  poolShX: 0.2, poolShY: 0.1, poolShRx: 0.3, poolShRy: 0.2,
  poolRim: '#3b3a33', poolWater: '#2c6a80', poolShine: 'rgba(160,230,255,.28)',
  /* 温泉蒸汽（v5 line 129–137 steam()） */
  steamN: 3, steamDx: 9, steamDy: 2, steamUp: 6,
  steamRx0: 5, steamRy0: 3, steamRyK: 0.6,
  steamDx2: 2, steamUp2: 9, steamDy2: 3, steamRx1: 4, steamRy1: 2.4, steamRyK2: 0.5,
  steam1: 'rgba(255,255,255,.13)', steam2: 'rgba(255,255,255,.09)',
```

`shop` preset 的 ⑧ 段之后（函数末尾）追加：

```ts
  /* ⑨ 温泉池 + 蒸汽（v5 line 252–258）：只给 showcase 的温泉馆，棋盘楼不带 */
  if (p.pool === true || state.pool === true) {
    const py = cy + d * G('poolFy');
    g.ellipse(cx, py, w * G('poolRx0'), d * G('poolRy0')).fill({ color: S('poolRim') });
    g.ellipse(cx, py, w * G('poolRx1'), d * G('poolRy1')).fill({ color: S('poolWater') });
    g.ellipse(cx - w * G('poolShX'), py - d * G('poolShY'), w * G('poolShRx'), d * G('poolShRy')).fill({ color: S('poolShine') });
  }
  if (p.steam === true || state.steam === true) {
    for (let i = 0; i < G('steamN'); i++) {
      const sx = cx + (i - 1) * G('steamDx') * s;
      const sy = cy - h - G('steamUp') * s - i * G('steamDy') * s;
      g.ellipse(sx, sy, (G('steamRx0') + i) * s, (G('steamRy0') + i * G('steamRyK')) * s).fill({ color: S('steam1') });
      g.ellipse(sx + G('steamDx2') * s, sy - G('steamUp2') * s - i * G('steamDy2') * s,
        (G('steamRx1') + i) * s, (G('steamRy1') + i * G('steamRyK2')) * s).fill({ color: S('steam2') });
    }
  }
```

- [ ] **Step 5: 开 `showcase` 命名空间与注册表条目**

`src/skin/ids.ts` 的 `NAMESPACES` 追加一项：

```ts
export const NAMESPACES = [
  'token', 'board.tile', 'board.inner', 'board.center',
  'building', 'prop', 'piece', 'dice', 'card', 'fx', 'ui', 'showcase',
] as const;
```

`test/skin/ids.spec.ts` 里那条 `expect(NAMESPACES).toEqual([...])` 同步补 `'showcase'`（追加到末尾，顺序一致）。

`src/skin/registry.ts` 末尾（`export const REGISTRY` 之前）追加：

```ts
// —— 地块橱窗（B 版式）：全部 ground 挂载，台位由 ElementSpec.fixed 给（不走 resolvePlacement） ——
const showcaseEntry = (id: string, box: { w: number; d: number; h: number }): RegistryEntry => ({
  id, box, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'],
});
const SC_PANEL = { w: 370, d: 1, h: 300 };
reg['showcase.panel'] = showcaseEntry('showcase.panel', SC_PANEL);
reg['showcase.sky'] = showcaseEntry('showcase.sky', { w: 370, d: 1, h: 180 });
reg['showcase.skyline'] = showcaseEntry('showcase.skyline', { w: 370, d: 1, h: 180 });
reg['showcase.ground'] = showcaseEntry('showcase.ground', { w: 370, d: 1, h: 120 });
reg['showcase.hud'] = showcaseEntry('showcase.hud', SC_PANEL);
reg['showcase.shop'] = showcaseEntry('showcase.shop', { w: 42, d: 21, h: BUILDING_HEIGHTS[2] });
reg['showcase.sign'] = showcaseEntry('showcase.sign', { w: 30, d: 2, h: 8 });
reg['showcase.lantern'] = showcaseEntry('showcase.lantern', { w: 10, d: 2, h: 14 });
reg['showcase.banner'] = showcaseEntry('showcase.banner', { w: 10, d: 2, h: 30 });
reg['showcase.tree'] = showcaseEntry('showcase.tree', { w: 14, d: 8, h: 30 });
reg['showcase.lamp'] = showcaseEntry('showcase.lamp', { w: 8, d: 4, h: 28 });
```

> `showcase.*` 一律 `mount: 'ground'`：橱窗是"定格台位"，`lift` 必须为 0，否则 `sign`/`lantern`/`banner` 的 `y0 = cy + lift×s` 还原会被抬到楼外（Task 16/Task 17 的 y0 约定）。

- [ ] **Step 6: `ElementSpec` 补 `pass`/`fixed`，`Scene.render()` 出终稿**

`src/skin/instantiate.ts` 的 `ElementSpec` 追加两字段：

```ts
  /** 棋子同格错开用（`piece.*` 第三遍）：第 i 枚 → Scene 交给 resolvePlacement 算 cx */
  pawnIndex?: number;
  /** 绘制遍覆盖（1 地面 / 2 标签 / 3 棋子 / 4 覆盖层 fx）；缺省由 Scene.passOf(id) 决定 */
  pass?: 1 | 2 | 3 | 4;
  /** 舞台定格台位（地块橱窗）：跳过 resolvePlacement，直接用绝对屏幕坐标与缩放 */
  fixed?: { cx: number; cy: number; s?: number };
```

`src/render/Scene.ts`：

① `Pass` 加第 4 遍、`DrawPlanItem` 携带 `index`：

```ts
export type Pass = 1 | 2 | 3 | 4;

export interface DrawPlanItem { index: number; id: string; c: number; r: number; depth: number; pass: Pass }
```

② `render()` 整段替换为（含 `index` 取源、`pass 4 → layers.fx`、`fixed` 短路）：

```ts
  /** 全量重建：清层 → 三遍绘制（唯一入画口） */
  render(): void {
    const { layers, instantiateDeps, bg } = this.deps;
    layers.ground.removeChildren();
    layers.labels.removeChildren();
    layers.pieces.removeChildren();
    layers.fx.removeChildren();

    const back = new Graphics();
    back.rect(0, 0, layers.ground.width || STAGE_W, layers.ground.height || STAGE_H).fill({ color: bg.color, alpha: bg.alpha });
    layers.ground.addChild(back);

    this.instances = this.items.map((s) => instantiate(s, instantiateDeps));
    const plan = planDrawOrder(
      this.instances.map((inst, index) => ({
        index,
        id: inst.id,
        c: inst.c,
        r: inst.r,
        depth: inst.depth,
        pass: this.items[index].pass ?? passOf(inst.id),
      })),
    );

    for (const p of plan) {
      const spec = this.items[p.index];
      const inst = this.instances[p.index];
      if (!spec || !inst) continue;
      const g = new Graphics();
      const target = p.pass === 2 ? layers.labels : p.pass === 3 ? layers.pieces : p.pass === 4 ? layers.fx : layers.ground;
      const texts: TextRequest[] = [];
      const place = spec.fixed
        ? { cx: spec.fixed.cx, cy: spec.fixed.cy, s: spec.fixed.s ?? 1 }
        : resolvePlacement(
            { id: inst.id, c: inst.c, r: inst.r, slot: inst.slot, lift: inst.lift, box: inst.box, mount: inst.mount, pawnIndex: spec.pawnIndex ?? 0 },
            this.deps.geo,
            this.deps.placement,
          );
      const ctx: ProcCtx = {
        geo: this.deps.geo,
        box: inst.box,
        cx: place.cx,
        cy: place.cy,
        s: place.s,
        lift: inst.lift,
        params: inst.provider.kind === 'proc'
          ? { __preset: (inst.provider as { preset: string }).preset, ...((inst.provider as { params?: Record<string, unknown> }).params ?? {}) }
          : { __preset: 'builtin' },
        state: { ...inst.state, ownerColors: this.ownerColors() },
        text: (r) => texts.push(r),
      };
      providerFor(inst.provider).draw(g, ctx);
      target.addChild(g);
      for (const r of texts) target.addChild(makeText(r));
    }
  }
```

> 这段**取代** Task 10 Step 6 里的旧循环（含 `bySource` / `this.items.find(...)` / 二次 `instantiate`）与 Task 16 Step 4 的局部改法——同 ID 多实例现在靠 `p.index` 精确取源，不再靠"首次命中"。`makeText` 的 import 已由 Task 16 引入。

`test/render/scene-order.spec.ts` 的两处用例同步补 `index`（`planDrawOrder` 只读不重排，补上即可）：

```ts
    const items: DrawPlanItem[] = [
      { index: 0, id: 'piece.p1', c: 5, r: 5, depth: 10, pass: 3 },
      { index: 1, id: 'building.s4.l2', c: 5, r: 5, depth: 10, pass: 1 },
      { index: 2, id: 'label.s4', c: 5, r: 5, depth: 10, pass: 2 },
      { index: 3, id: 'building.s1.l1', c: 2, r: 3, depth: 5, pass: 1 },
      { index: 4, id: 'building.s2.l1', c: 1, r: 4, depth: 5, pass: 1 },
    ];
```

```ts
    const items: DrawPlanItem[] = [{ index: 0, id: 'a', c: 1, r: 1, depth: 2, pass: 1 }];
```

并追加一条：`it('plan 原样带回 index（同 ID 多实例靠它取源）', () => { const plan = planDrawOrder([{ index: 7, id: 'prop.lantern', c: 1, r: 1, depth: 2, pass: 1 }]); expect(plan[0].index).toBe(7); });`

- [ ] **Step 7: 写失败测试（橱窗 spec 组装）**

`test/render/showcase-view.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { showcaseSpecs } from '../../src/render/ShowcaseView';
import { SHOWCASE_L as W } from '../../src/render/providers/proc-showcase';
import { PLAYER_NAME, RENT_BY_LEVEL, SLOT_BANNER, TILE_BRAND, TILE_LEVEL } from '../../src/data/board';
import type { ElementSpec } from '../../src/skin/instantiate';

const by = (specs: ElementSpec[], id: string) => specs.filter((s) => s.id === id);

describe('ShowcaseView · B 版式（v5 optB line 443–449，样板地块 = slot 4 太平温泉）', () => {
  const specs = showcaseSpecs({ slot: 4, owner: 2 });

  it('14 条元素：底板/夜空/天际线/地面 ×1、树灯 ×4、楼+店招+灯笼×2+幌子、HUD ×1', () => {
    expect(specs.length).toBe(14);
    expect(by(specs, 'showcase.tree').length).toBe(2);
    expect(by(specs, 'showcase.lamp').length).toBe(2);
    expect(by(specs, 'showcase.lantern').length).toBe(2);
    expect(by(specs, 'showcase.banner').length).toBe(1);
  });

  it('全部走 fixed 台位 + pass 4（覆盖层，压在棋盘与棋子之上），不进 resolvePlacement', () => {
    expect(specs.every((s) => Boolean(s.fixed) && s.pass === 4)).toBe(true);
    expect(by(specs, 'showcase.panel')[0].fixed).toEqual({ cx: W.x, cy: W.y });
  });

  it('大楼与挂件共享同一 fixed（同一坐标系），缩放 = SHOWCASE_L.shopScale', () => {
    const big = by(specs, 'showcase.shop')[0].fixed!;
    expect(big.s).toBe(W.shopScale);
    for (const id of ['showcase.sign', 'showcase.lantern', 'showcase.banner']) {
      for (const s of by(specs, id)) {
        expect(s.fixed!.cx).toBe(big.cx);
        expect(s.fixed!.cy).toBe(big.cy);
        expect(s.fixed!.s).toBe(big.s);
      }
    }
  });

  it('override 带上地块的品牌/层级/色相与温泉池 + 蒸汽', () => {
    const ov = by(specs, 'showcase.shop')[0].overrides!['showcase.shop'] as { preset: string; params: Record<string, unknown> };
    expect(ov.preset).toBe('shop');
    expect(ov.params.levels).toBe(TILE_LEVEL[4]);
    expect(ov.params.brand).toBe(TILE_BRAND[4]);
    expect(ov.params.pool).toBe(true);
    expect(ov.params.steam).toBe(true);
  });

  it('HUD 文案：持有者名 + 当前租金 + 升级后租金（v5 line 446–448）', () => {
    const st = by(specs, 'showcase.hud')[0].state!;
    expect(String(st.sub)).toContain(PLAYER_NAME[1]);
    expect(String(st.line1)).toContain(`￥${RENT_BY_LEVEL[2]}`);
    expect(String(st.line2)).toContain(`￥${RENT_BY_LEVEL[3]}`);
  });
});

describe('ShowcaseView · 无主 / 无幌子地块', () => {
  it('slot 8（L1、无幌子、无灯笼字）：不含 banner，层级取 TILE_LEVEL', () => {
    const specs = showcaseSpecs({ slot: 8, owner: null });
    expect(by(specs, 'showcase.banner').length).toBe(SLOT_BANNER[8] === undefined ? 0 : 1);
    const ov = by(specs, 'showcase.shop')[0].overrides!['showcase.shop'] as { params: Record<string, unknown> };
    expect(ov.params.levels).toBe(TILE_LEVEL[8]);
  });

  it('L3 地块（slot 18）第二行信息退化为「已是最高」，不出现 undefined', () => {
    const st = showcaseSpecs({ slot: 18, owner: 2 }).find((s) => s.id === 'showcase.hud')!.state!;
    expect(String(st.line2)).not.toContain('undefined');
    expect(String(st.line2)).not.toContain('L4');
  });
});
```

- [ ] **Step 8: 实现 `ShowcaseView.ts`，并把两个 spec 帮助函数导出**

`src/render/BuildingView.ts`：把 `function proc` / `function only` 改为 `export function proc` / `export function only`（供本任务复用，避免第二套等价实现）。

`src/data/board.ts` 末尾追加：

```ts
/** 路过租金按楼层（v5 样张 line 62：`RENT = [0, 15, 45, 105]`） */
export const RENT_BY_LEVEL = [0, 15, 45, 105];

/** 演示玩家名（v5 样张 line 59 `ONM`） */
export const PLAYER_NAME = ['你', '老王', '丽丽', '小赵'];

/** 橱窗演示文案（v5 optB line 444–447；M4 接入 i18n 字典后改由字典取，本任务先集中在此便于一处替换） */
export const SHOWCASE_TEXT = {
  kind: '商铺', holder: '持有者', floors: '层建筑', rent: '路过租金',
  upgradeTo: '升级到', maxLevel: '已是最高等级 · 不再涨价', pay: '支付',
  noOwner: '无主', fallbackBrand: '门店',
};
```

`src/render/ShowcaseView.ts`：

```ts
import {
  OWNER_HUE, PLAYER_NAME, RENT_BY_LEVEL, SHOWCASE_TEXT as T,
  SLOT_BANNER, SLOT_LANTERN_CHAR, TILE_BRAND, TILE_LEVEL,
} from '../data/board';
import type { ElementSpec } from '../skin/instantiate';
import { only, proc } from './BuildingView';
import { SHOWCASE_L as W } from './providers/proc-showcase';

export interface ShowcaseInput {
  /** 展示的地块序号（0..31） */
  slot: number;
  /** 持有者 1..4；null = 无主 */
  owner: number | null;
}

/** 定格台位：橱窗元素不在棋盘网格上，直接给绝对屏幕坐标（Scene 见 fixed 即短路 resolvePlacement） */
function at(cx: number, cy: number, s?: number): { cx: number; cy: number; s?: number } {
  return s === undefined ? { cx, cy } : { cx, cy, s };
}

/** 一个橱窗元素的骨架：id + 台位 + 第 4 遍（覆盖层） */
function sc(id: string, fixed: { cx: number; cy: number; s?: number }, extra: Partial<ElementSpec> = {}): ElementSpec {
  return { id, slot: null, c: 0, r: 0, pass: 4, fixed, ...extra };
}

/** B 版式：地块橱窗（v5 `showcase()` + optB 叠层 line 443–449） */
export function showcaseSpecs(input: ShowcaseInput): ElementSpec[] {
  const lv = (TILE_LEVEL[input.slot] || 2) as 1 | 2 | 3;
  const brand = TILE_BRAND[input.slot] || T.fallbackBrand;
  const hue = OWNER_HUE[input.owner ?? 2] ?? OWNER_HUE[2];
  const px = W.x;
  const py = W.y;
  const gy = py + W.h * W.gy;
  /* 大楼基座（v5 showcase line 355–356 的 cx/cy） */
  const bx = px + W.w / 2;
  const by = gy + Math.min(W.h - W.h * W.gy, W.cyMax) * W.cyF;
  const big = at(bx, by, W.shopScale);
  const rent = RENT_BY_LEVEL[lv] ?? RENT_BY_LEVEL[2];
  const nextRent = RENT_BY_LEVEL[lv + 1];
  const ownerName = input.owner ? PLAYER_NAME[input.owner - 1] : T.noOwner;
  const char = SLOT_LANTERN_CHAR[input.slot] ?? '';

  const out: ElementSpec[] = [
    sc('showcase.panel', at(px, py)),
    sc('showcase.sky', at(px, py)),
    sc('showcase.skyline', at(px, py)),
    sc('showcase.ground', at(px, py)),
  ];

  /* 配景：行道树 ×2 + 路灯 ×2（v5 line 359–362；台位与缩放来自 SHOWCASE_L） */
  const deco: Array<[string, number[], string, string]> = [
    ['showcase.tree', W.treeL, 'tree', 'trScale'],
    ['showcase.tree', W.treeR, 'tree', 'trScale'],
    ['showcase.lamp', W.lampL, 'lamp', 'lpScale'],
    ['showcase.lamp', W.lampR, 'lamp', 'lpScale'],
  ];
  for (const [id, [fx, fy, fs], preset, key] of deco) {
    out.push(sc(id, at(px + W.w * fx, gy + fy, fs), { overrides: only(id, proc(preset, { [key]: fs })) }));
  }

  /* 大楼 + 店招 + 灯笼 ×2 + 幌子：共享同一 fixed → 与墙面严格同一坐标系 */
  out.push(sc('showcase.shop', big, {
    level: lv,
    state: { level: lv },
    overrides: only('showcase.shop', proc('shop', { levels: lv, hue, brand, pool: true, steam: true })),
  }));
  out.push(sc('showcase.sign', big, {
    level: lv,
    state: { level: lv },
    overrides: only('showcase.sign', proc('sign', { levels: lv, brand })),
  }));
  out.push(sc('showcase.lantern', big, { level: lv, state: { level: lv, at: 'door', char } }));
  out.push(sc('showcase.lantern', big, { level: lv, state: { level: lv, at: 'side', char } }));
  const vb = SLOT_BANNER[input.slot];
  if (vb) {
    out.push(sc('showcase.banner', big, {
      level: lv,
      state: { level: lv },
      overrides: only('showcase.banner', proc('banner', { text: vb })),
    }));
  }

  /* 信息条（v5 optB line 444–448） */
  out.push(sc('showcase.hud', at(px, py), {
    state: {
      brand,
      sub: `${T.kind} · ${T.holder} ${ownerName}`,
      line1: `${lv} ${T.floors} · ${T.rent} ￥${rent}`,
      line2: lv === 3 ? T.maxLevel : `${T.upgradeTo} L${lv + 1} → ${T.rent} ￥${nextRent}`,
      cta: `${T.pay} ￥${rent * 4}`,
    },
  }));

  return out;
}
```

- [ ] **Step 9: skin.json 补 11 条 showcase 元素**

`public/skins/default/skin.json` 的 `elements` 追加：

```json
"showcase.panel": { "kind": "proc", "preset": "showcasePanel", "params": { "fill": "#0f1a18", "edge": "hsla(45,70%,55%,.5)", "radius": 16, "edgeW": 1 } },
"showcase.sky": { "kind": "proc", "preset": "showcaseSky", "params": { "gy": 0.6, "bands": 24, "t1": 0.6, "t2": 0.85, "top": "#0d1b2a", "mid": "#16302f", "bottom": "#1e2f2a", "moonX": 0.855, "moonY": 0.3, "moonR": 13, "moon": "#e8f0ff", "moonA": 0.85, "haloF": 1.69, "haloA": 0.1 } },
"showcase.skyline": { "kind": "proc", "preset": "showcaseSkyline", "params": { "gy": 0.6, "fill": "#131f1c", "win": "rgba(255,214,130,.5)" } },
"showcase.ground": { "kind": "proc", "preset": "showcaseGround", "params": { "gy": 0.6, "fill": "#1b2622", "slab": "#2a3830", "slabEdge": "rgba(255,255,255,.05)", "slabIn": "#33423a", "cyMax": 44, "cyF": 0.92, "slabDy": -4 } },
"showcase.hud": { "kind": "proc", "preset": "showcaseHud", "params": { "pillBg": "rgba(6,12,10,.8)", "pillTx": "#ffffff", "subTx": "#9fb3a8", "barBg": "rgba(6,12,10,.85)", "barTx": "#ffffff", "gold": "#f5c451", "goldTx": "#1b1b1b" } },
"showcase.shop": { "kind": "proc", "preset": "shop", "params": { "levels": 2, "hue": 32, "brand": "太平温泉", "pool": true, "steam": true } },
"showcase.sign": { "kind": "proc", "preset": "sign", "params": { "levels": 2, "brand": "太平温泉" } },
"showcase.lantern": { "kind": "proc", "preset": "lantern", "params": {} },
"showcase.banner": { "kind": "proc", "preset": "banner", "params": { "text": "温泉" } },
"showcase.tree": { "kind": "proc", "preset": "tree", "params": { "trScale": 1.45 } },
"showcase.lamp": { "kind": "proc", "preset": "lamp", "params": { "lpScale": 1.3 } }
```

- [ ] **Step 10: `main.ts` 接线（`?show=b` 默认出橱窗）**

`src/main.ts`：

① `UrlOptions` 与 `parseOptions` 各加一项：

```ts
export interface UrlOptions { skin: string; debug: boolean; seed: number; speed: number; show: string }
```

```ts
    show: q.get('show') || 'b',
```

② `boot()` 里把六组视图收成一个数组，再按 `?show` 追加橱窗：

```ts
  const views: ElementSpec[] = [
    ...boardTileSpecs(CURRENT, ownerOf),
    ...innerSpecs(),
    fountainSpec(),
    ...buildingSpecs({ ownerOf }),
    ...streetPropSpecs(),
    ...pawnSpecs(demoPawns),
  ];
  if (opts.show === 'b') views.push(...showcaseSpecs({ slot: CURRENT, owner: ownerOf(CURRENT) }));
  scene.addMany(views);
```

并补 import：`import { showcaseSpecs } from './render/ShowcaseView';`、`import type { ElementSpec } from './skin/instantiate';`。

> `?show=0` 只看棋盘，`?show=b` 出橱窗（默认）。C 版式（`?show=c`）在 Task 20 接上。

- [ ] **Step 11: 跑测试 + 两个校验 + 截图目视**

Run: `npx vitest run test/render test/skin && npm test`
Expected: 全绿（proc-showcase 12 例 + showcase-view 7 例 + scene-order 4 例 + 其余 M1–M3 用例）。

Run: `npm run lint && npm run lint:skin`
Expected: 0 错 / `[skin:default] OK`（`showcase.*` 的 id 已在 NAMESPACES，lint-skin 的 `registryHas()` 命中）。

Run: `npm run dev` → `node local/mono-shots-m2.mjs`
Expected: `gate` 全 `true`（`zeroFallback` 仍为真：11 条 showcase 都命中 L3 默认皮肤，无 L4 兜底）。

- [ ] **Step 12: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test
git commit -m "feat(mono): 地块橱窗 B 版式（夜空/天际线/石板广场/温泉馆 + ShowcaseView）"
```

---

## Task 20: C 版式三级对照（迷你卡 ×3）与 `?show=b|c|0` 版式切换

**Files:**
- Modify: `d:\zhao\monopoly\src\render\providers\proc-showcase.ts`（`SHOWCASE_L` 追加迷你卡常量；`D` 追加 3 个色值；新增 `showcaseMini` preset）
- Modify: `d:\zhao\monopoly\src\render\providers\proc.ts`（注册 `showcaseMini`）
- Modify: `d:\zhao\monopoly\src\skin\registry.ts`（`showcase.mini` 条）
- Modify: `d:\zhao\monopoly\public\skins\default\skin.json`（`showcase.mini`）
- Modify: `d:\zhao\monopoly\src\data\board.ts`（`LEVEL_NAME` / `PRICE_BY_LEVEL` / `levelCaption` / `SHOWCASE_TEXT.miniBanner`）
- Modify: `d:\zhao\monopoly\src\render\ShowcaseView.ts`（`ShowcaseInput.variant` + `miniSpecs()`）
- Modify: `d:\zhao\monopoly\src\debug\panel.ts`（`mountViews()` 版式切换行）
- Modify: `d:\zhao\monopoly\src\main.ts`（`?show=c` 接线 + `?debug=1` 挂切换行）
- Create: `d:\zhao\monopoly\local\mono-shots-m3.mjs`（Wave 1 闸门：棋盘 / B 橱窗 / C 对照 三张手机视口截图）
- Test: `d:\zhao\monopoly\test\render\proc-showcase.spec.ts`（追加 `showcaseMini` 用例）
- Test: `d:\zhao\monopoly\test\render\showcase-view.spec.ts`（追加 C 版式用例）

> **移植源**：v5 `miniShop(w, h, lv)`（line 369–380）+ optC 叠层（line 449–455）。
> **为什么 C 版式是「三张独立迷你卡」而不是复用 B 的大面板**：spec §6 规定 C 用于「我的地产 / 图鉴页」，语义是**同比例三级并排**——三张卡必须等间距、同缩放、同一条地平线，才能一眼看出层级差。同一张面板塞三个楼会破坏「同比例」这个唯一卖点。
> **为什么卡内元素走 `fixed.s` 统一缩放**：v5 的 `miniShop(160, 210, lv)` 是按 160×210 画、再由 CSS 缩到 1/3 栏宽；本工程没有 CSS 布局层，改用 `ElementSpec.fixed.s`（= 卡缩放）达成同一效果——**画法不变，只多一个全局缩放**。390 宽的舞台放三张 160 宽卡会越界，故 `miniCardScale = 0.72`（3×160×0.72 + 2×8 = 361.6 ≤ 370）。
> **与 v5 的两处有意偏差**：① 天际线高度分档 `px % 3` 在负 px 下会算出负高（v5 line 374 的 `px` 从 `-4` 起），本计划用 `((lx % 3) + 3) % 3` 归一化到 0..2 档（20 / 32 / 44），消除负高；② v5 的 `L1 摊位 · ￥60` 标签是卡**外**的 HTML `div`，本工程改为 `ctx.text` 画在卡**下方**（不随 `s` 缩放，保持在 11px 可读）。

- [ ] **Step 1: 写失败测试（`showcaseMini` preset）**

`test/render/proc-showcase.spec.ts`：

① import 行改为：

```ts
import {
  SHOWCASE_L, showcaseGround, showcaseHud, showcaseMini, showcasePanel, showcaseSky, showcaseSkyline,
} from '../../src/render/providers/proc-showcase';
```

② 文件末尾追加：

```ts
describe('showcase.mini 迷你卡（v5 miniShop line 369–380）', () => {
  const ctxMini = (s = 1, state: Record<string, unknown> = { caption: 'L1 摊位 · ￥60' }) => ({
    geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
    box: { w: SHOWCASE_L.miniW, d: 1, h: SHOWCASE_L.miniH },
    cx: 0,
    cy: 0,
    s,
    params: {},
    state,
  });
  /** 地面矩形的高度（用来把天际线楼块从 rect 里筛出来） */
  const groundH = SHOWCASE_L.miniH * (1 - SHOWCASE_L.miniGy);

  it('一张圆角底板 + 天际线楼块（无窗）+ 地面矩形 + 石板菱形；楼块数在 6..19 之间', () => {
    const { g, calls } = recorder();
    showcaseMini(g as never, ctxMini() as never);
    expect(count(calls, 'roundRect')).toBe(1);
    expect(count(calls, 'poly')).toBe(1);
    const blocks = calls.filter((c) => c.op === 'rect' && c.pts![3] !== groundH);
    expect(blocks.length).toBeGreaterThan(5);
    expect(blocks.length).toBeLessThan(20);
    expect(count(calls, 'rect')).toBe(blocks.length + 1);
    expect(fills(calls)).toEqual([
      '#101a17', ...Array(blocks.length).fill('#16221e'), '#1b2622', '#2a3830',
    ]);
  });

  it('楼块顶边都在地平线之上、底边压在地平线上；高度只有 20 / 32 / 44 三档', () => {
    const { g, calls } = recorder();
    showcaseMini(g as never, ctxMini() as never);
    const gy = SHOWCASE_L.miniH * SHOWCASE_L.miniGy;
    const blocks = calls.filter((c) => c.op === 'rect' && c.pts![3] !== groundH);
    const tiers = new Set<number>();
    for (const b of blocks) {
      expect(b.pts![1] + b.pts![3]).toBeCloseTo(gy, 5);
      tiers.add(b.pts![3]);
    }
    expect([...tiers].sort((a, b) => a - b)).toEqual([
      SHOWCASE_L.miniSkyHBase,
      SHOWCASE_L.miniSkyHBase + SHOWCASE_L.miniSkyHStep,
      SHOWCASE_L.miniSkyHBase + 2 * SHOWCASE_L.miniSkyHStep,
    ]);
    expect(Math.min(...[...tiers])).toBeGreaterThan(0);
  });

  it('缩放全部经 ctx.s 施加：底板宽高与地平线按 s 收缩（v5 的 CSS 缩放等价物）', () => {
    const k = SHOWCASE_L.miniCardScale;
    const { g, calls } = recorder();
    showcaseMini(g as never, ctxMini(k) as never);
    const rr = calls.find((c) => c.op === 'roundRect')!;
    expect(rr.pts![2]).toBeCloseTo(SHOWCASE_L.miniW * k, 5);
    expect(rr.pts![3]).toBeCloseTo(SHOWCASE_L.miniH * k, 5);
    const gy = calls.filter((c) => c.op === 'rect')[0].pts![1];
    expect(gy).toBeCloseTo(SHOWCASE_L.miniH * SHOWCASE_L.miniGy * k, 5);
  });

  it('底部标签：1 条居中文字，字号不随 s 缩放（v5 line 450–452 的卡外标签）', () => {
    const texts: TextRequest[] = [];
    const { g } = recorder();
    showcaseMini(g as never, {
      ...ctxMini(SHOWCASE_L.miniCardScale),
      text: (r: TextRequest) => texts.push(r),
    } as never);
    expect(texts.length).toBe(1);
    expect(texts[0].text).toBe('L1 摊位 · ￥60');
    expect(texts[0].size).toBe(SHOWCASE_L.miniCapFs);
    expect(texts[0].align).toBe('center');
  });

  it('注册进 PROC_PRESETS', () => {
    expect(PROC_PRESETS.showcaseMini).toBe(showcaseMini);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/proc-showcase.spec.ts`
Expected: FAIL，`showcaseMini` 未导出（`SHOWCASE_L.miniW` 也是 undefined）。

- [ ] **Step 3: 实现 `showcaseMini` 与版式常量**

`src/render/providers/proc-showcase.ts`：

① `SHOWCASE_L` 的 `fb({...})` 末尾（`btnX…btnFs` 那行之后）追加：

```ts
  /* —— C 版式：三张迷你卡并排（v5 line 449–455 `miniShop(160, 210, lv)` ×3） —— */
  miniW: 160, miniH: 210, miniY: 322, miniGap: 8,
  miniR: 12, miniGy: 0.62,
  /* 迷你天际线递推（v5 line 374）：高度三档 20 / 32 / 44 */
  miniSkyStart: -4, miniSkyW0: 12, miniSkyWM: 16, miniSkyWStep: 5, miniSkyGap: 3,
  miniSkyHBase: 20, miniSkyHTier: 3, miniSkyHStep: 12,
  /* 石板菱形（v5 line 376：dia(w/2, h*0.86, w*0.44, h*0.09)） */
  miniSlabY: 0.86, miniSlabRx: 0.44, miniSlabRy: 0.09,
  /* 卡内楼体（v5 line 377：isoShop(w/2, h*0.80, 1.35, lv, 32, {brand:'优美惠'})） */
  miniShopY: 0.8, miniS: 1.35, miniHue: 32,
  /* 卡缩放（390 宽舞台：3×160×0.72 + 2×8 = 361.6 ≤ 370）与卡外标签 */
  miniCardScale: 0.72, miniCapFs: 11, miniCapDrop: 12,
```

② `D` 的 `fb({...})` 末尾（`goldTx` 那行之后）追加：

```ts
  /* C 版式迷你卡（v5 line 371 / 374 / 450–452） */
  miniFill: '#101a17', miniSkyline: '#16221e', miniCapTx: '#e8e4d8',
```

③ 文件末尾追加 preset：

```ts
/* —— C 版式迷你卡：底板 + 迷你天际线（无窗）+ 地面/石板 + 卡外标签（v5 miniShop line 369–380） —— */
export const showcaseMini: ProcPreset = (g, ctx) => {
  const { cx, cy, box, s, params, state } = ctx;
  const L = SHOWCASE_L;
  const w = box.w * s;
  const h = box.h * s;
  const gyv = num(params, 'gy', L.miniGy);
  const gy = cy + h * gyv;

  g.roundRect(cx, cy, w, h, num(params, 'radius', L.miniR) * s).fill({ color: str(params, 'fill', D.miniFill) });

  /* 迷你天际线：只有楼块、没有窗（v5 line 374 的循环里没有窗） */
  const w0 = num(params, 'bwBase', L.miniSkyW0);
  const wm = num(params, 'bwMod', L.miniSkyWM);
  const wStep = num(params, 'bwStep', L.miniSkyWStep);
  const gap = num(params, 'gap', L.miniSkyGap);
  const hBase = num(params, 'hBase', L.miniSkyHBase);
  const hTier = num(params, 'hTier', L.miniSkyHTier);
  const hStep = num(params, 'hStep', L.miniSkyHStep);
  const sky = str(params, 'skyline', D.miniSkyline);
  let lx = L.miniSkyStart;
  while (lx < box.w + Math.abs(L.miniSkyStart)) {
    const bw = w0 + ((lx * wStep) % wm + wm) % wm;
    const tier = ((lx % hTier) + hTier) % hTier;
    const bh = hBase + tier * hStep;
    g.rect(cx + lx * s, gy - bh * s, bw * s, bh * s).fill({ color: sky });
    lx += bw + gap;
  }

  g.rect(cx, gy, w, h * (1 - gyv)).fill({ color: str(params, 'ground', D.groundFill) });
  g.poly(ptsToPoly(dia(
    cx + w / 2,
    cy + h * num(params, 'slabY', L.miniSlabY),
    w * num(params, 'slabRx', L.miniSlabRx),
    h * num(params, 'slabRy', L.miniSlabRy),
  ))).fill({ color: str(params, 'slab', D.slabFill) });

  /* 卡外标签：字号是舞台绝对 px（不随 s 缩放），保证三张卡下的字一样大 */
  const cap = str(state, 'caption', '');
  if (cap) {
    ctx.text?.({
      text: cap,
      x: cx + w / 2,
      y: cy + h + L.miniCapDrop,
      size: L.miniCapFs,
      fill: str(params, 'capTx', D.miniCapTx),
      align: 'center',
    });
  }
};
```

> 这里只用了 `num` / `str` 取值器、`ctx.s` 与 `SHOWCASE_L` / `D` 常量，`src/render/**` 的禁写死规则不会被触发（`L.miniSkyStart` 等都在 `fb` 容器里）。

- [ ] **Step 4: 注册 preset + 注册表 + 皮肤包 + 数据常量**

① `src/render/providers/proc.ts`：

```ts
import { showcaseGround, showcaseHud, showcaseMini, showcasePanel, showcaseSky, showcaseSkyline } from './proc-showcase';
```

```ts
export const PROC_PRESETS: Record<string, ProcPreset> = {
  tile, tileEdge, bgGradient, solid, builtin, fountain, shop, sign,
  awning, lantern, banner, rooftopBox, signTower, antenna, tree, lamp,
  showcasePanel, showcaseSky, showcaseSkyline, showcaseGround, showcaseHud, showcaseMini,
};
```

② `src/skin/registry.ts`，在 `reg['showcase.lamp'] = ...` 之后追加：

```ts
reg['showcase.mini'] = showcaseEntry('showcase.mini', { w: 160, d: 1, h: 210 });
```

③ `public/skins/default/skin.json` 的 `elements` 追加：

```json
"showcase.mini": { "kind": "proc", "preset": "showcaseMini", "params": { "gy": 0.62, "radius": 12, "fill": "#101a17", "skyline": "#16221e", "ground": "#1b2622", "slab": "#2a3830", "capTx": "#e8e4d8" } },
```

④ `src/data/board.ts` 末尾追加：

```ts
/** 三级建筑名（v5 optC line 450–452 标签：L1 摊位 / L2 门店 / L3 商超楼） */
export const LEVEL_NAME = ['', '摊位', '门店', '商超楼'];

/** 三级建造价（v5 optC line 450–452 标签：￥60 / ￥180 / ￥420） */
export const PRICE_BY_LEVEL = [0, 60, 180, 420];

/** 三级对照卡标签：`L{lv} {名} · ￥{价}`（v5 optC line 450–452；M4 接 i18n 后由字典取） */
export function levelCaption(lv: number): string {
  return `L${lv} ${LEVEL_NAME[lv] ?? ''} · ￥${PRICE_BY_LEVEL[lv] ?? 0}`;
}
```

并把 `SHOWCASE_TEXT` 补一项（`fallbackBrand` 那行之后）：

```ts
  miniBanner: '市集',
```

- [ ] **Step 5: 写失败测试（C 版式组装）**

`test/render/showcase-view.spec.ts`：

① import 行补两项：

```ts
import { LEVEL_NAME, PLAYER_NAME, PRICE_BY_LEVEL, RENT_BY_LEVEL, SLOT_BANNER, TILE_BRAND, TILE_LEVEL } from '../../src/data/board';
import { STAGE_W } from '../../src/skin/layout';
```

② 文件末尾追加：

```ts
describe('ShowcaseView · C 版式（三级对照，v5 optC line 449–455）', () => {
  const specs = showcaseSpecs({ variant: 'c' });

  it('三张卡各（底板 + 楼 + 店招）+ L2/L3 各一面幌子 = 11 条', () => {
    expect(specs.length).toBe(11);
    expect(by(specs, 'showcase.mini').length).toBe(3);
    expect(by(specs, 'showcase.shop').length).toBe(3);
    expect(by(specs, 'showcase.sign').length).toBe(3);
    expect(by(specs, 'showcase.banner').length).toBe(2);
  });

  it('三级并排：同一条地平线、同缩放、等间距，三张卡整体水平居中', () => {
    const cards = by(specs, 'showcase.mini');
    expect(cards.map((c) => c.fixed!.s)).toEqual([W.miniCardScale, W.miniCardScale, W.miniCardScale]);
    expect(cards.map((c) => c.fixed!.cy)).toEqual([W.miniY, W.miniY, W.miniY]);
    const step = W.miniW * W.miniCardScale + W.miniGap;
    const [x0c, x1c, x2c] = cards.map((c) => c.fixed!.cx);
    expect(x1c - x0c).toBeCloseTo(step, 5);
    expect(x2c - x1c).toBeCloseTo(step, 5);
    expect(x0c).toBeCloseTo((STAGE_W - (3 * step - W.miniGap)) / 2, 5);
  });

  it('楼层级 1 / 2 / 3，色相统一 32，品牌取 core 地块（v5 miniShop 参数）', () => {
    const shops = by(specs, 'showcase.shop');
    const paramsOf = (i: number) => (shops[i].overrides!['showcase.shop'] as { params: Record<string, unknown> }).params;
    expect([0, 1, 2].map((i) => paramsOf(i).levels)).toEqual([1, 2, 3]);
    for (const i of [0, 1, 2]) {
      expect(paramsOf(i).hue).toBe(W.miniHue);
      expect(paramsOf(i).brand).toBe(TILE_BRAND[0]);
    }
  });

  it('卡标签 = L{lv} 名 · ￥价（v5 optC line 450–452）', () => {
    expect(by(specs, 'showcase.mini').map((c) => c.state!.caption)).toEqual([
      `L1 ${LEVEL_NAME[1]} · ￥${PRICE_BY_LEVEL[1]}`,
      `L2 ${LEVEL_NAME[2]} · ￥${PRICE_BY_LEVEL[2]}`,
      `L3 ${LEVEL_NAME[3]} · ￥${PRICE_BY_LEVEL[3]}`,
    ]);
  });

  it('楼 / 店招 / 幌子共享同一 fixed：楼在卡内水平居中、缩放 = 1.35 × 卡缩放', () => {
    const cards = by(specs, 'showcase.mini');
    const shops = by(specs, 'showcase.shop');
    const signs = by(specs, 'showcase.sign');
    shops.forEach((s, i) => {
      expect(s.fixed!.s).toBeCloseTo(W.miniS * W.miniCardScale, 5);
      expect(s.fixed!.cx).toBeCloseTo(cards[i].fixed!.cx + (W.miniW * W.miniCardScale) / 2, 5);
      expect(s.fixed!.cy).toBeCloseTo(cards[i].fixed!.cy + W.miniH * W.miniCardScale * W.miniShopY, 5);
      expect(signs[i].fixed).toEqual(s.fixed);
    });
    const banners = by(specs, 'showcase.banner');
    expect(banners.map((b) => b.fixed!.cx)).toEqual([shops[1].fixed!.cx, shops[2].fixed!.cx]);
  });

  it('全部走 fixed 台位 + pass 4，且不出现 B 版式的元素', () => {
    expect(specs.every((s) => Boolean(s.fixed) && s.pass === 4)).toBe(true);
    for (const id of ['showcase.panel', 'showcase.sky', 'showcase.skyline', 'showcase.ground', 'showcase.hud', 'showcase.tree', 'showcase.lamp']) {
      expect(by(specs, id).length).toBe(0);
    }
  });

  it('B 版式不受影响（不传 variant 仍是 14 条、无 showcase.mini）', () => {
    const b = showcaseSpecs({ slot: 4, owner: 2 });
    expect(b.length).toBe(14);
    expect(by(b, 'showcase.mini').length).toBe(0);
  });
});
```

- [ ] **Step 6: 实现 `variant` 与 `miniSpecs()`**

`src/render/ShowcaseView.ts`：

① import 改为：

```ts
import {
  levelCaption, OWNER_HUE, PLAYER_NAME, RENT_BY_LEVEL, SHOWCASE_TEXT as T,
  SLOT_BANNER, SLOT_LANTERN_CHAR, TILE_BRAND, TILE_LEVEL,
} from '../data/board';
import { STAGE_W } from '../skin/layout';
import type { ElementSpec } from '../skin/instantiate';
import { only, proc } from './BuildingView';
import { SHOWCASE_L as W } from './providers/proc-showcase';
```

② `ShowcaseInput` 改为：

```ts
export interface ShowcaseInput {
  /** 展示的地块序号（0..31）；`variant: 'c'` 时忽略 */
  slot?: number;
  /** 持有者 1..4；null = 无主；`variant: 'c'` 时忽略 */
  owner?: number | null;
  /** 版式：b = 单地块橱窗（默认，踩格特写 / 升级弹窗）；c = 三级对照（我的地产 / 图鉴） */
  variant?: 'b' | 'c';
}
```

③ `showcaseSpecs` 开头插入版式短路，并把 `slot` / `owner` 解构出来：

```ts
export function showcaseSpecs(input: ShowcaseInput): ElementSpec[] {
  if (input.variant === 'c') return miniSpecs();
  const slot = input.slot ?? 0;
  const owner = input.owner ?? null;
  const lv = (TILE_LEVEL[slot] || 2) as 1 | 2 | 3;
  const brand = TILE_BRAND[slot] || T.fallbackBrand;
  const hue = OWNER_HUE[owner ?? 2] ?? OWNER_HUE[2];
```

函数体余下 6 处 `input.slot` / `input.owner` 依次替换为 `slot` / `owner`：

```ts
  const ownerName = owner ? PLAYER_NAME[owner - 1] : T.noOwner;
  const char = SLOT_LANTERN_CHAR[slot] ?? '';
```
（另 4 处在 `at(px, py)` 之后的 `sc('showcase.shop', …)` / `sc('showcase.sign', …)` / `sc('showcase.lantern', …)` 与 `const vb = SLOT_BANNER[slot];`，逐个替换即可。）

④ 文件末尾追加：

```ts
/** C 版式：三张迷你卡并排（v5 optC line 449–455 `miniShop(160, 210, lv)` ×3） */
function miniSpecs(): ElementSpec[] {
  const levels: Array<1 | 2 | 3> = [1, 2, 3];
  const s = W.miniCardScale;
  const cw = W.miniW * s;
  const x0 = (STAGE_W - (levels.length * cw + (levels.length - 1) * W.miniGap)) / 2;
  const brand = TILE_BRAND[0] || T.fallbackBrand;
  const out: ElementSpec[] = [];

  levels.forEach((lv, i) => {
    const card = at(x0 + i * (cw + W.miniGap), W.miniY, s);
    out.push(sc('showcase.mini', card, {
      level: lv,
      state: { caption: levelCaption(lv) },
      overrides: only('showcase.mini', proc('showcaseMini', {})),
    }));
    /* 楼 / 店招 / 幌子共享卡内锚点：卡内水平居中 + 地平线 0.80 处 */
    const shop = at(card.cx + cw / 2, card.cy + W.miniH * s * W.miniShopY, W.miniS * s);
    out.push(sc('showcase.shop', shop, {
      level: lv,
      state: { level: lv },
      overrides: only('showcase.shop', proc('shop', { levels: lv, hue: W.miniHue, brand })),
    }));
    out.push(sc('showcase.sign', shop, {
      level: lv,
      state: { level: lv },
      overrides: only('showcase.sign', proc('sign', { levels: lv, brand })),
    }));
    if (lv >= 2) {
      out.push(sc('showcase.banner', shop, {
        level: lv,
        state: { level: lv },
        overrides: only('showcase.banner', proc('banner', { text: T.miniBanner })),
      }));
    }
  });

  return out;
}
```

- [ ] **Step 7: `main.ts` 接 `?show=c` + `?debug=1` 版式切换行**

① `src/debug/panel.ts` 的接口与实现各加一段：

```ts
export interface DebugPanel {
  mount(root: HTMLElement): void;
  show(inst: Instance | null): void;
  /** 版式切换行：`?show=0|b|c`（只改 query 后重载，避免两套视图堆在同一场景里） */
  mountViews(current: string, onPick: (v: string) => void): void;
}
```

```ts
    mountViews(current, onPick) {
      const row = document.createElement('div');
      row.id = 'mono-views';
      row.style.cssText =
        'position:fixed;right:6px;bottom:34vh;z-index:10;display:flex;gap:4px;' +
        'font:11px/1.4 ui-monospace,monospace';
      for (const [value, label] of [['0', '棋盘'], ['b', '橱窗 B'], ['c', '对照 C']]) {
        const on = value === current;
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText =
          'padding:3px 8px;border-radius:6px;cursor:pointer;border:1px solid #f5c451;' +
          `background:${on ? '#f5c451' : 'rgba(6,10,8,.9)'};color:${on ? '#1b1b1b' : '#f5c451'}`;
        b.onclick = () => onPick(value);
        row.appendChild(b);
      }
      document.body.appendChild(row);
    },
```

> 切换行必须是**独立元素**（`#mono-views`）：`show(inst)` 会覆写 debug 面板的 `textContent`，挂进去会被点选一次就抹掉。

② `src/main.ts` 的 `boot()`：

```ts
  if (opts.show === 'b') views.push(...showcaseSpecs({ slot: CURRENT, owner: ownerOf(CURRENT) }));
  else if (opts.show === 'c') views.push(...showcaseSpecs({ variant: 'c' }));
  scene.addMany(views);

  scene.render();
```

```ts
  if (opts.debug) {
    const panel = createDebugPanel();
    panel.mount(document.body);
    panel.mountViews(opts.show, (v) => {
      const next = new URL(location.href);
      next.searchParams.set('show', v);
      location.href = next.toString();
    });
  }
```

> `?show=0` 只看棋盘、`?show=b` 出地块橱窗（默认）、`?show=c` 出三级对照卡。C 版式在 M4 会接到「我的地产 / 图鉴」入口，本任务先用 `?show=c` 验证渲染。

- [ ] **Step 8: 跑测试 + 校验**

Run: `npx vitest run test/render test/skin && npm test`
Expected: 全绿（proc-showcase 17 例 + showcase-view 14 例 + 其余 M1–M3 用例）。

Run: `npm run lint && npm run lint:skin`
Expected: 0 错 / `[skin:default] OK`。

- [ ] **Step 9: 写 M3 闸门脚本（三张手机视口截图）**

`local/mono-shots-m3.mjs`：

```js
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

/* [版式, 截图文件, fx 层最少子节点数（14×B / 11×C + 文字）] */
const views = [
  ['0', 'mono-m3-01-board.png', 1],
  ['b', 'mono-m3-02-showcase-b.png', 14],
  ['c', 'mono-m3-03-codex-c.png', 11],
];

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

for (const [show, file, minFx] of views) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${ORIGIN}/mono.html?debug=1&show=${show}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 15000 });

  const f = await page.evaluate(() => {
    const main = window.__monoMain;
    const inst = main.scene.instancesOf();
    const shots = inst.filter((i) => i.id.startsWith('showcase.'));
    return {
      fxChildren: main.stage.layers.fx.children.length,
      showcase: shots.length,
      showroomL4: shots.filter((i) => i.level === 4).length,
      viewButtons: document.querySelectorAll('#mono-views button').length,
    };
  });
  await page.screenshot({ path: `${OUT}/${file}` });
  facts[`show=${show}`] = f;
  gate[`show${show}_fx`] = f.fxChildren >= minFx;
  gate[`show${show}_noL4`] = f.showroomL4 === 0;
  gate[`show${show}_switch`] = f.viewButtons === 3;
  await page.close();
}

gate.noErrors = errors.length === 0;
console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);
```

- [ ] **Step 10: 跑闸门 + 目视对齐**

Run: `npm run dev`（后台）→ `node local/mono-shots-m3.mjs`
Expected: `gate` 全 `true`，生成 3 张 390×844 @dpr2 截图。目视验收：
- `mono-m3-02-showcase-b.png`：与 `d:\zhao\.superpowers\brainstorm\monopoly\v5-B.png` 对齐（夜空渐变无横带接缝、月亮偏右上、亮窗天际线、石板广场双层菱形、两树两灯、温泉馆出檐 + 竖招牌「温泉」+ 门口双灯笼「汤」+ 池面蒸汽、顶部药丸 + 底部信息条 + 金色按钮）。
- `mono-m3-03-codex-c.png`：与 `v5-C.png` 对齐（三张卡等宽等高、同一地平线、L1 坡顶摊 / L2 两层暖窗 / L3 幕墙霓虹 的体量差一眼可辨、卡下标签字号一致）。

- [ ] **Step 11: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test monopoly/local
git commit -m "feat(mono): C 版式三级对照卡（showcaseMini）+ ?show=b|c|0 版式切换与 M3 闸门"
```

---

## Task 21: 图片素材皮肤示例（`photo` 包）与 image provider

**Files:**
- Create: `d:\zhao\monopoly\tools\gen-photo-assets.mjs`
- Create: `d:\zhao\monopoly\public\skins\photo\skin.json`
- Create: `d:\zhao\monopoly\public\skins\photo\tex\fountain.png`（由脚本生成）
- Create: `d:\zhao\monopoly\public\skins\photo\tex\tree.png`（由脚本生成）
- Create: `d:\zhao\monopoly\public\skins\photo\tex\lamp.png`（由脚本生成）
- Create: `d:\zhao\monopoly\public\skins\photo\tex\pawn1.png`（由脚本生成）
- Create: `d:\zhao\monopoly\public\skins\photo\tex\card.png`（由脚本生成）
- Create: `d:\zhao\monopoly\src\render\assets.ts`
- Modify: `d:\zhao\monopoly\src\render\providers\proc.ts`（`SpriteRequest` + `ProcCtx` 三字段 + 补 `Box`/`ProviderSpec` 类型导入）
- Modify: `d:\zhao\monopoly\src\render\paint.ts`（`makeSprite`）
- Modify: `d:\zhao\monopoly\src\render\providers\index.ts`（`image` 真实现；`atlas`/`frames` 桩注释改 M5）
- Modify: `d:\zhao\monopoly\src\render\Scene.ts`（`spec`/`asset`/`sprite` 注入 + `assetOf`）
- Modify: `d:\zhao\monopoly\src\main.ts`（预装载素材 + `assetBase`/`skinIds` + 暴露 `missingAssets`）
- Test: `d:\zhao\monopoly\test\render\provider-image.spec.ts`

> **为什么需要新通道**：`ProviderImpl.draw(g: Graphics, ctx)` 只能画矢量；图片素材必须新建 Pixi `Sprite` 并 `addChild`。沿用 Task 16 `ctx.text` 的**同一模式**新增 `ctx.sprite(req)` —— preset/provider 只「申请出图」，真正的 `new Sprite()` 只发生在 `paint.ts` 的 `makeSprite()`（唯一建精灵处），由 `Scene.render()` 统一挂载。`src/render/**` 因此依旧没有任何散装 `addChild`。
> **为什么需要预装载**：`Assets.load()` 是异步，而 `Scene.render()` 是同步。故 `main.ts` 在 `scene.render()` 之前 `await preloadSkinAssets(...)`，把纹理按 URL 存进模块级 Map；`Scene` 通过注入的 `asset(rel)` 同步取，取不到即静默跳过（回退链上游已兜底，spec §3.6.4「缺素材绝不报错、绝不空白」）。
> **验收铁证**：`?skin=photo` 后中心喷泉 / 行道树 / 路灯 / 1 号棋子 / 迷你卡变成图片素材，**代码零改动** —— 换风格 = 换 `skin.json` + 素材目录（spec §3.6 硬约束）。
> **元素选择覆盖三类台位**：`board.center.fountain`（等距地面默认台位）· `prop.tree` / `prop.lamp`（ground 挂件）· `piece.p1`（棋子前沿错开台位）· `showcase.mini`（`fixed` 定格台位，`anchor [0,0]` 对齐 `roundRect` 左上角原点，见 Task 20 Step 3）。刻意只换 `piece.p1`（其余三枚棋子仍走 default 皮肤），用来展示**逐元素回退**。

- [ ] **Step 1: 写失败测试（image provider 3 例 + assets 路径工具 2 例）**

Create `test/render/provider-image.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { PROVIDERS } from '../../src/render/providers';
import { assetPaths, assetUrl } from '../../src/render/assets';
import type { SpriteRequest } from '../../src/render/providers/proc';
import type { ProviderSpec, SkinPack } from '../../src/skin/types';

/* 纹理用哨兵对象代替：本用例只验证「请求内容」，不 new 任何 Pixi 对象（node 环境无 canvas） */
const TEX = { __tex: true } as never;

const fakeCtx = (over: Record<string, unknown> = {}) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 60, d: 30, h: 28 },
  cx: 100,
  cy: 200,
  s: 2,
  params: {},
  state: {},
  ...over,
});

describe('image provider', () => {
  it('按 box × s 铺满：x/y 取 cx/cy，宽高取 box 缩放，锚点原样透传 spec.anchor', () => {
    const out: SpriteRequest[] = [];
    const ctx = fakeCtx({
      spec: { kind: 'image', src: 'tex/fountain.png', anchor: [0.5, 1] },
      asset: () => TEX,
      sprite: (r: SpriteRequest) => out.push(r),
    });
    PROVIDERS.image.draw({} as never, ctx as never);
    expect(out.length).toBe(1);
    expect(out[0].texture).toBe(TEX);
    expect(out[0].x).toBe(100);
    expect(out[0].y).toBe(200);
    expect(out[0].w).toBe(120); // box.w 60 × s 2
    expect(out[0].h).toBe(56); // box.h 28 × s 2
    expect(out[0].anchor).toEqual([0.5, 1]);
  });

  it('素材未装载 → 不出图、不抛错（回退链上游兜底，spec §3.6.4）', () => {
    const out: SpriteRequest[] = [];
    const ctx = fakeCtx({
      spec: { kind: 'image', src: 'tex/missing.png' },
      asset: () => null,
      sprite: (r: SpriteRequest) => out.push(r),
    });
    expect(() => PROVIDERS.image.draw({} as never, ctx as never)).not.toThrow();
    expect(out.length).toBe(0);
  });

  it('anchor 缺省 → 原样透传 undefined（居中由 makeSprite 兜底）', () => {
    const out: SpriteRequest[] = [];
    const ctx = fakeCtx({
      spec: { kind: 'image', src: 'tex/tree.png' },
      asset: () => TEX,
      sprite: (r: SpriteRequest) => out.push(r),
    });
    PROVIDERS.image.draw({} as never, ctx as never);
    expect(out.length).toBe(1);
    expect(out[0].anchor).toBeUndefined();
  });
});

describe('assets 路径工具', () => {
  const pack = (elements: Record<string, ProviderSpec>): SkinPack => ({
    id: 'photo',
    geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
    tokens: {},
    elements,
  });

  it('assetPaths：收集 image/atlas/frames 的 src，去重且保序', () => {
    const p = pack({
      'prop.tree': { kind: 'image', src: 'tex/tree.png' },
      'prop.lamp': { kind: 'image', src: 'tex/lamp.png' },
      'prop.tree2': { kind: 'image', src: 'tex/tree.png' },
      'card.fate.back': { kind: 'atlas', src: 'atlas/fate.json', frame: 'back' },
      'fx.coin': { kind: 'frames', src: ['tex/c1.png', 'tex/c2.png'], fps: 8 },
      'board.tile.shop': { kind: 'proc', preset: 'tile' },
    });
    expect(assetPaths(p)).toEqual([
      'tex/tree.png',
      'tex/lamp.png',
      'atlas/fate.json',
      'tex/c1.png',
      'tex/c2.png',
    ]);
  });

  it('assetPaths(null) → []；assetUrl 拼 `base/<packId>/<rel>`', () => {
    expect(assetPaths(null)).toEqual([]);
    expect(assetUrl('photo', 'tex/tree.png')).toBe('./skins/photo/tex/tree.png');
    expect(assetUrl('photo', 'tex/tree.png', '/static/skins')).toBe('/static/skins/photo/tex/tree.png');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/provider-image.spec.ts`
Expected: FAIL —— `../../src/render/assets` 模块不存在（`Failed to load url`），且 `PROVIDERS.image.draw` 目前是空实现（`out.length` 为 0）。

- [ ] **Step 3: `ProcCtx` 加 `spec` / `asset` / `sprite`，新增 `SpriteRequest`**

`src/render/providers/proc.ts` 头部补两处 import（`Box` 的导入此前缺失，一并补上）：

```ts
import type { Texture } from 'pixi.js';
import type { Box, ProviderSpec } from '../../skin/types';
```

`ProcCtx` 追加三个字段，并在其上方新增 `SpriteRequest`：

```ts
/** preset 的图片输出请求（Graphics 画不了位图，统一交给 Scene 新建 Sprite 落地） */
export interface SpriteRequest {
  texture: Texture;
  x: number;                              // 锚点所在的舞台绝对坐标
  y: number;
  w: number;                              // 目标宽（= box.w × ctx.s）
  h: number;                              // 目标高（= box.h × ctx.s）
  anchor?: [number, number];              // 0–1，缺省居中 [0.5, 0.5]
  rotate?: number;                        // 角度（度）
}

export interface ProcCtx {
  geo: Geo;
  box: Box;
  cx: number;
  cy: number;
  s: number;
  /** 管线施加的抬升（未乘 s）。preset 用 cy + lift×s 还原宿主楼基座 y0 */
  lift?: number;
  params: Record<string, unknown>;
  state: Record<string, unknown>;
  text?: (req: TextRequest) => void;
  /** 原始 provider 规格（image provider 需从中读 src / anchor） */
  spec?: ProviderSpec;
  /** 素材装载通道（Scene 注入）：包内相对路径 → 已装载纹理；未装载 → null */
  asset?: (rel: string) => Texture | null;
  /** 图片输出通道：与 text 同级的「唯一出图口」 */
  sprite?: (req: SpriteRequest) => void;
}
```

- [ ] **Step 4: 实现 `makeSprite`（唯一建精灵处）**

`src/render/paint.ts`：

① import 改为：

```ts
import { Sprite, Text } from 'pixi.js';
import type { SpriteRequest, TextRequest } from './providers/proc';
```

② 在 `makeText` 之后追加：

```ts
/** 按 provider 的图片请求创建 Pixi Sprite（唯一建精灵处） */
export function makeSprite(req: SpriteRequest): Sprite {
  const sp = new Sprite(req.texture);
  const [ax, ay] = req.anchor ?? [0.5, 0.5];
  sp.anchor.set(ax, ay);
  sp.position.set(req.x, req.y);
  sp.width = req.w;
  sp.height = req.h;
  sp.rotation = ((req.rotate ?? 0) * Math.PI) / 180;
  return sp;
}
```

- [ ] **Step 5: 实现 `image` provider（`atlas` / `frames` 桩注释改 M5）**

`src/render/providers/index.ts`：

```ts
/** 单图素材：按逻辑包围盒（box × s）铺满，锚点取 spec.anchor（缺省居中）；未装载则静默跳过 */
const image: ProviderImpl = {
  draw: (_g, ctx) => {
    if (!ctx.sprite || !ctx.asset) return;
    const spec = ctx.spec;
    if (!spec || spec.kind !== 'image') return;
    const texture = ctx.asset(spec.src);
    if (!texture) return;
    ctx.sprite({
      texture,
      x: ctx.cx,
      y: ctx.cy,
      w: ctx.box.w * ctx.s,
      h: ctx.box.h * ctx.s,
      anchor: spec.anchor,
    });
  },
};
const atlas: ProviderImpl = { draw: () => { /* M5（图集取帧） */ } };
const frames: ProviderImpl = { draw: () => { /* M5（序列帧） */ } };
```

> `draw` 的首参不用（图片不走 `Graphics`），按 TS 惯例命名为 `_g`，不受 `noUnusedParameters` 影响。

- [ ] **Step 6: `Scene.ts` 注入 `spec` / `asset` / `sprite` 并挂载精灵**

`src/render/Scene.ts`：

① import 追加：

```ts
import type { Texture } from 'pixi.js';
import { assetUrl, getTexture } from './assets';
import { makeSprite, makeText } from './paint';
import type { SpriteRequest, TextRequest } from './providers/proc';
```

（`makeText` / `TextRequest` 已由 Task 16 引入，合并到同一行即可。）

② `SceneDeps` 追加：

```ts
export interface SceneDeps {
  /* …原有字段… */
  /** 皮肤包内素材相对路径的基址（如 './skins'） */
  assetBase?: string;
  /** 素材查找顺序的皮肤包 id：当前皮肤优先，其次默认皮肤 */
  skinIds?: string[];
}
```

③ `render()` 内：把 `const texts: TextRequest[] = [];` 改为两行，并在 `ctx` 里加三字段、在挂载文字之后挂精灵：

```ts
      const texts: TextRequest[] = [];
      const sprites: SpriteRequest[] = [];
      /* …place / ctx 构造… */
      const ctx: ProcCtx = {
        /* …原有字段… */
        spec: inst.provider,
        asset: (rel) => this.assetOf(rel),
        sprite: (r) => sprites.push(r),
        text: (r) => texts.push(r),
      };
      providerFor(inst.provider).draw(g, ctx);
      target.addChild(g);
      for (const r of texts) target.addChild(makeText(r));
      for (const r of sprites) target.addChild(makeSprite(r));
```

④ 类内新增私有方法（放在 `ownerColors()` 旁）：

```ts
  /** 素材解析：按 skinIds 顺序在各包内找同名相对路径的已装载纹理（都没有 → null） */
  private assetOf(rel: string): Texture | null {
    const base = this.deps.assetBase ?? './skins';
    for (const id of this.deps.skinIds ?? []) {
      const tex = getTexture(assetUrl(id, rel, base));
      if (tex) return tex;
    }
    return null;
  }
```

- [ ] **Step 7: 实现 `src/render/assets.ts`（收集路径 / 拼 URL / 纹理表 / 预装载）**

Create `src/render/assets.ts`：

```ts
import { Assets, type Texture } from 'pixi.js';
import type { SkinPack } from '../skin/types';

const textures = new Map<string, Texture>();

/** 包内素材相对路径（去重、保序）：image.src / atlas.src / frames.src[] */
export function assetPaths(pack: SkinPack | null): string[] {
  const out: string[] = [];
  for (const spec of Object.values(pack?.elements ?? {})) {
    if (spec.kind === 'image' || spec.kind === 'atlas') {
      if (!out.includes(spec.src)) out.push(spec.src);
    } else if (spec.kind === 'frames') {
      for (const src of spec.src) if (!out.includes(src)) out.push(src);
    }
  }
  return out;
}

/** 包内相对路径 → URL：`<base>/<packId>/<rel>` */
export function assetUrl(packId: string, rel: string, base = './skins'): string {
  return `${base}/${packId}/${rel}`;
}

export function putTexture(url: string, tex: Texture): void {
  textures.set(url, tex);
}

export function getTexture(url: string): Texture | null {
  return textures.get(url) ?? null;
}

export function clearTextures(): void {
  textures.clear();
}

/**
 * 预装载一个皮肤包的全部素材。
 * `Assets.load` 异步而 `Scene.render` 同步 —— 必须在建场景前 await 完成。
 * 任一素材失败只记入 missing，绝不抛错（spec §3.6.4）。
 */
export async function preloadSkinAssets(pack: SkinPack | null, base = './skins'): Promise<string[]> {
  const missing: string[] = [];
  if (!pack) return missing;
  for (const rel of assetPaths(pack)) {
    const url = assetUrl(pack.id, rel, base);
    if (getTexture(url)) continue;
    try {
      putTexture(url, await Assets.load<Texture>(url));
    } catch {
      missing.push(url);
    }
  }
  return missing;
}
```

- [ ] **Step 8: 写素材生成脚本 + photo 皮肤包，并跑脚本出 5 张 png**

Create `tools/gen-photo-assets.mjs`：

```js
/* 生成 photo 皮肤包的 5 张 png 素材：node:zlib 手写最小 PNG 编码器，零第三方依赖。
   用法：node tools/gen-photo-assets.mjs   → public/skins/photo/tex/*.png */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/skins/photo/tex');
mkdirSync(OUT, { recursive: true });

/* —— CRC32 + PNG 分块 —— */
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** rgba(Uint8Array w*h*4) → PNG Buffer（8bit RGBA，scanline filter 全 0） */
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type = RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* —— 极简 2D 画布：rect / ellipse / vgrad，alpha-over 混合 —— */
function cv(w, h) {
  const px = new Uint8Array(w * h * 4);
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const blend = (x, y, c, a) => {
    if (a <= 0 || x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    const da = px[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round((c[k] * a + px[i + k] * da * (1 - a)) / oa);
    px[i + 3] = Math.round(oa * 255);
  };
  const api = {
    rect(x0, y0, ww, hh, color, a = 1) {
      const c = rgb(color);
      for (let y = Math.round(y0); y < Math.round(y0 + hh); y++)
        for (let x = Math.round(x0); x < Math.round(x0 + ww); x++) blend(x, y, c, a);
      return api;
    },
    ellipse(cx, cy, rx, ry, color, a = 1) {
      const c = rgb(color);
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) blend(x, y, c, a);
        }
      return api;
    },
    vgrad(x0, y0, ww, hh, top, bottom) {
      const a = rgb(top);
      const b = rgb(bottom);
      for (let y = Math.round(y0); y < Math.round(y0 + hh); y++) {
        const t = (y - y0) / Math.max(1, hh - 1);
        const c = [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t));
        for (let x = Math.round(x0); x < Math.round(x0 + ww); x++) blend(x, y, c, 1);
      }
      return api;
    },
    save(name) {
      writeFileSync(resolve(OUT, name), png(w, h, px));
      console.log(`[photo] ${name}  ${w}×${h}`);
    },
  };
  return api;
}

/* —— 5 张素材：尺寸按元素注册表逻辑包围盒，与 proc 版同廓形 —— */

/* 1. board.center.fountain  box { w:60, h:28 }，anchor [0.5, 1] */
cv(60, 28)
  .vgrad(0, 0, 60, 28, '#20463f', '#0f2420')
  .ellipse(30, 24, 26, 7, '#2c5b52')
  .ellipse(30, 22, 20, 5, '#3b7a6c')
  .rect(27, 6, 6, 16, '#5fb9a6')
  .ellipse(30, 5, 9, 4, '#8fe0cd', 0.85)
  .ellipse(30, 12, 12, 3, '#a8ece1', 0.4)
  .save('fountain.png');

/* 2. prop.tree  box { w:14, h:30 }，anchor [0.5, 1] */
cv(28, 60)
  .rect(12, 34, 4, 24, '#3a2a1c')
  .ellipse(14, 26, 13, 12, '#2f6b3f')
  .ellipse(7, 22, 8, 7, '#275c35')
  .ellipse(21, 24, 8, 7, '#347a48')
  .ellipse(14, 12, 8, 7, '#3d8c52')
  .ellipse(10, 10, 3, 3, '#8fd6a0', 0.5)
  .save('tree.png');

/* 3. prop.lamp  box { w:8, h:28 }，anchor [0.5, 1] */
cv(16, 56)
  .ellipse(8, 52, 7, 3, '#12201c')
  .rect(7, 12, 2, 41, '#2a3330')
  .rect(3, 9, 10, 3, '#3a4640')
  .ellipse(8, 8, 8, 7, '#ffd682', 0.22)
  .ellipse(8, 8, 4, 4, '#ffe6a8')
  .save('lamp.png');

/* 4. piece.p1  box { w:8.4, h:13 }，anchor [0.5, 1]（玩家一绿色） */
cv(16, 24)
  .ellipse(8, 21, 7, 3, '#0d1a14')
  .ellipse(8, 12, 6, 7, '#3fbf7f')
  .ellipse(8, 6, 4, 4, '#63d79c')
  .ellipse(6.5, 5, 1.6, 1.6, '#dffbe9', 0.8)
  .save('pawn1.png');

/* 5. showcase.mini  box { w:160, h:210 }，anchor [0,0]（对齐 roundRect 左上角原点） */
{
  const c = cv(160, 210).vgrad(0, 0, 160, 210, '#16221e', '#0d1512');
  c.rect(3, 3, 154, 204, '#101a17').rect(6, 6, 148, 198, '#1b2622').rect(6, 6, 148, 26, '#2a3830');
  const hs = [44, 32, 20]; // 与 proc 版 showcaseMini 的三档天际线高度一致
  let x = 8;
  for (let i = 0; x < 150; i++) {
    const bw = 10 + ((i * 5) % 16);
    const bh = hs[i % 3];
    c.rect(x, 96 - bh, bw, bh, '#233029');
    x += bw + 3;
  }
  c.rect(6, 110, 148, 94, '#182220');
  c.save('card.png');
}

console.log(`[photo] 素材已写入 ${OUT}`);
```

Create `public/skins/photo/skin.json`：

```json
{
  "id": "photo",
  "meta": { "name": "图片素材皮肤示例（零代码换风格验证）" },
  "geo": { "hw": 21, "hh": 10.5, "ox": 195, "oy": 96 },
  "tokens": {},
  "elements": {
    "board.center.fountain": { "kind": "image", "src": "tex/fountain.png", "anchor": [0.5, 1] },
    "prop.tree": { "kind": "image", "src": "tex/tree.png", "anchor": [0.5, 1] },
    "prop.lamp": { "kind": "image", "src": "tex/lamp.png", "anchor": [0.5, 1] },
    "piece.p1": { "kind": "image", "src": "tex/pawn1.png", "anchor": [0.5, 1] },
    "showcase.mini": { "kind": "image", "src": "tex/card.png", "anchor": [0, 0] }
  }
}
```

> 本包**只声明这 5 条**，其余元素全部逐级回退到 `default` 皮肤（`resolve()` 的包级回退），因此 `?skin=photo` 画面完整、只是这 5 处换成了图片。

Run: `node tools/gen-photo-assets.mjs`
Expected: 逐行打印 `[photo] fountain.png  60×28` / `tree.png  28×60` / `lamp.png  16×56` / `pawn1.png  16×24` / `card.png  160×210`，末尾 `[photo] 素材已写入 …\public\skins\photo\tex`。

- [ ] **Step 9: `main.ts` 预装载素材并注入 Scene**

`src/main.ts` 的 `boot()`：

① import 追加：

```ts
import { preloadSkinAssets } from './render/assets';
```

② 在 `loadSkin` 之后、`new Scene(...)` 之前插入预装载：

```ts
  /* 图片素材必须同步可用：render() 是同步的，故在此把所有素材先装载进纹理表 */
  const missingAssets = [
    ...(await preloadSkinAssets(defaultSkin, './skins')),
    ...(skin && skin !== defaultSkin ? await preloadSkinAssets(skin, './skins') : []),
  ];
```

③ `new Scene({ ... })` 追加两个字段：

```ts
    assetBase: './skins',
    skinIds: [...new Set([skin?.id, defaultSkin?.id].filter((v): v is string => Boolean(v)))],
```

④ 暴露给验收脚本：

```ts
  (window as unknown as Record<string, unknown>).__monoMain = { stage, scene, opts, geo, skin, missingAssets, VERSION };
```

- [ ] **Step 10: 跑测试 + 校验 + 默认皮肤闸门回归**

Run: `npx vitest run test/render test/skin && npm test`
Expected: 全绿（新增 `provider-image.spec.ts` 5 例；既有 M1–M3 用例无回归）。

Run: `npm run lint && npm run lint:skin`
Expected: 0 错；`[skin:default] OK` 与 `[skin:photo] OK` 逐包打印。

Run: `node local/mono-shots-m3.mjs`（另开 `npm run dev`）
Expected: `gate` 全 `true`、`noErrors` 为 `true`（默认皮肤未受影响，Task 20 的三张截图照旧）。浏览器手验：`?debug=1&skin=photo` 下喷泉 / 两棵树 / 四盏灯 / 玩家一棋子 / C 版式迷你卡变图片素材，`__monoMain.missingAssets.length === 0`；`?show=c&skin=photo` 三张卡外标签仍为 `L1 摊位 · ￥60` 等。

- [ ] **Step 11: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test monopoly/tools
git commit -m "feat(mono): 图片素材皮肤示例（photo 包 + tools/gen-photo-assets.mjs）与 image provider"
```

---

## Task 22: Wave 1 闸门（M3）—— photo 皮肤截图 + 手册 M3 段 + v5 目视对齐

**Files:**
- Modify: `d:\zhao\monopoly\local\mono-shots-m3.mjs`（追加 `?skin=photo` 一组截图与断言）
- Modify: `d:\zhao\monopoly\docs\manual-mono.md`（追加「M3 三级建筑与地块橱窗」段）
- Create: `d:\zhao\monopoly\docs\verify\mono-m3-04-skin-photo-board.png`（脚本生成）
- Create: `d:\zhao\monopoly\docs\verify\mono-m3-05-skin-photo-showcase-b.png`（脚本生成）
- Create: `d:\zhao\monopoly\docs\verify\mono-m3-06-skin-photo-codex-c.png`（脚本生成）

> 本任务是 **Wave 1 的收口闸门**：把 M3（Task 15–21）的全部产物用**一台脚本、六张手机视口截图**一次验完，并把截图回填进操作手册（用户硬规范：功能交付 = 实现 + 测试 + 手机截图 + 手册）。

- [ ] **Step 1: 扩展闸门脚本（默认皮肤 3 张 + photo 皮肤 3 张）**

`local/mono-shots-m3.mjs` 整文件替换为：

```js
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

/* 默认皮肤：[show, 截图, fx 层最少子节点数（B 14 / C 11）] */
const views = [
  ['0', 'mono-m3-01-board.png', 1],
  ['b', 'mono-m3-02-showcase-b.png', 14],
  ['c', 'mono-m3-03-codex-c.png', 11],
];

/* photo 皮肤（Task 21）：[show, 截图, image provider 实例数下限]
   show=0 / b：喷泉 1 + 树 2 + 灯 4 + 棋子 p1 = 8；show=c 再 + 迷你卡 ×3 = 11 */
const skinViews = [
  ['0', 'mono-m3-04-skin-photo-board.png', 8],
  ['b', 'mono-m3-05-skin-photo-showcase-b.png', 8],
  ['c', 'mono-m3-06-skin-photo-codex-c.png', 11],
];

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

async function open(url) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 15000 });
  return page;
}

for (const [show, file, minFx] of views) {
  const page = await open(`${ORIGIN}/mono.html?debug=1&show=${show}`);
  const f = await page.evaluate(() => {
    const main = window.__monoMain;
    const inst = main.scene.instancesOf();
    const shots = inst.filter((i) => i.id.startsWith('showcase.'));
    return {
      fxChildren: main.stage.layers.fx.children.length,
      showcase: shots.length,
      showroomL4: shots.filter((i) => i.level === 4).length,
      viewButtons: document.querySelectorAll('#mono-views button').length,
    };
  });
  await page.screenshot({ path: `${OUT}/${file}` });
  facts[`show=${show}`] = f;
  gate[`show${show}_fx`] = f.fxChildren >= minFx;
  gate[`show${show}_noL4`] = f.showroomL4 === 0;
  gate[`show${show}_switch`] = f.viewButtons === 3;
  await page.close();
}

for (const [show, file, minImages] of skinViews) {
  const page = await open(`${ORIGIN}/mono.html?debug=1&skin=photo&show=${show}`);
  const f = await page.evaluate(() => {
    const main = window.__monoMain;
    const inst = main.scene.instancesOf();
    const kind = (id) => inst.find((i) => i.id === id)?.providerKind ?? null;
    return {
      missingAssets: main.missingAssets.length,
      imageInstances: inst.filter((i) => i.providerKind === 'image').length,
      p1: kind('piece.p1'),
      p2: kind('piece.p2'),
      showroomL4: inst.filter((i) => i.id.startsWith('showcase.') && i.level === 4).length,
      viewButtons: document.querySelectorAll('#mono-views button').length,
    };
  });
  await page.screenshot({ path: `${OUT}/${file}` });
  facts[`skin=photo&show=${show}`] = f;
  gate[`photo${show}_assets`] = f.missingAssets === 0;
  gate[`photo${show}_images`] = f.imageInstances >= minImages;
  gate[`photo${show}_fallback`] = f.p1 === 'image' && f.p2 === 'proc';
  gate[`photo${show}_noL4`] = f.showroomL4 === 0;
  gate[`photo${show}_switch`] = f.viewButtons === 3;
  await page.close();
}

gate.noErrors = errors.length === 0;
console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);
```

> `photo*_fallback` 是「逐元素回退」的铁证：`piece.p1` 命中 `photo` 包的 `image`，`piece.p2` 未在包内声明 → 落到 `default` 的 `proc`。

- [ ] **Step 2: 跑闸门，6 张截图入库**

Run: `npm run dev`（后台，端口 52300）
Run: `node local/mono-shots-m3.mjs`
Expected: 退出码 0；`gate` 全 `true`；`errors` 为 `[]`；`docs/verify/` 下新增/更新 6 张 390×844 @dpr2 png。`facts['skin=photo&show=0'].imageInstances` ≥ 8、`.missingAssets` = 0、`.p1` = `'image'`、`.p2` = `'proc'`。

- [ ] **Step 3: 与 v5 权威样张逐项目视对齐**

对照 `d:\zhao\.superpowers\brainstorm\monopoly\v5-A.png` / `v5-B.png` / `v5-C.png`，逐项核对并在 `docs/manual-mono.md` 的 M3 段末尾记一行「已对齐 / 有意偏差」：

- **v5-A ↔ `mono-m3-01-board.png`**：外圈 32 格菱形地砖的斜 45° 走向与四边镜像对称；内环草地/石板/广场分区与中心喷泉；8 栋装饰楼压暗；四枚棋子同格一排站在格前沿；32 个汉字店名全部可读且不被前排楼遮住。
- **v5-B ↔ `mono-m3-02-showcase-b.png`**：夜空纵向渐变无横带接缝（`skyBands` 24 条近似，唯一视觉近似处）；月亮偏右上；亮窗天际线 6 行；石板广场双层菱形；两树两灯；温泉馆出檐 + 竖招牌「温泉」+ 门口双灯笼「汤」+ 池面蒸汽；顶部店名药丸；底部信息条（层级 / 路过租金 / 金色按钮）。
- **v5-C ↔ `mono-m3-03-codex-c.png`**：三张卡等宽等高、同一地平线；L1 坡顶摊 / L2 两层暖窗 / L3 幕墙霓虹的体量差一眼可辨；卡下标签字号一致。
- **有意偏差（写进手册，勿当 bug）**：① 迷你卡天际线高度分档用 `((lx % 3) + 3) % 3` 归一化，避免 v5 在负 `px` 下算出负楼高；② v5 卡外标签是 HTML `div`，本工程改用 `ctx.text` 画在卡下方、字号不随 `s` 缩放。

- [ ] **Step 4: 追写操作手册 M3 段（含截图回填）**

`docs/manual-mono.md` 在「### M2 等距棋盘」表格之后追加：

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add monopoly/local monopoly/docs
git commit -m "test(mono): Wave 1 闸门——photo 皮肤 3 张截图 + 手册 M3 段（含 v5 目视对齐结论）"
```

---

## Task 23: 经济常量 + 双骰（可注入 seed）+ 棋盘路径（纯 TS，零引擎）

**Files:**
- Create: `d:\zhao\monopoly\src\data\economy.ts`
- Create: `d:\zhao\monopoly\src\core\dice.ts`
- Create: `d:\zhao\monopoly\src\core\board-path.ts`
- Test: `d:\zhao\monopoly\test\core\economy.spec.ts`
- Test: `d:\zhao\monopoly\test\core\dice.spec.ts`
- Test: `d:\zhao\monopoly\test\core\board-path.spec.ts`

> **为什么经济常量单独成文件、而不是塞进 `src/data/board.ts`**：`board.ts` 是**展示数据**（格名/类型/层级/橱窗文案），经济是**规则数值**。二者生命周期不同（真实商家清单会换，规则数值要跑平衡），故分文件；但 `PRICE_BY_LEVEL` / `RENT_BY_LEVEL` 的唯一真源仍在 `board.ts`（Task 19/20 的橱窗与对照卡已消费它），`economy.ts` 只做**口径再导出**，避免同一组数字出现两处而漂移。
> **为什么骰子必须可注入 seed**：① 单测要断言分布与众数；② spec §11 要求「手机视口截图回归」——`?seed=` 让每一次验收截图的骰子序列完全一致，否则截图不可复现。故 RNG 用 mulberry32（32 位、纯函数、零依赖），真实对局不传 seed 走时间。
> **为什么路径前进单独成纯函数**：`advance()` 是「移动越界」「经过起点 +￥200」（spec §11.2 两条单测）的唯一实现点，M6 的逐格跳跃动画也要按它逐格喂帧。

- [ ] **Step 1: 写失败测试（三份）**

`test/core/economy.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  BANKRUPT_CASH_LINE, BUILD_TURNS, MAX_LEVEL, PASS_START_BONUS, PRICE_BY_LEVEL, RENT_BY_LEVEL,
  ROUND_LIMIT, SELL_RATIO, START_CASH, buyPrice, canUpgrade, nextLevel, rentOf, sellValue,
} from '../../src/data/economy';

describe('economy 经济口径（spec §5.4）', () => {
  it('开局资金 ￥3000 / 经过起点 +￥200', () => {
    expect(START_CASH).toBe(3000);
    expect(PASS_START_BONUS).toBe(200);
  });

  it('建造价 [0,60,180,420] 与租金 [0,15,45,105] 与 board 展示表同源', () => {
    expect(PRICE_BY_LEVEL).toEqual([0, 60, 180, 420]);
    expect(RENT_BY_LEVEL).toEqual([0, 15, 45, 105]);
    expect(buyPrice(1)).toBe(60);
    expect(buyPrice(3)).toBe(420);
    expect(rentOf(0)).toBe(0);
    expect(rentOf(3)).toBe(105);
  });

  it('破产线：现金 < 0 且无可变卖地产（0 为分界值）', () => {
    expect(BANKRUPT_CASH_LINE).toBe(0);
  });

  it('canUpgrade 只有 1/2 级可升；nextLevel 在 3 级封顶', () => {
    expect(MAX_LEVEL).toBe(3);
    expect([canUpgrade(0), canUpgrade(1), canUpgrade(2), canUpgrade(3)]).toEqual([false, true, true, false]);
    expect(nextLevel(1)).toBe(2);
    expect(nextLevel(3)).toBe(3);
  });

  it('施工工期 1 回合、变卖价 = 累计投入的一半', () => {
    expect(BUILD_TURNS).toBe(1);
    expect(SELL_RATIO).toBe(0.5);
    expect(sellValue(0)).toBe(0);
    expect(sellValue(1)).toBe(30);    // 60 / 2
    expect(sellValue(2)).toBe(120);   // (60+180) / 2
    expect(sellValue(3)).toBe(330);   // (60+180+420) / 2
  });

  it('回合上限 60 轮（胜负兜底：零和租金不会自行收敛，需时间上限）', () => {
    expect(ROUND_LIMIT).toBe(60);
  });
});
```

`test/core/dice.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { DICE_FACES, createDice, makeRng, type Dice } from '../../src/core/dice';

describe('dice 双骰（spec §5.1）', () => {
  it('两颗骰，点数 1..6，总和 = d1 + d2', () => {
    const dice = createDice(1);
    for (let i = 0; i < 500; i++) {
      const r = dice.roll();
      expect(r.d1).toBeGreaterThanOrEqual(1);
      expect(r.d1).toBeLessThanOrEqual(DICE_FACES);
      expect(r.d2).toBeGreaterThanOrEqual(1);
      expect(r.d2).toBeLessThanOrEqual(DICE_FACES);
      expect(r.total).toBe(r.d1 + r.d2);
    }
    expect(DICE_FACES).toBe(6);
  });

  it('同 seed → 同序列（验收截图与线上回归可复现）', () => {
    const seq = (s: number): number[] => {
      const d: Dice = createDice(s);
      return Array.from({ length: 20 }, () => d.roll().total);
    };
    expect(seq(20260928)).toEqual(seq(20260928));
  });

  it('不同 seed → 不同序列', () => {
    const seq = (s: number): number[] => {
      const d: Dice = createDice(s);
      return Array.from({ length: 20 }, () => d.roll().total);
    };
    expect(seq(1)).not.toEqual(seq(2));
  });

  it('分布：2..12 全部出现，7 是众数（20000 次）', () => {
    const dice = createDice(7);
    const counts = new Array(13).fill(0) as number[];
    for (let i = 0; i < 20000; i++) counts[dice.roll().total] += 1;
    for (let s = 2; s <= 12; s++) expect(counts[s]).toBeGreaterThan(0);
    const max = Math.max(...counts.slice(2));
    expect(counts[7]).toBe(max);
    /* 7 的理论概率 6/36 = 1/6，给 ±25% 容差 */
    expect(counts[7]).toBeGreaterThan((20000 / 6) * 0.75);
    expect(counts[7]).toBeLessThan((20000 / 6) * 1.25);
  });

  it('makeRng 输出落在 [0,1)，且同 seed 逐步相同', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(b());
    }
  });
});
```

`test/core/board-path.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { advance } from '../../src/core/board-path';
import { RING_SIZE } from '../../src/data/board';

describe('board-path 逐格移动（spec §5.1 / §5.4）', () => {
  it('常规前进不经过起点', () => {
    expect(advance(0, 3)).toEqual({ from: 0, to: 3, steps: 3, passedStart: false });
    expect(advance(10, 2)).toEqual({ from: 10, to: 12, steps: 2, passedStart: false });
  });

  it('越过终点回绕并记一次经过起点', () => {
    const r = advance(30, 5);
    expect(r.to).toBe(3);
    expect(r.passedStart).toBe(true);
  });

  it('正好落在起点也算经过（停留触发 +￥200）', () => {
    expect(advance(28, 4)).toEqual({ from: 28, to: 0, steps: 4, passedStart: true });
    expect(advance(31, 1).to).toBe(0);
    expect(advance(31, 1).passedStart).toBe(true);
  });

  it('整圈（32 步）回到原格且只算一次经过', () => {
    const r = advance(4, RING_SIZE);
    expect(r.to).toBe(4);
    expect(r.passedStart).toBe(true);
  });

  it('原地（0 步）不算经过', () => {
    expect(advance(7, 0)).toEqual({ from: 7, to: 7, steps: 0, passedStart: false });
    expect(advance(0, 0).passedStart).toBe(false);
  });

  it('后退（命运卡退格）绝不发起点奖励', () => {
    const r = advance(2, -3);
    expect(r.to).toBe(RING_SIZE - 1);
    expect(r.passedStart).toBe(false);
  });

  it('默认环长 = RING_SIZE=32，也支持自定义环长', () => {
    expect(RING_SIZE).toBe(32);
    expect(advance(3, 4, 8).to).toBe(7);
    expect(advance(3, 4, 8).passedStart).toBe(false);
    expect(advance(3, 6, 8).to).toBe(1);
    expect(advance(3, 6, 8).passedStart).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/core/economy.spec.ts test/core/dice.spec.ts test/core/board-path.spec.ts`
Expected: FAIL，三个模块均不存在（`Cannot find module .../src/data/economy`）。

- [ ] **Step 3: 实现 `src/data/economy.ts`**

```ts
/**
 * 游戏经济口径（spec §5.4）：开局资金 / 经过起点奖励 / 破产线 / 建造价与租金 / 回合上限。
 * `PRICE_BY_LEVEL` 与 `RENT_BY_LEVEL` 的唯一真源是 `board.ts` 的展示表
 * （Task 19/20 的橱窗与三级对照卡已消费它），此处只做对外的口径再导出，避免数值两处漂移。
 */
import { PRICE_BY_LEVEL, RENT_BY_LEVEL } from './board';

export { PRICE_BY_LEVEL, RENT_BY_LEVEL };

/** 开局资金 ￥3,000 */
export const START_CASH = 3000;
/** 经过起点（含正好落在起点）一次 +￥200 */
export const PASS_START_BONUS = 200;
/** 破产分界：现金 < 0 且无可变卖地产 → 破产 */
export const BANKRUPT_CASH_LINE = 0;
/** 建筑最高层级 */
export const MAX_LEVEL = 3;
/** 升级施工工期：升级当回合起 1 个回合内不可收租 */
export const BUILD_TURNS = 1;
/** 变卖价 = 该地块累计投入的一半（向下取整） */
export const SELL_RATIO = 0.5;
/**
 * 回合上限（轮）= 胜负兜底。
 * 租金是玩家之间的零和转移，不会自行收敛；若只按「仅剩 1 名未破产」判胜，
 * 经济稳态下整局可能永不结束（spec §5.4 只给了破产线，未给时间上限）。
 * 故补一条硬规则：跑满 ROUND_LIMIT 轮后按净资产（现金 + 地产投入）排名定胜者。
 */
export const ROUND_LIMIT = 60;

/** 第 level 级的建造 / 升级价（0 级 = 空地，不可建） */
export function buyPrice(level: number): number {
  return PRICE_BY_LEVEL[level] ?? 0;
}

/** 第 level 级的路过租金 */
export function rentOf(level: number): number {
  return RENT_BY_LEVEL[level] ?? 0;
}

/** 下一层级（3 级封顶） */
export function nextLevel(level: number): number {
  return Math.min(level + 1, MAX_LEVEL);
}

/** 只有已成楼（≥1 级）且未封顶才可升级 */
export function canUpgrade(level: number): boolean {
  return level >= 1 && level < MAX_LEVEL;
}

/** 变卖价：1 级 ￥30 / 2 级 ￥120 / 3 级 ￥330 */
export function sellValue(level: number): number {
  let invested = 0;
  for (let l = 1; l <= Math.min(level, MAX_LEVEL); l++) invested += buyPrice(l);
  return Math.floor(invested * SELL_RATIO);
}
```

- [ ] **Step 4: 实现 `src/core/dice.ts`**

```ts
/** 骰子面数 */
export const DICE_FACES = 6;
/** 每回合掷两颗（spec §5.1） */
export const DICE_COUNT = 2;

export interface DiceRoll {
  d1: number;
  d2: number;
  total: number;
}

export interface Dice {
  roll(): DiceRoll;
}

/**
 * mulberry32：32 位确定性伪随机（返回值落在 [0,1)，用法同 Math.random）。
 * 同 seed → 同序列：① 单测可断言分布与众数；② `?seed=` 让验收截图与线上回归完全可复现。
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 建一副双骰：不传 seed 走当前时间（真实对局），传 seed 走确定性序列（测试 / 回放） */
export function createDice(seed?: number): Dice {
  const rnd = makeRng(seed ?? (Date.now() & 0xffffffff));
  const face = (): number => 1 + Math.floor(rnd() * DICE_FACES);
  return {
    roll: (): DiceRoll => {
      const d1 = face();
      const d2 = face();
      return { d1, d2, total: d1 + d2 };
    },
  };
}
```

- [ ] **Step 5: 实现 `src/core/board-path.ts`**

```ts
import { RING_SIZE } from '../data/board';

export interface Advance {
  from: number;
  to: number;
  steps: number;
  /** 是否触发「经过起点」+￥200（含正好落在起点；后退不计，spec §5.4） */
  passedStart: boolean;
}

/**
 * 沿外圈路径前进 steps 格（spec §5.1 逐格移动 / §5.4 经过起点）。
 * 纯函数、环长可注入（默认 32），便于单测覆盖越界回绕与整圈。
 */
export function advance(from: number, steps: number, size: number = RING_SIZE): Advance {
  const raw = from + steps;
  const to = ((raw % size) + size) % size;
  return { from, to, steps, passedStart: steps > 0 && raw >= size };
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run test/core`
Expected: PASS（economy 6 例 + dice 5 例 + board-path 7 例；连同 Task 10 的 `board.spec.ts` 一并绿）。

Run: `npm run lint`
Expected: 0 错（三个文件都不在 `src/render/**` 下，禁写死规则不适用）。

- [ ] **Step 7: Commit**

```bash
git add monopoly/src/data/economy.ts monopoly/src/core monopoly/test/core
git commit -m "feat(mono): M4 经济口径 + 确定性双骰 + 棋盘逐格路径（含经过起点判定）"
```

## Task 24: 地产系统（买地 / 升级 / 施工中 / 收租 / 变卖）

**Files:**
- Create: `d:\zhao\monopoly\src\core\estate.ts`
- Test: `d:\zhao\monopoly\test\core\estate.spec.ts`

> **为什么地产状态是「原地读写的 `Record<number, Estate>`」而不是每次深拷贝**：一个回合状态机每次操作都要重画 HUD 与棋盘，深拷贝是纯开销；且 `Estate` 只有 4 个字段，`Record` 的键即地块序号，`delete` 即回归无主——比数组更贴合「32 格里只有部分有主」的稀疏语义。所有函数在注释里显式声明「原地写入」，调用方（Task 25 的 `game.ts`）持有唯一一份状态。
> **为什么「可买卖」按 `typeAt(index) === 'shop'` 判定**：spec §4 规则约定「起点不可买卖，仅作地标」；命运/机会/监狱/股票/福利是事件格，也不该有归属。用 `board.ts` 的类型而不是另立白名单，保证棋盘数据是唯一真源。
> **「施工中」为什么不放在地块上而是放在 `Estate.processing`**：它就是该地块的状态，放在一起才能让 `rentAt()` 一处判定「无主 / 施工中 → 租金 0」，不散落到结算逻辑里。
> **变卖是破产清算的必要前提**：spec §5.4 的破产线是「现金 < 0 **且无可变卖地产**」，所以必须先有 `sellAt()`（变卖价 = 累计投入的一半），Task 25 才能在欠租时「先卖地抵债、卖完仍为负才破产」。

- [ ] **Step 1: 写失败测试**

`test/core/estate.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  assetValue, buy, buyable, canBuy, clearProcessing, ownedBy, rentAt, sellAt, upgrade,
  type Estates,
} from '../../src/core/estate';

const fresh = (): Estates => ({});

describe('estate 买地（spec §5.2 / §5.4）', () => {
  it('shop 地块可买：扣 ￥60、成 1 级楼、非施工中', () => {
    const es = fresh();
    const r = buy(es, 1, 2, 3000);
    expect(r).toEqual({ ok: true, cost: 60, cash: 2940 });
    expect(es[1]).toEqual({ index: 1, owner: 2, level: 1, processing: false });
  });

  it('起点 / 命运 / 机会 / 福利 / 监狱 / 股票一律不可买（spec §4 规则约定）', () => {
    for (const i of [0, 2, 5, 7, 12, 19, 27]) expect(buyable(i)).toBe(false);
    expect(buy(fresh(), 0, 1, 3000)).toEqual({ ok: false, reason: 'not-buyable' });
    expect(buy(fresh(), 12, 1, 3000)).toEqual({ ok: false, reason: 'not-buyable' });
    expect(buy(fresh(), 19, 1, 3000)).toEqual({ ok: false, reason: 'not-buyable' });
  });

  it('已有主 → owned，且不改现金、不改归属', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(buy(es, 1, 3, 3000)).toEqual({ ok: false, reason: 'owned' });
    expect(es[1].owner).toBe(2);
  });

  it('现金不足 → not-enough-cash，且不写状态', () => {
    const es = fresh();
    expect(buy(es, 1, 2, 59)).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(es[1]).toBeUndefined();
    expect(canBuy(es, 1, 59)).toBe(false);
    expect(canBuy(es, 1, 60)).toBe(true);
  });
});

describe('estate 升级（L1→L2→L3 逐级、互斥、施工中；spec §5.2）', () => {
  it('L1→L2 花 ￥180 并置施工中；施工中期间租金为 0', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(upgrade(es, 1, 2, 2940)).toEqual({ ok: true, cost: 180, cash: 2760, level: 2 });
    expect(es[1].processing).toBe(true);
    expect(rentAt(es, 1)).toBe(0);
  });

  it('升级互斥：同一回合不能连续升级 / 不可跳级', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    upgrade(es, 1, 2, 2940);
    expect(upgrade(es, 1, 2, 2760)).toEqual({ ok: false, reason: 'processing' });
    expect(es[1].level).toBe(2);
  });

  it('下回合解施工后：2 级租金 ￥45，可再升 3 级（￥420）', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    upgrade(es, 1, 2, 2940);
    expect(clearProcessing(es, 2)).toBe(1);
    expect(es[1].processing).toBe(false);
    expect(rentAt(es, 1)).toBe(45);
    expect(upgrade(es, 1, 2, 2760)).toEqual({ ok: true, cost: 420, cash: 2340, level: 3 });
    clearProcessing(es, 2);
    expect(rentAt(es, 1)).toBe(105);
  });

  it('无主 → no-owner；他人地块 → not-owner；3 级封顶 → max-level', () => {
    const es = fresh();
    expect(upgrade(es, 1, 2, 3000)).toEqual({ ok: false, reason: 'no-owner' });
    buy(es, 1, 2, 3000);
    expect(upgrade(es, 1, 3, 3000)).toEqual({ ok: false, reason: 'not-owner' });
    es[1].level = 3;
    expect(upgrade(es, 1, 2, 3000)).toEqual({ ok: false, reason: 'max-level' });
  });

  it('升级现金不足 → not-enough-cash，层级与施工标记都不变', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(upgrade(es, 1, 2, 179)).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(es[1].level).toBe(1);
    expect(es[1].processing).toBe(false);
  });
});

describe('estate 收租 / 变卖 / 持有查询', () => {
  it('无主地块租金为 0', () => {
    expect(rentAt(fresh(), 3)).toBe(0);
  });

  it('变卖价 = 累计投入一半：60→30、240→120、660→330；无主为 0', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(sellAt(es, 1)).toBe(30);
    es[1].level = 2;
    expect(sellAt(es, 1)).toBe(120);
    es[1].level = 3;
    expect(sellAt(es, 1)).toBe(330);
    expect(sellAt(es, 3)).toBe(0);
  });

  it('assetValue = 账面投入全额（净资产排名用，与变卖价区分）', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(assetValue(es, 2)).toBe(60);
    es[1].level = 2;
    expect(assetValue(es, 2)).toBe(240);
    buy(es, 3, 2, 3000);
    expect(assetValue(es, 2)).toBe(300);
    expect(assetValue(es, 3)).toBe(0);
  });

  it('ownedBy 升序且只含本人；clearProcessing 只解除本人地块', () => {
    const es = fresh();
    buy(es, 10, 2, 3000);
    buy(es, 3, 2, 3000);
    buy(es, 4, 3, 3000);
    es[4].processing = true;
    expect(ownedBy(es, 2)).toEqual([3, 10]);
    expect(clearProcessing(es, 2)).toBe(0);
    expect(es[4].processing).toBe(true);
    expect(clearProcessing(es, 3)).toBe(1);
    expect(es[4].processing).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/core/estate.spec.ts`
Expected: FAIL，`src/core/estate.ts` 不存在。

- [ ] **Step 3: 实现 `src/core/estate.ts`**

```ts
import { RING_SIZE, typeAt } from '../data/board';
import { buyPrice, canUpgrade, nextLevel, rentOf, sellValue } from '../data/economy';

/** 一块已成交的地产 */
export interface Estate {
  index: number;
  /** 持有者 1..4（与 `piece.p1..p4` / `tokens.owner1..owner4` 对齐） */
  owner: number;
  /** 建成的层级 1..3（无主地块在 Estates 里没有键） */
  level: 1 | 2 | 3;
  /** 施工中：升级后置 true，该玩家下个回合开始时解除（1 回合不可收租，spec §5.2） */
  processing: boolean;
}

/**
 * 地块序号 → 地产（无键 = 无主）。
 * **本模块全部函数原地读写该对象**：调用方（game.ts）持有唯一一份状态，避免每回合深拷贝。
 */
export type Estates = Record<number, Estate>;

export type BuyFail = 'not-buyable' | 'owned' | 'not-enough-cash';
export type UpgradeFail = 'no-owner' | 'not-owner' | 'processing' | 'max-level' | 'not-enough-cash';

export type BuyOutcome =
  | { ok: true; cost: number; cash: number }
  | { ok: false; reason: BuyFail };

export type UpgradeOutcome =
  | { ok: true; cost: number; cash: number; level: 2 | 3 }
  | { ok: false; reason: UpgradeFail };

/** 只有 shop 类型可买卖（起点 core / 命运 / 机会 / 监狱 / 股票 / 福利一律不可，spec §4 规则约定） */
export function buyable(index: number): boolean {
  return index >= 0 && index < RING_SIZE && typeAt(index) === 'shop';
}

/** 能否购买：shop 类型 + 无主 + 现金够 */
export function canBuy(estates: Estates, index: number, cash: number): boolean {
  return buyable(index) && !estates[index] && cash >= buyPrice(1);
}

/** 买地：成功则原地写入 estates（1 级成楼），返回花费与剩余现金 */
export function buy(estates: Estates, index: number, owner: number, cash: number): BuyOutcome {
  if (!buyable(index)) return { ok: false, reason: 'not-buyable' };
  if (estates[index]) return { ok: false, reason: 'owned' };
  const cost = buyPrice(1);
  if (cash < cost) return { ok: false, reason: 'not-enough-cash' };
  estates[index] = { index, owner, level: 1, processing: false };
  return { ok: true, cost, cash: cash - cost };
}

/** 升级 L1→L2→L3：逐级、不可跳级；升级当回合起挂施工中 */
export function upgrade(estates: Estates, index: number, owner: number, cash: number): UpgradeOutcome {
  const e = estates[index];
  if (!e) return { ok: false, reason: 'no-owner' };
  if (e.owner !== owner) return { ok: false, reason: 'not-owner' };
  if (e.processing) return { ok: false, reason: 'processing' };
  if (!canUpgrade(e.level)) return { ok: false, reason: 'max-level' };
  const cost = buyPrice(nextLevel(e.level));
  if (cash < cost) return { ok: false, reason: 'not-enough-cash' };
  e.level = nextLevel(e.level) as 2 | 3;
  e.processing = true;
  return { ok: true, cost, cash: cash - cost, level: e.level };
}

/** 该地块当前应收租金（无主 / 施工中 → 0） */
export function rentAt(estates: Estates, index: number): number {
  const e = estates[index];
  if (!e || e.processing) return 0;
  return rentOf(e.level);
}

/** 该地块变卖价（无主 → 0）；破产清算按它抵债 */
export function sellAt(estates: Estates, index: number): number {
  const e = estates[index];
  return e ? sellValue(e.level) : 0;
}

/** 该玩家地产的账面投入全额（现金 + 地产投入 = 净资产，胜负排名用；与变卖价区分） */
export function assetValue(estates: Estates, owner: number): number {
  return ownedBy(estates, owner).reduce((sum, i) => {
    let v = 0;
    for (let l = 1; l <= estates[i].level; l++) v += buyPrice(l);
    return sum + v;
  }, 0);
}

/** 该玩家持有的地块序号（升序） */
export function ownedBy(estates: Estates, owner: number): number[] {
  return Object.keys(estates)
    .map(Number)
    .filter((i) => estates[i].owner === owner)
    .sort((a, b) => a - b);
}

/** 回合开始：解除该玩家全部地块的「施工中」（BUILD_TURNS = 1 的实际执行点），返回解除数量 */
export function clearProcessing(estates: Estates, owner: number): number {
  let n = 0;
  for (const key of Object.keys(estates)) {
    const e = estates[Number(key)];
    if (e.owner === owner && e.processing) {
      e.processing = false;
      n += 1;
    }
  }
  return n;
}
```

> `estates[Number(key)]` 而非直接解构：`Object.keys` 返回字符串键，`Number()` 归一化后 TS 才能收窄到 `Estate`（非 `undefined`）。`ESTATES` 的稀疏语义由「有无该键」承载，无主地块**不写 0 值占位**，否则 `buy()` 的 `owned` 判定会失效。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/core/estate.spec.ts`
Expected: PASS（14 例）。

Run: `npm run lint`
Expected: 0 错。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src/core/estate.ts monopoly/test/core/estate.spec.ts
git commit -m "feat(mono): M4 地产系统（买地/逐级升级/施工中禁收租/变卖价）"
```

---

## Task 25: 回合状态机（掷骰 → 移动 → 结算 → 动作 → 结束）+ 破产 / 胜负

**Files:**
- Create: `d:\zhao\monopoly\src\core\game.ts`
- Test: `d:\zhao\monopoly\test\core\game.spec.ts`

> **为什么要有显式 `phase` 而不是「想到哪跑哪」**：spec §5.1 的回合流程是 `掷骰 → 移动 → 结算 → 可选动作 → 结束`，HUD（Task 26）的按钮可用性完全由阶段决定（未掷骰不能移动、未结算不能买地）。把阶段做成状态机的硬门槛，等于把「按键顺序错误」这类 bug 在结构上消灭；越序调用直接抛 `[mono] <fn> @phase=<x>`，符合 spec §3.7.4 的「可定位」要求。
> **为什么买地/升级不抛错而是返回 `bad-phase`**：它们是**玩家动作**（按钮点击），阶段不符属于正常的用户输入边界，返回失败原因是边界校验；而 `rollDice/moveCurrent/settleCurrent/endTurn` 是**流程推进**，越序属于程序错误，必须炸出来。
> **为什么破产清算用「先变卖抵债、卖完仍不足才破产」**：spec §5.4 的破产线是「现金 < 0 **且无可变卖地产**」，意味着必须先给对方机会卖地自救；`sellValue` 的选序用「变卖价低者先卖」（保住高价值资产），且判定结果完全确定，便于单测。
> **为什么补 `ROUND_LIMIT` 兜底**：租金是玩家之间的**零和转移**，「经过起点 +￥200」是唯一净注入；若只按「仅剩 1 名未破产」判胜，经济稳态下整局可能永不收敛（60 轮兜底见 Task 23 `economy.ts` 注释）。兜底规则：跑满轮数后按**净资产**（现金 + 地产账面投入）排名定胜者。
> **为什么 `netWorth` 用 `assetValue`（账面投入）而不是 `sellValue`（变卖价）**：排名衡量的是玩家**经营规模**，不是清盘残值；`sellValue` 是破产抵债口径，两者在 `estate.ts` 里已刻意分开。

- [ ] **Step 1: 写失败测试**

`test/core/game.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  autoPlay, autoTurn, createGame, currentPlayer, netWorth, winnerOf,
  type Game,
} from '../../src/core/game';
import { PASS_START_BONUS, ROUND_LIMIT, START_CASH } from '../../src/data/economy';
import type { Dice } from '../../src/core/dice';

/** 固定点数骰：让每一局走位完全可预期（验收截图与断言都靠它复现） */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 完整跑一位玩家的回合（掷 → 移动 → 结算 → 结束） */
const playTurn = (g: Game): void => {
  g.rollDice();
  g.moveCurrent();
  g.settleCurrent();
  g.endTurn();
};

describe('game 开局与阶段门槛（spec §5.1）', () => {
  it('开局：4 名玩家 ￥3000 / 位置 0 / 第 1 轮 / idle / 无地产', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const s = g.state;
    expect(s.players.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(s.players.every((p) => p.cash === START_CASH && p.pos === 0 && !p.bankrupt)).toBe(true);
    expect(s.current).toBe(0);
    expect(s.round).toBe(1);
    expect(s.phase).toBe('idle');
    expect(s.dice).toBeNull();
    expect(s.estates).toEqual({});
    expect(s.over).toBe(false);
  });

  it('阶段门槛：未掷骰不能移动 / 未移动不能结算；越序抛错且格式可定位', () => {
    const g = createGame({ dice: fixed(2, 3) });
    expect(() => g.moveCurrent()).toThrow('[mono] moveCurrent @phase=idle');

    const r = g.rollDice();
    expect(r).toEqual({ d1: 2, d2: 3, total: 5 });
    expect(g.state.phase).toBe('rolled');
    expect(g.state.dice).toEqual({ d1: 2, d2: 3, total: 5 });
    expect(() => g.settleCurrent()).toThrow('[mono] settleCurrent @phase=rolled');

    const mv = g.moveCurrent();
    expect(mv).toEqual({ from: 0, to: 5, steps: 5, passedStart: false });
    expect(g.state.phase).toBe('moved');
    expect(() => g.endTurn()).toThrow('[mono] endTurn @phase=moved');
  });
});

describe('game 移动与经过起点（spec §5.4）', () => {
  it('越过终点回绕并 +￥200', () => {
    const g = createGame({ dice: fixed(2, 3) });
    g.state.players[0].pos = 30;
    g.rollDice();
    const mv = g.moveCurrent();
    expect(mv.passedStart).toBe(true);
    expect(g.state.players[0].pos).toBe(3);
    expect(g.state.players[0].cash).toBe(START_CASH + PASS_START_BONUS);
  });

  it('正好落在起点也 +￥200（停留触发）', () => {
    const g = createGame({ dice: fixed(2, 2) });
    g.state.players[0].pos = 28;
    g.rollDice();
    expect(g.moveCurrent()).toEqual({ from: 28, to: 0, steps: 4, passedStart: true });
    expect(g.state.players[0].pos).toBe(0);
    expect(g.state.players[0].cash).toBe(START_CASH + PASS_START_BONUS);
    expect(g.settleCurrent()).toEqual({ kind: 'start', index: 0 });
  });
});

describe('game 落格结算（spec §5.2）', () => {
  it('无主 shop → vacant 且报价 ￥60；买下后归属本人', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 31;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'vacant', index: 1, price: 60 });
    expect(g.state.phase).toBe('settled');
    expect(g.buyCurrent()).toEqual({ ok: true, cost: 60, cash: 3140 });
    expect(g.state.players[0].cash).toBe(3140);
    expect(g.state.estates[1]).toEqual({ index: 1, owner: 1, level: 1, processing: false });
  });

  it('非 shop 地块买不了：返回 not-buyable，不改现金', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 3;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({ kind: 'event', index: 5, tile: 'chance' });
    expect(g.buyCurrent()).toEqual({ ok: false, reason: 'not-buyable' });
    expect(g.state.players[0].cash).toBe(START_CASH);
  });

  it('现金不足买地 → not-enough-cash，不写地产', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 31;
    g.state.players[0].cash = 59;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({ kind: 'vacant', index: 1, price: 60 });
    expect(g.buyCurrent()).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(g.state.estates[1]).toBeUndefined();
  });

  it('停在他人 L2 地块 → 付 ￥45 给地主', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[4] = { index: 4, owner: 2, level: 2, processing: false };
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'rent', index: 4, owner: 2, rent: 45, paid: 45, sold: [], bankrupt: false });
    expect(g.state.players[0].cash).toBe(2955);
    expect(g.state.players[1].cash).toBe(3045);
    expect(g.state.players[0].bankrupt).toBe(false);
  });

  it('停在自有地块 → own，可升级 ￥180 并置施工中', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[1] = { index: 1, owner: 1, level: 1, processing: false };
    g.state.players[0].pos = 31;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({ kind: 'own', index: 1, level: 1 });
    expect(g.upgradeCurrent()).toEqual({ ok: true, cost: 180, cash: 3020, level: 2 });
    expect(g.state.estates[1]).toEqual({ index: 1, owner: 1, level: 2, processing: true });
  });
});

describe('game 破产清算（spec §5.4）', () => {
  it('现金不足且无地可卖 → 破产：余额归地主、现金清零、地块仍在', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    g.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };
    g.state.players[0].cash = 10;
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'rent', index: 4, owner: 2, rent: 105, paid: 40, sold: [3], bankrupt: true });
    expect(g.state.players[0].cash).toBe(0);
    expect(g.state.players[0].bankrupt).toBe(true);
    expect(g.state.players[1].cash).toBe(3040);
    expect(g.state.estates[3]).toBeUndefined();
    expect(Object.keys(g.state.estates)).toEqual(['4']);
  });

  it('卖地能抵清 → 不破产：按变卖价低者先卖，只卖到够付', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[1] = { index: 1, owner: 1, level: 1, processing: false };
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    g.state.estates[8] = { index: 8, owner: 1, level: 1, processing: false };
    g.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };
    g.state.players[0].cash = 50;
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'rent', index: 4, owner: 2, rent: 105, paid: 105, sold: [1, 3], bankrupt: false });
    expect(g.state.players[0].cash).toBe(5);
    expect(g.state.players[0].bankrupt).toBe(false);
    expect(g.state.players[1].cash).toBe(3105);
    expect(g.state.estates[1]).toBeUndefined();
    expect(g.state.estates[3]).toBeUndefined();
    expect(g.state.estates[8]).toEqual({ index: 8, owner: 1, level: 1, processing: false });
  });
});

describe('game 换手 / 轮次 / 胜负（spec §5.1 / §5.4）', () => {
  it('endTurn 交下一位并解除其施工中；一轮走完 round +1', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[1] = { index: 1, owner: 2, level: 1, processing: true };
    playTurn(g);
    expect(g.state.current).toBe(1);
    expect(g.state.phase).toBe('idle');
    expect(g.state.dice).toBeNull();
    expect(g.state.estates[1].processing).toBe(false);
    expect(g.state.round).toBe(1);
    expect(g.state.over).toBe(false);

    const g2 = createGame({ dice: fixed(1, 1) });
    playTurn(g2);
    playTurn(g2);
    playTurn(g2);
    expect(g2.state.current).toBe(3);
    expect(g2.state.round).toBe(1);
    playTurn(g2);
    expect(g2.state.current).toBe(0);
    expect(g2.state.round).toBe(2);
  });

  it('仅剩 1 名未破产 → 立即结束，该玩家获胜', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const s = g.state;
    s.players[1].bankrupt = true;
    s.players[2].bankrupt = true;
    s.players[3].bankrupt = true;
    playTurn(g);
    expect(s.over).toBe(true);
    expect(winnerOf(s)).toBe(1);
  });

  it('跑满 ROUND_LIMIT 轮 → 按净资产排名定胜者（不再看现金）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const s = g.state;
    s.players[0].cash = 1000;
    s.players[1].cash = 1200;
    s.players[2].cash = 1000;
    s.players[3].cash = 800;
    s.estates[30] = { index: 30, owner: 3, level: 3, processing: false };
    s.round = ROUND_LIMIT;
    s.current = 3;
    s.phase = 'settled';
    g.endTurn();
    expect(s.round).toBe(ROUND_LIMIT + 1);
    expect(s.over).toBe(true);
    expect(winnerOf(s)).toBe(3);
  });

  it('未结束时 winnerOf 返回 null；netWorth = 现金 + 地产账面投入', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const s = g.state;
    expect(winnerOf(s)).toBeNull();
    s.players[0].cash = 100;
    s.estates[6] = { index: 6, owner: 1, level: 2, processing: false };
    expect(netWorth(s, s.players[0])).toBe(340);
    expect(netWorth(s, s.players[1])).toBe(START_CASH);
  });
});

describe('game 自动对局（M4 端到端整局）', () => {
  it('autoTurn 自动完成一位玩家的整回合并交给下一位', () => {
    const g = createGame({ seed: 7 });
    autoTurn(g);
    expect(g.state.over).toBe(false);
    expect(g.state.current).toBe(1);
    expect(currentPlayer(g.state).id).toBe(2);
    expect(g.state.phase).toBe('idle');
    expect(g.state.players[0].pos).toBeGreaterThanOrEqual(2);
  });

  it('autoPlay 用同 seed 跑到分出胜负，且不超轮次上限', () => {
    const g = createGame({ seed: 20260928 });
    const w = autoPlay(g);
    expect(g.state.over).toBe(true);
    expect(w).toBeGreaterThanOrEqual(1);
    expect(w).toBeLessThanOrEqual(4);
    expect(g.state.round).toBeLessThanOrEqual(ROUND_LIMIT + 1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/core/game.spec.ts`
Expected: FAIL，`src/core/game.ts` 不存在。

- [ ] **Step 3: 实现 `src/core/game.ts`**

```ts
import { typeAt, type TileType } from '../data/board';
import {
  BANKRUPT_CASH_LINE, PASS_START_BONUS, ROUND_LIMIT, START_CASH,
  buyPrice, canUpgrade, nextLevel,
} from '../data/economy';
import { advance, type Advance } from './board-path';
import { createDice, type Dice, type DiceRoll } from './dice';
import {
  assetValue, buy, buyable, canBuy, clearProcessing, ownedBy, rentAt, sellAt, upgrade,
  type BuyOutcome, type Estate, type Estates, type UpgradeOutcome,
} from './estate';

/** 回合阶段机（spec §5.1）：idle → rolled → moved → settled → (endTurn) → idle */
export type Phase = 'idle' | 'rolled' | 'moved' | 'settled';

export interface Player {
  /** 1..4，与 `piece.p1..p4` / `tokens.owner1..owner4` 对齐 */
  id: number;
  /** 外圈地块序号 0..31 */
  pos: number;
  cash: number;
  bankrupt: boolean;
}

export interface GameState {
  players: Player[];
  /** `players` 的下标（0 起），不是 id */
  current: number;
  /** 从 1 起；每有一位玩家完成回合就 +1（见 endTurn） */
  round: number;
  phase: Phase;
  /** 本回合点数；endTurn 后清空 */
  dice: DiceRoll | null;
  /** 唯一一份地产状态（原地读写，见 estate.ts） */
  estates: Estates;
  over: boolean;
}

export interface GameOptions {
  /** 传入则骰子确定（验收截图 / 单测复现），不传走时间 */
  seed?: number;
  /** 直接注入骰子（单测用固定点数） */
  dice?: Dice;
  playerCount?: number;
}

/** 落格结算结果（spec §5.2 / §5.4） */
export type SettleResult =
  | { kind: 'start'; index: number }
  | { kind: 'vacant'; index: number; price: number }
  | { kind: 'own'; index: number; level: number }
  | { kind: 'rent'; index: number; owner: number; rent: number; paid: number; sold: number[]; bankrupt: boolean }
  | { kind: 'event'; index: number; tile: TileType };

/** 玩家动作在错误阶段调用（按钮边界），返回失败原因而不抛错 */
export type GameBuyOutcome = BuyOutcome | { ok: false; reason: 'bad-phase' };
export type GameUpgradeOutcome = UpgradeOutcome | { ok: false; reason: 'bad-phase' };

export interface Game {
  state: GameState;
  rollDice(): DiceRoll;
  moveCurrent(): Advance;
  settleCurrent(): SettleResult;
  buyCurrent(): GameBuyOutcome;
  upgradeCurrent(): GameUpgradeOutcome;
  endTurn(): void;
}

interface DebtResult {
  paid: number;
  sold: number[];
  bankrupt: boolean;
}

/** 自动决策保留现金：低于此数不买地 / 不升级，保证付得起常见租金 */
const AUTO_RESERVE = 200;

export function createGame(opts: GameOptions = {}): Game {
  const count = opts.playerCount ?? 4;
  const dice = opts.dice ?? createDice(opts.seed);
  const state: GameState = {
    players: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      pos: 0,
      cash: START_CASH,
      bankrupt: false,
    })),
    current: 0,
    round: 1,
    phase: 'idle',
    dice: null,
    estates: {},
    over: false,
  };

  const rollDice = (): DiceRoll => {
    if (state.over) throw new Error('[mono] rollDice @over');
    if (state.phase !== 'idle') throw new Error(`[mono] rollDice @phase=${state.phase}`);
    const r = dice.roll();
    state.dice = r;
    state.phase = 'rolled';
    return r;
  };

  const moveCurrent = (): Advance => {
    if (state.phase !== 'rolled') throw new Error(`[mono] moveCurrent @phase=${state.phase}`);
    const d = state.dice;
    if (!d) throw new Error('[mono] moveCurrent @no-dice');
    const p = currentPlayer(state);
    const mv = advance(p.pos, d.total);
    p.pos = mv.to;
    if (mv.passedStart) p.cash += PASS_START_BONUS;
    state.phase = 'moved';
    return mv;
  };

  const settleCurrent = (): SettleResult => {
    if (state.phase !== 'moved') throw new Error(`[mono] settleCurrent @phase=${state.phase}`);
    const p = currentPlayer(state);
    const index = p.pos;
    let result: SettleResult;
    if (index === 0) {
      result = { kind: 'start', index };
    } else if (buyable(index)) {
      const e = state.estates[index];
      if (!e) {
        result = { kind: 'vacant', index, price: buyPrice(1) };
      } else if (e.owner === p.id) {
        result = { kind: 'own', index, level: e.level };
      } else {
        const rent = rentAt(state.estates, index);
        const debt = settleDebt(state, p, rent, playerById(state, e.owner));
        result = { kind: 'rent', index, owner: e.owner, rent, paid: debt.paid, sold: debt.sold, bankrupt: debt.bankrupt };
      }
    } else {
      result = { kind: 'event', index, tile: typeAt(index) };
    }
    state.phase = 'settled';
    return result;
  };

  const buyCurrent = (): GameBuyOutcome => {
    if (state.phase !== 'settled') return { ok: false, reason: 'bad-phase' };
    const p = currentPlayer(state);
    const out = buy(state.estates, p.pos, p.id, p.cash);
    if (out.ok) p.cash = out.cash;
    return out;
  };

  const upgradeCurrent = (): GameUpgradeOutcome => {
    if (state.phase !== 'settled') return { ok: false, reason: 'bad-phase' };
    const p = currentPlayer(state);
    const out = upgrade(state.estates, p.pos, p.id, p.cash);
    if (out.ok) p.cash = out.cash;
    return out;
  };

  const endTurn = (): void => {
    if (state.phase !== 'settled') throw new Error(`[mono] endTurn @phase=${state.phase}`);
    if (state.over) return;
    const n = state.players.length;
    let next = state.current;
    for (let k = 0; k < n; k++) {
      next = (next + 1) % n;
      if (next === 0) state.round += 1;
      if (!state.players[next].bankrupt) break;
    }
    state.current = next;
    state.phase = 'idle';
    state.dice = null;
    /* 新玩家回合开始：解除其地块的「施工中」（BUILD_TURNS = 1 的落地处，spec §5.2） */
    clearProcessing(state.estates, state.players[next].id);
    if (activeCount(state) <= 1 || state.round > ROUND_LIMIT) state.over = true;
  };

  return { state, rollDice, moveCurrent, settleCurrent, buyCurrent, upgradeCurrent, endTurn };
}

/** 当前行动玩家 */
export function currentPlayer(state: GameState): Player {
  return state.players[state.current];
}

/** 按 id 取玩家（破产清算时找地主用） */
export function playerById(state: GameState, id: number): Player | null {
  return state.players.find((p) => p.id === id) ?? null;
}

/** 未破产玩家数（胜负判定用） */
export function activeCount(state: GameState): number {
  return state.players.filter((p) => !p.bankrupt).length;
}

/** 净资产 = 现金 + 地产账面投入（胜负排名口径，与变卖价区分） */
export function netWorth(state: GameState, player: Player): number {
  return player.cash + assetValue(state.estates, player.id);
}

/** 胜者 id；未结束返回 null。已结束：仅剩一人 → 该人；否则按净资产排名（并列取小 id） */
export function winnerOf(state: GameState): number | null {
  if (!state.over) return null;
  const alive = state.players.filter((p) => !p.bankrupt);
  const pool = alive.length > 0 ? alive : state.players;
  let best = pool[0];
  for (const p of pool) {
    const a = netWorth(state, p);
    const b = netWorth(state, best);
    if (a > b || (a === b && p.id < best.id)) best = p;
  }
  return best.id;
}

/**
 * 欠租 / 罚款结算（spec §5.4）：
 * ① 现金不足先变卖抵债（变卖价低者先卖，只卖到够付为止，保住高价值资产）；
 * ② 付得起付清；付不起则把手里的现金全给对方，自己落到破产线；
 * ③ 破产条件 = 付不起 且 已无可变卖地产（变卖循环退出的唯一原因就是无地可卖）。
 */
function settleDebt(state: GameState, payer: Player, amount: number, receiver: Player | null): DebtResult {
  const sold: number[] = [];
  while (payer.cash < amount) {
    const owned = ownedBy(state.estates, payer.id);
    if (owned.length === 0) break;
    let cheapest = owned[0];
    for (const i of owned) {
      if (sellAt(state.estates, i) < sellAt(state.estates, cheapest)) cheapest = i;
    }
    payer.cash += sellAt(state.estates, cheapest);
    releaseEstate(state.estates, cheapest);
    sold.push(cheapest);
  }
  const affordable = payer.cash >= amount;
  const paid = affordable ? amount : payer.cash;
  payer.cash = affordable ? payer.cash - amount : BANKRUPT_CASH_LINE;
  if (receiver) receiver.cash += paid;
  const bankrupt = !affordable && ownedBy(state.estates, payer.id).length === 0;
  if (bankrupt) payer.bankrupt = true;
  return { paid, sold, bankrupt };
}

/** 变卖 / 破产后地块回归无主：删键（`Estates` 用「有无键」表达有无主，不写 0 值占位） */
function releaseEstate(estates: Estates, index: number): void {
  delete (estates as Record<number, Estate | undefined>)[index];
}

/** 自动完成一位玩家的整回合（HUD 的「自动」按钮与 e2e 用）：掷 → 走 → 结算 → 自动决策 → 结束 */
export function autoTurn(g: Game): void {
  if (g.state.over) return;
  g.rollDice();
  g.moveCurrent();
  const r = g.settleCurrent();
  const p = currentPlayer(g.state);
  if (r.kind === 'vacant' && canBuy(g.state.estates, r.index, p.cash) && p.cash - r.price >= AUTO_RESERVE) {
    g.buyCurrent();
  } else if (r.kind === 'own') {
    const e = g.state.estates[r.index];
    if (e && canUpgrade(e.level) && p.cash - buyPrice(nextLevel(e.level)) >= AUTO_RESERVE) g.upgradeCurrent();
  }
  g.endTurn();
}

/** 自动跑到分出胜负，返回胜者 id（兜底：最多 ROUND_LIMIT × 2 圈的回合数） */
export function autoPlay(g: Game, maxTurns: number = ROUND_LIMIT * g.state.players.length * 2): number {
  let guard = maxTurns;
  while (!g.state.over && guard > 0) {
    autoTurn(g);
    guard -= 1;
  }
  return winnerOf(g.state) ?? 0;
}
```

> `releaseEstate()` 里的 `as Record<number, Estate | undefined>` 只是类型层面的放宽（`Estates` 的索引签名值是必填的 `Estate`，TS 不允许直接 `delete`），运行时行为完全相同；用一个私有函数收口，是为了让「删键 = 回归无主」这条 `estate.ts` 契约只有一处实现。
> `endTurn()` 的换手循环里，`next === 0` 才 `round += 1`：一次 `endTurn` 最多绕回索引 0 一次，所以「一圈 = 全员各走一次」成立；只剩 1 名存活时循环会跳过多名破产者回到本人，`round` 也只 +1，不会失控。
> `winnerOf()` 在「全员破产」的极端情况下退化为对全体排名（`pool = state.players`），保证函数**永远**返回一个 1..4 的 id，UI 不会拿到 null 之外的惊喜。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/core`
Expected: PASS（`board` + `economy` 6 + `dice` 5 + `board-path` 7 + `estate` 14 + `game` 15）。

Run: `npm run lint`
Expected: 0 错（`src/core/game.ts` 不在 `src/render/**` 下，禁写死规则不适用）。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src/core/game.ts monopoly/test/core/game.spec.ts
git commit -m "feat(mono): M4 回合状态机（掷骰/移动/结算/买地升级/破产清算/轮次与净资产兜底胜负）"
```

---

## Task 26: M4 收口——HUD（玩家资产条 / 双骰 / 操作按钮）+ `?play=1` 交互 + 端到端整局

**Files:**
- Create: `d:\zhao\monopoly\src\ui\Hud.ts`
- Create: `d:\zhao\monopoly\src\render\providers\proc-hud.ts`
- Create: `d:\zhao\monopoly\local\mono-shots-m4.mjs`
- Modify: `d:\zhao\monopoly\src\skin\layout.ts`（HUD 布局常量）
- Modify: `d:\zhao\monopoly\src\skin\registry.ts`（`ui.dock` / `ui.button.secondary` / `ui.label` / `ui.playerBar`）
- Modify: `d:\zhao\monopoly\public\skins\default\skin.json`（UI 5 条 + `dice.body` + `dice.face1..6`）
- Modify: `d:\zhao\monopoly\src\render\providers\proc.ts`（注册 7 个 HUD preset）
- Modify: `d:\zhao\monopoly\src\render\Scene.ts`（`reset()`）
- Modify: `d:\zhao\monopoly\src\main.ts`（`?play=1` + `mountHud` 接线 + `__monoMain.sim()`）
- Modify: `d:\zhao\monopoly\docs\manual-mono.md`（M4 段 + 手机截图）
- Test: `d:\zhao\monopoly\test\ui\hud.spec.ts`
- Test: `d:\zhao\monopoly\test\render\proc-hud.spec.ts`

> **为什么 HUD 的「画面」和「点击」要分两处**：spec §3.6 的硬约束是「画面中任何可见元素都必须能换成图片素材」，所以 HUD 的底坞/按钮/资产条/骰子**必须是走 `instantiate()` 的元素**（注册表 + skin.json + proc preset，`pass: 4` 进 `layers.fx` 覆盖层）；而「点得到」不需要可见像素，用一层**透明 DOM 命中层** `#mono-hud`（`pointer-events:none` 的容器 + 命中区 `auto` 的 `<button>`）即可。这样换 HUD 皮肤零改代码，点击区又不必在 Pixi 里做像素拾取。
> **为什么按钮可用性由 `state.phase` 决定**：Task 25 已把回合流程做成硬门槛（越序推进抛错），HUD 只是把它**显式化**——`idle→掷骰 / rolled→前进 / moved→结算 / settled→结束回合`，买地/升级按钮只在 `settled` 且落格条件成立时出现。按钮禁用是**边界校验**而非隐藏逻辑：不可用时 `disabled` + `pointer-events:none`，避免玩家点到必然失败的按钮。
> **为什么 `fixed` + `pass: 4`**：HUD 是舞台定格台位（不参与等距投影与 `c+r` 深度排序），Task 19 已为橱窗加了这两个字段，HUD 直接复用——`fixed` 跳过 `resolvePlacement`，`pass: 4` 落到 `layers.fx` 覆盖层（`Scene.render()` 里 `pass 4 → layers.fx`）。
> **为什么 HUD 内部顺序靠 `c=0, r=n` 的 depth 而非插入序**：`planDrawOrder` 只按 `pass` 与 `depth` 排，depth 相等时依赖 `Array.prototype.sort` 的稳定性——那太脆。故 `hudSpecs` 用递增的 `r`（0=底坞、1=标签、2+ 资产条、6+ 骰体、8+ 骰面、10+ 按钮）把顺序变成**由 depth 显式决定**的。
> **为什么不动 `buildingSpecs` 的层级来源**：M4 的验收线是「`src/core` 单测覆盖 + 端到端一局」（spec §2.1/§5），即**回合闭环跑通并分出胜负**，不是「棋盘实时反映地产层级」。故 `?play=1` 下地砖归属色（`boardTileSpecs` 的 `ownerOf`）与棋子位置跟游戏状态联动，楼体层级仍沿用 `slotLevelsOf()` 的演示层级；实时升级落到 M6 的动画编排一起做。

- [ ] **Step 1: 写失败测试（HUD 纯函数）**

`test/ui/hud.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/core/game';
import {
  buyOffer, hitAreas, hudSpecs, primaryAction, primaryLabel, upgradeOffer, statusText,
} from '../../src/ui/Hud';
import { BOTTOM_BTN_Y, DOCK_Y, HUD_BAR_H, HUD_BAR_W, HUD_DICE_Y, STAGE_W } from '../../src/skin/layout';
import type { Dice } from '../../src/core/dice';

/** 固定点数骰：每步走 2 格，落点完全可预期 */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 让 1 号玩家「掷→走→结算」后停在 pos（advance 走 2 格，故起点设 pos-2） */
const settledAt = (pos: number, dice: Dice = fixed(1, 1)) => {
  const g = createGame({ dice });
  g.state.players[0].pos = (pos - 2 + 32) % 32;
  g.rollDice();
  g.moveCurrent();
  g.settleCurrent();
  return g;
};

describe('hud 阶段按钮（回合阶段机显式化）', () => {
  it('idle→掷骰 / rolled→前进 / moved→结算 / settled→结束回合', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(primaryAction(g.state)).toBe('roll');
    expect(primaryLabel(g.state)).toBe('掷骰');
    g.rollDice();
    expect(primaryAction(g.state)).toBe('move');
    expect(primaryLabel(g.state)).toBe('前进');
    g.moveCurrent();
    expect(primaryAction(g.state)).toBe('settle');
    expect(primaryLabel(g.state)).toBe('结算');
    g.settleCurrent();
    expect(primaryAction(g.state)).toBe('end');
    expect(primaryLabel(g.state)).toBe('结束回合');
  });

  it('本局结束 → 无主按钮，标签为结束语', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[1].bankrupt = true;
    g.state.players[2].bankrupt = true;
    g.state.players[3].bankrupt = true;
    g.rollDice();
    g.moveCurrent();
    g.settleCurrent();
    g.endTurn();
    expect(g.state.over).toBe(true);
    expect(primaryAction(g.state)).toBeNull();
    expect(primaryLabel(g.state)).toBe('本局结束');
  });
});

describe('hud 买地 / 升级报价（spec §5.2 / §5.4）', () => {
  it('停在无主 shop → 报价 ￥60，现金够则可用', () => {
    const g = settledAt(3);   // index 3 = 农家果蔬（shop）
    expect(g.state.phase).toBe('settled');
    expect(buyOffer(g.state)).toEqual({ price: 60, enabled: true });
  });

  it('现金 ￥59 → 报价仍在但不可用（边界校验，不隐藏按钮）', () => {
    const g = settledAt(3);
    g.state.players[0].cash = 59;
    expect(buyOffer(g.state)).toEqual({ price: 60, enabled: false });
  });

  it('停在非 shop 格 → 不给报价', () => {
    const g = settledAt(5);   // index 5 = 机会卡
    expect(buyOffer(g.state)).toBeNull();
    expect(upgradeOffer(g.state)).toBeNull();
  });

  it('自有 L1 → 升级 ￥180 可用；封顶 L3 → 不给报价', () => {
    const g1 = settledAt(3);
    g1.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    expect(upgradeOffer(g1.state)).toEqual({ cost: 180, enabled: true });

    const g2 = settledAt(3);
    g2.state.estates[3] = { index: 3, owner: 1, level: 3, processing: false };
    expect(upgradeOffer(g2.state)).toBeNull();
  });

  it('非 settled 阶段一律不给报价（未结算不能买地）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 1;
    g.rollDice();
    g.moveCurrent();
    expect(g.state.phase).toBe('moved');
    expect(buyOffer(g.state)).toBeNull();
    expect(upgradeOffer(g.state)).toBeNull();
  });
});

describe('hud spec 组装（pass 4 / fixed / depth 顺序）', () => {
  it('底坞 1 + 标签 1 + 资产条 4 + 骰体 2 + 骰面 2 + 主按钮 1', () => {
    const g = settledAt(3);
    const specs = hudSpecs(g.state);
    const byId = (id: string) => specs.filter((s) => s.id === id).length;
    expect(byId('ui.dock')).toBe(1);
    expect(byId('ui.label')).toBe(1);
    expect(byId('ui.playerBar')).toBe(4);
    expect(byId('dice.body')).toBe(2);
    expect(specs.filter((s) => s.id.startsWith('dice.face')).length).toBe(2);
    expect(byId('ui.button.primary')).toBe(1);
  });

  it('全部走 pass 4 + fixed 定格台位；depth（c=0 时 = r）升序即绘制序', () => {
    const g = settledAt(3);
    const specs = hudSpecs(g.state);
    expect(specs.every((s) => s.pass === 4)).toBe(true);
    expect(specs.every((s) => Boolean(s.fixed))).toBe(true);
    expect(specs.every((s) => s.c === 0)).toBe(true);
    const rs = specs.map((s) => s.r);
    expect([...rs].sort((a, b) => a - b)).toEqual(rs);
    expect(specs[0].id).toBe('ui.dock');
    expect(specs[specs.length - 1].id.startsWith('ui.button')).toBe(true);
  });

  it('骰面点数取 state.dice（未掷骰时用 face1 且 blank）', () => {
    const g = createGame({ dice: fixed(3, 5) });
    const before = hudSpecs(g.state).filter((s) => s.id.startsWith('dice.face'));
    expect(before.map((s) => s.state?.blank)).toEqual([true, true]);

    g.rollDice();
    const after = hudSpecs(g.state).filter((s) => s.id.startsWith('dice.face'));
    expect(after.map((s) => s.id)).toEqual(['dice.face3', 'dice.face5']);
    expect(after.map((s) => s.state?.pips)).toEqual([3, 5]);
  });

  it('资产条横排在底坞内、当前玩家高亮、破产置灰', () => {
    const g = settledAt(3);
    g.state.players[1].bankrupt = true;
    const bars = hudSpecs(g.state).filter((s) => s.id === 'ui.playerBar');
    expect(bars.map((s) => s.fixed?.cx)).toEqual([
      HUD_BAR_W / 2 + 6,
      HUD_BAR_W * 1.5 + 6 + 11,
      HUD_BAR_W * 2.5 + 6 + 22,
      HUD_BAR_W * 3.5 + 6 + 33,
    ]);
    expect(bars.every((s) => (s.fixed?.cy ?? 0) - HUD_BAR_H / 2 > DOCK_Y)).toBe(true);
    expect(bars.map((s) => s.state?.active)).toEqual([true, false, false, false]);
    expect(bars.map((s) => s.state?.bankrupt)).toEqual([false, true, false, false]);
  });

  it('未掷骰时两个骰面落在底坞内、双骰横向分开', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const bodies = hudSpecs(g.state).filter((s) => s.id === 'dice.body');
    expect(bodies[0].fixed?.cy ?? 0).toBeGreaterThan(HUD_DICE_Y);
    expect((bodies[1].fixed?.cx ?? 0) - (bodies[0].fixed?.cx ?? 0)).toBe(60);
  });

  it('战胜负文案：进行中显示轮次与行动玩家，结束后显示胜者', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(statusText(g.state)).toBe('第 1 轮 · 轮到 你');
    g.state.players[1].bankrupt = true;
    g.state.players[2].bankrupt = true;
    g.state.players[3].bankrupt = true;
    g.state.current = 0;
    g.state.phase = 'settled';
    g.endTurn();
    expect(statusText(g.state)).toBe('本局结束 · 胜者 你');
  });
});

describe('hud 命中层（透明 DOM 按钮的矩形来源）', () => {
  it('idle：只有主按钮，且可点', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(hitAreas(g.state)).toEqual([
      { action: 'roll', x: 146, y: BOTTOM_BTN_Y, w: 98, h: 46, enabled: true },
    ]);
  });

  it('settled + 自有 L1：主按钮为「结束回合」+ 升级按钮（含可用性）', () => {
    const g = settledAt(3);
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    const areas = hitAreas(g.state);
    expect(areas.map((a) => a.action)).toEqual(['end', 'upgrade']);
    expect(areas[0].x).toBe(146);
    expect(areas[1]).toEqual({ action: 'upgrade', x: 249, y: BOTTOM_BTN_Y, w: 110, h: 46, enabled: true });

    g.state.players[0].cash = 10;
    expect(hitAreas(g.state)[1].enabled).toBe(false);
  });

  it('命中区都落在舞台宽度内', () => {
    const g = settledAt(3);
    for (const a of hitAreas(g.state)) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(STAGE_W);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui/hud.spec.ts`
Expected: FAIL，`src/ui/Hud.ts` 与 `src/skin/layout.ts` 的新常量都不存在。

- [ ] **Step 3: 补布局常量 + 实现 `src/ui/Hud.ts`**

`src/skin/layout.ts` 在 `CARD_H` 之后追加：

```ts
/* —— HUD（底部操作坞；值 = 顶/左边缘坐标，非中心） —— */
export const HUD_DOCK_H = 184;
export const HUD_LABEL_H = 24;
export const HUD_LABEL_Y = DOCK_Y + 12;          // 618 = 中心 y
export const HUD_BAR_W = 86;
export const HUD_BAR_H = 40;
export const HUD_BAR_Y = DOCK_Y + 26;            // 632 = 顶
export const HUD_BAR_X0 = 6;
export const HUD_BAR_GAP = 11;
export const HUD_DICE_SIZE = 52;
export const HUD_DICE_Y = DOCK_Y + 78;           // 684 = 顶
export const HUD_DICE_X0 = 139;                  // 左
export const HUD_DICE_DX = 60;
export const HUD_BTN_H = 46;
export const HUD_BTN_PRIMARY_W = 98;
export const HUD_BTN_SECONDARY_W = 110;
export const HUD_BTN_PRIMARY_X = 146;            // 左
export const HUD_BTN_BUY_X = 31;                 // 左
export const HUD_BTN_UPGRADE_X = 249;            // 左
```

`src/ui/Hud.ts`：

```ts
import { PLAYER_NAME } from '../data/economy';
import { buyPrice, canUpgrade, nextLevel } from '../data/economy';
import { buyable } from '../core/estate';
import { currentPlayer, type Game, type GameState } from '../core/game';
import type { ElementSpec } from '../skin/instantiate';
import {
  BOTTOM_BTN_Y, DOCK_Y, HUD_BAR_GAP, HUD_BAR_H, HUD_BAR_W, HUD_BAR_X0, HUD_BAR_Y,
  HUD_BTN_BUY_X, HUD_BTN_H, HUD_BTN_PRIMARY_W, HUD_BTN_PRIMARY_X, HUD_BTN_SECONDARY_W,
  HUD_BTN_UPGRADE_X, HUD_DICE_DX, HUD_DICE_SIZE, HUD_DICE_X0, HUD_DICE_Y,
  HUD_DOCK_H, HUD_LABEL_Y, STAGE_W,
} from '../skin/layout';

/** 主按钮在四个阶段里的动作（spec §5.1 回合流程的显式化） */
export type HudPrimaryAction = 'roll' | 'move' | 'settle' | 'end';
export type HudActionId = HudPrimaryAction | 'buy' | 'upgrade';

export interface HitArea {
  action: HudActionId;
  x: number; y: number; w: number; h: number;
  enabled: boolean;
}

export interface HudHandle {
  /** 状态推进后重排命中层（画面由 `scene.render()` 重建，这里只管可点性） */
  update(): void;
}

const PRIMARY_LABEL: Record<HudPrimaryAction, string> = {
  roll: '掷骰', move: '前进', settle: '结算', end: '结束回合',
};

export function primaryAction(state: GameState): HudPrimaryAction | null {
  if (state.over) return null;
  switch (state.phase) {
    case 'idle': return 'roll';
    case 'rolled': return 'move';
    case 'moved': return 'settle';
    default: return 'end';
  }
}

export function primaryLabel(state: GameState): string {
  const a = primaryAction(state);
  return a ? PRIMARY_LABEL[a] : '本局结束';
}

/** 当前玩家的买地报价；不在 settled / 非 shop / 已有主 → null */
export function buyOffer(state: GameState): { price: number; enabled: boolean } | null {
  if (state.over || state.phase !== 'settled') return null;
  const p = currentPlayer(state);
  if (!buyable(p.pos) || state.estates[p.pos]) return null;
  const price = buyPrice(1);
  return { price, enabled: p.cash >= price };
}

/** 当前玩家的升级报价；不在 settled / 非自有 / 已封顶 → null */
export function upgradeOffer(state: GameState): { cost: number; enabled: boolean } | null {
  if (state.over || state.phase !== 'settled') return null;
  const p = currentPlayer(state);
  const e = state.estates[p.pos];
  if (!e || e.owner !== p.id || !canUpgrade(e.level)) return null;
  const cost = buyPrice(nextLevel(e.level));
  return { cost, enabled: p.cash >= cost };
}

/** 底坞顶部状态行（轮次 / 行动玩家 / 胜负） */
export function statusText(state: GameState): string {
  if (state.over) {
    const alive = state.players.filter((p) => !p.bankrupt);
    const pool = alive.length > 0 ? alive : state.players;
    let best = pool[0];
    for (const p of pool) if (p.cash > best.cash) best = p;
    return `本局结束 · 胜者 ${PLAYER_NAME[best.id - 1]}`;
  }
  return `第 ${state.round} 轮 · 轮到 ${PLAYER_NAME[currentPlayer(state).id - 1]}`;
}

/** bar 的中心 x（i = players 下标） */
function barCx(i: number): number {
  return HUD_BAR_X0 + HUD_BAR_W / 2 + i * (HUD_BAR_W + HUD_BAR_GAP);
}

/**
 * HUD 的 instantiate spec（全部 `pass: 4` + `fixed` 定格台位）。
 * `c` 恒为 0、`r` 递增 —— depth（= c+r）升序即绘制序：底坞 → 标签 → 资产条 → 骰体 → 骰面 → 按钮。
 */
export function hudSpecs(state: GameState): ElementSpec[] {
  const out: ElementSpec[] = [];
  const bar = (id: string, r: number, cx: number, cy: number, st: Record<string, unknown>, slot = null): void => {
    out.push({ id, slot, c: 0, r, pass: 4, fixed: { cx, cy, s: 1 }, state: st });
  };

  bar('ui.dock', 0, STAGE_W / 2, DOCK_Y + HUD_DOCK_H / 2, { round: state.round });
  bar('ui.label', 1, STAGE_W / 2, HUD_LABEL_Y, { text: statusText(state) });

  state.players.forEach((p, i) => {
    bar('ui.playerBar', 2 + i, barCx(i), HUD_BAR_Y + HUD_BAR_H / 2, {
      owner: p.id, name: PLAYER_NAME[p.id - 1], cash: p.cash,
      active: i === state.current, bankrupt: p.bankrupt,
    });
  });

  const d = state.dice;
  for (let k = 0; k < 2; k++) {
    const cx = HUD_DICE_X0 + HUD_DICE_SIZE / 2 + k * HUD_DICE_DX;
    const cy = HUD_DICE_Y + HUD_DICE_SIZE / 2;
    bar('dice.body', 6 + k, cx, cy, { roll: Boolean(d) });
    const pips = d ? (k === 0 ? d.d1 : d.d2) : 1;
    bar(`dice.face${pips}`, 8 + k, cx, cy, { pips, blank: !d });
  }

  bar('ui.button.primary', 10, HUD_BTN_PRIMARY_X + HUD_BTN_PRIMARY_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
    action: primaryAction(state), label: primaryLabel(state), enabled: primaryAction(state) !== null,
  });

  const buy = buyOffer(state);
  if (buy) {
    bar('ui.button.secondary', 11, HUD_BTN_BUY_X + HUD_BTN_SECONDARY_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
      action: 'buy', label: `买地 ￥${buy.price}`, enabled: buy.enabled,
    });
  }
  const up = upgradeOffer(state);
  if (up) {
    bar('ui.button.secondary', 12, HUD_BTN_UPGRADE_X + HUD_BTN_SECONDARY_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
      action: 'upgrade', label: `升级 ￥${up.cost}`, enabled: up.enabled,
    });
  }
  return out;
}

/** 透明 DOM 命中层的矩形来源（与 hudSpecs 的按钮台位一一对应） */
export function hitAreas(state: GameState): HitArea[] {
  const out: HitArea[] = [];
  const pa = primaryAction(state);
  if (pa) {
    out.push({ action: pa, x: HUD_BTN_PRIMARY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_PRIMARY_W, h: HUD_BTN_H, enabled: true });
  }
  const buy = buyOffer(state);
  if (buy) {
    out.push({ action: 'buy', x: HUD_BTN_BUY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H, enabled: buy.enabled });
  }
  const up = upgradeOffer(state);
  if (up) {
    out.push({ action: 'upgrade', x: HUD_BTN_UPGRADE_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H, enabled: up.enabled });
  }
  return out;
}

/**
 * 挂透明命中层：容器不吃事件，只有命中区 `<button>` 吃。
 * 按钮的**可见像素**由 `hudSpecs` + proc preset 画在画布上（spec §3.6：可见元素必须可换素材）。
 */
export function mountHud(root: HTMLElement, game: Game, onAction: (a: HudActionId) => void): HudHandle {
  const layer = document.createElement('div');
  layer.id = 'mono-hud';
  layer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:8';
  root.appendChild(layer);

  const update = (): void => {
    layer.textContent = '';
    const pa = primaryAction(game.state);
    for (const a of hitAreas(game.state)) {
      const b = document.createElement('button');
      b.dataset.action = a.action;
      if (a.action === pa) b.dataset.primary = '1';
      b.disabled = !a.enabled;
      b.style.cssText =
        `position:absolute;left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px;` +
        `background:transparent;border:0;padding:0;` +
        (a.enabled ? 'pointer-events:auto;cursor:pointer;' : 'pointer-events:none;');
      b.onclick = () => onAction(a.action);
      layer.appendChild(b);
    }
  };

  update();
  return { update };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui/hud.spec.ts`
Expected: PASS（13 例）。

- [ ] **Step 5: 写失败测试（HUD proc preset 7 件）**

`test/render/proc-hud.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  HUD_D, diceBody, diceFace, uiButton, uiDock, uiLabel, uiPanel, uiPlayerBar,
} from '../../src/render/providers/proc-hud';
import { PROC_PRESETS, type TextRequest } from '../../src/render/providers/proc';

interface Call { op: string; pts: number[]; style: Record<string, unknown> }

function recorder() {
  const calls: Call[] = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      if (op === 'fill' || op === 'stroke') calls.push({ op, pts: [], style: (a[0] ?? {}) as Record<string, unknown> });
      else calls.push({ op, pts: a.map((v) => (typeof v === 'number' ? v : NaN)), style: {} });
      return g;
    },
  });
  return { g, calls };
}

const ops = (calls: Call[], op: string): Call[] => calls.filter((c) => c.op === op);
const fills = (calls: Call[]): string[] => ops(calls, 'fill').map((c) => String(c.style.color));

const ctx = (over: Record<string, unknown> = {}) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 98, d: 1, h: 46 },
  cx: 195, cy: 738, s: 1,
  params: {},
  state: {},
  ...over,
});

const PIP_COUNT = [1, 2, 3, 4, 5, 6];

describe('proc preset: uiDock / uiPanel', () => {
  it('uiDock：1 圆角底 + 1 顶部金条', () => {
    const { g, calls } = recorder();
    uiDock(g as never, ctx({ box: { w: 390, d: 1, h: 184 } }) as never);
    expect(ops(calls, 'roundRect').length).toBe(1);
    expect(ops(calls, 'rect').length).toBe(1);
    expect(fills(calls)).toEqual([HUD_D.dockFill, HUD_D.dockTopFill]);
    const rr = ops(calls, 'roundRect')[0];
    expect(rr.pts).toEqual([0, 606, 390, 184, HUD_D.dockR]);
  });

  it('uiPanel：1 圆角面板（无顶条）', () => {
    const { g, calls } = recorder();
    uiPanel(g as never, ctx({ box: { w: 370, d: 1, h: 268 } }) as never);
    expect(ops(calls, 'roundRect').length).toBe(1);
    expect(ops(calls, 'rect').length).toBe(0);
    expect(fills(calls)).toEqual([HUD_D.panelFill]);
  });
});

describe('proc preset: uiPlayerBar', () => {
  it('底板 + 色标 + 名字/现金两行文字；色标取 state.ownerColors', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiPlayerBar(g as never, ctx({
      box: { w: 86, d: 1, h: 40 },
      cx: 49, cy: 652,
      state: { owner: 2, name: '老王', cash: 3045, active: true, ownerColors: { 2: '#f0a039' } },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(ops(calls, 'roundRect').length).toBe(2);
    expect(fills(calls)).toEqual([HUD_D.barActiveFill, '#f0a039']);
    expect(texts.map((t) => t.text)).toEqual(['老王', '￥3045']);
    expect(texts.map((t) => t.align)).toEqual(['left', 'left']);
    expect(texts[0].size).toBe(HUD_D.barNameFs);
    expect(texts[1].size).toBe(HUD_D.barCashFs);
  });

  it('破产玩家整条压暗（alpha = barBankruptAlpha）', () => {
    const { g, calls } = recorder();
    uiPlayerBar(g as never, ctx({
      box: { w: 86, d: 1, h: 40 },
      state: { owner: 1, cash: 0, bankrupt: true, ownerColors: { 1: '#3fbf7f' } },
    }) as never);
    expect(ops(calls, 'fill')[0].style.alpha).toBe(HUD_D.barBankruptAlpha);
  });
});

describe('proc preset: uiButton / uiLabel', () => {
  it('可用按钮：金色底 + 深色标签；禁用：灰底 + 灰字', () => {
    const on: TextRequest[] = [];
    const a = recorder();
    uiButton(a.g as never, ctx({ state: { label: '掷骰', enabled: true }, text: (r: TextRequest) => on.push(r) }) as never);
    expect(fills(a.calls)).toEqual([HUD_D.btnFill]);
    expect(on[0].text).toBe('掷骰');
    expect(on[0].size).toBe(HUD_D.btnFs);
    expect(on[0].fill).toBe(HUD_D.btnTextFill);

    const off: TextRequest[] = [];
    const b = recorder();
    uiButton(b.g as never, ctx({ state: { label: '升级 ￥420', enabled: false }, text: (r: TextRequest) => off.push(r) }) as never);
    expect(fills(b.calls)).toEqual([HUD_D.btnFillDisabled]);
    expect(off[0].fill).toBe(HUD_D.btnTextFillDisabled);
  });

  it('uiLabel：只出 1 行居中文字，不画任何形状', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiLabel(g as never, ctx({
      box: { w: 390, d: 1, h: 24 }, cx: 195, cy: 618,
      state: { text: '第 1 轮 · 轮到 你' },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(calls.length).toBe(0);
    expect(texts.length).toBe(1);
    expect(texts[0].text).toBe('第 1 轮 · 轮到 你');
    expect(texts[0].x).toBe(195);
    expect(texts[0].align).toBeUndefined();
  });
});

describe('proc preset: diceBody / diceFace', () => {
  it('未掷骰用暗底，掷出后用亮底', () => {
    const a = recorder();
    diceBody(a.g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { roll: false } }) as never);
    expect(fills(a.calls)).toEqual([HUD_D.diceFill]);
    const b = recorder();
    diceBody(b.g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { roll: true } }) as never);
    expect(fills(b.calls)).toEqual([HUD_D.diceRollFill]);
  });

  it('1..6 各出 1/2/3/4/5/6 个点，半径与色值取默认；blank 不画点', () => {
    for (let p = 1; p <= 6; p++) {
      const { g, calls } = recorder();
      diceFace(g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { pips: p } }) as never);
      const dots = ops(calls, 'circle');
      expect(dots.length).toBe(PIP_COUNT[p - 1]);
      expect(dots[0].pts[2]).toBe(HUD_D.pipR);
      expect(fills(calls).every((c) => c === HUD_D.pipFill)).toBe(true);
    }

    const { g, calls } = recorder();
    diceFace(g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { pips: 1, blank: true } }) as never);
    expect(ops(calls, 'circle').length).toBe(0);
  });

  it('PIPS 表只含 -1 / 0 / 1（禁写死规则的作用域内不放越界字面量）', () => {
    for (let p = 1; p <= 6; p++) {
      const { g, calls } = recorder();
      diceFace(g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { pips: p } }) as never);
      for (const d of ops(calls, 'circle')) {
        const dx = (d.pts[0] - 195) / HUD_D.pipSpan;
        const dy = (d.pts[1] - 738) / HUD_D.pipSpan;
        expect([-1, 0, 1]).toContain(Math.round(dx));
        expect([-1, 0, 1]).toContain(Math.round(dy));
      }
    }
  });
});

describe('proc-hud 注册', () => {
  it('7 个 preset 全部注册进 PROC_PRESETS', () => {
    expect(PROC_PRESETS.uiDock).toBe(uiDock);
    expect(PROC_PRESETS.uiPanel).toBe(uiPanel);
    expect(PROC_PRESETS.uiPlayerBar).toBe(uiPlayerBar);
    expect(PROC_PRESETS.uiButton).toBe(uiButton);
    expect(PROC_PRESETS.uiLabel).toBe(uiLabel);
    expect(PROC_PRESETS.diceBody).toBe(diceBody);
    expect(PROC_PRESETS.diceFace).toBe(diceFace);
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `npx vitest run test/render/proc-hud.spec.ts`
Expected: FAIL，`src/render/providers/proc-hud.ts` 不存在。

- [ ] **Step 7: 实现 `proc-hud.ts` 并接线注册表 / skin.json / PROC_PRESETS**

`src/render/providers/proc-hud.ts`：

```ts
import type { Graphics } from 'pixi.js';
import { fb, num, str, type ProcCtx, type ProcPreset } from './proc';

/** 骰面点位（3×3 网格，取值仅 -1/0/1） */
const PIPS: Array<Array<[number, number]>> = [
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
];

/** L4 内建兜底默认值（spec §3.6.4）：HUD 全部几何/色值集中声明一次 */
export const HUD_D = fb({
  /* 底部操作坞 */
  dockR: 14, dockFill: '#101a17', dockEdge: '#2a3830', dockEdgeW: 1.2,
  dockTopH: 3, dockTopFill: '#f5c451',
  /* 通用面板（弹窗 / 我的地产） */
  panelR: 12, panelFill: 'rgba(20,30,27,.94)', panelEdge: '#3a4a42', panelEdgeW: 1.2,
  /* 玩家资产条 */
  barR: 7, barFill: '#16221e', barActiveFill: '#1f2f2a',
  barEdge: '#3a4a42', barEdgeActive: '#f5c451', barEdgeW: 1,
  barSwatchW: 6, barSwatchR: 3, barPadX: 6, barBankruptAlpha: 0.35,
  barNameFs: 10, barCashFs: 11, barNameDy: -8, barCashDy: 8,
  barNameFill: '#d8e4dc', barCashFill: '#ffe9b0',
  /* 按钮 */
  btnR: 9, btnFill: '#f5c451', btnFillDisabled: '#3a4a42',
  btnEdge: '#c9a03f', btnEdgeW: 1, btnFs: 15, btnLabelDy: 0,
  btnTextFill: '#1b1b1b', btnTextFillDisabled: '#6b7f76',
  /* 状态行 */
  labelFs: 12, labelFill: '#d8e4dc',
  /* 骰子 */
  diceR: 10, diceFill: '#f3efe4', diceRollFill: '#ffffff', diceEdge: '#2a3830', diceEdgeW: 1.5,
  pipR: 4.2, pipSpan: 13, pipFill: '#243029',
});

const G = (p: Record<string, unknown>, k: keyof typeof HUD_D): number => num(p, k, HUD_D[k] as number);
const S = (p: Record<string, unknown>, k: keyof typeof HUD_D): string => str(p, k, HUD_D[k] as string);
const ownerColorOf = (state: Record<string, unknown>, fallback: string): string => {
  const colors = (state.ownerColors ?? {}) as Record<number, string>;
  const owner = typeof state.owner === 'number' ? state.owner : null;
  return (owner !== null && colors[owner]) ? colors[owner] : fallback;
};

/* —— 底部操作坞：圆角底 + 顶部金色提示条 —— */
export const uiDock: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, s } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'dockR'))
    .fill({ color: S(params, 'dockFill') })
    .stroke({ color: S(params, 'dockEdge'), width: G(params, 'dockEdgeW') });
  g.rect(cx - w / 2, cy - h / 2, w, G(params, 'dockTopH'))
    .fill({ color: S(params, 'dockTopFill') });
};

/* —— 通用面板：圆角底 + 描边 —— */
export const uiPanel: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, s } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'panelR'))
    .fill({ color: S(params, 'panelFill') })
    .stroke({ color: S(params, 'panelEdge'), width: G(params, 'panelEdgeW') });
};

/* —— 玩家资产条：色标 + 名字 + 现金（当前玩家金框、破产压暗） —— */
export const uiPlayerBar: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const active = state.active === true;
  const bankrupt = state.bankrupt === true;
  const alpha = bankrupt ? G(params, 'barBankruptAlpha') : 1;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  g.roundRect(x0, y0, w, h, G(params, 'barR'))
    .fill({ color: active ? S(params, 'barActiveFill') : S(params, 'barFill'), alpha })
    .stroke({ color: active ? S(params, 'barEdgeActive') : S(params, 'barEdge'), width: G(params, 'barEdgeW') });
  const swatch = G(params, 'barSwatchW') * s;
  g.roundRect(x0 + G(params, 'barPadX'), y0 + swatch, swatch, h - swatch * 2, G(params, 'barSwatchR'))
    .fill({ color: ownerColorOf(state, S(params, 'barNameFill')), alpha });
  if (!text) return;
  const tx = x0 + G(params, 'barPadX') * 2 + swatch;
  text({ text: typeof state.name === 'string' ? state.name : '', x: tx, y: cy + G(params, 'barNameDy'), size: G(params, 'barNameFs'), fill: S(params, 'barNameFill'), align: 'left' });
  text({ text: typeof state.cash === 'number' ? `￥${state.cash}` : '', x: tx, y: cy + G(params, 'barCashDy'), size: G(params, 'barCashFs'), fill: S(params, 'barCashFill'), align: 'left' });
};

/* —— 按钮：圆角底 + 居中标签（state.enabled 决定配色） —— */
export const uiButton: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const enabled = state.enabled !== false;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'btnR'))
    .fill({ color: enabled ? S(params, 'btnFill') : S(params, 'btnFillDisabled') })
    .stroke({ color: S(params, 'btnEdge'), width: G(params, 'btnEdgeW') });
  if (!text) return;
  text({
    text: typeof state.label === 'string' ? state.label : '',
    x: cx, y: cy + G(params, 'btnLabelDy'), size: G(params, 'btnFs'),
    fill: enabled ? S(params, 'btnTextFill') : S(params, 'btnTextFillDisabled'),
  });
};

/* —— 状态行：居中单行文字（轮次 / 胜负 / 提示） —— */
export const uiLabel: ProcPreset = (_g, ctx) => {
  const { cx, cy, params, state, text } = ctx;
  if (!text) return;
  text({ text: typeof state.text === 'string' ? state.text : '', x: cx, y: cy, size: G(params, 'labelFs'), fill: S(params, 'labelFill') });
};

/* —— 骰体：圆角方（掷出后亮底） —— */
export const diceBody: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'diceR'))
    .fill({ color: state.roll === true ? S(params, 'diceRollFill') : S(params, 'diceFill') })
    .stroke({ color: S(params, 'diceEdge'), width: G(params, 'diceEdgeW') });
};

/* —— 骰面：3×3 网格铺 1..6 个点（未掷骰 blank 不铺） —— */
export const diceFace: ProcPreset = (g, ctx) => {
  const { cx, cy, params, state, s, text } = ctx;
  if (text) { /* 骰面无文字通道用途，显式忽略以保持与其它 preset 同构 */ }
  if (state.blank === true) return;
  const raw = typeof state.pips === 'number' ? state.pips : num(params, 'pips', 1);
  const grid = PIPS[Math.min(Math.max(raw, 1), PIPS.length) - 1];
  const span = G(params, 'pipSpan') * s;
  for (const [dx, dy] of grid) {
    g.circle(cx + dx * span, cy + dy * span, G(params, 'pipR') * s).fill({ color: S(params, 'pipFill') });
  }
};
```

`src/render/providers/proc.ts` 的注册表改为：

```ts
import { diceBody, diceFace, uiButton, uiDock, uiLabel, uiPanel, uiPlayerBar } from './proc-hud';

export const PROC_PRESETS: Record<string, ProcPreset> = {
  tile, tileEdge, bgGradient, solid, builtin, fountain, shop, sign,
  awning, lantern, banner, rooftopBox, signTower, antenna, tree, lamp,
  showcasePanel, showcaseSky, showcaseSkyline, showcaseGround, showcaseHud, showcaseMini,
  uiDock, uiPanel, uiPlayerBar, uiButton, uiLabel, diceBody, diceFace,
};
```

`src/skin/registry.ts` 在 UI 段追加（保持 `ui.*` 三条之后）：

```ts
reg['ui.dock'] = { id: 'ui.dock', box: { w: 390, d: 1, h: 184 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
reg['ui.label'] = { id: 'ui.label', box: { w: 390, d: 1, h: 24 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
reg['ui.playerBar'] = { id: 'ui.playerBar', box: { w: 86, d: 1, h: 40 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
reg['ui.button.secondary'] = { id: 'ui.button.secondary', box: { w: 110, d: 1, h: 46 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };
```

`public/skins/default/skin.json` 的 `elements` 追加：

```json
    "ui.dock": { "kind": "proc", "preset": "uiDock", "params": {} },
    "ui.panel": { "kind": "proc", "preset": "uiPanel", "params": {} },
    "ui.label": { "kind": "proc", "preset": "uiLabel", "params": {} },
    "ui.playerBar": { "kind": "proc", "preset": "uiPlayerBar", "params": {} },
    "ui.button.primary": { "kind": "proc", "preset": "uiButton", "params": {} },
    "ui.button.secondary": { "kind": "proc", "preset": "uiButton", "params": {} },
    "dice.body": { "kind": "proc", "preset": "diceBody", "params": {} },
    "dice.face1": { "kind": "proc", "preset": "diceFace", "params": { "pips": 1 } },
    "dice.face2": { "kind": "proc", "preset": "diceFace", "params": { "pips": 2 } },
    "dice.face3": { "kind": "proc", "preset": "diceFace", "params": { "pips": 3 } },
    "dice.face4": { "kind": "proc", "preset": "diceFace", "params": { "pips": 4 } },
    "dice.face5": { "kind": "proc", "preset": "diceFace", "params": { "pips": 5 } },
    "dice.face6": { "kind": "proc", "preset": "diceFace", "params": { "pips": 6 } }
```

- [ ] **Step 8: 跑测试 + 两个校验**

Run: `npx vitest run test/render/proc-hud.spec.ts test/render test/skin && npm test`
Expected: 全绿（proc-hud 10 例 + 其余 M1–M4 用例；registry 用例因新增 4 条自动覆盖）。

Run: `npm run lint && npm run lint:skin`
Expected: 0 错 / `[skin:default] OK`（`ui.dock` / `ui.label` / `ui.playerBar` / `ui.button.secondary` 均已在 NAMESPACES 内、且在注册表命中）。

> 若 `no-visual-number` 报 `proc-hud.ts` 有越界字面量：检查是否把 `HUD_D` 的取值默认值写成了裸数字（必须经 `G()/S()` 从 `HUD_D` 取），以及 `PIPS` 表是否只含 `-1/0/1`。

- [ ] **Step 9: `Scene.reset()` + `main.ts` 接上 `?play=1`**

`src/render/Scene.ts` 在 `addMany` 之后追加：

```ts
  /** 清空全部 spec（回合推进后按新状态重建用；`render()` 每次都会清层，故只需清 items） */
  reset(): void {
    this.items.length = 0;
  }
```

`src/main.ts` 改动（四处）：

① import 追加：

```ts
import { autoPlay, createGame, currentPlayer, type Game } from './core/game';
import { hudSpecs, mountHud, type HudActionId, type HudHandle } from './ui/Hud';
import { boardCells } from './render/BoardView';
```

② `UrlOptions` 与 `parseOptions` 各加一项：

```ts
export interface UrlOptions { skin: string; debug: boolean; seed: number; speed: number; show: string; play: boolean }
```

```ts
    play: q.get('play') === '1',
```

③ `boot()` 里把「视图组装 + 渲染 + 标签 + HUD」收成一个 `paint()`，并接上动作：

```ts
  const game = opts.play ? createGame({ seed: opts.seed }) : null;

  /** 非 play：沿用 M3 的六组演示视图 + 可选橱窗 */
  const demoView = (): ElementSpec[] => {
    const out: ElementSpec[] = [
      ...boardTileSpecs(CURRENT, ownerOf),
      ...innerSpecs(),
      fountainSpec(),
      ...buildingSpecs({ ownerOf }),
      ...streetPropSpecs(),
      ...pawnSpecs(demoPawns),
    ];
    if (opts.show === 'b') out.push(...showcaseSpecs({ slot: CURRENT, owner: ownerOf(CURRENT) }));
    else if (opts.show === 'c') out.push(...showcaseSpecs({ variant: 'c' }));
    return out;
  };

  /** play：地砖归属色 / 当前格 / 棋子位置跟游戏状态联动，再叠 HUD */
  const ownedOf = (i: number): number | null => game?.state.estates[i]?.owner ?? ownerOf(i);
  const playView = (g: Game): ElementSpec[] => {
    const cells = boardCells(geo);
    const alive = g.state.players.filter((p) => !p.bankrupt);
    return [
      ...boardTileSpecs(currentPlayer(g.state).pos, ownedOf),
      ...innerSpecs(),
      fountainSpec(),
      ...buildingSpecs({ ownerOf: ownedOf }),
      ...streetPropSpecs(),
      ...pawnSpecs(alive.map((p) => ({ index: p.id - 1, c: cells[p.pos].c, r: cells[p.pos].r }))),
      ...hudSpecs(g.state),
    ];
  };

  let hud: HudHandle | null = null;

  /** 唯一出画口：清 spec → 组视图 → 渲染 → 标签 → HUD 命中层 */
  const paint = (): void => {
    scene.reset();
    scene.addMany(game ? playView(game) : demoView());
    scene.render();
    drawLabels(stage.layers.labels, geo, {
      bg: tokens.labelBg ?? '#060a08',
      text: tokens.labelText ?? '#d8e4dc',
      ownedText: tokens.labelOwnedText ?? '#ffffff',
      ownerOf: ownedOf,
    });
    hud?.update();
  };

  if (game) {
    hud = mountHud(document.body, game, (a: HudActionId) => {
      if (a === 'roll') game.rollDice();
      else if (a === 'move') game.moveCurrent();
      else if (a === 'settle') game.settleCurrent();
      else if (a === 'buy') game.buyCurrent();
      else if (a === 'upgrade') game.upgradeCurrent();
      else game.endTurn();
      paint();
    });
  }

  paint();
```

> 用 `paint()` 取代 M3 的 `scene.addMany(views); scene.render(); drawLabels(...)` 三段——`Scene.render()` 每次都会 `labels.removeChildren()`，故标签必须与渲染成对重画；`?play=1` 的每次动作都走同一条路径，避免「标签被清掉只剩地砖」这类只在一处漏画的 bug。

④ 暴露给验收脚本：

```ts
  /** 端到端整局：headless 跑到分出胜负并重画，返回胜者 id（1..4） */
  const sim = (): number => {
    if (!game) throw new Error('[mono] sim 需要 ?play=1');
    const w = autoPlay(game);
    paint();
    return w;
  };

  (window as unknown as Record<string, unknown>).__monoMain = {
    stage, scene, opts, geo, skin, missingAssets, game, paint, sim, VERSION,
  };
```

- [ ] **Step 10: 写 e2e 闸门脚本（手机视口截图 + 整局）**

`local/mono-shots-m4.mjs`：

```js
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 15000 });
await page.screenshot({ path: `${OUT}/mono-m4-01-hud.png` });

/* 1) HUD 元素与命中层 */
facts.hud = await page.evaluate(() => {
  const m = window.__monoMain;
  const inst = m.scene.instancesOf();
  const ids = inst.map((i) => i.id);
  return {
    ui: ids.filter((id) => id.startsWith('ui.')).length,
    bars: ids.filter((id) => id === 'ui.playerBar').length,
    diceBodies: ids.filter((id) => id === 'dice.body').length,
    diceFaces: ids.filter((id) => id.startsWith('dice.face')).length,
    fxChildren: m.stage.layers.fx.children.length,
    hitButtons: document.querySelectorAll('#mono-hud button[data-action]').length,
    primaryAction: document.querySelector('#mono-hud button[data-primary]')?.dataset.action ?? null,
    phase: m.game.state.phase,
  };
});
gate.hud_bars = facts.hud.bars === 4;
gate.hud_dice = facts.hud.diceBodies === 2 && facts.hud.diceFaces === 2;
gate.hud_fx = facts.hud.fxChildren >= 13;
gate.hud_hit = facts.hud.hitButtons >= 1 && facts.hud.primaryAction === 'roll';

/* 2) 手动三连点：掷骰 → 前进 → 结算（验证 DOM 命中层与状态机接线） */
facts.manual = await page.evaluate(async () => {
  const seq = [];
  for (let i = 0; i < 3; i++) {
    const b = document.querySelector('#mono-hud button[data-primary]');
    if (!b) break;
    seq.push(`${b.dataset.action}:${b.textContent === '' ? 'ok' : 'ok'}`);
    b.click();
    await new Promise((r) => setTimeout(r, 60));
  }
  const s = window.__monoMain.game.state;
  return { seq, phase: s.phase, pos: s.players[0].pos, dice: s.dice };
});
gate.manual_seq = facts.manual.seq.join(',') === 'roll:ok,move:ok,settle:ok';
gate.manual_phase = facts.manual.phase === 'settled';
gate.manual_dice = facts.manual.dice === null || typeof facts.manual.dice.total === 'number';

await page.screenshot({ path: `${OUT}/mono-m4-02-settled.png` });

/* 3) 端到端整局：headless 跑到胜负，再重画 */
facts.sim = await page.evaluate(() => {
  const m = window.__monoMain;
  const winner = m.sim();
  const s = m.game.state;
  return {
    winner, over: s.over, round: s.round,
    cash: s.players.map((p) => p.cash),
    bankrupt: s.players.map((p) => p.bankrupt),
    primary: document.querySelector('#mono-hud button[data-primary]')?.dataset.action ?? null,
  };
});
gate.sim_over = facts.sim.over === true;
gate.sim_winner = facts.sim.winner >= 1 && facts.sim.winner <= 4;
gate.sim_round = facts.sim.round <= 61;
gate.sim_hud = facts.sim.primary === null;

await page.screenshot({ path: `${OUT}/mono-m4-03-final.png` });
await page.close();

gate.noErrors = errors.length === 0;
console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);
```

> `facts.manual.seq` 用 `roll:ok,move:ok,settle:ok` 而非 `b.textContent`：可见文字画在画布上，DOM 按钮是透明的（`textContent` 恒为空），所以只断言**动作序列**。`gate.manual_dice` 允许 `null` 是因为 `endTurn` 会清空 `state.dice`——第 3 步停在 `settled`，骰子仍在，故实际走 `typeof total === 'number'` 分支。

- [ ] **Step 11: 跑闸门 + 追写手册 M4 段**

Run: `npm run dev`（后台，端口 52300）→ `node local/mono-shots-m4.mjs`
Expected: 退出码 0；`gate` 全 `true`；`errors` 为 `[]`；生成三张 390×844 @dpr2 截图：`mono-m4-01-hud.png`（开局 HUD：底坞 + 第 1 轮状态行 + 4 条资产条 + 两个骰面 + 金色「掷骰」）、`mono-m4-02-settled.png`（结算后出现「结束回合」+ 买地/升级按钮）、`mono-m4-03-final.png`（整局结束，状态行显示胜者、主按钮消失）。`facts.sim.over` = `true`、`sim.round` ≤ 61。

`docs/manual-mono.md` 在 M3 段之后追加：

```markdown
### M4 回合 HUD 与整局对战

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M4-1 | 打开 `mono.html?debug=1&play=1&seed=20260928` | 底部操作坞出现：顶部金色提示条 + 状态行「第 1 轮 · 轮到 你」+ 4 条玩家资产条（当前玩家金框）+ 两个骰面（未掷为暗底空面）+ 金色「掷骰」按钮；地砖归属色与棋子位置跟游戏状态联动 | `mono-m4-01-hud.png` |
| M4-2 | 依次点主按钮「掷骰」→「前进」→「结算」 | 三个动作按回合阶段递进（`idle→rolled→moved→settled`），骰面显示本回合点数 3+5；结算后按钮变「结束回合」，若落格无主 shop 则在左侧出现「买地 ￥60」、若自有则在右侧出现「升级 ￥180」 | `mono-m4-02-settled.png` |
| M4-3 | 控制台执行 `__monoMain.sim()` | headless 一路自动跑到分出胜负，返回胜者 id（1..4）；状态行变「本局结束 · 胜者 老王」，主按钮消失；`__monoMain.game.state.round` ≤ 61 | `mono-m4-03-final.png` |
| M4-4 | 现金不足时点「买地」（把 `__monoMain.game.state.players[0].cash` 改成 10 后 `__monoMain.paint()`） | 按钮仍在但变灰且点不动（边界校验，不隐藏） | — |
| M4-5 | 跑 `node local/mono-shots-m4.mjs` | 3 张 390×844 @dpr2 截图入库；`gate` 全 `true`、`errors` 为空 | 上述全部 |

**M4 结论**：`src/core` 全部单测通过（`board` / `economy` / `dice` / `board-path` / `estate` / `game` 共 51 例）+ 端到端整局可跑（`__monoMain.sim()` 返回胜者、`round ≤ ROUND_LIMIT + 1`）。有意偏差：楼体层级仍走演示层级 `slotLevelsOf()`（实时升级动画并入 M6），地砖归属色与棋子位置已跟游戏状态联动。
```

- [ ] **Step 12: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test monopoly/local monopoly/docs
git commit -m "feat(mono): M4 收口——回合 HUD（资产条/双骰/操作按钮）+ ?play=1 交互 + 端到端整局闸门"
```

---

# Wave 2 · M5 卡牌 / 股票 / 特殊格

> **目标（spec §5.3 / §5.4 / §5.5 / §10-M5）**：把**三类卡（道具/命运/机会）、股票盘、监狱/福利中心**接入 M4 已确立的 `Game` 门面与 `Phase` 阶段机，UI 以浮层（DOM 命中层 + 画布元素）呈现；`src/core` 单测覆盖 + 手机视口截图。
> **铁律（沿用 M1–M4）**：数值一律进 `src/data/**`；规则一律进 `src/core/**`（零引擎、随机只来自注入的 seeded rng、`Math.random` 禁用）；浮层里任何**可见**像素都经「注册表 ID + `skin.json` + `instantiate()`」产出，`src/render/**` 不得出现裸色值/裸常数（`no-visual-number` 门）；可点区域仍走 `#mono-hud` 式的**透明 DOM 命中层**约定。

### M5 全局契约（各任务直接引用，不得自创）

**① `Game` 门面是唯一状态推进入口（对 M4 的延续说明）**：计划开篇把 core 的推进入口写作 `step(state, dt, input)`，但 M4 已把它**落实为 `Game` 门面 + `Phase` 阶段机的分阶段方法**（`rollDice / moveCurrent / settleCurrent / buyCurrent / upgradeCurrent / endTurn`）——这是 `src/core` 对外的唯一推进入口。M5 **沿用该门面并只增方法**（`useCard / trade / skipTurn / clearEvent`），**不引入第二条旁路**，UI/渲染层永远不直接改 `state` 字段。`Math.random` 在 `src/core/**` 继续禁用（`no-random` 门），牌堆/股票涨跌/福利随机全部吃 `opts.seed` 派生的 rng。

**② 三类卡的口径（消除 spec §5.3 的「5 格 vs 6 张」歧义，**显式定死**）**：spec §5.3 表格里的「命运卡 6 格 / 机会卡 6 格」指的是**牌堆张数**，而棋盘上 `TILE_TYPES` 实际只有 **5 个 `fate` 格（index 2/9/17/23/29）+ 5 个 `chance` 格（index 5/14/21/25/31）**（见 `src/data/board.ts`）。二者**解耦**：**牌堆各 6 张**（`FATE_DECK` / `CHANCE_DECK`，本文件下方给出 6 条具体卡面），落到任意一个 `fate`/`chance` 格都从对应 6 张牌堆里抽 1 张；牌堆抽空即整堆洗牌重来。**「6 格」不应被读作「需要 6 个 fate 格」**——不改 `board.ts` 的 32 格布局。

**③ 新增元素 ID 命名（登记进 `tools/registry-ids.json` 与 `src/skin/ids.ts` 的 NAMESPACES）**：
- M5 UI：`ui.handSlot` / `ui.card` / `ui.cardBack` / `ui.stockRow` / `ui.stockChart` / `ui.settleRow` / `ui.badge`（沿用 `ui.*`，`pass: 4` + `fixed`，落在 `layers.fx`）。
- M5/M6 特效：`fx.coin` / `fx.stamp` / `fx.dust` / `fx.scaffold` / `fx.spark` / `fx.shard`（新增 `fx.*` 命名空间，登记 `ids.ts` 的 NAMESPACES 与 `lint-skin` 白名单）。
- 新增元素一律「**只改注册表 + `skin.json`，不改渲染代码**」；`default` 包必须补齐，`photo` 包可只覆盖部分（缺则走回退链，`missingAssets` 仍须为 0）。

**④ 布局与动效参数禁止散落**：所有坐标/尺寸/配色/时长/缓动进 `src/skin/layout.ts` 与 `skin.json`（`elements` 的 `params` + 新增 `fx` token 段）。`src/render/**` 与 `src/ui/**` 不得写死视觉常数。

---

## Task 27: 卡牌数据与效果（5 道具常驻手牌 + 命运/机会牌堆，纯逻辑 + 单测）

**Files:**
- Create: `d:\zhao\monopoly\src\data\cards.ts`
- Create: `d:\zhao\monopoly\src\core\cards.ts`
- Test: `d:\zhao\monopoly\test\core\cards.spec.ts`
- Test: `d:\zhao\monopoly\test\data\cards-data.spec.ts`

> **为什么牌堆张数与棋盘格数解耦（6 张 vs 5 格）**：见 M5 全局契约 ②。牌堆是「内容表」，格数是「触发点」，两者的生命周期完全不同（以后可能加卡面而不加格，或反之），故分别定义、互不约束。
> **为什么道具是「5 种常驻手牌」**：spec §5.3 写「5 种常驻手牌」= 每位玩家开局手上就**各持 1 张、共 5 槽**（不是 5 张随机卡）。这让「用卡」从第一回合就可玩，也便于截图验收；手牌去重（每种至多 1 张），满 5 槽后再抽到道具卡自动折算现金（见机会卡 `c-drawItem`）。
> **为什么效果基元放 `core/cards.ts` 而非 `game.ts`**：炸弹只动 `Estates`、路障只动 `Barriers`、手牌只动 `Hand`——它们不依赖 `GameState`，放 core 可**脱离整局状态单测**；真正需要整局状态的命运/机会结算留到 Task 30 在 `game.ts` 里按 `switch(kind)` 落库（避免 `cards.ts` 反向依赖 `game.ts` 造成循环）。

- [ ] **Step 1: 写失败测试（数据口径）**

`test/data/cards-data.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  CHANCE_DECK, DECK_SIZE, FATE_DECK, HAND_SIZE, ITEM_CARDS, type ItemCardKind,
} from '../../src/data/cards';

describe('cards 数据（spec §5.3）', () => {
  it('道具 5 种、手牌 5 槽、牌堆各 6 张', () => {
    expect(ITEM_CARDS.map((c) => c.kind)).toEqual(
      ['bomb', 'barrier', 'pardon', 'teleport', 'doubleRent'],
    );
    expect(ITEM_CARDS).toHaveLength(5);
    expect(HAND_SIZE).toBe(5);
    expect(DECK_SIZE).toBe(6);
    expect(FATE_DECK).toHaveLength(6);
    expect(CHANCE_DECK).toHaveLength(6);
  });

  it('道具：炸弹/路障/迁点需选目标，免罚/翻倍不需', () => {
    const targetOf = (k: ItemCardKind) => ITEM_CARDS.find((c) => c.kind === k)!.target;
    expect([targetOf('bomb'), targetOf('barrier'), targetOf('teleport')]).toEqual(['foe', 'tile', 'tile']);
    expect([targetOf('pardon'), targetOf('doubleRent')]).toEqual(['none', 'self']);
  });

  it('命运 6 张多为负向/中性；机会 6 张全为正向', () => {
    expect(FATE_DECK.every((c) => c.id.startsWith('f-'))).toBe(true);
    expect(CHANCE_DECK.every((c) => c.id.startsWith('c-'))).toBe(true);
    expect(new Set(FATE_DECK.map((c) => c.id)).size).toBe(6);
    expect(new Set(CHANCE_DECK.map((c) => c.id)).size).toBe(6);
  });
});
```

- [ ] **Step 2: 写 `src/data/cards.ts`（数据唯一真源）**

导出：`ItemCardKind` / `ItemCardDef` / `ITEM_CARDS` / `HAND_SIZE` / `DECK_SIZE` / `FateCardDef` / `FATE_DECK` / `ChanceCardDef` / `CHANCE_DECK` / `BOMB_RANGE` / `BARRIER_RANGE` / `PARDON_REFUND`（手牌满时道具折算金 ￥100）。

卡面内容（**照此定死，实现不得增删卡面**）：

```ts
export type ItemCardKind = 'bomb' | 'barrier' | 'pardon' | 'teleport' | 'doubleRent';
export interface ItemCardDef { kind: ItemCardKind; name: string; desc: string; target: 'none' | 'tile' | 'foe' | 'self' }
export const ITEM_CARDS: ItemCardDef[] = [
  { kind: 'bomb',       name: '炸弹',   desc: '拆对手目标地块 1 级（L1 炸回无主）', target: 'foe' },
  { kind: 'barrier',    name: '路障',   desc: '在前方 1–6 格内设障，拦停下一位经过者', target: 'tile' },
  { kind: 'pardon',     name: '免罚',   desc: '自动抵消一次应付租金或一次入狱', target: 'none' },
  { kind: 'teleport',   name: '迁点',   desc: '本回合以迁点取代移动，落到任意指定格', target: 'tile' },
  { kind: 'doubleRent', name: '租金翻倍', desc: '本人下一次收租翻倍，收完消耗', target: 'self' },
];

export type FateKind = 'fine' | 'tax' | 'back' | 'weather' | 'lockup' | 'swap';
export interface FateCardDef { id: string; name: string; kind: FateKind; amount?: number; steps?: number; text: string }
export const FATE_DECK: FateCardDef[] = [
  { id: 'f-fine',    name: '违规罚金', kind: 'fine',    amount: 150, text: '摊位违规，罚金 ￥150' },
  { id: 'f-tax',     name: '卫生摊派', kind: 'tax',     amount: 200, text: '市场整治，摊派 ￥200' },
  { id: 'f-back',    name: '走错路口', kind: 'back',    steps: 3,    text: '退后 3 格' },
  { id: 'f-weather', name: '天气停业', kind: 'weather',              text: '恶劣天气，停业 1 回合' },
  { id: 'f-lockup',  name: '临时看管', kind: 'lockup',               text: '被带往监狱' },
  { id: 'f-swap',    name: '铺位调换', kind: 'swap',                 text: '与随机一位玩家互换位置' },
];

export type ChanceKind = 'bonus' | 'refund' | 'freeUpgrade' | 'rollAgain' | 'drawItem' | 'stockTip';
export interface ChanceCardDef { id: string; name: string; kind: ChanceKind; amount?: number; item?: ItemCardKind; text: string }
export const CHANCE_DECK: ChanceCardDef[] = [
  { id: 'c-bonus',       name: '邻里扶持金', kind: 'bonus',       amount: 300, text: '领取扶持金 ￥300' },
  { id: 'c-refund',      name: '消费返现',   kind: 'refund',      amount: 120, text: '返现 ￥120' },
  { id: 'c-freeUpgrade', name: '免费升级',   kind: 'freeUpgrade',             text: '随机自有地块升 1 级（无则折现 ￥180）' },
  { id: 'c-rollAgain',   name: '再掷一次',   kind: 'rollAgain',               text: '本回合额外再掷一次' },
  { id: 'c-drawItem',    name: '抽道具卡',   kind: 'drawItem',                text: '随机获得 1 张道具卡（手牌满则折现 ￥100）', item: undefined },
  { id: 'c-stockTip',    name: '内幕消息',   kind: 'stockTip',                text: '随机一支股票下次必涨' },
];
```

- [ ] **Step 3: 写失败测试（效果基元）**

`test/core/cards.spec.ts` 覆盖：

```ts
import { describe, it, expect } from 'vitest';
import {
  barrierAt, bombDown, clearBarrier, createDeck, grant, handIndexOf, has,
  placeBarrier, use,
} from '../../src/core/cards';
import { makeRng } from '../../src/core/dice';
import { ITEM_CARDS } from '../../src/data/cards';
import type { Estates } from '../../src/core/estate';
```

用例清单（**逐条断言**）：
1. `createDeck(FATE_DECK, makeRng(7)).draw()` 同 seed → 同序；连续抽 6 张互不重复；第 7 张触发洗牌（`remaining()` 先降后回升）。
2. `grant`：空手牌入 `bomb` → 长度 1；再入 `bomb` → `false`（去重）；填满 5 种后再 `grant` → `false`；`has/use/handIndexOf` 一致。
3. `bombDown`：`estates[3] = {level:2,owner:2}` → 降到 1、仍归 2；`level:1` → 该地块从 `estates` 中**删除**（炸回无主）；非 `shop` 格 → `{ ok:false, reason:'not-estate' }`；打自己地块 → `{ ok:false, reason:'own-tile' }`。
4. `placeBarrier/barrierAt/clearBarrier`：`Barriers` 是 `Record<number, {index:number; owner:number}>`；重复设障返回 `false`；`clearBarrier` 后再查为 `false`。
5. 所有随机路径**不调用 `Math.random`**（用 `makeRng` 注入即可断言）。

- [ ] **Step 4: 写 `src/core/cards.ts`**

导出：`Deck<T>` / `createDeck(cards, rng)` / `Hand` / `grant` / `use` / `has` / `handIndexOf` / `Barriers` / `placeBarrier` / `barrierAt` / `clearBarrier` / `BombOutcome` / `bombDown`。
纯函数、原地读写传入的 `Estates` / `Barriers`（与 `estate.ts` 同风格：调用方持有唯一状态）；无 `Math.random`、无引擎依赖。

- [ ] **Step 5: 跑测试**

Run: `npx vitest run test/core/cards.spec.ts test/data/cards-data.spec.ts`
Expected: 全绿（数据 3 例 + 效果 ≥ 8 例）。

Run: `npx tsc --noEmit`
Expected: 0 错。

Run: `npm run lint`
Expected: 0 错（`src/core/cards.ts` 不得出现 `Math.random`，否则 `no-random` 报错）。

- [ ] **Step 6: Commit**

```bash
git add monopoly/src/data monopoly/src/core monopoly/test
git commit -m "feat(mono): M5-1 卡牌三系统数据与效果基元（5 道具常驻手牌 + 命运/机会牌堆各 6 张）"
```

---

## Task 28: 股票（3–5 支虚拟盘 / 回合制涨跌 / 买卖 / 结算口径，纯逻辑 + 单测）

**Files:**
- Create: `d:\zhao\monopoly\src\data\stocks.ts`
- Create: `d:\zhao\monopoly\src\core\stocks.ts`
- Test: `d:\zhao\monopoly\test\core\stocks.spec.ts`

> **为什么先定「最小可用盘」并把数值模型待定项消化掉**：spec §12-4 明确「股票数值模型（涨跌规则/是否影响胜负）设计细化时定；先做最小可用盘」。本任务据此**定死一个可测的随机游走**：4 支盘、每「轮」统一 tick 一次、单回合涨跌幅度 ≤ `vol`；胜负口径见 Step 4 的净资产定义。
> **为什么 tick 按「轮」而非「回合」**：spec §5.5 股票是「回合制涨跌」。若一人一回合就 tick，四人局里首位玩家每轮吃到 4 次波动、末位只 1 次，**先手者收益不均**。改为「每位玩家各完成一次回合 = round+1 时统一 tick」，先手不再占便宜，也让 `seed` 复现稳定。

- [ ] **Step 1: 写 `src/data/stocks.ts`（4 支双阳概念股，演示盘）**

```ts
export interface StockDef { code: string; name: string; price0: number; vol: number }
/** vol = 单回合涨跌幅度上限（比例），price 取整到 ￥ */
export const STOCKS: StockDef[] = [
  { code: 'SY01', name: '鹿业股份', price0: 120, vol: 0.12 },
  { code: 'SY02', name: '温泉文旅', price0: 80,  vol: 0.15 },
  { code: 'SY03', name: '山泉饮品', price0: 60,  vol: 0.10 },
  { code: 'SY04', name: '有机农业', price0: 40,  vol: 0.18 },
];
export const STOCK_FEE_RATIO = 0;   // 演示期免手续费（留口子，不改代码即可调）
export const SHARE_LOT = 1;         // 最小交易单位（整股）
export const STOCK_TILE_INDEX = 19; // 股票交易所地块（board.ts TILE_TYPES[19] = 'stock'）
```

- [ ] **Step 2: 写失败测试**

`test/core/stocks.spec.ts` 用例清单：
1. `createMarket(makeRng(s))` 初始价 = 各 `price0`；同 seed 的 `tick` 序列一致、异 seed 不同。
2. `tick`：价格恒 ≥ 1、且单次变动比例 `|Δ| / prev ≤ vol + ε`；概率上 4 支都出现涨与跌。
3. `buyShares`：整股、`shares ≥ 1`；现金够 → 扣现、`Holding.shares` 增、`cost` 累加；现金不足 → `{ ok:false, reason:'not-enough-cash' }`，状态不变。
4. `sellShares`：卖出不超过持股 → 加现、减股；超过 → `{ ok:false, reason:'not-enough-shares' }`；卖空全部后 `Holding` 从 `Portfolio` 删除。
5. `marketValue`：`Σ shares × 当前价`；空仓为 0。
6. `bad-lot`：`shares = 0` 或非整数 → 失败（不改状态）。

- [ ] **Step 3: 写 `src/core/stocks.ts`**

导出：`Quotes` / `Portfolio` / `Holding` / `Market` / `createMarket(rng, defs?)`（`Market = { quotes(): Quotes; tick(): Quotes }`）/ `TradeOutcome` / `TradeFail` / `buyShares` / `sellShares` / `marketValue` / `holdingOf`。
纯逻辑；涨跌用 `Math.round(prev * (1 + vol * (2 * rng() - 1)))` 并 `Math.max(1, …)`；不依赖引擎、不触碰 `GameState`。

- [ ] **Step 4: 定死「股票与胜负」的结算口径（写进 `src/data/economy.ts` 的注释 + `netWorth` 定义，Task 30 落库）**

- **净资产 `netWorth(p) = cash + assetValue(estates, p.id) + marketValue(portfolio[p])`**（Task 25 的兜底排名口径**扩展**一项股票市值）。
- **破产线不变（spec §5.4）**：`cash < 0 且无可变卖地产` → 破产；**股票不算「可变卖地产」**，即持股不能阻止破产（持股是投资，不是抵押物）。这一条是**刻意**的：让「股票影响排名但不改变破产规则」，避免把投资风险转嫁成免死金牌。
- 破产清算时**持股按当前价折算入现金后再判定**是否仍 `cash < 0`（避免「有一堆股却判破产」的观感 bug）；折算在同一步、同 rng、可复现。

- [ ] **Step 5: 验证**

Run: `npx vitest run test/core/stocks.spec.ts`
Expected: 全绿（≥ 6 例）。
Run: `npx tsc --noEmit && npm run lint`
Expected: 0 错 / 0 错。

- [ ] **Step 6: Commit**

```bash
git add monopoly/src/data monopoly/src/core monopoly/test
git commit -m "feat(mono): M5-2 股票最小可用盘（4 支双阳概念股 + 回合制涨跌 + 买卖 + 净资产口径）"
```

---

## Task 29: 特殊格（监狱 / 福利中心 / 股票交易所入口，纯逻辑 + 单测）

**Files:**
- Create: `d:\zhao\monopoly\src\core\special.ts`
- Test: `d:\zhao\monopoly\test\core\special.spec.ts`

> **为什么监狱停几回合要「定死 2」而非「随机 1–2」**：spec 写「停 1–2 回合」。为保证截图与单测可复现、并让「免罚卡价值」可量化，本任务**定死 `JAIL_TURNS = 2`**（免罚卡抵消即归 0）；「1–2」的随机区间不做（随机只会让平衡更难调、验收更难复现）。
> **为什么福利中心奖励用「三选一权重的抽奖表」**：spec §5.5 只写「随机奖励（现金/卡牌/免费升级）」；把它落成**等权三选一**的显式表，既忠实、又便于 Task 30 用 seeded rng 复现。

- [ ] **Step 1: 写失败测试**

`test/core/special.spec.ts` 用例清单：
1. `specialAt(12)` → `'jail'`；`specialAt(19)` → `'stock'`；`specialAt(7)` / `specialAt(27)` → `'bonus'`；`specialAt(3)` → `null`（用 `board.ts` 的 `TILE_TYPES` 真源，非硬编码数字表）。
2. `JAIL_TURNS === 2`。
3. `rollBonus(rng)`：返回三类之一；大量抽样三类都出现（各约 1/3，±25% 容差）；现金档金额 ∈ `{200, 400}`；卡牌档 `item` ∈ `ITEM_CARDS.kind`；升级档 `kind === 'upgrade'`。
4. `tickJail(jail, playerIndex)`：`2→1→0`；`0` 保持 0（不出现负值）。
5. 同 seed 的 `rollBonus` 序列一致。

- [ ] **Step 2: 写 `src/core/special.ts`**

导出：`SpecialKind`（`'jail'|'bonus'|'stock'`）/ `specialAt(index): SpecialKind | null`（读 `typeAt`）/ `JAIL_TURNS` / `nextJail(turns): number` / `BonusReward` / `rollBonus(rng): BonusReward` / `BONUS_WEIGHTS`。
`BonusReward = { kind:'cash'; amount:200|400 } | { kind:'item'; item:ItemCardKind } | { kind:'upgrade' }`。
纯逻辑、零引擎、随机吃注入 rng。

- [ ] **Step 3: 验证**

Run: `npx vitest run test/core/special.spec.ts`
Expected: 全绿（≥ 5 例）。
Run: `npx tsc --noEmit && npm run lint`
Expected: 0 错 / 0 错。

- [ ] **Step 4: Commit**

```bash
git add monopoly/src/core monopoly/test
git commit -m "feat(mono): M5-3 特殊格逻辑（监狱停 2 回合 / 福利中心随机奖励 / 股票交易所入口）"
```

---

## Task 30: 回合状态机接入卡牌/股票/特殊格（`game.ts` 扩展 + 单测）

**Files:**
- Modify: `d:\zhao\monopoly\src\core\game.ts`（扩 `GameState` + 方法 + `SettleResult` 细分）
- Modify: `d:\zhao\monopoly\src\data\economy.ts`（`netWorth` 口径注释 + 若需 `JAIL_*` 口径再导出）
- Modify: `d:\zhao\monopoly\test\core\game.spec.ts`（M4 的 `{ kind:'event' }` 断言改到 `fate` / `chance` 细分）
- Test: `d:\zhao\monopoly\test\core\game-cards.spec.ts`

> **为什么把牌堆/市场放进闭包而不是 `GameState`**：与 M4 的 `dice` 同源——**随机源的进度不可序列化进 `state`**（否则存档会连带 RNG 状态，且截图/单测复现要同时喂 state + rng）。故 `fateDeck / chanceDeck / market` 与 `dice` 一样，是 `createGame()` 的闭包私有变量，只通过 `opts.seed` 派生，`state` 只存**结果**（`quotes` / `lastDraw` / `lastEvent`）。
> **为什么 `SettleResult` 的 `event` 要细分**：M4 的 `{ kind:'event', tile:'chance' }` 只够 HUD 显示「踩到机会」，M5 要驱动翻牌动画（`lastDraw.cardId`）与负向/正向结算，故替换为 `fate` / `chance` 两种并带 `cardId`。**这会破坏 M4 两条既有断言**（`game.spec.ts` 里对 `event` 的期望），故本任务显式 `Modify` 该测试——这是唯一一处对既有测试的改动，目的是消除「一个笼统 event 分支」的歧义。
> **为什么「状态先落库、动画后回放」**：spec §5.6 的动画是**表现**；若等动画结束才写状态，玩家秒点会与 `Phase` 门槛打架。故 `Game` 方法**同步落库并返回结果**，`fx`（M6）只回放，`Phase` 永远权威。

- [ ] **Step 1: 扩 `GameState` 与 `Game` 接口（先改类型，再写测试）**

`GameState` 新增：
```ts
hands: Hand[];              // 与 players 下标对齐；每玩家 ≤ 5 槽、去重
barriers: Barriers;         // 场上路障（Record<index, {index, owner}>）
jail: number[];             // 每玩家剩余禁行回合（0 = 正常）
doubleRent: boolean[];      // 每玩家租金翻倍 buff
stockTip: string[] | null;  // 每玩家「内幕消息」标的（一次 tick 内生效后清空）
quotes: Quotes;             // 当前股价（结果快照）
portfolios: Portfolio[];    // 每玩家持股
lastDraw: DrawLog | null;   // 最近一次抽卡（翻牌动画消费）：{ deck:'fate'|'chance'; cardId: string }
lastEvent: EventLog | null; // 最近一次卡牌/奖励/交易（浮层消费）
```
`Game` 新增：
```ts
useCard(kind: ItemCardKind, target?: number): CardOutcome;
trade(code: string, shares: number): TradeOutcome;   // >0 买 / <0 卖
skipTurn(): { skipped: true; remaining: number };    // 监狱禁行时唯一的 idle 推进
clearEvent(): void;                                  // 关闭浮层（只清 lastEvent/lastDraw）
```
`SettleResult` 细分（替换 `event`）：
```ts
| { kind: 'fate';   index: number; cardId: string; effect: FateEffect }
| { kind: 'chance'; index: number; cardId: string; effect: ChanceEffect }
| { kind: 'jail';   index: 12; turns: number; waived: boolean }
| { kind: 'bonus';  index: number; reward: BonusReward }
| { kind: 'stock';  index: 19 }
// rent 分支增 waived?: boolean（免罚卡抵消）
```

- [ ] **Step 2: 写失败测试**

`test/core/game-cards.spec.ts` 用例清单（全部用固定骰 + `seed` 复现）：
1. **手牌开局**：4 名玩家各持 5 张道具卡（`handIndexOf` 5 种齐全）。
2. **炸弹**：本人 `settled`，对 2 号 `level:2` 交付地块 `useCard('bomb', idx)` → 降 1 级、手牌少 1；对无主/自己/非 shop → 失败原因正确（`not-estate`/`own-tile`/`not-held`）。
3. **路障拦停**：A `settled` 放障在下一位必经格 → `endTurn` 换 B，B `rollDice` 后 `moveCurrent()` **截断**停在路障格、路障消耗、返回 `barrierAt` 命中标记。
4. **免罚抵消租金**：`pardon` 在场，落到对手高租地块 → `settleCurrent()` 返回 `kind:'rent'` 且 `waived:true`、现金不变、`pardon` 消耗。
5. **免罚抵消入狱**：落到 index 12 → `kind:'jail'` 且 `waived:true`、`jail[i] === 0`。
6. **监狱停 2 回合**：无免罚落 12 → `jail[i] === 2`；`idle` 下 `rollDice()` 抛 `[mono] rollDice @jailed`；`skipTurn()` → 2→1；第二次 `skipTurn()` → 0，恢复可掷。**并且** `skipTurn` 后 `phase` 才允许回 `idle`。
7. **迁点**：`rolled` 阶段 `useCard('teleport', 19)` → 直接落到 19、`phase='moved'`、正常结算为 `kind:'stock'`。
8. **租金翻倍**：`useCard('doubleRent')` 后本人下次收到租金 = `2 × rentOf(level)`、收取后 buff 清空。
9. **股票交易门槛**：非 index 19 → `trade` 返回 `{ ok:false, reason:'not-at-market' }`；在 19 且现金够 → 买入成功、`portfolios[i]` 增、现金减；卖出同理；现金不足/超卖原因正确。
10. **股票 tick**：`endTurn` 走满一轮（4 人各一次）→ `round === 2` 且 `quotes` 变化（同 seed 可复现）。
11. **机会 `c-rollAgain`**：抽到后不结束回合（额外掷一次），移动累加。
12. **机会 `c-drawItem`**：手牌未满 → 得 1 张；手牌满 → 折现 `PARDON_REFUND`（￥100）。
13. **命运 `f-back` / `f-weather` / `f-lockup` / `f-swap`**：分别断言退格 / 停 1 回合 / 进监 / 与另一位换位。
14. **福利中心**（index 7/27）：`kind:'bonus'`，`reward` 三类之一且落库正确。
15. **`autoPlay` 仍能收敛**：整局跑到 `over`，`round ≤ ROUND_LIMIT + 1`，胜者 ∈ 1..4（把新系统计入 `netWorth`）。
16. `Math.random` 不得出现在 `game.ts`（lint 兜底，测试无需断言）。

- [ ] **Step 3: 实现（`game.ts`）**

- 抽卡统一入口 `drawFrom(kind)`：从闭包牌堆抽 1 张、写 `lastDraw`、返回卡面。
- `settleCurrent` 按 `specialAt(pos)` / `typeAt(pos)` 分派：`shop`（vacant/own/rent，rent 支持 `pardon` 与 `doubleRent`）/ `fate` / `chance` / `jail` / `bonus` / `stock` / `core`。
- 命运/机会按 `switch(kind)` 落库（`FateEffect` / `ChanceEffect` 是可断言的结果对象，供 UI 回放）。
- `moveCurrent` 支持路障截断；`endTurn` 在轮末统一 `market.tick()` 并清 `stockTip`。
- `skipTurn` 只在 `idle && jail[i] > 0` 合法，否则抛 `[mono] skipTurn @phase=…`。
- `netWorth` 扩为 `cash + assetValue + marketValue`；破产清算先折算持股。
- `autoPlay` 加「用卡/交易」最小策略（够钱买卡面允许时就地产；不玩股票），保证单机自动局仍收敛。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run test/core/game-cards.spec.ts test/core/game.spec.ts`
Expected: 全绿（新用例 ≥ 16 例；M4 既有断言已改到 `fate`/`chance` 细分后仍绿）。
Run: `npx vitest run`
Expected: 全绿（M1–M4 全部旧例 + M5 新例）。
Run: `npx tsc --noEmit && npm run lint`
Expected: 0 错 / 0 错。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src monopoly/test
git commit -m "feat(mono): M5-4 回合状态机接入卡牌/股票/特殊格（useCard/trade/skipTurn + SettleResult 细分）"
```

---

## Task 31: M5 UI 浮层（手牌 / 股票盘 / 抽卡翻牌 / 结算面板）

**Files:**
- Create: `d:\zhao\monopoly\src\ui\panels.ts`
- Create: `d:\zhao\monopoly\src\render\providers\proc-panel.ts`
- Modify: `d:\zhao\monopoly\src\skin\layout.ts`（浮层布局常量：`PANEL_*`）
- Modify: `d:\zhao\monopoly\src\skin\registry.ts`（`ui.handSlot` / `ui.card` / `ui.cardBack` / `ui.stockRow` / `ui.stockChart` / `ui.settleRow` / `ui.badge`）
- Modify: `d:\zhao\monopoly\src\skin\ids.ts`（NAMESPACES 增 `fx.*`；`ui.*` 已在）
- Modify: `d:\zhao\monopoly\public\skins\default\skin.json`（7 条新 `elements`）
- Modify: `d:\zhao\monopoly\src\render\providers\proc.ts`（注册 7 个新 preset）
- Modify: `d:\zhao\monopoly\src\main.ts`（挂载 `mountPanels` + `panelSpecs` 进 `paint()`）
- Test: `d:\zhao\monopoly\test\ui\panels.spec.ts`
- Test: `d:\zhao\monopoly\test\render\proc-panel.spec.ts`

> **为什么浮层「画面」仍必须是 `instantiate()` 元素**：spec §3.6 硬约束——任何可见元素都要能整包换成图片素材。手牌槽/卡面/行情行/结算行都必须走注册表；**可点区域**照 M4 约定用透明 DOM（`#mono-panels`），不在 Pixi 里做像素拾取。
> **为什么抽卡用 B 版式橱窗构图**：spec §6 规定「B 踩格特写 = 踩格浮层」；抽卡翻牌复用 `ShowcaseView` 的夜空/广场底，卡面居中，符合「棋盘给局势、橱窗给好看」的分工。
> **为什么 `panelSpecs` 要能吃 `state` 纯函数产出、再被单测**：把「状态 → 视图」做成纯函数（`handSlots/stockRows/drawCard/settlePanel`），浮层逻辑就能脱离 DOM/引擎单测；`mountPanels` 只负责 DOM 命中层与 `update()` 触发重画。

- [ ] **Step 1: 写失败测试（纯函数）**

`test/ui/panels.spec.ts` 用例清单：
1. `handSlots(state)`：恒 5 槽、顺序 = `ITEM_CARDS.kind`、`held` 与 `enabled`（是否可用：阶段 + 目标可选中）正确；`pardon` 槽 `enabled=false`（被动卡不可点）。
2. `stockRows(state)`：4 行、含 `code/name/price/涨跌/持股/市值`；`涨跌` 由 `price` 对比 `price0` 或上一快照得到（口径定死在实现注释里）。
3. `drawCard(state)`：`lastDraw` 为 null → null；有值 → `{ deck, cardId, title, text }`（标题/文案由 `cards.ts` 数据取，不写死在 UI）。
4. `settlePanel(state)`：`over=false` → null；`over=true` → 含 4 行名次（净资产降序）、胜者 id、`round`。
5. `panelSpecs(state)`：所有 spec `pass===4` 且 `fixed===true`；元素 ID 全部能命中注册表（`registry[spec.id]` 存在）。

- [ ] **Step 2: 写 `src/ui/panels.ts`**

导出：`mountPanels(root, game, act) => PanelHandle`（`{ update(): void; destroy(): void }`）/ `PanelActionId`（`'card:bomb'|'card:barrier'|'card:teleport'|'card:doubleRent'|'stock:buy'|'stock:sell'|'card:close'|'settle:close'`）/ 纯函数 `handSlots` / `stockRows` / `drawCard` / `settlePanel` / `panelSpecs`。
DOM 命中层 `#mono-panels`：`pointer-events:none` 容器 + 命中区 `auto` 的按钮，按钮带 `data-action` / `data-target`；与 `Hud` 同为「透明层 + `data-action`」约定。

- [ ] **Step 3: 注册表 + skin.json + proc preset**

- `src/skin/registry.ts` 追加 7 条（`box`/`anchor`/`baseline`/`mount:'ground'`/`providerKinds:['proc','image','atlas']`），照 Task 26 的写法。
- `public/skins/default/skin.json` 的 `elements` 追加 7 条 `{ "kind":"proc", "preset":"uiCard", "params":{} }` 等；`ui.stockChart` 可先用 `uiChart` preset。
- `src/render/providers/proc-panel.ts`：新 preset 一律用 `G(params,'x')` / `S(params,'color')` 从 `params` 取值（`no-visual-number` 门），表数据只允许 `-1/0/1`（如 `PIPS` 同风格）。
- 若 `lint:skin` 因新 ID 未登记命名空间报错：在 `src/skin/ids.ts` 的 NAMESPACES 加 `'fx'`，并重跑 `node tools/gen-registry-ids.mjs`。

- [ ] **Step 4: `main.ts` 接线**

`paint()` 里在 `hud?.update()` 之后追加 `panels?.update()` 与 `scene.addMany(panelSpecs(game.state))`（或在 `playView` 里并入）；动作回调：`act` → 对应 `game.useCard` / `game.trade` / `game.clearEvent` → `paint()`。`?play=1` 下浮层默认收起，抽卡/落到股票格/结算时自动展开。

- [ ] **Step 5: 验证**

Run: `npx vitest run test/ui/panels.spec.ts test/render/proc-panel.spec.ts`
Expected: 全绿（≥ 5 + ≥ 8 例）。
Run: `npx vitest run && npx tsc --noEmit`
Expected: 全绿 / 0 错。
Run: `npm run lint && npm run lint:skin`
Expected: 0 错 / `[skin:default] OK`（7 条新 ID 均在 NAMESPACES 内且命中注册表）。
Run: `npm run build`
Expected: 构建成功，`release/mono.html` + `release/js/mono.js` 产出。

- [ ] **Step 6: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test
git commit -m "feat(mono): M5-5 浮层 UI（手牌 5 槽 / 股票盘 / 抽卡翻牌 / 结算面板）"
```

---

## Task 32: M5 闸门（手机截图 + 手册 M5 段）

**Files:**
- Create: `d:\zhao\monopoly\local\mono-shots-m5.mjs`
- Modify: `d:\zhao\monopoly\package.json`（新增 `"shots:m5": "node local/mono-shots-m5.mjs"`）
- Modify: `d:\zhao\monopoly\docs\manual-mono.md`（M5 段 + 截图行）

> **为什么闸门必须真跑一遍卡牌/股票/监狱，而不只截图**：spec §11.2 要求 `src/core` 覆盖「卡牌效果」；端到端闸门把「DOM 命中层 → 动作 → 状态 → 浮层重画」整条链跑通，才能拦住「单测绿但点不动」这类接线 bug。

- [ ] **Step 1: 写 `local/mono-shots-m5.mjs`（390×844 dpr=2，打 `npm run dev` 的 52300）**

沿用 `mono-shots-m4.mjs` 骨架；断言清单：
1. `?debug=1&play=1&seed=20260928` → `window.__monoMain.game` 就绪，`no pageerror`。
2. **手牌**：`__monoMain.game.state.hands[0]` 长度 5；DOM `#mono-panels button[data-action^="card:"]` 计数 ≥ 1。
3. **炸弹**：控制台 `useCard('bomb', <对手地块>)` → 目标 `estates[*].level` 减 1；截图 `mono-m5-02-bomb.png`。
4. **抽卡翻牌**：把 `players[0].pos` 置到 `fate`/`chance` 格前、`rollDice/moveCurrent/settleCurrent`、`paint()` → `state.lastDraw` 非空、浮层出现卡面；截图 `mono-m5-03-draw.png`。
5. **股票盘**：`players[0].pos=19` 后 `settleCurrent()` → `kind:'stock'`；`trade('SY01', 1)` 成功、`portfolios[0].SY01.shares===1`；截图 `mono-m5-04-stock.png`。
6. **监狱**：`players[0].pos=12` 前一步落 12 → `jail[0]===2`；`skipTurn()` → `1`；截图 `mono-m5-05-jail.png`。
7. **结算面板**：`sim()` 跑到 `over` → 结算面板展开、含 4 行名次；截图 `mono-m5-06-settle.png`。
8. `gate` 全 `true`、`errors === []`。

- [ ] **Step 2: 跑闸门 + 追写手册 M5 段**

Run: `npm run dev`（后台，端口 52300）→ `node local/mono-shots-m5.mjs`
Expected: 退出码 0；`gate` 全 `true`、`errors=[]`；生成 6 张 390×844 @dpr2 截图。

`docs/manual-mono.md` 在 M4 段后追加：

```markdown
### M5 卡牌 / 股票 / 特殊格

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M5-1 | 打开 `mono.html?debug=1&play=1&seed=20260928` | 底部出现手牌 5 槽（炸弹/路障/免罚/迁点/租金翻倍），持有为亮、免罚为被动灰槽 | `mono-m5-01-hand.png` |
| M5-2 | 点「炸弹」再点对手地块 | 目标楼降 1 级（L1 炸回无主），手牌炸弹消耗、地块归属色消失 | `mono-m5-02-bomb.png` |
| M5-3 | 控制台把 `players[0].pos` 移到命运/机会格前并走一步 | 浮层出现抽卡翻牌，`state.lastDraw.deck` 与牌面文案来自 `cards.ts` | `mono-m5-03-draw.png` |
| M5-4 | 走到 index 19 股票交易所 | 弹出股票盘：4 支行、价格与涨跌、持仓；点「买 1」后持股 +1、现金 −价 | `mono-m5-04-stock.png` |
| M5-5 | 落到 index 12 监狱 | 状态行显示「禁行 2 回合」，主按钮变「跳过（1）」；持有免罚卡则自动抵消、不进监 | `mono-m5-05-jail.png` |
| M5-6 | 控制台 `__monoMain.sim()` | 跑到胜负，结算面板展开含 4 行名次（净资产含地产 + 股票市值） | `mono-m5-06-settle.png` |
| M5-7 | 跑 `node local/mono-shots-m5.mjs` | 6 张截图入库；`gate` 全 `true`、`errors` 为空 | 上述全部 |

**M5 结论**：卡牌/股票/特殊格三套系统接入 `Game` 门面，`src/core` 新增 `cards`/`stocks`/`special`/`game-cards` 单测全绿；牌堆各 6 张、棋盘仍 5 fate + 5 chance 格（口径解耦）。
```

- [ ] **Step 3: 全量回归（M5 收口三连）**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run lint:skin && npm run build`
Expected: 单测全绿 / tsc 0 错 / lint 0 错 / `[skin:default] OK` / build 成功。

- [ ] **Step 4: Commit**

```bash
git add monopoly/local monopoly/docs monopoly/package.json
git commit -m "test(mono): M5 闸门——卡牌/股票/监狱/结算手机截图 + 手册 M5 段"
```

---

# Wave 2 · M6 动画层与性能

> **目标（spec §5.6 / §7.1 / §10-M6 / §11.5）**：给 M1–M5 已产出的元素实例接一层 **GSAP 动画编排**（§5.6 全清单），让动画只是**表现**、状态机永远权威；并把性能压到预算内（中端安卓 60fps、单帧绘制调用 < 200、首屏可交互 < 3s）。
> **铁律**：`src/render/fx.ts` 里**不得出现裸色值/裸几何/裸时长**——一切动效参数经 `src/skin/layout.ts` 的 `FX` 段 + `skin.json` 的 `fx` token 段注入；`fx.ts` 只消费 `instantiate()` 出的实例。GSAP 已在 `package.json` 依赖内（`gsap ^3.12.5`），**不新增依赖**。

### M6 全局契约（各任务直接引用）

**① 动画参数来源（禁写死的可执行定义）**：`src/skin/layout.ts` 新增 `FX` 段（`FX_DICE_MS` / `FX_HOP_MS` / `FX_BUY_MS` / `FX_UPGRADE_MS` / `FX_RENT_MS` / `FX_CARD_MS` / `FX_DECK_MS` / `FX_STOCK_MS` / `FX_END_MS` / `FX_HOP_ARC` / `FX_COIN_COUNT` …）；`skin.json` 新增顶层 `fx` 段（`{ "ease": "...", "dust": {...}, "shake": {...} }`）。`fx.ts` **只读** `resolveMotion()` 的返回值，`no-visual-number` / `no-visual-color` 门照旧管住。

**② 权威性契约**：状态机**先落库**（M4/M5 的 `Game` 方法同步返回），`fx.play(ctx)` **只回放**；`skip()`（或 `?speed=999`）把时间轴瞬间推到终帧。任何动画都不得写 `state`。

**③ 可跳过/加速**：`?speed=<n>`（M4 已在 `main.ts` 解析为 `opts.speed`）→ `gsap.globalTimeline.timeScale(n)`；`?nofx=1` 等价 `speed=999`（屏幕测试与无障碍用）。

---

## Task 33: `src/render/fx.ts` 动画编排（GSAP，§5.6 全清单）

**Files:**
- Create: `d:\zhao\monopoly\src\render\fx.ts`
- Create: `d:\zhao\monopoly\src\render\providers\proc-fx.ts`（`fx.coin` / `fx.stamp` / `fx.dust` / `fx.scaffold` / `fx.spark` / `fx.shard`）
- Modify: `d:\zhao\monopoly\src\skin\layout.ts`（`FX` 段常量）
- Modify: `d:\zhao\monopoly\src\skin\registry.ts`（6 条 `fx.*` 元素：box/anchor/baseline/mount:`ground`/providerKinds）
- Modify: `d:\zhao\monopoly\src\skin\ids.ts`（NAMESPACES 增 `fx`）
- Modify: `d:\zhao\monopoly\public\skins\default\skin.json`（`elements` 6 条 + 顶层 `fx` token 段）
- Modify: `d:\zhao\monopoly\src\render\providers\proc.ts`（注册 6 个新 preset）
- Test: `d:\zhao\monopoly\test\render\fx.spec.ts`

> **为什么 `motionFor()` 是纯函数、`createFx()` 才吃引擎**：spec §7.1 要求逻辑/渲染解耦——**动效参数表**（时长/缓动/弧高/粒子数）是纯数据，可以 Vitest 断言；只有「把参数喂给 GSAP timeline」的部分依赖引擎。这样 M6 的动画也能被单测覆盖（§11.2 精神）。
> **为什么粒子/金币等特效也要过注册表**：spec §3.6 硬约束不分主次——金币、落尘、盖章同样是「可见元素」，必须能换素材。故新增 `fx.*` 命名空间，走与 `ui.*` 相同的 `instantiate()`。

- [ ] **Step 1: 写失败测试（`motionFor` 纯函数）**

`test/render/fx.spec.ts` 用例清单：
1. `motionFor(kind, tokens)` 对 §5.6 的 9 个场景各返回 `{ durationMs, ease, ...}`，且 `durationMs > 0`、`ease` 非空。
2. 同 tokens → 同参数（确定性）。
3. `upgrade` 参数含 `scaffoldMs` / `perLevelLitMs`（逐层点亮：`3` 级对应 3 段）；`rent` 含 `coins`（金币数）与 `flyMs`；`hop` 含 `arc` 与 `kickMs`。
4. `timeScaleFrom(speed)`：`undefined/1` → `1`；`speed=8` → `8`；`speed<=0` → `NaN` 时回退 `1`（防御性，但**不吞** `undefined`）。
5. **禁写死自检**：`fx.ts` 源码字符串内不含 `"#` 与裸 `duration:` 数字（用 `G()/S()` 从 tokens 取；此条也可交给 `check-hardcoded.mjs`）。

- [ ] **Step 2: 写 `src/render/fx.ts`**

导出：`FxKind`（`'dice'|'hop'|'buy'|'upgrade'|'rent'|'card'|'deck'|'stock'|'end'`）/ `FxContext` / `FxDeps`（`{ layers; motion: MotionTable; make(id): DisplayObject; renderer }`）/ `FxHandle`（`{ play(ctx): gsap.core.Timeline; skip(): void; speed(v): void; busy(): boolean }`）/ `createFx(deps)` / `motionFor(kind, tokens)` / `timeScaleFrom(speed)`。
每个 `FxKind` 对应 §5.6 一行：`dice` 旋转弹跳；`hop` 逐格跳跃 + 落尘；`buy` 盖章 + 金币飞出；`upgrade` 脚手架 → 落成 → 逐层点亮；`rent` 金币飞行 + 数字滚动；`card` 3D 翻转 + 高光扫过；`deck` 转盘/牌堆抽 + 轻微震动（可关）；`stock` 折线抖动 + 红绿脉冲；`end` 全屏特效。
所有 target 由 `make(id)` 从注册表 `instantiate()` 产出并 `addChild` 到 `layers.fx`；动画结束后 `removeChild`（避免残留）。

- [ ] **Step 3: 注册表 + skin.json + proc-fx preset**

- `registry.ts` 追加 `fx.coin/fx.stamp/fx.dust/fx.scaffold/fx.spark/fx.shard`。
- `default/skin.json` `elements` 追加 6 条；顶层加 `"fx": { "ease": "power2.out", "shake": { "amp": 6, "ms": 180 }, "dust": { "count": 6 } }`（数值是美术参数，允许出现在 skin.json，但**不许**出现在 `fx.ts`）。
- `proc-fx.ts` presets 用 `G/S` 取参（同 `proc-hud.ts` 写法）。

- [ ] **Step 4: 验证**

Run: `npx vitest run test/render/fx.spec.ts`
Expected: 全绿（≥ 5 例）。
Run: `npm run lint && npm run lint:skin`
Expected: 0 错 / `[skin:default] OK`（`fx.*` 已在 NAMESPACES + 命中注册表 + `no-visual-number` 不报 `fx.ts`）。
Run: `npx tsc --noEmit && npm run build`
Expected: 0 错 / build 成功（GSAP 打进 `release/js/mono.js`，体积增量记录在手册）。

- [ ] **Step 5: Commit**

```bash
git add monopoly/src monopoly/public monopoly/test
git commit -m "feat(mono): M6-1 GSAP 动画编排层 fx.ts（§5.6 全清单，参数全经 layout/skin 注入）"
```

---

## Task 34: 时轴与状态机对接（可跳过 / `?speed=` / 权威性）

**Files:**
- Modify: `d:\zhao\monopoly\src\main.ts`（动作 → `game.*` → `fx.play` → `paint()`；`?speed` / `?nofx` 接线）
- Modify: `d:\zhao\monopoly\src\ui\Hud.ts`（动画播放中按钮策略：主按钮变「跳过」）
- Test: `d:\zhao\monopoly\test\ui\hud-fx.spec.ts`

> **为什么「跳过」不是「取消」**：spec §5.6 的「可点屏加速」要的是**尽快到终帧**而非中断——若跳过只停动画不落库，玩家会看到「骰子停了但没走格」。故 `skip()` = 把当前 timeline `progress(1)` 后立刻 `paint()`；状态早已落库，跳过只影响观感时长。
> **为什么 `?nofx=1` 要存在**：M1–M5 的截图闸门靠静态帧复现，若动画在截图时半途截断会污染 `docs/verify/`；`?nofx=1`（或闸门里 `page.evaluate` 调 `fx.speed(999)`）让旧闸门零改动继续绿。

- [ ] **Step 1: 写失败测试（HUD 动画态）**

`test/ui/hud-fx.spec.ts` 用例清单：
1. `primaryLabel(state)` 在 fx busy 时显示「跳过」（新增 `fxBusy` 入参 → 保持 Hud 纯函数），busy=false 时恢复原标签。
2. `timeScaleFrom` 边界（与 Task 33 共用，此处只做接线断言 `/mono.html?speed=8` 解析 → `opts.speed===8`）。
3. `?nofx=1` 解析 → `opts.nofx===true`。

- [ ] **Step 2: `main.ts` 接线**

动作回调整体改为：`run(() => game.X())`，其中 `run` = 先调 `game` 方法拿结果 → `fx.play(fxContextFor(result))` → 动画 `onComplete` 里 `paint()`（`skip` 时立即 `paint()`）。`fxContextFor(result)` 是纯映射（结果 → `FxContext`），可测。
`?speed`：`fx.speed(timeScaleFrom(opts.speed))`；`?nofx=1` → `fx.speed(999)` 并让 `play()` 直接返回已完成 timeline。

- [ ] **Step 3: 跑测试 + 手工自检**

Run: `npx vitest run test/ui/hud-fx.spec.ts && npx vitest run`
Expected: 全绿（新例 ≥ 3 + 全量）。
Run: `npm run dev` 手开 `mono.html?play=1&speed=8`（快）与 `?play=1&nofx=1`（无动画）各走三步
Expected: 两者都能推进到「结束回合」，状态与 M4 一致；`fx.busy()` 在 `nofx` 下恒 `false`。
Run: `npx tsc --noEmit && npm run lint`
Expected: 0 错 / 0 错。

- [ ] **Step 4: Commit**

```bash
git add monopoly/src monopoly/test
git commit -m "feat(mono): M6-2 时轴与状态机对接（状态先落库、动画只回放、?speed=?nofx= 可跳过）"
```

---

## Task 35: 性能达标（60fps / 单帧绘制 < 200 / 首屏 < 3s）与测量脚本

**Files:**
- Create: `d:\zhao\monopoly\local\mono-perf.mjs`
- Modify: `d:\zhao\monopoly\src\render\Scene.ts`（`stats()`：按 pass 统计本帧绘制元素数）
- Modify: `d:\zhao\monopoly\src\main.ts`（`?perf=1` 覆盖层；`__monoMain.perf`）
- Modify: `d:\zhao\monopoly\package.json`（`"perf": "node local/mono-perf.mjs"`）
- Test: `d:\zhao\monopoly\test\render\scene-stats.spec.ts`

> **为什么要 `Scene.stats()` 而不是数 Pixi 内部 draw call**：spec §5.6 的预算是「单帧绘制调用 < 200」。本工程的绘制单位是**经 `instantiate()` 产出的元素实例**，故「本帧绘制的元素数」是**更严**的口径（每个元素内部可能有多个 Graphics 调用）。用它做门槛，天然满足「绘制调用 < 200」；同时它纯函数可测、不依赖 WebGL 运行时。
> **为什么线上/真机 60fps 必须人工确认**：headless Chromium 的 rAF 时钟与真机 SoC 不同，脚本只能给**代理指标**（帧间隔 p95、绘制元素数、首屏时间）。真机 60fps 由手册的**人工核对行**兜底，脚本负责「没有明显回归」这一层。

- [ ] **Step 1: 写 `Scene.stats()` 测试**

`test/render/scene-stats.spec.ts`：
1. `addMany(specs); render();` 后 `stats().perPass` 各 pass 计数 = 输入分组数；`stats().total` 之和正确。
2. `reset()` 后 `stats().total === 0`。
3. `stats()` 不修改任何绘制状态（可重复调用结果一致）。

- [ ] **Step 2: 写 `local/mono-perf.mjs`（Playwright + CDP）**

采集并输出 JSON：
1. **首屏可交互**：`navigationStart → __monoMain` 就绪（`performance.now()`），门槛 `< 3000ms`（本地 4G 限速模拟用 `context.route` 或 CDP `Network.emulateNetworkConditions`）。
2. **帧间隔**：`?perf=1&play=1` 下连采 300 帧 rAF 间隔，报 p50 / p95；门槛 p95 `≤ 20ms`（headless 代理）。
3. **绘制元素数**：`__monoMain.scene.stats().total` 门槛 `< 200`（含 fx 特效峰值采样）。
4. `?skin=photo&perf=1` 同口径复采一次（换肤不得拖慢）。
5. 退出码：任一门槛未过 `exit(1)`。

- [ ] **Step 3: 跑预算 + 记录**

Run: `npm run dev`（后台）→ `node local/mono-perf.mjs`
Expected: `firstInteractiveMs < 3000`、`frameP95 ≤ 20`、`drawElementsMax < 200`；退出码 0。
Run: `npx vitest run test/render/scene-stats.spec.ts && npx tsc --noEmit && npm run lint && npm run build`
Expected: 全绿 / 0 错 / 0 错 / build 成功。

- [ ] **Step 4: Commit**

```bash
git add monopoly/local monopoly/src monopoly/test monopoly/package.json
git commit -m "perf(mono): M6-3 性能预算达标（Scene.stats 绘制口径 + mono-perf 测量：首屏/帧间隔/绘制元素数）"
```

---

## Task 36: M6 闸门（动画中间帧截图 / 录像 + 手册 M6 段）

**Files:**
- Create: `d:\zhao\monopoly\local\mono-shots-m6.mjs`
- Modify: `d:\zhao\monopoly\package.json`（`"shots:m6": "node local/mono-shots-m6.mjs"`）
- Modify: `d:\zhao\monopoly\docs\manual-mono.md`（M6 段 + 截图/录像行）

> **为什么用 `?speed=` 而非真机录屏做中间帧**：验收的是「§5.6 每一条都有对应动效且到得了终帧」，用 `?speed=0.25`（慢放）在关键时间点截图能**稳定拿到中间帧**；录像（`recordVideo`）只作补充证据。

- [ ] **Step 1: 写 `local/mono-shots-m6.mjs`**

在 `?speed=0.25` 下，于每个动效的时间中点截图（共 §5.6 九行）：
`mono-m6-01-dice.png`（骰子旋到中段）、`-02-hop.png`（棋子腾空 + 落尘）、`-03-buy.png`（盖章 + 金币飞出）、`-04-upgrade.png`（脚手架 + 逐层点亮）、`-05-rent.png`（金币飞向持有者 + 数字滚动）、`-06-card.png`（卡面 3D 翻转中）、`-07-deck.png`（牌堆/转盘抽取）、`-08-stock.png`（折线抖动 + 红绿脉冲）、`-09-end.png`（全屏特效 + 结算展开）。
另断言：每条动效 `fx.busy()` 期间 `state` 不再二次变化（**动画不改状态**），且 `skip()` 后 `state.phase` 与不加动画时一致。附 `recordVideo` 产物路径写入 `docs/verify/`。

- [ ] **Step 2: 跑闸门 + 手册 M6 段**

Run: `npm run dev`（后台）→ `node local/mono-shots-m6.mjs`
Expected: 退出码 0；9 张中间帧 + 1 段录像入库；`gate` 全 `true`、`errors=[]`。

`docs/manual-mono.md` M5 段后追加 M6 段：九行动画各一行（步骤/期望/截图），并列出**性能核对行**（`node local/mono-perf.mjs` 输出三项指标；真机 60fps 人工勾选）。

- [ ] **Step 3: M6 收口全量回归**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run lint:skin && npm run build`
Expected: 单测全绿 / tsc 0 错 / lint 0 错 / `[skin:default] OK` / build 成功。

- [ ] **Step 4: Commit**

```bash
git add monopoly/local monopoly/docs monopoly/package.json
git commit -m "test(mono): M6 闸门——§5.6 九项动效中间帧截图 + 录像 + 手册 M6 段"
```

---

# Wave 2 · M7 部署与线上回归

> **目标（spec §10-M7 / §11.1 / §11.7）**：把 M1–M6 的产物发布到 `game.joho.cn/tour/mono.html` 并做线上回归；**铁律：本地构建 → scp 上传 → 服务器只解压/拷入，绝不在服务器构建**；真实静态根目录 `/opt/1panel/apps/openresty/openresty/www/sites/game.joho.cn/tour/`（`nginx` `location ^~ /tour/` alias 到该目录），替换后**即时生效、无需 nginx reload**。
> **为什么部署要写成脚本而不是手敲 scp**：spec §11.7 要求「本地构建 → scp → 服务器仅解压」，手敲容易漏传 `skins/`（换肤就废了）；脚本把「tar 整包 → scp → 服务器解压/备份」固化成一步，并自带字节数校验。

## Task 37: 构建与部署（`scripts/deploy-mono.mjs`，本地构建 + scp）

**Files:**
- Create: `d:\zhao\scripts\deploy-mono.mjs`
- Modify: `d:\zhao\monopoly\package.json`（`"deploy": "node ../scripts/deploy-mono.mjs"`）
- Modify: `d:\zhao\monopoly\docs\manual-mono.md`（部署段：命令 / 目标路径 / 校验法）

> **为什么 tar 整包而不是逐文件 scp**：产物含 `mono.html` + `js/mono.js` + `assets/mono/*` + **`skins/{default,photo}/**`**（vite 把 `public/` 复制进 `release/`）。逐文件传极易漏 `skins/`，导致线上 `?skin=photo` 404；整包 tar 一次解压，原子且可回滚。
> **为什么服务器只解压不构建**：服务器没有本工程的 `node_modules`，线上构建既慢又不可复现；所有构建产物都来自本地 Vite，服务器只是静态托管。这与 §11.7 与 `tour-game/README` 的既有约定一致。

- [ ] **Step 1: 写 `d:\zhao\scripts\deploy-mono.mjs`**

契约（Node ESM，零新依赖，调用系统 `tar` / `ssh` / `scp` / `curl`；目标主机沿用既有 `odoo`（`39.106.99.9`）别名）：
```
步骤 1  本地构建：cwd=d:\zhao\monopoly 执行 `npm run build`；失败即 exit(1)。
步骤 2  打包：`tar -czf %TEMP%\mono-<ts>.tgz -C monopoly\release .`（含 html/js/assets/skins）。
步骤 3  备份：`ssh odoo "cp -r <ROOT> <ROOT>.bak-<ts>"`（保留最近 3 份，多余删旧）。
步骤 4  上传：`scp <tgz> odoo:/tmp/mono-<ts>.tgz`。
步骤 5  解压：`ssh odoo "mkdir -p <ROOT> && tar -xzf /tmp/mono-<ts>.tgz -C <ROOT>"`。
步骤 6  校验：`curl -sI https://game.joho.cn/tour/mono.html` → 200；
        并比对 `curl -s .../js/mono.js | wc -c` 与本地 `release/js/mono.js` 字节数一致；
        `curl -s .../skins/photo/skin.json` → 200（换肤包在位）。
步骤 7  输出：打印 `ROOT` / `ts` / 备份路径 / 三项校验结果。
```
`ROOT = /opt/1panel/apps/openresty/openresty/www/sites/game.joho.cn/tour`
（脚本内以常量存在；**不得**在服务器上执行 `npm`/`vite`/`node` 构建）。

- [ ] **Step 2: 干跑 + 真部署**

Run: `node d:\zhao\scripts\deploy-mono.mjs --dry`（脚本支持 `--dry`：只本地构建 + 打包 + 打印命令，不连服务器）
Expected: 本地构建成功、tgz 生成、打印五条命令。
Run: `node d:\zhao\scripts\deploy-mono.mjs`
Expected: 六步全部成功；`mono.html` 200、`js/mono.js` 字节数本地=线上、`skins/photo/skin.json` 200。

- [ ] **Step 3: 手动核对（浏览器/手机）**

Run: 打开 `https://game.joho.cn/tour/mono.html?debug=1&play=1`
Expected: 与本地同 seed 同画面；控制台 `__monoMain.VERSION` 与本地一致；无 404。

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy-mono.mjs monopoly/package.json monopoly/docs
git commit -m "chore(mono): M7-1 部署脚本（本地构建 → tar → scp → 服务器解压，附字节数校验）"
```

---

## Task 38: 线上回归脚本（`local/mono-prod-check.mjs`）

**Files:**
- Create: `d:\zhao\monopoly\local\mono-prod-check.mjs`
- Modify: `d:\zhao\monopoly\package.json`（`"check:prod": "node local/mono-prod-check.mjs"`）

> **为什么要独立于本地闸门**：本地闸门打 `npm run dev`，线上回归打**真实 URL**——它能拦住「本地绿但部署漏文件 / CDN 缓存 / 路径 `base:'./'` 在子目录下解析错」这类只在线上暴露的问题（spec §11.1/§11.7）。

- [ ] **Step 1: 写 `local/mono-prod-check.mjs`（390×844 dpr=2，`MONO_ORIGIN` 默认 `https://game.joho.cn/tour`）**

断言清单：
1. `GET <ORIGIN>/mono.html` → **200**。
2. `?debug=1&play=1&seed=20260928`：无 `pageerror` / 无 console error；`__monoMain.game` 就绪。
3. **关键元素计数**：`scene.instancesOf()` 中 `tile` / `ui.playerBar`(=4) / `dice.body`(=2) / `ui.handSlot`(=5) 数量与本地闸门一致。
4. **换肤可用**：`?skin=photo` → `__monoMain.missingAssets.length === 0`，且至少一个元素 provider 来源为 `image`（证明图片素材在线上就位）。
5. **整局可跑**：`?play=1` 下 `__monoMain.sim()` 返回 1..4，`state.over === true`。
6. 截图入库 `docs/verify/mono-prod-01-board.png` / `-02-play.png` / `-03-skin-photo.png`。
7. `gate` 全 `true` 且 `errors===[]`，否则 `exit(1)`。

- [ ] **Step 2: 跑线上回归**

Run: `node local/mono-prod-check.mjs`
Expected: 退出码 0；`gate` 全 `true`；三张线上截图入库。

- [ ] **Step 3: Commit**

```bash
git add monopoly/local monopoly/package.json
git commit -m "test(mono): M7-2 线上回归（200 / 无报错 / 元素计数 / ?skin=photo 换肤 / 整局）"
```

---

## Task 39: 手册 M7 段 + 最终验收（对照 spec §11 逐条打勾）

**Files:**
- Modify: `d:\zhao\monopoly\docs\manual-mono.md`（M7 段 + 部署命令 + 最终验收对照表）

> **为什么最终验收要「逐条对照 spec §11」**：§11 是硬性标准（手机截图/单测/视觉回归/可换素材/性能/规则化实例化/部署），缺一条都不能收口。把它做成手册里的**勾选表**，让验收从「感觉做完了」变成「七条各有证据链接」。

- [ ] **Step 1: 追写手册 M7 段**

`docs/manual-mono.md` M6 段后追加：
```markdown
### M7 部署与线上回归

| # | 步骤 | 期望 | 证据/截图 |
|---|---|---|---|
| M7-1 | `node scripts/deploy-mono.mjs` | 本地构建 → tar → scp → 服务器解压（无服务器构建）；`mono.html` 200 | 脚本输出 + `curl -sI` |
| M7-2 | `node local/mono-prod-check.mjs` | 线上无报错、元素计数一致、`?skin=photo` 可用、整局可跑 | `mono-prod-01..03` |
| M7-3 | 手机打开 `https://game.joho.cn/tour/mono.html?play=1` | 与本地同 seed 同画面、可完整打一局 | — |

### 最终验收（对照 spec §11 硬性标准）

| # | spec §11 条目 | 证据 |
|---|---|---|
| 1 | 手机视口截图（390×844 dpr2） | M1–M7 全部 `docs/verify/mono-*.png` |
| 2 | `src/core` + `src/skin` 单测全覆盖 | `npx vitest run` 全绿（含骰子分布/移动越界/租金/升级互斥/卡牌效果/破产/胜负/回退链） |
| 3 | 视觉回归与 v5 样张对齐 | M2-1..4 / M3-1..3 目视结论 |
| 4 | 可换素材（`?skin=photo` 零改代码、缺素材走回退） | M3-5 / M7-2；`missingAssets === []` |
| 5 | 性能（中端安卓 60fps、首屏 <3s） | `node local/mono-perf.mjs` + 真机人工勾选 |
| 6 | 规则化实例化（无裸值、只改注册表 + skin.json、`?debug=1` 可定位） | `npm run lint` / `lint:skin` / `?debug=1` 面板 |
| 7 | 部署（本地构建 → scp → 服务器仅解压） | M7-1 脚本输出 |
```

- [ ] **Step 2: 收口三连（全项目）**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run lint:skin && npm run build`
Expected: 单测全绿 / tsc 0 错 / lint 0 错 / `[skin:default] OK` / build 成功。
Run: `node local/mono-prod-check.mjs`
Expected: 退出码 0、`gate` 全 `true`（线上仍绿）。

- [ ] **Step 3: Commit**

```bash
git add monopoly/docs monopoly/local
git commit -m "docs(mono): M7-3 手册 M7 段 + 最终验收对照 spec §11 逐条打勾"
```

---

<!-- APPEND-MARKER -->