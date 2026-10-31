/**
 * 过场演出：黑边滑入 + 居中标题卡 + 底部旁白 + 可跳过。
 * 帧驱动纯状态机（in→show→out），无定时器残留；Laya 表现层内聚，便于 Game 直接挂载。
 */
export interface CutsceneSpec {
  /** 主标题（如「第二章 · 乱星海」或 Boss 名） */
  title: string;
  /** 副标题（Boss 称号等，可空） */
  sub?: string;
  /** 旁白多段，逐条推进 */
  lines: string[];
}

type Phase = "idle" | "in" | "show" | "out";

export class Cutscene {
  readonly root: any = new Laya.Sprite();
  active = false;

  private barTop: any;
  private barBot: any;
  private titleText: any;
  private subText: any;
  private lineText: any;

  private spec: CutsceneSpec | null = null;
  private phase: Phase = "idle";
  private t = 0;
  private lineIdx = 0;
  private barH = 0;
  private viewW: number;
  private viewH: number;
  private onDone: (() => void) | null = null;

  constructor(viewW: number, viewH: number) {
    this.viewW = viewW;
    this.viewH = viewH;

    this.barTop = new Laya.Sprite();
    this.barBot = new Laya.Sprite();
    this.root.addChild(this.barTop);
    this.root.addChild(this.barBot);

    this.titleText = new Laya.Text();
    this.titleText.fontSize = 34;
    this.titleText.bold = true;
    this.titleText.color = "#f5efe0";
    this.titleText.align = "center";
    this.titleText.width = viewW;
    this.titleText.height = 48;
    this.titleText.alpha = 0;
    this.root.addChild(this.titleText);

    this.subText = new Laya.Text();
    this.subText.fontSize = 16;
    this.subText.color = "#7fd0e0";
    this.subText.align = "center";
    this.subText.width = viewW;
    this.subText.height = 24;
    this.subText.alpha = 0;
    this.root.addChild(this.subText);

    this.lineText = new Laya.Text();
    this.lineText.fontSize = 15;
    this.lineText.color = "#cdd7e6";
    this.lineText.align = "center";
    this.lineText.width = Math.min(820, viewW - 80);
    this.lineText.height = 64;
    this.lineText.wordWrap = true;
    this.lineText.leading = 6;
    this.lineText.alpha = 0;
    this.root.addChild(this.lineText);

    this.root.visible = false;
    this.root.zOrder = 60; // 盖在所有面板之上
  }

  /** 播放一段过场（onDone 在结束后回调，可空） */
  play(spec: CutsceneSpec, onDone?: () => void): void {
    this.spec = spec;
    this.onDone = onDone || null;
    this.phase = "in";
    this.t = 0;
    this.lineIdx = 0;
    this.titleText.text = spec.title;
    this.subText.text = spec.sub || "";
    this.lineText.text = spec.lines[0] || "";
    this.root.visible = true;
    this.active = true;
  }

  /** 推进到下一段旁白；已是最后一段则结束（滑出） */
  advance(): void {
    if (!this.active || this.phase === "in" || this.phase === "out") return;
    const maxIdx = (this.spec?.lines.length || 1) - 1;
    if (this.lineIdx < maxIdx) {
      this.lineIdx++;
      this.lineText.text = this.spec!.lines[this.lineIdx] || "";
      this.t = 0;
      this.phase = "show";
    } else {
      this.phase = "out";
      this.t = 0;
    }
  }

  /** 跳过（直接滑出结束） */
  skip(): void {
    if (this.active && this.phase !== "out") {
      this.phase = "out";
      this.t = 0;
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const maxBar = this.viewH * 0.16;
    if (this.phase === "in") {
      this.barH = Math.min(maxBar, (this.t / 0.4) * maxBar);
      const a = Math.min(1, this.t / 0.4);
      this.titleText.alpha = a;
      this.subText.alpha = a;
      this.lineText.alpha = a;
      if (this.t >= 0.4) { this.phase = "show"; this.t = 0; }
    } else if (this.phase === "show") {
      this.barH = maxBar;
      this.titleText.alpha = 1;
      this.subText.alpha = 1;
      this.lineText.alpha = Math.min(1, this.t / 0.3);
      if (this.t > 3.2) this.advance(); // 自动推进/结束
    } else if (this.phase === "out") {
      this.barH = Math.max(0, maxBar - (this.t / 0.4) * maxBar);
      const a = Math.max(0, 1 - this.t / 0.4);
      this.titleText.alpha = a;
      this.subText.alpha = a;
      this.lineText.alpha = a;
      if (this.t >= 0.4) { this.finish(); return; }
    }
    this.redraw();
  }

  private redraw(): void {
    const w = this.viewW;
    this.barTop.graphics.clear();
    this.barTop.graphics.drawRect(0, 0, w, this.barH, "#000000", null, 0);
    this.barBot.graphics.clear();
    this.barBot.graphics.drawRect(0, this.viewH - this.barH, w, this.barH, "#000000", null, 0);
    this.titleText.pos((w - this.titleText.width) / 2, this.barH + 22);
    this.subText.pos((w - this.subText.width) / 2, this.barH + 22 + 52);
    this.lineText.pos((w - this.lineText.width) / 2, this.viewH - this.barH - 78);
  }

  private finish(): void {
    this.active = false;
    this.root.visible = false;
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
  }

  /** 画布尺寸变化重排文字宽度 */
  resize(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.titleText.width = viewW;
    this.subText.width = viewW;
    this.lineText.width = Math.min(820, viewW - 80);
  }
}
