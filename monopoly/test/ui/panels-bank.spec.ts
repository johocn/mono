import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/core/game';
import {
  AMOUNT_KEYS, AMOUNT_MAX_DIGITS, AMOUNT_TIERS, applyAmountKey, applyAmountTier, bankAmountView,
  panelHitAreas, parseAmount, type BankUiState,
} from '../../src/ui/panels';

/** 固定点数骰：每步走 2 格 */
const fixed = (d1: number, d2: number) => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

describe('M20.5 存款页金额键盘：输入纯函数（spec §6.1 D39）', () => {
  it('键面 3 列 × 4 行 = 12 键，含清空 / 0 / 退格；快捷档 3 个', () => {
    expect(AMOUNT_KEYS).toHaveLength(12);
    expect(AMOUNT_KEYS.filter((k) => /^[0-9]$/.test(k))).toHaveLength(10);
    expect(AMOUNT_KEYS).toContain('清空');
    expect(AMOUNT_KEYS).toContain('⌫');
    expect(AMOUNT_KEYS.filter((k) => k === '0')).toHaveLength(1);
    expect(AMOUNT_TIERS).toEqual([100, 500, 1000]);
  });

  it('applyAmountKey：数字追加（前导 0 不累积）/ 清空 / 退格 / 位数截断', () => {
    expect(applyAmountKey('', '5')).toBe('5');
    expect(applyAmountKey('5', '0')).toBe('50');
    /* 前导 0 不累积：'' → '0' → 再按 5 ⇒ '5'（而非 '05'） */
    expect(applyAmountKey(applyAmountKey('', '0'), '5')).toBe('5');
    expect(applyAmountKey('500', '清空')).toBe('');
    expect(applyAmountKey('500', '⌫')).toBe('50');
    expect(applyAmountKey('', '⌫')).toBe('');
    /* 位数上限：第 7 位被丢弃 */
    const six = '1'.repeat(AMOUNT_MAX_DIGITS);
    expect(applyAmountKey(six, '9')).toBe(six);
    /* 非数字键（防御）不改串 */
    expect(applyAmountKey('12', 'x')).toBe('12');
  });

  it('parseAmount：空串 / 0 / 非数字 → 0；正数串 → 数值', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('abc')).toBe(0);
    expect(parseAmount('007')).toBe(7);
    expect(parseAmount('1240')).toBe(1240);
  });

  it('applyAmountTier：在现值上累加并截到输入上限', () => {
    expect(applyAmountTier('', 100)).toBe('100');
    expect(applyAmountTier('100', 500)).toBe('600');
    expect(applyAmountTier('600', 1000)).toBe('1600');
    const ceil = 10 ** AMOUNT_MAX_DIGITS - 1;
    expect(applyAmountTier(String(ceil), 1000)).toBe(String(ceil));
  });

  it('bankAmountView：示数条文案随输入串变化，金额 0 → 两确认键皆禁用', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].cash = 800;
    g.state.players[0].deposit = 200;
    expect(bankAmountView(g.state, '').text).toBe('￥0');
    expect(bankAmountView(g.state, '').depositEnabled).toBe(false);
    expect(bankAmountView(g.state, '').withdrawEnabled).toBe(false);
    const v = bankAmountView(g.state, '300');
    expect(v.text).toBe('￥300');
    expect(v.hint).toBe('现金 800 · 存款 200');
    expect(v.depositEnabled).toBe(true);
    expect(v.withdrawEnabled).toBe(true);
  });
});

describe('M20.5 浮层命中区闸门：银行四个产品页整段收在 606 之上', () => {
  /** 站 9 号格（鹿乡银行）+ 一屁股信贷，令四页均有可点元素 */
  const richState = () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 9;
    g.state.players[0].cash = 3000;
    g.state.players[0].deposit = 500;
    g.state.players[0].loan = { principal: 400, rate: 0.06, due: 5, overdue: 0 };
    g.state.players[0].mortgages = [{ principal: 200, rate: 0.04, due: 4, overdue: 0, index: 3 }];
    g.state.players[0].margin = { principal: 300, rate: 0.08 };
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    g.state.estates[7] = { index: 7, owner: 1, level: 1, processing: false };
    return g;
  };

  it.each<BankUiState['sel']>(['deposit', 'loan', 'mortgage', 'margin'])(
    '%s 页：出关闭键外，所有命中区 y + h ≤ 606（不压 HUD 快键行 607..629）',
    (sel) => {
      const g = richState();
      const hits = panelHitAreas(g.state, false, null, { open: true, sel });
      expect(hits.length).toBeGreaterThan(0);
      for (const h of hits.filter((x) => x.action !== 'bank:close')) {
        expect(h.y + h.h).toBeLessThanOrEqual(606);
      }
      /* 命中区一律落在舞台宽度内 */
      for (const h of hits) {
        expect(h.x).toBeGreaterThanOrEqual(0);
        expect(h.x + h.w).toBeLessThanOrEqual(390);
      }
    },
  );

  it('存款页：12 数字键 + 3 快捷档 + 2 确认键 + 4 产品行 + 关闭 = 22 个命中区', () => {
    const g = richState();
    const hits = panelHitAreas(g.state, false, null, { open: true, sel: 'deposit', amount: '300' });
    expect(hits.filter((h) => h.action === 'bank:key')).toHaveLength(12);
    expect(hits.filter((h) => h.action === 'bank:tier')).toHaveLength(3);
    expect(hits.filter((h) => h.action === 'bank:deposit')).toHaveLength(1);
    expect(hits.filter((h) => h.action === 'bank:withdraw')).toHaveLength(1);
    expect(hits.filter((h) => h.action === 'bank:select')).toHaveLength(4);
    expect(hits.filter((h) => h.action === 'bank:close')).toHaveLength(1);
    expect(hits).toHaveLength(22);
    /* key 键面文案即命中区 target（UI 与命中层同源一份键面） */
    expect(hits.filter((h) => h.action === 'bank:key').map((h) => h.target)).toEqual([...AMOUNT_KEYS]);
    expect(hits.filter((h) => h.action === 'bank:tier').map((h) => h.target)).toEqual([...AMOUNT_TIERS]);
  });
});
