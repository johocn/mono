import { describe, it, expect } from 'vitest';
import {
  PANEL_D, uiBadge, uiCard, uiCardBack, uiHandSlot, uiSettleRow, uiStockChart, uiStockRow,
} from '../../src/render/providers/proc-panel';
import { PROC_PRESETS, type TextRequest } from '../../src/render/providers/proc';

interface Call { op: string; pts: number[]; style: Record<string, unknown> }

/** 记录绘制指令：fill/stroke 记 style，其余记数字入参 */
function recorder() {
  const calls: Call[] = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      if (op === 'fill' || op === 'stroke') calls.push({ op, pts: [], style: (a[0] ?? {}) as Record<string, unknown> });
      else calls.push({ op, pts: a.map((v) => (typeof v === 'number' ? v : NaN)), style: {} });
      return g;
    },
  });
  return { g, calls };
}

const ops = (c: Call[], op: string): Call[] => c.filter((x) => x.op === op);
const fills = (c: Call[]): string[] => ops(c, 'fill').map((x) => String(x.style.color));

const ctx = (over: Record<string, unknown> = {}) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 68, d: 1, h: 52 },
  cx: 100, cy: 200, s: 1,
  params: {},
  state: {},
  ...over,
});

describe('proc preset: uiHandSlot 手牌槽', () => {
  it('圆角底 1 枚；持有亮底 + 可用金框 + 卡名文字', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiHandSlot(g as never, ctx({
      state: { name: '炸弹', held: true, enabled: true },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(ops(calls, 'roundRect')).toHaveLength(1);
    expect(fills(calls)).toEqual([PANEL_D.slotFill]);
    expect(ops(calls, 'fill')[0].style.alpha).toBe(1);
    expect(ops(calls, 'stroke')[0].style).toEqual({ color: PANEL_D.slotEdgeOn, width: PANEL_D.slotEdgeW });
    expect(texts[0].text).toBe('炸弹');
    expect(texts[0].fill).toBe(PANEL_D.slotTextFill);
  });

  it('未持有 → 空槽底 + 灰字；被动不可点 → 压暗 + 灰框', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiHandSlot(g as never, ctx({
      state: { name: '免罚', held: false, enabled: false },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(fills(calls)).toEqual([PANEL_D.slotEmptyFill]);
    expect(ops(calls, 'fill')[0].style.alpha).toBe(PANEL_D.slotDimAlpha);
    expect(ops(calls, 'stroke')[0].style.color).toBe(PANEL_D.slotEdge);
    expect(texts[0].fill).toBe(PANEL_D.slotTextEmpty);
  });
});

describe('proc preset: uiCard / uiCardBack', () => {
  it('uiCard：底板 1 + 顶部色带 1 + 标题/文案 2 条', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiCard(g as never, ctx({
      box: { w: 66, d: 1, h: 88 },
      state: { title: '违规罚金', text: '摊位违规，罚金 ￥150' },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(ops(calls, 'roundRect')).toHaveLength(1);
    expect(ops(calls, 'rect')).toHaveLength(1);
    expect(ops(calls, 'rect')[0].pts[3]).toBe(PANEL_D.cardBandH);
    expect(fills(calls)).toEqual([PANEL_D.cardFill, PANEL_D.cardBand]);
    expect(texts.map((t) => t.text)).toEqual(['违规罚金', '摊位违规，罚金 ￥150']);
    expect(texts.map((t) => t.fill)).toEqual([PANEL_D.cardTitleFill, PANEL_D.cardTextFill]);
  });

  it('uiCardBack：外框 + 内嵌两块圆角，无文字', () => {
    const { g, calls } = recorder();
    uiCardBack(g as never, ctx({ box: { w: 66, d: 1, h: 88 } }) as never);
    expect(ops(calls, 'roundRect')).toHaveLength(2);
    expect(fills(calls)).toEqual([PANEL_D.backFill, PANEL_D.backInFill]);
    expect(ops(calls, 'stroke')).toHaveLength(1);
  });
});

describe('proc preset: uiStockRow 行情行', () => {
  it('圆角底 1 + 两行共 6 条文字（代码/名称/现价/涨跌 + 持股/市值）', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiStockRow(g as never, ctx({
      box: { w: 342, d: 1, h: 34 },
      state: { code: 'SY01', name: '鹿业股份', price: 132, change: 12, shares: 3, value: 396 },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(ops(calls, 'roundRect')).toHaveLength(1);
    expect(fills(calls)).toEqual([PANEL_D.rowFill]);
    expect(texts.map((t) => t.text)).toEqual([
      'SY01', '鹿业股份', '￥132', '+12', '持股 3', '市值 ￥396',
    ]);
    /* 上排 4 条（代码/名称/现价/涨跌）走 rowTopDy；下排 2 条（持股/市值）走 rowBotDy */
    expect(texts.slice(0, 4).every((t) => t.y === 200 + PANEL_D.rowTopDy)).toBe(true);
    expect(texts.slice(4).every((t) => t.y === 200 + PANEL_D.rowBotDy)).toBe(true);
    expect(texts[4].fill).toBe(PANEL_D.subFill);
    expect(texts[5].fill).toBe(PANEL_D.valueFill);
  });

  it('涨红跌绿平灰（涨跌符号决定文字色）', () => {
    const up: TextRequest[] = [];
    const a = recorder();
    uiStockRow(a.g as never, ctx({ state: { change: 5 }, text: (r: TextRequest) => up.push(r) }) as never);
    expect(up[3].fill).toBe(PANEL_D.upFill);

    const down: TextRequest[] = [];
    const b = recorder();
    uiStockRow(b.g as never, ctx({ state: { change: -5 }, text: (r: TextRequest) => down.push(r) }) as never);
    expect(down[3].fill).toBe(PANEL_D.downFill);

    const flat: TextRequest[] = [];
    const c = recorder();
    uiStockRow(c.g as never, ctx({ state: { change: 0 }, text: (r: TextRequest) => flat.push(r) }) as never);
    expect(flat[3].fill).toBe(PANEL_D.flatFill);
  });
});

describe('proc preset: uiStockChart 行情图', () => {
  it('底板 1 + 2 条水平参考线 + 近价折线（N 点）+ 端点脉冲/实心点 + 左上角标', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiStockChart(g as never, ctx({
      box: { w: 300, d: 1, h: 54 },
      state: { series: [100, 110, 105, 120], label: 'SY01 走势' },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(ops(calls, 'roundRect')).toHaveLength(1);
    expect(ops(calls, 'moveTo')).toHaveLength(PANEL_D.gridLines + 1);
    expect(ops(calls, 'lineTo')).toHaveLength(PANEL_D.gridLines + 3);
    expect(ops(calls, 'circle')).toHaveLength(2);
    expect(ops(calls, 'circle')[0].pts[2]).toBe(PANEL_D.pulseR);
    expect(ops(calls, 'circle')[1].pts[2]).toBe(PANEL_D.dotR);
    expect(fills(calls)).toEqual([PANEL_D.chartFill, PANEL_D.lineUp, PANEL_D.lineUp]);
    const strokes = ops(calls, 'stroke').map((s) => s.style.color);
    expect(strokes[0]).toBe(PANEL_D.chartEdge);            // 底板描边
    expect(strokes[1]).toBe(PANEL_D.gridFill);             // 首条参考线
    expect(strokes[PANEL_D.gridLines + 1]).toBe(PANEL_D.lineUp);   // 末点 120 > 首点 100 → 涨红
    expect(texts[0].text).toBe('SY01 走势');
    expect(texts[0].fill).toBe(PANEL_D.capFill);
  });

  it('跌绿 / 平灰；序列不足 2 点不画折线（仍画底板与参考线）', () => {
    const down = recorder();
    uiStockChart(down.g as never, ctx({
      box: { w: 300, d: 1, h: 54 }, state: { series: [120, 100] },
    }) as never);
    expect(ops(down.calls, 'stroke')[PANEL_D.gridLines + 1].style.color).toBe(PANEL_D.lineDown);

    const flat = recorder();
    uiStockChart(flat.g as never, ctx({
      box: { w: 300, d: 1, h: 54 }, state: { series: [100, 100] },
    }) as never);
    expect(ops(flat.calls, 'stroke')[PANEL_D.gridLines + 1].style.color).toBe(PANEL_D.lineFlat);

    const one = recorder();
    uiStockChart(one.g as never, ctx({ box: { w: 300, d: 1, h: 54 }, state: { series: [100] } }) as never);
    expect(ops(one.calls, 'stroke')).toHaveLength(PANEL_D.gridLines + 1);
    expect(ops(one.calls, 'circle')).toHaveLength(0);

    const none = recorder();
    uiStockChart(none.g as never, ctx({ box: { w: 300, d: 1, h: 54 } }) as never);
    expect(ops(none.calls, 'stroke')).toHaveLength(PANEL_D.gridLines + 1);
    expect(ops(none.calls, 'circle')).toHaveLength(0);
  });
});

describe('proc preset: uiSettleRow / uiBadge', () => {
  it('uiSettleRow：圆角底 1 + #名次/名字/净资产 3 条；胜者金框', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiSettleRow(g as never, ctx({
      box: { w: 342, d: 1, h: 40 },
      state: { rank: 1, name: '你', worth: 1200, winner: true },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(ops(calls, 'roundRect')).toHaveLength(1);
    expect(fills(calls)).toEqual([PANEL_D.sRowWinFill]);
    expect(ops(calls, 'stroke')[0].style.color).toBe(PANEL_D.sRowEdgeWin);
    expect(texts.map((t) => t.text)).toEqual(['#1', '你', '￥1200']);

    const n = recorder();
    uiSettleRow(n.g as never, ctx({ state: { rank: 2, name: '老王', worth: 900 } }) as never);
    expect(fills(n.calls)).toEqual([PANEL_D.sRowFill]);
    expect(ops(n.calls, 'stroke')[0].style.color).toBe(PANEL_D.sRowEdge);
  });

  it('uiBadge：药丸 1 枚 + 居中文字', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiBadge(g as never, ctx({
      box: { w: 120, d: 1, h: 26 }, state: { text: '股票交易所' },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(ops(calls, 'roundRect')).toHaveLength(1);
    expect(fills(calls)).toEqual([PANEL_D.badgeFill]);
    expect(texts[0].text).toBe('股票交易所');
    expect(texts[0].fill).toBe(PANEL_D.badgeTxFill);
  });
});

describe('proc-panel 注册与兜底容器', () => {
  it('7 个 preset 全部注册进 PROC_PRESETS', () => {
    expect(PROC_PRESETS.uiHandSlot).toBe(uiHandSlot);
    expect(PROC_PRESETS.uiCard).toBe(uiCard);
    expect(PROC_PRESETS.uiCardBack).toBe(uiCardBack);
    expect(PROC_PRESETS.uiStockRow).toBe(uiStockRow);
    expect(PROC_PRESETS.uiStockChart).toBe(uiStockChart);
    expect(PROC_PRESETS.uiSettleRow).toBe(uiSettleRow);
    expect(PROC_PRESETS.uiBadge).toBe(uiBadge);
  });

  it('PANEL_D 是 fb 容器：几何/色值集中一处（唯一允许裸字面量的位置）', () => {
    expect(PANEL_D.slotR).toBe(8);
    expect(PANEL_D.lineW).toBe(2);
    expect(PANEL_D.dotR).toBe(3);
    expect(PANEL_D.badgeEdge).toBe('#f5c451');
  });
});