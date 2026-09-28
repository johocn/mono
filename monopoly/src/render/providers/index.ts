import type { ProviderSpec } from '../../skin/types';

export interface ProviderImpl {
  draw(g: unknown, ctx: { params: Record<string, unknown>; box: { w: number; d: number; h: number } }): void;
}

const proc: ProviderImpl = {
  draw: () => {
    /* Task 9 起填真绘制；未实现的 preset 由 builtin 兜底（纯色块 + 文字） */
  },
};
const image: ProviderImpl = { draw: () => {} };
const atlas: ProviderImpl = { draw: () => {} };
const frames: ProviderImpl = { draw: () => {} };

export const PROVIDERS: Record<string, ProviderImpl> = { proc, image, atlas, frames };

export function providerFor(spec: ProviderSpec): ProviderImpl {
  const impl = PROVIDERS[spec.kind];
  if (!impl) throw new Error(`[mono] unknown provider kind=${String((spec as { kind?: unknown }).kind)}`);
  return impl;
}