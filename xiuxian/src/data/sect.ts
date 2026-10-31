/**
 * 宗门系统（轻量）：玄水宗声望兑换项。
 * 声望来自任务/支线，在「宗门」面板消耗声望换取装备、消耗品或传功（技能）。
 */
export interface SectExchange {
  id: string;
  name: string;
  desc: string;
  cost: number;
  reward: { t: "item"; id: string; n: number } | { t: "skill"; id: string };
}

export const SECT_NAME = "玄水宗";

export const SECT_EXCHANGES: SectExchange[] = [
  { id: "ex_bi_shui", name: "避水剑", desc: "玄水宗镇派之剑，攻击 +28。", cost: 30, reward: { t: "item", id: "bi-shui-jian", n: 1 } },
  { id: "ex_jiao_lin", name: "鲛鳞甲", desc: "鲛人鳞甲炼制，防御 +22。", cost: 40, reward: { t: "item", id: "jiao-lin-jia", n: 1 } },
  { id: "ex_jiao_zhu", name: "鲛珠 x3", desc: "换得鲛珠三枚，可作炼器好料。", cost: 20, reward: { t: "item", id: "jiao-zhu", n: 3 } },
  { id: "ex_skill", name: "传功·玄水护体", desc: "习得「玄水护体」，凝水为盾。", cost: 25, reward: { t: "skill", id: "xuan-shui" } },
];
