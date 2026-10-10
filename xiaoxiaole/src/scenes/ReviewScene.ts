/**
 * ReviewScene — 每日复习会话（间隔复习系统 UI）
 *
 * 不占新玩法，而是把 face / memory 里已练过的「联想条目」按遗忘曲线拉回来巩固。
 * 交互刻意沿用 face 模式的「给画面、点选名字」形式，老人无需再学新操作。
 *
 * 流程：取到期队列（上限 REVIEW_SESSION_LIMIT）→ 逐题：显示图像 + 4 个标签选项
 *      → 点选 → 记住则间隔拉长，忘了则重置 → 全部结束显示小结 → 回主菜单。
 * 适老：点错不责备，直接揭示正确答案；单次题量有上限，避免疲劳。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { NAV_H } from "../ui/SceneChrome";
import { drawWrapped } from "../ui/text";
import { Feedback } from "../ui/Feedback";
import { audioSynth } from "../ui/AudioSynth";
import { drawFace } from "../ui/FaceAvatar";
import { NAME_POOL, ICON_WORD_PAIRS } from "../config/NamePool";
import { COUPLETS } from "../config/LevelGen";
import { SOUND_LIBRARY } from "../config/SoundLibrary";
import { reviews, REVIEW_SESSION_LIMIT, type ReviewItem } from "../core/ReviewStore";

interface OptionRect { x: number; y: number; w: number; h: number; label: string }

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class ReviewScene {
  /** 与其它场景保持一致：直接接收退出回调 */
  private cb: () => void;

  private queue: ReviewItem[] = [];
  private index = 0;
  private remembered = 0;
  private total = 0;

  private options: OptionRect[] = [];
  private answered = false;
  private selected = "";
  private revealTimer = 0;
  private finished = false;
  private doneTimer = 0;

  private feedback = new Feedback();
  private lastFrame = 0;
  private timers: number[] = [];

  constructor(cb: () => void) {
    this.cb = cb;
    this.queue = reviews.getDueQueue(REVIEW_SESSION_LIMIT);
    this.total = this.queue.length;

    audioSynth.unlock();
    if (this.total > 0) this.buildQuestion();

    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
  }

  // === 主循环 ===

  private update(time: number): void {
    const dt = this.lastFrame === 0 ? 0.016 : Math.min((time - this.lastFrame) / 1000, 0.1);
    this.lastFrame = time;
    this.feedback.update(dt);

    if (this.total === 0) {
      this.doneTimer += dt;
      if (this.doneTimer > 1.4) this.exit();
      this.render();
      return;
    }
    if (this.finished) {
      this.doneTimer += dt;
      if (this.doneTimer > 1.6) this.exit();
      this.render();
      return;
    }
    if (this.answered) {
      this.revealTimer -= dt;
      if (this.revealTimer <= 0) this.next();
    }

    this.render();
  }

  // === 题目 ===

  private buildQuestion(): void {
    const cur = this.queue[this.index];
    const pool = cur.kind === "face"
      ? NAME_POOL
      : cur.kind === "couplet"
        ? COUPLETS.map((c) => c.lower)
        : cur.kind === "sound"
          ? SOUND_LIBRARY.map((s) => s.label)
          : ICON_WORD_PAIRS.map((p) => p.label);
    const distractors = shuffle(pool.filter((l) => l !== cur.label)).slice(0, 3);
    this.options = [];
    this.answered = false;
    this.selected = "";
    this.layout(shuffle([cur.label, ...distractors]));
  }

  private next(): void {
    this.index++;
    if (this.index >= this.queue.length) {
      this.finished = true;
      this.doneTimer = 0;
    } else {
      this.buildQuestion();
    }
  }

  private exit(): void {
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
    this.cb();
  }

  // === 输入 ===

  private onTouch(x: number, y: number): void {
    if (this.finished || this.total === 0) {
      this.exit();
      return;
    }
    if (this.answered) return;

    for (const opt of this.options) {
      if (x >= opt.x && x <= opt.x + opt.w && y >= opt.y && y <= opt.y + opt.h) {
        this.handlePick(opt, x, y);
        return;
      }
    }
  }

  private handlePick(opt: OptionRect, x: number, y: number): void {
    const cur = this.queue[this.index];
    const ok = opt.label === cur.label;
    this.selected = opt.label;
    this.answered = true;
    reviews.review(cur.id, ok);
    audioSynth.playUi(ok ? "win" : "invalid");

    if (ok) {
      this.remembered++;
      this.feedback.burst(x, y, "#5BB98C", "还记得！");
      this.revealTimer = 0.8;
    } else {
      this.feedback.popText(x, y - 30, "是它，再记一遍", "#E07A5F", 18, 90);
      this.revealTimer = 1.4; // 忘了多给点时间重新记住
    }
  }

  // === 渲染 ===

  private render(): void {
    gameCanvas.draw((ctx) => this.drawBg(ctx), 2);
    gameCanvas.draw((ctx) => this.drawBody(ctx), 10);
    gameCanvas.draw(() => this.feedback.draw(), 20);
  }

  private drawBg(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#16213a");
    g.addColorStop(1, "#1b2f4b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawBody(ctx: CanvasRenderingContext2D): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    if (this.total === 0) {
      gameCanvas.drawText("今日复习", w / 2, h / 2 - 64,
        { size: 30, color: "#4ECDC4", bold: true });
      drawWrapped("暂时没有到期的内容，玩几关「面孔记忆 / 翻翻乐」就有了～",
        w / 2, h / 2 - 18, w - 80, { size: 18, color: "#c9d3ea", align: "center", lineH: 26 });
      gameCanvas.drawText("点任意位置返回", w / 2, h - NAV_H - 18, { size: 14, color: "#8b96b8" });
      return;
    }

    if (this.finished) {
      gameCanvas.drawText("复习完成", w / 2, h / 2 - 50,
        { size: 32, color: "#4ECDC4", bold: true });
      const line = this.remembered === this.total
        ? `${this.total} 项全部还记得，记性真好！`
        : `记住 ${this.remembered}/${this.total} 项，忘掉的明天再来～`;
      drawWrapped(line, w / 2, h / 2 + 4, w - 80, { size: 20, color: "#fff", align: "center", lineH: 28 });
      gameCanvas.drawText("点任意位置返回", w / 2, h - NAV_H - 18, { size: 14, color: "#8b96b8" });
      return;
    }

    const cur = this.queue[this.index];

    // 进度
    gameCanvas.drawText(`今日复习 ${this.index + 1}/${this.total}`, w / 2, 58,
      { size: 18, color: "#c9d3ea", bold: true });

    // 图像区
    const size = Math.min(w * 0.4, 190);
    const cx = w / 2;
    const cy = h * 0.3;
    if (cur.kind === "face") {
      drawFace(ctx, cx, cy, size, cur.seed ?? 1);
    } else if (cur.kind === "couplet") {
      // 文本题干：上句（如「床前」）
      gameCanvas.drawText(cur.prompt ?? "", cx, cy,
        { size: Math.round(size * 0.5), color: "#FFE66D", bold: true });
    } else {
      gameCanvas.drawText(cur.icon ?? "🌸", cx, cy, { size: Math.round(size * 0.66) });
    }

    // 提示语
    const tip = this.answered
      ? (this.selected === cur.label ? "还记得！" : "是它，再记一遍")
      : cur.kind === "face" ? "这位是谁来着？"
        : cur.kind === "couplet" ? "下一句是什么？"
        : "这个图案叫什么？";
    gameCanvas.drawText(tip, w / 2, cy + size * 0.62 + 24,
      { size: 19, color: this.answered ? "#FFE66D" : "#c9d3ea" });

    // 选项
    for (const opt of this.options) {
      let fill = "rgba(255,255,255,0.94)";
      let border = "rgba(255,255,255,0.25)";
      if (this.answered) {
        if (opt.label === cur.label) { fill = "#D6EFD9"; border = "#5BB98C"; }
        else if (opt.label === this.selected) { fill = "#F6D9D2"; border = "#E07A5F"; }
      }
      gameCanvas.drawRoundRect(opt.x, opt.y, opt.w, opt.h, 14, fill);
      gameCanvas.drawStrokeRect(opt.x, opt.y, opt.w, opt.h, 14, border, 2.5);
      gameCanvas.drawText(opt.label, opt.x + opt.w / 2, opt.y + opt.h / 2,
        { size: 22, color: "#2B3A42", bold: true });
    }
  }

  // === 布局 ===

  private layout(labels: string[]): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const cols = 2;
    const bw = (w - 48 - 16) / cols;
    const bh = 58;
    const rows = Math.ceil(labels.length / cols);
    const startY = h - rows * bh - (rows - 1) * 14 - 40;
    labels.forEach((label, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this.options.push({
        x: 24 + col * (bw + 16),
        y: startY + row * (bh + 14),
        w: bw,
        h: bh,
        label,
      });
    });
  }

  destroy(): void {
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
  }
}
