/**
 * P3-7 叙事：支线任务 + 选择分支示范。
 * 复用全局 STORY 对话树（Game 启动时并入，与 CH2/SOCIAL/ENCOUNTER 同机制）。
 * 演示能力：① 选项按 flag/任务状态条件显示（StoryChoice.cond）；
 * ② 选择经 setFlag 记录，驱动后续对话分支；
 * ③ 任务可经对话交付（completeQuest）或猎杀完成（addKill），统一置 flags["qdone_<id>"] 供分支判定。
 */
import type { StoryNode } from "./story/chapter1";

export const SIDE_STORY: Record<string, StoryNode> = {
  linyou_root: {
    id: "linyou_root", speaker: "云游客·苏砚", color: "#6bd5ff",
    text: "「道友请留步。在下苏砚，一介云游散修。」他摊开空空如也的掌心，「途中遭妖兽冲散，家传玉佩遗落林间。若道友得闲，可否替我寻回？」",
    choices: [
      { text: "「玉佩我已寻得，物归原主。」", to: "linyou_deliver", cond: { questActive: "q_lostjade" } },
      { text: "「道友近来可好？」", to: "linyou_chat", cond: { flag: "qdone_q_lostjade" } },
      { text: "「小事一桩，我替你寻来。」", to: "linyou_accept", cond: { notFlag: "linyou_engaged" } },
      { text: "「需何报酬？」", to: "linyou_pay", cond: { notFlag: "linyou_engaged" } },
      { text: "「恕难从命。」", to: "linyou_refuse", cond: { notFlag: "linyou_engaged" } },
    ],
  },
  linyou_pay: {
    id: "linyou_pay", speaker: "云游客·苏砚", color: "#6bd5ff",
    text: "「玉佩于我另有深意，非金银可偿。若蒙相助，他日必有缘法相报。」他笑意温润，不似虚言。",
    choices: [
      { text: "「既如此，我便应下了。」", to: "linyou_accept" },
      { text: "「还是算了。」", to: "linyou_refuse" },
    ],
  },
  linyou_accept: {
    id: "linyou_accept", speaker: "云游客·苏砚", color: "#6bd5ff",
    text: "「多谢道友！玉佩通体碧色，落于妖兽林一带。寻得之后，凭此谈心即可交还。」",
    effects: [{ t: "setFlag", id: "linyou_active" }, { t: "setFlag", id: "linyou_engaged" }, { t: "startQuest", id: "q_lostjade" }],
    choices: [{ text: "「包在我身上。」", to: "" }],
  },
  linyou_refuse: {
    id: "linyou_refuse", speaker: "云游客·苏砚", color: "#6bd5ff",
    text: "「无妨无妨，缘法未到罢了。」他拂袖一笑，转身没入人流。",
    effects: [{ t: "setFlag", id: "linyou_refused" }],
    choices: [{ text: "「告辞。」", to: "" }],
  },
  linyou_deliver: {
    id: "linyou_deliver", speaker: "云游客·苏砚", color: "#6bd5ff",
    text: "「这碧色玉佩……正是我家传之物！」他双手接过，眸中微光潋滟，「道友信义，苏砚铭记于心。」",
    effects: [{ t: "completeQuest", id: "q_lostjade" }],
    choices: [{ text: "「举手之劳。」", to: "" }],
  },
  linyou_chat: {
    id: "linyou_chat", speaker: "云游客·苏砚", color: "#6bd5ff",
    text: "「修行一道，不在夺天地之造化，而在守心中之尺规。道友今日之举，已是证道之始。」",
    choices: [{ text: "「受教了。」", to: "" }],
  },

  // —— 第二位支线 NPC：游方道人·玄机子（道德抉择分支示范）——
  // 相助（接任务/交付）与举报（举发私炼禁丹换取赏银）互斥（notFlag xuanji_engaged），
  // 二者均 setFlag xuanji_engaged，故一旦抉择其一，另一分支即隐去；完成后以 flag/qdone 分流闲谈。
  xuanji_root: {
    id: "xuanji_root", speaker: "游方道人·玄机子", color: "#c8a2ff",
    text: "「无量天尊。」玄机子拂尘轻摇，笑意莫测，「贫道欲炼一炉温养丹，独缺三枚碧睛妖狼内丹。道友若肯相助，自有厚报；若不肯——」他意味深长，「亦可去村长处举报贫道私炼禁丹，换些赏银。」",
    choices: [
      { text: "「道长有难，我愿相助。」", to: "xuanji_accept", cond: { notFlag: "xuanji_engaged" } },
      { text: "「举报道长，换取赏银。」", to: "xuanji_report", cond: { notFlag: "xuanji_engaged" } },
      { text: "「内丹我已备齐，交予道长。」", to: "xuanji_deliver", cond: { questActive: "q_xuanji_herb" } },
      { text: "「道长别来无恙。」", to: "xuanji_chat", cond: { flag: "qdone_q_xuanji_herb" } },
      { text: "「原来是私炼禁丹的邪修，告辞。」", to: "xuanji_reported", cond: { flag: "xuanji_reported" } },
      { text: "「此事与我无关，告辞。」", to: "xuanji_leave", cond: { notFlag: "xuanji_engaged" } },
    ],
  },
  xuanji_accept: {
    id: "xuanji_accept", speaker: "游方道人·玄机子", color: "#c8a2ff",
    text: "「善哉善哉！」玄机子眼中精光一闪，「碧睛妖狼出没于妖兽林，取其内丹即可。事成之后，贫道赠你灵草三株、灵石百五十，权作谢礼。」",
    effects: [{ t: "setFlag", id: "xuanji_engaged" }, { t: "setFlag", id: "xuanji_active" }, { t: "startQuest", id: "q_xuanji_herb" }],
    choices: [{ text: "「包在我身上。」", to: "" }],
  },
  xuanji_report: {
    id: "xuanji_report", speaker: "游方道人·玄机子", color: "#c8a2ff",
    text: "「呵……道友好决断。」玄机子不怒反笑，袖中一缕丹香散去，「赏银你且拿去。只是这方天地，容不下贫道了。」言罢化作清风遁走。",
    effects: [{ t: "setFlag", id: "xuanji_engaged" }, { t: "setFlag", id: "xuanji_reported" }, { t: "setFlag", id: "xuanji_gone" }, { t: "giveStones", n: 80 }],
    choices: [{ text: "「各凭道心。」", to: "" }],
  },
  xuanji_deliver: {
    id: "xuanji_deliver", speaker: "游方道人·玄机子", color: "#c8a2ff",
    text: "「好内丹！」玄机子接过，袖袍一挥，「一言既出，驷马难追。灵草与灵石，道友收好。」",
    effects: [{ t: "completeQuest", id: "q_xuanji_herb" }],
    choices: [{ text: "「举手之劳。」", to: "" }],
  },
  xuanji_chat: {
    id: "xuanji_chat", speaker: "游方道人·玄机子", color: "#c8a2ff",
    text: "「丹成火候，皆因道友一臂之力。」玄机子含笑，「修行路远，心中尺规，胜却万法千门。」",
    choices: [{ text: "「受教了。」", to: "" }],
  },
  xuanji_reported: {
    id: "xuanji_reported", speaker: "旁白", color: "#888888",
    text: "村长查证后，唯余一缕未散的丹香。玄机子自此再未现身落霞镇——有人叹他邪修伏诛，有人惜一段善缘断绝。",
    choices: [{ text: "「各人有各人的道。」", to: "" }],
  },
  xuanji_leave: {
    id: "xuanji_leave", speaker: "游方道人·玄机子", color: "#c8a2ff",
    text: "「既如此，缘法未到。」玄机子合掌一礼，继续拨弄他的丹炉。",
    choices: [{ text: "「告辞。」", to: "" }],
  },
};
