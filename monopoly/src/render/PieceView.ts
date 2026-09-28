import type { ElementSpec } from '../skin/instantiate';

export const PAWN_COUNT = 4;

/** 四枚棋子沿格前沿一排（v5 样张 line 319：x + (i-1.5)×gap） */
export function pawnSlots(centerX: number, _hw: number, p: { gap: number }): number[] {
  const out: number[] = [];
  for (let i = 0; i < PAWN_COUNT; i++) out.push(centerX + (i - (PAWN_COUNT - 1) / 2) * p.gap);
  return out;
}

export interface PawnState { index: number; c: number; r: number; x: number; y: number }

/** 生成棋子 spec（第三遍；同格四人用 pawnSlots 横向错开，避免重叠） */
export function pawnSpecs(pawns: PawnState[], geo: { hh: number }, p: { gap: number; frontDy: number }): ElementSpec[] {
  const byCell = new Map<string, PawnState[]>();
  for (const pw of pawns) {
    const k = `${pw.c},${pw.r}`;
    byCell.set(k, [...(byCell.get(k) ?? []), pw]);
  }
  const out: ElementSpec[] = [];
  for (const [, group] of byCell) {
    const { c, r } = group[0];
    const slots = pawnSlots(group[0].x, 0, p);
    group.forEach((pw, i) => {
      void slots;
      /* pawnIndex 供 Scene.resolvePlacement 算 cx（同格错开，v5 样张 line 319） */
      out.push({ id: `piece.p${pw.index + 1}`, slot: null, c, r, pawnIndex: i });
    });
    void geo;
    void p.frontDy;
  }
  return out;
}