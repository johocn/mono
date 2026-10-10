/**
 * AuthStore — 游客优先 + 可选登录
 *
 * 对接 game-server 的认证接口（统一响应包装 `{ code, msg, data }`）：
 * - 游客登录：`POST api/client/v1/auth/guest`
 * - 账号登录：`POST api/client/v1/auth/login`
 * - 账号注册：`POST api/client/v1/auth/register`
 * 三者均返回 `{ token, accountId, playerId }`（playerId 为 bigint，序列化为字符串）。
 *
 * **游客优先**：未配置后端或登录失败时，游戏一律本地完整可玩，
 * 只有 `isLoggedIn()` 为真时才把皮肤 / 积分同步到服务端。
 */

import { ENV } from "./Env";

const STORAGE_KEY = "bg_auth_v1";

interface AuthData {
  token: string;
  playerId: string;
  accountId: string;
  /** true = 游客身份（未绑定正式账号） */
  isGuest: boolean;
  /** 本人自有邀请码（SSO 对齐后回写，分享链接用） */
  ownInviteCode?: string;
  /** SSO 昵称（欢迎语用） */
  nickname?: string;
  /**
   * 刷新令牌：accessToken 过期后凭它换发新令牌，避免反复跳 SSO。
   * 来自 sso-exchange / refresh 响应，或 SSO 回跳 URL 的 refresh_token 参数。
   */
  refreshToken?: string;
  /**
   * accessToken 过期时间戳（ms），由 expiresIn 换算。
   * 用于临近过期时主动刷新；无此值则不主动刷新（仅在 401 时按需刷新）。
   */
  expiresAt?: number;
}

