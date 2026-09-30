import { describe, it, expect } from 'vitest';
import { typeAt } from '../../src/data/board';
import { FATE_DECK, ITEM_CARDS } from '../../src/data/cards';
import { STOCKS } from '../../src/data/stocks';
import { createGame, type Game, type GameState } from '../../src/core/game';
import { REGISTRY } from '../../src/skin/registry';
import {
  drawCard, handSlots, overlayOf, panelHitAreas, panelSpecs, settlePanel, stockRows,
} from '../../src/ui/panels';

/** 固定点数骰：每步走 2 格 */
const fixed = (d1: number, d2: number) => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 32 格中某一类型的首个序号 */
const firstTileOf = (t: string): number => {
  const i = Array.from({ length: 32 }, (_, k) => k).find((k) => typeAt(k) === t);
  if (i === undefined) throw new Error(`no tile ${t}`);
  return i;
};

/** 让 0 号玩家「掷 1+1 → 走 → 结算」后停在 index（起点设 pos−2） */
const stepTo = (g: Game, index: number): void => {
  g.state.players[0].pos = (index - 2 + 32) % 32;
  g.rollDice();
  g.moveCurrent();
  g.settleCurrent();
};

describe('panels：手牌 5 槽（纯函数）', () => {
  it('恒 5 槽、顺序 = ITEM_CARDS.kind、开局全持有', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const slots = handSlots(g.state);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.kind)).toEqual(ITEM_CARDS.map((c) => c.kind));
    expect(slots.map((s) => s.name)).toEqual(ITEM_CARDS.map((c) => c.name));
    expect(slots.every((s) => s.held)).toBe(true);
  });

  it('pardon 恒不可点；teleport 仅 rolled；bomb 需对手地块；doubleRent 随时可开', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const by = (k: string) => handSlots(g.state).find((s) => s.kind === k)!;
    expect(by('pardon').enabled).toBe(false);
    expect(by('teleport').enabled).toBe(false);      // idle
    expect(by('doubleRent').enabled).toBe(true);
    expect(by('bomb').enabled).toBe(false);          // 场上无对手地块
    g.state.estates[3] = { index: 3, owner: 2, level: 1, processing: false };
    expect(by('bomb').enabled).toBe(true);
    g.rollDice();
    expect(by('teleport').enabled).toBe(true);       // rolled
  });

  it('打出后槽位仍占位，只是 held 变灰', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[3] = { index: 3, owner: 2, level: 1, processing: false };
    expect(g.useCard('bomb', 3).ok).toBe(true);
    const bomb = handSlots(g.state).find((s) => s.kind === 'bomb')!;
    expect(bomb.held).toBe(false);
    expect(bomb.enabled).toBe(false);
    expect(handSlots(g.state)).toHaveLength(5);
  });
});

describe('panels：股票盘 4 行', () => {
  it('4 支标的；涨跌以发行价为基线；持股与市值跟随盘口', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const rows = stockRows(g.state);
    expect(rows.map((r) => r.code)).toEqual(STOCKS.map((d) => d.code));
    expect(rows.map((r) => r.price)).toEqual(STOCKS.map((d) => d.price0));
    expect(rows.every((r) => r.change === 0 && r.shares === 0 && r.value === 0)).toBe(true);

    g.state.quotes.SY01 = 132;
    g.state.portfolios[0].SY01 = { code: 'SY01', shares: 2, cost: 240 };
    const sy01 = stockRows(g.state)[0];
    expect(sy01.change).toBe(12);
    expect(sy01.shares).toBe(2);
    expect(sy01.value).toBe(264);
  });
});

describe('panels：抽卡翻牌', () => {
  it('未抽卡 → null；落到 fate 格 → 牌面文案取自 cards.ts', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(drawCard(g.state)).toBeNull();

    stepTo(g, firstTileOf('fate'));
    const card = drawCard(g.state);
    expect(card).not.toBeNull();
    expect(card!.deck).toBe('fate');
    const def = FATE_DECK.find((c) => c.id === card!.cardId);
    expect(def).toBeDefined();
    expect(card!.title).toBe(def!.name);
    expect(card!.text).toBe(def!.text);
  });
});

describe('panels：结算面板', () => {
  it('未结束 → null；结束 → 4 行净资产降序 + 胜者 + 轮次', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(settlePanel(g.state)).toBeNull();

    g.state.players[1].bankrupt = true;
    g.state.players[2].bankrupt = true;
    g.state.players[3].bankrupt = true;
    g.state.over = true;
    const sp = settlePanel(g.state)!;
    expect(sp.round).toBe(1);
    expect(sp.winner).toBe(1);
    expect(sp.rows).toHaveLength(4);
    expect(sp.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(sp.rows.map((r) => r.player)).toEqual([1, 2, 3, 4]);
    const worths = sp.rows.map((r) => r.worth);
    expect([...worths].sort((a, b) => b - a)).toEqual(worths);
    expect(sp.rows[0].winner).toBe(true);
    expect(sp.rows[0].name).toBe('你');
  });
});

