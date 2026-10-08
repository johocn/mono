/**
 * 安全管理器 — 视觉安全 / 会话上限与疲劳熔断
 * 听力筛查门 / 视觉安全 / 会话上限与疲劳熔断
 */

import { GAME_CONFIG } from "./GameConfig";

export class SafetyManager {
  private sessionStart: number = 0;
  private dailyMinutes: number = 0;
  private dailyDate: string = "";
  private reducedMotion: boolean = GAME_CONFIG.reducedMotionDefault;
  private soundEnabled: boolean = true;
  /** 字号档位索引（0=标准 1=大 2=超大），默认「大」——适老化首屏即可读 */
  private fontLevel: number = 1;
  private hearingPassed: boolean = false;
  private hearingScreened: boolean = false;
  private audioUnlockers: Array<() => void> = [];
  private audioUnlocked: boolean = false;
  private warnedTapTargets = new Set<string>();

  // === 7.2 听力筛查门 ===
  isHearingPassed(): boolean { return this.hearingPassed; }
  setHearingPassed(v: boolean): void {
    this.hearingPassed = v;
    this.save();
  }
  isHearingScreened(): boolean { return this.hearingScreened; }
  setHearingScreened(v: boolean): void {
    this.hearingScreened = v;
    this.save();
  }

  // === 7.3 视觉安全 ===
  isReducedMotion(): boolean { return this.reducedMotion; }
  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
    this.save();
  }

  // === 音频开关（适老化：需要完全静音的场景） ===
  isSoundEnabled(): boolean { return this.soundEnabled; }
  setSoundEnabled(v: boolean): void {
    this.soundEnabled = v;
    this.save();
  }

  // === 适老化字号（全局缩放，一处改动全站生效） ===
  static readonly FONT_SCALES = [1.0, 1.2, 1.4];
  static readonly FONT_LABELS = ["标准", "大", "超大"];
  getFontLevel(): number {
    if (this.fontLevel < 0 || this.fontLevel >= SafetyManager.FONT_SCALES.length) return 1;
    return this.fontLevel;
  }
  setFontLevel(v: number): void {
    const max = SafetyManager.FONT_SCALES.length - 1;
    this.fontLevel = Math.max(0, Math.min(max, Math.round(v)));
    this.save();
  }
  getFontScale(): number {
    return SafetyManager.FONT_SCALES[this.getFontLevel()] ?? 1.2;
  }

  // === 7.3 视觉安全校验 ===
  isFlashSafe(hz: number): boolean { return hz <= GAME_CONFIG.maxFlashHz; }
  assertSafeHz(hz: number, tag: string): boolean {
    const ok = this.isFlashSafe(hz);
    if (!ok && !this.warnedTapTargets.has(tag)) {
      this.warnedTapTargets.add(tag);
      console.warn(`[a11y] 动效 "${tag}" 频率 ${hz}Hz 超过上限 ${GAME_CONFIG.maxFlashHz}Hz`);
    }
    return ok;
  }

  private static relLuminance(rgb: [number, number, number]): number {
    const ch = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  private static parseHex(hex: string): [number, number, number] | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  static contrastRatio(fg: string, bg: string): number {
    const a = SafetyManager.parseHex(fg);
    const b = SafetyManager.parseHex(bg);
    if (!a || !b) return 21;
    const la = SafetyManager.relLuminance(a);
    const lb = SafetyManager.relLuminance(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  assertContrast(fg: string, bg: string, tag: string): boolean {
    const ratio = SafetyManager.contrastRatio(fg, bg);
    const ok = ratio >= GAME_CONFIG.minContrastRatio;
    if (!ok && !this.warnedTapTargets.has(tag)) {
      this.warnedTapTargets.add(tag);
      console.warn(
        `[a11y] 配色 "${tag}" 对比度 ${ratio.toFixed(2)}:1 低于 ${GAME_CONFIG.minContrastRatio}:1`,
      );
    }
    return ok;
  }
  getEffectMode(): "full" | "reduced" {
    return this.reducedMotion ? "reduced" : "full";
  }
  assertTapSize(size: number, tag: string): boolean {
    const ok = size >= GAME_CONFIG.minTapSize;
    if (!ok && !this.warnedTapTargets.has(tag)) {
      this.warnedTapTargets.add(tag);
      console.warn(
        `[a11y] 可点击区 "${tag}" 为 ${size.toFixed(0)}px，低于最小 ${GAME_CONFIG.minTapSize}px`,
      );
    }
    return ok;
  }

  // === 音频解锁 ===
  registerAudioUnlock(fn: () => void): void {
    if (this.audioUnlocked) { fn(); return; }
    this.audioUnlockers.push(fn);
  }
  unlockAudio(): void {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    const fns = this.audioUnlockers.slice();
    this.audioUnlockers = [];
    for (const fn of fns) {
      try { fn(); } catch { /* 音频不可用时静默忽略 */ }
    }
  }

  // === 7.4 会话上限与疲劳熔断 ===
  startSession(): void {
    this.sessionStart = Date.now();
    this.checkDailyReset();
  }
  endSession(): void {
    if (!this.sessionStart) return;
    this.checkDailyReset();
    this.dailyMinutes += this.getSessionMinutes();
    this.sessionStart = 0;
    this.save();
  }
  getSessionMinutes(): number {
    if (!this.sessionStart) return 0;
    return (Date.now() - this.sessionStart) / 60000;
  }
  getDailyMinutesUsed(): number {
    this.checkDailyReset();
    return this.dailyMinutes + this.getSessionMinutes();
  }
  isSessionExpired(): boolean {
    return this.getSessionMinutes() >= GAME_CONFIG.maxSessionMinutes;
  }
  isDailyLimitReached(): boolean {
    return this.getDailyMinutesUsed() >= GAME_CONFIG.maxDailyMinutes;
  }
  checkFatigue(reactionTimes: number[], medianRT: number): boolean {
    if (reactionTimes.length < GAME_CONFIG.fatigueConsecutiveSteps) return false;
    const threshold = medianRT * GAME_CONFIG.fatigueThreshold;
    const recent = reactionTimes.slice(-GAME_CONFIG.fatigueConsecutiveSteps);
    return recent.every((rt) => rt > threshold);
  }

  private checkDailyReset(): void {
    const today = new Date().toDateString();
    if (this.dailyDate !== today) {
      this.dailyDate = today;
      this.dailyMinutes = 0;
    }
  }

  // 持久化（localStorage）
  private save(): void {
    try {
      localStorage.setItem("tt_safety", JSON.stringify({
        reducedMotion: this.reducedMotion,
        soundEnabled: this.soundEnabled,
        fontLevel: this.fontLevel,
        hearingPassed: this.hearingPassed,
        hearingScreened: this.hearingScreened,
        dailyMinutes: this.dailyMinutes,
        dailyDate: this.dailyDate,
      }));
    } catch { /* 隐私模式下滑默 */ }
  }
  load(): void {
    try {
      const data = localStorage.getItem("tt_safety");
      if (data) {
        const obj = JSON.parse(data) as Record<string, unknown>;
        this.reducedMotion = (obj.reducedMotion as boolean) ?? GAME_CONFIG.reducedMotionDefault;
        this.soundEnabled = (obj.soundEnabled as boolean) ?? true;
        this.fontLevel = Number.isInteger(obj.fontLevel)
          ? Math.max(0, Math.min(SafetyManager.FONT_SCALES.length - 1, obj.fontLevel as number))
          : 1;
        this.hearingPassed = (obj.hearingPassed as boolean) ?? false;
        this.hearingScreened = (obj.hearingScreened as boolean) ?? false;
        this.dailyMinutes = (obj.dailyMinutes as number) ?? 0;
        this.dailyDate = (obj.dailyDate as string) ?? "";
      }
    } catch { /* 数据损坏时用默认值 */ }
    this.checkDailyReset();
  }
}

export const safety = new SafetyManager();
