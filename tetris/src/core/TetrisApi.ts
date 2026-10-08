/**
 * TetrisApi — 方块服务端客户端（对齐消消乐 SkinApi）
 * 封装 /api/client/v1/tetris/* 接口；永不抛异常，网络/鉴权失败转 error，调用方降级。
 * 只有已登录（游客登录后也视为可用）才走云端；未配置后端或游客态时本地降级。
 */

import { ENV } from "./Env";
import { authStore } from "./AuthStore";
import type { ItemConfig } from "../config/LevelConfig";

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

export interface TetrisProfile {
  bestScore: number;
  plays: number;
  signinStreak: number;
  lastSignDate: string;
  items: Record<string, number>;
}

class TetrisApi {
  /** 云端能力是否可用：已配置后端 且 已登录 */
  available(): boolean {
    return ENV.gameServerEnabled && authStore.isLoggedIn();
  }

  private async req<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    if (!ENV.gameServerEnabled) return { ok: false, error: "未配置后端" };
    try {
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

  // === 积分（独立账本，服务端权威） ===
  async getPoints(): Promise<ApiResult<{ balance: number; totalEarned: number; totalSpent: number }>> {
    if (!this.available()) return { ok: false, error: "未登录" };
    return this.req("/api/client/v1/tetris/points");
  }

  /** 上报获得积分（服务端做 refId 幂等 + 每日上限防刷） */
  async earnPoints(
    amount: number,
    type: string,
    refId?: string,
  ): Promise<ApiResult<{ balance: number }>> {
    if (!this.available()) return { ok: false, error: "未登录" };
    return this.req("/api/client/v1/tetris/points/earn", {
      method: "POST",
      body: JSON.stringify({ amount, type, refId }),
    });
  }

  /** 消费积分（服务端校验余额，防超额） */
  async spendPoints(
    amount: number,
    type: string,
    refId?: string,
  ): Promise<ApiResult<{ balance: number }>> {
    if (!this.available()) return { ok: false, error: "未登录" };
    return this.req("/api/client/v1/tetris/points/spend", {
      method: "POST",
      body: JSON.stringify({ amount, type, refId }),
    });
  }

  // === 进度（完整持久化） ===
  async getProgress(): Promise<ApiResult<TetrisProfile>> {
    if (!this.available()) return { ok: false, error: "未登录" };
    return this.req("/api/client/v1/tetris/progress");
  }

  /** 上报/合并进度（服务端取 max，bestScore 不回退、背包不丢） */
  async saveProgress(p: TetrisProfile): Promise<ApiResult<TetrisProfile>> {
    if (!this.available()) return { ok: false, error: "未登录" };
    return this.req("/api/client/v1/tetris/progress", {
      method: "POST",
      body: JSON.stringify({
        bestScore: p.bestScore,
        plays: p.plays,
        items: p.items,
        signinStreak: p.signinStreak,
        lastSignDate: p.lastSignDate,
      }),
    });
  }

  /** 连续签到（服务端算连签 + 发积分 + 返回奖励道具） */
  async signin(): Promise<
    ApiResult<{ signedToday: boolean; signinStreak: number; rewardItem: string; reward: number; balance: number }>
  > {
    if (!this.available()) return { ok: false, error: "未登录" };
    return this.req("/api/client/v1/tetris/signin", {
      method: "POST",
    });
  }

  // === 皮肤 ===
  async listSkins(): Promise<ApiResult<string[]>> {
    if (!this.available()) return { ok: false, error: "未登录" };
    return this.req("/api/client/v1/tetris/skins");
  }

  /** 积分兑换/解锁内置皮肤（服务端校验价格 + 原子扣积分 + 写解锁） */
  async unlockSkin(skinId: string): Promise<ApiResult<{ skinId: string; already: boolean; balance: number }>> {
    if (!this.available()) return { ok: false, error: "未登录" };
    return this.req("/api/client/v1/tetris/skins/unlock", {
      method: "POST",
      body: JSON.stringify({ skinId }),
    });
  }
}

export const tetrisApi = new TetrisApi();