describe('panels：spec 组装（pass 4 / fixed / 注册表命中）', () => {
  it('全部 pass 4 + fixed，ID 全部命中注册表，r 递增；手牌展开时恒 5 槽、收起时 0 槽', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const specs = panelSpecs(g.state, true);
    expect(specs.every((s) => s.pass === 4)).toBe(true);
    expect(specs.every((s) => Boolean(s.fixed))).toBe(true);
    expect(specs.every((s) => s.c === 0)).toBe(true);
    expect(specs.every((s) => Boolean(REGISTRY[s.id]))).toBe(true);
    expect(specs.filter((s) => s.id === 'ui.handSlot')).toHaveLength(5);
    const rs = specs.map((s) => s.r);
    expect([...rs].sort((a, b) => a - b)).toEqual(rs);
    expect(overlayOf(g.state)).toBeNull();
    /* 牌袋抽屉默认收起（spec §7.3）：不画手牌槽 */
    expect(panelSpecs(g.state)).toHaveLength(0);
  });

  it('浮层优先级：抽卡 → 卡面构图；over → 4 行结算', () => {
    const g = createGame({ dice: fixed(1, 1) });
    stepTo(g, firstTileOf('chance'));
    expect(overlayOf(g.state)).toBe('draw');
    const specs = panelSpecs(g.state);
    expect(specs.map((s) => s.id)).toContain('ui.card');
    expect(specs.map((s) => s.id)).toContain('showcase.panelTall');
    expect(specs.find((s) => s.id === 'ui.badge')!.state?.text).toBe('机会');

    g.state.over = true;
    expect(overlayOf(g.state)).toBe('settle');
    expect(panelSpecs(g.state).filter((s) => s.id === 'ui.settleRow')).toHaveLength(4);
  });

  it('股票格：盘面 4 行（含持股/市值）+ 走势折线 + 可见买/卖键', () => {
    const g = createGame({ dice: fixed(1, 1) });
    stepTo(g, 19);
    expect(overlayOf(g.state)).toBe('stock');
    const specs = panelSpecs(g.state);
    const rows = specs.filter((s) => s.id === 'ui.stockRow');
    expect(rows).toHaveLength(4);
    expect(rows.every((s) => typeof s.state?.shares === 'number' && typeof s.state?.value === 'number')).toBe(true);
    const chart = specs.find((s) => s.id === 'ui.stockChart')!;
    expect(chart.state?.series).toEqual([STOCKS[0].price0]);
    expect(chart.state?.label).toBe(`${STOCKS[0].code} 走势`);
    expect(specs.filter((s) => s.id === 'ui.tradeBuy')).toHaveLength(1);
    expect(specs.filter((s) => s.id === 'ui.tradeSell')).toHaveLength(1);
  });

  it('抽卡浮层：可见关闭键（与命中区同台位）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    stepTo(g, firstTileOf('fate'));
    const close = panelSpecs(g.state).find((s) => s.id === 'ui.panelClose')!;
    expect(close.state?.label).toBe('关闭');
    expect(close.state?.enabled).toBe(true);
  });
});

describe('panels：DOM 命中层矩形', () => {
  it('抽屉收起：无浮层时一个键都不出（牌袋键归 HUD）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[3] = { index: 3, owner: 2, level: 1, processing: false };
    expect(panelHitAreas(g.state)).toEqual([]);
    expect(panelHitAreas(g.state, false)).toEqual([]);
  });

  it('抽屉展开：5 个手牌键（pardon 不可点、bomb 带目标格号），全部落在舞台内', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[3] = { index: 3, owner: 2, level: 1, processing: false };
    const hits = panelHitAreas(g.state, true);
    expect(hits.map((h) => h.action)).toEqual([
      'card:bomb', 'card:barrier', 'card:pardon', 'card:teleport', 'card:doubleRent',
    ]);
    expect(hits[0].target).toBe(3);
    expect(hits[2].enabled).toBe(false);
    for (const h of hits) {
      expect(h.x).toBeGreaterThanOrEqual(0);
      expect(h.x + h.w).toBeLessThanOrEqual(390);
    }
  });

  it('抽卡浮层：只出关闭键（手牌行被面板盖住，不再可点）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    stepTo(g, firstTileOf('fate'));
    expect(panelHitAreas(g.state).map((h) => h.action)).toEqual(['card:close']);
  });

  it('股票浮层：买/卖键带 code，可用性随现金与持股', () => {
    const g = createGame({ dice: fixed(1, 1) });
    stepTo(g, 19);
    const hits = panelHitAreas(g.state);
    expect(hits.map((h) => h.action)).toEqual(['stock:buy', 'stock:sell']);
    expect(hits.every((h) => h.target === 'SY01')).toBe(true);
    expect(hits[0].enabled).toBe(true);       // 现金 3000 ≥ ￥120
    expect(hits[1].enabled).toBe(false);      // 未持股
  });
});

describe('panels：可见键台位 == DOM 命中区矩形', () => {
  /** 由注册表 box + fixed 台位反推可见按键的左上角矩形 */
  const rectOf = (id: string, state: GameState): { x: number; y: number; w: number; h: number } => {
    const s = panelSpecs(state).find((x) => x.id === id)!;
    const box = REGISTRY[id].box;
    const scale = s.fixed?.s ?? 1;
    const w = box.w * scale;
    const h = box.h * scale;
    return { x: s.fixed!.cx - w / 2, y: s.fixed!.cy - h / 2, w, h };
  };

  it('股票盘：买/卖键与 stock:buy / stock:sell 逐像素对齐', () => {
    const g = createGame({ dice: fixed(1, 1) });
    stepTo(g, 19);
    const hits = panelHitAreas(g.state);
    for (const [id, action] of [['ui.tradeBuy', 'stock:buy'], ['ui.tradeSell', 'stock:sell']] as const) {
      const h = hits.find((x) => x.action === action)!;
      expect(rectOf(id, g.state)).toEqual({ x: h.x, y: h.y, w: h.w, h: h.h });
    }
  });

  it('抽卡浮层：关闭键与 card:close 逐像素对齐', () => {
    const g = createGame({ dice: fixed(1, 1) });
    stepTo(g, firstTileOf('fate'));
    const h = panelHitAreas(g.state).find((x) => x.action === 'card:close')!;
    expect(rectOf('ui.panelClose', g.state)).toEqual({ x: h.x, y: h.y, w: h.w, h: h.h });
  });
});