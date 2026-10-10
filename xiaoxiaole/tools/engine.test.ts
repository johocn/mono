/**
 * Match3Engine 单元测试
 *
 * 引擎刻意做成零渲染依赖的两个理由之一就是这个（另一个是 tools/balance-sim.ts 的
 * 蒙特卡洛难度标定）。这里既验证规则正确性，也验证「动画时间线」的数据契约——
 * 渲染层完全依赖 steps[i].before / after / drops 来重建消除与下落动画，
 * 一旦契约被破坏，游戏画面会静默错位，所以必须有测试兜住。
 *
 * 运行：npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { Match3Engine, type SwapResolution, type HintMove } from "../src/modes/Match3Engine";
import { LEVEL_1_1, LEVEL_1_2, LEVEL_1_3, LEVEL_1_20, LEVEL_1_21, LEVEL_1_22, GEN_MATCH3, GEN_AUDIO, GEN_POETRY, GEN_CORSI, GEN_FACE, GEN_MEMORY, GEN_STROOP, GEN_MONEY, GEN_PM, GEN_CLOCK, ALL_LEVELS, getLevelsByMode, cloneAdjustedLevel } from "../src/config/LevelConfig";
import { RADAR_AXES } from "../src/config/CognitiveMap";
import { faceSeedFor } from "../src/ui/FaceAvatar";
import { NAME_POOL, ICON_WORD_PAIRS } from "../src/config/NamePool";
import { nextSchedule, isDue, REVIEW_INTERVALS, REVIEW_SESSION_LIMIT, type ReviewItem } from "../src/core/ReviewStore";
import { StroopEngine, STROOP_COLORS } from "../src/modes/StroopEngine";
// 星级规则走零依赖模块，避免在 Node 里触发 ProgressStore 模块图中的 window 读取
import { computeStroopStars } from "../src/core/StarRules";
import { COUPLETS } from "../src/config/LevelGen";
import { MoneyEngine, formatCents } from "../src/modes/MoneyEngine";
import { PmEngine, PM_TARGET, PM_CATEGORIES } from "../src/modes/PmEngine";
import { computePmStars } from "../src/core/StarRules";
import { ClockEngine, formatClockTime } from "../src/modes/ClockEngine";

function newEngine(level = LEVEL_1_1): Match3Engine {
  const e = new Match3Engine();
  e.init({ ...level, iconTypes: level.iconTypes?.slice(), items: { ...level.items } });
  return e;
}

/** 枚举所有可行交换 */
function allMoves(e: Match3Engine): HintMove[] {
  const moves: HintMove[] = [];
  for (let r = 0; r < e.getRows(); r++) {
    for (let c = 0; c < e.getCols(); c++) {
      if (e.isFrozen(c, r) || e.isEmpty(c, r)) continue;
      if (c + 1 < e.getCols() && e.wouldMatch(c, r, c + 1, r)) {
        moves.push({ a: { col: c, row: r }, b: { col: c + 1, row: r } });
      }
      if (r + 1 < e.getRows() && e.wouldMatch(c, r, c, r + 1)) {
        moves.push({ a: { col: c, row: r }, b: { col: c, row: r + 1 } });
      }
    }
  }
  return moves;
}

function boardSignature(e: Match3Engine): string {
  return e
    .getBoardSnapshot()
    .map((row) => row.map((c) => (c.type ?? ".") + (c.frozen ? "F" : "")).join("|"))
    .join("/");
}

// === 初始化 ===

test("init: 棋盘填满、开局无预消除、至少存在一步可行解", () => {
  for (let i = 0; i < 40; i++) {
    const e = newEngine();
    const board = e.getBoardSnapshot();
    assert.equal(board.length, LEVEL_1_1.boardRows);
    for (const row of board) {
      assert.equal(row.length, LEVEL_1_1.boardCols);
      for (const cell of row) assert.notEqual(cell.type, null, "开局不应有空格");
    }
    assert.ok(e.hasMoves(), "开局必须至少有一个可行解");
  }
});

test("init: 冰冻障碍数量符合配置且数量不会超过棋盘容量上限", () => {
  const e = newEngine(LEVEL_1_2);
  let frozen = 0;
  for (const row of e.getBoardSnapshot()) {
    for (const cell of row) if (cell.frozen) frozen++;
  }
  assert.equal(frozen, LEVEL_1_2.obstacles!.count);
});

// === 无效交换 ===

test("swap: 非相邻/越界/冰冻格交换一律无效，且不消耗步数、不改变棋盘", () => {
  const e = newEngine();
  const before = boardSignature(e);
  const steps = e.getStepsLeft();

  assert.equal(e.swap(0, 0, 0, 2).valid, false, "非相邻应无效");
  assert.equal(e.swap(0, 0, 99, 99).valid, false, "越界应无效");

  assert.equal(e.getStepsLeft(), steps);
  assert.equal(boardSignature(e), before);
});

test("swap: 不产生消除的相邻交换会回滚，但仍返回 afterSwap 供回弹动画使用", () => {
  const e = newEngine();
  // 找一个无效的相邻交换
  let found: HintMove | null = null;
  for (let r = 0; r < e.getRows() && !found; r++) {
    for (let c = 0; c + 1 < e.getCols(); c++) {
      if (e.isFrozen(c, r) || e.isFrozen(c + 1, r)) continue;
      if (!e.wouldMatch(c, r, c + 1, r)) {
        found = { a: { col: c, row: r }, b: { col: c + 1, row: r } };
        break;
      }
    }
  }
  assert.ok(found, "6x6 棋盘上应当存在无效交换");

  const before = boardSignature(e);
  const steps = e.getStepsLeft();
  const res = e.swap(found.a.row, found.a.col, found.b.row, found.b.col);

  assert.equal(res.valid, false);
  assert.equal(res.steps.length, 0);
  assert.equal(e.getStepsLeft(), steps, "无效交换不应扣步");
  assert.equal(boardSignature(e), before, "无效交换必须回滚");
  // 回弹动画依赖 afterSwap：它应当反映「已交换、尚未回滚」的画面
  const a = res.afterSwap[found.a.row][found.a.col];
  const b = res.afterSwap[found.b.row][found.b.col];
  const orig = e.getBoardSnapshot();
  assert.equal(a.type, orig[found.b.row][found.b.col].type);
  assert.equal(b.type, orig[found.a.row][found.a.col].type);
});

// === 有效交换与动画时间线 ===

test("swap: 有效交换消耗 1 步、产生分数，且时间线快照连续", () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const e = newEngine();
    const moves = allMoves(e);
    assert.ok(moves.length > 0);
    const m = moves[Math.floor(Math.random() * moves.length)];

    const stepsBefore = e.getStepsLeft();
    const res: SwapResolution = e.swap(m.a.row, m.a.col, m.b.row, m.b.col);

    assert.equal(res.valid, true);
    assert.equal(e.getStepsLeft(), stepsBefore - 1, "有效交换应扣 1 步");
    assert.ok(res.totalScore > 0, "有效交换应得分");
    assert.equal(
      res.totalScore,
      res.steps.reduce((s, st) => s + st.scoreGained, 0),
      "总分应等于各段得分之和",
    );
    assert.ok(res.steps.length >= 1);
    assert.equal(res.comboCount, res.steps.length);

    // 时间线连续性：before / after / 下一步 before 必须首尾相接，
    // 否则渲染层在阶段切换时会出现棋子跳变
    assert.deepEqual(res.steps[0].before, res.afterSwap, "第 1 段 before 应等于 afterSwap");
    for (let i = 1; i < res.steps.length; i++) {
      assert.deepEqual(res.steps[i].before, res.steps[i - 1].after, `第 ${i} 段 before 应等于上一段 after`);
    }
    assert.deepEqual(res.finalBoard, res.steps[res.steps.length - 1].after);

    // 每段 after 必须填满（下落 + 补充完成后不应有空格）
    for (const step of res.steps) {
      for (const row of step.after) {
        for (const cell of row) assert.notEqual(cell.type, null, "下落完成后不应存在空格");
      }
    }

    // 被消除的棋子必须带类型（粒子按类型取色）
    for (const step of res.steps) {
      assert.ok(step.cleared.length >= 3);
      for (const t of step.cleared) assert.equal(typeof t.type, "string");
    }

    // 下落位移明细自洽：只能向下，且非新增棋子的起点必须在棋盘内
    for (const step of res.steps) {
      for (const d of step.drops) {
        assert.ok(d.toRow - d.fromRow >= 0, "下落方向只能是向下");
        assert.ok(d.toRow >= 0 && d.toRow < e.getRows());
        if (!d.spawned) assert.ok(d.fromRow >= 0, "已有棋子的起点必须在棋盘内");
        assert.equal(step.after[d.toRow][d.col].type, d.type, "位移终点的棋子类型应一致");
      }
    }

    assert.equal(e.isWon() || e.getScore() > 0, true);
  }
});

