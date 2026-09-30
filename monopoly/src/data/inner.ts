import { BOARD_COLS, BOARD_ROWS } from './board';

export type InnerKind = 'plaza' | 'road' | 'lawn';

/** 内环范围：外圈内侧一圈（11×7 盘 → c ∈ 2..10、r ∈ 2..6） */
const C0 = 2;
const C1 = BOARD_COLS - 1;
const R0 = 2;
const R1 = BOARD_ROWS - 1;
/** 棋盘几何中心（11×7 → 6,4）：广场居中 3×3，其外一圈为石板路，其余绿地 */
const PC = Math.floor((C0 + C1) / 2);
const PR = Math.floor((R0 + R1) / 2);

/** 内环：广场居中 3×3；广场外一圈为石板路；其余绿地 */
export function innerKind(c: number, r: number): InnerKind | null {
  const inInner = c >= C0 && c <= C1 && r >= R0 && r <= R1;
  if (!inInner) return null;
  if (Math.abs(c - PC) <= 1 && Math.abs(r - PR) <= 1) return 'plaza';
  if (Math.abs(c - PC) === 2 || Math.abs(r - PR) === 2) return 'road';
  return 'lawn';
}

export function plazaCells(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let c = PC - 1; c <= PC + 1; c++) for (let r = PR - 1; r <= PR + 1; r++) out.push([c, r]);
  return out;
}

/** 广场台位（喷泉居中） */
export const PLAZA_CENTER: [number, number] = [PC, PR];

/** 内环第二排装饰楼（补「城市感」）：只落在绿地格上 */
export const INNER_DECO_SLOTS: Record<string, { levels: 1 | 2 | 3; deco: string }> = {
  '2,3': { levels: 3, deco: 'd1' },
  '2,5': { levels: 2, deco: 'd2' },
  '3,3': { levels: 2, deco: 'd3' },
  '3,5': { levels: 3, deco: 'd4' },
  '9,3': { levels: 2, deco: 'd5' },
  '9,5': { levels: 3, deco: 'd6' },
  '10,3': { levels: 2, deco: 'd7' },
  '10,5': { levels: 3, deco: 'd8' },
};
