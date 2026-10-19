import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreShadowRecall,
  scorePairedClue,
  scoreDelayedRetention,
  scoreMemory,
} from "../src/core/MemoryMechanics";

test("shadow: 命中全部目标格 → 命中率 1", () => {
  const r = scoreShadowRecall(["0,0", "1,2", "2,1"], ["0,0", "1,2", "2,1"]);
  assert.equal(r.memoryHitRate, 1);
  assert.equal(r.mismatchCount, 0);
});

test("shadow: 仅命中 2/3 → 命中率 2/3，越界命中不计入", () => {
  const r = scoreShadowRecall(["0,0", "1,2", "2,1"], ["0,0", "1,2", "9,9"]);
  assert.ok(Math.abs(r.memoryHitRate - 2 / 3) < 1e-9);
});

test("shadow: 空目标集 → 命中率 1（无记忆负荷）", () => {
  assert.equal(scoreShadowRecall([], []).memoryHitRate, 1);
});

test("paired: 正确配对计命中，错配计误判", () => {
  const learned: [string, string][] = [["a", "b"], ["c", "d"], ["e", "f"]];
  const player: [string, string][] = [["b", "a"], ["c", "d"], ["x", "y"]]; // 第三对为错配（无序也判等）
  const r = scorePairedClue(learned, player);
  assert.equal(r.memoryHitRate, 2 / 3);
  assert.equal(r.mismatchCount, 1);
});

test("paired: 全部错配 → 命中率 0、误判数 = 配对数", () => {
  const r = scorePairedClue([["a", "b"]], [["a", "c"]]);
  assert.equal(r.memoryHitRate, 0);
  assert.equal(r.mismatchCount, 1);
});

test("delayed: 实际消除/要求 = 命中率，诱饵计误判", () => {
  const r = scoreDelayedRetention(4, 3, 2);
  assert.equal(r.memoryHitRate, 0.75);
  assert.equal(r.mismatchCount, 2);
});

test("delayed: 要求为 0 → 命中率 1", () => {
  assert.equal(scoreDelayedRetention(0, 0).memoryHitRate, 1);
});

test("scoreMemory 分派：shadow/paired/delayed 各自走到正确机制", () => {
  const shadow = scoreMemory(
    { type: "shadow", targetCount: 2, maskDelayMs: 1500 },
    { targetCells: ["0,0", "1,1"], clearedTargetCells: ["0,0"] },
  );
  assert.equal(shadow.memoryHitRate, 0.5);

  const paired = scoreMemory(
    { type: "paired", targetCount: 2, pairedPairs: 2, maskDelayMs: 1500 },
    { learnedPairs: [["a", "b"], ["c", "d"]], playerMatches: [["a", "b"], ["c", "x"]] },
  );
  assert.equal(paired.memoryHitRate, 0.5);
  assert.equal(paired.mismatchCount, 1);

  const delayed = scoreMemory(
    { type: "delayed", targetCount: 4, maskDelayMs: 1500, recallSteps: 3 },
    { actualClears: 4, luresCleared: 1 },
  );
  assert.equal(delayed.memoryHitRate, 1);
  assert.equal(delayed.mismatchCount, 1);
});