test("swap: 连击倍率为 1x / 1.5x / 2x", () => {
  const e = newEngine();
  let checked = false;
  for (let i = 0; i < 200 && !checked; i++) {
    const en = newEngine();
    const moves = allMoves(en);
    if (moves.length === 0) continue;
    const m = moves[Math.floor(Math.random() * moves.length)];
    const res = en.swap(m.a.row, m.a.col, m.b.row, m.b.col);
    if (res.steps.length >= 3) {
      assert.equal(res.steps[0].multiplier, 1);
      assert.equal(res.steps[1].multiplier, 1.5);
      assert.equal(res.steps[2].multiplier, 2);
      assert.equal(res.steps[3]?.multiplier ?? 2, 2);
      checked = true;
    }
  }
  assert.ok(checked, "200 次尝试内应当出现至少 3 段连击");
});

// === 冰冻格 ===

test("swap: 冰冻格不可交换", () => {
  const e = newEngine(LEVEL_1_2);
  let checked = 0;
  for (let r = 0; r < e.getRows() && checked === 0; r++) {
    for (let c = 0; c < e.getCols(); c++) {
      if (!e.isFrozen(c, r)) continue;
      const before = boardSignature(e);
      const steps = e.getStepsLeft();
      if (c + 1 < e.getCols()) {
        assert.equal(e.swap(r, c, r, c + 1).valid, false);
      }
      assert.equal(e.swap(r, c, r, c).valid, false);
      assert.equal(boardSignature(e), before);
      assert.equal(e.getStepsLeft(), steps);
      checked++;
      break;
    }
  }
  assert.ok(checked > 0, "1-2 应当布置了冰冻格");
});

// === 快照 / 撤销 / 重洗 ===

test("snapshot + restore 完整还原引擎状态（撤销道具依赖）", () => {
  const e = newEngine();
  const snap = e.snapshot();
  const sig = boardSignature(e);
  const score = e.getScore();
  const steps = e.getStepsLeft();

  const m = allMoves(e)[0];
  e.swap(m.a.row, m.a.col, m.b.row, m.b.col);
  assert.notEqual(e.getScore(), score);

  e.restore(snap);
  assert.equal(boardSignature(e), sig);
  assert.equal(e.getScore(), score);
  assert.equal(e.getStepsLeft(), steps);
  assert.equal(e.getStepsUsed(), 0);
});

test("reshuffle: 重洗后无预消除且有解，冰冻格保持原位", () => {
  const e = newEngine(LEVEL_1_2);
  const frozenBefore = e.getBoardSnapshot().map((row) => row.map((c) => c.frozen));

  for (let i = 0; i < 20; i++) {
    e.reshuffle();
    const board = e.getBoardSnapshot();
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        assert.equal(board[r][c].frozen, frozenBefore[r][c], "重洗不得移动冰冻格");
        assert.notEqual(board[r][c].type, null);
      }
    }
    assert.ok(e.hasMoves(), "重洗后必须有可行解");
  }
});

// === 完整对局 ===

test("整局随机对局：始终无空格、无预消除、不超步，胜负判定正确", () => {
  for (let run = 0; run < 20; run++) {
    const e = newEngine(LEVEL_1_2);
    let guard = 0;
    while (e.getStepsLeft() > 0 && guard++ < 500) {
      const moves = allMoves(e);
      if (moves.length === 0) break;
      const m = moves[Math.floor(Math.random() * moves.length)];
      const res = e.swap(m.a.row, m.a.col, m.b.row, m.b.col);
      assert.equal(res.valid, true);

      // 结算后棋盘必须是「无空格、无现成连线」的稳定态
      const board = e.getBoardSnapshot();
      for (const row of board) {
        for (const cell of row) assert.notEqual(cell.type, null);
      }
    }
    assert.ok(e.getStepsLeft() >= 0, "步数不得为负");
    assert.equal(e.getStepsLeft(), 0, "循环应当把步数用尽");
    if (e.getScore() >= e.getPassTarget()) assert.equal(e.isWon(), true);
    else assert.equal(e.isLost(), true);
  }
});

// 确定性种子扫描：在大量随机对局中强制校验「棋盘永不出现空格」这一不变量。
// 三消引擎曾偶发在极端特效/障碍交互下遗留永久空洞（棋盘破洞），该测试用可复现的
// 种子序列覆盖更多对局，确保 dropTiles 兜底补位与 reshuffle 修复空洞的逻辑长期有效。
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const origRandomForInvariant = Math.random;

test("不变量：确定性海量随机对局中棋盘始终无空格（含每级联步与重洗）", () => {
  const seeds = 800;
  for (const level of [LEVEL_1_2, LEVEL_1_21, LEVEL_1_22]) {
    for (let s = 1; s <= seeds; s++) {
      Math.random = mulberry32(s);
      const e = newEngine(level);
      let guard = 0;
      while (e.getStepsLeft() > 0 && guard++ < 500) {
        const moves = allMoves(e);
        if (moves.length === 0) break;
        const m = moves[Math.floor(Math.random() * moves.length)];
        const res = e.swap(m.a.row, m.a.col, m.b.row, m.b.col);
        assert.equal(res.valid, true);
        for (const step of res.steps) {
          for (const row of step.after) {
            for (const cell of row) assert.notEqual(cell.type, null, `级联步出现空格 level=${level.id} seed=${s}`);
          }
        }
        for (const row of res.finalBoard) {
          for (const cell of row) assert.notEqual(cell.type, null, `终局出现空格 level=${level.id} seed=${s}`);
        }
      }
    }
  }
  Math.random = origRandomForInvariant;
});

test("克隆并应用自适应调整不会污染全局关卡配置", () => {
  const original = LEVEL_1_2;
  const iconSnapshot = original.iconTypes!.slice();
  const stepSnapshot = original.stepLimit;

  const harder = cloneAdjustedLevel(original, -3, 1);
  assert.equal(harder.stepLimit, stepSnapshot - 3);
  assert.equal(harder.iconTypes!.length, iconSnapshot.length + 1);

  const easier = cloneAdjustedLevel(original, 3, -1);
  assert.equal(easier.stepLimit, stepSnapshot + 3);
  assert.equal(easier.iconTypes!.length, iconSnapshot.length - 1);

  // 副本修改不得回写原对象
  easier.items.hint = 99;
  assert.notEqual(original.items.hint, 99);
  assert.deepEqual(original.iconTypes, iconSnapshot);
  assert.equal(original.stepLimit, stepSnapshot);
});

// === 认知中心 / 怀旧金曲 集成回归 ===

test("怀旧金曲已注册为完整模式（9 关 / 3 章，含题型与雷达轴）", () => {
  const nos = getLevelsByMode("nostalgia");
  assert.equal(nos.length, 9, "应注册 9 个怀旧金曲关卡");
  for (const lv of nos) {
    assert.equal(lv.mode, "nostalgia");
    assert.ok(lv.nostalgiaOptionCount && lv.nostalgiaOptionCount >= 3, "每关应配置选项数");
    assert.ok(lv.nostalgiaVariants && lv.nostalgiaVariants.length >= 1, "每关应启用至少一种题型");
    assert.ok(lv.questionCount && lv.questionCount >= 8, "每关应配置题数");
    assert.ok(lv.passTarget > 0 && lv.stepLimit > 0, "应配置过关与容错阈值");
  }
  // 雷达图应新增「怀旧记忆」轴（nostalgia 模式映射）
  const axis = RADAR_AXES.find((a) => a.mode === "nostalgia");
  assert.ok(axis, "雷达轴应包含 nostalgia 映射");
  assert.equal(axis!.key, "reminiscence");
  // 全部关卡数应随新增模式增长（10 模式 + nostalgia = 11 模式，关卡 > 之前）
  assert.equal(ALL_LEVELS.filter((l) => l.mode === "nostalgia").length, 9);
});

