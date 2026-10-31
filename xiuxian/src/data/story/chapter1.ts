/**
 * 第一章「落霞镇」剧情：对话树 + 任务链。
 * 效果由 Game 宿主解释执行（giveItem/learnSkill/giveExp/startQuest/completeQuest/spawnBoss/win）。
 */
import { getCast } from "../cast";

export type StoryEffect =
  | { t: "giveItem"; id: string; n: number }
  | { t: "learnSkill"; id: string }
  | { t: "giveExp"; n: number }
  | { t: "startQuest"; id: string }
  | { t: "completeQuest"; id: string }
  | { t: "heal"; n: number }
  | { t: "giveStones"; n: number }
  | { t: "giveRep"; n: number }
  | { t: "joinSect"; id: string }
  | { t: "giveArtifact"; id: string }
  | { t: "spawnBoss" }
  | { t: "win"; chapter?: number }
  | { t: "openShop" }
  | { t: "rogueBlessing" }
  | { t: "rogueRelic" }
  | { t: "rogueMystery" }
  | { t: "setFlag"; id: string; v?: boolean };

/** 选项显示条件（P3-7 选择分支）：满足才显示该选项 */
export interface StoryCond {
  /** 该 flag 为真时显示 */
  flag?: string;
  /** 该 flag 为假/未设时显示 */
  notFlag?: string;
  /** 该任务进行中时显示 */
  questActive?: string;
  /** 该任务已完成时显示 */
  questDone?: string;
  /** 玩家等级≥时显示 */
  levelMin?: number;
}

export interface StoryChoice {
  text: string;
  to: string;
  effects?: StoryEffect[];
  /** 显示条件（不满足则不显示） */
  cond?: StoryCond;
}

export interface StoryNode {
  id: string;
  /** 说话者（缺省为旁白） */
  speaker?: string;
  /** 头像占位色 */
  color?: string;
  text: string;
  next?: string;
  choices?: StoryChoice[];
  /** 进入节点即触发 */
  effects?: StoryEffect[];
  /** 说话者立绘（对话框头像；取自 data/cast.ts） */
  img?: string;
}

export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  /** 击杀目标怪物 id 与数量 */
  kill: string;
  killName: string;
  n: number;
  rewards: StoryEffect[];
}

export const QUESTS: Record<string, QuestDef> = {
  q_wolves: {
    id: "q_wolves", name: "初战妖兽",
    desc: "妖兽林的碧睛妖狼日渐猖狂，替村长猎杀 5 只。",
    kill: "bi-jing-lang", killName: "碧睛妖狼", n: 5,
    rewards: [
      { t: "giveItem", id: "qingfeng-jian", n: 1 },
      { t: "giveItem", id: "huixin-jia", n: 1 },
      { t: "giveExp", n: 300 },
      { t: "giveStones", n: 80 },
    ],
  },
  q_boss: {
    id: "q_boss", name: "妖狼王之患",
    desc: "狼王盘踞后山高地，已成一方大患。为民除害，就在今日。",
    kill: "yao-lang-wang", killName: "妖狼王", n: 1,
    rewards: [{ t: "giveExp", n: 400 }, { t: "giveStones", n: 150 }],
  },
  q_lostjade: {
    id: "q_lostjade", name: "遗失的玉佩",
    desc: "云游客苏砚遗失一枚家传玉佩于妖兽林，寻回交还于他。",
    kill: "bi-jing-lang", killName: "碧睛妖狼", n: 3,
    rewards: [
      { t: "giveItem", id: "ling-cao", n: 5 },
      { t: "giveStones", n: 80 },
      { t: "giveExp", n: 150 },
    ],
  },
  q_xuanji_herb: {
    id: "q_xuanji_herb", name: "玄机子的请托",
    desc: "玄机子欲炼一炉温养丹，独缺三枚碧睛妖狼内丹。替他猎杀三头，以全这段善缘——或另有抉择。",
    kill: "bi-jing-lang", killName: "碧睛妖狼", n: 3,
    rewards: [
      { t: "giveItem", id: "ling-cao", n: 3 },
      { t: "giveStones", n: 150 },
      { t: "giveExp", n: 250 },
    ],
  },
};

