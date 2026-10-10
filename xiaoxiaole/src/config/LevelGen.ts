/**
 * LevelGen — 关卡量产生成器（参数化、配置驱动）
 *
 * 用途：在不改动引擎的前提下，批量补齐关卡量（拉开与主流量级差），
 * 并穿插本阶段新增的特殊机制关（果冻 jelly / 限时 timeLimit；鱼 fish 已作为
 * 三消通用特效棋在所有 match3 关自然出现）。
 *
 * 平衡说明（校准政策，见 tools/balance-sim.ts）：
 * - 三消分数阈值由 tools/balance-sim.ts 蒙特卡洛标定（npm run balance），取随机玩家分数 p25（≈75% 随机过关），
 *   作为「认真玩基本都能过、三星才需技巧」的适老化难度基准。
 * - 仅【本文件量产的新关（1-23..1-32 的普通关）】回写 sim 建议值；旧版手调关（1-1..1-22）刻意保持更宽松，
 *   用作平缓入门坡，不随 sim 拉高。
 * - jelly 关 passTarget 取低值（600），使「清果冻」成为胜负关键（sim 的分数建议对 jelly 失真，忽略）；
 *   timed 关 sim 用 stepLimit=999 跑、分数被放大失真，保持本文件留余量阈值（3000/3500），不套用 sim。
 * - 听音 / 诗词的 passTarget 由各自玩法直接消费（听音=需答对题数；诗词=配齐全部对联，passTarget 仅用于星级），无需模拟。
 */

import type { LevelConfig } from "./LevelConfig";

const ICON5 = ["flower", "leaf", "fruit", "butterfly", "bird"];
const ICON4 = ICON5.slice(0, 4);

// ---------- 三消（match3） ----------

interface M3Spec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  stepLimit: number; icon: 4 | 5;
  jelly?: number; time?: number; pt?: number; name: string;
}

const M3_SPECS: M3Spec[] = [
  { n: 23, chapter: 6, theme: "autumn", stepLimit: 24, icon: 4, pt: 5300, name: "秋实满枝" },
  { n: 24, chapter: 6, theme: "autumn", stepLimit: 26, icon: 4, jelly: 8, name: "霜林染醉" },
  { n: 25, chapter: 6, theme: "autumn", stepLimit: 22, icon: 5, pt: 2600, name: "金风送爽" },
  { n: 26, chapter: 6, theme: "autumn", stepLimit: 21, icon: 5, pt: 2400, name: "雁字回时" },
  { n: 27, chapter: 6, theme: "autumn", stepLimit: 40, icon: 5, time: 60, name: "秋日冲刺" },
  { n: 28, chapter: 7, theme: "winter", stepLimit: 20, icon: 5, pt: 2300, name: "寒江独雪" },
  { n: 29, chapter: 7, theme: "winter", stepLimit: 19, icon: 5, pt: 2200, name: "梅蕊迎春" },
  { n: 30, chapter: 7, theme: "winter", stepLimit: 24, icon: 5, jelly: 10, name: "踏雪寻梅" },
  { n: 31, chapter: 7, theme: "winter", stepLimit: 18, icon: 5, pt: 2000, name: "归鸿万里" },
  { n: 32, chapter: 7, theme: "winter", stepLimit: 45, icon: 5, time: 75, name: "冬日长跑" },
];

export const GEN_MATCH3: LevelConfig[] = M3_SPECS.map((s) => {
  const isTimed = s.time !== undefined;
  const isJelly = s.jelly !== undefined;
  const level: LevelConfig = {
    id: `1-${s.n}`,
    mode: "match3",
    name: s.name,
    chapter: s.chapter,
    theme: s.theme,
    boardCols: 6,
    boardRows: 6,
    stepLimit: isTimed ? 999 : s.stepLimit, // 限时关步数不封顶，时间才是约束
    // jelly 关 passTarget 取低值（600），让「清除全部果冻」成为胜负关键；
    // 限时关取留余量的阈值；普通关用 balance-sim 标定（pt）。
    passTarget: isJelly ? 600
      : isTimed ? (s.time === 60 ? 3000 : 3500)
      : s.pt ?? 2000,
    timeLimit: s.time,
    iconTypes: s.icon === 5 ? ICON5 : ICON4,
    items: { hint: 2, reshuffle: 1, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 1 },
    itemDropInterval: 6,
    itemDropChance: 0.35,
    idleHintDelay: 4,
    adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 18, contentMin: 4 },
  };
  if (s.jelly) level.obstacles = { type: "jelly", count: s.jelly };
  return level;
});

// ---------- 听音辨位（audio） ----------
// 克隆 2-13 基线（sequence 范式 + 干扰），按难度缩放序列长度 / 题量 / 达标数 / 声音池。

