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

/**
 * 本次前进**经过的格序列**（含起点与落点，沿环逐格），spec §6 P1 第 12 项。
 *
 * `advance()` 只给首尾两格，而相机取景（`src/core/framing.ts` 的 `bboxOf` / `choreography`）
 * 与动效上下文（`FxContext.cells`）需要的是**整条路径**——拐角处必须用并集包围盒，
 * 首尾连线会算出一个装不下路径的框。步数为 0 / 负 → 只有起点（与 `advance` 的原地口径一致）。
 */
export function pathIndices(from: number, steps: number, size: number = RING_SIZE): number[] {
  const out: number[] = [];
  const n = Math.max(steps, 0);
  for (let k = 0; k <= n; k += 1) out.push(((from + k) % size + size) % size);
  return out;
}