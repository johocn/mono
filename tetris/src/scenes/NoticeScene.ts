/**
 * NoticeScene — 通用提示 / 确认弹层（适老化大字号）
 * 用作：每日时长上限、登录未完成、退出确认、领奖提示等。
 */

import { gameCanvas, fontPx } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { safety } from "../core/SafetyManager";
import { skinManager } from "../core/SkinManager";

interface NoticeButton {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export class NoticeScene {
  private title: string;
  private lines: string[];
  private button: NoticeButton;
  private secondary?: NoticeButton;

  private btnRect = { x: 0, y: 0, w: 0, h: 0 };
  private secRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(title: string, lines: string[], buttonLabel: string, onClick: () => void, secondary?: NoticeButton) {
    this.title = title;
    this.lines = lines;
    this.button = { label: buttonLabel, onClick, primary: true };
    this.secondary = secondary;
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
  }

  private onTouch(x: number, y: number): void {
    if (this.hit(this.btnRect, x, y)) {
      audioSynth.playUi("button");
      this.button.onClick();
      return;
    }
    if (this.secondary && this.hit(this.secRect, x, y)) {
      audioSynth.playUi("button");
      this.secondary.onClick();
    }
  }

  private hit(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  destroy(): void { gameCanvas.clearHandlers(); }

  render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const palette = skinManager.getPalette();
    const bg = palette.bg;
    const panel = palette.panel;
    const text = palette.text;
    const sub = palette.subText;
    const accent = palette.accent;

    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, w, h);
    }, 100);

    const pw = Math.min(w - 48, 360);
    const ph = 200 + this.lines.length * 30;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 18);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }, 101);

    gameCanvas.drawText(this.title, w / 2, py + 44, { size: 26, bold: true, color: text }, 102);
    this.lines.forEach((ln, i) => {
      gameCanvas.drawText(ln, w / 2, py + 92 + i * 30, { size: 17, color: sub }, 102);
    });

    const bw = this.secondary ? (pw - 36) / 2 : pw - 48;
    const bh = 52;
    const by = py + ph - bh - 18;
    if (this.secondary) {
      this.secRect = { x: px + 12, y: by, w: bw, h: bh };
      gameCanvas.drawRoundRect(this.secRect.x, this.secRect.y, bw, bh, 12, "rgba(255,255,255,0.10)", 102);
      gameCanvas.drawStrokeRect(this.secRect.x, this.secRect.y, bw, bh, 12, "rgba(255,255,255,0.25)", 1.5, 103);
      gameCanvas.drawText(this.secondary.label, this.secRect.x + bw / 2, this.secRect.y + bh / 2, { size: 18, color: text, bold: true }, 103);
      this.btnRect = { x: px + 24 + bw, y: by, w: bw, h: bh };
    } else {
      this.btnRect = { x: px + 24, y: by, w: bw, h: bh };
    }
    safety.assertTapSize(bh, "notice-button");
    gameCanvas.drawRoundRect(this.btnRect.x, this.btnRect.y, this.btnRect.w, this.btnRect.h, 12, accent, 102);
    gameCanvas.drawText(this.button.label, this.btnRect.x + this.btnRect.w / 2, this.btnRect.y + bh / 2, { size: 19, color: bg, bold: true }, 103);
  }
}
