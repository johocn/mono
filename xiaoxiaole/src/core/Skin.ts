/**
 * Skin — 皮肤数据模型、内置默认皮肤与校验
 *
 * 设计要点：
 * - **回退优于覆盖**：皮肤各分区与棋子类型均为可选覆盖，未配置的局部回退到 `DEFAULT_SKIN`，
 *   因此「未换肤」时视觉与改造前完全一致（零回归），玩家上传的不完整皮肤也不会让画面崩坏。
 * - **配色与贴图并存**：`image` 为可选贴图（URL 或 dataURL），无贴图时走原有色块 + 文字绘制。
 * - **默认皮肤取自 GAME_CONFIG**：与 `tileColors` / `tileLabels` 及现有背景、棋盘绘制值严格一致。
 */

import { GAME_CONFIG } from "./GameConfig";
import { SafetyManager } from "./SafetyManager";

export const SKIN_VERSION = 1;
export const DEFAULT_SKIN_ID = "default";

/** 背景柔光斑（相对比例坐标 0..1，半径按画布宽度比例） */
export interface SkinGlow {
  color: string;
  cx: number;
  cy: number;
  r: number;
}

/** 背景：渐变色组 / 柔光斑 / 可选贴图 */
export interface SkinBg {
  colors: string[];
  /** 渐变落点（0..1，长度与 colors 一致），缺省均分 */
  stops?: number[];
  glows?: SkinGlow[];
  image?: string;
}

/** 棋盘底板 */
export interface SkinBoard {
  base: string;
  /** 底板外发光颜色 */
  glow: string;
  /** 底板描边颜色 */
  stroke: string;
  image?: string;
}

/** 单类棋子样式 */
export interface SkinTileStyle {
  color: string;
  label: string;
  image?: string;
}

/** 皮肤配置（配色与可选贴图并存；未配置的局部回退默认皮肤） */
export interface SkinConfig {
  id: string;
  name: string;
  author: string;
  createdAt: number;
  version: number;
  bg: SkinBg;
  board: SkinBoard;
  tiles: Partial<Record<string, SkinTileStyle>>;
  /** 积分换购价（可只设其一） */
  pricePoints?: number;
  /** 人民币价（分） */
  priceCents?: number;
  tags: string[];
}

/** 允许皮肤覆盖的棋子类型（白名单，防止任意键污染渲染） */
export const SKIN_TILE_TYPES: string[] = [
  "flower", "leaf", "fruit", "butterfly", "bird", "water", "chime", "cooking",
];

/** 单张贴图体积上限（2MB，含 dataURL 估算） */
export const MAX_SKIN_IMAGE_BYTES = 2 * 1024 * 1024;
/** 单张贴图像素上限（宽或高），避免超大图拖慢渲染与占用内存 */
export const MAX_SKIN_IMAGE_PIXELS = 2048;
/** 分享码体积上限（Base64 后字符数） */
export const MAX_SHARE_CODE_CHARS = 200_000;

/**
 * 内置默认皮肤 —— 与当前视觉严格一致：
 * - 背景渐变 `#161832 → #1a1a2e → #0f2038`（落点 0 / 0.55 / 1）+ 两处柔光斑
 * - 棋盘底板 `rgba(24,26,48,0.82)`、发光 `rgba(78,205,196,0.28)`、描边 `rgba(120,140,210,0.35)`
 * - 棋子配色/文字取自 `GAME_CONFIG.tileColors` / `tileLabels`
 */
export const DEFAULT_SKIN: SkinConfig = {
  id: DEFAULT_SKIN_ID,
  name: "默认花园",
  author: "脑力花园",
  createdAt: 0,
  version: SKIN_VERSION,
  bg: {
    colors: ["#161832", "#1a1a2e", "#0f2038"],
    stops: [0, 0.55, 1],
    glows: [
      { color: "rgba(255,107,157,0.10)", cx: 0.16, cy: 0.24, r: 0.5 },
      { color: "rgba(78,205,196,0.10)", cx: 0.86, cy: 0.82, r: 0.55 },
    ],
  },
  board: {
    base: "rgba(24,26,48,0.82)",
    glow: "rgba(78,205,196,0.28)",
    stroke: "rgba(120,140,210,0.35)",
  },
  tiles: {
    flower: { color: GAME_CONFIG.tileColors.flower, label: GAME_CONFIG.tileLabels.flower },
    leaf: { color: GAME_CONFIG.tileColors.leaf, label: GAME_CONFIG.tileLabels.leaf },
    fruit: { color: GAME_CONFIG.tileColors.fruit, label: GAME_CONFIG.tileLabels.fruit },
    butterfly: { color: GAME_CONFIG.tileColors.butterfly, label: GAME_CONFIG.tileLabels.butterfly },
    bird: { color: GAME_CONFIG.tileColors.bird, label: GAME_CONFIG.tileLabels.bird },
    water: { color: GAME_CONFIG.tileColors.water, label: GAME_CONFIG.tileLabels.water },
    chime: { color: GAME_CONFIG.tileColors.chime, label: GAME_CONFIG.tileLabels.chime },
    cooking: { color: GAME_CONFIG.tileColors.cooking, label: GAME_CONFIG.tileLabels.cooking },
  },
  tags: ["内置"],
};

