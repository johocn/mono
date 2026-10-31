/**
 * 战斗表现层：飘字（伤害/治疗/暴击）与命中火花。
 * 只做表现，不参与数值。
 */
export class Fx {
  private layer: any;
  /** 世界层缩放倍率：飘字需反缩放，保证屏幕字号恒定 */
  private inv: number;
  private items: { sprite: any; t: number; life: number; vx?: number; vy?: number }[] = [];
  private trails: { sprite: any; t: number; life: number }[] = [];
  private rings: { sprite: any; t: number; life: number }[] = [];
  private arcs: { sprite: any; t: number; life: number }[] = [];

  constructor(layer: any, zoom = 1) {
    this.layer = layer;
    this.inv = 1 / zoom;
  }

  floatText(x: number, y: number, text: string, color: string, size = 16): void {
    const t = new Laya.Text();
    t.text = text;
    t.color = color;
    t.fontSize = size;
    t.bold = true;
    t.width = 160;
    t.align = "center";
    t.pos(x - 80, y - 30);
    t.scale(this.inv, this.inv);
    t.zOrder = 9999;
    this.layer.addChild(t);
    this.items.push({ sprite: t, t: 0, life: 0.9 });
  }

  spark(x: number, y: number, color = "#ffd166"): void {
    const s = new Laya.Sprite();
    s.pos(x, y);
    s.zOrder = 9998;
    s.graphics.drawCircle(0, 0, 6, color, null, 0);
    this.layer.addChild(s);
    this.items.push({ sprite: s, t: 0, life: 0.25 });
  }

  /** 命中粒子爆散：多方向小粒子向外扩散并渐隐（暴击传更大 count） */
  burst(x: number, y: number, color = "#ffd166", count = 6): void {
    for (let i = 0; i < count; i++) {
      const s = new Laya.Sprite();
      s.pos(x, y);
      s.zOrder = 9998;
      s.graphics.drawCircle(0, 0, 3, color, null, 0);
      this.layer.addChild(s);
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const spd = 70 + Math.random() * 90;
      this.items.push({ sprite: s, t: 0, life: 0.3, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd });
    }
  }

  /** 弹道拖尾：在 (x,y) 留下一小团同色光点，随帧渐隐放大（技能弹丸用） */
  trail(x: number, y: number, color: string, r = 4, life = 0.26): void {
    const s = new Laya.Sprite();
    s.pos(x, y);
    s.zOrder = 9990;
    s.graphics.drawCircle(0, 0, r, color, null, 0);
    this.layer.addChild(s);
    this.trails.push({ sprite: s, t: 0, life });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        this.layer.removeChild(it.sprite);
        it.sprite.destroy?.();
        this.items.splice(i, 1);
        continue;
      }
      it.sprite.alpha = 1 - k;
      it.sprite.y -= 34 * dt;
      if (it.vx || it.vy) {
        it.sprite.x += (it.vx || 0) * dt;
        it.sprite.y += (it.vy || 0) * dt;
      }
      if (typeof it.sprite.scale === "function") it.sprite.scale(1 + k * 0.8, 1 + k * 0.8);
    }
    // 弹道拖尾：就地渐隐放大
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const it = this.trails[i];
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        this.layer.removeChild(it.sprite);
        it.sprite.destroy?.();
        this.trails.splice(i, 1);
        continue;
      }
      it.sprite.alpha = 1 - k;
      it.sprite.scale(1 + k * 0.7, 1 + k * 0.7);
    }
    // 扩散冲击环：快速放大并渐隐（处决/感电演出）
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const it = this.rings[i];
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        this.layer.removeChild(it.sprite);
        it.sprite.destroy?.();
        this.rings.splice(i, 1);
        continue;
      }
      it.sprite.alpha = 1 - k;
      it.sprite.scale(1 + k * 4, 1 + k * 4);
    }
    // 闪电弧：短暂渐隐的折线（感电连锁）
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const it = this.arcs[i];
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        this.layer.removeChild(it.sprite);
        it.sprite.destroy?.();
        this.arcs.splice(i, 1);
        continue;
      }
      it.sprite.alpha = 1 - k;
    }
  }

  /** 扩散冲击环：一处快速放大的圆环，营造处决/感电的冲击波 */
  ring(x: number, y: number, color: string, life = 0.4): void {
    const s = new Laya.Sprite();
    s.pos(x, y);
    s.zOrder = 9995;
    s.graphics.drawCircle(0, 0, 8, null, color, 4);
    this.layer.addChild(s);
    this.rings.push({ sprite: s, t: 0, life });
  }

  /** 闪电弧：在两世界坐标间绘制一段抖动折线，模拟感电连锁电光（短暂渐隐） */
  arc(x1: number, y1: number, x2: number, y2: number, color = "#bfe9ff", life = 0.18): void {
    const s = new Laya.Sprite();
    s.zOrder = 9996;
    const g = s.graphics;
    const segs = 6;
    const pts: number[] = [];
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const len = Math.hypot(nx, ny) || 1;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      let x = x1 + (x2 - x1) * t;
      let y = y1 + (y2 - y1) * t;
      if (i !== 0 && i !== segs) {
        const off = (Math.random() - 0.5) * 14;
        x += (nx / len) * off;
        y += (ny / len) * off;
      }
      pts.push(x, y);
    }
    g.drawLines(0, 0, pts, color, 2);
    this.layer.addChild(s);
    this.arcs.push({ sprite: s, t: 0, life });
  }
}
