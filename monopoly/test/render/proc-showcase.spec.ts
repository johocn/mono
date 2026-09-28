import { describe, it, expect } from 'vitest';
import {
  SHOWCASE_L, showcaseGround, showcaseHud, showcaseMini, showcasePanel, showcaseSky, showcaseSkyline,
} from '../../src/render/providers/proc-showcase';
import { shop } from '../../src/render/providers/proc-building';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import type { TextRequest } from '../../src/render/providers/proc';

interface Rec { op: string; pts?: number[]; style: Record<string, unknown> }

/** 记录绘制指令：poly/rect/roundRect/circle/ellipse 记数字入参，其余记 style */
function recorder() {
  const calls: Rec[] = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      if (op === 'poly' || op === 'rect' || op === 'roundRect' || op === 'circle' || op === 'ellipse') calls.push({ op, pts: a as number[], style: {} });
      else calls.push({ op, style: (a[0] ?? {}) as Record<string, unknown> });
      return g;
    },
  });
  return { g, calls };
}
const count = (calls: Rec[], op: string) => calls.filter((c) => c.op === op).length;
const fills = (calls: Rec[]) => calls.filter((c) => c.op === 'fill').map((c) => String(c.style.color ?? ''));

/** 橱窗元素全部以「面板左上角」为台位（cx/cy = SHOWCASE_L.x/y），box 即面板尺寸 */
const ctxOf = (params: Record<string, unknown> = {}, state: Record<string, unknown> = {}) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: SHOWCASE_L.w, d: 1, h: SHOWCASE_L.h },
  cx: SHOWCASE_L.x,
  cy: SHOWCASE_L.y,
  s: 1,
  params,
  state,
});

describe('showcase.panel 底板（v5 showcase line 340）', () => {
  it('一次圆角矩形，fill + stroke 都来自 params', () => {
    const { g, calls } = recorder();
    showcasePanel(g as never, ctxOf() as never);
    expect(count(calls, 'roundRect')).toBe(1);
    expect(calls.find((c) => c.op === 'fill')?.style).toEqual({ color: '#0f1a18' });
    expect(calls.find((c) => c.op === 'stroke')?.style).toEqual({ color: 'hsla(45,70%,55%,.5)', width: 1 });
  });
});

describe('showcase.sky 夜空（v5 line 344–345 的渐变近似）', () => {
  it('24 条横带铺满地平线以上，末带不低于地平线；月亮 + 光晕 2 圆', () => {
    const { g, calls } = recorder();
    showcaseSky(g as never, ctxOf() as never);
    expect(count(calls, 'rect')).toBe(SHOWCASE_L.skyBands);
    expect(count(calls, 'circle')).toBe(2);
    const ys = calls.filter((c) => c.op === 'rect').map((c) => c.pts![1]);
    expect(Math.min(...ys)).toBe(SHOWCASE_L.y);
    expect(Math.max(...ys)).toBeLessThan(SHOWCASE_L.y + SHOWCASE_L.h * SHOWCASE_L.gy);
  });

  it('三段色按 t1/t2 阈值切换（顶/中/底三色都出现）', () => {
    const { g, calls } = recorder();
    showcaseSky(g as never, ctxOf() as never);
    /* 只取前 skyBands 次 fill（= 横带）；末尾 2 次是月亮/光晕的圆填充 */
    const cs = new Set(fills(calls).slice(0, SHOWCASE_L.skyBands));
    expect(cs).toEqual(new Set(['#0d1b2a', '#16302f', '#1e2f2a']));
  });
});

describe('showcase.skyline 亮窗天际线（v5 line 346–352）', () => {
  it('每栋楼 = 1 楼块 + 6 扇亮窗；楼块数与窗数严格成比例', () => {
    const { g, calls } = recorder();
    showcaseSkyline(g as never, ctxOf() as never);
    const rects = calls.filter((c) => c.op === 'rect');
    expect(rects.length % (SHOWCASE_L.skyWinRows + 1)).toBe(0);
    const blocks = rects.length / (SHOWCASE_L.skyWinRows + 1);
    expect(blocks).toBeGreaterThan(6);
    expect(blocks).toBeLessThan(20);
    expect(rects.filter((r) => r.pts![2] === SHOWCASE_L.skyWinW).length).toBe(blocks * SHOWCASE_L.skyWinRows);
  });

  it('楼块顶边都在地平线之上、底边压在地平线上', () => {
    const { g, calls } = recorder();
    showcaseSkyline(g as never, ctxOf() as never);
    const gy = SHOWCASE_L.y + SHOWCASE_L.h * SHOWCASE_L.gy;
    const blocks = calls.filter((c) => c.op === 'rect' && c.pts![2] !== SHOWCASE_L.skyWinW);
    for (const b of blocks) expect(b.pts![1] + b.pts![3]).toBeCloseTo(gy, 5);
  });
});

