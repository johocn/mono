/**
 * StroopScene — 色词干扰（Stroop Color-Word）场景控制器
 *
 * 与 CorsiScene / FaceScene 同构：纯逻辑在 StroopEngine，这里只做
 * Canvas 绘制、输入、计时、反馈、暂停、回调。
 *
 * 流程：NPC 开场白 → 逐题显示「颜色词 + 墨色」→ 点选 → 判定 → 下一题 → 结算。
 *
 * 四条难度轴（全部读自关卡配置，不在场景里硬编码）：
 *   ① 冲突比例 ② 颜色选项数 ③ 每题限时 ④ 规则反转（点字义而非墨色）
 *
 * 适老要点：
 *   - 选项按钮「色块 + 文字标签」并存，兼顾色弱 / 辨色困难
 *   - 反转关卡有常驻醒目规则横幅，避免老人记错规则
 *   - 超时明确提示「时间到，这题算没答对」，不静默扣分
 *   - 答错柔和反馈，并揭示正确答案
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
import { StroopEngine, STROOP_COLORS, type StroopTrial } from "./StroopEngine";

const NPC_NAME = "小园";

const ACCENT = "#F2784B";
const INTRO_SEC = 3.2;
const REVEAL_OK = 0.7;      // 答对后的停留（秒）
const REVEAL_WRONG = 1.2;   // 答错后的停留（含揭示正确答案）

interface OptionRect { x: number; y: number; w: number; h: number; index: number }

/** 依据底色亮度决定文字用白字还是深字（保证黄色底也看得清） */
function textOn(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 160 ? "#2B3A42" : "#ffffff";
}

