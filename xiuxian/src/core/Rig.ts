/**
 * 角色表现层。支持三档美术：
 *  1) 骨骼立绘（skel 选项 + 分体部件齐备）：嵌套 Sprite 骨骼层级 + 关键帧驱动，
 *     含 idle/walk/attack/cast/skill/hurt/death，可程序化替换部件。
 *  2) 静态立绘（img 选项）：透明底抠图整体缩放/律动（无骨骼变形）。
 *  3) 程序化骨架（默认兜底）：Graphics 绘制身体/头/武器。
 */
import { artTexture } from "../core/Assets";
import { cutoutToBitmap, type PartBitmap } from "../data/mapAssets";
import { SkeletonRig, type BoneDef, type ClipDef, applyEase } from "./Skeleton";
import { DragonBoneRig } from "./DragonBoneRig";

export type ClipName = "idle" | "walk" | "attack" | "cast" | "skill" | "hurt" | "death" | "dodge";

/** Flipbook（Blender 3D→2D 序列帧烘焙）单 clip 定义 */
export interface FlipbookClip {
  from: number;        // 起始帧索引（整张图集的全局帧序，0 起）
  count: number;       // 帧数
  fps?: number;        // 播放帧率（默认 12）
  loop?: boolean;      // 是否循环（缺省：idle/walk/cast 循环，其余一次性）
  hit?: number;        // 打击帧（相对本 clip 起点的帧偏移），到点触发 "hit"
}
/** Flipbook 图集定义：Blender 渲成 N 宫格 PNG，按全局帧序取帧 */
export interface FlipbookDef {
  sheet: string;       // 图集路径
  cols: number;        // 列数
  rows: number;        // 行数
  fw?: number;         // 帧宽（默认 sheet 宽/cols）
  fh?: number;         // 帧高（默认 sheet 高/rows）
  anchorX?: number;    // 锚点水平（0~1，默认 0.5 居中）
  anchorY?: number;    // 锚点垂直（0~1，默认 1.0 脚底对齐 root）
  clips: Partial<Record<ClipName, FlipbookClip>>;
}

/** 立绘档单帧姿态：抽成纯数值以便 crossfade 做混合（原来直接改 Sprite 属性，无法过渡） */
interface ArtPose {
  x: number; y: number; rot: number; sx: number; sy: number; alpha: number;
  rootRot: number; rootAlpha: number; glow: number;
  /** 刀光：alpha>0 时在 slashX/Y 处画椭圆弧 */
  slash: number; slashX: number; slashY: number; slashW: number; slashH: number;
  slashFill: string; slashLine: string; slashLW: number;
}

function emptyPose(): ArtPose {
  return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, alpha: 1, rootRot: 0, rootAlpha: 1, glow: 0, slash: 0, slashX: 0, slashY: 0, slashW: 0, slashH: 0, slashFill: "", slashLine: "", slashLW: 1 };
}

/** 姿态混合：w=1 全取 a（新 clip），w=0 全取 b（旧 clip） */
function lerpPose(a: ArtPose, b: ArtPose, w: number): ArtPose {
  const m = (p: number, q: number): number => p * w + q * (1 - w);
  return {
    x: m(a.x, b.x), y: m(a.y, b.y), rot: m(a.rot, b.rot),
    sx: m(a.sx, b.sx), sy: m(a.sy, b.sy), alpha: m(a.alpha, b.alpha),
    rootRot: m(a.rootRot, b.rootRot), rootAlpha: m(a.rootAlpha, b.rootAlpha), glow: m(a.glow, b.glow),
    slash: m(a.slash, b.slash), slashX: m(a.slashX, b.slashX), slashY: m(a.slashY, b.slashY),
    slashW: m(a.slashW, b.slashW), slashH: m(a.slashH, b.slashH),
    slashFill: w >= 0.5 ? a.slashFill : b.slashFill,
    slashLine: w >= 0.5 ? a.slashLine : b.slashLine,
    slashLW: m(a.slashLW, b.slashLW),
  };
}

function smoothstep01(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}

// 主角骨骼部件（脚底为原点，向上为负 y；pivot/布局按「内容包围盒」自标定）
const SKEL_BASE = "art/skel/hanli";
// 三部件骨架：core（头+躯干，袖手）+ 双腿（裙摆+腿+鞋）。
// AI 出的 core 自带宽袖手臂，独立手臂部件会与之叠成「第二人形」，故不装配；
// 攻击/技能张力由身体姿态 + 剑光 + 飞剑特效承担（见 clips）。
// 必需部件：躯干 + 下肢（缺一则整体回退原表现）
const SKEL_PARTS = ["core.png", "legfront.png"];
// 可选部件：手臂×2（arm=自然手,arm2=握拳持矛）、后腿（镜像复用）、甲裙（盖腿根，行走分腿不穿帮）。
// 任一缺失即跳过对应骨骼（其轨道自动忽略），不会阻断整体装配。
const SKEL_OPT_PARTS = ["armfront.png", "arm.png", "arm2.png", "spear.png", "legback.png", "skirt.png", "cape.png"];
const SKEL_TARGET_H = 80; // 骨骼角色目标总高（世界像素，脚底到头顶）；原 95 偏大压场景，回调到 80 兼顾细节与场景比例
/**
 * 部件压边系数：>1 时各部件绕自身关节放大，相邻部件互相压边，掩盖 AI 切图的硬边接缝。
 * 仍见缝可上调到 1.05；部件显"发胖"则调回 1.0。总高按下式补偿，故角色不会变高。
 */
const SKEL_SEAM_OVERLAP = 1.03;

/** 原生 Image 加载（像素处理必须绕开 Laya 的 GPU Texture2D） */
function loadNativeImg(url: string): Promise<any> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

