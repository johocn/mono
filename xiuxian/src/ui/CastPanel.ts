/**
 * 人物志面板：左侧大立绘卡 + 右侧角色切换与形象设定
 * （外貌 / 服饰配色 / 神态气质 / 标志元素），与三界舆图同一套画风与色板。
 *
 * 立绘为 AI 生成的完整插画（自带云雾远山背景），因此以「画卡」形式呈现：
 * 圆角描边框 + 等比完整放入，不依赖透明抠图。
 */
import { allCast, type CastDef } from "../data/cast";
import { makePanel, text, button } from "./widgets";
import { drawArt } from "./art";

const PANEL_W = 900;
const PANEL_H = 620;

/** 立绘卡区域 */
const CARD_X = 20;
const CARD_Y = 56;
const CARD_W = 360;
const CARD_H = 460;

/** 右侧信息区 */
const INFO_X = 400;
const INFO_W = 470;
const CHIP_H = 38;
const CHIP_GAP = 6;

export class CastPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private viewW = 1280;
  private viewH = 720;
  private bg: any = new Laya.Sprite();
  /** 立绘卡层（贴图就绪后重绘） */
  private cardLayer: any = new Laya.Sprite();
  /** 角色切换按钮层 */
  private chipLayer: any = new Laya.Sprite();
  /** 设定文案层 */
  private infoLayer: any = new Laya.Sprite();
  private sel = 0;
  private t = 0;

  constructor(private onClose: () => void = () => {}) {
    this.root.visible = false; // 初始隐藏，show()/hide() 切换；否则 root 默认可见会盖住标题屏
    this.root.addChild(this.bg);
    this.bg.mouseEnabled = true; // 点击空白处关闭
    this.bg.on(Laya.Event.CLICK, this, () => this.hide());

    const panel = makePanel(PANEL_W, PANEL_H, "人物志 · 凡人之路");
    this.root.addChild(panel);
    panel.mouseEnabled = false;

    // 同 WorldMapPanel：可点击内容挂在 root 上，panel 仅作底图
    this.cardLayer.pos(CARD_X, CARD_Y);
    this.root.addChild(this.cardLayer);

    this.chipLayer.pos(INFO_X, CARD_Y);
    this.root.addChild(this.chipLayer);

    this.infoLayer.pos(INFO_X, CARD_Y + (CHIP_H + CHIP_GAP) * 4 + 12);
    this.root.addChild(this.infoLayer);

    const close = button("关闭 (Y)", 120, 32, "#5a2e3a");
    close.pos(PANEL_W - 132, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);

    const note = text(
      "画风统一：水墨与工笔结合 · 线条柔和 · 月白 / 淡青 / 浅金主调 · 可爱治愈",
      { size: 12, color: "#9aa4bd", width: PANEL_W - 40, align: "center" },
    );
    note.pos(20, PANEL_H - 30);
    panel.addChild(note);
  }

  /** 切换当前展示的角色 */
  select(i: number): void {
    const n = allCast().length;
    this.sel = ((i % n) + n) % n;
    if (this.visible) this.refresh();
  }

  show(): void { this.visible = true; this.root.visible = true; this.refresh(); }
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.visible = false;
    this.onClose();
  }
  toggle(): void { this.visible ? this.hide() : this.show(); }

  layout(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.root.x = Math.max(0, (viewW - PANEL_W) / 2);
    this.root.y = Math.max(0, (viewH - PANEL_H) / 2);
    const g = this.bg.graphics;
    g.clear();
    g.drawRect(-this.root.x, -this.root.y, viewW, viewH, "rgba(8,10,18,0.82)");
    if ((Laya as any).Rectangle) {
      this.bg.hitArea = new Laya.Rectangle(-this.root.x, -this.root.y, viewW, viewH);
    }
    if (this.visible) this.refresh();
  }

  /** 呼吸脉冲（当前所在标记） */
  update(dt: number): void {
    if (!this.visible) return;
    this.t += dt;
  }

  refresh(): void {
    const list = allCast();
    if (this.sel >= list.length) this.sel = 0;
    const c = list[this.sel];

    // —— 立绘卡 ——
    const cg = this.cardLayer.graphics;
    cg.clear();
    drawArt(cg, c.img, 0, 0, CARD_W, CARD_H, c.color, "contain", 14);

    // —— 角色切换 ——
    this.chipLayer.removeChildren();
    list.forEach((d, i) => {
      const on = i === this.sel;
      const b = button(`${d.name} · ${d.title}`, INFO_W - 10, CHIP_H, on ? "#2e5a7a" : "#22283a");
      b.pos(0, i * (CHIP_H + CHIP_GAP));
      b.on(Laya.Event.CLICK, this, () => this.select(i));
      this.chipLayer.addChild(b);
    });

    // —— 设定文案 ——
    this.infoLayer.removeChildren();
    const name = text(c.name, { size: 22, color: c.color, bold: true });
    name.pos(0, 0);
    this.infoLayer.addChild(name);

    const title = text(c.title, { size: 13, color: "#ffd166" });
    title.pos(0, 32);
    this.infoLayer.addChild(title);

    const body = text(
      `【外貌】${c.appearance}\n【配色】${c.palette}\n【气质】${c.manner}\n【标志】${c.marks}`,
      { size: 12, color: "#c8cede", width: INFO_W - 10, height: 240 },
    );
    body.pos(0, 58);
    body.leading = 5;
    body.wordWrap = true;
    this.infoLayer.addChild(body);
  }
}
