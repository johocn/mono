/**
 * SkinApi — game-server 消消乐皮肤接口客户端
 *
 * 设计要点：
 * - **永不抛异常**：所有方法返回 `ApiResult`，网络/鉴权/业务失败都转成 `error`，
 *   调用方（换装花园）据此降级，绝不因后端不可用而中断游戏。
 * - **降级明确**：未配置 `gameServerApiUrl` 或未登录时 `available()` 为 false，云端能力禁用，
 *   换肤、本地库、分享码、积分（本地）依旧完整可用。
 * - 统一响应包装 `{ code, msg, data }`，与后端 ResponseInterceptor 对齐。
 */

import { ENV } from "./Env";
import { authStore } from "./AuthStore";
import type { SkinConfig } from "./Skin";

interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** 模板中心 / 我的皮肤返回结构（config 即前端 SkinConfig） */
export interface MarketSkin {
  skinId: string;
  name: string;
  authorName: string;
  pricePoints: number;
  priceCents: number;
  tags: string[];
  coverUrl: string | null;
  config: SkinConfig;
  downloadCount: number;
  /** 审核状态：0=下架/驳回 1=已上架 2=待审核（我的作品列表可见） */
  status?: number;
  /** 驳回原因 */
  reviewNote?: string | null;
}

export interface PromptTemplate {
  key: string;
  label: string;
  prompt: string;
  /** 拼好规格后缀的完整提示词，复制后到外部 AI 工具直接生成 */
  fullPrompt: string;
}

/** 上传规格说明（与后端校验一致） */
export interface SkinSpec {
  width: number;
  height: number;
  formats: string[];
  maxBytes: number;
  specText: string;
}

class SkinApi {
  /** 云端能力是否可用：已配置后端 **且** 已登录（游客登录后也视为可用） */
  available(): boolean {
    return ENV.gameServerEnabled && authStore.isLoggedIn();
  }

  /** 仅后端已配置（不要求登录，用于模板中心等公开接口） */
  backendConfigured(): boolean {
    return ENV.gameServerEnabled;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端，当前为本地模式" };
    try {
      // 走 authStore.authedFetch：自动附带 Bearer，遇 401 先刷新令牌再重试一次，
      // 这样 accessToken 过期时用户无需重新跳 SSO，前端静默续期。
      const res = await authStore.authedFetch(path, init);
      const env = (await res.json()) as ApiEnvelope<T>;
      if (res.status === 401) return { ok: false, error: "登录已失效，请重新登录" };
      if (!res.ok || env.code !== 0) {
        return { ok: false, error: env?.msg || `请求失败（${res.status}）` };
      }
      return { ok: true, data: env.data };
    } catch {
      return { ok: false, error: "无法连接后端" };
    }
  }

  private needLogin(): ApiResult<never> {
    return { ok: false, error: "未登录，登录后可使用云端功能" };
  }

  /**
   * 相对素材地址 → 绝对地址。
   * 后端返回 `/uploads/xiao-skins/xxx.png`，而前端页面可能部署在另一个域名/端口，
   * 若不拼接 gameServerApiUrl，浏览器会去前端自己的域名找图片而加载失败。
   * 已是 http(s) 或 dataURL 的原样返回。
   */
  private absUrl(url: string | undefined | null): string {
    if (!url) return "";
    if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
    return `${ENV.gameServerApiUrl}${url.startsWith("/") ? url : `/${url}`}`;
  }

  /** 把皮肤配置里的素材地址统一补成绝对地址（背景 / 棋盘 / 各类棋子） */
  private normalizeSkin(skin: SkinConfig): SkinConfig {
    if (!skin) return skin;
    const out: SkinConfig = { ...skin };
    if (skin.bg) out.bg = { ...skin.bg, image: this.absUrl(skin.bg.image) || undefined };
    if (skin.board) out.board = { ...skin.board, image: this.absUrl(skin.board.image) || undefined };
    if (skin.tiles) {
      const tiles: SkinConfig["tiles"] = {};
      for (const k of Object.keys(skin.tiles)) {
        const t = skin.tiles[k];
        tiles[k] = t ? { ...t, image: this.absUrl(t.image) || undefined } : t;
      }
      out.tiles = tiles;
    }
    return out;
  }

  // === 公开接口 ===

