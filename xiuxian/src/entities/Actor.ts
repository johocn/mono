/**
 * 角色基类：属性 / 移动（A* 路径）/ buff / 受击 / 死亡 / 动画状态。
 * 具体行为（玩家技能、怪物 AI）由子类与 Game 编排。
 */
import { gridToScreen, TILE_W, TILE_H, findPath } from "../core/IsoMap";
import { ELEM_CRYSTAL_COLOR, MULTI_CRYSTAL_COLOR } from "../data/elements";
import { isWalkable } from "../data/map";
import type { MapDef } from "../data/map";
import type { Player } from "./Player";
import { Rig, type ClipName, type FlipbookDef } from "../core/Rig";
import { makeRng, type Rng } from "../core/Rng";
import {
  addBuff, consumeShield, defBonus, hasteMul, hotValue, isStunned,
  shieldValue, tickBuffs, atkBonus, slowMul, type Buff, type BuffKind,
} from "../core/Combat";

export interface ActorOpts {
  gx: number;
  gy: number;
  hp: number;
  mp: number;
  atk: number;
  def: number;
  /** 移动速度（格/秒） */
  speed: number;
  color: string;
  size?: number;
  horn?: boolean;
  /** 透明底立绘贴图（替换程序化骨架；未就绪时回退骨架） */
  img?: string;
  /** 立绘目标高度（世界像素 × size）：默认 52（NPC chibi），玩家级全身立绘传 95 */
  imgH?: number;
  /** 代码驱动骨骼基路径（分体部件齐备则启用 2D 骨骼动画；见 core/Skeleton） */
  skel?: string;
  /** LayaAir 内置骨骼路径（指向 <name>.sk；laya.ani 运行时/文件缺失则回退 skel） */
  skelFile?: string;
  /** Flipbook（Blender 3D→2D 序列帧）图集定义；提供后由 Rig 最高优先级接管渲染 */
  sheet?: FlipbookDef;
  seed?: number;
  critRate?: number;
  critMul?: number;
  /** 抗击退系数 0~1（1 = 免疫击退） */
  knockResist?: number;
}

export type ActorState = "idle" | "walk" | "attack" | "cast" | "skill" | "hurt" | "death" | "dodge";

export class Actor {
  readonly rig: Rig;
  gx: number;
  gy: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  baseAtk: number;
  baseDef: number;
  baseSpeed: number;
  critRate: number;
  critMul: number;
  alive = true;
  readonly buffs: Buff[] = [];
  rng: Rng;

  /** A* 路径剩余路点 */
  path: { gx: number; gy: number }[] = [];
  moveTarget: { gx: number; gy: number } | null = null;
  facing = 1;
  state: ActorState = "idle";
  stateT = 0;
  attackCdT = 0;
  /** 受击无敌帧（秒） */
  invincible = 0;
  deadT = 0;
  /** 击退速度（格/秒），摩擦衰减；由 Game 命中链路调用 applyKnockback 施加 */
  kbx = 0;
  kby = 0;
  /** 抗击退系数 0~1（1 = 免疫击退），由子类从 def 传入 */
  knockResist = 0;
  /** 命中闪白：剩余时间（秒），由 takeDamage 触发、update 衰减 */
  hitFlash = 0;
  /** 命中闪白叠加层（rig 子节点，白色身体轮廓） */
  flash: any;
  /** 元素光环叠加层（依主要元素附着显示对应颜色，无附着则隐藏） */
  aura: any;
  private auraColor: string | null = null;
  private auraT = 0;
  private auraSz = 1;
  /** 摇杆直控移动标记：本帧由 nudge 驱动，update 据此保持 walk 动画 */
  directMoving = false;

  constructor(opts: ActorOpts) {
    this.gx = opts.gx;
    this.gy = opts.gy;
    this.maxHp = opts.hp;
    this.hp = opts.hp;
    this.maxMp = opts.mp;
    this.mp = opts.mp;
    this.baseAtk = opts.atk;
    this.baseDef = opts.def;
    this.baseSpeed = opts.speed;
    this.critRate = opts.critRate ?? 0.05;
    this.critMul = opts.critMul ?? 1.5;
    this.knockResist = opts.knockResist ?? 0;
    this.rng = makeRng(opts.seed ?? 1234);
    this.rig = new Rig(opts.color, opts.size ?? 1, { horn: opts.horn, img: opts.img, imgH: opts.imgH, skel: opts.skel, skelFile: opts.skelFile, sheet: opts.sheet });
    // 命中闪白叠加层（程序化白色轮廓，受击时淡入再衰减）
    const sz = opts.size ?? 1;
    this.flash = new Laya.Sprite();
    this.flash.graphics.drawEllipse(0, -28 * sz, 15 * sz, 24 * sz, "#ffffff", null, 0);
    this.flash.alpha = 0;
    this.rig.root.addChild(this.flash);
    // 元素光环：叠加在身体上的加色辉光，颜色随主要元素附着变化
    this.auraSz = sz;
    this.aura = new Laya.Sprite();
    this.aura.alpha = 0;
    try { this.aura.blendMode = "add"; } catch { /* 不支持加色混合则忽略 */ }
    this.rig.root.addChild(this.aura);
    this.syncSprite();
  }

