import { ipos } from './iso';
import { innerKind, plazaCells, INNER_DECO_SLOTS } from '../data/inner';
import { DEFAULT_GEO } from '../skin/layout';
import type { ElementSpec } from '../skin/instantiate';

export const INNER_FILL = { lawn: 'board.tile.shop', road: 'board.tile.stock', plaza: 'board.tile.core' } as const;

/** 内环格子 spec（用与地砖同款 provider，不同 id 以便独立性换肤） */
export function innerSpecs(): ElementSpec[] {
  const geo = DEFAULT_GEO;
  const out: ElementSpec[] = [];
  for (let c = 2; c <= 8; c++) {
    for (let r = 2; r <= 8; r++) {
      const kind = innerKind(c, r);
      if (!kind) continue;
      const [x, y] = ipos(c, r, geo);
      void x; void y;
      out.push({ id: 'board.inner.deco', slot: null, c, r, state: { dim: kind !== 'plaza' } });
      const deco = INNER_DECO_SLOTS[`${c},${r}`];
      if (deco) out.push({ id: `board.inner.${deco.deco}`, slot: null, c, r, level: deco.levels });
    }
  }
  return out;
}

export function fountainSpec(): ElementSpec {
  return { id: 'board.center.fountain', slot: null, c: 5, r: 5 };
}

export { plazaCells };