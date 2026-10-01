import { Container, Graphics } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { compareDepth, ipos } from './iso';
import { assetUrl, getTexture } from './assets';
import { instantiate, type ElementSpec, type InstantiateDeps, type Instance } from '../skin/instantiate';
import { providerFor } from './providers';
import { makeSprite, makeText } from './paint';
import type { ProcCtx, SpriteRequest, TextRequest } from './providers/proc';
import { STAGE_W, STAGE_H } from '../skin/layout';

/** 玩家数（与 PieceView.PAWN_COUNT 同源；Scene 侧只为折 tokens，不引视图模块） */
const ownerTokenCount = 4;

export type Pass = 1 | 2 | 3 | 4;

export interface DrawPlanItem { index: number; id: string; c: number; r: number; depth: number; pass: Pass }

/** 三遍绘制归属（唯一真源；任何元素不得绕过） */
export function passOf(id: string): Pass {
  if (id.startsWith('label.')) return 2;
  if (id.startsWith('piece.')) return 3;
  return 1;
}

export function planDrawOrder(items: DrawPlanItem[]): DrawPlanItem[] {
  return [...items].sort((a, b) => a.pass - b.pass || compareDepth(a, b));
}

export interface SceneDeps {
  layers: { ground: Container; labels: Container; pieces: Container; fxWorld: Container; fxUi: Container };
  instantiateDeps: InstantiateDeps;
  geo: { hw: number; hh: number; ox: number; oy: number };
  bg: { color: string; alpha: number };
  placement: PlacementOpts;
  /** 皮肤包内素材相对路径的基址（如 './skins'） */
  assetBase?: string;
  /** 素材查找顺序的皮肤包 id：当前皮肤优先，其次默认皮肤 */
  skinIds?: string[];
  onPick?: (inst: Instance) => void;
}

export interface PlacementInput {
  id: string;
  c: number;
  r: number;
  slot: number | null;
  lift: number;
  box: { w: number; d: number; h: number };
  pawnIndex?: number;
  /** 来自 Instance.mount：贴墙/贴屋顶的挂件必须跟随宿主楼的缩放与抬升 */
  mount?: 'ground' | 'wall' | 'roof';
  /** 来自注册表的定格缩放（缺省 1）：非建筑网格元素的基准 s（如内环装饰楼 0.5） */
  scale?: number;
}
export interface PlacementOpts {
  pawnGap: number;
  pawnFrontDy: number;
  /** 棋子整体缩放（v5 样张 line 319：`isoPawn(..., 0.62, ...)`） */
  pawnScale?: number;
  buildingScale?: number;
  buildingYOffset?: number;
}
export interface Placement { cx: number; cy: number; s: number }

/** 唯一地点：给任一实例算屏幕坐标与缩放（各视图不得自己算） */
export function resolvePlacement(
  it: PlacementInput,
  geo: { hw: number; hh: number; ox: number; oy: number },
  opts: PlacementOpts,
): Placement {
  const [x, y] = ipos(it.c, it.r, geo);
  if (it.id.startsWith('piece.')) {
    const i = it.pawnIndex ?? 0;
    const cx = x + (i - (4 - 1) / 2) * opts.pawnGap;
    return { cx, cy: y + geo.hh * opts.pawnFrontDy, s: opts.pawnScale ?? 1 };
  }
  if (it.id.startsWith('building.')) {
    const s = opts.buildingScale ?? 1;
    /* 贴墙子件（building.<slot>.sign）：lift 也随宿主楼一起缩放，
       preset 再用 y0 = cy + lift×s 还原宿主基座；楼体本体 mount=ground、lift=0 不受影响 */
    const lifted = it.mount && it.mount !== 'ground' ? it.lift * s : 0;
    return { cx: x, cy: y - (opts.buildingYOffset ?? 0) - lifted, s };
  }
  if (it.id.startsWith('prop.') && it.mount && it.mount !== 'ground') {
    /* 贴墙/贴屋顶挂件：几何、lift 与宿主楼的 y 偏移都随楼一起缩放，否则会飘在楼外 */
    const s = opts.buildingScale ?? 1;
    return { cx: x, cy: y - (opts.buildingYOffset ?? 0) - it.lift * s, s };
  }
  return { cx: x, cy: y - it.lift, s: it.scale ?? 1 };
}

export class Scene {
  private items: ElementSpec[] = [];
  private instances: Instance[] = [];
  private counts: Record<Pass, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  constructor(private deps: SceneDeps) {}

  add(spec: ElementSpec): void {
    this.items.push(spec);
  }

  addMany(specs: ElementSpec[]): void {
    for (const s of specs) this.items.push(s);
  }

  instancesOf(): Instance[] {
    return this.instances;
  }

  /** 清空全部 spec（回合推进后按新状态重建用；`render()` 每次都会清层，故只需清 items） */
  reset(): void {
    this.items.length = 0;
    this.counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  }

