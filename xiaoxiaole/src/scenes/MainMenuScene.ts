/**
 * MainMenuScene — 首页：继续训练 / 常用功能 / 认知域分类玩法
 *
 * 适老化改版要点：
 * 1. 首屏只做一件事：一个巨大的「继续训练」按钮，老人不需要选择
 * 2. 玩法按认知域分类（记忆 / 注意 / 生活 / 双阳），不再一次堆 10 个入口
 * 3. 卡片区可上下滑动 + 右侧滚动条 + 「下面还有」提示，解决「下面的内容看不见」
 * 4. 顶栏只留一个设置齿轮；签到 / 转盘 / 成就 / 邀请等收进「常用功能」宫格
 * 5. 首页按返回键弹「要离开花园吗？」确认面板（见 ExitGuard + promptExitConfirm）
 * 6. 设置里可切 标准 / 大 / 超大 三档字号（全局生效）
 */

import { gameCanvas } from "../ui/GameCanvas";
import { sceneChrome, NAV_H } from "../ui/SceneChrome";
import { ScrollView } from "../ui/ScrollView";
import { audioSynth } from "../ui/AudioSynth";
import { safety, SafetyManager } from "../core/SafetyManager";
import { exitGuard } from "../core/ExitGuard";
import { progress } from "../core/ProgressStore";
import { achievements, type Celebration } from "../core/AchievementStore";
import { addHammerInv } from "../core/BoosterStore";
import { Easing } from "../core/Tween";
import { GAME_CONFIG } from "../core/GameConfig";
import { STORY_INTRO, NPC_NAME } from "../config/GameText";
import { ALL_LEVELS, type ModeId, type ItemConfig } from "../config/LevelConfig";
import { reviews } from "../core/ReviewStore";
import { POINTS_RULES } from "../config/PointsConfig";
import { wrapText } from "../ui/ResultCard";

export interface MainMenuCallbacks {
  onContinue(): void;
  onPickMode(mode: ModeId): void;
  onOpenLevels(): void;
  onOpenShuangyang(): void;
  onOpenBrainCenter(): void;
  onReset(): void;
  onOpenShop(): void;
  onOpenSkins(): void;
  onOpenReview(): void;
  onInvite(): void;
  onOpenSignin(): void;
  onOpenWheel(): void;
  onOpenAchievements(): void;
}

interface ModeInfo { mode: ModeId; label: string; desc: string; color: string; icon: string }

const MODE_INFO: Record<ModeId, ModeInfo> = {
  match3: { mode: "match3", label: "时光整理师", desc: "整理花园 · 练手眼", color: "#FF6B9D", icon: "🌸" },
  audio: { mode: "audio", label: "听音辨位", desc: "听声音 · 记位置", color: "#6C5CE7", icon: "🎵" },
  poetry: { mode: "poetry", label: "诗词连连看", desc: "接上下句 · 背诗词", color: "#9b59b6", icon: "📜" },
  corsi: { mode: "corsi", label: "空间记忆", desc: "看顺序 · 再点一遍", color: "#2E7D8A", icon: "🟦" },
  face: { mode: "face", label: "面孔记忆", desc: "记人脸 · 记名字", color: "#E08A3C", icon: "🧑" },
  memory: { mode: "memory", label: "记忆翻翻乐", desc: "翻卡片 · 找成对", color: "#4ECDC4", icon: "🃏" },
  stroop: { mode: "stroop", label: "色词干扰", desc: "看颜色 · 不看字", color: "#F2784B", icon: "🎨" },
  money: { mode: "money", label: "买菜算账", desc: "算价钱 · 找零钱", color: "#2FA84F", icon: "💰" },
  pm: { mode: "pm", label: "前瞻记忆", desc: "记着待办 · 别忘事", color: "#8B5CF6", icon: "🔔" },
  clock: { mode: "clock", label: "时间定向", desc: "认钟表 · 看时间", color: "#3E7CB1", icon: "🕐" },
  nostalgia: { mode: "nostalgia", label: "怀旧金曲", desc: "听老歌 · 猜歌名", color: "#E0679B", icon: "🎶" },
};

/** 认知域分类：把 11 个玩法归纳成 4 类，老人一眼能找到「我想练什么」 */
type CategoryId = "memory" | "attention" | "life" | "shuangyang";

const CATEGORIES: { id: CategoryId; label: string; icon: string; modes: ModeId[] }[] = [
  { id: "memory", label: "记忆", icon: "🧠", modes: ["memory", "face", "corsi", "audio"] },
  { id: "attention", label: "注意", icon: "👀", modes: ["match3", "stroop", "pm"] },
  { id: "life", label: "生活", icon: "🛒", modes: ["poetry", "money", "clock"] },
  { id: "shuangyang", label: "双阳", icon: "🦌", modes: ["nostalgia"] },
];

