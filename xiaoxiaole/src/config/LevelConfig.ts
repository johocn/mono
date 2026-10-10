/**
 * 关卡配置 — match3 12 关 + 听音辨位 8 关 + 诗词 8 关（配置驱动，非硬编码）
 * 对应 spec v1.1 第 3-5 节；新增章节 / 季节主题（春 / 夏 / 秋 / 冬花园）
 *
 * 难度梯度设计（延续适老化）：
 *  - match3：图标 3→5 种、障碍从「无 → 单类递增 → 数量加压」、辅助道具随难度递增
 *  - audio ：声音种类 3→4、选择 4→5 选项、序列 2→3→4 长度、干扰逐步引入
 *  - poetry：配对 3→8 对、提示 full→radical、路径拐角逐步收紧
 * 章节主题：每模式按 id 顺序每 2 关划为一个季节（春 / 夏 / 秋 / 冬），供选关 UI 与关内强调色使用。
 */

export type ModeId = "match3" | "audio" | "poetry" | "corsi" | "face" | "memory" | "stroop" | "money" | "pm" | "clock" | "nostalgia";
export type LevelId = string; // e.g. "1-1"
export type ThemeId = "spring" | "summer" | "autumn" | "winter" | "shuangyang";

import { GEN_MATCH3, GEN_AUDIO, GEN_POETRY, GEN_CORSI, GEN_FACE, GEN_MEMORY, GEN_STROOP, GEN_MONEY, GEN_PM, GEN_CLOCK } from "./LevelGen";
export { GEN_MATCH3, GEN_AUDIO, GEN_POETRY, GEN_CORSI, GEN_FACE, GEN_MEMORY, GEN_STROOP, GEN_MONEY, GEN_PM, GEN_CLOCK };

export interface LevelConfig {
  id: LevelId;
  mode: ModeId;
  name: string;
  boardCols: number;
  boardRows: number;
  stepLimit: number;
  timeLimit?: number;       // 限时关（秒）：在时限内达成目标，否则失败（取代步数约束）
  passTarget: number;
  iconTypes?: string[];       // match3 / audio
  poetryPairs?: PoetryPair[]; // poetry
  obstacles?: ObstacleConfig;
  items: ItemConfig;
  itemDropInterval: number;   // 每消耗 N 步
  itemDropChance: number;     // 概率
  idleHintDelay: number;      // 秒
  adaptive: AdaptiveRange;
  chapter?: number;        // 章节序号（同一模式内，从 1 起）；用于选关分组与章节标题
  theme?: ThemeId;         // 季节主题：春/夏/秋/冬，用于选关卡配色与关内强调色
  // audio mode
  audioDuration?: number;     // 秒
  matchPairs?: number;
  hasInterference?: boolean;
  visualClueDelay?: number;   // 秒
  // audio mode 新范式参数
  audioParadigm?: "choice" | "sequence"; // 2-1=选择, 2-2=序列
  tutorial?: boolean;        // 引导教程关（2-1）：分步教学如何玩，难度极宽松
  choiceCount?: number;       // 选择题选项数
  questionCount?: number;     // 题目数
  sequenceLength?: number;    // 序列起始长度
  sequenceMax?: number;       // 序列最大长度
  sequenceGap?: number;       // 序列中每个声音间隔秒数
  audioPool?: number;         // 本关从 iconTypes 中随机抽取使用的候选音数量（阶梯式难度 4→8）
  visualFallback?: boolean;   // 听力筛查未通过时的视觉替代路径
  // match3 目标（独立目标类型，与分数关并存）：达成即过关；优先级高于 passTarget 分数
  goal?: GoalConfig;
  // poetry mode
  maxCorners?: number;        // 连线最多拐角
  clueLevel?: "full" | "radical";
  // corsi mode（空间记忆 / 科西积木）：网格 + 序列 + 轮次
  gridSize?: number;          // 网格边长（3 | 4 | 5）
  rounds?: number;            // 总轮次（每轮 = 演示 + 点回一个序列）
  // 注：sequenceLength（目标序列长度）已在本接口 audio 段声明，corsi 复用之
  // face mode（面孔-名字联想）：学习面孔数 + 延迟 + 选项数
  faceCount?: number;         // 需学习的面孔-名字对数
  delayMs?: number;           // 学习完到回忆的延迟（毫秒），难度脊
  options?: number;           // 回忆时给出的选项数（含正确项）
  // memory mode（记忆翻翻乐 / Concentration）：翻 theme 牌配对
  cardPairs?: number;         // 牌的逻辑对数（棋盘实际张数 = cardPairs × 2）
  revealMs?: number;          // 翻错后两张牌停留可见的时长（毫秒），难度脊
  // stroop mode（色词干扰 / Stroop）：四条难度轴全部由配置驱动
  stroopColors?: number;      // 颜色选项数（2 | 3 | 4）
  conflictRatio?: number;     // 冲突试次占比（0..1，0=全部一致，越高越难）
  trialTimeMs?: number;       // 每题限时（毫秒），0 = 不限时
  reverseRule?: boolean;      // true = 反转规则：点「字的含义」而非墨水颜色
  // money mode（日常钱币计算）：买菜找零 / 合计，金额一律以「分」为单位避免浮点误差
  moneyMode?: "change" | "total"; // 题型：找零 / 算总价
  moneyItems?: number;        // 商品件数（1..3）
  moneyMax?: number;          // 金额上限（元）
  useCents?: boolean;         // 是否带角分（false = 只取整元）
  // pm mode（前瞻记忆）：进行中任务 = 物品分类；前瞻任务 = 看到目标就按铃
  pmBanner?: "always" | "fade" | "once"; // 规则横幅可见性（越难越看不到）
  pmTargetEvery?: number;     // 目标每隔几题出现一次（越大越稀疏、越难维持意图）
  pmLures?: boolean;          // 是否插入相似诱饵（诱饵不能按铃）
  pmCategories?: number;      // 分类类别数（2 或 3，越多占用注意越多）
  // clock mode（时间/钟表定向）：钟面全部程序化绘制
  clockMode?: "read" | "set";                       // 认时间（看钟面选时间）/ 拨钟表（给时间选钟面）
  clockPrecision?: "hour" | "half" | "five" | "minute"; // 时间精度：整点 / 半点 / 5 分 / 任意分
  clockNumbers?: boolean;      // 钟面是否显示 1-12 数字（false = 只有刻度，更难）
  // nostalgia mode（怀旧金曲 / 歌词-歌名联想回忆）：纯文本大字号，怀旧疗法 + 语义/联想/情景记忆
  nostalgiaOptionCount?: number;   // 每题选项数（含正确项）
  nostalgiaVariants?: ("lyricToTitle" | "titleToLyric")[]; // 启用题型：看歌词选歌名 / 看歌名选歌词
}

