/**
 * NPC 台词池 / 剧情文案 — spec v1.1 第 6 节
 * 含基于真实成绩的事实赞美生成器（事实赞美 + 鼓励继续提高）
 */

export const STORY_INTRO = "你是时光整理师，来到记忆花园，帮助时光爷爷修复破碎的记忆碎片。";

export const NPC_NAME = "时光爷爷";

// 入口鼓励 / 失败安慰台词池（通用，非事实型）
export const DIALOGUE_POOL = {
  entry: [
    "来，让老脑筋活动活动，慢慢来不着急。",
    "今天的花园又开花了，咱们一起整理整理。",
    "别担心记不住，跟着感觉走就好。",
  ],
  fail: [
    "没关系，咱们歇会儿再来。",
    "不急不急，慢慢就会越来越好的。",
    "今天辛苦了，明天花园还在等你。",
  ],
};

export function randomDialogue(category: "entry" | "fail"): string {
  const pool = DIALOGUE_POOL[category];
  return pool[Math.floor(Math.random() * pool.length)];
}

// === 关卡结果数据（模式场景 → 结算场景传递） ===

export interface LevelResult {
  passed: boolean;
  score: number;
  stepsUsed: number;
  paradigm?: "choice" | "sequence";
  totalQuestions?: number;
  maxSeqAchieved?: number;
  pairsTotal?: number;
  medianRT: number;
  // pm（前瞻记忆）专用：按铃命中数 / 目标出现数 / 误按次数
  pmHits?: number;
  pmTargets?: number;
  pmFalseAlarms?: number;
}

// === 事实赞美生成器输入 ===

export interface LevelMetrics {
  mode: "match3" | "audio" | "poetry" | "corsi" | "face" | "memory" | "stroop" | "money" | "pm" | "clock" | "nostalgia";
  passed: boolean;
  score: number;
  passTarget: number;
  stepsUsed: number;
  stepLimit: number;
  paradigm?: "choice" | "sequence";
  totalQuestions?: number;
  maxSeqAchieved?: number;
  pairsTotal?: number;
  medianRT?: number;
  // pm（前瞻记忆）专用
  pmHits?: number;
  pmTargets?: number;
  pmFalseAlarms?: number;
}

// === 事实赞美输出 ===

export interface PraiseResult {
  headline: string;       // 事实赞美（基于真实数据）
  encouragement: string;  // 鼓励继续提高
  highlight: string;      // 核心成绩数字摘要
}

/** 根据真实成绩生成事实赞美 + 鼓励 */
export function generatePraise(m: LevelMetrics): PraiseResult {
  if (!m.passed) {
    return generateFailPraise(m);
  }
  switch (m.mode) {
    case "match3": return generateMatch3Praise(m);
    case "audio":  return m.paradigm === "sequence"
                     ? generateAudioSeqPraise(m)
                     : generateAudioChoicePraise(m);
    case "poetry": return generatePoetryPraise(m);
    case "corsi":  return generateCorsiPraise(m);
    case "face":   return generateFacePraise(m);
    case "memory": return generateMemoryPraise(m);
    case "stroop": return generateStroopPraise(m);
    case "money":  return generateMoneyPraise(m);
    case "pm":     return generatePmPraise(m);
    case "clock":  return generateClockPraise(m);
    case "nostalgia": return generateNostalgiaPraise(m);
  }
}

// --- 怀旧金曲：答对率（想起老歌的比例） ---
function generateNostalgiaPraise(m: LevelMetrics): PraiseResult {
  const total = m.totalQuestions ?? m.passTarget;
  const acc = total > 0 ? Math.round((m.score / total) * 100) : 0;
  let headline: string;
  if (acc >= 90) headline = `想起 ${m.score}/${total} 首老歌，记性真好！`;
  else if (acc >= 75) headline = `认出 ${m.score}/${total} 首，越听越熟了。`;
  else headline = `${m.score}/${total} 首想起来，慢慢回忆也挺好。`;
  return {
    headline,
    encouragement: "老歌里都是年轻时的光景，常唱常新。",
    highlight: `答对${acc}%`,
  };
}

