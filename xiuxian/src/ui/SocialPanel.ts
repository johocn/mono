/**
 * 社交面板（p1-social + P3-6 社交实时化）：本地好友（论道）、NPC 邮件（领奖）、
 * 宗门建设（贡献 + 建筑升级）、门派大比；并接入云端：玩家间邮件（收/发/领）、
 * 宗门贡献榜、软实时在线道友（轮询 presence）。无 token/离线时云端部分降级提示。
 */
import type { Player } from "../entities/Player";
import { NPC_FRIENDS, MAILS, SECT_BUILDINGS, FRIEND_CAP, FRIEND_TIER } from "../data/social";
import { makePanel, text, button } from "./widgets";

export interface SocialHooks {
  getToken: () => string | null;
  getZone: () => string;
  getPos: () => { gx: number; gy: number };
  /** 拉取服务端收件箱覆盖本地缓存 */
  refreshMail: () => Promise<void>;
  /** 领取邮件（服务端标记防重领，返回奖励由 Player 应用） */
  claimMail: (id: number) => Promise<void>;
  /** 发送玩家间邮件（按昵称寻址） */
  sendMail: (to: string, mail: { title: string; body: string }) => Promise<boolean>;
  /** 宗门贡献榜（公开聚合） */
  sectLeaderboard: () => Promise<{ nickname: string; contribution: number }[]>;
  /** 软实时在线道友列表 */
  presenceList: () => Promise<{ nickname: string; zone: string; gx: number; gy: number }[]>;
}

type Tab = "friend" | "mail" | "sect" | "dao";

