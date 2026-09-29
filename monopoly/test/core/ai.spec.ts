import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_ORDER, PERSONAS, PERSONA_DESC, PERSONA_LABEL, PERSONA_PARAMS,
  isPersona, parsePersonaList, personaParams,
} from '../../src/data/ai';
import { createGame, currentPlayer } from '../../src/core/game';
import { applyStep, decideTurn, type AiStep } from '../../src/core/ai';

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

describe('decideTurn 性格差异', () => {
  it('保守：现金低于 reserve(400) 时不买地；高于时可买', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    me.pos = 1; me.cash = 300;              // 空地 + 现金 300 < 400
    g.state.phase = 'settled';
    expect(decideTurn(g.state, 'conservative').some((s) => s.kind === 'buy')).toBe(false);
    me.cash = 2000;
    expect(decideTurn(g.state, 'conservative').some((s) => s.kind === 'buy')).toBe(true);
  });

  it('激进：手牌目标选净资产最高者（领先者）', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    g.state.phase = 'idle';
    const foe = g.state.players.filter((p) => p.id !== me.id);
    foe.forEach((p, i) => { p.pos = 2 + i * 4; });
    foe[1].cash = 99999;                    // 玩家 3 = 净资产最高
    /* 炸弹目标必须是真实地块（bombDown 对空地判 not-estate），故给领先者铺一块自有地 */
    g.state.estates[foe[1].pos] = { index: foe[1].pos, owner: foe[1].id, level: 3, processing: false };
    const step = decideTurn(g.state, 'aggressive').find((s) => s.kind === 'card') as
      Extract<AiStep, { kind: 'card' }> | undefined;
    expect(step).toBeTruthy();
    expect(step!.target).toBe(foe[1].pos);
  });

  it('投机：round < 8 不打领先者；round >= 8 才打', () => {
    const g = createGame({ seed: 3 });
    g.state.phase = 'idle';
    g.state.round = 1;
    expect(decideTurn(g.state, 'speculative').some((s) => s.kind === 'card')).toBe(false);
    g.state.round = 9;
    expect(decideTurn(g.state, 'speculative').length).toBeGreaterThan(0);
  });

  it('投机：phase=rolled 且未在交易所时，迁点到股票交易所 19', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    me.pos = 5; g.state.phase = 'rolled'; me.cash = 3000;
    expect(decideTurn(g.state, 'speculative')[0]).toEqual({ kind: 'card', card: 'teleport', target: 19 });
    me.pos = 19;
    expect(decideTurn(g.state, 'speculative')[0]).toEqual({ kind: 'move' });
  });
});

describe('decideTurn 合法性与确定性', () => {
  it('随机 60 个 state：产出的每一步都能被对应 Game API 成功执行', () => {
    for (let k = 1; k <= 60; k++) {
      const g = createGame({ seed: k });
      for (let i = 0; i < 40; i++) {
        const persona = (['conservative', 'aggressive', 'speculative'] as const)[i % 3];
        const plan = decideTurn(g.state, persona);
        for (const step of plan) {
          const r = applyStep(g, step) as { ok?: boolean; reason?: string } | undefined;
          if (r && r.ok === false) {
            throw new Error(`seed ${k} step ${JSON.stringify(step)} → ${String(r.reason)}`);
          }
          if (g.state.over) break;
        }
        if (g.state.over) break;
      }
    }
  });

  it('同 state + 同 persona 调两次，结果深度相等', () => {
    const g = createGame({ seed: 11 });
    g.state.phase = 'settled';
    const a = decideTurn(g.state, 'aggressive');
    const b = decideTurn(g.state, 'aggressive');
    expect(a).toEqual(b);
  });

  it('结束态不再产出任何步骤', () => {
    const g = createGame({ seed: 5 });
    g.state.over = true;
    expect(decideTurn(g.state, 'aggressive')).toEqual([]);
  });
});