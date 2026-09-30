import type { ElementSpec } from '../skin/instantiate';

export const PAWN_COUNT = 4;

/** 四枚棋子沿格前沿一排（v5 样张 line 319：x + (i-1.5)×gap） */
export function pawnSlots(centerX: number, _hw: number, p: { gap: number }): number[] {
  const out: number[] = [];
  for (let i = 0; i < PAWN_COUNT; i++) out.push(centerX + (i - (PAWN_COUNT - 1) / 2) * p.gap);
  return out;
}

/** 棋子表情（spec §6.6）：由动作落库写入（`main.ts` runAction），fx 结束回落 calm */
export type PawnMood = 'calm' | 'happy' | 'sad';

/** 棋子的棋盘位置（屏幕坐标由 Scene 的 resolvePlacement 统一算，这里不存 x/y） */
export interface PawnState {
  index: number;
  c: number;
  r: number;
  /** 三表情：缺省 calm */
  mood?: PawnMood;
  /** 是否当前行动的玩家（脚下暖色光环；AI 棋子无） */
  active?: boolean;
}

/** 同格错开后的落位（`pawnSpecs` 与头顶气泡共用同一分组口径，避免两处漂移） */
export interface PawnPlace {
  pw: PawnState;
  c: number;
  r: number;
  pawnIndex: number;
}

/**
 * 按格分组 → 组内序号。棋子的横向错开由 Scene 按 `pawnIndex` 算，
 * 视图侧只负责「谁和谁同格、谁排第几」。
 */
export function pawnPlaces(pawns: PawnState[]): PawnPlace[] {
  const byCell = new Map<string, PawnState[]>();
  for (const pw of pawns) {
    const k = `${pw.c},${pw.r}`;
    byCell.set(k, [...(byCell.get(k) ?? []), pw]);
  }
  const out: PawnPlace[] = [];
  for (const [, group] of byCell) {
    const { c, r } = group[0];
    group.forEach((pw, pawnIndex) => out.push({ pw, c, r, pawnIndex }));
  }
  return out;
}

/**
 * 生成棋子 spec（第三遍）：同格四人靠 spec.pawnIndex 让 Scene 横向错开，
 * 自己不算坐标（spec §3.7.1「渲染层禁止直接画」）。
 * 造型（`params.style`）按 pid 写在 skin.json（p1 短发 / p2 双马尾 / p3 小帽 / p4 丸子头）。
 */
export function pawnSpecs(pawns: PawnState[]): ElementSpec[] {
  return pawnPlaces(pawns).map(({ pw, c, r, pawnIndex }) => ({
    id: `piece.p${pw.index + 1}`, slot: null, c, r, pawnIndex,
    state: { owner: pw.index + 1, mood: pw.mood ?? 'calm', active: pw.active === true },
  }));
}