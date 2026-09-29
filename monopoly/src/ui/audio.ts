/**
 * 双轨制音频引擎（spec §3 / §4 / §6 / §9）：`src/ui/**` —— 唯一允许出现「时间与副作用」的分层。
 *
 * 与 `src/ui/share.ts` 同规：**纯函数**（`sfxFor` / `cleanSpec` / `resolveSound` / prefs 读写 /
 * `bgmLoopSeconds`）与 **装配层**（`createAudioEngine`，依赖全部注入）分开，便于在
 * `environment: 'node'`（无 jsdom）下直接单测。
 *
 * 数据流（spec §3）：`runAction(fn, ctxOf, withFx)` 里 `fx.play(ctx, cb)` 的**对偶位置**
 * 调 `play(ctx.kind)` —— 真人与 AI 天然共用；`withFx === false`（skipRest / `?nofx`）时
 * `ctx` 为 null、`runAction` 提前返回，故连带静音。
 */
import { BGM_PROGRESSION, DEFAULT_SFX, SFX_KINDS, VOICES, type BgmVoice, type SfxKind, type SfxVoice } from '../data/audio';
import {
  AUDIO_BGM_BARS, AUDIO_BGM_BASS_ATTACK_MS, AUDIO_BGM_BASS_MS, AUDIO_BGM_BEAT_MS,
  AUDIO_BGM_BEATS_PER_BAR, AUDIO_BGM_LOOKAHEAD_MS, AUDIO_BGM_PAD_ATTACK_MS,
  AUDIO_BGM_PAD_GAIN, AUDIO_BGM_SCHEDULE_AHEAD_S, AUDIO_VOL_BGM, AUDIO_VOL_SFX,
} from '../skin/layout';
import type { FileSoundSpec, SoundPack, SoundSpec } from '../skin/types';

/* ————————————————————————— 纯函数（可单测，spec §10.1） ————————————————————————— */

export type AudioPrefKey = 'sfx' | 'bgm';
export interface AudioPrefs { sfx: boolean; bgm: boolean }

/** localStorage 键（与 `mono.setup` / `mono.tour.done` 同规） */
export const PREFS_KEY = 'mono.audio';

/** cue → 内建默认音色（spec §5.2）；未知 cue 兜底 `tick` */
export function sfxFor(kind: SfxKind): SfxVoice {
  return DEFAULT_SFX[kind] ?? 'tick';
}

const isVol = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

const VOICE_IDS: string[] = [...Object.keys(VOICES), 'bass', 'pad'];
const isVoiceId = (v: unknown): v is SfxVoice | BgmVoice =>
  typeof v === 'string' && VOICE_IDS.includes(v);

/** 净化单个 `SoundSpec`；非法 → `null`（调用方回落内建默认）。**绝不抛错。** */
export function cleanSpec(raw: unknown): SoundSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as { kind?: unknown; voice?: unknown; src?: unknown; volume?: unknown };
  if (s.kind === 'proc') return isVoiceId(s.voice) ? { kind: 'proc', voice: s.voice } : null;
  if (s.kind === 'file') {
    if (typeof s.src !== 'string' || s.src.length === 0) return null;
    const out: FileSoundSpec = { kind: 'file', src: s.src };
    if (isVol(s.volume)) out.volume = s.volume;
    return out;
  }
  return null;
}

/** 解析结果：一张完整、可直接消费的表（spec §4.3；**永不返回 null**） */
export interface ResolvedSound {
  sfx: Record<SfxKind, SoundSpec>;
  bgm: SoundSpec;
  volSfx: number;
  volBgm: number;
}

/**
 * 回退链（spec §4.3）：`file` 命中 → 该 cue 的 `proc` → 内建默认；音量 → `sound.volume` → 常量。
 * 坏数据静默降级、逐项回落，与 `resolveMotion(tokens?)` 完全同规。
 */
export function resolveSound(pack?: SoundPack | null): ResolvedSound {
  const p: SoundPack = pack && typeof pack === 'object' ? pack : {};
  const sfx = {} as Record<SfxKind, SoundSpec>;
  for (const kind of SFX_KINDS) {
    sfx[kind] = cleanSpec(p.sfx?.[kind]) ?? { kind: 'proc', voice: sfxFor(kind) };
  }
  return {
    sfx,
    bgm: cleanSpec(p.bgm) ?? { kind: 'proc', voice: 'pad' },
    volSfx: isVol(p.volume?.sfx) ? (p.volume.sfx as number) : AUDIO_VOL_SFX,
    volBgm: isVol(p.volume?.bgm) ? (p.volume.bgm as number) : AUDIO_VOL_BGM,
  };
}

