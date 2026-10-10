/**
 * 轻量渲染引擎 — Canvas2D + 等轴 3D 风格
 *
 * 职责：
 * - DPR 自适应缩放 / 尺寸变化通知（Board 依赖它重算布局）
 * - 指针输入（tap + drag，支持鼠标与触摸）
 * - draw-call 队列（按 z 排序，每帧清空）
 * - 屏幕震动（连击/重击反馈）
 *
 * 抽象层：后续可替换为 LayaAir 3D 渲染器
 */

import { safety } from "../core/SafetyManager";

export type TouchHandler = (x: number, y: number) => void;
/** 拖拽回调：起点 → 当前点（主动画布坐标，CSS px） */
export type DragHandler = (x0: number, y0: number, x1: number, y1: number) => void;
/** 连续滚动回调：每次指针移动的增量（屏幕坐标 dy，手指上滑为负） */
export type ScrollHandler = (dx: number, dy: number) => void;
export type ResizeHandler = (w: number, h: number) => void;

/** 把设计稿字号换算为实际字号（应用全局适老化缩放） */
export function fontPx(size: number): number {
  return size * safety.getFontScale();
}

interface DrawCall {
  fn: (ctx: CanvasRenderingContext2D) => void;
  z: number;
  /** 可选裁剪区（滚动列表用，超出部分不绘制） */
  clip?: { x: number; y: number; w: number; h: number };
}

/** 拖动判定阈值（px）：超过即视为滑动手势而非点选 */
const DRAG_THRESHOLD = 22;

