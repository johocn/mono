# 大富翁 · AI 对手 + 新手引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让裸链接进站即可单人开局——真人可选 1~4 人，其余席位由**性格化 AI**（保守 / 激进 / 投机）自动接管，并在首次进站时用**四步蒙层**教会上手。

**Architecture:** 新增**纯函数决策层** `src/core/ai.ts`（只产出「要做什么」，无时间概念）与**回合驱动器** `src/ui/aiDriver.ts`（决定「什么时候做、做多久」），两者分离保证决策可单测、节奏可独立调、`core` 不被演出污染。AI 的每一步都必须映射成 `AiStep` 后走 `main.ts` 既有的**唯一出画口 `runAction`**——因此动效、截图闸门、线上回归、e2e 全部天然复用，`src/render/**` 零改动。开局面板（`src/ui/setup.ts`）与新手引导（`src/ui/tutorial.ts` + `src/data/tutorial.ts`）都是 DOM overlay，可见像素全在 DOM/CSS（与 `src/ui/share.ts` 同规），坐标只取自 `hitAreas()` / `src/skin/layout.ts` 常量以消除漂移。

**Tech Stack:** TypeScript + Vite 6 + PixiJS 8 + GSAP + Vitest 2；Playwright（390×844 @dpr2）闸门脚本；Node 22（脚本用内置 `fetch`）。

**依据 spec:** `docs/superpowers/specs/2026-09-29-monopoly-ai-opponent-design.md`

**工作目录约定：** 下述相对路径均相对 `d:\zhao\monopoly`（=`ROOT`）；涉及根仓库的命令显式用 `d:\zhao`。

---

## 两处对 spec 的澄清/偏离（实现前必读）

1. **spec §4.2「投机：迁点到自家高租金」→ 改为「迁点到股票交易所（`STOCK_TILE_INDEX = 19`）」**。
   理由：落在自家地块**没有任何经济收益**（不触发收租），迁过去等于白白浪费一张牌；投机性格的核心是「dip 低位吸纳」，故迁点到交易所后才能立刻执行 `trade` 抄底。落点必须合法：`useCard('teleport', 19)` 仅需 `phase === 'rolled'`（`src/core/game.ts:466-504`）。

2. **`AiStep` 扩展一步 `{ kind: 'close' }`（映射 `game.clearEvent()`）**。
   理由：`endTurn()` **不清 `lastDraw` / `lastEvent`**（`src/core/game.ts:550-554`），而 `overlayOf(state)` 在 `phase === 'settled'` + 非交易所格 + `lastDraw` 非空时会继续显示抽卡浮层 → AI 抽卡后若不收口，**上一家的陈旧卡面会残留到下一位玩家**。故 `decideTurn` 在 `settled` 分支产出 `[...postSettle, ...(state.lastDraw ? [{ kind: 'close' }] : []), { kind: 'end' }]`。

**另一处必须写进计划的爆炸半径（不是 spec 偏离，是本设计的必然副作用）：** 裸入口 / `?play=1`（不带 `?humans=`）将**先弹开局面板**、`__monoMain.game === null`。这会打破**全部 play 模式闸门脚本**的既有口径（见 Task 7 的口径搬迁清单）。

---

## 文件结构（改动面）

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/data/ai.ts` | 性格档案（标签 / 参数表 / URL 解析），纯数据 | 新增 |
| `src/core/ai.ts` | 纯函数决策层：`decideTurn` / `applyStep` / 席位辅助；再导出 `personaParams` | 新增 |
| `src/ui/aiDriver.ts` | 回合驱动器：rAF 轮询、节奏、浮层收口、加速 / 跳过 | 新增 |
| `src/ui/setup.ts` | 开局面板（版式 B）：人数 2×2 大卡 + 性格徽标卡 | 新增 |
| `src/ui/tutorial.ts` | 四步蒙层引导（高亮取自 `hitAreas` / layout 常量） | 新增 |
| `src/data/tutorial.ts` | 引导四步文案与步骤表（集中一处，便于后续接 i18n） | 新增 |
| `src/skin/layout.ts` | 新增 AI / 引导常量（禁裸值 gate 的同域常量区） | 修改 |
| `src/skin/registry.ts` | 新增 3 个注册表元素：`ui.button.wide` / `ui.qk` / `ui.personaTag` | 修改 |
| `public/skins/default/skin.json` | 上述 3 元素的 proc preset + params | 修改 |
| `tools/registry-ids.json` | 由 `tools/gen-registry-ids.mjs` 重生成 | 重生成 |
| `src/render/providers/proc-hud.ts` | `uiLabel` 支持 `state.dx`（状态行左移，给「加速/跳过」让位） | 修改 |
| `src/ui/Hud.ts` | AI 回合：整行主按钮 + 性格徽标 + 加速/跳过命中区与 spec | 修改 |
| `src/main.ts` | 唯一接线点：席位归属、driver、setup / tutorial、URL 参数、`dispatch` | 修改 |
| `test/core/ai.spec.ts` | 决策层单测（性格差异 / 合法性 / 确定性） | 新增 |
| `test/ui/ai-driver.spec.ts` | 驱动器单测（推进 / 跳过 / 不驱动真人） | 新增 |
| `test/ui/tutorial.spec.ts` | 引导单测（步进 / 跳过 / 标记 / URL 开关） | 新增 |
| `test/ui/hud.spec.ts` | 增 AI 回合用例（整行按钮 / 徽标 / 加速跳过 / 全禁用） | 修改 |
| `test/smoke.spec.ts` | `parseOptions` 增 `humans` / `ai` / `tour`（两处 `toEqual` 全等断言必须同步） | 修改 |
| `local/mono-shots-ai.mjs` | 新闸门：AI 开局 / 自动推进 / HUD 禁用 / 四步引导截图 | 新增 |
| `local/mono-prod-check.mjs` | 裸入口 gate 改为断言开局面板 + 新增 `?humans=1` gate | 修改 |
| `local/mono-e2e-playthrough.mjs` | 增「AI 局跑到 `over=true`」用例 + URL 口径 | 修改 |
| `local/mono-share-check.mjs` / `mono-shots-m4.mjs` / `m5.mjs` / `m6.mjs` / `mono-perf.mjs` / `mono-perf-android.mjs` | URL 口径搬迁 `humans=4&tour=0` | 修改 |
| `docs/manual-mono.md` | 增 M9（AI 对手 + 开局）与 M10（新手引导）两节 + URL 参数行 | 修改 |
| `docs/verify/*.png` | 手机视口截图入库（390×844 @dpr2） | 新增 |

不改：`src/render/**`（除 `proc-hud.ts` 的 `uiLabel` 一处 `dx`）、`src/core/game.ts`、经济数值、棋盘数据、`public/skins/photo/skin.json`（photo 只覆盖少量元素，新增元素回退 default）。

---

## Task 1: `src/data/ai.ts` —— 性格档案数据层（TDD）

**Files:**
- Create: `src/data/ai.ts`
- Test: `test/core/ai.spec.ts`（本任务先建文件，只放数据层用例）

- [ ] **Step 1: 写测试（先失败）**

新建 `test/core/ai.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_ORDER, PERSONAS, PERSONA_DESC, PERSONA_LABEL, PERSONA_PARAMS,
  isPersona, parsePersonaList, personaParams,
} from '../../src/data/ai';

describe('ai 性格档案', () => {
  it('三种性格的标签与说明齐备', () => {
    expect(PERSONAS).toEqual(['conservative', 'aggressive', 'speculative']);
    for (const p of PERSONAS) {
      expect(PERSONA_LABEL[p]).toBeTruthy();
      expect(PERSONA_DESC[p]).toBeTruthy();
    }
  });
  it('参数表逐项对齐 spec §4.2', () => {
    expect(PERSONA_PARAMS.conservative.reserve).toBe(400);
    expect(PERSONA_PARAMS.aggressive.reserve).toBe(100);
    expect(PERSONA_PARAMS.speculative.reserve).toBe(200);
    expect(PERSONA_PARAMS.conservative.buyMax).toBe(300);
    expect(PERSONA_PARAMS.aggressive.buyMax).toBe(Infinity);
    expect(PERSONA_PARAMS.conservative.upgradeEager).toBe(false);
    expect(PERSONA_PARAMS.aggressive.upgradeEager).toBe(true);
    expect(PERSONA_PARAMS.speculative.cardPolicy).toBe('arbitrage');
    expect(PERSONA_PARAMS.conservative.stockPolicy).toBe('none');
    expect(PERSONA_PARAMS.aggressive.stockPolicy).toBe('momentum');
    expect(PERSONA_PARAMS.speculative.stockPolicy).toBe('dip');
    expect(PERSONA_PARAMS.conservative.targetLeader).toBe(false);
    expect(PERSONA_PARAMS.aggressive.targetLeader).toBe(true);
    expect(personaParams('speculative')).toBe(PERSONA_PARAMS.speculative);
  });
  it('isPersona / parsePersonaList 丢弃非法项', () => {
    expect(isPersona('aggressive')).toBe(true);
    expect(isPersona('hard')).toBe(false);
    expect(parsePersonaList('conservative,aggressive,speculative')).toEqual(DEFAULT_AI_ORDER);
    expect(parsePersonaList('speculative,bogus,conservative')).toEqual(['speculative', 'conservative']);
    expect(parsePersonaList(null)).toEqual([]);
    expect(parsePersonaList('')).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（`cwd=d:\zhao\monopoly`）: `npx vitest run test/core/ai.spec.ts`
Expected: FAIL — `Failed to resolve import "../../src/data/ai"`。

- [ ] **Step 3: 建 `src/data/ai.ts`**

```ts
/**
 * AI 性格档案（spec §4.2）：标签 / 参数表 / URL 解析。
 * 放 `data/` 而非 `core/`：`core/ai.ts` 需要读参数表，而 `core → data` 是本仓库既有方向
 * （`core/game.ts` 已 import `data/board`、`data/cards`、`data/stocks`）；若把参数表放 core，
 * 反而会让 `ui/setup.ts`（只需标签）产生 `ui → core` 的新依赖。
 */

export type Persona = 'conservative' | 'aggressive' | 'speculative';

/** 席位归属：`null` = 真人，否则为 AI 性格 */
export type Seat = Persona | null;

export const PERSONAS: Persona[] = ['conservative', 'aggressive', 'speculative'];

export const PERSONA_LABEL: Record<Persona, string> = {
  conservative: '保守', aggressive: '激进', speculative: '投机',
};

/** 开局面板徽标卡的一句话说明（≤ 8 字） */
export const PERSONA_DESC: Record<Persona, string> = {
  conservative: '稳守 · 留钱', aggressive: '猛攻 · 盯第一', speculative: '捡漏 · 打股',
};

/** 其余席位按序补 AI 的默认顺序（spec §6） */
export const DEFAULT_AI_ORDER: Persona[] = ['conservative', 'aggressive', 'speculative'];

/** 投机仅在末段（round ≥ 此值）才针对领先者（spec §4.2） */
export const SPEC_LEADER_MIN_ROUND = 8;