export interface GoalConfig {
  type: "collect";            // 收集指定图标类型 N 个即过关
  collect: Record<string, number>; // 图标 id -> 需收集数量
}

export interface PoetryPair {
  upper: string;
  lower: string;
}

export interface ObstacleConfig {
  type: "frozen" | "interference" | "radical" | "chain" | "blackhole" | "jelly";
  count: number;
}

export interface ItemConfig {
  hint: number;
  reshuffle: number;
  reveal: number;
  peek: number;
  undo: number;
  rehear: number;
  step: number;
  shield: number;
  hammer: number;             // 锤子：本关可用数（初始携带 + 开局带入合计），点选消除任意一格
}

export interface AdaptiveRange {
  stepDelta: number;   // 步数浮动量
  contentDelta: number; // 内容数量浮动
  stepMin: number;     // 步数下限
  contentMin: number;  // 内容数量下限
}

// === 基础模式 时光整理师（match3）===
// 章节主题：1-1~1-2 春之园 / 1-3~1-4 夏之园 / 1-5~1-6 秋之园 / 1-7~1-8 冬之园
// passTarget 由 tools/balance-sim.ts 蒙特卡洛模拟标定（随机可行解玩家的 p25 分位）；
// 目标是「认真玩基本都能过，三星需连击质量 + 步数效率」。标记「待标定」处需运行 npm run balance 后回填。
export const LEVEL_1_1: LevelConfig = {
  id: "1-1", mode: "match3", name: "初见花园", chapter: 1, theme: "spring",
  boardCols: 6, boardRows: 6,
  stepLimit: 25, passTarget: 13000,
  iconTypes: ["flower", "leaf", "fruit"],
  items: { hint: 1, reshuffle: 0, reveal: 1, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 8, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 3, contentDelta: 0, stepMin: 19, contentMin: 3 },
};

export const LEVEL_1_2: LevelConfig = {
  id: "1-2", mode: "match3", name: "整理时光", chapter: 1, theme: "spring",
  boardCols: 6, boardRows: 6,
  stepLimit: 22, passTarget: 3700,
  iconTypes: ["flower", "leaf", "fruit", "butterfly"],
  obstacles: { type: "frozen", count: 3 },
  items: { hint: 1, reshuffle: 1, reveal: 1, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 7, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 16, contentMin: 3 },
};

// 1-3：锁链障碍 — 被缠住的棋子需相邻消除才能解锁
export const LEVEL_1_3: LevelConfig = {
  id: "1-3", mode: "match3", name: "缠绕记忆", chapter: 1, theme: "summer",
  boardCols: 6, boardRows: 6,
  stepLimit: 24, passTarget: 3300,
  iconTypes: ["flower", "leaf", "fruit", "butterfly"],
  obstacles: { type: "chain", count: 4 },
  items: { hint: 2, reshuffle: 1, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 7, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 18, contentMin: 3 },
};

// 1-4：黑洞障碍 — 黑洞格吞噬连线、需相邻消除才消散
export const LEVEL_1_4: LevelConfig = {
  id: "1-4", mode: "match3", name: "星渊回响", chapter: 1, theme: "summer",
  goal: { type: "collect", collect: { flower: 12, bird: 8 } }, // 收集目标示范：收集 12 花 + 8 鸟
  boardCols: 6, boardRows: 6,
  stepLimit: 22, passTarget: 2100,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "blackhole", count: 3 },
  items: { hint: 2, reshuffle: 1, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 17, contentMin: 4 },
};

// 1-5：秋之园 — 冰冻加压（数量提升），图标满 5 种
export const LEVEL_1_5: LevelConfig = {
  id: "1-5", mode: "match3", name: "金风玉露", chapter: 2, theme: "autumn",
  boardCols: 6, boardRows: 6,
  stepLimit: 22, passTarget: 2100,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "frozen", count: 5 },
  items: { hint: 2, reshuffle: 1, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 7, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 18, contentMin: 4 },
};

// 1-6：秋之园 — 锁链加压
export const LEVEL_1_6: LevelConfig = {
  id: "1-6", mode: "match3", name: "霜染层林", chapter: 2, theme: "autumn",
  boardCols: 6, boardRows: 6,
  stepLimit: 21, passTarget: 2000,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "chain", count: 5 },
  items: { hint: 2, reshuffle: 1, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 17, contentMin: 4 },
};

// 1-7：冬之园 — 黑洞加压
export const LEVEL_1_7: LevelConfig = {
  id: "1-7", mode: "match3", name: "寒宵听雪", chapter: 2, theme: "winter",
  boardCols: 6, boardRows: 6,
  stepLimit: 20, passTarget: 1900,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "blackhole", count: 4 },
  items: { hint: 3, reshuffle: 2, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 16, contentMin: 5 },
};

// 1-8：冬之园 — 黑洞进一步强化，章节收束
export const LEVEL_1_8: LevelConfig = {
  id: "1-8", mode: "match3", name: "岁暮归鸿", chapter: 2, theme: "winter",
  goal: { type: "collect", collect: { fruit: 14, butterfly: 10 } }, // 收集目标示范：收集 14 果 + 10 蝶
  boardCols: 6, boardRows: 6,
  stepLimit: 19, passTarget: 1800,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "blackhole", count: 5 },
  items: { hint: 3, reshuffle: 2, reveal: 2, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 15, contentMin: 5 },
};

