/**
 * 三界舆图面板：展示古风卷轴舆图（人界 / 灵界 / 仙界），叠加地域标注、
 * 「当前所在」脉冲标记与右侧信息栏（当前位置 / 三界说明 / 已至之地 / 图例）。
 *
 * 键位 `G` 或 HUD「🗺 舆图」按钮开关；点击遮罩或 `ESC` 关闭；
 * 点击标注可选中并查看该地域简介。
 */
import { ART } from "../core/Assets";
import { makePanel, text, button } from "./widgets";
import { drawArt } from "./art";

export interface MapLabel {
  /** 归一化坐标（0..1，相对舆图区域；0 = 顶部仙界，1 = 底部人界） */
  x: number;
  y: number;
  t: string;
  /** 主色（主要地域用金色强调） */
  color?: string;
  /** 地域简介（选中时显示在信息栏） */
  desc?: string;
}

/** 舆图标注：集中在此，便于美术按出图微调坐标与文案 */
export const WORLD_MAP_LABELS: MapLabel[] = [
  {
    x: 0.50, y: 0.06, t: "仙界 · 仙宫", color: "#e4c88a",
    desc: "九天之上金顶仙宫，仙气流转。传言唯有踏过飞升台、渡尽天劫者方能得见。",
  },
  {
    x: 0.24, y: 0.19, t: "飞升台",
    desc: "连接灵界与仙界的最后一道天门，万年难有人踏足；台下有灵脉汇聚。",
  },
  {
    x: 0.30, y: 0.37, t: "灵界 · 妖族栖地",
    desc: "妖族盘踞的广袤荒原，灵气浓郁却危机四伏。",
  },
  {
    x: 0.70, y: 0.43, t: "灵界 · 木族灵境",
    desc: "古木参天的灵境，灵药与灵植遍地，木族世代守护。",
  },
  {
    x: 0.50, y: 0.55, t: "秘境 · 残破洞天",
    desc: "上古洞府崩塌后的残界，内藏机缘，亦藏凶物；无限回廊亦在此处。",
  },
  {
    x: 0.17, y: 0.64, t: "大晋",
    desc: "人界北域名门大派林立之地，亦是坠魔谷的入口所在。",
  },
  {
    x: 0.52, y: 0.74, t: "天南",
    desc: "人界南域，宗门杂处、散修如云，黄枫谷便在其中。",
  },
  {
    x: 0.85, y: 0.81, t: "乱星海",
    desc: "星岛错落的海域，妖气弥漫，覆海蛟盘踞高台——第二章的舞台。",
  },
  {
    x: 0.19, y: 0.90, t: "七玄门",
    desc: "韩立入门之处，江湖门派，也是他仙途的起点。",
  },
  {
    x: 0.42, y: 0.94, t: "落霞镇",
    desc: "七玄门脚下的小镇，故事从这里开始。",
  },
  {
    x: 0.70, y: 0.90, t: "黄枫谷",
    desc: "越国修仙大派，灵药与功法俱丰。",
  },
];

/** 三界分层（y 为归一化区间） */
export const REALM_BANDS: { name: string; y0: number; y1: number; color: string; desc: string }[] = [
  { name: "仙界", y0: 0.00, y1: 0.30, color: "#e4c88a", desc: "金顶仙宫悬于云海之上，唯有飞升者可至。" },
  { name: "灵界", y0: 0.30, y1: 0.60, color: "#a8cfcb", desc: "诸族并立的灵气世界，妖族、木族各据一方。" },
  { name: "人界", y0: 0.60, y1: 1.00, color: "#8fb8c9", desc: "七玄门、黄枫谷、天南、大晋、乱星海皆在此界。" },
];

/** 各区域在舆图上的落点与显示名（key 为 ZONES 的 id） */
export const ZONE_MARKS: Record<string, { x: number; y: number; label: string }> = {
  ch1: { x: 0.42, y: 0.94, label: "落霞镇" },
  ch2: { x: 0.85, y: 0.81, label: "乱星海 · 星渔村" },
  dungeon: { x: 0.50, y: 0.55, label: "秘境 · 残破洞天" },
  rogue: { x: 0.50, y: 0.55, label: "秘境 · 无限回廊" },
  zhuomo: { x: 0.17, y: 0.64, label: "坠魔谷" },
  tower: { x: 0.42, y: 0.94, label: "镇妖塔" },
};

const PANEL_W = 900;
const PANEL_H = 660;
const MAP_X = 16;
const MAP_Y = 56;
const MAP_W = 560;
const MAP_H = 560;
const INFO_X = 596;
const INFO_W = 288;
const LABEL_W = 104;

export class WorldMapPanel {
  readonly root: any = new Laya.Sprite();
  visible = false;
  private viewW = 1280;
  private viewH = 720;
  private bg: any = new Laya.Sprite();
  /** 舆图底图 + 三界分层 */
  private mapLayer: any = new Laya.Sprite();
  /** 标注按钮 */
  private markLayer: any = new Laya.Sprite();
  /** 当前所在脉冲标记 */
  private hereLayer: any = new Laya.Sprite();
  /** 右侧信息栏 */
  private infoLayer: any = new Laya.Sprite();
  /** 区域落点（可点击传送） */
  private zoneLayer: any = new Laya.Sprite();
  private zoneId = "ch1";
  private unlocked: string[] = [];
  private sel = -1;
  private t = 0;

