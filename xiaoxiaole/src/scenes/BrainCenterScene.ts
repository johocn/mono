/**
 * BrainCenterScene — 认知中心（统一中枢）
 *
 * 把「认知评估报告 / 今日训练枢纽 / 家属关怀 / 各玩法」统筹到一个入口：
 * - 顶部：13 维认知雷达 + 综合认知指数（突出多维评估这一核心特色）
 * - 今日训练计划：依据复习到期、最弱维度、连签给出老人友好的今日建议
 * - 入口：我的认知画像（报告）、家属关怀、继续训练、按最弱维度开始
 *
 * 设计遵循适老化：大字号、首屏即见价值、少选择、正向鼓励。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { progress } from "../core/ProgressStore";
import { reviews } from "../core/ReviewStore";
import { getCognitiveProfile } from "../core/CognitiveProfile";
import { drawRadarChart } from "../ui/RadarChart";
import { ScrollView } from "../ui/ScrollView";
import { NAV_H } from "../ui/SceneChrome";
import type { ModeId } from "../config/LevelConfig";

export interface BrainCenterCallbacks {
  onBack(): void;
  onOpenProfile(): void;
  onOpenFamily(): void;
  /** 打开「最喜欢哪一款」投票问卷 */
  onOpenVote(): void;
  /** 打开留言建议页 */
  onOpenMessage(): void;
  onContinue(): void;
  onPickMode(mode: ModeId): void;
}

interface Rect { x: number; y: number; w: number; h: number }

export class BrainCenterScene {
  private cb: BrainCenterCallbacks;
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private profileRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private familyRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private voteRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private messageRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private continueRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private weakRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private time = 0;
  private lastTime = 0;
  private enterP = 0;
  private scroll = new ScrollView();
  private off = 0;

  constructor(cb: BrainCenterCallbacks) {
    this.cb = cb;
    this.lastTime = performance.now();
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
    gameCanvas.setScrollHandler((_dx, dy) => this.scroll.scrollBy(dy));
  }