// 1-9：特效棋子登场 — 4 连生成直线火箭、5 连生成同色炸弹（机制自动生效），冰冻加压
export const LEVEL_1_9: LevelConfig = {
  id: "1-9", mode: "match3", name: "花信风起", chapter: 3, theme: "spring",
  boardCols: 6, boardRows: 6,
  stepLimit: 22, passTarget: 2600,
  iconTypes: ["flower", "leaf", "fruit", "butterfly"],
  obstacles: { type: "frozen", count: 4 },
  items: { hint: 3, reshuffle: 1, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 7, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 17, contentMin: 4 },
};

// 1-10：锁链 + 满 5 种图标 — 鼓励 5 连同色炸弹
export const LEVEL_1_10: LevelConfig = {
  id: "1-10", mode: "match3", name: "荷塘月色", chapter: 3, theme: "summer",
  boardCols: 6, boardRows: 6,
  stepLimit: 21, passTarget: 2500,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "chain", count: 5 },
  items: { hint: 3, reshuffle: 2, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 16, contentMin: 5 },
};

// 1-11：黑洞加压 + 5 种图标 — 综合考验特效与障碍
export const LEVEL_1_11: LevelConfig = {
  id: "1-11", mode: "match3", name: "桂子飘香", chapter: 3, theme: "autumn",
  boardCols: 6, boardRows: 6,
  stepLimit: 20, passTarget: 2300,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "blackhole", count: 5 },
  items: { hint: 3, reshuffle: 2, reveal: 2, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 15, contentMin: 5 },
};

// 1-12：章节收束 — 黑洞强化 + 满图标，综合最高难度
export const LEVEL_1_12: LevelConfig = {
  id: "1-12", mode: "match3", name: "瑞雪丰年", chapter: 3, theme: "winter",
  goal: { type: "collect", collect: { bird: 10, leaf: 12 } }, // 收集目标示范：收集 10 鸟 + 12 叶
  boardCols: 6, boardRows: 6,
  stepLimit: 19, passTarget: 2100,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "blackhole", count: 6 },
  items: { hint: 3, reshuffle: 2, reveal: 2, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 14, contentMin: 5 },
};

// === 进阶模式 听音辨位（audio）===
// 玩法：2-1 引导教程（听音 → 选图标）；2-2 起全部为「声音序列复述」，序列长度 ≥3，训练听觉工作记忆。
// 声音体系：7 大类 × 8 种 = 56 种（见 SoundLibrary）。每关从某类（或混合）8 种中随机抽取 audioPool 种作为本题素材。
// 难度阶梯：候选音数 audioPool 从 4 递增到 8（2-1 教程固定 3）；序列长度 3→4→5→6（自适应上限 +1）。
// 干扰逐步引入，2-8 跨类混合综合记忆。延续适老化：visualFallback 恒开、序列长度自适应下限恒为 3。

// 2-1：引导教程 — 分步教「听声音 → 选对应图标」，难度极宽松
export const LEVEL_2_1: LevelConfig = {
  id: "2-1", mode: "audio", name: "聆听花园", chapter: 1, theme: "spring",
  boardCols: 4, boardRows: 4,
  stepLimit: 10, passTarget: 3,
  iconTypes: ["sparrow", "rain", "doorbell"],
  audioParadigm: "choice",
  tutorial: true,
  choiceCount: 3, questionCount: 5,
  audioDuration: 2.6, matchPairs: 6,
  hasInterference: false, visualClueDelay: 4,
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 2, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 6,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 8, contentMin: 3 },
};

// 2-2：序列入门 — 长度 3，从鸟鸣类 8 种中随机抽取 4 种（最易辨识）
export const LEVEL_2_2: LevelConfig = {
  id: "2-2", mode: "audio", name: "声影寻踪", chapter: 1, theme: "spring",
  boardCols: 4, boardRows: 4,
  stepLimit: 10, passTarget: 4,
  iconTypes: ["sparrow", "cuckoo", "owl", "robin", "magpie", "woodpecker", "seagull", "nightingale"],
  audioPool: 4,
  audioParadigm: "sequence",
  sequenceLength: 3, sequenceMax: 4, sequenceGap: 0.35,
  questionCount: 6,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: false, visualClueDelay: 4,
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 1, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 7, contentMin: 3 },
};

// 2-3：序列巩固 — 长度 3→4，从动物类 8 种中随机抽取 5 种
export const LEVEL_2_3: LevelConfig = {
  id: "2-3", mode: "audio", name: "蝉鸣夏深", chapter: 1, theme: "summer",
  boardCols: 4, boardRows: 4,
  stepLimit: 11, passTarget: 5,
  iconTypes: ["dog", "cat", "cow", "frog", "horse", "sheep", "pig", "rooster"],
  audioPool: 5,
  audioParadigm: "sequence",
  sequenceLength: 3, sequenceMax: 4, sequenceGap: 0.35,
  questionCount: 7,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: false, visualClueDelay: 4,
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 1, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 8, contentMin: 3 },
};

// 2-4：序列进阶 — 长度 4、引入干扰音，从自然界类 8 种中随机抽取 5 种
export const LEVEL_2_4: LevelConfig = {
  id: "2-4", mode: "audio", name: "骤雨初歇", chapter: 1, theme: "summer",
  boardCols: 4, boardRows: 4,
  stepLimit: 11, passTarget: 5,
  iconTypes: ["rain", "wind", "thunder", "waves", "fire", "stream", "leaves", "waterfall"],
  audioPool: 5,
  audioParadigm: "sequence",
  sequenceLength: 4, sequenceMax: 5, sequenceGap: 0.35,
  questionCount: 7,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  obstacles: { type: "interference", count: 1 },
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 1, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 8, contentMin: 3 },
};