export class SocialPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private content: any = new Laya.Sprite();
  private tab: Tab = "friend";
  private player: Player;
  private onMsg: (m: string) => void;
  private onDay: () => string;
  private onFriendEnding: (id: string) => void;
  private hooks?: SocialHooks;
  private compose = false;
  private sectLb: { nickname: string; contribution: number }[] = [];
  private presence: { nickname: string; zone: string; gx: number; gy: number }[] = [];

  constructor(
    player: Player,
    onMsg: (m: string) => void,
    onDay: () => string,
    onFriendEnding: (id: string) => void,
    hooks?: SocialHooks,
  ) {
    this.player = player;
    this.onMsg = onMsg;
    this.onDay = onDay;
    this.onFriendEnding = onFriendEnding;
    this.hooks = hooks;
    const panel = makePanel(560, 460, "社交 · 仙缘");
    this.root.addChild(panel);
    this.root.visible = false;

    const tabs: [Tab, string, number][] = [
      ["friend", "好友", 16], ["mail", "邮件", 150], ["sect", "宗门", 284], ["dao", "道友", 418],
    ];
    for (const [t, label, x] of tabs) {
      const b = button(label, 120, 28, "#2e3a52");
      b.pos(x, 14);
      b.on(Laya.Event.CLICK, this, () => { this.tab = t; this.compose = false; this.refresh(); this.loadDynamic(); });
      this.root.addChild(b);
    }
    const close = button("关闭 (Q)", 96, 30, "#5a2e3a");
    close.pos(452, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);

    this.content.pos(14, 52);
    this.root.addChild(this.content);
  }

  setPlayer(p: Player): void { this.player = p; if (this.visible) this.refresh(); }
  show(): void {
    this.visible = true; this.root.visible = true;
    if (this.hooks) void this.hooks.refreshMail().then(() => { if (this.tab === "mail") this.refresh(); });
    this.refresh();
    this.loadDynamic();
  }
  hide(): void { this.visible = false; this.root.visible = false; }
  toggle(): void { this.visible ? this.hide() : this.show(); }
  /** 编程式切换页签（供测试/外部调用） */
  selectTab(t: Tab): void { this.tab = t; this.compose = false; this.refresh(); void this.loadDynamic(); }
  /** Game 每帧低频次调用：若停留在需云端数据的页签则刷新 */
  tickPresence(): void { if (this.tab === "dao" || this.tab === "sect") void this.loadDynamic(); }

  private async loadDynamic(): Promise<void> {
    if (!this.hooks) return;
    try {
      if (this.tab === "sect") this.sectLb = await this.hooks.sectLeaderboard();
      else if (this.tab === "dao") this.presence = await this.hooks.presenceList();
    } catch {
      if (this.tab === "sect") this.sectLb = [];
      else this.presence = [];
    }
    if (this.visible) this.refresh();
  }

  refresh(): void {
    this.content.removeChildren();
    if (this.tab === "friend") this.renderFriends();
    else if (this.tab === "mail") this.renderMails();
    else if (this.tab === "sect") this.renderSect();
    else this.renderDao();
  }

  private renderFriends(): void {
    const day = this.onDay();
    let y = 0;
    for (const f of NPC_FRIENDS) {
      const st = this.player.friends[f.id] || { affinity: 0, lastDay: "" };
      const can = st.lastDay !== day;
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 532, 64, 6, 6, 6, 6, "#161a26", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(`${f.name} · ${f.title}`, { size: 13, color: "#e8ecf5", bold: true, width: 200 });
      nt.pos(8, 4); bg.addChild(nt);
      const dt = text(f.desc, { size: 11, color: "#9aa4bd", width: 360 });
      dt.pos(8, 26); bg.addChild(dt);
      const tier = Math.floor(st.affinity / FRIEND_TIER) + 1;
      const at = text(`好感 ${st.affinity}/${FRIEND_CAP} · ${tier}档`, { size: 11, color: "#ffd166", width: 160 });
      at.pos(8, 44); bg.addChild(at);
      const b = button(can ? "论道" : "今日已论", 84, 28, can ? "#2e6b8a" : "#3a4a5a");
      b.pos(432, 18); b.alpha = can ? 1 : 0.5;
      if (can) b.on(Laya.Event.CLICK, this, () => {
        const r = this.player.interactFriend(f.id, day);
        this.onMsg(r.ok ? `与${f.name}论道获益` : (r.reason || "无法论道"));
        this.refresh();
      });
      bg.addChild(b);
      const eb = button("结缘", 84, 28, "#6a3a7a");
      eb.pos(340, 18);
      eb.on(Laya.Event.CLICK, this, () => this.onFriendEnding(f.id));
      bg.addChild(eb);
      this.content.addChild(bg);
      y += 70;
    }
  }

  private renderMails(): void {
    // —— 玩家间邮件（云端收件箱）——
    const ti = text("—— 道友来信 ——", { size: 12, color: "#8fd1ff", bold: true });
    ti.pos(0, 0); this.content.addChild(ti);
    let y = 22;
    if (!this.hooks) {
      const off = text("（未联网：开启云存档后可收发道友邮件）", { size: 11, color: "#6f7790" });
      off.pos(0, y); this.content.addChild(off); y += 22;
    } else if (this.player.mailbox.length === 0) {
      const empty = text("暂无道友来信。", { size: 11, color: "#9aa4bd" });
      empty.pos(0, y); this.content.addChild(empty); y += 22;
    } else {
      for (const m of this.player.mailbox) {
        const bg = new Laya.Sprite();
        bg.graphics.drawRoundRect(0, 0, 532, 78, 6, 6, 6, 6, "#161a26", "#ffffff14", 1);
        bg.pos(0, y);
        const from = text(`来自：${m.fromName}`, { size: 12, color: "#8fd1ff", bold: true, width: 360 });
        from.pos(8, 4); bg.addChild(from);
        const tt = text(m.title, { size: 12, color: "#e8ecf5", width: 360 });
        tt.pos(8, 22); bg.addChild(tt);
        const bd = text(m.body, { size: 10, color: "#9aa4bd", width: 360 });
        bd.pos(8, 40); bg.addChild(bd);
        const rt = text(rewardText(m.reward), { size: 10, color: "#8fd18f", width: 360 });
        rt.pos(8, 56); bg.addChild(rt);
        const lbl = m.claimed ? "已领取" : "领取";
        const b = button(lbl, 80, 26, m.claimed ? "#3a4a5a" : "#2e6b8a");
        b.pos(436, 26); b.alpha = m.claimed ? 0.5 : 1;
        if (!m.claimed) b.on(Laya.Event.CLICK, this, () => {
          void this.hooks!.claimMail(m.id).then(() => { this.onMsg("领取邮件奖励"); this.refresh(); });
        });
        bg.addChild(b);
        this.content.addChild(bg);
        y += 84;
      }
    }

    // 写信
    const wb = button(this.compose ? "收起" : "写信", 84, 26, "#4a3a6a");
    wb.pos(0, y); this.content.addChild(wb);
    wb.on(Laya.Event.CLICK, this, () => { this.compose = !this.compose; this.refresh(); });
    y += 32;
    if (this.compose && this.hooks) y = this.renderCompose(y);

    // —— NPC 邮件（本地，按境界解锁领奖）——
    const sep = text("—— 宗门来信 ——", { size: 12, color: "#ffd166", bold: true });
    sep.pos(0, y); this.content.addChild(sep); y += 22;
    const ri = this.player.realmIndex;
    for (const m of MAILS) {
      const locked = (m.needRealm || 0) > ri;
      const claimed = this.player.mailsClaimed.includes(m.id);
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 532, 70, 6, 6, 6, 6, "#161a26", "#ffffff10", 1);
      bg.pos(0, y);
      const nt = text(`${m.title}（来自：${m.from}）`, { size: 13, color: locked ? "#6f7790" : "#e8ecf5", bold: true, width: 380 });
      nt.pos(8, 4); bg.addChild(nt);
      const dt = text(locked ? `需达 ${m.needRealm} 重境界方可解锁` : m.body, { size: 11, color: "#9aa4bd", width: 380 });
      dt.pos(8, 28); bg.addChild(dt);
      const rt = text(rewardText(m.reward), { size: 11, color: "#8fd18f", width: 380 });
      rt.pos(8, 48); bg.addChild(rt);
      let label = "领取"; let col = "#2e6b8a"; let can = !locked && !claimed;
      if (locked) { label = "未解锁"; col = "#3a4a5a"; }
      else if (claimed) { label = "已领取"; col = "#3a4a5a"; }
      const b = button(label, 84, 28, col);
      b.pos(432, 21); b.alpha = can ? 1 : 0.5;
      if (can) b.on(Laya.Event.CLICK, this, () => {
        const r = this.player.claimMail(m.id);
        this.onMsg(r.ok ? `领取邮件奖励` : (r.reason || "无法领取"));
        this.refresh();
      });
      bg.addChild(b);
      this.content.addChild(bg);
      y += 76;
    }
  }

  private renderCompose(y0: number): number {
    let y = y0;
    const to = new Laya.TextInput("收件人昵称"); to.pos(0, y); to.size(180, 26); to.bgColor = "#0e1320"; to.color = "#e8ecf5"; to.fontSize = 12; this.content.addChild(to);
    const title = new Laya.TextInput("标题"); title.pos(190, y); title.size(160, 26); title.bgColor = "#0e1320"; title.color = "#e8ecf5"; title.fontSize = 12; this.content.addChild(title);
    y += 32;
    const body = new Laya.TextInput("留言内容…"); body.pos(0, y); body.size(350, 26); body.bgColor = "#0e1320"; body.color = "#e8ecf5"; body.fontSize = 12; this.content.addChild(body);
    y += 32;
    const send = button("发送", 80, 26, "#2e6b8a"); send.pos(360, y - 32); this.content.addChild(send);
    send.on(Laya.Event.CLICK, this, () => {
      const toName = (to.text || "").trim();
      if (!toName) { this.onMsg("请填写收件人"); return; }
      void this.hooks!.sendMail(toName, { title: (title.text || "（无题）").trim(), body: (body.text || "").trim() }).then((ok) => {
        this.onMsg(ok ? `已向 ${toName} 寄出邮件` : "寄信失败（收件人不存在？）");
        this.compose = false; this.refresh();
      });
    });
    return y;
  }

  private renderSect(): void {
    const head = text(`宗门贡献：${this.player.sectContribution}`, { size: 14, color: "#ffd166", bold: true });
    head.pos(0, 0); this.content.addChild(head);

    const war = button("门派大比（每日一次）", 200, 30, "#7a3a52");
    war.pos(300, -2);
    war.on(Laya.Event.CLICK, this, () => {
      const r = this.player.sectWar(this.onDay());
      this.onMsg(r.ok ? (r.win ? "门派大比获胜！" : "惜败，再接再厉") : (r.reason || ""));
      this.refresh();
    });
    this.content.addChild(war);

    let y = 44;
    for (const b of SECT_BUILDINGS) {
      const lv = this.player.sectBuildingLv(b.id);
      const maxed = lv >= b.maxLv;
      const cost = b.costPerLv * (lv + 1);
      const enough = this.player.sectContribution >= cost;
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 532, 56, 6, 6, 6, 6, "#161a26", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(`${b.name}　Lv.${lv}/${b.maxLv}`, { size: 13, color: "#e8ecf5", bold: true, width: 220 });
      nt.pos(8, 4); bg.addChild(nt);
      const dt = text(`${b.desc}（升至下级需贡献 ${maxed ? "—" : cost}）`, { size: 11, color: "#9aa4bd", width: 380 });
      dt.pos(8, 28); bg.addChild(dt);
      const bl = button(maxed ? "满级" : "升级", 84, 28, maxed ? "#3a4a5a" : (enough ? "#2e6b8a" : "#5a4a3a"));
      bl.pos(432, 14); bl.alpha = (maxed || !enough) ? 0.5 : 1;
      if (!maxed && enough) bl.on(Laya.Event.CLICK, this, () => {
        const r = this.player.upgradeSectBuilding(b.id);
        this.onMsg(r.ok ? `「${b.name}」升至 Lv.${this.player.sectBuildingLv(b.id)}` : (r.reason || "无法升级"));
        this.refresh();
      });
      bg.addChild(bl);
      this.content.addChild(bg);
      y += 62;
    }

    // 宗门贡献榜（云端公开聚合）
    const lbHead = text("—— 宗门贡献榜 ——", { size: 12, color: "#ffd166", bold: true });
    lbHead.pos(0, y); this.content.addChild(lbHead); y += 22;
    if (!this.hooks) {
      const off = text("（未联网：开启云存档后可查看全服贡献榜）", { size: 11, color: "#6f7790" });
      off.pos(0, y); this.content.addChild(off); y += 22;
    } else if (this.sectLb.length === 0) {
      const empty = text("暂无上榜道友。", { size: 11, color: "#9aa4bd" });
      empty.pos(0, y); this.content.addChild(empty); y += 22;
    } else {
      this.sectLb.slice(0, 8).forEach((e, i) => {
        const row = text(`${i + 1}. ${e.nickname}　贡献 ${e.contribution}`, { size: 12, color: i === 0 ? "#ffd166" : "#e8ecf5", width: 500 });
        row.pos(0, y); this.content.addChild(row); y += 22;
      });
    }
  }

  private renderDao(): void {
    const head = text("—— 在线道友（近 60 秒活跃） ——", { size: 12, color: "#8fd1ff", bold: true });
    head.pos(0, 0); this.content.addChild(head);
    const refresh = button("刷新", 80, 26, "#2e6b8a");
    refresh.pos(440, -2); this.content.addChild(refresh);
    refresh.on(Laya.Event.CLICK, this, () => void this.loadDynamic());
    let y = 26;
    if (!this.hooks) {
      const off = text("（未联网：开启云存档后可查看在线道友）", { size: 11, color: "#6f7790" });
      off.pos(0, y); this.content.addChild(off); y += 22;
    } else if (this.presence.length === 0) {
      const empty = text("暂无在线道友。", { size: 11, color: "#9aa4bd" });
      empty.pos(0, y); this.content.addChild(empty); y += 22;
    } else {
      for (const p of this.presence) {
        const row = text(`${p.nickname}　·　${p.zone}（${p.gx},${p.gy}）`, { size: 12, color: "#e8ecf5", width: 500 });
        row.pos(0, y); this.content.addChild(row); y += 22;
      }
    }
  }
}

function rewardText(r?: { exp?: number; stones?: number; items?: { id: string; n: number }[] }): string {
  if (!r) return "奖励：—";
  const p: string[] = [];
  if (r.exp) p.push(`修为+${r.exp}`);
  if (r.stones) p.push(`灵石+${r.stones}`);
  if (r.items) for (const it of r.items) p.push(`物品x${it.n}`);
  return p.length ? `奖励：${p.join("，")}` : "奖励：—";
}
