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

/**
 * 按相对路径在**多个**皮肤包内逐一尝试装载（任一包命中即算成功）。
 * 用途：商家配置里的图片素材（`shops.json` 的 `sign.src` / `building.src`）与皮肤包同源解析，
 * 但可落在任一已加载包（`skins/default/` 或 `skins/photo/`）内 —— 全部落空才算缺失，
 * 返回落空的相对路径列表（绝不抛错，spec §3.6.4）。
 */
export async function preloadRelative(rels: string[], packIds: string[], base = './skins'): Promise<string[]> {
  const missing: string[] = [];
  for (const rel of rels) {
    let loaded = false;
    for (const id of packIds) {
      const url = assetUrl(id, rel, base);
      if (getTexture(url)) { loaded = true; break; }
      try {
        putTexture(url, await Assets.load<Texture>(url));
        loaded = true;
        break;
      } catch {
        /* 该包内没有此素材，试下一个包 */
      }
    }
    if (!loaded) missing.push(rel);
  }
  return missing;
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