/**
 * 对话弹层：头像 / 说话者 / 打字机正文 / 分支按钮。
 * 点击正文：打字中→立即全显；否则推进。分支按钮直达对应节点。
 */
import type { StoryChoice, StoryNode } from "../data/story/chapter1";
import { makePanel, text, button } from "./widgets";
import { drawArt } from "./art";

export class DialogueBox {
  readonly root: any = new Laya.Sprite();
  visible = false;
  /** 推进回调（choiceIndex：无分支传 0） */
  onAdvance: (choiceIndex: number) => void = () => {};

  private portrait: any;
  private portraitMark: any;
  private nameText: any;
  private bodyText: any;
  private choiceLayer: any = new Laya.Sprite();
  private panel: any;
  private node: StoryNode | null = null;
  /** 经条件过滤后的可见选项（与 Game/DialogueRunner 同步，保证索引一致） */
  private visibleChoices: StoryChoice[] = [];
  private full = "";
  private shown = 0;
  private typing = false;

  constructor() {
    const panel = makePanel(760, 168);
    panel.pos(0, 0);
    panel.mouseEnabled = false; // 让点击穿透到 root（root 设了 hitArea）
    this.panel = panel;
    this.root.addChild(panel);
    // 整块弹层可点击推进：设 hitArea 覆盖弹层，点击正文/空白均可继续
    if ((Laya as any).Rectangle) this.root.hitArea = new Laya.Rectangle(0, 0, 760, 168);
    this.root.on(Laya.Event.CLICK, this, this.onClickBody);

    // 文字/头像子节点关闭命中，避免拦截 root 的点击推进
    panel.mouseEnabled = false;
    this.portrait = new Laya.Sprite();
    this.portrait.graphics.drawRoundRect(14, 34, 72, 96, 10, 10, 10, 10, "#c9a227", "#ffffff33", 1);
    this.portrait.mouseEnabled = false;
    this.root.addChild(this.portrait);
    const pName = text("像", { size: 24, color: "#1a1408", bold: true, align: "center", width: 72, height: 96 });
    pName.pos(14, 34);
    pName.valign = "middle";
    pName.mouseEnabled = false;
    this.root.addChild(pName);
    this.portraitMark = pName;

    this.nameText = text("", { size: 15, color: "#ffd166", bold: true });
    this.nameText.pos(104, 16);
    this.nameText.mouseEnabled = false;
    this.root.addChild(this.nameText);

    this.bodyText = text("", { size: 15, color: "#e8ecf5", width: 620, height: 96 });
    this.bodyText.pos(104, 44);
    this.bodyText.leading = 6;
    this.bodyText.wordWrap = true;
    this.bodyText.mouseEnabled = false;
    this.root.addChild(this.bodyText);

    this.choiceLayer.pos(104, 130);
    this.root.addChild(this.choiceLayer);

    const hint = text("点击继续 ▸", { size: 11, color: "#7a86a8" });
    hint.pos(660, 146);
    hint.mouseEnabled = false;
    this.root.addChild(hint);
  }

  layout(viewW: number, viewH: number): void {
    this.root.x = viewW / 2 - 380;
    this.root.y = viewH - 200;
  }

  open(node: StoryNode, choices?: StoryChoice[]): void {
    this.node = node;
    this.visibleChoices = choices || node.choices || [];
    this.visible = true;
    this.root.visible = true;
    this.nameText.text = node.speaker || "旁白";
    this.portrait.graphics.clear();
    const base = node.color || "#4a5568";
    if (node.img) {
      // 有立绘：画贴图，隐藏「像」占位字
      const ok = drawArt(this.portrait.graphics, node.img, 14, 34, 72, 96, base, "cover", 10);
      this.portraitMark.visible = !ok;
    } else {
      this.portrait.graphics.drawRoundRect(14, 34, 72, 96, 10, 10, 10, 10, base, "#ffffff33", 1);
      this.portraitMark.visible = true;
    }
    this.full = node.text;
    this.shown = 0;
    this.typing = true;
    this.bodyText.text = "";
    this.renderChoices();
  }

  private renderChoices(): void {
    this.choiceLayer.removeChildren();
    const choices = this.visibleChoices;
    let x = 0;
    choices.forEach((c, i) => {
      const b = button(c.text, 260, 32, "#2e4a7a");
      b.pos(x, 0);
      b.on(Laya.Event.CLICK, this, (e: any) => {
        e.stopPropagation();
        this.visible && this.onAdvance(i);
      });
      this.choiceLayer.addChild(b);
      x += 270;
    });
  }

  private onClickBody(): void {
    if (!this.node) return;
    if (this.typing) {
      this.typing = false;
      this.bodyText.text = this.full;
      return;
    }
    if (this.node.choices && this.node.choices.length > 0) return; // 分支必须点按钮
    this.onAdvance(0);
  }

  /** 外部（空格键/自动化）推进对话 */
  advance(): void {
    this.onClickBody();
  }

  update(dt: number): void {
    if (!this.visible || !this.typing) return;
    this.shown += dt * 28;
    const n = Math.min(this.full.length, Math.floor(this.shown));
    this.bodyText.text = this.full.slice(0, n);
    if (n >= this.full.length) this.typing = false;
  }

  close(): void {
    this.visible = false;
    this.root.visible = false;
    this.node = null;
  }
}