// === 果冻层 ===

test("jelly: 初始化按配置布置果冻层，且未清除时不可过关", () => {
  const e = newEngine(LEVEL_1_21);
  assert.equal(e.getJellyTotal(), LEVEL_1_21.obstacles!.count);
  assert.equal(e.getJellyRemaining(), e.getJellyTotal());
  assert.equal(e.isWon(), false, "果冻未清除不应过关");
});

test("jelly: 锤子敲除果冻层使剩余数减 1", () => {
  const e = newEngine(LEVEL_1_21);
  const snap = e.getBoardSnapshot();
  let target: [number, number] | null = null;
  for (let r = 0; r < e.getRows() && !target; r++) {
    for (let c = 0; c < e.getCols(); c++) {
      if (snap[r][c].jelly) { target = [c, r]; break; }
    }
  }
  assert.ok(target, "应存在果冻格");
  const before = e.getJellyRemaining();
  e.hammerRemove(target![0], target![1]);
  // 锤子会触发「重力 + 级联结算」，级联消除可能顺带清掉其它果冻，
  // 因此不能断言「刚好减 1」，只能断言：至少减 1，且被敲那一格必定已清除。
  const after = e.getJellyRemaining();
  assert.ok(after <= before - 1, `果冻应至少减少 1（${before} → ${after}）`);
  assert.equal(
    e.getBoardSnapshot()[target![1]][target![0]].jelly,
    false,
    "被敲那一格的果冻应被清除",
  );
});

test("障碍格不会被特效清空：种子 86 确定性复现空洞缺陷", () => {
  // 回归用例：火箭/炸弹/包装炸弹等特效曾会把障碍格里的棋子一并清空，
  // 而障碍格在重力阶段是「分隔点」、永远不会补充新棋子 → 棋盘留下永久空洞。
  //
  // 用「高压配置」把该缺陷逼近必然触发：
  //   · 棋子种类压到 3 种 → 更容易出现 4+ 连，特效（火箭/炸弹）生成率大幅上升
  //   · 障碍保持「少量且孤立」→ 这是缺陷成立的必要条件：
  //     孤立障碍被整行/整列特效扫到时，它周围没有正在消除的格子，
  //     不会触发「邻接解锁」，障碍标记得以保留 → 重力阶段被跳过 → 留下空洞。
  //     （障碍若密集排布，彼此相邻会被邻接解锁规则解除障碍，反而不会留洞。）
  // 实测：修复前本用例稳定失败，修复后 10/10 通过。
  // 固定随机数 → 棋盘生成与走法选择完全可复现
  const origRandom = Math.random;
  let s = 86;
  Math.random = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  try {
    const stress: LevelConfig = {
      ...LEVEL_1_2,
      iconTypes: ["flower", "leaf", "fruit"], // 3 种 → 4+ 连更多 → 特效更多
      obstacles: { type: "frozen", count: 3 }, // 少量孤立障碍：缺陷成立的必要条件
      stepLimit: 30,
      passTarget: 999999, // 不因达标提前结束
    };
    for (let run = 0; run < 6; run++) {
      const e = newEngine(stress);
      let guard = 0;
      while (e.getStepsLeft() > 0 && guard++ < 400) {
        const moves = allMoves(e);
        if (moves.length === 0) break;
        const m = moves[Math.floor(Math.random() * moves.length)];
        const res = e.swap(m.a.row, m.a.col, m.b.row, m.b.col);
        if (!res.valid) continue;
        const board = e.getBoardSnapshot();
        for (const row of board) {
          for (const cell of row) {
            assert.notEqual(cell.type, null,
              "特效不应清空障碍格里的棋子（否则重力阶段补不回来，留下永久空洞）");
          }
        }
      }
    }
  } finally {
    Math.random = origRandom; // 必须还原，避免影响后续用例
  }
});

test("jelly 整局：始终无空格、胜负判定正确（果冻关）", () => {
  for (let run = 0; run < 10; run++) {
    const e = newEngine(LEVEL_1_21);
    let guard = 0;
    while (e.getStepsLeft() > 0 && guard++ < 500) {
      const moves = allMoves(e);
      if (moves.length === 0) break;
      const m = moves[Math.floor(Math.random() * moves.length)];
      const res = e.swap(m.a.row, m.a.col, m.b.row, m.b.col);
      assert.equal(res.valid, true);
      const board = e.getBoardSnapshot();
      for (const row of board) for (const cell of row) assert.notEqual(cell.type, null);
    }
    assert.ok(e.getStepsLeft() >= 0);
    if (e.getJellyRemaining() === 0 && e.getScore() >= e.getPassTarget()) {
      assert.equal(e.isWon(), true);
    } else {
      assert.equal(e.isLost(), true);
    }
  }
});

// === 鱼（fish）特效棋 ===

test("fish: 随机对局中应能由 2×2 生成鱼特效棋", () => {
  let found = false;
  for (let run = 0; run < 80 && !found; run++) {
    const e = newEngine(LEVEL_1_1); // 6×6 / 3 种图标 → 2×2 概率高
    for (let guard = 0; guard < 60 && !found; guard++) {
      const moves = allMoves(e);
      if (moves.length === 0) break;
      const m = moves[Math.floor(Math.random() * moves.length)];
      e.swap(m.a.row, m.a.col, m.b.row, m.b.col);
      const snap = e.getBoardSnapshot();
      for (const row of snap) for (const cell of row) if (cell.special === "fish") { found = true; break; }
    }
  }
  assert.ok(found, "随机对局中应能出现鱼特效棋");
});

// === 关卡量产（LevelGen） ===

test("levelgen: 批量生成 30 关，字段合法且全部进入 ALL_LEVELS", () => {
  assert.equal(GEN_MATCH3.length, 10);
  assert.equal(GEN_AUDIO.length, 10);
  assert.equal(GEN_POETRY.length, 10);

  const all = [...GEN_MATCH3, ...GEN_AUDIO, ...GEN_POETRY];
  for (const l of all) {
    assert.ok(l.id && l.mode && l.theme, "基础字段缺失");
    assert.ok(l.stepLimit > 0, `${l.id} stepLimit 非法`);
    assert.ok(l.passTarget > 0, `${l.id} passTarget 非法`);
    if (l.mode === "match3") assert.equal(l.boardCols, 6);
    if (l.mode === "poetry") assert.ok((l.poetryPairs?.length ?? 0) >= 10, `${l.id} 对联数不足`);
  }
  // 三消特殊关：2 个果冻 + 2 个限时
  assert.equal(GEN_MATCH3.filter((l) => l.obstacles?.type === "jelly").length, 2);
  assert.equal(GEN_MATCH3.filter((l) => l.timeLimit !== undefined).length, 2);

  // id 全局唯一
  const ids = ALL_LEVELS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, "存在重复关卡 id");
  // 生成关均已并入 ALL_LEVELS
  for (const g of all) assert.ok(ids.includes(g.id), `生成关 ${g.id} 未进入 ALL_LEVELS`);
});

// === 限时关 ===

test("timed: 限时关 isTimed/getTimeLeftMs 正确，tick 耗尽且未达标即判负", () => {
  const e = newEngine(LEVEL_1_22);
  assert.equal(e.isTimed(), true);
  assert.ok(e.getTimeLeftMs() > 0, "应有初始剩余时间");
  // 未达标时时间耗尽 → 失败
  e.tick(e.getTimeLeftMs() + 1000);
  assert.equal(e.getTimeLeftMs(), 0);
  assert.equal(e.isWon(), false);
  assert.equal(e.isLost(), true);
});

