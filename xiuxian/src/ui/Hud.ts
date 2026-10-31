/**
 * HUD：左上角色状态（头像/气血/灵力/修为/境界），右上任务追踪，顶部 Boss 血条。
 */
import type { Player } from "../entities/Player";
import { QUESTS } from "../data/story/chapter1";
import { realmProgress } from "../data/realms";
import { makeBar, text, hit, type Bar } from "./widgets";
import { drawArt } from "./art";
import { ART } from "../core/Assets";

export class Hud {
  readonly root: any = new Laya.Sprite();
  private portrait: any;
  private hpBar: Bar;
  private mpBar: Bar;
  private expBar: Bar;
  private realmText: any;
  private stoneText: any;
  private powerText: any;
  private chapterText: any;
  private questPanel: any;
  private questText: any;
  private bossPanel: any;
  private bossBar: Bar;
  private bossName: any;
  private comboPanel: any;
  private comboText: any;
  private comboBar: Bar;
  private blockMark: any;
  private streakPanel: any;
  private streakText: any;
  private autoText: any;
  private tribBtn: any;
  private alchBtn: any;
  private beastBtn: any;
  private towerBtn: any;
  private arenaBtn: any;
  private ascendBtn: any;
  private eventBtn: any;
  private socialBtn: any;
  private promptText: any;