const ITEM_NAME: Record<keyof ItemConfig, string> = {
  hint: "提示", reshuffle: "重洗", reveal: "揭示", peek: "偷看", undo: "撤销", rehear: "重听",
  step: "补步", shield: "护盾", hammer: "锤子",
};

interface Rect { x: number; y: number; w: number; h: number }

export class MainMenuScene {
  private cb: MainMenuCallbacks;
  private showSettings = false;
  private confirmReset = false;
  /** 退出网页二次确认（由 ExitGuard 在首页按返回键时唤起） */
  private confirmExit = false;

  private continueRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private levelRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private brainRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private tabRects: { id: CategoryId; rect: Rect }[] = [];
  private modeRects: { rect: Rect; mode: ModeId }[] = [];
  private syRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private quickRects: { rect: Rect; key: "signin" | "wheel" | "achv" | "skins" | "review" | "invite" }[] = [];
  private settingsRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private toggleRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private soundRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private fontRects: Rect[] = [];
  private resetRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private confirmYesRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private confirmNoRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private exitStayRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private exitLeaveRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private dailyGiftText = "";

  /** 成就庆祝（非 null 时拦截其它按钮；可连续弹出多个） */
  private celebration: Celebration | null = null;
  private celebrationRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private category: CategoryId = "memory";
  private scroll = new ScrollView();
  /** 列表区（用于裁剪 + 点击延迟判定：滑动时不触发点选） */
  private listRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private pendingTap: { x: number; y: number } | null = null;
  private dragMoved = false;
  private onPointerUp = (): void => this.flushTap();

  private time = 0;
  private lastTime = 0;
  private enterP = 0;

  constructor(cb: MainMenuCallbacks) {
    this.cb = cb;
    this.lastTime = performance.now();
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setScrollHandler((_dx, dy) => {
      if (Math.abs(dy) > 2) this.dragMoved = true;
      this.scroll.scrollBy(dy);
    });
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("mouseup", this.onPointerUp);

    const gift = progress.dailyGift();
    if (gift) {
      progress.addPoints(POINTS_RULES.dailyGift, "earn_daily");
      addHammerInv(1); // 每日登录额外赠送 1 把锤子，强化 P0 锤子玩法的留存黏性
      this.dailyGiftText = `今日登录礼：获得「${ITEM_NAME[gift]}」×1 · 🔨锤子×1 · 积分 +${POINTS_RULES.dailyGift}`;
    }
    // 消费待展示成就庆祝（showMainMenu 已先 evaluate；签到连击等在此弹出）
    this.celebration = achievements.consumeCelebration();
  }

  /** 首页按返回键：ExitGuard 调它弹出确认面板 */
  promptExitConfirm(): void {
    this.confirmExit = true;
  }

