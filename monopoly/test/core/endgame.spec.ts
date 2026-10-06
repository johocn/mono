import { describe, it, expect } from 'vitest';
import {
  ENDGAME_NEUTRAL, ENDGAME_STAGES, ENDGAME_START_ROUND,
} from '../../src/data/economy';
import { PERSONA_PARAMS } from '../../src/data/ai';
import { amplify, endgameAiParams, endgameStageOf, inEndgame } from '../../src/core/endgame';

describe('M20.6 终局阶段（spec §5.1 D54）', () => {
  it('常量：起始 40、三段 Ⅰ 40–46 / Ⅱ 47–53 / Ⅲ 54–60、系数递增', () => {
    expect(ENDGAME_START_ROUND).toBe(40);
    expect(ENDGAME_STAGES.map((s) => [s.from, s.to])).toEqual([[40, 46], [47, 53], [54, 60]]);
    /* 三系数逐段单调不减，且末段严格更大 */
    for (let i = 1; i < ENDGAME_STAGES.length; i++) {
      const a = ENDGAME_STAGES[i - 1];
      const b = ENDGAME_STAGES[i];
      expect(b.rentMult).toBeGreaterThan(a.rentMult);
      expect(b.volMult).toBeGreaterThan(a.volMult);
      expect(b.newsMult).toBeGreaterThan(a.newsMult);
    }
    expect(ENDGAME_NEUTRAL).toMatchObject({ rentMult: 1, volMult: 1, newsMult: 1 });
  });

  it('inEndgame：< 40 false；≥ 40 true（含边界 39 / 40）', () => {
    expect(inEndgame(0)).toBe(false);
    expect(inEndgame(39)).toBe(false);
    expect(inEndgame(40)).toBe(true);
    expect(inEndgame(60)).toBe(true);
  });

  it('endgameStageOf：段外中性档（逐值不变）', () => {
    for (const r of [0, 1, 20, 39]) {
      expect(endgameStageOf(r)).toBe(ENDGAME_NEUTRAL);
      expect(endgameStageOf(r)).toMatchObject({ rentMult: 1, volMult: 1, newsMult: 1 });
    }
  });

  it('endgameStageOf：边界轮命中所属段（40 / 46 / 47 / 53 / 54 / 60）', () => {
    expect(endgameStageOf(40).label).toBe('加速 Ⅰ');
    expect(endgameStageOf(46).label).toBe('加速 Ⅰ');
    expect(endgameStageOf(47).label).toBe('加速 Ⅱ');
    expect(endgameStageOf(53).label).toBe('加速 Ⅱ');
    expect(endgameStageOf(54).label).toBe('终局');
    expect(endgameStageOf(60).label).toBe('终局');
  });

  it('endgameStageOf：超出末段（> 60）沿用末段，不返回中性', () => {
    expect(endgameStageOf(61).label).toBe('终局');
    expect(endgameStageOf(999).label).toBe('终局');
  });

  it('amplify 恒等性：mult = 1 → 原样返回', () => {
    for (const c of [0.5, 0.8, 1, 1.25, 1.5, 2]) {
      expect(amplify(c, 1)).toBeCloseTo(c, 10);
    }
  });

  it('amplify：只放大偏离 1 的部分（D54 例：1.5 在 mult 2 下 → 2.0）', () => {
    expect(amplify(1.5, 2)).toBeCloseTo(2, 10);
    expect(amplify(1.25, 2)).toBeCloseTo(1.5, 10);
    expect(amplify(0.5, 2)).toBeCloseTo(0, 10);      // 利空 0.5 → 1 + (−0.5)×2 = 0
    expect(amplify(0.8, 1.3)).toBeCloseTo(0.74, 10); // 板块利空 ×0.8 在 newsMult 1.3 下
  });

  it('amplify：coef = 1 时无论 mult 多大都恒为 1（中性零回归）', () => {
    for (const m of [1, 1.3, 1.6, 2, 5]) expect(amplify(1, m)).toBe(1);
  });

  /* M20.6（spec §5.4 D56）：终局 AI 参数激进化 —— 出价上调、保留线下调 */
  it('endgameAiParams：段外原样返回（同引用、逐值零回归）', () => {
    for (const r of [0, 1, 39]) expect(endgameAiParams(PERSONA_PARAMS.conservative, r)).toBe(PERSONA_PARAMS.conservative);
  });

  it('endgameAiParams：进入终局按段上调 bidMult、下调 reserve（其余字段不变）', () => {
    const base = PERSONA_PARAMS.conservative;              // reserve 400 / bidMult 0.6
    const s1 = endgameAiParams(base, 40);                  // 加速 Ⅰ：rentMult 1.4
    expect(s1.bidMult).toBeCloseTo(0.6 * 1.4, 10);
    expect(s1.reserve).toBe(Math.round(400 / 1.4));
    const s3 = endgameAiParams(base, 54);                  // 终局：rentMult 2.4
    expect(s3.bidMult).toBeCloseTo(0.6 * 2.4, 10);
    expect(s3.reserve).toBe(Math.round(400 / 2.4));
    expect(s3.reserve).toBeLessThan(s1.reserve);           // 越晚越激进
    expect(s1).toMatchObject({ buyMax: base.buyMax, depositLine: base.depositLine, loanLine: base.loanLine });
  });
});