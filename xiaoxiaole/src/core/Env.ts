/**
 * 运行时 / 构建期配置 — 商业化（Vendure）接入
 *
 * 配置来源优先级（高 → 低）：
 *   1. 运行时 `window.__APP_ENV__`（部署时由网关 / 后端模板注入，无需重新构建即可切换后端）
 *   2. 构建期注入的 `process.env.VENDURE_*`（由 scripts/build.mjs 读取 .env 注入）
 *   3. 内置默认值
 *
 * 注意：esbuild 的 define 只替换「完整的字面量」 `process.env.VENDURE_API_URL`，
 * 因此本文件必须逐字书写完整 key，不能写成 `process.env[key]` 或 `process.env || {}`，
 * 否则构建期未替换、运行时会触发 `process is not defined`。
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
    /** 消消乐分享裂变对应的营销活动 code（promo-campaign.code），用于 A/B 归因。 */
    MARKETING_CAMPAIGN_CODE?: string;
    /** 家属同步接口地址（周报/未练习状态上报）。留空即纯离线，不上传任何数据。 */
    FAMILY_SYNC_API_URL?: string;
    /** 上线开关：强制 SSO 登录（1/true/yes = 强制；缺省 = 自测期放行游客，不跳 SSO）。 */
    FORCE_SSO_LOGIN?: string;
  };
};

export interface AppEnv {
  /** Vendure Shop API 地址（通常为 `/shop-api`）。 */
  vendureApiUrl: string;
  /** Vendure 商城前台地址，用于拼接商品落地页。 */
  vendureStorefrontUrl: string;
  /** 渠道令牌（公开商品查询通常不需要，私有接口才用）。 */
  vendureChannelToken: string;
  /** 是否启用真实 Vendure：当且仅当 apiUrl 为合法 http(s) 地址时为 true。 */
  vendureEnabled: boolean;
  /** 消消乐后端（game-server）地址，如 `http://localhost:3000`。 */
  gameServerApiUrl: string;
  /** 是否启用后端能力：当且仅当 gameServerApiUrl 为合法 http(s) 地址时为 true。 */
  gameServerEnabled: boolean;
  /** SSO 统一登录页地址（hash 路由，携带 app_code / return_url / invite_code）。 */
  ssoLoginUrl: string;
  /** 本游戏在 SSO 中心注册的应用编码。 */
  ssoAppCode: string;
  /** 本站对外地址（分享链接基址，默认取当前页 origin + pathname）。 */
  siteUrl: string;
  /** Strapi 公共地址（提供 /api/zhao-studio、/api/zhao-track 的宿主）。 */
  marketingApiBase: string;
  /** 消消乐分享裂变营销活动 code（promo-campaign.code），空表示不开通 A/B。 */
  marketingCampaignCode: string;
  /** 家属同步接口地址（接收周报/未练习状态）。空表示不启用，保持纯离线。 */
  familySyncApiUrl: string;
  /** 是否启用家属远程同步：当且仅当 familySyncApiUrl 为合法 http(s) 地址时为 true。 */
  familySyncEnabled: boolean;
  /** 是否强制 SSO 登录：自测期（false）放行游客直接玩；上线时置 true 恢复强制登录。 */
  ssoRequired: boolean;
}

function resolveEnv(): AppEnv {
  const runtime = (window as unknown as { __APP_ENV__?: Record<string, string> }).__APP_ENV__ || {};
  const apiUrl = runtime.VENDURE_API_URL || process.env.VENDURE_API_URL || "";
  const storefrontUrl =
    runtime.VENDURE_STOREFRONT_URL || process.env.VENDURE_STOREFRONT_URL || "https://shop.braingarden.example";
  const token = runtime.VENDURE_CHANNEL_TOKEN || process.env.VENDURE_CHANNEL_TOKEN || "";
  const enabled = /^https?:\/\/.+/i.test(apiUrl);
  // 后端缺省即「本地模式」：换肤、本地库、分享码、积分全部可用，仅云端能力不可用
  const gameApi = runtime.GAME_SERVER_API_URL || process.env.GAME_SERVER_API_URL || "";
  const ssoLoginUrl = runtime.SSO_LOGIN_URL || process.env.SSO_LOGIN_URL || "https://h.joho.cn/#/pages/sso/login";
  const ssoAppCode = runtime.SSO_APP_CODE || process.env.SSO_APP_CODE || "game-xxl";
  const siteUrl = runtime.SITE_URL || process.env.SITE_URL || "";
  const marketingApiBase =
    runtime.MARKETING_API_BASE || process.env.MARKETING_API_BASE || "";
  const marketingCampaignCode =
    runtime.MARKETING_CAMPAIGN_CODE || process.env.MARKETING_CAMPAIGN_CODE || "";
  // 家属同步缺省留空 = 纯离线：未配置时任何同步调用都是本地空操作
  const familySyncApiUrl = runtime.FAMILY_SYNC_API_URL || process.env.FAMILY_SYNC_API_URL || "";
  // 上线开关：1/true/yes = 强制 SSO；缺省（含空）= 自测期放行游客，不跳 SSO
  const forceSsoLogin = runtime.FORCE_SSO_LOGIN || process.env.FORCE_SSO_LOGIN || "";
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
    familySyncApiUrl: familySyncApiUrl.replace(/\/+$/, ""),
    familySyncEnabled: /^https?:\/\/.+/i.test(familySyncApiUrl),
    ssoRequired: /^1|true|yes$/i.test(forceSsoLogin),
  };
}

export const ENV: AppEnv = resolveEnv();
