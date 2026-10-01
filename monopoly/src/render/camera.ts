/**
 * 相机基座（spec §5.2）：相机是**画布内部容器**的变换（`world.scale/position`），
 * 不是画布自身的变换——`#mono-world` 的页面适配（`fitStage()`）与它互不干涉。
 *
 * 映射公式（spec §2.2）：
 * ```
 * world.scale.set(z);
 * world.position.set(CAM_VIEW_CX − cx·z, CAM_VIEW_CY − cy·z);
 * ```
 * `z = 1, cx = CAM_VIEW_CX, cy = CAM_VIEW_CY` 退化为恒等变换 ⇒ 首屏与改动前逐像素一致。
 *
 * 时轴同源（G6）：`fx.speed()` 的实现是 `gsap.globalTimeline.timeScale()`，
 * 本模块沿用同一份全局时轴，故 `?speed=` / `?nofx=1` 天然同时作用于相机，无需额外联动。
 * 也正因如此，本模块不需要 `Application` 实例（spec §5.2 的 `deps.app` 在本实现中无用途）。
 */
import type { Container } from 'pixi.js';
import { gsap } from 'gsap';
import {
  CAM_BACK_MS, CAM_EASE, CAM_FOLLOW_ZOOM, CAM_IDLE_ZOOM, CAM_VIEW_CX, CAM_VIEW_CY, FX_MS_PER_S,
} from '../skin/layout';
import { ipos, type Geo } from './iso';
import type { CamPose, Cell } from '../core/framing';

export interface CameraHandle {
  /** 补间到目标位姿（ms 为 0 时等价于 snap） */
  to(pose: CamPose, ms: number, ease?: string): void;
  /** 立即到位（`?nofx=1` / prefers-reduced-motion / 跳过时用） */
  snap(pose: CamPose): void;
  /** 归位到恒等（zoom = 1） */
  reset(ms?: number): void;
  /** 跟拍段的折线时间线：沿 cells 逐格推进，倍率恒为 CAM_FOLLOW_ZOOM */
  follow(cells: readonly Cell[], totalMs: number, geo: Geo): void;
  current(): CamPose;
  busy(): boolean;
  /** 与 fx 同一时轴缩放源（`?speed=` / `?nofx=1` 联动） */
  setTimeScale(v: number): void;
  destroy(): void;
}

const IDLE: CamPose = { cx: CAM_VIEW_CX, cy: CAM_VIEW_CY, zoom: CAM_IDLE_ZOOM };

export function createCamera(deps: { world: Container }): CameraHandle {
  const { world } = deps;
  const cur: CamPose = { ...IDLE };

  const apply = (): void => {
    world.scale.set(cur.zoom);
    world.position.set(CAM_VIEW_CX - cur.cx * cur.zoom, CAM_VIEW_CY - cur.cy * cur.zoom);
  };

  let tween: ReturnType<typeof gsap.to> | null = null;
  let line: ReturnType<typeof gsap.timeline> | null = null;

  const killAll = (): void => {
    tween?.kill();
    line?.kill();
    tween = null;
    line = null;
  };

  const snap = (pose: CamPose): void => {
    killAll();
    cur.cx = pose.cx;
    cur.cy = pose.cy;
    cur.zoom = pose.zoom;
    apply();
  };

  const to = (pose: CamPose, ms: number, ease?: string): void => {
    killAll();
    const d = ms / FX_MS_PER_S;
    if (d <= 0) {
      snap(pose);
      return;
    }
    tween = gsap.to(cur, {
      cx: pose.cx, cy: pose.cy, zoom: pose.zoom,
      duration: d, ease: ease ?? CAM_EASE,
      onUpdate: apply,
      onComplete: () => { tween = null; },
    });
  };

  const reset = (ms = CAM_BACK_MS): void => { to(IDLE, ms); };

  const follow = (cells: readonly Cell[], totalMs: number, geo: Geo): void => {
    killAll();
    const n = cells.length;
    if (n === 0) return;
    const dur = totalMs / FX_MS_PER_S;
    const seg = dur / Math.max(n - 1, 1);
    const at = (i: number): { cx: number; cy: number } => {
      const cell = cells[i] ?? cells[n - 1] ?? [0, 0];
      const [x, y] = ipos(cell[0], cell[1], geo);
      return { cx: x, cy: y };
    };
    const tl = gsap.timeline({ onUpdate: apply, onComplete: () => { line = null; } });
    /* 第 1 段：当前位姿 → 首格（顺带把倍率归到 CAM_FOLLOW_ZOOM），其后逐格推进 */
    const first = at(0);
    tl.to(cur, { cx: first.cx, cy: first.cy, zoom: CAM_FOLLOW_ZOOM, duration: seg, ease: CAM_EASE }, 0);
    for (let i = 1; i < n; i++) {
      const p = at(i);
      tl.to(cur, { cx: p.cx, cy: p.cy, duration: seg, ease: CAM_EASE }, seg * i);
    }
    line = tl;
  };

  const busy = (): boolean =>
    (tween !== null && tween.isActive()) || (line !== null && line.isActive());

  apply();   // 初始即恒等变换（首屏零回归）

  return {
    to,
    snap,
    reset,
    follow,
    current: () => ({ ...cur }),
    busy,
    setTimeScale: (v: number) => { gsap.globalTimeline.timeScale(v); },
    destroy: () => { killAll(); },
  };
}