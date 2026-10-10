/**
 * CompanionBubble — 小园的陪伴气泡
 *
 * 左侧手绘头像 + 右侧大圆角气泡（带指向头像的小尾巴），文字自动换行并跟随全局字号缩放。
 * 气泡出现时可随语音设置把文案读出来，朗读期间小园嘴部会动（看得见"正在说话"）。
 *
 * ⚠️ 与 Companion 相同的约定：GameCanvas 是立即模式且 update/touch/overlay 均为全局单槽位，
 * 因此本组件不注册任何回调，由宿主场景在自己的 render() 里调用 update(now) 与 draw()。
 * 场景 destroy() 时必须调用 hide()，避免朗读跨场景残留。
 */

import { safety } from "../core/SafetyManager";
import { speech } from "../core/speech";
import { fontPx, gameCanvas } from "./GameCanvas";
import { companion, type CompanionMood } from "./Companion";
import { wrapText } from "./ResultCard";

export interface BubbleOptions {
  /** 气泡文案（建议 20 字内，超长会自动换行并截断到 3 行） */
  text: string;
  /** 情绪，决定小园的表情；缺省 smile */
  mood?: CompanionMood;
  /** 整体左上角 x（头像左边缘） */
  x: number;
  /** 整体顶部 y */
  y: number;
  /** 整体最大宽度（头像 + 气泡） */
  maxWidth: number;
  /** 绘制层级，默认 96（高于导航 90/91，低于设置面板 100+） */
  z?: number;
  /**
   * 底边对齐位置：给出后气泡改为「向上生长」，底边固定在此处。
   * 用于按钮/横幅紧贴底部的拥挤场景，保证气泡永远不会盖住按钮。
   */
  anchorBottom?: number;
  /**
   * 是否可点击（点一下小园把这句话再读一遍）。
   * 仅在该区域不会遮挡其它可点元素时开启——首页气泡会浮在玩法列表上，因此不开启。
   */
  interactive?: boolean;
  /** 是否朗读；需同时满足音效开关与语音开关才真正发声 */
  speak?: boolean;
}

export interface CompanionBubbleApi {
  show(opts: BubbleOptions): void;
  update(nowMs: number): void;
  draw(): void;
  hide(): void;
}

/** 朗读时长估算：按字数与语速推算，用于到点自动闭嘴（不用 setTimeout，避免场景销毁后残留） */
function estimateSpeakMs(text: string, rate: number): number {
  return 500 + (text.length * 210) / Math.max(0.6, rate);
}

class CompanionBubble implements CompanionBubbleApi {
  private visible = false;
  private text = "";
  private mood: CompanionMood = "smile";
  private x = 0;
  private y = 0;
  private maxWidth = 240;
  private z = 96;
  private anchorBottom: number | null = null;
  private interactive = false;
  /** 当前实际占用区域（头像 + 气泡），供点击命中判定 */
  private hitRect = { x: 0, y: 0, w: 0, h: 0 };

  private lines: string[] = [];
  private cacheKey = "";
  private speaking = false;
  private speakUntil = 0;

  get isVisible(): boolean {
    return this.visible;
  }

  show(opts: BubbleOptions): void {
    // 长辈可在设置里关掉陪伴角色：关掉后任何场景都不再出现气泡（单点拦截）
    if (!safety.isCompanionEnabled()) {
      this.hide();
      return;
    }
    this.visible = true;
    this.text = opts.text;
    this.mood = opts.mood ?? "smile";
    this.x = opts.x;
    this.y = opts.y;
    this.maxWidth = opts.maxWidth;
    this.z = opts.z ?? 96;
    this.anchorBottom = opts.anchorBottom ?? null;
    this.interactive = !!opts.interactive;

    companion.setMood(this.mood);

    const canSpeak = !!opts.speak && safety.isSoundEnabled() && safety.isSpeechEnabled();
    if (canSpeak) {
      const rate = safety.getSpeechRate();
      speech.speak(this.text, { rate });
      this.speaking = true;
      this.speakUntil = performance.now() + estimateSpeakMs(this.text, rate);
      companion.setSpeaking(true);
    } else {
      this.speaking = false;
      companion.setSpeaking(false);
    }
  }

  update(nowMs: number): void {
    // 头像动画相位由气泡统一推进（呼吸/眨眼/说话）
    companion.update(nowMs);
    if (this.speaking && nowMs >= this.speakUntil) {
      this.speaking = false;
      companion.setSpeaking(false);
    }
  }

  hide(): void {
    if (this.speaking) {
      // 只停自己发起的朗读，避免打断场景其它播报
      speech.stop();
      this.speaking = false;
    }
    companion.setSpeaking(false);
    this.visible = false;
    this.hitRect = { x: 0, y: 0, w: 0, h: 0 };
  }