export class Rig {
  /** 根节点：锚点在角色脚下 */
  readonly root: any = new Laya.Sprite();
  private body: any;
  private head: any;
  private weapon: any;
  private glow: any;
  private slash: any;
  /** 立绘贴图层（有 img 时绘制，替换程序化骨架） */
  private art?: any;
  private img?: string;
  private artReady = false;
  /** 立绘目标高度（世界像素 × size）：NPC 立绘 52，玩家级全身立绘 80（与 SKEL_TARGET_H 一致） */
  private imgH = 52;
  private clip: ClipName = "idle";
  private t = 0;
  /** 立绘档 crossfade：淡出源 clip / 其进度 / 过渡计时 */
  private artPrev?: ClipName;
  private artPrevT = 0;
  private artFadeT = 0;
  private static readonly ART_FADE = 0.12;
  /** 帧事件：打击帧时刻（秒），到点触发一次 "hit"（刀光与伤害对齐用） */
  private static readonly HIT_AT: Partial<Record<ClipName, number>> = { attack: 0.2, skill: 0.29 };
  private firedHit = false;
  /** 帧事件回调：供外部在打击帧挂接伤害/音效（刀光已在 Rig 内对齐） */
  onFrameEvent?: (name: string) => void;
  /** 柔性滞后弹簧状态（立绘档伪次级运动）：当前值与速度 */
  private lagRot = { a: 0, v: 0 };
  private lagX = { a: 0, v: 0 };
  private lagY = { a: 0, v: 0 };
  private lagInit = false;
  /** 各 clip 的跟随刚度：0 = 直接跟目标（出刃必须干脆，不被拖慢），越大越"硬" */
  private static readonly LAG_K: Record<ClipName, number> = {
    idle: 90, walk: 260, cast: 120, hurt: 200, dodge: 240, death: 300, attack: 0, skill: 0,
  };
  private size: number;
  private baseColor: string;
  facing = 1;

  /** 骨骼相关 */
  private skelBase?: string;
  private skelFile?: string;
  private skelRig?: SkeletonRig | DragonBoneRig;
  private skelReady = false;
  private skelScale = 0.3; // 构建骨骼时按部件尺寸动态计算
  private _skelDebug?: Record<string, number>; // 临时测量用
  /** 待机灵气环（地面光环，idle 时呼吸脉动；骨骼/立绘/兜底三态通用） */
  private idleRing?: any;
  /** Flipbook（Blender 3D→2D 序列帧）相关 */
  private sheetDef?: FlipbookDef;
  private sheetTex?: any;
  private sheetFrames: any[] = [];
  private sheetReady = false;
  private sheetDisp?: any;
  private sfw = 0;
  private sfh = 0;
  private sheetT = 0;
  private sheetFrame = 0;
  private sheetFinished = false;
  private sheetFiredHit = false;
  private skelRoot?: any; // 骨架根（flipbook 接管时隐藏，避免与序列帧叠影）

  constructor(color: string, size = 1, opts: { horn?: boolean; img?: string; imgH?: number; skel?: string; skelFile?: string; sheet?: FlipbookDef } = {}) {
    this.size = size;
    this.baseColor = color;
    this.img = opts.img;
    if (opts.imgH) this.imgH = opts.imgH;
    this.skelBase = opts.skel;
    this.skelFile = opts.skelFile;
    const s = size;
    const SZ = SKEL_TARGET_H / 66; // 同步放大阴影/光晕，避免角色变大后脚底影子显小

    // 接地阴影：让角色「踩」在地面上（画在最底层，受击旋转/位移都不脱离脚底）
    // 待机灵气环（地面光环，idle 时呼吸脉动；位于最底层，边缘露在脚外）
    const idleRing = new Laya.Sprite();
    idleRing.name = "idleRing";
    idleRing.alpha = 0;
    this.root.addChild(idleRing);
    this.idleRing = idleRing;

    // 接地阴影：让角色「踩」在地面上（画在最底层，受击旋转/位移都不脱离脚底）
    const shadow = new Laya.Sprite();
    shadow.graphics.drawEllipse(0, 0, 12 * s * SZ, 6 * s * SZ, "rgba(0,0,0,0.34)", null, 0);
    shadow.name = "shadow";
    this.root.addChild(shadow);

    this.glow = new Laya.Sprite();
    this.glow.graphics.drawCircle(0, -30 * s * SZ, 22 * s * SZ, "rgba(232,217,160,0.30)", null, 0);
    this.glow.alpha = 0;
    this.root.addChild(this.glow);

    this.body = new Laya.Sprite();
    this.body.graphics.drawRoundRect(-11 * s, -36 * s, 22 * s, 26 * s, 7 * s, 7 * s, 7 * s, 7 * s, color, "#00000022", 1);
    this.root.addChild(this.body);

    this.head = new Laya.Sprite();
    this.head.graphics.drawCircle(0, -46 * s, 9.5 * s, "#e8c39e", "#00000022", 1);
    this.root.addChild(this.head);

    if (opts.horn) {
      this.head.graphics.drawPoly(0, 0, [-8 * s, -50 * s, -3 * s, -50 * s, -6 * s, -60 * s], color, null, 0);
      this.head.graphics.drawPoly(0, 0, [3 * s, -50 * s, 8 * s, -50 * s, 6 * s, -60 * s], color, null, 0);
    }

    this.weapon = new Laya.Sprite();
    this.weapon.graphics.drawRect(-1.5 * s, -30 * s, 3 * s, 30 * s, "#d8dee9", null, 0);
    this.weapon.pos(10 * s, -20 * s);
    this.weapon.pivot(0, 0);
    this.root.addChild(this.weapon);

    // 刀光残影：攻击劈砍时显示，随后淡出
    this.slash = new Laya.Sprite();
    this.slash.alpha = 0;
    this.slash.zOrder = 5;
    this.root.addChild(this.slash);

    if (this.img) {
      this.art = new Laya.Sprite();
      this.art.visible = false;
      this.art.zOrder = 2;
      this.root.addChild(this.art);
    }

    // 优先尝试 LayaAir 内置骨骼（.sk，由 DragonBones Pro 导出、经 LayaAir IDE 转 .sk）；
    // 运行时(laya.ani)或 .sk 文件缺失时自动回退到代码驱动的分体部件骨骼
    if (this.skelFile) this.trySkel(this.skelFile);
    else if (this.skelBase) this.loadSkelParts();
    // Flipbook（Blender 烘焙序列帧）：最高优先级，一旦就绪即接管渲染
    if (opts.sheet) { this.sheetDef = opts.sheet; this.loadSheet(opts.sheet); }
  }

