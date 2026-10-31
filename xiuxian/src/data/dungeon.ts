/**
 * 秘境地图（数据驱动，复用 buildMap 工厂）。
 * 残破洞天：洞窟中妖兽盘踞，深处镇守一头妖狼王；踏入即受「秘境灵气」持续回血。
 * 所有行严格 24 宽（边界 # + 内部 22 格），避免 buildMap 因行宽不一致抛错。
 */
import { buildMap, type MapDef } from "./map";

const EMPTY = "#" + ".".repeat(22) + "#"; // 24 宽内部空格
const LEGEND_DUNGEON: string[] = [
  "########################", // 24 边界
  EMPTY,
  "#....ww......ww........#",
  "#....ww......ww........#",
  EMPTY,
  "#..........B...........#",
  EMPTY,
  "#....ww......ww........#",
  "#....ww......ww........#",
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  "########################", // 24 边界
];

export const DUNGEON_MAP: MapDef = buildMap(LEGEND_DUNGEON, { gx: 11, gy: 11 });
