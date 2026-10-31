/**
 * 地图声明式生成（字符图例 → MapDef）。支持多区域（zone）：
 * 游戏可持有不同 MapDef（落霞镇 / 乱星海），通过 setCurrentMap 切换，
 * 寻路/相机/寻路包围盒随之更新。
 *
 * 通用图例：'.'草地  ','村路  '#'房屋/岩石  'T'树  '~'水  'B'高台  'w'刷怪区
 *           'C'/'E' 点位提示（仅视觉）  's'沙岸(可走)  'R'礁石(阻挡)  'P'传送阵(可走)
 *           'F'铁匠铺  'Y'药店  'H'民居（仙侠古镇专用建筑，阻挡）
 *           'W'围墙（贴地对齐，阻挡）
 * 章节特定图例请在各 chapter 的 LEGEND 中自定义（复用上述字符即可）。
 */
export type TileKind =
  | "grass" | "path" | "house" | "tree" | "water" | "arena"
  | "sand" | "reef" | "portal" | "smith" | "shop" | "residence" | "wall";

export interface MapDef {
  w: number;
  h: number;
  kinds: TileKind[][];
  /** 阻挡表（与 kinds 同步维护，寻路直接查） */
  blocked: boolean[][];
  playerSpawn: { gx: number; gy: number };
  wolfZone: { gx: number; gy: number }[];
  bossSpot: { gx: number; gy: number };
}

const TILE_W = 64;
const TILE_H = 64;

const BLOCKED_CHARS = new Set(["#", "T", "~", "R", "F", "Y", "H", "W"]);

function kindOf(ch: string): TileKind {
  switch (ch) {
    case ",": return "path";
    case "#": return "house";
    case "T": return "tree";
    case "~": return "water";
    case "B": return "arena";
    case "s": return "sand";
    case "R": return "reef";
    case "P": return "portal";
    case "F": return "smith";
    case "Y": return "shop";
    case "H": return "residence";
    case "W": return "wall";
    default: return "grass";
  }
}

/** 由字符图例构建一张地图（spawn 可覆盖默认出生点） */
export function buildMap(
  LEGEND: string[],
  spawn: { gx: number; gy: number } = { gx: 11, gy:11 },
): MapDef {
  const h = LEGEND.length;
  const w = LEGEND[0].length;
  const kinds: TileKind[][] = [];
  const blocked: boolean[][] = [];
  const wolfZone: { gx: number; gy: number }[] = [];
  let bossSpot = { gx: 11, gy: 3 };
  for (let gy = 0; gy < h; gy++) {
    const row = LEGEND[gy];
    if (row.length !== w) throw new Error(`map row ${gy} length ${row.length} != ${w}`);
    const kr: TileKind[] = [];
    const br: boolean[] = [];
    for (let gx = 0; gx < w; gx++) {
      const ch = row[gx];
      kr.push(kindOf(ch));
      br.push(BLOCKED_CHARS.has(ch));
      if (ch === "w") wolfZone.push({ gx, gy });
      if (ch === "B") bossSpot = { gx, gy };
    }
    kinds.push(kr);
    blocked.push(br);
  }
  return { w, h, kinds, blocked, playerSpawn: { ...spawn }, wolfZone, bossSpot };
}

/** 第一章地图「落霞镇」 */
const LEGEND_CH1: string[] = [
  "########################",
  "#....T..........T......#",
  "#..#####.......#####...#",
  "#..#####...B...#####...#",
  "#...........,,.........#",
  "#..T........,,.......T.#",
  "#..#####...,,...#####..#",
  "#..#####...,,...#####..#",
  "#...........,,.........#",
  "#..........,,,.........#",
  "#.C.......,,,........E.#",
  "#...ww.....,,,.....ww..#",
  "#...ww.....,,,.....ww..#",
  "#...ww............ww...#",
  "#....T..............T..#",
  "########################",
];

export const MAP: MapDef = buildMap(LEGEND_CH1);

// —— 多区域上下文：当前激活地图（寻路/相机/包围盒默认指向它）——
export let CURRENT_MAP: MapDef = MAP;
export function setCurrentMap(m: MapDef): void { CURRENT_MAP = m; }

export function inBounds(gx: number, gy: number, map: MapDef = CURRENT_MAP): boolean {
  return gx >= 0 && gy >= 0 && gx < map.w && gy < map.h;
}

export function isWalkable(gx: number, gy: number, map: MapDef = CURRENT_MAP): boolean {
  gx = Math.floor(gx);
  gy = Math.floor(gy);
  return inBounds(gx, gy, map) && !map.blocked[gy][gx];
}

/** 世界像素尺寸（相机包围盒用），随当前地图变化 */
export function worldW(map: MapDef = CURRENT_MAP): number {
  return map.w * TILE_W;
}
export function worldH(map: MapDef = CURRENT_MAP): number {
  return map.h * TILE_H;
}
