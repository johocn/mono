/**
 * ShopScene — 特惠花园（商品橱窗 + 营销 + 广告入口 + 道具礼包售卖）
 *
 * 职责：
 * - 双标签：🛍️ 健康好物（实体商品）/ 🎁 道具礼包（Vendure 在售虚拟道具）
 * - 健康好物："去购买"跳转真实 vendure 商品页
 * - 道具礼包：购买后按 grants 发放到背包
 *   · 演示 / 无真实后端：点击直接发放（模拟已完成支付）
 *   · 真实 Vendure：点击打开商品页，付款后由后端按 grants 合同发货
 * - 促销横幅：限时折扣倒计时 + 优惠券码
 * - 底部统一"看广告领训练道具"入口（rewarded 视频 → 随机道具入背包）
 */

import { gameCanvas } from "../ui/GameCanvas";
import { NAV_H } from "../ui/SceneChrome";
import { audioSynth } from "../ui/AudioSynth";
import { progress } from "../core/ProgressStore";
import { ads } from "../core/AdManager";
import { api } from "../api/MockApi";
import { ENV } from "../core/Env";
import { buyPack, ITEM_NAME, PLACEHOLDER_RE, describeGrants } from "../core/Purchase";
import { POINTS_RULES } from "../config/PointsConfig";
import { getOfficialSkin } from "../config/SkinPresets";
import { skinStore, unlockSkin } from "../core/SkinStore";
import { skinManager } from "../core/SkinManager";
import { skinApi } from "../core/SkinApi";
import type { ShopProduct, ShopPromotion, ItemKind } from "../api/types";
import type { ItemConfig } from "../config/LevelConfig";
import { HOME_STYLES, resolveHomeStyle, type HomeStyleId } from "../config/homeStyles";
import { wrapText } from "../ui/ResultCard";

interface Rect { x: number; y: number; w: number; h: number }

const AD_ITEMS: ItemKind[] = ["hint", "reshuffle", "undo", "peek"];

export class ShopScene {
  private onBack: () => void;
  private products: ShopProduct[] = [];
  private promotions: ShopPromotion[] = [];
  private loaded = false;

  private tab: "goods" | "items" | "skins" | "style" = "goods";
  private backRect: Rect = { x: 14, y: 16, w: 52, h: 52 };
  private adRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private tabRects: Rect[] = [];
  private buyRects: { rect: Rect; url: string }[] = [];
  private packRects: { rect: Rect; pack: ShopProduct }[] = [];
  private skinRects: { rect: Rect; product: ShopProduct }[] = [];
  private styleRects: { rect: Rect; id: HomeStyleId }[] = [];

  private toastText = "";
  private toastUntil = 0;
  private lastTime = performance.now();

