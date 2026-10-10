/**
 * PausePanel — 关卡内暂停面板（继续 / 重新开始 / 返回菜单）
 *
 * 三大模式共用。设计要点：
 * - 半透明全屏遮罩，阻断底层棋盘输入
 * - 三个 60px 高大按钮（适老化）
 * - 显示当前会话已用时长与今日剩余时长，让「惜时」变成可见的正反馈
 */

import { gameCanvas } from "./GameCanvas";
import { safety } from "../core/SafetyManager";
import { GAME_CONFIG } from "../core/GameConfig";
import { clamp01 } from "../core/Tween";

export type PauseAction = "resume" | "restart" | "exit";

interface BtnRect { action: PauseAction; x: number; y: number; w: number; h: number; label: string; color: string }

export class PausePanel {
  private open = false;
  private fade = 0;
  private btns: BtnRect[] = [];

  get isOpen(): boolean { return this.open; }

  show(): void { this.open = true; }
  hide(): void { this.open = false; }

  update(dt: number): void {
    const target = this.open ? 1 : 0;
    if (this.fade === target) return;
    const step = dt / 0.16;
    this.fade = target > this.fade
      ? Math.min(target, this.fade + step)
      : Math.max(target, this.fade - step);
  }

  /** 面板动画结束后才算真正可见（避免开关瞬间误触） */
  get isVisible(): boolean { return this.open && this.fade > 0.6; }

  draw(subtitle?: string): void {
    if (this.fade <= 0.001) return;
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const a = clamp01(this.fade);

    gameCanvas.drawRoundRect(0, 0, w, h, 0, `rgba(4,6,16,${0.8 * a})`, 200);

    const panelW = Math.min(w - 56, 340);
    const panelH = 340;
    const px = (w - panelW) / 2;
    const py = (h - panelH) / 2;

    gameCanvas.draw((ctx) => {
      ctx.globalAlpha = a;
      const grad = ctx.createLinearGradient(px, py, px, py + panelH);
      grad.addColorStop(0, "#232748");
      grad.addColorStop(1, "#151830");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(px, py, panelW, panelH, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }, 201);

    gameCanvas.drawText("暂停", w / 2, py + 44, { size: 30, color: "#FFE66D", bold: true }, 202);

    if (subtitle) {
      gameCanvas.drawText(subtitle, w / 2, py + 78, { size: 14, color: "#9aa3c8" }, 202);
    }

    // 会话时长信息
    const sessionMin = safety.getSessionMinutes();
    const dailyUsed = safety.getDailyMinutesUsed();
    const dailyLeft = Math.max(0, GAME_CONFIG.maxDailyMinutes - dailyUsed);
    gameCanvas.drawText(
      `本次已玩 ${sessionMin.toFixed(1)} 分钟 · 今日剩余 ${dailyLeft.toFixed(0)} 分钟`,
      w / 2, py + 106,
      { size: 13, color: "#8b93b8" }, 202,
    );

    const defs: { action: PauseAction; label: string; color: string }[] = [
      { action: "resume", label: "继续游戏", color: "#27ae60" },
      { action: "restart", label: "重新开始", color: "#e67e22" },
      { action: "exit", label: "返回菜单", color: "#5a6285" },
    ];

    this.btns = [];
    defs.forEach((d, i) => {
      const bw = panelW - 60;
      const bh = 58;
      const bx = px + 30;
      const by = py + 140 + i * (bh + 16);
      this.btns.push({ action: d.action, x: bx, y: by, w: bw, h: bh, label: d.label, color: d.color });

      gameCanvas.draw((ctx) => {
        ctx.globalAlpha = a;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 12);
        ctx.fill();
        // 顶部高光
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.beginPath();
        ctx.roundRect(bx + 4, by + 4, bw - 8, bh * 0.4, 10);
        ctx.fill();
        ctx.globalAlpha = 1;
      }, 202);

      gameCanvas.drawText(d.label, bx + bw / 2, by + bh / 2,
        { size: 22, color: "#fff", bold: true }, 203);
    });
  }

  hitTest(x: number, y: number): PauseAction | null {
    if (!this.isVisible) return null;
    for (const b of this.btns) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.action;
    }
    return null;
  }

  /** 面板可见时，一律阻断底层棋盘/按钮的输入 */
  blocksInput(): boolean {
    return this.isVisible;
  }
}
