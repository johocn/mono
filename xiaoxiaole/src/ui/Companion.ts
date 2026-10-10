/**
 * Companion — 温情向导「小园」
 *
 * 贯穿教程 / 结算 / 休息 / 首页的稳定陪伴角色，全部由画布手绘（零外部素材、零加载成本）：
 * 圆脸 + 柔和腮红 + 圆形高光眼 + 可弯折眉毛 + 弧形嘴，头顶一簇花草发饰呼应「小园」的花园主题，
 * 整体置于暖色圆形底托上，边缘柔光。
 *
 * 表现力来自四个动画相位的叠加：
 * - 呼吸：整体极缓的上下浮动与微缩放（~1.7s 周期）
 * - 眨眼：随机间隔（2~4.8s）的快速开合（150ms）
 * - 说话：朗读时嘴部张合
 * - 情绪过渡：切换 mood 时对眉眼嘴参数做 240ms 平滑插值
 *
 * 适老化：开启「降低动效」时全部相位固定、输出静止帧（不闪烁、不抖动）。
 *
 * ⚠️ 用法约定：GameCanvas 是立即模式渲染，且 setUpdateCallback / setTouchHandler / setOverlay
 * 均为全局单槽位（Main.ts 已占用 overlay 画底部导航）。因此本组件**不自行注册任何回调**，
 * 必须由宿主场景在自己的 render() 里调用 update(now) 与 draw()，否则会抢走场景输入或覆盖导航。
 */

import { safety } from "../core/SafetyManager";
import { pickMoodWord, type CompanionMood } from "../core/CareWords";
import { gameCanvas } from "./GameCanvas";

export type { CompanionMood };

/** 暖肤色 / 发色 / 五官色（统一暖色调，与首页主题一致） */
const SKIN = "#FBE0C4";
const HAIR = "#6B4423";
const EYE_DARK = "#3A3242";
const BROW = "#5A3A22";
const MOUTH = "#B5544E";

/** 角色身份常量（保留 name/avatar/welcome，供既有调用方与分享文案复用） */
export const COMPANION = {
  name: "小园",
  avatar: "🌷",
  /** 开场白（首次进入教程时轻声说一句） */
  welcome: "我是小园，第一次玩别紧张，跟着我做就行～",
};

/**
 * 每种情绪对应的「面部参数」。全部为数值，便于切换情绪时做插值过渡。
 * eyeScale: 眼睛大小倍率（惊喜时睁大）
 * crescent: 0=圆眼，1=眯成月牙（鼓励/开心时弯眼）
 * browTilt: 眉毛倾斜，负=轻蹙（关切），正=上扬（惊喜）
 * mouthCurve: 嘴角弧度，正=上扬；mouthOpen: 基础张合度
 * blush: 腮红浓度
 */
interface FaceParams {
  eyeScale: number;
  crescent: number;
  browTilt: number;
  mouthCurve: number;
  mouthOpen: number;
  blush: number;
}

const MOOD_PARAMS: Record<CompanionMood, FaceParams> = {
  smile: { eyeScale: 1, crescent: 0, browTilt: 0.15, mouthCurve: 0.9, mouthOpen: 0.0, blush: 0.38 },
  encourage: { eyeScale: 0.95, crescent: 1, browTilt: 0.35, mouthCurve: 1.0, mouthOpen: 0.1, blush: 0.46 },
  surprise: { eyeScale: 1.35, crescent: 0, browTilt: 0.6, mouthCurve: 0.5, mouthOpen: 0.5, blush: 0.3 },
  care: { eyeScale: 0.92, crescent: 0, browTilt: -0.3, mouthCurve: 0.2, mouthOpen: 0.0, blush: 0.26 },
};

const BLINK_MS = 150;
const MOOD_TWEEN_MS = 240;

class Companion {
  private mood: CompanionMood = "smile";
  private prevMood: CompanionMood = "smile";
  private moodStart = 0;
  private speaking = false;
  private lastNow = 0;
  private blinkStart = -1;
  private nextBlinkAt = 0;
  private blinkPrimed = false;

  /** 切换情绪（相同情绪重复调用无副作用，不会打断进行中的过渡） */
  setMood(mood: CompanionMood): void {
    if (mood === this.mood) return;
    this.prevMood = this.mood;
    this.mood = mood;
    this.moodStart = this.lastNow;
  }

  getMood(): CompanionMood {
    return this.mood;
  }

  /** 标记是否正在朗读（激活嘴部张合） */
  setSpeaking(on: boolean): void {
    this.speaking = on;
  }

