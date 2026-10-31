/**
 * 成就面板：列出全部成就的达成/领取状态与奖励。
 * 复用 widgets 行布局；overUI 命中区同其它面板由 Game 统一处理。
 */
import type { Player } from "../entities/Player";
import { ACHIEVEMENTS } from "../data/achievements";
import { makePanel, text, button } from "./widgets";

export class AchievementsPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private infoText: any;
  private player: Player;

  constructor(player: Player, private onMsg: (msg: string) => void) {
    this.player = player;
    const panel = makePanel(560, 520, "荣耀 · 成就");
    this.root.addChild(panel);
    this.root.visible = false;

    this.infoText = text("", { size: 12, color: "#7fd0e0", bold: true, width: 240 });
    this.infoText.pos(300, 18);
    this.root.addChild(this.infoText);

    this.listLayer.pos(16, 52);
    this.root.addChild(this.listLayer);

    const close = button("关闭 (A)", 96, 32, "#5a2e3a");
    close.pos(448, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);
  }

  setPlayer(player: Player): void { this.player = player; if (this.visible) this.refresh(); }
  show(): void { this.visible = true; this.root.visible = true; this.refresh(); }
  hide(): void { this.visible = false; this.root.visible = false; }
  toggle(): void { this.visible ? this.hide() : this.show(); }

  refresh(): void {
    this.infoText.text = `已解锁 ${this.player.achievements.unlocked.length}/${ACHIEVEMENTS.length}`;
    this.listLayer.removeChildren();
    let y = 0;
    for (const a of ACHIEVEMENTS) {
      const unlocked = this.player.achievements.unlocked.includes(a.id);
      const claimed = this.player.achievements.claimed.includes(a.id);
      const reward = [a.reward.exp ? `修为+${a.reward.exp}` : "", a.reward.stones ? `灵石+${a.reward.stones}` : ""].filter(Boolean).join(" ") || "荣誉";
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 528, 50, 6, 6, 6, 6, unlocked ? "#1e2740" : "#161a26", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(a.name, { size: 13, color: unlocked ? "#e8ecf5" : "#6b7280", bold: true, width: 200 });
      nt.pos(8, 4);
      bg.addChild(nt);
      const dt = text(`${a.desc} · 奖励：${reward}`, { size: 11, color: unlocked ? "#9aa4bd" : "#5a6172", width: 380 });
      dt.pos(8, 26);
      bg.addChild(dt);
      if (unlocked && !claimed) {
        const b = button("领取", 64, 28, "#2e6b8a");
        b.pos(456, 11);
        b.on(Laya.Event.CLICK, this, () => {
          const r = this.player.claimAchievement(a.id);
          this.onMsg(r.ok ? `领取「${a.name}」奖励` : r.reason || "无法领取");
          this.refresh();
        });
        bg.addChild(b);
      } else if (claimed) {
        const c = text("已领取", { size: 12, color: "#8fd18f" });
        c.pos(468, 16);
        bg.addChild(c);
      } else {
        const l = text("未达成", { size: 11, color: "#6b7280" });
        l.pos(468, 16);
        bg.addChild(l);
      }
      this.listLayer.addChild(bg);
      y += 56;
    }
  }
}
