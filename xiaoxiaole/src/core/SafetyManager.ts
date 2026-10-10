/**
 * 安全管理器 — spec v1.1 第 7.2/7.3/7.4 节
 * 听力筛查门 / 视觉安全 / 会话上限与疲劳熔断
 *
 * 修复要点：
 * - dailyMinutes 现在会在会话结束时真正累加并落盘，「单日 40 分钟」上限才生效
 * - hearingPassed 变更后立即持久化，刷新页面无需重做听力筛查
 * - 新增 assertTapSize：把 GAME_CONFIG.minTapSize 变成真实校验而非装饰配置
 */

import { GAME_CONFIG } from "./GameConfig";

/** 一套配色令牌，标准模式与高对比模式各一套 */
export interface Palette {
  /** 浅色页面背景 */
  bg: string;
  /** 深色页面背景（如首页/家属页） */
  bgDeep: string;
  /** 卡片底 */
  card: string;
  /** 主文字 */
  text: string;
  /** 次要/说明文字 */
  sub: string;
  /** 主题强调色 */
  primary: string;
  /** 描边/分隔线 */
  border: string;
  /** 主题色上的反白文字 */
  onPrimary: string;
}

export class SafetyManager {
  private sessionStart: number = 0;
  private dailyMinutes: number = 0;
  private dailyDate: string = "";
  private reducedMotion: boolean = GAME_CONFIG.reducedMotionDefault;
  private soundEnabled: boolean = true;
  /** 字号档位索引（0=标准 1=大 2=超大），默认「大」——适老化首屏即可读 */
  private fontLevel: number = 1;
  /** 语音播报开关（适老化：默认开启，朗读教程/结算/说明） */
  private speechEnabled: boolean = true;
  /** 语速档位索引（0=慢 1=中 2=快），默认「中」 */
  private speechRateLevel: number = 1;
  /** 高对比模式开关（深底亮字，提升可读性） */
  private highContrast: boolean = false;
  /** 陪伴角色「小园」开关（默认开启；长辈可在设置里关掉陪伴气泡） */
  private companionEnabled: boolean = true;
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

  /** 是否已完成过筛查（未通过则走视觉替代路径，不反复弹筛查页） */
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

  // === 语音播报（适老化：读出教程/结算/说明） ===

  /** 语音播报开关 */
  isSpeechEnabled(): boolean { return this.speechEnabled; }

  setSpeechEnabled(v: boolean): void {
    this.speechEnabled = v;
    this.save();
  }

  /** 语速三档：慢 0.8 / 中 1.0 / 快 1.2 */
  static readonly SPEECH_RATES = [0.8, 1.0, 1.2];
  static readonly SPEECH_RATE_LABELS = ["慢", "中", "快"];

  /** 当前语速档位索引（0/1/2），越界回落「中」 */
  getSpeechRateLevel(): number {
    if (this.speechRateLevel < 0 || this.speechRateLevel >= SafetyManager.SPEECH_RATES.length) return 1;
    return this.speechRateLevel;
  }

  setSpeechRateLevel(v: number): void {
    const max = SafetyManager.SPEECH_RATES.length - 1;
    this.speechRateLevel = Math.max(0, Math.min(max, Math.round(v)));
    this.save();
  }

  /** 当前语速倍率（供 speech.speak 使用） */
  getSpeechRate(): number {
    return SafetyManager.SPEECH_RATES[this.getSpeechRateLevel()] ?? 1.0;
  }

  // === 高对比模式（深底亮字，提升可读性） ===

  isHighContrast(): boolean { return this.highContrast; }

  setHighContrast(v: boolean): void {
    this.highContrast = v;
    this.save();
  }

  /** 陪伴角色「小园」开关 */
  isCompanionEnabled(): boolean {
    return this.companionEnabled;
  }

  setCompanionEnabled(v: boolean): void {
    this.companionEnabled = v;
    this.save();
  }

  /** 配色面板：标准 / 高对比 两套，供场景按需取用 */
  static readonly PALETTE_STD: Palette = {
    bg: "#FFFDF8",
    bgDeep: "#16213E",
    card: "#FFFFFF",
    text: "#2A2A33",
    sub: "#6B6B78",
    primary: "#FF6B9D",
    border: "#E5E5EA",
    onPrimary: "#FFFFFF",
  };

  static readonly PALETTE_HC: Palette = {
    bg: "#000000",
    bgDeep: "#000000",
    card: "#0B0B0B",
    text: "#FFFFFF",
    sub: "#FFE66D",
    primary: "#FFE66D",
    border: "#FFFFFF",
    onPrimary: "#000000",
  };

  /** 当前应使用的配色面板（受高对比开关控制） */
  getPalette(): Palette {
    return this.highContrast ? SafetyManager.PALETTE_HC : SafetyManager.PALETTE_STD;
  }

