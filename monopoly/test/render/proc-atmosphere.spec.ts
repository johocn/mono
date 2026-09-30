import { describe, it, expect } from 'vitest';
import {
  lanternString, moonDisc, ridgeSilhouette, skyGradient, starField, streetBand, streetLamp,
} from '../../src/render/providers/proc-atmosphere';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import { atmosphereSpecs } from '../../src/render/AtmosphereView';
import { getEntry } from '../../src/skin/registry';
import { isElementId } from '../../src/skin/ids';

interface Rec { op: string; args: unknown[] }

function recorder() {
  const calls: Rec[] = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      calls.push({ op: String(k), args: a });
      return g;
    },
  });
  return { g, calls };
}

/** 台位一律是定格左上角坐标（与 AtmosphereView 同口径） */
const ctxOf = (box: { w: number; h: number }, params: Record<string, unknown> = {}) => ({
  geo: { hw: 24, hh: 13, ox: 195, oy: 104 },
  box: { ...box, d: 1 },
  cx: 0,
  cy: 306,
  s: 1,
  params,
  state: {},
});

/** theme.json 的 `bg.*` binding 注入的 8 个 palette 色键（warm-market） */
const PALETTE = {
  wallL: '#cdb78f', wallR: '#a8926a', roof: '#8f4a33', win: '#ffcf7a',
  sign: '#f5c451', tileFill: '#4a3b2a', tileEdge: '#8a7550', glow: '#ffd9a0',
};

const PRESETS = {
  skyGradient, starField, moonDisc, ridgeSilhouette, streetBand, streetLamp, lanternString,
};
const BOXES: Record<keyof typeof PRESETS, { w: number; h: number }> = {
  skyGradient: { w: 390, h: 844 },
  starField: { w: 390, h: 240 },
  moonDisc: { w: 60, h: 60 },
  ridgeSilhouette: { w: 390, h: 90 },
  streetBand: { w: 390, h: 130 },
  streetLamp: { w: 40, h: 70 },
  lanternString: { w: 390, h: 30 },
};

describe('环境层 preset（spec §3.2 背景）', () => {
  it('7 个 preset 均已注册，且空参数 / 满 palette 参数下都出图且不抛错', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      expect(PROC_PRESETS[name], name).toBe(preset);
      for (const params of [{}, PALETTE]) {
        const { g, calls } = recorder();
        expect(() => preset(g as never, ctxOf(BOXES[name as keyof typeof PRESETS], params) as never)).not.toThrow();
        expect(calls.length, `${name} 出图数`).toBeGreaterThan(0);
      }
    }
  });

  it('夜空按 bands 铺满整幅，并把 palette.tileFill 作低透明度叠色', () => {
    const { g, calls } = recorder();
    skyGradient(g as never, ctxOf(BOXES.skyGradient, PALETTE) as never);
    expect(calls.filter((c) => c.op === 'rect').length).toBe(13);   // 12 带 + 1 叠色
    const last = calls[calls.length - 1].args[0] as { color: string; alpha: number };
    expect(last.color).toBe(PALETTE.tileFill);
    expect(last.alpha).toBeLessThan(1);
  });

  it('星点位置是确定性哈希（两次调用完全一致，不用随机数）', () => {
    const run = (): Rec[] => {
      const { g, calls } = recorder();
      starField(g as never, ctxOf(BOXES.starField, PALETTE) as never);
      return calls;
    };
    expect(run()).toEqual(run());
  });

  it('远山剪影是闭合多边形，色取 palette.roof', () => {
    const { g, calls } = recorder();
    ridgeSilhouette(g as never, ctxOf(BOXES.ridgeSilhouette, PALETTE) as never);
    const poly = calls.find((c) => c.op === 'poly');
    expect(poly).toBeTruthy();
    expect(((calls.find((c) => c.op === 'fill'))?.args[0] as { color: string }).color).toBe(PALETTE.roof);
  });

  it('街市带剪影楼块数 = blocks、暖窗色取 palette.win、街面取 palette.tileFill', () => {
    const { g, calls } = recorder();
    streetBand(g as never, ctxOf(BOXES.streetBand, PALETTE) as never);
    const fills = calls.filter((c) => c.op === 'fill').map((c) => c.args[0] as { color: string });
    /* 9 楼块 + 9×3×2 暖窗 + 1 街面 */
    expect(calls.filter((c) => c.op === 'rect').length).toBe(9 + 54 + 1);
    expect(fills.filter((f) => f.color === PALETTE.win).length).toBe(54);
    expect(fills.some((f) => f.color === PALETTE.tileFill)).toBe(true);
  });

  it('街灯 = 暖光池 + 立柱 + 光晕 + 灯珠；灯笼串 = 绳 + n 灯', () => {
    const lamp = recorder();
    streetLamp(lamp.g as never, ctxOf(BOXES.streetLamp, PALETTE) as never);
    expect(lamp.calls.filter((c) => c.op !== 'fill').map((c) => c.op))
      .toEqual(['ellipse', 'rect', 'circle', 'circle']);

    const la = recorder();
    lanternString(la.g as never, ctxOf(BOXES.lanternString, PALETTE) as never);
    expect(la.calls.filter((c) => c.op === 'stroke').length).toBe(8);   // 1 绳 + 7 吊线
    expect(la.calls.filter((c) => c.op === 'ellipse').length).toBe(7);
  });
});

describe('atmosphereSpecs（环境层台位）', () => {
  it('7 个 id / 8 条台位，全部 pass 1 + 定格 + depth 0（插在最前即压在最底）', () => {
    const specs = atmosphereSpecs();
    expect(specs.length).toBe(8);
    expect(new Set(specs.map((s) => s.id)).size).toBe(7);
    for (const s of specs) {
      expect(isElementId(s.id), s.id).toBe(true);
      expect(getEntry(s.id), s.id).toBeTruthy();
      expect(s.pass).toBe(1);
      expect(s.c).toBe(0);
      expect(s.r).toBe(0);
      expect(s.fixed, s.id).toBeTruthy();
    }
  });
});