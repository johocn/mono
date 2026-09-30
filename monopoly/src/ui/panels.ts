/**
 * M5 浮层（spec §3.6 / §5.3 / §5.5）：手牌 5 槽 / 股票盘 / 抽卡翻牌 / 结算面板。
 *
 * 「状态 → 视图」全部做成**纯函数**（`handSlots` / `stockRows` / `drawCard` / `settlePanel` / `panelSpecs` /
 * `panelHitAreas`），脱离 DOM 与引擎即可单测；`mountPanels` 只负责透明 DOM 命中层与重画触发。
 * 可见像素一律由 `panelSpecs` 产出的 ElementSpec（注册表元素）画在画布上——符合 spec §3.6「可见元素可换素材」，
 * 与 `Hud.ts` 同为「透明层 + `data-action`」约定（像素拾取不放 Pixi 里做）。
 *
 * 浮层可见性：由 `overlayOf` 从状态派生（结算 > 股票盘 > 抽卡翻牌 > 无），天然满足 `?play=1` 默认收起。
 */
import { PLAYER_NAME, RING_SIZE } from '../data/board';
import { ITEM_CARDS, type ItemCardKind } from '../data/cards';
import { SHARE_LOT, STOCKS, STOCK_TILE_INDEX } from '../data/stocks';
import { currentPlayer, netWorth, winnerOf, type Game, type GameState } from '../core/game';
import type { ElementSpec } from '../skin/instantiate';
import {
  PANEL_BADGE_DRAW_Y, PANEL_BADGE_Y, PANEL_CARD_CX, PANEL_CARD_CY, PANEL_CARD_S,
  PANEL_CHART_H, PANEL_CHART_W, PANEL_CHART_X, PANEL_CHART_Y, PANEL_CLOSE_H, PANEL_CLOSE_W,
  PANEL_CLOSE_X, PANEL_CLOSE_Y, PANEL_CX, PANEL_DRAW_X, PANEL_DRAW_Y, PANEL_HAND_Y,
  PANEL_ROW_GAP, PANEL_ROW_H, PANEL_ROW_W, PANEL_ROW_X, PANEL_SETTLE_ROW_GAP,
  PANEL_SETTLE_ROW_H, PANEL_SETTLE_ROW_Y, PANEL_SLOT_GAP, PANEL_SLOT_H, PANEL_SLOT_W,
  PANEL_SLOT_X0, PANEL_STOCK_ROW_Y, PANEL_TRADE_GAP, PANEL_TRADE_H, PANEL_TRADE_W,
  PANEL_TRADE_X0, PANEL_TRADE_Y, PANEL_X, PANEL_Y,
} from '../skin/layout';

/** 浮层动作位（DOM 命中层 `data-action`；`data-target` 给目标格号 / 股票代码） */
export type PanelActionId =
  | 'card:bomb' | 'card:barrier' | 'card:teleport' | 'card:doubleRent'
  | 'stock:buy' | 'stock:sell' | 'card:close' | 'settle:close';

/** 浮层可见态（优先级：结算 > 股票盘 > 抽卡翻牌；无 → null） */
export type OverlayKind = 'settle' | 'stock' | 'draw';

/* —— 目标解析（默认目标与「可点性」共用一份真源） —— */

/** 炸弹默认目标：序号最小的**对手**地块（无 → undefined） */
export function firstFoeTile(state: GameState): number | undefined {
  const me = state.players[state.current].id;
  const foes = Object.keys(state.estates)
    .map(Number)
    .filter((i) => state.estates[i].owner !== me)
    .sort((a, b) => a - b);
  return foes.length > 0 ? foes[0] : undefined;
}

/** 路障 / 迁点默认目标：当前玩家前方第 3 格（棋盘 32 格内回绕） */
export function aheadTile(state: GameState, steps = 3): number {
  const pos = state.players[state.current].pos;
  return ((pos + steps) % RING_SIZE + RING_SIZE) % RING_SIZE;
}

/** 打牌时用的默认目标（`main.ts` 的命中层回调按此解析） */
export function cardTarget(kind: ItemCardKind, state: GameState): number | undefined {
  if (kind === 'bomb') return firstFoeTile(state);
  if (kind === 'barrier' || kind === 'teleport') return aheadTile(state);
  return undefined;
}

