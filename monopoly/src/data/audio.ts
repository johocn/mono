/**
 * 音效与音乐的数据层（spec §5.2 / §6.1）：cue→音色映射、音色参数表、BGM 和弦进行、开关文案。
 * 纯数据 + 纯常量：零副作用、零 DOM、零时间概念。**调音只改这一张表，不动逻辑。**
 *
 * 为什么 `SfxKind` 定义在这里而不是从 `FxKind` 派生（spec §5.1 写作 `FxKind | 'ui'`）：
 * `src/skin/types.ts` 需要 `SfxKind` / `SfxVoice` / `BgmVoice`，而 `FxKind` 在 `src/render/fx.ts`
 * —— `skin → render` 既反向又成环（`fx.ts` 已 import `../skin/types`）。故自带 11 元联合，
 * 由 `test/data/audio.spec.ts` 锁住「FxKind 各时刻 + ui 全覆盖」。
 */

/** 演出 cue 集合（spec §5.1）：FxKind 各时刻 + 1 个「无 fx 的 UI 动作」 */
export type SfxKind =
  | 'dice' | 'hop' | 'buy' | 'upgrade' | 'rent' | 'card' | 'deck' | 'stock' | 'end' | 'land' | 'wreck' | 'ui';

export const SFX_KINDS: SfxKind[] = [
  'dice', 'hop', 'buy', 'upgrade', 'rent', 'card', 'deck', 'stock', 'end', 'land', 'wreck', 'ui',
];

/** 合成音色原型 id（spec §5.2）；skin.json 里的坏值按「缺省」处理 */
export type SfxVoice =
  | 'rattle' | 'hop' | 'thud' | 'blip' | 'coin' | 'sweep' | 'tone' | 'chime' | 'tick';

/** BGM 声部原型 id（spec §6.1）：根音低音 / 三和弦铺底 */
export type BgmVoice = 'bass' | 'pad';

export interface VoiceSpec {
  /** 振荡器波形；噪声音色（`rattle`）改用白噪声 buffer，此字段被忽略 */
  type: OscillatorType;
  /** 基频 Hz；噪声音色忽略 */
  freq: number;
  /** 起音时长 ms */
  attackMs: number;
  /** 衰减时长 ms */
  decayMs: number;
  /** 相对增益 0–1 */
  gain: number;
  /** 是否噪声源（掷骰抖动） */
  noise?: boolean;
}

export const VOICES: Record<SfxVoice, VoiceSpec> = {
  rattle: { type: 'square',   freq: 180,  attackMs: 6,  decayMs: 200, gain: 0.50, noise: true },
  hop:    { type: 'sine',     freq: 520,  attackMs: 8,  decayMs: 180, gain: 0.60 },
  thud:   { type: 'sine',     freq: 150,  attackMs: 10, decayMs: 320, gain: 0.80 },
  blip:   { type: 'triangle', freq: 660,  attackMs: 6,  decayMs: 220, gain: 0.55 },
  coin:   { type: 'triangle', freq: 880,  attackMs: 5,  decayMs: 300, gain: 0.50 },
  sweep:  { type: 'sawtooth', freq: 420,  attackMs: 10, decayMs: 360, gain: 0.45 },
  tone:   { type: 'sine',     freq: 700,  attackMs: 5,  decayMs: 200, gain: 0.50 },
  chime:  { type: 'triangle', freq: 990,  attackMs: 8,  decayMs: 620, gain: 0.50 },
  tick:   { type: 'square',   freq: 1200, attackMs: 3,  decayMs: 70,  gain: 0.35 },
};

/** cue → 默认音色（spec §5.2 表）；`ui` 只给没有 fx 的动作，避免与 dice / buy 叠音 */
export const DEFAULT_SFX: Record<SfxKind, SfxVoice> = {
  dice: 'rattle', hop: 'hop', buy: 'thud', upgrade: 'blip', rent: 'coin',
  card: 'sweep', deck: 'sweep', stock: 'tone', end: 'chime', land: 'thud', wreck: 'thud', ui: 'tick',
};

/** BGM 一小节：根音低音 + 三和弦铺底（Hz） */
export interface BgmBar { bass: number; pad: [number, number, number] }

/** 和弦进行 Am – F – C – G（spec §6.1）；长度 = `AUDIO_BGM_BARS` */
export const BGM_PROGRESSION: BgmBar[] = [
  { bass: 110.00, pad: [220.00, 261.63, 329.63] },   // Am
  { bass: 87.31,  pad: [174.61, 220.00, 261.63] },   // F
  { bass: 130.81, pad: [261.63, 329.63, 392.00] },   // C
  { bass: 98.00,  pad: [196.00, 246.94, 293.66] },   // G
];

/** 开关的可读文案（供 aria-label / 调试面板；HUD 像素由 proc preset 画） */
export const AUDIO_LABEL: Record<'sfx' | 'bgm', { on: string; off: string }> = {
  sfx: { on: '音效开', off: '音效关' },
  bgm: { on: '音乐开', off: '音乐关' },
};
