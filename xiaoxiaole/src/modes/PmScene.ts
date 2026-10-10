/**
 * PmScene — 前瞻记忆（Prospective Memory）场景控制器
 *
 * 与 StroopScene / MoneyScene 同构：纯逻辑在 PmEngine，这里只做绘制、输入、计时、反馈、暂停、回调。
 *
 * 玩法：逐题出现物品 ——
 *   看到 🐟 鲜鱼 → 按铃 🔔（记得关火）
 *   其它物品   → 点出它属于哪一类（蔬菜 / 水果 / 荤鲜）
 * 其中 🦐 / 🍗 是「长得像但不能按铃」的诱饵，必须照常分类。
 *
 * 适老要点：
 *   - 规则横幅三态：常驻 → 中途隐藏 → 只看一次（越到后面越要靠自己记住）
 *   - 铃铛按钮大而醒目，且常驻在物品旁
 *   - 误按铃不算「答错整关」，只记为误报并柔和提示
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
import { PmEngine, PM_TARGET, type PmTrial, type PmBannerMode } from "./PmEngine";

const NPC_NAME = "小园";

const ACCENT = "#8B5CF6";
const INTRO_SEC = 3.4;
const REVEAL_OK = 0.6;
const REVEAL_WRONG = 1.2;

interface OptRect { x: number; y: number; w: number; h: number; index: number }

export class PmScene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;

  private engine: PmEngine;
  private bg: ThemePalette;
  private hud = new HUD();
  private pausePanel = new PausePanel();
  private feedback = new Feedback();

  private lastFrame = 0;
  private finished = false;
  private resultAnimTime = 0;

  private readonly trials: number;
  private readonly pass: number;
  private readonly banner: PmBannerMode;

  private scenePhase: "intro" | "play" | "done" = "intro";
  private introTimer = INTRO_SEC;
  private introDialogue = "";

  private trialStartMs = 0;
  private pendingNext = false;
  private revealTimer = 0;
  private lastTrial: PmTrial | null = null;
  private lastOk = false;

  private bellRect: OptRect = { x: 0, y: 0, w: 0, h: 0, index: -1 };
  private catRects: OptRect[] = [];
  private timers: number[] = [];

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;

    this.trials = level.stepLimit ?? 16;
    this.pass = level.passTarget ?? Math.ceil(this.trials * 0.75);
    this.banner = level.pmBanner ?? "always";

    this.engine = new PmEngine(
      level.pmCategories ?? 2,
      this.trials,
      this.banner,
      level.pmTargetEvery ?? 4,
      level.pmLures ?? false,
    );
    this.bg = getTheme(level.theme);
    this.pausePanel = new PausePanel();
    this.introDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;

    tracker.start(level.id, "pm");
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
        this.trialStartMs = performance.now();
      }
    } else if (this.scenePhase === "play") {
      if (this.pendingNext) {
        this.revealTimer -= dt;
        if (this.revealTimer <= 0) this.advance();
      }
    }

    this.render();
  }

  private advance(): void {
    this.pendingNext = false;
    if (this.engine.getState().done) this.finishLevel();
    else this.trialStartMs = performance.now();
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
    if (this.pendingNext) return;

    // 铃铛
    if (this.inRect(x, y, this.bellRect)) {
      this.handleBell(x, y);
      return;
    }
    // 分类按钮
    for (const r of this.catRects) {
      if (this.inRect(x, y, r)) {
        this.handleCategory(r.index, x, y);
        return;
      }
    }
  }

  private handleBell(x: number, y: number): void {
    const rt = performance.now() - this.trialStartMs;
    this.lastTrial = this.engine.getTrial();
    const ok = this.engine.pressBell(rt);
    this.lastOk = ok;
    this.pendingNext = true;
    audioSynth.playUi(ok ? "win" : "invalid");
    tracker.record("pm", ok, 1);

    if (ok) {
      this.feedback.burst(x, y, "#5BB98C", "记得关火！");
    } else {
      this.feedback.popText(x, y - 30, "这次不用按铃", "#E07A5F", 18, 90);
    }
    this.revealTimer = ok ? REVEAL_OK : REVEAL_WRONG;
  }

  private handleCategory(catIndex: number, x: number, y: number): void {
    const rt = performance.now() - this.trialStartMs;
    this.lastTrial = this.engine.getTrial();
    const ok = this.engine.pickCategory(catIndex, rt);
    this.lastOk = ok;
    this.pendingNext = true;
    audioSynth.playUi(ok ? "win" : "invalid");
    tracker.record("pm", ok, 1);

    if (ok) {
      this.feedback.burst(x, y, "#5BB98C", "对啦");
      this.revealTimer = REVEAL_OK;
    } else if (this.lastTrial && this.lastTrial.kind === "target") {
      // 看到目标却去分类 = 忘了按铃，这是本模式最该提醒的情形
      this.feedback.popText(x, y - 30, "看到鲜鱼要先按铃哦", "#E07A5F", 18, 95);
      this.revealTimer = REVEAL_WRONG;
    } else {
      this.feedback.popText(x, y - 30, "再看看是哪一类", "#E07A5F", 18, 90);
      this.revealTimer = REVEAL_WRONG;
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
    const passed = this.engine.isLevelPassed(this.pass);
    const accuracy = st.trials > 0 ? st.correct / st.trials : 0;

    const metrics = tracker.getMetrics(passed, st.trials, st.index);
    adaptive.recordSession(metrics);
    api.reportSession(tracker.toReport(passed, st.index, st.trials));
    // pm 需要额外传入按铃命中 / 目标数 / 误报，供 computePmStars 评星
    progress.recordResult(
      this.level, passed, st.correct, st.index, accuracy, 0,
      st.pmHits, st.pmTargets, st.pmFalseAlarms,
    );

    audioSynth.playUi(passed ? "win" : "fail");

    const result = {
      passed,
      score: st.correct,
      stepsUsed: st.index,
      totalQuestions: st.trials,
      medianRT: this.engine.getMedianRT(),
      pmHits: st.pmHits,
      pmTargets: st.pmTargets,
      pmFalseAlarms: st.pmFalseAlarms,
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
    const st = this.engine.getState();

    // 规则横幅（三态：常驻 / 中途隐藏 / 只看一次）
    if (this.bannerVisible(st.index)) {
      const text = `看到 ${PM_TARGET.emoji} 就按 🔔`;
      gameCanvas.drawRoundRect(w / 2 - 118, 80, 236, 34, 17, ACCENT);
      gameCanvas.drawText(text, w / 2, 97, { size: 16, color: "#fff", bold: true });
    }

    if (t) {
      // 物品卡
      const size = Math.min(w * 0.34, 130);
      const cy = h * 0.3;
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      this.roundRect(ctx, w / 2 - size / 2, cy - size / 2, size, size, 18);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(size * 0.5)}px system-ui, sans-serif`;
      ctx.fillStyle = "#2B3A42";
      ctx.fillText(t.emoji, w / 2, cy - size * 0.08);
      ctx.font = `bold ${fontPx(18)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillStyle = "#5a6b78";
      ctx.fillText(t.name, w / 2, cy + size * 0.32);
    }

    // 提示语
    const tip = this.pendingNext
      ? (this.lastOk ? "很好！" : "下次记住就好")
      : "这是什么类？看到鲜鱼就按铃";
    gameCanvas.drawText(tip, w / 2, h * 0.3 + Math.min(w * 0.34, 130) * 0.62 + 22,
      { size: 17, color: this.pendingNext ? "#FFE66D" : "#c9d3ea" });

    this.drawBellAndCategories(ctx);
  }

  /** 横幅可见性：always 常驻；fade 前 1/3 题可见；once 仅前 2 题可见 */
  private bannerVisible(index: number): boolean {
    if (this.banner === "always") return true;
    if (this.banner === "fade") return index < Math.ceil(this.trials / 3);
    return index < 2; // once
  }

  private drawBellAndCategories(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const cats = this.engine.getCategories();
    const n = cats.length;

    // 铃铛（大而醒目，放在最上一行）
    const bh = 74;
    const topY = h - 40 - bh - 16 - (n > 2 ? 2 : 1) * (58 + 14) + 14;
    const bw = w - 64;
    this.bellRect = { x: 32, y: topY, w: bw, h: bh, index: -1 };
    ctx.fillStyle = this.pendingNext && this.lastOk ? "#5BB98C" : "#F2B24C";
    this.roundRect(ctx, this.bellRect.x, this.bellRect.y, bw, bh, 16);
    ctx.fill();
    ctx.fillStyle = "#2B3A42";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontPx(24)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.fillText("🔔 按铃（看到鲜鱼）", w / 2, this.bellRect.y + bh / 2);

    // 分类按钮（每行 2 个）
    const cw = (w - 64 - 16) / 2;
    const ch = 58;
    const startY = this.bellRect.y + bh + 16;
    this.catRects = [];
    for (let i = 0; i < n; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 32 + col * (cw + 16);
      const y = startY + row * (ch + 14);
      this.catRects.push({ x, y, w: cw, h: ch, index: i });
      ctx.fillStyle = "#FFFFFF";
      this.roundRect(ctx, x, y, cw, ch, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 2;
      this.roundRect(ctx, x, y, cw, ch, 14);
      ctx.stroke();
      ctx.fillStyle = "#2B3A42";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${fontPx(21)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillText(cats[i].name, x + cw / 2, y + ch / 2);
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

    gameCanvas.drawText(`记住：看到 ${PM_TARGET.emoji} 鲜鱼就按 🔔`,
      w / 2, by + bh + 30, { size: 18, color: ACCENT, bold: true });
    gameCanvas.drawText("别的看见了就点它属于哪一类",
      w / 2, by + bh + 56, { size: 15, color: "#8b96b8" });
  }

  private drawHud(_ctx: CanvasRenderingContext2D): void {
    const st = this.engine.getState();
    this.hud.draw(
      Math.max(0, st.trials - st.index), // 剩余题数
      st.correct,                        // 做对题数
      this.pass,
      "pm",
      this.level.items,
      [],
      this.level.name,
      ACCENT,
    );
  }

  // === 工具 ===

  private inRect(x: number, y: number, r: OptRect): boolean {
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
