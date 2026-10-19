import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCrossGameScore } from "../src/core/CrossGameScorer";
import type { LevelMetrics } from "../src/config/GameText";

function base(over: Partial<LevelMetrics>): LevelMetrics {
  return {
    mode: "match3",
    passed: true,
    score: 100,
    passTarget: 100,
    stepsUsed: 10,
    stepLimit: 20,
    paradigm: "train",
    totalQuestions: 0,
    maxSeqAchieved: 0,
    pairsTotal: 0,
    medianRT: 600,
    pmHits: 0,
    pmTargets: 0,
    pmFalseAlarms: 0,
    ...over,
  };
}

test("match3: 满分通过 → 综合分高且维度键齐全、均在 [0,100]", () => {
  const r = computeCrossGameScore(
    "1-1",
    "brain-processing-speed",
    base({ mode: "match3", score: 100, passTarget: 100, stepsUsed: 10, stepLimit: 20, medianRT: 600 }),
  );
  assert.equal(r.targetGameId, "brain-processing-speed");
  assert.equal(r.levelId, "1-1");
  assert.equal(r.mode, "match3");
  assert.ok(r.score >= 80 && r.score <= 100, `score=${r.score}`);
  assert.deepEqual(Object.keys(r.axes).sort(), ["accuracy", "speed", "stability"]);
  for (const v of Object.values(r.axes)) assert.ok(v >= 0 && v <= 100, `axis=${v}`);
});

test("准确率钳制：分数远超阈值也不超过 100", () => {
  const r = computeCrossGameScore("1-2", "brain-processing-speed", base({ score: 999, passTarget: 100 }));
  assert.equal(r.axes.accuracy, 100);
});

test("未通关整体打折：相同表现下 passed=false 综合分更低", () => {
  const pass = computeCrossGameScore(
    "1-3",
    "brain-processing-speed",
    base({ passed: true, score: 80, passTarget: 100 }),
  );
  const fail = computeCrossGameScore(
    "1-3",
    "brain-processing-speed",
    base({ passed: false, score: 80, passTarget: 100 }),
  );
  assert.ok(fail.score < pass.score, `fail=${fail.score} pass=${pass.score}`);
});

test("pm: 误报越多稳定性越低", () => {
  const clean = computeCrossGameScore(
    "2-1",
    "brain-prospective",
    base({ mode: "pm", score: 0, pmHits: 10, pmTargets: 10, pmFalseAlarms: 0 }),
  );
  const noisy = computeCrossGameScore(
    "2-1",
    "brain-prospective",
    base({ mode: "pm", score: 0, pmHits: 10, pmTargets: 10, pmFalseAlarms: 5 }),
  );
  assert.ok(noisy.axes.stability < clean.axes.stability, `noisy=${noisy.axes.stability} clean=${clean.axes.stability}`);
});

test("原始指标透传（仅数值字段，字符串/布尔不入）", () => {
  const r = computeCrossGameScore(
    "3-1",
    "brain-language",
    base({ mode: "poetry", score: 5, pairsTotal: 10 }),
  );
  assert.equal(r.rawMetrics.score, 5);
  assert.equal(r.rawMetrics.pairsTotal, 10);
  assert.equal(r.rawMetrics.mode, undefined);
  assert.equal(r.rawMetrics.passed, undefined);
});

test("综合分始终落在 [0,100]", () => {
  for (const m of [
    base({ passed: false, score: 0, passTarget: 100 }),
    base({ score: 100, passTarget: 100, medianRT: 50 }),
    base({ score: 100, passTarget: 100, medianRT: 5000 }),
    base({ mode: "stroop", score: 0, stepLimit: 20, medianRT: 3000 }),
  ]) {
    const r = computeCrossGameScore("x", "brain-language", m);
    assert.ok(r.score >= 0 && r.score <= 100, `score=${r.score}`);
  }
});

test("stroop: 反应时越短速度分越高", () => {
  const fast = computeCrossGameScore("4-1", "brain-inhibition", base({ mode: "stroop", score: 20, stepLimit: 20, medianRT: 450 }));
  const slow = computeCrossGameScore("4-1", "brain-inhibition", base({ mode: "stroop", score: 20, stepLimit: 20, medianRT: 1400 }));
  assert.ok(fast.axes.speed > slow.axes.speed, `fast=${fast.axes.speed} slow=${slow.axes.speed}`);
});

test("corsi: 准确率随正确轮数/尝试轮数梯度变化（不再恒为 1）", () => {
  const perfect = computeCrossGameScore(
    "5-1",
    "brain-spatial",
    base({ mode: "corsi", score: 6, stepsUsed: 6, maxSeqAchieved: 6 }),
  );
  const sloppy = computeCrossGameScore(
    "5-1",
    "brain-spatial",
    base({ mode: "corsi", score: 4, stepsUsed: 6, maxSeqAchieved: 6 }),
  );
  assert.equal(perfect.axes.accuracy, 100);
  assert.ok(sloppy.axes.accuracy < perfect.axes.accuracy, `sloppy=${sloppy.axes.accuracy}`);
  assert.ok(sloppy.axes.accuracy > 0, `sloppy>0=${sloppy.axes.accuracy}`);
});

test("face: 准确率按认对/总面孔数梯度（用 totalQuestions，非通关阈值）", () => {
  const all = computeCrossGameScore(
    "6-1",
    "brain-face-name",
    base({ mode: "face", score: 5, totalQuestions: 5, stepsUsed: 5, medianRT: 0, passTarget: 4 }),
  );
  const half = computeCrossGameScore(
    "6-1",
    "brain-face-name",
    base({ mode: "face", score: 2, totalQuestions: 5, stepsUsed: 5, medianRT: 0, passTarget: 4 }),
  );
  assert.equal(all.axes.accuracy, 100);
  assert.equal(half.axes.accuracy, 40);
  assert.ok(half.axes.accuracy < all.axes.accuracy);
});

test("match3-mem: 提供 memoryHitRate 时以其为主准确率（不取 score/passTarget）", () => {
  const r = computeCrossGameScore(
    "m-1",
    "brain-working-memory",
    base({ mode: "match3", score: 999, passTarget: 1, memoryHitRate: 0.6, stepsUsed: 10, stepLimit: 20 }),
  );
  assert.equal(r.axes.accuracy, 60);
  assert.equal(r.targetGameId, "brain-working-memory");
});

test("match3-mem: mismatchCount 降低稳定性", () => {
  const clean = computeCrossGameScore(
    "m-1",
    "brain-working-memory",
    base({ mode: "match3", score: 100, passTarget: 100, memoryHitRate: 1, stepsUsed: 5, stepLimit: 20, mismatchCount: 0 }),
  );
  const flawed = computeCrossGameScore(
    "m-1",
    "brain-working-memory",
    base({ mode: "match3", score: 100, passTarget: 100, memoryHitRate: 1, stepsUsed: 5, stepLimit: 20, mismatchCount: 3 }),
  );
  assert.ok(flawed.axes.stability < clean.axes.stability, `clean=${clean.axes.stability} flawed=${flawed.axes.stability}`);
});
