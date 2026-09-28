import { describe, it, expect } from 'vitest';
import {
  antenna, awning, banner, lamp, lantern, rooftopBox, signTower, tree,
} from '../../src/render/providers/proc-props';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import type { TextRequest } from '../../src/render/providers/proc';

interface Rec { op: string; pts?: number[]; style: Record<string, unknown> }

function recorder() {
  const calls: Rec[] = [];
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
const count = (calls: Rec[], op: string) => calls.filter((c) => c.op === op).length;
const ys = (calls: Rec[]) => calls.filter((c) => c.op === 'poly').flatMap((c) => (c.pts ?? []).filter((_, i) => i % 2 === 1));

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };
/** s = 0.72 = 棋盘建筑缩放；h = 2 级墙高 46×0.72 = 33.12 */
const ctxOf = (params: Record<string, unknown> = {}, state: Record<string, unknown> = { level: 2 }, lift = 0) => ({
  geo: GEO,
  box: { w: 14, d: 8, h: 30 },
  cx: 195,
  cy: 96,
  s: 0.72,
  lift,
  params,
  state,
});
const texts: TextRequest[] = [];
const withText = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...extra,
  text: (r: TextRequest) => texts.push(r),
});

describe('prop.tree 行道树（v5 isoTree）', () => {
  it('影 + 双树干 + 四团树冠 + 一记高光', () => {
    const { g, calls } = recorder();
    tree(g as never, ctxOf() as never);
    expect(count(calls, 'ellipse')).toBe(1);
    expect(count(calls, 'poly')).toBe(2);
    expect(count(calls, 'circle')).toBe(5);
  });
});

describe('prop.lamp 路灯（v5 streetLamp）', () => {
  it('影 + 立柱 + 光晕 + 灯珠', () => {
    const { g, calls } = recorder();
    lamp(g as never, ctxOf() as never);
    expect(count(calls, 'ellipse')).toBe(1);
    expect(count(calls, 'rect')).toBe(1);
    expect(count(calls, 'circle')).toBe(2);
  });
});

describe('prop.lantern 红灯笼（v5 lantern）', () => {
  it('吊绳 + 灯身 + 高光 + 上下金箍；state.char 有字时交给 ctx.text', () => {
    texts.length = 0;
    const { g, calls } = recorder();
    lantern(g as never, { ...ctxOf({}, { level: 2, at: 'door', char: '汤' }), ...withText() } as never);
    expect(count(calls, 'ellipse')).toBe(2);
    expect(count(calls, 'rect')).toBe(2);
    expect(count(calls, 'lineTo')).toBe(1);
    expect(texts.length).toBe(1);
    expect(texts[0].text).toBe('汤');
  });

  it('无字时不出文字（缺素材不空白、不报错）', () => {
    texts.length = 0;
    const { g } = recorder();
    lantern(g as never, { ...ctxOf({}, { level: 2, at: 'side' }), ...withText() } as never);
    expect(texts.length).toBe(0);
  });
});

describe('prop.banner 竖招幌子（v5 vBanner）', () => {
  it('挑臂 + 旗面 + 每字一条文字请求（竖排）', () => {
    texts.length = 0;
    const { g, calls } = recorder();
    banner(g as never, { ...ctxOf({ text: '温泉' }), ...withText() } as never);
    expect(count(calls, 'lineTo')).toBe(1);
    expect(count(calls, 'roundRect')).toBe(1);
    expect(texts.map((t) => t.text).join('')).toBe('温泉');
    /* 竖排：后一字比前一字低一个行距 */
    expect(texts[1].y - texts[0].y).toBeCloseTo(8.8 * 0.72, 5);
  });
});

describe('prop.awning 遮阳篷（v5 line 212–216）', () => {
  it('底板 + 四道红条 + 一道暗唇 = 6 个多边形', () => {
    const { g, calls } = recorder();
    awning(g as never, ctxOf({}, { level: 1 }, 0.64 * 26) as never);
    expect(count(calls, 'poly')).toBe(6);
  });

  it('贴墙几何随 lift 一起上移（y0 = cy + lift×s，不飘在楼外）', () => {
    const minY = (lift: number) => {
      const { g, calls } = recorder();
      awning(g as never, ctxOf({}, { level: 1 }, lift) as never);
      return Math.min(...ys(calls));
    };
    expect(minY(16.64) - minY(0)).toBeCloseTo(16.64 * 0.72, 4);
  });
});

describe('prop.rooftopBox 屋顶设备箱（v5 line 221–222）', () => {
  it('两个等距箱体 = 6 个多边形，且直接用已抬升的 cy（不再二次上移）', () => {
    const at = (lift: number) => {
      const { g, calls } = recorder();
      rooftopBox(g as never, ctxOf({}, { level: 2 }, lift) as never);
      return { n: count(calls, 'poly'), y: Math.min(...ys(calls)) };
    };
    expect(at(0).n).toBe(6);
    expect(at(33.12).y).toBeCloseTo(at(0).y, 5);
  });
});

describe('prop.signTower / prop.antenna 屋顶招牌塔与天线（v5 line 226–229）', () => {
  it('招牌塔：箱体 3 面 + 桅杆 + 红灯', () => {
    const { g, calls } = recorder();
    signTower(g as never, ctxOf({}, { level: 3 }, 72) as never);
    expect(count(calls, 'poly')).toBe(3);
    expect(count(calls, 'lineTo')).toBe(1);
    expect(count(calls, 'circle')).toBe(1);
  });

  it('天线：一根杆 + 一颗红灯', () => {
    const { g, calls } = recorder();
    antenna(g as never, ctxOf({}, { level: 3 }, 72) as never);
    expect(count(calls, 'lineTo')).toBe(1);
    expect(count(calls, 'circle')).toBe(1);
  });
});

describe('注册表', () => {
  it('PROC_PRESETS 八个 prop preset 全部注册', () => {
    expect(PROC_PRESETS.awning).toBe(awning);
    expect(PROC_PRESETS.lantern).toBe(lantern);
    expect(PROC_PRESETS.banner).toBe(banner);
    expect(PROC_PRESETS.rooftopBox).toBe(rooftopBox);
    expect(PROC_PRESETS.signTower).toBe(signTower);
    expect(PROC_PRESETS.antenna).toBe(antenna);
    expect(PROC_PRESETS.tree).toBe(tree);
    expect(PROC_PRESETS.lamp).toBe(lamp);
  });
});