// 2-5：序列进阶 — 长度 4，从生活类 8 种中随机抽取 6 种
export const LEVEL_2_5: LevelConfig = {
  id: "2-5", mode: "audio", name: "雁过秋空", chapter: 2, theme: "autumn",
  boardCols: 4, boardRows: 4,
  stepLimit: 12, passTarget: 6,
  iconTypes: ["doorbell", "phone", "kettle", "clock", "knock", "camera", "scissors", "zipper"],
  audioPool: 6,
  audioParadigm: "sequence",
  sequenceLength: 4, sequenceMax: 5, sequenceGap: 0.35,
  questionCount: 8,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: false, visualClueDelay: 4,
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 1, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 9, contentMin: 3 },
};

// 2-6：序列强化 — 长度 5、含干扰，从乐器类 8 种中随机抽取 6 种
export const LEVEL_2_6: LevelConfig = {
  id: "2-6", mode: "audio", name: "暮色四合", chapter: 2, theme: "autumn",
  boardCols: 4, boardRows: 4,
  stepLimit: 12, passTarget: 6,
  iconTypes: ["bell", "drum", "flute", "guzheng", "piano", "violin", "trumpet", "harmonica"],
  audioPool: 6,
  audioParadigm: "sequence",
  sequenceLength: 5, sequenceMax: 6, sequenceGap: 0.35,
  questionCount: 8,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  obstacles: { type: "interference", count: 1 },
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 1, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 9, contentMin: 3 },
};

// 2-7：序列挑战 — 长度 5、含干扰，从交通类 8 种中随机抽取 7 种
export const LEVEL_2_7: LevelConfig = {
  id: "2-7", mode: "audio", name: "寒夜围炉", chapter: 2, theme: "winter",
  boardCols: 4, boardRows: 4,
  stepLimit: 13, passTarget: 7,
  iconTypes: ["carhorn", "train", "bicycle", "boat", "airplane", "motorcycle", "ambulance", "subway"],
  audioPool: 7,
  audioParadigm: "sequence",
  sequenceLength: 5, sequenceMax: 6, sequenceGap: 0.35,
  questionCount: 9,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 2, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 10, contentMin: 3 },
};

// 2-8：序列终章 — 长度 6→7、含干扰，跨类混合 8 种（综合记忆）
export const LEVEL_2_8: LevelConfig = {
  id: "2-8", mode: "audio", name: "梅香报晓", chapter: 2, theme: "winter",
  boardCols: 4, boardRows: 4,
  stepLimit: 14, passTarget: 7,
  iconTypes: ["sparrow", "dog", "doorbell", "bell", "carhorn", "baby", "laugh", "whistle"],
  audioPool: 8,
  audioParadigm: "sequence",
  sequenceLength: 6, sequenceMax: 7, sequenceGap: 0.35,
  questionCount: 10,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  obstacles: { type: "interference", count: 1 },
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 2, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 10, contentMin: 3 },
};

// === 挑战模式 诗词连连看（poetry）===
// 章节主题：3-1~3-2 春之园 / 3-3~3-4 夏之园 / 3-5~3-6 秋之园 / 3-7~3-8 冬之园
// 配对池（按难度取前 N 对）：床前/明月光、春眠/不觉晓、白日/依山尽、锄禾/当午、
// 红豆/生南国、白毛/浮绿水、远看/山有色、离离/原上草
// passTarget = 需成功配对数（= 对数）；stepLimit = 对数 + 容错。
export const LEVEL_3_1: LevelConfig = {
  id: "3-1", mode: "poetry", name: "诗意初醒", chapter: 1, theme: "spring",
  boardCols: 5, boardRows: 5,
  stepLimit: 11, passTarget: 3,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
  ],
  maxCorners: 2, clueLevel: "full",
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 1, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.20,
  idleHintDelay: 5,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 8, contentMin: 2 },
};

export const LEVEL_3_2: LevelConfig = {
  id: "3-2", mode: "poetry", name: "词林漫步", chapter: 1, theme: "spring",
  boardCols: 5, boardRows: 5,
  stepLimit: 12, passTarget: 4,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
  ],
  maxCorners: 3, clueLevel: "radical",
  items: { hint: 0, reshuffle: 0, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 9, contentMin: 2 },
};

export const LEVEL_3_3: LevelConfig = {
  id: "3-3", mode: "poetry", name: "荷风送香", chapter: 1, theme: "summer",
  boardCols: 5, boardRows: 5,
  stepLimit: 13, passTarget: 5,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
  ],
  maxCorners: 2, clueLevel: "full",
  items: { hint: 0, reshuffle: 0, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.20,
  idleHintDelay: 5,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 10, contentMin: 3 },
};

export const LEVEL_3_4: LevelConfig = {
  id: "3-4", mode: "poetry", name: "竹影摇窗", chapter: 1, theme: "summer",
  boardCols: 5, boardRows: 5,
  stepLimit: 14, passTarget: 5,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
  ],
  maxCorners: 3, clueLevel: "radical",
  items: { hint: 0, reshuffle: 0, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 11, contentMin: 3 },
};

export const LEVEL_3_5: LevelConfig = {
  id: "3-5", mode: "poetry", name: "桂子月中", chapter: 2, theme: "autumn",
  boardCols: 5, boardRows: 5,
  stepLimit: 15, passTarget: 6,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
    { upper: "白毛", lower: "浮绿水" },
  ],
  maxCorners: 2, clueLevel: "full",
  items: { hint: 0, reshuffle: 0, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.20,
  idleHintDelay: 5,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 12, contentMin: 3 },
};

export const LEVEL_3_6: LevelConfig = {
  id: "3-6", mode: "poetry", name: "霜枫染墨", chapter: 2, theme: "autumn",
  boardCols: 5, boardRows: 5,
  stepLimit: 16, passTarget: 6,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
    { upper: "白毛", lower: "浮绿水" },
  ],
  maxCorners: 3, clueLevel: "radical",
  items: { hint: 0, reshuffle: 0, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 13, contentMin: 3 },
};