  /** 本帧各绘制遍的元素数（spec §11.5「单帧绘制调用 < 200」的可测口径；纯读，不改绘制状态） */
  stats(): { perPass: Record<Pass, number>; total: number } {
    const { counts } = this;
    return {
      perPass: { 1: counts[1], 2: counts[2], 3: counts[3], 4: counts[4] },
      total: counts[1] + counts[2] + counts[3] + counts[4],
    };
  }

  /** 单元素出图（唯一绘制逻辑）：给一个 spec → 一个 Container（含图形/文字/精灵）。
      动效层（fx.ts）经此产出实例，不直接绘图（spec §3.7.1）。 */
  buildOne(spec: ElementSpec): Container {
    const inst = instantiate(spec, this.deps.instantiateDeps);
    const out = new Container();
    this.paintItem(inst, spec, out);
    return out;
  }

  /** 全量重建：清层 → 四遍绘制（唯一入画口） */
  render(): void {
    const { layers, instantiateDeps, bg } = this.deps;
    layers.ground.removeChildren();
    layers.labels.removeChildren();
    layers.pieces.removeChildren();
    layers.fxWorld.removeChildren();
    layers.fxUi.removeChildren();

    const back = new Graphics();
    back.rect(0, 0, layers.ground.width || STAGE_W, layers.ground.height || STAGE_H).fill({ color: bg.color, alpha: bg.alpha });
    layers.ground.addChild(back);

    this.instances = this.items.map((s) => instantiate(s, instantiateDeps));
    /* 同 ID 多实例（如 17 块 board.tile.shop）必须各自归位：计划项携带实例下标，不能仅靠 id 查表 */
    const plan = planDrawOrder(
      this.instances.map((inst, index) => ({
        index,
        id: inst.id,
        c: inst.c,
        r: inst.r,
        depth: inst.depth,
        pass: this.items[index].pass ?? passOf(inst.id),
      })),
    );

    this.counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const p of plan) {
      const spec = this.items[p.index];
      const inst = this.instances[p.index];
      if (!spec || !inst) continue;
      this.counts[p.pass] += 1;
      /* pass 4 = 屏幕空间（HUD / 浮层 / 气泡）：进 `fxUi`（不跟相机），与世界层解耦 */
      const target = p.pass === 2 ? layers.labels : p.pass === 3 ? layers.pieces : p.pass === 4 ? layers.fxUi : layers.ground;
      const box = new Container();
      this.paintItem(inst, spec, box);
      target.addChild(box);
    }
  }

  /** 把一个实例画进 out（图形 + 文字 + 精灵），唯一绘制实现 */
  private paintItem(inst: Instance, spec: ElementSpec, out: Container): void {
    const g = new Graphics();
    const texts: TextRequest[] = [];
    const sprites: SpriteRequest[] = [];
    const place = spec.fixed
      ? { cx: spec.fixed.cx, cy: spec.fixed.cy, s: spec.fixed.s ?? 1 }
      : resolvePlacement(
          {
            id: inst.id, c: inst.c, r: inst.r, slot: inst.slot, lift: inst.lift,
            box: inst.box, mount: inst.mount, scale: inst.scale, pawnIndex: spec.pawnIndex ?? 0,
          },
          this.deps.geo,
          this.deps.placement,
        );
    const ctx: ProcCtx = {
      geo: this.deps.geo,
      box: inst.box,
      cx: place.cx,
      cy: place.cy,
      s: place.s,
      lift: inst.lift,
      params: inst.provider.kind === 'proc'
        ? { __preset: (inst.provider as { preset: string }).preset, ...((inst.provider as { params?: Record<string, unknown> }).params ?? {}) }
        : { __preset: 'builtin' },
      state: { ...inst.state, ownerColors: this.ownerColors() },
      spec: inst.provider,
      asset: (rel) => this.assetOf(rel),
      sprite: (r) => sprites.push(r),
      text: (r) => texts.push(r),
    };
    providerFor(inst.provider).draw(g, ctx);
    out.addChild(g);
    for (const r of texts) out.addChild(makeText(r));
    for (const r of sprites) out.addChild(makeSprite(r));
  }

  /** 素材解析：按 skinIds 顺序在各包内找同名相对路径的已装载纹理（都没有 → null） */
  private assetOf(rel: string): Texture | null {
    const base = this.deps.assetBase ?? './skins';
    for (const id of this.deps.skinIds ?? []) {
      const tex = getTexture(assetUrl(id, rel, base));
      if (tex) return tex;
    }
    return null;
  }

  /** 把 skin tokens 的 `owner1..owner4` 折成 `{ 1: '#...', ... }`——tile preset 用数字归属查表 */
  private ownerColors(): Record<number, string> {
    const t = (this.deps.instantiateDeps.skin?.tokens ?? this.deps.instantiateDeps.defaultSkin?.tokens ?? {}) as Record<string, string>;
    const out: Record<number, string> = {};
    for (let i = 1; i <= ownerTokenCount; i++) {
      const color = t[`owner${i}`];
      if (color) out[i] = color;
    }
    return out;
  }
}