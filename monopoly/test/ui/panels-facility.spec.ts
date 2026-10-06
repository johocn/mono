import { describe, it, expect } from 'vitest';
import { FACILITIES, type FacilityId } from '../../src/data/facilities';
import { STOCK_TILE_INDEX } from '../../src/data/stocks';
import { createGame, type Game } from '../../src/core/game';
import { getEntry } from '../../src/skin/registry';
import {
  HUD_QK_H, HUD_QK_W, HUD_QK_Y,
  NEWS_TICKER_H, NEWS_TICKER_W, NEWS_TICKER_X, NEWS_TICKER_Y,
  PANEL_BANK_BTN2_Y, PANEL_BANK_BTN_H, PANEL_BANK_BTN_Y, PANEL_BANK_CLOSE_Y,
  PANEL_BANK_ROW_GAP, PANEL_BANK_ROW_H, PANEL_BANK_ROW_X, PANEL_BANK_ROW_Y0,
  PANEL_FACILITY_CTA_FS, PANEL_H, PANEL_Y,
} from '../../src/skin/layout';
import {
  facilityDetail, facilityRows, newsTickerSpecOf, overlayOf, panelHitAreas, panelSpecs,
} from '../../src/ui/panels';

/** 固定点数骰：每步走 2 格 */
const fixed = (d1: number, d2: number) => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 浮层入参：银行 / 商店 / 股票 / 涨跌卡一律缺省（收起），只开设施 —— 位置参数桩 */
const specsWith = (g: Game, sel: FacilityId = FACILITIES[0].id) =>
  panelSpecs(g.state, false, null, undefined, 0, undefined, undefined, undefined, { open: true, sel });

const hitsWith = (g: Game, sel: FacilityId = FACILITIES[0].id) =>
  panelHitAreas(g.state, false, null, undefined, 0, undefined, undefined, undefined, { open: true, sel });

describe('panels：设施浮层优先级（spec §6.1）', () => {
  it('facilityOpen → facility；优先级低于 bank / store', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(overlayOf(g.state, { facilityOpen: true })).toBe('facility');
    expect(overlayOf(g.state, { bankOpen: true, storeOpen: true, facilityOpen: true })).toBe('bank');
    expect(overlayOf(g.state, { storeOpen: true, facilityOpen: true })).toBe('store');
    expect(overlayOf(g.state, {})).toBeNull();
  });

  it('优先级高于股票盘：站在交易所结算后被设施浮层接管', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = STOCK_TILE_INDEX;
    g.state.phase = 'settled';
    expect(overlayOf(g.state, {})).toBe('stock');
    expect(overlayOf(g.state, { facilityOpen: true })).toBe('facility');
  });
});

describe('panels：设施左列与右列详情', () => {
  it('左列 5 行，顺序恒等 FACILITIES，恰一行 selected，摘要 = ￥价 · 已售 n/20', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const rows = facilityRows(g.state, 'hospital');
    expect(rows.map((r) => r.id)).toEqual(FACILITIES.map((f) => f.id));
    expect(rows.map((r) => r.price)).toEqual(FACILITIES.map((f) => f.price));
    expect(rows.map((r) => r.title)).toEqual(FACILITIES.map((f) => f.name));
    expect(rows.filter((r) => r.selected).map((r) => r.id)).toEqual(['hospital']);
    expect(rows.map((r) => r.summary)).toEqual(FACILITIES.map((f) => `￥${f.price} · 已售 0/${f.shares}`));
  });

  it('左列摘要跟随已售股数（Σ 未破产玩家持股）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].facilities = { bank: 3 };
    g.state.players[1].facilities = { bank: 4 };
    g.state.players[2].bankrupt = true;
    g.state.players[2].facilities = { bank: 5 };      // 破产玩家不计
    const bankRow = facilityRows(g.state).find((r) => r.id === 'bank')!;
    expect(bankRow.sold).toBe(7);
    expect(bankRow.summary).toBe(`￥${FACILITIES[0].price} · 已售 7/20`);
  });

  it('右列 5 行；两枚键 label 含认购价，现金充足且未售罄 → 均可用', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.news = null;                    // 隔离新闻系数，断言逐字文案
    const d = facilityDetail(g.state, 'bank');
    expect(d.lines).toHaveLength(5);
    expect(d.lines[0]).toBe('鹿乡银行 · 每股 ￥200');
    expect(d.lines[1]).toBe('已售 0/20 股 · 基础分红 6%/轮');
    expect(d.lines[2]).toBe('你的持股 0 股');
    expect(d.lines[3]).toBe('预估分红 ￥0/轮');
    expect(d.lines[4]).toBe(`现金 ￥${g.state.players[0].cash}`);
    expect(d.primary.label).toBe('认购 1 股 ￥200');
    expect(d.secondary.label).toBe('认购 5 股 ￥1000');
    expect(d.primary.enabled).toBe(true);
    expect(d.secondary.enabled).toBe(true);
  });

  it('现金不足 → 对应档禁用（边界：恰好等于认购价可用）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].cash = 199;
    expect(facilityDetail(g.state, 'bank').primary.enabled).toBe(false);
    expect(facilityDetail(g.state, 'bank').secondary.enabled).toBe(false);

    g.state.players[0].cash = 200;
    expect(facilityDetail(g.state, 'bank').primary.enabled).toBe(true);
    expect(facilityDetail(g.state, 'bank').secondary.enabled).toBe(false);   // 5 股仍买不起
  });

  it('售罄 → 两枚键均禁用', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].facilities = { welfare: 20 };
    const d = facilityDetail(g.state, 'welfare');
    expect(d.primary.enabled).toBe(false);
    expect(d.secondary.enabled).toBe(false);
    expect(d.lines[1]).toBe('已售 20/20 股 · 基础分红 6%/轮');
  });

  it('新闻命中该设施 → 预估值乘系数并在行内提示（利好 ×1.5）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].facilities = { bank: 20 };
    g.state.news = { id: 'n-bank-good', title: '银行加息', sentiment: 'good', scope: 'facility', target: 'bank', magnitude: 1.5 };
    const d = facilityDetail(g.state, 'bank');
    /* M20.6 D53：基础 6% ⇒ 20 × 200 × 0.06 = 240，×1.5 = 360；持股 20/20 ⇒ 控股溢价 round(200×20×0.02)=80 ⇒ 440 */
    expect(d.lines[2]).toBe('你的持股 20 股 · 控股溢价');
    expect(d.lines[3]).toBe('预估分红 ￥440/轮 · 新闻 ×1.5');
  });
});

