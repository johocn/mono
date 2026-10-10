/**
 * PlanEngine — 个性化每日训练计划（离线、纯本地规则）
 *
 * 基于认知画像（CognitiveProfile）给出「今天建议练什么」，
 * 并对记忆类玩法（记忆翻翻乐 / 面孔记忆 / 空间记忆）按「遗忘间隔」给出复习提醒，
 * 把"练了有没有用"落到"每天该练哪一块"，体现关怀而非放任。
 */

import { getCognitiveProfile } from "./CognitiveProfile";
import { progress } from "./ProgressStore";
import { RADAR_AXES } from "../config/CognitiveMap";
import { ALL_LEVELS, type ModeId } from "../config/LevelConfig";

export interface DailyPlan {
  mode: ModeId;
  domain: string;
  minutes: number;
  reason: string;
}

/** 适合做间隔复习的记忆类玩法 */
const REVIEW_MODES: ModeId[] = ["memory", "face", "corsi"];

/** 今天建议练哪个玩法、练多久、为什么 */
export function suggestToday(): DailyPlan {
  const p = getCognitiveProfile();
  if (p.trainedCount === 0) {
    return {
      mode: "match3",
      domain: "综合",
      minutes: 10,
      reason: "刚开始，先熟悉一下花园～",
    };
  }
  const weakest = p.weakest[0];
  if (!weakest) {
    return {
      mode: "memory",
      domain: "记忆",
      minutes: 10,
      reason: "每天十分钟，贵在坚持。",
    };
  }
  const axis = RADAR_AXES.find((a) => a.key === weakest.key);
  const mode = (axis?.mode as ModeId) ?? "memory";
  return {
    mode,
    domain: weakest.label,
    minutes: 10,
    reason: `您「${weakest.label}」最近练得少，今天花十分钟练练它。`,
  };
}

/**
 * 按间隔复习启发式：记忆类玩法若超过 2 天没练，列入"该复习"提醒。
 * 离线、零配置，随玩随算。返回需要复习的玩法列表。
 */
export function dueReviewModes(): ModeId[] {
  const due: ModeId[] = [];
  for (const m of REVIEW_MODES) {
    const levelIds = ALL_LEVELS.filter((l) => l.mode === m).map((l) => l.id);
    let last = 0;
    for (const id of levelIds) {
      last = Math.max(last, progress.getRecord(id)?.lastPlayed ?? 0);
    }
    const days = last > 0 ? Math.floor((Date.now() - last) / 86400000) : 99;
    if (days >= 2) due.push(m);
  }
  return due;
}
