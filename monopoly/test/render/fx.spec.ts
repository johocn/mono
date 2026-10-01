import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { motionFor, resolveMotion, timeScaleFrom, type FxKind } from '../../src/render/fx';
import { FX_EASE_FALLBACK, FX_LEVELS, FX_NOFX_SPEED, FX_SHAKE_AMP, FX_SHAKE_MS } from '../../src/skin/layout';
import type { FxTokens } from '../../src/skin/types';

/** spec §5.6 的九行动效清单（与 FxKind 一一对应） */
const KINDS: FxKind[] = ['dice', 'hop', 'buy', 'upgrade', 'rent', 'card', 'deck', 'stock', 'end', 'land'];

describe('fx 动画参数表 motionFor（spec §5.6 九条）', () => {
  it('9 个场景各返回 { durationMs>0, ease 非空 }', () => {
    for (const kind of KINDS) {
      const m = motionFor(kind, null);
      expect(m.durationMs, kind).toBeGreaterThan(0);
      expect(typeof m.ease, kind).toBe('string');
      expect(m.ease.length, kind).toBeGreaterThan(0);
    }
  });

  it('皮肤 fx token 注入 ease（不写死；缺省回落 layout 的 FX_EASE_FALLBACK）', () => {
    const tokens: FxTokens = { ease: 'back.out', shake: { amp: 9, ms: 240 }, dust: { count: 5 } };
    expect(motionFor('dice', tokens).ease).toBe('back.out');
    expect(motionFor('dice', null).ease).toBe(FX_EASE_FALLBACK);
    const t = resolveMotion(tokens);
    expect(t).toEqual({ ease: 'back.out', shakeMs: 240, shakeAmp: 9, dust: 5 });
    const d = resolveMotion(null);
    expect(d).toEqual({ ease: FX_EASE_FALLBACK, shakeMs: FX_SHAKE_MS, shakeAmp: FX_SHAKE_AMP, dust: expect.any(Number) });
  });

  it('同 tokens → 同参数（确定性）', () => {
    for (const kind of KINDS) {
      expect(motionFor(kind, null)).toEqual(motionFor(kind, null));
      expect(motionFor(kind, null)).toEqual(motionFor(kind, undefined));
    }
  });

  it('upgrade / rent / hop 的附加字段齐备', () => {
    const up = motionFor('upgrade', null);
    expect(up.levels).toBe(FX_LEVELS);
    expect(up.perLevelLitMs).toBeGreaterThan(0);
    expect(up.scaffoldMs).toBeGreaterThan(0);

    const rent = motionFor('rent', null);
    expect(rent.coins).toBeGreaterThan(0);
    expect(rent.flyMs).toBeGreaterThan(0);

    const hop = motionFor('hop', null);
    expect(hop.arc).toBeGreaterThan(0);
    expect(hop.kickMs).toBeGreaterThan(0);

    const dice = motionFor('dice', null);
    expect(dice.spinDeg).toBeGreaterThan(0);
    expect(dice.hop).toBeGreaterThan(0);
  });
});

describe('timeScaleFrom（?speed=<n> → gsap 时轴倍率）', () => {
  it('undefined / 1 → 1（不吞 undefined，归一到 1）', () => {
    expect(timeScaleFrom(undefined)).toBe(1);
    expect(timeScaleFrom(1)).toBe(1);
  });

  it('speed=8 → 8；nofx 倍率 = FX_NOFX_SPEED', () => {
    expect(timeScaleFrom(8)).toBe(8);
    expect(timeScaleFrom(FX_NOFX_SPEED)).toBe(FX_NOFX_SPEED);
  });

  it('非有限或 ≤0 → 1（防御，不抛）', () => {
    expect(timeScaleFrom(0)).toBe(1);
    expect(timeScaleFrom(-2)).toBe(1);
    expect(timeScaleFrom(Number.NaN)).toBe(1);
    expect(timeScaleFrom(Number.POSITIVE_INFINITY)).toBe(1);
    expect(timeScaleFrom(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe('fx.ts 禁写死自检（参数一律经 layout FX 段 + skin fx token 注入）', () => {
  const src = readFileSync(fileURLToPath(new URL('../../src/render/fx.ts', import.meta.url)), 'utf8');

  it('源码不含色值字面量（"#fff" 之类）', () => {
    expect(src).not.toMatch(/(["'`])#[0-9a-fA-F]{3,8}\1/);
  });

  it('源码不含裸 duration: <数字>（时长必须经 secs(FX_*)）', () => {
    expect(src).not.toMatch(/duration:\s*\d/);
  });
});