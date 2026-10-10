/**
 * Match3Scene — 三消关卡场景控制器（1-1 / 1-2）
 *
 * 职责分工：
 * - Match3Engine：纯逻辑（棋盘 / 消除 / 下落 / 交换 / 冰冻 / 提示 / 步数 / 胜负 + 动画时间线）
 * - Board：棋盘渲染（等轴 3D 棋子，支持位移/缩放/旋转/透明通道）
 * - HUD：步数 / 分数 / 进度 + 底部可点击道具栏
 * - Feedback：粒子爆裂 + 冲击环 + 飘字
 * - PausePanel：暂停 / 重开 / 返回菜单
 * - 本类：动画状态机 + 指针交互 + 道具 + 疲劳熔断 + 会话上限 + 数据上报
 *
 * 动画时序（对齐动效设计稿）：
 *   选中 120ms（放大 1.15× + 上浮 8px）
 *   滑动 160ms（inOutCubic 互换）
 *   消除 300ms（先放大到 1.3× 再缩至 0 + 旋转 15° + 粒子/冲击环）
 *   下落 0.18s + 距离×0.045（outBounce 落定，新棋子顶部淡入）
 *   无效交换 200ms（outCubic 回弹复位）
 */

import { gameCanvas } from "../ui/GameCanvas";
import { Board, TileVisual } from "../ui/Board";
import { HUD } from "../ui/HUD";
import { Feedback } from "../ui/Feedback";
import { PausePanel } from "../ui/PausePanel";
import { audioSynth } from "../ui/AudioSynth";
import { tracker } from "../core/SessionTracker";
import { safety } from "../core/SafetyManager";
import { adaptive } from "../core/AdaptiveEngine";
import { progress } from "../core/ProgressStore";
import { getHammerInv, addHammerInv, spendHammerInv } from "../core/BoosterStore";
import { skinManager } from "../core/SkinManager";
import { getOfficialSkin } from "../config/SkinPresets";
import { Easing } from "../core/Tween";
import { GAME_CONFIG } from "../core/GameConfig";
import type { LevelConfig, ItemConfig } from "../config/LevelConfig";
import { getTheme } from "../config/themes";
import { api } from "../api/MockApi";
import { randomDialogue, NPC_NAME, generatePraise, type LevelResult, type LevelMetrics, type PraiseResult } from "../config/GameText";
import { drawResultCard } from "../ui/ResultCard";
import { ads } from "../core/AdManager";
import { ENV } from "../core/Env";
import { buyPack, PLACEHOLDER_RE, describeGrants } from "../core/Purchase";
import { getPackById } from "../config/ShopData";
import { POINTS_RULES } from "../config/PointsConfig";
import type { LevelSceneCallbacks } from "../scenes/types";
import {
  Match3Engine,
  type HintMove,
  type MatchPosition,
  type SwapResolution,
  type CellSnapshot,
  type EngineSnapshot,
} from "./Match3Engine";

interface MktRect { x: number; y: number; w: number; h: number }

// === 动画时序常量（秒） ===
const SWAP_DUR = 0.16;
const SWAP_BACK_DUR = 0.2;
const CLEAR_DUR = 0.3;
const RESHUFFLE_DUR = 0.42;
/** 选中缩放插值速度（每秒收敛系数） */
const SELECT_LERP = 16;

type Phase = "idle" | "swap" | "swapBack" | "clear" | "drop" | "reshuffleIn";

const MATCH3_ITEMS: (keyof ItemConfig)[] = ["hint", "reshuffle", "undo", "reveal", "step", "shield", "hammer"];

/** 障碍格被点击时的提示文案（适老化：说清为什么不能动） */
const OBSTACLE_TIP: Record<"frozen" | "chained" | "blackhole", string> = {
  frozen: "冰块挡住了",
  chained: "锁链缠住了",
  blackhole: "黑洞吞噬中",
};

// === 锤子库存：复用 BoosterStore（与每日登录礼同源）===

interface TileAnim {
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  alpha?: number;
  rotation?: number;
  glow?: number;
}

