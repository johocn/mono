/**
 * NestJS 后端接口契约 — spec v1.1 第 9 节
 * MVP 阶段以模拟数据实现同一接口
 */

export interface LevelConfigDTO {
  id: string;
  mode: string;
  name: string;
  boardCols: number;
  boardRows: number;
  stepLimit: number;
  passTarget: number;
  obstacles: unknown;
  items: unknown;
}

export interface SessionReport {
  levelId: string;
  mode: string;
  operations: OperationRecord[];
  accuracy: number;
  avgReactionTime: number;
  stepEfficiency: number;
  passed: boolean;
  score: number;
  duration: number; // 秒
}

export interface OperationRecord {
  type: string;
  correct: boolean;
  reactionTime: number; // 毫秒
  timestamp: number;
}

export interface ProgressDTO {
  userId: string;
  completedLevels: string[];
  unlockedLevels: string[];
  adaptiveSuggestions: AdaptiveSuggestion[];
  hearingScreenPassed: boolean;
  reducedMotion: boolean;
}

export interface AdaptiveSuggestion {
  levelId: string;
  stepAdjust: number;
  contentAdjust: number;
  reason: string;
}

export interface RadarData {
  axes: { label: string; value: number }[];
}

export interface HearingScreenResult {
  passed: boolean;
  responses: { freq: number; heard: boolean }[];
}

export interface CognitiveMapDTO {
  mode: string;
  modeName: string;
  constructs: string[];
  referenceTests: string[];
  proxyMetrics: string[];
}

// === 商业化：商品 / 营销 ===

/** 道具种类（与 ProgressStore 背包键 / ItemConfig 完全一致） */
export type ItemKind = "hint" | "reshuffle" | "reveal" | "peek" | "undo" | "rehear" | "step" | "shield" | "hammer";

/** vendure 风格商品（前端契约，可直接由 Vendure product 查询结果填充） */
export interface ShopProduct {
  id: string;
  name: string;
  emoji: string;
  category: string;
  priceCents: number;
  originalCents: number;
  promoTag?: string;
  vendureUrl: string;
  recommendModes?: string[];
  blurb: string;
  /**
   * 若该商品是「皮肤」，skinId 指向皮肤唯一 id（对应 SkinConfig.id 或官方预设 id）。
   * 人民币购买后按此解锁并应用；与 grants 互斥（道具礼包用 grants，皮肤用 skinId）。
   */
  skinId?: string;
  /**
   * 若该商品是「道具礼包」，grants 描述购买后发放到游戏背包的道具及数量。
   * 这是 Vendure 出售道具的核心契约：前端按此发放（演示）/ 后端按此发货（真实）。
   */
  grants?: Partial<Record<ItemKind, number>>;
}

/** 促销活动（限时折扣 / 优惠券） */
export interface ShopPromotion {
  id: string;
  title: string;
  subtitle: string;
  code: string;
  discountPercent: number;
  endsAt: number;       // 截止时间戳（毫秒）
  productIds: string[];
}

// === API 接口定义 ===
export interface IBrainGardenApi {
  getLevel(mode: string, level: string): Promise<LevelConfigDTO>;
  reportSession(report: SessionReport): Promise<{ ok: boolean }>;
  getProgress(userId: string): Promise<ProgressDTO>;
  getRadar(userId: string): Promise<RadarData>;
  reportHearingScreen(result: HearingScreenResult): Promise<{ ok: boolean }>;
  getCognitiveMap(): Promise<CognitiveMapDTO[]>;
  getProducts(): Promise<ShopProduct[]>;
  getPromotions(): Promise<ShopPromotion[]>;
}
