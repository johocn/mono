import { describe, it, expect } from 'vitest';
import { VERSION, parseOptions } from '../src/main';

describe('smoke', () => {
  it('导出 VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });
});

describe('parseOptions', () => {
  it('缺省：进站即交互局（play=true）；humans/ai/tour 缺省为 undefined（走开局面板）', () => {
    expect(parseOptions('')).toEqual({
      skin: 'default', debug: false, seed: 1, speed: 1, show: 'b', play: true, nofx: false, perf: false,
      audio: true, humans: undefined, ai: [], tour: undefined,
    });
  });
  it('解析 ?skin ?debug ?seed ?speed（play 仍默认 true）', () => {
    expect(parseOptions('?skin=photo&debug=1&seed=7&speed=4'))
      .toEqual({
        skin: 'photo', debug: true, seed: 7, speed: 4, show: 'b', play: true, nofx: false, perf: false,
        audio: true, humans: undefined, ai: [], tour: undefined,
      });
  });
  it('解析 ?humans / ?ai / ?tour（AI 对手 + 新手引导）', () => {
    expect(parseOptions('?humans=1').humans).toBe(1);
    expect(parseOptions('?humans=4').humans).toBe(4);
    expect(parseOptions('?humans=5').humans).toBeUndefined();   // 越界不采纳
    expect(parseOptions('?humans=0').humans).toBeUndefined();
    expect(parseOptions('?humans=abc').humans).toBeUndefined();
    expect(parseOptions('?humans=1&ai=aggressive,speculative').ai).toEqual(['aggressive', 'speculative']);
    expect(parseOptions('?humans=1&ai=bogus').ai).toEqual([]);
    expect(parseOptions('?tour=1').tour).toBe(true);
    expect(parseOptions('?tour=0').tour).toBe(false);
    expect(parseOptions('?tour=2').tour).toBeUndefined();
  });
  it('解析 ?show=0|c', () => {
    expect(parseOptions('?show=0').show).toBe('0');
    expect(parseOptions('?show=c').show).toBe('c');
  });
  it('解析 ?play / ?demo（M4 交互局）', () => {
    expect(parseOptions('?debug=1&play=1&seed=20260928').play).toBe(true);
    expect(parseOptions('?play=0').play).toBe(false);
    expect(parseOptions('?demo=1').play).toBe(false);
    expect(parseOptions('?demo=1&play=1').play).toBe(false); // demo 优先于 play
  });
  it('非法数字回落到缺省', () => {
    expect(parseOptions('?seed=abc&speed=-2').seed).toBe(1);
    expect(parseOptions('?speed=-2').speed).toBe(1);
  });
  it('解析 ?audio=0（一键全静音，spec §8.2）', () => {
    expect(parseOptions('').audio).toBe(true);
    expect(parseOptions('?audio=1').audio).toBe(true);
    expect(parseOptions('?audio=0').audio).toBe(false);
  });
});