  private loadSkelParts(): void {
    const L: any = (globalThis as any).Laya;
    const loader: any = L?.loader;
    if (!loader || typeof loader.load !== "function") return;
    const req = SKEL_PARTS.map((f) => f.replace(".png", ""));
    const opt = SKEL_OPT_PARTS.map((f) => f.replace(".png", ""));
    const run = async (): Promise<void> => {
      // 第一阶段：原生 Image 取像素 → 抠底（部件常带白底/棋盘格）+ 内容包围盒
      const bits: Record<string, PartBitmap> = {};
      await Promise.all([...req, ...opt].map(async (n) => {
        const img = await loadNativeImg(`${this.skelBase}/parts/${n}.png`);
        if (!img) return;
        const bm = cutoutToBitmap(img);
        if (bm) bits[n] = bm;
      }));
      // 必需部件必须齐备，否则回退静态/程序化表现
      if (!req.every((n) => bits[n])) return;
      // 后臂不再派生：持剑臂镜像会把剑也镜像过去（双手各一柄剑），
      // 且 core 本身已自带双袖+手，左臂直接用 core 原生袖手，画风最统一
      const have = [...req, ...opt].filter((n) => bits[n]);
      // 第二阶段：dataURL → Laya 纹理
      try { await loader.load(have.map((n) => bits[n].url)); } catch { return; }
      const tex: Record<string, any> = {};
      for (const n of have) {
        const t = loader.getRes?.(bits[n].url);
        if (t) tex[n] = t;
      }
      if (req.every((n) => tex[n])) this.buildSkeleton(tex, bits);
    };
    run().catch(() => { /* 加载失败：保持兜底 */ });
  }

