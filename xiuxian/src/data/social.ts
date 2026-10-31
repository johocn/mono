/**
 * 社交系统（p1-social，单机降级）：本地好友（NPC 好感 + 每日论道）、
 * NPC 邮件（含奖励、按境界解锁）、宗门建设（贡献 + 建筑升级被动加成）、
 * 宗门战（确定性 PVE 演练）。云接口（好友/邮件）后续可接 CloudClient。
 */
import { makeRng } from "../core/Rng";
import { SECT_NAME } from "./sect";

export interface NpcFriend {
  id: string;
  name: string;
  title: string;
  desc: string;
  /** 每次论道基础奖励（随好感分档放大） */
  base: { exp?: number; stones?: number; items?: { id: string; n: number }[] };
}

export const NPC_FRIENDS: NpcFriend[] = [
  { id: "lin", name: "林清霜", title: "剑修", desc: "落霞镇偶遇的剑修，好论剑。", base: { exp: 40, stones: 10 } },
  { id: "mu", name: "牧云子", title: "丹师", desc: "行医送药的散修，精于丹道。", base: { exp: 20, items: [{ id: "huixue-dan", n: 1 }] } },
  { id: "yan", name: "炎屠", title: "体修", desc: "天生神力的体修，好斗不服。", base: { exp: 60, stones: 5 } },
];

export interface MailDef {
  id: string;
  from: string;
  title: string;
  body: string;
  /** 解锁所需境界下标（默认 0：开局可领） */
  needRealm?: number;
  reward: { exp?: number; stones?: number; items?: { id: string; n: number }[] };
}

export const MAILS: MailDef[] = [
  { id: "m_welcome", from: SECT_NAME, title: "入门贺礼", body: "欢迎拜入玄水宗，些许灵石助你初修。", reward: { stones: 100, exp: 50 } },
  { id: "m_firstblood", from: "外门执事", title: "初战之赏", body: "闻你初斩妖兽，特赐修为丹二枚。", reward: { items: [{ id: "xiuwei-dan", n: 2 }] } },
  { id: "m_jindan", from: SECT_NAME, title: "金丹贺信", body: "凝结金丹，宗门与有荣焉，赐你灵石若干。", needRealm: 4, reward: { stones: 300, exp: 500 } },
  { id: "m_yuaniao", from: SECT_NAME, title: "元婴喜报", body: "元婴已成，前途不可限量。", needRealm: 8, reward: { stones: 800, exp: 1500 } },
];

export interface SectBuildingDef {
  id: string;
  name: string;
  desc: string;
  maxLv: number;
  /** 每级消耗贡献（升级到 lv 花费 costPerLv * lv） */
  costPerLv: number;
  /** 每级效果：修炼堂/藏经阁加经验，战功堂/藏经阁加灵石（百分比） */
  expPerLv: number;
  stonePerLv: number;
}

export const SECT_BUILDINGS: SectBuildingDef[] = [
  { id: "xiu-lian-tang", name: "修炼堂", desc: "每级 +3% 修为获取", maxLv: 5, costPerLv: 30, expPerLv: 0.03, stonePerLv: 0 },
  { id: "zhan-gong-tang", name: "战功堂", desc: "每级 +5% 灵石获取", maxLv: 5, costPerLv: 30, expPerLv: 0, stonePerLv: 0.05 },
  { id: "cang-jing-ge", name: "藏经阁", desc: "每级 +2% 修为与灵石获取", maxLv: 5, costPerLv: 40, expPerLv: 0.02, stonePerLv: 0.02 },
];

/** 好感上限与分档（每 FRIEND_TIER 点好感升一档，奖励 ×档位） */
export const FRIEND_CAP = 10;
export const FRIEND_TIER = 3;

/** 每日种子（复用 dailies 思路：日期即种子，当天确定） */
function hashDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 门派大比（PVE 演练）的确定性随机源 */
export function sectWarRng(day: string): () => number {
  return makeRng(hashDate(day) ^ 0x5ec14);
}

// ================= p2-③ NPC 好感多结局 =================
import type { StoryNode } from "./story/chapter1";

/** 单个结局：按好感门槛解锁，取满足门槛中最高的一档 */
export interface FriendEnding {
  id: string;
  friendId: string;
  /** 触发所需最低好感（含） */
  minAffinity: number;
  /** 对应的 StoryNode id（复用 chapter1 对话树播放器） */
  nodeId: string;
}

export const FRIEND_ENDINGS: FriendEnding[] = [
  // 林清霜（剑修）
  { id: "lin_acquaint", friendId: "lin", minAffinity: 0, nodeId: "ending_lin_acquaint" },
  { id: "lin_confidant", friendId: "lin", minAffinity: 5, nodeId: "ending_lin_confidant" },
  { id: "lin_soulmate", friendId: "lin", minAffinity: 10, nodeId: "ending_lin_soulmate" },
  // 牧云子（丹师）
  { id: "mu_acquaint", friendId: "mu", minAffinity: 0, nodeId: "ending_mu_acquaint" },
  { id: "mu_confidant", friendId: "mu", minAffinity: 5, nodeId: "ending_mu_confidant" },
  { id: "mu_soulmate", friendId: "mu", minAffinity: 10, nodeId: "ending_mu_soulmate" },
  // 炎屠（体修）
  { id: "yan_acquaint", friendId: "yan", minAffinity: 0, nodeId: "ending_yan_acquaint" },
  { id: "yan_confidant", friendId: "yan", minAffinity: 5, nodeId: "ending_yan_confidant" },
  { id: "yan_soulmate", friendId: "yan", minAffinity: 10, nodeId: "ending_yan_soulmate" },
];

