/**
 * AdManager — 广告覆盖层（激励视频 / 插屏）
 *
 * 设计要点（适老化 + 合规）：
 * - 接管 gameCanvas 的 update / touch，广告期间暂停当前场景并屏蔽输入，结束恢复；
 * - 不打断专注：只在用户主动点击或自然断点触发；不自动跳转外链；
 * - 倒计时可跳过（rewarded 需看满才发奖励，3s 后可"跳过（无奖励）"）；
 * - 插屏携带 vendure 商品信息（宣传商品），底部"去购买"由调用方控制跳转；
 * - 所有文案大字号、高对比度、热区 ≥ 44px。
 */

import { gameCanvas, fontPx } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import type { ShopProduct } from "../api/types";
import type { ItemConfig } from "../config/LevelConfig";

export type AdKind = "rewarded" | "interstitial";

export interface AdReward {
  item: keyof ItemConfig;
  count: number;
}

export interface AdOptions {
  title?: string;
  product?: ShopProduct;
  onOpenProduct?: () => void;
}

interface Rect { x: number; y: number; w: number; h: number }

class AdOverlay {
  private kind: AdKind;
  private reward: AdReward | null;
  private opts: AdOptions;
  private onDone: (granted: boolean) => void;

  private prevTouch: ((x: number, y: number) => void) | null;
  private prevUpdate: (() => void) | null;

  private start = performance.now();
  private duration: number;
  private skippableAfter: number;

