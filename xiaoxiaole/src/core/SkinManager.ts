/**
 * SkinManager — 当前皮肤、逐级回退取值与贴图缓存
 *
 * 职责：
 * - 持有「当前应用皮肤」，所有取值逐级回退 `DEFAULT_SKIN`，未换肤时视觉零回归；
 * - 贴图异步预加载并缓存 `HTMLImageElement`，**未就绪时返回 null**，调用方先画配色占位，
 *   加载完成后下一帧自动生效，避免首帧空白或阻塞渲染；
 * - 当前皮肤持久化到 localStorage，刷新后保持玩家选择。
 *
 * 注意：皮肤「库」（我的皮肤 / 模板中心）由 `SkinStore` 管理，本类只管「当前应用哪一个」。
 */

import {
  DEFAULT_SKIN,
  DEFAULT_SKIN_ID,
  FALLBACK_TILE,
  validateSkin,
  type SkinConfig,
  type SkinGlow,
  type SkinTileStyle,
} from "./Skin";

const STORAGE_KEY = "bg_skin_current_v1";

class SkinManager {
  private current: SkinConfig = DEFAULT_SKIN;
  /** url → 已加载完成的图片 */
  private images = new Map<string, HTMLImageElement>();
  /** 正在加载的 url，避免重复发起 */
  private loading = new Set<string>();

  // === 生命周期 ===

  /** 启动时恢复上次应用的皮肤；解析失败或异常一律回退默认，绝不影响主链路 */
  restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      const res = validateSkin(parsed);
      if (res.ok && res.skin) {
        this.current = res.skin;
        this.preload(this.current);
      }
    } catch {
      this.current = DEFAULT_SKIN;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      /* 隐私模式 / 配额不足时静默忽略 */
    }
  }

  // === 应用 / 切换 ===

  getSkin(): SkinConfig { return this.current; }
  getId(): string { return this.current.id; }
  isDefault(): boolean { return this.current.id === DEFAULT_SKIN_ID; }

  /** 应用皮肤（会持久化并预加载其贴图） */
  apply(skin: SkinConfig): void {
    this.current = skin;
    this.persist();
    this.preload(skin);
  }

  /** 恢复内置默认皮肤 */
  reset(): void {
    this.current = DEFAULT_SKIN;
    this.persist();
  }

  // === 取值（逐级回退默认皮肤） ===

  bgColors(): string[] {
    const c = this.current.bg?.colors;
    return c && c.length > 0 ? c : DEFAULT_SKIN.bg.colors;
  }

  /** 渐变落点；缺省按颜色数量均分 */
  bgStops(): number[] {
    const stops = this.current.bg?.stops;
    const colors = this.bgColors();
    if (stops && stops.length === colors.length) return stops;
    if (colors.length === 1) return [0];
    return colors.map((_, i) => i / (colors.length - 1));
  }

  bgGlows(): SkinGlow[] {
    return this.current.bg?.glows ?? DEFAULT_SKIN.bg.glows ?? [];
  }

  bgImage(): HTMLImageElement | null {
    return this.ensureImage(this.current.bg?.image);
  }

  board(): SkinConfig["board"] {
    const b = this.current.board;
    return {
      base: b?.base ?? DEFAULT_SKIN.board.base,
      glow: b?.glow ?? DEFAULT_SKIN.board.glow,
      stroke: b?.stroke ?? DEFAULT_SKIN.board.stroke,
      image: b?.image,
    };
  }

  boardImage(): HTMLImageElement | null {
    return this.ensureImage(this.current.board?.image);
  }

  /** 棋子配色与文字：当前皮肤 → 默认皮肤 → 兜底灰 */
  tile(type: string): SkinTileStyle {
    if (!type) return FALLBACK_TILE;
    return this.current.tiles?.[type] ?? DEFAULT_SKIN.tiles[type] ?? FALLBACK_TILE;
  }

  /** 棋子贴图（未就绪返回 null，调用方画配色占位） */
  tileImage(type: string): HTMLImageElement | null {
    if (!type) return null;
    return this.ensureImage(this.current.tiles?.[type]?.image);
  }

  // === 贴图加载 ===

  private preload(skin: SkinConfig): void {
    this.ensureImage(skin.bg?.image);
    this.ensureImage(skin.board?.image);
    for (const key of Object.keys(skin.tiles ?? {})) {
      this.ensureImage(skin.tiles?.[key]?.image);
    }
  }

  /**
   * 取已加载完成的图片；未加载过则异步发起，未就绪返回 null。
   * 这样渲染层永远有配色兜底，不会出现空白或闪烁。
   */
  private ensureImage(url: string | undefined): HTMLImageElement | null {
    if (!url) return null;
    const cached = this.images.get(url);
    if (cached && cached.complete && cached.naturalWidth > 0) return cached;
    if (!this.loading.has(url)) {
      this.loading.add(url);
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0) this.images.set(url, img);
        this.loading.delete(url);
      };
      img.onerror = () => {
        this.loading.delete(url);
      };
      img.src = url;
    }
    return null;
  }
}

export const skinManager = new SkinManager();
