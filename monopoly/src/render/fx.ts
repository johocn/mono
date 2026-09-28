import type { Container } from 'pixi.js';
import { gsap } from 'gsap';
import {
  FX_BUY_MS, FX_CARD_CX, FX_CARD_CY, FX_CARD_MS, FX_CENTER_X, FX_CENTER_Y,
  FX_COIN_COUNT, FX_COIN_FLY_MS, FX_COIN_LIFT, FX_DECK_MS, FX_DICE_CX, FX_DICE_CY,
  FX_DICE_HOP, FX_DICE_MS, FX_DICE_SPIN, FX_DUST_ARC, FX_DUST_COUNT, FX_DUST_MS,
  FX_EASE_FALLBACK, FX_END_COUNT, FX_END_MS, FX_FLIP_MS, FX_FLIP_SCALE_X,
  FX_HOP_ARC, FX_HOP_KICK_MS, FX_HOP_MS, FX_LEVELS, FX_LEVEL_STEP, FX_LIT_S,
  FX_MS_PER_S, FX_NOFX_SPEED, FX_PER_LEVEL_LIT_MS, FX_PULSE_MS, FX_PULSE_S,
  FX_RENT_MS, FX_SCAFFOLD_MS, FX_SCAFFOLD_S0, FX_SHAKE_AMP, FX_SHAKE_MS,
  FX_SHINE_DX, FX_SHINE_MS, FX_SPARK_ARC, FX_SPARK_MS, FX_STAMP_DEG, FX_STAMP_MS,
  FX_STAMP_S0, FX_STOCK_MS, FX_UPGRADE_MS,
} from '../skin/layout';
import type { FxTokens } from '../skin/types';

/** spec §5.6 的九条动效（一 kind 一行） */
export type FxKind =
  | 'dice' | 'hop' | 'buy' | 'upgrade' | 'rent' | 'card' | 'deck' | 'stock' | 'end';

export type FxTimeline = ReturnType<typeof gsap.timeline>;

/** 单个场景解析出的动效参数（纯数据，可 Vitest 断言） */
export interface Motion {
  durationMs: number;
  ease: string;
  /* dice */
  spinDeg?: number;
  hop?: number;
  /* hop */
  arc?: number;
  kickMs?: number;
  dust?: number;
  /* buy / rent */
  coins?: number;
  flyMs?: number;
  /* upgrade */
  scaffoldMs?: number;
  perLevelLitMs?: number;
  levels?: number;
  /* card */
  flipMs?: number;
  flipX?: number;
  shineMs?: number;
  shineDx?: number;
  /* deck */
  shakeMs?: number;
  shakeAmp?: number;
  /* stock */
  pulseMs?: number;
  pulseS?: number;
  /* end */
  count?: number;
  sparkMs?: number;
  sparkArc?: number;
}

/** 皮肤 `fx` 段（+ layout 兜底）解析出的全局动效 token */
export interface MotionTable {
  ease: string;
  shakeMs: number;
  shakeAmp: number;
  dust: number;
}

/** 纯函数：皮肤 `fx` 段 → 动效 token（缺字段逐项回落 layout 的 FX_*，确定性） */
export function resolveMotion(tokens?: FxTokens | null): MotionTable {
  const ease = typeof tokens?.ease === 'string' && tokens.ease.length > 0 ? tokens.ease : FX_EASE_FALLBACK;
  const shakeMs = typeof tokens?.shake?.ms === 'number' ? tokens.shake.ms : FX_SHAKE_MS;
  const shakeAmp = typeof tokens?.shake?.amp === 'number' ? tokens.shake.amp : FX_SHAKE_AMP;
  const dust = typeof tokens?.dust?.count === 'number' ? tokens.dust.count : FX_DUST_COUNT;
  return { ease, shakeMs, shakeAmp, dust };
}

