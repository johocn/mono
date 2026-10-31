/**
 * 云存档/排行榜客户端：对接零依赖后端（server/server.js，默认 3210）。
 * 所有请求 3s 超时，任何失败都返回 null/ false，由调用方回退本地，
 * 保证单机可玩（dev 无后端也能跑）。
 */
import type { SocialProfile } from "../data/social";

export interface LeaderEntry {
  nickname: string;
  realm: string;
  timeMs: number;
  kills: number;
  chapter: number;
  createdAt: number;
}

const TIMEOUT = 3000;

export class CloudClient {
  constructor(private base: string = "http://127.0.0.1:3210") {}

  private async req(path: string, init: any = {}, timeout = TIMEOUT): Promise<any | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(this.base + path, {
        ...init,
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 游客登录：昵称即可，返回 token */
  async login(nickname: string): Promise<{ token: string; userId: number } | null> {
    const r = await this.req("/api/auth/guest", {
      method: "POST",
      body: JSON.stringify({ nickname }),
    });
    return r?.token ? r : null;
  }

  async save(token: string, data: unknown): Promise<boolean> {
    const r = await this.req("/api/save", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data }),
    });
    return !!r?.ok;
  }

  async load(token: string): Promise<any | null> {
    const r = await this.req("/api/save", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r?.ok ? r.data : null;
  }

  async submit(token: string, payload: { nickname: string; realm: string; timeMs: number; kills: number; chapter: number }): Promise<boolean> {
    const r = await this.req("/api/leaderboard", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    return !!r?.ok;
  }

  async leaderboard(): Promise<LeaderEntry[]> {
    const r = await this.req("/api/leaderboard");
    return Array.isArray(r?.entries) ? r.entries : [];
  }

  /** 拉取账号级社交档案（无记录时服务端返回默认空档案）；失败返回 null，调用方回退本地 */
  async getSocial(token: string): Promise<SocialProfile | null> {
    const r = await this.req("/api/social", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r?.ok && r.profile ? (r.profile as SocialProfile) : null;
  }

  /** 上传社交档案（upsert）；失败返回 false，不影响本地 */
  async putSocial(token: string, profile: SocialProfile): Promise<boolean> {
    const r = await this.req("/api/social", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ profile }),
    });
    return !!r?.ok;
  }

  // ================= P3-6 社交实时化 =================

  /** 玩家间邮件：发送（按昵称寻址；失败返回 false 不影响本地） */
  async sendMail(token: string, to: string, mail: { title: string; body: string; reward?: any }): Promise<boolean> {
    const r = await this.req("/api/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, title: mail.title, body: mail.body, reward: mail.reward || {} }),
    });
    return !!r?.ok;
  }

  /** 收件箱（失败返回空数组，回退本地） */
  async getMail(token: string): Promise<any[] | null> {
    const r = await this.req("/api/mail", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return Array.isArray(r?.mails) ? r.mails : null;
  }

  /** 领取邮件：服务端标记防重领，并返回奖励供客户端应用；失败返回 null */
  async claimMail(token: string, id: number): Promise<any | null> {
    const r = await this.req(`/api/mail/${id}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return r?.ok ? (r.reward || {}) : null;
  }

  /** 宗门贡献榜（公开；失败返回空数组） */
  async sectLeaderboard(): Promise<{ nickname: string; contribution: number }[]> {
    const r = await this.req("/api/social/leaderboard");
    return Array.isArray(r?.entries) ? r.entries : [];
  }

  /** 软实时在线：上报自身位置（失败静默） */
  async putPresence(token: string, gx: number, gy: number, zone: string): Promise<boolean> {
    const r = await this.req("/api/presence", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gx, gy, zone }),
    });
    return !!r?.ok;
  }

  /** 软实时在线：拉取近 60s 活跃道友（失败返回空数组） */
  async presenceList(): Promise<{ nickname: string; gx: number; gy: number; zone: string; updatedAt: number }[]> {
    const r = await this.req("/api/presence");
    return Array.isArray(r?.players) ? r.players : [];
  }

  // ================= P3-8 运营/赛季 =================
  /** 当前活跃赛季 + 榜单（无活跃赛季 open=false；失败返回 null 回退本地） */
  async getSeason(): Promise<{
    id: number; name: string; startAt: number; endAt: number; open: boolean;
    top: { nickname: string; score: number; clearMs: number }[];
  } | null> {
    const r = await this.req("/api/season");
    if (!r || !r.ok) return null;
    return {
      id: r.season?.id ?? 0, name: r.season?.name ?? "", startAt: r.season?.startAt ?? 0, endAt: r.season?.endAt ?? 0,
      open: !!r.open, top: Array.isArray(r.top) ? r.top : [],
    };
  }

  /** 提交活动副本成绩（按 user×season 保最优）；返回排名或 null（失败/未提升） */
  async submitSeasonScore(token: string, score: number, clearMs: number): Promise<number | null> {
    const r = await this.req("/api/season/score", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score, clearMs }),
    });
    return r?.ok && typeof r.rank === "number" ? r.rank : null;
  }
}
