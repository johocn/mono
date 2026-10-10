/**
 * 商品数据 — vendure 风格商品 / 促销 mock
 *
 * 真实化路径：把 SHOP_PRODUCTS / SHOP_PROMOTIONS 的读取替换为 Vendure GraphQL 的
 * product / promotion 查询结果即可，前端结构（ShopProduct 契约）保持不变。
 *
 * 主题贴合「脑力花园 × 适老化健康好物」，让"训练 → 获得好物"形成正向闭环。
 */

import type { ShopProduct, ShopPromotion } from "../api/types";

/** 商品目录（emoji 作图标，避免引入图片资源） */
export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: "p1", name: "银杏健脑胶囊", emoji: "💊", category: "健脑营养",
    priceCents: 9900, originalCents: 13800, promoTag: "会员8折",
    vendureUrl: "https://shop.braingarden.example/products/ginkgo",
    recommendModes: ["match3", "poetry"],
    blurb: "改善记忆与专注，长辈日常养护",
  },
  {
    id: "p2", name: "深海鱼油软胶囊", emoji: "🐟", category: "健脑营养",
    priceCents: 12800, originalCents: 16800, promoTag: "限时直降",
    vendureUrl: "https://shop.braingarden.example/products/fishoil",
    recommendModes: ["match3", "audio"],
    blurb: "DHA 支持脑健康，温和不刺激",
  },
  {
    id: "p3", name: "记忆训练图卡", emoji: "🃏", category: "认知训练",
    priceCents: 5900, originalCents: 7900, promoTag: "训练搭档",
    vendureUrl: "https://shop.braingarden.example/products/memorycards",
    recommendModes: ["poetry", "match3"],
    blurb: "线下延伸训练，巩固课堂效果",
  },
  {
    id: "p4", name: "适老护腰坐垫", emoji: "🪑", category: "适老护具",
    priceCents: 15900, originalCents: 19900, promoTag: "久坐必备",
    vendureUrl: "https://shop.braingarden.example/products/cushion",
    recommendModes: ["match3", "audio", "poetry"],
    blurb: "记忆棉支撑，训练久坐也轻松",
  },
  {
    id: "p5", name: "养生桂圆红枣茶", emoji: "🍵", category: "养生茶饮",
    priceCents: 4900, originalCents: 6900, promoTag: "暖心特惠",
    vendureUrl: "https://shop.braingarden.example/products/teabox",
    recommendModes: ["poetry", "audio"],
    blurb: "温和养血，训练后一杯刚刚好",
  },
  {
    id: "p6", name: "助听辅听耳机", emoji: "🎧", category: "听觉辅助",
    priceCents: 29900, originalCents: 39900, promoTag: "听音专属",
    vendureUrl: "https://shop.braingarden.example/products/hearingaid",
    recommendModes: ["audio"],
    blurb: "适配听音辨位训练，清晰不啸叫",
  },
  {
    id: "p7", name: "智能防走失手环", emoji: "⌚", category: "安全守护",
    priceCents: 21900, originalCents: 26900, promoTag: "安心守护",
    vendureUrl: "https://shop.braingarden.example/products/band",
    recommendModes: ["match3", "audio", "poetry"],
    blurb: "定位 + 一键呼叫，家属更放心",
  },
  {
    id: "p8", name: "诗词描红字帖", emoji: "📜", category: "文化养生",
    priceCents: 3900, originalCents: 5900, promoTag: "文化好礼",
    vendureUrl: "https://shop.braingarden.example/products/copybook",
    recommendModes: ["poetry"],
    blurb: "手写诗词，静心又练脑",
  },
];

/**
 * 道具礼包（Vendure 在售的虚拟商品）— 购买后按 grants 发放到游戏背包。
 * mock 阶段价格为 0（演示直接发放）；真实 Vendure 由商品 variant 定价。
 * 真实接入时：把这些 pack 作为 Vendure product 上架，collection 归到「道具」，
 * 并用自定义字段 itemGrants 写入与下方一致的 JSON，VendureClient 会自动映射。
 */
