/**
 * 灵根系统（数据驱动）。玩家出生时按 seed 确定性生成灵根，
 * 提供属性乘区（攻/防/速/暴）与轻微技能倾向，立刻拉开 build 差异。
 * 变异灵根（天/异/伪）稀有且强力或弱势，制造养成取舍。
 */
import { makeRng } from "../core/Rng";

export interface RootDef {
  id: string;
  name: string;
  desc: string;
  /** 属性乘区（加法百分比，例如 atk:0.1 = 攻击 +10%） */
  mul: { atk?: number; def?: number; spd?: number; crit?: number };
  /** 是否为变异灵根 */
  mutate?: boolean;
}

export const ROOTS: RootDef[] = [
  { id: "jin", name: "金灵根", desc: "锋锐无匹，攻防见长", mul: { atk: 0.10, def: 0.05, spd: -0.03 } },
  { id: "mu", name: "木灵根", desc: "生生不息，稳如磐石", mul: { def: 0.10, spd: 0.05, crit: -0.02 } },
  { id: "shui", name: "水灵根", desc: "流转灵动，迅捷善变", mul: { spd: 0.10, crit: 0.04, atk: -0.03 } },
  { id: "huo", name: "火灵根", desc: "炽烈焚天，暴起伤敌", mul: { atk: 0.12, crit: 0.04, def: -0.04 } },
  { id: "tu", name: "土灵根", desc: "厚重载物，根基扎实", mul: { def: 0.10, atk: 0.03, spd: -0.02 } },
  { id: "tian", name: "天灵根", desc: "万中无一，诸般皆宜", mul: { atk: 0.15, def: 0.15, spd: 0.08, crit: 0.05 }, mutate: true },
  { id: "yi", name: "异灵根", desc: "驳杂而全，攻守兼备", mul: { atk: 0.08, def: 0.08, spd: 0.08, crit: 0.04 }, mutate: true },
  { id: "wei", name: "伪灵根", desc: "驳杂不纯，举步维艰", mul: { atk: -0.05, def: -0.05, spd: -0.03, crit: -0.02 }, mutate: true },
];

const ROOT_MAP: Record<string, RootDef> = {};
for (const r of ROOTS) ROOT_MAP[r.id] = r;

export function getRoot(id: string): RootDef | undefined {
  return ROOT_MAP[id];
}

/** 取灵根乘区（缺省为 0，即无加成） */
export function rootMulOf(id: string): { atk: number; def: number; spd: number; crit: number } {
  const m = getRoot(id)?.mul || {};
  return { atk: m.atk || 0, def: m.def || 0, spd: m.spd || 0, crit: m.crit || 0 };
}

const FIVE = ["jin", "mu", "shui", "huo", "tu"];

/** 确定性生成灵根：同 seed 必得同结果，保证存档/冒烟可复现 */
export function rollRoot(seed: number): string {
  const rng = makeRng((seed >>> 0) ^ 0x7a11d);
  const r = rng();
  if (r < 0.03) return "tian";   // 3% 天灵根
  if (r < 0.07) return "yi";      // 4% 异灵根
  if (r < 0.10) return "wei";     // 3% 伪灵根
  return FIVE[Math.floor(rng() * FIVE.length)]; // 余下均分五行
}
