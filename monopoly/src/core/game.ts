import { RING_SIZE, typeAt } from '../data/board';
import {
  BANKRUPT_CASH_LINE, PASS_START_BONUS, ROUND_LIMIT, START_CASH,
  buyPrice, canUpgrade, nextLevel,
} from '../data/economy';
import {
  CHANCE_DECK, FATE_DECK, FREE_UPGRADE_REFUND, ITEM_CARDS, PARDON_REFUND,
  type ChanceCardDef, type FateCardDef, type ItemCardKind,
} from '../data/cards';
import { STOCK_TILE_INDEX, STOCKS } from '../data/stocks';
import { advance, type Advance } from './board-path';
import {
  barrierAt, bombDown, clearBarrier, createDeck, grant, has, placeBarrier,
  use as consumeCard, type Barriers, type Deck, type Hand,
} from './cards';
import { createDice, makeRng, type Dice, type DiceRoll } from './dice';
import {
  assetValue, buy, buyable, canBuy, clearProcessing, ownedBy, rentAt, sellAt, upgrade,
  type BuyOutcome, type Estate, type Estates, type UpgradeOutcome,
} from './estate';
import {
  buyShares, createMarket, marketValue, sellShares,
  type Market, type Portfolio, type Quotes, type TradeOutcome as CoreTradeOutcome,
} from './stocks';
import { JAIL_TURNS, nextJail, rollBonus, specialAt, type BonusReward } from './special';

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

/** 最近一次抽卡（翻牌动画消费）：`deck` + 卡面 id + 标题/文案（取自 `cards.ts` 数据） */
export interface DrawLog {
  deck: 'fate' | 'chance';
  cardId: string;
  title: string;
  text: string;
}

/** 命运牌结算结果（供 UI 回放；可断言） */
export type FateEffect =
  | { kind: 'fine'; amount: number; paid: number; bankrupt: boolean }
  | { kind: 'tax'; amount: number; paid: number; bankrupt: boolean }
  | { kind: 'back'; from: number; to: number }
  | { kind: 'weather'; turns: number }
  | { kind: 'lockup'; turns: number }
  | { kind: 'swap'; with: number };

/** 机会牌结算结果（供 UI 回放；可断言） */
export type ChanceEffect =
  | { kind: 'bonus'; amount: number }
  | { kind: 'refund'; amount: number }
  | { kind: 'freeUpgrade'; index: number | null; refund: number }
  | { kind: 'rollAgain' }
  | { kind: 'drawItem'; item: ItemCardKind | null; refund: number }
  | { kind: 'stockTip'; code: string };

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
  /** 与 `players` 下标对齐；每玩家 ≤ 5 槽、去重 */
  hands: Hand[];
  /** 场上路障（`Record<格号, {index, owner}>`） */
  barriers: Barriers;
  /** 每玩家剩余禁行回合（0 = 正常） */
  jail: number[];
  /** 每玩家租金翻倍 buff */
  doubleRent: boolean[];
  /** 每玩家「内幕消息」标的（一次 tick 内生效后清空） */
  stockTip: (string | null)[];
  /** 当前股价（结果快照） */
  quotes: Quotes;
  /** 每支标的的历史价（含发行价；轮末 tick 追加）——行情走势折线的数据源 */
  priceHistory: Record<string, number[]>;
  /** 每玩家持股 */
  portfolios: Portfolio[];
  /** 最近一次抽卡（翻牌动画消费） */
  lastDraw: DrawLog | null;
  /** 最近一次卡牌/奖励/交易（浮层消费） */
  lastEvent: EventLog | null;
  /** 本回合是否还有额外一掷（机会卡 `c-rollAgain`） */
  extraRoll: boolean;
}

export interface GameOptions {
  /** 传入则骰子确定（验收截图 / 单测复现），不传走时间 */
  seed?: number;
  /** 直接注入骰子（单测用固定点数） */
  dice?: Dice;
  playerCount?: number;
  /** 测试注入口：固定牌堆顺序（不洗牌），用于逐张复现指定卡面 */
  decks?: { fate?: FateCardDef[]; chance?: ChanceCardDef[] };
}