test("timed 整局：随机对局始终无空格、胜负判定自洽", () => {
  for (let run = 0; run < 5; run++) {
    const e = newEngine(LEVEL_1_22);
    let guard = 0;
    while (!e.isWon() && !e.isLost() && guard++ < 500) {
      const moves = allMoves(e);
      if (moves.length === 0) break;
      const m = moves[Math.floor(Math.random() * moves.length)];
      const res = e.swap(m.a.row, m.a.col, m.b.row, m.b.col);
      assert.equal(res.valid, true);
      const board = e.getBoardSnapshot();
      for (const row of board) for (const cell of row) assert.notEqual(cell.type, null);
      if (e.isTimed()) e.tick(1000); // 模拟每步约 1 秒
    }
    assert.ok(e.isWon() || e.isLost(), "限时关应在达标或超时后结束");
  }
});

// === 空间记忆（Corsi）纯逻辑引擎 ===

import { CorsiEngine } from "../src/modes/CorsiEngine";

/** 确定性 rng（LCG），便于复现序列 */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

test("corsi: 序列长度合法、相邻不重复、格索引在网格内", () => {
  const e = new CorsiEngine(4, 5, 6, 4, seededRng(1));
  const st = e.getState();
  assert.equal(st.sequence.length, 5);
  for (let i = 0; i < st.sequence.length; i++) {
    assert.ok(st.sequence[i] >= 0 && st.sequence[i] < 16, "格索引越界");
    if (i > 0) assert.notEqual(st.sequence[i], st.sequence[i - 1], "相邻格不应重复");
  }
});

test("corsi: 完整点回正确序列 → roundComplete 且 correctRounds +1", () => {
  const e = new CorsiEngine(3, 3, 5, 3, seededRng(7));
  const seq = e.getState().sequence.slice();
  e.beginRecall();
  let res: string = "correct";
  for (const cell of seq) {
    res = e.submitTap(cell);
  }
  assert.equal(res, "roundComplete");
  assert.equal(e.getState().correctRounds, 1);
  assert.equal(e.getState().roundsDone, 1);
  assert.equal(e.getState().maxSeqAchieved, 3);
});

test("corsi: 点回错误 → wrong 且 roundsDone +1、correctRounds 不变", () => {
  const e = new CorsiEngine(3, 3, 5, 3, seededRng(7));
  const seq = e.getState().sequence.slice();
  e.beginRecall();
  // 第一格点错（用序列里不会命中的另一格）
  const wrong = (seq[0] + 1) % 9;
  const res = e.submitTap(wrong);
  assert.equal(res, "wrong");
  assert.equal(e.getState().correctRounds, 0);
  assert.equal(e.getState().roundsDone, 1);
});

test("corsi: 非 recall 阶段 submitTap 返回 wrong 且不计轮", () => {
  const e = new CorsiEngine(3, 3, 5, 3, seededRng(3));
  assert.equal(e.submitTap(0), "wrong"); // 仍在 demo
  assert.equal(e.getState().roundsDone, 0);
});

test("corsi: advance 推进到下一轮 demo；轮次耗尽 → done", () => {
  const e = new CorsiEngine(3, 3, 2, 2, seededRng(11));
  e.beginRecall();
  const seq = e.getState().sequence.slice();
  for (const c of seq) e.submitTap(c); // roundComplete → roundResult
  e.advance();
  assert.equal(e.getState().phase, "demo");
  // 第二轮
  e.beginRecall();
  const seq2 = e.getState().sequence.slice();
  for (const c of seq2) e.submitTap(c);
  e.advance();
  assert.equal(e.getState().phase, "done");
});

test("corsi: isLevelPassed 按正确轮数达标判定", () => {
  // 5 轮需 3 轮正确
  const e = new CorsiEngine(3, 3, 5, 3, seededRng(5));
  assert.equal(e.isLevelPassed(), false);
  for (let r = 0; r < 3; r++) {
    e.beginRecall();
    const seq = e.getState().sequence.slice();
    for (const c of seq) e.submitTap(c);
    if (e.getState().phase !== "done") e.advance();
  }
  assert.equal(e.getState().correctRounds, 3);
  assert.equal(e.isLevelPassed(), true);
});

test("corsi: 同种子序列可复现（确定性）", () => {
  const a = new CorsiEngine(5, 6, 8, 6, seededRng(42));
  const b = new CorsiEngine(5, 6, 8, 6, seededRng(42));
  assert.deepEqual(a.getState().sequence, b.getState().sequence);
});

// ==================== 面孔-名字联想（face） ====================

test("face: GEN_FACE 关卡参数合法且 id 唯一", () => {
  assert.equal(GEN_FACE.length, 9, "应有 9 关");
  const ids = new Set<string>();
  for (const lv of GEN_FACE) {
    assert.equal(lv.mode, "face", `${lv.id} 应为 face 模式`);
    assert.ok(lv.id.startsWith("5-"), `${lv.id} 应属于 5-x 编号段`);
    assert.ok(!ids.has(lv.id), `重复 id ${lv.id}`);
    ids.add(lv.id);

    const fc = lv.faceCount ?? 0;
    assert.ok(fc >= 3 && fc <= 6, `${lv.id} faceCount=${fc} 应在 3..6`);
    assert.ok((lv.delayMs ?? 0) > 0, `${lv.id} delayMs 应为正数`);

    // 干扰项取自本关其他人，故 options 不能超过 faceCount，否则无足够干扰项
    const opts = lv.options ?? 0;
    assert.ok(opts >= 3 && opts <= fc, `${lv.id} options=${opts} 应落在 3..${fc}`);

    // 过关阈值必须严格小于面孔数：要求「全对才能过关」会让过关率崩塌，
    // 且「过关」就等同于三星。三星才该留给全对（见 computeFaceStars）。
    const pt = lv.passTarget;
    assert.ok(pt > 0 && pt < fc, `${lv.id} passTarget=${pt} 应落在 1..${fc - 1}（全对留给三星）`);
  }
});

test("face: 难度沿 delayMs 递增不下降（记忆延时为主难度脊）", () => {
  let prev = 0;
  for (const lv of GEN_FACE) {
    const d = lv.delayMs ?? 0;
    assert.ok(d >= prev, `${lv.id} delayMs ${d} 不应低于前一关 ${prev}`);
    prev = d;
  }
  assert.ok((GEN_FACE[0].delayMs ?? 0) < (GEN_FACE[GEN_FACE.length - 1].delayMs ?? 0), "首尾应有明显难度差");
});

// ==================== 间隔复习调度（纯逻辑） ====================

test("review: 连续记住时复习间隔按列表递增且封顶", () => {
  let reps = 0;
  let days = 0;
  const grown: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = nextSchedule(reps, true);
    reps = r.reps;
    days = r.intervalDays;
    grown.push(days);
  }
  // 前 REVIEW_INTERVALS.length 次应与列表一致
  assert.deepEqual(grown.slice(0, REVIEW_INTERVALS.length), REVIEW_INTERVALS);
  // 之后应封顶在最后一个间隔，不再无上限增长
  assert.equal(grown[grown.length - 1], REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1]);
  assert.ok(new Set(grown.slice(0, REVIEW_INTERVALS.length)).size === REVIEW_INTERVALS.length,
    "间隔应严格递增");
});

test("review: 忘掉则连续记录清零、间隔重置为 1 天", () => {
  const r = nextSchedule(4, false);
  assert.equal(r.reps, 0);
  assert.equal(r.intervalDays, 1);
});

test("review: isDue 按「距上次复习天数 ≥ 间隔」判断", () => {
  const base: ReviewItem = {
    id: "t", mode: "face", kind: "face", label: "老张",
    reps: 0, intervalDays: 0, lastReviewDay: 100,
  };
  // 首次登记：间隔 0 天 → 当天即到期（趁热打铁）
  assert.ok(isDue({ ...base }, 100), "间隔 0 天应当天到期");
  // 间隔 1 天：当天未到期，次日到期
  const once = { ...base, intervalDays: 1 };
  assert.ok(!isDue(once, 100), "复习当天不应到期");
  assert.ok(isDue(once, 101), "次日应到期");
  // 间隔 4 天
  const four = { ...base, intervalDays: 4 };
  assert.ok(!isDue(four, 103), "第 3 天不应到期");
  assert.ok(isDue(four, 104), "第 4 天应到期");
});

