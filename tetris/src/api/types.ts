/**
 * 后端接口契约 — 商品 / 营销（与消消乐同源）
 */

/** 道具种类（与 ProgressStore 背包键 / ItemConfig 完全一致，含方块专属道具） */
export type ItemKind =
  | "hint" | "reshuffle" | "reveal" | "peek" | "undo" | "rehear"
  | "step" | "shield" | "hammer" | "slow" | "bomb" | "swap" | "coupon";

/** vendure 风格商品（前端契约，可直接由商品查询结果填充） */
export interface ShopProduct {
  id: string;
  name: string;
  emoji: string;
  category: string;
  priceCents: number;
  originalCents: number;
  promoTag?: string;
  vendureUrl: string;
  recommendModes?: string[];
  blurb: string;
  /** 若为「皮肤」，指向皮肤唯一 id */
  skinId?: string;
  /** 若为「皮肤」，兑换所需积分（与 SkinDef.pricePoints 对齐；非皮肤商品通常用 priceCents） */
  pricePoints?: number;
  /** 若为「道具礼包」，描述购买后发放到背包的道具及数量 */
  grants?: Partial<Record<ItemKind, number>>;
}

/** 促销活动（限时折扣 / 优惠券） */
export interface ShopPromotion {
  id: string;
  title: string;
  subtitle: string;
  code: string;
  discountPercent: number;
  endsAt: number;
  productIds: string[];
}
