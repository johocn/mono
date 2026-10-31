/**
 * 背包面板：道具 / 装备两个页签。
 * 道具页：消耗品使用、材料展示；装备页：背包内装备穿戴、已穿装备卸下。
 */
import type { Player } from "../entities/Player";
import { getItem, type EquipSlot } from "../data/items";
import { SETS } from "../data/sets";
import { getRarity } from "../data/rarity";
import { makePanel, text, button } from "./widgets";

type Tab = "item" | "equip";

export class BagPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private tab: Tab = "item";
  private listLayer: any = new Laya.Sprite();
  private tabBtns: any[] = [];
  private player: Player;
  private powerText: any;

  constructor(
    player: Player,
    private onUse: (msg: string) => void,
  ) {
    this.player = player;
    const panel = makePanel(560, 460, "储物袋");
    this.root.addChild(panel);
    this.root.visible = false;

    const btnItem = button("道具", 90, 32, "#2e4a7a");
    btnItem.pos(120, 12);
    const btnEquip = button("装备", 90, 32, "#2a3350");
    btnEquip.pos(220, 12);
    this.tabBtns = [btnItem, btnEquip];
    this.root.addChild(btnItem);
    this.root.addChild(btnEquip);
    btnItem.on(Laya.Event.CLICK, this, () => this.switchTab("item"));
    btnEquip.on(Laya.Event.CLICK, this, () => this.switchTab("equip"));

    this.listLayer.pos(16, 56);
    this.root.addChild(this.listLayer);

    this.powerText = text("", { size: 13, color: "#ffd166", bold: true, width: 200 });
    this.powerText.pos(16, 40);
    this.root.addChild(this.powerText);

    const close = button("关闭 (B)", 90, 32, "#5a2e3a");
    close.pos(460, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);
  }

  /** 新开一局后替换玩家引用（背包内容随之切换） */
  setPlayer(player: Player): void {
    this.player = player;
    if (this.visible) this.refresh();
  }

  switchTab(t: Tab): void {
    this.tab = t;
    this.tabBtns[0].graphics.clear();
    this.tabBtns[1].graphics.clear();
    this.tabBtns[0].graphics.drawRoundRect(0, 0, 90, 32, 8, 8, 8, 8, t === "item" ? "#2e4a7a" : "#2a3350", "#ffffff33", 1);
    this.tabBtns[1].graphics.drawRoundRect(0, 0, 90, 32, 8, 8, 8, 8, t === "equip" ? "#2e4a7a" : "#2a3350", "#ffffff33", 1);
    this.refresh();
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
    this.powerText.text = `战力 ${this.player.fightPower}`;
    this.listLayer.removeChildren();
    let y = 0;
    const row = (name: string, desc: string, right: string, action?: { label: string; fn: () => void }, nameColor?: string) => {
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 528, 58, 6, 6, 6, 6, "#1e2740", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(name, { size: 14, color: nameColor || "#e8ecf5", bold: true, width: 200 });
      nt.pos(10, 4);
      bg.addChild(nt);
      const dt = text(desc, { size: 11, color: "#9aa4bd", width: 410 });
      dt.pos(10, 24);
      bg.addChild(dt);
      if (right) {
        const rt = text(right, { size: 12, color: "#ffd166" });
        rt.pos(300, 16);
        bg.addChild(rt);
      }
      if (action) {
        const b = button(action.label, 72, 30, action.label.includes("卸") ? "#5a3a2e" : "#2e6b4a");
        b.pos(446, 14);
        b.on(Laya.Event.CLICK, this, action.fn);
        bg.addChild(b);
      }
      this.listLayer.addChild(bg);
      y += 64;
    };

    /** 装备描述追加词条与套装标识（第二行） */
    const equipDesc = (id: string): string => {
      const def = getItem(id)!;
      const tags: string[] = [];
      const rar = getRarity(this.player.rarityOf(id));
      if (rar.statMul > 1) tags.push(`品质·${rar.name}(+${Math.round((rar.statMul - 1) * 100)}%)`);
      const af = this.player.affixes[id];
      if (af) {
        if (af.atk) tags.push(`攻+${af.atk}`);
        if (af.def) tags.push(`防+${af.def}`);
        if (af.spd) tags.push(`速+${af.spd}`);
        if (af.crit) tags.push(`暴+${af.crit}`);
        if (af.lifesteal) tags.push(`吸+${af.lifesteal}`);
      }
      if (def.set) tags.push(`套装·${SETS[def.set]?.name || def.set}`);
      return tags.length ? `${def.desc}\n${tags.join("  ")}` : def.desc;
    };

    if (this.tab === "item") {
      const entries = [...this.player.inv.entries()].filter(([id]) => getItem(id)?.type === "consumable");
      if (entries.length === 0) row("（没有消耗品）", "击败妖兽或完成任务可获得丹药。", "");
      for (const [id, n] of entries) {
        const def = getItem(id)!;
        row(`${def.name} x${n}`, def.desc, "", {
          label: "使用",
          fn: () => {
            const msg = this.player.useConsumable(id);
            if (msg) this.onUse(`使用了${def.name}：${msg}`);
            this.refresh();
          },
        });
      }
      const mats = [...this.player.inv.entries()].filter(([id]) => getItem(id)?.type === "material");
      for (const [id, n] of mats) {
        const def = getItem(id)!;
        row(`${def.name} x${n}`, def.desc, "材料");
      }
    } else {
      const slots: EquipSlot[] = ["weapon", "armor", "trinket"];
      const slotName: Record<EquipSlot, string> = { weapon: "武器", armor: "防具", trinket: "饰品" };
      for (const slot of slots) {
        const id = this.player.equipment[slot];
        if (id) {
          const def = getItem(id)!;
          const rar = getRarity(this.player.rarityOf(id));
          row(`${def.name}（${slotName[slot]}·${rar.name}）`, equipDesc(id), "已装备", {
            label: "卸下",
            fn: () => {
              this.player.unequip(slot);
              this.refresh();
            },
          }, rar.color);
        } else {
          row(`（${slotName[slot]}空）`, "", "");
        }
      }
      const equippable = [...this.player.inv.entries()].filter(([id]) => {
        const t = getItem(id)?.type;
        return t === "weapon" || t === "armor" || t === "trinket";
      });
      if (equippable.length === 0) row("（背包内没有装备）", "", "");
      for (const [id, n] of equippable) {
        const def = getItem(id)!;
        const rar = getRarity(this.player.rarityOf(id));
        row(`${def.name}（${rar.name}） x${n}`, equipDesc(id), "", {
          label: "穿戴",
          fn: () => {
            this.player.equip(id);
            this.refresh();
          },
        }, rar.color);
      }
    }
  }
}
