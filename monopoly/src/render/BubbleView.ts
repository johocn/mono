import type { ElementSpec } from '../skin/instantiate';
import { PAWN_BOX } from '../skin/registry';
import {
  BUBBLE_DEPTH, BUBBLE_EDGE_PAD, BUBBLE_GAP, BUBBLE_TAG_GAP, BUBBLE_TAG_H, BUBBLE_W, STAGE_W,
} from '../skin/layout';
import { resolvePlacement, type PlacementOpts } from './Scene';
import { bubbleHeightOf } from './providers/proc-bubble';
import { pawnPlaces, type PawnState } from './PieceView';

/** 五态主色键（spec §6.7 + 前进播报）：买地 / 收租 / 抽卡 / 进监狱 / 前进 —— 具体色值在 `proc-bubble.ts` 的 L4 兜底里 */
export type BubbleTone = 'buy' | 'rent' | 'card' | 'jail' | 'move';

/** 头顶气泡内容（标题 + 金额/说明 + 主色键 + 原著引文） */
export interface BubbleContent {
  title: string;
  amount: string;
  tone: BubbleTone;
  /** 角色原著引文（来自 `data/lines.ts`，逐条可溯源回目）；缺省不画第三段 */
  quote?: string;
}

/**
 * 动作 → 气泡内容（纯函数）：认「前进 / 买地 / 收租 / 抽卡 / 进监狱」五态，其余返回 null（不出气泡）。
 * `result` = `applyStep` 的返回值：前进取 `steps`/`barrier`、买地取 `cost`、收租取 `rent`、进监狱取 `turns`/`waived`；
 * 买地失败（`ok !== true`）不出气泡；文案与 fx 同源（标题 = 落格短名，卡名取 `state.lastDraw`）。
 * `quote` = 当前行动席位的原著引文（`pickLineForSeat` 已经按两行宽度挑过短句），挂到气泡第三段。
 */
export function bubbleOfStep(
  step: { kind: string }, result: unknown, tileName: string, cardTitle: string | null,
  quote: string | null = null,
): BubbleContent | null {
  const r = (result ?? {}) as Record<string, unknown>;
  const q = quote && quote.length > 0 ? quote : undefined;
  /* 前进播报（「谁前进几步」）：落地即报，随后由 settle/end 覆盖；
     被路障截停时步数为实际移动格数，副行点明截停原因 */
  if (step.kind === 'move') {
    if (typeof r.steps !== 'number' || r.steps <= 0) return null;
    return {
      title: `前进 ${r.steps} 步`,
      amount: r.barrier === true ? '被路障截停' : `落在 ${tileName}`,
      tone: 'move',
      quote: q,
    };
  }
  if (step.kind === 'buy') {
    return r.ok === true && typeof r.cost === 'number'
      ? { title: tileName, amount: `买地 ￥${r.cost}`, tone: 'buy', quote: q }
      : null;
  }
  if (step.kind !== 'settle') return null;
  if (r.kind === 'rent' && typeof r.rent === 'number') {
    return { title: tileName, amount: `租金 -￥${r.rent}`, tone: 'rent', quote: q };
  }
  if (r.kind === 'jail') {
    const turns = typeof r.turns === 'number' ? r.turns : 0;
    return {
      title: tileName, amount: r.waived === true ? '免罚抵过' : `停留 ${turns} 回合`, tone: 'jail', quote: q,
    };
  }
  if (r.kind === 'fate' || r.kind === 'chance') {
    return { title: tileName, amount: `抽到「${cardTitle ?? ''}」`, tone: 'card', quote: q };
  }
  if (r.kind === 'bank' && typeof r.bonus === 'number') {
    return r.bonus > 0
      ? { title: '银行服务', amount: `存款红包 +￥${r.bonus}`, tone: 'buy', quote: q }
      : { title: '银行服务', amount: '存款享 3%/轮 复利', tone: 'buy', quote: q };
  }
  if (r.kind === 'lottery' && typeof r.prize === 'number') {
    const stake = typeof r.stake === 'number' ? r.stake : 0;
    return r.prize > 0
      ? { title: tileName, amount: `中奖 +￥${r.prize}`, tone: 'buy', quote: q }
      : { title: tileName, amount: `未中奖 -￥${stake}`, tone: 'rent', quote: q };
  }
  if (r.kind === 'tax' && typeof r.amount === 'number') {
    return { title: tileName, amount: `缴税 -￥${r.amount}`, tone: 'jail', quote: q };
  }
  if (r.kind === 'hospital') {
    const turns = typeof r.turns === 'number' ? r.turns : 0;
    return {
      title: tileName, amount: r.waived === true ? '免罚抵过' : `住院 ${turns} 回合`, tone: 'jail', quote: q,
    };
  }
  return null;
}

