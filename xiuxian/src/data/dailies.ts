/**
 * 日常任务：按日期播种轮换（确定性）。rollDailies 用日期字符串作随机种子，
 * 同一天结果稳定、跨天刷新；测试可注入日期保证可复现。
 */
import { makeRng } from "../core/Rng";

export type DailyKind = "kill" | "forge" | "quest" | "earn" | "alchemy";

export interface DailyDef {
  id: string;
  name: string;
  desc: string;
  kind: DailyKind;
  /** 目标数量 */
  goal: number;
  reward: { exp?: number; stones?: number };
}

export const DAILY_POOL: DailyDef[] = [
  { id: "d_kill6", name: "巡山", desc: "击杀 6 只妖兽", kind: "kill", goal: 6, reward: { exp: 60 } },
  { id: "d_kill12", name: "清剿", desc: "击杀 12 只妖兽", kind: "kill", goal: 12, reward: { exp: 120, stones: 40 } },
  { id: "d_forge1", name: "炼器", desc: "成功炼器 1 次", kind: "forge", goal: 1, reward: { stones: 80 } },
  { id: "d_forge3", name: "淬炼", desc: "成功炼器 3 次", kind: "forge", goal: 3, reward: { stones: 160 } },
  { id: "d_quest1", name: "了却事务", desc: "完成 1 个任务", kind: "quest", goal: 1, reward: { exp: 100 } },
  { id: "d_earn200", name: "开源", desc: "赚取 200 灵石", kind: "earn", goal: 200, reward: { stones: 60 } },
  { id: "d_earn500", name: "广进", desc: "赚取 500 灵石", kind: "earn", goal: 500, reward: { stones: 120 } },
];

/** 日期字符串 → 稳定 hash 种子 */
function hashDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 每日任务数量 */
export const DAILY_COUNT = 3;

/** 纯函数：按日期播种 DAILY_COUNT 个不重复日常 id */
export function rollDailies(date: string): string[] {
  const rng = makeRng(hashDate(date) ^ 0x9e3779b9);
  const pool = [...DAILY_POOL];
  const out: string[] = [];
  while (out.length < DAILY_COUNT && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool[i].id);
    pool.splice(i, 1);
  }
  return out;
}

export function getDaily(id: string): DailyDef | undefined {
  return DAILY_POOL.find((d) => d.id === id);
}
