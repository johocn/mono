/**
 * 成就系统：数据驱动。条件为纯谓词（对玩家快照判定），奖励发放由 Player 负责。
 * 快照由 Player.achSnapshot() 提供，避免数据层反向依赖实体类。
 */

export type AchCond =
  | { k: "kills"; n: number }
  | { k: "realm"; n: number }
  | { k: "forge"; n: number }
  | { k: "codexKill"; n: number }
  | { k: "codexItem"; n: number }
  | { k: "codexSkill"; n: number }
  | { k: "stones"; n: number }
  | { k: "quests"; n: number }
  | { k: "artifact"; n: number }
  | { k: "chapter"; n: number };

export interface AchSnapshot {
  kills: number;
  realmIndex: number;
  forgeMax: number;
  codexKill: number;
  codexItem: number;
  codexSkill: number;
  stones: number;
  questsDone: number;
  artifacts: number;
  chapter: number;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  cond: AchCond;
  reward: { exp?: number; stones?: number };
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_blood", name: "初试锋芒", desc: "击杀第一只妖兽", cond: { k: "kills", n: 1 }, reward: { exp: 20 } },
  { id: "slayer_20", name: "斩妖无数", desc: "累计击杀 20 只妖兽", cond: { k: "kills", n: 20 }, reward: { exp: 100, stones: 50 } },
  { id: "realm_zhuji", name: "筑基有成", desc: "境界达到筑基期", cond: { k: "realm", n: 4 }, reward: { exp: 200 } },
  { id: "realm_yuanying", name: "元婴大道", desc: "境界达到元婴期", cond: { k: "realm", n: 6 }, reward: { exp: 500, stones: 200 } },
  { id: "forge_5", name: "炉火纯青", desc: "将一件装备强化至 +5", cond: { k: "forge", n: 5 }, reward: { stones: 150 } },
  { id: "codex_kill_5", name: "妖兽图鉴·入门", desc: "击杀 5 种不同妖兽", cond: { k: "codexKill", n: 5 }, reward: { exp: 150 } },
  { id: "codex_skill_10", name: "博采众长", desc: "掌握 10 门功法", cond: { k: "codexSkill", n: 10 }, reward: { exp: 150, stones: 80 } },
  { id: "rich", name: "小有积蓄", desc: "持有灵石达到 1000", cond: { k: "stones", n: 1000 }, reward: {} },
  { id: "quests_5", name: "事务繁忙", desc: "完成 5 个任务", cond: { k: "quests", n: 5 }, reward: { exp: 200 } },
  { id: "artifact_2", name: "多宝道人", desc: "拥有 2 件法宝", cond: { k: "artifact", n: 2 }, reward: { stones: 300 } },
  { id: "chapter2", name: "乱星海平", desc: "通关第二章", cond: { k: "chapter", n: 2 }, reward: { exp: 800 } },
];

const ACH_MAP: Record<string, Achievement> = {};
for (const a of ACHIEVEMENTS) ACH_MAP[a.id] = a;

export function getAchievement(id: string): Achievement | undefined {
  return ACH_MAP[id];
}

/** 纯函数：某成就在给定快照下是否达成 */
export function achMet(a: Achievement, s: AchSnapshot): boolean {
  switch (a.cond.k) {
    case "kills": return s.kills >= a.cond.n;
    case "realm": return s.realmIndex >= a.cond.n;
    case "forge": return s.forgeMax >= a.cond.n;
    case "codexKill": return s.codexKill >= a.cond.n;
    case "codexItem": return s.codexItem >= a.cond.n;
    case "codexSkill": return s.codexSkill >= a.cond.n;
    case "stones": return s.stones >= a.cond.n;
    case "quests": return s.questsDone >= a.cond.n;
    case "artifact": return s.artifacts >= a.cond.n;
    case "chapter": return s.chapter >= a.cond.n;
  }
}
