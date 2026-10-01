import { describe, it, expect } from 'vitest';
import {
  assetValue, buy, buyable, canBuy, clearProcessing, ownedBy, rentAt, sellAt, upgrade,
  type Estates,
} from '../../src/core/estate';

const fresh = (): Estates => ({});

describe('estate 买地（spec §5.2 / §5.4）', () => {
  it('shop 地块可买：扣 ￥60、成 1 级楼、非施工中', () => {
    const es = fresh();
    const r = buy(es, 1, 2, 3000);
    expect(r).toEqual({ ok: true, cost: 60, cash: 2940 });
    expect(es[1]).toEqual({ index: 1, owner: 2, level: 1, processing: false });
  });

  it('起点 / 命运 / 机会 / 福利 / 监狱 / 股票一律不可买（spec §4 规则约定）', () => {
    for (const i of [0, 2, 5, 7, 12, 19, 27]) expect(buyable(i)).toBe(false);
    expect(buy(fresh(), 0, 1, 3000)).toEqual({ ok: false, reason: 'not-buyable' });
    expect(buy(fresh(), 12, 1, 3000)).toEqual({ ok: false, reason: 'not-buyable' });
    expect(buy(fresh(), 19, 1, 3000)).toEqual({ ok: false, reason: 'not-buyable' });
  });

  it('已有主 → owned，且不改现金、不改归属', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(buy(es, 1, 3, 3000)).toEqual({ ok: false, reason: 'owned' });
    expect(es[1].owner).toBe(2);
  });

  it('现金不足 → not-enough-cash，且不写状态', () => {
    const es = fresh();
    expect(buy(es, 1, 2, 59)).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(es[1]).toBeUndefined();
    expect(canBuy(es, 1, 59)).toBe(false);
    expect(canBuy(es, 1, 60)).toBe(true);
  });
});

describe('estate 升级（L1→L2→L3 逐级、互斥、施工中；spec §5.2）', () => {
  it('L1→L2 花 ￥180 并置施工中；施工中期间租金为 0', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(upgrade(es, 1, 2, 2940)).toEqual({ ok: true, cost: 180, cash: 2760, level: 2 });
    expect(es[1].processing).toBe(true);
    expect(rentAt(es, 1)).toBe(0);
  });

  it('升级互斥：同一回合不能连续升级 / 不可跳级', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    upgrade(es, 1, 2, 2940);
    expect(upgrade(es, 1, 2, 2760)).toEqual({ ok: false, reason: 'processing' });
    expect(es[1].level).toBe(2);
  });

  it('下回合解施工后：2 级租金 ￥45，可再升 3 级（￥420）', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    upgrade(es, 1, 2, 2940);
    expect(clearProcessing(es, 2)).toBe(1);
    expect(es[1].processing).toBe(false);
    expect(rentAt(es, 1)).toBe(45);
    expect(upgrade(es, 1, 2, 2760)).toEqual({ ok: true, cost: 420, cash: 2340, level: 3 });
    clearProcessing(es, 2);
    expect(rentAt(es, 1)).toBe(105);
  });

  it('无主 → no-owner；他人地块 → not-owner；5 级封顶 → max-level', () => {
    const es = fresh();
    expect(upgrade(es, 1, 2, 3000)).toEqual({ ok: false, reason: 'no-owner' });
    buy(es, 1, 2, 3000);
    expect(upgrade(es, 1, 3, 3000)).toEqual({ ok: false, reason: 'not-owner' });
    es[1].level = 5;
    expect(upgrade(es, 1, 2, 3000)).toEqual({ ok: false, reason: 'max-level' });
  });

  it('升级现金不足 → not-enough-cash，层级与施工标记都不变', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(upgrade(es, 1, 2, 179)).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(es[1].level).toBe(1);
    expect(es[1].processing).toBe(false);
  });
});

describe('estate 收租 / 变卖 / 持有查询', () => {
  it('无主地块租金为 0', () => {
    expect(rentAt(fresh(), 3)).toBe(0);
  });

  it('变卖价 = 累计投入一半：60→30、240→120、660→330；无主为 0', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(sellAt(es, 1)).toBe(30);
    es[1].level = 2;
    expect(sellAt(es, 1)).toBe(120);
    es[1].level = 3;
    expect(sellAt(es, 1)).toBe(330);
    expect(sellAt(es, 3)).toBe(0);
  });

  it('assetValue = 账面投入全额（净资产排名用，与变卖价区分）', () => {
    const es = fresh();
    buy(es, 1, 2, 3000);
    expect(assetValue(es, 2)).toBe(60);
    es[1].level = 2;
    expect(assetValue(es, 2)).toBe(240);
    buy(es, 3, 2, 3000);
    expect(assetValue(es, 2)).toBe(300);
    expect(assetValue(es, 3)).toBe(0);
  });

  it('ownedBy 升序且只含本人；clearProcessing 只解除本人地块', () => {
    const es = fresh();
    buy(es, 10, 2, 3000);
    buy(es, 3, 2, 3000);
    buy(es, 4, 3, 3000);
    es[4].processing = true;
    expect(ownedBy(es, 2)).toEqual([3, 10]);
    expect(clearProcessing(es, 2)).toBe(0);
    expect(es[4].processing).toBe(true);
    expect(clearProcessing(es, 3)).toBe(1);
    expect(es[4].processing).toBe(false);
  });
});