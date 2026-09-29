import { describe, expect, it } from 'vitest';
import {
  PREFS_KEY, bgmLoopSeconds, cleanSpec, createAudioEngine, readPrefs, resolveSound, sfxFor,
  togglePrefs, writePrefs, type AudioCtxLike,
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

/* ——————————————————— 装配层：假 AudioContext（spec §10.2 断言语义，不断言声波） ——————————————————— */

interface FakeCtx { ctx: AudioCtxLike; starts: number[]; freqs: number[]; sources: number }

/** 记录「哪一刻请求播放了哪个频率」，不产生真实声波 */
function fakeCtx(): FakeCtx {
  const starts: number[] = [];
  const freqs: number[] = [];
  const out: FakeCtx = { ctx: null as unknown as AudioCtxLike, starts, freqs, sources: 0 };
  const node = () => ({ connect: () => {}, disconnect: () => {} });
  const param = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  });
  out.ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: {},
    resume: () => {},
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      const o = { ...node(), type: '', frequency: { value: 0 }, start: (t = 0) => { starts.push(t); freqs.push(o.frequency.value); }, stop: () => {} };
      return o;
    },
    createBufferSource: () => {
      out.sources += 1;
      return { ...node(), buffer: null, start: (t = 0) => { starts.push(t); }, stop: () => {} };
    },
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    decodeAudioData: async () => ({}),
  } as unknown as AudioCtxLike;
  return out;
}

