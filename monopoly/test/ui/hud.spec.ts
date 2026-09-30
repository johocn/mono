import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/core/game';
import {
  buyOffer, hitAreas, hudSpecs, primaryAction, primaryLabel, upgradeOffer, statusText,
} from '../../src/ui/Hud';
import {
  AUDIO_BGM_BOX, AUDIO_KEY_SIZE, AUDIO_SFX_BOX, BOTTOM_BTN_Y, DOCK_Y, HUD_BAR_GAP, HUD_BAR_H,
  HUD_BAR_W, HUD_BAR_X0, HUD_BTN_AI_W, HUD_BTN_AI_X, HUD_BTN_H, HUD_DICE_Y,
  HUD_QK_H, HUD_QK_SKIP_X, HUD_QK_W, HUD_QK_Y, STAGE_W,
  TILE_CARD_BTN_Y, TILE_CARD_H, TILE_CARD_W, TILE_CARD_X, TILE_CARD_Y,
} from '../../src/skin/layout';
import type { Dice } from '../../src/core/dice';
import type { Seat } from '../../src/data/ai';

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

  it('自有地块施工中（processing）→ 报价仍在但不可用（点击不生效；与引擎 upgrade 的 processing 边界一致）', () => {
    const g = settledAt(3);
    g.state.estates[3] = { index: 3, owner: 1, level: 2, processing: true };
    expect(upgradeOffer(g.state)).toEqual({ cost: 420, enabled: false });
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
    expect(specs[specs.length - 1].id.startsWith('ui.music.')).toBe(true);
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
      HUD_BAR_W / 2 + HUD_BAR_X0,
      HUD_BAR_W * 1.5 + HUD_BAR_X0 + HUD_BAR_GAP,
      HUD_BAR_W * 2.5 + HUD_BAR_X0 + HUD_BAR_GAP * 2,
      HUD_BAR_W * 3.5 + HUD_BAR_X0 + HUD_BAR_GAP * 3,
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
  it('idle：两枚静音键常驻 + 牌袋键 + 主按钮，且都可点', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const areas = hitAreas(g.state);
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'hand', 'roll']);
    expect(areas[0]).toEqual({
      action: 'audio:sfx', x: AUDIO_SFX_BOX.left, y: AUDIO_SFX_BOX.top,
      w: AUDIO_KEY_SIZE, h: AUDIO_KEY_SIZE, enabled: true,
    });
    expect(areas[1].action).toBe('audio:bgm');
    expect(areas[2].action).toBe('hand');
    expect(areas[3].action).toBe('roll');
  });

  it('settled + 自有 L1：主按钮为「结束回合」+ 升级按钮（含可用性）', () => {
    const g = settledAt(3);
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    const areas = hitAreas(g.state);
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'hand', 'end', 'upgrade']);
    expect(areas[3].x).toBe(146);
    expect(areas[4]).toEqual({ action: 'upgrade', x: 249, y: BOTTOM_BTN_Y, w: 110, h: 46, enabled: true });

    g.state.players[0].cash = 10;
    expect(hitAreas(g.state)[4].enabled).toBe(false);
  });

  it('命中区都落在舞台宽度内', () => {
    const g = settledAt(3);
    for (const a of hitAreas(g.state)) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(STAGE_W);
    }
  });
});

