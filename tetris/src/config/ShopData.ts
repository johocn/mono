/**
 * 商店数据 — 道具礼包 / 优惠券 / 皮肤（怀旧典藏）
 * 与消消乐 ShopProduct 契约一致；grants 描述购买后发放到背包的道具。
 */

import type { ShopProduct, ShopPromotion } from "../api/types";

export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: "pack-helper",
    name: "适老辅助礼包",
    emoji: "🧰",
    category: "道具",
    priceCents: 600,
    originalCents: 1200,
    promoTag: "超值",
    vendureUrl: "",
    blurb: "慢放×3、撤回×3、炸弹×2、护盾×2，通关更轻松",
    grants: { slow: 3, undo: 3, bomb: 2, shield: 2 },
  },
  {
    id: "pack-big",
    name: "畅玩大礼包",
    emoji: "🎉",
    category: "道具",
    priceCents: 1200,
    originalCents: 2400,
    promoTag: "人气",
    vendureUrl: "",
    blurb: "慢放×6、撤回×6、炸弹×4、变形×4、护盾×4",
    grants: { slow: 6, undo: 6, bomb: 4, swap: 4, shield: 4 },
  },
  {
    id: "pack-coupon",
    name: "好物优惠券",
    emoji: "🎟️",
    category: "优惠券",
    priceCents: 0,
    originalCents: 0,
    promoTag: "免费领",
    vendureUrl: "",
    blurb: "下单脑力花园周边立减，分享或看广告可得更多",
    grants: { coupon: 1 },
  },
  {
    id: "skin-retro",
    name: "复古像素皮肤",
    emoji: "🕹️",
    category: "皮肤",
    priceCents: 800,
    originalCents: 800,
    vendureUrl: "",
    blurb: "红白机怀旧配色，经典绿底方块",
    skinId: "retro",
    pricePoints: 30,
  },
  {
    id: "skin-nostalgia",
    name: "怀旧绿皮肤",
    emoji: "🌿",
    category: "皮肤",
    priceCents: 800,
    originalCents: 800,
    vendureUrl: "",
    blurb: "护眼暖绿主题，长时间游玩不刺眼",
    skinId: "nostalgia",
    pricePoints: 30,
  },
  {
    id: "skin-warm",
    name: "暖纸护眼皮肤",
    emoji: "📜",
    category: "皮肤",
    priceCents: 0,
    originalCents: 0,
    promoTag: "赠送",
    vendureUrl: "",
    blurb: "浅色暖纸主题，夜间更柔和",
    skinId: "warm",
  },
];

export const SHOP_PROMOTIONS: ShopPromotion[] = [
  {
    id: "promo-tetris-2026",
    title: "新年版限时折扣",
    subtitle: "道具礼包 5 折，仅 7 天",
    code: "TETRIS2026",
    discountPercent: 50,
    endsAt: Date.now() + 7 * 86400000,
    productIds: ["pack-helper", "pack-big"],
  },
];

export function getShopProducts(): ShopProduct[] { return SHOP_PRODUCTS; }
export function getShopPromotions(): ShopPromotion[] { return SHOP_PROMOTIONS; }
