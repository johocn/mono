import { RING_SIZE, typeAt } from '../data/board';
import {
  BANKRUPT_CASH_LINE, PASS_START_BONUS, ROUND_LIMIT, START_CASH,
  buyPrice, canUpgrade, nextLevel,
} from '../data/economy';
import {
  CHANCE_DECK, FATE_DECK, FREE_UPGRADE_REFUND, ITEM_CARDS, PARDON_REFUND,
  type ChanceCardDef, type FateCardDef, type ItemCardKind,
} from '../data/cards';
import {
  DIVIDEND_PER_SHARE, DIVIDEND_REFUND, LEVERAGES, LIQUIDATION_RATIO, MARGIN_RATE, STOCKS,
  STOCK_FEE_RATIO, STOCK_TILE_INDEX, type StockPlay,
} from '../data/stocks';
import { advance, type Advance } from './board-path';
import {
  barrierAt, bombDown, clearBarrier, createDeck, demolishDown, grant, has, placeBarrier,
  use as consumeCard, type Barriers, type Deck, type Hand,
} from './cards';
import { createDice, makeRng, type Dice, type DiceRoll } from './dice';
import {
  assetValue, buy, buyable, canBuy, clearProcessing, discounted, ownedBy, rentAt, sellAt, transferEstate, upgrade,
  type BuyOutcome, type Estate, type Estates, type UpgradeOutcome,
} from './estate';
import {
  buyShares, createMarket, marketValue, sellShares,
  type Market, type Portfolio, type Quotes, type StockForce, type TradeOutcome as CoreTradeOutcome,
} from './stocks';
import { priceOf, resaleOf } from './item-shop';
import {
  HOSPITAL_TURNS, JAIL_TURNS, LOTTERY_STAKE, TAX_CAP, TAX_RATE,
  nextJail, rollBonus, rollLottery, specialAt, type BonusReward,
} from './special';
import {
  BANK_DEPOSIT_BONUS, BANK_TILE_INDEX, DEPOSIT_RATE, LOAN_RATE, LOAN_TERM, MORTGAGE_RATE, MORTGAGE_TERM,
  OVERDUE_SEIZE_ROUNDS,
} from '../data/bank';
import {
  loanLimitOf, mortgageLimitOf, overdueOf, penaltyOf, type DebtBook, type MortgageBook,
  interestOf,
} from './bank';
import { abilityOfPlayer, type AbilityDef } from '../data/abilities';
import { personaParams, type AiParams, type Persona, type Seat } from '../data/ai';
import { aiBidFor, lotOf, resolveLot, type AuctionBid, type AuctionLot, type AuctionTrigger } from './auction';
import { FACILITIES, type FacilityId } from '../data/facilities';
import { NEWS_TABLE, type NewsItem } from '../data/news';
import {
  canSubscribe, dividendOf, newsCoefOf, newsForceOf, type FacilityFail,
} from './facility';

/** 回合阶段机（spec §5.1）：idle → rolled → moved → settled → (endTurn) → idle */
export type Phase = 'idle' | 'rolled' | 'moved' | 'settled';

/** M20.3-B 保证金借款（null = 无负债）。抵押物 = 该玩家**整个股票账户**（B-D5） */
export interface MarginBook {
  /** 借入本金（轮末按 `MARGIN_RATE` 复利） */
  principal: number;
  /** 每轮利率 */
  rate: number;
}

