import { describe, it, expect } from 'vitest';
import { showcaseSpecs } from '../../src/render/ShowcaseView';
import { SHOWCASE_L as W } from '../../src/render/providers/proc-showcase';
import {
  LEVEL_NAME, PLAYER_NAME, PRICE_BY_LEVEL, RENT_BY_LEVEL, SLOT_BANNER, TILE_BRAND, TILE_LEVEL,
} from '../../src/data/board';
import { STAGE_H, STAGE_W } from '../../src/skin/layout';
import type { ElementSpec } from '../../src/skin/instantiate';

const by = (specs: ElementSpec[], id: string) => specs.filter((s) => s.id === id);

describe('ShowcaseView · B 版式（v5 optB line 443–449，样板地块 = slot 4 太平温泉）', () => {
  const specs = showcaseSpecs({ slot: 4, owner: 2 });

  it('14 条元素：底板/夜空/天际线/地面 ×1、树灯 ×4、楼+店招+灯笼×2+幌子、HUD ×1', () => {
    expect(specs.length).toBe(14);
    expect(by(specs, 'showcase.tree').length).toBe(2);
    expect(by(specs, 'showcase.lamp').length).toBe(2);
    expect(by(specs, 'showcase.lantern').length).toBe(2);
    expect(by(specs, 'showcase.banner').length).toBe(1);
  });

  it('全部走 fixed 台位 + pass 4（覆盖层，压在棋盘与棋子之上），不进 resolvePlacement', () => {
    expect(specs.every((s) => Boolean(s.fixed) && s.pass === 4)).toBe(true);
    expect(by(specs, 'showcase.panel')[0].fixed).toEqual({ cx: W.x, cy: W.y });
  });

  it('大楼与挂件共享同一 fixed（同一坐标系），缩放 = SHOWCASE_L.shopScale', () => {
    const big = by(specs, 'showcase.shop')[0].fixed!;
    expect(big.s).toBe(W.shopScale);
    for (const id of ['showcase.sign', 'showcase.lantern', 'showcase.banner']) {
      for (const s of by(specs, id)) {
        expect(s.fixed!.cx).toBe(big.cx);
        expect(s.fixed!.cy).toBe(big.cy);
        expect(s.fixed!.s).toBe(big.s);
      }
    }
  });

  it('override 带上地块的品牌/层级/色相与温泉池 + 蒸汽', () => {
    const ov = by(specs, 'showcase.shop')[0].overrides!['showcase.shop'] as { preset: string; params: Record<string, unknown> };
    expect(ov.preset).toBe('shop');
    expect(ov.params.levels).toBe(TILE_LEVEL[4]);
    expect(ov.params.brand).toBe(TILE_BRAND[4]);
    expect(ov.params.pool).toBe(true);
    expect(ov.params.steam).toBe(true);
  });

  it('HUD 文案：持有者名 + 当前租金 + 升级后租金（v5 line 446–448）', () => {
    const st = by(specs, 'showcase.hud')[0].state!;
    expect(String(st.sub)).toContain(PLAYER_NAME[1]);
    expect(String(st.line1)).toContain(`￥${RENT_BY_LEVEL[2]}`);
    expect(String(st.line2)).toContain(`￥${RENT_BY_LEVEL[3]}`);
  });
});

describe('ShowcaseView · 无主 / 无幌子地块', () => {
  it('slot 8（L1、无幌子、无灯笼字）：不含 banner，层级取 TILE_LEVEL', () => {
    const specs = showcaseSpecs({ slot: 8, owner: null });
    expect(by(specs, 'showcase.banner').length).toBe(SLOT_BANNER[8] === undefined ? 0 : 1);
    const ov = by(specs, 'showcase.shop')[0].overrides!['showcase.shop'] as { params: Record<string, unknown> };
    expect(ov.params.levels).toBe(TILE_LEVEL[8]);
  });

  it('L3 地块（slot 18）第二行信息指向 L4 与 L4 租金，不出现 undefined', () => {
    const st = showcaseSpecs({ slot: 18, owner: 2 }).find((s) => s.id === 'showcase.hud')!.state!;
    expect(String(st.line2)).not.toContain('undefined');
    expect(String(st.line2)).toContain('L4');
    expect(String(st.line2)).toContain(`￥${RENT_BY_LEVEL[4]}`);
  });
});

describe('ShowcaseView · 商家配置文案注入（brandOf）', () => {
  it('B 版式：brandOf(slot) 覆盖店招/楼体/信息条文字', () => {
    const specs = showcaseSpecs({ slot: 4, owner: 2, brandOf: (i) => `商${i}` });
    const shop = by(specs, 'showcase.shop')[0].overrides!['showcase.shop'] as { params: Record<string, unknown> };
    const sign = by(specs, 'showcase.sign')[0].overrides!['showcase.sign'] as { params: Record<string, unknown> };
    expect(shop.params.brand).toBe('商4');
    expect(sign.params.brand).toBe('商4');
    expect(by(specs, 'showcase.hud')[0].state!.brand).toBe('商4');
  });

  it('C 版式：brandOf(0) 注入，缺省仍回退 TILE_BRAND[0]', () => {
    const withInjection = showcaseSpecs({ variant: 'c', brandOf: () => '注入牌' });
    const shop = withInjection.find((s) => s.id === 'showcase.shop')!.overrides!['showcase.shop'] as { params: Record<string, unknown> };
    expect(shop.params.brand).toBe('注入牌');

    const fallback = showcaseSpecs({ variant: 'c' });
    const shop0 = fallback.find((s) => s.id === 'showcase.shop')!.overrides!['showcase.shop'] as { params: Record<string, unknown> };
    expect(shop0.params.brand).toBe(TILE_BRAND[0]);
  });
});

