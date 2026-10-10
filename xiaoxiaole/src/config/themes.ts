/**
 * 章节季节主题调色板 — 春 / 夏 / 秋 / 冬花园
 *
 * 用途：选关界面卡牌配色与关内强调色（HUD 标题 / 进度条 / 入场台词边框）。
 * 设计基调：暗底亮字的适老化对比，accent 用于色条与章节标签，不覆盖用户自定义皮肤背景。
 */

import type { ThemeId } from "./LevelConfig";

export interface ThemePalette {
  id: ThemeId;
  label: string;       // 春之园
  emoji: string;        // 🌸
  accent: string;       // 强调色（色条 / 章节标签 / 关内 HUD 强调）
  cardTop: string;      // 卡牌渐变上（暗底，带季节倾向）
  cardBottom: string;   // 卡牌渐变下
  glow: string;         // 柔光
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  spring: {
    id: "spring", label: "春之园", emoji: "🌸",
    accent: "#FF6B9D",
    cardTop: "rgba(60,40,70,0.96)", cardBottom: "rgba(40,28,52,0.96)",
    glow: "rgba(255,140,180,0.18)",
  },
  summer: {
    id: "summer", label: "夏之园", emoji: "🌿",
    accent: "#4ECDC4",
    cardTop: "rgba(30,58,58,0.96)", cardBottom: "rgba(22,42,44,0.96)",
    glow: "rgba(78,205,196,0.18)",
  },
  autumn: {
    id: "autumn", label: "秋之园", emoji: "🍂",
    accent: "#FFB347",
    cardTop: "rgba(64,46,28,0.96)", cardBottom: "rgba(46,32,20,0.96)",
    glow: "rgba(255,179,71,0.18)",
  },
  winter: {
    id: "winter", label: "冬之园", emoji: "❄️",
    accent: "#9bb8ff",
    cardTop: "rgba(34,42,66,0.96)", cardBottom: "rgba(24,30,50,0.96)",
    glow: "rgba(155,184,255,0.18)",
  },
  shuangyang: {
    id: "shuangyang", label: "双阳苑", emoji: "🦌",
    accent: "#E0A82E",
    cardTop: "rgba(26,52,38,0.96)", cardBottom: "rgba(18,36,26,0.96)",
    glow: "rgba(224,168,46,0.18)",
  },
};

export function getTheme(theme?: ThemeId): ThemePalette {
  return THEMES[theme ?? "spring"];
}
