/**
 * CareWords — 温情关怀话术库
 *
 * 集中管理「家属关怀」场景里对长辈/家属说的话术，统一语气：
 * 温柔、非恐吓、肯定努力、鼓励陪伴。避免各页面散落文案、风格不一。
 *
 * 用法：
 * - ENCOURAGE_WORDS：结算/休息/陪伴时随机一句暖心话。
 * - reminderToChild(days)：长辈 N 天未训练时，预填给子女的微信/短信话术。
 */

/** 暖心鼓励语（适老、肯定式、不催促） */
export const ENCOURAGE_WORDS: string[] = [
  "慢慢来，每天一点点，脑子越用越灵光。",
  "您今天已经很棒啦，记得喝口水、歇一歇。",
  "记不住没关系，咱们多练几次就熟了。",
  "陪着您一起玩，就是我最开心的事。",
  "每一个小进步，都是给往后日子存下的底气。",
  "不着急，咱们按自己的节奏来就好。",
];

/** 随机取一句鼓励语（用于语音/陪伴气泡/结算） */
export function pickEncourage(): string {
  return ENCOURAGE_WORDS[Math.floor(Math.random() * ENCOURAGE_WORDS.length)];
}

/**
 * 给子女的「未练习提醒」话术（预填，可直接复制发微信/短信）。
 * 语气温柔、不制造焦虑，点明训练价值与陪伴意义。
 */
export function reminderToChild(days: number): string {
  if (days <= 0) {
    return "爸妈今天已经来「脑力花园」动脑啦，状态在线，放心～有空也陪他们唠唠嗑，比什么都强。";
  }
  return (
    `爸妈最近 ${days} 天没来「脑力花园」动脑啦。里头的训练小游戏练的是记忆、反应和认字认物，` +
    `贵在每天十分钟。有空陪他们玩一局、说说话，就是最好的关心。`
  );
}

/**
 * 向导情绪：微笑 / 鼓励 / 惊喜 / 关切。
 * 定义在 core 层供 ui/Companion 复用，避免 core 反向依赖 ui。
 */
export type CompanionMood = "smile" | "encourage" | "surprise" | "care";

/**
 * 按情绪分类的陪伴话术。语气统一：温柔、不催促、肯定努力。
 * - smile：初见与日常陪伴
 * - encourage：过程中肯定，强调"做得很稳"
 * - surprise：成绩好时的惊喜喝彩
 * - care：休息/疲劳时的关切劝歇（不施压）
 */
export const MOOD_WORDS: Record<CompanionMood, string[]> = {
  smile: [
    "您好呀，我是小园，今天也一起慢慢来～",
    "看到您来，花园里的花儿都精神了。",
    "不着急，咱们按自己的节奏走就好。",
    "第一次玩别紧张，跟着我做就行。",
  ],
  encourage: [
    "这一步做得很稳，继续就好。",
    "您刚才的反应比上次快了呢。",
    "练得不错，我一直在这儿陪着您。",
    "慢慢来，每天一点点就很好。",
  ],
  surprise: [
    "哇，这一关完成得真漂亮！",
    "了不起，比上次进步好多呢。",
    "给您鼓个掌，这成绩真棒！",
    "您今天的状态，真是让人高兴。",
  ],
  care: [
    "玩了一会儿啦，喝口水、歇歇眼吧。",
    "累了就停一停，花园一直在这儿等您。",
    "眼睛要紧，咱们休息一下再来。",
    "不急在这一时，先活动活动肩膀。",
  ],
};

/** 按情绪随机取一句陪伴话术（未知情绪回落到鼓励语） */
export function pickMoodWord(mood: CompanionMood): string {
  const arr = MOOD_WORDS[mood] || ENCOURAGE_WORDS;
  return arr[Math.floor(Math.random() * arr.length)];
}

const GREETINGS: Record<"night" | "morning" | "noon" | "afternoon" | "evening", string[]> = {
  night: ["夜深啦，早点休息，明天再来看我。", "这么晚还来呀，练一小会儿就歇着吧。"],
  morning: ["早上好呀，脑子清醒，最适合动动脑。", "早，咱们先来一小关，慢慢醒醒神。"],
  noon: ["中午好，吃过饭歇一会儿再来练。", "午饭吃了吗？吃饱了脑子才转得快。"],
  afternoon: ["下午好，来陪您练一小会儿。", "这会儿精神正好，咱们练两关？"],
  evening: ["晚上好，今天也来动动脑啦。", "睡前练一小会儿，别太晚哦。"],
};

/** 按当前时段取一句首页问候（同样温柔、不催促） */
export function pickGreeting(): string {
  const h = new Date().getHours();
  let key: keyof typeof GREETINGS;
  if (h < 6) key = "night";
  else if (h < 11) key = "morning";
  else if (h < 13) key = "noon";
  else if (h < 18) key = "afternoon";
  else key = "evening";
  const arr = GREETINGS[key];
  return arr[Math.floor(Math.random() * arr.length)];
}
