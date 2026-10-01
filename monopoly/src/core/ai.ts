/**
 * 性格化 AI 决策层（spec §4）：纯函数，**无 await / 无定时器 / 无时间概念**。
 * 只产出「要做什么」（`AiStep[]`，对既有 Game API 的调用意图）；
 * 「什么时候做、做多久」全部由 `src/ui/aiDriver.ts` 决定。
 */
import { currentPlayer, buyDiscountOf, netWorth, type Game, type GameState, type Phase } from './game';
import { buyable, canBuy, discounted, ownedBy } from './estate';
import { buyPrice, canUpgrade, nextLevel } from '../data/economy';
import type { ItemCardKind } from '../data/cards';
import { RING_SIZE } from '../data/board';
import { STOCK_TILE_INDEX, STOCKS } from '../data/stocks';
import { SPEC_LEADER_MIN_ROUND, personaParams, type AiParams, type Persona } from '../data/ai';

export { personaParams } from '../data/ai';
export type { AiParams, Persona, Seat } from '../data/ai';

/** 路障铺在领先者前方第 N 格（≤ BARRIER_RANGE = 6 内，确定性，不引入随机源） */
const BARRIER_LEAD = 3;

/** 计划中的一步；`close` 见计划抬头「澄清 2」（收口浮层，避免陈旧卡面残留到下一位） */
export type AiStep =
  | { kind: 'skip' }
  | { kind: 'card'; card: ItemCardKind; target?: number }
  | { kind: 'trade'; code: string; shares: number }
  | { kind: 'buy' } | { kind: 'upgrade' }
  | { kind: 'roll' } | { kind: 'move' } | { kind: 'settle' }
  | { kind: 'sell'; index: number }          /* M20.1 自由出售自有地块 */
  | { kind: 'auctionBid'; amount: number }   /* M20.1 拍卖出价（0 = 放弃） */
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
    case 'sell': return g.sellEstate(step.index);
    case 'auctionBid': return g.bidAuction(step.amount);
    case 'close': return g.clearEvent();
    case 'end': return g.endTurn();
  }
}

/** 净资产最高者（并列取小 id）；无未破产玩家时返回 null */
export function leaderOf(state: GameState): number | null {
  const alive = state.players.filter((p) => !p.bankrupt);
  if (alive.length === 0) return null;
  return alive.reduce((best, p) => {
    const a = netWorth(state, p);
    const b = netWorth(state, best);
    return a > b || (a === b && p.id < best.id) ? p : best;
  }).id;
}

/** 领先者名下最高等级的地块格号（并列取小格号）；无地时返回 null */
export function leaderBestTile(state: GameState): number | null {
  const id = leaderOf(state);
  if (id === null) return null;
  const tiles = ownedBy(state.estates, id);
  if (tiles.length === 0) return null;
  return tiles.reduce((best, t) => {
    const a = state.estates[t]?.level ?? 0;
    const b = state.estates[best]?.level ?? 0;
    return a > b || (a === b && t < best) ? t : best;
  });
}

/**
 * 是否针对领先者：保守恒 false；激进恒 true；投机仅 `round >= SPEC_LEADER_MIN_ROUND`。
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

/** 某玩家达标（>= minLevel）的地块列表 */
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
  const cand: Array<{ code: string; score: number }> = [];
  for (const def of STOCKS) {
    const price = state.quotes[def.code];
    if (typeof price !== 'number' || price <= 0) continue;
    if (price > cash - P.reserve) continue;             // 买 1 股后仍留 reserve
    const hist = state.priceHistory[def.code] ?? [];
    const peak = hist.length > 0 ? Math.max(...hist) : price;
    if (P.stockPolicy === 'momentum') {
      const gain = price - def.price0;
      if (gain > 0) cand.push({ code: def.code, score: gain });
    } else {
      const drawdown = peak - price;
      if (drawdown > 0) cand.push({ code: def.code, score: drawdown });
    }
  }
  if (cand.length === 0) return null;
  cand.sort((a, b) => (b.score - a.score) || (a.code < b.code ? -1 : 1));
  return cand[0].code;
}