export interface AiParams {
  reserve: number;
  buyMax: number;
  upgradeEager: boolean;
  cardPolicy: 'defensive' | 'offensive' | 'arbitrage';
  stockPolicy: 'none' | 'momentum' | 'dip';
  targetLeader: boolean;
}

export const PERSONA_PARAMS: Record<Persona, AiParams> = {
  conservative: { reserve: 400, buyMax: 300, upgradeEager: false, cardPolicy: 'defensive', stockPolicy: 'none', targetLeader: false },
  aggressive: { reserve: 100, buyMax: Infinity, upgradeEager: true, cardPolicy: 'offensive', stockPolicy: 'momentum', targetLeader: true },
  speculative: { reserve: 200, buyMax: Infinity, upgradeEager: true, cardPolicy: 'arbitrage', stockPolicy: 'dip', targetLeader: true },
};

export function personaParams(p: Persona): AiParams {
  return PERSONA_PARAMS[p];
}

export function isPersona(v: string): v is Persona {
  return (PERSONAS as string[]).includes(v);
}

/** `?ai=conservative,aggressive,speculative` → 合法项按原序保留，非法项静默丢弃 */
export function parsePersonaList(raw: string | null): Persona[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(isPersona);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/core/ai.spec.ts`
Expected: PASS（3 例）。

- [ ] **Step 5: 提交**

```bash
git -C d:\zhao add monopoly/src/data/ai.ts monopoly/test/core/ai.spec.ts
git -C d:\zhao commit -m "feat(mono): AI 性格档案数据层（标签/参数表/URL 解析）"
```

---

## Task 2: `src/core/ai.ts` —— 纯函数决策层（TDD）

**Files:**
- Create: `src/core/ai.ts`
- Test: `test/core/ai.spec.ts`（追加 `decideTurn` 三组用例）

**已核实的既有 API（写代码时直接引用，勿再造）**
- `src/data/cards.ts`：`ItemCardKind`、`BOMB_RANGE = 1`、`BARRIER_RANGE = 6`
- `src/data/board.ts`：`RING_SIZE = 32`
- `src/data/economy.ts`：`MAX_LEVEL`、`buyPrice(level)`、`nextLevel(level)`、`canUpgrade(level)`
- `src/core/estate.ts`：`buyable(index)`、`canBuy(estates, index, cash)`、`ownedBy(estates, owner)`
- `src/core/game.ts`：`Game`、`GameState`、`Phase`、`currentPlayer(state)`、`netWorth(state, player)`
- `src/data/stocks.ts`：`STOCK_TILE_INDEX = 19`、`STOCKS`
- 升级价 = `buyPrice(nextLevel(level))`（L1→L2 = 180，与 HUD 报价一致）

- [ ] **Step 1: 追加测试（先失败）**

在 `test/core/ai.spec.ts` 追加：

```ts
import { createGame, currentPlayer, netWorth } from '../../src/core/game';
import { applyStep, decideTurn, type AiStep } from '../../src/core/ai';

describe('decideTurn 性格差异', () => {
  it('保守：现金低于 reserve(400) 时不买地；高于时不阻挠', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    me.pos = 1; me.cash = 300;              // 空地 + 现金 300 < 400
    g.state.phase = 'settled';
    expect(decideTurn(g.state, 'conservative').some((s) => s.kind === 'buy')).toBe(false);
    me.cash = 2000;
    expect(decideTurn(g.state, 'conservative').some((s) => s.kind === 'buy')).toBe(true);
  });

  it('激进：手牌目标选净资产最高者（领先者）', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    g.state.phase = 'idle';
    const foe = g.state.players.filter((p) => p.id !== me.id);
    foe.forEach((p, i) => { p.pos = 2 + i * 4; });
    foe[1].cash = 99999;                    // 玩家 3 = 净资产最高
    const step = decideTurn(g.state, 'aggressive').find((s) => s.kind === 'card') as
      Extract<AiStep, { kind: 'card' }> | undefined;
    expect(step).toBeTruthy();
    expect(step!.target).toBe(foe[1].pos);
  });

  it('投机：round < 8 不打领先者；round ≥ 8 才打', () => {
    const g = createGame({ seed: 3 });
    g.state.phase = 'idle';
    g.state.round = 1;
    expect(decideTurn(g.state, 'speculative').some((s) => s.kind === 'card')).toBe(false);
    g.state.round = 9;
    expect(decideTurn(g.state, 'speculative').length).toBeGreaterThan(0);
  });

  it('投机：phase=rolled 且未在交易所时，迁点到股票交易所 19', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    me.pos = 5; g.state.phase = 'rolled'; me.cash = 3000;
    expect(decideTurn(g.state, 'speculative')[0]).toEqual({ kind: 'card', card: 'teleport', target: 19 });
    me.pos = 19;
    expect(decideTurn(g.state, 'speculative')[0]).toEqual({ kind: 'move' });
  });
});

