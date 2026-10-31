/**
 * 开放世界「云荒原野」地图（ch1 当前活动地图，套用 yunhuang 主题）。
 * 与青玉仙镇（存档预设）明显区分：暖陶土/苔绿/暮色基调，且【无边界围墙】的开放布局。
 *   - 多座民居（H）、一间铁匠铺（F）、一间药店（Y）
 *   - 五座可运作传送阵（P）：复用既有 transfers 坐标，保证乱星海/秘境/坠魔谷/无限回廊/山门全连通
 *   - 主街脉络（青石板）串联各功能区，开放原野向四周延展（动线清晰、A* 全连通）
 *   - 树木（T）/水池（~）/野怪刷点（w）点缀烟火气
 * 图例字符见 map.ts 顶部：'.'草地 ','村路 '#'墙 'T'树 '~'水 'P'传送阵
 *                    'F'铁匠铺 'Y'药店 'H'民居 'W'围墙 'w'刷怪区（均阻挡，P 可走）
 */
import { buildMap, type MapDef } from "./map";

const W = 24;
const H = 16;

const grid: string[][] = [];
for (let y = 0; y < H; y++) {
  const row: string[] = [];
  for (let x = 0; x < W; x++) row.push(".");
  grid.push(row);
}

function set(gx: number, gy: number, ch: string): void {
  if (gx >= 0 && gy >= 0 && gx < W && gy < H) grid[gy][gx] = ch;
}

// 主街脉络（青石板路，纯视觉）：横向 gy ∈ {4,8,12} + 纵向 gx ∈ {4,12,20}
for (let x = 0; x < W; x++) { set(x, 4, ","); set(x, 8, ","); set(x, 12, ","); }
for (let y = 0; y < H; y++) { set(4, y, ","); set(12, y, ","); set(20, y, ","); }

// 民居群（多座，散布于街巷两侧的开阔地，不占主街）
const RESIDENCES: [number, number][] = [
  [2, 2], [3, 2], [2, 3], [3, 3],
  [20, 2], [21, 2], [20, 3], [21, 3],
  [2, 10], [3, 10], [2, 13], [3, 13],
  [20, 13], [21, 13],
  [7, 6], [16, 6], [7, 10], [16, 10],
];
for (const [gx, gy] of RESIDENCES) set(gx, gy, "H");

// 铁匠铺（西南匠坊）与药店（东南药坊）
set(2, 7, "F");
set(21, 7, "Y");

// 五座可运作传送阵（坐标与 zones.ts 的 transfers 一一对应）
set(4, 4, "P");    // 镇西古径 → 秘境
set(11, 14, "P");  // 落霞镇码头 → 乱星海
set(19, 8, "P");   // 坠魔谷入口（飞升后开启）
set(3, 9, "P");    // 镇西回廊 → 无限回廊
set(1, 11, "P");   // 正北山门 → 乱星海

// 树木点缀（开阔地，不压建筑/传送阵）
for (const [gx, gy] of [[6, 3], [17, 3], [6, 13], [17, 13], [9, 10], [15, 10]] as [number, number][]) {
  set(gx, gy, "T");
}

// 东侧小池（仅视觉，不阻断连通）
set(22, 2, "~");
set(22, 3, "~");
set(22, 4, "~");

// 野怪刷点（可走，标记妖狼出没区）
for (const [gx, gy] of [[6, 6], [6, 7], [7, 7]] as [number, number][]) {
  set(gx, gy, "w");
}

export const LEGEND_OPEN: string[] = grid.map((r) => r.join(""));

/** 云荒原野开放世界地图（玩家出生点在主街中央交叉的可走格） */
export const OPEN_MAP: MapDef = buildMap(LEGEND_OPEN, { gx: 12, gy: 12 });
