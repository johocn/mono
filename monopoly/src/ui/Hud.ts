import { brandAt, PLAYER_NAME } from '../data/board';
import { buyPrice, canUpgrade, nextLevel } from '../data/economy';
import { buyable, discounted, ownedBy } from '../core/estate';
import { buyDiscountOf, currentPlayer, netWorth, type Game, type GameState } from '../core/game';
import { abilityOfPlayer } from '../data/abilities';
/** AI 席位（`null` = 真人）；从 `src/data/ai` 取，避免 ui → ui 横向依赖 */
import { PERSONA_LABEL, type Persona, type Seat } from '../data/ai';
/** 债务条口径（M20.2）：与银行浮层共用同一纯函数，避免两处各算一套 */
import { bankDebtView } from './panels';
import type { ElementSpec } from '../skin/instantiate';
import {
  BOTTOM_BTN_Y, DOCK_Y, HUD_BAR_GAP, HUD_BAR_H, HUD_BAR_W, HUD_BAR_X0, HUD_BAR_Y,
  HUD_BTN_AI_W, HUD_BTN_AI_X, HUD_BTN_BUY_X, HUD_BTN_H, HUD_BTN_PRIMARY_W, HUD_BTN_PRIMARY_X,
  HUD_BTN_SECONDARY_W, HUD_BTN_UPGRADE_X, HUD_DICE_DX, HUD_DICE_SIZE, HUD_DICE_X0, HUD_DICE_Y,
  HUD_DEBT_H, HUD_DEBT_W, HUD_DEBT_X, HUD_DEBT_Y,
  AUDIO_BGM_BOX, AUDIO_KEY_SIZE, AUDIO_SFX_BOX,
  HUD_DOCK_H, HUD_LABEL_SHIFT_X, HUD_LABEL_Y, HUD_PERSONA_DX, HUD_PERSONA_DY,
  HUD_QK_BANK_X, HUD_QK_FACILITY_X, HUD_QK_FAST_X, HUD_QK_H, HUD_QK_SKIP_X, HUD_QK_STORE_X, HUD_QK_W, HUD_QK_Y, STAGE_W,
  TILE_CARD_BTN_Y, TILE_CARD_H, TILE_CARD_W, TILE_CARD_X, TILE_CARD_Y,
} from '../skin/layout';

/** 主按钮在四个阶段里的动作（spec §5.1 回合流程的显式化）；监狱禁行时为 `skip` */
export type HudPrimaryAction = 'roll' | 'move' | 'settle' | 'end' | 'skip';
export type HudActionId =
  HudPrimaryAction | 'buy' | 'upgrade' | 'hand' | 'sell' | 'bank' | 'store' | 'facility'
  | 'ai:fast' | 'ai:skip' | 'audio:sfx' | 'audio:bgm';

/**
 * HUD 的运行时可见性开关（由 `main.ts` 按局面派生，HUD 自身不读浮层状态，避免 ui → ui 横向依赖）：
 * - `tileCard`：落地地块卡滑入（`settled` + 无浮层 + 抽屉收起 + 非 AI 回合）
 * - `handOpen`：手牌抽屉是否展开（教程期间强制展开，保证第 3 步高亮得到 5 个手牌槽）
 * - `callout`：顶部状态条播报（有气泡时替换轮次文案，让「谁前进几步」在大屏顶部也读得到）
 * - `bankOpen`：银行浮层是否展开（仅切「银行」键标签；浮层可见性由 `panels.overlayOf` 派生）
 * - `storeOpen`：商店浮层是否展开（仅切「商店」键标签；同上）
 * - `facilityOpen`：设施浮层是否展开（M20.4；仅切「设施」键标签；同上）
 */
export interface HudUiOpts {
  tileCard?: boolean;
  handOpen?: boolean;
  callout?: string;
  bankOpen?: boolean;
  storeOpen?: boolean;
  facilityOpen?: boolean;
}

export interface HitArea {
  action: HudActionId;
  x: number; y: number; w: number; h: number;
  enabled: boolean;
}

