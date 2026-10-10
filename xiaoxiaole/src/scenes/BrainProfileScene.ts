/**
 * BrainProfileScene — 我的认知画像
 *
 * 把训练成绩翻译成「认知画像」并对外可讲清价值：
 * - 13 维雷达（复用 RadarChart）
 * - 综合认知指数 + 已训练域数
 * - 近 7 天进步项 / 最弱维度趋势
 * - 个性化建议（老人友好）
 * - 一键复制「认知健康月报」文本（用于分享 / 家属沟通）
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { getCognitiveProfile, buildMonthlyReport } from "../core/CognitiveProfile";
import { getBaseline } from "../core/Baseline";
import { drawRadarChart } from "../ui/RadarChart";
import { renderProfilePoster } from "../ui/PosterRenderer";
import { showShareImage } from "../ui/ShareOverlay";
import { wrapText } from "../ui/ResultCard";
import { ScrollView } from "../ui/ScrollView";
import { NAV_H } from "../ui/SceneChrome";

export interface BrainProfileCallbacks {
  onBack(): void;
}

interface Rect { x: number; y: number; w: number; h: number }

export class BrainProfileScene {
  private cb: BrainProfileCallbacks;
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private copyRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private posterRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private toastUntil = 0;
  private toastText = "";
  private scroll = new ScrollView();
  private off = 0;

  constructor(cb: BrainProfileCallbacks) {
    this.cb = cb;
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.render());
    gameCanvas.setScrollHandler((_dx, dy) => this.scroll.scrollBy(dy));
  }

  private onTouch(x: number, y: number): void {
    const yy = y + this.off; // 命中判定加回滚动偏移
    if (this.hit(this.backRect, x, yy)) { audioSynth.playUi("button"); this.cb.onBack(); return; }
    if (this.hit(this.posterRect, x, yy)) { audioSynth.playUi("button"); this.makePoster(); return; }
    if (this.hit(this.copyRect, x, yy)) { audioSynth.playUi("button"); this.copyReport(); return; }
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private copyReport(): void {
    const text = buildMonthlyReport();
    const clip = navigator.clipboard;
    const done = (ok: boolean) => {
      this.toastText = ok ? "月报已复制，可发给家人" : "请长按选择下方文字复制";
      this.toastUntil = performance.now() + 2200;
      this.render();
    };
    if (clip?.writeText) clip.writeText(text).then(() => done(true)).catch(() => done(false));
    else done(false);
  }

  private makePoster(): void {
    try {
      const dataUrl = renderProfilePoster(getCognitiveProfile());
      showShareImage(dataUrl, { hint: "长按图片「保存到相册」，或点下方按钮下载", fileName: "认知画像海报.png" });
    } catch {
      this.toastText = "生成图片失败，请改用复制文字月报";
      this.toastUntil = performance.now() + 2400;
      this.render();
    }
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const p = getCognitiveProfile();
    const radar = p.axes.map((a) => ({ label: a.label, value: a.value }));

    // 背景固定
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.5, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    const viewTop = 0;
    const viewBottom = h - NAV_H;
    const viewH = viewBottom - viewTop;

    // 布局常量
    const radius = Math.min(w * 0.3, 120);
    const cy = 70 + radius;
    const cardY = cy + radius + 92;
    const cardX = 24;
    const cardW = w - 48;
    const adviceLines = p.advice.length ? p.advice : ["先玩一局，我们就能给你专属建议～"];
    const lineH = 26;
    const adviceMaxChars = Math.max(6, Math.floor((cardW - 32) / (14 * 0.95)));
    const adviceWrapped = adviceLines.map((l) => wrapText(l, adviceMaxChars, 3));
    const adviceTotal = adviceWrapped.reduce((s, ls) => s + ls.length, 0);
    const cardH = 24 + adviceTotal * lineH + 12;
    const chartY = cardY + cardH + 16;
    const chartH = 214;
    const btnW = Math.min(w - 48, 360);
    const btnX = (w - btnW) / 2;
    const btnY = chartY + chartH + 18;
    const copyY = btnY + 66;
    const contentBottom = copyY + 116; // 复制按钮 + 可能 toast 余量

    this.scroll.begin(viewH, contentBottom);
    const off = this.off = this.scroll.offsetY;

    gameCanvas.setClip({ x: 0, y: viewTop, w, h: viewH });

    this.backRect = { x: 16, y: 16, w: 50, h: 50 };
    gameCanvas.drawRoundRect(this.backRect.x, this.backRect.y - off, 50, 50, 12, "rgba(255,255,255,0.08)", 5);
    gameCanvas.drawText("‹", this.backRect.x + 25, this.backRect.y + 27 - off, { size: 30, color: "#b9c0dc", bold: true }, 6);

    gameCanvas.drawText("我的认知画像", w / 2, 44 - off, { size: 28, color: "#FFE66D", bold: true }, 5);

    drawRadarChart(w / 2, cy - off, radius, radar, {});

    gameCanvas.drawText(`综合认知指数  ${p.overall}`, w / 2, cy + radius + 26 - off,
      { size: 18, color: "#4ECDC4", bold: true }, 6);
    gameCanvas.drawText(`已训练 ${p.trainedCount} / ${p.axes.length} 个认知域`,
      w / 2, cy + radius + 50 - off, { size: 13, color: "#8b93b8" }, 6);

    // 趋势小结
    const improving = p.trends.filter((t) => t.delta7 > 0);
    let trendText = "再多玩几局，就能看到进步趋势啦";
    if (improving.length > 0) {
      const names = improving.slice(0, 3).map((t) => t.label).join("、");
      trendText = `近 7 天进步：${names}`;
    }
    gameCanvas.drawText(trendText, w / 2, cy + radius + 74 - off, { size: 13, color: "#FFE66D" }, 6);

    // 建议卡
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(cardX, cardY - off, cardW, cardH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.3)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText("💡 今日建议", cardX + 16, cardY + 24 - off, { size: 16, color: "#FFE66D", bold: true, align: "left" }, 6);
    let ay = cardY + 24 + lineH;
    adviceWrapped.forEach((ls) => {
      ls.forEach((ln) => {
        gameCanvas.drawText(ln, cardX + 16, ay - off, { size: 14, color: "#e6ebff", align: "left" }, 6);
        ay += lineH;
      });
    });

    // === 认知趋势折线图（综合指数随时间） ===
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(cardX, chartY - off, cardW, chartH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.3)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText("📈 认知趋势（综合指数）", cardX + 16, chartY + 24 - off,
      { size: 16, color: "#FFE66D", bold: true, align: "left" }, 6);

    const hist = p.history;
    if (hist.length < 2) {
      gameCanvas.drawText("再多玩几局，就能看到这条进步曲线啦～", w / 2, chartY + chartH / 2 + 6 - off,
        { size: 15, color: "#9aa3c8" }, 6);
    } else {
      const padL = 30, padR = 16, padT = 48, padB = 34;
      const plotX = cardX + padL;
      const plotW = cardW - padL - padR;
      const plotY = chartY + padT;
      const plotH = chartH - padT - padB;
      const yOf = (v: number) => plotY + plotH * (1 - v / 100);
      const xOf = (i: number) => plotX + (hist.length === 1 ? plotW / 2 : (plotW * i) / (hist.length - 1));
      const overalls = hist.map((hh) => Math.round(hh.values.reduce((s, v) => s + v, 0) / hh.values.length));

      // 网格 + Y 轴刻度
      [0, 50, 100].forEach((gv) => {
        const gy = yOf(gv);
        gameCanvas.draw((ctx) => {
          ctx.strokeStyle = "rgba(255,255,255,0.10)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(plotX, gy);
          ctx.lineTo(plotX + plotW, gy);
          ctx.stroke();
        }, 6);
        gameCanvas.drawText(`${gv}`, cardX + 14, gy - off, { size: 11, color: "#8b93b8", align: "left" }, 6);
      });

      // 面积 + 折线
      gameCanvas.draw((ctx) => {
        ctx.beginPath();
        overalls.forEach((v, i) => {
          const x = xOf(i), y = yOf(v);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "#4ECDC4";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.lineTo(xOf(overalls.length - 1), plotY + plotH);
        ctx.lineTo(xOf(0), plotY + plotH);
        ctx.closePath();
        const ag = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
        ag.addColorStop(0, "rgba(78,205,196,0.35)");
        ag.addColorStop(1, "rgba(78,205,196,0)");
        ctx.fillStyle = ag;
        ctx.fill();
      }, 6);

      // 节点
      overalls.forEach((v, i) => {
        gameCanvas.drawCircle(xOf(i), yOf(v), 4, "#4ECDC4", 7);
      });

      // 基线标注（首点）
      const base = getBaseline();
      if (base) {
        gameCanvas.drawText(`基线 ${base.overall}`, xOf(0), yOf(overalls[0]) - 12 - off,
          { size: 11, color: "#9aa3c8", align: "center" }, 7);
      }
      // X 轴日期（首/尾）
      gameCanvas.drawText(hist[0].date.slice(5), plotX, plotY + plotH + 14 - off,
        { size: 11, color: "#8b93b8", align: "left" }, 6);
      gameCanvas.drawText(hist[hist.length - 1].date.slice(5), plotX + plotW, plotY + plotH + 14 - off,
        { size: 11, color: "#8b93b8", align: "right" }, 6);
    }

    // 生成分享海报（主按钮）
    this.posterRect = { x: btnX, y: btnY, w: btnW, h: 56 };
    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(btnX, btnY - off, btnX, btnY + 56 - off);
      g.addColorStop(0, "#8B7CF8"); g.addColorStop(1, "#5a4bcf");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(btnX, btnY - off, btnW, 56, 15);
      ctx.fill();
    }, 5);
    gameCanvas.drawText("🖼 生成分享海报", w / 2, btnY + 28 - off, { size: 20, color: "#fff", bold: true }, 6);

    // 复制文字月报（次按钮）
    this.copyRect = { x: btnX, y: copyY, w: btnW, h: 46 };
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath();
      ctx.roundRect(btnX, copyY - off, btnW, 46, 13);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.5)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText("🔗 或复制文字月报", w / 2, copyY + 23 - off, { size: 16, color: "#9fe6df", bold: true }, 6);

    if (performance.now() < this.toastUntil && this.toastText) {
      const tw = Math.min(w - 48, this.toastText.length * 13 + 40);
      const tx = (w - tw) / 2;
      const ty = copyY + 58 - off;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.88)";
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 34, 10);
        ctx.fill();
      }, 60);
      gameCanvas.drawText(this.toastText, w / 2, ty + 17 - off, { size: 13, color: "#fff" }, 61);
    }

    gameCanvas.setClip(null);
    // 滚动条指示器从 y=70 起绘，避开右上「主页」按钮（其下沿≈64），不与底部导航条重叠
    this.scroll.drawScrollbar(w - 8, 70, viewH - 70);
  }

  destroy(): void {
    gameCanvas.setScrollHandler(null);
    gameCanvas.setClip(null);
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