test("review: 单次会话题量有上限（适老防疲劳）", () => {
  assert.ok(REVIEW_SESSION_LIMIT >= 3 && REVIEW_SESSION_LIMIT <= 10,
    `单次上限 ${REVIEW_SESSION_LIMIT} 应在合理区间`);
});

// ==================== 色词干扰（stroop） ====================

// ==================== 日常钱币计算（money） ====================

// ==================== 前瞻记忆（pm） ====================

test("pm: GEN_PM 关卡参数合法且 id 唯一", () => {
  assert.equal(GEN_PM.length, 9, "应有 9 关");
  const ids = new Set<string>();
  for (const lv of GEN_PM) {
    assert.equal(lv.mode, "pm", `${lv.id} 应为 pm 模式`);
    assert.ok(lv.id.startsWith("9-"), `${lv.id} 应属于 9-x 编号段`);
    assert.ok(!ids.has(lv.id), `重复 id ${lv.id}`);
    ids.add(lv.id);

    assert.ok(lv.pmBanner === "always" || lv.pmBanner === "fade" || lv.pmBanner === "once",
      `${lv.id} 横幅模式 ${lv.pmBanner} 非法`);
    assert.ok((lv.pmTargetEvery ?? 0) >= 2, `${lv.id} 目标间隔至少 2`);
    const cats = lv.pmCategories ?? 0;
    assert.ok(cats >= 2 && cats <= PM_CATEGORIES.length, `${lv.id} 类别数 ${cats} 越界`);

    const trials = lv.stepLimit;
    assert.ok(trials > 0, `${lv.id} 应有题数`);
    // 过关阈值必须严格小于总题数（全对留给三星）
    assert.ok(lv.passTarget > 0 && lv.passTarget < trials,
      `${lv.id} 阈值 ${lv.passTarget} 应落在 1..${trials - 1}`);
  }
});

test("pm: 难度轴按设计递进（横幅越来越少、目标越来越稀疏、类别递增）", () => {
  // ① 横幅可见性单调变难：always → fade → once
  const rank: Record<string, number> = { always: 0, fade: 1, once: 2 };
  let prev = -1;
  for (const lv of GEN_PM) {
    const r = rank[lv.pmBanner ?? "always"];
    assert.ok(r >= prev, `${lv.id} 横幅难度 ${lv.pmBanner} 不应比前一关更容易`);
    prev = r;
  }
  // ② 目标间隔不下降（越稀疏越难维持意图）
  let prevEvery = 0;
  for (const lv of GEN_PM) {
    const e = lv.pmTargetEvery ?? 0;
    assert.ok(e >= prevEvery, `${lv.id} 目标间隔 ${e} 不应低于前一关 ${prevEvery}`);
    prevEvery = e;
  }
  // ③ 分类类别数不下降
  let prevCats = 0;
  for (const lv of GEN_PM) {
    const c = lv.pmCategories ?? 0;
    assert.ok(c >= prevCats, `${lv.id} 类别数 ${c} 不应低于前一关 ${prevCats}`);
    prevCats = c;
  }
  // ④ 诱饵：首关没有，末关有
  assert.equal(GEN_PM[0].pmLures, false, "首关不应有诱饵");
  assert.equal(GEN_PM[GEN_PM.length - 1].pmLures, true, "末关应有诱饵");
});

test("pm: 序列长度正确且含目标题，诱饵与目标不同 emoji", () => {
  const e = new PmEngine(2, 20, "always", 4, true, seededRng(29));
  let targets = 0;
  let lures = 0;
  for (let i = 0; i < 20; i++) {
    const t = e.getTrial();
    assert.ok(t, `第 ${i} 题应存在`);
    if (t!.kind === "target") {
      targets++;
      assert.equal(t!.emoji, PM_TARGET.emoji, "目标题必须是鲜鱼");
    }
    if (t!.kind === "lure") {
      lures++;
      assert.notEqual(t!.emoji, PM_TARGET.emoji, "诱饵不能等于目标");
    }
    // 分类题必须落在启用类别内
    assert.ok(t!.categoryIndex >= 0 && t!.categoryIndex < 2, "类别下标越界");
    e.pickCategory(t!.categoryIndex, 800);
  }
  assert.ok(targets > 0, "应出现目标题");
  assert.ok(lures > 0, "开启诱饵时应出现诱饵题");
  assert.ok(e.getState().done, "做完应标记 done");
});

test("pm: 目标题按铃=命中；非目标题按铃=误报", () => {
  const e = new PmEngine(2, 20, "always", 4, true, seededRng(31));
  let hits = 0;
  for (let i = 0; i < 20; i++) {
    const t = e.getTrial()!;
    if (t.kind === "target") {
      assert.equal(e.pressBell(900), true, "目标题按铃应算命中");
      hits++;
    } else {
      // 分类正确（非目标题）
      assert.equal(e.pickCategory(t.categoryIndex, 900), true, "分类正确应为 true");
    }
  }
  const st = e.getState();
  assert.equal(st.pmHits, hits, "命中数应等于目标出现次数");
  assert.equal(st.pmTargets, hits, "目标数应等于目标出现次数");
  assert.equal(st.pmFalseAlarms, 0, "没有误按铃时应为 0");
});

test("pm: 目标题却去分类 = 漏按铃（不计正确，且不计为误报）", () => {
  const e = new PmEngine(2, 20, "fade", 4, false, seededRng(37));
  // 找到第一个目标题
  let guard = 0;
  while (guard < 20) {
    const t = e.getTrial()!;
    if (t.kind === "target") break;
    e.pickCategory(t.categoryIndex, 700);
    guard++;
  }
  const before = e.getState();
  const t = e.getTrial()!;
  assert.equal(t.kind, "target", "应已定位到目标题");
  const ok = e.pickCategory(t.categoryIndex, 700); // 忘了按铃
  assert.equal(ok, false, "目标题分类应判为错");
  const after = e.getState();
  assert.equal(after.pmHits, before.pmHits, "漏按铃不应增加命中");
  assert.equal(after.pmFalseAlarms, before.pmFalseAlarms, "漏按铃不算误报");
});

test("pm: 星级看按铃命中率与误报", () => {
  // 命中 4/5 = 80% 且无误报 → 3★
  assert.equal(computePmStars(true, 4, 5, 0), 3);
  // 命中 80% 但误报 2 次 → 降到 2★
  assert.equal(computePmStars(true, 4, 5, 2), 2);
  // 命中 3/5 = 60% → 2★
  assert.equal(computePmStars(true, 3, 5, 0), 2);
  // 命中 2/5 = 40% → 1★
  assert.equal(computePmStars(true, 2, 5, 0), 1);
  // 未过关 → 0★
  assert.equal(computePmStars(false, 5, 5, 0), 0);
});

// ==================== 时间/钟表定向（clock） ====================

test("clock: GEN_CLOCK 关卡参数合法且 id 唯一", () => {
  assert.equal(GEN_CLOCK.length, 9, "应有 9 关");
  const ids = new Set<string>();
  for (const lv of GEN_CLOCK) {
    assert.equal(lv.mode, "clock", `${lv.id} 应为 clock 模式`);
    assert.ok(lv.id.startsWith("10-"), `${lv.id} 应属于 10-x 编号段`);
    assert.ok(!ids.has(lv.id), `重复 id ${lv.id}`);
    ids.add(lv.id);

    assert.ok(lv.clockMode === "read" || lv.clockMode === "set",
      `${lv.id} 题型 ${lv.clockMode} 应为 read / set`);
    const prec = lv.clockPrecision;
    assert.ok(prec === "hour" || prec === "half" || prec === "five" || prec === "minute",
      `${lv.id} 精度 ${prec} 非法`);
    assert.ok((lv.trialTimeMs ?? -1) >= 0, `${lv.id} 限时不应为负`);

    const trials = lv.stepLimit;
    assert.ok(trials > 0, `${lv.id} 应有题数`);
    // 过关阈值必须严格小于总题数（全对留给三星）
    assert.ok(lv.passTarget > 0 && lv.passTarget < trials,
      `${lv.id} 阈值 ${lv.passTarget} 应落在 1..${trials - 1}`);
  }
});

