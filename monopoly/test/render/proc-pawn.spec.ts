import { describe, it, expect } from 'vitest';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import { pawn } from '../../src/render/providers/proc-pawn';

/** 记录每次图元调用名与实参（实参用于断言色值只落在该落的位置） */
function recorder() {
  const names: string[] = [];
  const args: string[] = [];
  const g = new Proxy({}, {
    get: (_t, k: string) => (...a: unknown[]) => {
      names.push(k);
      args.push(JSON.stringify(a));
      return g;
    },
  });
  return { g: g as never, names, args };
}

const ctx = (params: Record<string, unknown>, state: Record<string, unknown>) => ({
  geo: { hw: 24, hh: 13, ox: 195, oy: 104 },
  box: { w: 12, d: 6, h: 20 },
  cx: 100, cy: 200, s: 0.62,
  params, state,
}) as never;

describe('proc preset: pawn（西游·取经四众，spec §6.6）', () => {
  it('含人形五官：椭圆（影/眼/腮红/耳）与圆（手/耳/头/顶饰）各 ≥4，且已注册进 PROC_PRESETS', () => {
    const { g, names } = recorder();
    pawn(g, ctx({ style: 'wukong' }, { owner: 1, mood: 'calm' }));
    expect(names.filter((c) => c === 'ellipse').length).toBeGreaterThanOrEqual(4);
    expect(names.filter((c) => c === 'circle').length).toBeGreaterThanOrEqual(4);
    expect(PROC_PRESETS.pawn).toBe(pawn);
  });

  it('Q 版比例：头径 ≈ 总高 57%（1.75 头身）、大眼宽 ≈ 头宽 28%', () => {
    const { g, names, args } = recorder();
    pawn(g, ctx({ style: 'sanzang' }, { owner: 1, mood: 'calm' }));
    /* 三藏差点最少（仅通用的手/耳/头/顶珠/瞳孔），头是唯一的大圆 */
    const rOf = (n: string): number[][] => names
      .map((c, i) => (c === n ? (JSON.parse(args[i]) as number[]) : null))
      .filter((v): v is number[] => v !== null);
    const headR = Math.max(...rOf('circle').map((a) => a[2]));
    /* designH * u == box.h * s（scale 恒 1）—— 即「总高」在屏幕上的像素高度 */
    const total = 20 * 0.62;
    /* 比宽高的椭圆只有一对（睁眼）：腮红压扁、毗卢帽压扁、投影压扁 */
    const eyes = rOf('ellipse').filter((a) => a[3] > a[2] && a[2] < 2.5);
    expect(eyes).toHaveLength(2);
    expect((2 * headR) / total).toBeGreaterThanOrEqual(0.54);
    expect((2 * headR) / total).toBeLessThanOrEqual(0.6);
    expect((2 * eyes[0][2]) / (2 * headR)).toBeGreaterThanOrEqual(0.25);
    expect((2 * eyes[0][2]) / (2 * headR)).toBeLessThanOrEqual(0.33);
  });

  it('三表情几何互不相同', () => {
    const sig = (mood: string): string => {
      const { g, args } = recorder();
      pawn(g, ctx({ style: 'wukong' }, { owner: 1, mood }));
      return args.join('|');
    };
    expect(new Set([sig('calm'), sig('happy'), sig('sad')]).size).toBe(3);
  });

  it('四角色（悟空/八戒/悟净/三藏）均不抛错，且造型图元互不相同', () => {
    const sig = (style: string): string => {
      const { g, args } = recorder();
      expect(() => pawn(g, ctx({ style }, { owner: 2, mood: 'calm' }))).not.toThrow();
      return args.join('|');
    };
    expect(new Set(['wukong', 'bajie', 'wujing', 'sanzang'].map(sig)).size).toBe(4);
  });

  it('归属色只染腰带与披肩：衣服按角色固定色、披肩取 ownerColors 令牌', () => {
    const { g, args } = recorder();
    pawn(g, ctx({ style: 'wukong' }, { owner: 2, mood: 'calm', ownerColors: { 2: '#f0a039' } }));
    const joined = args.join('|');
    expect(joined).toContain('#fdf6e8');   // 悟空僧袍米白（legL/legR/body/armL/armR）
    expect(joined).toContain('#f0a039');   // owner2 橙 → 腰带 + 披肩
    expect(joined).not.toContain('#3fbf7f');
  });

  it('角色定色可辨：悟空猴毛 + 金箍、八戒拱嘴、悟净络腮胡、三藏红袈裟 + 毗卢帽', () => {
    const shot = (style: string): string => {
      const { g, args } = recorder();
      pawn(g, ctx({ style }, { owner: 1, mood: 'calm' }));
      return args.join('|');
    };
    expect(shot('wukong')).toContain('#d8a463');   // 悟空猴毛肤色
    expect(shot('wukong')).toContain('#f0c04a');   // 金箍
    expect(shot('bajie')).toContain('#eda88f');    // 八戒拱嘴
    expect(shot('wujing')).toContain('#2f2a26');   // 悟净络腮胡 / 蓬松卷发
    expect(shot('sanzang')).toContain('#c8402f');  // 三藏红袈裟
    expect(shot('sanzang')).toContain('#e0a92e');  // 毗卢帽
  });

  it('五官必备件齐备：瞳孔白高光 ≥2（睁眼两态）+ 头发 + 腮红（三态恒有）', () => {
    for (const mood of ['calm', 'happy', 'sad']) {
      const { g, args } = recorder();
      pawn(g, ctx({ style: 'wukong' }, { owner: 1, mood }));
      const joined = args.join('|');
      expect(joined).toContain('#3b2b22');   // 头发
      expect(joined).toContain('#f0938f');   // 腮红
      /* happy 是弯眼（不画瞳孔），故白高光只在 calm / sad 两态断言，且必须双眼都有 */
      if (mood !== 'happy') expect(joined.split('#ffffff').length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it('缺 ownerColors 时披肩回落内建兜底色；当前玩家亮光晕、非当前玩家不亮', () => {
    const plain = recorder();
    pawn(plain.g, ctx({ style: 'wukong' }, { owner: 1, mood: 'calm' }));
    expect(plain.args.join('|')).toContain('#3fbf7f');

    const off = recorder();
    pawn(off.g, ctx({ style: 'wukong' }, { owner: 1, mood: 'calm' }));
    const on = recorder();
    pawn(on.g, ctx({ style: 'wukong' }, { owner: 1, mood: 'calm', active: true }));
    expect(on.names.filter((c) => c === 'ellipse').length).toBe(
      off.names.filter((c) => c === 'ellipse').length + 1,
    );
  });
});