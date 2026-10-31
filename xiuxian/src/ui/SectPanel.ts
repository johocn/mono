/**
 * 宗门面板：玄水宗声望兑换（新装备 / 消耗品 / 传功技能）。
 * 复用 ShopPanel 行布局与 widgets，560x460 居中，overUI 需同步命中区。
 */
import type { Player } from "../entities/Player";
import { getItem } from "../data/items";
import { SECT_NAME, SECT_EXCHANGES, type SectExchange } from "../data/sect";
import { makePanel, text, button } from "./widgets";

export class SectPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private repText: any;
  private player: Player;

  constructor(
    player: Player,
    private onMsg: (msg: string) => void,
  ) {
    this.player = player;
    const panel = makePanel(560, 460, `${SECT_NAME} · 宗门大殿`);
    this.root.addChild(panel);
    this.root.visible = false;

    this.repText = text("", { size: 13, color: "#7fd0e0", bold: true, width: 260 });
    this.repText.pos(280, 16);
    this.root.addChild(this.repText);

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
  hide(): void {
    this.visible = false;
    this.root.visible = false;
  }
  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  refresh(): void {
    const sect = this.player.sect;
    this.repText.text = sect ? `声望：${this.player.reputation}` : "尚未拜入宗门（散修）";
    this.listLayer.removeChildren();
    let y = 0;
    const row = (ex: SectExchange) => {
      const enough = this.player.reputation >= ex.cost;
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 528, 52, 6, 6, 6, 6, "#1e2740", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(ex.name, { size: 14, color: "#e8ecf5", bold: true, width: 200 });
      nt.pos(10, 4);
      bg.addChild(nt);
      const dt = text(ex.desc, { size: 11, color: "#9aa4bd", width: 300 });
      dt.pos(10, 26);
      bg.addChild(dt);
      const ct = text(`声望 ${ex.cost}`, { size: 12, color: enough ? "#7fd0e0" : "#ff8a8a" });
      ct.pos(300, 16);
      bg.addChild(ct);
      const b = button("兑换", 72, 30, enough ? "#2e6b8a" : "#3a4a5a");
      b.pos(446, 11);
      b.alpha = enough ? 1 : 0.5;
      b.on(Laya.Event.CLICK, this, () => this.exchange(ex));
      bg.addChild(b);
      this.listLayer.addChild(bg);
      y += 58;
    };
    for (const ex of SECT_EXCHANGES) row(ex);
  }

  private exchange(ex: SectExchange): void {
    if (!this.player.spendRep(ex.cost)) {
      this.onMsg("声望不足");
      return;
    }
    if (ex.reward.t === "item") {
      const got = this.player.addItem(ex.reward.id, ex.reward.n);
      if (got <= 0) {
        this.player.gainRep(ex.cost); // 背包满则返还
        this.onMsg("储物袋已满，无法兑换");
        this.refresh();
        return;
      }
      const name = getItem(ex.reward.id)?.name || ex.reward.id;
      this.onMsg(`兑换 ${name} x${got}，消耗 ${ex.cost} 声望`);
    } else {
      const sid = ex.reward.id;
      if (this.player.learned.includes(sid)) {
        this.player.gainRep(ex.cost); // 已掌握则返还
        this.onMsg("该功法已掌握");
        this.refresh();
        return;
      }
      this.player.applyEffects([{ t: "learnSkill", id: sid }]);
      this.onMsg(`传功成功，消耗 ${ex.cost} 声望`);
    }
    this.refresh();
  }
}
