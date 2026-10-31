/**
 * 战令 · 月卡 · 签到 面板（数据驱动，复用 makePanel / button / text）。
 * 顶部签到 + 月卡；其下逐档列出战令奖励，按活跃天数解锁、可一键领取。
 */
import { Player } from "../entities/Player";
import { BP_TIERS } from "../data/battlepass";
import { text, button, makePanel } from "./widgets";

export class BattlePassPanel {
  root: any;
  private player: Player;
  private onMsg: (m: string) => void;
  private todayFn: () => string;
  private listLayer: any;
  visible = false;

  constructor(player: Player, onMsg: (m: string) => void, todayFn: () => string) {
    this.player = player;
    this.onMsg = onMsg;
    this.todayFn = todayFn;
    this.root = makePanel(560, 540, "战令 · 月卡 · 签到");
    const close = button("关闭", 90, 32, "#533");
    close.pos(450, 14);
    close.on(Laya.Event.CLICK, this, () => { this.hide(); });
    this.root.addChild(close);
    this.listLayer = new Laya.Sprite();
    this.listLayer.pos(16, 56);
    this.root.addChild(this.listLayer);
    this.refresh();
  }

  setPlayer(p: Player): void {
    this.player = p;
    if (this.visible) this.refresh();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.visible = this.visible;
    if (this.visible) this.refresh();
  }

  hide(): void {
    this.visible = false;
    this.root.visible = false;
  }

  private refresh(): void {
    this.listLayer.removeChildren();
    let y = 0;
    const row = (
      name: string,
      desc: string,
      right: string,
      actions: { label: string; fn: () => void; enabled: boolean; w?: number }[],
    ) => {
      const bg = new Laya.Sprite();
      bg.graphics.drawRoundRect(0, 0, 528, 56, 6, 6, 6, 6, "#1e2740", "#ffffff14", 1);
      bg.pos(0, y);
      const nt = text(name, { size: 14, color: "#e8ecf5", bold: true, width: 200 });
      nt.pos(10, 6);
      bg.addChild(nt);
      const dt = text(desc, { size: 11, color: "#9aa4bd", width: 320 });
      dt.pos(10, 28);
      bg.addChild(dt);
      const rt = text(right, { size: 12, color: "#ffd166", width: 220 });
      rt.pos(330, 8);
      bg.addChild(rt);
      let bx = 446;
      for (const a of actions) {
        const w = a.w || 64;
        const b = button(a.label, w, 26, a.label === "已领" || a.label === "已签" ? "#3a6ea5" : "#8a5a2e");
        b.pos(bx - w, 16);
        b.alpha = a.enabled ? 1 : 0.5;
        b.on(Laya.Event.CLICK, this, a.fn);
        bg.addChild(b);
        bx -= w + 6;
      }
      this.listLayer.addChild(bg);
      y += 60;
    };

    const today = this.todayFn();
    const now = Date.now();
    const bp = this.player.battlePass;
    const signed = bp.signinDays.includes(today);
    row(
      "每日签到",
      signed ? "今日已签到" : "点击签到领取灵石（第 7 天额外）",
      signed ? "✓ 已签" : "可签",
      [{
        label: signed ? "已签" : "签到",
        enabled: !signed,
        fn: () => {
          const r = this.player.signIn(today);
          this.onMsg(r.ok ? `签到成功：灵石+${r.stones}` : `签到失败：${r.reason}`);
          this.refresh();
        },
      }],
    );

    const mcActive = now <= bp.monthCardUntil;
    const mcClaimed = bp.monthCardClaimed.includes(today);
    row(
      "月卡",
      mcActive ? "月卡生效中，每日可领灵石" : "激活后 30 天每日领灵石",
      mcActive ? (mcClaimed ? "✓ 今日已领" : "可领") : "未激活",
      mcActive
        ? [{
            label: mcClaimed ? "已领" : "领取",
            enabled: !mcClaimed,
            fn: () => {
              const r = this.player.claimMonthCard(today, now);
              this.onMsg(r.ok ? `月卡领取：灵石+${r.stones}` : `领取失败：${r.reason}`);
              this.refresh();
            },
          }]
        : [{
            label: "激活",
            enabled: true,
            fn: () => {
              this.player.activateMonthCard(now);
              this.onMsg("月卡已激活（30 天）");
              this.refresh();
            },
          }],
    );

    for (const t of BP_TIERS) {
      const unlocked = bp.signinDays.length >= t.tier;
      const claimed = bp.claimed.includes(t.tier);
      const r = t.reward;
      const rewardTxt = `灵石${r.stones ?? 0}${r.exp ? ` 修为${r.exp}` : ""}`;
      row(
        `第 ${t.tier} 档`,
        rewardTxt,
        claimed ? "✓ 已领" : unlocked ? "可领" : `需 ${t.tier} 活跃天`,
        claimed
          ? [{ label: "已领", enabled: false, fn: () => {} }]
          : [{
              label: "领取",
              enabled: unlocked,
              fn: () => {
                const res = this.player.claimTier(t.tier);
                this.onMsg(res.ok ? `领取成功：${rewardTxt}` : `领取失败：${res.reason}`);
                this.refresh();
              },
            }],
      );
    }
  }
}
