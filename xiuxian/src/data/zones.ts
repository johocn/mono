/**
 * 区域（zone）注册表：每个章节对应一张地图 + 一组 NPC + 一组传送点。
 * Game 按 `currentZoneId` 持有当前 zone，enterZone 统一重建世界。
 * 第二章（ch2）在 src/data/story/chapter2.ts 完成后注入到本表。
 */
import { type MapDef } from "./map";
import { OPEN_MAP } from "./town_open";
import { NPCS, CHAPTER1_START, type NpcDef } from "./story/chapter1";
import { chapter2Zone } from "./story/chapter2";
import { DUNGEON_MAP } from "./dungeon";
import { TOWER_MAP } from "./tower";
import { ZHUOMO_MAP, ZHUOMO_SPOTS } from "./zhuomo";
import { genRogueMap } from "../core/MapFactory";
import type { TransferDef } from "../ui/TransferPanel";
import type { Buff } from "../core/Combat";
import type { LootDrop } from "./monsters";

/** 野外采集点（P3-5）：走到该格按 F 采集，带冷却再生 */
export interface GatherNode {
  gx: number;
  gy: number;
  /** 产出材料 id（必为 type:"material"） */
  mat: string;
  /** 每次产出数量 */
  n: number;
  /** 冷却秒数（再生间隔），默认 30 */
  cd?: number;
}

/** 宝箱节点（P3-5余）：走到该格按 F 开启，获得掉落；隐藏宝箱需踩中才发现 */
export interface ChestNode {
  gx: number;
  gy: number;
  /** 掉落表（复用怪物掉落 LootDrop 结构） */
  loot: LootDrop[];
  /** 隐藏宝箱：地表不显示标记，需走近（踩中）才发现 */
  hidden?: boolean;
  /** 再生冷却（秒）；0 或不填=一次性（开启后不再刷新，持久记录） */
  cd?: number;
}

export interface ZoneDef {
  id: string;
  chapter: number;
  map: MapDef;
  npcs: NpcDef[];
  /** 野外刷怪：每种怪物一组刷新点 */
  wild: { id: string; spots: { gx: number; gy: number }[] }[];
  /** 该区域 Boss 怪物 id */
  bossId: string;
  /** 踏入该格触发传送确认（to = 目标 zone id，spawn = 落地格） */
  transfers: TransferDef[];
  /** 进入该 zone 的对话入口节点 */
  startNode: string;
  /** 进入时自动赋予的持续增益（秘境灵气等） */
  buff?: Buff;
  /** 野外采集点（P3-5）：走到该格按 F 采集，带冷却再生 */
  gathers?: GatherNode[];
  /** 隐藏/普通宝箱（P3-5余）：按 F 开启获得掉落 */
  chests?: ChestNode[];
  /** 奇遇事件池（P3-5余）：周期随机触发其一（STORY 节点 id） */
  encounters?: string[];
  /** 动态刷怪（P3-5余）：区域持续按上限/间隔补怪，营造生机 */
  dynamicSpawn?: { interval: number; maxAlive: number; pool: string[]; aggro?: number };
  isDefault?: boolean;
}

