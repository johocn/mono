/**
 * VoteScene — 「最喜欢哪一款」统一问卷页
 *
 * 玩法：列出 11 个玩法，点一下就选为「最喜欢」（单选互斥，可改、可取消）。
 * 投票走 zhao-website 的 interaction 接口（匿名、可取消），本地也记一份，离线同样看得到自己的选择。
 *
 * 排行榜：后端目前没有公开的互动统计接口，因此**不造假数据**——
 * 显示「正在统计中」，后端补上统计接口后会自动切换为真实榜单（见 CommunityApi.fetchRanking）。
 *
 * 单个玩法的点赞在 LevelSelectScene（可多选），与本页的单选是两个独立维度。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { NAV_H } from "../ui/SceneChrome";
import { ScrollView } from "../ui/ScrollView";
import { MODE_META, MODE_ORDER } from "../config/ModeMeta";
import type { ModeId } from "../config/LevelConfig";
import { fetchRanking, getVotes, setFavorite, type RankRow } from "../core/CommunityApi";

interface Rect { x: number; y: number; w: number; h: number }

export interface VoteCallbacks {
  onBack(): void;
}

const ROW_H = 64;
const ROW_GAP = 10;

export class VoteScene {
  private cb: VoteCallbacks;
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rowRects: { mode: ModeId; rect: Rect }[] = [];
  private scroll = new ScrollView();
  private off = 0;
  private ranking: RankRow[] | null = null;
  private toastUntil = 0;
  private toastText = "";

  constructor(cb: VoteCallbacks) {
    this.cb = cb;
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.render());
    gameCanvas.setScrollHandler((_dx, dy) => this.scroll.scrollBy(dy));
    void this.loadRanking();
  }

  private async loadRanking(): Promise<void> {
    const rows = await fetchRanking();
    // 接口正常但结果为空（如最后一票被取消）也要清空榜单，避免旧数据残留
    if (rows) this.ranking = rows;
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    if (this.hit(this.backRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onBack();
      return;
    }
    const yy = y + this.off; // 命中判定加回滚动偏移
    for (const item of this.rowRects) {
      if (!this.hit(item.rect, x, yy)) continue;
      audioSynth.playUi("button");
      const cur = getVotes().favorite;
      // 再点一次 = 取消；点别的 = 改选（接口内部会先撤旧的）
      // 投票落库后刷新排行榜，让「最受欢迎」立即反映刚才这一票
      void setFavorite(cur === item.mode ? null : item.mode).then(() => void this.loadRanking());
      this.showToast(cur === item.mode ? "已取消选择" : `已选「${MODE_META[item.mode].name}」`);
      return;
    }
  }

  private showToast(text: string): void {
    this.toastText = text;
    this.toastUntil = performance.now() + 2200;
    this.render();
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.5, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    // === 固定头部（不随内容滚动）===
    this.backRect = { x: 16, y: 16, w: 50, h: 50 };
    gameCanvas.drawRoundRect(this.backRect.x, this.backRect.y, 50, 50, 12, "rgba(255,255,255,0.08)", 5);
    gameCanvas.drawText("‹", this.backRect.x + 25, this.backRect.y + 27,
      { size: 30, color: "#b9c0dc", bold: true }, 6);
    gameCanvas.drawText("最喜欢哪一款？", w / 2, 44, { size: 26, color: "#FFE66D", bold: true }, 5);
    gameCanvas.drawText("点一下就选好了，随时可以改", w / 2, 72, { size: 13, color: "#9aa3c8" }, 5);

    // === 可滚动内容区 ===
    const viewTop = 100;
    const viewH = Math.max(80, h - NAV_H - viewTop);
    const rowX = 24;
    const rowW = w - 48;
    const rowsTop = viewTop + 8;
    const rowsH = MODE_ORDER.length * (ROW_H + ROW_GAP);
    const rankTop = rowsTop + rowsH + 12;
    const rankH = 170;
    const contentH = rankTop + rankH + 24 - viewTop;

    this.scroll.begin(viewH, contentH);
    const off = this.off = this.scroll.offsetY;
    gameCanvas.setClip({ x: 0, y: viewTop, w, h: viewH });

    const fav = getVotes().favorite;
    this.rowRects = [];
    MODE_ORDER.forEach((mode, i) => {
      const meta = MODE_META[mode];
      const y = rowsTop + i * (ROW_H + ROW_GAP) - off;
      const rect = { x: rowX, y: rowsTop + i * (ROW_H + ROW_GAP), w: rowW, h: ROW_H };
      this.rowRects.push({ mode, rect });
      const selected = fav === mode;

      gameCanvas.draw((ctx) => {
        ctx.fillStyle = selected ? hexA(meta.color, 0.22) : "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.roundRect(rowX, y, rowW, ROW_H, 14);
        ctx.fill();
        ctx.strokeStyle = selected ? meta.color : "rgba(255,255,255,0.14)";
        ctx.lineWidth = selected ? 2 : 1;
        ctx.stroke();
      }, 5);

      gameCanvas.drawText(meta.icon, rowX + 30, y + ROW_H / 2, { size: 24 }, 6);
      gameCanvas.drawText(meta.name, rowX + 58, y + ROW_H / 2,
        { size: 17, color: selected ? "#fff" : "#cdd5f0", align: "left", bold: selected }, 6);
      // 右侧状态：用「❤️ 最喜欢」大字，而不是小图标，长辈看得清
      gameCanvas.drawText(selected ? "❤️ 最喜欢" : "选它", rowX + rowW - 18, y + ROW_H / 2,
        { size: selected ? 15 : 13, color: selected ? meta.color : "#8b93b8", align: "right", bold: selected }, 6);
    });

    // === 排行榜（后端暂无统计接口 → 不造假数据）===
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.roundRect(rowX, rankTop - off, rowW, rankH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,230,109,0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText("🏆 最受欢迎", rowX + 16, rankTop + 26 - off,
      { size: 17, color: "#FFE66D", bold: true, align: "left" }, 6);

    if (this.ranking && this.ranking.length) {
      const top = this.ranking.slice(0, 5);
      const max = Math.max(1, top[0].count);
      top.forEach((row, i) => {
        const meta = MODE_META[row.mode];
        const y = rankTop + 56 + i * 22 - off;
        const barW = (rowW - 150) * (row.count / max);
        gameCanvas.drawText(`${meta.icon} ${MODE_META[row.mode].name}`, rowX + 16, y,
          { size: 13, color: "#cdd5f0", align: "left" }, 6);
        gameCanvas.drawRoundRect(rowX + 130, y - 5, Math.max(4, barW), 10, 5, meta?.color || "#4ECDC4", 6);
        gameCanvas.drawText(`${row.count}`, rowX + rowW - 16, y,
          { size: 13, color: "#FFE66D", align: "right" }, 6);
      });
    } else {
      gameCanvas.drawText("大家的选择正在统计中，", w / 2, rankTop + 70 - off,
        { size: 14, color: "#9aa3c8" }, 6);
      gameCanvas.drawText("过几天就能看到排行榜啦。", w / 2, rankTop + 94 - off,
        { size: 14, color: "#9aa3c8" }, 6);
      gameCanvas.drawText("您的投票是匿名的，不会收集个人信息", w / 2, rankTop + 128 - off,
        { size: 12, color: "#6f7899" }, 6);
    }

    if (performance.now() < this.toastUntil && this.toastText) {
      const tw = Math.min(w - 48, this.toastText.length * 14 + 40);
      const tx = (w - tw) / 2;
      const ty = h - NAV_H - 60;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.88)";
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 34, 10);
        ctx.fill();
      }, 60);
      gameCanvas.drawText(this.toastText, w / 2, ty + 17, { size: 13, color: "#fff" }, 61);
    }

    gameCanvas.setClip(null);
    this.scroll.drawScrollbar(w - 8, viewTop + 10, viewH - 20);
  }

  destroy(): void {
    gameCanvas.setScrollHandler(null);
    gameCanvas.setClip(null);
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}

/** 给 #RRGGBB 加透明度，用于选中行底色 */
function hexA(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
