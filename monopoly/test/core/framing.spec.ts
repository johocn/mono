import { describe, it, expect } from 'vitest';
import { bboxOf, bboxUnion, frameFor, choreography, type Cell } from '../../src/core/framing';
import { BOARD_COLS, BOARD_ROWS, ringPath } from '../../src/data/board';
import { ipos } from '../../src/render/iso';
import {
  CAM_DEGRADE_EPS, CAM_FOLLOW_ZOOM, CAM_MAX_ZOOM, CAM_MIN_ZOOM, CAM_TILE_PAD,
  CAM_VIEW_CX, CAM_VIEW_CY, CAM_VIEW_H, CAM_VIEW_W, DEFAULT_GEO,
} from '../../src/skin/layout';

/** 与线上同源的一整套口径（spec §3.4）：视口 = CAM_VIEW_*，倍率 = CAM_MIN/MAX/FOLLOW，外扩 = CAM_TILE_PAD */
const VIEW = { w: CAM_VIEW_W, h: CAM_VIEW_H, cx: CAM_VIEW_CX, cy: CAM_VIEW_CY };
const OPTS = { min: CAM_MIN_ZOOM, max: CAM_MAX_ZOOM, follow: CAM_FOLLOW_ZOOM, pad: CAM_TILE_PAD };
const RING = ringPath(BOARD_COLS, BOARD_ROWS);
const FOLLOW = Math.min(Math.max(CAM_FOLLOW_ZOOM, CAM_MIN_ZOOM), CAM_MAX_ZOOM);

/** 环上前 n 格（沿底边向右推进，n ≥ 11 起跨第一个拐角） */
const prefix = (n: number): Cell[] => RING.slice(0, n) as Cell[];