interface AudioSpec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  q: number; pass: number; seq: number; pool: number; mi: boolean; name: string;
}

const AUDIO_SPECS: AudioSpec[] = [
  { n: 15, chapter: 5, theme: "spring", q: 10, pass: 6, seq: 7, pool: 8, mi: false, name: "晨钟初鸣" },
  { n: 16, chapter: 5, theme: "spring", q: 11, pass: 7, seq: 7, pool: 8, mi: false, name: "柳浪闻莺" },
  { n: 17, chapter: 5, theme: "summer", q: 11, pass: 8, seq: 8, pool: 9, mi: false, name: "夏木流音" },
  { n: 18, chapter: 5, theme: "summer", q: 12, pass: 9, seq: 8, pool: 9, mi: true, name: "骤雨初歇" },
  { n: 19, chapter: 5, theme: "summer", q: 12, pass: 10, seq: 9, pool: 9, mi: true, name: "蝉噪林逾" },
  { n: 20, chapter: 6, theme: "autumn", q: 13, pass: 11, seq: 9, pool: 10, mi: true, name: "雁过秋空" },
  { n: 21, chapter: 6, theme: "autumn", q: 13, pass: 12, seq: 10, pool: 10, mi: true, name: "暮色四合" },
  { n: 22, chapter: 6, theme: "winter", q: 14, pass: 12, seq: 10, pool: 10, mi: true, name: "寒夜围炉" },
  { n: 23, chapter: 6, theme: "winter", q: 14, pass: 13, seq: 11, pool: 11, mi: true, name: "梅香报晓" },
  { n: 24, chapter: 6, theme: "winter", q: 15, pass: 14, seq: 11, pool: 11, mi: true, name: "八音和畅" },
];

export const GEN_AUDIO: LevelConfig[] = AUDIO_SPECS.map((s) => {
  const level: LevelConfig = {
    id: `2-${s.n}`,
    mode: "audio",
    name: s.name,
    chapter: s.chapter,
    theme: s.theme,
    boardCols: 4,
    boardRows: 4,
    stepLimit: s.pass + 6,
    passTarget: s.pass,
    iconTypes: ["bell", "drum", "flute", "guzheng", "piano", "violin", "trumpet", "carhorn", "sparrow", "cuckoo", "owl", "nightingale"],
    audioPool: s.pool,
    audioParadigm: "sequence",
    sequenceLength: s.seq,
    sequenceMax: s.seq + 1,
    sequenceGap: 0.35,
    questionCount: s.q,
    audioDuration: 1.5,
    matchPairs: 4,
    hasInterference: s.mi,
    visualClueDelay: 4,
    visualFallback: true,
    items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 3, step: 0, shield: 0, hammer: 0 },
    itemDropInterval: 6,
    itemDropChance: 0.30,
    idleHintDelay: 5,
    adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 12, contentMin: 3 },
  };
  if (s.mi) level.obstacles = { type: "interference", count: 1 };
  return level;
});

// ---------- 诗词连连看（poetry） ----------
// 通关 = 配齐全部 poetryPairs（passTarget 仅用于星级，沿用现有「passTarget = 对联数」约定）。
// 对联取自经典诗句，按关卡窗选，保证每关关内不重复。

// 导出以便「间隔复习」复用同一批对联作为干扰项池（见 core/ReviewStore.ts）
export const COUPLETS: { upper: string; lower: string }[] = [
  { upper: "床前", lower: "明月光" }, { upper: "春眠", lower: "不觉晓" },
  { upper: "白日", lower: "依山尽" }, { upper: "锄禾", lower: "当午" },
  { upper: "红豆", lower: "生南国" }, { upper: "白毛", lower: "浮绿水" },
  { upper: "远看", lower: "山有色" }, { upper: "离离", lower: "原上草" },
  { upper: "月落", lower: "乌啼霜" }, { upper: "孤舟", lower: "蓑笠翁" },
  { upper: "千山", lower: "鸟飞绝" }, { upper: "万径", lower: "人踪灭" },
  { upper: "返景", lower: "入深林" }, { upper: "空山", lower: "不见人" },
  { upper: "深林", lower: "人不知" }, { upper: "相看", lower: "两不厌" },
  { upper: "众鸟", lower: "高飞尽" }, { upper: "孤云", lower: "独去闲" },
  { upper: "野旷", lower: "天低树" }, { upper: "江清", lower: "月近人" },
  { upper: "故人", lower: "具鸡黍" }, { upper: "青山", lower: "郭外斜" },
  { upper: "开轩", lower: "面场圃" }, { upper: "把酒", lower: "话桑麻" },
];

