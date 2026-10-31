/**
 * 日常任务面板：今日任务列表 + 进度 + 领奖（按日期播种，跨天刷新）。
 * 复用 widgets 行布局；overUI 命中区同其它面板由 Game 统一处理。
 */
import type { Player } from "../entities/Player";
import { getDaily } from "../data/dailies";
import { makePanel, text, button } from "./widgets";

export class DailyPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private dateText: any;
  private player: Player;

  constructor(player: Player, private onMsg: (msg: string) => void) {
    this.player = player;
    const panel = makePanel(520, 360, "日课 · 事务");
    this.root.addChild(panel);
    this.root.visible = false;

    this.dateText = text("", { size: 12, color: "#7fd0e0", bold: true, width: 240 });
    this.dateText.pos(280, 18);
    this.root.addChild(this.dateText);

    this.listLayer.pos(16, 56);
    this.root.addChild(this.listLayer);

    const close = button("关闭 (Q)", 96, 32, "#5a2e3a");
    close.pos(408, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);
  }

  setPlayer(player: Player): void { this.player = player; if (this.visible) this.refresh(); }
  show(): void { this.visible = true; this.root.visible = true; this.refresh(); }
  hide(): void { this.visible = false; this.root.visible = false; }
  toggle(): void { this.visible ? this.hide() : this.show(); }

  refresh(): void {
    this.dateText.text = this.player.daily.date ? `日期：${this.player.daily.date}` : "今日尚无日课";
    this.listLayer.removeChildren();
    if (this.player.daily.ids.length === 0) {
      const t = text("今日日课尚未生成。", { size: 13, color: "#9aa4bd" });
      t.pos(8, 8);
      this.listLayer.addChild(t);
      return;
    }
    let y = 0;
    for (const id of this.player.daily.ids) {
      const d = getDaily(id);
      if (!d) continue;
      const prog = Math.min(d.goal, this.player.daily.progress[id] || 0);
      const claimed = this.player.daily.claimed.includes(id);
      const done = prog >= d.goal;
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 488, 56, 6, 6, 6, 6, done ? "#1e2740" : "#161a26", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(d.name, { size: 13, color: "#e8ecf5", bold: true, width: 160 });
      nt.pos(8, 4);
      bg.addChild(nt);
      const dt = text(`${d.desc} · 奖励：${d.reward.exp ? `修为+${d.reward.exp} ` : ""}${d.reward.stones ? `灵石+${d.reward.stones}` : ""}`.trim(), { size: 11, color: "#9aa4bd", width: 300 });
      dt.pos(8, 26);
      bg.addChild(dt);
      const pt = text(`${prog}/${d.goal}`, { size: 13, color: done ? "#8fd18f" : "#ffd166", bold: true });
      pt.pos(330, 18);
      bg.addChild(pt);
      if (claimed) {
        const c = text("已领", { size: 12, color: "#8fd18f" });
        c.pos(420, 18);
        bg.addChild(c);
      } else {
        const b = button(done ? "领取" : "未完成", 72, 30, done ? "#2e6b8a" : "#3a4a5a");
        b.pos(404, 13);
        b.alpha = done ? 1 : 0.5;
        b.on(Laya.Event.CLICK, this, () => {
          const r = this.player.claimDaily(id);
          this.onMsg(r.ok ? `领取「${d.name}」奖励` : r.reason || "无法领取");
          this.refresh();
        });
        bg.addChild(b);
      }
      this.listLayer.addChild(bg);
      y += 62;
    }
  }
}
