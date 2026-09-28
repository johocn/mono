import type { Graphics } from 'pixi.js';
import type { ProviderSpec } from '../../skin/types';
import { procPreset, type ProcCtx } from './proc';

export interface ProviderImpl {
  draw(g: Graphics, ctx: ProcCtx): void;
}

const proc: ProviderImpl = {
  draw: (g, ctx) => {
    const preset = typeof ctx.params.__preset === 'string' ? (ctx.params.__preset as string) : 'builtin';
    procPreset(preset)(g, ctx);
  },
};
const image: ProviderImpl = { draw: () => { /* Task 20 实现 */ } };
const atlas: ProviderImpl = { draw: () => { /* Task 20 实现 */ } };
const frames: ProviderImpl = { draw: () => { /* Task 20 实现 */ } };

export const PROVIDERS: Record<string, ProviderImpl> = { proc, image, atlas, frames };

export function providerFor(spec: ProviderSpec): ProviderImpl {
  const impl = PROVIDERS[spec.kind];
  if (!impl) throw new Error(`[mono] unknown provider kind=${String((spec as { kind?: unknown }).kind)}`);
  return impl;
}