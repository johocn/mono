import type { Container } from 'pixi.js';
import { gsap } from 'gsap';
import {
  BUILDING_Y_OFFSET,
  FX_BUY_MS, FX_BURST_MS, FX_CARD_CX, FX_CARD_CY, FX_CARD_MS, FX_CARD_S,
  FX_CENTER_X, FX_CENTER_Y, FX_COIN_ARC, FX_COIN_COUNT, FX_COIN_FLY_MS, FX_COIN_LIFT,
  FX_COIN_S, FX_DECK_MS, FX_DECK_S, FX_DICE_CX, FX_DICE_CY, FX_DICE_HOP, FX_DICE_MS,
  FX_DICE_S, FX_DICE_SPIN, FX_DUST_ARC, FX_DUST_COUNT, FX_DUST_MS, FX_DUST_S,
  FX_EASE_FALLBACK, FX_END_COUNT, FX_END_MS, FX_END_S, FX_FLIP_MS, FX_FLIP_SCALE_X,
  FX_HOP_ARC, FX_HOP_KICK_MS, FX_HOP_MS, FX_HOP_S,
  FX_LAND_MS, FX_LAND_PULSE_S, FX_LAND_PUSH_MS, FX_LAND_RING_S, FX_LEVELS, FX_LEVEL_STEP, FX_LIT_S,
  FX_MS_PER_S, FX_NOFX_SPEED, FX_PER_LEVEL_LIT_MS, FX_PULSE_MS, FX_PULSE_S,
  FX_RENT_MS, FX_RUBBLE_ARC, FX_RUBBLE_COUNT, FX_RUBBLE_MS, FX_RUBBLE_S,
  FX_SCAFFOLD_MS, FX_SCAFFOLD_S, FX_SCAFFOLD_S0, FX_SHAKE_AMP, FX_SHAKE_MS,
  FX_SHARD_S, FX_SHINE_DX, FX_SHINE_MS, FX_SPARK_ARC, FX_SPARK_MS, FX_STAMP_DEG,
  FX_STAMP_MS, FX_STAMP_S, FX_STAMP_S0, FX_STOCK_MS, FX_UPGRADE_MS,
  FX_WRECK_GHOST_S, FX_WRECK_MS, FX_WRECK_SINK,
} from '../skin/layout';
import { BUILDING_HEIGHTS } from '../skin/registry';
import type { FxTokens } from '../skin/types';
import type { Cell } from '../core/framing';

/** spec §5.6 的九条动效（一 kind 一行；M19-D5 增 wreck） */
export type FxKind =
  | 'dice' | 'hop' | 'buy' | 'upgrade' | 'rent' | 'card' | 'deck' | 'stock' | 'end' | 'land' | 'wreck';

/**
 * 动效的空间归属（spec §5.4）：`world` = 跟相机（落点由格坐标 `ipos` 算出），
 * `ui` = 不跟相机（落点用底坞 / 面板常量）。
 *
 * `Record<FxKind, …>` 让 TS 做**穷尽检查**：将来新增 kind 而漏归类，编译即报错——
 * 用类型系统兜这条，而不是人工核对（漏一个就是「取景时骰子飘到世界坐标」）。
 *
 * 注：spec §5.4 的表把 `deck` / `stock` 列进 `ui`，同时又把 `stock` 唯一的产物 `shard`
 * 列进 `world`——两行自相矛盾。此处按 spec 自己给出的**判据**（落点来源）归类：
 * `deck` / `stock` 的落点都取自 `cellXY()`（格坐标），故归 `world`；只有 `dice`（底坞）与
 * `card`（面板）落在屏幕空间常量上，归 `ui`。
 */
