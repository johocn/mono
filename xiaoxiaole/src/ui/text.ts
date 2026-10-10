/**
 * UI 文字工具：按宽度自动折行绘制（drawWrapped）
 *
 * 与 GameCanvas.drawText 使用同一字体策略（fontPx 字号缩放 + 同款字体族），
 * 因此测量宽度与最终渲染一致，不会折错行/溢出。
 */
import { gameCanvas, fontPx } from "./GameCanvas";

const FONT = '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

// 离屏 ctx 仅用于测量文字宽度
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  return measureCtx!;
}

/**
 * 按最大像素宽度折行：
 * - CJK 逐字符断行；遇到空格优先在词边界断（英文/数字）。
 * - 遇到显式 \n 也强制换行。
 * 返回折好的行数组（至少一行）。
 */
export function wrapLines(text: string, size: number, maxWidth: number): string[] {
  const ctx = getMeasureCtx();
  const px = fontPx(size);
  ctx.font = `${px}px ${FONT}`;
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") { lines.push(""); continue; }
    let cur = "";
    let curW = 0;
    for (const ch of para) {
      const w = ctx.measureText(ch).width;
      // 在空格处可整词断行：累积到空格时若超宽则从词首断开
      if (ch === " ") {
        if (curW + w > maxWidth && cur.length > 0) {
          lines.push(cur.trimEnd());
          cur = "";
          curW = 0;
        } else {
          cur += ch;
          curW += w;
        }
        continue;
      }
      if (curW + w > maxWidth && cur.length > 0) {
        lines.push(cur);
        cur = ch;
        curW = w;
      } else {
        cur += ch;
        curW += w;
      }
    }
    if (cur.length > 0) lines.push(cur);
  }
  return lines;
}

/**
 * 自动折行绘制多行文字。
 * @param x,y   第一行文字的基准点（y 为文字中线；对齐方式见 align）
 * @param maxWidth 折行最大宽度（px，已含字号缩放前的设计值由调用方换算）
 * @param opts  size/color/align/bold/lineH
 */
export function drawWrapped(
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts: {
    size?: number; color?: string; align?: CanvasTextAlign; bold?: boolean; lineH?: number;
  } = {},
): void {
  const size = opts.size ?? 18;
  const lineH = opts.lineH ?? Math.round(size * 1.5);
  const lines = wrapLines(text, size, maxWidth);
  lines.forEach((ln, i) => {
    gameCanvas.drawText(ln, x, y + i * lineH, {
      size,
      color: opts.color ?? "#fff",
      align: opts.align ?? "center",
      bold: opts.bold,
    });
  });
}
