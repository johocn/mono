/**
 * SoundLibrary — 听音辨位 7 大类 × 8 种 = 56 种声音体系（数据驱动）
 *
 * 设计目标：
 *   1. 7 大类：自然界 / 动物 / 生活 / 鸟鸣 / 乐器 / 交通 / 人声语音，每类 8 种候选音。
 *   2. 每种声音用一份「合成配方」描述，AudioSynth 解释执行 → 无需二进制素材即可运行。
 *   3. 若放置真实采样 assets/audio/<id>.mp3(.ogg/.wav)，AudioSynth 会优先播放真声（更真实），
 *      缺失时自动回退程序合成 → 「真实素材」为零成本升级路径。
 *   4. 关卡按 audioPool 阶梯式抽取 N 种（4→8）作为本题素材，且每关从该类随机子集，兼顾难度与变化。
 *
 * 难度阶梯：每类 8 种候选，关卡 audioPool 从 4 递增到 8（2-1 教程固定 3）。
 */

/** 7 大类声音类别 */
export type SoundCategory =
  | "nature"      // 自然界
  | "animal"      // 动物
  | "life"        // 生活
  | "bird"        // 鸟鸣
  | "instrument"  // 乐器
  | "vehicle"     // 交通
  | "voice";      // 人声/语音

/** 类别中文名（用于 UI 分组/教学说明） */
export const CATEGORY_LABEL: Record<SoundCategory, string> = {
  nature: "自然界",
  animal: "动物",
  life: "生活",
  bird: "鸟鸣",
  instrument: "乐器",
  vehicle: "交通",
  voice: "人声语音",
};

/**
 * 合成配方：声明式描述如何程序合成一种声音。
 * AudioSynth 内按 kind 解释执行；如需真实素材，仅放置对应采样文件即可覆盖。
 */
export type SoundRecipe =
  // 噪声类：白噪声经滤波 + 可选幅度起伏/扫频/缓起缓落（自然声、蒸汽、风、拉链等）
  | { kind: "noise"; filter: "lowpass" | "highpass" | "bandpass"; freq: number; q?: number; sweepTo?: number; swell?: boolean; ripple?: number }
  // 音调类：基频 + 谐波 + 敲击次数 + 衰减（钟/铃/笛/乐器/汽笛）
  | { kind: "tone"; freq: number; type?: OscillatorType; harmonics?: number[]; strikes?: number; decay?: number }
  // 啁啾类：多个短促滑音音符，带颤音（鸟鸣）
  | { kind: "chirp"; base: number; spread: number; count: number; lfo?: number; type?: OscillatorType; up?: boolean }
  // 动物类：基频 + 共振峰（formant）模拟元音/叫声，多脉冲
  | { kind: "animal"; base: number; formant: number; type?: OscillatorType; pulses?: number; gap?: number }
  // 节奏类：重复短促事件（鼓/钟表/敲门/车铃/马蹄/快门/咳嗽/拍手）
  | { kind: "rhythm"; mode: "noise" | "tone"; freq?: number; filter?: number; q?: number; count: number; len: number; gap?: number; type?: OscillatorType }
  // 人声/语音类：笑/掌声/婴儿啼/口哨/叹气
  | { kind: "voice"; variant: "laugh" | "applause" | "baby" | "whistle" | "sigh" };

export interface SoundDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  category: SoundCategory;
  recipe: SoundRecipe;
}

