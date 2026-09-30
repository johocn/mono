import type { Graphics } from 'pixi.js';
import { up, win, type Pt } from '../iso';
import { ptsToPoly } from '../paint';
import { BUILDING_HEIGHTS } from '../../skin/registry';
import { hsl } from './proc-building';
import { arr, c, fb } from './proc-base';
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
  /* —— flagpole 旗杆（新增：细杆 + 三角旗 + 杆顶灯珠） —— */
  fpPoleH: 32, fpPoleW: 1.2, fpPoleFill: '#3a2a1c',
  fpShDy: 1, fpShRx: 3.4, fpShRy: 1.7, fpSh: 'rgba(0,0,0,.3)',
  fpKnobR: 1.8, fpKnobDy: 1.2, fpKnob: '#ffd9a0',
  fpFlagV: 0.92, fpFlagW: 11, fpFlagH: 6.4, fpFlagDrop: 3.2, fpFlag: '#c0392b',
  /* —— chimney 烟囱（新增：砖柱 + 顶帽 + 暖烟） —— */
  cmDx: 0.34, cmDy: 0.36, cmW: 0.2, cmD: 0.32, cmH: 20,
  cmT: '#8a5a3c', cmL: '#6b4227', cmR: '#57341e',
  cmCapK: 1.35, cmCapH: 2.4,
  cmSmokeN: 3, cmSmokeRise: 9, cmSmokeR: 3.2, cmSmokeK: 1.4, cmSmoke: 'rgba(255,225,190,.42)',
  /* —— barrel 木桶（新增：圆柱 + 双箍） —— */
  blRx: 5.2, blRy: 2.6, blH: 12, blBody: '#8a5a3c', blTop: '#a9714c', blBottom: '#5d3c25',
  blHoops: [0.34, 0.72], blHoopH: 1.3, blHoop: '#4a4a4a',
  /* —— lionStone 石狮（新增：基座 + 坐狮剪影） —— */
  lsBaseW: 7.2, lsBaseD: 3.6, lsBaseH: 4.5,
  lsBaseT: '#cfc7b6', lsBaseL: '#a89f8d', lsBaseR: '#8e8676',
  lsBodyW: 5, lsBodyD: 2.6, lsBodyH: 7.5,
  lsBodyT: '#e2dbcb', lsBodyL: '#c3bba8', lsBodyR: '#a89f8d',
  lsManeR: 3.9, lsHeadDy: 2.2, lsHeadR: 3.1, lsHead: '#eae3d3', lsMane: '#cfc7b6',
  lsDotDx: 1.2, lsDotDy: 0.6, lsDotR: 0.7, lsDot: '#6b6355',
  /* —— snowPile 雪堆（新增：半圆积雪 + 冷高光） —— */
  snRx: 8.4, snRy: 4.2, snRise: 6.2, snSeg: 9,
  snFill: '#dfe7ee', snHiK: 0.42, snHiV: 0.55, snHiRx: 4.2, snHiRy: 1.6, snHi: '#ffffff',
  snShDy: 0.8, snSh: 'rgba(0,0,0,.22)',
  /* —— clothesline 晾衣绳（新增：两点弧线 + 三片布） —— */
  clV: 0.62, clDx1: 0.72, clDx2: 0.72, clDd: 0, clSag: 4.4, clSeg: 8,
  clLine: '#3a2a1c', clLineW: 0.9, clPoleH: 7, clPoleW: 1.1, clPole: '#3a2a1c',
  clCloths: [0.22, 0.5, 0.78], clW: 5.4, clH: 6.6,
  clFills: ['#e8c05a', '#c0392b', '#8fc4b8'],
  /* —— steamVent 汤雾口（新增：石槽 + 上升雾气） —— */
  svW: 6.4, svD: 3.2, svH: 4, svMouthK: 0.72, svMouth: '#ffe9c0',
  svT: '#a89f8d', svL: '#8e8676', svR: '#6f6a5e',
  svMistN: 3, svMistRise: 10, svMistR: 3.4, svMistK: 1.5, svMist: 'rgba(255,238,205,.4)',
  /* —— stoneLantern 石灯笼（新增：基座 + 柱身 + 火袋 + 笠顶 + 宝顶） —— */
  slBaseW: 5.4, slBaseD: 2.7, slBaseH: 2.6,
  slBaseT: '#b9b1a0', slBaseL: '#948c7c', slBaseR: '#7b7365',
  slShaftW: 2.6, slShaftD: 1.3, slShaftH: 7,
  slShaftT: '#cfc7b6', slShaftL: '#a89f8d', slShaftR: '#8e8676',
  slFireW: 5.4, slFireD: 2.7, slFireH: 5.2,
  slFireT: '#d8d0bf', slFireL: '#b1a897', slFireR: '#948c7c',
  slGlowW: 2.6, slGlowH: 3, slGlowV: 0.34, slGlow: '#ffe9c0',
  slCapW: 7, slCapD: 3.5, slCapH: 2,
  slCapT: '#8e8676', slCapL: '#6f6a5e', slCapR: '#5d584e',
  slTipH: 2.6, slTipR: 1.5, slTip: '#8e8676',
});