/** 可手动触发的假定时器（BGM 排程器确定性推进） */
function fakeTimers() {
  const state = { cbs: [] as Array<() => void>, cleared: 0 };
  return {
    state,
    setInterval: (fn: () => void): ReturnType<typeof setInterval> => {
      state.cbs.push(fn);
      return 1 as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: (): void => { state.cleared += 1; state.cbs = []; },
    run: (): void => { for (const fn of state.cbs) fn(); },
  };
}

const engineWith = (over: Parameters<typeof createAudioEngine>[0] = {}) => createAudioEngine(over);

describe('audio 引擎：解锁与音效（spec §5.3 / §9）', () => {
  it('未解锁 → play 直接丢弃（0 次发声）；unlock 后 → 正常发声', () => {
    const f = fakeCtx();
    const e = engineWith({ createCtx: () => f.ctx, storage: fakeStorage() });
    e.play('dice');
    expect(f.starts.length).toBe(0);
    e.unlock();
    expect(e.isUnlocked()).toBe(true);
    e.play('dice');
    expect(f.starts.length).toBeGreaterThan(0);
  });

  it('音效关 → 无新发声；开启那一下补一声 ui 确认音（spec §7.4）', () => {
    const f = fakeCtx();
    const e = engineWith({ createCtx: () => f.ctx, storage: fakeStorage() });
    e.unlock();
    e.toggle('sfx');                                  // → 关
    expect(e.prefs().sfx).toBe(false);
    const before = f.starts.length;
    e.play('buy');
    expect(f.starts.length).toBe(before);
    e.toggle('sfx');                                  // → 开（补 ui 确认音）
    expect(e.prefs().sfx).toBe(true);
    expect(f.starts.length).toBeGreaterThan(before);
  });

  it('toggle 落库 mono.audio；重复创建引擎可读回', () => {
    const s = fakeStorage();
    const e = engineWith({ createCtx: () => fakeCtx().ctx, storage: s });
    e.toggle('bgm');
    expect(JSON.parse(s.raw.get(PREFS_KEY) as string)).toEqual({ sfx: true, bgm: false });
    expect(readPrefs(s)).toEqual({ sfx: true, bgm: false });
  });

  it('file 轨解码失败 → 永久回退 proc、missing 记 1 条、不再重试（spec §4.3 / §4.4）', async () => {
    const f = fakeCtx();
    let loads = 0;
    const e = engineWith({
      createCtx: () => f.ctx,
      storage: fakeStorage(),
      loadBuffer: async () => { loads += 1; return null; },
    });
    e.applySound({ sfx: { dice: { kind: 'file', src: 'sfx/dice.mp3' } } });
    e.unlock();
    await Promise.resolve();
    await Promise.resolve();
    expect(loads).toBe(1);
    expect(e.missing()).toEqual(['sfx/dice.mp3']);
    const before = f.starts.length;
    e.play('dice');
    e.play('dice');
    await Promise.resolve();
    expect(f.starts.length).toBeGreaterThan(before);   // 仍用 proc 顶上
    expect(loads).toBe(1);                            // 不重试
  });

  it('file 轨解码成功 → 用 buffer source 播放（不走 proc 振荡器）', async () => {
    const f = fakeCtx();
    const e = engineWith({ createCtx: () => f.ctx, storage: fakeStorage(), loadBuffer: async () => ({ ok: true }) });
    e.applySound({ sfx: { dice: { kind: 'file', src: 'sfx/dice.mp3' } } });
    e.unlock();
    await Promise.resolve();
    await Promise.resolve();
    expect(e.missing()).toEqual([]);
    e.play('dice');
    expect(f.sources).toBe(1);
  });

  it('?audio=0（forceMute）：prefs 初始全关、unlock 不建 ctx、play 无操作', () => {
    let created = 0;
    const f = fakeCtx();
    const e = engineWith({ createCtx: () => { created += 1; return f.ctx; }, storage: fakeStorage(), forceMute: true });
    expect(e.prefs()).toEqual({ sfx: false, bgm: false });
    e.unlock();
    e.play('dice');
    e.startBgm();
    expect(created).toBe(0);
    expect(e.isUnlocked()).toBe(false);
    expect(f.starts.length).toBe(0);
  });
});

describe('audio 引擎：BGM 单段循环（spec §6）', () => {
  it('start → 排到 8s 止共 5 小节（4 小节循环 + 跨窗首小节）；每小节 4 个声部', () => {
    const f = fakeCtx();
    const t = fakeTimers();
    const e = engineWith({
      createCtx: () => f.ctx, storage: fakeStorage(),
      setInterval: t.setInterval, clearInterval: t.clearInterval,
    });
    e.unlock();
    e.startBgm();
    expect(f.starts.length).toBe(4);                  // currentTime = 0 → 只排第 0 小节（1 低音 + 3 铺底）
    f.ctx.currentTime = 7.9;
    t.run();
    expect(f.starts.length).toBe(5 * 4);              // 累计 5 小节 = 20 个声部
  });

  it('stopBgm → 清定时器 + 停声；音乐关时不排程', () => {
    const f = fakeCtx();
    const t = fakeTimers();
    const e = engineWith({
      createCtx: () => f.ctx, storage: fakeStorage(),
      setInterval: t.setInterval, clearInterval: t.clearInterval,
    });
    e.unlock();
    e.startBgm();
    e.stopBgm();
    expect(t.state.cleared).toBeGreaterThan(0);
    const after = f.starts.length;
    f.ctx.currentTime = 20;
    t.run();                                          // 定时器已清 → 无回调
    expect(f.starts.length).toBe(after);

    const e2 = engineWith({ createCtx: () => f.ctx, storage: fakeStorage(), setInterval: t.setInterval, clearInterval: t.clearInterval });
    e2.unlock();
    e2.toggle('bgm');                                 // → 关
    expect(e2.prefs().bgm).toBe(false);
    const before2 = f.starts.length;
    e2.startBgm();
    expect(f.starts.length).toBe(before2);            // 关着不起播
  });

  it('音量走 sound.volume 覆盖：applySound 后 gain 被写成解析值', () => {
    const f = fakeCtx();
    const gains: number[] = [];
    const origGain = f.ctx.createGain;
    f.ctx.createGain = () => {
      const g = origGain.call(f.ctx);
      Object.defineProperty(g.gain, 'value', { set: (v: number) => gains.push(v), get: () => 0 });
      return g;
    };
    const e = engineWith({ createCtx: () => f.ctx, storage: fakeStorage() });
    e.applySound({ volume: { sfx: 0.1, bgm: 0.2 } });
    e.unlock();
    expect(gains).toContain(0.1);
    expect(gains).toContain(0.2);
  });
});
