/**
 * FamilyCareScene — 家属关怀（离线可实现范围）
 *
 * 本应用为本地离线（无后端），"远程关爱"以「家属视角 + 可分享月报」落地：
 * - 用长辈能看懂的语言解释这份报告是做什么的
 * - 展示「认知健康月报」全文（覆盖 13 域 + 标准测评映射，便于对外讲价值）
 * - 温柔预警：多日未训练 / 某认知域近 30 天波动，提示家属多陪伴陪练
 * - 一键复制月报，经微信等发给子女 / 照护者（复用既有分享习惯）
 *
 * 不承诺真实联网远程；如需真·远程同步，后续接 AuthStore/SsoAuth 后端即可。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { progress } from "../core/ProgressStore";
import { getCognitiveProfile, buildMonthlyReport, buildWeeklyReport } from "../core/CognitiveProfile";
import { reminderToChild } from "../core/CareWords";
import { familySync, generateFamilyCode } from "../core/FamilySync";
import { renderFamilyCard, familyShareDesc } from "../ui/PosterRenderer";
import { showShareImage } from "../ui/ShareOverlay";
import { wrapText } from "../ui/ResultCard";
import { ScrollView } from "../ui/ScrollView";
import { NAV_H } from "../ui/SceneChrome";

export interface FamilyCareCallbacks {
  onBack(): void;
}

interface Rect { x: number; y: number; w: number; h: number }

export class FamilyCareScene {
  private cb: FamilyCareCallbacks;
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private copyRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cardRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private tab: "week" | "month" = "month";
  private tabMonthRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private tabWeekRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private remindRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private syncRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** 进入页面后是否已完成一次自动同步尝试（避免每帧重复请求） */
  private autoSyncDone = false;
  private toastUntil = 0;
  private toastText = "";
  private scroll = new ScrollView();
  private off = 0;

  constructor(cb: FamilyCareCallbacks) {
    this.cb = cb;
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.render());
    gameCanvas.setScrollHandler((_dx, dy) => this.scroll.scrollBy(dy));
  }

  private onTouch(x: number, y: number): void {
    const yy = y + this.off; // 命中判定加回滚动偏移
    if (this.hit(this.backRect, x, yy)) { audioSynth.playUi("button"); this.cb.onBack(); return; }
    if (this.hit(this.cardRect, x, yy)) { audioSynth.playUi("button"); this.makeCard(); return; }
    if (this.hit(this.copyRect, x, yy)) { audioSynth.playUi("button"); this.copyReport(); return; }
    if (this.hit(this.tabMonthRect, x, yy)) { audioSynth.playUi("button"); this.tab = "month"; this.render(); return; }
    if (this.hit(this.tabWeekRect, x, yy)) { audioSynth.playUi("button"); this.tab = "week"; this.render(); return; }
    if (this.hit(this.remindRect, x, yy)) { audioSynth.playUi("button"); this.copyRemind(); return; }
    if (this.hit(this.syncRect, x, yy)) { audioSynth.playUi("button"); this.onSyncTap(); return; }
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private copyReport(): void {
    const text = this.fullReport();
    const clip = navigator.clipboard;
    const done = (ok: boolean) => {
      this.toastText = ok ? "月报已复制，可发给家人" : "请长按选择文字复制";
      this.toastUntil = performance.now() + 2200;
      this.render();
    };
    if (clip?.writeText) clip.writeText(text).then(() => done(true)).catch(() => done(false));
    else done(false);
  }

  /** 温柔、非恐吓的关爱提醒（render 与生成卡片共用） */
  private buildWarnings(p: ReturnType<typeof getCognitiveProfile>): string[] {
    const warn: string[] = [];
    const last = progress.getLastPlayed();
    if (last > 0) {
      const days = Math.floor((Date.now() - last) / 86400000);
      if (days >= 3) warn.push(`已 ${days} 天没训练，可提醒长辈来动动脑`);
    } else {
      warn.push("还没开始训练，陪长辈玩一局更有意义");
    }
    const declined = p.trends.filter((t) => t.delta30 < 0);
    if (declined.length > 0) {
      warn.push(`「${declined.slice(0, 2).map((t) => t.label).join("、")}」近 30 天略有波动，多陪伴陪练`);
    }
    if (warn.length === 0) warn.push("状态稳定，继续保持每天十分钟就好");
    return warn;
  }

  private makeCard(): void {
    try {
      const p = getCognitiveProfile();
      const warn = this.buildWarnings(p);
      const last = progress.getLastPlayed();
      const days = last > 0 ? Math.floor((Date.now() - last) / 86400000) : null;
      const dataUrl = renderFamilyCard(p, warn, { lastPlayedDays: days });
      showShareImage(dataUrl, { hint: "长按图片「保存到相册」，或点下方按钮下载", fileName: "家属关怀卡片.png" });
      // 微信内同步设置真实转发卡片（非微信环境自动忽略）
      const setWx = (window as unknown as { __setWechatShare?: (p: Record<string, string>) => void }).__setWechatShare;
      if (typeof setWx === "function") {
        setWx({
          title: "长辈认知健康月报",
          desc: familyShareDesc(p),
          link: typeof location !== "undefined" ? location.href : "https://game.yourbao.cn/tour/xxl/",
        });
        this.toastText = "已同步微信转发卡片，可点右上角发给家人";
      } else {
        this.toastText = "卡片已生成，长按图片即可保存";
      }
      this.toastUntil = performance.now() + 2400;
      this.render();
    } catch {
      this.toastText = "生成图片失败，请改用复制文字月报";
      this.toastUntil = performance.now() + 2400;
      this.render();
    }
  }

  /** 家属版报告：在健康月报前加一段家属引导语 */
  private fullReport(): string {
    const report = buildMonthlyReport();
    const lead = [
      "【给家人】这是「岁月神偷·脑力花园」为长辈生成的自测健康月报，",
      "仅供日常关注参考，不能替代医院专业认知评估。多陪伴、多陪练，是最好的关爱。",
      "",
    ].join("\n");
    return lead + report;
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const p = getCognitiveProfile();
    this.maybeAutoSync();

    // 背景固定
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.5, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    const viewTop = 0;
    const viewBottom = h - NAV_H;
    const viewH = viewBottom - viewTop;

    // 先算布局（设计坐标），再决定内容高度
    const warn = this.buildWarnings(p);
    const warnX = 24;
    const warnW = w - 48;
    const warnMaxChars = Math.max(6, Math.floor((warnW - 32) / (13 * 0.95)));
    const warnWrapped = warn.map((t) => wrapText(t, warnMaxChars, 3));
    const warnTotal = warnWrapped.reduce((s, ls) => s + ls.length, 0);
    const warnH = 24 + warnTotal * 22 + 8;
    const warnY = 140;
    const reportLines = this.reportText().split("\n");
    const lineH = 22;
    const cardX = 24;
    const cardW = w - 48;
    let reportBlock = 0;
    const reportWrapped = reportLines.map((line) => {
      const ls = wrapText(line, 18, 2);
      reportBlock += (ls.length - 1) * 18 + lineH;
      return ls;
    });
    const cardH = 22 + reportBlock + 12;
    const reportY = warnY + warnH + 14;
    const btnW = Math.min(w - 48, 360);
    const btnX = (w - btnW) / 2;
    const btnY = reportY + cardH + 16;
    const copyY = btnY + 66;
    const remindY = copyY + 56;
    // 子女连接：状态条 + 连接按钮（默认纯离线；未配置后端时上面所有功能不受影响）
    const statusY = remindY + 56;
    const syncY = statusY + 48;
    const contentBottom = syncY + 60;

    this.scroll.begin(viewH, contentBottom);
    const off = this.off = this.scroll.offsetY;

    gameCanvas.setClip({ x: 0, y: viewTop, w, h: viewH });

    this.backRect = { x: 16, y: 16, w: 50, h: 50 };
    gameCanvas.drawRoundRect(this.backRect.x, this.backRect.y - off, 50, 50, 12, "rgba(255,255,255,0.08)", 5);
    gameCanvas.drawText("‹", this.backRect.x + 25, this.backRect.y + 27 - off, { size: 30, color: "#b9c0dc", bold: true }, 6);

    gameCanvas.drawText("家属关怀", w / 2, 44 - off, { size: 28, color: "#FFE66D", bold: true }, 5);
    gameCanvas.drawText("把健康月报发给子女 / 照护者", w / 2, 72 - off, { size: 13, color: "#9aa3c8" }, 5);

    // 周报 / 月报 切换
    const tabW = 116, tabGap = 12, tabH = 34;
    const tabTotal = tabW * 2 + tabGap;
    const tabX = (w - tabTotal) / 2;
    this.tabMonthRect = { x: tabX, y: 96, w: tabW, h: tabH };
    this.tabWeekRect = { x: tabX + tabW + tabGap, y: 96, w: tabW, h: tabH };
    const drawTab = (r: Rect, label: string, active: boolean) => {
      gameCanvas.drawRoundRect(r.x, r.y - off, r.w, r.h, 17, active ? "#FFE66D" : "rgba(255,255,255,0.10)", 6);
      if (!active) gameCanvas.drawStrokeRect(r.x, r.y - off, r.w, r.h, 17, "rgba(255,255,255,0.22)", 1.2, 6);
      gameCanvas.drawText(label, r.x + r.w / 2, r.y + r.h / 2 - off,
        { size: 15, color: active ? "#0c1a22" : "#c5cbe8", bold: active }, 7);
    };
    drawTab(this.tabMonthRect, "月报", this.tab === "month");
    drawTab(this.tabWeekRect, "周报", this.tab === "week");

    // 预警卡（温柔、非恐吓）
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,107,157,0.10)";
      ctx.beginPath();
      ctx.roundRect(warnX, warnY - off, warnW, warnH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,107,157,0.4)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText("👀 关爱提醒", warnX + 16, warnY + 24 - off, { size: 16, color: "#ff9b90", bold: true, align: "left" }, 6);
    let wy = warnY + 24 + 22;
    warnWrapped.forEach((ls) => {
      ls.forEach((ln) => {
        gameCanvas.drawText("· " + ln, warnX + 16, wy - off, { size: 13, color: "#ffd0c8", align: "left" }, 6);
        wy += 22;
      });
    });

    // 月报全文卡
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.roundRect(cardX, reportY - off, cardW, cardH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }, 5);
    let ry = reportY + 22;
    reportWrapped.forEach((ls) => {
      const gold = ls[0].startsWith("【");
      ls.forEach((ln, j) => {
        gameCanvas.drawText(ln, cardX + 16, ry + j * 18 - off,
          { size: 13, color: gold ? "#FFE66D" : "#cdd5f0", align: "left" }, 6);
      });
      ry += (ls.length - 1) * 18 + lineH;
    });

    // 生成微信卡片（主按钮）
    this.cardRect = { x: btnX, y: btnY, w: btnW, h: 56 };
    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(btnX, btnY - off, btnX, btnY + 56 - off);
      g.addColorStop(0, "#07C160"); g.addColorStop(1, "#06a050");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(btnX, btnY - off, btnW, 56, 15);
      ctx.fill();
    }, 5);
    gameCanvas.drawText("💬 生成微信卡片", w / 2, btnY + 28 - off, { size: 20, color: "#fff", bold: true }, 6);

    // 复制文字月报（次按钮）
    this.copyRect = { x: btnX, y: copyY, w: btnW, h: 46 };
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath();
      ctx.roundRect(btnX, copyY - off, btnW, 46, 13);
      ctx.fill();
      ctx.strokeStyle = "rgba(139,124,248,0.5)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText("📤 或复制文字月报", w / 2, copyY + 23 - off, { size: 16, color: "#c5bcff", bold: true }, 6);

    // 给子女发提醒（温情话术，一键复制）
    this.remindRect = { x: btnX, y: remindY, w: btnW, h: 46 };
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,159,67,0.16)";
      ctx.beginPath();
      ctx.roundRect(btnX, remindY - off, btnW, 46, 13);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,159,67,0.6)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText("💬 给子女发提醒", w / 2, remindY + 23 - off, { size: 16, color: "#FFB877", bold: true }, 6);

    // 子女连接状态条（温柔、不施压；未连接时明确「可照常使用」）
    const st = familySync.status();
    const statusText = !familySync.available()
      ? "尚未连接 · 可照常使用"
      : !st.bound
        ? "还未生成亲情码"
        : st.pending
          ? "待同步 · 下次自动重试"
          : `已同步 · ${this.describeLastSync(st.lastSyncAt)}`;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.roundRect(btnX, statusY - off, btnW, 40, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText("🔗 子女连接", btnX + 16, statusY + 20 - off,
      { size: 14, color: "#4ECDC4", bold: true, align: "left" }, 6);
    gameCanvas.drawText(statusText, btnX + btnW - 16, statusY + 20 - off,
      { size: 12, color: "#9aa3c8", align: "right" }, 6);

    // 连接 / 同步按钮（行为随状态变化：未绑定生成亲情码，已绑定同步周报）
    this.syncRect = { x: btnX, y: syncY, w: btnW, h: 46 };
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(78,205,196,0.16)";
      ctx.beginPath();
      ctx.roundRect(btnX, syncY - off, btnW, 46, 13);
      ctx.fill();
      ctx.strokeStyle = "rgba(78,205,196,0.6)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText(st.bound ? "🔄 同步周报给子女" : "🔗 生成亲情码给子女", w / 2, syncY + 23 - off,
      { size: 16, color: "#7FE3DC", bold: true }, 6);

    if (performance.now() < this.toastUntil && this.toastText) {
      const tw = Math.min(w - 48, this.toastText.length * 13 + 40);
      const tx = (w - tw) / 2;
      const ty = copyY + 58 - off;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.88)";
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 34, 10);
        ctx.fill();
      }, 60);
      gameCanvas.drawText(this.toastText, w / 2, ty + 17 - off, { size: 13, color: "#fff" }, 61);
    }

    gameCanvas.setClip(null);
    // 滚动条指示器从 y=70 起绘，避开右上「主页」按钮（其下沿≈64），不与底部导航条重叠
    this.scroll.drawScrollbar(w - 8, 70, viewH - 70);
  }

  /** 当前 tab 对应的报告文本（月报/周报） */
  private reportText(): string {
    return this.tab === "week" ? buildWeeklyReport() : this.fullReport();
  }

  /** 生成「给子女发提醒」温情话术并复制 */
  private copyRemind(): void {
    const last = progress.getLastPlayed();
    const days = last > 0 ? Math.max(0, Math.floor((Date.now() - last) / 86400000)) : 1;
    const text = reminderToChild(days);
    const clip = navigator.clipboard;
    const done = (ok: boolean) => {
      this.toastText = ok ? "提醒话术已复制，发给子女就行" : "请长按文字手动复制";
      this.toastUntil = performance.now() + 2200;
      this.render();
    };
    if (clip?.writeText) {
      clip.writeText(text).then(() => done(true)).catch(() => done(false));
    } else {
      done(false);
    }
  }

  /** 已配置后端且已绑定亲情码时，进入页面静默同步一次（失败不影响任何现有功能） */
  private maybeAutoSync(): void {
    if (this.autoSyncDone) return;
    this.autoSyncDone = true;
    if (!familySync.available() || !familySync.status().bound) return;
    void familySync.syncWeekly();
  }

  private describeLastSync(at: number | null): string {
    if (!at) return "—";
    const d = Math.floor((Date.now() - at) / 86400000);
    if (d <= 0) return "今天";
    if (d === 1) return "昨天";
    return `${d} 天前`;
  }

  /** 点击「连接子女」：未绑定则生成亲情码并复制，已绑定则同步周报 */
  private onSyncTap(): void {
    if (!familySync.status().bound) {
      const code = generateFamilyCode();
      familySync.bind(code);
      this.copyText(
        `我在「脑力花园」的亲情码是 ${code}，你用它就能看到我每周动脑的情况。`,
        "亲情码已复制，发给子女就行",
      );
      return;
    }
    if (!familySync.available()) {
      this.toastText = "尚未连接远程服务，复制周报发给子女一样管用";
      this.toastUntil = performance.now() + 2600;
      this.render();
      return;
    }
    void familySync.syncWeekly().then((ok) => {
      this.toastText = ok ? "周报已同步给子女" : "暂时没连上，不影响使用";
      this.toastUntil = performance.now() + 2600;
      this.render();
    });
  }

  private copyText(text: string, okMsg: string): void {
    const done = (ok: boolean) => {
      this.toastText = ok ? okMsg : "请长按文字手动复制";
      this.toastUntil = performance.now() + 2200;
      this.render();
    };
    const clip = navigator.clipboard;
    if (clip?.writeText) clip.writeText(text).then(() => done(true)).catch(() => done(false));
    else done(false);
  }

  destroy(): void {
    gameCanvas.setScrollHandler(null);
    gameCanvas.setClip(null);
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
