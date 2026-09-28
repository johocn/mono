import type { ElementSpec } from '../skin/instantiate';

export const PAWN_COUNT = 4;

/** 四枚棋子沿格前沿一排（v5 样张 line 319：x + (i-1.5)×gap） */
export function pawnSlots(centerX: number, _hw: number, p: { gap: number }): number[] {
  const out: number[] = [];
  for (let i = 0; i < PAWN_COUNT; i++) out.push(centerX + (i - (PAWN_COUNT - 1) / 2) * p.gap);
  return out;
}

/** 棋子的棋盘位置（屏幕坐标由 Scene 的 resolvePlacement 统一算，这里不存 x/y） */
export interface PawnState { index: number; c: number; r: number }

/**
 * 生成棋子 spec（第三遍）：同格四人靠 spec.pawnIndex 让 Scene 横向错开，
 * 自己不算坐标（spec §3.7.1「渲染层禁止直接画」）。
 */
export function pawnSpecs(pawns: PawnState[]): ElementSpec[] {
  const byCell = new Map<string, PawnState[]>();
  for (const pw of pawns) {
    const k = `${pw.c},${pw.r}`;
    byCell.set(k, [...(byCell.get(k) ?? []), pw]);
  }
  const out: ElementSpec[] = [];
  for (const [, group] of byCell) {
    const { c, r } = group[0];
    group.forEach((pw, i) => {
      out.push({ id: `piece.p${pw.index + 1}`, slot: null, c, r, pawnIndex: i });
    });
  }
  return out;
}