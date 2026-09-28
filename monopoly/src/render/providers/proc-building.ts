import type { Graphics } from 'pixi.js';
import { up, win, type Pt } from '../iso';
import { ptsToPoly } from '../paint';
import { BUILDING_HEIGHTS } from '../../skin/registry';
import { arr, fb } from './proc-base';
import type { ProcCtx } from './proc';

type P = Record<string, unknown>;

/** 参数化色值：含插值的模板串由 Task 7 规则豁免（不算写死） */
export function hsl(h: number, s: number, l: number): string {
  return `hsl(${h},${s}%,${l}%)`;
}
export function rgba(r: number, g: number, b: number, a: number): string {
  /* v5 样张的 alpha 一律写作 `.4` / `.17` 形态（去掉前导 0），保持输出一致 */
  return `rgba(${r},${g},${b},${String(a).replace(/^0\./, '.')})`;
}

/**
 * L4 内建兜底：v5 isoShop 的全部色值/几何（spec §3.6.4）。
 * 这是本 preset 唯一允许出现裸字面量的位置；skin.json 的 params 逐键覆盖它。
 */
const D = fb({
  dim: 0.72,
  /* 投影与地面暖光 */
  shDx: 4, shFy: 0.6, shRise: 2, shUpF: 0.5, shadow: 'rgba(0,0,0,.4)',
  glowFy: 1, glowRx: 1, glowRy: 0.8, doorGlow: 'rgba(255,205,120,.17)',
  /* 墙脚压暗 */
  footH: 3, footR: 'rgba(0,0,0,.28)', footL: 'rgba(0,0,0,.34)',
  /* 墙体明度（hue 由 skin.json 给） */
  satL: 32, satR: 36, litL3: 20, litL12: 23, litR3: 28, litR12: 33,
  satRoof: 20, roofLit3: 40, roofLit12: 46,
  /* 楼层分隔线 */
  divT: 0.014, divsL3: [0.36, 0.64], divsL2: [0.46],
  divL: 'rgba(0,0,0,.34)', divR: 'rgba(0,0,0,.28)',
  /* 橱窗玻璃与窗格 */
  gv1: 0.07, gv2L1: 0.6, gv2L23: 0.4,
  glass1: 'rgba(255,205,120,.62)', glass2: 'rgba(255,208,124,.86)', glass3: 'rgba(176,222,246,.62)',
  gU1L: 0.14, gU2L: 0.92, gU1R: 0.08, gU2R: 0.86,
  mull: 'rgba(16,12,8,.8)', mulls: [0.335, 0.53, 0.725], mullW: 0.022, mullShift: 0.075,
  tran: 'rgba(16,12,8,.85)', tranH: 0.025,
  sill: 'rgba(86,58,20,.6)', sillH: 0.055,
  /* 门洞 / 门内暖光 / 门槛石 */
  door: '#231a11', doorU1: 0.565, doorU2: 0.69,
  doorLight: 'rgba(255,196,105,.5)', doorInU1: 0.585, doorInU2: 0.67, doorInV1: 0.04, doorInV2: 0.3,
  stone: '#4a3a26', stoneU1: 0.55, stoneU2: 0.705, stoneV2: 0.03,
  /* L2 上层暖光窗 */
  upUs: [0.2, 0.5, 0.8], upLu: 0.12, upRu: 0.1, upV1: 0.46, upV2: 0.82, upFill: '#ffd479',
  /* L1 坡顶 */
  gableRise: 13, gableSatL: 26, gableLitL: 32, gableSatR: 30, gableLitR: 40,
  ridge: '#e8c05a', ridgeLen: 3, ridgeW: 1.2,
  /* L2+ 女儿墙 */
  parapet: 'rgba(255,255,255,.14)', parapetW: 1.2,
  /* L3 玻璃幕墙 */
  l3Rows: 2, l3V1: 0.42, l3RowStep: 0.26, l3WinH: 0.2,
  l3Cols: 4, l3U1: 0.1, l3UStep: 0.23, l3WinW: 0.18, l3Win: '#9fd8ff', l3WinAlpha: 0.9,
  /* L3 玻璃内透暖光 */
  warm: 'rgba(255,205,130,.4)', warmU1L: 0.18, warmU2L: 0.9,
  warmU1R: 0.12, warmU2R: 0.88, warmV1: 0.13, warmV2: 0.32,
  /* L3 霓虹 */
  neon: '#5ef0c0', neonW: 1.6, neonAlpha: 0.85,
  /* 店招灯箱 */
  signLevel: 1, signV: [0, 0.68, 0.86, 0.84], signH: [0, 0.22, 0.12, 0.08],
  signU1: 0.04, signU2: 0.96, signEdgeH: 45, signEdgeS: 80, signEdgeL: 58, signEdgeW: 0.8,
  signInU1: 0.05, signInU2: 0.95, signInV1: 0.14, signInV2: 0.86,
  signInSat: 58, signInLit: 30, signInAlpha: 0.55,
  signBox: '#141414', signText: '#ffe08a', signFs: 0.66, signMx: 0.5, signMy: 0.5,
  /* 温泉池（v5 line 252–256） */
  poolFy: 1.7, poolRx0: 0.8, poolRy0: 0.62, poolRx1: 0.68, poolRy1: 0.5,
  poolShX: 0.2, poolShY: 0.1, poolShRx: 0.3, poolShRy: 0.2,
  poolRim: '#3b3a33', poolWater: '#2c6a80', poolShine: 'rgba(160,230,255,.28)',
  /* 温泉蒸汽（v5 line 129–137 steam()） */
  steamN: 3, steamDx: 9, steamDy: 2, steamUp: 6,
  steamRx0: 5, steamRy0: 3, steamRyK: 0.6,
  steamDx2: 2, steamUp2: 9, steamDy2: 3, steamRx1: 4, steamRy1: 2.4, steamRyK2: 0.5,
  steam1: 'rgba(255,255,255,.13)', steam2: 'rgba(255,255,255,.09)',
});

