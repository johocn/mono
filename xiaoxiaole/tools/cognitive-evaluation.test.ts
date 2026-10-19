import assert from "node:assert";
import { test } from "node:test";
import {
  evaluateCognitive,
  domainGapOf,
  DomainGap,
} from "../src/core/CognitiveEvaluation";
import { bandOf } from "../src/config/CognitiveTargets";
import { AxisScore, CognitiveProfile } from "../src/core/CognitiveProfile";

function axis(key: string, label: string, value: number): AxisScore {
  return { key, label, mode: "x", modeName: "x", value };
}

function profile(axes: AxisScore[], overall: number): CognitiveProfile {
  return {
    axes,
    history: [],
    trends: [],
    weakest: [],
    trainedCount: axes.filter((a) => a.value > 4).length,
    advice: [],
    overall,
  };
}

test("bandOf: 综合指数映射到定性带", () => {
  assert.equal(bandOf(95).label, "优秀");
  assert.equal(bandOf(80).label, "良好");
  assert.equal(bandOf(60).label, "稳步");
  assert.equal(bandOf(10).label, "需关注");
});

test("domainGapOf: 达标时 gap≤0 且 met=true", () => {
  const g: DomainGap = domainGapOf(axis("working_memory", "工作记忆", 80));
  assert.equal(g.target, 75);
  assert.equal(g.gap, -5);
  assert.equal(g.met, true);
});

test("domainGapOf: 未达标时 gap 为正", () => {
  const g: DomainGap = domainGapOf(axis("prospective_memory", "前瞻记忆", 50));
  assert.equal(g.gap, 25);
  assert.equal(g.met, false);
});

test("evaluateCognitive: 仅纳入已训练域(value>4)，最弱 3 项取最低未达标", () => {
  const p = profile(
    [
      axis("prospective_memory", "前瞻记忆", 50),
      axis("spatial_working_memory", "空间记忆", 52),
      axis("inhibitory_control", "抑制控制", 59),
      axis("processing_speed", "加工速度", 90), // 达标，不进 weakest
      axis("reminiscence", "怀旧记忆", 2), // 未训练，排除
    ],
    60,
  );
  const e = evaluateCognitive(p);
  assert.equal(e.overallCurrent, 60);
  assert.equal(e.overallGap, 15);
  assert.equal(e.band, "稳步");
  // 已训练域 4 个（value>4）：50,52,59,90
  assert.equal(e.domains.length, 4);
  // 最弱 3 项（未达标且最低）：50,52,59
  assert.equal(e.weakestGaps.length, 3);
  assert.deepEqual(
    e.weakestGaps.map((d) => d.key),
    ["prospective_memory", "spatial_working_memory", "inhibitory_control"],
  );
});

test("evaluateCognitive: 全部达标则 weakestGaps 为空", () => {
  const p = profile([axis("a", "甲", 80), axis("b", "乙", 90)], 85);
  const e = evaluateCognitive(p);
  assert.equal(e.weakestGaps.length, 0);
  assert.equal(e.band, "良好");
});