export const FX_SPACE: Record<FxKind, 'world' | 'ui'> = {
  hop: 'world', buy: 'world', upgrade: 'world', rent: 'world', deck: 'world', stock: 'world', end: 'world',
  land: 'world', wreck: 'world', dice: 'ui', card: 'ui',
};

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
  /* wreck（M19-D5）：碎屑淡出时长（`dust` 复用为碎屑数量） */
  dustMs?: number;
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
    case 'land':
      return { durationMs: FX_LAND_MS, ease: t.ease, pulseMs: FX_LAND_PUSH_MS, pulseS: FX_LAND_PULSE_S };
    case 'wreck':
      return { durationMs: FX_WRECK_MS, ease: t.ease, dust: FX_RUBBLE_COUNT, dustMs: FX_RUBBLE_MS };
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

/** 一次回放的输入：主体坐标 + 可选飞行目标（金币飞向持有者）+ 可选卡面文案（翻牌用） */
export interface FxContext {
  kind: FxKind;
  x?: number;
  y?: number;
  tx?: number;
  ty?: number;
  levels?: number;
  coins?: number;
  /** 卡面标题（kind=card 时由 `cards.ts` 文案注入；UI 不写死文案） */
  title?: string;
  /** 卡面正文 */
  text?: string;
  /** 本次移动经过的格序列（供相机 `follow()` 复用同一份路径，避免两处各算一次） */
  cells?: readonly Cell[];
  /** 下沉所用的建筑元素 id（kind=wreck 时由 `main.ts` 按**旧层级**给出 `building.s{s}.l{oldLv}`） */
  element?: string;
}

export interface FxMakeSpec {
  cx: number;
  cy: number;
  s?: number;
  state?: Record<string, unknown>;
}

export interface FxBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FxDeps {
  /** 动画容器（按 `FX_SPACE` 分世界 / UI 两条）；`paint()` 会清层，动效只在两次重画之间存活 */
  fx: { world: Container; ui: Container };
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
  /** 当前时轴进度 0..1（无时轴 → 0）；闸门按真实相位截中间帧，不靠墙钟推算 */
  progress(): number;
  /** 当前时轴总时长（ms；无时轴 → 0） */
  totalMs(): number;
  /** 本帧动效**自身**元素的并集包围盒（舞台坐标；不含 HUD/棋盘）；无 → null。 */
  bounds(): FxBounds | null;
}

