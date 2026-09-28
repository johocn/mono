import { createStage } from './render/stage';
import { createDebugPanel } from './debug/panel';
import { loadSkin } from './skin/skinLoader';
import { Scene } from './render/Scene';
import { boardTileSpecs } from './render/BoardView';
import { DEFAULT_GEO } from './skin/layout';

export const VERSION = '0.1.0';

/** 兜底底色（真色值在 M2 起从 skins/<id>/skin.json 的 tokens 读取） */
const BG_FALLBACK = 0x0c1513;

export interface UrlOptions { skin: string; debug: boolean; seed: number; speed: number }

export function parseOptions(search: string): UrlOptions {
  const q = new URLSearchParams(search);
  const num = (k: string, d: number): number => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    skin: q.get('skin') || 'default',
    debug: q.get('debug') === '1',
    seed: num('seed', 1),
    speed: num('speed', 1),
  };
}

export async function boot(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('[mono] #stage not found');
  const opts = parseOptions(location.search);

  const defaultSkin = await loadSkin('default');
  const skin = opts.skin === 'default' ? defaultSkin : await loadSkin(opts.skin);
  const geo = skin?.geo ?? defaultSkin?.geo ?? DEFAULT_GEO;
  const tokens = { ...(defaultSkin?.tokens ?? {}), ...(skin?.tokens ?? {}) };

  const stage = await createStage(canvas, { bg: BG_FALLBACK, dpr: window.devicePixelRatio || 2 });
  const scene = new Scene({
    layers: stage.layers,
    geo,
    bg: { color: tokens.bgBottom ?? '#0c1513', alpha: 1 },
    instantiateDeps: { skin, defaultSkin, overrides: null, slotLevels: {} },
  });
  scene.addMany(boardTileSpecs(0, () => null));
  scene.render();

  if (opts.debug) createDebugPanel().mount(document.body);
  (window as unknown as Record<string, unknown>).__monoMain = { stage, scene, opts, geo, skin, VERSION };
}

if (typeof document !== 'undefined') void boot();