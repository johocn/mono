import { arr, c, fb, num, str } from './proc-base';
import type { ProcPreset } from './proc';

/**
 * L4 内建兜底：环境层（夜空 / 星点 / 月 / 远山 / 街市带 / 街灯 / 灯笼串）的全部几何与色值。
 * 本文件唯一允许出现裸字面量的位置（`fb({...})` 是 `no-visual-number` / `no-hardcoded-color` 的豁免）。
 * 所有色值都走 `c(params, 色键, 兜底)`：出厂配色由 `config/theme.json` 的 `bg.*` binding 注入。
 */
const AD = fb({
  /* 夜空：三段横带近似渐变 + 一层 palette 叠色（保持"暖调夜"底色，又能随配色变化） */
  bands: 12, skyT1: 0.5, skyT2: 0.82,
  skyTop: '#1d1a2e', skyMid: '#33262c', skyBottom: '#4a3226',
  skyTint: '#4a3b2a', skyTintA: 0.22,
  /* 星点：确定性伪随机（无 Math.random，保证同帧同帧可复现） */
  starCount: 46, starRMin: 0.7, starRMax: 1.8, starFill: '#ffe9c0', starAlpha: 0.72,
  starBrightK: 0.55, starBand: 0.62, starHashA: 2654435761, starHashB: 40503,
  starMod: 4294967296,
  /* 月：圆盘 + 光晕 */
  moonR: 15, moonFill: '#ffe3ae', moonHaloF: 2.2, moonHaloA: 0.12, moonAlpha: 0.92,
  /* 远山：峰高（占包围盒高的比例）序列 + 底线闭合多边形 */
  ridgePeaks: [0.32, 0.58, 0.26, 0.82, 0.4, 0.66, 0.24, 0.52, 0.34],
  ridgeFill: '#8f4a33', ridgeAlpha: 0.92,
  /* 街市带：一排剪影楼块（等差高度）+ 成排暖窗 + 街面 */
  streetBlocks: 9, streetBlockH: [0.38, 0.62, 0.46, 0.78, 0.34, 0.56, 0.7, 0.44, 0.6],
  streetH: 0.42, streetFill: '#241c22', streetGround: '#4a3b2a', streetGroundA: 0.85,
  streetWinRows: 3, streetWinCols: 2, streetWinW: 4.4, streetWinH: 5.2,
  streetWinGapX: 7, streetWinStepY: 13, streetWinPadX: 5, streetWinPadY: 7,
  streetWinFill: '#ffcf7a', streetWinAlpha: 0.62, streetBlockGap: 3,
  /* 街灯：立柱 + 灯泡 + 光晕 + 地面暖光池 */
  lampPoleH: 46, lampPoleW: 2.4, lampPoleFill: '#2c2320',
  lampGlowR: 16, lampGlowFill: '#ffcf7a', lampGlowAlpha: 0.18,
  lampBulbR: 4.2, lampBulbFill: '#ffe3ae',
  lampPoolRx: 13, lampPoolRy: 5.4, lampPoolA: 0.16,
  /* 灯笼串：悬链绳 + n 只灯笼（暖金） */
  laCount: 7, laSeg: 8, laR: 5.2, laRy: 0.86, laRod: 5,
  laGlowK: 1.9, laGlowA: 0.34, laFill: '#f5c451', laGlowFill: '#ffd9a0',
  laLine: '#3a2a1c', laLineW: 1, laY: 6, laX0: 22, laX1: 22, laSag: 9,
});

/* —— 夜空：整屏纵向渐变（横带近似）+ palette 叠色 —— */
export const skyGradient: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const bands = num(params, 'bands', AD.bands);
  const t1 = num(params, 't1', AD.skyT1);
  const t2 = num(params, 't2', AD.skyT2);
  const top = str(params, 'top', AD.skyTop);
  const mid = str(params, 'mid', AD.skyMid);
  const bottom = str(params, 'bottom', AD.skyBottom);
  const bh = box.h / bands;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    g.rect(cx, cy + i * bh, box.w, bh + 1).fill({ color: t < t1 ? top : t < t2 ? mid : bottom });
  }
  g.rect(cx, cy, box.w, box.h)
    .fill({ color: c(params, 'tileFill', AD.skyTint), alpha: num(params, 'tintA', AD.skyTintA) });
};

/* —— 星点：单 Graphics 多点绘制（合批，控元素预算）；位置由确定性哈希给出 —— */
export const starField: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const n = num(params, 'count', AD.starCount);
  const rMin = num(params, 'rMin', AD.starRMin);
  const rMax = num(params, 'rMax', AD.starRMax);
  const fill = c(params, 'win', AD.starFill);
  const alpha = num(params, 'alpha', AD.starAlpha);
  const bright = num(params, 'brightK', AD.starBrightK);
  const band = box.h * num(params, 'band', AD.starBand);
  const hashA = num(params, 'hashA', AD.starHashA);
  const hashB = num(params, 'hashB', AD.starHashB);
  const mod = num(params, 'mod', AD.starMod);
  for (let i = 0; i < n; i++) {
    const hx = ((i * hashA) % mod) / mod;
    const hy = ((i * hashB + mod / (i + 1)) % mod) / mod;
    const r = rMin + (rMax - rMin) * ((i % 3) / 3);
    g.circle(cx + hx * box.w, cy + hy * band, r)
      .fill({ color: fill, alpha: i % 4 === 0 ? alpha : alpha * bright });
  }
};

