import type { Graphics } from 'pixi.js';
import { up, win, type Geo, type Pt } from '../iso';
import { ptsToPoly } from '../paint';
import { BUILDING_HEIGHTS } from '../../skin/registry';
import { arr, c, fb } from './proc-base';
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
 * 这是本文件唯一允许出现裸字面量的位置；skin.json / theme.json 的 params 逐键覆盖它。
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
  glass1: 'rgba(255,205,120,.62)', glass2: 'rgba(255,208,124,.86)',
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
  /* 屋顶双坡的明暗分面（palette 给了 roof 键时用 alpha 区分，不再另算色） */
  roofFacetL: 0.82, roofFacetR: 0.93,
  /* L2+ 女儿墙 */
  parapet: 'rgba(255,255,255,.14)', parapetW: 1.2,
  /* L3 玻璃幕墙（去青：暖白玻璃，v5 的 #9fd8ff 青幕墙已废） */
  l3Rows: 3, l3V1: 0.34, l3RowStep: 0.2, l3WinH: 0.16,
  l3Cols: 4, l3U1: 0.1, l3UStep: 0.23, l3WinW: 0.18, l3Win: '#ffd79a', l3WinAlpha: 0.9,
  /* L3 顶部小阁楼（避免大平顶显得秃） */
  l3AtticW: 0.28, l3AtticD: 0.3, l3AtticH: 9,
  /* L3 玻璃内透暖光 */
  warm: 'rgba(255,205,130,.4)', warmU1L: 0.18, warmU2L: 0.9,
  warmU1R: 0.12, warmU2R: 0.88, warmV1: 0.13, warmV2: 0.32,
  /* 店招灯箱 */
  signLevel: 1, signV: [0, 0.68, 0.86, 0.84], signH: [0, 0.22, 0.12, 0.08],
  signU1: 0.04, signU2: 0.96, signEdgeH: 45, signEdgeS: 80, signEdgeL: 58, signEdgeW: 0.8,
  signInU1: 0.05, signInU2: 0.95, signInV1: 0.14, signInV2: 0.86,
  signInSat: 58, signInLit: 30, signInAlpha: 0.55,
  signBox: '#141414', signText: '#ffe08a', signFs: 0.66, signMx: 0.5, signMy: 0.5,
  brand: '',
  /* 温泉池（v5 line 252–256） */
  poolFy: 1.7, poolRx0: 0.8, poolRy0: 0.62, poolRx1: 0.68, poolRy1: 0.5,
  poolShX: 0.2, poolShY: 0.1, poolShRx: 0.3, poolShRy: 0.2,
  poolRim: '#3b3a33', poolWater: '#2c6a80', poolShine: 'rgba(160,230,255,.28)', poolAlpha: 0.78,
  /* 温泉蒸汽（v5 line 129–137 steam()） */
  steamN: 3, steamDx: 9, steamDy: 2, steamUp: 6,
  steamRx0: 5, steamRy0: 3, steamRyK: 0.6,
  steamDx2: 2, steamUp2: 9, steamDy2: 3, steamRx1: 4, steamRy1: 2.4, steamRyK2: 0.5,
  steam1: 'rgba(255,255,255,.13)', steam2: 'rgba(255,255,255,.09)',

  /* ===== stall 坡顶摊位（L1） ===== */
  stPostH: 0.52, stPostW: 1.4,
  stCounterH: 0.3, stCounterLip: 0.05,
  stCanopyRise: 10, stCanopyV: 1.18, stShadeL: 0.8,
  stFringeN: 3, stFringeR: 1.5, stFringeHang: 1.8,
  stBulbV: 1.02, stBulbR: 2.2, stBulbGlowR: 5.5, stBulbGlowRy: 4, stGlowAlpha: 0.32,

  /* ===== onsenHouse 温泉汤屋 ===== */
  onNorenV1: 0.36, onNorenV2: 0.66, onNorenSlats: 5, onNorenSlatW: 0.014, onNorenRodW: 1.4,
  onDoorU1: 0.42, onDoorU2: 0.62, onDoorV2: 0.34,
  onPoolFy: 1.55, onPoolRimW: 0.86, onPoolRimD: 0.66, onPoolW: 0.62, onPoolD: 0.46,
  onPoolShX: 0.18, onPoolShY: 0.1, onPoolShW: 0.26, onPoolShD: 0.16,
  onSteamN: 3, onSteamDx: 7.5, onSteamRise: 14, onSteamRx0: 4.5, onSteamRy0: 2.6,
  onSteamRxK: 0.8, onSteamDyK: 3.2, onSteamDx2: 2.4, onSteamUp2: 6,
  onWinV1: 0.72, onWinV2: 0.86, onWinUs: [0.22, 0.48, 0.74], onWinUw: 0.12,

  /* ===== gate 牌楼门（入口） ===== */
  gtPillarW: 3.2, gtPillarInset: 0.5, gtPillarH: 1,
  gtVoidV1: 0.02, gtVoidV2: 0.52, gtVoid: '#20170f',
  gtLintelV1: 0.6, gtLintelV2: 0.78, gtLintelPad: 0.06,
  gtLintelEdge: 'rgba(0,0,0,.4)', gtLintelEdgeW: 1.2,
  gtEaveRise: 8, gtEaveDrop: 1.4, gtEaveLip: 1.6,
  gtLionRx: 3.4, gtLionRy: 1.6, gtLionDy: 0.55, gtLionX: 0.74,

  /* ===== barn 鹿舍仓房 ===== */
  brRoofRise: 18,
  brDoorW: 0.5, brDoorV2: 0.52, brDoorSeamV: 0.5, brBeamVs: [0.28, 0.72], brBeamW: 0.9,
  brBracePad: 0.08, brDoorEdge: 'rgba(0,0,0,.4)', brDoorEdgeW: 0.9,
  brHayR: 4.5, brHayDy: 1.2, brHayN: 3, brHayDx: 1.6, brHayShade: 0.82,
  brWinV1: 0.62, brWinV2: 0.76, brWinU1: 0.24, brWinU2: 0.4,
});