  // === 适老化字号（全局缩放，一处改动全站生效） ===

  /** 三档倍率：标准 1.0 / 大 1.2 / 超大 1.4 */
  static readonly FONT_SCALES = [1.0, 1.2, 1.4];
  static readonly FONT_LABELS = ["标准", "大", "超大"];

  /** 当前档位索引（0/1/2），数据越界时回落到默认档 */
  getFontLevel(): number {
    if (this.fontLevel < 0 || this.fontLevel >= SafetyManager.FONT_SCALES.length) return 1;
    return this.fontLevel;
  }

  setFontLevel(v: number): void {
    const max = SafetyManager.FONT_SCALES.length - 1;
    this.fontLevel = Math.max(0, Math.min(max, Math.round(v)));
    this.save();
  }

  /** 全局字号倍率，供 GameCanvas.drawText 统一应用 */
  getFontScale(): number {
    return SafetyManager.FONT_SCALES[this.getFontLevel()] ?? 1.2;
  }

  // === 7.3 视觉安全校验（把配置项变成真实检查而非装饰） ===

  /** 闪烁频率是否安全（≤2Hz） */
  isFlashSafe(hz: number): boolean { return hz <= GAME_CONFIG.maxFlashHz; }

  /**
   * 校验动效频率是否超过安全上限。同一个 tag 只告警一次。
   * 所有呼吸灯/闪烁都必须经过这里，否则「≤2Hz」只是文档上的承诺。
   */
  assertSafeHz(hz: number, tag: string): boolean {
    const ok = this.isFlashSafe(hz);
    if (!ok && !this.warnedTapTargets.has(tag)) {
      this.warnedTapTargets.add(tag);
      console.warn(`[a11y] 动效 "${tag}" 频率 ${hz}Hz 超过上限 ${GAME_CONFIG.maxFlashHz}Hz`);
    }
    return ok;
  }

  /** sRGB 相对亮度（WCAG 2.1） */
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

  /** 对比度（WCAG 2.1）：返回 1..21 */
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

  /**
   * 校验前景/背景对比度是否达到 WCAG AA。同一个 tag 只告警一次。
   * 启动时对主色板做一次审计，保证「minContrastRatio」真正被检查。
   */
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

  /** 降级特效：降低动效模式下用静态替代 */
  getEffectMode(): "full" | "reduced" {
    return this.reducedMotion ? "reduced" : "full";
  }

  /**
   * 校验可点击区是否达到适老化下限（44×44）。
   * 同一个 tag 只告警一次，避免刷屏。
   */
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

  // === 音频解锁（iOS/Safari 需用户手势内 resume） ===

  registerAudioUnlock(fn: () => void): void {
    if (this.audioUnlocked) {
      fn();
      return;
    }
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

  /** 会话结束：把本次时长计入当日累计并落盘 */
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

  /** 今日已累计游玩分钟（含进行中的本次会话） */
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

  /** 疲劳熔断检测：连续 N 步反应时劣化超过阈值 */
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
      localStorage.setItem("bg_safety", JSON.stringify({
        reducedMotion: this.reducedMotion,
        soundEnabled: this.soundEnabled,
        fontLevel: this.fontLevel,
        speechEnabled: this.speechEnabled,
        speechRateLevel: this.speechRateLevel,
        highContrast: this.highContrast,
        companionEnabled: this.companionEnabled,
        hearingPassed: this.hearingPassed,
        hearingScreened: this.hearingScreened,
        dailyMinutes: this.dailyMinutes,
        dailyDate: this.dailyDate,
      }));
    } catch { /* 隐私模式下滑默 */ }
  }

  load(): void {
    try {
      const data = localStorage.getItem("bg_safety");
      if (data) {
        const obj = JSON.parse(data) as Record<string, unknown>;
        this.reducedMotion = (obj.reducedMotion as boolean) ?? GAME_CONFIG.reducedMotionDefault;
        this.soundEnabled = (obj.soundEnabled as boolean) ?? true;
        // 未存过字号档位的老用户默认给「大」档（适老化），越界值也回落默认档
        this.fontLevel = Number.isInteger(obj.fontLevel)
          ? Math.max(0, Math.min(SafetyManager.FONT_SCALES.length - 1, obj.fontLevel as number))
          : 1;
        // 语音播报默认开启（适老化友好）；语速默认「中」；高对比默认关
        this.speechEnabled = (obj.speechEnabled as boolean) ?? true;
        this.speechRateLevel = Number.isInteger(obj.speechRateLevel)
          ? Math.max(0, Math.min(SafetyManager.SPEECH_RATES.length - 1, obj.speechRateLevel as number))
          : 1;
        this.highContrast = (obj.highContrast as boolean) ?? false;
        // 陪伴角色默认开启；老存档缺字段时回落到开启
        this.companionEnabled = (obj.companionEnabled as boolean) ?? true;
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
