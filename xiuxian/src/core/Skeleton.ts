/**
 * 代码驱动 2D 骨骼动画（零依赖，仅用 Laya 嵌套 Sprite 实现层级 + 关键帧）。
 * 每个 Bone 是一个 Laya.Sprite：挂在父骨骼关节点上，子显示体以「关节」为锚点绘制贴图。
 * 一个 Clip 描述若干骨骼轨道的关键帧（旋转/平移/缩放），播放时按时间插值。
 *
 * 设计目标：在现有 LayaAir 运行时（无 Spine/DragonBones 库）下，给 2.5D 立绘角色
 * 提供可程序化驱动的骨骼动画，含 idle/walk/attack/cast/skill 等，便于后续美术替换。
 */
export type Ease = "linear" | "in" | "out" | "inout";

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

function applyEase(u: number, ease: Ease): number {
  switch (ease) {
    case "in": return u * u;
    case "out": return u * (2 - u);
    case "linear": return u;
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

export class SkeletonRig {
  /** 根节点（锚点在脚底），由调用方挂到 Rig.root */
  readonly root: any = new (globalThis as any).Laya.Sprite();
  private bones = new Map<string, BoneNode>();
  private clips = new Map<string, ClipDef>();
  private current = "";
  private t = 0;
  private loop = false;
  private finished = false;

  addBone(def: BoneDef): void {
    const L: any = (globalThis as any).Laya;
    const node = new L.Sprite();
    const baseX = def.x ?? 0;
    const baseY = def.y ?? 0;
    const baseRot = def.rot ?? 0;
    const baseScale = def.scale ?? 1;
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
    // 朝向由外部（Rig）通过 root.scaleX 统一处理，这里只做关键帧插值
    void facing;
    for (const [name, track] of Object.entries(clip.tracks)) {
      const bn = this.bones.get(name);
      if (!bn) continue;
      const s = sampleTrack(track, time);
      bn.node.rotation = bn.baseRot + (s.rot ?? 0);
      bn.node.x = bn.baseX + (s.x ?? 0);
      bn.node.y = bn.baseY + (s.y ?? 0);
      bn.node.scaleX = (s.sx ?? 1) * bn.baseScale * bn.baseScaleX;
      bn.node.scaleY = (s.sy ?? 1) * bn.baseScale * bn.baseScaleY;
      if (bn.disp && s.alpha !== undefined) bn.disp.alpha = s.alpha;
    }
  }
}
