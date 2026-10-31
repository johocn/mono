/**
 * 技能栏：底部 4 个槽位，显示按键/图标/冷却遮罩与秒数。
 */
import type { Player } from "../entities/Player";
import { getSkill } from "../data/skills";
import { text, hit } from "./widgets";

const SLOT_COLORS: Record<string, string> = {
  sword: "#5f8d4e",
  law: "#a05195",
  universal: "#4a7ba5",
};

export class SkillBar {
  readonly root: any = new Laya.Sprite();
  private slots: { bg: any; icon: any; name: any; key: any; cd: any; cdText: any }[] = [];

  constructor() {
    for (let i = 0; i < 4; i++) {
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 58, 58, 8, 8, 8, 8, "#141828cc", "#3a4a6a", 2);
      const icon = new Laya.Sprite();
      icon.graphics.drawRoundRect(9, 9, 40, 40, 8, 8, 8, 8, "#555", "#ffffff22", 1);
      bg.addChild(icon);
      const name = text("", { size: 12, color: "#fff", bold: true, align: "center", width: 58 });
      name.pos(0, 40);
      bg.addChild(name);
      const key = text(String(i + 1), { size: 11, color: "#ffd166", bold: true });
      key.pos(4, 2);
      bg.addChild(key);
      const cd = new Laya.Sprite();
      cd.graphics.drawRoundRect(0, 0, 58, 58, 8, 8, 8, 8, "#000000b0", null, 0);
      cd.visible = false;
      bg.addChild(cd);
      const cdText = text("", { size: 16, color: "#fff", bold: true, align: "center", width: 58, height: 58 });
      cdText.valign = "middle";
      cdText.visible = false;
      bg.addChild(cdText);
      this.root.addChild(bg);
      this.slots.push({ bg, icon, name, key, cd, cdText });
      hit(bg, 58, 58); // 真实鼠标命中（Laya 须显式 mouseEnabled + hitArea）
    }
  }

  layout(viewW: number, viewH: number, bottomInset: number): void {
    const total = 4 * 58 + 3 * 10;
    const x0 = viewW / 2 - total / 2;
    for (let i = 0; i < 4; i++) {
      this.slots[i].bg.x = x0 + i * 68;
      this.slots[i].bg.y = viewH - 74 - bottomInset;
    }
  }

  update(player: Player): void {
    for (let i = 0; i < 4; i++) {
      const slot = this.slots[i];
      const skill = player.skillInSlot(i);
      if (!skill) {
        slot.icon.graphics.clear();
        slot.icon.graphics.drawRoundRect(9, 9, 40, 40, 8, 8, 8, 8, "#333a4a", "#ffffff22", 1);
        slot.name.text = "";
        slot.cd.visible = false;
        slot.cdText.visible = false;
        continue;
      }
      slot.icon.graphics.clear();
      slot.icon.graphics.drawRoundRect(9, 9, 40, 40, 8, 8, 8, 8, SLOT_COLORS[skill.branch] || "#555", "#ffffff33", 1);
      slot.name.text = skill.name;
      const cd = player.cdOf(skill.id);
      if (cd > 0) {
        slot.cd.visible = true;
        slot.cdText.visible = true;
        slot.cdText.text = cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1);
      } else {
        slot.cd.visible = false;
        slot.cdText.visible = false;
      }
    }
  }
}
