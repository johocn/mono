/**
 * HUD — 顶部状态条（步数 / 分数 / 进度）+ 底部道具栏
 *
 * 布局设计（适老化）：
 * - 顶部 84px：左上暂停按钮 52×52，步数大号数字，右侧分数 + 进度条
 * - 底部 88px：道具按钮 64×64，横向居中，附带数量角标
 *
 * 道具按钮是可点击的：场景先调用 draw()，再用 hitTest() 判定点击。
 */

import { gameCanvas } from "./GameCanvas";
import type { ItemConfig } from "../config/LevelConfig";
import { clamp01 } from "../core/Tween";

export type HudAction = { kind: "item"; key: keyof ItemConfig } | { kind: "pause" } | { kind: "home" };

interface ItemRect { key: keyof ItemConfig; x: number; y: number; w: number; h: number }

export const HUD_TOP_H = 84;
const ITEM_SIZE = 64;
const ITEM_GAP = 14;

const ITEM_META: Record<keyof ItemConfig, { icon: string; label: string }> = {
  hint: { icon: "💡", label: "提示" },
  reshuffle: { icon: "🔄", label: "重洗" },
  reveal: { icon: "👁", label: "揭示" },
  peek: { icon: "🔍", label: "偷看" },
  undo: { icon: "↩", label: "撤销" },
  rehear: { icon: "🔊", label: "重听" },
  step: { icon: "🪜", label: "补步" },
  shield: { icon: "🛡️", label: "护盾" },
  hammer: { icon: "🔨", label: "锤子" },
};

/** 收集目标药丸（顶部目标区，替代分数条显示） */
export interface GoalPill { icon: string; color: string; current: number; target: number }

export class HUD {
  private itemRects: ItemRect[] = [];
  private pauseRect = { x: 0, y: 0, w: 0, h: 0 };
  /** 关卡内「回主页」按钮（右上，代替底部导航：底部被道具栏占用） */
  private homeRect = { x: 0, y: 0, w: 0, h: 0 };
  private flashes: Partial<Record<keyof ItemConfig, number>> = {};

  /** 显示分数滚动动画用的当前值 */
  private displayScore = 0;
  private scoreInitialized = false;
  private scorePulse = 0;
  /** 步数变化时的强调动画 */
  private stepPulse = 0;

  update(dt: number): void {
    for (const k of Object.keys(this.flashes) as (keyof ItemConfig)[]) {
      const v = this.flashes[k];
      if (v === undefined) continue;
      const next = v - dt;
      if (next <= 0) delete this.flashes[k];
      else this.flashes[k] = next;
    }
    if (this.scorePulse > 0) this.scorePulse = Math.max(0, this.scorePulse - dt);
    if (this.stepPulse > 0) this.stepPulse = Math.max(0, this.stepPulse - dt);
  }

  flashItem(key: keyof ItemConfig): void {
    this.flashes[key] = 0.9;
  }

  pulseScore(): void { this.scorePulse = 0.35; }
  pulseSteps(): void { this.stepPulse = 0.35; }

  /**
   * 绘制 HUD
   * @param keys 需要显示的道具键（按顺序）
   */
  draw(
    stepsLeft: number,
    score: number,
    target: number,
    mode: string,
    items: ItemConfig,
    keys: (keyof ItemConfig)[],
    title?: string,
    accent?: string,
    goalPills?: GoalPill[],
    timeLeftMs?: number,
  ): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    // 分数滚动：每帧向真实值逼近，步进不小于 1，避免小数残留
    if (!this.scoreInitialized) {
      this.displayScore = score;
      this.scoreInitialized = true;
    } else if (this.displayScore !== score) {
      const gap = score - this.displayScore;
      const step = Math.max(1, Math.abs(gap) * 0.22);
      this.displayScore += Math.sign(gap) * Math.min(Math.abs(gap), step);
      this.displayScore = Math.round(this.displayScore);
      if (this.displayScore === score) this.scorePulse = 0.35;
    }