  private update(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.time = now;
    if (this.enterP < 1) this.enterP = Math.min(1, this.enterP + dt / 0.35);
    this.render();
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    const yy = y + this.off; // 命中判定加回滚动偏移
    if (this.hit(this.backRect, x, yy)) { audioSynth.playUi("button"); this.cb.onBack(); return; }
    if (this.hit(this.profileRect, x, yy)) { audioSynth.playUi("button"); this.cb.onOpenProfile(); return; }
    if (this.hit(this.familyRect, x, yy)) { audioSynth.playUi("button"); this.cb.onOpenFamily(); return; }
    if (this.hit(this.voteRect, x, yy)) { audioSynth.playUi("button"); this.cb.onOpenVote(); return; }
    if (this.hit(this.messageRect, x, yy)) { audioSynth.playUi("button"); this.cb.onOpenMessage(); return; }
    if (this.hit(this.continueRect, x, yy)) { audioSynth.playUi("button"); this.cb.onContinue(); return; }
    if (this.hit(this.weakRect, x, yy)) {
      audioSynth.playUi("button");
      const p = getCognitiveProfile();
      if (p.weakest.length > 0) this.cb.onPickMode(p.weakest[0].mode as ModeId);
      else this.cb.onContinue();
      return;
    }
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const ease = 1; // 简化：中枢内不强制入场动画

    // 背景（固定，不随滚动）
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.5, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    // 滚动视口：顶部贴顶，底部止于导航条之上（h - NAV_H）
    const viewTop = 0;
    const viewBottom = h - NAV_H;
    const viewH = viewBottom - viewTop;

    const profile = getCognitiveProfile();
    const radar = profile.axes.map((a) => ({ label: a.label, value: a.value }));

    // 布局常量（设计坐标）
    const radius = Math.min(w * 0.26, 104);
    // 雷达标签会画到图形外（上下各约 34px），需预留空间，否则压到副标题/综合指数
    const cy = 142 + radius;
    const planY = cy + radius + 126;
    const planH = 144; // 行距加大后需更高，容纳最多 3 行建议
    const planX = 24;
    const planW = w - 48;
    const tileY = planY + planH + 16;
    const tileH = 64;
    const tileGap = 20; // 行/列间距加大，每行数据更舒展
    const tileW = (planW - tileGap) / 2;
    const btnW = Math.min(w - 48, 360);
    const btnX = (w - btnW) / 2;
    // 第二行入口：投票 / 留言（复用同一套磁贴尺寸，保持视觉一致）
    const tileY2 = tileY + tileH + tileGap;
    const btnY = tileY2 + tileH + 18;
    const contentBottom = btnY + 60 + 24; // 最底部元素（继续训练）+ 余量

    this.scroll.begin(viewH, contentBottom);
    const off = this.off = this.scroll.offsetY;

    gameCanvas.setClip({ x: 0, y: viewTop, w, h: viewH });

    // 返回（随内容一起滚动）
    this.backRect = { x: 16, y: 16, w: 50, h: 50 };
    gameCanvas.drawRoundRect(this.backRect.x, this.backRect.y - off, 50, 50, 12, "rgba(255,255,255,0.08)", 5);
    gameCanvas.drawText("‹", this.backRect.x + 25, this.backRect.y + 27 - off, { size: 30, color: "#b9c0dc", bold: true }, 6);

    // 标题
    gameCanvas.drawText("认知中心", w / 2, 44 - off, { size: 30, color: "#FFE66D", bold: true }, 5);
    gameCanvas.drawText("你的脑力花园全景", w / 2, 78 - off, { size: 14, color: "#9aa3c8" }, 5);

    // 雷达（上区居中）
    drawRadarChart(w / 2, cy - off, radius, radar, { animate: ease });

    // 综合指数
    gameCanvas.drawText(`综合认知指数  ${profile.overall}`, w / 2, cy + radius + 64 - off,
      { size: 18, color: "#4ECDC4", bold: true }, 6);
    gameCanvas.drawText(`已训练 ${profile.trainedCount} / ${profile.axes.length} 个认知域`,
      w / 2, cy + radius + 94 - off, { size: 13, color: "#8b93b8" }, 6);

    // === 今日训练计划 ===
    this.weakRect = { x: planX, y: planY, w: planW, h: planH };
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(planX, planY - off, planW, planH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.35)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText("📅 今日训练计划", planX + 18, planY + 26 - off, { size: 17, color: "#FFE66D", bold: true, align: "left" }, 6);

    const due = reviews.getDueCount();
    const lines: string[] = [];
    if (due > 0) lines.push(`📖 有 ${due} 项复习到期，先巩固记忆更牢靠`);
    if (profile.weakest.length > 0) {
      const wk = profile.weakest[0];
      lines.push(`💡 建议练「${wk.modeName}」强化「${wk.label}」`);
    }
    if (lines.length === 0) lines.push("✨ 今天状态不错，挑个喜欢的玩法保持手感");
    lines.forEach((t, i) => {
      gameCanvas.drawText(t, planX + 18, planY + 58 + i * 34 - off, { size: 14, color: "#e6ebff", align: "left" }, 6);
    });

    // === 两个入口：我的画像 / 家属关怀 ===
    this.profileRect = { x: planX, y: tileY, w: tileW, h: tileH };
    this.familyRect = { x: planX + tileW + tileGap, y: tileY, w: tileW, h: tileH };

    gameCanvas.draw((ctx) => {
      const g1 = ctx.createLinearGradient(planX, tileY - off, planX, tileY + tileH - off);
      g1.addColorStop(0, "#4ECDC4"); g1.addColorStop(1, "#2fa89f");
      ctx.fillStyle = g1; ctx.beginPath(); ctx.roundRect(planX, tileY - off, tileW, tileH, 14); ctx.fill();
      const g2 = ctx.createLinearGradient(this.familyRect.x, tileY - off, this.familyRect.x, tileY + tileH - off);
      g2.addColorStop(0, "#8B7CF8"); g2.addColorStop(1, "#5a4bcf");
      ctx.fillStyle = g2; ctx.beginPath(); ctx.roundRect(this.familyRect.x, tileY - off, tileW, tileH, 14); ctx.fill();
    }, 5);
    gameCanvas.drawText("🧠 我的画像", planX + 16, tileY + 26 - off, { size: 17, color: "#0c1a22", bold: true, align: "left" }, 6);
    gameCanvas.drawText("雷达·趋势·月报", planX + 16, tileY + 48 - off, { size: 12, color: "#0c1a22", align: "left" }, 6);
    gameCanvas.drawText("👪 家属关怀", this.familyRect.x + 16, tileY + 26 - off, { size: 17, color: "#fff", bold: true, align: "left" }, 6);
    gameCanvas.drawText("分享健康月报", this.familyRect.x + 16, tileY + 48 - off, { size: 12, color: "#E7E2FF", align: "left" }, 6);

    // === 第二行入口：最受欢迎投票 / 留言建议 ===
    this.voteRect = { x: planX, y: tileY2, w: tileW, h: tileH };
    this.messageRect = { x: planX + tileW + tileGap, y: tileY2, w: tileW, h: tileH };
    gameCanvas.draw((ctx) => {
      const g1 = ctx.createLinearGradient(planX, tileY2 - off, planX, tileY2 + tileH - off);
      g1.addColorStop(0, "#FF6B9D"); g1.addColorStop(1, "#E0679B");
      ctx.fillStyle = g1; ctx.beginPath(); ctx.roundRect(planX, tileY2 - off, tileW, tileH, 14); ctx.fill();
      const g2 = ctx.createLinearGradient(this.messageRect.x, tileY2 - off, this.messageRect.x, tileY2 + tileH - off);
      g2.addColorStop(0, "#FF9F43"); g2.addColorStop(1, "#F2784B");
      ctx.fillStyle = g2; ctx.beginPath(); ctx.roundRect(this.messageRect.x, tileY2 - off, tileW, tileH, 14); ctx.fill();
    }, 5);
    gameCanvas.drawText("🏆 最受欢迎", planX + 16, tileY2 + 26 - off,
      { size: 17, color: "#0c1a22", bold: true, align: "left" }, 6);
    gameCanvas.drawText("投出最喜欢的一款", planX + 16, tileY2 + 48 - off,
      { size: 12, color: "#0c1a22", align: "left" }, 6);
    gameCanvas.drawText("💬 留言建议", this.messageRect.x + 16, tileY2 + 26 - off,
      { size: 17, color: "#0c1a22", bold: true, align: "left" }, 6);
    gameCanvas.drawText("说说您的想法", this.messageRect.x + 16, tileY2 + 48 - off,
      { size: 12, color: "#0c1a22", align: "left" }, 6);

    // === 继续训练（主按钮） ===
    this.continueRect = { x: btnX, y: btnY, w: btnW, h: 60 };
    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(btnX, btnY - off, btnX, btnY + 60 - off);
      g.addColorStop(0, "#FFE66D"); g.addColorStop(1, "#f0b53e");
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(btnX, btnY - off, btnW, 60, 15); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.roundRect(btnX + 5, btnY + 5 - off, btnW - 10, 22, 11); ctx.fill();
    }, 5);
    gameCanvas.drawText("继续训练 ›", w / 2, btnY + 31 - off, { size: 23, color: "#0c1a22", bold: true }, 6);

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
