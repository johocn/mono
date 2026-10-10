/**
 * Main — 入口：引擎初始化 + 场景路由
 *
 * 路由图：
 *   MainMenu ──┬─> LevelSelect ─┐
 *              ├─> [听力筛查] ───┼─> [教程] ─> 关卡场景 ─> Result ─┬─> 下一关
 *              └─> 按模式开始 ───┘                                  ├─> 重玩本关
 *                                                                  └─> MainMenu
 *
 * 关卡进入前会调用自适应引擎生成「调整后的关卡副本」，因此全局配置对象始终只读。
 */

import { gameCanvas } from "./ui/GameCanvas";
import { safety } from "./core/SafetyManager";
import { adaptive } from "./core/AdaptiveEngine";
import { progress } from "./core/ProgressStore";
import { achievements } from "./core/AchievementStore";
import { skinManager } from "./core/SkinManager";
import { authStore } from "./core/AuthStore";
import {
  consumeUrlParams,
  handleSsoCallback,
  needsSsoLogin,
  redirectToSsoLogin,
  buildShareUrl,
} from "./core/SsoAuth";
import { initMarketingShare } from "./core/MarketingShare";
import { exitGuard } from "./core/ExitGuard";
import { sceneChrome, type NavKey } from "./ui/SceneChrome";
import { audioSynth } from "./ui/AudioSynth";
import { GAME_CONFIG } from "./core/GameConfig";
import {
  ALL_LEVELS,
  getLevelsByMode,
  cloneAdjustedLevel,
  type ModeId,
  type LevelConfig,
  type ItemConfig,
} from "./config/LevelConfig";
import type { LevelResult } from "./config/GameText";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { SkinScene } from "./scenes/SkinScene";
import { LevelSelectScene } from "./scenes/LevelSelectScene";
import { HearingScreenScene } from "./scenes/HearingScreenScene";
import { TutorialOverlay } from "./scenes/TutorialOverlay";
import { ResultScene } from "./scenes/ResultScene";
import { ShopScene } from "./scenes/ShopScene";
import { NoticeScene } from "./scenes/NoticeScene";
import { RestReminder } from "./scenes/RestReminder";
import { VoteScene } from "./scenes/VoteScene";
import { MessageScene } from "./scenes/MessageScene";
import { companionBubble } from "./ui/CompanionBubble";
import { SignInScene } from "./scenes/SignInScene";
import { WheelScene } from "./scenes/WheelScene";
import { AchievementScene } from "./scenes/AchievementScene";
import type { LevelSceneCallbacks } from "./scenes/types";
import { Match3Scene } from "./modes/Match3Scene";
import { AudioMatchScene } from "./modes/AudioMatchScene";
import { PoetryMatchScene } from "./modes/PoetryMatchScene";
import { CorsiScene } from "./modes/CorsiScene";
import { FaceScene } from "./modes/FaceScene";
import { MemoryScene } from "./modes/MemoryScene";
import { ReviewScene } from "./scenes/ReviewScene";
import { StroopScene } from "./modes/StroopScene";
import { MoneyScene } from "./modes/MoneyScene";
import { PmScene } from "./modes/PmScene";
import { ClockScene } from "./modes/ClockScene";
import { NostalgiaScene } from "./modes/NostalgiaScene";
import { BrainCenterScene } from "./scenes/BrainCenterScene";
import { BrainProfileScene } from "./scenes/BrainProfileScene";
import { FamilyCareScene } from "./scenes/FamilyCareScene";

interface Destroyable { destroy?: () => void }

/**
 * 可回栈的页面路由（关卡 / 结算 / 教程 / 听力筛查属于「沉浸页」，不入栈：
 * 它们按返回键 = 回到来路页面，由 inTransient 标记）。
 */
type Route =
  | { k: "menu" }
  | { k: "levels"; filter: ModeId | "shuangyang" }
  | { k: "brain" }
  | { k: "profile" }
  | { k: "family" }
  | { k: "shop" }
  | { k: "skins" }
  | { k: "review" }
  | { k: "signin" }
  | { k: "wheel" }
  | { k: "achievements" };

