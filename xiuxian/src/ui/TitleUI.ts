/**
 * 标题界面：三界舆图背景 + 游戏名 / 昵称输入 / 开始与继续 / 排行榜 + 四位主要角色立绘卡。
 */
import type { LeaderEntry } from "../core/CloudClient";
import { makePanel, text, button } from "./widgets";
import { drawArt } from "./art";
import { ART } from "../core/Assets";
import { allCast } from "../data/cast";

export interface TitleCallbacks {
  onStart: (nickname: string) => void;
  onContinue: () => void;
  onLeaderboard: () => void;
  /** 点击角色卡：打开人物志对应角色 */
  onCast?: (index: number) => void;
}

/** 角色卡尺寸 */
const CARD_W = 132;
const CARD_H = 132;
const CARD_GAP = 14;

export class TitleUI {
  readonly root: any = new Laya.Sprite();
  private nicknameInput: any;
  private btnContinue: any;
  private lbLayer: any = new Laya.Sprite();
  /** 背景：三界舆图（与游戏内舆图面板同一张资源） */
  private bg: any = new Laya.Sprite();
  /** 背景压暗层：保证标题文字可读 */
  private dim: any = new Laya.Sprite();
  /** 角色卡层 */
  private castLayer: any = new Laya.Sprite();

  constructor(private cb: TitleCallbacks) {
    this.root.addChild(this.bg);
    this.root.addChild(this.dim);

    const panel = makePanel(460, 400);
    this.root.addChild(panel);

    const title = text("修仙 · 凡人之路", { size: 34, color: "#e8dcb0", bold: true, align: "center", width: 460 });
    title.pos(0, 40);
    this.root.addChild(title);
    const sub = text("2.5D 斜视角 · 第一章「落霞镇」", { size: 14, color: "#9aa4bd", align: "center", width: 460 });
    sub.pos(0, 92);
    this.root.addChild(sub);

    const nickLabel = text("道号：", { size: 14, color: "#dfe3ee" });
    nickLabel.pos(60, 140);
    this.root.addChild(nickLabel);
    this.nicknameInput = new Laya.TextInput();
    this.nicknameInput.text = "无名散修";
    this.nicknameInput.width = 300;
    this.nicknameInput.height = 34;
    this.nicknameInput.fontSize = 15;
    this.nicknameInput.color = "#ffffff";
    this.nicknameInput.bgColor = "#1e2740";
    this.nicknameInput.borderColor = "#3a4a6a";
    this.nicknameInput.pos(120, 134);
    this.root.addChild(this.nicknameInput);

    const btnStart = button("开始新的修行", 200, 44, "#2e6b4a");
    btnStart.pos(130, 200);
    btnStart.on(Laya.Event.CLICK, this, () => {
      const nick = (this.nicknameInput.text || "").trim() || "无名散修";
      this.cb.onStart(nick);
    });
    this.root.addChild(btnStart);

    const btnContinue = button("继续修行（云存档）", 200, 40, "#2a3350");
    btnContinue.pos(130, 254);
    btnContinue.on(Laya.Event.CLICK, this, () => this.cb.onContinue());
    this.btnContinue = btnContinue;
    this.root.addChild(btnContinue);

    const btnLb = button("查看排行榜", 200, 36, "#4a3a6a");
    btnLb.pos(130, 304);
    btnLb.on(Laya.Event.CLICK, this, () => this.cb.onLeaderboard());
    this.root.addChild(btnLb);

    this.lbLayer.pos(60, 344);
    this.root.addChild(this.lbLayer);

    this.root.addChild(this.castLayer);
  }

  setContinueEnabled(enabled: boolean): void {
    if (this.btnContinue) this.btnContinue.alpha = enabled ? 1 : 0.4;
  }

  showLeaderboard(entries: LeaderEntry[]): void {
    this.lbLayer.removeChildren();
    if (entries.length === 0) {
      const t = text("排行榜暂无人上榜（后端未启动时仅显示本地）", { size: 12, color: "#7a86a8" });
      this.lbLayer.addChild(t);
      return;
    }
    entries.slice(0, 5).forEach((e, i) => {
      const t = text(
        `${i + 1}. ${e.nickname} · ${e.realm} · ${(e.timeMs / 1000).toFixed(0)}s · 斩妖 ${e.kills}`,
        { size: 12, color: "#dfe3ee" },
      );
      t.pos(0, i * 18);
      this.lbLayer.addChild(t);
    });
  }

  layout(viewW: number, viewH: number): void {
    this.root.x = viewW / 2 - 230;
    this.root.y = viewH / 2 - 200;
    this.drawBg(viewW, viewH);
    this.drawCast(viewW, viewH);
  }

  private drawBg(viewW: number, viewH: number): void {
    const g = this.bg.graphics;
    g.clear();
    drawArt(g, ART.mapSanjie, -this.root.x, -this.root.y, viewW, viewH, "#101018", "cover", 0);
    const d = this.dim.graphics;
    d.clear();
    d.drawRect(-this.root.x, -this.root.y, viewW, viewH, "rgba(10,14,26,0.5)");
  }

  /** 底部四位主要角色立绘卡（点击可查看人物志） */
  private drawCast(viewW: number, viewH: number): void {
    const layer = this.castLayer;
    layer.removeChildren();
    const list = allCast();
    const total = list.length * CARD_W + (list.length - 1) * CARD_GAP;
    const startScreenX = (viewW - total) / 2;
    const screenY = viewH - CARD_H - 16;
    list.forEach((c, i) => {
      const s = new Laya.Sprite();
      s.pos(startScreenX + i * (CARD_W + CARD_GAP) - this.root.x, screenY - this.root.y);
      s.size(CARD_W, CARD_H);
      s.graphics.drawRoundRect(0, 0, CARD_W, CARD_H, 12, 12, 12, 12, "#141c2ccc", c.color, 2);
      drawArt(s.graphics, c.img, 8, 8, CARD_W - 16, CARD_H - 38, "#0b0f1a", "contain", 8);
      const n = text(c.name, { size: 14, color: c.color, bold: true, align: "center", width: CARD_W, height: 24 });
      n.pos(0, CARD_H - 28);
      n.valign = "middle";
      s.addChild(n);
      s.mouseEnabled = true;
      if ((Laya as any).Rectangle) s.hitArea = new Laya.Rectangle(0, 0, CARD_W, CARD_H);
      s.on(Laya.Event.CLICK, this, (e: any) => {
        e.stopPropagation();
        this.cb.onCast?.(i);
      });
      layer.addChild(s);
    });
  }

  show(): void {
    this.root.visible = true;
  }
  hide(): void {
    this.root.visible = false;
  }
}