function pickCouples(count: number, seed: number): { upper: string; lower: string }[] {
  const L = COUPLETS.length;
  const out: { upper: string; lower: string }[] = [];
  for (let j = 0; j < count; j++) {
    out.push(COUPLETS[(seed * 5 + j) % L]);
  }
  return out;
}

interface PoetrySpec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  pairs: number; maxCorners: number; clue: "radical" | "full"; name: string;
}

const POETRY_SPECS: PoetrySpec[] = [
  { n: 15, chapter: 5, theme: "autumn", pairs: 10, maxCorners: 3, clue: "radical", name: "寒山远寺" },
  { n: 16, chapter: 5, theme: "spring", pairs: 11, maxCorners: 3, clue: "radical", name: "春晓闻啼" },
  { n: 17, chapter: 5, theme: "autumn", pairs: 12, maxCorners: 2, clue: "radical", name: "空林返景" },
  { n: 18, chapter: 5, theme: "winter", pairs: 13, maxCorners: 2, clue: "radical", name: "孤舟蓑笠" },
  { n: 19, chapter: 6, theme: "spring", pairs: 14, maxCorners: 2, clue: "full", name: "故人鸡黍" },
  { n: 20, chapter: 6, theme: "summer", pairs: 15, maxCorners: 2, clue: "full", name: "青山郭外" },
  { n: 21, chapter: 6, theme: "autumn", pairs: 16, maxCorners: 2, clue: "full", name: "开轩场圃" },
  { n: 22, chapter: 6, theme: "winter", pairs: 17, maxCorners: 2, clue: "full", name: "野旷天低" },
  { n: 23, chapter: 6, theme: "autumn", pairs: 18, maxCorners: 2, clue: "full", name: "江清月近" },
  { n: 24, chapter: 6, theme: "winter", pairs: 18, maxCorners: 2, clue: "full", name: "把酒桑麻" },
];

export const GEN_POETRY: LevelConfig[] = POETRY_SPECS.map((s, i) => ({
  id: `3-${s.n}`,
  mode: "poetry",
  name: s.name,
  chapter: s.chapter,
  theme: s.theme,
  boardCols: 5,
  boardRows: 5,
  stepLimit: s.pairs + 8,
  // 沿用现有约定：passTarget = 对联数（诗词通关需配齐全部对联，passTarget 仅影响星级）
  passTarget: s.pairs,
  poetryPairs: pickCouples(s.pairs, i + 1),
  maxCorners: s.maxCorners,
  clueLevel: s.clue,
  items: { hint: 0, reshuffle: 1, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6,
  itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 17, contentMin: 4 },
}));

// ---------- 空间记忆（corsi / 科西积木） ----------
// 训练靶点：空间工作记忆、空间注意、视听联合编码（每格不同音高）。
// 玩法：系统依次点亮 gridSize×gridSize 网格中的若干方块（含音高）→ 遮挡 → 玩家按序点回。
// 难度双轴：网格 3×3 → 4×4 → 5×5，序列长度 seq 随关递增。
// 平衡说明：Corsi 非随机策略依赖（序列为随机、点回为确定性），不跑 balance-sim；
//   阈值按「约 60–75% 轮次正确即过、全对=三星」的适老宽松标准直接给定（pass / rounds 初值）。

interface CorsiSpec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  gridSize: 3 | 4 | 5; seq: number; rounds: number; pass: number; name: string;
}

const CORSI_SPECS: CorsiSpec[] = [
  // 第 8 章 · 3×3 入门
  { n: 1, chapter: 8, theme: "spring", gridSize: 3, seq: 3, rounds: 5, pass: 3, name: "方寸初识" },
  { n: 2, chapter: 8, theme: "spring", gridSize: 3, seq: 3, rounds: 6, pass: 4, name: "三三成趣" },
  { n: 3, chapter: 8, theme: "summer", gridSize: 3, seq: 4, rounds: 6, pass: 4, name: "四子连心" },
  // 第 9 章 · 4×4 进阶
  { n: 4, chapter: 9, theme: "autumn", gridSize: 4, seq: 4, rounds: 6, pass: 4, name: "经纬初现" },
  { n: 5, chapter: 9, theme: "autumn", gridSize: 4, seq: 5, rounds: 7, pass: 5, name: "四方寻序" },
  { n: 6, chapter: 9, theme: "winter", gridSize: 4, seq: 5, rounds: 7, pass: 5, name: "巧布五子" },
  // 第 10 章 · 5×5 高阶
  { n: 7, chapter: 10, theme: "winter", gridSize: 5, seq: 5, rounds: 7, pass: 5, name: "星罗棋布" },
  { n: 8, chapter: 10, theme: "spring", gridSize: 5, seq: 6, rounds: 8, pass: 6, name: "步步生莲" },
  { n: 9, chapter: 10, theme: "summer", gridSize: 5, seq: 6, rounds: 8, pass: 6, name: "心有丘壑" },
];