class Game {
  private currentScene: Destroyable | null = null;
  private tutorialSeen: Set<ModeId> = new Set();
  /** 本次应用会话内是否已弹出过「休息提醒」，避免关卡间反复打扰 */
  private restSuggested = false;
  /** 上一关中位反应时，供自适应引擎参考 */
  private lastMedianRT: number = GAME_CONFIG.medianReactionBaseline;

  // === 栈式路由（老人防迷路 + 退回上一页）===
  private stack: Route[] = [];
  private current: Route = { k: "menu" };
  /** 沉浸页（关卡 / 结算 / 教程 / 听力筛查）：返回键回到来路，不退出网页 */
  private inTransient = false;

  constructor() {
    // 隐藏 loading
    const loading = document.getElementById("Loading");
    if (loading) loading.style.display = "none";

    safety.load();
    progress.load();
    achievements.load();
    // 恢复上次应用的皮肤；未换肤或数据损坏时保持默认，绝不影响启动
    skinManager.restore();
    // 恢复登录态（游客优先：未登录时全部走本地模式）
    authStore.load();

    try {
      const seen = localStorage.getItem("bg_tutorial_seen");
      if (seen) this.tutorialSeen = new Set(JSON.parse(seen) as ModeId[]);
    } catch { /* 数据损坏时忽略 */ }

    // 底部导航（首页 / 关卡 / 认知中心 / 道具中心）统一由路由处理
    sceneChrome.setHandler((key) => this.onNav(key));

    // 全站点击拦截器：底部导航 / 右上主页按钮优先消费，场景不再处理
    gameCanvas.setTapInterceptor((x, y) => {
      const nav = sceneChrome.hitTest(x, y);
      if (!nav) return false;
      audioSynth.playUi("button");
      sceneChrome.dispatch(nav);
      return true;
    });
    // 每帧浮层：绘制底部导航 + 主页按钮（无需每个场景各自绘制）
    gameCanvas.setOverlay(() => sceneChrome.render());

    void this.bootstrap();
  }

  /**
   * 启动引导：消费 URL 参数 → SSO 回跳换会话 → 强制登录检查 → 主菜单。
   * 强制 SSO：后端已配置且本机无正式账号（含游客态）时整页跳转统一登录页。
   */
  private async bootstrap(): Promise<void> {
    const { token, refreshToken, expiresIn } = consumeUrlParams();

    // 分享 A/B：首屏尽早启动（不 await，不阻塞游戏）。
    // 必须在 SSO 跳转检查之前发起：分享打开者未登录时会被整页跳走，
    // 若放在跳转之后，pick/曝光/打开上报将永远没有执行机会。
    void initMarketingShare();

    if (token) {
      const res = await handleSsoCallback(token, refreshToken, expiresIn);
      if (!res.ok) {
        this.cleanupScene();
        sceneChrome.configure({ enabled: false }); // 弹窗期间隐藏底部导航
        this.currentScene = new NoticeScene(
          "登录未完成",
          [res.error || "登录会话获取失败", "请重新登录后再试"],
          "重新登录",
          () => redirectToSsoLogin(),
        );
        return;
      }
    }

    // 已登录但令牌临近过期：先尝试静默刷新，失败（refreshToken 失效）再走 SSO。
    // 这样用户在 token 过期后无需重新跳登录页，前端自动续期。
    if (authStore.isLoggedIn()) {
      await authStore.ensureToken();
    }

    if (needsSsoLogin()) {
      exitGuard.uninstall(); // 整页跳走前卸载，避免与 SSO 的 history 操作冲突
      redirectToSsoLogin(); // 整页跳走，本页不再继续
      return;
    }

    // 退出拦截：首页弹确认面板，非首页按返回 = 游戏内返回上一页
    exitGuard.install({
      onConfirm: () => this.requestExitConfirm(),
      onInternalBack: () => this.goBack(),
    });

    this.goHome();
  }

  // === 路由 ===

  /** 进入新页面：把当前页面压栈 */
  private navigate(route: Route): void {
    this.stack.push(this.current);
    this.current = route;
    this.renderRoute(route);
  }

