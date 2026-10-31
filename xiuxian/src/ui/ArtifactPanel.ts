/**
 * 法宝面板：查看已拥有法宝的被动属性与主动技，可装备/卸下。
 * 复用 widgets 行布局；overUI 命中区同其它面板由 Game 统一处理。
 */
import type { Player } from "../entities/Player";
import { getArtifact, type ArtifactDef } from "../data/artifacts";
import { getSkill } from "../data/skills";
import { makePanel, text, button } from "./widgets";

function statLine(a: ArtifactDef): string {
  const parts: string[] = [];
  if (a.atk) parts.push(`攻+${a.atk}`);
  if (a.def) parts.push(`防+${a.def}`);
  if (a.hp) parts.push(`血+${a.hp}`);
  if (a.spd) parts.push(`速+${Math.round(a.spd * 100)}%`);
  if (a.crit) parts.push(`暴+${Math.round(a.crit * 100)}%`);
  return parts.join(" ") || "无";
}

export class ArtifactPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private player: Player;

  constructor(player: Player, private onMsg: (msg: string) => void) {
    this.player = player;
    const panel = makePanel(560, 460, "法宝 · 圣物");
    this.root.addChild(panel);
    this.root.visible = false;

    this.listLayer.pos(16, 56);
    this.root.addChild(this.listLayer);

    const close = button("关闭 (O)", 96, 32, "#5a2e3a");
    close.pos(444, 12);
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
    this.listLayer.removeChildren();
    const owned = this.player.ownedArtifacts;
    if (owned.length === 0) {
      const t = text("尚未获得法宝。推进剧情、拜入宗门或斩杀强敌可获得法宝。", { size: 13, color: "#9aa4bd", width: 520 });
      t.pos(8, 8);
      this.listLayer.addChild(t);
      return;
    }
    let y = 0;
    for (const id of owned) {
      const a = getArtifact(id);
      if (!a) continue;
      const equipped = this.player.artifact === id;
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 528, 60, 6, 6, 6, 6, equipped ? "#26304a" : "#1e2740", equipped ? "#ffd166" : "#ffffff14", equipped ? 2 : 1);
      bg.pos(0, y);
      const nt = text(`${a.name}${equipped ? "（已装备）" : ""}`, { size: 14, color: "#e8ecf5", bold: true, width: 240 });
      nt.pos(8, 4);
      bg.addChild(nt);
      const skillName = getSkill(a.skill)?.name || a.skill;
      const dt = text(`${a.desc}\n被动：${statLine(a)} · 主动技：${skillName}\n途径：${a.source}`, { size: 11, color: "#9aa4bd", width: 380, height: 40 });
      dt.pos(8, 20);
      dt.leading = 2;
      bg.addChild(dt);
      const b = button(equipped ? "卸下" : "装备", 72, 30, equipped ? "#5a2e3a" : "#2e6b8a");
      b.pos(446, 15);
      b.on(Laya.Event.CLICK, this, () => {
        if (equipped) { this.player.unequipArtifact(); this.onMsg(`卸下 ${a.name}`); }
        else { this.player.equipArtifact(id); this.onMsg(`装备 ${a.name}`); }
        this.refresh();
      });
      bg.addChild(b);
      this.listLayer.addChild(bg);
      y += 66;
    }
  }
}