/** 落格结算结果（spec §5.2 / §5.4 / §5.5） */
export type SettleResult =
  | { kind: 'start'; index: number }
  | { kind: 'vacant'; index: number; price: number }
  | { kind: 'own'; index: number; level: number }
  | { kind: 'rent'; index: number; owner: number; rent: number; paid: number; sold: number[]; bankrupt: boolean; waived?: boolean }
  | { kind: 'fate'; index: number; cardId: string; effect: FateEffect }
  | { kind: 'chance'; index: number; cardId: string; effect: ChanceEffect }
  | { kind: 'jail'; index: number; turns: number; waived: boolean }
  | { kind: 'bonus'; index: number; reward: BonusReward }
  | { kind: 'stock'; index: number };

/** 浮层消费的事件日志：落格细分 + 用卡 / 交易 */
export type EventLog =
  | Exclude<SettleResult, { kind: 'start' | 'vacant' | 'own' | 'rent' }>
  | { kind: 'card'; card: ItemCardKind; target: number | null }
  | { kind: 'trade'; code: string; shares: number };

/** 细分落格结果的具名别名（供 lastEvent 精确赋值） */
type FateSettle = Extract<SettleResult, { kind: 'fate' }>;
type ChanceSettle = Extract<SettleResult, { kind: 'chance' }>;
type JailSettle = Extract<SettleResult, { kind: 'jail' }>;
type BonusSettle = Extract<SettleResult, { kind: 'bonus' }>;
type StockSettle = Extract<SettleResult, { kind: 'stock' }>;

/** 玩家动作在错误阶段调用（按钮边界），返回失败原因而不抛错 */
export type GameBuyOutcome = BuyOutcome | { ok: false; reason: 'bad-phase' };
export type GameUpgradeOutcome = UpgradeOutcome | { ok: false; reason: 'bad-phase' };

export type CardFail =
  | 'not-held' | 'no-target' | 'bad-phase' | 'occupied' | 'passive'
  | 'not-estate' | 'own-tile' | 'invalid-target';
export type CardOutcome =
  | { ok: true; kind: ItemCardKind; target?: number }
  | { ok: false; reason: CardFail };

export type TradeFail = 'not-at-market' | 'bad-lot' | 'not-enough-cash' | 'not-enough-shares' | 'unknown-code';
export type TradeOutcome =
  | CoreTradeOutcome
  | { ok: false; reason: 'not-at-market' };

