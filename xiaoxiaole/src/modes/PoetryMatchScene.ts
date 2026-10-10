/**
 * PoetryMatchScene — 诗词连连看关卡场景控制器（3-1 / 3-2）
 *
 * 规则（spec v1.1 第 5 节）：
 * - 棋盘 5x5，古典书房场景
 * - 每对诗词的「上句」与「下句」分置不同格子
 * - 下句显示：full=全字（首字高亮）；radical=仅偏旁提示（如"月+…"）
 * - 依次点击上句、下句完成配对连线
 * - 连线路径限制拐角数（3-1 最多 2 拐，3-2 最多 3 拐），路径可穿过已消除格
 * - **与 spec 的一处有意偏离**：spec 第 5 节写「误配不扣步」。
 *   但那样的话，步数只会被「成功配对」消耗（共 3~4 次），而关卡却配了
 *   16~18 步 —— 结果是关卡在数学上不可能失败，「步数」「失败结算」
 *   「再接再厉」「重玩本关」全部变成不可达的死代码。
 *   因此这里改为：**一次配对尝试（成功 / 误配 / 路线不通）各消耗 1 步**，
 *   步数上限相应收紧为「对数 + 容错次数」。误配仍会闪烁正确下句 2 秒引导，
 *   容错次数给到 8~9 次，保持温和。
 * - 道具：偷看（揭示完整下句 3 秒）、撤销（回退最近一次配对，退还 1 步）
 * - 胜负：全部配对完成 = 胜；步数耗尽 = 负
 */

import { gameCanvas } from "../ui/GameCanvas";
import { Board, type TileVisual } from "../ui/Board";
import { HUD } from "../ui/HUD";
import { Feedback } from "../ui/Feedback";
import { PausePanel } from "../ui/PausePanel";
import { audioSynth } from "../ui/AudioSynth";
import { tracker } from "../core/SessionTracker";
import { safety } from "../core/SafetyManager";
import { adaptive } from "../core/AdaptiveEngine";
import { progress } from "../core/ProgressStore";
import { reviews } from "../core/ReviewStore";
import type { LevelConfig, PoetryPair, ItemConfig } from "../config/LevelConfig";
import { getTheme } from "../config/themes";
import { drawShuangyangBackground } from "../ui/background";
import { skinManager } from "../core/SkinManager";
import { getOfficialSkin } from "../config/SkinPresets";
import type { SkinConfig } from "../core/Skin";
import { api } from "../api/MockApi";
import { randomDialogue, NPC_NAME, generatePraise, type LevelResult, type LevelMetrics, type PraiseResult } from "../config/GameText";
import { drawResultCard } from "../ui/ResultCard";
import type { LevelSceneCallbacks } from "../scenes/types";

interface PoetryTile extends TileVisual {
  pairId: number;
  isUpper: boolean;
  fullText: string;
  displayText: string;
  revealed: boolean; // 偷看道具临时揭示
}

interface PathPoint { col: number; row: number }

interface Connection {
  points: PathPoint[];
  color: string;
  /** 终点坐标，供撤销时定位 */
  pairId: number;
}

const POETRY_ITEMS: (keyof ItemConfig)[] = ["peek", "undo", "reveal", "step", "shield"];

const DIRS = [
  { dc: 0, dr: -1, d: 0 }, // up
  { dc: 0, dr: 1, d: 1 },  // down
  { dc: -1, dr: 0, d: 2 }, // left
  { dc: 1, dr: 0, d: 3 },  // right
];

export class PoetryMatchScene {
  private level: LevelConfig;
  private prevSkin: SkinConfig | null = null;
  private cb: LevelSceneCallbacks;

  private board: Board;
  private hud: HUD;
  private feedback: Feedback;
  private pausePanel = new PausePanel();
  private timers: number[] = [];

  private items: ItemConfig;

