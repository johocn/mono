/**
 * Laya 骨骼适配层（DragonBones 运行时 或 LayaAir 内置 .sk 均适用）。
 *
 * Laya 的骨骼显示对象（Laya.DragonBone.Skeleton 或 laya.ani 的 Skeleton）继承自 Laya.Sprite，
 * 由引擎自身帧循环驱动动画，因此无需手动 tick。这里把它包成一个与内部代码骨骼
 * `SkeletonRig` 同接口的显示对象（root / play / update），让 Rig 无差别地驱动
 * 「代码骨骼」或「成品骨骼（.sk）」。
 *
 * 关键：Rig.update 每帧都会调用 play(this.clip, loop)，故 play 必须幂等——
 * 同一片段不重启动画，否则龙骨会每帧从头播放而“冻”在首帧。
 */
export class DragonBoneRig {
  readonly root: any = new Laya.Sprite();
  private sk: any;
  readonly scale: number;
  private lastClip = "";

  constructor(skeleton: any, bounds: any, targetH: number) {
    this.sk = skeleton;
    // 让脚底落在 root 原点 (0,0)：内容下沿 = bounds.y + bounds.height
    skeleton.x = -(bounds.x + bounds.width / 2);
    skeleton.y = -(bounds.y + bounds.height);
    this.scale = targetH / bounds.height;
    this.root.addChild(skeleton);
  }

  play(clip: string, loop: boolean): void {
    if (this.lastClip === clip) return; // 同片段不重启（Rig.update 每帧调用）
    this.lastClip = clip;
    try { this.sk.play(clip, loop); } catch { /* 龙骨缺该动画（如 dodge）时静默忽略 */ }
  }

  // 龙骨由 Laya 自身帧循环推进，无需手动 tick
  update(): void { /* no-op */ }
}
