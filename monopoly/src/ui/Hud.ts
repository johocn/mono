import { PLAYER_NAME } from '../data/board';
import { buyPrice, canUpgrade, nextLevel } from '../data/economy';
import { buyable } from '../core/estate';
import { currentPlayer, netWorth, type Game, type GameState } from '../core/game';
import type { ElementSpec } from '../skin/instantiate';
import {
  BOTTOM_BTN_Y, DOCK_Y, HUD_BAR_GAP, HUD_BAR_H, HUD_BAR_W, HUD_BAR_X0, HUD_BAR_Y,
  HUD_BTN_BUY_X, HUD_BTN_H, HUD_BTN_PRIMARY_W, HUD_BTN_PRIMARY_X, HUD_BTN_SECONDARY_W,
  HUD_BTN_UPGRADE_X, HUD_DICE_DX, HUD_DICE_SIZE, HUD_DICE_X0, HUD_DICE_Y,
  HUD_DOCK_H, HUD_LABEL_Y, STAGE_W,
} from '../skin/layout';

/** 主按钮在四个阶段里的动作（spec §5.1 回合流程的显式化）；监狱禁行时为 `skip` */
export type HudPrimaryAction = 'roll' | 'move' | 'settle' | 'end' | 'skip';
export type HudActionId = HudPrimaryAction | 'buy' | 'upgrade';

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

export function primaryLabel(state: GameState, fxBusy = false): string {
  const a = primaryAction(state);
  if (a !== null && fxBusy) return '跳过';
  if (a === 'skip') return `跳过（${jailed(state)}）`;
  return a ? PRIMARY_LABEL[a] : '本局结束';
}

/** 当前玩家的买地报价；不在 settled / 非 shop / 已有主 → null */
export function buyOffer(state: GameState): { price: number; enabled: boolean } | null {
  if (state.over || state.phase !== 'settled') return null;
  const p = currentPlayer(state);
  if (!buyable(p.pos) || state.estates[p.pos]) return null;
  const price = buyPrice(1);
  return { price, enabled: p.cash >= price };
}

/** 当前玩家的升级报价；不在 settled / 非自有 / 已封顶 → null */
export function upgradeOffer(state: GameState): { cost: number; enabled: boolean } | null {
  if (state.over || state.phase !== 'settled') return null;
  const p = currentPlayer(state);
  const e = state.estates[p.pos];
  if (!e || e.owner !== p.id || !canUpgrade(e.level)) return null;
  const cost = buyPrice(nextLevel(e.level));
  return { cost, enabled: p.cash >= cost };
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
export function hudSpecs(state: GameState, fxBusy = false): ElementSpec[] {
  const out: ElementSpec[] = [];
  const bar = (id: string, r: number, cx: number, cy: number, st: Record<string, unknown>, slot = null): void => {
    out.push({ id, slot, c: 0, r, pass: 4, fixed: { cx, cy, s: 1 }, state: st });
  };

  bar('ui.dock', 0, STAGE_W / 2, DOCK_Y + HUD_DOCK_H / 2, { round: state.round });
  bar('ui.label', 1, STAGE_W / 2, HUD_LABEL_Y, { text: statusText(state) });

  state.players.forEach((p, i) => {
    bar('ui.playerBar', 2 + i, barCx(i), HUD_BAR_Y + HUD_BAR_H / 2, {
      owner: p.id, name: PLAYER_NAME[p.id - 1], cash: p.cash,
      active: i === state.current, bankrupt: p.bankrupt,
    });
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

  bar('ui.button.primary', 10, HUD_BTN_PRIMARY_X + HUD_BTN_PRIMARY_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
    action: primaryAction(state), label: primaryLabel(state, fxBusy), enabled: primaryAction(state) !== null,
  });

  const buy = buyOffer(state);
  if (buy) {
    bar('ui.button.secondary', 11, HUD_BTN_BUY_X + HUD_BTN_SECONDARY_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
      action: 'buy', label: `买地 ￥${buy.price}`, enabled: buy.enabled,
    });
  }
  const up = upgradeOffer(state);
  if (up) {
    bar('ui.button.secondary', 12, HUD_BTN_UPGRADE_X + HUD_BTN_SECONDARY_W / 2, BOTTOM_BTN_Y + HUD_BTN_H / 2, {
      action: 'upgrade', label: `升级 ￥${up.cost}`, enabled: up.enabled,
    });
  }
  return out;
}

/** 透明 DOM 命中层的矩形来源（与 hudSpecs 的按钮台位一一对应） */
export function hitAreas(state: GameState): HitArea[] {
  const out: HitArea[] = [];
  const pa = primaryAction(state);
  if (pa) {
    out.push({ action: pa, x: HUD_BTN_PRIMARY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_PRIMARY_W, h: HUD_BTN_H, enabled: true });
  }
  const buy = buyOffer(state);
  if (buy) {
    out.push({ action: 'buy', x: HUD_BTN_BUY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H, enabled: buy.enabled });
  }
  const up = upgradeOffer(state);
  if (up) {
    out.push({ action: 'upgrade', x: HUD_BTN_UPGRADE_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H, enabled: up.enabled });
  }
  return out;
}

/**
 * 挂透明命中层：容器不吃事件，只有命中区 `<button>` 吃。
 * 按钮的**可见像素**由 `hudSpecs` + proc preset 画在画布上（spec §3.6：可见元素必须可换素材）。
 */
export function mountHud(root: HTMLElement, game: Game, onAction: (a: HudActionId) => void): HudHandle {
  const layer = document.createElement('div');
  layer.id = 'mono-hud';
  layer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:8';
  root.appendChild(layer);

  const update = (): void => {
    layer.textContent = '';
    const pa = primaryAction(game.state);
    for (const a of hitAreas(game.state)) {
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