/**
 * 游戏主循环：世界组装、输入编排、战斗结算、剧情推进、存档与云同步。
 * 状态：title（标题）→ play（游玩，对话/面板为叠加层）→ result（结算）。
 */
import { IsoMap, Camera, gridToScreen, TILE_W, TILE_H, nearestWalkable, THEME_ORDER, THEME_LABELS, type ThemeName } from "./core/IsoMap";
import { genRogueMap, pickRogueBuff, pickRogueRelic, rogueMonsterPool, type RogueFloor, type RogueEventKind } from "./core/MapFactory";
import { MAP, isWalkable, setCurrentMap, type MapDef } from "./data/map";
import type { GatherNode, ChestNode } from "./data/zones";
import { loadMeta, saveMeta, carryover, grantClear } from "./core/ngplus";
import { getItem } from "./data/items";
import { getMonster } from "./data/monsters";
import { STORY, QUESTS, CHAPTER1_START, NPCS, type NpcDef, type StoryCond, type StoryEffect } from "./data/story/chapter1";
import { CH2_STORY, CH2_QUESTS } from "./data/story/chapter2";
import { SOCIAL_STORY } from "./data/social";
import { ENCOUNTER_STORY } from "./data/encounters";
import { SIDE_STORY } from "./data/sidequests";
import { DialogueRunner } from "./core/Dialogue";
import { defaultFeel, type SkillDef, applySkillOverride } from "./data/skills";
import { loadOverride } from "./data/override";
import { applyMonsterOverride } from "./data/monsters";
import { Fx } from "./core/Fx";
import { Ambience } from "./core/Ambience";
import { Sfx } from "./core/Sfx";
import { drawTelegraphDiamond } from "./core/Telegraph";
import { Input, Key } from "./core/Input";
import { CloudClient } from "./core/CloudClient";
import { LocalStorage } from "./core/Storage";
import { SaveManager } from "./core/SaveManager";
import { calcDamage, type BuffKind, type Buff } from "./core/Combat";
import { elementMultiplier, elementTag, ELEM_CRYSTAL_COLOR, MULTI_CRYSTAL_COLOR, type ElementKind } from "./data/elements";
import { comboPush, comboDecay, comboMul, emptyCombo, COMBO_WINDOW, type ComboState } from "./core/Combo";
import { Player } from "./entities/Player";
import { Monster } from "./entities/Monster";
import { Hud } from "./ui/Hud";
import { SkillBar } from "./ui/SkillBar";
import { BagPanel } from "./ui/BagPanel";
import { SkillPanel } from "./ui/SkillPanel";
import { DialogueBox } from "./ui/DialogueBox";
import { TitleUI } from "./ui/TitleUI";
import { ResultUI } from "./ui/ResultUI";
import { Minimap } from "./ui/Minimap";
import { BuildPanel } from "./ui/BuildPanel";
import { ShopPanel } from "./ui/ShopPanel";
import { ForgePanel } from "./ui/ForgePanel";
import { BeastPanel } from "./ui/BeastPanel";
import { TowerPanel } from "./ui/TowerPanel";
import { ArenaPanel } from "./ui/ArenaPanel";
import { getBeast } from "./data/beasts";
import { TOWER_FLOORS, TOWER_SPOTS, MAX_TOWER_FLOOR, type TowerFloorDef } from "./data/tower";
import { buildMirrorOpponent, mirrorMult, ARENA_K, ARENA_MIN_DELTA, ARENA_MAX_DELTA, ARENA_MIN_POINTS, arenaDelta, type ArenaOpponent } from "./data/arena";
import { makeRng } from "./core/Rng";
import { Rig } from "./core/Rig";
import { SectPanel } from "./ui/SectPanel";
import { TalentPanel } from "./ui/TalentPanel";
import { ArtifactPanel } from "./ui/ArtifactPanel";
import { Cutscene } from "./core/Cutscene";
import { MobileControls } from "./ui/MobileControls";
import { isTouchDevice } from "./core/Input";
import { CodexPanel } from "./ui/CodexPanel";
import { AchievementsPanel } from "./ui/AchievementsPanel";
import { DailyPanel } from "./ui/DailyPanel";
import { EventPanel } from "./ui/EventPanel";
import { SocialPanel, SocialHooks } from "./ui/SocialPanel";
import { SchoolPanel } from "./ui/SchoolPanel";
import { BattlePassPanel } from "./ui/BattlePassPanel";
import { OfflinePanel } from "./ui/OfflinePanel";
import { Tutorial } from "./core/Tutorial";
import { getAchievement } from "./data/achievements";
import { TransferPanel, type TransferDef } from "./ui/TransferPanel";
import { WorldMapPanel } from "./ui/WorldMapPanel";
import { CastPanel } from "./ui/CastPanel";
import { loadArt, onArtLoaded } from "./core/Assets";
import { ZONES, type ZoneDef } from "./data/zones";
import { BUILDINGS, getBuilding, DEMOLISH_RATIO } from "./data/buildings";
import { text } from "./ui/widgets";

const TOKEN_KEY = "xiuxian.token";
const SAVE_INTERVAL = 15;

/** 建筑配色（供地图重绘） */
const BUILD_COLORS: Record<string, { body: string; roof: string; style?: string }> = {};
for (const b of BUILDINGS) BUILD_COLORS[b.id] = { body: b.body, roof: b.roof, style: b.style };

// 角色可点击包围盒（世界单位，相对脚点 sprite 原点）。
// 依据实际绘制尺寸：身体 -36~-10、半宽 11，头顶 -55（带角 -60）；仅加极小容差，
// 避免点到「脚下地面」或「头顶上方空白」也能对话/选目标。
const HIT_HALF_W = 14;  // 半宽（身体 11 + 容差 3）
const HIT_TOP = 58;     // 向上（身高 55 + 容差 3）
const HIT_BOTTOM = 2;   // 向下（仅容差，身体不延伸到脚下）

/** 点击是否落在角色身体上（画布坐标；sx/sy 为脚点屏幕位置，Z 为当前缩放） */
export function hitSpriteBox(c: { x: number; y: number }, sx: number, sy: number, Z: number): boolean {
  return Math.abs(c.x - sx) <= HIT_HALF_W * Z && c.y >= sy - HIT_TOP * Z && c.y <= sy + HIT_BOTTOM * Z;
}

interface Projectile {
  sprite: any;
  x: number;
  y: number;
  tx: number;
  ty: number;
  skill: SkillDef;
}

interface NpcView {
  def: NpcDef;
  sprite: any;
  /** Rig 渲染实例（透明底立绘或程序化骨架回退） */
  rig?: Rig;
}

/** 结晶护盾元素共生：特定元素对共存时附加周期性效果（key 为两元素按字母序以 "|" 连接，便于扩展更多组合） */
const CRYSTAL_SYMBIOSIS: Record<string, { period: number; dmg: number; radius: number; color: string; label: string; kind?: "dissolve" | "chain" | "shock" | "freeze" | "superconduct" | "vaporize" | "overload" | "thorns" | "paralyze" | "mud" | "permafrost" }> = {
  "fire|ice": { period: 1.2, dmg: 5, radius: 7, color: "#ffb07a", label: "消融", kind: "dissolve" },
  "thunder|water": { period: 1.0, dmg: 4, radius: 6, color: "#9fe8ff", label: "导电链", kind: "chain" },
  "fire|thunder": { period: 1.0, dmg: 6, radius: 6, color: "#ff8a5c", label: "超载", kind: "overload" },
  "ice|thunder": { period: 1.1, dmg: 4, radius: 6, color: "#a0e8ff", label: "超导", kind: "superconduct" },
  "ice|water": { period: 1.1, dmg: 4, radius: 6, color: "#9fe8ff", label: "冻结", kind: "freeze" },
  "fire|water": { period: 1.0, dmg: 6, radius: 6, color: "#ffd9a0", label: "蒸发", kind: "vaporize" },
  "earth|fire": { period: 1.1, dmg: 5, radius: 6, color: "#b08a4a", label: "反震", kind: "thorns" },
  "earth|thunder": { period: 1.1, dmg: 4, radius: 6, color: "#caa6ff", label: "麻痹", kind: "paralyze" },
  "earth|water": { period: 1.1, dmg: 4, radius: 6, color: "#7fae8a", label: "泥沼", kind: "mud" },
  "earth|ice": { period: 1.1, dmg: 4, radius: 7, color: "#bfe6ff", label: "冻土", kind: "permafrost" },
};

/** 共生真伤随目标血量缩放系数：保证在 BOSS 战中也具实战意义（小怪几乎无感，Boss 上量） */
const SYMBIOSIS_HP_SCALE = 0.01;

export class Game {
  phase: "title" | "play" | "result" = "title";

  private viewW = 1280;
  private viewH = 720;
  private lastT = Date.now();
  private cam = new Camera();
  private map!: IsoMap;
  private fx!: Fx;
  private fxLayer: any;
  private ambience!: Ambience;
  private player!: Player;
  private monsters: Monster[] = [];
  private npcs: NpcView[] = [];
  private projectiles: Projectile[] = [];
  private targetRing: any;
  private target: Monster | null = null;
  private uiRoot: any;
  /** SCALE_NOBORDER 满屏时边缘裁切量（设计像素）：顶部/底部/左/右，HUD 与移动控件据此内缩避免被裁 */
  private safeInset = { top: 0, bottom: 0, left: 0, right: 0 };
  private hud!: Hud;
  private skillBar!: SkillBar;
  private bag!: BagPanel;
  private skillPanel!: SkillPanel;
  private dlgBox!: DialogueBox;
  private titleUI!: TitleUI;
  private resultUI!: ResultUI;
  private dialogue!: DialogueRunner;
  private input = new Input();
  private sfx = new Sfx();
  private cloud = new CloudClient();
  private saveMgr = new SaveManager();
  /** 云社交档案节流上传计时（秒） */
  private socialSyncT = 12;
  private minimap!: Minimap;
  /** 三界舆图面板（G） */
  private worldMap!: WorldMapPanel;
  /** 人物志面板（Y） */
  private castPanel!: CastPanel;
  private buildPanel!: BuildPanel;
  /** 当前激活区域（多区域上下文核心） */
  private currentMap: MapDef = MAP;
  private currentZoneId = "ch1";
  private transferPanel!: TransferPanel;
  private transferCooldown = 0;
  private pendingTransfer: TransferDef | null = null;
  /** 挂机/自动战斗开关（键鼠 E / 移动端按钮切换） */
  autoFight = false;
  private autoTimer = 0;
  /** 天劫演出状态：进行中冻结世界，结束后结算 */
  private tribulating = false;
  /** 已为该境界展示过天劫（失败待手动重试时不再自动弹） */
  private tribShown = 0;
  /** 当前天劫境界名（演出/结算提示用） */
  private tribRealmName = "";
  /** 灵兽面板 */
  private beastPanel!: BeastPanel;
  /** 灵兽协战冷却（秒） */
  private beastCd = 0;
  /** 灵兽跟随精灵（玩家 rig 子节点，简化协战表现） */
  private beastSprite: any = null;
  /** 灵兽协战独立随机源（不污染战斗 rng 序列） */
  private beastRng = makeRng(0x9ea57);
  private shopPanel!: ShopPanel;
  /** 镇妖塔面板 */
  private towerPanel!: TowerPanel;
  /** 当前层怪物是否已刷出（清层后用于触发推进） */
  private towerSpawned = false;
  /** 清层到进下一层的过渡计时（秒） */
  private towerNextT = 0;
  /** 竞技场当前对手（镜像 PVE） */
  private currentArenaOpp: ArenaOpponent | null = null;
  /** 选对手用的轮换种子（确定性） */
  private arenaPickSeed = 1;
  /** 飞升演出进行中（防重复触发） */
  private ascending = false;
  /** 竞技场面板 */
  private arenaPanel!: ArenaPanel;
  private eventPanel!: EventPanel;
  private socialPanel!: SocialPanel;
  /** 活动副本（P3-8 限时魔尊试炼）运行态 */
  private eventDungeon: { active: boolean; startMs: number; timeLimitMs: number } = { active: false, startMs: 0, timeLimitMs: 0 };
  private eventBoss: Monster | null = null;
  private forgePanel!: ForgePanel;
  private sectPanel!: SectPanel;
  private talentPanel!: TalentPanel;
  private artifactPanel!: ArtifactPanel;
  private codexPanel!: CodexPanel;
  private achievementsPanel!: AchievementsPanel;
  private dailyPanel!: DailyPanel;
  private schoolPanel!: SchoolPanel;
  private battlePassPanel!: BattlePassPanel;
  private offlinePanel!: OfflinePanel;
  private tutorial!: Tutorial;
  /** 成就弹提示：记录已提示过的解锁数 */
  private lastAchCount = 0;
  /** 教程：对话打开次数（用于判定“交谈”事件） */
  private tutDialogueOpens = 0;
  /** 教程推进所用的上一帧状态快照 */
  private tutPrev = { gx: 0, gy: 0, learned: 0, kills: 0, dlg: 0 };
  /** 全屏点击捕获层：对话开启时拦截所有点击用于推进对话 */
  private dlgCatcher!: any;
  /** 当前建造模式（null = 无）；place 放置 / demolish 拆除 */
  private buildMode: { kind: "place" | "demolish"; id?: string } | null = null;
  /** 建造幽灵预览（世界层内） */
  private ghost!: any;
  private ghostTile: { gx: number; gy: number } | null = null;
  private token: string | null = null;
  private elapsed = 0;
  private symbiosisTimers: Record<string, number> = {};
  /** P3-5 野外采集：当前 zone 可采集点（已过滤不可走格） */
  private activeGathers: GatherNode[] = [];
  /** 采集点冷却（"gx,gy" → 剩余秒） */
  private gatherCd: Record<string, number> = {};
  /** 当前踩中的可采集点（每帧更新） */
  private nearGather: GatherNode | null = null;
  /** P3-5余 隐藏宝箱 */
  private activeChests: ChestNode[] = [];
  private chestCd: Record<string, number> = {};
  private nearChest: ChestNode | null = null;
  /** 奇遇事件计时（秒） */
  private encounterTimer = 0;
  /** 动态刷怪计时（秒） */
  private dynSpawnT = 0;
  private spawnT = 1;
  /** 命中顿帧（秒）：>0 时世界逻辑冻结、仅表现层推进，营造打击定格感 */
  private hitstopT = 0;
  /** 连携状态：连续切换技能叠加伤害倍率，受击或超时断裂 */
  private combo: ComboState = emptyCombo();
  /** 命中连击数（P3-1b 连招）：每次玩家技能命中怪物 +1，受击或超时归零 */
  private streak = 0;
  /** 连击保持计时（秒） */
  private streakT = 0;
  /** 过场演出控制器（章节开场 / Boss 出场） */
  private cutscene!: Cutscene;
  /** 常驻暗角（大气纵深，屏幕空间） */
  private atmoVignette!: any;
  /** 低血红晕层（满屏红，低血时呼吸） */
  private vignette!: any;
  private vignetteW = 0;
  private vignetteH = 0;
  /** 相机目标缩放（滚轮调节，平滑趋近 this.map.zoom） */
  private targetZoom = 3;
  /** 上一帧玩家血量（检测受击，触发镜头拉远/轻震） */
  private prevPlayerHp = 1;
  /** 当前地图主题索引（X 键循环切换五种风格） */
  private themeIdx = 0;
  /** 移动端触控层（仅触屏显示） */
  private mobile!: MobileControls;
  private saveT = SAVE_INTERVAL;
  private wonHandled = false;
  private hintText: any;
  private hintT = 0;

  /** 屏幕闪白/红（Boss 登场/击杀演出） */
  private flashLayer!: any;
  private flashColor = "#ffffff";
  private flashA = 0;
  private flashT = 0;
  private flashDur = 1;
  /** 低血屏幕边缘红脉冲层（<30% 时呼吸辉光） */
  private edgeLayer!: any;
  private edgeA = 0;
  /** Boss 登场/击杀横幅 */
  private bossBannerText!: any;
  private bossBannerT = 0;
  /** 已触发登场演出的 Boss 实例集合（每实例仅一次） */
  private bossSeen = new Set<Monster>();
  /** 慢动作：世界更新时间缩放（处决/破防演出用），UI 与输入不受影响 */
  timeScale = 1;
  private slowmoT = 0;
  private slowmoDur = 1;
  private slowmoScale = 1;

  /** 预加载仙侠地图 AI 贴图（未启用时静默回退程序化绘制） */
  preloadMapAssets(): void {
    this.map.preloadAssets();
  }

