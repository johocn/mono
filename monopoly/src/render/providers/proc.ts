import { Graphics } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { Geo } from '../iso';
import { dia } from '../iso';
import { ptsToPoly } from '../paint';
import type { Box, ProviderSpec } from '../../skin/types';
import { fountain } from './proc-fountain';
import { pawn } from './proc-pawn';

/** preset 的文字输出请求（Graphics 画不了旋转文字，统一交给 Scene 落地） */
export interface TextRequest {
  text: string;
  x: number;
  y: number;
  size: number;
  fill: string;
  rotate?: number;                       // 角度（度）
  /** 水平对齐：center（默认，用于店招/灯笼）· left（用于橱窗信息条，x 即左边缘） */
  align?: 'center' | 'left';
}

/** preset 的图片输出请求（Graphics 画不了位图，统一交给 Scene 新建 Sprite 落地） */
export interface SpriteRequest {
  texture: Texture;
  x: number;                              // 锚点所在的舞台绝对坐标
  y: number;
  w: number;                              // 目标宽（= box.w × ctx.s）
  h: number;                              // 目标高（= box.h × ctx.s）
  anchor?: [number, number];              // 0–1，缺省居中 [0.5, 0.5]
  rotate?: number;                        // 角度（度）
}

export interface ProcCtx {
  geo: Geo;
  box: Box;
  cx: number;      // 已含管线 lift 的地面锚点
  cy: number;
  s: number;       // 缩放（1 = 占满一格）
  /** 管线施加的抬升（未乘 s）。preset 用 cy + lift×s 还原宿主楼基座 y0 */
  lift?: number;
  params: Record<string, unknown>;
  state: Record<string, unknown>;
  text?: (req: TextRequest) => void;
  /** 原始 provider 规格（image provider 需从中读 src / anchor） */
  spec?: ProviderSpec;
  /** 素材装载通道（Scene 注入）：包内相对路径 → 已装载纹理；未装载 → null */
  asset?: (rel: string) => Texture | null;
  /** 图片输出通道：与 text 同级的「唯一出图口」 */
  sprite?: (req: SpriteRequest) => void;
}

export type ProcPreset = (g: Graphics, ctx: ProcCtx) => void;

/* 取值器定义在依赖零的 proc-base.ts，此处转出以保持既有 import 路径可用 */
export { num, str, arr, c, fb } from './proc-base';
import { num, str, arr, c } from './proc-base';

/* —— 地砖：菱形填充 + 描边（归属色/类型色/选中高亮；palette 色键优先） —— */
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
    : c(params, 'tileEdge', selected
      ? str(params, 'selectedEdge', str(params, 'edge', '#ffffff'))
      : str(params, 'edge', '#ffffff'));
  const width = selected ? edgeWSel : edgeW;
  g.poly(ptsToPoly(dia(cx, cy, geo.hw * s, geo.hh * s)))
    .fill({ color: c(params, 'tileFill', str(params, 'fill', '#000000')) })
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
    .stroke({ color: c(params, 'tileEdge', str(params, 'edge', '#ffffff')), width: num(params, 'width', 1) });
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

import { barn, gate, market3, onsenHouse, shop, sign, stall } from './proc-building';
import {
  antenna, awning, banner, barrel, chimney, clothesline, flagpole, lamp, lantern,
  lionStone, rooftopBox, signTower, snowPile, steamVent, stoneLantern, tree,
} from './proc-props';
import { showcaseGround, showcaseHud, showcaseMini, showcasePanel, showcaseSky, showcaseSkyline } from './proc-showcase';
import { diceBody, diceFace, uiButton, uiDock, uiLabel, uiPanel, uiPlayerBar } from './proc-hud';
import { uiMusicOff, uiMusicOn, uiSoundOff, uiSoundOn } from './proc-audio';
import {
  uiBadge, uiCard, uiCardBack, uiHandSlot, uiSettleRow, uiStockChart, uiStockRow,
} from './proc-panel';
import { fxCoin, fxDust, fxScaffold, fxShard, fxShine, fxSpark, fxStamp } from './proc-fx';

export const PROC_PRESETS: Record<string, ProcPreset> = {
  tile,
  tileEdge,
  bgGradient,
  solid,
  builtin,
  fountain,
  pawn,
  shop,
  sign,
  stall,
  market3,
  onsenHouse,
  gate,
  barn,
  awning,
  lantern,
  banner,
  rooftopBox,
  signTower,
  antenna,
  tree,
  lamp,
  flagpole,
  chimney,
  barrel,
  lionStone,
  snowPile,
  clothesline,
  steamVent,
  stoneLantern,
  showcasePanel,
  showcaseSky,
  showcaseSkyline,
  showcaseGround,
  showcaseHud,
  showcaseMini,
  uiDock,
  uiPanel,
  uiPlayerBar,
  uiButton,
  uiLabel,
  diceBody,
  diceFace,
  uiHandSlot,
  uiCard,
  uiCardBack,
  uiStockRow,
  uiStockChart,
  uiSettleRow,
  uiSoundOn,
  uiSoundOff,
  uiMusicOn,
  uiMusicOff,
  uiBadge,
  fxCoin,
  fxStamp,
  fxDust,
  fxScaffold,
  fxSpark,
  fxShard,
  fxShine,
};

export function procPreset(name: string): ProcPreset {
  return PROC_PRESETS[name] ?? builtin;
}