/** M20.6 板块小标内容（`ui.sectorTag`，spec §6.1 D52）：当前地块受板块新闻影响时挂在气泡顶边之上 */
export interface SectorTag {
  text: string;
  sentiment: 'good' | 'bad';
}

/**
 * 生成气泡 spec（spec §6.7）：锚在当前行动棋子**头顶上方 `BUBBLE_GAP`**、水平居中，
 * 台位借 `resolvePlacement`（与棋子同一份落位算法）算出后走 `fixed` 定格；
 * 属覆盖层（pass 4）⇒ 压在棋子与楼体之上；**不进任何命中区**（无 DOM 按钮），不吞点击。
 * `sector` 非空时追加一条 `ui.sectorTag`（M20.6 D52）：贴在气泡**顶边之上** `BUBBLE_TAG_GAP`，
 * 台位由 `bubbleHeightOf`（与 `proc-bubble` 同源公式）算出，`r` 与气泡同深度（后插入 ⇒ 压在其上）。
 */
export function bubbleSpecs(
  pawns: PawnState[],
  content: BubbleContent | null,
  geo: { hw: number; hh: number; ox: number; oy: number },
  placement: PlacementOpts,
  sector: SectorTag | null = null,
): ElementSpec[] {
  if (!content) return [];
  const active = pawnPlaces(pawns).find((pl) => pl.pw.active === true);
  if (!active) return [];
  const at = resolvePlacement(
    {
      id: 'piece.p1', c: active.c, r: active.r, slot: null, lift: 0,
      box: PAWN_BOX, mount: 'ground',
      pawnIndex: active.pawnIndex, pawnCount: active.pawnCount,
    },
    geo,
    placement,
  );
  /* 11×7 盘最左/最右格心离舞台边缘不足半个气泡宽，中心不夹边会把气泡推出画布被裁 */
  const cx = Math.min(
    Math.max(at.cx, BUBBLE_W / 2 + BUBBLE_EDGE_PAD),
    STAGE_W - BUBBLE_W / 2 - BUBBLE_EDGE_PAD,
  );
  /* 气泡台位 = 三角尖端；体顶边 = tipY − 体高（bubbleHeightOf 与 proc-bubble 同式） */
  const tipY = at.cy - PAWN_BOX.h * at.s - BUBBLE_GAP;
  const out: ElementSpec[] = [{
    id: 'ui.bubble', slot: null, c: 0, r: BUBBLE_DEPTH, pass: 4,
    fixed: { cx, cy: tipY, s: 1 },
    state: { title: content.title, amount: content.amount, tone: content.tone, quote: content.quote ?? '' },
  }];
  if (sector) {
    out.push({
      id: 'ui.sectorTag', slot: null, c: 0, r: BUBBLE_DEPTH, pass: 4,
      /* 气泡本身以 1 倍定格（`fixed.s`），故高度也按 s = 1 算 */
      fixed: { cx, cy: tipY - bubbleHeightOf(content.quote ?? null, 1) - BUBBLE_TAG_GAP - BUBBLE_TAG_H / 2, s: 1 },
      state: { text: sector.text, sentiment: sector.sentiment },
    });
  }
  return out;
}
