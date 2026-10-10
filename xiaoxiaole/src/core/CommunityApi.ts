/**
 * CommunityApi — 玩家投票（最受欢迎游戏）与留言建议
 *
 * 复用 h.joho.cn 上 Strapi 的 zhao-website 插件，**零后端改动**：
 * - 投票/点赞：POST /api/zhao-website/v1/interactions/track
 *   type 仅支持 like / collect / share（Schema 枚举，没有 vote / comment）；
 *   匿名可调用；同一 (site+type+targetType+targetId+visitorId) 再调一次即取消，天然去重。
 * - 留言建议：POST /api/zhao-website/v1/leads/submit
 *   对应后台「线索 / 留资」，匿名可提交；昵称用 contactName，内容用 message。
 *
 * ⚠️ 站点归属靠「域名」解析（zhao-common/site-resolver：query.domain → x-site-domain → host）。
 *    消消乐 H5 在 game.yourbao.cn，Strapi 在 h.joho.cn，属跨域直连——
 *    若不显式带 ?domain=，Host 会变成 h.joho.cn，留言/投票会被解析到 Strapi 自己的站点；
 *    更糟的是解析失败时后端会**静默回退到数字 id 最小的站点**，不报错但数据投错。
 *    所以这里每次请求都强制拼接 domain，绝不在前端传数字 site id。
 *
 * 适老化：所有网络调用静默失败、绝不阻塞游戏；本地状态保证离线也能看到自己的选择。
 * 留言只收「昵称 + 内容」两项，降低长辈填写负担与隐私风险。
 */

import { ENV } from "./Env";
import type { ModeId } from "../config/LevelConfig";

const VISITOR_KEY = "bg_visitor";
const VOTE_KEY = "bg_votes";

/** 点赞：单个玩法页各自点赞，可同时喜欢多个 */
const TARGET_LIKE = "game";
/** 投票：统一问卷页单选「最喜欢的一款」，与点赞是独立维度，故用不同 targetType 区分 */
const TARGET_FAV = "game-favorite";

/** 排行榜接口路径（zhao-website 公开统计接口，按 targetType 聚合、软删过滤） */
const RANKING_PATH = "/api/zhao-website/v1/interactions/stats";

export interface VoteState {
  /** 已点赞的玩法（可多个） */
  liked: ModeId[];
  /** 问卷页单选的「最喜欢」 */
  favorite: ModeId | null;
}

export interface RankRow {
  mode: ModeId;
  count: number;
}

/** Strapi 公共地址（与营销统计同一宿主 h.joho.cn） */
function strapiBase(): string {
  return (ENV.marketingApiBase || "").replace(/\/+$/, "");
}

/** 是否具备社区能力（未配置 Strapi 地址时全部为本地空操作） */
export function communityAvailable(): boolean {
  return strapiBase().length > 0;
}

/** 从 URL 里取主机名（ENV.siteUrl 可能带协议和路径） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * 站点域名：优先取配置的对外地址，否则用当前页 hostname。
 * 用于让后端正确解析留言/投票归属哪个站点。
 */
export function siteDomain(): string {
  const fromEnv = ENV.siteUrl ? hostOf(ENV.siteUrl) : "";
  return fromEnv || (typeof location !== "undefined" ? location.hostname : "");
}

