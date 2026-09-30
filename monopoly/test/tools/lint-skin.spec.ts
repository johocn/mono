import { describe, it, expect } from 'vitest';
import { validateSkin, validateTheme, THEME_KEYS, type SkinFile } from '../../tools/lint-skin.mjs';
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

/* —— 主题文件（spec §4；运行时坏数据是静默跳过，故闸门必须拦住"静默不生效"） —— */

const pal = (over: Record<string, unknown> = {}): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of THEME_KEYS as string[]) out[k] = '#112233';
  return { ...out, ...over };
};

const okTheme = () => ({
  palettes: { warm: pal() },
  bindings: [
    { match: 'building.*.l2', preset: 'shop', palette: 'warm' },
    { match: 'prop.*', palette: 'warm', params: { glow: false } },
  ],
});

describe('validateTheme', () => {
  it('合法主题零错误', () => {
    expect(validateTheme(okTheme(), registered)).toEqual([]);
  });

  it('palette 缺色键 → 报错（点名缺哪个键）', () => {
    const missing = pal();
    delete (missing as Record<string, unknown>).win;
    const errs = validateTheme({ palettes: { warm: missing }, bindings: [{ match: 'prop.*', palette: 'warm' }] }, registered);
    expect(errs.some((e) => e.includes('win'))).toBe(true);
  });

  it('binding 引用未定义 palette → 报错', () => {
    const t = okTheme();
    t.bindings[1] = { match: 'prop.*', palette: 'nope' } as never;
    expect(validateTheme(t, registered).some((e) => e.includes('未定义 palette=nope'))).toBe(true);
  });

  it('match 不命中任何注册 ID → 报错（防"写了但不生效"）', () => {
    const t = okTheme();
    t.bindings[0] = { match: 'building.*.l9', palette: 'warm' } as never;
    expect(validateTheme(t, registered).some((e) => e.includes('building.*.l9'))).toBe(true);
  });

  it('paletteBySlot 长度 ≠ 32 → 报错', () => {
    const t = okTheme();
    t.bindings[0] = { match: 'building.*.l1', paletteBySlot: ['warm', 'warm'] } as never;
    expect(validateTheme(t, registered).some((e) => e.includes('长 32'))).toBe(true);
  });

  it('paletteBySlot 内含未定义 palette → 报错', () => {
    const t = okTheme();
    const slot = Array.from({ length: 32 }, () => 'warm');
    slot[7] = 'nope';
    t.bindings[0] = { match: 'building.*.l1', paletteBySlot: slot } as never;
    expect(validateTheme(t, registered).some((e) => e.includes('palette=nope'))).toBe(true);
  });

  it('bindings 为空 / 缺失 → 报错', () => {
    expect(validateTheme({ palettes: { warm: pal() }, bindings: [] }, registered).some((e) => e.includes('bindings'))).toBe(true);
    expect(validateTheme({ palettes: { warm: pal() } }, registered).some((e) => e.includes('bindings'))).toBe(true);
  });
});