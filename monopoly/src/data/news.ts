/**
 * M20.4 每轮新闻 · 数据层（spec §4.2 / 上位路线图 D28）。
 *
 * 每轮 1 条（轮末抽下一条）；驱动三处：① 设施分红系数（利好 ×1.5 / 利空 ×0.5）
 * ② 股价（下轮必涨 / 必跌）③ 板块租金（M20.6 D52：利好 ×1.25 / 利空 ×0.8）。
 * 固定表 + 独立 rng 流 ⇒ 可复现（spec F-D7）。
 */
import { FACILITIES } from './facilities';
import { STOCKS } from './stocks';
import type { TileTier } from './board';

export type Sentiment = 'good' | 'bad';
/** `economy`（M20.5 D48）= 大盘新闻，target 恒为 `'market'`；`sector`（M20.6 D52）= 板块租金，target 为 `TileTier` */
export type NewsScope = 'facility' | 'stock' | 'economy' | 'sector';

export interface NewsItem {
  id: string;
  sentiment: Sentiment;
  scope: NewsScope;
  /** `facility` → `FacilityId`；`stock` → 股票 `code`；`sector` → `TileTier` */
  target: string;
  title: string;
  /** D28 的 magnitude：设施分红系数用（利好 1.5 / 利空 0.5）；个股由 `sentiment` 驱动方向；板块为租金系数 */
  magnitude: number;
}

/** 利好 / 利空 → 分红系数（D28 ①；无关设施 = 1，由 `newsCoefOf` 判定） */
export const NEWS_COEF = { good: 1.5, bad: 0.5 } as const;

/** 板块租金系数（M20.6 D52）：利好 ×1.25 / 利空 ×0.8（对称、便于终局放大） */
export const SECTOR_RENT_COEF = { good: 1.25, bad: 0.8 } as const;

/** 合法板块 target 集合（`newsTargetsValid` 放行 `sector` 用） */
export const SECTOR_TARGETS: readonly TileTier[] = ['core', 'tourism', 'town'];

/** M20.5 D47 公平抽取：最近 N 条出现过的 id 不重复抽（候选池为空则放宽） */
export const NEWS_COOLDOWN = 4;
/** M20.5 D47 公平抽取：连续同向达 N 条后，候选池收窄为反向（反向池空则放宽） */
export const NEWS_STREAK_MAX = 3;

/** 固定新闻表（D28：从固定表抽取 → 可回放）；设施 6 条 + 个股 4 条 + M20.5 大盘 2 条 */
export const NEWS_TABLE: readonly NewsItem[] = [
  { id: 'n-bank-good', sentiment: 'good', scope: 'facility', target: 'bank', title: '鹿乡银行揽储大增，股东分红看涨', magnitude: NEWS_COEF.good },
  { id: 'n-bank-bad', sentiment: 'bad', scope: 'facility', target: 'bank', title: '银行坏账暴露，股东分红缩水', magnitude: NEWS_COEF.bad },
  { id: 'n-exch-good', sentiment: 'good', scope: 'facility', target: 'exchange', title: '鹿茸交易火爆，交易所手续费水涨船高', magnitude: NEWS_COEF.good },
  { id: 'n-hosp-bad', sentiment: 'bad', scope: 'facility', target: 'hospital', title: '医疗事故赔偿，医院股东承压', magnitude: NEWS_COEF.bad },
  { id: 'n-lot-good', sentiment: 'good', scope: 'facility', target: 'lottery', title: '乐透彩购彩热潮，股东分红上扬', magnitude: NEWS_COEF.good },
  { id: 'n-welf-good', sentiment: 'good', scope: 'facility', target: 'welfare', title: '福利中心募捐踊跃，分红提升', magnitude: NEWS_COEF.good },
  { id: 'n-stock01-up', sentiment: 'good', scope: 'stock', target: 'SY01', title: '鹿业股份获大单，行情看涨', magnitude: NEWS_COEF.good },
  { id: 'n-stock02-down', sentiment: 'bad', scope: 'stock', target: 'SY02', title: '温泉文旅客流下滑，行情承压', magnitude: NEWS_COEF.bad },
  { id: 'n-stock03-up', sentiment: 'good', scope: 'stock', target: 'SY03', title: '山泉饮品新品热销，行情看涨', magnitude: NEWS_COEF.good },
  { id: 'n-stock04-down', sentiment: 'bad', scope: 'stock', target: 'SY04', title: '有机农业歉收，行情承压', magnitude: NEWS_COEF.bad },
  /* —— M20.5 D48 大盘新闻：直接驱动景气度（±0.15），target 恒为 'market' —— */
  { id: 'n-econ-boom', sentiment: 'good', scope: 'economy', target: 'market', title: '消费回暖，全城租金水涨船高', magnitude: NEWS_COEF.good },
  { id: 'n-econ-bust', sentiment: 'bad', scope: 'economy', target: 'market', title: '市场遇冷，租地收益普遍下滑', magnitude: NEWS_COEF.bad },
  /* —— M20.6 D52 板块新闻：驱动该商圈所有地块租金（利好 ×1.25 / 利空 ×0.8），target = TileTier —— */
  { id: 'n-sector-core-good', sentiment: 'good', scope: 'sector', target: 'core', title: '核心商圈客流爆棚，地租水涨船高', magnitude: SECTOR_RENT_COEF.good },
  { id: 'n-sector-tourism-good', sentiment: 'good', scope: 'sector', target: 'tourism', title: '文旅旺季来临，景区地租看涨', magnitude: SECTOR_RENT_COEF.good },
  { id: 'n-sector-town-good', sentiment: 'good', scope: 'sector', target: 'town', title: '乡镇特产走俏，乡镇地租回升', magnitude: SECTOR_RENT_COEF.good },
  { id: 'n-sector-core-bad', sentiment: 'bad', scope: 'sector', target: 'core', title: '核心商圈改造施工，客流锐减', magnitude: SECTOR_RENT_COEF.bad },
  { id: 'n-sector-tourism-bad', sentiment: 'bad', scope: 'sector', target: 'tourism', title: '文旅淡季叠加暴雨，客流腰斩', magnitude: SECTOR_RENT_COEF.bad },
  { id: 'n-sector-town-bad', sentiment: 'bad', scope: 'sector', target: 'town', title: '乡镇道路封闭，商户生意冷清', magnitude: SECTOR_RENT_COEF.bad },
];

/** 大盘新闻的固定 target（scope === 'economy' 时唯一合法值） */
export const ECONOMY_TARGET = 'market';

/** 新闻表自洽闸门（供单测与调试复用）：target 必须落在对应真源内 */
export function newsTargetsValid(): boolean {
  const facIds = new Set(FACILITIES.map((f) => f.id as string));
  const stockCodes = new Set(STOCKS.map((s) => s.code));
  const sectors = new Set<string>(SECTOR_TARGETS);
  return NEWS_TABLE.every((n) => {
    if (n.scope === 'facility') return facIds.has(n.target);
    if (n.scope === 'stock') return stockCodes.has(n.target);
    if (n.scope === 'sector') return sectors.has(n.target);
    return n.target === ECONOMY_TARGET;
  });
}