describe('decideTurn 合法性与确定性', () => {
  it('随机 60 个 state：产出的每一步都能被对应 Game API 成功执行', () => {
    for (let k = 1; k <= 60; k++) {
      const g = createGame({ seed: k });
      for (let i = 0; i < 40; i++) {
        const persona = (['conservative', 'aggressive', 'speculative'] as const)[i % 3];
        const plan = decideTurn(g.state, persona);
        for (const step of plan) {
          const r = applyStep(g, step) as { ok?: boolean; reason?: string } | undefined;
          if (r && r.ok === false) {
            throw new Error(`seed ${k} step ${JSON.stringify(step)} → ${String(r.reason)}`);
          }
          if (g.state.over) break;
        }
        if (g.state.over) break;
      }
    }
  });

  it('同 state + 同 persona 调两次，结果深度相等', () => {
    const g = createGame({ seed: 11 });
    g.state.phase = 'settled';
    const a = decideTurn(g.state, 'aggressive');
    const b = decideTurn(g.state, 'aggressive');
    expect(a).toEqual(b);
  });

  it('结束态不再产出任何步骤', () => {
    const g = createGame({ seed: 5 });
    g.state.over = true;
    expect(decideTurn(g.state, 'aggressive')).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/core/ai.spec.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/ai"`。

- [ ] **Step 3: 建 `src/core/ai.ts`**

```ts
/**
 * 性格化 AI 决策层（spec §4）：纯函数，**无 await / 无定时器 / 无时间概念**。
 * 只产出「要做什么」（`AiStep[]`，对既有 Game API 的调用意图）；
 * 「什么时候做、做多久」全部由 `src/ui/aiDriver.ts` 决定。
 */
import type { GameState, Game, Phase } from './game';
import { currentPlayer, netWorth } from './game';
import { canBuy, buyable, ownedBy } from './estate';
import { buyPrice, canUpgrade, nextLevel } from '../data/economy';
import { BARRIER_RANGE, BOMB_RANGE, type ItemCardKind } from '../data/cards';
import { RING_SIZE } from '../data/board';
import { STOCK_TILE_INDEX, STOCKS } from '../data/stocks';
import { SPEC_LEADER_MIN_ROUND, personaParams, type AiParams, type Persona } from '../data/ai';

export { personaParams } from '../data/ai';
export type { AiParams, Persona, Seat } from '../data/ai';

/** 计划中的一步；`close` 见计划抬头「澄清 2」（收口浮层，避免陈旧卡面残留到下一位） */
export type AiStep =
  | { kind: 'skip' }
  | { kind: 'card'; card: ItemCardKind; target?: number }
  | { kind: 'trade'; code: string; shares: number }
  | { kind: 'buy' } | { kind: 'upgrade' }
  | { kind: 'roll' } | { kind: 'move' } | { kind: 'settle' }
  | { kind: 'close' } | { kind: 'end' };

/** `AiStep` → `Game` API 的唯一纯映射（绝不抛错；合法性由 decideTurn 前置保证） */
export function applyStep(g: Game, step: AiStep): unknown {
  switch (step.kind) {
    case 'skip': return g.skipTurn();
    case 'card': return g.useCard(step.card, step.target);
    case 'trade': return g.trade(step.code, step.shares);
    case 'buy': return g.buyCurrent();
    case 'upgrade': return g.upgradeCurrent();
    case 'roll': return g.rollDice();
    case 'move': return g.moveCurrent();
    case 'settle': return g.settleCurrent();
    case 'close': return g.clearEvent();
    case 'end': return g.endTurn();
  }
}

/** 净资产最高者（并列取小 id）；无未破产玩家时返回 null */
export function leaderOf(state: GameState): number | null {
  const alive = state.players.filter((p) => !p.bankrupt);
  if (alive.length === 0) return null;
  return alive.reduce((best, p) => (netWorth(state, p) > netWorth(state, best) || (netWorth(state, p) === netWorth(state, best) && p.id < best.id) ? p : best)).id;
}

/** 领先者名下最高等级的地块格号（并列取小格号）；无地时返回 null */
export function leaderBestTile(state: GameState): number | null {
  const id = leaderOf(state);
  if (id === null) return null;
  const tiles = ownedBy(state.estates, id);
  if (tiles.length === 0) return null;
  return tiles.reduce((best, t) => ((state.estates[t]?.level ?? 0) > (state.estates[best]?.level ?? 0) || ((state.estates[t]?.level ?? 0) === (state.estates[best]?.level ?? 0) && t < best) ? t : best));
}

/**
 * 是否针对领先者：保守恒 false；激进恒 true；投机仅 `round >= SPEC_LEADER_MIN_ROUND`。
 * 合成参数（spec §4.2「upgradeEager 投机仅已持同级 ≥2 块」）另由 sameLevelCount 控制。
 */
export function targetsLeader(state: GameState, persona: Persona): boolean {
  const P = personaParams(persona);
  if (!P.targetLeader) return false;
  return persona === 'speculative' ? state.round >= SPEC_LEADER_MIN_ROUND : true;
}

/** 某玩家在指定等级的持地数（投机升级门槛用） */
export function sameLevelCount(state: GameState, owner: number, level: number): number {
  return ownedBy(state.estates, owner).filter((t) => state.estates[t]?.level === level).length;
}

/** 某玩家达标（≥ minLevel）的地块列表 */
export function ownedFrom(state: GameState, owner: number, minLevel: number): number[] {
  return ownedBy(state.estates, owner).filter((t) => (state.estates[t]?.level ?? 0) >= minLevel);
}

/**
 * 选一支可买的股票（不产生副作用）：
 * - `momentum` 追涨：现价 > 上市价，取涨幅最大者
 * - `dip` 低位吸纳：现价 > 上市价，取「距历史最高」回撤最大者
 * - `none` / 无候选 → null
 */
export function pickStock(state: GameState, P: AiParams, cash: number): string | null {
  if (P.stockPolicy === 'none') return null;
  const cand: Array<{ code: string; score: number; price: number }> = [];
  for (const def of STOCKS) {
    const price = state.quotes[def.code];
    if (typeof price !== 'number' || price <= 0) continue;
    if (price > cash - P.reserve) continue;             // 买 1 股后仍留 reserve
    const hist = state.priceHistory[def.code] ?? [];
    const peak = hist.length > 0 ? Math.max(...hist) : price;
    if (P.stockPolicy === 'momentum') {
      const gain = price - def.base;
      if (gain > 0) cand.push({ code: def.code, score: gain, price });
    } else {
      const drawdown = peak - price;
      if (drawdown > 0) cand.push({ code: def.code, score: drawdown, price });
    }
  }
  if (cand.length === 0) return null;
  cand.sort((a, b) => (b.score - a.score) || (a.code < b.code ? -1 : 1));
  return cand[0].code;
}

/* —— 各阶段的分支 —— */

function idlePlan(state: GameState, persona: Persona, P: AiParams): AiStep[] {
  const me = currentPlayer(state);
  if ((state.jail[me.id] ?? 0) > 0) return [{ kind: 'skip' }];
  const pre: AiStep[] = [];
  if (P.cardPolicy === 'offensive' && targetsLeader(state, persona)) {
    if (state.hands[me.id - 1]?.includes('bomb')) {
      const t = leaderBestTile(state);
      if (t !== null && t !== me.pos) pre.push({ kind: 'card', card: 'bomb', target: t });
    }
    /* 路障：铺在领先者前方 BARRIER_RANGE 内最近的一格（确定性，不引入随机源） */
    if (state.hands[me.id - 1]?.includes('barrier')) {
      const l = leaderOf(state);
      const lp = l === null ? null : state.players.find((p) => p.id === l)?.pos ?? null;
      if (lp !== null) {
        const t = (lp + 3) % RING_SIZE;
        if (!state.estates[t] && !state.barriers[t] && t !== me.pos) pre.push({ kind: 'card', card: 'barrier', target: t });
      }
    }
  }
  return [...pre, { kind: 'roll' }];
}

function rolledPlan(state: GameState, persona: Persona, P: AiParams): AiStep[] {
  const me = currentPlayer(state);
  /* 投机迁点的落点见计划抬头「澄清 1」：交易所（而非自家地块，落自家无任何收益） */
  if (persona === 'speculative' && me.pos !== STOCK_TILE_INDEX && state.hands[me.id - 1]?.includes('teleport')) {
    return [{ kind: 'card', card: 'teleport', target: STOCK_TILE_INDEX }];
  }
  return [{ kind: 'move' }];
}

function settledPlan(state: GameState, persona: Persona, P: AiParams): AiStep[] {
  const me = currentPlayer(state);
  const post: AiStep[] = [];
  const pos = me.pos;
  const e = state.estates[pos];

  /* ① 买地：可买 + 无主 + 不超 buyMax + 买后仍 ≥ reserve */
  if (buyable(pos) && !e) {
    const cost = buyPrice(1);
    if (cost <= P.buyMax && canBuy(state.estates, pos, me.cash) && me.cash - cost >= P.reserve) post.push({ kind: 'buy' });
  }

  /* ② 升级：自有 + 可升级 + upgradeEager + 不在施工 + 现金门（投机另需已持同级 ≥2 块） */
  if (e && e.owner === me.id && canUpgrade(e.level) && P.upgradeEager && !e.processing) {
    const cost = buyPrice(nextLevel(e.level));
    const gate = persona === 'speculative' ? sameLevelCount(state, me.id, e.level) >= 2 : true;
    if (gate && me.cash - cost >= P.reserve) post.push({ kind: 'upgrade' });
  }

  /* ③ 股票：仅站在交易所，且本回合尚未交易（trade 守卫，防死循环） */
  if (pos === STOCK_TILE_INDEX && state.lastEvent?.kind !== 'trade') {
    const code = pickStock(state, P, me.cash);
    if (code) post.push({ kind: 'trade', code, shares: 1 });
  }

  /* ④ 投机专项：租金翻倍（持牌 + 本回合未用 + 现金门 + 已有 ≥2 级地块） */
  if (persona === 'speculative' && state.hands[me.id - 1]?.includes('doubleRent') && !state.doubleRent[me.id] && me.cash >= P.reserve && ownedFrom(state, me.id, 2).length > 0) {
    post.push({ kind: 'card', card: 'doubleRent' });
  }

  return [
    ...post,
    ...(state.lastDraw ? [{ kind: 'close' } as AiStep] : []),
    { kind: 'end' },
  ];
}

/**
 * 从**当前状态出发**、本回合剩余的有序计划。驱动器每步前重算一次、只执行 `plan[0]`，
 * 故返回值恒可安全重入。任一步在生成时就校验前置条件，绝不产出非法动作。
 */
export function decideTurn(state: GameState, persona: Persona): AiStep[] {
  if (state.over) return [];
  const P = personaParams(persona);
  const phase: Phase = state.phase;
  if (phase === 'idle') return idlePlan(state, persona, P);
  if (phase === 'rolled') return rolledPlan(state, persona, P);
  if (phase === 'moved') return [{ kind: 'settle' }];
  return settledPlan(state, persona, P);
}
```

> 注：`state.quotes` / `state.priceHistory` / `state.doubleRent` / `state.jail` / `state.hands` / `state.barriers` / `state.lastEvent` / `state.lastDraw` 均为既有字段（`src/core/game.ts:65-100`）；`STOCKS[].base` 为 `src/data/stocks.ts:6-19` 的上市价字段（若实际字段名为 `price`，以实际为准）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/core/ai.spec.ts`
Expected: PASS（3 + 7 例）。若「随机 60 个 state」用例失败，**不要放宽断言**——那是决策层产出了非法步，按报错的 `step` + `reason` 回查对应分支的守卫。

- [ ] **Step 5: 提交**

```bash
git -C d:\zhao add monopoly/src/core/ai.ts monopoly/test/core/ai.spec.ts
git -C d:\zhao commit -m "feat(mono): AI 决策层 decideTurn/applyStep（性格差异 + 合法性 + 确定性）"
```

---

## Task 3: 注册表三元素 + layout 常量 + `Hud.ts` AI 回合（TDD）

**Files:**
- Modify: `src/skin/registry.ts`（`ui` 段）
- Modify: `public/skins/default/skin.json:123` 之后
- Regenerate: `tools/registry-ids.json`
- Modify: `src/skin/layout.ts`（HUD 常量区 + 新增 AI/引导常量）
- Modify: `src/render/providers/proc-hud.ts:110-114`（`uiLabel` 支持 `state.dx`）
- Modify: `src/ui/Hud.ts`
- Test: `test/ui/hud.spec.ts`（追加 AI 回合用例）

**三个新元素的存在理由（先读，决定方案取舍）**
- proc preset 的缩放是**统一标量** `box.w * s` → 98×46 的 `ui.button.primary` 无法拉成 328×46 → 必须新增 `ui.button.wide`。
- `TextRequest.size` **不乘 `s`**（`src/render/paint.ts:37-51` 的 `makeText` 直接用 `fontSize: req.size`）→ 不能把 `ui.badge`（120×26、13px 级文字）缩小当性格徽标（文字会溢出框）→ 必须新增 `ui.personaTag`（skin 里把 `badgeFs` 调到 9）；
- 同理「加速 ×2 / 跳过本次」小键不能复用 46 高的 `ui.button.secondary` → 新增 `ui.qk`（skin 里 `btnFs: 11, btnR: 6`）。

- [ ] **Step 1: 追加测试（先失败）**

在 `test/ui/hud.spec.ts` 追加（顶部补 `import type { Seat } from '../../src/data/ai';`）：

```ts
describe('hud spec 组装（AI 回合）', () => {
  const seats: Seat[] = [null, 'conservative', 'aggressive', 'speculative'];

  it('AI 回合：整行主按钮 + 两枚快捷键，不出买地/升级次要按钮', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 1;                       // 席位 1 = 保守 AI
    const specs = hudSpecs(g.state, false, seats, false);
    expect(byId('ui.button.wide').length).toBe(1);
    expect(byId('ui.button.primary').length).toBe(0);
    expect(byId('ui.button.secondary').length).toBe(0);
    expect(byId('ui.qk').length).toBe(2);
    expect(specs[specs.length - 1].id).toBe('ui.qk');
    const wide = byId('ui.button.wide')[0];
    expect(wide.state.enabled).toBe(false);
    expect(String(wide.state.label)).toContain('AI 思考中');
    expect(String(wide.state.label)).toContain('保守');
    expect(wide.fixed.cx).toBe(HUD_BTN_AI_X + HUD_BTN_AI_W / 2);
  });

  it('AI 回合：每个 AI 席位在其资产条后紧跟一枚性格徽标（真人席位不推）', () => {
    const g = createGame({ seed: 1 });
    const specs = hudSpecs(g.state, false, seats, false);
    expect(byId('ui.personaTag').length).toBe(3);
    const bars = specs.filter((s) => s.id === 'ui.playerBar').map((s) => s.r);
    for (const tag of specs.filter((s) => s.id === 'ui.personaTag')) {
      expect(bars).toContain(tag.r);
    }
  });

  it('加速态标签切换为「加速 ✓」', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 1;
    const fast = hudSpecs(g.state, false, seats, true).filter((s) => s.id === 'ui.qk');
    expect(String(fast[0].state.label)).toContain('✓');
  });

  it('AI 回合命中层：主按钮禁用 + 两枚快捷键可点', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 2;
    const areas = hitAreas(g.state, seats);
    expect(areas.length).toBe(3);
    expect(areas[0].enabled).toBe(false);
    expect(areas[0].x).toBe(HUD_BTN_AI_X);
    expect(areas[0].w).toBe(HUD_BTN_AI_W);
    expect(areas[0].x + areas[0].w).toBeLessThanOrEqual(STAGE_W);
    expect(areas.map((a) => a.action)).toEqual([expect.any(String), 'ai:fast', 'ai:skip']);
    expect(areas[1].enabled).toBe(true);
    expect(areas[2].enabled).toBe(true);
  });

  it('真人回合不受影响：仍出 primary + 买/升级', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 0;                       // 席位 0 = 真人
    expect(byId('ui.button.wide').length).toBe(0);
    expect(byId('ui.button.primary').length).toBe(1);
    expect(byId('ui.qk').length).toBe(0);
  });
});
```

`createGame` / `byId` / `HUD_*` 沿用该文件既有 import 与 helper。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui/hud.spec.ts`
Expected: FAIL — `byId('ui.button.wide').length` 得 0、`hitAreas` 只有长度 1~2、`HUD_BTN_AI_X` 未定义。

- [ ] **Step 3: 注册表新增 3 个元素**

在 `src/skin/registry.ts` 的 `ui` 段、`ui.button.secondary` 之后插入：

```ts
reg['ui.button.wide'] = { box: { w: 328, d: 1, h: 46 } };
reg['ui.qk'] = { box: { w: 72, d: 1, h: 22 } };
reg['ui.personaTag'] = { box: { w: 34, d: 1, h: 13 } };
```

（`reg['ui.button.primary']` / `reg['ui.button.secondary']` 即用此写法，紧跟其后保持一致。）

