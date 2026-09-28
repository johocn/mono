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
export const FX = ['coin', 'scaffold', 'dust', 'stamp', 'shine'] as const;

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

// —— 内环装饰楼（8 栋，压暗）与中心喷泉 ——
for (const d of INNER_DECOS) {
  reg[`board.inner.${d}`] = {
    id: `board.inner.${d}`,
    box: { w: 42, d: 21, h: BUILDING_HEIGHTS[2] },
    anchor: [0.5, 0.5], baseline: 0, mount: 'ground', providerKinds: ['proc', 'image'],
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

export const REGISTRY: Record<string, RegistryEntry> = reg;

export function getEntry(id: string): RegistryEntry | null {
  return REGISTRY[id] ?? null;
}

export function allElementIds(): string[] {
  return Object.keys(REGISTRY);
}