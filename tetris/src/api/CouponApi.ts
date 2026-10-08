/**
 * CouponApi — 带货导流发券（接 zhao-deal，失败静默降级）
 * 真实端点按后端实现微调；此处为「努力一次 + 失败不计较」的健壮封装，
 * 绝不影响游戏流程（无论发券是否成功，前端都已在背包发放本地券）。
 */

import { ENV } from "../core/Env";

export interface CouponClaimResult {
  ok: boolean;
  local: boolean;
  message: string;
}

/**
 * 领取/核销优惠券。优先尝试后端，失败或后端未配置时回退为「本地券」。
 * @param code 优惠券码（如页面活动码），可空
 */
export async function claimCoupon(code?: string): Promise<CouponClaimResult> {
  const base = ENV.marketingApiBase.replace(/\/+$/, "");
  if (!base) {
    return { ok: true, local: true, message: "本地优惠券已入账（未配置后端）" };
  }
  try {
    const res = await fetch(`${base}/api/zhao-deal/v1/coupons/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code ?? "", source: "tetris" }),
    });
    if (res.ok) {
      return { ok: true, local: false, message: "优惠券已领取" };
    }
    return { ok: true, local: true, message: "本地优惠券已入账" };
  } catch {
    return { ok: true, local: true, message: "本地优惠券已入账（网络异常）" };
  }
}