export const LEVEL_3_7: LevelConfig = {
  id: "3-7", mode: "poetry", name: "梅雪争春", chapter: 2, theme: "winter",
  boardCols: 5, boardRows: 5,
  stepLimit: 18, passTarget: 7,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
    { upper: "白毛", lower: "浮绿水" },
    { upper: "远看", lower: "山有色" },
  ],
  maxCorners: 3, clueLevel: "radical",
  items: { hint: 0, reshuffle: 1, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 14, contentMin: 3 },
};

export const LEVEL_3_8: LevelConfig = {
  id: "3-8", mode: "poetry", name: "岁寒三友", chapter: 2, theme: "winter",
  boardCols: 5, boardRows: 5,
  stepLimit: 20, passTarget: 8,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
    { upper: "白毛", lower: "浮绿水" },
    { upper: "远看", lower: "山有色" },
    { upper: "离离", lower: "原上草" },
  ],
  maxCorners: 4, clueLevel: "radical",
  items: { hint: 0, reshuffle: 1, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 16, contentMin: 4 },
};

// === 扩展关卡（P2：扩关到 40+）===
// match3 续章：障碍持续加压、目标混合；audio / poetry 序列与配对继续拉长。

export const LEVEL_1_13: LevelConfig = {
  id: "1-13", mode: "match3", name: "春日迟迟", chapter: 4, theme: "spring",
  boardCols: 6, boardRows: 6,
  stepLimit: 20, passTarget: 2100,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "frozen", count: 5 },
  items: { hint: 3, reshuffle: 2, reveal: 2, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 14, contentMin: 5 },
};

export const LEVEL_1_14: LevelConfig = {
  id: "1-14", mode: "match3", name: "夏木阴阴", chapter: 4, theme: "summer",
  boardCols: 6, boardRows: 6,
  stepLimit: 19, passTarget: 1900,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "chain", count: 5 },
  items: { hint: 3, reshuffle: 2, reveal: 2, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 14, contentMin: 5 },
};

export const LEVEL_1_15: LevelConfig = {
  id: "1-15", mode: "match3", name: "秋声万户", chapter: 4, theme: "autumn",
  boardCols: 6, boardRows: 6,
  stepLimit: 19, passTarget: 2000,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "blackhole", count: 6 },
  items: { hint: 3, reshuffle: 2, reveal: 2, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 13, contentMin: 5 },
};

export const LEVEL_1_16: LevelConfig = {
  id: "1-16", mode: "match3", name: "冬岭苍苍", chapter: 4, theme: "winter",
  goal: { type: "collect", collect: { flower: 14, butterfly: 12 } }, // 收集目标：14 花 + 12 蝶
  boardCols: 6, boardRows: 6,
  stepLimit: 18, passTarget: 1800,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "blackhole", count: 6 },
  items: { hint: 3, reshuffle: 2, reveal: 2, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 13, contentMin: 5 },
};

export const LEVEL_1_17: LevelConfig = {
  id: "1-17", mode: "match3", name: "岁寒清供", chapter: 5, theme: "spring",
  goal: { type: "collect", collect: { bird: 12, leaf: 14 } }, // 收集目标：12 鸟 + 14 叶
  boardCols: 6, boardRows: 6,
  stepLimit: 18, passTarget: 1800,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "blackhole", count: 7 },
  items: { hint: 3, reshuffle: 2, reveal: 2, peek: 0, undo: 1, rehear: 0, step: 0, shield: 1, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 12, contentMin: 5 },
};

export const LEVEL_2_9: LevelConfig = {
  id: "2-9", mode: "audio", name: "百鸟朝凤", chapter: 3, theme: "spring",
  boardCols: 4, boardRows: 4,
  stepLimit: 13, passTarget: 7,
  iconTypes: ["sparrow", "cuckoo", "owl", "robin", "magpie", "woodpecker", "seagull", "nightingale"],
  audioPool: 6,
  audioParadigm: "sequence",
  sequenceLength: 6, sequenceMax: 7, sequenceGap: 0.35,
  questionCount: 9,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  obstacles: { type: "interference", count: 1 },
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 2, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 10, contentMin: 3 },
};

export const LEVEL_2_10: LevelConfig = {
  id: "2-10", mode: "audio", name: "六畜兴旺", chapter: 3, theme: "summer",
  boardCols: 4, boardRows: 4,
  stepLimit: 14, passTarget: 8,
  iconTypes: ["dog", "cat", "cow", "frog", "horse", "sheep", "pig", "rooster"],
  audioPool: 7,
  audioParadigm: "sequence",
  sequenceLength: 6, sequenceMax: 7, sequenceGap: 0.35,
  questionCount: 10,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  obstacles: { type: "interference", count: 1 },
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 2, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 11, contentMin: 3 },
};

export const LEVEL_2_11: LevelConfig = {
  id: "2-11", mode: "audio", name: "天籁清音", chapter: 3, theme: "autumn",
  boardCols: 4, boardRows: 4,
  stepLimit: 14, passTarget: 8,
  iconTypes: ["rain", "wind", "thunder", "waves", "fire", "stream", "leaves", "waterfall"],
  audioPool: 7,
  audioParadigm: "sequence",
  sequenceLength: 7, sequenceMax: 8, sequenceGap: 0.35,
  questionCount: 10,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  obstacles: { type: "interference", count: 1 },
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 2, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 11, contentMin: 3 },
};

export const LEVEL_2_12: LevelConfig = {
  id: "2-12", mode: "audio", name: "市井喧阗", chapter: 3, theme: "winter",
  boardCols: 4, boardRows: 4,
  stepLimit: 15, passTarget: 9,
  iconTypes: ["doorbell", "phone", "kettle", "clock", "knock", "camera", "scissors", "zipper"],
  audioPool: 8,
  audioParadigm: "sequence",
  sequenceLength: 7, sequenceMax: 8, sequenceGap: 0.35,
  questionCount: 11,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  obstacles: { type: "interference", count: 1 },
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 3, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 12, contentMin: 3 },
};