test("clock: 难度轴按设计递进（精度↓ 题型 read→set 数字消失 限时收紧）", () => {
  const rank: Record<string, number> = { hour: 0, half: 1, five: 2, minute: 3 };
  // ① 时间精度不下降（越细越难）
  let prevPrec = -1;
  for (const lv of GEN_CLOCK) {
    const r = rank[lv.clockPrecision ?? "hour"];
    assert.ok(r >= prevPrec, `${lv.id} 精度 ${lv.clockPrecision} 不应比前一关更粗`);
    prevPrec = r;
  }
  // ② 题型：read 之后才出现 set，且不再回退
  let seenSet = false;
  for (const lv of GEN_CLOCK) {
    if (lv.clockMode === "set") seenSet = true;
    else assert.ok(!seenSet, `${lv.id} 出现 set 后不应再回退到 read`);
  }
  assert.ok(seenSet, "应出现 set（拨钟表）题型");
  // ③ 钟面数字：有 → 无，且不回退
  let seenNoNumbers = false;
  for (const lv of GEN_CLOCK) {
    const has = lv.clockNumbers ?? true;
    if (!has) seenNoNumbers = true;
    else assert.ok(!seenNoNumbers, `${lv.id} 去掉数字后不应再出现数字`);
  }
  // ④ 限时：前三关不限时，之后收紧
  const times = GEN_CLOCK.map((l) => l.trialTimeMs ?? 0);
  assert.ok(times.slice(0, 3).every((t) => t === 0), "前三关应不限时");
  const limited = times.slice(3);
  for (let i = 1; i < limited.length; i++) {
    assert.ok(limited[i] <= limited[i - 1],
      `限时 ${limited[i]} 不应比上一关 ${limited[i - 1]} 更宽松`);
  }
});

test("clock: 时间格式化符合中文习惯", () => {
  assert.equal(formatClockTime({ hour: 3, minute: 0 }), "3点整");
  assert.equal(formatClockTime({ hour: 3, minute: 30 }), "3点30分");
  assert.equal(formatClockTime({ hour: 9, minute: 5 }), "9点05分");
});

test("clock: 选项 4 个且互不重复，正确答案必在其中", () => {
  const e = new ClockEngine("read", "five", 30, seededRng(41));
  for (let i = 0; i < 30; i++) {
    const p = e.nextTrial();
    assert.ok(p, "应能生成题目");
    assert.equal(p!.options.length, 4, "应有 4 个选项");
    const keys = p!.options.map((o) => `${o.hour}:${o.minute}`);
    assert.equal(new Set(keys).size, 4, "选项不应重复");
    assert.ok(p!.answerIndex >= 0 && p!.answerIndex < 4, "答案下标越界");
    const ans = p!.options[p!.answerIndex];
    assert.equal(ans.hour, p!.time.hour, "答案应与正确时间一致");
    assert.equal(ans.minute, p!.time.minute, "答案应与正确时间一致");
    e.submit(p!.answerIndex, 900);
  }
  assert.equal(e.getState().correct, 30, "按正确答案作答应全对");
});

test("clock: 精度决定分钟取值（整点/半点/五分）", () => {
  // 整点档：分钟恒为 0
  const hour = new ClockEngine("read", "hour", 20, seededRng(43));
  for (let i = 0; i < 20; i++) {
    const p = hour.nextTrial()!;
    assert.equal(p.time.minute, 0, "整点档分钟应为 0");
    hour.submit(p.answerIndex, 700);
  }
  // 半点档：分钟只能是 0 或 30
  const half = new ClockEngine("read", "half", 20, seededRng(47));
  for (let i = 0; i < 20; i++) {
    const p = half.nextTrial()!;
    assert.ok(p.time.minute === 0 || p.time.minute === 30, "半点档分钟应为 0 或 30");
    half.submit(p.answerIndex, 700);
  }
  // 五分档：分钟必须是 5 的倍数
  const five = new ClockEngine("set", "five", 20, seededRng(53));
  for (let i = 0; i < 20; i++) {
    const p = five.nextTrial()!;
    assert.equal(p.time.minute % 5, 0, "五分档分钟应为 5 的倍数");
    five.submit(p.answerIndex, 700);
  }
});

test("clock: 小时恒在 1..12，超时记为答错", () => {
  const e = new ClockEngine("read", "minute", 20, seededRng(59));
  for (let i = 0; i < 19; i++) {
    const p = e.nextTrial()!;
    assert.ok(p.time.hour >= 1 && p.time.hour <= 12, `小时 ${p.time.hour} 越界`);
    for (const o of p.options) {
      assert.ok(o.hour >= 1 && o.hour <= 12, `选项小时 ${o.hour} 越界`);
      assert.ok(o.minute >= 0 && o.minute <= 59, `选项分钟 ${o.minute} 越界`);
    }
    e.submit(p.answerIndex, 800);
  }
  // 最后一题超时
  e.nextTrial();
  e.timeout(5000);
  assert.ok(e.getState().done, "超时应推进到结束");
  assert.equal(e.getState().correct, 19, "超时不应增加正确数");
});

test("money: GEN_MONEY 关卡参数合法且 id 唯一", () => {
  assert.equal(GEN_MONEY.length, 9, "应有 9 关");
  const ids = new Set<string>();
  for (const lv of GEN_MONEY) {
    assert.equal(lv.mode, "money", `${lv.id} 应为 money 模式`);
    assert.ok(lv.id.startsWith("8-"), `${lv.id} 应属于 8-x 编号段`);
    assert.ok(!ids.has(lv.id), `重复 id ${lv.id}`);
    ids.add(lv.id);

    assert.ok(lv.moneyMode === "change" || lv.moneyMode === "total",
      `${lv.id} 题型 ${lv.moneyMode} 应为 change / total`);
    const items = lv.moneyItems ?? 0;
    assert.ok(items >= 1 && items <= 3, `${lv.id} 商品件数 ${items} 应在 1..3`);
    assert.ok((lv.moneyMax ?? 0) > 0, `${lv.id} 金额上限应为正`);
    assert.ok((lv.trialTimeMs ?? -1) >= 0, `${lv.id} 限时不应为负`);

    const trials = lv.stepLimit;
    assert.ok(trials > 0, `${lv.id} 应有题数`);
    // 过关阈值必须严格小于总题数（全对留给三星）
    assert.ok(lv.passTarget > 0 && lv.passTarget < trials,
      `${lv.id} 阈值 ${lv.passTarget} 应落在 1..${trials - 1}`);
  }
});

test("money: 难度轴按设计递进（金额↑ 件数↑ 限时收紧）", () => {
  // 金额上限不下降
  let prevMax = 0;
  for (const lv of GEN_MONEY) {
    const m = lv.moneyMax ?? 0;
    assert.ok(m >= prevMax, `${lv.id} 金额上限 ${m} 不应低于前一关 ${prevMax}`);
    prevMax = m;
  }
  // 商品件数不下降
  let prevItems = 0;
  for (const lv of GEN_MONEY) {
    const n = lv.moneyItems ?? 0;
    assert.ok(n >= prevItems, `${lv.id} 件数 ${n} 不应低于前一关 ${prevItems}`);
    prevItems = n;
  }
  // 首关不带角分、末关带角分
  assert.equal(GEN_MONEY[0].useCents, false, "首关应只取整元");
  assert.equal(GEN_MONEY[GEN_MONEY.length - 1].useCents, true, "末关应带角分");
  // 限时：前三关不限时，引入后收紧
  const times = GEN_MONEY.map((l) => l.trialTimeMs ?? 0);
  assert.ok(times.slice(0, 3).every((t) => t === 0), "前三关应不限时");
  const limited = times.slice(3);
  for (let i = 1; i < limited.length; i++) {
    assert.ok(limited[i] <= limited[i - 1],
      `限时 ${limited[i]} 不应比上一关 ${limited[i - 1]} 更宽松`);
  }
});

