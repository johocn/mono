import { Text, Container, Graphics } from 'pixi.js';
import { dia, ipos } from './iso';
import { ptsToPoly } from './paint';
import { BOARD_COLS, BOARD_ROWS, ringPath, shortAt } from '../data/board';
import { BUILDING_HEIGHTS } from '../skin/registry';
import {
  BUILDING_SCALE, BUILDING_Y_OFFSET, LABEL_CURRENT_RING, LABEL_CURRENT_SCALE, LABEL_CURRENT_TEXT,
  LABEL_MAX_CHARS, LABEL_RING, LABEL_ROOF, LABEL_STROKE_CUR, LABEL_TRI_H, LABEL_TRI_W,
} from '../skin/layout';
import type { ElementSpec } from '../skin/instantiate';

export interface LabelParams { dy: number; fs: number; padX: number; padTop: number; h: number; rx: number }

export interface Placement {
  cx: number;
  cy: number;
  h: number;
  widthFor(text: string): number;
}

/** 超长店名截断（>4 字加 '…'，spec §6.2） */
export function clampLabelText(text: string, max = LABEL_MAX_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 楼顶名牌排版：3 字 fs11 / 4 字 fs10 / 5 字 fs8；当前格整体放大 1.25× */
export function labelSize(text: string, current = false): { fs: number; w: number; h: number } {
  const n = clampLabelText(text).length;
  const base = n <= 3 ? LABEL_ROOF.fsShort : n === 4 ? LABEL_ROOF.fs : LABEL_ROOF.fsNarrow;
  const fs = current ? base * LABEL_CURRENT_SCALE : base;
  return { fs, w: n * fs + LABEL_ROOF.padX, h: LABEL_ROOF.h };
}

/** 楼顶落位（胶囊中心）= 楼体基线 − 楼体屏幕高 − 抬升 − 半个胶囊 */
export function roofLabelY(cy: number, buildingH: number): number {
  return cy - buildingH - LABEL_ROOF.lift - LABEL_ROOF.h / 2;
}

/** 标签锚点：有楼 → 楼顶（spec §6.2）；无楼 → 格心 + hh×dy（v5 用 0.46，落在格前沿） */
export function labelPlacement(
  x: number,
  y: number,
  geo: { hh: number },
  p: LabelParams,
  buildingH?: number,
): Placement {
  if (buildingH !== undefined && buildingH > 0) {
    return {
      cx: x,
      cy: roofLabelY(y - BUILDING_Y_OFFSET, buildingH),
      h: LABEL_ROOF.h,
      widthFor: (text) => labelSize(text).w,
    };
  }
  return {
    cx: x,
    cy: y + geo.hh * p.dy,
    h: p.h,
    widthFor: (text) => text.length * p.fs + p.padX,
  };
}

export function labelTextOf(index: number): string {
  return shortAt(index);
}

/** 第二遍：汉字店名一律压最上层（spec §3.4 硬约束 2）。
    当前格三重标记（spec §6.3）：放大 1.25× + 金色描边 + 胶囊下方指示三角（地砖金环见 `tile` preset）。 */
export function drawLabels(
  layer: Container,
  geo: { hw: number; hh: number; ox: number; oy: number },
  params: {
    bg: string; text: string; ownedText: string; ownerOf: (i: number) => number | null;
    /** 字牌文字来源（商家配置注入；缺省用 `TILE_SHORT`） */
    textOf?: (i: number) => string;
    /** 楼高查询：格序号 → 1|2|3（无楼给 null/undefined）——有楼则名牌浮上楼顶 */
    levelOf?: (i: number) => number | null | undefined;
    /** 当前格序号 */
    currentSlot?: number;
  },
  label: LabelParams,
): void {
  layer.removeChildren();
  ringPath(BOARD_COLS, BOARD_ROWS).forEach(([c, r], index) => {
    const [x, y] = ipos(c, r, geo);
    const cur = index === params.currentSlot;
    const text = clampLabelText(params.textOf ? params.textOf(index) : labelTextOf(index));
    const buildingH = (BUILDING_HEIGHTS[params.levelOf?.(index) ?? 0] ?? 0) * BUILDING_SCALE;
    const onRoof = buildingH > 0;

    const p = labelPlacement(x, y, geo, label, onRoof ? buildingH : undefined);
    /* 当前格金环（画在标签层 ⇒ 恒在楼体与地砖之上）：外圈光晕 + 内圈实金 */
    if (cur) {
      const ring = new Graphics();
      ring.poly(ptsToPoly(dia(x, y, geo.hw + LABEL_RING.out, geo.hh + LABEL_RING.out)))
        .stroke({ color: LABEL_CURRENT_RING, width: LABEL_RING.outW, alpha: LABEL_RING.outA });
      ring.poly(ptsToPoly(dia(x, y, geo.hw + LABEL_RING.in, geo.hh + LABEL_RING.in)))
        .stroke({ color: LABEL_CURRENT_RING, width: LABEL_RING.inW });
      layer.addChild(ring);
    }
    const k = cur ? LABEL_CURRENT_SCALE : 1;
    const size = onRoof ? labelSize(text, cur) : { fs: label.fs * k, w: text.length * label.fs * k + label.padX, h: label.h };
    const padTop = onRoof ? size.h / 2 : label.padTop * k;
    const rx = onRoof ? LABEL_ROOF.rx : label.rx;

    const bg = new Graphics();
    bg.roundRect(p.cx - size.w / 2, p.cy - padTop, size.w, size.h, rx)
      .fill({ color: params.bg, alpha: 1 })
      .stroke({ color: LABEL_CURRENT_RING, width: cur ? LABEL_STROKE_CUR : LABEL_ROOF.strokeW });
    if (cur) {
      const ty = p.cy - padTop + size.h;
      bg.moveTo(p.cx - LABEL_TRI_W / 2, ty)
        .lineTo(p.cx + LABEL_TRI_W / 2, ty)
        .lineTo(p.cx, ty + LABEL_TRI_H)
        .fill({ color: LABEL_CURRENT_RING, alpha: 1 });
    }

    const t = new Text({
      text,
      style: {
        fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: size.fs,
        fontWeight: '600',
        fill: cur
          ? LABEL_CURRENT_TEXT
          : params.ownerOf(index) !== null ? params.ownedText : params.text,
      },
    });
    t.anchor.set(0.5);
    t.position.set(p.cx, p.cy);
    layer.addChild(bg, t);
  });
}

export function labelSpecs(): ElementSpec[] {
  // 标签属第二遍，注册表用 board.tile.*.label 的占位（M2 直接由 drawLabels 绘制，理由见 Task 14 备注）
  return ringPath(BOARD_COLS, BOARD_ROWS).map(([c, r], index) => ({
    id: 'board.tile.shop', slot: index, c, r,
  }));
}