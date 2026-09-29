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