  constructor(onTribulate?: () => void, onAlchemy?: () => void, onBeast?: () => void, onTower?: () => void, onArena?: () => void, onAscend?: () => void, onEvent?: () => void, onSocial?: () => void, onMap?: () => void, onCast?: () => void) {
    // —— 左上：角色面板 ——
    const panel = new Laya.Sprite();
    panel.graphics.drawRoundRect(0, 0, 240, 120, 10, 10, 10, 10, "#141828cc", "#3a4a6a", 1);
    this.root.addChild(panel);

    const portrait = new Laya.Sprite();
    portrait.graphics.drawRoundRect(8, 8, 40, 40, 8, 8, 8, 8, "#3a6ea5", "#ffffff33", 1);
    this.root.addChild(portrait);
    this.portrait = portrait;
    this.realmText = text("", { size: 12, color: "#ffd166", bold: true });
    this.realmText.pos(8, 54);
    this.root.addChild(this.realmText);

    this.hpBar = makeBar(150, 14, "#c2453d");
    this.hpBar.sprite.pos(58, 12);
    this.root.addChild(this.hpBar.sprite);
    this.mpBar = makeBar(150, 14, "#3d6fb4");
    this.mpBar.sprite.pos(58, 30);
    this.root.addChild(this.mpBar.sprite);
    this.expBar = makeBar(150, 10, "#8f6fb4");
    this.expBar.sprite.pos(58, 48);
    this.root.addChild(this.expBar.sprite);

    this.stoneText = text("", { size: 12, color: "#ffd166", bold: true });
    this.stoneText.pos(150, 64);
    this.root.addChild(this.stoneText);

    this.chapterText = text("", { size: 12, color: "#7fd0e0", bold: true, width: 220 });
    this.chapterText.pos(58, 78);
    this.root.addChild(this.chapterText);

    this.powerText = text("", { size: 13, color: "#ffd166", bold: true, width: 180 });
    this.powerText.pos(58, 96);
    this.root.addChild(this.powerText);

    // —— 自动战斗指示（挂机开启时显示于面板底部）——
    this.autoText = text("⚔ 自动战斗", { size: 13, color: "#ffd166", bold: true });
    this.autoText.pos(58, 112);
    this.autoText.visible = false;
    this.root.addChild(this.autoText);

    // —— 渡劫按钮（有待渡天劫时显示，点击尝试渡劫）——
    const tb = new Laya.Sprite();
    tb.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#3a2a4ecc", "#b388ff", 1);
    tb.pos(8, 132);
    const tbt = text("⚡ 渡劫", { size: 13, color: "#e9d8ff", bold: true, align: "center", width: 88 });
    tbt.pos(0, 5);
    tb.addChild(tbt);
    tb.on(Laya.Event.CLICK, this, () => onTribulate?.());
    tb.visible = false;
    this.root.addChild(tb);
    this.tribBtn = tb;

    // —— 炼丹按钮（点击打开炼丹标签页）——
    const ab = new Laya.Sprite();
    ab.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#2a3e4ecc", "#7fd0e0", 1);
    ab.pos(100, 132);
    const abt = text("⚗ 炼丹", { size: 13, color: "#dffaff", bold: true, align: "center", width: 88 });
    abt.pos(0, 5);
    ab.addChild(abt);
    ab.on(Laya.Event.CLICK, this, () => onAlchemy?.());
    this.root.addChild(ab);
    this.alchBtn = ab;

    // —— 灵兽按钮（点击打开灵兽面板）——
    const bb = new Laya.Sprite();
    bb.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#2a4e3acc", "#7fe0a0", 1);
    bb.pos(196, 132);
    const bbt = text("🐾 灵兽", { size: 13, color: "#dfffe8", bold: true, align: "center", width: 88 });
    bbt.pos(0, 5);
    bb.addChild(bbt);
    bb.on(Laya.Event.CLICK, this, () => onBeast?.());
    this.root.addChild(bb);
    this.beastBtn = bb;

    // —— 镇妖塔按钮（点击打开镇妖塔面板）——
    const tb2 = new Laya.Sprite();
    tb2.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#3a2a4ecc", "#c79bff", 1);
    tb2.pos(284, 132);
    const tb2t = text("🗼 镇妖塔", { size: 13, color: "#f3e8ff", bold: true, align: "center", width: 88 });
    tb2t.pos(0, 5);
    tb2.addChild(tb2t);
    tb2.on(Laya.Event.CLICK, this, () => onTower?.());
    this.root.addChild(tb2);
    this.towerBtn = tb2;

    // —— 竞技场按钮（点击打开竞技场面板，置于镇妖塔下方）——
    const ab2 = new Laya.Sprite();
    ab2.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#2a3a5ecc", "#9bc7ff", 1);
    ab2.pos(284, 164);
    const ab2t = text("🏟 竞技场", { size: 13, color: "#e8f2ff", bold: true, align: "center", width: 88 });
    ab2t.pos(0, 5);
    ab2.addChild(ab2t);
    ab2.on(Laya.Event.CLICK, this, () => onArena?.());
    this.root.addChild(ab2);
    this.arenaBtn = ab2;

    // —— 飞升按钮（满足飞升条件时显示）——
    const fb2 = new Laya.Sprite();
    fb2.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#4e2a3ecc", "#ffb3d9", 1);
    fb2.pos(284, 196);
    const fb2t = text("🪶 飞升", { size: 13, color: "#ffe6f4", bold: true, align: "center", width: 88 });
    fb2t.pos(0, 5);
    fb2.addChild(fb2t);
    fb2.on(Laya.Event.CLICK, this, () => onAscend?.());
    fb2.visible = false;
    this.root.addChild(fb2);
    this.ascendBtn = fb2;

    // —— 活动按钮（有进行中活动时显示）——
    const eb2 = new Laya.Sprite();
    eb2.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#3a2e54cc", "#ffd97f", 1);
    eb2.pos(284, 228);
    const eb2t = text("🎉 活动", { size: 13, color: "#fff3d6", bold: true, align: "center", width: 88 });
    eb2t.pos(0, 5);
    eb2.addChild(eb2t);
    eb2.on(Laya.Event.CLICK, this, () => onEvent?.());
    eb2.visible = false;
    this.root.addChild(eb2);
    this.eventBtn = eb2;

    // —— 社交按钮（常驻）——
    const sb2 = new Laya.Sprite();
    sb2.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#2a3a54cc", "#9fd0ff", 1);
    sb2.pos(284, 260);
    const sb2t = text("🤝 社交", { size: 13, color: "#e6f3ff", bold: true, align: "center", width: 88 });
    sb2t.pos(0, 5);
    sb2.addChild(sb2t);
    sb2.on(Laya.Event.CLICK, this, () => onSocial?.());
    this.root.addChild(sb2);
    this.socialBtn = sb2;

    // —— 三界舆图按钮（G）——
    const mb3 = new Laya.Sprite();
    mb3.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#2a4e5ecc", "#a8cfcb", 1);
    mb3.pos(8, 196);
    const mb3t = text("🗺 舆图 G", { size: 12, color: "#dff6f2", bold: true, align: "center", width: 88, height: 26 });
    mb3t.valign = "middle";
    mb3.addChild(mb3t);
    mb3.on(Laya.Event.CLICK, this, () => onMap?.());
    this.root.addChild(mb3);

    // —— 人物志按钮（Y）——
    const cb3 = new Laya.Sprite();
    cb3.graphics.drawRoundRect(0, 0, 88, 26, 8, 8, 8, 8, "#4a3a5ecc", "#e4c88a", 1);
    cb3.pos(100, 196);
    const cb3t = text("👤 人物志 Y", { size: 12, color: "#fff3d6", bold: true, align: "center", width: 88, height: 26 });
    cb3t.valign = "middle";
    cb3.addChild(cb3t);
    cb3.on(Laya.Event.CLICK, this, () => onCast?.());
    this.root.addChild(cb3);

    this.refreshPortrait();

    // —— 底部居中：交互提示（靠近采集点/可交互物时显示）——
    const pt = text("", { size: 14, color: "#e8ecf5", bold: true, align: "center", width: 400, stroke: "#000000" });
    pt.pos(0, 0);
    pt.visible = false;
    this.root.addChild(pt);
    this.promptText = pt;

    // —— 右上：任务追踪 ——
    const questPanel = new Laya.Sprite();
    questPanel.graphics.drawRoundRect(0, 0, 230, 92, 10, 10, 10, 10, "#141828cc", "#3a4a6a", 1);
    questPanel.pos(0, 0);
    this.questPanel = questPanel;
    this.root.addChild(questPanel);
    const qt = text("当前事务", { size: 13, color: "#ffd166", bold: true });
    qt.pos(10, 8);
    questPanel.addChild(qt);
    this.questText = text("", { size: 12, color: "#dfe3ee", width: 210, height: 70 });
    this.questText.pos(10, 26);
    this.questText.leading = 4;
    questPanel.addChild(this.questText);

    // —— 顶部中间：Boss 血条 ——
    this.bossPanel = new Laya.Sprite();
    this.bossPanel.visible = false;
    this.bossName = text("", { size: 14, color: "#ff8fa3", bold: true, align: "center", width: 320 });
    this.bossName.pos(0, 0);
    this.bossPanel.addChild(this.bossName);
    this.bossBar = makeBar(320, 16, "#9b2226");
    this.bossBar.sprite.pos(0, 20);
    this.bossPanel.addChild(this.bossBar.sprite);
    this.root.addChild(this.bossPanel);

    // —— 顶部中间下方：连携读数 ——
    this.comboPanel = new Laya.Sprite();
    this.comboPanel.visible = false;
    this.comboText = text("", { size: 15, color: "#ffd166", bold: true, align: "center", width: 200 });
    this.comboText.pos(0, 0);
    this.comboPanel.addChild(this.comboText);
    this.comboBar = makeBar(200, 8, "#e0a83c");
    this.comboBar.sprite.pos(0, 22);
    this.comboPanel.addChild(this.comboBar.sprite);
    this.root.addChild(this.comboPanel);

    // —— 左下：格挡姿态图标（P3-1b 战斗手感）——
    this.blockMark = new Laya.Sprite();
    this.blockMark.graphics.drawCircle(0, 0, 16, "rgba(20,50,60,0.7)", "#5fd0e6", 2);
    const bk = text("御", { size: 14, color: "#d6f6ff", bold: true, align: "center", width: 32 });
    bk.pos(-16, -8);
    this.blockMark.addChild(bk);
    this.blockMark.visible = false;
    this.root.addChild(this.blockMark);

    // —— 顶部中间下方：命中连击数（P3-1b 连招反馈）——
    this.streakPanel = new Laya.Sprite();
    this.streakText = text("", { size: 16, color: "#ff9bf2", bold: true, align: "center", width: 220 });
    this.streakPanel.addChild(this.streakText);
    this.streakPanel.visible = false;
    this.root.addChild(this.streakPanel);

    // 让所有带点击回调的 HUD 按钮可被真实鼠标命中（Laya 须显式 mouseEnabled + hitArea）。
    // 这些按钮均为 88x26 的圆角精灵，且没有统一走 button() 辅助，故在此统一补命中区。
    for (const c of this.root._children) {
      const hasClick = c._events && (c._events[Laya.Event.CLICK] || c._events.click);
      if (hasClick) hit(c, 88, 26);
    }
  }

