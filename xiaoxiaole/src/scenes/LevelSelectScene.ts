/**
 * LevelSelectScene — 章节世界地图（模式 Tab + 季节章节 + 蛇形路径节点）
 *
 * 设计要点（方案 A · 最小改动）：
 * - 顶部模式 Tab（时光整理师 / 听音辨位 / 诗词连连看 / 双阳特色），切换过滤
 * - 内容区按 level.chapter 分组；每个「页」= 一个章节，展示该章标题与蛇形路径节点
 * - 每个节点：圆形，含关卡序号 / 星数 / 锁定态 / 通关 ✓；当前进度节点呼吸高亮
 * - 路径连线：已布置关卡按顺序连成蜿蜒折线（蛇形排布）
 * - 未解锁节点置灰显示锁，点击给出「先通关上一关」提示
 * - 上一章 / 下一章 分页浏览（无整页滚动，复用现有分页，低风险）
 */

import { gameCanvas } from "../ui/GameCanvas";
import { NAV_H } from "../ui/SceneChrome";
import { audioSynth } from "../ui/AudioSynth";
import { progress } from "../core/ProgressStore";
import { Easing } from "../core/Tween";
import {
  ALL_LEVELS, getLevelsByMode, type LevelConfig, type ModeId,
} from "../config/LevelConfig";
import { getTheme } from "../config/themes";
import { MODE_META, MODE_ORDER } from "../config/ModeMeta";
import { getVotes, toggleLike } from "../core/CommunityApi";

// short 用于顶部模式标签（标签宽度按数量均分，模式越多越窄，必须短名兜底）
// 元数据已抽到共享配置（投票问卷页也要用），见 config/ModeMeta.ts

/** 粗略估算标签宽度（CJK/emoji 按 1 字宽、空格按 0.3），用于自适应字号 */
function estimateLabelWidth(text: string, size: number): number {
  let unit = 0;
  for (const ch of text) unit += /\s/.test(ch) ? 0.3 : 1;
  return unit * size;
}

/** 在 maxW 内缩字号，放不下就退回纯短名不带图标 */
function fitTabLabel(icon: string, short: string, maxW: number): { text: string; size: number } {
  for (const text of [`${icon} ${short}`, short]) {
    for (let size = 13; size >= 9; size--) {
      if (estimateLabelWidth(text, size) <= maxW) return { text, size };
    }
  }
  return { text: short, size: 9 };
}



interface Card {
  level: LevelConfig;
  x: number;            // 节点圆心 x
  y: number;            // 节点圆心 y
  w: number;            // = 2 * 半径（用于圆形命中与尺寸）
  h: number;
  unlocked: boolean;
}

export class LevelSelectScene {
  private onPick: (level: LevelConfig) => void;
  private onBack: () => void;
  private cards: Card[] = [];
  private backRect = { x: 0, y: 0, w: 0, h: 0 };
  /** 点赞当前玩法（可多选；与问卷页「最喜欢」单选是独立维度） */
  private likeRect = { x: 0, y: 0, w: 0, h: 0 };
  private tabRects: { mode: ModeId | "shuangyang"; x: number; y: number; w: number; h: number }[] = [];
  private time = 0;
  private lastTime = 0;
  private enterP = 0;
  private toast = "";
  private toastTimer = 0;
  private currentFilter: ModeId | "shuangyang" = "match3";
  private page = 0;               // 当前章节页（0 起）
  private totalPages = 1;
  private pageRects: { key: "prev" | "next"; x: number; y: number; w: number; h: number }[] = [];

  constructor(
    onPick: (level: LevelConfig) => void,
    onBack: () => void,
    initialFilter: ModeId | "shuangyang" = "match3",
  ) {
    this.onPick = onPick;
    this.onBack = onBack;
    this.currentFilter = initialFilter;
    this.page = this.computeCurrentPage(initialFilter); // 进入即跳到当前进度章节
    this.lastTime = performance.now();
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
  }

