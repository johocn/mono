import { describe, it, expect } from 'vitest';
import { NAMESPACES, isElementId, namespaceOf, ELEMENT_ID_RE } from '../../src/skin/ids';

describe('ids', () => {
  it('接受注册表里各命名空间的合法 ID', () => {
    for (const id of [
      'token.gold', 'token.bg', 'token.tile.shop',
      'board.tile.shop', 'board.tile.fate.edge',
      'board.inner.deco', 'board.center.fountain',
      'building.s4.l2', 'building.s4.sign',
      'prop.awning', 'prop.lantern', 'prop.banner',
      'piece.p1', 'piece.p4',
      'dice.body', 'dice.face6',
      'card.fate.back', 'card.fate.face3',
      'fx.coin', 'fx.scaffold',
      'ui.button.primary', 'ui.panel', 'ui.icon.stock',
      'showcase.panel', 'showcase.sky', 'showcase.mini',
    ]) expect(isElementId(id), id).toBe(true);
  });

  it('拒绝裸名、大小写混用、多余段', () => {
    for (const id of ['gold', 'Token.gold', 'token.gold.extra.deep', 'piece', 'building.l2']) {
      expect(isElementId(id), id).toBe(false);
    }
  });

  it('namespaceOf 取两段命名空间（board.tile.* 归 board.tile）', () => {
    expect(namespaceOf('board.tile.shop')).toBe('board.tile');
    expect(namespaceOf('building.s4.l2')).toBe('building');
    expect(namespaceOf('token.gold')).toBe('token');
  });

  it('NAMESPACES 全覆盖 spec §3.6.1 表', () => {
    expect(NAMESPACES).toEqual([
      'token', 'board.tile', 'board.inner', 'board.center',
      'building', 'prop', 'piece', 'dice', 'card', 'fx', 'ui', 'showcase',
    ]);
  });

  it('ELEMENT_ID_RE 是可复用正则', () => {
    expect(ELEMENT_ID_RE.test('prop.lantern')).toBe(true);
    expect(ELEMENT_ID_RE.test('Prop.lantern')).toBe(false);
  });
});