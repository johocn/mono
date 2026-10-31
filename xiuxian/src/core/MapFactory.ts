/**
 * 秘境地图工厂：基于图例构建器（buildMap）的"程序化生成"后端。
 * 每层用确定性随机（种子 ^ 楼层 ^ 盐）生成「房间 + 走廊」地图，
 * 同种子同楼层必得同图，且保证全连通（安全屋→首房→后续各房依次连廊）。
 * 复用 data/map.buildMap 完成图例→MapDef 的转换，保持与手绘区域一致。
 */
import { buildMap, type MapDef } from "../data/map";
import { makeRng, type Rng } from "./Rng";
import type { Buff, BuffKind } from "./Combat";

/** 秘境事件房类型：商人 / 祭坛 / 问号 */
export type RogueEventKind = "shop" | "altar" | "question";

export interface RogueFloor {
  floor: number;
  map: MapDef;
  spawn: { gx: number; gy: number };
  exit: { gx: number; gy: number };
  roomCenters: { gx: number; gy: number }[];
  /** 事件房（不刷怪，踩中触发 STORY 事件） */
  events: { gx: number; gy: number; kind: RogueEventKind }[];
}

const ROGUE_W = 24;
const ROGUE_H = 16;
const ROGUE_SEED = 0x2a5e1; // 固定盐，避免与战斗/掉落随机源碰撞

type Room = { x: number; y: number; w: number; h: number; cx: number; cy: number };

function carve(wall: boolean[][], x: number, y: number): void {
  if (y >= 0 && y < ROGUE_H && x >= 0 && x < ROGUE_W) wall[y][x] = false;
}

function carveCorridor(wall: boolean[][], a: { cx: number; cy: number }, b: { cx: number; cy: number }): void {
  let x = a.cx;
  let y = a.cy;
  const horizFirst = (a.cx + a.cy + b.cx + b.cy) % 2 === 0;
  const stepX = () => { while (x !== b.cx) { x += x < b.cx ? 1 : -1; carve(wall, x, y); } };
  const stepY = () => { while (y !== b.cy) { y += y < b.cy ? 1 : -1; carve(wall, x, y); } };
  if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
}

export function genRogueMap(seed: number, floor: number): RogueFloor {
  const rng = makeRng((seed ^ ROGUE_SEED ^ Math.imul(floor, 0x9e3779b1)) >>> 0);
  const wall: boolean[][] = Array.from({ length: ROGUE_H }, () => Array(ROGUE_W).fill(true));
  const rooms: Room[] = [];
  const numRooms = 5 + (floor % 3); // 5~7
  let attempts = 0;
  while (rooms.length < Math.max(2, numRooms) && attempts < 400) {
    attempts++;
    const rw = 4 + Math.floor(rng() * 4);
    const rh = 3 + Math.floor(rng() * 3);
    const rx = 1 + Math.floor(rng() * (ROGUE_W - rw - 2));
    const ry = 1 + Math.floor(rng() * (ROGUE_H - rh - 2));
    const overlap = rooms.some(
      (r) => rx <= r.x + r.w && rx + rw >= r.x && ry <= r.y + r.h && ry + rh >= r.y,
    );
    if (overlap) continue;
    const cx = Math.floor(rx + rw / 2);
    const cy = Math.floor(ry + rh / 2);
    rooms.push({ x: rx, y: ry, w: rw, h: rh, cx, cy });
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) wall[y][x] = false;
  }
  // 安全屋（返回阵）固定在左上角 3x3，必为可走
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) wall[y][x] = false;
  const sanctuary = { cx: 2, cy: 2 };
  // 连通：安全屋→首房，首房→后续各房（保证全连通）
  carveCorridor(wall, sanctuary, rooms[0]);
  for (let i = 1; i < rooms.length; i++) carveCorridor(wall, rooms[i - 1], rooms[i]);

  const LEGEND: string[] = [];
  for (let y = 0; y < ROGUE_H; y++) {
    let row = "";
    for (let x = 0; x < ROGUE_W; x++) row += wall[y][x] ? "#" : ".";
    LEGEND.push(row);
  }
  const spawnRoom = rooms[0];
  const exitRoom = rooms[rooms.length - 1];
  const map = buildMap(LEGEND, { gx: spawnRoom.cx, gy: spawnRoom.cy });
  const roomCenters = rooms.map((r) => ({ gx: r.cx, gy: r.cy }));
  // 事件房：在非出生/非出口房间中随机 1~2 个（不刷怪，改为交互事件）
  const events: { gx: number; gy: number; kind: RogueEventKind }[] = [];
  const middle = rooms.slice(1, rooms.length - 1);
  const evCount = middle.length > 0 ? (rng() < 0.5 ? 1 : 2) : 0;
  for (const r of [...middle].sort(() => rng() - 0.5).slice(0, evCount)) {
    const kinds: RogueEventKind[] = ["shop", "altar", "question"];
    events.push({ gx: r.cx, gy: r.cy, kind: kinds[Math.floor(rng() * kinds.length)] });
  }
  return {
    floor,
    map,
    spawn: { gx: spawnRoom.cx, gy: spawnRoom.cy },
    exit: { gx: exitRoom.cx, gy: exitRoom.cy },
    roomCenters,
    events,
  };
}

/** 秘境随机增益/诅咒池（复用战斗 Buff 体系） */
export const ROGUE_BUFFS: { kind: BuffKind; value: number }[] = [
  { kind: "atkUp", value: 30 },
  { kind: "defUp", value: 30 },
  { kind: "haste", value: 0.25 },
  { kind: "hot", value: 8 },
  { kind: "shield", value: 40 },
  { kind: "slow", value: 0.3 }, // 诅咒：减速
];

export function pickRogueBuff(rng: Rng): Buff {
  const b = ROGUE_BUFFS[Math.floor(rng() * ROGUE_BUFFS.length)];
  return { kind: b.kind, value: b.value, t: 9999 };
}

/** 遗物池：整局持久增益（persistent，跨层保留，死亡清空），区别于每层临时增益 */
export const ROGUE_RELICS: { kind: BuffKind; value: number }[] = [
  { kind: "atkUp", value: 20 },
  { kind: "defUp", value: 20 },
  { kind: "haste", value: 0.15 },
  { kind: "hot", value: 6 },
  { kind: "shield", value: 30 },
  { kind: "crystalCap", value: 1 },
];

export function pickRogueRelic(rng: Rng): Buff {
  const b = ROGUE_RELICS[Math.floor(rng() * ROGUE_RELICS.length)];
  return { kind: b.kind, value: b.value, t: 9999, persistent: true };
}

const ROGUE_MONSTER_POOL = [
  "bi-jing-lang",
  "hui-lang",
  "mo-jing-lang",
  "xie-xiu",
  "xin-mo",
  "jiao-ren",
  "xie-jiang",
];

export function rogueMonsterPool(_floor: number): string[] {
  // 高层可混入更强魔物（此处复用现有怪物，难度靠数量与楼层递增体现）
  return ROGUE_MONSTER_POOL;
}
