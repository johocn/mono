/**
 * 境界表：修为驱动境界突破，每层提供属性成长。
 * 第二章 · 乱星海对应金丹→元婴→化神，结尾埋「坠魔谷」伏笔。
 */
export interface RealmDef {
  name: string;
  /** 达到本境界所需累计修为 */
  expNeed: number;
  atk: number;
  def: number;
  hp: number;
  mp: number;
  /** 是否需渡天劫（筑基/金丹/元婴/化神） */
  tribulation?: boolean;
}

export const REALMS: RealmDef[] = [
  { name: "凡人", expNeed: 0, atk: 0, def: 0, hp: 0, mp: 0 },
  { name: "炼气一层", expNeed: 100, atk: 4, def: 2, hp: 30, mp: 10 },
  { name: "炼气三层", expNeed: 300, atk: 9, def: 5, hp: 70, mp: 24 },
  { name: "炼气九层", expNeed: 700, atk: 16, def: 9, hp: 130, mp: 40 },
  { name: "筑基期", expNeed: 1500, atk: 26, def: 15, hp: 220, mp: 60, tribulation: true },
  { name: "金丹期", expNeed: 3000, atk: 40, def: 24, hp: 340, mp: 90, tribulation: true },
  { name: "元婴期", expNeed: 6000, atk: 56, def: 34, hp: 480, mp: 120, tribulation: true },
  { name: "化神期", expNeed: 12000, atk: 80, def: 50, hp: 680, mp: 160, tribulation: true },
];

/** 飞升后可进入的第二世境界表（修为继承、阈值更高、基础属性更强） */
export const ASCEND_REALMS: RealmDef[] = [
  { name: "炼虚期", expNeed: 18000, atk: 100, def: 64, hp: 820, mp: 200 },
  { name: "合体期", expNeed: 30000, atk: 130, def: 84, hp: 1080, mp: 260 },
  { name: "大乘期", expNeed: 48000, atk: 165, def: 108, hp: 1400, mp: 320 },
  { name: "渡劫期", expNeed: 72000, atk: 205, def: 135, hp: 1800, mp: 400, tribulation: true },
  { name: "真仙期", expNeed: 100000, atk: 250, def: 165, hp: 2300, mp: 500 },
];

/** 允许飞升次数（= 可开启的第 N 世上限；1 = 仅一次飞升，共二世） */
export const MAX_REINCARNATIONS = 1;

/** 当前所有境界表的最大长度（brokenRealms 数组按此定长，避免越界） */
export const MAX_REALM_LEN = Math.max(REALMS.length, ASCEND_REALMS.length);

/** 根据累计修为推算境界下标 */
export function realmIndexOf(exp: number): number {
  return realmIndexIn(exp, REALMS);
}

/** 通用取境：按累计修为在指定境界表中推算下标（0 ~ table.length-1） */
export function realmIndexIn(exp: number, table: RealmDef[]): number {
  let idx = 0;
  for (let i = 0; i < table.length; i++) {
    if (exp >= table[i].expNeed) idx = i;
  }
  return idx;
}

export interface RealmProgress {
  index: number;
  name: string;
  /** 当前境界内已获得修为 */
  cur: number;
  /** 升到下一境所需（顶级境界返回 0） */
  need: number;
  /** 0~1，顶级境界返回 1 */
  ratio: number;
  maxed: boolean;
}

export function realmProgress(exp: number): RealmProgress {
  const index = realmIndexOf(exp);
  const cur = REALMS[index];
  if (index >= REALMS.length - 1) {
    return { index, name: cur.name, cur: 0, need: 0, ratio: 1, maxed: true };
  }
  const next = REALMS[index + 1];
  const span = next.expNeed - cur.expNeed;
  const got = exp - cur.expNeed;
  return { index, name: cur.name, cur: got, need: span, ratio: span > 0 ? got / span : 1, maxed: false };
}
