/**
 * CognitiveProfile — 认知画像聚合服务（突出产品特色的核心资产）
 *
 * 把「逐关训练成绩」翻译成「13 维认知画像」：
 * - 当前各认知域得分（源自 ProgressStore.getRadar）
 * - 近 7 / 30 天趋势（源自每日雷达快照）
 * - 最弱维度与个性化建议（关联 COGNITIVE_MAP 的标准化测评映射）
 * - 对外可分享的「认知健康月报」文本
 *
 * 这些能力被「认知中心 / 我的画像 / 家属关怀」等场景复用，是区别于
 * 市面普通健脑游戏的关键卖点（多维评估 + 标准测评映射 + 可追踪趋势）。
 */

import { progress } from "./ProgressStore";
import { COGNITIVE_MAP, RADAR_AXES } from "../config/CognitiveMap";

export interface AxisScore {
  key: string;
  label: string;
  mode: string;
  modeName: string;
  value: number;
}

export interface RadarTrend {
  key: string;
  label: string;
  current: number;
  delta7: number;
  delta30: number;
}

export interface CognitiveProfile {
  axes: AxisScore[];
  history: { date: string; values: number[] }[];
  trends: RadarTrend[];
  weakest: AxisScore[];
  trainedCount: number;
  advice: string[];
  overall: number;
}

/** 把 "YYYY-MM-DD" 解析为本地日期（按天），便于计算天数差 */
function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function dayDiff(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / 86400000);
}

/** 找到距今天 targetDays 天前、且最接近的已记录快照 */
function snapshotAround(history: { date: string; values: number[] }[], targetDays: number): { date: string; values: number[] } | null {
  if (history.length === 0) return null;
  const today = parseDay(new Date().toISOString().slice(0, 10));
  let best: { date: string; values: number[] } | null = null;
  let bestDiff = Infinity;
  for (const h of history) {
    const diff = Math.abs(dayDiff(parseDay(h.date), today) - targetDays);
    if (diff < bestDiff) { bestDiff = diff; best = h; }
  }
  // 容差：±4 天，避免稀疏记录时取到太远的样本
  return bestDiff <= 4 ? best : null;
}

export function getCognitiveProfile(): CognitiveProfile {
  const radar = progress.getRadar();
  const history = progress.getRadarHistory();
  const mapByMode = new Map(COGNITIVE_MAP.map((m) => [m.mode, m]));

  const axes: AxisScore[] = RADAR_AXES.map((axis, i) => ({
    key: axis.key,
    label: axis.label,
    mode: axis.mode,
    modeName: mapByMode.get(axis.mode)?.modeName ?? axis.mode,
    value: radar[i].value,
  }));

  const trained = axes.filter((a) => a.value > 4);
  const trainedCount = trained.length;

  const past7 = snapshotAround(history, 7);
  const past30 = snapshotAround(history, 30);

  const trends: RadarTrend[] = axes.map((a, i) => ({
    key: a.key,
    label: a.label,
    current: a.value,
    delta7: past7 ? a.value - past7.values[i] : 0,
    delta30: past30 ? a.value - past30.values[i] : 0,
  }));

  const weakest = [...trained].sort((x, y) => x.value - y.value).slice(0, 3);

  const overall = trainedCount > 0
    ? Math.round(trained.reduce((s, a) => s + a.value, 0) / trainedCount)
    : 0;

  const advice = buildAdvice(weakest, overall, trainedCount);

  return { axes, history, trends, weakest, trainedCount, advice, overall };
}

function buildAdvice(weakest: AxisScore[], overall: number, trainedCount: number): string[] {
  const out: string[] = [];
  if (trainedCount === 0) {
    out.push("先挑一个喜欢的玩法玩一局，我们就能画出你的专属认知画像啦。");
    return out;
  }
  if (weakest.length > 0) {
    for (const w of weakest) {
      out.push(`「${w.modeName}」可以帮「${w.label}」练得更稳，今天就来一局吧。`);
    }
  }
  if (overall >= 80) {
    out.push("整体状态很棒，保持每天十分钟，脑子越用越灵光。");
  } else if (overall >= 50) {
    out.push("稳中有进，把弱项多练练，进步会更明显。");
  } else {
    out.push("慢慢来，每次一点点，咱们的训练就是为日常打底的。");
  }
  return out;
}

/**
 * 对外可分享的「认知健康月报」纯文本。
 * 同时服务老人（看得懂的进步）与对外讲价值（标准测评映射 + 多维覆盖）。
 */
export function buildMonthlyReport(): string {
  const p = getCognitiveProfile();
  const lines: string[] = [];
  lines.push("【岁月神偷 · 认知健康月报】");
  lines.push("");

  if (p.trainedCount === 0) {
    lines.push("还没有训练记录，开始第一局就能生成你的认知画像。");
    return lines.join("\n");
  }

  lines.push(`已训练认知域：${p.trainedCount} / ${RADAR_AXES.length}`);
  lines.push(`综合认知指数：${p.overall}（满分 100，基于各域训练表现）`);

  const improving = p.trends.filter((t) => t.delta7 > 0).length;
  if (improving > 0) {
    lines.push(`近 7 天有 ${improving} 项认知域在进步。`);
  }

  const top = [...p.axes].filter((a) => a.value > 4).sort((x, y) => y.value - x.value)[0];
  if (top) lines.push(`最强项：${top.label}（${top.value} 分）`);

  if (p.weakest.length > 0) {
    lines.push(`可加强：${p.weakest.map((w) => w.label).join("、")}`);
  }

  lines.push("");
  lines.push("本训练覆盖加工速度、执行功能、工作记忆、抑制控制、");
  lines.push("数感计算、前瞻记忆、时间定向等 13 项认知域，");
  lines.push("参考连线测验、画钟测验、Stroop、Corsi 等标准化思路设计，");
  lines.push("用生活化小游戏帮长辈日常锻炼脑子。");

  return lines.join("\n");
}

/**
 * 近 7 天「认知健康周报」纯文本（轻量、常看，适合每周发给家属）。
 * 与月报同源，但更聚焦本周变化与可立即行动的关怀点。
 */
export function buildWeeklyReport(): string {
  const p = getCognitiveProfile();
  const lines: string[] = [];
  lines.push("【岁月神偷 · 认知健康周报】");
  lines.push("");

  if (p.trainedCount === 0) {
    lines.push("这周还没有训练记录，陪长辈玩一局，周报就有内容啦。");
    return lines.join("\n");
  }

  lines.push(`综合认知指数：${p.overall}（满分 100）`);
  lines.push(`已训练认知域：${p.trainedCount} / ${RADAR_AXES.length}`);

  const improving = p.trends.filter((t) => t.delta7 > 0 && t.current > 4);
  if (improving.length > 0) {
    lines.push(`本周进步：${improving.slice(0, 3).map((t) => t.label).join("、")}`);
  } else {
    lines.push("本周暂无明显波动，保持每天十分钟就是在打底。");
  }

  const top = [...p.axes].filter((a) => a.value > 4).sort((x, y) => y.value - x.value)[0];
  if (top) lines.push(`最强项：${top.label}（${top.value} 分）`);
  if (p.weakest.length > 0) {
    lines.push(`可加强：${p.weakest.map((w) => w.label).join("、")}`);
  }

  const last = progress.getLastPlayed();
  const days = last > 0 ? Math.floor((Date.now() - last) / 86400000) : null;
  if (days !== null) {
    lines.push(days <= 0 ? "上次训练：今天" : `上次训练：${days} 天前`);
  }

  return lines.join("\n");
}
