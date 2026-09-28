import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/core/game';
import {
  buyOffer, hitAreas, hudSpecs, primaryAction, primaryLabel, upgradeOffer, statusText,
} from '../../src/ui/Hud';
import {
  BOTTOM_BTN_Y, DOCK_Y, HUD_BAR_H, HUD_BAR_W, HUD_DICE_Y, STAGE_W,
} from '../../src/skin/layout';
import type { Dice } from '../../src/core/dice';

/** 固定点数骰：每步走 2 格，落点完全可预期 */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 让 1 号玩家「掷→走→结算」后停在 pos（advance 走 2 格，故起点设 pos-2） */
const settledAt = (pos: number, dice: Dice = fixed(1, 1)) => {
  const g = createGame({ dice });
  g.state.players[0].pos = (pos - 2 + 32) % 32;
  g.rollDice();
  g.moveCurrent();
  g.settleCurrent();
  return g;
};

describe('hud 阶段按钮（回合阶段机显式化）', () => {
  it('idle→掷骰 / rolled→前进 / moved→结算 / settled→结束回合', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(primaryAction(g.state)).toBe('roll');
    expect(primaryLabel(g.state)).toBe('掷骰');
    g.rollDice();
    expect(primaryAction(g.state)).toBe('move');
    expect(primaryLabel(g.state)).toBe('前进');
    g.moveCurrent();
    expect(primaryAction(g.state)).toBe('settle');
    expect(primaryLabel(g.state)).toBe('结算');
    g.settleCurrent();
    expect(primaryAction(g.state)).toBe('end');
    expect(primaryLabel(g.state)).toBe('结束回合');
  });

  it('本局结束 → 无主按钮，标签为结束语', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[1].bankrupt = true;
    g.state.players[2].bankrupt = true;
    g.state.players[3].bankrupt = true;
    g.rollDice();
    g.moveCurrent();
    g.settleCurrent();
    g.endTurn();
    expect(g.state.over).toBe(true);
    expect(primaryAction(g.state)).toBeNull();
    expect(primaryLabel(g.state)).toBe('本局结束');
  });
});

describe('hud 买地 / 升级报价（spec §5.2 / §5.4）', () => {
  it('停在无主 shop → 报价 ￥60，现金够则可用', () => {
    const g = settledAt(3);   // index 3 = 农家果蔬（shop）
    expect(g.state.phase).toBe('settled');
    expect(buyOffer(g.state)).toEqual({ price: 60, enabled: true });
  });

  it('现金 ￥59 → 报价仍在但不可用（边界校验，不隐藏按钮）', () => {
    const g = settledAt(3);
    g.state.players[0].cash = 59;
    expect(buyOffer(g.state)).toEqual({ price: 60, enabled: false });
  });

  it('停在非 shop 格 → 不给报价', () => {
    const g = settledAt(5);   // index 5 = 机会卡
    expect(buyOffer(g.state)).toBeNull();
    expect(upgradeOffer(g.state)).toBeNull();
  });

  it('自有 L1 → 升级 ￥180 可用；封顶 L3 → 不给报价', () => {
    const g1 = settledAt(3);
    g1.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    expect(upgradeOffer(g1.state)).toEqual({ cost: 180, enabled: true });

    const g2 = settledAt(3);
    g2.state.estates[3] = { index: 3, owner: 1, level: 3, processing: false };
    expect(upgradeOffer(g2.state)).toBeNull();
  });

  it('非 settled 阶段一律不给报价（未结算不能买地）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 1;
    g.rollDice();
    g.moveCurrent();
    expect(g.state.phase).toBe('moved');
    expect(buyOffer(g.state)).toBeNull();
    expect(upgradeOffer(g.state)).toBeNull();
  });
});