/** 兜底棋子样式（未知类型时） */
export const FALLBACK_TILE: SkinTileStyle = { color: "#888888", label: "" };

// === 校验 ===

export interface SkinValidation {
  ok: boolean;
  skin?: SkinConfig;
  error?: string;
}

const COLOR_RE = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([\d\s.,%]+\))$/;

/** rgba()/rgb() → 不透明 hex（对比度计算需要不透明色） */
export function toOpaqueHex(color: string): string | null {
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(color);
  if (m) {
    const hex = [m[1], m[2], m[3]]
      .map((v) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, "0"))
      .join("");
    return `#${hex}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const [r, g, b] = color.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/** 估算 dataURL 体积（字节）；非 dataURL 返回 0（交由后端校验） */
export function estimateImageBytes(url: string): number {
  if (!url.startsWith("data:")) return 0;
  const comma = url.indexOf(",");
  if (comma < 0) return 0;
  const body = url.slice(comma + 1);
  // base64 每 4 字符 ≈ 3 字节
  return Math.floor(body.length * 0.75);
}

function isStr(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

/**
 * 校验并规范化皮肤（字段白名单 + 类型 + 长度 + 体积）。
 * 用于分享码导入与上传，防止畸形数据导致渲染异常。
 */
export function validateSkin(raw: unknown): SkinValidation {
  if (!raw || typeof raw !== "object") return { ok: false, error: "皮肤数据格式不正确" };
  const o = raw as Record<string, unknown>;

  const name = isStr(o.name, 24) ? o.name : "未命名皮肤";
  const author = isStr(o.author, 24) ? o.author : "匿名";
  const id = isStr(o.id, 64) ? o.id : `skin_${Date.now().toString(36)}`;

  // --- 背景 ---
  const rawBg = (o.bg ?? {}) as Record<string, unknown>;
  const colors = Array.isArray(rawBg.colors)
    ? rawBg.colors.filter((c): c is string => typeof c === "string" && COLOR_RE.test(c)).slice(0, 5)
    : [];
  if (colors.length === 0) return { ok: false, error: "背景缺少有效渐变色" };
  const stops = Array.isArray(rawBg.stops)
    ? rawBg.stops.filter((s): s is number => typeof s === "number" && s >= 0 && s <= 1)
    : undefined;
  if (stops && stops.length !== colors.length) {
    return { ok: false, error: "渐变落点数量与颜色数量不一致" };
  }
  const glows = Array.isArray(rawBg.glows)
    ? rawBg.glows
        .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
        .slice(0, 4)
        .map((g) => ({
          color: typeof g.color === "string" && COLOR_RE.test(g.color) ? g.color : "rgba(255,255,255,0.08)",
          cx: typeof g.cx === "number" ? Math.max(0, Math.min(1, g.cx)) : 0.5,
          cy: typeof g.cy === "number" ? Math.max(0, Math.min(1, g.cy)) : 0.5,
          r: typeof g.r === "number" ? Math.max(0.05, Math.min(2, g.r)) : 0.5,
        }))
    : [];
  const bgImage = typeof rawBg.image === "string" ? rawBg.image : undefined;
  if (bgImage && estimateImageBytes(bgImage) > MAX_SKIN_IMAGE_BYTES) {
    return { ok: false, error: "背景贴图体积超过上限（2MB）" };
  }

  // --- 棋盘 ---
  const rawBoard = (o.board ?? {}) as Record<string, unknown>;
  const board: SkinBoard = {
    base: typeof rawBoard.base === "string" && COLOR_RE.test(rawBoard.base)
      ? rawBoard.base : DEFAULT_SKIN.board.base,
    glow: typeof rawBoard.glow === "string" && COLOR_RE.test(rawBoard.glow)
      ? rawBoard.glow : DEFAULT_SKIN.board.glow,
    stroke: typeof rawBoard.stroke === "string" && COLOR_RE.test(rawBoard.stroke)
      ? rawBoard.stroke : DEFAULT_SKIN.board.stroke,
  };
  if (typeof rawBoard.image === "string") {
    if (estimateImageBytes(rawBoard.image) > MAX_SKIN_IMAGE_BYTES) {
      return { ok: false, error: "棋盘贴图体积超过上限（2MB）" };
    }
    board.image = rawBoard.image;
  }

  // --- 棋子（键走白名单） ---
  const tiles: Partial<Record<string, SkinTileStyle>> = {};
  const rawTiles = (o.tiles ?? {}) as Record<string, unknown>;
  for (const type of SKIN_TILE_TYPES) {
    const t = rawTiles[type] as Record<string, unknown> | undefined;
    if (!t || typeof t !== "object") continue;
    const color = typeof t.color === "string" && COLOR_RE.test(t.color) ? t.color : null;
    if (!color) continue;
    const label = isStr(t.label, 4) ? t.label : (DEFAULT_SKIN.tiles[type]?.label ?? "");
    const style: SkinTileStyle = { color, label };
    if (typeof t.image === "string") {
      if (estimateImageBytes(t.image) > MAX_SKIN_IMAGE_BYTES) {
        return { ok: false, error: `「${label}」棋子贴图体积超过上限（2MB）` };
      }
      style.image = t.image;
    }
    tiles[type] = style;
  }

  const tags = Array.isArray(o.tags)
    ? o.tags.filter((t): t is string => typeof t === "string" && t.length <= 8).slice(0, 6)
    : [];

  const skin: SkinConfig = {
    id,
    name,
    author,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
    version: SKIN_VERSION,
    bg: { colors, stops, glows, image: bgImage },
    board,
    tiles,
    tags,
  };

  if (typeof o.pricePoints === "number" && o.pricePoints >= 0) skin.pricePoints = Math.floor(o.pricePoints);
  if (typeof o.priceCents === "number" && o.priceCents >= 0) skin.priceCents = Math.floor(o.priceCents);

  return { ok: true, skin };
}

/**
 * 素材尺寸校验：加载图片后判定像素上限，防止超大图拖慢渲染。
 * 体积校验见 `validateSkin` / 后端 StorageService；此处只管像素。
 */
export function checkImageSize(url: string): Promise<{ ok: boolean; w: number; h: number; error?: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w <= 0 || h <= 0) {
        resolve({ ok: false, w, h, error: "无法读取图片尺寸" });
      } else if (w > MAX_SKIN_IMAGE_PIXELS || h > MAX_SKIN_IMAGE_PIXELS) {
        resolve({
          ok: false, w, h,
          error: `图片尺寸 ${w}×${h} 超过上限 ${MAX_SKIN_IMAGE_PIXELS}px`,
        });
      } else {
        resolve({ ok: true, w, h });
      }
    };
    img.onerror = () => resolve({ ok: false, w: 0, h: 0, error: "图片加载失败，可能已损坏" });
    img.src = url;
  });
}

/**
 * 适老化对比度校验：棋子底色 vs 棋盘底板底色需达到 WCAG AA。
 * 只校验「棋子能否在棋盘上看清」，不改文字与热区（默认皮肤文字沿用白字 + 黑描边）。
 */
export function checkSkinContrast(skin: SkinConfig): { ok: boolean; ratio: number; worst?: string } {
  const boardHex = toOpaqueHex(skin.board.base) ?? toOpaqueHex(DEFAULT_SKIN.board.base) ?? "#181a30";
  let worst = 21;
  let worstType: string | undefined;
  for (const type of Object.keys(skin.tiles)) {
    const st = skin.tiles[type];
    if (!st) continue;
    const tileHex = toOpaqueHex(st.color);
    if (!tileHex) continue;
    const ratio = SafetyManager.contrastRatio(tileHex, boardHex);
    if (ratio < worst) {
      worst = ratio;
      worstType = type;
    }
  }
  return { ok: worst >= GAME_CONFIG.minContrastRatio, ratio: worst, worst: worstType };
}
