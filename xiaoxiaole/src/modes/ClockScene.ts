/**
 * ClockScene — 时间/钟表定向场景控制器
 *
 * 与前面几个模式同构：纯逻辑在 ClockEngine，这里只做绘制、输入、计时、反馈、暂停、回调。
 *
 * 两种题型：
 *   · read 认时间：上方画一个大钟面，下方 4 个时间文字按钮
 *   · set  拨钟表：上方显示目标时间文字，下方 4 个小钟面按钮
 * 钟面全部程序化绘制（表盘/刻度/数字/时针/分针），零外部素材。
 *
 * 适老要点：
 *   - 时针短而粗、分针长而细，刻意做得好区分（提示语也写明「短针看几点，长针看几分」）
 *   - 全程点选，不要求打字
 *   - 答错柔和提示并揭示正确项；超时明确说明
 */

import { getTheme, type ThemePalette } from "../config/themes";
import type { LevelConfig } from "../config/LevelConfig";
import { gameCanvas, fontPx } from "../ui/GameCanvas";
import { HUD } from "../ui/HUD";
import { PausePanel } from "../ui/PausePanel";
import { Feedback } from "../ui/Feedback";
import { audioSynth } from "../ui/AudioSynth";
import { tracker } from "../core/SessionTracker";
import { adaptive } from "../core/AdaptiveEngine";
import { progress } from "../core/ProgressStore";
import { api } from "../api/MockApi";
import { randomDialogue } from "../config/GameText";
import type { LevelSceneCallbacks } from "../scenes/types";
import { ClockEngine, formatClockTime, type ClockTime, type ClockTrial } from "./ClockEngine";

const NPC_NAME = "小园";

const ACCENT = "#3E7CB1";
const INTRO_SEC = 3.2;
const REVEAL_OK = 0.7;
const REVEAL_WRONG = 1.3;

interface OptRect { x: number; y: number; w: number; h: number; index: number }

/** 程序化绘制一个钟面（12 点方向朝上） */
function drawClockFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  t: ClockTime,
  showNumbers: boolean,
): void {
  // 表盘
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2B3A42";
  ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.stroke();

  // 刻度：12 个粗刻度 + 细分刻度
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const ang = (i * 6 - 90) * (Math.PI / 180);
    const len = major ? r * 0.12 : r * 0.06;
    ctx.strokeStyle = major ? "#2B3A42" : "rgba(43,58,66,0.35)";
    ctx.lineWidth = major ? Math.max(2, r * 0.035) : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * (r - len), cy + Math.sin(ang) * (r - len));
    ctx.lineTo(cx + Math.cos(ang) * (r - r * 0.03), cy + Math.sin(ang) * (r - r * 0.03));
    ctx.stroke();
  }

  // 数字 1-12
  if (showNumbers) {
    ctx.fillStyle = "#2B3A42";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(r * 0.2)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    for (let h = 1; h <= 12; h++) {
      const ang = (h * 30 - 90) * (Math.PI / 180);
      const nx = cx + Math.cos(ang) * r * 0.74;
      const ny = cy + Math.sin(ang) * r * 0.74;
      ctx.fillText(String(h), nx, ny);
    }
  }

  // 时针：短而粗（含分钟带来的偏移，模拟真实钟面）
  const hourAng = ((t.hour % 12) * 30 + t.minute * 0.5 - 90) * (Math.PI / 180);
  ctx.strokeStyle = "#2B3A42";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(3, r * 0.09);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hourAng) * r * 0.45, cy + Math.sin(hourAng) * r * 0.45);
  ctx.stroke();

  // 分针：长而细
  const minAng = (t.minute * 6 - 90) * (Math.PI / 180);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = Math.max(2, r * 0.055);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(minAng) * r * 0.72, cy + Math.sin(minAng) * r * 0.72);
  ctx.stroke();

  // 中心点
  ctx.fillStyle = "#2B3A42";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r * 0.07), 0, Math.PI * 2);
  ctx.fill();
}

