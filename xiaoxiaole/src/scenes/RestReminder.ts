/**
 * 休息提醒浮层 — 深度适老「防疲劳」温柔卡
 *
 * 触发：累计游玩达 GAME_CONFIG.restSuggestMinutes（软阈值，未到 40 分钟硬上限），
 * 在关卡间隙弹出，不打断进行中的游戏。两个大按钮：
 * - 再玩一会：关掉卡片，继续（本次会话不再重复提示）
 * - 休息一下：关掉卡片，回到首页
 * 全程零闪烁，遵守 ≤2Hz 安全动效。可语音朗读（受 声音/语音 开关控制）。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { speech } from "../core/speech";
import { safety } from "../core/SafetyManager";
import { companion } from "../ui/Companion";
import { companionBubble } from "../ui/CompanionBubble";

interface Rect { x: number; y: number; w: number; h: number }

export interface RestCallbacks {
  onContinue(): void;
  onRest(): void;
}

export class RestReminder {
  private cb: RestCallbacks;
  private continueRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private restRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** 陪伴气泡是否已展示（避免每帧 show 导致重复朗读） */
  private shown = false;

  constructor(cb: RestCallbacks) {
    this.cb = cb;
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.render());
    // 进场的温柔朗读改由陪伴气泡（小园）承担，此处不再单独播报，避免重复发声
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    // 点小园：把这句话再读一遍（长辈没听清时很有用）
    if (companionBubble.hit(x, y)) {
      audioSynth.playUi("button");
      companionBubble.replay();
      return;
    }
    if (this.hit(this.continueRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onContinue();
    } else if (this.hit(this.restRect, x, y)) {
      audioSynth.playUi("button");
      speech.stop();
      this.cb.onRest();
    }
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const pal = safety.getPalette();

    gameCanvas.drawRoundRect(0, 0, w, h, 0, "rgba(16,20,38,0.74)", 1);

    const cw = Math.min(w - 48, 420);
    // 320 时按钮（cy+180）会盖住下面两行提示，故加高到 360 保证文案完整可见
    const ch = 360;
    const cx = (w - cw) / 2;
    const cy = (h - ch) / 2;
    const p = 22;

    // 卡片阴影 + 底
    gameCanvas.drawRoundRect(cx + 3, cy + 6, cw, ch, 26, "rgba(0,0,0,0.28)", 2);
    gameCanvas.drawRoundRect(cx, cy, cw, ch, 26, pal.card, 3);

    // 暖色柔光描边
    gameCanvas.drawStrokeRect(cx, cy, cw, ch, 26, "#FFB347", 2, 4);

    // 插图
    gameCanvas.drawText("🌿", cx + cw / 2, cy + 64, { size: 56 }, 5);

    // 标题
    gameCanvas.drawText("休息一下吧", cx + cw / 2, cy + 120,
      { size: 26, color: pal.text, bold: true }, 5);

    // 温柔提示
    gameCanvas.drawText("练了一会儿啦，起来喝口水、", cx + cw / 2, cy + 156,
      { size: 17, color: pal.sub }, 5);
    gameCanvas.drawText("活动活动，眼睛也放松放松～", cx + cw / 2, cy + 182,
      { size: 17, color: pal.sub }, 5);
    // 按钮：再玩一会（次）/ 休息一下（主）
    const bh = 52;
    const gap = 14;
    const by = cy + ch - p - bh * 2 - gap;
    const bw = cw - p * 2;

    this.continueRect = { x: cx + p, y: by, w: bw, h: bh };
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = safety.isHighContrast() ? "rgba(255,255,255,0.10)" : "rgba(255,179,71,0.16)";
      ctx.beginPath();
      ctx.roundRect(cx + p, by, bw, bh, 16);
      ctx.fill();
      ctx.strokeStyle = "#FFB347";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, 6);
    gameCanvas.drawText("再玩一会", cx + cw / 2, by + bh / 2,
      { size: 21, color: "#E08A3C", bold: true }, 7);

    const ry = by + bh + gap;
    this.restRect = { x: cx + p, y: ry, w: bw, h: bh };
    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(cx + p, ry, cx + p, ry + bh);
      g.addColorStop(0, "#FFB347");
      g.addColorStop(1, "#F2784B");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(cx + p, ry, bw, bh, 16);
      ctx.fill();
    }, 6);
    gameCanvas.drawText("休息一下", cx + cw / 2, ry + bh / 2,
      { size: 22, color: "#ffffff", bold: true }, 7);

    // 温情向导「小园」：卡片下方空档处关切陪伴（向上生长，底边贴屏幕底部，不遮挡按钮）
    const cnow = performance.now();
    if (!this.shown) {
      this.shown = true;
      companionBubble.show({
        text: companion.say("care"),
        mood: "care",
        x: 12,
        y: 0,
        anchorBottom: h - 10,
        maxWidth: Math.min(w - 24, 420),
        interactive: true, // 该区域在卡片外，不会遮挡两个按钮
        speak: true,
      });
    }
    companionBubble.update(cnow);
    companionBubble.draw();
  }

  destroy(): void {
    speech.stop();
    companionBubble.hide();
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
