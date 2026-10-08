/**
 * 关卡 / 模式 / 道具配置
 * 方块为单一模式；ItemConfig 的键与 ProgressStore 背包、AdManager 道具中文名完全对齐。
 */

export type ModeId = "tetris";

/** 道具背包键（含适老辅助 + 分享/激励奖励 + 优惠券），与 AdManager.itemLabel 全量对齐 */
export interface ItemConfig {
  hint: number;
  reshuffle: number;
  reveal: number;
  peek: number;
  undo: number;
  rehear: number;
  step: number;
  shield: number;
  hammer: number;
  slow: number;
  bomb: number;
  swap: number;
  coupon: number;
}

/** 俄罗斯方块玩法配置（典藏版：适老大棋盘、慢速、禅模式） */
export interface TetrisConfig {
  id: string;
  mode: ModeId;
  name: string;
  boardCols: number;
  boardRows: number;
  /** 初始下落间隔（毫秒）：越大越慢，适老友好 */
  startGravityMs: number;
  /** 最快下落间隔（升级后逼近） */
  minGravityMs: number;
  /** 每消除多少行升一级（加快一点） */
  linesPerLevel: number;
  /** 是否提供「禅模式」（无时间压力、不结束） */
  zenAvailable: boolean;
}

export const TETRIS_CONFIG: TetrisConfig = {
  id: "tetris-1",
  mode: "tetris",
  name: "经典方块",
  boardCols: 10,
  boardRows: 20,
  startGravityMs: 1000,
  minGravityMs: 280,
  linesPerLevel: 8,
  zenAvailable: true,
};

export const ALL_LEVELS: TetrisConfig[] = [TETRIS_CONFIG];

export function getLevelsByMode(_mode: ModeId): TetrisConfig[] {
  return ALL_LEVELS;
}

/** 深拷贝（保持与消消乐同名的纯函数入口，便于未来做难度微调） */
export function cloneAdjustedLevel(base: TetrisConfig): TetrisConfig {
  return { ...base };
}
