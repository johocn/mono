import type { SkinPack } from './types';

export const DEFAULT_SKIN_ID = 'default';

export async function loadSkin(id: string, base = './skins'): Promise<SkinPack | null> {
  const url = `${base}/${id}/skin.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== 'object') return null;
    const pack = json as SkinPack;
    if (!pack.geo || typeof pack.geo.hw !== 'number') return null;
    return { ...pack, id: typeof pack.id === 'string' && pack.id ? pack.id : id, elements: pack.elements ?? {}, tokens: pack.tokens ?? {} };
  } catch {
    return null;   // 坏 JSON / 网络失败 → 回退，不抛错
  }
}