describe('hud spec 组装（pass 4 / fixed / depth 顺序）', () => {
  it('底坞 1 + 标签 1 + 资产条 4 + 骰体 2 + 骰面 2 + 主按钮 1', () => {
    const g = settledAt(3);
    const specs = hudSpecs(g.state);
    const byId = (id: string) => specs.filter((s) => s.id === id).length;
    expect(byId('ui.dock')).toBe(1);
    expect(byId('ui.label')).toBe(1);
    expect(byId('ui.playerBar')).toBe(4);
    expect(byId('dice.body')).toBe(2);
    expect(specs.filter((s) => s.id.startsWith('dice.face')).length).toBe(2);
    expect(byId('ui.button.primary')).toBe(1);
  });

  it('全部走 pass 4 + fixed 定格台位；depth（c=0 时 = r）升序即绘制序', () => {
    const g = settledAt(3);
    const specs = hudSpecs(g.state);
    expect(specs.every((s) => s.pass === 4)).toBe(true);
    expect(specs.every((s) => Boolean(s.fixed))).toBe(true);
    expect(specs.every((s) => s.c === 0)).toBe(true);
    const rs = specs.map((s) => s.r);
    expect([...rs].sort((a, b) => a - b)).toEqual(rs);
    expect(specs[0].id).toBe('ui.dock');
    expect(specs[specs.length - 1].id.startsWith('ui.button')).toBe(true);
  });

  it('骰面点数取 state.dice（未掷骰时用 face1 且 blank）', () => {
    const g = createGame({ dice: fixed(3, 5) });
    const before = hudSpecs(g.state).filter((s) => s.id.startsWith('dice.face'));
    expect(before.map((s) => s.state?.blank)).toEqual([true, true]);

    g.rollDice();
    const after = hudSpecs(g.state).filter((s) => s.id.startsWith('dice.face'));
    expect(after.map((s) => s.id)).toEqual(['dice.face3', 'dice.face5']);
    expect(after.map((s) => s.state?.pips)).toEqual([3, 5]);
  });

  it('资产条横排在底坞内、当前玩家高亮、破产置灰', () => {
    const g = settledAt(3);
    g.state.players[1].bankrupt = true;
    const bars = hudSpecs(g.state).filter((s) => s.id === 'ui.playerBar');
    expect(bars.map((s) => s.fixed?.cx)).toEqual([
      HUD_BAR_W / 2 + 6,
      HUD_BAR_W * 1.5 + 6 + 11,
      HUD_BAR_W * 2.5 + 6 + 22,
      HUD_BAR_W * 3.5 + 6 + 33,
    ]);
    expect(bars.every((s) => (s.fixed?.cy ?? 0) - HUD_BAR_H / 2 > DOCK_Y)).toBe(true);
    expect(bars.map((s) => s.state?.active)).toEqual([true, false, false, false]);
    expect(bars.map((s) => s.state?.bankrupt)).toEqual([false, true, false, false]);
  });

  it('未掷骰时两个骰面落在底坞内、双骰横向分开', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const bodies = hudSpecs(g.state).filter((s) => s.id === 'dice.body');
    expect(bodies[0].fixed?.cy ?? 0).toBeGreaterThan(HUD_DICE_Y);
    expect((bodies[1].fixed?.cx ?? 0) - (bodies[0].fixed?.cx ?? 0)).toBe(60);
  });

  it('战胜负文案：进行中显示轮次与行动玩家，结束后显示胜者', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(statusText(g.state)).toBe('第 1 轮 · 轮到 你');
    g.state.players[1].bankrupt = true;
    g.state.players[2].bankrupt = true;
    g.state.players[3].bankrupt = true;
    g.state.current = 0;
    g.state.phase = 'settled';
    g.endTurn();
    expect(statusText(g.state)).toBe('本局结束 · 胜者 你');
  });
});

describe('hud 命中层（透明 DOM 按钮的矩形来源）', () => {
  it('idle：只有主按钮，且可点', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(hitAreas(g.state)).toEqual([
      { action: 'roll', x: 146, y: BOTTOM_BTN_Y, w: 98, h: 46, enabled: true },
    ]);
  });

  it('settled + 自有 L1：主按钮为「结束回合」+ 升级按钮（含可用性）', () => {
    const g = settledAt(3);
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    const areas = hitAreas(g.state);
    expect(areas.map((a) => a.action)).toEqual(['end', 'upgrade']);
    expect(areas[0].x).toBe(146);
    expect(areas[1]).toEqual({ action: 'upgrade', x: 249, y: BOTTOM_BTN_Y, w: 110, h: 46, enabled: true });

    g.state.players[0].cash = 10;
    expect(hitAreas(g.state)[1].enabled).toBe(false);
  });

  it('命中区都落在舞台宽度内', () => {
    const g = settledAt(3);
    for (const a of hitAreas(g.state)) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(STAGE_W);
    }
  });
});