- [ ] **Step 4: 皮肤包补 3 条（default 即可，photo 无需改）**

`public/skins/default/skin.json` 第 123 行 `"ui.button.secondary"` 之后插入：

```json
    "ui.button.wide": { "kind": "proc", "preset": "uiButton", "params": {} },
    "ui.qk": { "kind": "proc", "preset": "uiButton", "params": { "btnFs": 11, "btnR": 6 } },
    "ui.personaTag": { "kind": "proc", "preset": "uiBadge", "params": { "badgeFs": 9 } },
```

- [ ] **Step 5: 重生成 ID 清单并校验皮肤**

Run: `node tools/gen-registry-ids.mjs; npm run lint:skin`
Expected: `tools/registry-ids.json` 含 `ui.button.wide` / `ui.qk` / `ui.personaTag`；输出 `[skin:default] OK` / `[skin:photo] OK`。

- [ ] **Step 6: layout 常量**

在 `src/skin/layout.ts` 的 HUD 常量区（`HUD_BTN_UPGRADE_X` 之后）插入：

```ts
/* —— AI 回合（spec §5.2）：整行主按钮 + 状态行右侧两枚快捷键 —— */
export const HUD_BTN_AI_X = 31;
export const HUD_BTN_AI_W = 328;
export const HUD_QK_W = 72;
export const HUD_QK_H = 22;
export const HUD_QK_FAST_X = 211;
export const HUD_QK_SKIP_X = 287;
/** 快捷键顶边 y；中心 = HUD_LABEL_Y（状态行中心），即右侧 211..359 / 287..359 */
export const HUD_QK_Y = 607;
/** AI 回合把状态行文字左移，给右侧快捷键让位 */
export const HUD_LABEL_SHIFT_X = -90;
/** 性格徽标相对资产条中心的偏移（贴右上角，右缘与资产条右缘齐平） */
export const HUD_PERSONA_DX = 26;
export const HUD_PERSONA_DY = -11;
```

并在 M6 动效常量区之后新增：

```ts
/* —— AI 驱动器（spec §5.3）—— */
export const AI_STEP_MS = 450;
export const AI_FAST_FACTOR = 2;
/** skipRest 的单次上限（防御性兜底，正常远小于此） */
export const AI_SKIP_MAX_STEPS = 64;

/* —— 新手引导（spec §7.3）—— */
export const TUTORIAL_GAP = 12;
```

- [ ] **Step 7: `uiLabel` 支持 `state.dx`**

`src/render/providers/proc-hud.ts:110-114` 改为：

```ts
/* —— 状态行：居中单行文字（轮次 / 胜负 / 提示）；`state.dx` 供 AI 回合给右侧快捷键让位 —— */
export const uiLabel: ProcPreset = (_g, ctx) => {
  const { cx, cy, params, state, text } = ctx;
  if (!text) return;
  const dx = typeof state.dx === 'number' ? state.dx : 0;
  text({ text: typeof state.text === 'string' ? state.text : '', x: cx + dx, y: cy, size: G(params, 'labelFs'), fill: S(params, 'labelFill') });
};
```

Run: `npm run lint`（确认 `src/render/**` 的禁裸值 gate 仍通过——`0` 是中性默认，非视觉常量）
Expected: 0 错。

- [ ] **Step 8: 改 `src/ui/Hud.ts`**

四处改动（其余不动）：

1) 类型与签名：

```ts
export type HudActionId = HudPrimaryAction | 'buy' | 'upgrade' | 'ai:fast' | 'ai:skip';

/** AI 席位（`null` = 真人）；从 `src/data/ai` 取，避免 ui → ui 横向依赖 */
import type { Persona, Seat } from '../data/ai';
```

`hudSpecs(state, fxBusy = false, seats: readonly Seat[] = [], fast = false): ElementSpec[]`
`hitAreas(state, seats: readonly Seat[] = []): HitArea[]`
`primaryLabel(state, fxBusy = false, aiPersona: Persona | null = null)`

2) 内部 helper 的 `slot` 形参改为缩放形参（性格徽标需要把 34×13 的 box 原样画，用 `s = 1`）：

```ts
  const bar = (id: string, r: number, cx: number, cy: number, st: Record<string, unknown>, s = 1): void => {
    out.push({ id, slot: null, c: 0, r, pass: 4, fixed: { cx, cy, s }, state: st });
  };
```

> 该 helper 原第 4 个可选参为 `slot`，全仓只在 `hudSpecs` 内部使用；改为 `s` 后必须同步检查三个调用点（`ui.dock` / `ui.label` / `ui.playerBar`）都不再传第 6 参。

3) AI 回合分支（在推 `ui.playerBar` 的循环里紧跟徽标；在推按钮的位置分叉）：

```ts
  const aiSeat = seats[state.current] ?? null;
  /* ui.playerBar + 性格徽标（同一 r，数组后置保证画在条上） */
  for (let i = 0; i < state.players.length; i++) {
    const cx = barCx(i);
    bar('ui.playerBar', 2 + i, cx, HUD_BAR_Y + HUD_BAR_H / 2, barState(i));
    if (seats[i]) bar('ui.personaTag', 2 + i, cx + HUD_PERSONA_DX, HUD_BAR_Y + HUD_BAR_H / 2 + HUD_PERSONA_DY, { text: PERSONA_LABEL[seats[i] as Persona] });
  }
  /* 状态行：AI 回合左移给快捷键让位 */
  ...
  if (aiSeat) {
    bar('ui.button.wide', 10, HUD_BTN_AI_X + HUD_BTN_AI_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
      label: `AI 思考中 · ${PERSONA_LABEL[aiSeat]}`, enabled: false,
    });
    bar('ui.qk', 11, HUD_QK_FAST_X + HUD_QK_W / 2, HUD_QK_Y + HUD_QK_H / 2, { label: fast ? '加速 ✓' : '加速 ×2', enabled: true });
    bar('ui.qk', 12, HUD_QK_SKIP_X + HUD_QK_W / 2, HUD_QK_Y + HUD_QK_H / 2, { label: '跳过本次', enabled: true });
  } else {
    /* 既有：ui.button.primary + buy/upgrade 两枚 ui.button.secondary（原逻辑不动） */
  }
```

`ui.label` 的 state 增 `dx: aiSeat ? HUD_LABEL_SHIFT_X : 0`；AI 回合不推 `ui.button.secondary`。

4) `hitAreas`：

```ts
export function hitAreas(state: GameState, seats: readonly Seat[] = []): HitArea[] {
  if (state.over) return [...];
  if (seats[state.current]) {
    return [
      { action: primaryAction(state) ?? 'end', x: HUD_BTN_AI_X, y: BOTTOM_BTN_Y, w: HUD_BTN_AI_W, h: HUD_BTN_H, enabled: false },
      { action: 'ai:fast', x: HUD_QK_FAST_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true },
      { action: 'ai:skip', x: HUD_QK_SKIP_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true },
    ];
  }
  /* 既有 primary / buy / upgrade 三枚，原逻辑不动 */
}
```

5) `mountHud` 增 view 读取器（让 DOM 命中层跟上 seats / fast）：

```ts
export function mountHud(
  root: HTMLElement, game: Game, onAction: (a: HudActionId) => void,
  view: () => { seats: readonly Seat[]; fast: boolean } = () => ({ seats: [], fast: false }),
): HudHandle
```

`update()` 内 `hitAreas(game.state, view().seats)`。

- [ ] **Step 9: 跑测试确认通过**

Run: `npx vitest run test/ui/hud.spec.ts test/ui/hud-fx.spec.ts test/ui/panels.spec.ts`
Expected: PASS（既有 4 组断言不受影响——默认 `seats = []`、`fast = false`；新增 5 例全绿）。

- [ ] **Step 10: 提交**

```bash
git -C d:\zhao add monopoly/src/skin monopoly/public/skins/default/skin.json monopoly/tools/registry-ids.json monopoly/src/render/providers/proc-hud.ts monopoly/src/ui/Hud.ts monopoly/test/ui/hud.spec.ts
git -C d:\zhao commit -m "feat(mono): AI 回合 HUD（整行主按钮/性格徽标/加速跳过）+ 注册表三元素"
```

---

## Task 4: `src/ui/aiDriver.ts` —— 回合驱动器（TDD）

**Files:**
- Create: `src/ui/aiDriver.ts`
- Test: `test/ui/ai-driver.spec.ts`

- [ ] **Step 1: 写测试（先失败）**

新建 `test/ui/ai-driver.spec.ts`（**不依赖假定时器**：直接手动调 `tick(nowMs)`）：

```ts
import { describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/core/game';
import { applyStep } from '../../src/core/ai';
import type { Seat } from '../../src/data/ai';
import { AI_STEP_MS, AI_FAST_FACTOR } from '../../src/skin/layout';
import { createAiDriver } from '../../src/ui/aiDriver';

const seats: Seat[] = [null, 'conservative', 'aggressive', 'speculative'];

function make(game = createGame({ seed: 7 })) {
  return {
    game,
    driver: createAiDriver({ game, seats, run: (s) => applyStep(game, s), isBusy: () => false }),
  };
}

describe('aiDriver 推进', () => {
  it('真人席位不驱动；AI 席位到点才推进', () => {
    const { game, driver } = make();
    game.state.current = 0;                     // 真人
    const before = JSON.stringify(game.state);
    driver.tick(AI_STEP_MS * 100);
    expect(JSON.stringify(game.state)).toBe(before);

    game.state.current = 1;                     // AI
    driver.tick(AI_STEP_MS - 1);                // 未到点
    expect(game.state.phase).toBe('idle');
    driver.tick(AI_STEP_MS);                    // 到点
    expect(game.state.phase).not.toBe('idle');  // 已掷骰
  });

  it('fx 忙时等待，不推进', () => {
    const game = createGame({ seed: 7 });
    game.state.current = 1;
    const driver = createAiDriver({ game, seats, run: (s) => applyStep(game, s), isBusy: () => true });
    driver.tick(AI_STEP_MS * 10);
    expect(game.state.phase).toBe('idle');
  });

  it('加速 ×2 把步间停顿减半', () => {
    const { game, driver } = make();
    game.state.current = 1;
    driver.setFast(true);
    expect(driver.isFast()).toBe(true);
    driver.tick(AI_STEP_MS / AI_FAST_FACTOR);   // 恰好到点
    expect(game.state.phase).not.toBe('idle');
  });

  it('over 后停止推进', () => {
    const { game, driver } = make();
    game.state.current = 1;
    game.state.over = true;
    driver.tick(AI_STEP_MS * 10);
    expect(game.state.phase).toBe('idle');
  });
});

describe('aiDriver 跳过本次', () => {
  it('把当前 AI 席位剩余步骤一次性补齐，且不越界驱动真人', () => {
    const { game, driver } = make();
    game.state.current = 1;
    const persona = seats[1]!;
    driver.skipRest();
    expect(game.state.current).not.toBe(1);     // 该 AI 回合已走完
    expect(seats[game.state.current]).toBeNull();  // 停在下一个真人席位
    // 与不跳过逐 tick 跑到的状态同构（同一 seed 下回合内状态可比）
    expect(game.state.phase).toBe('idle');
  });

  it('onFlush 只在跳过后回调一次', () => {
    const game = createGame({ seed: 7 });
    game.state.current = 1;
    const onFlush = vi.fn();
    const driver = createAiDriver({ game, seats, run: (s) => applyStep(game, s), isBusy: () => false, onFlush });
    driver.skipRest();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

describe('aiDriver 生命周期', () => {
  it('start/stop/destroy 幂等且不抛错', () => {
    const { driver } = make();
    expect(() => { driver.start(); driver.start(); driver.stop(); driver.stop(); driver.destroy(); driver.destroy(); }).not.toThrow();
  });
  it('persona() 返回当前席位性格', () => {
    const { game, driver } = make();
    game.state.current = 2;
    expect(driver.persona()).toBe('aggressive');
    game.state.current = 0;
    expect(driver.persona()).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui/ai-driver.spec.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/aiDriver"`。

