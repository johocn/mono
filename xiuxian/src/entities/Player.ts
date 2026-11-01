/**
 * 玩家：在 Actor 之上叠加 境界/技能/背包/装备/任务/施法状态机。
 * 存档序列化集中在这里（SaveState），云存档与本地兜底共用同一结构。
 */
import { Actor, type ActorOpts } from "./Actor";
import { getSkill, DEFAULT_SKILLS, type SkillDef } from "../data/skills";
import { REALMS, realmIndexOf, realmIndexIn, ASCEND_REALMS, MAX_REINCARNATIONS, MAX_REALM_LEN, type RealmDef } from "../data/realms";
import { activeEvents } from "../data/events";
import { NPC_FRIENDS, MAILS, SECT_BUILDINGS, FRIEND_CAP, FRIEND_TIER, sectWarRng, FRIEND_ENDINGS, defaultSocialProfile, type NpcFriend, type MailDef, type SocialProfile } from "../data/social";
import { getMonster } from "../data/monsters";
import { rollRoot, rootMulOf, getRoot } from "../data/roots";
import { getItem, isEquipment, type EquipSlot } from "../data/items";
import { AFFIX_POOL, type AffixDef, type AffixInstance } from "../data/affixes";
import { SETS } from "../data/sets";
import { QUESTS, type StoryEffect } from "../data/story/chapter1";
import { getBuilding as getBuildingSafe } from "../data/buildings";
import { makeRng, type Rng } from "../core/Rng";
import { ART } from "../core/Assets";
import type { ElementKind } from "../data/elements";
import type { Buff } from "../core/Combat";
import type { Rarity } from "../data/rarity";
import { rollRarity, getRarity } from "../data/rarity";
import { atkBonus } from "../core/Combat";
import { getTalent, talentNodeUnlocked, TALENT_POINTS_PER_REALM, type TalentBranch } from "../data/talents";
import { getArtifact } from "../data/artifacts";

/** 招牌技能（御剑术）：施法时切到 Rig 的 "skill" 骨骼动作 */
export const SIGNATURE_SKILL_ID = "yujian";
import { getGem, REFINE_COST } from "../data/gems";
import { getSchool, DEFAULT_SCHOOL, TALENT_SYNERGY_MUL } from "../data/schools";
import { getTier, signinRewardOf, MONTH_CARD_DAYS, MONTH_CARD_STONES, type BpReward } from "../data/battlepass";
import { ACHIEVEMENTS, achMet, type AchSnapshot } from "../data/achievements";
import { rollDailies, getDaily, type DailyKind } from "../data/dailies";
import {
  FORGE_MAX, forgeBonusOf, forgeCostOf, forgeRateOf,
  buyPriceOf, sellPriceOf, canSell,
} from "../data/shop";
import { ALEMBIC_RECIPES } from "../data/alembic";
import { getBeast, CAPTURE_MAP, beastCaptureRate } from "../data/beasts";
import { seedArenaBoard, ARENA_MIN_POINTS, type ArenaBoardEntry } from "../data/arena";

export interface QuestState {
  active: string[];
  /** 任务 id → 已击杀数 */
  progress: Record<string, number>;
  done: string[];
}

export interface BuiltRec {
  /** 所属区域（切图时仅还原当前区域建筑） */
  zone: string;
  id: string;
  gx: number;
  gy: number;
  /** 放置前地表，拆除时还原 */
  orig: string;
}

export interface SaveState {
  /** 存档版本：1 = 旧版（无下方 v2 字段），2 = 现行；applySave 两者皆可读 */
  v: 1 | 2 | 3;
  nickname: string;
  exp: number;
  hp: number;
  mp: number;
  inv: [string, number][];
  equipment: { weapon?: string; armor?: string; trinket?: string };
  learned: string[];
  equipped: (string | null)[];
  quests: QuestState;
  flags: Record<string, boolean>;
  kills: number;
  playMs: number;
  built: BuiltRec[];
  /** 灵石（通用货币） */
  stones: number;
  /** 装备强化等级：装备 id → +N */
  forge: Record<string, number>;
  /** 当前章节 */
  chapter: number;
  /** 已解锁区域 id 列表 */
  unlockedZones: string[];
  /** 声望（宗门系统） */
  reputation: number;
  /** 所属宗门 id（null = 散修） */
  sect: string | null;
  /** 装备词条（按装备 id 共享，独立随机源 roll） */
  affixes?: Record<string, AffixInstance>;
  // —— v2 新增（applySave 对缺省字段给默认值，保证旧 v1 档可读）——
  /** 可用天赋点（境界突破发放） */
  talentPoints?: number;
  /** 天赋树已加点：节点 id → 已加点数 */
  talents?: Record<string, number>;
  /** 已装备法宝 id（null = 未装备） */
  artifact?: string | null;
  /** 已拥有法宝 id 列表 */
  ownedArtifacts?: string[];
  /** 图鉴收集状态（三态：见过/击杀/获得/学过） */
  codex?: {
    monstersSeen?: string[]; monstersKilled?: string[];
    itemsGot?: string[]; skillsLearned?: string[];
  };
  /** 成就：unlocked 已解锁 / claimed 已领奖 */
  achievements?: { unlocked?: string[]; claimed?: string[] };
  /** 日常任务：按 date(YYYY-MM-DD) 播种，progress/claimed 跟进 */
  daily?: { date?: string; ids?: string[]; progress?: Record<string, number>; claimed?: string[] };
  /** 新手引导是否已完成（true = 不再触发） */
  tutorialDone?: boolean;
  /** 活动领取记录：eventId -> 最近领取日期（YYYY-MM-DD） */
  eventClaims?: Record<string, string>;
  // —— v3 新增（applySave 对缺省给默认值，保证旧 v1/v2 档可读）——
  /** 灵根 id（缺省由 seed 重滚） */
  root?: string;
  /** 当前功法流派 id */
  school?: string;
  /** 装备 id → 镶嵌宝石 id（孔位） */
  gems?: Record<string, string | null>;
  /** 装备 id → 品质（按装备共享，独立随机；P3-4 新增） */
  rarities?: Record<string, Rarity>;
  /** 战令/月卡/签到：赛季号、已领档位、已签日期、月卡到期、月卡已领日期 */
  battlePass?: { season: number; claimed: number[]; signinDays: string[]; monthCardUntil?: number; monthCardClaimed?: string[] };
  /** 离线收益：上次活跃时间戳（ms）；<=0 视为首次/旧档 */
  lastSeen?: number;
  /** 已渡天劫的境界下标集合（旧档按已达境界默认通过） */
  brokenRealms?: number[];
  /** 待渡劫境界下标（0=无） */
  pendingTribulation?: number;
  /** 成功渡劫次数（每成功 +6% 属性） */
  tribStacks?: number;
  /** 已拥有灵兽 id 列表 */
  beasts?: string[];
  /** 出战灵兽 id（null = 无出战） */
  activeBeast?: string | null;
  /** 镇妖塔进度 */
  towerFloor?: number;
  towerBest?: number;
  towerDaily?: string;
  /** 竞技场积分 */
  arenaPoints?: number;
  /** 竞技场战绩 */
  arenaWins?: number;
  arenaLosses?: number;
  /** 飞升转世次数（0 = 第一世；每飞升 +1） */
  reincarnations?: number;
  /** P3-7 多周目：历练效率倍率（继承自元进度） */
  expMulNg?: number;
  /** P3-7 多周目：所属周目 */
  ngPlus?: number;
  /** 竞技场本地排行榜（对手池，离线兜底） */
  arenaBoard?: ArenaBoardEntry[];
  /** 社交（p1-social）：好友好感（id -> {affinity,lastDay}） */
  friends?: Record<string, { affinity: number; lastDay: string }>;
  /** 社交（p2-③）：好友结局（friendId -> endingId） */
  friendEnding?: Record<string, string>;
  /** 社交：已领取邮件 id 列表 */
  mailsClaimed?: string[];
  /** 社交：宗门贡献 */
  sectContribution?: number;
  /** 社交：宗门建筑等级（id -> level） */
  sectBuildings?: Record<string, number>;
  /** 社交：门派大比最近参与日期 */
  sectWarDay?: string;
  /** 镇魔进度：累计击杀魔物数（坠魔谷深化） */
  demonSlain?: number;
  /** 秘境（Roguelike）最高到达层数 */
  rogueBest?: number;
  /** P3-6：玩家间邮件收件箱缓存 */
  mailbox?: MailItem[];
  /** P3-8：赛季活动副本历史最佳得分 */
  seasonBest?: number;
}

const BASE_ATK = 10;
const BASE_DEF = 5;
const BASE_HP = 120;
const BASE_MP = 60;
const BASE_SPEED = 3.4;

/**
 * 表现层开关：true=韩立青袍全身立绘（整体律动，无接缝）；false=分体骨骼装配（真骨骼动画）。
 * B2：置 false 启用部件骨架（SkeletonRig）——双腿/双臂/披风独立摆动，且能享用到
 * crossfade / 裙摆披风弹簧次级运动 / 打击帧对齐；代价是 AI 切图的接缝与色差会暴露。
 */
const PLAYER_ROBE_ART = false;

// P3-1 翻滚参数
const ROLL_COST = 22;        // 翻滚体力消耗
// P3-1b 格挡/弹反参数
const BLOCK_GUARD_MUL = 0.5;   // 格挡减伤（承受 50% 伤害）
const PARRY_WINDOW = 0.18;     // 弹反窗口（举盾后秒数内命中触发）
const BLOCK_DRAIN = 12;        // 格挡持续体力消耗/秒
const BLOCK_COOLDOWN = 0.25;   // 解除格挡后短冷却
const ROLL_CD = 0.55;        // 翻滚冷却（秒）
const ROLL_DUR = 0.26;       // 翻滚位移持续（秒）
const ROLL_IFRAME = 0.34;    // 翻滚无敌帧（秒，> ROLL_DUR 保证全程 i-frame）
const ROLL_SPEED_MULT = 2.4; // 翻滚位移速度倍率
const STAMINA_REGEN = 16;    // 体力每秒回复

/** 构造参数：位置必填，其余用玩家基础值（调用方无需传 hp/atk 等） */
export type PlayerOpts = Partial<ActorOpts> & { gx: number; gy: number; nickname?: string };

/** 玩家间邮件收件箱条目（服务端缓存，领取由服务端保证不重领） */
export interface MailItem {
  id: number;
  fromName: string;
  title: string;
  body: string;
  reward?: { exp?: number; stones?: number; items?: { id: string; n: number }[] };
  read: boolean;
  claimed: boolean;
  createdAt: number;
}