export interface Game {
  state: GameState;
  rollDice(): DiceRoll;
  moveCurrent(): Advance;
  settleCurrent(): SettleResult;
  buyCurrent(): GameBuyOutcome;
  upgradeCurrent(): GameUpgradeOutcome;
  endTurn(): void;
  /** 打出手牌（炸弹/路障/免罚/迁点/租金翻倍） */
  useCard(kind: ItemCardKind, target?: number): CardOutcome;
  /** 股票交易：shares > 0 买 / < 0 卖（须站在 index 19 股票交易所） */
  trade(code: string, shares: number): TradeOutcome;
  /** 监狱禁行时唯一的 idle 推进 */
  skipTurn(): { skipped: true; remaining: number };
  /** 关闭浮层（只清 lastEvent / lastDraw） */
  clearEvent(): void;
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
  const seed = opts.seed ?? (Date.now() & 0xffffffff);
  const dice = opts.dice ?? createDice(opts.seed);
  /* 随机源按用途分流：骰子（dice 自身）/ 卡牌 / 股票 / 福利，同 seed 各自可复现 */
  const cardRng = makeRng((seed ^ 0x1234567) >>> 0);
  const marketRng = makeRng((seed ^ 0x7654321) >>> 0);
  const market: Market = createMarket(marketRng);
  const fateDeck: Deck<FateCardDef> = createDeck(
    opts.decks?.fate ?? FATE_DECK, cardRng, { shuffled: !opts.decks?.fate },
  );
  const chanceDeck: Deck<ChanceCardDef> = createDeck(
    opts.decks?.chance ?? CHANCE_DECK, cardRng, { shuffled: !opts.decks?.chance },
  );

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
    hands: Array.from({ length: count }, () => ITEM_CARDS.map((c) => c.kind)),
    barriers: {},
    jail: Array.from({ length: count }, () => 0),
    doubleRent: Array.from({ length: count }, () => false),
    stockTip: Array.from({ length: count }, () => null as string | null),
    quotes: market.quotes(),
    priceHistory: market.history(),
    portfolios: Array.from({ length: count }, () => ({} as Portfolio)),
    lastDraw: null,
    lastEvent: null,
    extraRoll: false,
  };

  const rollDice = (): DiceRoll => {
    if (state.over) throw new Error('[mono] rollDice @over');
    const extra = state.phase === 'settled' && state.extraRoll;
    if (state.phase !== 'idle' && !extra) throw new Error(`[mono] rollDice @phase=${state.phase}`);
    if (state.phase === 'idle' && state.jail[state.current] > 0) throw new Error('[mono] rollDice @jailed');
    const r = dice.roll();
    state.dice = r;
    state.extraRoll = false;
    state.phase = 'rolled';
    return r;
  };

  const moveCurrent = (): Advance => {
    if (state.phase !== 'rolled') throw new Error(`[mono] moveCurrent @phase=${state.phase}`);
    const d = state.dice;
    if (!d) throw new Error('[mono] moveCurrent @no-dice');
    const p = currentPlayer(state);
    /* 路障截断：从起点往前的第 1 个路障处停下，路障消耗 */
    let steps = d.total;
    let hit: number | null = null;
    for (let k = 1; k <= d.total; k++) {
      const idx = ((p.pos + k) % RING_SIZE + RING_SIZE) % RING_SIZE;
      if (barrierAt(state.barriers, idx)) { steps = k; hit = idx; break; }
    }
    const mv = advance(p.pos, steps);
    p.pos = mv.to;
    if (mv.passedStart) p.cash += PASS_START_BONUS;
    if (hit !== null) clearBarrier(state.barriers, hit);
    state.phase = 'moved';
    return { ...mv, ...(hit !== null ? { barrier: hit } : {}) };
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
        const owner = playerById(state, e.owner);
        const base = rentAt(state.estates, index);
        const doubled = owner !== null && state.doubleRent[owner.id - 1];
        const rent = doubled ? base * 2 : base;
        const i = p.id - 1;
        if (has(state.hands[i], 'pardon')) {
          consumeCard(state.hands[i], 'pardon');
          result = { kind: 'rent', index, owner: e.owner, rent, paid: 0, sold: [], bankrupt: false, waived: true };
        } else {
          const debt = settleDebt(state, p, rent, owner);
          if (doubled && owner && base > 0) state.doubleRent[owner.id - 1] = false;
          result = {
            kind: 'rent', index, owner: e.owner, rent,
            paid: debt.paid, sold: debt.sold, bankrupt: debt.bankrupt,
          };
        }
      }
    } else if (specialAt(index) === 'jail') {
      result = resolveJail(p, index);
    } else if (specialAt(index) === 'bonus') {
      result = resolveBonus(p, index);
    } else if (specialAt(index) === 'stock') {
      const stock: StockSettle = { kind: 'stock', index };
      result = stock;
      state.lastEvent = stock;
    } else if (typeAt(index) === 'fate') {
      result = resolveFate(p, index);
    } else if (typeAt(index) === 'chance') {
      result = resolveChance(p, index);
    } else {
      result = { kind: 'start', index };
    }
    state.phase = 'settled';
    return result;
  };

  const drawFrom = (kind: 'fate' | 'chance'): FateCardDef | ChanceCardDef => {
    const card = kind === 'fate' ? fateDeck.draw() : chanceDeck.draw();
    state.lastDraw = { deck: kind, cardId: card.id, title: card.name, text: card.text };
    return card;
  };

  const resolveJail = (p: Player, index: number): JailSettle => {
    const i = p.id - 1;
    if (has(state.hands[i], 'pardon')) {
      consumeCard(state.hands[i], 'pardon');
      const result: JailSettle = { kind: 'jail', index, turns: 0, waived: true };
      state.lastEvent = result;
      return result;
    }
    state.jail[i] = JAIL_TURNS;
    const result: JailSettle = { kind: 'jail', index, turns: JAIL_TURNS, waived: false };
    state.lastEvent = result;
    return result;
  };

  const resolveBonus = (p: Player, index: number): BonusSettle => {
    const i = p.id - 1;
    const reward = rollBonus(cardRng);
    if (reward.kind === 'cash') {
      p.cash += reward.amount;
    } else if (reward.kind === 'item') {
      if (!grant(state.hands[i], reward.item)) p.cash += PARDON_REFUND;
    } else {
      const up = upgradableOf(state, p.id);
      if (up.length === 0) {
        p.cash += FREE_UPGRADE_REFUND;
      } else {
        const pick = up[Math.floor(cardRng() * up.length)];
        const e = state.estates[pick];
        e.level = (e.level + 1) as 1 | 2 | 3;
      }
    }
    const result: BonusSettle = { kind: 'bonus', index, reward };
    state.lastEvent = result;
    return result;
  };

  const resolveFate = (p: Player, index: number): FateSettle => {
    const i = p.id - 1;
    const card = drawFrom('fate') as FateCardDef;
    let effect: FateEffect;
    switch (card.kind) {
      case 'fine':
      case 'tax': {
        const amount = card.amount ?? 0;
        const debt = settleDebt(state, p, amount, null);
        effect = { kind: card.kind, amount, paid: debt.paid, bankrupt: debt.bankrupt };
        break;
      }
      case 'back': {
        const steps = card.steps ?? 0;
        const from = p.pos;
        p.pos = ((from - steps) % RING_SIZE + RING_SIZE) % RING_SIZE;
        effect = { kind: 'back', from, to: p.pos };
        break;
      }
      case 'weather': {
        state.jail[i] = 1;
        effect = { kind: 'weather', turns: 1 };
        break;
      }
      case 'lockup': {
        if (has(state.hands[i], 'pardon')) {
          consumeCard(state.hands[i], 'pardon');
          state.jail[i] = 0;
          effect = { kind: 'lockup', turns: 0 };
        } else {
          state.jail[i] = JAIL_TURNS;
          effect = { kind: 'lockup', turns: JAIL_TURNS };
        }
        break;
      }
      default: {
        const others = state.players.filter((o) => o.id !== p.id && !o.bankrupt);
        const other = others[Math.floor(cardRng() * others.length)];
        if (other) {
          const tmp = other.pos;
          other.pos = p.pos;
          p.pos = tmp;
          effect = { kind: 'swap', with: other.id };
        } else {
          effect = { kind: 'swap', with: p.id };
        }
        break;
      }
    }
    const result: FateSettle = { kind: 'fate', index, cardId: card.id, effect };
    state.lastEvent = result;
    return result;
  };

  const resolveChance = (p: Player, index: number): ChanceSettle => {
    const i = p.id - 1;
    const card = drawFrom('chance') as ChanceCardDef;
    let effect: ChanceEffect;
    switch (card.kind) {
      case 'bonus':
        p.cash += card.amount ?? 0;
        effect = { kind: 'bonus', amount: card.amount ?? 0 };
        break;
      case 'refund':
        p.cash += card.amount ?? 0;
        effect = { kind: 'refund', amount: card.amount ?? 0 };
        break;
      case 'freeUpgrade': {
        const up = upgradableOf(state, p.id);
        if (up.length === 0) {
          p.cash += FREE_UPGRADE_REFUND;
          effect = { kind: 'freeUpgrade', index: null, refund: FREE_UPGRADE_REFUND };
        } else {
          const pick = up[Math.floor(cardRng() * up.length)];
          const e = state.estates[pick];
          e.level = (e.level + 1) as 1 | 2 | 3;
          effect = { kind: 'freeUpgrade', index: pick, refund: 0 };
        }
        break;
      }
      case 'rollAgain':
        state.extraRoll = true;
        effect = { kind: 'rollAgain' };
        break;
      case 'drawItem': {
        const item = ITEM_CARDS[Math.floor(cardRng() * ITEM_CARDS.length)].kind;
        if (grant(state.hands[i], item)) {
          effect = { kind: 'drawItem', item, refund: 0 };
        } else {
          p.cash += PARDON_REFUND;
          effect = { kind: 'drawItem', item: null, refund: PARDON_REFUND };
        }
        break;
      }
      default: {
        const code = STOCKS[Math.floor(cardRng() * STOCKS.length)].code;
        state.stockTip[i] = code;
        effect = { kind: 'stockTip', code };
        break;
      }
    }
    const result: ChanceSettle = { kind: 'chance', index, cardId: card.id, effect };
    state.lastEvent = result;
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

  const useCard = (kind: ItemCardKind, target?: number): CardOutcome => {
    const p = currentPlayer(state);
    const i = p.id - 1;
    if (!has(state.hands[i], kind)) return { ok: false, reason: 'not-held' };
    switch (kind) {
      case 'pardon':
        return { ok: false, reason: 'passive' };
      case 'bomb': {
        if (target === undefined) return { ok: false, reason: 'no-target' };
        const out = bombDown(state.estates, target, p.id);
        if (!out.ok) return { ok: false, reason: out.reason };
        consumeCard(state.hands[i], kind);
        state.lastEvent = { kind: 'card', card: kind, target };
        return { ok: true, kind, target };
      }
      case 'barrier': {
        if (target === undefined) return { ok: false, reason: 'no-target' };
        if (!placeBarrier(state.barriers, target, p.id)) return { ok: false, reason: 'occupied' };
        consumeCard(state.hands[i], kind);
        state.lastEvent = { kind: 'card', card: kind, target };
        return { ok: true, kind, target };
      }
      case 'teleport': {
        if (state.phase !== 'rolled') return { ok: false, reason: 'bad-phase' };
        if (target === undefined) return { ok: false, reason: 'no-target' };
        p.pos = ((target % RING_SIZE) + RING_SIZE) % RING_SIZE;
        state.phase = 'moved';
        consumeCard(state.hands[i], kind);
        state.lastEvent = { kind: 'card', card: kind, target };
        return { ok: true, kind, target };
      }
      default: {
        state.doubleRent[i] = true;
        consumeCard(state.hands[i], kind);
        state.lastEvent = { kind: 'card', card: kind, target: null };
        return { ok: true, kind };
      }
    }
  };

  const trade = (code: string, shares: number): TradeOutcome => {
    const p = currentPlayer(state);
    if (p.pos !== STOCK_TILE_INDEX) return { ok: false, reason: 'not-at-market' };
    if (shares === 0) return { ok: false, reason: 'bad-lot' };
    const i = p.id - 1;
    const out = shares > 0
      ? buyShares(state.portfolios[i], state.quotes, code, shares, p.cash)
      : sellShares(state.portfolios[i], state.quotes, code, -shares, p.cash);
    if (out.ok) {
      p.cash = out.cash;
      state.lastEvent = { kind: 'trade', code, shares };
    }
    return out;
  };

  /** 轮末统一 tick 股价 + 清空「内幕消息」标的 */
  const onRoundBoundary = (): void => {
    const tips = state.stockTip.filter((c): c is string => c !== null);
    state.quotes = market.tick(tips);
    state.priceHistory = market.history();
    state.stockTip = state.stockTip.map(() => null);
  };

  /** 交下一位未破产玩家（endTurn 与 skipTurn 共用；唯一换手处） */
  const advanceToNext = (): void => {
    const n = state.players.length;
    let next = state.current;
    for (let k = 0; k < n; k++) {
      next = (next + 1) % n;
      if (next === 0) {
        state.round += 1;
        onRoundBoundary();
      }
      if (!state.players[next].bankrupt) break;
    }
    state.current = next;
    state.phase = 'idle';
    state.dice = null;
    state.extraRoll = false;
    /* 新玩家回合开始：解除其地块的「施工中」（BUILD_TURNS = 1 的落地处，spec §5.2） */
    clearProcessing(state.estates, state.players[next].id);
    if (activeCount(state) <= 1 || state.round > ROUND_LIMIT) state.over = true;
  };

  const endTurn = (): void => {
    if (state.phase !== 'settled') throw new Error(`[mono] endTurn @phase=${state.phase}`);
    if (state.over) return;
    advanceToNext();
  };

  const skipTurn = (): { skipped: true; remaining: number } => {
    if (state.phase !== 'idle') throw new Error(`[mono] skipTurn @phase=${state.phase}`);
    const i = state.current;
    if (state.jail[i] <= 0) throw new Error('[mono] skipTurn @not-jailed');
    state.jail[i] = nextJail(state.jail[i]);
    const remaining = state.jail[i];
    advanceToNext();
    return { skipped: true, remaining };
  };

  const clearEvent = (): void => {
    state.lastDraw = null;
    state.lastEvent = null;
  };

  return {
    state, rollDice, moveCurrent, settleCurrent, buyCurrent, upgradeCurrent, endTurn,
    useCard, trade, skipTurn, clearEvent,
  };
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

/** 净资产 = 现金 + 地产账面投入 + 股票市值（胜负排名口径，与变卖价区分） */
export function netWorth(state: GameState, player: Player): number {
  return player.cash + assetValue(state.estates, player.id) + marketValue(state.portfolios[player.id - 1] ?? {}, state.quotes);
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

/** 该玩家当前可升级（未封顶）的地块序号（免费升级类奖励选点用） */
function upgradableOf(state: GameState, owner: number): number[] {
  return ownedBy(state.estates, owner).filter((i) => canUpgrade(state.estates[i].level));
}

/**
 * 欠租 / 罚款结算（spec §5.4）：
 * ① 现金不足先变卖抵债（变卖价低者先卖，只卖到够付为止，保住高价值资产）；
 * ② 地产卖光仍不足 → 按当前价折算持股入现金（持股非抵押物，但清算时折现，避免「一堆股却判破产」）；
 * ③ 付得起付清；付不起则把手里的现金全给对方，自己落到破产线；
 * ④ 破产条件 = 付不起 且 已无可变卖地产与股票。
 */
function settleDebt(state: GameState, payer: Player, amount: number, receiver: Player | null): DebtResult {
  const sold: number[] = [];
  while (payer.cash < amount) {
    const owned = ownedBy(state.estates, payer.id);
    if (owned.length > 0) {
      let cheapest = owned[0];
      for (const i of owned) {
        if (sellAt(state.estates, i) < sellAt(state.estates, cheapest)) cheapest = i;
      }
      payer.cash += sellAt(state.estates, cheapest);
      releaseEstate(state.estates, cheapest);
      sold.push(cheapest);
      continue;
    }
    const pf = state.portfolios[payer.id - 1];
    const codes = Object.keys(pf);
    if (codes.length === 0) break;
    for (const code of codes) {
      payer.cash += pf[code].shares * (state.quotes[code] ?? 0);
      delete (pf as Record<string, unknown>)[code];
    }
  }
  const affordable = payer.cash >= amount;
  const paid = affordable ? amount : payer.cash;
  payer.cash = affordable ? payer.cash - amount : BANKRUPT_CASH_LINE;
  if (receiver) receiver.cash += paid;
  const bankrupt = !affordable && ownedBy(state.estates, payer.id).length === 0
    && Object.keys(state.portfolios[payer.id - 1]).length === 0;
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
  const s = g.state;
  /* 监狱禁行：本回合唯一推进 = skipTurn */
  if (s.phase === 'idle' && s.jail[s.current] > 0) {
    g.skipTurn();
    return;
  }
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