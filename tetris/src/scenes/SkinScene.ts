/**
 * SkinScene — 典藏怀旧皮肤（本地优先）
 * 已解锁可一键使用；未解锁用积分兑换后自动应用。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { skinManager, SKINS } from "../core/SkinManager";
import { progress } from "../core/ProgressStore";
import { NoticeScene } from "./NoticeScene";

interface Rect { x: number; y: number; w: number; h: number }

const CARD_H = 120;
const TOP = 96;

export class SkinScene {
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private buttons: { rect: Rect; action: () => void; primary?: boolean }[] = [];
  private notice: NoticeScene | null = null;

  constructor(private onBack: () => void) {
    this.bind();
  }

  private bind(): void {
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    if (this.notice) return;
    if (this.hit(this.backRect, x, y)) { audioSynth.playUi("button"); this.onBack(); return; }
    for (const b of this.buttons) {
      if (this.hit(b.rect, x, y)) { audioSynth.playUi("button"); b.action(); return; }
    }
  }

  private apply(id: string): void {
    const ok = skinManager.apply(id);
    if (ok) {
      this.notice = new NoticeScene("已切换", [`已应用「${skinManager.current().name}」`], "好的",
        () => { this.notice?.destroy(); this.notice = null; this.bind(); });
    }
  }

  private async purchase(id: string): Promise<void> {
    const ok = await skinManager.purchase(id);
    if (ok) {
      this.notice = new NoticeScene("兑换成功", [`已应用「${skinManager.current().name}」`], "好的",
        () => { this.notice?.destroy(); this.notice = null; this.bind(); });
    } else {
      this.notice = new NoticeScene("积分不足", ["看广告或签到可赚取积分"], "知道了",
        () => { this.notice?.destroy(); this.notice = null; this.bind(); });
    }
  }

  render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const pal = skinManager.getPalette();
    this.buttons = [];
    gameCanvas.draw((ctx) => { ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, w, h); }, -10);

    gameCanvas.drawText("怀旧皮肤", w / 2, 40, { size: 26, color: pal.text, bold: true });
    this.backRect = { x: 12, y: 16, w: 96, h: 48 };
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.roundRect(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12);
      ctx.fill();
    }, 1);
    gameCanvas.drawText("← 返回", this.backRect.x + this.backRect.w / 2, this.backRect.y + this.backRect.h / 2, { size: 16, color: pal.text, bold: true }, 2);

    SKINS.forEach((s, i) => {
      const y = TOP + i * (CARD_H + 14);
      const r: Rect = { x: 16, y, w: w - 32, h: CARD_H };
      const unlocked = skinManager.isUnlocked(s.id);
      const current = skinManager.current().id === s.id;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = s.palette.panel;
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 14);
        ctx.fill();
        ctx.strokeStyle = s.palette.accent;
        ctx.lineWidth = current ? 3 : 1;
        ctx.stroke();
      }, 1);
      // 配色预览小方块
      s.palette.blockColors.slice(0, 4).forEach((c, j) => {
        gameCanvas.drawRoundRect(r.x + 16 + j * 34, r.y + 18, 28, 28, 6, c, 2);
      });
      gameCanvas.drawText(s.emoji, r.x + 16, r.y + 78, { size: 30 });
      gameCanvas.drawText(s.name, r.x + 64, r.y + 40, { size: 20, color: pal.text, bold: true, align: "left" });
      gameCanvas.drawText(s.blurb, r.x + 64, r.y + 72, { size: 13, color: pal.subText, align: "left" });

      const btn: Rect = { x: r.x + r.w - 130, y: r.y + r.h - 54, w: 118, h: 44 };
      if (current) {
        this.buttons.push({ rect: btn, action: () => {} });
        gameCanvas.drawRoundRect(btn.x, btn.y, btn.w, btn.h, 12, "rgba(255,255,255,0.10)", 2);
        gameCanvas.drawText("使用中", btn.x + btn.w / 2, btn.y + btn.h / 2, { size: 17, color: pal.text, bold: true }, 3);
      } else if (unlocked) {
        this.buttons.push({ rect: btn, action: () => this.apply(s.id), primary: true });
        gameCanvas.drawRoundRect(btn.x, btn.y, btn.w, btn.h, 12, s.palette.accent, 2);
        gameCanvas.drawText("使用", btn.x + btn.w / 2, btn.y + btn.h / 2, { size: 17, color: s.palette.bg, bold: true }, 3);
      } else {
        this.buttons.push({ rect: btn, action: () => this.purchase(s.id), primary: true });
        gameCanvas.drawRoundRect(btn.x, btn.y, btn.w, btn.h, 12, s.palette.accent, 2);
        gameCanvas.drawText(`💎${s.pricePoints}`, btn.x + btn.w / 2, btn.y + btn.h / 2, { size: 17, color: s.palette.bg, bold: true }, 3);
      }
    });

    if (this.notice) this.notice.render();
  }

  destroy(): void { this.notice?.destroy(); gameCanvas.clearHandlers(); }
}