  start(): void {
    this.viewW = Laya.stage.width;
    this.viewH = Laya.stage.height;
    // 美术资源（三界舆图 / 四位角色立绘）异步预加载
    loadArt();

    // —— 世界 ——
    this.map = new IsoMap(Laya.stage);
    this.fxLayer = new Laya.Sprite();
    this.map.root.addChild(this.fxLayer);
    this.fx = new Fx(this.fxLayer, this.map.zoom);

    this.targetRing = new Laya.Sprite();
    this.targetRing.graphics.drawCircle(0, 0, 30, null, "#ffd166", 2);
    this.targetRing.visible = false;
    this.fxLayer.addChild(this.targetRing);

    this.ghost = new Laya.Sprite();
    this.ghost.visible = false;
    this.map.structureLayer.addChild(this.ghost);

    this.resetPlayer("无名散修");

    // —— UI（屏幕空间，统一挂 uiRoot 置于世界之上）——
    this.uiRoot = new Laya.Sprite();
    Laya.stage.addChild(this.uiRoot);

    // 常驻暗角（大气纵深）：最底层、世界之上、HUD 之下
    this.atmoVignette = new Laya.Sprite();
    this.uiRoot.addChild(this.atmoVignette);

    // 低血红晕层：置于所有 UI 之下（首个子节点），世界之上
    this.vignette = new Laya.Sprite();
    this.vignette.alpha = 0;
    this.uiRoot.addChild(this.vignette);
    this.ambience = new Ambience();
    this.ambience.attach(this.uiRoot);

    // 低血屏幕边缘红脉冲层（低于 HUD）
    this.edgeLayer = new Laya.Sprite();
    this.edgeLayer.visible = false;
    this.edgeLayer.zOrder = 40;
    this.uiRoot.addChild(this.edgeLayer);

    // 屏幕闪白/红层（Boss 演出，置于最顶）
    this.flashLayer = new Laya.Sprite();
    this.flashLayer.alpha = 0;
    this.flashLayer.zOrder = 1000;
    this.uiRoot.addChild(this.flashLayer);

    // Boss 登场/击杀横幅
    this.bossBannerText = new Laya.Text();
    this.bossBannerText.fontSize = 38;
    this.bossBannerText.bold = true;
    this.bossBannerText.color = "#ff5a5a";
    this.bossBannerText.width = this.viewW;
    this.bossBannerText.align = "center";
    this.bossBannerText.pos(0, this.viewH * 0.28);
    this.bossBannerText.alpha = 0;
    this.bossBannerText.zOrder = 900;
    this.uiRoot.addChild(this.bossBannerText);

    this.hud = new Hud(() => this.tryManualTribulate(), () => this.openAlchemy(), () => this.openBeast(), () => this.openTower(), () => this.openArena(), () => this.openAscend(), () => this.openEvent(), () => this.openSocial(), () => this.openWorldMap(), () => this.openCast());
    this.uiRoot.addChild(this.hud.root);
    this.skillBar = new SkillBar();
    this.uiRoot.addChild(this.skillBar.root);
    this.bag = new BagPanel(this.player, (msg) => this.hint(msg));
    this.uiRoot.addChild(this.bag.root);
    this.skillPanel = new SkillPanel(this.player);
    this.uiRoot.addChild(this.skillPanel.root);
    // 全屏对话捕获层（在对话弹层之下、其余 UI 之上）：点击任意处推进对话
    this.dlgCatcher = new Laya.Sprite();
    this.dlgCatcher.graphics.drawRect(0, 0, this.viewW, this.viewH, "rgba(0,0,0,0.001)");
    // 显式命中区：避免近乎透明填充被 Laya 命中检测忽略
    if ((Laya as any).Rectangle) this.dlgCatcher.hitArea = new Laya.Rectangle(0, 0, this.viewW, this.viewH);
    this.dlgCatcher.visible = false;
    this.dlgCatcher.on(Laya.Event.CLICK, this, () => this.dlgBox.advance());
    this.uiRoot.addChild(this.dlgCatcher);
    this.dlgBox = new DialogueBox();
    this.uiRoot.addChild(this.dlgBox.root);
    this.minimap = new Minimap(MAP, "落霞镇");
    this.uiRoot.addChild(this.minimap.root);
    this.worldMap = new WorldMapPanel(() => {}, (z) => this.teleportFromMap(z));
    this.worldMap.root.zOrder = 500; // 高于其它面板，低于屏闪(1000)/横幅(900)
    this.uiRoot.addChild(this.worldMap.root);
    this.castPanel = new CastPanel();
    this.castPanel.root.zOrder = 500;
    this.uiRoot.addChild(this.castPanel.root);
    // 贴图到位后重绘舆图与人物志（未就绪时它们显示占位色块）
    onArtLoaded(() => this.repaintArt());
    this.buildPanel = new BuildPanel(this.player, {
      onSelect: (id) => this.enterBuild(id),
      onDemolish: () => this.enterDemolish(),
      onClose: () => this.buildPanel.hide(),
    });
    this.uiRoot.addChild(this.buildPanel.root);
    this.shopPanel = new ShopPanel(this.player, (msg) => this.hint(msg));
    this.uiRoot.addChild(this.shopPanel.root);
    this.forgePanel = new ForgePanel(this.player, (msg) => this.hint(msg));
    this.uiRoot.addChild(this.forgePanel.root);
    this.beastPanel = new BeastPanel(this.player, (msg) => this.hint(msg), () => this.tryCapture());
    this.uiRoot.addChild(this.beastPanel.root);
    this.towerPanel = new TowerPanel(this.player, () => this.enterTower(), () => this.exitTower(), () => this.todayStr());
    this.uiRoot.addChild(this.towerPanel.root);
    this.arenaPanel = new ArenaPanel(
      () => this.arenaState(),
      (rng?: () => number) => this.startArenaDuel(rng),
      () => this.arenaNextOpponent(),
    );
    this.uiRoot.addChild(this.arenaPanel.root);
    this.sectPanel = new SectPanel(this.player, (msg) => this.hint(msg));
    this.uiRoot.addChild(this.sectPanel.root);
    this.talentPanel = new TalentPanel(this.player, (msg) => this.hint(msg));
    this.uiRoot.addChild(this.talentPanel.root);
    this.artifactPanel = new ArtifactPanel(this.player, (msg) => this.hint(msg));
    this.uiRoot.addChild(this.artifactPanel.root);
    this.codexPanel = new CodexPanel(this.player);
    this.uiRoot.addChild(this.codexPanel.root);
    this.achievementsPanel = new AchievementsPanel(this.player, (msg) => this.hint(msg));
    this.uiRoot.addChild(this.achievementsPanel.root);
    this.dailyPanel = new DailyPanel(this.player, (msg) => this.hint(msg));
    this.uiRoot.addChild(this.dailyPanel.root);
    this.schoolPanel = new SchoolPanel(this.player, (msg) => this.hint(msg));
    this.uiRoot.addChild(this.schoolPanel.root);
    this.battlePassPanel = new BattlePassPanel(this.player, (msg) => this.hint(msg), () => this.todayStr());
    this.uiRoot.addChild(this.battlePassPanel.root);
    this.eventPanel = new EventPanel(this.player, (msg) => this.hint(msg), {
      getSeason: () => this.cloud.getSeason(),
      onEnterDungeon: () => this.enterEventDungeon(),
    });
    this.uiRoot.addChild(this.eventPanel.root);
    const socialHooks: SocialHooks = {
      getToken: () => this.token || null,
      getZone: () => this.currentZoneId,
      getPos: () => ({ gx: this.player.gx, gy: this.player.gy }),
      refreshMail: async () => {
        if (!this.token) return;
        const m = await this.cloud.getMail(this.token);
        if (m) this.player.syncMailbox(m);
      },
      claimMail: async (id: number) => {
        if (!this.token) return;
        const r = await this.cloud.claimMail(this.token, id);
        if (r) { this.player.markMailClaimed(id); this.player.applyMailReward(r); this.hint("领取邮件奖励"); this.saveGame(); }
      },
      sendMail: async (to: string, mail: { title: string; body: string }) => {
        if (!this.token) return false;
        const ok = await this.cloud.sendMail(this.token, to, mail);
        if (ok) this.hint(`已向 ${to} 寄出邮件`);
        return ok;
      },
      sectLeaderboard: async () => this.cloud.sectLeaderboard(),
      presenceList: async () => this.cloud.presenceList(),
    };
    this.socialPanel = new SocialPanel(this.player, (msg) => this.hint(msg), () => this.todayStr(), (id) => this.openFriendEnding(id), socialHooks);
    this.uiRoot.addChild(this.socialPanel.root);
    this.offlinePanel = new OfflinePanel();
    this.uiRoot.addChild(this.offlinePanel.root);
    this.tutorial = new Tutorial(
      (t) => this.hint(t),
      () => { this.player.tutorialDone = true; this.hint("引导完成，修行之路自此展开"); },
    );
    this.transferPanel = new TransferPanel({
      onConfirm: () => this.confirmTransfer(),
      onClose: () => this.transferPanel.hide(),
    });
    this.uiRoot.addChild(this.transferPanel.root);
    this.resultUI = new ResultUI({
      onRetry: () => this.startNewGame(this.player.nickname),
      onTitle: () => void this.enterTitle(),
    });
    this.uiRoot.addChild(this.resultUI.root);
    this.titleUI = new TitleUI({
      onStart: (nick) => this.startNewGame(nick),
      onContinue: () => this.continueGame(),
      onLeaderboard: () => this.refreshLeaderboard(),
      onCast: (i) => this.showCast(i),
    });
    this.uiRoot.addChild(this.titleUI.root);

    // 过场演出：最后挂载、zOrder 最高，覆盖所有面板
    this.cutscene = new Cutscene(this.viewW, this.viewH);
    this.uiRoot.addChild(this.cutscene.root);

    // 移动端触控层：构造后按设备能力决定是否可见
    this.mobile = new MobileControls(this.input, this.player);
    this.uiRoot.addChild(this.mobile.root);
    this.mobile.setVisible(isTouchDevice());

    this.hintText = text("", { size: 14, color: "#e8ecf5", bold: true, align: "center", width: 600, stroke: "#000000" });
    this.hintText.visible = false;
    this.uiRoot.addChild(this.hintText);

    // Laya 的 Sprite.mouseEnabled 默认为 false，UI 面板的 root 须显式开启命中，
    // 否则整层 UI 在真实鼠标下完全不可点击（仅代码调用能驱动，掩盖了交互缺陷）。
    // 跳过纯装饰的全屏层（vignette / edgeLayer 有实际绘制边界会拦截点击）。
    this.enableUIRoots();

    // 合并第二章剧情/任务到全局表（chapter2 的对话与任务节点在此注入）
    Object.assign(STORY, CH2_STORY);
    Object.assign(STORY, SOCIAL_STORY);
    Object.assign(STORY, ENCOUNTER_STORY);
    Object.assign(STORY, SIDE_STORY);
    Object.assign(QUESTS, CH2_QUESTS);

    this.dialogue = new DialogueRunner(STORY, {
      applyEffects: (effects: StoryEffect[]) => this.applyEffects(effects),
      cond: (c) => this.evalCond(c),
    });

    this.input.attach();
    this.layoutAll();
    Laya.stage.on(Laya.Event.RESIZE, this, this.layoutAll);
    Laya.timer.frameLoop(1, this, () => this.onFrame());

    this.enterTitle();
    void loadOverride().then((o) => {
      if (o.skills) applySkillOverride(o.skills);
      if (o.monsters) applyMonsterOverride(o.monsters);
    });
  }

  // ================= 布局 =================

  /**
   * 计算 SCALE_NOBORDER 下的边缘裁切量（设计像素）。
   * NOBORDER 等比放大铺满屏幕，超出部分裁切：宽屏（手机横置）上下裁、窄屏（竖置）左右裁。
   * 再叠加一层固定安全余量，避开刘海 / 底部手势条等系统 UI。HUD 与移动控件据此内缩。
   */
  /**
   * 读取设备真实安全区（刘海 / 圆角 / 底部手势条），经 CSS env(safe-area-inset-*) 探测。
   * 返回 CSS 像素；会被换算进设计坐标后叠加到 safeInset。不支持时回退 0。
   */
  private deviceSafeArea(): { top: number; bottom: number; left: number; right: number } {
    const z = { top: 0, bottom: 0, left: 0, right: 0 };
    try {
      if (typeof document === "undefined" || !document.body) return z;
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;left:0;top:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none;";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const px = (v: string) => parseFloat(v) || 0;
      z.top = px(cs.paddingTop);
      z.right = px(cs.paddingRight);
      z.bottom = px(cs.paddingBottom);
      z.left = px(cs.paddingLeft);
      document.body.removeChild(probe);
    } catch {
      /* env 不支持或读取失败，回退 0 */
    }
    return z;
  }

  /**
   * 安全内缩：在信箱黑边余量基础上，叠加真实设备安全区（刘海/底部手势条），
   * HUD 与移动控件据此内缩，避免被系统 UI 遮挡。
   */
  private computeSafeInset(): void {
    const DW = 1280, DH = 720, SAFE = 14;
    const sw = (typeof window !== "undefined" && (window as any).innerWidth) || DW;
    const sh = (typeof window !== "undefined" && (window as any).innerHeight) || DH;
    const scale = Math.max(sw / DW, sh / DH) || 1;
    const visW = sw / scale; // 可见设计宽度
    const visH = sh / scale; // 可见设计高度
    const cx = Math.max(0, (DW - visW) / 2);
    const cy = Math.max(0, (DH - visH) / 2);
    const s = Math.min(sw / DW, sh / DH) || 1; // SCALE_SHOWALL 实际缩放：CSS 像素 → 设计坐标
    const dev = this.deviceSafeArea();
    this.safeInset = {
      top: cy + SAFE + dev.top / s,
      bottom: cy + SAFE + dev.bottom / s,
      left: cx + SAFE + dev.left / s,
      right: cx + SAFE + dev.right / s,
    };
  }

  private layoutAll(): void {
    this.viewW = Laya.stage.width;
    this.viewH = Laya.stage.height;
    this.computeSafeInset();
    this.hud.layout(this.viewW, this.viewH, this.safeInset.top, this.safeInset.bottom, this.safeInset.right);
    this.skillBar.layout(this.viewW, this.viewH, this.safeInset.bottom);
    this.bag.root.x = this.viewW / 2 - 280;
    this.bag.root.y = this.viewH / 2 - 230;
    this.skillPanel.root.x = this.viewW / 2 - 280;
    this.skillPanel.root.y = this.viewH / 2 - 230;
    this.shopPanel.root.x = this.viewW / 2 - 280;
    this.shopPanel.root.y = this.viewH / 2 - 230;
    this.forgePanel.root.x = this.viewW / 2 - 280;
    this.forgePanel.root.y = this.viewH / 2 - 230;
    this.beastPanel.root.x = this.viewW / 2 - 260;
    this.beastPanel.root.y = this.viewH / 2 - 215;
    this.towerPanel.root.x = this.viewW / 2 - 180;
    this.towerPanel.root.y = this.viewH / 2 - 150;
    this.arenaPanel.root.x = this.viewW / 2 - 200;
    this.arenaPanel.root.y = this.viewH / 2 - 170;
    this.sectPanel.root.x = this.viewW / 2 - 280;
    this.sectPanel.root.y = this.viewH / 2 - 230;
    this.transferPanel.root.x = this.viewW / 2 - 280;
    this.transferPanel.root.y = this.viewH / 2 - 230;
    this.dlgBox.layout(this.viewW, this.viewH);
    this.minimap.layout(this.viewW, this.viewH);
    this.buildPanel.layout(this.viewW, this.viewH);
    this.worldMap.layout(this.viewW, this.viewH);
    this.castPanel.layout(this.viewW, this.viewH);
    this.titleUI.layout(this.viewW, this.viewH);
    this.resultUI.layout(this.viewW, this.viewH);
    this.hintText.x = this.viewW / 2 - 300;
    this.hintText.y = this.viewH - 120;
    this.cutscene?.resize(this.viewW, this.viewH);
    this.mobile?.setVisible(isTouchDevice());
    this.mobile?.layout(this.viewW, this.viewH, this.safeInset.top, this.safeInset.bottom, this.safeInset.left, this.safeInset.right);
    this.vignetteW = this.viewW;
    this.vignetteH = this.viewH;
    this.ambience?.layout(this.viewW, this.viewH);
    this.vignette.graphics.clear();
    this.vignette.graphics.drawRect(0, 0, this.viewW, this.viewH, "#c2453d", null, 0);
    // 常驻暗角：同心环叠出径向渐变（中心透明、边缘加深），制造屏幕空间纵深
    const av = this.atmoVignette.graphics;
    av.clear();
    const cx = this.viewW / 2, cy = this.viewH / 2;
    const R = Math.hypot(this.viewW, this.viewH) / 2;
    const step = 16;
    for (let r = R; r > 0; r -= step) {
      const a = Math.max(0, (r / R - 0.52)) * 0.42;
      if (a <= 0.001) continue;
      av.drawCircle(cx, cy, r, null, "#05070d", step, Math.min(0.22, a));
    }
  }

  /** 低血（<30%）时屏幕红色呼吸晕影，提醒玩家危机 */
  private updateVignette(dt: number): void {
    const ratio = this.player.hp / Math.max(1, this.player.maxHp);
    const danger = ratio < 0.3;
    const target = danger ? 0.16 + 0.12 * Math.sin(this.elapsed * 4) : 0;
    this.vignette.alpha += (target - this.vignette.alpha) * Math.min(1, dt * 6);
  }

  // ================= 场景装配 =================

  private resetPlayer(nickname: string): void {
    if (this.player) this.map.removeActor(this.player.rig.root);
    this.player = new Player({ gx: this.currentMap.playerSpawn.gx, gy: this.currentMap.playerSpawn.gy, nickname });
    this.map.addActor(this.player.rig.root);
    this.prevPlayerHp = this.player.hp;
    // 面板跟随新玩家
    this.bag?.setPlayer(this.player);
    this.skillPanel?.setPlayer(this.player);
    this.buildPanel?.setPlayer(this.player);
    this.shopPanel?.setPlayer(this.player);
    this.forgePanel?.setPlayer(this.player);
    this.beastPanel?.setPlayer(this.player);
    this.towerPanel?.setPlayer(this.player);
    this.sectPanel?.setPlayer(this.player);
    this.talentPanel?.setPlayer(this.player);
    this.artifactPanel?.setPlayer(this.player);
    this.codexPanel?.setPlayer(this.player);
    this.achievementsPanel?.setPlayer(this.player);
    this.dailyPanel?.setPlayer(this.player);
    this.schoolPanel?.setPlayer(this.player);
    this.battlePassPanel?.setPlayer(this.player);
    this.mobile?.setPlayer(this.player);
    this.lastAchCount = this.player.achievements.unlocked.length;
    this.player.refreshDaily(this.todayStr());
    this.player.claimLoginEvents(Date.now(), this.todayStr());
    if (this.tutorial) {
      this.tutorial.done = this.player.tutorialDone;
      this.tutPrev = { gx: this.player.gx, gy: this.player.gy, learned: this.player.learned.length, kills: this.player.kills, dlg: this.tutDialogueOpens };
    }
    this.clearMonsters();
    this.target = null;
    this.projectiles.forEach((p) => p.sprite.destroy?.());
    this.projectiles = [];
  }

  private clearMonsters(): void {
    for (const m of this.monsters) this.map.removeActor(m.rig.root);
    this.monsters = [];
    this.map.telegraphLayer.graphics.clear();
  }

  private buildNpcs(npcs: NpcDef[]): void {
    for (const def of npcs) {
      // 每个 NPC 走独立 Rig：有 cutout 立绘则绘贴图，否则回落程序化骨架
      const rig = new Rig(def.color, 1, { horn: def.horn, img: def.cut });
      const p = gridToScreen(def.gx, def.gy);
      rig.root.pos(p.x, p.y);
      const label = text(def.name, { size: 12, color: "#ffd166", bold: true, align: "center", width: 100, stroke: "#000000" });
      label.pos(-50, -82);
      label.scale(1 / this.map.zoom, 1 / this.map.zoom);
      rig.root.addChild(label);
      this.map.actorLayer.addChild(rig.root);
      this.npcs.push({ def, sprite: rig.root, rig });
    }
  }

  /** 美术资源异步到位后重绘所有依赖贴图的界面（NPC 立绘由 Rig.update 自取，无需此处处理） */
  private repaintArt(): void {
    this.worldMap?.refresh();
    this.castPanel?.refresh();
    this.hud?.refreshPortrait();
  }

  /** 若有任一面板/对话开启则视为「被占用」，阻止世界交互（含传送触发） */
  private anyPanelOpen(): boolean {
    return (
      this.bag.visible ||
      this.skillPanel.visible ||
      this.shopPanel.visible ||
      this.forgePanel.visible ||
      this.beastPanel.visible ||
      this.towerPanel.visible ||
      this.arenaPanel.visible ||
      this.transferPanel.visible ||
      this.buildPanel.visible ||
      this.talentPanel.visible ||
      this.artifactPanel.visible ||
      this.codexPanel.visible ||
      this.achievementsPanel.visible ||
      this.dailyPanel.visible ||
      this.schoolPanel.visible ||
      this.battlePassPanel.visible ||
      this.eventPanel.visible ||
      this.socialPanel.visible ||
      this.offlinePanel.visible ||
      this.worldMap.visible ||
      this.castPanel.visible ||
      this.dialogue.isOpen
    );
  }

  /** 切图：替换当前地图、重建地面/NPC/传送阵，保留玩家对象与世界相机 */
  private enterZone(zoneId: string, spawn?: { gx: number; gy: number }, fromTransfer = false): void {
    const zone = ZONES[zoneId];
    if (!zone) return;
    // 离开秘境时清掉本层增益/诅咒，避免泄漏到其它区域
    if (this.currentZoneId === "rogue" && zoneId !== "rogue" && this.rogueBuffKind) {
      this.player.removeBuffKind(this.rogueBuffKind);
    }
    this.currentZoneId = zoneId;
    this.player.chapter = zone.chapter;
    if (!this.player.unlockedZones.includes(zoneId)) this.player.unlockedZones.push(zoneId);
    this.currentMap = zone.map;
    setCurrentMap(zone.map);
    // 主题：主城落霞镇（现已为青玉仙镇）套用专属青玉主题；其余区域沿用循环切换的主题
    const themeName = zoneId === "ch1" ? "yunhuang" : THEME_ORDER[this.themeIdx];
    this.map.setTheme(themeName);
    this.ambience.setTheme(themeName);
    // 先清怪（removeActor 正常）再 rebuild（rebuild 会 removeChildren 清空角色层）
    this.clearMonsters();
    this.map.rebuild(zone.map);
    for (const n of this.npcs) n.sprite.destroy?.();
    this.npcs = [];
    this.buildNpcs(zone.npcs);
    this.addPortals(zone);
    this.buildGathers(zone);
    this.addGatherMarkers();
    this.buildChests(zone);
    this.addChestMarkers();
    this.encounterTimer = 30 + Math.random() * 30;
    this.dynSpawnT = zone.dynamicSpawn ? zone.dynamicSpawn.interval : 0;
    // rebuild 清空了角色层，重新挂载玩家精灵
    this.map.addActor(this.player.rig.root);
    this.syncStructures();
    this.minimap.setMap(zone.map, zoneId === "ch2" ? "乱星海" : zoneId === "rogue" ? "秘境 · 无限回廊" : zoneId === "dungeon" ? "秘境 · 残破洞天" : "青玉仙镇");
    this.worldMap.setProgress(zoneId, this.player.unlockedZones);
    this.transferCooldown = 1.0;
    this.shopPanel.hide();
    this.forgePanel.hide();
    this.beastPanel.hide();
    this.towerPanel.hide();
    this.arenaPanel.hide();
    this.eventPanel.hide();
    this.socialPanel.hide();
    this.sectPanel.hide();
    this.talentPanel.hide();
    this.artifactPanel.hide();
    this.codexPanel.hide();
    this.achievementsPanel.hide();
    this.dailyPanel.hide();
    this.schoolPanel.hide();
    this.battlePassPanel.hide();
    this.offlinePanel.hide();
    this.bag.hide();
    this.skillPanel.hide();
    this.buildPanel.hide();
    this.transferPanel.hide();
    // 秘境灵气：进入即持续回血；秘境自动镇守 Boss
    if (zone.buff) this.player.addBuff({ ...zone.buff });
    if (zoneId === "dungeon") this.player.flags["boss_spawned"] = true;
    if (zoneId === "zhuomo") this.player.flags["boss_spawned"] = true;
    if (spawn) {
      this.player.gx = spawn.gx + 0.5;
      this.player.gy = spawn.gy + 0.5;
    }
    this.player.stop();
    if (fromTransfer && zoneId === "ch2") {
      // 第二章开场演出
      this.cutscene.play({
        title: "第二章 · 乱星海",
        sub: "星海之上，蛟影翻波",
        lines: ["拜入玄水宗，你随师门远赴乱星海。", "海上星岛错落，妖气弥漫，覆海蛟盘踞高台。"],
      });
    }
    if (fromTransfer) {
      this.hint(
        zoneId === "ch2" ? "灵光散去，你已身处乱星海。"
          : zoneId === "dungeon" ? "石门在你身后合拢，洞天灵气涌入经脉。"
          : "你回到了落霞镇。",
      );
    }
  }

  /** 在当前地图的传送点处绘制发光符文环（地贴，置于建筑层） */
  private addPortals(zone: ZoneDef): void {
    for (const t of zone.transfers) {
      if (t.to === "zhuomo" && this.player.reincarnations < 1) continue; // 飞升前不显示坠魔谷传送阵
      const p = gridToScreen(t.gx, t.gy);
      const s = new Laya.Sprite();
      const g = s.graphics;
      g.drawCircle(p.x, p.y, 26, "rgba(46,107,138,0.35)", "#7fd0e0", 2);
      g.drawCircle(p.x, p.y, 16, "rgba(127,208,224,0.25)", null, 0);
      g.drawPoly(0, 0, [p.x, p.y - 22, p.x + 9, p.y, p.x, p.y + 22, p.x - 9, p.y], "#dff6ff", "#7fd0e0", 1);
      s.scale(1 / this.map.zoom, 1 / this.map.zoom);
      this.map.structureLayer.addChild(s);
    }
  }