/* —— 手牌 —— */

export interface HandSlotView {
  kind: ItemCardKind;
  name: string;
  held: boolean;
  enabled: boolean;
}

/**
 * 手牌槽可点性（口径：与 `game.useCard` 的边界一致，引擎是权威，UI 不加更严的阶段门）：
 * - `pardon` 被动卡：不可主动点；
 * - `teleport` 只在 `rolled`（已掷骰待前进）时可替换移动；
 * - `bomb` 需存在对手地块；`barrier` 需还有空格可设；
 * - `doubleRent` 任意阶段可开。
 */
export function cardEnabled(kind: ItemCardKind, state: GameState): boolean {
  const i = state.current;
  if (!(state.hands[i] ?? []).includes(kind)) return false;
  if (kind === 'pardon') return false;
  if (kind === 'teleport') return state.phase === 'rolled';
  if (kind === 'bomb') return firstFoeTile(state) !== undefined;
  if (kind === 'barrier') return Object.keys(state.barriers).length < RING_SIZE;
  return true;
}

/** 手牌 5 槽：顺序恒等 `ITEM_CARDS.kind`（槽位不因持有与否移动） */
export function handSlots(state: GameState): HandSlotView[] {
  const hand = state.hands[state.current] ?? [];
  return ITEM_CARDS.map((c) => ({
    kind: c.kind,
    name: c.name,
    held: hand.includes(c.kind),
    enabled: cardEnabled(c.kind, state),
  }));
}

/* —— 股票盘 —— */

export interface StockRowView {
  code: string;
  name: string;
  price: number;
  /** 涨跌 = 现价 − 发行价（`STOCKS[].price0`）；口径定死：演示盘只做发行价基线，不做分时快照 */
  change: number;
  shares: number;
  value: number;
}

export function stockRows(state: GameState): StockRowView[] {
  const pf = state.portfolios[state.current] ?? {};
  return STOCKS.map((d) => {
    const price = state.quotes[d.code] ?? d.price0;
    const shares = pf[d.code]?.shares ?? 0;
    return { code: d.code, name: d.name, price, change: price - d.price0, shares, value: shares * price };
  });
}

/* —— 抽卡翻牌 —— */

export interface DrawCardView {
  deck: 'fate' | 'chance';
  cardId: string;
  title: string;
  text: string;
}

/** 最近一次抽卡；标题/文案来自 `cards.ts` 数据（UI 不写死文案） */
export function drawCard(state: GameState): DrawCardView | null {
  const d = state.lastDraw;
  return d ? { deck: d.deck, cardId: d.cardId, title: d.title, text: d.text } : null;
}

/* —— 结算面板 —— */

export interface SettleRowView {
  rank: number;
  player: number;
  name: string;
  worth: number;
  winner: boolean;
}

export interface SettlePanelView {
  round: number;
  winner: number;
  rows: SettleRowView[];
}

/** 终局结算面板（净资产降序，含破产玩家）；未结束 → null */
export function settlePanel(state: GameState): SettlePanelView | null {
  if (!state.over) return null;
  const winner = winnerOf(state) ?? 0;
  const rows = state.players
    .map((p) => ({ p, worth: netWorth(state, p) }))
    .sort((a, b) => b.worth - a.worth || a.p.id - b.p.id)
    .map((r, i) => ({
      rank: i + 1, player: r.p.id, name: PLAYER_NAME[r.p.id - 1], worth: r.worth, winner: r.p.id === winner,
    }));
  return { round: state.round, winner, rows };
}

/** 当前应展开的浮层（未结算 / 无触发 → null，即默认收起） */
export function overlayOf(state: GameState): OverlayKind | null {
  if (state.over) return 'settle';
  if (state.phase !== 'settled') return null;
  /* 站在股票交易所（index 19）→ 盘面常开（买卖后仍停留，便于连续操作） */
  if (currentPlayer(state).pos === STOCK_TILE_INDEX) return 'stock';
  if (state.lastDraw) return 'draw';
  return null;
}

/* —— 视图组装（pass 4 + 定格台位；c 恒 0，depth = r 递增即绘制序） —— */