export class Match3Scene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;

  private engine: Match3Engine;
  private board: Board;
  private hud: HUD;
  private feedback: Feedback;
  private pause = new PausePanel();

  /** 可变道具数量副本（关卡配置只读） */
  private items: ItemConfig;
  private dropMilestone = 0;

  // --- 动画状态机 ---
  private phase: Phase = "idle";
  private pt = 0;
  private dur = 0;
  private res: SwapResolution | null = null;
  private stepIdx = 0;

  // --- 交互状态 ---
  private selected: MatchPosition | null = null;
  private selectP = 0;
  private hintMove: HintMove | null = null;
  private hintTimer = 0;
  private revealTiles: Set<string> = new Set();
  private revealTimer = 0;
  private idleTimer = 0;
  private undoSnapshot: EngineSnapshot | null = null;

  // --- 关卡状态 ---
  private ended = false;
  private resultPassed = false;
  private praise: PraiseResult | null = null;
  private resultAnimTime = 0;
  private completeTimer: number | null = null;

  // --- 疲劳熔断 ---
  private fatiguePaused = false;
  private fatiguePauseTimer = 0;
  private fatigueArmed = true;
  private fatigueActionMark = 0;

  // --- 时间与台词 ---
  private lastTime = 0;
  private introTimer = 3.5;
  private introDialogue = "";

  // --- 关内营销钩子（注重商业化，适老化非强制） ---
  private reviveModal = false;     // 失败救援弹窗（阻塞）
  private reviveUsed = false;      // 每关仅触发一次
  private offerModal = false;      // 关内特价弹窗（阻塞）
  private offerShown = false;      // 每关仅弹出一次
  private lowStepsPrompt = false;  // 步数/时间告急横幅（非阻塞，可关闭）
  private lowStepsShown = false;   // 每关仅提示一次（步数告急）
  private lowTimeShown = false;    // 每关仅提示一次（限时告急）
  private reviveRects: { key: "ad" | "buy" | "giveup"; rect: MktRect }[] = [];
  private offerRects: { key: "buy" | "later"; rect: MktRect; packId: string }[] = [];
  private lowRects: { key: "ad" | "buy" | "close"; rect: MktRect }[] = [];
  private mktToastText = "";
  private mktToastUntil = 0;

  // --- 锤子道具 ---
  private hammerAiming = false;     // 已点锤子、等待点选要敲掉的格子
  private specialTaught = false;    // 是否已展示过「生成特效棋子」的一次性引导
  private fishTaught = false;       // 是否已展示过「小鱼棋子」作用的一次性引导
  private jellyTaught = false;      // 是否已展示过「果冻关目标」的一次性引导
  // --- 开局带入浮层（booster）---
  private boosterSelecting = false; // 进关先选锤子带入
  private boosterCount = 0;        // 本次选择带入数量
  private boosterRects: { key: "minus" | "plus" | "start"; x: number; y: number; w: number; h: number }[] = [];
  private hammerInv = 0;           // 本关开始时的库存（带入后扣减，通关 +1）

  private prevSkin: import("../core/Skin").SkinConfig | null = null;

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;
    // 双阳主题关强制套用「双阳鹿乡」皮肤（专属图标 + 绿金背景），离场时还原玩家原皮肤
    if (this.level.theme === "shuangyang") {
      this.prevSkin = skinManager.getSkin();
      const sy = getOfficialSkin("official_shuangyang");
      if (sy) skinManager.apply(sy);
    }

    this.engine = new Match3Engine();
    this.engine.init(level);
    this.board = new Board(level.boardCols, level.boardRows);
    this.hud = new HUD();
    this.feedback = new Feedback();
    this.items = { ...level.items };

    // 收集目标关附赠 1 把起始锤子，便于上手体验（不影响带入库存）
    if (level.goal) this.items.hammer += 1;

    // 锤子库存与开局带入浮层：仅三消模式、且已有库存时弹出（避免新玩家无意义的空弹窗）
    this.hammerInv = getHammerInv();
    this.boosterSelecting = level.mode === "match3" && this.hammerInv > 0;
    this.boosterCount = 0;

    this.introDialogue = randomDialogue("entry");
    // 果冻关：用开场台词说明目标（HUD 已有 🍮 进度药丸，这里补「目标教学」）
    if (!this.jellyTaught && this.engine.getJellyTotal() > 0) {
      this.jellyTaught = true;
      this.introDialogue = "这是果冻关 🍮：消除果冻覆盖的格子来清除果冻，全部清除才能过关！";
      this.introTimer = Math.max(this.introTimer, 4.8);
    }
    this.lastTime = performance.now();

    tracker.start(level.id, "match3");
    audioSynth.unlock();

    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setDragHandler((x0, y0, x1, y1) => this.onDrag(x0, y0, x1, y1));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));

    this.syncTiles();
  }

  // === 生命周期 ===

  update(time: number): void {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (this.introTimer > 0 && !this.boosterSelecting) this.introTimer -= dt;
    if (this.ended) this.resultAnimTime += dt;

    this.pause.update(dt);
    this.hud.update(dt);

    if (!this.ended) {
      // 限时关：仅在未暂停 / 未弹窗 / 未疲劳暂停时推进计时，并据此判定胜负
      if (this.engine.isTimed() && !this.pause.isOpen && !this.reviveModal && !this.offerModal && !this.fatiguePaused) {
        this.engine.tick(dt * 1000);
        this.checkEnd();
      }
      // 营销弹窗打开时冻结关卡逻辑（广告层接管输入，这里仅停掉内部推进）
      if (this.reviveModal || this.offerModal) {
        // 仅推进弹窗自身动画（此处无独立动画，留空）
      } else if (this.fatiguePaused) {
        this.fatiguePauseTimer -= dt;
        if (this.fatiguePauseTimer <= 0) {
          this.fatiguePaused = false;
          this.idleTimer = 0;
        }
      } else if (this.pause.isOpen) {
        // 暂停中：逻辑与计时均冻结
      } else if (this.phase !== "idle") {
        this.updateAnimation(dt);
      } else {
        this.updateFatigue();
        this.updateIdleHint(dt);
        this.checkSessionLimit();
        // 关内特价：入场后推送一次（首充/限时特价）
        if (!this.offerShown && this.introTimer <= 0) {
          this.offerShown = true;
          this.offerModal = true;
        }
        // 资源告急提示（限时关提示时间，步数关提示步数），每关仅一次
        if (!this.engine.isTimed()) {
          if (!this.lowStepsShown && this.engine.getStepsLeft() <= 3 && !this.engine.isWon()) {
            this.lowStepsShown = true;
            this.lowStepsPrompt = true;
          }
        } else {
          if (!this.lowTimeShown && this.engine.getTimeLeftMs() <= 10000 && !this.engine.isWon()) {
            this.lowTimeShown = true;
            this.lowStepsPrompt = true;
          }
        }
      }
    }

    // 选中缩放/上浮插值
    const target = this.selected ? 1 : 0;
    this.selectP += (target - this.selectP) * Math.min(1, dt * SELECT_LERP);
    if (Math.abs(this.selectP - target) < 0.003) this.selectP = target;

    this.feedback.update(dt);
    this.syncTiles();
    this.render(time);
  }

  destroy(): void {
    // 还原玩家原皮肤（双阳主题关套用的临时皮肤）
    if (this.prevSkin) {
      skinManager.apply(this.prevSkin);
      this.prevSkin = null;
    }
    if (this.completeTimer !== null) {
      clearTimeout(this.completeTimer);
      this.completeTimer = null;
    }
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
    this.board.destroy();
    this.feedback.clear();
    this.pause.hide();
    this.selected = null;
    this.hintMove = null;
    this.res = null;
  }

  // === 动画状态机 ===

  private startPhase(phase: Phase, dur: number): void {
    this.phase = phase;
    this.pt = 0;
    this.dur = dur;
  }

  private updateAnimation(dt: number): void {
    this.pt += dt;
    const p = this.dur > 0 ? Math.min(1, this.pt / this.dur) : 1;
    if (p < 1) return;

    switch (this.phase) {
      case "swap":
        if (this.res && this.res.valid) {
          this.stepIdx = 0;
          this.beginClearStep();
        } else {
          this.startPhase("swapBack", SWAP_BACK_DUR);
        }
        break;

      case "swapBack":
        this.res = null;
        this.phase = "idle";
        break;

      case "clear":
        this.startPhase("drop", this.dropDuration(this.stepIdx));
        break;

      case "drop":
        this.stepIdx++;
        if (this.res && this.stepIdx < this.res.steps.length) {
          this.beginClearStep();
        } else {
          this.finishResolution();
        }
        break;

      case "reshuffleIn":
        this.phase = "idle";
        break;

      case "idle":
        break;
    }
  }

  private dropDuration(stepIdx: number): number {
    const step = this.res?.steps[stepIdx];
    if (!step) return 0.2;
    let maxDist = 1;
    for (const d of step.drops) maxDist = Math.max(maxDist, d.toRow - d.fromRow);
    return Math.min(0.85, 0.18 + maxDist * 0.045);
  }

  /** 进入某一轮消除阶段：播粒子、音效、得分与连击飘字 */
  private beginClearStep(): void {
    const step = this.res?.steps[this.stepIdx];
    if (!step) {
      this.finishResolution();
      return;
    }
    this.startPhase("clear", CLEAR_DUR);

    const rect = this.board.getBoardRect();
    const cx = rect.x + rect.w / 2;

    // 每个命中格：按真实棋子颜色爆裂（修复原先一律取 iconTypes[0] 的问题）
    let sumX = 0;
    let sumY = 0;
    for (const t of step.cleared) {
      const sxy = this.board.gridToScreen(t.col, t.row);
      sumX += sxy.x;
      sumY += sxy.y;
      const color = (GAME_CONFIG.tileColors as Record<string, string>)[t.type] ?? "#FFE66D";
      this.feedback.burst(sxy.x, sxy.y, color, "");
    }
    const anchorX = step.cleared.length > 0 ? sumX / step.cleared.length : cx;
    const anchorY = step.cleared.length > 0 ? sumY / step.cleared.length : rect.y + rect.h / 2;

    // 首遇「生成特效棋子」给一次引导（适老化教学，避免玩家错过核心爽点）
    if (step.before && step.after) {
      let createdKind: string | null = null;
      for (let rr = 0; rr < step.after.length && !createdKind; rr++) {
        for (let cc = 0; cc < step.after[rr].length; cc++) {
          const afterS = step.after[rr][cc].special;
          const beforeS = step.before[rr]?.[cc]?.special;
          if (afterS && afterS !== beforeS) { createdKind = afterS; break; }
        }
      }
      if (createdKind === "fish" && !this.fishTaught) {
        // 小鱼棋子：既教「怎么来」也教「有什么用」
        this.fishTaught = true;
        this.feedback.popText(cx, anchorY - 92, "🐟 连成 4 个生成小鱼：消除时它会游向并额外清掉 3 枚棋子！", "#4ECDC4", 16, 80);
      } else if (createdKind && !this.specialTaught) {
        this.specialTaught = true;
        this.feedback.popText(cx, anchorY - 92, "连成 4 个以上能生成特效棋子！", "#4ECDC4", 22, 60);
      }
    }

    // 解冻反馈
    for (const f of step.frozenCleared) {
      const sxy = this.board.gridToScreen(f.col, f.row);
      this.feedback.burst(sxy.x, sxy.y, "#aaeeff", "冰融");
    }

    // 得分飘字：按下标左右错位 + 逐级上移，避免多段连击的飘字叠在一起
    const jitter = (this.stepIdx % 2 === 0 ? -1 : 1) * (16 + this.stepIdx * 6);
    this.feedback.popText(
      anchorX + jitter,
      anchorY - 14 - this.stepIdx * 10,
      `+${step.scoreGained}`,
      "#FFE66D",
      26,
      54,
    );

    // 连击：升调音效 + 屏震 + 金色飘字
    if (this.stepIdx >= 1) {
      const combo = this.stepIdx + 1;
      // 连击层级越高，飘字越大越金、屏震越强（增强连击反馈的存在感）
      const isBig = combo >= 3;
      this.feedback.popText(
        anchorX - jitter * 0.6,
        anchorY - 62 - this.stepIdx * 8,
        `连击 x${combo}`,
        isBig ? "#FFE66D" : "#FF9F43",
        Math.min(44, 28 + combo * 4),
        isBig ? 56 : 40,
      );
      audioSynth.playUi("combo", combo);
      gameCanvas.shake(Math.min(14, 5 + combo * 3), 0.26);
    } else {
      audioSynth.playUi("match");
    }
  }

  private finishResolution(): void {
    const reshuffled = this.res?.reshuffled ?? false;
    this.res = null;
    this.phase = "idle";
    this.pt = 0;
    this.selectP = 0;

    this.maybeDropItem();

    if (reshuffled) {
      const rect = this.board.getBoardRect();
      this.feedback.popText(rect.x + rect.w / 2, rect.y + rect.h / 2, "无解，自动重洗", "#4ECDC4", 22);
    }

    this.checkEnd();
  }

  // === 指针交互 ===

  private onTouch(x: number, y: number): void {
    // 0. 开局带入浮层优先吞掉全部输入
    if (this.boosterSelecting) { this.handleBoosterTouch(x, y); return; }
    // 1. 暂停面板优先吞掉输入
    if (this.pause.isOpen) {
      const act = this.pause.hitTest(x, y);
      if (act === "resume") {
        this.pause.hide();
        audioSynth.playUi("button");
      } else if (act === "restart") {
        audioSynth.playUi("button");
        this.cb.onRestart();
      } else if (act === "exit") {
        audioSynth.playUi("button");
        this.cb.onExit();
      }
      return;
    }
    // 1.5 关内营销弹窗（阻塞式）：失败救援 / 关内特价，优先吞掉输入
    if (this.reviveModal) { this.onReviveTouch(x, y); return; }
    if (this.offerModal) { this.onOfferTouch(x, y); return; }

    if (this.ended || this.fatiguePaused) return;

    // 2. HUD（暂停按钮 / 道具栏）
    const hudAction = this.hud.hitTest(x, y);
    if (hudAction) {
      if (hudAction.kind === "pause") {
        this.pause.show();
        audioSynth.playUi("button");
      } else if (hudAction.kind === "home") {
        audioSynth.playUi("button");
        this.cb.onExit();
      } else {
        this.useItem(hudAction.key);
      }
      return;
    }

    // 2.5 步数告急横幅（非阻塞：仅拦截自身按钮，其余点击仍作用于棋盘）
    if (this.lowStepsPrompt) {
      for (const r of this.lowRects) {
        if (this.hitRect(r.rect, x, y)) { this.onLowTouch(r.key); return; }
      }
    }

    // 3. 动画播放中不接受棋盘输入
    if (this.phase !== "idle") return;

    this.idleTimer = 0;
    this.hintMove = null;
    this.hintTimer = 0;
    this.revealTiles.clear();
    this.revealTimer = 0;

    const cell = this.board.screenToGrid(x, y);
    if (!cell) {
      this.selected = null;
      return;
    }
    const { col, row } = cell;

    // 锤子瞄准中：点任意格即敲掉（含障碍），不进入普通选择
    if (this.hammerAiming) {
      this.applyHammer(col, row);
      return;
    }

    const obs = this.engine.getObstacleAt(col, row);
    if (obs) {
      this.selected = null;
      this.rejectAt(col, row, "#aaeeff", OBSTACLE_TIP[obs]);
      return;
    }
    if (this.engine.isEmpty(col, row)) return;

    if (this.selected === null) {
      this.selected = { col, row };
      audioSynth.playUi("button");
      return;
    }
    if (this.selected.col === col && this.selected.row === row) {
      this.selected = null;
      return;
    }

    const a = this.selected;
    const b: MatchPosition = { col, row };
    if (Math.abs(a.col - b.col) + Math.abs(a.row - b.row) !== 1) {
      // 非相邻：改为选中新格，符合「点选式」直觉
      this.selected = b;
      return;
    }
    this.selected = null;
    this.trySwap(a, b);
  }

  /** 滑动手势：按主导轴取相邻格 */
  private onDrag(x0: number, y0: number, x1: number, y1: number): void {
    if (this.ended || this.fatiguePaused || this.pause.isOpen) return;
    if (this.phase !== "idle") return;

    const from = this.board.screenToGrid(x0, y0);
    if (!from) return;

    const dx = x1 - x0;
    const dy = y1 - y0;
    let col = from.col;
    let row = from.row;
    if (Math.abs(dx) > Math.abs(dy)) col += dx > 0 ? 1 : -1;
    else row += dy > 0 ? 1 : -1;

    if (col < 0 || col >= this.engine.getCols() || row < 0 || row >= this.engine.getRows()) return;
    const obsFrom = this.engine.getObstacleAt(from.col, from.row);
    const obsTo = this.engine.getObstacleAt(col, row);
    if (obsFrom || obsTo) {
      this.rejectAt(col, row, "#aaeeff", OBSTACLE_TIP[obsFrom ?? obsTo ?? "frozen"]);
      return;
    }

    this.selected = null;
    this.hintMove = null;
    this.hintTimer = 0;
    this.revealTiles.clear();
    this.revealTimer = 0;
    this.idleTimer = 0;
    this.trySwap(from, { col, row });
  }

  private trySwap(a: MatchPosition, b: MatchPosition): void {
    if (this.phase !== "idle" || this.ended) return;

    this.undoSnapshot = this.engine.snapshot();
    const res = this.engine.swap(a.row, a.col, b.row, b.col);
    this.res = res;
    this.stepIdx = 0;
    this.startPhase("swap", SWAP_DUR);

    if (res.valid) {
      tracker.record("swap", true, res.totalScore);
      if (res.specialCombo) {
        const mg = this.board.gridToScreen((a.col + b.col) / 2, (a.row + b.row) / 2);
        this.feedback.popText(mg.x, mg.y - 20, "特效组合！", "#FFE66D", 26, 40);
        gameCanvas.shake(8, 0.25);
        audioSynth.playUi("combo", 3);
      }
    } else {
      tracker.record("swap_invalid", false, 0);
      this.undoSnapshot = null;
      const sxyA = this.board.gridToScreen(a.col, a.row);
      const sxyB = this.board.gridToScreen(b.col, b.row);
      this.feedback.burst(sxyA.x, sxyA.y, "#9aa3c8", "");
      this.feedback.burst(sxyB.x, sxyB.y, "#9aa3c8", "");
      this.feedback.popText((sxyA.x + sxyB.x) / 2, (sxyA.y + sxyB.y) / 2 - 24, "换不动", "#b8c0e0", 20, 30);
      audioSynth.playUi("invalid");
    }
  }

  private rejectAt(col: number, row: number, color: string, text: string): void {
    const sxy = this.board.gridToScreen(col, row);
    this.feedback.burst(sxy.x, sxy.y, color, text);
    audioSynth.playUi("invalid");
  }

  // === 道具 ===

  private useItem(key: keyof ItemConfig): void {
    if (this.phase !== "idle" || this.ended || this.fatiguePaused) return;

    const rect = this.board.getBoardRect();
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

    if (this.items[key] <= 0) {
      this.feedback.popText(cx, cy, "道具已用完", "#e74c3c", 22);
      audioSynth.playUi("invalid");
      return;
    }

    switch (key) {
      case "hint": {
        const hint = this.engine.findHint();
        if (!hint) {
          this.feedback.popText(cx, cy, "暂时没有可行的一步", "#e74c3c", 22);
          audioSynth.playUi("invalid");
          return;
        }
        this.hintMove = hint;
        this.hintTimer = 4;
        break;
      }
      case "reshuffle": {
        this.engine.reshuffle();
        this.undoSnapshot = this.engine.snapshot();
        this.startPhase("reshuffleIn", RESHUFFLE_DUR);
        this.feedback.popText(cx, cy, "棋盘重洗", "#4ECDC4", 24);
        break;
      }
      case "undo": {
        if (!this.undoSnapshot) {
          this.feedback.popText(cx, cy, "没有可撤销的操作", "#e74c3c", 22);
          audioSynth.playUi("invalid");
          return;
        }
        this.engine.restore(this.undoSnapshot);
        this.undoSnapshot = null;
        this.hud.resetScore();
        this.feedback.popText(cx, cy, "已撤销", "#4ECDC4", 24);
        break;
      }
      case "reveal": {
        const tiles = this.engine.findAllHintTiles();
        if (tiles.length === 0) {
          this.feedback.popText(cx, cy, "暂时没有可行的一步", "#e74c3c", 22);
          audioSynth.playUi("invalid");
          return;
        }
        this.revealTiles = new Set(tiles.map((t) => `${t.col},${t.row}`));
        this.revealTimer = 3;
        this.feedback.popText(cx, cy, "揭示可消除位置", "#4ECDC4", 24);
        break;
      }
      case "step": {
        this.engine.addSteps(3);
        this.feedback.popText(cx, cy, "补步 +3", "#4ECDC4", 24);
        break;
      }
      case "shield": {
        this.engine.grantShield();
        this.feedback.popText(cx, cy, "护盾就绪：下次交换免步", "#4ECDC4", 24);
        break;
      }
      case "hammer": {
        if (this.hammerAiming) {
          this.hammerAiming = false;
          this.feedback.popText(cx, cy, "已取消锤子", "#9aa3c8", 20);
          return;
        }
        this.hammerAiming = true;
        this.hud.flashItem("hammer");
        this.feedback.popText(cx, cy, "点选要敲掉的格子", "#4ECDC4", 22);
        audioSynth.playUi("button");
        this.selected = null;
        return; // 不在此递减，实际敲击时再扣
      }
      default:
        this.feedback.popText(cx, cy, "该道具在此模式不可用", "#e74c3c", 20);
        return;
    }

    this.items[key]--;
    progress.useItem(key);
    this.hud.flashItem(key);
    audioSynth.playUi("item");
    this.selected = null;
    this.hintMove = this.hintTimer > 0 ? this.hintMove : null;
  }

  /** 每消耗 itemDropInterval 步，有 itemDropChance 概率掉落一个道具 */
  private maybeDropItem(): void {
    const interval = this.level.itemDropInterval;
    if (interval <= 0) return;
    const milestone = Math.floor(this.engine.getStepsUsed() / interval);
    if (milestone <= this.dropMilestone) return;
    this.dropMilestone = milestone;
    if (Math.random() > this.level.itemDropChance) return;

    const pool: (keyof ItemConfig)[] = ["hint", "reshuffle", "undo", "reveal", "step", "hammer"];
    const key = pool[Math.floor(Math.random() * pool.length)];
    this.items[key]++;
    progress.addItem(key, 1);
    this.hud.flashItem(key);
    audioSynth.playUi("item");

    const rect = this.board.getBoardRect();
    this.feedback.popText(rect.x + rect.w / 2, rect.y + rect.h - 20, "获得道具 +1", "#FFE66D", 22);
  }

  /** 锤子：敲掉指定格（含障碍），触发引擎消除/下落；不消耗步数 */
  private applyHammer(col: number, row: number): void {
    const res = this.engine.hammerRemove(col, row);
    if (!res) { this.hammerAiming = false; return; }
    this.items.hammer = Math.max(0, this.items.hammer - 1);
    progress.useItem("hammer");
    this.hud.flashItem("hammer");
    audioSynth.playUi("item");
    const sxy = this.board.gridToScreen(col, row);
    const t = res.cleared[0]?.type;
    const color = t ? ((GAME_CONFIG.tileColors as Record<string, string>)[t] ?? "#FFE66D") : "#FFE66D";
    this.feedback.burst(sxy.x, sxy.y, color, "🔨");
    this.feedback.popText(sxy.x, sxy.y - 12, "敲掉啦", "#4ECDC4", 22);
    gameCanvas.shake(6, 0.2);
    this.hammerAiming = false;
    // 锤击后可能直接达成收集目标
    this.checkEnd();
  }

  // === 开局带入浮层（锤子）===

  private handleBoosterTouch(x: number, y: number): void {
    for (const r of this.boosterRects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        if (r.key === "minus") {
          this.boosterCount = Math.max(0, this.boosterCount - 1);
          audioSynth.playUi("button");
        } else if (r.key === "plus") {
          if (this.boosterCount < Math.min(3, this.hammerInv)) {
            this.boosterCount++;
            audioSynth.playUi("button");
          }
        } else if (r.key === "start") {
          const take = Math.min(this.boosterCount, this.hammerInv);
          if (take > 0) {
            spendHammerInv(take);
            this.items.hammer += take;
            this.hammerInv -= take;
            this.hud.flashItem("hammer");
          }
          this.boosterSelecting = false;
          audioSynth.playUi("button");
        }
        return;
      }
    }
  }

  private drawBooster(w: number, h: number): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(8,10,22,0.74)";
      ctx.fillRect(0, 0, w, h);
    }, 200);
    const cw = Math.min(360, w - 40);
    const ch = 300;
    const cx = (w - cw) / 2;
    const cy = (h - ch) / 2;
    gameCanvas.drawRoundRect(cx, cy, cw, ch, 18, "rgba(22,26,48,0.98)", 201);
    gameCanvas.drawStrokeRect(cx, cy, cw, ch, 18, "rgba(78,205,196,0.5)", 2, 202);
    gameCanvas.drawText("选择要带入的锤子 🔨", w / 2, cy + 44,
      { size: 20, color: "#fff", bold: true, align: "center" }, 203);
    gameCanvas.drawText(`当前库存 ${this.hammerInv} 个 · 通关可获得更多`, w / 2, cy + 76,
      { size: 14, color: "#9aa3c8", align: "center" }, 203);
    if (this.hammerInv === 0) {
      gameCanvas.drawText("库存为 0：先通关一关即可获得锤子", w / 2, cy + 102,
        { size: 13, color: "#FFE66D", align: "center" }, 203);
    }

    // 数量步进：[ − ]  N  [ + ]
    const bw = 56, bh = 56;
    const midY = cy + 160;
    const minusX = w / 2 - 150;
    const plusX = w / 2 + 94;
    this.boosterRects = [
      { key: "minus", x: minusX, y: midY, w: bw, h: bh },
      { key: "plus", x: plusX, y: midY, w: bw, h: bh },
      { key: "start", x: w / 2 - 90, y: cy + 236, w: 180, h: 52 },
    ];
    const canMinus = this.boosterCount > 0;
    const canPlus = this.boosterCount < Math.min(3, this.hammerInv);
    const drawStep = (r: { x: number; y: number; w: number; h: number }, label: string, enabled: boolean) => {
      gameCanvas.drawRoundRect(r.x, r.y, r.w, r.h, 14, enabled ? "rgba(78,205,196,0.22)" : "rgba(255,255,255,0.06)", 204);
      gameCanvas.drawStrokeRect(r.x, r.y, r.w, r.h, 14, enabled ? "rgba(78,205,196,0.7)" : "rgba(255,255,255,0.12)", 2, 205);
      gameCanvas.drawText(label, r.x + r.w / 2, r.y + r.h / 2 + 8,
        { size: 30, bold: true, color: enabled ? "#fff" : "rgba(255,255,255,0.3)", align: "center" }, 206);
    };
    drawStep(this.boosterRects[0], "−", canMinus);
    drawStep(this.boosterRects[1], "+", canPlus);
    gameCanvas.drawText(`${this.boosterCount}`, w / 2, midY + bh / 2 + 10,
      { size: 34, bold: true, color: "#FFE66D", align: "center" }, 206);

    // 开始按钮
    const s = this.boosterRects[2];
    gameCanvas.drawRoundRect(s.x, s.y, s.w, s.h, 14, "#4ECDC4", 207);
    gameCanvas.drawText("开始游戏", s.x + s.w / 2, s.y + s.h / 2 + 7,
      { size: 20, bold: true, color: "#0c1a22", align: "center" }, 208);
  }

  // === 关内营销钩子逻辑 ===

  private hitRect(r: MktRect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private boardCenter(): { x: number; y: number } {
    const rect = this.board.getBoardRect();
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }

  private showMktToast(text: string): void {
    this.mktToastText = text;
    this.mktToastUntil = performance.now() + 2200;
  }

  /** 失败救援：看广告续命 +5 步（in-level 直接补步，不走背包） */
  private reviveByAd(): void {
    if (ads.isShowing()) return;
    const c = this.boardCenter();
    ads.showRewarded({ item: "step", count: 5 }, { title: "续命 +5 步" }, (granted) => {
      if (granted) {
        this.engine.addSteps(5);
        progress.addPoints(POINTS_RULES.adReward, "earn_ad");
        this.feedback.popText(c.x, c.y, `续命 +5 步！积分+${POINTS_RULES.adReward}`, "#4ECDC4", 26);
        audioSynth.playUi("item");
        this.hud.pulseSteps();
        this.reviveModal = false;
        this.reviveUsed = true;
      } else {
        this.showMktToast("未看完广告，未续命");
      }
    });
  }

  /** 失败救援：买复活礼包（演示本地续命；真实跳转 Vendure 由后端发货） */
  private reviveByBuy(): void {
    const pack = getPackById("pack_revive");
    if (!pack) return;
    const c = this.boardCenter();
    const realVendure = ENV.vendureEnabled && !PLACEHOLDER_RE.test(pack.vendureUrl || "");
    if (realVendure) {
      try { window.open(pack.vendureUrl, "_blank", "noopener"); } catch { /* 忽略 */ }
      this.showMktToast("已打开 Vendure 商品页，付款后道具到账（演示可免费领）");
      return;
    }
    this.engine.addSteps(5);
    this.engine.grantShield();
    this.feedback.popText(c.x, c.y, "复活！补步 +5、护盾就绪", "#FFE66D", 26);
    audioSynth.playUi("item");
    this.hud.pulseSteps();
    this.reviveModal = false;
    this.reviveUsed = true;
  }

  private onReviveTouch(x: number, y: number): void {
    for (const r of this.reviveRects) {
      if (this.hitRect(r.rect, x, y)) {
        audioSynth.playUi("button");
        if (r.key === "ad") this.reviveByAd();
        else if (r.key === "buy") this.reviveByBuy();
        else { this.reviveModal = false; this.reviveUsed = true; this.endLevel(false); }
        return;
      }
    }
  }

  /** 步数告急横幅交互（非阻塞：仅按钮拦截） */
  private onLowTouch(key: "ad" | "buy" | "close"): void {
    if (key === "close") { this.lowStepsPrompt = false; return; }
    const c = this.boardCenter();
    if (key === "ad") {
      if (ads.isShowing()) return;
      ads.showRewarded({ item: "step", count: 3 }, { title: "补步 +3 步" }, (granted) => {
        if (granted) {
          this.engine.addSteps(3);
          progress.addPoints(POINTS_RULES.adReward, "earn_ad");
          this.feedback.popText(c.x, c.y, `补步 +3 步！积分+${POINTS_RULES.adReward}`, "#4ECDC4", 26);
          audioSynth.playUi("item");
          this.hud.pulseSteps();
          this.lowStepsPrompt = false;
        } else {
          this.showMktToast("未看完广告，未补步");
        }
      });
    } else {
      const pack = getPackById("pack_fault");
      if (pack) {
        const res = buyPack(pack);
        if (res.openedReal) this.showMktToast("已打开 Vendure 商品页，付款后道具到账");
        else this.showMktToast(res.grantedParts.length ? `🎁 已获得 ${res.grantedParts.join("  ")}` : "该礼包暂无可发放道具");
        this.lowStepsPrompt = false;
      }
    }
  }

  /** 关内特价弹窗交互 */
  private onOfferTouch(x: number, y: number): void {
    for (const r of this.offerRects) {
      if (this.hitRect(r.rect, x, y)) {
        audioSynth.playUi("button");
        if (r.key === "later") { this.offerModal = false; return; }
        const pack = getPackById(r.packId);
        if (!pack) { this.offerModal = false; return; }
        const res = buyPack(pack);
        if (res.openedReal) this.showMktToast("已打开 Vendure 商品页，付款后道具到账");
        else this.showMktToast(res.grantedParts.length ? `🎁 已获得 ${res.grantedParts.join("  ")}` : "该礼包暂无可发放道具");
        this.offerModal = false;
        return;
      }
    }
  }

  // === 疲劳熔断 ===

  private updateFatigue(): void {
    if (!this.fatigueArmed && tracker.getTotalActions() > this.fatigueActionMark) {
      this.fatigueArmed = true;
    }
    if (!this.fatigueArmed) return;

    const rts = tracker.getReactionTimes();
    if (safety.checkFatigue(rts, tracker.getMedianRT())) this.triggerFatigue();
  }

  private triggerFatigue(): void {
    this.fatiguePaused = true;
    this.fatiguePauseTimer = GAME_CONFIG.fatiguePauseSeconds;
    this.fatigueArmed = false;
    this.fatigueActionMark = tracker.getTotalActions();
    this.selected = null;
    this.hintMove = null;
    audioSynth.playUi("fail");
  }

  // === 空闲提示 ===

  private updateIdleHint(dt: number): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintMove = null;
    } else {
      this.idleTimer += dt;
      if (this.idleTimer >= this.level.idleHintDelay) {
        if (this.hintMove === null) this.hintMove = this.engine.findHint();
      } else {
        this.hintMove = null;
      }
    }
    if (this.revealTimer > 0) {
      this.revealTimer -= dt;
      if (this.revealTimer <= 0) this.revealTiles.clear();
    }
  }

  private isHintTile(col: number, row: number): boolean {
    if (!this.hintMove) return false;
    const { a, b } = this.hintMove;
    return (a.col === col && a.row === row) || (b.col === col && b.row === row);
  }

  private isRevealTile(col: number, row: number): boolean {
    return this.revealTiles.has(`${col},${row}`);
  }

  // === 会话上限 ===

  private checkSessionLimit(): void {
    if (this.ended) return;
    if (safety.isSessionExpired() || safety.isDailyLimitReached()) {
      this.endLevel(this.engine.isWon());
    }
  }

  // === 胜负 ===

  private checkEnd(): void {
    if (this.ended) return;
    if (this.engine.isWon()) { this.endLevel(true); return; }
    if (this.engine.isLost()) {
      // 失败救援：每关首次步数耗尽时拦截，给一次「看广告续命 / 买复活包」机会
      if (!this.reviveUsed && !this.reviveModal) {
        this.reviveModal = true;
        this.hud.pulseSteps();
        return;
      }
      this.endLevel(false);
    }
  }

  private endLevel(passed: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.resultPassed = passed;
    this.selected = null;
    this.hintMove = null;
    this.res = null;
    this.phase = "idle";
    this.pause.hide();
    // 只解除输入，保留 update 回调以便结算卡片淡入
    gameCanvas.clearHandlers();

    const stepsUsed = this.engine.getStepsUsed();
    const stepLimit = this.level.stepLimit;
    const score = this.engine.getScore();

    const metrics = tracker.getMetrics(passed, stepLimit, stepsUsed);
    adaptive.recordSession(metrics);

    const report = tracker.toReport(passed, stepsUsed, stepLimit);
    api.reportSession(report).then(() => { /* 上报完成 */ }, () => { /* 忽略上报错误 */ });

    progress.recordResult(this.level, passed, score, stepsUsed, metrics.accuracy);

    // 通关奖励：锤子库存 +1（供后续关卡开局带入）
    if (passed) addHammerInv(1);

    const praiseMetrics: LevelMetrics = {
      mode: "match3",
      passed,
      score,
      passTarget: this.level.passTarget,
      stepsUsed,
      stepLimit,
      medianRT: tracker.getMedianRT(),
    };
    this.praise = generatePraise(praiseMetrics);
    this.resultAnimTime = 0;

    audioSynth.playUi(passed ? "win" : "fail");

    const result: LevelResult = {
      passed,
      score,
      stepsUsed,
      medianRT: tracker.getMedianRT(),
    };

    // 延迟让玩家读完事实赞美再进结算场景；destroy() 会清理该定时器
    this.completeTimer = window.setTimeout(() => {
      this.completeTimer = null;
      this.cb.onComplete(result);
    }, 2300);
  }

  // === 渲染数据 ===

  /** 毫秒 → m:ss */
  private formatTime(ms: number): string {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return `${mm}:${ss.toString().padStart(2, "0")}`;
  }

  /** 当前动画阶段应显示的棋盘快照 */
  private snapshotForPhase(): CellSnapshot[][] {
    const r = this.res;
    if (!r) return this.engine.getBoardSnapshot();
    switch (this.phase) {
      case "swap":
      case "swapBack":
        return r.afterSwap;
      case "clear":
        return r.valid && r.steps[this.stepIdx] ? r.steps[this.stepIdx].before : r.afterSwap;
      case "drop":
        return r.valid && r.steps[this.stepIdx] ? r.steps[this.stepIdx].after : r.afterSwap;
      default:
        return this.engine.getBoardSnapshot();
    }
  }

  private syncTiles(): void {
    const snap = this.snapshotForPhase();
    const rows = this.engine.getRows();
    const cols = this.engine.getCols();
    const size = this.board.getTileSize();
    const p = this.dur > 0 ? Math.min(1, this.pt / this.dur) : 1;

    const anim = new Map<string, TileAnim>();
    const keyOf = (col: number, row: number) => `${col},${row}`;

    const r = this.res;
    if (r && (this.phase === "swap" || this.phase === "swapBack")) {
      const A = this.board.gridToScreen(r.a.col, r.a.row);
      const B = this.board.gridToScreen(r.b.col, r.b.row);
      const t = Easing.inOutCubic(p);
      const k = this.phase === "swap" ? 1 - t : t;
      anim.set(keyOf(r.a.col, r.a.row), {
        offsetX: (B.x - A.x) * k,
        offsetY: (B.y - A.y) * k,
        glow: 1 - p,
      });
      anim.set(keyOf(r.b.col, r.b.row), {
        offsetX: (A.x - B.x) * k,
        offsetY: (A.y - B.y) * k,
        glow: 1 - p,
      });
    } else if (r && r.valid) {
      const step = r.steps[this.stepIdx];
      if (step) {
        if (this.phase === "clear") {
          // 0→25%：放大到 1.3 倍并闪白；25%→100%：缩到 0、旋转、淡出
          const grow = p < 0.25 ? Easing.outQuad(p / 0.25) : 1;
          const shrink = p < 0.25 ? 0 : (p - 0.25) / 0.75;
          for (const c of step.cleared) {
            anim.set(keyOf(c.col, c.row), {
              scale: Math.max(0, (1 + 0.3 * grow) * (1 - shrink)),
              alpha: Math.max(0, 1 - shrink),
              rotation: 0.26 * shrink,
              glow: 1 - p,
            });
          }
          for (const f of step.frozenCleared) {
            anim.set(keyOf(f.col, f.row), { glow: Math.max(0, 1 - p * 1.6) });
          }
        } else if (this.phase === "drop") {
          const e = Easing.outBounce(p);
          for (const d of step.drops) {
            const dist = d.toRow - d.fromRow;
            if (dist <= 0) continue;
            const k = keyOf(d.col, d.toRow);
            const prev = anim.get(k) ?? {};
            anim.set(k, {
              ...prev,
              offsetY: -dist * size * (1 - e),
              alpha: d.spawned ? Math.min(1, p / 0.3) : (prev.alpha ?? 1),
            });
          }
        }
      }
    }

    const tiles: TileVisual[][] = [];
    for (let row = 0; row < rows; row++) {
      tiles[row] = [];
      for (let col = 0; col < cols; col++) {
        const cell = snap[row]?.[col];
        if (!cell) continue;
        const type = cell.type;
        const isSelected = this.selected !== null && this.selected.col === col && this.selected.row === row;

        // 棋子配色与文字取自当前皮肤（未换肤时与 GAME_CONFIG 默认值完全一致）
        const skinTile = skinManager.tile(type ?? "");
        const tile: TileVisual = {
          type: type ?? "",
          label: type ? (skinTile.label || type) : "",
          color: type ? skinTile.color : "#888888",
          hidden: false,
          frozen: cell.frozen,
          jelly: cell.jelly ?? false,
          obstacle: cell.obstacle ?? null,
          matched: type === null,
          highlighted: !isSelected && this.phase === "idle" && (this.isHintTile(col, row) || this.isRevealTile(col, row)),
          selected: isSelected,
          special: cell.special ?? null,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          alpha: 1,
          rotation: 0,
          glow: 0,
        };

        if (isSelected) {
          // 选中：放大 1.15× + 上浮 8px（outBack 轻微过冲）
          tile.scale = 1 + 0.15 * this.selectP;
          tile.offsetY = -8 * Easing.outBack(this.selectP);
          tile.glow = this.selectP;
        }

        if (this.phase === "reshuffleIn") {
          const e = Easing.outBack(p);
          tile.scale = 0.55 + 0.45 * e;
          tile.alpha = Math.min(1, p * 1.4);
        }

        const override = anim.get(keyOf(col, row));
        if (override) Object.assign(tile, override);

        tiles[row][col] = tile;
      }
    }

    this.board.setTiles(tiles);
  }

  // === 关内营销渲染 ===

  private drawModalBackdrop(w: number, h: number, z: number): void {
    gameCanvas.drawRoundRect(0, 0, w, h, 0, "rgba(0,0,0,0.72)", z);
  }

  private drawButton(
    label: string, x: number, y: number, w: number, h: number,
    fill: string, stroke: string, textColor: string, z: number,
  ): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12);
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, z);
    gameCanvas.drawText(label, x + w / 2, y + h / 2, { size: 18, color: textColor, bold: true }, z + 1);
  }

  private drawReviveModal(w: number, h: number): void {
    this.reviveRects = [];
    this.drawModalBackdrop(w, h, 90);
    const pw = Math.min(w - 48, 340);
    const ph = 300;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, py, 0, py + ph);
      grad.addColorStop(0, "rgba(28,32,58,0.98)");
      grad.addColorStop(1, "rgba(18,22,42,0.98)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,230,109,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }, 91);
    gameCanvas.drawText("步数用完了", px + pw / 2, py + 40, { size: 26, color: "#FFE66D", bold: true }, 92);
    gameCanvas.drawText("再来一次？选个方式续命", px + pw / 2, py + 70, { size: 14, color: "#c3cadf" }, 92);

    const bw = pw - 40;
    const bx = px + 20;
    const adY = py + 96;
    this.drawButton("▶ 看广告续命 +5 步", bx, adY, bw, 52, "rgba(78,205,196,0.22)", "rgba(78,205,196,0.7)", "#4ECDC4", 92);
    this.reviveRects.push({ key: "ad", rect: { x: bx, y: adY, w: bw, h: 52 } });
    const buyY = py + 160;
    this.drawButton("🛒 买复活礼包", bx, buyY, bw, 52, "rgba(255,230,109,0.22)", "rgba(255,230,109,0.7)", "#FFE66D", 92);
    this.reviveRects.push({ key: "buy", rect: { x: bx, y: buyY, w: bw, h: 52 } });
    const pack = getPackById("pack_revive");
    if (pack) gameCanvas.drawText(`内含 ${describeGrants(pack)}`, px + pw / 2, buyY + 70, { size: 12, color: "#9aa3c8" }, 92);
    const giveY = py + ph - 30;
    gameCanvas.drawText("放弃本关", px + pw / 2, giveY, { size: 15, color: "#7d86ab", bold: true }, 92);
    this.reviveRects.push({ key: "giveup", rect: { x: px + pw / 2 - 60, y: giveY - 20, w: 120, h: 30 } });
  }

  private drawOfferModal(w: number, h: number): void {
    this.offerRects = [];
    this.drawModalBackdrop(w, h, 90);
    const pw = Math.min(w - 48, 340);
    const ph = 332;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, py, 0, py + ph);
      grad.addColorStop(0, "rgba(28,32,58,0.98)");
      grad.addColorStop(1, "rgba(18,22,42,0.98)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,230,109,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }, 91);
    gameCanvas.drawText("🌟 新手专享 · 限时特价", px + pw / 2, py + 38, { size: 20, color: "#FFE66D", bold: true }, 92);

    const pack = getPackById("pack_firstcharge");
    if (pack) {
      gameCanvas.drawText(pack.emoji, px + pw / 2, py + 92, { size: 44 }, 92);
      gameCanvas.drawText(pack.name, px + pw / 2, py + 130, { size: 18, color: "#fff", bold: true }, 92);
      gameCanvas.drawText(describeGrants(pack), px + pw / 2, py + 156, { size: 13, color: "#FFE66D" }, 92);
      const priceText = pack.priceCents > 0 ? `¥${(pack.priceCents / 100).toFixed(0)}` : "免费";
      gameCanvas.drawText(`特价 ${priceText}`, px + pw / 2, py + 180, { size: 14, color: "#4ECDC4", bold: true }, 92);
    }

    const bw = pw - 40;
    const bx = px + 20;
    const realVendure = pack ? ENV.vendureEnabled && !PLACEHOLDER_RE.test(pack.vendureUrl || "") : false;
    const buyLabel = realVendure ? "去购买（真实）" : (pack && pack.priceCents > 0 ? "购买（演示）" : "免费领取（演示）");
    const buyY = py + 210;
    this.drawButton(`🛒 ${buyLabel}`, bx, buyY, bw, 52, "rgba(255,230,109,0.22)", "rgba(255,230,109,0.7)", "#FFE66D", 92);
    this.offerRects.push({ key: "buy", rect: { x: bx, y: buyY, w: bw, h: 52 }, packId: "pack_firstcharge" });
    const laterY = py + 274;
    this.drawButton("稍后再说", bx, laterY, bw, 44, "rgba(255,255,255,0.06)", "rgba(255,255,255,0.18)", "#c3cadf", 92);
    this.offerRects.push({ key: "later", rect: { x: bx, y: laterY, w: bw, h: 44 }, packId: "pack_firstcharge" });
  }

  private drawLowSteps(w: number, h: number): void {
    this.lowRects = [];
    const bx = 12;
    const by = 92;
    const bw = w - 24;
    const bh = 46;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(230,126,34,0.92)";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 12);
      ctx.fill();
    }, 70);
    const warnText = this.engine.isTimed()
      ? `只剩 ${Math.ceil(this.engine.getTimeLeftMs() / 1000)} 秒！`
      : `只剩 ${this.engine.getStepsLeft()} 步！`;
    gameCanvas.drawText(warnText, bx + 14, by + 20, { size: 16, color: "#fff", bold: true, align: "left" }, 71);
    const adW = 96, buyW = 84, closeW = 30;
    const adX = bx + bw - adW - buyW - closeW - 18;
    const btnY = by + 8;
    const btnH = 30;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(12,26,34,0.85)";
      ctx.beginPath();
      ctx.roundRect(adX, btnY, adW, btnH, 9);
      ctx.fill();
    }, 72);
    gameCanvas.drawText("看广告+3步", adX + adW / 2, btnY + 15, { size: 12, color: "#FFE66D", bold: true }, 73);
    this.lowRects.push({ key: "ad", rect: { x: adX, y: btnY, w: adW, h: btnH } });
    const buyX = adX + adW + 6;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(12,26,34,0.85)";
      ctx.beginPath();
      ctx.roundRect(buyX, btnY, buyW, btnH, 9);
      ctx.fill();
    }, 72);
    gameCanvas.drawText("补给礼包", buyX + buyW / 2, btnY + 15, { size: 12, color: "#FFE66D", bold: true }, 73);
    this.lowRects.push({ key: "buy", rect: { x: buyX, y: btnY, w: buyW, h: btnH } });
    const closeX = buyX + buyW + 6;
    gameCanvas.drawText("×", closeX + closeW / 2, btnY + 16, { size: 20, color: "#fff", bold: true }, 73);
    this.lowRects.push({ key: "close", rect: { x: closeX, y: btnY, w: closeW, h: btnH } });
  }

  private drawMktToast(w: number, h: number): void {
    if (performance.now() < this.mktToastUntil && this.mktToastText) {
      const tw = Math.min(w - 60, this.mktToastText.length * 14 + 40);
      const tx = (w - tw) / 2;
      const ty = h - 150;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 38, 10);
        ctx.fill();
      }, 260);
      gameCanvas.drawText(this.mktToastText, w / 2, ty + 19, { size: 14, color: "#fff" }, 261);
    }
  }

  // === 渲染 ===

  private render(time: number): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    // 夜色花园背景（配色 / 柔光斑 / 贴图均取自当前皮肤，未换肤时与默认一致）
    const bgColors = skinManager.bgColors();
    const bgStops = skinManager.bgStops();
    const bgGlows = skinManager.bgGlows();
    const bgImg = skinManager.bgImage();
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      bgColors.forEach((c, i) => {
        grad.addColorStop(bgStops[i] ?? i / Math.max(1, bgColors.length - 1), c);
      });
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 柔光斑点，避免大面积纯色显得死板
      for (const g of bgGlows) {
        const gx = w * g.cx;
        const gy = h * g.cy;
        const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(1, w * g.r));
        rg.addColorStop(0, g.color);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      }

      // 背景贴图：未加载完成时上方渐变已兜底，不会出现空白
      if (bgImg) ctx.drawImage(bgImg, 0, 0, w, h);
    }, 0);

    this.board.setTime(time);
    this.board.draw();

    // 收集目标药丸：有 goal 时传给 HUD 顶部展示；果冻关额外显示果冻清除进度
    const goalTargets = this.engine.getGoalTargets();
    const goalKeys = Object.keys(goalTargets);
    const pills: { icon: string; color: string; current: number; target: number }[] = goalKeys.length > 0
      ? goalKeys.map((id) => {
          const skin = skinManager.tile(id);
          return {
            icon: skin.label || id,
            color: skin.color || "#4ECDC4",
            current: this.engine.getCollectProgress()[id] ?? 0,
            target: goalTargets[id],
          };
        })
      : [];
    if (this.engine.getJellyTotal() > 0) {
      const remaining = this.engine.getJellyRemaining();
      pills.push({
        icon: "🍮",
        color: "#7FC8FF",
        current: this.engine.getJellyTotal() - remaining,
        target: this.engine.getJellyTotal(),
      });
    }
    const goalPills = pills.length > 0 ? pills : undefined;

    this.hud.draw(
      this.engine.getStepsLeft(),
      this.engine.getScore(),
      this.level.passTarget,
      "match3",
      this.items,
      MATCH3_ITEMS,
      `${this.level.name} · 时光整理师`,
      getTheme(this.level.theme).accent,
      goalPills,
      this.engine.isTimed() ? this.engine.getTimeLeftMs() : undefined,
    );

    this.feedback.draw();

    // 入场台词
    if (this.introTimer > 0 && !this.ended && !this.pause.isOpen) {
      const alpha = Math.min(1, this.introTimer / 0.5);
      gameCanvas.drawRoundRect(20, 96, w - 40, 44, 12, `rgba(10,12,26,${0.7 * alpha})`, 35);
      gameCanvas.drawText(`${NPC_NAME}：${this.introDialogue}`, w / 2, 118,
        { size: 15, color: `rgba(168,230,207,${alpha})` }, 36);
    }

    // 疲劳暂停遮罩
    if (this.fatiguePaused) {
      gameCanvas.drawRoundRect(0, 0, w, h, 0, "rgba(0,0,0,0.7)", 60);
      gameCanvas.drawText("休息一下", w / 2, h / 2 - 34,
        { size: 46, color: "#4ECDC4", bold: true }, 61);
      gameCanvas.drawText(`${Math.ceil(this.fatiguePauseTimer)} 秒后继续 · 揉揉眼睛，喝口水`,
        w / 2, h / 2 + 26, { size: 20, color: "#ffffff" }, 61);
    }

    // 暂停面板
    const pauseSub = this.engine.isTimed()
      ? `时间 ${this.formatTime(this.engine.getTimeLeftMs())}`
      : `步数 ${this.engine.getStepsLeft()}`;
    this.pause.draw(`${this.level.name} · ${pauseSub}`);

    // 关内营销：步数告急横幅（非阻塞）/ 特价弹窗 / 失败救援弹窗
    if (this.lowStepsPrompt) this.drawLowSteps(w, h);
    if (this.offerModal) this.drawOfferModal(w, h);
    if (this.reviveModal) this.drawReviveModal(w, h);
    this.drawMktToast(w, h);

    // 锤子瞄准提示（点选格子）
    if (this.hammerAiming && !this.ended) {
      gameCanvas.drawText("🔨 点选要敲掉的格子", w / 2, h - 120,
        { size: 18, color: "#FFE66D", bold: true, align: "center" }, 70);
    }

    // 开局带入浮层（锤子）
    if (this.boosterSelecting) this.drawBooster(w, h);

    // 结算卡片
    if (this.ended && this.praise) {
      const goalT = this.engine.getGoalTargets();
      const comboText = `最高连击 x${Math.max(1, this.engine.getMaxCombo())}`;
      const statsLine = this.engine.isTimed()
        ? (Object.keys(goalT).length > 0
            ? `收集 ${Object.keys(goalT).map((id) => `${this.engine.getCollectProgress()[id] ?? 0}/${goalT[id]}`).join("  ")} · 用时 ${this.formatTime(this.engine.getTimeLeftMs())} · ${comboText}`
            : `分数 ${this.engine.getScore()}/${this.level.passTarget} · 用时 ${this.formatTime(this.engine.getTimeLeftMs())} · ${comboText}`)
        : (Object.keys(goalT).length > 0
            ? `收集 ${Object.keys(goalT).map((id) => `${this.engine.getCollectProgress()[id] ?? 0}/${goalT[id]}`).join("  ")} · 步数 ${this.engine.getStepsUsed()}/${this.level.stepLimit} · ${comboText}`
            : `分数 ${this.engine.getScore()}/${this.level.passTarget} · 步数 ${this.engine.getStepsUsed()}/${this.level.stepLimit} · ${comboText}`);
      const fadeIn = Math.min(1, this.resultAnimTime / 0.4);
      drawResultCard(this.praise, this.resultPassed, statsLine, fadeIn);
    }
  }
}