// --- 三消：分数超额 + 步数效率 ---
function generateMatch3Praise(m: LevelMetrics): PraiseResult {
  const overPercent = Math.round(((m.score - m.passTarget) / m.passTarget) * 100);
  const stepsLeft = m.stepLimit - m.stepsUsed;
  const stepEfficiency = Math.round((stepsLeft / m.stepLimit) * 100);

  let headline: string;
  if (overPercent >= 50) {
    headline = `分数 ${m.score}，超出目标 ${overPercent}%，超额完成！`;
  } else if (overPercent >= 20) {
    headline = `拿到 ${m.score} 分，比过关线多了 ${overPercent}%。`;
  } else {
    headline = `${m.score} 分达标，稳稳过关。`;
  }

  let encouragement: string;
  if (stepEfficiency >= 40) {
    encouragement = `只用了 ${m.stepsUsed} 步，省下 ${stepsLeft} 步，思路真清晰！下一关有冰冻格，保持这个节奏。`;
  } else if (stepEfficiency >= 20) {
    encouragement = `还剩 ${stepsLeft} 步，节奏不错。下一关多留意连击，分数会更高。`;
  } else {
    encouragement = `刚好踩线过关，下一关多找连击机会，分数会更好看。`;
  }

  return { headline, encouragement, highlight: `${m.score}分` };
}

// --- 听音选择：准确率 + 反应时 ---
function generateAudioChoicePraise(m: LevelMetrics): PraiseResult {
  const total = m.totalQuestions ?? m.passTarget;
  const correct = m.score;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  let headline: string;
  if (accuracy >= 90) {
    headline = `${correct}/${total} 题答对，准确率 ${accuracy}%，听觉真灵敏！`;
  } else if (accuracy >= 75) {
    headline = `答对了 ${correct} 题，准确率 ${accuracy}%，越听越准了。`;
  } else {
    headline = `${correct} 题答对，准确率 ${accuracy}%，刚好过关。`;
  }

  let encouragement: string;
  if (m.medianRT && m.medianRT < 2500) {
    const rtSec = (Math.round(m.medianRT / 100) / 10).toFixed(1);
    encouragement = `平均 ${rtSec} 秒就做出判断，反应很快！下一关是声音序列复述，锻炼记忆力。`;
  } else {
    encouragement = `下一关是声音序列复述，要按顺序记住声音，锻炼工作记忆。`;
  }

  return { headline, encouragement, highlight: `准确率${accuracy}%` };
}

// --- 听音序列：最长序列 + 序列数 ---
function generateAudioSeqPraise(m: LevelMetrics): PraiseResult {
  const maxSeq = m.maxSeqAchieved ?? 0;
  const correct = m.score;

  let headline: string;
  if (maxSeq >= 3) {
    headline = `成功复述 ${maxSeq} 个声音的序列，工作记忆容量真不错！`;
  } else if (maxSeq >= 2) {
    headline = `复述了 ${maxSeq} 个声音的序列，记忆力在进步。`;
  } else {
    headline = `完成了 ${correct} 个序列，继续练会更好。`;
  }

  const encouragement = maxSeq >= 3
    ? `3 个声音的序列都能记住，已经很棒了。多练几次，4 个也不在话下！`
    : `更长的序列在等你挑战，多练几次脑子会越来越灵光。`;

  return { headline, encouragement, highlight: `最长序列${maxSeq}个` };
}

// --- 诗词：配对数 + 步数效率 ---
function generatePoetryPraise(m: LevelMetrics): PraiseResult {
  const pairs = m.score;
  const total = m.pairsTotal ?? m.passTarget;
  const stepsLeft = m.stepLimit - m.stepsUsed;
  const stepEfficiency = Math.round((stepsLeft / m.stepLimit) * 100);

  let headline: string;
  if (pairs >= total) {
    headline = `全部 ${total} 对诗词都配对了，诗词功底扎实！`;
  } else {
    headline = `配对了 ${pairs}/${total} 对，过关！`;
  }

  let encouragement: string;
  if (stepEfficiency >= 40) {
    encouragement = `只用了 ${m.stepsUsed} 步，省下 ${stepsLeft} 步，联想很快！下一关用偏旁提示，看看能认出多少。`;
  } else {
    encouragement = `下一关会用偏旁提示下句，考验语义联想，准备好了吗？`;
  }

  return { headline, encouragement, highlight: `${pairs}/${total}对` };
}