export const LEVEL_2_13: LevelConfig = {
  id: "2-13", mode: "audio", name: "八音克谐", chapter: 4, theme: "spring",
  boardCols: 4, boardRows: 4,
  stepLimit: 16, passTarget: 10,
  iconTypes: ["bell", "drum", "flute", "guzheng", "piano", "violin", "trumpet", "carhorn"],
  audioPool: 8,
  audioParadigm: "sequence",
  sequenceLength: 8, sequenceMax: 9, sequenceGap: 0.35,
  questionCount: 12,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  obstacles: { type: "interference", count: 1 },
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 3, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 12, contentMin: 3 },
};

export const LEVEL_3_9: LevelConfig = {
  id: "3-9", mode: "poetry", name: "枫桥夜泊", chapter: 3, theme: "autumn",
  boardCols: 5, boardRows: 5,
  stepLimit: 21, passTarget: 9,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
    { upper: "白毛", lower: "浮绿水" },
    { upper: "远看", lower: "山有色" },
    { upper: "离离", lower: "原上草" },
    { upper: "月落", lower: "乌啼霜" },
  ],
  maxCorners: 3, clueLevel: "radical",
  items: { hint: 0, reshuffle: 1, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 17, contentMin: 4 },
};

export const LEVEL_3_10: LevelConfig = {
  id: "3-10", mode: "poetry", name: "草堂春睡", chapter: 3, theme: "spring",
  boardCols: 5, boardRows: 5,
  stepLimit: 22, passTarget: 10,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
    { upper: "白毛", lower: "浮绿水" },
    { upper: "远看", lower: "山有色" },
    { upper: "离离", lower: "原上草" },
    { upper: "月落", lower: "乌啼霜" },
    { upper: "两个", lower: "黄鹂鸣" },
  ],
  maxCorners: 4, clueLevel: "radical",
  items: { hint: 0, reshuffle: 1, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 18, contentMin: 4 },
};

export const LEVEL_3_11: LevelConfig = {
  id: "3-11", mode: "poetry", name: "空山新雨", chapter: 4, theme: "autumn",
  boardCols: 5, boardRows: 5,
  stepLimit: 23, passTarget: 10,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
    { upper: "白毛", lower: "浮绿水" },
    { upper: "远看", lower: "山有色" },
    { upper: "离离", lower: "原上草" },
    { upper: "月落", lower: "乌啼霜" },
    { upper: "两个", lower: "黄鹂鸣" },
  ],
  maxCorners: 4, clueLevel: "radical",
  items: { hint: 0, reshuffle: 1, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 18, contentMin: 4 },
};

export const LEVEL_3_12: LevelConfig = {
  id: "3-12", mode: "poetry", name: "江雪独钓", chapter: 4, theme: "winter",
  boardCols: 5, boardRows: 5,
  stepLimit: 25, passTarget: 11,
  poetryPairs: [
    { upper: "床前", lower: "明月光" },
    { upper: "春眠", lower: "不觉晓" },
    { upper: "白日", lower: "依山尽" },
    { upper: "锄禾", lower: "当午" },
    { upper: "红豆", lower: "生南国" },
    { upper: "白毛", lower: "浮绿水" },
    { upper: "远看", lower: "山有色" },
    { upper: "离离", lower: "原上草" },
    { upper: "月落", lower: "乌啼霜" },
    { upper: "两个", lower: "黄鹂鸣" },
    { upper: "空山", lower: "新雨后" },
  ],
  maxCorners: 5, clueLevel: "radical",
  items: { hint: 0, reshuffle: 1, reveal: 2, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 20, contentMin: 5 },
};

// === 长春·双阳特色章（chapter 9 三消 / chapter 8 听音 / chapter 6 诗词，主题 shuangyang）===
// 1-18 鹿乡晨曲（三消·分数）：双阳鹿乡晨景，冰冻障碍
export const LEVEL_1_18: LevelConfig = {
  id: "1-18", mode: "match3", name: "鹿乡晨曲", chapter: 5, theme: "shuangyang",
  boardCols: 6, boardRows: 6,
  stepLimit: 20, passTarget: 2100,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "frozen", count: 4 },
  items: { hint: 1, reshuffle: 1, reveal: 1, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 7, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 15, contentMin: 4 },
};

// 1-19 奢岭莓香（三消·收集）：奢岭草莓(果) + 山花
export const LEVEL_1_19: LevelConfig = {
  id: "1-19", mode: "match3", name: "奢岭莓香", chapter: 5, theme: "shuangyang",
  boardCols: 6, boardRows: 6,
  stepLimit: 19, passTarget: 2000,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "chain", count: 4 },
  goal: { type: "collect", collect: { fruit: 14, flower: 12 } }, // 收集 14 草莓(果) + 12 山花
  items: { hint: 1, reshuffle: 1, reveal: 1, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 1 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 14, contentMin: 4 },
};

// 1-20 双阳湖光（三消·分数）：双阳湖景，黑洞障碍
export const LEVEL_1_20: LevelConfig = {
  id: "1-20", mode: "match3", name: "双阳湖光", chapter: 5, theme: "shuangyang",
  boardCols: 6, boardRows: 6,
  stepLimit: 18, passTarget: 1800,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "blackhole", count: 2 },
  items: { hint: 1, reshuffle: 1, reveal: 1, peek: 0, undo: 0, rehear: 0, step: 0, shield: 0, hammer: 1 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 13, contentMin: 4 },
};

// 1-21 春漪鹿乡（三消·果冻层）：清除全部果冻方可过关（双阳鹿乡春景）
export const LEVEL_1_21: LevelConfig = {
  id: "1-21", mode: "match3", name: "春漪鹿乡", chapter: 5, theme: "shuangyang",
  boardCols: 6, boardRows: 6,
  stepLimit: 24, passTarget: 600,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "jelly", count: 14 },
  items: { hint: 2, reshuffle: 1, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 1 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 18, contentMin: 4 },
};

