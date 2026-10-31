/**
 * 第二章「乱星海」剧情与区域：对话树 + 任务链 + 地图 + NPC + 传送点。
 * 复用 chapter1 的 StoryEffect / DialogueNode / QuestDef 类型，由 Game 在启动时
 * 把 CH2_STORY / CH2_QUESTS 合并进全局表；区域注册表由 zones.ts 引用本文件的 chapter2Zone。
 *
 * 视觉：夜海星辉（水蓝/礁青/沙黄），与第一张图暖褐青草形成冷暖对比。
 */
import { buildMap, type MapDef } from "../map";
import {
  type NpcDef, type StoryNode, type QuestDef,
} from "./chapter1";
import type { ZoneDef } from "../zones";
import type { TransferDef } from "../../ui/TransferPanel";

// —— 乱星海地图（24x16）：上水域 + 礁石，下沙岸渔村；传送点 'P'，刷怪 'w'，Boss 台 'B' ——
const LEGEND_CH2: string[] = [
  "########################",
  "#~~~~~~~~~~~~~~~~~~~~~~#",
  "#~~~~~~~~~~~~~~~~~~~~~~#",
  "#~~~~~~~~~~~~~~~~~~~~~~#",
  "#~~~~RR~~~~~RR~~~~~~~~~#",
  "#~~~~~~~~~~~~~~~~~~~~~~#",
  "#ssssssssssssssssssssss#",
  "#s.,ss####ss####ss.,sss#",
  "#s.,s#####ss#####s.,sss#",
  "#sssssswwwwwwwwBsssssss#",
  "#sssssswwwwwwwwssssssss#",
  "#ssssssssssssssssssssss#",
  "#sPssssssssssssssssssss#",
  "#ssssssssssssssssssssss#",
  "#ssssssssssssssssssssss#",
  "########################",
];

export const MAP_CH2: MapDef = buildMap(LEGEND_CH2, { gx: 11, gy:12 });

const WZ = MAP_CH2.wolfZone;
const HAI_SPOTS = WZ.filter((s) => s.gy === 9);
const XIE_SPOTS = WZ.filter((s) => s.gy === 10);
const JIAO_SPOTS = [
  { gx: 6, gy: 9 }, { gx: 16, gy: 9 }, { gx: 6, gy: 10 }, { gx: 16, gy: 10 },
];

export const NPCS_CH2: NpcDef[] = [
  { id: "yucun-zhang", name: "渔村长者", color: "#c9a227", gx: 4, gy: 13, dialogue: "ch2_intro" },
  { id: "zongmen-shi", name: "玄水宗使者", color: "#7b9e89", gx: 9, gy: 13, dialogue: "ch2_sect_root" },
  { id: "jiaoren-shi", name: "鲛人使者", color: "#5fbf9f", gx: 15, gy: 13, dialogue: "ch2_jiao_root" },
  { id: "yushang", name: "渔商·钱伯", color: "#b07a3a", gx: 19, gy: 13, service: "shop" },
  { id: "yutiejiang", name: "渔村铁匠·阿石", color: "#8a6a55", gx: 10, gy: 14, service: "forge" },
  { id: "zongmen-zhashi", name: "宗门执事", color: "#5f7f9f", gx: 6, gy: 14, service: "sect" },
];

export const CH2_QUESTS: Record<string, QuestDef> = {
  q_sea_demo: {
    id: "q_sea_demo", name: "海妖之患",
    desc: "海妖袭扰渔村，替长者猎杀 12 只海妖。",
    kill: "hai-yao", killName: "海妖", n: 12,
    rewards: [
      { t: "giveExp", n: 400 },
      { t: "giveStones", n: 120 },
      { t: "giveRep", n: 20 },
      { t: "giveItem", id: "shan-hu", n: 3 },
    ],
  },
  q_reef: {
    id: "q_reef", name: "平定礁区",
    desc: "礁石间蟹将横行，剿灭 10 只以安海路。",
    kill: "xie-jiang", killName: "蟹将", n: 10,
    rewards: [
      { t: "giveExp", n: 600 },
      { t: "giveStones", n: 200 },
      { t: "giveRep", n: 30 },
    ],
  },
  q_boss2: {
    id: "q_boss2", name: "覆海之患",
    desc: "覆海蛟盘踞星岛，兴风作浪，为民除害。",
    kill: "fu-hai-jiao", killName: "覆海蛟", n: 1,
    rewards: [
      { t: "giveExp", n: 2000 },
      { t: "giveStones", n: 500 },
      { t: "giveRep", n: 100 },
      { t: "win", chapter: 2 },
      { t: "giveArtifact", id: "zhenlong-yin" },
    ],
  },
  q_ch2_side1: {
    id: "q_ch2_side1", name: "支线 · 搜救渔民",
    desc: "海妖掳走渔民，追踪并猎杀 6 只海妖。",
    kill: "hai-yao", killName: "海妖", n: 6,
    rewards: [
      { t: "giveItem", id: "huixue-dan", n: 3 },
      { t: "giveRep", n: 10 },
    ],
  },
  q_ch2_side2: {
    id: "q_ch2_side2", name: "支线 · 鲛人之约",
    desc: "鲛人使者相托，猎杀 6 只鲛人以平宿怨。",
    kill: "jiao-ren", killName: "鲛人", n: 6,
    rewards: [
      { t: "giveItem", id: "jiao-lin-jia", n: 1 },
      { t: "giveRep", n: 15 },
    ],
  },
};

