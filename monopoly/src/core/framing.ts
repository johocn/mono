/**
 * 相机取景（spec §5.1）：舞台空间的**纯函数**——不含任何 Pixi / DOM 依赖，可单测。
 *
 * 职责边界：本文件只把「格序列」换算成「位姿序列」，不碰画布（那是 `src/render/camera.ts`）。
 * 所有裸倍率 / 时长统一取自 `src/skin/layout.ts`（本文件虽不在 `check-hardcoded` 的
 * `src/render/**` 作用域内，仍按同一口径归置，避免两套规矩）。
 */
import { BOARD_COLS, BOARD_ROWS, RING_SIZE, ringPath, tileIndexOf } from '../data/board';
import { ipos, type Geo } from '../render/iso';
import {
  CAM_DEGRADE_EPS, CAM_IDLE_ZOOM, CAM_LEAD_MS, CAM_PUSH_MS, CAM_SETTLE_MS, FX_HOP_MS,
} from '../skin/layout';

/** 舞台空间包围盒 */
export interface BBox { minX: number; minY: number; maxX: number; maxY: number }
/** 相机位姿：目标中心（舞台空间）+ 倍率 */
export interface CamPose { cx: number; cy: number; zoom: number }
/** 编排名（插值关键帧）：`at` = 归一化时间 0..1 */
export interface CamKeyframe { at: number; pose: CamPose }
/** 取景视口：尺寸 + 它的中心（`cx/cy` 即相机把目标居中到的舞台落点） */
export interface View { w: number; h: number; cx: number; cy: number }
/** 棋盘格坐标 */
export type Cell = readonly [number, number];

export interface ChoreographyOpts {
  /** 倍率下限（低于即判「退化」） */
  min: number;
  /** 倍率上限 */
  max: number;
  /** 跟拍段固定倍率 */
  follow: number;
  /** 取景外扩格数 */
  pad: number;
}

/** 外圈路径（唯一一份，来自 data/board） */
const RING = ringPath(BOARD_COLS, BOARD_ROWS);

/** 环上下一格（用于落点取景的「后 1 格」）；不在环上时退回自身 */
function nextCell(cell: Cell): Cell {
  const i = tileIndexOf(cell[0], cell[1]);
  if (i < 0) return cell;
  return RING[(i + 1) % RING_SIZE] ?? cell;
}

/**
 * 格序列 → 舞台空间包围盒。格心由 `ipos` 换算，再向外补「半个格足 + padCells 格」，
 * 保证格子本身（菱形足印）完整入框。空序列返回零盒（调用方按恒等位姿处理）。
 */
export function bboxOf(cells: readonly Cell[], padCells: number, geo: Geo): BBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [c, r] of cells) {
    const [x, y] = ipos(c, r, geo);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const padX = geo.hw * (1 + padCells);
  const padY = geo.hh * (1 + padCells);
  return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
}

/**
 * 并集包围盒。路径跨拐角必须用并集——等距环拐角处单轴位移反向，
 * 「首尾连线」会算出一个装不下路径的框。
 */
export function bboxUnion(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** 把 bbox 装进 view，倍率 clamp 到 [min, max]；目标中心 = bbox 中心 */
export function frameFor(b: BBox, view: View, min: number, max: number): CamPose {
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const fit = Math.min(view.w / w, view.h / h);
  return {
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
    zoom: Math.min(Math.max(fit, min), max),
  };
}

/**
 * C 的三段编排（spec §3.2）：
 *
 * ```
 * ① 起势  恒等 → frameFor(整条路径)          introMs
 * ② 跟拍  逐格推进到落点（倍率恒为 follow）   (格数−1) × FX_HOP_MS   ← 与 fx 共时轴，不可压缩
 * ③ 落点  frameFor(落点 ∪ 前1 ∪ 后1)         CAM_SETTLE_MS
 * ```
 *
 * **退化规则**（最重要的一条护栏）：`fit ≤ CAM_MIN_ZOOM + CAM_DEGRADE_EPS` 时（本盘 11×7
 * 几何下即步数 ≥ 9）**跳过 ①**，改由全景恒等位姿在 `CAM_PUSH_MS` 内直接推向 ② 跟拍；
 * 否则 A 式取景会随步数增大把相机拉得比全景还远，出现「越走越远」的反效果。
 *
 * 非 fx 段之和 = `introMs + CAM_SETTLE_MS`（非退化 380+320 / 退化 420+320），
 * 与 `CAM_MAX_TOTAL_MS` 的口径一致（见 spec §3.2：CAM_BACK_MS 属归位段，不在本序列内）。
 */
export function choreography(
  cells: readonly Cell[],
  geo: Geo,
  view: View,
  opts: ChoreographyOpts,
): CamKeyframe[] {
  const idle: CamPose = { cx: view.cx, cy: view.cy, zoom: CAM_IDLE_ZOOM };
  if (cells.length === 0) return [{ at: 0, pose: idle }];   // 防御：空序列 → 恒等位姿

  const lead = frameFor(bboxOf(cells, opts.pad, geo), view, opts.min, opts.max);
  const degraded = lead.zoom <= opts.min + CAM_DEGRADE_EPS;
  const follow = Math.min(Math.max(opts.follow, opts.min), opts.max);
  const introMs = degraded ? CAM_PUSH_MS : CAM_LEAD_MS;
  const stepMs = FX_HOP_MS;
  const followMs = (cells.length - 1) * stepMs;
  const totalMs = introMs + followMs + CAM_SETTLE_MS;
  const at = (ms: number): number => Math.min(Math.max(ms / totalMs, 0), 1);
  const followAt = (i: number): CamPose => {
    const cell = cells[i] ?? cells[cells.length - 1] ?? [0, 0];
    const [x, y] = ipos(cell[0], cell[1], geo);
    return { cx: x, cy: y, zoom: follow };
  };

  const keys: CamKeyframe[] = [{ at: 0, pose: idle }];
  /* ① 起势（退化时跳过）*/
  if (!degraded) keys.push({ at: at(CAM_LEAD_MS), pose: lead });
  /* ② 跟拍：非退化时 cell0 已被 ① 的整条取景覆盖，故从 cell1 起逐格推进 */
  for (let i = degraded ? 0 : 1; i < cells.length; i++) {
    keys.push({ at: at(introMs + i * stepMs), pose: followAt(i) });
  }
  /* ③ 落点 */
  const last = cells[cells.length - 1] ?? [0, 0];
  const prev = cells[cells.length - 2] ?? last;
  const settleBox = bboxOf([prev, last, nextCell(last)], opts.pad, geo);
  keys.push({ at: 1, pose: frameFor(settleBox, view, opts.min, opts.max) });
  return keys;
}