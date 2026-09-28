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
  /* 允许从「进行中的回合」起步（HUD 手动点过掷骰/前进/结算后调 sim()）：
     先按阶段机补齐当前回合再自动推进，否则 rollDice 会因越序抛错 */
  if (!g.state.over && g.state.phase !== 'idle') {
    if (g.state.phase === 'rolled') g.moveCurrent();
    if (g.state.phase === 'moved') g.settleCurrent();
    if (g.state.phase === 'settled') g.endTurn();
  }
  let guard = maxTurns;
  while (!g.state.over && guard > 0) {
    autoTurn(g);
    guard -= 1;
  }
  return winnerOf(g.state) ?? 0;
}