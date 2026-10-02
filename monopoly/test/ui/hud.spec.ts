import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/core/game';
import {
  buyOffer, hitAreas, hudSpecs, primaryAction, primaryLabel, upgradeOffer, statusText,
} from '../../src/ui/Hud';
import {
  AUDIO_BGM_BOX, AUDIO_KEY_SIZE, AUDIO_SFX_BOX, BOTTOM_BTN_Y, DOCK_Y, HUD_BAR_GAP, HUD_BAR_H,
  HUD_BAR_W, HUD_BAR_X0, HUD_BTN_AI_W, HUD_BTN_AI_X, HUD_BTN_H, HUD_DICE_Y,
  HUD_DEBT_H, HUD_DEBT_W, HUD_DEBT_X, HUD_DEBT_Y,
  HUD_QK_BANK_X, HUD_QK_FACILITY_X, HUD_QK_FAST_X, HUD_QK_H, HUD_QK_SKIP_X, HUD_QK_STORE_X, HUD_QK_W, HUD_QK_Y, STAGE_W,
  TILE_CARD_BTN_Y, TILE_CARD_H, TILE_CARD_W, TILE_CARD_X, TILE_CARD_Y,
} from '../../src/skin/layout';
import type { Dice } from '../../src/core/dice';
import type { Seat } from '../../src/data/ai';

/** 固定点数骰：每步走 2 格，落点完全可预期 */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 让 1 号玩家「掷→走→结算」后停在 pos（advance 走 2 格，故起点设 pos-2）；固定 seed 让抽卡也可复现 */
const settledAt = (pos: number, dice: Dice = fixed(1, 1)) => {
  const g = createGame({ dice, seed: 1 });
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
    const g = settledAt(12);   // index 12 = 监狱（非 shop 且不抽卡，落点确定）
    expect(buyOffer(g.state)).toBeNull();
    expect(upgradeOffer(g.state)).toBeNull();
  });

  it('自有 L1 → 升级 ￥180 可用；封顶 L5 → 不给报价', () => {
    const g1 = settledAt(3);
    g1.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    expect(upgradeOffer(g1.state)).toEqual({ cost: 180, enabled: true });

    const g2 = settledAt(3);
    g2.state.estates[3] = { index: 3, owner: 1, level: 5, processing: false };
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
    expect(statusText(g.state)).toBe('第 1 轮 · 轮到 孙悟空');
    g.state.players[1].bankrupt = true;
    g.state.players[2].bankrupt = true;
    g.state.players[3].bankrupt = true;
    g.state.current = 0;
    g.state.phase = 'settled';
    g.endTurn();
    expect(statusText(g.state)).toBe('本局结束 · 胜者 孙悟空');
  });
});

