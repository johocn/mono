/**
 * 广告宣传版（M21）· 架构与方案 A 单测（node 环境，纯函数）
 * 覆盖：方案解析级联 / 注册表回退 / 公共配色 token / 迷你棋盘几何不变量 /
 *       落格联动纯函数 / 商家条目解析（entries 新增字段）。
 */
import { describe, expect, it } from 'vitest';
import { resolveAdPlanId } from '../../src/ad/resolve';
import { adPlanCatalog, adPlanConfigOf, PLANS } from '../../src/ad/plans/registry';
import { AD_TOKEN_DEFAULTS, AD_TOKEN_KEYS, adToken, adVarName } from '../../src/ad/tokens';
import { AD_GEO, AD_HUD_TOP, AD_ZONE_H, AD_HERO_H, AD_TAB_H } from '../../src/ad/adLayout';
import { pickLanding } from '../../src/ad/MallView';
import { SHOWCASE_PLAN } from '../../src/ad/plans/showcase';
import { AD_PLAN_IDS } from '../../src/ad/types';
import { parseShopConfig, SHOP_DEFAULTS } from '../../src/skin/shop-config';
import { createGame } from '../../src/core/game';
import { applyStep } from '../../src/core/ai';
import { RING_SIZE, TILE_SHORT } from '../../src/data/board';

describe('ad resolve · 方案解析级联', () => {
  it('URL ?plan= 优先（预览不落库语义由调用方保证）', () => {
    expect(resolveAdPlanId('billboard', 'showcase', 'theater')).toBe('billboard');
  });
  it('非法 URL 值跳过 → localStorage 次之', () => {
    expect(resolveAdPlanId('nope', 'theater', 'billboard')).toBe('theater');
  });
  it('再退化到远端配置，最后默认 showcase', () => {
    expect(resolveAdPlanId(null, null, 'catalog')).toBe('catalog');
    expect(resolveAdPlanId(null, 'bad', null)).toBe('showcase');
    expect(resolveAdPlanId(null, null, null)).toBe('showcase');
  });
});

describe('ad registry · 注册表与回退', () => {
  it('五案 id 全量注册（B–E 占位 null，方案可选项保留）', () => {
    expect(Object.keys(PLANS).sort()).toEqual([...AD_PLAN_IDS].sort());
    expect(PLANS.showcase).not.toBeNull();
    for (const id of ['flagship', 'billboard', 'theater', 'catalog'] as const) {
      expect(PLANS[id]).toBeNull();
    }
  });
  it('未实现方案回退 showcase 且不抛错', () => {
    expect(adPlanConfigOf('flagship').id).toBe('showcase');
    expect(adPlanConfigOf('showcase').id).toBe('showcase');
  });
  it('后台方案清单：id 齐全 + ready 标记', () => {
    const cat = adPlanCatalog();
    expect(cat.map((c) => c.id)).toEqual([...AD_PLAN_IDS]);
    expect(cat.find((c) => c.id === 'showcase')?.ready).toBe(true);
    expect(cat.find((c) => c.id === 'flagship')?.ready).toBe(false);
  });
});

describe('ad tokens · 公共配色变量（唯一真源）', () => {
  it('全键非空；camelCase → --ad-kebab', () => {
    for (const k of AD_TOKEN_KEYS) {
      expect(AD_TOKEN_DEFAULTS[k].length).toBeGreaterThan(0);
    }
    expect(adVarName('bgDeep')).toBe('--ad-bg-deep');
    expect(adVarName('canvasBg')).toBe('--ad-canvas-bg');
  });
  it('adToken 兜底链：方案覆盖 → 全局默认', () => {
    expect(adToken('gold', { gold: '#123456' })).toBe('#123456');
    expect(adToken('gold', { brick: '#123456' })).toBe(AD_TOKEN_DEFAULTS.gold);
    expect(adToken('gold')).toBe(AD_TOKEN_DEFAULTS.gold);
  });
  it('方案配置不引入 token 表之外的色键（结构纪律）', () => {
    for (const key of Object.keys(SHOWCASE_PLAN.theme ?? {})) {
      expect(AD_TOKEN_KEYS).toContain(key);
    }
  });
});

describe('ad layout · 迷你棋盘几何不变量', () => {
  it('棋盘完全落在 390×844 内且底缘 = 紧凑 HUD 顶', () => {
    // 环上 (c−r) ∈ −6..10、(c+r) ∈ 0..16；tile 半高 hh
    const left = AD_GEO.ox + (-6) * AD_GEO.hw - AD_GEO.hw;
    const right = AD_GEO.ox + 10 * AD_GEO.hw + AD_GEO.hw;
    const top = AD_GEO.oy - 2 * AD_GEO.hh;
    const bottom = AD_GEO.oy + 17 * AD_GEO.hh;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(390);
    expect(top).toBeGreaterThanOrEqual(AD_HERO_H + AD_TAB_H);   // 不压广告区
    expect(bottom).toBe(AD_HUD_TOP);                            // 与 HUD 相接
    expect(AD_HUD_TOP).toBeLessThan(844);
    expect(AD_ZONE_H).toBe(563);
  });
});

describe('ad mall · 落格联动（纯函数）', () => {
  it('非结算态不触发；结算态给出 key/slot/entry', () => {
    const g = createGame({ seed: 1, playerCount: 4, abilities: true });
    expect(pickLanding(g.state, new Map())).toBeNull();
    applyStep(g, { kind: 'roll' });
    applyStep(g, { kind: 'move' });
    applyStep(g, { kind: 'settle' });
    expect(g.state.phase).toBe('settled');
    const pick = pickLanding(g.state, new Map());
    expect(pick).not.toBeNull();
    expect(pick?.slot).toBe(g.state.players[g.state.current].pos);
    expect(pick?.entry).toBeNull();
    expect(pick?.key).toBe(`1:${g.state.players[g.state.current].pos}:${g.state.round}`);
  });
});

describe('ad shops · 商家条目（MallView 数据源）', () => {
  it('解析出 entries 供商城卡 / 弹券消费', () => {
    const cfg = parseShopConfig({
      shops: [{ slot: 4, brand: '测试温泉', couponTemplateId: 'c-001', validDays: 7 }, { slot: 99 }],
    });
    expect(cfg.entries).toHaveLength(1);
    expect(cfg.entries[0].slot).toBe(4);
    expect(cfg.entries[0].couponTemplateId).toBe('c-001');
    expect(cfg.entries[0].validDays).toBe(7);
  });
  it('零配置兜底 entries 为空', () => {
    expect(SHOP_DEFAULTS.entries).toEqual([]);
    expect(parseShopConfig(null).entries).toEqual([]);
  });
});

describe('ad showcase · 方案 A 配置', () => {
  it('占位商品卡槽位合法、标题取自棋盘字牌（不造假店名）', () => {
    expect(SHOWCASE_PLAN.demo.length).toBeGreaterThan(0);
    for (const d of SHOWCASE_PLAN.demo) {
      expect(d.slot).toBeGreaterThanOrEqual(0);
      expect(d.slot).toBeLessThan(RING_SIZE);
      expect(TILE_SHORT).toContain(d.title);
    }
  });
  it('布局分段引用 adLayout 常量（唯一来源）', () => {
    expect(SHOWCASE_PLAN.layout).toEqual({ heroH: AD_HERO_H, tabH: AD_TAB_H, zoneH: AD_ZONE_H });
  });
});
