import { AUDIO_KEY_SIZE } from './layout';
import type { RegistryEntry } from './types';

export const BUILDING_HEIGHTS: Record<number, number> = { 1: 26, 2: 46, 3: 72 };

// 等距地砖：全宽 = 2×hw、全深 = 2×hh（hw/hh 见 skins/default/skin.json 的 geo）
const TILE: { w: number; d: number; h: number } = { w: 42, d: 21, h: 2 };

export const TILE_TYPES = ['core', 'shop', 'chance', 'fate', 'bonus', 'jail', 'stock'] as const;
export type TileType = (typeof TILE_TYPES)[number];

export const INNER_DECOS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'] as const;
export const PROPS = [
  'awning', 'lantern', 'banner', 'rooftopBox', 'signTower', 'antenna', 'tree', 'lamp',
] as const;
export const FX = ['coin', 'scaffold', 'dust', 'stamp', 'shine', 'spark', 'shard'] as const;

const tile = (t: TileType): RegistryEntry => ({
  id: `board.tile.${t}`,
  box: TILE,
  anchor: [0.5, 0.5],
  baseline: 0,
  mount: 'ground',
  providerKinds: ['proc', 'image', 'atlas'],
});

const tileEdge = (t: TileType): RegistryEntry => ({
  id: `board.tile.${t}.edge`,
  box: TILE,
  anchor: [0.5, 0.5],
  baseline: 0,
  mount: 'ground',
  providerKinds: ['proc', 'image'],
});

