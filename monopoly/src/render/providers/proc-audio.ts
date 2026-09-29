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
  wave1X: 0.10, wave2X: 0.22, waveSpan: 0.17, waveInset: 0.25, waveW: 2,
  waveMidX: 0.62, waveOutX: 0.78, waveBackSpan: 0.45, waveBackMid: 0.9,
  /* 关闭斜杠：4 点薄四边形，45° */
  slashDx: 0.36, slashDy: 0.38, slashW: 0.09,
  /* 音符：符头圆 + 符干 + 符尾 */
  noteHeadX: -0.14, noteHeadY: 0.16, noteHeadR: 0.13,
  noteStemX: -0.01, noteStemW: 0.06, noteStemTop: -0.28, noteStemH: 0.46,
  noteFlagX: 0.24, noteFlagY: -0.24, noteFlagH: 0.20, noteFlagSpan: 0.3, noteFlagDrop: 0.2,
});

const G = (p: Record<string, unknown>, k: keyof typeof AUDIO_D): number => num(p, k, AUDIO_D[k] as number);
const S = (p: Record<string, unknown>, k: keyof typeof AUDIO_D): string => str(p, k, AUDIO_D[k] as string);

/** 一道声波：6 点闭合折线（外弧 3 点 + 内返 3 点），无 arc 原语的近似（spec §11 风险 5） */
function wave(cx: number, cy: number, x0: number, span: number, inset: number, p: Record<string, unknown>): number[] {
  const i = span * inset;
  const mid = G(p, 'waveMidX') * span;
  const out = G(p, 'waveOutX') * span;
  const back = G(p, 'waveBackSpan') * span;
  const backMid = G(p, 'waveBackMid') * i;
  return ptsToPoly([
    [cx + x0, cy - span],
    [cx + x0 + mid, cy - span * 0.5],
    [cx + x0 + out, cy],
    [cx + x0 + mid, cy + span * 0.5],
    [cx + x0, cy + span],
    [cx + x0 + i, cy + back],
    [cx + x0 + backMid, cy],
    [cx + x0 + i, cy - back],
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

/** 符尾：3 点小旗（自符干顶端折出） */
function noteFlag(cx: number, cy: number, w: number, p: Record<string, unknown>): number[] {
  const x = G(p, 'noteFlagX');
  const y = G(p, 'noteFlagY');
  const span = x * G(p, 'noteFlagSpan');
  const stem = G(p, 'noteStemW');
  const drop = G(p, 'noteFlagH') * G(p, 'noteFlagDrop');
  return ptsToPoly([
    [cx + x * w, cy + y * w],
    [cx + span * w, cy + (y - drop) * w],
    [cx + (span - stem) * w, cy + y * w],
  ]);
}

/* —— 音效开：喇叭（实心）+ 两道声波（描边） —— */
export const uiSoundOn: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params } = ctx;
  const w = box.w * ctx.s;
  const ink = S(params, 'iconInk');
  g.poly(speaker(cx, cy, w, params)).fill({ color: ink });
  g.poly(wave(cx, cy, G(params, 'wave1X') * w, G(params, 'waveSpan') * w, G(params, 'waveInset'), params))
    .stroke({ color: ink, width: G(params, 'waveW') });
  g.poly(wave(cx, cy, G(params, 'wave2X') * w, G(params, 'waveSpan') * w, G(params, 'waveInset'), params))
    .stroke({ color: ink, width: G(params, 'waveW') });
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
  g.poly(noteFlag(cx, cy, w, params)).fill({ color: ink });
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
  g.poly(noteFlag(cx, cy, w, params)).fill({ color: ink });
  g.poly(slash(cx, cy, G(params, 'slashDx') * w, G(params, 'slashDy') * w, G(params, 'slashW') * w))
    .fill({ color: S(params, 'slashInk') });
};
