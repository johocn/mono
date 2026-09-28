import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { Scene } from '../../src/render/Scene';
import { DEFAULT_GEO } from '../../src/skin/layout';
import type { ElementSpec } from '../../src/skin/instantiate';

/** 最小 Scene：皮肤留空 → resolve 走内建兜底（纯色块，不触文字/精灵），统计口径与线上一致 */
function makeScene(): Scene {
  return new Scene({
    layers: { ground: new Container(), labels: new Container(), pieces: new Container(), fx: new Container() },
    geo: DEFAULT_GEO,
    bg: { color: '#0c1513', alpha: 1 },
    instantiateDeps: { skin: null, defaultSkin: null, overrides: null, slotLevels: {} },
    placement: { pawnGap: 9.6, pawnFrontDy: 1.45 },
  });
}

/* pass：1 地面 / 2 标签 / 3 棋子 / 4 覆盖层（含显式 pass 覆盖）
   注：标签层由 LabelView 单独绘制、不走注册表，故此处用显式 pass:2 的 UI 元素占位以覆盖第 2 遍口径 */
const SPECS: ElementSpec[] = [
  { id: 'board.tile.shop', c: 2, r: 2 },
  { id: 'board.tile.shop', c: 3, r: 2 },
  { id: 'board.center.fountain', c: 1, r: 1 },
  { id: 'ui.label', c: 0, r: 1, pass: 2, fixed: { cx: 30, cy: 30, s: 1 } },
  { id: 'piece.p1', c: 5, r: 9, pawnIndex: 0 },
  { id: 'ui.dock', c: 0, r: 0, pass: 4, fixed: { cx: 100, cy: 100, s: 1 } },
];

describe('Scene.stats()（spec §11.5「单帧绘制 < 200」的可测口径）', () => {
  it('render 后按 pass 统计本帧元素数，total 为四遍之和', () => {
    const s = makeScene();
    s.addMany(SPECS);
    s.render();
    const st = s.stats();
    expect(st.perPass).toEqual({ 1: 3, 2: 1, 3: 1, 4: 1 });
    expect(st.total).toBe(SPECS.length);
    expect(st.total).toBe(st.perPass[1] + st.perPass[2] + st.perPass[3] + st.perPass[4]);
  });

  it('reset() 后统计归零（清掉旧回合的元素）', () => {
    const s = makeScene();
    s.addMany(SPECS);
    s.render();
    expect(s.stats().total).toBeGreaterThan(0);
    s.reset();
    expect(s.stats().total).toBe(0);
    expect(s.stats().perPass).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
    s.render();
    expect(s.stats().total).toBe(0);
  });

  it('stats() 是纯读：重复调用结果一致，且返回值是副本（外部改动不影响内部）', () => {
    const s = makeScene();
    s.addMany(SPECS);
    s.render();
    const a = s.stats();
    const b = s.stats();
    expect(a).toEqual(b);
    a.perPass[1] = 999;
    a.total = -1;
    expect(s.stats().perPass[1]).toBe(3);
    expect(s.stats().total).toBe(SPECS.length);
  });

  it('绘制元素数远低于 200 的预算（当前演示与对局场景）', () => {
    const s = makeScene();
    s.addMany(SPECS);
    s.render();
    expect(s.stats().total).toBeLessThan(200);
  });
});