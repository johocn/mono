/**
 * 主题装配（spec §4「三层装配模型」）：`public/config/theme.json` → 元素级补丁表。
 *
 * 纯函数、零依赖、坏数据静默跳过（口径同 `parseShopConfig`）。
 * 产物**不是** `ProviderSpec`：`resolve()` 的 L1 要求 proc 带非空 preset，而 `prop.*` 一族
 * 各元素 preset 不同，单条通配 binding 给不出正确 preset，故这里只产出「补丁」——
 * 由 `instantiate()` 在解析之后合并（`ThemePatch`），L1 命中时不合并（商家实拍永远赢）。
 */

export interface Palette { [k: string]: string }

export interface ThemeBinding {
  match: string;
  /** proc preset 名（缺省 = 沿用 skin.json / 内建解析结果） */
  preset?: string;
  /** 整条 binding 统一配色 */
  palette?: string;
  /** 32 长度数组，按地块序号逐格给配色；优先于 `palette` */
  paletteBySlot?: string[];
  /** 元素级参数，逐键压过 palette（单素材独立风格） */
  params?: Record<string, unknown>;
}

export interface Theme { palettes: Record<string, Palette>; bindings: ThemeBinding[] }

/** 空主题（缺文件 / 坏 JSON 的回退值）：compileTheme 产出 `{}` → `instantiate()` 行为与改造前完全一致 */
export const EMPTY_THEME: Theme = { palettes: {}, bindings: [] };

/** 编译产物：对某个元素 id 的解析后补丁 */
export interface ThemePatch { preset?: string; params: Record<string, unknown> }

/** 段通配：`building.*.l2` 只匹配同段数的 id；`*` 不跨 `.` */
export function globMatch(pattern: string, id: string): boolean {
  const p = pattern.split('.');
  const s = id.split('.');
  if (p.length !== s.length) return false;
  for (let i = 0; i < p.length; i++) if (p[i] !== '*' && p[i] !== s[i]) return false;
  return true;
}

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 坏数据一律丢弃该条，绝不抛错（沿用 parseShopConfig 口径） */
export function parseTheme(raw: unknown): Theme {
  const palettes: Record<string, Palette> = {};
  const bindings: ThemeBinding[] = [];
  if (!isRec(raw)) return { palettes, bindings };

  if (isRec(raw.palettes)) {
    for (const [k, v] of Object.entries(raw.palettes)) {
      if (!isRec(v)) continue;
      const pal: Palette = {};
      for (const [ck, cv] of Object.entries(v)) if (typeof cv === 'string') pal[ck] = cv;
      if (Object.keys(pal).length) palettes[k] = pal;
    }
  }

  if (Array.isArray(raw.bindings)) {
    for (const b of raw.bindings) {
      if (!isRec(b) || typeof b.match !== 'string') continue;
      if (b.palette !== undefined && typeof b.palette !== 'string') continue;
      if (b.preset !== undefined && typeof b.preset !== 'string') continue;
      let bySlot: string[] | undefined;
      if (Array.isArray(b.paletteBySlot)) {
        if (b.paletteBySlot.length !== 32) continue;            // 长度不符 → 整条丢弃
        bySlot = b.paletteBySlot.filter((x): x is string => typeof x === 'string');
        if (bySlot.length !== 32) continue;
      }
      bindings.push({
        match: b.match,
        preset: typeof b.preset === 'string' ? b.preset : undefined,
        palette: typeof b.palette === 'string' ? b.palette : undefined,
        paletteBySlot: bySlot,
        params: isRec(b.params) ? b.params : undefined,
      });
    }
  }
  return { palettes, bindings };
}

/** 从 id 反解地块序号：`building.s{n}.*` → n；其余（地砖/道具/UI）无序号 → null */
export function slotOf(id: string): number | null {
  const m = /^building\.s(\d+)\./.exec(id);
  return m ? Number(m[1]) : null;
}

/** 元素 id → 补丁表。后写的 binding 覆盖先写的（同键覆盖、异键累加），保证「精确 > 通配」 */
export function compileTheme(theme: Theme, ids: string[]): Record<string, ThemePatch> {
  const out: Record<string, ThemePatch> = {};
  for (const b of theme.bindings) {
    for (const id of ids) {
      if (!globMatch(b.match, id)) continue;
      const slot = slotOf(id);
      const key = b.paletteBySlot && slot !== null ? b.paletteBySlot[slot] : b.palette;
      const pal = key ? theme.palettes[key] : undefined;
      if ((b.palette || b.paletteBySlot) && !pal) continue;     // 引用无效 palette → 跳过该 id
      const prev = out[id];
      out[id] = {
        preset: b.preset ?? prev?.preset,
        params: { ...(prev?.params ?? {}), ...(pal ?? {}), ...(b.params ?? {}) },
      };
    }
  }
  return out;
}

/** `?theme=<paletteId>` 强制套色的作用域：建筑（含店招）/ 道具 / 地砖 */
const FORCE_MATCH = ['building.*.*', 'prop.*', 'board.tile.*', 'board.tile.*.edge'];

/**
 * 调试强制套色（`?theme=<paletteId>`）：把某个 palette 整体施加到建筑 / 道具 / 地砖。
 * 未知 paletteId → `{}`（不改动任何元素，静默回退 theme.json 的分区轮转）。**只出 params**——
 * preset 由 bindings 决定，故必须经 `mergePatches` 合并而非覆盖。
 */
export function forcePalette(theme: Theme, paletteId: string, ids: string[]): Record<string, ThemePatch> {
  const pal = theme.palettes[paletteId];
  if (!pal || Object.keys(pal).length === 0) return {};
  const out: Record<string, ThemePatch> = {};
  for (const id of ids) {
    if (!FORCE_MATCH.some((p) => globMatch(p, id))) continue;
    out[id] = { params: { ...pal } };
  }
  return out;
}

/** 补丁表深合并（`b` 赢）：`params` 逐键合并，`preset` 不让空值抹掉已有值 */
export function mergePatches(
  a: Record<string, ThemePatch>,
  b: Record<string, ThemePatch>,
): Record<string, ThemePatch> {
  const out: Record<string, ThemePatch> = { ...a };
  for (const [id, p] of Object.entries(b)) {
    const prev = out[id];
    out[id] = {
      preset: p.preset ?? prev?.preset,
      params: { ...(prev?.params ?? {}), ...p.params },
    };
  }
  return out;
}