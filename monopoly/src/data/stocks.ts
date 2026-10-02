/**
 * 股票最小可用盘（spec §5.5 / §12-4）：4 支「双阳概念股」演示盘。
 * `vol` = 单回合涨跌幅度上限（比例）；价格取整到 ￥。数值模型先定死一个可测的随机游走，
 * 详见 `src/core/stocks.ts`。
 */
export interface StockDef {
  code: string;
  name: string;
  price0: number;
  vol: number;
}

export const STOCKS: StockDef[] = [
  { code: 'SY01', name: '鹿业股份', price0: 120, vol: 0.12 },
  { code: 'SY02', name: '温泉文旅', price0: 80, vol: 0.15 },
  { code: 'SY03', name: '山泉饮品', price0: 60, vol: 0.10 },
  { code: 'SY04', name: '有机农业', price0: 40, vol: 0.18 },
];

/** 演示期免手续费（留口子，不改代码即可调） */
export const STOCK_FEE_RATIO = 0;
/** 最小交易单位（整股） */
export const SHARE_LOT = 1;
/** 股票交易所地块（`board.ts` TILE_TYPES[19] = 'stock'`） */
export const STOCK_TILE_INDEX = 19;

/* —— M20.3-B 股票轨：数量档 / 杠杆 / 分红（spec §4.2）—— */

/** 底部「买 / 卖」前两档的手数（第三档为「全仓」`'all'`，按可用资金或持股数推导） */
export const LOT_TIERS = [1, SHARE_LOT * 5] as const;
/** 数量档：具体股数（正整数）或 `'all'`（全仓，按买入用现金 / 卖出用持股推导） */
export type LotTier = number | 'all';
/** 涨跌卡出牌参数（UI 语义方向）；落库时映射为 `StockForce.dir`（`'up' → 1` / `'down' → -1`） */
export interface StockPlay {
  code: string;
  dir: 'up' | 'down';
}
/** 杠杆档位：仅 `round >= MARGIN_UNLOCK_ROUND` 时可选，且只作用于新买入（B-D4） */
export const LEVERAGES = [2, 3] as const;
/** 杠杆解锁轮次（客户口径「第 8 轮起」，B-D9） */
export const MARGIN_UNLOCK_ROUND = 8;
/** 保证金借入每轮复利利率（沿用信用贷款 6%，B-D8） */
export const MARGIN_RATE = 0.06;
/** 爆仓线：持仓市值 < 借入本金 × 该系数 → 强制平仓还债（D31） */
export const LIQUIDATION_RATIO = 1.2;
/** M20.5：市值 / 借款 低于此比例即触发**爆仓警示**（提示早于强平线 `LIQUIDATION_RATIO`，D40） */
export const MARGIN_WARN_RATIO = 1.5;
/** 红利卡：每股分红（B-D7） */
export const DIVIDEND_PER_SHARE = 20;
/** 红利卡：无持仓时的折现额（B-D7） */
export const DIVIDEND_REFUND = 100;