/** 纯函数：kind + 皮肤 tokens → 该场景的动效参数（§5.6 九行各一条） */
export function motionFor(kind: FxKind, tokens?: FxTokens | null): Motion {
  const t = resolveMotion(tokens);
  switch (kind) {
    case 'dice':
      return { durationMs: FX_DICE_MS, ease: t.ease, spinDeg: FX_DICE_SPIN, hop: FX_DICE_HOP };
    case 'hop':
      return { durationMs: FX_HOP_MS, ease: t.ease, arc: FX_HOP_ARC, kickMs: FX_HOP_KICK_MS, dust: t.dust };
    case 'buy':
      return { durationMs: FX_BUY_MS, ease: t.ease, coins: FX_COIN_COUNT, flyMs: FX_COIN_FLY_MS };
    case 'upgrade':
      return {
        durationMs: FX_UPGRADE_MS, ease: t.ease, scaffoldMs: FX_SCAFFOLD_MS,
        perLevelLitMs: FX_PER_LEVEL_LIT_MS, levels: FX_LEVELS,
      };
    case 'rent':
      return { durationMs: FX_RENT_MS, ease: t.ease, coins: FX_COIN_COUNT, flyMs: FX_COIN_FLY_MS };
    case 'card':
      return {
        durationMs: FX_CARD_MS, ease: t.ease, flipMs: FX_FLIP_MS, flipX: FX_FLIP_SCALE_X,
        shineMs: FX_SHINE_MS, shineDx: FX_SHINE_DX,
      };
    case 'deck':
      return { durationMs: FX_DECK_MS, ease: t.ease, shakeMs: t.shakeMs, shakeAmp: t.shakeAmp };
    case 'stock':
      return { durationMs: FX_STOCK_MS, ease: t.ease, pulseMs: FX_PULSE_MS, pulseS: FX_PULSE_S };
    default:
      return {
        durationMs: FX_END_MS, ease: t.ease, count: FX_END_COUNT,
        sparkMs: FX_SPARK_MS, sparkArc: FX_SPARK_ARC,
      };
  }
}

/** `?speed=<n>` → gsap 时轴倍率；undefined / 1 → 1；非有限或 ≤0 → 1（防御，不抛） */
export function timeScaleFrom(speed?: number): number {
  if (speed === undefined) return 1;
  if (!Number.isFinite(speed) || speed <= 0) return 1;
  return speed;
}

/** 一次回放的输入：主体坐标 + 可选飞行目标（金币飞向持有者） */
export interface FxContext {
  kind: FxKind;
  x?: number;
  y?: number;
  tx?: number;
  ty?: number;
  levels?: number;
  coins?: number;
}

export interface FxMakeSpec {
  cx: number;
  cy: number;
  s?: number;
  state?: Record<string, unknown>;
}

export interface FxDeps {
  /** 动画容器（`stage.layers.fx`）；`paint()` 会清层，动效只在两次重画之间存活 */
  fxLayer: Container;
  /** 唯一建元素入口：由 `Scene.buildOne` → `instantiate()`（不得直接绘图） */
  make(id: string, spec: FxMakeSpec): Container;
  /** kind → 参数（绑定皮肤 tokens）；缺省用 `motionFor(kind, null)` */
  motion?(kind: FxKind): Motion;
}

export interface FxHandle {
  play(ctx: FxContext, onDone?: () => void): FxTimeline;
  /** 跳到终帧（可点屏加速 / 闸门确定性截图用）：不改状态，只影响观感时长 */
  skip(): void;
  speed(v: number): void;
  busy(): boolean;
}

