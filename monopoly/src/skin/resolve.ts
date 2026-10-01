import { getEntry } from './registry';
import type { ProviderSpec, SkinPack } from './types';
import type { BuildLevel } from '../data/board';

export interface Resolved {
  elementId: string;
  level: BuildLevel;
  provider: ProviderSpec;
}

/** 「不可能合法」的皮肤探针：任何 ID 在它里面都解不出 provider */
export const BAD_SKIN: SkinPack = {
  id: '__bad__',
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  tokens: {},
  elements: { '__never__': { kind: 'image' } as never },
};

export interface ResolveInput {
  overrides?: Record<string, ProviderSpec> | null;
}

/** provider 形态合法性（坏 JSON / 缺字段一律判非法 → 回退） */
export function isValidProvider(p: unknown): p is ProviderSpec {
  if (!p || typeof p !== 'object') return false;
  const k = (p as { kind?: unknown }).kind;
  const src = (p as { src?: unknown }).src;
  switch (k) {
    case 'proc': {
      const preset = (p as { preset?: unknown }).preset;
      return typeof preset === 'string' && preset.length > 0;
    }
    case 'image':
      return typeof src === 'string' && src.length > 0;
    case 'atlas': {
      const frame = (p as { frame?: unknown }).frame;
      return typeof src === 'string' && src.length > 0 && typeof frame === 'string' && frame.length > 0;
    }
    case 'frames': {
      const fps = (p as { fps?: unknown }).fps;
      return Array.isArray(src) && src.length > 0 && src.every((s) => typeof s === 'string' && s.length > 0)
        && typeof fps === 'number' && fps > 0;
    }
    default:
      return false;
  }
}

/** 内建兜底：纯色块 + 文字，永不空白 */
export function builtinFallback(elementId: string): ProviderSpec {
  return { kind: 'proc', preset: 'builtin', params: { label: elementId } };
}

/**
 * 皮肤包查表：先精确命中，再按段通配（key 中 `*` 匹配任意一段）。
 * 用途：注册表里 `building.<slot>.l<lv>` 有 96 个具体 id，但默认皮肤只需要 4 条
 * （`building.*.l1` / `building.*.l2` / `building.*.l3` / `building.*.sign`）即可描述全部地块楼。
 */
function lookup(pack: SkinPack | null, elementId: string): ProviderSpec | undefined {
  const els = pack?.elements;
  if (!els) return undefined;
  const exact = els[elementId];
  if (exact !== undefined) return exact;
  const parts = elementId.split('.');
  for (const key of Object.keys(els)) {
    if (!key.includes('*')) continue;
    const kp = key.split('.');
    if (kp.length !== parts.length) continue;
    if (kp.every((seg, i) => seg === '*' || seg === parts[i])) return els[key];
  }
  return undefined;
}

/**
 * 四级回退：① 元素级覆盖 → ② 皮肤包 → ③ 全局默认皮肤 → ④ 内建兜底
 * 纯函数：不改写入参、不抛错、坏数据逐级回退。
 */
export function resolve(
  elementId: string,
  skin: SkinPack | null,
  defaultSkin: SkinPack | null,
  overrides?: Record<string, ProviderSpec> | null,
): Resolved {
  const hit = overrides?.[elementId];
  if (isValidProvider(hit)) return { elementId, level: 1, provider: hit };

  const fromSkin = lookup(skin, elementId);
  if (isValidProvider(fromSkin)) return { elementId, level: 2, provider: fromSkin };

  const fromDefault = lookup(defaultSkin, elementId);
  if (isValidProvider(fromDefault)) return { elementId, level: 3, provider: fromDefault };

  return { elementId, level: 4, provider: builtinFallback(elementId) };
}

/** 注册表存在性检查（回退链之外的独立校验，供 lint/debug 用） */
export function isRegistered(elementId: string): boolean {
  return getEntry(elementId) !== null;
}