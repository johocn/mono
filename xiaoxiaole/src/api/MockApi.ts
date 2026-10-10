/**
 * 模拟数据层 — 实现 IBrainGardenApi 接口
 * MVP 阶段用本地数据替代 NestJS 后端
 */

import type {
  IBrainGardenApi,
  LevelConfigDTO,
  SessionReport,
  ProgressDTO,
  RadarData,
  HearingScreenResult,
  CognitiveMapDTO,
  AdaptiveSuggestion,
  ShopProduct,
  ShopPromotion,
} from "./types";
import { ALL_LEVELS } from "../config/LevelConfig";
import { COGNITIVE_MAP, RADAR_AXES } from "../config/CognitiveMap";
import { SHOP_PRODUCTS, SHOP_PROMOTIONS, SHOP_ITEM_PACKS, SHOP_SKIN_PRODUCTS } from "../config/ShopData";
import { DEBUG } from "../core/GameConfig";
import { ENV } from "../core/Env";
import { VendureClient } from "./VendureClient";

// 本地模拟存储
const mockSessions: SessionReport[] = [];
let mockHearingPassed = false;
const mockProgress: ProgressDTO = {
  userId: "local-user",
  completedLevels: [],
  unlockedLevels: ["1-1", "2-1", "3-1"],
  adaptiveSuggestions: [],
  hearingScreenPassed: false,
  reducedMotion: true,
};

export class MockApi implements IBrainGardenApi {
  async getLevel(mode: string, level: string): Promise<LevelConfigDTO> {
    const cfg = ALL_LEVELS.find(l => l.mode === mode && l.id === level);
    if (!cfg) throw new Error(`Level not found: ${mode}/${level}`);
    return {
      id: cfg.id,
      mode: cfg.mode,
      name: cfg.name,
      boardCols: cfg.boardCols,
      boardRows: cfg.boardRows,
      stepLimit: cfg.stepLimit,
      passTarget: cfg.passTarget,
      obstacles: cfg.obstacles ?? null,
      items: cfg.items,
    };
  }

  /**
   * 上报一次会话。
   *
   * 注意：**解锁逻辑不在这里**。关卡解锁由 ProgressStore 统一负责
   * （它是唯一数据源，且按「同模式下一关」解锁，不会跨模式跳跃）。
   * 这里只保留「后端会收到什么」的模拟，避免两份解锁规则互相打架。
   */
  async reportSession(report: SessionReport): Promise<{ ok: boolean }> {
    mockSessions.push(report);
    if (report.passed && !mockProgress.completedLevels.includes(report.levelId)) {
      mockProgress.completedLevels.push(report.levelId);
    }
    if (DEBUG) console.log("[MockApi] Session reported:", report.levelId, "passed:", report.passed);
    return { ok: true };
  }

  async getProgress(userId: string): Promise<ProgressDTO> {
    return { ...mockProgress };
  }

  async getRadar(userId: string): Promise<RadarData> {
    // 模拟数据：基于已完成会话计算各维度分数
    const axes = RADAR_AXES.map(axis => {
      const modeSessions = mockSessions.filter(s => {
        const cfg = ALL_LEVELS.find(l => l.id === s.levelId);
        return cfg?.mode === axis.mode;
      });
      if (modeSessions.length === 0) {
        return { label: axis.label, value: 0 };
      }
      const avgAccuracy = modeSessions.reduce((sum, s) => sum + s.accuracy, 0) / modeSessions.length;
      return { label: axis.label, value: Math.round(avgAccuracy * 100) };
    });
    return { axes };
  }

  async reportHearingScreen(result: HearingScreenResult): Promise<{ ok: boolean }> {
    mockHearingPassed = result.passed;
    mockProgress.hearingScreenPassed = result.passed;
    if (DEBUG) console.log("[MockApi] Hearing screen:", result.passed);
    return { ok: true };
  }

  async getCognitiveMap(): Promise<CognitiveMapDTO[]> {
    return COGNITIVE_MAP.map(m => ({
      mode: m.mode,
      modeName: m.modeName,
      constructs: m.constructs,
      referenceTests: m.referenceTests,
      proxyMetrics: m.proxyMetrics,
    }));
  }

  // 真实 Vendure 客户端（仅在配置了有效 apiUrl 时实例化，否则保持 null → 走 mock）
  private vendure: VendureClient | null = null;
  private getVendure(): VendureClient | null {
    if (!ENV.vendureEnabled) return null;
    if (!this.vendure) {
      this.vendure = new VendureClient(
        ENV.vendureApiUrl,
        ENV.vendureStorefrontUrl,
        ENV.vendureChannelToken || undefined,
      );
    }
    return this.vendure;
  }

  async getProducts(): Promise<ShopProduct[]> {
    const vc = this.getVendure();
    if (vc) {
      try {
        const real = await vc.fetchProducts();
        if (real.length) return real;
        if (DEBUG) console.warn("[MockApi] Vendure returned 0 products, fallback to mock");
      } catch (e) {
        if (DEBUG) console.warn("[MockApi] Vendure products failed, fallback to mock:", e);
      }
    }
    await new Promise((r) => setTimeout(r, 120));
    return [...SHOP_PRODUCTS, ...SHOP_ITEM_PACKS, ...SHOP_SKIN_PRODUCTS].map((p) => ({ ...p }));
  }

  async getPromotions(): Promise<ShopPromotion[]> {
    const vc = this.getVendure();
    if (vc) {
      try {
        const real = await vc.fetchPromotions();
        if (real.length) return real;
        if (DEBUG) console.warn("[MockApi] Vendure returned 0 promotions, fallback to mock");
      } catch (e) {
        if (DEBUG) console.warn("[MockApi] Vendure promotions failed, fallback to mock:", e);
      }
    }
    await new Promise((r) => setTimeout(r, 120));
    return SHOP_PROMOTIONS.map((p) => ({ ...p }));
  }

  // 供 AdaptiveEngine 调用
  getRecentSessions(levelId: string, count: number): SessionReport[] {
    return mockSessions.filter(s => s.levelId === levelId).slice(-count);
  }

  addAdaptiveSuggestion(s: AdaptiveSuggestion): void {
    mockProgress.adaptiveSuggestions.push(s);
  }

  isHearingPassed(): boolean {
    return mockHearingPassed;
  }
}

export const api = new MockApi();