export class ClockScene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;

  private engine: ClockEngine;
  private bg: ThemePalette;
  private hud = new HUD();
  private pausePanel = new PausePanel();
  private feedback = new Feedback();

  private lastFrame = 0;
  private finished = false;
  private resultAnimTime = 0;

  private readonly mode: "read" | "set";
  private readonly showNumbers: boolean;
  private readonly trials: number;
  private readonly trialTimeMs: number;
  private readonly pass: number;

  private scenePhase: "intro" | "play" | "done" = "intro";
  private introTimer = INTRO_SEC;
  private introDialogue = "";

  private trialStartMs = 0;
  private elapsedSec = 0;
  private pendingNext = false;
  private revealTimer = 0;
  private lastTrial: ClockTrial | null = null;
  private wrongIndex = -1;

  private optionRects: OptRect[] = [];
  private timers: number[] = [];

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;

    this.mode = level.clockMode ?? "read";
    this.showNumbers = level.clockNumbers ?? true;
    this.trials = level.stepLimit ?? 10;
    this.trialTimeMs = level.trialTimeMs ?? 0;
    this.pass = level.passTarget ?? Math.ceil(this.trials * 0.75);

    this.engine = new ClockEngine(
      this.mode,
      level.clockPrecision ?? "hour",
      this.trials,
    );
    this.bg = getTheme(level.theme);
    this.pausePanel = new PausePanel();
    this.introDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;

    tracker.start(level.id, "clock");
    audioSynth.unlock();

    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
  }

  // === 主循环 ===

  private update(time: number): void {
    const dt = this.lastFrame === 0 ? 0.016 : Math.min((time - this.lastFrame) / 1000, 0.1);
    this.lastFrame = time;

    this.pausePanel.update(dt);
    this.hud.update(dt);
    this.feedback.update(dt);

    if (this.finished) {
      this.resultAnimTime += dt;
      this.render();
      return;
    }
    if (this.pausePanel.isOpen) {
      this.render();
      return;
    }

    if (this.scenePhase === "intro") {
      this.introTimer -= dt;
      if (this.introTimer <= 0) {
        this.scenePhase = "play";
        this.startTrial();
      }
    } else if (this.scenePhase === "play") {
      if (this.pendingNext) {
        this.revealTimer -= dt;
        if (this.revealTimer <= 0) this.advance();
      } else if (!this.engine.getTrial()) {
        this.startTrial();
      } else if (this.trialTimeMs > 0) {
        this.elapsedSec += dt;
        if (this.elapsedSec * 1000 >= this.trialTimeMs) this.onTimeout();
      }
    }

    this.render();
  }

  private startTrial(): void {
    const t = this.engine.nextTrial();
    if (!t) {
      this.finishLevel();
      return;
    }
    this.lastTrial = t;
    this.wrongIndex = -1;
    this.trialStartMs = performance.now();
    this.elapsedSec = 0;
  }

  private advance(): void {
    this.pendingNext = false;
    this.wrongIndex = -1;
    if (this.engine.getState().done) this.finishLevel();
    else this.startTrial();
  }

  // === 输入 ===

  private onTouch(x: number, y: number): void {
    if (this.pausePanel.isOpen) {
      const act = this.pausePanel.hitTest(x, y);
      if (act === "resume") { this.pausePanel.hide(); audioSynth.playUi("button"); }
      else if (act === "restart") { audioSynth.playUi("button"); this.cb.onRestart(); }
      else if (act === "exit") { audioSynth.playUi("button"); this.cb.onExit(); }
      return;
    }
    if (this.finished || this.scenePhase !== "play") return;

    const hudAction = this.hud.hitTest(x, y);
    if (hudAction) {
      if (hudAction.kind === "pause") {
        this.pausePanel.show();
        audioSynth.playUi("button");
      } else if (hudAction.kind === "home") {
        audioSynth.playUi("button");
        this.cb.onExit();
      }
      return;
    }
    if (this.pendingNext || !this.engine.getTrial()) return;

    for (const opt of this.optionRects) {
      if (x >= opt.x && x <= opt.x + opt.w && y >= opt.y && y <= opt.y + opt.h) {
        this.handleAnswer(opt, x, y);
        return;
      }
    }
  }

  private handleAnswer(opt: OptRect, x: number, y: number): void {
    const rt = performance.now() - this.trialStartMs;
    this.lastTrial = this.engine.getTrial();
    const ok = this.engine.submit(opt.index, rt);
    this.pendingNext = true;
    audioSynth.playUi(ok ? "win" : "invalid");
    tracker.record("choice", ok, 1);

    if (ok) {
      this.feedback.burst(x, y, "#5BB98C", "对啦！");
      this.revealTimer = REVEAL_OK;
    } else {
      this.wrongIndex = opt.index;
      this.feedback.popText(x, y - 30, "差一点，是这个", "#E07A5F", 18, 90);
      this.revealTimer = REVEAL_WRONG;
    }
  }

  private onTimeout(): void {
    this.lastTrial = this.engine.getTrial();
    if (!this.lastTrial) return;
    this.engine.timeout(this.trialTimeMs);
    this.pendingNext = true;
    this.wrongIndex = -1;
    audioSynth.playUi("invalid");
    tracker.record("choice", false, 0);
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    this.feedback.popText(w / 2, h * 0.32 + 90, "时间到，这题算没答对", "#E07A5F", 18, 110);
    this.revealTimer = REVEAL_WRONG + 0.3;
  }

  // === 结算 ===

  private finishLevel(): void {
    if (this.finished) return;
    this.finished = true;
    this.scenePhase = "done";
    this.pausePanel.hide();
    gameCanvas.clearHandlers();

    const st = this.engine.getState();
    const passed = this.engine.isLevelPassed(this.pass);
    const medianRT = this.engine.getMedianRT();
    const accuracy = st.trials > 0 ? st.correct / st.trials : 0;

    const metrics = tracker.getMetrics(passed, st.trials, st.index);
    adaptive.recordSession(metrics);
    api.reportSession(tracker.toReport(passed, st.index, st.trials));
    progress.recordResult(this.level, passed, st.correct, st.index, accuracy, medianRT);

    audioSynth.playUi(passed ? "win" : "fail");

    const result = {
      passed,
      score: st.correct,
      stepsUsed: st.index,
      totalQuestions: st.trials,
      medianRT,
    };
    this.later(() => this.cb.onComplete(result), 1400);
  }

  // === 渲染 ===

  private render(): void {
    gameCanvas.draw((ctx) => this.drawBackground(ctx), 2);
    gameCanvas.draw((ctx) => this.drawBody(ctx), 10);
    gameCanvas.draw(() => this.feedback.draw(), 20);
    gameCanvas.draw((ctx) => this.drawHud(ctx), 30);
    if (this.pausePanel.isOpen) gameCanvas.draw(() => this.pausePanel.draw(), 200);
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, this.bg.cardTop);
    g.addColorStop(1, this.bg.cardBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawBody(ctx: CanvasRenderingContext2D): void {
    if (this.scenePhase === "intro") {
      this.drawIntro(ctx);
      return;
    }
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const t = this.engine.getTrial() ?? this.lastTrial;
    if (!t) return;

    // 题型横幅
    const banner = this.mode === "read" ? "本关：看钟面，选时间" : "本关：看时间，选钟面";
    gameCanvas.drawRoundRect(w / 2 - 120, 80, 240, 34, 17, ACCENT);
    gameCanvas.drawText(banner, w / 2, 97, { size: 16, color: "#fff", bold: true });

    // 题干区：read 画大钟面，set 显示时间文字
    const topR = Math.min(w * 0.22, 88);
    const topCy = h * 0.28;
    if (this.mode === "read") {
      drawClockFace(ctx, w / 2, topCy, topR, t.time, this.showNumbers);
    } else {
      gameCanvas.drawText(formatClockTime(t.time), w / 2, topCy,
        { size: Math.round(topR * 0.62), color: "#FFE66D", bold: true });
    }

    // 提示（含读钟诀窍）
    const tipY = topCy + topR + 30;
    const tip = this.pendingNext
      ? (this.wrongIndex === -1 ? "很好！" : "再看一眼正确的")
      : (this.mode === "read" ? "短针看几点，长针看几分" : "找出指针对应的钟面");
    gameCanvas.drawText(tip, w / 2, tipY,
      { size: 17, color: this.pendingNext ? "#FFE66D" : "#c9d3ea" });

    // 限时进度条
    if (this.trialTimeMs > 0 && !this.pendingNext && this.engine.getTrial()) {
      const left = Math.max(0, 1 - this.elapsedSec / (this.trialTimeMs / 1000));
      const bw = Math.min(w - 80, 260);
      gameCanvas.drawRoundRect((w - bw) / 2, tipY + 22, bw, 8, 4, "rgba(255,255,255,0.2)");
      gameCanvas.drawRoundRect((w - bw) / 2, tipY + 22, Math.max(6, bw * left), 8, 4,
        left > 0.35 ? "#4ECDC4" : "#E5484D");
    }

    this.drawOptions(ctx, t);
  }

  private drawOptions(ctx: CanvasRenderingContext2D, t: ClockTrial): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const n = t.options.length;
    const cols = 2;
    const rows = Math.ceil(n / cols);
    const bw = (w - 64 - 16) / cols;
    const bh = this.mode === "set" ? 96 : 62; // 拨钟题要画钟面，格子更高
    const gap = 16;
    const totalH = rows * bh + (rows - 1) * gap;
    const startY = h - totalH - 36;

    this.optionRects = [];
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 32 + col * (bw + 16);
      const y = startY + row * (bh + gap);
      this.optionRects.push({ x, y, w: bw, h: bh, index: i });

      ctx.fillStyle = "#FFFFFF";
      this.roundRect(ctx, x, y, bw, bh, 14);
      ctx.fill();

      // 揭示正确答案 / 标出错选
      if (this.pendingNext) {
        if (i === t.answerIndex) {
          ctx.strokeStyle = "#5BB98C";
          ctx.lineWidth = 5;
          this.roundRect(ctx, x, y, bw, bh, 14);
          ctx.stroke();
        } else if (i === this.wrongIndex) {
          ctx.strokeStyle = "#E07A5F";
          ctx.lineWidth = 5;
          this.roundRect(ctx, x, y, bw, bh, 14);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = "rgba(0,0,0,0.1)";
        ctx.lineWidth = 2;
        this.roundRect(ctx, x, y, bw, bh, 14);
        ctx.stroke();
      }

      if (this.mode === "read") {
        // 文字时间选项
        ctx.fillStyle = "#2B3A42";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `bold ${fontPx(23)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
        ctx.fillText(formatClockTime(t.options[i]), x + bw / 2, y + bh / 2);
      } else {
        // 小钟面选项
        const r = Math.min(bh * 0.4, bw * 0.32);
        drawClockFace(ctx, x + bw / 2, y + bh / 2, r, t.options[i], this.showNumbers);
      }
    }
  }

  private drawIntro(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const bw = Math.min(w - 60, 460);
    const bh = 96;
    const bx = (w - bw) / 2;
    const by = 150;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    this.roundRect(ctx, bx, by, bw, bh, 16);
    ctx.fill();
    ctx.fillStyle = "#2B3A42";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontPx(19)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    this.wrapText(ctx, this.introDialogue, w / 2, by + bh / 2, bw - 36, 26);

    gameCanvas.drawText("短针看几点，长针看几分",
      w / 2, by + bh + 32, { size: 18, color: ACCENT, bold: true });
  }

  private drawHud(_ctx: CanvasRenderingContext2D): void {
    const st = this.engine.getState();
    this.hud.draw(
      Math.max(0, st.trials - st.index), // 剩余题数
      st.correct,                        // 答对数
      this.pass,
      "clock",
      this.level.items,
      [],
      this.level.name,
      ACCENT,
    );
  }

  // === 工具 ===

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, lineH: number): void {
    const chars = [...text];
    let line = "";
    const lines: string[] = [];
    for (const ch of chars) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) lines.push(line);
    const startY = cy - ((lines.length - 1) * lineH) / 2;
    lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineH));
  }

  private later(fn: () => void, delayMs: number): void {
    const id = window.setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      fn();
    }, delayMs);
    this.timers.push(id);
  }

  destroy(): void {
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
  }
}
