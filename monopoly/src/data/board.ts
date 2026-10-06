/**
 * ✅ 授权状态：已获授权 · 已公开部署（AUTHORIZED · DEPLOYED 2026-09-29）
 *
 * 本文件的 32 格商家名称是按公开资料整理的「长春市双阳区候选清单」。
 * 业主已于 2026-09-29 确认**已取得商家书面授权 + 业主核准**并放行公开部署，
 * 线上 <https://game.joho.cn/tour/mono.html> 自本次部署起显示下列真名。
 * 授权与命名依据见 `docs/manual-mono.md` §4「替换为真实双阳商家数据」的对照表。
 * 后续增补 / 撤换商家，仍须走「取得授权 → 改数据或 `public/config/shops.json` → 部署」流程。
 */
export const BOARD_COLS = 11;
export const BOARD_ROWS = 7;

export type TileType =
  | 'core' | 'shop' | 'chance' | 'fate' | 'bonus' | 'jail' | 'stock'
  | 'bank' | 'lottery' | 'tax' | 'hospital';

/** 建筑层级（M7 起 3 级 → 5 级，对齐《大富翁 5》并做超越）：1 摊位 → 5 产业园区 */
export type BuildLevel = 1 | 2 | 3 | 4 | 5;

/** 商圈分档（M20.6 D51）：板块效应（新闻 `scope:'sector'`）的挂载真源；非商家格为 null */
export type TileTier = 'core' | 'tourism' | 'town';

export interface TileDef {
  index: number;
  name: string;
  short: string;
  brand: string;
  type: TileType;
  level: 0 | BuildLevel;   // 演示初始层级（0 = 无楼）
  tier: TileTier | null;   // 商圈归属（非商家格 = null）
}

/**
 * 外圈 32 格类型。M7 特殊格补全：把 9 / 21 / 23 / 25 四格从「命运卡 / 机会卡」
 * 改为 **银行 / 乐透 / 税务局 / 医院**（对齐《大富翁 5》的银行·乐透·税金·医院），
 * 商家格 17 个**一个不动**（业主授权清单是产品价值所在，不因玩法改格而牺牲）。
 * 命运 / 机会各留 3 格（2/17/29 与 5/14/31），配 20 张牌堆足够。
 */
export const TILE_TYPES: TileType[] = [
  'core', 'shop', 'fate', 'shop', 'shop', 'chance', 'shop', 'bonus',
  'shop', 'bank', 'shop', 'shop', 'jail', 'shop', 'chance', 'shop',
  'shop', 'fate', 'shop', 'stock', 'shop', 'lottery', 'shop', 'tax',
  'shop', 'hospital', 'shop', 'bonus', 'shop', 'fate', 'shop', 'chance',
];

/** 商家**全名**（候选真名；见文件头授权告警与手册 §4 对照表） */
export const TILE_NAMES = [
  '鹿乡特色小镇', '金鹿源参茸经销处', '命运卡', '长峰土特产品商店', '国信南山温泉酒店', '机会卡',
  '御龙温泉度假村', '福利中心', '吉吉土特产品商店', '鹿乡银行', '国玉庄园', '王连申鹿膏',
  '监狱', '鹿产品一条街', '机会卡', '刘氏鹿茸炮制技艺', '守鏊仁煎饼', '命运卡',
  '双阳鹿茸交易市场', '股票交易所', '梅花鹿博物馆', '乐透彩', '广生村农产品', '税务局',
  '黑鱼葡萄采摘园', '医院', '东龙度假村', '福利中心', '绿色巨农采摘园', '命运卡',
  '神鹿峰旅游度假区', '机会卡',
];

/** 棋盘 32 格地名字牌（≤5 字，保证 390 宽下不压邻格；非商家格为功能名） */
export const TILE_SHORT = [
  '鹿乡小镇', '金鹿源', '命运卡', '长峰特产', '国信温泉', '机会卡', '御龙温泉', '福利中心',
  '吉吉特产', '鹿乡银行', '国玉庄园', '王氏鹿膏', '监狱', '鹿品街', '机会卡', '刘氏鹿茸',
  '守鏊仁', '命运卡', '鹿茸市场', '股票所', '鹿博物馆', '乐透彩', '广生农产', '税务局',
  '黑鱼葡萄', '医院', '东龙度假', '福利中心', '巨农采摘', '命运卡', '神鹿峰', '机会卡',
];

/** 店招 / 楼体 / 橱窗信息条文字（短名） */
export const TILE_BRAND = [
  '鹿乡', '金鹿源', '命运', '长峰特产', '国信温泉', '机会', '御龙温泉', '福利', '吉吉特产', '银行',
  '国玉庄园', '王氏鹿膏', '监狱', '鹿品街', '机会', '刘氏鹿茸', '守鏊仁', '命运', '鹿茸市场', '股票所',
  '鹿博物馆', '乐透', '广生农产', '税务', '黑鱼葡萄', '医院', '东龙度假', '福利', '巨农采摘', '命运',
  '神鹿峰', '机会',
];

