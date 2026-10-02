import { describe, it, expect } from 'vitest';
import { ITEM_CARDS } from '../../src/data/cards';
import { STORE_CATALOG } from '../../src/data/item-shop';
import { createGame, type Game } from '../../src/core/game';
import { resaleOf } from '../../src/core/item-shop';
import { getEntry } from '../../src/skin/registry';
import { PANEL_H, PANEL_Y } from '../../src/skin/layout';
import { overlayOf, panelHitAreas, panelSpecs, storeDetail, storeRows } from '../../src/ui/panels';

/** 固定点数骰：每步走 2 格 */
const fixed = (d1: number, d2: number) => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 开局每人赠送全部道具，故「买入可用」类断言必须先清空手牌 */
const emptyHand = (g: Game): void => {
  g.state.hands[0] = [];
};

describe('panels：商店浮层优先级', () => {
  it('bank > store；只开商店 → store；都不开 → null（idle 无浮层）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(overlayOf(g.state, { bankOpen: true, storeOpen: true })).toBe('bank');
    expect(overlayOf(g.state, { storeOpen: true })).toBe('store');
    expect(overlayOf(g.state, {})).toBeNull();
  });

  it('商店与银行一样，任何时候（idle）都能开', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.state.phase).toBe('idle');
    expect(overlayOf(g.state, { storeOpen: true })).toBe('store');
  });
});

describe('panels：商店左列', () => {
  it('顺序恒等 STORE_CATALOG，不因持有与否移动', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    const rows = storeRows(g.state, 'bomb');
    expect(rows.map((r) => r.kind)).toEqual(STORE_CATALOG.map((p) => p.kind));
    expect(rows.map((r) => r.price)).toEqual(STORE_CATALOG.map((p) => p.price));
    expect(rows.filter((r) => r.selected).map((r) => r.kind)).toEqual(['bomb']);
    expect(rows.every((r) => r.resale === resaleOf(r.price))).toBe(true);
  });

  it('摘要 = ￥售价 · 持有|—；名称取自 ITEM_CARDS', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const all = storeRows(g.state);
    expect(all.every((r) => r.owned)).toBe(true);
    expect(all.every((r) => r.summary.endsWith('持有'))).toBe(true);
    expect(all.map((r) => r.title)).toEqual(
      STORE_CATALOG.map((p) => ITEM_CARDS.find((c) => c.kind === p.kind)!.name),
    );

    emptyHand(g);
    expect(storeRows(g.state).every((r) => !r.owned && r.summary.endsWith('—'))).toBe(true);
  });
});

describe('panels：商店右列详情', () => {
  it('4 行：用途描述 / 售价与回收 / 持有 / 现金', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    const d = storeDetail(g.state, 'demolish');
    expect(d.lines).toHaveLength(4);
    expect(d.lines[0]).toBe(ITEM_CARDS.find((c) => c.kind === 'demolish')!.desc);
    expect(d.lines[1]).toBe(`售价 ￥500 · 回收 ￥${resaleOf(500)}`);
    expect(d.lines[2]).toBe('持有 0 张');
    expect(d.lines[3]).toBe(`现金 ￥${g.state.players[0].cash}`);
  });

  it('已持有 → 买入禁用、卖出可用；未持有 → 反之', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const owned = storeDetail(g.state, 'bomb');        // 开局全持有
    expect(owned.primary.enabled).toBe(false);
    expect(owned.secondary.enabled).toBe(true);
    expect(owned.secondary.label).toBe(`卖出 ￥${resaleOf(300)}`);

    emptyHand(g);
    const none = storeDetail(g.state, 'bomb');
    expect(none.primary.enabled).toBe(true);
    expect(none.secondary.enabled).toBe(false);
    expect(none.primary.label).toBe('买入 ￥300');
  });

  it('现金低于售价 → 买入禁用（边界：恰好等于售价可用）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    g.state.players[0].cash = 299;
    expect(storeDetail(g.state, 'bomb').primary.enabled).toBe(false);
    g.state.players[0].cash = 300;
    expect(storeDetail(g.state, 'bomb').primary.enabled).toBe(true);
  });
});