export const SHOP_ITEM_PACKS: ShopProduct[] = [
  {
    id: "pack_starter", name: "新手训练包", emoji: "🎁", category: "道具",
    priceCents: 0, originalCents: 0,
    vendureUrl: "https://shop.braingarden.example/products/pack_starter",
    blurb: "入门三件套，轻松上手",
    grants: { hint: 3, undo: 2, reveal: 1 },
  },
  {
    id: "pack_match3", name: "消除助力包", emoji: "🧩", category: "道具",
    priceCents: 0, originalCents: 0,
    vendureUrl: "https://shop.braingarden.example/products/pack_match3",
    blurb: "消除卡关救星",
    grants: { reshuffle: 3, reveal: 2, hint: 1 },
  },
  {
    id: "pack_poetry", name: "诗词通关包", emoji: "📚", category: "道具",
    priceCents: 0, originalCents: 0,
    vendureUrl: "https://shop.braingarden.example/products/pack_poetry",
    blurb: "背诵不再难",
    grants: { peek: 3, reveal: 2, undo: 1 },
  },
  {
    id: "pack_audio", name: "听音畅听包", emoji: "🎧", category: "道具",
    priceCents: 0, originalCents: 0,
    vendureUrl: "https://shop.braingarden.example/products/pack_audio",
    blurb: "听音模式专属补给",
    grants: { rehear: 5 },
  },
  {
    id: "pack_fault", name: "容错补给包", emoji: "🛡️", category: "道具",
    priceCents: 0, originalCents: 0,
    vendureUrl: "https://shop.braingarden.example/products/pack_fault",
    blurb: "失误不怕，步数管够",
    grants: { step: 3, shield: 2 },
  },
  {
    id: "pack_revive", name: "限时复活包", emoji: "💥", category: "道具",
    priceCents: 0, originalCents: 0, promoTag: "复活专享",
    vendureUrl: "https://shop.braingarden.example/products/pack_revive",
    blurb: "步数耗尽？一键续命",
    grants: { step: 5, shield: 1 },
  },
  {
    id: "pack_firstcharge", name: "首充特惠包", emoji: "🌟", category: "道具",
    priceCents: 0, originalCents: 0, promoTag: "首充专享",
    vendureUrl: "https://shop.braingarden.example/products/pack_firstcharge",
    blurb: "新手第一份大礼",
    grants: { hint: 5, undo: 3, reveal: 3, shield: 2 },
  },
];

/** 按 id 取道具礼包（关卡内弹窗 / 复活 / 补给复用） */
export function getPackById(id: string): ShopProduct | undefined {
  return SHOP_ITEM_PACKS.find((p) => p.id === id);
}

/**
 * 皮肤商品（人民币出售的成品皮肤）。
 * 与道具礼包的区别：用 `skinId` 而非 `grants`——购买后按 skinId 解锁并应用对应皮肤。
 * 真实接入：Vendure 上架为 product，collection 归「皮肤」，自定义字段 skinId 写入对应值。
 */
export const SHOP_SKIN_PRODUCTS: ShopProduct[] = [
  {
    id: "skinprod_dawn", name: "晨曦花园", emoji: "🌅", category: "皮肤",
    priceCents: 600, originalCents: 1200, promoTag: "新品",
    vendureUrl: "https://shop.braingarden.example/products/skin_dawn",
    blurb: "暖阳配色，护眼更柔和",
    skinId: "official_dawn",
  },
  {
    id: "skinprod_abyss", name: "深海静夜", emoji: "🌊", category: "皮肤",
    priceCents: 600, originalCents: 1200,
    vendureUrl: "https://shop.braingarden.example/products/skin_abyss",
    blurb: "静夜深蓝，专注不刺眼",
    skinId: "official_abyss",
  },
];

/** 按 skinId 取皮肤商品（解锁后回查用） */
export function getSkinProductBySkinId(skinId: string): ShopProduct | undefined {
  return SHOP_SKIN_PRODUCTS.find((p) => p.skinId === skinId);
}

/** 促销活动（限时折扣 / 优惠券） */
export const SHOP_PROMOTIONS: ShopPromotion[] = [
  {
    id: "promo_daily", title: "脑力花园专享礼包", subtitle: "满 99 减 30 · 限时领取",
    code: "BRAIN30", discountPercent: 30,
    // 截止：3 天后（运行时计算，便于演示倒计时）
    endsAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
    productIds: ["p1", "p3", "p6"],
  },
  {
    id: "promo_member", title: "会员日·健脑营养专场", subtitle: "会员再享 8 折",
    code: "MEMBER20", discountPercent: 20,
    endsAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
    productIds: ["p1", "p2"],
  },
];

/** 按模式推荐商品（结算"为你推荐"用；道具礼包不进推荐，避免与商城购买路径重叠） */
export function recommendProductsFor(mode: string, limit = 2): ShopProduct[] {
  const goods = SHOP_PRODUCTS.filter((p) => !p.grants);
  const matched = goods.filter((p) => p.recommendModes?.includes(mode));
  if (matched.length >= limit) return matched.slice(0, limit);
  // 不足时从通用商品（无 recommendModes 或全模式）补齐
  const extra = goods.filter(
    (p) => !matched.includes(p) && (p.recommendModes === undefined || p.recommendModes.length === 0),
  );
  return [...matched, ...extra].slice(0, limit);
}

/** 取促销命中的商品 id 集合（用于商品卡标注折扣） */
export function promoProductIdSet(): Set<string> {
  const set = new Set<string>();
  for (const promo of SHOP_PROMOTIONS) {
    for (const id of promo.productIds) set.add(id);
  }
  return set;
}
