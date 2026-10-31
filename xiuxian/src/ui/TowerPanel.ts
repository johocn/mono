/**
 * 镇妖塔面板：展示当前层/历史最高/每日重置状态，并提供「进入/继续挑战」与「退出」入口。
 * 实际进入/刷怪/推进逻辑在 Game（本面板仅调用回调 + 刷新展示）。
 */
import type { Player } from "../entities/Player";
import { MAX_TOWER_FLOOR } from "../data/tower";
import { makePanel, text, button } from "./widgets";

export class TowerPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private info: any = new Laya.Sprite();
  private player: Player;

  constructor(
    player: Player,
    private onEnter: () => void,
    private onExit: () => void,
    private today: () => string,
  ) {
    this.player = player;
    const panel = makePanel(360, 300, "镇妖塔");
    this.root.addChild(panel);
    this.root.visible = false;

    const enter = button("进入 / 继续挑战", 150, 32, "#3a5a4e");
    enter.pos(20, 232);
    enter.on(Laya.Event.CLICK, this, () => { this.onEnter(); this.refresh(); });
    this.root.addChild(enter);

    const exit = button("退出镇妖塔", 110, 32, "#5a2e3a");
    exit.pos(180, 232);
    exit.on(Laya.Event.CLICK, this, () => { this.onExit(); this.hide(); });
    this.root.addChild(exit);

    const close = button("关闭 (ESC)", 96, 30, "#5a2e3a");
    close.pos(248, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);

    this.info.pos(20, 52);
    this.root.addChild(this.info);
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
    this.info.removeChildren();
    const p = this.player;
    const dailyOk = p.towerDaily === this.today();
    const lines = [
      `当前层数：${p.towerFloor} / ${MAX_TOWER_FLOOR}`,
      `历史最高：${p.towerBest}`,
      `每日重置：${dailyOk ? "今日已重置至第 1 层" : "进入时自动重置至第 1 层"}`,
      "",
      "清空一层即获修为 + 灵石奖励，",
      "每 5 层有层主（妖狼王）镇守。",
    ];
    const t = text(lines.join("\n"), { size: 13, color: "#cdd6ea", width: 320 });
    t.pos(0, 0);
    this.info.addChild(t);
  }
}
