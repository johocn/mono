/**
 * Vendure GraphQL 客户端 — 真实商品 / 促销数据源
 *
 * 负责把 Vendure 的 Shop API 查询结果映射为前端契约（ShopProduct / ShopPromotion）。
 * 网络或 schema 异常时由调用方（MockApi）兜底回退本地 mock，保证演示不崩。
 *
 * CORS：Vendure 默认允许跨域（可在 Admin → Settings → API 配置）。若部署到独立域名，
 * 需确保 Vendure 的 CORS 白名单包含本游戏域名。
 */

import type { ShopProduct, ShopPromotion } from "./types";

/** Vendure shop-api 商品节点（按可用字段裁剪） */
interface VendureProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  featuredAsset?: { preview: string } | null;
  collections?: { items: { id: string; name: string; slug: string }[] } | null;
  customFields?: { itemGrants?: string; skinId?: string } | null;
  variants: { id: string; price: number; priceWithTax: number; currencyCode: string }[];
}

/** Vendure collection（用作「活动专区 / 促销」来源，依赖自定义字段） */
interface VendureCollection {
  id: string;
  name: string;
  slug: string;
  customFields?: {
    discountPercent?: number;
    endsAt?: string;
    code?: string;
  } | null;
}

const PRODUCTS_QUERY = `
query BrainGardenProducts($take: Int!) {
  products(options: { take: $take }) {
    items {
      id
      name
      slug
      description
      featuredAsset { preview }
      collections { items { id name slug } }
      customFields { itemGrants skinId }
      variants { id price priceWithTax currencyCode }
    }
    totalItems
  }
}`;

const COLLECTIONS_QUERY = `
query BrainGardenCollections {
  collections {
    items {
      id
      name
      slug
      customFields { discountPercent endsAt code }
    }
  }
}`;

/** 按商品名 / 分类关键词匹配 emoji（Vendure 无 emoji 字段，做最佳努力映射） */
function emojiFor(name: string, category: string): string {
  const text = `${name}${category}`;
  const map: [RegExp, string][] = [
    [/鱼油|omega|dha/i, "🐟"],
    [/银杏|胶囊|维|补|营养|保健/i, "💊"],
    [/茶|养生|饮品/i, "🍵"],
    [/卡|训练|认知|图卡|字帖|描红/i, "🃏"],
    [/坐垫|护腰|护具|枕/i, "🪑"],
    [/耳机|助听|听|声音/i, "🎧"],
    [/手环|手表|定位|防走失|安全/i, "⌚"],
    [/花|诗|文|文化/i, "📜"],
  ];
  for (const [re, emoji] of map) if (re.test(text)) return emoji;
  return "🛍️";
}

function truncate(text: string, max: number): string {
  const clean = (text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export class VendureClient {
  constructor(
    private readonly endpoint: string,
    private readonly storefrontUrl: string,
    private readonly channelToken?: string,
  ) {}

  /** 执行一次 GraphQL 请求，统一处理 HTTP / GraphQL 错误。 */
  private async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.channelToken) headers["Authorization"] = `Bearer ${this.channelToken}`;
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`[Vendure] HTTP ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors && json.errors.length) throw new Error(`[Vendure] ${json.errors[0].message}`);
    if (!json.data) throw new Error("[Vendure] empty data");
    return json.data;
  }

  /** 拉取商品并映射为 ShopProduct。 */
  async fetchProducts(limit = 20): Promise<ShopProduct[]> {
    const data = await this.gql<{ products: { items: VendureProduct[]; totalItems: number } }>(
      PRODUCTS_QUERY,
      { take: limit },
    );
    return data.products.items.map((p) => this.mapProduct(p));
  }

  private mapProduct(p: VendureProduct): ShopProduct {
    const variant = p.variants?.[0];
    const priceCents = variant ? variant.priceWithTax ?? variant.price : 0;
    const category = p.collections?.items?.[0]?.name || "健康好物";
    const slug = p.slug || p.id;

    // 道具礼包识别：collection 名为「道具」或存在 itemGrants 自定义字段
    const isPackCat = /道具|道具礼包|item\s*pack|itempack/i.test(category);
    let grants: ShopProduct["grants"];
    if (p.customFields?.itemGrants) {
      try {
        const parsed = JSON.parse(p.customFields.itemGrants) as Record<string, number>;
        grants = parsed as ShopProduct["grants"];
      } catch {
        grants = undefined;
      }
    }
    const isPack = isPackCat || !!grants;

    // 皮肤识别：collection 名为「皮肤」或存在 skinId 自定义字段
    const isSkinCat = /皮肤|skin/i.test(category);
    const skinId = p.customFields?.skinId;
    const isSkin = !isPack && (isSkinCat || !!skinId);

    const emoji = isSkin ? "🎨" : (isPack ? "🎁" : emojiFor(p.name, category));
    const outCategory = isSkin ? "皮肤" : (isPack ? "道具" : category);
    const blurb = isSkin
      ? (p.description ? truncate(p.description, 24) : "购买后可在换装花园使用")
      : isPack
        ? (p.description ? truncate(p.description, 24) : "购买后道具发放到背包")
        : truncate(p.description, 24);

    return {
      id: p.id,
      name: p.name,
      emoji,
      category: outCategory,
      priceCents,
      // 真实原价需后端促销字段；无则同价（前端不显示划线）。促销价由 collection 映射提供。
      originalCents: priceCents,
      promoTag: undefined,
      vendureUrl: `${this.storefrontUrl}/product/${slug}`,
      recommendModes: undefined, // 道具礼包与皮肤均不进推荐
      blurb,
      grants,
      skinId: isSkin ? (skinId || p.id) : undefined,
    };
  }

  /**
   * 拉取促销（按 Vendure collection + 自定义字段映射）。
   * 真实促销依赖 collection 自定义字段 discountPercent / endsAt / code；
   * 未配置自定义字段时该 query 会失败 → 调用方回退 mock 促销。
   */
  async fetchPromotions(): Promise<ShopPromotion[]> {
    const data = await this.gql<{ collections: { items: VendureCollection[] } }>(COLLECTIONS_QUERY);
    const now = Date.now();
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    return data.collections.items
      .filter((c) => c.customFields && (c.customFields.discountPercent || c.customFields.code))
      .map((c) => ({
        id: `vendure_${c.id}`,
        title: c.name,
        subtitle: c.customFields?.code ? `优惠码 ${c.customFields.code}` : "限时活动专区",
        code: c.customFields?.code || "",
        discountPercent: c.customFields?.discountPercent || 0,
        endsAt: c.customFields?.endsAt ? new Date(c.customFields.endsAt).getTime() : now + WEEK,
        productIds: [], // 真实关联由商品卡按 category 展示，无需显式罗列
      }));
  }
}