  constructor(onBack: () => void) {
    this.onBack = onBack;
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));

    Promise.all([api.getProducts(), api.getPromotions()]).then(([p, promo]) => {
      this.products = p;
      this.promotions = promo;
      this.loaded = true;
    });
  }

  private update(now: number): void {
    this.lastTime = now;
    this.render();
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private showToast(text: string): void {
    this.toastText = text;
    this.toastUntil = performance.now() + 2200;
  }

  private onTouch(x: number, y: number): void {
    for (let i = 0; i < this.tabRects.length; i++) {
      if (this.hit(this.tabRects[i], x, y)) {
        audioSynth.playUi("button");
        const keys: ("goods" | "items" | "skins" | "style")[] = ["goods", "items", "skins", "style"];
        this.tab = keys[i];
        return;
      }
    }
    if (this.hit(this.backRect, x, y)) {
      audioSynth.playUi("button");
      this.onBack();
      return;
    }
    if (this.hit(this.adRect, x, y)) {
      this.openAd();
      return;
    }
    // 道具礼包购买（仅 items 标签时有效）
    for (const b of this.packRects) {
      if (this.hit(b.rect, x, y)) {
        this.buyPack(b.pack);
        return;
      }
    }
    // 实体商品去购买（仅 goods 标签时有效）
    for (const b of this.buyRects) {
      if (this.hit(b.rect, x, y)) {
        audioSynth.playUi("button");
        try { window.open(b.url, "_blank", "noopener"); } catch { /* 忽略 */ }
        this.showToast("已为你打开商品页");
        return;
      }
    }
    // 皮肤商品购买（仅 skins 标签时有效）
    for (const b of this.skinRects) {
      if (this.hit(b.rect, x, y)) {
        this.buySkin(b.product);
        return;
      }
    }
    // 首页风格选择（仅 style 标签时有效）
    for (const b of this.styleRects) {
      if (this.hit(b.rect, x, y)) {
        audioSynth.playUi("button");
        progress.setHomeStyle(b.id);
        const applied = resolveHomeStyle(b.id);
        this.showToast(`已切换首页风格：${applied.label}`);
        return;
      }
    }
  }

  /** 购买皮肤：演示直接解锁并应用；真实 Vendure 打开商品页（付款后由后端发货） */
  private buySkin(p: ShopProduct): void {
    audioSynth.playUi("button");
    const url = p.vendureUrl || "";
    const realVendure = ENV.vendureEnabled && !PLACEHOLDER_RE.test(url);
    if (realVendure) {
      try { window.open(url, "_blank", "noopener"); } catch { /* 忽略 */ }
      this.showToast("已打开商品页，付款后皮肤到账");
      return;
    }
    const skinId = p.skinId;
    if (!skinId) {
      this.showToast("该商品未关联皮肤");
      return;
    }
    // 演示：直接解锁并应用（官方预设内置，无需下载）
    const preset = getOfficialSkin(skinId);
    unlockSkin(skinId);
    if (preset) {
      void skinStore.save(preset);
      skinManager.apply(preset);
      this.showToast(`🎨 已解锁并应用「${preset.name}」`);
    } else {
      this.showToast(`🎨 已解锁「${p.name}」，可在换装花园应用`);
    }
    // 已登录时同步解锁关系到服务端（人民币通道）
    if (skinApi.available()) void skinApi.unlockRmb(skinId);
  }

  private openAd(): void {
    if (ads.isShowing()) return;
    const item = AD_ITEMS[Math.floor(Math.random() * AD_ITEMS.length)];
    ads.showRewarded({ item, count: 1 }, { title: "领训练道具" }, (granted) => {
      if (granted) {
        progress.addItem(item, 1);
        progress.addPoints(POINTS_RULES.adReward, "earn_ad");
        this.showToast(`已获得「${ITEM_NAME[item]}」×1 · 积分 +${POINTS_RULES.adReward}`);
      } else {
        this.showToast("未看完广告，未获得奖励");
      }
    });
  }

  /** 购买道具礼包：复用统一 Purchase，演示直接发放；真实 Vendure 打开商品页（后端按 grants 发货） */
  private buyPack(p: ShopProduct): void {
    audioSynth.playUi("button");
    const res = buyPack(p);
    if (res.openedReal) {
      this.showToast("已打开 Vendure 商品页，付款后道具到账（后端发货）");
      return;
    }
    audioSynth.playUi("item");
    this.showToast(res.grantedParts.length ? `🎁 已获得 ${res.grantedParts.join("  ")}` : "该礼包暂无可发放道具");
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.6, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    // 返回按钮
    gameCanvas.drawRoundRect(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12,
      "rgba(255,255,255,0.10)", 5);
    gameCanvas.drawText("‹", this.backRect.x + 26, this.backRect.y + 27,
      { size: 30, color: "#e6ebff", bold: true }, 6);

    // 标题
    gameCanvas.drawText("🌷 特惠花园", w / 2, 44, { size: 24, color: "#FFE66D", bold: true }, 6);

    if (!this.loaded) {
      gameCanvas.drawText("正在备货…", w / 2, h / 2, { size: 18, color: "#9aa3c8" }, 6);
      this.renderToast();
      return;
    }

    // 促销横幅
    this.renderPromo(w, h);

    // 标签栏
    this.renderTabs(w);

    // 背包摘要（让玩家感知看广告 / 每日礼 / 购买积累的道具）
    const inv = progress.getInventory();
    const invText = (Object.keys(inv) as (keyof ItemConfig)[])
      .filter((k) => inv[k] > 0)
      .map((k) => `${ITEM_NAME[k]}×${inv[k]}`)
      .join("   ");
    if (this.tab === "style") {
      gameCanvas.drawText("选择后立即在首页生效，可随时切换", w / 2, 214, { size: 12, color: "#9aa3c8" }, 5);
    } else if (invText) {
      gameCanvas.drawText(`🎒 我的道具：${invText}`, w / 2, 214, { size: 12, color: "#9aa3c8" }, 5);
    } else if (this.tab === "items") {
      gameCanvas.drawText("点击下方礼包即可购买并到账", w / 2, 214, { size: 11, color: "#7d86ab" }, 5);
    } else {
      gameCanvas.drawText("怎么获得道具？每日登录礼 · 看广告领 · 通关奖励 · 关卡掉落",
        w / 2, 214, { size: 11, color: "#7d86ab" }, 5);
    }

    // 内容网格
    // 切换标签前统一清空三组命中区，避免旧标签的点击区残留导致误触
    this.buyRects = [];
    this.packRects = [];
    this.skinRects = [];
    this.styleRects = [];
    if (this.tab === "goods") this.renderGoods(w, h);
    else if (this.tab === "items") this.renderPacks(w, h);
    else if (this.tab === "skins") this.renderSkins(w, h);
    else this.renderHomeStyles(w, h);

    // 底部"看广告领道具"统一入口（风格标签下不显示，避免遮挡风格卡片）
    if (this.tab !== "style") {
      const AD_GAP = 14;   // 与底部导航栏的间距
      const AD_H = 56;
      const btnW = Math.min(w - 60, 360);
      const btnX = (w - btnW) / 2;
      const btnY = h - NAV_H - AD_GAP - AD_H;
      this.adRect = { x: btnX, y: btnY, w: btnW, h: AD_H };
      gameCanvas.draw((ctx) => {
        const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + AD_H);
        grad.addColorStop(0, "#FFE66D");
        grad.addColorStop(1, "#f5b942");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, AD_H, 15);
        ctx.fill();
        ctx.fillStyle = "rgba(12,26,34,0.15)";
        ctx.beginPath();
        ctx.roundRect(btnX + 5, btnY + 5, btnW - 10, 20, 11);
        ctx.fill();
      }, 5);
      gameCanvas.drawText("🎁 看广告领训练道具", w / 2, btnY + AD_H / 2,
        { size: 20, color: "#0c1a22", bold: true }, 6);
    } else {
      this.adRect = { x: 0, y: 0, w: 0, h: 0 };
    }

    this.renderToast();
  }

  private renderTabs(w: number): void {
    this.tabRects = [];
    const y = 170;
    const hgt = 32;
    const gap = 10;
    const counts = 4;
    const pw = (w - 36 - gap * (counts - 1)) / counts;
    const labels: [string, "goods" | "items" | "skins" | "style"][] = [
      ["🛍️ 好物", "goods"],
      ["🎁 礼包", "items"],
      ["🎨 皮肤", "skins"],
      ["🌈 风格", "style"],
    ];
    labels.forEach(([label, key], i) => {
      const x = 18 + i * (pw + gap);
      const rect: Rect = { x, y, w: pw, h: hgt };
      this.tabRects.push(rect);
      const active = this.tab === key;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = active ? "rgba(255,230,109,0.20)" : "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.roundRect(x, y, pw, hgt, 10);
        ctx.fill();
        ctx.strokeStyle = active ? "rgba(255,230,109,0.8)" : "rgba(255,255,255,0.14)";
        ctx.lineWidth = active ? 2 : 1;
        ctx.stroke();
      }, 5);
      gameCanvas.drawText(label, x + pw / 2, y + 16,
        { size: 14, color: active ? "#FFE66D" : "#c3cadf", bold: active }, 6);
    });
  }

  /** 首页风格选择面板：5 套皮肤色板，点击即持久化应用 */
  private renderHomeStyles(w: number, _h: number): void {
    this.styleRects = [];
    const ids = Object.keys(HOME_STYLES) as HomeStyleId[];
    const cur = progress.getHomeStyle();
    const top = 232;
    const cardH = 72;
    const gap = 12;
    const cardW = w - 36;
    const x = 18;
    ids.forEach((id, i) => {
      const s = HOME_STYLES[id];
      const y = top + i * (cardH + gap);
      const rect: Rect = { x, y, w: cardW, h: cardH };
      this.styleRects.push({ rect, id });
      const selected = id === cur;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = selected ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.roundRect(x, y, cardW, cardH, 14);
        ctx.fill();
        ctx.strokeStyle = selected ? s.accent : "rgba(255,255,255,0.14)";
        ctx.lineWidth = selected ? 2.5 : 1;
        ctx.stroke();
        // 风格预览：背景渐变 + accent 色条
        const g = ctx.createLinearGradient(x + 16, y + 16, x + 16 + 40, y + 16);
        g.addColorStop(0, s.bgTop);
        g.addColorStop(1, s.bgBottom);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x + 16, y + 16, 40, 40, 10);
        ctx.fill();
        ctx.fillStyle = s.accent;
        ctx.beginPath();
        ctx.roundRect(x + 16, y + 16, 40, 8, 4);
        ctx.fill();
      }, 5);
      // 主题文字 x+70，统一左对齐（与下方状态行一致），起点在色块 x+56 之后
      gameCanvas.drawText(s.label, x + 70, y + 28, { size: 18, color: "#e6ebff", bold: true, align: "left" }, 6);
      gameCanvas.drawText(selected ? "✓ 使用中" : "点击应用", x + 70, y + 52,
        { size: 13, color: selected ? s.accent : "#8b93b8", align: "left" }, 6);
    });
  }

  private renderGoods(w: number, h: number): void {
    this.buyRects = [];
    const goods = this.products.filter((p) => !p.grants);
    const gridTop = 224;
    const cardW = (w - 36 - 12) / 2;
    const cardH = 200; // 加高：让图片/名称/说明/简介/价格/按钮各占一行，互不重叠
    const gap = 12;
    const cols = 2;
    const maxRows = 3;
    const footerTop = h - NAV_H - 70; // 底部广告区顶（按钮 56 + 间距 14）
    const fitRows = Math.max(1, Math.floor((footerTop - gridTop + gap) / (cardH + gap)));
    const limit = Math.min(maxRows * cols, fitRows * cols);
    for (let i = 0; i < goods.length && i < limit; i++) {
      const p = goods[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 18 + col * (cardW + gap);
      const y = gridTop + row * (cardH + gap);
      this.renderProductCard(p, x, y, cardW, cardH);
    }
  }

  private renderPacks(w: number, h: number): void {
    this.packRects = [];
    const packs = this.products.filter((p) => p.grants && Object.keys(p.grants).length > 0);
    const gridTop = 224;
    const cardW = (w - 36 - 12) / 2;
    const cardH = 200; // 加高：让图片/名称/说明/简介/价格/按钮各占一行，互不重叠
    const gap = 12;
    const cols = 2;
    const maxRows = 3;
    const footerTop = h - NAV_H - 70; // 底部广告区顶（按钮 56 + 间距 14）
    const fitRows = Math.max(1, Math.floor((footerTop - gridTop + gap) / (cardH + gap)));
    const limit = Math.min(maxRows * cols, fitRows * cols);
    for (let i = 0; i < packs.length && i < limit; i++) {
      const p = packs[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 18 + col * (cardW + gap);
      const y = gridTop + row * (cardH + gap);
      this.renderPackCard(p, x, y, cardW, cardH);
    }
  }

  private renderSkins(w: number, h: number): void {
    this.skinRects = [];
    const skins = this.products.filter((p) => !!p.skinId);
    const gridTop = 224;
    const cardW = (w - 36 - 12) / 2;
    const cardH = 200; // 加高：让图片/名称/说明/简介/价格/按钮各占一行，互不重叠
    const gap = 12;
    const cols = 2;
    const maxRows = 3;
    const footerTop = h - NAV_H - 70; // 底部广告区顶（按钮 56 + 间距 14）
    const fitRows = Math.max(1, Math.floor((footerTop - gridTop + gap) / (cardH + gap)));
    const limit = Math.min(maxRows * cols, fitRows * cols);
    for (let i = 0; i < skins.length && i < limit; i++) {
      const p = skins[i];
      const x = 18 + (i % cols) * (cardW + gap);
      const y = gridTop + Math.floor(i / cols) * (cardH + gap);
      this.renderSkinCard(p, x, y, cardW, cardH);
    }
  }

  private renderSkinCard(p: ShopProduct, x: number, y: number, cw: number, ch: number): void {
    const owned = !!p.skinId && skinManager.getId() === p.skinId;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(78,205,196,0.08)";
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.30)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }, 4);

    gameCanvas.drawText(p.emoji, x + cw / 2, y + 42, { size: 32 }, 5);
    gameCanvas.drawText(p.name, x + 8, y + 74, { size: 14, color: "#fff", bold: true, align: "left" }, 5);
    wrapText(p.blurb, Math.max(6, Math.floor((cw - 16) / (10 * 0.95))), 2).forEach((ln, j) => {
      gameCanvas.drawText(ln, x + 8, y + 94 + j * 16, { size: 10, color: "#9aa3c8", align: "left" }, 5);
    });

    // 皮肤说明（单独一行，不与价格/按钮重叠）
    gameCanvas.drawText(owned ? "使用中" : "背景 · 棋盘 · 棋子整套", x + 8, y + 130,
      { size: 11, color: owned ? "#4ECDC4" : "#FFE66D", align: "left" }, 5);

    const priceText = p.priceCents > 0 ? `¥${(p.priceCents / 100).toFixed(0)}` : "免费";
    gameCanvas.drawText(priceText, x + 8, y + 152, { size: 16, color: "#FFE66D", bold: true, align: "left" }, 5);

    const btnW = cw - 16;
    const btnX = x + 8;
    const btnY = y + ch - 32;
    const realVendure = ENV.vendureEnabled && !PLACEHOLDER_RE.test(p.vendureUrl || "");
    const label = owned ? "已应用" : (realVendure ? "去 Vendure 购买" : (p.priceCents > 0 ? "购买（演示）" : "免费领取（演示）"));
    gameCanvas.drawRoundRect(btnX, btnY, btnW, 28, 10, "rgba(78,205,196,0.22)", 5);
    gameCanvas.drawStrokeRect(btnX, btnY, btnW, 28, 10, "rgba(78,205,196,0.7)", 1.5, 6);
    gameCanvas.drawText(label, btnX + btnW / 2, btnY + 14, { size: 13, color: "#4ECDC4", bold: true }, 6);
    this.skinRects.push({ rect: { x: btnX, y: btnY, w: btnW, h: 28 }, product: p });
  }

  private renderPromo(w: number, _h: number): void {
    if (this.promotions.length === 0) return;
    const promo = this.promotions[0];
    const x = 18;
    const y = 70;
    const pw = w - 36;
    const ph = 100; // 券码单独成行，横幅加高
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(x, y, x, y + ph);
      grad.addColorStop(0, "rgba(231,76,60,0.22)");
      grad.addColorStop(1, "rgba(255,230,109,0.10)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, pw, ph, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,230,109,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, 4);
    gameCanvas.drawText(`🎉 ${promo.title}`, x + 16, y + 24, { size: 18, color: "#FFE66D", bold: true, align: "left" }, 5);
    wrapText(promo.subtitle, Math.max(8, Math.floor((pw - 32) / (13 * 0.95))), 2).forEach((ln, j) => {
      gameCanvas.drawText(ln, x + 16, y + 50 + j * 18, { size: 13, color: "#e6ebff", align: "left" }, 5);
    });

    // 倒计时（endsAt 为 Date.now() 绝对时间戳，需与之同一时基）
    const remain = Math.max(0, promo.endsAt - Date.now());
    const days = Math.floor(remain / 86400000);
    const hours = Math.floor((remain % 86400000) / 3600000);
    const mins = Math.floor((remain % 3600000) / 60000);
    const cdText = days > 0 ? `剩 ${days}天${hours}时` : `剩 ${hours}时${mins}分`;
    gameCanvas.drawText(cdText, x + pw - 16, y + 24, { size: 13, color: "#4ECDC4", bold: true, align: "right" }, 5);

    // 优惠券码
    // 券码单独一行，避免与副标题同行相撞
    gameCanvas.drawText(`券码 ${promo.code}`, x + pw - 16, y + 88, { size: 12, color: "#c3cadf", align: "right" }, 5);
  }

  private renderProductCard(p: ShopProduct, x: number, y: number, cw: number, ch: number): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }, 4);

    // 促销标签角标
    if (p.promoTag) {
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "#e74c3c";
        ctx.beginPath();
        ctx.roundRect(x + 8, y + 8, 56, 20, 6);
        ctx.fill();
      }, 5);
      gameCanvas.drawText(p.promoTag, x + 36, y + 18, { size: 11, color: "#fff", bold: true }, 6);
    }

    gameCanvas.drawText(p.emoji, x + cw / 2, y + 42, { size: 36 }, 5);
    gameCanvas.drawText(p.name, x + 8, y + 76, { size: 14, color: "#fff", bold: true, align: "left" }, 5);
    wrapText(p.blurb, Math.max(6, Math.floor((cw - 16) / (10 * 0.95))), 2).forEach((ln, j) => {
      gameCanvas.drawText(ln, x + 8, y + 96 + j * 16, { size: 10, color: "#9aa3c8", align: "left" }, 5);
    });

    // 价格（单独一行，不与按钮重叠）
    gameCanvas.drawText(`¥${(p.priceCents / 100).toFixed(0)}`, x + 8, y + 140,
      { size: 18, color: "#FFE66D", bold: true, align: "left" }, 5);
    const priceW = 4 + `${(p.priceCents / 100).toFixed(0)}`.length * 11;
    gameCanvas.drawText(`¥${(p.originalCents / 100).toFixed(0)}`, x + 29 + priceW, y + 140,
      { size: 11, color: "#6b7396", align: "left" }, 5);

    // 去购买按钮
    const btnW = cw - 16;
    const btnX = x + 8;
    const btnY = y + ch - 32;
    const rect: Rect = { x: btnX, y: btnY, w: btnW, h: 28 };
    gameCanvas.drawRoundRect(btnX, btnY, btnW, 28, 10, "rgba(78,205,196,0.22)", 5);
    gameCanvas.drawStrokeRect(btnX, btnY, btnW, 28, 10, "rgba(78,205,196,0.6)", 1.5, 6);
    gameCanvas.drawText("去购买", btnX + btnW / 2, btnY + 14, { size: 14, color: "#4ECDC4", bold: true }, 6);
    this.buyRects.push({ rect, url: p.vendureUrl });
  }

  private renderPackCard(p: ShopProduct, x: number, y: number, cw: number, ch: number): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(78,205,196,0.08)";
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.30)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }, 4);

    gameCanvas.drawText(p.emoji, x + cw / 2, y + 42, { size: 32 }, 5);
    gameCanvas.drawText(p.name, x + 8, y + 74, { size: 14, color: "#fff", bold: true, align: "left" }, 5);
    wrapText(p.blurb, Math.max(6, Math.floor((cw - 16) / (10 * 0.95))), 2).forEach((ln, j) => {
      gameCanvas.drawText(ln, x + 8, y + 94 + j * 16, { size: 10, color: "#9aa3c8", align: "left" }, 5);
    });

    // 内含道具明细（单独一行）
    gameCanvas.drawText(describeGrants(p), x + 8, y + 130, { size: 11, color: "#FFE66D", align: "left" }, 5);

    // 价格 / 免费
    const priceText = p.priceCents > 0 ? `¥${(p.priceCents / 100).toFixed(0)}` : "免费";
    gameCanvas.drawText(priceText, x + 8, y + 152, { size: 16, color: "#FFE66D", bold: true, align: "left" }, 5);

    // 购买按钮（演示直接发放 / 真实打开 Vendure 商品页）
    const btnW = cw - 16;
    const btnX = x + 8;
    const btnY = y + ch - 32;
    const realVendure = ENV.vendureEnabled && !PLACEHOLDER_RE.test(p.vendureUrl || "");
    const label = realVendure ? "去 Vendure 购买" : (p.priceCents > 0 ? "购买（演示）" : "免费领取（演示）");
    const rect: Rect = { x: btnX, y: btnY, w: btnW, h: 28 };
    gameCanvas.drawRoundRect(btnX, btnY, btnW, 28, 10, "rgba(255,230,109,0.22)", 5);
    gameCanvas.drawStrokeRect(btnX, btnY, btnW, 28, 10, "rgba(255,230,109,0.7)", 1.5, 6);
    gameCanvas.drawText(label, btnX + btnW / 2, btnY + 14, { size: 13, color: "#FFE66D", bold: true }, 6);
    this.packRects.push({ rect, pack: p });
  }

  private renderToast(): void {
    if (performance.now() < this.toastUntil && this.toastText) {
      const w = gameCanvas.getW();
      const tw = Math.min(w - 60, this.toastText.length * 15 + 40);
      const tx = (w - tw) / 2;
      const ty = this.adRect.y - 50;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.82)";
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 36, 10);
        ctx.fill();
      }, 250);
      gameCanvas.drawText(this.toastText, w / 2, ty + 18, { size: 13, color: "#fff" }, 251);
    }
  }

  destroy(): void {
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
