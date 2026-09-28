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
import { ipos } from './render/iso';
import { autoPlay, createGame, currentPlayer, type Game, type SettleResult } from './core/game';
import { hudSpecs, mountHud, type HudActionId, type HudHandle } from './ui/Hud';
import { mountPanels, panelSpecs, type PanelActionId, type PanelHandle } from './ui/panels';
import {
  applyMeta, buildShareConfig, initWechatShare, mountShare, resultCopy,
  type ShareHandle,
} from './ui/share';
import { SHARE_VERSION } from './data/share';
import { FATE_DECK, type ItemCardKind } from './data/cards';
import { DEMO_OWNER } from './data/board';
import { STOCK_TILE_INDEX } from './data/stocks';
import { DEFAULT_GEO, FX_FRAMES, FX_LEVELS, FX_NOFX_SPEED } from './skin/layout';
import { preloadSkinAssets } from './render/assets';
import { createFx, motionFor, timeScaleFrom, type FxContext, type FxHandle, type FxKind } from './render/fx';
import type { ElementSpec } from './skin/instantiate';

export const VERSION = '0.1.0';

/** 兜底底色（真色值在 M2 起从 skins/<id>/skin.json 的 tokens 读取） */
const BG_FALLBACK = 0x0c1513;

export interface UrlOptions {
  skin: string; debug: boolean; seed: number; speed: number; show: string; play: boolean;
  /** `?nofx=1`：等价 `speed=999`（动画瞬间到终帧；截图闸门与无障碍用） */
  nofx: boolean;
  /** `?perf=1`：挂性能覆盖层并采样帧间隔 */
  perf: boolean;
}

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
    nofx: q.get('nofx') === '1',
    perf: q.get('perf') === '1',
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

  /* —— M6 动效层：只回放视觉，绝不写 state；一切参数经 skin.fx / layout 注入 —— */
  const fxTokens = (skin ?? defaultSkin)?.fx ?? null;
  const fx: FxHandle = createFx({
    fxLayer: stage.layers.fx,
    make: (id, s) => scene.buildOne({ id, c: 0, r: 0, pass: 4, fixed: { cx: s.cx, cy: s.cy, s: s.s ?? 1 }, state: s.state }),
    motion: (kind: FxKind) => motionFor(kind, fxTokens),
  });
  fx.speed(opts.nofx ? FX_NOFX_SPEED : timeScaleFrom(opts.speed));
  let fxPending = false;

  const ownerOf = (i: number): number | null => DEMO_OWNER[i] ?? null;

  /* v5 样张 line 63：当前格 index 4（太平温泉）在 (5,9)，四枚棋子同格 */
  const demoPawns = Array.from({ length: PAWN_COUNT }, (_, index) => ({
    index, c: CURRENT_CELL[0], r: CURRENT_CELL[1],
  }));

  const game = opts.play ? createGame({ seed: opts.seed }) : null;

  /** 格号 → 屏幕坐标（动效落点用；与 Scene 同一套 iso 变换） */
  const cells = boardCells(geo);
  const cellXY = (index: number): { x: number; y: number } => {
    const cell = cells[((index % cells.length) + cells.length) % cells.length] ?? { c: 0, r: 0 };
    const [x, y] = ipos(cell.c, cell.r, geo);
    return { x, y };
  };

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
    const alive = g.state.players.filter((p) => !p.bankrupt);
    return [
      ...boardTileSpecs(currentPlayer(g.state).pos, ownedOf),
      ...innerSpecs(),
      fountainSpec(),
      ...buildingSpecs({ ownerOf: ownedOf }),
      ...streetPropSpecs(),
      ...pawnSpecs(alive.map((p) => ({ index: p.id - 1, c: cells[p.pos].c, r: cells[p.pos].r }))),
      /* spec §6 版式 A：中部 = 当前玩家落点地块的橱窗（复用 B 版式构图；随 paint() 同步） */
      ...showcaseSpecs({ slot: currentPlayer(g.state).pos, owner: ownedOf(currentPlayer(g.state).pos), play: true }),
      ...hudSpecs(g.state, fxPending || fx.busy()),
      /* M5 浮层：手牌 5 槽常驻 + 抽卡翻牌 / 股票盘 / 结算面板（未触发时为空） */
      ...panelSpecs(g.state),
    ];
  };

  let hud: HudHandle | null = null;
  let panels: PanelHandle | null = null;
  let share: ShareHandle | null = null;

  /** 唯一出画口：清 spec → 组视图 → 渲染 → 标签 → HUD / 浮层命中层 */
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
    panels?.update();
    share?.update();
  };

  /**
   * 动作 → 状态先落库（同步）→ 立即重画（权威画面）→ 动效只回放。
   * `?nofx` / `fx.speed(999)` 时 play() 瞬间到终帧，等价无动画。
   */
  const runAction = (fn: () => unknown, ctxOf: (r: never) => FxContext | null): void => {
    const result = fn();
    const ctx = ctxOf(result as never);
    if (!ctx) {
      fxPending = false;
      paint();
      return;
    }
    fxPending = true;
    paint();
    fx.play(ctx, () => { fxPending = false; paint(); });
  };

  /** 落格结算结果 → 动画上下文（纯映射；位置取自 iso） */
  const settleFx = (r: SettleResult): FxContext | null => {
    const at = cellXY(r.index);
    switch (r.kind) {
      case 'rent': {
        const ownerPos = game?.state.players.find((p) => p.id === r.owner)?.pos ?? r.index;
        const to = cellXY(ownerPos);
        return { kind: 'rent', x: at.x, y: at.y, tx: to.x, ty: to.y };
      }
      case 'fate':
      case 'chance':
      case 'bonus': {
        const d = game?.state.lastDraw;
        return { kind: 'card', title: d?.title ?? FATE_DECK[0].name, text: d?.text ?? FATE_DECK[0].text };
      }
      case 'stock':
        return { kind: 'stock', x: at.x, y: at.y };
      default:
        return null;
    }
  };

  if (game) {
    hud = mountHud(document.body, game, (a: HudActionId) => {
      if (fx.busy()) fx.skip();   // 点屏加速：状态早已落库，跳过只影响观感时长
      if (a === 'roll') runAction(() => game.rollDice(), () => ({ kind: 'dice' }));
      else if (a === 'move') runAction(() => game.moveCurrent(), (r: { from: number; to: number }) => {
        const from = cellXY(r.from); const to = cellXY(r.to);
        return { kind: 'hop', x: from.x, y: from.y, tx: to.x, ty: to.y };
      });
      else if (a === 'settle') runAction(() => game.settleCurrent(), settleFx);
      else if (a === 'buy') runAction(() => game.buyCurrent(), (r: { ok: boolean }) => {
        const at = cellXY(currentPlayer(game.state).pos);
        return r.ok ? { kind: 'buy', x: at.x, y: at.y } : null;
      });
      else if (a === 'upgrade') runAction(() => game.upgradeCurrent(), (r: { ok: boolean; level?: number }) => {
        const at = cellXY(currentPlayer(game.state).pos);
        return r.ok ? { kind: 'upgrade', x: at.x, y: at.y, levels: r.level ?? FX_LEVELS } : null;
      });
      else if (a === 'skip') runAction(() => game.skipTurn(), () => null);
      else runAction(() => game.endTurn(), () => null);
    });
    /* 浮层动作：关浮层 / 股票买卖 / 打手牌（目标由命中区 `data-target` 带出） */
    panels = mountPanels(document.body, game, (a: PanelActionId, target?: number | string) => {
      if (a === 'card:close' || a === 'settle:close') runAction(() => game.clearEvent(), () => null);
      else if (a === 'stock:buy') runAction(() => game.trade(String(target), 1), () => {
        const at = cellXY(STOCK_TILE_INDEX);
        return { kind: 'stock', x: at.x, y: at.y };
      });
      else if (a === 'stock:sell') runAction(() => game.trade(String(target), -1), () => {
        const at = cellXY(STOCK_TILE_INDEX);
        return { kind: 'stock', x: at.x, y: at.y };
      });
      else runAction(() => game.useCard(a.slice('card:'.length) as ItemCardKind, typeof target === 'number' ? target : undefined), () => {
        const at = cellXY(currentPlayer(game.state).pos);
        return { kind: 'deck', x: at.x, y: at.y };
      });
    });
  }

  /* —— M8 分享 / 裂变入口：meta 注入 + 常驻 CTA + 微信 JS-SDK（非微信 / 签名不可用自动降级） —— */
  const overCopy = (): { title: string; desc: string } | null => resultCopy(game?.state ?? null);
  applyMeta(document, buildShareConfig(location.href, SHARE_VERSION, overCopy()));
  share = mountShare(document.body, overCopy, SHARE_VERSION);
  void initWechatShare({ pageHref: location.href, version: SHARE_VERSION, getOver: overCopy })
    .then((b) => {
      share?.setWechat(b);
      (window as unknown as Record<string, unknown>).__monoShareStatus = b.status;
    });
  /* —— M8 结束 —— */

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
    fx.play({ kind: 'end' }, () => paint());
    return w;
  };

  /** M6 闸门用：各 kind 的代表性动效上下文（确定性，便于中间帧截图） */
  const fxPreview = (kind: FxKind): FxContext => {
    const a = cellXY(CURRENT_INDEX);
    const b = cellXY(CURRENT_INDEX + 2);
    const s = cellXY(STOCK_TILE_INDEX);
    switch (kind) {
      case 'dice': return { kind };
      case 'hop': return { kind, x: a.x, y: a.y, tx: b.x, ty: b.y };
      case 'buy': return { kind, x: a.x, y: a.y };
      case 'upgrade': return { kind, x: a.x, y: a.y, levels: FX_LEVELS };
      case 'rent': return { kind, x: a.x, y: a.y, tx: b.x, ty: b.y };
      case 'card': return { kind, title: FATE_DECK[0].name, text: FATE_DECK[0].text };
      case 'deck': return { kind, x: a.x, y: a.y };
      case 'stock': return { kind, x: s.x, y: s.y };
      default: return { kind: 'end' };
    }
  };

  /** `?perf=1`：帧间隔采样 + 绘制元素峰值（spec §11.5 的测量口径） */
  const perf = { firstInteractiveMs: 0, intervals: [] as number[], maxDraw: 0, budget: { interactiveMs: 3000, frameP95Ms: 20, draw: 200 } };
  if (opts.perf) {
    const overlay = document.createElement('div');
    overlay.id = 'mono-perf';
    overlay.style.cssText = 'position:fixed;left:4px;top:4px;z-index:20;font:11px monospace;color:#9fe;background:rgba(0,0,0,.5);padding:2px 4px;border-radius:4px';
    document.body.appendChild(overlay);
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = now - last;
      last = now;
      perf.intervals.push(dt);
      const st = scene.stats();
      if (st.total > perf.maxDraw) perf.maxDraw = st.total;
      /* scene = pass 1–3 场景绘制元素数（< 200 预算口径）；total = 含 pass 4 屏幕空间 HUD/浮层
         的整帧元素实例数（非 GPU draw call，Pixi 会同状态合批），单列避免与预算口径混淆 */
      const sceneDraw = st.perPass[1] + st.perPass[2] + st.perPass[3];
      overlay.textContent = `fps ${Math.round(1000 / dt)} · scene ${sceneDraw} · total ${st.total}`;
      if (perf.intervals.length < FX_FRAMES) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  perf.firstInteractiveMs = performance.now();

  (window as unknown as Record<string, unknown>).__monoMain = {
    stage, scene, opts, geo, skin, missingAssets, game, paint, sim, fx, fxPreview, perf, VERSION,
  };
}

if (typeof document !== 'undefined') void boot();