export function shop(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, geo, state, params } = ctx;
  const p = params as P;
  const G = (k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (D as P)[k] as number);
  const S = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : (D as P)[k] as string);
  const A = (k: string): number[] => arr<number>(p, k) ?? ((D as P)[k] as number[]);

  const s = ctx.s;
  const levels = (typeof state.level === 'number' ? state.level : G('levels')) as 1 | 2 | 3;
  const hue = G('hue');
  const dk = state.dim === true ? G('dim') : 1;

  const w = geo.hw * s;
  const d = geo.hh * s;
  const h = BUILDING_HEIGHTS[levels] * s;

  const F: Pt = [cx, cy + d];
  const R: Pt = [cx + w, cy];
  const B: Pt = [cx, cy - d];
  const L: Pt = [cx - w, cy];
  const F2 = up(F, h);
  const R2 = up(R, h);
  const B2 = up(B, h);
  const L2 = up(L, h);

  const fill = (pts: Pt[], color: string, alpha = 1): void => {
    g.poly(ptsToPoly(pts)).fill({ color, alpha });
  };
  const line = (a: Pt, b: Pt, color: string, width: number): void => {
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color, width });
  };

  const wallL = hsl(hue, G('satL'), (levels === 3 ? G('litL3') : G('litL12')) * dk);
  const wallR = hsl(hue, G('satR'), (levels === 3 ? G('litR3') : G('litR12')) * dk);
  const roofC = hsl(hue, G('satRoof'), (levels === 3 ? G('roofLit3') : G('roofLit12')) * dk);

  /* ① 落地投影 + 门口暖光（v5 line 152–153） */
  fill([
    [cx + G('shDx') * s, cy + d * G('shFy')],
    [cx + w + G('shDx') * s, cy + G('shRise') * s],
    [cx + G('shDx') * s, cy - d * G('shUpF')],
    [cx - w + G('shDx') * s, cy + G('shRise') * s],
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy')).fill({ color: S('doorGlow') });

  /* ② 两面墙（右墙亮、左墙暗） */
  fill([F, R, R2, F2], wallR);
  fill([L, F, F2, L2], wallL);

  /* ③ 墙脚压暗 */
  fill([F, R, up(R, G('footH') * s), up(F, G('footH') * s)], S('footR'));
  fill([L, F, up(F, G('footH') * s), up(L, G('footH') * s)], S('footL'));

  /* ④ 楼层分隔线：把一整面墙切成层 */
  if (levels >= 2) {
    const vs = A(levels === 3 ? 'divsL3' : 'divsL2');
    for (const v of vs) {
      fill(win(L, F, h, 0, 1, v, v + G('divT')), S('divL'));
      fill(win(F, R, h, 0, 1, v, v + G('divT')), S('divR'));
    }
  }

  /* ⑤ 一层橱窗：玻璃 + 竖框 ×3 + 横梁 + 台度（v5 line 168–183） */
  const gv1 = G('gv1');
  const gv2 = levels === 1 ? G('gv2L1') : G('gv2L23');
  const gw = levels === 1 ? S('glass1') : levels === 3 ? S('glass3') : S('glass2');
  fill(win(L, F, h, G('gU1L'), G('gU2L'), gv1, gv2), gw);
  fill(win(F, R, h, G('gU1R'), G('gU2R'), gv1, gv2), gw);
  for (const u of A('mulls')) {
    fill(win(L, F, h, u, u + G('mullW'), gv1, gv2), S('mull'));
    fill(win(F, R, h, u - G('mullShift'), u - G('mullShift') + G('mullW'), gv1, gv2), S('mull'));
  }
  fill(win(L, F, h, G('gU1L'), G('gU2L'), gv2 - G('tranH'), gv2), S('tran'));
  fill(win(F, R, h, G('gU1R'), G('gU2R'), gv2 - G('tranH'), gv2), S('tran'));
  fill(win(L, F, h, G('gU1L'), G('gU2L'), gv1, gv1 + G('sillH')), S('sill'));
  fill(win(F, R, h, G('gU1R'), G('gU2R'), gv1, gv1 + G('sillH')), S('sill'));

  /* ⑥ 门：门洞 + 内透暖光 + 门槛石（v5 line 185–187） */
  fill(win(L, F, h, G('doorU1'), G('doorU2'), 0, gv2), S('door'));
  fill(win(L, F, h, G('doorInU1'), G('doorInU2'), G('doorInV1'), G('doorInV2')), S('doorLight'));
  fill(win(L, F, h, G('stoneU1'), G('stoneU2'), 0, G('stoneV2')), S('stone'));

  /* ⑦ 上层窗：L2 三扇暖光（v5 line 189–193；L3 换成玻璃幕墙） */
  if (levels === 2) {
    for (const u of A('upUs')) {
      fill(win(L, F, h, u - G('upLu'), u + G('upRu'), G('upV1'), G('upV2')), S('upFill'));
      fill(win(F, R, h, u - G('upLu'), u + G('upRu'), G('upV1'), G('upV2')), S('upFill'));
    }
  } else if (levels === 3) {
    /* L3 玻璃幕墙：底层内透暖光（v5 line 172–175） */
    fill(win(L, F, h, G('warmU1L'), G('warmU2L'), G('warmV1'), G('warmV2')), S('warm'));
    fill(win(F, R, h, G('warmU1R'), G('warmU2R'), G('warmV1'), G('warmV2')), S('warm'));
    for (let r = 0; r < G('l3Rows'); r++) {
      const v1 = G('l3V1') + r * G('l3RowStep');
      for (let i = 0; i < G('l3Cols'); i++) {
        const u = G('l3U1') + i * G('l3UStep');
        g.poly(ptsToPoly(win(L, F, h, u, u + G('l3WinW'), v1, v1 + G('l3WinH'))))
          .fill({ color: S('l3Win'), alpha: G('l3WinAlpha') });
        g.poly(ptsToPoly(win(F, R, h, u, u + G('l3WinW'), v1, v1 + G('l3WinH'))))
          .fill({ color: S('l3Win'), alpha: G('l3WinAlpha') });
      }
    }
  }

  /* ⑧ 屋顶 */
  fill([L2, B2, R2, F2], roofC);
  if (levels === 1) {
    const apex: Pt = [cx, cy - h - G('gableRise') * s];
    fill([L2, F2, apex], hsl(hue, G('gableSatL'), G('gableLitL') * dk));
    fill([F2, R2, apex], hsl(hue, G('gableSatR'), G('gableLitR') * dk));
    line(apex, up(apex, G('ridgeLen') * s), S('ridge'), G('ridgeW') * s);
  } else {
    g.poly(ptsToPoly([L2, B2, R2, F2])).stroke({ color: S('parapet'), width: G('parapetW') * s });
    if (levels === 3) {
      g.poly(ptsToPoly([L2, B2, R2, F2])).stroke({ color: S('neon'), width: G('neonW') * s, alpha: G('neonAlpha') });
    }
  }

  /* ⑨ 温泉池 + 蒸汽（v5 line 252–258）：只给 showcase 的温泉馆，棋盘楼不带 */
  if (p.pool === true || state.pool === true) {
    const py = cy + d * G('poolFy');
    g.ellipse(cx, py, w * G('poolRx0'), d * G('poolRy0')).fill({ color: S('poolRim') });
    g.ellipse(cx, py, w * G('poolRx1'), d * G('poolRy1')).fill({ color: S('poolWater') });
    g.ellipse(cx - w * G('poolShX'), py - d * G('poolShY'), w * G('poolShRx'), d * G('poolShRy')).fill({ color: S('poolShine') });
  }
  if (p.steam === true || state.steam === true) {
    for (let i = 0; i < G('steamN'); i++) {
      const sx = cx + (i - 1) * G('steamDx') * s;
      const sy = cy - h - G('steamUp') * s - i * G('steamDy') * s;
      g.ellipse(sx, sy, (G('steamRx0') + i) * s, (G('steamRy0') + i * G('steamRyK')) * s).fill({ color: S('steam1') });
      g.ellipse(sx + G('steamDx2') * s, sy - G('steamUp2') * s - i * G('steamDy2') * s,
        (G('steamRx1') + i) * s, (G('steamRy1') + i * G('steamRyK2')) * s).fill({ color: S('steam2') });
    }
  }
}

/**
 * 店招：沿右墙的斜面灯箱 + 随等距角度旋转的汉字（v5 line 232–241）。
 * 文字角度 = -atan2(d, w)·180/π ≈ -26.57°，与墙面同一透视。
 */
export function sign(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, geo, params, state } = ctx;
  const p = params as P;
  const G = (k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (D as P)[k] as number);
  const S = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : (D as P)[k] as string);
  const LV = (k: string): number[] => arr<number>(p, k) ?? ((D as P)[k] as number[]);

  const s = ctx.s;
  const levels = (typeof state.level === 'number' ? state.level : G('signLevel')) as 1 | 2 | 3;
  const w = geo.hw * s;
  const d = geo.hh * s;
  const h = BUILDING_HEIGHTS[levels] * s;
  /* 还原宿主楼基座：cy 已被管线抬升 atV×hostHeight，从 y0 起算才与墙面同一坐标系 */
  const y0 = cy + (ctx.lift ?? 0) * s;
  const F: Pt = [cx, y0 + d];
  const R: Pt = [cx + w, y0];

  const v1 = LV('signV')[levels];
  const vh = LV('signH')[levels];
  const bh = vh * h;

  g.poly(ptsToPoly(win(F, R, h, G('signU1'), G('signU2'), v1, v1 + vh)))
    .fill({ color: S('signBox') })
    .stroke({ color: hsl(G('signEdgeH'), G('signEdgeS'), G('signEdgeL')), width: G('signEdgeW') * s });
  g.poly(ptsToPoly(win(F, R, h, G('signInU1'), G('signInU2'), v1 + vh * G('signInV1'), v1 + vh * G('signInV2'))))
    .fill({ color: hsl(G('signEdgeH'), G('signInSat'), G('signInLit')), alpha: G('signInAlpha') });

  const brand = typeof p.brand === 'string' ? (p.brand as string) : null;
  if (brand) {
    const mx = cx + w * G('signMx');
    const my = y0 + d * G('signMy') - h * (v1 + vh / 2);
    const ang = (-Math.atan2(d, w) * 180) / Math.PI;
    ctx.text?.({ text: brand, x: mx, y: my, size: bh * G('signFs'), fill: S('signText'), rotate: ang });
  }
}