describe('hud 命中层（透明 DOM 按钮的矩形来源）', () => {
  it('idle：两枚静音键常驻 + 牌袋键 + 出售键 + 商店键 + 银行键 + 设施键 + 主按钮，且都可点', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const areas = hitAreas(g.state);
    /* 无地产：出售键仍在（置灰），位置占用 AI 回合的「加速」空位 */
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'hand', 'sell', 'bank', 'store', 'facility', 'roll']);
    expect(areas[0]).toEqual({
      action: 'audio:sfx', x: AUDIO_SFX_BOX.left, y: AUDIO_SFX_BOX.top,
      w: AUDIO_KEY_SIZE, h: AUDIO_KEY_SIZE, enabled: true,
    });
    expect(areas[1].action).toBe('audio:bgm');
    expect(areas[2].action).toBe('hand');
    expect(areas[3].action).toBe('sell');
    expect(areas[3].enabled).toBe(false);
    expect(areas[4]).toEqual({
      action: 'bank', x: HUD_QK_BANK_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true,
    });
    expect(areas[5].action).toBe('store');
    expect(areas[6]).toEqual({
      action: 'facility', x: HUD_QK_FACILITY_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true,
    });
    expect(areas[7].action).toBe('roll');
  });

  it('settled + 自有 L1：主按钮为「结束回合」+ 出售可点 + 升级按钮（含可用性）', () => {
    const g = settledAt(3);
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    const areas = hitAreas(g.state);
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'hand', 'sell', 'bank', 'store', 'facility', 'end', 'upgrade']);
    expect(areas[3].enabled).toBe(true);            // 自有地产 ⇒ 出售可点
    expect(areas[7].x).toBe(146);
    expect(areas[8]).toEqual({ action: 'upgrade', x: 249, y: BOTTOM_BTN_Y, w: 110, h: 46, enabled: true });

    g.state.players[0].cash = 10;
    expect(hitAreas(g.state)[8].enabled).toBe(false);
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

  it('真人回合不受影响：仍出 primary + 买/升级，另加牌袋键 + 出售键 + 商店键 + 银行键 + 设施键（AI 回合不出）', () => {
    const g = createGame({ seed: 1 });
    g.state.current = 0;                       // 席位 0 = 真人
    const specs = hudSpecs(g.state, false, seats, false);
    expect(byId(specs, 'ui.button.wide').length).toBe(0);
    expect(byId(specs, 'ui.button.primary').length).toBe(1);
    expect(byId(specs, 'ui.qk').length).toBe(5);
    expect(String(byId(specs, 'ui.qk')[0].state!.label)).toBe('手牌');
    expect(String(byId(specs, 'ui.qk')[1].state!.label)).toBe('出售');
    expect(String(byId(specs, 'ui.qk')[2].state!.label)).toBe('商店');
    expect(String(byId(specs, 'ui.qk')[3].state!.label)).toBe('银行');
    expect(String(byId(specs, 'ui.qk')[4].state!.label)).toBe('设施');
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
    expect(byId(closed, 'ui.qk').length).toBe(5);
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
    /* r 严格递增（depth 升序即绘制序）：牌袋键 13 → 出售键 14 → 商店键 15 → 银行键 16 → 设施键 17 → 静音 18/19 → 卡 20 → 次要键 21 */
    const rs = specs.map((s) => s.r);
    expect([...rs].sort((a, b) => a - b)).toEqual(rs);
    expect(cards[0].r).toBeGreaterThan(byId(specs, 'ui.music.on')[0].r);

    /* 命中区与视觉同源 */
    const areas = hitAreas(g.state, [], { tileCard: true });
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'hand', 'sell', 'bank', 'store', 'facility', 'end', 'buy']);
    expect(areas[8].y).toBe(TILE_CARD_BTN_Y);
  });

  it('地块卡文案跟随归属（等级 + 持有者）', () => {
    const g = settledAt(3);
    g.state.estates[3] = { index: 3, owner: 2, level: 2, processing: false };
    const card = byId(hudSpecs(g.state, false, [], false, undefined, { tileCard: true }), 'ui.tileCard')[0];
    expect(String(card.state!.sub)).toBe('等级 L2 · 持有 猪八戒');
    /* 非自有地块不给升级报价 → 卡上只剩主按钮；出售键仍在（本局当前玩家无地 ⇒ 置灰） */
    const areas = hitAreas(g.state, [], { tileCard: true });
    expect(areas.map((a) => a.action)).toEqual(['audio:sfx', 'audio:bgm', 'hand', 'sell', 'bank', 'store', 'facility', 'end']);
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

describe('hud 出售键（M20.1 自由出售，spec §3.5）', () => {
  it('无地产 → 键位仍在但置灰；有地产 → 可点；落在 HUD_QK_FAST_X 空位；AI 回合不出', () => {
    const g = settledAt(3);
    const sellOf = (areas: ReturnType<typeof hitAreas>) => areas.find((a) => a.action === 'sell')!;
    expect(sellOf(hitAreas(g.state))).toEqual({
      action: 'sell', x: HUD_QK_FAST_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: false,
    });

    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    expect(sellOf(hitAreas(g.state)).enabled).toBe(true);

    /* 视觉同源：ui.qk 五枚（手牌 + 出售 + 商店 + 银行 + 设施），出售台位 = HUD_QK_FAST_X + HUD_QK_W / 2 */
    const qks = hudSpecs(g.state).filter((s) => s.id === 'ui.qk');
    expect(qks.map((s) => s.state!.label)).toEqual(['手牌', '出售', '商店', '银行', '设施']);
    expect(qks[1].fixed!.cx).toBe(HUD_QK_FAST_X + HUD_QK_W / 2);
    expect(Boolean(qks[1].state!.enabled)).toBe(true);

    /* AI 回合：出售键不推（该区位让给「加速 ×2」） */
    const aiSeats: Seat[] = [null, 'conservative', 'aggressive', 'speculative'];
    g.state.current = 1;
    expect(hitAreas(g.state, aiSeats).some((a) => a.action === 'sell')).toBe(false);
    expect(hudSpecs(g.state, false, aiSeats).filter((s) => s.id === 'ui.qk').map((s) => s.state!.label))
      .toEqual(['加速 ×2', '跳过本次']);
  });
});

describe('hud 银行键与债务条（M20.2 银行信贷，spec §3.8）', () => {
  const byId = (specs: ReturnType<typeof hudSpecs>, id: string) => specs.filter((s) => s.id === id);

  it('「银行」键：真人回合常开可点，落 HUD_QK_BANK_X；`bankOpen` 只切标签；AI 回合不出', () => {
    const g = createGame({ seed: 1 });
    const key = hitAreas(g.state).find((a) => a.action === 'bank');
    expect(key).toEqual({ action: 'bank', x: HUD_QK_BANK_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true });
    /* 与「出售」211..283、「跳过本次」287..359 不重叠 */
    expect(HUD_QK_BANK_X + HUD_QK_W).toBeLessThanOrEqual(HUD_QK_FAST_X);

    const off = byId(hudSpecs(g.state), 'ui.qk')[3];
    const on = byId(hudSpecs(g.state, false, [], false, undefined, { bankOpen: true }), 'ui.qk')[3];
    expect(String(off.state!.label)).toBe('银行');
    expect(String(on.state!.label)).toBe('银行 ✓');
    expect(on.fixed!.cx).toBe(HUD_QK_BANK_X + HUD_QK_W / 2);
    expect(on.fixed!.cy).toBe(HUD_QK_Y + HUD_QK_H / 2);

    /* AI 回合：银行键与出手牌 / 出售键一样不推（该区位空着） */
    const aiSeats: Seat[] = [null, 'conservative', 'aggressive', 'speculative'];
    g.state.current = 1;
    expect(hitAreas(g.state, aiSeats).some((a) => a.action === 'bank')).toBe(false);
    expect(byId(hudSpecs(g.state, false, aiSeats), 'ui.qk').length).toBe(2);
  });

  it('债务条：无信贷（存款 / 贷款 / 抵押全空）整条隐藏（零回归）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(byId(hudSpecs(g.state), 'ui.debtBar').length).toBe(0);
    /* 老对局的末位元素仍是静音键（债务条不占行号） */
    const specs = hudSpecs(g.state);
    expect(specs[specs.length - 1].id.startsWith('ui.music.')).toBe(true);
  });

  it('债务条：有存款 → 出现并带四段口径；台位在顶部条中段', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].deposit = 1240;
    const bars = byId(hudSpecs(g.state), 'ui.debtBar');
    expect(bars.length).toBe(1);
    expect(bars[0].state).toMatchObject({ deposit: 1240, debt: 0, mortgageCount: 0, overdue: 0, warn: false });
    expect(bars[0].fixed!.cx).toBe(HUD_DEBT_X + HUD_DEBT_W / 2);
    expect(bars[0].fixed!.cy).toBe(HUD_DEBT_Y + HUD_DEBT_H / 2);
    /* r 仍严格递增（债务条排在最末，depth 升序即绘制序） */
    const rs = hudSpecs(g.state).map((s) => s.r);
    expect([...rs].sort((a, b) => a - b)).toEqual(rs);
    /* 债务条不吃事件：命中层不新增矩形 */
    expect(hitAreas(g.state).some((a) => a.action === 'bank')).toBe(true);
    expect(hitAreas(g.state).length).toBe(8);
  });

  it('债务条：贷款 + 抵押合并计债；任一逾期 → 警示段（warn=true）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    p.loan = { principal: 600, rate: 0.06, due: 9, overdue: 0 };
    p.mortgages = [{ index: 3, principal: 800, rate: 0.04, due: 7, overdue: 2 }];
    const bar = byId(hudSpecs(g.state), 'ui.debtBar')[0];
    expect(bar.state).toMatchObject({ deposit: 0, debt: 1400, mortgageCount: 1, overdue: 2, warn: true });

    /* 只有抵押、无逾期 → 不警示 */
    p.mortgages = [{ index: 3, principal: 800, rate: 0.04, due: 7, overdue: 0 }];
    expect(byId(hudSpecs(g.state), 'ui.debtBar')[0].state).toMatchObject({ mortgageCount: 1, overdue: 0, warn: false });
  });
});

