import { BUILDING_HEIGHTS, getEntry } from './registry';
import { resolve, type Resolved } from './resolve';
import { isElementId } from './ids';
import type { Box, ElementState, Mount, ProviderKind, ProviderSpec, SkinPack } from './types';

export interface ElementSpec {
  id: string;
  slot?: number | null;
  c: number;
  r: number;
  level?: 1 | 2 | 3;
  state?: ElementState;
  mount?: Mount;
  overrides?: Record<string, ProviderSpec> | null;
  /** 棋子同格错开用（`piece.*` 第三遍）：第 i 枚 → Scene 交给 resolvePlacement 算 cx */
  pawnIndex?: number;
  /** 绘制遍覆盖（1 地面 / 2 标签 / 3 棋子 / 4 覆盖层 fx）；缺省由 Scene.passOf(id) 决定 */
  pass?: 1 | 2 | 3 | 4;
  /** 舞台定格台位（地块橱窗）：跳过 resolvePlacement，直接用绝对屏幕坐标与缩放 */
  fixed?: { cx: number; cy: number; s?: number };
}

export interface InstantiateDeps {
  skin: SkinPack | null;
  defaultSkin: SkinPack | null;
  overrides?: Record<string, ProviderSpec> | null;
  slotLevels?: Record<number, 1 | 2 | 3>;
  onDraw?: (inst: Instance, params: Record<string, unknown>) => void;
}

export interface Instance {
  id: string;
  slot: number | null;
  skin: string;
  providerKind: ProviderKind;
  provider: ProviderSpec;
  level: 1 | 2 | 3 | 4;
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

export function hostHeightOf(slot: number | null, slotLevels: Record<number, 1 | 2 | 3>): number {
  const lv = slot === null ? 1 : slugLevel(slot, slotLevels);
  return BUILDING_HEIGHTS[lv];
}

function slugLevel(slot: number, slotLevels: Record<number, 1 | 2 | 3>): 1 | 2 | 3 {
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

  const r: Resolved = resolve(spec.id, deps.skin, deps.defaultSkin, spec.overrides ?? deps.overrides ?? null);
  const skinId = (r.level === 3 || r.level === 4 ? deps.defaultSkin?.id : deps.skin?.id) ?? 'builtin';

  const source = `[mono] ${spec.id} @slot=${slot === null ? 'null' : slot} provider=${r.provider.kind} ← L${r.level}`;

  const inst: Instance = {
    id: spec.id,
    slot,
    skin: skinId,
    providerKind: r.provider.kind,
    provider: r.provider,
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