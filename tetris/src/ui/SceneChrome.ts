/**
 * SceneChrome — 全站统一「外壳」：右上回主页按钮 + 底部导航条
 * 适老化：任何非关卡页都常驻出口；按钮高度 52px、导航项 72px，远高于 44×44 最小点击区。
 */

import { gameCanvas, fontPx } from "./GameCanvas";
import { safety } from "../core/SafetyManager";

export type NavKey = "home" | "levels" | "brain" | "shop";

export const NAV_H = 72;
const HOME_W = 104;
const HOME_H = 52;

export const NAV_ITEMS: { key: NavKey; icon: string; label: string }[] = [
  { key: "home", icon: "🏠", label: "首页" },
  { key: "levels", icon: "🗺️", label: "关卡" },
  { key: "brain", icon: "🧠", label: "认知中心" },
  { key: "shop", icon: "🎁", label: "道具中心" },
];

interface Rect { x: number; y: number; w: number; h: number }

class SceneChrome {
  private handler: ((key: NavKey) => void) | null = null;
  private navRects: { key: NavKey; rect: Rect }[] = [];
  private homeRect: Rect = { x: 0, y: 0, w: HOME_W, h: HOME_H };
  private enabled = false;
  private active: NavKey | null = null;
  private showHome = false;

  setHandler(h: ((key: NavKey) => void) | null): void { this.handler = h; }

  configure(opts: { enabled: boolean; active?: NavKey | null; showHome?: boolean }): void {
    this.enabled = opts.enabled;
    this.active = opts.active ?? null;
    this.showHome = opts.showHome ?? true;
  }

  render(): void {
    if (!this.enabled) return;
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    if (this.showHome) {
      let homeW = HOME_W;
      gameCanvas.draw((ctx) => {
        ctx.font = `bold ${fontPx(18)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
        const tw = ctx.measureText("🏠 主页").width;
        homeW = Math.max(84, Math.min(w * 0.42, tw + 28));
        this.homeRect = { x: w - homeW - 12, y: 12, w: homeW, h: HOME_H };
      }, 90);
      safety.assertTapSize(HOME_H, "chrome-home-button");
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(78,205,196,0.20)";
        ctx.beginPath();
        ctx.roundRect(this.homeRect.x, this.homeRect.y, this.homeRect.w, HOME_H, 14);
        ctx.fill();
        ctx.strokeStyle = "rgba(78,205,196,0.65)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }, 90);
      gameCanvas.drawText(
        "🏠 主页",
        this.homeRect.x + this.homeRect.w / 2,
        this.homeRect.y + HOME_H / 2,
        { size: 18, color: "#9be8df", bold: true },
        91,
      );
    } else {
      this.homeRect = { x: 0, y: 0, w: 0, h: 0 };
    }

    const navY = h - NAV_H;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(14,16,32,0.97)";
      ctx.fillRect(0, navY, w, NAV_H);
      ctx.strokeStyle = "rgba(120,140,210,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, navY + 0.5);
      ctx.lineTo(w, navY + 0.5);
      ctx.stroke();
    }, 90);

    this.navRects = [];
    const n = NAV_ITEMS.length;
    const itemW = w / n;
    NAV_ITEMS.forEach((item, i) => {
      const x = i * itemW;
      const rect: Rect = { x, y: navY, w: itemW, h: NAV_H };
      this.navRects.push({ key: item.key, rect });
      const isActive = item.key === this.active;
      safety.assertTapSize(NAV_H, `chrome-nav-${item.key}`);
      if (isActive) {
        gameCanvas.draw((ctx) => {
          ctx.fillStyle = "rgba(78,205,196,0.16)";
          ctx.beginPath();
          ctx.roundRect(x + 4, navY + 6, itemW - 8, NAV_H - 12, 12);
          ctx.fill();
        }, 90);
      }
      gameCanvas.drawText(item.icon, x + itemW / 2, navY + 26, { size: 24 }, 91);
      gameCanvas.drawText(
        item.label,
        x + itemW / 2,
        navY + 50,
        { size: 14, color: isActive ? "#4ECDC4" : "#a7aecc", bold: isActive },
        91,
      );
    });
  }

  hitTest(x: number, y: number): NavKey | null {
    if (!this.enabled) return null;
    const showHome = this.showHome;
    if (showHome) {
      const r = this.homeRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return "home";
    }
    for (const n of this.navRects) {
      const r = n.rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return n.key;
    }
    return null;
  }

  dispatch(key: NavKey): boolean {
    if (!this.handler) return false;
    this.handler(key);
    return true;
  }
}

export const sceneChrome = new SceneChrome();
