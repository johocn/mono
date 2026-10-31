/**
 * 灵兽面板：查看已拥有灵兽、设置出战/收回，并提供「捕捉残血妖兽」入口。
 * 协战/捕捉逻辑在 Game（本面板仅调用 Player/回调）。
 */
import type { Player } from "../entities/Player";
import { getBeast } from "../data/beasts";
import { makePanel, text, button } from "./widgets";

export class BeastPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private player: Player;

  constructor(
    player: Player,
    private onMsg: (msg: string) => void,
    private onCapture: () => void,
  ) {
    this.player = player;
    const panel = makePanel(520, 430, "灵兽 · 伴生灵兽");
    this.root.addChild(panel);
    this.root.visible = false;

    const cap = button("捕捉残血妖兽", 120, 30, "#3a5a4e");
    cap.pos(16, 16);
    cap.on(Laya.Event.CLICK, this, () => { this.onCapture(); this.refresh(); });
    this.root.addChild(cap);

    const hint = text("靠近气血≤25%的妖兽，消耗【捕兽铃】尝试收服", { size: 11, color: "#9aa4bd", width: 280 });
    hint.pos(150, 22);
    this.root.addChild(hint);

    this.listLayer.pos(16, 56);
    this.root.addChild(this.listLayer);

    const close = button("关闭 (ESC)", 96, 30, "#5a2e3a");
    close.pos(414, 12);
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

  hide(): void {
    this.visible = false;
    this.root.visible = false;
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  refresh(): void {
    this.listLayer.removeChildren();
    const ids = this.player.beasts;
    if (ids.length === 0) {
      const t = text("尚未拥有灵兽。开局获赠「青鸾」，或消耗【捕兽铃】捕捉残血妖兽。", { size: 13, color: "#9aa4bd", width: 470 });
      t.pos(0, 0);
      this.listLayer.addChild(t);
      return;
    }
    let y = 0;
    for (const id of ids) {
      const b = getBeast(id);
      if (!b) continue;
      const active = this.player.activeBeast === id;
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 492, 86, 6, 6, 6, 6, "#1e2740", "#ffffff14", 1);
      bg.pos(0, y);
      const nm = text(`${active ? "★ " : ""}${b.name}`, { size: 15, color: active ? "#ffd166" : "#e8ecf5", bold: true, width: 160 });
      nm.pos(10, 6);
      bg.addChild(nm);
      const st = text(
        `攻 ${b.atk} · 防 ${b.def} · 血 ${b.hp}\n出战加成：攻+${b.bonusAtk} 防+${b.bonusDef} 血+${b.bonusHp}`,
        { size: 11, color: "#9aa4bd", width: 320 },
      );
      st.pos(10, 28);
      bg.addChild(st);
      const act = button(active ? "出战中" : "出战", 60, 30, active ? "#5a4a2e" : "#3a5a4e");
      act.pos(428, 26);
      act.alpha = active ? 0.6 : 1;
      if (!active) {
        act.on(Laya.Event.CLICK, this, () => { this.player.setActiveBeast(id); this.onMsg(`${b.name}出战`); this.refresh(); });
      }
      bg.addChild(act);
      if (active) {
        const off = button("收回", 52, 26, "#5a2e3a");
        off.pos(428, 58);
        off.on(Laya.Event.CLICK, this, () => { this.player.setActiveBeast(null); this.onMsg("已收回灵兽"); this.refresh(); });
        bg.addChild(off);
      }
      this.listLayer.addChild(bg);
      y += 92;
    }
  }
}
