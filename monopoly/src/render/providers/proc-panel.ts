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
  /* 行情行：两行（上排 代码/名称/现价/涨跌，下排 持股/市值）；
     `state.selected` = 逐行选中的标的（M20.3-B 版式 A）：换描边色 + 加粗，不改任何文字偏移 */
  rowR: 6, rowFill: '#16221e', rowEdge: '#2a3830', rowEdgeW: 1,
  rowEdgeSel: '#f5c451', rowEdgeSelW: 2,
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
  /* M19-D2 选目标预演条：深底金边 + 三行（标题 / 后果 / 受影响方，纵向居中） */
  previewR: 8, previewFill: '#06120a', previewEdge: '#f5c451', previewEdgeW: 1.2,
  previewLineDy: 12, previewFs: 12, previewTextFill: '#ffe9b0',
  /* M20.1 破产拍卖：出价键（uiBid）三态 + 债务条（uiBidDebt）三段文字 */
  bidR: 8, bidFill: '#1f2f2a', bidFillOn: '#2f5c3f', bidFillOff: '#141d1a',
  bidEdge: '#3a4a42', bidEdgeOn: '#f5c451', bidEdgeW: 1.2,
  bidFs: 14, bidLabelDy: 0, bidTextOn: '#ffe9b0', bidTextOff: '#5b6b63',
  debtR: 8, debtFill: '#06120a', debtEdge: '#f5c451', debtEdgeW: 1.2,
  debtFs: 12, debtTextFill: '#e8e4d8', debtRemainFill: '#f5c451',
  debtLabel: '待清偿', debtRaisedLabel: '已筹', debtRemainLabel: '还差',
  /* M20.2 HUD 债务条（ui.debtBar）：深底圆角 + 单行四段（存款 / 债务 / 抵押 / 逾期），逾期段走警示色 */
  debtBarR: 8, debtBarFill: 'rgba(6,12,10,.82)', debtBarEdge: '#3a4a42', debtBarEdgeW: 1,
  debtBarFs: 9, debtBarTextFill: '#d8e4dc', debtBarWarnFill: '#e8a33d',
  debtBarDepositLabel: '存款', debtBarLoanLabel: '债务',
  debtBarMortgageLabel: '抵押', debtBarMortgageUnit: '块',
  debtBarOverdueLabel: '逾期', debtBarOverdueUnit: '轮',
  /* M20.2 银行浮层产品行（ui.bankRow）：row 变体 = 两行（名称 / 摘要）+ 选中品牌色描边；line 变体 = 纯文字行 */
  bankRowR: 8, bankRowFill: '#16221e', bankRowFillOn: '#1f2f2a',
  bankRowEdge: '#2a3830', bankRowEdgeOn: '#f5c451', bankRowEdgeW: 1,
  bankRowPadX: 12, bankRowTitleDy: -9, bankRowTitleFs: 13, bankRowTitleFill: '#ffe9b0',
  bankRowSubDy: 10, bankRowSubFs: 11, bankRowSubFill: '#9fb3a8',
  bankLineFs: 12, bankLineFill: '#d8e4dc',
  /* M20.3 手牌滑动条（ui.handBar）：3px 细条 = 半透明轨道 + 金滑块；滑块宽度 = 轨道宽 × ratio，
     位移 = (轨道宽 − 滑块宽) × offset（两者由 UI 层算好传入 `state.ratio / state.offset`） */
  handBarTrack: 'rgba(255,255,255,.10)', handBarThumb: '#f5c451', handBarR: 2,
  handBarMinW: 1,                                  // 滑块最小宽（内容极宽时仍可见）
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
  const sel = state.selected === true;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'rowR'))
    .fill({ color: S(params, 'rowFill') })
    .stroke({
      color: sel ? S(params, 'rowEdgeSel') : S(params, 'rowEdge'),
      width: sel ? G(params, 'rowEdgeSelW') : G(params, 'rowEdgeW'),
    });
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
   文案由 UI 层组装后经 `state.title` / `state.sub` 传入（preset 不含业务语义）；
   几何/字号一律 × s（拍卖浮层把地契卡缩到 0.5 时字随卡一起缩，HUD 侧 s=1 逐值不变） —— */
