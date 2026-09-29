import { describe, expect, it } from 'vitest';
import {
  PREFS_KEY, bgmLoopSeconds, cleanSpec, readPrefs, resolveSound, sfxFor, togglePrefs, writePrefs,
} from '../../src/ui/audio';
import { SFX_KINDS } from '../../src/data/audio';
import { AUDIO_BGM_BARS, AUDIO_VOL_BGM, AUDIO_VOL_SFX } from '../../src/skin/layout';
import type { SoundPack } from '../../src/skin/types';

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string): string | null => m.get(k) ?? null,
    setItem: (k: string, v: string): void => { m.set(k, v); },
    raw: m,
  };
}

describe('audio 纯函数：sfxFor / cleanSpec', () => {
  it('sfxFor 覆盖全部 cue，无 undefined', () => {
    for (const k of SFX_KINDS) expect(sfxFor(k)).toBeTruthy();
  });

  it('cleanSpec：合法 proc / file 原样通过，非法一律 null', () => {
    expect(cleanSpec({ kind: 'proc', voice: 'tick' })).toEqual({ kind: 'proc', voice: 'tick' });
    expect(cleanSpec({ kind: 'proc', voice: 'pad' })).toEqual({ kind: 'proc', voice: 'pad' });
    expect(cleanSpec({ kind: 'file', src: 'a.mp3' })).toEqual({ kind: 'file', src: 'a.mp3' });
    expect(cleanSpec({ kind: 'file', src: 'a.mp3', volume: 0.5 })).toEqual({ kind: 'file', src: 'a.mp3', volume: 0.5 });
    expect(cleanSpec({ kind: 'file', src: 'a.mp3', volume: 3 })).toEqual({ kind: 'file', src: 'a.mp3' });
    for (const bad of [
      null, undefined, 42, 'x', {}, { kind: 'wav' },
      { kind: 'proc' }, { kind: 'proc', voice: 'bogus' },
      { kind: 'file' }, { kind: 'file', src: '' }, { kind: 'file', src: 7 },
    ]) expect(cleanSpec(bad)).toBeNull();
  });
});

describe('audio 纯函数：resolveSound 回退链（spec §4.3）', () => {
  it('null / undefined / 非对象 → 全内建默认，且不抛错', () => {
    for (const bad of [null, undefined, 42 as unknown as SoundPack]) {
      const r = resolveSound(bad);
      expect(Object.keys(r.sfx).sort()).toEqual([...SFX_KINDS].sort());
      for (const k of SFX_KINDS) expect(r.sfx[k]).toEqual({ kind: 'proc', voice: sfxFor(k) });
      expect(r.bgm).toEqual({ kind: 'proc', voice: 'pad' });
      expect(r.volSfx).toBe(AUDIO_VOL_SFX);
      expect(r.volBgm).toBe(AUDIO_VOL_BGM);
    }
  });

  it('file 命中用 file；坏 file.src 回落 proc；未列出的 cue 用内建默认', () => {
    const r = resolveSound({
      sfx: { dice: { kind: 'file', src: 'sfx/dice.mp3', volume: 0.7 }, hop: { kind: 'file', src: '' } },
      bgm: { kind: 'file', src: 'bgm/loop.mp3' },
    });
    expect(r.sfx.dice).toEqual({ kind: 'file', src: 'sfx/dice.mp3', volume: 0.7 });
    expect(r.sfx.hop).toEqual({ kind: 'proc', voice: 'hop' });        // 坏 src → 回落该 cue 的默认音色
    expect(r.sfx.buy).toEqual({ kind: 'proc', voice: 'thud' });       // 未列出 → 内建默认
    expect(r.bgm).toEqual({ kind: 'file', src: 'bgm/loop.mp3' });
  });

  it('volume：缺省 / 非数字 / 越界 → 回落常量；合法值采纳', () => {
    expect(resolveSound({ volume: {} }).volSfx).toBe(AUDIO_VOL_SFX);
    expect(resolveSound({ volume: { sfx: '0.5' as unknown as number } }).volSfx).toBe(AUDIO_VOL_SFX);
    expect(resolveSound({ volume: { sfx: 1.5 } }).volSfx).toBe(AUDIO_VOL_SFX);
    expect(resolveSound({ volume: { sfx: -0.1 } }).volSfx).toBe(AUDIO_VOL_SFX);
    expect(resolveSound({ volume: { sfx: 0, bgm: 1 } }).volSfx).toBe(0);
    expect(resolveSound({ volume: { bgm: 1 } }).volBgm).toBe(1);
  });

  it('bgm 的 proc voice 非法 → 回落 pad', () => {
    expect(resolveSound({ bgm: { kind: 'proc', voice: 'tick' } }).bgm).toEqual({ kind: 'proc', voice: 'tick' });
    expect(resolveSound({ bgm: { kind: 'proc', voice: 'bogus' as never } }).bgm).toEqual({ kind: 'proc', voice: 'pad' });
  });
});

describe('audio 纯函数：prefs 读写与翻转（spec §8.2）', () => {
  it('空存储 → 全开', () => {
    expect(readPrefs(fakeStorage())).toEqual({ sfx: true, bgm: true });
    expect(readPrefs(null)).toEqual({ sfx: true, bgm: true });
  });

  it('坏 JSON / 非对象 → 全开；字段非布尔 → 该项按开', () => {
    expect(readPrefs(fakeStorage({ [PREFS_KEY]: '{oops' }))).toEqual({ sfx: true, bgm: true });
    expect(readPrefs(fakeStorage({ [PREFS_KEY]: '"x"' }))).toEqual({ sfx: true, bgm: true });
    expect(readPrefs(fakeStorage({ [PREFS_KEY]: '{"sfx":"no","bgm":0}' }))).toEqual({ sfx: true, bgm: true });
  });

  it('{ sfx: false } → 只关音效，bgm 仍开', () => {
    const r = readPrefs(fakeStorage({ [PREFS_KEY]: '{"sfx":false}' }));
    expect(r).toEqual({ sfx: false, bgm: true });
  });

  it('writePrefs 落库形状固定为 { sfx, bgm }；存储抛错静默降级', () => {
    const s = fakeStorage();
    writePrefs({ sfx: false, bgm: true }, s);
    expect(s.raw.get(PREFS_KEY)).toBe('{"sfx":false,"bgm":true}');
    expect(() => writePrefs({ sfx: true, bgm: true }, { getItem: () => null, setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });

  it('togglePrefs 只翻目标键', () => {
    expect(togglePrefs({ sfx: true, bgm: true }, 'sfx')).toEqual({ sfx: false, bgm: true });
    expect(togglePrefs({ sfx: true, bgm: true }, 'bgm')).toEqual({ sfx: true, bgm: false });
  });
});

describe('audio 纯函数：BGM 排程口径（spec §6.1）', () => {
  it('整段循环 8s，且和弦进行长度 = AUDIO_BGM_BARS', () => {
    expect(bgmLoopSeconds()).toBe(8);
    expect(AUDIO_BGM_BARS).toBe(4);
  });
});
