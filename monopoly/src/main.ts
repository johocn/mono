import { createStage } from './render/stage';
import { createDebugPanel } from './debug/panel';
import { createThemeConsole, type ThemeConsoleHandle } from './ui/themeConsole';
import { loadSkin } from './skin/skinLoader';
import { Scene } from './render/Scene';
import type { PlacementOpts } from './render/Scene';
import { boardCells, boardTileSpecs } from './render/BoardView';
import { innerSpecs, fountainSpec } from './render/InnerView';
import { atmosphereSpecs } from './render/AtmosphereView';
import { PAWN_COUNT, pawnSpecs, type PawnMood, type PawnState } from './render/PieceView';
import { bubbleOfStep, bubbleSpecs, type BubbleContent } from './render/BubbleView';
import { buildingSpecs, slotLevelsOf, streetPropSpecs } from './render/BuildingView';
import { showcaseSpecs } from './render/ShowcaseView';
import { drawLabels } from './render/LabelView';
import { ipos } from './render/iso';
import { autoPlay, createGame, currentPlayer, type Game, type SettleResult } from './core/game';
import { applyStep, type AiStep } from './core/ai';
import { pathIndices, type Advance } from './core/board-path';
import { bboxOf, choreography, frameFor, type CamPose, type Cell, type ChoreographyOpts, type View } from './core/framing';
import { createCamera } from './render/camera';
import { hudSpecs, mountHud, type HudActionId, type HudHandle } from './ui/Hud';
import { mountPanels, overlayOf, panelSpecs, type PanelActionId, type PanelHandle } from './ui/panels';
import { createAiDriver, type AiDriver } from './ui/aiDriver';
import { createAudioEngine } from './ui/audio';
import { mountSetup, readPlan, resolveSeats, type SeatPlan } from './ui/setup';
import { mountSlots, parseSlotConfig, SLOT_DEFAULTS, type SlotConfig, type SlotsHandle } from './ui/slots';
import { isDone, mountTutorial, shouldShowTutorial, type TutorialHandle } from './ui/tutorial';
import { parsePersonaList, type Persona, type Seat } from './data/ai';
import {
  applyMeta, buildShareConfig, initWechatShare, mountShare, resultCopy,
  type ShareHandle,
} from './ui/share';
import { SHARE_VERSION } from './data/share';
import { FATE_DECK, type ItemCardKind } from './data/cards';
import { DEMO_OWNER, PLAYER_NAME } from './data/board';
import { STOCK_TILE_INDEX } from './data/stocks';
import { BUILDING_SCALE, BUILDING_Y_OFFSET, BUBBLE_HOLD_MS, BUBBLE_MOVE_HOLD_MS, CAM_AI_SCALE, CAM_BACK_MS, CAM_FALLBACK_MAX_ZOOM, CAM_FOLLOW_ZOOM, CAM_IDLE_ZOOM, CAM_MAX_ZOOM, CAM_MIN_ZOOM, CAM_PUSH_MS, CAM_SETTLE_MS, CAM_TILE_PAD, CAM_VIEW_CX, CAM_VIEW_CY, CAM_VIEW_H, CAM_VIEW_W, DEFAULT_GEO, FX_FRAMES, FX_LEVELS, FX_NOFX_SPEED, LABEL_GROUND, STAGE_H, STAGE_W, UI_BREAK_W } from './skin/layout';
import { SHOP_DEFAULTS, parseShopConfig, type ShopConfig } from './skin/shop-config';
import { allElementIds } from './skin/registry';
import {
  EMPTY_THEME, compileTheme, forcePalette, mergePatches, parseTheme,
  type Theme,
} from './skin/theme';
import { preloadRelative, preloadSkinAssets } from './render/assets';
import { createFx, motionFor, timeScaleFrom, type FxContext, type FxHandle, type FxKind } from './render/fx';
import type { ElementSpec, InstantiateDeps } from './skin/instantiate';

export const VERSION = '0.1.0';

/** 兜底底色（真色值在 M2 起从 skins/<id>/skin.json 的 tokens 读取） */
const BG_FALLBACK = 0x0c1513;

export interface UrlOptions {
  skin: string; debug: boolean; seed: number; speed: number; show: string;
  /** 默认 true（进站即交互局）；`?demo=1` / `?play=0` 为显式反义，不单独暴露字段 */
  play: boolean;
  /** `?nofx=1`：等价 `speed=999`（动画瞬间到终帧；截图闸门与无障碍用） */
  nofx: boolean;
  /** `?perf=1`：挂性能覆盖层并采样帧间隔 */
  perf: boolean;
  /** `?cam=0`：相机取景总回退（spec §7 总回退开关）；缺省开启 */
  cam: boolean;
  /** `?humans=1..4`：真人数；缺省（undefined）= 先弹开局面板（spec §6） */
  humans?: number;
  /** `?ai=conservative,aggressive,speculative`：AI 席位性格序列（与 humans 搭配） */
  ai: Persona[];
  /** `?tour=1` 强制引导 / `?tour=0` 关闭；缺省 = 首访自动弹一次（spec §7.1） */
  tour?: boolean;
  /** `?audio=0`：一键全静音（开关初始全关且**不创建** `AudioContext`）；缺省 = 有声（spec §8.2） */
  audio: boolean;
  /** `?theme=off` 关掉 `config/theme.json` 出厂配色；`?theme=<paletteId>` 强制整体套色（spec §4 调试通路） */
  theme?: string;
}

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
    show: q.get('show') || 'b',
    /* 默认即交互局（design §3.1）：裸链接 = 进站即玩；`?demo=1` 或 `?play=0` 回演示棋盘 */
    play: q.get('demo') !== '1' && q.get('play') !== '0',
    nofx: q.get('nofx') === '1',
    perf: q.get('perf') === '1',
    /* 相机取景（spec §7）：`?cam=0` 总回退；裸链接 / `?cam=1` 一律开启 */
    cam: q.get('cam') !== '0',
    /* AI 对手 + 新手引导（spec §6/§7）：`humans` 需 1..4 才采纳（`num()` 是「>0 才采纳」，口径不同） */
    humans: (() => {
      const v = Number(q.get('humans'));
      return Number.isInteger(v) && v >= 1 && v <= 4 ? v : undefined;
    })(),
    ai: parsePersonaList(q.get('ai')),
    tour: q.get('tour') === '1' ? true : q.get('tour') === '0' ? false : undefined,
    /* 音频（spec §8.2）：`?audio=0` 一键全静音；裸链接 / `?audio=1` 一律有声 */
    audio: q.get('audio') !== '0',
    /* 风格调试（spec §4）：`?theme=off` 关掉 theme.json；`?theme=<paletteId>` 强制整体套色 */
    theme: q.get('theme') ?? undefined,
  };
}