  private buildSkeleton(tex: Record<string, any>, bits: Record<string, PartBitmap>): void {
    const rig = new SkeletonRig();
    rig.seamScale = SKEL_SEAM_OVERLAP; // 部件互相压边，掩盖 AI 切图接缝
    // pivot/布局按「内容包围盒」自标定（AI 部件画布留白比例不定）：
    // 胯 = core 内容底部中心；肩 = 手臂内容顶部中心；腿顶 = 腿内容顶部中心
    const cw = (n: string): number => bits[n].right - bits[n].left;
    const ch = (n: string): number => bits[n].bottom - bits[n].top;
    const ccx = (n: string): number => (bits[n].left + bits[n].right) / 2;
    const legH = ch("legfront");
    const coreH = ch("core");
    // 版式（赵子龙五件套，导出脚本已按头身比压缩腿/裙）：core 画到胯甲下缘（腰带≈coreH*0.81）。
    // 装配 = 腰对腰：core 底部下沉 CORE_DROP=coreH*0.19，使 core 腰带正对裙顶/腿顶，
    // 胯甲压住腿根，甲裙(skirt)再盖一层 —— 行走交替摆腿时接缝不穿帮
    const CORE_DROP = coreH * 0.19; // core 相对腿顶的下沉量（≈core 腰带以下胯甲长度）
    const hipY = legH * 0.96; // 腿顶（腰）高度，脚落地
    // 除 SEAM_OVERLAP 补偿压边带来的整体放大，保证最终总高仍为 SKEL_TARGET_H
    this.skelScale = SKEL_TARGET_H / ((coreH + hipY - CORE_DROP) * SKEL_SEAM_OVERLAP);
    const def = (name: string, d: BoneDef): void => rig.addBone(d);
    // 层级：root → 披风(最底,背层) → 双腿（后腿先加）→ core（长袍罩住裙身上段）→ 双臂（core 子级）
    // 披风（可选）：挂在 root 最底层，位于双腿/core 之后、阴影之前；idle 微飘、walk 随步摆动
    if (tex.cape && bits.cape) {
      const capeH = ch("cape");
      def("cape", {
        name: "cape", x: 0, y: -hipY + CORE_DROP - coreH * 0.8,
        tex: tex.cape, pivotX: ccx("cape"), pivotY: bits.cape.top + capeH * 0.04,
      });
    }
    if (tex.legback && bits.legback) {
      def("legback", {
        // 两张都是「整双腿」图，必须几乎完全重叠（仅 2% 错位造层次）；偏移过大会呈「四条腿」
        name: "legback", x: -cw("legfront") * 0.02, y: -hipY, flipX: true,
        tex: tex.legback, pivotX: ccx("legback"), pivotY: bits.legback.top + legH * 0.04,
      });
    }
    def("legfront", {
      name: "legfront", x: cw("legfront") * 0.02, y: -hipY,
      tex: tex.legfront, pivotX: ccx("legfront"), pivotY: bits.legfront.top + legH * 0.04,
    });
    // 甲裙：顶边对齐腰线（盖住双腿上段，不露腿根），层级在腿之上、躯干之下
    if (tex.skirt && bits.skirt) {
      const skirtH = ch("skirt");
      def("skirt", {
        name: "skirt", x: 0, y: -hipY + 4,
        tex: tex.skirt, pivotX: ccx("skirt"), pivotY: bits.skirt.top + skirtH * 0.03,
      });
    }
    def("core", { name: "core", x: 0, y: -hipY + CORE_DROP, tex: tex.core, pivotX: ccx("core"), pivotY: bits.core.bottom - coreH * 0.02 });
    // 手臂+武器：armfront=右小臂(握拳,arm2)竖持矛；armback=左小臂(自然张开手,arm)。参考图：右手竖握
    // 反向行走时 root 整体镜像，左右小臂自然互换屏幕侧
    if (tex.arm && bits.arm) {
      const armH = ch("arm");
      const elbowY = -coreH * 0.42, elbowX = cw("core") * 0.33; // 肘=肩以下；core 已含上臂
      const fistName = bits.arm2 ? "arm2" : "arm";
      const fistH = ch(fistName);
      def("armfront", {
        name: "armfront", parent: "core",
        x: elbowX, y: elbowY,
        tex: tex[fistName], pivotX: ccx(fistName), pivotY: bits[fistName].top + fistH * 0.06,
      });
      def("armback", {
        name: "armback", parent: "core",
        x: -elbowX, y: elbowY, flipX: true,
        tex: tex.arm, pivotX: ccx("arm"), pivotY: bits.arm.top + armH * 0.06,
      });
      if (tex.spear && bits.spear) {
        const spH = ch("spear");
        def("spear", {
          // 竖直持握但不过高：轴心下移（图片下方 68%）+ scaleY 收敛，避免矛尖顶到头/太阳穴
          name: "spear", parent: "armfront", rot: 6, scaleY: 1.12,
          x: 0, y: fistH * 0.85,
          tex: tex.spear, pivotX: ccx("spear"), pivotY: bits.spear.top + spH * 0.68,
        });
      }
    } else if (tex.armfront && bits.armfront) {
      // 旧：臂+矛烤一起（无独立子骨骼）
      const armH = ch("armfront");
      def("armfront", {
        name: "armfront", parent: "core",
        x: cw("core") * 0.25, y: -coreH * 0.62,
        tex: tex.armfront, pivotX: ccx("armfront"), pivotY: bits.armfront.top + armH * 0.06,
      });
    }

    // —— 关键帧 Clip（rot 度，x/y 父坐标系像素）——
    // armfront：0 = 垂臂持剑（剑尖向下至小腿），负 = 抬臂举剑，正 = 向外下劈。
    // 无手臂部件时这些轨道自动忽略
    rig.addClip("idle", {
      duration: 2.6, loop: true,
      tracks: {
        // 呼吸：低幅收敛（胸腔微涨 1.008、起伏 1.4px、重心几乎不动）——静息感而非晃动感
        core: [
          { t: 0, rot: 0, y: 0, sy: 1, x: 0 },
          { t: 1.3, rot: 1, y: -1.4, sy: 1.008, x: 0.25 },
          { t: 2.6, rot: 0, y: 0, sy: 1, x: 0 },
        ],
        legfront: [{ t: 0, rot: 6 }], // 静止站立：双腿微张留小缝，避免重叠成一条腿
        legback: [{ t: 0, rot: -6 }],
        skirt: [{ t: 0, rot: 0 }, { t: 1.3, rot: 1.2 }, { t: 2.6, rot: 0 }],
        armfront: [{ t: 0, rot: 2 }, { t: 1.3, rot: 4.5 }, { t: 2.6, rot: 2 }],
        armback: [{ t: 0, rot: -2 }, { t: 1.3, rot: -4.5 }, { t: 2.6, rot: -2 }],
        cape: [{ t: 0, rot: 0 }, { t: 1.3, rot: 2.5 }, { t: 2.6, rot: 0 }], // 披风微飘
      },
    });
    // 真正步态：双腿反相摆动，每半步一次重心起伏 + 上身随步微摆（一步 0.31s，整周期 0.62s）
    rig.addClip("walk", {
      duration: 0.62, loop: true,
      tracks: {
        core: [
          { t: 0, y: 0, rot: 0, x: 0 },
          { t: 0.155, y: -4, rot: 2, x: 1.2 }, { t: 0.31, y: 0, rot: 0, x: 0 },
          { t: 0.465, y: -4, rot: -2, x: -1.2 }, { t: 0.62, y: 0, rot: 0, x: 0 },
        ],
        // 长袍角色：小幅层叠摆（裙裾如布料飘动），大幅摆会呈「四足」观感
        legfront: [{ t: 0, rot: -8 }, { t: 0.31, rot: 9 }, { t: 0.62, rot: -8 }],
        legback: [{ t: 0, rot: 8 }, { t: 0.31, rot: -9 }, { t: 0.62, rot: 8 }],
        skirt: [{ t: 0, rot: 6 }, { t: 0.31, rot: -6 }, { t: 0.62, rot: 6 }], // 与前腿反相：裙摆滞后飘
        armfront: [{ t: 0, rot: 6 }, { t: 0.31, rot: -7 }, { t: 0.62, rot: 6 }],
        armback: [{ t: 0, rot: -6 }, { t: 0.31, rot: 7 }, { t: 0.62, rot: -6 }],
        cape: [{ t: 0, rot: 5 }, { t: 0.31, rot: -5 }, { t: 0.62, rot: 5 }], // 披风随步摆动
      },
    });
    // 普攻：蓄力(慢抬,ease in) → 下劈(快落,ease out) → 收势(ease out)
    rig.addClip("attack", {
      duration: 0.34,
      tracks: {
        core: [{ t: 0, rot: 0, x: 0 }, { t: 0.13, rot: -6, x: -4, ease: "out" }, { t: 0.2, rot: 11, x: 7, ease: "expoOut" }, { t: 0.34, rot: 3, x: 2, ease: "backOut" }],
        legfront: [{ t: 0, rot: 0 }, { t: 0.13, rot: -4 }, { t: 0.2, rot: -9 }, { t: 0.34, rot: -2 }],
        legback: [{ t: 0, rot: 0 }, { t: 0.13, rot: 5 }, { t: 0.2, rot: 10 }, { t: 0.34, rot: 3 }],
        armfront: [{ t: 0, rot: -18 }, { t: 0.13, rot: 95, ease: "in" }, { t: 0.2, rot: 150, ease: "expoOut" }, { t: 0.34, rot: -12, ease: "backOut" }], // 持矛臂(右)：抬臂过头→下劈(expoOut 出刃)→回弹(backOut 余劲)
        armback: [{ t: 0, rot: 10 }, { t: 0.13, rot: -22 }, { t: 0.2, rot: -38 }, { t: 0.34, rot: 16 }],
      },
    });
    // 施法：循环蓄力（抬手聚气、轻微前倾、灵气汇聚），施法期间持续表演更生动
    rig.addClip("cast", {
      duration: 0.6, loop: true,
      tracks: {
        core: [{ t: 0, rot: 0, y: 0 }, { t: 0.3, rot: -4, y: -3 }, { t: 0.6, rot: 0, y: 0 }],
        legfront: [{ t: 0, rot: 3 }],
        legback: [{ t: 0, rot: -3 }],
        armfront: [{ t: 0, rot: 0 }, { t: 0.3, rot: 78 }, { t: 0.6, rot: 0 }], // 持矛臂(右)前送聚气
        armback: [{ t: 0, rot: 0 }, { t: 0.3, rot: -45 }, { t: 0.6, rot: 0 }],
      },
    });
    // 招牌技能「御剑术」：提气后仰举矛 → 前倾送矛（飞剑由 Game 投射物承担）→ 回正
    // 配时对齐御剑术 castTime=0.35s：蓄力 → 送剑 → 回正（过长会被施法结束截断）
    rig.addClip("skill", {
      duration: 0.42,
      tracks: {
        core: [
          { t: 0, rot: 0, x: 0, y: 0 },
          { t: 0.16, rot: -14, x: -3, y: -6, ease: "out" },
          { t: 0.29, rot: 16, x: 8, y: 1, ease: "expoOut" },
          { t: 0.42, rot: 0, x: 0, y: 0, ease: "backOut" },
        ],
        legfront: [{ t: 0, rot: 0 }, { t: 0.16, rot: -5 }, { t: 0.29, rot: -10 }, { t: 0.42, rot: 0 }],
        legback: [{ t: 0, rot: 0 }, { t: 0.16, rot: 5 }, { t: 0.29, rot: 10 }, { t: 0.42, rot: 0 }],
        armfront: [{ t: 0, rot: 0 }, { t: 0.16, rot: 135, ease: "in" }, { t: 0.29, rot: 80, ease: "expoOut" }, { t: 0.42, rot: 0, ease: "backOut" }], // 持矛臂(右)：举矛过头→前送(expoOut)→回正(backOut)
        armback: [{ t: 0, rot: 10 }, { t: 0.16, rot: -42 }, { t: 0.29, rot: 28 }, { t: 0.42, rot: 10 }],
      },
    });
    rig.addClip("hurt", {
      duration: 0.26,
      tracks: {
        core: [{ t: 0, rot: 0, x: 0 }, { t: 0.1, rot: 10, x: 5, ease: "out" }, { t: 0.26, rot: 0, x: 0, ease: "inout" }],
        legfront: [{ t: 0, rot: 0 }, { t: 0.1, rot: -7 }],
        legback: [{ t: 0, rot: 0 }, { t: 0.1, rot: 7 }],
        armfront: [{ t: 0, rot: 0 }, { t: 0.1, rot: 38 }, { t: 0.26, rot: 0 }],
        armback: [{ t: 0, rot: 10 }, { t: 0.1, rot: 30 }, { t: 0.26, rot: 10 }],
      },
    });
    rig.addClip("death", {
      duration: 0.7,
      tracks: {
        core: [{ t: 0, rot: 0, y: 0 }, { t: 0.7, rot: 80, y: 7 }],
        legfront: [{ t: 0, rot: 0 }, { t: 0.7, rot: 26 }],
        legback: [{ t: 0, rot: 0 }, { t: 0.7, rot: -20 }],
        armfront: [{ t: 0, rot: 0 }, { t: 0.7, rot: -65 }],
        armback: [{ t: 0, rot: 10 }, { t: 0.7, rot: -35 }],
      },
    });
    // 翻滚闪避：身体蜷缩前冲（配合 Rig.update 对骨骼根做整圈侧翻 + Player 定向位移）
    rig.addClip("dodge", {
      duration: 0.3,
      tracks: {
        core: [
          { t: 0, rot: 0, y: 0 },
          { t: 0.08, rot: -28, y: -2, ease: "in" },
          { t: 0.18, rot: -38, y: 0 },
          { t: 0.3, rot: 0, y: 0, ease: "out" },
        ],
        legfront: [{ t: 0, rot: 0 }, { t: 0.08, rot: -45 }, { t: 0.18, rot: -55 }, { t: 0.3, rot: 0 }],
        legback: [{ t: 0, rot: 0 }, { t: 0.08, rot: 45 }, { t: 0.18, rot: 55 }, { t: 0.3, rot: 0 }],
        armfront: [{ t: 0, rot: 0 }, { t: 0.1, rot: -50 }, { t: 0.2, rot: -40 }, { t: 0.3, rot: 0 }],
        armback: [{ t: 0, rot: 10 }, { t: 0.1, rot: 50 }, { t: 0.2, rot: 40 }, { t: 0.3, rot: 10 }],
      },
    });

    this.root.addChild(rig.root);
    this.skelRoot = rig.root;
    this.skelRig = rig;
    this.skelReady = true;
    this._skelDebug = { coreH, legH, armH: (bits.armfront ? ch("armfront") : (bits.arm ? ch("arm") : 0)), hipY, coreDrop: CORE_DROP, skelScale: this.skelScale, total: coreH + hipY - CORE_DROP };
    this.hideFallback();
  }

