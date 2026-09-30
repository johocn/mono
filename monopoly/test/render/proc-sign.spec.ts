import { describe, it, expect } from 'vitest';
import { market3, sign, shop } from '../../src/render/providers/proc-building';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import type { TextRequest } from '../../src/render/providers/proc';

function recorder() {
  const calls: Array<{ op: string; style: Record<string, unknown> }> = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      if (op === 'poly') calls.push({ op, style: {} });
      else if (op === 'moveTo' || op === 'lineTo') calls.push({ op, style: {} });
      else calls.push({ op, style: (a[0] ?? {}) as Record<string, unknown> });
      return g;
    },
  });
  return { g, calls };
}

const baseCtx = (levels: 1 | 2 | 3, brand?: string) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 42, d: 21, h: 72 },
  cx: 195, cy: 96, s: 1,
  params: brand ? { levels, hue: 30, brand } : { levels, hue: 30 },
  state: { level: levels },
});

describe('L3 商超楼（market3：成排暖窗；青幕墙与霓虹已废）', () => {
  it('L3 画成排暖窗（3 行 × 4 列 × 2 面 = 24 片）', () => {
    const { g, calls } = recorder();
    shop(g as never, baseCtx(3) as never);
    const cs = calls.map((c) => String(c.style.color ?? ''));
    expect(cs).toContain('#ffd79a');
    expect(cs.filter((c) => c === '#ffd79a').length).toBe(24);
    expect(cs).toContain('hsl(30,20%,40%)');
  });

  it('去青回归：产物不含青幕墙 / 霓虹描边色', () => {
    const { g, calls } = recorder();
    shop(g as never, baseCtx(3) as never);
    const cs = calls.map((c) => String(c.style.color ?? ''));
    expect(cs).not.toContain('#9fd8ff');
    expect(cs).not.toContain('#5ef0c0');
  });

  it('skin.json 的 l3 若仍指 shop，也兜到 market3（同一产物）', () => {
    const viaShop = recorder();
    shop(viaShop.g as never, baseCtx(3) as never);
    const viaM3 = recorder();
    market3(viaM3.g as never, baseCtx(3) as never);
    expect(viaShop.calls.length).toBe(viaM3.calls.length);
  });
});

describe('proc preset: sign（店招灯箱 + 等距旋转文字）', () => {
  it('发出灯箱多边形，并把品牌文字交给 ctx.text', () => {
    const { g, calls } = recorder();
    const texts: TextRequest[] = [];
    sign(g as never, { ...baseCtx(2, '太平温泉'), text: (r: TextRequest) => texts.push(r) } as never);
    expect(calls.filter((c) => c.op === 'poly').length).toBeGreaterThan(0);
    expect(texts.length).toBe(1);
    expect(texts[0].text).toBe('太平温泉');
    expect(texts[0].rotate).toBeCloseTo(-26.57, 1);   // -atan2(10.5,21) ≈ -26.57°
  });

  it('没有 brand 时只画灯箱、不产出文字', () => {
    const { g } = recorder();
    const texts: TextRequest[] = [];
    sign(g as never, { ...baseCtx(2), text: (r: TextRequest) => texts.push(r) } as never);
    expect(texts.length).toBe(0);
  });

  it('PROC_PRESETS 已注册 sign', () => {
    expect(PROC_PRESETS.sign).toBe(sign);
  });
});