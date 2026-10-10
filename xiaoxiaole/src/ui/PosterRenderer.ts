/**
 * PosterRenderer — 离屏渲染「认知画像海报」与「家属关怀微信卡片」。
 *
 * 为何离屏：游戏画布是 draw-call 队列（GameCanvas），不适合直接出图；
 * 这里用一张独立 HTMLCanvasElement 以 2x 像素密度绘制，再 toDataURL 交给
 * ShareOverlay 展示（移动端可长按保存，桌面端可下载）。
 *
 * 视觉语言与游戏内保持一致（深蓝紫渐变 + 青绿/暖黄），并针对分享场景做了
 * 海报化排版：雷达 + 综合指数 + 亮点 + 建议 + 装饰二维码；
 * 家属卡片则模拟微信会话中的「链接转发卡片」外观，便于长辈家属一眼看懂。
 */

import type { CognitiveProfile } from "../core/CognitiveProfile";

const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
const SCALE = 2;

interface Canvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function makeCanvas(w: number, h: number): Canvas2D {
  const canvas = document.createElement("canvas");
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "middle";
  return { canvas, ctx };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function roundRectTop(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function text(
  ctx: CanvasRenderingContext2D, str: string, x: number, y: number,
  size: number, color: string, align: CanvasTextAlign = "left", bold = false,
): void {
  ctx.fillStyle = color;
  ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}

/** 在不超过 maxW 的前提下换行，返回每行文本 */
function wrap(ctx: CanvasRenderingContext2D, str: string, size: number, maxW: number): string[] {
  ctx.font = `${size}px ${FONT}`;
  const lines: string[] = [];
  let cur = "";
  for (const ch of str) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxW && cur.length > 0) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

interface RadarDatum { label: string; value: number }

function drawRadar(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, data: RadarDatum[],
): void {
  const n = data.length;
  if (n < 3) return;
  const angleOf = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;

  for (let ring = 1; ring <= 4; ring++) {
    const r = (radius * ring) / 4;
    ctx.strokeStyle = ring === 4 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = angleOf(i % n);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (let i = 0; i < n; i++) {
    const a = angleOf(i);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(78,205,196,0.30)";
  ctx.strokeStyle = "#4ECDC4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const a = angleOf(idx);
    const r = radius * (data[idx].value / 100);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < n; i++) {
    const a = angleOf(i);
    const r = radius * (data[i].value / 100);
    ctx.fillStyle = "#FFE66D";
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < n; i++) {
    const a = angleOf(i);
    const lx = cx + Math.cos(a) * (radius + 34);
    const ly = cy + Math.sin(a) * (radius + 30);
    ctx.textAlign = "center";
    text(ctx, data[i].label, lx, ly - 8, 12, "#b9c0dc");
    text(ctx, `${data[i].value}`, lx, ly + 9, 12, data[i].value > 0 ? "#4ECDC4" : "#5a6285", "center", true);
  }
}

/** 装饰性二维码（非真实可扫，仅作视觉占位） */
function drawFakeQR(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const pad = 8;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, x, y, size, size, 10);
  ctx.fill();
  const modules = 11;
  const inner = size - pad * 2;
  const cell = inner / modules;
  ctx.fillStyle = "#1a1a2e";
  // 确定性伪随机，保证每次渲染一致
  let seed = 20260607;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      // 三个定位角保留
      const inFinder = (r < 3 && c < 3) || (r < 3 && c > modules - 4) || (r > modules - 4 && c < 3);
      if (inFinder) continue;
      if (rnd() > 0.5) {
        ctx.fillRect(x + pad + c * cell, y + pad + r * cell, cell + 0.5, cell + 0.5);
      }
    }
  }
  // 定位角方块
  const finder = (fx: number, fy: number) => {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(fx, fy, cell * 3, cell * 3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(fx + cell * 0.6, fy + cell * 0.6, cell * 1.8, cell * 1.8);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(fx + cell, fy + cell, cell, cell);
  };
  finder(x + pad, y + pad);
  finder(x + pad + (modules - 3) * cell, y + pad);
  finder(x + pad, y + pad + (modules - 3) * cell);
}

// === 画像海报 ===

export function renderProfilePoster(p: CognitiveProfile, dateLabel?: string): string {
  const W = 750;
  const H = 1200;
  const { canvas, ctx } = makeCanvas(W, H);

  // 背景渐变
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1a1a2e");
  bg.addColorStop(0.5, "#16213e");
  bg.addColorStop(1, "#0f3460");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 装饰光斑
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#4ECDC4";
  ctx.beginPath();
  ctx.arc(W - 70, 90, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8B7CF8";
  ctx.beginPath();
  ctx.arc(40, H - 120, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 头部
  text(ctx, "岁月神偷 · 脑力花园", W / 2, 62, 19, "#FFE66D", "center", true);
  text(ctx, "我的认知画像", W / 2, 116, 40, "#ffffff", "center", true);
  text(ctx, dateLabel ?? defaultMonthLabel(), W / 2, 158, 17, "#9aa3c8", "center");

  // 雷达
  const radar: RadarDatum[] = p.axes.map((a) => ({ label: a.label, value: a.value }));
  drawRadar(ctx, W / 2, 410, 208, radar);

  // 综合指数
  text(ctx, "综合认知指数", W / 2, 700, 19, "#9aa3c8", "center");
  text(ctx, `${p.overall}`, W / 2, 752, 60, "#4ECDC4", "center", true);
  text(ctx, `已训练 ${p.trainedCount} / ${p.axes.length} 个认知域`, W / 2, 794, 17, "#8b93b8", "center");

  // 亮点 chips
  const improving = p.trends.filter((t) => t.delta7 > 0 && t.current > 4).map((t) => t.label);
  let chipY = 838;
  if (improving.length > 0) {
    text(ctx, "近 7 天进步", 60, chipY, 16, "#FFE66D", "left", true);
    let cx = 168;
    for (const name of improving.slice(0, 4)) {
      ctx.font = `14px ${FONT}`;
      const ww = ctx.measureText(name).width + 28;
      ctx.fillStyle = "rgba(78,205,196,0.16)";
      roundRectPath(ctx, cx, chipY - 15, ww, 30, 15);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      text(ctx, name, cx + ww / 2, chipY, 14, "#9fe6df", "center", true);
      cx += ww + 10;
      if (cx > W - 120) break;
    }
  } else {
    text(ctx, "保持稳定，继续每天十分钟就好", 60, chipY, 16, "#9aa3c8", "left");
  }

  // 建议卡
  const advice = p.advice.length ? p.advice : ["先玩一局，我们就能给你专属建议～"];
  const boxY = 902;
  const boxH = 24 + advice.length * 30 + 18;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRectPath(ctx, 40, boxY, W - 80, boxH, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(78,205,196,0.3)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  text(ctx, "💡 今日建议", 60, boxY + 28, 17, "#FFE66D", "left", true);
  advice.forEach((t, i) => {
    const lines = wrap(ctx, t, 15, W - 130);
    lines.forEach((ln, j) => {
      text(ctx, ln, 60, boxY + 28 + 30 + i * 30 + j * 20, 15, "#e6ebff", "left");
    });
  });

  // 底部二维码
  const qy = 1058;
  drawFakeQR(ctx, 44, qy, 96);
  text(ctx, "微信扫一扫", 160, qy + 32, 18, "#cfd6f0", "left", true);
  text(ctx, "陪长辈每天动动脑", 160, qy + 62, 14, "#8b93b8", "left");

  text(ctx, "岁月神偷 · 脑力花园", W / 2, 1170, 14, "#5a6285", "center");

  return canvas.toDataURL("image/png");
}

// === 家属关怀微信卡片 ===

export function renderFamilyCard(
  p: CognitiveProfile,
  warnings: string[],
  opts: { lastPlayedDays: number | null; dateLabel?: string } = { lastPlayedDays: null },
): string {
  const W = 750;
  const H = 1190;
  const { canvas, ctx } = makeCanvas(W, H);

  // 外背景（微信会话灰）
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#e9eaee");
  bg.addColorStop(1, "#dfe1e7");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 白色卡片 + 阴影
  const cardX = 28;
  const cardY = 28;
  const cardW = W - 56;
  const cardH = H - 56;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.fill();
  ctx.restore();

  const pad = 56;
  // 顶部绿色头带（微信绿）
  ctx.fillStyle = "#07C160";
  roundRectTop(ctx, cardX, cardY, cardW, 96, 22);
  ctx.fill();
  ctx.fillRect(cardX, cardY + 60, cardW, 36);
  text(ctx, "❤ 家属关怀", cardX + pad, cardY + 50, 23, "#ffffff", "left", true);
  text(ctx, "给家人的一封信", cardX + cardW - pad, cardY + 50, 14, "rgba(255,255,255,0.9)", "right");

  // 标题
  text(ctx, "长辈认知健康月报", cardX + pad, cardY + 150, 30, "#1a1a1a", "left", true);
  text(ctx, "爸妈最近的大脑状态，一图看懂", cardX + pad, cardY + 184, 16, "#888888", "left");

  // 三项统计
  const statY = cardY + 218;
  const statW = 190;
  const statH = 96;
  const stats: { label: string; value: string; color: string }[] = [
    { label: "综合认知指数", value: `${p.overall}`, color: "#07C160" },
    { label: "已训练认知域", value: `${p.trainedCount}/${p.axes.length}`, color: "#3E7CB1" },
    {
      label: "上次训练",
      value: opts.lastPlayedDays === null ? "未开始" : opts.lastPlayedDays <= 0 ? "今天" : `${opts.lastPlayedDays}天前`,
      color: "#FF9F43",
    },
  ];
  stats.forEach((s, i) => {
    const x = cardX + pad + i * (statW + 12);
    ctx.fillStyle = "#f4f6fb";
    roundRectPath(ctx, x, statY, statW, statH, 14);
    ctx.fill();
    text(ctx, s.label, x + statW / 2, statY + 28, 14, "#888888", "center");
    text(ctx, s.value, x + statW / 2, statY + 64, 28, s.color, "center", true);
  });

  // 关爱提醒
  const warnY = statY + statH + 26;
  const warnLines = warnings.length ? warnings : ["状态稳定，继续保持每天十分钟就好"];
  const warnH = 26 + warnLines.length * 30 + 18;
  ctx.fillStyle = "#FFF1E6";
  roundRectPath(ctx, cardX + pad, warnY, cardW - pad * 2, warnH, 14);
  ctx.fill();
  ctx.strokeStyle = "#FFB877";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  text(ctx, "👀 关爱提醒", cardX + pad + 16, warnY + 28, 17, "#E8730C", "left", true);
  warnLines.forEach((t, i) => {
    const lines = wrap(ctx, t, 15, cardW - pad * 2 - 40);
    lines.forEach((ln, j) => {
      text(ctx, (i === 0 && j === 0 ? "· " : j === 0 ? "· " : "  ") + ln,
        cardX + pad + 16, warnY + 28 + 32 + i * 30 + j * 20, 15, "#B5611B", "left");
    });
  });

  // 微信转发卡片预览
  const miniY = warnY + warnH + 24;
  const miniX = cardX + pad;
  const miniW = cardW - pad * 2;
  const miniH = 150;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 1;
  roundRectPath(ctx, miniX, miniY, miniW, miniH, 12);
  ctx.fill();
  ctx.stroke();
  // 缩略图
  const th = 118;
  const thx = miniX + 16;
  const thy = miniY + (miniH - th) / 2;
  const tg = ctx.createLinearGradient(thx, thy, thx + th, thy + th);
  tg.addColorStop(0, "#8B7CF8");
  tg.addColorStop(1, "#5a4bcf");
  ctx.fillStyle = tg;
  roundRectPath(ctx, thx, thy, th, th, 10);
  ctx.fill();
  text(ctx, "脑", thx + th / 2, thy + th / 2, 52, "#ffffff", "center", true);
  // 转发标题/描述
  const tx = thx + th + 18;
  text(ctx, "岁月神偷·脑力花园", tx, miniY + 36, 18, "#1a1a1a", "left", true);
  const desc = `长辈综合认知指数 ${p.overall}，已训练 ${p.trainedCount} 项认知域，快来陪爸妈动动脑～`;
  wrap(ctx, desc, 14, miniW - th - 50).slice(0, 2).forEach((ln, j) => {
    text(ctx, ln, tx, miniY + 70 + j * 22, 14, "#888888", "left");
  });
  text(ctx, "微信 · 链接", miniX + miniW - 16, miniY + miniH - 18, 12, "#b0b0b0", "right");

  // 底部免责 + 品牌
  const note = "本训练参考连线、画钟、Stroop 等标准化思路设计，仅供日常关注，不能替代医院诊断。";
  wrap(ctx, note, 13, cardW - pad * 2).forEach((ln, i) => {
    text(ctx, ln, cardX + pad, miniY + miniH + 30 + i * 20, 13, "#9a9a9a", "left");
  });
  text(ctx, "来自 · 岁月神偷脑力花园", W / 2, H - 44, 14, "#9a9a9a", "center");

  return canvas.toDataURL("image/png");
}

export function familyShareDesc(p: CognitiveProfile): string {
  return `长辈综合认知指数 ${p.overall}，已训练 ${p.trainedCount}/${p.axes.length} 项认知域，快来陪爸妈动动脑～`;
}

function defaultMonthLabel(): string {
  const d = new Date();
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 · 月度认知画像`;
}
