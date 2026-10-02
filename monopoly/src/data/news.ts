/**
 * M20.4 每轮新闻 · 数据层（spec §4.2 / 上位路线图 D28）。
 *
 * 每轮 1 条（轮末抽下一条）；驱动两处：① 设施分红系数（利好 ×1.5 / 利空 ×0.5）
 * ② 股价（下轮必涨 / 必跌）。第三影响面「板块租金 ×1.25」本轮**裁剪**（spec F-D6）。
 * 固定表 + 独立 rng 流 ⇒ 可复现（spec F-D7）。
 */
import { FACILITIES } from './facilities';
import { STOCKS } from './stocks';

export type Sentiment = 'good' | 'bad';
/** `economy`（M20.5 D48）= 大盘新闻，target 恒为 `'market'`，驱动景气度而非分红 / 股价 */
export type NewsScope = 'facility' | 'stock' | 'economy';

export interface NewsItem {
  id: string;
  sentiment: Sentiment;
  scope: NewsScope;
  /** `facility` 时为 `FacilityId`；`stock` 时为股票 `code` */
  target: string;
  title: string;
  /** D28 的 magnitude：本轮仅设施分红系数用（利好 1.5 / 利空 0.5）；个股新闻保留字段但由 `sentiment` 驱动股价方向 */
  magnitude: number;
}

/** 利好 / 利空 → 分红系数（D28 ①；无关设施 = 1，由 `newsCoefOf` 判定） */
export const NEWS_COEF = { good: 1.5, bad: 0.5 } as const;

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
];

/** 大盘新闻的固定 target（scope === 'economy' 时唯一合法值） */
export const ECONOMY_TARGET = 'market';

/** 新闻表自洽闸门（供单测与调试复用）：target 必须落在对应真源内 */
export function newsTargetsValid(): boolean {
  const facIds = new Set(FACILITIES.map((f) => f.id as string));
  const stockCodes = new Set(STOCKS.map((s) => s.code));
  return NEWS_TABLE.every((n) => {
    if (n.scope === 'facility') return facIds.has(n.target);
    if (n.scope === 'stock') return stockCodes.has(n.target);
    return n.target === ECONOMY_TARGET;
  });
}