  /** LayaAir 内置骨骼（.sk）：laya.ani 的 Templet 加载并 buildArmature；
   *  runtime(laya.ani) 或 .sk 缺失/未转格式时回退到代码驱动的分体部件骨骼 */
  private trySkel(url: string): void {
    const L: any = (globalThis as any).Laya;
    if (!L || typeof L.loader?.load !== "function") { this.loadSkelParts(); return; }
    let settled = false;
    // .sk 加载静默失败（文件不存在/未转格式/laya.ani 未引入）时，3s 后回退，避免长期空白
    const fb = setTimeout(() => { if (!settled && !this.skelReady) this.loadSkelParts(); }, 3000);
    L.loader.load(url, L.Handler.create(this, (templet: any) => {
      settled = true; clearTimeout(fb);
      try {
        if (!templet || typeof templet.buildArmature !== "function") { this.loadSkelParts(); return; }
        const skeleton = templet.buildArmature(0); // 0=普通；1/2=支持换装
        const b = skeleton.getBounds();
        const rig = new DragonBoneRig(skeleton, b, SKEL_TARGET_H);
        this.root.addChild(rig.root);
    this.skelRoot = rig.root;
        this.skelRig = rig;
        this.skelReady = true;
        this.skelScale = rig.scale;
        this.hideFallback();
      } catch (e) {
        console.warn("[Rig] .sk 装配失败，回退部件骨骼", e);
        this.loadSkelParts();
      }
    }));
  }

  private hideFallback(): void {
    this.body.visible = false;
    this.head.visible = false;
    this.weapon.visible = false;
    this.glow.visible = false;
    if (this.art) this.art.visible = false;
  }

  /** Flipbook：加载 Blender 烘焙图集，预裁各帧子纹理（createFromTexture 按网格裁切，避免相邻帧溢出） */
  private loadSheet(def: FlipbookDef): void {
    const L: any = (globalThis as any).Laya;
    if (!L || typeof L.loader?.load !== "function") return;
    L.loader.load(def.sheet, L.Handler.create(this, (tex: any) => {
      if (!tex) { console.warn("[Rig] flipbook 图集缺失:", def.sheet); return; }
      const tw = tex.sourceWidth || tex.width;
      const th = tex.sourceHeight || tex.height;
      this.sheetTex = tex;
      this.sfw = def.fw ?? Math.floor(tw / def.cols);
      this.sfh = def.fh ?? Math.floor(th / def.rows);
      const make = L.Texture && L.Texture.createFromTexture ? L.Texture.createFromTexture.bind(L.Texture) : null;
      const total = def.cols * def.rows;
      this.sheetFrames = [];
      for (let i = 0; i < total; i++) {
        const col = i % def.cols, row = Math.floor(i / def.cols);
        this.sheetFrames.push(make ? make(tex, col * this.sfw, row * this.sfh, this.sfw, this.sfh) : tex);
      }
      const disp = new L.Sprite();
      disp.zOrder = 2;
      this.root.addChild(disp);
      this.sheetDisp = disp;
      this.sheetReady = true;
    }));
  }

