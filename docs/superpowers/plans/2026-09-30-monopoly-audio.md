# 大富翁 · 音效与音乐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给对局补上**音效 + 单段循环 BGM**——默认皮肤零素材（全部 Web Audio 程序化合成），可整包换成音频文件；顶部右侧两枚常驻静音键，音量内置默认。

**Architecture:** 音效**挂在既有唯一出画口 `runAction` 的 `fx.play` 对偶位置**（不新增触发点、不新增演出枚举）；音源照抄 `ProviderKind` 的 **`proc | file` 双轨制**，回退链照抄 `resolveMotion()` 的逐项回落（坏数据静默降级、永不抛错）。新增 `src/data/audio.ts`（纯数据）+ `src/ui/audio.ts`（纯函数 + 依赖注入引擎）+ `src/render/providers/proc-audio.ts`（4 个图标 preset）。`src/core/**`、`src/render/fx.ts`、经济数值、棋盘数据零改动。

**Tech Stack:** TypeScript + Vite 6 + PixiJS 8 + GSAP + Vitest 2（`environment: 'node'`，无 jsdom → 一律依赖注入测试）；Playwright（390×844 @dpr2）闸门脚本；Web Audio API（不引入任何音频库）。

**依据 spec:** `docs/superpowers/specs/2026-09-30-monopoly-audio-design.md`（已批准，提交 `877d508`）

**工作目录约定：** 下述相对路径均相对 `d:\zhao\monopoly`（=`ROOT`）；涉及根仓库的命令显式用 `d:\zhao`。

---

## 三处对 spec 的必要澄清（实现前必读）

1. **`audio.play(kind)` 只收 1 个参数**（spec §5.3 写作 `audio.play(ctx.kind, ctx)`）。
   理由：音频不需要演出上下文（坐标 / 时长都在 `fx` 侧），`ctx` 参数无任何消费者 → 按 YAGNI 去掉。**调用位置与 spec 完全一致**：在 `if (!ctx) { … return; }` 守卫**之后**，因此 `withFx === false`（`aiDriver.skipRest` / `?nofx`）与 `ctxOfStep` 返回 `null`（买地失败）两条路径都天然不出声。

2. **`SfxKind` 定义在 `src/data/audio.ts`，不由 `FxKind` 派生**。
   理由：`src/skin/types.ts` 需要 `SfxKind` / `SfxVoice` / `BgmVoice`，而 `FxKind` 在 `src/render/fx.ts` —— `skin → render` 是**反向依赖且会成环**（`fx.ts` 已 `import … from '../skin/types'`）。故 `SfxKind` 自带 10 元联合，另用**测试**锁住「9 个 `FxKind` + `ui` 全覆盖」（spec §10.1）。

3. **photo 皮肤不加顶层 `sound` 段**（spec §3 表述为「两个 `skin.json` + `sound` 段 + 4 个图标元素」）。
   理由：`public/skins/photo/` 内**没有任何音频文件**，写 `file.src` 会在运行期 404（虽然会静默回退 proc，但违反仓库「缺素材」纪律）。photo 只补 4 个**图标元素**（与其它元素一样回退 default 的 proc preset 名）；`sound` 段缺省 = 全内建默认音源，符合 spec §4.3 的 L3 兜底。

---

## 文件结构（改动面）

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/data/audio.ts` | **纯数据**：`SfxKind` / `SfxVoice` / `VOICES` 参数表 / `DEFAULT_SFX` cue 表 / `BGM_PROGRESSION` / 开关文案 | 新增 |
| `src/ui/audio.ts` | **纯函数**（`sfxFor` / `cleanSpec` / `resolveSound` / `bgmLoopSeconds` / prefs 读写）+ **依赖注入引擎** `createAudioEngine` | 新增 |
| `src/render/providers/proc-audio.ts` | 4 个图标 preset（喇叭开/关、音符开/关）+ `AUDIO_D` 内建兜底表 | 新增 |
| `src/skin/types.ts` | `SoundProviderKind` / `SoundSpec` / `SoundPack`；`SkinPack.sound?` | 修改 |
| `src/skin/layout.ts` | `AUDIO_*` 常量（键位 / 音量 / BGM 排程） | 修改 |
| `src/skin/registry.ts` | 4 个新注册 id（26×26 图标） | 修改 |
| `src/render/providers/proc.ts` | 注册 4 个新 preset | 修改 |
| `src/ui/Hud.ts` | `HudActionId` 增两枚；`hitAreas` / `hudSpecs` 三角同步 | 修改 |
| `src/main.ts` | 装配引擎、手势解锁、静音键接线、`?audio=` 参数、BGM 起停 | 修改 |
| `public/skins/default/skin.json` | 4 个图标元素 + 顶层 `sound` 段（音量 + BGM proc） | 修改 |
| `public/skins/photo/skin.json` | 4 个图标元素（无 `sound` 段，见澄清 3） | 修改 |
| `tools/registry-ids.json` | 由 `tools/gen-registry-ids.mjs` 重生成（233 → 237） | 重生成 |
| `test/data/audio.spec.ts` | 数据层单测（cue 表 / voice 表 / 和弦进行 / 文案） | 新增 |
| `test/ui/audio.spec.ts` | 纯函数 + 注入式引擎单测（回退链 / prefs / 排程） | 新增 |
| `test/render/proc-audio.spec.ts` | 4 个 preset 的绘制与注册 | 新增 |
| `test/ui/hud.spec.ts` | 增静音键命中区 / 图标 spec 用例（既有 3 处断言同步） | 修改 |
| `test/smoke.spec.ts` | `parseOptions` 两处 `toEqual` 全等断言补 `audio` | 修改 |
| `local/mono-prod-check.mjs` | 新增音频 gate（stub `AudioContext`）+ 2 张截图 | 修改 |
| `local/mono-e2e-playthrough.mjs` | 新增音频 gate（静音键在 AI 回合 / `over` 后仍存在） | 修改 |
| `docs/manual-mono.md` | 新增 `### M11 音效与音乐` + URL 参数行 + 验收行 | 修改 |
| `docs/verify/mono-audio-*.png` | 手机视口截图入库（390×844 @dpr2） | 新增 |

**不改**：`src/core/**`、`src/render/fx.ts`、`src/render/assets.ts`（音频**不得**进 `assetPaths()`）、经济数值、棋盘数据、`?demo=1` 行为。

---

## Task 1: `src/data/audio.ts` —— 音效与音乐的数据层（TDD）

**Files:**
- Create: `src/data/audio.ts`
- Test: `test/data/audio.spec.ts`

- [ ] **Step 1: 写测试（先失败）**

新建 `test/data/audio.spec.ts`：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run（`cwd=d:\zhao\monopoly`）: `npx vitest run test/data/audio.spec.ts`
Expected: FAIL — `Failed to resolve import "../../src/data/audio"`。

- [ ] **Step 3: 建 `src/data/audio.ts`**

```ts
/**
 * 音效与音乐的数据层（spec §5.2 / §6.1）：cue→音色映射、音色参数表、BGM 和弦进行、开关文案。
 * 纯数据 + 纯常量：零副作用、零 DOM、零时间概念。**调音只改这一张表，不动逻辑。**
 *
 * 为什么 `SfxKind` 定义在这里而不是从 `FxKind` 派生（spec §5.1 写作 `FxKind | 'ui'`）：
 * `src/skin/types.ts` 需要 `SfxKind` / `SfxVoice` / `BgmVoice`，而 `FxKind` 在 `src/render/fx.ts`
 * —— `skin → render` 既反向又成环（`fx.ts` 已 import `../skin/types`）。故自带 10 元联合，
 * 由 `test/data/audio.spec.ts` 锁住「9 个 FxKind + ui 全覆盖」。
 */

/** 演出 cue 集合（spec §5.1）：9 个既有演出时刻 + 1 个「无 fx 的 UI 动作」 */
export type SfxKind =
  | 'dice' | 'hop' | 'buy' | 'upgrade' | 'rent' | 'card' | 'deck' | 'stock' | 'end' | 'ui';

export const SFX_KINDS: SfxKind[] = [
  'dice', 'hop', 'buy', 'upgrade', 'rent', 'card', 'deck', 'stock', 'end', 'ui',
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
  card: 'sweep', deck: 'sweep', stock: 'tone', end: 'chime', ui: 'tick',
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/data/audio.spec.ts`
Expected: PASS — 6 例全绿。

- [ ] **Step 5: 提交**

```bash
git add monopoly/src/data/audio.ts monopoly/test/data/audio.spec.ts
git commit -m "feat(mono): 音效与音乐数据层（cue 表 / 音色参数表 / BGM 和弦进行）"
```

---

## Task 2: 音源双轨制的类型与常量（`skin/types.ts` + `skin/layout.ts`）

**Files:**
- Modify: `src/skin/types.ts`
- Modify: `src/skin/layout.ts`

类型与常量是后续所有 Task 的公共依赖，**先落地、本任务不写新测试**（由 Task 3/5/7 的测试覆盖）。

- [ ] **Step 1: `src/skin/types.ts` 顶部加类型导入**

在文件第 1 行（`export type Mount = …` 之前）插入：

```ts
import type { BgmVoice, SfxKind, SfxVoice } from '../data/audio';
```

- [ ] **Step 2: `src/skin/types.ts` 增音源双轨制类型**

在 `export type ProviderSpec = …;` **之后**插入：

