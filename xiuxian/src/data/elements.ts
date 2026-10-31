/**
 * 五行属性克制（P3-1 战斗深度）。
 * 相克：金克木、木克土、土克水、水克火、火克金（经典五行相生相克之"克"环）。
 * 攻击方属性克制防守方 → 伤害 ×1.5；被克 → ×0.7；同属性/无属性 → ×1。
 */
export type ElementKind = "metal" | "wood" | "water" | "fire" | "earth" | "thunder" | "ice";

/** 相克环：key 克 value（key 攻击 value 防守方时增伤） */
export const ELEMENT_CYCLE: Record<ElementKind, ElementKind> = {
  metal: "wood",
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal",
  thunder: "thunder",
  ice: "ice",
};

export const ELEMENT_NAME: Record<ElementKind, string> = {
  metal: "金",
  wood: "木",
  water: "水",
  fire: "火",
  earth: "土",
  thunder: "雷",
  ice: "冰",
};

/** 结晶护盾配色（与元素光环一致）：火=橙、水=蓝、雷=黄、冰=青，其余中性灰绿 */
export const ELEM_CRYSTAL_COLOR: Record<ElementKind, string> = {
  fire: "#ff6a3c",
  water: "#3aa0ff",
  thunder: "#ffe14a",
  ice: "#9fe8ff",
  metal: "#c9c9c9",
  wood: "#6fae5a",
  earth: "#b08a4a",
};
/** 多元素共存结晶（复合护盾）的统一配色：淡紫，提示"抗多种元素" */
export const MULTI_CRYSTAL_COLOR = "#e0b3ff";

/** 元素克制倍率：atk 克 def → 1.5；def 克 atk → 0.7；其余 1.0（无属性视为中性，不参与克制） */
export function elementMultiplier(atk?: ElementKind, def?: ElementKind): number {
  if (!atk || !def) return 1;
  if (ELEMENT_CYCLE[atk] === def) return 1.5; // 我克你
  if (ELEMENT_CYCLE[def] === atk) return 0.7; // 你克我
  return 1;
}

/** 克制关系描述（用于飘字提示）：返回 "克" / "抗" / "" */
export function elementTag(atk?: ElementKind, def?: ElementKind): string {
  if (!atk || !def) return "";
  if (ELEMENT_CYCLE[atk] === def) return "克";
  if (ELEMENT_CYCLE[def] === atk) return "抗";
  return "";
}
