/**
 * CorsiScene — 空间记忆（科西积木 / Corsi Block-Tapping）场景控制器
 *
 * 与 Match3Scene / AudioMatchScene 同构：纯逻辑在 CorsiEngine，这里只做
 * Canvas 绘制、输入、音高播放、HUD / 反馈 / 暂停 / 回调。
 *
 * 流程：NPC 开场白 → 演示（亮灯+音高）→ 点回 → 整轮判定 → 下一轮 → 结算。
 * 难度：网格 3×3 → 4×4 → 5×5，序列长度随关递增（见 LevelGen.GEN_CORSI）。
 * 适老：错误不红屏，给柔和「再看一次」并回放正确序列；音高随格位递增，多感官编码。
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
import { CorsiEngine } from "./CorsiEngine";

/** NPC 名（与 GameText 保持一致） */
const NPC_NAME = "小园";

const LIT_MS = 620;        // 单格点亮时长
const GAP_MS = 260;        // 两格之间间隔
const ROUND_END_MS = 950;  // 整轮结束停留
const IDLE_HINT_MS = 6000; // 点回阶段空闲多久后给提示

/** 五声音阶（C D E G A），按格索引映射音高，越靠后音越高 → 音高编码位置 */
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0];

interface CellRect { x: number; y: number; w: number; h: number }