export interface Player {
  /** 1..4，与 `piece.p1..p4` / `tokens.owner1..owner4` 对齐 */
  id: number;
  /** 外圈地块序号 0..31 */
  pos: number;
  cash: number;
  bankrupt: boolean;
  /* —— M20.2 信贷（spec §3.1）—— */
  /** 存款（轮末 +3% 复利；欠款清算时优先自动取出，但不免死） */
  deposit: number;
  /** 信用贷款（同时至多 1 笔；null = 无） */
  loan: DebtBook | null;
  /** 抵押贷款（可多笔，按 `index` 升序） */
  mortgages: MortgageBook[];
  /* —— M20.3-B 股票杠杆（spec §5.1）—— */
  /** 保证金借款（null = 无）；爆仓判定与卖出自动还债都作用于此 */
  margin: MarginBook | null;
  /* —— M20.4 公共设施入股（spec §5.1）—— */
  /** 设施持股（`FacilityId` → 股数；未持有为缺键）；每处至多 20 股、先到先得 */
  facilities: Partial<Record<FacilityId, number>>;
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
  | { kind: 'swap'; with: number }
  /* —— 扩容牌（cards.ts 20 张）—— */
  | { kind: 'advance'; from: number; to: number; steps: number }
  | { kind: 'gift'; amount: number }
  | { kind: 'levy'; amount: number; percent: number; paid: number; bankrupt: boolean }
  | { kind: 'demote'; index: number | null; level: number }
  | { kind: 'tribute'; amount: number; total: number; paid: number; bankrupt: boolean }
  | { kind: 'harvest'; amount: number; total: number }
  | { kind: 'toStart'; from: number }
  | { kind: 'repair'; amount: number; count: number; paid: number; bankrupt: boolean };

/** 机会牌结算结果（供 UI 回放；可断言） */
export type ChanceEffect =
  | { kind: 'bonus'; amount: number }
  | { kind: 'refund'; amount: number }
  | { kind: 'freeUpgrade'; index: number | null; refund: number }
  | { kind: 'rollAgain' }
  | { kind: 'drawItem'; item: ItemCardKind | null; refund: number }
  | { kind: 'stockTip'; code: string }
  /* —— 扩容牌（cards.ts 20 张）—— */
  | { kind: 'advance'; from: number; to: number; steps: number }
  | { kind: 'toStart'; from: number }
  | { kind: 'collect'; amount: number; total: number }
  | { kind: 'grantItem'; item: ItemCardKind | null; refund: number };

/** 拍卖落槌记录（spec §3.4） */
export interface AuctionResult {
  index: number;
  level: number;
  winner: number | null;
  price: number;
}

/** 待拍态（null = 无拍卖）。`pending` 非空 ⇒ 正在等真人出价（游戏挂起） */
export interface PendingAuction {
  trigger: AuctionTrigger;
  /** 资产原主（破产者）id */
  payerId: number;
  /** 债权人 id（null = 银行） */
  creditorId: number | null;
  /** 待清偿欠款 */
  amount: number;
  /** 后续待拍地块（升序；队首 = 当前拍品） */
  queue: number[];
  /** 当前拍品快照 */
  lot: AuctionLot;
  /** 已收到的密封报价（AI 即时算完） */
  bids: AuctionBid[];
  /** 仍在等出价的**真人** id（升序） */
  pending: number[];
  /** 已落槌记录 */
  results: AuctionResult[];
  /** 清仓拍卖（破产后处置抵押物）：不为「筹够欠款」提前收手，跑完队列才收尾（M20.2） */
  sellAll?: boolean;
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
  /** 与 `players` 下标对齐；每玩家 ≤ 5 槽、去重 */
  hands: Hand[];
  /** 场上路障（`Record<格号, {index, owner}>`） */
  barriers: Barriers;
  /** 每玩家剩余禁行回合（0 = 正常） */
  jail: number[];
  /** 每玩家租金翻倍 buff */
  doubleRent: boolean[];
  /** 每玩家「强制方向」标的（M20.3-B：内幕消息 / 涨跌卡同源；一次 tick 内生效后清空） */
  stockForce: (StockForce | null)[];
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
  /** 角色技能是否启用（对局开始即定，之后不再变） */
  abilitiesOn: boolean;
  /** 席位归属（`null` = 真人，否则 AI 性格）；未传时全部视为 AI ⇒ 拍卖同步跑完 */
  seats: (Persona | null)[];
  /** 待拍态（null = 无拍卖） */
  auction: PendingAuction | null;
  /* —— M20.4 公共设施入股 + 每轮新闻（spec §5.1）—— */
  /** 当期新闻（每轮 1 条，F-D8；`null` = 尚未发布） */
  news: NewsItem | null;
  /** 本设施本轮累计的现金流（轮末分红后清空；供分红计算与 UI 说明，F-D4） */
  facilityCashflow: Record<FacilityId, number>;
}

export interface GameOptions {
  /** 传入则骰子确定（验收截图 / 单测复现），不传走时间 */
  seed?: number;
  /** 直接注入骰子（单测用固定点数） */
  dice?: Dice;
  playerCount?: number;
  /** 测试注入口：固定牌堆顺序（不洗牌），用于逐张复现指定卡面 */
  decks?: { fate?: FateCardDef[]; chance?: ChanceCardDef[] };
  /**
   * 角色技能开关（`data/abilities.ts`）：true = 启用四众专属能力，false = 传统无技能基线。
   * 默认 **false** ⇒ 既有回归/单测口径逐值不变；正式对局由 `main.ts` 显式开启。
   */
  abilities?: boolean;
  /**
   * 席位归属（`null` = 真人）：未传 / 越界项 ⇒ 视为 AI（默认 `'conservative'`）。
   * 默认全 AI ⇒ 拍卖同步跑完、不产生待拍态，保证既有回归口径逐值不变。
   */
  seats?: Seat[];
}

/** 落格结算结果（spec §5.2 / §5.4 / §5.5） */
export type SettleResult =
  | { kind: 'start'; index: number }
  | { kind: 'vacant'; index: number; price: number }
  | { kind: 'own'; index: number; level: number }
  | { kind: 'rent'; index: number; owner: number; rent: number; paid: number; sold: number[]; bankrupt: boolean; waived?: boolean; penalty?: number }
  | { kind: 'fate'; index: number; cardId: string; effect: FateEffect }
  | { kind: 'chance'; index: number; cardId: string; effect: ChanceEffect }
  | { kind: 'jail'; index: number; turns: number; waived: boolean }
  | { kind: 'bonus'; index: number; reward: BonusReward }
  | { kind: 'stock'; index: number }
  | { kind: 'bank'; index: number; bonus: number }
  | { kind: 'lottery'; index: number; stake: number; prize: number }
  | { kind: 'tax'; index: number; amount: number; paid: number; sold: number[]; bankrupt: boolean }
  | { kind: 'hospital'; index: number; turns: number; waived: boolean }
  | { kind: 'auction'; index: number; payer: number; creditor: number | null; amount: number; remaining: number };

/** 浮层消费的事件日志：落格细分 + 用卡 / 交易 */
export type EventLog =
  | Exclude<SettleResult, { kind: 'start' | 'vacant' | 'own' | 'rent' }>
  | { kind: 'auctionDone'; index: number; winner: number | null; price: number }
  | { kind: 'card'; card: ItemCardKind; target: number | null }
  | { kind: 'trade'; code: string; shares: number }
  | { kind: 'item-shop'; action: 'buy' | 'sell'; card: ItemCardKind; price: number }
  | { kind: 'sell'; index: number; price: number }
  /** M20.4 设施认购（F-D1 / F-D13）：`facility` 处新增 `shares` 股、付 `cost` */
  | { kind: 'facility'; facility: FacilityId; shares: number; cost: number }
  /** M20.3-B 爆仓强平：`debt` = 清仓后仍不足、已转入信用贷款的余债；`refund` = 还清后返还现金 */
  | { kind: 'marginCall'; player: number; debt: number; refund: number };

/** 细分落格结果的具名别名（供 lastEvent 精确赋值） */
type FateSettle = Extract<SettleResult, { kind: 'fate' }>;
type ChanceSettle = Extract<SettleResult, { kind: 'chance' }>;
type JailSettle = Extract<SettleResult, { kind: 'jail' }>;
type BonusSettle = Extract<SettleResult, { kind: 'bonus' }>;
type StockSettle = Extract<SettleResult, { kind: 'stock' }>;
type BankSettle = Extract<SettleResult, { kind: 'bank' }>;
type LotterySettle = Extract<SettleResult, { kind: 'lottery' }>;
type TaxSettle = Extract<SettleResult, { kind: 'tax' }>;
type HospitalSettle = Extract<SettleResult, { kind: 'hospital' }>;

/** 玩家动作在错误阶段调用（按钮边界），返回失败原因而不抛错 */
export type GameBuyOutcome = BuyOutcome | { ok: false; reason: 'bad-phase' };
export type GameUpgradeOutcome = UpgradeOutcome | { ok: false; reason: 'bad-phase' | 'mortgaged' };

/** 自由出售结果（spec §3.5） */
export type SellOutcome =
  | { ok: true; index: number; price: number; cash: number }
  | { ok: false; reason: 'no-estate' | 'not-owner' | 'mortgaged' };

/** 银行信贷操作失败原因（M20.2，spec §3.2 / §3.4） */
export type BankFail =
  | 'bad-amount'          // 金额非正整数
  | 'not-enough-cash'     // 现金不足
  | 'not-enough-deposit'  // 存款不足
  | 'not-at-bank'         // 未站在 9 号银行格
  | 'has-loan'            // 已有未结清信用贷款
  | 'no-limit'            // 额度为 0
  | 'no-estate'           // 地块不存在
  | 'not-owner'           // 非自有地块
  | 'mortgaged'           // 地块已抵押
  | 'processing'          // 地块施工中
  | 'no-debt'             // 无该笔债务
  | 'no-mortgage';        // 该地块未抵押

/** 银行信贷操作结果（M20.2） */
export type BankOutcome =
  | { ok: true; amount: number }
  | { ok: false; reason: BankFail };

/** 拍卖出价结果（spec §3.4） */
export type BidOutcome =
  | { ok: true; amount: number }
  | { ok: false; reason: 'no-auction' | 'bad-amount' };

export type CardFail =
  | 'not-held' | 'no-target' | 'bad-phase' | 'occupied' | 'passive'
  | 'not-estate' | 'own-tile' | 'invalid-target' | 'unknown-code';
export type CardOutcome =
  | { ok: true; kind: ItemCardKind; target?: number }
  | { ok: false; reason: CardFail };

export type TradeFail = 'not-at-market' | 'bad-lot' | 'not-enough-cash' | 'not-enough-shares' | 'unknown-code';
export type TradeOutcome =
  | CoreTradeOutcome
  | { ok: false; reason: 'not-at-market' };

/** 道具商店买卖失败原因（M20.3 spec §5.3） */
export type ItemShopFail = 'unknown-kind' | 'already-owned' | 'not-owned' | 'not-enough-cash';

/** 道具商店买卖结果：每次 1 张、不推进回合（与 M20.2 银行六 API 同构） */
export type ItemShopOutcome =
  | { ok: true; kind: ItemCardKind; price: number }
  | { ok: false; reason: ItemShopFail };

/** 设施认购结果（F-D2 / F-D13）：成功返回成交价与剩余现金；失败带 `FacilityFail` 原因 */
export type FacilityOutcome =
  | { ok: true; facility: FacilityId; shares: number; cost: number; cash: number }
  | { ok: false; reason: FacilityFail };

export interface Game {
  state: GameState;
  rollDice(): DiceRoll;
  moveCurrent(): Advance;
  settleCurrent(): SettleResult;
  buyCurrent(): GameBuyOutcome;
  upgradeCurrent(): GameUpgradeOutcome;
  endTurn(): void;
  /** 打出手牌（炸弹/路障/免罚/迁点/租金翻倍；M20.3-B 增涨跌卡 / 红利卡） */
  useCard(kind: ItemCardKind, target?: number, stock?: StockPlay): CardOutcome;
  /** 股票交易：shares > 0 买 / < 0 卖（须站在 index 19 股票交易所）；杠杆买入给 `leverage`（2 / 3，默认 1） */
  trade(code: string, shares: number, leverage?: number): TradeOutcome;
  /** 自由出售自有地块：价 = `sellAt()`（变卖价 100%）；售出地块删键回归「可购买」 */
  sellEstate(index: number): SellOutcome;
  /** 拍卖出价（给 `pending` 队首的真人）；amount = 0 表示放弃 */
  bidAuction(amount: number): BidOutcome;
  /** 把当前所有待出价的真人一次性按 AI 同源策略补全并收尾（`sim()` / e2e / 取证用） */
  autoResolveAuction(): void;
  /* —— M20.2 银行信贷（spec §3.2）—— */
  /** 存款：现金 → 存款（amount > 0 且现金足） */
  deposit(amount: number): BankOutcome;
  /** 取款：存款 → 现金（amount > 0 且存款足） */
  withdraw(amount: number): BankOutcome;
  /** 信用贷款：须站 9 号格 + 无未结清贷款 + 额度 > 0；额度一次性入现金 */
  takeLoan(): BankOutcome;
  /** 还款：不传 amount 则全额还清可用现金；本金归零即结清 */
  repayLoan(amount?: number): BankOutcome;
  /** 抵押贷款：须站 9 号格 + 自有 + 未抵押 + 未施工；借款额 = 变卖价 × 80% 入现金 */
  takeMortgage(index: number): BankOutcome;
  /** 赎回抵押：付清该笔本金，解锁地块 */
  redeemMortgage(index: number): BankOutcome;
  /* —— M20.3 道具商店（spec §5.3）—— */
  /** 买入道具（每次 1 张）：扣售价，加入当前玩家手牌；已持有 / 现金不足则失败 */
  buyItem(kind: string): ItemShopOutcome;
  /** 卖出道具（每次 1 张）：移出手牌，加回收价（售价 × 50%）；未持有则失败 */
  sellItem(kind: string): ItemShopOutcome;
  /* —— M20.4 公共设施入股（spec §5.3）—— */
  /** 认购设施股：`shares` 股、每处至多 20 股先到先得；不推进回合（与银行 / 商店同构） */
  buyFacility(facility: FacilityId, shares: number): FacilityOutcome;
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

/** 该玩家买地实付折扣（技能未启用 → 1）；模块级口径，供 `autoTurn` 与 AI 决策共用 */
export function buyDiscountOf(state: GameState, id: number): number {
  return state.abilitiesOn ? abilityOfPlayer(id).buyDiscount : 1;
}

/** 该玩家应付租金减免比例（技能未启用 → 0） */
export function rentReliefOf(state: GameState, id: number): number {
  return state.abilitiesOn ? abilityOfPlayer(id).rentRelief : 0;
}

/* —— M20.4 设施现金流的零值构造 / 新闻抽取（均确定性纯函数）—— */

/** 五处设施本轮现金流全 0 的初始表（F-D4：未产生现金流时整条分红链恒为 0） */
function zeroCashflow(): Record<FacilityId, number> {
  return { bank: 0, exchange: 0, hospital: 0, lottery: 0, welfare: 0 };
}

/** 从新闻表按独立流抽 1 条（F-D8）：`Math.floor(rng() × 表长)`，索引必然在界内 */
function rollNews(rng: () => number): NewsItem {
  return NEWS_TABLE[Math.floor(rng() * NEWS_TABLE.length)];
}

export function createGame(opts: GameOptions = {}): Game {
  const count = opts.playerCount ?? 4;
  const seed = opts.seed ?? (Date.now() & 0xffffffff);
  const dice = opts.dice ?? createDice(opts.seed);
  /* 随机源按用途分流：骰子（dice 自身）/ 卡牌 / 股票 / 福利，同 seed 各自可复现 */
  const cardRng = makeRng((seed ^ 0x1234567) >>> 0);
  const marketRng = makeRng((seed ^ 0x7654321) >>> 0);
  /* M20.4 新闻独立流（F-D7）：与卡牌 / 行情互不干扰 */
  const newsRng = makeRng((seed ^ 0x2468ace) >>> 0);
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
      deposit: 0,
      loan: null,
      mortgages: [],
      margin: null,
      facilities: {},
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
    stockForce: Array.from({ length: count }, () => null as StockForce | null),
    quotes: market.quotes(),
    priceHistory: market.history(),
    portfolios: Array.from({ length: count }, () => ({} as Portfolio)),
    lastDraw: null,
    lastEvent: null,
    extraRoll: false,
    abilitiesOn: opts.abilities === true,
    seats: Array.from({ length: count }, (_, i): Persona | null => {
      const s = opts.seats?.[i];
      return s !== undefined ? s : 'conservative';
    }),
    auction: null,
    /* M20.4：开局即发布第 1 轮新闻（F-D8），现金流表清零 */
    news: rollNews(newsRng),
    facilityCashflow: zeroCashflow(),
  };