/* —— 月：光晕盘 + 实体盘（先光晕后盘，避免盘被光晕糊掉） —— */
export const moonDisc: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const r = num(params, 'r', AD.moonR);
  const mx = cx + box.w / 2;
  const my = cy + box.h / 2;
  const fill = c(params, 'glow', AD.moonFill);
  g.circle(mx, my, r * num(params, 'haloF', AD.moonHaloF))
    .fill({ color: fill, alpha: num(params, 'haloA', AD.moonHaloA) });
  g.circle(mx, my, r).fill({ color: fill, alpha: num(params, 'alpha', AD.moonAlpha) });
};

/* —— 远山剪影：峰高序列折线 + 底线闭合（fill 吃 palette.roof，剪影色随配色换） —— */
export const ridgeSilhouette: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const peaks = arr<number>(params, 'peaks') ?? AD.ridgePeaks;
  const baseY = cy + box.h;
  const step = box.w / (peaks.length - 1);
  const pts: number[] = [cx, baseY];
  for (let i = 0; i < peaks.length; i++) pts.push(cx + i * step, baseY - box.h * peaks[i]);
  pts.push(cx + box.w, baseY);
  g.poly(pts).fill({
    color: c(params, 'roof', AD.ridgeFill),
    alpha: num(params, 'alpha', AD.ridgeAlpha),
  });
};

/* —— 街市带：一排剪影楼块 + 成排暖窗（贴地线的下半段为街面，吃 palette.tileFill） —— */
export const streetBand: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const blocks = num(params, 'blocks', AD.streetBlocks);
  const hs = arr<number>(params, 'blockH') ?? AD.streetBlockH;
  const silFill = str(params, 'fill', AD.streetFill);
  const winFill = c(params, 'win', AD.streetWinFill);
  const winAlpha = num(params, 'winAlpha', AD.streetWinAlpha);
  const rowH = box.h * num(params, 'rowH', AD.streetH);
  const rowY = cy + box.h - rowH;
  const bw = box.w / blocks;
  const gap = num(params, 'blockGap', AD.streetBlockGap);
  const rows = num(params, 'winRows', AD.streetWinRows);
  const cols = num(params, 'winCols', AD.streetWinCols);
  const winW = num(params, 'winW', AD.streetWinW);
  const winH = num(params, 'winH', AD.streetWinH);
  const gapX = num(params, 'winGapX', AD.streetWinGapX);
  const stepY = num(params, 'winStepY', AD.streetWinStepY);
  const padX = num(params, 'winPadX', AD.streetWinPadX);
  const padY = num(params, 'winPadY', AD.streetWinPadY);

  g.rect(cx, rowY, box.w, rowH)
    .fill({ color: c(params, 'tileFill', AD.streetGround), alpha: num(params, 'groundA', AD.streetGroundA) });

  for (let i = 0; i < blocks; i++) {
    const bh = box.h * hs[i % hs.length];
    const bx = cx + i * bw;
    g.rect(bx, rowY - bh, bw - gap, bh).fill({ color: silFill });
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        g.rect(bx + padX + k * (winW + gapX), rowY - bh + padY + r * stepY, winW, winH)
          .fill({ color: winFill, alpha: winAlpha });
      }
    }
  }
};

/* —— 街灯：地面暖光池 + 立柱 + 光晕 + 灯珠 —— */
export const streetLamp: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const x = cx + box.w / 2;
  const y = cy + box.h;
  const poleH = num(params, 'poleH', AD.lampPoleH);
  const poleW = num(params, 'poleW', AD.lampPoleW);
  const glow = c(params, 'glow', AD.lampGlowFill);
  g.ellipse(x, y, num(params, 'poolRx', AD.lampPoolRx), num(params, 'poolRy', AD.lampPoolRy))
    .fill({ color: glow, alpha: num(params, 'poolA', AD.lampPoolA) });
  g.rect(x - poleW / 2, y - poleH, poleW, poleH).fill({ color: str(params, 'pole', AD.lampPoleFill) });
  g.circle(x, y - poleH, num(params, 'glowR', AD.lampGlowR))
    .fill({ color: glow, alpha: num(params, 'glowA', AD.lampGlowAlpha) });
  g.circle(x, y - poleH, num(params, 'bulbR', AD.lampBulbR))
    .fill({ color: c(params, 'win', AD.lampBulbFill) });
};

/* —— 灯笼串：两端固定 + 抛物线悬垂绳 + n 只暖金灯笼（绳长随 sag 下垂） —— */
export const lanternString: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const n = num(params, 'count', AD.laCount);
  const sag = num(params, 'sag', AD.laSag);
  const line = str(params, 'line', AD.laLine);
  const lineW = num(params, 'lineW', AD.laLineW);
  const fill = c(params, 'sign', AD.laFill);
  const glow = c(params, 'glow', AD.laGlowFill);
  const r = num(params, 'r', AD.laR);
  const rod = num(params, 'rod', AD.laRod);
  const y0 = cy + num(params, 'y', AD.laY);
  const x0 = cx + num(params, 'x0', AD.laX0);
  const x1 = cx + box.w - num(params, 'x1', AD.laX1);
  const seg = num(params, 'seg', AD.laSeg);
  const drop = (t: number): number => sag * 4 * t * (1 - t);

  g.moveTo(x0, y0);
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    g.lineTo(x0 + (x1 - x0) * t, y0 + drop(t));
  }
  g.stroke({ color: line, width: lineW });

  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    const px = x0 + (x1 - x0) * t;
    const py = y0 + drop(t) + rod;
    g.moveTo(px, py - rod).lineTo(px, py).stroke({ color: line, width: lineW });
    g.circle(px, py + r, r * num(params, 'glowK', AD.laGlowK))
      .fill({ color: glow, alpha: num(params, 'glowA', AD.laGlowA) });
    g.ellipse(px, py + r, r, r * num(params, 'ry', AD.laRy)).fill({ color: fill });
  }
};