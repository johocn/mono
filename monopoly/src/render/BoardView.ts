import { ipos } from './iso';
import { BOARD_COLS, BOARD_ROWS, RING_SIZE, ringPath, tileIndexOf, TILES } from '../data/board';
import { passOf } from './Scene';
import { DEFAULT_GEO } from '../skin/layout';
import type { ElementSpec } from '../skin/instantiate';

export interface BoardCell { index: number; c: number; r: number; x: number; y: number }

/** 32 个外圈格的中心坐标（v5 样张 line 275–296 的定位部分） */
export function boardCells(geo: { hw: number; hh: number; ox: number; oy: number }): BoardCell[] {
  return ringPath(BOARD_COLS, BOARD_ROWS).map(([c, r], index) => {
    const [x, y] = ipos(c, r, geo);
    return { index, c, r, x, y };
  });
}

/** 生成 32 格地砖的 instantiate spec（每格 1 地砖 + 1 内圈；edge 用于归属色条，MVP 由 owner 态驱动） */
export function boardTileSpecs(currentIndex: number, ownerOf: (index: number) => number | null): ElementSpec[] {
  const cells = boardCells(DEFAULT_GEO);
  const specs: ElementSpec[] = [];
  for (const cell of cells) {
    const t = TILES[cell.index];
    const owner = ownerOf(cell.index);
    specs.push({
      id: `board.tile.${t.type}`,
      slot: cell.index,
      c: cell.c,
      r: cell.r,
      state: { owner, selected: cell.index === currentIndex, level: t.level === 0 ? 1 : t.level },
    });
  }
  return specs;
}

export { passOf, RING_SIZE, tileIndexOf };