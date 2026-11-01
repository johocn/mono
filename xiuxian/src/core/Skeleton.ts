/**
 * 代码驱动 2D 骨骼动画（零依赖，仅用 Laya 嵌套 Sprite 实现层级 + 关键帧）。
 * 每个 Bone 是一个 Laya.Sprite：挂在父骨骼关节点上，子显示体以「关节」为锚点绘制贴图。
 * 一个 Clip 描述若干骨骼轨道的关键帧（旋转/平移/缩放），播放时按时间插值。
 *
 * 设计目标：在现有 LayaAir 运行时（无 Spine/DragonBones 库）下，给 2.5D 立绘角色
 * 提供可程序化驱动的骨骼动画，含 idle/walk/attack/cast/skill 等，便于后续美术替换。
 *
 * 观感增强（对标商业 2D 的低成本补丁）：
 *   1) 动画过渡 crossfade：切换 clip 时把上一 clip 的姿态按权重混合进来，消除硬切。
 *   2) 次级运动：裙摆/披风走弹簧跟随（滞后 + 轻微过冲），不再与躯干刚性同步。
 *   3) 姿态应用到全部骨骼：未出现在当前 clip 轨道里的骨骼回到静止值，
 *      避免「切到 attack 后披风卡在 walk 的最后一个姿势」这类残留。
 */
export type Ease =
  | "linear"
  | "in"
  | "out"
  | "inout"
  | "cubicIn"
  | "cubicOut"
  | "cubicInOut"
  | "expoOut"
  | "circOut"
  | "backOut"
  | "elasticOut"
  | "bounceOut";

export interface Keyframe {
  /** 关键帧时间（秒，0..duration） */
  t: number;
  /** 相对静止姿态的旋转增量（度） */
  rot?: number;
  /** 相对静止姿态的位移增量（父坐标系像素） */
  x?: number;
  y?: number;
  /** 缩放（默认 1） */
  sx?: number;
  sy?: number;
  /** 透明度（默认 1），用于飞剑出手淡出等 */
  alpha?: number;
  /** 本段（到下一关键帧）缓动曲线，默认 inout，让动作过渡更自然 */
  ease?: Ease;
}

export function applyEase(u: number, ease: Ease): number {
  switch (ease) {
    case "in": return u * u;
    case "out": return u * (2 - u);
    case "linear": return u;
    case "cubicIn": return u * u * u;
    case "cubicOut": return 1 - Math.pow(1 - u, 3);
    case "cubicInOut": return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    case "expoOut": return u >= 1 ? 1 : 1 - Math.pow(2, -10 * u);
    case "circOut": return Math.sqrt(Math.max(0, 1 - (u - 1) * (u - 1)));
    // 回弹过冲：用于收势/受击回正的「余劲」，幅度克制（c1=1.70158 标准 back）
    case "backOut": {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
    }
    case "elasticOut": {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * c4) + 1;
    }
    case "bounceOut": {
      const n1 = 7.5625, d1 = 2.75;
      if (u < 1 / d1) return n1 * u * u;
      if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75;
      if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375;
      return n1 * (u -= 2.625 / d1) * u + 0.984375;
    }
    case "inout":
    default: return u * u * (3 - 2 * u);
  }
}

export interface BoneDef {
  name: string;
  /** 父骨骼名；省略则挂在骨骼根 */
  parent?: string;
  /** 父坐标系下的关节偏移（即该骨骼原点相对父关节的位置） */
  x?: number;
  y?: number;
  /** 静止旋转（度） */
  rot?: number;
  /** 显示贴图（已加载的 Laya 纹理，可空） */
  tex?: any;
  /** 贴图中「关节」位置（相对贴图左上角），显示体以该点为锚点挂到骨骼原点 */
  pivotX?: number;
  pivotY?: number;
  /** 显示体水平翻转（用于左右对称部件镜像） */
  flipX?: boolean;
  /** 基础缩放（默认 1），用于单独调整某部件相对比例（如缩短过长的手臂+剑） */
  scale?: number;
  /** 独立横向/纵向缩放（默认 1）：压腿宽用 scaleX、拉长矛用 scaleY，互不影响旋转 */
  scaleX?: number;
  scaleY?: number;
}

export interface ClipDef {
  duration: number;
  loop?: boolean;
  /** 每根骨骼一条轨道；关键帧按 t 升序 */
  tracks: Record<string, Keyframe[]>;
}

