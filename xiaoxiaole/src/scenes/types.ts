/** 关卡场景统一回调契约（三大模式共用） */

import type { LevelResult } from "../config/GameText";

export interface LevelSceneCallbacks {
  /** 关卡正常结束（胜/负） */
  onComplete(result: LevelResult): void;
  /** 玩家主动返回主菜单（不记录成绩） */
  onExit(): void;
  /** 玩家要求重开本关 */
  onRestart(): void;
}
