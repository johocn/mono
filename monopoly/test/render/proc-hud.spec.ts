import { describe, it, expect } from 'vitest';
import {
  HUD_D, diceBody, diceFace, uiButton, uiDock, uiLabel, uiPanel, uiPlayerBar,
} from '../../src/render/providers/proc-hud';
import { PROC_PRESETS, type TextRequest } from '../../src/render/providers/proc';
import { DOCK_Y, HUD_DOCK_H } from '../../src/skin/layout';

interface Call { op: string; pts: number[]; style: Record<string, unknown> }

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

const ops = (calls: Call[], op: string): Call[] => calls.filter((c) => c.op === op);
const fills = (calls: Call[]): string[] => ops(calls, 'fill').map((c) => String(c.style.color));

const ctx = (over: Record<string, unknown> = {}) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 98, d: 1, h: 46 },
  cx: 195, cy: 738, s: 1,
  params: {},
  state: {},
  ...over,
});

const PIP_COUNT = [1, 2, 3, 4, 5, 6];

describe('proc preset: uiDock / uiPanel', () => {
  it('uiDock：1 圆角底 + 1 顶部金条', () => {
    const { g, calls } = recorder();
    /* cy = 底坞中心（DOCK_Y + HUD_DOCK_H/2），与 hudSpecs 的定格台位一致 → 顶边 y0 = DOCK_Y */
    uiDock(g as never, ctx({ box: { w: 390, d: 1, h: 184 }, cy: DOCK_Y + HUD_DOCK_H / 2 }) as never);
    expect(ops(calls, 'roundRect').length).toBe(1);
    expect(ops(calls, 'rect').length).toBe(1);
    expect(fills(calls)).toEqual([HUD_D.dockFill, HUD_D.dockTopFill]);
    const rr = ops(calls, 'roundRect')[0];
    expect(rr.pts).toEqual([0, 606, 390, 184, HUD_D.dockR]);
  });

  it('uiPanel：1 圆角面板（无顶条）', () => {
    const { g, calls } = recorder();
    uiPanel(g as never, ctx({ box: { w: 370, d: 1, h: 268 } }) as never);
    expect(ops(calls, 'roundRect').length).toBe(1);
    expect(ops(calls, 'rect').length).toBe(0);
    expect(fills(calls)).toEqual([HUD_D.panelFill]);
  });
});

