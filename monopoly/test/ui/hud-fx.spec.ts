import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/core/game';
import { hudSpecs, primaryLabel } from '../../src/ui/Hud';
import { parseOptions } from '../../src/main';
import type { Dice } from '../../src/core/dice';

const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

describe('HUD 动画播放中的按钮策略（fx busy → 跳过）', () => {
  it('fxBusy=true 时主按钮变「跳过」（不取消，只加速到终帧）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(primaryLabel(g.state)).toBe('掷骰');
    expect(primaryLabel(g.state, true)).toBe('跳过');
    g.rollDice();
    expect(primaryLabel(g.state)).toBe('前进');
    expect(primaryLabel(g.state, true)).toBe('跳过');
    g.moveCurrent();
    expect(primaryLabel(g.state, true)).toBe('跳过');
  });

  it('fxBusy=false 时恢复原阶段标签', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(primaryLabel(g.state, false)).toBe('掷骰');
    g.rollDice();
    expect(primaryLabel(g.state, false)).toBe('前进');
  });

  it('本局结束（无主按钮）时不受 fxBusy 影响', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[1].bankrupt = true;
    g.state.players[2].bankrupt = true;
    g.state.players[3].bankrupt = true;
    g.rollDice();
    g.moveCurrent();
    g.settleCurrent();
    g.endTurn();
    expect(primaryLabel(g.state, false)).toBe('本局结束');
    expect(primaryLabel(g.state, true)).toBe('本局结束');
  });

  it('hudSpecs 把 fxBusy 透传到主按钮 label', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const label = (busy: boolean): unknown =>
      hudSpecs(g.state, busy).find((s) => s.id === 'ui.button.primary')?.state?.label;
    expect(label(false)).toBe('掷骰');
    expect(label(true)).toBe('跳过');
  });
});

describe('时间轴 URL 接线（?speed / ?nofx）', () => {
  it('?speed=8 → opts.speed === 8', () => {
    expect(parseOptions('?play=1&speed=8').speed).toBe(8);
  });

  it('?nofx=1 → opts.nofx === true（缺省 false）', () => {
    expect(parseOptions('?play=1&nofx=1').nofx).toBe(true);
    expect(parseOptions('?play=1').nofx).toBe(false);
    expect(parseOptions('?nofx=0').nofx).toBe(false);
  });
});