export const STORY: Record<string, StoryNode> = {
  // —— 功能区对话：任务发布 / 交付 / 酒馆 / 客店 / 山门 ——
  board_root: {
    id: "board_root", speaker: "镇务告示牌", color: "#d8c25a",
    text: "【镇务告示】妖兽林碧睛妖狼为患，猎杀五头者赴交付官处领赏；又，云游客苏砚悬赏寻回家传玉佩。",
    choices: [
      { text: "接取「初战妖兽」", to: "board_end", effects: [{ t: "startQuest", id: "q_wolves" }] },
      { text: "接取「遗失的玉佩」", to: "board_end", effects: [{ t: "startQuest", id: "q_lostjade" }] },
      { text: "稍后再看", to: "board_end" },
    ],
  },
  board_end: { id: "board_end", text: "（你暗自记下告示内容。）" },
  deliver_root: {
    id: "deliver_root", speaker: "任务交付官·李巡检", color: "#5a8fc9",
    text: "修行之人，当言出必行。所持任务，可于此交付。",
    choices: [
      { text: "交付「初战妖兽」", to: "deliver_end", effects: [{ t: "completeQuest", id: "q_wolves" }], cond: { questActive: "q_wolves" } },
      { text: "交付「遗失的玉佩」", to: "deliver_end", effects: [{ t: "completeQuest", id: "q_lostjade" }], cond: { questActive: "q_lostjade" } },
      { text: "暂无要事", to: "deliver_end" },
    ],
  },
  deliver_end: { id: "deliver_end", text: "（交付官颔首，取出赏赐。）" },
  jiuguan_root: {
    id: "jiuguan_root", speaker: "酒馆掌柜·赵大", color: "#c9883a",
    text: "客官里边请！听说了吗？北边山门外的乱星海，近来星辉异常，似有上古之物浮现……",
    choices: [
      { text: "打听乱星海", to: "jiuguan_tip" },
      { text: "告辞", to: "jiuguan_end" },
    ],
  },
  jiuguan_tip: {
    id: "jiuguan_tip", speaker: "酒馆掌柜·赵大", color: "#c9883a",
    text: "星渔村的渔娘最晓得海眼门道，到了那儿不妨寻她问路。",
    choices: [{ text: "多谢", to: "jiuguan_end" }],
  },
  jiuguan_end: { id: "jiuguan_end", text: "（酒馆人声鼎沸，你抿了口茶。）" },
  kedian_root: {
    id: "kedian_root", speaker: "客店掌柜·钱二娘", color: "#b06a8a",
    text: "赶路辛苦了？在妾身这儿歇歇脚，保你精气神儿都回来。",
    choices: [
      { text: "歇脚回血", to: "kedian_end", effects: [{ t: "heal", n: 99999 }] },
      { text: "不必了", to: "kedian_end" },
    ],
  },
  kedian_end: { id: "kedian_end", text: "（你在客店歇了一程，神清气爽。）" },
  gate_root: {
    id: "gate_root", speaker: "山门守卫·周嵘", color: "#9a7b4a",
    text: "此乃落霞镇山门。过桥向北便是乱星海——踏上传送阵，灵光一闪即抵彼岸。",
    choices: [{ text: "知晓了", to: "gate_end" }],
  },
  gate_end: { id: "gate_end", text: "（守卫抱拳还礼。）" },
  rogue_shop: {
    id: "rogue_shop", speaker: "游方商人", color: "#d6a13a",
    text: "道友也是来秘境探宝的？我这有些存货，看看可合眼缘？",
    choices: [
      { text: "看看货物", to: "rogue_shop_end", effects: [{ t: "openShop" }] },
      { text: "告辞", to: "rogue_shop_end" },
    ],
  },
  rogue_shop_end: { id: "rogue_shop_end", text: "（商人收起摊子，目送你离去。）", next: "rogue_event_done" },
  rogue_altar: {
    id: "rogue_altar", speaker: "古老祭坛", color: "#9b6dd6",
    text: "祭坛低鸣，似在回应你的道心。可在福泽与遗珍间择一。",
    choices: [
      { text: "祈求祝福（随机增益）", to: "rogue_event_done", effects: [{ t: "rogueBlessing" }] },
      { text: "求取遗物（整局增益）", to: "rogue_event_done", effects: [{ t: "rogueRelic" }] },
    ],
  },
  rogue_question: {
    id: "rogue_question", speaker: "？？？", color: "#c0392b",
    text: "前方光影流转，似有造化，亦藏凶险。",
    choices: [
      { text: "上前探查", to: "rogue_event_done", effects: [{ t: "rogueMystery" }] },
      { text: "绕道而行", to: "rogue_event_done" },
    ],
  },
  rogue_event_done: { id: "rogue_event_done", text: "（你继续向秘境深处走去。）" },
  intro_1: {
    id: "intro_1",
    text: "你本凡俗书生，赴京赶考途经落霞镇，借宿村中。",
    next: "intro_2",
  },
  intro_2: {
    id: "intro_2",
    text: "是夜，后山兽吼震地，村民一夜无眠。你握紧手中削竹为剑，暗下决心。",
    next: "intro_3",
  },
  intro_3: {
    id: "intro_3",
    text: "天明，你决定去找村长问明缘由——顺便，求一个仙缘。",
  },
  cunzhang_root: {
    id: "cunzhang_root", speaker: "村长", color: "#c9a227",
    text: "少侠来得正好！后山妖兽林妖狼成群，已有三位猎户折在里面，乡亲们都不敢上山了。",
    choices: [
      { text: "「老先生，我观我灵根如何？」", to: "cunzhang_test" },
      { text: "「我揭发了私炼禁丹的邪修——村长可听说了？」", to: "cunzhang_xuanji_report", cond: { flag: "xuanji_reported" } },
      { text: "「我助了那位玄机子道长一臂之力。」", to: "cunzhang_xuanji_help", cond: { flag: "qdone_q_xuanji_herb" } },
      { text: "「容我准备一二。」", to: "" },
    ],
  },
  cunzhang_xuanji_report: {
    id: "cunzhang_xuanji_report", speaker: "村长", color: "#c9a227",
    text: "「确有此事！那游方道人私炼禁丹，险些酿成大祸。镇上感念少侠义举，老朽代乡亲谢过。」他郑重一揖，塞来几枚灵石。",
    effects: [{ t: "giveStones", n: 30 }],
    choices: [{ text: "「分内之事。」", to: "" }],
  },
  cunzhang_xuanji_help: {
    id: "cunzhang_xuanji_help", speaker: "村长", color: "#c9a227",
    text: "「那位道长？呵，倒是个妙人。听闻你助他炼丹，善缘结得漂亮。修仙之路，便在这一来一往的人情里。」",
    choices: [{ text: "「受教了。」", to: "" }],
  },
  cunzhang_test: {
    id: "cunzhang_test", speaker: "村长", color: "#c9a227",
    text: "把手伸来……嗯，五行灵根俱全，虽杂却韧。痴长几岁，曾随仙人扫过几年山门，今日便结个善缘。",
    effects: [
      { t: "learnSkill", id: "jianmang" },
      { t: "giveArtifact", id: "qinglian-tai" },
      { t: "giveItem", id: "huixue-dan", n: 3 },
      { t: "giveItem", id: "wood", n: 10 },
      { t: "giveItem", id: "stone", n: 6 },
      { t: "giveStones", n: 50 },
      { t: "giveExp", n: 30 },
      { t: "startQuest", id: "q_wolves" },
    ],
    choices: [
      { text: "「请教修行之法」", to: "cunzhang_guide" },
      { text: "「妖兽何在？我领命而去。」", to: "" },
    ],
  },
  cunzhang_guide: {
    id: "cunzhang_guide", speaker: "村长", color: "#c9a227",
    text: "传功长老在村东头，可教你立身之术。妖兽在东南「妖兽林」，碧睛妖狼最是缠人。村口货郎能买卖物什，铁匠可替你炼器——需用妖丹与灵石。",
    choices: [{ text: "「知道了。」", to: "" }],
  },
  cunzhang_progress: {
    id: "cunzhang_progress", speaker: "村长", color: "#c9a227",
    text: "妖兽林的碧睛妖狼猎得如何了？猎足五只，回来见我。",
    choices: [{ text: "「还在办。」", to: "" }],
  },
  cunzhang_report: {
    id: "cunzhang_report", speaker: "村长", color: "#c9a227",
    text: "好！好一个少年英雄！祖上传下的青锋剑与护心甲，我已替你备下——只是那狼王「赤睛」，仍在后山高地称王。",
    effects: [{ t: "startQuest", id: "q_boss" }],
    choices: [{ text: "「狼王？我去会一会。」", to: "cunzhang_boss" }],
  },
  cunzhang_boss: {
    id: "cunzhang_boss", speaker: "村长", color: "#c9a227",
    text: "狼群虽退，狼王「赤睛」仍在后山高地称王。此患不除，落霞镇终无宁日。",
    choices: [
      { text: "「我去会一会这畜生。」", to: "", effects: [{ t: "spawnBoss" }] },
      { text: "「还需再做准备。」", to: "" },
    ],
  },
  elder_root: {
    id: "elder_root", speaker: "传功长老", color: "#7b9e89",
    text: "根骨尚可，只是浮躁。修仙一道，一曰剑，一曰法，你选哪条路？",
    choices: [
      {
        text: "「我习剑，一剑破万法。」",
        to: "elder_sword",
        effects: [
          { t: "learnSkill", id: "jianmang" },
          { t: "learnSkill", id: "yujian" },
          { t: "learnSkill", id: "jianqi" },
          { t: "learnSkill", id: "wanjian" },
          { t: "giveExp", n: 50 },
        ],
      },
      {
        text: "「我修法，万法自然。」",
        to: "elder_law",
        effects: [
          { t: "learnSkill", id: "huoqiu" },
          { t: "learnSkill", id: "lieyan" },
          { t: "learnSkill", id: "xuanbing" },
          { t: "learnSkill", id: "wulei" },
          { t: "learnSkill", id: "leiting" },
          { t: "giveExp", n: 50 },
        ],
      },
    ],
  },
  elder_sword: {
    id: "elder_sword", speaker: "传功长老", color: "#7b9e89",
    text: "剑者，心也。心不定，剑则慢。去吧，后山狼群，正是磨剑之石。",
    choices: [{ text: "「谨遵教诲。」", to: "" }],
  },
  elder_law: {
    id: "elder_law", speaker: "传功长老", color: "#7b9e89",
    text: "法者，律也。意动法随，切忌贪多。五行雷火，够你用很久了。",
    choices: [{ text: "「谨遵教诲。」", to: "" }],
  },
  win_1: {
    id: "win_1",
    text: "狼王轰然倒地，妖兽林重归寂静。你以竹剑起手，终以青锋证道。",
    next: "win_2",
  },
  win_2: {
    id: "win_2",
    text: "落霞镇万人空巷，村长率众亲迎。这一战之后，修仙界将记住你的名字。",
    next: "win_3",
  },
  win_3: {
    id: "win_3",
    text: "前路还长——乱星海、坠魔谷、虚天鼎的传说，都在远方等你。（第一章 · 完）",
    effects: [{ t: "win" }],
  },

  // ——《凡人修仙传》主要角色对话 ——
  nangongwan_root: {
    id: "nangongwan_root", speaker: "南宫婉", color: "#8fb8c9",
    img: getCast("nangongwan")?.img,
    text: "（白衣少女立在一株老枫下，袖口银线随晚风轻晃，肩头的小白鹤歪着头打量你。）这位道友面生的很，可是初入仙途？",
    choices: [
      { text: "正是，还请仙子指点", to: "nangongwan_tip" },
      { text: "只是路过看看", to: "nangongwan_bye" },
    ],
  },
  nangongwan_tip: {
    id: "nangongwan_tip", speaker: "南宫婉", color: "#8fb8c9",
    img: getCast("nangongwan")?.img,
    text: "修仙一途急不得。先把根基扎稳，灵石丹药都不必强求——活着，才谈得上长生。这两枚回血丹你收着。",
    effects: [{ t: "giveItem", id: "huixue-dan", n: 2 }, { t: "giveExp", n: 40 }],
  },
  nangongwan_bye: {
    id: "nangongwan_bye", speaker: "南宫婉", color: "#8fb8c9",
    img: getCast("nangongwan")?.img,
    text: "（她微微颔首，白鹤振翅绕你一圈，又落回肩头。）既如此，前路珍重——若有一日走到乱星海，我们再会。",
  },
  lifeiyu_root: {
    id: "lifeiyu_root", speaker: "厉飞雨", color: "#5f7a52",
    img: getCast("lifeiyu")?.img,
    text: "哈哈，新来的？我叫厉飞雨，使剑的。镇外妖兽这两日闹得凶，跟我去后山走一趟？",
    choices: [
      { text: "正有此意", to: "lifeiyu_join" },
      { text: "改日再说", to: "lifeiyu_later" },
    ],
  },
  lifeiyu_join: {
    id: "lifeiyu_join", speaker: "厉飞雨", color: "#5f7a52",
    img: getCast("lifeiyu")?.img,
    text: "爽快！接着——路上用得上。剑要快，心要稳，剩下的交给运气。",
    effects: [{ t: "giveItem", id: "huixue-dan", n: 2 }, { t: "giveExp", n: 60 }],
  },
  lifeiyu_later: {
    id: "lifeiyu_later", speaker: "厉飞雨", color: "#5f7a52",
    img: getCast("lifeiyu")?.img,
    text: "无妨无妨。我在这镇上还待些时日，想通了随时来找我——喝酒也算。",
  },
  yinyue_root: {
    id: "yinyue_root", speaker: "银月", color: "#9aa8c4",
    img: getCast("yinyue")?.img,
    text: "（银发少女蹲在溪边逗一只圆滚滚的银白小狼，听见脚步声回头，狼耳轻轻一抖。）你身上……有月亮的味道。",
    choices: [
      { text: "你也是？", to: "yinyue_moon" },
      { text: "……？", to: "yinyue_shy" },
    ],
  },
  yinyue_moon: {
    id: "yinyue_moon", speaker: "银月", color: "#9aa8c4",
    img: getCast("yinyue")?.img,
    text: "嗯。我本是一缕月华，被人炼进了器里——后来就变成了这样。灵草给你，伤口我也能替你舔舔。",
    effects: [{ t: "giveItem", id: "ling-cao", n: 3 }, { t: "heal", n: 40 }],
  },
  yinyue_shy: {
    id: "yinyue_shy", speaker: "银月", color: "#9aa8c4",
    img: getCast("yinyue")?.img,
    text: "（她把脸埋进小狼的绒毛里，只露出一双银灰色的眼睛。）……当我没说。但你若受伤了，记得来找我。",
  },
};

