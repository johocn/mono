/**
 * MarketingShare — 方块分享裂变的 A/B 效果统计（接入 Strapi zhao-studio / zhao-track）
 * 与消消乐同源：拉取 A/B 文案变体 → 注入微信卡片 → 链接打标 → 上报曝光/打开。
 */

import { ENV } from "./Env";
import { buildShareUrl } from "./SsoAuth";

const STORAGE_TAG_KEY = "tt_mkt_source_tag";

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
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("camp");
    if (fromUrl) return fromUrl;
  } catch { /* ignore */ }
  return ENV.marketingCampaignCode || "";
}

function uuid(): string {
  try {
    const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch { /* ignore */ }
  return "st_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function getSourceTagId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_TAG_KEY);
    if (existing) return existing;
  } catch { /* ignore */ }
  const id = uuid();
  try { localStorage.setItem(STORAGE_TAG_KEY, id); } catch { /* ignore */ }
  return id;
}

function defaultCreative(): VariantCreative {
  return {
    variantId: null,
    title: "俄罗斯方块·典藏版",
    desc: "经典怀旧方块，大字号适老设计，陪您慢慢玩。",
    imgUrl: "./share.png",
  };
}

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
  } catch { return null; }
}

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
  } catch { return defaultCreative(); }
}

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

export async function initMarketingShare(): Promise<void> {
  const code = campaignCode();
  if (!code) return;

  const sourceTagId = getSourceTagId();
  const params = (() => {
    try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); }
  })();
  const openerVariant = params.get("v");
  const isOpener = !!params.get("st") || !!openerVariant;

  let creative = await pickVariant(code);
  if (openerVariant) creative.variantId = openerVariant;

  cachedCreative = creative;
  const link = buildTrackedShareLink(creative.variantId);
  cachedLink = link;
  applyWechatShare(creative, link);

  await httpPost(`/api/zhao-track/v1/zhao-track/source/identify`, {
    deviceFingerprint: sourceTagId,
    utm: { utmSource: code, utmContent: creative.variantId || undefined },
  });

  await reportImpression(creative.variantId, sourceTagId);

  if (isOpener) {
    await reportOpen(openerVariant || creative.variantId, sourceTagId);
  }
}

export function getMarketingShareLink(): string {
  if (!cachedLink) cachedLink = buildTrackedShareLink(cachedCreative.variantId);
  return cachedLink;
}

export function getMarketingCreative(): VariantCreative {
  return cachedCreative;
}
