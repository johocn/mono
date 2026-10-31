/**
 * 结算界面：第一章通关数据 + 排行榜 + 重开/回标题。
 */
import type { LeaderEntry } from "../core/CloudClient";
import { makePanel, text, button } from "./widgets";

export interface ResultStats {
  nickname: string;
  realm: string;
  timeMs: number;
  kills: number;
  chapter: number;
}

export interface ResultCallbacks {
  onRetry: () => void;
  onTitle: () => void;
}

export class ResultUI {
  readonly root: any = new Laya.Sprite();
  visible = false;

  constructor(private cb: ResultCallbacks) {
    const panel = makePanel(520, 420);
    this.root.addChild(panel);

    this.titleText = text("第一章 · 落霞镇 通关", { size: 26, color: "#e8dcb0", bold: true, align: "center", width: 520 });
    this.titleText.pos(0, 24);
    this.root.addChild(this.titleText);

    this.statsText = text("", { size: 14, color: "#dfe3ee", width: 480, height: 90 });
    this.statsText.pos(20, 76);
    this.statsText.leading = 6;
    this.root.addChild(this.statsText);

    const lbTitle = text("修为榜（前 10）", { size: 14, color: "#ffd166", bold: true });
    lbTitle.pos(20, 172);
    this.root.addChild(lbTitle);

    this.lbLayer.pos(20, 198);
    this.root.addChild(this.lbLayer);

    const btnRetry = button("再次修行", 140, 40, "#2e6b4a");
    btnRetry.pos(80, 356);
    btnRetry.on(Laya.Event.CLICK, this, () => this.cb.onRetry());
    this.root.addChild(btnRetry);
    const btnTitle = button("返回标题", 140, 40, "#2a3350");
    btnTitle.pos(300, 356);
    btnTitle.on(Laya.Event.CLICK, this, () => this.cb.onTitle());
    this.root.addChild(btnTitle);
  }

  private statsText: any;
  private lbLayer: any = new Laya.Sprite();
  private titleText: any;

  show(stats: ResultStats, entries: LeaderEntry[]): void {
    this.visible = true;
    this.root.visible = true;
    this.statsText.text =
      `道号：${stats.nickname}\n境界：${stats.realm}\n用时：${(stats.timeMs / 1000).toFixed(1)} 秒\n斩妖：${stats.kills} 只`;
    this.lbLayer.removeChildren();

    const titleStr = stats.chapter === 2 ? "第二章 · 乱星海 通关" : "第一章 · 落霞镇 通关";
    if (this.titleText) this.titleText.text = titleStr;

    const ch1 = entries.filter((e) => (e.chapter || 1) === 1).slice(0, 5);
    const ch2 = entries.filter((e) => (e.chapter || 1) === 2).slice(0, 5);
    this.renderLbColumn("第一章 · 落霞镇", ch1, 0);
    this.renderLbColumn("第二章 · 乱星海", ch2, 150);
  }

  private renderLbColumn(colTitle: string, list: LeaderEntry[], yOffset: number): void {
    const head = text(colTitle, { size: 13, color: "#ffd166", bold: true });
    head.pos(0, yOffset);
    this.lbLayer.addChild(head);
    if (list.length === 0) {
      const empty = text("（暂无成绩）", { size: 11, color: "#7a86a8" });
      empty.pos(0, yOffset + 20);
      this.lbLayer.addChild(empty);
      return;
    }
    list.forEach((e, i) => {
      const t = text(
        `${String(i + 1).padStart(2, " ")}. ${e.nickname} · ${e.realm} · ${(e.timeMs / 1000).toFixed(0)}s · 斩妖 ${e.kills}`,
        { size: 11, color: i === 0 ? "#ffd166" : "#dfe3ee" },
      );
      t.pos(0, yOffset + 20 + i * 16);
      this.lbLayer.addChild(t);
    });
  }

  hide(): void {
    this.visible = false;
    this.root.visible = false;
  }

  layout(viewW: number, viewH: number): void {
    this.root.x = viewW / 2 - 260;
    this.root.y = viewH / 2 - 210;
  }
}
