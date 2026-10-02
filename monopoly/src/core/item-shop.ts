/**
 * 道具商店纯函数（M20.3 spec §5.2）：售价查询与回收价折算。
 *
 * 与 `data/item-shop.ts` 的分工：数据层是「表」（有哪些货、卖多少钱），本层是「算法」（查表、折算）。
 * 纯函数、零副作用、零随机，可被 core / ui / AI 三处共用同一口径。
 */
import { STORE_CATALOG, STORE_MARKUP } from '../data/item-shop';

/**
 * 回收价：售价 × 50% 向下取整（spec §5.2）。
 * 用 `floor` 而非四舍五入：奇数售价（如 150 → 75、250 → 125）恒取低档，避免「买卖套利」。
 */
export function resaleOf(price: number): number {
  return Math.floor(price * STORE_MARKUP);
}

/**
 * 道具售价（未收录的 kind → `undefined`）。
 * 入参取 `string` 而非 `ItemCardKind`：调用方来自 DOM `data-target`（运行时字符串），
 * 需要在边界做「非法值 → undefined」的兜底判断，故不收窄类型。
 */
export function priceOf(kind: string): number | undefined {
  return STORE_CATALOG.find((p) => p.kind === kind)?.price;
}