- [ ] **Step 3: 建 `src/ui/aiDriver.ts`**

```ts
/**
 * AI 回合驱动器（spec §5）：只负责「什么时候做、做多久」。
 * 决策全在 `src/core/ai.ts`（纯函数）；每一步都经 `deps.run` 交给 main.ts 的 `runAction`
 * —— 与真人点击**完全同一条出画口**，因此动效 / 闸门 / e2e / 线上回归全部复用。
 */
import type { Game } from '../core/game';
import { decideTurn, type AiStep } from '../core/ai';
import type { Seat, Persona } from '../data/ai';
import { AI_STEP_MS, AI_FAST_FACTOR, AI_SKIP_MAX_STEPS } from '../skin/layout';

export type { Seat } from '../data/ai';

export interface AiDriverDeps {
  game: Game;
  seats: readonly Seat[];
  /** 执行一步；`withFx=false` 表示只落库 + 重画（跳过本次用），默认 true */
  run: (step: AiStep, withFx?: boolean) => void;
  /** `fx.busy()`——动画未播完则等待 */
  isBusy: () => boolean;
  /** 「跳过本次」收尾只播一个动效 */
  onFlush?: () => void;
  now?: () => number;
}

export interface AiDriver {
  tick(nowMs: number): void;
  start(): void;
  stop(): void;
  skipRest(): void;
  setFast(on: boolean): void;
  isFast(): boolean;
  persona(): Persona | null;
  destroy(): void;
}

export function createAiDriver(deps: AiDriverDeps): AiDriver {
  const now = deps.now ?? (() => performance.now());
  let nextAt = 0;
  let fast = false;
  let raf = 0;
  let alive = false;
  let destroyed = false;

  const persona = (): Persona | null => deps.seats[deps.game.state.current] ?? null;
  const stepMs = (): number => (fast ? AI_STEP_MS / AI_FAST_FACTOR : AI_STEP_MS);

  const tick = (nowMs: number): void => {
    if (destroyed) return;
    const state = deps.game.state;
    if (state.over) return;
    if (!persona()) return;                 // 真人席位 —— 让位，等玩家点击
    if (deps.isBusy()) return;              // 动画未播完，等下一帧
    if (nowMs < nextAt) return;
    const plan = decideTurn(state, persona() as Persona);
    if (plan.length === 0) return;
    /* 每步前重算 plan、只执行 plan[0]：状态单调消耗（买地→有主；升级→等级+1；
       交易/租金翻倍有 lastEvent.doubleRent 守卫；打牌使手牌不再含该卡）→ 天然终止 */
    deps.run(plan[0], true);
    nextAt = nowMs + stepMs();
  };

  const loop = (): void => {
    if (!alive || destroyed) return;
    tick(now());
    raf = requestAnimationFrame(loop);
  };

  return {
    tick,
    start(): void {
      if (alive || destroyed) return;
      alive = true;
      nextAt = now();                       // 立即允许第一步
      raf = requestAnimationFrame(loop);
    },
    stop(): void {
      if (!alive) return;
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    skipRest(): void {
      const seat = deps.game.state.current;
      const p = persona();
      if (!p) return;
      let n = 0;
      while (n < AI_SKIP_MAX_STEPS) {
        /* 守卫：跑完本席位就停，绝不替下一位（可能是真人）继续决策 */
        if (deps.game.state.over || deps.game.state.current !== seat) break;
        const plan = decideTurn(deps.game.state, p);
        if (plan.length === 0) break;
        deps.run(plan[0], false);           // 只落库 + 重画，不逐个播动效
        n += 1;
      }
      nextAt = now() + stepMs();
      deps.onFlush?.();                     // 收尾只播一个动效
    },
    setFast(on: boolean): void { fast = on; },
    isFast(): boolean { return fast; },
    persona,
    destroy(): void {
      this.stop();
      destroyed = true;
    },
  };
}
```

> `performance` / `requestAnimationFrame` / `cancelAnimationFrame` 在 Vitest 的默认 node 环境不存在 → **`start()` 只在 main.ts 里调用**，单测只调 `tick` / `skipRest`（本任务的测试正是如此）。若 Step 4 报 `requestAnimationFrame is not defined`，说明有测试调了 `start()`——去掉它，不要改实现。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui/ai-driver.spec.ts`
Expected: PASS（7 例）。

- [ ] **Step 5: 提交**

```bash
git -C d:\zhao add monopoly/src/ui/aiDriver.ts monopoly/test/ui/ai-driver.spec.ts
git -C d:\zhao commit -m "feat(mono): AI 回合驱动器（rAF 轮询/加速/跳过本次/浮层收口）"
```

---

## Task 5: `src/ui/setup.ts` + `main.ts` 接线 + URL 参数（TDD）

**Files:**
- Create: `src/ui/setup.ts`
- Modify: `src/main.ts`（`UrlOptions` / `parseOptions` / `runAction` / `dispatch` / play 分支 / `__monoMain`）
- Test: `test/smoke.spec.ts`

- [ ] **Step 1: 改测试（先失败）**

`test/smoke.spec.ts` 的两处 `toEqual` **全等**断言必须同步扩字段：

```ts
  it('缺省：进站即交互局；humans/ai/tour 缺省为 undefined（走开局面板）', () => {
    expect(parseOptions('')).toEqual({
      skin: 'default', debug: false, seed: 1, speed: 1, show: 'b', play: true, nofx: false, perf: false,
      humans: undefined, ai: [], tour: undefined,
    });
  });
  it('解析 ?skin ?debug ?seed ?speed', () => {
    expect(parseOptions('?skin=photo&debug=1&seed=7&speed=4'))
      .toEqual({ skin: 'photo', debug: true, seed: 7, speed: 4, show: 'b', play: true, nofx: false, perf: false,
        humans: undefined, ai: [], tour: undefined });
  });
