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
const image: ProviderImpl = {
  draw: (_g, ctx) => {
    if (!ctx.sprite || !ctx.asset) return;
    const spec = ctx.spec;
    if (!spec || spec.kind !== 'image') return;
    const texture = ctx.asset(spec.src);
    if (!texture) return;
    ctx.sprite({
      texture,
      x: ctx.cx,
      y: ctx.cy,
      w: ctx.box.w * ctx.s,
      h: ctx.box.h * ctx.s,
      anchor: spec.anchor,
    });
  },
};
const atlas: ProviderImpl = { draw: () => { /* M5（图集取帧） */ } };
const frames: ProviderImpl = { draw: () => { /* M5（序列帧） */ } };

export const PROVIDERS: Record<string, ProviderImpl> = { proc, image, atlas, frames };

export function providerFor(spec: ProviderSpec): ProviderImpl {
  const impl = PROVIDERS[spec.kind];
  if (!impl) throw new Error(`[mono] unknown provider kind=${String((spec as { kind?: unknown }).kind)}`);
  return impl;
}