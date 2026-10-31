/**
 * 建造配置表：玩家可放置的建筑（消耗木材/石料）。
 * 放置后该格变为阻挡，寻路会绕行；拆除返还 50% 材料。
 */
/**
 * 建筑形态（决定绘制样式）：
 * - hall  殿宇：青石台基 + 白墙朱柱 + 飞檐翘角瓦顶 + 檐下灯笼（仙剑风）
 * - field 田垄：泥土底 + 田垄条带 + 灵苗
 * - wall  墙垣：矮墙身 + 砖缝 + 瓦压顶
 */
export type BuildingStyle = "hall" | "field" | "wall";

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  cost: { wood: number; stone: number };
  /** 主体色 / 顶面色 */
  body: string;
  roof: string;
  /** 绘制形态，缺省按 hall 处理 */
  style?: BuildingStyle;
}

export const BUILDINGS: BuildingDef[] = [
  { id: "hut", name: "茅屋", desc: "遮风避雨的小屋。", cost: { wood: 5, stone: 0 }, body: "#e8dcc0", roof: "#5a4a35", style: "hall" },
  { id: "dan-fang", name: "丹房", desc: "炼制丹药之所（装饰）。", cost: { wood: 8, stone: 4 }, body: "#cbbfe0", roof: "#4a3550", style: "hall" },
  { id: "ling-tian", name: "灵田", desc: "种植灵草的田垄（装饰）。", cost: { wood: 2, stone: 1 }, body: "#5f8d4e", roof: "#3d5a3a", style: "field" },
  { id: "wall", name: "石墙", desc: "阻挡妖兽的围墙。", cost: { wood: 0, stone: 3 }, body: "#8d8672", roof: "#4f5a63", style: "wall" },
];

const BMAP: Record<string, BuildingDef> = {};
for (const b of BUILDINGS) BMAP[b.id] = b;

export function getBuilding(id: string): BuildingDef | undefined {
  return BMAP[id];
}

/** 建造返还比例（拆除时） */
export const DEMOLISH_RATIO = 0.5;