export const GEN_CORSI: LevelConfig[] = CORSI_SPECS.map((s) => ({
  id: `4-${s.n}`,
  mode: "corsi",
  name: s.name,
  chapter: s.chapter,
  theme: s.theme,
  boardCols: s.gridSize,
  boardRows: s.gridSize,
  // stepLimit = 总轮次（每轮 = 演示 + 点回一个序列）；passTarget = 需正确复现的轮数
  stepLimit: s.rounds,
  passTarget: s.pass,
  gridSize: s.gridSize,
  sequenceLength: s.seq,
  rounds: s.rounds,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6,
  itemDropChance: 0,
  idleHintDelay: 6,
  adaptive: { stepDelta: 0, contentDelta: 0, stepMin: 5, contentMin: 3 },
}));

// ---------- 面孔-名字联想（face / Face-Name Associative Memory） ----------
// 训练靶点：联想记忆、情景记忆、面孔-名字绑定（老人最早、最尴尬的认知衰退点）。
// 玩法：学习阶段展示若干「面孔+名字」→ 延迟（delayMs，难度脊）→ 回忆阶段给面孔、从选项中点选正确名字。
// 难度双轴：学习面孔数 faceCount 3→6，干扰选项 options 3→4；delayMs 2s→9s 逐级拉长（长时巩固）。
// 平衡说明：face 为确定性回忆任务（无随机策略可枚举），故不跑蒙特卡洛 balance-sim，
//   改由 tools/face-sim.ts（npm run facebalance）用「记忆保持模型 + 精确二项分布」标定；
//   标定结果已回写到下方 pass 字段，改数值前请先重跑该工具。

interface FaceSpec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  faceCount: number; delayMs: number; options: number; pass: number; name: string;
}

// pass 由 tools/face-sim.ts（npm run facebalance）标定：
// ① 一般玩家通过率 ≥85%；② 纯盲猜通过率 ≤25%（确保真的在考记忆）；③ pass 必须小于 faceCount（全对=三星，过关≠三星）。
const FACE_SPECS: FaceSpec[] = [
  // 第 11 章 · 入门（短延迟）
  { n: 1, chapter: 11, theme: "spring", faceCount: 3, delayMs: 2000, options: 3, pass: 2, name: "初识邻里" },
  { n: 2, chapter: 11, theme: "spring", faceCount: 3, delayMs: 3500, options: 3, pass: 2, name: "唤名如面" },
  { n: 3, chapter: 11, theme: "summer", faceCount: 4, delayMs: 3500, options: 3, pass: 3, name: "四邻皆熟" },
  // 第 12 章 · 进阶（中延迟 + 干扰增多）
  { n: 4, chapter: 12, theme: "autumn", faceCount: 4, delayMs: 5000, options: 4, pass: 2, name: "秋日茶聚" },
  { n: 5, chapter: 12, theme: "autumn", faceCount: 5, delayMs: 5000, options: 4, pass: 3, name: "五老相逢" },
  { n: 6, chapter: 12, theme: "winter", faceCount: 5, delayMs: 6000, options: 4, pass: 3, name: "围炉认人" },
  // 第 13 章 · 高阶（长延迟 + 多面孔）
  { n: 7, chapter: 13, theme: "winter", faceCount: 6, delayMs: 7000, options: 4, pass: 3, name: "风雪故人" },
  { n: 8, chapter: 13, theme: "spring", faceCount: 6, delayMs: 9000, options: 4, pass: 3, name: "满座春风" },
  { n: 9, chapter: 13, theme: "summer", faceCount: 6, delayMs: 9000, options: 4, pass: 3, name: "旧友如云" },
];

export const GEN_FACE: LevelConfig[] = FACE_SPECS.map((s) => ({
  id: `5-${s.n}`,
  mode: "face",
  name: s.name,
  chapter: s.chapter,
  theme: s.theme,
  boardCols: 1,
  boardRows: 1,
  // stepLimit 仅用于雷达归一化占位；回忆题数 = faceCount；passTarget = 需正确回忆数
  stepLimit: s.faceCount,
  passTarget: s.pass,
  faceCount: s.faceCount,
  delayMs: s.delayMs,
  options: s.options,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6,
  itemDropChance: 0,
  idleHintDelay: 6,
  adaptive: { stepDelta: 0, contentDelta: 0, stepMin: 5, contentMin: 3 },
}));

