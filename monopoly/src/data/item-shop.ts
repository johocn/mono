/**
 * 道具商店数据真源（M20.3 spec §5.2）：售价表 + 回收价系数。
 *
 * 与 `cards.ts` 的分工：`ITEM_CARDS` 是**道具本身**（名称 / 用途 / 目标类型 / 常用度），
 * 本文件只描述**买卖口径**（多少钱买、多少钱回收），两者以 `kind` 关联。
 * 目录顺序恒等 `priority` 升序（与手牌排序同序），使「手牌第 1 张 = 商店第 1 行」，降低认知成本。
 *
 * 确定性：库存无限、价格恒定，不引入任何随机源。
 */
import type { ItemCardKind } from './cards';

export interface StoreProduct {
  kind: ItemCardKind;
  /** 商店售价（买入价，单位 ￥） */
  price: number;
}

/** 回收价系数：卖出价 = `floor(售价 × STORE_MARKUP)`（spec §5.2） */
export const STORE_MARKUP = 0.5;

/** 商店目录（按 `priority` 升序：免罚 10 → 避税 15 → 翻倍 20 → 补贴 25 → 炸弹 30 → 路障 40 → 迁点 50 → 造势 55 → 拆迁令 60 → 涨跌卡 70 → 红利卡 80） */
export const STORE_CATALOG: StoreProduct[] = [
  { kind: 'pardon', price: 250 },
  { kind: 'taxShield', price: 350 },
  { kind: 'doubleRent', price: 250 },
  { kind: 'subsidy', price: 400 },
  { kind: 'bomb', price: 300 },
  { kind: 'barrier', price: 150 },
  { kind: 'teleport', price: 200 },
  { kind: 'boom', price: 500 },
  { kind: 'demolish', price: 500 },
  /* —— M20.3-B 股票轨（spec §4.1）：售价与「红利卡每股 ￥20 / 折现 ￥100」的收益量级自洽 —— */
  { kind: 'bullBear', price: 400 },
  { kind: 'dividend', price: 300 },
];
