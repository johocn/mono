/**
 * RadarChart — 13 维认知雷达图绘制工具（被认知中心 / 我的画像 / 家属关怀 复用）
 *
 * 与 ResultScene.drawRadar 保持一致的视觉语言：青绿填充多边形 + 黄色顶点 +
 * 标签（维度名）+ 数值。抽成独立函数避免三处重复实现。
 */

import { gameCanvas } from "./GameCanvas";

export interface RadarDatum {
  label: string;
  value: number; // 0–100，未训练为 0
}

export function drawRadarChart(
  cx: number,
  cy: number,
  radius: number,
  data: RadarDatum[],
  opts: { animate?: number; labelColor?: string } = {},
): void {
  const n = data.length;
  if (n < 3) return;

  const angleOf = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;

  // 网格环
  for (let ring = 1; ring <= 4; ring++) {
    const r = (radius * ring) / 4;
    gameCanvas.draw((ctx) => {
      ctx.strokeStyle = ring === 4 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = angleOf(i % n);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }, 3);
  }

  // 轴线
  for (let i = 0; i < n; i++) {
    const a = angleOf(i);
    gameCanvas.draw((ctx) => {
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      ctx.stroke();
    }, 3);
  }

  // 数据多边形
  const p = Math.max(0, Math.min(1, opts.animate ?? 1));
  gameCanvas.draw((ctx) => {
    ctx.fillStyle = "rgba(78,205,196,0.28)";
    ctx.strokeStyle = "#4ECDC4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const a = angleOf(idx);
      const r = radius * (data[idx].value / 100) * p;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < n; i++) {
      const a = angleOf(i);
      const r = radius * (data[i].value / 100) * p;
      ctx.fillStyle = "#FFE66D";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 4);

  // 标签 + 数值
  const labelColor = opts.labelColor ?? "#b9c0dc";
  for (let i = 0; i < n; i++) {
    const a = angleOf(i);
    const lx = cx + Math.cos(a) * (radius + 30);
    const ly = cy + Math.sin(a) * (radius + 26);
    const v = data[i].value;
    gameCanvas.drawText(data[i].label, lx, ly - 8, { size: 11, color: labelColor }, 5);
    gameCanvas.drawText(`${v}`, lx, ly + 8,
      { size: 11, color: v > 0 ? "#4ECDC4" : "#5a6285", bold: true }, 5);
  }
}