/** BGM 整段循环时长（秒）：4 小节 × 4 拍 × 500ms = 8s（spec §6.1） */
export function bgmLoopSeconds(): number {
  return (AUDIO_BGM_BARS * AUDIO_BGM_BEATS_PER_BAR * AUDIO_BGM_BEAT_MS) / 1000;
}

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** 读开关：空 / 坏 JSON / 字段非布尔 → 该项按「开」（spec §8.2） */
export function readPrefs(storage?: StorageLike | null): AudioPrefs {
  const out: AudioPrefs = { sfx: true, bgm: true };
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return out;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return out;
    const o = parsed as { sfx?: unknown; bgm?: unknown };
    if (typeof o.sfx === 'boolean') out.sfx = o.sfx;
    if (typeof o.bgm === 'boolean') out.bgm = o.bgm;
  } catch { /* 隐私模式 / 坏 JSON：静默回落全开 */ }
  return out;
}

export function writePrefs(p: AudioPrefs, storage?: StorageLike | null): void {
  try { storage?.setItem(PREFS_KEY, JSON.stringify({ sfx: p.sfx, bgm: p.bgm })); } catch { /* 静默降级 */ }
}

/** 只翻目标键（返回新对象） */
export function togglePrefs(p: AudioPrefs, key: AudioPrefKey): AudioPrefs {
  return key === 'sfx' ? { ...p, sfx: !p.sfx } : { ...p, bgm: !p.bgm };
}

/* ————————————————————— 装配层：依赖注入（spec §9 / §10.2） ————————————————————— */

export interface ParamLike {
  value: number;
  setValueAtTime?(v: number, t: number): void;
  linearRampToValueAtTime?(v: number, t: number): void;
  exponentialRampToValueAtTime?(v: number, t: number): void;
}
export interface NodeLike { connect(n: unknown): void; disconnect?(): void }
export interface GainLike extends NodeLike { gain: ParamLike }
export interface OscLike extends NodeLike { type: string; frequency: ParamLike; start(t?: number): void; stop(t?: number): void }
export interface SrcLike extends NodeLike { buffer: unknown; start(t?: number): void; stop(t?: number): void }

/** Web Audio 的最小子集（只声明本项目用到的部分，便于注入假件） */
export interface AudioCtxLike {
  currentTime: number;
  sampleRate: number;
  state: string;
  destination: unknown;
  resume(): Promise<void> | void;
  close?(): Promise<void> | void;
  createGain(): GainLike;
  createOscillator(): OscLike;
  createBufferSource(): SrcLike;
  createBuffer(channels: number, length: number, rate: number): { getChannelData(i: number): Float32Array };
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
}

export interface AudioDeps {
  storage?: StorageLike | null;
  /** `?audio=0`：开关初始全关、且永不创建 `AudioContext`（spec §8.2） */
  forceMute?: boolean;
  /** 首次手势解锁时创建（默认 `new AudioContext()`；测试注入假件） */
  createCtx?: () => AudioCtxLike | null;
  /** file 轨装载（默认 `fetch` + `decodeAudioData`；测试注入） */
  loadBuffer?: (src: string, ctx: AudioCtxLike) => Promise<unknown | null>;
  setInterval?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval?: (t: ReturnType<typeof setInterval>) => void;
}

export interface AudioEngine {
  /** 音源装配（spec §4.3）：boot 时调一次；换肤后重调 */
  applySound(pack?: SoundPack | null): void;
  /** 首次手势解锁（spec §9）：创建 / 复用 ctx → resume → 装 file 轨 → 按开关起 BGM */
  unlock(): void;
  /** 与 `fx.play` 同刻（spec §5.3）；未解锁 / 音效关 → 直接丢弃 */
  play(kind: SfxKind): void;
  /** 翻转某一开关并落库（spec §7.4）；开启音效时补一声 `ui` 确认音 */
  toggle(key: AudioPrefKey): AudioPrefs;
  prefs(): AudioPrefs;
  isUnlocked(): boolean;
  /** BGM 起播（spec §6.2：`startGame()` 之后调） */
  startBgm(): void;
  /** BGM 停播（spec §6.2：`state.over === true` 时调） */
  stopBgm(): void;
  /** 装载失败清单（与 `missingAssets` 同规：只记录，不抛错） */
  missing(): string[];
  destroy(): void;
}

