/**
 * 装备词条池（数据驱动）。掉落/购买装备时由 Player.affixRng 随机 roll 1~2 条，
 * 按装备 id 玩家级共享（同一装备只滚一次，与 forge 一致），保证可复现、旧档无词条数值不变。
 */
export type AffixKey = "atk" | "def" | "spd" | "crit" | "lifesteal";

export interface AffixDef {
  id: string;
  key: AffixKey;
  name: string;
  min: number;
  max: number;
  desc: string;
}

/** 一件装备滚出的词条实例（数值已确定） */
export interface AffixInstance {
  atk?: number;
  def?: number;
  spd?: number;
  crit?: number;
  lifesteal?: number;
}

export const AFFIX_POOL: AffixDef[] = [
  { id: "atk", key: "atk", name: "攻伐", min: 3, max: 9, desc: "攻击 +" },
  { id: "def", key: "def", name: "坚壁", min: 2, max: 7, desc: "防御 +" },
  { id: "spd", key: "spd", name: "疾风", min: 0.04, max: 0.12, desc: "速度 +" },
  { id: "crit", key: "crit", name: "锐利", min: 0.02, max: 0.06, desc: "暴击 +" },
  { id: "lifesteal", key: "lifesteal", name: "嗜血", min: 0.02, max: 0.06, desc: "吸血 +" },
];