export interface HudHandle {
  /** 状态推进后重排命中层（画面由 `scene.render()` 重建，这里只管可点性） */
  update(): void;
}

const PRIMARY_LABEL: Record<HudPrimaryAction, string> = {
  roll: '掷骰', move: '前进', settle: '结算', end: '结束回合', skip: '跳过',
};

/** 当前玩家是否处于监狱禁行（`jail` 与新状态字段对 M4 老状态做防御性可选读） */
function jailed(state: GameState): number {
  return state.jail?.[state.current] ?? 0;
}

export function primaryAction(state: GameState): HudPrimaryAction | null {
  if (state.over) return null;
  if (state.phase === 'idle' && jailed(state) > 0) return 'skip';
  switch (state.phase) {
    case 'idle': return 'roll';
    case 'rolled': return 'move';
    case 'moved': return 'settle';
    default: return 'end';
  }
}

export function primaryLabel(state: GameState, fxBusy = false, aiPersona: Persona | null = null): string {
  if (aiPersona) return `AI 思考中 · ${PERSONA_LABEL[aiPersona]}`;
  const a = primaryAction(state);
  if (a !== null && fxBusy) return '跳过';
  if (a === 'skip') return `跳过（${jailed(state)}）`;
  return a ? PRIMARY_LABEL[a] : '本局结束';
}

/** 当前玩家的买地报价（技能折扣后的实付价）；不在 settled / 非 shop / 已有主 → null */
export function buyOffer(state: GameState): { price: number; enabled: boolean } | null {
  if (state.over || state.phase !== 'settled') return null;
  const p = currentPlayer(state);
  if (!buyable(p.pos) || state.estates[p.pos]) return null;
  const price = discounted(buyPrice(1), buyDiscountOf(state, p.id));
  return { price, enabled: p.cash >= price };
}

/** 当前玩家的升级报价；不在 settled / 非自有 / 已封顶 → null（施工中保留报价但不可用） */
export function upgradeOffer(state: GameState): { cost: number; enabled: boolean } | null {
  if (state.over || state.phase !== 'settled') return null;
  const p = currentPlayer(state);
  const e = state.estates[p.pos];
  if (!e || e.owner !== p.id || !canUpgrade(e.level)) return null;
  const cost = buyPrice(nextLevel(e.level));
  return { cost, enabled: !e.processing && p.cash >= cost };
}

/** 底坞顶部状态行（轮次 / 行动玩家 / 胜负） */
export function statusText(state: GameState): string {
  if (state.over) {
    /* 与 winnerOf 同口径（净资产 = 现金 + 地产账面投入）——否则状态行与 `__monoMain.sim()` 的返回值会不一致 */
    const alive = state.players.filter((p) => !p.bankrupt);
    const pool = alive.length > 0 ? alive : state.players;
    let best = pool[0];
    for (const p of pool) {
      const a = netWorth(state, p);
      const b = netWorth(state, best);
      if (a > b || (a === b && p.id < best.id)) best = p;
    }
    return `本局结束 · 胜者 ${PLAYER_NAME[best.id - 1]}`;
  }
  const cur = currentPlayer(state);
  const j = jailed(state);
  const base = `第 ${state.round} 轮 · 轮到 ${PLAYER_NAME[cur.id - 1]}`;
  return j > 0 ? `${base} · 禁行 ${j} 回合` : base;
}

/** bar 的中心 x（i = players 下标） */
function barCx(i: number): number {
  return HUD_BAR_X0 + HUD_BAR_W / 2 + i * (HUD_BAR_W + HUD_BAR_GAP);
}

/**
 * HUD 的 instantiate spec（全部 `pass: 4` + `fixed` 定格台位）。
 * `c` 恒为 0、`r` 递增 —— depth（= c+r）升序即绘制序：底坞 → 标签 → 资产条 → 骰体 → 骰面 → 按钮。
 */
