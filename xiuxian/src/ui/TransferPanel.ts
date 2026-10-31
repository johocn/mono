/**
 * 传送确认面板：踏入传送阵时弹出，确认后由 Game.enterZone 切图。
 * 海蓝玻璃质感，居中 560x460 复用 widgets。
 */
import { makePanel, text, button } from "./widgets";

export interface TransferDef {
  gx: number;
  gy: number;
  to: string;
  spawn: { gx: number; gy: number };
  label: string;
}

export class TransferPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private titleText: any;
  private descText: any;
  private onConfirm: () => void = () => {};
  private onClose: () => void = () => {};

  constructor(cb: { onConfirm: () => void; onClose: () => void }) {
    this.onConfirm = cb.onConfirm;
    this.onClose = cb.onClose;
    const panel = makePanel(560, 460, "传送阵");
    this.root.addChild(panel);
    this.root.visible = false;

    this.titleText = text("", { size: 22, color: "#dff6ff", bold: true, align: "center", width: 520 });
    this.titleText.pos(20, 80);
    this.root.addChild(this.titleText);

    this.descText = text("", { size: 15, color: "#bcd4e6", align: "center", width: 520 });
    this.descText.pos(20, 140);
    this.root.addChild(this.descText);

    const go = button("确定传送", 160, 44, "#2e6b8a");
    go.pos(120, 320);
    go.on(Laya.Event.CLICK, this, () => {
      this.hide();
      this.onConfirm();
    });
    this.root.addChild(go);
    const cancel = button("再想想", 160, 44, "#2a3350");
    cancel.pos(300, 320);
    cancel.on(Laya.Event.CLICK, this, () => {
      this.hide();
      this.onClose();
    });
    this.root.addChild(cancel);
  }

  show(t: TransferDef): void {
    this.titleText.text = `是否前往：${t.label}？`;
    this.descText.text = "踏入传送阵，灵光一闪便抵彼岸。\n（储物、修为、装备与任务皆随身而行）";
    this.visible = true;
    this.root.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.root.visible = false;
  }
}
