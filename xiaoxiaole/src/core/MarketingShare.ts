/**
 * MarketingShare — 消消乐分享裂变的 A/B 效果统计（接入 Strapi zhao-studio / zhao-track）
 *
 * 设计目标：按「发布渠道 / 发布位置 / 发布方式 / 发布文案」统计分享卡的点击率与转化。
 * 现有 Strapi 已具备：promo-channel（渠道/方式）、promo-campaign（活动）、
 * ab-experiment / ab-variant（按 weight 分流的文案变体）、zhao-track（来源标签 + 点击事件归因）。
 *
 * 本模块只负责「游戏端」闭环：
 *   1. 拉取当前生效的 A/B 文案变体（标题/描述/图片），注入微信转发卡片；
 *   2. 给分享链接打标（camp=活动code & v=变体id & st=来源标签），保证归因；
 *   3. 回传「曝光」（分享卡展示）与「打开」（好友点开链接）两类事件，驱动 zhao-track 报表。
 *
 * 依赖的 Strapi 接口（路径前缀为 <marketingApiBase>/api）：
 *   GET  /zhao-studio/v1/variants/pick?campaignId=<code>   公开：按权重返回一变体
 *   POST /zhao-track/v1/zhao-track/source/identify         公开：创建/更新来源标签
 *   POST /zhao-studio/v1/analytics/page-view               公开：页面曝光
 *   POST /zhao-track/v1/zhao-track/click                   公开：点击事件（归因到 abVariant）
 * 注：后两个接口的部分字段（abVariant / 放开 couponId）需 Strapi 侧配合改造，详见交付说明。
 */

import { ENV } from "./Env";
import { buildShareUrl } from "./SsoAuth";

const STORAGE_TAG_KEY = "bg_mkt_source_tag";

interface VariantCreative {
  variantId: string | null;
  title: string;
  desc: string;
  imgUrl: string;
}

function apiBase(): string {
  return (ENV.marketingApiBase || "").replace(/\/+$/, "");
}

function campaignCode(): string {
  // URL 上的 ?camp= 可临时覆盖默认活动，便于灰度/联调
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("camp");
    if (fromUrl) return fromUrl;
  } catch {
    /* ignore */
  }
  return ENV.marketingCampaignCode || "";
}

function uuid(): string {
  try {
    const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    /* ignore */
  }
  return "st_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

/** 浏览器级稳定来源标签（deviceFingerprint），跨会话复用，保证归因一致。 */
function getSourceTagId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_TAG_KEY);
    if (existing) return existing;
  } catch {
    /* ignore */
  }
  const id = uuid();
  try {
    localStorage.setItem(STORAGE_TAG_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

function defaultCreative(): VariantCreative {
  return {
    variantId: null,
    title: "岁月神偷：脑力花园",
    desc: "消消乐 · 认知训练小游戏，来挑战你的记忆力！",
    imgUrl: "https://game.yourbao.cn/tour/xxl/share.png",
  };
}

/** 给分享链接打标：camp（活动）+ v（变体）+ st（来源标签），用于打开端归因。 */
export function buildTrackedShareLink(variantId: string | null): string {
  const base = buildShareUrl();
  const p = new URLSearchParams();
  const camp = campaignCode();
  if (camp) p.set("camp", camp);
  if (variantId) p.set("v", variantId);
  p.set("st", getSourceTagId());
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

async function httpPost(path: string, body: unknown): Promise<unknown | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as unknown;
  } catch {
    return null;
  }
}

/** 拉取 A/B 变体。后端需返回变体上的分享文案字段（shareTitle/shareDesc/shareImage）。 */
async function pickVariant(code: string): Promise<VariantCreative> {
  const base = apiBase();
  if (!base || !code) return defaultCreative();
  try {
    const res = await fetch(
      `${base}/api/zhao-studio/v1/variants/pick?campaignId=${encodeURIComponent(code)}`,
    );
    if (!res.ok) return defaultCreative();
    const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const v = json?.data;
    if (!v) return defaultCreative();
    const fallback = defaultCreative();
    return {
      variantId: (v.documentId as string) || null,
      title: (v.shareTitle as string) || fallback.title,
      desc: (v.shareDesc as string) || fallback.desc,
      imgUrl: (v.shareImage as string) || fallback.imgUrl,
    };
  } catch {
    return defaultCreative();
  }
}

/** 曝光：分享卡展示。写入 browser-log（需后端把 abVariant 透传到 browser-log）。 */
async function reportImpression(variantId: string | null, sourceTagId: string): Promise<void> {
  await httpPost(`/api/zhao-studio/v1/analytics/page-view`, {
    data: {
      sessionId: sourceTagId,
      abVariant: variantId || undefined,
      userAgent: navigator.userAgent,
      language: navigator.language,
      screen: { width: window.screen?.width || 0, height: window.screen?.height || 0 },
    },
  });
}

/** 打开：好友点开分享链接。写入 zhao-track.click-event（需后端放开 couponId 必填并支持 abVariantId）。 */
async function reportOpen(variantId: string | null, sourceTagId: string): Promise<void> {
  await httpPost(`/api/zhao-track/v1/zhao-track/click`, {
    sourceTagId,
    deviceFingerprint: sourceTagId,
    abVariantId: variantId || undefined,
  });
}

function applyWechatShare(c: VariantCreative, link: string): void {
  const setWx = (window as unknown as { __setWechatShare?: (p: Record<string, string>) => void })
    .__setWechatShare;
  if (typeof setWx === "function") {
    setWx({ title: c.title, desc: c.desc, link, imgUrl: c.imgUrl });
  }
}

let cachedCreative: VariantCreative = defaultCreative();
let cachedLink = "";

/**
 * 初始化分享 A/B：在首屏尽早调用（Main 启动处）。
 * - 未配置活动 code 时直接跳过，游戏保持原样；
 * - 命中分享链接（带 st/v）时，额外上报一次「打开」事件，归因到原展示变体。
 */
export async function initMarketingShare(): Promise<void> {
  const code = campaignCode();
  if (!code) return;

  const sourceTagId = getSourceTagId();
  const params = (() => {
    try {
      return new URLSearchParams(window.location.search);
    } catch {
      return new URLSearchParams();
    }
  })();
  const openerVariant = params.get("v");
  const isOpener = !!params.get("st") || !!openerVariant;

  let creative = await pickVariant(code);
  // 打开端：以链接携带的变体为准（保证归因到分享者当时展示的文案），创意文案仍取自后端
  if (openerVariant) creative.variantId = openerVariant;

  cachedCreative = creative;
  const link = buildTrackedShareLink(creative.variantId);
  cachedLink = link;
  applyWechatShare(creative, link);

  // 来源标签：让后续点击事件能反查活动/渠道
  await httpPost(`/api/zhao-track/v1/zhao-track/source/identify`, {
    deviceFingerprint: sourceTagId,
    utm: { utmSource: code, utmContent: creative.variantId || undefined },
  });

  await reportImpression(creative.variantId, sourceTagId);

  if (isOpener) {
    await reportOpen(openerVariant || creative.variantId, sourceTagId);
  }
}

/** 供其它分享入口（navigator.share 等）获取带追踪参数的链接。 */
export function getMarketingShareLink(): string {
  if (!cachedLink) cachedLink = buildTrackedShareLink(cachedCreative.variantId);
  return cachedLink;
}

/** 当前生效的分享文案（标题/描述/图片），供海报/卡片复用。 */
export function getMarketingCreative(): VariantCreative {
  return cachedCreative;
}