  /** Flipbook：按当前 clip 推进帧并绘制（烘焙已含次级运动/IK，无需运行时弹簧） */
  private drawFlipbook(dt: number): void {
    const def = this.sheetDef!;
    const d = def.clips[this.clip];
    if (!d) { // 该 clip 未烘焙：隐藏序列帧，露出程序化兜底
      if (this.sheetDisp) this.sheetDisp.alpha = 0;
      this.glow.alpha = 0;
      this.updateIdleRing(this.sheetT, this.size);
      return;
    }
    const fps = d.fps ?? 12;
    const loop = d.loop ?? (this.clip === "idle" || this.clip === "walk" || this.clip === "cast");
    this.sheetT += dt;
    const frames = d.count;
    const f = Math.floor(this.sheetT * fps);
    if (loop) this.sheetFrame = f % frames;
    else { this.sheetFrame = Math.min(f, frames - 1); if (f >= frames) this.sheetFinished = true; }
    // 打击帧事件：对齐伤害/刀光（与 A1 的 HIT_AT 同一机制）
    if (d.hit !== undefined && !this.sheetFiredHit && this.sheetFrame >= d.hit) {
      this.sheetFiredHit = true;
      this.onFrameEvent?.("hit");
    }
    const idx = d.from + this.sheetFrame;
    const ax = (def.anchorX ?? 0.5) * this.sfw;
    const ay = (def.anchorY ?? 1.0) * this.sfh;
    const g = this.sheetDisp!.graphics;
    g.clear();
    const frame = this.sheetFrames[idx] ?? this.sheetTex;
    g.drawTexture(frame, -ax, -ay, this.sfw, this.sfh);
    this.sheetDisp!.alpha = 1;
    this.root.scaleX = this.facing; // 朝向镜像（与立绘/骨架一致：root 翻转、内部按面朝右烘焙）
    this.hideFallback();
    if (this.skelRoot) this.skelRoot.visible = false;
    // 灵气环 / 蓄力辉光（与骨架档一致）
    this.updateIdleRing(this.sheetT, this.size);
    this.glow.alpha = (this.clip === "cast" || this.clip === "skill") ? 0.5 + 0.32 * Math.sin(this.sheetT * 11) : 0;
    this.root.alpha = 1;
  }

  /** 立绘贴图就绪后绘入并隐藏程序化骨架（仅在无骨骼时生效） */
  private drawArtOnce(): void {
    if (!this.art || !this.img || this.artReady) return;
    const tex = artTexture(this.img);
    if (!tex) return;
    const s = this.size;
    const tw = (tex as any).sourceWidth || (tex as any).width || 512;
    const th = (tex as any).sourceHeight || (tex as any).height || 512;
    const targetH = this.imgH * s;
    const targetW = (targetH * tw) / th;
    this.art.graphics.clear();
    this.art.graphics.drawTexture(tex, -targetW / 2, -targetH, targetW, targetH);
    this.art.visible = true;
    this.body.visible = false;
    this.head.visible = false;
    this.weapon.visible = false;
    this.artReady = true;
  }

  play(clip: ClipName): void {
    if (this.clip === clip) return;
    // 立绘档：旧 clip 作为淡出源参与 crossfade（骨骼档由 SkeletonRig 内部处理）
    this.artPrev = this.clip;
    this.artPrevT = this.t;
    this.artFadeT = 0;
    this.clip = clip;
    this.t = 0;
    this.firedHit = false;
    this.sheetT = 0; this.sheetFrame = 0; this.sheetFinished = false; this.sheetFiredHit = false;
    this.skelRig?.play(clip, clip === "idle" || clip === "walk");
  }

  /** 二阶弹簧跟随：让立绘的倾斜/位移带柔性滞后（无骨骼时的廉价次级运动近似） */
  private follow(st: { a: number; v: number }, target: number, k: number, zeta: number, dt: number): number {
    const c = 2 * zeta * Math.sqrt(k);
    const acc = k * (target - st.a) - c * st.v;
    st.v += acc * dt;
    st.a += st.v * dt;
    return st.a;
  }

  get current(): ClipName {
    return this.clip;
  }

