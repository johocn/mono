/**
 * 广告宣传版（M21）· 紧凑 HUD（DOM 版，方案 A 及各案共用）
 *
 * 广告版游戏区只有 281px，原版 canvas 底坞（606..790，`hudSpecs`）放不下——
 * 本层用 DOM 在 734..844 重排：状态行 + 4 段资产条 + 骰/主按钮行 + 5 快捷键。
 * 业务判定 **零复制**：主按钮阶段机 / 买地报价 / 升级报价 / 命中区 enabled
 * 全部复用 `ui/Hud.ts` 导出的纯函数（`hitAreas` 给 enabled 口径）；
 * 动作走同一 `HudActionId` 通道（main.ts 的 `hudAction` 回调原样消费）。
 * 配色只消费 `var(--ad-*)`；布局只取 `adLayout.ts` 的 AD_HUD_* 常量。
 */
import {
  buyOffer, hitAreas, primaryAction, primaryLabel, statusText, upgradeOffer,
  type HudActionId, type HudHandle, type HudUiOpts,
} from '../ui/Hud';
import { bankDebtView, newsTickerSpecOf } from '../ui/panels';
import { endgameStageOf, inEndgame } from '../core/endgame';
import { PLAYER_NAME } from '../data/board';
import type { Seat } from '../data/ai';
import {
  AD_HUD_BARS_Y, AD_HUD_CTRL_Y, AD_HUD_DICE, AD_HUD_H, AD_HUD_QK_Y, AD_HUD_STATUS_Y, AD_HUD_TOP,
} from './adLayout';

export interface AdHudDeps {
  /** 静音键状态（与 canvas 版 `audio.prefs()` 同口径） */
  prefs: () => { sfx: boolean; bgm: boolean };
}

export interface AdHudHandle extends HudHandle {
  destroy(): void;
}

type View = () => { seats: readonly Seat[]; fast: boolean; ui: HudUiOpts };

let styleDone = false;

function ensureStyle(): void {
  if (styleDone || typeof document === 'undefined') return;
  styleDone = true;
  const st = document.createElement('style');
  st.id = 'mono-ad-hud-style';
  st.textContent = `
#mono-ad-hud { position:absolute; left:0; top:${AD_HUD_TOP}px; width:100%; height:${AD_HUD_H}px;
  z-index:8; pointer-events:none; color:var(--ad-text); font-family:inherit; }
#mono-ad-hud button { pointer-events:auto; font-family:inherit; cursor:pointer; }
#mono-ad-hud .moadh-row { position:absolute; left:6px; right:6px; display:flex; align-items:center; gap:4px; }
#mono-ad-hud .moadh-status { top:${AD_HUD_STATUS_Y}px; height:16px; font-size:11px; color:var(--ad-text-dim); }
#mono-ad-hud .moadh-status .moadh-text { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#mono-ad-hud .moadh-news { flex:0 1 45%; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  font-size:10px; border-radius:7px; padding:1px 6px; background:var(--ad-bg-deep); color:var(--ad-text-dim); }
#mono-ad-hud .moadh-news.up { color:var(--ad-accent); }
#mono-ad-hud .moadh-debt { flex:0 0 auto; font-size:10px; border-radius:7px; padding:1px 6px;
  background:var(--ad-accent); color:var(--ad-on-accent); }
#mono-ad-hud .moadh-audio { flex:0 0 auto; width:20px; height:14px; border-radius:6px; font-size:9px; line-height:1;
  border:1px solid var(--ad-card-edge); background:var(--ad-card); color:var(--ad-text-dim); padding:0; }
#mono-ad-hud .moadh-audio.off { opacity:.45; }
#mono-ad-hud .moadh-bars { top:${AD_HUD_BARS_Y}px; height:18px; gap:3px; }
#mono-ad-hud .moadh-bar { flex:1; min-width:0; border:1px solid var(--ad-card-edge); border-radius:7px;
  background:var(--ad-card); padding:1px 6px; font-size:9px; line-height:1.2;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--ad-text-dim); }
#mono-ad-hud .moadh-bar.act { background:var(--ad-gold); border-color:var(--ad-gold); color:var(--ad-on-gold); font-weight:700; }
#mono-ad-hud .moadh-bar.dead { opacity:.4; text-decoration:line-through; }
#mono-ad-hud .moadh-ctrl { top:${AD_HUD_CTRL_Y}px; height:32px; gap:5px; }
#mono-ad-hud .moadh-die { flex:0 0 ${AD_HUD_DICE.size}px; height:${AD_HUD_DICE.size}px; border-radius:6px;
  border:1px solid var(--ad-brown); background:var(--ad-card); display:grid;
  grid-template:repeat(3, 1fr) / repeat(3, 1fr); padding:3px; box-sizing:border-box; }
#mono-ad-hud .moadh-die i { border-radius:50%; background:var(--ad-brown); place-self:center;
  width:4px; height:4px; visibility:hidden; }
#mono-ad-hud .moadh-die i.on { visibility:visible; }
#mono-ad-hud .moadh-btn { border-radius:8px; border:1px solid var(--ad-card-edge); background:var(--ad-card);
  color:var(--ad-text); font-size:12px; padding:0 8px; }
#mono-ad-hud .moadh-btn:disabled { opacity:.45; cursor:default; }
#mono-ad-hud .moadh-btn.primary { background:var(--ad-gold); border-color:var(--ad-gold);
  color:var(--ad-on-gold); font-weight:700; }
#mono-ad-hud .moadh-btn.wide { flex:1; }
#mono-ad-hud .moadh-qk { top:${AD_HUD_QK_Y}px; height:24px; }
#mono-ad-hud .moadh-qk .moadh-btn { flex:1; font-size:11px; }
#mono-ad-hud .moadh-qk .moadh-btn.on { border-color:var(--ad-gold); color:var(--ad-accent); font-weight:700; }
`;
  document.head.appendChild(st);
}

