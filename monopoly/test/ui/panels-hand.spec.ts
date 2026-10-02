import { afterEach, describe, it, expect } from 'vitest';
import { createGame } from '../../src/core/game';
import { ITEM_CARDS, type ItemCardDef } from '../../src/data/cards';
import { handBarView, handLayout, handSlots } from '../../src/ui/panels';

const fixed = (d1: number, d2: number) => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/**
 * M20.3-B 预演：临时往 `ITEM_CARDS` 追加「涨跌卡 / 红利卡」，验证手牌行与滑动条
 * **零版式返工**即可从 6 槽变 8 槽（`HAND_SIZE` 由种类数派生、内容宽由槽数派生）。
 */
const EXTRA = [
  { kind: 'bullBear', name: '涨跌卡', desc: '预演', target: 'self', priority: 70 },
  { kind: 'dividend', name: '红利卡', desc: '预演', target: 'self', priority: 80 },
] as unknown as ItemCardDef[];

afterEach(() => {
  /* 还原真源（避免污染同进程内其它用例） */
  if (ITEM_CARDS.length > 6) ITEM_CARDS.splice(6);
});

describe('panels：手牌三键排序（M20.3 spec §4.1）', () => {
  it('① 持 4 张：持有段（priority 升序）在前，未持有段（priority 升序）在后', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.hands[0] = ['bomb', 'pardon', 'teleport', 'demolish'];
    const slots = handSlots(g.state);
    expect(slots.map((s) => s.kind)).toEqual([
      'pardon', 'bomb', 'teleport', 'demolish',     // 持有段：10 / 30 / 50 / 60
      'doubleRent', 'barrier',                       // 未持有段：20 / 40
    ]);
    expect(slots.map((s) => s.held)).toEqual([true, true, true, true, false, false]);
  });

  it('② 全未持有：退化为纯 priority 序（held 全同 → 只看第 ② 键）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.hands[0] = [];
    const slots = handSlots(g.state);
    expect(slots.map((s) => s.kind)).toEqual(
      ['pardon', 'doubleRent', 'bomb', 'barrier', 'teleport', 'demolish'],
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
  });
});

describe('panels：手牌版式与滑动条（M20.3 spec §4.2）', () => {
  it('③ 6 槽（现有道具数）：一屏放得下 → maxScroll = 0、handBarView = null（滑动条不入画）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const layout = handLayout(g.state);
    expect(layout.slots).toHaveLength(6);
    expect(layout.contentW).toBe(6 * 55 + 5 * 6);      // 360
    expect(layout.maxScroll).toBe(0);
    expect(layout.visible).toEqual([0, 1, 2, 3, 4, 5]);
    expect(handBarView(g.state)).toBeNull();
  });

  it('④ 8 槽（M20.3-B 预演）：contentW 482 / maxScroll 92；滑到底后首槽移出可见集', () => {
    ITEM_CARDS.push(...EXTRA);
    const g = createGame({ dice: fixed(1, 1) });
    const layout = handLayout(g.state, 0);
    expect(layout.slots).toHaveLength(8);
    expect(layout.contentW).toBe(8 * 55 + 7 * 6);      // 482
    expect(layout.maxScroll).toBe(482 - 390);          // 92
    /* 滑到底：下标 0 的槽中心 −49.5，已完全移出左缘（可见判据 cx > −W/2 = −27.5） */
    const end = handLayout(g.state, 92);
    expect(end.scroll).toBe(92);
    expect(end.visible).not.toContain(0);
    expect(end.visible).toContain(7);
  });

  it('⑤ scroll 越界被 clamp 到 [0, maxScroll]（渲染与命中区共用同一口径）', () => {
    ITEM_CARDS.push(...EXTRA);
    const g = createGame({ dice: fixed(1, 1) });
    expect(handLayout(g.state, -50).scroll).toBe(0);
    expect(handLayout(g.state, 9999).scroll).toBe(92);
    /* 不需要滑动时，任何 scroll 都被压回 0（不影响 6 槽版式） */
    ITEM_CARDS.splice(6);
    expect(handLayout(g.state, 80).scroll).toBe(0);
  });

  it('滑动条比例 = 舞台宽 / 内容宽，偏移 = scroll / maxScroll；无滑动时为 null', () => {
    ITEM_CARDS.push(...EXTRA);
    const g = createGame({ dice: fixed(1, 1) });
    const bar = handBarView(g.state, 46);
    expect(bar).not.toBeNull();
    expect(bar!.ratio).toBeCloseTo(390 / 482, 6);
    expect(bar!.offset).toBeCloseTo(0.5, 6);
    expect(handBarView(g.state, 92)!.offset).toBe(1);
  });
});
