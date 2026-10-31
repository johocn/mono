/**
 * 移动端触控层：虚拟摇杆（左下）+ 技能按钮（右侧 4 个）+ 交互按钮（F）。
 * 仅触屏设备可见（Game 按 isTouchDevice 控制）。所有手势写入 Input 的摇杆/触控状态，
 * 不自行改变游戏逻辑，保持与桌面键鼠同源（Game 每帧读取 Input）。
 */
import { text } from "./widgets";
import type { Input } from "../core/Input";
import type { Player } from "../entities/Player";
import { getSkill } from "../data/skills";

export class MobileControls {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private input: Input;
  private player: Player;

  private joyZone: any;
  private joyBase: any;
  private joyThumb: any;
  private joyId = -1;
  private joyCx = 0;
  private joyCy = 0;
  private readonly joyR = 56;
  private joyActivePos: { x: number; y: number } | null = null;

  private skillBtns: any[] = [];
  private skillLabels: any[] = [];
  private interactBtn: any;
  private autoBtn: any;
  private rollBtn: any;
  private blockBtn: any;

  private vw = 1280;
  private vh = 720;
  /** 交互态：面板/对话/过场/非游玩期禁用命中并隐藏，避免遮挡面板与背后输入 */
  private interactive = true;

  constructor(input: Input, player: Player) {
    this.input = input;
    this.player = player;
    this.root.visible = false;

    // 摇杆捕获区（左下，近乎透明以保留命中）
    this.joyZone = new Laya.Sprite();
    this.joyZone.graphics.drawRect(0, 0, 360, 360, "rgba(255,255,255,0.001)");
    if ((Laya as any).Rectangle) this.joyZone.hitArea = new Laya.Rectangle(0, 0, 360, 360);
    this.joyZone.on(Laya.Event.MOUSE_DOWN, this, (e: any) => this.onJoyDown(e));
    this.root.addChild(this.joyZone);

    this.joyBase = new Laya.Sprite();
    this.joyBase.graphics.drawCircle(0, 0, this.joyR, "rgba(20,30,48,0.5)", "#7fd0e0", 2);
    this.joyBase.visible = false;
    this.root.addChild(this.joyBase);

    this.joyThumb = new Laya.Sprite();
    this.joyThumb.graphics.drawCircle(0, 0, 24, "#7fd0e0", null, 0);
    this.joyThumb.visible = false;
    this.root.addChild(this.joyThumb);

    // 技能按钮（右侧 4 列）
    for (let i = 0; i < 4; i++) {
      const b = new Laya.Sprite();
      b.graphics.drawCircle(0, 0, 30, "rgba(20,30,48,0.6)", "#d4af37", 2);
      const lbl = text("", { size: 12, color: "#f5efe0", align: "center", width: 60, bold: true });
      lbl.pos(-30, -8);
      b.addChild(lbl);
      b.on(Laya.Event.MOUSE_DOWN, this, () => this.onSkillDown(i, b));
      b.on(Laya.Event.MOUSE_UP, this, () => this.onBtnUp(b));
      this.skillBtns.push(b);
      this.skillLabels.push(lbl);
      this.root.addChild(b);
    }

    // 交互按钮（F，中下偏右）
    this.interactBtn = new Laya.Sprite();
    this.interactBtn.graphics.drawCircle(0, 0, 32, "rgba(20,30,48,0.6)", "#8fd18f", 2);
    const il = text("交谈", { size: 12, color: "#f5efe0", align: "center", width: 64, bold: true });
    il.pos(-32, -8);
    this.interactBtn.addChild(il);
    this.interactBtn.on(Laya.Event.MOUSE_DOWN, this, () => this.onInteractDown());
    this.interactBtn.on(Laya.Event.MOUSE_UP, this, () => this.onBtnUp(this.interactBtn));
    if ((Laya as any).Rectangle) this.interactBtn.hitArea = new Laya.Rectangle(-44, -44, 88, 88);
    this.root.addChild(this.interactBtn);

    // 自动战斗按钮（挂机开关）
    this.autoBtn = new Laya.Sprite();
    this.autoBtn.graphics.drawCircle(0, 0, 32, "rgba(20,30,48,0.6)", "#ffd166", 2);
    const aul = text("自动", { size: 12, color: "#f5efe0", align: "center", width: 64, bold: true });
    aul.pos(-32, -8);
    this.autoBtn.addChild(aul);
    this.autoBtn.on(Laya.Event.MOUSE_DOWN, this, () => { if (this.visible && this.interactive) { this.input.pressAuto(); this.autoBtn.scale(1.12, 1.12); } });
    this.autoBtn.on(Laya.Event.MOUSE_UP, this, () => this.onBtnUp(this.autoBtn));
    if ((Laya as any).Rectangle) this.autoBtn.hitArea = new Laya.Rectangle(-44, -44, 88, 88);
    this.root.addChild(this.autoBtn);

    // 翻滚按钮（P3-1 战斗手感）
    this.rollBtn = new Laya.Sprite();
    this.rollBtn.graphics.drawCircle(0, 0, 32, "rgba(20,30,48,0.6)", "#5a3a6a", 2);
    const rl = text("翻滚", { size: 12, color: "#f5efe0", align: "center", width: 64, bold: true });
    rl.pos(-32, -8);
    this.rollBtn.addChild(rl);
    this.rollBtn.on(Laya.Event.MOUSE_DOWN, this, () => { if (this.visible && this.interactive) { this.input.pressRoll(); this.rollBtn.scale(1.12, 1.12); } });
    this.rollBtn.on(Laya.Event.MOUSE_UP, this, () => this.onBtnUp(this.rollBtn));
    if ((Laya as any).Rectangle) this.rollBtn.hitArea = new Laya.Rectangle(-44, -44, 88, 88);
    this.root.addChild(this.rollBtn);

    // 格挡按钮（P3-1b 战斗手感：按住持续格挡）
    this.blockBtn = new Laya.Sprite();
    this.blockBtn.graphics.drawCircle(0, 0, 32, "rgba(20,40,48,0.6)", "#3a7a8a", 2);
    const blk = text("格挡", { size: 12, color: "#cfeefb", align: "center", width: 64, bold: true });
    blk.pos(-32, -8);
    this.blockBtn.addChild(blk);
    this.blockBtn.on(Laya.Event.MOUSE_DOWN, this, () => { if (this.visible && this.interactive) { this.input.pressBlock(); this.blockBtn.scale(1.12, 1.12); } });
    this.blockBtn.on(Laya.Event.MOUSE_UP, this, () => { this.input.releaseBlock(); this.onBtnUp(this.blockBtn); });
    if ((Laya as any).Rectangle) this.blockBtn.hitArea = new Laya.Rectangle(-44, -44, 88, 88);
    this.root.addChild(this.blockBtn);

    // 摇杆 move/up 挂在 stage，跨控件跟踪同一指
    Laya.stage.on(Laya.Event.MOUSE_MOVE, this, (e: any) => this.onJoyMove(e));
    Laya.stage.on(Laya.Event.MOUSE_UP, this, (e: any) => this.onJoyUp(e));

    this.refresh();
  }