  /** 某玩家的技能（未启用时返回 null，调用处按中性值处理） */
  const skill = (id: number): AbilityDef | null => (state.abilitiesOn ? abilityOfPlayer(id) : null);

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
    /* 技能「筋斗云」：本回合额外前进若干格（并同步纳入路障扫描范围） */
    const steps0 = d.total + (skill(p.id)?.stepBonus ?? 0);
    /* 路障截断：从起点往前的第 1 个路障处停下，路障消耗 */
    let steps = steps0;
    let hit: number | null = null;
    for (let k = 1; k <= steps0; k++) {
      const idx = ((p.pos + k) % RING_SIZE + RING_SIZE) % RING_SIZE;
      if (barrierAt(state.barriers, idx)) { steps = k; hit = idx; break; }
    }
    const mv = advance(p.pos, steps);
    p.pos = mv.to;
    /* 技能「任劳任怨」：经过起点的额外津贴 */
    if (mv.passedStart) p.cash += PASS_START_BONUS + (skill(p.id)?.passStartBonus ?? 0);
    if (hit !== null) clearBarrier(state.barriers, hit);
    state.phase = 'moved';
    return { ...mv, ...(hit !== null ? { barrier: hit } : {}) };
  };

  /* —— M20.1 拍卖机器（spec §3.3 / §3.4）——
     全部为 createGame 内闭包。`lotOpen` 标记「当前拍品是否已收齐报价」：零报价流拍也必须翻牌，
     否则泵会反复「重开同一块」，故不能只用 `bids.length + pending.length > 0` 推断。 */
  let lotOpen = false;
  /* 当前拍品的起拍价口径（M20.2）：抵押中地块用「借款额」，其余用变卖价；每场拍卖开始时重置 */
  let lotPriceOf: (index: number) => number = (i) => sellAt(state.estates, i);

  /** 某席位的 AI 参数（真人席位在补算时也按默认保守档，见 autoResolveAuction） */
  const aiParamsOf = (id: number): AiParams => personaParams(state.seats[id - 1] ?? 'conservative');

  /** 竞拍人 = 除破产者与原主外的所有玩家（`state.players` 天然升序） */
  const biddersFor = (payerId: number): Player[] =>
    state.players.filter((p) => !p.bankrupt && p.id !== payerId);

  /** 开拍：AI 席位即时算价入 `bids`，真人席位入 `pending`（升序） */
  const openLot = (a: PendingAuction): void => {
    a.bids = [];
    a.pending = [];
    for (const b of biddersFor(a.payerId)) {
      if (state.seats[b.id - 1] === null) a.pending.push(b.id);
      else a.bids.push({ bidder: b.id, amount: aiBidFor(b.cash, a.lot, aiParamsOf(b.id)) });
    }
    lotOpen = true;
  };

  /** 落槌：成交转移 / 流拍抵债 / 银行流拍回归无主；成交价计入原主 `cash`、中标者 `cash` 扣减 */
  const applyLot = (a: PendingAuction): void => {
    const win = resolveLot(a.bids, a.lot.startPrice);
    const payer = playerById(state, a.payerId);
    if (win.winner !== null) {
      const buyer = playerById(state, win.winner);
      if (buyer) buyer.cash -= win.price;
      transferEstate(state.estates, a.lot.index, win.winner);
      if (payer) payer.cash += win.price;
    } else if (a.creditorId !== null) {
      transferEstate(state.estates, a.lot.index, a.creditorId);
      if (payer) payer.cash += a.lot.startPrice;
    } else {
      releaseEstate(state.estates, a.lot.index);
    }
    a.results.push({ index: a.lot.index, level: a.lot.level, winner: win.winner, price: win.price });
    lotOpen = false;
  };

  /** 拍卖泵：等真人报价 → 挂起（返回 true）；否则落槌并继续下一块，直到「队列空」或「已筹够」→ false */
  const advancePump = (a: PendingAuction): boolean => {
    const payer = playerById(state, a.payerId);
    if (!payer) return false;
    for (;;) {
      if (!lotOpen) {
        if (a.queue.length === 0) return false;
        const e = state.estates[a.queue[0]];
        const lot: AuctionLot | null = e ? { index: e.index, level: e.level, startPrice: lotPriceOf(e.index) } : null;
        if (!lot) { a.queue.shift(); continue; }
        a.lot = lot;
        openLot(a);
      }
      if (a.pending.length > 0) return true;
      applyLot(a);
      a.queue.shift();
      if (!a.sellAll && payer.cash >= a.amount) return false;
    }
  };

  /** 清算收尾（折股 → 付清 / 破产）：旧 settleDebt 尾段，一字不改 */
  const closeDebt = (payer: Player, amount: number, receiver: Player | null): { paid: number; bankrupt: boolean } => {
    if (payer.cash < amount) {
      const pf = state.portfolios[payer.id - 1];
      for (const code of Object.keys(pf)) {
        payer.cash += pf[code].shares * (state.quotes[code] ?? 0);
        delete (pf as Record<string, unknown>)[code];
      }
    }
    const affordable = payer.cash >= amount;
    const paid = affordable ? amount : payer.cash;
    payer.cash = affordable ? payer.cash - amount : BANKRUPT_CASH_LINE;
    if (receiver) receiver.cash += paid;
    /* 破产判定（M20.2 §3.5-D23）：抵押中地块不算「可自救资产」（由链三/破产清偿单独处置） */
    const bankrupt = !affordable
      && !ownedBy(state.estates, payer.id).some((i) => !creditLocked(state, i))
      && Object.keys(state.portfolios[payer.id - 1]).length === 0;
    if (bankrupt) payer.bankrupt = true;
    return { paid, bankrupt };
  };