/** 默认建 ctx：不在 boot 创建，只在首次手势里创建（spec §9） */
function defaultCreateCtx(): AudioCtxLike | null {
  const Ctor = (globalThis as { AudioContext?: new () => AudioCtxLike }).AudioContext;
  if (!Ctor) return null;
  try { return new Ctor(); } catch { return null; }
}

/** 默认 file 轨装载：`fetch` → `decodeAudioData`；任何失败 → null（由调用方回退 proc） */
async function defaultLoadBuffer(src: string, ctx: AudioCtxLike): Promise<unknown | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch { return null; }
}

export function createAudioEngine(deps: AudioDeps = {}): AudioEngine {
  const storage = deps.storage ?? null;
  const createCtx = deps.createCtx ?? defaultCreateCtx;
  const loadBuffer = deps.loadBuffer ?? defaultLoadBuffer;
  const setTimer = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = deps.clearInterval ?? ((t) => clearInterval(t));

  let prefs: AudioPrefs = deps.forceMute ? { sfx: false, bgm: false } : readPrefs(storage);
  let table = resolveSound(null);
  let ctx: AudioCtxLike | null = null;
  let sfxGain: GainLike | null = null;
  let bgmGain: GainLike | null = null;
  const buffers = new Map<string, unknown>();
  const dead = new Set<string>();          // 解码失败 → 该 src 永久回退（spec §4.3）
  const miss: string[] = [];
  const live: Array<{ node: { stop(t?: number): void }; endsAt: number }> = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let nextNoteAt = 0;
  let barIndex = 0;
  let bgmWanted = false;

  const armed = (): boolean => deps.forceMute !== true;

  const ensureNodes = (): void => {
    if (!ctx || sfxGain) return;
    sfxGain = ctx.createGain();
    sfxGain.gain.value = table.volSfx;
    sfxGain.connect(ctx.destination);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = table.volBgm;
    bgmGain.connect(ctx.destination);
  };

  /** 单个声部：噪声 buffer 或振荡器 + 三段包络；`dst` 决定过 sfxGain 还是 bgmGain */
  const tone = (o: {
    type: string; freq: number; at: number; attackMs: number; decayMs: number;
    gain: number; noise?: boolean; dst: GainLike;
  }): void => {
    if (!ctx) return;
    const env = ctx.createGain();
    const total = o.attackMs + o.decayMs;
    env.gain.setValueAtTime?.(0, o.at);
    env.gain.linearRampToValueAtTime?.(o.gain, o.at + o.attackMs / 1000);
    env.gain.exponentialRampToValueAtTime?.(0.0001, o.at + total / 1000);
    env.connect(o.dst);
    if (o.noise) {
      const len = Math.max(1, Math.floor(ctx.sampleRate * (o.decayMs / 1000)));
      const ch = ctx.createBuffer(1, len, ctx.sampleRate).getChannelData(0);
      for (let i = 0; i < ch.length; i += 1) ch[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = { noise: true };
      src.connect(env);
      src.start(o.at);
      src.stop(o.at + total / 1000);
      live.push({ node: src, endsAt: o.at + total / 1000 });
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.value = o.freq;
    osc.connect(env);
    osc.start(o.at);
    osc.stop(o.at + total / 1000);
    live.push({ node: osc, endsAt: o.at + total / 1000 });
  };

  /** 一个 cue 的 proc 音色（spec §5.2 表 → 参数） */
  const playProc = (voice: SfxVoice, at: number): void => {
    if (!sfxGain) return;
    const v = VOICES[voice];
    tone({
      type: v.type, freq: v.freq, at, attackMs: v.attackMs, decayMs: v.decayMs,
      gain: v.gain, noise: v.noise, dst: sfxGain,
    });
  };

  const loadTrack = async (src: string): Promise<void> => {
    if (!ctx || buffers.has(src) || dead.has(src)) return;
    const buf = await loadBuffer(src, ctx);
    if (buf) buffers.set(src, buf);
    else { dead.add(src); miss.push(src); }   // 永久回退 + 记 missing（只记录，不抛错）
  };

  const startBgm = (): void => {
    bgmWanted = true;
    if (!armed() || !ctx || !prefs.bgm || timer !== null) return;
    ensureNodes();
    nextNoteAt = ctx.currentTime;
    barIndex = 0;
    scheduleBars();
    timer = setTimer(scheduleBars, AUDIO_BGM_LOOKAHEAD_MS);
  };

  const stopBgm = (): void => {
    bgmWanted = false;
    if (timer !== null) { clearTimer(timer); timer = null; }
    for (const l of live.splice(0)) { try { l.node.stop(); } catch { /* 已停 */ } }
  };

  /** lookahead 排程（spec §6.1）：把未来 `AUDIO_BGM_SCHEDULE_AHEAD_S` 内的小节排上时间轴 */
  const scheduleBars = (): void => {
    if (!ctx || !bgmGain) return;
    const now = ctx.currentTime;
    for (let i = live.length - 1; i >= 0; i -= 1) if (live[i].endsAt <= now) live.splice(i, 1);
    const barSec = (AUDIO_BGM_BEATS_PER_BAR * AUDIO_BGM_BEAT_MS) / 1000;
    const end = now + AUDIO_BGM_SCHEDULE_AHEAD_S;
    while (nextNoteAt < end) {
      const bar = BGM_PROGRESSION[barIndex % BGM_PROGRESSION.length];
      tone({
        type: 'sine', freq: bar.bass, at: nextNoteAt,
        attackMs: AUDIO_BGM_BASS_ATTACK_MS, decayMs: AUDIO_BGM_BASS_MS, gain: 1, dst: bgmGain,
      });
      for (const f of bar.pad) {
        tone({
          type: 'triangle', freq: f, at: nextNoteAt, attackMs: AUDIO_BGM_PAD_ATTACK_MS,
          decayMs: AUDIO_BGM_BEATS_PER_BAR * AUDIO_BGM_BEAT_MS - AUDIO_BGM_PAD_ATTACK_MS,
          gain: AUDIO_BGM_PAD_GAIN, dst: bgmGain,
        });
      }
      nextNoteAt += barSec;
      barIndex += 1;
    }
  };

  return {
    applySound(pack?: SoundPack | null): void {
      table = resolveSound(pack);
      if (sfxGain) sfxGain.gain.value = table.volSfx;
      if (bgmGain) bgmGain.gain.value = table.volBgm;
    },

    unlock(): void {
      if (!armed()) return;
      if (!ctx) {
        ctx = createCtx();
        if (!ctx) return;
        try { void ctx.resume(); } catch { /* 静默：解锁失败不抛错 */ }
        ensureNodes();
        /* file 轨只在解锁后异步装载（spec §4.4）——默认皮肤表里全是 proc，零网络请求 */
        for (const kind of SFX_KINDS) {
          const s = table.sfx[kind];
          if (s.kind === 'file') void loadTrack(s.src);
        }
        if (table.bgm.kind === 'file') void loadTrack(table.bgm.src);
      }
      if (prefs.bgm && bgmWanted) startBgm();
    },

    play(kind: SfxKind): void {
      if (!prefs.sfx || !ctx || !sfxGain) return;      // 未解锁 / 音效关 → 直接丢弃（spec §9）
      const spec = table.sfx[kind] ?? { kind: 'proc', voice: sfxFor(kind) };
      const at = ctx.currentTime;
      if (spec.kind === 'file') {
        const buf = buffers.get(spec.src);
        if (buf) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = ctx.createGain();
          g.gain.value = spec.volume ?? 1;
          src.connect(g);
          g.connect(sfxGain);
          src.start(at);
          live.push({ node: src, endsAt: at + 1 });
          return;
        }
        if (!dead.has(spec.src)) void loadTrack(spec.src);   // 未就绪 → 触发异步装载，本次先用 proc 顶上
      }
      playProc(sfxFor(kind), at);
    },

    toggle(key: AudioPrefKey): AudioPrefs {
      prefs = togglePrefs(prefs, key);
      if (!deps.forceMute) writePrefs(prefs, storage);
      if (key === 'bgm') { if (prefs.bgm) startBgm(); else stopBgm(); }
      else if (prefs.sfx) { try { this.play('ui'); } catch { /* 静默 */ } }   // 取消静音给一声确认音
      return prefs;
    },

    prefs(): AudioPrefs { return { ...prefs }; },
    isUnlocked(): boolean { return ctx !== null; },
    startBgm,
    stopBgm,
    missing(): string[] { return miss.slice(); },

    destroy(): void {
      stopBgm();
      try { void ctx?.close?.(); } catch { /* 静默 */ }
      ctx = null;
      sfxGain = null;
      bgmGain = null;
    },
  };
}
