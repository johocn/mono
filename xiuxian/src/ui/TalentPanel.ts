/**
 * 天赋树面板：按分支（剑道/灵修/锻体）展示可加点天赋，消耗天赋点提升被动属性。
 * 复用 widgets 行布局；overUI 命中区同其它面板由 Game 统一处理。
 */
import type { Player } from "../entities/Player";
import { TALENTS, TALENT_BRANCH_NAME, type TalentBranch, type TalentNode } from "../data/talents";
import { makePanel, text, button } from "./widgets";

const BRANCH_ORDER: TalentBranch[] = ["sword", "law", "body"];
const BRANCH_COLOR: Record<TalentBranch, string> = { sword: "#ffd166", law: "#7fd0e0", body: "#8fd18f" };

export class TalentPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private pointText: any;
  private player: Player;

  constructor(player: Player, private onMsg: (msg: string) => void) {
    this.player = player;
    const panel = makePanel(580, 560, "道体 · 天赋树");
    this.root.addChild(panel);
    this.root.visible = false;

    this.pointText = text("", { size: 13, color: "#ffd166", bold: true, width: 260 });
    this.pointText.pos(300, 16);
    this.root.addChild(this.pointText);

    this.listLayer.pos(16, 52);
    this.root.addChild(this.listLayer);

    const close = button("关闭 (T)", 96, 32, "#5a2e3a");
    close.pos(462, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);
  }

  setPlayer(player: Player): void {
    this.player = player;
    if (this.visible) this.refresh();
  }
  show(): void { this.visible = true; this.root.visible = true; this.refresh(); }
  hide(): void { this.visible = false; this.root.visible = false; }
  toggle(): void { this.visible ? this.hide() : this.show(); }

  refresh(): void {
    this.pointText.text = `可用天赋点：${this.player.talentPoints}`;
    this.listLayer.removeChildren();
    let y = 0;
    for (const branch of BRANCH_ORDER) {
      const synergy = this.player.schoolSynergy === branch;
      const title = synergy ? `【${TALENT_BRANCH_NAME[branch]}】·共鸣 ×1.5` : `【${TALENT_BRANCH_NAME[branch]}】`;
      const h = text(title, { size: 14, color: synergy ? "#ffd166" : BRANCH_COLOR[branch], bold: true });
      h.pos(4, y);
      this.listLayer.addChild(h);
      y += 24;
      for (const node of TALENTS) {
        if (node.branch !== branch) continue;
        this.listLayer.addChild(this.nodeRow(node, y));
        y += 44;
      }
      y += 6;
    }
  }

  private nodeRow(node: TalentNode, y: number): any {
    const rank = this.player.talents[node.id] || 0;
    const unlocked = this.player.talentUnlocked(node.id);
    const can = unlocked && this.player.talentPoints >= node.cost;
    const bg = new Laya.Sprite();
    bg.graphics.drawRoundRect(0, 0, 548, 40, 6, 6, 6, 6, unlocked ? "#1e2740" : "#161a26", "#ffffff14", 1);
    bg.pos(0, y);
    const nt = text(`${node.name} ${rank}/${node.max}`, { size: 13, color: unlocked ? "#e8ecf5" : "#6b7280", bold: true, width: 180 });
    nt.pos(8, 3);
    bg.addChild(nt);
    const dt = text(node.desc, { size: 11, color: unlocked ? "#9aa4bd" : "#5a6172", width: 250 });
    dt.pos(8, 22);
    bg.addChild(dt);
    if (rank < node.max) {
      if (!unlocked) {
        const lock = text("未解锁", { size: 11, color: "#6b7280" });
        lock.pos(300, 14);
        bg.addChild(lock);
      }
      const b = button(`+ (${node.cost})`, 64, 28, can ? "#2e6b8a" : "#3a4a5a");
      b.pos(474, 6);
      b.alpha = can ? 1 : 0.5;
      b.on(Laya.Event.CLICK, this, () => {
        const r = this.player.spendTalent(node.id);
        this.onMsg(r.ok ? `${node.name} +1` : r.reason || "无法加点");
        this.refresh();
      });
      bg.addChild(b);
    } else {
      const full = text("圆满", { size: 12, color: "#ffd166", bold: true });
      full.pos(486, 12);
      bg.addChild(full);
    }
    return bg;
  }
}
