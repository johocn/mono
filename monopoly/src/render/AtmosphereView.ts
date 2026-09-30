import type { ElementSpec } from '../skin/instantiate';
import { fb } from './providers/proc-base';

/**
 * 环境层台位（spec §3.2 / §12）：全部是**定格台位**（左上角坐标，非格心）。
 * 可见条带 = 外圈棋盘（底 ≈ 312）与底坞（顶 606）之间的中部；坐标写在此常量表，
 * 不在 `layout.ts` 之外散落（`fb({...})` 是「禁写死」gate 的合法豁免位）。
 *
 * 绘制次序 = 数组次序（同 pass + 同 depth 时按插入顺序稳定排序，后者压前者），
 * 故数组顺序即「远 → 近」：夜空 → 星 → 月 → 远山 → 街市 → 灯笼串 → 街灯。
 */
const A = fb({
  sky: [0, 0],
  stars: [0, 306],
  moon: [296, 318],
  ridge: [0, 386],
  street: [0, 462],
  lanterns: [0, 430],
  lampL: [16, 496],
  lampR: [334, 496],
});

function at(id: string, pos: number[]): ElementSpec {
  return { id, slot: null, c: 0, r: 0, pass: 1, fixed: { cx: pos[0], cy: pos[1] } };
}

/**
 * 环境层 7 个 id / 8 条台位（街灯左右各一盏，同一 id 多实例——与 `board.tile.shop` 同规）。
 * 静态层：内容不随对局状态变化，配色由 `config/theme.json` 的 `bg.*` binding 装配。
 */
export function atmosphereSpecs(): ElementSpec[] {
  return [
    at('bg.sky', A.sky),
    at('bg.stars', A.stars),
    at('bg.moon', A.moon),
    at('bg.ridge', A.ridge),
    at('bg.street', A.street),
    at('bg.lanternString', A.lanterns),
    at('bg.streetLamp', A.lampL),
    at('bg.streetLamp', A.lampR),
  ];
}