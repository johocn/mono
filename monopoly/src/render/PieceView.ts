import type { ElementSpec } from '../skin/instantiate';

export const PAWN_COUNT = 4;

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
  /** 同格人数：Scene 用它决定「居中 / 单排 / 2×2 方阵」 */
  pawnCount: number;
}

/**
 * 按格分组 → 组内序号 + 组大小。棋子的错开由 Scene 按 `pawnIndex` / `pawnCount` 算，
 * 视图侧只负责「谁和谁同格、谁排第几、同格几个人」。
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
    const count = group.length;
    group.forEach((pw, pawnIndex) => out.push({ pw, c, r, pawnIndex, pawnCount: count }));
  }
  return out;
}

/**
 * 生成棋子 spec（第三遍）：同格多人靠 spec.pawnIndex / pawnCount 让 Scene 错开，
 * 自己不算坐标（spec §3.7.1「渲染层禁止直接画」）。
 * 造型（`params.style`）按 pid 写在 skin.json（p1 悟空 / p2 八戒 / p3 悟净 / p4 三藏）。
 */
export function pawnSpecs(pawns: PawnState[]): ElementSpec[] {
  return pawnPlaces(pawns).map(({ pw, c, r, pawnIndex, pawnCount }) => ({
    id: `piece.p${pw.index + 1}`, slot: null, c, r, pawnIndex, pawnCount,
    state: { owner: pw.index + 1, mood: pw.mood ?? 'calm', active: pw.active === true },
  }));
}