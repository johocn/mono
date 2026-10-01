/**
 * 角色技能唯一真源：取经四众各一项**专属能力**，与 `lines.ts` 的人设同源（原著形象为依据）。
 *
 * 设计口径（对齐并超越《大富翁 5》的角色特技）：
 *  - 四人各一技，覆盖「移动 / 置产 / 现金流 / 防守」四条正交轴，无重叠、无上位替代；
 *  - 数值全部落在本表，引擎只读表，不写死（改平衡只改这一处）；
 *  - 技能为**确定性**（无随机），不引入新的随机源，回放/断言不受影响。
 *
 * 开关：引擎侧由 `GameOptions.abilities` 控制，默认关闭（= 传统无技能基线，既有回归/单测口径不变）；
 * 正式对局由 `main.ts` 显式开启。关闭时全部倍率退回中性值（0 / 1）。
 */
import { ROLE_BY_SEAT, type RoleId } from './lines';

export type AbilityKind = 'cloud' | 'rake' | 'endure' | 'mercy';

export interface AbilityDef {
  role: RoleId;
  kind: AbilityKind;
  /** 技能名（HUD / 图鉴用） */
  name: string;
  /** 一句话效果说明（HUD 徽标悬停/展开用） */
  desc: string;
  /** 原著依据（回目 + 事实），便于逐条溯源 */
  source: string;
  /** 筋斗云：每回合前进的额外格数（0 = 无） */
  stepBonus: number;
  /** 九齿钉耙：买地折扣（1 = 原价，0.8 = 八折） */
  buyDiscount: number;
  /** 任劳任怨：经过起点的额外现金（0 = 无） */
  passStartBonus: number;
  /** 慈悲为怀：应付租金的减免比例（0 = 无，0.25 = 减两成半） */
  rentRelief: number;
}

/**
 * 四技能表。未启用的轴一律取中性值，避免调用处再做 undefined 判断。
 */
export const ABILITIES: Record<RoleId, AbilityDef> = {
  wukong: {
    role: 'wukong',
    kind: 'cloud',
    name: '筋斗云',
    desc: '每回合额外前进 1 格',
    source: '第二回：祖师传「筋斗云」，一筋斗十万八千里',
    stepBonus: 1,
    buyDiscount: 1,
    passStartBonus: 0,
    rentRelief: 0,
  },
  bajie: {
    role: 'bajie',
    kind: 'rake',
    name: '九齿钉耙',
    desc: '买地八折（钉耙在手，讨价还价）',
    source: '第十九回：云栈洞「九齿钉耙」，随身高老庄',
    stepBonus: 0,
    buyDiscount: 0.8,
    passStartBonus: 0,
    rentRelief: 0,
  },
  wujing: {
    role: 'wujing',
    kind: 'endure',
    name: '任劳任怨',
    desc: '经过起点额外领 ￥100（全程挑担有功）',
    source: '第二十二回：流沙河受戒，此后一路挑担',
    stepBonus: 0,
    buyDiscount: 1,
    passStartBonus: 100,
    rentRelief: 0,
  },
  sanzang: {
    role: 'sanzang',
    kind: 'mercy',
    name: '慈悲为怀',
    desc: '应付租金减免 25%（感化东主）',
    source: '第十三回：「路中逢庙烧香，遇佛拜佛」，一路慈悲',
    stepBonus: 0,
    buyDiscount: 1,
    passStartBonus: 0,
    rentRelief: 0.25,
  },
};

/** 席位（0..3）→ 技能（越界回绕，不炸渲染） */
export function abilityOfSeat(seat: number): AbilityDef {
  const i = Math.abs(Math.trunc(seat)) % ROLE_BY_SEAT.length;
  return ABILITIES[ROLE_BY_SEAT[i]];
}

/** 玩家 id（1..4）→ 技能 */
export function abilityOfPlayer(id: number): AbilityDef {
  return abilityOfSeat(id - 1);
}