  /** 视口尺寸变化时重排右上/顶中；topInset/bottomInset 为 SCALE_NOBORDER 边缘裁切内缩量 */
  layout(viewW: number, viewH: number, topInset: number, bottomInset: number, rightInset: number): void {
    this.questPanel.x = viewW - 240 - rightInset;
    this.bossPanel.x = viewW / 2 - 160;
    this.bossPanel.y = 12 + topInset;
    this.comboPanel.x = viewW / 2 - 100;
    this.comboPanel.y = 54 + topInset;
    if (this.blockMark) { this.blockMark.x = 28; this.blockMark.y = viewH - 42 - bottomInset; }
    if (this.streakPanel) { this.streakPanel.x = viewW / 2 - 110; this.streakPanel.y = 96 + topInset; }
    if (this.promptText) { this.promptText.x = viewW / 2 - 200; this.promptText.y = viewH - 42 - bottomInset; }
  }

  /** 自动战斗状态指示（Game.toggleAutoFight 调用） */
  setAutoFight(v: boolean): void {
    this.autoText.visible = v;
  }

  /** 头像：优先绘制主角（韩立）立绘，贴图未就绪时回落纯色块 */
  refreshPortrait(): void {
    if (!this.portrait) return;
    const g = this.portrait.graphics;
    g.clear();
    drawArt(g, ART.hanli, 8, 8, 40, 40, "#3a6ea5", "cover", 8);
  }

