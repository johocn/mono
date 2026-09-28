import { describe, it, expect } from 'vitest';
import { shop, hsl, rgba } from '../../src/render/providers/proc-building';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import { resolve } from '../../src/skin/resolve';

/** 记录绘制指令的假画布：不需要 WebGL 就能断言 provider 发出的图形 */
function recorder() {
  const calls: Array<{ op: string; pts?: number[]; style: Record<string, unknown> }> = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      if (op === 'poly') calls.push({ op, pts: a[0] as number[], style: {} });
      else if (op === 'moveTo' || op === 'lineTo') calls.push({ op, style: {} });
      else calls.push({ op, style: (a[0] ?? {}) as Record<string, unknown> });
      return g;
    },
  });
  return { g, calls };
}

const ctxOf = (levels: 1 | 2 | 3, extra: Record<string, unknown> = {}) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 42, d: 21, h: 72 },
  cx: 195,
  cy: 96,
  s: 1,
  params: { levels, hue: 30, ...extra },
  state: { level: levels },
});
const colors = (calls: Array<{ style: Record<string, unknown> }>) => calls.map((c) => String(c.style.color ?? ''));

describe('proc preset: shop（等距楼）', () => {
  it('hsl / rgba 组装参数化色值', () => {
    expect(hsl(30, 32, 23)).toBe('hsl(30,32%,23%)');
    expect(rgba(255, 205, 120, 0.17)).toBe('rgba(255,205,120,.17)');
  });

  it('L1/L2/L3 都画两面墙 + 屋顶，且层数越高细节越多', () => {
    const counts = ([1, 2, 3] as const).map((lv) => {
      const { g, calls } = recorder();
      shop(g as never, ctxOf(lv) as never);
      return calls.filter((c) => c.op === 'poly').length;
    });
    expect(counts[0]).toBeGreaterThan(10);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it('L1 是坡顶（含金脊线），L2 是女儿墙（含白色描边）', () => {
    const l1 = recorder();
    shop(l1.g as never, ctxOf(1) as never);
    expect(colors(l1.calls)).toContain('#e8c05a');

    const l2 = recorder();
    shop(l2.g as never, ctxOf(2) as never);
    expect(colors(l2.calls)).toContain('rgba(255,255,255,.14)');
  });

  it('墙面明暗分左右：右墙比左墙亮 (hsl(30,36%,33%) vs hsl(30,32%,23%))', () => {
    const { g, calls } = recorder();
    shop(g as never, ctxOf(1) as never);
    const cs = colors(calls);
    expect(cs).toContain('hsl(30,36%,33%)');
    expect(cs).toContain('hsl(30,32%,23%)');
  });

  it('缺 params 时全部走 fb 兜底且不抛错（L4 回退）', () => {
    const { g, calls } = recorder();
    shop(g as never, { ...ctxOf(2), params: {} } as never);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('PROC_PRESETS 已注册 shop；skin.json 可用段通配 key 命中具体 slot', () => {
    expect(PROC_PRESETS.shop).toBe(shop);
    const skin = {
      id: 'default',
      geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
      tokens: {},
      elements: {
        'building.*.l2': { kind: 'proc', preset: 'shop', params: { hue: 150 } },
      },
    };
    const r = resolve('building.s4.l2', skin as never, null);
    expect(r.level).toBe(2);
    expect((r.provider as { preset: string }).preset).toBe('shop');
    expect((r.provider as { params: Record<string, unknown> }).params.hue).toBe(150);
  });
});