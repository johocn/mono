/**
 * 锤子库存（开局带入 booster 的跨关持久化）
 *
 * 与 ProgressStore 的常规道具背包分开：锤子走「开局带入」浮层，
 * 数量单独持久化，避免与关内即时消费的 per-level 锤子混淆。
 */

const HAMMER_KEY = "xxl.boosters.hammer";

export function getHammerInv(): number {
  try {
    const v = parseInt(localStorage.getItem(HAMMER_KEY) || "0", 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function addHammerInv(n: number): void {
  if (n <= 0) return;
  try {
    localStorage.setItem(HAMMER_KEY, String(getHammerInv() + Math.floor(n)));
  } catch {
    /* localStorage 不可用时忽略，不影响游玩 */
  }
}

/** 扣减 n 把锤子库存；不足则扣到 0 并返回 false */
export function spendHammerInv(n: number): boolean {
  const cur = getHammerInv();
  if (cur < n) {
    if (cur > 0) try { localStorage.setItem(HAMMER_KEY, "0"); } catch { /* 忽略 */ }
    return false;
  }
  try {
    localStorage.setItem(HAMMER_KEY, String(cur - n));
  } catch {
    /* 忽略 */
  }
  return true;
}
