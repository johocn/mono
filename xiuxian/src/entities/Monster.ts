/**
 * 怪物 AI：游荡 / 追击 / 攻击前摇 / Boss 周期技能。
 * 伤害不自己结算，通过 pendingHit 交给 Game 统一应用（与玩家技能同一条管道）。
 */
import { Actor, type ActorOpts } from "./Actor";
import type { MonsterDef } from "../data/monsters";
import type { ElementKind } from "../data/elements";
import { CURRENT_MAP } from "../data/map";
import { randInt } from "../core/Rng";
import type { BuffKind } from "../core/Combat";
import type { Player } from "./Player";

export class Monster extends Actor {
  readonly def: MonsterDef;
  /** 五行属性（来自 def.element，缺省无） */
  readonly element?: ElementKind;
  readonly home: { gx: number; gy: number; r: number };
  /** 死亡奖励是否已发放（Game 在首次死亡帧调用一次） */
  handled = false;
  /** 攻击前摇剩余（秒） */
  windup = 0;
  /** 前摇总时长（秒），供预警圈计算充能进度 */
  windupMax = 0.35;
  /** Boss 周期技能预警剩余（秒）：>0 时地面显示 AOE 红圈，归零才结算 */
  skillWindup = 0;
  /** 待 Game 结算的一次攻击 */
  pendingHit: { power: number; aoe: number } | null = null;
  /** 韧性（破防值）：被打空后进入破防（硬直 + 易伤），耗尽后随时间恢复 */
  poise: number;
  maxPoise: number;
  /** 破防中：无法行动、受到伤害 +50% */
  broken = false;
  brokenT = 0;
  private burnAcc = 0;
  private shockAcc = 0;
  private thinkT = 0;
  private wanderT = 0;
  private skillT: number;

  constructor(def: MonsterDef, gx: number, gy: number, seed: number, homeR = 2) {
    super({
      gx, gy,
      hp: def.hp,
      mp: 0,
      atk: def.atk,
      def: def.def,
      speed: def.speed,
      color: def.color,
      size: def.size,
      horn: !!def.boss,
      seed,
      knockResist: def.knockResist ?? 0,
    });
    this.def = def;
    this.element = def.element;
    this.home = { gx, gy, r: homeR };
    this.skillT = def.skill ? def.skill.every * 0.6 : Infinity;
    this.maxPoise = def.poise ?? (def.boss ? 500 : Math.max(40, Math.round(def.hp * 0.5)));
    this.poise = this.maxPoise;
  }

  get isBoss(): boolean {
    return !!this.def.boss;
  }

  /** 削减韧性；返回是否「这一击刚刚破防」 */
  damagePoise(n: number): boolean {
    if (this.broken) return false;
    this.poise -= n;
    if (this.poise <= 0) {
      this.poise = 0;
      this.broken = true;
      this.brokenT = 3.0;
      return true;
    }
    return false;
  }

  /** 是否处于某元素/控制状态（burn/shock/stun…） */
  hasStatus(kind: BuffKind): boolean {
    return this.buffs.some((b) => b.kind === kind && b.t > 0);
  }

  /** 元素 DoT 结算（灼烧/感电），每 0.5s 跳一次伤害 */
  private tickElemental(dt: number): void {
    if (!this.alive) return;
    const burn = this.buffs.find((b) => b.kind === "burn" && b.t > 0);
    const shock = this.buffs.find((b) => b.kind === "shock" && b.t > 0);
    if (burn) {
      this.burnAcc += dt;
      if (this.burnAcc >= 0.5) {
        this.takeDamage(Math.round(burn.value * this.burnAcc));
        this.burnAcc = 0;
      }
    } else this.burnAcc = 0;
    if (shock) {
      this.shockAcc += dt;
      if (this.shockAcc >= 0.5) {
        this.takeDamage(Math.round(shock.value * this.shockAcc));
        this.shockAcc = 0;
      }
    } else this.shockAcc = 0;
  }

  get expValue(): number {
    return this.def.exp;
  }

  /** 掉落掷算（由 Game 在死亡时调用） */
  rollDrops(): { id: string; count: number }[] {
    const out: { id: string; count: number }[] = [];
    for (const l of this.def.loot) {
      if (this.rng() < l.chance) out.push({ id: l.id, count: l.count });
    }
    return out;
  }

  /** 灵石掉落掷算（由 Game 在死亡时调用） */
  rollStones(): number {
    const s = this.def.stones;
    if (!s || s.max <= 0) return 0;
    return randInt(this.rng, s.min, s.max);
  }

  update(dt: number, player: Player): void {
    super.update(dt);
    this.tickElemental(dt);
    if (!this.alive || this.stunned) return;
    // 破防硬直：停止行动、原地僵直，brokenT 耗尽后恢复韧性
    if (this.broken) {
      this.brokenT -= dt;
      if (this.brokenT <= 0) {
        this.broken = false;
        this.poise = this.maxPoise;
      } else {
        this.setState("hurt");
        this.stop();
        return;
      }
    }

    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    this.thinkT += dt;
    this.wanderT -= dt;
    if (this.def.skill) this.skillT -= dt;

    // —— Boss 周期技能（咆哮 AOE）：先预警(skillWindup)再结算，给玩家翻滚窗口 ——
    if (this.def.skill) {
      if (this.skillWindup > 0) {
        this.skillWindup -= dt;
        this.setState("cast");
        if (this.skillWindup <= 0) {
          this.pendingHit = { power: this.def.skill.power, aoe: this.def.skill.aoe };
          this.skillT = this.def.skill.every;
        }
        return;
      }
      if (this.skillT <= 0 && dist <= this.def.skill.range) {
        this.skillWindup = this.def.skill.telegraph ?? 0.9;
        this.setState("cast");
        return;
      }
    }

    // —— 攻击前摇 → 产出 pendingHit ——
    if (dist <= this.def.attackRange) {
      this.stop();
      this.faceTo(player.gx);
      if (this.windup <= 0 && this.attackCdT <= 0) {
        this.windup = this.def.attackWindup ?? 0.35;
        this.windupMax = this.windup;
      }
      if (this.windup > 0) {
        this.windup -= dt;
        this.setState("attack");
        if (this.windup <= 0) {
          this.pendingHit = { power: 1, aoe: 0 };
          this.attackCdT = this.def.attackCd;
        }
      }
      return;
    }

    // —— 追击 / 脱战回巡 ——
    if (dist <= this.def.aggroRange) {
      if (this.thinkT >= 0.25 || this.path.length === 0) {
        this.thinkT = 0;
        this.computePath(CURRENT_MAP, Math.floor(player.gx), Math.floor(player.gy));
      }
      this.faceTo(player.gx);
      return;
    }
    // 超出仇恨范围：若离巢太远直接传送回巢（简化）
    const homeDist = Math.hypot(this.gx - this.home.gx, this.gy - this.home.gy);
    if (homeDist > this.home.r + 4) {
      this.gx = this.home.gx + 0.5;
      this.gy = this.home.gy + 0.5;
      this.stop();
      return;
    }
    // 原地游荡
    if (this.wanderT <= 0 && this.path.length === 0) {
      this.wanderT = 2 + this.rng() * 3;
      const tx = Math.floor(this.home.gx + (this.rng() * 2 - 1) * this.home.r);
      const ty = Math.floor(this.home.gy + (this.rng() * 2 - 1) * this.home.r);
      this.computePath(CURRENT_MAP, tx, ty);
    }
  }
}
