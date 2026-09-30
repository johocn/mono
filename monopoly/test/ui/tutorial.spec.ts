import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS } from '../../src/data/tutorial';
import { shouldShowTutorial, type Rect } from '../../src/ui/tutorial';
import {
  STAGE_W, HUD_BTN_BUY_X, HUD_DICE_X0, HUD_BAR_X0, HUD_BAR_W, PANEL_SLOT_X0,
} from '../../src/skin/layout';

describe('tutorial 步骤表', () => {
  it('四步齐备，标题 ≤ 6 字、说明 ≤ 20 字', () => {
    expect(TUTORIAL_STEPS.length).toBe(4);
    for (const s of TUTORIAL_STEPS) {
      expect(s.title.length).toBeLessThanOrEqual(6);
      expect(s.text.length).toBeLessThanOrEqual(20);
      expect(s.testId).toBeTruthy();
    }
  });
});

describe('shouldShowTutorial', () => {
  it('?tour=1 强制、?tour=0 关闭、标记已写则不弹、纯 AI 局不弹', () => {
    expect(shouldShowTutorial({ tour: true }, false, [null, 'conservative', 'aggressive', 'speculative'])).toBe(true);
    expect(shouldShowTutorial({ tour: true }, true, [null, 'conservative', 'aggressive', 'speculative'])).toBe(true);
    expect(shouldShowTutorial({ tour: false }, false, [null, 'conservative', 'aggressive', 'speculative'])).toBe(false);
    expect(shouldShowTutorial({}, true, [null, 'conservative', 'aggressive', 'speculative'])).toBe(false);
    expect(shouldShowTutorial({}, false, [null, 'conservative', 'aggressive', 'speculative'])).toBe(true);
    expect(shouldShowTutorial({}, false, ['conservative', 'aggressive', 'speculative', 'conservative'])).toBe(false);
  });
});

describe('mountTutorial 矩形来源', () => {
  const rectsOf = (i: number): Rect[] => TUTORIAL_STEPS[i].rects;

  it('高亮矩形全部落在 390×844 画布内（× 阶段常量，非另造坐标）', () => {
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
      expect(rectsOf(i).length).toBeGreaterThan(0);
      for (const r of rectsOf(i)) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(STAGE_W);
      }
    }
  });
  it('第 1 步含主按钮与骰子、第 2 步含买地键、第 3 步含资产条与手牌槽、第 4 步含第 1 条资产条', () => {
    expect(rectsOf(0).some((r) => r.w === 98)).toBe(true);           // HUD_BTN_PRIMARY_W
    expect(rectsOf(0).some((r) => r.x === HUD_DICE_X0)).toBe(true);
    expect(rectsOf(1).some((r) => r.x === HUD_BTN_BUY_X)).toBe(true);
    expect(rectsOf(2).some((r) => r.x === HUD_BAR_X0)).toBe(true);
    expect(rectsOf(2).some((r) => r.x === PANEL_SLOT_X0)).toBe(true);
    expect(rectsOf(3).some((r) => r.w === HUD_BAR_W)).toBe(true);    // HUD_BAR_W（1 条 4 段后 94.5）
  });
  it('步进到底自动收尾并写标记；跳过立即收尾', () => {
    /* DOM 交互（[data-tour-step] 生命周期 / localStorage 标记）由 Playwright 闸门
       `local/mono-shots-ai.mjs`（`?humans=1&tour=1`）覆盖：本仓库 vitest 跑在 node 环境、
       未装 jsdom/happy-dom，故此处只断言纯函数与步骤表。 */
    expect(TUTORIAL_STEPS.length).toBe(4);
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].testId).toBe('ai');
  });
});