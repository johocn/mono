export const BOARD_COLS = 9;
export const BOARD_ROWS = 9;

export type TileType = 'core' | 'shop' | 'chance' | 'fate' | 'bonus' | 'jail' | 'stock';

export interface TileDef {
  index: number;
  name: string;
  short: string;
  brand: string;
  type: TileType;
  level: 0 | 1 | 2 | 3;   // 演示初始层级（0 = 无楼）
}

export const TILE_TYPES: TileType[] = [
  'core', 'shop', 'fate', 'shop', 'shop', 'chance', 'shop', 'bonus',
  'shop', 'fate', 'shop', 'shop', 'jail', 'shop', 'chance', 'shop',
  'shop', 'fate', 'shop', 'stock', 'shop', 'chance', 'shop', 'fate',
  'shop', 'chance', 'shop', 'bonus', 'shop', 'fate', 'shop', 'chance',
];

export const TILE_NAMES = [
  '优美惠市集生鲜超市', '双阳鹿产品特产店', '命运卡', '双阳本地农家果蔬店', '太平温泉', '机会卡',
  '双阳特色烧烤店', '福利中心', '农家杂粮店', '命运卡', '双阳民宿小院', '双阳糕点面食铺',
  '监狱', '山泉饮用水门店', '机会卡', '双阳本地松子特产店', '农家采摘园', '命运卡',
  '双阳火锅店', '股票交易所', '双阳露营基地', '机会卡', '粮油米面店', '命运卡',
  '双阳洗衣生活馆', '机会卡', '乡村酒厂', '福利中心', '双阳照相馆', '命运卡',
  '农家乐饭店', '机会卡',
];

export const TILE_SHORT = [
  '优美惠超市', '鹿产品特产', '命运卡', '农家果蔬', '太平温泉', '机会卡', '特色烧烤', '福利中心',
  '农家杂粮', '命运卡', '民宿小院', '糕点面食', '监狱', '山泉水', '机会卡', '松子特产',
  '采摘园', '命运卡', '火锅店', '股票所', '露营基地', '机会卡', '粮油米面', '命运卡',
  '洗衣馆', '机会卡', '乡村酒厂', '福利中心', '照相馆', '命运卡', '农家乐', '机会卡',
];

export const TILE_BRAND = [
  '优美惠', '鹿特产', '命运', '果蔬店', '太平温泉', '机会', '烧烤店', '福利', '杂粮店', '命运', '民宿',
  '面食铺', '监狱', '山泉水', '机会', '松子', '采摘园', '命运', '火锅店', '股票所', '露营', '机会',
  '粮油', '命运', '洗衣馆', '机会', '酒厂', '福利', '照相馆', '命运', '农家乐', '机会',
];

/** 演示层级（v5 样张 LV；0 = 无楼，仅空地砖） */
export const TILE_LEVEL: Array<0 | 1 | 2 | 3> = [
  3, 1, 0, 1, 2, 0, 2, 0, 1, 0, 2, 1, 0, 2, 0, 1, 1, 0, 3, 0, 2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 3, 0,
];

export const RING_SIZE = 32;

export const TILES: TileDef[] = TILE_NAMES.map((name, i) => ({
  index: i,
  name,
  short: TILE_SHORT[i],
  brand: TILE_BRAND[i],
  type: TILE_TYPES[i],
  level: TILE_LEVEL[i],
}));

/** v5 样张 line 66–73：外圈 32 格路径 */
export function ringPath(cols: number, rows: number): Array<[number, number]> {
  const p: Array<[number, number]> = [];
  for (let c = 1; c <= cols; c++) p.push([c, rows]);
  for (let r = rows - 1; r >= 2; r--) p.push([cols, r]);
  for (let c = cols; c >= 1; c--) p.push([c, 1]);
  for (let r = 2; r <= rows - 1; r++) p.push([1, r]);
  return p;
}

const KEY_TO_INDEX = new Map<string, number>(
  ringPath(BOARD_COLS, BOARD_ROWS).map(([c, r], i) => [`${c},${r}`, i]),
);

export function tileIndexOf(c: number, r: number): number {
  return KEY_TO_INDEX.get(`${c},${r}`) ?? -1;
}

export function typeAt(index: number): TileType {
  return TILES[index].type;
}
export function nameAt(index: number): string {
  return TILES[index].name;
}
export function shortAt(index: number): string {
  return TILES[index].short;
}
export function brandAt(index: number): string {
  return TILES[index].brand;
}

/** v5 样张 line 58：演示归属（M3 视觉回归与「开局画面」用；真实归属由 M4 买地写回） */
export const DEMO_OWNER: Record<number, 1 | 2 | 3 | 4> = {
  0: 1, 1: 3, 3: 1, 4: 2, 6: 4, 8: 2, 10: 3, 11: 1, 13: 1, 15: 4, 16: 1,
  18: 2, 20: 3, 22: 2, 24: 1, 26: 4, 28: 3, 30: 2,
};

/** v5 样张 line 59 OHUE：四位玩家的楼体色相（与 tokens.owner1..owner4 同源） */
export const OWNER_HUE: Record<number, number> = { 1: 145, 2: 32, 3: 338, 4: 200 };

/** 竖招幌子文字（v5 V 版「市集/温泉/烧烤/火锅/酒厂」；只给少数地块，避免满街挑臂） */
export const SLOT_BANNER: Record<number, string> = {
  0: '市集', 4: '温泉', 6: '烧烤', 18: '火锅', 26: '酒厂',
};

/** 灯笼字：只有 4 家有招牌字（挂门口那盏写自己的字） */
export const SLOT_LANTERN_CHAR: Record<number, string> = {
  4: '汤', 6: '烤', 18: '锅', 26: '酒',
};

/** 路过租金按楼层（v5 样张 line 62：`RENT = [0, 15, 45, 105]`） */
export const RENT_BY_LEVEL = [0, 15, 45, 105];

/** 演示玩家名（v5 样张 line 59 `ONM`） */
export const PLAYER_NAME = ['你', '老王', '丽丽', '小赵'];

/** 橱窗演示文案（v5 optB line 444–447；M4 接入 i18n 字典后改由字典取，本任务先集中在此便于一处替换） */
export const SHOWCASE_TEXT = {
  kind: '商铺', holder: '持有者', floors: '层建筑', rent: '路过租金',
  upgradeTo: '升级到', maxLevel: '已是最高等级 · 不再涨价', pay: '支付',
  noOwner: '无主', fallbackBrand: '门店',
  miniBanner: '市集',
};

/** 三级建筑名（v5 optC line 450–452 标签：L1 摊位 / L2 门店 / L3 商超楼） */
export const LEVEL_NAME = ['', '摊位', '门店', '商超楼'];

/** 三级建造价（v5 optC line 450–452 标签：￥60 / ￥180 / ￥420） */
export const PRICE_BY_LEVEL = [0, 60, 180, 420];

/** 三级对照卡标签：`L{lv} {名} · ￥{价}`（v5 optC line 450–452；M4 接 i18n 后由字典取） */
export function levelCaption(lv: number): string {
  return `L${lv} ${LEVEL_NAME[lv] ?? ''} · ￥${PRICE_BY_LEVEL[lv] ?? 0}`;
}