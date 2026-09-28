import { describe, it, expect } from 'vitest';
import { PROC_PRESETS } from '../../src/render/providers/proc';

/** 用「记录调用」的假画布，断言 provider 发出的绘制指令（纯逻辑可测，不需要 WebGL） */
function recorder() {
  const calls: Array<{ op: string; pts?: number[]; style?: Record<string, unknown> }> = [];
  const g = {
    poly(pts: number[]) { calls.push({ op: 'poly', pts }); return g; },
    rect(x: number, y: number, w: number, h: number) { calls.push({ op: 'rect', pts: [x, y, w, h] }); return g; },
    circle(x: number, y: number, r: number) { calls.push({ op: 'circle', pts: [x, y, r] }); return g; },
    ellipse(x: number, y: number, rx: number, ry: number) { calls.push({ op: 'ellipse', pts: [x, y, rx, ry] }); return g; },
    moveTo() { return g; }, lineTo() { return g; }, closePath() { return g; },
    fill(s: Record<string, unknown>) { calls[calls.length - 1].style = { ...(calls[calls.length - 1].style ?? {}), fill: s }; return g; },
    stroke(s: Record<string, unknown>) { calls[calls.length - 1].style = { ...(calls[calls.length - 1].style ?? {}), stroke: s }; return g; },
  };
  return { g, calls };
}

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };
const BOX = { w: 42, d: 21, h: 2 };

describe('proc preset: tile', () => {
  it('发出 1 个菱形 poly，fill = params.fill、stroke = params.edge', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.tile(g as never, {
      geo: GEO, box: BOX, cx: 100, cy: 200, s: 1,
      params: { fill: '#2f4238', edge: '#5b7b6a', inner: '#000000' },
      state: {},
    });
    expect(calls.length).toBe(1);
    expect(calls[0].op).toBe('poly');
    expect(calls[0].pts).toEqual([100, 210.5, 121, 200, 100, 189.5, 79, 200]);
    expect(calls[0].style).toEqual({ fill: { color: '#2f4238' }, stroke: { color: '#5b7b6a' } });
  });

  it('selected 时描边宽度换成 params 里的高亮宽', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.tile(g as never, {
      geo: GEO, box: BOX, cx: 0, cy: 0, s: 1,
      params: { fill: '#2f4238', edge: '#5b7b6a', inner: '#000000', selectedEdge: '#f5c451', edgeW: 0.9, edgeWSel: 1.8 },
      state: { selected: true, owner: 2, ownerColors: { 2: '#f0a039' } },
    });
    expect(calls[0].style!.stroke).toEqual({ color: '#f0a039', width: 1.8 });
  });

  it('owner 存在时描边用归属色（不再用类型色）', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.tile(g as never, {
      geo: GEO, box: BOX, cx: 0, cy: 0, s: 1,
      params: { fill: '#2f4238', edge: '#5b7b6a', inner: '#000000', edgeW: 0.9 },
      state: { owner: 3, ownerColors: { 3: '#e0607e' } },
    });
    expect(calls[0].style!.stroke).toEqual({ color: '#e0607e', width: 0.9 });
  });
});

describe('proc preset: tileEdge', () => {
  it('发出内圈细描边 poly（归属色条）', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.tileEdge(g as never, {
      geo: GEO, box: BOX, cx: 100, cy: 200, s: 1,
      params: { edge: '#f5c451', inset: 0.9, dy: 1.5, width: 1.2 },
      state: {},
    });
    expect(calls[0].op).toBe('poly');
    expect(calls[0].style!.stroke).toEqual({ color: '#f5c451', width: 1.2 });
  });
});

describe('proc preset: builtin（内建兜底）', () => {
  it('任何元素都有得画：矩形 + 文本标签', () => {
    const { g, calls } = recorder();
    PROC_PRESETS.builtin(g as never, {
      geo: GEO, box: BOX, cx: 10, cy: 20, s: 1,
      params: { label: 'prop.lantern' }, state: {},
    });
    expect(calls.some((c) => c.op === 'rect')).toBe(true);
  });
});