/** 取值器：params 优先，缺则落 L4 兜底（spec §3.6.4 回退链末级） */
function getters(p: P) {
  return {
    G: (k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (PD as P)[k] as number),
    S: (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : (PD as P)[k] as string),
    A: (k: string): number[] => arr<number>(p, k) ?? ((PD as P)[k] as number[]),
    /** 字符串数组（如布片配色）：与 A 同构 */
    L: (k: string): string[] => arr<string>(p, k) ?? ((PD as P)[k] as string[]),
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
  const p = ctx.params as P;
  const { G, S, A } = getters(p);
  const { cx, y0, w, d, h } = frame(ctx);
  const F: Pt = [cx, y0 + d];
  const L: Pt = [cx - w, y0];
  fillPoly(g, win(L, F, h, G('awU1'), G('awU2'), G('awV1'), G('awV2')), S('awBase'));
  const us = A('awStripeUs');
  const stripe = c(p, 'sign', S('awStripe'));
  for (let i = 0; i < us.length; i++) {
    fillPoly(g, win(L, F, h, us[i], us[i] + G('awStripeW'), G('awV1'), G('awV2')), stripe);
  }
  fillPoly(g, win(L, F, h, G('awU1'), G('awU2'), G('awV1') - G('awLipH'), G('awV1')), S('awLip'));
}

/* ============ 红灯笼（v5 lantern line 118–127；两处挂点 line 249–250） ============ */
export function lantern(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S } = getters(p);
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
  g.ellipse(lx, ly, r, r * G('laRy')).fill({ color: c(p, 'sign', S('laFill')) });
  g.ellipse(lx - r * G('laHiDx'), ly - r * G('laHiDy'), r * G('laHiRx'), r * G('laHiRy'))
    .fill({ color: c(p, 'glow', S('laGlow')) });
  g.rect(lx - r * G('laCapHalf'), ly - r * G('laCapTop'), r * G('laCapW'), r * G('laCapH')).fill({ color: S('laCap') });
  g.rect(lx - r * G('laCapHalf'), ly + r * G('laCapBot'), r * G('laCapW'), r * G('laCapH')).fill({ color: S('laCap') });
  const ch = typeof ctx.state.char === 'string' ? (ctx.state.char as string) : '';
  if (ch) ctx.text?.({ text: ch, x: lx, y: ly + r * G('laCharDy'), size: r * G('laCharFs'), fill: S('laCharFill') });
}

/* ============ 竖招幌子（v5 vBanner line 82–89；挂点 line 244–246） ============ */
export function banner(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S } = getters(p);
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
    .fill({ color: c(p, 'sign', S('bnFill')) })
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
  const p = ctx.params as P;
  const { G, S } = getters(p);
  const { cx, cy, w, d } = frame(ctx);
  const s = ctx.s;
  const tcy = cy - d * G('stDy');
  const th = G('stH') * s;
  isoBox(g, cx, tcy, w * G('stW'), d * G('stD'), th, S('stT'), S('stL'), S('stR'));
  g.moveTo(cx, tcy - th).lineTo(cx, tcy - th - G('stMastH') * s)
    .stroke({ color: S('stMastFill'), width: G('stMastW') * s });
  g.circle(cx, tcy - th - G('stLampDy') * s, G('stLampR') * s).fill({ color: c(p, 'glow', S('stLamp')) });
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
  const p = ctx.params as P;
  const { G, S } = getters(p);
  const { cx, cy } = frame(ctx);
  const s = ctx.s * G('lpScale');
  const h = G('lpH') * s;
  g.ellipse(cx, cy + G('lpShDy') * s, G('lpShRx') * s, G('lpShRy') * s).fill({ color: S('lpSh') });
  g.rect(cx - (G('lpPoleW') * s) / 2, cy - h, G('lpPoleW') * s, h).fill({ color: S('lpPoleFill') });
  g.circle(cx, cy - h - G('lpHeadDy') * s, G('lpGlowR') * s).fill({ color: S('lpGlow') });
  g.circle(cx, cy - h - G('lpHeadDy') * s, G('lpBulbR') * s).fill({ color: c(p, 'glow', S('lpBulb')) });
}