  private skipRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private buyRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private laterRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    kind: AdKind,
    reward: AdReward | null,
    opts: AdOptions,
    onDone: (granted: boolean) => void,
  ) {
    this.kind = kind;
    this.reward = reward;
    this.opts = opts;
    this.onDone = onDone;
    this.duration = kind === "rewarded" ? 5 : 4;
    this.skippableAfter = kind === "rewarded" ? 3 : 2;

    this.prevTouch = gameCanvas.getTouchHandler();
    this.prevUpdate = gameCanvas.getUpdateCallback();
    gameCanvas.setUpdateCallback(() => this.frame());
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
  }

  private frame(): void {
    const elapsed = (performance.now() - this.start) / 1000;
    this.render(elapsed);
    if (elapsed >= this.duration) this.close(this.kind === "rewarded");
  }

  private render(elapsed: number): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const remain = Math.max(0, this.duration - elapsed);
    const canSkip = elapsed >= this.skippableAfter;

    // 背景遮罩
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(10,12,28,0.93)";
      ctx.fillRect(0, 0, w, h);
    }, 200);

    // 顶部标签
    gameCanvas.drawText(this.kind === "rewarded" ? "激励广告" : "广告", w / 2, 56,
      { size: 16, color: "#8b93b8" }, 201);

    // 中央播放指示（脉冲圆 + 文案）
    const cx = w / 2;
    const cy = h * 0.4;
    const pulse = 26 + Math.abs(Math.sin(elapsed * 2)) * 12;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(78,205,196,0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, pulse + 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4ECDC4";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#4ECDC4";
      ctx.font = `bold ${fontPx(30)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▶", cx, cy + 1);
    }, 201);
    gameCanvas.drawText("广告播放中…", cx, cy + 52, { size: 15, color: "#b9c0dc" }, 201);
    gameCanvas.drawText(`${Math.ceil(remain)}s`, cx, cy + 80, { size: 22, color: "#FFE66D", bold: true }, 201);

    // 文案说明
    if (this.kind === "rewarded") {
      const r = this.reward;
      const label = r ? `观看完整广告得「${itemLabel(r.item)}」×${r.count}` : "观看完整广告领取奖励";
      gameCanvas.drawText(label, cx, cy + 118, { size: 16, color: "#e6ebff", bold: true }, 201);
    } else if (this.opts.product) {
      gameCanvas.drawText("为您推荐好物", cx, cy + 118, { size: 16, color: "#e6ebff", bold: true }, 201);
    }

    // 插屏：商品卡 + 去购买 / 稍后再说
    if (this.kind === "interstitial" && this.opts.product) {
      const p = this.opts.product;
      const cardW = Math.min(w - 48, 320);
      const cardX = (w - cardW) / 2;
      const cardY = h * 0.56;
      const cardH = 132;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 14);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,230,109,0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }, 201);
      gameCanvas.drawText(p.emoji, cardX + 36, cardY + 40, { size: 40 }, 202);
      gameCanvas.drawText(p.name, cardX + 72, cardY + 32, { size: 18, color: "#fff", bold: true, align: "left" }, 202);
      gameCanvas.drawText(p.blurb, cardX + 72, cardY + 60, { size: 12, color: "#9aa3c8", align: "left" }, 202);
      gameCanvas.drawText(`¥${(p.priceCents / 100).toFixed(0)}`, cardX + 72, cardY + 90,
        { size: 16, color: "#FFE66D", bold: true, align: "left" }, 202);
      gameCanvas.drawText(`¥${(p.originalCents / 100).toFixed(0)}`, cardX + 140, cardY + 90,
        { size: 12, color: "#6b7396", align: "left" }, 202);

      const btnW = (cardW - 36) / 2;
      this.buyRect = { x: cardX + 12, y: cardY + cardH + 14, w: btnW, h: 46 };
      this.laterRect = { x: cardX + 24 + btnW, y: cardY + cardH + 14, w: btnW, h: 46 };
      gameCanvas.drawRoundRect(this.buyRect.x, this.buyRect.y, this.buyRect.w, this.buyRect.h, 12, "#4ECDC4", 202);
      gameCanvas.drawText("去购买", this.buyRect.x + this.buyRect.w / 2, this.buyRect.y + 23,
        { size: 17, color: "#0c1a22", bold: true }, 203);
      gameCanvas.drawRoundRect(this.laterRect.x, this.laterRect.y, this.laterRect.w, this.laterRect.h, 12,
        "rgba(255,255,255,0.10)", 202);
      gameCanvas.drawStrokeRect(this.laterRect.x, this.laterRect.y, this.laterRect.w, this.laterRect.h, 12,
        "rgba(255,255,255,0.22)", 1.5, 203);
      gameCanvas.drawText("稍后再说", this.laterRect.x + this.laterRect.w / 2, this.laterRect.y + 23,
        { size: 17, color: "#e6ebff", bold: true }, 203);
    }

    // 跳过按钮（底部）
    const btnW = 150;
    const btnX = (w - btnW) / 2;
    const btnY = h - 64;
    this.skipRect = { x: btnX, y: btnY, w: btnW, h: 48 };
    const skipColor = canSkip ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)";
    gameCanvas.drawRoundRect(btnX, btnY, btnW, 48, 14, skipColor, 201);
    gameCanvas.drawStrokeRect(btnX, btnY, btnW, 48, 14, canSkip ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)", 1.5, 202);
    const skipText = canSkip ? "跳过 ▶" : `${Math.ceil(this.skippableAfter - elapsed)}s 后可跳过`;
    gameCanvas.drawText(skipText, w / 2, btnY + 24,
      { size: 16, color: canSkip ? "#e6ebff" : "#6b7396", bold: true }, 202);
  }

  private onTouch(x: number, y: number): void {
    const elapsed = (performance.now() - this.start) / 1000;
    const canSkip = elapsed >= this.skippableAfter;

    if (this.kind === "interstitial" && this.opts.product) {
      if (this.hit(this.buyRect, x, y)) {
        audioSynth.playUi("button");
        this.opts.onOpenProduct?.();
        this.close(false);
        return;
      }
      if (this.hit(this.laterRect, x, y)) {
        audioSynth.playUi("button");
        this.close(false);
        return;
      }
    }

    if (canSkip && this.hit(this.skipRect, x, y)) {
      audioSynth.playUi("button");
      this.close(false);
    }
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private close(granted: boolean): void {
    gameCanvas.setUpdateCallback(this.prevUpdate);
    gameCanvas.setTouchHandler(this.prevTouch);
    audioSynth.playUi("button");
    this.onDone(granted);
  }
}

function itemLabel(item: keyof ItemConfig): string {
  const meta: Record<keyof ItemConfig, string> = {
    hint: "提示", reshuffle: "重洗", reveal: "揭示", peek: "偷看", undo: "撤销", rehear: "重听",
    step: "补步", shield: "护盾", hammer: "锤子",
  };
  return meta[item];
}

export class AdManager {
  private overlay: AdOverlay | null = null;

  isShowing(): boolean { return this.overlay !== null; }

  showRewarded(reward: AdReward, opts: AdOptions, onDone: (granted: boolean) => void): void {
    if (this.overlay) return;
    this.overlay = new AdOverlay("rewarded", reward, opts, (g) => {
      this.overlay = null;
      onDone(g);
    });
  }

  showInterstitial(opts: AdOptions, onDone: (granted: boolean) => void): void {
    if (this.overlay) return;
    this.overlay = new AdOverlay("interstitial", null, opts, (g) => {
      this.overlay = null;
      onDone(g);
    });
  }
}

export const ads = new AdManager();