  /** 回主页（右上「主页」按钮 / 底部导航「首页」/ 关卡内退出） */
  private goHome(): void {
    this.stack = [];
    this.current = { k: "menu" };
    this.renderRoute(this.current);
  }

  /** 返回上一页（浏览器返回键在非首页时走这里，绝不退出网页） */
  private goBack(): void {
    if (this.inTransient) {
      // 关卡 / 结算 / 教程 / 听力筛查：回到来路页面
      this.renderRoute(this.current);
      return;
    }
    const prev = this.stack.pop();
    this.current = prev ?? { k: "menu" };
    this.renderRoute(this.current);
  }

  private renderRoute(route: Route): void {
    this.markTransient(false);
    // 全站外壳：非首页显示底部导航 + 右上主页按钮；首页只显示底部导航
    sceneChrome.configure({
      enabled: true,
      active: route.k === "menu" ? "home"
        : route.k === "levels" ? "levels"
        : route.k === "brain" ? "brain"
        : route.k === "shop" ? "shop"
        : null,
      // 关卡选择页隐藏全局主页按钮：它与右上「👍 点赞」完全重叠，会吞掉点赞点击
      // （想点赞却回主页对老人是严重误触）；该页左上 ‹ 可返回上一页/主页
      showHome: route.k !== "menu" && route.k !== "levels",
    });
    switch (route.k) {
      case "menu": this.showMainMenuScene(); break;
      case "levels": this.showLevelSelectScene(route.filter); break;
      case "brain": this.showBrainCenterScene(); break;
      case "profile": this.showProfileScene(); break;
      case "family": this.showFamilyScene(); break;
      case "shop": this.showShopScene(); break;
      case "skins": this.showSkinsScene(); break;
      case "review": this.showReviewScene(); break;
      case "signin": this.showSigninScene(); break;
      case "wheel": this.showWheelScene(); break;
      case "achievements": this.showAchievementsScene(); break;
    }
  }

  /** 沉浸页标记：true 时返回键回到来路，且隐藏底部导航（关卡内用 HUD 主页按钮） */
  private markTransient(v: boolean): void {
    this.inTransient = v;
    exitGuard.setAtHome(!v && this.current.k === "menu");
    sceneChrome.configure({ enabled: !v, active: null });
  }

  /** 底部导航点击 */
  private onNav(key: NavKey): void {
    if (key === "home") { this.goHome(); return; }
    if (this.current.k === key) return;
    if (key === "levels") this.navigate({ k: "levels", filter: "match3" });
    else if (key === "brain") this.navigate({ k: "brain" });
    else if (key === "shop") this.navigate({ k: "shop" });
  }

  /** 首页按下返回键：交给主菜单弹自己的确认面板 */
  private requestExitConfirm(): void {
    if (this.current.k !== "menu" || this.inTransient) return;
    if (this.currentScene instanceof MainMenuScene) this.currentScene.promptExitConfirm();
  }

  private showMainMenuScene(): void {
    this.cleanupScene();
    // 回到主菜单时评估成就（如签到连击、星数里程碑等可能在其它场景解锁）
    achievements.evaluate();
    this.currentScene = new MainMenuScene({
      onContinue: () => this.continueTraining(),
      onPickMode: (mode) => this.startMode(mode),
      onOpenLevels: () => this.navigate({ k: "levels", filter: "match3" }),
      onOpenShuangyang: () => this.navigate({ k: "levels", filter: "shuangyang" }),
      onOpenSkins: () => this.navigate({ k: "skins" }),
      onOpenReview: () => this.navigate({ k: "review" }),
      onReset: () => {
        this.tutorialSeen.clear();
        try { localStorage.removeItem("bg_tutorial_seen"); } catch { /* 忽略 */ }
        safety.setHearingPassed(false);
        safety.setHearingScreened(false);
        this.goHome();
      },
      onOpenShop: () => this.navigate({ k: "shop" }),
      onInvite: () => this.inviteFriends(),
      onOpenSignin: () => this.navigate({ k: "signin" }),
      onOpenWheel: () => this.navigate({ k: "wheel" }),
      onOpenAchievements: () => this.navigate({ k: "achievements" }),
      onOpenBrainCenter: () => this.navigate({ k: "brain" }),
    });
  }

