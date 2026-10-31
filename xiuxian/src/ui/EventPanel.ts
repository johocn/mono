/**
 * 限时活动面板（p1-events + P3-8 运营/赛季）：
 *  - 展示当前生效活动（双倍修炼 / 登录有礼 / 节日）
 *  - P3-8：展示当前活跃赛季（名称/限时窗口）+ 赛季榜单（前 10）+「进入活动副本」按钮
 * 活动副本为限时魔尊试炼，通关成绩提交至赛季榜（服务端保最优、计排名）。
 * 无 token/离线时云端部分降级提示，本地活动仍展示。
 */
import type { Player } from "../entities/Player";
import { activeEvents } from "../data/events";
import { makePanel, text, button } from "./widgets";

export interface SeasonInfo {
  id: number;
  name: string;
  startAt: number;
  endAt: number;
  open: boolean;
  top: { nickname: string; score: number; clearMs: number }[];
}

export interface EventHooks {
  /** 拉取当前活跃赛季 + 榜单（返回 null 表示未联网/无赛季） */
  getSeason: () => Promise<SeasonInfo | null>;
  /** 进入活动副本（限时魔尊试炼） */
  onEnterDungeon: () => void;
}

export class EventPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private listLayer: any = new Laya.Sprite();
  private seasonLayer: any = new Laya.Sprite();
  private player: Player;
  private onMsg: (msg: string) => void;
  private hooks?: EventHooks;
  private season: SeasonInfo | null = null;

  constructor(player: Player, onMsg: (msg: string) => void, hooks?: EventHooks) {
    this.player = player;
    this.onMsg = onMsg;
    this.hooks = hooks;
    const panel = makePanel(560, 480, "限时活动");
    this.root.addChild(panel);
    this.root.visible = false;

    const tip = text("节日 / 双倍 / 登录福利 / 赛季活动副本，限时开启", { size: 11, color: "#7fd0e0", width: 340 });
    tip.pos(170, 18);
    this.root.addChild(tip);

    this.seasonLayer.pos(16, 52);
    this.root.addChild(this.seasonLayer);

    const sep = text("—— 限时活动 ——", { size: 12, color: "#ffd97f", bold: true });
    sep.pos(16, 232);
    this.root.addChild(sep);

    this.listLayer.pos(16, 258);
    this.root.addChild(this.listLayer);

    const close = button("关闭 (Q)", 96, 32, "#5a2e3a");
    close.pos(448, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);
  }

  setPlayer(player: Player): void { this.player = player; if (this.visible) this.refresh(); }
  show(): void { this.visible = true; this.root.visible = true; this.refresh(); this.loadSeason(); }
  hide(): void { this.visible = false; this.root.visible = false; }
  toggle(): void { this.visible ? this.hide() : this.show(); }

  private async loadSeason(): Promise<void> {
    if (!this.hooks) return;
    try {
      this.season = await this.hooks.getSeason();
    } catch {
      this.season = null;
    }
    if (this.visible) this.renderSeason();
  }

  refresh(): void {
    this.renderEvents();
    this.renderSeason();
  }

  private renderSeason(): void {
    this.seasonLayer.removeChildren();
    const head = text(`赛季 · ${this.season ? this.season.name : "（未联网）"}`, { size: 14, color: "#ffd97f", bold: true });
    head.pos(0, 0);
    this.seasonLayer.addChild(head);

    const s = this.season;
    if (!s) {
      const off = text("（未联网：开启云存档后可查看赛季榜单）", { size: 11, color: "#6f7790" });
      off.pos(0, 24); this.seasonLayer.addChild(off);
      return;
    }
    const days = Math.max(0, Math.ceil((s.endAt - Date.now()) / 86400000));
    const win = text(`限时：剩余 ${days} 天（${s.open ? "进行中" : "已结束"}）`, { size: 11, color: s.open ? "#8fd18f" : "#9aa4bd" });
    win.pos(0, 24); this.seasonLayer.addChild(win);

    const enter = button(s.open ? "进入活动副本" : "活动未开启", 132, 28, s.open ? "#2e6b8a" : "#3a4a5a");
    enter.pos(360, 0); enter.alpha = s.open ? 1 : 0.5;
    if (s.open) enter.on(Laya.Event.CLICK, this, () => this.hooks?.onEnterDungeon());
    this.seasonLayer.addChild(enter);

    const lbHead = text("—— 赛季榜单（前 10）——", { size: 12, color: "#ffd97f", bold: true });
    lbHead.pos(0, 56); this.seasonLayer.addChild(lbHead);
    if (s.top.length === 0) {
      const empty = text("暂无上榜道友，速去挑战魔尊试炼！", { size: 11, color: "#9aa4bd" });
      empty.pos(0, 80); this.seasonLayer.addChild(empty);
    } else {
      s.top.slice(0, 10).forEach((e, i) => {
        const row = text(
          `${i + 1}. ${e.nickname}　得分 ${e.score}　用时 ${(e.clearMs / 1000).toFixed(1)}s`,
          { size: 12, color: i === 0 ? "#ffd166" : "#e8ecf5", width: 500 },
        );
        row.pos(0, 80 + i * 18); this.seasonLayer.addChild(row);
      });
    }
  }

  private renderEvents(): void {
    this.listLayer.removeChildren();
    const list = activeEvents(Date.now());
    if (list.length === 0) {
      const t = text("当前没有进行中的活动。", { size: 13, color: "#9aa4bd" });
      t.pos(8, 8);
      this.listLayer.addChild(t);
      return;
    }
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let y = 0;
    for (const e of list) {
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 528, 64, 6, 6, 6, 6, "#161a26", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(e.name, { size: 14, color: "#ffd97f", bold: true, width: 200 });
      nt.pos(8, 4);
      bg.addChild(nt);
      const dt = text(`${e.desc}（${e.start} ~ ${e.end}）`, { size: 11, color: "#9aa4bd", width: 360 });
      dt.pos(8, 28);
      bg.addChild(dt);
      let tag = "";
      let col = "#8fd18f";
      if (e.type === "double") {
        tag = `进行中 · 击杀收益 ×${e.mult || 2}`;
      } else if (e.type === "login") {
        tag = this.player.eventClaims[e.id] === day ? "今日已领取 ✓" : "登录即领（每日一次）";
        col = "#ffd166";
      }
      const tg = text(tag, { size: 12, color: col, bold: true, width: 200 });
      tg.pos(330, 22);
      bg.addChild(tg);
      this.listLayer.addChild(bg);
      y += 70;
    }
  }
}
