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
import { speech } from "../core/speech";
import { pickGreeting } from "../core/CareWords";
import { companionBubble } from "../ui/CompanionBubble";
import { exitGuard } from "../core/ExitGuard";
import { progress } from "../core/ProgressStore";
import { achievements, type Celebration } from "../core/AchievementStore";
import { addHammerInv } from "../core/BoosterStore";
import { Easing } from "../core/Tween";
import { GAME_CONFIG } from "../core/GameConfig";
import { NPC_NAME } from "../config/GameText";
import { type ModeId, type ItemConfig } from "../config/LevelConfig";
import { reviews } from "../core/ReviewStore";
import { suggestToday, dueReviewModes } from "../core/PlanEngine";
import { wrapText } from "../ui/ResultCard";
import { POINTS_RULES } from "../config/PointsConfig";
import { resolveHomeStyle } from "../config/homeStyles";

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
  private tabRects: { id: CategoryId; rect: Rect }[] = [];
  private modeRects: { rect: Rect; mode: ModeId }[] = [];
  private quickRects: { rect: Rect; key: "signin" | "wheel" | "achv" | "skins" | "review" | "invite" }[] = [];
  private settingsRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private toggleRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private soundRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private voiceRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hcRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private companionRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private fontRects: Rect[] = [];
  private rateRects: Rect[] = [];
  private resetRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private confirmYesRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private confirmNoRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private exitStayRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private exitLeaveRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private dailyGiftText = "";
  private planRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** 每日问候：进首页打一次招呼后自行退下，不长期占用列表空间 */
  private greeted = false;
  private greetUntil = 0;
  private planMode: ModeId = "match3";

  /** 成就庆祝（非 null 时拦截其它按钮；可连续弹出多个） */
  private celebration: Celebration | null = null;
  private celebrationRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private category: CategoryId = "memory";
  private scroll = new ScrollView();
  /** 设置面板内容区滚动（仅矮视口真正需要滚动） */
  private settingsScroll = new ScrollView();
  /** 设置面板可滚动内容区（用于点击延迟判定：滑动=滚动，不误触开关） */
  private settingsViewRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
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
      // 设置面板打开时滚动的是设置内容，否则滚动玩法列表
      if (this.showSettings) this.settingsScroll.scrollBy(dy);
      else this.scroll.scrollBy(dy);
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
    // 设置面板内容区：同样延迟到抬起判定，滑动=滚动，不会误触开关
    if (this.showSettings && !this.confirmReset && this.hit(this.settingsViewRect, x, y)) {
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
      } else if (this.hit(this.voiceRect, x, y)) {
        const next = !safety.isSpeechEnabled();
        safety.setSpeechEnabled(next);
        audioSynth.playUi("button");
        // 开启语音时朗读一句确认，让长辈立刻知道「听得见」
        if (next && safety.isSoundEnabled()) speech.speak("语音播报已开启", { rate: safety.getSpeechRate() });
      } else if (this.rateRects.some((r, i) => {
        if (!this.hit(r, x, y)) return false;
        safety.setSpeechRateLevel(i);
        audioSynth.playUi("button");
        if (safety.isSoundEnabled() && safety.isSpeechEnabled()) {
          speech.speak(`语速${SafetyManager.SPEECH_RATE_LABELS[i]}`, { rate: safety.getSpeechRate() });
        }
        return true;
      })) {
        // 语速档位已在回调内切换
      } else if (this.hit(this.hcRect, x, y)) {
        safety.setHighContrast(!safety.isHighContrast());
        audioSynth.playUi("button");
      } else if (this.hit(this.companionRect, x, y)) {
        safety.setCompanionEnabled(!safety.isCompanionEnabled());
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
      this.settingsScroll.reset(); // 每次打开都从顶部开始，避免停在上次位置看不到前面的开关
      this.showSettings = true;
      return;
    }
    if (this.hit(this.continueRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onContinue();
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

    if (this.hit(this.planRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onPickMode(this.planMode);
      return;
    }

    for (const m of this.modeRects) {
      if (this.hit(m.rect, x, y)) {
        audioSynth.playUi("button");
        this.cb.onPickMode(m.mode);
        return;
      }
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
    const st = resolveHomeStyle(progress.getHomeStyle());

    // 背景：品牌竖向上→中→下渐变（bgTop/bgMid/bgBottom）
    gameCanvas.draw((ctx) => {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, st.bgTop);
      bg.addColorStop(0.55, st.bgMid);
      bg.addColorStop(1, st.bgBottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    const pad = 16;
    const contentW = Math.min(w - pad * 2, 420);
    const bx = (w - contentW) / 2;

    // === 标题（居中，入场轻微上浮） ===
    const titleY = 56 - (1 - ease) * 10;
    gameCanvas.drawText("脑力花园", w / 2, titleY,
      { size: compact ? 30 : 34, color: st.title, bold: true, align: "center" }, 5);
    gameCanvas.drawText("岁月神偷", w / 2, titleY + (compact ? 30 : 36),
      { size: 14, color: st.titleSub, align: "center" }, 5);

    // === 顶部 HUD：星星 + 积分（真实数据） ===
    const total = progress.getTotalStars();
    const pts = progress.getPoints();
    const chipY = titleY + (compact ? 56 : 64);
    const chipH = 54;
    const chipGap = 12;
    const chipW = (contentW - chipGap) / 2;
    const chipX2 = bx + chipW + chipGap;
    const drawChip = (x: number, label: string, value: string) => {
      gameCanvas.drawRoundRect(x, chipY, chipW, chipH, 16, st.chipBg, 5);
      gameCanvas.drawText(label, x + chipW / 2, chipY + 15, { size: 13, color: st.muted, align: "center" }, 6);
      gameCanvas.drawText(value, x + chipW / 2, chipY + 41, { size: 22, color: st.chipText, bold: true, align: "center" }, 6);
    };
    drawChip(bx, "🌟 星星", `${total}`);
    drawChip(chipX2, "💎 积分", `${pts}`);

    let y = chipY + chipH + 18;

    // （剧情文案已移除，改由顶部 HUD 概览）

    // === 1) 继续训练（首屏唯一主角） ===
    const primaryH = compact ? 64 : 72;
    // 快照 y：draw() 回调延迟到帧末执行，若闭包引用可变 y 会用到被后续 += 改写的值
    const btnY = y;
    this.continueRect = { x: bx, y: btnY, w: contentW, h: primaryH };
    gameCanvas.draw((ctx) => {
      ctx.globalAlpha = ease;
      const grad = ctx.createLinearGradient(bx, btnY, bx, btnY + primaryH);
      grad.addColorStop(0, st.btnTop);
      grad.addColorStop(1, st.btnBottom);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, btnY, contentW, primaryH, 16);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.roundRect(bx + 5, btnY + 5, contentW - 10, 24, 12);
      ctx.fill();
      ctx.globalAlpha = 1;
    }, 5);
    gameCanvas.drawText("继续训练", w / 2, btnY + primaryH / 2,
      { size: 26, color: st.btnText, bold: true }, 6);
    y += primaryH + 12;

    // （选择关卡 / 认知中心 已并入底部导航，首页不再重复）

    // === 3) 分类 Tab ===
    const tabH = 52;
    this.tabRects = [];
    const tabGap = 8;
    const tabW = (contentW - tabGap * (CATEGORIES.length - 1)) / CATEGORIES.length;
    // 快照 y：同按钮，draw() 延迟执行必须锁定当时的 y
    const tabY = y;
    CATEGORIES.forEach((c, i) => {
      const tx = bx + i * (tabW + tabGap);
      const rect: Rect = { x: tx, y: tabY, w: tabW, h: tabH };
      this.tabRects.push({ id: c.id, rect });
      const active = c.id === this.category;
      gameCanvas.draw((ctx) => {
        ctx.beginPath();
        ctx.roundRect(tx, tabY, tabW, tabH, 13);
        ctx.strokeStyle = st.chipStroke;
        ctx.lineWidth = active ? 2 : 1.5;
        ctx.stroke();
      }, 5);
      gameCanvas.drawText(`${c.icon}${c.label}`, tx + tabW / 2, tabY + tabH / 2,
        { size: 16, color: active ? st.accent : st.muted, bold: active }, 6);
    });
    y += tabH + 10;

    // === 4) 可滚动内容区：分类玩法（两列网格） + 常用功能（3×2） ===
    const navTop = h - NAV_H;
    const listTop = y;
    const listBottom = navTop - 96;
    const listH = Math.max(120, listBottom - listTop);
    this.listRect = { x: 0, y: listTop, w, h: listH };



    const modes = CATEGORIES.find((c) => c.id === this.category)?.modes ?? [];
    const modeCols = 2;
    const modeGap = 12;      // 列间距
    const modeRowGap = 20;   // 行间距（每行玩法卡之间留更宽）
    const modeW = (contentW - modeGap) / modeCols;
    const modeH = 92;
    const modeRows = Math.ceil(modes.length / modeCols);
    // 今日建议文案与折行（上提至此，用于动态决定卡片高度，长文案折两行不溢出/不重叠）
    const plan = suggestToday();
    this.planMode = plan.mode;
    const due = dueReviewModes();
    const dueLabels = due.map((m) => MODE_INFO[m].label).join(" · ");
    const planMaxChars = Math.max(10, Math.floor((contentW - 32) / 12.5));
    const reasonLines = wrapText(plan.reason, planMaxChars, 2);
    const dueLines = due.length > 0 ? wrapText(`该复习：${dueLabels}`, planMaxChars, 2) : [];

    const planCardTop = 6;
    const planH = 96 + (reasonLines.length > 1 ? 22 : 0) + (dueLines.length > 0 ? 26 : 0);
    const gridStart = planCardTop + planH + 16;
    const gridBlockH = modeRows * (modeH + modeRowGap);
    const toolsLabelY = gridStart + gridBlockH + 16;
    const toolsTop = toolsLabelY + 32;
    const quickGap = 10;     // 列间距
    const quickRowGap = 16;  // 行间距（常用功能每行之间留更宽）
    const quickH = 58;
    const quickW = (contentW - quickGap * 2) / 3;
    const toolsH = 2 * (quickH + quickRowGap);
    const contentH = toolsTop + toolsH + 16;

    this.scroll.begin(listH, contentH);
    const off = this.scroll.offsetY;

    gameCanvas.setClip({ x: 0, y: listTop, w, h: listH });

    // --- 今日建议卡（个性化训练计划：描边 + 左侧强调条，区别于普通卡片） ---
    const pcx = bx;
    const pcy = listTop + planCardTop - off;
    const pcw = contentW;
    this.planRect = { x: pcx, y: pcy, w: pcw, h: planH };
    gameCanvas.draw((ctx) => {
      ctx.strokeStyle = st.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(pcx, pcy, pcw, planH, 16);
      ctx.stroke();
      ctx.fillStyle = st.accent;
      ctx.beginPath();
      ctx.roundRect(pcx + 8, pcy + 14, 5, planH - 28, 2.5);
      ctx.fill();
    }, 5);
    gameCanvas.drawText("💡 今日建议", pcx + 18, pcy + 24, { size: 16, color: st.accent, bold: true, align: "left" }, 6);
    gameCanvas.drawText(`练【${MODE_INFO[plan.mode].label}】${plan.minutes} 分钟`, pcx + 18, pcy + 52,
      { size: 19, color: st.chipText, bold: true, align: "left" }, 6);
    const dueBaseY = reasonLines.length > 1 ? pcy + 114 : pcy + 96;
    reasonLines.forEach((ln, i) =>
      gameCanvas.drawText(ln, pcx + 18, pcy + 74 + i * 16, { size: 13, color: st.muted, align: "left" }, 6));
    dueLines.forEach((ln, i) =>
      gameCanvas.drawText(ln, pcx + 18, dueBaseY + i * 17, { size: 13, color: st.accent, align: "left" }, 6));

    // --- 分类玩法卡（两列网格） ---
    this.modeRects = [];
    modes.forEach((mId, i) => {
      const m = MODE_INFO[mId];
      const col = i % modeCols;
      const row = Math.floor(i / modeCols);
      const mx = bx + col * (modeW + modeGap);
      const my = listTop + gridStart + row * (modeH + modeRowGap) - off;
      this.modeRects.push({ rect: { x: mx, y: my, w: modeW, h: modeH }, mode: mId });
      const stars = progress.getModeStars(mId);
      gameCanvas.draw((ctx) => {
        ctx.strokeStyle = m.color + "aa";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(mx, my, modeW, modeH, 14);
        ctx.stroke();
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.roundRect(mx + 8, my + 12, 4, modeH - 24, 2);
        ctx.fill();
      }, 5);
      gameCanvas.drawText(m.icon, mx + 32, my + 32, { size: 26 }, 6);
      gameCanvas.drawText(m.label, mx + 24, my + 58,
        { size: 19, color: st.chipText, bold: true, align: "left" }, 6);
      gameCanvas.drawText(m.desc, mx + 24, my + 80,
        { size: 14, color: st.muted, align: "left" }, 6);
      gameCanvas.drawText(`★ ${stars.got}/${stars.max}`, mx + modeW - 14, my + 32,
        { size: 15, color: st.starColor, align: "right" }, 6);
    });

    // --- 常用功能（3×2 宫格） ---
    gameCanvas.drawText("常用功能", bx, listTop + toolsLabelY + 16 - off,
      { size: 16, color: st.title, bold: true, align: "left" }, 6);
    const quickDefs: { key: "signin" | "wheel" | "achv" | "skins" | "review" | "invite"; icon: string; label: string; sub: string }[] = [
      { key: "signin", icon: "📅", label: "签到", sub: "每日打卡" },
      { key: "wheel", icon: "🎡", label: "转盘", sub: "抽个奖" },
      { key: "achv", icon: "🏆", label: "成就", sub: "我的徽章" },
      { key: "skins", icon: "🎨", label: "换装", sub: `积分 ${progress.getPoints()}` },
      { key: "review", icon: "📖", label: "复习", sub: reviews.getDueCount() > 0 ? `到期 ${reviews.getDueCount()} 项` : "暂无到期" },
      { key: "invite", icon: "👥", label: "邀请", sub: "叫老友来玩" },
    ];
    this.quickRects = [];
    quickDefs.forEach((q, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const qx = bx + col * (quickW + quickGap);
      const qy = listTop + toolsTop + row * (quickH + quickRowGap) - off;
      this.quickRects.push({ rect: { x: qx, y: qy, w: quickW, h: quickH }, key: q.key });
      gameCanvas.draw((ctx) => {
        const due = q.key === "review" && reviews.getDueCount() > 0;
        ctx.strokeStyle = due ? st.accent : st.chipStroke;
        ctx.lineWidth = due ? 2 : 1.4;
        ctx.beginPath();
        ctx.roundRect(qx, qy, quickW, quickH, 12);
        ctx.stroke();
      }, 5);
      gameCanvas.drawText(q.icon, qx + 18, qy + quickH / 2, { size: 24 }, 6);
      gameCanvas.drawText(q.label, qx + 40, qy + quickH / 2 - 10,
        { size: 17, color: st.chipText, bold: true, align: "left" }, 6);
      gameCanvas.drawText(q.sub, qx + 40, qy + quickH / 2 + 13,
        { size: 13, color: st.muted, align: "left" }, 6);
    });
    // E2E/调试钩子：暴露「邀请」宫格实时矩形（随布局与滚动偏移更新）
    (window as any).__xxlInviteRect = () =>
      this.quickRects.find((q) => q.key === "invite")?.rect ?? null;



    gameCanvas.setClip(null);

    // 滚动条 + 「下面还有」提示
    this.scroll.drawScrollbar(w - 6, listTop, listH);
    if (this.scroll.canScroll && !this.scroll.atBottom) {
      const hy = listBottom - 16;
      gameCanvas.drawRoundRect(w / 2 - 58, hy - 13, 116, 26, 13, "rgba(10,12,26,0.72)", 92);
      gameCanvas.drawText("↓ 下面还有", w / 2, hy, { size: 12, color: st.accent }, 93);
    }

    // === 顶栏：只留设置齿轮 ===
    this.settingsRect = { x: w - 66, y: 12, w: 54, h: 54 };
    gameCanvas.drawRoundRect(this.settingsRect.x, this.settingsRect.y, 54, 54, 13,
      st.chipBg, 5);
    gameCanvas.drawText("⚙", this.settingsRect.x + 27, this.settingsRect.y + 28,
      { size: 26, color: st.muted }, 6);

    // 每日礼提示（贴在导航条上方，与导航栏留 16px 间距）
    if (this.dailyGiftText) {
      gameCanvas.drawRoundRect(bx, h - NAV_H - 44, contentW, 28, 14, st.accentTop, 88);
      gameCanvas.drawStrokeRect(bx, h - NAV_H - 44, contentW, 28, 14, st.accentStroke, 1.5, 89);
      gameCanvas.drawText(this.dailyGiftText, w / 2, h - NAV_H - 30,
        { size: 12, color: st.accent, bold: true }, 90);
    }

    // 底部导航由 GameCanvas 全局浮层绘制（Main 路由已 configure 首页高亮）

    // 今日剩余时长（置于每日礼横幅上方，且层级高于横幅，避免被遮挡）
    gameCanvas.drawText(
      `${NPC_NAME}在这里等你 · 今日剩余 ${Math.max(0, Math.round(GAME_CONFIG.maxDailyMinutes - safety.getDailyMinutesUsed()))} 分钟`,
      w / 2, navTop - 78,
      { size: 12, color: st.muted, align: "center" }, 92,
    );

    // 每日问候：进首页时小园打一次招呼，几秒后自行退下（向上生长，不遮挡每日礼横幅与导航）
    const gnow = performance.now();
    if (!this.greeted) {
      this.greeted = true;
      this.greetUntil = gnow + 5000;
      companionBubble.show({
        text: pickGreeting(),
        mood: "smile",
        x: 12,
        y: 0,
        anchorBottom: h - NAV_H - 42,
        // 气泡会浮在玩法列表上：宽度收窄、停留缩短，尽量少挡内容；
        // 且刻意不开 interactive，让点按穿透到底下的卡片，避免误拦截
        maxWidth: Math.min(w - 24, 320),
        speak: true,
      });
    }
    if (gnow < this.greetUntil) {
      companionBubble.update(gnow);
      companionBubble.draw();
    } else if (companionBubble.isVisible) {
      companionBubble.hide();
    }

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

    const pal = safety.getPalette();
    const panelW = Math.min(w - 40, 360);
    // 自适应高度：永远不超过视口，保证底部「关闭」按钮可见可点；
    // 内容装不下时由 settingsScroll 滚动（放得下时滚动条不会出现，观感与固定高度一致）。
    const panelH = Math.min(610, h - 16);
    const px = (w - panelW) / 2;
    const pyTop = Math.max(8, (h - panelH) / 2);

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(px, pyTop, px, pyTop + panelH);
      if (safety.isHighContrast()) {
        grad.addColorStop(0, "#000000");
        grad.addColorStop(1, "#0a0a0a");
      } else {
        grad.addColorStop(0, "#232748");
        grad.addColorStop(1, "#151830");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(px, pyTop, panelW, panelH, 16);
      ctx.fill();
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, 101);

    gameCanvas.drawText("设置", w / 2, pyTop + 34, { size: 24, color: "#fff", bold: true }, 102);

    // === 可滚动内容区（标题以下）===
    const viewTop = pyTop + 52;
    const viewH = panelH - 60;
    const CONTENT_H = 550; // 内容自然高度：py+52 ~ py+602
    this.settingsScroll.begin(viewH, CONTENT_H);
    this.settingsViewRect = { x: px, y: viewTop, w: panelW, h: viewH };
    gameCanvas.setClip({ x: px, y: viewTop, w: panelW, h: viewH });
    // 关键：内容统一以 py 为基准（= 面板顶 - 滚动偏移），
    // 这样下面所有行坐标与命中矩形都自动带上偏移，无需逐处减 off。
    const py = pyTop - this.settingsScroll.offsetY;

    const onColor = safety.isHighContrast() ? pal.primary : "#27ae60";
    const offColor = "rgba(255,255,255,0.18)";
    const labelColor = safety.isHighContrast() ? pal.text : "#cdd5f0";
    const subColor = safety.isHighContrast() ? pal.sub : "#7c84a8";

    // 降低动效
    const reduced = safety.isReducedMotion();
    gameCanvas.drawText("降低动效", px + 26, py + 66, { size: 17, color: labelColor, align: "left" }, 102);
    gameCanvas.drawText("关闭闪烁与屏震，更舒缓", px + 26, py + 86,
      { size: 12, color: subColor, align: "left" }, 102);
    this.toggleRect = { x: px + panelW - 92, y: py + 56, w: 66, h: 38 };
    gameCanvas.drawRoundRect(this.toggleRect.x, this.toggleRect.y, 66, 38, 19, reduced ? onColor : offColor, 102);
    gameCanvas.drawCircle(this.toggleRect.x + (reduced ? 47 : 19), this.toggleRect.y + 19, 15, "#ffffff", 103);

    // 音效
    const soundOn = safety.isSoundEnabled();
    gameCanvas.drawText("音效", px + 26, py + 114, { size: 17, color: labelColor, align: "left" }, 102);
    gameCanvas.drawText("关闭后完全静音", px + 26, py + 134,
      { size: 12, color: subColor, align: "left" }, 102);
    this.soundRect = { x: px + panelW - 92, y: py + 104, w: 66, h: 38 };
    gameCanvas.drawRoundRect(this.soundRect.x, this.soundRect.y, 66, 38, 19, soundOn ? onColor : offColor, 102);
    gameCanvas.drawCircle(this.soundRect.x + (soundOn ? 47 : 19), this.soundRect.y + 19, 15, "#ffffff", 103);

    // 语音播报
    const voiceOn = safety.isSpeechEnabled();
    gameCanvas.drawText("语音播报", px + 26, py + 162, { size: 17, color: labelColor, align: "left" }, 102);
    gameCanvas.drawText("读出教程与结算说明", px + 26, py + 182,
      { size: 12, color: subColor, align: "left" }, 102);
    this.voiceRect = { x: px + panelW - 92, y: py + 152, w: 66, h: 38 };
    gameCanvas.drawRoundRect(this.voiceRect.x, this.voiceRect.y, 66, 38, 19, voiceOn ? onColor : offColor, 102);
    gameCanvas.drawCircle(this.voiceRect.x + (voiceOn ? 47 : 19), this.voiceRect.y + 19, 15, "#ffffff", 103);

    // 语速（慢/中/快）
    gameCanvas.drawText("语速", px + 26, py + 206, { size: 17, color: labelColor, align: "left" }, 102);
    gameCanvas.drawText("长辈可放慢到「慢」", px + 26, py + 226,
      { size: 12, color: subColor, align: "left" }, 102);
    this.rateRects = [];
    const rateLevel = safety.getSpeechRateLevel();
    const rw = (panelW - 52 - 16) / 3;
    SafetyManager.SPEECH_RATE_LABELS.forEach((label, i) => {
      const rx = px + 26 + i * (rw + 8);
      const ry = py + 242;
      const rh = 44;
      this.rateRects.push({ x: rx, y: ry, w: rw, h: rh });
      const active = i === rateLevel;
      gameCanvas.drawRoundRect(rx, ry, rw, rh, 12, active ? onColor : "rgba(255,255,255,0.10)", 102);
      if (!active) gameCanvas.drawStrokeRect(rx, ry, rw, rh, 12, "rgba(255,255,255,0.22)", 1.5, 103);
      gameCanvas.drawText(label, rx + rw / 2, ry + rh / 2,
        { size: 16, color: active ? "#0c1a22" : labelColor, bold: active }, 104);
    });

    // 高对比
    const hc = safety.isHighContrast();
    gameCanvas.drawText("高对比", px + 26, py + 304, { size: 17, color: labelColor, align: "left" }, 102);
    gameCanvas.drawText("深底亮字，更清晰", px + 26, py + 324,
      { size: 12, color: subColor, align: "left" }, 102);
    this.hcRect = { x: px + panelW - 92, y: py + 294, w: 66, h: 38 };
    gameCanvas.drawRoundRect(this.hcRect.x, this.hcRect.y, 66, 38, 19, hc ? onColor : offColor, 102);
    gameCanvas.drawCircle(this.hcRect.x + (hc ? 47 : 19), this.hcRect.y + 19, 15, "#ffffff", 103);

    // 陪伴小园（尊重长辈偏好：不喜欢可以随时关掉向导气泡）
    const cpOn = safety.isCompanionEnabled();
    gameCanvas.drawText("陪伴小园", px + 26, py + 352, { size: 17, color: labelColor, align: "left" }, 102);
    gameCanvas.drawText("关闭后不再出现向导气泡", px + 26, py + 372,
      { size: 12, color: subColor, align: "left" }, 102);
    this.companionRect = { x: px + panelW - 92, y: py + 342, w: 66, h: 38 };
    gameCanvas.drawRoundRect(this.companionRect.x, this.companionRect.y, 66, 38, 19, cpOn ? onColor : offColor, 102);
    gameCanvas.drawCircle(this.companionRect.x + (cpOn ? 47 : 19), this.companionRect.y + 19, 15, "#ffffff", 103);

    // 字号（适老化核心：三档，点击即生效）
    gameCanvas.drawText("字号大小", px + 26, py + 396, { size: 17, color: labelColor, align: "left" }, 102);
    gameCanvas.drawText("字太小看不清？选「超大」", px + 26, py + 416,
      { size: 12, color: subColor, align: "left" }, 102);
    this.fontRects = [];
    const flevel = safety.getFontLevel();
    const fw = (panelW - 52 - 16) / 3;
    SafetyManager.FONT_LABELS.forEach((label, i) => {
      const fx = px + 26 + i * (fw + 8);
      const fy = py + 430;
      const fh = 46;
      this.fontRects.push({ x: fx, y: fy, w: fw, h: fh });
      const active = i === flevel;
      gameCanvas.drawRoundRect(fx, fy, fw, fh, 12,
        active ? "#4ECDC4" : "rgba(255,255,255,0.10)", 102);
      if (!active) {
        gameCanvas.drawStrokeRect(fx, fy, fw, fh, 12, "rgba(255,255,255,0.22)", 1.5, 103);
      }
      // 三档按钮内的示例字号随档位放大，所见即所得
      gameCanvas.drawText(label, fx + fw / 2, fy + fh / 2,
        { size: 15 + i * 3, color: active ? "#0c1a22" : labelColor, bold: active }, 104);
    });

    // 重置进度
    this.resetRect = { x: px + 26, y: py + 486, w: panelW - 52, h: 52 };
    gameCanvas.drawRoundRect(this.resetRect.x, this.resetRect.y, this.resetRect.w, this.resetRect.h, 12,
      "rgba(231,76,60,0.22)", 102);
    gameCanvas.drawStrokeRect(this.resetRect.x, this.resetRect.y, this.resetRect.w, this.resetRect.h, 12,
      "rgba(231,76,60,0.6)", 1.5, 103);
    gameCanvas.drawText("重置全部进度", w / 2, py + 512, { size: 17, color: "#ff9b90" }, 104);

    // 关闭
    this.closeRect = { x: px + 26, y: py + 548, w: panelW - 52, h: 54 };
    gameCanvas.drawRoundRect(this.closeRect.x, this.closeRect.y, this.closeRect.w, this.closeRect.h, 12,
      "#4ECDC4", 102);
    gameCanvas.drawText("关闭", w / 2, py + 575, { size: 20, color: "#0c1a22", bold: true }, 103);

    gameCanvas.setClip(null);
    // 滚动条自绘：ScrollView.drawScrollbar 固定在 z=92/93，会被本面板（z≥100）盖住
    if (this.settingsScroll.canScroll) {
      const trackW = 6;
      const trackX = px + panelW - 4 - trackW;
      gameCanvas.drawRoundRect(trackX, viewTop, trackW, viewH, 3, "rgba(255,255,255,0.10)", 104);
      const thumbH = Math.max(28, viewH * (viewH / CONTENT_H));
      const travel = viewH - thumbH;
      const ratio = this.settingsScroll.maxScroll > 0
        ? this.settingsScroll.offsetY / this.settingsScroll.maxScroll
        : 0;
      gameCanvas.drawRoundRect(trackX, viewTop + ratio * travel, trackW, thumbH, 3,
        "rgba(78,205,196,0.75)", 104);
    }
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
    companionBubble.hide();
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
