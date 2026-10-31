/**
 * 坊市面板：买入 / 卖出两个页签，货币为灵石。
 * 由货郎 NPC 或快捷键打开（Game 负责装配与命中判定）。
 */
import type { Player } from "../entities/Player";
import { getItem } from "../data/items";
import { SHOP_STOCK, buyPriceOf, sellPriceOf, canSell } from "../data/shop";
import { makePanel, text, button } from "./widgets";

type Tab = "buy" | "sell";

export class ShopPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private tab: Tab = "buy";
  private listLayer: any = new Laya.Sprite();
  private tabBtns: any[] = [];
  private stoneText: any;
  private player: Player;

  constructor(
    player: Player,
    private onMsg: (msg: string) => void,
  ) {
    this.player = player;
    const panel = makePanel(560, 460, "坊市 · 货郎周三郎");
    this.root.addChild(panel);
    this.root.visible = false;

    this.stoneText = text("", { size: 13, color: "#ffd166", bold: true, width: 240 });
    this.stoneText.pos(280, 16);
    this.root.addChild(this.stoneText);

    const btnBuy = button("买入", 90, 32, "#2e4a7a");
    btnBuy.pos(120, 12);
    const btnSell = button("卖出", 90, 32, "#2a3350");
    btnSell.pos(220, 12);
    this.tabBtns = [btnBuy, btnSell];
    this.root.addChild(btnBuy);
    this.root.addChild(btnSell);
    btnBuy.on(Laya.Event.CLICK, this, () => this.switchTab("buy"));
    btnSell.on(Laya.Event.CLICK, this, () => this.switchTab("sell"));

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

  switchTab(t: Tab): void {
    this.tab = t;
    this.tabBtns[0].graphics.clear();
    this.tabBtns[1].graphics.clear();
    this.tabBtns[0].graphics.drawRoundRect(0, 0, 90, 32, 8, 8, 8, 8, t === "buy" ? "#2e4a7a" : "#2a3350", "#ffffff33", 1);
    this.tabBtns[1].graphics.drawRoundRect(0, 0, 90, 32, 8, 8, 8, 8, t === "sell" ? "#2e4a7a" : "#2a3350", "#ffffff33", 1);
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
    this.stoneText.text = `灵石：${this.player.stones}`;
    this.listLayer.removeChildren();
    let y = 0;
    const row = (name: string, desc: string, price: string, action: { label: string; fn: () => void; enabled: boolean }) => {
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 528, 52, 6, 6, 6, 6, "#1e2740", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(name, { size: 14, color: "#e8ecf5", bold: true, width: 200 });
      nt.pos(10, 4);
      bg.addChild(nt);
      const dt = text(desc, { size: 11, color: "#9aa4bd", width: 300 });
      dt.pos(10, 26);
      bg.addChild(dt);
      const pt = text(price, { size: 12, color: action.enabled ? "#ffd166" : "#ff8a8a" });
      pt.pos(300, 16);
      bg.addChild(pt);
      const b = button(action.label, 72, 30, action.label === "卖出" ? "#7a5a2e" : "#2e6b4a");
      b.pos(446, 11);
      b.alpha = action.enabled ? 1 : 0.5;
      b.on(Laya.Event.CLICK, this, action.fn);
      bg.addChild(b);
      this.listLayer.addChild(bg);
      y += 58;
    };

    if (this.tab === "buy") {
      for (const id of SHOP_STOCK) {
        const def = getItem(id);
        if (!def) continue;
        const price = buyPriceOf(id);
        row(`${def.name}（${price} 灵石）`, def.desc, `持有 ${this.player.countItem(id)}`, {
          label: "买入",
          enabled: this.player.stones >= price,
          fn: () => {
            const r = this.player.buyItem(id, 1);
            this.onMsg(r.ok ? `买入 ${def.name} x${r.got}，花费 ${r.spent} 灵石` : `买不了：${r.reason}`);
            this.refresh();
          },
        });
      }
    } else {
      const sellable = [...this.player.inv.entries()].filter(([id]) => canSell(id));
      if (sellable.length === 0) row("（没有可出售之物）", "击败妖兽可获得妖丹、材料。", "", {
        label: "卖出", enabled: false, fn: () => {},
      });
      for (const [id, n] of sellable) {
        const def = getItem(id)!;
        const unit = sellPriceOf(id);
        row(`${def.name} x${n}`, def.desc, `回收 ${unit} 灵石/个`, {
          label: "卖出",
          enabled: n > 0,
          fn: () => {
            const r = this.player.sellItem(id, 1);
            this.onMsg(r.ok ? `卖出 ${def.name} x${r.sold}，得 ${r.gained} 灵石` : `卖不了：${r.reason}`);
            this.refresh();
          },
        });
      }
    }
  }
}
