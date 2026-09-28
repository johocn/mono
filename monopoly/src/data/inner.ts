export type InnerKind = 'plaza' | 'road' | 'lawn';

/** 内环：c/r ∈ 2..8；广场 c/r ∈ 4..6；石板路 c 或 r ∈ {3,7}；其余绿地 */
export function innerKind(c: number, r: number): InnerKind | null {
  const inInner = c >= 2 && c <= 8 && r >= 2 && r <= 8;
  if (!inInner) return null;
  if (c >= 4 && c <= 6 && r >= 4 && r <= 6) return 'plaza';
  if (c === 3 || c === 7 || r === 3 || r === 7) return 'road';
  return 'lawn';
}

export function plazaCells(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let c = 4; c <= 6; c++) for (let r = 4; r <= 6; r++) out.push([c, r]);
  return out;
}

/** v5 样张 line 64：内环第二排装饰楼（补「城市感」） */
export const INNER_DECO_SLOTS: Record<string, { levels: 1 | 2 | 3; deco: string }> = {
  '2,4': { levels: 3, deco: 'd1' },
  '2,6': { levels: 2, deco: 'd2' },
  '4,2': { levels: 2, deco: 'd3' },
  '6,2': { levels: 3, deco: 'd4' },
  '8,4': { levels: 2, deco: 'd5' },
  '8,6': { levels: 3, deco: 'd6' },
  '4,8': { levels: 2, deco: 'd7' },
  '6,8': { levels: 3, deco: 'd8' },
};