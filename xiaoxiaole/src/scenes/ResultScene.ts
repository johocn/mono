/**
 * ResultScene — 结算场景：星级揭晓 + 事实赞美 + 真实认知雷达图 + 导航
 *
 * 修复要点：
 * - 雷达图改用 ProgressStore 的真实聚合数据（原先为硬编码常量）
 * - 补齐 destroy()，避免场景切换后残留输入/更新回调
 * - 提供「下一关 / 重玩本关 / 返回菜单」三条出口，不再强制跨模式跳关
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { progress, computeStars, computeCorsiStars, computeFaceStars, computeMemoryStars, computeStroopStars, computePmStars } from "../core/ProgressStore";
import { safety } from "../core/SafetyManager";
import { speech } from "../core/speech";
import { companionSays, companion } from "../ui/Companion";
import { companionBubble } from "../ui/CompanionBubble";
import { achievements, type Celebration } from "../core/AchievementStore";
import { Easing } from "../core/Tween";
import type { LevelConfig, ItemConfig } from "../config/LevelConfig";
import { POINTS_RULES } from "../config/PointsConfig";

const ITEM_LABEL: Record<keyof ItemConfig, string> = {
  hint: "提示", reshuffle: "重洗", reveal: "揭示", peek: "偷看", undo: "撤销", rehear: "重听",
  step: "补步", shield: "护盾", hammer: "锤子",
};

/** 通关奖励道具池（不含听音专属的「重听」与购买专属的「护盾」） */
const REWARD_POOL: (keyof ItemConfig)[] = ["hint", "reshuffle", "undo", "peek", "reveal", "step"];
import { generatePraise, NPC_NAME, type LevelResult, type LevelMetrics, type PraiseResult } from "../config/GameText";
import { wrapText } from "../ui/ResultCard";
import { recommendProductsFor } from "../config/ShopData";
import type { ShopProduct } from "../api/types";
import { getMarketingShareLink } from "../core/MarketingShare";

interface Rect { x: number; y: number; w: number; h: number }

export interface ResultSceneCallbacks {
  onNext(): void;
  onRetry(): void;
  onMenu(): void;
  /** 是否存在下一关（决定主按钮文案与可用性） */
  hasNext: boolean;
  /** 点击"为你推荐"进入商品橱窗（可选） */
  onShop?: () => void;
}

export class ResultScene {
  private level: LevelConfig;
  private result: LevelResult;
  private cb: ResultSceneCallbacks;
  private praise: PraiseResult;
  private stars: number;

  private nextRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private retryRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private menuRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private recRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private onShop?: () => void;
  private recoProducts: ShopProduct[] = [];

