/**
 * 广告宣传版（M21）· 方案类型定义
 *
 * 五套方案（A 橱窗商城 / B 旗舰展厅 / C 霓虹广告牌 / D 剧场舞台 / E 商圈图录）全部保留为
 * 可选配置，最终采用哪套由商户在后台管理系统中配置选择（本期落地远端 hook：
 * `public/config/ad-plan.json`，见 `resolve.ts`）。本期只完整实现方案 A（showcase）。
 *
 * 切换架构铁律：新增 / 切换方案 **只换配置文件**——
 *   1. 新建 `plans/<id>.ts` 导出一个 `AdPlanConfig`；
 *   2. 在 `plans/registry.ts` 注册一行；
 *   3. 核心业务逻辑（main.ts / core / 渲染层）零改动。
 */
import type { TileTier } from '../data/board';

/** 五套方案的稳定 id（后台配置 / URL / localStorage 共用同一份字面量） */
export type AdPlanId = 'showcase' | 'flagship' | 'billboard' | 'theater' | 'catalog';

export const AD_PLAN_IDS: readonly AdPlanId[] = [
  'showcase', 'flagship', 'billboard', 'theater', 'catalog',
];

export function isAdPlanId(v: unknown): v is AdPlanId {
  return typeof v === 'string' && (AD_PLAN_IDS as readonly string[]).includes(v);
}

/** 配色 token 键（唯一真源见 `tokens.ts`；方案级只允许 Partial 覆盖） */
export type AdTokenKey =
  | 'bg' | 'bgDeep' | 'gold' | 'brown' | 'tan' | 'brick'
  | 'card' | 'cardEdge' | 'accent'
  | 'text' | 'textDim' | 'onGold' | 'onAccent'
  | 'shadow' | 'heroA' | 'heroB' | 'canvasBg';

/** hero / 占位卡的底色档（全部映射回公共 token，不允许方案内私造色值） */
export type AdTone = 'gold' | 'brick' | 'tan' | 'plain';

/** 广告区顶部轮播的一条内容（img 缺省 = token 渐变占位，接素材后填相对/绝对路径） */
export interface AdHeroItem {
  title: string;
  sub?: string;
  img?: string;
  tone?: AdTone;
}

/** 商圈 Tab：`tier: null` = 全部；其余按棋盘商圈分档过滤商品卡 */
export interface AdTabItem {
  id: string;
  label: string;
  tier: TileTier | null;
}

/** `shops.json` 为空（商家未认领）时的占位商品卡（showcase 方案从棋盘地块动态生成） */
export interface AdDemoProduct {
  slot: number;
  title: string;
  sub: string;
  tag?: string;
  tone?: AdTone;
}

/** 一套广告方案的完整配置（配色 100% 走公共 token；布局数值引用 `adLayout.ts` 常量） */
export interface AdPlanConfig {
  id: AdPlanId;
  /** 后台展示名 */
  name: string;
  desc: string;
  /** canvas 层（迷你棋盘）调色板 = `public/config/theme.json` 的 palette id（配置化，非硬编码） */
  palette: string;
  /** canvas 舞台底色取公共 token 的哪个键 */
  canvasBgKey: AdTokenKey;
  /** 方案级配色覆盖（缺省键回落全局默认；切换时全量重注 → 无残留） */
  theme?: Partial<Record<AdTokenKey, string>>;
  /** 广告区分段高度（引用 `adLayout.ts`，保持唯一来源） */
  layout: { heroH: number; tabH: number; zoneH: number };
  hero: AdHeroItem[];
  tabs: AdTabItem[];
  demo: AdDemoProduct[];
}
