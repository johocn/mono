/**
 * 广告宣传版（M21）· 方案解析（级联回退，绝不抛错）
 *
 * 优先级（高 → 低）：
 *   1. URL `?plan=<id>`（预览用，**不落库**）；
 *   2. `localStorage['mono.adPlan']`（后台 / e2e 切换的落点，`persistPlan` 写入）；
 *   3. 远端配置 hook `./config/ad-plan.json`（`{"plan":"<id>"}`）——**商户后台管理系统的
 *      配置出口**：本期后台 UI 未建，后台直接写该文件（或后续替换为接口）即完成选型；
 *   4. 默认 `showcase`（方案 A）。
 * 任何一级取到非法 id 都静默跳过继续下探（与 shop-config 同规的宽入严出）。
 */
import { isAdPlanId, type AdPlanId } from './types';

const STORAGE_KEY = 'mono.adPlan';
export const AD_PLAN_REMOTE_URL = './config/ad-plan.json';

/** 纯函数核心（便于单测）：url / 存储值 / 远端三路 + 默认 */
export function resolveAdPlanId(
  urlPlan: string | null, stored: string | null, remote: AdPlanId | null,
): AdPlanId {
  if (isAdPlanId(urlPlan)) return urlPlan;
  if (isAdPlanId(stored)) return stored;
  if (remote) return remote;
  return 'showcase';
}

/** 持久化切换（后台 / e2e 落点）；隐私模式静默降级 */
export function persistPlan(id: AdPlanId): void {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* 忽略 */ }
}

function storedPlan(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

/** 远端后台配置 hook：缺失 / 404 / 坏 JSON / 非法 id → null（继续下探） */
async function remotePlan(): Promise<AdPlanId | null> {
  try {
    const res = await fetch(AD_PLAN_REMOTE_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    const raw = (await res.json()) as { plan?: unknown };
    return isAdPlanId(raw?.plan) ? raw.plan : null;
  } catch {
    return null;
  }
}

/** boot 期解析：`?ad=1` 激活广告版后调用一次 */
export async function resolveAdPlan(search: string = location.search): Promise<AdPlanId> {
  const urlPlan = new URLSearchParams(search).get('plan');
  return resolveAdPlanId(urlPlan, storedPlan(), await remotePlan());
}