/** 稳定匿名访客 id（本地生成并持久化，用于投票去重与取消） */
export function visitorId(): string {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (saved) return saved;
    const id = randomId();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

function randomId(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    // 不支持 randomUUID 时走下面的兜底
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 读取本地投票状态（离线也能反映自己的选择） */
export function getVotes(): VoteState {
  try {
    const raw = localStorage.getItem(VOTE_KEY);
    if (!raw) return { liked: [], favorite: null };
    const p = JSON.parse(raw) as Partial<VoteState>;
    return {
      liked: Array.isArray(p.liked) ? p.liked.filter(isModeId) : [],
      favorite: typeof p.favorite === "string" && isModeId(p.favorite) ? p.favorite : null,
    };
  } catch {
    return { liked: [], favorite: null };
  }
}

function isModeId(v: unknown): v is ModeId {
  return typeof v === "string" && v.length > 0;
}

function saveVotes(v: VoteState): void {
  try {
    localStorage.setItem(VOTE_KEY, JSON.stringify(v));
  } catch {
    // 隐私模式下放弃持久化，不影响本次会话
  }
}

/**
 * 上报一次互动。成功返回服务端真实动作，失败（含未配置后端）返回 null。
 * 实现内部静默吞掉所有异常，绝不向调用方抛错。
 */
async function trackInteraction(
  type: "like",
  targetType: string,
  targetId: string,
): Promise<"created" | "removed" | null> {
  const base = strapiBase();
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/api/zhao-website/v1/interactions/track?domain=${encodeURIComponent(siteDomain())}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetType, targetId, visitorId: visitorId() }),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { action?: unknown } | null;
    const action = json?.action;
    return action === "created" || action === "removed" ? action : null;
  } catch {
    return null;
  }
}

/**
 * 切换某个玩法的点赞（可多选）。
 * 以服务端返回的真实动作为准来纠正本地状态；离线时按本地意图乐观切换。
 */
export async function toggleLike(mode: ModeId): Promise<void> {
  const v = getVotes();
  const had = v.liked.includes(mode);
  const action = await trackInteraction("like", TARGET_LIKE, mode);

  if (action === "created") {
    if (!v.liked.includes(mode)) v.liked.push(mode);
  } else if (action === "removed") {
    v.liked = v.liked.filter((m) => m !== mode);
  } else {
    // 未配置后端 / 网络失败：按本地意图切换，保证界面有反馈
    v.liked = had ? v.liked.filter((m) => m !== mode) : [...v.liked, mode];
  }
  saveVotes(v);
}

/**
 * 设置「最喜欢的一款」（单选互斥）：会先取消旧的选择，再投新的。
 * 传 null 表示取消当前选择。
 */
export async function setFavorite(mode: ModeId | null): Promise<void> {
  const v = getVotes();
  const prev = v.favorite;
  if (prev === mode) return;

  // 先撤旧的，再投新的（服务端是 toggle 语义）
  if (prev) await trackInteraction("like", TARGET_FAV, prev);
  if (mode) await trackInteraction("like", TARGET_FAV, mode);

  v.favorite = mode;
  saveVotes(v);
}

/**
 * 提交留言建议（昵称 + 内容）。
 * 注意：不要提交 website 字段（那是后端 honeypot，填了会被当成机器人丢弃）。
 */
export async function submitMessage(nickname: string, content: string): Promise<boolean> {
  const base = strapiBase();
  if (!base) return false;
  const text = content.trim();
  if (!text) return false;
  try {
    const res = await fetch(
      `${base}/api/zhao-website/v1/leads/submit?domain=${encodeURIComponent(siteDomain())}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "contact",
          contactName: nickname.trim(),
          message: text,
          sourceType: "game",
          sourceId: "xiaoxiaole",
          sourceUrl: typeof location !== "undefined" ? location.href : "",
        }),
      },
    );
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { success?: unknown } | null;
    return json?.success === true;
  } catch {
    return false;
  }
}

/**
 * 拉取「最受欢迎游戏」排行榜（zhao-website /interactions/stats，软删过滤、按 count 降序）。
 * 未配置后端或请求失败时返回 null，界面回退「正在统计中」占位。
 */
export async function fetchRanking(): Promise<RankRow[] | null> {
  const base = strapiBase();
  if (!base || !RANKING_PATH) return null;
  try {
    const res = await fetch(
      `${base}${RANKING_PATH}?domain=${encodeURIComponent(siteDomain())}&targetType=${TARGET_FAV}`,
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
    const rows = json?.data;
    if (!Array.isArray(rows)) return null;

    const out: RankRow[] = [];
    for (const r of rows) {
      const o = r as { targetId?: unknown; count?: unknown };
      if (typeof o.targetId === "string" && typeof o.count === "number") {
        out.push({ mode: o.targetId as ModeId, count: o.count });
      }
    }
    return out.sort((a, b) => b.count - a.count);
  } catch {
    return null;
  }
}
