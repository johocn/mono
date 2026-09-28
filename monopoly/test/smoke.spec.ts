import { describe, it, expect } from 'vitest';
import { VERSION, parseOptions } from '../src/main';

describe('smoke', () => {
  it('导出 VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });
});

describe('parseOptions', () => {
  it('缺省：skin=default, debug=false, seed=1, speed=1', () => {
    expect(parseOptions('')).toEqual({ skin: 'default', debug: false, seed: 1, speed: 1 });
  });
  it('解析 ?skin ?debug ?seed ?speed', () => {
    expect(parseOptions('?skin=photo&debug=1&seed=7&speed=4'))
      .toEqual({ skin: 'photo', debug: true, seed: 7, speed: 4 });
  });
  it('非法数字回落到缺省', () => {
    expect(parseOptions('?seed=abc&speed=-2').seed).toBe(1);
    expect(parseOptions('?speed=-2').speed).toBe(1);
  });
});