```ts
/* —— 音源双轨制（spec §4.1）：与 `ProviderKind` 完全同构 —— 默认程序化，可整包换音频文件 —— */

export type SoundProviderKind = 'proc' | 'file';

/** `proc`：程序化合成，`voice` 取自 `src/data/audio.ts` 的音色原型表 */
export interface ProcSoundSpec { kind: 'proc'; voice: SfxVoice | BgmVoice }
/** `file`：音频文件（手势解锁后异步 `decodeAudioData`；缺失 / 解码失败 → 回退 proc） */
export interface FileSoundSpec { kind: 'file'; src: string; volume?: number }
export type SoundSpec = ProcSoundSpec | FileSoundSpec;

/** 皮肤包顶层 `sound` 段（spec §4.1）；缺省 / 坏数据 = 全内建程序化音源 */
export interface SoundPack {
  sfx?: Partial<Record<SfxKind, SoundSpec>>;
  bgm?: SoundSpec;
  volume?: { sfx?: number; bgm?: number };
}
```

- [ ] **Step 3: `src/skin/types.ts` 的 `SkinPack` 增 `sound?`**

把 `SkinPack` 里的 `fx?: FxTokens;` 一行改成：

```ts
  /** 顶层 `fx` 段：`fx.ts` 经 `resolveMotion()` 消费，缺省时用 layout 的 FX_* 兜底 */
  fx?: FxTokens;
  /** 顶层 `sound` 段：`src/ui/audio.ts` 经 `resolveSound()` 消费，缺省时用内建程序化音源 */
  sound?: SoundPack;
```

- [ ] **Step 4: `src/skin/layout.ts` 追加 `AUDIO_*` 常量**

在文件**末尾**追加：

```ts
/* —— M11 音效与音乐（spec §7.1 / §8.1）：静音键键位 + 音量 + BGM 排程参数 ——
   本文件不在 `tools/check-hardcoded.mjs` 的 gate 作用域内（该 gate 只扫 `src/render/`），
   故裸时长 / 增益 / BPM 一律集中声明在这里——与 `FX_*` 的既有归置一致。 */
export const AUDIO_KEY_SIZE = 26;
/** 音效键左上角（390 − 8 − 26 − 6 − 26 = 324；与 `HUD_TOP_H = 30` 内的分享键 8..86 零冲突） */
export const AUDIO_SFX_BOX = { left: 324, top: 5 };
/** 音乐键左上角（390 − 8 − 26 = 356） */
export const AUDIO_BGM_BOX = { left: 356, top: 5 };

/* 音量（spec §8.2，可被 skin.json 的 sound.volume 覆盖） */
export const AUDIO_VOL_SFX = 0.8;
export const AUDIO_VOL_BGM = 0.35;

/* BGM 排程（spec §6.1：120 BPM → 1 拍 500ms；4 拍/小节 → 2s/小节；4 小节 → 8s 整段） */
export const AUDIO_BGM_BEATS_PER_BAR = 4;
export const AUDIO_BGM_BARS = 4;
export const AUDIO_BGM_BEAT_MS = 500;
export const AUDIO_BGM_BASS_MS = 800;              // 低音衰减
export const AUDIO_BGM_BASS_ATTACK_MS = 20;        // 低音起音
export const AUDIO_BGM_PAD_ATTACK_MS = 300;        // 三和弦起音
export const AUDIO_BGM_PAD_GAIN = 0.35;            // 铺底相对增益
export const AUDIO_BGM_LOOKAHEAD_MS = 100;         // 排程器轮询间隔
export const AUDIO_BGM_SCHEDULE_AHEAD_S = 0.3;     // 提前排程窗口
```

- [ ] **Step 5: 类型与 lint 冒烟**

Run: `npx tsc --noEmit`
Expected: 无输出（`noUnusedLocals` 下新常量均已导出，不会被判未使用）。

- [ ] **Step 6: 提交**

```bash
git add monopoly/src/skin/types.ts monopoly/src/skin/layout.ts
git commit -m "feat(mono): 音源双轨制类型（SoundSpec/SoundPack）与 AUDIO_* 常量"
```

---

## Task 3: `src/ui/audio.ts` 纯函数层（回退链 / 音量 / prefs）

**Files:**
- Create: `src/ui/audio.ts`
- Test: `test/ui/audio.spec.ts`（本任务先建文件，只放纯函数用例；引擎用例在 Task 4 追加）

- [ ] **Step 1: 写测试（先失败）**

新建 `test/ui/audio.spec.ts`：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui/audio.spec.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/audio"`。

- [ ] **Step 3: 建 `src/ui/audio.ts`（纯函数部分 + 占位导出）**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui/audio.spec.ts`
Expected: PASS — 10 例全绿。

- [ ] **Step 5: 提交**

```bash
git add monopoly/src/ui/audio.ts monopoly/test/ui/audio.spec.ts
git commit -m "feat(mono): 音频纯函数层（resolveSound 回退链 / 音量 / prefs）"
```

---

## Task 4: `createAudioEngine` 注入式引擎（解锁 / 音效 / BGM 排程）

**Files:**
- Modify: `src/ui/audio.ts`（追加装配层）
- Test: `test/ui/audio.spec.ts`（追加引擎用例）

- [ ] **Step 1: 追加测试（先失败）**

把 `test/ui/audio.spec.ts` 的 import 改为**追加**下列符号（保持其余不动）：

```ts
import {
  PREFS_KEY, bgmLoopSeconds, cleanSpec, createAudioEngine, readPrefs, resolveSound, sfxFor,
  togglePrefs, writePrefs, type AudioCtxLike,
} from '../../src/ui/audio';
```

并在文件**末尾**追加：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui/audio.spec.ts`
Expected: FAIL — `createAudioEngine is not a function` / TS 报未导出。

- [ ] **Step 3: 在 `src/ui/audio.ts` 末尾追加装配层**

```ts
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
```

> ⚠️ `toggle` 里用 `this.play('ui')`：`return { … }` 是对象字面量、`this` 就是返回的引擎对象，
> 语义成立。若后续被解构调用（`const { toggle } = engine`）会丢 `this`——`main.ts` 只经
> `__monoMain.audio.toggle(...)` 调用，不受影响；测试同样。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui/audio.spec.ts`
Expected: PASS — 19 例全绿。

- [ ] **Step 5: 类型与 lint 冒烟**

Run: `npx tsc --noEmit`
Expected: 无输出。

- [ ] **Step 6: 提交**

```bash
git add monopoly/src/ui/audio.ts monopoly/test/ui/audio.spec.ts
git commit -m "feat(mono): 音频引擎（手势解锁 / 音效回退链 / BGM lookahead 排程）"
```

---

## Task 5: `src/render/providers/proc-audio.ts` —— 4 个图标 preset

**Files:**
- Create: `src/render/providers/proc-audio.ts`
- Modify: `src/render/providers/proc.ts`
- Test: `test/render/proc-audio.spec.ts`

> ⚠️ 本文件在 `tools/check-hardcoded.mjs` 的 gate 作用域内（该 gate 扫 `src/render/`）：
> **所有裸色值 / 裸视觉数字必须写在 `fb({...})` 的实参里**，再经 `num/str` 取值——与 `proc-hud.ts` 的 `HUD_D` 完全同规。
> 原语只有 `roundRect / rect / circle / poly / fill / stroke`（**无 arc**）：声波弧用 6 点闭合 `poly` 折线近似，斜杠用 4 点薄四边形。

- [ ] **Step 1: 写测试（先失败）**

新建 `test/render/proc-audio.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { AUDIO_D, uiMusicOff, uiMusicOn, uiSoundOff, uiSoundOn } from '../../src/render/providers/proc-audio';
import { PROC_PRESETS } from '../../src/render/providers/proc';

interface Call { op: string; style: Record<string, unknown> }

function recorder() {
  const calls: Call[] = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      calls.push({ op, style: (op === 'fill' || op === 'stroke' ? (a[0] ?? {}) : {}) as Record<string, unknown> });
      return g;
    },
  });
  return { g, calls };
}

const ops = (calls: Call[], op: string): Call[] => calls.filter((c) => c.op === op);
const fills = (calls: Call[]): string[] => ops(calls, 'fill').map((c) => String(c.style.color));
const strokes = (calls: Call[]): string[] => ops(calls, 'stroke').map((c) => String(c.style.color));

const ctx = (on: boolean) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 26, d: 1, h: 26 },
  cx: 337, cy: 18, s: 1,
  params: {},
  state: { on },
});

describe('proc preset: 音效 / 音乐图标', () => {
  it('音效开：喇叭 1 个 poly + 2 道声波折线，全部用亮色 ink', () => {
    const { g, calls } = recorder();
    uiSoundOn(g as never, ctx(true) as never);
    expect(ops(calls, 'poly').length).toBe(3);                 // 喇叭体 + 两道声波
    expect(fills(calls)).toEqual([AUDIO_D.iconInk]);           // 只有喇叭体是填充
    expect(strokes(calls)).toEqual([AUDIO_D.iconInk, AUDIO_D.iconInk]);
  });

  it('音效关：喇叭压暗 + 1 道 45° 斜杠（斜杠为填充）', () => {
    const { g, calls } = recorder();
    uiSoundOff(g as never, ctx(false) as never);
    expect(ops(calls, 'poly').length).toBe(2);                 // 喇叭体 + 斜杠
    expect(fills(calls)).toEqual([AUDIO_D.iconInkOff, AUDIO_D.slashInk]);
  });

  it('音乐开：1 个符头圆 + 1 个符干矩形 + 1 个符尾 poly', () => {
    const { g, calls } = recorder();
    uiMusicOn(g as never, ctx(true) as never);
    expect(ops(calls, 'circle').length).toBe(1);
    expect(ops(calls, 'rect').length).toBe(1);
    expect(ops(calls, 'poly').length).toBe(1);
    expect(fills(calls)).toEqual([AUDIO_D.iconInk, AUDIO_D.iconInk, AUDIO_D.iconInk]);
  });

  it('音乐关：音符压暗 + 斜杠', () => {
    const { g, calls } = recorder();
    uiMusicOff(g as never, ctx(false) as never);
    expect(fills(calls)).toEqual([AUDIO_D.iconInkOff, AUDIO_D.iconInkOff, AUDIO_D.iconInkOff, AUDIO_D.slashInk]);
  });

  it('形状落在 26×26 包围盒内（不越出键位）', () => {
    for (const preset of [uiSoundOn, uiSoundOff, uiMusicOn, uiMusicOff]) {
      const { g, calls } = recorder();
      preset(g as never, ctx(true) as never);
      expect(calls.length).toBeGreaterThan(0);
    }
    expect(AUDIO_D.iconInk).not.toBe(AUDIO_D.iconInkOff);      // 开 / 关两态必须可辨
  });
});

