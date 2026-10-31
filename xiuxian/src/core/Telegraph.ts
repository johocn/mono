/**
 * 地面预警绘制：等距菱形红圈（telegraph）。
 * 敌人前摇 / Boss AOE / 玩家技能落点预览 共用，立即模式每帧重绘（见 Game.updateTelegraphs）。
 */
import { gridToScreen, TILE_W, TILE_H } from "./IsoMap";

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 在 (gx,gy) 地面画半径 rCells（格）的等距菱形预警圈。
 * @param progress 0~1 充能进度（控制填充浓度，越高越危险）
 * @param pulse    呼吸闪烁系数（1 = 不闪）
 */
export function drawTelegraphDiamond(
  g: any, gx: number, gy: number, rCells: number, color: string, progress: number, pulse = 1,
): void {
  const { x, y } = gridToScreen(gx, gy);
  const cx = x, cy = y;
  const rad = Math.max(2, rCells * TILE_W);
  const radH = (rad * TILE_H) / TILE_W; // 等距菱形：高 = 宽/2
  const p = Math.max(0, Math.min(1, progress));
  const a = (0.1 + 0.4 * p) * pulse;
  const [rc, gg, b] = hexToRgb(color);
  const dia = (rx: number, ry: number, fill: string | null, stroke: string | null, lw = 0) =>
    g.drawPoly(0, 0, [cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy], fill, stroke, lw);
  // 等距菱形预警（外描边 + 半透明填充）
  dia(rad, radH, null, color, 2);
  dia(rad, radH, `rgba(${rc},${gg},${b},${a.toFixed(3)})`, null, 0);
}
