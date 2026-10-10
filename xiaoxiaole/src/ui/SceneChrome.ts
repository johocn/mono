/**
 * SceneChrome — 全站统一「外壳」：右上回主页按钮 + 底部导航条
 *
 * 适老化要点：
 * - 老人最容易「迷路」：任何非关卡页都常驻这两处出口，随时能回主页
 * - 按钮高度 52px、导航项 72px，均远高于 44×44 最小点击区
 * - 绘制层 z=90：高于页面内容（≤60），低于各类弹窗（≥100），不遮挡确认框
 * - 关卡页（HUD 场景）不画底部导航：底部被道具栏占用，改为 HUD 顶部「🏠」按钮
 */

import { gameCanvas, fontPx } from "./GameCanvas";
import { safety } from "../core/SafetyManager";
import { progress } from "../core/ProgressStore";
import { resolveHomeStyle } from "../config/homeStyles";

export type NavKey = "home" | "levels" | "brain" | "shop";

/** 底部导航条高度（场景布局需把底部内容抬高这么多，避免被压住） */
export const NAV_H = 72;
/** 右上「回主页」按钮尺寸 */
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

  /** 由 Main（路由）注册：导航项 → 跳转 */
  setHandler(h: ((key: NavKey) => void) | null): void {
    this.handler = h;
  }

  /**
   * 路由每切换一次调用一次：决定导航是否显示、哪项高亮、是否画主页按钮。
   * 关卡 / 结算 / 教程 / 弹窗期间传 enabled=false，避免遮挡与误触。
   */
  configure(opts: { enabled: boolean; active?: NavKey | null; showHome?: boolean }): void {
    this.enabled = opts.enabled;
    this.active = opts.active ?? null;
    this.showHome = opts.showHome ?? true;
  }

  /** 每帧由 GameCanvas 浮层调用：绘制右上「回主页」+ 底部导航 */
  render(): void {
    if (!this.enabled) return;
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    // === 右上「回主页」 ===
    // 字号放大档下「🏠 主页」会变宽，按钮外框按缩放后文字宽度自适应，
    // 避免文字溢出圆角框（点击区始终正确，仅视觉对齐）。
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
      // 不显示主页按钮时清空命中区，避免命中旧坐标
      this.homeRect = { x: 0, y: 0, w: 0, h: 0 };
    }

    // === 底部导航条 ===
    const navY = h - NAV_H;
    const st = resolveHomeStyle(progress.getHomeStyle());
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = st.navBg;
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

      // 选中态：白字高亮胶囊 + 顶部 accent 色条（解决「绿字配绿底」看不清）
      const activeColor = isActive ? "#ffffff" : "#a7aecc";
      if (isActive) {
        gameCanvas.draw((ctx) => {
          ctx.fillStyle = "rgba(255,255,255,0.16)";
          ctx.beginPath();
          ctx.roundRect(x + 4, navY + 6, itemW - 8, NAV_H - 12, 12);
          ctx.fill();
          ctx.fillStyle = st.accent;
          ctx.beginPath();
          ctx.roundRect(x + itemW / 2 - 18, navY + 7, 36, 3, 1.5);
          ctx.fill();
        }, 90);
      }
      gameCanvas.drawText(item.icon, x + itemW / 2, navY + 26, { size: 24, color: activeColor }, 91);
      gameCanvas.drawText(
        item.label,
        x + itemW / 2,
        navY + 50,
        { size: 14, color: activeColor, bold: isActive },
        91,
      );
    });
  }

  /**
   * 命中检测（由 GameCanvas 的全局点击拦截器调用）。
   * @returns 命中的导航目标；"home" 表示点了右上主页按钮或导航「首页」；null 表示未命中
   */
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

  /** 命中后统一交给路由处理（返回 true 表示已消费该点击） */
  dispatch(key: NavKey): boolean {
    if (!this.handler) return false;
    this.handler(key);
    return true;
  }
}

export const sceneChrome = new SceneChrome();
