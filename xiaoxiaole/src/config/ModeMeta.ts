/**
 * ModeMeta — 11 个玩法的统一元数据（名称 / 短名 / 主题色 / 图标）
 *
 * 背景：MainMenuScene(MODE_INFO)、LevelSelectScene(MODE_META)、TutorialOverlay(MODE_META)
 * 各存了一份玩法元数据拷贝。新增「最受欢迎游戏投票」需要第四份，因此抽成共享配置，
 * 避免继续分叉。已迁移 LevelSelectScene，其余两处暂保留各自拷贝（字段更多，改动风险高）。
 */

import type { ModeId } from "./LevelConfig";

export interface ModeMeta {
  /** 完整玩法名（投票/问卷页展示） */
  name: string;
  /** 短名（Tab 等窄空间） */
  short: string;
  /** 主题色 */
  color: string;
  /** emoji 图标 */
  icon: string;
}

export const MODE_META: Record<ModeId, ModeMeta> = {
  match3: { name: "时光整理师", short: "三消", color: "#FF6B9D", icon: "🌸" },
  audio: { name: "听音辨位", short: "听音", color: "#6C5CE7", icon: "🎵" },
  poetry: { name: "诗词连连看", short: "诗词", color: "#9b59b6", icon: "📜" },
  corsi: { name: "空间记忆", short: "空间", color: "#2E7D8A", icon: "🟦" },
  face: { name: "面孔记忆", short: "面孔", color: "#E08A3C", icon: "🧑" },
  memory: { name: "记忆翻翻乐", short: "翻翻乐", color: "#4ECDC4", icon: "🃏" },
  stroop: { name: "色词干扰", short: "色词", color: "#F2784B", icon: "🎨" },
  money: { name: "买菜算账", short: "算账", color: "#2FA84F", icon: "💰" },
  pm: { name: "前瞻记忆", short: "记着做", color: "#8B5CF6", icon: "🔔" },
  clock: { name: "时间定向", short: "看钟", color: "#3E7CB1", icon: "🕐" },
  nostalgia: { name: "怀旧金曲", short: "金曲", color: "#E0679B", icon: "🎶" },
};

/** 展示顺序（与关卡选择页一致） */
export const MODE_ORDER: ModeId[] = [
  "match3", "audio", "poetry", "corsi", "face", "memory", "stroop", "money", "pm", "clock", "nostalgia",
];

/** 取玩法名，未知 id 兜底 */
export function modeName(id: ModeId): string {
  return MODE_META[id]?.name ?? "玩法";
}

/** 取玩法图标，未知 id 兜底 */
export function modeIcon(id: ModeId): string {
  return MODE_META[id]?.icon ?? "🎮";
}

/** 取玩法主题色，未知 id 兜底 */
export function modeColor(id: ModeId): string {
  return MODE_META[id]?.color ?? "#4ECDC4";
}
