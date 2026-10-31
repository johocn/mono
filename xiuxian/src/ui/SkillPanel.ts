/**
 * 技能面板：展示已习得技能，可装入 1-4 号技能栏槽位。
 */
import type { Player } from "../entities/Player";
import { getSkill } from "../data/skills";
import { makePanel, text, button } from "./widgets";

const BRANCH_NAME: Record<string, string> = { sword: "剑修", law: "法修", universal: "通用" };

export class SkillPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private player: Player;

  constructor(player: Player) {
    this.player = player;
    const panel = makePanel(560, 460, "修习成果");
    this.root.addChild(panel);
    this.root.visible = false;
    this.listLayer.pos(16, 56);
    this.root.addChild(this.listLayer);
    const close = button("关闭 (K)", 90, 32, "#5a2e3a");
    close.pos(460, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);
  }

  /** 新开一局后替换玩家引用 */
  setPlayer(player: Player): void {
    this.player = player;
    if (this.visible) this.refresh();
  }

  show(): void {
    this.visible = true;
    this.root.visible = true;
    this.refresh();
  }
  hide(): void {
    this.visible = false;
    this.root.visible = false;
  }
  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  refresh(): void {
    this.listLayer.removeChildren();
    let y = 0;
    if (this.player.learned.length === 0) {
      const t = text("尚未习得任何法术。", { size: 13, color: "#9aa4bd" });
      t.pos(10, y);
      this.listLayer.addChild(t);
      return;
    }
    for (const id of this.player.learned) {
      const def = getSkill(id)!;
      const equippedSlot = this.player.equipped.indexOf(id);
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 528, 60, 6, 6, 6, 6, "#1e2740", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(`${def.name}（${BRANCH_NAME[def.branch]}）`, { size: 14, color: "#e8ecf5", bold: true, width: 220 });
      nt.pos(10, 4);
      bg.addChild(nt);
      const info = text(
        `耗蓝 ${def.mpCost} · 冷却 ${def.cd}s · 射程 ${def.range}格${def.aoe > 0 ? ` · 范围 ${def.aoe}格` : ""}`,
        { size: 11, color: "#9aa4bd" },
      );
      info.pos(10, 24);
      bg.addChild(info);
      const dt = text(def.desc, { size: 11, color: "#8f7fb8", width: 300 });
      dt.pos(10, 40);
      bg.addChild(dt);
      if (equippedSlot >= 0) {
        const tag = text(`槽位 ${equippedSlot + 1}`, { size: 12, color: "#ffd166", bold: true });
        tag.pos(300, 20);
        bg.addChild(tag);
      }
      for (let s = 0; s < 4; s++) {
        const b = button(String(s + 1), 34, 30, equippedSlot === s ? "#2e6b4a" : "#2a3350");
        b.pos(398 + s * 34, 15);
        b.on(Laya.Event.CLICK, this, () => {
          this.player.equipSkill(s, id);
          this.refresh();
        });
        bg.addChild(b);
      }
      this.listLayer.addChild(bg);
      y += 66;
    }
  }
}
