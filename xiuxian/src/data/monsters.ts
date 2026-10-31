/**
 * 怪物配置表：数值 / AI 参数 / 掉落。
 * Boss 额外带技能（冲锋 / 咆哮 AOE）。
 */
import type { ElementKind } from "./elements";

export interface LootDrop {
  id: string;
  /** 0~1 掉落概率 */
  chance: number;
  count: number;
}

export interface BossSkillDef {
  /** 触发间隔（秒） */
  every: number;
  range: number;
  aoe: number;
  power: number;
  name: string;
  /** 预警时间（秒）：技能发动前地面红圈预警时长，给玩家翻滚躲避窗口；缺省 0.9 */
  telegraph?: number;
}

export interface MonsterDef {
  id: string;
  name: string;
  hp: number;
  atk: number;
  def: number;
  /** 移动速度（格/秒） */
  speed: number;
  aggroRange: number;
  attackRange: number;
  /** 攻击间隔（秒） */
  attackCd: number;
  /** 近战前摇（秒）：地面红圈预警时长；缺省 0.35 */
  attackWindup?: number;
  exp: number;
  /** 体型倍率 */
  size: number;
  /** 主体颜色 */
  color: string;
  boss?: boolean;
  /** 是否魔物（坠魔谷）：计入镇魔进度 */
  demon?: boolean;
  /** 五行属性（金木水火土），缺省无属性 */
  element?: ElementKind;
  /** 抗击退系数 0~1（1 = 免疫击退），Boss 通常较高 */
  knockResist?: number;
  /** 韧性（破防值）：被打空后进入破防（硬直+易伤）；缺省按体型/Hp 推算 */
  poise?: number;
  loot: LootDrop[];
  /** 灵石掉落区间（每次击杀掷算） */
  stones: { min: number; max: number };
  skill?: BossSkillDef;
}

