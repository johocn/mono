/**
 * 技能配置表：24 个技能，数据驱动（新增技能只改这里）。
 * 战斗语义（射程/前摇/弹道/AOE/附加效果）全部由字段描述，运行时统一解释。
 */
import type { ElementKind } from "./elements";

export type SkillBranch = "sword" | "law" | "universal";

export type SkillEffect =
  | { kind: "none" }
  | { kind: "heal"; value: number }
  | { kind: "shield"; value: number; dur: number }
  | { kind: "haste"; value: number; dur: number }
  | { kind: "defUp"; value: number; dur: number }
  | { kind: "stun"; value: number; dur: number }
  | { kind: "lifesteal"; ratio: number }
  | { kind: "atkUp"; value: number; dur: number }
  | { kind: "slow"; value: number; dur: number }
  | { kind: "regen"; value: number; dur: number };

/** 战斗手感（per-skill 可覆盖，缺省由 defaultFeel 按元素/威力推导） */
export interface SkillFeel {
  /** 命中震屏强度（叠加 cam.trauma），越大越抖 */
  shake?: number;
  /** 命中顿帧秒数（取最大），0 表示不加顿帧 */
  hitstop?: number;
  /** 命中爆散粒子颜色 */
  fxColor?: string;
  /** 大招推镜峰值（>1 推近后回弹），0 不触发 */
  zoom?: number;
  /** 命中慢动作尺度（<1，如 0.4 表示半速），0 不触发 */
  slowmo?: number;
}

export interface SkillDef {
  id: string;
  name: string;
  branch: SkillBranch;
  desc: string;
  mpCost: number;
  /** 冷却（秒） */
  cd: number;
  /** 伤害系数：普攻=1 */
  power: number;
  /** 施法射程（格） */
  range: number;
  /** AOE 半径（格），0 = 单体 */
  aoe: number;
  /** 前摇（秒），前摇期间可被打断概念简化为不可移动 */
  castTime: number;
  /** 是否远程弹道（弹道飞行后命中） */
  projectile: boolean;
  /** 五行属性（金木水火土），缺省无属性 */
  element?: ElementKind;
  /** 附加效果（对自身或目标，由 runtime 语义决定） */
  effect: SkillEffect;
  /** 战斗手感覆盖（震屏/顿帧/特效色/推镜/慢动作），缺省按元素与威力自动推导 */
  feel?: SkillFeel;
}