/* —— 各阶段的分支 —— */

function idlePlan(state: GameState, persona: Persona, P: AiParams): AiStep[] {
  const me = currentPlayer(state);
  const hand = state.hands[me.id - 1] ?? [];
  if ((state.jail[me.id - 1] ?? 0) > 0) return [{ kind: 'skip' }];
  const pre: AiStep[] = [];
  if (P.cardPolicy === 'offensive' && targetsLeader(state, persona)) {
    const leader = leaderOf(state);
    /* 拆迁令 / 炸弹：指向领先者名下最高级地块（必须是真实地块，且非自有，否则判非法）。
       demolish 与 bomb **互斥**：优先 demolish（一次夷平），消耗后下回合再用 bomb；
       二者共用 leaderBestTile 挑选，避免同格连打致整段 plan 顺序执行时第二步非法。 */
    const t = leaderBestTile(state);
    if (t !== null && hand.includes('demolish') && state.estates[t]?.owner !== me.id) {
      pre.push({ kind: 'card', card: 'demolish', target: t });
    } else if (t !== null && hand.includes('bomb') && state.estates[t]?.owner !== me.id) {
      pre.push({ kind: 'card', card: 'bomb', target: t });
    }
    /* 路障：铺在领先者前方 BARRIER_LEAD 格（领先者是自己时不自伤） */
    if (hand.includes('barrier') && leader !== null && leader !== me.id) {
      const lp = state.players.find((p) => p.id === leader)?.pos ?? null;
      if (lp !== null) {
        const b = (lp + BARRIER_LEAD) % RING_SIZE;
        if (!state.estates[b] && !state.barriers[b] && b !== me.pos) pre.push({ kind: 'card', card: 'barrier', target: b });
      }
    }
  }
  return [...pre, { kind: 'roll' }];
}

function rolledPlan(state: GameState, persona: Persona): AiStep[] {
  const me = currentPlayer(state);
  /* 投机迁点的落点见计划抬头「澄清 1」：交易所（而非自家地块，落自家无任何收益） */
  if (persona === 'speculative' && me.pos !== STOCK_TILE_INDEX && (state.hands[me.id - 1] ?? []).includes('teleport')) {
    return [{ kind: 'card', card: 'teleport', target: STOCK_TILE_INDEX }];
  }
  return [{ kind: 'move' }];
}

function settledPlan(state: GameState, persona: Persona, P: AiParams): AiStep[] {
  const me = currentPlayer(state);
  const post: AiStep[] = [];
  const pos = me.pos;
  const e = state.estates[pos];

  /* ① 买地：可买 + 无主 + 不超 buyMax + 买后仍 >= reserve（按技能折扣后的实付价评估） */
  if (buyable(pos) && !e) {
    const discount = buyDiscountOf(state, me.id);
    const cost = discounted(buyPrice(1), discount);
    if (cost <= P.buyMax && canBuy(state.estates, pos, me.cash, discount) && me.cash - cost >= P.reserve) post.push({ kind: 'buy' });
  }

  /* ② 升级：自有 + 可升级 + upgradeEager + 不在施工 + 现金门（投机另需已持同级 >=2 块） */
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

  /* ④ 投机专项：租金翻倍（持牌 + 本回合未用 + 现金门 + 已有 >=2 级地块） */
  if (persona === 'speculative' && (state.hands[me.id - 1] ?? []).includes('doubleRent')
    && !state.doubleRent[me.id - 1] && me.cash >= P.reserve && ownedFrom(state, me.id, 2).length > 0) {
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
  if (phase === 'rolled') return rolledPlan(state, persona);
  if (phase === 'moved') return [{ kind: 'settle' }];
  return settledPlan(state, persona, P);
}