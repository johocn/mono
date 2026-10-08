/**
 * 运行时 / 构建期配置 — 商业化（Vendure）接入
 * 配置来源优先级（高 → 低）：运行时 window.__APP_ENV__ → 构建期 process.env.* → 内置默认值。
 * 注意：esbuild 的 define 只替换完整的字面量 process.env.X，本文件必须逐字书写完整 key。
 */

declare const process: {
  env: {
    VENDURE_API_URL?: string;
    VENDURE_STOREFRONT_URL?: string;
    VENDURE_CHANNEL_TOKEN?: string;
    GAME_SERVER_API_URL?: string;
    SSO_LOGIN_URL?: string;
    SSO_APP_CODE?: string;
    SITE_URL?: string;
    /** Strapi 公共地址（提供 /api/zhao-studio、/api/zhao-track 的宿主）。 */
    MARKETING_API_BASE?: string;
    /** 方块分享裂变对应的营销活动 code（promo-campaign.code），用于 A/B 归因。 */
    MARKETING_CAMPAIGN_CODE?: string;
  };
};

export interface AppEnv {
  vendureApiUrl: string;
  vendureStorefrontUrl: string;
  vendureChannelToken: string;
  vendureEnabled: boolean;
  gameServerApiUrl: string;
  gameServerEnabled: boolean;
  ssoLoginUrl: string;
  ssoAppCode: string;
  siteUrl: string;
  /** Strapi 公共地址（提供 /api/zhao-studio、/api/zhao-track 的宿主）。 */
  marketingApiBase: string;
  /** 方块分享裂变营销活动 code（promo-campaign.code），空表示不开通 A/B。 */
  marketingCampaignCode: string;
}

function resolveEnv(): AppEnv {
  const runtime = (window as unknown as { __APP_ENV__?: Record<string, string> }).__APP_ENV__ || {};
  const apiUrl = runtime.VENDURE_API_URL || process.env.VENDURE_API_URL || "";
  const storefrontUrl =
    runtime.VENDURE_STOREFRONT_URL || process.env.VENDURE_STOREFRONT_URL || "https://shop.braingarden.example";
  const token = runtime.VENDURE_CHANNEL_TOKEN || process.env.VENDURE_CHANNEL_TOKEN || "";
  const enabled = /^https?:\/\/.+/i.test(apiUrl);
  const gameApi = runtime.GAME_SERVER_API_URL || process.env.GAME_SERVER_API_URL || "";
  const ssoLoginUrl = runtime.SSO_LOGIN_URL || process.env.SSO_LOGIN_URL || "https://h.joho.cn/#/pages/sso/login";
  // 方块游戏使用独立 SSO 应用编码（与消消乐 game-xxl 隔离），由 zhao-sso 注册
  const ssoAppCode = runtime.SSO_APP_CODE || process.env.SSO_APP_CODE || "game-tetris";
  const siteUrl = runtime.SITE_URL || process.env.SITE_URL || "";
  const marketingApiBase =
    runtime.MARKETING_API_BASE || process.env.MARKETING_API_BASE || "";
  const marketingCampaignCode =
    runtime.MARKETING_CAMPAIGN_CODE || process.env.MARKETING_CAMPAIGN_CODE || "";
  return {
    vendureApiUrl: apiUrl,
    vendureStorefrontUrl: storefrontUrl.replace(/\/+$/, ""),
    vendureChannelToken: token,
    vendureEnabled: enabled,
    gameServerApiUrl: gameApi.replace(/\/+$/, ""),
    gameServerEnabled: /^https?:\/\/.+/i.test(gameApi),
    ssoLoginUrl,
    ssoAppCode,
    siteUrl: siteUrl.replace(/\/+$/, ""),
    marketingApiBase: marketingApiBase.replace(/\/+$/, ""),
    marketingCampaignCode,
  };
}

export const ENV: AppEnv = resolveEnv();
