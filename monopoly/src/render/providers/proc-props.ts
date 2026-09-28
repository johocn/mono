import type { Graphics } from 'pixi.js';
import { up, win, type Pt } from '../iso';
import { ptsToPoly } from '../paint';
import { BUILDING_HEIGHTS } from '../../skin/registry';
import { hsl } from './proc-building';
import { arr, fb } from './proc-base';
import type { ProcCtx } from './proc';

type P = Record<string, unknown>;

/**
 * L4 内建兜底：v5 isoTree / streetLamp / lantern / vBanner / isoBox / 遮阳篷 / 屋顶设备的
 * 全部色值与几何（spec §3.6.4）。本文件唯一允许出现裸字面量的位置。
 */
const PD = fb({
  /* —— awning 遮阳篷（L1：红白条纹，压在橱窗上方） —— */
  awU1: 0.06, awU2: 0.98, awV1: 0.58, awV2: 0.7,
  awBase: '#d8c9ac', awStripe: '#b8402f',
  awStripeUs: [0.06, 0.29, 0.52, 0.75], awStripeW: 0.23,
  awLip: 'rgba(0,0,0,.32)', awLipH: 0.045,
  /* —— lantern 红灯笼 —— */
  laR: 4.6, laRy: 1.15, laRod: 14, laRodEnd: 2, laRodW: 1, laRodFill: '#3a2a1c',
  laFill: '#d63a2f', laHiDx: 0.3, laHiDy: 0.3, laHiRx: 0.35, laHiRy: 0.4,
  laGlow: 'rgba(255,220,160,.4)',
  laCap: '#e8c05a', laCapHalf: 0.55, laCapW: 1.1, laCapH: 0.32, laCapTop: 1.35, laCapBot: 1.03,
  laCharFill: '#ffe9b0', laCharFs: 1.1, laCharDy: 0.42,
  laDxDoor: 0.4, laVDoor: 0.3, laDyDoor: 0.6, laDxSide: 0.9, laVSide: 0.4, laDySide: 0.35,
  /* —— banner 竖招幌子 —— */
  bnDy: 0.15, bnV: 0.8, bnDx1: 0.9, bnDx2: 1.25, bnArmDy: 3, bnArm: '#2a2118', bnArmW: 1.3,
  bnW: 8.6, bnCh: 8.8, bnRx: 1.4, bnFill: '#a8231c',
  bnEdgeH: 45, bnEdgeS: 72, bnEdgeL: 60, bnEdgeW: 0.8,
  bnFs: 7.8, bnCharFy: 0.76, bnTextFill: '#ffe9b0', text: '市集',
  /* —— rooftopBox 屋顶设备箱 ×2 —— */
  rb1Dx: 0.46, rb1Dy: 0.26, rb1W: 0.3, rb1D: 0.3, rb1H: 7, rb1T: '#6d7d75', rb1L: '#4a5a53', rb1R: '#3c4a44',
  rb2Dx: 0.5, rb2Dy: 0.62, rb2W: 0.2, rb2D: 0.2, rb2H: 6, rb2T: '#7d8d85', rb2L: '#55665e', rb2R: '#46564f',
  /* —— signTower 屋顶招牌塔 + 天线红灯 —— */
  stDy: 0.1, stW: 0.34, stD: 0.3, stH: 20, stT: '#2f3d36', stL: '#1b241f', stR: '#243029',
  stMastH: 12, stMastFill: '#8aa39a', stMastW: 1, stLampR: 2.4, stLampDy: 13, stLamp: '#ff5f5f',
  /* —— antenna 独立天线 —— */
  anH: 13, anW: 1, anFill: '#8aa39a', anR: 2.2, anLampDy: 1, anLamp: '#ff5f5f',
  /* —— tree 行道树 —— */
  trScale: 0.68, trH: 16, trW: 5, trShDy: 3, trShRx: 7, trShRy: 3.4, trShadow: 'rgba(0,0,0,.34)',
  trTrunkL: '#3a2a1c', trTrunkR: '#2b1f15',
  trBlobs: [[0, -20, 9, '#2f6b3f'], [-4, -15, 7, '#275c35'], [4.5, -14, 6.5, '#347a48'], [0, -27, 6, '#3d8c52']],
  trHiDx: -3, trHiDy: 28, trHiR: 3.4, trHiFill: 'rgba(190,240,190,.22)',
  /* —— lamp 路灯 —— */
  lpScale: 0.9, lpH: 26, lpPoleW: 2.2, lpPoleFill: '#2a3330',
  lpShDy: 2, lpShRx: 4, lpShRy: 2, lpSh: 'rgba(0,0,0,.32)',
  lpHeadDy: 2, lpGlowR: 6, lpGlow: 'rgba(255,214,130,.2)', lpBulbR: 3, lpBulb: '#ffe6a8',
});

/** 取值器：params 优先，缺则落 L4 兜底（spec §3.6.4 回退链末级） */
function getters(p: P) {
  return {
    G: (k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (PD as P)[k] as number),
    S: (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : (PD as P)[k] as string),
    A: (k: string): number[] => arr<number>(p, k) ?? ((PD as P)[k] as number[]),
  };
}

