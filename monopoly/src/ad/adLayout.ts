/**
 * 广告宣传版（M21）· 布局常量（非配色；配色一律走 `tokens.ts`）
 *
 * 舞台仍为 390×844（`layout.ts` 的 STAGE_W/H 不动）：
 *   · 广告区 0..563（≈2/3）：hero 轮播 + 商圈 Tab + 双列商品卡网格（DOM，`MallView`）；
 *   · 游戏区 563..844（≈1/3）：迷你棋盘（geo 缩放）+ 紧凑 HUD（DOM，`AdHud`）。
 * 既有 `layout.ts` 常量与 `test/ui` 字面坐标断言零改动——广告版几何独立成表。
 */
import type { PlacementOpts } from '../render/Scene';

/** 广告区总高（0..563，占屏 2/3） */
export const AD_ZONE_H = 563;
export const AD_HERO_H = 96;
export const AD_TAB_H = 22;
/** 商品网格顶（= hero + tab） */
export const AD_GRID_TOP = AD_HERO_H + AD_TAB_H;

/**
 * 迷你棋盘几何：`hw/hh` 按 18→9 半高缩放（棋盘高 18×hh=162），
 * ox 使 (c−r) ∈ −6..10 居中（左右各留 109），oy 使棋盘顶缘 572（距广告区 9px）、
 * 底缘 oy+17×hh=734 与紧凑 HUD 顶相接。
 */
export const AD_GEO = { hw: 10.75, hh: 9, ox: 173.5, oy: 581 };

/** 迷你棋盘的台位缩放（楼体/棋子随 geo 等比缩小，避免大件压过小格） */
export const AD_PLACEMENT: PlacementOpts = {
  pawnGap: 12, pawnFrontDy: 0.6, pawnRowDy: 11, pawnScale: 0.8,
  buildingScale: 0.4, buildingYOffset: 0.5,
};

/* —— 紧凑 HUD（DOM，`AdHud`）：顶 = 棋盘底缘 734，总高 110（734..844）—— */
export const AD_HUD_TOP = 734;
export const AD_HUD_H = 110;
/* 各行相对 HUD 顶的偏移（行高） */
export const AD_HUD_STATUS_Y = 2;    // 状态行（16 高）
export const AD_HUD_BARS_Y = 20;     // 资产条（18 高）
export const AD_HUD_CTRL_Y = 42;     // 骰 + 主/次按钮行（32 高）
export const AD_HUD_QK_Y = 78;       // 5 快捷键行（24 高）
export const AD_HUD_DICE = { size: 24, gap: 5 };
