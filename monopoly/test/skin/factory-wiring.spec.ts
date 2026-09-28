import { describe, it, expect } from 'vitest';
import { PROVIDERS, providerFor } from '../../src/render/providers';

describe('providers 表', () => {
  it('四种 kind 都有实现', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(['atlas', 'frames', 'image', 'proc']);
  });
  it('providerFor 返回实现，未知 kind 抛错', () => {
    expect(typeof providerFor({ kind: 'proc', preset: 'tile' }).draw).toBe('function');
    expect(() => providerFor({ kind: 'nope' } as never)).toThrow(/^\[mono\] unknown provider kind/);
  });
});