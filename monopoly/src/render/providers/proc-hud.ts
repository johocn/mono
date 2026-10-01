/* 取值器从依赖零的 proc-base.ts 取（与 proc-building/proc-props/proc-showcase 同规），
   避免 proc ↔ proc-hud 循环求值导致 PROC_PRESETS 里拿到未初始化的 preset 绑定 */
import { fb, num, str } from './proc-base';
import type { ProcPreset } from './proc';

/** 骰面点位（3×3 网格，取值仅 -1/0/1） */
const PIPS: Array<Array<[number, number]>> = [
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
];

/** L4 内建兜底默认值（spec §3.6.4）：HUD 全部几何/色值集中声明一次 */
export const HUD_D = fb({
  /* 底部操作坞 */
  dockR: 14, dockFill: '#101a17', dockEdge: '#2a3830', dockEdgeW: 1.2,
  dockTopH: 3, dockTopFill: '#f5c451',
  /* 通用面板（弹窗 / 我的地产） */
  panelR: 12, panelFill: 'rgba(20,30,27,.94)', panelEdge: '#3a4a42', panelEdgeW: 1.2,
  /* 玩家资产条 */
  barR: 7, barFill: '#16221e', barActiveFill: '#1f2f2a',
  barEdge: '#3a4a42', barEdgeActive: '#f5c451', barEdgeW: 1,
  barSwatchW: 6, barSwatchR: 3, barPadX: 6, barBankruptAlpha: 0.35,
  barNameFs: 10, barCashFs: 11, barNameDy: -8, barCashDy: 8,
  barNameFill: '#d8e4dc', barCashFill: '#ffe9b0',
  /* 资产条角上的角色技能徽标（`state.skill` 为空则不画） */
  barSkillW: 40, barSkillH: 13, barSkillGy: 3, barSkillR: 6, barSkillPadX: 6,
  barSkillFs: 8, barSkillFill: '#3a2f14', barSkillAlpha: 0.86, barSkillText: '#f5c451',
  /* 按钮 */
  btnR: 9, btnFill: '#f5c451', btnFillDisabled: '#3a4a42',
  btnEdge: '#c9a03f', btnEdgeW: 1, btnFs: 15, btnLabelDy: 0,
  btnTextFill: '#1b1b1b', btnTextFillDisabled: '#6b7f76',
  /* 状态行 */
  labelFs: 12, labelFill: '#d8e4dc',
  /* 骰子 */
  diceR: 10, diceFill: '#f3efe4', diceRollFill: '#ffffff', diceEdge: '#2a3830', diceEdgeW: 1.5,
  pipR: 4.2, pipSpan: 13, pipFill: '#243029',
});

const G = (p: Record<string, unknown>, k: keyof typeof HUD_D): number => num(p, k, HUD_D[k] as number);
const S = (p: Record<string, unknown>, k: keyof typeof HUD_D): string => str(p, k, HUD_D[k] as string);
const ownerColorOf = (state: Record<string, unknown>, fallback: string): string => {
  const colors = (state.ownerColors ?? {}) as Record<number, string>;
  const owner = typeof state.owner === 'number' ? state.owner : null;
  return (owner !== null && colors[owner]) ? colors[owner] : fallback;
};

/* —— 底部操作坞：圆角底 + 顶部金色提示条 —— */
export const uiDock: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, s } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'dockR'))
    .fill({ color: S(params, 'dockFill') })
    .stroke({ color: S(params, 'dockEdge'), width: G(params, 'dockEdgeW') });
  g.rect(cx - w / 2, cy - h / 2, w, G(params, 'dockTopH'))
    .fill({ color: S(params, 'dockTopFill') });
};

/* —— 通用面板：圆角底 + 描边 —— */
export const uiPanel: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, s } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'panelR'))
    .fill({ color: S(params, 'panelFill') })
    .stroke({ color: S(params, 'panelEdge'), width: G(params, 'panelEdgeW') });
};

