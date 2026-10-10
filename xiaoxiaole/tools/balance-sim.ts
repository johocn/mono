/**
 * 难度平衡模拟器 — 用纯逻辑引擎跑蒙特卡洛，统计「随机可行解玩家」的分数分布
 *
 * 用途：为每一关设定合理的 passTarget / stepLimit，而不是拍脑袋定数字。
 * 之所以能做到，是因为 Match3Engine 零渲染依赖（可在 Node 里直接跑）。
 *
 * 运行：npm run balance
 */

import { Match3Engine, type HintMove } from "../src/modes/Match3Engine";
import { ALL_LEVELS, type LevelConfig } from "../src/config/LevelConfig";

interface Stats {
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  max: number;
  clearRate: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

/** 枚举当前所有可行交换 */
function allMoves(engine: Match3Engine): HintMove[] {
  const moves: HintMove[] = [];
  const rows = engine.getRows();
  const cols = engine.getCols();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (engine.isFrozen(c, r) || engine.isEmpty(c, r)) continue;
      if (c + 1 < cols && engine.wouldMatch(c, r, c + 1, r)) {
        moves.push({ a: { col: c, row: r }, b: { col: c + 1, row: r } });
      }
      if (r + 1 < rows && engine.wouldMatch(c, r, c, r + 1)) {
        moves.push({ a: { col: c, row: r }, b: { col: c, row: r + 1 } });
      }
    }
  }
  return moves;
}

function simulate(level: LevelConfig, games: number, seed?: number): Stats {
  void seed;
  const scores: number[] = [];
  let clears = 0;

  for (let g = 0; g < games; g++) {
    const engine = new Match3Engine();
    engine.init({ ...level, items: { ...level.items } });

    while (engine.getStepsLeft() > 0) {
      const moves = allMoves(engine);
      if (moves.length === 0) break;
      const move = moves[Math.floor(Math.random() * moves.length)];
      engine.swap(move.a.row, move.a.col, move.b.row, move.b.col);
    }

    const score = engine.getScore();
    scores.push(score);
    if (engine.isWon()) clears++;
  }

  scores.sort((a, b) => a - b);
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;

  return {
    mean: Math.round(mean),
    p10: percentile(scores, 0.1),
    p25: percentile(scores, 0.25),
    p50: percentile(scores, 0.5),
    p75: percentile(scores, 0.75),
    max: scores[scores.length - 1],
    clearRate: clears / games,
  };
}

const GAMES = 1500;
const match3Levels = ALL_LEVELS.filter((l) => l.mode === "match3");

console.log(`\n=== 三消难度平衡模拟（每关 ${GAMES} 局，策略=随机挑选一个可行交换）===\n`);
console.log("关卡   步数  当前目标   均值    p25    p50    p75   最大   过率");
console.log("-".repeat(74));

const suggestions: Record<string, number> = {};

for (const level of match3Levels) {
  const s = simulate(level, GAMES);
  const row = [
    level.id.padEnd(6),
    String(level.stepLimit).padStart(4),
    String(level.passTarget).padStart(8),
    String(s.mean).padStart(7),
    String(s.p25).padStart(6),
    String(s.p50).padStart(6),
    String(s.p75).padStart(6),
    String(s.max).padStart(6),
    `${(s.clearRate * 100).toFixed(1)}%`.padStart(7),
  ].join(" ");
  console.log(row);

  // 建议目标：让「随机可行解」玩家约 75% 通关 —— 取 p25，取整到 100 的倍数。
  // 老人向认知训练游戏的定位是「认真玩基本都能过，三星才需要技巧」，
  // 因此不用 p50（那样会有一半的局卡在失败上）。
  const raw = percentileFromStats(s, 0.25);
  suggestions[level.id] = Math.round(raw / 100) * 100;
}

function percentileFromStats(s: Stats, p: number): number {
  // 由分位点线性插值近似
  const table: [number, number][] = [
    [0, 0],
    [0.1, s.p10],
    [0.25, s.p25],
    [0.5, s.p50],
    [0.75, s.p75],
    [1, s.max],
  ];
  for (let i = 1; i < table.length; i++) {
    const [p0, v0] = table[i - 1];
    const [p1, v1] = table[i];
    if (p <= p1) {
      const t = (p - p0) / (p1 - p0);
      return v0 + (v1 - v0) * t;
    }
  }
  return s.max;
}

console.log("\n⚠ 注意：本建议仅对【普通三消关】有效，且仅用于校准【新量产关】。");
console.log("  - 旧版手调关（1-1..1-22）刻意更宽松作入门坡，不要据此拉高；");
console.log("  - jelly 关（如 1-21/1-24/1-30）passTarget=600 是星级阈值，胜负=清果冻，分数建议失真，忽略；");
console.log("  - timed 关（如 1-22/1-27/1-32）sim 用 stepLimit=999 跑、分数被放大失真，忽略。\n");
console.log("建议 passTarget（随机可行解玩家 ≈p25，取整到 100）:");
for (const [id, target] of Object.entries(suggestions)) {
  const lv = match3Levels.find((l) => l.id === id)!;
  const changed = target !== lv.passTarget;
  console.log(`  ${id}: ${lv.passTarget} -> ${target}${changed ? "  ← 需调整" : ""}`);
}
console.log("");