describe('panels：设施浮层画面与命中区', () => {
  it('画面：底板 + 角标「公共设施 · 入股」+ 5 行 row + 5 行 line + 两枚操作键 + 关闭键', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const specs = specsWith(g, 'bank');
    const rows = specs.filter((s) => s.id === 'ui.bankRow');
    expect(rows.filter((s) => s.state?.variant === 'row')).toHaveLength(FACILITIES.length);
    expect(rows.filter((s) => s.state?.variant === 'line')).toHaveLength(5);
    expect(specs.find((s) => s.id === 'ui.badge')!.state!.text).toBe('公共设施 · 入股');
    expect(specs.filter((s) => s.id === 'showcase.panel')).toHaveLength(1);
    expect(specs.filter((s) => s.id === 'ui.button.primary')).toHaveLength(1);
    expect(specs.filter((s) => s.id === 'ui.button.secondary')).toHaveLength(1);
    expect(specs.filter((s) => s.id === 'ui.qk')).toHaveLength(1);          // 关闭键
    expect(specs.some((s) => s.id === 'ui.handBar')).toBe(false);           // 浮层压住手牌行
  });

  it('两枚认购键逐实例压字号：`state.fs = PANEL_FACILITY_CTA_FS`（银行 / 商店分支不受影响）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const specs = specsWith(g, 'bank');
    const primary = specs.find((s) => s.id === 'ui.button.primary')!;
    const secondary = specs.find((s) => s.id === 'ui.button.secondary')!;
    expect(primary.state!.fs).toBe(PANEL_FACILITY_CTA_FS);
    expect(secondary.state!.fs).toBe(PANEL_FACILITY_CTA_FS);
    /* 字号覆写只在设施分支：银行浮层两枚键不带 `fs`（沿用 skin 参数默认） */
    const bankSpecs = panelSpecs(g.state, true, null, { open: true, sel: 'deposit' });
    for (const s of bankSpecs.filter((x) => x.id === 'ui.button.primary' || x.id === 'ui.button.secondary')) {
      expect(s.state!.fs).toBeUndefined();
    }
  });

  it('命中区：5 行 facility:select（target = FacilityId）+ buy1 / buy5 + close', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const hits = hitsWith(g, 'hospital');
    expect(hits.map((h) => h.action)).toEqual([
      ...FACILITIES.map(() => 'facility:select'), 'facility:buy1', 'facility:buy5', 'facility:close',
    ]);
    expect(hits.filter((h) => h.action === 'facility:select').map((h) => h.target))
      .toEqual(FACILITIES.map((f) => f.id));
    expect(hits.find((h) => h.action === 'facility:buy1')!.target).toBe('hospital');
    expect(hits.find((h) => h.action === 'facility:buy5')!.target).toBe('hospital');
    /* 台位复用 PANEL_BANK_* */
    expect(hits[0]).toMatchObject({ x: PANEL_BANK_ROW_X, y: PANEL_BANK_ROW_Y0, w: 152, h: PANEL_BANK_ROW_H });
    expect(hits[5]).toMatchObject({ y: PANEL_BANK_BTN_Y, h: PANEL_BANK_BTN_H });
    expect(hits[6]).toMatchObject({ y: PANEL_BANK_BTN2_Y, h: PANEL_BANK_BTN_H });
    expect(hits[7]).toMatchObject({ y: PANEL_BANK_CLOSE_Y, w: HUD_QK_W, h: HUD_QK_H });
  });

  it('命中区与画面同源禁用：售罄 / 现金不足时对应键 enabled=false', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].cash = 100;
    const hits = hitsWith(g, 'bank');
    expect(hits.find((h) => h.action === 'facility:buy1')!.enabled).toBe(false);
    expect(hits.find((h) => h.action === 'facility:buy5')!.enabled).toBe(false);
    expect(hitsWith(g, 'welfare').find((h) => h.action === 'facility:buy1')!.enabled).toBe(true);
  });

  it('越界：5 行铺得进底板，且所有可点元素收在 HUD 快键行（607..629）之上', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const hits = hitsWith(g, 'bank');
    const rows = hits.filter((h) => h.action === 'facility:select');
    expect(rows).toHaveLength(FACILITIES.length);
    expect(Math.max(...rows.map((h) => h.y + h.h))).toBeLessThanOrEqual(PANEL_Y + PANEL_H);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].y).toBeGreaterThanOrEqual(rows[i - 1].y + rows[i - 1].h);
    }
    /* 左列最右 < 右列最左（184），行与键不重叠；键底 556 ≤ 600 */
    expect(rows[0].x + rows[0].w).toBeLessThan(184);
    expect(PANEL_BANK_BTN2_Y + PANEL_BANK_BTN_H).toBeLessThanOrEqual(PANEL_Y + PANEL_H);
    for (const h of hits) expect(h.y + h.h).toBeLessThanOrEqual(HUD_QK_Y);
    /* 视觉行盒同样落在底板内 */
    const box = getEntry('ui.bankRow')!.box;
    const visRows = specsWith(g, 'bank').filter((s) => s.id === 'ui.bankRow' && s.state?.variant === 'row');
    const bottoms = visRows.map((s) => (s.fixed!.cy ?? 0) + (box.h * (s.fixed!.s ?? 1)) / 2);
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(PANEL_Y + PANEL_H);
    expect(PANEL_BANK_ROW_Y0 + 4 * (PANEL_BANK_ROW_H + PANEL_BANK_ROW_GAP) + PANEL_BANK_ROW_H).toBe(576);
  });
});

