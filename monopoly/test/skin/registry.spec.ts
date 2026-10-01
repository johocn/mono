import { describe, it, expect } from 'vitest';
import { REGISTRY, getEntry, allElementIds, BUILDING_HEIGHTS } from '../../src/skin/registry';
import { isElementId } from '../../src/skin/ids';

describe('registry', () => {
  it('每个条目 ID 合法且与 key 一致', () => {
    for (const [k, e] of Object.entries(REGISTRY)) {
      expect(isElementId(k), k).toBe(true);
      expect(e.id).toBe(k);
    }
  });

  it('每个条目 box 宽深高均为正、anchor 在 0–1', () => {
    for (const e of Object.values(REGISTRY)) {
      expect(e.box.w).toBeGreaterThan(0);
      expect(e.box.d).toBeGreaterThan(0);
      expect(e.box.h).toBeGreaterThan(0);
      expect(e.anchor[0]).toBeGreaterThanOrEqual(0);
      expect(e.anchor[0]).toBeLessThanOrEqual(1);
      expect(e.anchor[1]).toBeGreaterThanOrEqual(0);
      expect(e.anchor[1]).toBeLessThanOrEqual(1);
      expect(e.providerKinds.length).toBeGreaterThan(0);
    }
  });

  it('wall/roof 挂载必须声明 attach（堵住「飘在半空」）', () => {
    for (const e of Object.values(REGISTRY)) {
      if (e.mount === 'wall' || e.mount === 'roof') {
        expect(e.attach, e.id).toBeTruthy();
        expect(e.attach!.atV).toBeGreaterThanOrEqual(0);
        expect(e.attach!.atV).toBeLessThanOrEqual(1);
      } else {
        expect(e.attach, e.id).toBeUndefined();
      }
    }
  });

  it('五级建筑齐备、墙高表齐备', () => {
    for (let s = 0; s <= 31; s++) {
      expect(getEntry(`building.s${s}.l1`)).toBeTruthy();
      expect(getEntry(`building.s${s}.l2`)).toBeTruthy();
      expect(getEntry(`building.s${s}.l3`)).toBeTruthy();
      expect(getEntry(`building.s${s}.l4`)).toBeTruthy();
      expect(getEntry(`building.s${s}.l5`)).toBeTruthy();
    }
    expect(BUILDING_HEIGHTS).toEqual({ 1: 26, 2: 46, 3: 72, 4: 88, 5: 104 });
  });

  it('托管 host 必须解析得到（或为 slot:<n> 形态）', () => {
    for (const e of Object.values(REGISTRY)) {
      const host = e.attach?.host;
      if (!host) continue;
      if (host.startsWith('slot:')) continue;
      expect(getEntry(host), `${e.id} → ${host}`).toBeTruthy();
    }
  });

  it('allElementIds 去重且数量 = 条目数', () => {
    const ids = allElementIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(Object.keys(REGISTRY).length);
  });
});