export function hudSpecs(
  state: GameState, fxBusy = false, seats: readonly Seat[] = [], fast = false,
  audio: { sfx: boolean; bgm: boolean } = { sfx: true, bgm: true },
  ui: HudUiOpts = {},
): ElementSpec[] {
  const out: ElementSpec[] = [];
  const bar = (id: string, r: number, cx: number, cy: number, st: Record<string, unknown>, s = 1): void => {
    out.push({ id, slot: null, c: 0, r, pass: 4, fixed: { cx, cy, s }, state: st });
  };

  const aiSeat = state.over ? null : (seats[state.current] ?? null);

  /* 两枚静音键常驻于顶部右侧（spec §7.3）：必须在 AI 分支早退之前推入，且 r 继续递增
     （10 主按钮、11/12 次要键、13 牌袋键、14 出售键、15 商店键、16 银行键、17 设施键、
     18/19 静音键、20 地块卡、21/22 卡上键、23 债务条） */
  const pushAudioKeys = (): void => {
    const half = AUDIO_KEY_SIZE / 2;
    bar(audio.sfx ? 'ui.sound.on' : 'ui.sound.off', 18,
      AUDIO_SFX_BOX.left + half, AUDIO_SFX_BOX.top + half, { on: audio.sfx });
    bar(audio.bgm ? 'ui.music.on' : 'ui.music.off', 19,
      AUDIO_BGM_BOX.left + half, AUDIO_BGM_BOX.top + half, { on: audio.bgm });
  };
  /* 牌袋键（spec §7.3）：复用状态行右侧「跳过本次」键位（不新增 id）；仅真人回合推入 */
  const pushHandKey = (): void => {
    bar('ui.qk', 13, HUD_QK_SKIP_X + HUD_QK_W / 2, HUD_QK_Y + HUD_QK_H / 2, {
      label: ui.handOpen === true ? '收起手牌' : '手牌', enabled: true,
    });
  };
  /* 「出售」键（spec §3.5 / §3.6 B）：真人回合落在 `HUD_QK_FAST_X`（AI 回合的「加速」占用位）；
     无地时保留键位并置灰（enabled=false），避免布局跳动 */
  const pushSellKey = (): void => {
    const p = currentPlayer(state);
    bar('ui.qk', 14, HUD_QK_FAST_X + HUD_QK_W / 2, HUD_QK_Y + HUD_QK_H / 2, {
      label: '出售', enabled: ownedBy(state.estates, p.id).length > 0,
    });
  };
  /* 「商店」键（M20.3 spec §5.1）：真人回合常开（`idle` / `settled` 均可开），落在 `HUD_QK_STORE_X`
     （59..131，与「银行」135..207 留 4px 间隙） */
  const pushStoreKey = (): void => {
    bar('ui.qk', 15, HUD_QK_STORE_X + HUD_QK_W / 2, HUD_QK_Y + HUD_QK_H / 2, {
      label: ui.storeOpen === true ? '商店 ✓' : '商店', enabled: true,
    });
  };
  /* 「银行」键（M20.2 spec §3.8）：真人回合常开（`idle` / `settled` 均可开浮层），落在新建的
     `HUD_QK_BANK_X` 位（与「出售」211..283、「跳过本次」287..359 不重叠） */
  const pushBankKey = (): void => {
    bar('ui.qk', 16, HUD_QK_BANK_X + HUD_QK_W / 2, HUD_QK_Y + HUD_QK_H / 2, {
      label: ui.bankOpen === true ? '银行 ✓' : '银行', enabled: true,
    });
  };
  /* 「设施」键（M20.4 spec §6.3 / F-D15）：真人回合常开（与银行 / 商店三方互斥），
     落在新建的 `HUD_QK_FACILITY_X` 位（快键行最左，与「商店」83..155 留 4px 间隙） */
  const pushFacilityKey = (): void => {
    bar('ui.qk', 17, HUD_QK_FACILITY_X + HUD_QK_W / 2, HUD_QK_Y + HUD_QK_H / 2, {
      label: ui.facilityOpen === true ? '设施 ✓' : '设施', enabled: true,
    });
  };
  /* 债务条（M20.2 spec §3.8）：顶部 HUD 条中段，四段读当前玩家信贷口径；
     无信贷（存款 / 贷款 / 抵押 / 保证金借款全空）时**整条隐藏**，保老对局画面逐像素不变（零回归） */
  const pushDebtBar = (): void => {
    const p = currentPlayer(state);
    if (p.deposit <= 0 && p.loan === null && p.mortgages.length === 0 && (p.margin?.principal ?? 0) <= 0) return;
    const v = bankDebtView(state, p.id);
    bar('ui.debtBar', 23, HUD_DEBT_X + HUD_DEBT_W / 2, HUD_DEBT_Y + HUD_DEBT_H / 2, {
      deposit: v.deposit, debt: v.debt, mortgageCount: v.mortgageCount, overdue: v.overdue,
      /* 逾期段用警示色（spec §3.8B）：由 preset 依 `warn` 选语义色，HUD 只给口径 */
      warn: v.overdue > 0,
    });
  };

  bar('ui.dock', 0, STAGE_W / 2, DOCK_Y + HUD_DOCK_H / 2, { round: state.round });
  /* 状态行：AI 回合把文字左移，给右侧「加速 / 跳过」让位；有气泡播报时优先显示播报 */
  bar('ui.label', 1, STAGE_W / 2, HUD_LABEL_Y, { text: ui.callout ?? statusText(state), dx: aiSeat ? HUD_LABEL_SHIFT_X : 0 });

  state.players.forEach((p, i) => {
    const cy = HUD_BAR_Y + HUD_BAR_H / 2;
    bar('ui.playerBar', 2 + i, barCx(i), cy, {
      owner: p.id, name: PLAYER_NAME[p.id - 1], cash: p.cash,
      active: i === state.current, bankrupt: p.bankrupt,
      /* 角色技能（`data/abilities.ts`）：技能局在该席位资产条角上挂技能名徽标；未启用 → 空串不画 */
      skill: state.abilitiesOn ? abilityOfPlayer(p.id).name : '',
    });
    const seat = seats[i] ?? null;
    if (seat) bar('ui.personaTag', 2 + i, barCx(i) + HUD_PERSONA_DX, cy + HUD_PERSONA_DY, { text: PERSONA_LABEL[seat] });
  });

  const d = state.dice;
  /* 骰体与骰面分两轮推入：保证 r 单调递增（6,7 骰体 → 8,9 骰面），
     与「depth（c=0 时 = r）升序即绘制序」一致；骰面必须落在骰体之上 */
  for (let k = 0; k < 2; k++) {
    bar('dice.body', 6 + k, HUD_DICE_X0 + HUD_DICE_SIZE / 2 + k * HUD_DICE_DX, HUD_DICE_Y + HUD_DICE_SIZE / 2, { roll: Boolean(d) });
  }
  for (let k = 0; k < 2; k++) {
    const pips = d ? (k === 0 ? d.d1 : d.d2) : 1;
    bar(`dice.face${pips}`, 8 + k, HUD_DICE_X0 + HUD_DICE_SIZE / 2 + k * HUD_DICE_DX, HUD_DICE_Y + HUD_DICE_SIZE / 2, { pips, blank: !d });
  }

  if (aiSeat) {
    /* AI 回合：命中区全禁用，主按钮整行拉宽显示「AI 思考中 · <性格>」 */
    bar('ui.button.wide', 10, HUD_BTN_AI_X + HUD_BTN_AI_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
      label: primaryLabel(state, fxBusy, aiSeat), enabled: false,
    });
    bar('ui.qk', 11, HUD_QK_FAST_X + HUD_QK_W / 2, HUD_QK_Y + HUD_QK_H / 2, {
      label: fast ? '加速 ✓' : '加速 ×2', enabled: true,
    });
    bar('ui.qk', 12, HUD_QK_SKIP_X + HUD_QK_W / 2, HUD_QK_Y + HUD_QK_H / 2, {
      label: '跳过本次', enabled: true,
    });
    pushAudioKeys();
    /* AI 回合也显示当前玩家的债务条（纯信息，不吃事件，不影响驱动器） */
    pushDebtBar();
    return out;
  }

  const pos = currentPlayer(state).pos;
  const card = ui.tileCard === true;
  bar('ui.button.primary', 10, HUD_BTN_PRIMARY_X + HUD_BTN_PRIMARY_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
    action: primaryAction(state), label: primaryLabel(state, fxBusy), enabled: primaryAction(state) !== null,
  });

  const buy = buyOffer(state);
  const up = upgradeOffer(state);
  /* 地块卡在场时，买地 / 升级只在卡上承载（同一动作只存在一组可见 + 可点元素，spec §7.3） */
  if (!card) {
    if (buy) {
      bar('ui.button.secondary', 11, HUD_BTN_BUY_X + HUD_BTN_SECONDARY_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
        action: 'buy', label: `买地 ￥${buy.price}`, enabled: buy.enabled,
      });
    }
    if (up) {
      bar('ui.button.secondary', 12, HUD_BTN_UPGRADE_X + HUD_BTN_SECONDARY_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
        action: 'upgrade', label: `升级 ￥${up.cost}`, enabled: up.enabled,
      });
    }
  }
  pushHandKey();
  pushSellKey();
  pushStoreKey();
  pushBankKey();
  pushFacilityKey();
  pushAudioKeys();

  if (card) {
    const e = state.estates[pos];
    bar('ui.tileCard', 20, TILE_CARD_X + TILE_CARD_W / 2, TILE_CARD_Y + TILE_CARD_H / 2, {
      title: `停在 ${brandAt(pos)} · 你在这里`,
      sub: e
        ? `等级 L${e.level} · 持有 ${PLAYER_NAME[e.owner - 1]}`
        : (buyable(pos) ? '尚未售出 · 可买下' : '不可购置'),
    });
    const by = TILE_CARD_BTN_Y + HUD_BTN_H / 2;
    if (buy) {
      bar('ui.button.secondary', 21, HUD_BTN_BUY_X + HUD_BTN_SECONDARY_W / 2, by, {
        action: 'buy', label: `买地 ￥${buy.price}`, enabled: buy.enabled,
      });
    }
    if (up) {
      bar('ui.button.secondary', 22, HUD_BTN_UPGRADE_X + HUD_BTN_SECONDARY_W / 2, by, {
        action: 'upgrade', label: `升级 ￥${up.cost}`, enabled: up.enabled,
      });
    }
  }
  pushDebtBar();
  return out;
}

