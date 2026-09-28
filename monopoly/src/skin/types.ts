export type Mount = 'ground' | 'wall' | 'roof';
export type ProviderKind = 'proc' | 'image' | 'atlas' | 'frames';

export interface Box { w: number; d: number; h: number }

export interface ProcSpec { kind: 'proc'; preset: string; params?: Record<string, unknown> }
export interface ImageSpec { kind: 'image'; src: string; anchor?: [number, number] }
export interface AtlasSpec { kind: 'atlas'; src: string; frame: string; anchor?: [number, number] }
export interface FramesSpec { kind: 'frames'; src: string[]; fps: number; anchor?: [number, number] }

export type ProviderSpec = ProcSpec | ImageSpec | AtlasSpec | FramesSpec;

/** 皮肤包的动效 token 段（spec §5.6 / M6 契约①）：缓动 + 震动 + 落尘数（美术参数，允许写在 skin.json） */
export interface FxTokens {
  ease?: string;
  shake?: { amp?: number; ms?: number };
  dust?: { count?: number };
}

export interface SkinPack {
  id: string;
  meta?: { name?: string };
  geo: { hw: number; hh: number; ox: number; oy: number };
  tokens: Record<string, string>;
  elements: Record<string, ProviderSpec>;
  /** 顶层 `fx` 段：`fx.ts` 经 `resolveMotion()` 消费，缺省时用 layout 的 FX_* 兜底 */
  fx?: FxTokens;
}

export interface RegistryEntry {
  id: string;
  box: Box;
  anchor: [number, number];
  baseline: number;
  mount: Mount;
  attach?: { host: string; atV: number };
  providerKinds: ProviderKind[];
  /** 定格台位缩放（缺省 1）：给不在建筑网格档位上的元素用（如内环装饰楼 0.5） */
  scale?: number;
}

export interface ElementState {
  level?: 1 | 2 | 3;
  owner?: number | null;
  selected?: boolean;
  processing?: boolean;
  dim?: boolean;
  facing?: 'left' | 'right';
  /** 视图层附加的展示字段（如橱窗文案 brand / sub / line1 / caption）：不参与规则判定 */
  [k: string]: unknown;
}