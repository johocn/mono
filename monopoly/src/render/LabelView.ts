import { Text, Container, Graphics } from 'pixi.js';
import { ipos } from './iso';
import { BOARD_COLS, BOARD_ROWS, ringPath, shortAt } from '../data/board';
import type { ElementSpec } from '../skin/instantiate';

export interface LabelParams { dy: number; fs: number; padX: number; padTop: number; h: number; rx: number }

export interface Placement {
  cx: number;
  cy: number;
  h: number;
  widthFor(text: string): number;
}

/** 标签锚点：格心 + hh×dy（v5 用 0.46，落在格前沿） */
export function labelPlacement(x: number, y: number, geo: { hh: number }, p: LabelParams): Placement {
  const cy = y + geo.hh * p.dy;
  return {
    cx: x,
    cy,
    h: p.h,
    widthFor: (text) => text.length * p.fs + p.padX,
  };
}

export function labelTextOf(index: number): string {
  return shortAt(index);
}

/** 第二遍：汉字店名一律压最上层（spec §3.4 硬约束 2） */
export function drawLabels(
  layer: Container,
  geo: { hw: number; hh: number; ox: number; oy: number },
  params: { bg: string; text: string; ownedText: string; ownerOf: (i: number) => number | null },
  label: LabelParams,
): void {
  layer.removeChildren();
  ringPath(BOARD_COLS, BOARD_ROWS).forEach(([c, r], index) => {
    const [x, y] = ipos(c, r, geo);
    const p = labelPlacement(x, y, geo, label);
    const text = labelTextOf(index);
    const w = p.widthFor(text);
    const bg = new Graphics();
    bg.roundRect(p.cx - w / 2, p.cy - label.padTop, w, label.h, label.rx)
      .fill({ color: params.bg, alpha: 1 });
    const t = new Text({
      text,
      style: {
        fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: label.fs,
        fontWeight: '600',
        fill: params.ownerOf(index) !== null ? params.ownedText : params.text,
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