export const SKILLS: SkillDef[] = [
  // —— 剑修——
  {
    id: "jianmang", name: "剑芒", branch: "sword",
    desc: "凝剑意为一击，单体伤害。", mpCost: 8, cd: 1.5, power: 1.6,
    element: "metal",
    range: 1.6, aoe: 0, castTime: 0.25, projectile: false,
    effect: { kind: "none" },
  },
  {
    id: "yujian", name: "御剑术", branch: "sword",
    desc: "飞剑伤敌，远程穿透。", mpCost: 14, cd: 4, power: 2.0,
    range: 7, aoe: 0, castTime: 0.35, projectile: true,
    effect: { kind: "none" },
  },
  {
    id: "jianqi", name: "剑气护体", branch: "sword",
    desc: "获得吸收伤害的剑盾。", mpCost: 20, cd: 12, power: 0,
    range: 0, aoe: 0, castTime: 0.2, projectile: false,
    effect: { kind: "shield", value: 60, dur: 8 },
  },
  {
    id: "wanjian", name: "万剑归宗", branch: "sword",
    desc: "范围剑雨，群体伤害。", mpCost: 35, cd: 10, power: 2.4,
    range: 6, aoe: 2.2, castTime: 0.6, projectile: false,
    feel: { shake: 0.5, hitstop: 0.07, fxColor: "#cfe9ff", zoom: 1.08 },
    effect: { kind: "none" },
  },
  // —— 法修——
  {
    id: "huoqiu", name: "火球术", branch: "law",
    desc: "掷出火球灼烧目标。", mpCost: 10, cd: 2, power: 1.8,
    element: "fire",
    range: 6, aoe: 0, castTime: 0.3, projectile: true,
    effect: { kind: "none" },
  },
  {
    id: "lieyan", name: "烈焰风暴", branch: "law",
    desc: "掀起烈焰，范围持续伤害。", mpCost: 32, cd: 9, power: 1.2,
    range: 5.5, aoe: 2.6, castTime: 0.5, projectile: false,
    feel: { shake: 0.42, hitstop: 0.06, fxColor: "#ff8a5c", zoom: 1.06 },
    effect: { kind: "none" },
  },
  {
    id: "xuanbing", name: "玄冰缚", branch: "law",
    desc: "冰封敌人，使其定身。", mpCost: 22, cd: 8, power: 1.0,
    element: "water",
    range: 5, aoe: 1.4, castTime: 0.4, projectile: false,
    effect: { kind: "stun", value: 1, dur: 2.5 },
  },
  {
    id: "wulei", name: "五雷正法", branch: "law",
    desc: "天雷贯地，大范围重击。", mpCost: 45, cd: 14, power: 3.2,
    element: "metal",
    range: 6.5, aoe: 2.0, castTime: 0.8, projectile: false,
    feel: { shake: 0.65, hitstop: 0.1, fxColor: "#bfe9ff", zoom: 1.14, slowmo: 0.45 },
    effect: { kind: "none" },
  },
  // —— 通用——
  {
    id: "yufeng", name: "御风步", branch: "universal",
    desc: "短时提升移动速度。", mpCost: 15, cd: 10, power: 0,
    range: 0, aoe: 0, castTime: 0.1, projectile: false,
    effect: { kind: "haste", value: 1.8, dur: 6 },
  },
  {
    id: "huichun", name: "回春术", branch: "universal",
    desc: "草木生机，持续回复气血。", mpCost: 25, cd: 12, power: 0,
    range: 0, aoe: 0, castTime: 0.3, projectile: false,
    effect: { kind: "heal", value: 90 },
  },
  {
    id: "dingshen", name: "定身术", branch: "universal",
    desc: "锁定气机，单体定身。", mpCost: 18, cd: 7, power: 0.8,
    range: 5, aoe: 0, castTime: 0.3, projectile: false,
    effect: { kind: "stun", value: 1, dur: 3 },
  },
  {
    id: "shehun", name: "摄魂术", branch: "universal",
    desc: "摄取敌魂，伤害转化为己用。", mpCost: 28, cd: 11, power: 1.5,
    range: 4, aoe: 1.0, castTime: 0.4, projectile: false,
    effect: { kind: "lifesteal", ratio: 0.5 },
  },
  // —— 乱星海 · 玄水宗（第二章新增）——
  {
    id: "shui-jian", name: "水剑诀", branch: "sword",
    desc: "引潮汐为飞剑，远程重创单体。", mpCost: 18, cd: 4, power: 2.4,
    element: "water",
    range: 8, aoe: 0, castTime: 0.35, projectile: true,
    feel: { shake: 0.45, hitstop: 0.06, fxColor: "#bfe9ff", zoom: 1.06 },
    effect: { kind: "none" },
  },
  {
    id: "xuan-shui", name: "玄水护体", branch: "universal",
    desc: "凝玄水为盾，吸收大量伤害。", mpCost: 24, cd: 12, power: 0,
    range: 0, aoe: 0, castTime: 0.2, projectile: false,
    effect: { kind: "shield", value: 120, dur: 10 },
  },
  // —— 剑修进阶 ——
  {
    id: "jianwu", name: "剑舞", branch: "sword",
    desc: "身形连斩，横扫周身群敌。", mpCost: 16, cd: 5, power: 1.5,
    range: 1.8, aoe: 1.6, castTime: 0.35, projectile: false,
    effect: { kind: "none" },
  },
  {
    id: "xujian", name: "虚剑", branch: "sword",
    desc: "虚影一剑，伤敌并使其迟缓。", mpCost: 14, cd: 5, power: 1.3,
    range: 5, aoe: 0, castTime: 0.3, projectile: false,
    effect: { kind: "slow", value: 0.55, dur: 2.5 },
  },
  {
    id: "zhanshen", name: "斩神剑", branch: "sword",
    desc: "倾力一剑，单体重创。", mpCost: 40, cd: 12, power: 2.8,
    range: 1.8, aoe: 0, castTime: 0.5, projectile: false,
    feel: { shake: 0.55, hitstop: 0.09, fxColor: "#ffd166", zoom: 1.12, slowmo: 0.4 },
    effect: { kind: "none" },
  },
  // —— 法修进阶 ——
  {
    id: "hanbing", name: "寒冰掌", branch: "law",
    desc: "寒气透体，冻缓敌人。", mpCost: 16, cd: 6, power: 1.2,
    element: "ice",
    range: 5, aoe: 0, castTime: 0.3, projectile: false,
    effect: { kind: "slow", value: 0.5, dur: 3 },
  },
  {
    id: "leiting", name: "雷诀", branch: "law",
    desc: "引动天雷，对灼烧之敌引发感电。", mpCost: 16, cd: 4, power: 2.2,
    element: "thunder",
    range: 6, aoe: 0, castTime: 0.35, projectile: true,
    effect: { kind: "none" },
  },
  {
    id: "yanqi", name: "炎爆", branch: "law",
    desc: "烈焰炸开，范围灼烧。", mpCost: 34, cd: 10, power: 1.8,
    range: 5.5, aoe: 2.4, castTime: 0.55, projectile: false,
    feel: { shake: 0.5, hitstop: 0.07, fxColor: "#ff8a5c", zoom: 1.1 },
    effect: { kind: "none" },
  },
  // —— 通用进阶 ——
  {
    id: "huti", name: "护体金光", branch: "universal",
    desc: "金光护体，短时大幅提升攻击。", mpCost: 22, cd: 14, power: 0,
    range: 0, aoe: 0, castTime: 0.2, projectile: false,
    effect: { kind: "atkUp", value: 12, dur: 10 },
  },
  {
    id: "jiuti", name: "九息服气", branch: "universal",
    desc: "纳气归元，持续回复气血。", mpCost: 26, cd: 14, power: 0,
    range: 0, aoe: 0, castTime: 0.3, projectile: false,
    effect: { kind: "regen", value: 14, dur: 8 },
  },
  {
    id: "tiebi", name: "铁臂诀", branch: "universal",
    desc: "筋肉如铁，大幅提升防御。", mpCost: 20, cd: 14, power: 0,
    range: 0, aoe: 0, castTime: 0.2, projectile: false,
    effect: { kind: "defUp", value: 20, dur: 10 },
  },
  // —— 乱星海 · 玄水进阶 ——
  {
    id: "hanyong", name: "寒涌", branch: "sword",
    desc: "引海潮寒涌，范围伤敌并迟缓。", mpCost: 24, cd: 8, power: 1.4,
    range: 5, aoe: 2.0, castTime: 0.4, projectile: false,
    effect: { kind: "slow", value: 0.5, dur: 2.5 },
  },
  {
    id: "ningshuang", name: "凝水成冰", branch: "law",
    desc: "凝水成冰，冻住单体敌人。", mpCost: 24, cd: 9, power: 1.6,
    range: 5.5, aoe: 0, castTime: 0.4, projectile: false,
    effect: { kind: "stun", value: 1, dur: 2.5 },
  },
];