// --- 空间记忆（科西积木）：正确轮数 + 最长序列 ---
function generateCorsiPraise(m: LevelMetrics): PraiseResult {
  const correct = m.score;            // 正确复现的轮数
  const total = m.stepLimit;          // 总轮次
  const seq = m.maxSeqAchieved ?? 0;  // 最长正确序列长度
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  let headline: string;
  if (correct >= total) {
    headline = `全部 ${total} 轮都记住了，空间记忆满分！`;
  } else if (accuracy >= 75) {
    headline = `记住了 ${correct}/${total} 轮，准确率 ${accuracy}%，空间感越来越好。`;
  } else {
    headline = `完成了 ${correct}/${total} 轮，多练几次脑子更灵光。`;
  }

  const encouragement = seq >= 5
    ? `最长能记住 ${seq} 格的顺序，空间工作记忆真不错！下次挑战更长的序列吧。`
    : `先从短序列练起，慢慢加长，空间记忆会越来越强。`;

  return { headline, encouragement, highlight: `正确${correct}轮` };
}

// --- 面孔-名字联想：正确回忆数 + 延迟保持 ---
function generateFacePraise(m: LevelMetrics): PraiseResult {
  const correct = m.score;                 // 正确回忆的名字数
  const total = m.totalQuestions ?? m.passTarget; // 学习过的面孔数
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  let headline: string;
  if (correct >= total) {
    headline = `全部 ${total} 位都认出来了，联想记忆满分！`;
  } else if (accuracy >= 80) {
    headline = `认出了 ${correct}/${total} 位，准确率 ${accuracy}%，记人本事见长。`;
  } else {
    headline = `记住了 ${correct}/${total} 位，多练几次更熟络。`;
  }

  const encouragement = accuracy >= 80
    ? `面孔和名字绑得越来越牢，下次延迟更长也能记住！`
    : `先从几个老邻居练起，慢慢加人，联想记忆会越来越强。`;

  return { headline, encouragement, highlight: `认对${correct}位` };
}

// --- 记忆翻翻乐：配齐对数 + 步数效率 ---
function generateMemoryPraise(m: LevelMetrics): PraiseResult {
  const pairs = m.score;                    // 已配对的对数
  const total = m.pairsTotal ?? m.passTarget; // 总对数
  const stepsLeft = m.stepLimit - m.stepsUsed;
  // 每对至少需 1 步，ideal 为理论最少步数
  const ideal = total > 0 ? total : 1;
  const efficiency = m.stepsUsed > 0 ? ideal / m.stepsUsed : 0;

  let headline: string;
  if (pairs >= total && efficiency >= 0.7) {
    headline = `全部 ${total} 对都配齐了，而且只用了 ${m.stepsUsed} 步，记性真好！`;
  } else if (pairs >= total) {
    headline = `${total} 对全部配齐，过关！`;
  } else {
    headline = `配好了 ${pairs}/${total} 对，再多练几轮更熟练。`;
  }

  let encouragement: string;
  if (efficiency >= 0.7) {
    encouragement = `几乎翻到就能配上，位置记得很牢！下一关牌停留的时间更短，继续挑战。`;
  } else {
    encouragement = `还剩 ${stepsLeft} 步可用，试着记住每张牌的位置，下次一遍就配上。`;
  }

  return { headline, encouragement, highlight: `${pairs}/${total}对` };
}

// --- 色词干扰：答对数 + 反应时 ---
function generateStroopPraise(m: LevelMetrics): PraiseResult {
  const correct = m.score;                       // 答对题数
  const total = m.totalQuestions ?? m.stepLimit; // 总题数
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const rt = m.medianRT ?? 0;                    // 中位反应时（毫秒）
  const rtSec = rt > 0 ? (Math.round(rt / 100) / 10).toFixed(1) : "";

  let headline: string;
  if (accuracy >= 90) {
    headline = `${correct}/${total} 题答对，准确率 ${accuracy}%，不容易被字带跑！`;
  } else if (accuracy >= 75) {
    headline = `答对 ${correct}/${total} 题，准确率 ${accuracy}%，越来越稳了。`;
  } else {
    headline = `答对 ${correct}/${total} 题，多练几次会更顺。`;
  }

  let encouragement: string;
  if (rt > 0 && rt <= 1600) {
    encouragement = `平均 ${rtSec} 秒就选出颜色，反应又快又准！下一关颜色更多、时间更紧哦。`;
  } else if (rt > 0) {
    encouragement = `平均 ${rtSec} 秒作答，稳扎稳打。熟悉之后可以再快一点。`;
  } else {
    encouragement = `记住只看颜色、不看字的意思，会更轻松。`;
  }

  return { headline, encouragement, highlight: `准确率${accuracy}%` };
}