export const tileCard: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const x0 = cx - w / 2;
  g.roundRect(x0, cy - h / 2, w, h, G(params, 'tileR'))
    .fill({ color: S(params, 'tileFill') })
    .stroke({ color: S(params, 'tileEdge'), width: G(params, 'tileEdgeW') });
  if (!text) return;
  const dotR = G(params, 'tileDotR') * s;
  const tx = x0 + G(params, 'tilePadX') * s;
  const titleY = cy + G(params, 'tileTitleDy') * s;
  g.circle(tx + dotR, titleY, dotR).fill({ color: S(params, 'tileTitleFill') });
  text({
    text: typeof state.title === 'string' ? state.title : '',
    x: tx + dotR * 2 + G(params, 'tileDotGap') * s, y: titleY,
    size: G(params, 'tileTitleFs') * s, fill: S(params, 'tileTitleFill'), align: 'left',
  });
  text({
    text: typeof state.sub === 'string' ? state.sub : '',
    x: tx, y: cy + G(params, 'tileSubDy') * s,
    size: G(params, 'tileSubFs') * s, fill: S(params, 'tileSubFill'), align: 'left',
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

/* —— M19-D2 选目标预演条：深底金边 + 三行文字（标题 / 后果 / 受影响方，纵向居中）——
   文案由 UI 层经 `state.previewLines` 组装传入（preset 不含业务语义） —— */
export const uiPreview: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'previewR'))
    .fill({ color: S(params, 'previewFill') })
    .stroke({ color: S(params, 'previewEdge'), width: G(params, 'previewEdgeW') });
  if (!text) return;
  const lines = Array.isArray(state.previewLines) ? (state.previewLines as string[]) : [];
  const dy = G(params, 'previewLineDy');
  const fs = G(params, 'previewFs');
  const mid = (lines.length - 1) / 2;
  for (let i = 0; i < lines.length; i++) {
    text({ text: lines[i], x: cx, y: cy + (i - mid) * dy, size: fs, fill: S(params, 'previewTextFill') });
  }
};

/* —— M20.1 破产拍卖出价键：圆角底 + 居中文字（enabled/primary 决定三态配色）——
   文案由 UI 层经 `state.label` 传入（preset 不含业务语义） —— */
export const uiBid: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const enabled = state.enabled === true;
  const primary = state.primary === true;
  const fill = !enabled ? S(params, 'bidFillOff') : primary ? S(params, 'bidFillOn') : S(params, 'bidFill');
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'bidR'))
    .fill({ color: fill })
    .stroke({ color: enabled ? S(params, 'bidEdgeOn') : S(params, 'bidEdge'), width: G(params, 'bidEdgeW') });
  if (!text) return;
  text({
    text: typeof state.label === 'string' ? state.label : '',
    x: cx, y: cy + G(params, 'bidLabelDy'),
    size: G(params, 'bidFs'), fill: enabled ? S(params, 'bidTextOn') : S(params, 'bidTextOff'),
  });
};

/* —— M20.1 破产拍卖债务条：深底圆角 + 三段文字（待清偿 / 已筹 / 还差，横向三等分）——
   数值由 UI 层经 `state.total` / `state.raised` / `state.remain` 传入 —— */
export const uiBidDebt: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'debtR'))
    .fill({ color: S(params, 'debtFill') })
    .stroke({ color: S(params, 'debtEdge'), width: G(params, 'debtEdgeW') });
  if (!text) return;
  const total = typeof state.total === 'number' ? state.total : 0;
  const raised = typeof state.raised === 'number' ? state.raised : 0;
  const remain = typeof state.remain === 'number' ? state.remain : 0;
  const fs = G(params, 'debtFs');
  text({ text: `${S(params, 'debtLabel')} ￥${total}`, x: cx - w / 4, y: cy, size: fs, fill: S(params, 'debtTextFill') });
  text({ text: `${S(params, 'debtRaisedLabel')} ￥${raised}`, x: cx, y: cy, size: fs, fill: S(params, 'debtTextFill') });
  text({ text: `${S(params, 'debtRemainLabel')} ￥${remain}`, x: cx + w / 4, y: cy, size: fs, fill: S(params, 'debtRemainFill') });
};

/* —— M20.2 HUD 债务条（spec §3.8B）：深底圆角 + 单行四段（存款 / 债务 / 抵押块数 / 逾期轮数）——
   数值由 UI 层经 `state.{deposit,debt,mortgageCount,overdue,warn}` 传入；逾期段（`warn` 为真）走警示色 —— */