interface BoneNode {
  name: string;
  node: any; // Laya.Sprite
  disp?: any; // 显示体 Sprite（挂载 tex）
  baseX: number;
  baseY: number;
  baseRot: number;
  baseScale: number;
  baseScaleX: number;
  baseScaleY: number;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** 平滑步进（crossfade 权重用，避免线性过渡的折角） */
function smoothstep(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}

/** 次级运动骨骼：裙摆/披风走弹簧跟随，产生滞后与回弹（布料感） */
const SECONDARY_BONES = new Set(["skirt", "cape"]);

/** 采样某轨道在时刻 t 的插值结果（缺失字段回退静止值 0/1） */
function sampleTrack(track: Keyframe[], t: number): Keyframe {
  if (track.length === 0) return { t: 0 };
  if (t <= track[0].t) return track[0];
  const last = track[track.length - 1];
  if (t >= last.t) return last;
  let i = 0;
  while (i < track.length - 1 && track[i + 1].t <= t) i++;
  const a = track[i], b = track[i + 1];
  const uRaw = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const u = applyEase(uRaw, b.ease ?? a.ease ?? "inout");
  const out: Keyframe = { t };
  out.rot = (a.rot ?? 0) + ((b.rot ?? a.rot ?? 0) - (a.rot ?? 0)) * u;
  out.x = (a.x ?? 0) + ((b.x ?? a.x ?? 0) - (a.x ?? 0)) * u;
  out.y = (a.y ?? 0) + ((b.y ?? a.y ?? 0) - (a.y ?? 0)) * u;
  out.sx = (a.sx ?? 1) + ((b.sx ?? a.sx ?? 1) - (a.sx ?? 1)) * u;
  out.sy = (a.sy ?? 1) + ((b.sy ?? a.sy ?? 1) - (a.sy ?? 1)) * u;
  out.alpha = (a.alpha ?? 1) + ((b.alpha ?? a.alpha ?? 1) - (a.alpha ?? 1)) * u;
  return out;
}

/** 两个关键帧按权重混合（w=1 全取 a，w=0 全取 b） */
function blendKey(a: Keyframe, b: Keyframe, w: number): Keyframe {
  return {
    t: a.t,
    rot: lerp(b.rot ?? 0, a.rot ?? 0, w),
    x: lerp(b.x ?? 0, a.x ?? 0, w),
    y: lerp(b.y ?? 0, a.y ?? 0, w),
    sx: lerp(b.sx ?? 1, a.sx ?? 1, w),
    sy: lerp(b.sy ?? 1, a.sy ?? 1, w),
    alpha: lerp(b.alpha ?? 1, a.alpha ?? 1, w),
  };
}

export class SkeletonRig {
  /** 根节点（锚点在脚底），由调用方挂到 Rig.root */
  readonly root: any = new (globalThis as any).Laya.Sprite();
  private bones = new Map<string, BoneNode>();
  private clips = new Map<string, ClipDef>();
  private current = "";
  private t = 0;
  private loop = false;
  private finished = false;
  /** crossfade：淡出源 clip 与其进度 */
  private prev = "";
  private prevT = 0;
  private prevLoop = false;
  private fadeT = 0;
  private fadeDur = 0.12;
  /** 次级运动弹簧状态（角度/角速度） */
  private springs = new Map<string, { a: number; v: number }>();
  /** 部件放大系数：>1 让相邻部件互相压边，掩盖 AI 切图的硬边接缝；1 = 精确装配 */
  seamScale = 1;

  addBone(def: BoneDef): void {
    const L: any = (globalThis as any).Laya;
    const node = new L.Sprite();
    const baseX = def.x ?? 0;
    const baseY = def.y ?? 0;
    const baseRot = def.rot ?? 0;
    const baseScale = (def.scale ?? 1) * this.seamScale;
    const baseScaleX = def.scaleX ?? 1;
    const baseScaleY = def.scaleY ?? 1;
    node.pos(baseX, baseY);
    node.rotation = baseRot;
    node.scaleX = baseScale * baseScaleX;
    node.scaleY = baseScale * baseScaleY;
    // 显示体：以贴图内关节为 pivot 挂到骨骼原点（贴图画在 0,0，pivot 即关节）
    if (def.tex) {
      const disp = new L.Sprite();
      const W = Number(def.tex.width || def.tex.sourceWidth || 0);
      const H = Number(def.tex.height || def.tex.sourceHeight || 0);
      const pw = Number(def.pivotX ?? W / 2);
      const ph = Number(def.pivotY ?? H / 2);
      disp.pivot(pw, ph);
      disp.pos(0, 0);
      if (def.flipX) disp.scaleX = -1;
      disp.graphics.drawTexture(def.tex, 0, 0, W, H);
      node.addChild(disp);
      (node as any)._disp = disp;
    }
    const parent = def.parent ? this.bones.get(def.parent)?.node : this.root;
    (parent ?? this.root).addChild(node);
    this.bones.set(def.name, { name: def.name, node, disp: (node as any)._disp, baseX, baseY, baseRot, baseScale, baseScaleX, baseScaleY });
  }

