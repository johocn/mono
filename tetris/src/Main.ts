/**
 * Main — 应用入口与场景路由
 * 启动：加载存档/皮肤 → 处理 SSO 回跳 → 初始化分享裂变 → 进入主菜单。
 * 场景：主菜单 / 方块（沉浸页）/ 结算 / 道具中心 / 皮肤。
 */

import { gameCanvas } from "./ui/GameCanvas";
import { safety } from "./core/SafetyManager";
import { progress } from "./core/ProgressStore";
import { skinManager } from "./core/SkinManager";
import { authStore } from "./core/AuthStore";
import { consumeUrlParams, handleSsoCallback } from "./core/SsoAuth";
import { initMarketingShare } from "./core/MarketingShare";
import { ENV } from "./core/Env";
import { syncPull } from "./core/Sync";
import { exitGuard } from "./core/ExitGuard";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { TetrisScene } from "./scenes/TetrisScene";
import { ResultScene } from "./scenes/ResultScene";
import { ShopScene } from "./scenes/ShopScene";
import { SkinScene } from "./scenes/SkinScene";
import { TETRIS_CONFIG } from "./config/LevelConfig";
import type { LevelResult } from "./config/GameText";

interface SceneLike {
  update?: (dt: number, now: number) => void;
  render: () => void;
  destroy?: () => void;
}

let active: SceneLike | null = null;
let lastT = performance.now();

function setScene(s: SceneLike): void {
  active?.destroy?.();
  active = s;
}

function goMenu(): void {
  exitGuard.setAtHome(true);
  setScene(new MainMenuScene(startGame, goShop, goSkin));
}

function startGame(): void {
  exitGuard.setAtHome(false);
  setScene(new TetrisScene(TETRIS_CONFIG, {
    onComplete: (r: LevelResult) => showResult(r),
    onExit: goMenu,
    onRestart: startGame,
  }));
}

function showResult(r: LevelResult): void {
  exitGuard.setAtHome(false);
  setScene(new ResultScene(r, startGame, goMenu, goShop));
}

function goShop(): void {
  setScene(new ShopScene(goMenu));
}

function goSkin(): void {
  setScene(new SkinScene(goMenu));
}

function showExitConfirm(): void {
  // 简化：首页返回直接提示（不退出网页，避免误触丢失进度）
  const w = gameCanvas.getW();
  const h = gameCanvas.getH();
  gameCanvas.draw((ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, w, h);
  }, 300);
  gameCanvas.drawText("已在首页啦", w / 2, h / 2, { size: 24, color: "#fff", bold: true }, 301);
  gameCanvas.drawText("关闭页面请使用浏览器关闭", w / 2, h / 2 + 40, { size: 15, color: "#c3cadf" }, 301);
}

function globalUpdate(): void {
  const now = performance.now();
  const dt = Math.min(50, now - lastT);
  lastT = now;
  active?.update?.(dt, now);
  active?.render?.();
}

async function bootstrap(): Promise<void> {
  try {
    safety.load();
    progress.load();
    skinManager.restore();
    authStore.load();

    const { token, refreshToken, expiresIn } = consumeUrlParams();
    if (token) {
      const res = await handleSsoCallback(token, refreshToken ?? undefined, expiresIn ?? undefined);
      if (!res.ok) console.warn("[tetris] SSO 登录未完成:", res.error);
    }

    // 后端可用且本机无正式会话：静默游客登录，获取服务端身份（同设备持久化）
    if (ENV.gameServerEnabled && !authStore.isLoggedIn()) {
      await authStore.loginGuest();
    }

    // 已登录（游客或 SSO）：拉取服务端进度/积分/皮肤，跨设备同步
    if (authStore.isLoggedIn()) {
      await authStore.ensureToken();
      await syncPull();
    }

    // 分享裂变 A/B：尽早初始化（拉取文案变体 + 打标 + 回传曝光/打开）
    void initMarketingShare();
  } catch (e) {
    // 任何启动异常都降级为本地模式，绝不让首页卡在加载态 / 不可点击
    console.error("[tetris] bootstrap 出错，已降级为本地模式:", e);
  } finally {
    // 无论如何都进入主菜单并移除加载遮罩，保证首页可交互
    gameCanvas.setUpdateCallback(globalUpdate);

    exitGuard.install({
      onConfirm: showExitConfirm,
      onInternalBack: () => { /* 非首页：交给场景自身返回逻辑 */ },
    });

    goMenu();

    // 隐藏首屏加载遮罩（"方块正在就位…"），交还画布交互
    const loadingEl = document.getElementById("Loading");
    if (loadingEl) loadingEl.remove();
  }
}

void bootstrap();
