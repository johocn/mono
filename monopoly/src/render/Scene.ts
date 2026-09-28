import { Container, Graphics } from 'pixi.js';
import { compareDepth, ipos } from './iso';
import { instantiate, type ElementSpec, type InstantiateDeps, type Instance } from '../skin/instantiate';
import { providerFor } from './providers';
import type { ProcCtx } from './providers/proc';
import { STAGE_W, STAGE_H } from '../skin/layout';

/** 玩家数（与 PieceView.PAWN_COUNT 同源；Scene 侧只为折 tokens，不引视图模块） */
const ownerTokenCount = 4;

export type Pass = 1 | 2 | 3;

export interface DrawPlanItem { id: string; c: number; r: number; depth: number; pass: Pass }

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
  layers: { ground: Container; labels: Container; pieces: Container; fx: Container };
  instantiateDeps: InstantiateDeps;
  geo: { hw: number; hh: number; ox: number; oy: number };
  bg: { color: string; alpha: number };
  onPick?: (inst: Instance) => void;
}

export class Scene {
  private items: ElementSpec[] = [];
  private instances: Instance[] = [];

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

  /** 全量重建：清层 → 三遍绘制（唯一入画口） */
  render(): void {
    const { layers, instantiateDeps, bg } = this.deps;
    layers.ground.removeChildren();
    layers.labels.removeChildren();
    layers.pieces.removeChildren();

    const back = new Graphics();
    back.rect(0, 0, layers.ground.width || STAGE_W, layers.ground.height || STAGE_H).fill({ color: bg.color, alpha: bg.alpha });
    layers.ground.addChild(back);

    this.instances = this.items.map((s) => instantiate(s, instantiateDeps));
    // 同 ID 多实例（如 17 块 board.tile.shop）必须各自归位：计划项携带实例下标，不能仅靠 id 查表
    type Planned = DrawPlanItem & { at: number };
    const plan = planDrawOrder(
      this.instances.map((inst, at) => ({ id: inst.id, c: inst.c, r: inst.r, depth: inst.depth, pass: passOf(inst.id), at })),
    ) as Planned[];

    for (const p of plan) {
      const inst = this.instances[p.at];
      if (!inst) continue;
      const g = new Graphics();
      const target = p.pass === 2 ? layers.labels : p.pass === 3 ? layers.pieces : layers.ground;
      const [cx, cy] = ipos(inst.c, inst.r, this.deps.geo);
      const ctx: ProcCtx = {
        geo: this.deps.geo,
        box: inst.box,
        cx,
        cy,
        s: 1,
        params: inst.provider.kind === 'proc'
          ? { __preset: (inst.provider as { preset: string }).preset, ...((inst.provider as { params?: Record<string, unknown> }).params ?? {}) }
          : { __preset: 'builtin' },
        state: { ...inst.state, ownerColors: this.ownerColors() },
      };
      providerFor(inst.provider).draw(g, ctx);
      target.addChild(g);
    }
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