describe('showcase.ground 地面 + 石板广场（v5 line 354–357）', () => {
  it('一块地面矩形 + 两个菱形石板，填充色外深内浅', () => {
    const { g, calls } = recorder();
    showcaseGround(g as never, ctxOf() as never);
    expect(count(calls, 'rect')).toBe(1);
    expect(count(calls, 'poly')).toBe(2);
    expect(fills(calls)).toEqual(['#1b2622', '#2a3830', '#33423a']);
  });
});

describe('showcase.hud 信息条（v5 optB line 444–448）', () => {
  it('三个圆角底板 + 5 条左对齐文字（品牌/副标/两行信息/按钮）', () => {
    const texts: TextRequest[] = [];
    const { g, calls } = recorder();
    showcaseHud(g as never, {
      ...ctxOf({}, {
        brand: '太平温泉', sub: '商铺 · 持有者 老王',
        line1: '2 层建筑 · 路过租金 ￥45', line2: '升级到 L3 → 租金 ￥105', cta: '支付 ￥180',
      }),
      text: (r: TextRequest) => texts.push(r),
    } as never);
    expect(count(calls, 'roundRect')).toBe(3);
    expect(texts.map((t) => t.text)).toEqual([
      '太平温泉', '商铺 · 持有者 老王', '2 层建筑 · 路过租金 ￥45', '升级到 L3 → 租金 ￥105', '支付 ￥180',
    ]);
    /* 信息条是左对齐排版（makeText 会据此把 anchor 设为 0） */
    expect(texts.every((t) => t.align === 'left')).toBe(true);
  });

  it('state 缺字段时不抛错、不产出空文字（缺素材不空白）', () => {
    const texts: TextRequest[] = [];
    const { g } = recorder();
    expect(() => showcaseHud(g as never, { ...ctxOf(), text: (r: TextRequest) => texts.push(r) } as never)).not.toThrow();
    expect(texts.length).toBe(0);
  });
});

describe('shop 温泉池与蒸汽（v5 line 252–258，showcase 专用分支）', () => {
  const base = {
    geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
    box: { w: 42, d: 21, h: 46 },
    cx: 195, cy: 96, s: 1,
    state: { level: 2 },
  };

  it('pool=true → 多 3 个椭圆（池沿/水面/高光）；默认不带', () => {
    const off = recorder();
    shop(off.g as never, { ...base, params: { levels: 2, hue: 32 } } as never);
    const on = recorder();
    shop(on.g as never, { ...base, params: { levels: 2, hue: 32, pool: true } } as never);
    expect(count(on.calls, 'ellipse') - count(off.calls, 'ellipse')).toBe(3);
  });

  it('steam=true → 多 6 个椭圆（3 组 × 2 团）', () => {
    const off = recorder();
    shop(off.g as never, { ...base, params: { levels: 2, hue: 32 } } as never);
    const on = recorder();
    shop(on.g as never, { ...base, params: { levels: 2, hue: 32, steam: true } } as never);
    expect(count(on.calls, 'ellipse') - count(off.calls, 'ellipse')).toBe(6);
  });

  it('state.pool / state.steam 同样生效（skin 与 override 两条路都行）', () => {
    const { g, calls } = recorder();
    shop(g as never, { ...base, params: { levels: 2, hue: 32 }, state: { level: 2, pool: true, steam: true } } as never);
    expect(count(calls, 'ellipse')).toBeGreaterThan(3);
  });
});

describe('注册表', () => {
  it('PROC_PRESETS 注册 5 个 showcase preset', () => {
    expect(PROC_PRESETS.showcasePanel).toBe(showcasePanel);
    expect(PROC_PRESETS.showcaseSky).toBe(showcaseSky);
    expect(PROC_PRESETS.showcaseSkyline).toBe(showcaseSkyline);
    expect(PROC_PRESETS.showcaseGround).toBe(showcaseGround);
    expect(PROC_PRESETS.showcaseHud).toBe(showcaseHud);
  });

  it('SHOWCASE_L 是 fb 容器：版式常量集中一处（唯一允许裸字面量的位置）', () => {
    expect(SHOWCASE_L.w).toBe(370);
    expect(SHOWCASE_L.h).toBe(300);
    expect(SHOWCASE_L.shopScale).toBe(3.2);
  });
});

