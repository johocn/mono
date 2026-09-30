/**
 * M5 浮层 preset（手牌槽 / 卡面 / 卡背 / 行情行 / 行情图 / 结算行 / 角标）。
 *
 * 与 proc-hud.ts 同规：全部取值经 `G()/S()` 从 `params` 读（skin.json 给参数，缺省落 `PANEL_D` 内建兜底），
 * 因此本文件不出现裸色值/裸几何常数（`no-visual-number` / `no-hardcoded-color` 门）。
 * 所有元素**以 cx/cy 为中心**绘制（与 uiPanel/uiButton 一致），台位由 ElementSpec.fixed 给。
 */
import { fb, num, str } from './proc-base';
import type { ProcPreset } from './proc';

/** L4 内建兜底默认值（spec §3.6.4）：浮层全部几何/色值集中声明一次 */
export const PANEL_D = fb({
  /* 手牌槽 */
  slotR: 8, slotFill: '#1f2f2a', slotEmptyFill: '#141d1a', slotDimAlpha: 0.45,
  slotEdge: '#3a4a42', slotEdgeOn: '#f5c451', slotEdgeW: 1.2,
  slotFs: 12, slotTextFill: '#ffe9b0', slotTextEmpty: '#5b6b63', slotTextDy: 0,
  /* 卡面（命运/机会/道具）：字号/偏移/圆角一律 × s（事件卡放大到 3.2 倍时字随卡一起变大，
     否则大字卡里仍是 14/10px 小字）；pad 为正文折行留边（wrapW = w − 2·pad） */
  cardR: 10, cardFill: '#14201d', cardEdge: '#3a4a42', cardEdgeW: 1.2,
  cardBandH: 22, cardBand: '#40305c',
  cardTitleFs: 9, cardTitleDy: -34, cardTitleFill: '#ffe9b0',
  cardTextFs: 8, cardTextDy: 11, cardTextFill: '#d8e4dc', cardTextPad: 8,
  /* 卡背（未翻面） */
  backR: 10, backFill: '#2b3566', backEdge: '#6b7ff0', backEdgeW: 1.2,
  backInR: 6, backInInset: 8, backInFill: '#1c2440',
  /* 行情行：两行（上排 代码/名称/现价/涨跌，下排 持股/市值） */
  rowR: 6, rowFill: '#16221e', rowEdge: '#2a3830', rowEdgeW: 1,
  rowTopDy: -8, rowBotDy: 9,
  codeDx: -146, codeFs: 11, nameDx: -92, nameFs: 11,
  priceDx: 26, priceFs: 12, changeDx: 96, changeFs: 11,
  sharesDx: -140, valueDx: 90, subFs: 10,
  codeFill: '#d8e4dc', nameFill: '#9fb3a8', priceFill: '#ffe9b0',
  subFill: '#9fb3a8', valueFill: '#ffe9b0',
  shareLabel: '持股', valueLabel: '市值',
  upFill: '#e0606a', downFill: '#3fbf7f', flatFill: '#9fb3a8',
  /* 行情图（近价走势折线 + 端点涨跌脉冲；无柱状图） */
  chartR: 8, chartFill: 'rgba(10,18,16,.7)', chartEdge: '#2a3830', chartEdgeW: 1,
  chartPadX: 10, chartPadY: 9, gridLines: 2, gridW: 1, gridFill: 'rgba(255,255,255,.07)',
  lineW: 2, lineUp: '#e0606a', lineDown: '#3fbf7f', lineFlat: '#9fb3a8',
  dotR: 3, pulseR: 6, pulseAlpha: 0.28,
  capFs: 9, capFill: '#9fb3a8', capDx: 10, capDy: 8,
  /* 结算行 */
  sRowR: 8, sRowFill: '#16221e', sRowWinFill: '#1f2f2a',
  sRowEdge: '#2a3830', sRowEdgeWin: '#f5c451', sRowEdgeW: 1,
  sRankDx: -140, sNameDx: -70, sWorthDx: 100,
  sRankFs: 13, sNameFs: 13, sWorthFs: 13,
  sRankFill: '#ffe9b0', sNameFill: '#d8e4dc', sWorthFill: '#ffe9b0',
  /* 角标 */
  badgeR: 8, badgeFill: 'rgba(6,12,10,.85)', badgeEdge: '#f5c451', badgeEdgeW: 1.2,
  badgeFs: 12, badgeTxFill: '#ffe9b0',
  /* 落地地块卡（spec §7.3）：深底金边 + 首行（金点 + 「停在 <店名> · 你在这里」）+ 次行（等级 / 持有） */
  tileR: 12, tileFill: '#0f1a18', tileEdge: '#f5c451', tileEdgeW: 1.2,
  tilePadX: 18, tileDotR: 3, tileDotGap: 10,
  tileTitleDy: -26, tileTitleFs: 14, tileTitleFill: '#f5c451',
  tileSubDy: -12, tileSubFs: 11, tileSubFill: '#9fb3a8',
});