describe('proc preset: uiPlayerBar', () => {
  it('底板 + 色标 + 名字/现金两行文字；色标取 state.ownerColors', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiPlayerBar(g as never, ctx({
      box: { w: 86, d: 1, h: 40 },
      cx: 49, cy: 652,
      state: { owner: 2, name: '老王', cash: 3045, active: true, ownerColors: { 2: '#f0a039' } },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(ops(calls, 'roundRect').length).toBe(2);
    expect(fills(calls)).toEqual([HUD_D.barActiveFill, '#f0a039']);
    expect(texts.map((t) => t.text)).toEqual(['老王', '￥3045']);
    expect(texts.map((t) => t.align)).toEqual(['left', 'left']);
    expect(texts[0].size).toBe(HUD_D.barNameFs);
    expect(texts[1].size).toBe(HUD_D.barCashFs);
  });

  it('破产玩家整条压暗（alpha = barBankruptAlpha）', () => {
    const { g, calls } = recorder();
    uiPlayerBar(g as never, ctx({
      box: { w: 86, d: 1, h: 40 },
      state: { owner: 1, cash: 0, bankrupt: true, ownerColors: { 1: '#3fbf7f' } },
    }) as never);
    expect(ops(calls, 'fill')[0].style.alpha).toBe(HUD_D.barBankruptAlpha);
  });
});

describe('proc preset: uiButton / uiLabel', () => {
  it('可用按钮：金色底 + 深色标签；禁用：灰底 + 灰字', () => {
    const on: TextRequest[] = [];
    const a = recorder();
    uiButton(a.g as never, ctx({ state: { label: '掷骰', enabled: true }, text: (r: TextRequest) => on.push(r) }) as never);
    expect(fills(a.calls)).toEqual([HUD_D.btnFill]);
    expect(on[0].text).toBe('掷骰');
    expect(on[0].size).toBe(HUD_D.btnFs);
    expect(on[0].fill).toBe(HUD_D.btnTextFill);

    const off: TextRequest[] = [];
    const b = recorder();
    uiButton(b.g as never, ctx({ state: { label: '升级 ￥420', enabled: false }, text: (r: TextRequest) => off.push(r) }) as never);
    expect(fills(b.calls)).toEqual([HUD_D.btnFillDisabled]);
    expect(off[0].fill).toBe(HUD_D.btnTextFillDisabled);
  });

  it('uiLabel：只出 1 行居中文字，不画任何形状', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    uiLabel(g as never, ctx({
      box: { w: 390, d: 1, h: 24 }, cx: 195, cy: 618,
      state: { text: '第 1 轮 · 轮到 你' },
      text: (r: TextRequest) => texts.push(r),
    }) as never);
    expect(calls.length).toBe(0);
    expect(texts.length).toBe(1);
    expect(texts[0].text).toBe('第 1 轮 · 轮到 你');
    expect(texts[0].x).toBe(195);
    expect(texts[0].align).toBeUndefined();
  });
});

describe('proc preset: diceBody / diceFace', () => {
  it('未掷骰用暗底，掷出后用亮底', () => {
    const a = recorder();
    diceBody(a.g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { roll: false } }) as never);
    expect(fills(a.calls)).toEqual([HUD_D.diceFill]);
    const b = recorder();
    diceBody(b.g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { roll: true } }) as never);
    expect(fills(b.calls)).toEqual([HUD_D.diceRollFill]);
  });

  it('1..6 各出 1/2/3/4/5/6 个点，半径与色值取默认；blank 不画点', () => {
    for (let p = 1; p <= 6; p++) {
      const { g, calls } = recorder();
      diceFace(g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { pips: p } }) as never);
      const dots = ops(calls, 'circle');
      expect(dots.length).toBe(PIP_COUNT[p - 1]);
      expect(dots[0].pts[2]).toBe(HUD_D.pipR);
      expect(fills(calls).every((c) => c === HUD_D.pipFill)).toBe(true);
    }

    const { g, calls } = recorder();
    diceFace(g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { pips: 1, blank: true } }) as never);
    expect(ops(calls, 'circle').length).toBe(0);
  });

  it('PIPS 表只含 -1 / 0 / 1（禁写死规则的作用域内不放越界字面量）', () => {
    for (let p = 1; p <= 6; p++) {
      const { g, calls } = recorder();
      diceFace(g as never, ctx({ box: { w: 52, d: 1, h: 52 }, state: { pips: p } }) as never);
      for (const d of ops(calls, 'circle')) {
        const dx = (d.pts[0] - 195) / HUD_D.pipSpan;
        const dy = (d.pts[1] - 738) / HUD_D.pipSpan;
        expect([-1, 0, 1]).toContain(Math.round(dx));
        expect([-1, 0, 1]).toContain(Math.round(dy));
      }
    }
  });
});

describe('proc-hud 注册', () => {
  it('7 个 preset 全部注册进 PROC_PRESETS', () => {
    expect(PROC_PRESETS.uiDock).toBe(uiDock);
    expect(PROC_PRESETS.uiPanel).toBe(uiPanel);
    expect(PROC_PRESETS.uiPlayerBar).toBe(uiPlayerBar);
    expect(PROC_PRESETS.uiButton).toBe(uiButton);
    expect(PROC_PRESETS.uiLabel).toBe(uiLabel);
    expect(PROC_PRESETS.diceBody).toBe(diceBody);
    expect(PROC_PRESETS.diceFace).toBe(diceFace);
  });
});