export const CHAPTER1_START = "intro_1";

export interface NpcDef {
  id: string;
  name: string;
  color: string;
  gx: number;
  gy: number;
  /** 默认对话根节点（功能型 NPC 可缺省） */
  dialogue?: string;
  /** 功能型 NPC：交谈直接打开对应面板 */
  service?: "shop" | "forge" | "sect";
  /** 立绘资源路径（取自 data/cast.ts；缺省回退程序化绘制） */
  img?: string;
  /** 透明底抠图（替换地图小人；取自 data/cast.ts 的 cut 字段） */
  cut?: string;
  /** 头顶是否有小角（程序化骨架用，立绘模式忽略） */
  horn?: boolean;
}

export const NPCS: NpcDef[] = [
  { id: "cunzhang", name: "村长", color: "#c9a227", gx: 12, gy: 11, dialogue: "cunzhang_root" },
  { id: "elder", name: "传功长老", color: "#7b9e89", gx: 12, gy: 13, dialogue: "elder_root" },
  { id: "huolang", name: "货郎·周三郎", color: "#b07a3a", gx: 10, gy: 8, service: "shop" },
  { id: "tiejiang", name: "铁匠·石敢当", color: "#8a6a55", gx: 3, gy: 7, service: "forge" },
  { id: "linyou", name: "云游客·苏砚", color: "#6bd5ff", gx: 14, gy: 8, dialogue: "linyou_root" },
  { id: "xuanji", name: "游方道人·玄机子", color: "#c8a2ff", gx: 12, gy: 9, dialogue: "xuanji_root" },
  // ——《凡人修仙传》主要角色：带立绘 ——
  { id: "nangongwan", name: "南宫婉", color: "#8fb8c9", gx: 12, gy: 10, dialogue: "nangongwan_root", img: getCast("nangongwan")?.img, cut: getCast("nangongwan")?.cut },
  { id: "lifeiyu", name: "厉飞雨", color: "#5f7a52", gx: 10, gy: 11, dialogue: "lifeiyu_root", img: getCast("lifeiyu")?.img, cut: getCast("lifeiyu")?.cut },
  { id: "yinyue", name: "银月", color: "#9aa8c4", gx: 13, gy: 11, dialogue: "yinyue_root", img: getCast("yinyue")?.img, cut: getCast("yinyue")?.cut },
  // —— 功能区 NPC（酒馆/药店/客店/任务发布/交付/山门），均置于对应建筑前的可走格 ——
  { id: "jiuguan", name: "酒馆掌柜·赵大", color: "#c9883a", gx: 3, gy: 4, dialogue: "jiuguan_root" },
  { id: "yaodian", name: "药店掌柜·孙百草", color: "#3fa07a", gx: 20, gy: 7, service: "shop" },
  { id: "kedian", name: "客店掌柜·钱二娘", color: "#b06a8a", gx: 3, gy: 12, dialogue: "kedian_root" },
  { id: "board", name: "镇务告示牌", color: "#d8c25a", gx: 12, gy: 8, dialogue: "board_root" },
  { id: "deliver", name: "任务交付官·李巡检", color: "#5a8fc9", gx: 13, gy: 8, dialogue: "deliver_root" },
  { id: "gate", name: "山门守卫·周嵘", color: "#9a7b4a", gx: 2, gy: 11, dialogue: "gate_root" },
];