// 1-22 晨光冲刺（三消·限时冲分）：60 秒内分数达标即过关（双阳鹿乡晨景）
export const LEVEL_1_22: LevelConfig = {
  id: "1-22", mode: "match3", name: "晨光冲刺", chapter: 5, theme: "shuangyang",
  boardCols: 6, boardRows: 6,
  stepLimit: 999,  // 限时关不使用步数
  passTarget: 1500,
  timeLimit: 60,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  items: { hint: 2, reshuffle: 1, reveal: 1, peek: 0, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 1 },
  itemDropInterval: 6, itemDropChance: 0.35,
  idleHintDelay: 4,
  adaptive: { stepDelta: 3, contentDelta: 1, stepMin: 18, contentMin: 4 },
};

// 2-14 双阳听风（听音辨位·序列）：本地拟声（鹿鸣/梅花鹿/湖波/温泉/林涛/黄鹂）
export const LEVEL_2_14: LevelConfig = {
  id: "2-14", mode: "audio", name: "双阳听风", chapter: 4, theme: "shuangyang",
  boardCols: 4, boardRows: 4,
  stepLimit: 16, passTarget: 10,
  iconTypes: ["deer", "sika", "lakelap", "hotspring", "forestwind", "oriole", "rain", "stream"],
  audioPool: 8,
  audioParadigm: "sequence",
  sequenceLength: 6, sequenceMax: 8, sequenceGap: 0.4,
  questionCount: 12,
  audioDuration: 1.5, matchPairs: 4,
  hasInterference: true, visualClueDelay: 4,
  obstacles: { type: "interference", count: 1 },
  visualFallback: true,
  items: { hint: 0, reshuffle: 0, reveal: 0, peek: 0, undo: 0, rehear: 3, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.30,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 12, contentMin: 3 },
};

// 3-13 鹿乡寻幽（诗词·双阳物产）
export const LEVEL_3_13: LevelConfig = {
  id: "3-13", mode: "poetry", name: "鹿乡寻幽", chapter: 4, theme: "shuangyang",
  boardCols: 5, boardRows: 5,
  stepLimit: 20, passTarget: 8,
  poetryPairs: [
    { upper: "鹿乡", lower: "梅鹿鸣" },
    { upper: "奢岭", lower: "草莓红" },
    { upper: "双阳", lower: "湖如镜" },
    { upper: "吊水", lower: "壶瀑飞" },
    { upper: "御龙", lower: "温泉暖" },
    { upper: "石门", lower: "山色青" },
    { upper: "松江", lower: "月影寒" },
    { upper: "鹿角", lower: "春风轻" },
  ],
  maxCorners: 3, clueLevel: "radical",
  items: { hint: 0, reshuffle: 0, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 16, contentMin: 5 },
};

// 3-14 双阳八景（诗词·双阳胜景）
export const LEVEL_3_14: LevelConfig = {
  id: "3-14", mode: "poetry", name: "双阳八景", chapter: 4, theme: "shuangyang",
  boardCols: 5, boardRows: 5,
  stepLimit: 22, passTarget: 8,
  poetryPairs: [
    { upper: "鹿苑", lower: "千头鹿" },
    { upper: "莓园", lower: "十里红" },
    { upper: "湖光", lower: "潋滟秋" },
    { upper: "壶口", lower: "落珠帘" },
    { upper: "温泉", lower: "洗尘心" },
    { upper: "石岭", lower: "松风啸" },
    { upper: "稻浪", lower: "千重绿" },
    { upper: "霜天", lower: "雁南飞" },
  ],
  maxCorners: 3, clueLevel: "radical",
  items: { hint: 0, reshuffle: 0, reveal: 1, peek: 1, undo: 1, rehear: 0, step: 0, shield: 0, hammer: 0 },
  itemDropInterval: 6, itemDropChance: 0.25,
  idleHintDelay: 5,
  adaptive: { stepDelta: 2, contentDelta: 1, stepMin: 17, contentMin: 5 },
};

// === 怀旧金曲（nostalgia）=== 9 关 / 3 章
// 玩法：看歌词选歌名 / 看歌名选歌词（纯文本大字号，怀旧疗法 + 语义/联想/情景记忆）
// questionCount=题数；passTarget=需答对题数；stepLimit=允许答错次数；
// nostalgiaOptionCount=每题选项数；nostalgiaVariants=启用题型
const NOS_ITEMS: ItemConfig = { hint: 2, reshuffle: 0, reveal: 1, peek: 2, undo: 0, rehear: 0, step: 0, shield: 1, hammer: 0 };

function makeNostalgia(
  id: string, name: string, chapter: number, theme: ThemeId, q: number, pass: number, stepLimit: number,
  opt: number, variants: ("lyricToTitle" | "titleToLyric")[], tutorial = false,
): LevelConfig {
  return {
    id, mode: "nostalgia", name,
    boardCols: 1, boardRows: 1,
    stepLimit, passTarget: pass,
    items: { ...NOS_ITEMS },
    itemDropInterval: 999, itemDropChance: 0,
    idleHintDelay: 12,
    adaptive: { stepDelta: 2, contentDelta: 1, stepMin: stepLimit, contentMin: 3 },
    chapter, theme,
    nostalgiaOptionCount: opt, nostalgiaVariants: variants,
    tutorial,
    questionCount: q,
  };
}

