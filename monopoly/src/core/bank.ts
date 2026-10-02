/**
 * 银行信贷纯函数（M20.2 · spec §3.1 / §3.2）。只依赖 `estate.ts` 与 `data/*`，
 * 不 import `game.ts` 运行时（与 M20.1 `auction.ts` 同法：类型在此定义，`game.ts` 反向 import）。
 * 全链路纯算术、零随机。
 */
import {
  LOAN_CAP, LOAN_NET_RATIO, MORTGAGE_LTV, RENT_PENALTY,
} from '../data/bank';
import { sellAt, type Estates } from './estate';

/** 一笔计息债务（信用贷款 / 抵押贷款共用形状） */
export interface DebtBook {
  /** 本金余额（含已资本化的利息） */
  principal: number;
  /** 每轮利率（用于轮末复利） */
  rate: number;
  /** 到期轮次：`state.round > due` 即逾期 */
  due: number;
  /** 连续逾期轮数（0 = 未逾期）；满 `OVERDUE_SEIZE_ROUNDS` 触发强制执行 */
  overdue: number;
  /** 贷款首轮免息标记（M20.2-D8：落 9 号格当回合申请信用贷款 ⇒ 轮末跳 1 次计息后清除） */
  freeFirstRound?: boolean;
}

/** 抵押贷款 = 一笔债务 + 被锁地块序号 */
export interface MortgageBook extends DebtBook {
  index: number;
}

/** 信用贷款额度 = min(￥2000, 净资产 × 30%)（spec §3.2） */
export function loanLimitOf(netWorth: number): number {
  return Math.min(LOAN_CAP, Math.round(netWorth * LOAN_NET_RATIO));
}

/** 抵押贷款额度 = 地块变卖价 × 80%（spec §3.2） */
export function mortgageLimitOf(estates: Estates, index: number): number {
  return Math.round(sellAt(estates, index) * MORTGAGE_LTV);
}

/** 单轮利息 = 本金 × 利率（四舍五入到元） */
export function interestOf(book: DebtBook): number {
  return Math.round(book.principal * book.rate);
}

/** 逾期推进：`round > due` 时 +1（到期轮本身不算逾期），否则归零 */
export function overdueOf(book: DebtBook, round: number): number {
  return round > book.due ? book.overdue + 1 : 0;
}

/** 逾期付租罚息 = 租金 × 50%（直冲欠款本金，不给地主） */
export function penaltyOf(rent: number): number {
  return Math.round(rent * RENT_PENALTY);
}
