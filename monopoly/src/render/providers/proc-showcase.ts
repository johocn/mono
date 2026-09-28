import { dia } from '../iso';
import { ptsToPoly } from '../paint';
/* 取值器从依赖零的 proc-base.ts 取（与 proc-building/proc-props 同规），避免 proc ↔ proc-showcase 循环求值 */
import { fb, num, str } from './proc-base';
import type { ProcPreset } from './proc';

/**
 * 橱窗版式常量：`fb({...})` 是本工程唯一允许裸字面量的位置（Task 7 的 lint 豁免）。
 * 所有尺寸都是**面板局部坐标**（原点 = 面板左上角），units = CSS px。
 */
export const SHOWCASE_L = fb({
  /* 面板台位（v5 line 398–400：x 10 / y 322 / 370×300） */
  w: 370, h: 300, x: 10, y: 322,
  /* 地平线：占面板高度的 60%（v5 line 343 `const gy = h * 0.60`） */
  gy: 0.6,
  /* 月亮（v5 line 345） */
  moonX: 0.855, moonY: 0.3, moonR: 13, moonHaloF: 1.69,
  /* 夜空横带近似 */
  skyBands: 24, skyT1: 0.6, skyT2: 0.85,
  /* 天际线递推（v5 line 346–352） */
  skyStart: -6, skyW0: 16, skyWMod: 26, skyGap: 4,
  skyHMul: 13, skyHMod: 30, skyHModF: 100, skyHBase: 0.3,
  skyWinRows: 6, skyWinCols: 3, skyWinStepX: 6.4, skyWinStepY: 9,
  skyWinW: 2.6, skyWinH: 2.6, skyWinOx: 4, skyWinOy: 8,
  /* 石板广场（v5 line 355–357） */
  cyMax: 44, cyF: 0.92, slabDy: -4,
  slabRx: 0.45, slabRy: 0.52, inRx: 0.22, inRy: 0.26,
  /* 配景台位 [x 比例, y 绝对偏移, 缩放]（v5 line 359–362） */
  treeL: [0.13, 30, 1.45], treeR: [0.88, 20, 1.2],
  lampL: [0.04, 44, 1.3], lampR: [0.97, 32, 1.05],
  /* 大楼（v5 optB line 443：showcase(370, 300, 4, 3.2, …)） */
  shopScale: 3.2,
  /* 顶部药丸 / 底部信息条 / 金色按钮（v5 line 444–448） */
  pillX: 14, pillY: 12, pillW: 240, pillH: 26, pillR: 13,
  brandX: 28, brandY: 30, brandFs: 14,
  subX: 126, subY: 30, subFs: 10,
  barX: 14, barY: 248, barW: 342, barH: 38, barR: 12,
  barTx: 28, barTy1: 266, barFs1: 11, barTy2: 279, barFs2: 8.5,
  btnX: 240, btnY: 256, btnW: 106, btnH: 24, btnR: 12, btnCx: 293, btnCy: 272, btnFs: 10.5,
  /* —— C 版式：三张迷你卡并排（v5 line 449–455 `miniShop(160, 210, lv)` ×3） —— */
  miniW: 160, miniH: 210, miniY: 322, miniGap: 8,
  miniR: 12, miniGy: 0.62,
  /* 迷你天际线递推（v5 line 374）：高度三档 20 / 32 / 44 */
  miniSkyStart: -4, miniSkyW0: 12, miniSkyWM: 16, miniSkyWStep: 5, miniSkyGap: 3,
  miniSkyHBase: 20, miniSkyHTier: 3, miniSkyHStep: 12,
  /* 石板菱形（v5 line 376：dia(w/2, h*0.86, w*0.44, h*0.09)） */
  miniSlabY: 0.86, miniSlabRx: 0.44, miniSlabRy: 0.09,
  /* 卡内楼体（v5 line 377：isoShop(w/2, h*0.80, 1.35, lv, 32, {brand:'优美惠'})） */
  miniShopY: 0.8, miniS: 1.35, miniHue: 32,
  /* 卡缩放（390 宽舞台：3×160×0.72 + 2×8 = 361.6 ≤ 370）与卡外标签 */
  miniCardScale: 0.72, miniCapFs: 11, miniCapDrop: 12,
});

