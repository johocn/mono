/**
 * TetrisScene — 俄罗斯方块游戏场景（沉浸页）
 * 适老化：大字号状态、大圆角按钮、拖拽移动、幽灵落点提示、道具栏一键使用、暂停/护盾保护。
 */

import { gameCanvas, fontPx } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { safety } from "../core/SafetyManager";
import { skinManager } from "../core/SkinManager";
import { progress } from "../core/ProgressStore";
import { TetrisEngine } from "../modes/TetrisEngine";
import type { TetrisConfig } from "../config/LevelConfig";
import type { LevelSceneCallbacks } from "./types";
import { computeStars } from "../config/GameText";
import type { ItemConfig } from "../config/LevelConfig";

interface Rect { x: number; y: number; w: number; h: number }

const ITEM_META: { key: keyof ItemConfig; emoji: string; label: string }[] = [
  { key: "slow", emoji: "🐢", label: "慢放" },
  { key: "undo", emoji: "↩️", label: "撤回" },
  { key: "bomb", emoji: "💣", label: "炸弹" },
  { key: "swap", emoji: "🔄", label: "变形" },
  { key: "hint", emoji: "💡", label: "提示" },
  { key: "shield", emoji: "🛡️", label: "护盾" },
];

const CONTROL_META = ["◀", "⟲", "▶", "⬇", "⤓"];

export class TetrisScene {
  private engine: TetrisEngine;
  private cbs: LevelSceneCallbacks;
  private level: TetrisConfig;

  private finished = false;
  private result: { score: number; lines: number; level: number; zen: boolean } | null = null;

  private pauseRect: Rect = { x: 0, y: 0, w: 52, h: 52 };
  private homeRect: Rect = { x: 0, y: 0, w: 52, h: 52 };
  private ctrlRects: Rect[] = [];
  private itemRects: Rect[] = [];
  private resumeRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private exitRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private overResultRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private overHomeRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private drag = { active: false, startX: 0, originX: 0 };

  constructor(level: TetrisConfig, cbs: LevelSceneCallbacks) {
    this.level = level;
    this.cbs = cbs;
    this.engine = new TetrisEngine(level);
    this.engine.onShieldConsume = () => progress.useItem("shield");
    this.engine.onGameOver = (r) => this.onGameOver(r);
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setDragHandler((_x0, _y0, x1) => this.onDrag(x1));
  }

  private onGameOver(r: { score: number; lines: number; level: number; zen: boolean }): void {
    this.finished = true;
    this.result = r;
    audioSynth.play("gameover", 0.5);
  }

  private layout(w: number, h: number) {
    const { cols, rows } = this.engine;
    const topBar = 92;
    const bottomArea = 188;
    const boardAreaH = h - topBar - bottomArea;
    const cell = Math.max(14, Math.floor(Math.min((w - 24) / cols, boardAreaH / rows)));
    const boardW = cell * cols;
    const boardH = cell * rows;
    const boardX = Math.floor((w - boardW) / 2);
    const boardY = topBar + Math.floor((boardAreaH - boardH) / 2);

    const pad = 10;
    const ctrlY = h - bottomArea + 8;
    const ctrlH = 78;
    const ctrlGap = 8;
    const ctrlW = (w - 2 * pad - 4 * ctrlGap) / 5;
    this.ctrlRects = CONTROL_META.map((_, i) => ({
      x: pad + i * (ctrlW + ctrlGap),
      y: ctrlY,
      w: ctrlW,
      h: ctrlH,
    }));

    const itemsY = ctrlY + ctrlH + 8;
    const itemGap = 8;
    const itemW = (w - 2 * pad - 5 * itemGap) / 6;
    this.itemRects = ITEM_META.map((_, i) => ({
      x: pad + i * (itemW + itemGap),
      y: itemsY,
      w: itemW,
      h: ctrlH,
    }));

    this.pauseRect = { x: w - 12 - 52, y: 16, w: 52, h: 52 };
    this.homeRect = { x: w - 12 - 52 - 8 - 52, y: 16, w: 52, h: 52 };

    return { topBar, boardX, boardY, boardW, boardH, cell };
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    this.drag.active = false;
    if (this.finished && this.result) {
      if (this.hit(this.overResultRect, x, y)) {
        audioSynth.playUi("button");
        this.cbs.onComplete({
          score: this.result.score,
          lines: this.result.lines,
          level: this.result.level,
          passed: true,
          best: progress.getBestScore(),
          isNewBest: this.result.score >= progress.getBestScore(),
          zen: this.result.zen,
        });
      } else if (this.hit(this.overHomeRect, x, y)) {
        audioSynth.playUi("button");
        this.cbs.onExit();
      }
      return;
    }
    if (this.engine.paused) {
      if (this.hit(this.resumeRect, x, y)) { audioSynth.playUi("button"); this.engine.togglePause(); }
      else if (this.hit(this.exitRect, x, y)) { audioSynth.playUi("button"); this.cbs.onExit(); }
      return;
    }
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const L = this.layout(w, h);

    if (this.hit(this.pauseRect, x, y)) { audioSynth.playUi("button"); this.engine.togglePause(); return; }
    if (this.hit(this.homeRect, x, y)) { audioSynth.playUi("button"); this.cbs.onExit(); return; }

    for (let i = 0; i < this.ctrlRects.length; i++) {
      if (this.hit(this.ctrlRects[i], x, y)) { this.onControl(i); return; }
    }
    for (let i = 0; i < this.itemRects.length; i++) {
      if (this.hit(this.itemRects[i], x, y)) { this.onItem(i); return; }
    }
    // 棋盘内 → 启动拖拽移动
    if (x >= L.boardX && x <= L.boardX + L.boardW && y >= L.boardY && y <= L.boardY + L.boardH) {
      this.drag.active = true;
      this.drag.startX = x;
      this.drag.originX = this.engine.current?.x ?? 0;
    }
  }

