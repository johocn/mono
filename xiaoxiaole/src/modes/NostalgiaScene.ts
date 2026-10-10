/**
 * NostalgiaScene — 怀旧金曲关卡场景（歌词 / 歌名联想回忆）
 *
 * 训练靶点：语义记忆、情景记忆、联想记忆、语言流畅度（怀旧疗法）
 * 题型：看歌词选歌名（lyricToTitle）/ 看歌名选歌词（titleToLyric）
 * 防瞎猜：4 选 1（25%）+ 反应时区分；大字号、纯文本、无输入，适老友好
 *
 * 复用：tracker（指标/中位数 RT）、progress（记录+自适应）、Feedback、PausePanel、
 * drawResultCard（事实赞美）、generatePraise，与听音等模式保持一致的结算与上报闭环。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { HUD } from "../ui/HUD";
import { Feedback } from "../ui/Feedback";
import { PausePanel } from "../ui/PausePanel";
import { tracker } from "../core/SessionTracker";
import { safety } from "../core/SafetyManager";
import { adaptive } from "../core/AdaptiveEngine";
import { progress } from "../core/ProgressStore";
import { audioSynth } from "../ui/AudioSynth";
import { GAME_CONFIG } from "../core/GameConfig";
import { getTheme } from "../config/themes";
import { drawShuangyangBackground } from "../ui/background";
import { api } from "../api/MockApi";
import { NOSTALGIA_SONGS } from "../config/NostalgiaSongs";
import { randomDialogue, NPC_NAME, generatePraise, type LevelResult, type LevelMetrics, type PraiseResult } from "../config/GameText";
import { drawResultCard } from "../ui/ResultCard";
import { wrapText } from "../ui/ResultCard";
import type { LevelConfig, ItemConfig } from "../config/LevelConfig";
import type { LevelSceneCallbacks } from "../scenes/types";

interface OptionButton {
  x: number; y: number; w: number; h: number;
  text: string; correct: boolean; selected: boolean; showResult: boolean;
}

export class NostalgiaScene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;
  private hud: HUD;
  private feedback: Feedback;
  private pausePanel = new PausePanel();
  private timers: number[] = [];

  private state: "intro" | "playing" | "feedback" | "finished" = "intro";
  private dialogueTimer = 3.5;
  private currentDialogue = "";

  private totalQuestions: number;
  private questionIndex = 0;
  private correctCount = 0;
  private stepsUsed = 0;
  private items: ItemConfig;

  private promptText = "";
  private promptIsTitle = false; // true=显示歌名（选歌词）；false=显示歌词（选歌名）
  private options: OptionButton[] = [];
  private optionCount: number;

  private feedbackTimer = 0;
  private feedbackMsg = "";
  private feedbackColor = "#fff";

  private hintTimer = 0;
  private hintRect = { x: 0, y: 0, w: 0, h: 0 };
  private pauseRect = { x: 0, y: 0, w: 0, h: 0 };

  private finished = false;
  private praise: PraiseResult | null = null;
  private resultAnimTime = 0;
  private time = 0;
  private lastFrame = 0;
  private questionStartTime = 0;

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;
    this.totalQuestions = level.questionCount ?? 8;
    this.optionCount = level.nostalgiaOptionCount ?? 4;
    this.items = { ...level.items };

    tracker.start(level.id, "nostalgia");
    audioSynth.unlock();
    this.hud = new HUD();
    this.feedback = new Feedback();

    this.currentDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;

    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
  }

  private later(fn: () => void, delayMs: number): void {
    const id = window.setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      fn();
    }, delayMs);
    this.timers.push(id);
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private startNextQuestion(): void {
    this.feedbackMsg = "";
    this.questionStartTime = performance.now();

    const variants = this.level.nostalgiaVariants && this.level.nostalgiaVariants.length
      ? this.level.nostalgiaVariants
      : (["lyricToTitle"] as ("lyricToTitle" | "titleToLyric")[]);
    const variant = variants[Math.floor(Math.random() * variants.length)];
    this.promptIsTitle = variant === "titleToLyric";

    const correct = NOSTALGIA_SONGS[Math.floor(Math.random() * NOSTALGIA_SONGS.length)];
    const distractors = this.shuffle(NOSTALGIA_SONGS.filter((s) => s.id !== correct.id));
    const picks = [correct, ...distractors.slice(0, this.optionCount - 1)];
    const shuffled = this.shuffle(picks);

    this.options = shuffled.map((s) => ({
      x: 0, y: 0, w: 0, h: 0,
      text: this.promptIsTitle ? s.lyric : s.title,
      correct: s.id === correct.id,
      selected: false, showResult: false,
    }));

    this.promptText = this.promptIsTitle ? correct.title : correct.lyric;
    this.state = "playing";
    this.layoutOptions();

    // 语音朗读提示（若设备支持），增强怀旧氛围与听觉线索
    audioSynth.playUi("button");
  }

  private layoutOptions(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const n = this.options.length;
    const cols = n <= 4 ? 2 : 3;
    const gap = 16;
    const btnW = Math.min(n <= 4 ? 200 : 150, (w - 48 - (cols - 1) * gap) / cols);
    const rows = Math.ceil(n / cols);
    const btnH = Math.max(70, Math.min(140, (h - 360) / rows));
    const totalW = cols * btnW + (cols - 1) * gap;
    const startX = (w - totalW) / 2;
    const startY = h - 120 - rows * (btnH + gap);
    this.options.forEach((btn, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      btn.x = startX + col * (btnW + gap);
      btn.y = startY + row * (btnH + gap);
      btn.w = btnW;
      btn.h = btnH;
    });
  }

  private onTouch(x: number, y: number): void {
    if (this.pausePanel.isOpen) {
      const act = this.pausePanel.hitTest(x, y);
      if (act === "resume") { this.pausePanel.hide(); audioSynth.playUi("button"); }
      else if (act === "restart") { audioSynth.playUi("button"); this.cb.onRestart(); }
      else if (act === "exit") { audioSynth.playUi("button"); this.cb.onExit(); }
      return;
    }
    if (this.finished) return;

    const hudAction = this.hud.hitTest(x, y);
    if (hudAction) {
      if (hudAction.kind === "pause") { this.pausePanel.show(); audioSynth.playUi("button"); }
      else if (hudAction.kind === "home") { audioSynth.playUi("button"); this.cb.onExit(); }
      else if (hudAction.key === "reveal" || hudAction.key === "peek") this.useHint(hudAction.key);
      else if (hudAction.key === "shield") this.useShield();
      return;
    }

    if (this.dialogueTimer > 0) return;
    if (this.state !== "playing") return;

    if (this.inRect(x, y, this.hintRect)) { this.useHint("peek"); return; }

    for (const btn of this.options) {
      if (this.inRect(x, y, btn)) { this.handleChoice(btn); return; }
    }
  }

  private inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
    return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  }

  /** 提示道具：peek / reveal —— 高亮正确选项一段时间（不消耗步数） */
  private useHint(kind: "peek" | "reveal"): void {
    const key = kind === "reveal" ? "reveal" : "peek";
    if (this.items[key] <= 0) {
      this.feedbackMsg = "提示已用完";
      this.feedbackColor = "#e74c3c";
      this.feedbackTimer = Math.max(this.feedbackTimer, 1.0);
      audioSynth.playUi("invalid");
      return;
    }
    this.items[key]--;
    progress.useItem(key);
    this.hud.flashItem(key);
    this.hintTimer = 1.6;
    audioSynth.playUi("item");
  }

  private useShield(): void {
    if (this.items.shield <= 0) {
      this.feedbackMsg = "护盾已用完";
      this.feedbackColor = "#e74c3c";
      this.feedbackTimer = Math.max(this.feedbackTimer, 1.0);
      audioSynth.playUi("invalid");
      return;
    }
    this.items.shield--;
    progress.useItem("shield");
    this.hud.flashItem("shield");
    this.feedbackMsg = "护盾就绪：下次选错不扣命";
    this.feedbackColor = "#4ECDC4";
    this.feedbackTimer = Math.max(this.feedbackTimer, 1.0);
    audioSynth.playUi("item");
  }

  private handleChoice(btn: OptionButton): void {
    const isCorrect = btn.correct;
    tracker.record("choice", isCorrect, isCorrect ? 1 : 0);

    if (isCorrect) {
      this.correctCount++;
      btn.showResult = true;
      this.feedback.burst(btn.x + btn.w / 2, btn.y + btn.h / 2, "#4ECDC4", "对啦!");
      this.feedbackMsg = "就是这一首！";
      this.feedbackColor = "#4ECDC4";
    } else {
      btn.showResult = true;
      const correctBtn = this.options.find((o) => o.correct);
      if (correctBtn) correctBtn.showResult = true;
      this.feedback.burst(btn.x + btn.w / 2, btn.y + btn.h / 2, "#e74c3c", "再想想");
      this.feedbackMsg = this.promptIsTitle
        ? `正确歌词是：「${correctBtn?.text ?? ""}」`
        : `正确歌名是：《${correctBtn?.text ?? ""}》`;
      this.feedbackColor = "#e74c3c";
      // 护盾抵消一次失误的步数消耗
      const shieldUsed = this.items.shield > 0;
      if (!shieldUsed) this.stepsUsed++;
    }

    this.state = "feedback";
    this.feedbackTimer = 1.6;
  }

  private endLevel(passed: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.state = "finished";
    this.pausePanel.hide();
    gameCanvas.clearHandlers();

    const metrics = tracker.getMetrics(passed, this.level.stepLimit, this.stepsUsed);
    adaptive.recordSession(metrics);
    const report = tracker.toReport(passed, this.stepsUsed, this.level.stepLimit);
    api.reportSession(report);

    progress.recordResult(this.level, passed, this.correctCount, this.stepsUsed, metrics.accuracy);

    const praiseMetrics: LevelMetrics = {
      mode: "nostalgia",
      passed,
      score: this.correctCount,
      passTarget: this.level.passTarget,
      stepsUsed: this.stepsUsed,
      stepLimit: this.level.stepLimit,
      totalQuestions: this.totalQuestions,
      medianRT: tracker.getMedianRT(),
    };
    this.praise = generatePraise(praiseMetrics);
    this.resultAnimTime = 0;
    audioSynth.playUi(passed ? "win" : "fail");

    const result: LevelResult = {
      passed,
      score: this.correctCount,
      stepsUsed: this.stepsUsed,
      medianRT: tracker.getMedianRT(),
    };
    this.later(() => this.cb.onComplete(result), 2600);
  }

  private update(time: number): void {
    const dt = this.lastFrame === 0 ? 0.016 : Math.min((time - this.lastFrame) / 1000, 0.1);
    this.lastFrame = time;
    this.time = time;

    this.pausePanel.update(dt);
    this.hud.update(dt);
    this.feedback.update(dt);
    if (this.hintTimer > 0) this.hintTimer -= dt;

    if (this.finished) {
      this.resultAnimTime += dt;
      this.render();
      return;
    }
    if (this.pausePanel.isOpen) { this.render(); return; }

    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.startNextQuestion();
      this.render();
      return;
    }

    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= dt;
      if (this.feedbackTimer <= 0) {
        this.options.forEach((b) => { b.selected = false; b.showResult = false; });
        this.questionIndex++;
        if (this.questionIndex >= this.totalQuestions || this.stepsUsed >= this.level.stepLimit) {
          this.endLevel(this.correctCount >= this.level.passTarget);
        } else {
          this.startNextQuestion();
        }
      }
    }

    if (safety.isSessionExpired() || safety.isDailyLimitReached()) {
      if (!this.finished) this.endLevel(false);
    }

    this.render();
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    if (this.level.theme === "shuangyang") drawShuangyangBackground();
    else {
      gameCanvas.draw((ctx) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#241a2e");
        grad.addColorStop(1, "#3a2150");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }, 0);
    }

    // HUD
    const qIndex = Math.min(this.questionIndex + 1, this.totalQuestions);
    this.hud.draw(
      this.level.stepLimit - this.stepsUsed,
      this.correctCount,
      this.level.passTarget,
      "nostalgia",
      this.items,
      ["reveal", "peek", "shield"],
      `${this.level.name} · 第 ${qIndex}/${this.totalQuestions} 题`,
      getTheme(this.level.theme).accent,
    );

    // 题目提示（大字号，居中上方）
    if (this.state === "playing" || this.state === "feedback") {
      const kind = this.promptIsTitle ? "下面哪句是这首歌的歌词？" : "这是哪首歌的歌词？";
      gameCanvas.drawText(kind, w / 2, 150, { size: 16, color: "#d9c7ff" }, 5);
      const lines = wrapText(this.promptText, 14, 2);
      lines.forEach((ln, i) => {
        gameCanvas.drawText(ln, w / 2, 196 + i * 34, { size: 26, color: "#FFE66D", bold: true }, 6);
      });
    }

    // 选项
    this.options.forEach((btn) => this.renderOption(btn));

    // 提示按钮（无 HUD 道具时也可用，但消耗 peek）
    const hintY = h - 96;
    this.hintRect = { x: w / 2 - 70, y: hintY, w: 140, h: 44 };
    gameCanvas.drawRoundRect(this.hintRect.x, this.hintRect.y, 140, 44, 12, "rgba(255,255,255,0.10)", 6);
    gameCanvas.drawStrokeRect(this.hintRect.x, this.hintRect.y, 140, 44, 12, "rgba(255,230,109,0.5)", 1.4, 6);
    gameCanvas.drawText("💡 提示", w / 2, hintY + 25, { size: 17, color: "#FFE66D", bold: true }, 6);

    // 反馈消息
    if (this.feedbackTimer > 0 && this.state === "feedback") {
      gameCanvas.drawRoundRect(w / 2 - 220, 130, 440, 46, 10, "rgba(0,0,0,0.8)", 15);
      gameCanvas.drawText(this.feedbackMsg, w / 2, 154, { size: 16, color: this.feedbackColor, bold: true }, 16);
    }

    // NPC 对话
    if (this.dialogueTimer > 0 && !this.finished) {
      const alpha = Math.min(1, this.dialogueTimer / 0.5);
      gameCanvas.drawRoundRect(20, 96, w - 40, 44, 12, `rgba(10,12,26,${0.72 * alpha})`, 35);
      gameCanvas.drawText(this.currentDialogue, w / 2, 118, { size: 15, color: `rgba(255,230,109,${alpha})` }, 36);
    }

    this.pausePanel.draw(`${this.level.name} · 第 ${Math.min(this.questionIndex + 1, this.totalQuestions)} 题`);

    if (this.finished && this.praise) {
      const passed = this.correctCount >= this.level.passTarget;
      const statsLine = `想起 ${this.correctCount}/${this.totalQuestions} 首 · 失误 ${this.stepsUsed}/${this.level.stepLimit}`;
      const fadeIn = Math.min(1, this.resultAnimTime / 0.4);
      drawResultCard(this.praise, passed, statsLine, fadeIn);
    }

    this.feedback.draw();
  }

  private renderOption(btn: OptionButton): void {
    let bg = "rgba(255,255,255,0.07)";
    if (btn.showResult) bg = btn.correct ? "#27ae60" : "#e74c3c";
    else if (this.hintTimer > 0 && btn.correct) bg = "rgba(255,230,109,0.30)";
    else if (btn.selected) bg = "rgba(255,255,255,0.18)";

    gameCanvas.drawRoundRect(btn.x, btn.y, btn.w, btn.h, 14, bg, 6);
    gameCanvas.draw((ctx) => {
      ctx.strokeStyle = btn.showResult ? "#ffffff" : (this.hintTimer > 0 && btn.correct ? "#FFE66D" : "rgba(255,255,255,0.28)");
      ctx.lineWidth = (this.hintTimer > 0 && btn.correct) ? 3 : 1.6;
      ctx.beginPath();
      ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 14);
      ctx.stroke();
    }, 7);

    const lines = wrapText(btn.text, 9, 3);
    const startY = btn.y + btn.h / 2 - (lines.length - 1) * 15;
    lines.forEach((ln, i) => {
      gameCanvas.drawText(ln, btn.x + btn.w / 2, startY + i * 30, { size: 19, color: "#fff", bold: true }, 8);
    });
  }

  destroy(): void {
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
    this.pausePanel.hide();
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
    this.feedback.clear();
  }
}
