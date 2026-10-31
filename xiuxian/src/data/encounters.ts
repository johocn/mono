/**
 * P3-5余 奇遇事件池：走入世界的随机遭遇，复用全局 STORY 对话树。
 * 在 Game 启动时并入 STORY（与 CH2_STORY / SOCIAL_STORY 同机制）。
 * 节点效果均为 Player.applyEffects 已支持的类型（giveItem/giveExp/heal/giveStones）。
 */
import type { StoryNode } from "./story/chapter1";

export const ENCOUNTER_STORY: Record<string, StoryNode> = {
  enc_fox: {
    id: "enc_fox", speaker: "灵狐", color: "#ffce6b",
    text: "一只通体雪白的灵狐自林间跃出，衔来几株灵草置于你脚边，歪着头望了片刻，旋即没入草丛。",
    effects: [{ t: "giveItem", id: "ling-cao", n: 3 }],
    choices: [{ text: "「多谢狐仙。」", to: "" }],
  },
  enc_old: {
    id: "enc_old", speaker: "云游老者", color: "#9fb4c9",
    text: "「少年人，修行如逆水行舟。」老者捋须一笑，指间一点灵光没入你眉心，诸多感悟油然而生。",
    effects: [{ t: "giveExp", n: 200 }],
    choices: [{ text: "「受教了。」", to: "" }],
  },
  enc_spring: {
    id: "enc_spring", speaker: "灵泉", color: "#6bd5ff",
    text: "岩缝间渗出一汪清泉，水汽氤氲着淡淡灵机。你掬饮几口，周身疲累尽消。",
    effects: [{ t: "heal", n: 200 }],
    choices: [{ text: "「好清凉的泉水。」", to: "" }],
  },
  enc_ruins: {
    id: "enc_ruins", speaker: "古修士遗蜕", color: "#c9a227",
    text: "断壁残垣间，一具盘坐入定的枯骨早已化作飞灰，唯指间一枚灵石仍泛着温润光泽。",
    effects: [{ t: "giveStones", n: 60 }],
    choices: [{ text: "「前辈安心去吧。」", to: "" }],
  },
  enc_mystic: {
    id: "enc_mystic", speaker: "神秘商铺", color: "#b98cff",
    text: "雾气中浮现一座虚影般的摊位，摊主递来一只锦囊便消散无踪——囊中竟是数株珍稀灵草。",
    effects: [{ t: "giveItem", id: "ling-cao", n: 2 }, { t: "giveItem", id: "yaodan", n: 1 }],
    choices: [{ text: "「这……」", to: "" }],
  },
};
