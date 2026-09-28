import {
  levelCaption, OWNER_HUE, PLAYER_NAME, RENT_BY_LEVEL, SHOWCASE_TEXT as T,
  SLOT_BANNER, SLOT_LANTERN_CHAR, TILE_BRAND, TILE_LEVEL,
} from '../data/board';
import { STAGE_W } from '../skin/layout';
import type { ElementSpec } from '../skin/instantiate';
import { only, proc } from './BuildingView';
import { SHOWCASE_L as W } from './providers/proc-showcase';

export interface ShowcaseInput {
  /** 展示的地块序号（0..31）；`variant: 'c'` 时忽略 */
  slot?: number;
  /** 持有者 1..4；null = 无主；`variant: 'c'` 时忽略 */
  owner?: number | null;
  /** 版式：b = 单地块橱窗（默认，踩格特写 / 升级弹窗）；c = 三级对照（我的地产 / 图鉴） */
  variant?: 'b' | 'c';
}

/** 定格台位：橱窗元素不在棋盘网格上，直接给绝对屏幕坐标（Scene 见 fixed 即短路 resolvePlacement） */
function at(cx: number, cy: number, s?: number): { cx: number; cy: number; s?: number } {
  return s === undefined ? { cx, cy } : { cx, cy, s };
}

/** 一个橱窗元素的骨架：id + 台位 + 第 4 遍（覆盖层） */
function sc(id: string, fixed: { cx: number; cy: number; s?: number }, extra: Partial<ElementSpec> = {}): ElementSpec {
  return { id, slot: null, c: 0, r: 0, pass: 4, fixed, ...extra };
}

/** B 版式：地块橱窗（v5 `showcase()` + optB 叠层 line 443–449） */
export function showcaseSpecs(input: ShowcaseInput): ElementSpec[] {
  if (input.variant === 'c') return miniSpecs();
  const slot = input.slot ?? 0;
  const owner = input.owner ?? null;
  const lv = (TILE_LEVEL[slot] || 2) as 1 | 2 | 3;
  const brand = TILE_BRAND[slot] || T.fallbackBrand;
  const hue = OWNER_HUE[owner ?? 2] ?? OWNER_HUE[2];
  const px = W.x;
  const py = W.y;
  const gy = py + W.h * W.gy;
  /* 大楼基座（v5 showcase line 355–356 的 cx/cy） */
  const bx = px + W.w / 2;
  const by = gy + Math.min(W.h - W.h * W.gy, W.cyMax) * W.cyF;
  const big = at(bx, by, W.shopScale);
  const rent = RENT_BY_LEVEL[lv] ?? RENT_BY_LEVEL[2];
  const nextRent = RENT_BY_LEVEL[lv + 1];
  const ownerName = owner ? PLAYER_NAME[owner - 1] : T.noOwner;
  const char = SLOT_LANTERN_CHAR[slot] ?? '';

  const out: ElementSpec[] = [
    sc('showcase.panel', at(px, py)),
    sc('showcase.sky', at(px, py)),
    sc('showcase.skyline', at(px, py)),
    sc('showcase.ground', at(px, py)),
  ];

  /* 配景：行道树 ×2 + 路灯 ×2（v5 line 359–362；台位与缩放来自 SHOWCASE_L） */
  const deco: Array<[string, number[], string, string]> = [
    ['showcase.tree', W.treeL, 'tree', 'trScale'],
    ['showcase.tree', W.treeR, 'tree', 'trScale'],
    ['showcase.lamp', W.lampL, 'lamp', 'lpScale'],
    ['showcase.lamp', W.lampR, 'lamp', 'lpScale'],
  ];
  for (const [id, [fx, fy, fs], preset, key] of deco) {
    out.push(sc(id, at(px + W.w * fx, gy + fy, fs), { overrides: only(id, proc(preset, { [key]: fs })) }));
  }

  /* 大楼 + 店招 + 灯笼 ×2 + 幌子：共享同一 fixed → 与墙面严格同一坐标系 */
  out.push(sc('showcase.shop', big, {
    level: lv,
    state: { level: lv },
    overrides: only('showcase.shop', proc('shop', { levels: lv, hue, brand, pool: true, steam: true })),
  }));
  out.push(sc('showcase.sign', big, {
    level: lv,
    state: { level: lv },
    overrides: only('showcase.sign', proc('sign', { levels: lv, brand })),
  }));
  out.push(sc('showcase.lantern', big, { level: lv, state: { level: lv, at: 'door', char } }));
  out.push(sc('showcase.lantern', big, { level: lv, state: { level: lv, at: 'side', char } }));
  const vb = SLOT_BANNER[slot];
  if (vb) {
    out.push(sc('showcase.banner', big, {
      level: lv,
      state: { level: lv },
      overrides: only('showcase.banner', proc('banner', { text: vb })),
    }));
  }

  /* 信息条（v5 optB line 444–448） */
  out.push(sc('showcase.hud', at(px, py), {
    state: {
      brand,
      sub: `${T.kind} · ${T.holder} ${ownerName}`,
      line1: `${lv} ${T.floors} · ${T.rent} ￥${rent}`,
      line2: lv === 3 ? T.maxLevel : `${T.upgradeTo} L${lv + 1} → ${T.rent} ￥${nextRent}`,
      cta: `${T.pay} ￥${rent * 4}`,
    },
  }));

  return out;
}

/** C 版式：三张迷你卡并排（v5 optC line 449–455 `miniShop(160, 210, lv)` ×3） */
function miniSpecs(): ElementSpec[] {
  const levels: Array<1 | 2 | 3> = [1, 2, 3];
  const s = W.miniCardScale;
  const cw = W.miniW * s;
  const x0 = (STAGE_W - (levels.length * cw + (levels.length - 1) * W.miniGap)) / 2;
  const brand = TILE_BRAND[0] || T.fallbackBrand;
  const out: ElementSpec[] = [];

  levels.forEach((lv, i) => {
    const card = at(x0 + i * (cw + W.miniGap), W.miniY, s);
    out.push(sc('showcase.mini', card, {
      level: lv,
      state: { caption: levelCaption(lv) },
    }));
    /* 楼 / 店招 / 幌子共享卡内锚点：卡内水平居中 + 地平线 0.80 处 */
    const shop = at(card.cx + cw / 2, card.cy + W.miniH * s * W.miniShopY, W.miniS * s);
    out.push(sc('showcase.shop', shop, {
      level: lv,
      state: { level: lv },
      overrides: only('showcase.shop', proc('shop', { levels: lv, hue: W.miniHue, brand })),
    }));
    out.push(sc('showcase.sign', shop, {
      level: lv,
      state: { level: lv },
      overrides: only('showcase.sign', proc('sign', { levels: lv, brand })),
    }));
    if (lv >= 2) {
      out.push(sc('showcase.banner', shop, {
        level: lv,
        state: { level: lv },
        overrides: only('showcase.banner', proc('banner', { text: T.miniBanner })),
      }));
    }
  });

  return out;
}