  addClip(name: string, clip: ClipDef): void {
    this.clips.set(name, clip);
  }

  hasClip(name: string): boolean {
    return this.clips.has(name);
  }

  play(name: string, loop = false): void {
    if (!this.clips.has(name)) return;
    if (this.current === name && !this.finished) return;
    // 旧 clip 作为淡出源（已结束的不再淡出，避免衰亡姿态被混进来）
    if (this.current && !this.finished) {
      this.prev = this.current;
      this.prevT = this.t;
      this.prevLoop = this.loop;
      this.fadeT = 0;
    } else {
      this.prev = "";
      this.fadeT = this.fadeDur;
    }
    this.current = name;
    this.t = 0;
    this.loop = loop || !!this.clips.get(name)!.loop;
    this.finished = false;
  }

  stop(): void {
    this.current = "";
    this.finished = true;
  }

  update(dt: number, facing = 1): void {
    if (!this.current || this.finished) return;
    const clip = this.clips.get(this.current)!;
    this.t += dt;
    let time = this.t;
    if (time >= clip.duration) {
      if (this.loop) time = time % clip.duration;
      else { time = clip.duration; this.finished = true; }
    }

    let w = 1; // 当前 clip 权重
    if (this.prev && this.fadeT < this.fadeDur) {
      this.fadeT += dt;
      this.prevT += dt;
      const pc = this.clips.get(this.prev);
      if (pc) {
        if (this.prevLoop) this.prevT = this.prevT % pc.duration;
        else this.prevT = Math.min(this.prevT, pc.duration);
      }
      w = smoothstep(this.fadeT / this.fadeDur);
      if (this.fadeT >= this.fadeDur) this.prev = "";
    }

    const pose = this.samplePose(this.current, time);
    if (this.prev && w < 1) {
      const from = this.samplePose(this.prev, this.prevT);
      for (const [name, k] of from) {
        pose.set(name, blendKey(pose.get(name) ?? { t: time }, k, w));
      }
    }
    this.applyPose(pose, dt);
    void facing;
  }

  /** 取某 clip 在时刻 t 的全部轨道采样（不含未出现骨骼 → 由 applyPose 回落静止值） */
  private samplePose(name: string, time: number): Map<string, Keyframe> {
    const out = new Map<string, Keyframe>();
    const clip = this.clips.get(name);
    if (!clip) return out;
    for (const [bone, track] of Object.entries(clip.tracks)) {
      out.set(bone, sampleTrack(track, time));
    }
    return out;
  }

  /** 应用到全部骨骼：未在当前 pose 里的骨骼回到静止值（消除切换残留） */
  private applyPose(pose: Map<string, Keyframe>, dt: number): void {
    for (const [name, bn] of this.bones) {
      const s = pose.get(name);
      let rot = s?.rot ?? 0;
      // 次级运动：裙摆/披风弹簧跟随目标角，产生滞后与回弹
      if (SECONDARY_BONES.has(name)) rot = this.spring(name, rot, dt);
      const x = s?.x ?? 0;
      const y = s?.y ?? 0;
      const sx = s?.sx ?? 1;
      const sy = s?.sy ?? 1;
      bn.node.rotation = bn.baseRot + rot;
      bn.node.x = bn.baseX + x;
      bn.node.y = bn.baseY + y;
      bn.node.scaleX = sx * bn.baseScale * bn.baseScaleX;
      bn.node.scaleY = sy * bn.baseScale * bn.baseScaleY;
      if (bn.disp && s?.alpha !== undefined) bn.disp.alpha = s.alpha;
    }
  }

  /** 二阶弹簧：临界阻尼比 ~0.55，既跟随又有轻微过冲（布料/发丝的廉价替身） */
  private spring(name: string, target: number, dt: number): number {
    let st = this.springs.get(name);
    if (!st) {
      st = { a: target, v: 0 };
      this.springs.set(name, st);
      return target;
    }
    const k = 150;
    const c = 2 * 0.55 * Math.sqrt(k);
    const acc = k * (target - st.a) - c * st.v;
    st.v += acc * dt;
    st.a += st.v * dt;
    return st.a;
  }
}
