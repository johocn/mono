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