// ---------- 记忆翻翻乐（memory / Concentration） ----------
// 训练靶点：视觉再认记忆、空间位置记忆、联想编码。
// 玩法：全部牌背面朝上 → 每次翻两张，是「联想对」（图像卡 ↔ 标签卡）则消除，否则合上重来 → 配齐全部对过关。
// 卡牌内容混编两种联想对，兼顾语义联想与面孔元素（b + c 组合）：
//   · 图词对：emoji 图案卡 ↔ 中文词卡（如 🌸 ↔ 桃花）
//   · 面孔-名字对：程序化头像卡 ↔ 称呼名字卡（如 头像 ↔ 老张），复用 FaceAvatar
// 难度脊：revealMs（翻错后两张牌的停留可见时长）逐级缩短 1800ms → 500ms，越到后面越依赖短时视觉记忆；
//   同时牌数由 3 对增至 6 对作为次级难度轴。
// 平衡说明：stepLimit 为允许翻牌次数（每次「翻两张」计 1 步），取值宽松（cardPairs×5），
//   避免老人因摸索被卡关；星际由步数效率决定（几乎一遍过=3★），见 computeMemoryStars。

interface MemorySpec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  cardPairs: number; revealMs: number; steps: number; name: string;
}

const MEMORY_SPECS: MemorySpec[] = [
  // 第 14 章 · 入门（停留久）
  { n: 1, chapter: 14, theme: "spring", cardPairs: 3, revealMs: 1800, steps: 15, name: "花间初认" },
  { n: 2, chapter: 14, theme: "spring", cardPairs: 3, revealMs: 1400, steps: 15, name: "叶底寻双" },
  { n: 3, chapter: 14, theme: "summer", cardPairs: 4, revealMs: 1400, steps: 20, name: "荷风送香" },
  // 第 15 章 · 进阶（停留缩短 + 牌数增加）
  { n: 4, chapter: 15, theme: "autumn", cardPairs: 4, revealMs: 1100, steps: 20, name: "秋果成双" },
  { n: 5, chapter: 15, theme: "autumn", cardPairs: 5, revealMs: 1100, steps: 25, name: "五子登科" },
  { n: 6, chapter: 15, theme: "winter", cardPairs: 5, revealMs: 900, steps: 25, name: "寒梅映雪" },
  // 第 16 章 · 高阶（停留极短）
  { n: 7, chapter: 16, theme: "winter", cardPairs: 6, revealMs: 900, steps: 30, name: "雪夜寻伴" },
  { n: 8, chapter: 16, theme: "spring", cardPairs: 6, revealMs: 700, steps: 30, name: "过目成诵" },
  { n: 9, chapter: 16, theme: "summer", cardPairs: 6, revealMs: 500, steps: 30, name: "心记方圆" },
];

export const GEN_MEMORY: LevelConfig[] = MEMORY_SPECS.map((s) => ({
  id: `6-${s.n}`,
  mode: "memory",
  name: s.name,
  chapter: s.chapter,
  theme: s.theme,
  boardCols: s.cardPairs <= 3 ? 3 : 4,
  boardRows: Math.ceil((s.cardPairs * 2) / (s.cardPairs <= 3 ? 3 : 4)),
  // stepLimit = 允许翻牌次数；passTarget = 需配齐的对数（配齐即过关）
  stepLimit: s.steps,
  passTarget: s.cardPairs,
  cardPairs: s.cardPairs,
  revealMs: s.revealMs,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6,
  itemDropChance: 0,
  idleHintDelay: 6,
  adaptive: { stepDelta: 0, contentDelta: 0, stepMin: 5, contentMin: 3 },
}));

// ---------- 色词干扰（stroop / Stroop Color-Word） ----------
// 训练靶点：抑制控制、干扰抑制、认知灵活性（补认知雷达第 10 轴）。
// 玩法：中央显示一个中文颜色词，其「墨水颜色」可能与字义不一致；
//   默认规则 = 点「墨水颜色」，反转规则（第 19 章后段）= 点「字的含义」。
// 四条难度轴（全部由配置驱动）：
//   ① 冲突比例 conflict：一致试次越来越少、冲突试次越来越多（核心 Stroop 效应）
//   ② 颜色选项数 colors：2 → 3 → 4，选项越多干扰越大
//   ③ 限时 trialTimeMs：0（不限）→ 5000 → 3000ms，练「速度下的抑制」
//   ④ 规则反转 reverse：后段改为点字义，练认知灵活性（整关统一规则 + 常驻横幅，避免老人混淆）
// 平衡说明：stepLimit = 总题数；passTarget = 需答对的题数（约 75–83%，过关 ≠ 全对，三星留给又快又准）。

interface StroopSpec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  colors: number; conflict: number; timeMs: number;
  reverse: boolean; trials: number; pass: number; name: string;
}

