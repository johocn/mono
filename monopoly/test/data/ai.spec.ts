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

describe('data.ai 银行保留线（M20.2，spec §3.9）', () => {
  it('三档 depositLine：保守 800 / 激进 500 / 投机 700', () => {
    expect(PERSONA_PARAMS.conservative.depositLine).toBe(800);
    expect(PERSONA_PARAMS.aggressive.depositLine).toBe(500);
    expect(PERSONA_PARAMS.speculative.depositLine).toBe(700);
  });

  it('三档 loanLine：保守 400 / 激进 200 / 投机 300', () => {
    expect(PERSONA_PARAMS.conservative.loanLine).toBe(400);
    expect(PERSONA_PARAMS.aggressive.loanLine).toBe(200);
    expect(PERSONA_PARAMS.speculative.loanLine).toBe(300);
  });

  it('personaParams 返回带保留线的新参数表', () => {
    expect(personaParams('speculative').depositLine).toBe(700);
    expect(personaParams('speculative').loanLine).toBe(300);
  });
});
