/**
 * ResultScene — 结算页（分享裂变 A/B + 分享得道具/券）
 * 复用 MarketingShare：分享链接带归因参数；分享成功发放随机道具 + 领券。
 */

import { gameCanvas, fontPx } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { skinManager } from "../core/SkinManager";
import { progress, ITEM_KEYS } from "../core/ProgressStore";
import { getMarketingShareLink } from "../core/MarketingShare";
import { claimCoupon } from "../api/CouponApi";
import { NoticeScene } from "./NoticeScene";
import { computeStars, type LevelResult } from "../config/GameText";

interface Rect { x: number; y: number; w: number; h: number }

export class ResultScene {
  private r: LevelResult;
  private stars: number;
  private shareRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private againRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private homeRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private shopRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private notice: NoticeScene | null = null;

  constructor(
    result: LevelResult,
    private onRestart: () => void,
    private onExit: () => void,
    private onShop: () => void,
  ) {
    this.r = result;
    progress.recordScore(result.score);
    this.stars = computeStars(result.score, result.zen);
    this.bind();
  }

  private bind(): void { gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y)); }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    if (this.notice) return;
    if (this.hit(this.shareRect, x, y)) { audioSynth.playUi("button"); this.onShare(); return; }
    if (this.hit(this.againRect, x, y)) { audioSynth.playUi("button"); this.onRestart(); return; }
    if (this.hit(this.homeRect, x, y)) { audioSynth.playUi("button"); this.onExit(); return; }
    if (this.hit(this.shopRect, x, y)) { audioSynth.playUi("button"); this.onShop(); return; }
  }

  private async onShare(): Promise<void> {
    const link = getMarketingShareLink();
    const title = "俄罗斯方块·典藏版";
    const text = `我在「俄罗斯方块·典藏版」拿了 ${this.r.score} 分，来一起慢慢玩吧！`;
    let shared = false;
    try {
      const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
      if (typeof nav.share === "function") {
        await nav.share({ title, text, url: link });
        shared = true;
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        shared = true;
      }
    } catch { /* 用户取消分享，不计奖励 */ return; }

    if (!shared) return;
    // 分享成功：发放随机道具 + 领券
    const key = ITEM_KEYS[Math.floor(Math.random() * ITEM_KEYS.length)];
    progress.addItem(key, 1);
    void claimCoupon();
    this.notice = new NoticeScene(
      "分享成功 🎉",
      ["获得随机道具 ×1（已在背包）", "好物优惠券已入账"],
      "收下",
      () => { this.notice?.destroy(); this.notice = null; this.bind(); },
    );
  }

  render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const pal = skinManager.getPalette();
    gameCanvas.draw((ctx) => { ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, w, h); }, -10);

    gameCanvas.drawText(this.r.zen ? "轻松一局" : "本局结束", w / 2, h * 0.14, { size: 34, color: pal.text, bold: true });
    gameCanvas.drawText(`${this.r.score} 分`, w / 2, h * 0.14 + 56, { size: 44, color: pal.accent, bold: true });

    // 星级
    const starStr = "★★★★★★★★".slice(0, 3);
    const filled = "★".repeat(this.stars) + "☆".repeat(3 - this.stars);
    gameCanvas.drawText(filled, w / 2, h * 0.14 + 110, { size: 30, color: "#FFE66D", bold: true });

    gameCanvas.drawText(`历史最高 ${progress.getBestScore()} 分`, w / 2, h * 0.14 + 150, { size: 16, color: pal.subText });
    gameCanvas.drawText(`消行 ${this.r.lines} · 等级 ${this.r.level}`, w / 2, h * 0.14 + 178, { size: 16, color: pal.subText });

    const bw = Math.min(w - 80, 360);
    const bh = 60;
    const cx = (w - bw) / 2;
    this.shareRect = { x: cx, y: h * 0.52, w: bw, h: bh };
    this.drawButton(this.shareRect, "🔗 分享得道具", pal.accent, pal.bg);

    this.againRect = { x: cx, y: h * 0.52 + bh + 16, w: bw, h: bh };
    this.drawButton(this.againRect, "🔄 再来一局", "rgba(255,255,255,0.10)", pal.text);

    const half = (bw - 16) / 2;
    this.homeRect = { x: cx, y: h * 0.52 + (bh + 16) * 2, w: half, h: bh };
    this.shopRect = { x: cx + half + 16, y: h * 0.52 + (bh + 16) * 2, w: half, h: bh };
    this.drawButton(this.homeRect, "🏠 主页", "rgba(255,255,255,0.10)", pal.text);
    this.drawButton(this.shopRect, "🎁 道具", "rgba(255,255,255,0.10)", pal.text);

    if (this.notice) this.notice.render();
  }

  private drawButton(r: Rect, label: string, fill: string, textColor: string): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, 1);
    gameCanvas.drawText(label, r.x + r.w / 2, r.y + r.h / 2, { size: 20, color: textColor, bold: true }, 2);
  }

  destroy(): void { this.notice?.destroy(); gameCanvas.clearHandlers(); }
}
