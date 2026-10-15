/**
 * 广告宣传版（M21）· 方案注册表（切换架构的唯一定点）
 *
 * 新增方案 = 新建 `plans/<id>.ts` + 在此注册一行；核心业务逻辑零改动。
 * B–E（旗舰展厅 / 霓虹广告牌 / 剧场舞台 / 商圈图录）为占位：选中未实现方案时
 * `adPlanConfigOf` 回退方案 A 并 console.warn 告知（不抛错、不白屏）。
 */
import { SHOWCASE_PLAN } from './showcase';
import { AD_PLAN_IDS, type AdPlanConfig, type AdPlanId } from '../types';

/** 五案全保留：已实现的指向配置，未实现的为 null 占位（后台可见可选） */
export const PLANS: Record<AdPlanId, AdPlanConfig | null> = {
  showcase: SHOWCASE_PLAN,
  flagship: null,     // 方案 B · 旗舰展厅（待实现）
  billboard: null,    // 方案 C · 霓虹广告牌（待实现）
  theater: null,      // 方案 D · 剧场舞台（待实现）
  catalog: null,      // 方案 E · 商圈图录（待实现）
};

/** 后台方案清单（id + 名称，供后续管理界面枚举） */
export function adPlanCatalog(): Array<{ id: AdPlanId; name: string; ready: boolean }> {
  return AD_PLAN_IDS.map((id) => ({
    id,
    name: PLANS[id]?.name ?? '',
    ready: PLANS[id] !== null,
  }));
}

/** 取方案配置：未实现 / 未知 id 一律回退方案 A 并告警（宽入严出，不抛错） */
export function adPlanConfigOf(id: AdPlanId): AdPlanConfig {
  const cfg = PLANS[id];
  if (cfg) return cfg;
  console.warn(`[ad] 方案「${id}」尚未实现，回退 showcase（方案 A）`);
  return SHOWCASE_PLAN;
}
