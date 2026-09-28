import { createStage } from './render/stage';
import { createDebugPanel } from './debug/panel';
import { loadSkin } from './skin/skinLoader';
import { Scene } from './render/Scene';
import { boardTileSpecs } from './render/BoardView';
import { innerSpecs, fountainSpec } from './render/InnerView';
import { PAWN_COUNT, pawnSpecs } from './render/PieceView';
import { drawLabels } from './render/LabelView';
import { ipos } from './render/iso';
import { DEFAULT_GEO } from './skin/layout';

export const VERSION = '0.1.0';

/** 兜底底色（真色值在 M2 起从 skins/<id>/skin.json 的 tokens 读取） */
const BG_FALLBACK = 0x0c1513;

export interface UrlOptions { skin: string; debug: boolean; seed: number; speed: number }

/** v5 样张 line 63：当前格 index 4（太平温泉）在 (5,9)，四枚棋子同格 */
const CURRENT_INDEX = 4;
const CURRENT_CELL: [number, number] = [5, 9];

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
    placement: { pawnGap: 9.6, pawnFrontDy: 1.45, pawnScale: 0.62, buildingScale: 0.72, buildingYOffset: 1 },
  });

  const ownerOf = (): number | null => null;
  const [cellX, cellY] = ipos(CURRENT_CELL[0], CURRENT_CELL[1], geo);
  const demoPawns = Array.from({ length: PAWN_COUNT }, (_, index) => ({
    index, c: CURRENT_CELL[0], r: CURRENT_CELL[1], x: cellX, y: cellY,
  }));

  scene.addMany([
    ...boardTileSpecs(CURRENT_INDEX, ownerOf),
    ...innerSpecs(),
    fountainSpec(),
    ...pawnSpecs(demoPawns, geo, { gap: 9.6, frontDy: 1.45 }),
  ]);
  scene.render();

  drawLabels(stage.layers.labels, geo, {
    bg: tokens.labelBg ?? '#060a08',
    text: tokens.labelText ?? '#d8e4dc',
    ownedText: tokens.labelOwnedText ?? '#ffffff',
    ownerOf,
  }, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });

  if (opts.debug) createDebugPanel().mount(document.body);
  (window as unknown as Record<string, unknown>).__monoMain = { stage, scene, opts, geo, skin, VERSION };
}

if (typeof document !== 'undefined') void boot();