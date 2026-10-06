import { describe, it, expect } from 'vitest';
import { dividendOf, isControlling } from '../../src/core/facility';
import { FACILITY_SHARES, facilityOf } from '../../src/data/facilities';
import {
  FACILITY_CONTROL_BONUS, FACILITY_DIV_RATE_NEW, FACILITY_FLOW_MULT,
} from '../../src/data/economy';

describe('M20.6 设施分成强化（spec D53）', () => {
  it('常量：flow×2、控股权溢价 2%、基础率 6%', () => {
    expect(FACILITY_FLOW_MULT).toBe(2);
    expect(FACILITY_CONTROL_BONUS).toBe(0.02);
    expect(FACILITY_DIV_RATE_NEW).toBe(0.06);
  });

  it('isControlling：> 50% 总股本（20 股中 ≥ 11 股）', () => {
    const bank = facilityOf('bank');
    expect(FACILITY_SHARES).toBe(20);
    expect(isControlling(bank, 10)).toBe(false);
    expect(isControlling(bank, 11)).toBe(true);
    expect(isControlling(bank, 20)).toBe(true);
    expect(isControlling(bank, 0)).toBe(false);
  });

  it('flow 通过系数 = 2（与乘系数前对比）', () => {
    const bank = facilityOf('bank');
    /* 现金流 200、10 股：base=120、flow=200×10×2/20=200 ⇒ round((120+200)×1)=320 */
    expect(dividendOf(bank, 10, 200, 1)).toBe(320);
    /* 若不乘通过系数应为基础 120 + 分成 100 = 220 ⇒ 证明 flow 确实 ×2 */
    expect(dividendOf(bank, 10, 200, 1)).not.toBe(220);
  });

  it('控股权溢价：controlling=true 额外 round(price × shares × 0.02)，且不被 coef 放大', () => {
    const bank = facilityOf('bank');   // price 200
    const base = dividendOf(bank, 11, 0, 1, false);        // 11×200×0.06 = 132
    const ctrl = dividendOf(bank, 11, 0, 1, true);
    const bonus = Math.round(200 * 11 * FACILITY_CONTROL_BONUS);  // 44
    expect(base).toBe(132);
    expect(ctrl).toBe(base + bonus);
    /* 溢价在 coef 之外：利空 0.5 时溢价仍全额加入 */
    const bad = dividendOf(bank, 11, 0, 0.5, true);
    expect(bad).toBe(Math.round(132 * 0.5) + bonus);
  });

  it('controlling 缺省 false ⇒ 与显式 false 同值（兼容既有调用）', () => {
    const bank = facilityOf('bank');
    expect(dividendOf(bank, 15, 60, 1.5)).toBe(dividendOf(bank, 15, 60, 1.5, false));
  });

  it('0 股控股与否恒 0（零回归）', () => {
    const bank = facilityOf('bank');
    expect(dividendOf(bank, 0, 999, 1.5, true)).toBe(0);
  });
});