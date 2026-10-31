/**
 * 装备品质色阶（P3-4）：白 → 绿 → 蓝 → 紫 → 橙。
 * 决定基础数值倍率（statMul）与词缀数量（affixes），掉落按权重随机；
 * bias∈[0,1] 提升高品质概率（Boss / 高层秘境 / 宝箱）。
 */
import type { Rng } from "../core/Rng";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface RarityDef {
  id: Rarity;
  name: string;
  color: string;
  /** 基础数值倍率（atk/def/spd/crit 乘算） */
  statMul: number;
  /** 该品质词缀条数 */
  affixes: number;
  /** 掉落权重（基础，无 bias 时） */
  weight: number;
}

export const RARITIES: RarityDef[] = [
  { id: "common",    name: "凡品", color: "#b8b8b8", statMul: 1.0,  affixes: 0, weight: 50 },
  { id: "uncommon",  name: "良品", color: "#5fd35f", statMul: 1.15, affixes: 1, weight: 28 },
  { id: "rare",      name: "精良", color: "#4aa3ff", statMul: 1.35, affixes: 2, weight: 14 },
  { id: "epic",      name: "史诗", color: "#b06bff", statMul: 1.6,  affixes: 3, weight: 6 },
  { id: "legendary", name: "传说", color: "#ff9d2e", statMul: 2.0,  affixes: 4, weight: 2 },
];

export function getRarity(id: Rarity): RarityDef {
  return RARITIES.find((r) => r.id === id) || RARITIES[0];
}

/** 按权重随机品质；bias 越大越偏向高品质（指数放大后段权重） */
export function rollRarity(rng: Rng, bias = 0): Rarity {
  const weights = RARITIES.map((r, i) => r.weight * Math.pow(1 + bias * 3, i));
  const sum = weights.reduce((s, w) => s + w, 0);
  let x = rng() * sum;
  for (let i = 0; i < RARITIES.length; i++) {
    x -= weights[i];
    if (x <= 0) return RARITIES[i].id;
  }
  return "common";
}