/**
 * `localStorage` 包装：隐私模式 / 禁用 Cookie 下**属性访问本身**会抛，故不能直接传 `window.localStorage`
 * （引擎只在 `readPrefs` / `writePrefs` 内部 try/catch，挡不住取值这一步）。与 `setup.ts` 同规。
 */
function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/**
 * 商家配置（商业闭环·阶段一）：相对路径读取，缺失 / 404 / 坏 JSON 一律回退 `SHOP_DEFAULTS`
 * —— 零变化、不抛错（design §6.3/§6.4）。
 */
async function loadShopConfig(): Promise<ShopConfig> {
  try {
    const res = await fetch('./config/shops.json', { cache: 'no-cache' });
    if (!res.ok) return SHOP_DEFAULTS;
    return parseShopConfig(await res.json());
  } catch {
    return SHOP_DEFAULTS;
  }
}

/**
 * 棋盘右上三角内容位配置：相对路径读取，缺失 / 404 / 坏 JSON 一律回退 `SLOT_DEFAULTS`
 * —— 该位永不空着，且不抛错。
 */
async function loadSlotConfig(): Promise<SlotConfig> {
  try {
    const res = await fetch('./config/board-slots.json', { cache: 'no-cache' });
    if (!res.ok) return SLOT_DEFAULTS;
    return parseSlotConfig(await res.json());
  } catch {
    return SLOT_DEFAULTS;
  }
}

/**
 * 主题配置（spec §4）：相对路径读取，缺失 / 404 / 坏 JSON 一律回退空主题
 * —— 空主题下 `compileTheme` 产出 `{}`，渲染结果与改造前逐像素一致。
 */
async function loadThemeConfig(): Promise<Theme> {
  try {
    const res = await fetch('./config/theme.json', { cache: 'no-cache' });
    if (!res.ok) return EMPTY_THEME;
    return parseTheme(await res.json());
  } catch {
    return EMPTY_THEME;
  }
}

/** 把 390×844 逻辑舞台等比缩放到视口内并居中。
 *  只作用于 `#mono-world`（画布）；DOM 覆盖层由 `fitUi()` 单独适配，故命中区与视觉不再错位。
 *  修复三件事：① 旧版画布 `margin:0 auto` 居中、覆盖层却 `position:fixed` 靠屏幕左边，
 *  视口宽 ≠ 390 时命中区整体左偏 (视口宽-390)/2；② 视口窄于 390 时画布右侧（棋盘右角）被裁；
 *  ③ 宽视口下舞台不再贴左上角，而是居中留边。390×844 视口下 k=1、位移为 0，与改动前逐像素一致。 */
function fitStage(): void {
  const fit = document.getElementById('mono-world');
  if (!fit) return;
  const k = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const dx = Math.max(0, (window.innerWidth - STAGE_W * k) / 2);
  const dy = Math.max(0, (window.innerHeight - STAGE_H * k) / 2);
  fit.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
}

/** DOM 覆盖层的适配（spec §6 P0 第 2 项）：与画布分开算 k。
 *  - 桌面宽屏（`vw ≥ UI_BREAK_W`）只跟高（`k = vh/844`），UI 不因横向留白被一起缩小；
 *    此分支在真实桌面比例下与旧 `min()` 数值相同，故无可见变化。
 *  - 窄屏沿用 `min()`，与 `fitStage()` 同源，覆盖层仍与画布对齐。
 *  两种分支都居中，命中区始终与画布同一坐标系。 */
function fitUi(): void {
  const ui = document.getElementById('mono-ui');
  if (!ui) return;
  const k = window.innerWidth >= UI_BREAK_W
    ? window.innerHeight / STAGE_H
    : Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const dx = Math.max(0, (window.innerWidth - STAGE_W * k) / 2);
  const dy = Math.max(0, (window.innerHeight - STAGE_H * k) / 2);
  ui.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
}

/** 两个 fit 必须同时触发：画布与覆盖层是两个独立层（resize / 转屏） */
function fitAll(): void { fitStage(); fitUi(); }

