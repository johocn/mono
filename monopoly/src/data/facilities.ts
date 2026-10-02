/**
 * M20.4 公共设施入股 · 数据层（spec §4.1 / 上位路线图 D25–D27）。
 *
 * 客户诉求（路线图 §1 第 10 条）：「不买地也要有收益来源」——5 处公共设施可认购股份、每轮末分红。
 * 建模粒度：**按设施 id**（`FacilityId`）而非按格号——福利中心占 7 与 27 **两格**，
 * 但 D25 算**一处**，按格号建模会出现「同设施两份股本」的错账（spec F-D1）。
 */

/** 5 处可入股设施（D25；监狱 12 / 税务局 23 / 起点 0 不入股） */
export type FacilityId = 'bank' | 'exchange' | 'hospital' | 'lottery' | 'welfare';

export interface FacilityDef {
  id: FacilityId;
  name: string;
  /** 设施所在格（福利两格）；供 UI 说明与「落该格」提示用 */
  tiles: number[];
  /** 认购价（每股，D26） */
  price: number;
  /** 总股本（D26） */
  shares: number;
  /** 基础分红率（每股 / 轮，D26） */
  rate: number;
}

/** 五处设施逐值（spec §4.1；表序即 AI 认购优先级 F-D2 / §7） */
export const FACILITIES: FacilityDef[] = [
  { id: 'bank', name: '鹿乡银行', tiles: [9], price: 200, shares: 20, rate: 0.05 },
  { id: 'exchange', name: '股票交易所', tiles: [19], price: 180, shares: 20, rate: 0.05 },
  { id: 'hospital', name: '医院', tiles: [25], price: 150, shares: 20, rate: 0.05 },
  { id: 'lottery', name: '乐透彩', tiles: [21], price: 120, shares: 20, rate: 0.05 },
  { id: 'welfare', name: '福利中心', tiles: [7, 27], price: 100, shares: 20, rate: 0.05 },
];

/** 每处总股本（D26：20 股 ⇒ 基础分红 5%/轮，20 轮回本、高于存款 3%） */
export const FACILITY_SHARES = 20;
/** 基础分红率（每股 / 轮，D26） */
export const FACILITY_DIV_RATE = 0.05;

/** 按 id 取设施定义（未知名 → 抛错：id 由类型约束，越界即程序错误） */
export function facilityOf(id: FacilityId): FacilityDef {
  const def = FACILITIES.find((f) => f.id === id);
  if (!def) throw new Error(`unknown facility: ${id}`);
  return def;
}

/** 格号 → 设施 id（两格归一处；非设施格 → null，F-D1） */
export function facilityAtTile(index: number): FacilityId | null {
  for (const f of FACILITIES) {
    if (f.tiles.includes(index)) return f.id;
  }
  return null;
}
