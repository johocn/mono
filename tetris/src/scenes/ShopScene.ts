/**
 * ShopScene — 道具中心（适老化大卡片）
 * 三类获取：看广告领道具/积分、积分兑换道具礼包与皮肤、领好物券（带货导流）。
 */

import { gameCanvas, fontPx } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { skinManager } from "../core/SkinManager";
import { progress, ITEM_KEYS } from "../core/ProgressStore";
import { ads, adItemLabel } from "../core/AdManager";
import { claimCoupon } from "../api/CouponApi";
import { getShopProducts } from "../config/ShopData";
import { NoticeScene } from "./NoticeScene";
import type { ShopProduct } from "../api/types";

interface Rect { x: number; y: number; w: number; h: number }
interface CardBtn { rect: Rect; action: () => void; label: string; primary?: boolean }

const CARD_H = 128;
const CARD_GAP = 14;
const TOP = 96;

export class ShopScene {
  private products = getShopProducts();
  private scrollY = 0;
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private adRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private notice: NoticeScene | null = null;
  private cardButtons: CardBtn[] = [];

  constructor(private onBack: () => void) {
    this.bind();
  }

  private bind(): void {
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setScrollHandler((_dx, dy) => {
      const contentH = TOP + this.products.length * (CARD_H + CARD_GAP) + 20;
      const maxScroll = Math.max(0, contentH - gameCanvas.getH());
      this.scrollY = Math.min(maxScroll, Math.max(0, this.scrollY - dy));
    });
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    if (this.notice) return;
    if (this.hit(this.backRect, x, y)) { audioSynth.playUi("button"); this.onBack(); return; }
    if (this.hit(this.adRect, x, y)) { audioSynth.playUi("button"); this.watchAd(); return; }
    for (const b of this.cardButtons) {
      if (this.hit(b.rect, x, y)) { audioSynth.playUi("button"); b.action(); return; }
    }
  }

  private watchAd(): void {
    const key = ITEM_KEYS[Math.floor(Math.random() * ITEM_KEYS.length)];
    ads.showRewarded({ item: key, count: 1 }, { title: "看视频得奖励" }, (granted) => {
      if (granted) {
        progress.addItem(key, 1);
        // 积分走服务端（earn_ad 每日上限防刷）
        progress.grantPoints(20, "earn_ad", `ad:${Date.now()}`);
        this.notice = new NoticeScene("奖励到账", [`获得「${adItemLabel(key)}」×1`, "积分 +20"], "收下",
          () => { this.notice?.destroy(); this.notice = null; this.bind(); });
      } else {
        this.bind();
      }
    });
  }

  private async buy(p: ShopProduct): Promise<void> {
    if (p.grants) {
      const cost = Math.floor(p.priceCents / 100);
      const ok = await progress.spendPointsOnline(cost, "spend_item");
      if (!ok) { this.needPoints(); return; }
      for (const k of Object.keys(p.grants) as (keyof typeof p.grants)[]) {
        progress.addItem(k, p.grants[k] ?? 0);
      }
      this.notice = new NoticeScene("兑换成功", ["道具已发放到背包"], "好的",
        () => { this.notice?.destroy(); this.notice = null; this.bind(); });
    } else if (p.skinId) {
      const ok = await skinManager.purchase(p.skinId);
      if (!ok) { this.needPoints(); return; }
      this.notice = new NoticeScene("已应用皮肤", [`已切换为「${p.name}」`], "好的",
        () => { this.notice?.destroy(); this.notice = null; this.bind(); });
    }
  }

  private needPoints(): void {
    this.notice = new NoticeScene("积分不足", ["看广告或签到可赚取积分"], "知道了",
      () => { this.notice?.destroy(); this.notice = null; this.bind(); });
  }

  private claim(p: ShopProduct): void {
    void claimCoupon();
    progress.addItem("coupon", 1);
    this.notice = new NoticeScene("领券成功", ["好物优惠券已入账"], "好的",
      () => { this.notice?.destroy(); this.notice = null; this.bind(); });
  }