/* —— 取值器（params 优先，缺则落 L4 兜底；沿用既有闭包风格） —— */
const g1 = (p: P, k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (D as P)[k] as number);
const s1 = (p: P, k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : (D as P)[k] as string);
const a1 = (p: P, k: string): number[] => arr<number>(p, k) ?? ((D as P)[k] as number[]);

function fill(g: Graphics, pts: Pt[], color: string, alpha = 1): void {
  g.poly(ptsToPoly(pts)).fill({ color, alpha });
}
function line(g: Graphics, a: Pt, b: Pt, color: string, width: number): void {
  g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color, width });
}
/** 两点线性插值：t=0 → a，t=1 → b（用于在墙底边上取柱位） */
function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** 等距四角 + 抬升后的四角（各 preset 共用的一套基准点） */
interface Quad { F: Pt; R: Pt; B: Pt; L: Pt; F2: Pt; R2: Pt; B2: Pt; L2: Pt; w: number; d: number; h: number }
function quad(cx: number, cy: number, geo: Geo, s: number, h: number): Quad {
  const w = geo.hw * s;
  const d = geo.hh * s;
  const F: Pt = [cx, cy + d];
  const R: Pt = [cx + w, cy];
  const B: Pt = [cx, cy - d];
  const L: Pt = [cx - w, cy];
  return { F, R, B, L, F2: up(F, h), R2: up(R, h), B2: up(B, h), L2: up(L, h), w, d, h };
}

/** 一侧墙：给定两侧底边点与高度，画成矩形面 */
function wallFace(g: Graphics, a: Pt, b: Pt, h: number, color: string): void {
  fill(g, [a, b, up(b, h), up(a, h)], color);
}

