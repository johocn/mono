/**
 * 宝石（数据驱动）。按部位镶嵌，加成并入 equipStat 单次遍历（零架构改动）。
 * 洗练 = 消耗灵石重滚该装备词条（复用 affixRng）。
 */
import { type EquipSlot } from "./items";

export type GemStatKey = "atk" | "def" | "spd" | "crit" | "lifesteal";

export interface GemDef {
  id: string;
  name: string;
  /** 可镶嵌部位 */
  slot: EquipSlot;
  key: GemStatKey;
  /** 数值（spd/crit/lifesteal 为比例，atk/def 为绝对值） */
  val: number;
  desc: string;
}

export const GEMS: GemDef[] = [
  { id: "gem-atk", name: "赤血石", slot: "weapon", key: "atk", val: 8, desc: "攻击 +8" },
  { id: "gem-crit", name: "破军星", slot: "weapon", key: "crit", val: 0.04, desc: "暴击 +4%" },
  { id: "gem-def", name: "玄龟壳", slot: "armor", key: "def", val: 6, desc: "防御 +6" },
  { id: "gem-spd", name: "风灵珠", slot: "trinket", key: "spd", val: 0.08, desc: "速度 +8%" },
  { id: "gem-life", name: "续命玉", slot: "trinket", key: "lifesteal", val: 0.04, desc: "吸血 +4%" },
];

const GEM_MAP: Record<string, GemDef> = {};
for (const g of GEMS) GEM_MAP[g.id] = g;

export function getGem(id: string): GemDef | undefined {
  return GEM_MAP[id];
}

/** 该部位可镶嵌的宝石 id 列表（供 UI 选择 / 自动选最优） */
export function gemsForSlot(slot: EquipSlot): string[] {
  return GEMS.filter((g) => g.slot === slot).map((g) => g.id);
}

/** 洗练一次消耗的灵石 */
export const REFINE_COST = 80;