describe('proc-audio 注册', () => {
  it('4 个 preset 全部注册进 PROC_PRESETS', () => {
    expect(PROC_PRESETS.uiSoundOn).toBe(uiSoundOn);
    expect(PROC_PRESETS.uiSoundOff).toBe(uiSoundOff);
    expect(PROC_PRESETS.uiMusicOn).toBe(uiMusicOn);
    expect(PROC_PRESETS.uiMusicOff).toBe(uiMusicOff);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/render/proc-audio.spec.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/providers/proc-audio"`。

- [ ] **Step 3: 建 `src/render/providers/proc-audio.ts`**

```ts
/* 取值器从依赖零的 proc-base.ts 取（与 proc-hud / proc-building / proc-props 同规），
   避免 proc ↔ proc-audio 循环求值导致 PROC_PRESETS 里拿到未初始化的 preset 绑定 */
import { fb, num, str } from './proc-base';
import { ptsToPoly } from '../paint';
import type { ProcPreset } from './proc';

/**
 * L4 内建兜底默认值（守「可见元素必须可换素材」硬契约，spec §7.3）：
 * 全部色值与几何比例集中声明一次——`no-hardcoded-color` / `no-visual-number` 的唯一豁免位置。
 * 几何一律按 `w = box.w × s` 的比例表达，故 26×26 之外换任何键位尺寸都不用调参。
 */
export const AUDIO_D = fb({
  /* 开启态：亮；关闭态：压暗（26×26 下仍可辨，spec §7.3） */
  iconInk: '#e8e4d8',
  iconInkOff: '#5b6b63',
  slashInk: '#e0607e',
  /* 喇叭（左）：颈 − 口 的梯形；比例相对 w */
  spkLeft: -0.34, spkNeckX: -0.16, spkNeckH: 0.15, spkConeX: 0.04, spkConeH: 0.30,
  /* 声波：两道 6 点闭合折线（无 arc 原语，spec §7.3） */
  wave1X: 0.10, wave2X: 0.22, waveSpan: 0.17, waveInset: 0.25,
  /* 关闭斜杠：4 点薄四边形，45° */
  slashDx: 0.36, slashDy: 0.38, slashW: 0.09,
  /* 音符：符头圆 + 符干 + 符尾 */
  noteHeadX: -0.14, noteHeadY: 0.16, noteHeadR: 0.13,
  noteStemX: -0.01, noteStemW: 0.06, noteStemTop: -0.28, noteStemH: 0.46,
  noteFlagX: 0.24, noteFlagY: -0.24, noteFlagH: 0.20,
});

const G = (p: Record<string, unknown>, k: keyof typeof AUDIO_D): number => num(p, k, AUDIO_D[k] as number);
const S = (p: Record<string, unknown>, k: keyof typeof AUDIO_D): string => str(p, k, AUDIO_D[k] as string);

/** 一道声波：6 点闭合折线（外弧 3 点 + 内返 3 点），无 arc 原语的近似（spec §11 风险 5） */
function wave(cx: number, cy: number, x0: number, span: number, inset: number): number[] {
  const i = span * inset;
  return ptsToPoly([
    [cx + x0, cy - span],
    [cx + x0 + span * 0.62, cy - span * 0.5],
    [cx + x0 + span * 0.78, cy],
    [cx + x0 + span * 0.62, cy + span * 0.5],
    [cx + x0, cy + span],
    [cx + x0 + i, cy + span * 0.45],
    [cx + x0 + i * 0.9, cy],
    [cx + x0 + i, cy - span * 0.45],
  ]);
}

/** 45° 斜杠：4 点薄四边形（沿主对角线） */
function slash(cx: number, cy: number, dx: number, dy: number, w: number): number[] {
  return ptsToPoly([
    [cx - dx, cy - dy + w],
    [cx - dx + w, cy - dy],
    [cx + dx, cy + dy - w],
    [cx + dx - w, cy + dy],
  ]);
}

/** 喇叭体：6 点梯形（颈 + 口） */
function speaker(cx: number, cy: number, w: number, p: Record<string, unknown>): number[] {
  const left = G(p, 'spkLeft') * w;
  const neckX = G(p, 'spkNeckX') * w;
  const neckH = G(p, 'spkNeckH') * w;
  const coneX = G(p, 'spkConeX') * w;
  const coneH = G(p, 'spkConeH') * w;
  return ptsToPoly([
    [cx + left, cy - neckH], [cx + neckX, cy - neckH],
    [cx + coneX, cy - coneH], [cx + coneX, cy + coneH],
    [cx + neckX, cy + neckH], [cx + left, cy + neckH],
  ]);
}

/* —— 音效开：喇叭（实心）+ 两道声波（描边） —— */
export const uiSoundOn: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const w = box.w * ctx.s;
  const ink = S(params, 'iconInk');
  g.poly(speaker(cx, cy, w, params)).fill({ color: ink });
  g.poly(wave(cx, cy, G(params, 'wave1X') * w, G(params, 'waveSpan') * w, G(params, 'waveInset')))
    .stroke({ color: ink, width: G(params, 'iconInk') ? 2 : 2 });
  g.poly(wave(cx, cy, G(params, 'wave2X') * w, G(params, 'waveSpan') * w, G(params, 'waveInset')))
    .stroke({ color: ink, width: 2 });
};

/* —— 音效关：喇叭压暗 + 45° 斜杠 —— */
export const uiSoundOff: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const w = box.w * ctx.s;
  g.poly(speaker(cx, cy, w, params)).fill({ color: S(params, 'iconInkOff') });
  g.poly(slash(cx, cy, G(params, 'slashDx') * w, G(params, 'slashDy') * w, G(params, 'slashW') * w))
    .fill({ color: S(params, 'slashInk') });
};

/* —— 音乐开：符头 + 符干 + 符尾 —— */
export const uiMusicOn: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const w = box.w * ctx.s;
  const ink = S(params, 'iconInk');
  g.circle(cx + G(params, 'noteHeadX') * w, cy + G(params, 'noteHeadY') * w, G(params, 'noteHeadR') * w)
    .fill({ color: ink });
  g.rect(cx + G(params, 'noteStemX') * w, cy + G(params, 'noteStemTop') * w,
    G(params, 'noteStemW') * w, G(params, 'noteStemH') * w).fill({ color: ink });
  g.poly(ptsToPoly([
    [cx + G(params, 'noteFlagX') * w, cy + G(params, 'noteFlagY') * w],
    [cx + G(params, 'noteFlagX') * w * 0.3, cy + (G(params, 'noteFlagY') - G(params, 'noteFlagH') * 0.2) * w],
    [cx + (G(params, 'noteFlagX') * 0.3 - G(params, 'noteStemW')) * w, cy + G(params, 'noteFlagY') * w],
  ])).fill({ color: ink });
};

/* —— 音乐关：音符压暗 + 45° 斜杠 —— */
export const uiMusicOff: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const w = box.w * ctx.s;
  const ink = S(params, 'iconInkOff');
  g.circle(cx + G(params, 'noteHeadX') * w, cy + G(params, 'noteHeadY') * w, G(params, 'noteHeadR') * w)
    .fill({ color: ink });
  g.rect(cx + G(params, 'noteStemX') * w, cy + G(params, 'noteStemTop') * w,
    G(params, 'noteStemW') * w, G(params, 'noteStemH') * w).fill({ color: ink });
  g.poly(ptsToPoly([
    [cx + G(params, 'noteFlagX') * w, cy + G(params, 'noteFlagY') * w],
    [cx + G(params, 'noteFlagX') * w * 0.3, cy + (G(params, 'noteFlagY') - G(params, 'noteFlagH') * 0.2) * w],
    [cx + (G(params, 'noteFlagX') * 0.3 - G(params, 'noteStemW')) * w, cy + G(params, 'noteFlagY') * w],
  ])).fill({ color: ink });
  g.poly(slash(cx, cy, G(params, 'slashDx') * w, G(params, 'slashDy') * w, G(params, 'slashW') * w))
    .fill({ color: S(params, 'slashInk') });
};
```

> ⚠️ `uiSoundOn` 里的 `width: G(params, 'iconInk') ? 2 : 2` 是错的占位——**改成明确的描边宽默认值**：
> 在 `AUDIO_D` 里加 `waveW: 2`，两处 `.stroke({ color: ink, width: G(params, 'waveW') })`。

- [ ] **Step 4: 修掉上一步标注的占位**

在 `AUDIO_D` 中追加 `waveW: 2,`（放在 `waveInset` 之后），并把 `uiSoundOn` 的两处描边改为：

```ts
  g.poly(wave(cx, cy, G(params, 'wave1X') * w, G(params, 'waveSpan') * w, G(params, 'waveInset')))
    .stroke({ color: ink, width: G(params, 'waveW') });
  g.poly(wave(cx, cy, G(params, 'wave2X') * w, G(params, 'waveSpan') * w, G(params, 'waveInset')))
    .stroke({ color: ink, width: G(params, 'waveW') });
```

- [ ] **Step 5: 注册进 `PROC_PRESETS`**

`src/render/providers/proc.ts` 第 121 行附近，在 `import { diceBody, … } from './proc-hud';` 之后加：

```ts
import { uiMusicOff, uiMusicOn, uiSoundOff, uiSoundOn } from './proc-audio';
```

并在 `PROC_PRESETS` 对象里、`uiBadge,` 之前加：

```ts
  uiSoundOn,
  uiSoundOff,
  uiMusicOn,
  uiMusicOff,
```

- [ ] **Step 6: 跑测试与 gate**

Run: `npx vitest run test/render/proc-audio.spec.ts`
Expected: PASS — 6 例全绿。

Run: `node tools/check-hardcoded.mjs`
Expected: `[check-hardcoded] clean（N 个文件）`（若报 `no-visual-number` / `no-hardcoded-color`，说明有裸值漏进 `AUDIO_D` 之外，逐个搬进 `fb({...})`）。

- [ ] **Step 7: 提交**

```bash
git add monopoly/src/render/providers/proc-audio.ts monopoly/src/render/providers/proc.ts monopoly/test/render/proc-audio.spec.ts
git commit -m "feat(mono): 音效/音乐图标 proc preset（喇叭开合 + 音符开合）"
```

---

## Task 6: 注册 4 个图标 id + 两个皮肤包 + 注册表重生成

**Files:**
- Modify: `src/skin/registry.ts`
- Modify: `public/skins/default/skin.json`
- Modify: `public/skins/photo/skin.json`
- Regenerate: `tools/registry-ids.json`

- [ ] **Step 1: `src/skin/registry.ts` 注册 4 个 id**

在 `reg['ui.personaTag'] = …;`（第 145 行）**之后**插入：

```ts
/* M11 音效与音乐（spec §7.3）：顶部右侧两枚 26×26 常驻静音键；开/关各一个 id（共 4 个） */
reg['ui.sound.on'] = showcaseEntry('ui.sound.on', { w: AUDIO_KEY_SIZE, d: 1, h: AUDIO_KEY_SIZE });
reg['ui.sound.off'] = showcaseEntry('ui.sound.off', { w: AUDIO_KEY_SIZE, d: 1, h: AUDIO_KEY_SIZE });
reg['ui.music.on'] = showcaseEntry('ui.music.on', { w: AUDIO_KEY_SIZE, d: 1, h: AUDIO_KEY_SIZE });
reg['ui.music.off'] = showcaseEntry('ui.music.off', { w: AUDIO_KEY_SIZE, d: 1, h: AUDIO_KEY_SIZE });
```

同时把第 1 行的导入改为（`AUDIO_KEY_SIZE` 不在 registry 里裸写 26）：

```ts
import { AUDIO_KEY_SIZE } from './layout';
import type { RegistryEntry } from './types';
```

- [ ] **Step 2: `public/skins/default/skin.json` 增 `sound` 段**

在顶层 `"fx": { … },` **之后**插入：

```json
  "sound": {
    "volume": { "sfx": 0.8, "bgm": 0.35 },
    "bgm": { "kind": "proc", "voice": "pad" }
  },
```

- [ ] **Step 3: `public/skins/default/skin.json` 增 4 个图标元素**

在 `"ui.personaTag": { … },` **之后**插入：

```json
    "ui.sound.on": { "kind": "proc", "preset": "uiSoundOn", "params": {} },
    "ui.sound.off": { "kind": "proc", "preset": "uiSoundOff", "params": {} },
    "ui.music.on": { "kind": "proc", "preset": "uiMusicOn", "params": {} },
    "ui.music.off": { "kind": "proc", "preset": "uiMusicOff", "params": {} },
```

- [ ] **Step 4: `public/skins/photo/skin.json` 增 4 个图标元素**

在 `"showcase.mini"` 那一行**之后**加逗号并插入（**不加 `sound` 段**，理由见「澄清 3」）：

```json
    "ui.sound.on": { "kind": "proc", "preset": "uiSoundOn", "params": {} },
    "ui.sound.off": { "kind": "proc", "preset": "uiSoundOff", "params": {} },
    "ui.music.on": { "kind": "proc", "preset": "uiMusicOn", "params": {} },
    "ui.music.off": { "kind": "proc", "preset": "uiMusicOff", "params": {} }
```

- [ ] **Step 5: 重生成注册表 id 清单并校验皮肤**

Run: `npm run lint:skin`
Expected:
```
registry-ids.json: 237 ids
[skin:default] OK
[skin:photo] OK
```

- [ ] **Step 6: 全量校验**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 既有测试全绿（`registry.spec.ts` 的 `ids.length === Object.keys(REGISTRY).length` 自动跟随；`skills/ids` 用例不受影响）。

- [ ] **Step 7: 提交**

```bash
git add monopoly/src/skin/registry.ts monopoly/public/skins/default/skin.json monopoly/public/skins/photo/skin.json monopoly/tools/registry-ids.json
git commit -m "feat(mono): 注册 4 个音效/音乐图标元素（233 → 237 ids）与 default 皮肤 sound 段"
```

---

## Task 7: HUD 静音键（命中层 + 可见像素）

**Files:**
- Modify: `src/ui/Hud.ts`
- Test: `test/ui/hud.spec.ts`

> ⚠️ **两个已定位的实现坑（spec §7.2 / §7.3）**：
> ① `hitAreas()` 首行是 `if (state.over) return out;` —— 两枚静音键必须**在它之前**推入，否则结算后消失；
> ② `hudSpecs()` 的 AI 分支以 `return out` 提前结束 —— 图标必须在该分支的两个出口**都**推入，否则 AI 回合图标消失。

- [ ] **Step 1: 追加测试（先失败）**

在 `test/ui/hud.spec.ts` 顶部把 layout 导入改为（追加两个键位常量）：

```ts
import {
  AUDIO_BGM_BOX, AUDIO_KEY_SIZE, AUDIO_SFX_BOX, BOTTOM_BTN_Y, DOCK_Y, HUD_BAR_H, HUD_BAR_W,
  HUD_BTN_AI_W, HUD_BTN_AI_X, HUD_DICE_Y, STAGE_W,
} from '../../src/skin/layout';
```

**同步修正 3 处既有断言**（否则会被静音键打破）：

1. `'idle：只有主按钮，且可点'` 改为：

```ts
  it('idle：两枚静音键常驻 + 主按钮，且都可点', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const areas = hitAreas(g.state);
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'roll']);
    expect(areas[0]).toEqual({
      action: 'audio:sfx', x: AUDIO_SFX_BOX.left, y: AUDIO_SFX_BOX.top,
      w: AUDIO_KEY_SIZE, h: AUDIO_KEY_SIZE, enabled: true,
    });
    expect(areas[1].action).toBe('audio:bgm');
    expect(areas[2].action).toBe('roll');
  });
```

2. `'settled + 自有 L1：主按钮为「结束回合」+ 升级按钮（含可用性）'` 里两处索引 +2：

```ts
    const areas = hitAreas(g.state);
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'end', 'upgrade']);
    expect(areas[2].x).toBe(146);
    expect(areas[3]).toEqual({ action: 'upgrade', x: 249, y: BOTTOM_BTN_Y, w: 110, h: 46, enabled: true });

    g.state.players[0].cash = 10;
    expect(hitAreas(g.state)[3].enabled).toBe(false);
```

3. `'AI 回合命中层：主按钮禁用 + 两枚快捷键可点'` 改为：

```ts
  it('AI 回合命中层：两枚静音键 + 主按钮禁用 + 两枚快捷键可点', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 2;
    const areas = hitAreas(g.state, seats);
    expect(areas.length).toBe(5);
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', expect.any(String), 'ai:fast', 'ai:skip']);
    expect(areas[2].enabled).toBe(false);
    expect(areas[2].x).toBe(HUD_BTN_AI_X);
    expect(areas[2].w).toBe(HUD_BTN_AI_W);
    expect(areas[2].x + areas[2].w).toBeLessThanOrEqual(STAGE_W);
    expect(areas[3].enabled).toBe(true);
    expect(areas[4].enabled).toBe(true);
  });
```

同时在文件**末尾**追加新用例：

```ts
describe('hud 静音键（M11）', () => {
  const byId = (specs: ReturnType<typeof hudSpecs>, id: string) => specs.filter((s) => s.id === id);

  it('结算后两枚静音键仍在命中层（`state.over` 早退也不能吞掉）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[1].bankrupt = true;
    g.state.players[2].bankrupt = true;
    g.state.players[3].bankrupt = true;
    g.rollDice(); g.moveCurrent(); g.settleCurrent(); g.endTurn();
    expect(g.state.over).toBe(true);
    const areas = hitAreas(g.state);
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm']);
    expect(areas.every((a) => a.enabled)).toBe(true);
  });

  it('图标 spec：开态推 ui.sound.on / ui.music.on，关态推 .off', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const on = hudSpecs(g.state, false, [], false, { sfx: true, bgm: true });
    expect(byId(on, 'ui.sound.on').length).toBe(1);
    expect(byId(on, 'ui.music.on').length).toBe(1);
    expect(byId(on, 'ui.sound.off').length).toBe(0);

    const off = hudSpecs(g.state, false, [], false, { sfx: false, bgm: false });
    expect(byId(off, 'ui.sound.off').length).toBe(1);
    expect(byId(off, 'ui.music.off').length).toBe(1);
  });

  it('AI 回合也有两枚图标，且 r 仍严格单调递增', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 1;
    const specs = hudSpecs(g.state, false, [null, 'conservative', 'aggressive', 'speculative'], false, { sfx: true, bgm: false });
    expect(byId(specs, 'ui.sound.on').length).toBe(1);
    expect(byId(specs, 'ui.music.off').length).toBe(1);
    const rs = specs.map((s) => s.r);
    expect([...rs].sort((a, b) => a - b)).toEqual(rs);
    expect(specs[specs.length - 1].id).toBe('ui.music.off');
  });

  it('两枚图标台位取 AUDIO_*_BOX，26×26，落在舞台内', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const specs = hudSpecs(g.state, false, [], false, { sfx: true, bgm: true });
    const sfx = byId(specs, 'ui.sound.on')[0];
    expect(sfx.fixed!.cx).toBe(AUDIO_SFX_BOX.left + AUDIO_KEY_SIZE / 2);
    expect(sfx.fixed!.cy).toBe(AUDIO_SFX_BOX.top + AUDIO_KEY_SIZE / 2);
    expect(sfx.pass).toBe(4);
    const bgm = byId(specs, 'ui.music.on')[0];
    expect(bgm.fixed!.cx).toBe(AUDIO_BGM_BOX.left + AUDIO_KEY_SIZE / 2);
    expect(bgm.fixed!.cx + AUDIO_KEY_SIZE / 2).toBeLessThanOrEqual(STAGE_W);
  });

  it('默认（不传第 5 参）视为全开，不改变既有调用点', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(byId(hudSpecs(g.state), 'ui.sound.on').length).toBe(1);
    expect(byId(hudSpecs(g.state), 'ui.music.on').length).toBe(1);
  });
});
```

同时把既有 `'AI 回合：整行主按钮 + 两枚快捷键…'` 里的 `expect(specs[specs.length - 1].id).toBe('ui.qk');` 改为
`expect(byId(specs, 'ui.qk').length).toBe(2);`（末位现在是 `ui.music.on`），
把 `'全部走 pass 4 + fixed 定格台位…'` 里的 `expect(specs[specs.length - 1].id.startsWith('ui.button')).toBe(true);` 改为
`expect(specs[specs.length - 1].id.startsWith('ui.music.')).toBe(true);`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui/hud.spec.ts`
Expected: FAIL — `hitAreas` 不含 `audio:sfx`。

- [ ] **Step 3: 改 `src/ui/Hud.ts`**

(a) layout 导入追加三个常量：在 `HUD_BTN_SECONDARY_W, HUD_BTN_UPGRADE_X,`
    一行后面加：

```ts
  AUDIO_BGM_BOX, AUDIO_KEY_SIZE, AUDIO_SFX_BOX,
```

(b) `HudActionId` 增两枚：

```ts
export type HudActionId =
  HudPrimaryAction | 'buy' | 'upgrade' | 'ai:fast' | 'ai:skip' | 'audio:sfx' | 'audio:bgm';
```

(c) `hudSpecs` 增第 5 参并在**两个出口**推图标。函数签名与 `aiSeat` 之后改为：

```ts
export function hudSpecs(
  state: GameState, fxBusy = false, seats: readonly Seat[] = [], fast = false,
  audio: { sfx: boolean; bgm: boolean } = { sfx: true, bgm: true },
): ElementSpec[] {
  const out: ElementSpec[] = [];
  const bar = (id: string, r: number, cx: number, cy: number, st: Record<string, unknown>, s = 1): void => {
    out.push({ id, slot: null, c: 0, r, pass: 4, fixed: { cx, cy, s }, state: st });
  };

  const aiSeat = state.over ? null : (seats[state.current] ?? null);

  /* 两枚静音键常驻于顶部右侧（spec §7.3）：必须在 AI 分支早退之前推入，且 r 继续递增（13 / 14） */
  const pushAudioKeys = (): void => {
    const half = AUDIO_KEY_SIZE / 2;
    bar(audio.sfx ? 'ui.sound.on' : 'ui.sound.off', 13,
      AUDIO_SFX_BOX.left + half, AUDIO_SFX_BOX.top + half, { on: audio.sfx });
    bar(audio.bgm ? 'ui.music.on' : 'ui.music.off', 14,
      AUDIO_BGM_BOX.left + half, AUDIO_BGM_BOX.top + half, { on: audio.bgm });
  };
```

(d) AI 分支的 `return out;`（第 153 行）改成：

```ts
    pushAudioKeys();
    return out;
```

(e) 函数**末尾**的 `return out;`（第 172 行）改成：

```ts
  pushAudioKeys();
  return out;
```

> 为什么在两处出口各推一次、而不是「在 `if (aiSeat)` 之前推一次」：`r` 必须严格递增
> （AI 主按钮 r=10 / 快捷键 11、12；真人主按钮 r=10 / 买地 11 / 升级 12），静音键固定 r=13、14。
> 若提到 `if (aiSeat)` 之前推入，r 序列会变成 13、14、10…12 —— 破坏绘制序，也会让
> `hud.spec.ts` 的「r 严格单调」断言失败。两处出口各推一次同时满足「早退不吞键」与「r 单调」。

(f) `hitAreas` 的两处早退改造（spec §7.2）：

```ts
export function hitAreas(state: GameState, seats: readonly Seat[] = []): HitArea[] {
  const out: HitArea[] = [];
  /* 两枚静音键无条件常驻（spec §7.2）：必须在 `state.over` 与 AI 两条早退路径**之前**推入 */
  out.push(
    { action: 'audio:sfx', x: AUDIO_SFX_BOX.left, y: AUDIO_SFX_BOX.top, w: AUDIO_KEY_SIZE, h: AUDIO_KEY_SIZE, enabled: true },
    { action: 'audio:bgm', x: AUDIO_BGM_BOX.left, y: AUDIO_BGM_BOX.top, w: AUDIO_KEY_SIZE, h: AUDIO_KEY_SIZE, enabled: true },
  );
  if (state.over) return out;
  /* AI 回合：主按钮整行且禁用；两枚快捷键可点（加速 / 跳过本次） */
  if (seats[state.current]) {
    return out.concat([
      { action: primaryAction(state) ?? 'end', x: HUD_BTN_AI_X, y: BOTTOM_BTN_Y, w: HUD_BTN_AI_W, h: HUD_BTN_H, enabled: false },
      { action: 'ai:fast', x: HUD_QK_FAST_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true },
      { action: 'ai:skip', x: HUD_QK_SKIP_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true },
    ]);
  }
```

（其余从 `const pa = primaryAction(state);` 起**原样不动**。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui/hud.spec.ts`
Expected: PASS — 既有例（已同步 3 处断言）+ 新增 4 例全绿。

- [ ] **Step 5: 类型与 lint 冒烟**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 无 TS 输出、全部测试文件绿（`hudSpecs` 第 5 参有默认值 → 既有调用点零改动）。

- [ ] **Step 6: 提交**

```bash
git add monopoly/src/ui/Hud.ts monopoly/test/ui/hud.spec.ts
git commit -m "feat(mono): HUD 顶部右侧两枚常驻静音键（命中层 + 4 个图标 spec）"
```

---

## Task 8: `src/main.ts` 接线（装配 / 解锁 / 静音键 / `?audio=` / BGM 起停）

**Files:**
- Modify: `src/main.ts`
- Modify: `test/smoke.spec.ts`

> ⚠️ **第四处对 spec 的必要澄清（实现前必读）**：spec §5.3 写「`aiDriver.skipRest()` **与 `?nofx`** 走
> `withFx === false` → 连带静音」——**前半句成立，后半句在本仓库不成立**：
> [main.ts L144](file:///d:/zhao/monopoly/src/main.ts#L144) 里 `?nofx` 只做 `fx.speed(FX_NOFX_SPEED)`，
> `dispatch(step)` 的 `withFx` 仍为默认 `true`，`ctxOfStep` 照常返回上下文 → **音效会照响**。
> 但 spec §8.2 与 §12 清单都要求「`?nofx` → 音效静音、BGM 仍在」。故本计划**用一行显式守卫**落实它
> （`sfxOn = !opts.nofx`，见 Step 3 (g)）：语义与 spec 完全一致，改动比「让 nofx 改走 withFx=false」
> 小得多（后者会连带改掉动画终帧的既有行为，属于本任务范围外）。
> `aiDriver.skipRest()` 一侧无需处理：它传 `withFx=false` → `ctx === null` → 函数在 `audio.play` 前
> 就 `return`，天然静音（`ai:skip` 与 `?nofx` 两条静音路径的实现方式不同，但**可观测行为一致**）。

- [ ] **Step 1: 追加测试（先失败）**

`test/smoke.spec.ts`：两处 `toEqual` 的全等断言各补一个 `audio: true` 字段：

```ts
    expect(parseOptions('')).toEqual({
      skin: 'default', debug: false, seed: 1, speed: 1, show: 'b', play: true, nofx: false, perf: false,
      audio: true, humans: undefined, ai: [], tour: undefined,
    });
```

```ts
    expect(parseOptions('?skin=photo&debug=1&seed=7&speed=4'))
      .toEqual({
        skin: 'photo', debug: true, seed: 7, speed: 4, show: 'b', play: true, nofx: false, perf: false,
        audio: true, humans: undefined, ai: [], tour: undefined,
      });
```

并在 `describe('parseOptions')` **末尾**追加：

```ts
  it('解析 ?audio=0（一键全静音，spec §8.2）', () => {
    expect(parseOptions('').audio).toBe(true);
    expect(parseOptions('?audio=1').audio).toBe(true);
    expect(parseOptions('?audio=0').audio).toBe(false);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/smoke.spec.ts`
Expected: FAIL — `toEqual` 缺 `audio` 字段（`Expected … - audio: true`）。

- [ ] **Step 3: 改 `src/main.ts`**

**(a) 导入引擎**（在 `import { createAiDriver, type AiDriver } from './ui/aiDriver';` 之后加一行）：

```ts
import { createAudioEngine } from './ui/audio';
```

**(b) `UrlOptions` 增字段**（在 `tour?: boolean;` 之后）：

```ts
  /** `?audio=0`：一键全静音（开关初始全关且**不创建** `AudioContext`）；缺省 = 有声（spec §8.2） */
  audio: boolean;
```

**(c) `parseOptions` 返回值增字段**（在 `tour: …` 一行之后）：

```ts
    /* 音频（spec §8.2）：`?audio=0` 一键全静音；裸链接 / `?audio=1` 一律有声 */
    audio: q.get('audio') !== '0',
```

**(d) 新增 `safeStorage()` 助手**（放在 `parseOptions` 之后、`loadShopConfig` 之前）：

```ts
/**
 * `localStorage` 包装：隐私模式 / 禁用 Cookie 下**属性访问本身**会抛，故不能直接传 `window.localStorage`
 * （引擎只在 `readPrefs` / `writePrefs` 内部 try/catch，挡不住取值这一步）。与 `setup.ts` 同规。
 */
function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}
```

**(e) 装配引擎**（在 `const tokens = { … };` 一行之后插入）：

```ts
  /* —— M11 音效与音乐（spec §3 / §9）：此处置装配，但**不建 `AudioContext`**——等首次手势解锁 —— */
  const audio = createAudioEngine({ storage: safeStorage(), forceMute: !opts.audio });
  audio.applySound((skin ?? defaultSkin)?.sound ?? null);
  /* 首次手势解锁（spec §9）：capture + once，开局面板「开始」/ HUD 点击都算解锁点 */
  window.addEventListener('pointerdown', () => { audio.unlock(); }, { capture: true, once: true });
  /* spec §8.2：`?nofx` 只静音**音效**（BGM 仍由音乐键控制）——见本 Task 顶部「第四处澄清」 */
  const sfxOn = !opts.nofx;
```

**(f) `playView` 的 `hudSpecs` 传第 5 参**（第 198 行）：

```ts
      ...hudSpecs(g.state, fxPending || fx.busy(), seats, driver?.isFast() ?? false, audio.prefs()),
```

**(g) `runAction` 里与 `fx` 同刻发声**（`if (!ctx) { … }` 守卫**之后**、`fxPending = true;` **之前**）：

```ts
    if (!ctx) {
      fxPending = false;
      paint();
      return;
    }
    /* 与 `fx.play` 同刻、同判空（spec §5.3）：`buy`/`upgrade` 失败无 fx → 也不出声 */
    if (sfxOn) audio.play(ctx.kind);
    fxPending = true;
```

**(h) `paint()` 顶部按 `over` 停 BGM**（`scene.reset();` 之前）：

```ts
  const paint = (): void => {
    if (game?.state.over) audio.stopBgm();   // spec §6.2：结算即停 BGM（幂等，重复调用无副作用）
    scene.reset();
```

**(i) `startGame` 里起 BGM + HUD 静音键分支**：

`driver.start();` **之后**加：

```ts
    /* BGM 起播（spec §6.2）：未解锁时只记「想要」，首次手势 `unlock()` 时随解锁一起起播 */
    audio.startBgm();
```

`mountHud(...)` 的回调**首行**（在 `if (fx.busy()) fx.skip();` **之前**）插入：

```ts
    hud = mountHud(document.body, game, (a: HudActionId) => {
      /* 静音键（spec §7.4）：翻转 → 落库 → 立即重画图标；不跳动画、不推进状态 */
      if (a === 'audio:sfx' || a === 'audio:bgm') {
        audio.toggle(a === 'audio:sfx' ? 'sfx' : 'bgm');
        paint();
        return;
      }
      if (fx.busy()) fx.skip();   // 点屏加速：状态早已落库，跳过只影响观感时长
```

**(j) `stepOfHud` 的参数类型排除两枚静音键**（`HudActionId` 已扩、必须同步，否则 TS 报「`audio:sfx` 不能赋给 `AiStep`」）：

```ts
  /** HUD 点击 → AiStep（`ai:fast` / `ai:skip` / `audio:*` 已在回调里拦截，不会传到这里） */
  const stepOfHud = (
    a: Exclude<HudActionId, 'ai:fast' | 'ai:skip' | 'audio:sfx' | 'audio:bgm'>,
  ): AiStep => (a === 'buy' ? { kind: 'buy' } : a === 'upgrade' ? { kind: 'upgrade' } : { kind: a });
```

**(k) `__monoMain` 暴露引擎**（调试 / 闸门用；在 `seats, aiDriver: driver, hudSeats: () => seats,` 一行前面加 `audio,`）：

```ts
  (window as unknown as Record<string, unknown>).__monoMain = {
    stage, scene, opts, geo, skin, missingAssets, game, paint, sim, fx, fxPreview, perf, shops, VERSION,
    audio, seats, aiDriver: driver, hudSeats: () => seats,
    tutorial: () => tutorial, mountTutorial: replayTour,
  };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/smoke.spec.ts`
Expected: PASS — 6 例全绿。

- [ ] **Step 5: 全量校验**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: 全部绿、无 TS 输出、lint 0 错。

- [ ] **Step 6: 本地手测（可选但推荐）**

Run: `npm run dev` → 浏览器打开 `http://127.0.0.1:52300/mono.html?humans=1&tour=0`
Expected: 顶部右侧出现两枚 26×26 图标；点「开始 / 掷骰」后有骰子抖动音与 BGM；DevTools **Network 面板无任何音频请求**（默认皮肤零素材）。

- [ ] **Step 7: 提交**

```bash
git add monopoly/src/main.ts monopoly/test/smoke.spec.ts
git commit -m "feat(mono): 接线音频引擎（手势解锁 / 与 fx 同刻发声 / 静音键 / ?audio=0 / BGM 起停）"
```

---

## Task 9: 闸门 + 操作手册 + 手机截图（交付三件套）

**Files:**
- Modify: `local/mono-prod-check.mjs`
- Modify: `local/mono-e2e-playthrough.mjs`
- Modify: `docs/manual-mono.md`
- Create: `docs/verify/mono-prod-05-audio-on.png`、`docs/verify/mono-prod-06-audio-off.png`

> 截图命名以本节为准（`mono-prod-05-audio-on.png` / `mono-prod-06-audio-off.png`）——
> 本文开头「文件结构」表里的 `docs/verify/mono-audio-*.png` 一行作废。

- [ ] **Step 1: `local/mono-prod-check.mjs` 增音频 stub 与 gate**

在 `const attach = (page) => { … };` **之后**加 stub（供 `addInitScript` 注入；`decodeAudioData` 恒 reject 也无妨，默认皮肤全 proc）：

```js
/* 记录「有没有真的发出声音」的 AudioContext 替身（只记次数，不产生声波） */
const audioStub = () => {
  window.__audioCtxCount = 0;
  window.__audioStarts = 0;
  const param = () => ({
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
  });
  const node = () => ({ connect() {}, disconnect() {} });
  class AudioContextStub {
    constructor() {
      window.__audioCtxCount += 1;
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = {};
    }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() { return { ...node(), gain: param() }; }
    createOscillator() {
      return { ...node(), type: '', frequency: param(), start() { window.__audioStarts += 1; }, stop() {} };
    }
    createBufferSource() {
      return { ...node(), buffer: null, start() { window.__audioStarts += 1; }, stop() {} };
    }
    createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
    decodeAudioData() { return Promise.resolve({}); }
  }
  window.AudioContext = AudioContextStub;
};
```

在 `/* 7) 无报错 + 汇总 */` **之前**插入：

```js
/* 8) M11 音频（spec §10.3）：真实手势解锁 / 音效发声 / 静音键语义 / `?audio=0` 不建 ctx */
const audioPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(audioPage);
await audioPage.addInitScript(audioStub);
await audioPage.goto(`${ORIGIN}/mono.html?play=1&seed=20260928&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
await audioPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

facts.audioBefore = await audioPage.evaluate(() => window.__audioCtxCount);
gate.audioLazy = facts.audioBefore === 0;                 // boot 不建 AudioContext（spec §9）

/* 8a) 真实鼠标点击「掷骰」→ pointerdown 解锁 → 单实例 ctx + 真实发声 + 开态图标 */
await audioPage.locator('#mono-hud button[data-primary]').click();
await audioPage.waitForTimeout(150);
facts.audio = await audioPage.evaluate(() => ({
  ctxCount: window.__audioCtxCount,
  starts: window.__audioStarts,
  prefs: window.__monoMain.audio.prefs(),
  icons: window.__monoMain.scene.instancesOf().filter((i) => i.id.startsWith('ui.sound.')).map((i) => i.id),
}));
gate.audioUnlock = facts.audio.ctxCount === 1;
gate.audioPlay = facts.audio.starts > 0;
gate.audioPrefsDefault = facts.audio.prefs.sfx === true && facts.audio.prefs.bgm === true;
gate.audioIconsOn = facts.audio.icons.join(',') === 'ui.sound.on';

await audioPage.screenshot({ path: `${OUT}/mono-prod-05-audio-on.png` });

/* 8b) 点喇叭键 → 图标转「关」态、此后 play() 无声、落库 */
facts.audioMute = await audioPage.evaluate(() => {
  const m = window.__monoMain;
  document.querySelector('#mono-hud button[data-action="audio:sfx"]').click();
  const n0 = window.__audioStarts;
  m.audio.play('rent');
  return {
    off: m.audio.prefs().sfx === false,
    muted: window.__audioStarts === n0,
    stored: window.localStorage.getItem('mono.audio'),
    icons: m.scene.instancesOf().filter((i) => i.id.startsWith('ui.sound.')).map((i) => i.id),
  };
});
gate.audioMute = facts.audioMute.off && facts.audioMute.muted
  && facts.audioMute.stored === '{"sfx":false,"bgm":true}'
  && facts.audioMute.icons.join(',') === 'ui.sound.off';

await audioPage.screenshot({ path: `${OUT}/mono-prod-06-audio-off.png` });

/* 8c) 点回 → 图标转「开」态 + 恢复发声（含一声 `ui` 确认音） */
facts.audioResume = await audioPage.evaluate(() => {
  const m = window.__monoMain;
  const n0 = window.__audioStarts;
  document.querySelector('#mono-hud button[data-action="audio:sfx"]').click();
  return { on: m.audio.prefs().sfx === true, resumed: window.__audioStarts > n0 };
});
gate.audioResume = facts.audioResume.on && facts.audioResume.resumed;

/* 8d) 两枚静音键在命中层常驻（结算后仍在，spec §7.2 的早退坑回归） */
facts.audioKeys = await audioPage.evaluate(() => {
  const count = () => document.querySelectorAll('#mono-hud button[data-action^="audio:"]').length;
  const before = count();
  window.__monoMain.sim();
  return { before, afterOver: count() };
});
gate.audioKeys = facts.audioKeys.before === 2 && facts.audioKeys.afterOver === 2;
await audioPage.close();

/* 8e) `?audio=0`：全静音且**不创建** AudioContext（spec §8.2 / §12） */
const mutePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(mutePage);
await mutePage.addInitScript(audioStub);
await mutePage.goto(`${ORIGIN}/mono.html?audio=0&play=1&seed=20260928&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
await mutePage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
await mutePage.locator('#mono-hud button[data-primary]').click();
await mutePage.evaluate(() => window.__monoMain.audio.startBgm());
await mutePage.waitForTimeout(80);
facts.audioForceMute = await mutePage.evaluate(() => ({
  ctxCount: window.__audioCtxCount, starts: window.__audioStarts, prefs: window.__monoMain.audio.prefs(),
}));
gate.audioForceMute = facts.audioForceMute.ctxCount === 0
  && facts.audioForceMute.starts === 0
  && facts.audioForceMute.prefs.sfx === false && facts.audioForceMute.prefs.bgm === false;
await mutePage.close();
```

并把 `facts.screenshots` 数组补两项：

```js
  `${OUT}/mono-prod-05-audio-on.png`,
  `${OUT}/mono-prod-06-audio-off.png`,
```

- [ ] **Step 2: `local/mono-e2e-playthrough.mjs` 增音频 gate**

(a) `readState()` 的返回对象里追加一行（在 `cardDoubleRentEnabled` **之前**）：

```js
    audioKeys: document.querySelectorAll('#mono-hud button[data-action^="audio:"]').length,
```

(b) 主循环里跟踪「全程最小值」——`let s = await readState();` **之后**加：

```js
  facts.minAudioKeys = s.audioKeys;
```

并在 `s = next;` **之后**加：

```js
    facts.minAudioKeys = Math.min(facts.minAudioKeys, s.audioKeys);
```

(c) gate 区（`gate.used_trade = used.trade === true;` **之后**）加：

```js
  gate.audio_keys = facts.minAudioKeys === 2;   // 静音键在每一阶段（含 over 结算）都常驻命中层
```

(d) AI 局：`await aiPage.waitForFunction(() => Boolean(window.__monoMain?.game), …, { timeout: 20000 });` **之后**加：

```js
  facts.aiAudioKeys = await aiPage.evaluate(
    () => document.querySelectorAll('#mono-hud button[data-action^="audio:"]').length,
  );
  gate.ai_audio_keys = facts.aiAudioKeys === 2;   // AI 回合图标不被 `if (aiSeat)` 早退吞掉
```

(e) 摘要 `console.log` 里 `clicks: facts.clicks,` **之后**加一行：

```js
  minAudioKeys: facts.minAudioKeys,
  aiAudioKeys: facts.aiAudioKeys ?? null,
```

- [ ] **Step 3: 本地全量校验**

Run（`cwd=d:\zhao\monopoly`）: `npm run check && npx tsc --noEmit`
Expected:
```
registry-ids.json: 237 ids
[skin:default] OK
[skin:photo] OK
```
+ 全部测试文件绿、TS 无输出、lint 0 错。

- [ ] **Step 4: 本地 preview 自测两个闸门脚本（先本地后线上，快速定位）**

Run（终端 A）: `npm run preview`
Run（终端 B）: `$env:MONO_ORIGIN='http://127.0.0.1:52300'; node local/mono-prod-check.mjs`
Expected: 退出码 `0`、`gate` 全 `true`（含 `audioLazy` / `audioUnlock` / `audioPlay` / `audioPrefsDefault` / `audioIconsOn` / `audioMute` / `audioResume` / `audioKeys` / `audioForceMute`）、`errors=[]`。

Run（终端 B）: `$env:MONO_ORIGIN='http://127.0.0.1:52300'; node local/mono-e2e-playthrough.mjs`
Expected: 退出码 `0`、`gate` 全 `true`（含 `audio_keys` / `ai_audio_keys`）、`errors=[]`。

- [ ] **Step 5: 提交**

```bash
git add monopoly/local/mono-prod-check.mjs monopoly/local/mono-e2e-playthrough.mjs
git commit -m "test(mono): 音频闸门（本地/线上）——解锁单实例、静音键语义、?audio=0、命中层常驻"
```

- [ ] **Step 6: 部署（本地构建 → scp → 服务器只解压）**

Run（`cwd=d:\zhao`）: `node d:\zhao\scripts\deploy-mono.mjs`
Expected: 七步契约全过（本地 `npm run build` → tar 整包 → scp → 服务器解压 + `pm2 restart` → 字节数校验）；
**绝不在服务器构建**（服务器内存不足会失败）。

- [ ] **Step 7: 线上回归两个脚本**

Run（`cwd=d:\zhao\monopoly`）: `node local/mono-prod-check.mjs`
Expected: 退出码 `0`、全 gate `true`、`errors=[]`；`docs/verify/mono-prod-05-audio-on.png` 与 `-06-audio-off.png` 落盘。

Run（`cwd=d:\zhao\monopoly`）: `node local/mono-e2e-playthrough.mjs`
Expected: 退出码 `0`、全 gate `true`（含 `audio_keys` / `ai_audio_keys`）、`errors=[]`。

- [ ] **Step 8: 手册补 `### M11 音效与音乐` + URL 参数行 + 验收行**

(a) `docs/manual-mono.md` 第 13 行的 URL 参数行，在 `?perf=1（性能覆盖层 + 帧间隔采样）` 之后插入：

```
· `?audio=0`（一键全静音：开关初始全关且不创建 `AudioContext`）
```

(b) 在 `### M10 新手引导（四步蒙层）` 小节**之后**、`### 最终验收（对照 spec §11 硬性标准）` **之前**插入：

```markdown
### M11 音效与音乐

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M11-1 | 手机打开 `mono.html?humans=1&tour=0`，点「掷骰」 | 有骰子抖动音；顶部右侧出现两枚 26×26 图标（喇叭 / 音符），均为「开」态（亮色） | `mono-prod-05-audio-on.png` |
| M11-2 | 点右侧喇叭键 | 图标转「关」态（压暗 + 45° 斜杠），此后动作无声；`localStorage['mono.audio'] === '{"sfx":false,"bgm":true}'` | `mono-prod-06-audio-off.png` |
| M11-3 | 再点一次喇叭键 | 图标回「开」态，并补一声确认音（`ui` cue） | — |
| M11-4 | 点音符键 | BGM 立即停；再点恢复循环（4 小节 Am–F–C–G，整段 8s） | — |
| M11-5 | 刷新页面 | 两枚图标的开 / 关与刷新前一致（`mono.audio` 持久化；坏 JSON / 缺字段一律按「开」） | — |
| M11-6 | AI 回合（`?humans=1`）与结算后（`state.over === true`） | 两枚图标仍在且可点（`hitAreas` 的 `over` 早退与 AI 分支均不吞键）；BGM 在 `over` 后停止 | — |
| M11-7 | `mono.html?audio=0` | 全程静音，且 `window.__audioCtxCount === 0`（**不创建** `AudioContext`） | — |
| M11-8 | 默认皮肤对局，DevTools Network 面板 | **无任何音频请求**（默认皮肤零素材，全部 Web Audio 程序化合成） | — |
| M11-9 | `mono.html?nofx=1` | 音效静音、BGM 照旧（`?nofx` 语义是「无演出」不是「无氛围」） | — |

**实现口径**：音效挂在唯一出画口 `runAction` 的 `fx.play` 对偶位置（`if (!ctx) return;` 守卫之后）——AI 与真人天然共用、买地/升级失败（无 fx）不出声；`aiDriver.skipRest()`（`withFx=false`）连带静音；`?nofx` 由 `sfxOn = !opts.nofx` 显式守卫静音。键位常量在 `src/skin/layout.ts`（`AUDIO_KEY_SIZE` / `AUDIO_SFX_BOX` / `AUDIO_BGM_BOX` / `AUDIO_VOL_*` / `AUDIO_BGM_*`），可见像素是 4 个 proc preset（`uiSoundOn/Off`、`uiMusicOn/Off`）可整包换素材；开关落 `localStorage['mono.audio']`。
```

(c) `### 最终验收` 表：在第 9 行之后追加第 10 行——

```markdown
| 10 | **M11 音效与音乐（本任务新增，超出 spec §11）** | `npm run check` 全绿 / `registry-ids.json: 237 ids` / `npx tsc --noEmit` 无错；线上 `mono-prod-check.mjs` 9 项音频 gate（`audioLazy` 懒建 ctx / `audioUnlock` 单实例 / `audioPlay` 真实发声 / `audioPrefsDefault` / `audioIconsOn` / `audioMute` 静音后无声 + 落库 / `audioResume` 点回恢复 / `audioKeys` 结算后常驻 / `audioForceMute` `?audio=0` 不建 ctx）、`mono-e2e-playthrough.mjs` 新增 `audio_keys` + `ai_audio_keys`；2 张 390×844 @dpr2 截图（`mono-prod-05-audio-on` / `06-audio-off`）；默认皮肤零音频网络请求 |
```

(d) 第 2 行「`src/core` + `src/skin` 单测全覆盖」的证据单元格末尾追加一句：

```
；M11 新增 `test/data/audio.spec.ts` 6 例 + `test/ui/audio.spec.ts` 19 例 + `test/render/proc-audio.spec.ts` 6 例 + `test/ui/hud.spec.ts` 增 4 例 + `test/smoke.spec.ts` 增 1 例
```

(e) 第 1 行（手机视口截图）的证据单元格末尾追加：

```
；M11 新增 `mono-prod-05-audio-on` / `mono-prod-06-audio-off`
```

- [ ] **Step 9: 提交（收尾，一气呵成）**

```bash
git add monopoly/docs/manual-mono.md monopoly/docs/verify/mono-prod-05-audio-on.png monopoly/docs/verify/mono-prod-06-audio-off.png
git commit -m "docs(mono): 操作手册新增 M11 音效与音乐（含开/关两态手机截图）"
git push origin master
```

---

## Self-Review（写完计划后对照 spec 自查）

**1. Spec 覆盖检查**

| spec 章节 | 覆盖它的 Task |
|---|---|
| §3 模块边界与数据流（`data/audio` + `ui/audio` + `render/providers/proc-audio`） | Task 1 / 3 / 4 / 5 |
| §4.1 音源双轨制类型（`SoundProviderKind` / `SoundSpec` / `SoundPack` / `SkinPack.sound?`） | Task 2 |
| §4.2 `loadSkin` 无需改动 | 不改动（`skinLoader.ts` 已透传 `sound`）；Task 6 的 `lint:skin` 覆盖校验 |
| §4.3 回退链（file → proc → 内建默认；坏数据静默降级） | Task 3 `resolveSound` + Task 4 `loadTrack`/`play` |
| §4.4 音频文件不走 `preloadSkinAssets` | 已列入「不改」清单；Task 4 解锁后异步 `loadBuffer`；Task 9 `M11-8` 断言零音频请求 |
| §5.1 cue 集合 = 既有枚举 + `ui` | Task 1（测试锁 9 个 `FxKind` + `ui`） |
| §5.2 cue → 默认音色 / 调音表 | Task 1 `VOICES` / `DEFAULT_SFX` |
| §5.3 触发点 = `runAction` 内与 `fx.play` 同刻 | Task 8 Step 3 (g)（+ 顶部第四处澄清处理 `?nofx`） |
| §6.1 BGM 单段循环 / lookahead 排程 | Task 1 `BGM_PROGRESSION` + Task 2 `AUDIO_BGM_*` + Task 4 `scheduleBars` |
| §6.2 生命周期（`startGame` 起播 / `over` 停播 / 与 `withFx` 无关） | Task 8 Step 3 (h)(i) |
| §7.1 键位常量 | Task 2 Step 4 |
| §7.2 命中层常驻 + 两处早退坑 | Task 7 Step 1 / Step 3 (f) |
| §7.3 可见像素 = proc preset + 4 个注册 id（233 → 237） | Task 5 + Task 6 + Task 7 Step 3 (c)(d)(e) |
| §7.4 点击行为（翻转 / 落库 / 重画 / 取消静音补 `ui` 音） | Task 4 `toggle` + Task 8 Step 3 (i) |
| §8.1 常量清单 | Task 2 Step 4 |
| §8.2 音量 / `mono.audio` 持久化 / `?nofx` / `?audio=0` | Task 3 `readPrefs`/`writePrefs` + Task 8 Step 3 (c)(e)(g) |
| §9 自动播放解锁（不在 boot 建 ctx / 首次 `pointerdown` capture+once / 未解锁丢弃 / iOS 单实例） | Task 4 `unlock` + Task 8 Step 3 (e) + Task 9 `audioLazy`/`audioUnlock` |
| §10.1 纯函数用例 | Task 1 / Task 3 |
| §10.2 注入式引擎用例（含 `missing` 记录、BGM 排程推进） | Task 4 |
| §10.3 交付三件套（check / deploy / 线上两脚本 + 截图补手册） | Task 9 |
| §12 验收清单 11 条 | 上表逐条已落；剩余「真机 / 微信内」类人工项按仓库惯例保留人工勾选 |

**无缺口**：spec 每一节都能指到具体 Task；spec 中未实现于代码的 `missingAudio` 命名在计划里统一为 `AudioEngine.missing()`（与既有 `missingAssets` 同规），Task 4 测试已锁。

**2. 占位符扫描**：全计划已无 `TBD` / `TODO` / 「类似 Task N」/「补充错误处理」类措辞。唯一一处「先写后修」编排是 Task 5 Step 3 的 `width: G(params, 'iconInk') ? 2 : 2`（故意标注的占位），Step 4 给出确切替换代码（`AUDIO_D.waveW: 2` + `G(params, 'waveW')`）——这是为了让 `check-hardcoded` 一次性通过而写明的两步，非未决占位。

**3. 类型与签名一致性**（跨 Task 复核）：

| 名字 | 定义处 | 使用处 | 一致 |
|---|---|---|---|
| `SfxKind`（10 元）/ `SFX_KINDS` | Task 1 | Task 3 `resolveSound` / `sfxFor`、Task 4 `play(kind)`、Task 8 `audio.play(ctx.kind)` | ✅ |
| `SoundPack` / `SoundSpec` / `ProcSoundSpec` / `FileSoundSpec` | Task 2 | Task 3 `cleanSpec`/`resolveSound`、Task 4 `applySound`、Task 8 `audio.applySound(skin.sound)` | ✅ |
| `resolveSound(pack)` 返回 `{ sfx, bgm, volSfx, volBgm }` | Task 3 | Task 4 `table.volSfx` / `table.volBgm` / `table.sfx[kind]` / `table.bgm` | ✅ |
| `PREFS_KEY` / `readPrefs` / `writePrefs` / `togglePrefs` / `AudioPrefs` / `AudioPrefKey` | Task 3 | Task 4 `createAudioEngine`、Task 9 断言 `mono.audio` 字面量 | ✅ |
| `bgmLoopSeconds()` | Task 3 | Task 3 测试（`AUDIO_BGM_BARS × AUDIO_BGM_BEATS_PER_BAR × AUDIO_BGM_BEAT_MS / 1000`） | ✅ |
| `AudioEngine` 方法集（`applySound` / `unlock` / `play` / `toggle` / `prefs` / `isUnlocked` / `startBgm` / `stopBgm` / `missing` / `destroy`） | Task 4 | Task 8 (e)(g)(h)(i)、Task 9 `m.audio.prefs()`/`play`/`startBgm` | ✅ |
| `AUDIO_KEY_SIZE` / `AUDIO_SFX_BOX` / `AUDIO_BGM_BOX` | Task 2 Step 4 | Task 6 Step 1（registry）、Task 7（Hud.ts + hud.spec）、Task 9 手册 | ✅ |
| `AUDIO_D`（含 `iconInk`/`iconInkOff`/`slashInk`/`waveW`/…） | Task 5 Step 3-4 | Task 5 测试 `AUDIO_D.iconInk` 等 | ✅ |
| `hudSpecs(state, fxBusy, seats, fast, audio)` 第 5 参 | Task 7 Step 3 (c) | Task 8 Step 3 (f)（传 `audio.prefs()`）、Task 7 测试 | ✅ |
| `HudActionId` 增 `'audio:sfx' \| 'audio:bgm'` | Task 7 Step 3 (b) | Task 7 测试、Task 8 Step 3 (i)(j) | ✅ |
| `ProcPreset` 名 `uiSoundOn/uiSoundOff/uiMusicOn/uiMusicOff` | Task 5 | Task 5 Step 5（`PROC_PRESETS`）、Task 6（`skin.json` 的 `preset` 字段） | ✅ |
| `AudioContextStub` 计数器 `__audioCtxCount` / `__audioStarts` | Task 9 Step 1 | Task 9 Step 1/8（手册 M11-7） | ✅ |
| `gate` 名（`audioLazy`/`audioUnlock`/`audioPlay`/`audioPrefsDefault`/`audioIconsOn`/`audioMute`/`audioResume`/`audioKeys`/`audioForceMute`；`audio_keys`/`ai_audio_keys`） | Task 9 Step 1-2 | Task 9 Step 4/7/8（手册验收行） | ✅ |

已 inline 修复的两处不一致：
① Task 7 的 `r = 13/14` 与「提到 `if (aiSeat)` 之前推入」冲突 → 改为**两处出口各推一次**（Step 3 (c)(d)(e) 并附理由）。
② `?nofx` 在现仓库并不改走 `withFx=false` → 新增 Task 8 顶部「第四处澄清」+ `sfxOn = !opts.nofx` 显式守卫（Step 3 (e)(g)）。

---

## Execution Handoff（计划完成，请选择执行方式）

Plan complete and saved to `docs/superpowers/plans/2026-09-30-monopoly-audio.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**