const STROOP_SPECS: StroopSpec[] = [
  // 第 17 章 · 冲突比例递增（2→3 色，不限时，先把规则学会）
  { n: 1, chapter: 17, theme: "spring", colors: 2, conflict: 0.2, timeMs: 0,    reverse: false, trials: 8,  pass: 6,  name: "初辨颜色" },
  { n: 2, chapter: 17, theme: "spring", colors: 2, conflict: 0.5, timeMs: 0,    reverse: false, trials: 10, pass: 8,  name: "字色相争" },
  { n: 3, chapter: 17, theme: "summer", colors: 3, conflict: 0.6, timeMs: 0,    reverse: false, trials: 10, pass: 8,  name: "三色不乱" },
  // 第 18 章 · 颜色增多 + 引入温和限时
  { n: 4, chapter: 18, theme: "summer", colors: 3, conflict: 0.7, timeMs: 5000, reverse: false, trials: 12, pass: 9,  name: "从容作答" },
  { n: 5, chapter: 18, theme: "autumn", colors: 4, conflict: 0.7, timeMs: 5000, reverse: false, trials: 12, pass: 9,  name: "四色当前" },
  { n: 6, chapter: 18, theme: "autumn", colors: 4, conflict: 0.8, timeMs: 4000, reverse: false, trials: 12, pass: 10, name: "不为字扰" },
  // 第 19 章 · 限时收紧 + 规则反转（点字义）
  { n: 7, chapter: 19, theme: "winter", colors: 4, conflict: 0.8,  timeMs: 3500, reverse: false, trials: 14, pass: 11, name: "风雪定色" },
  { n: 8, chapter: 19, theme: "winter", colors: 4, conflict: 0.85, timeMs: 3000, reverse: true,  trials: 14, pass: 11, name: "反看字义" },
  { n: 9, chapter: 19, theme: "spring", colors: 4, conflict: 0.9,  timeMs: 3000, reverse: true,  trials: 16, pass: 12, name: "一心二用" },
];

export const GEN_STROOP: LevelConfig[] = STROOP_SPECS.map((s) => ({
  id: `7-${s.n}`,
  mode: "stroop",
  name: s.name,
  chapter: s.chapter,
  theme: s.theme,
  boardCols: 1,
  boardRows: 1,
  // stepLimit = 总题数；passTarget = 需答对的题数
  stepLimit: s.trials,
  passTarget: s.pass,
  stroopColors: s.colors,
  conflictRatio: s.conflict,
  trialTimeMs: s.timeMs,
  reverseRule: s.reverse,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6,
  itemDropChance: 0,
  idleHintDelay: 6,
  adaptive: { stepDelta: 0, contentDelta: 0, stepMin: 5, contentMin: 3 },
}));

// ---------- 日常钱币计算（money / 买菜找零） ----------
// 训练靶点：数感、心算、工作记忆、日常财务能力（IADL），补雷达第 11 轴。
// 玩法（全部免打字，给 4 个金额选项点选）：
//   · change 找零：买了 X 元的菜，付了 Y 元，应找多少？
//   · total  合计：买了几样，一共多少钱？
// 难度轴：金额上限 10→80 元、商品件数 1→3、引入角分、后段限时（复用 trialTimeMs）。
// 平衡说明：金额一律以「分」为整数单位（见 MoneyEngine），避免浮点误差；
//   stepLimit = 总题数；passTarget = 需答对的题数（过关 ≠ 全对，三星留给又快又准）。

interface MoneySpec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  mode: "change" | "total"; items: number; max: number;
  cents: boolean; timeMs: number; trials: number; pass: number; name: string;
}

const MONEY_SPECS: MoneySpec[] = [
  // 第 20 章 · 入门（整元、少件数、不限时）
  { n: 1, chapter: 20, theme: "spring", mode: "change", items: 1, max: 10, cents: false, timeMs: 0,    trials: 8,  pass: 6,  name: "初次买菜" },
  { n: 2, chapter: 20, theme: "spring", mode: "change", items: 1, max: 20, cents: false, timeMs: 0,    trials: 10, pass: 8,  name: "算清找零" },
  { n: 3, chapter: 20, theme: "summer", mode: "total",  items: 2, max: 20, cents: false, timeMs: 0,    trials: 10, pass: 8,  name: "两样合计" },
  // 第 21 章 · 进阶（引入角分 + 温和限时）
  { n: 4, chapter: 21, theme: "summer", mode: "total",  items: 2, max: 30, cents: true,  timeMs: 6000, trials: 12, pass: 9,  name: "角分入门" },
  { n: 5, chapter: 21, theme: "autumn", mode: "change", items: 2, max: 30, cents: true,  timeMs: 6000, trials: 12, pass: 9,  name: "两样找零" },
  { n: 6, chapter: 21, theme: "autumn", mode: "total",  items: 3, max: 40, cents: true,  timeMs: 5000, trials: 12, pass: 10, name: "三样结账" },
  // 第 22 章 · 高阶（金额更大 + 限时收紧）
  { n: 7, chapter: 22, theme: "winter", mode: "change", items: 3, max: 50, cents: true,  timeMs: 4500, trials: 14, pass: 11, name: "年货找零" },
  { n: 8, chapter: 22, theme: "winter", mode: "total",  items: 3, max: 60, cents: true,  timeMs: 4000, trials: 14, pass: 11, name: "满载而归" },
  { n: 9, chapter: 22, theme: "spring", mode: "change", items: 3, max: 80, cents: true,  timeMs: 3500, trials: 16, pass: 12, name: "心中有数" },
];