/** 演示层级（v5 样张 LV；0 = 无楼，仅空地砖） */
export const TILE_LEVEL: Array<0 | BuildLevel> = [
  3, 1, 0, 1, 2, 0, 2, 0, 1, 0, 2, 1, 0, 2, 0, 1, 1, 0, 3, 0, 2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 3, 0,
];

/**
 * M18 D1 · 开局保留的**公共设施楼**（play 模式唯一的开局有楼来源；未售商家格一律无楼）。
 * 现状 `TILE_LEVEL` 是 v5 演示层级（18 栋楼几乎全落在商家格）；play 改走本表：
 * 只有 4 处公共设施开局成楼，商家格等买家买下才从 L1 长起。
 * 格位：0 鹿乡特色小镇（每回合必经，L3）/ 9 鹿乡银行（L2）/ 19 股票交易所（L2）/ 25 医院（L2）。
 */
export const START_PUBLIC_LEVEL: Record<number, BuildLevel> = { 0: 3, 9: 2, 19: 2, 25: 2 };

export const RING_SIZE = 32;

/**
 * 商圈分档真源（M20.6 D51）：商家格（含起点 0，共 18 格）的板块归属。
 * 与 `PROPOSED_TILE_TIER` 同值（该常量改为 re-export 本表，避免两处漂移），
 * 本轮只用于「板块新闻租金系数」（`scope:'sector'`）；**基础租金 / 建造价仍全局按级**。
 */
export const TILE_TIER: Record<number, TileTier> = {
  0: 'core', 1: 'core', 3: 'core', 4: 'tourism', 6: 'tourism', 8: 'core', 10: 'tourism',
  11: 'core', 13: 'core', 15: 'core', 16: 'town', 18: 'core', 20: 'tourism', 22: 'core',
  24: 'town', 26: 'tourism', 28: 'town', 30: 'tourism',
};

/** 格号 → 商圈（非商家格 / 未登记 → null） */
export function tierOf(index: number): TileTier | null {
  return TILE_TIER[index] ?? null;
}

/** 商圈中文名（UI 前缀用） */
export const TIER_NAME: Record<TileTier, string> = {
  core: '核心商圈', tourism: '文旅商圈', town: '乡镇商圈',
};

export const TILES: TileDef[] = TILE_NAMES.map((name, i) => ({
  index: i,
  name,
  short: TILE_SHORT[i],
  brand: TILE_BRAND[i],
  type: TILE_TYPES[i],
  level: TILE_LEVEL[i],
  tier: TILE_TIER[i] ?? null,
}));

/** v5 样张 line 66–73：外圈 32 格路径 */
export function ringPath(cols: number, rows: number): Array<[number, number]> {
  const p: Array<[number, number]> = [];
  for (let c = 1; c <= cols; c++) p.push([c, rows]);
  for (let r = rows - 1; r >= 2; r--) p.push([cols, r]);
  for (let c = cols; c >= 1; c--) p.push([c, 1]);
  for (let r = 2; r <= rows - 1; r++) p.push([1, r]);
  return p;
}

const KEY_TO_INDEX = new Map<string, number>(
  ringPath(BOARD_COLS, BOARD_ROWS).map(([c, r], i) => [`${c},${r}`, i]),
);

export function tileIndexOf(c: number, r: number): number {
  return KEY_TO_INDEX.get(`${c},${r}`) ?? -1;
}

export function typeAt(index: number): TileType {
  return TILES[index].type;
}
export function nameAt(index: number): string {
  return TILES[index].name;
}
export function shortAt(index: number): string {
  return TILES[index].short;
}
export function brandAt(index: number): string {
  return TILES[index].brand;
}

/** v5 样张 line 58：演示归属（M3 视觉回归与「开局画面」用；真实归属由 M4 买地写回） */
export const DEMO_OWNER: Record<number, 1 | 2 | 3 | 4> = {
  0: 1, 1: 3, 3: 1, 4: 2, 6: 4, 8: 2, 10: 3, 11: 1, 13: 1, 15: 4, 16: 1,
  18: 2, 20: 3, 22: 2, 24: 1, 26: 4, 28: 3, 30: 2,
};

/** v5 样张 line 59 OHUE：四位玩家的楼体色相（与 tokens.owner1..owner4 同源） */
export const OWNER_HUE: Record<number, number> = { 1: 145, 2: 32, 3: 338, 4: 200 };

