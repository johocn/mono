import { createStage } from './render/stage';
import { createDebugPanel } from './debug/panel';

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
  const stage = await createStage(canvas, {
    bg: BG_FALLBACK,
    dpr: window.devicePixelRatio || 2,
  });
  if (opts.debug) createDebugPanel().mount(document.body);
  (window as unknown as Record<string, unknown>).__monoMain = { stage, opts, VERSION };
}

if (typeof document !== 'undefined') void boot();