  update(player: Player, boss: { name: string; hp: number; maxHp: number } | null): void {
    this.hpBar.set(player.hp / player.maxHp, `${Math.ceil(player.hp)}/${player.maxHp}`);
    this.mpBar.set(player.mp / player.maxMp, `${Math.floor(player.mp)}/${player.maxMp}`);
    const rp = realmProgress(player.exp);
    this.expBar.set(rp.ratio, rp.maxed ? "道境圆满" : `修为 ${rp.cur}/${rp.need}`);
    this.realmText.text = `${player.nickname} · ${player.realmName}`;
    this.stoneText.text = `灵石 ${player.stones}`;
    const chName = player.chapter === 2 ? "第二章 · 乱星海" : "第一章 · 落霞镇";
    const rep = player.reputation > 0 ? ` · 声望 ${player.reputation}` : "";
    const sectTag = player.sect ? " · 玄水宗" : "";
    this.chapterText.text = `${chName}${sectTag}${rep}`;
    this.powerText.text = `战力 ${player.fightPower}`;
    this.tribBtn.visible = player.hasPendingTribulation();
    this.alchBtn.visible = true;
    this.beastBtn.visible = true;
    this.towerBtn.visible = true;
    this.arenaBtn.visible = true;
    this.ascendBtn.visible = !!player.canAscend;
    this.eventBtn.visible = player.activeEventIds(Date.now()).length > 0;
    this.socialBtn.visible = true;

    // 任务追踪：取第一个进行中任务
    const active = player.quests.active[0];
    if (active && QUESTS[active]) {
      const q = QUESTS[active];
      const p = player.quests.progress[active] || 0;
      this.questText.text = `【${q.name}】\n${q.desc}\n进度：${Math.min(p, q.n)}/${q.n}（${q.killName}）`;
    } else {
      this.questText.text = player.flags["ch2_win"]
        ? "第二章已完成。"
        : player.flags["ch1_win"]
          ? "第一章已完成。"
          : "暂无事务，去和村中人说说话吧。";
    }

    if (boss) {
      this.bossPanel.visible = true;
      this.bossName.text = boss.name;
      this.bossBar.set(boss.hp / boss.maxHp, `${Math.ceil(boss.hp)}/${boss.maxHp}`);
    } else {
      this.bossPanel.visible = false;
    }
  }

  /** 连携读数：count≥2 时显示层数与时间窗剩余比例，否则隐藏 */
  setCombo(count: number, ratio: number): void {
    if (count >= 2) {
      this.comboPanel.visible = true;
      this.comboText.text = `连携 ×${count}`;
      this.comboBar.set(Math.max(0, Math.min(1, ratio)), "");
    } else {
      this.comboPanel.visible = false;
    }
  }

  /** 格挡姿态图标：举盾时显示「御」 */
  setBlock(active: boolean): void {
    this.blockMark.visible = active;
  }
  /** 命中连击数（P3-1b 连招）：>0 时显示「X 连击」 */
  setStreak(n: number): void {
    if (n > 0) {
      this.streakPanel.visible = true;
      this.streakText.text = `${n} 连击`;
    } else {
      this.streakPanel.visible = false;
    }
  }

  /** 交互提示（靠近采集点/可交互物时显示于底部；传 null 隐藏） */
  setPrompt(t: string | null): void {
    if (t) { this.promptText.text = t; this.promptText.visible = true; }
    else this.promptText.visible = false;
  }
}