describe('panels：新闻条（spec §6.2）', () => {
  it('无新闻 → 不出（null）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.news = null;
    expect(newsTickerSpecOf(g.state)).toBeNull();
  });

  it('有新闻 → 1 条 ui.newsTicker，台位落在 474..500、pass 4、状态带 sentiment', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const spec = newsTickerSpecOf(g.state)!;
    expect(spec.id).toBe('ui.newsTicker');
    expect(spec.pass).toBe(4);
    expect(spec.fixed!.cx).toBe(NEWS_TICKER_X + NEWS_TICKER_W / 2);
    expect(spec.fixed!.cy).toBe(NEWS_TICKER_Y + NEWS_TICKER_H / 2);
    expect(NEWS_TICKER_Y).toBe(474);
    expect(NEWS_TICKER_Y + NEWS_TICKER_H).toBe(500);
    expect(spec.state!.title).toBe(g.state.news!.title);
    expect(spec.state!.sentiment).toBe(g.state.news!.sentiment);
  });

  it('新闻系数随 scope / sentiment 落到 spec.state.coef', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.news = { id: 'x', title: '利空', sentiment: 'bad', scope: 'facility', target: 'lottery', magnitude: 0.5 };
    expect(newsTickerSpecOf(g.state)!.state!.coef).toBe(0.5);
    g.state.news = { id: 'y', title: '个股利好', sentiment: 'good', scope: 'stock', target: 'JX', magnitude: 1.5 };
    expect(newsTickerSpecOf(g.state)!.state!.coef).toBe(1);
  });

  /* M20.6（spec §6.1 D52）：板块新闻时景气度前缀换成商圈系数摘要 */
  it('板块新闻 → prefix 改为「板块·<商圈名> ×系数」；非板块 → 仍为景气度', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.news = { id: 's1', title: '核心商圈人潮涌动', sentiment: 'good', scope: 'sector', target: 'core', magnitude: 1.25 };
    expect(newsTickerSpecOf(g.state)!.state!.prefix).toBe('板块·核心商圈 ×1.25');
    g.state.news = { id: 's2', title: '文旅商圈遇冷', sentiment: 'bad', scope: 'sector', target: 'tourism', magnitude: 0.8 };
    expect(newsTickerSpecOf(g.state)!.state!.prefix).toBe('板块·文旅商圈 ×0.8');
    g.state.news = { id: 'f1', title: '银行加息', sentiment: 'good', scope: 'facility', target: 'bank', magnitude: 1.5 };
    expect(newsTickerSpecOf(g.state)!.state!.prefix).toBe(`景气 ${Math.round(g.state.economyIndex * 100)}%`);
  });
});