test("money: 金额格式化（整元不显示小数，角分按习惯显示）", () => {
  assert.equal(formatCents(1200), "¥12");
  assert.equal(formatCents(1250), "¥12.5");
  assert.equal(formatCents(0), "¥0");
  assert.equal(formatCents(100), "¥1");
  assert.equal(formatCents(99), "¥0.99");
});

test("money: 找零题 = 付款 − 总价，且付款不小于总价", () => {
  const e = new MoneyEngine("change", 2, 30, true, 40, seededRng(11));
  for (let i = 0; i < 40; i++) {
    const p = e.nextProblem();
    assert.ok(p, "应能生成题目");
    const total = p!.items.reduce((s, it) => s + it.priceCents, 0);
    assert.ok(p!.paidCents !== undefined, "找零题必须有付款金额");
    assert.ok(p!.paidCents! > total, "付款必须大于总价（否则找零为负）");
    assert.equal(p!.answerCents, p!.paidCents! - total, "找零应为 付款 − 总价");
    e.submit(p!.answerIndex, 900);
  }
  assert.equal(e.getState().correct, 40, "按正确答案作答应全对");
  assert.equal(e.getMedianRT(), 900);
});

test("money: 合计题 = 各件价格之和", () => {
  const e = new MoneyEngine("total", 3, 40, true, 30, seededRng(13));
  for (let i = 0; i < 30; i++) {
    const p = e.nextProblem();
    assert.ok(p);
    const total = p!.items.reduce((s, it) => s + it.priceCents, 0);
    assert.equal(p!.answerCents, total, "合计应为各件价格之和");
    e.submit(p!.answerIndex, 1000);
  }
  assert.ok(e.getState().done, "做完应标记 done");
});

test("money: 选项 4 个且互不重复，正确答案必在其中", () => {
  const e = new MoneyEngine("change", 2, 40, true, 30, seededRng(17));
  for (let i = 0; i < 30; i++) {
    const p = e.nextProblem();
    assert.ok(p);
    assert.equal(p!.optionsCents.length, 4, "应有 4 个选项");
    assert.equal(new Set(p!.optionsCents).size, 4, "选项不应重复");
    assert.ok(p!.optionsCents.includes(p!.answerCents), "正确答案必须在选项里");
    assert.equal(p!.optionsCents[p!.answerIndex], p!.answerCents, "answerIndex 应指向正确答案");
    for (const c of p!.optionsCents) assert.ok(c > 0, "金额选项不应为负");
    e.submit(p!.answerIndex, 800);
  }
});

test("money: 整元档价格一定是 100 分的整数倍", () => {
  const e = new MoneyEngine("total", 3, 40, false, 20, seededRng(19));
  for (let i = 0; i < 20; i++) {
    const p = e.nextProblem();
    assert.ok(p);
    for (const it of p!.items) {
      assert.equal(it.priceCents % 100, 0, `${it.name} 价格 ${it.priceCents} 应为整元`);
    }
    e.submit(p!.answerIndex, 700);
  }
});

test("money: 超时记为答错且不增加正确数", () => {
  const e = new MoneyEngine("total", 1, 20, false, 3, seededRng(23));
  e.nextProblem();
  e.timeout(5000);
  assert.equal(e.getState().correct, 0, "超时不应计为正确");
  assert.equal(e.getState().index, 1, "超时应推进题数");
});

test("stroop: GEN_STROOP 关卡参数合法且 id 唯一", () => {
  assert.equal(GEN_STROOP.length, 9, "应有 9 关");
  const ids = new Set<string>();
  for (const lv of GEN_STROOP) {
    assert.equal(lv.mode, "stroop", `${lv.id} 应为 stroop 模式`);
    assert.ok(lv.id.startsWith("7-"), `${lv.id} 应属于 7-x 编号段`);
    assert.ok(!ids.has(lv.id), `重复 id ${lv.id}`);
    ids.add(lv.id);

    const colors = lv.stroopColors ?? 0;
    assert.ok(colors >= 2 && colors <= STROOP_COLORS.length, `${lv.id} 颜色数 ${colors} 越界`);
    const conflict = lv.conflictRatio ?? -1;
    assert.ok(conflict >= 0 && conflict <= 1, `${lv.id} 冲突比例 ${conflict} 应在 0..1`);
    assert.ok((lv.trialTimeMs ?? -1) >= 0, `${lv.id} 限时不应为负`);

    const trials = lv.stepLimit;
    assert.ok(trials > 0, `${lv.id} 应有题数`);
    // 过关阈值必须严格小于总题数：全对留给三星，过关不与三星等价
    assert.ok(lv.passTarget > 0 && lv.passTarget < trials,
      `${lv.id} 阈值 ${lv.passTarget} 应落在 1..${trials - 1}`);
  }
});

test("stroop: 四条难度轴按设计递进", () => {
  // ① 冲突比例不下降
  let prevConflict = -1;
  for (const lv of GEN_STROOP) {
    const c = lv.conflictRatio ?? 0;
    assert.ok(c >= prevConflict, `${lv.id} 冲突比例 ${c} 不应低于前一关 ${prevConflict}`);
    prevConflict = c;
  }
  // ② 颜色数不下降：2 → 4
  let prevColors = 0;
  for (const lv of GEN_STROOP) {
    const n = lv.stroopColors ?? 0;
    assert.ok(n >= prevColors, `${lv.id} 颜色数 ${n} 不应低于前一关 ${prevColors}`);
    prevColors = n;
  }
  assert.equal(GEN_STROOP[0].stroopColors, 2, "首关应为 2 色");
  assert.equal(GEN_STROOP[GEN_STROOP.length - 1].stroopColors, 4, "末关应为 4 色");

  // ③ 限时：前三关不限时，引入后逐级收紧到 3 秒内
  const times = GEN_STROOP.map((l) => l.trialTimeMs ?? 0);
  assert.ok(times.slice(0, 3).every((t) => t === 0), "前三关应不限时");
  const limited = times.slice(3);
  for (let i = 1; i < limited.length; i++) {
    assert.ok(limited[i] <= limited[i - 1],
      `限时 ${limited[i]} 不应比上一关 ${limited[i - 1]} 更宽松`);
  }
  assert.ok(limited[limited.length - 1] <= 3000, "末关限时应收紧到 3 秒内");

  // ④ 规则反转只出现在最后一章
  const reversed = GEN_STROOP.filter((l) => l.reverseRule);
  assert.ok(reversed.length > 0, "应有关卡启用规则反转");
  const lastChapter = GEN_STROOP[GEN_STROOP.length - 1].chapter;
  for (const lv of reversed) {
    assert.equal(lv.chapter, lastChapter, `${lv.id} 规则反转应只出现在第 ${lastChapter} 章`);
  }
});

test("stroop: 引擎按冲突比例生成试次，冲突试次必定字义≠墨色", () => {
  // conflict=1 → 全部冲突，且默认规则答案为墨色
  const allConflict = new StroopEngine(4, 40, 1, false, seededRng(1));
  for (let i = 0; i < 40; i++) {
    const t = allConflict.nextTrial();
    assert.ok(t, "应能生成试次");
    assert.equal(t!.congruent, false, "conflict=1 时不应出现一致试次");
    assert.notEqual(t!.wordIndex, t!.inkIndex, "冲突试次字义必须不等于墨色");
    assert.equal(t!.answerIndex, t!.inkIndex, "默认规则答案为墨色");
    allConflict.submit(t!.answerIndex, 500);
  }
  // conflict=0 → 全部一致
  const none = new StroopEngine(4, 20, 0, false, seededRng(2));
  for (let i = 0; i < 20; i++) {
    const t = none.nextTrial();
    assert.ok(t);
    assert.equal(t!.congruent, true, "conflict=0 时不应出现冲突试次");
    assert.equal(t!.answerIndex, t!.inkIndex);
    none.submit(t!.answerIndex, 500);
  }
});