/* ============ 旗杆（新增：细杆 + 三角旗 + 杆顶灯珠）—— ground ============ */
export function flagpole(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S } = getters(p);
  const { cx, cy } = frame(ctx);
  const s = ctx.s;
  const ph = G('fpPoleH') * s;
  g.ellipse(cx, cy + G('fpShDy') * s, G('fpShRx') * s, G('fpShRy') * s).fill({ color: S('fpSh') });
  g.moveTo(cx, cy).lineTo(cx, cy - ph).stroke({ color: S('fpPoleFill'), width: G('fpPoleW') * s });
  const fy = cy - ph * G('fpFlagV');
  fillPoly(g, [
    [cx, fy],
    [cx + G('fpFlagW') * s, fy + G('fpFlagDrop') * s],
    [cx, fy + G('fpFlagH') * s],
  ], c(p, 'sign', S('fpFlag')));
  g.circle(cx, cy - ph - G('fpKnobDy') * s, G('fpKnobR') * s).fill({ color: c(p, 'glow', S('fpKnob')) });
}

/* ============ 烟囱（新增：砖柱 + 顶帽 + 暖烟）—— roof，直接用已抬升的 cy ============ */
export function chimney(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S } = getters(p);
  const { cx, cy, w, d } = frame(ctx);
  const s = ctx.s;
  const bx = cx + w * G('cmDx');
  const by = cy - d * G('cmDy');
  const bw = w * G('cmW');
  const bd = d * G('cmD');
  const bh = G('cmH') * s;
  isoBox(g, bx, by, bw, bd, bh, S('cmT'), S('cmL'), S('cmR'));
  const ch = G('cmCapH') * s;
  isoBox(g, bx, by - bh, bw * G('cmCapK'), bd * G('cmCapK'), ch, S('cmT'), S('cmL'), S('cmR'));
  /* 暖烟：自帽口升起，越高越大越淡 */
  const topY = by - bh - ch;
  const n = G('cmSmokeN');
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / n;
    g.circle(bx + k * G('cmSmokeK') * s, topY - k * G('cmSmokeRise') * s, G('cmSmokeR') * s * k)
      .fill({ color: S('cmSmoke') });
  }
}

/* ============ 木桶（新增：底椭圆 + 桶身 + 顶面 + 双箍）—— ground ============ */
export function barrel(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S, A } = getters(p);
  const { cx, cy } = frame(ctx);
  const s = ctx.s;
  const rx = G('blRx') * s;
  const ry = G('blRy') * s;
  const bh = G('blH') * s;
  g.ellipse(cx, cy, rx, ry).fill({ color: S('blBottom') });
  g.rect(cx - rx, cy - bh, rx * 2, bh).fill({ color: c(p, 'wallR', S('blBody')) });
  g.ellipse(cx, cy - bh, rx, ry).fill({ color: c(p, 'wallL', S('blTop')) });
  for (const v of A('blHoops')) {
    g.rect(cx - rx, cy - bh + v * bh, rx * 2, G('blHoopH') * s).fill({ color: S('blHoop') });
  }
}

/* ============ 石狮（新增：方台基座 + 坐狮剪影）—— ground ============ */
export function lionStone(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S } = getters(p);
  const { cx, cy } = frame(ctx);
  const s = ctx.s;
  const bh = G('lsBaseH') * s;
  isoBox(g, cx, cy,
    G('lsBaseW') * s, G('lsBaseD') * s, bh,
    S('lsBaseT'), S('lsBaseL'), S('lsBaseR'));
  const topY = cy - bh;
  const lh = G('lsBodyH') * s;
  isoBox(g, cx, topY,
    G('lsBodyW') * s, G('lsBodyD') * s, lh,
    S('lsBodyT'), S('lsBodyL'), S('lsBodyR'));
  /* 鬃毛盘 + 头：剪影式两层圆 */
  const hy = topY - lh - G('lsHeadDy') * s;
  g.circle(cx, hy, G('lsManeR') * s).fill({ color: S('lsMane') });
  g.circle(cx, hy, G('lsHeadR') * s).fill({ color: S('lsHead') });
  g.circle(cx - G('lsDotDx') * s, hy - G('lsDotDy') * s, G('lsDotR') * s).fill({ color: S('lsDot') });
  g.circle(cx + G('lsDotDx') * s, hy - G('lsDotDy') * s, G('lsDotR') * s).fill({ color: S('lsDot') });
}

/* ============ 雪堆（新增：半圆积雪 + 冷高光）—— ground，冷色只取自 palette ============ */
export function snowPile(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S } = getters(p);
  const { cx, cy } = frame(ctx);
  const s = ctx.s;
  const rx = G('snRx') * s;
  const ry = G('snRy') * s;
  const rise = G('snRise') * s;
  g.ellipse(cx, cy + G('snShDy') * s, rx, ry).fill({ color: S('snSh') });
  /* 上半椭圆按 snSeg 段折线近似：左端 → 顶点 → 右端，闭合回地面线 */
  const n = G('snSeg');
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (1 - i / n);
    pts.push([cx + rx * Math.cos(a), cy - rise * Math.sin(a)]);
  }
  fillPoly(g, pts, c(p, 'wallR', S('snFill')));
  g.ellipse(cx - rx * G('snHiK'), cy - rise * G('snHiV'), G('snHiRx') * s, G('snHiRy') * s)
    .fill({ color: c(p, 'glow', S('snHi')) });
}

