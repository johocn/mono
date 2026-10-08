/**
 * AuthStore — 游客优先 + 可选登录（对接 game-server 认证接口）
 * 未配置后端或登录失败时，游戏一律本地完整可玩。
 */

import { ENV } from "./Env";

const STORAGE_KEY = "tt_auth_v1";

interface AuthData {
  token: string;
  playerId: string;
  accountId: string;
  isGuest: boolean;
  ownInviteCode?: string;
  nickname?: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface ApiEnvelope<T> { code: number; msg: string; data: T; }
interface AuthPayload { token: string; accountId: string | number; playerId: string | number; }

export interface AuthResult { ok: boolean; error?: string; }

class AuthStore {
  private data: AuthData | null = null;

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<AuthData>;
      if (p && p.token && p.playerId) {
        this.data = {
          token: p.token,
          playerId: String(p.playerId),
          accountId: String(p.accountId ?? ""),
          isGuest: p.isGuest !== false,
          ownInviteCode: typeof p.ownInviteCode === "string" ? p.ownInviteCode : undefined,
          nickname: typeof p.nickname === "string" ? p.nickname : undefined,
        };
      }
    } catch { this.data = null; }
  }

  private persist(): void {
    try {
      if (this.data) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* 忽略 */ }
  }

  private set(p: AuthPayload, isGuest: boolean, opts?: { refreshToken?: string; expiresIn?: number }): void {
    const prev = this.data;
    this.data = {
      token: p.token,
      playerId: String(p.playerId),
      accountId: String(p.accountId ?? ""),
      isGuest,
      ownInviteCode: (p as { ownInviteCode?: string }).ownInviteCode ?? prev?.ownInviteCode,
      nickname: (p as { nickname?: string }).nickname ?? prev?.nickname,
      refreshToken: opts?.refreshToken ?? prev?.refreshToken,
      expiresAt: opts?.expiresIn && opts.expiresIn > 0 ? Date.now() + opts.expiresIn * 1000 : prev?.expiresAt,
    };
    this.persist();
  }

  getRefreshToken(): string | null { return this.data?.refreshToken ?? null; }
  isAccessTokenNearExpiry(bufferMs = 5 * 60 * 1000): boolean {
    const exp = this.data?.expiresAt;
    if (!exp) return false;
    return Date.now() + bufferMs >= exp;
  }
  async ensureToken(): Promise<void> { if (this.isAccessTokenNearExpiry()) await this.refresh(); }

  async refresh(): Promise<AuthResult> {
    const rt = this.getRefreshToken();
    if (!rt || !ENV.gameServerEnabled) return { ok: false, error: "无刷新令牌" };
    try {
      const res = await fetch(`${ENV.gameServerApiUrl}/api/client/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const env = (await res.json()) as ApiEnvelope<AuthPayload & { refreshToken?: string; expiresIn?: number }>;
      if (!res.ok || env.code !== 0 || !env.data?.token) {
        this.logout();
        return { ok: false, error: env?.msg || "令牌刷新失败" };
      }
      this.set(env.data, false, { refreshToken: env.data.refreshToken ?? rt, expiresIn: env.data.expiresIn });
      return { ok: true };
    } catch { this.logout(); return { ok: false, error: "无法连接后端" }; }
  }

  async authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    await this.ensureToken();
    const doFetch = async (): Promise<Response> => {
      const headers = new Headers(init.headers);
      const t = this.getToken();
      if (t) headers.set("Authorization", `Bearer ${t}`);
      if (init.body != null && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      return fetch(`${ENV.gameServerApiUrl}${path}`, { ...init, headers });
    };
    let res = await doFetch();
    if (res.status === 401) {
      const refreshed = await this.refresh();
      if (refreshed.ok) res = await doFetch();
    }
    return res;
  }

  isLoggedIn(): boolean { return !!this.data && !!this.data.token; }
  isGuest(): boolean { return !this.data || this.data.isGuest; }
  getToken(): string | null { return this.data?.token ?? null; }
  getPlayerId(): string | null { return this.data?.playerId ?? null; }
  getAccountIdForClaim(): string | undefined { return this.data?.accountId || undefined; }
  getInviteCode(): string | null { return this.data?.ownInviteCode ?? null; }
  getNickname(): string | null { return this.data?.nickname ?? null; }
  logout(): void { this.data = null; this.persist(); }

  backendAvailable(): boolean { return ENV.gameServerEnabled; }

  async loginGuest(): Promise<AuthResult> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端，当前为本地模式" };
    if (this.isLoggedIn() && !this.isGuest()) return { ok: true };
    try {
      const res = await fetch(`${ENV.gameServerApiUrl}/api/client/v1/auth/guest`, { method: "POST" });
      const env = (await res.json()) as ApiEnvelope<AuthPayload>;
      if (!res.ok || env.code !== 0 || !env.data?.token) {
        return { ok: false, error: env?.msg || `游客登录失败（${res.status}）` };
      }
      this.set(env.data, true, {
        refreshToken: (env.data as { refreshToken?: string }).refreshToken,
        expiresIn: (env.data as { expiresIn?: number }).expiresIn,
      });
      return { ok: true };
    } catch { return { ok: false, error: "无法连接后端" }; }
  }

  async login(username: string, password: string): Promise<AuthResult> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端，当前为本地模式" };
    if (!username.trim() || !password) return { ok: false, error: "请输入账号与密码" };
    try {
      const res = await fetch(`${ENV.gameServerApiUrl}/api/client/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const env = (await res.json()) as ApiEnvelope<AuthPayload>;
      if (!res.ok || env.code !== 0 || !env.data?.token) {
        return { ok: false, error: env?.msg || "账号或密码不正确" };
      }
      this.set(env.data, false, {
        refreshToken: (env.data as { refreshToken?: string }).refreshToken,
        expiresIn: (env.data as { expiresIn?: number }).expiresIn,
      });
      return { ok: true };
    } catch { return { ok: false, error: "无法连接后端" }; }
  }

  async register(username: string, password: string, nickname: string): Promise<AuthResult> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端，当前为本地模式" };
    if (!username.trim() || !password) return { ok: false, error: "请输入账号与密码" };
    try {
      const res = await fetch(`${ENV.gameServerApiUrl}/api/client/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, nickname: nickname.trim() || username.trim() }),
      });
      const env = (await res.json()) as ApiEnvelope<AuthPayload>;
      if (!res.ok || env.code !== 0 || !env.data?.token) {
        return { ok: false, error: env?.msg || "注册失败" };
      }
      this.set(env.data, false, {
        refreshToken: (env.data as { refreshToken?: string }).refreshToken,
        expiresIn: (env.data as { expiresIn?: number }).expiresIn,
      });
      return { ok: true };
    } catch { return { ok: false, error: "无法连接后端" }; }
  }

  async ssoExchange(
    accessToken: string,
    claimAccountId?: string,
    extra?: { refreshToken?: string; expiresIn?: number },
  ): Promise<AuthResult> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端，当前为本地模式" };
    try {
      const res = await fetch(`${ENV.gameServerApiUrl}/api/client/v1/auth/sso-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, claimAccountId: claimAccountId || undefined }),
      });
      const env = (await res.json()) as ApiEnvelope<
        AuthPayload & { ownInviteCode?: string; nickname?: string; refreshToken?: string; expiresIn?: number }
      >;
      if (!res.ok || env.code !== 0 || !env.data?.token) {
        return { ok: false, error: env?.msg || "SSO 登录失败" };
      }
      this.set(env.data, false, {
        refreshToken: env.data.refreshToken ?? extra?.refreshToken,
        expiresIn: env.data.expiresIn ?? extra?.expiresIn,
      });
      return { ok: true };
    } catch { return { ok: false, error: "无法连接后端" }; }
  }
}

export const authStore = new AuthStore();
