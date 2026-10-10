/**
 * MoneyScene — 日常钱币计算（买菜找零 / 合计）场景控制器
 *
 * 与 StroopScene 同构：纯逻辑在 MoneyEngine，这里只做绘制、输入、计时、反馈、暂停、回调。
 *
 * 流程：NPC 开场白 → 逐题显示商品与价格 → 点选金额 → 判定 → 下一题 → 结算。
 *
 * 适老要点：
 *   - 全程点选，绝不要求打字输入数字
 *   - 商品用 emoji + 中文名 + 大号价签，贴近真实买菜场景
 *   - 金额一律以「分」运算后格式化（¥12 / ¥12.5），不会出现浮点零头
 *   - 超时明确提示；答错柔和反馈并揭示正确答案
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
import { MoneyEngine, formatCents, type MoneyProblem } from "./MoneyEngine";

const NPC_NAME = "小园";

const ACCENT = "#2FA84F";
const INTRO_SEC = 3.2;
const REVEAL_OK = 0.7;
const REVEAL_WRONG = 1.3;

interface OptionRect { x: number; y: number; w: number; h: number; index: number }

export class MoneyScene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;

  private engine: MoneyEngine;
  private bg: ThemePalette;
  private hud = new HUD();
  private pausePanel = new PausePanel();
  private feedback = new Feedback();

  private lastFrame = 0;
  private finished = false;
  private resultAnimTime = 0;

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
  private lastProblem: MoneyProblem | null = null;
  private wrongIndex = -1;

  private optionRects: OptionRect[] = [];
  private timers: number[] = [];

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;

    this.trials = level.stepLimit ?? 10;
    this.trialTimeMs = level.trialTimeMs ?? 0;
    this.pass = level.passTarget ?? Math.ceil(this.trials * 0.75);

    this.engine = new MoneyEngine(
      level.moneyMode ?? "change",
      level.moneyItems ?? 1,
      level.moneyMax ?? 20,
      level.useCents ?? false,
      this.trials,
    );
    this.bg = getTheme(level.theme);
    this.pausePanel = new PausePanel();

    this.introDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;

    tracker.start(level.id, "money");
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
        this.startProblem();
      }
    } else if (this.scenePhase === "play") {
      if (this.pendingNext) {
        this.revealTimer -= dt;
        if (this.revealTimer <= 0) this.advance();
      } else if (!this.engine.getProblem()) {
        this.startProblem();
      } else if (this.trialTimeMs > 0) {
        this.elapsedSec += dt;
        if (this.elapsedSec * 1000 >= this.trialTimeMs) this.onTimeout();
      }
    }

    this.render();
  }

  private startProblem(): void {
    const p = this.engine.nextProblem();
    if (!p) {
      this.finishLevel();
      return;
    }
    this.lastProblem = p;
    this.wrongIndex = -1;
    this.trialStartMs = performance.now();
    this.elapsedSec = 0;
  }

  private advance(): void {
    this.pendingNext = false;
    this.wrongIndex = -1;
    if (this.engine.getState().done) this.finishLevel();
    else this.startProblem();
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
    if (this.pendingNext || !this.engine.getProblem()) return;

    for (const opt of this.optionRects) {
      if (x >= opt.x && x <= opt.x + opt.w && y >= opt.y && y <= opt.y + opt.h) {
        this.handleAnswer(opt, x, y);
        return;
      }
    }
  }

  private handleAnswer(opt: OptionRect, x: number, y: number): void {
    const rt = performance.now() - this.trialStartMs;
    this.lastProblem = this.engine.getProblem();
    const ok = this.engine.submit(opt.index, rt);
    this.pendingNext = true;
    audioSynth.playUi(ok ? "win" : "invalid");
    tracker.record("choice", ok, 1);

    if (ok) {
      this.feedback.burst(x, y, "#5BB98C", "算对了！");
      this.revealTimer = REVEAL_OK;
    } else {
      this.wrongIndex = opt.index;
      this.feedback.popText(x, y - 30, "差一点，是这个", "#E07A5F", 18, 90);
      this.revealTimer = REVEAL_WRONG;
    }
  }

  private onTimeout(): void {
    this.lastProblem = this.engine.getProblem();
    if (!this.lastProblem) return;
    this.engine.timeout(this.trialTimeMs);
    this.pendingNext = true;
    this.wrongIndex = -1;
    audioSynth.playUi("invalid");
    tracker.record("choice", false, 0);
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    this.feedback.popText(w / 2, h * 0.34 + 80, "时间到，这题算没答对", "#E07A5F", 18, 110);
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
    const p = this.engine.getProblem() ?? this.lastProblem;
    if (!p) return;

    // 题型横幅
    const banner = p.mode === "change" ? "本关：算【找零】" : "本关：算【一共多少钱】";
    gameCanvas.drawRoundRect(w / 2 - 120, 80, 240, 34, 17, ACCENT);
    gameCanvas.drawText(banner, w / 2, 97, { size: 16, color: "#fff", bold: true });

    // 商品与价签
    const count = p.items.length;
    const cardW = Math.min((w - 64 - (count - 1) * 12) / count, 130);
    const cardH = 108;
    const startX = w / 2 - (count * cardW + (count - 1) * 12) / 2;
    const cardY = h * 0.2;
    for (let i = 0; i < count; i++) {
      const x = startX + i * (cardW + 12);
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      this.roundRect(ctx, x, cardY, cardW, cardH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 2;
      this.roundRect(ctx, x, cardY, cardW, cardH, 14);
      ctx.stroke();

      const it = p.items[i];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(cardW * 0.42)}px system-ui, sans-serif`;
      ctx.fillStyle = "#2B3A42";
      ctx.fillText(it.emoji, x + cardW / 2, cardY + cardH * 0.3);
      ctx.font = `bold ${fontPx(15)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillStyle = "#5a6b78";
      ctx.fillText(it.name, x + cardW / 2, cardY + cardH * 0.56);
      // 价签
      ctx.font = `bold ${fontPx(20)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillStyle = ACCENT;
      ctx.fillText(formatCents(it.priceCents), x + cardW / 2, cardY + cardH * 0.78);
    }

    // 题干（找零题会带上付款金额）
    const cy = cardY + cardH + 34;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontPx(22)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.fillStyle = "#2B3A42";
    ctx.fillText(p.prompt, w / 2, cy);

    // 限时进度条
    if (this.trialTimeMs > 0 && !this.pendingNext && this.engine.getProblem()) {
      const left = Math.max(0, 1 - this.elapsedSec / (this.trialTimeMs / 1000));
      const bw = Math.min(w - 80, 260);
      gameCanvas.drawRoundRect((w - bw) / 2, cy + 26, bw, 8, 4, "rgba(255,255,255,0.2)");
      gameCanvas.drawRoundRect((w - bw) / 2, cy + 26, Math.max(6, bw * left), 8, 4,
        left > 0.35 ? "#4ECDC4" : "#E5484D");
    }

    this.drawOptions(ctx, p);
  }

  private drawOptions(ctx: CanvasRenderingContext2D, p: MoneyProblem): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const n = p.optionsCents.length;
    const cols = 2;
    const rows = Math.ceil(n / cols);
    const bw = (w - 64 - 16) / cols;
    const bh = 62;
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

      ctx.fillStyle = "#FFFFFF";
      this.roundRect(ctx, x, y, bw, bh, 14);
      ctx.fill();

      // 揭示正确答案 / 标出错选
      if (this.pendingNext) {
        if (i === p.answerIndex) {
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

      ctx.fillStyle = "#2B3A42";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${fontPx(24)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillText(formatCents(p.optionsCents[i]), x + bw / 2, y + bh / 2);
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

    gameCanvas.drawText("点一点就能算，不用打字", w / 2, by + bh + 34,
      { size: 17, color: ACCENT, bold: true });
  }

  private drawHud(_ctx: CanvasRenderingContext2D): void {
    const st = this.engine.getState();
    this.hud.draw(
      Math.max(0, st.trials - st.index), // 剩余题数
      st.correct,                        // 已算对
      this.pass,
      "money",
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
