/**
 * SsoAuth — SSO 统一登录链路（对齐 nshop）
 * 回跳处理、分享进入、强制 SSO（本地模式不强制）。
 */

import { ENV } from "./Env";
import { authStore } from "./AuthStore";

const PENDING_INVITE_KEY = "tt_pending_invite";

interface CallbackParams {
  token: string | null;
  inviteCode: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
}

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
        "token", "user", "isNew", "invite_code", "code", "state",
        "refresh_token", "expires_in",
      ]) {
        params.delete(k);
      }
      const rest = params.toString();
      const cleanUrl =
        window.location.origin + window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash;
      window.history.replaceState(null, "", cleanUrl);
    } catch { /* replaceState 不可用时忽略 */ }
  }
  if (inviteCode) {
    try { sessionStorage.setItem(PENDING_INVITE_KEY, inviteCode); } catch { /* 忽略 */ }
  }
  return { token, inviteCode, refreshToken, expiresIn };
}

export function takePendingInviteCode(): string | null {
  try {
    const v = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (v) sessionStorage.removeItem(PENDING_INVITE_KEY);
    return v;
  } catch { return null; }
}

export interface SsoCallbackResult { handled: boolean; ok: boolean; error?: string; }

export async function handleSsoCallback(
  token: string | null,
  refreshToken?: string | null,
  expiresIn?: number | null,
): Promise<SsoCallbackResult> {
  if (!token) return { handled: false, ok: false };
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

export function redirectToSsoLogin(): void {
  const current = window.location.origin + window.location.pathname + window.location.search;
  const returnUrl = encodeURIComponent(current);
  const pending = takePendingInviteCode();
  const invite = pending ? `&invite_code=${encodeURIComponent(pending)}` : "";
  window.location.href = `${ENV.ssoLoginUrl}?app_code=${encodeURIComponent(ENV.ssoAppCode)}&return_url=${returnUrl}${invite}`;
}

export function needsSsoLogin(): boolean {
  if (!ENV.gameServerEnabled) return false;
  if (!authStore.isLoggedIn()) return true;
  return authStore.isGuest();
}

export function buildShareUrl(): string {
  const base = ENV.siteUrl || window.location.origin + window.location.pathname;
  const code = authStore.getInviteCode();
  return code ? `${base}?invite_code=${encodeURIComponent(code)}` : base;
}