  /** 认知中心（统一中枢）：画像 / 今日计划 / 家属关怀 / 各玩法的统一入口 */
  private showBrainCenterScene(): void {
    this.cleanupScene();
    this.currentScene = new BrainCenterScene({
      onBack: () => this.goBack(),
      onOpenProfile: () => this.navigate({ k: "profile" }),
      onOpenFamily: () => this.navigate({ k: "family" }),
      onOpenVote: () => this.showVoteScene(),
      onOpenMessage: () => this.showMessageScene(),
      onContinue: () => this.continueTraining(),
      onPickMode: (mode) => this.startMode(mode),
    });
  }

  /** 我的认知画像：雷达 / 趋势 / 个性化建议 / 可分享月报 */
  private showProfileScene(): void {
    this.cleanupScene();
    this.currentScene = new BrainProfileScene({ onBack: () => this.goBack() });
  }

  /** 家属关怀：家属视角月报 + 分享链接（离线：生成本机可分享文本/链接） */
  private showFamilyScene(): void {
    this.cleanupScene();
    this.currentScene = new FamilyCareScene({ onBack: () => this.goBack() });
  }

  /** 最受欢迎投票：统一问卷页，单选「最喜欢的一款」 */
  private showVoteScene(): void {
    this.cleanupScene();
    this.currentScene = new VoteScene({ onBack: () => this.goBack() });
  }

  /** 留言建议：昵称 + 内容，提交到后台线索（纯 Canvas 无法输入，内部用 DOM 浮层承载输入） */
  private showMessageScene(): void {
    this.cleanupScene();
    this.currentScene = new MessageScene({ onBack: () => this.goBack() });
  }

  /** 邀请好友：复制带本人邀请码的分享链接（微信内可粘贴发送） */
  private inviteFriends(): void {
    const url = buildShareUrl();
    const finish = (copied: boolean) => {
      this.cleanupScene();
      sceneChrome.configure({ enabled: false }); // 弹窗期间隐藏底部导航
      this.currentScene = new NoticeScene(
        "邀请好友",
        copied ? ["邀请链接已复制", "发给微信好友，一起玩吧"] : ["请手动复制以下链接", url],
        "好的",
        () => this.goBack(),
      );
    };
    const clip = navigator.clipboard;
    if (clip?.writeText) {
      clip.writeText(url).then(() => finish(true)).catch(() => finish(false));
    } else {
      finish(false);
    }
  }

  private showLevelSelectScene(initialFilter: ModeId | "shuangyang" = "match3"): void {
    this.cleanupScene();
    this.currentScene = new LevelSelectScene(
      (level) => this.enterLevel(level),
      () => this.goBack(),
      initialFilter,
    );
  }

  /** 继续训练：优先「已解锁但未通关」，其次「未满星」 */
  private continueTraining(): void {
    const unpassed = ALL_LEVELS.find(
      (l) => progress.isUnlocked(l.id) && !progress.getRecord(l.id)?.passed,
    );
    if (unpassed) { this.enterLevel(unpassed); return; }

    const notFull = ALL_LEVELS.find(
      (l) => progress.isUnlocked(l.id) && progress.getStars(l.id) < 3,
    );
    if (notFull) { this.enterLevel(notFull); return; }

    this.navigate({ k: "levels", filter: "match3" });
  }

  private startMode(mode: ModeId): void {
    const levels = getLevelsByMode(mode);
    if (levels.length === 0) return;
    const unlocked = levels.filter((l) => progress.isUnlocked(l.id));
    this.enterLevel(unlocked[unlocked.length - 1] ?? levels[0]);
  }

