/**
 * AudioSynth — 轻量程序合成音效引擎（适老化可静音）
 * 仅依赖 WebAudio；提供与消消乐一致的公共 API：playUi / play / unlock / playPureTone / playTone / playInterference。
 */

import { safety } from "../core/SafetyManager";

export type UiSound =
  | "match" | "combo" | "invalid" | "button" | "item" | "win" | "fail" | "star";

export type SoundType = string;

class AudioSynth {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  unlock(): void {
    try { this.getCtx(); } catch { /* 不支持 WebAudio 时静默忽略 */ }
  }

  private canPlay(): boolean { return safety.isSoundEnabled(); }

  playUi(kind: UiSound, variant: number = 0): void {
    if (!this.canPlay()) return;
    if (safety.getEffectMode() === "reduced") { this.tone([440], 0.12, "sine", 0.05); return; }
    switch (kind) {
      case "match":   this.tone([784, 1047], 0.16, "triangle", 0.10); break;
      case "combo": {
        const base = 659 * Math.pow(1.122, Math.min(14, Math.max(0, variant - 1)));
        this.tone([base, base * 1.5], 0.2, "triangle", 0.12);
        break;
      }
      case "invalid": this.tone([262, 247], 0.12, "sine", 0.07); break;
      case "button":  this.tone([880], 0.06, "sine", 0.06); break;
      case "item":    this.tone([660, 880, 1320], 0.14, "triangle", 0.09); break;
      case "win":     this.tone([523, 659, 784, 1047], 0.34, "triangle", 0.11); break;
      case "fail":    this.tone([392, 330], 0.36, "sine", 0.09); break;
      case "star":    this.tone([784, 988, 1175].slice(0, Math.max(1, variant)), 0.3, "triangle", 0.1); break;
    }
  }

  /** 环境/通用声音（方块锁定、消行等），最简合成；不受静音外的限制 */
  play(id: string, duration: number = 0.2): void {
    if (!this.canPlay()) return;
    const map: Record<string, number[]> = {
      lock: [330],
      clear: [659, 880],
      levelup: [523, 784, 1047],
      rotate: [520],
      move: [392],
      gameover: [330, 262, 196],
    };
    const freqs = map[id] ?? [440];
    this.tone(freqs, duration, "triangle", 0.1);
  }

  private tone(freqs: number[], duration: number, type: OscillatorType, peak: number): void {
    let ctx: AudioContext;
    try { ctx = this.getCtx(); } catch { return; }
    const now = ctx.currentTime;
    freqs.forEach((freq, i) => {
      const start = now + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  }

  playPureTone(freq: number, duration: number = 1.5): void {
    let ctx: AudioContext;
    try { ctx = this.getCtx(); } catch { return; }
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch { /* 不支持 WebAudio 时静默降级 */ }
  }

  playTone(freq: number, dur: number = 0.45): void {
    if (!this.canPlay()) return;
    let ctx: AudioContext;
    try { ctx = this.getCtx(); } catch { return; }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playInterference(duration: number): void {
    if (!this.canPlay()) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const size = Math.max(1, ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
  }

  destroy(): void {
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
  }
}

export const audioSynth = new AudioSynth();
safety.registerAudioUnlock(() => audioSynth.unlock());