describe('hud spec 组装（AI 回合）', () => {
  const seats: Seat[] = [null, 'conservative', 'aggressive', 'speculative'];
  const byId = (specs: ReturnType<typeof hudSpecs>, id: string) => specs.filter((s) => s.id === id);

  it('AI 回合：整行主按钮 + 两枚快捷键，不出买地/升级次要按钮', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 1;                       // 席位 1 = 保守 AI
    const specs = hudSpecs(g.state, false, seats, false);
    expect(byId(specs, 'ui.button.wide').length).toBe(1);
    expect(byId(specs, 'ui.button.primary').length).toBe(0);
    expect(byId(specs, 'ui.button.secondary').length).toBe(0);
    expect(byId(specs, 'ui.qk').length).toBe(2);
    const wide = byId(specs, 'ui.button.wide')[0];
    expect(wide.state!.enabled).toBe(false);
    expect(String(wide.state!.label)).toContain('AI 思考中');
    expect(String(wide.state!.label)).toContain('保守');
    expect(wide.fixed!.cx).toBe(HUD_BTN_AI_X + HUD_BTN_AI_W / 2);
  });

  it('AI 回合：每个 AI 席位在其资产条后紧跟一枚性格徽标（真人席位不推）', () => {
    const g = createGame({ seed: 1 });
    const specs = hudSpecs(g.state, false, seats, false);
    expect(byId(specs, 'ui.personaTag').length).toBe(3);
    const bars = specs.filter((s) => s.id === 'ui.playerBar').map((s) => s.r);
    for (const tag of specs.filter((s) => s.id === 'ui.personaTag')) {
      expect(bars).toContain(tag.r);
    }
  });

  it('加速态标签切换为「加速 ✓」', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 1;
    const fast = byId(hudSpecs(g.state, false, seats, true), 'ui.qk');
    expect(String(fast[0].state!.label)).toContain('✓');
  });

  it('AI 回合命中层：两枚静音键 + 主按钮禁用 + 两枚快捷键可点', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 2;
    const areas = hitAreas(g.state, seats);
    expect(areas.length).toBe(5);
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', expect.any(String), 'ai:fast', 'ai:skip']);
    expect(areas[2].enabled).toBe(false);
    expect(areas[2].x).toBe(HUD_BTN_AI_X);
    expect(areas[2].w).toBe(HUD_BTN_AI_W);
    expect(areas[2].x + areas[2].w).toBeLessThanOrEqual(STAGE_W);
    expect(areas[3].enabled).toBe(true);
    expect(areas[4].enabled).toBe(true);
  });

  it('真人回合不受影响：仍出 primary + 买/升级，另加一枚牌袋键（AI 回合不出）', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 0;                       // 席位 0 = 真人
    const specs = hudSpecs(g.state, false, seats, false);
    expect(byId(specs, 'ui.button.wide').length).toBe(0);
    expect(byId(specs, 'ui.button.primary').length).toBe(1);
    expect(byId(specs, 'ui.qk').length).toBe(1);
    expect(String(byId(specs, 'ui.qk')[0].state!.label)).toBe('手牌');
  });
});

describe('hud 牌袋抽屉键 + 落地地块卡（spec §7.3）', () => {
  const byId = (specs: ReturnType<typeof hudSpecs>, id: string) =>
    specs.filter((s) => s.id === id);
  const KEY_CX = HUD_QK_SKIP_X + HUD_QK_W / 2;
  const KEY_CY = HUD_QK_Y + HUD_QK_H / 2;

  it('抽屉开合只切标签，命中区恒同址（复用「跳过本次」键位，不新增 id）', () => {
    const g = settledAt(3);
    const closed = hudSpecs(g.state, false, [], false, undefined, { handOpen: false });
    const open = hudSpecs(g.state, false, [], false, undefined, { handOpen: true });
    expect(byId(closed, 'ui.qk').length).toBe(1);
    expect(String(byId(closed, 'ui.qk')[0].state!.label)).toBe('手牌');
    expect(String(byId(open, 'ui.qk')[0].state!.label)).toBe('收起手牌');
    for (const qk of [byId(closed, 'ui.qk')[0], byId(open, 'ui.qk')[0]]) {
      expect(qk.fixed!.cx).toBe(KEY_CX);
      expect(qk.fixed!.cy).toBe(KEY_CY);
    }
    const area = hitAreas(g.state).find((a) => a.action === 'hand');
    expect(area).toEqual({ action: 'hand', x: HUD_QK_SKIP_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true });
  });

  it('默认不出地块卡；`tileCard: true` 时出卡 + 两枚次要键（台位同源 `TILE_CARD_BTN_Y`）', () => {
    const g = settledAt(3);
    expect(byId(hudSpecs(g.state), 'ui.tileCard').length).toBe(0);

    const specs = hudSpecs(g.state, false, [], false, undefined, { tileCard: true });
    const cards = byId(specs, 'ui.tileCard');
    expect(cards.length).toBe(1);
    expect(cards[0].fixed!.cx).toBe(TILE_CARD_X + TILE_CARD_W / 2);
    expect(cards[0].fixed!.cy).toBe(TILE_CARD_Y + TILE_CARD_H / 2);
    expect(String(cards[0].state!.title)).toBe('停在 长峰特产 · 你在这里');
    expect(String(cards[0].state!.sub)).toBe('尚未售出 · 可买下');
    /* 卡上的两枚次要键：位置在卡内，底坞不再重复 */
    const secs = byId(specs, 'ui.button.secondary');
    expect(secs.map((s) => s.state!.action)).toEqual(['buy']);
    expect(secs[0].fixed!.cy).toBe(TILE_CARD_BTN_Y + HUD_BTN_H / 2);
    /* r 严格递增（depth 升序即绘制序）：牌袋键 13 → 静音 14/15 → 卡 16 → 次要键 17 */
    const rs = specs.map((s) => s.r);
    expect([...rs].sort((a, b) => a - b)).toEqual(rs);
    expect(cards[0].r).toBeGreaterThan(byId(specs, 'ui.music.on')[0].r);

    /* 命中区与视觉同源 */
    const areas = hitAreas(g.state, [], { tileCard: true });
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'hand', 'end', 'buy']);
    expect(areas[4].y).toBe(TILE_CARD_BTN_Y);
  });

  it('地块卡文案跟随归属（等级 + 持有者）', () => {
    const g = settledAt(3);
    g.state.estates[3] = { index: 3, owner: 2, level: 2, processing: false };
    const card = byId(hudSpecs(g.state, false, [], false, undefined, { tileCard: true }), 'ui.tileCard')[0];
    expect(String(card.state!.sub)).toBe('等级 L2 · 持有 老王');
    /* 非自有地块不给升级报价 → 卡上只剩主按钮 */
    const areas = hitAreas(g.state, [], { tileCard: true });
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'hand', 'end']);
  });
});

