/**
 * 轻量补间 / 缓动库 — 棋盘动效与 UI 反馈共用
 * 零依赖，纯函数缓动 + 极简 Tween 管理器
 */

export type EaseFn = (t: number) => number;

/** 回弹（末段落定，带两次弹跳） */
const outBounce: EaseFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
};

export const Easing: Record<string, EaseFn> = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** 轻微过冲后回位 — 用于「选中上浮 / 无效交换回弹」 */
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  /** 弹性 — 用于「连击数字弹出」 */
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounce,
};

export function ease(name: keyof typeof Easing | EaseFn, t: number): number {
  const fn = typeof name === "function" ? name : Easing[name] ?? Easing.linear;
  return fn(clamp01(t));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// === 极简 Tween 管理器 ===

export interface TweenOptions {
  /** 秒 */
  duration: number;
  /** 延迟启动（秒） */
  delay?: number;
  easing?: keyof typeof Easing | EaseFn;
  onUpdate: (t: number) => void;
  onComplete?: () => void;
}

export class Tween {
  private elapsed: number;
  private delay: number;
  private duration: number;
  private easing: keyof typeof Easing | EaseFn;
  private onUpdate: (t: number) => void;
  private onComplete?: () => void;
  private done = false;

  constructor(opts: TweenOptions) {
    this.delay = opts.delay ?? 0;
    this.duration = Math.max(0.0001, opts.duration);
    this.easing = opts.easing ?? "linear";
    this.onUpdate = opts.onUpdate;
    this.onComplete = opts.onComplete;
    this.elapsed = 0;
  }

  get isDone(): boolean { return this.done; }

  /** @returns true 表示已完成（应从管理器移除） */
  update(dt: number): boolean {
    if (this.done) return true;
    this.elapsed += dt;
    const local = this.elapsed - this.delay;
    if (local < 0) return false;
    const p = clamp01(local / this.duration);
    this.onUpdate(ease(this.easing, p));
    if (p >= 1) {
      this.done = true;
      this.onComplete?.();
      return true;
    }
    return false;
  }

  kill(): void { this.done = true; }
}

export class TweenManager {
  private tweens: Tween[] = [];

  add(opts: TweenOptions): Tween {
    const t = new Tween(opts);
    this.tweens.push(t);
    return t;
  }

  update(dt: number): void {
    if (this.tweens.length === 0) return;
    this.tweens = this.tweens.filter((t) => !t.update(dt));
  }

  clear(): void {
    this.tweens.forEach((t) => t.kill());
    this.tweens = [];
  }

  get size(): number { return this.tweens.length; }
}

// === 颜色工具 ===

/** #RRGGBB / #RGB → rgba(r,g,b,a) */
export function withAlpha(hex: string, alpha: number): string {
  const a = clamp01(alpha);
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** 颜色向白色混合，用于高光/发光 */
export function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * clamp01(amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}