  /** 取一句当前情绪的暖心话 */
  say(mood: CompanionMood = this.mood): string {
    return pickMoodWord(mood);
  }

  /** 推进动画相位。宿主场景每帧调用一次（传 performance.now()） */
  update(now: number): void {
    this.lastNow = now;
    if (!this.blinkPrimed) {
      this.blinkPrimed = true;
      this.nextBlinkAt = now + 1200 + Math.random() * 2000;
      return;
    }
    if (this.blinkStart < 0) {
      if (now >= this.nextBlinkAt) this.blinkStart = now;
    } else if (now - this.blinkStart > BLINK_MS) {
      this.blinkStart = -1;
      this.nextBlinkAt = now + 2000 + Math.random() * 2800;
    }
  }

  /**
   * 绘制头像。(x, y) 为头像中心，size 为直径，z 为绘制层级。
   * 建议 z 取 95~99：高于页面内容与底部导航(90/91)，低于设置面板(100+)。
   */
  draw(x: number, y: number, size: number, z = 96): void {
    const now = this.lastNow;
    const reduced = safety.isReducedMotion();
    const hc = safety.isHighContrast();

    // 呼吸：极缓的上下浮动与微缩放；降低动效时恒为 0
    const breath = reduced ? 0 : Math.sin(now / 1700);
    const scale = 1 + (reduced ? 0 : breath * 0.012);
    const dy = reduced ? 0 : breath * size * 0.012;

    const p = this.params(now);
    const blink = this.blinkAmount(now);
    // 说话时嘴部张合；降低动效时保持一个静态微张，不抖动
    const talk = reduced ? (this.speaking ? 0.6 : 0) : this.speaking ? Math.abs(Math.sin(now / 150)) : 0;

    gameCanvas.draw((ctx) => {
      ctx.save();
      ctx.translate(x, y + dy);
      const s = (size / 2) * scale;
      ctx.scale(s, s); // 归一化到 -1..1

      // 底托：暖色圆 + 柔光（高对比改为深底白圈，保证可读）
      if (!hc) {
        const glow = ctx.createRadialGradient(0, -0.05, 0.15, 0, 0, 1.18);
        glow.addColorStop(0, "rgba(255,234,200,0.95)");
        glow.addColorStop(1, "rgba(255,234,200,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 1.18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = hc ? "#0B0B0B" : "#FFF3DF";
      ctx.beginPath();
      ctx.arc(0, 0, 1.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hc ? "#FFFFFF" : "rgba(255,183,110,0.65)";
      ctx.lineWidth = hc ? 0.05 : 0.035;
      ctx.stroke();

      // 头发后层
      ctx.fillStyle = HAIR;
      ctx.beginPath();
      ctx.ellipse(0, -0.04, 0.7, 0.74, 0, 0, Math.PI * 2);
      ctx.fill();

      // 耳朵
      ctx.fillStyle = SKIN;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * 0.6, 0.04, 0.075, 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 脸
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.6, 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      if (hc) {
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 0.03;
        ctx.stroke();
      }

      // 腮红
      ctx.fillStyle = `rgba(236,132,124,${p.blush})`;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * 0.36, 0.18, 0.1, 0.065, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 眉毛
      this.drawBrows(ctx, p);

      // 眼睛（含眨眼与月牙眼）
      for (const sx of [-1, 1]) this.drawEye(ctx, sx, p, blink);

      // 鼻子
      ctx.strokeStyle = "rgba(150,100,80,0.5)";
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(0, 0.06);
      ctx.lineTo(0.05, 0.17);
      ctx.lineTo(-0.02, 0.19);
      ctx.stroke();

      // 嘴（曲线嘴 / 说话或惊喜时张开）
      this.drawMouth(ctx, p, talk);

      // 刘海（头顶发片）
      ctx.fillStyle = HAIR;
      ctx.beginPath();
      ctx.ellipse(0, -0.2, 0.63, 0.44, 0, Math.PI, Math.PI * 2);
      ctx.fill();

      // 花草发饰：呼应「小园」的花园主题
      this.drawFlower(ctx, 0.42, -0.5);

      ctx.restore();
    }, z);
  }

  /** 情绪插值：切换 mood 时平滑过渡，避免表情瞬间跳变 */
  private params(now: number): FaceParams {
    const a = MOOD_PARAMS[this.prevMood];
    const b = MOOD_PARAMS[this.mood];
    let t = (now - this.moodStart) / MOOD_TWEEN_MS;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    t = t * t * (3 - 2 * t); // smoothstep
    const lerp = (x: number, y: number): number => x + (y - x) * t;
    return {
      eyeScale: lerp(a.eyeScale, b.eyeScale),
      crescent: lerp(a.crescent, b.crescent),
      browTilt: lerp(a.browTilt, b.browTilt),
      mouthCurve: lerp(a.mouthCurve, b.mouthCurve),
      mouthOpen: lerp(a.mouthOpen, b.mouthOpen),
      blush: lerp(a.blush, b.blush),
    };
  }

  /** 眨眼相位：0→1→0 的三角波 */
  private blinkAmount(now: number): number {
    if (this.blinkStart < 0) return 0;
    const t = now - this.blinkStart;
    if (t >= BLINK_MS) return 0;
    const half = BLINK_MS / 2;
    return t < half ? t / half : (BLINK_MS - t) / half;
  }

  private drawBrows(ctx: CanvasRenderingContext2D, p: FaceParams): void {
    ctx.strokeStyle = BROW;
    ctx.lineWidth = 0.045;
    ctx.lineCap = "round";
    const by = -0.2;
    const tilt = p.browTilt * 0.05;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 0.13, by - tilt);
      ctx.quadraticCurveTo(sx * 0.25, by - 0.06 - tilt, sx * 0.37, by + tilt * 0.6);
      ctx.stroke();
    }
  }

  private drawEye(ctx: CanvasRenderingContext2D, sx: number, p: FaceParams, blink: number): void {
    const ex = sx * 0.24;
    const ey = -0.04;

    if (p.crescent > 0.5) {
      // 弯成月牙：下弧线，像笑起来的眯眼
      if (blink > 0.5) {
        ctx.strokeStyle = EYE_DARK;
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.moveTo(ex - 0.1, ey);
        ctx.lineTo(ex + 0.1, ey);
        ctx.stroke();
        return;
      }
      ctx.strokeStyle = EYE_DARK;
      ctx.lineWidth = 0.055;
      ctx.beginPath();
      ctx.arc(ex, ey + 0.01, 0.115, 0.18 * Math.PI, 0.82 * Math.PI);
      ctx.stroke();
      return;
    }

    const w = 0.115 * p.eyeScale;
    const h = 0.085 * p.eyeScale * (1 - blink);
    if (h < 0.014) {
      // 闭眼：一条横线
      ctx.strokeStyle = EYE_DARK;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(ex - w, ey);
      ctx.lineTo(ex + w, ey);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.ellipse(ex, ey, w, h, 0, 0, Math.PI * 2);
    ctx.fill();

    const pr = Math.min(w, h) * 0.55;
    ctx.fillStyle = EYE_DARK;
    ctx.beginPath();
    ctx.arc(ex, ey + h * 0.08, pr, 0, Math.PI * 2);
    ctx.fill();

    // 高光：让眼睛有神
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(ex - w * 0.34, ey - h * 0.36, pr * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawMouth(ctx: CanvasRenderingContext2D, p: FaceParams, talk: number): void {
    const my = 0.32;
    const mw = 0.16;
    // 说话时强制张开：让"正在朗读"看得见
    const open = Math.max(p.mouthOpen, this.speaking ? 0.3 + 0.35 * talk : 0);

    if (open > 0.18) {
      ctx.fillStyle = MOUTH;
      ctx.beginPath();
      ctx.ellipse(0, my, mw * 0.62, 0.04 + 0.1 * open, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.strokeStyle = MOUTH;
    ctx.lineWidth = 0.05;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-mw, my);
    ctx.quadraticCurveTo(0, my + 0.14 * p.mouthCurve * (1 + 0.25 * talk), mw, my);
    ctx.stroke();
  }

  private drawFlower(ctx: CanvasRenderingContext2D, fx: number, fy: number): void {
    // 叶片
    ctx.fillStyle = "#6BAE5A";
    ctx.beginPath();
    ctx.ellipse(fx - 0.11, fy + 0.07, 0.1, 0.045, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 花瓣
    ctx.fillStyle = "#FF9BB3";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * 0.055, fy + Math.sin(a) * 0.055, 0.042, 0, Math.PI * 2);
      ctx.fill();
    }
    // 花心
    ctx.fillStyle = "#FFE066";
    ctx.beginPath();
    ctx.arc(fx, fy, 0.034, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 全局单例：各场景共用同一个「小园」，保证情绪与形象一致 */
export const companion = new Companion();

/** 取一句向导的暖心话（兼容既有调用方；可指定情绪） */
export function companionSays(mood: CompanionMood = "smile"): string {
  return `${COMPANION.name}说：${pickMoodWord(mood)}`;
}
