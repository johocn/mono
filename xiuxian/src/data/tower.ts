/**
 * 镇妖塔（数据驱动）：层数 + 每层怪物组合 + 层属性缩放 + 通关奖励。
 * 入口复用 enterZone 模式（zone "tower"，独立地图 + 传送阵返回落霞镇）。
 * 每日进入时进度重置到第 1 层（历史最高 towerBest 永久保留）。
 */
import { buildMap, type MapDef } from "./map";

export const MAX_TOWER_FLOOR = 30;

export interface TowerReward {
  exp: number;
  stones: number;
  item?: { id: string; n: number };
}

export interface TowerFloorDef {
  floor: number;
  /** 本层怪物 id 列表（含层主时末位为 boss） */
  monsters: string[];
  /** 怪物属性缩放系数（hp/atk/def 同乘） */
  scale: number;
  reward: TowerReward;
}

const EMPTY = "#" + ".".repeat(22) + "#"; // 24 宽内部空地
const LEGEND_TOWER: string[] = [
  "########################", // 24 边界
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
  EMPTY, EMPTY, EMPTY, EMPTY,
  "########################", // 24 边界
];

export const TOWER_MAP: MapDef = buildMap(LEGEND_TOWER, { gx: 11, gy: 11 });

/** 怪物出生点（塔内空地，避开玩家落点 11,11 与返回阵 11,13） */
export const TOWER_SPOTS: { gx: number; gy: number }[] = [
  { gx: 8, gy: 8 }, { gx: 14, gy: 8 }, { gx: 8, gy: 10 }, { gx: 14, gy: 10 },
  { gx: 11, gy: 6 }, { gx: 11, gy: 9 }, { gx: 9, gy: 12 }, { gx: 13, gy: 12 },
];

const POOL = ["hui-lang", "bi-jing-lang", "hai-yao", "xie-jiang", "jiao-ren"];

function buildTowerFloors(): TowerFloorDef[] {
  const out: TowerFloorDef[] = [];
  for (let f = 1; f <= MAX_TOWER_FLOOR; f++) {
    const scale = +(1 + (f - 1) * 0.12).toFixed(2);
    const count = Math.min(5, 2 + Math.floor(f / 3));
    const monsters: string[] = [];
    for (let i = 0; i < count; i++) monsters.push(POOL[(f + i) % POOL.length]);
    if (f % 5 === 0) monsters.push("yao-lang-wang"); // 每 5 层层主镇守
    const reward: TowerReward = {
      exp: 25 * f,
      stones: 12 * f,
      item: f % 5 === 0 ? { id: "jiao-zhu", n: 3 } : undefined,
    };
    out.push({ floor: f, monsters, scale, reward });
  }
  return out;
}

export const TOWER_FLOORS: TowerFloorDef[] = buildTowerFloors();
