import { describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/core/game';
import { applyStep } from '../../src/core/ai';
import type { Seat } from '../../src/data/ai';
import { AI_STEP_MS, AI_FAST_FACTOR } from '../../src/skin/layout';
import { createAiDriver } from '../../src/ui/aiDriver';

const seats: Seat[] = [null, 'conservative', 'aggressive', 'speculative'];

function make(game = createGame({ seed: 7 }), seatList: readonly Seat[] = seats) {
  return {
    game,
    driver: createAiDriver({ game, seats: seatList, run: (s) => applyStep(game, s), isBusy: () => false }),
  };
}

describe('aiDriver 推进', () => {
  it('真人席位不驱动；AI 席位到点才推进', () => {
    const { game, driver } = make();
    game.state.current = 0;                     // 真人
    const before = JSON.stringify(game.state);
    driver.tick(AI_STEP_MS * 100);
    expect(JSON.stringify(game.state)).toBe(before);

    game.state.current = 1;                     // AI
    driver.tick(AI_STEP_MS - 1);                // 未到点
    expect(game.state.phase).toBe('idle');
    driver.tick(AI_STEP_MS);                    // 到点
    expect(game.state.phase).not.toBe('idle');  // 已掷骰
  });

  it('fx 忙时等待，不推进', () => {
    const game = createGame({ seed: 7 });
    game.state.current = 1;
    const driver = createAiDriver({ game, seats, run: (s) => applyStep(game, s), isBusy: () => true });
    driver.tick(AI_STEP_MS * 10);
    expect(game.state.phase).toBe('idle');
  });

  it('加速 ×2 把步间停顿减半', () => {
    const { game, driver } = make();
    game.state.current = 1;
    driver.setFast(true);
    expect(driver.isFast()).toBe(true);
    driver.tick(AI_STEP_MS / AI_FAST_FACTOR);   // 恰好到点
    expect(game.state.phase).not.toBe('idle');
  });

  it('over 后停止推进', () => {
    const { game, driver } = make();
    game.state.current = 1;
    game.state.over = true;
    driver.tick(AI_STEP_MS * 10);
    expect(game.state.phase).toBe('idle');
  });
});

describe('aiDriver 跳过本次', () => {
  it('把当前 AI 席位剩余步骤一次性补齐，且不越界驱动真人', () => {
    /* 2 人局（[真人, AI]）：补齐该 AI 回合后应停在真人席位，绝不替真人决策 */
    const seats2: Seat[] = [null, 'conservative'];
    const { game, driver } = make(createGame({ seed: 7, playerCount: 2 }), seats2);
    game.state.current = 1;
    driver.skipRest();
    expect(game.state.current).not.toBe(1);        // 该 AI 回合已走完
    expect(seats2[game.state.current]).toBeNull(); // 停在真人席位
    expect(game.state.phase).toBe('idle');
  });

  it('onFlush 只在跳过后回调一次', () => {
    const game = createGame({ seed: 7 });
    game.state.current = 1;
    const onFlush = vi.fn();
    const driver = createAiDriver({ game, seats, run: (s) => applyStep(game, s), isBusy: () => false, onFlush });
    driver.skipRest();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

describe('aiDriver 生命周期', () => {
  it('start/stop/destroy 幂等且不抛错', () => {
    /* node 环境无 rAF（实现按浏览器写，不在实现里加环境兜底）→ 测试侧补齐，只验幂等；回调不真的入队 */
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { driver } = make();
    expect(() => { driver.start(); driver.start(); driver.stop(); driver.stop(); driver.destroy(); driver.destroy(); }).not.toThrow();
    vi.unstubAllGlobals();
  });
  it('persona() 返回当前席位性格', () => {
    const { game, driver } = make();
    game.state.current = 2;
    expect(driver.persona()).toBe('aggressive');
    game.state.current = 0;
    expect(driver.persona()).toBeNull();
  });
});

describe('aiDriver 待拍态（M20.1 破产拍卖）', () => {
  /** 造一个待拍态：原主 2 破产、债权人 1、当前拍品 3 号（起拍 30），真人 1 待出价 */
  const openAuction = (game: ReturnType<typeof createGame>): void => {
    game.state.auction = {
      trigger: 'bankrupt', payerId: 2, creditorId: 1, amount: 100,
      queue: [3], lot: { index: 3, level: 1, startPrice: 30 },
      bids: [], pending: [1], results: [],
    };
  };

  it('待拍态：AI 席位也不推进（让位给真人出价）', () => {
    const { game, driver } = make();
    game.state.current = 1;                    // AI 席位
    openAuction(game);
    driver.tick(AI_STEP_MS * 10);
    expect(game.state.phase).toBe('idle');     // 未掷骰 / 未推进
  });

  it('skipRest：遇待拍态立即中断（绝不替真人落槌）', () => {
    const { game, driver } = make();
    game.state.current = 1;
    openAuction(game);
    driver.skipRest();
    expect(game.state.auction).not.toBeNull(); // 拍卖仍挂起
    expect(game.state.current).toBe(1);        // 未越界推进到下一位
  });
});