  setPlayer(p: Player): void {
    this.player = p;
    this.refresh();
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.visible = v && this.interactive;
    if (v) this.refresh();
  }

  /** 交互态开关：false 时隐藏并复位摇杆（供 Game 在面板/对话/过场/非游玩期调用） */
  setInteractive(v: boolean): void {
    this.interactive = v;
    this.root.visible = v && this.visible;
    if (!v) {
      this.joyId = -1;
      this.joyBase.visible = false;
      this.joyThumb.visible = false;
      this.joyActivePos = null;
      this.input.setJoystick(0, 0, false);
    }
  }

  layout(viewW: number, viewH: number, topInset: number, bottomInset: number, leftInset: number, rightInset: number): void {
    this.vw = viewW;
    this.vh = viewH;
    this.joyZone.pos(leftInset, viewH - 360 - bottomInset);
    this.interactBtn.pos(viewW - 150 - rightInset, viewH - 70 - bottomInset);
    this.autoBtn.pos(viewW - 220 - rightInset, viewH - 150 - bottomInset);
    this.rollBtn.pos(viewW - 150 - rightInset, viewH - 150 - bottomInset);
    this.blockBtn.pos(viewW - 290 - rightInset, viewH - 150 - bottomInset);
    for (let i = 0; i < 4; i++) {
      this.skillBtns[i].pos(viewW - 60 - rightInset, viewH - 250 - bottomInset + i * 70);
    }
    if (this.joyActivePos) this.joyBase.pos(this.joyActivePos.x, this.joyActivePos.y);
  }

  private onJoyDown(e: any): void {
    if (!this.visible || !this.interactive) return;
    this.joyId = e.touchId ?? 0;
    this.joyCx = e.stageX ?? e.x ?? 0;
    this.joyCy = e.stageY ?? e.y ?? 0;
    this.joyActivePos = { x: this.joyCx, y: this.joyCy };
    this.joyBase.visible = true;
    this.joyThumb.visible = true;
    this.joyBase.pos(this.joyCx, this.joyCy);
    this.joyThumb.pos(this.joyCx, this.joyCy);
  }

  private onJoyMove(e: any): void {
    if (!this.visible || !this.interactive || this.joyId < 0) return;
    if ((e.touchId ?? 0) !== this.joyId) return;
    const x = e.stageX ?? e.x ?? this.joyCx;
    const y = e.stageY ?? e.y ?? this.joyCy;
    let dx = x - this.joyCx;
    let dy = y - this.joyCy;
    const len = Math.hypot(dx, dy);
    if (len > this.joyR) {
      dx = (dx / len) * this.joyR;
      dy = (dy / len) * this.joyR;
    }
    this.joyThumb.pos(this.joyCx + dx, this.joyCy + dy);
    this.input.setJoystick(dx, dy, true);
  }

  private onJoyUp(e: any): void {
    if ((e.touchId ?? 0) !== this.joyId) return;
    this.joyId = -1;
    this.joyBase.visible = false;
    this.joyThumb.visible = false;
    this.joyActivePos = null;
    this.input.setJoystick(0, 0, false);
  }

  private onSkillDown(i: number, b: any): void {
    if (!this.visible || !this.interactive) return;
    b.scale(1.12, 1.12);
    this.input.pressSkillSlot(i);
  }

  private onInteractDown(): void {
    if (!this.visible || !this.interactive) return;
    this.interactBtn.scale(1.12, 1.12);
    this.input.pressInteract();
  }

  private onBtnUp(b: any): void {
    b.scale(1, 1);
  }

  private refresh(): void {
    for (let i = 0; i < 4; i++) {
      const id = this.player.equipped[i];
      const name = id ? getSkill(id)?.name || id : "空";
      this.skillLabels[i].text = `${i + 1}·${name}`;
    }
  }
}
