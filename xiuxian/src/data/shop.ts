/**
 * 坊市（商店）与炼器规则：全部数据驱动，改这里即可调整经济与强化曲线。
 * 价格单位 = 灵石；装备强化等级作用于「装备 id」（同名装备共享等级）。
 */
import { ITEMS, getItem, isEquipment } from "./items";

/** 货郎在售货物（道具/材料/装备） */
export const SHOP_STOCK: string[] = [
  "huixue-dan",
  "huilan-dan",
  "xiuwei-dan",
  "yuan-ying-dan",
  "yaodan",
  "wood",
  "stone",
  "qingfeng-jian",
  "huixin-jia",
  "yufeng-pei",
  "zhentie-jian",
  "xuangui-jia",
  "bi-shui-jian",
  "jiao-lin-jia",
];

/** 回收折扣：卖出价 = 基准价 × 0.4（至少 1 灵石） */
export const SELL_RATIO = 0.4;

export function priceOf(id: string): number {
  return getItem(id)?.price || 0;
}

export function buyPriceOf(id: string): number {
  return priceOf(id);
}

export function sellPriceOf(id: string): number {
  const p = priceOf(id);
  return p <= 0 ? 0 : Math.max(1, Math.round(p * SELL_RATIO));
}

export function canSell(id: string): boolean {
  return sellPriceOf(id) > 0;
}

/** 商店库存校验：货物必须存在且可定价 */
export function shopStockValid(): boolean {
  return SHOP_STOCK.every((id) => !!ITEMS[id] && buyPriceOf(id) > 0);
}

// ================= 炼器 =================

/** 强化上限（+9 圆满） */
export const FORGE_MAX = 9;

export interface ForgeCost {
  stones: number;
  /** 妖丹数量 */
  yaodan: number;
}

/** 每级消耗：灵石 40+30×lv，妖丹 1+⌊lv/2⌋ */
export function forgeCostOf(level: number): ForgeCost {
  const lv = Math.max(0, level);
  return { stones: 40 + 30 * lv, yaodan: 1 + Math.floor(lv / 2) };
}

/** 成功率：0.95 起，每级 -8%，下限 25% */
export function forgeRateOf(level: number): number {
  return Math.max(0.25, 0.95 - 0.08 * Math.max(0, level));
}

/** 每级属性增益比例：攻防 +12%/级，速度暴击 +6%/级 */
export const FORGE_ATK_RATIO = 0.12;
export const FORGE_SUB_RATIO = 0.06;

export interface ForgeBonus {
  atk: number;
  def: number;
  spd: number;
  crit: number;
}

const ZERO_BONUS: ForgeBonus = { atk: 0, def: 0, spd: 0, crit: 0 };

/** 某装备在指定强化等级下的额外属性（未强化或不可炼器返回 0） */
export function forgeBonusOf(id: string, level: number): ForgeBonus {
  const def = getItem(id);
  if (!def || !isEquipment(id) || level <= 0) return { ...ZERO_BONUS };
  const lv = Math.min(level, FORGE_MAX);
  return {
    atk: (def.atk || 0) * FORGE_ATK_RATIO * lv,
    def: (def.def || 0) * FORGE_ATK_RATIO * lv,
    spd: (def.spd || 0) * FORGE_SUB_RATIO * lv,
    crit: (def.crit || 0) * FORGE_SUB_RATIO * lv,
  };
}

/** 装备显示名（含强化等级），如「青锋剑 +3」 */
export function itemLabel(id: string, level = 0): string {
  const def = getItem(id);
  const base = def?.name || id;
  return level > 0 ? `${base} +${level}` : base;
}
