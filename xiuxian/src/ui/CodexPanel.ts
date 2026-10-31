/**
 * 图鉴面板：怪物（未见/见过/击杀）、装备（获得）、技能（掌握）三态收集展示。
 * 复用 widgets 行布局；overUI 命中区同其它面板由 Game 统一处理。
 */
import type { Player } from "../entities/Player";
import { MONSTERS } from "../data/monsters";
import { ITEMS } from "../data/items";
import { SKILLS } from "../data/skills";
import { makePanel, text } from "./widgets";

export class CodexPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private player: Player;

  constructor(player: Player) {
    this.player = player;
    const panel = makePanel(600, 560, "游记 · 图鉴");
    this.root.addChild(panel);
    this.root.visible = false;
    this.listLayer.pos(16, 52);
    this.root.addChild(this.listLayer);
    const close = buttonClose(() => this.hide());
    this.root.addChild(close);
  }

  setPlayer(player: Player): void { this.player = player; if (this.visible) this.refresh(); }
  show(): void { this.visible = true; this.root.visible = true; this.refresh(); }
  hide(): void { this.visible = false; this.root.visible = false; }
  toggle(): void { this.visible ? this.hide() : this.show(); }

  refresh(): void {
    this.listLayer.removeChildren();
    const killed = this.player.codex.monstersKilled;
    const seen = this.player.codex.monstersSeen;
    let y = 0;

    const header = (t: string) => {
      const h = text(t, { size: 14, color: "#ffd166", bold: true });
      h.pos(4, y);
      this.listLayer.addChild(h);
      y += 22;
    };

    header(`【妖兽】击杀 ${killed.length}/${Object.keys(MONSTERS).length} · 见过 ${seen.length}`);
    for (const id of Object.keys(MONSTERS)) {
      const def = MONSTERS[id];
      const st = killed.includes(id) ? ["已击杀", "#8fd18f"] : seen.includes(id) ? ["已见过", "#7fd0e0"] : ["未知", "#5a6172"];
      const row = text(`${def.name}${def.boss ? "（Boss）" : ""}　${st[0]}`, { size: 12, color: st[1] });
      row.pos(12, y);
      this.listLayer.addChild(row);
      y += 20;
    }
    y += 6;

    const equips = Object.keys(ITEMS).filter((id) => ITEMS[id].type !== "material");
    const gotCount = equips.filter((id) => this.player.codex.itemsGot.includes(id)).length;
    header(`【宝物】获得 ${gotCount}/${equips.length}`);
    for (const id of equips) {
      const got = this.player.codex.itemsGot.includes(id);
      const row = text(`${ITEMS[id].name}　${got ? "已获得" : "未获得"}`, { size: 12, color: got ? "#e8ecf5" : "#5a6172" });
      row.pos(12, y);
      this.listLayer.addChild(row);
      y += 20;
    }
    y += 6;

    const learned = this.player.codex.skillsLearned;
    header(`【功法】掌握 ${learned.length}/${SKILLS.length}`);
    const names = learned.map((id) => SKILLS.find((s) => s.id === id)?.name).filter(Boolean);
    const skillText = text(names.length ? names.join("、") : "尚未习得任何功法", { size: 12, color: "#9aa4bd", width: 560, height: 90 });
    skillText.pos(12, y);
    skillText.leading = 4;
    this.listLayer.addChild(skillText);
  }
}

// 关闭按钮（局部辅助，避免每个面板重复 import button 的位置计算差异）
function buttonClose(onClick: () => void): any {
  const b = new Laya.Sprite();
  b.graphics.drawRoundRect(0, 0, 96, 32, 8, 8, 8, 8, "#5a2e3a", "#ffffff33", 1);
  b.size(96, 32);
  b.pos(482, 12);
  const t = new Laya.Text();
  t.text = "关闭 (C)";
  t.fontSize = 15;
  t.color = "#ffffff";
  t.bold = true;
  t.align = "center";
  t.width = 96;
  t.height = 32;
  t.valign = "middle";
  b.addChild(t);
  b.on(Laya.Event.CLICK, b, onClick);
  return b;
}
