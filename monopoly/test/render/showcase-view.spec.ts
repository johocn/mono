import { describe, it, expect } from 'vitest';
import { showcaseSpecs } from '../../src/render/ShowcaseView';
import { SHOWCASE_L as W } from '../../src/render/providers/proc-showcase';
import {
  LEVEL_NAME, PLAYER_NAME, PRICE_BY_LEVEL, RENT_BY_LEVEL, SLOT_BANNER, TILE_BRAND, TILE_LEVEL,
} from '../../src/data/board';
import { STAGE_W } from '../../src/skin/layout';
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

  it('L3 地块（slot 18）第二行信息退化为「已是最高」，不出现 undefined', () => {
    const st = showcaseSpecs({ slot: 18, owner: 2 }).find((s) => s.id === 'showcase.hud')!.state!;
    expect(String(st.line2)).not.toContain('undefined');
    expect(String(st.line2)).not.toContain('L4');
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

describe('ShowcaseView · C 版式（三级对照，v5 optC line 449–455）', () => {
  const specs = showcaseSpecs({ variant: 'c' });

  it('三张卡各（底板 + 楼 + 店招）+ L2/L3 各一面幌子 = 11 条', () => {
    expect(specs.length).toBe(11);
    expect(by(specs, 'showcase.mini').length).toBe(3);
    expect(by(specs, 'showcase.shop').length).toBe(3);
    expect(by(specs, 'showcase.sign').length).toBe(3);
    expect(by(specs, 'showcase.banner').length).toBe(2);
  });

  it('三级并排：同一条地平线、同缩放、等间距，三张卡整体水平居中', () => {
    const cards = by(specs, 'showcase.mini');
    expect(cards.map((c) => c.fixed!.s)).toEqual([W.miniCardScale, W.miniCardScale, W.miniCardScale]);
    expect(cards.map((c) => c.fixed!.cy)).toEqual([W.miniY, W.miniY, W.miniY]);
    const step = W.miniW * W.miniCardScale + W.miniGap;
    const [x0c, x1c, x2c] = cards.map((c) => c.fixed!.cx);
    expect(x1c - x0c).toBeCloseTo(step, 5);
    expect(x2c - x1c).toBeCloseTo(step, 5);
    expect(x0c).toBeCloseTo((STAGE_W - (3 * step - W.miniGap)) / 2, 5);
  });

  it('楼层级 1 / 2 / 3，色相统一 32，品牌取 core 地块（v5 miniShop 参数）', () => {
    const shops = by(specs, 'showcase.shop');
    const paramsOf = (i: number) => (shops[i].overrides!['showcase.shop'] as { params: Record<string, unknown> }).params;
    expect([0, 1, 2].map((i) => paramsOf(i).levels)).toEqual([1, 2, 3]);
    for (const i of [0, 1, 2]) {
      expect(paramsOf(i).hue).toBe(W.miniHue);
      expect(paramsOf(i).brand).toBe(TILE_BRAND[0]);
    }
  });

  it('卡标签 = L{lv} 名 · ￥价（v5 optC line 450–452）', () => {
    expect(by(specs, 'showcase.mini').map((c) => c.state!.caption)).toEqual([
      `L1 ${LEVEL_NAME[1]} · ￥${PRICE_BY_LEVEL[1]}`,
      `L2 ${LEVEL_NAME[2]} · ￥${PRICE_BY_LEVEL[2]}`,
      `L3 ${LEVEL_NAME[3]} · ￥${PRICE_BY_LEVEL[3]}`,
    ]);
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
    expect(banners.map((b) => b.fixed!.cx)).toEqual([shops[1].fixed!.cx, shops[2].fixed!.cx]);
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