export const GEN_MONEY: LevelConfig[] = MONEY_SPECS.map((s) => ({
  id: `8-${s.n}`,
  mode: "money",
  name: s.name,
  chapter: s.chapter,
  theme: s.theme,
  boardCols: 1,
  boardRows: 1,
  // stepLimit = 总题数；passTarget = 需答对的题数
  stepLimit: s.trials,
  passTarget: s.pass,
  moneyMode: s.mode,
  moneyItems: s.items,
  moneyMax: s.max,
  useCents: s.cents,
  trialTimeMs: s.timeMs,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6,
  itemDropChance: 0,
  idleHintDelay: 6,
  adaptive: { stepDelta: 0, contentDelta: 0, stepMin: 5, contentMin: 3 },
}));

// ---------- 前瞻记忆（pm / Prospective Memory） ----------
// 训练靶点：前瞻记忆（记得「待会儿要做的事」）、意图维持、注意分配，补雷达第 12 轴。
// 现实痛点：忘吃药、忘关火 —— 这正是老人最容易出事、也最影响独立生活的能力。
//
// 采用**事件型前瞻记忆**范式：
//   · 进行中任务：看物品，点出它属于哪一类（蔬菜 / 水果 / 荤鲜）
//   · 前瞻任务  ：看到 🐟 鲜鱼就【先按铃】（＝记得关火）；看到 🦐/🍗 等相似诱饵不能按铃，照常分类
// 干扰设计很关键：诱饵与目标同属「荤鲜」且外形相近，必须抑制掉「顺手按铃」的冲动。
//
// 四条难度轴：
//   ① 规则横幅可见性 always（常驻）→ fade（中途隐藏）→ once（只在开头看一眼）
//   ② 目标间隔 4 → 8 题（越稀疏越难维持意图）
//   ③ 相似诱饵开关
//   ④ 分类类别数 2 → 3（进行中任务越占注意，前瞻记忆越难）
// 平衡说明：stepLimit = 总题数；passTarget = 需做对的题数（含按铃与分类）。

interface PmSpec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  banner: "always" | "fade" | "once"; every: number;
  lures: boolean; cats: number; trials: number; pass: number; name: string;
}

const PM_SPECS: PmSpec[] = [
  // 第 23 章 · 入门（横幅常驻、目标密集、无诱饵）
  { n: 1, chapter: 23, theme: "spring",  banner: "always", every: 4, lures: false, cats: 2, trials: 16, pass: 12, name: "记着关火" },
  { n: 2, chapter: 23, theme: "spring",  banner: "always", every: 5, lures: false, cats: 2, trials: 18, pass: 14, name: "稍有间隔" },
  { n: 3, chapter: 23, theme: "summer",  banner: "always", every: 5, lures: true,  cats: 2, trials: 18, pass: 14, name: "别被带跑" },
  // 第 24 章 · 进阶（横幅中途隐藏、目标更稀疏、类别增至 3）
  { n: 4, chapter: 24, theme: "summer",  banner: "fade",   every: 6, lures: true,  cats: 2, trials: 20, pass: 15, name: "横幅隐去" },
  { n: 5, chapter: 24, theme: "autumn",  banner: "fade",   every: 6, lures: true,  cats: 3, trials: 20, pass: 15, name: "三类别忙" },
  { n: 6, chapter: 24, theme: "autumn",  banner: "fade",   every: 7, lures: true,  cats: 3, trials: 22, pass: 17, name: "久等一回" },
  // 第 25 章 · 高阶（横幅只看一次、目标最稀疏）
  { n: 7, chapter: 25, theme: "winter",  banner: "once",   every: 7, lures: true,  cats: 3, trials: 22, pass: 17, name: "全凭记性" },
  { n: 8, chapter: 25, theme: "winter",  banner: "once",   every: 8, lures: true,  cats: 3, trials: 24, pass: 18, name: "久久不忘" },
  { n: 9, chapter: 25, theme: "spring",  banner: "once",   every: 8, lures: true,  cats: 3, trials: 24, pass: 19, name: "念念不忘" },
];