  private enterLevel(level: LevelConfig): void {
    if (!progress.isUnlocked(level.id)) {
      this.navigate({ k: "levels", filter: level.mode });
      return;
    }

    // 听力筛查门（仅首次进入听音模式）
    if (level.mode === "audio" && !safety.isHearingScreened()) {
      this.cleanupScene();
      this.markTransient(true);
      const scene = new HearingScreenScene((passed: boolean) => {
        scene.destroy();
        safety.setHearingPassed(passed);
        safety.setHearingScreened(true);
        this.enterLevelAfterScreen(level);
      });
      this.currentScene = scene;
      return;
    }

    this.enterLevelAfterScreen(level);
  }

  private enterLevelAfterScreen(level: LevelConfig): void {
    if (!this.tutorialSeen.has(level.mode)) {
      this.cleanupScene();
      this.markTransient(true);
      const tutorial = new TutorialOverlay(level.mode, () => {
        tutorial.destroy();
        this.tutorialSeen.add(level.mode);
        try {
          localStorage.setItem("bg_tutorial_seen", JSON.stringify([...this.tutorialSeen]));
        } catch { /* 忽略 */ }
        this.startLevel(level);
      });
      this.currentScene = tutorial;
      return;
    }
    this.startLevel(level);
  }

  private startLevel(baseLevel: LevelConfig): void {
    this.cleanupScene();
    // 关卡内：返回键回到来路页面，不允许退出网页
    this.markTransient(true);

    safety.startSession();
    if (safety.isDailyLimitReached()) {
      // 不用浏览器 alert：它会打断沉浸、无法控制字号，也不符合适老化要求
      this.cleanupScene();
      this.currentScene = new NoticeScene(
        "今天先到这里吧",
        [
          `已经玩了 ${GAME_CONFIG.maxDailyMinutes} 分钟，眼睛该歇一歇了。`,
          "明天再来，花园一直在这里等你。",
        ],
        "好的",
        () => this.goHome(),
      );
      return;
    }

    // 累计达「休息软阈值」且本次会话尚未提示过：在关卡间隙温柔建议休息
    if (!this.restSuggested && safety.getDailyMinutesUsed() >= GAME_CONFIG.restSuggestMinutes) {
      this.cleanupScene();
      this.markTransient(true);
      const reminder = new RestReminder({
        onContinue: () => {
          reminder.destroy();
          this.restSuggested = true;
          this.startLevel(baseLevel);
        },
        onRest: () => {
          reminder.destroy();
          this.goHome();
        },
      });
      this.currentScene = reminder;
      return;
    }

    // 自适应难度：生成关卡副本，绝不就地修改全局配置
    const adj = adaptive.computeAdjustment(baseLevel, this.lastMedianRT);
    const level = cloneAdjustedLevel(baseLevel, adj.stepAdjust, adj.contentAdjust);
    // 背包道具注入本关（仅在副本内，绝不污染全局配置），
    // 使「看广告 / 每日登录礼」获得的道具在关卡内真正可用且跨关持久
    for (const k of Object.keys(progress.getInventory()) as (keyof ItemConfig)[]) {
      level.items[k] = (level.items[k] ?? 0) + progress.getItem(k);
    }
    if (level.mode === "audio" && safety.isHearingScreened() && !safety.isHearingPassed()) {
      level.visualFallback = true;
    }

    const callbacks: LevelSceneCallbacks = {
      onComplete: (result: LevelResult) => {
        if (result.medianRT > 0) this.lastMedianRT = result.medianRT;
        this.showResult(baseLevel, result);
      },
      // 关卡内一切「退出」都明确回主页，避免老人在二级页面里迷路
      onExit: () => this.goHome(),
      onRestart: () => this.startLevel(baseLevel),
    };

    switch (level.mode) {
      case "match3":
        this.currentScene = new Match3Scene(level, callbacks);
        break;
      case "audio":
        this.currentScene = new AudioMatchScene(level, callbacks);
        break;
      case "poetry":
        this.currentScene = new PoetryMatchScene(level, callbacks);
        break;
      case "corsi":
        this.currentScene = new CorsiScene(level, callbacks);
        break;
      case "face":
        this.currentScene = new FaceScene(level, callbacks);
        break;
      case "memory":
        this.currentScene = new MemoryScene(level, callbacks);
        break;
      case "stroop":
        this.currentScene = new StroopScene(level, callbacks);
        break;
      case "money":
        this.currentScene = new MoneyScene(level, callbacks);
        break;
      case "pm":
        this.currentScene = new PmScene(level, callbacks);
        break;
      case "clock":
        this.currentScene = new ClockScene(level, callbacks);
        break;
      case "nostalgia":
        this.currentScene = new NostalgiaScene(level, callbacks);
        break;
    }
  }

