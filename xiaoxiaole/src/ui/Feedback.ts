/**
 * 正向反馈特效 — 粒子爆裂 / 冲击环 / 飘字
 *
 * 安全约束：
 * - 所有闪烁 ≤2Hz（由 GameCanvas.drawBreathGlow / drawSafeFlash 保证）
 * - 「降低动效」模式下退化为静态飘字 + 单层光环，无粒子
 */

import { gameCanvas, fontPx } from "./GameCanvas";
import { safety } from "../core/SafetyManager";
import { withAlpha, clamp01, Easing } from "../core/Tween";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string;
  size: number;
  rot: number;
  spin: number;
  shape: "dot" | "shard";
}

interface Ring {
  x: number; y: number;
  from: number; to: number;
  life: number; maxLife: number;
  color: string;
  width: number;
}

interface PopText {
  x: number; y: number;
  text: string;
  color: string;
  size: number;
  life: number; maxLife: number;
  rise: number;
}

export class Feedback {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private texts: PopText[] = [];

  /** 消除爆裂：粒子四散 + 冲击环 + 可选飘字 */
  burst(x: number, y: number, color: string, text: string = ""): void {
    if (safety.getEffectMode() === "reduced") {
      // 降级：单层光环 + 静态飘字
      this.ring(x, y, color);
      if (text) this.popText(x, y - 18, text, color, 24);
      return;
    }

    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 90 + Math.random() * 130; // px/s
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.55, maxLife: 0.55,
        color,
        size: 3.5 + Math.random() * 3.5,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 8,
        shape: Math.random() < 0.35 ? "shard" : "dot",
      });
    }
    this.ring(x, y, color);
    if (text) this.popText(x, y - 18, text, color, 24);
  }

  /** 冲击环（消除时扩散的白色光圈） */
  ring(x: number, y: number, color: string, from: number = 0.12, to: number = 0.9): void {
    const reduced = safety.getEffectMode() === "reduced";
    this.rings.push({
      x, y,
      from,
      to: reduced ? to * 0.7 : to,
      life: reduced ? 0.6 : 0.36,
      maxLife: reduced ? 0.6 : 0.36,
      color,
      width: reduced ? 2 : 3.5,
    });
  }

  /** 飘字（得分 / 连击 / 提示） */
  popText(x: number, y: number, text: string, color: string, size: number = 24, rise: number = 46): void {
    this.texts.push({
      x, y, text, color, size,
      life: 0.95, maxLife: 0.95,
      rise,
    });
  }

  update(dt: number): void {
    const d = Math.min(dt, 0.1);

    for (const p of this.particles) {
      p.x += p.vx * d;
      p.y += p.vy * d;
      p.vy += 620 * d;       // 重力
      p.vx *= 1 - 1.6 * d;   // 阻尼
      p.rot += p.spin * d;
      p.life -= d;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const r of this.rings) r.life -= d;
    this.rings = this.rings.filter((r) => r.life > 0);

    for (const t of this.texts) t.life -= d;
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  draw(): void {
    // --- 冲击环 ---
    for (const r of this.rings) {
      const p = clamp01(1 - r.life / r.maxLife);
      const radius = r.from + (r.to - r.from) * Easing.outCubic(p);
      const alpha = (1 - p) * 0.85;
      gameCanvas.draw((ctx) => {
        ctx.strokeStyle = withAlpha(r.color, alpha);
        ctx.lineWidth = r.width * (1 - p * 0.6);
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }, 29);
    }

    // --- 粒子 ---
    for (const p of this.particles) {
      const alpha = clamp01(p.life / p.maxLife);
      gameCanvas.draw((ctx) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (p.shape === "dot") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }, 30);
    }

    // --- 飘字（真实淡出 + 上浮） ---
    for (const t of this.texts) {
      const p = clamp01(1 - t.life / t.maxLife);
      const alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      const y = t.y - t.rise * Easing.outQuad(p);
      // 弹出：前 25% 放大到 1.18 倍再回落
      const scale = p < 0.25 ? 0.75 + Easing.outBack(p / 0.25) * 0.43 : 1.18 - 0.18 * ((p - 0.25) / 0.75);
      gameCanvas.draw((ctx) => {
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(fontPx(t.size) * scale)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.strokeText(t.text, t.x, y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, y);
        ctx.globalAlpha = 1;
      }, 31);
    }
  }

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.texts = [];
  }

  get count(): number {
    return this.particles.length + this.rings.length + this.texts.length;
  }
}
