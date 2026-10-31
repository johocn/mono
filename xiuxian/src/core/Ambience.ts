import type { ThemeName } from "./IsoMap";

type WeatherKind = "none" | "petals" | "embers" | "snow" | "rain" | "motes" | "stars";

interface ThemeAtmo {
  /** 环境光色调（叠在世界之上、HUD 之下） */
  tint: string;
  /** 色罩不透明度 */
  tintA: number;
  /** 天气类型 */
  weather: WeatherKind;
  /** 天气粒子配色 */
  weatherColor: string;
}

/** 依据 IsoMap 七主题推导环境光色调与天气（国风意象，纯代码、零美术资产） */
const ATMO: Record<ThemeName, ThemeAtmo> = {
  yunhai: { tint: "#bcd4ff", tintA: 0.10, weather: "motes", weatherColor: "#fff0b0" },
  taohua: { tint: "#ffd6e8", tintA: 0.12, weather: "petals", weatherColor: "#ffc0d8" },
  moyuan: { tint: "#5a1030", tintA: 0.22, weather: "embers", weatherColor: "#ff7a3c" },
  shuimo: { tint: "#c8d2dc", tintA: 0.10, weather: "motes", weatherColor: "#eaf2ff" },
  xingkong: { tint: "#0a1430", tintA: 0.26, weather: "stars", weatherColor: "#cfe0ff" },
  qingyu: { tint: "#9fc6c2", tintA: 0.10, weather: "rain", weatherColor: "#bfe6e2" },
  yunhuang: { tint: "#e7c98a", tintA: 0.12, weather: "motes", weatherColor: "#fff0c0" },
};

interface P { s: any; x: number; y: number; vx: number; vy: number; a: number; ph: number; }

interface WeatherCfg { n: number; sz: number; vy: number; vx: number; a: number; }

/** 环境光 + 天气氛围层：屏幕空间叠在世界之上、HUD 之下；随主题切换色调与天气 */
export class Ambience {
  private tint = new Laya.Sprite();
  private weather = new Laya.Sprite();
  private w = 0;
  private h = 0;
  private parts: P[] = [];
  private kind: WeatherKind = "none";
  private color = "#ffffff";
  private t = 0;
  private active = false;
  private tintColor = "#000000";
  private tintAlpha = 0;

  /** 把两层挂到 uiRoot 靠前位置（世界之上、HUD 之下） */
  attach(uiRoot: any): void {
    uiRoot.addChild(this.tint);
    uiRoot.addChild(this.weather);
    this.tint.visible = false;
    this.weather.visible = false;
  }

  setTheme(name: ThemeName): void {
    const a = ATMO[name];
    if (!a) return;
    this.active = true;
    this.tintColor = a.tint;
    this.tintAlpha = a.tintA;
    this.tint.visible = a.tintA > 0;
    this.tint.alpha = a.tintA;
    this.redrawTint();
    this.kind = a.weather;
    this.color = a.weatherColor;
    this.rebuildWeather();
    this.weather.visible = this.kind !== "none" && this.active;
  }

  /** 回标题/非战斗场景时关闭氛围 */
  clear(): void {
    this.active = false;
    this.tint.visible = false;
    this.weather.visible = false;
    this.kind = "none";
    for (const p of this.parts) this.weather.removeChild(p.s);
    this.parts = [];
    this.weather.graphics.clear();
  }

  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.redrawTint();
  }

  update(dt: number): void {
    if (!this.active || this.kind === "none") return;
    this.t += dt;
    for (const p of this.parts) {
      if (this.kind === "stars") {
        p.s.alpha = p.a * (0.35 + 0.65 * Math.abs(Math.sin(this.t * 1.6 + p.ph)));
        continue;
      }
      const sway = this.kind === "petals" || this.kind === "snow" ? Math.sin(this.t * 1.2 + p.ph) * 10 : 0;
      p.x += (p.vx + sway) * dt;
      p.y += p.vy * dt;
      if (p.y > this.h + 24) { p.y = -24; p.x = Math.random() * this.w; }
      if (p.y < -24) { p.y = this.h + 24; p.x = Math.random() * this.w; }
      if (p.x < -24) p.x = this.w + 24;
      if (p.x > this.w + 24) p.x = -24;
      p.s.pos(p.x, p.y);
      if (this.kind === "embers" || this.kind === "motes") {
        p.s.alpha = p.a * (0.5 + 0.5 * Math.sin(this.t * 2 + p.ph));
      }
    }
  }

  private redrawTint(): void {
    const g = this.tint.graphics;
    g.clear();
    if (this.active && this.tintAlpha > 0 && this.w > 0 && this.h > 0) {
      g.drawRect(0, 0, this.w, this.h, this.tintColor);
    }
  }

  private rebuildWeather(): void {
    for (const p of this.parts) this.weather.removeChild(p.s);
    this.parts = [];
    this.weather.graphics.clear();
    if (this.kind === "none") return;
    const cfg: Record<WeatherKind, WeatherCfg> = {
      none: { n: 0, sz: 0, vy: 0, vx: 0, a: 0 },
      motes: { n: 26, sz: 2.4, vy: 8, vx: 10, a: 0.55 },
      petals: { n: 34, sz: 3.4, vy: 46, vx: 6, a: 0.85 },
      embers: { n: 30, sz: 2.6, vy: -28, vx: 6, a: 0.75 },
      snow: { n: 42, sz: 2.6, vy: 38, vx: 4, a: 0.85 },
      rain: { n: 54, sz: 14, vy: 360, vx: -36, a: 0.5 },
      stars: { n: 52, sz: 1.8, vy: 0, vx: 0, a: 0.8 },
    };
    const c = cfg[this.kind];
    for (let i = 0; i < c.n; i++) {
      const s = new Laya.Sprite();
      const g = s.graphics;
      if (this.kind === "rain") {
        // 带轻微斜度的雨丝
        g.drawLine(0, 0, (c.vx * c.sz) / c.vy, c.sz, this.color, 1.6);
      } else {
        g.drawCircle(0, 0, c.sz, this.color);
      }
      const x = Math.random() * this.w;
      const y = Math.random() * this.h;
      s.pos(x, y);
      const a = c.a * (0.7 + Math.random() * 0.3);
      s.alpha = a;
      this.weather.addChild(s);
      this.parts.push({
        s, x, y,
        vx: c.vx * (0.6 + Math.random() * 0.8),
        vy: c.vy * (0.6 + Math.random() * 0.8),
        a,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }
}