const secs = (ms: number): number => ms / FX_MS_PER_S;
const finite = (v: number | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** 角度 → 弧度（Pixi `Container.rotation` 用弧度） */
const rad = (deg: number): number => (deg * Math.PI) / 180;

export function createFx(deps: FxDeps): FxHandle {
  let tl: FxTimeline | null = null;
  let spawned: Container[] = [];
  let speedFactor = 1;

  const cleanup = (): void => {
    for (const c of spawned) {
      if (c.parent === deps.fx.world || c.parent === deps.fx.ui) c.parent.removeChild(c);
    }
    spawned = [];
  };

  /**
   * 建动效元素：preset 在**局部坐标**绘制（`cx/cy = 0`），再由容器的 `position` 承载台位。
   * 关键：GSAP 只补间容器自身属性，若 preset 已按绝对坐标绘制、容器又被移到同一目标，
   * 位置会被算两次（此前骰子飞出屏即此故）。局部绘制 + 容器位姿后，
   * 所有绝对目标补间、旋转、缩放都以元素自身中心为基准，天然正确。
   */
  const spawn = (id: string, spec: FxMakeSpec, target: Container): Container => {
    const c = deps.make(id, { ...spec, cx: 0, cy: 0 });
    c.position.set(spec.cx, spec.cy);
    target.addChild(c);
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
    /* 空间归属（spec §5.4）：世界空间的动效进 `world`（跟相机），UI 空间的进 `fxUi` */
    const target = FX_SPACE[ctx.kind] === 'world' ? deps.fx.world : deps.fx.ui;
    const t = gsap.timeline({
      onComplete: () => { cleanup(); onDone?.(); },
    });
    const x0 = finite(ctx.x, FX_CENTER_X);
    const y0 = finite(ctx.y, FX_CENTER_Y);
    const tx = finite(ctx.tx, x0);
    const ty = finite(ctx.ty, y0);

    const dustBurst = (cx: number, cy: number): void => {
      const n = Math.max(finite(m.dust, FX_DUST_COUNT), 2);
      for (let i = 0; i < n; i++) {
        const f = fan(i, n);
        const d = spawn('fx.dust', { cx, cy, s: FX_DUST_S, state: { owner: 0 } }, target);
        t.fromTo(d, { alpha: 1 }, { alpha: 0, duration: secs(FX_DUST_MS), ease }, 0);
        t.to(d, {
          x: cx + f * FX_DUST_ARC,
          y: cy - Math.abs(f) * FX_DUST_ARC,
          duration: secs(FX_DUST_MS), ease,
        }, 0);
      }
    };

    const coinsFly = (): void => {
      const n = Math.max(finite(m.coins, FX_COIN_COUNT), 1);
      const fly = secs(finite(m.flyMs, FX_COIN_FLY_MS));
      const stagger = fly / n;
      for (let i = 0; i < n; i++) {
        const f = fan(i, n);
        const c = spawn('fx.coin', { cx: x0, cy: y0, s: FX_COIN_S, state: { owner: 0 } }, target);
        const at = i * stagger;
        t.to(c, { y: y0 + FX_COIN_LIFT, x: x0 + f * FX_COIN_ARC, duration: fly / 2, ease }, at);
        t.to(c, { x: tx, y: ty, alpha: 0, duration: fly / 2, ease }, at + fly / 2);
      }
    };

    switch (ctx.kind) {
      case 'dice': {
        const d = secs(m.durationMs);
        const spin = rad(finite(m.spinDeg, FX_DICE_SPIN));
        const hop = finite(m.hop, FX_DICE_HOP);
        /* 骰体 + 朝上面：同一容器位姿下同步旋转/弹跳，保证点面与体永远贴合 */
        const diceParts: Array<[string, Record<string, unknown>]> = [
          ['dice.body', { roll: true }],
          ['dice.face6', { pips: 6 }],
        ];
        for (const [id, state] of diceParts) {
          const die = spawn(id, { cx: FX_DICE_CX, cy: FX_DICE_CY, s: FX_DICE_S, state }, target);
          t.to(die, { rotation: spin, duration: d, ease }, 0);
          t.to(die, { y: FX_DICE_CY - hop, duration: d / 2, ease, yoyo: true, repeat: 1 }, 0);
        }
        break;
      }
      case 'hop': {
        const arc = finite(m.arc, FX_HOP_ARC);
        const kick = secs(finite(m.kickMs, FX_HOP_KICK_MS));
        const up = secs(m.durationMs) - kick;
        const pawn = spawn('piece.p1', { cx: x0, cy: y0, s: FX_HOP_S, state: { owner: 1 } }, target);
        /* 起跳（腾空）→ 落下（落到目标格）+ 落点落尘 */
        t.to(pawn, { y: y0 - arc, duration: kick, ease }, 0);
        t.to(pawn, { y: ty, x: tx, duration: up, ease }, kick);
        dustBurst(x0, y0);
        dustBurst(tx, ty);
        break;
      }
      case 'buy': {
        const stamp = spawn('fx.stamp', { cx: x0, cy: y0, s: FX_STAMP_S, state: { owner: 0 } }, target);
        t.fromTo(stamp,
          { alpha: 0, rotation: rad(FX_STAMP_DEG) },
          { alpha: 1, rotation: 0, duration: secs(FX_STAMP_MS), ease }, 0);
        t.fromTo(stamp.scale,
          { x: FX_STAMP_S0, y: FX_STAMP_S0 },
          { x: 1, y: 1, duration: secs(FX_STAMP_MS), ease }, 0);
        coinsFly();
        break;
      }
      case 'upgrade': {
        const sc = spawn('fx.scaffold', { cx: x0, cy: y0, s: FX_SCAFFOLD_S, state: { owner: 0 } }, target);
        const build = secs(finite(m.scaffoldMs, FX_SCAFFOLD_MS));
        t.fromTo(sc.scale, { x: FX_SCAFFOLD_S0, y: FX_SCAFFOLD_S0 }, { x: 1, y: 1, duration: build, ease }, 0);
        /* 脚手架搭起后缓慢淡出（与逐层点亮重叠，保证任一静帧都能同时看到「架 + 灯」） */
        t.to(sc, { alpha: 0, duration: build * 2, ease }, build);
        const levels = Math.max(finite(m.levels, FX_LEVELS), 1);
        const seg = secs(finite(m.perLevelLitMs, FX_PER_LEVEL_LIT_MS));
        for (let l = 0; l < levels; l++) {
          const spark = spawn('fx.spark', { cx: x0, cy: y0 - l * FX_LEVEL_STEP, s: FX_LIT_S, state: { owner: 0 } }, target);
          const at = build + l * seg;
          t.fromTo(spark.scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: seg / 2, ease }, at);
          t.fromTo(spark, { alpha: 0 }, { alpha: 1, duration: seg / 2, ease }, at);
        }
        break;
      }
      case 'rent': {
        coinsFly();
        const burst = spawn('fx.spark', { cx: tx, cy: ty, s: FX_LIT_S, state: { owner: 0 } }, target);
        const fly = secs(finite(m.flyMs, FX_COIN_FLY_MS));
        const burstMs = secs(FX_BURST_MS);
        const at = fly / 2;
        t.fromTo(burst.scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: burstMs, ease }, at);
        t.to(burst, { alpha: 0, duration: burstMs, ease }, at + burstMs / 2);
        break;
      }
      case 'card': {
        const flip = secs(finite(m.flipMs, FX_FLIP_MS));
        const card = spawn('ui.card', {
          cx: FX_CARD_CX, cy: FX_CARD_CY, s: FX_CARD_S,
          state: { title: ctx.title ?? '', text: ctx.text ?? '' },
        }, target);
        const sx = finite(m.flipX, FX_FLIP_SCALE_X);
        /* 翻面入场：横向自近侧面展开（容器 scale 是 ObservablePoint，必须补间其 {x,y}） */
        t.fromTo(card.scale, { x: sx, y: 1 }, { x: 1, y: 1, duration: flip, ease }, 0);
        t.fromTo(card, { alpha: 0 }, { alpha: 1, duration: flip / 2, ease }, 0);
        const shine = spawn('fx.shine', { cx: FX_CARD_CX, cy: FX_CARD_CY, s: FX_CARD_S, state: { owner: 0 } }, target);
        const dx = finite(m.shineDx, FX_SHINE_DX);
        const shineMs = secs(finite(m.shineMs, FX_SHINE_MS));
        t.fromTo(shine, { alpha: 0, x: FX_CARD_CX - dx }, { alpha: 1, x: FX_CARD_CX + dx, duration: shineMs, ease }, flip);
        t.to(shine, { alpha: 0, duration: shineMs / 2, ease }, flip + shineMs / 2);
        break;
      }
      case 'deck': {
        const back = spawn('ui.cardBack', { cx: x0, cy: y0, s: FX_DECK_S, state: { owner: 0 } }, target);
        const sh = secs(finite(m.shakeMs, FX_SHAKE_MS));
        const amp = finite(m.shakeAmp, FX_SHAKE_AMP);
        t.to(back, { x: x0 + amp, duration: sh / 2, ease, yoyo: true, repeat: 1 }, 0);
        t.to(back, { y: y0 - amp, duration: sh / 2, ease, yoyo: true, repeat: 1 }, 0);
        t.to(back, { alpha: 0, duration: sh, ease }, sh);
        break;
      }
      case 'stock': {
        const shard = spawn('fx.shard', { cx: x0, cy: y0, s: FX_SHARD_S, state: { owner: 0 } }, target);
        const pulse = secs(finite(m.pulseMs, FX_PULSE_MS));
        const peak = finite(m.pulseS, FX_PULSE_S);
        t.fromTo(shard.scale, { x: 1, y: 1 }, { x: peak, y: peak, duration: pulse, ease, yoyo: true, repeat: 2 }, 0);
        break;
      }
      case 'land': {
        /* 落格特写：地块脉冲环（相机同时推近，本环随世界空间一起放大）——扩散一圈后淡出 */
        const ring = spawn('fx.pulse', { cx: x0, cy: y0, s: FX_LAND_RING_S, state: { owner: 0 } }, target);
        const pulse = secs(finite(m.pulseMs, FX_LAND_PUSH_MS));
        const peak = finite(m.pulseS, FX_LAND_PULSE_S);
        t.fromTo(ring.scale, { x: 1, y: 1 }, { x: peak, y: peak, duration: pulse, ease }, 0);
        t.to(ring, { alpha: 0, duration: pulse, ease }, pulse);
        break;
      }
      case 'wreck': {
        /* 破坏（bomb / demolish 命中）：真实棋盘在 paint() 后已无该楼（estate 降级 / 归无主），
           故用**旧层级**元素 `building.s{slot}.l{oldLv}` 的幽灵副本承载「下沉」；碎屑另起 `fx.rubble`
           扇形飞散。不触碰地砖与店招（`building.s{slot}.sign`）。 */
        const lv = Math.max(finite(ctx.levels, 1), 1);
        const h = (BUILDING_HEIGHTS[lv] ?? BUILDING_HEIGHTS[1]) * FX_WRECK_GHOST_S;
        const baseY = y0 - BUILDING_Y_OFFSET;
        const ghost = spawn(ctx.element ?? 'building.s0.l1', {
          cx: x0, cy: baseY, s: FX_WRECK_GHOST_S,
          state: { level: lv, owner: 0, dim: false },
        }, target);
        t.to(ghost, { y: baseY + h * FX_WRECK_SINK, alpha: 0, duration: secs(m.durationMs), ease }, 0);
        const n = Math.max(finite(m.dust, FX_RUBBLE_COUNT), 1);
        const run = secs(finite(m.dustMs, FX_RUBBLE_MS));
        for (let i = 0; i < n; i++) {
          const f = fan(i, n);
          const rb = spawn('fx.rubble', { cx: x0, cy: y0, s: FX_RUBBLE_S, state: { owner: 0 } }, target);
          t.fromTo(rb, { alpha: 1 }, { alpha: 0, duration: run, ease }, 0);
          t.to(rb, {
            x: x0 + f * FX_RUBBLE_ARC,
            y: y0 - Math.abs(f) * FX_RUBBLE_ARC,
            duration: run, ease,
          }, 0);
        }
        break;
      }
      default: {
        const n = Math.max(finite(m.count, FX_END_COUNT), 1);
        const arc = finite(m.sparkArc, FX_SPARK_ARC);
        const fly = secs(finite(m.sparkMs, FX_SPARK_MS));
        const run = secs(m.durationMs);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 360;
          const r = rad(a);
          const s = spawn('fx.spark', { cx: FX_CENTER_X, cy: FX_CENTER_Y, s: FX_END_S, state: { owner: 0 } }, target);
          t.fromTo(s.scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: fly / 2, ease }, 0);
          t.fromTo(s, { alpha: 0 }, { alpha: 1, duration: fly / 2, ease }, 0);
          t.to(s, {
            x: FX_CENTER_X + Math.cos(r) * arc,
            y: FX_CENTER_Y + Math.sin(r) * arc,
            duration: fly, ease,
          }, 0);
          t.to(s, { alpha: 0, duration: fly / 2, ease }, run - fly / 2);
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
  const progress = (): number => (tl ? tl.progress() : 0);
  const totalMs = (): number => (tl ? tl.duration() * FX_MS_PER_S : 0);

  const bounds = (): FxBounds | null => {
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const c of spawned) {
      if (c.parent !== deps.fx.world && c.parent !== deps.fx.ui) continue;
      const b = c.getBounds();
      if (b.width <= 0 && b.height <= 0) continue;
      if (b.x < x0) x0 = b.x;
      if (b.y < y0) y0 = b.y;
      if (b.x + b.width > x1) x1 = b.x + b.width;
      if (b.y + b.height > y1) y1 = b.y + b.height;
    }
    if (!Number.isFinite(x0) || x1 < x0 || y1 < y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  return { play, skip, speed, busy, progress, totalMs, bounds };
}
