/**
 * M19-D2 · 目标决策纯函数（无副作用、SSR 友好、易测）。
 *
 * 三种候选口径：
 *  - bomb / demolish：对手 shop 且**已成楼**（estates 有键）的格 —— 与 bombDown/demolishDown 成功条件一致；
 *  - barrier：当前玩家**前方 1–6 格**（BARRIER_RANGE）且**未设障**的格；
 *  - teleport：除当前格外的全部格。
 *
 * `canTarget` = 是否在 `candidatesFor` 结果内；`previewFor` 产出底部预演条三行文案
 * （① 标题 ② 后果 ③ 受影响方），供 UI 直接渲染。
 */
import { BARRIER_RANGE, ITEM_CARDS, HAND_SIZE, type ItemCardKind } from '../data/cards';
import { PLAYER_NAME, RING_SIZE, typeAt, nameAt } from '../data/board';
import type { GameState } from './game';

/** 需要选目标的道具（与卡面 `target` 非 none/self 对齐） */
export type TargetKind = Extract<ItemCardKind, 'bomb' | 'barrier' | 'teleport' | 'demolish'>;

export function candidatesFor(kind: TargetKind, state: GameState): number[] {
  const me = state.players[state.current];
  const myId = me.id;
  if (kind === 'bomb' || kind === 'demolish') {
    const out: number[] = [];
    for (let i = 0; i < RING_SIZE; i++) {
      const e = state.estates[i];
      if (typeAt(i) === 'shop' && e && e.owner !== myId) out.push(i);
    }
    return out;
  }
  if (kind === 'barrier') {
    const out: number[] = [];
    for (let step = 1; step <= BARRIER_RANGE; step++) {
      const idx = (me.pos + step) % RING_SIZE;
      if (!state.barriers[idx]) out.push(idx);
    }
    return out;
  }
  /* teleport：除当前格外的全部格 */
  const out: number[] = [];
  for (let i = 0; i < RING_SIZE; i++) if (i !== me.pos) out.push(i);
  return out;
}

export function canTarget(kind: TargetKind, index: number, state: GameState): boolean {
  return candidatesFor(kind, state).includes(index);
}

/** 道具卡面文案（拆出一处便于复用，避免散落字符串） */
function cardDef(kind: ItemCardKind) {
  return ITEM_CARDS.find((c) => c.kind === kind);
}

/** 底部预演条三行：① 标题 ② 后果 ③ 受影响方 */
export function previewFor(kind: TargetKind, index: number, state: GameState): [string, string, string] {
  const who = state.players[state.current];
  const title = `${cardDef(kind)?.name ?? kind} · ${nameAt(index)}`;
  if (kind === 'bomb' || kind === 'demolish') {
    const e = state.estates[index];
    const ownerName = e ? (PLAYER_NAME[e.owner - 1] ?? `玩家${e.owner}`) : '无主';
    const lv = e ? e.level : 0;
    const effect = kind === 'demolish'
      ? `一次夷平 ${lv} 级楼体 · 归无主`
      : `楼体降 1 级（L${lv} → L${Math.max(1, lv - 1)}）`;
    return [title, effect, `受影响：${ownerName}`];
  }
  if (kind === 'barrier') {
    const dist = ((index - who.pos) + RING_SIZE) % RING_SIZE;
    return [title, `在前方第 ${dist} 格设路障 · 撞到即停`, '受影响：所有经过者'];
  }
  /* teleport */
  return [title, `把自己迁到 ${nameAt(index)}`, `受影响：${PLAYER_NAME[who.id - 1] ?? '自己'}`];
}

/* 手牌槽数量导出给 UI 复用（避免 UI 重复 import data 层） */
export const TARGETING_HAND_SIZE = HAND_SIZE;