  constructor(private onClose: () => void = () => {}, private onTeleport?: (zoneId: string) => void) {
    this.root.visible = false; // 初始隐藏，show()/hide() 切换；否则 root 默认可见会盖住标题屏
    this.root.addChild(this.bg);
    this.bg.mouseEnabled = true; // 点击空白处关闭
    this.bg.on(Laya.Event.CLICK, this, () => this.hide());

    const panel = makePanel(PANEL_W, PANEL_H, "三界舆图 · 人界 / 灵界 / 仙界");
    this.root.addChild(panel);
    panel.mouseEnabled = false;

    // 注意：内容层挂在 root 而非 panel 上 —— panel 设了 mouseEnabled=false，
    // 若把可点击子级挂在它下面，命中检测会被父级屏蔽导致按钮失效。
    this.mapLayer.pos(MAP_X, MAP_Y);
    this.root.addChild(this.mapLayer);
    this.markLayer.pos(MAP_X, MAP_Y);
    this.root.addChild(this.markLayer);
    this.hereLayer.pos(MAP_X, MAP_Y);
    this.root.addChild(this.hereLayer);
    this.infoLayer.pos(INFO_X, MAP_Y);
    this.root.addChild(this.infoLayer);
    this.zoneLayer.pos(MAP_X, MAP_Y);
    this.root.addChild(this.zoneLayer);

    const close = button("关闭 (G)", 120, 32, "#5a2e3a");
    close.pos(PANEL_W - 132, 12);
    close.on(Laya.Event.CLICK, this, () => this.hide());
    this.root.addChild(close);

    const tip = text(
      "卷轴自上而下：仙界（仙宫 · 飞升台）→ 灵界（诸族灵境 · 秘境）→ 人界（七玄门 · 黄枫谷 · 天南 · 大晋 · 乱星海）",
      { size: 12, color: "#9aa4bd", width: PANEL_W - 40, align: "center" },
    );
    tip.pos(20, PANEL_H - 30);
    panel.addChild(tip);
  }

  /** 更新当前所在区域与已解锁区域（切图 / 读档时调用） */
  setProgress(zoneId: string, unlocked: string[]): void {
    this.zoneId = zoneId;
    this.unlocked = unlocked || [];
    if (this.visible) this.refresh();
  }