export const CH2_STORY: Record<string, StoryNode> = {
  ch2_intro: {
    id: "ch2_intro",
    speaker: "渔村长者",
    color: "#c9a227",
    text: "后生可是自落霞镇来？近些时日，海妖频扰渔村，连礁区的蟹将也张狂起来。",
    choices: [
      { text: "长者，海上有何变故？", to: "ch2_zhang_1" },
      { text: "（先四处看看）", to: "ch2_bye" },
    ],
  },
  ch2_zhang_1: {
    id: "ch2_zhang_1",
    speaker: "渔村长者",
    color: "#c9a227",
    text: "村口玄水宗使者可授你御海之术，海中的鲛人使者亦通情理。先替老朽除去海妖之患罢。",
    effects: [{ t: "startQuest", id: "q_sea_demo" }],
    choices: [
      { text: "愿往一行", to: "ch2_bye" },
      { text: "（稍后再说）", to: "ch2_bye" },
    ],
  },
  ch2_sect_root: {
    id: "ch2_sect_root",
    speaker: "玄水宗使者",
    color: "#7b9e89",
    text: "落霞来的道友？此方海域暗流汹涌。拜入我玄水宗，传你水剑诀与玄水护体，可平覆海之患。",
    choices: [
      {
        text: "（拜入玄水宗）",
        to: "ch2_sect_joined",
        effects: [
          { t: "joinSect", id: "xuan-shui-zong" },
          { t: "giveArtifact", id: "xuan-shui-jue" },
          { t: "learnSkill", id: "shui-jian" },
          { t: "learnSkill", id: "xuan-shui" },
          { t: "giveRep", n: 10 },
          { t: "spawnBoss" },
          { t: "startQuest", id: "q_reef" },
          { t: "startQuest", id: "q_boss2" },
        ],
      },
      { text: "（容我斟酌）", to: "ch2_sect_hint" },
    ],
  },
  ch2_sect_joined: {
    id: "ch2_sect_joined",
    speaker: "玄水宗使者",
    color: "#7b9e89",
    text: "善。星岛高台之上，覆海蛟已成气候，去吧——你的名号，玄水宗记下了。",
    choices: [{ text: "告辞", to: "ch2_bye" }],
  },
  ch2_sect_hint: {
    id: "ch2_sect_hint",
    speaker: "玄水宗使者",
    color: "#7b9e89",
    text: "礁区蟹将、海中鲛人皆可历练。待你心意已决，再来寻我。",
    choices: [{ text: "告辞", to: "ch2_bye" }],
  },
  ch2_jiao_root: {
    id: "ch2_jiao_root",
    speaker: "鲛人使者",
    color: "#5fbf9f",
    text: "人族道友，鲛族愿与玄水宗结盟。星海深处尚有更诡谲之地——坠魔谷，传闻魔修窃据，非你所能想象。",
    effects: [{ t: "startQuest", id: "q_ch2_side2" }],
    choices: [{ text: "（记下坠魔谷之事）", to: "ch2_bye" }],
  },
  ch2_bye: {
    id: "ch2_bye",
    text: "（你转身离去，海风拂面。）",
  },
  ch2_win_1: {
    id: "ch2_win_1",
    speaker: "旁白",
    text: "覆海蛟伏诛，星海重归宁静。玄水宗使者长揖致谢——然坠魔谷的阴影，已悄然笼罩你心头。",
    choices: [{ text: "新的征途", to: "ch2_bye" }],
  },
};

export const chapter2Transfers: TransferDef[] = [
  { gx: 2, gy: 12, to: "ch1", spawn: { gx: 11, gy: 13 }, label: "返回落霞镇" },
];

export const chapter2Zone: ZoneDef = {
  id: "ch2",
  chapter: 2,
  map: MAP_CH2,
  npcs: NPCS_CH2,
  wild: [
    { id: "hai-yao", spots: HAI_SPOTS },
    { id: "xie-jiang", spots: XIE_SPOTS },
    { id: "jiao-ren", spots: JIAO_SPOTS },
  ],
  bossId: "fu-hai-jiao",
  transfers: chapter2Transfers,
  startNode: "ch2_intro",
};