describe('hud 商店键（M20.3 道具商店，spec §5.1）', () => {
  const byId = (specs: ReturnType<typeof hudSpecs>, id: string) => specs.filter((s) => s.id === id);

  it('「商店」键：真人回合常开可点，落 HUD_QK_STORE_X；`storeOpen` 只切标签；AI 回合不出', () => {
    const g = createGame({ seed: 1 });
    const key = hitAreas(g.state).find((a) => a.action === 'store');
    expect(key).toEqual({ action: 'store', x: HUD_QK_STORE_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true });
    /* 与「银行」135..207 留 4px 间隙，且不压到舞台左侧边缘 */
    expect(HUD_QK_STORE_X + HUD_QK_W).toBeLessThanOrEqual(HUD_QK_BANK_X);
    expect(HUD_QK_STORE_X).toBeGreaterThanOrEqual(0);

    const off = byId(hudSpecs(g.state), 'ui.qk')[2];
    const on = byId(hudSpecs(g.state, false, [], false, undefined, { storeOpen: true }), 'ui.qk')[2];
    expect(String(off.state!.label)).toBe('商店');
    expect(String(on.state!.label)).toBe('商店 ✓');
    expect(on.fixed!.cx).toBe(HUD_QK_STORE_X + HUD_QK_W / 2);
    expect(on.fixed!.cy).toBe(HUD_QK_Y + HUD_QK_H / 2);

    /* AI 回合：商店键与出手牌 / 出售 / 银行键一样不推（该区位空着） */
    const aiSeats: Seat[] = [null, 'conservative', 'aggressive', 'speculative'];
    g.state.current = 1;
    expect(hitAreas(g.state, aiSeats).some((a) => a.action === 'store')).toBe(false);
    expect(byId(hudSpecs(g.state, false, aiSeats), 'ui.qk').length).toBe(2);
  });
});