  // —— 有效属性（境界/装备/buff 叠加后）——
  get effAtk(): number {
    return this.baseAtk + atkBonus(this.buffs);
  }
  get effDef(): number {
    return this.baseDef + defBonus(this.buffs);
  }
  get effSpeed(): number {
    return this.baseSpeed * hasteMul(this.buffs) * slowMul(this.buffs);
  }

  /** 世界像素坐标（角色脚下 = 瓦片菱形中心，等距投影锚点） */
  get px(): number {
    return gridToScreen(this.gx, this.gy).x;
  }
  get py(): number {
    return gridToScreen(this.gx, this.gy).y;
  }

  /** 头顶位置（血条/飘字锚点） */
  get headY(): number {
    return this.py - 58 * (this.rig.root.scaleY || 1);
  }

  protected syncSprite(): void {
    this.rig.root.pos(this.px, this.py);
  }

  setState(s: ActorState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
  }

  /** 寻路到目标格（地图阻挡由 IsoMap 查询） */
  computePath(map: MapDef, tx: number, ty: number): boolean {
    const path = findPath(map, this.gx, this.gy, tx, ty);
    if (path && path.length > 0) {
      this.path = path;
      this.moveTarget = { gx: tx, gy: ty };
      return true;
    }
    this.path = [];
    this.moveTarget = null;
    return false;
  }

  stop(): void {
    this.path = [];
    this.moveTarget = null;
  }

  faceTo(x: number): void {
    this.facing = x >= this.gx ? 1 : -1;
  }

  /** 虚拟摇杆直控：按方向向量连续位移（墙体分轴 clamp，不依赖寻路） */
  nudge(dx: number, dy: number, dt: number): void {
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    const step = this.effSpeed * dt;
    const nx = this.gx + (dx / len) * step;
    const ny = this.gy + (dy / len) * step;
    if (isWalkable(nx, ny)) { this.gx = nx; this.gy = ny; }
    else if (isWalkable(nx, this.gy)) { this.gx = nx; }
    else if (isWalkable(this.gx, ny)) { this.gy = ny; }
    if (Math.abs(dx) > 1e-3) this.facing = dx >= 0 ? 1 : -1;
    this.directMoving = true;
    if (this.state !== "attack" && this.state !== "cast" && this.state !== "hurt" && this.state !== "dodge" && this.state !== "skill") this.setState("walk");
  }

  /** 施加击退：沿 (dirX,dirY) 叠加瞬时速度；knockResist 减免（1=免疫）。不改 takeDamage 签名。 */
  applyKnockback(dirX: number, dirY: number, power: number): void {
    const k = power * (1 - this.knockResist);
    if (k <= 0) return;
    const len = Math.hypot(dirX, dirY) || 1;
    this.kbx += (dirX / len) * k;
    this.kby += (dirY / len) * k;
    this.setState("hurt");
  }

  /** 受到伤害：先扣盾，返回实际气血伤害与吸收量（伤害不超过剩余气血） */
  takeDamage(dmg: number): { dealt: number; absorbed: number } {
    if (!this.alive || this.invincible > 0) return { dealt: 0, absorbed: 0 };
    const { dealt: raw, absorbed } = consumeShield(this.buffs, dmg);
    const dealt = Math.min(raw, this.hp);
    if (dealt > 0) this.hitFlash = 0.12;
    this.hp -= dealt;
    this.setState("hurt");
    this.stateT = 0;
    if (this.hp <= 0) this.die();
    return { dealt, absorbed };
  }

  heal(n: number): number {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    return this.hp - before;
  }

  /** 阵亡后复活（回村休整）：恢复气血并清空死亡态 */
  revive(hp: number): void {
    this.alive = true;
    this.deadT = 0;
    this.hp = Math.max(1, Math.min(this.maxHp, hp));
    this.buffs.length = 0;
    this.setState("idle");
    this.rig.root.rotation = 0;
    this.rig.root.alpha = 1;
    this.rig.play("idle");
  }

  useMp(n: number): boolean {
    if (this.mp < n) return false;
    this.mp -= n;
    return true;
  }

  addBuff(buff: Buff): void {
    addBuff(this.buffs, buff);
  }

