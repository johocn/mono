/**
 * AchievementScene — 成就墙（查看已达成 / 未达成）
 *
 * 与 AchievementStore 配合：成就定义与判定集中维护，本场景仅做展示。
 * 解锁逻辑在关键时机由 achievements.evaluate() 触发，奖励通过 ResultScene/主菜单庆祝弹窗发放。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { safety } from "../core/SafetyManager";
import { achievements } from "../core/AchievementStore";
import { ScrollView } from "../ui/ScrollView";
import { NAV_H } from "../ui/SceneChrome";
import { wrapText } from "../ui/ResultCard";

export class AchievementScene {
  private closeRect: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };
  private scroll = new ScrollView();
  private off = 0;

  constructor(private onClose: () => void) {
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.render());
    gameCanvas.setScrollHandler((_dx, dy) => this.scroll.scrollBy(dy));
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
    const list = achievements.list();
    const unlocked = achievements.getUnlockedCount();

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
    const rowH = 78;
    const gap = 12;
    const top = 128;
    const by = top + list.length * (rowH + gap) + 10;
    const bw = Math.min(w - 80, 280);
    const bh = 54;
    const bx = (w - bw) / 2;
    const contentBottom = by + bh + 24;

    this.scroll.begin(viewH, contentBottom);
    const off = this.off = this.scroll.offsetY;

    gameCanvas.setClip({ x: 0, y: viewTop, w, h: viewH });

    gameCanvas.drawText("成就墙", w / 2, 64 - off, { size: 30, color: "#FFE66D", bold: true }, 5);
    gameCanvas.drawText(`已解锁 ${unlocked} / ${list.length}`, w / 2, 96 - off, { size: 15, color: "#9be8df" }, 5);

    list.forEach((item, i) => {
      const y = top + i * (rowH + gap) - off;
      const x = pad;
      const rw = w - pad * 2;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = item.unlocked ? "rgba(255,230,109,0.14)" : "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.roundRect(x, y, rw, rowH, 14);
        ctx.fill();
        ctx.strokeStyle = item.unlocked ? "rgba(255,230,109,0.5)" : "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }, 6);

      gameCanvas.drawText(item.def.icon, x + 36, y + rowH / 2, { size: 34 }, 7);
      gameCanvas.drawText(item.def.name, x + 70, y + 26, { size: 18, color: "#fff", bold: true, align: "left" }, 7);
      const descMax = Math.max(6, Math.floor((rw - 90) / (13 * 0.95)));
      wrapText(item.def.desc, descMax, 2).forEach((ln, j) => {
        gameCanvas.drawText(ln, x + 70, y + 52 + j * 17, { size: 13, color: "#9aa3c8", align: "left" }, 7);
      });

      const status = item.unlocked ? `✓ +${item.def.rewardPoints}` : "🔒";
      gameCanvas.drawText(status, x + rw - 16, y + rowH / 2, {
        size: item.unlocked ? 16 : 18,
        color: item.unlocked ? "#FFE66D" : "#666e91",
        bold: true, align: "right",
      }, 7);
    });

    this.closeRect = { x: bx, y: by, w: bw, h: bh };
    safety.assertTapSize(Math.min(bw, bh), "achv-close");
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(bx, by - off, bx, by + bh - off);
      grad.addColorStop(0, "#4ECDC4");
      grad.addColorStop(1, "#2fa89f");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, by - off, bw, bh, 14);
      ctx.fill();
    }, 6);
    gameCanvas.drawText("返回", w / 2, by + bh / 2 - off, { size: 20, color: "#0c1a22", bold: true }, 7);

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
