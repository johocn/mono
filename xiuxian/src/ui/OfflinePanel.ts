/**
 * 离线收益面板：进入「继续游戏」时由 Game 调用 show(off) 展示离线期间累计的修为/灵石。
 * 奖励已在 Player.collectOffline 中发放，本面板仅做展示与确认。
 */
import { text, button, makePanel } from "./widgets";

export interface OfflineGain {
  exp: number;
  stones: number;
  hours: number;
}

function fmtDur(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分钟`;
}

export class OfflinePanel {
  root: any;
  visible = false;

  constructor() {
    this.root = makePanel(420, 240, "离线收益");
    this.root.visible = false;
  }

  show(off: OfflineGain): void {
    this.root.removeChildren();
    const title = text(`离线 ${fmtDur(off.hours)}`, { size: 18, color: "#ffd166", bold: true });
    title.pos(20, 16);
    this.root.addChild(title);
    const body = text(`修为 +${off.exp}\n灵石 +${off.stones}`, { size: 15, color: "#e8ecf5" });
    body.pos(20, 60);
    this.root.addChild(body);
    const b = button("领取", 140, 36, "#8a5a2e");
    b.pos(140, 184);
    b.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(b);
    this.visible = true;
    this.root.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.root.visible = false;
  }
}