  /** 模板中心列表 */
  async listMarket(): Promise<ApiResult<MarketSkin[]>> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端" };
    const res = await this.req<MarketSkin[]>("/api/client/v1/xiao/skins/market");
    if (res.ok && res.data) {
      res.data = res.data.map((m) => ({ ...m, config: this.normalizeSkin(m.config) }));
    }
    return res;
  }

  /** 皮肤详情（公开） */
  async getSkinDetail(skinId: string): Promise<ApiResult<MarketSkin>> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端" };
    const res = await this.req<MarketSkin>(
      `/api/client/v1/xiao/skins/${encodeURIComponent(skinId)}`,
    );
    if (res.ok && res.data) res.data = { ...res.data, config: this.normalizeSkin(res.data.config) };
    return res;
  }

  /** 删除自己发布的皮肤 */
  async deleteSkin(skinId: string): Promise<ApiResult<{ skinId: string }>> {
    if (!this.available()) return this.needLogin();
    return this.req(`/api/client/v1/xiao/skins/${encodeURIComponent(skinId)}`, { method: "DELETE" });
  }

  /** AI 提示词模板 + 制作规格（提示词复制到外部工具，平台不出图） */
  async promptTemplates(): Promise<ApiResult<{ items: PromptTemplate[]; spec: SkinSpec }>> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端" };
    return this.req<{ items: PromptTemplate[]; spec: SkinSpec }>(
      "/api/client/v1/xiao/skins/prompt-templates",
    );
  }

  // === 需登录 ===

  async getPoints(): Promise<ApiResult<{ balance: number; totalEarned: number; totalSpent: number }>> {
    if (!this.available()) return this.needLogin();
    return this.req("/api/client/v1/xiao/points");
  }

  async earnPoints(amount: number, type: string, refId?: string): Promise<ApiResult<{ balance: number }>> {
    if (!this.available()) return this.needLogin();
    return this.req("/api/client/v1/xiao/points/earn", {
      method: "POST",
      body: JSON.stringify({ amount, type, refId }),
    });
  }

  async listMine(): Promise<ApiResult<MarketSkin[]>> {
    if (!this.available()) return this.needLogin();
    const res = await this.req<MarketSkin[]>("/api/client/v1/xiao/skins/mine");
    if (res.ok && res.data) {
      res.data = res.data.map((m) => ({ ...m, config: this.normalizeSkin(m.config) }));
    }
    return res;
  }

  /** 发布皮肤到模板中心 */
  async publish(skin: SkinConfig): Promise<ApiResult<{ skinId: string }>> {
    if (!this.available()) return this.needLogin();
    return this.req("/api/client/v1/xiao/skins/publish", {
      method: "POST",
      body: JSON.stringify({
        skinId: skin.id,
        name: skin.name,
        authorName: skin.author,
        config: skin,
        pricePoints: skin.pricePoints ?? 0,
        priceCents: skin.priceCents ?? 0,
        tags: skin.tags,
      }),
    });
  }

  /** 积分兑换皮肤 */
  async redeem(skinId: string): Promise<ApiResult<{ skinId: string; balance: number }>> {
    if (!this.available()) return this.needLogin();
    return this.req("/api/client/v1/xiao/skins/redeem", {
      method: "POST",
      body: JSON.stringify({ skinId }),
    });
  }

  /** 人民币购买后写入解锁 */
  async unlockRmb(skinId: string): Promise<ApiResult<{ skinId: string; already: boolean }>> {
    if (!this.available()) return this.needLogin();
    return this.req("/api/client/v1/xiao/skins/unlock-rmb", {
      method: "POST",
      body: JSON.stringify({ skinId }),
    });
  }

  /** 赠送自己拥有的皮肤给好友（按对方登录账号名，不限次） */
  async gift(skinId: string, toUsername: string): Promise<ApiResult<{ skinId: string; toPlayerId: string }>> {
    if (!this.available()) return this.needLogin();
    return this.req("/api/client/v1/xiao/skins/gift", {
      method: "POST",
      body: JSON.stringify({ skinId, toUsername }),
    });
  }

  /** 上传素材（multipart，单独处理不加 JSON 头） */
  async upload(blob: Blob, filename: string): Promise<ApiResult<{ url: string; bytes: number }>> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端，当前为本地模式" };
    if (!authStore.isLoggedIn()) return this.needLogin();
    try {
      const fd = new FormData();
      fd.append("file", blob, filename);
      // 走 authedFetch：自动 Bearer + 401 静默刷新重试（注意不手动设 Content-Type，交由浏览器填 boundary）
      const res = await authStore.authedFetch("/api/client/v1/xiao/skins/upload", {
        method: "POST",
        body: fd,
      });
      const env = (await res.json()) as ApiEnvelope<{ url: string; bytes: number }>;
      if (res.status === 401) return { ok: false, error: "登录已失效，请重新登录" };
      if (!res.ok || env.code !== 0) return { ok: false, error: env?.msg || "上传失败" };
      return { ok: true, data: { ...env.data, url: this.absUrl(env.data.url) } };
    } catch {
      return { ok: false, error: "无法连接后端" };
    }
  }
}

export const skinApi = new SkinApi();
