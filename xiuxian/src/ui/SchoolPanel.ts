import { Player } from "../entities/Player";
import { SCHOOLS, getSchool, TALENT_SYNERGY_MUL } from "../data/schools";
import { TALENT_BRANCH_NAME } from "../data/talents";
import { text, button, makePanel } from "./widgets";

function passiveText(p: { atk?: number; def?: number; spd?: number; crit?: number }): string {
  const parts: string[] = [];
  if (p.atk) parts.push(`攻击+${Math.round(p.atk * 100)}%`);
  if (p.def) parts.push(`防御+${Math.round(p.def * 100)}%`);
  if (p.spd) parts.push(`速度+${Math.round(p.spd * 100)}%`);
  if (p.crit) parts.push(`暴击+${Math.round(p.crit * 100)}%`);
  return parts.length ? parts.join("　") : "无被动加成";
}

export class SchoolPanel {
  root: any;
  private player: Player;
  private onMsg: (m: string) => void;
  private listLayer: any;
  visible = false;

  constructor(player: Player, onMsg: (m: string) => void) {
    this.player = player;
    this.onMsg = onMsg;
    this.root = makePanel(560, 460, "功法流派");
    const close = button("关闭", 90, 32, "#533");
    close.pos(450, 14);
    close.on(Laya.Event.CLICK, this, () => { this.hide(); });
    this.root.addChild(close);
    this.listLayer = new Laya.Sprite();
    this.listLayer.pos(16, 56);
    this.root.addChild(this.listLayer);
    this.refresh();
  }

  setPlayer(p: Player): void {
    this.player = p;
    if (this.visible) this.refresh();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.visible = this.visible;
    if (this.visible) this.refresh();
  }

  hide(): void {
    this.visible = false;
    this.root.visible = false;
  }

  private refresh(): void {
    this.listLayer.removeChildren();
    let y = 0;
    const row = (name: string, desc: string, right: string, actions: { label: string; fn: () => void; enabled: boolean; w?: number }[]) => {
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 528, 70, 6, 6, 6, 6, "#1e2740", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(name, { size: 15, color: "#e8ecf5", bold: true, width: 200 });
      nt.pos(10, 6);
      bg.addChild(nt);
      const dt = text(desc, { size: 11, color: "#9aa4bd", width: 320 });
      dt.pos(10, 30);
      bg.addChild(dt);
      const rt = text(right, { size: 12, color: "#ffd166", width: 220 });
      rt.pos(330, 8);
      bg.addChild(rt);
      let bx = 446;
      for (const a of actions) {
        const w = a.w || 64;
        const b = button(a.label, w, 28, a.label === "当前" ? "#3a6ea5" : "#8a5a2e");
        b.pos(bx - w, 36);
        b.alpha = a.enabled ? 1 : 0.5;
        b.on(Laya.Event.CLICK, this, a.fn);
        bg.addChild(b);
        bx -= w + 6;
      }
      this.listLayer.addChild(bg);
      y += 76;
    };

    for (const sc of SCHOOLS) {
      const isCur = this.player.school === sc.id;
      const skills = sc.skills.map((id) => getSchool(sc.id)!.skills.includes(id) ? id : id).join("、");
      const synergyText = sc.synergy ? `\n天赋共鸣：${TALENT_BRANCH_NAME[sc.synergy]}（效果 ×${TALENT_SYNERGY_MUL}）` : "";
      row(
        sc.name,
        `${sc.desc}${synergyText}`,
        `被动：${passiveText(sc.passive)}\n技能：${skills}`,
        isCur
          ? [{ label: "当前", enabled: true, fn: () => this.onMsg("已是当前功法") }]
          : [{
              label: "切换", enabled: true,
              fn: () => { const r = this.player.setSchool(sc.id); this.onMsg(r.ok ? `已切换至「${sc.name}」` : `切换失败：${r.reason}`); this.refresh(); },
            }],
      );
    }
  }
}
