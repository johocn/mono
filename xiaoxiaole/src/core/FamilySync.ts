/**
 * FamilySync — 家属远程同步（本地优先，默认纯离线）
 *
 * 设计原则（务必遵守，否则会破坏适老化体验）：
 * 1. **本地优先**：未配置 FAMILY_SYNC_API_URL（或地址非法）时，所有调用都是本地空操作，
 *    线上行为与未接入完全一致——不弹错、不阻塞、不联网，家属页现有月报/周报/分享照常可用。
 * 2. **脱敏**：上报载荷只含「亲情码 + 聚合数值」，即综合认知指数 / 近 7 天训练天数 /
 *    未练习天数 / 最弱认知域名称；不含姓名、手机号、住址、头像等任何可识别个人信息。
 * 3. **静默重试**：网络失败绝不抛错（全部 try/catch 吞掉），仅标记 pending，下次自动重试。
 * 4. **独立通道**：家属同步走独立接口，不复用 zhao-track，避免污染营销 A/B 统计。
 *
 * 亲情码为纯本地生成的 6 位大写字符（去掉易混淆的 I/O/0/1），不依赖登录态，
 * 老人只需把码告诉子女即可，无需注册、无需授权。
 */

import { ENV } from "./Env";
import { progress } from "./ProgressStore";
import { getCognitiveProfile } from "./CognitiveProfile";

const STORAGE_KEY = "bg_family_sync";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆的 I / O / 0 / 1
const CODE_LEN = 6;

/** 上报载荷：仅含亲情码与聚合数值，无任何可识别个人信息 */
export interface FamilySyncPayload {
  /** 亲情码（本地生成的随机串，不含身份信息） */
  code: string;
  weekSummary: {
    /** 综合认知指数 0-100 */
    overall: number;
    /** 近 7 天有训练记录的天数 */
    trainedDays: number;
    /** 距上次训练的天数；从未训练为 -1 */
    idleDays: number;
    /** 最需加强的认知域名称；无数据为空串 */
    weakest: string;
  };
  updatedAt: number;
}

export interface FamilySyncTransport {
  /** 推送周报；实现必须内部 try/catch，失败返回 false，绝不抛错 */
  push(payload: FamilySyncPayload): Promise<boolean>;
}

export interface FamilySyncStatus {
  bound: boolean;
  lastSyncAt: number | null;
  pending: boolean;
}

export interface FamilySyncApi {
  available(): boolean;
  getCode(): string | null;
  bind(code: string): void;
  unbind(): void;
  status(): FamilySyncStatus;
  syncWeekly(): Promise<boolean>;
}

/** 默认传输：未配置后端时使用，纯本地空操作 */
class NoopTransport implements FamilySyncTransport {
  async push(): Promise<boolean> {
    return false;
  }
}

/** HTTP 传输：仅在 ENV.familySyncEnabled 时启用，全程静默失败 */
class HttpTransport implements FamilySyncTransport {
  constructor(private base: string) {}

  async push(payload: FamilySyncPayload): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/api/family-sync/v1/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      // 无网 / 跨域 / 后端未就绪：静默失败，由调用方标记 pending
      return false;
    }
  }
}

interface PersistedState {
  code: string | null;
  lastSyncAt: number | null;
  pending: boolean;
}

const EMPTY_STATE: PersistedState = { code: null, lastSyncAt: null, pending: false };

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATE };
    const p = JSON.parse(raw) as Partial<PersistedState>;
    return {
      code: typeof p.code === "string" && p.code ? p.code : null,
      lastSyncAt: typeof p.lastSyncAt === "number" ? p.lastSyncAt : null,
      pending: !!p.pending,
    };
  } catch {
    // 老存档缺失或数据损坏：回落到「未绑定」，不影响其它功能
    return { ...EMPTY_STATE };
  }
}

/** 本地日期键 YYYY-MM-DD（与 ProgressStore 的 radarHistory.date 同格式） */
function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 生成 6 位亲情码（去掉易混淆字符，方便老人念给子女听） */
export function generateFamilyCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

/** 校验亲情码格式（大小写与空格容错） */
export function isValidFamilyCode(code: string): boolean {
  return new RegExp(`^[A-Z2-9]{${CODE_LEN}}$`).test(code.trim().toUpperCase());
}

/** 统计最近 days 天中有训练快照的天数 */
function countTrainedDays(history: { date: string; values: number[] }[], days: number): number {
  const today = new Date();
  let count = 0;
  for (let i = 0; i < days; i++) {
    const key = dayKey(new Date(today.getTime() - i * 86400000));
    if (history.some((h) => h.date === key)) count++;
  }
  return count;
}

class FamilySync implements FamilySyncApi {
  private state: PersistedState = loadState();
  private transport: FamilySyncTransport;

  constructor() {
    this.transport = ENV.familySyncEnabled
      ? new HttpTransport(ENV.familySyncApiUrl)
      : new NoopTransport();
  }

  /** 是否具备远程同步能力（未配置后端时为 false，此时一切为本地空操作） */
  available(): boolean {
    return ENV.familySyncEnabled;
  }

  getCode(): string | null {
    return this.state.code;
  }

  bind(code: string): void {
    const normalized = code.trim().toUpperCase();
    if (!isValidFamilyCode(normalized)) return; // 格式不对就忽略，不弹错打扰老人
    this.state.code = normalized;
    this.state.pending = true; // 绑定后等下一次同步
    this.save();
  }

  unbind(): void {
    this.state = { ...EMPTY_STATE };
    this.save();
  }

  status(): FamilySyncStatus {
    return {
      bound: !!this.state.code,
      lastSyncAt: this.state.lastSyncAt,
      pending: this.state.pending,
    };
  }

  async syncWeekly(): Promise<boolean> {
    // 未配置后端或未绑定亲情码：本地空操作，不标记 pending（没有可重试的目标）
    if (!ENV.familySyncEnabled || !this.state.code) return false;

    const payload = this.buildPayload();
    if (!payload) return false;

    const ok = await this.transport.push(payload);
    if (ok) {
      this.state.lastSyncAt = Date.now();
      this.state.pending = false;
    } else {
      this.state.pending = true;
    }
    this.save();
    return ok;
  }

  /** 组装脱敏载荷：只取聚合数值，不碰任何个人信息 */
  private buildPayload(): FamilySyncPayload | null {
    const code = this.state.code;
    if (!code) return null;

    const profile = getCognitiveProfile();
    const history = progress.getRadarHistory();
    const last = progress.getLastPlayed();
    const idleDays = last > 0 ? Math.floor((Date.now() - last) / 86400000) : -1;

    return {
      code,
      weekSummary: {
        overall: profile.overall,
        trainedDays: countTrainedDays(history, 7),
        idleDays,
        weakest: profile.weakest.length ? profile.weakest[0].label : "",
      },
      updatedAt: Date.now(),
    };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // 隐私模式 / 存储空间不足：仅放弃持久化，不影响本次会话
    }
  }
}

/** 全局单例 */
export const familySync = new FamilySync();