/* ============ shop 等距楼（L1 坡顶小铺 / L2 平顶楼；L3 已抽到 market3） ============ */
export function shop(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, geo, state, params } = ctx;
  const p = params as P;
  const G = (k: string): number => g1(p, k);
  const S = (k: string): string => s1(p, k);
  const A = (k: string): number[] => a1(p, k);

  const s = ctx.s;
  const levels = (typeof state.level === 'number' ? state.level : G('levels')) as 1 | 2 | 3;
  /* L3 由 market3 承担（去青幕墙 + 去霓虹）；skin.json 若仍把 l3 指到 shop，这里兜住 */
  if (levels === 3) { market3(g, ctx); return; }

  const hue = G('hue');
  const dk = state.dim === true ? G('dim') : 1;
  const { F, R, B, L, L2, w, d, h } = quad(cx, cy, geo, s, BUILDING_HEIGHTS[levels] * s);

  /* —— 主题色键（spec §4）：palette 给了就用 palette，否则沿用 hue 派生（默认皮肤零变化） —— */
  const wallL = c(p, 'wallL', hsl(hue, G('satL'), G('litL12') * dk));
  const wallR = c(p, 'wallR', hsl(hue, G('satR'), G('litR12') * dk));
  const roofKey = typeof p.roof === 'string' && p.roof !== '' ? (p.roof as string) : null;
  const roofC = roofKey ?? hsl(hue, G('satRoof'), G('roofLit12') * dk);
  const gw = c(p, 'win', levels === 1 ? S('glass1') : S('glass2'));
  const upC = c(p, 'win', S('upFill'));
  const glowC = c(p, 'glow', S('doorGlow'));

  /* ① 落地投影 + 门口暖光 */
  fill(g, [
    [cx + G('shDx') * s, cy + d * G('shFy')],
    [cx + w + G('shDx') * s, cy + G('shRise') * s],
    [cx + G('shDx') * s, cy - d * G('shUpF')],
    [cx - w + G('shDx') * s, cy + G('shRise') * s],
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy')).fill({ color: glowC });

  /* ② 两面墙（右墙亮、左墙暗） */
  wallFace(g, F, R, h, wallR);
  wallFace(g, L, F, h, wallL);

  /* ③ 墙脚压暗 */
  fill(g, [F, R, up(R, G('footH') * s), up(F, G('footH') * s)], S('footR'));
  fill(g, [L, F, up(F, G('footH') * s), up(L, G('footH') * s)], S('footL'));

  /* ④ 楼层分隔线：把一整面墙切成层 */
  if (levels >= 2) {
    for (const v of A('divsL2')) {
      fill(g, win(L, F, h, 0, 1, v, v + G('divT')), S('divL'));
      fill(g, win(F, R, h, 0, 1, v, v + G('divT')), S('divR'));
    }
  }

  /* ⑤ 一层橱窗：玻璃 + 竖框 ×3 + 横梁 + 台度 */
  const gv1 = G('gv1');
  const gv2 = levels === 1 ? G('gv2L1') : G('gv2L23');
  fill(g, win(L, F, h, G('gU1L'), G('gU2L'), gv1, gv2), gw);
  fill(g, win(F, R, h, G('gU1R'), G('gU2R'), gv1, gv2), gw);
  for (const u of A('mulls')) {
    fill(g, win(L, F, h, u, u + G('mullW'), gv1, gv2), S('mull'));
    fill(g, win(F, R, h, u - G('mullShift'), u - G('mullShift') + G('mullW'), gv1, gv2), S('mull'));
  }
  fill(g, win(L, F, h, G('gU1L'), G('gU2L'), gv2 - G('tranH'), gv2), S('tran'));
  fill(g, win(F, R, h, G('gU1R'), G('gU2R'), gv2 - G('tranH'), gv2), S('tran'));
  fill(g, win(L, F, h, G('gU1L'), G('gU2L'), gv1, gv1 + G('sillH')), S('sill'));
  fill(g, win(F, R, h, G('gU1R'), G('gU2R'), gv1, gv1 + G('sillH')), S('sill'));

  /* ⑥ 门：门洞 + 内透暖光 + 门槛石 */
  fill(g, win(L, F, h, G('doorU1'), G('doorU2'), 0, gv2), S('door'));
  fill(g, win(L, F, h, G('doorInU1'), G('doorInU2'), G('doorInV1'), G('doorInV2')), S('doorLight'));
  fill(g, win(L, F, h, G('stoneU1'), G('stoneU2'), 0, G('stoneV2')), S('stone'));

  /* ⑦ 上层窗：L2 三扇暖光 */
  if (levels === 2) {
    for (const u of A('upUs')) {
      fill(g, win(L, F, h, u - G('upLu'), u + G('upRu'), G('upV1'), G('upV2')), upC);
      fill(g, win(F, R, h, u - G('upLu'), u + G('upRu'), G('upV1'), G('upV2')), upC);
    }
  }

  /* ⑧ 屋顶：L1 坡顶（金字脊线）/ L2 女儿墙 */
  fill(g, [L2, up(B, h), up(R, h), up(F, h)], roofC);
  if (levels === 1) {
    const apex: Pt = [cx, cy - h - G('gableRise') * s];
    fill(g, [L2, up(F, h), apex], roofKey ?? hsl(hue, G('gableSatL'), G('gableLitL') * dk), roofKey ? G('roofFacetL') : 1);
    fill(g, [up(F, h), up(R, h), apex], roofKey ?? hsl(hue, G('gableSatR'), G('gableLitR') * dk), roofKey ? G('roofFacetR') : 1);
    line(g, apex, up(apex, G('ridgeLen') * s), S('ridge'), G('ridgeW') * s);
  } else {
    g.poly(ptsToPoly([L2, up(B, h), up(R, h), up(F, h)])).stroke({ color: S('parapet'), width: G('parapetW') * s });
  }

  /* ⑨ 温泉池 + 蒸汽：只给带 pool/steam 的楼（复用 onsenHouse 的画法） */
  if (p.pool === true || state.pool === true || p.steam === true || state.steam === true) {
    onsenPoolAndSteam(g, ctx, p, h);
  }
}

/* ============ market3 三层市集楼（v5 的 L3 分支；已删霓虹描边与青幕墙） ============ */
export function market3(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, geo, state, params } = ctx;
  const p = params as P;
  const G = (k: string): number => g1(p, k);
  const S = (k: string): string => s1(p, k);

  const s = ctx.s;
  const hue = G('hue');
  const dk = state.dim === true ? G('dim') : 1;
  const h = BUILDING_HEIGHTS[3] * s;
  const { F, R, B, L, L2, w, d } = quad(cx, cy, geo, s, h);

  const wallL = c(p, 'wallL', hsl(hue, G('satL'), G('litL3') * dk));
  const wallR = c(p, 'wallR', hsl(hue, G('satR'), G('litR3') * dk));
  const roofC = c(p, 'roof', hsl(hue, G('satRoof'), G('roofLit3') * dk));
  const glowC = c(p, 'glow', S('warm'));
  const winC = c(p, 'win', S('l3Win'));
  const winA = typeof p.win === 'string' ? G('l3WinAlpha') : 1;

  /* ① 落地投影 + 门口暖光 */
  fill(g, [
    [cx + G('shDx') * s, cy + d * G('shFy')],
    [cx + w + G('shDx') * s, cy + G('shRise') * s],
    [cx + G('shDx') * s, cy - d * G('shUpF')],
    [cx - w + G('shDx') * s, cy + G('shRise') * s],
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy')).fill({ color: glowC });

  /* ② 两面墙 + 墙脚 */
  wallFace(g, F, R, h, wallR);
  wallFace(g, L, F, h, wallL);
  fill(g, [F, R, up(R, G('footH') * s), up(F, G('footH') * s)], S('footR'));
  fill(g, [L, F, up(F, G('footH') * s), up(L, G('footH') * s)], S('footL'));

  /* ③ 两道楼层分隔线 */
  for (const v of a1(p, 'divsL3')) {
    fill(g, win(L, F, h, 0, 1, v, v + G('divT')), S('divL'));
    fill(g, win(F, R, h, 0, 1, v, v + G('divT')), S('divR'));
  }

  /* ④ 底层内透暖光 + 一层橱窗（暖白玻璃，去青） */
  fill(g, win(L, F, h, G('warmU1L'), G('warmU2L'), G('warmV1'), G('warmV2')), glowC);
  fill(g, win(F, R, h, G('warmU1R'), G('warmU2R'), G('warmV1'), G('warmV2')), glowC);
  fill(g, win(L, F, h, G('doorU1'), G('doorU2'), 0, G('warmV2')), S('door'));
  fill(g, win(L, F, h, G('stoneU1'), G('stoneU2'), 0, G('stoneV2')), S('stone'));

  /* ⑤ 成排暖窗：3 层 × 4 列，逐扇点亮 */
  for (let r = 0; r < G('l3Rows'); r++) {
    const v1 = G('l3V1') + r * G('l3RowStep');
    for (let i = 0; i < G('l3Cols'); i++) {
      const u = G('l3U1') + i * G('l3UStep');
      g.poly(ptsToPoly(win(L, F, h, u, u + G('l3WinW'), v1, v1 + G('l3WinH'))))
        .fill({ color: winC, alpha: winA });
      g.poly(ptsToPoly(win(F, R, h, u, u + G('l3WinW'), v1, v1 + G('l3WinH'))))
        .fill({ color: winC, alpha: winA });
    }
  }

  /* ⑥ 平顶 + 女儿墙（原 v5 的青色霓虹描边已删） */
  fill(g, [L2, up(B, h), up(R, h), up(F, h)], roofC);
  g.poly(ptsToPoly([L2, up(B, h), up(R, h), up(F, h)])).stroke({ color: S('parapet'), width: G('parapetW') * s });

  /* ⑦ 顶部小阁楼：等距小体块，让大平顶不秃 */
  const aw = w * G('l3AtticW');
  const ad = d * G('l3AtticD');
  const ah = G('l3AtticH') * s;
  const bF: Pt = [cx, cy - h + ad];
  const bR: Pt = [cx + aw, cy - h];
  const bB: Pt = [cx, cy - h - ad];
  const bL: Pt = [cx - aw, cy - h];
  wallFace(g, bF, bR, ah, wallR);
  wallFace(g, bL, bF, ah, wallL);
  fill(g, [up(bL, ah), up(bB, ah), up(bR, ah), up(bF, ah)], roofC);
  g.poly(ptsToPoly([up(bL, ah), up(bB, ah), up(bR, ah), up(bF, ah)]))
    .stroke({ color: S('ridge'), width: G('ridgeW') * s });
}

/* ============ stall 坡顶摊位（L1）：木架 + 布篷 + 一盏暖灯 + 平摊台面 ============ */
export function stall(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, geo, state, params } = ctx;
  const p = params as P;
  const G = (k: string): number => g1(p, k);
  const S = (k: string): string => s1(p, k);

  const s = ctx.s;
  const hue = G('hue');
  const dk = state.dim === true ? G('dim') : 1;
  const h = BUILDING_HEIGHTS[1] * s;
  const { F, R, B, L, w, d } = quad(cx, cy, geo, s, h);

  const wallL = c(p, 'wallL', hsl(hue, G('satL'), G('litL12') * dk));
  const wallR = c(p, 'wallR', hsl(hue, G('satR'), G('litR12') * dk));
  const cloth = c(p, 'sign', hsl(hue, G('gableSatR'), G('gableLitR') * dk));
  const trim = c(p, 'roof', hsl(hue, G('satRoof'), G('roofLit12') * dk));
  const counter = c(p, 'win', hsl(hue, G('satRoof'), G('roofLit12') * dk));
  const bulb = c(p, 'glow', S('upFill'));

  /* ① 落地投影 + 地面暖光 */
  fill(g, [
    [cx + G('shDx') * s, cy + d * G('shFy')],
    [cx + w + G('shDx') * s, cy + G('shRise') * s],
    [cx + G('shDx') * s, cy - d * G('shUpF')],
    [cx - w + G('shDx') * s, cy + G('shRise') * s],
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy'))
    .fill({ color: c(p, 'glow', S('doorGlow')) });

  /* ② 台面（半人高斜台：两侧板 + 顶板 + 前沿唇线） */
  const ch = h * G('stCounterH');
  wallFace(g, F, R, ch, counter);
  wallFace(g, L, F, ch, counter);
  fill(g, [up(L, ch), up(B, ch), up(R, ch), up(F, ch)], trim);
  fill(g, [up(F, ch), up(R, ch), up(R, ch + G('stCounterLip') * s), up(F, ch + G('stCounterLip') * s)], wallR);

  /* ③ 四根木柱（后两根先画、前两根后画，保证遮挡顺序） */
  const pw = G('stPostW') * s;
  const postH = h * G('stPostH');
  const post = (pt: Pt, col: string): void => {
    const top: Pt = [pt[0], pt[1] - postH];
    fill(g, [
      [pt[0] - pw / 2, pt[1]], [pt[0], pt[1] + pw / 4],
      [top[0], top[1] + pw / 4], [top[0] - pw / 2, top[1]],
    ], col);
    fill(g, [
      [pt[0], pt[1] + pw / 4], [pt[0] + pw / 2, pt[1]],
      [top[0] + pw / 2, top[1]], [top[0], top[1] + pw / 4],
    ], col);
  };
  post(B, wallL);
  post(L, wallL);
  post(F, wallR);
  post(R, wallR);

  /* ④ 布篷：四柱顶拉起的双坡篷（左面稍暗作分面） */
  const apex: Pt = [cx, cy - h * G('stCanopyV') - G('stCanopyRise') * s];
  fill(g, [up(L, postH), up(F, postH), apex], cloth, G('stShadeL'));
  fill(g, [up(F, postH), up(R, postH), apex], cloth);

  /* ⑤ 篷沿流苏：沿前缘 L→F→R 均匀挂 3 个小圆点 */
  const n = G('stFringeN');
  const fr = G('stFringeR') * s;
  const hang = G('stFringeHang') * s;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const a: Pt = t < 0.5 ? L : F;
    const b: Pt = t < 0.5 ? F : R;
    const k = (t < 0.5 ? t : t - 0.5) * 2;
    const px = a[0] + k * (b[0] - a[0]);
    const py = a[1] + k * (b[1] - a[1]) - postH;
    g.circle(px, py + hang, fr).fill({ color: trim });
  }

  /* ⑥ 一盏暖灯：光晕 + 灯泡（挂在篷下正前方） */
  const by = cy + d * G('stBulbV') - postH;
  g.ellipse(cx, by, G('stBulbGlowR') * s, G('stBulbGlowRy') * s).fill({ color: bulb, alpha: G('stGlowAlpha') });
  g.circle(cx, by, G('stBulbR') * s).fill({ color: bulb });
}

/* ============ onsenHouse 温泉汤屋：暖帘门 + 汤池 + 汤雾 ============ */
export function onsenHouse(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, geo, state, params } = ctx;
  const p = params as P;
  const G = (k: string): number => g1(p, k);
  const S = (k: string): string => s1(p, k);

  const s = ctx.s;
  const hue = G('hue');
  const dk = state.dim === true ? G('dim') : 1;
  const levels = (typeof state.level === 'number' ? state.level : 2) as 1 | 2 | 3;
  const h = BUILDING_HEIGHTS[levels === 3 ? 2 : levels] * s;
  const { F, R, B, L, R2, L2, w, d } = quad(cx, cy, geo, s, h);

  const wallL = c(p, 'wallL', hsl(hue, G('satL'), G('litL12') * dk));
  const wallR = c(p, 'wallR', hsl(hue, G('satR'), G('litR12') * dk));
  const roofKey = typeof p.roof === 'string' && p.roof !== '' ? (p.roof as string) : null;
  const roofC = roofKey ?? hsl(hue, G('satRoof'), G('roofLit12') * dk);
  const noren = c(p, 'sign', hsl(hue, G('signEdgeS'), G('signEdgeL') * dk));
  const glowC = c(p, 'glow', S('doorGlow'));
  const winC = c(p, 'win', S('upFill'));

  /* ① 投影 + 暖光 */
  fill(g, [
    [cx + G('shDx') * s, cy + d * G('shFy')],
    [cx + w + G('shDx') * s, cy + G('shRise') * s],
    [cx + G('shDx') * s, cy - d * G('shUpF')],
    [cx - w + G('shDx') * s, cy + G('shRise') * s],
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy')).fill({ color: glowC });

  /* ② 两面墙 + 墙脚 */
  wallFace(g, F, R, h, wallR);
  wallFace(g, L, F, h, wallL);
  fill(g, [F, R, up(R, G('footH') * s), up(F, G('footH') * s)], S('footR'));
  fill(g, [L, F, up(F, G('footH') * s), up(L, G('footH') * s)], S('footL'));

  /* ③ 门洞（暗）+ 上层小暖窗 */
  fill(g, win(L, F, h, G('onDoorU1'), G('onDoorU2'), 0, G('onDoorV2')), S('door'));
  for (const u of a1(p, 'onWinUs')) {
    fill(g, win(L, F, h, u, u + G('onWinUw'), G('onWinV1'), G('onWinV2')), winC);
    fill(g, win(F, R, h, u, u + G('onWinUw'), G('onWinV1'), G('onWinV2')), winC);
  }

  /* ④ 暖帘（noren）：挂在门洞上方，竖条分缝 */
  const nv1 = h * G('onNorenV1');
  const nv2 = h * G('onNorenV2');
  fill(g, win(L, F, h, G('onDoorU1'), G('onDoorU2'), nv1 / h, nv2 / h), noren);
  for (let i = 0; i < G('onNorenSlats'); i++) {
    const u = G('onDoorU1') + (i + 1) * (G('onDoorU2') - G('onDoorU1')) / (G('onNorenSlats') + 1);
    fill(g, win(L, F, h, u - G('onNorenSlatW') / 2, u + G('onNorenSlatW') / 2, nv1 / h, nv2 / h), S('mull'));
  }
  /* 帘杆 */
  const rodA: Pt = [L[0] + (F[0] - L[0]) * G('onDoorU1'), L[1] + (F[1] - L[1]) * G('onDoorU1')];
  line(g, up(rodA, nv1), up(rodA, nv2), S('mull'), G('onNorenRodW') * s);

  /* ⑤ 屋顶：坡顶 + 金脊 */
  fill(g, [L2, up(B, h), up(R2, h), up(F, h)], roofC);
  const apex: Pt = [cx, cy - h - G('gableRise') * s];
  fill(g, [L2, up(F, h), apex], roofKey ?? hsl(hue, G('gableSatL'), G('gableLitL') * dk), roofKey ? G('roofFacetL') : 1);
  fill(g, [up(F, h), up(R2, h), apex], roofKey ?? hsl(hue, G('gableSatR'), G('gableLitR') * dk), roofKey ? G('roofFacetR') : 1);
  line(g, apex, up(apex, G('ridgeLen') * s), S('ridge'), G('ridgeW') * s);

  /* ⑥ 汤池 + 汤雾 */
  onsenPoolAndSteam(g, ctx, p, h);
}

/** 汤池 + 汤雾（onsenHouse 与带 pool/steam 的 shop 共用）：色键优先，无 palette 时保持 v5 原样 */
function onsenPoolAndSteam(g: Graphics, ctx: ProcCtx, p: P, h: number): void {
  const { cx, cy, geo } = ctx;
  const G = (k: string): number => g1(p, k);
  const S = (k: string): string => s1(p, k);
  const s = ctx.s;
  const w = geo.hw * s;
  const d = geo.hh * s;
  const dim = ctx.state.dim === true;

  if (p.pool === true || ctx.state.pool === true) {
    const py = cy + d * G('onPoolFy');
    const rim = c(p, 'roof', S('poolRim'));
    const waterKey = typeof p.glow === 'string' && p.glow !== '' ? (p.glow as string) : null;
    g.ellipse(cx, py, w * G('onPoolRimW'), d * G('onPoolRimD')).fill({ color: rim });
    g.ellipse(cx, py, w * G('onPoolW'), d * G('onPoolD'))
      .fill({ color: waterKey ?? S('poolWater'), alpha: waterKey ? G('poolAlpha') : 1 });
    g.ellipse(cx - w * G('onPoolShX'), py - d * G('onPoolShY'), w * G('onPoolShW'), d * G('onPoolShD'))
      .fill({ color: c(p, 'glow', S('poolShine')), alpha: waterKey ? G('stGlowAlpha') : 1 });
  }

  if (p.steam === true || ctx.state.steam === true) {
    const n = G('onSteamN');
    const base = cy - h - G('onSteamRise') * s * (dim ? G('dim') : 1);
    for (let i = 0; i < n; i++) {
      const sx = cx + (i - (n - 1) / 2) * G('onSteamDx') * s;
      const sy = base + i * G('onSteamDyK') * s;
      g.ellipse(sx, sy, (G('onSteamRx0') + i) * s, (G('onSteamRy0') + i * G('onSteamRxK')) * s)
        .fill({ color: S('steam1') });
      g.ellipse(sx + G('onSteamDx2') * s, sy - G('onSteamUp2') * s, (G('onSteamRx0') + i) * s,
        (G('onSteamRy0') + i * G('onSteamRxK')) * s).fill({ color: S('steam2') });
    }
  }
}

/* ============ gate 牌楼门：双柱 + 门洞 + 横匾 + 顶檐 + 石狮位 ============ */
export function gate(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, geo, state, params } = ctx;
  const p = params as P;
  const G = (k: string): number => g1(p, k);
  const S = (k: string): string => s1(p, k);

  const s = ctx.s;
  const hue = G('hue');
  const dk = state.dim === true ? G('dim') : 1;
  const h = BUILDING_HEIGHTS[2] * s;
  const { F, R, L, w, d } = quad(cx, cy, geo, s, h);

  const pillarL = c(p, 'wallL', hsl(hue, G('satL'), G('litL12') * dk));
  const pillarR = c(p, 'wallR', hsl(hue, G('satR'), G('litR12') * dk));
  const plaque = c(p, 'sign', hsl(hue, G('signEdgeS'), G('signEdgeL')));
  const eave = c(p, 'roof', hsl(hue, G('gableSatR'), G('gableLitR') * dk));
  const glowC = c(p, 'glow', S('doorGlow'));

  /* ① 投影 + 暖光 */
  fill(g, [
    [cx + G('shDx') * s, cy + d * G('shFy')],
    [cx + w + G('shDx') * s, cy + G('shRise') * s],
    [cx + G('shDx') * s, cy - d * G('shUpF')],
    [cx - w + G('shDx') * s, cy + G('shRise') * s],
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy')).fill({ color: glowC });

  /* ② 两根立柱的落点：沿左右墙底边对称内收，两柱同高（正立面） */
  const ins = G('gtPillarInset');
  const bL = lerp(L, F, ins);
  const bR = lerp(R, F, ins);
  const ph = h * G('gtPillarH');
  const pw = G('gtPillarW') * s;

  /* ③ 门洞：两柱之间的暗面（先画洞，柱子随后压住两侧） */
  fill(g, win(bL, bR, h, 0, 1, G('gtVoidV1'), G('gtVoidV2')), S('gtVoid'));

  /* ④ 立柱：等距方柱的双侧面（左面暗、右面亮） */
  const pillar = (pt: Pt, colA: string, colB: string): void => {
    const top: Pt = [pt[0], pt[1] - ph];
    fill(g, [
      [pt[0] - pw / 2, pt[1]], [pt[0], pt[1] + pw / 4],
      [top[0], top[1] + pw / 4], [top[0] - pw / 2, top[1]],
    ], colA);
    fill(g, [
      [pt[0], pt[1] + pw / 4], [pt[0] + pw / 2, pt[1]],
      [top[0] + pw / 2, top[1]], [top[0], top[1] + pw / 4],
    ], colB);
  };
  pillar(bL, pillarL, pillarR);
  pillar(bR, pillarL, pillarR);

  /* ⑤ 横匾：两柱之间的金色匾额（色键 sign），带深描边 */
  const pl = win(bL, bR, h, 0, 1, G('gtLintelV1'), G('gtLintelV2'));
  const pad = w * G('gtLintelPad');
  const plaquePts: Pt[] = [
    [pl[0][0] - pad, pl[0][1]], [pl[1][0] + pad, pl[1][1]],
    [pl[2][0] + pad, pl[2][1]], [pl[3][0] - pad, pl[3][1]],
  ];
  fill(g, plaquePts, plaque);
  g.poly(ptsToPoly(plaquePts)).stroke({ color: S('gtLintelEdge'), width: G('gtLintelEdgeW') * s });

  /* ⑥ 顶檐：匾上方的双坡小檐（色键 roof）+ 金脊 */
  const ey = pl[3][1] - G('gtEaveDrop') * s;
  const eApex: Pt = [cx, ey - G('gtEaveRise') * s];
  const eMid: Pt = [cx, ey + d * G('gtEaveDrop')];
  const eL: Pt = [plaquePts[3][0] - w * G('gtEaveLip'), ey];
  const eR: Pt = [plaquePts[2][0] + w * G('gtEaveLip'), ey];
  fill(g, [eL, eMid, eApex], eave, G('roofFacetL'));
  fill(g, [eMid, eR, eApex], eave);
  line(g, eApex, up(eApex, G('ridgeLen') * s), S('ridge'), G('ridgeW') * s);

  /* ⑦ 两侧石狮墩：一对柱础圆墩（色键 roof，缺则落 stone 兜底） */
  const lr = G('gtLionRx') * s;
  const ly = cy + d * G('gtLionDy');
  for (const sx of [-1, 1]) {
    g.ellipse(cx + sx * w * G('gtLionX'), ly, lr, G('gtLionRy') * s)
      .fill({ color: c(p, 'roof', S('stone')) });
  }
}

/* ============ barn 鹿舍仓房：大坡瓦顶 + 横木门 + 干草堆 ============ */
export function barn(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, geo, state, params } = ctx;
  const p = params as P;
  const G = (k: string): number => g1(p, k);
  const S = (k: string): string => s1(p, k);

  const s = ctx.s;
  const hue = G('hue');
  const dk = state.dim === true ? G('dim') : 1;
  const h = BUILDING_HEIGHTS[2] * s;
  const { F, R, B, L, w, d } = quad(cx, cy, geo, s, h);

  const wallL = c(p, 'wallL', hsl(hue, G('satL'), G('litL12') * dk));
  const wallR = c(p, 'wallR', hsl(hue, G('satR'), G('litR12') * dk));
  const roofKey = typeof p.roof === 'string' && p.roof !== '' ? (p.roof as string) : null;
  const roofC = roofKey ?? hsl(hue, G('satRoof'), G('roofLit12') * dk);
  const doorC = c(p, 'win', hsl(hue, G('gableSatL'), G('gableLitL') * dk));
  const hay = c(p, 'glow', S('upFill'));
  const glowC = c(p, 'glow', S('doorGlow'));

  /* ① 投影 + 暖光 */
  fill(g, [
    [cx + G('shDx') * s, cy + d * G('shFy')],
    [cx + w + G('shDx') * s, cy + G('shRise') * s],
    [cx + G('shDx') * s, cy - d * G('shUpF')],
    [cx - w + G('shDx') * s, cy + G('shRise') * s],
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy')).fill({ color: glowC });

  /* ② 两面墙 + 墙脚 */
  wallFace(g, F, R, h, wallR);
  wallFace(g, L, F, h, wallL);
  fill(g, [F, R, up(R, G('footH') * s), up(F, G('footH') * s)], S('footR'));
  fill(g, [L, F, up(F, G('footH') * s), up(L, G('footH') * s)], S('footL'));

  /* ③ 横木门：门扇 + 中缝 + 两道横木 + 交叉斜撑 + 门槛 */
  const du1 = 0.5 - G('brDoorW') / 2;
  const du2 = 0.5 + G('brDoorW') / 2;
  const dv2 = G('brDoorV2');
  const doorPts = win(L, F, h, du1, du2, 0, dv2);
  fill(g, doorPts, doorC);
  g.poly(ptsToPoly(doorPts)).stroke({ color: S('brDoorEdge'), width: G('brDoorEdgeW') * s });

  const at = (u: number, v: number): Pt => win(L, F, h, u, u, v, v)[0];
  const beamW = G('brBeamW') * s;
  line(g, at(G('brDoorSeamV'), 0), at(G('brDoorSeamV'), dv2), S('mull'), beamW);
  for (const v of a1(p, 'brBeamVs')) line(g, at(du1, v * dv2), at(du2, v * dv2), S('mull'), beamW);
  const brace = G('brBracePad') * dv2;
  line(g, at(du1, brace), at(du2, dv2 - brace), S('mull'), beamW);
  line(g, at(du1, dv2 - brace), at(du2, brace), S('mull'), beamW);
  fill(g, win(L, F, h, G('stoneU1'), G('stoneU2'), 0, G('stoneV2')), S('stone'));

  /* ④ 小窗：门上方一扇暖窗 */
  fill(g, win(L, F, h, G('brWinU1'), G('brWinU2'), G('brWinV1'), G('brWinV2')), c(p, 'glow', S('upFill')));

  /* ⑤ 大坡瓦顶：顶面 + 双坡分面 + 金脊 */
  const apex: Pt = [cx, cy - h - G('brRoofRise') * s];
  fill(g, [up(L, h), up(B, h), up(R, h), up(F, h)], roofC);
  fill(g, [up(L, h), up(F, h), apex], roofKey ?? hsl(hue, G('gableSatL'), G('gableLitL') * dk), roofKey ? G('roofFacetL') : 1);
  fill(g, [up(F, h), up(R, h), apex], roofKey ?? hsl(hue, G('gableSatR'), G('gableLitR') * dk), roofKey ? G('roofFacetR') : 1);
  line(g, apex, up(apex, G('ridgeLen') * s), S('ridge'), G('ridgeW') * s);

  /* ⑥ 干草堆：屋侧三堆（色键 glow = 暖黄） */
  const hy = cy + d * G('brHayDy');
  const n = G('brHayN');
  for (let i = 0; i < n; i++) {
    const hx = cx + w * G('brHayDx') * (i - (n - 1) / 2);
    g.circle(hx, hy, G('brHayR') * s).fill({ color: hay, alpha: i === 0 ? G('brHayShade') : 1 });
  }
}

/**
 * 店招：沿右墙的斜面灯箱 + 随等距角度旋转的汉字（v5 line 232–241）。
 * 文字角度 = -atan2(d, w)·180/π ≈ -26.57°，与墙面同一透视。
 * 店名优先从 `state.brand` 读（View 层按格给），`params.brand` 兜底。
 */
export function sign(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, geo, params, state } = ctx;
  const p = params as P;
  const G = (k: string): number => g1(p, k);
  const S = (k: string): string => s1(p, k);
  const LV = (k: string): number[] => a1(p, k);

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

  const edgeC = c(p, 'sign', hsl(G('signEdgeH'), G('signEdgeS'), G('signEdgeL')));
  const innerC = c(p, 'glow', hsl(G('signEdgeH'), G('signInSat'), G('signInLit')));

  g.poly(ptsToPoly(win(F, R, h, G('signU1'), G('signU2'), v1, v1 + vh)))
    .fill({ color: S('signBox') })
    .stroke({ color: edgeC, width: G('signEdgeW') * s });
  g.poly(ptsToPoly(win(F, R, h, G('signInU1'), G('signInU2'), v1 + vh * G('signInV1'), v1 + vh * G('signInV2'))))
    .fill({ color: innerC, alpha: G('signInAlpha') });

  const brand = typeof state.brand === 'string'
    ? (state.brand as string)
    : (typeof p.brand === 'string' ? (p.brand as string) : S('brand'));
  if (brand) {
    const mx = cx + w * G('signMx');
    const my = y0 + d * G('signMy') - h * (v1 + vh / 2);
    const ang = (-Math.atan2(d, w) * 180) / Math.PI;
    ctx.text?.({ text: brand, x: mx, y: my, size: bh * G('signFs'), fill: c(p, 'sign', S('signText')), rotate: ang });
  }
}