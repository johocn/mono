import { describe, expect, it } from 'vitest';
import {
  AUDIO_LABEL, BGM_PROGRESSION, DEFAULT_SFX, SFX_KINDS, VOICES,
  type SfxKind,
} from '../../src/data/audio';
import type { FxKind } from '../../src/render/fx';

/** spec §5.1：cue 集合 = 既有 9 个 FxKind + 1 个 ui（锁住「不许漏、不许改名」） */
const FX_KINDS: FxKind[] = ['dice', 'hop', 'buy', 'upgrade', 'rent', 'card', 'deck', 'stock', 'end'];

describe('data/audio：cue 与音色', () => {
  it('SfxKind 覆盖 9 个 FxKind + ui，无遗漏', () => {
    for (const k of FX_KINDS) expect(SFX_KINDS).toContain(k as SfxKind);
    expect(SFX_KINDS).toContain('ui');
    expect(new Set(SFX_KINDS).size).toBe(SFX_KINDS.length);
    expect(SFX_KINDS.length).toBe(10);
  });

  it('DEFAULT_SFX 与 SFX_KINDS 一一对应（键完全相同，无 undefined）', () => {
    expect(Object.keys(DEFAULT_SFX).sort()).toEqual([...SFX_KINDS].sort());
    for (const k of SFX_KINDS) expect(VOICES[DEFAULT_SFX[k]]).toBeTruthy();
  });

  it('DEFAULT_SFX 用到的音色与 VOICES 的键集合一致（不残留未用音色）', () => {
    expect([...new Set(Object.values(DEFAULT_SFX))].sort()).toEqual(Object.keys(VOICES).sort());
  });

  it('VOICES 参数表逐项合法（spec §5.2 调音表 = 唯一参数来源）', () => {
    for (const [name, v] of Object.entries(VOICES)) {
      expect(v.freq, name).toBeGreaterThan(0);
      expect(v.attackMs, name).toBeGreaterThan(0);
      expect(v.decayMs, name).toBeGreaterThan(0);
      expect(v.gain, name).toBeGreaterThan(0);
      expect(v.gain, name).toBeLessThanOrEqual(1);
    }
    /* 关键听感定位：噪声音色只有 rattle；低频落地 thud 是最低的 */
    expect(VOICES.rattle.noise).toBe(true);
    expect(Object.entries(VOICES).filter(([, v]) => v.noise).map(([k]) => k)).toEqual(['rattle']);
    expect(VOICES.thud.freq).toBeLessThan(VOICES.chime.freq);
  });

  it('AUDIO_LABEL 覆盖 sfx / bgm 的开与关', () => {
    expect(AUDIO_LABEL.sfx.on).toBeTruthy();
    expect(AUDIO_LABEL.sfx.off).toBeTruthy();
    expect(AUDIO_LABEL.bgm.on).toBeTruthy();
    expect(AUDIO_LABEL.bgm.off).toBeTruthy();
  });
});

describe('data/audio：BGM 和弦进行', () => {
  it('Am – F – C – G 四小节，每小节 1 根音 + 3 音三和弦', () => {
    expect(BGM_PROGRESSION.length).toBe(4);
    for (const bar of BGM_PROGRESSION) {
      expect(bar.bass).toBeGreaterThan(0);
      expect(bar.pad.length).toBe(3);
      for (const f of bar.pad) expect(f).toBeGreaterThan(bar.bass);
    }
  });
});
