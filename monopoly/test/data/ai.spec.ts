import { describe, it, expect } from 'vitest';
import { PERSONA_PARAMS, personaParams } from '../../src/data/ai';

describe('data.ai 拍卖出价倍率（M20.1，spec §3.1）', () => {
  it('三档性格的 bidMult：保守 0.6 / 激进 1.4 / 投机 1.0', () => {
    expect(PERSONA_PARAMS.conservative.bidMult).toBe(0.6);
    expect(PERSONA_PARAMS.aggressive.bidMult).toBe(1.4);
    expect(PERSONA_PARAMS.speculative.bidMult).toBe(1.0);
  });

  it('personaParams 原样返回带 bidMult 的参数表', () => {
    expect(personaParams('aggressive').bidMult).toBe(1.4);
  });
});
