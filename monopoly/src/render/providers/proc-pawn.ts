import type { Graphics } from 'pixi.js';
import type { ProcCtx } from './proc';

/**
 * 等距小柱棋子（v5 样张 line 263–272 移植）：影 + 左墙 + 右墙 + 顶面 + 高光 + 字。
 * 尺寸/透明度/颜色来自 params 与 state.color。
 */
export function pawn(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, params, state } = ctx;
  const p = params as Record<string, unknown>;
  const n = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
  const c = (k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);
  const color = typeof state.color === 'string' ? state.color : c('color', '#ffffff');
  const s = ctx.s;
  const h = n('h', 13) * s;
  const w = n('w', 4.2) * s;
  const d = n('d', 2.1) * s;
  const F: [number, number] = [cx, cy + d];
  const R: [number, number] = [cx + w, cy];
  const L: [number, number] = [cx - w, cy];
  const B: [number, number] = [cx, cy - d];
  const up = (q: [number, number], by: number): [number, number] => [q[0], q[1] - by];

  g.ellipse(cx, cy + n('shadowY', 2), n('shadowRx', 6) * s, n('shadowRy', 3) * s)
    .fill({ color: c('shadow', '#000000'), alpha: n('shadowAlpha', 0.38) });
  g.poly([...F, ...R, ...up(R, h), ...up(F, h)]).fill({ color });
  g.poly([...L, ...F, ...up(F, h), ...up(L, h)]).fill({ color, alpha: n('leftAlpha', 0.72) });
  g.poly([...up(L, h), ...up(F, h), ...up(R, h), ...up(B, h)]).fill({ color: c('topFill', '#ffffff'), alpha: n('topAlpha', 0.18) });
  g.ellipse(cx, cy - h + d * n('topDy', 0.1), w * n('topRx', 0.9), d * n('topRy', 0.9))
    .fill({ color: c('glowFill', '#ffffff'), alpha: n('topGlowAlpha', 0.2) });
}