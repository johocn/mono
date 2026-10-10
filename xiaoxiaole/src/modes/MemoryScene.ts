/**
 * MemoryScene — 记忆翻翻乐（Concentration）场景控制器
 *
 * 与 CorsiScene / FaceScene 同构：绘制 / 输入 / 反馈 / 暂停 / 回调；规则内联。
 *
 * 玩法：全部牌背面朝上 → 每次翻两张，是「联想对」则消除，否则合上重来 → 配齐全部对过关。
 * 卡牌内容为**混编联想对**（b + c 组合）：
 *   · 图词对：emoji 图案卡 ↔ 中文词卡（🌸 ↔ 桃花）→ 语义联想
 *   · 面孔-名字对：程序化头像卡 ↔ 称呼名字卡（头像 ↔ 老张）→ 复用 FaceAvatar
 *   每对由一张「图像卡」与一张「标签卡」组成，二者不同画面但语义成对。
 * 难度脊：revealMs（翻错后停留可见时长）逐级缩短，越靠后越依赖短时视觉记忆。
 * 适老：步数上限给得很宽松；配错不惩罚，给柔和反馈；配对的牌永久留面方便回忆位置。
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
import { NAME_POOL, ICON_WORD_PAIRS } from "../config/NamePool";
import { reviews } from "../core/ReviewStore";

const NPC_NAME = "小园";

type CardKind = "iconword" | "face";

interface Card {
  pairId: number;                 // 属于第几对
  side: "image" | "label";        // 图像卡 / 标签卡
  kind: CardKind;
  icon?: string;                  // iconword 的图像卡用
  label: string;                  // 标签卡文字 / 也用于 face 的名字
  seed?: number;                  // face 的图像卡用
  matched: boolean;
  flipped: boolean;
}

interface CellRect { x: number; y: number; w: number; h: number }

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class MemoryScene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;

  private bg: ThemePalette;
  private hud = new HUD();
  private pausePanel: PausePanel;
  private feedback = new Feedback();

  private time = 0;
  private lastFrame = 0;
  private finished = false;
  private resultAnimTime = 0;

  // 关卡参数
  private readonly pairs: number;
  private readonly revealMs: number;
  private readonly moveLimit: number;

  // 牌面数据
  private deck: Card[] = [];
  /** 每一对的定义（图像 + 标签），用于结算时登记复习条目 */
  private pairDefs: { kind: CardKind; icon?: string; seed?: number; label: string }[] = [];
  private cellRects: CellRect[] = [];
  private flippedIdx: number[] = [];   // 当前翻开待判定的牌（最多 2 张）
  private revealTimer = 0;             // 配错后的「看牌」倒计时（秒）

  private movesUsed = 0;
  private matchedPairs = 0;

  private scenePhase: "intro" | "play" | "done" = "intro";
  private introTimer = 3.0;
  private introDialogue = "";
  private instruction = "";

  private timers: number[] = [];

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;

    this.pairs = level.cardPairs ?? 3;
    this.revealMs = level.revealMs ?? 1200;
    this.moveLimit = level.stepLimit ?? 15;

    this.buildDeck();

    this.bg = getTheme(level.theme);
    this.pausePanel = new PausePanel();
    this.introDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;
    this.instruction = "点开两张牌，找出配成一对的画面和名字";

    tracker.start(level.id, "memory");
    audioSynth.unlock();

    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
  }

  /** 生成混编牌组：每对一张「图像卡」+ 一张「标签卡」，两种联想对各占一半 */
  private buildDeck(): void {
    const iconCount = Math.ceil(this.pairs / 2);
    const faceCount = this.pairs - iconCount;
    const icons = shuffle(ICON_WORD_PAIRS).slice(0, iconCount);
    const names = shuffle(NAME_POOL).slice(0, faceCount);

    const cards: Card[] = [];
    this.pairDefs = [];
    let pairId = 0;
    // 交替排布，保证即使在 3 对的小局面里也能同时练到语义联想与面孔
    for (let i = 0; i < iconCount; i++) {
      const it = icons[i];
      cards.push({ pairId, side: "image", kind: "iconword", icon: it.icon, label: it.label, matched: false, flipped: false });
      cards.push({ pairId, side: "label", kind: "iconword", label: it.label, matched: false, flipped: false });
      this.pairDefs.push({ kind: "iconword", icon: it.icon, label: it.label });
      pairId++;
    }
    for (let i = 0; i < faceCount; i++) {
      const nm = names[i];
      cards.push({
        pairId, side: "image", kind: "face", label: nm,
        // 复用 FaceAvatar 的确定性 seed：关卡 id + 序号 → 稳定且不重复的长相
        seed: faceSeedFor(this.level.id, i),
        matched: false, flipped: false,
      });
      cards.push({ pairId, side: "label", kind: "face", label: nm, matched: false, flipped: false });
      this.pairDefs.push({ kind: "face", seed: faceSeedFor(this.level.id, i), label: nm });
      pairId++;
    }

    this.deck = shuffle(cards);
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

    if (this.scenePhase === "intro") {
      this.introTimer -= dt;
      if (this.introTimer <= 0) {
        this.scenePhase = "play";
        this.instruction = "点开两张，找出一对";
      }
    } else if (this.scenePhase === "play") {
      // 配错后的「看牌时间」到点 → 合上
      if (this.revealTimer > 0) {
        this.revealTimer -= dt;
        if (this.revealTimer <= 0) {
          for (const i of this.flippedIdx) this.deck[i].flipped = false;
          this.flippedIdx = [];
          this.instruction = "再试试别的组合";
        }
      }
    }

    this.render();
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

    // 正在展示配错结果时不接受输入（让玩家安心「看牌」）
    if (this.revealTimer > 0) return;

    const idx = this.hitTestCard(x, y);
    if (idx < 0) return;
    const card = this.deck[idx];
    if (card.matched || card.flipped) return;
    if (this.flippedIdx.length >= 2) return;

    card.flipped = true;
    this.flippedIdx.push(idx);
    audioSynth.playUi("button");

    if (this.flippedIdx.length === 2) this.resolveTurn();
  }

  /** 两张都已翻开时判定这对 */
  private resolveTurn(): void {
    this.movesUsed++;
    const [a, b] = this.flippedIdx;
    const ca = this.deck[a];
    const cb = this.deck[b];
    const isPair = ca.pairId === cb.pairId && ca.side !== cb.side;
    const c0 = this.cellRects[a];
    const c1 = this.cellRects[b];

    if (isPair) {
      ca.matched = true;
      cb.matched = true;
      this.matchedPairs++;
      this.flippedIdx = [];
      const mx = (c0.x + c0.w + c1.x) / 2;
      const my = (c0.y + c0.h + c1.y) / 2;
      audioSynth.playUi("win");
      this.feedback.burst(mx, my, "#5BB98C", "配上了！");
      tracker.record("recall", true, 1);
      this.instruction = this.matchedPairs >= this.pairs
        ? "全部配齐！"
        : `已配 ${this.matchedPairs}/${this.pairs} 对`;
      if (this.matchedPairs >= this.pairs) {
        this.later(() => this.finishLevel(true), 700);
      }
    } else {
      audioSynth.playUi("invalid");
      tracker.record("recall", false, 0);
      this.instruction = "不是一对，记住它们的位置～";
      this.revealTimer = this.revealMs / 1000;
      // 用完最后一步仍未配齐 → 失败
      if (this.movesUsed >= this.moveLimit) {
        this.later(() => this.finishLevel(false), this.revealMs + 400);
      }
    }
  }

  // === 结算 ===

  private finishLevel(passed: boolean): void {
    if (this.finished) return;
    this.finished = true;

    // 登记本局出现过的联想条目，供间隔复习使用
    reviews.recordItems(this.pairDefs.map((d) => ({
      id: `${d.kind === "face" ? "face" : "word"}:${d.kind === "face" ? d.seed : d.icon}:${d.label}`,
      mode: "memory" as const,
      kind: d.kind,
      seed: d.seed,
      icon: d.icon,
      label: d.label,
    })));

    this.scenePhase = "done";
    this.pausePanel.hide();
    gameCanvas.clearHandlers();

    const accuracy = this.pairs > 0 ? this.matchedPairs / this.pairs : 0;
    const metrics = tracker.getMetrics(passed, this.moveLimit, this.movesUsed);
    adaptive.recordSession(metrics);
    api.reportSession(tracker.toReport(passed, this.movesUsed, this.moveLimit));
    progress.recordResult(this.level, passed, this.matchedPairs, this.movesUsed, accuracy);

    audioSynth.playUi(passed ? "win" : "fail");

    const result = {
      passed,
      score: this.matchedPairs,
      stepsUsed: this.movesUsed,
      pairsTotal: this.pairs,
      medianRT: 0,
    };
    this.later(() => this.cb.onComplete(result), 1400);
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
    if (this.scenePhase === "intro") {
      this.drawIntro(ctx);
      return;
    }

    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const total = this.deck.length;
    const cols = total <= 6 ? 3 : 4;
    const rows = Math.ceil(total / cols);

    const top = 92;
    const bottom = h - 150;
    const areaH = bottom - top;
    const gap = 14;
    const cellW = (w - 48 - gap * (cols - 1)) / cols;
    const cellH = Math.min((areaH - gap * (rows - 1)) / rows, cellW * 1.2);
    const gridW = cols * cellW + gap * (cols - 1);
    const startX = (w - gridW) / 2;
    const gridH = rows * cellH + gap * (rows - 1);
    const startY = top + Math.max(0, (areaH - gridH) / 2);

    this.cellRects = [];
    for (let i = 0; i < total; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cellW + gap);
      const y = startY + row * (cellH + gap);
      this.cellRects.push({ x, y, w: cellW, h: cellH });
      this.drawCard(ctx, this.deck[i], x, y, cellW, cellH);
    }
  }

  private drawCard(ctx: CanvasRenderingContext2D, c: Card, x: number, y: number, w: number, h: number): void {
    const shown = c.matched || c.flipped;

    // 牌底
    if (shown) {
      ctx.fillStyle = c.matched ? "rgba(255,255,255,0.82)" : "#FFFFFF";
    } else {
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, "#4ECDC4");
      grad.addColorStop(1, "#2E8B8B");
      ctx.fillStyle = grad;
    }
    this.roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = c.matched ? "#5BB98C" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = c.matched ? 3 : 2;
    this.roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();

    if (!shown) {
      // 牌背：一个柔和的叶子标记
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(Math.min(w, h) * 0.22)}px system-ui, sans-serif`;
      ctx.fillText("🌿", x + w / 2, y + h / 2);
      return;
    }

    // 正面内容
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (c.side === "image") {
      if (c.kind === "iconword") {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${Math.round(Math.min(w, h) * 0.42)}px system-ui, sans-serif`;
        ctx.fillStyle = "#2B3A42";
        ctx.fillText(c.icon ?? "🌸", cx, cy);
      } else {
        drawFace(ctx, cx, cy, Math.min(w, h) * 0.78, c.seed ?? 1);
      }
    } else {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.round(Math.min(w, h) * 0.3)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.fillStyle = "#2B3A42";
      ctx.fillText(c.label, cx, cy);
    }
  }

  private drawIntro(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const bw = Math.min(w - 60, 460);
    const bh = 96;
    const bx = (w - bw) / 2;
    const by = 140;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    this.roundRect(ctx, bx, by, bw, bh, 16);
    ctx.fill();
    ctx.fillStyle = "#2B3A42";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontPx(19)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    this.wrapText(ctx, this.introDialogue, w / 2, by + bh / 2, bw - 36, 26);
  }

  private drawInstruction(ctx: CanvasRenderingContext2D): void {
    if (this.scenePhase === "intro") return;
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    ctx.fillStyle = "#2B3A42";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${fontPx(19)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.fillText(this.instruction, w / 2, h - 120);
  }

  private drawHud(_ctx: CanvasRenderingContext2D): void {
    this.hud.draw(
      Math.max(0, this.moveLimit - this.movesUsed), // 剩余步数
      this.matchedPairs,                            // 已配对数
      this.pairs,                                   // 目标对数
      "memory",
      this.level.items,
      [],
      this.level.name,
      "#4ECDC4",
    );
  }

  // === 工具 ===

  private hitTestCard(x: number, y: number): number {
    for (let i = 0; i < this.cellRects.length; i++) {
      const r = this.cellRects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
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
