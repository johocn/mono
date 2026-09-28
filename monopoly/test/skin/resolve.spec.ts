import { describe, it, expect } from 'vitest';
import { resolve, builtinFallback, BAD_SKIN } from '../../src/skin/resolve';
import type { SkinPack } from '../../src/skin/types';

const base = (): SkinPack => ({
  id: 'photo',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: { gold: '#f5c451' },
  elements: { 'board.tile.shop': { kind: 'image', src: 'tex/tile-shop.webp' } },
});

const fallback = (): SkinPack => ({
  id: 'default',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: { gold: '#f5c451' },
  elements: { 'board.tile.shop': { kind: 'proc', preset: 'tile', params: { fill: '#2f4238' } } },
});

describe('resolve 四级回退链', () => {
  it('L1 元素级覆盖优先', () => {
    const r = resolve('board.tile.shop', base(), fallback(), {
      'board.tile.shop': { kind: 'proc', preset: 'tile', params: { fill: '#000000' } },
    });
    expect(r.level).toBe(1);
    expect(r.provider.kind).toBe('proc');
  });

  it('L2 皮肤包命中', () => {
    const r = resolve('board.tile.shop', base(), fallback());
    expect(r.level).toBe(2);
    expect(r.provider).toMatchObject({ kind: 'image', src: 'tex/tile-shop.webp' });
  });

  it('L3 回退全局默认皮肤', () => {
    const r = resolve('board.tile.shop', { ...base(), elements: {} }, fallback());
    expect(r.level).toBe(3);
    expect(r.provider).toMatchObject({ kind: 'proc' });
  });

  it('L4 内建兜底：皮肤为 null 且默认皮肤也没有该元素', () => {
    const r = resolve('prop.lantern', null, null);
    expect(r.level).toBe(4);
    expect(r.provider).toMatchObject({ kind: 'proc', preset: 'builtin' });
  });

  it('坏 JSON（非法 provider 形态）逐级回退，不抛错', () => {
    const broken = { ...base(), elements: { 'board.tile.shop': { kind: 'nope' } as never } };
    const r = resolve('board.tile.shop', broken, fallback());
    expect(r.level).toBe(3);
    expect(r.provider.kind).toBe('proc');
  });

  it('image provider 缺 src 视为非法，回退', () => {
    const broken = { ...base(), elements: { 'board.tile.shop': { kind: 'image' } as never } };
    expect(resolve('board.tile.shop', broken, fallback()).level).toBe(3);
  });

  it('frames provider 需非空 src[] 与正 fps', () => {
    const broken = { ...base(), elements: { 'board.tile.shop': { kind: 'frames', src: [], fps: 0 } as never } };
    expect(resolve('board.tile.shop', broken, fallback()).level).toBe(3);
  });

  it('未注册的 ID 直接走内建兜底', () => {
    expect(resolve('ui.panel', null, fallback()).level).toBe(4);
  });

  it('builtinFallback 是纯色块 + 文字（永不空白）', () => {
    const f = builtinFallback('prop.lantern');
    expect(f).toMatchObject({ kind: 'proc', preset: 'builtin' });
    expect((f as { params: Record<string, unknown> }).params.label).toBe('prop.lantern');
  });

  it('BAD_SKIN 常量是「不可能合法」的探针（lint 用）', () => {
    expect(resolve('board.tile.shop', BAD_SKIN, fallback()).level).toBe(3);
  });
});

describe('resolve 纯函数性', () => {
  it('同入参同出参，不改写入参', () => {
    const s = base();
    const snapshot = JSON.stringify(s);
    const a = resolve('board.tile.shop', s, fallback());
    const b = resolve('board.tile.shop', s, fallback());
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});