/** 结局对话节点（复用 StoryNode 结构，由 DialogueRunner 播放） */
export const SOCIAL_STORY: Record<string, StoryNode> = {
  ending_lin_acquaint: {
    id: "ending_lin_acquaint", speaker: "林清霜", color: "#7fd0ff",
    text: "（剑修林清霜与你几番论剑，收剑入鞘）「你根基尚可，只是火候未到。山高水长，后会有期。」",
    choices: [{ text: "「告辞。」", to: "" }],
  },
  ending_lin_confidant: {
    id: "ending_lin_confidant", speaker: "林清霜", color: "#7fd0ff",
    text: "（林清霜拔剑，与你连斗百招竟不分胜负）「好剑法！从今你是我林清霜的剑道知交。此剑穗赠你，望勿相忘。」",
    effects: [{ t: "giveItem", id: "xiuwei-dan", n: 2 }],
    choices: [{ text: "「幸甚至哉。」", to: "" }],
  },
  ending_lin_soulmate: {
    id: "ending_lin_soulmate", speaker: "林清霜", color: "#7fd0ff",
    text: "（林清霜挽剑光如雪，与你并肩而立）「生死与共，方为剑道挚友。这柄青锋，与你同源。」",
    effects: [{ t: "giveItem", id: "qingfeng-jian", n: 1 }, { t: "giveExp", n: 500 }],
    choices: [{ text: "「此生不负。」", to: "" }],
  },
  ending_mu_acquaint: {
    id: "ending_mu_acquaint", speaker: "牧云子", color: "#9be7a0",
    text: "（丹师牧云子捋须微笑）「小友初来，老道赠你一枚丹药压惊。日后若有旧伤，可来寻我。」",
    effects: [{ t: "giveItem", id: "huixue-dan", n: 1 }],
    choices: [{ text: "「多谢前辈。」", to: "" }],
  },
  ending_mu_confidant: {
    id: "ending_mu_confidant", speaker: "牧云子", color: "#9be7a0",
    text: "（牧云子引你入丹房）「你既信我，便传你一手控火之诀。这匣丹药，拿去防身。」",
    effects: [{ t: "giveItem", id: "huixue-dan", n: 3 }, { t: "giveStones", n: 80 }],
    choices: [{ text: "「铭感五内。」", to: "" }],
  },
  ending_mu_soulmate: {
    id: "ending_mu_soulmate", speaker: "牧云子", color: "#9be7a0",
    text: "（牧云子将一枚温润丹丸置于你掌心）「此乃老道毕生所炼突破丹，今日赠你。他日飞升，莫忘落霞一醉。」",
    effects: [{ t: "giveItem", id: "tu-po-dan", n: 1 }, { t: "giveExp", n: 800 }],
    choices: [{ text: "「师恩难忘。」", to: "" }],
  },
  ending_yan_acquaint: {
    id: "ending_yan_acquaint", speaker: "炎屠", color: "#ff9a5a",
    text: "（体修炎屠捶了捶你肩头）「小子身板还行！有空再来陪老子练练，别怂。」",
    effects: [{ t: "giveStones", n: 30 }],
    choices: [{ text: "「随时奉陪。」", to: "" }],
  },
  ending_yan_confidant: {
    id: "ending_yan_confidant", speaker: "炎屠", color: "#ff9a5a",
    text: "（炎屠大笑，与你对拳相击）「痛快！你这朋友老子交定了。拿去这点灵石，买点好酒！」",
    effects: [{ t: "giveStones", n: 120 }],
    choices: [{ text: "「干了！」", to: "" }],
  },
  ending_yan_soulmate: {
    id: "ending_yan_soulmate", speaker: "炎屠", color: "#ff9a5a",
    text: "（炎屠将一块古朴铁牌拍进你手里）「生死兄弟！这护身铁牌随我征战半生，今赠你。他日有难，老子必到。」",
    effects: [{ t: "giveStones", n: 300 }, { t: "giveExp", n: 600 }],
    choices: [{ text: "「兄弟同心。」", to: "" }],
  },
};

// ================= p2-⑤ 云社交基础数据 =================

/** 账号级社交档案（云端结构化存储，镜像 Player 社交字段，便于跨设备同步与服务端聚合） */
export interface SocialProfile {
  /** 好友好感：friendId -> { affinity, lastDay } */
  friends: Record<string, { affinity: number; lastDay: string }>;
  /** 已达成的结局：friendId -> endingId */
  friendEnding: Record<string, string>;
  /** 已领取的 NPC 邮件 id */
  mailsClaimed: string[];
  /** 宗门贡献 */
  sectContribution: number;
  /** 宗门建筑等级：buildingId -> lv */
  sectBuildings: Record<string, number>;
}

/** 空社交档案（新账号 / 云端无记录时的默认值） */
export function defaultSocialProfile(): SocialProfile {
  return { friends: {}, friendEnding: {}, mailsClaimed: [], sectContribution: 0, sectBuildings: {} };
}
