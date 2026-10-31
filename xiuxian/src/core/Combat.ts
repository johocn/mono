/**
 * 战斗纯函数：伤害公式与 buff 管理。
 * 不依赖引擎，可独立单测；运行时由 Actor/Monster 调用。
 */
import type { Rng } from "./Rng";
import type { ElementKind } from "../data/elements";

export interface DamageInput {
  atk: number;
  def: number;
  /** 技能伤害系数（普攻=1） */
  power: number;
  critRate: number;
  critMul: number;
  rng: Rng;
}

export interface DamageResult {
  dmg: number;
  crit: boolean;
}

/**
 * 伤害公式：攻方 atk*power 对 守方 def 做减伤，再叠 0.9~1.1 浮动与暴击。
 * 减伤曲线 100/(100+def)：def 100 时减半，保证防御有感知但不会无敌。
 */
export function calcDamage(input: DamageInput): DamageResult {
  const { atk, def, power, critRate, critMul, rng } = input;
  const base = Math.max(1, atk * power) * (100 / (100 + Math.max(0, def)));
  const jitter = 0.9 + rng() * 0.2;
  const crit = rng() < critRate;
  const dmg = Math.max(1, Math.round(base * jitter * (crit ? critMul : 1)));
  return { dmg, crit };
}

export type BuffKind = "shield" | "haste" | "defUp" | "stun" | "lifesteal" | "hot" | "atkUp" | "slow" | "burn" | "shock" | "wet" | "chill" | "frozen" | "crystalCap";

export interface Buff {
  kind: BuffKind;
  /** 护盾吸收量 / 增益数值 / 每秒回复量 */
  value: number;
  /** 剩余时间（秒） */
  t: number;
  /** 整局持久（秘境遗物）：跨层保留，死亡清空，区别于每层临时增益 */
  persistent?: boolean;
  /** 结晶护盾元素集合（火/水/雷/冰）：可多元素共存，用于护盾配色与来袭元素抗性，有叠层上限 */
  elems?: ElementKind[];
}

/** 同名 buff 刷新为更长的剩余时间 */
export function addBuff(list: Buff[], buff: Buff): void {
  const exist = list.find((b) => b.kind === buff.kind);
  if (exist) {
    exist.value = Math.max(exist.value, buff.value);
    exist.t = Math.max(exist.t, buff.t);
  } else {
    list.push({ ...buff });
  }
}

export function tickBuffs(list: Buff[], dt: number): Buff[] {
  const expired: Buff[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t -= dt;
    if (list[i].t <= 0) {
      expired.push(list[i]);
      list.splice(i, 1);
    }
  }
  return expired;
}

export function shieldValue(list: Buff[]): number {
  return list.reduce((sum, b) => (b.kind === "shield" ? sum + b.value : sum), 0);
}

export function consumeShield(list: Buff[], dmg: number): { dealt: number; absorbed: number } {
  let left = dmg;
  let absorbed = 0;
  for (const b of list) {
    if (b.kind !== "shield" || left <= 0) continue;
    const use = Math.min(b.value, left);
    b.value -= use;
    left -= use;
    absorbed += use;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].kind === "shield" && list[i].value <= 0) list.splice(i, 1);
  }
  return { dealt: left, absorbed };
}

export function hasteMul(list: Buff[]): number {
  let mul = 1;
  for (const b of list) if (b.kind === "haste") mul = Math.max(mul, b.value);
  return mul;
}

export function defBonus(list: Buff[]): number {
  let v = 0;
  for (const b of list) if (b.kind === "defUp") v = Math.max(v, b.value);
  return v;
}

/** 自身攻击增益总和口径取最强 atkUp（护体金光等） */
export function atkBonus(list: Buff[]): number {
  let v = 0;
  for (const b of list) if (b.kind === "atkUp") v = Math.max(v, b.value);
  return v;
}

/** 减速倍率（寒冰掌/虚剑等）：取最强 slow（值=速度倍率，越小越慢），默认 1 */
export function slowMul(list: Buff[]): number {
  let mul = 1;
  for (const b of list) if (b.kind === "slow") mul = Math.min(mul, b.value);
  return mul;
}

export function isStunned(list: Buff[]): boolean {
  return list.some((b) => b.kind === "stun" && b.t > 0);
}

/** 每秒持续回复总量（回春术等） */
export function hotValue(list: Buff[]): number {
  return list.reduce((sum, b) => (b.kind === "hot" ? sum + b.value : sum), 0);
}