const reg: Record<string, RegistryEntry> = {
  // —— 全局配色令牌（L1）：逻辑包围盒 1×1，仅承载色值 ——
  'token.gold': { id: 'token.gold', box: { w: 1, d: 1, h: 1 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc'] },
  'token.bg': { id: 'token.bg', box: { w: 390, d: 1, h: 844 }, anchor: [0.5, 1], baseline: 0, mount: 'ground', providerKinds: ['proc'] },
};

for (const t of TILE_TYPES) {
  reg[`board.tile.${t}`] = tile(t);
  reg[`board.tile.${t}.edge`] = tileEdge(t);
}

// —— 内环装饰楼（8 栋，压暗；v5 样张以 0.5 缩放画在内环第二排，故 scale 由注册表给，渲染层不写死） ——
for (const d of INNER_DECOS) {
  reg[`board.inner.${d}`] = {
    id: `board.inner.${d}`,
    box: { w: 42, d: 21, h: BUILDING_HEIGHTS[2] },
    anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'],
    scale: 0.5,
  };
}
reg['board.inner.deco'] = {
  id: 'board.inner.deco',
  box: { w: 42, d: 21, h: 2 },
  anchor: [0.5, 0.5], baseline: 0, mount: 'ground',
  providerKinds: ['proc', 'image'],
};
reg['board.center.fountain'] = {
  id: 'board.center.fountain',
  box: { w: 60, d: 30, h: 28 },
  anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'frames'],
};

// —— 32 格三级建筑 + 店招 ——
for (let s = 0; s <= 31; s++) {
  for (const lv of [1, 2, 3] as const) {
    reg[`building.s${s}.l${lv}`] = {
      id: `building.s${s}.l${lv}`,
      box: { w: 42, d: 21, h: BUILDING_HEIGHTS[lv] },
      anchor: [0.5, 0.5], baseline: 0, mount: 'ground',
      providerKinds: ['proc', 'image', 'atlas', 'frames'],
    };
  }
  reg[`building.s${s}.sign`] = {
    id: `building.s${s}.sign`,
    box: { w: 30, d: 2, h: 8 },
    anchor: [0.5, 0.5], baseline: 0, mount: 'wall',
    attach: { host: `slot:${s}`, atV: 0.86 },
    providerKinds: ['proc', 'image'],
  };
}

// —— 通用构件：全部贴墙/贴屋顶，坐标由管线施加 lift ——
const prop = (name: (typeof PROPS)[number], box: { w: number; d: number; h: number }, atV: number, mount: 'wall' | 'roof' | 'ground' = 'wall'): RegistryEntry => ({
  id: `prop.${name}`,
  box, anchor: [0.5, 0.5], baseline: 0, mount,
  ...(mount === 'ground' ? {} : { attach: { host: 'slot:0', atV } }),
  providerKinds: ['proc', 'image', 'atlas', 'frames'],
});

reg['prop.awning'] = prop('awning', { w: 34, d: 2, h: 5 }, 0.64);
reg['prop.lantern'] = prop('lantern', { w: 10, d: 2, h: 14 }, 0.30);
reg['prop.banner'] = prop('banner', { w: 10, d: 2, h: 30 }, 0.80);
reg['prop.rooftopBox'] = prop('rooftopBox', { w: 14, d: 7, h: 7 }, 1, 'roof');
reg['prop.signTower'] = prop('signTower', { w: 15, d: 7, h: 20 }, 1, 'roof');
reg['prop.antenna'] = prop('antenna', { w: 4, d: 2, h: 13 }, 1, 'roof');
reg['prop.tree'] = prop('tree', { w: 14, d: 8, h: 30 }, 0, 'ground');
reg['prop.lamp'] = prop('lamp', { w: 8, d: 4, h: 28 }, 0, 'ground');

// —— 玩家棋子 4 色 ——
for (let p = 1; p <= 4; p++) {
  reg[`piece.p${p}`] = {
    id: `piece.p${p}`,
    box: { w: 8.4, d: 4.2, h: 13 },
    anchor: [0.5, 0.5], baseline: 0, mount: 'ground',
    providerKinds: ['proc', 'image', 'atlas', 'frames'],
  };
}

// —— 骰子 ——
reg['dice.body'] = { id: 'dice.body', box: { w: 52, d: 1, h: 52 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas', 'frames'] };
for (let f = 1; f <= 6; f++) {
  reg[`dice.face${f}`] = { id: `dice.face${f}`, box: { w: 52, d: 1, h: 52 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
}

// —— 卡牌：三副牌堆，各 back + face1..6 ——
for (const deck of ['item', 'fate', 'chance'] as const) {
  reg[`card.${deck}.back`] = { id: `card.${deck}.back`, box: { w: 66, d: 1, h: 88 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };
  for (let i = 1; i <= 6; i++) {
    reg[`card.${deck}.face${i}`] = { id: `card.${deck}.face${i}`, box: { w: 66, d: 1, h: 88 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas', 'frames'] };
  }
}

// —— 特效 ——
for (const f of FX) {
  reg[`fx.${f}`] = { id: `fx.${f}`, box: { w: 16, d: 16, h: 16 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas', 'frames'] };
}

// —— UI ——
reg['ui.button.primary'] = { id: 'ui.button.primary', box: { w: 98, d: 1, h: 46 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };
reg['ui.panel'] = { id: 'ui.panel', box: { w: 370, d: 1, h: 268 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
reg['ui.icon.stock'] = { id: 'ui.icon.stock', box: { w: 100, d: 1, h: 26 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };

/* —— HUD（底部操作坞）：台位由 ElementSpec.fixed 给（pass 4 + 定格） —— */
reg['ui.dock'] = { id: 'ui.dock', box: { w: 390, d: 1, h: 184 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
reg['ui.label'] = { id: 'ui.label', box: { w: 390, d: 1, h: 24 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
reg['ui.playerBar'] = { id: 'ui.playerBar', box: { w: 86, d: 1, h: 40 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
reg['ui.button.secondary'] = { id: 'ui.button.secondary', box: { w: 110, d: 1, h: 46 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };
/* AI 回合专用（spec §5.2）：整行主按钮 + 状态行右侧两枚快捷键 + 性格徽标 */
reg['ui.button.wide'] = { id: 'ui.button.wide', box: { w: 328, d: 1, h: 46 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };
reg['ui.qk'] = { id: 'ui.qk', box: { w: 72, d: 1, h: 22 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image', 'atlas'] };
reg['ui.personaTag'] = { id: 'ui.personaTag', box: { w: 34, d: 1, h: 13 }, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
/* M11 音效与音乐（spec §7.3）：顶部右侧两枚 26×26 常驻静音键；开/关各一个 id（共 4 个） */
reg['ui.sound.on'] = showcaseEntry('ui.sound.on', { w: AUDIO_KEY_SIZE, d: 1, h: AUDIO_KEY_SIZE });
reg['ui.sound.off'] = showcaseEntry('ui.sound.off', { w: AUDIO_KEY_SIZE, d: 1, h: AUDIO_KEY_SIZE });
reg['ui.music.on'] = showcaseEntry('ui.music.on', { w: AUDIO_KEY_SIZE, d: 1, h: AUDIO_KEY_SIZE });
reg['ui.music.off'] = showcaseEntry('ui.music.off', { w: AUDIO_KEY_SIZE, d: 1, h: AUDIO_KEY_SIZE });

// —— 地块橱窗（B 版式）：全部 ground 挂载，台位由 ElementSpec.fixed 给（不走 resolvePlacement） ——
function showcaseEntry(id: string, box: { w: number; d: number; h: number }): RegistryEntry {
  return { id, box, anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'] };
}
const SC_PANEL = { w: 370, d: 1, h: 300 };
reg['showcase.panel'] = showcaseEntry('showcase.panel', SC_PANEL);
reg['showcase.sky'] = showcaseEntry('showcase.sky', { w: 370, d: 1, h: 180 });
reg['showcase.skyline'] = showcaseEntry('showcase.skyline', { w: 370, d: 1, h: 180 });
reg['showcase.ground'] = showcaseEntry('showcase.ground', { w: 370, d: 1, h: 120 });
reg['showcase.hud'] = showcaseEntry('showcase.hud', SC_PANEL);
reg['showcase.shop'] = showcaseEntry('showcase.shop', { w: 42, d: 21, h: BUILDING_HEIGHTS[2] });
reg['showcase.sign'] = showcaseEntry('showcase.sign', { w: 30, d: 2, h: 8 });
reg['showcase.lantern'] = showcaseEntry('showcase.lantern', { w: 10, d: 2, h: 14 });
reg['showcase.banner'] = showcaseEntry('showcase.banner', { w: 10, d: 2, h: 30 });
reg['showcase.tree'] = showcaseEntry('showcase.tree', { w: 14, d: 8, h: 30 });
reg['showcase.lamp'] = showcaseEntry('showcase.lamp', { w: 8, d: 4, h: 28 });
reg['showcase.mini'] = showcaseEntry('showcase.mini', { w: 160, d: 1, h: 210 });

// —— M5 浮层（手牌 / 卡面 / 行情 / 结算 / 角标）：全部 ground 挂载 + fixed 定格台位 ——
reg['ui.handSlot'] = showcaseEntry('ui.handSlot', { w: 68, d: 1, h: 52 });
reg['ui.card'] = showcaseEntry('ui.card', { w: 66, d: 1, h: 88 });
reg['ui.cardBack'] = showcaseEntry('ui.cardBack', { w: 66, d: 1, h: 88 });
reg['ui.stockRow'] = showcaseEntry('ui.stockRow', { w: 342, d: 1, h: 34 });
reg['ui.stockChart'] = showcaseEntry('ui.stockChart', { w: 300, d: 1, h: 54 });
reg['ui.settleRow'] = showcaseEntry('ui.settleRow', { w: 342, d: 1, h: 40 });
reg['ui.badge'] = showcaseEntry('ui.badge', { w: 120, d: 1, h: 26 });
/* 浮层上的可见按键（复用 uiButton preset 的观感；台位与命中区一一对应） */
reg['ui.tradeBuy'] = showcaseEntry('ui.tradeBuy', { w: 150, d: 1, h: 38 });
reg['ui.tradeSell'] = showcaseEntry('ui.tradeSell', { w: 150, d: 1, h: 38 });
reg['ui.panelClose'] = showcaseEntry('ui.panelClose', { w: 76, d: 1, h: 28 });

export const REGISTRY: Record<string, RegistryEntry> = reg;

export function getEntry(id: string): RegistryEntry | null {
  return REGISTRY[id] ?? null;
}

export function allElementIds(): string[] {
  return Object.keys(REGISTRY);
}