describe('showcase.mini 迷你卡（v5 miniShop line 369–380）', () => {
  const ctxMini = (s = 1, state: Record<string, unknown> = { caption: 'L1 摊位 · ￥60' }) => ({
    geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
    box: { w: SHOWCASE_L.miniW, d: 1, h: SHOWCASE_L.miniH },
    cx: 0,
    cy: 0,
    s,
    params: {},
    state,
  });
  /** 地面矩形的高度（用来把天际线楼块从 rect 里筛出来） */
  const groundH = SHOWCASE_L.miniH * (1 - SHOWCASE_L.miniGy);

  it('一张圆角底板 + 天际线楼块（无窗）+ 地面矩形 + 石板菱形；楼块数在 6..19 之间', () => {
    const { g, calls } = recorder();
    showcaseMini(g as never, ctxMini() as never);
    expect(count(calls, 'roundRect')).toBe(1);
    expect(count(calls, 'poly')).toBe(1);
    const blocks = calls.filter((c) => c.op === 'rect' && c.pts![3] !== groundH);
    expect(blocks.length).toBeGreaterThan(5);
    expect(blocks.length).toBeLessThan(20);
    expect(count(calls, 'rect')).toBe(blocks.length + 1);
    expect(fills(calls)).toEqual([
      '#101a17', ...Array(blocks.length).fill('#16221e'), '#1b2622', '#2a3830',
    ]);
  });

  it('楼块顶边都在地平线之上、底边压在地平线上；高度只有 20 / 32 / 44 三档', () => {
    const { g, calls } = recorder();
    showcaseMini(g as never, ctxMini() as never);
    const gy = SHOWCASE_L.miniH * SHOWCASE_L.miniGy;
    const blocks = calls.filter((c) => c.op === 'rect' && c.pts![3] !== groundH);
    const tiers = new Set<number>();
    for (const b of blocks) {
      expect(b.pts![1] + b.pts![3]).toBeCloseTo(gy, 5);
      tiers.add(b.pts![3]);
    }
    expect([...tiers].sort((a, b) => a - b)).toEqual([
      SHOWCASE_L.miniSkyHBase,
      SHOWCASE_L.miniSkyHBase + SHOWCASE_L.miniSkyHStep,
      SHOWCASE_L.miniSkyHBase + 2 * SHOWCASE_L.miniSkyHStep,
    ]);
    expect(Math.min(...[...tiers])).toBeGreaterThan(0);
  });

  it('缩放全部经 ctx.s 施加：底板宽高与地平线按 s 收缩（v5 的 CSS 缩放等价物）', () => {
    const k = SHOWCASE_L.miniCardScale;
    const { g, calls } = recorder();
    showcaseMini(g as never, ctxMini(k) as never);
    const rr = calls.find((c) => c.op === 'roundRect')!;
    expect(rr.pts![2]).toBeCloseTo(SHOWCASE_L.miniW * k, 5);
    expect(rr.pts![3]).toBeCloseTo(SHOWCASE_L.miniH * k, 5);
    /* 地平线取「地面矩形」（最后一个 rect）：天际线楼块在前，不能取 [0] */
    const ground = calls.filter((c) => c.op === 'rect').at(-1)!;
    expect(ground.pts![1]).toBeCloseTo(SHOWCASE_L.miniH * SHOWCASE_L.miniGy * k, 5);
  });

  it('底部标签：1 条居中文字，字号不随 s 缩放（v5 line 450–452 的卡外标签）', () => {
    const texts: TextRequest[] = [];
    const { g } = recorder();
    showcaseMini(g as never, {
      ...ctxMini(SHOWCASE_L.miniCardScale),
      text: (r: TextRequest) => texts.push(r),
    } as never);
    expect(texts.length).toBe(1);
    expect(texts[0].text).toBe('L1 摊位 · ￥60');
    expect(texts[0].size).toBe(SHOWCASE_L.miniCapFs);
    expect(texts[0].align).toBe('center');
  });

  it('注册进 PROC_PRESETS', () => {
    expect(PROC_PRESETS.showcaseMini).toBe(showcaseMini);
  });
});