  private update(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.time = now;
    if (this.enterP < 1) this.enterP = Math.min(1, this.enterP + dt / 0.3);
    if (this.toastTimer > 0) this.toastTimer -= dt;
    this.render();
  }

  /** 计算「当前进度所在章节页」：首个已解锁且未通关的关卡所在章节；全通关则跳到最新章节 */
  private computeCurrentPage(filter: ModeId | "shuangyang"): number {
    const allLevels = filter === "shuangyang"
      ? ALL_LEVELS.filter((l) => l.theme === "shuangyang")
      : getLevelsByMode(filter);
    const groups: { chapter: number; levels: LevelConfig[] }[] = [];
    for (const l of allLevels) {
      const ch = l.chapter ?? 0;
      const g = groups.find((x) => x.chapter === ch);
      if (g) g.levels.push(l);
      else groups.push({ chapter: ch, levels: [l] });
    }
    for (let i = 0; i < groups.length; i++) {
      const frontier = groups[i].levels.find((l) =>
        (filter === "shuangyang" ? true : progress.isUnlocked(l.id)) &&
        !progress.getRecord(l.id)?.passed);
      if (frontier) return i;
    }
    return Math.max(0, groups.length - 1);
  }

  private onTouch(x: number, y: number): void {
    const b = this.backRect;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      audioSynth.playUi("button");
      this.onBack();
      return;
    }
    // 点赞当前玩法（离线也照常记录，界面立刻有反馈）
    if (this.likeRect.w > 0 && x >= this.likeRect.x && x <= this.likeRect.x + this.likeRect.w
      && y >= this.likeRect.y && y <= this.likeRect.y + this.likeRect.h) {
      const mode = this.currentFilter;
      if (mode !== "shuangyang") {
        // 先读旧状态再异步提交，提示语才不会因网络延迟说反
        const had = getVotes().liked.includes(mode);
        audioSynth.playUi("button");
        void toggleLike(mode);
        this.toast = had ? "已取消点赞" : "已点赞，谢谢您的喜欢";
        this.toastTimer = 2;
      }
      return;
    }
    for (const t of this.tabRects) {
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        if (this.currentFilter !== t.mode) {
          this.currentFilter = t.mode;
          this.page = this.computeCurrentPage(t.mode); // 切换模式跳到当前进度章节
          this.enterP = 0; // 重新淡入
        }
        audioSynth.playUi("button");
        return;
      }
    }
    for (const r of this.pageRects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        if (r.key === "prev" && this.page > 0) { this.page--; audioSynth.playUi("button"); this.enterP = 0; }
        else if (r.key === "next" && this.page < this.totalPages - 1) { this.page++; audioSynth.playUi("button"); this.enterP = 0; }
        return;
      }
    }
    for (const c of this.cards) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy <= (c.w / 2) * (c.w / 2)) {
        if (!c.unlocked) {
          this.toast = "先通关同一模式的上一关吧";
          this.toastTimer = 2;
          audioSynth.playUi("invalid");
          return;
        }
        audioSynth.playUi("button");
        this.onPick(c.level);
        return;
      }
    }
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#161832");
      grad.addColorStop(0.6, "#1a1a2e");
      grad.addColorStop(1, "#0f2038");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(w * 0.5, h * 0.12, 0, w * 0.5, h * 0.12, w * 0.7);
      glow.addColorStop(0, "rgba(255,230,109,0.10)");
      glow.addColorStop(1, "rgba(255,230,109,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    // 返回
    this.backRect = { x: 14, y: 20, w: 52, h: 52 };
    gameCanvas.drawRoundRect(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12,
      "rgba(255,255,255,0.10)", 5);
    gameCanvas.drawText("‹", this.backRect.x + 26, this.backRect.y + 24,
      { size: 34, color: "#cdd5f0", bold: true }, 6);

    // 点赞按钮（右上角；「双阳特色」是合集不是单一玩法，不显示）
    if (this.currentFilter !== "shuangyang") {
      const liked = getVotes().liked.includes(this.currentFilter);
      this.likeRect = { x: w - 90, y: 20, w: 76, h: 52 };
      gameCanvas.drawRoundRect(this.likeRect.x, this.likeRect.y, this.likeRect.w, this.likeRect.h, 12,
        liked ? "rgba(255,107,157,0.28)" : "rgba(255,255,255,0.10)", 5);
      gameCanvas.drawStrokeRect(this.likeRect.x, this.likeRect.y, this.likeRect.w, this.likeRect.h, 12,
        liked ? "#FF6B9D" : "rgba(255,255,255,0.22)", 1.5, 6);
      gameCanvas.drawText(liked ? "❤️ 已赞" : "👍 点赞", this.likeRect.x + this.likeRect.w / 2,
        this.likeRect.y + 27, { size: 14, color: liked ? "#FF9BB3" : "#cdd5f0", bold: liked }, 6);
    } else {
      this.likeRect = { x: 0, y: 0, w: 0, h: 0 };
    }

    const titleText = this.currentFilter === "shuangyang" ? "双阳特色 · 选关" : "选择关卡";
    gameCanvas.drawText(titleText, w / 2, 40, { size: 26, color: "#FFE66D", bold: true }, 6);
    if (this.currentFilter === "shuangyang") {
      const complete = progress.isShuangyangComplete();
      gameCanvas.drawText(
        complete
          ? "长春·双阳 — 鹿乡 · 草莓 · 湖光 · 听风 · 诗词   🏅 已集齐纪念徽章"
          : "长春·双阳 — 鹿乡 · 草莓 · 湖光 · 听风 · 诗词",
        w / 2, 77, { size: 12, color: complete ? "#FFE66D" : "#E0A82E" }, 6);
    }
    const total = progress.getTotalStars();
    const maxStars = progress.getMaxStars();
    gameCanvas.drawText(`★ ${total} / ${maxStars}`, w / 2, 66,
      { size: 14, color: "#9aa3c8" }, 6);

    // 模式 Tab（含「双阳特色」专区）：分两行显示，图标 + 短名，避免单行拥挤 / 字号被压小
    this.tabRects = [];
    const tabTop = 84;
    const tabH = 40;
    const tabMargin = 18;
    const tabGap = 10;
    const tabRowGap = 8;
    const FEATURED_META = { name: "双阳特色", short: "双阳", color: "#E0A82E", icon: "🦌" };
    const tabModes: (ModeId | "shuangyang")[] = [...MODE_ORDER, "shuangyang"];
    const perRow = 5; // 每行 5 个分类按钮
    const tabW = (w - tabMargin * 2 - tabGap * (perRow - 1)) / perRow;
    const tabRows = Math.ceil(tabModes.length / perRow);
    tabModes.forEach((mode, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const tx = tabMargin + col * (tabW + tabGap);
      const ty = tabTop + row * (tabH + tabRowGap);
      this.tabRects.push({ mode, x: tx, y: ty, w: tabW, h: tabH });
      const active = this.currentFilter === mode;
      const meta = mode === "shuangyang" ? FEATURED_META : MODE_META[mode];
      gameCanvas.drawRoundRect(tx, ty, tabW, tabH, 12,
        active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)", 10);
      gameCanvas.drawStrokeRect(tx, ty, tabW, tabH, 12,
        active ? meta.color : "rgba(255,255,255,0.14)", active ? 2.5 : 1, 11);
      gameCanvas.drawText(`${meta.icon} ${meta.short}`, tx + tabW / 2, ty + tabH / 2,
        { size: 15, color: active ? meta.color : "rgba(200,208,235,0.85)", bold: active }, 12);
    });

    // 关卡（按模式过滤 + 按 chapter 分组；每页 = 一个章节，蛇形路径节点）
    // 分类 Tab 行数变化时，关卡区顶部自动下移，避免与 Tab 重叠
    const gridTop = tabTop + tabRows * tabH + (tabRows - 1) * tabRowGap + 12;
    const allLevels = this.currentFilter === "shuangyang"
      ? ALL_LEVELS.filter((l) => l.theme === "shuangyang")
      : getLevelsByMode(this.currentFilter);

    // 按 chapter 分组（保持出现顺序）
    const groups: { chapter: number; levels: LevelConfig[] }[] = [];
    for (const l of allLevels) {
      const ch = l.chapter ?? 0;
      const g = groups.find((x) => x.chapter === ch);
      if (g) g.levels.push(l);
      else groups.push({ chapter: ch, levels: [l] });
    }
    this.totalPages = Math.max(1, groups.length);
    if (this.page >= this.totalPages) this.page = this.totalPages - 1;
    const group = groups[this.page];

    // 章节标题
    const theme = getTheme(group?.levels[0]?.theme);
    if (group) {
      gameCanvas.drawText(`第 ${group.chapter} 章`, w / 2, gridTop + 24,
        { size: 20, bold: true, color: theme.accent }, 6);
      gameCanvas.drawText(`${theme.emoji} ${theme.label}`, w / 2, gridTop + 50,
        { size: 14, color: "rgba(200,208,235,0.85)" }, 6);
    }

    // 节点布局（蛇形）
    this.cards = [];
    if (group) {
      const margin = 18;
      const headerGap = 64;
      const bottomGap = 176;
      const nodesTop = gridTop + headerGap + 10;
      const nodesBottom = h - bottomGap;
      const availH = Math.max(120, nodesBottom - nodesTop);

      const levels = group.levels;
      const n = levels.length;
      const cols = 4;
      const gapX = (w - margin * 2) / cols;
      const nodeR = Math.min(34, gapX * 0.36);

      const rows = Math.ceil(n / cols);
      const vGap = 30;
      const rowStride = rows > 1
        ? Math.min(106, (availH - nodeR * 2) / (rows - 1))
        : 0;
      const blockH = (rows - 1) * rowStride + nodeR * 2;
      const startY = nodesTop + Math.max(0, (availH - blockH) / 2) + nodeR;

      // 计算节点圆心（蛇形：奇数行反向）
      const pts: { cx: number; cy: number; level: LevelConfig; unlocked: boolean }[] = [];
      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const c = row % 2 === 0 ? col : (cols - 1 - col);
        const cx = margin + gapX * (c + 0.5);
        const cy = startY + row * rowStride;
        const level = levels[i];
        const unlocked = this.currentFilter === "shuangyang" ? true : progress.isUnlocked(level.id);
        pts.push({ cx, cy, level, unlocked });
        this.cards.push({ level, x: cx, y: cy, w: nodeR * 2, h: nodeR * 2, unlocked });
      }

      // 找「当前进度节点」：本章首个已解锁且未通关者
      const currentIdx = pts.findIndex((p) => p.unlocked && !progress.getRecord(p.level.id)?.passed);

      // 路径连线（蛇形折线，位于节点下方）
      if (pts.length > 1) {
        gameCanvas.draw((ctx) => {
          ctx.strokeStyle = theme.accent + "66";
          ctx.lineWidth = 3;
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(pts[0].cx, pts[0].cy);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].cx, pts[i].cy);
          ctx.stroke();
        }, 2);
      }

      // 节点（带进入动画）
      pts.forEach((p, i) => {
        const delay = i * 0.04;
        const p01 = Math.max(0, Math.min(1, (this.enterP - delay) / 0.4));
        if (p01 <= 0) return;
        const ease = Easing.outCubic(p01);
        const dy = (1 - ease) * 18;
        this.drawNode(p.cx, p.cy + dy, nodeR, p.level, p.unlocked, ease, i === currentIdx);
      });
    }

    // 章节分页导航（与底部导航栏留出间距，按钮 / 页码 / 提示分层排列，解决重叠拥挤）
    this.pageRects = [];
    if (this.totalPages > 1) {
      const navY = h - NAV_H - 56;
      const btnW = 92, btnH = 38, navGap = 18;
      const totalW = btnW * 2 + navGap;
      const bx = w / 2 - totalW / 2;
      this.pageRects = [
        { key: "prev", x: bx, y: navY, w: btnW, h: btnH },
        { key: "next", x: bx + btnW + navGap, y: navY, w: btnW, h: btnH },
      ];
      const canPrev = this.page > 0;
      const canNext = this.page < this.totalPages - 1;
      this.pageRects.forEach((r) => {
        const enabled = r.key === "prev" ? canPrev : canNext;
        gameCanvas.drawRoundRect(r.x, r.y, r.w, r.h, 12, enabled ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)", 8);
        gameCanvas.drawStrokeRect(r.x, r.y, r.w, r.h, 12, enabled ? "#FFE66D" : "rgba(255,255,255,0.12)", 1.5, 9);
        gameCanvas.drawText(r.key === "prev" ? "‹ 上一章" : "下一章 ›", r.x + r.w / 2, r.y + r.h / 2, { size: 14, color: enabled ? "#FFE66D" : "rgba(255,255,255,0.3)" }, 6);
      });
      gameCanvas.drawText(`第 ${this.page + 1} / ${this.totalPages} 章`, w / 2, navY - 16, { size: 12, color: "#9aa3c8" }, 6);
    }

    gameCanvas.drawText("点击节点开始训练", w / 2, h - NAV_H - 96,
      { size: 14, color: "#6b7396" }, 6);

    if (this.toastTimer > 0) {
      const alpha = Math.min(1, this.toastTimer / 0.3);
      gameCanvas.drawRoundRect(w / 2 - 150, h - 92, 300, 40, 10,
        `rgba(231,76,60,${0.85 * alpha})`, 20);
      gameCanvas.drawText(this.toast, w / 2, h - 72,
        { size: 15, color: `rgba(255,255,255,${alpha})`, bold: true }, 21);
    }
  }

  private drawNode(
    cx: number, cy: number, r: number,
    level: LevelConfig, unlocked: boolean, alpha: number, isCurrent: boolean,
  ): void {
    const theme = getTheme(level.theme);
    const stars = progress.getStars(level.id);
    const passed = !!progress.getRecord(level.id)?.passed;

    // 当前进度节点：呼吸高亮
    if (isCurrent && unlocked) gameCanvas.drawBreathGlow(cx, cy, r + 6, theme.accent, this.time, 3);

    gameCanvas.draw((ctx) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = unlocked ? theme.accent + "22" : "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = unlocked ? theme.accent : "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }, 4);

    if (unlocked) {
      gameCanvas.drawText(level.id, cx, cy - 1, { size: 12, bold: true, color: "#fff" }, 6);
      const starStr = "★".repeat(stars) + "☆".repeat(3 - stars);
      gameCanvas.drawText(starStr, cx, cy + r + 14,
        { size: 13, color: stars > 0 ? "#FFE66D" : "rgba(255,255,255,0.25)" }, 6);
      if (passed) {
        gameCanvas.drawCircle(cx + r * 0.7, cy - r * 0.7, 9, "rgba(39,174,96,0.95)", 6);
        gameCanvas.drawText("✓", cx + r * 0.7, cy - r * 0.7, { size: 12, bold: true, color: "#fff" }, 7);
      }
    } else {
      gameCanvas.drawText("🔒", cx, cy + 1, { size: 20, color: "rgba(255,255,255,0.5)" }, 6);
    }
  }

  destroy(): void {
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
    this.cards = [];
  }
}

/** 供主菜单展示：某模式已获得星数摘要 */
export function modeStarSummary(mode: ModeId): { got: number; max: number; name: string; color: string } {
  const meta = MODE_META[mode];
  const s = progress.getModeStars(mode);
  return { got: s.got, max: s.max, name: meta.name, color: meta.color };
}

/** 该模式已解锁关卡数 / 总关卡数 */
export function modeProgress(mode: ModeId): { unlocked: number; total: number } {
  const levels = getLevelsByMode(mode);
  return {
    unlocked: levels.filter((l) => progress.isUnlocked(l.id)).length,
    total: levels.length,
  };
}
