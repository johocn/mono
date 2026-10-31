import type { TalentBranch } from "./talents";

/**
 * 功法流派（数据驱动）。玩家可切换流派，切换即装备该流派技能组并叠加被动加成。
 * 默认流派为「散修」（零被动），保证未切换时属性与既有存档一致。
 */
export interface SchoolDef {
  id: string;
  name: string;
  desc: string;
  /** 被动加成（与灵根/天赋同范式，按属性乘区叠加） */
  passive: { atk?: number; def?: number; spd?: number; crit?: number };
  /** 切换时自动装备的技能 id（取前 4 个填入技能槽） */
  skills: string[];
  /** 流派天赋共鸣：强化对应分支天赋效果（P3-3）；散修无 */
  synergy?: TalentBranch;
}

/** 流派天赋共鸣倍率（所选流派强化其对应天赋分支的效果） */
export const TALENT_SYNERGY_MUL = 1.5;

export const SCHOOLS: SchoolDef[] = [
  {
    id: "sanxiu", name: "散修", desc: "无门无派，博采众长（无被动加成）。",
    passive: {}, skills: ["huoqiu", "yufeng", "huichun", "dingshen"],
  },
  {
    id: "jianxiu", name: "剑修", desc: "一剑破万法，攻击见长。",
    passive: { atk: 0.08 }, skills: ["jianmang", "yujian", "jianqi", "wanjian"], synergy: "sword",
  },
  {
    id: "faxiu", name: "法修", desc: "术法通玄，攻守兼备。",
    passive: { atk: 0.05, crit: 0.04 }, skills: ["huoqiu", "lieyan", "xuanbing", "wulei"], synergy: "law",
  },
  {
    id: "tixiu", name: "体修", desc: "肉身成圣，坚不可摧。",
    passive: { def: 0.10, spd: 0.05 }, skills: ["yufeng", "huti", "tiebi", "huichun"], synergy: "body",
  },
];

const SCHOOL_MAP: Record<string, SchoolDef> = {};
for (const s of SCHOOLS) SCHOOL_MAP[s.id] = s;

export function getSchool(id: string): SchoolDef | undefined {
  return SCHOOL_MAP[id];
}

/** 流派天赋共鸣分支（无则 undefined，如散修） */
export function getSchoolSynergy(id: string): TalentBranch | undefined {
  return getSchool(id)?.synergy;
}

export const DEFAULT_SCHOOL = "sanxiu";