  /** 立绘档：单 clip 在时刻 t 的姿态（纯函数，便于 crossfade 混合） */
  private artPose(clip: ClipName, t: number, s: number): ArtPose {
    const p = emptyPose();
    switch (clip) {
      case "idle":
        // 静息呼吸：浮沉 + 倾斜摆 + 胸腔涨缩（放大到可察觉，仍低频不晃眼）
        p.y = Math.sin(t * 1.8) * 2.6 * s;
        p.rot = Math.sin(t * 1.8) * 1.3;
        p.sy = 1 + Math.sin(t * 1.8) * 0.012;
        break;
      case "walk": {
        // 长袍步伐：起伏 + 摇摆 + 袍摆挤压 + 重心左右转移（脚步位移感）
        const w = t * 9;
        p.y = -Math.abs(Math.sin(w)) * 6 * s;
        p.rot = Math.sin(w) * 3.2;
        p.sy = 1 - Math.abs(Math.cos(w)) * 0.02;
        p.x = Math.sin(w) * 1.5 * s; // 重心随步幅左右转移
        break;
      }
      case "attack": {
        // 预备(后仰蓄力) → 打击(前劈，expoOut 出刃) → 收势(backOut 余劲)
        const DUR = 0.3, HIT = Rig.HIT_AT.attack ?? 0.2;
        if (t < 0.13) {
          const u = applyEase(t / 0.13, "out");
          p.rot = -6 * u; p.x = -3 * s * u; p.y = -2 * s * u;
        } else if (t < HIT) {
          const u = applyEase((t - 0.13) / (HIT - 0.13), "expoOut");
          p.rot = -6 + 28 * u; p.x = (-3 + 11 * u) * s; p.y = (-2 - 1 * u) * s;
        } else {
          const u = applyEase(Math.min(1, (t - HIT) / (DUR - HIT)), "backOut");
          p.rot = 22 - 20 * u; p.x = (8 - 6 * u) * s; p.y = -3 * s * (1 - u);
        }
        // 刀光：只在打击帧之后出现并淡出（与命中时刻严格对齐）
        if (t >= HIT) {
          const u = Math.min(1, (t - HIT) / (DUR - HIT));
          p.slash = (1 - u) * 0.95;
          p.slashX = 18 * s + p.x; p.slashY = -30 * s; p.slashW = 26 * s; p.slashH = 8 * s;
          p.slashFill = "#cfeaff"; p.slashLine = "#eaf6ff"; p.slashLW = 1.5;
        }
        break;
      }
      case "cast":
        // 循环聚气：后仰呼吸 + 辉光脉动（幅度放大，施法期间持续表演）
        p.rot = -4 + Math.sin(t * 5) * 2;
        p.y = Math.sin(t * 5) * 2 * s;
        p.glow = 0.4 + Math.sin(t * 5) * 0.2;
        break;
      case "skill": {
        // 招牌技能：提气后仰 → 前送（配御剑术 castTime 0.35s）→ 回正；刀光对齐打击帧
        const DUR = 0.42, HIT = Rig.HIT_AT.skill ?? 0.29;
        if (t < 0.16) {
          const u = applyEase(t / 0.16, "out");
          p.rot = -10 * u; p.y = -5 * s * u;
          p.glow = 0.5 + Math.sin(t * 9) * 0.25;
        } else if (t < HIT) {
          const u = applyEase((t - 0.16) / (HIT - 0.16), "expoOut");
          p.rot = -10 + 24 * u; p.x = 8 * s * u; p.y = (-5 + 3 * u) * s;
          p.glow = 0.5 + Math.sin(t * 9) * 0.25;
        } else {
          const u = applyEase(Math.min(1, (t - HIT) / (DUR - HIT)), "backOut");
          p.rot = 14 - 14 * u; p.x = 8 * s * (1 - u); p.y = -2 * s * (1 - u);
          p.glow = (0.5 + Math.sin(t * 9) * 0.25) * (1 - u);
        }
        if (t >= HIT) {
          const u = Math.min(1, (t - HIT) / (DUR - HIT));
          p.slash = 1 - u;
          p.slashX = 20 * s + p.x; p.slashY = -32 * s; p.slashW = 30 * s; p.slashH = 9 * s;
          p.slashFill = "#bfe6ff"; p.slashLine = "#eaf6ff"; p.slashLW = 2;
        }
        break;
      }
      case "hurt": {
        // 后仰退避 + 单次短闪（替代高频硬切闪烁——高频闪是晃眼来源之一）
        const k = 1 - Math.min(1, t / 0.26);
        p.rot = -5 * k;
        p.x = -3.5 * s * k;
        p.alpha = t < 0.1 ? 0.55 : 1;
        break;
      }
      case "dodge": {
        // 翻滚闪避：整体 360° 侧翻 + 残影透明度（立绘模式下无接缝，整圈旋转天然成立）
        const k = Math.min(1, t / 0.3);
        p.rootRot = -k * 360;
        p.rootAlpha = 1 - k * 0.2;
        break;
      }
      case "death":
        // 前旋倒地 + 渐隐（Laya rotation 单位是度：旧值 1.35 实为"弧度误用"，几乎不倒）
        p.rootRot = Math.min(84, t * 140);
        p.rootAlpha = Math.max(0, 1 - t / 0.9);
        break;
    }
    return p;
  }

