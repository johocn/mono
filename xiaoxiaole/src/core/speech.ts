/**
 * 离线中文语音播报 — 浏览器原生 Web Speech API（SpeechSynthesis）
 *
 * 设计要点：
 * - 纯前端、无需后端、无需联网（依赖系统/浏览器自带中文音色）。
 * - 与既有 AudioSynth（音效合成）完全独立，不互相耦合。
 * - 是否真正朗读由调用方把关：需同时满足 safety.isSoundEnabled() && safety.isSpeechEnabled()。
 * - 自动优选 zh-CN / cmn 中文 voice；语速由调用方传入（受「语速」设置控制）。
 */

export interface SpeakOptions {
  /** 语速倍率，默认 1.0；适老化偏慢（如 0.9） */
  rate?: number;
  /** 是否打断上一条（默认 true，避免连环朗读堆叠） */
  interrupt?: boolean;
}

class Speech {
  private synth: SpeechSynthesis | null = null;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
      this.pickVoice();
    }
  }

  private pickVoice(): void {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    this.voice = this.chooseZh(voices);
    // 部分浏览器异步加载音色列表
    if (!voices.length && typeof this.synth.onvoiceschanged !== "undefined") {
      this.synth.onvoiceschanged = () => {
        if (!this.voice) this.voice = this.chooseZh(this.synth!.getVoices());
      };
    }
  }

  private chooseZh(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (!voices.length) return null;
    // 优先精确匹配中文
    return (
      voices.find((v) => /^zh[-_]?CN/i.test(v.lang)) ??
      voices.find((v) => /^zh/i.test(v.lang)) ??
      voices.find((v) => /chinese|中文|普通话|国语/i.test(v.name)) ??
      null
    );
  }

  /** 当前环境是否支持语音合成 */
  isSupported(): boolean {
    return !!this.synth;
  }

  /** 用户手势内调用，解除部分移动端音频限制（SpeechSynthesis 一般无需，但保留以保稳妥） */
  unlock(): void {
    try {
      this.synth?.resume?.();
    } catch {
      /* 忽略 */
    }
  }

  /** 朗读文本 */
  speak(text: string, opts: SpeakOptions = {}): void {
    if (!this.synth || !text) return;
    const rate = opts.rate ?? 1;
    if (opts.interrupt !== false) {
      try { this.synth.cancel(); } catch { /* 忽略 */ }
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    if (this.voice) u.voice = this.voice;
    u.rate = rate;
    u.pitch = 1;
    u.volume = 1;
    try {
      this.synth.speak(u);
    } catch {
      /* 不支持时静默忽略 */
    }
  }

  /** 停止当前朗读 */
  stop(): void {
    try {
      this.synth?.cancel();
    } catch {
      /* 忽略 */
    }
  }
}

export const speech = new Speech();