/* —— 玩家资产条：色标 + 名字 + 现金（当前玩家金框、破产压暗） —— */
export const uiPlayerBar: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const active = state.active === true;
  const bankrupt = state.bankrupt === true;
  const alpha = bankrupt ? G(params, 'barBankruptAlpha') : 1;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  g.roundRect(x0, y0, w, h, G(params, 'barR'))
    .fill({ color: active ? S(params, 'barActiveFill') : S(params, 'barFill'), alpha })
    .stroke({ color: active ? S(params, 'barEdgeActive') : S(params, 'barEdge'), width: G(params, 'barEdgeW') });
  const swatch = G(params, 'barSwatchW') * s;
  g.roundRect(x0 + G(params, 'barPadX'), y0 + swatch, swatch, h - swatch * 2, G(params, 'barSwatchR'))
    .fill({ color: ownerColorOf(state, S(params, 'barNameFill')), alpha });
  if (!text) return;
  const tx = x0 + G(params, 'barPadX') * 2 + swatch;
  text({ text: typeof state.name === 'string' ? state.name : '', x: tx, y: cy + G(params, 'barNameDy'), size: G(params, 'barNameFs'), fill: S(params, 'barNameFill'), align: 'left' });
  text({ text: typeof state.cash === 'number' ? `￥${state.cash}` : '', x: tx, y: cy + G(params, 'barCashDy'), size: G(params, 'barCashFs'), fill: S(params, 'barCashFill'), align: 'left' });
  /* 角色技能徽标：挂在资产条右上角（`state.skill` 为空 = 非技能局，逐像素回旧观感） */
  const skill = typeof state.skill === 'string' ? state.skill : '';
  if (skill.length > 0) {
    const tw = G(params, 'barSkillW') * s;
    const th = G(params, 'barSkillH') * s;
    const sx = x0 + w - G(params, 'barSkillPadX') * s - tw;
    const sy = y0 + G(params, 'barSkillGy') * s;
    g.roundRect(sx, sy, tw, th, G(params, 'barSkillR'))
      .fill({ color: S(params, 'barSkillFill'), alpha: G(params, 'barSkillAlpha') });
    text({ text: skill, x: sx + tw / 2, y: sy + th / 2, size: G(params, 'barSkillFs'), fill: S(params, 'barSkillText') });
  }
};

/* —— 按钮：圆角底 + 居中标签（state.enabled 决定配色） —— */
export const uiButton: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s, text } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  const enabled = state.enabled !== false;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'btnR'))
    .fill({ color: enabled ? S(params, 'btnFill') : S(params, 'btnFillDisabled') })
    .stroke({ color: S(params, 'btnEdge'), width: G(params, 'btnEdgeW') });
  if (!text) return;
  text({
    text: typeof state.label === 'string' ? state.label : '',
    x: cx, y: cy + G(params, 'btnLabelDy'), size: G(params, 'btnFs'),
    fill: enabled ? S(params, 'btnTextFill') : S(params, 'btnTextFillDisabled'),
  });
};

/* —— 状态行：居中单行文字（轮次 / 胜负 / 提示）；`state.dx` 供 AI 回合给右侧快捷键让位 —— */
export const uiLabel: ProcPreset = (_g, ctx) => {
  const { cx, cy, params, state, text } = ctx;
  if (!text) return;
  const dx = typeof state.dx === 'number' ? state.dx : 0;
  text({ text: typeof state.text === 'string' ? state.text : '', x: cx + dx, y: cy, size: G(params, 'labelFs'), fill: S(params, 'labelFill') });
};

/* —— 骰体：圆角方（掷出后亮底） —— */
export const diceBody: ProcPreset = (g, ctx) => {
  const { cx, cy, box, params, state, s } = ctx;
  const w = box.w * s;
  const h = box.h * s;
  g.roundRect(cx - w / 2, cy - h / 2, w, h, G(params, 'diceR'))
    .fill({ color: state.roll === true ? S(params, 'diceRollFill') : S(params, 'diceFill') })
    .stroke({ color: S(params, 'diceEdge'), width: G(params, 'diceEdgeW') });
};

/* —— 骰面：3×3 网格铺 1..6 个点（未掷骰 blank 不铺） —— */
export const diceFace: ProcPreset = (g, ctx) => {
  const { cx, cy, params, state, s } = ctx;
  if (state.blank === true) return;
  const raw = typeof state.pips === 'number' ? state.pips : num(params, 'pips', 1);
  const grid = PIPS[Math.min(Math.max(raw, 1), PIPS.length) - 1];
  const span = G(params, 'pipSpan') * s;
  for (const [dx, dy] of grid) {
    g.circle(cx + dx * span, cy + dy * span, G(params, 'pipR') * s).fill({ color: S(params, 'pipFill') });
  }
};