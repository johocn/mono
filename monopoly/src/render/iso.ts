import {
  BOARD_COLS, BOARD_ROWS, RING_SIZE, ringPath, type BuildLevel,
} from '../data/board';

export interface Geo { hw: number; hh: number; ox: number; oy: number }

export type Pt = [number, number];

/** 棋盘 (c,r) → 舞台像素（v5 样张 line 48） */
export function ipos(c: number, r: number, g: Geo): Pt {
  return [g.ox + (c - r) * g.hw, g.oy + (c + r) * g.hh];
}

/** 菱形地砖四点（左下→右→上→左），lift 为正 = 上移 */
export function dia(cx: number, cy: number, hw: number, hh: number, lift = 0): Pt[] {
  return [
    [cx, cy + hh - lift],
    [cx + hw, cy - lift],
    [cx, cy - hh - lift],
    [cx - hw, cy - lift],
  ];
}

/** 只改 y 的上移 */
export function up(p: Pt, h: number): Pt {
  return [p[0], p[1] - h];
}

/** 墙面上开窗：P0→P1 为墙面底边，h 为墙高，u/v 为 0–1 参数 */
export function win(P0: Pt, P1: Pt, h: number, u1: number, u2: number, v1: number, v2: number): Pt[] {
  const f = (u: number, v: number): Pt => [
    P0[0] + u * (P1[0] - P0[0]),
    P0[1] + u * (P1[1] - P0[1]) - v * h,
  ];
  return [f(u1, v1), f(u2, v1), f(u2, v2), f(u1, v2)];
}

/** 深度排序主键：c + r 小者（远处）先画 */
export function depthKey(c: number, r: number): number {
  return c + r;
}

/** 深度排序比较器（v5 样张 line 280） */
export function compareDepth(a: { c: number; r: number }, b: { c: number; r: number }): number {
  return (a.c + a.r) - (b.c + b.r) || a.c - b.c;
}

/** 层级 → 墙高（高度表由注册表/皮肤传入） */
export function hostHeight(level: BuildLevel, heights: Record<number, number>): number {
  return heights[level];
}

/* —— M19-D2 屏幕反查：像素 → 格号（命中容差外返回 null） —— */

/** 反查视图参数：几何 + 命中容差（容差由 layout.TILE_PICK_TOL 提供，避免裸常数） */
export interface TilePickView {
  geo: Geo;
  tol: number;
}

const PICK_RING = ringPath(BOARD_COLS, BOARD_ROWS);

/**
 * 取距 (px, py) **最近**的格心；若最近距离仍在 `tol` 内则返回其格号，否则返回 null。
 * 纯函数、无副作用；用于透明 DOM 命中层把点击像素反解为棋盘格号。
 */
export function tileAtPoint(px: number, py: number, view: TilePickView): number | null {
  const { geo, tol } = view;
  let best: number | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < RING_SIZE; i++) {
    const [c, r] = PICK_RING[i] ?? [0, 0];
    const [x, y] = ipos(c, r, geo);
    const d = Math.hypot(px - x, py - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= tol ? best : null;
}