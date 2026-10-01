import { BUILDING_HEIGHTS, getEntry } from './registry';
import { resolve, type Resolved } from './resolve';
import { isElementId } from './ids';
import type { ThemePatch } from './theme';
import type { BuildLevel } from '../data/board';
import type { Box, ElementState, Mount, ProviderKind, ProviderSpec, SkinPack } from './types';

export interface ElementSpec {
  id: string;
  slot?: number | null;
  c: number;
  r: number;
  level?: BuildLevel;
  state?: ElementState;
  mount?: Mount;
  overrides?: Record<string, ProviderSpec> | null;
  /** 棋子同格错开用（`piece.*` 第三遍）：第 i 枚 → Scene 交给 resolvePlacement 算 cx */
  pawnIndex?: number;
  /** 同格棋子总数：≥3 走 2×2 方阵（非 2×2 时 Scene 退化为「单排 / 居中」） */
  pawnCount?: number;
  /** 绘制遍覆盖（1 地面 / 2 标签 / 3 棋子 / 4 覆盖层 fx）；缺省由 Scene.passOf(id) 决定 */
  pass?: 1 | 2 | 3 | 4;
  /** 舞台定格台位（地块橱窗）：跳过 resolvePlacement，直接用绝对屏幕坐标与缩放 */
  fixed?: { cx: number; cy: number; s?: number };
}

export interface InstantiateDeps {
  skin: SkinPack | null;
  defaultSkin: SkinPack | null;
  overrides?: Record<string, ProviderSpec> | null;
  /**
   * 主题装配补丁（`public/config/theme.json` → `compileTheme`）：只覆盖 L2/L3/L4 的 preset 与 params。
   * L1（商家实拍 / 渲染层显式覆盖）命中时**不合并**——商家素材永远赢（spec §4）。
   */
  theme?: Record<string, ThemePatch> | null;
  slotLevels?: Record<number, BuildLevel>;
  onDraw?: (inst: Instance, params: Record<string, unknown>) => void;
}

export interface Instance {
  id: string;
  slot: number | null;
  skin: string;
  providerKind: ProviderKind;
  provider: ProviderSpec;
  level: BuildLevel;
  mount: Mount;
  box: Box;
  depth: number;
  lift: number;
  c: number;
  r: number;
  /** 注册表给定的定格缩放（缺省 1）：resolvePlacement 用它当「非建筑网格」元素的基准 s */
  scale: number;
  state: ElementState;
  source: string;
  draw: (g: unknown, params: Record<string, unknown>) => void;
}

export function hostHeightOf(slot: number | null, slotLevels: Record<number, BuildLevel>): number {
  const lv = slot === null ? 1 : slugLevel(slot, slotLevels);
  return BUILDING_HEIGHTS[lv];
}

function slugLevel(slot: number, slotLevels: Record<number, BuildLevel>): BuildLevel {
  return slotLevels[slot] ?? 1;
}

/** 铁律：贴墙/贴屋顶的装饰只声明 atV，抬升由管线施加 */
export function liftOf(mount: Mount, hostHeight: number, atV: number): number {
  if (mount === 'ground') return 0;
  if (mount === 'roof') return hostHeight;
  return atV * hostHeight;
}

export function instantiate(spec: ElementSpec, deps: InstantiateDeps): Instance {
  const entry = getEntry(spec.id);
  const slot = spec.slot ?? null;

  if (!entry || !isElementId(spec.id)) {
    throw new Error(`[mono] ${spec.id} @slot=${slot === null ? 'null' : slot} provider=- ← unregistered`);
  }

  const mount = spec.mount ?? entry.mount;
  const level = spec.level ?? slugLevel(slot ?? 0, deps.slotLevels ?? {});
  const host = hostHeightOf(slot, deps.slotLevels ?? {});
  const atV = entry.attach?.atV ?? 0;
  const lift = liftOf(mount, host, atV);

  /* 元素级覆盖（回退链第 1 级）合并：商家配置（deps.overrides）优先于渲染层自带的通用 proc
     —— 商家素材要能替换「同一元素」的通用外观（如 `building.s4.sign` 的店招图），
     故 deps 覆盖写在 spec 覆盖之后（design §6.3「商家素材落 overrides 层」）。 */
  const merged = { ...(spec.overrides ?? null), ...(deps.overrides ?? null) };
  const r: Resolved = resolve(spec.id, deps.skin, deps.defaultSkin, Object.keys(merged).length > 0 ? merged : null);
  const skinId = (r.level === 3 || r.level === 4 ? deps.defaultSkin?.id : deps.skin?.id) ?? 'builtin';
  /* 主题补丁：只在其上叠加（L1 除外）。proc 才可合并——image/atlas/frames 无 preset/params 概念 */
  const patch = r.level === 1 ? undefined : deps.theme?.[spec.id];
  const provider: ProviderSpec = patch && r.provider.kind === 'proc'
    ? {
      kind: 'proc',
      preset: patch.preset ?? r.provider.preset,
      params: { ...(r.provider.params ?? {}), ...patch.params },
    }
    : r.provider;

  const source = `[mono] ${spec.id} @slot=${slot === null ? 'null' : slot} provider=${provider.kind} ← L${r.level}`;

  const inst: Instance = {
    id: spec.id,
    slot,
    skin: skinId,
    providerKind: provider.kind,
    provider,
    level: r.level,
    mount,
    box: entry.box,
    depth: spec.c + spec.r,
    lift,
    c: spec.c,
    r: spec.r,
    scale: entry.scale ?? 1,
    state: { level, ...(spec.state ?? {}) },
    source,
    draw: (g, params) => deps.onDraw?.(inst, params),
  };
  return inst;
}