/** 手牌行第 i 槽的中心 x */
export function handSlotCx(i: number): number {
  return PANEL_SLOT_X0 + PANEL_SLOT_W / 2 + i * (PANEL_SLOT_W + PANEL_SLOT_GAP);
}

export function panelSpecs(state: GameState, handOpen = false): ElementSpec[] {
  const out: ElementSpec[] = [];
  let r = 0;
  const push = (id: string, cx: number, cy: number, st: Record<string, unknown> = {}, s = 1): void => {
    out.push({ id, slot: null, c: 0, r: r++, pass: 4, fixed: { cx, cy, s }, state: st });
  };

  /* 手牌 5 槽：收进牌袋抽屉，仅展开时入画（spec §7.3；教程期间由 `main.ts` 强制展开） */
  if (handOpen) {
    handSlots(state).forEach((slot, i) => {
      push('ui.handSlot', handSlotCx(i), PANEL_HAND_Y + PANEL_SLOT_H / 2, {
        name: slot.name, held: slot.held, enabled: slot.enabled,
      });
    });
  }

  const overlay = overlayOf(state);
  if (overlay === 'settle') {
    const panel = settlePanel(state);
    if (panel) {
      push('showcase.panel', PANEL_X, PANEL_Y);
      push('ui.badge', PANEL_CX, PANEL_BADGE_Y, { text: '本局结算' });
      panel.rows.forEach((row, i) => {
        push('ui.settleRow', PANEL_ROW_X + PANEL_ROW_W / 2,
          PANEL_SETTLE_ROW_Y + PANEL_SETTLE_ROW_H / 2 + i * (PANEL_SETTLE_ROW_H + PANEL_SETTLE_ROW_GAP),
          { rank: row.rank, name: row.name, worth: row.worth, winner: row.winner });
      });
    }
  } else if (overlay === 'stock') {
    push('showcase.panel', PANEL_X, PANEL_Y);
    push('ui.badge', PANEL_CX, PANEL_BADGE_Y, { text: '股票交易所' });
    const rows = stockRows(state);
    rows.forEach((row, i) => {
      push('ui.stockRow', PANEL_ROW_X + PANEL_ROW_W / 2,
        PANEL_STOCK_ROW_Y + PANEL_ROW_H / 2 + i * (PANEL_ROW_H + PANEL_ROW_GAP),
        { code: row.code, name: row.name, price: row.price, change: row.change, shares: row.shares, value: row.value });
    });
    const first = rows[0];
    push('ui.stockChart', PANEL_CHART_X + PANEL_CHART_W / 2, PANEL_CHART_Y + PANEL_CHART_H / 2,
      { series: state.priceHistory[first.code] ?? [first.price], label: `${first.code} 走势` });
    /* 可见买/卖键（台位与 `panelHitAreas` 完全一致；观感复用 `uiButton` preset） */
    const cash = state.players[state.current].cash;
    push('ui.tradeBuy',
      PANEL_TRADE_X0 + PANEL_TRADE_W / 2, PANEL_TRADE_Y + PANEL_TRADE_H / 2,
      { label: `买 ${SHARE_LOT}`, enabled: cash >= first.price });
    push('ui.tradeSell',
      PANEL_TRADE_X0 + PANEL_TRADE_W + PANEL_TRADE_GAP + PANEL_TRADE_W / 2, PANEL_TRADE_Y + PANEL_TRADE_H / 2,
      { label: `卖 ${SHARE_LOT}`, enabled: first.shares > 0 });
  } else if (overlay === 'draw') {
    const card = drawCard(state);
    if (card) {
      /* 事件卡 ×2 专用高底板（370×480）：角标在上、卡面居中、关闭键在卡面正下方。
         不再复用 B 版式橱窗的夜空 / 天际线 / 广场（那套构图按 370×300 定位，套进 480 会散） */
      push('showcase.panelTall', PANEL_DRAW_X, PANEL_DRAW_Y);
      push('ui.badge', PANEL_CX, PANEL_BADGE_DRAW_Y, { text: card.deck === 'fate' ? '命运' : '机会' });
      push('ui.card', PANEL_CARD_CX, PANEL_CARD_CY, { title: card.title, text: card.text }, PANEL_CARD_S);
      /* 可见关闭键（台位与 `panelHitAreas` 的 `card:close` 完全一致） */
      push('ui.panelClose',
        PANEL_CLOSE_X + PANEL_CLOSE_W / 2, PANEL_CLOSE_Y + PANEL_CLOSE_H / 2,
        { label: '关闭', enabled: true });
    }
  }
  return out;
}

