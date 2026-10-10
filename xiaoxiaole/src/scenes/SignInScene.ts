/**
 * SignInScene — 连续签到（7 天循环）
 *
 * 对标主流「每日签到」留存钩子：
 * - 进入即签到（若今日未签），按连签天数发奖励（道具 / 积分）
 * - 7 天日历展示：已签(金✓) / 今日(高亮) / 未到(灰)
 * - 关闭后回到主菜单，由主菜单统一触发成就评估（连签成就随之解锁）
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { safety } from "../core/SafetyManager";
import { progress } from "../core/ProgressStore";
import { ScrollView } from "../ui/ScrollView";
import { NAV_H } from "../ui/SceneChrome";
import { wrapText } from "../ui/ResultCard";

const DAY_REWARD: Record<number, string> = {
  1: "提示×1", 2: "积分+10", 3: "重洗×1", 4: "积分+15", 5: "揭示×1", 6: "积分+20", 7: "护盾×1 积分+30",
};

export class SignInScene {
  private result = progress.signInToday();
  private closeRect: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };
  private scroll = new ScrollView();
  private off = 0;

  constructor(private onClose: () => void) {
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.render());
    gameCanvas.setScrollHandler((_dx, dy) => this.scroll.scrollBy(dy));
    if (!this.result.already) audioSynth.playUi("item");
  }

  private onTouch(x: number, y: number): void {
    const b = this.closeRect;
    const yy = y + this.off; // 命中判定加回滚动偏移
    if (x > b.x && x < b.x + b.w && yy > b.y && yy < b.y + b.h) {
      audioSynth.playUi("button");
      gameCanvas.setScrollHandler(null);
      gameCanvas.setClip(null);
      gameCanvas.setTouchHandler(null);
      gameCanvas.setUpdateCallback(null);
      this.onClose();
    }
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

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
    const pad = 20;
    const gap = 8;
    const cellW = (w - pad * 2 - gap * 6) / 7;
    const cellH = 96;
    const top = 140;
    const bannerY = top + cellH + 28;
    const bw = Math.min(w - 80, 280);
    const bh = 56;
    const bx = (w - bw) / 2;
    const by = bannerY + 56 + 40;
    const contentBottom = by + bh + 24;

    this.scroll.begin(viewH, contentBottom);
    const off = this.off = this.scroll.offsetY;

    gameCanvas.setClip({ x: 0, y: viewTop, w, h: viewH });

    gameCanvas.drawText("每日签到", w / 2, 70 - off, { size: 30, color: "#FFE66D", bold: true }, 5);
    const streak = this.result.day;
    gameCanvas.drawText(`已连续签到 ${streak} 天 · 满 7 天有大奖`, w / 2, 104 - off, { size: 15, color: "#9be8df" }, 5);

    // 7 天日历
    for (let i = 1; i <= 7; i++) {
      const x = pad + (i - 1) * (cellW + gap);
      const claimed = i < streak || (this.result.already && i <= streak);
      const isToday = i === streak && !this.result.already;
      const isBig = i === 7;

      gameCanvas.draw((ctx) => {
        ctx.fillStyle = isToday ? "rgba(255,230,109,0.20)" : "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.roundRect(x, top - off, cellW, cellH, 12);
        ctx.fill();
        ctx.strokeStyle = isToday ? "#FFE66D" : (claimed ? "rgba(255,230,109,0.5)" : "rgba(255,255,255,0.14)");
        ctx.lineWidth = isToday ? 2.5 : 1.5;
        ctx.stroke();
      }, 6);

      gameCanvas.drawText(`第${i}天`, x + cellW / 2, top + 20 - off, { size: 12, color: claimed ? "#FFE66D" : "#aab2d8", bold: true }, 7);
      gameCanvas.drawText(isBig ? "🎁" : "🎈", x + cellW / 2, top + 50 - off, { size: 24 }, 7);
      const rlines = wrapText(DAY_REWARD[i], Math.max(4, Math.floor((cellW - 12) / (9.5 * 0.95))), 2);
      rlines.forEach((ln, j) => {
        gameCanvas.drawText(ln, x + cellW / 2, top + cellH - 12 - (rlines.length - 1 - j) * 14 - off,
          { size: 9.5, color: claimed ? "#FFE66D" : "#9aa3c8" }, 7);
      });
      if (claimed) {
        gameCanvas.drawText("✓", x + cellW - 14, top + 16 - off, { size: 14, color: "#FFE66D", bold: true }, 8);
      }
    }

    // 今日奖励横幅
    gameCanvas.drawRoundRect(pad, bannerY - off, w - pad * 2, 56, 12, "rgba(78,205,196,0.14)", 8);
    gameCanvas.drawStrokeRect(pad, bannerY - off, w - pad * 2, 56, 12, "rgba(78,205,196,0.5)", 1.5, 9);
    if (this.result.already) {
      gameCanvas.drawText("今天已经签到啦，明天再来～", w / 2, bannerY + 30, { size: 16, color: "#9be8df", bold: true }, 9);
    } else {
      const label = DAY_REWARD[this.result.day];
      const bannerLines = wrapText(`今日签到获得：${label}${this.result.points ? ` · 积分+${this.result.points}` : ""}`,
        Math.floor((w - pad * 2 - 32) / (16 * 0.95)), 2);
      bannerLines.forEach((ln, j) => {
        gameCanvas.drawText(ln, w / 2, bannerY + 18 + j * 22 - off, { size: 16, color: "#9be8df", bold: true }, 9);
      });
    }

    // 关闭按钮
    this.closeRect = { x: bx, y: by, w: bw, h: bh };
    safety.assertTapSize(Math.min(bw, bh), "signin-close");
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(bx, by - off, bx, by + bh - off);
      grad.addColorStop(0, "#4ECDC4");
      grad.addColorStop(1, "#2fa89f");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, by - off, bw, bh, 14);
      ctx.fill();
    }, 6);
    gameCanvas.drawText("完成", w / 2, by + bh / 2 - off, { size: 20, color: "#0c1a22", bold: true }, 7);

    gameCanvas.setClip(null);
    // 滚动条指示器从 y=70 起绘，避开右上「主页」按钮（其下沿≈64），不与底部导航条重叠
    this.scroll.drawScrollbar(w - 8, 70, viewH - 70);
  }

  destroy(): void {
    gameCanvas.setScrollHandler(null);
    gameCanvas.setClip(null);
    gameCanvas.setTouchHandler(null);
    gameCanvas.setUpdateCallback(null);
  }
}
