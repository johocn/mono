/**
 * 听力筛查门 — spec v1.1 第 7.2 节
 * 首次进入听音辨位前 3 题纯音测试，不达标自动切视觉替代版
 */

import { gameCanvas } from "../ui/GameCanvas";
import { safety } from "../core/SafetyManager";
import { api } from "../api/MockApi";
import { DEBUG } from "../core/GameConfig";
import { audioSynth } from "../ui/AudioSynth";

const TEST_FREQS = [500, 1000, 2000];

export class HearingScreenScene {
  private onComplete: (passed: boolean) => void;
  private currentTest: number = 0;
  private responses: { freq: number; heard: boolean }[] = [];
  private isPlaying: boolean = false;
  private waitTimer: number = 0;
  private phase: "intro" | "playing" | "waiting" | "done" = "intro";
  private finished: boolean = false;
  private lastFrame: number = 0;
  private nextToneTimer: number | null = null;

  constructor(onComplete: (passed: boolean) => void) {
    this.onComplete = onComplete;
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update());
  }

  private update(): void {
    const now = performance.now();
    const dt = this.lastFrame === 0 ? 0.016 : Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;

    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      if (this.waitTimer <= 0 && this.phase === "playing") {
        // 3 秒无响应判定为没听到
        this.recordResponse(false);
      }
    }
    this.render();
  }

  private playTone(freq: number): void {
    this.phase = "playing";
    this.isPlaying = true;
    this.waitTimer = 3;
    if (DEBUG) console.log(`[HearingScreen] Playing ${freq}Hz test ${this.currentTest + 1}/3`);
    audioSynth.playPureTone(freq, 1.5);
  }

  private onTouch(x: number, y: number): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    if (this.phase === "intro") {
      // 开始按钮
      const btnY = h / 2 + 60;
      if (x > w/2 - 100 && x < w/2 + 100 && y > btnY && y < btnY + 60) {
        this.currentTest = 0;
        this.responses = [];
        this.playTone(TEST_FREQS[0]);
      }
    } else if (this.phase === "playing") {
      // 听到了按钮
      const heardY = h / 2 + 40;
      if (x > w/2 - 100 && x < w/2 + 100 && y > heardY && y < heardY + 60) {
        this.recordResponse(true);
      }
    } else if (this.phase === "done") {
      // 确认按钮
      const btnY = h / 2 + 120;
      if (x > w/2 - 100 && x < w/2 + 100 && y > btnY && y < btnY + 60) {
        this.finished = true;
        gameCanvas.setTouchHandler(null);
        gameCanvas.setUpdateCallback(null);
        const passed = this.responses.every(r => r.heard);
        safety.setHearingPassed(passed);
        api.reportHearingScreen({ passed, responses: this.responses });
        this.onComplete(passed);
      }
    }
  }

  private recordResponse(heard: boolean): void {
    this.responses.push({ freq: TEST_FREQS[this.currentTest], heard });
    this.isPlaying = false;
    this.waitTimer = 0;
    this.currentTest++;

    if (this.currentTest >= TEST_FREQS.length) {
      this.phase = "done";
    } else {
      this.phase = "waiting";
      this.nextToneTimer = window.setTimeout(() => {
        this.nextToneTimer = null;
        if (!this.finished) this.playTone(TEST_FREQS[this.currentTest]);
      }, 800);
    }
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    gameCanvas.drawRoundRect(0, 0, w, h, 0, "#1a1a2e", 0);

    if (this.phase === "intro") {
      gameCanvas.drawText("听力筛查", w / 2, h / 2 - 80, { size: 36, color: "#4ECDC4", bold: true });
      gameCanvas.drawText("接下来会播放 3 个不同频率的声音", w / 2, h / 2 - 20, { size: 20, color: "#ccc" });
      gameCanvas.drawText("听到请点击「听到了」", w / 2, h / 2 + 10, { size: 20, color: "#ccc" });
      gameCanvas.drawText("请佩戴耳机或在安静环境进行", w / 2, h / 2 + 40, { size: 16, color: "#888" });

      // 开始按钮
      gameCanvas.drawRoundRect(w/2 - 100, h/2 + 60, 200, 60, 12, "#4ECDC4", 6);
      gameCanvas.drawText("开始筛查", w/2, h/2 + 90, { size: 24, color: "#fff", bold: true }, 7);
    } else if (this.phase === "playing") {
      gameCanvas.drawText(`测试 ${this.currentTest + 1} / 3`, w / 2, h / 2 - 60, { size: 28, color: "#FFE66D" });
      if (this.isPlaying) {
        // 声波动画指示
        gameCanvas.drawCircle(w / 2, h / 2 - 10, 30 + Math.sin(Date.now()/200) * 10, "#4ECDC4", 4);
        gameCanvas.drawText("正在播放…", w / 2, h / 2 - 10, { size: 20, color: "#4ECDC4" }, 5);
      }
      // 听到了按钮
      gameCanvas.drawRoundRect(w/2 - 100, h/2 + 40, 200, 60, 12, "#27ae60", 6);
      gameCanvas.drawText("听到了", w/2, h/2 + 70, { size: 24, color: "#fff", bold: true }, 7);
    } else if (this.phase === "done") {
      const passed = this.responses.every(r => r.heard);
      gameCanvas.drawText("筛查完成", w / 2, h / 2 - 80, { size: 36, color: "#4ECDC4", bold: true });

      if (passed) {
        gameCanvas.drawText("听力正常，可进入听音辨位模式", w / 2, h / 2 - 20, { size: 22, color: "#27ae60" });
      } else {
        gameCanvas.drawText("部分频率未听到", w / 2, h / 2 - 20, { size: 22, color: "#e74c3c" });
        gameCanvas.drawText("建议佩戴助听设备，将自动切换视觉模式", w / 2, h / 2 + 10, { size: 18, color: "#888" });
      }

      gameCanvas.drawRoundRect(w/2 - 100, h/2 + 120, 200, 60, 12, "#4ECDC4", 6);
      gameCanvas.drawText("确认", w/2, h/2 + 150, { size: 24, color: "#fff", bold: true }, 7);
    }
  }

  destroy(): void {
    this.finished = true;
    if (this.nextToneTimer !== null) {
      clearTimeout(this.nextToneTimer);
      this.nextToneTimer = null;
    }
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
