/**
 * WheelScene — 幸运转盘（留存 / 活跃钩子）
 *
 * 对标主流「转盘抽奖」：
 * - 6 个奖品扇区，按权重随机落点（非均匀），大奖概率低
 * - 旋转演出（缓出停稳、指针落顶），结束后发奖并展示结果
 * - 每进入一次限转 1 次（避免经济被刷），「收下」关闭
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { safety } from "../core/SafetyManager";
import { progress } from "../core/ProgressStore";
import { Easing } from "../core/Tween";
import type { ItemConfig } from "../config/LevelConfig";

interface WheelReward { item?: keyof ItemConfig; itemCount?: number; points?: number; }

const WHEEL: { label: string; color: string; reward: WheelReward; weight: number }[] = [
  { label: "提示×1", color: "#FF6B9D", reward: { item: "hint", itemCount: 1 }, weight: 30 },
  { label: "积分+10", color: "#4ECDC4", reward: { points: 10 }, weight: 25 },
  { label: "重洗×1", color: "#9b59b6", reward: { item: "reshuffle", itemCount: 1 }, weight: 18 },
  { label: "积分+20", color: "#6C5CE7", reward: { points: 20 }, weight: 15 },
  { label: "揭示×1", color: "#FFE66D", reward: { item: "reveal", itemCount: 1 }, weight: 8 },
  { label: "积分+50", color: "#e17055", reward: { points: 50 }, weight: 4 },
];

const SPIN_DUR = 2.4;

export class WheelScene {
  private phase: "idle" | "spinning" | "done" = "idle";
  private angle = 0;
  private targetAngle = 0;
  private spinStart = 0;
  private chosen = -1;
  private reward: WheelReward = {};
  private pointsGained = 0;
  private spinRect: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };
  private closeRect: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private onClose: () => void) {
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
  }

  private update(now: number): void {
    if (this.phase === "spinning") {
      const t = Math.min((now - this.spinStart) / 1000 / SPIN_DUR, 1);
      this.angle = this.targetAngle * Easing.outCubic(t);
      if (t >= 1) this.finishSpin();
    }
    this.render();
  }

  /** 按权重选扇区，并计算令其中心停到顶部指针的目标旋转角 */
  private startSpin(): void {
    const total = WHEEL.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < WHEEL.length; i++) {
      r -= WHEEL[i].weight;
      if (r <= 0) { idx = i; break; }
    }
    this.chosen = idx;
    const sector = 360 / WHEEL.length;
    const centerLocal = idx * sector + sector / 2;
    this.targetAngle = (270 - centerLocal) + 360 * 5; // 5 圈后顶部落定
    this.phase = "spinning";
    this.spinStart = performance.now();
    audioSynth.playUi("button");
  }

  private finishSpin(): void {
    this.angle = this.targetAngle;
    this.phase = "done";
    const rw = WHEEL[this.chosen].reward;
    this.reward = rw;
    if (rw.item && rw.itemCount) progress.addItem(rw.item, rw.itemCount);
    if (rw.points) this.pointsGained = progress.addPoints(rw.points, "earn_wheel");
    audioSynth.playUi("win");
  }

  private onTouch(x: number, y: number): void {
    if (this.phase === "done") {
      const b = this.closeRect;
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
        audioSynth.playUi("button");
        gameCanvas.setTouchHandler(null);
        gameCanvas.setUpdateCallback(null);
        this.onClose();
      }
      return;
    }
    if (this.phase === "idle") {
      const b = this.spinRect;
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
        this.startSpin();
      }
    }
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const cx = w / 2;
    const cy = h / 2 - 10;
    const R = Math.min(w, h) * 0.34;

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.5, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    gameCanvas.drawText("幸运转盘", w / 2, 64, { size: 30, color: "#FFE66D", bold: true }, 5);

    const sector = (Math.PI * 2) / WHEEL.length;
    gameCanvas.draw((ctx) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((this.angle * Math.PI) / 180);
      for (let i = 0; i < WHEEL.length; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, i * sector, (i + 1) * sector);
        ctx.closePath();
        ctx.fillStyle = WHEEL[i].color;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 2;
        ctx.stroke();
        // 标签
        ctx.save();
        ctx.rotate(i * sector + sector / 2);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(WHEEL[i].label, R * 0.62, 0);
        ctx.restore();
      }
      ctx.restore();
    }, 6);

    // 外圈
    gameCanvas.draw((ctx) => {
      ctx.beginPath();
      ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,230,109,0.8)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }, 7);

    // 顶部指针
    gameCanvas.draw((ctx) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - R - 14);
      ctx.lineTo(cx - 14, cy - R + 6);
      ctx.lineTo(cx + 14, cy - R + 6);
      ctx.closePath();
      ctx.fillStyle = "#FFE66D";
      ctx.fill();
    }, 8);

    // 中心按钮
    const hubR = R * 0.26;
    this.spinRect = { x: cx - hubR, y: cy - hubR, w: hubR * 2, h: hubR * 2 };
    gameCanvas.draw((ctx) => {
      ctx.beginPath();
      ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
      ctx.fillStyle = this.phase === "idle" ? "#FFE66D" : "rgba(255,230,109,0.4)";
      ctx.fill();
    }, 9);
    const hubText = this.phase === "idle" ? "抽奖" : this.phase === "spinning" ? "··" : "✓";
    gameCanvas.drawText(hubText, cx, cy + 1, { size: 22, color: "#241a06", bold: true }, 10);

    if (this.phase === "done") this.renderResult(w, h);
  }

  private renderResult(w: number, h: number): void {
    const pw = Math.min(w - 56, 340);
    const ph = 250;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(px, py, px, py + ph);
      grad.addColorStop(0, "#caa23a");
      grad.addColorStop(1, "#8a6a1e");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 18);
      ctx.fill();
    }, 200);

    gameCanvas.drawText("🎉 恭喜获得", w / 2, py + 50, { size: 22, color: "#241a06", bold: true }, 201);
    const rw = this.reward;
    const label = rw.item ? `${this.itemName(rw.item)}×${rw.itemCount}` : `积分 +${rw.points}`;
    gameCanvas.drawText(label, w / 2, py + 110, { size: 26, color: "#241a06", bold: true }, 202);
    if (this.pointsGained) {
      gameCanvas.drawText(`（积分余额 ${progress.getPoints()}）`, w / 2, py + 146, { size: 13, color: "#3a2c08" }, 202);
    }

    const bw = pw - 60;
    const bh = 52;
    const bx = px + 30;
    const by = py + ph - bh - 24;
    this.closeRect = { x: bx, y: by, w: bw, h: bh };
    safety.assertTapSize(Math.min(bw, bh), "wheel-close");
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "#241a06";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 14);
      ctx.fill();
    }, 202);
    gameCanvas.drawText("收下", w / 2, by + 28, { size: 20, color: "#FFE66D", bold: true }, 203);
  }

  private itemName(k: keyof ItemConfig): string {
    const map: Record<keyof ItemConfig, string> = {
      hint: "提示", reshuffle: "重洗", reveal: "揭示", peek: "偷看", undo: "撤销", rehear: "重听", step: "补步", shield: "护盾", hammer: "锤子",
    };
    return map[k];
  }

  destroy(): void {
    gameCanvas.setTouchHandler(null);
    gameCanvas.setUpdateCallback(null);
  }
}