export class StroopScene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;

  private engine: StroopEngine;
  private bg: ThemePalette;
  private hud = new HUD();
  private pausePanel = new PausePanel();
  private feedback = new Feedback();

  private lastFrame = 0;
  private finished = false;
  private resultAnimTime = 0;

  private readonly colors: number;
  private readonly trials: number;
  private readonly trialTimeMs: number;
  private readonly reverse: boolean;
  private readonly pass: number;

  private scenePhase: "intro" | "play" | "done" = "intro";
  private introTimer = INTRO_SEC;
  private introDialogue = "";
  private instruction = "";

  private trialStartMs = 0;
  private elapsedSec = 0;      // 本题已用时（秒）
  private pendingNext = false; // 已作答，等待进入下一题
  private revealTimer = 0;
  private lastTrial: StroopTrial | null = null;
  private wrongIndex = -1;

  private optionRects: OptionRect[] = [];
  private timers: number[] = [];

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;

    this.colors = level.stroopColors ?? 2;
    this.trials = level.stepLimit ?? 10;
    this.trialTimeMs = level.trialTimeMs ?? 0;
    this.reverse = level.reverseRule ?? false;
    this.pass = level.passTarget ?? Math.ceil(this.trials * 0.75);

    this.engine = new StroopEngine(this.colors, this.trials, level.conflictRatio ?? 0.5, this.reverse);
    this.bg = getTheme(level.theme);
    this.pausePanel = new PausePanel();

    this.introDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;
    this.instruction = this.reverse ? "点出【字的意思】" : "点出【字的颜色】";

    tracker.start(level.id, "stroop");
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

    // 结算 / 暂停时冻结计时，保证限时公平
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
      this.updatePlay(dt);
    }

    this.render();
  }

  private updatePlay(dt: number): void {
    if (this.pendingNext) {
      this.revealTimer -= dt;
      if (this.revealTimer <= 0) this.advance();
      return;
    }
    if (!this.engine.getTrial()) {
      this.startTrial();
      return;
    }
    if (this.trialTimeMs > 0) {
      this.elapsedSec += dt;
      if (this.elapsedSec * 1000 >= this.trialTimeMs) this.onTimeout();
    }
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

  private handleAnswer(opt: OptionRect, x: number, y: number): void {
    const rt = performance.now() - this.trialStartMs;
    this.lastTrial = this.engine.getTrial();
    const ok = this.engine.submit(opt.index, rt);
    this.pendingNext = true;
    audioSynth.playUi(ok ? "win" : "invalid");
    tracker.record("choice", ok, 1);

    if (ok) {
      this.feedback.burst(x, y, "#5BB98C", "对了！");
      this.revealTimer = REVEAL_OK;
    } else {
      this.wrongIndex = opt.index;
      this.feedback.popText(x, y - 30, "看错了，是这个", "#E07A5F", 18, 90);
      this.revealTimer = REVEAL_WRONG;
    }
  }

  private onTimeout(): void {
    const t = this.engine.getTrial();
    if (!t) return;
    this.lastTrial = t;
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
    // 第 6 个参数传入中位反应时，供 computeStroopStars 评星
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

    // 常驻规则横幅（反转关卡尤其重要，避免老人记错规则）
    const banner = this.reverse ? "本关规则：点【字的意思】" : "本关规则：点【字的颜色】";
    gameCanvas.drawRoundRect(w / 2 - 130, 80, 260, 34, 17,
      this.reverse ? "#8B5CF6" : "#F2784B");
    gameCanvas.drawText(banner, w / 2, 97, { size: 16, color: "#fff", bold: true });

    const trial = this.engine.getTrial();
    const shown = trial ?? this.lastTrial;

    if (shown) {
      // 颜色词（用墨色绘制）
      const size = Math.min(w * 0.34, 130);
      const cy = h * 0.3;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.round(size)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillStyle = STROOP_COLORS[shown.inkIndex].hex;
      ctx.fillText(shown.word, w / 2, cy);

      // 限时进度条
      if (this.trialTimeMs > 0 && trial && !this.pendingNext) {
        const left = Math.max(0, 1 - this.elapsedSec / (this.trialTimeMs / 1000));
        const bw = Math.min(w - 80, 260);
        gameCanvas.drawRoundRect((w - bw) / 2, cy + size * 0.62, bw, 8, 4,
          "rgba(255,255,255,0.2)");
        gameCanvas.drawRoundRect((w - bw) / 2, cy + size * 0.62, Math.max(6, bw * left), 8, 4,
          left > 0.35 ? "#4ECDC4" : "#E5484D");
      }
    }

    this.drawOptions(ctx);
  }

  private drawOptions(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const n = this.colors;
    const cols = 2;
    const rows = Math.ceil(n / cols);
    const bw = (w - 64 - 16) / cols;
    const bh = 66;
    const gap = 16;
    const totalH = rows * bh + (rows - 1) * gap;
    const startY = h - totalH - 40;

    this.optionRects = [];
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 32 + col * (bw + 16);
      const y = startY + row * (bh + gap);
      this.optionRects.push({ x, y, w: bw, h: bh, index: i });

      const c = STROOP_COLORS[i];
      ctx.fillStyle = c.hex;
      this.roundRect(ctx, x, y, bw, bh, 16);
      ctx.fill();

      // 揭示正确答案 / 标出错选
      if (this.pendingNext && this.lastTrial) {
        if (i === this.lastTrial.answerIndex) {
          ctx.strokeStyle = "#5BB98C";
          ctx.lineWidth = 5;
          this.roundRect(ctx, x, y, bw, bh, 16);
          ctx.stroke();
        } else if (i === this.wrongIndex) {
          ctx.strokeStyle = "#E07A5F";
          ctx.lineWidth = 5;
          this.roundRect(ctx, x, y, bw, bh, 16);
          ctx.stroke();
        }
      }

      // 色块 + 文字标签并存（适老 / 色弱友好）
      ctx.fillStyle = textOn(c.hex);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${fontPx(28)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillText(c.name, x + bw / 2, y + bh / 2);
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

    const hint = this.reverse
      ? "这一关要点【字的意思】，不看颜色"
      : "记住：只看字的颜色，不看字的意思";
    gameCanvas.drawText(hint, w / 2, by + bh + 34, { size: 17, color: "#F2784B", bold: true });
  }

  private drawHud(_ctx: CanvasRenderingContext2D): void {
    const st = this.engine.getState();
    this.hud.draw(
      Math.max(0, st.trials - st.index), // 剩余题数
      st.correct,                        // 已答对
      this.pass,                         // 需答对
      "stroop",
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
