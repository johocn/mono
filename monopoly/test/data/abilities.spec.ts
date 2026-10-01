import { describe, it, expect } from 'vitest';
import { ABILITIES, abilityOfPlayer, abilityOfSeat } from '../../src/data/abilities';
import { ROLE_BY_SEAT } from '../../src/data/lines';

describe('角色技能 · 数据口径（data/abilities.ts）', () => {
  it('四众各一技，且与台词库席位表同序', () => {
    expect(Object.keys(ABILITIES)).toEqual(['wukong', 'bajie', 'wujing', 'sanzang']);
    expect(ROLE_BY_SEAT).toEqual(['wukong', 'bajie', 'wujing', 'sanzang']);
    for (const role of ROLE_BY_SEAT) expect(ABILITIES[role].role).toBe(role);
  });

  it('技能名不重复，且每条标注原著出处（含回目）', () => {
    const defs = ROLE_BY_SEAT.map((r) => ABILITIES[r]);
    expect(new Set(defs.map((d) => d.name)).size).toBe(defs.length);
    for (const d of defs) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.desc.length).toBeGreaterThan(0);
      expect(d.source).toMatch(/回/);
    }
  });

  it('数值全部落在中性值一侧（关闭技能即逐值回旧口径）', () => {
    for (const role of ROLE_BY_SEAT) {
      const d = ABILITIES[role];
      expect(d.stepBonus).toBeGreaterThanOrEqual(0);
      expect(d.passStartBonus).toBeGreaterThanOrEqual(0);
      expect(d.buyDiscount).toBeGreaterThan(0);
      expect(d.buyDiscount).toBeLessThanOrEqual(1);
      expect(d.rentRelief).toBeGreaterThanOrEqual(0);
      expect(d.rentRelief).toBeLessThan(1);
    }
  });

  it('四技能各占一个维度（不重叠）：加成只落在自己的字段上', () => {
    expect(ABILITIES.wukong.stepBonus).toBeGreaterThan(0);
    expect(ABILITIES.bajie.buyDiscount).toBeLessThan(1);
    expect(ABILITIES.wujing.passStartBonus).toBeGreaterThan(0);
    expect(ABILITIES.sanzang.rentRelief).toBeGreaterThan(0);
    /* 其余三个维度保持中性，避免技能叠加牵动既有租金/买地口径 */
    for (const role of ROLE_BY_SEAT) {
      const d = ABILITIES[role];
      const active = [d.stepBonus > 0, d.buyDiscount < 1, d.passStartBonus > 0, d.rentRelief > 0];
      expect(active.filter(Boolean).length).toBe(1);
    }
  });

  it('席位/玩家取模回绕：abilityOfSeat 与 abilityOfPlayer 口径一致', () => {
    expect(abilityOfSeat(0)).toBe(ABILITIES.wukong);
    expect(abilityOfSeat(3)).toBe(ABILITIES.sanzang);
    expect(abilityOfSeat(4)).toBe(ABILITIES.wukong);   // 越界回绕（不炸渲染）
    expect(abilityOfSeat(7)).toBe(ABILITIES.sanzang);
    for (let id = 1; id <= 4; id++) expect(abilityOfPlayer(id)).toBe(abilityOfSeat(id - 1));
  });
});