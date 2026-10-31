/**
 * 竞技场数据：镜像对手生成 + 本地排行榜（离线兜底）+ 积分规则（ELO 强度加权）。
 * 对手属性以玩家当前属性为基准做镜像缩放（×强度倍率），真实对战复用 Game 内 calcDamage 结算。
 */
import { REALMS } from "./realms";
import { makeRng } from "../core/Rng";

export interface ArenaOpponent {
  id: string;
  nickname: string;
  realmIndex: number;
  atk: number;
  def: number;
  maxHp: number;
  source: "board" | "leaderboard";
  /** 用于 ELO 结算的对手评分（来自其排行榜积分）；缺省时视为与玩家同分 */
  rating?: number;
}

export interface ArenaBoardEntry {
  nickname: string;
  realmIndex: number;
  points: number;
}

export const ARENA_START_POINTS = 1000;
export const ARENA_MIN_POINTS = 100;
/** ELO K 因子：单场最大变动基准 */
export const ARENA_K = 28;
/** 单场积分变动下限 / 上限（绝对值） */
export const ARENA_MIN_DELTA = 5;
export const ARENA_MAX_DELTA = 44;
/** ELO 评分跨度（点数差 / 该值 = 一个数量级） */
export const ARENA_ELO_SCALE = 220;
/** 本地排行榜对手数（离线兜底） */
export const ARENA_BOARD_SIZE = 12;

// 离线兜底昵称池（循环复用）
const SYNTH: string[] = [
  "玄霜真人", "赤焰散人", "青云弟子", "血河老祖", "无名剑客", "碧落仙子",
  "凌霄剑尊", "紫电真人", "幽月仙子", "苍梧散人", "赤焰童子", "太虚上人",
];

/** ELO 期望胜率：玩家评分 vs 对手评分 */
export function arenaExpected(playerPts: number, oppPts: number): number {
  return 1 / (1 + Math.pow(10, (oppPts - playerPts) / ARENA_ELO_SCALE));
}

/** 根据双方评分与胜负计算积分变动（胜为正、负为负，幅度受 ARENA_MIN/MAX_DELTA 夹取） */
export function arenaDelta(playerPts: number, oppPts: number, win: boolean): number {
  const p = arenaExpected(playerPts, oppPts);
  const raw = ARENA_K * (win ? 1 - p : -p);
  const mag = Math.max(ARENA_MIN_DELTA, Math.min(ARENA_MAX_DELTA, Math.round(Math.abs(raw))));
  return win ? mag : -mag;
}

/** 按境界 + 种子生成对手属性（线性缩放 + 轻微随机）——用于展示/兜底 */
export function buildOpponent(seed: number, realmIndex: number, nickname: string, source: ArenaOpponent["source"]): ArenaOpponent {
  const r = makeRng((seed >>> 0) ^ 0x51a3e);
  const ri = Math.max(0, Math.min(REALMS.length - 1, realmIndex));
  const base = REALMS[ri];
  const hp = (base as any).hp ?? 60;
  const j = 0.9 + r() * 0.2; // 0.9~1.1
  return {
    id: `opp-${seed >>> 0}`,
    nickname,
    realmIndex: ri,
    atk: Math.max(1, Math.round((12 + base.atk * 1.15) * j)),
    def: Math.max(1, Math.round((6 + base.def * 1.15) * j)),
    maxHp: Math.max(20, Math.round((80 + hp * 1.2) * j)),
    source,
  };
}

/** 镜像对手：以玩家当前属性为基准 × 强度倍率（mult）生成，确定性可复现 */
export function buildMirrorOpponent(
  seed: number,
  base: { atk: number; def: number; maxHp: number },
  mult: number,
  realmIndex: number,
  nickname: string,
  source: ArenaOpponent["source"],
): ArenaOpponent {
  const r = makeRng((seed >>> 0) ^ 0x9c2f1);
  const j = 0.92 + r() * 0.16; // 0.92~1.08
  const ri = Math.max(0, Math.min(REALMS.length - 1, realmIndex));
  return {
    id: `mirror-${seed >>> 0}`,
    nickname,
    realmIndex: ri,
    atk: Math.max(1, Math.round(base.atk * mult * j)),
    def: Math.max(1, Math.round(base.def * mult * j)),
    maxHp: Math.max(20, Math.round(base.maxHp * mult * j)),
    source,
  };
}

/** 由排名差推导镜像强度倍率：对手评分越高，倍率越大（0.7~1.3） */
export function mirrorMult(playerPts: number, oppPts: number): number {
  return Math.max(0.7, Math.min(1.3, 0.75 + (oppPts - playerPts) / 900));
}

/** 离线兜底：生成竞技场本地排行榜（对手池，积分宽幅分布、境界随排名递增） */
export function seedArenaBoard(): ArenaBoardEntry[] {
  const out: ArenaBoardEntry[] = [];
  const lo = 700;
  const hi = 2700;
  for (let i = 0; i < ARENA_BOARD_SIZE; i++) {
    const points = Math.round(lo + (i * (hi - lo)) / (ARENA_BOARD_SIZE - 1));
    const realmIndex = Math.round((i / (ARENA_BOARD_SIZE - 1)) * (REALMS.length - 1));
    out.push({ nickname: SYNTH[i % SYNTH.length], realmIndex, points });
  }
  return out;
}
