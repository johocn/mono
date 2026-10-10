/**
 * SsoAuth — SSO 统一登录链路（对齐 nshop：统一页 → 回跳带 token → 换本站会话）
 *
 * - 回跳处理：URL `?token=...&user=...&isNew=...`（SSO 中转页转发），消费后清参数
 * - 分享进入：URL `?invite_code=XXX` 暂存 sessionStorage，跳 SSO 时透传（SSO 侧幂等绑分销）
 * - 强制 SSO：未登录（含游客态）时整体跳转统一登录页；本地模式（未配置后端）不强制
 */

import { ENV } from "./Env";
import { authStore } from "./AuthStore";

const PENDING_INVITE_KEY = "bg_pending_invite";

interface CallbackParams {
  token: string | null;
  inviteCode: string | null;
  /** SSO 回跳携带的刷新令牌（部分 SSO 直接下发，作为后端 refresh 的兜底） */
  refreshToken: string | null;
  /** accessToken 有效期（秒），由 SSO/后端给出，用于主动续期 */
  expiresIn: number | null;
}

/**
 * 合并 search 与 hash 的 query（部分 SSO 把参数放在 hash 之后，如 #/callback?token=...）。
 * 不修改原 URL，仅返回可读取的 URLSearchParams。
 */
function parseUrlParams(): URLSearchParams {
  const merged = new URLSearchParams();
  new URL(window.location.href).searchParams.forEach((v, k) => merged.append(k, v));
  const hash = window.location.hash;
  const qIdx = hash.indexOf("?");
  if (qIdx >= 0) {
    new URLSearchParams(hash.slice(qIdx + 1)).forEach((v, k) => merged.append(k, v));
  }
  return merged;
}

/** 读取并消费 URL 上的 SSO 回跳参数与分享邀请码（读取后立即清掉地址栏，避免刷新重放） */
export function consumeUrlParams(): CallbackParams {
  const params = parseUrlParams();
  const token = params.get("token");
  const inviteCode = params.get("invite_code");
  const refreshToken = params.get("refresh_token");
  const expiresInRaw = params.get("expires_in");
  const expiresIn = expiresInRaw != null && expiresInRaw !== "" ? Number(expiresInRaw) : null;

  if (token || inviteCode || refreshToken) {
    try {
      for (const k of [
        "token",
        "user",
        "isNew",
        "invite_code",
        "code",
        "state",
        "refresh_token",
        "expires_in",
      ]) {
        params.delete(k);
      }
      const rest = params.toString();
      const cleanUrl =
        window.location.origin + window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash;
      window.history.replaceState(null, "", cleanUrl);
    } catch {
      /* replaceState 不可用时忽略（file:// 等环境） */
    }
  }

  if (inviteCode) {
    try {
      sessionStorage.setItem(PENDING_INVITE_KEY, inviteCode);
    } catch { /* 忽略 */ }
  }

  return { token, inviteCode, refreshToken, expiresIn };
}

/** 取待透传的邀请码（分享链接带入，未登录时暂存；登录成功后清除） */
export function takePendingInviteCode(): string | null {
  try {
    const v = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (v) sessionStorage.removeItem(PENDING_INVITE_KEY);
    return v;
  } catch {
    return null;
  }
}

export interface SsoCallbackResult {
  handled: boolean;
  ok: boolean;
  error?: string;
}

/**
 * 处理 SSO 回跳：URL 带 token 时调 sso-exchange 换本站会话。
 * 认领本机已有游客账号（进度/积分/皮肤无缝延续）。
 * refreshToken/expiresIn 透传给 sso-exchange 持久化，用于后续静默续期。
 */
export async function handleSsoCallback(
  token: string | null,
  refreshToken?: string | null,
  expiresIn?: number | null,
): Promise<SsoCallbackResult> {
  if (!token) return { handled: false, ok: false };
  // 仅游客态传认领：把本机旧游客进度/积分/皮肤挂到 SSO 用户名下
  const claimAccountId = authStore.isGuest() ? accountIdForClaim() : undefined;
  const res = await authStore.ssoExchange(token, claimAccountId, {
    refreshToken: refreshToken ?? undefined,
    expiresIn: expiresIn ?? undefined,
  });
  return { handled: true, ok: res.ok, error: res.error };
}

function accountIdForClaim(): string | undefined {
  return authStore.getAccountIdForClaim();
}

/** 跳转 SSO 统一登录页（带 app_code / return_url / invite_code） */
export function redirectToSsoLogin(): void {
  // return_url 一律用「当前页面的 origin + path + query」，不用 ENV.siteUrl：
  // 这样 SSO 回跳必然回到用户正在访问的同一个源（origin），token 才会写进
  // 同一份 localStorage，否则回跳到另一个域名 → 本页读不到 token → 每次都跳 SSO。
  // 同时保留当前 query（camp/v/st 等营销归因参数），避免分享打开者回跳后归因丢失。
  const current = window.location.origin + window.location.pathname + window.location.search;
  const returnUrl = encodeURIComponent(current);
  const pending = takePendingInviteCode();
  const invite = pending ? `&invite_code=${encodeURIComponent(pending)}` : "";
  window.location.href = `${ENV.ssoLoginUrl}?app_code=${encodeURIComponent(ENV.ssoAppCode)}&return_url=${returnUrl}${invite}`;
}

/**
 * 是否需要强制登录：后端已配置 且 上线开关已开 且 本机无正式账号（游客态/未登录都算）
 *
 * 两个前置条件缺一不可：
 * - gameServerEnabled：未配 GAME_SERVER_API_URL 时走本地模式，sso-exchange 无处可换
 * - ssoRequired（FORCE_SSO_LOGIN=1/true/yes）：自测期缺省放行游客，上线才强制
 *   修复：此前 ssoRequired 定义后从未被使用，开关形同虚设。
 */
export function needsSsoLogin(): boolean {
  if (!ENV.gameServerEnabled) return false; // 本地模式（未配后端）不强制
  if (!ENV.ssoRequired) return false;       // 上线开关未开：自测期放行游客
  if (!authStore.isLoggedIn()) return true;
  return authStore.isGuest(); // 游客态也引导升级为 SSO 正式账号
}

/** 邀请好友分享链接（携带本人邀请码；未同步到邀请码时退化为纯链接） */
export function buildShareUrl(): string {
  const base = ENV.siteUrl || window.location.origin + window.location.pathname;
  const code = authStore.getInviteCode();
  return code ? `${base}?invite_code=${encodeURIComponent(code)}` : base;
}