export const uiDebtBar: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'debtBarR'))
    .fill({ color: S(params, 'debtBarFill') })
    .stroke({ color: S(params, 'debtBarEdge'), width: G(params, 'debtBarEdgeW') });
  if (!text) return;
  const deposit = typeof state.deposit === 'number' ? state.deposit : 0;
  const debt = typeof state.debt === 'number' ? state.debt : 0;
  const mortgageCount = typeof state.mortgageCount === 'number' ? state.mortgageCount : 0;
  const overdue = typeof state.overdue === 'number' ? state.overdue : 0;
  const fs = G(params, 'debtBarFs');
  const fill = S(params, 'debtBarTextFill');
  const warnFill = state.warn === true ? S(params, 'debtBarWarnFill') : fill;
  const x0 = cx - w / 2;
  const sw = w / 4;                       // 四段等分
  const segX = (i: number): number => x0 + (i + 0.5) * sw;
  const mid = cy;
  text({ text: `${S(params, 'debtBarDepositLabel')} ￥${deposit}`, x: segX(0), y: mid, size: fs, fill });
  text({ text: `${S(params, 'debtBarLoanLabel')} ￥${debt}`, x: segX(1), y: mid, size: fs, fill });
  text({ text: `${S(params, 'debtBarMortgageLabel')} ${mortgageCount}${S(params, 'debtBarMortgageUnit')}`, x: segX(2), y: mid, size: fs, fill });
  text({ text: `${S(params, 'debtBarOverdueLabel')} ${overdue}${S(params, 'debtBarOverdueUnit')}`, x: segX(3), y: mid, size: fs, fill: warnFill });
};

/* —— M20.2 银行浮层产品行（spec §3.8A）：`row` 变体 = 圆角底 + 两行（名称 / 摘要，左对齐），
   选中行品牌色描边；`line` 变体 = 右列详情的纯文字行（无底框）。文案由 UI 层组装传入 —— */
export const uiBankRow: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  if (state.variant === 'line') {
    if (!text) return;
    const wrapW = typeof state.wrapW === 'number' ? state.wrapW : undefined;
    text({
      text: typeof state.text === 'string' ? state.text : '',
      x: cx, y: cy, size: G(params, 'bankLineFs'), fill: S(params, 'bankLineFill'), wrapW,
    });
    return;
  }
  const w = box.w * s;
  const h = box.h * s;
  const selected = state.selected === true;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'bankRowR'))
    .fill({ color: selected ? S(params, 'bankRowFillOn') : S(params, 'bankRowFill') })
    .stroke({ color: selected ? S(params, 'bankRowEdgeOn') : S(params, 'bankRowEdge'), width: G(params, 'bankRowEdgeW') });
  if (!text) return;
  const tx = cx - w / 2 + G(params, 'bankRowPadX');
  text({
    text: typeof state.title === 'string' ? state.title : '',
    x: tx, y: cy + G(params, 'bankRowTitleDy'), size: G(params, 'bankRowTitleFs'),
    fill: S(params, 'bankRowTitleFill'), align: 'left',
  });
  text({
    text: typeof state.summary === 'string' ? state.summary : '',
    x: tx, y: cy + G(params, 'bankRowSubDy'), size: G(params, 'bankRowSubFs'),
    fill: S(params, 'bankRowSubFill'), align: 'left',
  });
};

/* —— M20.3 手牌滑动条（spec §4.2 版式 A）：半透明轨道铺满 + 金滑块。
   滑块宽 = 轨道宽 × `state.ratio`（下限 `handBarMinW`），左缘 = (轨道宽 − 滑块宽) × `state.offset`；
   槽数 ≤ 6（一屏放得下）时 UI 层不出这条 spec，故此 preset 只在需要滑动时被调用。 —— */
export const uiHandBar: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const r = G(params, 'handBarR') * s;
  g.roundRect(x0, y0, w, h, r).fill({ color: S(params, 'handBarTrack') });
  const ratio = Math.min(Math.max(typeof state.ratio === 'number' ? state.ratio : 1, 0), 1);
  const offset = Math.min(Math.max(typeof state.offset === 'number' ? state.offset : 0, 0), 1);
  const tw = Math.max(w * ratio, G(params, 'handBarMinW') * s);
  g.roundRect(x0 + (w - tw) * offset, y0, tw, h, r).fill({ color: S(params, 'handBarThumb') });
};