  update(dt: number): void {
    this.t += dt;
    // 帧事件：打击帧（attack/skill 的命中时刻）到点触发一次，供外部对齐伤害/音效；
    // Rig 内部的刀光已在 artPose 里与该时刻严格对齐
    const hitAt = Rig.HIT_AT[this.clip];
    if (hitAt !== undefined && !this.firedHit && this.t >= hitAt) {
      this.firedHit = true;
      this.onFrameEvent?.("hit");
    }
    const s = this.size;
    const t = this.t;
    const body = this.body;
    const weapon = this.weapon;
    const glow = this.glow;

    // —— Flipbook（Blender 烘焙序列帧）：最高优先级，一旦就绪接管渲染 ——
    if (this.sheetReady && this.sheetDisp) {
      this.drawFlipbook(dt);
      return;
    }

    // —— 骨骼模式：优先驱动，统一处理缩放/朝向/剑光/翻滚/灵气环 ——
    if (this.skelReady && this.skelRig) {
      const sc = this.skelScale * s;
      // 骨骼美术正面与兜底立绘相反 → 翻转朝向（facing=1 向右移动时镜像显示，使角色面朝行进方向）
      this.skelRig.root.scaleX = -this.facing * sc;
      this.skelRig.root.scaleY = sc;
      this.skelRig.play(this.clip, this.clip === "idle" || this.clip === "walk" || this.clip === "cast");
      this.skelRig.update(dt, 1);
      // 翻滚闪避：骨骼根整圈侧翻（配合 Player 定向位移形成翻滚冲出感）；负向抵消 scaleX 镜像，使翻滚朝位移方向
      if (this.clip === "dodge") {
        const prog = Math.min(1, t / 0.3);
        this.skelRig.root.rotation = -this.facing * prog * 360;
        this.root.alpha = 0.82; // 翻滚残影：整体略透明
      } else {
        this.skelRig.root.rotation = 0;
        this.root.alpha = 1;
      }
      // 灵气环：idle 静息呼吸环；cast/skill 蓄力时高亮脉动环
      this.updateIdleRing(t, s);
      // 蓄力光效增强：cast/skill 时更亮的灵气辉光
      glow.alpha = (this.clip === "cast" || this.clip === "skill") ? 0.5 + 0.32 * Math.sin(t * 11) : 0;
      this.root.scaleX = 1;
      return;
    }

    // 立绘贴图模式：贴图就绪后做整体律动（无骨骼变形、无接缝——整体旋转/倾斜天然成立）
    if (this.img) {
      this.drawArtOnce();
      if (this.artReady && this.art) {
        const a = this.art;
        // 姿态先由纯函数算出 → 与上一 clip 做 crossfade 混合 → 再一次性写回 Sprite
        // 注意：尾部统一 root.scaleX=facing 做整体镜像，故 art 内部位移/旋转一律按「面朝右」
        // 的固定值书写（再乘 facing 会与镜像二次翻转，导致前冲/受击方向相反）
        let pose = this.artPose(this.clip, t, s);
        if (this.artPrev && this.artFadeT < Rig.ART_FADE) {
          this.artPrevT += dt;
          this.artFadeT += dt;
          const w = smoothstep01(this.artFadeT / Rig.ART_FADE);
          pose = lerpPose(pose, this.artPose(this.artPrev, this.artPrevT, s), w);
          if (this.artFadeT >= Rig.ART_FADE) this.artPrev = undefined;
        }
        // 柔性滞后（伪次级运动）：姿态过一层弹簧 → 呼吸/行走/收势带惯性与余摆；
        // attack/skill 刚度为 0，直接跟目标，保证出刃干脆、不被拖慢
        {
          const k = Rig.LAG_K[this.clip] ?? 120;
          if (k <= 0) {
            // 直通：同时把弹簧状态同步到当前姿态，切回柔性 clip 时不会跳变
            this.lagRot.a = pose.rot; this.lagRot.v = 0;
            this.lagX.a = pose.x; this.lagX.v = 0;
            this.lagY.a = pose.y; this.lagY.v = 0;
          } else {
            if (!this.lagInit) {
              this.lagRot.a = pose.rot; this.lagX.a = pose.x; this.lagY.a = pose.y;
              this.lagInit = true;
            }
            pose.rot = this.follow(this.lagRot, pose.rot, k, 0.5, dt);
            pose.x = this.follow(this.lagX, pose.x, k, 0.5, dt);
            pose.y = this.follow(this.lagY, pose.y, k, 0.5, dt);
          }
        }
        a.x = pose.x; a.y = pose.y; a.rotation = pose.rot;
        a.scaleX = pose.sx; a.scaleY = pose.sy; a.alpha = pose.alpha;
        this.root.rotation = pose.rootRot;
        this.root.alpha = pose.rootAlpha;
        glow.alpha = pose.glow;
        // 刀光由姿态驱动：只在打击帧之后出现并淡出（与命中时刻严格对齐）
        if (pose.slash > 0) {
          this.slash.alpha = pose.slash;
          const g = this.slash.graphics;
          g.clear();
          g.drawEllipse(pose.slashX, pose.slashY, pose.slashW, pose.slashH, pose.slashFill, pose.slashLine, pose.slashLW);
        } else {
          this.slash.alpha = 0;
        }
        this.updateIdleRing(t, s);
        this.root.scaleX = this.facing;
        return;
      }
      // 贴图未就绪：先按骨架兜底绘制
    }

    switch (this.clip) {
      case "idle":
        body.y = Math.sin(t * 2) * 1.2 * s;
        weapon.rotation = -25 + Math.sin(t * 2) * 4;
        glow.alpha = 0;
        body.alpha = 1;
        break;
      case "walk":
        body.y = -Math.abs(Math.sin(t * 11)) * 3 * s;
        body.rotation = Math.sin(t * 11) * 0.06;
        weapon.rotation = -25 + Math.sin(t * 11) * 10;
        glow.alpha = 0;
        body.alpha = 1;
        this.slash.alpha = 0;
        break;
      case "attack": {
        const k = Math.min(1, t / 0.28);
        // 0~0.4 抬剑，0.4~1 劈砍
        const rot = k < 0.4 ? -70 + (k / 0.4) * 20 : -50 - ((k - 0.4) / 0.6) * 90;
        weapon.rotation = rot;
        body.x = this.facing * (k < 0.4 ? -2 : 6) * s;
        glow.alpha = 0;
        body.alpha = 1;
        // 劈砍阶段（k>0.35）显现刀光（细长椭圆弧），随朝向翻转淡出
        if (k > 0.35) {
          this.slash.alpha = (1 - k) * 0.9;
          const g = this.slash.graphics;
          g.clear();
          g.drawEllipse(this.facing * 16 * s, -26 * s, 24 * s, 7 * s, "#cfeaff", "#eaf6ff", 1);
        } else {
          this.slash.alpha = 0;
        }
        break;
      }
      case "cast":
        body.y = Math.sin(t * 8) * 1.5 * s;
        weapon.rotation = -60 + Math.sin(t * 8) * 15;
        glow.alpha = 0.4 + Math.sin(t * 10) * 0.25;
        body.alpha = 1;
        this.slash.alpha = 0;
        break;
      case "skill": {
        const k = Math.min(1, t / 0.4);
        body.y = -Math.sin(k * Math.PI) * 6 * s;
        weapon.rotation = -70 - Math.sin(k * Math.PI) * 60;
        glow.alpha = 0.5 + Math.sin(t * 12) * 0.3;
        body.alpha = 1;
        this.slash.alpha = 0;
        break;
      }
      case "hurt":
        body.alpha = Math.floor(t * 20) % 2 === 0 ? 0.45 : 1;
        body.x = -this.facing * 3 * s;
        glow.alpha = 0;
        this.slash.alpha = 0;
        break;
      case "death":
        this.root.rotation = Math.min(1.35, t * 2.2);
        this.root.alpha = Math.max(0, 1 - t / 0.7);
        glow.alpha = 0;
        this.slash.alpha = 0;
        break;
    }
    this.updateIdleRing(t, s);
    this.root.scaleX = this.facing;
  }

  /** 待机/蓄力灵气环：idle 静息呼吸环、cast/skill 高亮脉动蓄力环，其余状态淡出 */
  private updateIdleRing(t: number, s: number): void {
    const ring = this.idleRing;
    if (!ring) return;
    const SZ = SKEL_TARGET_H / 66;
    let a = 0;
    if (this.clip === "idle") a = 0.28 + 0.13 * Math.sin(t * 1.5); // 低频低幅：静息呼吸感，不晃眼
    else if (this.clip === "cast" || this.clip === "skill") a = 0.42 + 0.18 * Math.sin(t * 5);
    if (a <= 0.02) { if (ring.alpha !== 0) ring.alpha = 0; return; }
    const rw = 26 * s * SZ, rh = 11 * s * SZ;
    ring.graphics.clear();
    // 淡金灵气环：原青蓝偏"科幻"，与国风水墨调性冲突；金色也更贴合本作"护体金光"母题
    ring.graphics.drawEllipse(0, 0, rw, rh, "rgba(232,217,160,0.08)", "#e8d9a0", 1);
    ring.alpha = a;
  }

  /** 受击闪白 */
  setWeaponColor(c: string): void {
    this.weapon.graphics.clear();
    const s = this.size;
    this.weapon.graphics.drawRect(-1.5 * s, -30 * s, 3 * s, 30 * s, c, null, 0);
  }
}