/* ============ 晾衣绳（新增：两端立杆 + 悬垂弧线 + 三片布）—— wall ============ */
export function clothesline(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S, A, L } = getters(p);
  const { cx, y0, w, d, h } = frame(ctx);
  const s = ctx.s;
  const x0 = cx - w * G('clDx1');
  const x1 = cx + w * G('clDx2');
  const yTop = y0 + d * G('clDd') - h * G('clV');
  const sag = G('clSag') * s;
  const poleH = G('clPoleH') * s;
  const poleW = G('clPoleW') * s;
  for (const px of [x0, x1]) {
    g.moveTo(px, yTop + poleH).lineTo(px, yTop).stroke({ color: S('clPole'), width: poleW });
  }
  /* 悬链近似为抛物线：中点最低 sag */
  const n = G('clSeg');
  g.moveTo(x0, yTop);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    g.lineTo(x0 + (x1 - x0) * t, yTop + sag * 4 * t * (1 - t));
  }
  g.stroke({ color: S('clLine'), width: G('clLineW') * s });
  /* 布片：按 clCloths 的比例挂在弧线上 */
  const us = A('clCloths');
  const fills = L('clFills');
  const cw = G('clW') * s;
  const chh = G('clH') * s;
  for (let i = 0; i < us.length; i++) {
    const t = us[i];
    const px = x0 + (x1 - x0) * t;
    const py = yTop + sag * 4 * t * (1 - t);
    fillPoly(g, [[px - cw / 2, py], [px + cw / 2, py], [px + cw / 2, py + chh], [px - cw / 2, py + chh]],
      fills[i % fills.length]);
  }
}

/* ============ 汤雾口（新增：石槽 + 上升雾气）—— ground ============ */
export function steamVent(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S } = getters(p);
  const { cx, cy } = frame(ctx);
  const s = ctx.s;
  const vw = G('svW') * s;
  const vd = G('svD') * s;
  const vh = G('svH') * s;
  isoBox(g, cx, cy, vw, vd, vh, S('svT'), S('svL'), S('svR'));
  /* 槽口：顶面内缩一圈的暖色水面 */
  const topY = cy - vh;
  const k = G('svMouthK');
  fillPoly(g, [
    [cx - vw * k, topY], [cx, topY - vd * k], [cx + vw * k, topY], [cx, topY + vd * k],
  ], c(p, 'glow', S('svMouth')));
  /* 雾气：三团自槽口升起 */
  const n = G('svMistN');
  for (let i = 0; i < n; i++) {
    const kk = (i + 1) / n;
    const r = G('svMistR') * s * kk;
    g.ellipse(cx, topY - kk * G('svMistRise') * s, r * G('svMistK'), r).fill({ color: S('svMist') });
  }
}

/* ============ 石灯笼（新增：基座 + 柱身 + 火袋 + 笠顶 + 宝顶）—— ground ============ */
export function stoneLantern(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const { G, S } = getters(p);
  const { cx, cy } = frame(ctx);
  const s = ctx.s;
  let at = cy;
  isoBox(g, cx, at, G('slBaseW') * s, G('slBaseD') * s, G('slBaseH') * s,
    S('slBaseT'), S('slBaseL'), S('slBaseR'));
  at -= G('slBaseH') * s;
  isoBox(g, cx, at, G('slShaftW') * s, G('slShaftD') * s, G('slShaftH') * s,
    S('slShaftT'), S('slShaftL'), S('slShaftR'));
  at -= G('slShaftH') * s;
  const fh = G('slFireH') * s;
  isoBox(g, cx, at, G('slFireW') * s, G('slFireD') * s, fh,
    S('slFireT'), S('slFireL'), S('slFireR'));
  /* 火袋暖窗：开在左前立面 */
  const gw = G('slGlowW') * s;
  const gh = G('slGlowH') * s;
  g.rect(cx - gw, at - fh * G('slGlowV') - gh, gw, gh).fill({ color: c(p, 'glow', S('slGlow')) });
  at -= fh;
  const capH = G('slCapH') * s;
  isoBox(g, cx, at, G('slCapW') * s, G('slCapD') * s, capH,
    S('slCapT'), S('slCapL'), S('slCapR'));
  at -= capH;
  g.circle(cx, at - G('slTipH') * s, G('slTipR') * s).fill({ color: S('slTip') });
}