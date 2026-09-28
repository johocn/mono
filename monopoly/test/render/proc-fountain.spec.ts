import { describe, it, expect } from 'vitest';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import { fountain } from '../../src/render/providers/proc-fountain';

function recorder() {
  const calls: string[] = [];
  const g = new Proxy({}, {
    get: (_t, k: string) => (...a: unknown[]) => { calls.push(k); void a; return g; },
  });
  return { g, calls };
}

describe('proc preset: fountain', () => {
  it('发出 3 个同心椭圆 + 水柱 + 水弧 + 顶珠', () => {
    const { g, calls } = recorder();
    fountain(g as never, {
      geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
      box: { w: 60, d: 30, h: 28 },
      cx: 100, cy: 200, s: 1,
      params: {
        rings: [{ rx: 30, ry: 15, fill: '#55564f' }, { rx: 25, ry: 12.5, fill: '#3a3b35' }, { rx: 21, ry: 10.5, fill: '#2c6a80' }],
        column: { w: 6, dy: 3, h: 17, leftFill: '#585a52', rightFill: '#6d6f66' },
        arcs: [{ sign: -1, dx: 9, dy: 7, span: 14 }, { sign: 1, dx: 9, dy: 7, span: 14 }],
      },
      state: {},
    });
    expect(calls.filter((c) => c === 'ellipse').length).toBeGreaterThanOrEqual(3);
    expect(calls).toContain('poly');
    expect(calls).toContain('quadraticCurveTo');
    expect(calls).toContain('circle');
  });
  it('PROC_PRESETS 已注册 fountain', () => {
    expect(PROC_PRESETS.fountain).toBe(fountain);
  });
});