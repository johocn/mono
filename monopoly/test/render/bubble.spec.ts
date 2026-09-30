import { describe, it, expect } from 'vitest';
import { bubbleOfStep, bubbleSpecs } from '../../src/render/BubbleView';
import { bubble } from '../../src/render/providers/proc-bubble';
import { PROC_PRESETS } from '../../src/render/providers/proc';
import { PAWN_BOX } from '../../src/skin/registry';
import { BUBBLE_GAP } from '../../src/skin/layout';
import { resolvePlacement, type PlacementOpts } from '../../src/render/Scene';
import { getEntry } from '../../src/skin/registry';
import { hudSpecs } from '../../src/ui/Hud';
import { panelSpecs } from '../../src/ui/panels';
import { createGame } from '../../src/core/game';

const GEO = { hw: 24, hh: 13, ox: 195, oy: 104 };
const PLACEMENT: PlacementOpts = { pawnGap: 9.6, pawnFrontDy: 1.45, pawnScale: 0.62 };

/** 记录每次图元调用名与实参（断言四态主色只落在该落的位置） */
function recorder() {
  const names: string[] = [];
  const args: string[] = [];
  const g = new Proxy({}, {
    get: (_t, k: string) => (...a: unknown[]) => {
      names.push(k);
      args.push(JSON.stringify(a));
      return g;
    },
  });
  return { g: g as never, names, args };
}

const ctx = (state: Record<string, unknown>, texts: Array<Record<string, unknown>> = []) => ({
  geo: GEO,
  box: getEntry('ui.bubble')!.box,
  cx: 100, cy: 200, s: 1,
  params: {}, state,
  text: (req: Record<string, unknown>) => texts.push(req),
}) as never;

describe('停留事件气泡 · 四态文案（spec §6.7）', () => {
  it('买地：标题 = 落格短名 + 买地花费', () => {
    expect(bubbleOfStep({ kind: 'buy' }, { ok: true, cost: 180 }, '长峰特产', null))
      .toEqual({ title: '长峰特产', amount: '买地 ￥180', tone: 'buy' });
  });

  it('买地失败 / 无关动作：不出气泡', () => {
    expect(bubbleOfStep({ kind: 'buy' }, { ok: false, reason: 'not-enough-cash' }, '长峰特产', null)).toBeNull();
    expect(bubbleOfStep({ kind: 'roll' }, { d1: 3, d2: 4 }, '长峰特产', null)).toBeNull();
    expect(bubbleOfStep({ kind: 'settle' }, { kind: 'vacant', index: 3, price: 180 }, '长峰特产', null)).toBeNull();
  });

  it('收租：出负数金额', () => {
    expect(bubbleOfStep({ kind: 'settle' }, { kind: 'rent', index: 6, owner: 3, rent: 105 }, '御龙温泉', null))
      .toEqual({ title: '御龙温泉', amount: '租金 -￥105', tone: 'rent' });
  });

  it('抽卡：标题 = 牌堆格短名，金额 = 抽到的卡名', () => {
    expect(bubbleOfStep({ kind: 'settle' }, { kind: 'fate', index: 2, cardId: 'f-tax' }, '命运卡', '鹿茸涨价'))
      .toEqual({ title: '命运卡', amount: '抽到「鹿茸涨价」', tone: 'card' });
    expect(bubbleOfStep({ kind: 'settle' }, { kind: 'chance', index: 5, cardId: 'c-refund' }, '机会卡', '消费返现'))
      .toEqual({ title: '机会卡', amount: '抽到「消费返现」', tone: 'card' });
  });

  it('进监狱：未持免罚 → 停留回合数；持免罚纸面抵过', () => {
    expect(bubbleOfStep({ kind: 'settle' }, { kind: 'jail', index: 12, turns: 1, waived: false }, '监狱', null))
      .toEqual({ title: '监狱', amount: '停留 1 回合', tone: 'jail' });
    expect(bubbleOfStep({ kind: 'settle' }, { kind: 'jail', index: 12, turns: 0, waived: true }, '监狱', null))
      .toEqual({ title: '监狱', amount: '免罚抵过', tone: 'jail' });
  });
});

