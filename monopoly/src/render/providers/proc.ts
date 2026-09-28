import { Graphics } from 'pixi.js';
import type { Geo } from '../iso';
import { dia } from '../iso';
import { ptsToPoly } from '../paint';

export interface ProcCtx {
  geo: Geo;
  box: { w: number; d: number; h: number };
  cx: number;      // 已含管线 lift 的地面锚点
  cy: number;
  s: number;       // 缩放（1 = 占满一格）
  params: Record<string, unknown>;
  state: Record<string, unknown>;
}

export type ProcPreset = (g: Graphics, ctx: ProcCtx) => void;

type P = Record<string, unknown>;
export const num = (p: P, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
export const str = (p: P, k: string, d: string): string => (typeof p[k] === 'string' ? (p[k] as string) : d);
export const arr = <T>(p: P, k: string): T[] | null => (Array.isArray(p[k]) ? (p[k] as T[]) : null);

/**
 * L4 内建兜底默认值容器（spec §3.6.4）：把一个 preset 的全部几何/色值默认值集中声明一次。
 * 取值器（num/str/arr/n/c/fb）的实参子树是 `no-visual-number` / `no-hardcoded-color` 唯一豁免的位置。
 */
export function fb<T extends Record<string, unknown>>(d: T): T {
  return d;
}

/* —— 地砖：菱形填充 + 描边（归属色/类型色/选中高亮） —— */
const tile: ProcPreset = (g, ctx) => {
  const { cx, cy, geo, params, state } = ctx;
  const s = ctx.s;
  const owner = typeof state.owner === 'number' ? state.owner : null;
  const ownerColors = (state.ownerColors ?? {}) as Record<number, string>;
  const selected = state.selected === true;
  const edgeW = typeof params.edgeW === 'number' ? (params.edgeW as number) : null;
  const edgeWSel = typeof params.edgeWSel === 'number' ? (params.edgeWSel as number) : edgeW;
  const color = owner !== null && ownerColors[owner]
    ? ownerColors[owner]
    : selected
      ? str(params, 'selectedEdge', str(params, 'edge', '#ffffff'))
      : str(params, 'edge', '#ffffff');
  const width = selected ? edgeWSel : edgeW;
  g.poly(ptsToPoly(dia(cx, cy, geo.hw * s, geo.hh * s)))
    .fill({ color: str(params, 'fill', '#000000') })
    .stroke(width === null ? { color } : { color, width });
};

/* —— 地砖内圈高光 / 归属色条 —— */
const tileEdge: ProcPreset = (g, ctx) => {
  const { cx, cy, geo, params } = ctx;
  const s = ctx.s;
  const inset = num(params, 'inset', 1);
  const dy = num(params, 'dy', 0);
  const lift = num(params, 'lift', 0);
  g.poly(ptsToPoly(dia(cx, cy + dy * s, geo.hw * inset * s, geo.hh * inset * s, lift * s)))
    .stroke({ color: str(params, 'edge', '#ffffff'), width: num(params, 'width', 1) });
};

/* —— 背景纵向渐变 —— */
const bgGradient: ProcPreset = (g, ctx) => {
  const { box, params } = ctx;
  g.rect(0, 0, box.w, box.h)
    .fill({ color: str(params, 'bottom', '#000000') });
  const steps = arr<number>(params, 'steps') ?? [];
  const top = str(params, 'top', '#000000');
  const bottom = str(params, 'bottom', '#000000');
  for (const t of steps) {
    const y = box.h * t;
    g.rect(0, y, box.w, box.h * (num(params, 'stepH', 0.25)))
      .fill({ color: t < 0.5 ? top : bottom, alpha: num(params, 'alpha', 0.5) });
  }
};

/** 纯色块 */
const solid: ProcPreset = (g, ctx) => {
  g.rect(0, 0, ctx.box.w, ctx.box.h).fill({ color: str(ctx.params, 'fill', '#ffffff') });
};

/** 内建兜底：纯色块 + 文字（永不空白，spec §3.6.4） */
const builtin: ProcPreset = (g, ctx) => {
  const { box, params } = ctx;
  const color = str(params, 'fill', '#3a4a42');
  g.rect(ctx.cx - box.w / 2, ctx.cy - box.h, box.w, box.h)
    .fill({ color })
    .stroke({ color: str(params, 'edge', '#6b7f76'), width: num(params, 'edgeW', 1) });
};

export const PROC_PRESETS: Record<string, ProcPreset> = {
  tile,
  tileEdge,
  bgGradient,
  solid,
  builtin,
};

export function procPreset(name: string): ProcPreset {
  return PROC_PRESETS[name] ?? builtin;
}