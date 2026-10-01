import { describe, it, expect } from 'vitest';
import { PAWN_COUNT, pawnPlaces, pawnSpecs, type PawnState } from '../../src/render/PieceView';

const at = (index: number, c: number, r: number, active = false): PawnState => ({ index, c, r, active });

describe('piece 棋子分组（同格人数 → Scene 决定 居中/单排/2×2）', () => {
  it('四人同格：组内序号 0..3、组大小 4（Scene 侧走 2×2）', () => {
    const places = pawnPlaces([at(0, 5, 9), at(1, 5, 9), at(2, 5, 9), at(3, 5, 9)]);
    expect(places).toHaveLength(PAWN_COUNT);
    expect(places.map((p) => p.pawnIndex)).toEqual([0, 1, 2, 3]);
    expect(places.map((p) => p.pawnCount)).toEqual([4, 4, 4, 4]);
  });

  it('分散在三格：每格各自从 0 起算，组大小随格内人数', () => {
    const places = pawnPlaces([at(0, 1, 1), at(1, 2, 2), at(2, 2, 2), at(3, 3, 3)]);
    const byIndex = new Map(places.map((p) => [p.pw.index, p]));
    expect(byIndex.get(0)).toMatchObject({ pawnIndex: 0, pawnCount: 1 });
    expect(byIndex.get(1)).toMatchObject({ pawnIndex: 0, pawnCount: 2 });
    expect(byIndex.get(2)).toMatchObject({ pawnIndex: 1, pawnCount: 2 });
    expect(byIndex.get(3)).toMatchObject({ pawnIndex: 0, pawnCount: 1 });
  });

  it('spec 透出 pawnIndex / pawnCount（Scene 唯一地点据此算 cx/cy）', () => {
    const specs = pawnSpecs([at(0, 5, 9, true), at(1, 5, 9)]);
    expect(specs.map((s) => s.id)).toEqual(['piece.p1', 'piece.p2']);
    expect(specs.map((s) => s.pawnIndex)).toEqual([0, 1]);
    expect(specs.map((s) => s.pawnCount)).toEqual([2, 2]);
    expect(specs[0].state).toMatchObject({ owner: 1, active: true });
  });
});