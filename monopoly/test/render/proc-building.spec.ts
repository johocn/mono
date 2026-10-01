import { describe, it, expect } from 'vitest';
import { barn, gate, hsl, market3, onsenHouse, rgba, shop, stall } from '../../src/render/providers/proc-building';
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

describe('proc preset: 建筑 6 原型（Task 3 新增 5 个）', () => {
  const ctxOf2 = (params: Record<string, unknown>, state: Record<string, unknown> = {}) => ({
    geo: { hw: 24, hh: 13, ox: 195, oy: 104 },
    box: { w: 48, d: 26, h: 72 },
    cx: 195,
    cy: 104,
    s: 1,
    params,
    state: { level: 2, ...state },
  });
  /* 8 个 palette 色键全给上：断言每个键都真的被某个原型读走 */
  const PAL = {
    wallL: '#111111', wallR: '#222222', roof: '#333333', win: '#444444',
    sign: '#555555', glow: '#666666', tileFill: '#777777', tileEdge: '#888888',
  };
  const ellipses = (calls: Array<{ op: string }>) => calls.filter((c) => c.op === 'ellipse').length;

  it('PROC_PRESETS 已注册 5 个新原型', () => {
    expect(PROC_PRESETS.stall).toBe(stall);
    expect(PROC_PRESETS.market3).toBe(market3);
    expect(PROC_PRESETS.onsenHouse).toBe(onsenHouse);
    expect(PROC_PRESETS.gate).toBe(gate);
    expect(PROC_PRESETS.barn).toBe(barn);
  });

  it('空 params 下都不抛错且有产物（L4 兜底永不空白）', () => {
    for (const preset of [stall, market3, onsenHouse, gate, barn]) {
      const { g, calls } = recorder();
      expect(() => preset(g as never, ctxOf2({}) as never)).not.toThrow();
      expect(calls.length).toBeGreaterThan(0);
    }
  });

  it('palette 色键逐键生效：stall 读 wallL/wallR/roof/win/sign/glow', () => {
    const { g, calls } = recorder();
    stall(g as never, ctxOf2({ hue: 30, ...PAL }) as never);
    const cs = colors(calls);
    for (const k of ['wallL', 'wallR', 'roof', 'win', 'sign', 'glow'] as const) {
      expect(cs).toContain(PAL[k]);
    }
  });

  it('market3 去青回归：产物不含青幕墙 / 霓虹色', () => {
    const { g, calls } = recorder();
    market3(g as never, ctxOf2({ hue: 200 }) as never);
    const cs = colors(calls);
    expect(cs).not.toContain('#9fd8ff');
    expect(cs).not.toContain('#5ef0c0');
    expect(cs).not.toContain('#29a9e0');
  });

  it('onsenHouse 的汤池与汤雾各自独立触发（steam 不再顺带画池）', () => {
    const base = ctxOf2({ hue: 30 });
    const none = recorder(); onsenHouse(none.g as never, base as never);
    const pool = recorder(); onsenHouse(pool.g as never, { ...base, params: { hue: 30, pool: true } } as never);
    const steam = recorder(); onsenHouse(steam.g as never, { ...base, params: { hue: 30, steam: true } } as never);
    expect(ellipses(pool.calls) - ellipses(none.calls)).toBe(3);
    expect(ellipses(steam.calls) - ellipses(none.calls)).toBe(6);
  });

  it('gate / barn 同样读色键（sign 匾额 / roof 顶檐）', () => {
    const gt = recorder();
    gate(gt.g as never, ctxOf2({ hue: 30, sign: '#123456', roof: '#abcdef' }) as never);
    expect(colors(gt.calls)).toContain('#123456');
    expect(colors(gt.calls)).toContain('#abcdef');

    const br = recorder();
    barn(br.g as never, ctxOf2({ hue: 30, roof: '#abcdef' }) as never);
    expect(colors(br.calls)).toContain('#abcdef');
  });
});