const G = (p: Record<string, unknown>, k: keyof typeof PANEL_D): number => num(p, k, PANEL_D[k] as number);
const S = (p: Record<string, unknown>, k: keyof typeof PANEL_D): string => str(p, k, PANEL_D[k] as string);
const st = (state: Record<string, unknown>, k: string): unknown => state[k];

/* —— 手牌槽：圆角底 + 居中卡名（持有/可用/被动灰槽三态） —— */
export const uiHandSlot: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const held = state.held === true;
  const enabled = state.enabled === true;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'slotR'))
    .fill({ color: held ? S(params, 'slotFill') : S(params, 'slotEmptyFill'), alpha: enabled ? 1 : G(params, 'slotDimAlpha') })
    .stroke({ color: enabled ? S(params, 'slotEdgeOn') : S(params, 'slotEdge'), width: G(params, 'slotEdgeW') });
  if (!text) return;
  text({
    text: typeof st(state, 'name') === 'string' ? String(st(state, 'name')) : '',
    x: cx, y: cy + G(params, 'slotTextDy'), size: G(params, 'slotFs'),
    fill: held ? S(params, 'slotTextFill') : S(params, 'slotTextEmpty'),
  });
};

/* —— 卡面：圆角底 + 顶部色带 + 标题/文案（命运/机会/道具通用）—— */
export const uiCard: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'cardR') * s)
    .fill({ color: S(params, 'cardFill') })
    .stroke({ color: S(params, 'cardEdge'), width: G(params, 'cardEdgeW') * s });
  g.rect(cx - w / 2, cy - h / 2, w, G(params, 'cardBandH') * s)
    .fill({ color: S(params, 'cardBand') });
  if (!text) return;
  /* 正文按卡面内宽折行（CJK 逐字断行）：最长文案「随机获得 1 张道具卡（手牌满则折现 ￥100）」22 字 */
  const wrapW = w - 2 * G(params, 'cardTextPad') * s;
  text({
    text: typeof st(state, 'title') === 'string' ? String(st(state, 'title')) : '',
    x: cx, y: cy + G(params, 'cardTitleDy') * s, size: G(params, 'cardTitleFs') * s,
    fill: S(params, 'cardTitleFill'), wrapW,
  });
  text({
    text: typeof st(state, 'text') === 'string' ? String(st(state, 'text')) : '',
    x: cx, y: cy + G(params, 'cardTextDy') * s, size: G(params, 'cardTextFs') * s,
    fill: S(params, 'cardTextFill'), wrapW,
  });
};

/* —— 卡背：圆角底 + 内嵌圆角（翻牌前/牌堆） —— */
export const uiCardBack: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, s } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'backR'))
    .fill({ color: S(params, 'backFill') })
    .stroke({ color: S(params, 'backEdge'), width: G(params, 'backEdgeW') });
  const inset = G(params, 'backInInset');
  g.roundRect(cx - w / 2 + inset, cy - h / 2 + inset, w - inset * 2, h - inset * 2, G(params, 'backInR'))
    .fill({ color: S(params, 'backInFill') });
};

/* —— 行情行：圆角底 + 两行（上排 代码/名称/现价/涨跌，下排 持股/市值，涨红跌绿） —— */
export const uiStockRow: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const change = typeof state.change === 'number' ? state.change : 0;
  const changeFill = change > 0 ? S(params, 'upFill') : change < 0 ? S(params, 'downFill') : S(params, 'flatFill');
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'rowR'))
    .fill({ color: S(params, 'rowFill') })
    .stroke({ color: S(params, 'rowEdge'), width: G(params, 'rowEdgeW') });
  if (!text) return;
  const y1 = cy + G(params, 'rowTopDy');
  const y2 = cy + G(params, 'rowBotDy');
  text({ text: typeof state.code === 'string' ? state.code : '', x: cx + G(params, 'codeDx'), y: y1, size: G(params, 'codeFs'), fill: S(params, 'codeFill') });
  text({ text: typeof state.name === 'string' ? state.name : '', x: cx + G(params, 'nameDx'), y: y1, size: G(params, 'nameFs'), fill: S(params, 'nameFill') });
  text({ text: typeof state.price === 'number' ? `￥${state.price}` : '', x: cx + G(params, 'priceDx'), y: y1, size: G(params, 'priceFs'), fill: S(params, 'priceFill') });
  text({ text: `${change > 0 ? '+' : ''}${change}`, x: cx + G(params, 'changeDx'), y: y1, size: G(params, 'changeFs'), fill: changeFill });
  const shares = typeof state.shares === 'number' ? state.shares : 0;
  const value = typeof state.value === 'number' ? state.value : 0;
  text({ text: `${S(params, 'shareLabel')} ${shares}`, x: cx + G(params, 'sharesDx'), y: y2, size: G(params, 'subFs'), fill: S(params, 'subFill') });
  text({ text: `${S(params, 'valueLabel')} ￥${value}`, x: cx + G(params, 'valueDx'), y: y2, size: G(params, 'subFs'), fill: S(params, 'valueFill') });
};