  /** 按类型移除全部该种类 buff（用于秘境楼层/退出时清理本层增益或诅咒） */
  removeBuffKind(kind: BuffKind): void {
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      if (this.buffs[i].kind === kind) this.buffs.splice(i, 1);
    }
  }

  get shielded(): boolean {
    return shieldValue(this.buffs) > 0;
  }

  get stunned(): boolean {
    return isStunned(this.buffs);
  }

  /** 是否持有某 buff（剩余时间 > 0） */
  private hasBuff(kind: BuffKind): boolean {
    return this.buffs.some((b) => b.kind === kind && b.t > 0);
  }

  /** 元素光环颜色：结晶护盾元素优先（配色），否则按主要元素附着返回色值（无则 null） */
  elementAuraColor(): string | null {
    const sh = this.buffs.find((b) => b.kind === "shield" && b.elems && b.elems.length);
    if (sh && sh.elems && sh.elems.length) {
      return sh.elems.length === 1 ? ELEM_CRYSTAL_COLOR[sh.elems[0]] : MULTI_CRYSTAL_COLOR;
    }
    if (this.hasBuff("frozen")) return "#9fe8ff";
    if (this.hasBuff("burn")) return "#ff6a3c";
    if (this.hasBuff("shock")) return "#ffe14a";
    if (this.hasBuff("wet")) return "#3aa0ff";
    if (this.hasBuff("chill")) return "#9fe8ff";
    return null;
  }

  /** 元素光环刷新：仅在颜色变化时重绘，平时做轻微脉动 */
  private refreshAura(dt: number): void {
    const c = this.elementAuraColor();
    if (c !== this.auraColor) {
      this.auraColor = c;
      this.aura.graphics.clear();
      if (c) {
        const s = this.auraSz;
        this.aura.graphics.drawEllipse(0, -28 * s, 18 * s, 27 * s, c, null, 0);
      }
    }
    if (c) {
      this.auraT += dt;
      this.aura.alpha = 0.22 + 0.12 * Math.sin(this.auraT * 6);
    } else {
      this.aura.alpha = 0;
    }
  }

  protected die(): void {
    this.alive = false;
    this.deadT = 0;
    this.setState("death");
    this.stop();
  }

  update(dt: number, player?: Player): void {
    this.stateT += dt;
    this.attackCdT = Math.max(0, this.attackCdT - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    // 命中闪白衰减（受击瞬间最亮，快速消退）
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.flash.alpha = (this.hitFlash / 0.12) * 0.55;
    } else if (this.flash.alpha !== 0) {
      this.flash.alpha = 0;
    }
    this.refreshAura(dt);
    tickBuffs(this.buffs, dt);
    const hot = hotValue(this.buffs);
    if (hot > 0 && this.alive) this.heal(hot * dt);
    // 灵力缓慢自回复（每秒 1）
    if (this.alive) this.mp = Math.min(this.maxMp, this.mp + dt);

    if (!this.alive) {
      this.deadT += dt;
      this.rig.play("death");
      this.rig.update(dt);
      return;
    }
    if (this.stunned) {
      this.stop();
      this.rig.play("idle");
      this.rig.update(dt);
      return;
    }

    // 沿路径移动
    let moving = false;
    if (this.path.length > 0) {
      const wp = this.path[0];
      const dx = wp.gx + 0.5 - this.gx;
      const dy = wp.gy + 0.5 - this.gy;
      const dist = Math.hypot(dx, dy);
      const step = this.effSpeed * dt;
      if (dist <= step) {
        this.gx = wp.gx + 0.5;
        this.gy = wp.gy + 0.5;
        this.path.shift();
      } else {
        this.gx += (dx / dist) * step;
        this.gy += (dy / dist) * step;
      }
      moving = true;
      if (Math.abs(dx) > 0.01) this.facing = dx >= 0 ? 1 : -1;
    } else if (this.moveTarget) {
      const d = Math.hypot(this.moveTarget.gx + 0.5 - this.gx, this.moveTarget.gy + 0.5 - this.gy);
      if (d < 0.05) this.moveTarget = null;
    }
    if (this.directMoving) {
      moving = true;
      this.directMoving = false;
    }

    // 攻击/施法/招牌技能/翻滚状态由子类驱动；这里只决定 idle/walk
    if (this.state !== "attack" && this.state !== "cast" && this.state !== "skill" && this.state !== "hurt" && this.state !== "dodge") {
      this.setState(moving ? "walk" : "idle");
    } else if ((this.state === "hurt" || this.state === "dodge") && this.stateT > 0.25) {
      this.setState(moving ? "walk" : "idle");
    }

    this.rig.play(this.state as ClipName);
    this.rig.facing = this.facing;
    this.rig.update(dt);

    // 击退位移（独立于路径移动；撞墙则停，速度指数衰减）
    if (this.kbx !== 0 || this.kby !== 0) {
      const nx = this.gx + this.kbx * dt;
      const ny = this.gy + this.kby * dt;
      if (isWalkable(nx, ny)) {
        this.gx = nx;
        this.gy = ny;
      } else {
        this.kbx = 0;
        this.kby = 0;
      }
      const decay = Math.exp(-9 * dt);
      this.kbx *= decay;
      this.kby *= decay;
      if (Math.abs(this.kbx) < 1e-3) this.kbx = 0;
      if (Math.abs(this.kby) < 1e-3) this.kby = 0;
    }

    this.syncSprite();
  }
}