/** 后端统一响应包装 */
interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface AuthPayload {
  token: string;
  accountId: string | number;
  playerId: string | number;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

class AuthStore {
  private data: AuthData | null = null;

  /** 启动时恢复登录态；数据损坏时按未登录处理，绝不阻断游戏 */
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
    } catch {
      this.data = null;
    }
  }

  private persist(): void {
    try {
      if (this.data) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 隐私模式 / 配额不足时静默忽略 */
    }
  }

  private set(
    p: AuthPayload,
    isGuest: boolean,
    opts?: { refreshToken?: string; expiresIn?: number },
  ): void {
    const prev = this.data;
    this.data = {
      token: p.token,
      playerId: String(p.playerId),
      accountId: String(p.accountId ?? ""),
      isGuest,
      ownInviteCode: (p as { ownInviteCode?: string }).ownInviteCode ?? prev?.ownInviteCode,
      nickname: (p as { nickname?: string }).nickname ?? prev?.nickname,
      // 刷新令牌/过期时间：优先用本次响应，否则沿用旧值（刷新时后端可能不回新 refreshToken）
      refreshToken: opts?.refreshToken ?? prev?.refreshToken,
      expiresAt:
        opts?.expiresIn && opts.expiresIn > 0
          ? Date.now() + opts.expiresIn * 1000
          : prev?.expiresAt,
    };
    this.persist();
  }

  /** 刷新令牌（无则返回 null） */
  getRefreshToken(): string | null {
    return this.data?.refreshToken ?? null;
  }

  /**
   * accessToken 是否在 buffer 内临近过期（默认提前 5 分钟）。
   * 无 expiresAt 时返回 false（不主动刷新，仅在 401 时按需刷新）。
   */
  isAccessTokenNearExpiry(bufferMs = 5 * 60 * 1000): boolean {
    const exp = this.data?.expiresAt;
    if (!exp) return false;
    return Date.now() + bufferMs >= exp;
  }

  /** 临近过期时主动刷新（进入需鉴权页面 / 启动时调用） */
  async ensureToken(): Promise<void> {
    if (this.isAccessTokenNearExpiry()) await this.refresh();
  }

  /**
   * 用 refreshToken 换发新 accessToken。
   * - 成功：更新 token / refreshToken / expiresAt（持久化）。
   * - 失败（refreshToken 失效或无）：清空登录态，调用方应降级为重新 SSO。
   */
  async refresh(): Promise<AuthResult> {
    const rt = this.getRefreshToken();
    if (!rt || !ENV.gameServerEnabled) return { ok: false, error: "无刷新令牌" };
    try {
      const res = await fetch(`${ENV.gameServerApiUrl}/api/client/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const env = (await res.json()) as ApiEnvelope<
        AuthPayload & { refreshToken?: string; expiresIn?: number }
      >;
      if (!res.ok || env.code !== 0 || !env.data?.token) {
        this.logout(); // 刷新失败：清除旧令牌，下次启动强制重新登录
        return { ok: false, error: env?.msg || "令牌刷新失败" };
      }
      this.set(env.data, false, {
        refreshToken: env.data.refreshToken ?? rt,
        expiresIn: env.data.expiresIn,
      });
      return { ok: true };
    } catch {
      this.logout();
      return { ok: false, error: "无法连接后端" };
    }
  }

  /**
   * 统一鉴权请求：自动附带 Bearer，遇 401 先刷新令牌再重试一次。
   * 所有需要登录态的云端接口（皮肤同步、上传等）都应走这里，
   * 这样 accessToken 过期时用户无需重新跳 SSO，前端静默续期。
   */
  async authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    await this.ensureToken();
    const doFetch = async (): Promise<Response> => {
      const headers = new Headers(init.headers);
      const t = this.getToken();
      if (t) headers.set("Authorization", `Bearer ${t}`);
      // JSON 字符串 body 必须显式声明 Content-Type：浏览器默认 text/plain，
      // Nest 端不解析 → DTO 校验全挂恒 400（earn/publish/redeem 等曾全部中招）
      if (typeof init.body === "string" && !headers.has("Content-Type")) {
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

  // === 查询 ===

  /** 是否已登录（游客身份也算，可用于同步数据） */
  isLoggedIn(): boolean {
    return !!this.data && !!this.data.token;
  }

  isGuest(): boolean {
    return !this.data || this.data.isGuest;
  }

  getToken(): string | null {
    return this.data?.token ?? null;
  }

  getPlayerId(): string | null {
    return this.data?.playerId ?? null;
  }

  /** 本机账号 ID（游客认领用；未登录时为 undefined） */
  getAccountIdForClaim(): string | undefined {
    return this.data?.accountId || undefined;
  }

  /** 本人自有邀请码（未登录/未同步时为 null） */
  getInviteCode(): string | null {
    return this.data?.ownInviteCode ?? null;
  }

  getNickname(): string | null {
    return this.data?.nickname ?? null;
  }

  logout(): void {
    this.data = null;
    this.persist();
  }

  // === 登录 ===

  /** 后端是否可用（未配置地址则全部走本地模式） */
  backendAvailable(): boolean {
    return ENV.gameServerEnabled;
  }

  /** 游客登录：后端可用时静默获取身份，失败不影响本地游玩 */
  async loginGuest(): Promise<AuthResult> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端，当前为本地模式" };
    // 已用 SSO/账号登录的用户不要被游客身份覆盖：否则 token 被换成游客令牌，
    // 下次启动 isGuest=true 会被强制重新跳 SSO（即"每次都要登录"的诱因之一）
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
    } catch {
      return { ok: false, error: "无法连接后端" };
    }
  }

  /** 账号登录（可选：玩家主动登录后可用正式账号同步） */
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
    } catch {
      return { ok: false, error: "无法连接后端" };
    }
  }

  /** 账号注册 */
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
    } catch {
      return { ok: false, error: "无法连接后端" };
    }
  }

  /**
   * SSO 统一登录换会话：SSO 统一页回跳携带的 accessToken 换本站会话。
   * - claimAccountId：本机已有游客账号时传入，服务端把旧进度/积分/皮肤认领到 SSO 用户名下
   * - 成功后本地保存 token 与 ownInviteCode（分享链接用）
   */
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
      // 优先用后端响应里的刷新令牌/过期时间；回跳 URL 带来的作为兜底
      this.set(env.data, false, {
        refreshToken: env.data.refreshToken ?? extra?.refreshToken,
        expiresIn: env.data.expiresIn ?? extra?.expiresIn,
      });
      return { ok: true };
    } catch {
      return { ok: false, error: "无法连接后端" };
    }
  }
}

export const authStore = new AuthStore();
