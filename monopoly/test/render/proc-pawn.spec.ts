import { describe, it, expect } from 'vitest';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import { pawn } from '../../src/render/providers/proc-pawn';

function recorder() {
  const calls: string[] = [];
  const g = new Proxy({}, {
    get: (_t, k: string) => (...a: unknown[]) => { calls.push(k); void a; return g; },
  });
  return { g, calls };
}

describe('proc preset: pawn', () => {
  it('发出影 + 左右墙 + 顶面 + 高光，且已注册进 PROC_PRESETS', () => {
    const { g, calls } = recorder();
    pawn(g as never, {
      geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
      box: { w: 8.4, d: 4.2, h: 13 },
      cx: 100, cy: 200, s: 0.62,
      params: { color: '#3fbf7f', h: 13, w: 4.2, d: 2.1 },
      state: {},
    });
    expect(calls.filter((c) => c === 'poly').length).toBe(3);
    expect(calls.filter((c) => c === 'ellipse').length).toBe(2);
    expect(PROC_PRESETS.pawn).toBe(pawn);
  });
});