    // === 顶部条 ===
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, HUD_TOP_H);
      grad.addColorStop(0, "rgba(18,20,38,0.96)");
      grad.addColorStop(1, "rgba(18,20,38,0.72)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, HUD_TOP_H);
      ctx.strokeStyle = "rgba(120,140,210,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, HUD_TOP_H - 0.5);
      ctx.lineTo(w, HUD_TOP_H - 0.5);
      ctx.stroke();
    }, 40);

    // --- 暂停按钮 ---
    this.pauseRect = { x: 14, y: 16, w: 52, h: 52 };
    gameCanvas.drawRoundRect(this.pauseRect.x, this.pauseRect.y, this.pauseRect.w, this.pauseRect.h, 12,
      "rgba(255,255,255,0.10)", 41);
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(230,235,255,0.9)";
      const cx = this.pauseRect.x + this.pauseRect.w / 2;
      const cy = this.pauseRect.y + this.pauseRect.h / 2;
      ctx.fillRect(cx - 8, cy - 11, 6, 22);
      ctx.fillRect(cx + 2, cy - 11, 6, 22);
    }, 42);

    // --- 回主页按钮（右上；关卡内没有底部导航，用此按钮防迷路）---
    this.homeRect = { x: w - 72, y: 14, w: 58, h: 56 };
    gameCanvas.drawRoundRect(this.homeRect.x, this.homeRect.y, this.homeRect.w, this.homeRect.h, 14,
      "rgba(78,205,196,0.20)", 41);
    gameCanvas.drawStrokeRect(this.homeRect.x, this.homeRect.y, this.homeRect.w, this.homeRect.h, 14,
      "rgba(78,205,196,0.65)", 2, 42);
    gameCanvas.drawText("🏠", this.homeRect.x + this.homeRect.w / 2, this.homeRect.y + this.homeRect.h / 2 + 2,
      { size: 24 }, 43);

    // --- 步数 / 时间（左侧固定列，文字保持左对齐避免与右上角信息相撞） ---
    const stepScale = 1 + (this.stepPulse > 0 ? (this.stepPulse / 0.35) * 0.12 : 0);
    if (timeLeftMs !== undefined) {
      const totalSec = Math.ceil(timeLeftMs / 1000);
      const mm = Math.floor(totalSec / 60);
      const ss = totalSec % 60;
      const timeStr = `${mm}:${ss.toString().padStart(2, "0")}`;
      const timeColor = timeLeftMs <= 10000 ? "#FF7A7A" : "#4ECDC4";
      gameCanvas.drawText("时间", 84, 26, { size: 12, color: "rgba(180,190,220,0.85)", align: "left" }, 42);
      gameCanvas.drawText(
        timeStr,
        84, 54,
        // 不在此处取整：字号由 drawText 统一乘以适老化倍率后再生效
        { size: 25 * stepScale, color: timeColor, bold: true, align: "left" },
        42,
      );
    } else {
      const stepColor = stepsLeft <= 3 ? "#FF7A7A" : "#4ECDC4";
      const stepLabel = mode === "corsi" ? "剩余轮"
        : mode === "face" ? "剩余题"
        : mode === "memory" ? "剩余步"
        : mode === "stroop" ? "剩余题"
        : mode === "money" ? "剩余题"
        : mode === "pm" ? "剩余题"
        : mode === "clock" ? "剩余题"
        : "步数";
      gameCanvas.drawText(stepLabel, 84, 26, { size: 12, color: "rgba(180,190,220,0.85)", align: "left" }, 42);
      gameCanvas.drawText(
        `${stepsLeft}`,
        84, 54,
        { size: 25 * stepScale, color: stepColor, bold: true, align: "left" },
        42,
      );
    }

    // --- 标题（右上角小字，与分数同列） ---
    if (title) {
      gameCanvas.drawText(title, w - 78, 22,
        { size: 13, color: accent ?? "rgba(200,208,235,0.9)", align: "right" }, 42);
    }

    // --- 分数 / 进度（或收集目标药丸）---
    const hasGoal = goalPills !== undefined && goalPills.length > 0;
    if (hasGoal) {
      const n = goalPills!.length;
      const gap = 8;
      const leftReserve = 96; // 为左侧步数留白，避免小屏挤压
      const avail = (w - 16) - leftReserve;
      const pw = Math.max(54, Math.min(96, Math.floor((avail - gap * (n - 1)) / n)));
      const ph = 40;
      const totalW = n * pw + (n - 1) * gap;
      const startX = (w - 78) - totalW;
      const py = 40;
      goalPills!.forEach((p, i) => {
        const px = startX + i * (pw + gap);
        const done = p.current >= p.target;
        const bg = done ? "rgba(78,205,196,0.28)" : (p.color + "33");
        gameCanvas.drawRoundRect(px, py, pw, ph, 12, bg, 41);
        gameCanvas.drawStrokeRect(px, py, pw, ph, 12, done ? "#4ECDC4" : p.color, done ? 3 : 2, 42);
        gameCanvas.drawText(p.icon, px + 18, py + ph / 2 + 7,
          { size: 20, bold: true, color: done ? "#4ECDC4" : p.color, align: "center" }, 43);
        const txt = done ? "✓" : `${p.current}/${p.target}`;
        gameCanvas.drawText(txt, px + pw - 8, py + ph / 2 + 6,
          { size: 15, bold: true, color: "#fff", align: "right" }, 43);
      });
    } else {
      const isScore = mode === "match3";
      const cur = isScore ? this.displayScore : score;
      const label = isScore ? "分数"
        : mode === "corsi" ? "正确轮"
        : mode === "face" ? "认对"
        : mode === "memory" ? "已配对"
        : mode === "stroop" ? "答对"
        : mode === "money" ? "算对"
        : mode === "pm" ? "做对"
        : mode === "clock" ? "认对"
        : "进度";
      const scoreScale = 1 + (this.scorePulse > 0 ? (this.scorePulse / 0.35) * 0.1 : 0);
      gameCanvas.drawText(
        `${label} ${cur} / ${target}`,
        w - 78, 48,
        { size: 19 * scoreScale, color: accent ?? "#FFE66D", bold: true, align: "right" },
        42,
      );

      // 进度条
      const barW = Math.min(180, w * 0.42);
      const barX = w - 78 - barW;
      const barY = 68;
      const ratio = clamp01(target > 0 ? cur / target : 0);
      gameCanvas.drawRoundRect(barX, barY, barW, 10, 5, "rgba(255,255,255,0.13)", 41);
      if (ratio > 0) {
        gameCanvas.drawRoundRect(barX, barY, Math.max(6, barW * ratio), 10, 5, accent ?? "#FFE66D", 42);
      }
    }

    // === 底部道具栏（自适应尺寸，避免道具过多横向溢出） ===
    this.itemRects = [];
    const visible = keys.filter((k) => k in items);
    if (visible.length === 0) return;

    const n = visible.length;
    const margin = 12;
    const maxBarW = w - margin * 2;
    const size = Math.max(40, Math.min(ITEM_SIZE, Math.floor((maxBarW - (n - 1) * ITEM_GAP) / n)));
    const totalW = n * size + (n - 1) * ITEM_GAP;
    const startX = (w - totalW) / 2;
    const barY2 = h - 88;
    // 设计稿比例字号（不取整），交由 drawText 统一放大
    const iconSize = size * 0.40;
    const labelSize = size * 0.19;

    visible.forEach((key, i) => {
      const x = startX + i * (size + ITEM_GAP);
      const rect: ItemRect = { key, x, y: barY2, w: size, h: size };
      this.itemRects.push(rect);

      const count = items[key];
      const enabled = count > 0;
      const flash = this.flashes[key] ?? 0;

      // 可用时轻微发光；刚获得时高亮闪烁
      const bg = enabled ? "rgba(78,205,196,0.20)" : "rgba(255,255,255,0.05)";
      gameCanvas.drawRoundRect(x, barY2, size, size, 14, bg, 41);

      const borderColor = flash > 0
        ? `rgba(255,230,109,${0.35 + 0.65 * Math.abs(Math.sin(flash * 18))})`
        : enabled ? "rgba(78,205,196,0.65)" : "rgba(255,255,255,0.12)";
      gameCanvas.drawStrokeRect(x, barY2, size, size, 14, borderColor,
        flash > 0 ? 3 : 2, 42);

      const meta = ITEM_META[key];
      gameCanvas.drawText(meta.icon, x + size / 2, barY2 + size * 0.42,
        { size: iconSize, color: enabled ? "#fff" : "rgba(255,255,255,0.35)" }, 43);
      gameCanvas.drawText(meta.label, x + size / 2, barY2 + size * 0.80,
        { size: labelSize, color: enabled ? "rgba(200,230,240,0.95)" : "rgba(255,255,255,0.3)" }, 43);

      // 数量角标
      const badgeX = x + size - 9;
      const badgeY = barY2 + 9;
      gameCanvas.drawCircle(badgeX, badgeY, 11,
        enabled ? "#4ECDC4" : "rgba(255,255,255,0.18)", 44);
      gameCanvas.drawText(`${count}`, badgeX, badgeY,
        { size: 13, bold: true, color: enabled ? "#0c1a22" : "rgba(255,255,255,0.5)" }, 45);
    });
  }

  hitTest(x: number, y: number): HudAction | null {
    const p = this.pauseRect;
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
      return { kind: "pause" };
    }
    // 回主页按钮
    const hr = this.homeRect;
    if (x >= hr.x && x <= hr.x + hr.w && y >= hr.y && y <= hr.y + hr.h) {
      return { kind: "home" };
    }

    for (const r of this.itemRects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return { kind: "item", key: r.key };
      }
    }
    return null;
  }

  /** 分数显示值重置（换关时调用） */
  resetScore(): void {
    this.scoreInitialized = false;
    this.scorePulse = 0;
    this.stepPulse = 0;
    this.flashes = {};
    this.itemRects = [];
  }
}
