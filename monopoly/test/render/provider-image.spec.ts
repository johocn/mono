import { describe, it, expect } from 'vitest';
import { PROVIDERS } from '../../src/render/providers';
import { assetPaths, assetUrl } from '../../src/render/assets';
import type { SpriteRequest } from '../../src/render/providers/proc';
import type { ProviderSpec, SkinPack } from '../../src/skin/types';

/* 纹理用哨兵对象代替：本用例只验证「请求内容」，不 new 任何 Pixi 对象（node 环境无 canvas） */
const TEX = { __tex: true } as never;

const fakeCtx = (over: Record<string, unknown> = {}) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 60, d: 30, h: 28 },
  cx: 100,
  cy: 200,
  s: 2,
  params: {},
  state: {},
  ...over,
});

describe('image provider', () => {
  it('按 box × s 铺满：x/y 取 cx/cy，宽高取 box 缩放，锚点原样透传 spec.anchor', () => {
    const out: SpriteRequest[] = [];
    const ctx = fakeCtx({
      spec: { kind: 'image', src: 'tex/fountain.png', anchor: [0.5, 1] },
      asset: () => TEX,
      sprite: (r: SpriteRequest) => out.push(r),
    });
    PROVIDERS.image.draw({} as never, ctx as never);
    expect(out.length).toBe(1);
    expect(out[0].texture).toBe(TEX);
    expect(out[0].x).toBe(100);
    expect(out[0].y).toBe(200);
    expect(out[0].w).toBe(120); // box.w 60 × s 2
    expect(out[0].h).toBe(56); // box.h 28 × s 2
    expect(out[0].anchor).toEqual([0.5, 1]);
  });

  it('素材未装载 → 不出图、不抛错（回退链上游兜底，spec §3.6.4）', () => {
    const out: SpriteRequest[] = [];
    const ctx = fakeCtx({
      spec: { kind: 'image', src: 'tex/missing.png' },
      asset: () => null,
      sprite: (r: SpriteRequest) => out.push(r),
    });
    expect(() => PROVIDERS.image.draw({} as never, ctx as never)).not.toThrow();
    expect(out.length).toBe(0);
  });

  it('anchor 缺省 → 原样透传 undefined（居中由 makeSprite 兜底）', () => {
    const out: SpriteRequest[] = [];
    const ctx = fakeCtx({
      spec: { kind: 'image', src: 'tex/tree.png' },
      asset: () => TEX,
      sprite: (r: SpriteRequest) => out.push(r),
    });
    PROVIDERS.image.draw({} as never, ctx as never);
    expect(out.length).toBe(1);
    expect(out[0].anchor).toBeUndefined();
  });
});

describe('assets 路径工具', () => {
  const pack = (elements: Record<string, ProviderSpec>): SkinPack => ({
    id: 'photo',
    geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
    tokens: {},
    elements,
  });

  it('assetPaths：收集 image/atlas/frames 的 src，去重且保序', () => {
    const p = pack({
      'prop.tree': { kind: 'image', src: 'tex/tree.png' },
      'prop.lamp': { kind: 'image', src: 'tex/lamp.png' },
      'prop.tree2': { kind: 'image', src: 'tex/tree.png' },
      'card.fate.back': { kind: 'atlas', src: 'atlas/fate.json', frame: 'back' },
      'fx.coin': { kind: 'frames', src: ['tex/c1.png', 'tex/c2.png'], fps: 8 },
      'board.tile.shop': { kind: 'proc', preset: 'tile' },
    });
    expect(assetPaths(p)).toEqual([
      'tex/tree.png',
      'tex/lamp.png',
      'atlas/fate.json',
      'tex/c1.png',
      'tex/c2.png',
    ]);
  });

  it('assetPaths(null) → []；assetUrl 拼 `base/<packId>/<rel>`', () => {
    expect(assetPaths(null)).toEqual([]);
    expect(assetUrl('photo', 'tex/tree.png')).toBe('./skins/photo/tex/tree.png');
    expect(assetUrl('photo', 'tex/tree.png', '/static/skins')).toBe('/static/skins/photo/tex/tree.png');
  });
});