const secs = (ms: number): number => ms / FX_MS_PER_S;
const finite = (v: number | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function createFx(deps: FxDeps): FxHandle {
  let tl: FxTimeline | null = null;
  let spawned: Container[] = [];
  let speedFactor = 1;

  const cleanup = (): void => {
    for (const c of spawned) if (c.parent === deps.fxLayer) deps.fxLayer.removeChild(c);
    spawned = [];
  };

  const spawn = (id: string, spec: FxMakeSpec): Container => {
    const c = deps.make(id, spec);
    deps.fxLayer.addChild(c);
    spawned.push(c);
    return c;
  };

  /** 均匀展开的偏移量（-1..1）：用于落尘/金币/全屏火花的扇形铺开 */
  const fan = (i: number, n: number): number => (n <= 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2));

  const play = (ctx: FxContext, onDone?: () => void): FxTimeline => {
    if (tl) tl.kill();
    cleanup();
    const m = deps.motion?.(ctx.kind) ?? motionFor(ctx.kind, null);
    const ease = m.ease;
    const t = gsap.timeline({
      onComplete: () => { cleanup(); onDone?.(); },
    });
    const x0 = finite(ctx.x, FX_CENTER_X);
    const y0 = finite(ctx.y, FX_CENTER_Y);
    const tx = finite(ctx.tx, x0);
    const ty = finite(ctx.ty, y0);

    const dustBurst = (): void => {
      const n = Math.max(finite(m.dust, FX_DUST_COUNT), 2);
      for (let i = 0; i < n; i++) {
        const f = fan(i, n);
        const d = spawn('fx.dust', { cx: x0, cy: y0, s: 1, state: { owner: 0 } });
        t.fromTo(d, { alpha: 1 }, { alpha: 0, duration: secs(FX_DUST_MS), ease }, 0);
        t.to(d, { x: f * FX_DUST_ARC, y: -Math.abs(f) * FX_DUST_ARC, duration: secs(FX_DUST_MS), ease }, 0);
      }
    };

    const coinsFly = (): void => {
      const n = Math.max(finite(m.coins, FX_COIN_COUNT), 1);
      const fly = secs(finite(m.flyMs, FX_COIN_FLY_MS));
      const stagger = fly / n;
      for (let i = 0; i < n; i++) {
        const f = fan(i, n);
        const c = spawn('fx.coin', { cx: x0, cy: y0, s: 1, state: { owner: 0 } });
        const at = i * stagger;
        t.to(c, { y: y0 + FX_COIN_LIFT, x: x0 + f * FX_DUST_ARC, duration: fly / 2, ease }, at);
        t.to(c, { x: tx, y: ty, alpha: 0, duration: fly / 2, ease }, at + fly / 2);
      }
    };

    switch (ctx.kind) {
      case 'dice': {
        const d = secs(m.durationMs);
        const die = spawn('dice.body', { cx: FX_DICE_CX, cy: FX_DICE_CY, s: 1, state: { roll: true } });
        t.to(die, { rotation: finite(m.spinDeg, FX_DICE_SPIN), duration: d, ease }, 0);
        t.to(die, { y: FX_DICE_CY - finite(m.hop, FX_DICE_HOP), duration: d / 2, ease, yoyo: true, repeat: 1 }, 0);
        break;
      }
      case 'hop': {
        const arc = finite(m.arc, FX_HOP_ARC);
        const kick = secs(finite(m.kickMs, FX_HOP_KICK_MS));
        const up = secs(m.durationMs) - kick;
        const pawn = spawn('piece.p1', { cx: x0, cy: y0, s: 1, state: { owner: 1 } });
        t.to(pawn, { y: y0 - arc, duration: kick, ease }, 0);
        t.to(pawn, { y: ty, x: tx, duration: up, ease }, kick);
        dustBurst();
        break;
      }
      case 'buy': {
        const stamp = spawn('fx.stamp', { cx: x0, cy: y0, s: 1, state: { owner: 0 } });
        t.fromTo(stamp,
          { alpha: 0, scale: FX_STAMP_S0, rotation: FX_STAMP_DEG },
          { alpha: 1, scale: 1, rotation: 0, duration: secs(FX_STAMP_MS), ease }, 0);
        coinsFly();
        break;
      }
      case 'upgrade': {
        const sc = spawn('fx.scaffold', { cx: x0, cy: y0, s: 1, state: { owner: 0 } });
        const build = secs(finite(m.scaffoldMs, FX_SCAFFOLD_MS));
        t.fromTo(sc, { alpha: 0, scale: FX_SCAFFOLD_S0 }, { alpha: 1, scale: 1, duration: build, ease }, 0);
        t.to(sc, { alpha: 0, duration: build, ease }, build);
        const levels = Math.max(finite(m.levels, FX_LEVELS), 1);
        const seg = secs(finite(m.perLevelLitMs, FX_PER_LEVEL_LIT_MS));
        for (let l = 0; l < levels; l++) {
          const spark = spawn('fx.spark', { cx: x0, cy: y0 - l * FX_LEVEL_STEP, s: 1, state: { owner: 0 } });
          const at = build * 2 + l * seg;
          t.fromTo(spark, { alpha: 0, scale: 0 }, { alpha: 1, scale: FX_LIT_S, duration: seg, ease }, at);
          t.to(spark, { alpha: 0, duration: seg / 2, ease }, at + seg / 2);
        }
        break;
      }
      case 'rent': {
        coinsFly();
        const burst = spawn('fx.spark', { cx: tx, cy: ty, s: 1, state: { owner: 0 } });
        const fly = secs(finite(m.flyMs, FX_COIN_FLY_MS));
        t.fromTo(burst, { alpha: 0, scale: 0 }, { alpha: 1, scale: FX_LIT_S, duration: secs(FX_SPARK_MS), ease }, fly / 2);
        t.to(burst, { alpha: 0, duration: secs(FX_SPARK_MS), ease }, fly / 2 + secs(FX_SPARK_MS));
        break;
      }
      case 'card': {
        const flip = secs(finite(m.flipMs, FX_FLIP_MS));
        const card = spawn('fx.shard', { cx: FX_CARD_CX, cy: FX_CARD_CY, s: 1, state: { owner: 0 } });
        const sx = finite(m.flipX, FX_FLIP_SCALE_X);
        t.fromTo(card.scale, { x: 1 }, { x: sx, duration: flip, ease }, 0);
        t.to(card.scale, { x: 1, duration: flip, ease }, flip);
        const shine = spawn('fx.shine', { cx: FX_CARD_CX, cy: FX_CARD_CY, s: 1, state: { owner: 0 } });
        const dx = finite(m.shineDx, FX_SHINE_DX);
        t.fromTo(shine, { alpha: 0, x: -dx }, { alpha: 1, x: dx, duration: secs(finite(m.shineMs, FX_SHINE_MS)), ease }, flip);
        break;
      }
      case 'deck': {
        const shard = spawn('fx.shard', { cx: x0, cy: y0, s: 1, state: { owner: 0 } });
        const sh = secs(finite(m.shakeMs, FX_SHAKE_MS));
        const amp = finite(m.shakeAmp, FX_SHAKE_AMP);
        t.to(shard, { x: x0 + amp, duration: sh / 2, ease, yoyo: true, repeat: 1 }, 0);
        t.to(shard, { y: y0 - amp, duration: sh / 2, ease, yoyo: true, repeat: 1 }, 0);
        t.to(shard, { alpha: 0, duration: sh, ease }, sh);
        break;
      }
      case 'stock': {
        const shard = spawn('fx.shard', { cx: x0, cy: y0, s: 1, state: { owner: 0 } });
        const pulse = secs(finite(m.pulseMs, FX_PULSE_MS));
        t.to(shard, { scale: finite(m.pulseS, FX_PULSE_S), alpha: 1, duration: pulse, ease, yoyo: true, repeat: 3 }, 0);
        break;
      }
      default: {
        const n = Math.max(finite(m.count, FX_END_COUNT), 1);
        const arc = finite(m.sparkArc, FX_SPARK_ARC);
        const spark = secs(finite(m.sparkMs, FX_SPARK_MS));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 360;
          const rad = (a * Math.PI) / 180;
          const s = spawn('fx.spark', { cx: FX_CENTER_X, cy: FX_CENTER_Y, s: 1, state: { owner: 0 } });
          t.fromTo(s, { alpha: 0, scale: 0 }, { alpha: 1, scale: FX_LIT_S, duration: spark, ease }, 0);
          t.to(s, {
            x: Math.cos(rad) * arc,
            y: Math.sin(rad) * arc,
            alpha: 0,
            duration: spark, ease,
          }, 0);
        }
        break;
      }
    }

    tl = t;
    if (speedFactor >= FX_NOFX_SPEED) t.progress(1);   // ?nofx：瞬间到终帧
    return t;
  };

  const skip = (): void => { tl?.progress(1); };

  const speed = (v: number): void => {
    speedFactor = v;
    gsap.globalTimeline.timeScale(v);
  };

  const busy = (): boolean => tl !== null && tl.isActive();

  return { play, skip, speed, busy };
}