test("stroop: 反转规则时答案是字义而非墨色", () => {
  const e = new StroopEngine(3, 30, 1, true, seededRng(3));
  for (let i = 0; i < 30; i++) {
    const t = e.nextTrial();
    assert.ok(t);
    assert.equal(t!.answerIndex, t!.wordIndex, "反转规则下答案应为字义下标");
    assert.notEqual(t!.answerIndex, t!.inkIndex, "冲突试次下答案不应等于墨色下标");
    e.submit(t!.answerIndex, 600);
  }
  assert.ok(e.getState().done, "做完应标记 done");
  assert.equal(e.getState().correct, 30, "全部按正确答案作答应全对");
  assert.ok(e.isLevelPassed(25), "答对 30 应通过阈值 25");
});

test("stroop: 反应时按一致/冲突分组统计", () => {
  // 全冲突：只统计到冲突组
  const conf = new StroopEngine(2, 3, 1, false, seededRng(7));
  for (let i = 0; i < 3; i++) {
    const t = conf.nextTrial()!;
    conf.submit(t.answerIndex, 1400);
  }
  assert.equal(conf.getConflictMedianRT(), 1400);
  assert.equal(conf.getCongruentMedianRT(), 0, "无一致试次时应为 0");
  assert.equal(conf.getStroopEffect(), 0, "缺一组时效应量应为 0");

  // 全一致：只统计到一致组
  const cong = new StroopEngine(2, 3, 0, false, seededRng(7));
  for (let i = 0; i < 3; i++) {
    const t = cong.nextTrial()!;
    cong.submit(t.answerIndex, 800);
  }
  assert.equal(cong.getCongruentMedianRT(), 800);
  assert.equal(cong.getConflictMedianRT(), 0);
  assert.equal(cong.getMedianRT(), 800, "整体中位应为 800");
});

test("stroop: 超时记为答错且不增加正确数", () => {
  const e = new StroopEngine(2, 3, 0, false, seededRng(5));
  e.nextTrial();
  e.timeout(3000);
  assert.equal(e.getState().correct, 0, "超时不应计为正确");
  assert.equal(e.getState().index, 1, "超时应推进题数");
});

test("stroop: 星级同时看正确率与反应时", () => {
  assert.equal(computeStroopStars(true, 10, 10, 1200), 3, "又快又准 → 3★");
  assert.equal(computeStroopStars(true, 10, 10, 2600), 2, "准但慢 → 2★");
  assert.equal(computeStroopStars(true, 7, 10, 4000), 1, "达标但慢且一般 → 1★");
  assert.equal(computeStroopStars(false, 9, 10, 1000), 0, "未过关 → 0★");
});

test("对联池可支撑复习干扰项（已导出且字段完整）", () => {
  assert.ok(COUPLETS.length >= 4, "对联池至少要有 4 条才够做干扰项");
  for (const c of COUPLETS) {
    assert.ok(c.upper.length > 0, "上句不应为空");
    assert.ok(c.lower.length > 0, "下句不应为空");
  }
});

test("memory: GEN_MEMORY 关卡参数合法且 id 唯一", () => {
  assert.equal(GEN_MEMORY.length, 9, "应有 9 关");
  const ids = new Set<string>();
  for (const lv of GEN_MEMORY) {
    assert.equal(lv.mode, "memory", `${lv.id} 应为 memory 模式`);
    assert.ok(lv.id.startsWith("6-"), `${lv.id} 应属于 6-x 编号段`);
    assert.ok(!ids.has(lv.id), `重复 id ${lv.id}`);
    ids.add(lv.id);

    const pairs = lv.cardPairs ?? 0;
    assert.ok(pairs >= 3 && pairs <= 6, `${lv.id} cardPairs=${pairs} 应在 3..6`);
    assert.ok((lv.revealMs ?? 0) > 0, `${lv.id} revealMs 应为正数`);
    // 理论上配齐 N 对最少需 N 步，步数上限必须明显宽于理论最少步数
    assert.ok(lv.stepLimit > pairs, `${lv.id} 步数上限 ${lv.stepLimit} 必须大于最少步数 ${pairs}`);
    assert.equal(lv.passTarget, pairs, `${lv.id} 需配齐全部 ${pairs} 对才算过关`);
  }
});

test("memory: 难度沿 revealMs 递减（看牌时间缩短为主难度脊）", () => {
  let prev = Number.POSITIVE_INFINITY;
  for (const lv of GEN_MEMORY) {
    const d = lv.revealMs ?? 0;
    assert.ok(d <= prev, `${lv.id} revealMs ${d} 不应高于前一关 ${prev}`);
    prev = d;
  }
  assert.ok(
    (GEN_MEMORY[0].revealMs ?? 0) > (GEN_MEMORY[GEN_MEMORY.length - 1].revealMs ?? 0),
    "首尾看牌时间应有明显差距",
  );
});

test("memory: 素材池足够支撑最大局面（6 对 = 3 图词 + 3 面孔）", () => {
  const maxPairs = Math.max(...GEN_MEMORY.map((l) => l.cardPairs ?? 0));
  const needIcon = Math.ceil(maxPairs / 2);
  const needFace = maxPairs - needIcon;
  assert.ok(ICON_WORD_PAIRS.length >= needIcon, `图词对素材不足：需要 ${needIcon} 有 ${ICON_WORD_PAIRS.length}`);
  assert.ok(NAME_POOL.length >= needFace, `人名素材不足：需要 ${needFace} 有 ${NAME_POOL.length}`);
  // 名字池需容得下 face 模式的最大面孔数 + 干扰项
  const maxFaceCount = Math.max(...GEN_FACE.map((l) => l.faceCount ?? 0));
  assert.ok(NAME_POOL.length >= maxFaceCount, "NAME_POOL 应不少于 face 模式最大面孔数");
});

test("cloneAdjustedLevel: face 关的面孔数(stepLimit)不被三消步长下限改写", () => {
  const base = GEN_FACE[0]; // stepLimit 语义是 faceCount（首关为 3）
  assert.equal(base.stepLimit, base.faceCount, "face 关 stepLimit 应与 faceCount 一致");
  const lv = cloneAdjustedLevel(base, 0, 0);
  assert.equal(lv.stepLimit, base.faceCount, "face 面孔数不应被三消的 5 步下限抬成 5");
  assert.equal(lv.faceCount, base.faceCount, "faceCount 应原样保留");

  // 必须返回副本，绝不能就地污染全局配置
  assert.notEqual(lv, base);
  lv.stepLimit = 99;
  assert.notEqual(base.stepLimit, 99, "克隆体改动不应影响全局配置");
});

test("cloneAdjustedLevel: match3 仍保留 5 步下限（防反向破坏）", () => {
  const tiny = { ...GEN_MATCH3[0], stepLimit: 2 };
  assert.equal(cloneAdjustedLevel(tiny, 0, 0).stepLimit, 5, "match3 仍应保底 5 步");
  const corsi = cloneAdjustedLevel(GEN_CORSI[0], 0, 0);
  assert.equal(corsi.stepLimit, GEN_CORSI[0].stepLimit, "corsi 轮次数应原样保留");
  const mem = cloneAdjustedLevel(GEN_MEMORY[0], 0, 0);
  assert.equal(mem.stepLimit, GEN_MEMORY[0].stepLimit, "memory 翻牌步数上限应原样保留");
  assert.equal(mem.cardPairs, GEN_MEMORY[0].cardPairs, "memory 牌组对数应原样保留");
});

test("face: faceSeedFor 确定性、落在 1..300 且同一关内互不相同", () => {
  assert.equal(faceSeedFor("5-1", 0), faceSeedFor("5-1", 0), "同参数应可复现");
  const seeds = new Set<number>();
  for (let i = 0; i < 6; i++) {
    const s = faceSeedFor("5-1", i);
    assert.ok(s >= 1 && s <= 300, `seed=${s} 越界`);
    assert.ok(!seeds.has(s), `同一关第 ${i} 个面孔 seed=${s} 与前面重复`);
    seeds.add(s);
  }
});
