/**
 * Purchase — 统一的道具礼包购买 / 发放 helper
 *
 * 职责：抽离原先散落在 ShopScene 的「演示直发 vs 真实 Vendure 跳转」判定，
 * 供商城、关卡内弹窗（失败救援 / 步数告急 / 关内特价）、结算分享复用。
 *
 * 设计要点（与现有商业化一致）：
 * - 演示 / 无真实后端：按 `grants` 直接发放到背包（模拟已完成支付）。
 * - 真实 Vendure：打开商品页，由后端按 `grants` 合同发货（客户端无法验单）。
 * - 不负责 toast / 音效，由调用方决定反馈（保证各场景适老化体验一致）。
 */

import { ENV } from "./Env";
import { progress } from "./ProgressStore";
import type { ShopProduct, ItemKind } from "../api/types";
import type { ItemConfig } from "../config/LevelConfig";

/** 道具中文名（与 HUD / ShopScene 展示一致） */
export const ITEM_NAME: Record<ItemKind, string> = {
  hint: "提示", reshuffle: "重洗", reveal: "揭示", peek: "偷看",
  undo: "撤销", rehear: "重听", step: "补步", shield: "护盾", hammer: "锤子",
};

/** 演示用占位域名：命中则视为未接入真实后端，走本地直接发放 */
export const PLACEHOLDER_RE = /braingarden\.example/;

export interface BuyResult {
  /** 是否跳转了真实 Vendure 商品页（true 表示需后端发货，未本地发放） */
  openedReal: boolean;
  /** 演示模式下本地发放的道具文案，如 ["提示×3","撤销×2"] */
  grantedParts: string[];
}

/**
 * 统一购买 / 发放。
 * @returns 调用方据此决定 toast / 音效 / 后续动作（如续命）。
 */
export function buyPack(p: ShopProduct): BuyResult {
  const url = p.vendureUrl || "";
  const realVendure = ENV.vendureEnabled && !PLACEHOLDER_RE.test(url);
  if (realVendure) {
    try { window.open(url, "_blank", "noopener"); } catch { /* 忽略 */ }
    return { openedReal: true, grantedParts: [] };
  }

  // 演示 / 无真实后端：直接按 grants 发放（模拟已完成支付）
  const grantedParts: string[] = [];
  if (p.grants) {
    for (const k of Object.keys(p.grants) as ItemKind[]) {
      const n = p.grants[k] ?? 0;
      if (n <= 0) continue;
      progress.addItem(k, n);
      grantedParts.push(`${ITEM_NAME[k]}×${n}`);
    }
  }
  return { openedReal: false, grantedParts };
}

/** 把 grants 转成展示用文案（"提示×3  撤销×2"），供弹窗展示内容明细 */
export function describeGrants(p: ShopProduct): string {
  const grants = p.grants ?? {};
  return (Object.keys(grants) as ItemKind[])
    .filter((k) => (grants[k] ?? 0) > 0)
    .map((k) => `${ITEM_NAME[k]}×${grants[k]}`)
    .join("  ") || "（空）";
}

/** 道具种类是否合法（供断言 / 调试） */
export function isItemKind(k: string): k is keyof ItemConfig {
  return k in (progress.getInventory() as Record<string, number>);
}
