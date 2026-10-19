/**
 * CrossGameApi — 跨游戏评分上报与离线补传
 *
 * 流程（与 nest cross-game-record 接口对接）：
 * - 结算时 submitCrossGameScore(level, metrics)：判定是否跨游戏关 → 算分 → 仅在 SSO 正式身份下上报。
 * - 游客态：不记录（拒绝游客），由结算页展示登录横幅，玩家主动跳 SSO 后才会在后续关卡落库。
 * - 离线/后端不可达（仅 SSO 用户）：payload 入 localStorage 队列，下次上线补传，保证不丢成绩。
 *
 * 身份：playerId 一律由后端从 JWT 解析，前端绝不上传 playerId（防伪造/写错人）。
 */

import { authStore } from "./AuthStore";
import { ENV } from "./Env";
import { computeCrossGameScore, type CrossGameScoreResult } from "./CrossGameScorer";
import { resolveTargetGame, isKnownTargetGame } from "../config/CrossGameMap";
import type { LevelConfig } from "../config/LevelConfig";
import type { LevelMetrics } from "../config/GameText";

const QUEUE_KEY = "bg_crossgame_pending_v1";
const ENDPOINT = "/api/client/v1/cross-game-records";

type PendingRecord = CrossGameScoreResult & { ts: number };

function readQueue(): PendingRecord[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PendingRecord[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* 隐私模式 / 配额不足时静默忽略 */
  }
}

/** 入队（同 targetGameId+levelId 仅保留最新一条待补传） */
function enqueue(r: CrossGameScoreResult): void {
  const items = readQueue().filter(
    (it) => !(it.targetGameId === r.targetGameId && it.levelId === r.levelId),
  );
  items.push({ ...r, ts: Date.now() });
  writeQueue(items);
}

/** 上报/入队一条评分结果（仅 SSO 登录态真正落库；其余入队） */
async function flushOne(r: CrossGameScoreResult): Promise<void> {
  if (!ENV.gameServerEnabled) {
    enqueue(r);
    return;
  }
  try {
    const res = await authStore.authedFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        targetGameId: r.targetGameId,
        levelId: r.levelId,
        mode: r.mode,
        score: r.score,
        axes: r.axes,
        rawMetrics: r.rawMetrics,
      }),
    });
    if (res.ok) return;
    // 4xx 业务错误（白名单拒收 48001 / 校验失败）不重试，避免死循环
    if (res.status >= 400 && res.status < 500) return;
    enqueue(r); // 5xx / 网络异常入队，待补传
  } catch {
    enqueue(r);
  }
}

/**
 * 结算时调用：判定跨游戏关 → 算分 → 上报（强制 SSO）。
 * 游客态不记录（直接返回），由结算页登录横幅引导登录；登录后重玩该关即落库。
 */
export async function submitCrossGameScore(
  level: LevelConfig,
  metrics: LevelMetrics,
): Promise<void> {
  const gameId = resolveTargetGame(level);
  if (!gameId) return; // 非跨游戏关卡：纯本地结算
  if (!isKnownTargetGame(gameId)) return; // 白名单保护（理论上 resolveTargetGame 已保证）
  const result = computeCrossGameScore(level.id, gameId, metrics);
  // 强制 SSO：游客态拒绝记录
  if (authStore.isGuest()) return;
  await flushOne(result);
}

/** 启动时 / 登录后调用：把离线队列里的待补传记录发出去（仅 SSO 登录态） */
export async function flushPendingCrossGameRecords(): Promise<void> {
  if (authStore.isGuest() || !ENV.gameServerEnabled) return;
  const items = readQueue();
  if (items.length === 0) return;
  writeQueue([]); // 先清空，失败项在 flushOne 内重新入队
  for (const it of items) {
    const { ts: _ts, ...r } = it;
    void _ts;
    await flushOne(r as CrossGameScoreResult);
  }
}