  /** 拍卖收尾：清待拍态 → 折股 → 付清 / 破产；`sold` = 所有落槌地块（旧 DebtResult 口径） */
  const finishAuction = (a: PendingAuction, emit: boolean): DebtResult => {
    state.auction = null;
    const payer = playerById(state, a.payerId);
    const receiver = a.creditorId !== null ? playerById(state, a.creditorId) : null;
    const sold = a.results.map((r) => r.index);
    if (!payer) return { paid: 0, sold, bankrupt: false };
    const { paid, bankrupt } = closeDebt(payer, a.amount, receiver);
    /* 成交款冲抵触发它的那笔债务本金（spec §3.4 链二 / 链三）；破产分支改由 `liquidateMortgages` 清账 */
    if (!bankrupt && a.trigger === 'loan-overdue') applyToPrincipal(payer, paid);
    if (!bankrupt && a.trigger === 'mortgage-overdue') {
      const idx = a.results.length > 0 ? a.results[a.results.length - 1].index : a.queue[0];
      settleMortgageAfterAuction(payer, idx, paid);
    }
    if (bankrupt) liquidateMortgages(payer, emit);
    if (emit && a.results.length > 0) {
      const last = a.results[a.results.length - 1];
      state.lastEvent = { kind: 'auctionDone', index: last.index, winner: last.winner, price: last.price };
    }
    return { paid, sold, bankrupt };
  };

  /** 抵押超期成交分账（spec §3.4 链三）：成交款先还该笔本金，不足则余额留在账上继续追偿 */
  const settleMortgageAfterAuction = (payer: Player, index: number, paid: number): void => {
    const k = payer.mortgages.findIndex((m) => m.index === index);
    if (k < 0) return;
    payer.mortgages[k].principal -= paid;
    if (payer.mortgages[k].principal <= 0) payer.mortgages.splice(k, 1);
  };

  /**
   * 破产处置（spec §3.5-D23）：① 债务清零（银行承担损失）② 未赎回抵押地块追加一场
   * `'mortgage-overdue'` 清仓拍卖（起拍价 = 各自借款额），成交款按链三分账（receiver = 银行）。
   */
  const liquidateMortgages = (payer: Player, emit: boolean): void => {
    const pendingLots = payer.mortgages.map((m) => ({ index: m.index, principal: m.principal }));
    payer.loan = null;
    payer.mortgages = [];
    const queue = pendingLots.map((m) => m.index).filter((i) => state.estates[i]?.owner === payer.id);
    if (queue.length === 0) return;
    const price: Record<number, number> = {};
    for (const m of pendingLots) price[m.index] = m.principal;
    const amount = queue.reduce((s, i) => s + (price[i] ?? sellAt(state.estates, i)), 0);
    startAuction(payer, amount, null, 'mortgage-overdue', {
      queue, priceOf: (i) => price[i] ?? sellAt(state.estates, i), sellAll: true, emit,
    });
  };

  /**
   * 开一场拍卖并跑到挂起 / 收尾；挂起时保留 `state.auction` 并返回 `'suspended'`。
   * 队列默认取自有**未抵押**地块（抵押物由链三的超期拍卖单独处置，避免重复拍卖）；`opts.queue` 可显式指定。
   */
  const startAuction = (
    payer: Player, amount: number, receiver: Player | null, trigger: AuctionTrigger = 'bankrupt',
    opts?: { queue?: number[]; priceOf?: (index: number) => number; sellAll?: boolean; emit?: boolean },
  ): DebtResult | 'suspended' => {
    /* 起拍价口径：抵押超期 = 该笔借款额，其余 = 变卖价（spec §3.4） */
    lotPriceOf = opts?.priceOf
      ?? (trigger === 'mortgage-overdue'
        ? (i) => payer.mortgages.find((m) => m.index === i)?.principal ?? sellAt(state.estates, i)
        : (i) => sellAt(state.estates, i));
    const owned = opts?.queue ?? ownedBy(state.estates, payer.id).filter((i) => !creditLocked(state, i));
    /* 升序：变卖价低者先拍（同价取小格号）——保住高价值资产 */
    const queue = owned.slice().sort((x, y) => {
      const d = lotPriceOf(x) - lotPriceOf(y);
      return d !== 0 ? d : x - y;
    });
    /* 无拍品（尽为抵押物）⇒ 走既有自动清算尾段，不产生空拍卖 */
    if (queue.length === 0) return settleDebtAuto(payer, amount, receiver);
    const first = lotOf(state.estates, queue[0]);
    const a: PendingAuction = {
      trigger,
      payerId: payer.id,
      creditorId: receiver ? receiver.id : null,
      amount,
      queue,
      lot: first ?? { index: queue[0], level: 1, startPrice: lotPriceOf(queue[0]) },
      bids: [],
      pending: [],
      results: [],
      ...(opts?.sellAll ? { sellAll: true } : {}),
    };
    lotOpen = false;
    state.auction = a;
    if (advancePump(a)) return 'suspended';
    return finishAuction(a, opts?.emit ?? false);
  };

  /**
   * 欠款清算（spec §3.5-D9）：① 现金足额直接付 ② 存款自动全额取出 ③ 有**未抵押**地产 → 拍卖
   * ④ 折股 ⑤ 破产（`settleDebtAuto` 尾段）。存款取出仍不免死：不足照样进入后续环节。
   */
  const settleDebt = (payer: Player, amount: number, receiver: Player | null): DebtResult | 'suspended' => {
    if (payer.cash < amount && payer.deposit > 0) {
      payer.cash += payer.deposit;
      payer.deposit = 0;
    }
    const sellable = ownedBy(state.estates, payer.id).filter((i) => !creditLocked(state, i));
    if (payer.cash < amount && sellable.length > 0) {
      return startAuction(payer, amount, receiver);
    }
    return settleDebtAuto(payer, amount, receiver);
  };