describe('hud 静音键（M11）', () => {
  const byId = (specs: ReturnType<typeof hudSpecs>, id: string) => specs.filter((s) => s.id === id);

  it('结算后两枚静音键仍在命中层（`state.over` 早退也不能吞掉）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[1].bankrupt = true;
    g.state.players[2].bankrupt = true;
    g.state.players[3].bankrupt = true;
    g.rollDice(); g.moveCurrent(); g.settleCurrent(); g.endTurn();
    expect(g.state.over).toBe(true);
    const areas = hitAreas(g.state);
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm']);
    expect(areas.every((a) => a.enabled)).toBe(true);
  });

  it('图标 spec：开态推 ui.sound.on / ui.music.on，关态推 .off', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const on = hudSpecs(g.state, false, [], false, { sfx: true, bgm: true });
    expect(byId(on, 'ui.sound.on').length).toBe(1);
    expect(byId(on, 'ui.music.on').length).toBe(1);
    expect(byId(on, 'ui.sound.off').length).toBe(0);

    const off = hudSpecs(g.state, false, [], false, { sfx: false, bgm: false });
    expect(byId(off, 'ui.sound.off').length).toBe(1);
    expect(byId(off, 'ui.music.off').length).toBe(1);
  });

  it('AI 回合也有两枚图标，且 r 仍严格单调递增', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 1;
    const specs = hudSpecs(g.state, false, [null, 'conservative', 'aggressive', 'speculative'], false, { sfx: true, bgm: false });
    expect(byId(specs, 'ui.sound.on').length).toBe(1);
    expect(byId(specs, 'ui.music.off').length).toBe(1);
    const rs = specs.map((s) => s.r);
    expect([...rs].sort((a, b) => a - b)).toEqual(rs);
    expect(specs[specs.length - 1].id).toBe('ui.music.off');
  });

  it('两枚图标台位取 AUDIO_*_BOX，26×26，落在舞台内', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const specs = hudSpecs(g.state, false, [], false, { sfx: true, bgm: true });
    const sfx = byId(specs, 'ui.sound.on')[0];
    expect(sfx.fixed!.cx).toBe(AUDIO_SFX_BOX.left + AUDIO_KEY_SIZE / 2);
    expect(sfx.fixed!.cy).toBe(AUDIO_SFX_BOX.top + AUDIO_KEY_SIZE / 2);
    expect(sfx.pass).toBe(4);
    const bgm = byId(specs, 'ui.music.on')[0];
    expect(bgm.fixed!.cx).toBe(AUDIO_BGM_BOX.left + AUDIO_KEY_SIZE / 2);
    expect(bgm.fixed!.cx + AUDIO_KEY_SIZE / 2).toBeLessThanOrEqual(STAGE_W);
  });

  it('默认（不传第 5 参）视为全开，不改变既有调用点', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(byId(hudSpecs(g.state), 'ui.sound.on').length).toBe(1);
    expect(byId(hudSpecs(g.state), 'ui.music.on').length).toBe(1);
  });
});