describe('proc preset: 业主色（M18 D3：只染屋面 + 门面 + 描边）', () => {
  const OWN = '#abcdef';
  const ctxOwned = (params: Record<string, unknown>, level: number) => ({
    geo: { hw: 24, hh: 13, ox: 195, oy: 104 },
    box: { w: 48, d: 26, h: 72 },
    cx: 195,
    cy: 104,
    s: 1,
    params,
    state: { level, owner: 1, ownerColors: { 1: OWN } },
  });

  it('无业主 → 不出现业主色；有业主 → 屋面/门面/描边出现业主色', () => {
    const none = recorder();
    market3(none.g as never, { ...ctxOwned({ hue: 200 }, 3), state: { level: 3 } } as never);
    expect(colors(none.calls)).not.toContain(OWN);

    const owned = recorder();
    market3(owned.g as never, ctxOwned({ hue: 200 }, 3) as never);
    const cs = colors(owned.calls);
    expect(cs).toContain(OWN);
    /* 至少 3 处：门面 + 屋面 + 描边（女儿墙 / 阁楼檐线） */
    expect(cs.filter((x) => x === OWN).length).toBeGreaterThanOrEqual(3);
  });

  it('楼体墙**不**被业主色染：仍走 hue 派生的 hsl，且业主色占比不过半', () => {
    const { g, calls } = recorder();
    market3(g as never, ctxOwned({ hue: 200 }, 3) as never);
    const cs = colors(calls);
    expect(cs).toContain('hsl(200,32%,20%)');   // wallL：satL 32 / litL3 20
    expect(cs).toContain('hsl(200,36%,28%)');   // wallR：satR 36 / litR3 28
    expect(cs.filter((x) => x === OWN).length).toBeLessThan(cs.length / 2);
  });

  it('shop（L1/L2）同样只染屋面 + 门面 + 脊线/女儿墙', () => {
    const { g, calls } = recorder();
    shop(g as never, ctxOwned({ hue: 32 }, 1) as never);
    const cs = colors(calls);
    expect(cs).toContain(OWN);
    expect(cs).toContain('hsl(32,32%,23%)');    // wallL 未被染
  });
});

describe('proc preset: shop 换代构件开关（M18 D2）', () => {
  it('L1 幡旗：flag 开比关多出绘制指令（默认关 = 零回归）', () => {
    const off = recorder();
    shop(off.g as never, ctxOf(1) as never);
    const on = recorder();
    shop(on.g as never, ctxOf(1, { flag: true }) as never);
    expect(off.calls.filter((c) => c.op === 'poly').length).toBeGreaterThan(10);
    expect(on.calls.length).toBeGreaterThan(off.calls.length);
  });

  it('L2 雨棚：canopy 开比关多出绘制指令（默认关 = 零回归）', () => {
    const off = recorder();
    shop(off.g as never, ctxOf(2) as never);
    const on = recorder();
    shop(on.g as never, ctxOf(2, { canopy: true }) as never);
    expect(on.calls.length).toBeGreaterThan(off.calls.length);
  });

  it('旗面 / 雨棚走 sign 色键（可被 palette 与业主色覆盖）', () => {
    const { g, calls } = recorder();
    shop(g as never, ctxOf(1, { flag: true, sign: '#123456' }) as never);
    expect(colors(calls)).toContain('#123456');

    const c2 = recorder();
    shop(c2.g as never, ctxOf(2, { canopy: true, sign: '#123456' }) as never);
    expect(colors(c2.calls)).toContain('#123456');
  });
});

describe('proc preset: market3 换代（M18 D2/D4）', () => {
  const lv = (n: number) => ({
    geo: { hw: 24, hh: 13, ox: 195, oy: 104 },
    box: { w: 48, d: 26, h: 72 },
    cx: 195,
    cy: 104,
    s: 1,
    params: { hue: 200 },
    state: { level: n },
  });
  const draw = (n: number) => {
    const r = recorder();
    market3(r.g as never, lv(n) as never);
    return r.calls;
  };
  const ellipses = (cs: Array<{ op: string }>) => cs.filter((c) => c.op === 'ellipse');

  it('L3 → L4 → L5 绘制指令逐级递增（换代真的发生）', () => {
    const c3 = draw(3).length, c4 = draw(4).length, c5 = draw(5).length;
    expect(c4).toBeGreaterThan(c3);
    expect(c5).toBeGreaterThan(c4);
  });

  it('霓虹描边 + 五星徽记只在 L5 出现', () => {
    const NEON = 'rgba(255,236,170,.9)';
    const STAR = '#ffe9a8';
    expect(colors(draw(3))).not.toContain(NEON);
    expect(colors(draw(4))).not.toContain(NEON);
    expect(colors(draw(5))).toContain(NEON);
    expect(colors(draw(5))).toContain(STAR);
  });

  it('地砖发光环 + 光晕只在 L5 出现（地面 ellipse 数 +2）', () => {
    /* Step 6 实画「双环 ×2 描边 ellipse + 光晕 ×1 填充 ellipse」共 3 个地面 ellipse，
       断言按其语义「至少多 2」（环 + 光晕），并确认 L3/L4 一个都不多。 */
    expect(ellipses(draw(3)).length).toBe(ellipses(draw(4)).length);
    expect(ellipses(draw(5)).length).toBeGreaterThanOrEqual(ellipses(draw(4)).length + 2);
  });

  it('L5 的五角星是 10 顶点一填充（starN 兜底 = 10）', () => {
    const polys = draw(5).filter((c) => c.op === 'poly' && (c.pts?.length ?? 0) === 20) as never[];
    expect(polys.length).toBeGreaterThanOrEqual(1);
  });
});