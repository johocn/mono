import { describe, it, expect } from 'vitest';
import {
  INNER_STREET_PROPS, buildingSpecs, slotLevelsOf, streetPropSpecs,
} from '../../src/render/BuildingView';
import {
  DEMO_OWNER, SLOT_BANNER, SLOT_LANTERN_CHAR, TILE_BRAND, TILE_LEVEL,
} from '../../src/data/board';
import type { ElementSpec } from '../../src/skin/instantiate';

const byId = (specs: ElementSpec[], id: string) => specs.filter((s) => s.id === id);
const byPrefix = (specs: ElementSpec[], p: string) => specs.filter((s) => s.id.startsWith(p));
const endsWith = (specs: ElementSpec[], tail: string) => specs.filter((s) => s.id.endsWith(tail));
const isWall = (id: string) => /\.l[1-5]$/.test(id);

describe('BuildingView · 层级表', () => {
  it('slotLevelsOf 只收 lv>0 的 18 格，值为 1/2/3', () => {
    const lv = slotLevelsOf();
    expect(Object.keys(lv).length).toBe(18);
    expect(TILE_LEVEL.filter((x) => x > 0).length).toBe(18);
    expect(lv[0]).toBe(3);
    expect(lv[18]).toBe(3);
    expect(lv[30]).toBe(3);
    expect(lv[2]).toBeUndefined();
  });
});

describe('BuildingView · 实时层级（play 版式：演示层级 ∪ 地产层级）', () => {
  it('传 levelOf 时只按该表出楼：L5 楼体 id 与层级同步，其余格无楼', () => {
    const specs = buildingSpecs({ levelOf: (i) => (i === 4 ? 5 : undefined) });
    expect(byPrefix(specs, 'building.').filter((s) => isWall(s.id)).map((s) => s.id))
      .toEqual(['building.s4.l5']);
    expect(specs.find((s) => s.id === 'building.s4.l5')?.level).toBe(5);
  });

  it('levelOf 返回 0 视同无楼（地砖回到 level 1），不抛 unregistered', () => {
    const specs = buildingSpecs({ levelOf: () => 0 });
    expect(byPrefix(specs, 'building.')).toHaveLength(0);
  });
});

describe('BuildingView · 楼与店招', () => {
  const specs = buildingSpecs();

  it('18 栋楼（L1 9 / L2 6 / L3 3）+ 9 张店招（仅 L2/L3）= 27 条 building.*', () => {
    expect(byPrefix(specs, 'building.').length).toBe(27);
    expect(endsWith(specs, '.l1').length).toBe(9);
    expect(endsWith(specs, '.l2').length).toBe(6);
    expect(endsWith(specs, '.l3').length).toBe(3);
    const signs = endsWith(specs, '.sign');
    expect(signs.length).toBe(9);
    expect(signs.every((s) => s.level !== 1)).toBe(true);
    expect(signs.filter((s) => s.level === 2).length).toBe(6);
    expect(signs.filter((s) => s.level === 3).length).toBe(3);
  });

  it('每栋楼只交状态、不写死 preset/色值：overrides 为空，state 带 level/owner/brand', () => {
    const one = specs.find((s) => s.id === 'building.s4.l2')!;
    expect(one).toBeTruthy();
    expect(one.level).toBe(2);
    expect(one.state).toMatchObject({ level: 2, dim: false, owner: DEMO_OWNER[4] ?? null, brand: TILE_BRAND[4] });
    expect(one.overrides).toEqual({});
  });

  it('防回归（spec V5）：building.* 楼体的 overrides 不含 hue 键', () => {
    for (const s of byPrefix(specs, 'building.')) {
      if (isWall(s.id)) expect(s.overrides).toEqual({});
      for (const spec of Object.values(s.overrides ?? {})) {
        expect(JSON.stringify(spec)).not.toContain('hue');
      }
    }
  });

  it('店招 override 带 brand，且层级跟随宿主楼', () => {
    const sign = specs.find((s) => s.id === 'building.s18.sign')!;
    expect(sign).toBeTruthy();
    expect(sign.level).toBe(3);
    const p = sign.overrides?.['building.s18.sign'] as { preset: string; params: Record<string, unknown> };
    expect(p.preset).toBe('sign');
    expect(p.params.levels).toBe(3);
    expect(p.params.brand).toBe(TILE_BRAND[18]);
  });
});

describe('BuildingView · 挂件', () => {
  const specs = buildingSpecs();

  it('L1 遮阳篷 9；L2/L3 屋顶设备箱 9；L3 招牌塔 3；不再重复挂独立天线', () => {
    expect(byId(specs, 'prop.awning').length).toBe(9);
    expect(byId(specs, 'prop.rooftopBox').length).toBe(9);
    expect(byId(specs, 'prop.signTower').length).toBe(3);
    expect(byId(specs, 'prop.antenna').length).toBe(0);
  });

  it('灯笼每栋 2 盏（门口 + 右侧），有字地块写自己的招牌字', () => {
    const lamps = byId(specs, 'prop.lantern');
    expect(lamps.length).toBe(36);
    const st = (s: ElementSpec) => s.state as { at?: string; char?: string } | undefined;
    const hot = lamps.filter((s) => s.slot === 4);
    expect(hot.length).toBe(2);
    expect(hot.map((s) => st(s)?.at).sort()).toEqual(['door', 'side']);
    expect(hot.every((s) => st(s)?.char === SLOT_LANTERN_CHAR[4])).toBe(true);
    const plain = lamps.filter((s) => s.slot === 0);
    expect(plain.every((s) => st(s)?.char === '')).toBe(true);
  });

  it('竖招幌子 5 条，文字来自 SLOT_BANNER，override 的 preset = banner', () => {
    const banners = byId(specs, 'prop.banner');
    expect(banners.length).toBe(Object.keys(SLOT_BANNER).length);
    expect([...banners.map((s) => Number(s.slot))].sort((a, b) => a - b)).toEqual([0, 4, 6, 18, 26]);
    const b = banners.find((s) => s.slot === 26);
    const p = b?.overrides?.['prop.banner'] as { preset: string; params: Record<string, unknown> };
    expect(p.preset).toBe('banner');
    expect(p.params.text).toBe(SLOT_BANNER[26]);
  });

  it('挂件带 slot（抬升交给注册表 + 管线），且不自己写覆盖', () => {
    for (const s of [...byId(specs, 'prop.awning'), ...byId(specs, 'prop.rooftopBox'), ...byId(specs, 'prop.signTower')]) {
      expect(typeof s.slot).toBe('number');
      expect(s.overrides).toBeUndefined();
    }
  });
});

describe('BuildingView · 内环街道小品', () => {
  it('行道树 ×2（v5 line 294）+ 石板路路灯 ×4，且都在地面上', () => {
    const specs = streetPropSpecs();
    expect(byId(specs, 'prop.tree').length).toBe(2);
    expect(byId(specs, 'prop.lamp').length).toBe(4);
    expect(specs.every((s) => s.slot === null)).toBe(true);
    expect(INNER_STREET_PROPS.filter((p) => p.kind === 'tree').map((p) => [p.c, p.r])).toEqual([[2, 4], [10, 4]]);
    expect(INNER_STREET_PROPS.filter((p) => p.kind === 'lamp').map((p) => [p.c, p.r]))
      .toEqual([[4, 4], [8, 4], [6, 2], [6, 6]]);
  });
});