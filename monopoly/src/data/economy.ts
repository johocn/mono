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
/** 建筑最高层级（M7 起 3 → 5：对齐《大富翁 5》并做超越） */
export const MAX_LEVEL = 5;
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

/** 下一层级（5 级封顶） */
export function nextLevel(level: number): number {
  return Math.min(level + 1, MAX_LEVEL);
}

/** 只有已成楼（≥1 级）且未封顶才可升级 */
export function canUpgrade(level: number): boolean {
  return level >= 1 && level < MAX_LEVEL;
}

/** 变卖价：累计建造价 × SELL_RATIO（L1 ￥30 / L2 ￥120 / L3 ￥330 / L4 ￥760 / L5 ￥1560） */
export function sellValue(level: number): number {
  let invested = 0;
  for (let l = 1; l <= Math.min(level, MAX_LEVEL); l++) invested += buyPrice(l);
  return Math.floor(invested * SELL_RATIO);
}

/** 拍卖 AI 估值：以该级租金 × 此倍率为「愿意付的上限」基线（M20.1，spec §3.1） */
export const BID_RENT_MULT = 6;

/* —— M20.5 景气度与查税（spec §3 D42/D43）—— */
/** 景气度初始值 */
export const ECON_INDEX_START = 1.0;
/** 景气度下限 / 上限（租金系数不会被压成 0 或翻倍失控） */
export const ECON_INDEX_MIN = 0.7;
export const ECON_INDEX_MAX = 1.3;
/** 轮末随机游走幅度（±） */
export const ECON_VOL = 0.08;
/** 新闻对景气度的偏置：大盘新闻 ±0.15 / 其它 ±0.05 */
export const ECON_BIAS_ECONOMY = 0.15;
export const ECON_BIAS_NORMAL = 0.05;

/** 查税：每 ￥1 租金收入带来的被查概率（0.0002 ⇒ 每 ￥100 租金 +2%） */
export const AUDIT_PER_RENT = 0.0002;
/** 被查概率上限（40%） */
export const AUDIT_MAX = 0.4;
/** 补税额 = 本轮租金收入 × 30% */
export const AUDIT_RATE = 0.3;

/* —— M20.5 经济道具（D45）—— */
/** `subsidy` 立即领取额 */
export const SUBSIDY_AMOUNT = 300;
/** `boom` 景气度抬升量 */
export const BOOM_DELTA = 0.2;

/* —— M20.6 设施现金流分成强化（spec §4.3 D53）—— */
/** 现金流通过系数：`flow = cashflow × shares / shares_total × 本系数`（大股东直接吃设施现金流） */
export const FACILITY_FLOW_MULT = 2;
/** 控股权溢价：单一玩家持股 > 50% 时额外得 `round(price × shares × 本系数)` */
export const FACILITY_CONTROL_BONUS = 0.02;
/** 基础分红率（每股 / 轮）：5% → 6%（≈17 轮回本，仍高于存款 3%） */
export const FACILITY_DIV_RATE_NEW = 0.06;

/* —— M20.6 终局加速（spec §4.3 D54）—— */
/** 终局加速起始轮（≈20 分钟，按每轮 ~30s、ROUND_LIMIT=60 全程 ≈30min 估算） */
export const ENDGAME_START_ROUND = 40;

/** 一段加速档：`rentMult / volMult / newsMult` 用于放大「偏离 1 的部分」（见 `amplify`） */
export interface EndgameStage {
  from: number;
  to: number;
  label: string;
  /** 地租放大倍数 */
  rentMult: number;
  /** 股市波动放大倍数 */
  volMult: number;
  /** 新闻力度放大倍数（红利 / 板块 / 景气偏置） */
  newsMult: number;
}

/** 终局三段（Ⅰ 40–46 / Ⅱ 47–53 / Ⅲ 54–60）：系数逐段递增，给玩家观察与反应窗口 */
export const ENDGAME_STAGES: readonly EndgameStage[] = [
  { from: 40, to: 46, label: '加速 Ⅰ', rentMult: 1.4, volMult: 1.3, newsMult: 1.3 },
  { from: 47, to: 53, label: '加速 Ⅱ', rentMult: 1.8, volMult: 1.6, newsMult: 1.6 },
  { from: 54, to: 60, label: '终局', rentMult: 2.4, volMult: 2.0, newsMult: 2.0 },
];

/** 段外（未进入终局）中性档：全 1 ⇒ `amplify` 恒等、逐值回旧口径 */
export const ENDGAME_NEUTRAL: EndgameStage = {
  from: 0, to: 0, label: '', rentMult: 1, volMult: 1, newsMult: 1,
};