export type Blob = [number, number, number, string];
function blobsOf(p: P): Blob[] {
  const v = p.blobs as Blob[] | undefined;
  return Array.isArray(v) && v.length > 0 ? v : (PD.trBlobs as unknown as Blob[]);
}

interface Frame { cx: number; cy: number; y0: number; w: number; d: number; h: number }

/**
 * 宿主楼坐标系：cy 已被管线抬升 atV×hostHeight；y0 = cy + lift×s 即宿主基座（= v5 isoShop 的 cy）。
 * 贴墙/贴屋顶件凡横跨一段墙高，一律从 y0 起算。
 */
function frame(ctx: ProcCtx): Frame {
  const s = ctx.s;
  const level = (typeof ctx.state.level === 'number' ? ctx.state.level : 1) as 1 | 2 | 3;
  return {
    cx: ctx.cx,
    cy: ctx.cy,
    y0: ctx.cy + (ctx.lift ?? 0) * s,
    w: ctx.geo.hw * s,
    d: ctx.geo.hh * s,
    h: BUILDING_HEIGHTS[level] * s,
  };
}

function fillPoly(g: Graphics, pts: Pt[], color: string, alpha = 1): void {
  g.poly(ptsToPoly(pts)).fill({ color, alpha });
}

/** v5 isoBox：小等距体块（屋顶设备 / 招牌塔）——右墙 + 左墙 + 顶面 */
function isoBox(g: Graphics, cx: number, cy: number, w: number, d: number, h: number, cT: string, cL: string, cR: string): void {
  const F: Pt = [cx, cy + d];
  const R: Pt = [cx + w, cy];
  const B: Pt = [cx, cy - d];
  const L: Pt = [cx - w, cy];
  fillPoly(g, [F, R, up(R, h), up(F, h)], cR);
  fillPoly(g, [L, F, up(F, h), up(L, h)], cL);
  fillPoly(g, [up(L, h), up(B, h), up(R, h), up(F, h)], cT);
}

/* ============ 遮阳篷（L1 摊位，v5 line 212–216） ============ */
export function awning(g: Graphics, ctx: ProcCtx): void {
  const { G, S, A } = getters(ctx.params as P);
  const { cx, y0, w, d, h } = frame(ctx);
  const F: Pt = [cx, y0 + d];
  const L: Pt = [cx - w, y0];
  fillPoly(g, win(L, F, h, G('awU1'), G('awU2'), G('awV1'), G('awV2')), S('awBase'));
  const us = A('awStripeUs');
  for (let i = 0; i < us.length; i++) {
    fillPoly(g, win(L, F, h, us[i], us[i] + G('awStripeW'), G('awV1'), G('awV2')), S('awStripe'));
  }
  fillPoly(g, win(L, F, h, G('awU1'), G('awU2'), G('awV1') - G('awLipH'), G('awV1')), S('awLip'));
}

/* ============ 红灯笼（v5 lantern line 118–127；两处挂点 line 249–250） ============ */
export function lantern(g: Graphics, ctx: ProcCtx): void {
  const { G, S } = getters(ctx.params as P);
  const { cx, y0, w, d, h } = frame(ctx);
  const s = ctx.s;
  const at = typeof ctx.state.at === 'string' ? (ctx.state.at as string) : 'door';
  const lx = at === 'side' ? cx + w * G('laDxSide') : cx - w * G('laDxDoor');
  const ly = at === 'side'
    ? y0 - d * G('laDySide') - h * G('laVSide')
    : y0 + d * G('laDyDoor') - h * G('laVDoor');
  const r = G('laR') * s;
  g.moveTo(lx, ly - G('laRod') * s).lineTo(lx, ly - r * G('laRodEnd'))
    .stroke({ color: S('laRodFill'), width: G('laRodW') * s });
  g.ellipse(lx, ly, r, r * G('laRy')).fill({ color: S('laFill') });
  g.ellipse(lx - r * G('laHiDx'), ly - r * G('laHiDy'), r * G('laHiRx'), r * G('laHiRy')).fill({ color: S('laGlow') });
  g.rect(lx - r * G('laCapHalf'), ly - r * G('laCapTop'), r * G('laCapW'), r * G('laCapH')).fill({ color: S('laCap') });
  g.rect(lx - r * G('laCapHalf'), ly + r * G('laCapBot'), r * G('laCapW'), r * G('laCapH')).fill({ color: S('laCap') });
  const ch = typeof ctx.state.char === 'string' ? (ctx.state.char as string) : '';
  if (ch) ctx.text?.({ text: ch, x: lx, y: ly + r * G('laCharDy'), size: r * G('laCharFs'), fill: S('laCharFill') });
}