export class GameCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private drawCalls: DrawCall[] = [];
  /** 当前裁剪区：设置后，新加入的 draw call 都会被裁剪到该矩形内 */
  private clipRect: { x: number; y: number; w: number; h: number } | null = null;
  private rafCallback: (() => void) | null = null;
  private touchHandler: TouchHandler | null = null;
  private dragHandler: DragHandler | null = null;
  private scrollHandler: ScrollHandler | null = null;
  /**
   * 全局点击拦截器：在场景自身的 touchHandler 之前执行。
   * 返回 true 表示该点击已被消费（如底部导航），场景不再处理。
   */
  private tapInterceptor: ((x: number, y: number) => boolean) | null = null;
  /** 每帧浮层（底部导航等全站常驻 UI），在排序绘制前压入 draw call */
  private overlay: (() => void) | null = null;
  private resizeHandlers: ResizeHandler[] = [];

  // 指针手势状态
  private pressX = 0;
  private pressY = 0;
  private lastMoveX = 0;
  private lastMoveY = 0;
  private pressed = false;
  private dragFired = false;

  // 屏幕震动
  private shakeMag = 0;
  private shakeDur = 0;
  private shakeLeft = 0;

  private lastFrameTime = 0;

  constructor(canvasId: string = "GameCanvas") {
    // roundRect polyfill（部分旧浏览器不支持）
    if (!CanvasRenderingContext2D.prototype.roundRect) {
      CanvasRenderingContext2D.prototype.roundRect = function (
        this: CanvasRenderingContext2D,
        x: number, y: number, w: number, h: number, r: number,
      ): void {
        const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
        this.moveTo(x + rr, y);
        this.arcTo(x + w, y, x + w, y + h, rr);
        this.arcTo(x + w, y + h, x, y + h, rr);
        this.arcTo(x, y + h, x, y, rr);
        this.arcTo(x, y, x + w, y, rr);
        this.closePath();
      };
    }

    let el = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!el) {
      el = document.createElement("canvas");
      el.id = canvasId;
      document.body.appendChild(el);
    }
    this.canvas = el;
    this.ctx = el.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => this.resize());
    this.bindInput();
    this.lastFrameTime = performance.now();
    this.loop();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const cb of this.resizeHandlers) cb(w, h);
  }

  getW(): number { return this.width; }
  getH(): number { return this.height; }

  /** 注册尺寸变化回调，返回取消订阅函数 */
  onResize(cb: ResizeHandler): () => void {
    this.resizeHandlers.push(cb);
    return () => {
      this.resizeHandlers = this.resizeHandlers.filter((h) => h !== cb);
    };
  }

  // === 输入 ===

  private toLocal(e: TouchEvent | MouseEvent | PointerEvent): { x: number; y: number } {
    if (typeof TouchEvent !== "undefined" && e instanceof TouchEvent) {
      const t = e.touches[0] || e.changedTouches[0];
      return { x: t.clientX, y: t.clientY };
    }
    const m = e as MouseEvent;
    return { x: m.clientX, y: m.clientY };
  }

  private bindInput(): void {
    const down = (e: TouchEvent | MouseEvent | PointerEvent) => {
      e.preventDefault();
      const { x, y } = this.toLocal(e);
      this.pressed = true;
      this.dragFired = false;
      this.pressX = x;
      this.pressY = y;
      this.lastMoveX = x;
      this.lastMoveY = y;
      // 全站常驻 UI（底部导航 / 主页按钮）优先：命中则场景不再处理
      if (this.tapInterceptor?.(x, y)) return;
      this.touchHandler?.(x, y);
    };

    const move = (e: TouchEvent | MouseEvent | PointerEvent) => {
      if (!this.pressed) return;
      e.preventDefault();
      const { x, y } = this.toLocal(e);
      // 连续滚动增量：供长列表上下滑动（首页模式卡 / 关卡列表等）
      if (this.scrollHandler) {
        this.scrollHandler(x - this.lastMoveX, y - this.lastMoveY);
        this.lastMoveX = x;
        this.lastMoveY = y;
      }
      if (this.dragFired) return;
      const dx = x - this.pressX;
      const dy = y - this.pressY;
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      this.dragFired = true;
      this.dragHandler?.(this.pressX, this.pressY, x, y);
    };

    const up = () => {
      this.pressed = false;
      this.dragFired = false;
    };

    // 桌面端滚轮：与手指上滑等价，便于 PC 上验证长列表
    this.canvas.addEventListener("wheel", (e: WheelEvent) => {
      if (!this.scrollHandler) return;
      e.preventDefault();
      this.scrollHandler(0, -e.deltaY);
    }, { passive: false });

    const usePointer = typeof window !== "undefined" && "PointerEvent" in window;
    if (usePointer) {
      this.canvas.addEventListener("pointerdown", down as EventListener, { passive: false });
      this.canvas.addEventListener("pointermove", move as EventListener, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    } else {
      this.canvas.addEventListener("touchstart", down as EventListener, { passive: false });
      this.canvas.addEventListener("touchmove", move as EventListener, { passive: false });
      window.addEventListener("touchend", up);
      this.canvas.addEventListener("mousedown", down as EventListener);
      this.canvas.addEventListener("mousemove", move as EventListener);
      window.addEventListener("mouseup", up);
    }

    // 首次交互时解锁 WebAudio（iOS/Safari 要求用户手势内 resume）
    const unlock = () => {
      safety.unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchstart", unlock);
  }

  setTouchHandler(h: TouchHandler | null): void {
    this.touchHandler = h;
    // 传 null 视为「清空全部输入」，避免残留拖拽回调在场景切换后误触发
    if (h === null) {
      this.dragHandler = null;
      this.scrollHandler = null;
    }
  }

  setDragHandler(h: DragHandler | null): void {
    this.dragHandler = h;
  }

  /** 连续滚动（每次指针移动的增量），供长列表上下滑动 */
  setScrollHandler(h: ScrollHandler | null): void {
    this.scrollHandler = h;
  }

  /** 全站点击拦截器（返回 true = 已消费，场景不再收到该点击） */
  setTapInterceptor(h: ((x: number, y: number) => boolean) | null): void {
    this.tapInterceptor = h;
  }

  /** 每帧浮层：底部导航等常驻 UI，无需每个场景各自绘制 */
  setOverlay(fn: (() => void) | null): void {
    this.overlay = fn;
  }

  clearHandlers(): void {
    this.touchHandler = null;
    this.dragHandler = null;
    this.scrollHandler = null;
    this.pressed = false;
    this.dragFired = false;
  }

  // === 绘制 ===

  /** 添加绘制调用（按 z 排序） */
  draw(fn: (ctx: CanvasRenderingContext2D) => void, z: number = 0): void {
    this.drawCalls.push({ fn, z, clip: this.clipRect ?? undefined });
  }

  /**
   * 设置/清除裁剪区（对之后加入的 draw call 生效）。
   * 用于滚动列表：内容绘制前设置可视矩形，绘制完传 null 复原。
   */
  setClip(rect: { x: number; y: number; w: number; h: number } | null): void {
    this.clipRect = rect;
  }

  /** 屏幕震动（连击 / 重击反馈） */
  shake(magnitude: number, duration: number): void {
    if (safety.getEffectMode() === "reduced") return; // 降低动效模式下禁用震动
    if (magnitude <= this.shakeMag && this.shakeLeft > 0) return; // 不覆盖更强的震动
    this.shakeMag = magnitude;
    this.shakeDur = duration;
    this.shakeLeft = duration;
  }

  /** 清屏并按 z 序绘制所有 draw call */
  private render(): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    let ox = 0;
    let oy = 0;
    if (this.shakeLeft > 0 && this.shakeDur > 0) {
      const p = this.shakeLeft / this.shakeDur;
      const m = this.shakeMag * p;
      ox = (Math.random() * 2 - 1) * m;
      oy = (Math.random() * 2 - 1) * m;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 震动时扩大清屏区域，避免边缘残影
    const pad = 48;
    ctx.clearRect(-pad, -pad, this.width + pad * 2, this.height + pad * 2);
    if (ox !== 0 || oy !== 0) ctx.translate(ox, oy);

    this.overlay?.();

    const calls = this.drawCalls;
    calls.sort((a, b) => a.z - b.z);
    for (const dc of calls) {
      if (dc.clip) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(dc.clip.x, dc.clip.y, dc.clip.w, dc.clip.h);
        ctx.clip();
        dc.fn(ctx);
        ctx.restore();
      } else {
        dc.fn(ctx);
      }
    }
    this.drawCalls = [];

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setUpdateCallback(cb: (() => void) | null): void {
    this.rafCallback = cb;
  }

  /** 读取当前触摸回调（广告覆盖层接管后需恢复原场景输入） */
  getTouchHandler(): TouchHandler | null { return this.touchHandler; }
  /** 读取当前更新回调（广告覆盖层接管后需恢复原场景更新） */
  getUpdateCallback(): (() => void) | null { return this.rafCallback; }

  private loop = (): void => {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;
    if (this.shakeLeft > 0) this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    this.rafCallback?.();
    this.render();
    requestAnimationFrame(this.loop);
  };

  // === 绘制工具方法 ===

  drawRoundRect(x: number, y: number, w: number, h: number, r: number, fill: string, z: number = 0): void {
    this.draw((ctx) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    }, z);
  }

  drawText(text: string, x: number, y: number, opts: {
    size?: number; color?: string; align?: CanvasTextAlign; bold?: boolean; font?: string;
  } = {}, z: number = 10): void {
    // 全局适老化字号缩放：一处生效，全站文字同步放大
    const size = fontPx(opts.size ?? 24);
    const color = opts.color ?? "#fff";
    const align = opts.align ?? "center";
    const font = opts.font ?? '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    this.draw((ctx) => {
      ctx.font = `${opts.bold ? "bold " : ""}${size}px ${font}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
    }, z);
  }

  drawCircle(x: number, y: number, r: number, fill: string, z: number = 0): void {
    this.draw((ctx) => {
      if (r <= 0) return;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }, z);
  }

  /** 描边圆角矩形 */
  drawStrokeRect(x: number, y: number, w: number, h: number, r: number, color: string, lineWidth: number, z: number = 0): void {
    this.draw((ctx) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
    }, z);
  }

  /** 呼吸周期 500ms = 2Hz，正好卡在安全上限（修改此值会触发 assertSafeHz 告警） */
  static readonly BREATH_PERIOD_MS = 500;

  /** 安全呼吸灯效果（≤2Hz，降低动效模式下为静态高亮） */
  drawBreathGlow(x: number, y: number, r: number, color: string, time: number, z: number = 0): void {
    safety.assertSafeHz(1000 / GameCanvas.BREATH_PERIOD_MS, "breath-glow");
    this.draw((ctx) => {
      if (r <= 0) return;
      if (safety.getEffectMode() === "reduced") {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }
      // 呼吸效果 ≤2Hz（周期 500ms）
      const phase = (Math.sin((time / (GameCanvas.BREATH_PERIOD_MS / 2)) * Math.PI) + 1) / 2;
      ctx.globalAlpha = 0.3 + phase * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + phase * 0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }, z);
  }

  /** 安全闪烁效果（≤2Hz） */
  drawSafeFlash(x: number, y: number, w: number, h: number, color: string, time: number, z: number = 0): void {
    safety.assertSafeHz(1000 / GameCanvas.BREATH_PERIOD_MS, "safe-flash");
    if (safety.getEffectMode() === "reduced") {
      this.drawRoundRect(x, y, w, h, 8, color + "80", z);
      return;
    }
    // ≤2Hz = 周期 ≥500ms
    const phase = (Math.sin((time / (GameCanvas.BREATH_PERIOD_MS / 2)) * Math.PI) + 1) / 2;
    const alpha = 0.4 + phase * 0.6;
    this.draw((ctx) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }, z);
  }

  clearDrawCalls(): void {
    this.drawCalls = [];
    this.clipRect = null;
  }
}

export const gameCanvas = new GameCanvas();