  draw(): void {
    if (!this.visible) return;

    const hc = safety.isHighContrast();
    const w = gameCanvas.getW();

    // 头像随字号档位放大（适老化），并限制在可用宽度内
    const avatar = Math.max(44, Math.min(72, fontPx(52), this.maxWidth * 0.34));
    const fontSize = fontPx(16);
    const gap = 8;
    const padX = 14;
    const bubbleW = Math.max(80, this.maxWidth - avatar - gap);
    const bubbleX = this.x + avatar + gap;
    // 可点重听时右上角留一个喇叭位，提示长辈「点一下能再听一遍」
    const showSpeaker = this.interactive && safety.isSoundEnabled() && safety.isSpeechEnabled();
    const speakerW = showSpeaker ? 20 : 0;

    // 换行结果按「文案 + 宽度 + 字号 + 是否留喇叭位」缓存，避免每帧重复测量
    const key = `${this.text}|${Math.round(bubbleW)}|${Math.round(fontSize)}|${showSpeaker ? 1 : 0}`;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      const maxChars = Math.max(6, Math.floor((bubbleW - padX * 2 - speakerW) / fontSize));
      this.lines = wrapText(this.text, maxChars, 3);
    }

    const lineH = fontSize * 1.5;
    const bubbleH = Math.max(avatar, this.lines.length * lineH + 20);
    // 缺省：气泡与头像垂直居中对齐；指定 anchorBottom：气泡向上生长、底边固定
    let bubbleY = this.y + (avatar - bubbleH) / 2;
    if (this.anchorBottom !== null) bubbleY = this.anchorBottom - bubbleH;
    if (bubbleY < 4) bubbleY = 4;
    const avatarY = bubbleY + (bubbleH - avatar) / 2;

    // 气泡右边界不出屏
    const clipped = bubbleX + bubbleW > w - 8;
    const drawW = clipped ? Math.max(80, w - 8 - bubbleX) : bubbleW;

    const fill = hc ? "#0B0B0B" : "#FFF8EC";
    const border = hc ? "#FFFFFF" : "rgba(255,183,110,0.8)";
    const textColor = hc ? "#FFFFFF" : "#5A4632";
    const z = this.z;

    // 气泡底 + 描边
    gameCanvas.drawRoundRect(bubbleX, bubbleY, drawW, bubbleH, 14, fill, z);
    gameCanvas.drawStrokeRect(bubbleX, bubbleY, drawW, bubbleH, 14, border, hc ? 2 : 1.5, z);

    // 小尾巴：指向头像
    const tailY = bubbleY + bubbleH / 2;
    gameCanvas.draw((ctx) => {
      ctx.beginPath();
      ctx.moveTo(bubbleX, tailY - 7);
      ctx.lineTo(bubbleX - 9, tailY);
      ctx.lineTo(bubbleX, tailY + 7);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = hc ? 2 : 1.5;
      ctx.stroke();
    }, z);

    // 文案（逐行左对齐，行距宽松）
    for (let i = 0; i < this.lines.length; i++) {
      gameCanvas.drawText(this.lines[i], bubbleX + padX, bubbleY + 12 + lineH * (i + 0.5), {
        size: 16,
        color: textColor,
        align: "left",
        bold: hc,
      }, z + 1);
    }

    // 喇叭提示：仅在可点重听时出现
    if (showSpeaker) {
      gameCanvas.drawText("🔊", bubbleX + drawW - 12, bubbleY + 13, { size: 11 }, z + 1);
    }

    // 记录实际占用区域，供点击命中判定
    const top = Math.min(bubbleY, avatarY);
    this.hitRect = {
      x: this.x,
      y: top,
      w: bubbleX + drawW - this.x,
      h: Math.max(bubbleY + bubbleH, avatarY + avatar) - top,
    };

    // 头像（层级 +1，确保压在气泡描边之上）
    companion.draw(this.x + avatar / 2, avatarY + avatar / 2, avatar, z + 1);
  }

  /** 是否点在小园（头像或气泡）上；仅在 interactive 时生效 */
  hit(x: number, y: number): boolean {
    if (!this.visible || !this.interactive) return false;
    const r = this.hitRect;
    return r.w > 0 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** 把当前这句话再读一遍（长辈没听清时点一下小园） */
  replay(): void {
    if (!this.visible) return;
    if (!safety.isSoundEnabled() || !safety.isSpeechEnabled()) return;
    const rate = safety.getSpeechRate();
    speech.speak(this.text, { rate });
    this.speaking = true;
    this.speakUntil = performance.now() + estimateSpeakMs(this.text, rate);
    companion.setSpeaking(true);
  }
}

/** 全局单例：各场景共用同一个气泡，避免多处同时弹出 */
export const companionBubble = new CompanionBubble();
