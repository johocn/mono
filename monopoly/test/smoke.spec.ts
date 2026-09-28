import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/main';

describe('smoke', () => {
  it('导出 VERSION', () => {
    expect(VERSION).toBe('0.0.0');
  });
});