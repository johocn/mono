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
/** 股票交易所地块（`board.ts` TILE_TYPES[19] = 'stock'） */
export const STOCK_TILE_INDEX = 19;