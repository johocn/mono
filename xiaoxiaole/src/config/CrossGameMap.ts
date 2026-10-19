/**
 * 跨游戏关卡判定 — 消消乐玩法/关卡 → 目标游戏 的映射与解析
 *
 * 判定规则（两者结合）：
 * 1. 关卡级覆盖：LevelConfig.targetGameId 优先级最高（个别关卡归属特定游戏）；
 * 2. 玩法默认映射：CognitiveMap 中每个 mode 已填 targetGameId（整个玩法归属的目标游戏）；
 * 3. 两者皆无 → 非跨游戏关卡（返回 null），仅本地结算。
 *
 * TARGET_GAMES 是目标游戏注册表（id ↔ 展示名），与后端 cross-game-record 的允许白名单
 * 必须同源一致；新增/调整目标游戏需前后端同步改动。
 */

import type { LevelConfig } from "./LevelConfig";
import { COGNITIVE_MAP } from "./CognitiveMap";

export interface TargetGameMeta {
  id: string;
  name: string;
}

/** 目标游戏注册表：id → 展示名（与后端白名单同源） */
export const TARGET_GAMES: Record<string, TargetGameMeta> = {
  "brain-processing-speed": { id: "brain-processing-speed", name: "极速脑力" },
  "brain-working-memory": { id: "brain-working-memory", name: "记忆回声" },
  "brain-language": { id: "brain-language", name: "妙语连珠" },
  "brain-spatial": { id: "brain-spatial", name: "空间积木" },
  "brain-face-name": { id: "brain-face-name", name: "面孔故事" },
  "brain-visual-recognition": { id: "brain-visual-recognition", name: "翻翻看" },
  "brain-inhibition": { id: "brain-inhibition", name: "淡定 Stroop" },
  "brain-numeracy": { id: "brain-numeracy", name: "买菜算盘" },
  "brain-prospective": { id: "brain-prospective", name: "别忘了" },
  "brain-time-orientation": { id: "brain-time-orientation", name: "几点了" },
  "brain-reminiscence": { id: "brain-reminiscence", name: "流金岁月" },
};

/** 返回某关卡归属的目标游戏 id；非跨游戏关卡返回 null */
export function resolveTargetGame(level: LevelConfig): string | null {
  if (level.targetGameId) return level.targetGameId;
  return COGNITIVE_MAP.find((m) => m.mode === level.mode)?.targetGameId ?? null;
}

/** 目标游戏展示名（未知 id 回退为 id 本身） */
export function targetGameName(gameId: string): string {
  return TARGET_GAMES[gameId]?.name ?? gameId;
}

/** 校验目标游戏 id 是否在白名单内（与后端同源，防误写/注入） */
export function isKnownTargetGame(gameId: string): boolean {
  return Object.prototype.hasOwnProperty.call(TARGET_GAMES, gameId);
}
