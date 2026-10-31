/**
 * UI 公共控件：进度条 / 面板 / 文本。全部程序化绘制，无美术资产依赖。
 */
export interface Bar {
  sprite: any;
  set(ratio: number, label?: string): void;
}

export function makeBar(w: number, h: number, fg: string, bg = "#00000099"): Bar {
  const sprite = new Laya.Sprite();
  const bgG = sprite.graphics;
  bgG.drawRoundRect(0, 0, w, h, h / 2, h / 2, h / 2, h / 2, bg, "#ffffff22", 1);
  const fgSprite = new Laya.Sprite();
  sprite.addChild(fgSprite);
  const label = new Laya.Text();
  label.width = w;
  label.height = h;
  label.fontSize = Math.max(10, h - 4);
  label.color = "#ffffff";
  label.align = "center";
  label.valign = "middle";
  sprite.addChild(label);
  return {
    sprite,
    set(ratio: number, text?: string) {
      const r = Math.max(0, Math.min(1, ratio));
      fgSprite.graphics.clear();
      if (r > 0) {
        fgSprite.graphics.drawRoundRect(1, 1, (w - 2) * r, h - 2, (h - 2) / 2, (h - 2) / 2, (h - 2) / 2, (h - 2) / 2, fg, null, 0);
      }
      label.text = text || "";
    },
  };
}

export function makePanel(w: number, h: number, title = ""): any {
  const p = new Laya.Sprite();
  p.graphics.drawRoundRect(0, 0, w, h, 10, 10, 10, 10, "#1a2030ee", "#3a4a6a", 2);
  p.size(w, h);
  if (title) {
    const t = text(title, { size: 18, color: "#e8e8f0", bold: true });
    t.pos(14, 10);
    p.addChild(t);
  }
  return p;
}

export interface TextOpts {
  size?: number;
  color?: string;
  bold?: boolean;
  align?: string;
  width?: number;
  height?: number;
  stroke?: string;
}

export function text(str: string, opts: TextOpts = {}): any {
  const t = new Laya.Text();
  t.text = str;
  t.fontSize = opts.size ?? 14;
  t.color = opts.color ?? "#dfe3ee";
  t.bold = !!opts.bold;
  t.align = opts.align || "left";
  if (opts.width !== undefined) t.width = opts.width;
  if (opts.height !== undefined) t.height = opts.height;
  if (opts.stroke) {
    t.stroke = 2;
    t.strokeColor = opts.stroke;
  }
  return t;
}

/** 让任意 Sprite 可被真实鼠标命中：开启 mouseEnabled 并给定命中区。
 *  Laya 在无 hitArea 时依赖 getBounds()，而带子节点（文字）的 Sprite 其 getBounds
 *  会异常膨胀，导致 hitTestPoint 失败、节点在真实鼠标下收不到点击。 */
export function hit(sprite: any, w: number, h: number): any {
  sprite.mouseEnabled = true;
  if ((Laya as any).Rectangle) sprite.hitArea = new Laya.Rectangle(0, 0, w, h);
  return sprite;
}

/** 按钮：圆角底 + 文案，返回 sprite（onClick 由调用方挂） */
export function button(label: string, w = 150, h = 40, color = "#2e4a7a"): any {
  const b = new Laya.Sprite();
  b.graphics.drawRoundRect(0, 0, w, h, 8, 8, 8, 8, color, "#ffffff33", 1);
  b.size(w, h);
  const t = text(label, { size: 15, color: "#ffffff", bold: true, align: "center", width: w, height: h });
  t.valign = "middle";
  b.addChild(t);
  b.mouseEnabled = true; // Laya Sprite.mouseEnabled 默认为 false，按钮须显式开启命中
  // 显式命中区：Laya 在无 hitArea 时依赖 getBounds()，而带子节点（居中文字）的 Sprite
  // 其 getBounds 会异常膨胀，导致 hitTestPoint 失败、按钮在真实鼠标下收不到点击。
  if ((Laya as any).Rectangle) b.hitArea = new Laya.Rectangle(0, 0, w, h);
  return b;
}