```

并追加：

```ts
  it('解析 ?humans / ?ai / ?tour（AI 对手 + 新手引导）', () => {
    expect(parseOptions('?humans=1').humans).toBe(1);
    expect(parseOptions('?humans=4').humans).toBe(4);
    expect(parseOptions('?humans=5').humans).toBeUndefined();   // 越界不采纳
    expect(parseOptions('?humans=0').humans).toBeUndefined();
    expect(parseOptions('?humans=abc').humans).toBeUndefined();
    expect(parseOptions('?humans=1&ai=aggressive,speculative').ai).toEqual(['aggressive', 'speculative']);
    expect(parseOptions('?humans=1&ai=bogus').ai).toEqual([]);
    expect(parseOptions('?tour=1').tour).toBe(true);
    expect(parseOptions('?tour=0').tour).toBe(false);
    expect(parseOptions('?tour=2').tour).toBeUndefined();
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/smoke.spec.ts`
Expected: FAIL — 两处 `toEqual` 因多出 `humans/ai/tour` 字段不符（Vitest 的 `toEqual` 会忽略 `undefined`，故真正失败的是 `ai: []` 与新增用例）。

- [ ] **Step 3: `parseOptions` 扩三参**

`src/main.ts` 的 `UrlOptions` 增：

```ts
  /** `?humans=1..4`：真人数；缺省（undefined）= 先弹开局面板（spec §6） */
  humans?: number;
  /** `?ai=conservative,aggressive,speculative`：AI 席位性格序列（与 humans 搭配） */
  ai: Persona[];
  /** `?tour=1` 强制引导 / `?tour=0` 关闭；缺省 = 首访自动弹一次（spec §7.1） */
  tour?: boolean;
```

`parseOptions` 的 `return` 里补三项（`num()` 是「> 0 才采纳」，故 `humans` 单独判 1..4）：

```ts
    humans: (() => { const v = Number(q.get('humans')); return Number.isInteger(v) && v >= 1 && v <= 4 ? v : undefined; })(),
    ai: parsePersonaList(q.get('ai')),
    tour: q.get('tour') === '1' ? true : q.get('tour') === '0' ? false : undefined,
```

顶部 import：`import { parsePersonaList, type Persona, type Seat } from './data/ai';` 与
`import { createAiDriver, type AiDriver } from './ui/aiDriver';`、`import { resolveSeats, mountSetup } from './ui/setup';`、tutorial（Task 6 落地，本任务先不 import）。

- [ ] **Step 4: 建 `src/ui/setup.ts`（版式 B：2×2 人数大卡 + 三枚性格徽标卡）**

```ts
/**
 * 开局面板（spec §6，版式 B）：全屏 DOM overlay，可见像素全在 DOM/CSS（与 ui/share.ts 同规），
 * 坐标/尺寸取值仍只取自 `src/skin/layout.ts`（`STAGE_W/STAGE_H/...`）以消除与渲染的漂移。
 */
import { PERSONAS, PERSONA_DESC, PERSONA_LABEL, DEFAULT_AI_ORDER, type Persona, type Seat } from '../data/ai';
import { STAGE_W, STAGE_H, TUTORIAL_GAP } from '../skin/layout';

export type SeatPlan = Seat[];              // 下标 = players 下标；总席位恒 4

const SETUP_KEY = 'mono.setup';
const TOTAL_SEATS = 4;
const CHOICES = [1, 2, 3, 4];

/** `?humans=` → localStorage → null（需弹面板） */
export function resolveSeats(opts: { humans?: number; ai: Persona[] }): SeatPlan | null {
  if (opts.humans !== undefined) return planOf(opts.humans, opts.ai);
  return readPlan();
}

export function planOf(humans: number, ai: Persona[]): SeatPlan {
  const out: SeatPlan = [];
  for (let i = 0; i < TOTAL_SEATS; i++) {
    out.push(i < humans ? null : (ai[i - humans] ?? DEFAULT_AI_ORDER[(i - humans) % DEFAULT_AI_ORDER.length]));
  }
  return out;
}

export function readPlan(): SeatPlan | null { /* JSON.parse + 长度/合法性校验，坏值返回 null */ }
export function writePlan(plan: SeatPlan): void { /* localStorage.setItem(SETUP_KEY, JSON.stringify(plan)) */ }

/** 弹出面板；resolve 时返回选定席位（选完即写 localStorage） */
export function mountSetup(root: HTMLElement, initial: SeatPlan | null, onReplayTour: () => void): Promise<SeatPlan> { /* ... */ }
```

DOM 结构（`z-index: 30`，`position: fixed`，`width: STAGE_W`/`height: STAGE_H`；`left/top` 由 `.wrap` 居中）：

```
.wrap
  h1 大富翁 · 双阳
  p  选好人数就能开局
  .row  （标签「真人玩家」）
    ×4 大卡（2×2 grid，`STAGE_W` 内两列；默认选中「1 人」）
  .row  （标签「AI 席位性格」）
    ×3 性格徽标卡（顺序 = conservative / aggressive / speculative，点击在三种性格间轮换）
  button.primary 开始游戏
  button.ghost   重看引导（右上角，onReplayTour）
  p.hint         进站即玩 · 剩余席位由 AI 接管
```

交互：选人数 → 立即重算其余席位的徽标卡（选 4 即无 AI 卡）；点徽标卡 → 在 `PERSONAS` 中循环切换；「开始游戏」→ `writePlan(plan)` + `resolve(plan)` + 移除 overlay。

- [ ] **Step 5: `runAction` 增第三参 + `dispatch`（AI 与真人同一出画口）**

`src/main.ts` 的 `runAction`（第 206-217 行）改为：

```ts
  const runAction = (fn: () => unknown, ctxOf: (r: never) => FxContext | null, withFx = true): void => {
    const result = fn();
    const ctx = withFx ? ctxOf(result as never) : null;
    if (!ctx) {
      fxPending = false;
      paint();
      return;
    }
    fxPending = true;
    paint();
    fx.play(ctx, () => { fxPending = false; paint(); });
  };
```

在 `runAction` / `settleFx` 之后、`if (game)` 之前新增 `ctxOfStep` 与 `dispatch`（**把既有各回调里的 `ctxOf` 闭包原样搬进来**，不新造动效口径）：

```ts
  /** AiStep → FxContext（与既有 HUD/浮层回调逐字一致） */
  const ctxOfStep = (step: AiStep, r: unknown): FxContext | null => {
    switch (step.kind) {
      case 'roll': return { kind: 'dice' };
      case 'move': { const m = r as { from: number; to: number }; const from = cellXY(m.from); const to = cellXY(m.to); return { kind: 'hop', x: from.x, y: from.y, tx: to.x, ty: to.y }; }
      case 'settle': return settleFx(r as SettleResult);
      case 'buy': { const at = cellXY(currentPlayer(game!.state).pos); return (r as { ok: boolean }).ok ? { kind: 'buy', x: at.x, y: at.y } : null; }
      case 'upgrade': { const at = cellXY(currentPlayer(game!.state).pos); const u = r as { ok: boolean; level?: number }; return u.ok ? { kind: 'upgrade', x: at.x, y: at.y, levels: u.level ?? FX_LEVELS } : null; }
      case 'card': { const at = cellXY(currentPlayer(game!.state).pos); return { kind: 'deck', x: at.x, y: at.y }; }
      case 'trade': { const at = cellXY(STOCK_TILE_INDEX); return { kind: 'stock', x: at.x, y: at.y }; }
      default: return null;   // skip / close / end
    }
  };

  /** 唯一动作入口：真人 HUD / 浮层点击与 AI 决策层都归一到 AiStep 后走这里 */
  const dispatch = (step: AiStep, withFx = true): void => {
    if (!game) return;
    runAction(() => applyStep(game, step), (r: never) => ctxOfStep(step, r as unknown), withFx);
  };

  const stepOfHud = (a: HudActionId): AiStep => (a === 'buy' ? { kind: 'buy' } : a === 'upgrade' ? { kind: 'upgrade' } : { kind: a });
  const stepOfPanel = (a: PanelActionId, target?: number | string): AiStep => {
    if (a === 'card:close' || a === 'settle:close') return { kind: 'close' };
    if (a === 'stock:buy') return { kind: 'trade', code: String(target), shares: 1 };
    if (a === 'stock:sell') return { kind: 'trade', code: String(target), shares: -1 };
    return { kind: 'card', card: a.slice('card:'.length) as ItemCardKind, target: typeof target === 'number' ? target : undefined };
  };
```

`mountHud` / `mountPanels` 回调退化为「转成 step 后 `dispatch`」，并保留既有的「点屏加速」与「AI 回合命中区禁用」语义：

```ts
    hud = mountHud(document.body, game, (a) => {
      if (fx.busy()) fx.skip();
      if (a === 'ai:fast') { driver?.setFast(!driver.isFast()); paint(); return; }
      if (a === 'ai:skip') { driver?.skipRest(); return; }
      dispatch(stepOfHud(a));
    }, () => ({ seats, fast: driver?.isFast() ?? false }));

    panels = mountPanels(document.body, game, (a, target) => {
      if (fx.busy()) fx.skip();
      dispatch(stepOfPanel(a, target));
    });
```

- [ ] **Step 6: play 分支接线（席位 → createGame → driver → tutorial）**

`const game = opts.play ? createGame({ seed: opts.seed }) : null;` 这行（第 136 行）改为：

```ts
  /* 席位归属：`?humans=` → localStorage → 弹开局面板（spec §6） */
  let seats: Seat[] = opts.play ? (resolveSeats(opts) ?? [null, null, null, null]) : [];
  let setupDone: Promise<SeatPlan> | null = null;
  if (opts.play && !resolveSeats(opts)) {
    setupDone = mountSetup(document.body, readPlan(), () => replayTour());
  }
  const game = opts.play ? createGame({ seed: opts.seed, playerCount: 4 }) : null;
  let driver: AiDriver | null = null;
```

> 注意 `opts.play && !resolveSeats(opts)` 会调用两次 `resolveSeats`（纯读 localStorage，无副作用）；若想更干净可 `const r = resolveSeats(opts); seats = r ?? [null,null,null,null]; if (opts.play && !r) setupDone = ...`。

在 `if (game) { ... }` 块尾（`mountPanels` 之后）新增：

```ts
    driver = createAiDriver({
      game, seats,
      run: (step, withFx = true) => dispatch(step, withFx),
      isBusy: () => fx.busy(),
      onFlush: () => fx.play({ kind: 'end' }, () => paint()),
    });
    driver.start();
    /* 开局面板选完 → 换 seats 并重画（面板期间 driver 停在真人/默认席位，不会误推进） */
    void setupDone?.then((plan) => { seats = plan; paint(); });
```

> `seats` 是 `let`，driver 持有的是**数组引用**——若面板返回新数组，必须在 `then` 里同步（上面的写法已同步）；`createAiDriver` 的 `deps.seats` 也要能读到新值 → 把 `createAiDriver` 的 `seats` 传入改为 getter 更稳：`seats: () => seats`（则 `AiDriverDeps.seats` 类型为 `readonly Seat[] | (() => readonly Seat[])`，实现里统一 `const S = typeof seats === 'function' ? seats() : seats`）。**采用后一种**（唯一正确解，避免闭包里的引用漂移）。

在 `boot()` 末尾的 `__monoMain` 里增：

```ts
    seats, aiDriver: driver, hudSeats: () => seats,
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npx vitest run test/smoke.spec.ts test/ui/ai-driver.spec.ts`
Expected: PASS。

- [ ] **Step 8: 起 dev 服务器手验三条入口**

Run（`cwd=d:\zhao\monopoly`，后台）: `npm run dev`，然后浏览器打开：
- `http://127.0.0.1:52300/mono.html` → 首屏为开局面板（默认「1 人」）；点「开始游戏」→ 出现 HUD，3 条资产条带性格徽标，AI 回合整行按钮显示「AI 思考中 · 保守」，并自动推进。
- `http://127.0.0.1:52300/mono.html?humans=1&tour=0` → **不弹面板**，直接 1 真人 + 3 AI。
- `http://127.0.0.1:52300/mono.html?humans=4&tour=0` → 与改前 `?play=1` 完全一致（4 真人，无徽标、无快捷键）。

- [ ] **Step 9: 提交**

```bash
git -C d:\zhao add monopoly/src/ui/setup.ts monopoly/src/main.ts monopoly/test/smoke.spec.ts
git -C d:\zhao commit -m "feat(mono): 开局面板 + 席位接线 + dispatch 统一出画口（?humans/?ai/?tour）"
```

---

## Task 6: `src/data/tutorial.ts` + `src/ui/tutorial.ts` —— 四步蒙层（TDD）

**Files:**
- Create: `src/data/tutorial.ts`、`src/ui/tutorial.ts`
- Test: `test/ui/tutorial.spec.ts`

- [ ] **Step 1: 写测试（先失败）**

新建 `test/ui/tutorial.spec.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { TUTORIAL_STEPS } from '../../src/data/tutorial';
import { shouldShowTutorial, mountTutorial, type Rect } from '../../src/ui/tutorial';
import { STAGE_W, HUD_BTN_BUY_X, HUD_DICE_X0, HUD_BAR_X0, PANEL_SLOT_X0 } from '../../src/skin/layout';

describe('tutorial 步骤表', () => {
  it('四步齐备，标题 ≤ 6 字、说明 ≤ 20 字', () => {
    expect(TUTORIAL_STEPS.length).toBe(4);
    for (const s of TUTORIAL_STEPS) {
      expect(s.title.length).toBeLessThanOrEqual(6);
      expect(s.text.length).toBeLessThanOrEqual(20);
      expect(s.testId).toBeTruthy();
    }
  });
});

describe('shouldShowTutorial', () => {
  it('?tour=1 强制、?tour=0 关闭、标记已写则不弹、纯 AI 局不弹', () => {
    expect(shouldShowTutorial({ tour: true }, false, [null, 'conservative', 'aggressive', 'speculative'])).toBe(true);
    expect(shouldShowTutorial({ tour: true }, true,  [null, 'conservative', 'aggressive', 'speculative'])).toBe(true);
    expect(shouldShowTutorial({ tour: false }, false, [null, 'conservative', 'aggressive', 'speculative'])).toBe(false);
    expect(shouldShowTutorial({}, true,  [null, 'conservative', 'aggressive', 'speculative'])).toBe(false);
    expect(shouldShowTutorial({}, false, [null, 'conservative', 'aggressive', 'speculative'])).toBe(true);
    expect(shouldShowTutorial({}, false, ['conservative', 'aggressive', 'speculative', 'conservative'])).toBe(false);
  });
});

describe('mountTutorial 矩形来源', () => {
  const rectsOf = (i: number): Rect[] => TUTORIAL_STEPS[i].rects;

  it('高亮矩形全部落在 390×844 画布内（× 阶段常量，非另造坐标）', () => {
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
      expect(rectsOf(i).length).toBeGreaterThan(0);
      for (const r of rectsOf(i)) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(STAGE_W);
      }
    }
  });
  it('第 1 步含主按钮与骰子、第 2 步含买地键、第 3 步含资产条与手牌槽、第 4 步含第 1 条资产条', () => {
    expect(rectsOf(0).some((r) => r.w === 98)).toBe(true);           // HUD_BTN_PRIMARY_W
    expect(rectsOf(0).some((r) => r.x === HUD_DICE_X0)).toBe(true);
    expect(rectsOf(1).some((r) => r.x === HUD_BTN_BUY_X)).toBe(true);
    expect(rectsOf(2).some((r) => r.x === HUD_BAR_X0)).toBe(true);
    expect(rectsOf(2).some((r) => r.x === PANEL_SLOT_X0)).toBe(true);
    expect(rectsOf(3).some((r) => r.w === 86)).toBe(true);           // HUD_BAR_W
  });
  it('步进到底自动收尾并写标记；跳过立即收尾', () => {
    const done = vi.fn();
    const t = mountTutorial(document.body, { onDone: done });
    expect(document.querySelectorAll('[data-tour-step]').length).toBe(1);
    t.next(); expect(t.index()).toBe(1);
    t.next(); t.next(); t.next();
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-tour-step]')).toBeNull();
    const t2 = mountTutorial(document.body, { onDone: vi.fn() });
    t2.skip();
    expect(document.querySelector('[data-tour-step]')).toBeNull();
  });
});
```

（`shouldShowTutorial` / `mountTutorial` / `Rect` 的导出形状见 Step 3；`tutorial.spec.ts` 需要 jsdom 环境——检查 `vitest.config` 的 `environment`，既有 `test/ui/hud.spec.ts` 已在同一环境跑，沿用即可。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui/tutorial.spec.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 建两个文件**

`src/data/tutorial.ts`（文案集中一处，便于后续接 i18n）：

```ts
/** 新手引导四步（spec §7.2）。矩形由消费方从 hitAreas()/layout 常量填（本文件只放文案与槽位） */
import {
  HUD_BAR_H, HUD_BAR_W, HUD_BAR_X0, HUD_BAR_GAP, HUD_BTN_BUY_X, HUD_BTN_H, HUD_BTN_PRIMARY_W, HUD_BTN_PRIMARY_X,
  HUD_BTN_SECONDARY_W, HUD_BTN_UPGRADE_X, HUD_DICE_DX, HUD_DICE_SIZE, HUD_DICE_X0, HUD_DICE_Y,
  PANEL_HAND_Y, PANEL_SLOT_GAP, PANEL_SLOT_H, PANEL_SLOT_W, PANEL_SLOT_X0, BOTTOM_BTN_Y,
} from '../skin/layout';

export interface Rect { x: number; y: number; w: number; h: number }
export interface TutorialStep {
  testId: string;
  title: string;
  text: string;
  /** 高亮矩形；来源一律是 layout 常量 / hitAreas()，不另造坐标（spec §7.3） */
  rects: Rect[];
}

const DICE: Rect = { x: HUD_DICE_X0, y: HUD_DICE_Y, w: HUD_DICE_DX + HUD_DICE_SIZE, h: HUD_DICE_SIZE };

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    testId: 'roll',
    title: '点这里掷骰',
    text: '再依次点「前进」「结算」',
    rects: [
      { x: HUD_BTN_PRIMARY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_PRIMARY_W, h: HUD_BTN_H },
      DICE,
    ],
  },
  {
    testId: 'earn',
    title: '买地与升级',
    text: '踩到空地可买下，自己的地能升级',
    rects: [
      { x: HUD_BTN_BUY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H },
      { x: HUD_BTN_UPGRADE_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H },
    ],
  },
  {
    testId: 'assets',
    title: '资产与手牌',
    text: '这里看现金与领先者；手牌能放炸弹',
    rects: [
      { x: HUD_BAR_X0, y: HUD_BAR_Y, w: HUD_BAR_W, h: HUD_BAR_H },
      { x: PANEL_SLOT_X0, y: PANEL_HAND_Y, w: PANEL_SLOT_W * 5 + PANEL_SLOT_GAP * 4, h: PANEL_SLOT_H },
    ],
  },
  {
    testId: 'ai',
    title: '其余是 AI',
    text: 'AI 会自己走；想快可点加速或跳过',
    rects: [{ x: HUD_BAR_X0 + HUD_BAR_W + HUD_BAR_GAP, y: HUD_BAR_Y, w: HUD_BAR_W, h: HUD_BAR_H }],
  },
];
```

（`HUD_BAR_Y` 需从 `src/skin/layout.ts` 一并 import——上面 import 清单里已含 `HUD_BAR_H/HUD_BAR_W/HUD_BAR_X0/HUD_BAR_GAP`，补上 `HUD_BAR_Y`。）

`src/ui/tutorial.ts`：

```ts
/**
 * 新手分步蒙层（spec §7）：DOM overlay，`z-index: 20`（低于开局面板 30、高于 hud 8 / panels 9）。
 * 仅蒙层与气泡吃事件；引导结束才放开游戏动作。
 */
import { TUTORIAL_STEPS, type Rect } from '../data/tutorial';
import { STAGE_H, STAGE_W, TUTORIAL_GAP } from '../skin/layout';
import type { Seat } from '../data/ai';

export type { Rect } from '../data/tutorial';

const TOUR_KEY = 'mono.tour.done';

export function markDone(): void { try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* 隐私模式忽略 */ } }
export function isDone(): boolean { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return false; } }

/** `?tour=1` 强制 / `?tour=0` 关闭 / 缺省首访一次；纯 AI 局不弹（spec §7.1） */
export function shouldShowTutorial(opts: { tour?: boolean }, done: boolean, seats: readonly Seat[]): boolean {
  if (!seats.some((s) => s === null)) return false;
  if (opts.tour === false) return false;
  if (opts.tour === true) return true;
  return !done;
}

export interface TutorialHandle { next(): void; skip(): void; index(): number; destroy(): void }

export function mountTutorial(root: HTMLElement, deps: { onDone?: () => void } = {}): TutorialHandle { /* ... */ }
```

`mountTutorial` 实现要点（每步一个 `[data-tour-step]` 容器）：
- 蒙层：`position:fixed; left:0; top:0; width:STAGE_W; height:STAGE_H`，半透明底 + 高亮框（`box-shadow` 挖洞法：给每个 `rect` 用 `outline`/`box-shadow: 0 0 0 9999px rgba(...)`）；
- 气泡：按 `rect` 自动落在其**上方**（若 `rect.y < STAGE_H / 2` 则放下方），边距 `TUTORIAL_GAP`，`max-width: STAGE_W - TUTORIAL_GAP * 2`；
- 「下一步 / 跳过」两个 DOM 键；末步按钮文案「开始」；`next()` 走完调 `markDone()` + 移除 overlay + `deps.onDone?.()`；
- `destroy()` 幂等；不引入任何 `src/render/**` 依赖。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui/tutorial.spec.ts`
Expected: PASS。

- [ ] **Step 5: `main.ts` 挂引导（含「重看引导」入口）**

在 Task 5 的 `if (game)` 块之后新增：

```ts
  /* —— 新手引导（spec §7）：仅在含真人席位的局、首访一次 —— */
  let tutorial: TutorialHandle | null = null;
  const replayTour = (): void => { tutorial?.destroy(); tutorial = mountTutorial(document.body, { onDone: () => { tutorial = null; } }); };
  if (game && shouldShowTutorial(opts, isDone(), seats)) replayTour();
  void setupDone?.then((plan) => { seats = plan; if (game && shouldShowTutorial(opts, isDone(), plan) && !tutorial) replayTour(); paint(); });
```

`__monoMain` 增 `tutorial: () => tutorial`、`mountTutorial: replayTour`（闸门用 `?tour=1` 走 URL，无需强依赖）。

- [ ] **Step 6: 提交**

```bash
git -C d:\zhao add monopoly/src/data/tutorial.ts monopoly/src/ui/tutorial.ts monopoly/test/ui/tutorial.spec.ts monopoly/src/main.ts
git -C d:\zhao commit -m "feat(mono): 新手四步蒙层引导（?tour 开关 + 重看入口 + 文案集中）"
```

---

## Task 7: 闸门 —— 新 `mono-shots-ai.mjs` + prod-check / e2e 增例 + 口径搬迁

**Files:**
- Create: `local/mono-shots-ai.mjs`
- Modify: `local/mono-prod-check.mjs`
- Modify: `local/mono-e2e-playthrough.mjs`
- Modify: `local/mono-share-check.mjs`、`local/mono-shots-m4.mjs`、`m5.mjs`、`m6.mjs`、`local/mono-perf.mjs`、`local/mono-perf-android.mjs`

- [ ] **Step 1: 口径搬迁（必需——裸入口现在先弹面板，`game === null`）**

给下列 play 模式 URL **补 `humans=4&tour=0`**（恢复改前「4 真人 / 无 AI / 无引导」的等价行为）：

| 文件 | 位置 | 现 URL 追加 |
|---|---|---|
| `local/mono-prod-check.mjs` | 第 43、79 行 | `&humans=4&tour=0` |
| `local/mono-share-check.mjs` | 第 47、118、140 行 | `&humans=4&tour=0` |
| `local/mono-shots-m4.mjs` | 第 17 行 | `&humans=4&tour=0` |
| `local/mono-shots-m5.mjs` | 第 17 行 | `&humans=4&tour=0` |
| `local/mono-shots-m6.mjs` | 第 47 行 | `&humans=4&tour=0` |
| `local/mono-e2e-playthrough.mjs` | 第 149 行 | `&humans=4&tour=0` |
| `local/mono-perf.mjs` | 第 90、91 行 | 采样 query 追加 `&humans=4&tour=0` |
| `local/mono-perf-android.mjs` | 第 30 行 `QUERY` | 追加 `&humans=4&tour=0` |

**不动**：`tools/gen-share-card.mjs`（`demo=1`）、`local/mono-shots-m1/m2/m3.mjs`、`mono-shots-real-shops.mjs`、`mono-shots-shops.mjs`（均 `demo=1`）。

- [ ] **Step 2: 新建 `local/mono-shots-ai.mjs`**

结构照抄 `local/mono-shots-m4.mjs` 的骨架（`chromium.launch` + `390×844 @dpr2` + `attach(page)` 收集 `console` error + `gate` 汇总 + 末尾 `process.exit`），四组用例：

```js
const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
```

1) **`?humans=1&tour=0`（1 真人 + 3 AI）** → `waitForFunction(() => Boolean(window.__monoMain?.game))`
   gate：`seats` 中非 null 数 === 3、null 数 === 1、`!document.querySelector('#mono-setup')`；截图 `mono-ai-01-setup-skip.png`。
2) **开局面板（裸入口）** → `!window.__monoMain.game` 且 `#mono-setup` 存在 → 截图 `mono-ai-02-setup.png`；再点面板里的「开始游戏」→ `waitForFunction(() => Boolean(window.__monoMain?.game))` → 截图 `mono-ai-03-started.png`。
3) **AI 回合自动推进 + HUD 全禁用** → 先等到 `state.current` 落在 AI 席位（`seats[i] !== null`）；断言 `#mono-hud button[data-action="ai:fast"]` 与 `[data-action="ai:skip"]` 存在、主按钮 `disabled`；记录 `state.current` + `state.phase`，`waitForFunction` 等 `phase` 变化（超时 8s）→ gate `aiAdvanced`；再点「加速 ×2」→ gate `fastToggled`（按钮文案含 `✓`）；再点「跳过本次」→ `waitForFunction` 等 `state.current` 变成「下一个真人/下一个席位」→ gate `skipped`；截图 `mono-ai-04-turn.png`。
4) **`?humans=1&tour=1`** → 等 `[data-tour-step]` 出现，逐步点「下一步」4 次、每步截图 `mono-ai-05-tour-1..4.png`（390×844 @dpr2）→ 断言末步后 `[data-tour-step]` 消失、`localStorage['mono.tour.done'] === '1'`。