describe('停留事件气泡 · 台位与分遍', () => {
  const pawns = [{ index: 1, c: 5, r: 9, active: true }, { index: 3, c: 5, r: 9 }];

  it('锚在当前行动棋子头顶上方 BUBBLE_GAP，水平随棋子同格错开', () => {
    const out = bubbleSpecs(pawns, { title: '长峰特产', amount: '买地 ￥180', tone: 'buy' }, GEO, PLACEMENT);
    expect(out.length).toBe(1);
    const spec = out[0];
    expect(spec.id).toBe('ui.bubble');
    expect(spec.pass).toBe(4);                       // 覆盖层：压在棋子与楼体之上
    /* 当前行动棋子是该格第一位（pawnIndex = 0）：与棋子同款横向错开 */
    const at = resolvePlacement(
      { id: 'piece.p2', c: 5, r: 9, slot: null, lift: 0, box: PAWN_BOX, mount: 'ground', pawnIndex: 0 },
      GEO, PLACEMENT,
    );
    expect(spec.fixed!.cx).toBeCloseTo(at.cx, 6);
    expect(spec.fixed!.cy).toBeCloseTo(at.cy - PAWN_BOX.h * at.s - BUBBLE_GAP, 6);
    expect(spec.fixed!.cy).toBeLessThan(at.cy - PAWN_BOX.h * at.s);   // 恒在头顶之上
    expect(spec.state).toEqual({ title: '长峰特产', amount: '买地 ￥180', tone: 'buy' });
  });

  it('无内容 / 无当前行动棋子：不出气泡', () => {
    expect(bubbleSpecs(pawns, null, GEO, PLACEMENT)).toEqual([]);
    expect(bubbleSpecs([{ index: 0, c: 5, r: 9 }], { title: '监狱', amount: '停留 1 回合', tone: 'jail' }, GEO, PLACEMENT)).toEqual([]);
  });

  /* 回归：棋盘下缘几格的棋子头顶正落在底坞 / 浮层覆盖区，行号若不压过它们，气泡会被整块盖住 */
  it('在 pass 4 内的行号大于 HUD 与浮层的最大行号', () => {
    const g = createGame({ seed: 20260928 });
    const others = [...hudSpecs(g.state), ...panelSpecs(g.state)].filter((s) => s.pass === 4);
    const top = Math.max(...others.map((s) => s.r));
    const spec = bubbleSpecs(pawns, { title: '监狱', amount: '停留 1 回合', tone: 'jail' }, GEO, PLACEMENT)[0];
    expect(spec.r).toBeGreaterThan(top);
  });
});

describe('停留事件气泡 · preset', () => {
  it('已注册进 PROC_PRESETS，且画出底 + 三角 + 两行文字', () => {
    const { g, names } = recorder();
    bubble(g, ctx({ title: '御龙温泉', amount: '租金 -￥105', tone: 'rent' }));
    expect(PROC_PRESETS.bubble).toBe(bubble);
    expect(names).toContain('roundRect');
    expect(names).toContain('poly');
    expect(names.filter((c) => c === 'moveTo' || c === 'lineTo').length).toBeGreaterThanOrEqual(3);
  });

  it('四态主色互不相同，且只染金额与三角（标题恒为墨色）', () => {
    const render = (tone: string) => {
      const { g, args } = recorder();
      const texts: Array<Record<string, unknown>> = [];
      bubble(g, ctx({ title: '监狱', amount: '停留 1 回合', tone }, texts));
      return { joined: args.join('|'), texts };
    };
    const four = (['buy', 'rent', 'card', 'jail'] as const).map(render);
    expect(new Set(four.map((f) => f.joined)).size).toBe(4);
    expect(four[0].joined).toContain('#2f8f5e');    // 买地绿
    expect(four[1].joined).toContain('#a8761c');    // 收租金
    expect(four[2].joined).toContain('#7b46d6');    // 抽卡紫
    expect(four[3].joined).toContain('#c0392b');    // 进监狱红
    expect(four[0].joined).toContain('#fff7e6');    // 暖白底（与深底名牌反相）
    /* 两行文字：标题恒墨色 + 金额取四态主色 */
    for (const f of four) {
      expect(f.texts.length).toBe(2);
      expect(f.texts[0].fill).toBe('#241a12');
      expect(f.texts[0].text).toBe('监狱');
      expect(f.texts[1].text).toBe('停留 1 回合');
    }
    expect(four[3].texts[1].fill).toBe('#c0392b');
    expect(four[0].texts[1].fill).toBe('#2f8f5e');
  });
});
