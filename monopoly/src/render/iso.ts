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
export function hostHeight(level: 1 | 2 | 3, heights: Record<number, number>): number {
  return heights[level];
}