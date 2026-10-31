/**
 * 天赋树（心法）：数据驱动。境界突破发放天赋点，玩家在天赋树加点获得被动加成。
 * 解锁判定为纯函数；Player 汇总各节点已加点数的效果并入有效属性。
 */
export type TalentBranch = "sword" | "law" | "body";

export interface TalentNode {
  id: string;
  name: string;
  branch: TalentBranch;
  desc: string;
  /** 最高加点数 */
  max: number;
  /** 每点消耗天赋点 */
  cost: number;
  /** 解锁前置（节点加点数 / 境界下标） */
  req?: { node?: string; rank?: number; realm?: number };
  /** 每点效果 */
  effect: { atk?: number; def?: number; hp?: number; crit?: number; spd?: number };
}

/** 每次境界突破发放的天赋点 */
export const TALENT_POINTS_PER_REALM = 2;

export const TALENT_BRANCH_NAME: Record<TalentBranch, string> = {
  sword: "剑道",
  law: "灵修",
  body: "锻体",
};

export const TALENTS: TalentNode[] = [
  // —— 剑道 ——
  { id: "sw_jianxin", name: "剑心通明", branch: "sword", desc: "每点 攻击 +3", max: 5, cost: 1, effect: { atk: 3 } },
  { id: "sw_ruimu", name: "锐目", branch: "sword", desc: "每点 暴击 +2%", max: 3, cost: 1, req: { node: "sw_jianxin", rank: 2 }, effect: { crit: 0.02 } },
  { id: "sw_jifeng", name: "疾风剑意", branch: "sword", desc: "每点 速度 +3%", max: 3, cost: 1, req: { node: "sw_jianxin", rank: 2 }, effect: { spd: 0.03 } },
  { id: "sw_poxian", name: "破限一剑", branch: "sword", desc: "每点 攻击 +6", max: 2, cost: 2, req: { node: "sw_ruimu", rank: 2, realm: 4 }, effect: { atk: 6 } },
  // —— 灵修 ——
  { id: "lw_lingshun", name: "灵盾", branch: "law", desc: "每点 防御 +3", max: 5, cost: 1, effect: { def: 3 } },
  { id: "lw_dongcha", name: "洞察", branch: "law", desc: "每点 暴击 +2%", max: 3, cost: 1, req: { node: "lw_lingshun", rank: 2 }, effect: { crit: 0.02 } },
  { id: "lw_yangyuan", name: "养元", branch: "law", desc: "每点 气血上限 +20", max: 4, cost: 1, req: { node: "lw_lingshun", rank: 2 }, effect: { hp: 20 } },
  // —— 锻体 ——
  { id: "bd_duanti", name: "锻体", branch: "body", desc: "每点 气血上限 +25", max: 5, cost: 1, effect: { hp: 25 } },
  { id: "bd_tiegu", name: "铁骨", branch: "body", desc: "每点 防御 +2", max: 4, cost: 1, req: { node: "bd_duanti", rank: 2 }, effect: { def: 2 } },
  { id: "bd_qingshen", name: "轻身", branch: "body", desc: "每点 速度 +3%", max: 3, cost: 1, req: { node: "bd_duanti", rank: 2 }, effect: { spd: 0.03 } },
];

const TALENT_MAP: Record<string, TalentNode> = {};
for (const t of TALENTS) TALENT_MAP[t.id] = t;

export function getTalent(id: string): TalentNode | undefined {
  return TALENT_MAP[id];
}

/** 纯函数：某节点当前是否可加点（未满 + 满足前置节点/境界） */
export function talentNodeUnlocked(node: TalentNode, talents: Record<string, number>, realmIndex: number): boolean {
  const rank = talents[node.id] || 0;
  if (rank >= node.max) return false;
  if (node.req) {
    if (node.req.realm != null && realmIndex < node.req.realm) return false;
    if (node.req.node && (talents[node.req.node] || 0) < (node.req.rank || 1)) return false;
  }
  return true;
}
