import type { ElementSpec } from '../skin/instantiate';
import { PAWN_BOX } from '../skin/registry';
import { BUBBLE_DEPTH, BUBBLE_GAP } from '../skin/layout';
import { resolvePlacement, type PlacementOpts } from './Scene';
import { pawnPlaces, type PawnState } from './PieceView';

/** 四态主色键（spec §6.7）：买地 / 收租 / 抽卡 / 进监狱 —— 具体色值在 `proc-bubble.ts` 的 L4 兜底里 */
export type BubbleTone = 'buy' | 'rent' | 'card' | 'jail';

/** 头顶气泡内容（标题 + 金额/说明 + 主色键） */
export interface BubbleContent {
  title: string;
  amount: string;
  tone: BubbleTone;
}

/**
 * 动作 → 气泡内容（纯函数）：只认「买地 / 收租 / 抽卡 / 进监狱」四态，其余返回 null（不出气泡）。
 * `result` = `applyStep` 的返回值：买地取 `cost`、收租取 `rent`、进监狱取 `turns`/`waived`；
 * 买地失败（`ok !== true`）不出气泡；文案与 fx 同源（标题 = 落格短名，卡名取 `state.lastDraw`）。
 */
export function bubbleOfStep(
  step: { kind: string }, result: unknown, tileName: string, cardTitle: string | null,
): BubbleContent | null {
  const r = (result ?? {}) as Record<string, unknown>;
  if (step.kind === 'buy') {
    return r.ok === true && typeof r.cost === 'number'
      ? { title: tileName, amount: `买地 ￥${r.cost}`, tone: 'buy' }
      : null;
  }
  if (step.kind !== 'settle') return null;
  if (r.kind === 'rent' && typeof r.rent === 'number') {
    return { title: tileName, amount: `租金 -￥${r.rent}`, tone: 'rent' };
  }
  if (r.kind === 'jail') {
    const turns = typeof r.turns === 'number' ? r.turns : 0;
    return { title: tileName, amount: r.waived === true ? '免罚抵过' : `停留 ${turns} 回合`, tone: 'jail' };
  }
  if (r.kind === 'fate' || r.kind === 'chance') {
    return { title: tileName, amount: `抽到「${cardTitle ?? ''}」`, tone: 'card' };
  }
  return null;
}

/**
 * 生成气泡 spec（spec §6.7）：锚在当前行动棋子**头顶上方 `BUBBLE_GAP`**、水平居中，
 * 台位借 `resolvePlacement`（与棋子同一份落位算法）算出后走 `fixed` 定格；
 * 属覆盖层（pass 4）⇒ 压在棋子与楼体之上；**不进任何命中区**（无 DOM 按钮），不吞点击。
 */
export function bubbleSpecs(
  pawns: PawnState[],
  content: BubbleContent | null,
  geo: { hw: number; hh: number; ox: number; oy: number },
  placement: PlacementOpts,
): ElementSpec[] {
  if (!content) return [];
  const active = pawnPlaces(pawns).find((pl) => pl.pw.active === true);
  if (!active) return [];
  const at = resolvePlacement(
    {
      id: 'piece.p1', c: active.c, r: active.r, slot: null, lift: 0,
      box: PAWN_BOX, mount: 'ground', pawnIndex: active.pawnIndex,
    },
    geo,
    placement,
  );
  return [{
    id: 'ui.bubble', slot: null, c: 0, r: BUBBLE_DEPTH, pass: 4,
    fixed: { cx: at.cx, cy: at.cy - PAWN_BOX.h * at.s - BUBBLE_GAP, s: 1 },
    state: { title: content.title, amount: content.amount, tone: content.tone },
  }];
}