  private tiles: PoetryTile[][] = [];
  private selected: { col: number; row: number; isUpper: boolean } | null = null;
  private stepsUsed: number = 0;
  private bonusSteps: number = 0;
  private shieldPending: boolean = false;
  private pairsCompleted: number = 0;
  private connections: Connection[] = [];
  private undoStack: { pairId: number; a: PathPoint; b: PathPoint }[] = [];

  private finished: boolean = false;
  private praise: PraiseResult | null = null;
  private resultAnimTime: number = 0;
  private dialogueTimer: number = 0;
  private currentDialogue: string = "";
  private lastInputTime: number = 0;
  private fatiguePaused: boolean = false;
  private fatiguePauseEnd: number = 0;
  private fatigueArmed: boolean = true;
  private fatigueActionMark: number = 0;

  private peekTimer: number = 0;
  private peekPairId: number = -1;
  private peekTarget: PoetryTile | null = null;
  private revealTimer: number = 0;

  private flashTimer: number = 0;
  private flashPairId: number = -1;

  private time: number = 0;
  private lastFrame: number = 0;

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    // 双阳主题关强制套用「双阳鹿乡」皮肤（绿金外框），离场时还原玩家原皮肤（与三消关一致）
    if (this.level.theme === "shuangyang") {
      this.prevSkin = skinManager.getSkin();
      const sy = getOfficialSkin("official_shuangyang");
      if (sy) skinManager.apply(sy);
    }
    this.cb = cb;
    this.items = { ...level.items };

    tracker.start(level.id, "poetry");
    audioSynth.unlock();

    this.board = new Board(level.boardCols, level.boardRows);
    this.hud = new HUD();
    this.feedback = new Feedback();

    this.initTiles();
    this.currentDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;
    this.dialogueTimer = 3.5;
    this.lastInputTime = performance.now();

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

  // === 棋盘初始化 ===