export const MONSTERS: Record<string, MonsterDef> = {
  "hui-lang": {
    id: "hui-lang", name: "灰毛狼", hp: 60, atk: 8, def: 2,
    element: "wood",
    speed: 2.2, aggroRange: 5, attackRange: 1.2, attackCd: 1.4, exp: 25,
    size: 0.9, color: "#8d99ae",
    loot: [
      { id: "huixue-dan", chance: 0.25, count: 1 },
      { id: "yaodan", chance: 0.5, count: 1 },
      { id: "wood", chance: 0.45, count: 1 },
      { id: "stone", chance: 0.3, count: 1 },
    ],
    stones: { min: 4, max: 12 },
  },
  "bi-jing-lang": {
    id: "bi-jing-lang", name: "碧睛妖狼", hp: 110, atk: 13, def: 4,
    element: "wood",
    speed: 2.6, aggroRange: 6, attackRange: 1.3, attackCd: 1.2, exp: 45,
    size: 1.05, color: "#5f8d4e",
    loot: [
      { id: "huixue-dan", chance: 0.35, count: 1 },
      { id: "huilan-dan", chance: 0.25, count: 1 },
      { id: "yaodan", chance: 0.6, count: 1 },
      { id: "xiuwei-dan", chance: 0.15, count: 1 },
      { id: "wood", chance: 0.5, count: 1 },
      { id: "stone", chance: 0.4, count: 1 },
    ],
    stones: { min: 8, max: 20 },
  },
  "yao-lang-wang": {
    id: "yao-lang-wang", name: "妖狼王", hp: 900, atk: 26, def: 10,
    speed: 2.4, aggroRange: 8, attackRange: 1.8, attackCd: 1.1, exp: 800,
    size: 1.9, color: "#9b2226", boss: true,
    loot: [
      { id: "yaowang-neidan", chance: 1, count: 1 },
      { id: "xiuwei-dan", chance: 1, count: 2 },
    ],
    stones: { min: 300, max: 420 },
    skill: { every: 6, range: 5, aoe: 2.2, power: 1.6, name: "狼王咆哮" },
    knockResist: 0.6,
  },

  // —— 乱星海（第二章）——
  "hai-yao": {
    id: "hai-yao", name: "海妖", hp: 140, atk: 16, def: 5,
    speed: 2.4, aggroRange: 6, attackRange: 1.3, attackCd: 1.2, exp: 55,
    size: 1.0, color: "#3aa0b0",
    loot: [
      { id: "yaodan", chance: 0.6, count: 1 },
      { id: "shan-hu", chance: 0.5, count: 1 },
      { id: "huixue-dan", chance: 0.3, count: 1 },
      { id: "wood", chance: 0.3, count: 1 },
    ],
    stones: { min: 12, max: 28 },
  },
  "xie-jiang": {
    id: "xie-jiang", name: "蟹将", hp: 220, atk: 20, def: 9,
    speed: 1.8, aggroRange: 5, attackRange: 1.4, attackCd: 1.5, exp: 75,
    size: 1.15, color: "#c0653a",
    loot: [
      { id: "xie-jia", chance: 0.7, count: 1 },
      { id: "yaodan", chance: 0.5, count: 1 },
      { id: "shan-hu", chance: 0.4, count: 1 },
      { id: "huixue-dan", chance: 0.3, count: 1 },
    ],
    stones: { min: 16, max: 36 },
  },
  "jiao-ren": {
    id: "jiao-ren", name: "鲛人", hp: 180, atk: 22, def: 7,
    speed: 2.6, aggroRange: 6, attackRange: 1.6, attackCd: 1.1, exp: 80,
    size: 1.05, color: "#5fbf9f",
    loot: [
      { id: "jiao-zhu", chance: 0.45, count: 1 },
      { id: "zhen-zhu", chance: 0.5, count: 1 },
      { id: "jiao-xiao", chance: 0.35, count: 1 },
      { id: "yaodan", chance: 0.5, count: 1 },
    ],
    stones: { min: 18, max: 40 },
  },
  "fu-hai-jiao": {
    id: "fu-hai-jiao", name: "覆海蛟", hp: 1800, atk: 38, def: 16,
    speed: 2.2, aggroRange: 9, attackRange: 2.0, attackCd: 1.0, exp: 1500,
    size: 2.1, color: "#2e6b8a", boss: true,
    loot: [
      { id: "jiao-zhu", chance: 1, count: 2 },
      { id: "jiao-xiao", chance: 1, count: 2 },
      { id: "yaowang-neidan", chance: 1, count: 1 },
      { id: "xiuwei-dan", chance: 1, count: 3 },
      { id: "yuan-ying-dan", chance: 0.6, count: 1 },
    ],
    stones: { min: 600, max: 900 },
    skill: { every: 5, range: 6, aoe: 3, power: 1.8, name: "覆海狂涛" },
    knockResist: 0.7,
  },

  // —— 坠魔谷魔物（第二章深化；demon 标记计入镇魔进度）——
  "mo-jing-lang": {
    id: "mo-jing-lang", name: "魔狼", hp: 320, atk: 30, def: 12,
    element: "fire",
    speed: 2.6, aggroRange: 6, attackRange: 1.3, attackCd: 1.2, exp: 120,
    size: 1.0, color: "#6b4a8f", demon: true,
    loot: [
      { id: "mo-he", chance: 0.4, count: 1 },
      { id: "mo-qi", chance: 0.5, count: 1 },
      { id: "yaodan", chance: 0.5, count: 1 },
      { id: "wood", chance: 0.3, count: 1 },
    ],
    stones: { min: 20, max: 40 },
  },
  "xie-xiu": {
    id: "xie-xiu", name: "邪修", hp: 420, atk: 38, def: 14,
    element: "fire",
    speed: 2.3, aggroRange: 6, attackRange: 1.4, attackCd: 1.3, exp: 160,
    size: 1.05, color: "#8a3b5c", demon: true,
    loot: [
      { id: "mo-he", chance: 0.5, count: 1 },
      { id: "mo-qi", chance: 0.4, count: 1 },
      { id: "tu-po-dan", chance: 0.06, count: 1 },
      { id: "yaodan", chance: 0.5, count: 1 },
    ],
    stones: { min: 30, max: 60 },
  },
  "xin-mo": {
    id: "xin-mo", name: "心魔", hp: 500, atk: 44, def: 16,
    element: "fire",
    speed: 2.8, aggroRange: 7, attackRange: 1.5, attackCd: 1.1, exp: 200,
    size: 1.1, color: "#b03a6e", demon: true,
    loot: [
      { id: "mo-he", chance: 0.6, count: 1 },
      { id: "mo-qi", chance: 0.6, count: 1 },
      { id: "yuan-ying-dan", chance: 0.1, count: 1 },
      { id: "yaodan", chance: 0.5, count: 1 },
    ],
    stones: { min: 35, max: 70 },
  },
  "mo-zun": {
    id: "mo-zun", name: "魔尊", hp: 6000, atk: 70, def: 30,
    speed: 2.2, aggroRange: 9, attackRange: 2.0, attackCd: 1.0, exp: 4000,
    size: 2.2, color: "#3a1f4d", boss: true, demon: true,
    knockResist: 0.7,
    loot: [
      { id: "mo-zun-neidan", chance: 1, count: 1 },
      { id: "mo-he", chance: 1, count: 2 },
      { id: "mo-qi", chance: 1, count: 3 },
      { id: "yuan-ying-dan", chance: 0.8, count: 1 },
      { id: "tu-po-dan", chance: 0.5, count: 1 },
      { id: "gem-atk", chance: 0.4, count: 1 },
    ],
    stones: { min: 800, max: 1200 },
    skill: { every: 5, range: 6, aoe: 3, power: 2.0, name: "魔渊咆哮" },
  },
};

export function getMonster(id: string): MonsterDef {
  const m = MONSTERS[id];
  if (!m) throw new Error(`unknown monster: ${id}`);
  return m;
}

/** 运行时内容覆盖：合并外部 override.json 的怪物字段（扩内容/平衡热修，无需重编译）。 */
export function applyMonsterOverride(ov?: Record<string, Partial<MonsterDef>>): void {
  if (!ov) return;
  for (const id of Object.keys(ov)) {
    const patch = ov[id];
    if (!patch) continue;
    const cur = MONSTERS[id];
    if (cur) {
      Object.assign(cur, patch);
    } else {
      const full = patch as MonsterDef;
      if (full.id) MONSTERS[id] = full;
    }
  }
}