`facts.screenshots` 收录上述 8 张；末尾 `if (Object.values(gate).some((v) => !v) || errors.length > 0) process.exit(1)`。

- [ ] **Step 3: `local/mono-prod-check.mjs` 改裸入口 gate + 新增 `?humans=1` gate**

- 第 96–129 行的裸入口段：`waitForFunction(Boolean(window.__monoMain?.game))` **会超时** → 改为断言开局面板：

```js
await entryPage.waitForFunction(() => Boolean(document.querySelector('#mono-setup')), null, { timeout: 20000 });
facts.defaultEntry = await entryPage.evaluate(() => ({
  hasSetup: Boolean(document.querySelector('#mono-setup')),
  gameIsNull: window.__monoMain.game === null,
}));
gate.defaultEntry = facts.defaultEntry.hasSetup && facts.defaultEntry.gameIsNull;
await entryPage.screenshot({ path: `${OUT}/mono-prod-00-default.png` });
```

- 新增第 4 条（在裸入口段之后）：`?humans=1&tour=0` → `waitForFunction(Boolean(window.__monoMain?.game))` → `facts.aiSeat = { ai: m.seats.filter((s) => s !== null).length, humans: m.seats.filter((s) => s === null).length, hud: Boolean(document.querySelector('#mono-hud')) }` → `gate.aiSeat = ai === 3 && humans === 1 && hud`；截图 `mono-prod-04-ai-seat.png`；`facts.screenshots` 加该张。