  private showResult(baseLevel: LevelConfig, result: LevelResult): void {
    this.cleanupScene();
    // 结算页同样属于沉浸页：返回键回到来路页面
    this.markTransient(true);
    // 结算时评估成就（首次通关 / 集齐双阳 / 星数里程碑等），结果由 ResultScene 弹出
    achievements.evaluate();
    const next = this.findNextLevel(baseLevel);
    this.currentScene = new ResultScene(baseLevel, result, {
      onNext: () => { if (next) this.enterLevel(next); else this.goHome(); },
      onRetry: () => this.startLevel(baseLevel),
      onMenu: () => this.goHome(),
      hasNext: next !== null,
      onShop: () => this.navigate({ k: "shop" }),
    });
  }

  /** 同模式的下一关，且已解锁 */
  private findNextLevel(base: LevelConfig): LevelConfig | null {
    const levels = getLevelsByMode(base.mode);
    const idx = levels.findIndex((l) => l.id === base.id);
    const next = levels[idx + 1];
    if (!next) return null;
    return progress.isUnlocked(next.id) ? next : null;
  }

  /** 道具中心（特惠花园）：道具礼包 / 皮肤 / 优惠券 */
  private showShopScene(): void {
    this.cleanupScene();
    this.currentScene = new ShopScene(() => this.goBack());
  }

  /** 换装花园：皮肤预览 / 本地库 / 模板中心 / AI 生成 / 分享码 */
  private showSkinsScene(): void {
    this.cleanupScene();
    this.currentScene = new SkinScene(() => this.goBack());
  }

  /** 每日复习会话（间隔复习系统） */
  private showReviewScene(): void {
    this.cleanupScene();
    this.currentScene = new ReviewScene(() => this.goBack());
  }

  /** 连续签到 */
  private showSigninScene(): void {
    this.cleanupScene();
    this.currentScene = new SignInScene(() => this.goBack());
  }

  /** 幸运转盘 */
  private showWheelScene(): void {
    this.cleanupScene();
    this.currentScene = new WheelScene(() => this.goBack());
  }

  /** 成就墙 */
  private showAchievementsScene(): void {
    this.cleanupScene();
    this.currentScene = new AchievementScene(() => this.goBack());
  }

  private cleanupScene(): void {
    if (this.currentScene && typeof this.currentScene.destroy === "function") {
      this.currentScene.destroy();
    }
    this.currentScene = null;
    // 一个关卡 = 一次会话；结束时把本段时长计入当日累计并落盘
    safety.endSession();
    // 防御：即便某场景未实现 destroy，也不让陪伴气泡跨场景残留
    companionBubble.hide();
    gameCanvas.clearHandlers();
    gameCanvas.clearDrawCalls();
  }
}

/**
 * 启动时对主色板做一次对比度审计。
 * 这让 GAME_CONFIG.minContrastRatio 成为真实检查，而不是一句注释。
 */
function auditPalette(): void {
  const pairs: [string, string, string][] = [
    ["#FFE66D", "#16213e", "主标题/分数"],
    ["#4ECDC4", "#16213e", "强调色/步数"],
    ["#ffffff", "#16213e", "正文白字"],
    ["#c3cadf", "#16213e", "次级说明文字"],
    ["#0c1a22", "#4ECDC4", "主按钮文字"],
  ];
  for (const [fg, bg, tag] of pairs) safety.assertContrast(fg, bg, tag);
}

function boot(): void {
  auditPalette();
  new Game();
}

// 兼容 defer / 普通 script 两种加载时机
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