/** 透明 DOM 命中层的矩形来源（与 hudSpecs 的按钮台位一一对应） */
export function hitAreas(state: GameState, seats: readonly Seat[] = [], ui: HudUiOpts = {}): HitArea[] {
  const out: HitArea[] = [];
  /* 两枚静音键无条件常驻（spec §7.2）：必须在 `state.over` 与 AI 两条早退路径**之前**推入 */
  out.push(
    { action: 'audio:sfx', x: AUDIO_SFX_BOX.left, y: AUDIO_SFX_BOX.top, w: AUDIO_KEY_SIZE, h: AUDIO_KEY_SIZE, enabled: true },
    { action: 'audio:bgm', x: AUDIO_BGM_BOX.left, y: AUDIO_BGM_BOX.top, w: AUDIO_KEY_SIZE, h: AUDIO_KEY_SIZE, enabled: true },
  );
  if (state.over) return out;
  /* AI 回合：主按钮整行且禁用；两枚快捷键可点（加速 / 跳过本次），牌袋键不出 */
  if (seats[state.current]) {
    return out.concat([
      { action: primaryAction(state) ?? 'end', x: HUD_BTN_AI_X, y: BOTTOM_BTN_Y, w: HUD_BTN_AI_W, h: HUD_BTN_H, enabled: false },
      { action: 'ai:fast', x: HUD_QK_FAST_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true },
      { action: 'ai:skip', x: HUD_QK_SKIP_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true },
    ]);
  }
  /* 牌袋键（开合抽屉不改 state，故与「跳过本次」同区位复用）；仅真人回合存在 */
  out.push({ action: 'hand', x: HUD_QK_SKIP_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true });
  /* 「出售」键（spec §3.5）：落在 AI 回合「加速」占用位；无地时置灰（与 hudSpecs 同源） */
  out.push({
    action: 'sell', x: HUD_QK_FAST_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H,
    enabled: ownedBy(state.estates, currentPlayer(state).id).length > 0,
  });
  /* 「银行」键（M20.2 spec §3.8）：真人回合常开；落在 `HUD_QK_BANK_X`（AI 回合该位空着也不出） */
  out.push({
    action: 'bank', x: HUD_QK_BANK_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true,
  });
  /* 「商店」键（M20.3 spec §5.1）：真人回合常开；落在 `HUD_QK_STORE_X` */
  out.push({
    action: 'store', x: HUD_QK_STORE_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true,
  });
  /* 「设施」键（M20.4 spec §6.3 / F-D15）：真人回合常开；落在快键行最左 `HUD_QK_FACILITY_X`
     （AI 回合不出，与手牌 / 出售 / 银行 / 商店一致） */
  out.push({
    action: 'facility', x: HUD_QK_FACILITY_X, y: HUD_QK_Y, w: HUD_QK_W, h: HUD_QK_H, enabled: true,
  });
  const pa = primaryAction(state);
  if (pa) {
    out.push({ action: pa, x: HUD_BTN_PRIMARY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_PRIMARY_W, h: HUD_BTN_H, enabled: true });
  }
  const buy = buyOffer(state);
  const up = upgradeOffer(state);
  /* 地块卡在场时两枚次要键落到卡上（与视觉同一组常量 `TILE_CARD_BTN_Y`，spec §12 高风险项） */
  if (ui.tileCard === true) {
    if (buy) {
      out.push({ action: 'buy', x: HUD_BTN_BUY_X, y: TILE_CARD_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H, enabled: buy.enabled });
    }
    if (up) {
      out.push({ action: 'upgrade', x: HUD_BTN_UPGRADE_X, y: TILE_CARD_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H, enabled: up.enabled });
    }
    return out;
  }
  if (buy) {
    out.push({ action: 'buy', x: HUD_BTN_BUY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H, enabled: buy.enabled });
  }
  if (up) {
    out.push({ action: 'upgrade', x: HUD_BTN_UPGRADE_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H, enabled: up.enabled });
  }
  return out;
}

