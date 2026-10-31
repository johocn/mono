/**
 * 音效与 BGM：真实音频资产优先，缺失时回退程序化合成（WebAudio 振荡器）。
 * - 音效：public/audio/sfx_<name>.wav（自生成 CC0 资产，可替换为 Freesound/OpenGameArt 的 CC0 素材）
 * - BGM：public/audio/bgm_<theme>.wav（国风五声音阶循环），缺失则程序化 tickBgm 兜底
 * 任何环境不支持时静默降级，绝不影响游戏逻辑。
 */
type BgmTheme = "title" | "explore" | "battle" | "boss";

export class Sfx {
  private ctx: any = null;
  muted = false;
  private bgmTheme: BgmTheme = "explore";
  private bgmStep = 0;
  private bgmTimer = 0;
  private loaded = false;
  private buffers = new Map<string, AudioBuffer>();
  private bgmBuffers = new Map<BgmTheme, AudioBuffer>();
  private bgmSource: any = null;

  /** 程序化 BGM：四个主题各有根音/和弦进行/节奏/波形（帧驱动，不用 setInterval） */
  private readonly bgmThemes: Record<BgmTheme, { root: number; prog: number[]; beat: number; type: any }> = {
    title: { root: 220, prog: [0, 5, 7, 5], beat: 0.5, type: "triangle" },
    explore: { root: 196, prog: [0, 4, 7, 9], beat: 0.42, type: "sine" },
    battle: { root: 165, prog: [0, 7, 3, 7], beat: 0.26, type: "sawtooth" },
    boss: { root: 110, prog: [0, 1, 7, 6], beat: 0.3, type: "sawtooth" },
  };

  private ensure(): any {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch?.(() => {});
    if (!this.loaded) {
      this.loaded = true;
      this.loadAudioAssets().catch?.(() => {});
    }
    return this.ctx;
  }

