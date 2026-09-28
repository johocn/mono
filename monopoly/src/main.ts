import { createStage } from './render/stage';
import { createDebugPanel } from './debug/panel';
import { loadSkin } from './skin/skinLoader';
import { Scene } from './render/Scene';
import { boardCells, boardTileSpecs } from './render/BoardView';
import { innerSpecs, fountainSpec } from './render/InnerView';
import { PAWN_COUNT, pawnSpecs } from './render/PieceView';
import { buildingSpecs, slotLevelsOf, streetPropSpecs } from './render/BuildingView';
import { showcaseSpecs } from './render/ShowcaseView';
import { drawLabels, type LabelParams } from './render/LabelView';
import { autoPlay, createGame, currentPlayer, type Game } from './core/game';
import { hudSpecs, mountHud, type HudActionId, type HudHandle } from './ui/Hud';
import { DEMO_OWNER } from './data/board';
import { DEFAULT_GEO } from './skin/layout';
import { preloadSkinAssets } from './render/assets';
import type { ElementSpec } from './skin/instantiate';

export const VERSION = '0.1.0';

/** 兜底底色（真色值在 M2 起从 skins/<id>/skin.json 的 tokens 读取） */
const BG_FALLBACK = 0x0c1513;

export interface UrlOptions { skin: string; debug: boolean; seed: number; speed: number; show: string; play: boolean }

/** v5 样张 line 63：当前格 index 4（太平温泉）在 (5,9)，四枚棋子同格 */
const CURRENT_INDEX = 4;
const CURRENT_CELL: [number, number] = [5, 9];

/** 字牌排版参数（M2 起固定，drawLabels 的第 4 参） */
const LABEL_PARAMS: LabelParams = { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 };

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
    show: q.get('show') || 'b',
    play: q.get('play') === '1',
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

  /* 图片素材必须同步可用：render() 是同步的，故在此把所有素材先装载进纹理表 */
  const missingAssets = [
    ...(await preloadSkinAssets(defaultSkin, './skins')),
    ...(skin && skin !== defaultSkin ? await preloadSkinAssets(skin, './skins') : []),
  ];

  const stage = await createStage(canvas, { bg: BG_FALLBACK, dpr: window.devicePixelRatio || 2 });
  const scene = new Scene({
    layers: stage.layers,
    geo,
    bg: { color: tokens.bgBottom ?? '#0c1513', alpha: 1 },
    instantiateDeps: { skin, defaultSkin, overrides: null, slotLevels: slotLevelsOf() },
    placement: { pawnGap: 9.6, pawnFrontDy: 1.45, pawnScale: 0.62, buildingScale: 0.72, buildingYOffset: 1 },
    assetBase: './skins',
    skinIds: [...new Set([skin?.id, defaultSkin?.id].filter((v): v is string => Boolean(v)))],
  });

  const ownerOf = (i: number): number | null => DEMO_OWNER[i] ?? null;

  /* v5 样张 line 63：当前格 index 4（太平温泉）在 (5,9)，四枚棋子同格 */
  const demoPawns = Array.from({ length: PAWN_COUNT }, (_, index) => ({
    index, c: CURRENT_CELL[0], r: CURRENT_CELL[1],
  }));

  const game = opts.play ? createGame({ seed: opts.seed }) : null;

  /** 非 play：沿用 M3 的六组演示视图 + 可选橱窗 */
  const demoView = (): ElementSpec[] => {
    const out: ElementSpec[] = [
      ...boardTileSpecs(CURRENT_INDEX, ownerOf),
      ...innerSpecs(),
      fountainSpec(),
      ...buildingSpecs({ ownerOf }),
      ...streetPropSpecs(),
      ...pawnSpecs(demoPawns),
    ];
    if (opts.show === 'b') out.push(...showcaseSpecs({ slot: CURRENT_INDEX, owner: ownerOf(CURRENT_INDEX) }));
    else if (opts.show === 'c') out.push(...showcaseSpecs({ variant: 'c' }));
    return out;
  };

  /** play：地砖归属色 / 当前格 / 棋子位置跟游戏状态联动，再叠 HUD */
  const ownedOf = (i: number): number | null => game?.state.estates[i]?.owner ?? ownerOf(i);
  const playView = (g: Game): ElementSpec[] => {
    const cells = boardCells(geo);
    const alive = g.state.players.filter((p) => !p.bankrupt);
    return [
      ...boardTileSpecs(currentPlayer(g.state).pos, ownedOf),
      ...innerSpecs(),
      fountainSpec(),
      ...buildingSpecs({ ownerOf: ownedOf }),
      ...streetPropSpecs(),
      ...pawnSpecs(alive.map((p) => ({ index: p.id - 1, c: cells[p.pos].c, r: cells[p.pos].r }))),
      ...hudSpecs(g.state),
    ];
  };

  let hud: HudHandle | null = null;

  /** 唯一出画口：清 spec → 组视图 → 渲染 → 标签 → HUD 命中层 */
  const paint = (): void => {
    scene.reset();
    scene.addMany(game ? playView(game) : demoView());
    scene.render();
    drawLabels(stage.layers.labels, geo, {
      bg: tokens.labelBg ?? '#060a08',
      text: tokens.labelText ?? '#d8e4dc',
      ownedText: tokens.labelOwnedText ?? '#ffffff',
      ownerOf: ownedOf,
    }, LABEL_PARAMS);
    hud?.update();
  };

  if (game) {
    hud = mountHud(document.body, game, (a: HudActionId) => {
      if (a === 'roll') game.rollDice();
      else if (a === 'move') game.moveCurrent();
      else if (a === 'settle') game.settleCurrent();
      else if (a === 'buy') game.buyCurrent();
      else if (a === 'upgrade') game.upgradeCurrent();
      else game.endTurn();
      paint();
    });
  }

  paint();

  if (opts.debug) {
    const panel = createDebugPanel();
    panel.mount(document.body);
    panel.mountViews(opts.show, (v) => {
      const next = new URL(location.href);
      next.searchParams.set('show', v);
      location.href = next.toString();
    });
  }

  /** 端到端整局：headless 跑到分出胜负并重画，返回胜者 id（1..4） */
  const sim = (): number => {
    if (!game) throw new Error('[mono] sim 需要 ?play=1');
    const w = autoPlay(game);
    paint();
    return w;
  };

  (window as unknown as Record<string, unknown>).__monoMain = {
    stage, scene, opts, geo, skin, missingAssets, game, paint, sim, VERSION,
  };
}

if (typeof document !== 'undefined') void boot();