  private onDrag(x1: number): void {
    if (!this.drag.active || this.engine.paused || this.finished || !this.engine.current) return;
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const L = this.layout(w, h);
    const delta = Math.round((x1 - this.drag.startX) / L.cell);
    const target = this.drag.originX + delta;
    let guard = 0;
    while (this.engine.current && this.engine.current.x < target && guard++ < 12) {
      if (!this.engine.moveRight()) break;
    }
    while (this.engine.current && this.engine.current.x > target && guard++ < 12) {
      if (!this.engine.moveLeft()) break;
    }
  }

  private onControl(i: number): void {
    audioSynth.playUi("button");
    switch (i) {
      case 0: this.engine.moveLeft(); break;
      case 1: this.engine.rotate(); break;
      case 2: this.engine.moveRight(); break;
      case 3: this.engine.softDrop(); break;
      case 4: this.engine.hardDrop(); break;
    }
  }

  private onItem(i: number): void {
    const meta = ITEM_META[i];
    const have = progress.getItem(meta.key);
    if (have <= 0) { audioSynth.playUi("invalid"); return; }
    const now = performance.now();
    switch (meta.key) {
      case "slow": progress.useItem("slow"); this.engine.useSlow(now); break;
      case "undo": progress.useItem("undo"); this.engine.useUndo(); break;
      case "bomb": progress.useItem("bomb"); this.engine.useBomb(); break;
      case "swap": progress.useItem("swap"); this.engine.useSwap(); break;
      case "hint": progress.useItem("hint"); this.engine.useHint(now); break;
      case "shield":
        audioSynth.playUi("invalid");
        return; // 护盾为被动，自动生效
    }
    audioSynth.playUi("item");
  }

  update(dt: number, now: number): void {
    this.engine.update(dt, now);
  }

  render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const pal = skinManager.getPalette();
    const L = this.layout(w, h);

