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

describe('proc preset: pawn（Q 版小朋友，spec §6.6）', () => {
  it('含人形五官：椭圆（影/眼/腮红/刘海）与圆（手/耳/头/铃铛）各 ≥4，且已注册进 PROC_PRESETS', () => {
    const { g, names } = recorder();
    pawn(g, ctx({ style: 'short' }, { owner: 1, mood: 'calm' }));
    expect(names.filter((c) => c === 'ellipse').length).toBeGreaterThanOrEqual(4);
    expect(names.filter((c) => c === 'circle').length).toBeGreaterThanOrEqual(4);
    expect(PROC_PRESETS.pawn).toBe(pawn);
  });

  it('三表情几何互不相同', () => {
    const sig = (mood: string): string => {
      const { g, args } = recorder();
      pawn(g, ctx({ style: 'short' }, { owner: 1, mood }));
      return args.join('|');
    };
    expect(new Set([sig('calm'), sig('happy'), sig('sad')]).size).toBe(3);
  });

  it('四 style 均不抛错，且造型图元互不相同', () => {
    const sig = (style: string): string => {
      const { g, args } = recorder();
      expect(() => pawn(g, ctx({ style }, { owner: 2, mood: 'calm' }))).not.toThrow();
      return args.join('|');
    };
    expect(new Set(['short', 'cap', 'twintail', 'bun'].map(sig)).size).toBe(4);
  });

  it('归属色只染围巾与头饰：衣服统一米白、围巾取 ownerColors 令牌', () => {
    const { g, args } = recorder();
    pawn(g, ctx({ style: 'short' }, { owner: 2, mood: 'calm', ownerColors: { 2: '#f0a039' } }));
    const joined = args.join('|');
    expect(joined).toContain('#fdf6e8');   // 衣服米白（legL/legR/body/armL/armR）
    expect(joined).toContain('#f0a039');   // owner2 橙 → 围巾 + 头饰
    expect(joined).not.toContain('#3fbf7f');
  });

  it('五官必备件齐备：瞳孔白高光 ≥2（睁眼两态）+ 头发 + 腮红（三态恒有）', () => {
    for (const mood of ['calm', 'happy', 'sad']) {
      const { g, args } = recorder();
      pawn(g, ctx({ style: 'short' }, { owner: 1, mood }));
      const joined = args.join('|');
      expect(joined).toContain('#3b2b22');   // 头发
      expect(joined).toContain('#f0938f');   // 腮红
      /* happy 是弯眼（不画瞳孔），故白高光只在 calm / sad 两态断言，且必须双眼都有 */
      if (mood !== 'happy') expect(joined.split('#ffffff').length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it('缺 ownerColors 时围巾回落内建兜底色；当前玩家亮光晕、非当前玩家不亮', () => {
    const plain = recorder();
    pawn(plain.g, ctx({ style: 'short' }, { owner: 1, mood: 'calm' }));
    expect(plain.args.join('|')).toContain('#3fbf7f');

    const off = recorder();
    pawn(off.g, ctx({ style: 'short' }, { owner: 1, mood: 'calm' }));
    const on = recorder();
    pawn(on.g, ctx({ style: 'short' }, { owner: 1, mood: 'calm', active: true }));
    expect(on.names.filter((c) => c === 'ellipse').length).toBe(
      off.names.filter((c) => c === 'ellipse').length + 1,
    );
  });
});