describe('hud 设施键与快键行 5 槽（M20.4 spec §6.3 / F-D15）', () => {
  const byId = (specs: ReturnType<typeof hudSpecs>, id: string) => specs.filter((s) => s.id === id);

  it('「设施」键：真人回合常开可点，落快键行最左 HUD_QK_FACILITY_X；`facilityOpen` 只切标签；AI 回合不出', () => {
    const g = createGame({ seed: 1 });
    const key = hitAreas(g.state).find((a) => a.action === 'facility');
    expect(key).toEqual({ action: 'facility', x: HUD_QK_FACILITY_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true });
    /* 与「商店」83..155 留 4px 间隙，且不压到舞台左侧边缘 */
    expect(HUD_QK_FACILITY_X + HUD_QK_W).toBeLessThanOrEqual(HUD_QK_STORE_X);
    expect(HUD_QK_FACILITY_X).toBeGreaterThanOrEqual(0);

    const off = byId(hudSpecs(g.state), 'ui.qk')[4];
    const on = byId(hudSpecs(g.state, false, [], false, undefined, { facilityOpen: true }), 'ui.qk')[4];
    expect(String(off.state!.label)).toBe('设施');
    expect(String(on.state!.label)).toBe('设施 ✓');
    expect(on.fixed!.cx).toBe(HUD_QK_FACILITY_X + HUD_QK_W / 2);
    expect(on.fixed!.cy).toBe(HUD_QK_Y + HUD_QK_H / 2);

    /* AI 回合：设施键与出手牌 / 出售 / 银行 / 商店键一样不推（该区位空着） */
    const aiSeats: Seat[] = [null, 'conservative', 'aggressive', 'speculative'];
    g.state.current = 1;
    expect(hitAreas(g.state, aiSeats).some((a) => a.action === 'facility')).toBe(false);
    expect(byId(hudSpecs(g.state, false, aiSeats), 'ui.qk').length).toBe(2);
  });

  it('快键行 5 槽：cx 逐值命中 5 个 x 常量，右缘不越舞台宽', () => {
    const g = createGame({ seed: 1 });
    const qks = byId(hudSpecs(g.state), 'ui.qk');
    expect(qks.map((s) => s.fixed!.cx)).toEqual([
      HUD_QK_SKIP_X + HUD_QK_W / 2, HUD_QK_FAST_X + HUD_QK_W / 2, HUD_QK_STORE_X + HUD_QK_W / 2,
      HUD_QK_BANK_X + HUD_QK_W / 2, HUD_QK_FACILITY_X + HUD_QK_W / 2,
    ]);
    /* 五槽均落同一 y；最右（手牌键）右缘 ≤ 舞台宽 */
    expect(qks.every((s) => s.fixed!.cy === HUD_QK_Y + HUD_QK_H / 2)).toBe(true);
    expect(HUD_QK_SKIP_X + HUD_QK_W).toBeLessThanOrEqual(STAGE_W);
  });
});