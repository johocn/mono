/**
 * 轻量渲染引擎 — Canvas2D 封装
 * 职责：DPR 自适应缩放 / 指针输入（tap + drag） / draw-call 队列（按 z 排序） / 屏幕震动。
 * 抽象层：后续可替换为其它渲染器。
 */

import { safety } from "../core/SafetyManager";

export type TouchHandler = (x: number, y: number) => void;
export type DragHandler = (x0: number, y0: number, x1: number, y1: number) => void;
export type ScrollHandler = (dx: number, dy: number) => void;
export type ResizeHandler = (w: number, h: number) => void;

/** 把设计稿字号换算为实际字号（应用全局适老化缩放） */
export function fontPx(size: number): number {
  return size * safety.getFontScale();
}

interface DrawCall {
  fn: (ctx: CanvasRenderingContext2D) => void;
  z: number;
  clip?: { x: number; y: number; w: number; h: number };
}

const DRAG_THRESHOLD = 22;

export class GameCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private drawCalls: DrawCall[] = [];
  private clipRect: { x: number; y: number; w: number; h: number } | null = null;
  private rafCallback: (() => void) | null = null;
  private touchHandler: TouchHandler | null = null;
  private dragHandler: DragHandler | null = null;
  private scrollHandler: ScrollHandler | null = null;
  private tapInterceptor: ((x: number, y: number) => boolean) | null = null;
  private overlay: (() => void) | null = null;
  private resizeHandlers: ResizeHandler[] = [];

  private pressX = 0;
  private pressY = 0;
  private lastMoveX = 0;
  private lastMoveY = 0;
  private pressed = false;
  private dragFired = false;

  private shakeMag = 0;
  private shakeDur = 0;
  private shakeLeft = 0;

  private lastFrameTime = 0;

  constructor(canvasId: string = "GameCanvas") {
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

  onResize(cb: ResizeHandler): () => void {
    this.resizeHandlers.push(cb);
    return () => {
      this.resizeHandlers = this.resizeHandlers.filter((h) => h !== cb);
    };
  }

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
      if (this.tapInterceptor?.(x, y)) return;
      this.touchHandler?.(x, y);
    };
    const move = (e: TouchEvent | MouseEvent | PointerEvent) => {
      if (!this.pressed) return;
      e.preventDefault();
      const { x, y } = this.toLocal(e);
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
    if (h === null) {
      this.dragHandler = null;
      this.scrollHandler = null;
    }
  }
  setDragHandler(h: DragHandler | null): void { this.dragHandler = h; }
  setScrollHandler(h: ScrollHandler | null): void { this.scrollHandler = h; }
  setTapInterceptor(h: ((x: number, y: number) => boolean) | null): void { this.tapInterceptor = h; }
  setOverlay(fn: (() => void) | null): void { this.overlay = fn; }

  clearHandlers(): void {
    this.touchHandler = null;
    this.dragHandler = null;
    this.scrollHandler = null;
    this.pressed = false;
    this.dragFired = false;
  }

  draw(fn: (ctx: CanvasRenderingContext2D) => void, z: number = 0): void {
    this.drawCalls.push({ fn, z, clip: this.clipRect ?? undefined });
  }
  setClip(rect: { x: number; y: number; w: number; h: number } | null): void {
    this.clipRect = rect;
  }
  shake(magnitude: number, duration: number): void {
    if (safety.getEffectMode() === "reduced") return;
    if (magnitude <= this.shakeMag && this.shakeLeft > 0) return;
    this.shakeMag = magnitude;
    this.shakeDur = duration;
    this.shakeLeft = duration;
  }

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

  setUpdateCallback(cb: (() => void) | null): void { this.rafCallback = cb; }
  getTouchHandler(): TouchHandler | null { return this.touchHandler; }
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
  drawStrokeRect(x: number, y: number, w: number, h: number, r: number, color: string, lineWidth: number, z: number = 0): void {
    this.draw((ctx) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
    }, z);
  }

  static readonly BREATH_PERIOD_MS = 500;
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
      const phase = (Math.sin((time / (GameCanvas.BREATH_PERIOD_MS / 2)) * Math.PI) + 1) / 2;
      ctx.globalAlpha = 0.3 + phase * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + phase * 0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }, z);
  }
  drawSafeFlash(x: number, y: number, w: number, h: number, color: string, time: number, z: number = 0): void {
    safety.assertSafeHz(1000 / GameCanvas.BREATH_PERIOD_MS, "safe-flash");
    if (safety.getEffectMode() === "reduced") {
      this.drawRoundRect(x, y, w, h, 8, color + "80", z);
      return;
    }
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