export class Player extends Actor {
  exp = 0;
  nickname: string;
  learned: string[] = [...DEFAULT_SKILLS];
  equipped: (string | null)[] = [DEFAULT_SKILLS[0], DEFAULT_SKILLS[1], DEFAULT_SKILLS[2], DEFAULT_SKILLS[3]];
  inv = new Map<string, number>();
  equipment: { weapon?: string; armor?: string; trinket?: string } = {};
  quests: QuestState = { active: [], progress: {}, done: [] };
  flags: Record<string, boolean> = {};
  kills = 0;
  playMs = 0;
  /** 玩家建造物（按区域分存，阻挡寻路） */
  built: BuiltRec[] = [];
  /** 灵石余额 */
  stones = 0;
  /** P3-7 多周目：本局历练效率倍率（继承自元进度，默认 1） */
  expMulNg = 1;
  /** P3-7 多周目：本局所属周目（继承自元进度，默认 0 = 第一周目） */
  ngPlus = 0;
  /** 当前章节（1 = 落霞镇，2 = 乱星海） */
  chapter = 1;
  /** 已解锁区域 id */
  unlockedZones: string[] = ["ch1"];
  /** 声望 */
  reputation = 0;
  /** 所属宗门 id（null = 散修） */
  sect: string | null = null;
  /** 装备强化等级：装备 id → +N（同名装备共享） */
  forge: Record<string, number> = {};
  /** 装备词条：装备 id → 词条实例（首次获得时 roll，玩家级共享） */
  affixes: Record<string, AffixInstance> = {};
  /** 宝石镶嵌：装备 id → 镶嵌宝石 id（null = 空孔） */
  gems: Record<string, string | null> = {};
  /** 装备品质：装备 id → 品质（首次获得时 roll，玩家级共享，与 affixes 同源随机） */
  rarities: Record<string, Rarity> = {};
  /** 炼器独立随机源：不污染战斗/掉落的确定性序列 */
  forgeRng: Rng;
  alembicRng: Rng;
  /** 捕捉独立随机源：与 forge/战斗/掉落/炼丹隔离 */
  captureRng: Rng;
  /** 竞技场对战独立随机源（不污染战斗 rng） */
  arenaRng: Rng;
  /** 词条独立随机源：与 forge/战斗/掉落均隔离，保证可复现 */
  affixRng: Rng;
  /** P3-1 战斗手感：体力（翻滚消耗）与翻滚状态 */
  stamina = 100;
  maxStamina = 100;
  /** 翻滚冷却（秒） */
  rollCd = 0;
  /** 翻滚进行中 */
  rolling = false;
  rollDirX = 0;
  rollDirY = 0;
  /** 翻滚剩余时间（秒） */
  rollT = 0;
  /** P3-1b 格挡/弹反：防御姿态标志 */
  blocking = false;
  /** 格挡持续时长（秒，用于弹反窗口判定：举盾后 PARRY_WINDOW 内被命中触发弹反） */
  blockT = 0;
  /** 解除格挡后的短冷却（秒） */
  blockCd = 0;
  /** 格挡减伤系数（承受伤害比例 = 1 - 此值；0.5=减伤50%） */
  guardMul = BLOCK_GUARD_MUL;
  /** 可用天赋点（境界突破时发放，data/talents.ts 消费） */
  talentPoints = 0;
  /** 天赋树已加点：节点 id → 已加点数 */
  talents: Record<string, number> = {};
  /** 已装备法宝 id（null = 未装备；data/artifacts.ts） */
  artifact: string | null = null;
  /** 已拥有法宝 id 列表 */
  ownedArtifacts: string[] = [];
  /** 已拥有灵兽 id 列表 */
  beasts: string[] = [];
  /** 出战灵兽 id（null = 无出战；data/beasts.ts） */
  activeBeast: string | null = null;
  /** 镇妖塔：当前层数（每日进入重置为 1） */
  towerFloor = 1;
  /** 镇妖塔：历史最高层（永久保留） */
  towerBest = 0;
  /** 镇妖塔：上次每日重置日期（YYYY-MM-DD，与 Game.todayStr 对齐） */
  towerDaily = "";
  /** 飞升转世次数（0 = 第一世；每飞升 +1，开启更高境界表 + 永久继承加成） */
  reincarnations = 0;
  /** 竞技场积分（初始 ARENA_START_POINTS） */
  arenaPoints = 1000;
  /** 竞技场战绩：胜 / 负 */
  arenaWins = 0;
  arenaLosses = 0;
  /** 竞技场本地排行榜（对手池，离线兜底；ensureArenaBoard 首次播种） */
  arenaBoard: ArenaBoardEntry[] = [];
  /** 社交：好友好感 */
  friends: Record<string, { affinity: number; lastDay: string }> = {};
  /** 社交（p2-③）：好友结局记录 */
  friendEnding: Record<string, string> = {};
  /** 社交：已领取邮件 */
  mailsClaimed: string[] = [];
  /** 社交：宗门贡献 */
  sectContribution = 0;
  /** 社交：宗门建筑等级 */
  sectBuildings: Record<string, number> = {};
  /** 社交：门派大比最近参与日期 */
  sectWarDay = "";
  /** P3-6：玩家间邮件收件箱（服务端缓存） */
  mailbox: MailItem[] = [];
  /** P3-8：赛季活动副本历史最佳得分（本地镜像，榜单以服务端为准） */
  seasonBest = 0;
  /** 镇魔进度：累计击杀魔物数（坠魔谷深化） */
  demonSlain = 0;
  /** 秘境（Roguelike）最高到达层数 */
  rogueBest = 0;
  /** 图鉴收集状态 */
  codex: {
    monstersSeen: string[]; monstersKilled: string[];
    itemsGot: string[]; skillsLearned: string[];
  } = { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] };
  /** 成就：unlocked 已解锁 / claimed 已领奖 */
  achievements: { unlocked: string[]; claimed: string[] } = { unlocked: [], claimed: [] };
  /** 日常任务：date 为播种日期，ids 为当日任务，progress 计数，claimed 已领奖 */
  daily: { date: string; ids: string[]; progress: Record<string, number>; claimed: string[] } = {
    date: "", ids: [], progress: {}, claimed: [],
  };
  /** 新手引导完成标志（true 后不再触发） */
  tutorialDone = false;
  /** 活动领取记录：eventId -> 最近领取日期（每日幂等） */
  eventClaims: Record<string, string> = {};
  /** 灵根 id（构造时按 seed 确定性生成，载入存档后由 applySave 覆盖） */
  root = "";
  /** 当前功法流派 id（默认散修，零被动，保证既存档一致） */
  school = DEFAULT_SCHOOL;
  /** 战令/月卡/签到：赛季、已领档位、已签日期、月卡到期(0=未购)、月卡已领日期 */
  battlePass: { season: number; claimed: number[]; signinDays: string[]; monthCardUntil: number; monthCardClaimed: string[] } = {
    season: 1, claimed: [], signinDays: [], monthCardUntil: 0, monthCardClaimed: [],
  };
  /** 离线收益：上次活跃时间戳（ms），0 = 首次 */
  lastSeen = 0;
  /** 已渡过天劫的境界下标（用于境界封顶；旧档按已达境界默认通过） */
  brokenRealms: boolean[] = new Array(MAX_REALM_LEN).fill(false);
  /** 待渡劫境界下标（0=无）；exp 跨过天劫境但未渡时置位 */
  pendingTribulation = 0;
  /** 成功渡劫次数（每成功一次永久 +6% 属性） */
  tribStacks = 0;

  /** 当前选中的攻击目标（Game 维护引用，这里只存 id 外的显示环） */
  casting: { skill: SkillDef; t: number } | null = null;
  /** 施法完成待 Game 结算的技能 */
  castReady: SkillDef | null = null;
  cds: Record<string, number> = {};

  constructor(opts: PlayerOpts) {
    super({
      gx: opts.gx,
      gy: opts.gy,
      hp: BASE_HP,
      mp: BASE_MP,
      atk: BASE_ATK,
      def: BASE_DEF,
      speed: BASE_SPEED,
      color: "#cfd8e3",
      critRate: 0.08,
      // 表现层二选一：
      // - 立绘模式（默认）：整体立绘 + 程序化律动（无接缝/无色差、翻滚整圈旋转）——长袍角色最优解
      // - 骨骼模式：AI 分体部件装配，腿/臂独立摆动，但有接缝/色差（素材级缺陷）；置 false 切换
      img: PLAYER_ROBE_ART ? ART.cutHanliRobe : ART.cutHanli,
      imgH: 80,
      skel: PLAYER_ROBE_ART ? undefined : "art/skel/hanli",
      // 骨骼模式不再传 skelFile：zhaolong.sk 资产本就不存在，且 .sk 需 laya.ani 运行时
      // （public/libs 里缺失、长期 404），传了只会先空等再回退。直接走部件骨架，无等待。
      skelFile: undefined,
      // —— Flipbook（Blender 3D→2D 序列帧）：已接入占位烘焙图集（tools/placeholder_hanli.blend → public/art/hanli_sheet.png）——
      // 占位仅为验证整条链路；真实韩立模型就绪后替换 .blend 重烘即可，此配置无需改动。
      sheet: {
        sheet: "art/hanli_sheet.png", cols: 20, rows: 5, // 100 格图集（20×5，受 4096 纹理上限约束），帧序 0..99
        clips: {
          idle:  { from: 0,  count: 16, fps: 8,  loop: true }, // 0..15
          walk:  { from: 16, count: 12, fps: 10, loop: true }, // 16..27
          attack:{ from: 28, count: 10, fps: 20, hit: 6 },     // 28..37（第 6 帧为打击帧）
          cast:  { from: 38, count: 16, fps: 10, loop: true }, // 38..53
          skill: { from: 54, count: 18, fps: 20, hit: 11 },    // 54..71
          hurt:  { from: 72, count: 6,  fps: 12 },             // 72..77
          death: { from: 78, count: 14, fps: 12 },             // 78..91
          dodge: { from: 92, count: 8,  fps: 20 },             // 92..99
        },
      },
      seed: opts.seed,
    });
    this.nickname = opts.nickname || "无名散修";
    this.forgeRng = makeRng((opts.seed ?? 20240918) ^ 0x5bf03);
    this.alembicRng = makeRng((opts.seed ?? 20240918) ^ 0x9c1a3);
    this.captureRng = makeRng((opts.seed ?? 20240918) ^ 0x6b0a5);
    this.arenaRng = makeRng((opts.seed ?? 20240918) ^ 0x51a3e);
    this.affixRng = makeRng((opts.seed ?? 20240918) ^ 0x7a3c1);
    this.root = rollRoot(opts.seed ?? 20240918);
  }

  // —— 境界成长 ——
  /** 当前世境界表（第一世 REALMS，飞升后为 ASCEND_REALMS） */
  private realmTable(): RealmDef[] { return this.reincarnations >= 1 ? ASCEND_REALMS : REALMS; }
  /** 当前世当前境界定义 */
  private currentRealm(): RealmDef { return this.realmTable()[this.realmIndex]; }
  /** 跨世全局境界档位（战力评分单调递增用） */
  get realmTier(): number { return this.reincarnations * 100 + this.realmIndex; }
  get realmIndex(): number {
    // 境界封顶：未渡天劫的大境界不生效，逼出「渡劫」仪式（修仙灵魂）
    const tbl = this.realmTable();
    const raw = realmIndexIn(this.exp, tbl);
    let r = raw;
    while (r > 0 && tbl[r].tribulation && !this.brokenRealms[r]) r--;
    return r;
  }
  get realmName(): string {
    return this.currentRealm().name;
  }

  /**
   * 已穿戴装备提供的某项属性（含炼器加成 + 随机词条 + 套装 n 件套效果）。
   * 遍历装备同时统计套装件数，O(装备数) 常量，不影响 effAtk 高频调用。
   */
  private equipStat(key: "atk" | "def" | "spd" | "crit"): number {
    let v = 0;
    const setCount: Record<string, number> = {};
    for (const id of Object.values(this.equipment)) {
      if (!id) continue;
      const def = getItem(id);
      if (!def) continue;
      const rar = getRarity(this.rarities[id] || "common");
      v += (def[key] || 0) * rar.statMul;
      v += forgeBonusOf(id, this.forge[id] || 0)[key];
      const af = this.affixes[id];
      if (af && typeof af[key] === "number") v += af[key] as number;
      const gid = this.gems[id];
      if (gid) { const g = getGem(gid); if (g && (g.key === "atk" || g.key === "def" || g.key === "spd" || g.key === "crit")) v += g.val; }
      if (def.set) setCount[def.set] = (setCount[def.set] || 0) + 1;
    }
    for (const sid in setCount) {
      const set = SETS[sid];
      if (!set) continue;
      for (const piece of set.pieces) {
        if (setCount[sid] >= piece.need && piece.effect[key] != null) v += piece.effect[key]!;
      }
    }
    return v;
  }

  /** 词条吸血总和（普攻/技能命中按伤害比例回血） */
  get lifestealTotal(): number {
    let v = 0;
    for (const id of Object.values(this.equipment)) {
      if (!id) continue;
      const af = this.affixes[id];
      if (af) v += af.lifesteal || 0;
      const gid = this.gems[id];
      if (gid) { const g = getGem(gid); if (g && g.key === "lifesteal") v += g.val; }
    }
    return v;
  }
  /** 当前流派天赋共鸣分支（强化对应分支效果；P3-3） */
  get schoolSynergy(): TalentBranch | undefined {
    return getSchool(this.school)?.synergy;
  }
  /** 某天赋分支是否受当前流派共鸣加成（P3-3） */
  private talentSynergyMul(branch: TalentBranch): number {
    return this.schoolSynergy === branch ? TALENT_SYNERGY_MUL : 1;
  }
  /** 天赋树某项属性总和（各节点已加点数 × 每点效果 × 流派共鸣倍率） */
  private talentStat(key: "atk" | "def" | "hp" | "crit" | "spd"): number {
    let v = 0;
    for (const id in this.talents) {
      const n = getTalent(id);
      if (n && n.effect[key] != null) {
        v += n.effect[key]! * this.talents[id] * this.talentSynergyMul(n.branch);
      }
    }
    return v;
  }
  /** 已装备法宝的某项被动属性（0 = 未装备/无法宝） */
  private artifactStat(key: "atk" | "def" | "hp" | "crit" | "spd"): number {
    if (!this.artifact) return 0;
    const a = getArtifact(this.artifact);
    return (a && a[key]) || 0;
  }
  private equipAtk(): number {
    return this.equipStat("atk");
  }
  private equipDef(): number {
    return this.equipStat("def");
  }
  private equipSpd(): number {
    return this.equipStat("spd");
  }

  private rootMul(): { atk: number; def: number; spd: number; crit: number } {
    return rootMulOf(this.root);
  }
  private schoolMul(): { atk: number; def: number; spd: number; crit: number } {
    const p = getSchool(this.school)?.passive;
    return { atk: p?.atk || 0, def: p?.def || 0, spd: p?.spd || 0, crit: p?.crit || 0 };
  }
  override get effAtk(): number {
    const base = (BASE_ATK + this.currentRealm().atk + this.equipAtk() + atkBonus(this.buffs) + this.talentStat("atk") + this.artifactStat("atk") + this.beastBonus().atk) * this.growthMul;
    return base * (1 + this.rootMul().atk + this.schoolMul().atk);
  }
  override get effDef(): number {
    const base = (BASE_DEF + this.currentRealm().def + this.equipDef() + super.effDef - this.baseDef + this.talentStat("def") + this.artifactStat("def") + this.beastBonus().def) * this.growthMul;
    return base * (1 + this.rootMul().def + this.schoolMul().def);
  }
  override get effSpeed(): number {
    return super.effSpeed * (1 + this.equipSpd() + this.talentStat("spd") + this.artifactStat("spd") + this.rootMul().spd + this.schoolMul().spd) * this.tribMul;
  }
  get critRateTotal(): number {
    return this.critRate + this.equipStat("crit") + this.talentStat("crit") + this.artifactStat("crit") + this.rootMul().crit + this.schoolMul().crit;
  }
  /** 战力评分：聚合攻防血速暴 + 境界/天赋/法宝贡献，给玩家明确数值锚 */
  get fightPower(): number {
    const dmg = this.effAtk * (1 + this.critRateTotal * 0.5);
    const score = dmg * 2 + this.effDef * 3 + this.maxHp * 0.5 + this.effSpeed * 20
      + this.realmTier * 200 + this.talentPoints * 5 + (this.artifact ? 300 : 0);
    return Math.round(score);
  }
  /** 境界突破时按成长上限补满气血灵力（含渡劫/飞升永久加成 growthMul） */
  private applyRealmCaps(): void {
    const r = this.currentRealm();
    const m = this.growthMul;
    this.maxHp = Math.round((BASE_HP + r.hp + this.talentStat("hp") + this.artifactStat("hp") + this.beastBonus().hp) * m);
    this.maxMp = Math.round((BASE_MP + r.mp) * m);
  }

  /** 渡劫加成：每成功一次永久 +6% 属性 */
  get tribMul(): number { return 1 + 0.06 * this.tribStacks; }
  /** 飞升继承加成：每转世 +12% 属性（第一世为 1） */
  get inheritMul(): number { return 1 + 0.12 * this.reincarnations; }
  /** 综合成长倍率（天劫 + 飞升继承） */
  get growthMul(): number { return this.tribMul * this.inheritMul; }
  /** 是否有待渡天劫 */
  hasPendingTribulation(): boolean { return this.pendingTribulation > 0; }
  /** 是否满足飞升条件：未达转世上限 + 当前世已至顶境（天劫已渡） */
  get canAscend(): boolean {
    if (this.reincarnations >= MAX_REINCARNATIONS) return false;
    const tbl = this.realmTable();
    const last = tbl.length - 1;
    return this.realmIndex >= last && this.exp >= tbl[last].expNeed && !this.hasPendingTribulation();
  }
  /** 待渡天劫境界名（无则空串） */
  tribulationRealmName(): string { return this.pendingTribulation > 0 ? this.realmTable()[this.pendingTribulation].name : ""; }

  /** 重算待渡天劫：取「已达且未渡」的最高天劫境 */
  private updatePendingTribulation(): void {
    const raw = realmIndexIn(this.exp, this.realmTable());
    let pending = 0;
    for (let i = raw; i >= 0; i--) {
      if (this.realmTable()[i].tribulation && !this.brokenRealms[i]) { pending = i; break; }
    }
    this.pendingTribulation = pending;
  }

  /** 天劫成功率：当前战力对该境界基准的比值（0.35~0.97，越弱越凶险） */
  private tribulationChance(realm: number): number {
    const r = this.realmTable()[realm];
    const base = r.atk + r.def + r.hp * 0.1 + r.mp * 0.05;
    const mine = this.effAtk + this.effDef + this.maxHp * 0.1 + this.maxMp * 0.05;
    const ratio = mine / Math.max(1, base);
    return Math.max(0.35, Math.min(0.97, 0.35 + 0.62 * Math.min(1, ratio)));
  }

  /**
   * 结算天劫：rng 返回 [0,1)。成功率由战力决定。
   * 成功：标记已渡、tribStacks++（永久 +6%）、补满并发放该境界天赋点；
   * 失败：温和惩罚（损失当前气血 40%，不掉级不扣修为），可再渡。
   */
  resolveTribulation(rng: () => number): { success: boolean; realm: number; chance: number; stacks: number } {
    const realm = this.pendingTribulation;
    if (realm <= 0) return { success: false, realm: 0, chance: 0, stacks: this.tribStacks };
    const chance = this.tribulationChance(realm);
    const success = rng() < chance;
    if (success) {
      const before = this.realmIndex;
      this.brokenRealms[realm] = true;
      this.tribStacks++;
      const after = this.realmIndex;
      if (after > before) this.talentPoints += (after - before) * TALENT_POINTS_PER_REALM;
      this.applyRealmCaps();
      this.hp = this.maxHp;
      this.mp = this.maxMp;
      this.updatePendingTribulation();
    } else {
      const loss = Math.ceil(this.hp * 0.4);
      this.hp = Math.max(1, this.hp - loss);
    }
    return { success, realm, chance, stacks: this.tribStacks };
  }

  /** 获得修为，返回是否发生（非天劫）境界突破 */
  gainExp(n: number): boolean {
    const before = this.realmIndex;
    this.exp += Math.round(n * this.sectExpMul() * this.expMulNg);
    this.updatePendingTribulation();
    const after = this.realmIndex;
    let broke = false;
    if (after > before) {
      this.talentPoints += (after - before) * TALENT_POINTS_PER_REALM; // 突破发天赋点
      this.applyRealmCaps();
      this.hp = this.maxHp;
      this.mp = this.maxMp;
      broke = true;
    }
    this.checkAchievements();
    return broke;
  }

  /**
   * 飞升转世：开启第二世。保留装备/灵兽/天赋/法宝/修为(exp)等积累，
   * 重置本世天劫进度，并获永久继承加成（inheritMul）。返回是否成功与当前世数。
   */
  reincarnate(): { ok: boolean; life: number } {
    if (!this.canAscend) return { ok: false, life: this.reincarnations + 1 };
    this.reincarnations += 1;
    // 修为(exp)继承；重置本世天劫判定（brokenRealms 按最大境界表定长）
    this.brokenRealms = new Array(MAX_REALM_LEN).fill(false);
    this.pendingTribulation = 0;
    this.applyRealmCaps();
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    this.updatePendingTribulation();
    return { ok: true, life: this.reincarnations + 1 };
  }

  // —— 技能 ——
  skillInSlot(i: number): SkillDef | null {
    const id = this.equipped[i];
    return id ? getSkill(id) || null : null;
  }
  cdOf(id: string): number {
    return this.cds[id] || 0;
  }

  /** 发起施法（扣蓝、进入前摇）。条件不满足返回 false。 */
  startCast(slot: number): boolean {
    const skill = this.skillInSlot(slot);
    if (!skill) return false;
    if (this.casting) return false;
    if (this.blocking) return false; // 格挡姿态不可施法
    if (this.cdOf(skill.id) > 0) return false;
    if (this.mp < skill.mpCost) return false;
    this.mp -= skill.mpCost;
    this.casting = { skill, t: 0 };
    // 招牌技能（御剑术）用专属骨骼动作 "skill"，其余走通用 "cast"
    this.setState(skill.id === SIGNATURE_SKILL_ID ? "skill" : "cast");
    return true;
  }

  learnSkill(id: string): boolean {
    if (this.learned.includes(id)) return false;
    if (!getSkill(id)) return false;
    this.learned.push(id);
    if (!this.codex.skillsLearned.includes(id)) this.codex.skillsLearned.push(id);
    // 自动填入第一个空槽
    const empty = this.equipped.findIndex((s) => s === null);
    if (empty >= 0) this.equipped[empty] = id;
    this.checkAchievements();
    return true;
  }

  equipSkill(slot: number, id: string): boolean {
    if (slot < 0 || slot > 3) return false;
    if (!this.learned.includes(id)) return false;
    this.equipped[slot] = id;
    return true;
  }

  // —— 天赋树 / 心法 ——
  talentUnlocked(id: string): boolean {
    const node = getTalent(id);
    return !!node && talentNodeUnlocked(node, this.talents, this.realmIndex);
  }
  /** 消耗天赋点加点；气血类天赋即时补足气血上限差额 */
  spendTalent(id: string): { ok: boolean; reason?: string } {
    const node = getTalent(id);
    if (!node) return { ok: false, reason: "无此天赋" };
    const rank = this.talents[id] || 0;
    if (rank >= node.max) return { ok: false, reason: "已至圆满" };
    if (this.talentPoints < node.cost) return { ok: false, reason: "天赋点不足" };
    if (!this.talentUnlocked(id)) return { ok: false, reason: "未满足前置" };
    this.talentPoints -= node.cost;
    this.talents[id] = rank + 1;
    const before = this.maxHp;
    this.applyRealmCaps();
    if (this.maxHp > before) this.hp += this.maxHp - before;
    return { ok: true };
  }

  // —— 法宝 / 圣物 ——
  /** 获得法宝（去重并入袋，未装备时自动装备） */
  giveArtifact(id: string): boolean {
    if (!getArtifact(id)) return false;
    if (!this.ownedArtifacts.includes(id)) this.ownedArtifacts.push(id);
    if (!this.artifact) this.equipArtifact(id);
    this.checkAchievements();
    return true;
  }
  equipArtifact(id: string): boolean {
    if (!getArtifact(id) || !this.ownedArtifacts.includes(id)) return false;
    if (this.artifact === id) return false;
    const before = this.maxHp;
    this.artifact = id;
    this.learnSkill(getArtifact(id)!.skill); // 装备即学会主动技
    this.applyRealmCaps();
    if (this.maxHp > before) this.hp += this.maxHp - before;
    return true;
  }
  unequipArtifact(): boolean {
    if (!this.artifact) return false;
    this.artifact = null;
    this.applyRealmCaps();
    this.hp = Math.min(this.hp, this.maxHp);
    return true;
  }

  // —— 图鉴 ——
  /** 记录见过的怪物（Game 在刷怪/选中时调用） */
  noteMonsterSeen(id: string): void {
    if (id && !this.codex.monstersSeen.includes(id)) this.codex.monstersSeen.push(id);
  }

  // —— 成就 ——
  private achSnapshot(): AchSnapshot {
    let forgeMax = 0;
    for (const id in this.forge) forgeMax = Math.max(forgeMax, this.forge[id]);
    return {
      kills: this.kills,
      realmIndex: this.realmIndex,
      forgeMax,
      codexKill: this.codex.monstersKilled.length,
      codexItem: this.codex.itemsGot.length,
      codexSkill: this.codex.skillsLearned.length,
      stones: this.stones,
      questsDone: this.quests.done.length,
      artifacts: this.ownedArtifacts.length,
      chapter: this.chapter,
    };
  }
  /** 扫描并解锁新达成成就，返回本次新解锁 id（调用方可用于弹提示） */
  checkAchievements(): string[] {
    const snap = this.achSnapshot();
    const newly: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.achievements.unlocked.includes(a.id)) continue;
      if (achMet(a, snap)) {
        this.achievements.unlocked.push(a.id);
        newly.push(a.id);
      }
    }
    return newly;
  }
  /** 领取成就奖励（一次性） */
  claimAchievement(id: string): { ok: boolean; reason?: string } {
    if (!this.achievements.unlocked.includes(id)) return { ok: false, reason: "尚未达成" };
    if (this.achievements.claimed.includes(id)) return { ok: false, reason: "已领取" };
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return { ok: false, reason: "无此成就" };
    this.achievements.claimed.push(id);
    if (a.reward.exp) this.gainExp(a.reward.exp);
    if (a.reward.stones) this.gainStones(a.reward.stones);
    return { ok: true };
  }

  // —— 日常任务 ——
  /** 按今天日期刷新日常（跨天重置，同日幂等） */
  refreshDaily(today: string): void {
    if (this.daily.date === today) return;
    this.daily.date = today;
    this.daily.ids = rollDailies(today);
    this.daily.progress = {};
    this.daily.claimed = [];
  }
  /** 推进某类日常进度（自动夹紧到目标值） */
  bumpDaily(kind: DailyKind, n: number): void {
    for (const id of this.daily.ids) {
      const d = getDaily(id);
      if (!d || d.kind !== kind) continue;
      if (this.daily.claimed.includes(id)) continue;
      this.daily.progress[id] = Math.min(d.goal, (this.daily.progress[id] || 0) + n);
    }
  }
  /** 领取日常奖励（需完成且未领） */
  claimDaily(id: string): { ok: boolean; reason?: string } {
    if (!this.daily.ids.includes(id)) return { ok: false, reason: "非今日日常" };
    const d = getDaily(id);
    if (!d) return { ok: false, reason: "无此日常" };
    if (this.daily.claimed.includes(id)) return { ok: false, reason: "已领取" };
    if ((this.daily.progress[id] || 0) < d.goal) return { ok: false, reason: "未完成" };
    this.daily.claimed.push(id);
    if (d.reward.exp) this.gainExp(d.reward.exp);
    if (d.reward.stones) this.gainStones(d.reward.stones);
    return { ok: true };
  }

  // —— 限时活动（p1-events）——
  /** 当前生效活动 id（基于注入时钟，便于测试） */
  activeEventIds(now: number): string[] { return activeEvents(now).map((e) => e.id); }
  hasActiveEvent(id: string, now: number): boolean { return this.activeEventIds(now).includes(id); }
  /** 击杀收益倍率：所有生效 double 活动相乘（默认 1） */
  eventKillMul(now: number): number {
    let m = 1;
    for (const e of activeEvents(now)) if (e.type === "double" && e.mult) m *= e.mult;
    return m;
  }
  /** 登录活动：当日首次进入自动发放（幂等，每日一次） */
  claimLoginEvents(now: number, day: string): { id: string; reward: { exp?: number; stones?: number } }[] {
    const out: { id: string; reward: { exp?: number; stones?: number } }[] = [];
    for (const e of activeEvents(now)) {
      if (e.type !== "login" || !e.reward) continue;
      if (this.eventClaims[e.id] === day) continue;
      this.eventClaims[e.id] = day;
      if (e.reward.exp) this.gainExp(e.reward.exp);
      if (e.reward.stones) this.gainStones(e.reward.stones);
      out.push({ id: e.id, reward: e.reward });
    }
    return out;
  }

  // —— 社交系统（p1-social）——
  /** 宗门修炼堂/藏经阁：修为获取加成（默认 1） */
  sectExpMul(): number {
    return 1 + (this.sectBuildings["xiu-lian-tang"] || 0) * 0.03 + (this.sectBuildings["cang-jing-ge"] || 0) * 0.02;
  }
  /** 宗门战功堂/藏经阁：灵石获取加成（默认 1） */
  sectStoneMul(): number {
    return 1 + (this.sectBuildings["zhan-gong-tang"] || 0) * 0.05 + (this.sectBuildings["cang-jing-ge"] || 0) * 0.02;
  }
  /** 宗门贡献（击杀/任务累积，可花在宗门建筑） */
  addSectContribution(n: number): void { this.sectContribution += Math.max(0, n); }

  private grantSocial(r: { exp?: number; stones?: number; items?: { id: string; n: number }[] }): void {
    if (r.exp) this.gainExp(r.exp);
    if (r.stones) this.gainStones(r.stones);
    if (r.items) for (const it of r.items) this.addItem(it.id, it.n);
  }

  // ================= P3-6 社交实时化：玩家间邮件 =================
  /** 用服务端收件箱覆盖本地缓存 */
  syncMailbox(inbox: MailItem[]): void {
    if (Array.isArray(inbox)) this.mailbox = inbox.map((m) => ({ ...m }));
  }
  /** 标记本地某封邮件已领取（服务端已确保不重领，此处仅更新 UI 状态） */
  markMailClaimed(id: number): void {
    const m = this.mailbox.find((x) => x.id === id);
    if (m) m.claimed = true;
  }
  /** 应用邮件奖励（来自服务端领取响应；服务端已防重领） */
  applyMailReward(r?: { exp?: number; stones?: number; items?: { id: string; n: number }[] }): void {
    if (!r) return;
    if (r.exp) this.gainExp(r.exp);
    if (r.stones) this.gainStones(r.stones);
    if (r.items) for (const it of r.items) this.addItem(it.id, it.n);
  }

  /** 好友论道：每日一次，好感 +1（封顶），奖励按好感分档放大 */
  interactFriend(id: string, day: string): { ok: boolean; reason?: string; reward?: any } {
    const def: NpcFriend | undefined = NPC_FRIENDS.find((f) => f.id === id);
    if (!def) return { ok: false, reason: "无此好友" };
    const st = this.friends[id] || { affinity: 0, lastDay: "" };
    if (st.lastDay === day) return { ok: false, reason: "今日已论道" };
    st.affinity = Math.min(FRIEND_CAP, st.affinity + 1);
    st.lastDay = day;
    this.friends[id] = st;
    const tier = Math.floor(st.affinity / FRIEND_TIER) + 1;
    const reward = {
      exp: def.base.exp ? def.base.exp * tier : undefined,
      stones: def.base.stones ? def.base.stones * tier : undefined,
      items: def.base.items,
    };
    this.grantSocial(reward);
    return { ok: true, reward };
  }
  /** 结缘：依当前好感选取最高可达结局并落档（复用 social.FRIEND_ENDINGS），返回对应对话节点 id */
  requestFriendEnding(id: string): { ok: boolean; endingId?: string; nodeId?: string; reason?: string } {
    const def = NPC_FRIENDS.find((f) => f.id === id);
    if (!def) return { ok: false, reason: "无此好友" };
    const affinity = (this.friends[id] && this.friends[id].affinity) || 0;
    const candidates = FRIEND_ENDINGS.filter((e) => e.friendId === id && e.minAffinity <= affinity);
    if (candidates.length === 0) return { ok: false, reason: "尚无结局" };
    candidates.sort((a, b) => b.minAffinity - a.minAffinity);
    const chosen = candidates[0];
    this.friendEnding[id] = chosen.id;
    return { ok: true, endingId: chosen.id, nodeId: chosen.nodeId };
  }
  /** 导出社交档案（供云同步 PUT） */
  exportSocial(): SocialProfile {
    return {
      friends: JSON.parse(JSON.stringify(this.friends)),
      friendEnding: { ...this.friendEnding },
      mailsClaimed: [...this.mailsClaimed],
      sectContribution: this.sectContribution,
      sectBuildings: { ...this.sectBuildings },
    };
  }
  /** 应用云端社交档案（云优先：逐字段覆盖，缺省保留本地） */
  applySocial(p: Partial<SocialProfile> | null | undefined): void {
    if (!p || typeof p !== "object") return;
    if (p.friends && typeof p.friends === "object") this.friends = JSON.parse(JSON.stringify(p.friends));
    if (p.friendEnding && typeof p.friendEnding === "object") this.friendEnding = { ...p.friendEnding };
    if (Array.isArray(p.mailsClaimed)) this.mailsClaimed = p.mailsClaimed.filter((x) => typeof x === "string");
    if (typeof p.sectContribution === "number" && isFinite(p.sectContribution)) this.sectContribution = Math.max(0, Math.floor(p.sectContribution));
    if (p.sectBuildings && typeof p.sectBuildings === "object") this.sectBuildings = { ...p.sectBuildings };
  }
  /** 当前可领取（已解锁且未领）的邮件 */
  unclaimedMails(realmIndex: number): MailDef[] {
    return MAILS.filter((m) => (m.needRealm || 0) <= realmIndex && !this.mailsClaimed.includes(m.id));
  }
  /** 领取邮件奖励（需达到解锁境界且未领） */
  claimMail(id: string): { ok: boolean; reason?: string; reward?: any } {
    const m = MAILS.find((x) => x.id === id);
    if (!m) return { ok: false, reason: "无此邮件" };
    if ((m.needRealm || 0) > this.realmIndex) return { ok: false, reason: "尚未解锁" };
    if (this.mailsClaimed.includes(id)) return { ok: false, reason: "已领取" };
    this.mailsClaimed.push(id);
    this.grantSocial(m.reward);
    return { ok: true, reward: m.reward };
  }
  /** 宗门建筑当前等级 */
  sectBuildingLv(id: string): number { return this.sectBuildings[id] || 0; }
  /** 升级宗门建筑（花费随等级递增的贡献） */
  upgradeSectBuilding(id: string): { ok: boolean; reason?: string } {
    const def = SECT_BUILDINGS.find((b) => b.id === id);
    if (!def) return { ok: false, reason: "无此建筑" };
    const lv = this.sectBuildingLv(id);
    if (lv >= def.maxLv) return { ok: false, reason: "已达满级" };
    const cost = def.costPerLv * (lv + 1);
    if (this.sectContribution < cost) return { ok: false, reason: "贡献不足" };
    this.sectContribution -= cost;
    this.sectBuildings[id] = lv + 1;
    return { ok: true };
  }
  /** 门派大比（PVE 演练）：确定性结算，每日一次；胜则获贡献+灵石+修为 */
  sectWar(day: string): { ok: boolean; reason?: string; win?: boolean; reward?: any } {
    if (this.sectWarDay === day) return { ok: false, reason: "今日已参与门派大比" };
    this.sectWarDay = day;
    const rng = sectWarRng(day);
    const boss = Math.round(this.fightPower * (0.9 + 0.4 * rng()));
    const roll = this.fightPower * (0.8 + 0.5 * rng());
    const win = roll >= boss;
    if (win) {
      const reward = { exp: 200, stones: 80, contribution: 20 };
      this.gainExp(reward.exp);
      this.gainStones(reward.stones);
      this.addSectContribution(reward.contribution);
      return { ok: true, win: true, reward };
    }
    return { ok: true, win: false };
  }

  // —— 背包 / 装备 ——
  countItem(id: string): number {
    return this.inv.get(id) || 0;
  }

  /** 为某装备 roll 词条（首次获得时调用），结果按装备 id 玩家级共享；count = 词缀条数（由品质决定） */
  private rollAffixes(id: string, count: number): AffixInstance {
    const def = getItem(id);
    const pool = (def?.affixes && def.affixes.length
      ? def.affixes
      : AFFIX_POOL.map((a) => a.id)
    ).map((aid) => AFFIX_POOL.find((a) => a.id === aid)).filter(Boolean) as AffixDef[];
    const res: AffixInstance = {};
    if (pool.length === 0 || count <= 0) return res;
    const picks = new Set<string>();
    let guard = 0;
    while (picks.size < count && guard++ < 12) {
      const a = pool[Math.floor(this.affixRng() * pool.length)];
      if (a) picks.add(a.id);
    }
    for (const aid of picks) {
      const a = AFFIX_POOL.find((x) => x.id === aid);
      if (!a) continue;
      const val = a.min + this.affixRng() * (a.max - a.min);
      const decimals = a.key === "atk" || a.key === "def" ? 0 : 3;
      (res as Record<string, number>)[a.key] = decimals ? Number(val.toFixed(decimals)) : Math.round(val);
    }
    return res;
  }

  addItem(id: string, n: number, rarityBias = 0): number {
    const def = getItem(id);
    if (!def || n <= 0) return 0;
    const cur = this.inv.get(id) || 0;
    const add = Math.min(n, def.stack - cur);
    if (add <= 0) return 0;
    this.inv.set(id, cur + add);
    // 首次获得装备 → 滚品质 + 词条（按 id 共享，重复获得/装卸不重滚；rarityBias 越高越易出高品质）
    if (cur === 0 && isEquipment(id) && !this.rarities[id]) {
      const r = rollRarity(this.affixRng, rarityBias);
      this.rarities[id] = r;
      this.affixes[id] = this.rollAffixes(id, getRarity(r).affixes);
    }
    // 图鉴：首次获得入册
    if (cur === 0 && !this.codex.itemsGot.includes(id)) this.codex.itemsGot.push(id);
    return add;
  }

  /** 装备品质查询（UI 着色用），未记录则凡品 */
  rarityOf(id: string): Rarity {
    return this.rarities[id] || "common";
  }

  removeItem(id: string, n: number): boolean {
    const cur = this.inv.get(id) || 0;
    if (cur < n) return false;
    if (cur === n) this.inv.delete(id);
    else this.inv.set(id, cur - n);
    return true;
  }

  /** 使用消耗品：返回实际效果描述（null = 不可用） */
  useConsumable(id: string): string | null {
    const def = getItem(id);
    if (!def || def.type !== "consumable") return null;
    if (this.countItem(id) <= 0) return null;
    let msg = "";
    if (def.heal) msg += `气血+${this.heal(def.heal)} `;
    if (def.mp) {
      const before = this.mp;
      this.mp = Math.min(this.maxMp, this.mp + def.mp);
      msg += `灵力+${Math.round(this.mp - before)} `;
    }
    if (def.exp) msg += `修为+${def.exp}${this.gainExp(def.exp) ? "（突破！）" : ""}`;
    this.removeItem(id, 1);
    return msg.trim() || "使用了道具";
  }

  equip(id: string): boolean {
    if (!isEquipment(id)) return false;
    if (this.countItem(id) <= 0) return false;
    const slot = getItem(id)!.slot as EquipSlot;
    if (this.equipment[slot] === id) return false;
    if (this.equipment[slot]) this.unequip(slot);
    this.removeItem(id, 1);
    this.equipment[slot] = id;
    return true;
  }

  unequip(slot: EquipSlot): boolean {
    const id = this.equipment[slot];
    if (!id) return false;
    delete this.equipment[slot];
    this.addItem(id, 1);
    return true;
  }

  // —— 宝石镶嵌 / 洗练 ——
  /** 是否持有某装备（已穿戴或在背包） */
  private ownsEquip(id: string): boolean {
    return Object.values(this.equipment).includes(id) || this.countItem(id) > 0;
  }
  /** 镶嵌宝石到装备（部位须匹配，旧宝石回收背包） */
  socketGem(equipId: string, gemId: string): { ok: boolean; reason?: string } {
    const g = getGem(gemId);
    if (!g) return { ok: false, reason: "无此宝石" };
    const def = getItem(equipId);
    if (!def) return { ok: false, reason: "无此装备" };
    if (def.slot !== g.slot) return { ok: false, reason: "部位不符" };
    if (!this.ownsEquip(equipId)) return { ok: false, reason: "未持有该装备" };
    if (this.countItem(gemId) <= 0) return { ok: false, reason: "宝石不足" };
    const prev = this.gems[equipId];
    if (prev) this.addItem(prev, 1);
    this.removeItem(gemId, 1);
    this.gems[equipId] = gemId;
    return { ok: true };
  }
  /** 卸下装备上的宝石（回收背包） */
  unsocketGem(equipId: string): { ok: boolean; reason?: string } {
    const g = this.gems[equipId];
    if (!g) return { ok: false, reason: "未镶嵌宝石" };
    this.addItem(g, 1);
    this.gems[equipId] = null;
    return { ok: true };
  }
  /** 洗练：消耗灵石重滚该装备词条（复用独立 affixRng，结果玩家级共享） */
  refine(id: string): { ok: boolean; reason?: string } {
    if (!isEquipment(id)) return { ok: false, reason: "非装备" };
    if (!this.ownsEquip(id)) return { ok: false, reason: "未持有该装备" };
    if (this.stones < REFINE_COST) return { ok: false, reason: "灵石不足" };
    this.stones -= REFINE_COST;
    this.affixes[id] = this.rollAffixes(id, getRarity(this.rarities[id] || "common").affixes);
    return { ok: true };
  }
  /** 切换功法流派：装备其技能组并叠加被动 */
  setSchool(id: string): { ok: boolean; reason?: string } {
    const sc = getSchool(id);
    if (!sc) return { ok: false, reason: "无此功法" };
    this.school = id;
    for (const sid of sc.skills) if (!this.learned.includes(sid)) this.learned.push(sid);
    this.equipped = [...sc.skills].slice(0, 4);
    return { ok: true };
  }

  // —— 战令 / 月卡 / 签到 ——
  /** 每日签到（today 形如 2026-10-22）；今天未签才记并发奖 */
  signIn(today: string): { ok: boolean; reason?: string; stones?: number; exp?: number } {
    if (!today) return { ok: false, reason: "日期无效" };
    if (this.battlePass.signinDays.includes(today)) return { ok: false, reason: "今日已签到" };
    const idx = this.battlePass.signinDays.length + 1;
    const r = signinRewardOf(idx);
    this.battlePass.signinDays.push(today);
    if (r.stones) this.gainStones(r.stones);
    if (r.exp) this.gainExp(r.exp);
    return { ok: true, stones: r.stones, exp: r.exp };
  }
  /** 领取战令档位：活跃天数(=签到天数)达标且未领 */
  claimTier(tier: number): { ok: boolean; reason?: string; reward?: BpReward } {
    const t = getTier(tier);
    if (!t) return { ok: false, reason: "无此档位" };
    if (this.battlePass.claimed.includes(tier)) return { ok: false, reason: "已领取" };
    if (this.battlePass.signinDays.length < tier) return { ok: false, reason: "活跃天数不足" };
    this.battlePass.claimed.push(tier);
    this.applyBpReward(t.reward);
    return { ok: true, reward: t.reward };
  }
  /** 激活月卡：now 为当前时间戳(ms)，激活后 30 天每日可领 */
  activateMonthCard(now: number): { ok: boolean } {
    this.battlePass.monthCardUntil = now + MONTH_CARD_DAYS * 86400000;
    return { ok: true };
  }
  /** 领取月卡每日奖励：有效期内且今天未领 */
  claimMonthCard(today: string, now: number): { ok: boolean; reason?: string; stones?: number } {
    if (now > this.battlePass.monthCardUntil) return { ok: false, reason: "月卡已过期" };
    if (this.battlePass.monthCardClaimed.includes(today)) return { ok: false, reason: "今日已领" };
    this.battlePass.monthCardClaimed.push(today);
    this.gainStones(MONTH_CARD_STONES);
    return { ok: true, stones: MONTH_CARD_STONES };
  }
  private applyBpReward(r: BpReward): void {
    if (r.stones) this.gainStones(r.stones);
    if (r.exp) this.gainExp(r.exp);
    if (r.item && r.itemN) this.addItem(r.item, r.itemN);
  }

  // —— 离线收益（放置类核心：按上次活跃时间折算修为/灵石，封顶 12h）——
  /** 标记当前为活跃时刻（存档/上线时调用） */
  markActive(): void {
    this.lastSeen = Date.now();
  }
  /** 每秒离线产出（基于境界，确定性） */
  private offlineRates(): { exp: number; stones: number } {
    const idx = realmIndexOf(this.exp); // 0..REALMS.length-1
    return { exp: 3 + idx * 1.5, stones: 1.5 + idx * 0.7 };
  }
  /**
   * 结算离线收益：elapsed = now - lastSeen（lastSeen<=0 视为首次，不计）。
   * 封顶 12h；月卡生效期间 ×1.2；直接并入修为/灵石（复用既有 gain*）。
   * 返回 { exp, stones, hours } 供面板展示；无收益返回 null。
   */
  collectOffline(now: number): { exp: number; stones: number; hours: number } | null {
    if (this.lastSeen <= 0) { this.lastSeen = now; return null; }
    let elapsed = Math.max(0, Math.floor((now - this.lastSeen) / 1000));
    if (elapsed <= 0) { this.lastSeen = now; return null; }
    const CAP = 12 * 3600;
    const capped = Math.min(elapsed, CAP);
    const mult = this.battlePass.monthCardUntil >= now ? 1.2 : 1;
    const r = this.offlineRates();
    const exp = Math.floor(r.exp * capped * mult);
    const stones = Math.floor(r.stones * capped * mult);
    this.lastSeen = now;
    if (exp > 0) this.gainExp(exp);
    if (stones > 0) this.gainStones(stones);
    return { exp, stones, hours: capped / 3600 };
  }

  // —— 灵石 / 坊市 ——
  gainStones(n: number): number {
    const add = Math.max(0, Math.floor(n * this.sectStoneMul()));
    this.stones += add;
    if (add > 0) {
      this.bumpDaily("earn", add);
      this.checkAchievements();
    }
    return add;
  }

  spendStones(n: number): boolean {
    if (n < 0 || this.stones < n) return false;
    this.stones -= n;
    return true;
  }

  /** 买入（按单价逐件入袋，背包满则只结算装得下的部分） */
  buyItem(id: string, n = 1): { ok: boolean; got: number; spent: number; reason?: string } {
    const price = buyPriceOf(id);
    if (!getItem(id) || price <= 0) return { ok: false, got: 0, spent: 0, reason: "此物不售" };
    const want = Math.max(1, Math.floor(n));
    if (this.stones < price) return { ok: false, got: 0, spent: 0, reason: "灵石不足" };
    const affordable = Math.min(want, Math.floor(this.stones / price));
    const got = this.addItem(id, affordable);
    if (got <= 0) return { ok: false, got: 0, spent: 0, reason: "储物袋已满" };
    const spent = price * got;
    this.stones -= spent;
    return { ok: true, got, spent };
  }

  /** 卖出（4 折回收） */
  sellItem(id: string, n = 1): { ok: boolean; sold: number; gained: number; reason?: string } {
    if (!canSell(id)) return { ok: false, sold: 0, gained: 0, reason: "此物无人收购" };
    const count = Math.min(Math.max(1, Math.floor(n)), this.countItem(id));
    if (count <= 0) return { ok: false, sold: 0, gained: 0, reason: "没有这件物品" };
    this.removeItem(id, count);
    const gained = sellPriceOf(id) * count;
    this.stones += gained;
    return { ok: true, sold: count, gained };
  }

  // —— 炼器 ——
  forgeLevel(id: string): number {
    return this.forge[id] || 0;
  }

  /** 强化一件装备：消耗灵石 + 妖丹，失败不掉级 */
  upgradeForge(id: string): { ok: boolean; success: boolean; level: number; reason?: string } {
    const lv = this.forgeLevel(id);
    if (!isEquipment(id)) return { ok: false, success: false, level: lv, reason: "此物不可炼器" };
    if (lv >= FORGE_MAX) return { ok: false, success: false, level: lv, reason: `已至圆满（+${FORGE_MAX}）` };
    const cost = forgeCostOf(lv);
    if (this.stones < cost.stones) return { ok: false, success: false, level: lv, reason: "灵石不足" };
    if (this.countItem("yaodan") < cost.yaodan) return { ok: false, success: false, level: lv, reason: "妖丹不足" };
    this.stones -= cost.stones;
    this.removeItem("yaodan", cost.yaodan);
    const success = this.forgeRng() < forgeRateOf(lv);
    if (success) {
      this.forge[id] = lv + 1;
      this.bumpDaily("forge", 1);
      this.checkAchievements();
    }
    return { ok: true, success, level: this.forgeLevel(id) };
  }

  // —— 炼丹 ——
  /** 炼丹成功率：随境界平缓提升（0.85 ~ 0.97），新手更宽容 */
  private alembicRate(): number {
    const idx = realmIndexOf(this.exp);
    return Math.min(0.97, 0.85 + idx * 0.015);
  }
  /** 按丹方炼制：rng 默认用独立 alembicRng（确定性可注入）。成功产出丹药；失败退还半数材料（灵石不退，体验优先）。 */
  alchemize(recipeId: string, rng: () => number = this.alembicRng): { ok: boolean; success: boolean; reason?: string; got?: { id: string; n: number } } {
    const r = ALEMBIC_RECIPES.find((x) => x.id === recipeId);
    if (!r) return { ok: false, success: false, reason: "无此丹方" };
    for (const ing of r.ingredients) {
      if (this.countItem(ing.id) < ing.n) return { ok: false, success: false, reason: `${getItem(ing.id)?.name ?? ing.id}不足` };
    }
    if (r.stones && this.stones < r.stones) return { ok: false, success: false, reason: "灵石不足" };
    const consumed: { id: string; n: number }[] = [];
    for (const ing of r.ingredients) { this.removeItem(ing.id, ing.n); consumed.push({ id: ing.id, n: ing.n }); }
    if (r.stones) this.stones -= r.stones;
    const success = rng() < this.alembicRate();
    if (success) {
      const n = this.addItem(r.out.id, r.out.n);
      this.bumpDaily("alchemy", 1);
      this.checkAchievements();
      return { ok: true, success: true, got: { id: r.out.id, n } };
    }
    // 失败：退还半数材料（向下取整），不退还灵石
    for (const c of consumed) {
      const back = Math.floor(c.n / 2);
      if (back > 0) this.addItem(c.id, back);
    }
    return { ok: true, success: false, reason: "丹炉炸裂，仅取回半数材料" };
  }

  // —— 灵兽 ——
  /** 出战灵兽被动加成（无出战则零） */
  beastBonus(): { atk: number; def: number; hp: number } {
    const b = this.activeBeast ? getBeast(this.activeBeast) : undefined;
    if (!b) return { atk: 0, def: 0, hp: 0 };
    return { atk: b.bonusAtk, def: b.bonusDef, hp: b.bonusHp };
  }
  addBeast(id: string): void {
    if (getBeast(id) && !this.beasts.includes(id)) this.beasts.push(id);
  }
  /** 设置出战灵兽（null 收回）；重算境界上限并夹紧当前气血/灵力 */
  setActiveBeast(id: string | null): void {
    if (id && !this.beasts.includes(id)) return;
    this.activeBeast = id;
    this.applyRealmCaps();
    this.hp = Math.min(this.hp, this.maxHp);
    this.mp = Math.min(this.mp, this.maxMp);
  }
  /** 收服妖兽为灵兽：rng 默认独立 captureRng（确定性可注入） */
  captureBeast(monsterId: string, rng: () => number = this.captureRng): { ok: boolean; beastId?: string; reason?: string } {
    const bid = CAPTURE_MAP[monsterId];
    if (!bid) return { ok: false, reason: "此妖兽不可收服" };
    if (this.beasts.includes(bid)) return { ok: false, reason: "已拥有该灵兽" };
    const rate = beastCaptureRate(monsterId);
    if (rng() < rate) { this.addBeast(bid); return { ok: true, beastId: bid }; }
    return { ok: false, reason: "妖兽挣脱了" };
  }

  // —— 竞技场 ——
  /** 本地排行榜为空时播种离线对手池（幂等）；同时校验积分/战绩默认值 */
  ensureArenaBoard(realmIndex: number): void {
    if (!Array.isArray(this.arenaBoard) || this.arenaBoard.length === 0) {
      this.arenaBoard = seedArenaBoard();
    }
    if (typeof this.arenaPoints !== "number" || this.arenaPoints < ARENA_MIN_POINTS) this.arenaPoints = 1000;
    this.arenaWins = this.arenaWins || 0;
    this.arenaLosses = this.arenaLosses || 0;
  }

  // —— 任务 ——
  startQuest(id: string): void {
    if (!QUESTS[id]) return;
    if (this.quests.active.includes(id) || this.quests.done.includes(id)) return;
    this.quests.active.push(id);
    this.quests.progress[id] = this.quests.progress[id] || 0;
  }

  /** 击杀计数；返回本次被完成的任务 id 列表（奖励已发放） */
  addKill(monsterId: string): string[] {
    this.kills++;
    // 图鉴首杀奖励
    if (monsterId && !this.codex.monstersKilled.includes(monsterId)) {
      this.codex.monstersKilled.push(monsterId);
      this.flags["codex_new"] = true;
      this.gainExp(20);
    }
    this.bumpDaily("kill", 1);
    this.addSectContribution(1);
    try { if (monsterId && getMonster(monsterId).demon) this.demonSlain++; } catch { /* 未知怪物不计入 */ }
    const completed: string[] = [];
    for (const qid of [...this.quests.active]) {
      const q = QUESTS[qid];
      if (!q || q.kill !== monsterId) continue;
      const p = (this.quests.progress[qid] || 0) + 1;
      this.quests.progress[qid] = p;
      if (p >= q.n) {
        this.quests.active = this.quests.active.filter((x) => x !== qid);
        this.quests.done.push(qid);
        this.flags["qdone_" + qid] = true; // 供 P3-7 分支判定（与对话交付统一）
        this.applyEffects(q.rewards);
        completed.push(qid);
        this.bumpDaily("quest", 1);
      }
    }
    this.checkAchievements();
    return completed;
  }

  /** 解释剧情效果（对话/任务奖励共用） */
  applyEffects(effects: StoryEffect[]): void {
    for (const e of effects) {
      switch (e.t) {
        case "giveItem": {
          const got = this.addItem(e.id, e.n);
          if (got < e.n) this.flags["bag_full_warn"] = true;
          break;
        }
        case "learnSkill":
          this.learnSkill(e.id);
          break;
        case "giveExp":
          this.gainExp(e.n);
          break;
        case "giveStones":
          this.gainStones(e.n);
          break;
        case "giveRep":
          this.gainRep(e.n);
          break;
        case "joinSect":
          this.sect = e.id;
          break;
        case "giveArtifact":
          this.giveArtifact(e.id);
          break;
        case "heal":
          this.heal(e.n);
          break;
        case "setFlag":
          this.flags[e.id] = e.v !== false;
          break;
        case "startQuest":
          this.startQuest(e.id);
          break;
        case "completeQuest":
          if (this.quests.active.includes(e.id)) {
            this.quests.active = this.quests.active.filter((x) => x !== e.id);
            this.quests.done.push(e.id);
            this.flags["qdone_" + e.id] = true; // 供 P3-7 分支判定
            this.applyEffects(QUESTS[e.id]?.rewards || []);
          }
          break;
        case "spawnBoss":
          this.flags["boss_spawned"] = true;
          break;
        case "win":
          this.flags[`ch${(e.chapter ?? 1)}_win`] = true;
          break;
      }
    }
  }

  /** P3-2 秘境遗物：整局持久增益（跨层保留，死亡清空） */
  addRogueRelic(b: Buff): void {
    this.buffs.push({ ...b, persistent: true });
    this.flags["rogue_relic"] = true;
  }
  clearRogueRelics(): void {
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      if (this.buffs[i].persistent) this.buffs.splice(i, 1);
    }
  }

  // —— 声望 / 宗门 ——
  gainRep(n: number): number {
    const add = Math.max(0, Math.floor(n));
    this.reputation += add;
    return add;
  }
  spendRep(n: number): boolean {
    if (n < 0 || this.reputation < n) return false;
    this.reputation -= n;
    return true;
  }

  // —— 建造 ——
  /** 放置建筑：记录并扣材料（材料不足/已占用则 false） */
  placeBuilding(id: string, gx: number, gy: number, orig: string, zone = "ch1"): boolean {
    if (this.built.some((b) => b.zone === zone && b.gx === gx && b.gy === gy)) return false;
    this.built.push({ zone, id, gx, gy, orig });
    return true;
  }
  removeBuiltAt(gx: number, gy: number, zone = "ch1"): BuiltRec | null {
    const i = this.built.findIndex((b) => b.zone === zone && b.gx === gx && b.gy === gy);
    if (i < 0) return null;
    const rec = this.built[i];
    this.built.splice(i, 1);
    return rec;
  }

  // —— 存档 ——
  serialize(): SaveState {
    return {
      v: 3,
      nickname: this.nickname,
      exp: this.exp,
      hp: this.hp,
      mp: this.mp,
      inv: [...this.inv.entries()],
      equipment: { ...this.equipment },
      learned: [...this.learned],
      equipped: [...this.equipped],
      quests: {
        active: [...this.quests.active],
        progress: { ...this.quests.progress },
        done: [...this.quests.done],
      },
      flags: { ...this.flags },
      kills: this.kills,
      playMs: this.playMs,
      built: this.built.map((b) => ({ ...b })),
      stones: this.stones,
      forge: { ...this.forge },
      affixes: { ...this.affixes },
      rarities: { ...this.rarities },
      gems: this.gems,
      chapter: this.chapter,
      unlockedZones: [...this.unlockedZones],
      reputation: this.reputation,
      sect: this.sect,
      talentPoints: this.talentPoints,
      talents: { ...this.talents },
      artifact: this.artifact,
      ownedArtifacts: [...this.ownedArtifacts],
      codex: {
        monstersSeen: [...this.codex.monstersSeen],
        monstersKilled: [...this.codex.monstersKilled],
        itemsGot: [...this.codex.itemsGot],
        skillsLearned: [...this.codex.skillsLearned],
      },
      achievements: { unlocked: [...this.achievements.unlocked], claimed: [...this.achievements.claimed] },
      daily: {
        date: this.daily.date,
        ids: [...this.daily.ids],
        progress: { ...this.daily.progress },
        claimed: [...this.daily.claimed],
      },
      eventClaims: { ...this.eventClaims },
      tutorialDone: this.tutorialDone,
      root: this.root,
      school: this.school,
      battlePass: { ...this.battlePass },
      lastSeen: this.lastSeen,
      brokenRealms: this.brokenRealms.map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
      pendingTribulation: this.pendingTribulation,
      tribStacks: this.tribStacks,
      beasts: [...this.beasts],
      activeBeast: this.activeBeast,
      towerFloor: this.towerFloor,
      towerBest: this.towerBest,
      towerDaily: this.towerDaily,
      arenaPoints: this.arenaPoints,
      arenaWins: this.arenaWins,
      arenaLosses: this.arenaLosses,
      arenaBoard: this.arenaBoard.map((e) => ({ ...e })),
      reincarnations: this.reincarnations,
      friends: JSON.parse(JSON.stringify(this.friends)),
      friendEnding: { ...this.friendEnding },
      mailsClaimed: [...this.mailsClaimed],
      sectContribution: this.sectContribution,
      sectBuildings: { ...this.sectBuildings },
      sectWarDay: this.sectWarDay,
      demonSlain: this.demonSlain,
      mailbox: this.mailbox.map((m) => ({ ...m })),
      seasonBest: this.seasonBest,
      rogueBest: this.rogueBest,
      expMulNg: this.expMulNg,
      ngPlus: this.ngPlus,
    };
  }

  /** 从存档恢复（位置固定回出生点，避免落入阻挡格） */
  applySave(s: SaveState, spawn: { gx: number; gy: number }): void {
    if (!s || (s.v !== 1 && s.v !== 2 && s.v !== 3)) return;
    this.nickname = s.nickname || this.nickname;
    this.exp = s.exp || 0;
    this.applyRealmCaps();
    this.hp = Math.min(this.maxHp, s.hp || this.maxHp);
    this.mp = Math.min(this.maxMp, s.mp || this.maxMp);
    this.inv = new Map((s.inv || []).filter(([id]) => !!getItem(id)));
    this.equipment = {};
    for (const slot of ["weapon", "armor", "trinket"] as EquipSlot[]) {
      const id = s.equipment?.[slot];
      if (id && isEquipment(id)) this.equipment[slot] = id;
    }
    this.learned = (s.learned || []).filter((id) => !!getSkill(id));
    if (this.learned.length === 0) this.learned = [...DEFAULT_SKILLS];
    this.equipped = (s.equipped || []).map((id) => (id && this.learned.includes(id) ? id : null));
    while (this.equipped.length < 4) this.equipped.push(null);
    this.quests = {
      active: (s.quests?.active || []).filter((id) => !!QUESTS[id]),
      progress: { ...(s.quests?.progress || {}) },
      done: (s.quests?.done || []).filter((id) => !!QUESTS[id]),
    };
    this.flags = { ...(s.flags || {}) };
    this.kills = s.kills || 0;
    this.playMs = s.playMs || 0;
    this.built = (s.built || [])
      .filter((b) => !!getBuildingSafe(b.id))
      .map((b) => ({ zone: b.zone || "ch1", id: b.id, gx: b.gx, gy: b.gy, orig: b.orig }));
    this.stones = Math.max(0, s.stones || 0);
    this.forge = {};
    for (const [id, lv] of Object.entries(s.forge || {})) {
      if (isEquipment(id)) this.forge[id] = Math.max(0, Math.min(FORGE_MAX, Math.floor(lv)));
    }
    this.chapter = s.chapter || 1;
    this.unlockedZones = (s.unlockedZones && s.unlockedZones.length ? s.unlockedZones : ["ch1"]).filter(Boolean);
    if (!this.unlockedZones.includes("ch1")) this.unlockedZones.unshift("ch1");
    this.reputation = Math.max(0, s.reputation || 0);
    this.sect = s.sect ?? null;
    this.affixes = (s.affixes && typeof s.affixes === "object") ? { ...s.affixes } : {};
    this.rarities = (s.rarities && typeof s.rarities === "object") ? { ...s.rarities } : {};
    // —— v2 新字段恢复（旧 v1 档缺省 → 默认值）——
    this.talentPoints = Math.max(0, Math.floor(s.talentPoints || 0));
    this.talents = {};
    for (const [id, n] of Object.entries(s.talents || {})) {
      this.talents[id] = Math.max(0, Math.floor(n));
    }
    this.ownedArtifacts = (s.ownedArtifacts || []).filter((id) => !!getArtifact(id));
    this.artifact = (typeof s.artifact === "string" && this.ownedArtifacts.includes(s.artifact)) ? s.artifact : null;
    this.codex = {
      monstersSeen: (s.codex?.monstersSeen || []).filter(Boolean),
      monstersKilled: (s.codex?.monstersKilled || []).filter(Boolean),
      itemsGot: (s.codex?.itemsGot || []).filter(Boolean),
      skillsLearned: (s.codex?.skillsLearned || []).filter(Boolean),
    };
    this.achievements = {
      unlocked: (s.achievements?.unlocked || []).filter(Boolean),
      claimed: (s.achievements?.claimed || []).filter(Boolean),
    };
    this.daily = {
      date: typeof s.daily?.date === "string" ? s.daily.date : "",
      ids: (s.daily?.ids || []).filter(Boolean),
      progress: { ...(s.daily?.progress || {}) },
      claimed: (s.daily?.claimed || []).filter(Boolean),
    };
    this.gems = (s.gems && typeof s.gems === "object")
      ? (() => { const o: Record<string, string | null> = {}; for (const k in s.gems) { const v = s.gems[k]; if (getItem(k) && (v === null || !!getGem(v as string))) o[k] = v as string | null; } return o; })()
      : {};
    this.tutorialDone = !!s.tutorialDone;
    this.eventClaims = (s.eventClaims && typeof s.eventClaims === "object") ? { ...s.eventClaims } : {};
    this.root = (typeof s.root === "string" && !!getRoot(s.root)) ? s.root : this.root;
    this.school = (typeof s.school === "string" && !!getSchool(s.school)) ? s.school : this.school;
    const bp = (s.battlePass && typeof s.battlePass === "object") ? s.battlePass : null;
    this.battlePass = {
      season: Math.max(1, Math.floor(bp?.season || 1)),
      claimed: Array.isArray(bp?.claimed) ? bp!.claimed.filter((n) => typeof n === "number") : [],
      signinDays: Array.isArray(bp?.signinDays) ? bp!.signinDays.filter((d) => typeof d === "string") : [],
      monthCardUntil: typeof bp?.monthCardUntil === "number" ? bp!.monthCardUntil : 0,
      monthCardClaimed: Array.isArray(bp?.monthCardClaimed) ? bp!.monthCardClaimed.filter((d) => typeof d === "string") : [],
    };
    this.lastSeen = typeof s.lastSeen === "number" ? s.lastSeen : 0;
    // 天劫：旧档无 brokenRealms 时，按已达境界默认通过（保留战力，避免回退）
    if (Array.isArray(s.brokenRealms)) {
      this.brokenRealms = new Array(MAX_REALM_LEN).fill(false);
      for (const i of s.brokenRealms) if (typeof i === "number" && i >= 0 && i < MAX_REALM_LEN) this.brokenRealms[i] = true;
    } else {
      const raw = realmIndexOf(this.exp);
      this.brokenRealms = new Array(MAX_REALM_LEN).fill(false);
      for (let i = 0; i <= raw; i++) if (REALMS[i].tribulation) this.brokenRealms[i] = true;
    }
    this.reincarnations = typeof s.reincarnations === "number" && s.reincarnations >= 0 ? s.reincarnations : 0;
    this.expMulNg = typeof s.expMulNg === "number" ? s.expMulNg : 1;
    this.ngPlus = typeof s.ngPlus === "number" ? s.ngPlus : 0;
    this.pendingTribulation = typeof s.pendingTribulation === "number" ? s.pendingTribulation : 0;
    this.tribStacks = typeof s.tribStacks === "number" ? s.tribStacks : 0;
    this.updatePendingTribulation();
    // 灵兽：读档恢复；旧档无字段给默认（空列表 / 无出战）
    this.beasts = Array.isArray(s.beasts) ? s.beasts.filter((x) => typeof x === "string" && !!getBeast(x)) : [];
    this.activeBeast = typeof s.activeBeast === "string" && this.beasts.includes(s.activeBeast) ? s.activeBeast : null;
    // 镇妖塔进度（旧档缺省给默认）
    this.towerFloor = typeof s.towerFloor === "number" && s.towerFloor > 0 ? s.towerFloor : 1;
    this.towerBest = typeof s.towerBest === "number" ? s.towerBest : 0;
    this.towerDaily = typeof s.towerDaily === "string" ? s.towerDaily : "";
    // 竞技场：旧档缺省给默认（积分/战绩/排行榜池）
    this.arenaPoints = typeof s.arenaPoints === "number" && s.arenaPoints >= ARENA_MIN_POINTS ? s.arenaPoints : 1000;
    this.arenaWins = typeof s.arenaWins === "number" ? s.arenaWins : 0;
    this.arenaLosses = typeof s.arenaLosses === "number" ? s.arenaLosses : 0;
    this.arenaBoard = Array.isArray(s.arenaBoard) ? s.arenaBoard.filter((e: any) => e && typeof e.nickname === "string") : [];
    // 社交（p1-social）：旧档缺省给默认，保证 v1~v3 可读
    this.friends = (s.friends && typeof s.friends === "object") ? JSON.parse(JSON.stringify(s.friends)) : {};
    this.friendEnding = (s.friendEnding && typeof s.friendEnding === "object") ? JSON.parse(JSON.stringify(s.friendEnding)) : {};
    this.mailsClaimed = Array.isArray(s.mailsClaimed) ? s.mailsClaimed.filter((x: any) => typeof x === "string") : [];
    this.sectContribution = typeof s.sectContribution === "number" ? s.sectContribution : 0;
    this.sectBuildings = (s.sectBuildings && typeof s.sectBuildings === "object") ? { ...s.sectBuildings } : {};
    this.sectWarDay = typeof s.sectWarDay === "string" ? s.sectWarDay : "";
    this.demonSlain = typeof s.demonSlain === "number" ? s.demonSlain : 0;
    this.mailbox = Array.isArray(s.mailbox)
      ? s.mailbox.filter((m: any) => m && typeof m.id === "number" && typeof m.fromName === "string")
          .map((m: any) => ({
            id: m.id, fromName: String(m.fromName), title: String(m.title || ""), body: String(m.body || ""),
            reward: m.reward && typeof m.reward === "object" ? m.reward : undefined,
            read: !!m.read, claimed: !!m.claimed, createdAt: Number(m.createdAt) || 0,
          }))
      : [];
    this.seasonBest = typeof s.seasonBest === "number" && isFinite(s.seasonBest) ? Math.max(0, Math.floor(s.seasonBest)) : 0;
    this.rogueBest = typeof s.rogueBest === "number" ? s.rogueBest : 0;
    // 天赋/法宝可能提升气血上限：恢复后重算并夹紧当前气血/灵力
    this.applyRealmCaps();
    this.hp = Math.min(this.maxHp, this.hp);
    this.mp = Math.min(this.maxMp, this.mp);
    this.gx = spawn.gx + 0.5;
    this.gy = spawn.gy + 0.5;
    this.stop();
  }

  /** P3-1 翻滚：消耗体力获得一段无敌帧 + 定向位移（i-frame 复用 Actor.invincible） */
  tryRoll(dx: number, dy: number): boolean {
    if (this.rolling || this.casting || !this.alive) return false;
    if (this.stamina < ROLL_COST) return false;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return false;
    this.stamina -= ROLL_COST;
    this.rollCd = ROLL_CD;
    this.rolling = true;
    this.rollT = ROLL_DUR;
    this.rollDirX = dx / len;
    this.rollDirY = dy / len;
    this.invincible = Math.max(this.invincible, ROLL_IFRAME);
    this.setState("dodge"); // 翻滚专属骨骼动画（侧翻冲出），由 Actor 排除列表保护不被移动覆盖
    return true;
  }

  /** P3-1b 格挡：进入防御姿态（不拿无敌帧，持续消耗体力）。弹反窗口由 blockT 决定 */
  tryBlock(): boolean {
    if (this.blocking || this.rolling || this.casting || !this.alive) return false;
    if (this.blockCd > 0) return false;
    this.blocking = true;
    this.blockT = 0;
    this.setState("idle");
    return true;
  }
  /** 解除格挡姿态（进入短冷却，防止秒切刷弹反） */
  endBlock(): void {
    if (!this.blocking) return;
    this.blocking = false;
    this.blockCd = BLOCK_COOLDOWN;
  }

  /** 玩家战斗属性（用于怪物攻击的五行克制）：主修法修=火、剑修=金、否则无 */
  get element(): ElementKind | undefined {
    if (this.learned.some((id) => getSkill(id)?.branch === "law")) return "fire";
    if (this.learned.some((id) => getSkill(id)?.branch === "sword")) return "metal";
    return undefined;
  }

  update(dt: number): void {
    // P3-1 翻滚位移（置于 super 前，确保当帧刷新）
    if (this.rolling) {
      this.rollT -= dt;
      this.nudge(this.rollDirX, this.rollDirY, dt * ROLL_SPEED_MULT);
      if (this.rollT <= 0) { this.rolling = false; this.setState("idle"); }
    }
    super.update(dt);
    this.rollCd = Math.max(0, this.rollCd - dt);
    this.blockCd = Math.max(0, this.blockCd - dt);
    // P3-1b 格挡持续：累进 blockT 计时、消耗体力，体力耗尽自动解除
    if (this.blocking) {
      this.blockT += dt;
      this.stamina = Math.max(0, this.stamina - BLOCK_DRAIN * dt);
      if (this.stamina <= 0) this.endBlock();
    }
    // 非格挡时回复体力；格挡期间持续消耗（不回复），使格挡成为真实资源压力
    if (!this.blocking) this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * dt);
    for (const id of Object.keys(this.cds)) {
      this.cds[id] = Math.max(0, this.cds[id] - dt);
    }
    if (this.casting) {
      this.casting.t += dt;
      if (this.casting.t >= this.casting.skill.castTime) {
        this.castReady = this.casting.skill;
        this.cds[this.casting.skill.id] = this.casting.skill.cd;
        this.casting = null;
        this.setState("idle");
      }
    }
  }
}
