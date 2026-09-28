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