describe('ShowcaseView · C 版式（五级对照，v5 optC line 449–455 三级 → M7 五级 3+2）', () => {
  const specs = showcaseSpecs({ variant: 'c' });

  it('五张卡各（底板 + 楼 + 店招）+ L2..L5 四面幌子 = 19 条', () => {
    expect(specs.length).toBe(19);
    expect(by(specs, 'showcase.mini').length).toBe(5);
    expect(by(specs, 'showcase.shop').length).toBe(5);
    expect(by(specs, 'showcase.sign').length).toBe(5);
    expect(by(specs, 'showcase.banner').length).toBe(4);
  });

  it('两行 3+2：行内同地平线、同缩放、等间距、整行水平居中；第二行不溢出舞台', () => {
    const cards = by(specs, 'showcase.mini');
    expect(cards.map((c) => c.fixed!.s)).toEqual(Array.from({ length: 5 }, () => W.miniCardScale));
    const cw = W.miniW * W.miniCardScale;
    const step = cw + W.miniGap;
    const rowGap = W.miniH * W.miniCardScale + W.miniGap;
    const y0 = W.miniY - rowGap / 2;
    expect(cards.map((c) => c.fixed!.cy)).toEqual([y0, y0, y0, y0 + rowGap, y0 + rowGap]);
    const cx = cards.map((c) => c.fixed!.cx);
    expect(cx[1] - cx[0]).toBeCloseTo(step, 5);
    expect(cx[2] - cx[1]).toBeCloseTo(step, 5);
    expect(cx[4] - cx[3]).toBeCloseTo(step, 5);
    expect(cx[0]).toBeCloseTo((STAGE_W - (3 * step - W.miniGap)) / 2, 5);
    expect(cx[3]).toBeCloseTo((STAGE_W - (2 * step - W.miniGap)) / 2, 5);
    const bottom = y0 + rowGap + W.miniH * W.miniCardScale + W.miniCapDrop;
    expect(bottom).toBeLessThan(STAGE_H);
  });

  it('楼层级 1..5，色相统一 32，品牌取 core 地块（v5 miniShop 参数）', () => {
    const shops = by(specs, 'showcase.shop');
    const paramsOf = (i: number) => (shops[i].overrides!['showcase.shop'] as { params: Record<string, unknown> }).params;
    expect([0, 1, 2, 3, 4].map((i) => paramsOf(i).levels)).toEqual([1, 2, 3, 4, 5]);
    for (const i of [0, 1, 2, 3, 4]) {
      expect(paramsOf(i).hue).toBe(W.miniHue);
      expect(paramsOf(i).brand).toBe(TILE_BRAND[0]);
    }
  });

  it('卡标签 = L{lv} 名 · ￥价（v5 optC line 450–452 扩到 5 级）', () => {
    expect(by(specs, 'showcase.mini').map((c) => c.state!.caption)).toEqual(
      [1, 2, 3, 4, 5].map((lv) => `L${lv} ${LEVEL_NAME[lv]} · ￥${PRICE_BY_LEVEL[lv]}`),
    );
  });

  it('楼 / 店招 / 幌子共享同一 fixed：楼在卡内水平居中、缩放 = 1.35 × 卡缩放', () => {
    const cards = by(specs, 'showcase.mini');
    const shops = by(specs, 'showcase.shop');
    const signs = by(specs, 'showcase.sign');
    shops.forEach((s, i) => {
      expect(s.fixed!.s).toBeCloseTo(W.miniS * W.miniCardScale, 5);
      expect(s.fixed!.cx).toBeCloseTo(cards[i].fixed!.cx + (W.miniW * W.miniCardScale) / 2, 5);
      expect(s.fixed!.cy).toBeCloseTo(cards[i].fixed!.cy + W.miniH * W.miniCardScale * W.miniShopY, 5);
      expect(signs[i].fixed).toEqual(s.fixed);
    });
    const banners = by(specs, 'showcase.banner');
    expect(banners.map((b) => b.fixed!.cx)).toEqual([1, 2, 3, 4].map((i) => shops[i].fixed!.cx));
  });

  it('全部走 fixed 台位 + pass 4，且不出现 B 版式的元素', () => {
    expect(specs.every((s) => Boolean(s.fixed) && s.pass === 4)).toBe(true);
    for (const id of ['showcase.panel', 'showcase.sky', 'showcase.skyline', 'showcase.ground', 'showcase.hud', 'showcase.tree', 'showcase.lamp']) {
      expect(by(specs, id).length).toBe(0);
    }
  });

  it('B 版式不受影响（不传 variant 仍是 14 条、无 showcase.mini）', () => {
    const b = showcaseSpecs({ slot: 4, owner: 2 });
    expect(b.length).toBe(14);
    expect(by(b, 'showcase.mini').length).toBe(0);
  });
});