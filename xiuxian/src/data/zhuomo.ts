/**
 * 坠魔谷（飞升后解锁）：独立地图 + 野生魔物。
 * 地图做成全开放矩形（与镇妖塔一致），规避 Monster A* 寻路对全局 MAP 的依赖。
 */
import { buildMap, type MapDef } from "./map";

const EMPTY = "#" + ".".repeat(22) + "#"; // 24 宽内部空地
const LEGEND_ZHUOMO: string[] = [
  "########################", // 24 边界
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
  EMPTY, EMPTY,
  "########################", // 24 边界（底）
];

export const ZHUOMO_MAP: MapDef = buildMap(LEGEND_ZHUOMO, { gx: 11, gy: 11 });

/** 野生魔物刷新点（避开玩家落点 11,11 与返回阵 11,13） */
export const ZHUOMO_SPOTS: { gx: number; gy: number }[] = [
  { gx: 7, gy: 7 }, { gx: 15, gy: 7 }, { gx: 7, gy: 10 }, { gx: 15, gy: 10 },
  { gx: 11, gy: 5 }, { gx: 9, gy: 12 }, { gx: 13, gy: 12 },
];