export class CorsiScene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;

  private engine: CorsiEngine;
  private bg: ThemePalette;
  private hud = new HUD();
  private pausePanel: PausePanel;
  private feedback = new Feedback();

  // 计时与阶段
  private time = 0;
  private lastFrame = 0;
  private finished = false;
  private resultAnimTime = 0;
  private paused = false;

  /** 场景阶段（引擎 phase 之外，控制演示 / 回放 / 空闲） */
  private scenePhase: "intro" | "play" | "recall" | "roundend" | "done" = "intro";
  private playbackPurpose: "demo" | "reveal" | "replay" = "demo";
  private introTimer = 0;
  private demoIndex = 0;
  private demoOn = false;
  private demoTimer = 0;
  private litCell = -1;
  private roundEndTimer = 0;
  private idleTimer = 0;

  // 布局
  private gridSize: number;
  private cellRects: CellRect[] = [];
  private confirmed = new Set<number>();
  private wrongCell = -1;
  private wrongTimer = 0;

  // 文本
  private introDialogue = "";
  private instruction = "";

  // 定时器集中清理
  private timers: number[] = [];

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;

    const gs = level.gridSize ?? 3;
    const seq = level.sequenceLength ?? 3;
    const rounds = level.rounds ?? level.stepLimit ?? 5;
    const pass = level.passTarget ?? Math.ceil(rounds * 0.6);
    this.gridSize = gs;
    this.engine = new CorsiEngine(gs, seq, rounds, pass);

    this.bg = getTheme(level.theme);
    this.pausePanel = new PausePanel();

    this.introDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;
    this.introTimer = 3.2;
    this.instruction = "记住方块依次亮起的顺序";

    tracker.start(level.id, "corsi");
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

    if (this.wrongTimer > 0) this.wrongTimer = Math.max(0, this.wrongTimer - dt);

    if (this.finished) {
      this.resultAnimTime += dt;
      this.render();
      return;
    }
    if (this.pausePanel.isOpen) {
      this.render();
      return;
    }

    switch (this.scenePhase) {
      case "intro":
        this.introTimer -= dt;
        if (this.introTimer <= 0) this.startDemo();
        break;
      case "play":
        this.updatePlayback(dt);
        break;
      case "recall":
        this.idleTimer += dt;
        break;
      case "roundend":
        this.roundEndTimer -= dt * 1000;
        if (this.roundEndTimer <= 0) this.afterRound();
        break;
      case "done":
        break;
    }

    this.render();
  }

  private updatePlayback(dt: number): void {
    this.demoTimer -= dt * 1000;
    if (this.demoTimer > 0) return;

    const seq = this.engine.getState().sequence;
    if (this.demoOn) {
      this.demoOn = false;
      this.litCell = -1;
      this.demoTimer = GAP_MS;
      this.demoIndex++;
      if (this.demoIndex >= seq.length) this.onPlaybackEnd();
    } else {
      if (this.demoIndex >= seq.length) {
        this.onPlaybackEnd();
        return;
      }
      this.demoOn = true;
      this.litCell = seq[this.demoIndex];
      audioSynth.playTone(this.cellFreq(this.litCell), (LIT_MS / 1000) * 0.9);
      this.demoTimer = LIT_MS;
    }
  }

  private onPlaybackEnd(): void {
    if (this.playbackPurpose === "demo") {
      this.engine.beginRecall();
      this.scenePhase = "recall";
      this.idleTimer = 0;
      this.instruction = "按顺序点回来";
    } else if (this.playbackPurpose === "reveal") {
      this.afterRound();
    } else {
      // replay：回到点回
      this.scenePhase = "recall";
      this.idleTimer = 0;
      this.instruction = "按顺序点回来";
    }
  }

  private startDemo(): void {
    this.scenePhase = "play";
    this.playbackPurpose = "demo";
    this.demoIndex = 0;
    this.demoOn = false;
    this.demoTimer = 0;
    this.litCell = -1;
    this.instruction = "看好亮起的顺序…";
  }

  private startReveal(): void {
    this.scenePhase = "play";
    this.playbackPurpose = "reveal";
    this.demoIndex = 0;
    this.demoOn = false;
    this.demoTimer = 0;
    this.litCell = -1;
    this.instruction = "正确答案是这样～";
  }

  private startReplay(): void {
    this.scenePhase = "play";
    this.playbackPurpose = "replay";
    this.demoIndex = 0;
    this.demoOn = false;
    this.demoTimer = 0;
    this.litCell = -1;
    this.instruction = "再看一遍顺序…";
  }

  private afterRound(): void {
    this.confirmed.clear();
    this.wrongCell = -1;
    this.engine.advance();
    const st = this.engine.getState();
    if (st.phase === "done") {
      this.finishLevel();
    } else {
      this.startDemo();
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

    // 「重看序列」按钮（仅点回阶段可用）
    if (this.scenePhase === "recall" && this.inRect(x, y, this.replayBtn())) {
      audioSynth.playUi("button");
      this.startReplay();
      return;
    }

    if (this.scenePhase !== "recall") return;

    const cell = this.hitTestCell(x, y);
    if (cell < 0) return;
    this.handleCellTap(cell, x, y);
  }

  private handleCellTap(cell: number, x: number, y: number): void {
    const res = this.engine.submitTap(cell);
    const st = this.engine.getState();
    if (res === "correct") {
      this.confirmed.add(cell);
      this.idleTimer = 0;
      audioSynth.playTone(this.cellFreq(cell));
      this.feedback.burst(this.cellCenter(cell).x, this.cellCenter(cell).y, "#5BB98C", "");
      tracker.record("recall", true, 1);
      this.instruction = `已点 ${this.engine.getCurrentRecallIndex()} / ${st.sequence.length}`;
    } else if (res === "wrong") {
      this.wrongCell = cell;
      this.wrongTimer = 0.6;
      audioSynth.playUi("invalid");
      this.feedback.popText(x, y - 30, "没关系，再看一次", "#E07A5F", 18, 70);
      tracker.record("recall", false, 0);
      this.startReveal();
    } else {
      // roundComplete
      audioSynth.playUi("win");
      const c = this.cellCenter(cell);
      this.feedback.burst(c.x, c.y, "#5BB98C", "记住了！");
      tracker.record("recall", true, 1);
      this.scenePhase = "roundend";
      this.roundEndTimer = ROUND_END_MS;
    }
  }

  // === 结算 ===

  private finishLevel(): void {
    if (this.finished) return;
    this.finished = true;
    this.scenePhase = "done";
    this.pausePanel.hide();
    gameCanvas.clearHandlers();

    const st = this.engine.getState();
    const passed = this.engine.isLevelPassed();
    const accuracy = st.roundsTotal > 0 ? st.correctRounds / st.roundsTotal : 0;
    const medianRT = tracker.getMedianRT();

    const metrics = tracker.getMetrics(passed, this.level.stepLimit, st.correctRounds);
    adaptive.recordSession(metrics);
    api.reportSession(tracker.toReport(passed, st.correctRounds, this.level.stepLimit));

    // 注：recordResult(level, passed, score, stepsUsed, accuracy)；
    // 此处 stepsUsed 传正确轮数，使内部 accuracy = 正确轮数 / 总轮次（合理）
    progress.recordResult(this.level, passed, st.correctRounds, st.correctRounds, accuracy);

    audioSynth.playUi(passed ? "win" : "fail");

    const result = {
      passed,
      score: st.correctRounds,
      stepsUsed: st.roundsDone,
      maxSeqAchieved: st.maxSeqAchieved,
      medianRT,
    };
    this.later(() => this.cb.onComplete(result), 2200);
  }

  // === 渲染 ===

  private render(): void {
    gameCanvas.draw((ctx) => this.drawBackground(ctx), 2);
    gameCanvas.draw((ctx) => this.drawBoard(ctx), 10);
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

  private drawBoard(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const g = this.gridSize;
    const top = 96;
    const bottom = h - 140;
    const availW = w - 48;
    const availH = bottom - top;
    const boardSize = Math.max(120, Math.min(availW, availH));
    const gap = Math.max(8, boardSize * 0.04);
    const cell = (boardSize - gap * (g + 1)) / g;
    const gridW = g * cell + gap * (g - 1);
    const startX = (w - gridW) / 2;
    const startY = top + (availH - gridW) / 2;

    this.cellRects = [];
    for (let i = 0; i < g * g; i++) {
      const col = i % g;
      const row = Math.floor(i / g);
      const x = startX + col * (cell + gap);
      const y = startY + row * (cell + gap);
      this.cellRects.push({ x, y, w: cell, h: cell });

      const isLit = i === this.litCell;
      const isConfirmed = this.confirmed.has(i);
      const isWrong = i === this.wrongCell && this.wrongTimer > 0;

      if (isLit) {
        const grad = ctx.createLinearGradient(x, y, x, y + cell);
        grad.addColorStop(0, "#3FB6C4");
        grad.addColorStop(1, "#2E7D8A");
        ctx.fillStyle = grad;
        this.roundRect(ctx, x, y, cell, cell, 14);
        ctx.fill();
        // 外发光脉冲
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.time / 120);
        ctx.strokeStyle = "#7FE3EC";
        ctx.lineWidth = 4;
        this.roundRect(ctx, x - 3, y - 3, cell + 6, cell + 6, 16);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = isConfirmed ? "#D6EFF0" : "#FFFFFF";
        ctx.strokeStyle = isConfirmed ? "#2E7D8A" : "#D9CFC0";
        ctx.lineWidth = isConfirmed ? 3 : 2;
        this.roundRect(ctx, x, y, cell, cell, 14);
        ctx.fill();
        ctx.stroke();
      }

      if (isConfirmed) {
        ctx.fillStyle = "#2E7D8A";
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, Math.max(6, cell * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
      if (isWrong) {
        ctx.strokeStyle = "#E07A5F";
        ctx.lineWidth = 4;
        this.roundRect(ctx, x, y, cell, cell, 14);
        ctx.stroke();
      }
    }

    // 序列进度点（点回阶段）
    if (this.scenePhase === "recall") {
      const st = this.engine.getState();
      const total = st.sequence.length;
      const done = this.engine.getCurrentRecallIndex();
      const dotR = 6;
      const dotGap = 16;
      const totalW = total * dotR * 2 + (total - 1) * dotGap;
      let dx = (w - totalW) / 2 + dotR;
      const dy = startY + gridW + gap + 22;
      for (let i = 0; i < total; i++) {
        ctx.fillStyle = i < done ? "#2E7D8A" : "rgba(43,58,66,0.25)";
        ctx.beginPath();
        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        ctx.fill();
        dx += dotR * 2 + dotGap;
      }
    }
  }

  private drawInstruction(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    if (this.scenePhase === "intro") {
      // NPC 开场白气泡
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
      return;
    }

    // 底部提示文案
    ctx.fillStyle = "#2B3A42";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${fontPx(20)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.fillText(this.instruction, w / 2, h - 110);

    // 「重看序列」按钮（点回阶段）
    if (this.scenePhase === "recall") {
      const b = this.replayBtn();
      const active = this.idleTimer > IDLE_HINT_MS;
      ctx.fillStyle = active ? "#F2A65A" : "rgba(46,125,138,0.85)";
      this.roundRect(ctx, b.x, b.y, b.w, b.h, 24);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${fontPx(20)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillText("重看序列", b.x + b.w / 2, b.y + b.h / 2);
    }
  }

  private drawHud(_ctx: CanvasRenderingContext2D): void {
    const st = this.engine.getState();
    this.hud.draw(
      st.roundsTotal - st.roundsDone,  // 剩余轮次
      st.correctRounds,                // 正确轮数
      this.level.passTarget ?? 0,      // 需达标轮数
      "corsi",
      this.level.items,
      [],                              // 无道具
      this.level.name,
      "#2E7D8A",
    );
  }

  // === 工具 ===

  private replayBtn() {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const bw = 150;
    const bh = 52;
    return { x: (w - bw) / 2, y: h - 64, w: bw, h: bh };
  }

  private cellFreq(index: number): number {
    const i = index % (PENTA.length * 2);
    const octave = Math.floor(i / PENTA.length);
    return PENTA[i % PENTA.length] * Math.pow(2, octave);
  }

  private cellCenter(i: number) {
    const r = this.cellRects[i];
    if (!r) return { x: gameCanvas.getW() / 2, y: gameCanvas.getH() / 2 };
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  private hitTestCell(x: number, y: number): number {
    for (let i = 0; i < this.cellRects.length; i++) {
      const r = this.cellRects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

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