const NOSTALGIA_LEVELS: LevelConfig[] = [
  makeNostalgia("11-1", "怀旧金曲 · 春之章", 1, "spring", 8, 6, 4, 3, ["lyricToTitle"], true),
  makeNostalgia("11-2", "怀旧金曲 · 春之章", 1, "spring", 8, 6, 4, 3, ["lyricToTitle"]),
  makeNostalgia("11-3", "怀旧金曲 · 春之章", 1, "spring", 9, 7, 4, 3, ["lyricToTitle"]),
  makeNostalgia("11-4", "怀旧金曲 · 夏之章", 2, "summer", 9, 7, 3, 4, ["lyricToTitle", "titleToLyric"]),
  makeNostalgia("11-5", "怀旧金曲 · 夏之章", 2, "summer", 10, 8, 3, 4, ["lyricToTitle", "titleToLyric"]),
  makeNostalgia("11-6", "怀旧金曲 · 夏之章", 2, "summer", 10, 8, 3, 4, ["lyricToTitle", "titleToLyric"]),
  makeNostalgia("11-7", "怀旧金曲 · 秋之章", 3, "autumn", 11, 9, 3, 4, ["lyricToTitle", "titleToLyric"]),
  makeNostalgia("11-8", "怀旧金曲 · 秋之章", 3, "autumn", 12, 10, 2, 4, ["lyricToTitle", "titleToLyric"]),
  makeNostalgia("11-9", "怀旧金曲 · 秋之章", 3, "autumn", 12, 10, 2, 4, ["lyricToTitle", "titleToLyric"]),
];

export const ALL_LEVELS: LevelConfig[] = [
  LEVEL_1_1, LEVEL_1_2, LEVEL_1_3, LEVEL_1_4, LEVEL_1_5, LEVEL_1_6, LEVEL_1_7, LEVEL_1_8,
  LEVEL_1_9, LEVEL_1_10, LEVEL_1_11, LEVEL_1_12,
  LEVEL_1_13, LEVEL_1_14, LEVEL_1_15, LEVEL_1_16, LEVEL_1_17,
  LEVEL_1_18, LEVEL_1_19, LEVEL_1_20, LEVEL_1_21, LEVEL_1_22,
  LEVEL_2_1, LEVEL_2_2, LEVEL_2_3, LEVEL_2_4, LEVEL_2_5, LEVEL_2_6, LEVEL_2_7, LEVEL_2_8,
  LEVEL_2_9, LEVEL_2_10, LEVEL_2_11, LEVEL_2_12, LEVEL_2_13,
  LEVEL_2_14,
  LEVEL_3_1, LEVEL_3_2, LEVEL_3_3, LEVEL_3_4, LEVEL_3_5, LEVEL_3_6, LEVEL_3_7, LEVEL_3_8,
  LEVEL_3_9, LEVEL_3_10, LEVEL_3_11, LEVEL_3_12,
  LEVEL_3_13, LEVEL_3_14,
  ...GEN_MATCH3,   // 1-23 .. 1-32（含果冻 / 限时特殊关）
  ...GEN_AUDIO,    // 2-15 .. 2-24
  ...GEN_POETRY,   // 3-15 .. 3-24
  ...GEN_CORSI,    // 4-1 .. 4-9（空间记忆 / 科西积木）
  ...GEN_FACE,     // 5-1 .. 5-9（面孔-名字联想）
  ...GEN_MEMORY,   // 6-1 .. 6-9（记忆翻翻乐）
  ...GEN_STROOP,   // 7-1 .. 7-9（色词干扰 / Stroop）
  ...GEN_MONEY,    // 8-1 .. 8-9（日常钱币计算）
  ...GEN_PM,       // 9-1 .. 9-9（前瞻记忆）
  ...GEN_CLOCK,    // 10-1 .. 10-9（时间/钟表定向）
  ...NOSTALGIA_LEVELS, // 11-1 .. 11-9（怀旧金曲 / 歌词-歌名联想回忆）
];

export function getLevel(id: LevelId): LevelConfig | undefined {
  return ALL_LEVELS.find(l => l.id === id);
}

export function getLevelsByMode(mode: ModeId): LevelConfig[] {
  return ALL_LEVELS.filter(l => l.mode === mode);
}

// === 自适应难度：按顺序取用的图标池（前 N 个 = 使用 N 种） ===

export const ICON_POOL: Record<ModeId, string[]> = {
  match3: ["flower", "leaf", "fruit", "butterfly", "bird"],
  audio: ["sparrow", "rain", "doorbell", "dog", "bell", "carhorn", "laugh", "whistle"],
  poetry: [],
  corsi: [],
  face: [],
  memory: [],
  stroop: [],
  money: [],
  pm: [],
  clock: [],
  nostalgia: [],
};

/**
 * 基于基础关卡生成「已应用自适应调整」的关卡副本。
 *
 * 注意：ALL_LEVELS 里的配置对象是全局共享的，绝不可就地修改，
 * 因此这里始终返回新对象（含 items 浅拷贝）。
 */
export function cloneAdjustedLevel(
  base: LevelConfig,
  stepAdjust: number,
  contentAdjust: number,
): LevelConfig {
  const lv: LevelConfig = { ...base, items: { ...base.items } };
  // corsi / face / memory 的 stepLimit 语义分别是「总轮次」「面孔数」「翻牌次数」，
  // 都不该套用三消「至少 5 步」的下限（face 可低至 3），否则会把关卡配置悄悄改写。
  const minSteps =
    base.mode === "corsi" || base.mode === "face" || base.mode === "memory"
    || base.mode === "stroop" || base.mode === "money" || base.mode === "pm" || base.mode === "clock"
    || base.mode === "nostalgia"
      ? 1
      : 5;
  lv.stepLimit = Math.max(minSteps, base.stepLimit + stepAdjust);

  if (contentAdjust !== 0) {
    if (base.mode === "match3") {
      const pool = ICON_POOL.match3;
      const current = base.iconTypes?.length ?? 3;
      const target = Math.max(2, Math.min(pool.length, current + contentAdjust));
      lv.iconTypes = pool.slice(0, target);
    } else if (base.mode === "audio" && (base.audioParadigm ?? "choice") === "choice") {
      const target = Math.max(2, Math.min(4, (base.choiceCount ?? 3) + contentAdjust));
      lv.choiceCount = target;
    }
  }

  return lv;
}