/** 骰面 → 3×3 九宫格点位（下标 0..8） */
const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function dieEl(pips: number | null): HTMLElement {
  const die = document.createElement('div');
  die.className = 'moadh-die';
  const on = pips === null ? [] : PIPS[pips] ?? [];
  for (let i = 0; i < 9; i++) {
    const dot = document.createElement('i');
    if (on.includes(i)) dot.className = 'on';
    die.appendChild(dot);
  }
  return die;
}

/**
 * 挂广告版紧凑 HUD；`view` / `onAction` 与 `mountHud` 同签名（main.ts 零适配成本）。
 * enabled 判定统一走 `hitAreas`（与 canvas 版命中区同源一份）。
 */
export function mountAdHud(
  root: HTMLElement, game: { state: Parameters<typeof hitAreas>[0] }, onAction: (a: HudActionId) => void,
  view: View, deps: AdHudDeps,
): AdHudHandle {
  ensureStyle();
  const layer = document.createElement('div');
  layer.id = 'mono-ad-hud';
  root.appendChild(layer);

  const button = (cls: string, action: HudActionId | null, label: string, enabled: boolean): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.disabled = !enabled;
    if (action) b.onclick = () => onAction(action);
    return b;
  };

  const update = (): void => {
    layer.textContent = '';
    const state = game.state;
    const v = view();
    const aiSeat = state.over ? null : (v.seats[state.current] ?? null);
    const prefs = deps.prefs();
    /* enabled 口径与 canvas 版命中区同源：action → enabled 映射 */
    const enabledOf = new Map<HudActionId, boolean>();
    for (const a of hitAreas(state, v.seats, v.ui)) enabledOf.set(a.action, a.enabled);

    /* —— 状态行：状态 + 新闻 + 债务 + 两枚静音键 —— */
    const status = document.createElement('div');
    status.className = 'moadh-row moadh-status';
    const stText = document.createElement('span');
    stText.className = 'moadh-text';
    stText.textContent = statusText(state) + (inEndgame(state.round) ? ` · ${endgameStageOf(state.round).label}` : '');
    status.appendChild(stText);
    const news = newsTickerSpecOf(state);
    if (news) {
      const ns = news.state as { sentiment?: unknown; prefix?: unknown; title?: unknown };
      const n = document.createElement('span');
      n.className = `moadh-news${ns.sentiment === 'good' ? ' up' : ''}`;
      n.textContent = `${String(ns.prefix ?? '')} · ${String(ns.title ?? '')}`;
      status.appendChild(n);
    }
    const p0 = state.players[state.current];
    const debt = bankDebtView(state, p0.id);
    if (debt.debt > 0) {
      const d = document.createElement('span');
      d.className = 'moadh-debt';
      d.textContent = `欠 ￥${debt.debt}`;
      status.appendChild(d);
    }
    status.appendChild(button(`moadh-audio${prefs.sfx ? '' : ' off'}`, 'audio:sfx', '音', true));
    status.appendChild(button(`moadh-audio${prefs.bgm ? '' : ' off'}`, 'audio:bgm', '乐', true));
    layer.appendChild(status);

    /* —— 资产条（4 段）—— */
    const bars = document.createElement('div');
    bars.className = 'moadh-row moadh-bars';
    state.players.forEach((pl, i) => {
      const bar = document.createElement('div');
      bar.className = `moadh-bar${i === state.current ? ' act' : ''}${pl.bankrupt ? ' dead' : ''}`;
      bar.textContent = `${PLAYER_NAME[pl.id - 1]} ￥${pl.cash}`;
      bars.appendChild(bar);
    });
    layer.appendChild(bars);

    /* —— 骰 + 主按钮行 —— */
    const ctrl = document.createElement('div');
    ctrl.className = 'moadh-row moadh-ctrl';
    const d = state.dice;
    ctrl.appendChild(dieEl(d ? d.d1 : null));
    ctrl.appendChild(dieEl(d ? d.d2 : null));
    if (aiSeat) {
      ctrl.appendChild(button('moadh-btn wide', null, primaryLabel(state, false, aiSeat), false));
    } else {
      const buy = buyOffer(state);
      const up = upgradeOffer(state);
      if (buy) {
        ctrl.appendChild(button(
          'moadh-btn', 'buy', `买地 ￥${buy.price}`, enabledOf.get('buy') ?? buy.enabled,
        ));
      }
      if (up) {
        ctrl.appendChild(button(
          'moadh-btn', 'upgrade', `升级 ￥${up.cost}`, enabledOf.get('upgrade') ?? up.enabled,
        ));
      }
      const pa = primaryAction(state);
      ctrl.appendChild(button(
        'moadh-btn primary wide', pa, primaryLabel(state), pa !== null && (enabledOf.get(pa) ?? true),
      ));
    }
    layer.appendChild(ctrl);

    /* —— 快捷键行：真人 5 键 / AI 两键（顺序与 canvas 版一致） —— */
    const qk = document.createElement('div');
    qk.className = 'moadh-row moadh-qk';
    if (aiSeat) {
      qk.appendChild(button('moadh-btn', 'ai:fast', v.fast ? '加速 ✓' : '加速 ×2', enabledOf.get('ai:fast') ?? true));
      qk.appendChild(button('moadh-btn', 'ai:skip', '跳过本次', enabledOf.get('ai:skip') ?? true));
    } else {
      const qks: Array<[HudActionId, string, boolean]> = [
        ['facility', v.ui.facilityOpen ? '设施 ✓' : '设施', enabledOf.get('facility') ?? true],
        ['store', v.ui.storeOpen ? '商店 ✓' : '商店', enabledOf.get('store') ?? true],
        ['bank', v.ui.bankOpen ? '银行 ✓' : '银行', enabledOf.get('bank') ?? true],
        ['sell', '出售', enabledOf.get('sell') ?? false],
        ['hand', v.ui.handOpen ? '收起手牌' : '手牌', enabledOf.get('hand') ?? true],
      ];
      for (const [action, label, enabled] of qks) {
        const b = button(`moadh-btn${label.includes('✓') ? ' on' : ''}`, action, label, enabled);
        qk.appendChild(b);
      }
    }
    layer.appendChild(qk);
  };

  return { update, destroy: () => { layer.remove(); } };
}
