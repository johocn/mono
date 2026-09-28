import { RING_SIZE } from '../data/board';

export interface Advance {
  from: number;
  to: number;
  steps: number;
  /** 是否触发「经过起点」+￥200（含正好落在起点；后退不计，spec §5.4） */
  passedStart: boolean;
  /** M5：被路障截停时的命中格号（未截停则缺省，`toEqual` 忽略 undefined） */
  barrier?: number;
}

/**
 * 沿外圈路径前进 steps 格（spec §5.1 逐格移动 / §5.4 经过起点）。
 * 纯函数、环长可注入（默认 32），便于单测覆盖越界回绕与整圈。
 */
export function advance(from: number, steps: number, size: number = RING_SIZE): Advance {
  const raw = from + steps;
  const to = ((raw % size) + size) % size;
  return { from, to, steps, passedStart: steps > 0 && raw >= size };
}