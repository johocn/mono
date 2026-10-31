/**
 * 建造面板：列出可建造建筑（含材料消耗与是否买得起），选择后进入放置模式。
 * 拆除模式由 Game 在点击建筑时处理。按 N 开关。
 */
import { BUILDINGS, type BuildingDef } from "../data/buildings";
import { getItem } from "../data/items";
import { button, makePanel, text } from "./widgets";

export interface BuildCallbacks {
  onSelect: (id: string) => void;
  onDemolish: () => void;
  onClose: () => void;
}

export class BuildPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private rows: { def: BuildingDef; afford: any; btn: any }[] = [];
  private demolishBtn: any;

  constructor(private player: any, private cb: BuildCallbacks) {
    const W = 250;
    const H = 40 + BUILDINGS.length * 50 + 44;
    const p = makePanel(W, H, "建造 · 修整山镇");
    this.root.addChild(p);

    BUILDINGS.forEach((def, i) => {
      const y = 40 + i * 50;
      const row = new Laya.Sprite();
      row.graphics.drawRoundRect(0, 0, W - 24, 44, 6, 6, 6, 6, "#222b40", "#ffffff14", 1);
      row.pos(12, y);
      const name = text(def.name, { size: 14, color: "#e8ecf5", bold: true });
      name.pos(10, 5);
      row.addChild(name);
      const desc = text(def.desc, { size: 10, color: "#9aa4bd" });
      desc.pos(10, 24);
      row.addChild(desc);
      const cost = text("", { size: 11, color: "#ffd166" });
      cost.pos(150, 5);
      row.addChild(cost);
      const btn = button("建造", 56, 28, "#2e6b4a");
      btn.pos(150, 12);
      btn.on(Laya.Event.CLICK, this, () => this.cb.onSelect(def.id));
      row.addChild(btn);
      this.root.addChild(row);
      this.rows.push({ def, afford: cost, btn });
    });

    const dem = button("拆除模式", 110, 32, "#7a3a3a");
    dem.pos(12, H - 38);
    dem.on(Laya.Event.CLICK, this, () => this.cb.onDemolish());
    this.root.addChild(dem);
    this.demolishBtn = dem;

    const close = button("关闭 (N)", 110, 32, "#5a2e3a");
    close.pos(128, H - 38);
    close.on(Laya.Event.CLICK, this, () => this.cb.onClose());
    this.root.addChild(close);

    this.root.visible = false;
  }

  setPlayer(player: any): void {
    this.player = player;
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
    for (const r of this.rows) {
      const c = r.def.cost;
      const wood = this.player.countItem("wood");
      const stone = this.player.countItem("stone");
      const okW = wood >= c.wood;
      const okS = stone >= c.stone;
      r.afford.text = `${c.wood ? "木" + c.wood : ""}${c.stone ? " 石" + c.stone : ""}`;
      r.afford.color = okW && okS ? "#ffd166" : "#ff8a8a";
      r.btn.alpha = okW && okS ? 1 : 0.5;
    }
  }

  layout(viewW: number, viewH: number): void {
    this.root.x = viewW - 266;
    this.root.y = Math.max(200, viewH / 2 - this.root.height / 2);
  }
}
