/**
 * 仙侠古镇「青玉仙镇」地图（存档预设，保留旧代码供日后复用）。
 * 风格与现有地图明显区分：青玉/鎏金/朱栏。
 *   - 多座民居（H）、一间铁匠铺（F）、一间药店（Y）、两座可运作传送阵（P）
 *   - 主街（青石板）纵横成网，建筑周边留可走空地
 *   - 边界围墙（W）：贴地对齐的等距围墙（drawWall 渲染），修正原边界房屋圈「不平行」观感
 *   - 树木（T）/水池（~）点缀烟火气
 * 图例字符见 map.ts 顶部：'.'草地 ','村路 '#'墙 'T'树 '~'水
 *                    'F'铁匠铺 'Y'药店 'H'民居 'P'传送阵 'W'围墙（均阻挡，P 可走）
 */
import { buildMap, type MapDef } from "./map";

const W = 24;
const H = 16;

// 起始：草地 + 边界贴地围墙
const grid: string[][] = [];
for (let y = 0; y < H; y++) {
  const row: string[] = [];
  for (let x = 0; x < W; x++) {
    row.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? "W" : ".");
  }
  grid.push(row);
}

function set(gx: number, gy: number, ch: string): void {
  if (gx > 0 && gy > 0 && gx < W - 1 && gy < H - 1) grid[gy][gx] = ch;
}

// 主街：横向 gy ∈ {4,8,12} 与 纵向 gx ∈ {4,12,20} 的青石板路（纯视觉，连通由草地保证）
for (let x = 1; x < W - 1; x++) { set(x, 4, ","); set(x, 8, ","); set(x, 12, ","); }
for (let y = 1; y < H - 1; y++) { set(4, y, ","); set(12, y, ","); set(20, y, ","); }

// 民居群（多座，分布于街巷两侧）
const RESIDENCES: [number, number][] = [
  [2, 2], [2, 3], [3, 10], [3, 11],
  [21, 2], [22, 2], [21, 10], [22, 10],
  [7, 2], [16, 2], [7, 13], [16, 13],
];
for (const [gx, gy] of RESIDENCES) set(gx, gy, "H");

// 铁匠铺（西侧匠坊）
set(2, 6, "F");
// 药店（东侧药坊）
set(21, 6, "Y");

// 传送阵（可运作）：西北角阵通秘境、南码头阵通乱星海
set(4, 4, "P");
set(11, 14, "P");

// 树木点缀
for (const [gx, gy] of [[6, 3], [17, 3], [6, 13], [17, 13], [9, 10], [15, 10]] as [number, number][]) {
  set(gx, gy, "T");
}

// 东侧小池（仅视觉，不阻断连通）
set(22, 4, "~");
set(22, 5, "~");

export const LEGEND_QINGYU: string[] = grid.map((r) => r.join(""));

/** 青玉仙镇地图（玩家出生点在主街交叉的可走格）；存档预设，不参与默认流程 */
export const TOWN_MAP_QINGYU: MapDef = buildMap(LEGEND_QINGYU, { gx: 12, gy: 12 });
