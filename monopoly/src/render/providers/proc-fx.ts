/* 取值器从依赖零的 proc-base.ts 取（与 proc-hud / proc-building 同规），
   避免 proc ↔ proc-fx 循环求值导致 PROC_PRESETS 里拿到未初始化的 preset 绑定 */
import { fb, num, str } from './proc-base';
import type { ProcPreset } from './proc';

/** fx.* 的 L4 内建兜底默认值（spec §3.6.4）：全部几何/色值集中声明一次 */
export const FX_D = fb({
  /* 金币：金饼 + 亮环 + 高光 */
  coinR: 7, coinFill: '#f5c451', coinRim: '#c9a03f', coinEdgeW: 1.4,
  coinShineR: 2.4, coinShine: '#fff3c9', coinShineAlpha: 0.85,
  /* 盖章：红印 + 内圈 */
  stampW: 26, stampH: 26, stampR: 4, stampFill: 'rgba(214,64,64,.92)',
  stampEdge: '#ffe2e2', stampEdgeW: 1.6, stampInset: 5,
  /* 落尘：柔光小圆 */
  dustR: 3.2, dustFill: 'rgba(214,224,214,.75)',
  /* 脚手架：竖横杆网格 */
  scaffoldW: 30, scaffoldH: 34, scaffoldBar: 2, scaffoldR: 2,
  scaffoldFill: '#d9a256', scaffoldEdge: '#8a6a34', scaffoldEdgeW: 1,
  /* 火花：十字四星 */
  sparkR: 7, sparkFill: '#fff6d0',
  /* 碎片：菱形脉冲块 */
  shardW: 8, shardH: 12, shardFill: '#8fe3ff', shardAlpha: 0.9,
  /* 高光：横扫亮条 */
  shineW: 12, shineH: 30, shineFill: 'rgba(255,255,255,.6)',
});

const G = (p: Record<string, unknown>, k: keyof typeof FX_D): number => num(p, k, FX_D[k] as number);
const S = (p: Record<string, unknown>, k: keyof typeof FX_D): string => str(p, k, FX_D[k] as string);

/* —— 金币：金饼 + 描边 + 右上高光 —— */
export const fxCoin: ProcPreset = (g, ctx) => {
  const { cx, cy, params, s } = ctx;
  const r = G(params, 'coinR') * s;
  g.circle(cx, cy, r)
    .fill({ color: S(params, 'coinFill') })
    .stroke({ color: S(params, 'coinRim'), width: G(params, 'coinEdgeW') });
  g.circle(cx - r * 0.5, cy - r * 0.5, G(params, 'coinShineR') * s)
    .fill({ color: S(params, 'coinShine'), alpha: G(params, 'coinShineAlpha') });
};

/* —— 盖章：旋转红印（旋转由 fx.ts 施加在容器上）+ 内圈 —— */
export const fxStamp: ProcPreset = (g, ctx) => {
  const { cx, cy, params, s } = ctx;
  const w = G(params, 'stampW') * s;
  const h = G(params, 'stampH') * s;
  const inset = G(params, 'stampInset') * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'stampR'))
    .fill({ color: S(params, 'stampFill') })
    .stroke({ color: S(params, 'stampEdge'), width: G(params, 'stampEdgeW') });
  g.rect(cx - w / 2 + inset, cy - h / 2 + inset, w - inset * 2, h - inset * 2)
    .stroke({ color: S(params, 'stampEdge'), width: G(params, 'stampEdgeW') });
};

/* —— 落尘：柔光小圆 —— */
export const fxDust: ProcPreset = (g, ctx) => {
  const { cx, cy, params, s } = ctx;
  g.circle(cx, cy, G(params, 'dustR') * s).fill({ color: S(params, 'dustFill') });
};

/* —— 脚手架：3 竖 + 3 横杆（施工中） —— */
export const fxScaffold: ProcPreset = (g, ctx) => {
  const { cx, cy, params, s } = ctx;
  const w = G(params, 'scaffoldW') * s;
  const h = G(params, 'scaffoldH') * s;
  const bar = G(params, 'scaffoldBar') * s;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  for (let i = 0; i < 3; i++) {
    const x = x0 + (w * i) / 2 - (i === 0 ? 0 : bar);
    g.rect(x, y0, bar, h).fill({ color: S(params, 'scaffoldFill') });
  }
  for (let j = 0; j < 3; j++) {
    const y = y0 + (h * j) / 2 - (j === 0 ? 0 : bar);
    g.rect(x0, y, w, bar).fill({ color: S(params, 'scaffoldFill') });
  }
  g.roundRect(x0, y0, w, h, G(params, 'scaffoldR'))
    .stroke({ color: S(params, 'scaffoldEdge'), width: G(params, 'scaffoldEdgeW') });
};

/* —— 火花：中心圆 + 上下左右四星点 —— */
export const fxSpark: ProcPreset = (g, ctx) => {
  const { cx, cy, params, s } = ctx;
  const r = G(params, 'sparkR') * s;
  const fill = S(params, 'sparkFill');
  g.circle(cx, cy, r * 0.5).fill({ color: fill });
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    g.circle(cx + dx * r, cy + dy * r, r * 0.5).fill({ color: fill });
  }
};

/* —— 碎片：菱形脉冲块 —— */
export const fxShard: ProcPreset = (g, ctx) => {
  const { cx, cy, params, s } = ctx;
  const w = G(params, 'shardW') * s;
  const h = G(params, 'shardH') * s;
  g.poly([cx, cy - h / 2, cx + w / 2, cy, cx, cy + h / 2, cx - w / 2, cy])
    .fill({ color: S(params, 'shardFill'), alpha: G(params, 'shardAlpha') });
};

/* —— 高光：横扫亮条（缩放/位移由 fx.ts 施加） —— */
export const fxShine: ProcPreset = (g, ctx) => {
  const { cx, cy, params, s } = ctx;
  const w = G(params, 'shineW') * s;
  const h = G(params, 'shineH') * s;
  g.rect(cx - w / 2, cy - h / 2, w, h).fill({ color: S(params, 'shineFill') });
};