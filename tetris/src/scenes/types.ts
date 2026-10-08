import type { LevelResult } from "../config/GameText";

export interface LevelSceneCallbacks {
  onComplete: (result: LevelResult) => void;
  onExit: () => void;
  onRestart: () => void;
}