  private computeCards(w: number, h: number): void {
    this.cardButtons = [];
    const pad = 16;
    const cardW = w - pad * 2;
    this.backRect = { x: 12, y: 16, w: 96, h: 48 };
    this.adRect = { x: w - 12 - 160, y: 16, w: 160, h: 48 };
    this.products.forEach((p, i) => {
      const y = TOP + i * (CARD_H + CARD_GAP) - this.scrollY;
      const rect: Rect = { x: pad, y, w: cardW, h: CARD_H };
      const isSkin = !!p.skinId;
      const isCoupon = p.category === "优惠券";
      if (isCoupon) {
        const btn: CardBtn = { rect: { x: rect.x + rect.w - 120, y: rect.y + rect.h - 56, w: 108, h: 44 }, action: () => this.claim(p), label: "领取" };
        this.cardButtons.push(btn);
      } else if (isSkin) {
        const unlocked = skinManager.isUnlocked(p.skinId!);
        const btn: CardBtn = {
          rect: { x: rect.x + rect.w - 130, y: rect.y + rect.h - 56, w: 118, h: 44 },
          action: () => this.buy(p),
          label: unlocked ? (skinManager.current().id === p.skinId ? "使用中" : "使用") : `💎${p.pricePoints}`,
          primary: !unlocked,
        };
        this.cardButtons.push(btn);
      } else {
        const cost = Math.floor(p.priceCents / 100);
        const b1: CardBtn = { rect: { x: rect.x + rect.w - 230, y: rect.y + rect.h - 56, w: 104, h: 44 }, action: () => this.watchAd(), label: "🎬 看广告" };
        const b2: CardBtn = { rect: { x: rect.x + rect.w - 118, y: rect.y + rect.h - 56, w: 106, h: 44 }, action: () => this.buy(p), label: `💎${cost}`, primary: true };
        this.cardButtons.push(b1, b2);
      }
    });
  }

  render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const pal = skinManager.getPalette();
    gameCanvas.draw((ctx) => { ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, w, h); }, -10);

    gameCanvas.drawText("道具中心", w / 2, 40, { size: 26, color: pal.text, bold: true });
    gameCanvas.drawText(`积分 ${progress.getPoints()}`, w / 2, 70, { size: 16, color: pal.subText });

    this.drawTopButton(this.backRect, "← 返回", "rgba(255,255,255,0.10)", pal.text);
    this.drawTopButton(this.adRect, "🎬 看广告得奖励", pal.accent, pal.bg);

    this.computeCards(w, h);
    for (let i = 0; i < this.products.length; i++) {
      const p = this.products[i];
      const y = TOP + i * (CARD_H + CARD_GAP) - this.scrollY;
      if (y + CARD_H < TOP - 4 || y > h) continue;
      this.drawCard(p, { x: 16, y, w: w - 32, h: CARD_H }, pal);
    }

    for (const b of this.cardButtons) {
      const isPrimary = (b as CardBtn & { primary?: boolean }).primary;
      this.drawCardButton(b.rect, b.label, isPrimary ? pal.accent : "rgba(255,255,255,0.10)", isPrimary ? pal.bg : pal.text);
    }

    if (this.notice) this.notice.render();
  }

  private drawCard(p: ShopProduct, r: Rect, pal: ReturnType<typeof skinManager.getPalette>): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = pal.panel;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }, 1);
    gameCanvas.drawText(p.emoji, r.x + 36, r.y + 38, { size: 38 });
    gameCanvas.drawText(p.name, r.x + 72, r.y + 30, { size: 19, color: pal.text, bold: true, align: "left" });
    gameCanvas.drawText(p.blurb, r.x + 72, r.y + 60, { size: 13, color: pal.subText, align: "left" });
    if (p.promoTag) {
      gameCanvas.drawText(p.promoTag, r.x + 72, r.y + 92, { size: 13, color: "#FFE66D", align: "left" });
    }
  }

  private drawTopButton(r: Rect, label: string, fill: string, textColor: string): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 12);
      ctx.fill();
    }, 1);
    gameCanvas.drawText(label, r.x + r.w / 2, r.y + r.h / 2, { size: 16, color: textColor, bold: true }, 2);
  }

  private drawCardButton(r: Rect, label: string, fill: string, textColor: string): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 12);
      ctx.fill();
    }, 3);
    gameCanvas.drawText(label, r.x + r.w / 2, r.y + r.h / 2, { size: 16, color: textColor, bold: true }, 4);
  }

  destroy(): void { this.notice?.destroy(); gameCanvas.clearHandlers(); }
}
