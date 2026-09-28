/**
 * 特殊格（spec §5.5）：监狱 / 福利中心 / 股票交易所入口。纯逻辑、零引擎，随机吃注入 rng。
 *
 * 监狱停回合数**定死 `JAIL_TURNS = 2`**（spec 写「1–2」）：可复现、免罚卡价值可量化。
 * 福利中心奖励落成**等权三选一**显式表（现金 / 卡牌 / 免费升级），便于 seeded rng 复现。
 */
import { typeAt } from '../data/board';
import { ITEM_CARDS, type ItemCardKind } from '../data/cards';

export type SpecialKind = 'jail' | 'bonus' | 'stock';

/** 监狱禁行回合数（定死 2；免罚卡抵消即归 0） */
export const JAIL_TURNS = 2;

/** 读 `board.ts` 的 TILE_TYPES 真源，非硬编码数字表 */
export function specialAt(index: number): SpecialKind | null {
  const t = typeAt(index);
  if (t === 'jail') return 'jail';
  if (t === 'bonus') return 'bonus';
  if (t === 'stock') return 'stock';
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