/**
 * 竞技场面板：展示积分/排名/当前对手，提供「挑战」与「换对手」。
 * 对战结算由 Game 用 calcDamage 复用战斗数学决定胜负，本面板只负责展示与回调。
 */
import { REALMS } from "../data/realms";
import type { ArenaOpponent } from "../data/arena";
import { makePanel, text, button } from "./widgets";

export interface ArenaState {
  points: number;
  wins: number;
  losses: number;
  rank: number;
  opp: ArenaOpponent | null;
}

export interface ArenaDuelResult {
  win: boolean;
  delta: number;
  opp: ArenaOpponent;
  rounds: number;
}

export class ArenaPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private body: any = new Laya.Sprite();

  constructor(
    private state: () => ArenaState,
    private challenge: (rng?: () => number) => ArenaDuelResult,
    private next: () => void,
  ) {
    const panel = makePanel(400, 340, "竞技场");
    this.root.addChild(panel);
    this.root.visible = false;

    const close = button("关闭 (ESC)", 96, 30, "#5a2e3a");
    close.pos(288, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);

    const ch = button("挑战对手", 130, 32, "#2e6b4a");
    ch.pos(20, 290);
    ch.on(Laya.Event.CLICK, this, () => this.renderResult(this.challenge()));
    this.root.addChild(ch);

    const nx = button("换对手", 110, 32, "#2a4e6e");
    nx.pos(160, 290);
    nx.on(Laya.Event.CLICK, this, () => { this.next(); this.refresh(); });
    this.root.addChild(nx);

    this.body.pos(20, 48);
    this.root.addChild(this.body);
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
    this.body.removeChildren();
    const s = this.state();
    const lines: string[] = [
      `积分：${s.points}    排名：第 ${s.rank} 位`,
      `战绩：${s.wins} 胜 / ${s.losses} 负`,
      "",
      s.opp ? `对手：${s.opp.nickname}（${REALMS[s.opp.realmIndex]?.name ?? "？"}）` : "（暂无对手）",
      s.opp ? `战力参考：攻 ${s.opp.atk} · 防 ${s.opp.def} · 气血 ${s.opp.maxHp}` : "",
      "",
      "胜则积分 +、负则积分 -（不低于下限）。",
    ];
    const t = text(lines.filter(Boolean).join("\n"), { size: 13, color: "#cdd6ea", width: 360 });
    t.pos(0, 0);
    this.body.addChild(t);
  }

  private renderResult(r: ArenaDuelResult): void {
    this.body.removeChildren();
    const head = text(r.win ? "胜利！" : "战败…", {
      size: 20, bold: true, color: r.win ? "#7fe0a0" : "#ff7a7a", width: 360,
    });
    head.pos(0, 0);
    this.body.addChild(head);
    const cur = this.state().points;
    const detail = text(
      `对手：${r.opp.nickname}（${REALMS[r.opp.realmIndex]?.name ?? "？"}）\n` +
      `积分变化：${r.delta >= 0 ? "+" : ""}${r.delta}（当前 ${cur}）\n` +
      `回合数：${r.rounds}`,
      { size: 13, color: "#cdd6ea", width: 360 },
    );
    detail.pos(0, 40);
    this.body.addChild(detail);
  }
}