- 文件头注释的断言清单同步（第 9–15 行）。

- [ ] **Step 4: `local/mono-e2e-playthrough.mjs` 增「AI 局跑到 `over=true`」用例**

在既有整局用例之后追加（真人回合沿用既有真实点击；AI 回合纯等待）：

```js
/* AI 局：1 真人 + 3 AI，真人回合真实点击，AI 回合等自动推进，跑到 over=true */
const aiPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(aiPage);
await aiPage.goto(`${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=1&tour=0`, { waitUntil: 'networkidle' });
await aiPage.waitForFunction(() => Boolean(window.__monoMain?.game));
await aiPage.waitForFunction(() => window.__monoMain.game.state.over === true, null, { timeout: 180000 });
facts.aiGame = await aiPage.evaluate(() => {
  const s = window.__monoMain.game.state;
  return { over: s.over, round: s.round, current: s.current };
});
gate.aiGame = facts.aiGame.over === true;
await aiPage.screenshot({ path: `${OUT}/mono-e2e-08-ai-final.png` });
```

> 真人回合若不点击，AI 局会**停在真人席位**——故这段必须在真人席位循环执行既有 `click(sel, sigBefore)`（复用文件的 `click` helper，判定「当前席位是否真人」用 `await aiPage.evaluate(() => window.__monoMain.seats[window.__monoMain.game.state.current])`）。超时设 180s 是因为每步 450ms + 提速有限。

- [ ] **Step 5: 起 dev 服务器，跑三个脚本**

Run（`cwd=d:\zhao\monopoly`，后台）: `npm run dev`
```bash
node local/mono-shots-ai.mjs
node local/mono-prod-check.mjs      # 需 $env:MONO_ORIGIN='http://127.0.0.1:52300'
node local/mono-e2e-playthrough.mjs
```
Expected: 三个脚本 `gate` 全 `true`、`errors` 为空、退出码 0；截图落 `docs/verify/`。

- [ ] **Step 6: 重跑被搬迁的 5 个既有闸门，确认逐张等价**

```bash
node local/mono-shots-m4.mjs
node local/mono-shots-m5.mjs
node local/mono-shots-m6.mjs
node local/mono-share-check.mjs
node local/mono-perf.mjs
```
Expected: 各自 `gate` 全 `true`、`errors` 为空；截图与改前**内容一致**（证明是纯口径搬迁）。

- [ ] **Step 7: 提交**

```bash
git -C d:\zhao add monopoly/local monopoly/docs/verify
git -C d:\zhao commit -m "test(mono): AI 闸门 mono-shots-ai + prod-check/e2e 增例 + play 口径搬迁 humans=4&tour=0"
```

---

## Task 8: 手册 M9 / M10 + 手机视口截图入库

**Files:**
- Modify: `docs/manual-mono.md`（第 14 行 URL 参数行；`### M9` / `### M10` 两节插在「### 最终验收」之前）

- [ ] **Step 1: URL 参数行**

`docs/manual-mono.md:14` 末尾追加：

```markdown
· `?humans=1..4`（真人数；**缺省 → 首屏弹开局面板**）· `?ai=conservative,aggressive,speculative`（AI 性格序列）· `?tour=1`（强制新手引导）/ `?tour=0`（关闭；缺省首访弹一次）
```

- [ ] **Step 2: M9 一节**

```markdown
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

**口径说明**：本设计让裸入口先出开局面板（`__monoMain.game === null`），所有 play 模式闸门脚本已统一补 `humans=4&tour=0` 保持旧行为；线上回归的裸入口 gate 改为断言「面板存在 + game 为 null」，并新增 `?humans=1&tour=0` 的 3 席 AI gate。
```

- [ ] **Step 3: M10 一节**

```markdown
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
```

- [ ] **Step 4: 截图入库核对**

确认 `docs/verify/` 内 `mono-ai-0*.png`（8 张）与 `mono-prod-04-ai-seat.png`、`mono-e2e-08-ai-final.png` 均为 **390×844 @dpr2** 且非空白；把文件名写进 M9/M10 表的「截图」列。

- [ ] **Step 5: 提交**

```bash
git -C d:\zhao add monopoly/docs/manual-mono.md monopoly/docs/verify
git -C d:\zhao commit -m "docs(mono): 手册增 M9（AI 对手与开局）/ M10（新手引导）+ 手机视口截图入库"
```

---

## Task 9: 全量校验 → 本地构建 → 部署 → 线上回归 → 收口

- [ ] **Step 1: 全量校验**

Run（`cwd=d:\zhao\monopoly`）: `npm run check`
Expected: `lint` 0 错（`src/render/**` 禁裸值 gate 通过）；`[skin:default] OK` / `[skin:photo] OK`；vitest 全绿（45 → **48** 文件；365 → **约 385 例**，以实际为准）。

- [ ] **Step 2: 本地构建 + 部署（服务器只解压，绝不在服务器构建）**

Run（`cwd=d:\zhao`）: `node d:\zhao\scripts\deploy-mono.mjs`
Expected: 七步全过——`release/js/mono.js` 生成、tar 整包、scp 到 `odoo`、服务器解压到 `/opt/1panel/apps/openresty/openresty/www/sites/game.joho.cn/tour`、备份 `tour.bak-<ts>`；三项校验：`mono.html` 200 / `js/mono.js` 线上字节数 == 本地 / `skins/photo/skin.json` 200。

- [ ] **Step 3: 线上回归**

Run（`cwd=d:\zhao\monopoly`）: `node local/mono-prod-check.mjs`
Expected: 退出码 0；`gate` 全 `true`（含 `defaultEntry` = 开局面板 + `game===null`、`aiSeat` = 3 AI / 1 真人、`counts`、`sim`、`skinAssets`、`skinImages`）；`errors: []`；5 张截图入库。

- [ ] **Step 4: 线上 e2e（AI 局）**

Run（`cwd=d:\zhao\monopoly`）: `node local/mono-e2e-playthrough.mjs`
Expected: 退出码 0；`gate.aiGame === true`（AI 局跑到 `over=true`）；`mono-e2e-08-ai-final.png` 入库。

- [ ] **Step 5: 人工复核两张关键截图**

- `docs/verify/mono-ai-01-setup-skip.png`：3 条资产条右上角各有性格徽标（保守/激进/投机），第 1 条无徽标；AI 回合整行金底按钮（disabled，文字「AI 思考中 · …」）。
- `docs/verify/mono-ai-05-tour-3.png`：第 3 步同时高亮资产条与手牌槽，气泡不压高亮框、无溢出。

- [ ] **Step 6: 提交部署留档 + 推送**

```bash
git -C d:\zhao add monopoly/docs/verify monopoly/docs/manual-mono.md
git -C d:\zhao commit -m "chore(mono): 部署 AI 对手 + 新手引导 + 线上回归（含开局面板/AI 席位 gate）"
git -C d:\zhao push
```

（按用户既定「一气呵成」收尾：提交 → 推送 → 部署。若期间发现需补充事项，先提醒用户、待其处理后再一并收口。）

- [ ] **Step 7: 停掉后台 dev 服务器并报告**

停掉 Task 5/7 起的后台 `npm run dev`；向用户报告：本地校验 / 构建 / 部署 / 线上回归 / 线上 e2e 五项结果 + 关键截图路径。

---

## 完成标准（对照 spec §11）

1. 裸链接进站 → 首屏为开局面板；选「1 人」点开始 → 3 席为 AI，AI 回合自动推进且可加速/跳过 → Task 5 Step 8 + Task 7 Step 3/5 + Task 9 Step 3。
2. AI 回合 HUD 全部禁用，主按钮显示「AI 思考中 · <性格>」 → Task 3 Step 1/9 + Task 7 Step 2。
3. 三种性格行为可区分（保守不冒进、激进针对领先者、投机末段才针对） → Task 2 Step 1/4。
4. 首次进站自动弹 4 步引导；`?tour=0` 不弹；`?tour=1` 强制；可从面板/设置重看 → Task 6 Step 1/4 + Task 7 Step 2。
5. `?humans=1&ai=...` 跳过面板，行为确定可复现 → Task 5 Step 3/8 + Task 7 Step 3。
6. `?demo=1` 演示棋盘行为不变（分享卡仍为纯棋盘） → Task 7 Step 1（不动 `gen-share-card.mjs`）+ Step 6。
7. `npm run check` 全绿（lint 禁裸值 + skin 校验 + 全部单测） → Task 9 Step 1。
8. 线上回归退出码 0；新增闸门与 e2e 全绿；手机视口截图入库并补进手册 → Task 9 Step 3/4 + Task 8 Step 4。