/** L4 内建兜底：橱窗的全部色值（v5 逐条对齐） */
const D = fb({
  panelFill: '#0f1a18', panelEdge: 'hsla(45,70%,55%,.5)', panelRadius: 16, panelEdgeW: 1,
  skyTop: '#0d1b2a', skyMid: '#16302f', skyBottom: '#1e2f2a', moon: '#e8f0ff',
  moonAlpha: 0.85, haloAlpha: 0.1,
  skylineFill: '#131f1c', skylineWin: 'rgba(255,214,130,.5)',
  groundFill: '#1b2622', slabFill: '#2a3830', slabEdge: 'rgba(255,255,255,.05)', slabEdgeW: 0.6, slabIn: '#33423a',
  pillBg: 'rgba(6,12,10,.8)', pillTx: '#ffffff', subTx: '#9fb3a8',
  barBg: 'rgba(6,12,10,.85)', barTx: '#ffffff',
  gold: '#f5c451', goldTx: '#1b1b1b',
  /* C 版式迷你卡（v5 line 371 / 374 / 450–452） */
  miniFill: '#101a17', miniSkyline: '#16221e', miniCapTx: '#e8e4d8',
});

/* —— 面板底板：圆角矩形（v5 showcase line 340） —— */
export const showcasePanel: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  g.roundRect(cx, cy, box.w, box.h, num(params, 'radius', D.panelRadius))
    .fill({ color: str(params, 'fill', D.panelFill) })
    .stroke({ color: str(params, 'edge', D.panelEdge), width: num(params, 'edgeW', D.panelEdgeW) });
};

/* —— 夜空：横带近似线性渐变 + 月亮与光晕（v5 line 343–345） —— */
export const showcaseSky: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const gy = box.h * num(params, 'gy', SHOWCASE_L.gy);
  const bands = num(params, 'bands', SHOWCASE_L.skyBands);
  const t1 = num(params, 't1', SHOWCASE_L.skyT1);
  const t2 = num(params, 't2', SHOWCASE_L.skyT2);
  const top = str(params, 'top', D.skyTop);
  const mid = str(params, 'mid', D.skyMid);
  const bottom = str(params, 'bottom', D.skyBottom);
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    g.rect(cx, cy + (gy * i) / bands, box.w, gy / bands + 1)
      .fill({ color: t < t1 ? top : t < t2 ? mid : bottom });
  }
  const mx = cx + box.w * num(params, 'moonX', SHOWCASE_L.moonX);
  const my = cy + box.h * num(params, 'moonY', SHOWCASE_L.moonY);
  const mr = num(params, 'moonR', SHOWCASE_L.moonR);
  const moon = str(params, 'moon', D.moon);
  g.circle(mx, my, mr).fill({ color: moon, alpha: num(params, 'moonA', D.moonAlpha) });
  g.circle(mx, my, mr * num(params, 'haloF', SHOWCASE_L.moonHaloF)).fill({ color: moon, alpha: num(params, 'haloA', D.haloAlpha) });
};

