/**
 * 道具与装备配置表：数据驱动。
 * consumable: heal / mp / exp 即时生效
 * equipment: 穿戴后提供 atk/def/spd/crit 加成（slot: weapon/armor/trinket）
 */
export type ItemType = "consumable" | "weapon" | "armor" | "trinket" | "material";
export type EquipSlot = "weapon" | "armor" | "trinket";

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  desc: string;
  /** 叠加上限 */
  stack: number;
  /** 消耗品即时效果 */
  heal?: number;
  mp?: number;
  exp?: number;
  /** 装备属性 */
  slot?: EquipSlot;
  atk?: number;
  def?: number;
  spd?: number;
  crit?: number;
  /** 基准价（灵石）：商店买入价与卖出价（4 折）均由此推导；0 = 不可交易 */
  price?: number;
  /** 可滚词条池（AFFIX_POOL 的 id）；不填则按全局池随机 1~2 条 */
  affixes?: string[];
  /** 所属套装 id（见 data/sets.ts）；穿戴达 n 件触发加成 */
  set?: string;
}

export const ITEMS: Record<string, ItemDef> = {
  "huixue-dan": {
    id: "huixue-dan", name: "回血丹", type: "consumable",
    desc: "恢复 80 点气血。", stack: 99, heal: 80, price: 30,
  },
  "huilan-dan": {
    id: "huilan-dan", name: "回蓝丹", type: "consumable",
    desc: "恢复 40 点灵力。", stack: 99, mp: 40, price: 25,
  },
  "xiuwei-dan": {
    id: "xiuwei-dan", name: "修为丹", type: "consumable",
    desc: "服用后获得 50 点修为。", stack: 99, exp: 50, price: 60,
  },
  "qingfeng-jian": {
    id: "qingfeng-jian", name: "青锋剑", type: "weapon",
    desc: "精铁长剑，攻击 +12。", stack: 1, slot: "weapon", atk: 12, price: 220,
  },
  "huixin-jia": {
    id: "huixin-jia", name: "护心甲", type: "armor",
    desc: "玄丝软甲，防御 +8。", stack: 1, slot: "armor", def: 8, price: 180,
  },
  "yufeng-pei": {
    id: "yufeng-pei", name: "御风佩", type: "trinket",
    desc: "身轻如燕，速度 +15%，暴击 +5%。", stack: 1, slot: "trinket", spd: 0.15, crit: 0.05, price: 260,
  },
  "zhentie-jian": {
    id: "zhentie-jian", name: "镇铁重剑", type: "weapon",
    desc: "玄铁铸就，攻击 +22，势大力沉。", stack: 1, slot: "weapon", atk: 22, price: 420,
  },
  "xuangui-jia": {
    id: "xuangui-jia", name: "玄龟甲", type: "armor",
    desc: "龟甲炼制的护身甲，防御 +16。", stack: 1, slot: "armor", def: 16, price: 380,
  },
  "yaodan": {
    id: "yaodan", name: "妖丹", type: "material",
    desc: "妖兽体内晶核，炼器所需。", stack: 999, price: 45,
  },
  "wood": {
    id: "wood", name: "木材", type: "material",
    desc: "建造基础材料，妖兽林随处可见。", stack: 999, price: 6,
  },
  "stone": {
    id: "stone", name: "石料", type: "material",
    desc: "建造基础材料，采自山岩。", stack: 999, price: 8,
  },
  "yaowang-neidan": {
    id: "yaowang-neidan", name: "妖王内丹", type: "material",
    desc: "妖狼王毕生精华，价值连城。", stack: 999, price: 500,
  },
  // —— 坠魔谷魔物产物（第二章深化）——
  "mo-he": {
    id: "mo-he", name: "魔核", type: "material",
    desc: "魔物体内凝练的魔核，炼器与突破的奇物。", stack: 999, price: 60,
  },
  "mo-qi": {
    id: "mo-qi", name: "魔气", type: "material",
    desc: "幽冥魔气凝成的精粹，可炼制高阶丹药。", stack: 999, price: 45,
  },
  "mo-zun-neidan": {
    id: "mo-zun-neidan", name: "魔尊内丹", type: "material",
    desc: "魔尊一身修为所凝，世所罕见。", stack: 99, price: 1200,
  },
  "capture-bell": {
    id: "capture-bell", name: "捕兽铃", type: "material",
    desc: "对残血妖兽摇响，可尝试将其收服为灵兽。", stack: 99, price: 80,
  },
  // —— P3-5 野外采集专属草本（用于炼丹，闭合采→炼经济）——
  "ling-cao": {
    id: "ling-cao", name: "灵草", type: "material",
    desc: "山野自生的灵性药草，可采得后炼制丹药。", stack: 999, price: 12,
  },

  // —— 乱星海产物（第二章）——
  "shan-hu": {
    id: "shan-hu", name: "珊瑚", type: "material",
    desc: "浅海礁间拾得，可换灵石，亦是炼器好料。", stack: 999, price: 18,
  },
  "zhen-zhu": {
    id: "zhen-zhu", name: "珍珠", type: "material",
    desc: "鲛人孕育的宝珠，温润生辉。", stack: 999, price: 40,
  },
  "jiao-xiao": {
    id: "jiao-xiao", name: "鲛绡", type: "material",
    desc: "鲛人织就的轻纱，水火不侵。", stack: 999, price: 60,
  },
  "jiao-zhu": {
    id: "jiao-zhu", name: "鲛珠", type: "material",
    desc: "鲛人族圣物，蕴含海之灵气。", stack: 999, price: 80,
  },
  "xie-jia": {
    id: "xie-jia", name: "蟹甲", type: "material",
    desc: "蟹将脱落的硬甲，坚实异常。", stack: 999, price: 22,
  },
  "bi-shui-jian": {
    id: "bi-shui-jian", name: "避水剑", type: "weapon",
    desc: "潮汐凝练的水属长剑，攻击 +28，临水更利。", stack: 1, slot: "weapon", atk: 28, price: 480,
    set: "xuan-shui",
  },
  "jiao-lin-jia": {
    id: "jiao-lin-jia", name: "鲛鳞甲", type: "armor",
    desc: "鲛人鳞甲炼制，防御 +22。", stack: 1, slot: "armor", def: 22, price: 440,
    set: "xuan-shui",
  },
  "yuan-ying-dan": {
    id: "yuan-ying-dan", name: "元婴丹", type: "consumable",
    desc: "服之助结元婴，获得 300 点修为。", stack: 99, exp: 300, price: 200,
  },
  "tu-po-dan": {
    id: "tu-po-dan", name: "突破丹", type: "consumable",
    desc: "珍稀大丹，服之获得 1000 点修为，助你冲击天劫大境。", stack: 99, exp: 1000, price: 360,
  },
  // —— 宝石（material，供装备镶嵌；部位/加成见 data/gems.ts）——
  "gem-atk": { id: "gem-atk", name: "赤血石", type: "material", desc: "攻击宝石，可镶嵌于武器。", stack: 99, price: 120 },
  "gem-crit": { id: "gem-crit", name: "破军星", type: "material", desc: "暴击宝石，可镶嵌于武器。", stack: 99, price: 140 },
  "gem-def": { id: "gem-def", name: "玄龟壳", type: "material", desc: "防御宝石，可镶嵌于防具。", stack: 99, price: 110 },
  "gem-spd": { id: "gem-spd", name: "风灵珠", type: "material", desc: "速度宝石，可镶嵌于饰物。", stack: 99, price: 130 },
  "gem-life": { id: "gem-life", name: "续命玉", type: "material", desc: "吸血宝石，可镶嵌于饰物。", stack: 99, price: 150 },
};

export function getItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}

export function isEquipment(id: string): boolean {
  const it = ITEMS[id];
  return !!it && (it.type === "weapon" || it.type === "armor" || it.type === "trinket");
}
