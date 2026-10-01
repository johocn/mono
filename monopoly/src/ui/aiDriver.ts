/**
 * AI 回合驱动器（spec §5）：只负责「什么时候做、做多久」。
 * 决策全在 `src/core/ai.ts`（纯函数）；每一步都经 `deps.run` 交给 main.ts 的 `runAction`
 * —— 与真人点击**完全同一条出画口**，因此动效 / 闸门 / e2e / 线上回归全部复用。
 */
import type { Game } from '../core/game';
import { decideTurn, type AiStep } from '../core/ai';
import type { Seat, Persona } from '../data/ai';
import { AI_STEP_MS, AI_FAST_FACTOR, AI_SKIP_MAX_STEPS } from '../skin/layout';

export type { Seat } from '../data/ai';

export interface AiDriverDeps {
  game: Game;
  /** 席位归属；开局面板可能换掉整个数组，故允许传 getter（实现内统一取值） */
  seats: readonly Seat[] | (() => readonly Seat[]);
  /** 执行一步；`withFx=false` 表示只落库 + 重画（跳过本次用），默认 true */
  run: (step: AiStep, withFx?: boolean) => void;
  /** `fx.busy()`——动画未播完则等待 */
  isBusy: () => boolean;
  /** 「跳过本次」收尾只播一个动效 */
  onFlush?: () => void;
  /** 「跳过本次」收尾：相机直接归位（spec §6 P1 第 13 项）；缺省不动 */
  onSkip?: () => void;
  now?: () => number;
}

export interface AiDriver {
  tick(nowMs: number): void;
  start(): void;
  stop(): void;
  skipRest(): void;
  setFast(on: boolean): void;
  isFast(): boolean;
  persona(): Persona | null;
  destroy(): void;
}

export function createAiDriver(deps: AiDriverDeps): AiDriver {
  const now = deps.now ?? (() => performance.now());
  const seatList = (): readonly Seat[] => (typeof deps.seats === 'function' ? deps.seats() : deps.seats);
  let nextAt = 0;
  let fast = false;
  let raf = 0;
  let alive = false;
  let destroyed = false;

  const persona = (): Persona | null => seatList()[deps.game.state.current] ?? null;
  const stepMs = (): number => (fast ? AI_STEP_MS / AI_FAST_FACTOR : AI_STEP_MS);

  const tick = (nowMs: number): void => {
    if (destroyed) return;
    const state = deps.game.state;
    if (state.over) return;
    if (!persona()) return;                 // 真人席位 —— 让位，等玩家点击
    if (deps.isBusy()) return;              // 动画未播完，等下一帧
    /* 未 start() 时（单测直接调 tick）以「相对基准」起步：首次可步进时刻 = 0 + stepMs() */
    if (nextAt === 0) nextAt = stepMs();
    if (nowMs < nextAt) return;
    const plan = decideTurn(state, persona() as Persona);
    if (plan.length === 0) return;
    /* 每步前重算 plan、只执行 plan[0]：状态单调消耗（买地→有主；升级→等级+1；
       交易/租金翻倍有 lastEvent.doubleRent 守卫；打牌使手牌不再含该卡）→ 天然终止 */
    deps.run(plan[0], true);
    nextAt = nowMs + stepMs();
  };

  const loop = (): void => {
    if (!alive || destroyed) return;
    tick(now());
    raf = requestAnimationFrame(loop);
  };

  return {
    tick,
    start(): void {
      if (alive || destroyed) return;
      alive = true;
      nextAt = now();                       // 立即允许第一步
      raf = requestAnimationFrame(loop);
    },
    stop(): void {
      if (!alive) return;
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    skipRest(): void {
      const seat = deps.game.state.current;
      const p = persona();
      if (!p) return;
      let n = 0;
      while (n < AI_SKIP_MAX_STEPS) {
        /* 守卫：跑完本席位就停，绝不替下一位（可能是真人）继续决策 */
        if (deps.game.state.over || deps.game.state.current !== seat) break;
        const plan = decideTurn(deps.game.state, p);
        if (plan.length === 0) break;
        deps.run(plan[0], false);           // 只落库 + 重画，不逐个播动效
        n += 1;
      }
      nextAt = now() + stepMs();
      deps.onFlush?.();                     // 收尾只播一个动效
      /* 跳过 = 整席位一次落库，中间那几步的取景没有观感价值，收尾直接把相机 snap 回全景 */
      deps.onSkip?.();
    },
    setFast(on: boolean): void { fast = on; },
    isFast(): boolean { return fast; },
    persona,
    destroy(): void {
      this.stop();
      destroyed = true;
    },
  };
}