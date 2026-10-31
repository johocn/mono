/**
 * 法宝 / 圣物：数据驱动。装备后提供被动属性，并授予一个主动技能（装备即永久学会）。
 * 与装备(weapon/armor/trinket) 独立成槽，存档随 SaveState.artifact / ownedArtifacts 持久化。
 */
export interface ArtifactDef {
  id: string;
  name: string;
  desc: string;
  /** 被动属性 */
  atk?: number;
  def?: number;
  hp?: number;
  spd?: number;
  crit?: number;
  /** 授予的主动技 id（装备即学会） */
  skill: string;
  /** 获取途径说明 */
  source: string;
}

export const ARTIFACTS: Record<string, ArtifactDef> = {
  "qinglian-tai": {
    id: "qinglian-tai", name: "青莲台", desc: "伴生法宝，温养剑气。",
    atk: 6, def: 4, skill: "jianwu", source: "村长 · 灵根测试赠予",
  },
  "xuan-shui-jue": {
    id: "xuan-shui-jue", name: "玄水珏", desc: "玄水宗信物，潮涌随心。",
    atk: 8, def: 8, hp: 60, skill: "hanyong", source: "拜入玄水宗 · 使者赐予",
  },
  "zhenlong-yin": {
    id: "zhenlong-yin", name: "镇龙印", desc: "镇压蛟龙的厚重古印。",
    def: 14, hp: 120, skill: "zhanshen", source: "斩杀覆海蛟 · 战利品",
  },
};

export function getArtifact(id: string): ArtifactDef | undefined {
  return ARTIFACTS[id];
}
