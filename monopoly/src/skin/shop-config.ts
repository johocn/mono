/**
 * 商家配置加载（商业闭环·阶段一「静态认领」）
 *
 * 运营在 `public/config/shops.json` 填「地块 slot → 商家素材」；游戏启动读入并合成
 * **元素级覆盖（回退链第 1 级 overrides）** 与**字牌/店招文案**，**不改渲染代码**
 * （design `2026-09-29-monopoly-shuangyang-business-loop-design.md` §6.3/§6.4）。
 *
 * 纯函数契约（对齐上游 §3.6.4）：坏 JSON / 缺字段 / slot 越界一律静默跳过，
 * 逐级回退到 `src/data/board.ts` 的内建默认 —— 绝不抛错、绝不改写入参。
 * 配置缺失时返回 `SHOP_DEFAULTS`，画面与接入前**完全一致**（零变化）。
 */
import {
  RING_SIZE, brandAt as boardBrandAt, shortAt as boardShortAt, TILE_LEVEL,
} from '../data/board';
import { isValidProvider } from './resolve';
import type { ProviderSpec } from './types';

/** `shops.json` 的单条商家素材（字段见 design §6.4） */
export interface ShopEntry {
  /** 地块序号 0..31（越界的条目静默忽略） */
  slot: number;
  /** 商家全名（展示/对账用，不直接上屏） */
  merchantName?: string;
  /** 字牌短名（≤5 字，压在格前沿）；缺则回退 `TILE_SHORT` */
  short?: string;
  /** 店招 / 楼体 / 橱窗文字；缺则回退 `TILE_BRAND` */
  brand?: string;
  /** 店招图片素材（相对皮肤包目录的路径，如 `shop/s4-sign.png`） */
  sign?: { src?: string } | null;
  /** 楼体图片素材；`null` / 缺省表示沿用 proc 楼体 */
  building?: { src?: string } | null;
  /** 阶段二券系统联动用（本阶段仅落配置，不消费） */
  couponTemplateId?: string;
  /** 阶段二券有效期（天） */
  validDays?: number;
}

/** 渲染层消费的合成结果 */
export interface ShopConfig {
  /** 元素级覆盖（回退链第 1 级）：`elementId` → provider */
  overrides: Record<string, ProviderSpec>;
  /** 需预装载的商家图片相对路径（相对皮肤包目录） */
  images: string[];
  /** 字牌短名（当前 locale 无关；缺配置逐格回退 `TILE_SHORT`） */
  shortAt(index: number): string;
  /** 店招 / 楼体 / 橱窗文字（缺配置逐格回退 `TILE_BRAND`） */
  brandAt(index: number): string;
}

/** 零配置兜底：与 `board.ts` 内建默认完全一致（不改变任何画面） */
export const SHOP_DEFAULTS: ShopConfig = {
  overrides: {},
  images: [],
  shortAt: boardShortAt,
  brandAt: boardBrandAt,
};

/** `{src}` → `src`（非对象 / src 非字符串 → undefined） */
function srcOf(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = (raw as { src?: unknown }).src;
  return typeof src === 'string' && src.length > 0 ? src : undefined;
}

function strOf(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/** `{src:'a.png'}` → `{src:'a.png'}`；缺 src / 非对象 → null */
function imgOf(raw: unknown): { src: string } | null {
  const src = srcOf(raw);
  return src ? { src } : null;
}

/** 宽松解析单条：slot 必须是 0..31 的整数，否则判无效条目 */
function entryOf(raw: unknown): ShopEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const slot = e.slot;
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= RING_SIZE) return null;
  return {
    slot,
    merchantName: strOf(e.merchantName),
    short: strOf(e.short),
    brand: strOf(e.brand),
    sign: imgOf(e.sign),
    building: imgOf(e.building),
    couponTemplateId: strOf(e.couponTemplateId),
    validDays: typeof e.validDays === 'number' && Number.isFinite(e.validDays) ? e.validDays : undefined,
  };
}

/**
 * 宽入严出：任何 `unknown`（含 null / 字符串 / 坏 JSON 解析结果）都能解析；
 * 返回的 provider 一律先过 `isValidProvider`，非法即不进 overrides（→ 回退皮肤/内建）。
 */
export function parseShopConfig(raw: unknown): ShopConfig {
  const list = (raw as { shops?: unknown } | null)?.shops;
  if (!Array.isArray(list)) return SHOP_DEFAULTS;

  const bySlot = new Map<number, ShopEntry>();
  for (const item of list) {
    const e = entryOf(item);
    if (e) bySlot.set(e.slot, e);
  }

  const overrides: Record<string, ProviderSpec> = {};
  const images: string[] = [];
  const pushImage = (id: string, src: string): void => {
    const spec: ProviderSpec = { kind: 'image', src };
    if (!isValidProvider(spec)) return;
    overrides[id] = spec;
    if (!images.includes(src)) images.push(src);
  };

  for (const e of bySlot.values()) {
    if (e.sign?.src) pushImage(`building.s${e.slot}.sign`, e.sign.src);
    /* 楼体按「演示初始层级」映射到具体元素 ID（`building.<slot>.l<lv>`，lv=0 无楼不映射） */
    const lv = TILE_LEVEL[e.slot];
    if (e.building?.src && lv > 0) pushImage(`building.s${e.slot}.l${lv}`, e.building.src);
  }

  return {
    overrides,
    images,
    shortAt: (i) => bySlot.get(i)?.short ?? boardShortAt(i),
    brandAt: (i) => bySlot.get(i)?.brand ?? boardBrandAt(i),
  };
}