/* —— 天际线：楼块递推 + 每栋 6 扇亮窗（v5 line 346–352） —— */
export const showcaseSkyline: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const gy = box.h * num(params, 'gy', SHOWCASE_L.gy);
  const start = num(params, 'startX', SHOWCASE_L.skyStart);
  const w0 = num(params, 'bwBase', SHOWCASE_L.skyW0);
  const wm = num(params, 'bwMod', SHOWCASE_L.skyWMod);
  const gap = num(params, 'gap', SHOWCASE_L.skyGap);
  const hMul = num(params, 'hMul', SHOWCASE_L.skyHMul);
  const hMod = num(params, 'hMod', SHOWCASE_L.skyHMod);
  const hModF = num(params, 'hModF', SHOWCASE_L.skyHModF);
  const hBase = num(params, 'hBase', SHOWCASE_L.skyHBase);
  const rows = num(params, 'winRows', SHOWCASE_L.skyWinRows);
  const cols = num(params, 'winCols', SHOWCASE_L.skyWinCols);
  const stepX = num(params, 'winStepX', SHOWCASE_L.skyWinStepX);
  const stepY = num(params, 'winStepY', SHOWCASE_L.skyWinStepY);
  const winW = num(params, 'winW', SHOWCASE_L.skyWinW);
  const winH = num(params, 'winH', SHOWCASE_L.skyWinH);
  const winOx = num(params, 'winOx', SHOWCASE_L.skyWinOx);
  const winOy = num(params, 'winOy', SHOWCASE_L.skyWinOy);
  const fill = str(params, 'fill', D.skylineFill);
  const win = str(params, 'win', D.skylineWin);

  let px = start;
  while (px < box.w + Math.abs(start)) {
    const bw = w0 + ((px * 7) % wm + wm) % wm;
    const bh = gy * (hBase + ((px * hMul) % hMod + hMod) % hMod / hModF);
    g.rect(cx + px, cy + gy - bh, bw, bh).fill({ color: fill });
    for (let i = 0; i < rows; i++) {
      g.rect(cx + px + winOx + (i % cols) * stepX, cy + gy - bh + winOy + i * stepY, winW, winH).fill({ color: win });
    }
    px += bw + gap;
  }
};

/* —— 地面 + 两层石板广场（v5 line 354–357） —— */
export const showcaseGround: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const gy = box.h * num(params, 'gy', SHOWCASE_L.gy);
  const gh = box.h - gy;
  const ccx = cx + box.w / 2;
  const ccy = cy + gy + Math.min(gh, num(params, 'cyMax', SHOWCASE_L.cyMax)) * num(params, 'cyF', SHOWCASE_L.cyF);
  const dy = num(params, 'slabDy', SHOWCASE_L.slabDy);
  g.rect(cx, cy + gy, box.w, gh).fill({ color: str(params, 'fill', D.groundFill) });
  g.poly(ptsToPoly(dia(ccx, ccy + dy, box.w * num(params, 'slabRx', SHOWCASE_L.slabRx), gh * num(params, 'slabRy', SHOWCASE_L.slabRy))))
    .fill({ color: str(params, 'slab', D.slabFill) })
    .stroke({ color: str(params, 'slabEdge', D.slabEdge), width: num(params, 'slabEdgeW', D.slabEdgeW) });
  g.poly(ptsToPoly(dia(ccx, ccy + dy, box.w * num(params, 'inRx', SHOWCASE_L.inRx), gh * num(params, 'inRy', SHOWCASE_L.inRy))))
    .fill({ color: str(params, 'slabIn', D.slabIn) });
};

/* —— 信息条：顶部药丸 + 底部条 + 金色按钮（v5 optB line 444–448） ——
   `state.barDy` 把信息条整体上移（play 版式避开手牌行；缺省 0 = B 版式原位）；
   `state.btnOn === false` 时不画金色 CTA（play 版式棋盘上已有真实买卖键）。 */
