/**
 * 特殊格（spec §5.5）：监狱 / 福利中心 / 股票交易所 / 银行 / 乐透彩 / 税务局 / 医院。纯逻辑、零引擎，随机吃注入 rng。
 *
 * 监狱停回合数**定死 `JAIL_TURNS = 2`**（spec 写「1–2」）：可复现、免罚卡价值可量化。
 * 福利中心奖励落成**等权三选一**显式表（现金 / 卡牌 / 免费升级），便于 seeded rng 复现。
 * 银行 / 乐透 / 税金 / 医院（对齐并超越《大富翁 5》的四个经典格）同样落成显式常数表。
 */
import { typeAt } from '../data/board';
import { ITEM_CARDS, type ItemCardKind } from '../data/cards';

export type SpecialKind = 'jail' | 'bonus' | 'stock' | 'bank' | 'lottery' | 'tax' | 'hospital';

/** 监狱禁行回合数（定死 2；免罚卡抵消即归 0） */
export const JAIL_TURNS = 2;

/** 医院住院回合数（定死 1；复用 `state.jail` 计时，免罚卡同样可抵消） */
export const HOSPITAL_TURNS = 1;

/** 读 `board.ts` 的 TILE_TYPES 真源，非硬编码数字表 */
export function specialAt(index: number): SpecialKind | null {
  const t = typeAt(index);
  if (t === 'jail') return 'jail';
  if (t === 'bonus') return 'bonus';
  if (t === 'stock') return 'stock';
  if (t === 'bank') return 'bank';
  if (t === 'lottery') return 'lottery';
  if (t === 'tax') return 'tax';
  if (t === 'hospital') return 'hospital';
  return null;
}

/** 每回合递减一格（下限 0，不出现负值） */
export function nextJail(turns: number): number {
  return Math.max(0, turns - 1);
}

export type BonusReward =
  | { kind: 'cash'; amount: 200 | 400 }
  | { kind: 'item'; item: ItemCardKind }
  | { kind: 'upgrade' };

/** 福利中心三选一权重（等权） */
export const BONUS_WEIGHTS: Record<BonusReward['kind'], number> = { cash: 1, item: 1, upgrade: 1 };

export function rollBonus(rng: () => number): BonusReward {
  const total = BONUS_WEIGHTS.cash + BONUS_WEIGHTS.item + BONUS_WEIGHTS.upgrade;
  let r = rng() * total;
  if (r < BONUS_WEIGHTS.cash) return { kind: 'cash', amount: rng() < 0.5 ? 200 : 400 };
  r -= BONUS_WEIGHTS.cash;
  if (r < BONUS_WEIGHTS.item) return { kind: 'item', item: ITEM_CARDS[Math.floor(rng() * ITEM_CARDS.length)].kind };
  return { kind: 'upgrade' };
}

/** 鹿乡银行：按现金 10% 计息，单次封顶 ￥300（现金越多越有利，鼓励留现金存款） */
export const BANK_RATE = 0.1;
export const BANK_CAP = 300;

/** 税务局：按现金 10% 征收，单次封顶 ￥500（走欠款清算，可能触发变卖 / 破产） */
export const TAX_RATE = 0.1;
export const TAX_CAP = 500;

/** 乐透入场费：现金不足时按现有现金扣，**不会因买彩票破产** */
export const LOTTERY_STAKE = 100;

/** 乐透奖级与权重（合计 100）：50% 空手 / 30% ￥200 / 15% ￥600 / 5% ￥1500 */
export const LOTTERY_TABLE: ReadonlyArray<{ prize: number; weight: number }> = [
  { prize: 0, weight: 50 },
  { prize: 200, weight: 30 },
  { prize: 600, weight: 15 },
  { prize: 1500, weight: 5 },
];

/** 按权重抽一个奖级（返回中奖金额，0 = 空手）；rng 注入，seeded 可复现 */
export function rollLottery(rng: () => number): number {
  const total = LOTTERY_TABLE.reduce((sum, t) => sum + t.weight, 0);
  let r = rng() * total;
  for (const t of LOTTERY_TABLE) {
    if (r < t.weight) return t.prize;
    r -= t.weight;
  }
  return 0;
}