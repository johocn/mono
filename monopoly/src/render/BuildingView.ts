import {
  BOARD_COLS, BOARD_ROWS, DEMO_OWNER,
  SLOT_BANNER, SLOT_LANTERN_CHAR, TILE_BRAND, TILE_LEVEL, ringPath,
} from '../data/board';
import type { ElementSpec } from '../skin/instantiate';
import type { ProviderSpec } from '../skin/types';

/** 内环街道小品：行道树 ×2（v5 line 294）+ 通往广场的 4 格石板路路灯 */
export const INNER_STREET_PROPS: Array<{ kind: 'tree' | 'lamp'; c: number; r: number }> = [
  { kind: 'tree', c: 2, r: 8 },
  { kind: 'tree', c: 8, r: 2 },
  { kind: 'lamp', c: 3, r: 5 },
  { kind: 'lamp', c: 5, r: 3 },
  { kind: 'lamp', c: 7, r: 5 },
  { kind: 'lamp', c: 5, r: 7 },
];

export interface BuildingOpts {
  /** 归属查询：1..4 或 null（不传则用 v5 演示归属 DEMO_OWNER） */
  ownerOf?: (index: number) => number | null;
  /** 店招文字（不传则用 TILE_BRAND[index]） */
  brandOf?: (index: number) => string;
}

export function proc(preset: string, params: Record<string, unknown>): ProviderSpec {
  return { kind: 'proc', preset, params };
}

/** 元素级覆盖（回退链第 ① 级）：只覆盖本 spec 自己的 id，不动皮肤包 */
export function only(id: string, p: ProviderSpec): Record<string, ProviderSpec> {
  return { [id]: p };
}

/** 地块序号 → 建筑层级（只收 lv>0 的 18 格；未列入者无楼，其地砖回到 level 1） */
export function slotLevelsOf(): Record<number, 1 | 2 | 3> {
  const out: Record<number, 1 | 2 | 3> = {};
  TILE_LEVEL.forEach((lv, index) => {
    if (lv === 0) return;
    out[index] = lv;
  });
  return out;
}

/**
 * 挂件 spec：只声明 id / slot / c / r / state，
 * 抬升由注册表的 `attach.atV` 与管线施加（spec §3.7.3 铁律 1），这里不写任何坐标。
 */
function propSpec(
  id: string,
  slot: number,
  c: number,
  r: number,
  level: 1 | 2 | 3,
  state: Record<string, unknown>,
  override?: ProviderSpec,
): ElementSpec {
  return {
    id, slot, c, r, level, state,
    ...(override ? { overrides: only(id, override) } : {}),
  };
}

/** 18 栋楼 + 店招 + 挂件（v5 line 302 `isoShop(x, y - 1, 0.72, lv, OHUE[owner], {})`） */
export function buildingSpecs(opts: BuildingOpts = {}): ElementSpec[] {
  const ownerOf = opts.ownerOf ?? ((index: number) => DEMO_OWNER[index] ?? null);
  const brandOf = opts.brandOf ?? ((index: number) => TILE_BRAND[index]);
  const levels = slotLevelsOf();
  const out: ElementSpec[] = [];

  ringPath(BOARD_COLS, BOARD_ROWS).forEach(([c, r], index) => {
    const lv = levels[index];
    if (lv === undefined) return;

    const brand = brandOf(index);
    const wallId = `building.s${index}.l${lv}`;

    /* 楼体只交状态：preset 与配色一律由数据层（public/config/theme.json + skin.json）装配，
       渲染层不得在此写死 preset / 色值（spec §1.1 病根修正） */
    out.push({
      id: wallId, slot: index, c, r, level: lv,
      state: { level: lv, dim: false, owner: ownerOf(index), brand },
      overrides: {},
    });

    /* 店招：L2/L3 才有（L1 是摊位，v5 用遮阳篷代替） */
    if (lv !== 1) {
      const signId = `building.s${index}.sign`;
      out.push({
        id: signId, slot: index, c, r, level: lv,
        state: { level: lv },
        overrides: only(signId, proc('sign', { levels: lv, brand })),
      });
      /* 屋顶设备箱（v5 line 221–222 两个 isoBox，由 preset 一次画完） */
      out.push(propSpec('prop.rooftopBox', index, c, r, lv, { level: lv }));
    } else {
      /* 遮阳篷（v5 line 212–216） */
      out.push(propSpec('prop.awning', index, c, r, lv, { level: lv }));
    }

    /* 招牌塔（自带桅杆 + 红灯，v5 line 226–229）：L3 */
    if (lv === 3) out.push(propSpec('prop.signTower', index, c, r, lv, { level: lv }));

    /* 红灯笼 ×2：门口 + 右侧（v5 line 249–250） */
    const char = SLOT_LANTERN_CHAR[index] ?? '';
    out.push(propSpec('prop.lantern', index, c, r, lv, { level: lv, at: 'door', char }));
    out.push(propSpec('prop.lantern', index, c, r, lv, { level: lv, at: 'side', char }));

    /* 竖招幌子：只给 SLOT_BANNER 里的少数地块 */
    const vb = SLOT_BANNER[index];
    if (vb) out.push(propSpec('prop.banner', index, c, r, lv, { level: lv }, proc('banner', { text: vb })));
  });

  return out;
}

/** 内环街道小品（ground，不随建筑缩放） */
export function streetPropSpecs(): ElementSpec[] {
  return INNER_STREET_PROPS.map((p) => ({ id: `prop.${p.kind}`, slot: null, c: p.c, r: p.r }));
}