  private initTiles(): void {
    const pairs = this.level.poetryPairs ?? [];
    const cols = this.level.boardCols;
    const rows = this.level.boardRows;
    const totalCells = cols * rows;

    const tileData: PoetryTile[] = [];
    for (let i = 0; i < pairs.length; i++) {
      tileData.push(this.createTile(i, true, pairs[i]));
      tileData.push(this.createTile(i, false, pairs[i]));
    }

    while (tileData.length < totalCells) {
      tileData.push({
        type: "empty", label: "", color: "transparent",
        hidden: false, frozen: false, matched: true,
        highlighted: false, selected: false,
        pairId: -1, isUpper: false, fullText: "", displayText: "",
        revealed: false,
      });
    }

    this.shuffle(tileData);
    this.tiles = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const row: PoetryTile[] = [];
      for (let c = 0; c < cols; c++) row.push(tileData[idx++]);
      this.tiles.push(row);
    }
    this.syncBoard();
  }

  private createTile(pairId: number, isUpper: boolean, pair: PoetryPair): PoetryTile {
    const text = isUpper ? pair.upper : pair.lower;
    let displayText = text;
    if (!isUpper && this.level.clueLevel === "radical") {
      // 偏旁提示：显示首字 + 省略号
      displayText = text.charAt(0) + "…";
    }
    return {
      type: isUpper ? "upper" : "lower",
      label: displayText,
      color: isUpper ? "#9b59b6" : "#3498db",
      hidden: false, frozen: false, matched: false,
      highlighted: false, selected: false,
      pairId, isUpper, fullText: text, displayText,
      revealed: false,
      offsetX: 0, offsetY: 0, scale: 1, alpha: 1, rotation: 0, glow: 0,
    };
  }

  private shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  private syncBoard(): void {
    this.board.setTiles(this.tiles);
  }

  private get totalPairs(): number {
    return this.level.poetryPairs?.length ?? 0;
  }

  // === 交互 ===

  private onTouch(x: number, y: number): void {
    // 1. 暂停面板
    if (this.pausePanel.isOpen) {
      const act = this.pausePanel.hitTest(x, y);
      if (act === "resume") { this.pausePanel.hide(); audioSynth.playUi("button"); }
      else if (act === "restart") { audioSynth.playUi("button"); this.cb.onRestart(); }
      else if (act === "exit") { audioSynth.playUi("button"); this.cb.onExit(); }
      return;
    }
    if (this.finished || this.fatiguePaused) return;

    // 2. HUD
    const hudAction = this.hud.hitTest(x, y);
    if (hudAction) {
      if (hudAction.kind === "pause") {
        this.pausePanel.show();
        audioSynth.playUi("button");
      } else if (hudAction.kind === "home") {
        audioSynth.playUi("button");
        this.cb.onExit();
      } else {
        this.useItem(hudAction.key);
      }
      return;
    }

    if (this.dialogueTimer > 0) return;

    this.lastInputTime = performance.now();
    const pos = this.board.screenToGrid(x, y);
    if (!pos) return;

    const tile = this.tiles[pos.row]?.[pos.col];
    if (!tile || tile.matched) return;

    if (!this.selected) {
      this.selected = { col: pos.col, row: pos.row, isUpper: tile.isUpper };
      tile.selected = true;
      this.syncBoard();
      audioSynth.playUi("button");
      return;
    }

    const first = this.selected;
    const firstTile = this.tiles[first.row][first.col];
    firstTile.selected = false;

    if (first.col === pos.col && first.row === pos.row) {
      this.selected = null;
      this.syncBoard();
      return;
    }

    const isPair = firstTile.pairId === tile.pairId && firstTile.isUpper !== tile.isUpper;
    if (isPair) {
      const path = this.findPath(first.col, first.row, pos.col, pos.row);
      if (path) {
        this.completePair(firstTile, tile, path);
        return;
      }
      // 配对正确但路径不通：计 1 步并给出引导
      this.consumeStep();
      this.feedback.popText(x, y - 20, "路线被挡住了", "#e67e22", 20);
      audioSynth.playUi("invalid");
      tracker.record("path_fail", false, 0);
      this.selected = null;
      this.syncBoard();
      return;
    }

    // 误配：计 1 步，并闪烁正确下句引导
    this.consumeStep();
    tile.selected = false;
    this.flashPairId = firstTile.pairId;
    this.flashTimer = 2;
    this.feedback.popText(x, y - 20, "再想想", "#e74c3c", 20);
    audioSynth.playUi("invalid");
    tracker.record("mismatch", false, 0);
    this.selected = null;
    this.syncBoard();
  }

  /** 消耗 1 步；步数耗尽则本关失败（护盾激活时抵消本次消耗） */
  private consumeStep(): void {
    if (this.shieldPending) {
      this.shieldPending = false;
      this.hud.pulseSteps();
      return;
    }
    this.stepsUsed++;
    this.hud.pulseSteps();
    if (this.stepsUsed >= this.level.stepLimit + this.bonusSteps && this.pairsCompleted < this.totalPairs) {
      this.endLevel(false);
    }
  }

  private completePair(upper: PoetryTile, lower: PoetryTile, path: PathPoint[]): void {
    this.stepsUsed++;
    this.hud.pulseScore();
    this.hud.pulseSteps();
    upper.matched = true;
    lower.matched = true;
    this.pairsCompleted++;

    // 找到下句在棋盘上的坐标以定位特效
    const target = this.locateTile(lower);
    if (target) {
      const sxy = this.board.gridToScreen(target.col, target.row);
      this.feedback.burst(sxy.x, sxy.y, lower.color, "配对!");
    }

    this.connections.push({ points: path, color: lower.color, pairId: lower.pairId });
    this.undoStack.push({
      pairId: lower.pairId,
      a: { col: this.locateTile(upper)?.col ?? 0, row: this.locateTile(upper)?.row ?? 0 },
      b: target ?? { col: 0, row: 0 },
    });

    tracker.record("match", true, 1);
    audioSynth.playUi("match");
    this.selected = null;
    this.syncBoard();

    if (this.pairsCompleted >= this.totalPairs) {
      this.endLevel(true);
    }
  }

  private locateTile(tile: PoetryTile): PathPoint | null {
    for (let r = 0; r < this.tiles.length; r++) {
      for (let c = 0; c < this.tiles[r].length; c++) {
        if (this.tiles[r][c] === tile) return { col: c, row: r };
      }
    }
    return null;
  }

  // === 道具 ===

  private useItem(key: keyof ItemConfig): void {
    if (this.finished || this.fatiguePaused) return;
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const cx = w / 2;
    const cy = h / 2;

    if (this.items[key] <= 0) {
      this.feedback.popText(cx, cy, "道具已用完", "#e74c3c", 20);
      audioSynth.playUi("invalid");
      return;
    }

    switch (key) {
      case "peek": {
        const target = this.resolvePeekTarget();
        if (!target) {
          this.feedback.popText(cx, cy, "没有可偷看的下句了", "#e74c3c", 20);
          audioSynth.playUi("invalid");
          return;
        }
        this.peekTarget = target;
        this.peekPairId = target.pairId;
        this.peekTimer = 3;
        target.label = target.fullText;
        target.revealed = true;
        this.syncBoard();
        this.feedback.popText(cx, cy, "偷看 3 秒", "#4ECDC4", 20);
        break;
      }
      case "undo": {
        const last = this.undoStack.pop();
        if (!last) {
          this.feedback.popText(cx, cy, "没有可撤销的配对", "#e74c3c", 20);
          audioSynth.playUi("invalid");
          return;
        }
        const a = this.tiles[last.a.row]?.[last.a.col];
        const b = this.tiles[last.b.row]?.[last.b.col];
        if (a) a.matched = false;
        if (b) b.matched = false;
        this.pairsCompleted = Math.max(0, this.pairsCompleted - 1);
        this.stepsUsed = Math.max(0, this.stepsUsed - 1);
        this.connections = this.connections.filter((c) => c.pairId !== last.pairId);
        this.selected = null;
        this.syncBoard();
        this.hud.resetScore();
        this.feedback.popText(cx, cy, "已撤销", "#4ECDC4", 20);
        break;
      }
      case "reveal": {
        let n = 0;
        for (const row of this.tiles) {
          for (const t of row) {
            if (!t.matched && !t.isUpper && t.pairId >= 0) {
              t.revealed = true;
              t.label = t.fullText;
              n++;
            }
          }
        }
        if (n === 0) {
          this.feedback.popText(cx, cy, "没有可揭示的下句了", "#e74c3c", 20);
          audioSynth.playUi("invalid");
          return;
        }
        this.revealTimer = 4;
        this.syncBoard();
        this.feedback.popText(cx, cy, "全部揭示 4 秒", "#4ECDC4", 20);
        break;
      }
      case "step": {
        this.bonusSteps += 3;
        this.feedback.popText(cx, cy, "补步 +3", "#4ECDC4", 20);
        break;
      }
      case "shield": {
        this.shieldPending = true;
        this.feedback.popText(cx, cy, "护盾就绪：下次失误不扣步", "#4ECDC4", 20);
        break;
      }
      default:
        this.feedback.popText(cx, cy, "该道具在此模式不可用", "#e74c3c", 18);
        return;
    }

    this.items[key]--;
    progress.useItem(key);
    this.hud.flashItem(key);
    audioSynth.playUi("item");
  }

  /** 偷看目标：优先当前选中的上句对应的下句 */
  private resolvePeekTarget(): PoetryTile | null {
    if (this.selected) {
      const sel = this.tiles[this.selected.row]?.[this.selected.col];
      if (sel && !sel.matched) {
        for (const row of this.tiles) {
          for (const t of row) {
            if (t.pairId === sel.pairId && !t.isUpper && !t.matched) return t;
          }
        }
      }
    }
    for (const row of this.tiles) {
      for (const t of row) {
        if (!t.matched && !t.isUpper && t.pairId >= 0) return t;
      }
    }
    return null;
  }

  // === 寻路（返回真实拐角路径） ===

  private findPath(c1: number, r1: number, c2: number, r2: number): PathPoint[] | null {
    const maxCorners = this.level.maxCorners ?? 2;
    const cols = this.level.boardCols;
    const rows = this.level.boardRows;

    const isPassable = (c: number, r: number): boolean => {
      if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
      if (c === c1 && r === r1) return true;
      if (c === c2 && r === r2) return true;
      return this.tiles[r][c].matched;
    };

    const startKey = `${c1},${r1},-1`;
    const prev = new Map<string, string>();
    const visited = new Set<string>([startKey]);
    const queue: { c: number; r: number; dir: number; corners: number; key: string }[] = [
      { c: c1, r: r1, dir: -1, corners: 0, key: startKey },
    ];

    while (queue.length > 0) {
      const cur = queue.shift()!;

      if (cur.dir !== -1 && cur.c === c2 && cur.r === r2) {
        // 回溯重建路径
        const pts: PathPoint[] = [];
        let k: string | undefined = cur.key;
        while (k) {
          const [c, r] = k.split(",").map(Number);
          pts.push({ col: c, row: r });
          k = prev.get(k);
        }
        pts.reverse();
        return pts;
      }

      for (const { dc, dr, d } of DIRS) {
        const nc = cur.c + dc;
        const nr = cur.r + dr;
        if (!isPassable(nc, nr)) continue;
        const newCorners = cur.dir === -1 || cur.dir === d ? cur.corners : cur.corners + 1;
        if (newCorners > maxCorners) continue;
        const nk = `${nc},${nr},${d}`;
        if (visited.has(nk)) continue;
        visited.add(nk);
        prev.set(nk, cur.key);
        queue.push({ c: nc, r: nr, dir: d, corners: newCorners, key: nk });
      }
    }
    return null;
  }

  // === 胜负 ===

  private endLevel(passed: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.pausePanel.hide();
    gameCanvas.clearHandlers();

    const metrics = tracker.getMetrics(passed, this.level.stepLimit, this.stepsUsed);
    adaptive.recordSession(metrics);
    const report = tracker.toReport(passed, this.stepsUsed, this.level.stepLimit);
    api.reportSession(report);

    progress.recordResult(this.level, passed, this.pairsCompleted, this.stepsUsed, metrics.accuracy);

    // 登记本关出现过的对联，供间隔复习使用（题干=上句，答案=下句）
    const couplets = this.level.poetryPairs ?? [];
    reviews.recordItems(couplets.map((c) => ({
      id: `couplet:${c.upper}:${c.lower}`,
      mode: "poetry" as const,
      kind: "couplet" as const,
      prompt: c.upper,
      label: c.lower,
    })));

    const pairsTotal = this.totalPairs;
    const praiseMetrics: LevelMetrics = {
      mode: "poetry",
      passed,
      score: this.pairsCompleted,
      passTarget: this.level.passTarget,
      stepsUsed: this.stepsUsed,
      stepLimit: this.level.stepLimit,
      pairsTotal,
      medianRT: tracker.getMedianRT(),
    };
    this.praise = generatePraise(praiseMetrics);
    this.resultAnimTime = 0;
    audioSynth.playUi(passed ? "win" : "fail");

    const result: LevelResult = {
      passed,
      score: this.pairsCompleted,
      stepsUsed: this.stepsUsed,
      pairsTotal,
      medianRT: tracker.getMedianRT(),
    };

    this.later(() => this.cb.onComplete(result), 2600);
  }

  // === 主循环 ===

  private update(time: number): void {
    this.time = time;
    const dt = this.lastFrame === 0 ? 0.016 : Math.min((time - this.lastFrame) / 1000, 0.1);
    this.lastFrame = time;

    this.pausePanel.update(dt);
    this.hud.update(dt);
    this.feedback.update(dt);

    if (this.finished) {
      this.resultAnimTime += dt;
      this.board.setTime(time);
      this.render();
      return;
    }

    if (this.pausePanel.isOpen) {
      this.board.setTime(time);
      this.render();
      return;
    }

    if (this.dialogueTimer > 0) this.dialogueTimer -= dt;

    // 闪烁计时
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashPairId = -1;
    }

    // 偷看计时
    if (this.peekTimer > 0) {
      this.peekTimer -= dt;
      if (this.peekTimer <= 0) {
        if (this.peekTarget) {
          this.peekTarget.label = this.peekTarget.displayText;
          this.peekTarget.revealed = false;
          this.peekTarget = null;
        }
        this.peekPairId = -1;
        this.syncBoard();
      }
    }

    // 揭示计时（全部揭示后统一收起，保留仍在进行中的偷看）
    if (this.revealTimer > 0) {
      this.revealTimer -= dt;
      if (this.revealTimer <= 0) {
        for (const row of this.tiles) {
          for (const t of row) {
            if (t === this.peekTarget) continue;
            t.revealed = false;
            t.label = t.displayText;
          }
        }
        this.syncBoard();
      }
    }

    // 空闲提示
    const idleSec = (performance.now() - this.lastInputTime) / 1000;
    if (idleSec > this.level.idleHintDelay && !this.selected) {
      this.highlightHintPair();
    }

    // 疲劳检测
    if (!this.fatigueArmed && tracker.getTotalActions() > this.fatigueActionMark) {
      this.fatigueArmed = true;
    }
    if (this.fatigueArmed) {
      const rts = tracker.getReactionTimes();
      if (safety.checkFatigue(rts, tracker.getMedianRT())) {
        this.fatiguePaused = true;
        this.fatigueArmed = false;
        this.fatigueActionMark = tracker.getTotalActions();
        this.fatiguePauseEnd = performance.now() + 30000;
        audioSynth.playUi("fail");
      }
    }
    if (this.fatiguePaused && performance.now() >= this.fatiguePauseEnd) {
      this.fatiguePaused = false;
      this.lastInputTime = performance.now();
    }

    // 会话上限
    if (safety.isSessionExpired() || safety.isDailyLimitReached()) {
      this.endLevel(false);
      return;
    }

    this.board.setTime(time);
    this.render();
  }

  private highlightHintPair(): void {
    let changed = false;
    for (const row of this.tiles) {
      for (const t of row) {
        if (t.highlighted) { t.highlighted = false; changed = true; }
      }
    }
    for (const row of this.tiles) {
      for (const t of row) {
        if (!t.matched && t.isUpper && t.pairId >= 0) {
          t.highlighted = true;
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
    if (changed) this.syncBoard();
  }

  // === 渲染 ===

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    // 背景：双阳主题关统一绿金（与三消关同一皮肤），其余关古典书房
    if (this.level.theme === "shuangyang") {
      drawShuangyangBackground();
    } else {
      gameCanvas.draw((ctx) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#2c1810");
        grad.addColorStop(0.6, "#241410");
        grad.addColorStop(1, "#170d08");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        const glow = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, w * 0.8);
        glow.addColorStop(0, "rgba(255,190,110,0.09)");
        glow.addColorStop(1, "rgba(255,190,110,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }, 0);
    }

    // 误配引导：闪烁正确下句（≤2Hz）
    if (this.flashPairId >= 0) {
      for (let r = 0; r < this.tiles.length; r++) {
        for (let c = 0; c < this.tiles[r].length; c++) {
          const t = this.tiles[r][c];
          if (t.pairId === this.flashPairId && !t.isUpper && !t.matched) {
            const sc = this.board.gridToScreen(c, r);
            const s = this.board.getTileSize();
            gameCanvas.drawSafeFlash(sc.x - s / 2, sc.y - s / 2, s, s, "#e74c3c", this.time, 12);
          }
        }
      }
    }

    // 偷看中的高亮
    if (this.peekTimer > 0 && this.peekPairId >= 0) {
      for (let r = 0; r < this.tiles.length; r++) {
        for (let c = 0; c < this.tiles[r].length; c++) {
          const t = this.tiles[r][c];
          if (t.pairId === this.peekPairId && !t.isUpper && !t.matched) {
            const sc = this.board.gridToScreen(c, r);
            const s = this.board.getTileSize();
            gameCanvas.drawStrokeRect(sc.x - s / 2 - 2, sc.y - s / 2 - 2, s + 4, s + 4, 10,
              "#4ECDC4", 3, 13);
          }
        }
      }
    }

    this.board.draw();

    // 双阳主题：诗词卡加暖金描边，呼应三消绿金皮肤（专属卡面点缀）
    if (this.level.theme === "shuangyang") {
      const ts = this.board.getTileSize();
      for (let r = 0; r < this.tiles.length; r++) {
        for (let c = 0; c < this.tiles[r].length; c++) {
          const t = this.tiles[r][c];
          if (t.matched || t.type === "empty") continue;
          const sc = this.board.gridToScreen(c, r);
          gameCanvas.drawStrokeRect(
            sc.x - ts / 2, sc.y - ts / 2, ts, ts, ts * 0.18,
            "rgba(224,168,46,0.9)", 2, 11,
          );
        }
      }
    }

    // 连线（真实拐角路径）
    for (const line of this.connections) {
      gameCanvas.draw((ctx) => {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 4;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        line.points.forEach((p, i) => {
          const sxy = this.board.gridToScreen(p.col, p.row);
          if (i === 0) ctx.moveTo(sxy.x, sxy.y);
          else ctx.lineTo(sxy.x, sxy.y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;

        // 端点圆点
        const lastP = line.points[line.points.length - 1];
        const sp = this.board.gridToScreen(lastP.col, lastP.row);
        ctx.fillStyle = line.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }, 15);
    }

    // HUD
    this.hud.draw(
      Math.max(0, this.level.stepLimit - this.stepsUsed + this.bonusSteps),
      this.pairsCompleted,
      this.totalPairs,
      "poetry",
      this.items,
      POETRY_ITEMS,
      `${this.level.name} · 诗词连连看`,
      getTheme(this.level.theme).accent,
    );

    // NPC 对话：贴顶显示，避免压住底部道具栏
    if (this.dialogueTimer > 0 && !this.finished) {
      const alpha = Math.min(1, this.dialogueTimer / 0.5);
      gameCanvas.drawRoundRect(20, 96, w - 40, 44, 12, `rgba(10,12,26,${0.72 * alpha})`, 35);
      gameCanvas.drawText(this.currentDialogue, w / 2, 118,
        { size: 15, color: `rgba(255,230,109,${alpha})` }, 36);
    }

    // 疲劳暂停
    if (this.fatiguePaused) {
      gameCanvas.drawRoundRect(0, 0, w, h, 0, "rgba(0,0,0,0.72)", 60);
      gameCanvas.drawText("休息一下", w / 2, h / 2 - 30,
        { size: 42, color: "#4ECDC4", bold: true }, 61);
      gameCanvas.drawText("揉揉眼睛，喝口水，30 秒后继续",
        w / 2, h / 2 + 20, { size: 18, color: "#ffffff" }, 61);
    }

    this.pausePanel.draw(`${this.level.name} · 已配对 ${this.pairsCompleted}/${this.totalPairs}`);

    // 结算卡片
    if (this.finished && this.praise) {
      const passed = this.pairsCompleted >= this.totalPairs;
      const statsLine = `配对 ${this.pairsCompleted}/${this.totalPairs} · 步数 ${this.stepsUsed}/${this.level.stepLimit}`;
      const fadeIn = Math.min(1, this.resultAnimTime / 0.4);
      drawResultCard(this.praise, passed, statsLine, fadeIn);
    }

    this.feedback.draw();
  }

  destroy(): void {
    if (this.prevSkin) {
      skinManager.apply(this.prevSkin);
      this.prevSkin = null;
    }
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
    this.pausePanel.hide();
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
    this.board.destroy();
    this.feedback.clear();
  }
}
