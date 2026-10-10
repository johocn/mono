/**
 * AudioSynth — 数据驱动的环境音合成引擎
 *
 * 设计：
 *   - 每种声音由 SoundLibrary 中的「合成配方」声明，这里解释执行 → 无需二进制素材即可运行。
 *   - 若放置真实采样 assets/audio/<id>.mp3(.ogg/.wav)，play() 会优先播放真声（最真实），
 *     缺失时自动回退程序合成 → 「真实素材」为零成本升级路径。
 *   - 已做"拟真增强"：主总线（压缩 + 轻微空间延迟）、随机立体声定位、
 *     噪声空气感层、乐器拨弦瞬态与揉弦颤音、鸟鸣/动物共振峰与气息、人声颤音。
 *   - UI 音效（match/combo/win…）仍走独立合成，保证交互反馈稳定、不被空间效果污染。
 */

import { safety } from "../core/SafetyManager";
import { getSound, type SoundRecipe } from "../config/SoundLibrary";

export type UiSound =
  | "match" | "combo" | "invalid" | "button" | "item" | "win" | "fail" | "star";

/** 兼容旧引用：声音 ID 现在由 SoundLibrary 统一定义（字符串） */
export type SoundType = string;

export class AudioSynth {
  private ctx: AudioContext | null = null;
  /** 已加载的真实采样（优先于程序合成） */
  private samples: Record<string, AudioBuffer> = {};
  /** 已确认无采样的 ID，避免重复 404 请求 */
  private sampleChecked: Record<string, boolean> = {};
  /** 主输出总线（压缩 + 轻微空间延迟），环境音经此输出，更"润"不干涩 */
  private masterBus: GainNode | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** 懒初始化主总线：动态压缩 + 反馈延迟（轻微空间感），避免合成音"干、硬" */
  private getMasterBus(): AudioNode {
    const ctx = this.getCtx();
    if (!this.masterBus) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 3;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;

      const delay = ctx.createDelay(0.12);
      delay.delayTime.value = 0.045;
      const fb = ctx.createGain();
      fb.gain.value = 0.18;
      const wet = ctx.createGain();
      wet.gain.value = 0.12;

      delay.connect(fb);
      fb.connect(delay);
      const wetSum = ctx.createGain();
      wetSum.gain.value = 1;
      delay.connect(wet);
      wet.connect(wetSum);

      const out = ctx.createGain();
      out.gain.value = 1;
      comp.connect(out);
      wetSum.connect(out);
      out.connect(ctx.destination);

      const input = ctx.createGain();
      input.gain.value = 1;
      input.connect(comp);
      input.connect(delay);

      this.masterBus = input;
    }
    return this.masterBus;
  }

  /** 环境音统一出口：随机轻微立体声定位，再送入主总线（更自然的空间分布） */
  private connectOut(node: AudioNode): void {
    const ctx = this.getCtx();
    const panner = ctx.createStereoPanner();
    panner.pan.value = (Math.random() * 2 - 1) * 0.3;
    node.connect(panner);
    panner.connect(this.getMasterBus());
  }

  /** 短促噪声瞬态（用于乐器拨/击的"触感"起始） */
  private noiseBurst(start: number, durMs: number, freq: number, peak: number, dest: AudioNode): void {
    const ctx = this.getCtx();
    const len = Math.max(1, Math.floor(ctx.sampleRate * durMs / 1000));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.0008, start + durMs / 1000);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(start);
    src.stop(start + durMs / 1000 + 0.01);
  }

  unlock(): void {
    try { this.getCtx(); } catch { /* 不支持 WebAudio 时静默忽略 */ }
  }

  private canPlay(): boolean {
    return safety.isSoundEnabled();
  }

  // === 环境音（按 SoundLibrary 配方） ===

  /** 播放指定声音；优先真实采样，否则程序合成，并后台尝试加载采样供下次使用 */
  play(id: string, duration: number = 2): void {
    if (!this.canPlay()) return;
    const sample = this.samples[id];
    if (sample) { this.playSample(sample); return; }
    const def = getSound(id);
    this.synthRecipe(def.recipe, duration);
    this.ensureSample(id);
  }

  private ensureSample(id: string): void {
    if (this.sampleChecked[id]) return;
    this.sampleChecked[id] = true;
    const exts = ["mp3", "ogg", "wav"];
    const tryLoad = (i: number): void => {
      if (i >= exts.length) return;
      const url = `assets/audio/${id}.${exts[i]}`;
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error("missing"))))
        .then((ab) => this.getCtx().decodeAudioData(ab))
        .then((dec) => { this.samples[id] = dec; })
        .catch(() => tryLoad(i + 1));
    };
    tryLoad(0);
  }

  private playSample(buf: AudioBuffer): void {
    const ctx = this.getCtx();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  // === 配方解释器 ===

  private synthRecipe(r: SoundRecipe, dur: number): void {
    switch (r.kind) {
      case "noise":  this.synthNoise(r, dur); break;
      case "tone":   this.synthTone(r, dur); break;
      case "chirp":  this.synthChirp(r, dur); break;
      case "animal": this.synthAnimal(r, dur); break;
      case "rhythm": this.synthRhythm(r, dur); break;
      case "voice":  this.synthVoice(r, dur); break;
    }
  }

  /** 噪声类：白噪声 + 滤波 + 空气感层 + 柔化包络 + 起伏/扫频/缓起缓落 */
  private synthNoise(r: Extract<SoundRecipe, { kind: "noise" }>, dur: number): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const size = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = r.filter;
    filter.frequency.setValueAtTime(r.freq, now);
    if (r.sweepTo) filter.frequency.linearRampToValueAtTime(r.sweepTo, now + dur);
    filter.Q.value = r.q ?? 1;

    const gain = ctx.createGain();
    const peak = 0.22;
    if (r.swell) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + dur * 0.3);
      gain.gain.setValueAtTime(peak, now + dur * 0.7);
      gain.gain.linearRampToValueAtTime(0, now + dur);
    } else {
      // 柔化起停，避免"咔哒"硬边
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.04);
      gain.gain.linearRampToValueAtTime(peak * 0.8, now + dur * 0.6);
      gain.gain.linearRampToValueAtTime(0, now + dur);
    }

    // 空气感层：高频带通噪声，模拟雨丝/溪流/落叶的"嘶嘶"质感
    const air = ctx.createBufferSource();
    air.buffer = buffer;
    const airF = ctx.createBiquadFilter();
    airF.type = "bandpass";
    airF.frequency.value = Math.min(8000, (r.freq * 3) || 3000);
    airF.Q.value = 0.7;
    const airG = ctx.createGain();
    airG.gain.value = 0.05;

    src.connect(filter);
    filter.connect(gain);
    air.connect(airF);
    airF.connect(airG);

    if (r.ripple) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = r.ripple;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.08;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start(now);
      lfo.stop(now + dur);
    }

    const sum = ctx.createGain();
    sum.gain.value = 1;
    gain.connect(sum);
    airG.connect(sum);
    this.connectOut(sum);

    src.start(now);
    src.stop(now + dur);
    air.start(now);
    air.stop(now + dur);
  }

  /** 音调类：基频 + 谐波 + 低通柔化 + 拨弦瞬态 + 揉弦颤音（钟/铃/笛/乐器） */
  private synthTone(r: Extract<SoundRecipe, { kind: "tone" }>, dur: number): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const strikes = r.strikes ?? 1;
    const strikeDur = dur / strikes;
    const harmonics = r.harmonics ?? [1];
    const type = r.type ?? "sine";
    const decay = r.decay ?? 0.3;

    const body = ctx.createGain();
    body.gain.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(12000, r.freq * 8);
    lp.Q.value = 0.5;
    body.connect(lp);

    // 持续音加揉弦颤音（长衰减的笛/琴/弦）
    let vibGain: GainNode | null = null;
    if (decay >= 0.5) {
      const vibLfo = ctx.createOscillator();
      vibLfo.frequency.value = 5.5;
      vibGain = ctx.createGain();
      vibGain.gain.value = r.freq * 0.012;
      vibLfo.connect(vibGain);
      vibLfo.start(now);
      vibLfo.stop(now + dur);
    }

    for (let s = 0; s < strikes; s++) {
      const start = now + s * strikeDur;
      harmonics.forEach((h, idx) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = r.freq * h;
        if (vibGain) vibGain.connect(osc.frequency);
        const g = ctx.createGain();
        const peak = 0.16 / (idx + 1);
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(peak, start + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, start + decay);
        osc.connect(g);
        g.connect(body);
        osc.start(start);
        osc.stop(start + decay + 0.02);
      });
      // 拨/击瞬态： struck 乐器（长衰减）加一记短促"触感"起始
      if (decay >= 0.5) {
        this.noiseBurst(start, 18, Math.min(6000, r.freq * 4), 0.06, body);
      }
    }
    this.connectOut(lp);
  }

  /** 啁啾类：多个短促滑音音符 + 共振峰 + 气息噪声 + 颤音（鸟鸣） */
  private synthChirp(r: Extract<SoundRecipe, { kind: "chirp" }>, dur: number): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const count = r.count;
    const chirpDur = dur / count;
    const type = r.type ?? "square";

    // 气息层：整段轻噪声，模拟鸟鸣的"气声"
    const breathSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const bbuf = ctx.createBuffer(1, breathSize, ctx.sampleRate);
    const bd = bbuf.getChannelData(0);
    for (let i = 0; i < breathSize; i++) bd[i] = (Math.random() * 2 - 1) * 0.15;
    const breathSrc = ctx.createBufferSource();
    breathSrc.buffer = bbuf;
    const breathF = ctx.createBiquadFilter();
    breathF.type = "highpass";
    breathF.frequency.value = 2000;
    const breathG = ctx.createGain();
    breathG.gain.value = 0.03;
    breathSrc.connect(breathF);
    breathF.connect(breathG);
    this.connectOut(breathG);
    breathSrc.start(now);
    breathSrc.stop(now + dur);

    for (let i = 0; i < count; i++) {
      const start = now + i * chirpDur;
      const noteLen = chirpDur * 0.7; // 留小间隙，更像真实鸟叫的断奏
      const f0 = r.base + (Math.random() * 2 - 1) * r.spread * 0.3;
      const f1 = r.up ? f0 * 1.25 : f0 * 0.75;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.linearRampToValueAtTime(f1, start + noteLen * 0.6);
      // 共振峰：让鸟鸣更有"口腔"质感而非纯电子音
      const formant = ctx.createBiquadFilter();
      formant.type = "bandpass";
      formant.frequency.value = f0 * 1.5;
      formant.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.15, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, start + noteLen);
      if (r.lfo) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = r.lfo;
        const lg = ctx.createGain();
        lg.gain.value = 50;
        lfo.connect(lg);
        lg.connect(osc.frequency);
        lfo.start(start);
        lfo.stop(start + noteLen);
      }
      osc.connect(formant);
      formant.connect(g);
      this.connectOut(g);
      osc.start(start);
      osc.stop(start + noteLen);
    }
  }

  /** 动物类：基频滑音 + 共振峰带通 + 气息噪声 + 颤音（叫声质感） */
  private synthAnimal(r: Extract<SoundRecipe, { kind: "animal" }>, dur: number): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const pulses = r.pulses ?? 3;
    const gap = r.gap ?? 0.2;
    const type = r.type ?? "square";
    const pulseLen = Math.min(0.25, dur / pulses - gap * 0.3);

    for (let i = 0; i < pulses; i++) {
      const start = now + i * (pulseLen + gap);
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(r.base, start);
      osc.frequency.linearRampToValueAtTime(r.base * 1.15, start + pulseLen * 0.4);
      osc.frequency.linearRampToValueAtTime(r.base * 0.9, start + pulseLen);

      const formant = ctx.createBiquadFilter();
      formant.type = "bandpass";
      formant.frequency.value = r.formant;
      formant.Q.value = 5; // 更突出的共振峰 → 更像"发声器官"而非蜂鸣

      // 颤音
      const vibLfo = ctx.createOscillator();
      vibLfo.frequency.value = 7;
      const vibGain = ctx.createGain();
      vibGain.gain.value = r.base * 0.02;
      vibLfo.connect(vibGain);
      vibGain.connect(osc.frequency);
      vibLfo.start(start);
      vibLfo.stop(start + pulseLen);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.2, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + pulseLen);
      osc.connect(formant);
      formant.connect(g);
      this.connectOut(g);
      osc.start(start);
      osc.stop(start + pulseLen);

      // 气息噪声：每个脉冲带一点"呼气"质感
      this.noiseBurst(start, pulseLen * 1000, r.formant, 0.04, g);
    }
  }

  /** 节奏类：重复短促事件（鼓/钟表/敲门/车铃/马蹄/快门/咳嗽/拍手） */
  private synthRhythm(r: Extract<SoundRecipe, { kind: "rhythm" }>, dur: number): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const count = r.count;
    const len = r.len;
    const gap = r.gap ?? len * 1.5;
    for (let i = 0; i < count; i++) {
      const start = now + i * (len + gap);
      if (r.mode === "noise") {
        const size = Math.max(1, Math.floor(ctx.sampleRate * len));
        const buf = ctx.createBuffer(1, size, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < size; j++) d[j] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = r.filter ?? 1000;
        f.Q.value = r.q ?? 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.25, start + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, start + len);
        src.connect(f);
        f.connect(g);
        this.connectOut(g);
        src.start(start);
        src.stop(start + len);
      } else {
        const osc = ctx.createOscillator();
        osc.type = r.type ?? "sine";
        osc.frequency.value = r.freq ?? 1000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.2, start + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, start + len);
        osc.connect(g);
        this.connectOut(g);
        osc.start(start);
        osc.stop(start + len);
      }
    }
  }

  /** 人声/语音类：笑/掌声/婴儿啼/口哨/叹气（加颤音与气息） */
  private synthVoice(r: Extract<SoundRecipe, { kind: "voice" }>, dur: number): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    switch (r.variant) {
      case "laugh": {
        const count = 5, gap = 0.12, len = 0.12;
        for (let i = 0; i < count; i++) {
          const start = now + i * (len + gap);
          const f = 220 + (i < 3 ? i * 30 : (count - i) * 30);
          const osc = ctx.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.value = f;
          const formant = ctx.createBiquadFilter();
          formant.type = "bandpass";
          formant.frequency.value = 900;
          formant.Q.value = 3;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, start);
          g.gain.linearRampToValueAtTime(0.18, start + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, start + len);
          osc.connect(formant);
          formant.connect(g);
          this.connectOut(g);
          osc.start(start);
          osc.stop(start + len);
          this.noiseBurst(start, len * 1000, 1200, 0.03, g); // 每声"哈"带气
        }
        break;
      }
      case "applause": {
        const size = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, size, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < size; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1500;
        f.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.18, now + dur * 0.2);
        g.gain.setValueAtTime(0.18, now + dur * 0.7);
        g.gain.linearRampToValueAtTime(0, now + dur);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 8;
        const lg = ctx.createGain();
        lg.gain.value = 0.06;
        lfo.connect(lg);
        lg.connect(g.gain);
        src.connect(f);
        f.connect(g);
        this.connectOut(g); // 立体声定位让掌声更有空间感
        src.start(now);
        src.stop(now + dur);
        lfo.start(now);
        lfo.stop(now + dur);
        break;
      }
      case "baby": {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        const formant = ctx.createBiquadFilter();
        formant.type = "bandpass";
        formant.frequency.value = 1100;
        formant.Q.value = 4;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 6;
        const lg = ctx.createGain();
        lg.gain.value = 60;
        lfo.connect(lg);
        lg.connect(osc.frequency);
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(520, now + dur * 0.5);
        osc.frequency.linearRampToValueAtTime(380, now + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.2, now + 0.05);
        g.gain.setValueAtTime(0.2, now + dur * 0.8);
        g.gain.linearRampToValueAtTime(0, now + dur);
        osc.connect(formant);
        formant.connect(g);
        this.connectOut(g);
        // 哭腔气息
        const ns = ctx.createBufferSource();
        const nsize = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const nbuf = ctx.createBuffer(1, nsize, ctx.sampleRate);
        const nd = nbuf.getChannelData(0);
        for (let i = 0; i < nsize; i++) nd[i] = (Math.random() * 2 - 1) * 0.12;
        ns.buffer = nbuf;
        const nf = ctx.createBiquadFilter();
        nf.type = "bandpass";
        nf.frequency.value = 1100;
        const ng = ctx.createGain();
        ng.gain.value = 0.05;
        ns.connect(nf);
        nf.connect(ng);
        ng.connect(g);
        osc.start(now);
        osc.stop(now + dur);
        lfo.start(now);
        lfo.stop(now + dur);
        ns.start(now);
        ns.stop(now + dur);
        break;
      }
      case "whistle": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = 2500;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 12;
        const lg = ctx.createGain();
        lg.gain.value = 120;
        lfo.connect(lg);
        lg.connect(osc.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.15, now + 0.05);
        g.gain.setValueAtTime(0.15, now + dur * 0.8);
        g.gain.linearRampToValueAtTime(0, now + dur);
        osc.connect(g);
        this.connectOut(g);
        osc.start(now);
        osc.stop(now + dur);
        lfo.start(now);
        lfo.stop(now + dur);
        break;
      }
      case "sigh": {
        // 叹气：下行气声（正弦 + 低通噪声），营造"呼气"质感
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(150, now + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.14, now + 0.1);
        g.gain.linearRampToValueAtTime(0, now + dur);
        osc.connect(g);
        this.connectOut(g);
        const size = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, size, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < size; i++) d[i] = (Math.random() * 2 - 1) * 0.15;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 800;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0, now);
        ng.gain.linearRampToValueAtTime(0.06, now + 0.1);
        ng.gain.linearRampToValueAtTime(0, now + dur);
        src.connect(f);
        f.connect(ng);
        ng.connect(g); // 与气声同位置
        osc.start(now);
        osc.stop(now + dur);
        src.start(now);
        src.stop(now + dur);
        break;
      }
    }
  }

  // === UI 音效 ===

  playUi(kind: UiSound, variant: number = 0): void {
    if (!this.canPlay()) return;
    if (safety.getEffectMode() === "reduced") {
      this.tone([440], 0.12, "sine", 0.05);
      return;
    }
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

  /** 听力筛查纯音测试：播放指定频率的正弦纯音（不受静音开关限制） */
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

  /** 播放干扰音（序列背景，低音量噪声），保持干涩、不经空间效果 */
  playInterference(duration: number): void {
    if (!this.canPlay()) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
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

  /** 空间记忆（Corsi）：播放某格专属音高（柔和正弦，清晰不混空间延迟，适老） */
  playTone(freq: number, dur: number = 0.45): void {
    if (!this.canPlay()) return;
    let ctx: AudioContext;
    try { ctx = this.getCtx(); } catch { return; }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  destroy(): void {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export const audioSynth = new AudioSynth();

safety.registerAudioUnlock(() => audioSynth.unlock());
