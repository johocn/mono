import { describe, it, expect } from 'vitest';
import { instantiate, liftOf, hostHeightOf, type InstantiateDeps } from '../../src/skin/instantiate';
import { BUILDING_HEIGHTS } from '../../src/skin/registry';
import type { SkinPack } from '../../src/skin/types';

const defaultSkin: SkinPack = {
  id: 'default',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: { gold: '#f5c451' },
  elements: {
    'board.tile.shop': { kind: 'proc', preset: 'tile', params: { fill: '#2f4238' } },
    'building.s4.l2': { kind: 'proc', preset: 'building', params: { hue: 32 } },
    'building.s4.sign': { kind: 'proc', preset: 'sign', params: {} },
    'prop.lantern': { kind: 'proc', preset: 'lantern', params: {} },
    'prop.rooftopBox': { kind: 'proc', preset: 'rooftopBox', params: {} },
  },
};

const deps = (skin: SkinPack | null = null, slotLevels: Record<number, 1 | 2 | 3> = { 4: 2 }): InstantiateDeps => ({
  skin,
  defaultSkin,
  overrides: null,
  slotLevels,
});

describe('liftOf 挂载抬升（铁律：装饰自己不算坐标）', () => {
  it('ground → 0', () => {
    expect(liftOf('ground', BUILDING_HEIGHTS[3], 1)).toBe(0);
    expect(liftOf('ground', BUILDING_HEIGHTS[3], 0.4)).toBe(0);
  });

  it('wall → atV × hostHeight（按当前层级）', () => {
    expect(liftOf('wall', BUILDING_HEIGHTS[1], 0.5)).toBe(13);
    expect(liftOf('wall', BUILDING_HEIGHTS[2], 0.5)).toBe(23);
    expect(liftOf('wall', BUILDING_HEIGHTS[3], 0.86)).toBeCloseTo(61.92, 5);
  });

  it('roof → 满层高（贴屋顶面）', () => {
    expect(liftOf('roof', BUILDING_HEIGHTS[1], 0.1)).toBe(26);
    expect(liftOf('roof', BUILDING_HEIGHTS[3], 1)).toBe(72);
  });
});

describe('instantiate 单一入口', () => {
  it('阵地砖：depth = c + r，lift = 0，source 带 ID/slot/kind/回退级别', () => {
    const inst = instantiate({ id: 'board.tile.shop', slot: 1, c: 2, r: 3 }, deps());
    expect(inst.depth).toBe(5);
    expect(inst.lift).toBe(0);
    expect(inst.providerKind).toBe('proc');
    expect(inst.level).toBe(3); // 本测试的 defaultSkin 即「全局默认」，命中 L3
    expect(inst.source).toBe('[mono] board.tile.shop @slot=1 provider=proc ← L3');
    expect(inst.skin).toBe('default');
  });

  it('贴在 L2 楼上的灯笼：lift = 0.30 × 46', () => {
    const inst = instantiate({ id: 'prop.lantern', slot: 4, c: 5, r: 5 }, deps());
    expect(inst.mount).toBe('wall');
    expect(inst.lift).toBeCloseTo(13.8, 5);
  });

  it('屋顶设备箱：lift 取该 slot 当前层级满层高', () => {
    const inst = instantiate({ id: 'prop.rooftopBox', slot: 4, c: 5, r: 5 }, deps());
    expect(inst.mount).toBe('roof');
    expect(inst.lift).toBe(46);
  });

  it('未注册 ID → 抛统一格式错误', () => {
    expect(() => instantiate({ id: 'nope.bad', c: 1, r: 1 }, deps()))
      .toThrowError(/^\[mono\] nope\.bad @slot=null provider=- ← unregistered$/);
  });

  it('未注册但像 ID：仍然抛（禁止绕过注册表）', () => {
    expect(() => instantiate({ id: 'prop.unknownThing', c: 1, r: 1 }, deps())).toThrow(/unregistered/);
  });

  it('slot 层级缺省按 1 处理（新建未升级地块）', () => {
    const inst = instantiate({ id: 'prop.rooftopBox', slot: 9, c: 5, r: 5 }, deps(defaultSkin, {}));
    expect(inst.lift).toBe(26);
  });

  it('override 命中时级别为 1 且 provider 来自 override', () => {
    const d = deps();
    d.overrides = { 'board.tile.shop': { kind: 'image', src: 'tex/x.webp' } };
    const inst = instantiate({ id: 'board.tile.shop', slot: 1, c: 1, r: 1 }, d);
    expect(inst.level).toBe(1);
    expect(inst.providerKind).toBe('image');
  });

  it('draw 已绑定 ctx：调用即把 provider 与参数交给绘制函数', () => {
    const seen: string[] = [];
    const d = deps();
    d.onDraw = (inst, p) => seen.push(`${inst.id}:${String((p as { fill?: string }).fill)}`);
    const inst = instantiate({ id: 'board.tile.shop', slot: 1, c: 1, r: 1 }, d);
    inst.draw({} as never, { fill: '#2f4238' });
    expect(seen).toEqual(['board.tile.shop:#2f4238']);
  });

  it('商家配置（deps.overrides）优先于渲染层自带的 spec.overrides（同元素覆盖）', () => {
    const d = deps();
    d.overrides = { 'building.s4.sign': { kind: 'image', src: 'shop/s4-sign.png' } };
    const inst = instantiate({
      id: 'building.s4.sign', slot: 4, c: 5, r: 9, level: 2,
      overrides: { 'building.s4.sign': { kind: 'proc', preset: 'sign', params: { brand: '通用' } } },
    }, d);
    expect(inst.level).toBe(1);
    expect(inst.provider).toMatchObject({ kind: 'image', src: 'shop/s4-sign.png' });
  });
});

describe('hostHeightOf', () => {
  it('slot 有层级 → 对应墙高；无 → L1', () => {
    expect(hostHeightOf(4, { 4: 3 })).toBe(72);
    expect(hostHeightOf(7, { 4: 3 })).toBe(26);
  });
});