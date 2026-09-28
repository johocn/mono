import { describe, it, expect } from 'vitest';
import { SHOP_DEFAULTS, parseShopConfig } from '../../src/skin/shop-config';
import { TILE_BRAND, TILE_LEVEL, TILE_SHORT } from '../../src/data/board';

describe('shop-config · 宽松解析与回退（design §6.3/§6.4）', () => {
  it('缺配置 / 非对象 / 无 shops 数组 → 零变化（文案回退内建 board.ts）', () => {
    for (const raw of [null, undefined, 'oops', 42, {}, { shops: null }]) {
      const cfg = parseShopConfig(raw);
      expect(cfg.overrides).toEqual({});
      expect(cfg.images).toEqual([]);
      expect(cfg.shortAt(4)).toBe(TILE_SHORT[4]);
      expect(cfg.brandAt(4)).toBe(TILE_BRAND[4]);
    }
  });

  it('空清单 = SHOP_DEFAULTS 语义（不改变任何画面）', () => {
    const cfg = parseShopConfig({ shops: [] });
    expect(cfg.overrides).toEqual(SHOP_DEFAULTS.overrides);
    expect(cfg.shortAt(0)).toBe(SHOP_DEFAULTS.shortAt(0));
    expect(cfg.brandAt(31)).toBe(SHOP_DEFAULTS.brandAt(31));
  });

  it('有效条目：short / brand 覆盖生效，未列出的地块逐格回退', () => {
    const cfg = parseShopConfig({ shops: [{ slot: 4, merchantName: '示范商家', short: '示范牌', brand: '示范商号' }] });
    expect(cfg.shortAt(4)).toBe('示范牌');
    expect(cfg.brandAt(4)).toBe('示范商号');
    expect(cfg.shortAt(6)).toBe(TILE_SHORT[6]);
    expect(cfg.brandAt(6)).toBe(TILE_BRAND[6]);
    expect(cfg.overrides).toEqual({});
  });

  it('sign.src → `building.<slot>.sign` 的 image 覆盖（回退链第 1 级）', () => {
    const cfg = parseShopConfig({ shops: [{ slot: 4, sign: { src: 'shop/s4-sign.png' } }] });
    expect(cfg.overrides['building.s4.sign']).toEqual({ kind: 'image', src: 'shop/s4-sign.png' });
    expect(cfg.images).toEqual(['shop/s4-sign.png']);
  });

  it('building.src → 按演示初始层级映射 `building.<slot>.l<lv>`；lv=0 不映射', () => {
    const lv4 = TILE_LEVEL[4] as 1 | 2 | 3;
    const cfg = parseShopConfig({
      shops: [
        { slot: 4, building: { src: 'shop/s4-building.png' } },
        { slot: 2, building: { src: 'shop/s2-building.png' } }, // slot 2 是命运卡（lv=0，无楼）
      ],
    });
    expect(TILE_LEVEL[2]).toBe(0);
    expect(cfg.overrides[`building.s4.l${lv4}`]).toEqual({ kind: 'image', src: 'shop/s4-building.png' });
    expect(Object.keys(cfg.overrides).some((k) => k.startsWith('building.s2.'))).toBe(false);
  });

  it('images 去重（同图多格只预装一次）', () => {
    const cfg = parseShopConfig({
      shops: [
        { slot: 4, sign: { src: 'shop/shared.png' } },
        { slot: 6, sign: { src: 'shop/shared.png' } },
      ],
    });
    expect(cfg.images).toEqual(['shop/shared.png']);
    expect(cfg.overrides['building.s4.sign']).toEqual({ kind: 'image', src: 'shop/shared.png' });
    expect(cfg.overrides['building.s6.sign']).toEqual({ kind: 'image', src: 'shop/shared.png' });
  });

  it('坏数据静默忽略（非对象 / 缺 slot / slot 非整数 / 越界 / src 空串 / sign: null）', () => {
    const cfg = parseShopConfig({
      shops: [
        'oops', 42, null,
        { merchantName: '无 slot' },
        { slot: '4' },
        { slot: 1.5 },
        { slot: -1 },
        { slot: 32 },
        { slot: 4, short: '', brand: '' },
        { slot: 4, sign: null, building: { src: '' } },
      ],
    });
    expect(cfg.overrides).toEqual({});
    expect(cfg.shortAt(4)).toBe(TILE_SHORT[4]);
    expect(cfg.brandAt(4)).toBe(TILE_BRAND[4]);
  });

  it('同 slot 重复条目：后者覆盖前者', () => {
    const cfg = parseShopConfig({ shops: [{ slot: 4, brand: '先' }, { slot: 4, brand: '后' }] });
    expect(cfg.brandAt(4)).toBe('后');
  });

  it('纯函数：不抛错、不改写入参', () => {
    const raw = { shops: [{ slot: 4, brand: '示范', sign: { src: 'shop/a.png' } }] };
    const snapshot = JSON.stringify(raw);
    const a = parseShopConfig(raw);
    const b = parseShopConfig(raw);
    /* 闭包实例不同域，故逐字段比较（overrides/images/取值），而非整体 toEqual */
    expect(a.overrides).toEqual(b.overrides);
    expect(a.images).toEqual(b.images);
    expect(a.shortAt(4)).toBe(b.shortAt(4));
    expect(a.brandAt(4)).toBe(b.brandAt(4));
    expect(JSON.stringify(raw)).toBe(snapshot);
    expect(() => parseShopConfig(undefined)).not.toThrow();
  });
});