/* ============ 竖招幌子（v5 vBanner line 82–89；挂点 line 244–246） ============ */
export function banner(g: Graphics, ctx: ProcCtx): void {
  const { G, S } = getters(ctx.params as P);
  const { cx, y0, w, d, h } = frame(ctx);
  const s = ctx.s;
  const py = y0 + d * G('bnDy') - h * G('bnV');
  const ax1 = cx - w * G('bnDx1');
  const bx = cx - w * G('bnDx2');
  const by = py + G('bnArmDy') * s;
  g.moveTo(ax1, py).lineTo(bx, by).stroke({ color: S('bnArm'), width: G('bnArmW') * s });
  const text = S('text');
  const bw = G('bnW') * s;
  const ch = G('bnCh') * s;
  g.roundRect(bx - bw / 2, by, bw, text.length * ch, G('bnRx') * s)
    .fill({ color: S('bnFill') })
    .stroke({ color: hsl(G('bnEdgeH'), G('bnEdgeS'), G('bnEdgeL')), width: G('bnEdgeW') * s });
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    ctx.text?.({ text: chars[i], x: bx, y: by + (i + G('bnCharFy')) * ch, size: G('bnFs') * s, fill: S('bnTextFill') });
  }
}

/* ============ 屋顶设备箱（v5 line 221–222）——直接用已抬升的 cy（= 屋顶面） ============ */
export function rooftopBox(g: Graphics, ctx: ProcCtx): void {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy, w, d } = frame(ctx);
  const s = ctx.s;
  isoBox(g, cx - w * G('rb1Dx'), cy - d * G('rb1Dy'), w * G('rb1W'), d * G('rb1D'), G('rb1H') * s, S('rb1T'), S('rb1L'), S('rb1R'));
  isoBox(g, cx + w * G('rb2Dx'), cy - d * G('rb2Dy'), w * G('rb2W'), d * G('rb2D'), G('rb2H') * s, S('rb2T'), S('rb2L'), S('rb2R'));
}

/* ============ 屋顶招牌塔 + 红灯（v5 line 226–229） ============ */
export function signTower(g: Graphics, ctx: ProcCtx): void {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy, w, d } = frame(ctx);
  const s = ctx.s;
  const tcy = cy - d * G('stDy');
  const th = G('stH') * s;
  isoBox(g, cx, tcy, w * G('stW'), d * G('stD'), th, S('stT'), S('stL'), S('stR'));
  g.moveTo(cx, tcy - th).lineTo(cx, tcy - th - G('stMastH') * s)
    .stroke({ color: S('stMastFill'), width: G('stMastW') * s });
  g.circle(cx, tcy - th - G('stLampDy') * s, G('stLampR') * s).fill({ color: S('stLamp') });
}

/* ============ 独立天线（可从招牌塔上分离出来单独挂） ============ */
export function antenna(g: Graphics, ctx: ProcCtx): void {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy } = frame(ctx);
  const s = ctx.s;
  const h = G('anH') * s;
  g.moveTo(cx, cy).lineTo(cx, cy - h).stroke({ color: S('anFill'), width: G('anW') * s });
  g.circle(cx, cy - h - G('anLampDy') * s, G('anR') * s).fill({ color: S('anLamp') });
}

/* ============ 行道树（v5 isoTree line 98–108）—— ground，不随楼缩放 ============ */
export function tree(g: Graphics, ctx: ProcCtx): void {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy } = frame(ctx);
  const s = ctx.s * G('trScale');
  const h = G('trH') * s;
  const w = G('trW') * s;
  g.ellipse(cx, cy + G('trShDy') * s, G('trShRx') * s, G('trShRy') * s).fill({ color: S('trShadow') });
  fillPoly(g, [[cx, cy + G('trShDy') * s], [cx + w, cy], [cx + w, cy - h], [cx, cy + G('trShDy') * s - h]], S('trTrunkR'));
  fillPoly(g, [[cx, cy + G('trShDy') * s], [cx - w, cy], [cx - w, cy - h], [cx, cy + G('trShDy') * s - h]], S('trTrunkL'));
  for (const [dx, dy, r, c] of blobsOf(ctx.params as P)) {
    g.circle(cx + dx * s, cy + dy * s, r * s).fill({ color: c });
  }
  g.circle(cx + G('trHiDx') * s, cy - h - G('trHiDy') * s, G('trHiR') * s).fill({ color: S('trHiFill') });
}

/* ============ 路灯（v5 streetLamp line 110–116）—— ground ============ */
export function lamp(g: Graphics, ctx: ProcCtx): void {
  const { G, S } = getters(ctx.params as P);
  const { cx, cy } = frame(ctx);
  const s = ctx.s * G('lpScale');
  const h = G('lpH') * s;
  g.ellipse(cx, cy + G('lpShDy') * s, G('lpShRx') * s, G('lpShRy') * s).fill({ color: S('lpSh') });
  g.rect(cx - (G('lpPoleW') * s) / 2, cy - h, G('lpPoleW') * s, h).fill({ color: S('lpPoleFill') });
  g.circle(cx, cy - h - G('lpHeadDy') * s, G('lpGlowR') * s).fill({ color: S('lpGlow') });
  g.circle(cx, cy - h - G('lpHeadDy') * s, G('lpBulbR') * s).fill({ color: S('lpBulb') });
}