export async function boot(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('[mono] #stage not found');
  fitAll();
  window.addEventListener('resize', fitAll);
  window.addEventListener('orientationchange', fitAll);
  /** 覆盖层统一挂点（spec：HUD / 浮层 / 引导 / 开局 / 分享 与画布同源，共用 fitUi 的缩放） */
  const fitRoot = document.getElementById('mono-ui') ?? document.body;
  const opts = parseOptions(location.search);

  const defaultSkin = await loadSkin('default');
  const skin = opts.skin === 'default' ? defaultSkin : await loadSkin(opts.skin);
  const geo = skin?.geo ?? defaultSkin?.geo ?? DEFAULT_GEO;
  const tokens = { ...(defaultSkin?.tokens ?? {}), ...(skin?.tokens ?? {}) };

  /* —— M11 音效与音乐（spec §3 / §9）：此处置装配，但**不建 `AudioContext`**——等首次手势解锁 —— */
  const audio = createAudioEngine({ storage: safeStorage(), forceMute: !opts.audio });
  audio.applySound((skin ?? defaultSkin)?.sound ?? null);
  /* 首次手势解锁（spec §9）：capture + once，开局面板「开始」/ HUD 点击都算解锁点 */
  window.addEventListener('pointerdown', () => { audio.unlock(); }, { capture: true, once: true });
  /* spec §8.2：`?nofx` 只静音**音效**（BGM 仍由音乐键控制）——见本 Task 顶部「第四处澄清」 */
  const sfxOn = !opts.nofx;

  /* 图片素材必须同步可用：render() 是同步的，故在此把所有素材先装载进纹理表 */
  const missingAssets = [
    ...(await preloadSkinAssets(defaultSkin, './skins')),
    ...(skin && skin !== defaultSkin ? await preloadSkinAssets(skin, './skins') : []),
  ];

  /* —— 商家配置（商业闭环·阶段一「静态认领」）：overrides 落回退链第 1 级 + 文案注入 —— */
  const shops = await loadShopConfig();
  /* —— 三角内容位配置（右上轮播：插画 / 规则小贴士 / 广告）：缺失即回退内建贴士 —— */
  const slotCfg = await loadSlotConfig();
  /* 商家图片与皮肤包同源解析（相对皮肤包目录），必须在建场景前按同一套 skinIds 预装载；
     缺失只在 missingAssets 留痕，绝不抛错（缺素材逐级回退） */
  const skinPackIds = [...new Set([skin?.id, defaultSkin?.id].filter((v): v is string => Boolean(v)))];
  const missingShopImages = await preloadRelative(shops.images, skinPackIds, './skins');
  missingAssets.push(...missingShopImages.map((rel) => `./skins/*/${rel}`));

  /* —— 主题装配（spec §4）：出厂配色来自 config/theme.json；`?theme=off` 整体关闭 ——
     `?theme=<paletteId>` 只强制套色（params），preset 仍由 bindings 决定，故必须深合并。
     补丁只叠在 L2/L3/L4 之上：商家实拍（L1）永远赢，见 instantiate()。 */
  const theme = await loadThemeConfig();
  const ids = allElementIds();
  const forced = opts.theme && opts.theme !== 'off' ? forcePalette(theme, opts.theme, ids) : {};
  const themePatch = opts.theme === 'off' ? null : mergePatches(compileTheme(theme, ids), forced);

  const stage = await createStage(canvas, { bg: BG_FALLBACK, dpr: window.devicePixelRatio || 2 });
  /* —— 相机（spec §5.2）：`world` 容器变换，与画布自身的页适配（`fitStage`）互不干涉 —— */
  const camera = createCamera({ world: stage.world });
  /** 相机是否介入（spec §7 总回退 / §8 V19）：
   *  `?cam=0` 关掉全部取景；`?nofx=1` 下时轴 = 999，补间会瞬间到位并**停在近景**，
   *  违背「nofx 下恒 1.0」，故一并禁用（等价于「无动效即无取景」）。 */
  const camOn = opts.cam && !opts.nofx;
  /* 倍率上限（spec §7 R3）：`?perf=1` 实测帧超预算时降到 `CAM_FALLBACK_MAX_ZOOM` */
  const camMax = { zoom: CAM_MAX_ZOOM };
  /* 地块序号 → 建筑层级（与楼体、楼顶名牌同源一份） */
  const slotLevels = slotLevelsOf();
  /* 台位（唯一一份）：Scene 构造与「气泡锚在棋子头顶」共用同一组参数 */
  const PLACEMENT: PlacementOpts = {
    pawnGap: 9.6, pawnFrontDy: 1.45, pawnScale: 0.62,
    buildingScale: BUILDING_SCALE, buildingYOffset: BUILDING_Y_OFFSET,
  };
  /* 主题补丁挂在一个**可变对象**上：`?debug=1` 的风格控制台就地改写 `theme` 字段即可实时预览（spec §9） */
  const instantiateDeps: InstantiateDeps = {
    skin, defaultSkin, overrides: shops.overrides, theme: themePatch, slotLevels,
  };
  const scene = new Scene({
    layers: stage.layers,
    geo,
    bg: { color: tokens.bgBottom ?? '#0c1513', alpha: 1 },
    instantiateDeps,
    /* 台位（唯一一份）：Scene 的落位与「气泡锚在棋子头顶」共用，改这里即两处同步 */
    placement: PLACEMENT,
    assetBase: './skins',
    skinIds: skinPackIds,
  });

  /* —— M6 动效层：只回放视觉，绝不写 state；一切参数经 skin.fx / layout 注入 —— */
  const fxTokens = (skin ?? defaultSkin)?.fx ?? null;
  const fx: FxHandle = createFx({
    fx: { world: stage.layers.fxWorld, ui: stage.layers.fxUi },
    make: (id, s) => scene.buildOne({ id, c: 0, r: 0, pass: 4, fixed: { cx: s.cx, cy: s.cy, s: s.s ?? 1 }, state: s.state }),
    motion: (kind: FxKind) => motionFor(kind, fxTokens),
  });
  /* 时轴唯一一份（spec §5.2 G6）：`fx.speed()` 实现即 `gsap.globalTimeline.timeScale()`，
     相机沿用同一份全局时轴，故 `?speed=` / `?nofx=1` 天然同时作用于两者；这里的并联是显式声明。 */
  const timeScale = opts.nofx ? FX_NOFX_SPEED : timeScaleFrom(opts.speed);
  fx.speed(timeScale);
  camera.setTimeScale(timeScale);
  let fxPending = false;

  /* —— 棋子三表情（spec §6.6）：动作类型 → mood；`fx` 结束回落 calm（只读状态，不改动画） —— */
  const MOOD_BY_FX: Partial<Record<FxKind, PawnMood>> = { buy: 'happy', upgrade: 'happy', rent: 'sad', end: 'sad' };
  /** 无动效的动作（如进监狱）也能出表情：由落库事件兜底 */
  const MOOD_BY_EVENT = (e: { kind: string } | null | undefined): PawnMood => (e?.kind === 'jail' ? 'sad' : 'calm');
  let mood: PawnMood = 'calm';
  /** 停留事件气泡（spec §6.7）：一次性出现、`fx` 结束时消失（与 mood 同一生命周期） */
  let bubble: BubbleContent | null = null;
  /** 无动效的停留事件（如进监狱）没有 `fx` 结束回调可用，靠这个定时器收起气泡 */
  let bubbleTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 气泡的唯一起落口：`holdMs > 0` 走定时器收起（无动效事件），`0` 交给 `fx.play` 的结束回调。
   * 两者互斥——先清掉上一枚定时器，避免上一枚把新气泡提前抹掉。
   */
  const setBubble = (content: BubbleContent | null, holdMs: number): void => {
    if (bubbleTimer !== null) { clearTimeout(bubbleTimer); bubbleTimer = null; }
    bubble = content;
    if (content && holdMs > 0) {
      bubbleTimer = setTimeout(() => { bubbleTimer = null; bubble = null; paint(); }, holdMs);
    }
  };

  const ownerOf = (i: number): number | null => DEMO_OWNER[i] ?? null;

  /* v5 样张 line 63：当前格 index 4（太平温泉）在 (5,9)，四枚棋子同格（P1 亮光晕，便于对照） */
  const demoPawns = Array.from({ length: PAWN_COUNT }, (_, index) => ({
    index, c: CURRENT_CELL[0], r: CURRENT_CELL[1], active: index === 0,
  }));

  /* 席位归属：`?humans=` → localStorage → 弹开局面板（spec §6：选完再 createGame，故 game 惰性创建） */
  const planned = opts.play ? resolveSeats(opts) : null;
  let seats: Seat[] = opts.play ? (planned ?? [null, null, null, null]) : [];
  let game: Game | null = null;
  let driver: AiDriver | null = null;

  /** 格号 → 屏幕坐标（动效落点用；与 Scene 同一套 iso 变换） */
  const cells = boardCells(geo);
  const cellXY = (index: number): { x: number; y: number } => {
    const cell = cells[((index % cells.length) + cells.length) % cells.length] ?? { c: 0, r: 0 };
    const [x, y] = ipos(cell.c, cell.r, geo);
    return { x, y };
  };

  /* —————————————— 相机取景编排（spec §4 触发时机表 / §6 P1 第 11 项） ——————————————
     相机是**纯视觉层**：只读 state、绝不写 state（与 `fx` 同一原则，spec §10）。
     一切取景都经这里算出「一次动作前 / 后各做什么」，再由 `runAction` 在 fx 的同一时轴上调用。 */

  /** 取景视口（舞台空间）：顶带 HUD 之下、底坞之上（spec §3.4） */
  const CAM_VIEW: View = { w: CAM_VIEW_W, h: CAM_VIEW_H, cx: CAM_VIEW_CX, cy: CAM_VIEW_CY };
  /** 取景参数包（`camMax` 是变量：R3 降级档会把它调低，故每次取值而不是快照） */
  const camRange = (): ChoreographyOpts => ({
    min: CAM_MIN_ZOOM, max: camMax.zoom, follow: CAM_FOLLOW_ZOOM, pad: CAM_TILE_PAD,
  });

  /** 格号 → 棋盘格坐标（取景用；与 `cellXY` 同一份 cells 表） */
  const cellAt = (index: number): Cell => {
    const cell = cells[((index % cells.length) + cells.length) % cells.length] ?? { c: 0, r: 0 };
    return [cell.c, cell.r];
  };

  /** 一组格 → 取景位姿（`bboxOf` 已含格足 + `CAM_TILE_PAD` 外扩） */
  const frameCells = (cs: readonly Cell[]): CamPose =>
    frameFor(bboxOf(cs, CAM_TILE_PAD, geo), CAM_VIEW, CAM_MIN_ZOOM, camMax.zoom);

  /** 该格 ∪ 环上前后各 1 格（买地 / 升级的「3 格取景」，spec §4） */
  const aroundCell = (index: number): Cell[] => [cellAt(index - 1), cellAt(index), cellAt(index + 1)];

  /** 一次动作的取景计划：`before` 在动效起播前调用，`after` 在动效结束时调用 */
  interface CamPlan { before: () => void; after?: () => void }

  /**
   * 动作 → 取景计划（`null` = 本次不动相机）。
   *
   * 两条必须遵守的规则（spec §4）：
   * 1. **取景禁区**：任一浮层（`#mono-panels`）展开时不再推近（避免与面板边缘视差抖动）；
   *    归位（`reset`）不受限——面板关闭后必须能收回全景。
   * 2. **AI 回合**全部时长 × `CAM_AI_SCALE`（按**动作前**的席位判定：`state.current` 要到
   *    `endTurn` 才换人，故 settle / buy / upgrade 仍属本回合）。
   */
  const camPlanOf = (step: AiStep, result: unknown): CamPlan | null => {
    const st = game?.state;
    if (!st || !camOn) return null;
    const open = overlayOf(st) !== null;
    const ai = (seats[st.current] ?? null) !== null;
    const ms = (v: number): number => (ai ? v * CAM_AI_SCALE : v);
    /** 推近（禁区时跳过） */
    const push = (pose: CamPose, dur: number): void => { if (!open) camera.to(pose, ms(dur)); };

    switch (step.kind) {
      case 'roll': {
        /* 骰子已定 ⇒ 本次路径已知：把「轻推」（spec §4 掷骰行）与 ① 起势合并进掷骰动效窗口，
           于是跟拍段能整段与 `fx` 的 hop 共时轴（hop 是单段位移，见 `camPlanOf('move')` 注释）。 */
        const total = (result as { total?: number } | null)?.total ?? 0;
        const path = pathIndices(currentPlayer(st).pos, total).map(cellAt);
        return { before: () => push(frameCells(path), CAM_PUSH_MS) };
      }
      case 'move': {
        /* ② 跟拍：与 `fx` 的 hop **同起同止**。注意 `fx` 的 hop 是「起点 → 落点」的**单段**位移
           （时长 `FX_HOP_MS`，不是逐格 × 格数），故这里只取首尾两格、时长取 fx 自身的 hop 时长，
           否则立即与棋子脱同步（spec §3.2 的「逐格 × (格数−1)」按实现落地为此形态）。 */
        const mv = result as Advance;
        const seq = pathIndices(mv.from, mv.steps).map(cellAt);
        const hopMs = motionFor('hop', fxTokens).durationMs;
        /* ③ 落点：`choreography` 的末帧（落点 ∪ 前 1 ∪ 后 1，退化规则由纯函数内部判定） */
        const keys = choreography(seq, geo, CAM_VIEW, camRange());
        const settle = keys[keys.length - 1]?.pose ?? frameCells([cellAt(mv.to)]);
        return {
          before: () => { if (!open) camera.follow([seq[0] ?? cellAt(mv.from), cellAt(mv.to)], hopMs, geo); },
          after: () => push(settle, CAM_SETTLE_MS),
        };
      }
      case 'settle': {
        const r = result as SettleResult;
        /* 面板期不取景（spec §4）：抽卡 / 命运 / 股票盘会盖住取景区，取景纯浪费且干扰读数 ⇒ 回全景。
           `overlayOf` 此刻已非 null（`lastDraw` / 股票格），故必须**绕过禁区**直接 `reset`。 */
        if (r.kind === 'fate' || r.kind === 'chance' || r.kind === 'bonus' || r.kind === 'stock') {
          return { before: () => camera.reset(ms(CAM_BACK_MS)) };
        }
        /* 收租：收租格 ∪ 地主格 的并集取景；其余落格结果保持 ③ 落点不动 */
        if (r.kind === 'rent') {
          const ownerPos = st.players.find((p) => p.id === r.owner)?.pos ?? r.index;
          return { before: () => push(frameCells([cellAt(r.index), cellAt(ownerPos)]), CAM_SETTLE_MS) };
        }
        return null;
      }
      case 'buy':
      case 'upgrade': {
        if (!(result as { ok?: boolean } | null)?.ok) return null;   // 失败无 fx（spec §5.3）→ 也不取景
        const at = currentPlayer(st).pos;
        return { before: () => push(frameCells(aroundCell(at)), CAM_SETTLE_MS) };
      }
      case 'close':
      case 'end':
      case 'skip':
        /* 归位（spec §4 首屏行：`idle` 相位恒等 zoom = 1，即 G5）：
           浮层关闭 / 回合结束 / 跳过回合一落到下一位玩家的 `idle` 相位就该收回全景，
           否则下一位真人等待操作时画面还停在上一位的落点近景。 */
        return { before: () => camera.reset(ms(CAM_BACK_MS)) };
      default:
        return null;   // card / trade：沿用当前取景
    }
  };

  /** 非 play：沿用 M3 的六组演示视图 + 可选橱窗 */
  const demoView = (): ElementSpec[] => {
    const out: ElementSpec[] = [
      ...boardTileSpecs(CURRENT_INDEX, ownerOf),
      ...innerSpecs(),
      fountainSpec(),
      ...buildingSpecs({ ownerOf, brandOf: shops.brandAt }),
      ...streetPropSpecs(),
      ...pawnSpecs(demoPawns),
    ];
    if (opts.show === 'b') out.push(...showcaseSpecs({ slot: CURRENT_INDEX, owner: ownerOf(CURRENT_INDEX), brandOf: shops.brandAt }));
    else if (opts.show === 'c') out.push(...showcaseSpecs({ variant: 'c', brandOf: shops.brandAt }));
    return out;
  };

  /* —— 手牌抽屉 / 落地地块卡的运行时可见性（spec §7.2/§7.3）—— */
  let handOpen = false;
  /** 抽屉展开态：教程期间强制展开（第 3 步要亮 5 个槽）；AI 回合自动收起（该区位被「加速 / 跳过」占用） */
  const handOpenEff = (): boolean =>
    (handOpen || tutorial !== null) && !(seats[game?.state.current ?? 0] ?? null);
  /** 地块卡：仅「真人回合 + 停在格结算态 + 无浮层 + 抽屉收起」滑入（非常驻；互斥于抽屉，两者台位重叠） */
  const tileCardOn = (g: Game): boolean =>
    g.state.phase === 'settled' && overlayOf(g.state) === null
    && !handOpenEff() && !(seats[g.state.current] ?? null);

  /** play：地砖归属色 / 当前格 / 棋子位置跟游戏状态联动，再叠 HUD */
  const ownedOf = (i: number): number | null => game?.state.estates[i]?.owner ?? ownerOf(i);
  /** 顶部状态条 + 左下战报的同一份文案：「谁 · 做了什么」（无气泡时为 null，两处各自回退默认显示） */
  const calloutOf = (g: Game | null): string | null =>
    g && bubble ? `${PLAYER_NAME[currentPlayer(g.state).id - 1]} ${bubble.title} · ${bubble.amount}` : null;
  const playView = (g: Game): ElementSpec[] => {
    const alive = g.state.players.filter((p) => !p.bankrupt);
    const curId = currentPlayer(g.state).id;
    const pawnStates: PawnState[] = alive.map((p) => ({
      index: p.id - 1, c: cells[p.pos].c, r: cells[p.pos].r,
      mood: p.id === curId ? mood : 'calm',
      active: p.id === curId,
    }));
    /* 顶部状态条播报：气泡在场时把「谁 · 做了什么」也搬到屏幕顶部（小屏上头顶气泡可能被棋盘元素压住） */
    const callout = calloutOf(g) ?? undefined;
    return [
      ...boardTileSpecs(currentPlayer(g.state).pos, ownedOf),
      ...innerSpecs(),
      fountainSpec(),
      ...buildingSpecs({ ownerOf: ownedOf, brandOf: shops.brandAt }),
      ...streetPropSpecs(),
      ...pawnSpecs(pawnStates),
      /* 停留事件气泡（spec §6.7）：当前玩家棋子头顶，跟 pawnSpecs 同一分组口径 */
      ...bubbleSpecs(pawnStates, bubble, geo, PLACEMENT),
      /* spec §7.2：play 版式不再常驻中部橱窗（`?show=b|c` 演示版式完整保留），
         中部条带交给环境层近景街市带；落地时由地块卡（`ui.tileCard`）滑入 */
      ...hudSpecs(g.state, fxPending || fx.busy(), seats, driver?.isFast() ?? false, audio.prefs(),
        { tileCard: tileCardOn(g), handOpen: handOpenEff(), callout }),
      /* M5 浮层：手牌抽屉（默认收起）+ 抽卡翻牌 / 股票盘 / 结算面板（未触发时为空） */
      ...panelSpecs(g.state, handOpenEff()),
    ];
  };

  let hud: HudHandle | null = null;
  let panels: PanelHandle | null = null;
  let share: ShareHandle | null = null;
  let slots: SlotsHandle | null = null;

  /** 唯一出画口：清 spec → 组视图 → 渲染 → 标签 → HUD / 浮层命中层 */
  const paint = (): void => {
    if (game?.state.over) audio.stopBgm();   // spec §6.2：结算即停 BGM（幂等，重复调用无副作用）
    scene.reset();
    /* 环境层（夜空/星/月/远山/街市/街灯/灯笼串）：静态底遍，插在最前 ⇒ 压在所有棋盘元素之下 */
    scene.addMany(atmosphereSpecs());
    if (game) scene.addMany(playView(game));
    else if (!opts.play) scene.addMany(demoView());
    scene.render();
    drawLabels(stage.layers.labels, geo, {
      bg: tokens.labelBg ?? '#060a08',
      text: tokens.labelText ?? '#d8e4dc',
      ownedText: tokens.labelOwnedText ?? '#ffffff',
      ownerOf: ownedOf,
      textOf: shops.shortAt,
      /* 楼顶名牌（spec §6.2）：有楼浮上楼顶，无楼回落到地面字牌 */
      levelOf: (i) => slotLevels[i],
      /* 当前格三重标记（spec §6.3）：放大 1.25× + 金描边 + 指示三角 */
      currentSlot: game ? currentPlayer(game.state).pos : undefined,
    }, LABEL_GROUND);
    hud?.update();
    panels?.update();
    share?.update();
    slots?.update(calloutOf(game));
  };

  /**
   * 动作 → 状态先落库（同步）→ 立即重画（权威画面）→ 动效只回放。
   * `?nofx` / `fx.speed(999)` 时 play() 瞬间到终帧，等价无动画。
   * `bubbleOf` 从动作结果（`applyStep` 返回值）推气泡文案，随 fx 结束清空（spec §6.7）。
   */
  const runAction = (
    fn: () => unknown,
    ctxOf: (r: never) => FxContext | null,
    withFx = true,
    bubbleOf?: (r: unknown) => BubbleContent | null,
    camOf?: (r: unknown) => CamPlan | null,
  ): void => {
    const result = fn();
    const ctx = withFx ? ctxOf(result as never) : null;
    /* 取景与动效同生命周期：`before` 随动效起播、`after` 随动效结束（无动效时两者紧邻）。
       `withFx=false`（跳过本次）时相机完全不介入——aiDriver 收尾会直接 snap 归位。 */
    const cam = withFx ? (camOf?.(result) ?? null) : null;
    /* 气泡文案与动效同源：有动效 → 随 `fx` 结束收起；无动效（如进监狱）→ 定时器兜底收起。
       前进播报例外：hop 只有 ~320ms，随 fx 收起读不完，改由 `BUBBLE_MOVE_HOLD_MS` 定时器收起。 */
    const content = withFx ? (bubbleOf?.(result) ?? null) : null;
    const reportHold = ctx && content?.tone === 'move';
    setBubble(content, ctx ? (reportHold ? BUBBLE_MOVE_HOLD_MS : 0) : BUBBLE_HOLD_MS);
    mood = ctx ? (MOOD_BY_FX[ctx.kind] ?? 'calm') : MOOD_BY_EVENT(game?.state.lastEvent);
    if (!ctx) {
      fxPending = false;
      cam?.before();
      cam?.after?.();     // 无动效可用 ⇒ 两段紧邻，取景照样到位
      paint();
      return;
    }
    /* 与 `fx.play` 同刻、同判空（spec §5.3）：`buy`/`upgrade` 失败无 fx → 也不出声 */
    if (sfxOn) audio.play(ctx.kind);
    fxPending = true;
    cam?.before();
    paint();
    /* 动效元素在 `paint()` 之后才追加进 `fx` 层，必然盖住正好落在棋子头顶的气泡（买地印章 / 金币）：
       先把气泡容器留一手（行号最大 ⇒ 此刻恒为 `fxUi` 层最后一项），`play()` 之后重挂回最上（spec §6.7）。
       气泡是 pass 4（屏幕空间）→ 落在 `fxUi`；世界空间动效在 `fxWorld` 内，恒在 `fxUi` 之下，不会再盖住气泡。 */
    const fxLayer = stage.layers.fxUi;
    const bubbleTop = bubble ? fxLayer.children[fxLayer.children.length - 1] : null;
    fx.play(ctx, () => {
      fxPending = false; mood = 'calm';
      if (!reportHold) setBubble(null, 0);
      cam?.after?.();
      paint();
    });
    if (bubbleTop) fxLayer.addChild(bubbleTop);
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

  /** AiStep → FxContext（与既有 HUD/浮层回调逐字一致） */
  const ctxOfStep = (step: AiStep, r: unknown): FxContext | null => {
    switch (step.kind) {
      case 'roll': return { kind: 'dice' };
      case 'move': {
        const m = r as { from: number; to: number };
        const from = cellXY(m.from); const to = cellXY(m.to);
        return { kind: 'hop', x: from.x, y: from.y, tx: to.x, ty: to.y };
      }
      case 'settle': return settleFx(r as SettleResult);
      case 'buy': {
        const at = cellXY(currentPlayer(game!.state).pos);
        return (r as { ok: boolean }).ok ? { kind: 'buy', x: at.x, y: at.y } : null;
      }
      case 'upgrade': {
        const at = cellXY(currentPlayer(game!.state).pos);
        const u = r as { ok: boolean; level?: number };
        return u.ok ? { kind: 'upgrade', x: at.x, y: at.y, levels: u.level ?? FX_LEVELS } : null;
      }
      case 'card': {
        const at = cellXY(currentPlayer(game!.state).pos);
        return { kind: 'deck', x: at.x, y: at.y };
      }
      case 'trade': {
        const at = cellXY(STOCK_TILE_INDEX);
        return { kind: 'stock', x: at.x, y: at.y };
      }
      default: return null;   // skip / close / end
    }
  };

  /** 唯一动作入口：真人 HUD / 浮层点击与 AI 决策层都归一到 AiStep 后走这里 */
  const dispatch = (step: AiStep, withFx = true): void => {
    const g = game;
    if (!g) return;
    runAction(
      () => applyStep(g, step),
      (r: never) => ctxOfStep(step, r as unknown),
      withFx,
      /* 气泡四态（spec §6.7）：文案取「动作落库后」的所在格短名 + 本次抽卡名 */
      (r: unknown) => bubbleOfStep(step, r, shops.shortAt(currentPlayer(g.state).pos), g.state.lastDraw?.title ?? null),
      (r: unknown) => camPlanOf(step, r),
    );
  };

  /** HUD 点击 → AiStep（`hand` / `ai:fast` / `ai:skip` / `audio:*` 已在回调里拦截，不会传到这里） */
  const stepOfHud = (
    a: Exclude<HudActionId, 'hand' | 'ai:fast' | 'ai:skip' | 'audio:sfx' | 'audio:bgm'>,
  ): AiStep =>
    a === 'buy' ? { kind: 'buy' } : a === 'upgrade' ? { kind: 'upgrade' } : { kind: a };

  const stepOfPanel = (a: PanelActionId, target?: number | string): AiStep => {
    if (a === 'card:close' || a === 'settle:close') return { kind: 'close' };
    if (a === 'stock:buy') return { kind: 'trade', code: String(target), shares: 1 };
    if (a === 'stock:sell') return { kind: 'trade', code: String(target), shares: -1 };
    return { kind: 'card', card: a.slice('card:'.length) as ItemCardKind, target: typeof target === 'number' ? target : undefined };
  };

  /* —— 新手引导（spec §7）：仅在含真人席位的局、首访一次；「重看引导」入口见开局面板 —— */
  let tutorial: TutorialHandle | null = null;
  const replayTour = (): void => {
    tutorial?.destroy();
    tutorial = mountTutorial(fitRoot, { onDone: () => { tutorial = null; } });
  };

  /** 席位确定后开局（spec §6：选完再 createGame）：建 game → 挂 HUD/浮层/驱动器 → 按需弹引导 → 重画 */
  const startGame = (plan: SeatPlan): void => {
    seats = plan;
    const g = createGame({ seed: opts.seed, playerCount: 4 });
    game = g;
    hud = mountHud(fitRoot, g, (a: HudActionId) => {
      /* 静音键（spec §7.4）：翻转 → 落库 → 立即重画图标；不跳动画、不推进状态 */
      if (a === 'audio:sfx' || a === 'audio:bgm') {
        audio.toggle(a === 'audio:sfx' ? 'sfx' : 'bgm');
        paint();
        return;
      }
      /* 牌袋抽屉开合（spec §7.3）：只改可见性、不推进状态，故不走 `dispatch`（也就不吃动效与气泡） */
      if (a === 'hand') { handOpen = !handOpen; paint(); return; }
      if (fx.busy()) fx.skip();   // 点屏加速：状态早已落库，跳过只影响观感时长
      if (a === 'ai:fast') { if (driver) driver.setFast(!driver.isFast()); paint(); return; }
      if (a === 'ai:skip') { driver?.skipRest(); return; }
      dispatch(stepOfHud(a));
    }, () => ({ seats, fast: driver?.isFast() ?? false, ui: { tileCard: tileCardOn(g), handOpen: handOpenEff() } }));
    /* 浮层动作：关浮层 / 股票买卖 / 打手牌（目标由命中区 `data-target` 带出） */
    panels = mountPanels(fitRoot, g, (a: PanelActionId, target?: number | string) => {
      if (fx.busy()) fx.skip();
      dispatch(stepOfPanel(a, target));
    }, () => ({ handOpen: handOpenEff() }));
    /* 三角内容位（spec §6 版式 A 补全）：右上轮播 + 左下事件战报；与浮层同层、随舞台缩放 */
    slots = mountSlots(fitRoot, slotCfg);
    driver = createAiDriver({
      game, seats: () => seats,
      run: (step, withFx = true) => dispatch(step, withFx),
      isBusy: () => fx.busy(),
      onFlush: () => fx.play({ kind: 'end' }, () => paint()),
      /* 「跳过本次」= 整席位一次落库，中间几步的取景没有观感价值（spec §6 P1 第 13 项）⇒ 直接归位 */
      onSkip: () => { if (camOn) camera.reset(0); },
    });
    driver.start();
    /* BGM 起播（spec §6.2）：未解锁时只记「想要」，首次手势 `unlock()` 时随解锁一起起播 */
    audio.startBgm();
    if (shouldShowTutorial(opts, isDone(), seats)) replayTour();
    /* 面板在 boot 之后才 resolve 时，审计对象已建立但 game 仍为 null → 回填 */
    const api = (window as unknown as Record<string, unknown>).__monoMain as { game?: Game | null } | undefined;
    if (api) api.game = game;
    paint();
  };

  if (opts.play) {
    if (planned) startGame(planned);
    else void mountSetup(fitRoot, readPlan(), () => replayTour()).then(startGame);
  }

  /* —— M8 分享 / 裂变入口：meta 注入 + 常驻 CTA + 微信 JS-SDK（非微信 / 签名不可用自动降级） —— */
  const overCopy = (): { title: string; desc: string } | null => resultCopy(game?.state ?? null);
  applyMeta(document, buildShareConfig(location.href, SHARE_VERSION, overCopy()));
  share = mountShare(fitRoot, overCopy, SHARE_VERSION);
  void initWechatShare({ pageHref: location.href, version: SHARE_VERSION, getOver: overCopy })
    .then((b) => {
      share?.setWechat(b);
      (window as unknown as Record<string, unknown>).__monoShareStatus = b.status;
    });
  /* —— M8 结束 —— */

  paint();

  /** 风格控制台句柄（仅 `?debug=1` 有值；同时挂到 `__monoMain` 供闸门 V3/V4 程序化驱动） */
  let themeConsole: ThemeConsoleHandle | null = null;
  if (opts.debug) {
    const panel = createDebugPanel();
    panel.mount(document.body);
    panel.mountViews(opts.show, (v) => {
      const next = new URL(location.href);
      next.searchParams.set('show', v);
      location.href = next.toString();
    });

    /* —— 风格控制台（spec §9）：逐栋选色 / 批量指派 / 单素材 params / 导出 theme.json ——
       改动只在内存：每次写回都从「基准补丁 ⊕ 内存改动」重算，故永不累积漂移；`?theme=off` 下
       基准为空表，控制台仍可当纯预览用。 */
    const basePatch = themePatch ?? {};
    themeConsole = createThemeConsole({
      theme, ids, geo, placement: PLACEMENT,
      instances: () => scene.instancesOf(),
      patchOf: (id) => instantiateDeps.theme?.[id],
      apply: (edits) => { instantiateDeps.theme = mergePatches(basePatch, edits); paint(); },
      camera,
    });
    themeConsole.mount(document.body);
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

  /**
   * 取景四态的代表性位姿（闸门 / 手机视口截图用；确定性，不依赖真实走位）。
   * **会立即 snap 到该位姿**并返回它（`__monoMain.stage.world.scale.x` 随即反映该态）。
   * 取景态取「6 步笔直段」的 `choreography` 关键帧，与 `framing.spec.ts` 的用例同源。
   */
  const camPreview = (state: 'idle' | 'lead' | 'follow' | 'settle'): CamPose => {
    const back: CamPose = { cx: CAM_VIEW_CX, cy: CAM_VIEW_CY, zoom: CAM_IDLE_ZOOM };
    if (state === 'idle') { camera.snap(back); return back; }
    const keys = choreography(pathIndices(CURRENT_INDEX, 6).map(cellAt), geo, CAM_VIEW, camRange());
    const pose = state === 'lead'
      ? keys[1]?.pose ?? back
      : state === 'follow'
        ? keys.find((k) => k.pose.zoom === camRange().follow)?.pose ?? back
        : keys[keys.length - 1]?.pose ?? back;
    camera.snap(pose);
    return pose;
  };

  /** `?perf=1`：帧间隔采样 + 绘制元素峰值（spec §11.5 的测量口径） */
  const perf = {
    firstInteractiveMs: 0, intervals: [] as number[], maxDraw: 0, p95: 0,
    /* R3 降级标记（spec §7）：采样结束后若 p95 超预算 ⇒ true，倍率上限同时降到 `CAM_FALLBACK_MAX_ZOOM` */
    degraded: false,
    budget: { interactiveMs: 3000, frameP95Ms: 20, draw: 200 },
  };
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
      if (perf.intervals.length < FX_FRAMES) { requestAnimationFrame(tick); return; }
      /* 采样到头 → 定档（spec §7 R3 / §8 V20）：p95 超预算即降倍率上限，取景变浅以省绘制量 */
      const sorted = [...perf.intervals].sort((a, b) => a - b);
      perf.p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
      perf.degraded = perf.p95 > perf.budget.frameP95Ms;
      if (perf.degraded) camMax.zoom = CAM_FALLBACK_MAX_ZOOM;
    };
    requestAnimationFrame(tick);
  }
  perf.firstInteractiveMs = performance.now();

  (window as unknown as Record<string, unknown>).__monoMain = {
    stage, scene, opts, geo, skin, missingAssets, game, paint, sim, fx, fxPreview, perf, shops, VERSION,
    audio, seats, aiDriver: driver, hudSeats: () => seats,
    tutorial: () => tutorial, mountTutorial: replayTour, themeConsole,
    /* 相机（spec §8 V19/V20）：`camera.current()` 读位姿、`camPreview` 直接切态；
       `camMax` 是可变对象，供 V20 断言降级后的倍率上限 */
    camera, camMax, camPreview,
  };
}

if (typeof document !== 'undefined') void boot();