export const ZONES: Record<string, ZoneDef> = {
  ch1: {
    id: "ch1",
    chapter: 1,
    map: OPEN_MAP,
    npcs: NPCS,
    wild: [{ id: "bi-jing-lang", spots: OPEN_MAP.wolfZone }],
    bossId: "yao-lang-wang",
    transfers: [
      // 落霞镇码头 → 乱星海（视觉符文环由 Game.addPortals 绘制）
      { gx: 11, gy: 14, to: "ch2", spawn: { gx: 11, gy: 12 }, label: "乱星海 · 星渔村" },
      // 镇西古径 → 秘境（落霞镇西隅 (4,4) 触发）
      { gx: 4, gy: 4, to: "dungeon", spawn: { gx: 11, gy: 11 }, label: "秘境 · 残破洞天" },
      // 飞升后开启：坠魔谷传送阵（(19,8) 触发；未飞升时由 Game.openTransfer 拦截）
      { gx: 19, gy: 8, to: "zhuomo", spawn: { gx: 11, gy: 11 }, label: "坠魔谷 · 魔气渊薮" },
      // 镇西回廊 → 秘境（无限回廊）
      { gx: 3, gy: 9, to: "rogue", spawn: { gx: 11, gy: 11 }, label: "秘境 · 无限回廊" },
      // 正北山门入口 → 乱星海（通往其他场景的入口）
      { gx: 1, gy: 11, to: "ch2", spawn: { gx: 11, gy: 12 }, label: "山门 · 通往乱星海" },
    ],
    startNode: CHAPTER1_START,
    gathers: [
      { gx: 9, gy: 9, mat: "ling-cao", n: 2 },
      { gx: 6, gy: 6, mat: "ling-cao", n: 2 },
      { gx: 15, gy: 12, mat: "ling-cao", n: 2 },
      { gx: 3, gy: 11, mat: "wood", n: 2 },
      { gx: 17, gy: 5, mat: "stone", n: 2 },
      // 药圃：集中草药采集点（西北草地），便于玩家开展采药任务
      { gx: 2, gy: 2, mat: "ling-cao", n: 2 },
      { gx: 1, gy: 8, mat: "ling-cao", n: 2 },
      { gx: 8, gy: 2, mat: "ling-cao", n: 2 },
      { gx: 2, gy: 13, mat: "ling-cao", n: 2 },
      // 边缘资源点
      { gx: 14, gy: 1, mat: "wood", n: 2 },
      { gx: 20, gy: 2, mat: "wood", n: 2 },
      { gx: 20, gy: 14, mat: "stone", n: 2 },
    ],
    chests: [
      { gx: 13, gy: 13, loot: [{ id: "huixue-dan", chance: 1, count: 2 }, { id: "yaodan", chance: 0.6, count: 1 }, { id: "ling-cao", chance: 0.5, count: 2 }] },
      { gx: 2, gy: 14, hidden: true, loot: [{ id: "jiao-zhu", chance: 1, count: 1 }, { id: "xiuwei-dan", chance: 1, count: 1 }] },
      { gx: 16, gy: 9, loot: [{ id: "wood", chance: 1, count: 3 }, { id: "stone", chance: 1, count: 2 }] },
    ],
    encounters: ["enc_fox", "enc_old", "enc_spring", "enc_ruins", "enc_mystic"],
    dynamicSpawn: { interval: 9, maxAlive: 4, pool: ["bi-jing-lang", "bi-jing-lang"], aggro: 2 },
    isDefault: true,
  },
  ch2: chapter2Zone,
  dungeon: {
    id: "dungeon",
    chapter: 1,
    map: DUNGEON_MAP,
    npcs: [],
    wild: [{ id: "bi-jing-lang", spots: DUNGEON_MAP.wolfZone }],
    bossId: "yao-lang-wang",
    transfers: [
      { gx: 11, gy: 14, to: "ch1", spawn: { gx: 4, gy: 4 }, label: "返回落霞镇" },
    ],
    startNode: "",
    gathers: [
      { gx: 8, gy: 8, mat: "wood", n: 2 },
      { gx: 5, gy: 5, mat: "stone", n: 2 },
    ],
    chests: [
      { gx: 13, gy: 13, loot: [{ id: "yaodan", chance: 1, count: 2 }, { id: "shan-hu", chance: 0.5, count: 1 }] },
      { gx: 3, gy: 3, hidden: true, loot: [{ id: "tu-po-dan", chance: 1, count: 1 }, { id: "huixue-dan", chance: 1, count: 1 }] },
    ],
    encounters: ["enc_ruins", "enc_mystic", "enc_fox"],
    dynamicSpawn: { interval: 10, maxAlive: 5, pool: ["xie-xiu", "xie-xiu", "mo-jing-lang"], aggro: 2 },
    buff: { kind: "hot", value: 6, t: 9999 },
  },
  tower: {
    id: "tower",
    chapter: 1,
    map: TOWER_MAP,
    npcs: [],
    wild: [],
    bossId: "",
    transfers: [
      // 塔顶传送阵 → 返回落霞镇
      { gx: 11, gy: 13, to: "ch1", spawn: { gx: 11, gy: 11 }, label: "返回落霞镇" },
    ],
    startNode: "",
  },
  zhuomo: {
    id: "zhuomo",
    chapter: 1,
    map: ZHUOMO_MAP,
    npcs: [],
    wild: [
      { id: "mo-jing-lang", spots: ZHUOMO_SPOTS },
      { id: "xie-xiu", spots: ZHUOMO_SPOTS },
      { id: "xin-mo", spots: ZHUOMO_SPOTS },
    ],
    bossId: "mo-zun",
    transfers: [
      // 坠魔谷返回阵 → 落霞镇
      { gx: 11, gy: 13, to: "ch1", spawn: { gx: 19, gy: 8 }, label: "返回落霞镇" },
    ],
    startNode: "",
    gathers: [
      { gx: 8, gy: 8, mat: "mo-he", n: 1 },
      { gx: 14, gy: 14, mat: "mo-qi", n: 1 },
    ],
    chests: [
      { gx: 3, gy: 3, loot: [{ id: "mo-he", chance: 1, count: 2 }, { id: "mo-qi", chance: 1, count: 2 }] },
      { gx: 17, gy: 17, hidden: true, loot: [{ id: "mo-zun-neidan", chance: 0.5, count: 1 }, { id: "yuan-ying-dan", chance: 1, count: 1 }] },
    ],
    encounters: ["enc_ruins", "enc_mystic"],
    dynamicSpawn: { interval: 8, maxAlive: 6, pool: ["mo-jing-lang", "xie-xiu", "xin-mo"], aggro: 2 },
    buff: { kind: "hot", value: 8, t: 9999 },
  },
  rogue: {
    id: "rogue",
    chapter: 1,
    // 占位地图：进入时由 Game.prepareRogueFloor 按层重新生成并覆盖
    map: genRogueMap(1, 1).map,
    npcs: [],
    wild: [],
    bossId: "",
    transfers: [
      // 安全屋返回阵（地图左上 3x3 强制可走，genRogueMap 保证连通）
      { gx: 2, gy: 2, to: "ch1", spawn: { gx: 4, gy: 9 }, label: "返回落霞镇" },
    ],
    startNode: "",
  },
};
