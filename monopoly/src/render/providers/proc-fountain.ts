import type { Graphics } from 'pixi.js';
import type { ProcCtx } from './proc';

/**
 * 中心喷泉广场（v5 样张 line 322–333 移植）：
 * 5 层同心椭圆 + 两道水弧 + 顶珠。所有半径比例/色值来自 params。
 */
export function fountain(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, params } = ctx;
  const p = params as Record<string, unknown>;
  const n = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
  const c = (k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);
  const rings = (p.rings ?? []) as Array<{ rx: number; ry: number; fill: string }>;
  for (const r of rings) g.ellipse(cx, cy, r.rx, r.ry).fill({ color: r.fill });
  const pool = (p.pool ?? null) as { dx: number; dy: number; rx: number; ry: number; fill: string } | null;
  if (pool) g.ellipse(cx + pool.dx, cy + pool.dy, pool.rx, pool.ry).fill({ color: pool.fill });
  const col = (p.column ?? null) as { w: number; dy: number; h: number; leftFill: string; rightFill: string } | null;
  if (col) {
    g.poly([cx, cy, cx + col.w, cy - col.dy, cx + col.w, cy - col.dy - col.h, cx, cy - col.h - col.dy])
      .fill({ color: col.rightFill });
    g.poly([cx, cy, cx - col.w, cy - col.dy, cx - col.w, cy - col.dy - col.h, cx, cy - col.h - col.dy])
      .fill({ color: col.leftFill });
    g.ellipse(cx, cy - col.h - col.dy, n('capRx', 1), n('capRy', 1)).fill({ color: c('capFill', '#ffffff') });
  }
  const arcs = (p.arcs ?? []) as Array<{ sign: number; dx: number; dy: number; span: number }>;
  for (const a of arcs) {
    g.moveTo(cx, cy - n('spoutY', 0));
    g.quadraticCurveTo(cx + a.sign * a.dx, cy - a.dy, cx + a.sign * a.span, cy);
    g.stroke({ color: c('arcColor', '#ffffff'), width: n('arcW', 1) });
  }
  g.circle(cx, cy - n('beadY', 0), n('beadR', 1)).fill({ color: c('beadFill', '#ffffff') });
}