describe('framing.bboxOf / bboxUnion（spec §5.1）', () => {
  it('单格：格心 + 半个格足（等腰菱形）外扩 padCells 格', () => {
    const [cx, cy] = ipos(3, 5, DEFAULT_GEO);
    const b = bboxOf([[3, 5]], 1, DEFAULT_GEO);
    const padX = DEFAULT_GEO.hw * 2;
    const padY = DEFAULT_GEO.hh * 2;
    expect(b).toEqual({ minX: cx - padX, minY: cy - padY, maxX: cx + padX, maxY: cy + padY });
  });

  it('padCells = 0 时仍留半个格足（格子本身必须完整入框）', () => {
    const [cx, cy] = ipos(7, 2, DEFAULT_GEO);
    const b = bboxOf([[7, 2]], 0, DEFAULT_GEO);
    expect(b.maxX - b.minX).toBeCloseTo(DEFAULT_GEO.hw * 2, 6);
    expect(b.maxY - b.minY).toBeCloseTo(DEFAULT_GEO.hh * 2, 6);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(cx, 6);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(cy, 6);
  });

  it('空序列 → 零盒（调用方按恒等位姿处理）', () => {
    expect(bboxOf([], 1, DEFAULT_GEO)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('包围盒覆盖全部格心（跨拐角时必须用并集，不能只连首尾）', () => {
    const cells = prefix(16);   // 跨底边 → 右边拐角
    const b = bboxOf(cells, 1, DEFAULT_GEO);
    for (const [c, r] of cells) {
      const [x, y] = ipos(c, r, DEFAULT_GEO);
      expect(x).toBeGreaterThanOrEqual(b.minX);
      expect(x).toBeLessThanOrEqual(b.maxX);
      expect(y).toBeGreaterThanOrEqual(b.minY);
      expect(y).toBeLessThanOrEqual(b.maxY);
    }
    /* 反证：仅取首尾两格的盒子装不下整条路径（拐角处单轴反向） */
    const ends = bboxOf([cells[0], cells[cells.length - 1]], 1, DEFAULT_GEO);
    const wider = b.maxX - b.minX > ends.maxX - ends.minX || b.maxY - b.minY > ends.maxY - ends.minY;
    expect(wider).toBe(true);
  });

  it('bboxUnion 取逐轴最值', () => {
    const a = { minX: -5, minY: 2, maxX: 10, maxY: 20 };
    const b = { minX: -1, minY: -8, maxX: 30, maxY: 5 };
    expect(bboxUnion(a, b)).toEqual({ minX: -5, minY: -8, maxX: 30, maxY: 20 });
  });
});

describe('framing.frameFor（spec §5.1）', () => {
  it('目标中心 = bbox 中心；倍率夹在 [min, max]', () => {
    const p = frameFor({ minX: 100, minY: 200, maxX: 300, maxY: 400 }, VIEW, CAM_MIN_ZOOM, CAM_MAX_ZOOM);
    expect(p.cx).toBe(200);
    expect(p.cy).toBe(300);
    expect(p.zoom).toBeLessThanOrEqual(CAM_MAX_ZOOM);
    expect(p.zoom).toBeGreaterThanOrEqual(CAM_MIN_ZOOM);
  });

  it('小盒 → 顶到 max（不会无限放大）', () => {
    const p = frameFor({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, VIEW, CAM_MIN_ZOOM, CAM_MAX_ZOOM);
    expect(p.zoom).toBe(CAM_MAX_ZOOM);
  });

  it('大盒 → 落回 min（不会比全景还远）', () => {
    const p = frameFor({ minX: -5000, minY: -5000, maxX: 5000, maxY: 5000 }, VIEW, CAM_MIN_ZOOM, CAM_MAX_ZOOM);
    expect(p.zoom).toBe(CAM_MIN_ZOOM);
  });

  it('零宽/零高盒不产生 Infinity（分母保底 1）', () => {
    const p = frameFor({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, VIEW, CAM_MIN_ZOOM, CAM_MAX_ZOOM);
    expect(Number.isFinite(p.zoom)).toBe(true);
    expect(p.zoom).toBe(CAM_MAX_ZOOM);
  });
});

describe('framing.choreography（spec §3.2 三段编排 + 退化规则）', () => {
  it('空序列 → 单帧恒等位姿', () => {
    const keys = choreography([], DEFAULT_GEO, VIEW, OPTS);
    expect(keys).toEqual([{ at: 0, pose: { cx: VIEW.cx, cy: VIEW.cy, zoom: 1 } }]);
  });

  it('关键帧时间轴：首 0 / 末 1 / 单调不减 / 全在 [0,1]', () => {
    for (const n of [1, 2, 6, 8, 9, 16, 32]) {
      const keys = choreography(prefix(n), DEFAULT_GEO, VIEW, OPTS);
      expect(keys[0].at).toBe(0);
      expect(keys[keys.length - 1].at).toBe(1);
      let prev = -1;
      for (const k of keys) {
        expect(k.at).toBeGreaterThanOrEqual(prev);
        expect(k.at).toBeGreaterThanOrEqual(0);
        expect(k.at).toBeLessThanOrEqual(1);
        prev = k.at;
      }
      /* 第一帧必是恒等（起势或退化的出发点），避免开场跳变 */
      expect(keys[0].pose).toEqual({ cx: VIEW.cx, cy: VIEW.cy, zoom: 1 });
    }
  });

  it('除首帧恒等位姿（zoom = CAM_IDLE_ZOOM）外，倍率都夹在 [min, max]', () => {
    for (const n of [1, 2, 6, 8, 9, 16, 32]) {
      const keys = choreography(prefix(n), DEFAULT_GEO, VIEW, OPTS);
      for (const k of keys.slice(1)) {
        expect(k.pose.zoom).toBeGreaterThanOrEqual(CAM_MIN_ZOOM);
        expect(k.pose.zoom).toBeLessThanOrEqual(CAM_MAX_ZOOM);
      }
    }
  });

  it('退化阈值：≤ 8 格走 ① 起势（n+2 帧）；≥ 9 格跳过 ①（n+2 帧但无非跟拍帧）', () => {
    /* 非退化：1 恒等 + 1 起势 + (n−1) 跟拍 + 1 落点 = n + 2 */
    for (const n of [1, 2, 6, 8]) {
      const keys = choreography(prefix(n), DEFAULT_GEO, VIEW, OPTS);
      expect(keys.length).toBe(n + 2);
      expect(keys.filter((k) => Math.abs(k.pose.zoom - FOLLOW) < 1e-9).length).toBe(Math.max(n - 1, 0));
    }
    /* 退化：1 恒等 + n 跟拍 + 1 落点 = n + 2（帧数相同，但跟拍帧多 1、无 380ms 起势帧） */
    for (const n of [9, 16, 32]) {
      const keys = choreography(prefix(n), DEFAULT_GEO, VIEW, OPTS);
      expect(keys.length).toBe(n + 2);
      expect(keys.filter((k) => Math.abs(k.pose.zoom - FOLLOW) < 1e-9).length).toBe(n);
    }
  });

  it('退化判据 = 起势 fit ≤ CAM_MIN_ZOOM + CAM_DEGRADE_EPS（8 格恰好不过线，9 格过线）', () => {
    const fit = (n: number): number => frameFor(bboxOf(prefix(n), OPTS.pad, DEFAULT_GEO), VIEW, OPTS.min, OPTS.max).zoom;
    expect(fit(8)).toBeGreaterThan(CAM_MIN_ZOOM + CAM_DEGRADE_EPS);
    expect(fit(9)).toBeLessThanOrEqual(CAM_MIN_ZOOM + CAM_DEGRADE_EPS);
  });

  it('退化时首帧之后立刻进跟拍（无 380ms 起势帧）：第 2 帧即跟拍倍率', () => {
    const keys = choreography(prefix(9), DEFAULT_GEO, VIEW, OPTS);
    expect(keys[1].pose.zoom).toBeCloseTo(FOLLOW, 9);
  });

  it('跟拍帧 = 逐格格心（与 iso 同源，位置不漂移）', () => {
    const cells = prefix(6);
    const keys = choreography(cells, DEFAULT_GEO, VIEW, OPTS);
    /* 非退化：keys[1] 是起势，keys[2..] 依次为 cell1..cell(n-1) 的格心 */
    for (let i = 1; i < cells.length; i++) {
      const [x, y] = ipos(cells[i][0], cells[i][1], DEFAULT_GEO);
      expect(keys[1 + i].pose.cx).toBeCloseTo(x, 6);
      expect(keys[1 + i].pose.cy).toBeCloseTo(y, 6);
    }
  });

  it('落点取景 = frameFor(落点 ∪ 前 1 ∪ 环上后 1)，兜住落格与前后两格', () => {
    const cells = prefix(5);
    const keys = choreography(cells, DEFAULT_GEO, VIEW, OPTS);
    const last = cells[cells.length - 1];
    const expectPose = frameFor(
      bboxOf([last, cells[cells.length - 2], RING[5] as Cell], OPTS.pad, DEFAULT_GEO),
      VIEW, OPTS.min, OPTS.max,
    );
    const tail = keys[keys.length - 1];
    expect(tail.at).toBe(1);
    expect(tail.pose.cx).toBeCloseTo(expectPose.cx, 6);
    expect(tail.pose.cy).toBeCloseTo(expectPose.cy, 6);
    expect(tail.pose.zoom).toBeCloseTo(expectPose.zoom, 9);
  });
});