  private openTransfer(t: TransferDef): void {
    if (t.to === "zhuomo" && this.player.reincarnations < 1) {
      this.hint("坠魔谷需在飞升之后方可踏入");
      return;
    }
    this.pendingTransfer = t;
    this.transferPanel.show(t);
  }

  /** 构建当前 zone 的可采集点：坐标不可走时吸附到最近可走格（保证玩家可踩中） */
  private buildGathers(zone: ZoneDef): void {
    const out: GatherNode[] = [];
    for (const g of zone.gathers || []) {
      let x = g.gx, y = g.gy;
      if (!isWalkable(x, y)) {
        let found = false;
        for (let r = 1; r <= 3 && !found; r++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            for (let dy = -r; dy <= r && !found; dy++) {
              if (Math.abs(dx) + Math.abs(dy) !== r) continue;
              if (isWalkable(x + dx, y + dy)) { x += dx; y += dy; found = true; }
            }
          }
        }
        if (!found) continue;
      }
      out.push({ ...g, gx: x, gy: y });
    }
    this.activeGathers = out;
  }

  /** 绘制采集点地面标记（草绿圆 + 名称），与 NPC 同置于角色层 */
  private addGatherMarkers(): void {
    for (const g of this.activeGathers) {
      const def = getItem(g.mat);
      const p = gridToScreen(g.gx, g.gy);
      const s = new Laya.Sprite();
      const gfx = s.graphics;
      gfx.drawCircle(p.x, p.y, 14, "rgba(106,191,105,0.28)", "#9be29b", 2);
      const label = text(def?.name || g.mat, { size: 11, color: "#9be29b", bold: true, align: "center", width: 80, stroke: "#000000" });
      label.pos(p.x - 40, p.y - 6);
      s.addChild(label);
      this.map.actorLayer.addChild(s);
    }
  }

  /** 检测玩家当前格是否踩中未冷却的采集点 */
  private updateNearGather(): void {
    const pgx = Math.floor(this.player.gx), pgy = Math.floor(this.player.gy);
    let near: GatherNode | null = null;
    for (const g of this.activeGathers) {
      if (g.gx === pgx && g.gy === pgy && (this.gatherCd[`${g.gx},${g.gy}`] || 0) <= 0) { near = g; break; }
    }
    this.nearGather = near;
  }

  /** 采集：获得材料并进入冷却 */
  private gather(g: GatherNode): void {
    const got = this.player.addItem(g.mat, g.n);
    if (got > 0) {
      const name = getItem(g.mat)?.name || g.mat;
      this.hint(`采得 ${name}×${got}`);
      this.gatherCd[`${g.gx},${g.gy}`] = g.cd || 30;
    }
  }

  /** 奇遇事件 + 动态刷怪（P3-5余）：每帧驱动，独立于任务刷怪 */
  private worldEvents(dt: number): void {
    this.dynSpawnTick(dt); // 动态刷怪（每帧计时，独立判定上限/间隔）
    this.encounterTimer -= dt;
    if (this.encounterTimer > 0) return;
    this.encounterTimer = 60 + Math.random() * 60;
    if (this.dialogue.isOpen || this.cutscene.active || this.anyPanelOpen()) return;
    const enc = this.currentZoneDef().encounters;
    if (!enc || enc.length === 0) return;
    const id = enc[Math.floor(Math.random() * enc.length)];
    if (!STORY[id]) return;
    this.dialogue.open(id);
    this.openDialogueBox();
    this.hint("你遭遇了一段奇遇……");
  }

  /** 构建当前 zone 的宝箱：过滤已开启（持久化于 flags）并对不可走坐标吸附 */
  private buildChests(zone: ZoneDef): void {
    const id0 = zone.id;
    const out: ChestNode[] = [];
    for (const c of zone.chests || []) {
      const key = `chest:${id0}:${c.gx},${c.gy}`;
      if ((c.cd === undefined || c.cd === 0) && this.player.flags[key]) continue; // 一次性宝箱已开
      let x = c.gx, y = c.gy;
      if (!isWalkable(x, y)) {
        let found = false;
        for (let r = 1; r <= 3 && !found; r++)
          for (let dx = -r; dx <= r && !found; dx++)
            for (let dy = -r; dy <= r && !found; dy++) {
              if (Math.abs(dx) + Math.abs(dy) !== r) continue;
              if (isWalkable(x + dx, y + dy)) { x += dx; y += dy; found = true; }
            }
        if (!found) continue;
      }
      out.push({ ...c, gx: x, gy: y });
    }
    this.activeChests = out;
  }

  /** 绘制宝箱地面标记（金色箱；隐藏宝箱不显示标记） */
  private addChestMarkers(): void {
    for (const c of this.activeChests) {
      if (c.hidden) continue;
      const p = gridToScreen(c.gx, c.gy);
      const s = new Laya.Sprite();
      const gfx = s.graphics;
      gfx.drawRect(p.x - 12, p.y - 10, 24, 20, "rgba(201,162,39,0.85)", "#ffe08a", 2);
      gfx.drawCircle(p.x, p.y - 4, 3, "#fff3c4");
      this.map.actorLayer.addChild(s);
    }
  }

  /** 检测玩家当前格是否踩中未冷却/未开启的宝箱 */
  private updateNearChest(): void {
    const pgx = Math.floor(this.player.gx), pgy = Math.floor(this.player.gy);
    const id0 = this.currentZoneId;
    let near: ChestNode | null = null;
    for (const c of this.activeChests) {
      if (c.gx === pgx && c.gy === pgy) {
        const oneTimeDone = (c.cd === undefined || c.cd === 0) && this.player.flags[`chest:${id0}:${c.gx},${c.gy}`];
        if (!oneTimeDone && (this.chestCd[`${c.gx},${c.gy}`] || 0) <= 0) { near = c; break; }
      }
    }
    this.nearChest = near;
  }

  /** 开启宝箱：掷算掉落并发放，记录已开/进入冷却 */
  private openChest(c: ChestNode): void {
    const id0 = this.currentZoneId;
    const key = `chest:${id0}:${c.gx},${c.gy}`;
    const names: string[] = [];
    for (const l of c.loot) {
      if (Math.random() < l.chance) {
        const got = this.player.addItem(l.id, l.count);
        if (got > 0) names.push(`${getItem(l.id)?.name || l.id}×${got}`);
      }
    }
    if (names.length) this.hint(`开启宝箱：${names.join("，")}`);
    else this.hint("宝箱空空如也。");
    if (c.cd && c.cd > 0) this.chestCd[`${c.gx},${c.gy}`] = c.cd;
    else this.player.flags[key] = true; // 一次性宝箱持久标记已开
    this.nearChest = null;
  }

  /** 动态刷怪：按区域配置周期性在玩家附近补充野怪（独立于任务刷怪） */
  private dynSpawnTick(dt: number): void {
    const cfg = this.currentZoneDef().dynamicSpawn;
    if (!cfg) return;
    this.dynSpawnT -= dt;
    if (this.dynSpawnT > 0) return;
    this.dynSpawnT = cfg.interval;
    const alive = this.monsters.filter((m) => m.alive && !m.isBoss).length;
    if (alive >= cfg.maxAlive) return;
    const px = Math.floor(this.player.gx), py = Math.floor(this.player.gy);
    for (let tries = 0; tries < 12; tries++) {
      const dx = Math.floor((Math.random() - 0.5) * 8);
      const dy = Math.floor((Math.random() - 0.5) * 8);
      const gx = px + dx, gy = py + dy;
      if (isWalkable(gx, gy) && (gx !== px || gy !== py)) {
        const id = cfg.pool[Math.floor(Math.random() * cfg.pool.length)];
        const m = new Monster(getMonster(id), gx + 0.5, gy + 0.5, 2000 + Math.floor(Math.random() * 99999), cfg.aggro ?? 2);
        this.monsters.push(m);
        this.map.addActor(m.rig.root);
        return;
      }
    }
  }

  private confirmTransfer(): void {
    if (!this.pendingTransfer) return;
    const t = this.pendingTransfer;
    this.pendingTransfer = null;
    if (t.to === "rogue") { this.enterRogue(t.spawn); return; }
    this.enterZone(t.to, t.spawn, true);
  }

  // ================= 流程 =================

  /** 开启所有 UI 面板的鼠标命中（Laya Sprite.mouseEnabled 默认 false）。
   *  关键点：Laya 的事件命中要求「整条祖先链」都 mouseEnabled=true，
   *  因此必须同时开启 uiRoot 本身，否则其下所有面板/按钮在真实鼠标下都收不到事件。
   *  仅跳过纯装饰全屏层（vignette / edgeLayer 有实际绘制边界，开启后会拦截点击）。 */
  private enableUIRoots(): void {
    this.uiRoot.mouseEnabled = true;
    const skip = new Set<any>([this.vignette, this.edgeLayer]);
    for (const c of this.uiRoot._children as any[]) {
      if (skip.has(c)) continue;
      c.mouseEnabled = true; // 各面板 root；其子级（按钮/自定义可点精灵）各自按需开启
    }
  }

  private async enterTitle(): Promise<void> {
    this.phase = "title";
    this.ambience?.clear();
    this.titleUI.show();
    const local = LocalStorage.read();
    this.titleUI.setContinueEnabled(!!local);
    this.refreshLeaderboard();
  }

  private startNewGame(nickname: string): void {
    this.phase = "play";
    this.titleUI.hide();
    this.resultUI.hide();
    this.shopPanel.hide();
    this.forgePanel.hide();
    this.beastPanel.hide();
    this.towerPanel.hide();
    this.arenaPanel.hide();
    this.eventPanel.hide();
    this.socialPanel.hide();
    this.sectPanel.hide();
    this.resetPlayer(nickname);
    // 开局赠送：伴生灵兽「青鸾」+ 数枚捕兽铃（仅新开局；读档走 applySave 不再赠送）
    if (this.player.beasts.length === 0) {
      this.player.addBeast("qingluan");
      this.player.setActiveBeast("qingluan");
      this.player.addItem("capture-bell", 3);
    }
    // P3-7 多周目：继承元进度（跨周目加成，与单局存档独立）
    const meta = loadMeta();
    if (meta.ngPlus > 0) {
      const carry = carryover(meta.ngPlus);
      this.player.expMulNg = carry.expMul;
      this.player.ngPlus = meta.ngPlus;
      this.player.gainExp(carry.bonusExp);
      this.player.stones += carry.bonusStones;
      this.hint(`轮回 第${meta.ngPlus}周目：继承修为+${carry.bonusExp}、灵石+${carry.bonusStones}、历练效率×${carry.expMul.toFixed(1)}`);
    }
    this.player.markActive();
    this.enterZone("ch1", undefined, false);
    this.elapsed = 0;
    this.spawnT = 1;
    this.wonHandled = false;
    this.saveMgr.login(nickname).then((t) => {
      this.token = t;
      if (this.token) LocalStorage.writeToken(this.token);
    });
    this.dialogue.open(CHAPTER1_START);
    this.openDialogueBox();
    this.hint("点击地面移动 · 靠近他人按 F 交谈 · 1-4 施法 · B 背包 · N 建造 · G 三界舆图 · Y 人物志 · 右上小地图可导航");
    if (!this.player.tutorialDone) this.tutorial.start();
    this.saveGame();
  }

  private async continueGame(): Promise<void> {
    this.token = LocalStorage.readToken();
    const data = await this.saveMgr.load(this.token);
    if (!data) {
      this.hint("没有找到存档，请开始新的修行");
      return;
    }
    this.phase = "play";
    this.titleUI.hide();
    this.resultUI.hide();
    const chapter = (data.chapter as number) || 1;
    const zoneId = chapter >= 2 && ZONES["ch2"] ? "ch2" : "ch1";
    this.resetPlayer(data.nickname || "无名散修");
    this.enterZone(zoneId, undefined, false);
    this.player.applySave(data, this.currentMap.playerSpawn);
    // 云社交档案（远程优先、本地兜底）：覆盖本地社交状态
    await this.pullCloudSocial();
    // 离线收益：基于上次活跃时间折算修为/灵石（封顶 12h），弹面板
    const off = this.player.collectOffline(Date.now());
    if (off) this.offlinePanel.show(off);
    this.maybeTribulate();
    this.syncStructures();
    this.elapsed = (data.playMs || 0) / 1000;
    this.spawnT = 0.5;
    this.wonHandled = !!(this.player.flags["ch1_win"] || this.player.flags["ch2_win"]);
    this.hint("存档已恢复（位置回到落霞村）");
    this.saveGame();
  }

  private async refreshLeaderboard(): Promise<void> {
    const entries = await this.cloud.leaderboard();
    this.titleUI.showLeaderboard(entries);
  }

  /** 拉取云端社交档案并覆盖本地（云优先；无 token 或失败则保留本地） */
  private async pullCloudSocial(): Promise<void> {
    if (!this.token) return;
    const p = await this.cloud.getSocial(this.token);
    if (p) this.player.applySocial(p);
  }

  // ================= 帧循环 =================

  private onFrame(): void {
    const now = Date.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    dt = Math.min(dt, 0.05);
    this.ambience.update(dt);
    // 慢动作：缩放世界更新时间（处决/破防演出用），UI/输入不受影响
    if (this.slowmoT > 0) {
      this.slowmoT = Math.max(0, this.slowmoT - dt);
      const k = this.slowmoDur > 0 ? this.slowmoT / this.slowmoDur : 0;
      this.timeScale = this.slowmoScale + (1 - this.slowmoScale) * (1 - k);
      if (this.slowmoT === 0) this.timeScale = 1;
    }
    const worldDt = dt * this.timeScale;

    this.input.poll();
    // 移动端控件交互态：仅游玩中且无面板/对话/过场时可操作（否则隐藏，避免遮挡面板与背后输入）
    this.mobile?.setInteractive(this.phase === "play" && !this.dialogue.isOpen && !this.cutscene.active && !this.anyPanelOpen());
    // 过场进行中：冻结世界，仅推进过场与特效；点击/空格/ESC 可推进或跳过
    if (this.cutscene.active) {
      this.cutscene.update(dt);
      if (this.input.consumeClick() || this.input.wasPressed(Key.SPACE) || this.input.wasPressed(Key.ESC)) this.cutscene.advance();
      // 天劫演出：雷暴 + 震屏
      if (this.tribulating) {
        this.cam.addTrauma(0.16);
        if (Math.random() < 0.25) this.fx?.burst(this.player.px, this.player.py - 24, "#c9a3ff", 10);
      }
      this.fx.update(dt);
      this.input.lateUpdate();
      return;
    }
    this.dlgBox.update(dt);
    this.dlgCatcher.visible = this.dialogue.isOpen;
    // 舆图「当前所在」呼吸脉冲
    if (this.worldMap?.visible) this.worldMap.update(dt);
    this.fx.update(dt);
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintText.visible = false;
    }

    if (this.phase === "play") this.updatePlay(worldDt);

    // HUD/技能栏常刷
    this.hud.update(this.player, this.bossInfo());
    this.hud.setCombo(this.combo.count, COMBO_WINDOW > 0 ? this.combo.t / COMBO_WINDOW : 0);
    this.hud.setBlock(this.player.blocking);
    this.hud.setStreak(this.streak);
    this.skillBar.update(this.player);
    this.input.lateUpdate();
    this.updateVignette(dt);

    // 程序化 BGM：按场景状态切换主题（帧驱动，无 AudioContext 时静默降级）
    if (this.phase === "play") {
      const bossNear = this.monsters.some((m) => m.alive && m.isBoss);
      const fight = this.monsters.some((m) => m.alive && Math.hypot(m.gx - this.player.gx, m.gy - this.player.gy) < 9);
      this.sfx.setTheme(bossNear ? "boss" : fight ? "battle" : "explore");
    } else {
      this.sfx.setTheme("title");
    }
    // 采集点/宝箱冷却递减（每帧游戏时间）
    for (const k in this.gatherCd) {
      if (this.gatherCd[k] > 0) this.gatherCd[k] = Math.max(0, this.gatherCd[k] - dt);
    }
    for (const k in this.chestCd) {
      if (this.chestCd[k] > 0) this.chestCd[k] = Math.max(0, this.chestCd[k] - dt);
    }
    this.sfx.tickBgm(dt);
  }

  private updatePlay(dt: number): void {
    this.elapsed += dt;
    this.player.playMs += dt * 1000;

    if (this.dialogue.isOpen) {
      // 对话期间冻结世界（玩家仍刷新 buff/动画）
      this.player.stop();
      this.player.update(dt);
      this.handleKeys();
      this.afterWorld(dt);
      return;
    }

    // 顿帧：命中瞬间冻结世界逻辑，仅推进表现（动画/震屏/特效），强化打击感
    if (this.hitstopT > 0) {
      this.hitstopT = Math.max(0, this.hitstopT - dt);
      this.player.rig.update(dt);
      for (const m of this.monsters) m.rig.update(dt);
      this.afterWorld(dt);
      return;
    }

    // 连携时间窗帧衰减（超时断裂）；命中连击数同步衰减
    this.combo = comboDecay(this.combo, dt);
    this.streakT = Math.max(0, this.streakT - dt);
    if (this.streakT <= 0) this.streak = 0;

    if (!this.player.blocking) this.handleWorldClick();
    this.handleKeys();
    this.updateAutoFight(dt);
    // 格挡姿态下站定防御（仍可翻滚脱离）；松手恢复移动
    if (this.player.blocking) this.player.stop();
    else if (this.input.joyActive && !this.player.rolling) {
      this.player.stop();
      this.player.nudge(this.input.joyX, this.input.joyY, dt);
    }
    if (this.player.rolling) this.player.stop();
    this.player.update(dt);
    this.tickCrystalSymbiosis(dt);
    this.spawnLogic(dt);
    if (this.currentZoneId === "rogue") this.updateRogue(dt);
    for (const m of this.monsters) m.update(dt, this.player);
    for (const n of this.npcs) n.rig?.update(dt);
    this.updateProjectiles(dt);
    this.resolveHits();
    this.resolveCast();
    this.updateBeast(dt);
    this.resolveDeaths();
    this.updateEventDungeon(dt);
    if (this.player.hp <= 0) {
      if (this.eventDungeon.active) { void this.endEventDungeon(false, 0, "陨落于魔尊试炼"); return; }
      if (this.currentZoneId === "tower") { this.onTowerDeath(); return; }
      if (this.currentZoneId === "rogue") { this.onRogueDeath(); return; }
    }
    this.checkTowerProgress(dt);

    // 留存系统：刷新日常 + 推进教程 + 成就/图鉴弹提示
    this.player.refreshDaily(this.todayStr());
    this.player.claimLoginEvents(Date.now(), this.todayStr());
    this.driveTutorial();
    this.driveToasts();

    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = SAVE_INTERVAL;
      this.saveGame();
    }

    // 云社交档案节流上传（小 payload、独立于整包 save；失败静默，本地不受影响）
    this.socialSyncT -= dt;
    if (this.socialSyncT <= 0) {
      this.socialSyncT = 12;
      if (this.token) {
        void this.cloud.putSocial(this.token, this.player.exportSocial());
        // P3-6：软实时在线状态上报 + 收件箱拉取（失败静默）
        void this.cloud.putPresence(this.token, this.player.gx, this.player.gy, this.currentZoneId).catch(() => {});
        this.cloud.getMail(this.token).then((m) => { if (m) this.player.syncMailbox(m); }).catch(() => {});
      }
      if (this.socialPanel.visible) this.socialPanel.tickPresence();
    }

    this.updateNearGather();
    this.updateNearChest();
    this.afterWorld(dt);

    // 传送阵检测：踏入传送点格且未占用时弹出确认
    if (this.transferCooldown > 0) {
      this.transferCooldown -= dt;
    } else {
      const pgx = Math.floor(this.player.gx);
      const pgy = Math.floor(this.player.gy);
      const t = ZONES[this.currentZoneId].transfers.find((x) => x.gx === pgx && x.gy === pgy);
      if (t && !this.anyPanelOpen()) this.openTransfer(t);
    }

    if ((this.player.flags["ch1_win"] || this.player.flags["ch2_win"]) && !this.resultUI.visible && !this.dialogue.isOpen) {
      void this.showResult();
    }
  }

  /** 地面预警层：每帧重绘敌人前摇/Boss AOE 红圈 + 玩家技能落点预览（afterWorld 在所有分支统一调用） */
  private updateTelegraphs(): void {
    const g = this.map.telegraphLayer.graphics;
    g.clear();
    const pulse = 0.8 + 0.2 * Math.sin(this.elapsed * 8);
    for (const m of this.monsters) {
      if (!m.alive) continue;
      if (m.skillWindup > 0 && m.def.skill) {
        const total = m.def.skill.telegraph ?? 0.9;
        const prog = 1 - m.skillWindup / total;
        drawTelegraphDiamond(g, m.gx, m.gy, m.def.skill.aoe, "#ff2d2d", prog, pulse);
      } else if (m.windup > 0) {
        const prog = m.windupMax > 0 ? 1 - m.windup / m.windupMax : 1;
        drawTelegraphDiamond(g, m.gx, m.gy, m.def.attackRange, "#ff5a4d", prog, pulse);
      }
    }
    // 玩家 AOE 施法落点预览（青色，区别于敌人红圈）
    const c = this.player.casting;
    if (c && c.skill.aoe > 0 && this.target && this.target.alive) {
      const d = Math.hypot(this.target.gx - this.player.gx, this.target.gy - this.player.gy);
      if (d <= c.skill.range + 0.5) {
        const prog = c.skill.castTime > 0 ? c.t / c.skill.castTime : 1;
        drawTelegraphDiamond(g, this.target.gx, this.target.gy, c.skill.aoe, "#7fd0e0", prog, pulse);
      }
    }
  }

  // ============ 演出层：Boss 登场/击杀、屏闪、低血边缘脉冲 ============

  /** 全屏闪一下：color 填充，strength 初值(0~1)，dur 秒线性衰减 */
  private flash(color: string, strength: number, dur = 0.28): void {
    this.flashColor = color;
    this.flashA = strength;
    this.flashT = dur;
    this.flashDur = dur;
    this.flashLayer.visible = true;
  }

  private updateFlash(dt: number): void {
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT / this.flashDur;
      const g = this.flashLayer.graphics;
      g.clear();
      g.drawRect(0, 0, this.viewW, this.viewH, this.flashColor, null, 0);
      this.flashLayer.alpha = this.flashA * k;
    } else if (this.flashLayer.visible) {
      this.flashLayer.visible = false;
    }
  }

  /** 低血（<30%）屏幕边缘红色脉冲：多层红描边叠出边缘辉光，随 sin 呼吸 */
  private updateEdgePulse(dt: number): void {
    const ratio = this.player.hp / Math.max(1, this.player.maxHp);
    const danger = ratio < 0.3;
    const pulse = danger ? 0.4 + 0.3 * Math.sin(this.elapsed * 6) : 0;
    const target = danger ? pulse : 0;
    this.edgeA += (target - this.edgeA) * Math.min(1, dt * 8);
    if (this.edgeA < 0.01) {
      if (this.edgeLayer.visible) this.edgeLayer.visible = false;
      return;
    }
    this.edgeLayer.visible = true;
    this.edgeLayer.alpha = Math.min(1, this.edgeA);
    const g = this.edgeLayer.graphics;
    g.clear();
    for (let i = 0; i < 6; i++) {
      const inset = i * 12;
      g.drawRect(inset, inset, this.viewW - 2 * inset, this.viewH - 2 * inset, null, "#ff2828", 16);
    }
  }

  /** Boss 登场/击杀/阶段横幅：大字下落淡出（可指定配色） */
  private bossBanner(text: string, color = "#ff5a5a"): void {
    this.bossBannerText.text = text;
    this.bossBannerText.color = color;
    this.bossBannerText.alpha = 1;
    this.bossBannerT = 1.5;
  }

  private updateBanner(dt: number): void {
    if (this.bossBannerT > 0) {
      this.bossBannerT = Math.max(0, this.bossBannerT - dt);
      const k = this.bossBannerT / 1.5;
      this.bossBannerText.alpha = Math.min(1, k * 1.6);
      this.bossBannerText.y = this.viewH * 0.28 - (1.5 - this.bossBannerT) * 22;
    } else if (this.bossBannerText.alpha > 0) {
      this.bossBannerText.alpha = 0;
    }
  }

  /** Boss 登场演出：推拉镜头 + 屏闪 + 短顿帧 + 横幅 */
  private bossEntranceFx(m: Monster): void {
    this.cam.addTrauma(0.5);
    this.cam.punchZoom(1.15, 0.6);
    this.flash("#c2185b", 0.5, 0.35);
    this.hitstopT = Math.max(this.hitstopT, 0.12);
    this.sfx.boss();
    this.bossBanner(m.def.name + " 现身！");
  }

  /** Boss 击杀演出：强震屏 + 白闪 + 爆裂 + 横幅 */
  private bossDeathFx(m: Monster): void {
    this.cam.addTrauma(0.85);
    this.cam.punchZoom(1.12, 0.55);
    this.flash("#ffffff", 0.6, 0.32);
    this.hitstopT = Math.max(this.hitstopT, 0.1);
    this.fx.burst(m.px, m.headY, "#ffd166", 14);
    this.bossBanner(m.def.name + " 伏诛！");
  }

  /** 触发慢动作：dur 秒内世界按 scale 倍速运行，再缓回正常（UI/输入不受影响） */
  private setSlowmo(dur: number, scale = 0.25): void {
    this.slowmoDur = dur;
    this.slowmoT = dur;
    this.slowmoScale = scale;
    this.timeScale = scale;
  }

  /** 破防演出：青色屏闪 + 短顿帧 + 大字 + 脆裂音 + 微慢动作 */
  private onBreak(m: Monster): void {
    this.flash("#28e0c8", 0.4, 0.25);
    this.cam.addTrauma(0.3);
    this.hitstopT = Math.max(this.hitstopT, 0.04);
    this.sfx.brk();
    this.setSlowmo(0.18, 0.5);
    this.fx.floatText(m.px, m.headY, "破防!", "#28e0c8", 18);
    this.fx.burst(m.px, m.py - 20, "#28e0c8", 8);
  }

  /** 处决演出：金白屏闪 + 长顿帧 + 推镜 + 大字 + 冲击波环 + 英雄音 + 慢动作，并按残血/BOSS 结算处决伤害 */
  private onExecute(m: Monster): void {
    this.flash("#fff2c2", 0.7, 0.35);
    this.hitstopT = Math.max(this.hitstopT, 0.12);
    this.cam.addTrauma(0.85);
    this.cam.punchZoom(1.18, 0.5);
    this.sfx.exec();
    this.setSlowmo(0.5, 0.18);
    this.fx.floatText(m.px, m.headY, "处决!", "#ffd166", 22);
    this.fx.burst(m.px, m.py - 20, "#ffd166", 12);
    this.fx.ring(m.px, m.headY, "#ffd166", 0.5);
    if (m.isBoss) m.takeDamage(Math.round(m.maxHp * 0.4));
    else m.takeDamage(m.hp + 1);
    m.broken = false;
    m.brokenT = 0;
    m.poise = m.maxPoise;
  }

  /** 感电反应：额外伤害 + 蓝色屏闪 + 电弧爆裂 + 冲击环 + 大字 + 电火花音 */
  private triggerShock(m: Monster, crit: boolean): void {
    const bonus = Math.round(m.maxHp * 0.06) + (crit ? 20 : 0);
    m.takeDamage(bonus);
    this.flash("#bfe9ff", 0.35, 0.25);
    this.sfx.shock();
    this.fx.floatText(m.px, m.headY, "感电!", "#9fe8ff", 16);
    this.fx.burst(m.px, m.py - 20, "#cfe9ff", 8);
    this.fx.ring(m.px, m.headY, "#bfe9ff", 0.3);
    this.cam.addTrauma(0.25);
    this.chainShock(m);
  }

  /** 感电连锁：电弧从源点依次跳跃到邻近敌人（链式，最多 4 跳，不重复击中，末跳递减） */
  private chainShock(src: Monster): void {
    const R = 3.5;
    const MAX_HOPS = 4;
    const hit = new Set<Monster>([src]);
    let from = src;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      let best: Monster | null = null;
      let bestD = R;
      for (const m of this.monsters) {
        if (hit.has(m) || !m.alive) continue;
        const d = Math.hypot(m.gx - from.gx, m.gy - from.gy);
        if (d <= bestD) { bestD = d; best = m; }
      }
      if (!best) break;
      const bonus = Math.round((best.maxHp * 0.04 + 6) * (1 - 0.12 * hop));
      best.takeDamage(bonus);
      best.addBuff({ kind: "shock", value: 5, t: 2 });
      this.fx.arc(from.px, from.headY, best.px, best.headY, "#bfe9ff");
      this.fx.floatText(best.px, best.headY, "感电!", "#9fe8ff", 14);
      hit.add(best);
      from = best;
    }
  }

  /** 蒸发反应：火 + 水 = 蒸发（额外伤害，消耗湿润转为灼烧） */
  private triggerVaporize(m: Monster): void {
    const bonus = Math.round(m.maxHp * 0.05) + 10;
    m.takeDamage(bonus);
    m.removeBuffKind("wet");
    this.flash("#ffd9a0", 0.3, 0.22);
    this.sfx.vapor();
    this.fx.floatText(m.px, m.headY, "蒸发!", "#ffcf8a", 16);
    this.fx.burst(m.px, m.py - 20, "#e8e8e8", 10);
    this.fx.ring(m.px, m.headY, "#ffd9a0", 0.3);
    this.cam.addTrauma(0.2);
  }

  /** 导电反应：雷 + 水 = 导电（额外伤害 + 残留感电态，消耗湿润） */
  private triggerElectro(m: Monster): void {
    const bonus = Math.round(m.maxHp * 0.05) + 8;
    m.takeDamage(bonus);
    m.removeBuffKind("wet");
    this.flash("#bfe9ff", 0.32, 0.22);
    this.sfx.shock();
    this.fx.floatText(m.px, m.headY, "导电!", "#9fe8ff", 16);
    this.fx.burst(m.px, m.py - 20, "#cfe9ff", 8);
    this.fx.ring(m.px, m.headY, "#bfe9ff", 0.3);
    this.cam.addTrauma(0.25);
    this.chainShock(m);
  }

  /** 融化反应：火 + 冰 = 融化（高爆发伤害，消耗冰封转灼烧） */
  private triggerMelt(m: Monster): void {
    const bonus = Math.round(m.maxHp * 0.08) + 15;
    m.takeDamage(bonus);
    m.removeBuffKind("chill");
    this.flash("#ff8a3c", 0.35, 0.25);
    this.sfx.melt();
    this.fx.floatText(m.px, m.headY, "融化!", "#ffb066", 16);
    this.fx.burst(m.px, m.py - 20, "#ffb066", 10);
    this.fx.ring(m.px, m.headY, "#ff8a3c", 0.32);
    this.cam.addTrauma(0.3);
  }

  /** 超导反应：雷 + 冰 = 超导（额外伤害 + 麻痹减速，消耗冰封，并连锁） */
  private triggerSuperconduct(m: Monster): void {
    const bonus = Math.round(m.maxHp * 0.05) + 8;
    m.takeDamage(bonus);
    m.removeBuffKind("chill");
    m.addBuff({ kind: "slow", value: 0.4, t: 3 });
    this.flash("#a0e8ff", 0.32, 0.22);
    this.sfx.superc();
    this.fx.floatText(m.px, m.headY, "超导!", "#bfe9ff", 16);
    this.fx.burst(m.px, m.py - 20, "#cfe9ff", 8);
    this.fx.ring(m.px, m.headY, "#a0e8ff", 0.3);
    this.cam.addTrauma(0.25);
    this.chainShock(m);
  }

  /** 超载反应：灼烧 + 感电 共存 → 剧烈爆发（消耗灼烧，保留感电态，并径向溅射） */
  private triggerOverload(m: Monster): void {
    const bonus = Math.round(m.maxHp * 0.1) + 20;
    m.takeDamage(bonus);
    m.removeBuffKind("burn");
    this.flash("#ff5a3c", 0.4, 0.3);
    this.sfx.overload();
    this.fx.floatText(m.px, m.headY, "超载!", "#ff8a5c", 18);
    this.fx.burst(m.px, m.py - 20, "#ff8a5c", 14);
    this.fx.ring(m.px, m.headY, "#ff5a3c", 0.5);
    this.cam.addTrauma(0.4);
    this.overloadBlast(m);
  }

  /** 超载溅射：以源点为中心向周围敌人径向爆炸（次级伤害 + 感电态），不递归 */
  private overloadBlast(src: Monster): void {
    const R = 3.2;
    for (const m of this.monsters) {
      if (m === src || !m.alive) continue;
      if (Math.hypot(m.gx - src.gx, m.gy - src.gy) > R) continue;
      const bonus = Math.round(m.maxHp * 0.06) + 10;
      m.takeDamage(bonus);
      m.addBuff({ kind: "shock", value: 5, t: 2 });
      this.fx.burst(m.px, m.py - 20, "#ff8a5c", 8);
      this.fx.floatText(m.px, m.headY, "超载!", "#ff8a5c", 14);
    }
    this.fx.ring(src.px, src.headY, "#ff5a3c", 0.6);
  }

  /** 冻结反应：水 + 冰 = 冻结（额外伤害 + 冰冻定身，消耗湿润与冰封） */
  private triggerFreeze(m: Monster): void {
    const bonus = Math.round(m.maxHp * 0.05) + 10;
    m.takeDamage(bonus);
    m.removeBuffKind("wet");
    m.removeBuffKind("chill");
    m.addBuff({ kind: "stun", value: 1, t: 2.5 });
    m.addBuff({ kind: "frozen", value: 1, t: 2.5 });
    this.flash("#9fe8ff", 0.35, 0.25);
    this.sfx.freeze();
    this.fx.floatText(m.px, m.headY, "冻结!", "#bfeaff", 16);
    this.fx.burst(m.px, m.py - 20, "#cfefff", 10);
    this.fx.ring(m.px, m.headY, "#9fe8ff", 0.35);
    this.cam.addTrauma(0.25);
  }

  /** 碎冰反应：已冻结目标被重击 → 碎裂（解除冻结与定身，额外冰爆伤害），并连锁碎裂邻近冻结目标 */
  private triggerShatter(m: Monster, visited = new Set<Monster>()): void {
    if (visited.has(m)) return;
    visited.add(m);
    const bonus = Math.round(m.maxHp * 0.07) + 12;
    m.takeDamage(bonus);
    m.removeBuffKind("frozen");
    m.removeBuffKind("stun");
    this.flash("#dff3ff", 0.3, 0.22);
    this.sfx.shatter();
    this.fx.floatText(m.px, m.headY, "碎冰!", "#cfefff", 16);
    this.fx.burst(m.px, m.py - 20, "#e6f7ff", 12);
    this.fx.ring(m.px, m.headY, "#bfeaff", 0.35);
    this.cam.addTrauma(0.3);
    // 连锁：炸开的冰碴击碎邻近仍处于冻结的敌人（不重复、不递归爆栈）
    const R = 3;
    for (const n of this.monsters) {
      if (visited.has(n) || !n.alive || !n.hasStatus("frozen")) continue;
      if (Math.hypot(n.gx - m.gx, n.gy - m.gy) > R) continue;
      this.fx.arc(m.px, m.headY, n.px, n.headY, "#dff3ff");
      this.triggerShatter(n, visited);
    }
  }

  /** 融碎（火击冻结）：冰遇火化，造成更强爆发并解除冻结与定身 */
  private triggerMeltShatter(m: Monster): void {
    const bonus = Math.round(m.maxHp * 0.1) + 16;
    m.takeDamage(bonus);
    m.removeBuffKind("frozen");
    m.removeBuffKind("stun");
    this.flash("#ff8a3c", 0.32, 0.24);
    this.sfx.shatter();
    this.fx.floatText(m.px, m.headY, "融碎!", "#ffb07a", 16);
    this.fx.burst(m.px, m.py - 20, "#ffd2a0", 12);
    this.fx.ring(m.px, m.headY, "#ff8a3c", 0.35);
    this.cam.addTrauma(0.32);
  }

  /** 超导碎（雷击冻结）：冰雷交击，碎裂并麻痹减速 + 连锁感电 */
  private triggerSuperconductShatter(m: Monster): void {
    const bonus = Math.round(m.maxHp * 0.06) + 10;
    m.takeDamage(bonus);
    m.removeBuffKind("frozen");
    m.removeBuffKind("stun");
    m.addBuff({ kind: "slow", value: 0.4, t: 3 });
    this.flash("#a0e8ff", 0.32, 0.22);
    this.sfx.superc();
    this.fx.floatText(m.px, m.headY, "超导碎!", "#bfe9ff", 16);
    this.fx.burst(m.px, m.py - 20, "#cfefff", 10);
    this.fx.ring(m.px, m.headY, "#a0e8ff", 0.35);
    this.cam.addTrauma(0.3);
    this.chainShock(m);
  }

  /** 结晶护盾叠层上限：基础 2，可被遗物/境界提升 */
  private crystalCap(): number {
    let cap = 2;
    for (const b of this.player.buffs) if (b.kind === "crystalCap" && b.t > 0) cap += b.value;
    return cap;
  }

  /** 护盾结晶：玩家持盾时触发元素反应，按反应元素强化既有护盾（叠加吸收量、续期、记录元素，支持多元素共存与叠层上限） */
  private crystallizeShield(elem: ElementKind): void {
    if (!this.player.shielded) return;
    const b = this.player.buffs.find((x) => x.kind === "shield");
    if (!b) return;
    const CAP = this.crystalCap(); // 结晶可多元素共存，超出则淘汰最旧元素
    if (!b.elems) b.elems = [];
    const i = b.elems.indexOf(elem);
    if (i >= 0) b.elems.splice(i, 1);                         // 去重：已存在则置为最新
    if (b.elems.length >= CAP) b.elems.shift();               // 超出上限：淘汰最旧元素
    b.elems.push(elem);
    b.value += 20;
    b.t = Math.max(b.t, 6);
    if (b.elems.length >= 2) {
      // 复合结晶（多元素共存）：专属屏闪 + 音效 + 更强反馈
      this.flash(MULTI_CRYSTAL_COLOR, 0.45, 0.35);
      this.cam.addTrauma(0.45);
      this.sfx.crystal();
      this.fx.floatText(this.player.px, this.player.headY, "复合结晶!", MULTI_CRYSTAL_COLOR, 16);
      this.fx.ring(this.player.px, this.player.headY, MULTI_CRYSTAL_COLOR, 0.4);
    } else {
      const col = ELEM_CRYSTAL_COLOR[elem] ?? "#ffe08a";
      this.sfx.pickup();
      this.fx.floatText(this.player.px, this.player.headY, "结晶!", col, 14);
    }
  }

  /** 结晶护盾元素共生：每帧推进特定元素对的周期性效果（如冰+火 → 周期性"消融"真伤） */
  tickCrystalSymbiosis(dt: number): void {
    const sh = this.player.buffs.find((b) => b.kind === "shield" && b.elems && b.elems.length >= 2);
    const active = new Set<string>();
    if (sh && sh.elems) {
      const els = sh.elems;
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          const key = [els[i], els[j]].sort().join("|");
          const def = CRYSTAL_SYMBIOSIS[key];
          if (!def) continue;
          active.add(key);
          this.symbiosisTimers[key] = (this.symbiosisTimers[key] ?? def.period) - dt;
          if (this.symbiosisTimers[key] <= 0) {
            this.symbiosisTimers[key] = def.period;
            this.fireSymbiosis(def);
          }
        }
      }
    }
    for (const k of Object.keys(this.symbiosisTimers)) if (!active.has(k)) delete this.symbiosisTimers[k];
  }

  /** 触发单次元素共生效果：对护盾周围敌人造成小额真伤，并按类型附加效果（消融=仅真伤 / 感电=附加感电 / 导电链=附加感电+链式感电 / 蒸发=灼烧 DoT / 超载=爆发+范围环 / 反震=震晕 / 麻痹=电击定身） */
  private fireSymbiosis(def: { dmg: number; radius: number; color: string; label: string; kind?: "dissolve" | "chain" | "shock" | "freeze" | "superconduct" | "vaporize" | "overload" | "thorns" | "paralyze" | "mud" | "permafrost" }): void {
    const inRange: Monster[] = [];
    for (const m of this.monsters) {
      if (!m.alive) continue;
      if (Math.hypot(m.gx - this.player.gx, m.gy - this.player.gy) > def.radius) continue;
      inRange.push(m);
    }
    if (inRange.length === 0) return;
    for (const m of inRange) {
      const symDmg = Math.round(m.maxHp * SYMBIOSIS_HP_SCALE) + def.dmg;
      m.takeDamage(symDmg);
      this.fx.burst(m.px, m.py - 18, def.color, 6);
      if (def.kind === "shock" || def.kind === "chain") m.addBuff({ kind: "shock", value: 1, t: 3 });
      if (def.kind === "freeze") m.addBuff({ kind: "frozen", value: 1, t: 2.5 });
      if (def.kind === "superconduct") m.addBuff({ kind: "slow", value: 0.4, t: 3 });
      if (def.kind === "vaporize") m.addBuff({ kind: "burn", value: 8, t: 3 }); // 蒸发：范围内施加灼烧 DoT（蒸伤）
      if (def.kind === "overload") m.takeDamage(8); // 超载：额外爆发伤害
      if (def.kind === "thorns") m.addBuff({ kind: "stun", value: 1, t: 1.0 }); // 反震：护盾脉冲震晕附近敌人
      if (def.kind === "paralyze") { m.addBuff({ kind: "stun", value: 1, t: 2.5 }); m.addBuff({ kind: "shock", value: 1, t: 2.5 }); } // 麻痹：电击定身
      if (def.kind === "mud") m.addBuff({ kind: "slow", value: 0.4, t: 3 }); // 泥沼：范围内减速
      if (def.kind === "permafrost") { m.addBuff({ kind: "frozen", value: 1, t: 2.5 }); m.addBuff({ kind: "slow", value: 0.4, t: 3 }); } // 冻土：冻结 + 额外减速（区别于水+冰"冻结"）
    }
    if (def.kind === "chain" || def.kind === "superconduct") {
      // 取最近敌人作为链式起点，向外链式感电（复用 chainShock）
      let near = inRange[0];
      for (const m of inRange) {
        if (Math.hypot(m.gx - this.player.gx, m.gy - this.player.gy) < Math.hypot(near.gx - this.player.gx, near.gy - this.player.gy)) near = m;
      }
      this.chainShock(near);
    }
    if (def.kind === "overload") {
      // 超载：范围爆裂环 + 轻微震屏
      this.cam.addTrauma(0.2);
      this.fx.ring(this.player.px, this.player.headY, "#ff5a3c", 0.6);
    }
    if (def.kind === "thorns") {
      // 反震：土色护盾脉冲（屏闪 + 环）
      this.flash(def.color, 0.3, 0.2);
      this.fx.ring(this.player.px, this.player.headY, def.color, 0.5);
    }
    if (def.kind === "paralyze") {
      // 麻痹：紫色电弧环
      this.fx.ring(this.player.px, this.player.headY, def.color, 0.5);
    }
    if (def.kind === "mud") {
      // 泥沼：泥绿色护盾脉冲环
      this.fx.ring(this.player.px, this.player.headY, def.color, 0.5);
    }
    this.fx.floatText(this.player.px, this.player.headY - 28, def.label, def.color, 12);
  }

  /** 相机 / Y-sort / 小地图 / 目标环 / 建造预览等收尾 */
  private afterWorld(dt: number): void {
    this.updateTelegraphs();
    // Boss 登场：每个 Boss 实例仅触发一次演出
    for (const m of this.monsters) {
      if (m.alive && m.isBoss && !this.bossSeen.has(m)) {
        this.bossSeen.add(m);
        this.bossEntranceFx(m);
      }
    }
    // 滚轮缩放：累积增量 → 目标缩放（限幅）→ 平滑趋近（帧率无关）
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.targetZoom = Math.max(2.2, Math.min(4.6, this.targetZoom - wheel * 0.0016));
    this.map.zoom += (this.targetZoom - this.map.zoom) * (1 - Math.exp(-dt * 8));
    const vw = this.viewW / this.map.zoom;
    const vh = this.viewH / this.map.zoom;
    this.cam.follow(this.player.px, this.player.py, vw, vh, dt, this.map.worldBounds());
    this.map.updateAmbient(dt);
    // 应用镜头缩放冲击：围绕玩家屏幕锚点缩放，保持边界 clamp 与震屏不变
    const Z = this.map.zoom * this.cam.zoomMul;
    this.map.root.scale(Z, Z);
    this.map.root.pos(
      -this.cam.x * this.map.zoom - this.player.px * (Z - this.map.zoom),
      -this.cam.y * this.map.zoom - this.player.py * (Z - this.map.zoom),
    );
    // 受击反馈：血量下降时镜头轻微拉远 + 轻震，增强打击重量感
    if (this.player.hp < this.prevPlayerHp - 0.5) {
      this.cam.addTrauma(0.22);
      this.cam.punchZoom(0.96, 0.3);
    }
    this.prevPlayerHp = this.player.hp;
    const entries: { sprite: any; gx: number; gy: number }[] = [
      ...this.monsters.map((m) => ({ sprite: m.rig.root, gx: m.gx, gy: m.gy })),
      { sprite: this.player.rig.root, gx: this.player.gx, gy: this.player.gy },
      ...this.npcs.map((n) => ({ sprite: n.sprite, gx: n.def.gx, gy: n.def.gy })),
      ...this.map.propEntries(), // 房屋/树等高物件参与排序：人在其身后被遮挡
    ];
    this.map.resort(entries);

    this.minimap.update(
      this.player,
      this.monsters.map((m) => ({ gx: m.gx, gy: m.gy, isBoss: m.isBoss })),
      this.npcs.map((n) => ({ gx: n.def.gx, gy: n.def.gy })),
      this.player.built,
    );

    if (this.target && this.target.alive) {
      this.targetRing.visible = true;
      this.targetRing.pos(this.target.px, this.target.py);
    } else {
      this.targetRing.visible = false;
      if (this.target && !this.target.alive) this.target = null;
    }

    this.updateGhost();
    // 演出层收尾：屏闪、低血边缘脉冲、Boss 横幅
    this.updateFlash(dt);
    this.updateEdgePulse(dt);
    this.updateBanner(dt);
    // 靠近可交互物：底部提示（对话中隐藏）；优先级 宝箱 > 采集点（活动副本进行中时由 updateEventDungeon 接管提示）
    if (!this.eventDungeon.active) {
      if (this.dialogue.isOpen) this.hud.setPrompt(null);
      else if (this.nearChest) this.hud.setPrompt("按 F 开启宝箱");
      else if (this.nearGather) {
        const gn = getItem(this.nearGather.mat)?.name || this.nearGather.mat;
        this.hud.setPrompt(`按 F 采集 ${gn}×${this.nearGather.n}`);
      } else this.hud.setPrompt(null);
    }
    void dt;
  }

  /** 建造幽灵预览：跟随鼠标所在格，绿=可放/红=不可放 */
  private updateGhost(): void {
    if (!this.buildMode || this.buildMode.kind !== "place" || this.input.mouseX < 0) {
      this.ghost.visible = false;
      this.ghostTile = null;
      return;
    }
    const grid = this.map.pick(this.input.mouseX, this.input.mouseY, this.cam, { x: this.player.px, y: this.player.py });
    const gx = Math.floor(grid.gx);
    const gy = Math.floor(grid.gy);
    const ok = this.canPlace(gx, gy);
    this.ghostTile = { gx, gy };
    const { x, y } = gridToScreen(gx, gy);
    this.ghost.pos(x, y);
    const g = this.ghost.graphics;
    g.clear();
    const color = ok ? "#37d67a" : "#e74c3c";
    const hw = TILE_W / 2 - 2, hh = TILE_H / 2 - 2;
    g.drawPoly(0, 0, [0, -hh, hw, 0, 0, hh, -hw, 0], color, "#ffe08a", 2);
    this.ghost.visible = true;
  }

  // ================= 输入 =================

  private handleKeys(): void {
    const inPlay = this.phase === "play";
    const blocked =
      this.dialogue.isOpen ||
      this.bag.visible ||
      this.skillPanel.visible ||
      this.shopPanel.visible ||
      this.forgePanel.visible ||
      this.beastPanel.visible ||
      this.towerPanel.visible ||
      this.arenaPanel.visible ||
      this.sectPanel.visible ||
      this.transferPanel.visible;

    if (inPlay && this.dialogue.isOpen && this.input.wasPressed(Key.SPACE)) {
      this.dlgBox.advance();
    }
    if (this.input.wasPressed(Key.ESC) && inPlay) {
      this.cancelBuild();
      this.bag.hide();
      this.skillPanel.hide();
      this.buildPanel.hide();
      this.shopPanel.hide();
      this.forgePanel.hide();
      this.beastPanel.hide();
      this.towerPanel.hide();
      this.arenaPanel.hide();
      this.sectPanel.hide();
      this.transferPanel.hide();
    }
    // 建造面板仅在非对话时可用
    if (inPlay && !this.dialogue.isOpen && this.input.wasPressed(Key.N)) {
      this.buildPanel.toggle();
      if (this.buildPanel.visible) this.buildPanel.refresh();
      if (!this.buildPanel.visible) this.cancelBuild();
    }
    if (!this.dialogue.isOpen && inPlay) {
      if (this.input.wasPressed(Key.B)) this.bag.toggle();
      if (this.input.wasPressed(Key.K)) {
        this.skillPanel.toggle();
        if (this.skillPanel.visible) this.skillPanel.refresh();
      }
      if (this.input.wasPressed(Key.T)) this.talentPanel.toggle();
      if (this.input.wasPressed(Key.O)) this.artifactPanel.toggle();
      if (this.input.wasPressed(Key.C)) this.codexPanel.toggle();
      if (this.input.wasPressed(Key.A)) this.achievementsPanel.toggle();
      if (this.input.wasPressed(Key.Q)) this.dailyPanel.toggle();
      if (this.input.wasPressed(Key.Z)) this.schoolPanel.toggle();
      if (this.input.wasPressed(Key.P)) this.battlePassPanel.toggle();
      if (this.input.wasPressed(Key.G)) this.worldMap.toggle();
      if (this.input.wasPressed(Key.Y)) this.castPanel.toggle();
      // X 键循环切换地图美术风格（五种风格）
      if (this.input.wasPressed(Key.X)) this.cycleTheme();
    }
    // 右键取消建造
    if (this.input.consumeRightClick() && this.buildMode) this.cancelBuild();
    if (this.input.wasPressed(Key.M)) {
      this.sfx.muted = !this.sfx.muted;
      this.hint(this.sfx.muted ? "已静音" : "声音开启");
    }
    if (this.input.wasPressed(Key.F) && inPlay && !this.dialogue.isOpen) {
      if (this.nearChest) this.openChest(this.nearChest);
      else if (this.nearGather) this.gather(this.nearGather);
      else this.talkNearest();
    }
    // 触控输入积压卫生：每帧无条件取走，blocked 时丢弃，避免"解除阻塞那一帧滞后触发"
    const touchInteract = this.input.consumeInteract();
    if (touchInteract && inPlay && !blocked) {
      if (this.nearChest) this.openChest(this.nearChest);
      else if (this.nearGather) this.gather(this.nearGather);
      else this.talkNearest();
    }
    const touchSkill = this.input.consumeSkillPress();
    if (!blocked && inPlay) {
      for (let i = 0; i < 4; i++) {
        const key = [Key.ONE, Key.TWO, Key.THREE, Key.FOUR][i];
        if (this.input.wasPressed(key)) this.useSkill(i);
      }
      if (touchSkill !== null) this.useSkill(touchSkill);
      if (this.input.wasPressed(Key.E)) this.toggleAutoFight();
      if (this.input.wasPressed(Key.R)) this.tryManualTribulate();
      if (this.input.wasPressed(Key.L)) this.openAlchemy();
      if (this.input.wasPressed(Key.V)) this.openBeast();
      // P3-1 翻滚（Shift / 移动端翻滚钮）：方向取摇杆，否则取移动路径或朝向
      if (this.input.wasPressed(Key.SHIFT)) {
        let dx = this.input.joyX, dy = this.input.joyY;
        if (!this.input.joyActive) {
          if (this.player.path.length > 0) { const wp = this.player.path[0]; dx = wp.gx + 0.5 - this.player.gx; dy = wp.gy + 0.5 - this.player.gy; }
          else { dx = this.player.facing; dy = 0; }
        }
        this.player.tryRoll(dx, dy);
      }
      if (this.input.consumeRoll()) {
        this.player.tryRoll(this.input.joyX, this.input.joyY);
      }
      // P3-1b 格挡：Q 键按住（桌面）/ 移动端格挡钮（blockHeld）持续格挡，松开解除
      const wantBlock = this.input.isDown(Key.Q) || this.input.blockHeld;
      if (wantBlock) this.player.tryBlock();
      else if (this.player.blocking) this.player.endBlock();
    }
    const touchAuto = this.input.consumeAuto();
    if (touchAuto && !blocked && inPlay) this.toggleAutoFight();
  }

  /** 切换挂机/自动战斗开关 */
  toggleAutoFight(): void {
    this.autoFight = !this.autoFight;
    this.hud.setAutoFight(this.autoFight);
    this.hint(this.autoFight ? "自动战斗 · 开启" : "自动战斗 · 关闭");
  }

  /**
   * 自动战斗：每 0.25s 锁定最近怪，不足距离则寻路接近，否则循环施法 1-4 槽。
   * 自愈（heal）类技能仅在气血低于 50% 时释放，避免空耗灵力。复用既有 useSkill 路径。
   */
  private updateAutoFight(dt: number): void {
    if (!this.autoFight) return;
    this.autoTimer -= dt;
    if (this.autoTimer > 0) return;
    this.autoTimer = 0.25;
    const tgt = this.pickTarget();
    if (!tgt) { this.player.stop(); return; }
    this.target = tgt;
    for (let i = 0; i < 4; i++) {
      const sk = this.player.skillInSlot(i);
      if (!sk) continue;
      const offensive = sk.power > 0 || sk.effect.kind === "stun" || sk.effect.kind === "lifesteal";
      if (offensive) {
        this.useSkill(i);
      } else if (sk.effect.kind === "heal" && this.player.hp < this.player.maxHp * 0.5) {
        this.useSkill(i);
      }
      if (this.player.casting) break;
    }
  }

  /** 检测并触发天劫演出（有待渡境界、未在处理中、且未对该境展示过） */
  private maybeTribulate(): void {
    if (this.tribulating) return;
    const realm = this.player.pendingTribulation;
    if (realm <= 0) return;
    if (this.tribShown === realm) return; // 该境已展示过（失败待手动重试）
    this.startTribulation(realm);
  }

  /** 飞升转世：播放演出后执行转世，解锁坠魔谷 */
  openAscend(): void {
    if (this.ascending) return;
    if (!this.player.canAscend) return;
    this.ascending = true;
    this.arenaPanel.hide();
    this.towerPanel.hide();
    this.eventPanel.hide();
    this.socialPanel.hide();
    this.cutscene.play({
      title: "飞升 · 转世",
      sub: "破而后立，再启新程",
      lines: [
        "你于人间界臻至化神圆满，感应到更高处的召唤。",
        "一道青光托起神魂，肉身虽逝，道果长存——转世重修，踏上第二世。",
      ],
    }, () => this.finishAscend());
  }

  private finishAscend(): void {
    const res = this.player.reincarnate();
    this.ascending = false;
    if (res.ok) {
      this.hint(`飞升成功！开启第 ${res.life} 世，属性获得永久继承加成（战力大涨）`);
      this.cam.addTrauma(0.6);
      this.fx?.burst(this.player.px, this.player.py - 24, "#ffd97f", 18);
      if (!this.player.unlockedZones.includes("zhuomo")) this.player.unlockedZones.push("zhuomo");
    }
  }

  /** 手动渡劫（HUD 按钮 / R 键）：允许重新展示 */
  tryManualTribulate(): void {
    if (this.tribulating) return;
    const realm = this.player.pendingTribulation;
    if (realm <= 0) return;
    this.tribShown = 0;
    this.startTribulation(realm);
  }

  /** 播放天劫演出（雷暴 + 震屏 + 过场），结束回调结算 */
  private startTribulation(realm: number): void {
    this.tribulating = true;
    this.tribShown = realm;
    this.tribRealmName = this.player.tribulationRealmName() || "大境界";
    this.cam.addTrauma(0.8);
    this.fx?.burst(this.player.px, this.player.py - 24, "#c9a3ff", 14);
    this.cutscene.play({
      title: `天劫 · ${this.tribRealmName}`,
      sub: "雷霆加身，道心不渝",
      lines: [
        `你于【${this.tribRealmName}】之境感应天劫将至。`,
        "雷云压下，紫电缠绕周身——撑过去，便是脱胎换骨。",
      ],
    }, () => this.finishTribulation(realm));
  }

  /** 天劫结算：按概率判定成败，给出提示与永久加成 */
  private finishTribulation(realm: number): void {
    const res = this.player.resolveTribulation(Math.random);
    this.tribulating = false;
    if (res.success) {
      this.hint(`渡劫成功！突破至【${this.tribRealmName}】，道行大涨（属性 +6%）`);
      this.cam.addTrauma(0.5);
      this.tribShown = 0; // 允许下一境自动触发
      if (this.player.pendingTribulation > 0) this.maybeTribulate();
    } else {
      this.hint(`渡劫失败…道体受损，可再次渡劫（成功率 ${Math.round(res.chance * 100)}%）`);
      // tribShown 保持 =realm，等待手动重试
    }
  }

  /** 灵兽协战：出战灵兽每隔 attackCd 自动对最近怪开火（独立 beastRng，复用 calcDamage + Monster.takeDamage + resolveDeaths 死亡发奖） */
  private updateBeast(dt: number): void {
    const id = this.player.activeBeast;
    const def = id ? getBeast(id) : undefined;
    if (!id || !def) { if (this.beastSprite) this.beastSprite.visible = false; return; }
    // 跟随精灵（玩家 rig 子节点，简化协战表现）
    if (!this.beastSprite) {
      this.beastSprite = new Laya.Sprite();
      this.player.rig.root.addChild(this.beastSprite);
    }
    this.beastSprite.visible = true;
    this.beastSprite.graphics.clear();
    const bs = def.size;
    const g2 = this.beastSprite.graphics;
    // 描边生物轮廓（耳/眼点），取代原平涂椭圆，避免被误认成「结界」
    g2.drawEllipse(0, 0, 16 * bs, 11 * bs, def.color, "#0c1714", 1.5);
    g2.drawCircle(-12 * bs, -7 * bs, 4 * bs, def.color, "#0c1714", 1.2);
    g2.drawCircle(12 * bs, -7 * bs, 4 * bs, def.color, "#0c1714", 1.2);
    g2.drawCircle(-4 * bs, -2 * bs, 1.6 * bs, "#0c1714", null, 0);
    g2.drawCircle(4 * bs, -2 * bs, 1.6 * bs, "#0c1714", null, 0);
    this.beastSprite.pos(28, -14);
    // 冷却：首次进入延迟一个周期，避免瞬发干扰战斗随机
    if (this.beastCd <= 0) this.beastCd = def.attackCd;
    this.beastCd -= dt;
    if (this.beastCd > 0) return;
    this.beastCd = def.attackCd;
    // 最近怪
    let target: Monster | null = null;
    let bd = def.range;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = Math.hypot(m.gx - this.player.gx, m.gy - this.player.gy);
      if (d < bd) { bd = d; target = m; }
    }
    if (!target) return;
    const { dmg, crit } = calcDamage({ atk: def.atk, def: target.effDef, power: def.power, critRate: 0.05, critMul: 1.5, rng: this.beastRng });
    const r = target.takeDamage(dmg);
    this.fx.floatText(target.px, target.headY, `${crit ? "暴击 " : ""}-${r.dealt}`, crit ? "#7fe0ff" : "#ffffff", crit ? 20 : 15);
    this.fx.burst(target.px, target.py - 24, def.color, crit ? 10 : 5);
  }

  /** 尝试捕捉：对最近残血(≤25%)非 Boss 妖兽消耗捕兽铃收服为灵兽 */
  private tryCapture(): void {
    if (this.player.countItem("capture-bell") <= 0) { this.hint("需要【捕兽铃】方可捕捉灵兽"); return; }
    let target: Monster | null = null;
    let bd = 3;
    for (const m of this.monsters) {
      if (!m.alive || m.def.boss) continue;
      const d = Math.hypot(m.gx - this.player.gx, m.gy - this.player.gy);
      if (d < bd && m.hp / Math.max(1, m.maxHp) <= 0.25) { bd = d; target = m; }
    }
    if (!target) { this.hint("附近没有残血妖兽（≤25%）可捕捉"); return; }
    this.player.removeItem("capture-bell", 1);
    const r = this.player.captureBeast(target.def.id);
    this.hint(r.ok ? `收服成功！获得灵兽【${getBeast(r.beastId!)!.name}】` : `收服失败：${r.reason || "妖兽挣脱"}`);
    if (r.ok && !this.player.activeBeast) this.player.setActiveBeast(r.beastId!);
  }

  // ================= 镇妖塔 =================
  /** 进入镇妖塔：每日首次进入重置到第 1 层（历史最高保留），并刷出当前层怪物 */
  private enterTower(): void {
    const today = this.todayStr();
    if (this.player.towerDaily !== today) {
      this.player.towerFloor = 1;
      this.player.towerDaily = today;
    }
    this.towerPanel.hide();
    this.arenaPanel.hide();
    this.eventPanel.hide();
    this.socialPanel.hide();
    this.enterZone("tower");
    this.spawnTowerFloor(this.player.towerFloor);
    this.towerSpawned = true;
    this.towerNextT = 0;
    this.hint(`镇妖塔 · 第 ${this.player.towerFloor} 层`);
  }

  /** 退出镇妖塔，返回落霞镇 */
  private exitTower(): void {
    this.towerSpawned = false;
    this.towerNextT = 0;
    this.enterZone("ch1");
  }

  /** 塔内死亡：本日进度重置到第 1 层并退回落霞镇 */
  private onTowerDeath(): void {
    if (this.player.hp <= 0) this.player.hp = this.player.maxHp;
    this.player.towerFloor = 1;
    this.towerSpawned = false;
    this.towerNextT = 0;
    this.enterZone("ch1");
    this.hint("陨落镇妖塔，已退回落霞镇（本日进度重置）");
  }

  // ================= 限时活动副本（P3-8 赛季） =================
  /** 进入活动副本：限时 60s 内击败魔尊，通关成绩计入赛季榜 */
  private enterEventDungeon(): void {
    if (this.ascending || this.eventDungeon.active) return;
    void (async () => {
      const s = await this.cloud.getSeason();
      if (!s || !s.open) { this.hint("活动副本暂未开启（需联网且赛季进行中）"); return; }
      const bs = (this.currentMap && this.currentMap.bossSpot) || { gx: Math.floor(this.player.gx), gy: Math.floor(this.player.gy) };
      const boss = new Monster(getMonster("mo-zun"), bs.gx + 0.5, bs.gy + 0.5, 990001, 5);
      this.monsters.push(boss);
      this.map.addActor(boss.rig.root);
      this.sfx.boss();
      this.eventBoss = boss;
      this.eventDungeon = { active: true, startMs: Date.now(), timeLimitMs: 60000 };
      this.eventPanel.hide();
      this.hint("活动副本·魔尊试炼：60 秒内击败魔尊！");
    })();
  }

  /** 每帧推进活动副本：检测超时 / 魔尊阵亡 */
  private updateEventDungeon(dt: number): void {
    void dt;
    if (!this.eventDungeon.active) return;
    const elapsed = Date.now() - this.eventDungeon.startMs;
    const left = Math.max(0, Math.ceil((this.eventDungeon.timeLimitMs - elapsed) / 1000));
    this.hud.setPrompt(`活动副本 · 剩余 ${left}s（击败魔尊）`);
    if (this.eventBoss && !this.eventBoss.alive) {
      const clearMs = Math.min(elapsed, this.eventDungeon.timeLimitMs);
      void this.endEventDungeon(true, clearMs);
      return;
    }
    if (elapsed >= this.eventDungeon.timeLimitMs) {
      void this.endEventDungeon(false, 0, "活动副本超时，魔尊遁走");
    }
  }

  /** 结束活动副本（success=通关并提交成绩） */
  private async endEventDungeon(success: boolean, clearMs = 0, reason?: string): Promise<void> {
    this.eventDungeon.active = false;
    const boss = this.eventBoss;
    this.eventBoss = null;
    if (boss && boss.alive) {
      this.monsters = this.monsters.filter((m) => m !== boss);
      this.map.removeActor(boss.rig.root);
    }
    if (this.player.hp <= 0) this.player.hp = this.player.maxHp;
    if (!success) {
      this.hint(reason || "活动副本结束");
      this.eventPanel.show();
      return;
    }
    const score = this.eventScore(clearMs);
    this.player.seasonBest = Math.max(this.player.seasonBest, score);
    const stones = Math.floor(score / 20);
    const exp = Math.floor(score / 10);
    this.player.gainStones(stones);
    this.player.gainExp(exp);
    let rankTip = "";
    if (this.token) {
      const rank = await this.cloud.submitSeasonScore(this.token, score, clearMs);
      if (rank) rankTip = `，赛季排名 #${rank}`;
    }
    this.hint(`魔尊试炼通关！得分 ${score}（灵石+${stones}/修为+${exp}${rankTip}）`);
    this.saveGame();
    this.eventPanel.show();
  }

  /** 活动副本得分：以速通为核心，叠加境界与等级 */
  private eventScore(clearMs: number): number {
    const timeScore = Math.max(0, Math.round((60000 - clearMs) / 6));
    const ri = (this.player as any).realmIndex || 0;
    const lv = (this.player as any).level || 1;
    return Math.max(1, timeScore + ri * 100 + lv * 10);
  }

  /** 刷出某层怪物（按层属性缩放） */
  private spawnTowerFloor(floor: number): void {
    const def = TOWER_FLOORS[Math.min(floor, MAX_TOWER_FLOOR) - 1];
    def.monsters.forEach((mid, i) => {
      const spot = TOWER_SPOTS[i % TOWER_SPOTS.length];
      const m = new Monster(getMonster(mid), spot.gx + 0.5, spot.gy + 0.5, 700000 + floor * 100 + i, 3);
      const s = def.scale;
      m.maxHp = Math.round(m.maxHp * s);
      m.hp = m.maxHp;
      m.baseAtk = Math.max(1, Math.round(m.baseAtk * s));
      m.baseDef = Math.max(0, Math.round(m.baseDef * s));
      this.monsters.push(m);
      this.map.addActor(m.rig.root);
    });
    this.hint(`镇妖塔 · 第 ${floor} 层（${def.monsters.length} 妖）`);
  }

  /** 推进到下一层：发奖 + 层数+1 + 更新最高，超限则登顶 */
  private advanceTower(): void {
    const f = this.player.towerFloor;
    const def = TOWER_FLOORS[Math.min(f, MAX_TOWER_FLOOR) - 1];
    this.grantTowerReward(def);
    this.player.towerFloor += 1;
    if (this.player.towerFloor > this.player.towerBest) this.player.towerBest = this.player.towerFloor;
    if (this.player.towerFloor > MAX_TOWER_FLOOR) {
      this.hint("镇妖塔已登顶！明日再来挑战。");
      this.towerSpawned = false;
      return;
    }
    this.spawnTowerFloor(this.player.towerFloor);
    this.towerSpawned = true;
  }

  private grantTowerReward(def: TowerFloorDef): void {
    const p = this.player;
    p.gainExp(def.reward.exp);
    p.gainStones(def.reward.stones);
    if (def.reward.item) p.addItem(def.reward.item.id, def.reward.item.n);
    this.hint(`第 ${def.floor} 层通关！修为+${def.reward.exp} 灵石+${def.reward.stones}`);
  }

  /** 清层检测：全部怪物阵亡后短暂停顿再进下一层 */
  private checkTowerProgress(dt: number): void {
    if (this.currentZoneId !== "tower") return;
    if (this.towerNextT > 0) {
      this.towerNextT -= dt;
      if (this.towerNextT <= 0) this.advanceTower();
      return;
    }
    if (this.towerSpawned && this.monsters.length === 0) {
      this.towerSpawned = false;
      this.towerNextT = 0.8;
    }
  }

  // ================= 竞技场 =================
  /** 竞技场快照（积分 / 排名 / 当前对手） */
  private arenaState() {
    this.player.ensureArenaBoard(this.player.realmIndex);
    return {
      points: this.player.arenaPoints,
      wins: this.player.arenaWins,
      losses: this.player.arenaLosses,
      rank: this.arenaRank(),
      opp: this.currentArenaOpp,
    };
  }

  /** 本地排名：积分高于玩家的对手数 + 1 */
  private arenaRank(): number {
    const board = this.player.arenaBoard;
    let better = 0;
    for (const e of board) if (e.points >= this.player.arenaPoints) better++;
    return better + 1;
  }

  /** 从本地排行榜挑下一个对手：在玩家当前排名附近 ±2 选，强度曲线贴合进度 */
  private arenaNextOpponent(): void {
    const board = this.player.arenaBoard;
    if (board.length === 0) { this.currentArenaOpp = null; return; }
    const sorted = [...board].sort((a, b) => a.points - b.points);
    const myIdx = sorted.findIndex((e) => e.points >= this.player.arenaPoints);
    const base = myIdx < 0 ? sorted.length - 1 : myIdx;
    const r = makeRng((this.arenaPickSeed++ * 2654435761) >>> 0);
    let pickIdx = Math.max(0, Math.min(sorted.length - 1, base + Math.floor(r() * 5) - 2));
    let pick = sorted[pickIdx];
    if (this.currentArenaOpp && pick.nickname === this.currentArenaOpp.nickname) {
      pickIdx = Math.min(sorted.length - 1, pickIdx + 1);
      pick = sorted[pickIdx];
    }
    // 镜像：以玩家当前属性为基准，按排名差给强度倍率
    const mult = mirrorMult(this.player.arenaPoints, pick.points);
    this.currentArenaOpp = buildMirrorOpponent(
      (this.arenaPickSeed * 7919 + pick.realmIndex * 31) >>> 0,
      { atk: this.player.effAtk, def: this.player.effDef, maxHp: this.player.maxHp },
      mult, pick.realmIndex, pick.nickname, "board",
    );
    this.currentArenaOpp.rating = pick.points;
  }

  /** 挑战当前对手：复用 calcDamage 结算镜像对战（独立 arenaRng） */
  private startArenaDuel(rng?: () => number): { win: boolean; delta: number; opp: ArenaOpponent; rounds: number } {
    const opp = this.currentArenaOpp;
    if (!opp) return { win: false, delta: 0, opp: null as any, rounds: 0 };
    const r = rng || (() => this.player.arenaRng());
    let php = this.player.maxHp;
    let ohp = opp.maxHp;
    const pAtk = this.player.effAtk;
    const pDef = this.player.effDef;
    let round = 0;
    while (php > 0 && ohp > 0 && round < 300) {
      round++;
      const pd = calcDamage({ atk: pAtk, def: opp.def, power: 1, critRate: 0.1, critMul: 1.6, rng: r });
      ohp -= pd.dmg;
      if (ohp <= 0) break; // 玩家先手：对手阵亡则不再反击
      const od = calcDamage({ atk: opp.atk, def: pDef, power: 1, critRate: 0.08, critMul: 1.5, rng: r });
      php -= od.dmg;
    }
    const win = ohp <= 0 && php > 0;
    const oppRating = typeof (opp as any).rating === "number" ? (opp as any).rating : this.player.arenaPoints;
    let delta = 0;
    if (win) {
      delta = arenaDelta(this.player.arenaPoints, oppRating, true);
      this.player.arenaPoints = Math.min(99999, this.player.arenaPoints + delta);
      this.player.arenaWins += 1;
      this.adjustBoardOpponent(opp.nickname, -delta); // 被你击败的对手掉分
      this.submitArena();
    } else {
      delta = arenaDelta(this.player.arenaPoints, oppRating, false);
      this.player.arenaPoints = Math.max(ARENA_MIN_POINTS, this.player.arenaPoints + delta); // delta 为负
      this.player.arenaLosses += 1;
      this.adjustBoardOpponent(opp.nickname, -delta); // 击败你的对手涨分（-delta 为正）
    }
    return { win, delta, opp: opp as ArenaOpponent, rounds: round };
  }

  /** 排行榜对手评分双向移动（被击败掉分 / 击败你涨分），夹在 [MIN, 99999] */
  private adjustBoardOpponent(nickname: string, d: number): void {
    const e = this.player.arenaBoard.find((x) => x.nickname === nickname);
    if (e) e.points = Math.max(ARENA_MIN_POINTS, Math.min(99999, e.points + d));
  }

  /** 云存档同步（尽力：无 token / 离线静默失败） */
  private submitArena(): void {
    if (!this.token) return;
    void this.cloud.submit(this.token, {
      nickname: this.player.nickname,
      realm: this.player.realmName,
      timeMs: this.player.playMs,
      kills: this.player.kills,
      chapter: this.player.chapter,
    });
  }

  /** 世界像素 → 画布坐标（与 updateCamera 的 root 变换严格对应，供点击命中判定使用） */
  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const Z = this.map.zoom * (this.cam.zoomMul || 1);
    const rootX = -this.cam.x * this.map.zoom - this.player.px * (Z - this.map.zoom);
    const rootY = -this.cam.y * this.map.zoom - this.player.py * (Z - this.map.zoom);
    return { x: wx * Z + rootX, y: wy * Z + rootY };
  }

  private handleWorldClick(): void {
    if (this.dialogue.isOpen) {
      this.input.consumeClick();
      return;
    }
    if (this.input.joyActive) { this.input.consumeClick(); return; }
    const c = this.input.consumeClick();
    if (!c) return;

    // 建造模式优先：点击地图放置/拆除（UI 面板点按交给 Laya 自身处理）
    if (this.buildMode) {
      if (this.overUI(c)) {
        this.input.consumeClick();
        return;
      }
      const grid = this.map.pick(c.x, c.y, this.cam, { x: this.player.px, y: this.player.py });
      if (this.buildMode.kind === "place") this.placeAt(Math.floor(grid.gx), Math.floor(grid.gy));
      else this.demolishAt(Math.floor(grid.gx), Math.floor(grid.gy));
      return;
    }

    // 点击落在 UI 控件上：仅让 Laya 处理，不触发世界移动
    if (this.overUI(c)) {
      this.input.consumeClick();
      return;
    }

    // 小地图导航
    if (this.minimap.contains(c.x, c.y)) {
      const g = this.minimap.toGrid(c.x, c.y);
      if (isWalkable(g.gx, g.gy)) {
        this.target = null;
        this.player.computePath(this.currentMap, g.gx, g.gy);
        this.hint("前往小地图所指之处…");
      }
      return;
    }

    const pivot = { x: this.player.px, y: this.player.py };
    const grid = this.map.pick(c.x, c.y, this.cam, pivot);
    const Z = this.map.zoom * (this.cam.zoomMul || 1);

    // 命中判定改用「屏幕空间 + 覆盖 sprite 高度」：
    // 等距视角下角色身体绘制在脚点上方（NPC 头顶约在脚点上 55px），
    // 若只按脚点所在格算距离，点击身体会落到脚点上方约 2 格 → 选不中 NPC / 怪物。
    const hitSprite = (sx: number, sy: number): boolean => hitSpriteBox(c, sx, sy, Z);

    // NPC（对话优先）
    for (const npc of this.npcs) {
      const w = gridToScreen(npc.def.gx, npc.def.gy);
      const s = this.worldToScreen(w.x, w.y);
      if (hitSprite(s.x, s.y)) {
        this.tryTalk(npc.def);
        return;
      }
    }
    // 怪物选目标（命中者取屏幕距离最近）
    let best: Monster | null = null;
    let bd = Infinity;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const s = this.worldToScreen(m.px, m.py);
      if (!hitSprite(s.x, s.y)) continue;
      const d = Math.hypot(c.x - s.x, c.y - s.y);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) {
      this.target = best;
      this.hint(`目标：${best.def.name}（按 1-4 施法）`);
      return;
    }
    // 地面移动：目标不可走（建筑/树/水）或越界（地图外虚空）时，吸附到最近可走格，
    // 保证「点击可见地块必有响应」，消除「点哪都不动」的结界感
    let gx = Math.floor(grid.gx), gy = Math.floor(grid.gy);
    if (!isWalkable(gx, gy, this.currentMap)) {
      const nw = nearestWalkable(this.currentMap, gx, gy, 10);
      if (nw) { gx = nw.gx; gy = nw.gy; }
    }
    this.target = null;
    this.player.computePath(this.currentMap, gx, gy);
  }

  /** 点击是否落在当前存在的屏幕 UI 控件上（用于拦截世界移动） */
  private overUI(c: { x: number; y: number }): boolean {
    const vw = this.viewW;
    const vh = this.viewH;
    const it = this.safeInset.top;
    const ir = this.safeInset.right;
    if (c.x <= 240 && c.y <= 104 + it) return true; // HUD（已随内缩下移）
    if (c.x >= vw - 240 - ir && c.y <= 104 + it) return true; // 任务面板
    if (this.bag.visible) {
      if (c.x >= this.bag.root.x && c.x <= this.bag.root.x + 560 && c.y >= this.bag.root.y && c.y <= this.bag.root.y + 460) return true;
    }
    if (this.skillPanel.visible) {
      if (c.x >= this.skillPanel.root.x && c.x <= this.skillPanel.root.x + 560 && c.y >= this.skillPanel.root.y && c.y <= this.skillPanel.root.y + 460) return true;
    }
    if (this.buildPanel.visible) {
      if (c.x >= this.buildPanel.root.x && c.x <= this.buildPanel.root.x + this.buildPanel.root.width && c.y >= this.buildPanel.root.y && c.y <= this.buildPanel.root.y + this.buildPanel.root.height) return true;
    }
    for (const p of [this.shopPanel, this.forgePanel, this.sectPanel, this.transferPanel]) {
      if (p.visible) {
        if (c.x >= p.root.x && c.x <= p.root.x + 560 && c.y >= p.root.y && c.y <= p.root.y + 460) return true;
      }
    }
    // 技能栏（底部居中）
    const sbw = 4 * 58 + 3 * 10;
    const sbx = vw / 2 - sbw / 2;
    if (c.x >= sbx && c.x <= sbx + sbw && c.y >= vh - 74 && c.y <= vh - 16) return true;
    return false;
  }

  // ================= 建造 =================

  private enterBuild(id: string): void {
    const def = getBuilding(id);
    if (!def) return;
    this.buildMode = { kind: "place", id };
    this.buildPanel.hide();
    this.hint(`点击地面放置【${def.name}】（右键/ESC 取消）`);
  }

  private enterDemolish(): void {
    this.buildMode = { kind: "demolish" };
    this.buildPanel.hide();
    this.hint("点击你的建筑以拆除（返还一半材料，右键/ESC 取消）");
  }

  private cancelBuild(): void {
    this.buildMode = null;
    this.ghost.visible = false;
    this.ghostTile = null;
  }

  /** 该格是否可放置建筑 */
  private canPlace(gx: number, gy: number): boolean {
    if (!isWalkable(gx, gy)) return false;
    if (this.player.built.some((b) => b.gx === gx && b.gy === gy)) return false;
    if (NPCS.some((n) => n.gx === gx && n.gy === gy)) return false;
    if (MAP.bossSpot.gx === gx && MAP.bossSpot.gy === gy) return false;
    return true;
  }

  private placeAt(gx: number, gy: number): void {
    if (!this.buildMode || this.buildMode.id == null) return;
    const def = getBuilding(this.buildMode.id);
    if (!def) return;
    if (!this.canPlace(gx, gy)) {
      this.hint("此处不可建造");
      return;
    }
    if (this.player.countItem("wood") < def.cost.wood || this.player.countItem("stone") < def.cost.stone) {
      this.hint("材料不足（木材/石料）");
      return;
    }
    const orig = this.map.occupy(gx, gy, "house");
    if (orig == null) return;
    this.player.removeItem("wood", def.cost.wood);
    this.player.removeItem("stone", def.cost.stone);
    this.player.placeBuilding(def.id, gx, gy, orig, this.currentZoneId);
    this.map.redrawStructures(this.player.built.filter((b) => b.zone === this.currentZoneId), BUILD_COLORS);
    this.sfx.click();
    this.fx.floatText(this.player.px, this.player.headY, `建造成功：${def.name}`, "#9fe8ff", 14);
    this.hint(`已建造【${def.name}】（右键/ESC 取消，可继续建造）`);
    this.saveGame();
  }

  private demolishAt(gx: number, gy: number): void {
    const rec = this.player.removeBuiltAt(gx, gy, this.currentZoneId);
    if (!rec) {
      this.hint("此处没有你的建筑");
      return;
    }
    this.map.restore(gx, gy, rec.orig as any);
    const def = getBuilding(rec.id);
    if (def) {
      this.player.addItem("wood", Math.floor(def.cost.wood * DEMOLISH_RATIO));
      this.player.addItem("stone", Math.floor(def.cost.stone * DEMOLISH_RATIO));
    }
    this.map.redrawStructures(this.player.built.filter((b) => b.zone === this.currentZoneId), BUILD_COLORS);
    this.sfx.click();
    this.fx.floatText(this.player.px, this.player.headY, "已拆除", "#ffd166", 14);
    this.saveGame();
  }

  /** 读档后把当前区域的已建造建筑还原到地图 */
  private syncStructures(): void {
    const built = this.player.built.filter((b) => b.zone === this.currentZoneId);
    for (const b of built) this.map.occupy(b.gx, b.gy, "house");
    this.map.redrawStructures(built, BUILD_COLORS);
  }

  // ================= 对话 / 剧情 =================

  private npcDialogueRoot(npc: NpcDef): string {
    if (npc.id === "cunzhang") {
      const q = this.player.quests;
      if (q.active.includes("q_wolves")) return "cunzhang_progress";
      if (q.done.includes("q_wolves") && !q.done.includes("q_boss")) return "cunzhang_report";
      if (q.active.includes("q_boss")) return "cunzhang_boss";
      return "cunzhang_root";
    }
    return npc.dialogue || "";
  }

  private talkNearest(): void {
    let best: NpcDef | null = null;
    let bd = 2.2;
    for (const npc of this.npcs) {
      const d = Math.hypot(npc.def.gx + 0.5 - this.player.gx, npc.def.gy + 0.5 - this.player.gy);
      if (d < bd) {
        bd = d;
        best = npc.def;
      }
    }
    if (best) this.tryTalk(best);
    else this.hint("附近没有可交谈的人");
  }

  private tryTalk(npc: NpcDef): void {
    const d = Math.hypot(npc.gx + 0.5 - this.player.gx, npc.gy + 0.5 - this.player.gy);
    if (d > 2.2) {
      this.hint("走近些再交谈");
      return;
    }
    this.sfx.click();
    // 功能型 NPC：直接开面板（货郎卖货 / 铁匠炼器）
    if (npc.service === "shop") {
      this.openShop();
      return;
    }
    if (npc.service === "forge") {
      this.openForge();
      return;
    }
    if (npc.service === "sect") {
      this.openSect();
      return;
    }
    const root = this.npcDialogueRoot(npc);
    if (!root || !STORY[root]) {
      this.hint(`${npc.name}只是朝你点了点头。`);
      return;
    }
    this.dialogue.open(root);
    this.openDialogueBox();
  }

  /** 打开坊市（买入/卖出） */
  /** 三界舆图（G / HUD 按钮）：展示古风卷轴舆图与当前所在标记 */
  openWorldMap(): void {
    if (this.castPanel?.visible) this.castPanel.hide();
    this.worldMap.setProgress(this.currentZoneId, this.player.unlockedZones);
    this.worldMap.toggle();
  }

  /** 从舆图点击区域落点直接传送（仅限已解锁区域） */
  private teleportFromMap(zoneId: string): void {
    if (!this.player.unlockedZones.includes(zoneId)) return;
    const z = ZONES[zoneId];
    if (!z) return;
    this.worldMap.hide();
    this.enterZone(zoneId);
  }

  /** 人物志（Y / HUD 按钮 / 标题角色卡）：四位主要角色的立绘与形象设定 */
  openCast(): void {
    if (this.worldMap?.visible) this.worldMap.hide();
    this.castPanel.toggle();
  }

  /** 从标题界面的角色卡直接进入人物志并定位到该角色 */
  showCast(index: number): void {
    this.castPanel.select(index);
    this.castPanel.show();
  }

  openShop(): void {
    this.bag.hide();
    this.skillPanel.hide();
    this.buildPanel.hide();
    this.forgePanel.hide();
    this.shopPanel.show();
  }

  /** 打开炼器台 */
  openForge(): void {
    this.bag.hide();
    this.skillPanel.hide();
    this.buildPanel.hide();
    this.shopPanel.hide();
    this.forgePanel.show();
  }

  /** 打开炼丹（炼器台「炼丹」标签） */
  openAlchemy(): void {
    this.bag.hide();
    this.skillPanel.hide();
    this.buildPanel.hide();
    this.shopPanel.hide();
    this.forgePanel.showAlchemy();
  }

  /** 打开灵兽面板 */
  openBeast(): void {
    this.bag.hide();
    this.skillPanel.hide();
    this.buildPanel.hide();
    this.shopPanel.hide();
    this.forgePanel.hide();
    this.beastPanel.show();
  }

  /** 打开镇妖塔面板 */
  openTower(): void {
    this.bag.hide();
    this.skillPanel.hide();
    this.buildPanel.hide();
    this.shopPanel.hide();
    this.forgePanel.hide();
    this.beastPanel.hide();
    this.towerPanel.show();
  }

  /** 打开限时活动面板 */
  openEvent(): void {
    if (this.ascending) return;
    this.eventPanel.show();
  }

  /** 打开社交面板 */
  openSocial(): void {
    if (this.ascending) return;
    this.socialPanel.show();
  }

  /** 结缘：依好感触发对应 NPC 结局对话（多结局） */
  private openFriendEnding(id: string): void {
    const r = this.player.requestFriendEnding(id);
    if (!r.ok || !r.nodeId) { this.hint(r.reason || "无法结缘"); return; }
    this.socialPanel.hide();
    this.dialogue.open(r.nodeId);
    this.openDialogueBox();
  }

  /** 打开竞技场面板 */
  openArena(): void {
    this.player.ensureArenaBoard(this.player.realmIndex);
    if (!this.currentArenaOpp) this.arenaNextOpponent();
    this.bag.hide();
    this.skillPanel.hide();
    this.buildPanel.hide();
    this.shopPanel.hide();
    this.forgePanel.hide();
    this.beastPanel.hide();
    this.towerPanel.hide();
    this.eventPanel.hide();
    this.socialPanel.hide();
    this.arenaPanel.show();
  }

  /** 打开宗门大殿（声望兑换） */
  openSect(): void {
    this.bag.hide();
    this.skillPanel.hide();
    this.buildPanel.hide();
    this.shopPanel.hide();
    this.forgePanel.hide();
    this.sectPanel.show();
  }

  /** P3-7 选择分支：选项显示条件判定 */
  private evalCond(c: StoryCond): boolean {
    const f = this.player.flags;
    if (c.flag && !f[c.flag]) return false;
    if (c.notFlag && f[c.notFlag]) return false;
    const q = this.player.quests;
    if (c.questActive && !q.active.includes(c.questActive)) return false;
    if (c.questDone && !q.done.includes(c.questDone)) return false;
    if (c.levelMin && this.player.realmIndex < c.levelMin) return false;
    return true;
  }

  /** 把 runner 当前节点渲染到弹层，并挂推进回调 */
  private openDialogueBox(): void {
    this.tutDialogueOpens++;
    const node = this.dialogue.current;
    if (!node) {
      this.dlgBox.close();
      return;
    }
    this.dlgBox.open(node, this.dialogue.visibleChoices);
    this.dlgBox.onAdvance = (choiceIndex: number) => {
      this.dialogue.advance(choiceIndex);
      if (this.dialogue.isOpen && this.dialogue.current) this.dlgBox.open(this.dialogue.current, this.dialogue.visibleChoices);
      else this.dlgBox.close();
    };
  }

  /** X 键：循环切换五种地图美术风格（云海/桃花/魔渊/水墨/星空） */
  private cycleTheme(): void {
    this.themeIdx = (this.themeIdx + 1) % THEME_ORDER.length;
    const name = THEME_ORDER[this.themeIdx];
    this.map.setTheme(name);
    this.ambience.setTheme(name);
    this.hint("地图风格：" + THEME_LABELS[name]);
  }

  private applyEffects(effects: StoryEffect[]): void {
    for (const e of effects) {
      switch (e.t) {
        case "openShop": this.openShop(); break;
        case "rogueBlessing": this.grantRogueBuff(); break;
        case "rogueRelic": this.grantRogueRelic(); break;
        case "rogueMystery": this.rollRogueMystery(); break;
        default: this.player.applyEffects([e]);
      }
    }
    if ((this.player.flags["ch1_win"] || this.player.flags["ch2_win"]) && !this.wonHandled) {
      this.wonHandled = true;
      this.onChapterWin();
    }
  }

  private grantRogueBuff(): void {
    const b = pickRogueBuff(this.player.rng);
    this.player.addBuff(b);
    this.hint(`秘境祝福：${this.buffName(b.kind)}（${this.buffDesc(b)}）`);
  }
  private grantRogueRelic(): void {
    const b = pickRogueRelic(this.player.rng);
    this.player.addRogueRelic(b);
    this.hint(`秘境遗物：${this.buffName(b.kind)}（${this.buffDesc(b)}，整局生效）`);
  }
  private rollRogueMystery(): void {
    const r = this.player.rng();
    if (r < 0.4) { const n = 100 + Math.floor(this.player.rng() * 200); this.player.gainExp(n); this.hint(`神秘造化：获得修为 ${n}`); }
    else if (r < 0.7) { const n = 50 + Math.floor(this.player.rng() * 120); this.player.gainStones(n); this.hint(`神秘造化：获得灵石 ${n}`); }
    else if (r < 0.85) { const b = pickRogueRelic(this.player.rng); this.player.addRogueRelic(b); this.hint(`神秘造化：获得遗物 ${this.buffName(b.kind)}`); }
    else { const dmg = 20 + Math.floor(this.player.rng() * 30); this.player.takeDamage(dmg); this.hint(`神秘凶险：受到 ${dmg} 点反噬`); }
  }
  private buffName(k: BuffKind): string {
    return ({ shield: "护盾", haste: "迅捷", defUp: "御体", stun: "眩晕", lifesteal: "吸血", hot: "回春", atkUp: "锐气", slow: "迟缓", crystalCap: "结晶·纳元" } as Record<string, string>)[k] ?? k;
  }
  private buffDesc(b: Buff): string {
    if (b.kind === "haste") return `移速+${Math.round(b.value * 100)}%`;
    if (b.kind === "slow") return `移速-${Math.round(b.value * 100)}%`;
    if (b.kind === "hot") return `每秒回${b.value}`;
    if (b.kind === "shield") return `护盾${b.value}`;
    return `+${(b as { value: number }).value}`;
  }

  // ================= 刷怪 / Boss =================

  /** 当前区域定义（多区域上下文） */
  private currentZoneDef(): ZoneDef {
    return ZONES[this.currentZoneId];
  }

  // —— 秘境（Roguelike）状态 ——
  private rogueSeed = 1;
  private rogueFloor = 1;
  /** 当前层事件房（踩中触发，used 防重复） */
  private rogueEvents: { gx: number; gy: number; kind: RogueEventKind; used: boolean }[] = [];
  private rogueExit = { gx: 1, gy: 1 };
  private rogueRoomCenters: { gx: number; gy: number }[] = [];
  private rogueSpawnT = 0;
  private rogueBuffKind: BuffKind | null = null;
  private rogueCleared = false;
  private rogueExitShown = false;

  /** 进入秘境：生成种子（按时间+玩家种子，保证每轮不同），从第 1 层开始 */
  private enterRogue(_spawn?: { gx: number; gy: number }): void {
    this.player.clearRogueRelics();
    this.rogueSeed = (Date.now() ^ 0x9e3779b1) >>> 0;
    this.rogueFloor = 1;
    this.rogueCleared = false;
    this.rogueExitShown = false;
    this.prepareRogueFloor();
  }

  /** 按当前层生成秘境地图 + 随机增益/诅咒，重建区域并刷怪 */
  private prepareRogueFloor(): void {
    if (this.rogueBuffKind) this.player.removeBuffKind(this.rogueBuffKind);
    const f: RogueFloor = genRogueMap(this.rogueSeed, this.rogueFloor);
    ZONES.rogue.map = f.map;
    ZONES.rogue.wild = [];
    ZONES.rogue.bossId = "";
    this.rogueExit = f.exit;
    this.rogueRoomCenters = f.roomCenters;
    this.rogueEvents = f.events.map((e) => ({ ...e, used: false }));
    for (const e of this.rogueEvents) this.addRogueEventMarker(e);
    const rb = pickRogueBuff(makeRng((this.rogueSeed ^ Math.imul(this.rogueFloor, 0x85ebca6b)) >>> 0));
    ZONES.rogue.buff = rb;
    this.rogueBuffKind = rb.kind;
    this.enterZone("rogue", f.spawn);
    this.rogueSpawnT = 0;
    this.rogueCleared = false;
    this.rogueExitShown = false;
    this.spawnRogueWave();
    this.addRogueExitMarker();
    this.hint(`秘境 · 第 ${this.rogueFloor} 层（${rb.kind === "slow" ? "诅咒·减速" : "增益·" + rb.kind}）`);
  }

  /** 在每层非出生房间中心刷出魔物（数量随层数增加） */
  private spawnRogueWave(): void {
    const pool = rogueMonsterPool(this.rogueFloor);
    const extra = this.rogueFloor > 3 ? 1 : 0;
    const rng = makeRng((this.rogueSeed ^ Math.imul(this.rogueFloor, 2654435761)) >>> 0);
    for (let i = 1; i < this.rogueRoomCenters.length; i++) {
      const c = this.rogueRoomCenters[i];
      if (this.rogueEvents.some((e) => e.gx === c.gx && e.gy === c.gy)) continue; // 事件房不刷怪
      const count = 1 + extra;
      for (let k = 0; k < count; k++) {
        const id = pool[Math.floor(rng() * pool.length)];
        const m = new Monster(
          getMonster(id),
          c.gx + (k === 0 ? -0.25 : 0.25),
          c.gy + 0.5,
          500000 + this.rogueFloor * 1000 + i * 10 + k,
          2,
        );
        this.monsters.push(m);
        this.map.addActor(m.rig.root);
      }
    }
  }

  /** 秘境每帧：检测清剿/出口推进（无自动刷怪，鼓励逐层推进） */
  private updateRogue(dt: number): void {
    void dt;
    const alive = this.monsters.filter((m) => m.alive).length;
    this.rogueCleared = alive === 0;
    if (this.rogueCleared && !this.rogueExitShown) {
      this.rogueExitShown = true;
      this.hint("本层魔物已肃清，前往出口传送阵深入下一层");
    }
    const pgx = Math.floor(this.player.gx);
    const pgy = Math.floor(this.player.gy);
    for (const e of this.rogueEvents) {
      if (e.used) continue;
      if (Math.abs(pgx - e.gx) <= 1 && Math.abs(pgy - e.gy) <= 1) {
        e.used = true;
        this.triggerRogueEvent(e.kind);
        break;
      }
    }
    if (this.rogueCleared && Math.abs(pgx - this.rogueExit.gx) <= 1 && Math.abs(pgy - this.rogueExit.gy) <= 1) {
      this.rogueFloor++;
      if (this.rogueFloor > (this.player.rogueBest || 0)) this.player.rogueBest = this.rogueFloor;
      this.hint(`秘境第 ${this.rogueFloor} 层已开启`);
      this.prepareRogueFloor();
    }
  }

  /** 秘境内死亡：保留所获，退回落霞镇（下次进入重新生成） */
  private onRogueDeath(): void {
    this.player.clearRogueRelics();
    if (this.player.hp <= 0) this.player.hp = this.player.maxHp;
    if (this.rogueBuffKind) this.player.removeBuffKind(this.rogueBuffKind);
    this.enterZone("ch1");
    this.hint("秘境试炼中断，你携所获修为退回了落霞镇");
  }

  /** 在出口处绘制紫色传送阵标记（区别于返回阵的蓝色） */
  private addRogueExitMarker(): void {
    const p = gridToScreen(this.rogueExit.gx, this.rogueExit.gy);
    const s = new Laya.Sprite();
    const g = s.graphics;
    g.drawCircle(p.x, p.y, 28, "rgba(150,60,200,0.35)", "#d8a6ff", 2);
    g.drawCircle(p.x, p.y, 16, "rgba(216,166,255,0.25)", null, 0);
    s.scale(1 / this.map.zoom, 1 / this.map.zoom);
    this.map.structureLayer.addChild(s);
  }

  /** 事件房地面标记（按类型着色：金=商人 紫=祭坛 红=问号） */
  private addRogueEventMarker(e: { gx: number; gy: number; kind: RogueEventKind }): void {
    const p = gridToScreen(e.gx, e.gy);
    const color = e.kind === "shop" ? "#d6a13a" : e.kind === "altar" ? "#9b6dd6" : "#c0392b";
    const s = new Laya.Sprite();
    const g = s.graphics;
    g.drawCircle(p.x, p.y, 24, "rgba(255,255,255,0.18)", color, 3);
    g.drawCircle(p.x, p.y, 12, "rgba(255,255,255,0.3)", null, 0);
    s.scale(1 / this.map.zoom, 1 / this.map.zoom);
    this.map.structureLayer.addChild(s);
  }

  /** 踩中事件房：复用 STORY 节点播放事件对话（已修复的弹层） */
  private triggerRogueEvent(kind: RogueEventKind): void {
    const node = kind === "shop" ? "rogue_shop" : kind === "altar" ? "rogue_altar" : "rogue_question";
    this.dialogue.open(node);
    this.openDialogueBox();
    this.hint(kind === "shop" ? "你遇到了游方商人" : kind === "altar" ? "你来到古老祭坛" : "你察觉到一丝异动");
  }

  private spawnLogic(dt: number): void {
    this.spawnT -= dt;
    const f = this.player.flags;
    if ((f["ch1_win"] || f["ch2_win"]) && this.currentZoneId !== "zhuomo") return;
    const q = this.player.quests;
    // 仅在仍有激活的猎杀/支线任务时刷野怪（防止通关后无限刷）；秘境无论是否有任务都刷新
    if (q.active.length === 0 && this.currentZoneId !== "dungeon" && this.currentZoneId !== "tower" && this.currentZoneId !== "zhuomo") return;

    const alive = this.monsters.filter((m) => m.alive && !m.isBoss).length;
    if (alive < 3 && this.spawnT <= 0) {
      const zone = this.currentZoneDef();
      const entry = zone.wild[Math.floor(Math.random() * zone.wild.length)];
      if (entry && entry.spots.length) {
        const spot = entry.spots[Math.floor(Math.random() * entry.spots.length)];
        const m = new Monster(getMonster(entry.id), spot.gx + 0.5, spot.gy + 0.5, 1000 + Math.floor(Math.random() * 9999), 2);
        this.monsters.push(m);
        this.map.addActor(m.rig.root);
        this.spawnT = 2.5;
      }
    }

    // Boss：对话选择后刷新（按区域独立）
    if (f["boss_spawned"] && !f["boss_dead_" + this.currentZoneId]) {
      const exists = this.monsters.some((m) => m.isBoss);
      if (!exists) {
        const zone = this.currentZoneDef();
        const b = this.currentMap.bossSpot;
        const boss = new Monster(getMonster(zone.bossId), b.gx + 0.5, b.gy + 0.5, 424242, 3);
        this.monsters.push(boss);
        this.map.addActor(boss.rig.root);
        this.sfx.boss();
        const isZhuo = zone.id === "zhuomo";
        this.cutscene.play({
          title: boss.def.name,
          sub: isZhuo ? "魔尊" : zone.id === "ch2" ? "覆海蛟" : "妖狼王",
          lines: [`　　${boss.def.name} 现身！`, isZhuo ? "魔气滔天，唯镇魔者可过。" : "击破它，方得安生。"],
        });
        this.hint(isZhuo ? "魔尊已在魔渊高台现身！" : zone.id === "ch2" ? "覆海蛟已在星岛高台现身！" : "妖狼王已在后山高地现身！");
      }
    }
    // 坠魔谷魔尊多阶段（血阈触发 enrage + 召唤）
    this.updateZhuoBossPhases();
  }

  /** 坠魔谷魔尊多阶段：血量阈值触发狂暴与召唤魔物 */
  private updateZhuoBossPhases(): void {
    const boss = this.monsters.find((m) => m.isBoss && m.alive && !!m.def.demon);
    if (!boss) return;
    const ph = (boss as any)._zhuoPhases || ((boss as any)._zhuoPhases = { p2: false, p3: false });
    const ratio = boss.hp / boss.maxHp;
    if (!ph.p2 && ratio <= 0.66) {
      ph.p2 = true;
      boss.baseAtk = Math.round(boss.baseAtk * 1.3);
      boss.baseDef = Math.round(boss.baseDef * 1.2);
      this.spawnDemonAdd(boss, "mo-jing-lang");
      // 二阶段登场：橙红屏闪 + 横幅 + 推镜
      this.flash("#ff6b35", 0.5, 0.35);
      this.bossBanner(`${boss.def.name} 狂暴！`, "#ff6b35");
      this.cam.addTrauma(0.6);
      this.cam.punchZoom(1.12, 0.5);
      this.sfx.phase();
      this.hint(`${boss.def.name} 魔气暴涨，召来魔狼！`);
    }
    if (!ph.p3 && ratio <= 0.33) {
      ph.p3 = true;
      boss.baseAtk = Math.round(boss.baseAtk * 1.3);
      boss.baseSpeed *= 1.2;
      this.spawnDemonAdd(boss, "xin-mo");
      // 三阶段登场：紫红屏闪 + 横幅 + 强推镜
      this.flash("#b14bff", 0.6, 0.4);
      this.bossBanner(`${boss.def.name} 彻底狂暴！`, "#b14bff");
      this.cam.addTrauma(0.8);
      this.cam.punchZoom(1.15, 0.55);
      this.sfx.phase();
      this.hint(`${boss.def.name} 彻底狂暴！`);
    }
  }

  /** 在 Boss 附近召唤一只魔物（多阶段召唤） */
  private spawnDemonAdd(boss: Monster, id: string): void {
    const ox = (Math.random() < 0.5 ? -1 : 1) * 2;
    const oy = (Math.random() < 0.5 ? -1 : 1) * 2;
    const m = new Monster(getMonster(id), boss.gx + ox, boss.gy + oy, 1000 + Math.floor(Math.random() * 9999), 2);
    this.monsters.push(m);
    this.map.addActor(m.rig.root);
  }

  private bossInfo(): { name: string; hp: number; maxHp: number } | null {
    const boss = this.monsters.find((m) => m.isBoss && m.alive);
    return boss ? { name: boss.def.name, hp: boss.hp, maxHp: boss.maxHp } : null;
  }

  // ================= 战斗结算 =================

  private pickTarget(): Monster | null {
    if (this.target && this.target.alive) return this.target;
    let best: Monster | null = null;
    let bd = 10;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = Math.hypot(m.gx - this.player.gx, m.gy - this.player.gy);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  private useSkill(slot: number): void {
    const skill = this.player.skillInSlot(slot);
    if (!skill) return;
    if (this.player.casting) return;
    if (this.player.cdOf(skill.id) > 0) {
      this.hint(`${skill.name} 冷却中`);
      return;
    }
    if (this.player.mp < skill.mpCost) {
      this.hint("灵力不足");
      return;
    }
    const offensive = skill.power > 0 || skill.effect.kind === "stun" || skill.effect.kind === "lifesteal";
    if (offensive) {
      const tgt = this.pickTarget();
      if (!tgt) {
        this.hint("没有可攻击的目标");
        return;
      }
      const d = Math.hypot(tgt.gx - this.player.gx, tgt.gy - this.player.gy);
      if (d > skill.range) {
        this.target = tgt;
        this.player.computePath(this.currentMap, Math.floor(tgt.gx), Math.floor(tgt.gy));
        this.hint(`接近目标…（${tgt.def.name}）`);
        return;
      }
      this.target = tgt;
    }
    this.player.startCast(slot);
    this.sfx.cast();
  }

  /** 施法完成 → 结算（Game 统一应用伤害/效果） */
  private resolveCast(): void {
    const skill = this.player.castReady;
    if (!skill) return;
    this.player.castReady = null;

    const offensive = skill.power > 0 || skill.effect.kind === "stun" || skill.effect.kind === "lifesteal";
    if (offensive) {
      const tgt = this.pickTarget();
      if (!tgt) {
        this.hint("目标已消失，施法失败");
        return;
      }
      const d = Math.hypot(tgt.gx - this.player.gx, tgt.gy - this.player.gy);
      if (d > skill.range + 0.5) {
        this.hint("距离过远，施法失败");
        return;
      }
      this.player.faceTo(tgt.gx);
      const from = { gx: this.player.gx, gy: this.player.gy };
      const to = { gx: tgt.gx, gy: tgt.gy };
      if (skill.projectile) {
        const p0 = gridToScreen(from.gx, from.gy);
        const p1 = gridToScreen(to.gx, to.gy);
        const sprite = new Laya.Sprite();
        sprite.graphics.drawCircle(0, 0, 6, skill.branch === "law" ? "#ff9f6e" : "#9fe8ff", "#ffffff", 1);
        sprite.pos(p0.x, p0.y);
        this.fxLayer.addChild(sprite);
        this.projectiles.push({ sprite, x: sprite.x, y: sprite.y, tx: p1.x, ty: p1.y, skill });
      } else {
        this.applySkillDamage(skill, to, tgt);
      }
    } else {
      this.applySelfEffect(skill);
    }
  }

  private applySelfEffect(skill: SkillDef): void {
    this.sfx.cast();
    const e = skill.effect;
    if (e.kind === "heal") {
      const h = this.player.heal(e.value);
      this.fx.floatText(this.player.px, this.player.headY, `+${Math.round(h)}`, "#8fd18f");
      this.sfx.heal();
    } else if (e.kind === "shield") {
      this.player.addBuff({ kind: "shield", value: e.value, t: e.dur });
      this.fx.floatText(this.player.px, this.player.headY, "剑盾", "#9fe8ff");
    } else if (e.kind === "haste") {
      this.player.addBuff({ kind: "haste", value: e.value, t: e.dur });
      this.fx.floatText(this.player.px, this.player.headY, "疾行", "#c9f29f");
    } else if (e.kind === "defUp") {
      this.player.addBuff({ kind: "defUp", value: e.value, t: e.dur });
      this.fx.floatText(this.player.px, this.player.headY, "铁骨", "#e8dcc0");
    } else if (e.kind === "atkUp") {
      this.player.addBuff({ kind: "atkUp", value: e.value, t: e.dur });
      this.fx.floatText(this.player.px, this.player.headY, "锐气", "#ffd166");
    } else if (e.kind === "regen") {
      this.player.addBuff({ kind: "hot", value: e.value, t: e.dur });
      this.fx.floatText(this.player.px, this.player.headY, "凝息", "#8fd18f");
      this.sfx.heal();
    }
  }

  private applySkillDamage(skill: SkillDef, at: { gx: number; gy: number }, primary: Monster | null): void {
    let victims: Monster[] = [];
    if (skill.aoe > 0) {
      victims = this.monsters.filter((m) => m.alive && Math.hypot(m.gx - at.gx, m.gy - at.gy) <= skill.aoe);
    } else if (primary && primary.alive) {
      victims = [primary];
    }
    if (victims.length === 0) {
      this.sfx.miss();
      this.fx.floatText(this.player.px, this.player.headY, "未命中", "#9aa4bd");
      return;
    }
    // 连携：命中即推进一层（切换技能才涨层），按层数取伤害倍率
    const beforeCount = this.combo.count;
    this.combo = comboPush(this.combo, skill.id);
    const mul = comboMul(this.combo);
    if (this.combo.count > beforeCount && this.combo.count >= 2) {
      this.sfx.combo();
      this.fx.floatText(this.player.px, this.player.headY - 30, `连携 ×${this.combo.count}`, "#ffd166", 14);
    }
    let dealt = 0;
    let anyCrit = false;
    for (const m of victims) {
      const wasFrozen = m.hasStatus("frozen");
      const { dmg, crit } = calcDamage({
        atk: this.player.effAtk,
        def: m.effDef,
        power: skill.power * mul,
        critRate: this.player.critRateTotal,
        critMul: this.player.critMul,
        rng: this.player.rng,
      });
      const em = elementMultiplier(skill.element, m.element);
      let fdmg = Math.round(dmg * em);
      if (m.broken) fdmg = Math.round(fdmg * 1.5); // 破防易伤
      if (crit) anyCrit = true;
      const r = m.takeDamage(fdmg);
      dealt += r.dealt;
      if (r.dealt > 0) {
        this.streak += 1;
        this.streakT = 2.0;
        if (this.streak % 5 === 0) {
          m.applyKnockback(this.player.gx - m.gx, this.player.gy - m.gy, 5);
          this.fx.floatText(m.px, m.headY - 10, `连击 ×${this.streak}`, "#ff9bf2", 14);
          this.fx.burst(m.px, m.py - 20, "#ff9bf2", 6);
        }
      }
      const tag = elementTag(skill.element, m.element);
      this.fx.floatText(m.px, m.headY, `${crit ? "暴击 " : ""}${tag ? tag + " " : ""}-${r.dealt}`, crit ? "#ffd166" : "#ffffff", crit ? 20 : 15);
      // 命中表现：粒子爆散 + 击退（沿玩家→怪方向）+ 震屏 + 顿帧（per-skill 可覆盖）
      const feel = skill.feel ?? defaultFeel(skill);
      this.fx.burst(m.px, m.py - 24, feel.fxColor ?? (crit ? "#ffd166" : "#ffe08a"), crit ? 12 : 6);
      const kdx = m.gx - this.player.gx;
      const kdy = m.gy - this.player.gy;
      m.applyKnockback(kdx, kdy, crit ? 5.5 : 3.5);
      this.cam.addTrauma(feel.shake ?? (crit ? 0.5 : skill.power >= 2.4 ? 0.38 : 0.28));
      const stop = feel.hitstop ?? (crit ? 0.07 : skill.power >= 2.4 ? 0.05 : 0);
      if (stop > 0) this.hitstopT = Math.max(this.hitstopT, stop);
      if (feel.zoom) this.cam.punchZoom(feel.zoom, 0.4);
      if (feel.slowmo) this.setSlowmo(feel.slowmo, 0.18);
      // 破防：削减韧性，破则触发硬直演出
      const pd = (crit ? 34 : 16) * (skill.power >= 2.4 ? 1.6 : 1);
      if (m.damagePoise(pd)) this.onBreak(m);
      // 处决：破防且残血 → 高额处决演出
      if (r.dealt > 0 && m.broken && m.hp <= m.maxHp * 0.25) this.onExecute(m);
      if (skill.effect.kind === "stun") m.addBuff({ kind: "stun", value: 1, t: skill.effect.dur });
      if (skill.effect.kind === "slow") {
        m.addBuff({ kind: "slow", value: skill.effect.value, t: skill.effect.dur });
        this.fx.floatText(m.px, m.headY - 14, "迟缓", "#9fe8ff", 11);
      }
      // 元素附着：火→灼烧，雷→感电态，水→湿润，冰→冰封（先附着，再判定反应）
      if (skill.element === "fire") m.addBuff({ kind: "burn", value: 8, t: 3 });
      else if (skill.element === "thunder") m.addBuff({ kind: "shock", value: 6, t: 2.5 });
      else if (skill.element === "water") m.addBuff({ kind: "wet", value: 1, t: 4 });
      else if (skill.element === "ice") m.addBuff({ kind: "chill", value: 1, t: 4 });
      // 元素反应：火+雷=感电、火+水=蒸发、雷+水=导电、火+冰=融化、雷+冰=超导、水+冰=冻结
      let reactElem: ElementKind | null = null;
      if (skill.element === "thunder" && m.hasStatus("burn")) { this.triggerShock(m, crit); reactElem = "thunder"; }
      else if (skill.element === "fire" && m.hasStatus("shock")) { this.triggerShock(m, crit); reactElem = "thunder"; }
      else if (skill.element === "fire" && m.hasStatus("wet")) { this.triggerVaporize(m); reactElem = "fire"; }
      else if (skill.element === "thunder" && m.hasStatus("wet")) { this.triggerElectro(m); reactElem = "thunder"; }
      else if (skill.element === "fire" && m.hasStatus("chill")) { this.triggerMelt(m); reactElem = "fire"; }
      else if (skill.element === "thunder" && m.hasStatus("chill")) { this.triggerSuperconduct(m); reactElem = "thunder"; }
      else if (skill.element === "ice" && m.hasStatus("wet")) { this.triggerFreeze(m); reactElem = "ice"; }
      else if (skill.element === "water" && m.hasStatus("chill")) { this.triggerFreeze(m); reactElem = "ice"; }
      // 反应连锁：灼烧 + 感电 共存 → 超载爆发（消耗灼烧，保留感电态）
      if (m.hasStatus("burn") && m.hasStatus("shock")) { this.triggerOverload(m); reactElem = "fire"; }
      // 碎冰进阶：已冻结目标被元素直击 → 按元素不同碎裂（火=融碎、雷=超导碎），其余重击=普通碎冰
      if (wasFrozen) {
        if (skill.element === "fire") { this.triggerMeltShatter(m); reactElem = "ice"; }
        else if (skill.element === "thunder") { this.triggerSuperconductShatter(m); reactElem = "ice"; }
        else if (crit || skill.power >= 2.4) { this.triggerShatter(m); reactElem = "ice"; }
      }
      // 护盾结晶：玩家持盾时触发元素反应 → 按反应元素生成结晶护盾（配色 + 抗性）
      if (reactElem) this.crystallizeShield(reactElem);
      m.faceTo(this.player.gx);
    }
    if (anyCrit) this.sfx.crit(); else this.sfx.hit();
    // 词条吸血：普攻/技能命中按总伤害比例回血（独立于摄魂技能）
    const ls = this.player.lifestealTotal;
    if (ls > 0 && dealt > 0) {
      const h = this.player.heal(dealt * ls);
      this.fx.floatText(this.player.px, this.player.headY - 18, `吸血 +${Math.round(h)}`, "#ff9aa8", 11);
      this.sfx.heal();
    }
    if (skill.effect.kind === "lifesteal" && dealt > 0) {
      const h = this.player.heal(dealt * skill.effect.ratio);
      this.fx.floatText(this.player.px, this.player.headY, `摄魂 +${Math.round(h)}`, "#c9a0ff");
      this.sfx.heal();
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = 9 * 60 * dt;
      if (dist <= step) {
        p.x = p.tx;
        p.y = p.ty;
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
      p.sprite.pos(p.x, p.y);
      // 命中检测：弹道碰到任何活怪即爆
      let hit: Monster | null = null;
      for (const m of this.monsters) {
        if (!m.alive) continue;
        if (Math.hypot(m.px - p.x, m.py - 24 - p.y) < 22) {
          hit = m;
          break;
        }
      }
      if (hit || dist <= step) {
        this.fxLayer.removeChild(p.sprite);
        p.sprite.destroy?.();
        this.projectiles.splice(i, 1);
        const at = hit ? { gx: hit.gx, gy: hit.gy } : { gx: 0, gy: 0 };
        if (hit) this.applySkillDamage(p.skill, at, hit);
        else this.applySkillDamage(p.skill, at, null);
      }
    }
  }

  /** 怪物前摇完成的攻击 → 对玩家结算 */
  private resolveHits(): void {
    for (const m of this.monsters) {
      if (!m.pendingHit) continue;
      const hit = m.pendingHit;
      m.pendingHit = null;
      const d = Math.hypot(m.gx - this.player.gx, m.gy - this.player.gy);
      if (hit.aoe > 0) {
        if (d <= hit.aoe + 0.6) this.damagePlayer(m, hit.power);
        if (m.isBoss) this.sfx.boss();
        this.hint(`${m.def.name} 发动了${m.def.skill?.name || "范围攻击"}！`);
      } else if (d <= m.def.attackRange + 0.4) {
        this.damagePlayer(m, hit.power);
      }
    }
  }

  private damagePlayer(m: Monster, power: number): void {
    const { dmg, crit } = calcDamage({
      atk: m.effAtk,
      def: this.player.effDef,
      power,
      critRate: 0.05,
      critMul: 1.4,
      rng: m.rng,
    });
    const em = elementMultiplier(m.element, this.player.element);
    let fdmg = Math.round(dmg * em);
    // 结晶护盾抗性：护盾元素与来袭元素相同 → 减伤 30%
    const sh = this.player.buffs.find((b) => b.kind === "shield" && b.elems && b.elems.length);
    if (sh && sh.elems && m.element && sh.elems.includes(m.element)) fdmg = Math.round(fdmg * 0.7);
    // P3-1b 格挡/弹反：举盾时减伤；举盾瞬间窗口内被命中触发弹反（完全免伤+反制）
    if (this.player.blocking) {
      if (this.player.blockT <= 0.18) {
        // 弹反：完全免伤，对攻击者施加硬直 + 击退，并给予强反馈
        fdmg = 0;
        m.addBuff({ kind: "stun", value: 1, t: 1.0 });
        m.applyKnockback(this.player.gx - m.gx, this.player.gy - m.gy, 8);
        this.hitstopT = Math.max(this.hitstopT, 0.1);
        this.cam.addTrauma(0.5);
        this.sfx.parry();
        this.fx.floatText(this.player.px, this.player.headY - 24, "弹反!", "#ffe08a", 18);
        this.fx.burst(this.player.px, this.player.py - 20, "#ffe08a", 10);
      } else {
        // 普通格挡：按减伤系数承受，消耗少量体力
        fdmg = Math.round(fdmg * (1 - this.player.guardMul));
        this.player.stamina = Math.max(0, this.player.stamina - 6);
        this.sfx.block();
        this.fx.floatText(this.player.px, this.player.headY - 20, `格挡 ${fdmg}`, "#9fe8ff", 12);
      }
    }
    const r = this.player.takeDamage(fdmg);
    if (r.dealt > 0) {
      const tag = elementTag(m.element, this.player.element);
      this.combo = emptyCombo(); // 受击断裂连携
      this.fx.floatText(this.player.px, this.player.headY, `${tag ? tag + " " : ""}-${r.dealt}`, "#ff8fa3", crit ? 20 : 15);
      // 受击表现：粒子爆散 + 击退（沿怪物→玩家方向）+ 震屏 + 顿帧
      this.fx.burst(this.player.px, this.player.py - 20, "#ff8fa3", crit ? 12 : 6);
      const kdx = this.player.gx - m.gx;
      const kdy = this.player.gy - m.gy;
      this.player.applyKnockback(kdx, kdy, crit ? 6 : 4);
      this.cam.addTrauma(crit ? 0.5 : 0.3);
      if (r.dealt > 0) this.hitstopT = Math.max(this.hitstopT, crit ? 0.06 : 0.04);
      this.sfx.hit();
    }
    if (r.absorbed > 0) {
      this.sfx.block();
      this.fx.floatText(this.player.px, this.player.headY - 20, `格挡 ${r.absorbed}`, "#9fe8ff", 12);
    }
    if (!this.player.alive) this.onPlayerDown();
  }

  private onPlayerDown(): void {
    this.hint("你伤势过重，被村民抬回了村中……");
    this.player.revive(Math.round(this.player.maxHp * 0.6));
    this.player.mp = Math.round(this.player.maxMp * 0.5);
    this.player.gx = this.currentMap.playerSpawn.gx + 0.5;
    this.player.gy = this.currentMap.playerSpawn.gy + 0.5;
    this.player.stop();
    for (const m of this.monsters) m.stop();
    this.saveGame();
  }

  private resolveDeaths(): void {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (m.alive) continue;
      if (!m.handled) {
        m.handled = true;
        this.onMonsterDeath(m);
      }
      if (m.deadT < 1.4) continue;
      this.map.removeActor(m.rig.root);
      this.monsters.splice(i, 1);
      if (this.target === m) this.target = null;
    }
  }

  /** 怪物死亡：修为/掉落/任务计数/Boss 通关链 */
  private onMonsterDeath(m: Monster): void {
    const beforeRealm = this.player.realmIndex;
    const completed = this.player.addKill(m.def.id);
    const evMul = this.player.eventKillMul(Date.now());
    this.player.gainExp(Math.round(m.expValue * evMul));
    this.maybeTribulate();
    const leveled = this.player.realmIndex > beforeRealm;

    const drops = m.rollDrops();
    const isRogue = this.currentZoneId === "rogue";
    const bias = m.def.boss ? 0.6 : (isRogue ? Math.min(0.5, this.rogueFloor * 0.08) : 0);
    const names: string[] = [];
    for (const d of drops) {
      const got = this.player.addItem(d.id, d.count, bias);
      if (got > 0) names.push(`${getItem(d.id)?.name || d.id}x${got}`);
    }
    const stones = m.rollStones();
    const expGain = Math.round(m.expValue * evMul);
    const stoneGain = Math.round(stones * evMul);
    if (stoneGain > 0) this.player.gainStones(stoneGain);
    this.fx.floatText(
      m.px, m.headY,
      `修为+${expGain}${stoneGain > 0 ? ` 灵石+${stoneGain}` : ""}${leveled ? " 突破！" : ""}`,
      "#b48fd1", 16,
    );
    if (drops.length > 0) {
      this.sfx.pickup();
      this.fx.floatText(m.px, m.headY - 26, names.length > 0 ? `获得 ${names.join("、")}` : "背包已满", "#ffd166", 13);
    }
    if (leveled) {
      this.sfx.levelup();
      this.hint(`境界突破：${this.player.realmName}！`);
    }
    for (const qid of completed) {
      this.hint(`事务完成：${QUESTS[qid]?.name || qid}`);
    }
    this.sfx.die();
    if (m.isBoss) {
      this.player.flags["boss_dead_" + this.currentZoneId] = true;
      if (this.currentZoneId === "zhuomo") {
        this.hint("魔尊伏诛！坠魔谷魔气为之一清。");
        this.player.gainExp(2000);
        this.player.gainStones(1000);
      } else {
        this.dialogue.open(this.currentZoneId === "ch2" ? "ch2_win_1" : "win_1");
      }
      this.openDialogueBox();
    }
    this.bossDeathFx(m);
    this.saveGame();
  }

  // ================= 留存驱动 =================

  /** 今天日期（本地，YYYY-MM-DD） */
  private todayStr(): string {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  /** 教程推进：按移动/交谈/学技/击杀事件顺序点亮步骤 */
  private driveTutorial(): void {
    if (this.tutorial.done) return;
    if (this.player.gx !== this.tutPrev.gx || this.player.gy !== this.tutPrev.gy) this.tutorial.notify("moved");
    if (this.tutDialogueOpens > this.tutPrev.dlg) this.tutorial.notify("talked");
    if (this.player.learned.length > this.tutPrev.learned) this.tutorial.notify("skilled");
    if (this.player.kills > this.tutPrev.kills) this.tutorial.notify("killed");
    this.tutPrev = { gx: this.player.gx, gy: this.player.gy, learned: this.player.learned.length, kills: this.player.kills, dlg: this.tutDialogueOpens };
  }

  /** 成就达成与图鉴新增的轻提示 */
  private driveToasts(): void {
    const u = this.player.achievements.unlocked;
    if (u.length > this.lastAchCount) {
      const id = u[u.length - 1];
      this.hint(`成就达成：${getAchievement(id)?.name || id}`);
      this.sfx.achievement();
      this.lastAchCount = u.length;
    }
    if (this.player.flags["codex_new"]) {
      delete this.player.flags["codex_new"];
      this.hint("图鉴新增条目（按 C 查看）");
    }
  }

  // ================= 存档 / 云 =================

  private saveGame(): void {
    this.player.markActive();
    this.saveMgr.save(this.token, this.player.serialize());
  }

  private async onChapterWin(): Promise<void> {
    if (!this.token) {
      this.token = await this.saveMgr.login(this.player.nickname);
      if (this.token) LocalStorage.writeToken(this.token);
    }
    this.saveGame();
    await this.cloud.submit(this.token || "", {
      nickname: this.player.nickname,
      realm: this.player.realmName,
      timeMs: Math.round(this.elapsed * 1000),
      kills: this.player.kills,
      chapter: this.player.chapter,
    });
    // P3-7 多周目：通关授予元进度（每局仅一次），持久化后供重开新档继承
    if (!this.player.flags["ngGranted"]) {
      this.player.flags["ngGranted"] = true;
      const m = grantClear(loadMeta());
      saveMeta(m);
      this.hint(`通关！凝聚道痕（共 ${m.daoHen}，已达第 ${m.ngPlus} 周目境界）— 重开新档可继承加成`);
    }
  }

  private async showResult(): Promise<void> {
    this.phase = "result";
    const entries = await this.cloud.leaderboard();
    this.resultUI.show(
      {
        nickname: this.player.nickname,
        realm: this.player.realmName,
        timeMs: Math.round(this.elapsed * 1000),
        kills: this.player.kills,
        chapter: this.player.chapter,
      },
      entries,
    );
  }

  // ================= 杂项 =================

  private hint(msg: string): void {
    this.hintText.text = msg;
    this.hintText.visible = true;
    this.hintT = 3;
  }

  /** 测试/自动化入口：模拟一次点击（画布坐标） */
  debugClick(x: number, y: number): void {
    const grid = this.map.pick(x, y, this.cam);
    if (isWalkable(grid.gx, grid.gy)) {
      this.player.computePath(this.currentMap, Math.floor(grid.gx), Math.floor(grid.gy));
    }
  }

  /** 测试/自动化入口：推进一帧（外部驱动时使用） */
  debugStep(dt: number): void {
    this.lastT = Date.now();
    const before = Date.now();
    void before;
    this.updatePlay(dt);
    this.hud.update(this.player, this.bossInfo());
    this.skillBar.update(this.player);
  }

  /** 测试/自动化入口：直接造成一次击杀计数 */
  debugKill(monsterId: string): string[] {
    return this.player.addKill(monsterId);
  }

  get questsDebug() {
    return this.player.quests;
  }
}
