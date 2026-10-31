/**
 * 灵兽配置表：数据驱动。
 * 出战灵兽为玩家提供被动加成（bonus*），并每隔 attackCd 自动对最近怪开火（协战）。
 * 获取方式：start = 开局赠送；capture = 用「捕兽铃」对残血妖兽收服（fromMonster + rate）。
 */
export type BeastRarity = "common" | "rare" | "epic";

export interface BeastDef {
  id: string;
  name: string;
  desc: string;
  rarity: BeastRarity;
  /** 跟随精灵主体色 / 体型倍率 */
  color: string;
  size: number;
  /** 协战基础属性（伤害以 atk 计） */
  atk: number;
  def: number;
  hp: number;
  speed: number;
  /** 协战攻击：伤害系数 / 射程(格) / 冷却(秒) */
  power: number;
  range: number;
  attackCd: number;
  /** 出战被动加成（叠加到玩家 atk/def/maxHp） */
  bonusAtk: number;
  bonusDef: number;
  bonusHp: number;
  obtain: { type: "start" } | { type: "capture"; fromMonster: string; rate: number };
}

export const BEASTS: BeastDef[] = [
  {
    id: "qingluan", name: "青鸾", desc: "随开宗便伴身的灵禽，吐气成岚。",
    rarity: "common", color: "#5fd0c0", size: 0.9,
    atk: 14, def: 8, hp: 120, speed: 2.0,
    power: 1.3, range: 4.5, attackCd: 3,
    bonusAtk: 4, bonusDef: 2, bonusHp: 40,
    obtain: { type: "start" },
  },
  {
    id: "langhun", name: "狼灵", desc: "收服灰毛狼所得的妖魂，迅捷凶悍。",
    rarity: "common", color: "#7f9bb5", size: 1.0,
    atk: 22, def: 6, hp: 150, speed: 2.4,
    power: 1.6, range: 5, attackCd: 2.6,
    bonusAtk: 7, bonusDef: 3, bonusHp: 60,
    obtain: { type: "capture", fromMonster: "hui-lang", rate: 0.5 },
  },
  {
    id: "hailin", name: "蜃灵", desc: "海妖凝成的灵体，驭水成刃。",
    rarity: "rare", color: "#4aa3d0", size: 1.1,
    atk: 30, def: 10, hp: 220, speed: 2.2,
    power: 1.8, range: 5.5, attackCd: 3,
    bonusAtk: 11, bonusDef: 5, bonusHp: 90,
    obtain: { type: "capture", fromMonster: "hai-yao", rate: 0.35 },
  },
];

const BMAP: Record<string, BeastDef> = {};
for (const b of BEASTS) BMAP[b.id] = b;

export function getBeast(id: string): BeastDef | undefined {
  return BMAP[id];
}

/** 可捕捉怪物 id → 灵兽 id 映射（Game.tryCapture / Player.captureBeast 用） */
export const CAPTURE_MAP: Record<string, string> = {};
for (const b of BEASTS) if (b.obtain.type === "capture") CAPTURE_MAP[b.obtain.fromMonster] = b.id;

/** 该妖兽的收服成功率（不可收服返回 0） */
export function beastCaptureRate(monsterId: string): number {
  const bid = CAPTURE_MAP[monsterId];
  const b = bid ? getBeast(bid) : undefined;
  return b && b.obtain.type === "capture" ? b.obtain.rate : 0;
}