/**
 * 挂透明命中层：容器不吃事件，只有命中区 `<button>` 吃。
 * 按钮的**可见像素**由 `hudSpecs` + proc preset 画在画布上（spec §3.6：可见元素必须可换素材）。
 * `view` 让命中层跟上席位归属与加速态（默认全真人 / 未加速）。
 */
export function mountHud(
  root: HTMLElement, game: Game, onAction: (a: HudActionId) => void,
  view: () => { seats: readonly Seat[]; fast: boolean; ui: HudUiOpts } =
    () => ({ seats: [], fast: false, ui: {} }),
): HudHandle {
  const layer = document.createElement('div');
  layer.id = 'mono-hud';
  layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:8';
  root.appendChild(layer);

  const update = (): void => {
    layer.textContent = '';
    const v = view();
    const pa = primaryAction(game.state);
    for (const a of hitAreas(game.state, v.seats, v.ui)) {
      const b = document.createElement('button');
      b.dataset.action = a.action;
      if (a.action === pa) b.dataset.primary = '1';
      b.disabled = !a.enabled;
      b.style.cssText =
        `position:absolute;left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px;` +
        `background:transparent;border:0;padding:0;` +
        (a.enabled ? 'pointer-events:auto;cursor:pointer;' : 'pointer-events:none;');
      b.onclick = () => onAction(a.action);
      layer.appendChild(b);
    }
  };

  update();
  return { update };
}