  private update(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.time = now;
    if (this.enterP < 1) this.enterP = Math.min(1, this.enterP + dt / 0.35);
    this.render();
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // === 输入 ===

  private onTouch(x: number, y: number): void {
    // 列表区：按下先记录，抬起时若没滑动才算点击（滑动 = 滚动，不误触）
    const inList = y >= this.listRect.y && y <= this.listRect.y + this.listRect.h;
    if (inList && !this.showSettings && !this.confirmReset && !this.confirmExit && this.celebration === null) {
      this.pendingTap = { x, y };
      this.dragMoved = false;
      return;
    }
    this.handleTap(x, y);
  }

  private flushTap(): void {
    const p = this.pendingTap;
    this.pendingTap = null;
    if (!p || this.dragMoved) return;
    this.handleTap(p.x, p.y);
  }

  private handleTap(x: number, y: number): void {
    // 成就庆祝弹窗：拦截其它按钮，仅「收下」可关闭
    if (this.celebration !== null) {
      if (this.hit(this.celebrationRect, x, y)) {
        audioSynth.playUi("button");
        this.celebration = achievements.consumeCelebration();
      }
      return;
    }

    // 退出网页确认：最高优先级
    if (this.confirmExit) {
      if (this.hit(this.exitStayRect, x, y)) {
        audioSynth.playUi("button");
        this.confirmExit = false;
        exitGuard.stay();
      } else if (this.hit(this.exitLeaveRect, x, y)) {
        audioSynth.playUi("button");
        this.confirmExit = false;
        exitGuard.leave();
      }
      return;
    }

    // 重置二次确认
    if (this.confirmReset) {
      if (this.hit(this.confirmYesRect, x, y)) {
        audioSynth.playUi("button");
        progress.reset();
        this.confirmReset = false;
        this.showSettings = false;
        this.cb.onReset();
      } else if (this.hit(this.confirmNoRect, x, y)) {
        audioSynth.playUi("button");
        this.confirmReset = false;
      }
      return;
    }

    if (this.showSettings) {
      if (this.hit(this.toggleRect, x, y)) {
        safety.setReducedMotion(!safety.isReducedMotion());
        audioSynth.playUi("button");
      } else if (this.hit(this.soundRect, x, y)) {
        // 先切换再播放：开启时能立刻听到「开」的确认音
        safety.setSoundEnabled(!safety.isSoundEnabled());
        audioSynth.playUi("button");
      } else if (this.fontRects.some((r, i) => {
        if (!this.hit(r, x, y)) return false;
        safety.setFontLevel(i);
        audioSynth.playUi("button");
        return true;
      })) {
        // 字号档位已在回调内切换
      } else if (this.hit(this.resetRect, x, y)) {
        audioSynth.playUi("button");
        this.confirmReset = true;
      } else if (this.hit(this.closeRect, x, y)) {
        audioSynth.playUi("button");
        this.showSettings = false;
      }
      return;
    }

    // 底部导航 / 右上主页按钮（首页不画主页按钮，由全局浮层绘制）
    const nav = sceneChrome.hitTest(x, y);
    if (nav && nav !== "home") {
      audioSynth.playUi("button");
      sceneChrome.dispatch(nav);
      return;
    }

    if (this.hit(this.settingsRect, x, y)) {
      audioSynth.playUi("button");
      this.showSettings = true;
      return;
    }
    if (this.hit(this.continueRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onContinue();
      return;
    }
    if (this.hit(this.levelRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onOpenLevels();
      return;
    }
    if (this.hit(this.brainRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onOpenBrainCenter();
      return;
    }

    // 分类 Tab（点 Tab 时列表回到顶部）
    for (const t of this.tabRects) {
      if (this.hit(t.rect, x, y)) {
        audioSynth.playUi("button");
        this.category = t.id;
        this.scroll.reset();
        return;
      }
    }

    for (const q of this.quickRects) {
      if (this.hit(q.rect, x, y)) {
        audioSynth.playUi("button");
        if (q.key === "signin") this.cb.onOpenSignin();
        else if (q.key === "wheel") this.cb.onOpenWheel();
        else if (q.key === "achv") this.cb.onOpenAchievements();
        else if (q.key === "skins") this.cb.onOpenSkins();
        else if (q.key === "review") this.cb.onOpenReview();
        else this.cb.onInvite();
        return;
      }
    }

    for (const m of this.modeRects) {
      if (this.hit(m.rect, x, y)) {
        audioSynth.playUi("button");
        this.cb.onPickMode(m.mode);
        return;
      }
    }
    if (this.hit(this.syRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onOpenShuangyang();
      return;
    }
  }

  // === 渲染 ===

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    // 弹窗（设置 / 重置 / 退出确认 / 成就）期间隐藏底部导航，避免浮层被误触
    sceneChrome.configure({
      enabled: !this.showSettings && !this.confirmReset && !this.confirmExit && this.celebration === null,
      active: "home",
      showHome: false,
    });
    const ease = Easing.outCubic(this.enterP);
    const compact = h < 720;

    // 背景
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.5, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    // 装饰光斑
    gameCanvas.drawCircle(w * 0.14, h * 0.18, 46, "rgba(255,107,157,0.13)", 1);
    gameCanvas.drawCircle(w * 0.86, h * 0.13, 34, "rgba(78,205,196,0.13)", 1);
    gameCanvas.drawCircle(w * 0.82, h * 0.88, 56, "rgba(255,230,109,0.09)", 1);

    const pad = 16;
    const contentW = Math.min(w - pad * 2, 420);
    const bx = (w - contentW) / 2;

    // === 标题（入场轻微上浮） ===
    const titleY = 52 - (1 - ease) * 12;
    gameCanvas.drawText("岁月神偷", w / 2, titleY,
      { size: compact ? 30 : 34, color: "#FFE66D", bold: true }, 5);
    gameCanvas.drawText("脑力花园", w / 2, titleY + (compact ? 32 : 38),
      { size: compact ? 19 : 22, color: "#4ECDC4", bold: true }, 5);

    // 星数进度
    const total = progress.getTotalStars();
    const maxStars = progress.getMaxStars();
    const done = progress.getCompletedCount();
    gameCanvas.drawText(`★ ${total} / ${maxStars}   ·   已通关 ${done} / ${ALL_LEVELS.length}`,
      w / 2, titleY + (compact ? 56 : 64), { size: 13, color: "#9aa3c8" }, 5);

    let y = titleY + (compact ? 76 : 88);

    // 剧情文案（小屏隐藏，给列表让位）
    if (!compact) {
      gameCanvas.drawRoundRect(bx, y, contentW, 46, 10, "rgba(255,255,255,0.06)", 5);
      const storyLines = wrapText(STORY_INTRO, 17, 2);
      const storyTop = y + 23 - ((storyLines.length - 1) * 19) / 2;
      storyLines.forEach((line, i) => {
        gameCanvas.drawText(line, w / 2, storyTop + i * 19, { size: 12, color: "#b9c0dc" }, 6);
      });
      y += 58;
    }

    // === 1) 继续训练（首屏唯一主角） ===
    const primaryH = compact ? 64 : 72;
    this.continueRect = { x: bx, y, w: contentW, h: primaryH };
    gameCanvas.draw((ctx) => {
      ctx.globalAlpha = ease;
      const grad = ctx.createLinearGradient(bx, y, bx, y + primaryH);
      grad.addColorStop(0, "#4ECDC4");
      grad.addColorStop(1, "#2fa89f");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, y, contentW, primaryH, 16);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.roundRect(bx + 5, y + 5, contentW - 10, 24, 12);
      ctx.fill();
      ctx.globalAlpha = 1;
    }, 5);
    gameCanvas.drawText("继续训练", w / 2, y + primaryH / 2,
      { size: 26, color: "#0c1a22", bold: true }, 6);
    y += primaryH + 12;

    // === 2) 选择关卡 / 认知中心（并排两格） ===
    const dualH = compact ? 58 : 66;
    const dualGap = 12;
    const dualW = (contentW - dualGap) / 2;
    this.levelRect = { x: bx, y, w: dualW, h: dualH };
    this.brainRect = { x: bx + dualW + dualGap, y, w: dualW, h: dualH };
    gameCanvas.drawRoundRect(bx, y, dualW, dualH, 14, "rgba(255,255,255,0.08)", 5);
    gameCanvas.drawStrokeRect(bx, y, dualW, dualH, 14, "rgba(255,255,255,0.22)", 1.5, 6);
    gameCanvas.drawText("🗺️ 选择关卡", bx + dualW / 2, y + dualH / 2,
      { size: 18, color: "#e6ebff", bold: true }, 7);
    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(bx + dualW + dualGap, y, bx + dualW + dualGap, y + dualH);
      g.addColorStop(0, "rgba(139,124,248,0.22)");
      g.addColorStop(1, "rgba(90,75,207,0.18)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(bx + dualW + dualGap, y, dualW, dualH, 14);
      ctx.fill();
    }, 5);
    gameCanvas.drawStrokeRect(bx + dualW + dualGap, y, dualW, dualH, 14, "rgba(139,124,248,0.55)", 1.5, 6);
    gameCanvas.drawText("🧠 认知中心", bx + dualW + dualGap + dualW / 2, y + dualH / 2,
      { size: 18, color: "#cfc6ff", bold: true }, 7);
    y += dualH + 14;

    // === 3) 分类 Tab ===
    const tabH = 52;
    this.tabRects = [];
    const tabGap = 8;
    const tabW = (contentW - tabGap * (CATEGORIES.length - 1)) / CATEGORIES.length;
    CATEGORIES.forEach((c, i) => {
      const tx = bx + i * (tabW + tabGap);
      const rect: Rect = { x: tx, y, w: tabW, h: tabH };
      this.tabRects.push({ id: c.id, rect });
      const active = c.id === this.category;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = active ? "#4ECDC4" : "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.roundRect(tx, y, tabW, tabH, 13);
        ctx.fill();
        if (!active) {
          ctx.strokeStyle = "rgba(255,255,255,0.18)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }, 5);
      gameCanvas.drawText(`${c.icon}${c.label}`, tx + tabW / 2, y + tabH / 2,
        { size: 15, color: active ? "#0c1a22" : "#c3cadf", bold: active }, 6);
    });
    y += tabH + 10;

    // === 4) 可滚动内容区：常用功能 + 分类玩法卡 ===
    const listTop = y;
    const listBottom = h - NAV_H - 6;
    const listH = Math.max(96, listBottom - listTop);
    this.listRect = { x: 0, y: listTop, w, h: listH };

    const quickGap = 10;
    const quickH = 58;
    const quickW = (contentW - quickGap * 2) / 3;
    const quickTop = 26; // 相对内容区顶部：上方留「常用功能」小标题
    const catTop = quickTop + quickH * 2 + quickGap + 30;
    const cardH = 84;
    const cardGap = 12;
    const modes = CATEGORIES.find((c) => c.id === this.category)?.modes ?? [];
    const extraSyCard = this.category === "shuangyang" ? 1 : 0;
    const contentH = catTop + modes.length * (cardH + cardGap) + extraSyCard * (cardH + cardGap) + 16;

    this.scroll.begin(listH, contentH);
    const off = this.scroll.offsetY;

    gameCanvas.setClip({ x: 0, y: listTop, w, h: listH });

    // --- 常用功能（2×3 宫格） ---
    gameCanvas.drawText("常用功能", bx, listTop + 14 - off,
      { size: 13, color: "#8b93b8", align: "left" }, 6);
    this.quickRects = [];
    const quickDefs: { key: "signin" | "wheel" | "achv" | "skins" | "review" | "invite"; icon: string; label: string; sub: string }[] = [
      { key: "signin", icon: "📅", label: "签到", sub: "每日打卡" },
      { key: "wheel", icon: "🎡", label: "转盘", sub: "抽个奖" },
      { key: "achv", icon: "🏆", label: "成就", sub: "我的徽章" },
      { key: "skins", icon: "🎨", label: "换装", sub: `积分 ${progress.getPoints()}` },
      { key: "review", icon: "📖", label: "复习", sub: reviews.getDueCount() > 0 ? `到期 ${reviews.getDueCount()} 项` : "暂无到期" },
      { key: "invite", icon: "👥", label: "邀请", sub: "叫老友来玩" },
    ];
    quickDefs.forEach((q, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const qx = bx + col * (quickW + quickGap);
      const qy = listTop + quickTop + row * (quickH + quickGap) - off;
      this.quickRects.push({ rect: { x: qx, y: qy, w: quickW, h: quickH }, key: q.key });
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = q.key === "review" && reviews.getDueCount() > 0
          ? "rgba(139,124,248,0.24)" : "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.roundRect(qx, qy, quickW, quickH, 12);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }, 5);
      gameCanvas.drawText(q.icon, qx + 20, qy + quickH / 2, { size: 22 }, 6);
      gameCanvas.drawText(q.label, qx + 40, qy + quickH / 2 - 9,
        { size: 16, color: "#e6ebff", bold: true, align: "left" }, 6);
      gameCanvas.drawText(q.sub, qx + 40, qy + quickH / 2 + 12,
        { size: 11, color: "#8b93b8", align: "left" }, 6);
    });
    // E2E/调试钩子：暴露「邀请」宫格实时矩形（CSS px，随布局与滚动偏移更新）
    (window as any).__xxlInviteRect = () =>
      this.quickRects.find((q) => q.key === "invite")?.rect ?? null;

    // --- 分类玩法卡 ---
    this.modeRects = [];
    this.syRect = { x: 0, y: 0, w: 0, h: 0 };
    gameCanvas.drawText(
      this.category === "shuangyang" ? "双阳特色玩法" : `${CATEGORIES.find((c) => c.id === this.category)?.label ?? ""}力训练`,
      bx, listTop + catTop - 16 - off,
      { size: 13, color: "#8b93b8", align: "left" }, 6);

    modes.forEach((mId, i) => {
      const m = MODE_INFO[mId];
      const cy = listTop + catTop + i * (cardH + cardGap) - off;
      const rect: Rect = { x: bx, y: cy, w: contentW, h: cardH };
      this.modeRects.push({ rect, mode: mId });
      const stars = progress.getModeStars(mId);
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(255,255,255,0.055)";
        ctx.beginPath();
        ctx.roundRect(bx, cy, contentW, cardH, 14);
        ctx.fill();
        ctx.strokeStyle = m.color + "aa";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.roundRect(bx + 10, cy + 14, 5, cardH - 28, 2);
        ctx.fill();
      }, 5);
      gameCanvas.drawText(`${m.icon}  ${m.label}`, bx + 28, cy + 30,
        { size: 20, color: "#fff", bold: true, align: "left" }, 6);
      gameCanvas.drawText(m.desc, bx + 28, cy + 58,
        { size: 13, color: "#9aa3c8", align: "left" }, 6);
      gameCanvas.drawText(`★ ${stars.got}/${stars.max}`, bx + contentW - 16, cy + cardH / 2,
        { size: 15, color: "#FFE66D", align: "right" }, 6);
    });

    // 双阳专区入口（额外的特色卡片）
    if (extraSyCard === 1) {
      const idx = modes.length;
      const cy = listTop + catTop + idx * (cardH + cardGap) - off;
      this.syRect = { x: bx, y: cy, w: contentW, h: cardH };
      const syComplete = progress.isShuangyangComplete();
      gameCanvas.draw((ctx) => {
        const g = ctx.createLinearGradient(bx, cy, bx, cy + cardH);
        g.addColorStop(0, "#caa23a");
        g.addColorStop(1, "#8a6a1e");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(bx, cy, contentW, cardH, 14);
        ctx.fill();
      }, 5);
      gameCanvas.drawText("🦌  双阳专区 · 鹿乡草莓", bx + 28, cy + 30,
        { size: 19, color: "#241a06", bold: true, align: "left" }, 6);
      gameCanvas.drawText(syComplete ? "已集齐双阳纪念徽章" : "长春双阳 · 诗词湖光 · 一路通关",
        bx + 28, cy + 58, { size: 13, color: "#3a2c08", align: "left" }, 6);
      gameCanvas.drawText("进入 ›", bx + contentW - 16, cy + cardH / 2,
        { size: 16, color: "#241a06", bold: true, align: "right" }, 6);
    }

    gameCanvas.setClip(null);

    // 滚动条 + 「下面还有」提示
    this.scroll.drawScrollbar(w - 6, listTop, listH);
    if (this.scroll.canScroll && !this.scroll.atBottom) {
      const hy = listBottom - 16;
      gameCanvas.drawRoundRect(w / 2 - 58, hy - 13, 116, 26, 13, "rgba(10,12,26,0.72)", 92);
      gameCanvas.drawText("↓ 下面还有", w / 2, hy, { size: 12, color: "#9be8df" }, 93);
    }

    // === 顶栏：只留设置齿轮 ===
    this.settingsRect = { x: w - 66, y: 12, w: 54, h: 54 };
    gameCanvas.drawRoundRect(this.settingsRect.x, this.settingsRect.y, 54, 54, 13,
      "rgba(255,255,255,0.10)", 5);
    gameCanvas.drawText("⚙", this.settingsRect.x + 27, this.settingsRect.y + 28,
      { size: 26, color: "#b9c0dc" }, 6);

    // 每日礼提示（贴在导航条上方）
    if (this.dailyGiftText) {
      gameCanvas.drawRoundRect(bx, h - NAV_H - 34, contentW, 28, 14, "rgba(78,205,196,0.16)", 88);
      gameCanvas.drawStrokeRect(bx, h - NAV_H - 34, contentW, 28, 14, "rgba(78,205,196,0.5)", 1.5, 89);
      gameCanvas.drawText(this.dailyGiftText, w / 2, h - NAV_H - 20,
        { size: 12, color: "#9be8df", bold: true }, 90);
    }

    // 底部导航由 GameCanvas 全局浮层绘制（Main 路由已 configure 首页高亮）

    // 今日剩余时长
    gameCanvas.drawText(
      `${NPC_NAME}在这里等你 · 今日剩余 ${Math.max(0, Math.round(GAME_CONFIG.maxDailyMinutes - safety.getDailyMinutesUsed()))} 分钟`,
      w / 2, listTop + listH + 0,
      { size: 11, color: "#666e91" }, 4,
    );

    if (this.showSettings) this.renderSettings(w, h);
    if (this.confirmReset) this.renderConfirm(w, h);
    if (this.confirmExit) this.renderExitConfirm(w, h);
    if (this.celebration !== null) this.renderCelebration(w, h);
  }

  /** 退出网页确认（首页按返回键） */
  private renderExitConfirm(w: number, h: number): void {
    gameCanvas.drawRoundRect(0, 0, w, h, 0, "rgba(0,0,0,0.82)", 300);
    const pw = Math.min(w - 48, 340);
    const ph = 230;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    gameCanvas.drawRoundRect(px, py, pw, ph, 18, "#241f2e", 301);
    gameCanvas.drawStrokeRect(px, py, pw, ph, 18, "rgba(78,205,196,0.6)", 2, 302);

    gameCanvas.drawText("要离开花园吗？", w / 2, py + 44, { size: 24, color: "#fff", bold: true }, 303);
    gameCanvas.drawText("今天的训练还没结束呢", w / 2, py + 82, { size: 15, color: "#c3cadf" }, 303);
    gameCanvas.drawText("离开后进度会保留，下次接着玩", w / 2, py + 106, { size: 13, color: "#8b93b8" }, 303);

    const bw = (pw - 60) / 2;
    const bh = 56;
    const by = py + ph - bh - 26;
    this.exitStayRect = { x: px + 20, y: by, w: bw, h: bh };
    this.exitLeaveRect = { x: px + 40 + bw, y: by, w: bw, h: bh };

    gameCanvas.drawRoundRect(this.exitStayRect.x, by, bw, bh, 14, "#27ae60", 303);
    gameCanvas.drawText("继续玩", this.exitStayRect.x + bw / 2, by + bh / 2,
      { size: 20, color: "#fff", bold: true }, 304);

    gameCanvas.drawRoundRect(this.exitLeaveRect.x, by, bw, bh, 14, "rgba(255,255,255,0.14)", 303);
    gameCanvas.drawText("离开", this.exitLeaveRect.x + bw / 2, by + bh / 2,
      { size: 20, color: "#e6ebff", bold: true }, 304);
  }

  private renderCelebration(w: number, h: number): void {
    const c = this.celebration!;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(0,0,0,0.78)";
      ctx.fillRect(0, 0, w, h);
    }, 200);
    const pw = Math.min(w - 56, 360);
    const ph = 300;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(px, py, px, py + ph);
      grad.addColorStop(0, "#caa23a");
      grad.addColorStop(1, "#8a6a1e");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 18);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.roundRect(px + 6, py + 6, pw - 12, 26, 12);
      ctx.fill();
    }, 201);

    gameCanvas.drawText(c.icon, w / 2, py + 72, { size: 60 }, 202);
    gameCanvas.drawText("成就达成！", w / 2, py + 128, { size: 22, color: "#241a06", bold: true }, 202);
    gameCanvas.drawText(c.name, w / 2, py + 158, { size: 18, color: "#3a2c08", bold: true }, 202);
    gameCanvas.drawText(c.desc, w / 2, py + 186, { size: 13, color: "#3a2c08" }, 202);
    gameCanvas.drawText(`🎉 获得成就奖励 积分 +${c.rewardPoints}`, w / 2, py + 214,
      { size: 16, color: "#241a06", bold: true }, 202);

    const bw = pw - 60;
    const bh = 52;
    const bx = px + 30;
    const by = py + ph - bh - 24;
    this.celebrationRect = { x: bx, y: by, w: bw, h: bh };
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "#241a06";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 14);
      ctx.fill();
    }, 202);
    gameCanvas.drawText("收下 🏅", w / 2, by + 28, { size: 20, color: "#FFE66D", bold: true }, 203);
  }

  private renderSettings(w: number, h: number): void {
    gameCanvas.drawRoundRect(0, 0, w, h, 0, "rgba(0,0,0,0.72)", 100);

    const panelW = Math.min(w - 40, 360);
    const panelH = 430;
    const px = (w - panelW) / 2;
    const py = Math.max(8, (h - panelH) / 2);

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(px, py, px, py + panelH);
      grad.addColorStop(0, "#232748");
      grad.addColorStop(1, "#151830");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(px, py, panelW, panelH, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,140,210,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, 101);

    gameCanvas.drawText("设置", w / 2, py + 34, { size: 24, color: "#fff", bold: true }, 102);

    // 降低动效
    const reduced = safety.isReducedMotion();
    gameCanvas.drawText("降低动效", px + 26, py + 82, { size: 17, color: "#cdd5f0", align: "left" }, 102);
    gameCanvas.drawText("关闭闪烁与屏震，更舒缓", px + 26, py + 104,
      { size: 12, color: "#7c84a8", align: "left" }, 102);

    this.toggleRect = { x: px + panelW - 92, y: py + 72, w: 66, h: 38 };
    gameCanvas.drawRoundRect(this.toggleRect.x, this.toggleRect.y, 66, 38, 19,
      reduced ? "#27ae60" : "rgba(255,255,255,0.18)", 102);
    gameCanvas.drawCircle(this.toggleRect.x + (reduced ? 47 : 19), this.toggleRect.y + 19, 15, "#ffffff", 103);

    // 音效
    const soundOn = safety.isSoundEnabled();
    gameCanvas.drawText("音效", px + 26, py + 136, { size: 17, color: "#cdd5f0", align: "left" }, 102);
    gameCanvas.drawText("关闭后完全静音", px + 26, py + 158,
      { size: 12, color: "#7c84a8", align: "left" }, 102);

    this.soundRect = { x: px + panelW - 92, y: py + 126, w: 66, h: 38 };
    gameCanvas.drawRoundRect(this.soundRect.x, this.soundRect.y, 66, 38, 19,
      soundOn ? "#27ae60" : "rgba(255,255,255,0.18)", 102);
    gameCanvas.drawCircle(this.soundRect.x + (soundOn ? 47 : 19), this.soundRect.y + 19, 15, "#ffffff", 103);

    // 字号（适老化核心：三档，点击即生效）
    gameCanvas.drawText("字号大小", px + 26, py + 198, { size: 17, color: "#cdd5f0", align: "left" }, 102);
    gameCanvas.drawText("字太小看不清？选「超大」", px + 26, py + 220,
      { size: 12, color: "#7c84a8", align: "left" }, 102);

    this.fontRects = [];
    const level = safety.getFontLevel();
    const fw = (panelW - 52 - 16) / 3;
    SafetyManager.FONT_LABELS.forEach((label, i) => {
      const fx = px + 26 + i * (fw + 8);
      const fy = py + 236;
      const fh = 46;
      this.fontRects.push({ x: fx, y: fy, w: fw, h: fh });
      const active = i === level;
      gameCanvas.drawRoundRect(fx, fy, fw, fh, 12,
        active ? "#4ECDC4" : "rgba(255,255,255,0.10)", 102);
      if (!active) {
        gameCanvas.drawStrokeRect(fx, fy, fw, fh, 12, "rgba(255,255,255,0.22)", 1.5, 103);
      }
      // 三档按钮内的示例字号随档位放大，所见即所得
      gameCanvas.drawText(label, fx + fw / 2, fy + fh / 2,
        { size: 15 + i * 3, color: active ? "#0c1a22" : "#cdd5f0", bold: active }, 104);
    });

    // 重置进度
    this.resetRect = { x: px + 26, y: py + 300, w: panelW - 52, h: 52 };
    gameCanvas.drawRoundRect(this.resetRect.x, this.resetRect.y, this.resetRect.w, this.resetRect.h, 12,
      "rgba(231,76,60,0.22)", 102);
    gameCanvas.drawStrokeRect(this.resetRect.x, this.resetRect.y, this.resetRect.w, this.resetRect.h, 12,
      "rgba(231,76,60,0.6)", 1.5, 103);
    gameCanvas.drawText("重置全部进度", w / 2, py + 326, { size: 17, color: "#ff9b90" }, 104);

    // 关闭
    this.closeRect = { x: px + 26, y: py + 364, w: panelW - 52, h: 54 };
    gameCanvas.drawRoundRect(this.closeRect.x, this.closeRect.y, this.closeRect.w, this.closeRect.h, 12,
      "#4ECDC4", 102);
    gameCanvas.drawText("关闭", w / 2, py + 391, { size: 20, color: "#0c1a22", bold: true }, 103);
  }

  private renderConfirm(w: number, h: number): void {
    gameCanvas.drawRoundRect(0, 0, w, h, 0, "rgba(0,0,0,0.8)", 110);
    const panelW = Math.min(w - 60, 320);
    const panelH = 190;
    const px = (w - panelW) / 2;
    const py = (h - panelH) / 2;

    gameCanvas.drawRoundRect(px, py, panelW, panelH, 16, "#241f2e", 111);
    gameCanvas.drawStrokeRect(px, py, panelW, panelH, 16, "rgba(231,76,60,0.55)", 1.5, 112);

    gameCanvas.drawText("确认重置？", w / 2, py + 40, { size: 22, color: "#fff", bold: true }, 112);
    gameCanvas.drawText("所有星数与最佳成绩将被清空", w / 2, py + 74,
      { size: 13, color: "#b9a0a0" }, 112);
    gameCanvas.drawText("此操作不可撤销", w / 2, py + 96, { size: 13, color: "#b9a0a0" }, 112);

    const bw = (panelW - 66) / 2;
    this.confirmYesRect = { x: px + 22, y: py + 122, w: bw, h: 48 };
    this.confirmNoRect = { x: px + 44 + bw, y: py + 122, w: bw, h: 48 };

    gameCanvas.drawRoundRect(this.confirmYesRect.x, this.confirmYesRect.y, bw, 48, 12, "#e74c3c", 112);
    gameCanvas.drawText("确认重置", this.confirmYesRect.x + bw / 2, py + 146,
      { size: 16, color: "#fff", bold: true }, 113);

    gameCanvas.drawRoundRect(this.confirmNoRect.x, this.confirmNoRect.y, bw, 48, 12,
      "rgba(255,255,255,0.14)", 112);
    gameCanvas.drawText("再想想", this.confirmNoRect.x + bw / 2, py + 146,
      { size: 16, color: "#e6ebff", bold: true }, 113);
  }

  destroy(): void {
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("mouseup", this.onPointerUp);
    gameCanvas.setScrollHandler(null);
    gameCanvas.setClip(null);
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
