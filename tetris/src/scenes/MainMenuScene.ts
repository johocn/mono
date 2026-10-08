/**
 * MainMenuScene — 主菜单（适老化大字号）
 * 入口：开始游戏 / 道具中心 / 皮肤 / 每日签到；展示历史最高分。
 */

import { gameCanvas, fontPx } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { skinManager } from "../core/SkinManager";
import { progress } from "../core/ProgressStore";
import { authStore } from "../core/AuthStore";
import { redirectToSsoLogin } from "../core/SsoAuth";
import { NoticeScene } from "./NoticeScene";

interface Rect { x: number; y: number; w: number; h: number }

export class MainMenuScene {
  private startRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private shopRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private skinRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private signRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private loginRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private notice: NoticeScene | null = null;

  constructor(
    private onStart: () => void,
    private onShop: () => void,
    private onSkin: () => void,
  ) {
    // 必须先绑定菜单自身 handler，再弹每日礼包：NoticeScene 构造会接管点击用于关闭弹层，
    // 若先弹礼包再 bind() 会覆盖掉关闭弹层的 handler，导致弹层无法关闭、整页无法点击。
    this.bind();
    this.maybeDailyGift();
  }

  private bind(): void {
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
  }

  private maybeDailyGift(): void {
    const gift = progress.dailyGift();
    if (gift) {
      this.notice = new NoticeScene(
        "今日好礼",
        ["登录领取到随机道具 ×1", "已在背包中，进游戏可用"],
        "收下",
        () => { this.notice?.destroy(); this.notice = null; this.bind(); },
      );
    }
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    if (this.notice) return;
    if (this.loginRect && this.hit(this.loginRect, x, y)) { audioSynth.playUi("button"); redirectToSsoLogin(); return; }
    if (this.hit(this.startRect, x, y)) { audioSynth.playUi("button"); this.onStart(); return; }
    if (this.hit(this.shopRect, x, y)) { audioSynth.playUi("button"); this.onShop(); return; }
    if (this.hit(this.skinRect, x, y)) { audioSynth.playUi("button"); this.onSkin(); return; }
    if (this.hit(this.signRect, x, y)) { audioSynth.playUi("button"); this.onSign(); return; }
  }

  private onSign(): void {
    const res = progress.signInToday();
    if (res.already) {
      this.notice = new NoticeScene("今日已签到", [`连续签到 ${res.day} 天`], "好的",
        () => { this.notice?.destroy(); this.notice = null; this.bind(); });
    } else if (res.reward) {
      this.notice = new NoticeScene("签到成功", [`连续签到 ${res.day} 天`, `获得道具 ×1、积分 +10`], "好的",
        () => { this.notice?.destroy(); this.notice = null; this.bind(); });
    } else {
      this.notice = new NoticeScene("签到成功", [`连续签到 ${res.day} 天`, "积分已同步到云端"], "好的",
        () => { this.notice?.destroy(); this.notice = null; this.bind(); });
    }
  }

  render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const pal = skinManager.getPalette();

    gameCanvas.draw((ctx) => { ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, w, h); }, -10);
    gameCanvas.drawText("俄罗斯方块", w / 2, h * 0.16, { size: 40, color: pal.text, bold: true });
    gameCanvas.drawText("· 典藏版 ·", w / 2, h * 0.16 + 46, { size: 22, color: pal.accent, bold: true });
    gameCanvas.drawText(`历史最高 ${progress.getBestScore()} 分`, w / 2, h * 0.16 + 86,
      { size: 16, color: pal.subText });

    const bw = Math.min(w - 80, 360);
    const bh = 64;
    const cx = (w - bw) / 2;

    this.startRect = { x: cx, y: h * 0.34, w: bw, h: bh };
    this.drawBigButton(this.startRect, "🎮 开始游戏", pal.accent, pal.bg);

    this.shopRect = { x: cx, y: h * 0.34 + bh + 18, w: bw, h: bh };
    this.drawBigButton(this.shopRect, "🎁 道具中心", "rgba(255,255,255,0.10)", pal.text);

    this.skinRect = { x: cx, y: h * 0.34 + (bh + 18) * 2, w: bw, h: bh };
    this.drawBigButton(this.skinRect, "🎨 怀旧皮肤", "rgba(255,255,255,0.10)", pal.text);

    this.signRect = { x: cx, y: h * 0.34 + (bh + 18) * 3, w: bw, h: bh };
    this.drawBigButton(this.signRect, "📅 每日签到", "rgba(255,255,255,0.10)", pal.text);

    if (!authStore.isLoggedIn()) {
      this.loginRect = { x: cx, y: h * 0.34 + (bh + 18) * 4, w: bw, h: bh };
      this.drawBigButton(this.loginRect, "🔑 登录同步进度", "rgba(255,255,255,0.10)", pal.text);
    } else {
      this.loginRect = { x: 0, y: 0, w: 0, h: 0 };
    }

    gameCanvas.drawText("大字号 · 高对比 · 慢节奏 · 护眼", w / 2, h - 40, { size: 14, color: pal.subText });

    if (this.notice) this.notice.render();
  }

  private drawBigButton(r: Rect, label: string, fill: string, textColor: string): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, 1);
    gameCanvas.drawText(label, r.x + r.w / 2, r.y + r.h / 2, { size: 22, color: textColor, bold: true }, 2);
  }

  destroy(): void { this.notice?.destroy(); gameCanvas.clearHandlers(); }
}