// --- 日常钱币计算：答对数 + 反应时 ---
function generateMoneyPraise(m: LevelMetrics): PraiseResult {
  const correct = m.score;                       // 算对的题数
  const total = m.totalQuestions ?? m.stepLimit; // 总题数
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const rt = m.medianRT ?? 0;
  const rtSec = rt > 0 ? (Math.round(rt / 100) / 10).toFixed(1) : "";

  let headline: string;
  if (accuracy >= 90) {
    headline = `${correct}/${total} 题算对，准确率 ${accuracy}%，账算得真清楚！`;
  } else if (accuracy >= 75) {
    headline = `算对 ${correct}/${total} 题，准确率 ${accuracy}%，越来越熟练。`;
  } else {
    headline = `算对 ${correct}/${total} 题，慢慢来，多练几遍就顺了。`;
  }

  let encouragement: string;
  if (rt > 0 && rt <= 2500) {
    encouragement = `平均 ${rtSec} 秒就算出来了，买菜结账肯定不发怵！下一关金额更大、东西更多。`;
  } else {
    encouragement = `不着急，先算整元再算零头，会轻松很多。`;
  }

  return { headline, encouragement, highlight: `准确率${accuracy}%` };
}

// --- 前瞻记忆：按铃命中率 + 误报 ---
function generatePmPraise(m: LevelMetrics): PraiseResult {
  const hits = m.pmHits ?? 0;
  const targets = m.pmTargets ?? 0;
  const falseAlarms = m.pmFalseAlarms ?? 0;
  const rate = targets > 0 ? Math.round((hits / targets) * 100) : 0;

  let headline: string;
  if (targets > 0 && hits >= targets) {
    headline = `${targets} 次该按铃的时候一次没落下，记性真牢！`;
  } else if (rate >= 70) {
    headline = `该按铃 ${targets} 次，按中 ${hits} 次，记住了 ${rate}%。`;
  } else {
    headline = `该按铃 ${targets} 次，按中 ${hits} 次，慢慢来会更稳。`;
  }

  let encouragement: string;
  if (falseAlarms === 0) {
    encouragement = `一次都没乱按铃，分得清真假，很棒！下一关提醒会更少，要靠自己记住。`;
  } else {
    encouragement = `有 ${falseAlarms} 次看错了按早了——只有看到鲜鱼才按铃，别的照常分类就好。`;
  }

  return { headline, encouragement, highlight: `按中${hits}次` };
}

// --- 时间/钟表定向：答对数 + 反应时 ---
function generateClockPraise(m: LevelMetrics): PraiseResult {
  const correct = m.score;                       // 答对题数
  const total = m.totalQuestions ?? m.stepLimit; // 总题数
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const rt = m.medianRT ?? 0;
  const rtSec = rt > 0 ? (Math.round(rt / 100) / 10).toFixed(1) : "";

  let headline: string;
  if (accuracy >= 90) {
    headline = `${correct}/${total} 题答对，准确率 ${accuracy}%，钟表看得真准！`;
  } else if (accuracy >= 75) {
    headline = `答对 ${correct}/${total} 题，准确率 ${accuracy}%，越来越有准头。`;
  } else {
    headline = `答对 ${correct}/${total} 题，先看短针再看长针，会更容易。`;
  }

  const encouragement = rt > 0 && rt <= 2500
    ? `平均 ${rtSec} 秒就认出来了，看时间一点不发怵！下一关钟面更难，继续。`
    : `记住诀窍：短针看几点，长针看几分，慢慢来就好。`;

  return { headline, encouragement, highlight: `准确率${accuracy}%` };
}

// --- 失败：差距 + 鼓励 ---
function generateFailPraise(m: LevelMetrics): PraiseResult {
  const gap = m.passTarget - m.score;
  const closeThreshold = Math.max(1, Math.ceil(m.passTarget * 0.2));

  let headline: string;
  let encouragement: string;

  if (gap <= closeThreshold) {
    headline = `就差一点，${m.score}/${m.passTarget}，已经很接近了！`;
    encouragement = `差这么一点，再来一次准能过。脑子越用越灵光。`;
  } else {
    headline = `这次拿到 ${m.score}，目标 ${m.passTarget}。`;
    encouragement = `不着急，多练几次就会越来越好的。今天辛苦了。`;
  }

  return { headline, encouragement, highlight: `${m.score}/${m.passTarget}` };
}
