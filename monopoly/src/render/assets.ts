import { Assets, type Texture } from 'pixi.js';
import type { SkinPack } from '../skin/types';

const textures = new Map<string, Texture>();

/** 包内素材相对路径（去重、保序）：image.src / atlas.src / frames.src[] */
export function assetPaths(pack: SkinPack | null): string[] {
  const out: string[] = [];
  for (const spec of Object.values(pack?.elements ?? {})) {
    if (spec.kind === 'image' || spec.kind === 'atlas') {
      if (!out.includes(spec.src)) out.push(spec.src);
    } else if (spec.kind === 'frames') {
      for (const src of spec.src) if (!out.includes(src)) out.push(src);
    }
  }
  return out;
}

/** 包内相对路径 → URL：`<base>/<packId>/<rel>` */
export function assetUrl(packId: string, rel: string, base = './skins'): string {
  return `${base}/${packId}/${rel}`;
}

export function putTexture(url: string, tex: Texture): void {
  textures.set(url, tex);
}

export function getTexture(url: string): Texture | null {
  return textures.get(url) ?? null;
}

export function clearTextures(): void {
  textures.clear();
}

/**
 * 预装载一个皮肤包的全部素材。
 * `Assets.load` 异步而 `Scene.render` 同步 —— 必须在建场景前 await 完成。
 * 任一素材失败只记入 missing，绝不抛错（spec §3.6.4）。
 */
export async function preloadSkinAssets(pack: SkinPack | null, base = './skins'): Promise<string[]> {
  const missing: string[] = [];
  if (!pack) return missing;
  for (const rel of assetPaths(pack)) {
    const url = assetUrl(pack.id, rel, base);
    if (getTexture(url)) continue;
    try {
      putTexture(url, await Assets.load<Texture>(url));
    } catch {
      missing.push(url);
    }
  }
  return missing;
}