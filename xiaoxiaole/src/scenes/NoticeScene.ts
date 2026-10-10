/**
 * NoticeScene — 全屏提示页（替代浏览器 alert）
 *
 * 适老化要点：
 * - 大字号、单行短句、居中卡片，不用系统弹窗（会打断沉浸、且无法控制字号）
 * - 只有一个主操作，避免选择困难
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { safety } from "../core/SafetyManager";
import { wrapText } from "../ui/ResultCard";

export class NoticeScene {
  private btn = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    private title: string,
    private lines: string[],
    private buttonLabel: string,
    private onClose: () => void,
  ) {
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.render());
  }

  private onTouch(x: number, y: number): void {
    const b = this.btn;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
      audioSynth.playUi("button");
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

    const cardW = Math.min(w - 44, 380);
    const lineH = 26;
    const maxChars = Math.max(4, Math.floor((cardW - 40) / (15 * 0.95)));
    const wrappedAll = this.lines.map((l) => wrapText(l, maxChars, 0));
    const totalLines = wrappedAll.reduce((s, ls) => s + ls.length, 0);
    const cardH = 66 + totalLines * lineH + 90;
    const cardX = (w - cardW) / 2;
    const cardY = (h - cardH) / 2 - 20;

    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,230,109,0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }, 5);

    gameCanvas.drawText(this.title, w / 2, cardY + 38,
      { size: 24, color: "#FFE66D", bold: true }, 6);

    let y = cardY + 76;
    for (const ls of wrappedAll) {
      for (const ln of ls) {
        gameCanvas.drawText(ln, w / 2, y, { size: 15, color: "#dfe5ff" }, 6);
        y += lineH;
      }
    }

    const btnW = Math.min(cardW - 48, 240);
    const btnH = 56;
    const btnX = (w - btnW) / 2;
    const btnY = cardY + cardH - 74;
    this.btn = { x: btnX, y: btnY, w: btnW, h: btnH };
    safety.assertTapSize(Math.min(btnW, btnH), "notice-button");

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
      grad.addColorStop(0, "#4ECDC4");
      grad.addColorStop(1, "#2fa89f");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(btnX, btnY, btnW, btnH, 14);
      ctx.fill();
    }, 6);
    gameCanvas.drawText(this.buttonLabel, w / 2, btnY + btnH / 2,
      { size: 20, color: "#0c1a22", bold: true }, 7);
  }

  destroy(): void {
    gameCanvas.setTouchHandler(null);
    gameCanvas.setUpdateCallback(null);
  }
}