export const GEN_PM: LevelConfig[] = PM_SPECS.map((s) => ({
  id: `9-${s.n}`,
  mode: "pm",
  name: s.name,
  chapter: s.chapter,
  theme: s.theme,
  boardCols: 1,
  boardRows: 1,
  // stepLimit = 总题数；passTarget = 需做对的题数
  stepLimit: s.trials,
  passTarget: s.pass,
  pmBanner: s.banner,
  pmTargetEvery: s.every,
  pmLures: s.lures,
  pmCategories: s.cats,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6,
  itemDropChance: 0,
  idleHintDelay: 6,
  adaptive: { stepDelta: 0, contentDelta: 0, stepMin: 5, contentMin: 3 },
}));

// ---------- 时间/钟表定向（clock / Clock Reading & Setting） ----------
// 训练靶点：时间定向、视觉空间转换、日常实用能力，补雷达第 13 轴。
// 说明：时间定向是认知筛查里非常敏感的指标（画钟测验相关），
//   且「看不懂钟」会直接影响老人独立生活（几点吃药、几点接孩子）。
//
// 两种题型：
//   · read 认时间：看钟面，从 4 个时间里点选正确的一个
//   · set  拨钟表：给一个时间，从 4 个钟面里点选对应的一个（反向映射，更难）
// 干扰项特意包含「时针分针互换」类（如 3 点看成 15 分），这是最常见的读钟错误。
//
// 四条难度轴：
//   ① 时间精度 hour（整点）→ half（半点）→ five（5 分）→ minute（任意分）
//   ② 题型 read → set
//   ③ 钟面数字 有 → 无（只有刻度）
//   ④ 后段限时
// 平衡说明：stepLimit = 总题数；passTarget = 需答对的题数（过关 ≠ 全对）。

interface ClockSpec {
  n: number; chapter: number; theme: LevelConfig["theme"];
  mode: "read" | "set"; precision: "hour" | "half" | "five" | "minute";
  numbers: boolean; timeMs: number; trials: number; pass: number; name: string;
}

const CLOCK_SPECS: ClockSpec[] = [
  // 第 26 章 · 认时间（有数字、不限时，先把钟面读明白）
  { n: 1, chapter: 26, theme: "spring", mode: "read", precision: "hour",   numbers: true,  timeMs: 0,    trials: 8,  pass: 6,  name: "整点初识" },
  { n: 2, chapter: 26, theme: "spring", mode: "read", precision: "half",   numbers: true,  timeMs: 0,    trials: 10, pass: 8,  name: "半点分明" },
  { n: 3, chapter: 26, theme: "summer", mode: "read", precision: "five",   numbers: true,  timeMs: 0,    trials: 10, pass: 8,  name: "五分细辨" },
  // 第 27 章 · 去掉数字 + 引入「拨钟表」+ 温和限时
  { n: 4, chapter: 27, theme: "summer", mode: "read", precision: "five",   numbers: false, timeMs: 5000, trials: 12, pass: 9,  name: "无字识时" },
  { n: 5, chapter: 27, theme: "autumn", mode: "set",  precision: "five",   numbers: false, timeMs: 5000, trials: 12, pass: 9,  name: "反拨指针" },
  { n: 6, chapter: 27, theme: "autumn", mode: "set",  precision: "minute", numbers: false, timeMs: 4500, trials: 12, pass: 10, name: "分秒不差" },
  // 第 28 章 · 高阶（任意分 + 无数字 + 限时收紧）
  { n: 7, chapter: 28, theme: "winter", mode: "set",  precision: "minute", numbers: false, timeMs: 4500, trials: 14, pass: 11, name: "寒夜辨钟" },
  { n: 8, chapter: 28, theme: "winter", mode: "set",  precision: "minute", numbers: false, timeMs: 4000, trials: 14, pass: 11, name: "指针随心" },
  { n: 9, chapter: 28, theme: "spring", mode: "set",  precision: "minute", numbers: false, timeMs: 3500, trials: 16, pass: 12, name: "时光在心" },
];

export const GEN_CLOCK: LevelConfig[] = CLOCK_SPECS.map((s) => ({
  id: `10-${s.n}`,
  mode: "clock",
  name: s.name,
  chapter: s.chapter,
  theme: s.theme,
  boardCols: 1,
  boardRows: 1,
  // stepLimit = 总题数；passTarget = 需答对的题数
  stepLimit: s.trials,
  passTarget: s.pass,
  clockMode: s.mode,
  clockPrecision: s.precision,
  clockNumbers: s.numbers,
  trialTimeMs: s.timeMs,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6,
  itemDropChance: 0,
  idleHintDelay: 6,
  adaptive: { stepDelta: 0, contentDelta: 0, stepMin: 5, contentMin: 3 },
}));
