import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/core/game';
import { handBarView, handLayout, handSlots } from '../../src/ui/panels';

const fixed = (d1: number, d2: number) => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

describe('panels：手牌三键排序（M20.3 spec §4.1）', () => {
  it('① 持 4 张：持有段（priority 升序）在前，未持有段（priority 升序）在后', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.hands[0] = ['bomb', 'pardon', 'teleport', 'demolish'];
    const slots = handSlots(g.state);
    expect(slots.map((s) => s.kind)).toEqual([
      'pardon', 'bomb', 'teleport', 'demolish',                          // 持有段：10 / 30 / 50 / 60
      'taxShield', 'doubleRent', 'subsidy', 'barrier', 'boom', 'bullBear', 'dividend',  // 未持有段：15 / 20 / 25 / 40 / 55 / 70 / 80
    ]);
    expect(slots.map((s) => s.held)).toEqual([true, true, true, true, false, false, false, false, false, false, false]);
  });

  it('② 全未持有：退化为纯 priority 序（held 全同 → 只看第 ② 键）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.hands[0] = [];
    const slots = handSlots(g.state);
    expect(slots.map((s) => s.kind)).toEqual(
      ['pardon', 'taxShield', 'doubleRent', 'subsidy', 'bomb', 'barrier', 'teleport', 'boom', 'demolish', 'bullBear', 'dividend'],
    );
    expect(slots.every((s) => !s.held)).toBe(true);
  });

  it('排序不改可点性：`enabled` 与排序前的同 kind 槽一致', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[3] = { index: 3, owner: 2, level: 1, processing: false };
    const by = (k: string) => handSlots(g.state).find((s) => s.kind === k)!;
    expect(by('bomb').enabled).toBe(true);
    expect(by('pardon').enabled).toBe(false);
    expect(by('doubleRent').enabled).toBe(true);
    /* M20.3-B：红利卡任意阶段可点（恒成功）；涨跌卡同（落库校验在引擎侧） */
    expect(by('dividend').enabled).toBe(true);
    expect(by('bullBear').enabled).toBe(true);
  });
});

describe('panels：手牌版式与滑动条（M20.3 spec §4.2）', () => {
  it('③ 11 槽（M20.5 实盘）：contentW 665 / maxScroll 275；首屏可见 0..6', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const layout = handLayout(g.state);
    expect(layout.slots).toHaveLength(11);
    expect(layout.contentW).toBe(11 * 55 + 10 * 6);    // 665
    expect(layout.maxScroll).toBe(665 - 390);          // 275
    expect(layout.visible).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(handBarView(g.state)).not.toBeNull();
  });

  it('④ 滑到底：下标 0 的槽移出可见集、下标 7 入画', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const end = handLayout(g.state, 92);
    expect(end.scroll).toBe(92);
    /* 滑到底：下标 0 的槽中心 −49.5，已完全移出左缘（可见判据 cx > −W/2 = −27.5） */
    expect(end.visible).not.toContain(0);
    expect(end.visible).toContain(7);
  });

  it('⑤ scroll 越界被 clamp 到 [0, maxScroll]（渲染与命中区共用同一口径）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(handLayout(g.state, -50).scroll).toBe(0);
    expect(handLayout(g.state, 9999).scroll).toBe(275);
  });

  it('滑动条比例 = 舞台宽 / 内容宽，偏移 = scroll / maxScroll', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const bar = handBarView(g.state, 137.5);
    expect(bar).not.toBeNull();
    expect(bar!.ratio).toBeCloseTo(390 / 665, 6);
    expect(bar!.offset).toBeCloseTo(0.5, 6);
    expect(handBarView(g.state, 275)!.offset).toBe(1);
  });
});