  private lastTime = 0;
  private time = 0;
  /** 星级揭晓进度（逐颗弹出） */
  private starP = 0;
  private praisedStar = -1;
  /** 通关奖励的道具（null 表示未发放） */
  private rewardItem: keyof ItemConfig | null = null;
  /** 分享裂变奖励的道具（null 表示未分享/未发放） */
  private shareRewardItem: keyof ItemConfig | null = null;
  /** 本局通关获得的积分（未通关为 0） */
  private pointsGained = 0;
  private shareRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private shared = false;
  private toastText = "";
  private toastUntil = 0;
  /** 成就庆祝（非 null 时弹窗并拦截其它按钮；可连续弹出多个） */
  private celebration: Celebration | null = null;
  private celebrationRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(level: LevelConfig, result: LevelResult, cb: ResultSceneCallbacks) {
    this.level = level;
    this.result = result;
    this.cb = cb;
    this.onShop = cb.onShop;
    this.recoProducts = recommendProductsFor(level.mode, 2);

    const metrics: LevelMetrics = {
      mode: level.mode,
      passed: result.passed,
      score: result.score,
      passTarget: level.passTarget,
      stepsUsed: result.stepsUsed,
      stepLimit: level.stepLimit,
      paradigm: result.paradigm,
      totalQuestions: result.totalQuestions,
      maxSeqAchieved: result.maxSeqAchieved,
      pairsTotal: result.pairsTotal,
      medianRT: result.medianRT,
      pmHits: result.pmHits,
      pmTargets: result.pmTargets,
      pmFalseAlarms: result.pmFalseAlarms,
    };
    this.praise = generatePraise(metrics);
    this.stars = level.mode === "corsi"
      ? computeCorsiStars(result.passed, result.score, level.stepLimit)
      : level.mode === "face"
        ? computeFaceStars(result.passed, result.score, level.faceCount ?? level.stepLimit, level.passTarget)
        : level.mode === "memory"
          ? computeMemoryStars(result.passed, result.stepsUsed, level.cardPairs ?? level.passTarget)
          : level.mode === "stroop" || level.mode === "money"
            // stroop / money 同为「正确率 + 反应时」型，共用星级规则
            ? computeStroopStars(result.passed, result.score, level.stepLimit, result.medianRT ?? 0)
            : level.mode === "pm"
              ? computePmStars(result.passed, result.pmHits ?? 0, result.pmTargets ?? 0, result.pmFalseAlarms ?? 0)
              : level.mode === "clock"
                // clock 与 stroop / money 同为「正确率 + 反应时」型
                ? computeStroopStars(result.passed, result.score, level.stepLimit, result.medianRT ?? 0)
            : computeStars(result.passed, result.score, level.passTarget, result.stepsUsed, level.stepLimit);

    // 通关奖励：随机训练道具 + 积分（三星再叠加），与每日礼 / 看广告 / 分享形成获取矩阵
    if (result.passed) {
      const key = REWARD_POOL[Math.floor(Math.random() * REWARD_POOL.length)];
      progress.addItem(key, 1);
      this.rewardItem = key;
      const gained = POINTS_RULES.passLevel + (this.stars >= 3 ? POINTS_RULES.threeStars : 0);
      progress.addPoints(gained, "earn_pass");
      this.pointsGained = gained;
    }

    this.lastTime = performance.now();
    audioSynth.playUi(result.passed ? "win" : "fail");

    // 结算语音播报（受 声音/语音 开关控制）：先夸，再让向导「小园」送一句暖心话
    if (safety.isSoundEnabled() && safety.isSpeechEnabled()) {
      speech.speak(`${this.praise.headline}。${this.praise.encouragement}`, { rate: safety.getSpeechRate() });
      speech.speak(companionSays(), { rate: safety.getSpeechRate(), interrupt: false });
    }

    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));

    // 取出待展示的成就庆祝（evaluate 已在结算前调用，可能命中多个）
    this.celebration = achievements.consumeCelebration();
  }

  private update(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.time = now;

    if (this.starP < 1) {
      this.starP = Math.min(1, this.starP + dt / 0.32);
      // 每颗星揭晓时播放一次音效
      const revealed = Math.floor(this.starP * 3.001);
      if (revealed > this.praisedStar) {
        this.praisedStar = revealed;
        if (revealed <= this.stars) audioSynth.playUi("star", revealed);
      }
    }

    this.render();
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    // 成就庆祝弹窗：拦截其它按钮，仅「收下」可关闭；关闭后若仍有待展示则继续弹出
    if (this.celebration !== null) {
      if (this.hit(this.celebrationRect, x, y)) {
        audioSynth.playUi("button");
        this.celebration = achievements.consumeCelebration();
      }
      return;
    }

    // 点小园：把这句话再读一遍（长辈没听清时很有用）
    if (companionBubble.hit(x, y)) {
      audioSynth.playUi("button");
      companionBubble.replay();
      return;
    }

    if (this.hit(this.nextRect, x, y)) {
      audioSynth.playUi("button");
      // 有下一关 → 前进；已通关但无下一关 → 回菜单；未通关 → 重试
      if (this.cb.hasNext || this.result.passed) this.cb.onNext();
      else this.cb.onRetry();
      return;
    }
    if (this.hit(this.retryRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onRetry();
      return;
    }
    if (this.hit(this.menuRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onMenu();
    }
    if (this.hit(this.shareRect, x, y)) {
      this.onShare();
      return;
    }
    if (this.onShop && this.hit(this.recRect, x, y)) {
      audioSynth.playUi("button");
      this.onShop();
    }
  }

  /** 分享裂变：真实环境优先 navigator.share；其余（含桌面演示）模拟分享并发放随机道具 */
  private onShare(): void {
    if (this.shared) {
      this.showResultToast("已分享过啦，奖励道具已领取");
      return;
    }
    const passed = this.result.passed;
    const data = {
      title: "脑力花园",
      text: `我在「脑力花园」${passed ? "通关" : "挑战"}了 ${this.level.name}，来一起练脑吧！`,
      url: getMarketingShareLink(),
    };
    const grant = () => {
      const key = REWARD_POOL[Math.floor(Math.random() * REWARD_POOL.length)];
      progress.addItem(key, 1);
      progress.addPoints(POINTS_RULES.share, "earn_share");
      this.shared = true;
      this.shareRewardItem = key;
      audioSynth.playUi("item");
      this.showResultToast(`分享成功，获得 ${ITEM_LABEL[key]} ×1 · 积分 +${POINTS_RULES.share}`);
    };
    const nav = (typeof navigator !== "undefined" ? navigator : undefined) as
      (Navigator & { share?: (d: typeof data) => Promise<void> }) | undefined;
    if (nav && typeof nav.share === "function") {
      nav.share(data).then(grant).catch(() => { /* 用户取消不发放 */ });
    } else {
      grant(); // 演示环境直接模拟分享
    }
  }

  private showResultToast(text: string): void {
    this.toastText = text;
    this.toastUntil = performance.now() + 2600;
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const passed = this.result.passed;

    // 背景
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.6, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 过关时添加暖色庆祝光晕
      if (passed) {
        const glow = ctx.createRadialGradient(w / 2, h * 0.2, 0, w / 2, h * 0.2, w * 0.85);
        glow.addColorStop(0, "rgba(255,230,109,0.14)");
        glow.addColorStop(1, "rgba(255,230,109,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }
    }, 0);

    // 标题
    gameCanvas.drawText(passed ? "过关！" : "再接再厉", w / 2, 58,
      { size: 44, color: passed ? "#4ECDC4" : "#e07a6a", bold: true }, 5);
    // 诗词模式的 score 是「配对数」而非分数，用词必须跟着模式走
    const scoreText = this.level.mode === "poetry"
      ? `配对 ${this.result.score} / ${this.level.poetryPairs?.length ?? 0} 对`
      : this.level.mode === "corsi"
      ? `正确 ${this.result.score} 轮`
      : this.level.mode === "face"
      ? `认对 ${this.result.score} 位`
      : this.level.mode === "memory"
      ? `配对 ${this.result.score} / ${this.level.cardPairs ?? 0} 对`
      : this.level.mode === "stroop"
      ? `答对 ${this.result.score} / ${this.level.stepLimit} 题`
      : this.level.mode === "money"
      ? `算对 ${this.result.score} / ${this.level.stepLimit} 题`
      : this.level.mode === "pm"
      ? `做对 ${this.result.score} / ${this.level.stepLimit} 题 · 按铃 ${this.result.pmHits ?? 0}/${this.result.pmTargets ?? 0}`
      : this.level.mode === "clock"
      ? `认对 ${this.result.score} / ${this.level.stepLimit} 题`
      : `得分 ${this.result.score}`;
    gameCanvas.drawText(`${this.level.id} · ${this.level.name} · ${scoreText}`,
      w / 2, 96, { size: 15, color: "#FFE66D" }, 5);

    // 通关奖励提示
    if (this.rewardItem) {
      gameCanvas.drawText(`🎁 通关奖励：${ITEM_LABEL[this.rewardItem]} ×1 · 积分 +${this.pointsGained}`,
        w / 2, 120, { size: 14, color: "#4ECDC4", bold: true }, 5);
    }

    // 星级
    this.drawStars(w / 2, 136);

    // 事实赞美卡片（高度随换行行数自适应，返回底边坐标）
    const panelBottom = this.drawPraisePanel(w);

    // 雷达图：从上轴标签所需空间（radius + 34）往下排，并保证不与底部按钮重叠
    // 雷达图半径按「面板下方到按钮上方」的剩余空间收缩，保证上轴标签不压住赞美文案
    let radius = Math.min(w * 0.22, 86);
    const radarTop = panelBottom + 46;
    const radarBottom = h - 236;
    const available = radarBottom - radarTop;
    if (available > 0) radius = Math.min(radius, available / 2 - 18);
    radius = Math.max(52, radius);
    const radarCY = radarTop + radius;
    this.drawRadar(w / 2, radarCY, radius);

    // 认知域说明
    const untrained = progress.getRadar().filter((d) => d.value <= 4).length;
    gameCanvas.drawText(`训练认知域：${this.getCognitiveDomains().join(" · ")}`,
      w / 2, radarCY + radius + 32,
      { size: 12, color: "#8b93b8" }, 5);
    if (untrained > 0) {
      gameCanvas.drawText(`还有 ${untrained} 个维度没训练过，换个模式试试`,
        w / 2, radarCY + radius + 52, { size: 11, color: "#6b7396" }, 5);
    }

    // 为你推荐（营销位）：按模式推荐 vendure 商品，点击进入橱窗
    if (this.recoProducts.length > 0) {
      const ry = h - 230;
      const rh = 50;
      this.recRect = { x: 18, y: ry, w: w - 36, h: rh };
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(255,230,109,0.08)";
        ctx.beginPath();
        ctx.roundRect(18, ry, w - 36, rh, 12);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,230,109,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }, 4);
      gameCanvas.drawText("为你推荐 · 健脑好物", 30, ry + 15, { size: 12, color: "#FFE66D", align: "left" }, 5);
      gameCanvas.drawText("去看看 ›", w - 30, ry + 15, { size: 12, color: "#9aa3c8", align: "right" }, 5);
      const half = (w - 36) / 2;
      this.recoProducts.forEach((p, i) => {
        const px = 30 + i * half;
        gameCanvas.drawText(p.emoji, px, ry + 38, { size: 20 }, 5);
        gameCanvas.drawText(p.name, px + 26, ry + 34, { size: 11, color: "#e6ebff", align: "left" }, 5);
        gameCanvas.drawText(`¥${(p.priceCents / 100).toFixed(0)}`, px + 26, ry + 46,
          { size: 11, color: "#4ECDC4", align: "left" }, 5);
      });
    }

    // === 按钮 ===
    const btnW = Math.min(w - 60, 340);
    const btnX = (w - btnW) / 2;

    // 主按钮
    const primaryY = h - 168;
    this.nextRect = { x: btnX, y: primaryY, w: btnW, h: 60 };
    const primaryLabel = this.cb.hasNext ? "下一关" : (passed ? "返回菜单" : "再试一次");
    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(btnX, primaryY, btnX, primaryY + 60);
      grad.addColorStop(0, passed ? "#4ECDC4" : "#e67e22");
      grad.addColorStop(1, passed ? "#2fa89f" : "#c0661a");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(btnX, primaryY, btnW, 60, 15);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.roundRect(btnX + 5, primaryY + 5, btnW - 10, 22, 11);
      ctx.fill();
    }, 5);
    gameCanvas.drawText(primaryLabel, w / 2, primaryY + 31,
      { size: 23, color: "#0c1a22", bold: true }, 6);

    // 次按钮：重玩 / 分享得道具 / 返回菜单（三栏）
    const secY = h - 92;
    const secW = (btnW - 28) / 3;
    this.retryRect = { x: btnX, y: secY, w: secW, h: 50 };
    this.shareRect = { x: btnX + secW + 14, y: secY, w: secW, h: 50 };
    this.menuRect = { x: btnX + 2 * (secW + 14), y: secY, w: secW, h: 50 };

    gameCanvas.drawRoundRect(this.retryRect.x, secY, secW, 50, 12, "rgba(255,255,255,0.10)", 5);
    gameCanvas.drawStrokeRect(this.retryRect.x, secY, secW, 50, 12, "rgba(255,255,255,0.22)", 1.5, 6);
    gameCanvas.drawText("重玩本关", this.retryRect.x + secW / 2, secY + 25,
      { size: 16, color: "#e6ebff", bold: true }, 6);

    gameCanvas.drawRoundRect(this.shareRect.x, secY, secW, 50, 12, "rgba(255,230,109,0.16)", 5);
    gameCanvas.drawStrokeRect(this.shareRect.x, secY, secW, 50, 12, "rgba(255,230,109,0.6)", 1.5, 6);
    gameCanvas.drawText("🔗 分享", this.shareRect.x + secW / 2, secY + 19,
      { size: 15, color: "#FFE66D", bold: true }, 6);
    gameCanvas.drawText("得道具", this.shareRect.x + secW / 2, secY + 38,
      { size: 13, color: "#FFE66D" }, 6);

    gameCanvas.drawRoundRect(this.menuRect.x, secY, secW, 50, 12, "rgba(255,255,255,0.10)", 5);
    gameCanvas.drawStrokeRect(this.menuRect.x, secY, secW, 50, 12, "rgba(255,255,255,0.22)", 1.5, 6);
    gameCanvas.drawText("返回菜单", this.menuRect.x + secW / 2, secY + 25,
      { size: 16, color: "#e6ebff", bold: true }, 6);

    // 结算吐司（分享 / 奖励反馈）
    if (performance.now() < this.toastUntil && this.toastText) {
      const tw = Math.min(w - 60, this.toastText.length * 14 + 40);
      const tx = (w - tw) / 2;
      const ty = secY - 46;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.88)";
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 36, 10);
        ctx.fill();
      }, 60);
      gameCanvas.drawText(this.toastText, w / 2, ty + 18, { size: 14, color: "#fff" }, 61);
    }

    // 温情向导「小园」：三星给惊喜喝彩，否则温柔鼓励（向上生长，不遮挡「下一关」按钮）
    const cnow = performance.now();
    if (!companionBubble.isVisible) {
      const great = this.stars >= 3;
      companionBubble.show({
        text: companion.say(great ? "surprise" : "encourage"),
        mood: great ? "surprise" : "encourage",
        x: 12,
        y: 0,
        anchorBottom: h - 176,
        maxWidth: Math.min(w - 24, 420),
        interactive: true, // 气泡底边停在按钮上方，不会遮挡「下一关」
        speak: false, // 结算已有播报，避免小园抢话
      });
    }
    companionBubble.update(cnow);
    companionBubble.draw();

    // === 成就庆祝弹窗（可能连续弹出多个） ===
    if (this.celebration !== null) {
      const c = this.celebration;
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
      gameCanvas.drawText("成就达成！", w / 2, py + 128,
        { size: 22, color: "#241a06", bold: true }, 202);
      gameCanvas.drawText(c.name, w / 2, py + 158,
        { size: 18, color: "#3a2c08", bold: true }, 202);
      gameCanvas.drawText(c.desc, w / 2, py + 186,
        { size: 13, color: "#3a2c08" }, 202);
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
      gameCanvas.drawText("收下 🏅", w / 2, by + 28,
        { size: 20, color: "#FFE66D", bold: true }, 203);
    }
  }

  /** 三颗星依次弹出揭晓 */
  private drawStars(cx: number, cy: number): void {
    const size = 34;
    const gap = 14;
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * (size + gap);
      const start = i / 3;
      const p = Math.max(0, Math.min(1, (this.starP - start) / 0.34));
      if (p <= 0) continue;
      const scale = Easing.outBack(p);
      const earned = i < this.stars;
      const color = earned ? "#FFE66D" : "rgba(255,255,255,0.16)";
      const alpha = earned ? 1 : 0.7;

      gameCanvas.draw((ctx) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, cy);
        ctx.scale(scale, scale);
        if (earned) {
          ctx.shadowColor = "rgba(255,230,109,0.85)";
          ctx.shadowBlur = 16;
        }
        ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        ctx.fillText(earned ? "★" : "☆", 0, 0);
        ctx.restore();
      }, 6);
    }
  }

  /** 事实赞美面板（构造时生成，render 只读取 → 不闪烁）；返回面板底边 y */
  private drawPraisePanel(w: number): number {
    const panelX = 18;
    const panelY = 168;
    const panelW = w - 36;
    const innerW = panelW - 32;

    // 按可用宽度换算每行字符数（中文字符 ≈ fontSize）
    const headlineSize = 15;
    const encSize = 13;
    const headlineChars = Math.max(10, Math.floor(innerW / headlineSize) - 1);
    const encChars = Math.max(12, Math.floor(innerW / encSize) - 1);

    const headlineLines = wrapText(this.praise.headline, headlineChars, 2);
    const encLines = wrapText(this.praise.encouragement, encChars, 3);

    const lineGapA = 22;
    const lineGapB = 20;
    const panelH = 30 + headlineLines.length * lineGapA + 8 + encLines.length * lineGapB + 14;

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
      grad.addColorStop(0, "rgba(78,205,196,0.15)");
      grad.addColorStop(1, "rgba(255,230,109,0.07)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 12);
      ctx.fill();
      ctx.strokeStyle = this.result.passed ? "rgba(255,230,109,0.4)" : "rgba(168,230,207,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }, 4);

    let y = panelY + 22;
    gameCanvas.drawText(`${NPC_NAME} · ${this.praise.highlight}`, w / 2, y,
      { size: 16, color: "#FFE66D", bold: true }, 5);

    y += 26;
    for (const line of headlineLines) {
      gameCanvas.drawText(line, w / 2, y, { size: headlineSize, color: "#4ECDC4" }, 5);
      y += lineGapA;
    }

    y += 6;
    for (const line of encLines) {
      gameCanvas.drawText(line, w / 2, y, { size: encSize, color: "#c3cadf" }, 5);
      y += lineGapB;
    }

    return panelY + panelH;
  }

  /** 认知雷达图（真实数据） */
  private drawRadar(cx: number, cy: number, radius: number): void {
    const data = progress.getRadar();
    const n = data.length;
    if (n < 3) return;

    const angleOf = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;

    // 网格环
    for (let ring = 1; ring <= 4; ring++) {
      const r = (radius * ring) / 4;
      gameCanvas.draw((ctx) => {
        ctx.strokeStyle = ring === 4 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = angleOf(i % n);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }, 3);
    }

    // 轴线
    for (let i = 0; i < n; i++) {
      const a = angleOf(i);
      gameCanvas.draw((ctx) => {
        ctx.strokeStyle = "rgba(255,255,255,0.14)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.stroke();
      }, 3);
    }

    // 数据多边形（带绘制进度动画）
    const p = Math.min(1, this.starP * 1.4);
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(78,205,196,0.28)";
      ctx.strokeStyle = "#4ECDC4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const idx = i % n;
        const a = angleOf(idx);
        const r = radius * (data[idx].value / 100) * p;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 顶点
      for (let i = 0; i < n; i++) {
        const a = angleOf(i);
        const r = radius * (data[i].value / 100) * p;
        ctx.fillStyle = "#FFE66D";
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 4);

    // 标签 + 数值
    for (let i = 0; i < n; i++) {
      const a = angleOf(i);
      const lx = cx + Math.cos(a) * (radius + 30);
      const ly = cy + Math.sin(a) * (radius + 26);
      const v = data[i].value;
      gameCanvas.drawText(data[i].label, lx, ly - 8, { size: 11, color: "#b9c0dc" }, 5);
      gameCanvas.drawText(`${v}`, lx, ly + 8,
        { size: 11, color: v > 0 ? "#4ECDC4" : "#5a6285", bold: true }, 5);
    }
  }

  private getCognitiveDomains(): string[] {
    switch (this.level.mode) {
      case "match3": return ["加工速度", "执行功能", "手眼协调"];
      case "audio": return ["工作记忆", "分配性注意", "听觉语义提取"];
      case "poetry": return ["语言流畅度", "语义联想", "线索回忆"];
      case "corsi": return ["空间工作记忆", "空间注意", "视听联合编码"];
      case "face": return ["联想记忆", "情景记忆", "面孔-名字绑定"];
      case "memory": return ["视觉再认记忆", "空间位置记忆", "联想编码"];
      case "stroop": return ["抑制控制", "干扰抑制", "认知灵活性"];
      case "money": return ["数感", "心算能力", "日常财务能力"];
      case "pm": return ["前瞻记忆", "意图维持", "注意分配"];
      case "clock": return ["时间定向", "视觉空间转换", "日常实用能力"];
      case "nostalgia": return ["语义记忆", "情景记忆", "联想记忆", "语言流畅度"];
      default: return [];
    }
  }

  destroy(): void {
    speech.stop();
    companionBubble.hide();
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
