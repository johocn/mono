import { describe, it, expect } from 'vitest';
import { validateSkin, type SkinFile } from '../../tools/lint-skin.mjs';
import { allElementIds } from '../../src/skin/registry';

const ok = (): SkinFile => ({
  id: 'default',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: { gold: '#f5c451' },
  elements: { 'board.tile.shop': { kind: 'proc', preset: 'tile', params: { fill: '#2f4238' } } },
});

const exists = (p: string) => p === 'tex/tile-shop.webp' || p === 'atlas/board.json';
const registered = new Set(allElementIds());

describe('validateSkin', () => {
  it('合法皮肤零错误', () => {
    expect(validateSkin(ok(), registered, exists)).toEqual([]);
  });

  it('ID 不合法 → 报错', () => {
    const s = ok();
    s.elements['Board.Tile.Shop'] = { kind: 'proc', preset: 'tile' };
    expect(validateSkin(s, registered, exists).some((e) => e.includes('Board.Tile.Shop'))).toBe(true);
  });

  it('未注册的 elementId → 报错（禁止先写皮肤后补注册表）', () => {
    const s = ok();
    s.elements['prop.doesNotExist'] = { kind: 'proc', preset: 'x' };
    expect(validateSkin(s, registered, exists)[0]).toMatch(/not in registry/);
  });

  it('image 缺 src → 报错', () => {
    const s = ok();
    s.elements['board.tile.shop'] = { kind: 'image' } as never;
    expect(validateSkin(s, registered, exists).some((e) => e.includes('src'))).toBe(true);
  });

  it('image src 素材不存在 → 报错', () => {
    const s = ok();
    s.elements['board.tile.shop'] = { kind: 'image', src: 'tex/missing.webp' };
    expect(validateSkin(s, registered, exists).some((e) => e.includes('missing asset'))).toBe(true);
  });

  it('anchor 越界 → 报错', () => {
    const s = ok();
    s.elements['board.tile.shop'] = { kind: 'image', src: 'tex/tile-shop.webp', anchor: [1.2, 0.5] };
    expect(validateSkin(s, registered, exists).some((e) => e.includes('anchor'))).toBe(true);
  });

  it('frames 空 src 或 fps<=0 → 报错', () => {
    const s = ok();
    s.elements['board.tile.shop'] = { kind: 'frames', src: [], fps: 0 } as never;
    const errs = validateSkin(s, registered, exists);
    expect(errs.some((e) => e.includes('src'))).toBe(true);
    expect(errs.some((e) => e.includes('fps'))).toBe(true);
  });

  it('geo 缺字段 → 报错', () => {
    const s = ok();
    s.geo = { hw: 21 } as never;
    expect(validateSkin(s, registered, exists).some((e) => e.includes('geo'))).toBe(true);
  });
});