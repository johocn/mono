/**
 * 丹方配置表：数据驱动。
 * 每条丹方声明所需材料（复用现有 material：妖丹/珊瑚/珍珠/鲛珠/妖王内丹/鲛绡）、
 * 额外灵石消耗，以及产出丹药（consumable）。炼制成功率随境界提升（见 Player.alchemize）。
 */
export interface AlembicRecipe {
  id: string;
  name: string;
  desc: string;
  /** 所需材料（material/consumable id + 数量） */
  ingredients: { id: string; n: number }[];
  /** 额外灵石消耗 */
  stones?: number;
  /** 产出丹药（consumable id + 数量） */
  out: { id: string; n: number };
}

export const ALEMBIC_RECIPES: AlembicRecipe[] = [
  {
    id: "r-huixue", name: "回血丹", desc: "以妖丹与珊瑚炼制，温养气血。",
    ingredients: [{ id: "yaodan", n: 1 }, { id: "shan-hu", n: 2 }],
    out: { id: "huixue-dan", n: 1 },
  },
  {
    id: "r-huilanan", name: "回蓝丹", desc: "凝珍珠之润，回复灵力。",
    ingredients: [{ id: "yaodan", n: 1 }, { id: "zhen-zhu", n: 1 }],
    out: { id: "huilan-dan", n: 1 },
  },
  {
    id: "r-xiuwei", name: "修为丹", desc: "取鲛珠灵气，炼化为修为。",
    ingredients: [{ id: "yaodan", n: 1 }, { id: "jiao-zhu", n: 1 }],
    out: { id: "xiuwei-dan", n: 2 },
  },
  {
    id: "r-tupo", name: "突破丹", desc: "珍稀大丹，大幅增益修为，助汝冲击天劫大境。",
    ingredients: [
      { id: "yaowang-neidan", n: 1 },
      { id: "jiao-zhu", n: 3 },
      { id: "yaodan", n: 2 },
    ],
    stones: 60,
    out: { id: "tu-po-dan", n: 1 },
  },
  {
    id: "r-yuanying", name: "元婴丹", desc: "以妖王内丹佐鲛绡，助结元婴。",
    ingredients: [
      { id: "yaowang-neidan", n: 2 },
      { id: "jiao-xiao", n: 2 },
    ],
    out: { id: "yuan-ying-dan", n: 2 },
  },
  // —— P3-5 采集物炼丹：灵草为野外可采，闭合采→炼经济 ——
  {
    id: "r-cao-dan", name: "聚气丹", desc: "采山野灵草炼制，温养气血，服之回复气血。",
    ingredients: [{ id: "ling-cao", n: 3 }],
    out: { id: "huixue-dan", n: 1 },
  },
];
