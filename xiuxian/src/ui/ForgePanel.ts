/**
 * 炼器 / 炼丹 面板：消耗灵石 + 妖丹提升装备强化等级（+0 ~ +9，失败不掉级）；
 * 「炼丹」标签页按丹方消耗材料炼制丹药。由铁匠 NPC 打开（Game 负责装配与命中判定）。
 */
import type { Player } from "../entities/Player";
import { getItem, isEquipment } from "../data/items";
import { FORGE_MAX, forgeBonusOf, forgeCostOf, forgeRateOf, itemLabel } from "../data/shop";
import { getGem, gemsForSlot, REFINE_COST } from "../data/gems";
import { ALEMBIC_RECIPES } from "../data/alembic";
import { makePanel, text, button } from "./widgets";

export class ForgePanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private stoneText: any;
  private forgeTabBtn: any;
  private alchemyTabBtn: any;
  private tab: "forge" | "alchemy" = "forge";
  private listY = 0;
  private player: Player;

  constructor(
    player: Player,
    private onMsg: (msg: string) => void,
  ) {
    this.player = player;
    const panel = makePanel(560, 460, "炼器 · 丹房");
    this.root.addChild(panel);
    this.root.visible = false;

    this.stoneText = text("", { size: 13, color: "#ffd166", bold: true, width: 320 });
    this.stoneText.pos(200, 16);
    this.root.addChild(this.stoneText);

    // 标签：炼器 / 炼丹（共用面板，避免面板膨胀）
    this.forgeTabBtn = button("炼器", 70, 28, "#8a5a2e");
    this.forgeTabBtn.pos(16, 14);
    this.forgeTabBtn.on(Laya.Event.CLICK, this, () => { this.tab = "forge"; this.refresh(); });
    this.root.addChild(this.forgeTabBtn);
    this.alchemyTabBtn = button("炼丹", 70, 28, "#8a5a2e");
    this.alchemyTabBtn.pos(92, 14);
    this.alchemyTabBtn.on(Laya.Event.CLICK, this, () => { this.tab = "alchemy"; this.refresh(); });
    this.root.addChild(this.alchemyTabBtn);

    this.listLayer.pos(16, 56);
    this.root.addChild(this.listLayer);

    const close = button("关闭 (ESC)", 96, 32, "#5a2e3a");
    close.pos(454, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);
  }

  setPlayer(player: Player): void {
    this.player = player;
    if (this.visible) this.refresh();
  }

  show(): void {
    this.visible = true;
    this.root.visible = true;
    this.refresh();
  }

  /** 直接以炼丹标签打开 */
  showAlchemy(): void {
    this.tab = "alchemy";
    this.show();
  }

  hide(): void {
    this.visible = false;
    this.root.visible = false;
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  /** 通用行渲染（炼器/炼丹共用） */
  private row(
    name: string, desc: string, right: string,
    actions: { label: string; fn: () => void; enabled: boolean; w?: number }[],
  ): void {
    const bg = new Laya.Sprite();
    bg.graphics.drawRoundRect(0, 0, 528, 70, 6, 6, 6, 6, "#1e2740", "#ffffff14", 1);
    bg.pos(0, this.listY);
    const nt = text(name, { size: 14, color: "#e8ecf5", bold: true, width: 200 });
    nt.pos(10, 5);
    bg.addChild(nt);
    const dt = text(desc, { size: 11, color: "#9aa4bd", width: 320 });
    dt.pos(10, 26);
    bg.addChild(dt);
    const rt = text(right, { size: 12, color: actions.some((a) => a.enabled) ? "#ffd166" : "#ff8a8a" });
    rt.pos(330, 6);
    bg.addChild(rt);
    let bx = 446;
    for (const a of actions) {
      const w = a.w || 56;
      const b = button(a.label, w, 28, "#8a5a2e");
      b.pos(bx - w, 36);
      b.alpha = a.enabled ? 1 : 0.5;
      b.on(Laya.Event.CLICK, this, a.fn);
      bg.addChild(b);
      bx -= w + 6;
    }
    this.listLayer.addChild(bg);
    this.listY += 76;
  }

  refresh(): void {
    this.listLayer.removeChildren();
    this.listY = 0;
    this.forgeTabBtn.alpha = this.tab === "forge" ? 1 : 0.5;
    this.alchemyTabBtn.alpha = this.tab === "alchemy" ? 1 : 0.5;
    if (this.tab === "alchemy") this.renderAlchemy();
    else this.renderForge();
  }

  /** 某装备在指定等级下的属性文案 */
  private statText(id: string, level: number): string {
    const def = getItem(id);
    if (!def) return "";
    const b = forgeBonusOf(id, level);
    const parts: string[] = [];
    if (def.atk) parts.push(`攻 ${(def.atk + b.atk).toFixed(1)}`);
    if (def.def) parts.push(`防 ${(def.def + b.def).toFixed(1)}`);
    if (def.spd) parts.push(`速 ${Math.round((def.spd + b.spd) * 100)}%`);
    if (def.crit) parts.push(`暴 ${Math.round((def.crit + b.crit) * 100)}%`);
    return parts.join(" ") || "—";
  }

  private renderForge(): void {
    this.stoneText.text = `灵石 ${this.player.stones} · 妖丹 ${this.player.countItem("yaodan")}`;

    const ids = new Set<string>();
    for (const id of Object.values(this.player.equipment)) if (id) ids.add(id);
    for (const [id, n] of this.player.inv) if (n > 0 && isEquipment(id)) ids.add(id);

    if (ids.size === 0) {
      this.row("（尚无可供炼器的装备）", "击败妖兽、完成委托或在坊市购置装备。", "", []);
      return;
    }

    for (const id of ids) {
      const def = getItem(id)!;
      const lv = this.player.forgeLevel(id);
      const maxed = lv >= FORGE_MAX;
      const cost = forgeCostOf(lv);
      const rate = Math.round(forgeRateOf(lv) * 100);
      const afford = this.player.stones >= cost.stones && this.player.countItem("yaodan") >= cost.yaodan;
      const desc = maxed
        ? `${this.statText(id, lv)}（已至圆满）`
        : `${this.statText(id, lv)} → ${this.statText(id, lv + 1)}　成率 ${rate}%`;
      const right = maxed ? "圆满" : `炼 ${cost.stones}灵 ${cost.yaodan}丹`;
      // 宝石状态与可镶嵌判定
      const gemId = this.player.gems[id];
      const gemName = gemId ? getGem(gemId)?.name : null;
      const gemDesc = gemName ? `　宝石·${gemName}` : "";
      const canSocket = !!gemsForSlot(def.slot!).find((g) => this.player.countItem(g) > 0);
      const actions = [
        {
          label: maxed ? "圆满" : "炼器", w: 60, enabled: !maxed && afford,
          fn: () => {
            const r = this.player.upgradeForge(id);
            this.onMsg(
              !r.ok
                ? `炼器失败：${r.reason}`
                : r.success
                  ? `炼器成功：${itemLabel(id, r.level)}！`
                  : `炼器未成，${def.name} 仍为 +${r.level}（材料已耗）`,
            );
            this.refresh();
          },
        },
        {
          label: "洗练", w: 48, enabled: this.player.stones >= REFINE_COST,
          fn: () => {
            const r = this.player.refine(id);
            this.onMsg(r.ok ? `洗练成功：${def.name} 词条已重铸` : `洗练失败：${r.reason}`);
            this.refresh();
          },
        },
        gemId
          ? {
              label: "卸宝", w: 48, enabled: true,
              fn: () => { const r = this.player.unsocketGem(id); this.onMsg(r.ok ? "已卸下宝石" : `卸下失败：${r.reason}`); this.refresh(); },
            }
          : {
              label: "镶嵌", w: 48, enabled: !!canSocket,
              fn: () => {
                const g = gemsForSlot(def.slot!).find((gg) => this.player.countItem(gg) > 0);
                if (!g) { this.onMsg("无可用宝石"); return; }
                const r = this.player.socketGem(id, g);
                this.onMsg(r.ok ? `镶嵌成功：${getGem(g)!.name}` : `镶嵌失败：${r.reason}`);
                this.refresh();
              },
            },
      ];
      this.row(`${itemLabel(id, lv)}${gemDesc}`, desc, right, actions);
    }
  }

  private renderAlchemy(): void {
    this.stoneText.text = `灵石 ${this.player.stones}`;
    for (const r of ALEMBIC_RECIPES) {
      const ingText = r.ingredients.map((i) => `${getItem(i.id)?.name ?? i.id}×${i.n}`).join(" ");
      const haveAll =
        r.ingredients.every((i) => this.player.countItem(i.id) >= i.n) &&
        (!r.stones || this.player.stones >= r.stones);
      const right = `产 ${getItem(r.out.id)?.name ?? r.out.id}×${r.out.n}` + (r.stones ? ` · ${r.stones}灵` : "");
      const actions = [
        {
          label: "炼制", w: 64, enabled: haveAll,
          fn: () => {
            const res = this.player.alchemize(r.id);
            if (!res.ok) this.onMsg(`炼丹失败：${res.reason}`);
            else if (res.success) this.onMsg(`炼丹成功：获得 ${getItem(res.got!.id)?.name}×${res.got!.n}`);
            else this.onMsg(`炼丹失败：${res.reason ?? "丹炉炸裂，材料尽毁"}`);
            this.refresh();
          },
        },
      ];
      this.row(r.name, `${r.desc}\n需 ${ingText}`, right, actions);
    }
  }
}