export const showcaseHud: ProcPreset = (g, ctx) => {
  const { cx, cy, params, state } = ctx;
  const L = SHOWCASE_L;
  const barDy = num(state, 'barDy', 0);
  const btnOn = state.btnOn !== false;
  const pillTx = str(params, 'pillTx', D.pillTx);
  const subTx = str(params, 'subTx', D.subTx);
  const barTx = str(params, 'barTx', D.barTx);
  const goldTx = str(params, 'goldTx', D.goldTx);

  g.roundRect(cx + L.pillX, cy + L.pillY, L.pillW, L.pillH, L.pillR).fill({ color: str(params, 'pillBg', D.pillBg) });
  g.roundRect(cx + L.barX, cy + L.barY + barDy, L.barW, L.barH, L.barR).fill({ color: str(params, 'barBg', D.barBg) });
  if (btnOn) {
    g.roundRect(cx + L.btnX, cy + L.btnY + barDy, L.btnW, L.btnH, L.btnR).fill({ color: str(params, 'gold', D.gold) });
  }

  const emit = (key: string, x: number, y: number, size: number, fill: string): void => {
    const text = str(state, key, '');
    if (text) ctx.text?.({ text, x, y, size, fill, align: 'left' });
  };
  emit('brand', cx + L.brandX, cy + L.brandY, L.brandFs, pillTx);
  emit('sub', cx + L.subX, cy + L.subY, L.subFs, subTx);
  emit('line1', cx + L.barTx, cy + L.barTy1 + barDy, L.barFs1, barTx);
  emit('line2', cx + L.barTx, cy + L.barTy2 + barDy, L.barFs2, subTx);
  if (btnOn) emit('cta', cx + L.btnCx, cy + L.btnCy + barDy, L.btnFs, goldTx);
};

/* —— C 版式迷你卡：底板 + 迷你天际线（无窗）+ 地面/石板 + 卡外标签（v5 miniShop line 369–380） —— */
export const showcaseMini: ProcPreset = (g, ctx) => {
  const { cx, cy, box, s, params, state } = ctx;
  const L = SHOWCASE_L;
  const w = box.w * s;
  const h = box.h * s;
  const gyv = num(params, 'gy', L.miniGy);
  const gy = cy + h * gyv;

  g.roundRect(cx, cy, w, h, num(params, 'radius', L.miniR) * s).fill({ color: str(params, 'fill', D.miniFill) });

  /* 迷你天际线：只有楼块、没有窗（v5 line 374 的循环里没有窗） */
  const w0 = num(params, 'bwBase', L.miniSkyW0);
  const wm = num(params, 'bwMod', L.miniSkyWM);
  const wStep = num(params, 'bwStep', L.miniSkyWStep);
  const gap = num(params, 'gap', L.miniSkyGap);
  const hBase = num(params, 'hBase', L.miniSkyHBase);
  const hTier = num(params, 'hTier', L.miniSkyHTier);
  const hStep = num(params, 'hStep', L.miniSkyHStep);
  const sky = str(params, 'skyline', D.miniSkyline);
  let lx = L.miniSkyStart;
  while (lx < box.w + Math.abs(L.miniSkyStart)) {
    const bw = w0 + ((lx * wStep) % wm + wm) % wm;
    const tier = ((lx % hTier) + hTier) % hTier;
    const bh = hBase + tier * hStep;
    g.rect(cx + lx * s, gy - bh * s, bw * s, bh * s).fill({ color: sky });
    lx += bw + gap;
  }

  g.rect(cx, gy, w, h * (1 - gyv)).fill({ color: str(params, 'ground', D.groundFill) });
  g.poly(ptsToPoly(dia(
    cx + w / 2,
    cy + h * num(params, 'slabY', L.miniSlabY),
    w * num(params, 'slabRx', L.miniSlabRx),
    h * num(params, 'slabRy', L.miniSlabRy),
  ))).fill({ color: str(params, 'slab', D.slabFill) });

  /* 卡外标签：字号是舞台绝对 px（不随 s 缩放），保证三张卡下的字一样大 */
  const cap = str(state, 'caption', '');
  if (cap) {
    ctx.text?.({
      text: cap,
      x: cx + w / 2,
      y: cy + h + L.miniCapDrop,
      size: L.miniCapFs,
      fill: str(params, 'capTx', D.miniCapTx),
      align: 'center',
    });
  }
};