  /** 旧「自动贱卖」清算（供无地路径与多人分账路径复用；M20.1-D6 保持既有行为） */
  const settleDebtAuto = (payer: Player, amount: number, receiver: Player | null): DebtResult => {
    const sold: number[] = [];
    while (payer.cash < amount) {
      /* 抵押中地块不动（spec §3.5）：由链三的超期拍卖处置，避免被贱卖 */
      const owned = ownedBy(state.estates, payer.id).filter((i) => !creditLocked(state, i));
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
    /* 破产判定同 `closeDebt`：抵押中地块不算自救资产；破产即清债务并处置抵押物（spec §3.5-D23） */
    const bankrupt = !affordable
      && !ownedBy(state.estates, payer.id).some((i) => !creditLocked(state, i))
      && Object.keys(state.portfolios[payer.id - 1]).length === 0;
    if (bankrupt) {
      payer.bankrupt = true;
      liquidateMortgages(payer, false);
    }
    return { paid, sold, bankrupt };
  };

  /** 挂起时对外呈现的结算结果（供 `settleCurrent` 包装） */
  const auctionSettle = (index: number): SettleResult => {
    const a = state.auction;
    return a
      ? { kind: 'auction', index, payer: a.payerId, creditor: a.creditorId, amount: a.amount, remaining: a.pending.length }
      : { kind: 'start', index };
  };

  /** 该玩家是否存在逾期中的债务（信用贷款或任一笔抵押；spec §3.4 链一） */
  const hasOverdueDebt = (p: Player): boolean =>
    (p.loan?.overdue ?? 0) > 0 || p.mortgages.some((m) => m.overdue > 0);

  /** 把一笔金额按「信用贷款 → 抵押（index 升序）」顺序冲减本金；本金归零即移除（抵押地块随之解锁） */
  const applyToPrincipal = (p: Player, amount: number): void => {
    let left = amount;
    if (p.loan && left > 0) {
      const pay = Math.min(left, p.loan.principal);
      p.loan.principal -= pay;
      left -= pay;
      if (p.loan.principal <= 0) p.loan = null;
    }
    for (let k = 0; k < p.mortgages.length && left > 0; k++) {
      const m = p.mortgages[k];
      const pay = Math.min(left, m.principal);
      m.principal -= pay;
      left -= pay;
      if (m.principal <= 0) { p.mortgages.splice(k, 1); k -= 1; }
    }
  };

  /**
   * 逾期罚息（spec §3.4 链一）：付款人逾期时额外付 `rent × 50%`，直冲欠款本金、不给地主。
   * 返回实际计入本金的金额与是否因清算挂起。
   */
  const chargeOverduePenalty = (p: Player, rent: number): { penalty: number; suspended: boolean } => {
    if (p.bankrupt || !hasOverdueDebt(p)) return { penalty: 0, suspended: false };
    const penalty = penaltyOf(rent);
    if (penalty <= 0) return { penalty: 0, suspended: false };
    const d = settleDebt(p, penalty, null);
    if (d === 'suspended') return { penalty, suspended: true };
    applyToPrincipal(p, d.paid);
    return { penalty, suspended: false };
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
        /* 技能「慈悲为怀」：应付租金按比例减免（未启用 → 比例 0，逐值回旧口径） */
        const relief = rentReliefOf(state, p.id);
        const gross = doubled ? base * 2 : base;
        const rent = relief > 0 ? Math.round(gross * (1 - relief)) : gross;
        const i = p.id - 1;
        if (has(state.hands[i], 'pardon')) {
          consumeCard(state.hands[i], 'pardon');
          result = { kind: 'rent', index, owner: e.owner, rent, paid: 0, sold: [], bankrupt: false, waived: true };
        } else {
          const debt = settleDebt(p, rent, owner);
          if (doubled && owner && base > 0) state.doubleRent[owner.id - 1] = false;
          if (debt === 'suspended' || state.auction) {
            result = auctionSettle(index);
          } else {
            /* 逾期罚息：额外 50% 直冲欠款本金（不给地主；spec §3.4 链一） */
            const pen = chargeOverduePenalty(p, rent);
            result = pen.suspended || state.auction
              ? auctionSettle(index)
              : {
                kind: 'rent', index, owner: e.owner, rent, paid: debt.paid, sold: debt.sold,
                bankrupt: debt.bankrupt, ...(pen.penalty > 0 ? { penalty: pen.penalty } : {}),
              };
          }
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
    } else if (specialAt(index) === 'bank') {
      result = resolveBank(p, index);
    } else if (specialAt(index) === 'lottery') {
      result = resolveLottery(p, index);
    } else if (specialAt(index) === 'tax') {
      const r = resolveTax(p, index);
      result = r === 'suspended' ? auctionSettle(index) : r;
    } else if (specialAt(index) === 'hospital') {
      result = resolveHospital(p, index);
    } else if (typeAt(index) === 'fate') {
      const r = resolveFate(p, index);
      result = r === 'suspended' ? auctionSettle(index) : r;
    } else if (typeAt(index) === 'chance') {
      result = resolveChance(p, index);
    } else {
      result = { kind: 'start', index };
    }
    state.phase = 'settled';
    if (result.kind === 'auction') state.lastEvent = result;
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
        e.level = (e.level + 1) as 2 | 3 | 4 | 5;
      }
    }
    const result: BonusSettle = { kind: 'bonus', index, reward };
    state.lastEvent = result;
    return result;
  };

  /**
   * 鹿乡银行（spec §3.7）：领「存款红包」= round(deposit × 5%) 一次性入现金。
   * 首轮免息随 `takeLoan()` 一并置位（本回合办理的贷款 ⇒ 轮末跳过 1 次计息），此处不再重复置位。
   */
  const resolveBank = (p: Player, index: number): BankSettle => {
    const bonus = Math.round(p.deposit * BANK_DEPOSIT_BONUS);
    p.cash += bonus;
    const result: BankSettle = { kind: 'bank', index, bonus };
    state.lastEvent = result;
    return result;
  };

  /** 乐透彩：先扣入场费（现金不足按现有现金扣，不会因此破产），再按权重开奖 */
  const resolveLottery = (p: Player, index: number): LotterySettle => {
    const stake = Math.min(p.cash, LOTTERY_STAKE);
    p.cash -= stake;
    /* M20.4 / F-D4：入场费计入乐透现金流，供轮末分红（不额外改现金） */
    state.facilityCashflow.lottery += stake;
    const prize = rollLottery(cardRng);
    p.cash += prize;
    const result: LotterySettle = { kind: 'lottery', index, stake, prize };
    state.lastEvent = result;
    return result;
  };

  /** 税务局：按现金征收（10%，封顶 ￥500），走欠款清算（先拍卖、再折股、付不起则破产） */
  const resolveTax = (p: Player, index: number): TaxSettle | 'suspended' => {
    const amount = Math.min(Math.round(p.cash * TAX_RATE), TAX_CAP);
    const debt = settleDebt(p, amount, null);
    if (debt === 'suspended') return 'suspended';
    const result: TaxSettle = { kind: 'tax', index, amount, paid: debt.paid, sold: debt.sold, bankrupt: debt.bankrupt };
    state.lastEvent = result;
    return result;
  };

  /** 医院：住院 1 回合（复用禁行计时 `state.jail`，免罚卡可抵消） */
  const resolveHospital = (p: Player, index: number): HospitalSettle => {
    const i = p.id - 1;
    if (has(state.hands[i], 'pardon')) {
      consumeCard(state.hands[i], 'pardon');
      const result: HospitalSettle = { kind: 'hospital', index, turns: 0, waived: true };
      state.lastEvent = result;
      return result;
    }
    state.jail[i] = HOSPITAL_TURNS;
    const result: HospitalSettle = { kind: 'hospital', index, turns: HOSPITAL_TURNS, waived: false };
    state.lastEvent = result;
    return result;
  };

  const resolveFate = (p: Player, index: number): FateSettle | 'suspended' => {
    const i = p.id - 1;
    const card = drawFrom('fate') as FateCardDef;
    let effect: FateEffect;
    switch (card.kind) {
      case 'fine':
      case 'tax': {
        const amount = card.amount ?? 0;
        const debt = settleDebt(p, amount, null);
        if (debt === 'suspended') return 'suspended';
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
      case 'advance': {
        /* 前进 N 格（与掷骰同一套回绕 / 过起点津贴口径；落格不再二次结算，同 `back`） */
        const steps = card.steps ?? 0;
        const mv = advance(p.pos, steps);
        p.pos = mv.to;
        if (mv.passedStart) p.cash += PASS_START_BONUS + (skill(p.id)?.passStartBonus ?? 0);
        effect = { kind: 'advance', from: mv.from, to: mv.to, steps: mv.steps };
        break;
      }
      case 'toStart': {
        const from = p.pos;
        p.pos = 0;
        p.cash += PASS_START_BONUS + (skill(p.id)?.passStartBonus ?? 0);
        effect = { kind: 'toStart', from };
        break;
      }
      case 'gift':
        p.cash += card.amount ?? 0;
        effect = { kind: 'gift', amount: card.amount ?? 0 };
        break;
      case 'levy': {
        /* 按净资产（现金 + 地产账面投入）缴税：资产越大缴得越多，压制「囤地躺赢」 */
        const percent = card.percent ?? 0;
        const amount = Math.round(netWorth(state, p) * percent / 100);
        const debt = settleDebt(p, amount, null);
        if (debt === 'suspended') return 'suspended';
        effect = { kind: 'levy', amount, percent, paid: debt.paid, bankrupt: debt.bankrupt };
        break;
      }
      case 'repair': {
        /* 按「地块级数总和」计费：楼越高维护越贵 */
        const amount = card.amount ?? 0;
        let count = 0;
        for (const idx of ownedBy(state.estates, p.id)) count += state.estates[idx].level;
        const total = amount * count;
        const debt = settleDebt(p, total, null);
        if (debt === 'suspended') return 'suspended';
        effect = { kind: 'repair', amount, count, paid: debt.paid, bankrupt: debt.bankrupt };
        break;
      }
      case 'demote': {
        /* 自有最高级地块降 1 级（L1 不参与，避免直接炸回无主） */
        const owned = ownedBy(state.estates, p.id).filter((idx) => state.estates[idx].level > 1);
        if (owned.length === 0) {
          effect = { kind: 'demote', index: null, level: 0 };
        } else {
          const pick = owned[Math.floor(cardRng() * owned.length)];
          const e = state.estates[pick];
          e.level = (e.level - 1) as 1 | 2 | 3 | 4;
          effect = { kind: 'demote', index: pick, level: e.level };
        }
        break;
      }
      case 'tribute': {
        /* 多人分账（M20.1-D6）：保持既有自动变卖，本轮不改走拍卖 */
        const amount = card.amount ?? 0;
        const others = state.players.filter((o) => o.id !== p.id && !o.bankrupt);
        let paid = 0;
        let bankrupt = false;
        for (const o of others) {
          const debt = settleDebtAuto(p, amount, o);
          paid += debt.paid;
          if (debt.bankrupt) bankrupt = true;
        }
        effect = { kind: 'tribute', amount, total: amount * others.length, paid, bankrupt };
        break;
      }
      case 'harvest': {
        const amount = card.amount ?? 0;
        const others = state.players.filter((o) => o.id !== p.id && !o.bankrupt);
        let total = 0;
        for (const o of others) total += settleDebtAuto(o, amount, p).paid;
        effect = { kind: 'harvest', amount, total };
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
          e.level = (e.level + 1) as 2 | 3 | 4 | 5;
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
      case 'grantItem': {
        /* 指定道具（卡面写死，不随机）；已持有同类 → 折现（与 drawItem 同口径） */
        const item = card.item ?? ITEM_CARDS[Math.floor(cardRng() * ITEM_CARDS.length)].kind;
        if (grant(state.hands[i], item)) {
          effect = { kind: 'grantItem', item, refund: 0 };
        } else {
          p.cash += PARDON_REFUND;
          effect = { kind: 'grantItem', item: null, refund: PARDON_REFUND };
        }
        break;
      }
      case 'advance': {
        const steps = card.steps ?? 0;
        const mv = advance(p.pos, steps);
        p.pos = mv.to;
        if (mv.passedStart) p.cash += PASS_START_BONUS + (skill(p.id)?.passStartBonus ?? 0);
        effect = { kind: 'advance', from: mv.from, to: mv.to, steps: mv.steps };
        break;
      }
      case 'toStart': {
        const from = p.pos;
        p.pos = 0;
        p.cash += PASS_START_BONUS + (skill(p.id)?.passStartBonus ?? 0);
        effect = { kind: 'toStart', from };
        break;
      }
      case 'collect': {
        const amount = card.amount ?? 0;
        const others = state.players.filter((o) => o.id !== p.id && !o.bankrupt);
        let total = 0;
        for (const o of others) total += settleDebtAuto(o, amount, p).paid;
        effect = { kind: 'collect', amount, total };
        break;
      }
      default: {
        const code = STOCKS[Math.floor(cardRng() * STOCKS.length)].code;
        state.stockForce[i] = { code, dir: 1 };      // 内幕消息 = 必涨（语义与 M20.3-B 前一致）
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
    const out = buy(state.estates, p.pos, p.id, p.cash, buyDiscountOf(state, p.id));
    if (out.ok) p.cash = out.cash;
    return out;
  };

  const upgradeCurrent = (): GameUpgradeOutcome => {
    if (state.phase !== 'settled') return { ok: false, reason: 'bad-phase' };
    const p = currentPlayer(state);
    if (creditLocked(state, p.pos)) return { ok: false, reason: 'mortgaged' };
    const out = upgrade(state.estates, p.pos, p.id, p.cash);
    if (out.ok) p.cash = out.cash;
    return out;
  };

  const useCard = (kind: ItemCardKind, target?: number, stock?: StockPlay): CardOutcome => {
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
      case 'demolish': {
        if (target === undefined) return { ok: false, reason: 'no-target' };
        const out = demolishDown(state.estates, target, p.id);
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
      /* —— M20.3-B 股票轨两张卡（spec §5.5）：都不推进回合 —— */
      case 'bullBear': {
        if (!stock) return { ok: false, reason: 'no-target' };
        if (!STOCKS.some((d) => d.code === stock.code)) return { ok: false, reason: 'unknown-code' };
        state.stockForce[i] = { code: stock.code, dir: stock.dir === 'up' ? 1 : -1 };
        consumeCard(state.hands[i], kind);
        state.lastEvent = { kind: 'card', card: kind, target: null };
        return { ok: true, kind };
      }
      case 'dividend': {
        const shares = Object.values(state.portfolios[i]).reduce((n, h) => n + h.shares, 0);
        p.cash += shares > 0 ? shares * DIVIDEND_PER_SHARE : DIVIDEND_REFUND;
        consumeCard(state.hands[i], kind);
        state.lastEvent = { kind: 'card', card: kind, target: null };
        return { ok: true, kind };
      }
      default: {
        state.doubleRent[i] = true;
        consumeCard(state.hands[i], kind);
        state.lastEvent = { kind: 'card', card: kind, target: null };
        return { ok: true, kind };
      }
    }
  };

  const trade = (code: string, shares: number, leverage = 1): TradeOutcome => {
    const p = currentPlayer(state);
    if (p.pos !== STOCK_TILE_INDEX) return { ok: false, reason: 'not-at-market' };
    if (shares === 0 || !Number.isInteger(shares)) return { ok: false, reason: 'bad-lot' };
    const i = p.id - 1;

    /* —— 买入 —— */
    if (shares > 0) {
      /* 杠杆买入（spec §5.2）：自有资金 = ⌈成本 / 倍数⌉，差额由保证金账户借入 */
      if (leverage > 1) {
        if (!(LEVERAGES as readonly number[]).includes(leverage)) return { ok: false, reason: 'bad-lot' };
        const price = state.quotes[code];
        if (price === undefined) return { ok: false, reason: 'unknown-code' };
        const cost = price * shares;
        const own = Math.ceil(cost / leverage);
        const borrowed = cost - own;
        if (p.cash < own) return { ok: false, reason: 'not-enough-cash' };
        p.cash -= own;
        const pf = state.portfolios[i];
        const h = pf[code] ?? { code, shares: 0, cost: 0 };
        h.shares += shares;
        h.cost += own;                       // 成本只计自有资金（借入不计，便于展示真实盈亏）
        pf[code] = h;
        p.margin = p.margin
          ? { ...p.margin, principal: p.margin.principal + borrowed }
          : { principal: borrowed, rate: MARGIN_RATE };
        /* M20.4 / F-D4：交易所现金流挂载点（当前费率为 0 ⇒ 恒 0，零余额回归） */
        state.facilityCashflow.exchange += Math.round(cost * STOCK_FEE_RATIO);
        state.lastEvent = { kind: 'trade', code, shares };
        return { ok: true, code, shares, price, cost: own, cash: p.cash };
      }
      /* 无杠杆（逐字节沿用既有路径，零回归） */
      const out = buyShares(state.portfolios[i], state.quotes, code, shares, p.cash);
      if (out.ok) {
        p.cash = out.cash;
        /* M20.4 / F-D4：交易所现金流挂载点（费率 0 ⇒ 恒 0） */
        state.facilityCashflow.exchange += Math.round(out.cost * STOCK_FEE_RATIO);
        state.lastEvent = { kind: 'trade', code, shares };
      }
      return out;
    }

    /* —— 卖出（spec §5.2）：有保证金负债时，卖出所得**先冲抵借入**，余额才入现金 —— */
    const base = sellShares(state.portfolios[i], state.quotes, code, -shares, p.cash);
    if (!base.ok) return base;
    const proceeds = base.cost;              // `sellShares` 复用 `cost` 字段承载卖出所得
    let cash = p.cash + proceeds;
    if (p.margin) {
      const rest = p.margin.principal - proceeds;
      if (rest > 0) {
        p.margin = { ...p.margin, principal: rest };
        cash = p.cash;                       // 全部用于还债，现金不变
      } else {
        p.margin = null;
        cash = p.cash - rest;                // 还清后余额入现金
      }
    }
    p.cash = cash;
    /* M20.4 / F-D4：交易所现金流挂载点（费率 0 ⇒ 恒 0） */
    state.facilityCashflow.exchange += Math.round(proceeds * STOCK_FEE_RATIO);
    state.lastEvent = { kind: 'trade', code, shares };
    return { ...base, cash };
  };

  /**
   * 爆仓强平（M20.3-B spec §5.3）：清空该玩家股票账户 → 先还保证金借入 →
   * 还有余额则返还现金 → 不足则余债转入信用贷款（不动现金 / 存款，B-D3）。
   */
  const liquidate = (p: Player): void => {
    if (!p.margin) return;
    const proceeds = marketValue(state.portfolios[p.id - 1], state.quotes);
    state.portfolios[p.id - 1] = {};
    const rest = p.margin.principal - proceeds;
    p.margin = null;
    if (rest > 0) {
      p.loan = p.loan
        ? { ...p.loan, principal: p.loan.principal + rest }
        : { principal: rest, rate: LOAN_RATE, due: state.round + LOAN_TERM, overdue: 0, freeFirstRound: false };
    } else {
      p.cash += -rest;
    }
    state.lastEvent = { kind: 'marginCall', player: p.id, debt: Math.max(0, rest), refund: Math.max(0, -rest) };
  };

  /** 自由出售（spec §3.5）：价 = 变卖价 100%，只作用于当前玩家；售出地块删键回归「可购买」 */
  const sellEstate = (index: number): SellOutcome => {
    const p = currentPlayer(state);
    const e = state.estates[index];
    if (!e) return { ok: false, reason: 'no-estate' };
    if (e.owner !== p.id) return { ok: false, reason: 'not-owner' };
    if (creditLocked(state, index)) return { ok: false, reason: 'mortgaged' };
    const price = sellAt(state.estates, index);
    releaseEstate(state.estates, index);
    p.cash += price;
    state.lastEvent = { kind: 'sell', index, price };
    return { ok: true, index, price, cash: p.cash };
  };

  /* —— M20.2 银行信贷六 API（spec §3.2 / §3.4）—— */

  /** 存款：现金 → 存款 */
  const deposit = (amount: number): BankOutcome => {
    const p = currentPlayer(state);
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'bad-amount' };
    if (p.cash < amount) return { ok: false, reason: 'not-enough-cash' };
    p.cash -= amount;
    p.deposit += amount;
    return { ok: true, amount };
  };

  /** 取款：存款 → 现金 */
  const withdraw = (amount: number): BankOutcome => {
    const p = currentPlayer(state);
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'bad-amount' };
    if (p.deposit < amount) return { ok: false, reason: 'not-enough-deposit' };
    p.deposit -= amount;
    p.cash += amount;
    return { ok: true, amount };
  };

  /** 信用贷款：须站 9 号格 + 无未结清贷款 + 额度 > 0；首轮免息（spec §3.7） */
  const takeLoan = (): BankOutcome => {
    const p = currentPlayer(state);
    if (p.pos !== BANK_TILE_INDEX) return { ok: false, reason: 'not-at-bank' };
    if (p.loan) return { ok: false, reason: 'has-loan' };
    const limit = loanLimitOf(netWorth(state, p));
    if (limit <= 0) return { ok: false, reason: 'no-limit' };
    p.cash += limit;
    p.loan = { principal: limit, rate: LOAN_RATE, due: state.round + LOAN_TERM, overdue: 0, freeFirstRound: true };
    return { ok: true, amount: limit };
  };

  /** 还款：不传 amount → 用可用现金全额还；本金归零即结清 */
  const repayLoan = (amount?: number): BankOutcome => {
    const p = currentPlayer(state);
    const l = p.loan;
    if (!l) return { ok: false, reason: 'no-debt' };
    const amt = amount === undefined ? Math.min(p.cash, l.principal) : amount;
    if (!Number.isInteger(amt) || amt <= 0) return { ok: false, reason: 'bad-amount' };
    const pay = Math.min(amt, p.cash, l.principal);
    if (pay <= 0) return { ok: false, reason: 'not-enough-cash' };
    p.cash -= pay;
    l.principal -= pay;
    if (l.principal <= 0) p.loan = null;
    return { ok: true, amount: pay };
  };

  /** 抵押贷款：须站 9 号格 + 自有 + 未抵押 + 未施工；借款额 = 变卖价 × 80% */
  const takeMortgage = (index: number): BankOutcome => {
    const p = currentPlayer(state);
    if (p.pos !== BANK_TILE_INDEX) return { ok: false, reason: 'not-at-bank' };
    const e = state.estates[index];
    if (!e) return { ok: false, reason: 'no-estate' };
    if (e.owner !== p.id) return { ok: false, reason: 'not-owner' };
    if (e.processing) return { ok: false, reason: 'processing' };
    if (creditLocked(state, index)) return { ok: false, reason: 'mortgaged' };
    const amount = mortgageLimitOf(state.estates, index);
    if (amount <= 0) return { ok: false, reason: 'no-limit' };
    p.cash += amount;
    p.mortgages.push({ principal: amount, rate: MORTGAGE_RATE, due: state.round + MORTGAGE_TERM, overdue: 0, index });
    p.mortgages.sort((a, b) => a.index - b.index);
    return { ok: true, amount };
  };

  /** 赎回抵押：付清该笔本金，解锁地块 */
  const redeemMortgage = (index: number): BankOutcome => {
    const p = currentPlayer(state);
    const k = p.mortgages.findIndex((m) => m.index === index);
    if (k < 0) return { ok: false, reason: 'no-mortgage' };
    const cost = p.mortgages[k].principal;
    if (p.cash < cost) return { ok: false, reason: 'not-enough-cash' };
    p.cash -= cost;
    p.mortgages.splice(k, 1);
    return { ok: true, amount: cost };
  };

  /** 拍卖出价：给 `pending` 队首；收齐即落槌并继续（可能新开一块继续挂起） */
  const bidAuction = (amount: number): BidOutcome => {
    const a = state.auction;
    if (!a || a.pending.length === 0) return { ok: false, reason: 'no-auction' };
    if (!Number.isInteger(amount) || amount < 0) return { ok: false, reason: 'bad-amount' };
    const bidder = a.pending[0];
    a.pending.shift();
    a.bids.push({ bidder, amount });
    if (a.pending.length > 0) return { ok: true, amount };
    if (advancePump(a)) return { ok: true, amount };
    finishAuction(a, true);
    resumeAdvance();
    return { ok: true, amount };
  };

  /** 把所有待出价真人按 AI 同源策略补全并收尾（`sim()` / e2e / 取证用） */
  const autoResolveAuction = (): void => {
    while (state.auction) {
      const a = state.auction;
      for (const id of a.pending) {
        const player = playerById(state, id);
        a.bids.push({ bidder: id, amount: player ? aiBidFor(player.cash, a.lot, aiParamsOf(id)) : 0 });
      }
      a.pending = [];
      if (advancePump(a)) continue;   // 新开一块又有真人 ⇒ 再补全
      finishAuction(a, true);
    }
    resumeAdvance();
  };

  /**
   * 轮末统一计息（spec §3.3）：① 存款复利 ② 信用贷款复利（首轮免息跳 1 次后清标记）
   * ③ 逐笔抵押复利 ④ 逾期推进。破产者跳过、零随机。必须在股价 tick 之前执行。
   */
  const settleBooks = (): void => {
    for (const p of state.players) {
      if (p.bankrupt) continue;
      if (p.deposit > 0) p.deposit = Math.round(p.deposit * (1 + DEPOSIT_RATE));
      if (p.loan) {
        if (p.loan.freeFirstRound) p.loan.freeFirstRound = false;
        else {
          /* M20.4 / F-D4：银行现金流 = 轮末贷款利息（仅资本化记账，不动现金） */
          state.facilityCashflow.bank += interestOf(p.loan);
          p.loan.principal = Math.round(p.loan.principal * (1 + p.loan.rate));
        }
        p.loan.overdue = overdueOf(p.loan, state.round);
      }
      for (const m of p.mortgages) {
        /* M20.4 / F-D4：抵押利息同样计入银行现金流 */
        state.facilityCashflow.bank += interestOf(m);
        m.principal = Math.round(m.principal * (1 + m.rate));
        m.overdue = overdueOf(m, state.round);
      }
    }
  };

  /**
   * 轮末违约链（spec §3.4 链二 / 链三）：先信用强执（逾期满 3 轮，拍未抵押地产），
   * 后抵押超期（拍抵押物、起拍价 = 借款额）。任一挂起即打住，其余顺延到下一个轮末（已知限制）。
   */
  const runOverdueChains = (): void => {
    for (const p of state.players) {
      if (state.auction || p.bankrupt || !p.loan) continue;
      if (p.loan.overdue >= OVERDUE_SEIZE_ROUNDS) startAuction(p, p.loan.principal, null, 'loan-overdue');
    }
    for (const p of state.players) {
      if (p.bankrupt) continue;
      for (const m of p.mortgages.slice()) {
        if (state.auction) break;
        if (state.round > m.due) startAuction(p, m.principal, null, 'mortgage-overdue', { queue: [m.index] });
      }
    }
  };

  /**
   * M20.4 设施分红结算（spec §5.4 第 ⑤ 步 / F-D3）：
   * 逐处设施按「基础 5% + 本轮现金流 × 持股比例」× **当期新闻系数** 分红，
   * 只加现金、不改持股；结算后把该处现金流清零（下一轮从 0 起算）。
   * 未售出的设施（无人持股）整链恒为 0 ⇒ 零余额回归。
   */
  const payFacilityDividends = (): void => {
    for (const def of FACILITIES) {
      const coef = newsCoefOf(state.news, def.id);
      const cashflow = state.facilityCashflow[def.id];
      for (const p of state.players) {
        if (p.bankrupt) continue;
        const shares = p.facilities[def.id] ?? 0;
        if (shares <= 0) continue;
        p.cash += dividendOf(def, shares, cashflow, coef);
      }
      state.facilityCashflow[def.id] = 0;
    }
  };

  /**
   * 轮末统一收口（M20.4 spec §5.4，顺序固定、全确定性，7 步）：
   * ① 存款 / 信用贷款 / 抵押计息（同时累计银行现金流）→ ② 保证金借入复利
   * → ③ 股价 tick（玩家强制方向 + 当期新闻方向，命中不消耗随机源）
   * → ④ 爆仓判定（强平）→ ⑤ 设施分红（用当期新闻系数）→ ⑥ 抽下一条新闻 → ⑦ 清空强制方向表。
   */
  const onRoundBoundary = (): void => {
    settleBooks();
    for (const p of state.players) {
      if (p.bankrupt || !p.margin) continue;
      p.margin.principal = Math.round(p.margin.principal * (1 + MARGIN_RATE));
    }
    const force = state.stockForce.filter((f): f is StockForce => f !== null);
    const nf = newsForceOf(state.news);
    if (nf) force.push(nf);
    state.quotes = market.tick(force);
    state.priceHistory = market.history();
    for (const p of state.players) {
      if (p.bankrupt || !p.margin) continue;
      const value = marketValue(state.portfolios[p.id - 1], state.quotes);
      if (value < p.margin.principal * LIQUIDATION_RATIO) liquidate(p);
    }
    payFacilityDividends();
    state.news = rollNews(newsRng);
    state.stockForce = state.stockForce.map(() => null);
  };

  /** 轮末拍卖挂起时暂存的「未提交的换手目标」（spec §3.4：挂起期间不得推进玩家） */
  let pendingAdvance: number | null = null;

  /** 无条件提交换手（轮末 tick 与其后的违约链已跑完 / 未触发） */
  const commitAdvance = (next: number): void => {
    state.current = next;
    state.phase = 'idle';
    state.dice = null;
    state.extraRoll = false;
    /* 新玩家回合开始：解除其地块的「施工中」（BUILD_TURNS = 1 的落地处，spec §5.2） */
    clearProcessing(state.estates, state.players[next].id);
    if (activeCount(state) <= 1 || state.round > ROUND_LIMIT) state.over = true;
  };

  /** 下一位未破产玩家下标；跨过 0 时标记 `crossed`（轮号由调用方推进，便于挂起时回退语义） */
  const nextActiveFrom = (from: number): { next: number; crossed: boolean } => {
    const n = state.players.length;
    let next = from;
    let crossed = false;
    for (let k = 0; k < n; k++) {
      next = (next + 1) % n;
      if (next === 0) crossed = true;
      if (!state.players[next].bankrupt) break;
    }
    return { next, crossed };
  };

  /** 拍卖彻底收尾后恢复换手（轮末违约链挂起过的场合） */
  const resumeAdvance = (): void => {
    if (pendingAdvance === null || state.auction) return;
    const next = pendingAdvance;
    pendingAdvance = null;
    commitAdvance(next);
  };

  /** 交下一位未破产玩家（endTurn 与 skipTurn 共用；唯一换手处） */
  const advanceToNext = (): void => {
    const { next, crossed } = nextActiveFrom(state.current);
    if (crossed) {
      state.round += 1;
      onRoundBoundary();
      runOverdueChains();
      /* 轮末拍卖挂起 ⇒ 不换手，等 `resumeAdvance`（spec §3.4） */
      if (state.auction) { pendingAdvance = next; return; }
    }
    commitAdvance(next);
  };

  const endTurn = (): void => {
    if (state.auction) return;             // 待真人出价期间禁止结束回合（spec §3.4）
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

  /* —— M20.3 道具商店两 API（spec §5.3）——
     与 M20.2 银行六 API 同构：只改当前玩家现金与手牌，**不推进回合、不进 AiStep 分发**。
     手牌模型是「每种至多 1 张」（`grant` 去重），故「已持有」即「再买会重复」，
     且未持有时必然有空槽（`hand.length < HAND_SIZE`），无需单独的手牌已满分支。 */

  /** 买入：扣售价 → 入手牌；失败 `unknown-kind` / `already-owned` / `not-enough-cash` */
  const buyItem = (kind: string): ItemShopOutcome => {
    const price = priceOf(kind);
    if (price === undefined) return { ok: false, reason: 'unknown-kind' };
    const card = kind as ItemCardKind;
    const p = currentPlayer(state);
    const hand = state.hands[p.id - 1];
    if (has(hand, card)) return { ok: false, reason: 'already-owned' };
    if (p.cash < price) return { ok: false, reason: 'not-enough-cash' };
    p.cash -= price;
    grant(hand, card);
    state.lastEvent = { kind: 'item-shop', action: 'buy', card, price };
    return { ok: true, kind: card, price };
  };

  /** 卖出：移出手牌 → 加回收价（售价 × 50%）；失败 `unknown-kind` / `not-owned`。
      结果里的 `price` 是**实收回收价**（与买入时的售价口径分列，便于 UI 直接显示）。 */
  const sellItem = (kind: string): ItemShopOutcome => {
    const price = priceOf(kind);
    if (price === undefined) return { ok: false, reason: 'unknown-kind' };
    const card = kind as ItemCardKind;
    const p = currentPlayer(state);
    const hand = state.hands[p.id - 1];
    if (!consumeCard(hand, card)) return { ok: false, reason: 'not-owned' };
    const resale = resaleOf(price);
    p.cash += resale;
    state.lastEvent = { kind: 'item-shop', action: 'sell', card, price: resale };
    return { ok: true, kind: card, price: resale };
  };

  /* —— M20.4 设施认购 API（spec §5.3）——
     与 M20.2 银行六 API / M20.3 商店两 API 同构：只改当前玩家现金与持股，
     **不推进回合、不进 AiStep 分发**；校验复用纯函数 `canSubscribe`（先到先得）。 */

  /** 认购设施股：`shares` 股、每处至多 20 股；失败 `unknown-facility` / `bad-shares` / `sold-out` / `not-enough-cash` */
  const buyFacility = (facility: FacilityId, shares: number): FacilityOutcome => {
    const p = currentPlayer(state);
    const check = canSubscribe(state.players, facility, shares, p.cash);
    /* `canSubscribe` 的失败分支必然带 `reason`（契约见 core/facility.ts），此处断言收窄 */
    if (!check.ok) return { ok: false, reason: check.reason as FacilityFail };
    p.cash -= check.cost;
    p.facilities[facility] = (p.facilities[facility] ?? 0) + shares;
    state.lastEvent = { kind: 'facility', facility, shares, cost: check.cost };
    return { ok: true, facility, shares, cost: check.cost, cash: p.cash };
  };

  const clearEvent = (): void => {
    state.lastDraw = null;
    state.lastEvent = null;
  };

  return {
    state, rollDice, moveCurrent, settleCurrent, buyCurrent, upgradeCurrent, endTurn,
    useCard, trade, skipTurn, clearEvent, sellEstate, bidAuction, autoResolveAuction,
    deposit, withdraw, takeLoan, repayLoan, takeMortgage, redeemMortgage,
    buyItem, sellItem, buyFacility,
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

/** 该地块是否被任一玩家的抵押贷款锁定（抵押期间锁出售 / 锁升级，仍可收租；spec §3.4） */
export function creditLocked(state: GameState, index: number): boolean {
  return state.players.some((p) => p.mortgages.some((m) => m.index === index));
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

/** 变卖 / 破产后地块回归无主：删键（`Estates` 用「有无键」表达有无主，不写 0 值占位） */
function releaseEstate(estates: Estates, index: number): void {
  delete (estates as Record<number, Estate | undefined>)[index];
}

/** 自动完成一位玩家的整回合（HUD 的「自动」按钮与 e2e 用）：掷 → 走 → 结算 → 自动决策 → 结束 */
export function autoTurn(g: Game): void {
  if (g.state.over) return;
  const s = g.state;
  /* 轮末违约链挂起的拍卖：先补全收尾（收尾后会自动补上被暂存的换手） */
  if (s.auction) { g.autoResolveAuction(); return; }
  /* 监狱禁行：本回合唯一推进 = skipTurn */
  if (s.phase === 'idle' && s.jail[s.current] > 0) {
    g.skipTurn();
    return;
  }
  g.rollDice();
  g.moveCurrent();
  const r = g.settleCurrent();
  if (g.state.auction) g.autoResolveAuction();
  const p = currentPlayer(g.state);
  const discount = buyDiscountOf(g.state, p.id);
  const cost = discounted(buyPrice(1), discount);
  if (r.kind === 'vacant' && canBuy(g.state.estates, r.index, p.cash, discount) && p.cash - cost >= AUTO_RESERVE) {
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
    if (g.state.auction) g.autoResolveAuction();
    if (g.state.phase === 'settled') g.endTurn();
  }
  let guard = maxTurns;
  while (!g.state.over && guard > 0) {
    autoTurn(g);
    guard -= 1;
  }
  return winnerOf(g.state) ?? 0;
}