/** 竖招幌子文字（与候选商家同步：0 鹿乡小镇 / 4 温泉 / 6 御龙温泉 / 18 鹿茸市场 / 26 东龙度假村） */
export const SLOT_BANNER: Record<number, string> = {
  0: '鹿乡', 4: '温泉', 6: '御龙', 18: '鹿茸', 26: '东龙',
};

/** 灯笼字：只有 4 家有招牌字（挂门口那盏写自己的字） */
export const SLOT_LANTERN_CHAR: Record<number, string> = {
  4: '汤', 6: '泉', 18: '鹿', 26: '龙',
};

/**
 * 路过租金按楼层（v5 样张 line 62：`RENT = [0, 15, 45, 105]`）。
 * M7 对齐《大富翁 5》并做超越：3 级 → **5 级**；L1–L3 沿用 v5 数值（既有平衡与回归逐值不变），
 * L4/L5 为新增档位（L1–L3 每级约 ×2.3，L4/L5 延续同斜率略放缓，给终局留追赶空间）。
 */
export const RENT_BY_LEVEL = [0, 15, 45, 105, 220, 420];

/** 演示玩家名（v5 样张 line 59 `ONM` → ④ 角色 IP 化：西游·取经四众，与 `piece.p1..p4` 的 style 一一对应） */
export const PLAYER_NAME = ['孙悟空', '猪八戒', '沙悟净', '唐三藏'];

/** 橱窗演示文案（v5 optB line 444–447；M4 接入 i18n 字典后改由字典取，本任务先集中在此便于一处替换） */
export const SHOWCASE_TEXT = {
  kind: '商铺', holder: '持有者', floors: '层建筑', rent: '路过租金',
  upgradeTo: '升级到', maxLevel: '已是最高等级 · 不再涨价', pay: '支付',
  noOwner: '无主', fallbackBrand: '门店',
  miniBanner: '市集',
};

/** 五级建筑名（L1 摊位 / L2 门店 / L3 商超楼 / L4 商贸城 / L5 产业园区；L1–L3 沿用 v5 optC line 450–452） */
export const LEVEL_NAME = ['', '摊位', '门店', '商超楼', '商贸城', '产业园区'];

/** 五级建造价（L1–L3 沿用 v5 optC line 450–452 的 ￥60 / ￥180 / ￥420；L4/L5 为 M7 新增档位） */
export const PRICE_BY_LEVEL = [0, 60, 180, 420, 860, 1600];

/**
 * ⚠️ 建议分级价目（**待平衡** · 仅为提案，**未接入** economy）
 *
 * 现状：租金 / 建造价是**全局按级**（`RENT_BY_LEVEL` / `PRICE_BY_LEVEL`），并非逐格，
 * 无法体现「核心商圈地价高、乡镇地价低」的差异。下表按 核心商圈 / 文旅 / 乡镇 三档
 * 给出建议乘数与价目，供业主与策划平衡后拍板。
 *
 * 接入方式（属**功能变更**，另立任务；本次**不**实施，以免静默改平衡）：
 *   1) ~~给 `TileDef` 增 `tier` 字段~~（**M20.6 D51 已完成**，真源见 `TILE_TIER` / `tierOf`）；
 *   2) `economy.ts` 的 `rentOf / buyPrice` 改为 `(index, level)` 口径，按 `tier` 查表（**仍未接入**）；
 *   3) 同步橱窗 / 对照卡 / 结算等调用点。
 */
export const PROPOSED_RENT_TIER_PLAN = {
  status: '待平衡',
  /** 现网基线（全局按级），供对比 */
  baseline: { rent: RENT_BY_LEVEL, price: PRICE_BY_LEVEL },
  tiers: {
    core: { label: '核心商圈', mult: 1.4, rent: [0, 20, 60, 150], price: [0, 80, 240, 600] },
    tourism: { label: '文旅', mult: 1.2, rent: [0, 18, 54, 126], price: [0, 72, 216, 504] },
    town: { label: '乡镇', mult: 0.8, rent: [0, 12, 36, 84], price: [0, 48, 144, 336] },
  },
} as const;

/**
 * 建议分档归属（格号 → `tier`）。M20.6 D51 起**已接入代码**：本常量改为 re-export `TILE_TIER`
 * （避免两处漂移），名字保留供历史注释与既有引用；实际真源见上方 `TILE_TIER` / `tierOf()`。
 */
export const PROPOSED_TILE_TIER: Record<number, TileTier> = TILE_TIER;

/** 五级对照卡标签：`L{lv} {名} · ￥{价}`（v5 optC line 450–452；M4 接 i18n 后由字典取） */
export function levelCaption(lv: number): string {
  return `L${lv} ${LEVEL_NAME[lv] ?? ''} · ￥${PRICE_BY_LEVEL[lv] ?? 0}`;
}