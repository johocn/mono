/**
 * 连携（combo）纯函数状态机：连续释放不同技能在时间窗内叠加“连携层”，
 * 层数提供伤害倍率加成；重复同一技能不推进层数（鼓励交替技能构筑连段）。
 * 无随机、无引擎依赖，可独立单测；运行时由 Game 维护状态并在命中链路调用。
 */

export interface ComboState {
  /** 当前连携层数（0 = 无连携） */
  count: number;
  /** 上一次释放的技能 id（同技能不推进层数） */
  lastId: string | null;
  /** 连携剩余时间（秒），归零则断裂 */
  t: number;
}

/** 连携时间窗（秒）：超过未续招则断裂 */
export const COMBO_WINDOW = 1.6;

/** 第 n 层伤害倍率（索引 = count-1，超出取最后一级） */
export const COMBO_BONUS = [1, 1.05, 1.12, 1.2, 1.28];

export function emptyCombo(): ComboState {
  return { count: 0, lastId: null, t: 0 };
}

/** 连携层数 → 伤害倍率 */
export function comboMul(s: ComboState): number {
  if (s.count <= 0) return COMBO_BONUS[0];
  return COMBO_BONUS[Math.min(s.count, COMBO_BONUS.length) - 1];
}

/** 帧衰减：时间窗内持续推进计时，归零则断裂为无连携 */
export function comboDecay(s: ComboState, dt: number): ComboState {
  if (s.t <= 0 && s.count === 0) return s;
  const t = s.t - dt;
  if (t <= 0) return emptyCombo();
  return { count: s.count, lastId: s.lastId, t };
}

/**
 * 推入一次技能：切换技能则推进一层（封顶 COMBO_BONUS 长度），
 * 重复技能仅刷新时间窗不推进；重置时间窗。返回新状态（不改入参）。
 */
export function comboPush(s: ComboState, skillId: string): ComboState {
  let count: number;
  if (s.count === 0) count = 1;                                   // 起手第一段
  else if (s.lastId === skillId) count = s.count;                 // 同技能不推进
  else count = Math.min(s.count + 1, COMBO_BONUS.length);         // 切换技能推进一层（封顶）
  return { count, lastId: skillId, t: COMBO_WINDOW };
}
