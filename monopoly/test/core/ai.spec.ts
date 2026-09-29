import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_ORDER, PERSONAS, PERSONA_DESC, PERSONA_LABEL, PERSONA_PARAMS,
  isPersona, parsePersonaList, personaParams,
} from '../../src/data/ai';

describe('ai 性格档案', () => {
  it('三种性格的标签与说明齐备', () => {
    expect(PERSONAS).toEqual(['conservative', 'aggressive', 'speculative']);
    for (const p of PERSONAS) {
      expect(PERSONA_LABEL[p]).toBeTruthy();
      expect(PERSONA_DESC[p]).toBeTruthy();
    }
  });
  it('参数表逐项对齐 spec §4.2', () => {
    expect(PERSONA_PARAMS.conservative.reserve).toBe(400);
    expect(PERSONA_PARAMS.aggressive.reserve).toBe(100);
    expect(PERSONA_PARAMS.speculative.reserve).toBe(200);
    expect(PERSONA_PARAMS.conservative.buyMax).toBe(300);
    expect(PERSONA_PARAMS.aggressive.buyMax).toBe(Infinity);
    expect(PERSONA_PARAMS.conservative.upgradeEager).toBe(false);
    expect(PERSONA_PARAMS.aggressive.upgradeEager).toBe(true);
    expect(PERSONA_PARAMS.speculative.cardPolicy).toBe('arbitrage');
    expect(PERSONA_PARAMS.conservative.stockPolicy).toBe('none');
    expect(PERSONA_PARAMS.aggressive.stockPolicy).toBe('momentum');
    expect(PERSONA_PARAMS.speculative.stockPolicy).toBe('dip');
    expect(PERSONA_PARAMS.conservative.targetLeader).toBe(false);
    expect(PERSONA_PARAMS.aggressive.targetLeader).toBe(true);
    expect(personaParams('speculative')).toBe(PERSONA_PARAMS.speculative);
  });
  it('isPersona / parsePersonaList 丢弃非法项', () => {
    expect(isPersona('aggressive')).toBe(true);
    expect(isPersona('hard')).toBe(false);
    expect(parsePersonaList('conservative,aggressive,speculative')).toEqual(DEFAULT_AI_ORDER);
    expect(parsePersonaList('speculative,bogus,conservative')).toEqual(['speculative', 'conservative']);
    expect(parsePersonaList(null)).toEqual([]);
    expect(parsePersonaList('')).toEqual([]);
  });
});