describe('panels：商店浮层画面与命中区', () => {
  it('画面：底板 + 角标 + 目录行数 + 4 行详情 + 两枚操作键 + 关闭键', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    const specs = panelSpecs(g.state, false, null, { open: false, sel: 'deposit' }, 0, { open: true, sel: 'bomb' });
    expect(specs.filter((s) => s.id === 'ui.bankRow')).toHaveLength(STORE_CATALOG.length + 4);
    expect(specs.filter((s) => s.id === 'ui.bankRow' && s.state?.variant === 'row')).toHaveLength(STORE_CATALOG.length);
    expect(specs.filter((s) => s.id === 'ui.bankRow' && s.state?.variant === 'line')).toHaveLength(4);
    expect(specs.find((s) => s.id === 'ui.badge')!.state!.text).toBe('道具商店');
    expect(specs.filter((s) => s.id === 'ui.button.primary')).toHaveLength(1);
    expect(specs.filter((s) => s.id === 'ui.button.secondary')).toHaveLength(1);
    /* 商店展开时不画手牌滑动条（浮层压住手牌行） */
    expect(specs.some((s) => s.id === 'ui.handBar')).toBe(false);
  });

  it('命中区：目录行 store:select（带 kind）+ 买 / 卖 / 关闭', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    const hits = panelHitAreas(g.state, false, null, { open: false, sel: 'deposit' }, 0, { open: true, sel: 'teleport' });
    const selects = hits.filter((h) => h.action === 'store:select');
    expect(selects.map((h) => h.target)).toEqual(STORE_CATALOG.map((p) => p.kind));
    expect(hits.map((h) => h.action)).toEqual([
      ...STORE_CATALOG.map(() => 'store:select'), 'store:buy', 'store:sell', 'store:close',
    ]);
    expect(hits.find((h) => h.action === 'store:buy')!.target).toBe('teleport');
    expect(hits.find((h) => h.action === 'store:sell')!.target).toBe('teleport');
    expect(hits.find((h) => h.action === 'store:sell')!.enabled).toBe(false);
  });

  it('无法购买时该键在画面与命中区同时禁用', () => {
    const g = createGame({ dice: fixed(1, 1) });       // 开局全持有 → 买入禁用
    const specs = panelSpecs(g.state, false, null, { open: false, sel: 'deposit' }, 0, { open: true, sel: 'pardon' });
    expect(specs.find((s) => s.id === 'ui.button.primary')!.state!.enabled).toBe(false);
    const hits = panelHitAreas(g.state, false, null, { open: false, sel: 'deposit' }, 0, { open: true, sel: 'pardon' });
    expect(hits.find((h) => h.action === 'store:buy')!.enabled).toBe(false);
  });

  it('目录 8 行铺得进底板：行底 ≤ 面板底（M20.3-B spec §6.3 风险表「行高复核」）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    const bank = { open: false, sel: 'deposit' } as const;
    const panelBottom = PANEL_Y + PANEL_H;
    const store = { open: true, sel: 'bomb' } as const;

    /* 命中区（= `PANEL_STORE_ROW_*` 推导）不得越出底板；行间不重叠 */
    const hits = panelHitAreas(g.state, false, null, bank, 0, store).filter((h) => h.action === 'store:select');
    expect(hits).toHaveLength(STORE_CATALOG.length);
    expect(Math.max(...hits.map((h) => h.y + h.h))).toBeLessThanOrEqual(panelBottom);
    for (let i = 1; i < hits.length; i++) expect(hits[i].y).toBeGreaterThanOrEqual(hits[i - 1].y + hits[i - 1].h);

    /* 视觉行盒（注册表 152×40 × push 的第 5 参 `s`）同样落在底板内、且不互相压盖 */
    const box = getEntry('ui.bankRow')!.box;
    const rows = panelSpecs(g.state, false, null, bank, 0, store)
      .filter((s) => s.id === 'ui.bankRow' && s.state?.variant === 'row');
    expect(rows).toHaveLength(STORE_CATALOG.length);
    const span = rows.map((s) => {
      const h = box.h * (s.fixed!.s ?? 1);
      return { top: (s.fixed!.cy ?? 0) - h / 2, bottom: (s.fixed!.cy ?? 0) + h / 2 };
    });
    expect(Math.max(...span.map((x) => x.bottom))).toBeLessThanOrEqual(panelBottom);
    for (let i = 1; i < span.length; i++) expect(span[i].top).toBeGreaterThanOrEqual(span[i - 1].bottom);
  });
});