/* —— 行情图：圆角底 + 水平参考线 + 近价折线（极值归一化）+ 端点涨跌脉冲 —— */
export const uiStockChart: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  g.roundRect(x0, y0, w, h, G(params, 'chartR'))
    .fill({ color: S(params, 'chartFill') })
    .stroke({ color: S(params, 'chartEdge'), width: G(params, 'chartEdgeW') });
  const px = G(params, 'chartPadX');
  const py = G(params, 'chartPadY');
  const iw = w - px * 2;
  const ih = h - py * 2;
  const gl = G(params, 'gridLines');
  for (let i = 1; i <= gl; i++) {
    const gy = y0 + (h * i) / (gl + 1);
    g.moveTo(x0 + px, gy).lineTo(x0 + w - px, gy)
      .stroke({ color: S(params, 'gridFill'), width: G(params, 'gridW') });
  }
  const series = Array.isArray(state.series) ? (state.series as number[]) : [];
  if (series.length >= 2) {
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min;
    const first = series[0];
    const last = series[series.length - 1];
    const line = last > first ? S(params, 'lineUp') : last < first ? S(params, 'lineDown') : S(params, 'lineFlat');
    const step = iw / (series.length - 1);
    const yOf = (v: number): number => y0 + h - py - (span === 0 ? 0.5 : (v - min) / span) * ih;
    g.moveTo(x0 + px, yOf(first));
    for (let i = 1; i < series.length; i++) g.lineTo(x0 + px + step * i, yOf(series[i]));
    g.stroke({ color: line, width: G(params, 'lineW') });
    g.circle(x0 + px + iw, yOf(last), G(params, 'pulseR')).fill({ color: line, alpha: G(params, 'pulseAlpha') });
    g.circle(x0 + px + iw, yOf(last), G(params, 'dotR')).fill({ color: line });
  }
  if (!text) return;
  if (typeof state.label === 'string' && state.label) {
    text({ text: state.label, x: x0 + G(params, 'capDx'), y: y0 + G(params, 'capDy'), size: G(params, 'capFs'), fill: S(params, 'capFill') });
  }
};

/* —— 结算行：圆角底 + 名次/玩家/净资产（胜者金框） —— */
export const uiSettleRow: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const win = state.winner === true;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'sRowR'))
    .fill({ color: win ? S(params, 'sRowWinFill') : S(params, 'sRowFill') })
    .stroke({ color: win ? S(params, 'sRowEdgeWin') : S(params, 'sRowEdge'), width: G(params, 'sRowEdgeW') });
  if (!text) return;
  text({ text: typeof state.rank === 'number' ? `#${state.rank}` : '', x: cx + G(params, 'sRankDx'), y: cy, size: G(params, 'sRankFs'), fill: S(params, 'sRankFill') });
  text({ text: typeof state.name === 'string' ? state.name : '', x: cx + G(params, 'sNameDx'), y: cy, size: G(params, 'sNameFs'), fill: S(params, 'sNameFill') });
  text({ text: typeof state.worth === 'number' ? `￥${state.worth}` : '', x: cx + G(params, 'sWorthDx'), y: cy, size: G(params, 'sWorthFs'), fill: S(params, 'sWorthFill') });
};

/* —— 落地地块卡：深底圆角金边 + 首行（金点 + 文案）+ 次行（等级 / 持有）——
   文案由 UI 层组装后经 `state.title` / `state.sub` 传入（preset 不含业务语义） —— */
export const tileCard: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const x0 = cx - w / 2;
  g.roundRect(x0, cy - h / 2, w, h, G(params, 'tileR'))
    .fill({ color: S(params, 'tileFill') })
    .stroke({ color: S(params, 'tileEdge'), width: G(params, 'tileEdgeW') });
  if (!text) return;
  const dotR = G(params, 'tileDotR');
  const tx = x0 + G(params, 'tilePadX');
  const titleY = cy + G(params, 'tileTitleDy');
  g.circle(tx + dotR, titleY, dotR).fill({ color: S(params, 'tileTitleFill') });
  text({
    text: typeof state.title === 'string' ? state.title : '',
    x: tx + dotR * 2 + G(params, 'tileDotGap'), y: titleY,
    size: G(params, 'tileTitleFs'), fill: S(params, 'tileTitleFill'), align: 'left',
  });
  text({
    text: typeof state.sub === 'string' ? state.sub : '',
    x: tx, y: cy + G(params, 'tileSubDy'),
    size: G(params, 'tileSubFs'), fill: S(params, 'tileSubFill'), align: 'left',
  });
};

/* —— 角标：小药丸 + 居中文字（牌堆名 / 面板标题） —— */
export const uiBadge: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'badgeR'))
    .fill({ color: S(params, 'badgeFill') })
    .stroke({ color: S(params, 'badgeEdge'), width: G(params, 'badgeEdgeW') });
  if (!text) return;
  text({ text: typeof state.text === 'string' ? state.text : '', x: cx, y: cy, size: G(params, 'badgeFs'), fill: S(params, 'badgeTxFill') });
};