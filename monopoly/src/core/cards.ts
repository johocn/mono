/**
 * 卡牌效果基元（spec §5.3）：牌堆 / 手牌 / 路障 / 炸弹。
 *
 * 与 `estate.ts` 同风格——**纯函数、原地读写调用方持有的状态**，不依赖引擎、不依赖 `GameState`，
 * 因此可脱离整局状态单测。真正需要整局状态的命运/机会结算留在 `game.ts` 里按 `switch(kind)` 落库，
 * 避免 `cards.ts` 反向依赖 `game.ts` 造成循环。
 *
 * 随机只来自注入的 seeded rng（`makeRng`）；本模块禁用 `Math.random`。
 */
import { typeAt } from '../data/board';
import { HAND_SIZE, type ItemCardKind } from '../data/cards';
import type { Estate, Estates } from './estate';

export interface Deck<T> {
  /** 抽 1 张；抽空则整堆洗牌重来（牌堆张数与棋盘格数解耦，见 M5 契约 ②） */
  draw(): T;
  /** 剩余张数 */
  remaining(): number;
}

function shuffle<T>(cards: T[], rng: () => number): T[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/**
 * 建一副牌堆。`shuffled` 缺省 true（seed 派生 rng 定序）；测试可传 false 用固定顺序复现指定卡面。
 */
export function createDeck<T>(cards: T[], rng: () => number, opts: { shuffled?: boolean } = {}): Deck<T> {
  const doShuffle = opts.shuffled ?? true;
  let pile: T[] = doShuffle ? shuffle(cards, rng) : [...cards];
  let head = 0;
  return {
    remaining: (): number => pile.length - head,
    draw: (): T => {
      if (head >= pile.length) {
        pile = doShuffle ? shuffle(cards, rng) : [...cards];
        head = 0;
      }
      const card = pile[head];
      head += 1;
      return card;
    },
  };
}

/* —— 手牌：5 槽、每种至多 1 张（去重） —— */
export type Hand = ItemCardKind[];

/** 入牌：已持有该种 或 手牌已满 5 槽 → false（不重复、不溢出） */
export function grant(hand: Hand, kind: ItemCardKind): boolean {
  if (hand.length >= HAND_SIZE) return false;
  if (hand.includes(kind)) return false;
  hand.push(kind);
  return true;
}

export function has(hand: Hand, kind: ItemCardKind): boolean {
  return hand.includes(kind);
}

export function handIndexOf(hand: Hand, kind: ItemCardKind): number {
  return hand.indexOf(kind);
}

/** 消耗一张：有则移除并返回 true */
export function use(hand: Hand, kind: ItemCardKind): boolean {
  const i = hand.indexOf(kind);
  if (i < 0) return false;
  hand.splice(i, 1);
  return true;
}

/* —— 路障：`Record<格号, {index, owner}>`（原地读写） —— */
export interface Barrier {
  index: number;
  owner: number;
}
export type Barriers = Record<number, Barrier>;

/** 设障：该格已有障 → false */
export function placeBarrier(barriers: Barriers, index: number, owner: number): boolean {
  if (barriers[index]) return false;
  barriers[index] = { index, owner };
  return true;
}

export function barrierAt(barriers: Barriers, index: number): Barrier | null {
  return barriers[index] ?? null;
}

/** 撤障：有则移除并返回 true */
export function clearBarrier(barriers: Barriers, index: number): boolean {
  if (!barriers[index]) return false;
  delete (barriers as Record<number, Barrier | undefined>)[index];
  return true;
}

/* —— 炸弹：拆对手目标地块 1 级；L1 炸回无主（删键） —— */
export type BombFail = 'not-estate' | 'own-tile';
export type BombOutcome =
  | { ok: true; index: number; owner: number; level: number }
  | { ok: false; reason: BombFail };

export function bombDown(estates: Estates, index: number, actor: number): BombOutcome {
  if (typeAt(index) !== 'shop') return { ok: false, reason: 'not-estate' };
  const e = estates[index];
  if (!e) return { ok: false, reason: 'not-estate' };
  if (e.owner === actor) return { ok: false, reason: 'own-tile' };
  const owner = e.owner;
  if (e.level <= 1) {
    delete (estates as Record<number, Estate | undefined>)[index];
    return { ok: true, index, owner, level: 0 };
  }
  e.level = (e.level - 1) as 1 | 2 | 3 | 4;
  return { ok: true, index, owner, level: e.level };
}