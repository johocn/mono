/**
 * 全局配置 — 视觉安全 / 会话上限 / 通用常量
 * spec v1.1 第 7.3/7.4 节
 */

/**
 * 调试开关：置为 false 后，构建期会把 `if (DEBUG) console.log(...)` 整段消除，
 * 线上不会残留任何控制台噪音。本地调试时改成 true 即可。
 */
export const DEBUG = false;

export const GAME_CONFIG = {
  // 视觉安全 (7.3)
  maxFlashHz: 2,              // 闪烁频率上限 ≤2 次/秒
  minContrastRatio: 4.5,      // WCAG AA 对比度
  minTapSize: 44,             // 最小可点击区 44×44px
  reducedMotionDefault: true, // "降低动效"默认开启

  // 会话上限与疲劳熔断 (7.4)
  maxSessionMinutes: 20,      // 单次会话硬上限
  maxDailyMinutes: 40,        // 单日累计上限
  restSuggestMinutes: 20,     // 累计达此时长，关卡间温柔建议休息（软提示，未达硬上限）
  fatigueThreshold: 1.5,      // 反应时劣化倍数
  fatigueConsecutiveSteps: 3, // 连续 N 步劣化触发
  fatiguePauseSeconds: 30,    // 强制休息时长
  medianReactionBaseline: 3000, // 首关中位反应时初值 ms

  // 自适应护栏 (7.5)
  maxStepAdjust: 6,           // 步数调节边界 ±6
  maxConsecutiveDowngrades: 3, // 连续降档上限

  // 通用
  tileColors: {
    flower: "#FF6B9D",
    leaf: "#4ECDC4",
    fruit: "#FFE66D",
    butterfly: "#A8E6CF",
    bird: "#FFB347",
    water: "#6C5CE7",
    chime: "#FD79A8",
    cooking: "#FAB1A0",
  },
  tileLabels: {
    flower: "花", leaf: "叶", fruit: "果", butterfly: "蝶",
    bird: "鸟", water: "水", chime: "铃", cooking: "菜",
  },
};

export type GameConfig = typeof GAME_CONFIG;