    // 背景
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, w, h);
    }, -10);

    // 顶部状态
    gameCanvas.drawText(`分数 ${this.engine.score}`, 16, 30, { size: 24, color: pal.text, bold: true, align: "left" }, 0);
    gameCanvas.drawText(`等级 ${this.engine.level} · 消行 ${this.engine.lines}`, 16, 62,
      { size: 16, color: pal.subText, align: "left" }, 0);
    if (this.engine.zen) {
      gameCanvas.drawText("禅模式", 16, 84, { size: 14, color: pal.accent, align: "left" }, 0);
    }
    // 下一个预览
    this.renderNext(L);

    // 顶栏按钮
    this.drawTopButtons(pal);

    // 棋盘
    this.renderBoard(L, pal, this.now());

    // 控制按钮
    this.renderControls(pal);
    // 道具栏
    this.renderItems(pal);

    if (this.engine.paused) this.renderPause(pal, w, h);
    if (this.finished && this.result) this.renderGameOver(pal, w, h);
  }

  private now(): number { return performance.now(); }

  private renderNext(L: { boardX: number; boardY: number; cell: number; boardW: number; boardH: number }): void {
    const pal = skinManager.getPalette();
    const next = this.engine.next;
    const cx = gameCanvas.getW() / 2 - 2 * 18;
    const cy = 14;
    gameCanvas.drawText("下一个", cx + 36, cy + 8, { size: 13, color: pal.subText, align: "center" }, 0);
    if (next) {
      const mini = 16;
      const m = next.matrix;
      for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[y].length; x++) {
          if (m[y][x]) {
            gameCanvas.drawRoundRect(cx + x * mini, cy + 18 + y * mini, mini - 2, mini - 2, 3,
              pal.blockColors[next.color - 1], 1);
          }
        }
      }
    }
  }

  private drawTopButtons(pal: ReturnType<typeof skinManager.getPalette>): void {
    const drawBtn = (r: Rect, emoji: string) => {
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 12);
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }, 1);
      gameCanvas.drawText(emoji, r.x + r.w / 2, r.y + r.h / 2, { size: 24 }, 2);
    };
    drawBtn(this.pauseRect, this.engine.paused ? "▶" : "⏸");
    drawBtn(this.homeRect, "🏠");
  }

  private renderBoard(L: { boardX: number; boardY: number; cell: number; boardW: number; boardH: number }, pal: ReturnType<typeof skinManager.getPalette>, now: number): void {
    const { boardX, boardY, cell, boardW, boardH } = L;
    // 棋盘底
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = pal.boardBg;
      ctx.beginPath();
      ctx.roundRect(boardX - 6, boardY - 6, boardW + 12, boardH + 12, 12);
      ctx.fill();
    }, 1);

    // 网格 + 已落子
    for (let y = 0; y < this.engine.rows; y++) {
      for (let x = 0; x < this.engine.cols; x++) {
        const px = boardX + x * cell;
        const py = boardY + y * cell;
        const c = this.engine.board[y][x];
        if (c === 0) {
          gameCanvas.draw((ctx) => {
            ctx.strokeStyle = pal.grid;
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
          }, 2);
        } else {
          this.drawCell(px, py, cell, pal.blockColors[c - 1], TetrisEngine.symbol(c), pal);
        }
      }
    }

    // 幽灵 + 当前方块
    const cur = this.engine.current;
    if (cur) {
      const ghostY = this.engine.ghostY();
      const hinting = this.engine.isHinting(now);
      for (let y = 0; y < cur.matrix.length; y++) {
        for (let x = 0; x < cur.matrix[y].length; x++) {
          if (!cur.matrix[y][x]) continue;
          const gy = ghostY + y;
          if (gy >= 0) {
            const gpx = boardX + (cur.x + x) * cell;
            const gpy = boardY + gy * cell;
            gameCanvas.draw((ctx) => {
              ctx.strokeStyle = hinting ? pal.accent : "rgba(255,255,255,0.35)";
              ctx.lineWidth = hinting ? 3 : 1.5;
              ctx.setLineDash([4, 4]);
              ctx.strokeRect(gpx + 2, gpy + 2, cell - 4, cell - 4);
              ctx.setLineDash([]);
            }, 2);
          }
        }
      }
      for (let y = 0; y < cur.matrix.length; y++) {
        for (let x = 0; x < cur.matrix[y].length; x++) {
          if (!cur.matrix[y][x]) continue;
          const by = cur.y + y;
          if (by >= 0) {
            const px = boardX + (cur.x + x) * cell;
            const py = boardY + by * cell;
            this.drawCell(px, py, cell, pal.blockColors[cur.color - 1], TetrisEngine.symbol(cur.color), pal);
          }
        }
      }
    }
  }

  private drawCell(px: number, py: number, cell: number, color: string, symbol: string, pal: ReturnType<typeof skinManager.getPalette>): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(px + 1, py + 1, cell - 2, cell - 2, 5);
      ctx.fill();
      // 高光
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.roundRect(px + 3, py + 3, cell - 6, (cell - 6) * 0.4, 4);
      ctx.fill();
    }, 2);
    // 色弱三重编码：形状符号
    gameCanvas.drawText(symbol, px + cell / 2, py + cell / 2, { size: cell * 0.5, color: "rgba(0,0,0,0.55)", bold: true }, 3);
  }

  private renderControls(pal: ReturnType<typeof skinManager.getPalette>): void {
    for (let i = 0; i < this.ctrlRects.length; i++) {
      const r = this.ctrlRects[i];
      safety.assertTapSize(r.h, `tetris-ctrl-${i}`);
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 14);
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }, 2);
      gameCanvas.drawText(CONTROL_META[i], r.x + r.w / 2, r.y + r.h / 2, { size: 30, color: pal.text, bold: true }, 3);
    }
  }

  private renderItems(pal: ReturnType<typeof skinManager.getPalette>): void {
    for (let i = 0; i < this.itemRects.length; i++) {
      const r = this.itemRects[i];
      const meta = ITEM_META[i];
      const have = progress.getItem(meta.key);
      safety.assertTapSize(r.h, `tetris-item-${i}`);
      const enabled = have > 0 && (meta.key !== "shield");
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = enabled ? "rgba(78,205,196,0.18)" : "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 12);
        ctx.fill();
        ctx.strokeStyle = enabled ? pal.accent : "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }, 2);
      gameCanvas.drawText(meta.emoji, r.x + r.w / 2, r.y + 30, { size: 26, color: enabled ? pal.text : pal.subText }, 3);
      gameCanvas.drawText(meta.label, r.x + r.w / 2, r.y + 56, { size: 13, color: enabled ? pal.text : pal.subText }, 3);
      gameCanvas.drawText(`×${have}`, r.x + r.w / 2, r.y + 74, { size: 13, color: pal.accent, bold: true }, 3);
    }
  }

  private renderPause(pal: ReturnType<typeof skinManager.getPalette>, w: number, h: number): void {
    gameCanvas.draw((ctx) => { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, w, h); }, 50);
    const pw = 300, ph = 220, px = (w - pw) / 2, py = (h - ph) / 2;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = pal.panel; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 18); ctx.fill();
    }, 51);
    gameCanvas.drawText("已暂停", w / 2, py + 50, { size: 28, color: pal.text, bold: true }, 52);
    const bw = pw - 48, bh = 52, by = py + ph - bh - 18;
    this.resumeRect = { x: px + 24, y: by, w: bw, h: bh };
    gameCanvas.drawRoundRect(this.resumeRect.x, this.resumeRect.y, bw, bh, 12, pal.accent, 52);
    gameCanvas.drawText("继续游戏", this.resumeRect.x + bw / 2, this.resumeRect.y + bh / 2, { size: 19, color: pal.bg, bold: true }, 53);
    this.exitRect = { x: px + 24, y: py + 100, w: bw, h: bh };
    gameCanvas.drawRoundRect(this.exitRect.x, this.exitRect.y, bw, bh, 12, "rgba(255,255,255,0.10)", 52);
    gameCanvas.drawStrokeRect(this.exitRect.x, this.exitRect.y, bw, bh, 12, "rgba(255,255,255,0.25)", 1.5, 53);
    gameCanvas.drawText("退出本局", this.exitRect.x + bw / 2, this.exitRect.y + bh / 2, { size: 19, color: pal.text, bold: true }, 53);
  }

  private renderGameOver(pal: ReturnType<typeof skinManager.getPalette>, w: number, h: number): void {
    gameCanvas.draw((ctx) => { ctx.fillStyle = "rgba(0,0,0,0.62)"; ctx.fillRect(0, 0, w, h); }, 50);
    const pw = 320, ph = 260, px = (w - pw) / 2, py = (h - ph) / 2;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = pal.panel; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 18); ctx.fill();
    }, 51);
    gameCanvas.drawText("本局结束", w / 2, py + 46, { size: 28, color: pal.text, bold: true }, 52);
    const r = this.result!;
    gameCanvas.drawText(`得分 ${r.score}`, w / 2, py + 96, { size: 22, color: pal.accent, bold: true }, 52);
    gameCanvas.drawText(`消行 ${r.lines} · 等级 ${r.level}`, w / 2, py + 130, { size: 16, color: pal.subText }, 52);
    const bw = (pw - 60) / 2, bh = 52;
    this.overResultRect = { x: px + 20, y: py + ph - bh - 20, w: bw, h: bh };
    this.overHomeRect = { x: px + 40 + bw, y: py + ph - bh - 20, w: bw, h: bh };
    gameCanvas.drawRoundRect(this.overResultRect.x, this.overResultRect.y, bw, bh, 12, pal.accent, 52);
    gameCanvas.drawText("看结果", this.overResultRect.x + bw / 2, this.overResultRect.y + bh / 2, { size: 18, color: pal.bg, bold: true }, 53);
    gameCanvas.drawRoundRect(this.overHomeRect.x, this.overHomeRect.y, bw, bh, 12, "rgba(255,255,255,0.10)", 52);
    gameCanvas.drawStrokeRect(this.overHomeRect.x, this.overHomeRect.y, bw, bh, 12, "rgba(255,255,255,0.25)", 1.5, 53);
    gameCanvas.drawText("回主页", this.overHomeRect.x + bw / 2, this.overHomeRect.y + bh / 2, { size: 18, color: pal.text, bold: true }, 53);
  }

  destroy(): void { gameCanvas.clearHandlers(); }
}
