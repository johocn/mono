/**
 * 背景绘制工具 — 双阳主题关统一绿金背景。
 *
 * 复用「双阳鹿乡」官方皮肤（official_shuangyang）的 bg 配置，
 * 与三消关套用同一皮肤时的视觉严格一致（单一数据源，避免配色漂移）。
 * 仅当 `level.theme === "shuangyang"` 时调用，其余关卡保持各自原背景。
 */

import { gameCanvas } from "./GameCanvas";
import { getOfficialSkin } from "../config/SkinPresets";

export function drawShuangyangBackground(): void {
  const w = gameCanvas.getW();
  const h = gameCanvas.getH();
  const skin = getOfficialSkin("official_shuangyang");
  const colors = skin?.bg.colors ?? ["#0f2a1c", "#18502f", "#caa23a"];
  const stops = skin?.bg.stops ?? [0, 0.6, 1];
  const glows = skin?.bg.glows ?? [
    { color: "rgba(224,168,46,0.18)", cx: 0.22, cy: 0.16, r: 0.55 },
    { color: "rgba(62,142,90,0.16)", cx: 0.84, cy: 0.84, r: 0.6 },
  ];

  gameCanvas.draw((ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    colors.forEach((c, i) => {
      grad.addColorStop(stops[i] ?? i / Math.max(1, colors.length - 1), c);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 柔光斑点，与三消关同一套，避免大面积纯色显得死板
    for (const g of glows) {
      const gx = w * g.cx;
      const gy = h * g.cy;
      const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(1, w * g.r));
      rg.addColorStop(0, g.color);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
  }, 0);
}