export const SOUND_LIBRARY: SoundDef[] = [
  // === 1. 自然界（8）===
  { id: "rain",      label: "雨声",   icon: "🌧️", color: "#4A90D9", category: "nature",
    recipe: { kind: "noise", filter: "lowpass", freq: 1700, q: 0.7, ripple: 0.6 } },
  { id: "wind",      label: "风声",   icon: "🍃", color: "#7FB069", category: "nature",
    recipe: { kind: "noise", filter: "bandpass", freq: 500, q: 0.6, sweepTo: 900, swell: true } },
  { id: "thunder",   label: "雷声",   icon: "⛈️", color: "#5B6C8F", category: "nature",
    recipe: { kind: "noise", filter: "lowpass", freq: 160, sweepTo: 90, swell: true } },
  { id: "waves",     label: "海浪",   icon: "🌊", color: "#2E86AB", category: "nature",
    recipe: { kind: "noise", filter: "lowpass", freq: 650, q: 0.5, swell: true, ripple: 0.9 } },
  { id: "fire",      label: "篝火",   icon: "🔥", color: "#E8743B", category: "nature",
    recipe: { kind: "noise", filter: "bandpass", freq: 1200, q: 0.5, ripple: 0.8 } },
  { id: "stream",    label: "溪流",   icon: "💧", color: "#00B8D4", category: "nature",
    recipe: { kind: "noise", filter: "highpass", freq: 2600, ripple: 0.4 } },
  { id: "leaves",    label: "落叶",   icon: "🍂", color: "#B7CA3D", category: "nature",
    recipe: { kind: "noise", filter: "bandpass", freq: 1600, q: 0.6, ripple: 1.4 } },
  { id: "waterfall", label: "瀑布",   icon: "🌁", color: "#4FC3F7", category: "nature",
    recipe: { kind: "noise", filter: "lowpass", freq: 900, q: 0.4, ripple: 0.3 } },

  // === 2. 动物（8）===
  { id: "dog",     label: "狗吠",   icon: "🐕", color: "#C99749", category: "animal",
    recipe: { kind: "animal", base: 320, formant: 1500, type: "square", pulses: 3, gap: 0.18 } },
  { id: "cat",     label: "猫叫",   icon: "🐈", color: "#9B8579", category: "animal",
    recipe: { kind: "animal", base: 620, formant: 1200, type: "sawtooth", pulses: 2, gap: 0.25 } },
  { id: "cow",     label: "牛哞",   icon: "🐄", color: "#8C9A9E", category: "animal",
    recipe: { kind: "animal", base: 130, formant: 600, type: "sine", pulses: 2, gap: 0.3 } },
  { id: "frog",    label: "蛙鸣",   icon: "🐸", color: "#6AB04C", category: "animal",
    recipe: { kind: "animal", base: 220, formant: 900, type: "square", pulses: 4, gap: 0.12 } },
  { id: "horse",   label: "马蹄",   icon: "🐎", color: "#A0682D", category: "animal",
    recipe: { kind: "rhythm", mode: "noise", filter: 800, q: 3, count: 4, len: 0.08, gap: 0.2 } },
  { id: "sheep",   label: "羊咩",   icon: "🐑", color: "#D6C7A1", category: "animal",
    recipe: { kind: "animal", base: 320, formant: 1500, type: "sine", pulses: 2, gap: 0.18 } },
  { id: "pig",     label: "猪嚎",   icon: "🐖", color: "#E6A8B0", category: "animal",
    recipe: { kind: "animal", base: 200, formant: 800, type: "square", pulses: 2, gap: 0.15 } },
  { id: "rooster", label: "公鸡",   icon: "🐓", color: "#E8B23B", category: "animal",
    recipe: { kind: "animal", base: 520, formant: 1200, type: "square", pulses: 3, gap: 0.14 } },

  // === 3. 生活（8）===
  { id: "doorbell", label: "门铃",   icon: "🔔", color: "#F6B93B", category: "life",
    recipe: { kind: "tone", freq: 880, type: "sine", strikes: 2, decay: 0.4 } },
  { id: "phone",    label: "电话",   icon: "📱", color: "#20BF6B", category: "life",
    recipe: { kind: "rhythm", mode: "tone", freq: 1000, count: 4, len: 0.15, gap: 0.15, type: "sine" } },
  { id: "kettle",   label: "水壶",   icon: "🫖", color: "#0FB9B1", category: "life",
    recipe: { kind: "noise", filter: "highpass", freq: 3200, ripple: 0.7 } },
  { id: "clock",    label: "钟表",   icon: "🕰️", color: "#3867D6", category: "life",
    recipe: { kind: "rhythm", mode: "tone", freq: 2000, count: 6, len: 0.03, gap: 0.45, type: "square" } },
  { id: "knock",    label: "敲门",   icon: "🚪", color: "#BDC581", category: "life",
    recipe: { kind: "rhythm", mode: "noise", filter: 300, q: 4, count: 3, len: 0.05, gap: 0.12 } },
  { id: "camera",   label: "快门",   icon: "📷", color: "#576574", category: "life",
    recipe: { kind: "rhythm", mode: "noise", filter: 2000, q: 3, count: 2, len: 0.03, gap: 0.07 } },
  { id: "scissors", label: "剪刀",   icon: "✂️", color: "#8390A1", category: "life",
    recipe: { kind: "rhythm", mode: "noise", filter: 3000, q: 2, count: 2, len: 0.04, gap: 0.1 } },
  { id: "zipper",   label: "拉链",   icon: "🤐", color: "#95A5A6", category: "life",
    recipe: { kind: "noise", filter: "bandpass", freq: 2500, q: 0.8, ripple: 1.6 } },

  // === 4. 鸟鸣（8）===
  { id: "sparrow",    label: "麻雀",   icon: "🐦", color: "#FFB347", category: "bird",
    recipe: { kind: "chirp", base: 2500, spread: 800, count: 4, lfo: 25, up: true } },
  { id: "cuckoo",     label: "布谷",   icon: "🕊️", color: "#A29BFE", category: "bird",
    recipe: { kind: "chirp", base: 820, spread: -160, count: 2, type: "sine" } },
  { id: "owl",        label: "猫头鹰", icon: "🦉", color: "#6C5CE7", category: "bird",
    recipe: { kind: "tone", freq: 440, type: "sine", strikes: 2, decay: 0.35 } },
  { id: "robin",      label: "知更鸟", icon: "🐤", color: "#FD79A8", category: "bird",
    recipe: { kind: "chirp", base: 3000, spread: 600, count: 5, lfo: 30 } },
  { id: "magpie",     label: "喜鹊",   icon: "🐧", color: "#34495E", category: "bird",
    recipe: { kind: "chirp", base: 2200, spread: 500, count: 3, lfo: 20, up: true } },
  { id: "woodpecker", label: "啄木鸟", icon: "🪶", color: "#C05621", category: "bird",
    recipe: { kind: "rhythm", mode: "noise", filter: 1200, q: 4, count: 5, len: 0.05, gap: 0.13 } },
  { id: "seagull",    label: "海鸥",   icon: "🕊️", color: "#87CEEB", category: "bird",
    recipe: { kind: "chirp", base: 1800, spread: 400, count: 3, lfo: 18, up: false } },
  { id: "nightingale",label: "夜莺",   icon: "🎶", color: "#E84393", category: "bird",
    recipe: { kind: "chirp", base: 2600, spread: 900, count: 6, lfo: 28, up: true } },

  // === 5. 乐器（8）===
  { id: "bell",     label: "铜铃", icon: "🛎️", color: "#FDCB6E", category: "instrument",
    recipe: { kind: "tone", freq: 880, type: "sine", harmonics: [1, 2.0, 2.7, 3.8], strikes: 1, decay: 0.8 } },
  { id: "drum",     label: "鼓声", icon: "🥁", color: "#EE5253", category: "instrument",
    recipe: { kind: "rhythm", mode: "noise", filter: 200, q: 1, count: 3, len: 0.12, gap: 0.2 } },
  { id: "flute",    label: "笛声", icon: "🎶", color: "#10AC84", category: "instrument",
    recipe: { kind: "tone", freq: 587, type: "sine", harmonics: [1, 2, 3], strikes: 1, decay: 0.5 } },
  { id: "guzheng",  label: "古筝", icon: "🎵", color: "#576574", category: "instrument",
    recipe: { kind: "tone", freq: 523, type: "triangle", harmonics: [1, 2, 3, 4], strikes: 2, decay: 0.6 } },
  { id: "piano",    label: "钢琴", icon: "🎹", color: "#2D3436", category: "instrument",
    recipe: { kind: "tone", freq: 523, type: "sine", harmonics: [1, 2, 3, 4, 5], strikes: 1, decay: 0.7 } },
  { id: "violin",   label: "小提琴", icon: "🎻", color: "#B71540", category: "instrument",
    recipe: { kind: "tone", freq: 587, type: "sawtooth", harmonics: [1, 2, 3], strikes: 1, decay: 0.6 } },
  { id: "trumpet",  label: "小号", icon: "🎺", color: "#E58E26", category: "instrument",
    recipe: { kind: "tone", freq: 466, type: "square", harmonics: [1, 1.5], strikes: 1, decay: 0.5 } },
  { id: "harmonica",label: "口琴", icon: "🎼", color: "#0A3D62", category: "instrument",
    recipe: { kind: "tone", freq: 440, type: "triangle", harmonics: [1, 2], strikes: 2, decay: 0.4 } },

  // === 6. 交通（8）===
  { id: "carhorn",   label: "车喇叭", icon: "🚗", color: "#EE5253", category: "vehicle",
    recipe: { kind: "tone", freq: 420, type: "square", strikes: 1, decay: 0.45 } },
  { id: "train",     label: "火车",   icon: "🚂", color: "#341F97", category: "vehicle",
    recipe: { kind: "noise", filter: "bandpass", freq: 320, q: 0.5, sweepTo: 200, swell: true, ripple: 0.7 } },
  { id: "bicycle",   label: "自行车铃", icon: "🚲", color: "#009432", category: "vehicle",
    recipe: { kind: "rhythm", mode: "tone", freq: 1400, count: 3, len: 0.08, gap: 0.08, type: "sine" } },
  { id: "boat",      label: "汽笛",   icon: "🚢", color: "#0984E3", category: "vehicle",
    recipe: { kind: "tone", freq: 200, type: "sine", harmonics: [1, 1.5], strikes: 1, decay: 0.8 } },
  { id: "airplane",  label: "飞机",   icon: "✈️", color: "#574B90", category: "vehicle",
    recipe: { kind: "noise", filter: "lowpass", freq: 600, q: 0.4, sweepTo: 300, swell: true, ripple: 0.5 } },
  { id: "motorcycle",label: "摩托",   icon: "🏍️", color: "#E15F41", category: "vehicle",
    recipe: { kind: "noise", filter: "bandpass", freq: 400, q: 0.5, ripple: 1.5 } },
  { id: "ambulance", label: "救护车", icon: "🚑", color: "#FF3838", category: "vehicle",
    recipe: { kind: "rhythm", mode: "tone", freq: 660, count: 6, len: 0.18, gap: 0.18, type: "sine" } },
  { id: "subway",    label: "地铁",   icon: "🚇", color: "#3C6382", category: "vehicle",
    recipe: { kind: "noise", filter: "lowpass", freq: 500, q: 0.5, swell: true, ripple: 0.6 } },

  // === 7. 人声/语音（8）===
  { id: "laugh",    label: "笑声",   icon: "😄", color: "#FF9F43", category: "voice",
    recipe: { kind: "voice", variant: "laugh" } },
  { id: "applause", label: "掌声",   icon: "👏", color: "#54A0FF", category: "voice",
    recipe: { kind: "voice", variant: "applause" } },
  { id: "baby",     label: "婴儿啼", icon: "👶", color: "#FF6B81", category: "voice",
    recipe: { kind: "voice", variant: "baby" } },
  { id: "whistle",  label: "口哨",   icon: "👄", color: "#00D2D3", category: "voice",
    recipe: { kind: "voice", variant: "whistle" } },
  { id: "cough",    label: "咳嗽",   icon: "🤧", color: "#C8D6E5", category: "voice",
    recipe: { kind: "rhythm", mode: "noise", filter: 500, q: 3, count: 2, len: 0.06, gap: 0.12 } },
  { id: "cheer",    label: "欢呼",   icon: "🙌", color: "#FDA7DF", category: "voice",
    recipe: { kind: "voice", variant: "applause" } },
  { id: "clap",     label: "拍手",   icon: "👏", color: "#9980FA", category: "voice",
    recipe: { kind: "rhythm", mode: "noise", filter: 1500, q: 3, count: 4, len: 0.04, gap: 0.14 } },
  { id: "sigh",     label: "叹气",   icon: "😮‍💨", color: "#D980FA", category: "voice",
    recipe: { kind: "voice", variant: "sigh" } },

  // === 长春·双阳特色音（本地物产 / 景观拟声）===
  { id: "deer",       label: "鹿鸣",     icon: "🦌", color: "#C89B3C", category: "animal",
    recipe: { kind: "animal", base: 300, formant: 1100, type: "sine", pulses: 3, gap: 0.2 } },
  { id: "sika",       label: "梅花鹿",   icon: "🦌", color: "#B5651D", category: "animal",
    recipe: { kind: "animal", base: 260, formant: 950, type: "triangle", pulses: 2, gap: 0.24 } },
  { id: "lakelap",    label: "双阳湖波", icon: "🌊", color: "#2E86AB", category: "nature",
    recipe: { kind: "noise", filter: "lowpass", freq: 520, q: 0.5, swell: true, ripple: 0.8 } },
  { id: "hotspring",  label: "御龙温泉", icon: "♨️", color: "#E15F41", category: "nature",
    recipe: { kind: "noise", filter: "bandpass", freq: 1400, q: 0.6, ripple: 0.7 } },
  { id: "forestwind", label: "吊水壶林涛", icon: "🌲", color: "#3E8E5A", category: "nature",
    recipe: { kind: "noise", filter: "bandpass", freq: 420, q: 0.6, sweepTo: 820, swell: true } },
  { id: "oriole",     label: "黄鹂鸣",   icon: "🐦", color: "#FFB347", category: "bird",
    recipe: { kind: "chirp", base: 2800, spread: 700, count: 5, lfo: 26, up: true } },
];

const SOUND_BY_ID: Record<string, SoundDef> = Object.fromEntries(
  SOUND_LIBRARY.map((s) => [s.id, s]),
);

/** 按 ID 取声音定义；未知 ID 返回兜底（避免崩溃） */
export function getSound(id: string): SoundDef {
  return SOUND_BY_ID[id] ?? { id, label: id, icon: "?", color: "#888", category: "life",
    recipe: { kind: "tone", freq: 440, type: "sine", strikes: 1, decay: 0.3 } };
}

/** 取某类别下的全部声音 ID（每类 8 种） */
export function soundsByCategory(cat: SoundCategory): string[] {
  return SOUND_LIBRARY.filter((s) => s.category === cat).map((s) => s.id);
}

/** 全部声音 ID（用于自适应池/调试） */
export const ALL_SOUND_IDS: string[] = SOUND_LIBRARY.map((s) => s.id);
