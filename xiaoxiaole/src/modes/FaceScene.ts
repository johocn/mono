/**
 * FaceScene — 面孔-名字联想（Face-Name Associative Memory）场景控制器
 *
 * 与 CorsiScene 同构：纯绘制 / 输入 / 反馈 / 暂停 / 回调；逻辑内联（确定性回忆任务）。
 *
 * 流程：NPC 开场白 → 学习（展示面孔+名字）→ 延迟（delayMs，难度脊）→ 回忆（给面孔、点选正确名字）→ 结算。
 * 适老：错误不红屏，柔和提示并揭示正确答案；延迟阶段不显示面孔，锻炼长时巩固。
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
import { drawFace, faceSeedFor } from "../ui/FaceAvatar";
import { NAME_POOL } from "../config/NamePool";
import { reviews } from "../core/ReviewStore";

const NPC_NAME = "小园";

// 人名池已抽到共享模块，供 face / memory 两种玩法复用

interface Pair { seed: number; name: string }
interface OptionRect { x: number; y: number; w: number; h: number; name: string }

type Phase = "intro" | "study" | "delay" | "test" | "done";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export class FaceScene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;

  private bg: ThemePalette;
  private hud = new HUD();
  private pausePanel = new PausePanel();
  private feedback = new Feedback();

  private time = 0;
  private lastFrame = 0;
  private finished = false;
  private resultAnimTime = 0;
  private paused = false;

  private phase: Phase = "intro";
  private introTimer = 3.0;

  // 关卡参数
  private readonly faceCount: number;
  private readonly delayMs: number;
  private readonly options: number;
  private readonly pass: number;

  // 数据
  private pairs: Pair[] = [];
  private testOrder: number[] = [];
  private testIndex = 0;
  private correctCount = 0;

  // 计时
  private studyTimer = 0;
  private delayTimer = 0;
  private revealTimer = 0;

  // 当前题目
  private currentOptions: OptionRect[] = [];
  private answered = false;
  private selectedName = "";
  private correctName = "";

  // 文本
  private introDialogue = "";
  private instruction = "";

  private timers: number[] = [];

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;

    this.faceCount = level.faceCount ?? 3;
    this.delayMs = level.delayMs ?? 3000;
    this.options = level.options ?? 3;
    this.pass = level.passTarget ?? Math.ceil(this.faceCount * 0.7);

    // 选面孔与名字（确定性 seed + 洗牌名字）
    const names = shuffle(NAME_POOL).slice(0, this.faceCount);
    this.pairs = names.map((name, i) => ({ seed: faceSeedFor(level.id, i), name }));
    this.testOrder = shuffle(this.pairs.map((_, i) => i));

    this.bg = getTheme(level.theme);
    this.pausePanel = new PausePanel();
    this.introDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;
    this.instruction = "先记住每张脸和下面的名字";

    tracker.start(level.id, "face");
    audioSynth.unlock();

    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
  }

  // === 主循环 ===

  private update(time: number): void {
    const dt = this.lastFrame === 0 ? 0.016 : Math.min((time - this.lastFrame) / 1000, 0.1);
    this.lastFrame = time;
    this.time = time;

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

    switch (this.phase) {
      case "intro":
        this.introTimer -= dt;
        if (this.introTimer <= 0) this.startStudy();
        break;
      case "study":
        this.studyTimer -= dt;
        if (this.studyTimer <= 0) this.startDelay();
        break;
      case "delay":
        this.delayTimer -= dt;
        if (this.delayTimer <= 0) this.startTest();
        break;
      case "test":
        if (this.answered) {
          this.revealTimer -= dt;
          if (this.revealTimer <= 0) this.nextQuestion();
        }
        break;
      case "done":
        break;
    }

    this.render();
  }

  // === 阶段切换 ===

  private startStudy(): void {
    this.phase = "study";
    this.studyTimer = 2.4 + this.faceCount * 0.7;
    this.instruction = "记住每张脸和下面的名字";
  }

  private startDelay(): void {
    this.phase = "delay";
    this.delayTimer = this.delayMs / 1000;
    this.instruction = "稍等片刻，回忆一下刚才有谁";
  }

  private startTest(): void {
    this.phase = "test";
    this.testIndex = 0;
    this.buildQuestion();
  }

  private buildQuestion(): void {
    const pair = this.pairs[this.testOrder[this.testIndex]];
    this.correctName = pair.name;
    // 干扰项优先取本关其他人名（生态化），不足时从名字池补足
    const levelNames = this.pairs.map((p) => p.name);
    const others = levelNames.filter((n) => n !== pair.name);
    let distractors = sample(others, this.options - 1);
    if (distractors.length < this.options - 1) {
      const spare = sample(
        NAME_POOL.filter((n) => !levelNames.includes(n)),
        this.options - 1 - distractors.length,
      );
      distractors = [...distractors, ...spare];
    }
    this.currentOptions = [];
    this.answered = false;
    this.selectedName = "";
    this.layoutOptions(shuffle([pair.name, ...distractors]));
    this.instruction = "这是谁？点出正确的名字";
  }

  private nextQuestion(): void {
    this.testIndex++;
    if (this.testIndex >= this.faceCount) {
      this.finishLevel();
    } else {
      this.buildQuestion();
    }
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
    if (this.finished) return;

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

    // 学习阶段：「我记住了」提前进入延迟
    if (this.phase === "study" && this.inRect(x, y, this.studyDoneBtn())) {
      audioSynth.playUi("button");
      this.startDelay();
      return;
    }

    // 测试阶段：点选名字
    if (this.phase === "test" && !this.answered) {
      for (const opt of this.currentOptions) {
        if (this.inRect(x, y, opt)) {
          this.handleOptionTap(opt, x, y);
          return;
        }
      }
    }
  }

  private handleOptionTap(opt: OptionRect, x: number, y: number): void {
    this.selectedName = opt.name;
    this.answered = true;
    audioSynth.playUi(opt.name === this.correctName ? "win" : "invalid");

    if (opt.name === this.correctName) {
      this.correctCount++;
      this.feedback.burst(x, y, "#5BB98C", "认对了！");
      tracker.record("recall", true, 1);
      this.revealTimer = 0.9;
    } else {
      this.feedback.popText(x, y - 30, "再想想，正确答案是它", "#E07A5F", 18, 90);
      tracker.record("recall", false, 0);
      this.revealTimer = 1.2;
    }
  }

  // === 结算 ===

  private finishLevel(): void {
    if (this.finished) return;
    this.finished = true;
    this.phase = "done";
    this.pausePanel.hide();
    gameCanvas.clearHandlers();

    const passed = this.correctCount >= this.pass;
    const accuracy = this.faceCount > 0 ? this.correctCount / this.faceCount : 0;

    // 登记本局真正出现过的面孔-名字，供间隔复习使用（同一组合重复不会重置进度）
    reviews.recordItems(this.pairs.map((p) => ({
      id: `face:${p.seed}:${p.name}`,
      mode: "face" as const,
      kind: "face" as const,
      seed: p.seed,
      label: p.name,
    })));


    const metrics = tracker.getMetrics(passed, this.faceCount, this.correctCount);
    adaptive.recordSession(metrics);
    api.reportSession(tracker.toReport(passed, this.correctCount, this.faceCount));
    progress.recordResult(this.level, passed, this.correctCount, this.correctCount, accuracy);

    audioSynth.playUi(passed ? "win" : "fail");

    const result = {
      passed,
      score: this.correctCount,
      stepsUsed: this.correctCount,
      paradigm: "choice" as const,
      totalQuestions: this.faceCount,
      medianRT: 0,
    };
    this.later(() => this.cb.onComplete(result), 1400);
  }

  // === 渲染 ===

  private render(): void {
    gameCanvas.draw((ctx) => this.drawBackground(ctx), 2);
    gameCanvas.draw((ctx) => this.drawPhase(ctx), 10);
    gameCanvas.draw(() => this.feedback.draw(), 20);
    gameCanvas.draw((ctx) => this.drawInstruction(ctx), 25);
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

  private drawPhase(ctx: CanvasRenderingContext2D): void {
    if (this.phase === "intro") this.drawIntro(ctx);
    else if (this.phase === "study") this.drawStudy(ctx);
    else if (this.phase === "delay") this.drawDelay(ctx);
    else if (this.phase === "test") this.drawTest(ctx);
  }

  private drawIntro(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const bw = Math.min(w - 60, 460);
    const bh = 96;
    const bx = (w - bw) / 2;
    const by = 120;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    this.roundRect(ctx, bx, by, bw, bh, 16);
    ctx.fill();
    ctx.fillStyle = "#2B3A42";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontPx(19)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    this.wrapText(ctx, this.introDialogue, w / 2, by + bh / 2, bw - 36, 26);
  }

  private drawStudy(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const cols = this.faceCount <= 3 ? this.faceCount : 3;
    const rows = Math.ceil(this.faceCount / cols);
    const top = 90;
    const bottom = h - 180;
    const areaH = bottom - top;
    const cellH = Math.min((areaH - (rows - 1) * 14) / rows, 150);
    const faceSize = cellH * 0.72;
    const cellW = (w - 48 - (cols - 1) * 16) / cols;

    for (let i = 0; i < this.faceCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = 24 + col * (cellW + 16) + cellW / 2;
      const cy = top + row * (cellH + 14) + cellH / 2;
      const p = this.pairs[i];

      // 卡片底
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      this.roundRect(ctx, cx - cellW / 2, cy - cellH / 2, cellW, cellH, 14);
      ctx.fill();

      drawFace(ctx, cx, cy - cellH * 0.12, faceSize, p.seed);
      ctx.fillStyle = "#2B3A42";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${fontPx(22)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillText(p.name, cx, cy + cellH * 0.32);
    }

    // 「我记住了」按钮
    const b = this.studyDoneBtn();
    ctx.fillStyle = "#E08A3C";
    this.roundRect(ctx, b.x, b.y, b.w, b.h, 24);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${fontPx(20)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("我记住了", b.x + b.w / 2, b.y + b.h / 2);
  }

  private drawDelay(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const cx = w / 2;
    const cy = h / 2 - 20;
    const r = 52;
    const frac = Math.max(0, Math.min(1, this.delayTimer / (this.delayMs / 1000)));

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#E08A3C";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (1 - frac) * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#E08A3C";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontPx(30)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.fillText(Math.ceil(this.delayTimer).toString(), cx, cy);

    ctx.fillStyle = "#2B3A42";
    ctx.font = `500 ${fontPx(18)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.fillText("趁这会想想刚才的人～", cx, cy + r + 30);
  }

  private drawTest(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const pair = this.pairs[this.testOrder[this.testIndex]];

    // 大面孔
    const faceSize = Math.min(w * 0.42, 200);
    const fcx = w / 2;
    const fcy = h * 0.3;
    // 选中/正确描边
    let ring = "#E08A3C";
    if (this.answered) ring = this.selectedName === this.correctName ? "#5BB98C" : "#E07A5F";
    ctx.strokeStyle = ring;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(fcx, fcy, faceSize * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    drawFace(ctx, fcx, fcy, faceSize, pair.seed);

    // 进度点
    const dotR = 6;
    const dotGap = 16;
    const totalW = this.faceCount * dotR * 2 + (this.faceCount - 1) * dotGap;
    let dx = (w - totalW) / 2 + dotR;
    const dy = fcy + faceSize * 0.62 + 26;
    for (let i = 0; i < this.faceCount; i++) {
      ctx.fillStyle = i < this.testIndex ? "#E08A3C" : "rgba(43,58,66,0.25)";
      ctx.beginPath();
      ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
      ctx.fill();
      dx += dotR * 2 + dotGap;
    }

    // 选项按钮
    for (const opt of this.currentOptions) {
      let fill = "rgba(255,255,255,0.95)";
      let border = "#D9CFC0";
      if (this.answered) {
        if (opt.name === this.correctName) { fill = "#D6EFD9"; border = "#5BB98C"; }
        else if (opt.name === this.selectedName) { fill = "#F6D9D2"; border = "#E07A5F"; }
      }
      ctx.fillStyle = fill;
      this.roundRect(ctx, opt.x, opt.y, opt.w, opt.h, 14);
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 2.5;
      this.roundRect(ctx, opt.x, opt.y, opt.w, opt.h, 14);
      ctx.stroke();
      ctx.fillStyle = "#2B3A42";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${fontPx(22)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillText(opt.name, opt.x + opt.w / 2, opt.y + opt.h / 2);
    }
  }

  private drawInstruction(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    if (this.phase === "intro") return;
    ctx.fillStyle = "#2B3A42";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${fontPx(20)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    // 测试阶段提示放在选项上方，其余阶段放在底部安全区
    const y = this.phase === "test" && this.currentOptions.length > 0
      ? this.currentOptions[0].y - 22
      : h - 150;
    ctx.fillText(this.instruction, w / 2, y);
  }

  private drawHud(_ctx: CanvasRenderingContext2D): void {
    const remaining = this.phase === "test"
      ? this.faceCount - this.testIndex
      : this.faceCount;
    this.hud.draw(
      remaining,
      this.correctCount,
      this.pass,
      "face",
      this.level.items,
      [],
      this.level.name,
      "#E08A3C",
    );
  }

  // === 布局 ===

  private layoutOptions(names: string[]): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const cols = this.options <= 2 ? this.options : 2;
    const rows = Math.ceil(this.options / cols);
    const bw = (w - 48 - (cols - 1) * 16) / cols;
    const bh = 58;
    const gap = 16;
    const totalH = rows * bh + (rows - 1) * gap;
    const startY = h - totalH - 28;
    names.forEach((name, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 24 + col * (bw + 16);
      const y = startY + row * (bh + gap);
      this.currentOptions.push({ x, y, w: bw, h: bh, name });
    });
  }

  private studyDoneBtn() {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const bw = 160;
    const bh = 52;
    return { x: (w - bw) / 2, y: h - 90, w: bw, h: bh };
  }

  // === 工具 ===

  private inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

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
