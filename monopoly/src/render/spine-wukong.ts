import { Assets } from 'pixi.js';
import { Spine } from '@pixi/spine-pixi';
import { AtlasAttachmentLoader, Physics, SkeletonJson, Vector2 } from '@esotericsoftware/spine-core';
import type { SkeletonData } from '@esotericsoftware/spine-core';
import type { PawnMood } from './PieceView';

/**
 * 孙悟空 Spine 棋子（tools/spine-build 产物 → public/spine/）：
 * - 骨架数据模块级缓存（Promise 单飞），所有棋子实例共享 SkeletonData；
 * - `loadWukongSkeleton()` 预加载完成后 main 再 render 一次即可切换 Spine 版；
 * - 数据未就绪时 `createWukongPawn()` 返回 null，pawn() 落矢量绘制兜底。
 */

/* 资源路径与动画映射（mood 三态 → idle 循环动画） */
const WUKONG_ATLAS = './spine/wukong.atlas';
const WUKONG_JSON = './spine/wukong.json';
const ANIM_BY_MOOD: Record<PawnMood, string> = {
  calm: 'idle_calm', happy: 'idle_happy', sad: 'idle_sad',
};

let dataPromise: Promise<SkeletonData> | null = null;
let dataReady: SkeletonData | null = null;

/** 加载并解析骨架（重复调用返回同一 Promise；失败后允许重试） */
export function loadWukongSkeleton(): Promise<SkeletonData> {
  if (!dataPromise) {
    dataPromise = (async () => {
      const atlas = await Assets.load({ alias: 'wukongSpineAtlas', src: WUKONG_ATLAS });
      const raw = await (await fetch(WUKONG_JSON)).text();
      const parsed = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(raw);
      dataReady = parsed;
      return parsed;
    })();
    dataPromise.catch(() => { dataPromise = null; });
  }
  return dataPromise;
}

/**
 * 新建一个 Spine 悟空棋子显示对象（本地原点 ≈ 脚底中点，y 向下为屏幕惯例）。
 * @param mood   表情三态 → idle 动画
 * @param targetH 目标像素高（棋子 designH × u）
 * @param t      动画起始播放时刻（错开多棋子同步感）
 * @returns 未就绪/构建失败返回 null（调用方落矢量兜底）
 */
export function createWukongPawn(mood: string, targetH: number, t = 0): Spine | null {
  const data = dataReady;
  if (!data) return null;
  try {
    const skel = new Spine({ skeletonData: data });
    const entry = skel.state.setAnimation(0, ANIM_BY_MOOD[mood as PawnMood] ?? 'idle_calm', true);
    entry.trackTime = t;
    /* 摆出首帧姿势后量取当前动画包围盒高 → 像素缩放（骨架本地原点≈脚底） */
    skel.skeleton.updateWorldTransform(Physics.none);
    const boundsMin = new Vector2();
    const boundsSize = new Vector2();
    skel.skeleton.getBounds(boundsMin, boundsSize);
    if (boundsSize.y > 0 && targetH > 0) skel.scale.set(targetH / boundsSize.y);
    return skel;
  } catch (e) {
    console.warn('[spine-wukong] createWukongPawn failed:', (e as Error)?.message ?? e);
    return null;
  }
}

/* 引用 Physics 避免 tree-shake 误伤 spine-core 副作用注册（与 test.html 同口径） */
void Physics;