  show(): void { this.visible = true; this.root.visible = true; this.refresh(); }
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.visible = false;
    this.onClose();
  }
  toggle(): void { this.visible ? this.hide() : this.show(); }

  layout(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.root.x = Math.max(0, (viewW - PANEL_W) / 2);
    this.root.y = Math.max(0, (viewH - PANEL_H) / 2);
    const g = this.bg.graphics;
    g.clear();
    g.drawRect(-this.root.x, -this.root.y, viewW, viewH, "rgba(8,10,18,0.82)");
    if ((Laya as any).Rectangle) {
      this.bg.hitArea = new Laya.Rectangle(-this.root.x, -this.root.y, viewW, viewH);
    }
    if (this.visible) this.refresh();
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.t += dt;
    this.drawHere();
  }

  refresh(): void {
    this.drawMap();
    this.drawMarks();
    this.drawZones();
    this.drawHere();
    this.drawInfo();
  }

  /** 区域落点：已解锁的金色可点（直接传送），未解锁灰色不可点 */
  private drawZones(): void {
    const layer = this.zoneLayer;
    layer.removeChildren();
    // 按坐标分组，同点多个区域则纵向错开避免重叠
    const groups = new Map<string, string[]>();
    for (const z of Object.keys(ZONE_MARKS)) {
      const mk = ZONE_MARKS[z];
      const key = `${mk.x.toFixed(2)},${mk.y.toFixed(2)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(z);
    }
    for (const ids of groups.values()) {
      ids.forEach((zoneId, gi) => {
        const mk = ZONE_MARKS[zoneId];
        const px = mk.x * MAP_W;
        const py = mk.y * MAP_H - gi * 24;
        const unlocked = this.unlocked.includes(zoneId);
        const isHere = zoneId === this.zoneId;
        const s = new Laya.Sprite();
        s.pos(px - 6, py - 6);
        s.graphics.drawCircle(6, 6, 6, unlocked ? "#ffd166" : "#6b7387", "#1a1f2e", 1);
        if (isHere) s.graphics.drawCircle(6, 6, 11, null, "#ffe9a8", 2);
        const lab = text(`${mk.label}${unlocked ? "" : "（未至）"}`, {
          size: 11, color: unlocked ? "#ffe9a8" : "#7a86a8", bold: unlocked, align: "left", width: 96, height: 18,
        });
        lab.pos(14, -3);
        s.addChild(lab);
        s.size(120, 20);
        s.mouseEnabled = true;
        if ((Laya as any).Rectangle) s.hitArea = new Laya.Rectangle(0, 0, 120, 20);
        if (unlocked && !isHere) {
          s.on(Laya.Event.CLICK, this, (e: any) => {
            e.stopPropagation();
            this.onTeleport?.(zoneId);
            this.hide();
          });
        }
        layer.addChild(s);
      });
    }
  }

  private drawMap(): void {
    const g = this.mapLayer.graphics;
    g.clear();
    const ok = drawArt(g, ART.mapSanjie, 0, 0, MAP_W, MAP_H, "#2a3550", "contain", 12);
    if (!ok) {
      const t = text("舆图加载中……", { size: 16, color: "#9aa4bd", width: MAP_W, align: "center" });
      t.pos(0, MAP_H / 2 - 10);
      this.mapLayer.addChild(t);
    }
    // 三界分层色带（左侧细条 + 文字），不遮挡画面主体
    for (const b of REALM_BANDS) {
      const y = b.y0 * MAP_H;
      const h = (b.y1 - b.y0) * MAP_H;
      g.drawRect(0, y, 6, h, b.color + "66");
    }
  }

  private drawMarks(): void {
    const layer = this.markLayer;
    layer.removeChildren();
    WORLD_MAP_LABELS.forEach((lb, i) => {
      const on = i === this.sel;
      const s = new Laya.Sprite();
      s.pos(lb.x * MAP_W - LABEL_W / 2, lb.y * MAP_H - 11);
      s.graphics.drawRoundRect(0, 0, LABEL_W, 22, 8, 8, 8, 8,
        on ? "#ffd16633" : "#0b0f1a66", on ? "#ffd166" : "#ffffff22", 1);
      const t = text(lb.t, { size: 12, color: on ? "#ffe9a8" : (lb.color || "#e8ecf5"), bold: on, align: "center", width: LABEL_W, height: 22 });
      t.valign = "middle";
      s.addChild(t);
      s.size(LABEL_W, 22);
      s.mouseEnabled = true;
      if ((Laya as any).Rectangle) s.hitArea = new Laya.Rectangle(0, 0, LABEL_W, 22);
      s.on(Laya.Event.CLICK, this, (e: any) => {
        e.stopPropagation();
        this.sel = this.sel === i ? -1 : i;
        this.drawMarks();
        this.drawInfo();
      });
      layer.addChild(s);
    });
  }

  private drawHere(): void {
    const mk = ZONE_MARKS[this.zoneId] || ZONE_MARKS.ch1;
    const px = mk.x * MAP_W;
    const py = mk.y * MAP_H;
    const g = this.hereLayer.graphics;
    g.clear();
    const pulse = 1 + 0.16 * Math.sin(this.t * 2.6);
    g.drawCircle(px, py, 15 * pulse, "#ffd16622", "#ffd166", 3);
    g.drawCircle(px, py, 5, "#ffe9a8", null, 0);
  }

  private drawInfo(): void {
    const layer = this.infoLayer;
    layer.removeChildren();
    let y = 0;

    const head = (t: string, size = 13, color = "#ffd166"): void => {
      const e = text(t, { size, color, bold: true, width: INFO_W });
      e.pos(0, y);
      layer.addChild(e);
      y += size + 10;
    };
    const line = (t: string, color = "#c8cede", size = 12): void => {
      const e = text(t, { size, color, width: INFO_W });
      e.pos(0, y);
      e.leading = 4;
      e.wordWrap = true;
      layer.addChild(e);
      y += Math.ceil(t.length / 16) * (size + 4) + 8;
    };

    const mk = ZONE_MARKS[this.zoneId] || ZONE_MARKS.ch1;
    head("当前所在");
    line(`【${mk.label}】${
      this.zoneId === "ch2" ? "星海之上，蛟影翻波。"
        : this.zoneId === "dungeon" ? "上古洞府崩塌后的残界。"
          : this.zoneId === "rogue" ? "层数无尽，清剿即可深入。"
            : this.zoneId === "zhuomo" ? "魔气渊薮，魔尊盘踞。"
              : this.zoneId === "tower" ? "镇妖塔中，层层皆敌。"
                : "七玄门脚下的小镇，仙途由此开始。"}`);

    head("三界");
    for (const b of REALM_BANDS) {
      line(`${b.name}：${b.desc}`, "#e8ecf5");
    }

    head("已至之地");
    const reached = Object.keys(ZONE_MARKS).filter((z) => this.unlocked.includes(z));
    line(reached.length ? reached.map((z) => ZONE_MARKS[z].label).join("、") : "尚未远行（与村中人交谈，开启第一段行程）", "#8fd18f");

    // 选中地域简介
    const selLabel = this.sel >= 0 ? WORLD_MAP_LABELS[this.sel] : null;
    head("地域详情");
    line(selLabel ? `${selLabel.t}：${selLabel.desc || "暂无记载。"}` : "点击舆图上的金色标签查看地域详情；点击金色区域落点可直接前往（仅限已至之地）。", selLabel ? "#ffe9a8" : "#7a86a8");
  }
}