/** 元素 → 命中爆散默认配色（国风五行意象） */
const ELEM_FX: Partial<Record<ElementKind, string>> = {
  metal: "#dfe9ff",
  fire: "#ff8a5c",
  water: "#bfe9ff",
  ice: "#cfefff",
  thunder: "#bfe9ff",
  wood: "#9fe89f",
  earth: "#e8dcc0",
};

/** 技能默认手感：按威力与元素推导，可由 skill.feel 覆盖 */
export function defaultFeel(s: SkillDef): SkillFeel {
  const heavy = (s.power ?? 0) >= 2.4;
  return {
    shake: heavy ? 0.42 : 0.3,
    hitstop: heavy ? 0.055 : 0,
    fxColor: s.element ? (ELEM_FX[s.element] ?? "#ffe08a") : "#ffe08a",
  };
}

const SKILL_MAP: Record<string, SkillDef> = {};
for (const s of SKILLS) SKILL_MAP[s.id] = s;

export function getSkill(id: string): SkillDef | undefined {
  return SKILL_MAP[id];
}

/** 运行时内容覆盖：合并外部 override.json 的技能字段（扩内容/平衡热修，无需重编译）。 */
export function applySkillOverride(ov?: Record<string, Partial<SkillDef>>): void {
  if (!ov) return;
  for (const id of Object.keys(ov)) {
    const patch = ov[id];
    if (!patch) continue;
    const cur = SKILL_MAP[id];
    if (cur) {
      Object.assign(cur, patch);
    } else {
      const full = patch as SkillDef;
      if (full.id) {
        SKILL_MAP[id] = full;
        if (!SKILLS.some((s) => s.id === id)) SKILLS.push(full);
      }
    }
  }
}

/** 开局默认掌握（剑修），法修需在剧情中由传功长老授予 */
export const DEFAULT_SKILLS = ["jianmang", "yujian", "jianqi", "wanjian"];