/* —— DOM 命中层 —— */

export interface PanelHit {
  action: PanelActionId;
  /** 目标：手牌给格号（number），股票给 code（string） */
  target?: number | string;
  x: number; y: number; w: number; h: number;
  enabled: boolean;
}

/**
 * 命中区矩形（与 `panelSpecs` 的台位一一对应）。
 * 浮层展开时**只出浮层自己的按钮**（手牌行已被面板盖住，故不再可点），避免命中层与画面错位。
 */
export function panelHitAreas(state: GameState, handOpen = false): PanelHit[] {
  const overlay = overlayOf(state);
  const out: PanelHit[] = [];
  if (!overlay) {
    /* 抽屉收起时手牌不可点（画面也没画）；牌袋键由 `Hud.ts` 提供 */
    if (!handOpen) return out;
    handSlots(state).forEach((slot, i) => {
      out.push({
        action: `card:${slot.kind}` as PanelActionId,
        target: cardTarget(slot.kind, state),
        x: PANEL_SLOT_X0 + i * (PANEL_SLOT_W + PANEL_SLOT_GAP), y: PANEL_HAND_Y,
        w: PANEL_SLOT_W, h: PANEL_SLOT_H, enabled: slot.enabled,
      });
    });
    return out;
  }
  if (overlay === 'draw') {
    out.push({
      action: 'card:close', x: PANEL_CLOSE_X, y: PANEL_CLOSE_Y,
      w: PANEL_CLOSE_W, h: PANEL_CLOSE_H, enabled: true,
    });
  } else if (overlay === 'stock') {
    const first = stockRows(state)[0];
    const cash = state.players[state.current].cash;
    out.push({
      action: 'stock:buy', target: first.code, x: PANEL_TRADE_X0, y: PANEL_TRADE_Y,
      w: PANEL_TRADE_W, h: PANEL_TRADE_H, enabled: cash >= first.price,
    });
    out.push({
      action: 'stock:sell', target: first.code,
      x: PANEL_TRADE_X0 + PANEL_TRADE_W + PANEL_TRADE_GAP, y: PANEL_TRADE_Y,
      w: PANEL_TRADE_W, h: PANEL_TRADE_H, enabled: first.shares > 0,
    });
  }
  return out;
}

export interface PanelHandle {
  /** 状态推进后重排命中层（画面由 `scene.render()` 重建，这里只管可点性） */
  update(): void;
  destroy(): void;
}

/** 命中层回调：动作 + 目标（`data-target`） */
export type PanelAct = (a: PanelActionId, target?: number | string) => void;

/**
 * 挂透明命中层：容器不吃事件，只有命中区 `<button>` 吃。
 * 按钮的**可见像素**由 `panelSpecs` + proc preset 画在画布上（spec §3.6：可见元素必须可换素材）。
 */
export function mountPanels(
  root: HTMLElement, game: Game, act: PanelAct,
  view: () => { handOpen: boolean } = () => ({ handOpen: false }),
): PanelHandle {
  const layer = document.createElement('div');
  layer.id = 'mono-panels';
  layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9';
  root.appendChild(layer);

  const update = (): void => {
    layer.textContent = '';
    for (const a of panelHitAreas(game.state, view().handOpen)) {
      const b = document.createElement('button');
      b.dataset.action = a.action;
      if (a.target !== undefined) b.dataset.target = String(a.target);
      b.disabled = !a.enabled;
      b.style.cssText =
        `position:absolute;left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px;` +
        `background:transparent;border:0;padding:0;` +
        (a.enabled ? 'pointer-events:auto;cursor:pointer;' : 'pointer-events:none;');
      b.onclick = () => act(a.action, a.target);
      layer.appendChild(b);
    }
  };

  update();
  return { update, destroy: () => layer.remove() };
}