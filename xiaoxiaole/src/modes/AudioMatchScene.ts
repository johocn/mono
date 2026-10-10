/**
 * AudioMatchScene — 听音辨位关卡场景控制器（重设计版）
 *
 * 2-1 听音选择范式：播放声音→4选1→点击对应图标
 *   训练靶点：听觉语义加工、听觉注意力
 *   防瞎猜：4选1(25%)+反应时区分+连续正确率追踪
 *
 * 2-2 声音序列复述范式：播放2-3个声音序列→按顺序点击复现
 *   训练靶点：听觉工作记忆容量、序列记忆、分配性注意
 *   防瞎猜：瞎猜概率=(1/4)^n，序列长度2→3时瞎猜率6.25%→1.56%
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
import { getSound } from "../config/SoundLibrary";
import { GAME_CONFIG } from "../core/GameConfig";
import type { LevelConfig, ItemConfig } from "../config/LevelConfig";
import { getTheme } from "../config/themes";
import { drawShuangyangBackground } from "../ui/background";
import { api } from "../api/MockApi";
import { randomDialogue, NPC_NAME, generatePraise, type LevelResult, type LevelMetrics, type PraiseResult } from "../config/GameText";
import { drawResultCard } from "../ui/ResultCard";
import type { LevelSceneCallbacks } from "../scenes/types";

// 选项按钮布局
interface ChoiceButton {
  x: number; y: number; w: number; h: number;
  soundType: string; label: string; icon: string; color: string;
  selected: boolean; correct: boolean; showResult: boolean;
}

export class AudioMatchScene {
  private level: LevelConfig;
  private cb: LevelSceneCallbacks;
  private hud: HUD;
  private feedback: Feedback;
  private pausePanel = new PausePanel();
  private timers: number[] = [];
  /** 视觉替代模式（听力筛查未通过）：超时后给出呼吸灯提示 */
  private visualFallback: boolean;
  private clueShown = false;
  private questionStartTime = 0;

  private paradigm: "choice" | "sequence";
  private stepsUsed: number = 0;
  private bonusSteps: number = 0;
  private shieldPending: boolean = false;
  private correctCount: number = 0;
  private questionIndex: number = 0;
  private totalQuestions: number;
  private items: LevelConfig["items"];

  // 选择范式状态
  private currentAnswer: string = "";
  private choiceButtons: ChoiceButton[] = [];
  private rehearUsed: number = 0;

  // 序列范式状态
  private sequence: string[] = [];
  private currentSeqLength: number;
  private playerInput: string[] = [];
  private maxSeqAchieved: number = 0;
  private consecutiveCorrect: number = 0;
  private consecutiveWrong: number = 0;

  // 通用状态
  private state: "intro" | "soundboard" | "playing" | "waiting" | "feedback" | "finished" = "intro";
  private soundPlayed: boolean = false;
  private playbackEndTime: number = 0;
  private feedbackTimer: number = 0;
  private feedbackMsg: string = "";
  private feedbackColor: string = "#fff";
  private interferenceTimer: number = 0;

  private dialogueTimer: number = 0;
  private currentDialogue: string = "";
  private finished: boolean = false;
  private praise: PraiseResult | null = null;
  private resultAnimTime: number = 0;
  private fatiguePaused: boolean = false;
  private fatiguePauseEnd: number = 0;
  private time: number = 0;
  /** 引导教程关（2-1）：分步教学如何玩 */
  private isTutorial = false;
  /** 教程关的实时教学提示（随状态切换） */
  private coachText = "";
  /** 本关实际抽到的候选音色（按 audioPool 从 iconTypes 随机子集，未设则用全部） */
  private effectivePool: string[] = [];

  // 声音向导（游戏前记忆引导）
  private soundboardCards: { soundType: string; label: string; icon: string; color: string; x: number; y: number; w: number; h: number; active: boolean }[] = [];
  private sbActiveIndex = -1;   // 当前正在自动播放的音色序号（-1 无）
  private sbTourDone = false;   // 自动导览是否播放完毕
  private sbPlaying = false;    // 导览播放中（锁定按钮）
  private sbReplayBtn = { x: 0, y: 0, w: 0, h: 0 };
  private sbStartBtn = { x: 0, y: 0, w: 0, h: 0 };
  private sbTourTimers: number[] = [];  // 仅登记导览定时器，便于重放时取消上一段

  constructor(level: LevelConfig, cb: LevelSceneCallbacks) {
    this.level = level;
    this.cb = cb;
    this.paradigm = level.audioParadigm ?? "choice";
    this.totalQuestions = level.questionCount ?? 8;
    this.currentSeqLength = Math.max(3, level.sequenceLength ?? 3);
    this.items = { ...level.items };
    this.visualFallback = level.visualFallback === true;
    this.isTutorial = level.tutorial === true;

    // 按 audioPool 阶梯式抽取本关候选音色（从 iconTypes 随机子集，未设则用全部）
    const base = level.iconTypes ?? ["sparrow", "rain", "doorbell"];
    this.effectivePool = (level.audioPool && level.audioPool < base.length)
      ? this.shuffle(base).slice(0, level.audioPool)
      : base;

    tracker.start(level.id, "audio");
    audioSynth.unlock();

    this.hud = new HUD();
    this.feedback = new Feedback();

    if (this.isTutorial) {
      this.currentDialogue = `${NPC_NAME}：欢迎来到「听音辨位」！我们来玩声音游戏，我教你两步就会～`;
      this.dialogueTimer = 4.5;
    } else {
      this.currentDialogue = `${NPC_NAME}：${randomDialogue("entry")}`;
      this.dialogueTimer = 3.5;
    }

    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
  }

  /** 统一登记定时器，destroy() 时一次性清理，避免场景切换后回调误触发 */
  private later(fn: () => void, delayMs: number): void {
    const id = window.setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      fn();
    }, delayMs);
    this.timers.push(id);
  }

  private startNextQuestion(): void {
    this.rehearUsed = 0;
    this.playerInput = [];
    this.clueShown = false;
    this.questionStartTime = 0;

    if (this.paradigm === "choice") {
      this.startChoiceQuestion();
    } else {
      this.startSequenceQuestion();
    }
  }

  // === 游戏前「声音向导」：先听本关候选音，记住 声音→选项 映射 ===
  /** 进入声音向导：展示本关全部候选音色，自动逐个播放并高亮对应图标 */
  private startSoundboard(): void {
    this.soundboardCards = this.effectivePool.map((id) => {
      const s = getSound(id);
      return { soundType: id, label: s.label, icon: s.icon, color: s.color, x: 0, y: 0, w: 0, h: 0, active: false };
    });
    this.layoutSoundboard();
    this.state = "soundboard";
    this.sbActiveIndex = -1;
    this.playTour();
  }

  /** 取消上一段导览的全部待触发定时器（避免重放时新旧导览交错） */
  private clearTourTimers(): void {
    this.sbTourTimers.forEach((id) => {
      clearTimeout(id);
      this.timers = this.timers.filter((t) => t !== id);
    });
    this.sbTourTimers = [];
  }

  /** 登记导览定时器（同时纳入全局清理列表，场景销毁时一并取消） */
  private scheduleTour(fn: () => void, delayMs: number): void {
    const id = window.setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      this.sbTourTimers = this.sbTourTimers.filter((t) => t !== id);
      fn();
    }, delayMs);
    this.timers.push(id);
    this.sbTourTimers.push(id);
  }

  /** 自动导览：依次播放每个候选音并高亮，结束后开放操作 */
  private playTour(): void {
    this.clearTourTimers();
    this.sbPlaying = true;
    this.sbTourDone = false;
    this.sbActiveIndex = -1;
    const dur = 1.2, gap = 0.55;
    this.soundboardCards.forEach((c, i) => {
      this.scheduleTour(() => {
        if (this.finished || this.state !== "soundboard") return;
        this.sbActiveIndex = i;
        this.soundboardCards.forEach((o) => (o.active = false));
        c.active = true;
        audioSynth.play(c.soundType, dur);
      }, i * (dur + gap) * 1000);
    });
    this.scheduleTour(() => {
      if (this.finished || this.state !== "soundboard") return;
      this.sbActiveIndex = -1;
      this.soundboardCards.forEach((o) => (o.active = false));
      this.sbPlaying = false;
      this.sbTourDone = true;
    }, this.soundboardCards.length * (dur + gap) * 1000);
  }

  private layoutSoundboard(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const n = this.soundboardCards.length;
    const cols = n <= 4 ? 2 : (n <= 6 ? 3 : 4);
    const gap = 16;
    const btnW = Math.min(n <= 4 ? 150 : 110, (w - 60 - (cols - 1) * gap) / cols);
    const rows = Math.ceil(n / cols);
    // 卡片高度自适应，确保最底排卡片不压到下方按钮带（h-100 起）
    const bandTop = h - 116;
    const avail = bandTop - 138;
    const fitH = (avail - (rows - 1) * gap) / rows;
    const btnH = Math.max(48, Math.min(n <= 4 ? 96 : 74, fitH));
    const totalW = cols * btnW + (cols - 1) * gap;
    const startX = (w - totalW) / 2;
    const startY = 138;
    this.soundboardCards.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      c.x = startX + col * (btnW + gap);
      c.y = startY + row * (btnH + gap);
      c.w = btnW;
      c.h = btnH;
    });
    // 底部操作按钮
    const aw = 160, ah = 56, agap = 30;
    const totalAW = 2 * aw + agap;
    const ax = (w - totalAW) / 2;
    const ay = h - 100;
    this.sbReplayBtn = { x: ax, y: ay, w: aw, h: ah };
    this.sbStartBtn = { x: ax + aw + agap, y: ay, w: aw, h: ah };
  }

  private handleSoundboardTouch(x: number, y: number): void {
    // 按钮优先于卡片：避免按钮带与卡片重叠时点击失效
    if (this.inRect(x, y, this.sbReplayBtn)) {
      audioSynth.playUi("button");
      this.playTour();
      return;
    }
    if (this.inRect(x, y, this.sbStartBtn)) {
      audioSynth.playUi("button");
      this.startNextQuestion();
      return;
    }
    // 点击图标：单独重听该音色
    for (const c of this.soundboardCards) {
      if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) {
        this.soundboardCards.forEach((o) => (o.active = false));
        c.active = true;
        this.sbActiveIndex = this.soundboardCards.indexOf(c);
        audioSynth.play(c.soundType, this.level.audioDuration ?? 1.2);
        audioSynth.playUi("button");
        this.later(() => { if (this.state === "soundboard") { c.active = false; } }, 1300);
        return;
      }
    }
  }

  private inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
    return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  }

  // === 2-1 听音选择范式 ===
  private startChoiceQuestion(): void {
    const types = this.effectivePool;
    const choiceCount = this.level.choiceCount ?? 4;

    // 随机选正确答案
    this.currentAnswer = types[Math.floor(Math.random() * types.length)];

    // 构建选项：1正确 + 干扰项
    const distractors = types.filter(t => t !== this.currentAnswer);
    const shuffled = this.shuffle([...distractors]);
    const choices = [this.currentAnswer, ...shuffled.slice(0, choiceCount - 1)];
    this.shuffle(choices);

    this.choiceButtons = choices.map((t, i) => {
      const info = getSound(t);
      return {
        x: 0, y: 0, w: 0, h: 0,
        soundType: t, label: info.label, icon: info.icon, color: info.color,
        selected: false, correct: t === this.currentAnswer, showResult: false,
      };
    });
    this.layoutChoiceButtons();

    this.state = "playing";
    this.soundPlayed = false;
    this.playSound(this.currentAnswer);
    this.soundPlayed = true;
    this.playbackEndTime = performance.now() + (this.level.audioDuration ?? 2) * 1000;
  }

  private layoutChoiceButtons(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const n = this.choiceButtons.length;
    // 列数随选项数自适应：≤4→2列，≤6→3列，>6→4列（适老：避免单屏过密）
    const cols = n <= 4 ? 2 : (n <= 6 ? 3 : 4);
    const gap = 16;
    const btnW = Math.min(n <= 4 ? 160 : 120, (w - 60 - (cols - 1) * gap) / cols);
    const btnH = n <= 4 ? 100 : 78;
    const totalW = cols * btnW + (cols - 1) * gap;
    const startX = (w - totalW) / 2;
    // 上移留出底部道具栏空间（含 20px 呼吸间距）
    const startY = h - 330;

    this.choiceButtons.forEach((btn, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      btn.x = startX + col * (btnW + gap);
      btn.y = startY + row * (btnH + gap);
      btn.w = btnW;
      btn.h = btnH;
    });
  }

  // === 2-2 声音序列复述范式 ===
  private startSequenceQuestion(): void {
    const types = this.effectivePool;
    const len = this.currentSeqLength;

    // 生成随机序列（允许重复）
    this.sequence = [];
    for (let i = 0; i < len; i++) {
      this.sequence.push(types[Math.floor(Math.random() * types.length)]);
    }

    // 构建选项按钮：展示本关全部候选音色（4~8 个），供按序点选
    const choices = this.shuffle([...types]);
    this.choiceButtons = choices.map((t, i) => {
      const info = getSound(t);
      return {
        x: 0, y: 0, w: 0, h: 0,
        soundType: t, label: info.label, icon: info.icon, color: info.color,
        selected: false, correct: false, showResult: false,
      };
    });
    this.layoutChoiceButtons();

    this.state = "playing";
    this.soundPlayed = false;
    this.playSequence();
  }

  private playSequence(): void {
    const dur = this.level.audioDuration ?? 1.5;
    const gap = this.level.sequenceGap ?? 0.3;

    // 干扰声
    if (this.level.hasInterference) {
      const totalDur = this.sequence.length * (dur + gap);
      audioSynth.playInterference(totalDur);
    }

    this.sequence.forEach((sound, i) => {
      const delay = i * (dur + gap) * 1000;
      this.later(() => {
        if (this.finished) return;
        audioSynth.play(sound, dur);
        if (i === this.sequence.length - 1) {
          this.soundPlayed = true;
          this.playbackEndTime = performance.now() + 500;
        }
      }, delay);
    });
  }

  private playSound(type: string): void {
    audioSynth.play(type, this.level.audioDuration ?? 2);
  }

  /** 每题首次重听免费，之后消耗「重听」道具 */
  private rehear(): void {
    if (this.finished) return;
    if (this.rehearUsed >= 1 && this.items.rehear <= 0) {
      this.feedbackMsg = "重听次数已用完";
      this.feedbackColor = "#e74c3c";
      this.feedbackTimer = Math.max(this.feedbackTimer, 1.2);
      audioSynth.playUi("invalid");
      return;
    }
    if (this.rehearUsed >= 1) {
      this.items.rehear--;
      progress.useItem("rehear");
      this.hud.flashItem("rehear");
    }
    this.rehearUsed++;
    if (this.paradigm === "choice") this.playSound(this.currentAnswer);
    else this.playSequence();
    audioSynth.playUi("button");
    tracker.record("rehear", true, 0);
  }

  /** 补步道具：本关 +3 步数上限 */
  private useStep(): void {
    if (this.items.step <= 0) {
      this.feedbackMsg = "补步已用完";
      this.feedbackColor = "#e74c3c";
      this.feedbackTimer = Math.max(this.feedbackTimer, 1.0);
      audioSynth.playUi("invalid");
      return;
    }
    this.bonusSteps += 3;
    this.items.step--;
    progress.useItem("step");
    this.hud.flashItem("step");
    this.feedbackMsg = "补步 +3";
    this.feedbackColor = "#4ECDC4";
    this.feedbackTimer = Math.max(this.feedbackTimer, 1.0);
    audioSynth.playUi("item");
  }

  /** 护盾道具：抵消下一次失误的步数消耗 */
  private useShield(): void {
    if (this.items.shield <= 0) {
      this.feedbackMsg = "护盾已用完";
      this.feedbackColor = "#e74c3c";
      this.feedbackTimer = Math.max(this.feedbackTimer, 1.0);
      audioSynth.playUi("invalid");
      return;
    }
    this.shieldPending = true;
    this.items.shield--;
    progress.useItem("shield");
    this.hud.flashItem("shield");
    this.feedbackMsg = "护盾就绪：下次失误不扣步";
    this.feedbackColor = "#4ECDC4";
    this.feedbackTimer = Math.max(this.feedbackTimer, 1.0);
    audioSynth.playUi("item");
  }

  private onTouch(x: number, y: number): void {
    // 1. 暂停面板优先
    if (this.pausePanel.isOpen) {
      const act = this.pausePanel.hitTest(x, y);
      if (act === "resume") { this.pausePanel.hide(); audioSynth.playUi("button"); }
      else if (act === "restart") { audioSynth.playUi("button"); this.cb.onRestart(); }
      else if (act === "exit") { audioSynth.playUi("button"); this.cb.onExit(); }
      return;
    }
    if (this.finished || this.fatiguePaused) return;

    // 2. HUD（暂停 / 重听道具）
    const hudAction = this.hud.hitTest(x, y);
    if (hudAction) {
      if (hudAction.kind === "pause") {
        this.pausePanel.show();
        audioSynth.playUi("button");
      } else if (hudAction.kind === "home") {
        audioSynth.playUi("button");
        this.cb.onExit();
      } else if (hudAction.key === "rehear") {
        this.rehear();
      } else if (hudAction.key === "step") {
        this.useStep();
      } else if (hudAction.key === "shield") {
        this.useShield();
      }
      return;
    }

    if (this.state === "soundboard") { this.handleSoundboardTouch(x, y); return; }
    if (this.dialogueTimer > 0) return;
    if (this.state !== "waiting" && this.state !== "playing") return;
    if (!this.soundPlayed) return; // 声音未播完不可点

    this.lastInputTime = performance.now();

    // 3. 选项按钮
    for (const btn of this.choiceButtons) {
      if (x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h) {
        this.handleChoice(btn);
        return;
      }
    }
  }

  private handleChoice(btn: ChoiceButton): void {
    if (this.paradigm === "choice") {
      // 选择范式：直接判断对错
      const isCorrect = btn.soundType === this.currentAnswer;
      tracker.record("choice", isCorrect, isCorrect ? 1 : 0);
      this.playbackEndTime = performance.now(); // 记录反应时终点

      if (isCorrect) {
        this.correctCount++;
        btn.showResult = true;
        btn.correct = true;
        this.feedback.burst(btn.x + btn.w / 2, btn.y + btn.h / 2, btn.color, "正确!");
        this.feedbackMsg = "正确！";
        this.feedbackColor = "#4ECDC4";
      } else {
        if (this.shieldPending) this.shieldPending = false;
        else this.stepsUsed++;
        btn.showResult = true;
        this.feedback.burst(btn.x + btn.w / 2, btn.y + btn.h / 2, "#e74c3c", "再听听");
        // 标出正确答案
        const correctBtn = this.choiceButtons.find(b => b.soundType === this.currentAnswer);
        if (correctBtn) correctBtn.showResult = true;
        this.feedbackMsg = "正确答案是" + (getSound(this.currentAnswer)?.label ?? this.currentAnswer);
        this.feedbackColor = "#e74c3c";
      }

      this.state = "feedback";
      this.feedbackTimer = 1.5;
    } else {
      // 序列范式：累积输入
      this.playerInput.push(btn.soundType);
      btn.selected = true;

      const idx = this.playerInput.length - 1;
      const isCorrect = this.playerInput[idx] === this.sequence[idx];

      if (!isCorrect) {
        // 序列中任一位置错误→整题失败
        if (this.shieldPending) this.shieldPending = false;
        else this.stepsUsed++;
        tracker.record("sequence", false, 0);
        this.consecutiveCorrect = 0;
        this.consecutiveWrong++;
        this.feedback.burst(btn.x + btn.w / 2, btn.y + btn.h / 2, "#e74c3c", "顺序不对");
        this.feedbackMsg = `正确顺序：${this.sequence.map(s => getSound(s)?.label ?? s).join("→")}`;
        this.feedbackColor = "#e74c3c";

        // 降级（序列长度下限恒为 3，保证记忆训练强度）
        if (this.consecutiveWrong >= 2 && this.currentSeqLength > Math.max(3, this.level.sequenceLength ?? 3)) {
          this.currentSeqLength--;
          this.consecutiveWrong = 0;
        }

        this.state = "feedback";
        this.feedbackTimer = 2.5;
      } else if (this.playerInput.length === this.sequence.length) {
        // 全部正确
        this.correctCount++;
        this.maxSeqAchieved = Math.max(this.maxSeqAchieved, this.sequence.length);
        tracker.record("sequence", true, 1);
        this.consecutiveCorrect++;
        this.consecutiveWrong = 0;
        this.feedback.burst(btn.x + btn.w / 2, btn.y + btn.h / 2, "#4ECDC4", "完美!");
        this.feedbackMsg = `序列长度 ${this.sequence.length} 正确！`;
        this.feedbackColor = "#4ECDC4";

        // 升级
        if (this.consecutiveCorrect >= 2 && this.currentSeqLength < (this.level.sequenceMax ?? 3)) {
          this.currentSeqLength++;
          this.consecutiveCorrect = 0;
          this.feedbackMsg += ` 升级到 ${this.currentSeqLength} 个！`;
        }

        this.state = "feedback";
        this.feedbackTimer = 2;
      }
    }
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

    // 基于真实成绩生成事实赞美（生成一次，render 只读取 → 不闪烁）
    const praiseMetrics: LevelMetrics = {
      mode: "audio",
      passed,
      score: this.correctCount,
      passTarget: this.level.passTarget,
      stepsUsed: this.stepsUsed,
      stepLimit: this.level.stepLimit,
      paradigm: this.paradigm,
      totalQuestions: this.totalQuestions,
      maxSeqAchieved: this.maxSeqAchieved,
      medianRT: tracker.getMedianRT(),
    };
    this.praise = generatePraise(praiseMetrics);
    this.resultAnimTime = 0;
    audioSynth.playUi(passed ? "win" : "fail");

    const result: LevelResult = {
      passed,
      score: this.correctCount,
      stepsUsed: this.stepsUsed,
      paradigm: this.paradigm,
      totalQuestions: this.totalQuestions,
      maxSeqAchieved: this.maxSeqAchieved,
      medianRT: tracker.getMedianRT(),
    };

    this.later(() => this.cb.onComplete(result), 2600);
  }

  private lastInputTime: number = 0;
  private lastFrame: number = 0;

  private update(time: number): void {
    const dt = this.lastFrame === 0 ? 0.016 : Math.min((time - this.lastFrame) / 1000, 0.1);
    this.lastFrame = time;
    this.time = time;

    this.pausePanel.update(dt);
    this.hud.update(dt);

    // 通关后：跳过对话早退，让结算卡片正常渲染 + 淡入动画推进
    if (this.finished) {
      this.resultAnimTime += dt;
      this.feedback.update(dt);
      this.render();
      return;
    }

    // 暂停中：冻结一切计时（含声音播放指示）
    if (this.pausePanel.isOpen) {
      this.feedback.update(dt);
      this.render();
      return;
    }

    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0 && this.state === "intro") {
        this.startSoundboard();
      }
      this.feedback.update(dt);
      this.render();
      return;
    }

    // 声音播放完成后进入等待选择状态
    if (this.state === "playing" && this.soundPlayed && performance.now() >= this.playbackEndTime) {
      this.state = "waiting";
      if (this.questionStartTime === 0) this.questionStartTime = performance.now();
    }

    this.updateVisualClue();

    // 教程关：随状态切换教学提示
    if (this.isTutorial && !this.finished && this.dialogueTimer <= 0) {
      if (this.state === "playing") this.coachText = "① 仔细听，这是哪一种声音？";
      else if (this.state === "waiting") this.coachText = "② 在下面点出你听到的图标";
      else this.coachText = "";
    }

    // 反馈计时
    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= dt;
      if (this.feedbackTimer <= 0) {
        // 重置按钮状态
        this.choiceButtons.forEach(b => { b.selected = false; b.showResult = false; });
        this.questionIndex++;

        if (this.questionIndex >= this.totalQuestions || this.stepsUsed >= this.level.stepLimit + this.bonusSteps) {
          const passed = this.correctCount >= this.level.passTarget;
          this.endLevel(passed);
        } else {
          this.startNextQuestion();
        }
      }
    }

    // 疲劳检测
    const rts = tracker.getReactionTimes();
    if (rts.length >= 3) {
      if (safety.checkFatigue(rts, tracker.getMedianRT()) && !this.fatiguePaused) {
        this.fatiguePaused = true;
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
      if (!this.finished) this.endLevel(false);
    }

    this.feedback.update(dt);
    this.render();
  }

  /** 视觉替代路径：听力筛查未通过者，超时后得到呼吸灯提示 */
  private updateVisualClue(): void {
    if (!this.visualFallback || this.clueShown) return;
    if (this.state !== "waiting" || this.questionStartTime === 0) return;
    const delay = (this.level.visualClueDelay ?? 3) * 1000;
    if (performance.now() - this.questionStartTime < delay) return;
    this.clueShown = true;
    this.feedback.popText(gameCanvas.getW() / 2, gameCanvas.getH() / 2 - 70,
      "听不清的话，看闪烁的那个", "#4ECDC4", 18, 30);
    audioSynth.playUi("item");
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    // 背景：双阳主题关统一绿金（与三消关同一皮肤），其余关蓝紫
    if (this.level.theme === "shuangyang") {
      drawShuangyangBackground();
    } else {
      gameCanvas.draw((ctx) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#1a1a2e");
        grad.addColorStop(1, "#0f3460");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }, 0);
    }

    if (this.state === "soundboard") { this.renderSoundboard(w, h); return; }

    // HUD（标题保持简短并右对齐，避免压住左侧步数）
    const modeLabel = this.paradigm === "choice" ? "听音选择" : "声音序列";
    const qIndex = Math.min(this.questionIndex + 1, this.totalQuestions);
    const title = this.isTutorial
      ? `听音教程 · 第 ${qIndex}/${this.totalQuestions} 题`
      : this.paradigm === "sequence"
      ? `${modeLabel} · 第 ${qIndex}/${this.totalQuestions} 题 · 序列${this.currentSeqLength}`
      : `${this.level.name} · 第 ${qIndex}/${this.totalQuestions} 题`;
    this.hud.draw(
      this.level.stepLimit - this.stepsUsed + this.bonusSteps,
      this.correctCount,
      this.level.passTarget,
      "audio",
      this.items,
      ["rehear", "step", "shield"],
      title,
      getTheme(this.level.theme).accent,
    );

    // 声音播放指示器
    if (this.state === "playing" && !this.soundPlayed) {
      this.renderPlaybackIndicator(w, h);
    } else if (this.paradigm === "sequence" && this.state === "playing") {
      this.renderSequenceProgress(w, h);
    }

    // 教程关教学提示横幅（分步引导）
    if (this.isTutorial && this.coachText && this.dialogueTimer <= 0) {
      const bw = 380, bh = 44, bx = (w - bw) / 2, by = 170;
      gameCanvas.drawRoundRect(bx, by, bw, bh, 12, "rgba(78,205,196,0.22)", 12);
      gameCanvas.drawText(this.coachText, w / 2, by + 28, { size: 20, color: "#cffaf4", bold: true }, 13);
    }

    // 等待选择状态提示
    if (this.state === "waiting") {
      const prompt = this.paradigm === "choice"
        ? "请点击对应的图标"
        : `请按顺序点击（${this.playerInput.length} / ${this.sequence.length}）`;
      gameCanvas.drawText(prompt, w / 2, h / 2 - 20, { size: 24, color: "#fff", bold: true });

      // 序列模式：显示已输入的序号
      if (this.paradigm === "sequence") {
        this.playerInput.forEach((s, i) => {
          const x = w / 2 - (this.sequence.length * 30) / 2 + i * 30 + 15;
          gameCanvas.drawCircle(x, h / 2 + 20, 12, getSound(s)?.color ?? "#888", 8);
          gameCanvas.drawText(`${i + 1}`, x, h / 2 + 20, { size: 12, color: "#fff" }, 9);
        });
      }
    }

    // 选项按钮
    this.choiceButtons.forEach(btn => this.renderChoiceButton(btn));

    // 视觉替代模式徽标（放在对话条下方，避免与 NPC 台词重叠）
    if (this.visualFallback) {
      gameCanvas.drawRoundRect(w - 130, 146, 118, 26, 8, "rgba(78,205,196,0.18)", 8);
      gameCanvas.drawText("视觉辅助模式", w - 71, 159,
        { size: 12, color: "#8fe3dc" }, 9);
    }

    // 反馈消息
    if (this.feedbackTimer > 0) {
      gameCanvas.drawRoundRect(w / 2 - 200, h / 2 - 120, 400, 50, 10,
        "rgba(0,0,0,0.8)", 15);
      gameCanvas.drawText(this.feedbackMsg, w / 2, h / 2 - 95,
        { size: 20, color: this.feedbackColor, bold: true }, 16);
    }

    // NPC 对话：贴顶显示（与三消模式一致），避免压住底部道具栏
    if (this.dialogueTimer > 0 && !this.finished) {
      const alpha = Math.min(1, this.dialogueTimer / 0.5);
      gameCanvas.drawRoundRect(20, 96, w - 40, 44, 12, `rgba(10,12,26,${0.72 * alpha})`, 35);
      gameCanvas.drawText(this.currentDialogue, w / 2, 118,
        { size: 15, color: `rgba(255,230,109,${alpha})` }, 36);
    }

    // 疲劳暂停
    if (this.fatiguePaused) {
      gameCanvas.drawRoundRect(0, 0, w, h, 0, "rgba(0,0,0,0.7)", 60);
      gameCanvas.drawText("休息一下", w / 2, h / 2 - 30,
        { size: 42, color: "#4ECDC4", bold: true }, 61);
      gameCanvas.drawText("揉揉眼睛，喝口水，30 秒后继续",
        w / 2, h / 2 + 20, { size: 18, color: "#ffffff" }, 61);
    }

    // 暂停面板
    this.pausePanel.draw(
      `${this.level.name} · 第 ${Math.min(this.questionIndex + 1, this.totalQuestions)} 题`,
    );

    // 通关结算卡片（事实赞美，构造时生成一次 → 固定不闪烁）
    if (this.finished && this.praise) {
      const passed = this.correctCount >= this.level.passTarget;
      const statsLine = this.paradigm === "sequence"
        ? `正确 ${this.correctCount}/${this.totalQuestions} · 最长序列 ${this.maxSeqAchieved} · 步数 ${this.stepsUsed}/${this.level.stepLimit}`
        : `正确 ${this.correctCount}/${this.totalQuestions} · 步数 ${this.stepsUsed}/${this.level.stepLimit}`;
      const fadeIn = Math.min(1, this.resultAnimTime / 0.4);
      drawResultCard(this.praise, passed, statsLine, fadeIn);
    }

    this.feedback.draw();
  }

  private renderSoundboard(w: number, h: number): void {
    const gold = this.level.theme === "shuangyang";
    // 标题与说明
    gameCanvas.drawText("先记住这些声音", w / 2, 64, { size: 26, color: "#fff", bold: true });
    const tip = this.sbTourDone ? "点击图标可单独重听，准备好后点「开始游戏」"
                                : "正在逐个播放，请记住每个声音对应哪个图标…";
    gameCanvas.drawText(tip, w / 2, 96, { size: 16, color: gold ? "#f3dca0" : "#bfe9e4" });

    // 候选音卡片
    this.soundboardCards.forEach((c) => {
      const bg = c.active ? c.color + "cc" : c.color + "55";
      gameCanvas.drawRoundRect(c.x, c.y, c.w, c.h, 12, bg, 6);
      gameCanvas.draw((ctx) => {
        ctx.strokeStyle = gold ? (c.active ? "#e0a82e" : "rgba(224,168,46,0.7)") : (c.active ? "#ffffff" : c.color);
        ctx.lineWidth = c.active ? 3 : 2;
        ctx.beginPath();
        ctx.roundRect(c.x, c.y, c.w, c.h, 12);
        ctx.stroke();
      }, 7);
      // 播放指示
      if (c.active) {
        gameCanvas.drawText("▶", c.x + c.w / 2, c.y + 32, { size: 30, color: "#fff" }, 8);
      } else {
        gameCanvas.drawText(c.icon, c.x + c.w / 2, c.y + 32, { size: 34 }, 8);
      }
      gameCanvas.drawText(c.label, c.x + c.w / 2, c.y + c.h - 18, { size: 17, color: "#fff", bold: true }, 8);
    });

    // 操作按钮
    const drawBtn = (r: { x: number; y: number; w: number; h: number }, text: string, accent: boolean) => {
      const accentColor = accent ? (gold ? "#e0a82e" : "#4ECDC4") : "rgba(255,255,255,0.16)";
      const textColor = accent ? (gold ? "#2a1c06" : "#10243a") : "#fff";
      gameCanvas.drawRoundRect(r.x, r.y, r.w, r.h, 14, accentColor, 6);
      gameCanvas.drawText(text, r.x + r.w / 2, r.y + r.h / 2 + 6,
        { size: 20, color: textColor, bold: true }, 9);
      if (!accent) {
        gameCanvas.draw((ctx) => {
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(r.x, r.y, r.w, r.h, 14);
          ctx.stroke();
        }, 7);
      }
    };
    drawBtn(this.sbReplayBtn, "重听全部", false);
    drawBtn(this.sbStartBtn, "开始游戏", true);

    // 暂停面板（向导阶段也可暂停）
    this.pausePanel.draw(`${this.level.name} · 声音向导`);
  }

  private renderPlaybackIndicator(w: number, h: number): void {
    gameCanvas.drawRoundRect(w / 2 - 120, h / 2 - 100, 240, 50, 10,
      "rgba(108,92,231,0.8)", 8);
    gameCanvas.drawText("正在播放…仔细听", w / 2, h / 2 - 75,
      { size: 20, color: "#fff" }, 9);
    // 声波动画
    if (!safety.isReducedMotion()) {
      const r = 10 + Math.sin(this.time / 100) * 8;
      gameCanvas.drawCircle(w / 2 - 90, h / 2 - 75, r, "rgba(255,255,255,0.4)", 9);
    }
  }

  private renderSequenceProgress(w: number, h: number): void {
    const dur = this.level.audioDuration ?? 1.5;
    const gap = this.level.sequenceGap ?? 0.3;
    const totalDur = this.sequence.length * (dur + gap);
    gameCanvas.drawText(`序列播放中（${this.sequence.length} 个声音）`, w / 2, h / 2 - 100,
      { size: 20, color: "#6C5CE7", bold: true });

    // 序列进度点
    const elapsed = (performance.now() - (this.playbackEndTime - totalDur * 1000 - 500)) / 1000;
    for (let i = 0; i < this.sequence.length; i++) {
      const x = w / 2 - (this.sequence.length * 30) / 2 + i * 30 + 15;
      const y = h / 2 - 60;
      const noteStart = i * (dur + gap);
      const isActive = elapsed >= noteStart && elapsed < noteStart + dur;
      const isPast = elapsed >= noteStart + dur;
      const color = isActive ? (getSound(this.sequence[i])?.color ?? "#888") :
                    isPast ? "rgba(78,205,196,0.3)" : "rgba(255,255,255,0.2)";
      gameCanvas.drawCircle(x, y, 12, color, 8);
    }
  }

  private renderChoiceButton(btn: ChoiceButton): void {
    // 按钮背景
    let bgColor = btn.color + "60";
    if (btn.showResult) {
      bgColor = btn.correct ? "#27ae60" : "#e74c3c";
    } else if (btn.selected) {
      bgColor = "#ffffff40";
    }

    gameCanvas.drawRoundRect(btn.x, btn.y, btn.w, btn.h, 12, bgColor, 6);
    gameCanvas.draw((ctx) => {
      // 双阳主题：选项卡暖金描边（保留语义填充色），结果态仍用对错色
      ctx.strokeStyle = (this.level.theme === "shuangyang" && !btn.showResult) ? "#e0a82e" : btn.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 12);
      ctx.stroke();
    }, 7);

    // 图标
    gameCanvas.drawText(btn.icon, btn.x + btn.w / 2, btn.y + 35,
      { size: 36 }, 8);
    // 文字
    gameCanvas.drawText(btn.label, btn.x + btn.w / 2, btn.y + 75,
      { size: 18, color: "#fff", bold: true }, 8);

    // 结果标记
    if (btn.showResult) {
      const mark = btn.correct ? "✓" : "✗";
      gameCanvas.drawText(mark, btn.x + btn.w - 20, btn.y + 20,
        { size: 24, color: "#fff", bold: true }, 9);
    }

    // 视觉辅助模式：超时后对正确选项施加呼吸灯提示（≤2Hz）
    if (this.visualFallback && this.clueShown && btn.correct && !btn.showResult) {
      gameCanvas.drawSafeFlash(btn.x - 3, btn.y - 3, btn.w + 6, btn.h + 6, "#4ECDC4", this.time, 10);
    }

    // 序列模式：已选序号
    if (btn.selected && this.paradigm === "sequence" && !btn.showResult) {
      const idx = this.playerInput.lastIndexOf(btn.soundType);
      if (idx >= 0) {
        gameCanvas.drawCircle(btn.x + 15, btn.y + 15, 12, "#4ECDC4", 9);
        gameCanvas.drawText(`${idx + 1}`, btn.x + 15, btn.y + 15,
          { size: 14, color: "#fff", bold: true }, 10);
      }
    }
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  destroy(): void {
    // 清理所有排期中的音频播放定时器，避免场景切换后仍发声
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
    this.pausePanel.hide();
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
    this.feedback.clear();
  }
}
