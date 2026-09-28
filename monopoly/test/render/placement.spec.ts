import { describe, it, expect } from 'vitest';
import { resolvePlacement } from '../../src/render/Scene';

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };

describe('resolvePlacement（唯一地点：给每个实例算 cx/cy/s）', () => {
  it('地砖：cx/cy = ipos(c,r)，s = 1', () => {
    const p = resolvePlacement({ id: 'board.tile.shop', c: 1, r: 1, slot: 0, lift: 0, box: { w: 42, d: 21, h: 2 } }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45 });
    expect(p.cx).toBe(195);
    expect(p.cy).toBe(117);
    expect(p.s).toBe(1);
  });

  it('建筑：cy 上移 1px 贴合地砖（v5 line 302: y - 1），s = 0.72', () => {
    const p = resolvePlacement({ id: 'building.s4.l2', c: 4, r: 4, slot: 4, lift: 0, box: { w: 42, d: 21, h: 46 } }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45, buildingScale: 0.72, buildingYOffset: 1 });
    expect(p.s).toBe(0.72);
    expect(p.cy).toBe(180 - 1);
  });

  it('贴墙装饰：cy 减去管线 lift（不自己算坐标）', () => {
    const p = resolvePlacement({ id: 'prop.lantern', c: 4, r: 4, slot: 4, lift: 13.8, box: { w: 10, d: 2, h: 14 } }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45 });
    expect(p.cy).toBe(180 - 13.8);
  });

  it('贴墙装饰：给了 buildingScale 时 lift 也随宿主楼缩放（挂件不飘出楼外）', () => {
    const p = resolvePlacement(
      { id: 'prop.rooftopBox', c: 4, r: 4, slot: 4, lift: 46, mount: 'roof', box: { w: 14, d: 7, h: 7 } },
      GEO,
      { pawnGap: 9.6, pawnFrontDy: 1.45, buildingScale: 0.72, buildingYOffset: 1 },
    );
    expect(p.s).toBe(0.72);
    /* 宿主楼屋顶面 = (y-1) - 46×0.72；cy + lift×s 必须等于宿主基座 y-1（= v5 isoShop 的 cy） */
    expect(p.cy).toBeCloseTo(180 - 1 - 46 * 0.72, 5);
    expect(p.cy + 46 * p.s).toBeCloseTo(180 - 1, 5);
  });

  it('地面挂件（树/灯）：不随建筑缩放，s = 1、cy = 格心', () => {
    const p = resolvePlacement(
      { id: 'prop.tree', c: 4, r: 4, slot: null, lift: 0, mount: 'ground', box: { w: 14, d: 8, h: 30 } },
      GEO,
      { pawnGap: 9.6, pawnFrontDy: 1.45, buildingScale: 0.72, buildingYOffset: 1 },
    );
    expect(p.s).toBe(1);
    expect(p.cy).toBe(180);
  });

  it('棋子：cx 用 pawnSlots 错开、cy = y + hh×frontDy', () => {
    const p = resolvePlacement({ id: 'piece.p3', c: 5, r: 5, slot: null, lift: 0, box: { w: 8.4, d: 4.2, h: 13 }, pawnIndex: 2 }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45 });
    expect(p.cx).toBe(195 + 0 + (2 - 1.5) * 9.6);
    expect(p.cy).toBeCloseTo(201 + 10.5 * 1.45, 3);
  });

  it('未知 ID 前缀 → 默认 cx/cy = ipos，s = 1（不抛错）', () => {
    const p = resolvePlacement({ id: 'ui.panel', c: 1, r: 1, slot: null, lift: 0, box: { w: 370, d: 1, h: 268 } }, GEO, { pawnGap: 9.6, pawnFrontDy: 1.45 });
    expect(p.s).toBe(1);
  });
});