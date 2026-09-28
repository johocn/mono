import { describe, it, expect } from 'vitest';
import { passOf, planDrawOrder, type DrawPlanItem } from '../../src/render/Scene';

describe('Scene 三遍绘制计划（spec §3.4 硬约束 2）', () => {
  it('passOf：地砖/建筑 → 1，标签 → 2，棋子 → 3', () => {
    expect(passOf('board.tile.shop')).toBe(1);
    expect(passOf('building.s4.l2')).toBe(1);
    expect(passOf('board.center.fountain')).toBe(1);
    expect(passOf('label.s4')).toBe(2);
    expect(passOf('piece.p1')).toBe(3);
  });

  it('planDrawOrder：pass 升序为主键，pass 内按 depth（c+r，再 c）升序', () => {
    const items: DrawPlanItem[] = [
      { id: 'piece.p1', c: 5, r: 5, depth: 10, pass: 3 },
      { id: 'building.s4.l2', c: 5, r: 5, depth: 10, pass: 1 },
      { id: 'label.s4', c: 5, r: 5, depth: 10, pass: 2 },
      { id: 'building.s1.l1', c: 2, r: 3, depth: 5, pass: 1 },
      { id: 'building.s2.l1', c: 1, r: 4, depth: 5, pass: 1 },
    ];
    expect(planDrawOrder(items).map((i) => i.id)).toEqual([
      'building.s2.l1',   // pass1, depth5, c=1 先
      'building.s1.l1',   // pass1, depth5, c=2
      'building.s4.l2',   // pass1, depth10
      'label.s4',         // pass2
      'piece.p1',         // pass3
    ]);
  });

  it('planDrawOrder 是纯函数（不改写入参）', () => {
    const items: DrawPlanItem[] = [{ id: 'a', c: 1, r: 1, depth: 2, pass: 1 }];
    const snap = JSON.stringify(items);
    planDrawOrder(items);
    expect(JSON.stringify(items)).toBe(snap);
  });
});