  // ================= 音频资产加载 =================
  private async fetchBuffer(url: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(arr);
    } catch {
      return null;
    }
  }

  /** 预加载真实音频资产（首次 ensure 触发，fire-and-forget；失败静默回退合成） */
  async loadAudioAssets(): Promise<void> {
    const names = [
      "click", "hit", "crit", "block", "parry", "miss", "heal", "pickup", "cast", "levelup",
      "die", "boss", "forgeOk", "forgeFail", "combo", "achievement", "brk", "exec", "shock",
      "vapor", "melt", "superc", "crystal", "overload", "freeze", "shatter", "phase",
    ];
    await Promise.all(names.map(async (n) => {
      const b = await this.fetchBuffer(`audio/sfx_${n}.wav`);
      if (b) this.buffers.set(n, b);
    }));
    for (const t of ["title", "explore", "battle", "boss"] as BgmTheme[]) {
      const b = await this.fetchBuffer(`audio/bgm_${t}.wav`);
      if (b) this.bgmBuffers.set(t, b);
    }
  }

  // ================= 基础合成（兜底） =================
  private beep(freq: number, dur: number, type: any = "square", vol = 0.05, slide = 0, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch {
      /* 忽略音频异常 */
    }
  }

  // ================= 真实优先分发 =================
  private play(name: string, vol = 1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const b = this.buffers.get(name);
    if (b) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = b;
        const g = ctx.createGain();
        g.gain.value = vol;
        src.connect(g).connect(ctx.destination);
        src.start();
        return;
      } catch {
        /* fallthrough to synth */
      }
    }
    this.synth(name, vol);
  }

  /** 程序化合成兜底：与原振荡器逻辑一致 */
  private synth(name: string, vol = 1): void {
    switch (name) {
      case "click": this.beep(880, 0.06, "square", 0.03 * vol); break;
      case "hit": this.beep(220, 0.08, "sawtooth", 0.05 * vol, -120); break;
      case "crit": this.beep(680, 0.12, "square", 0.06 * vol, 220); break;
      case "block": this.beep(150, 0.1, "square", 0.05 * vol, -50); break;
      case "parry": this.beep(1040, 0.12, "square", 0.06 * vol, 320); break;
      case "miss": this.beep(320, 0.08, "sine", 0.03 * vol, -140); break;
      case "heal": this.beep(720, 0.16, "sine", 0.045 * vol, 260); break;
      case "pickup": this.beep(980, 0.06, "triangle", 0.04 * vol, 220); break;
      case "cast": this.beep(520, 0.18, "sine", 0.05 * vol, 260); break;
      case "levelup": this.beep(440, 0.25, "triangle", 0.06 * vol, 330); break;
      case "die": this.beep(160, 0.35, "sawtooth", 0.06 * vol, -100); break;
      case "boss": this.beep(90, 0.5, "sawtooth", 0.08 * vol, -40); break;
      case "forgeOk": this.beep(520, 0.2, "triangle", 0.05 * vol, 340); break;
      case "forgeFail": this.beep(180, 0.22, "sawtooth", 0.05 * vol, -90); break;
      case "combo": this.beep(840, 0.1, "triangle", 0.05 * vol, 280); break;
      case "achievement":
        this.beep(660, 0.12, "triangle", 0.05 * vol, 0, 0);
        this.beep(880, 0.12, "triangle", 0.05 * vol, 0, 0.1);
        this.beep(1046, 0.18, "triangle", 0.055 * vol, 0, 0.2);
        break;
      case "brk":
        this.beep(170, 0.12, "square", 0.06 * vol, -120);
        this.beep(1200, 0.06, "square", 0.04 * vol, 240, 0.02);
        break;
      case "exec":
        this.beep(330, 0.18, "sawtooth", 0.06 * vol, -160);
        this.beep(660, 0.24, "square", 0.06 * vol, 300, 0.07);
        this.beep(990, 0.2, "triangle", 0.05 * vol, 0, 0.16);
        break;
      case "shock":
        this.beep(1500, 0.08, "square", 0.05 * vol, -1000);
        this.beep(820, 0.07, "sawtooth", 0.04 * vol, 500, 0.01);
        break;
      case "vapor":
        this.beep(1600, 0.1, "sine", 0.04 * vol, -700);
        this.beep(900, 0.08, "sine", 0.03 * vol, -400, 0.02);
        break;
      case "melt":
        this.beep(1200, 0.12, "sine", 0.04 * vol, -600);
        this.beep(700, 0.1, "triangle", 0.03 * vol, -300, 0.03);
        break;
      case "superc":
        this.beep(1800, 0.08, "square", 0.05 * vol, -1200);
        this.beep(600, 0.12, "sawtooth", 0.04 * vol, -200, 0.04);
        break;
      case "crystal":
        this.beep(880, 0.1, "triangle", 0.045 * vol, 120, 0);
        this.beep(1320, 0.1, "triangle", 0.04 * vol, 160, 0.06);
        this.beep(1760, 0.14, "sine", 0.04 * vol, 200, 0.12);
        break;
      case "overload":
        this.beep(110, 0.3, "sawtooth", 0.08 * vol, -60);
        this.beep(520, 0.12, "square", 0.05 * vol, -300, 0.02);
        break;
      case "freeze":
        this.beep(2100, 0.1, "triangle", 0.04 * vol, -900);
        this.beep(1500, 0.08, "sine", 0.03 * vol, 300, 0.04);
        break;
      case "shatter":
        this.beep(2600, 0.06, "square", 0.05 * vol, -1500);
        this.beep(900, 0.1, "triangle", 0.04 * vol, -600, 0.03);
        break;
      case "phase":
        this.beep(220, 0.3, "sawtooth", 0.07 * vol, -80);
        this.beep(440, 0.25, "square", 0.05 * vol, 220, 0.05);
        break;
    }
  }

  // ================= 公开音效接口（真实优先） =================
  click(): void { this.play("click"); }
  hit(): void { this.play("hit"); }
  crit(): void { this.play("crit"); }
  block(): void { this.play("block"); }
  parry(): void { this.play("parry"); }
  miss(): void { this.play("miss"); }
  heal(): void { this.play("heal"); }
  pickup(): void { this.play("pickup"); }
  cast(): void { this.play("cast"); }
  levelup(): void { this.play("levelup"); }
  die(): void { this.play("die"); }
  boss(): void { this.play("boss"); }
  forgeOk(): void { this.play("forgeOk"); }
  forgeFail(): void { this.play("forgeFail"); }
  combo(): void { this.play("combo"); }
  achievement(): void { this.play("achievement"); }
  brk(): void { this.play("brk"); }
  exec(): void { this.play("exec"); }
  shock(): void { this.play("shock"); }
  vapor(): void { this.play("vapor"); }
  melt(): void { this.play("melt"); }
  superc(): void { this.play("superc"); }
  crystal(): void { this.play("crystal"); }
  overload(): void { this.play("overload"); }
  freeze(): void { this.play("freeze"); }
  shatter(): void { this.play("shatter"); }
  phase(): void { this.play("phase"); }

  // ================= BGM =================
  /** 切换 BGM 主题（仅在变化时重置步进，可每帧安全调用） */
  setTheme(t: BgmTheme): void {
    if (this.bgmTheme === t) return;
    this.bgmTheme = t;
    this.bgmStep = 0;
    if (this.bgmSource) {
      try { this.bgmSource.stop(); } catch { /* ignore */ }
      this.bgmSource = null;
    }
  }

  /** 帧驱动 BGM：真实循环文件优先，缺失则程序化琶音兜底 */
  tickBgm(dt: number): void {
    if (this.muted) {
      if (this.bgmSource) {
        try { this.bgmSource.stop(); } catch { /* ignore */ }
        this.bgmSource = null;
      }
      return;
    }
    const ctx = this.ensure();
    if (!ctx) return;
    const buf = this.bgmBuffers.get(this.bgmTheme);
    if (buf) {
      if (!this.bgmSource) {
        try {
          const s = ctx.createBufferSource();
          s.buffer = buf;
          s.loop = true;
          const g = ctx.createGain();
          g.gain.value = 0.25;
          s.connect(g).connect(ctx.destination);
          s.start();
          this.bgmSource = s;
        } catch { /* ignore */ }
      }
      return;
    }
    // 程序化兜底
    const th = this.bgmThemes[this.bgmTheme];
    this.bgmTimer -= dt;
    if (this.bgmTimer > 0) return;
    this.bgmTimer += th.beat;
    const deg = th.prog[this.bgmStep % th.prog.length];
    this.bgmStep++;
    const freq = th.root * Math.pow(2, deg / 12);
    this.beep(freq, th.beat * 0.9, th.type, 0.03);
    this.beep(freq / 2, th.beat * 0.9, "sine", 0.022);
  }
}
