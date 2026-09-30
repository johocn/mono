import { describe, it, expect } from 'vitest';
import { parseTheme, compileTheme, globMatch, forcePalette, mergePatches } from '../../src/skin/theme';

const IDS = ['building.s4.l2', 'building.s5.l2', 'prop.signTower', 'board.tile.chance'];

describe('theme 装配（spec §4）', () => {
  it('glob 精确段通配：段数必须一致，`*` 不跨 `.`', () => {
    expect(globMatch('building.*.l2', 'building.s4.l2')).toBe(true);
    expect(globMatch('building.*.l2', 'building.s4.l3')).toBe(false);
    expect(globMatch('building.*.l2', 'building.s4.l2.extra')).toBe(false);
    expect(globMatch('prop.*', 'prop.signTower')).toBe(true);
    expect(globMatch('building.*', 'building.s4.l2')).toBe(false);
  });

  it('compileTheme 展开 palette 色键，binding.params 最后展开（单素材独立风格压过 palette）', () => {
    const th = parseTheme({
      palettes: { S1: { wallL: '#cdb78f', glow: '#ffd9a0' } },
      bindings: [
        { match: 'prop.*', preset: 'signTower', palette: 'S1', params: { glow: '#ff0000' } },
      ],
    });
    const out = compileTheme(th, IDS);
    expect(out['prop.signTower'].preset).toBe('signTower');
    expect(out['prop.signTower'].params.wallL).toBe('#cdb78f');
    expect(out['prop.signTower'].params.glow).toBe('#ff0000');   // params 赢
  });

  it('坏数据静默跳过、不抛错', () => {
    const th = parseTheme({
      palettes: { S1: { wallL: '#fff' } },
      bindings: [
        { match: 42, palette: 'S1' },
        { match: 'prop.*', palette: 'NOT_EXIST' },
        { match: 'prop.*', palette: 'S1', paletteBySlot: ['short'] },
      ],
    });
    expect(() => compileTheme(th, IDS)).not.toThrow();
    expect(compileTheme(th, IDS)).toEqual({});
  });

  it('paletteBySlot 优先于 palette', () => {
    const slots = Array.from({ length: 32 }, (_, i) => (i === 4 ? 'B' : 'A'));
    const th = parseTheme({
      palettes: { A: { wallL: '#aaa' }, B: { wallL: '#bbb' } },
      bindings: [{ match: 'building.*.l2', palette: 'A', paletteBySlot: slots }],
    });
    const out = compileTheme(th, IDS);
    expect(out['building.s4.l2'].params.wallL).toBe('#bbb');
    expect(out['building.s5.l2'].params.wallL).toBe('#aaa');
  });

  it('无 preset 的 binding 不写 preset；后条 binding 不抹掉前条给的 preset（差量累加）', () => {
    const th = parseTheme({
      palettes: { S1: { glow: '#fff' } },
      bindings: [
        { match: 'prop.*', preset: 'signTower' },
        { match: 'prop.*', palette: 'S1' },
      ],
    });
    const out = compileTheme(th, IDS);
    expect(out['prop.signTower'].preset).toBe('signTower');
    expect(out['prop.signTower'].params.glow).toBe('#fff');
    expect(out['board.tile.chance']).toBeUndefined();
  });
});

/* —— `?theme=<paletteId>` 强制套色 + 补丁深合并（preset 由 bindings 决定，不能被套色抹掉） —— */

describe('forcePalette / mergePatches', () => {
  const th = parseTheme({
    palettes: {
      S1: { wallL: '#aaa', glow: '#f00' },
      S2: { wallL: '#bbb' },
    },
    bindings: [{ match: 'building.*.l2', preset: 'shop', palette: 'S1' }],
  });

  it('forcePalette 只作用于建筑/道具/地砖，且只出 params（不出 preset）', () => {
    const forced = forcePalette(th, 'S2', IDS);
    expect(forced['building.s4.l2'].params.wallL).toBe('#bbb');
    expect(forced['building.s4.l2'].preset).toBeUndefined();
    expect(forced['board.tile.chance'].params.wallL).toBe('#bbb');
    expect(forced['prop.signTower'].params.wallL).toBe('#bbb');
    expect(Object.keys(forced).sort()).toEqual(['board.tile.chance', 'building.s4.l2', 'building.s5.l2', 'prop.signTower']);
  });

  it('未知 paletteId → 空补丁（静默回退 theme.json 的分区轮转）', () => {
    expect(forcePalette(th, 'NOT_EXIST', IDS)).toEqual({});
  });

  it('mergePatches：套色合并后 preset 仍是 bindings 给的 shop，色键被强制覆盖', () => {
    const merged = mergePatches(compileTheme(th, IDS), forcePalette(th, 'S2', IDS));
    expect(merged['building.s4.l2'].preset).toBe('shop');
    expect(merged['building.s4.l2'].params.wallL).toBe('#bbb');
    expect(merged['building.s4.l2'].params.glow).toBe('#f00');   // 未覆盖的键保留
  });

  it('mergePatches：空 preset 不抹掉已有 preset', () => {
    const merged = mergePatches({ a: { preset: 'shop', params: {} } }, { a: { params: { wallL: '#ccc' } } });
    expect(merged.a.preset).toBe('shop');
    expect(merged.a.params.wallL).toBe('#ccc');
  });
});