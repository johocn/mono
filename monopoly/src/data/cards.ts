/**
 * 卡牌数据唯一真源（spec §5.3）：8 种常驻手牌道具 + 命运牌堆 20 张 + 机会牌堆 20 张。
 *
 * 牌堆张数与棋盘格数**解耦**（M5 全局契约 ②）：棋盘上只有 5 个 `fate` 格与 5 个 `chance` 格
 * （见 `board.ts`），但牌堆各 20 张；落到任意一个 `fate`/`chance` 格都从对应牌堆里抽 1 张，
 * 抽空即整堆洗牌重来。格数是「触发点」，张数是「内容表」，两者生命周期不同，故分别定义。
 *
 * 张数口径（对齐并超越《大富翁 5》）：命运 / 机会各 **20 张**、各覆盖 10 种机制
 * （`FateKind` / `ChanceKind`），同种机制用不同金额/步数复现多张，保证「一局内抽到的牌不重样」。
 */

export type ItemCardKind =
  | 'bomb' | 'barrier' | 'pardon' | 'teleport' | 'doubleRent' | 'demolish'
  /* —— M20.3-B 股票轨新增两种（spec §4.1）—— */
  | 'bullBear' | 'dividend';

/** 用牌目标类：`stock` = 需指定一支股票（M20.3-B 涨跌卡；`main.ts` 走专属浮层，不进棋盘选目标态） */
export type ItemTarget = 'none' | 'tile' | 'foe' | 'self' | 'stock';

export interface ItemCardDef {
  kind: ItemCardKind;
  name: string;
  desc: string;
  target: ItemTarget;
  /**
   * 常用度排序键（spec §4.1，M20.3 新增）：数值小 = 更常用，手牌行按它升序。
   * 口径「被动保命 > 即时收益 > 位置干预 > 破坏 > 长线」；
   * `ITEM_CARDS` 数组下标仍是第三键兜底，保证全序、零随机。
   */
  priority: number;
}

export const ITEM_CARDS: ItemCardDef[] = [
  { kind: 'bomb', name: '炸弹', desc: '拆对手目标地块 1 级（L1 炸回无主）', target: 'foe', priority: 30 },
  { kind: 'barrier', name: '路障', desc: '在前方 1–6 格内设障，拦停下一位经过者', target: 'tile', priority: 40 },
  { kind: 'pardon', name: '免罚', desc: '自动抵消一次应付租金或一次入狱', target: 'none', priority: 10 },
  { kind: 'teleport', name: '迁点', desc: '本回合以迁点取代移动，落到任意指定格', target: 'tile', priority: 50 },
  { kind: 'doubleRent', name: '租金翻倍', desc: '本人下一次收租翻倍，收完消耗', target: 'self', priority: 20 },
  { kind: 'demolish', name: '拆迁令', desc: '一次夷平对手目标地块全部楼体（归无主）', target: 'foe', priority: 60 },
  /* —— M20.3-B 股票轨（spec §4.1）：数组序仍作第三键兜底，故新卡一律追加在表尾 —— */
  { kind: 'bullBear', name: '涨跌卡', desc: '指定一支股票，下轮必涨或必跌', target: 'stock', priority: 70 },
  { kind: 'dividend', name: '红利卡', desc: '按持仓每股领 ￥20；无持仓折现 ￥100', target: 'none', priority: 80 },
];

/**
 * 手牌槽位（每种道具至多持 1 张，去重）——**由道具种类数派生**：
 * M20.3-B 往 `ITEM_CARDS` 追加 `bullBear` / `dividend` 后自动变 8 槽，手牌行与商店目录零改版。
 */
export const HAND_SIZE = ITEM_CARDS.length;

/** 命运 / 机会牌堆张数（与棋盘 5+5 格解耦） */
export const DECK_SIZE = 20;

/** 路障可设立的最远格数（前方 1–6 格） */
export const BARRIER_RANGE = 6;

/** 炸弹固定只降 1 级（卡面口径） */
export const BOMB_RANGE = 1;

/** 手牌已满时抽到道具卡的折算现金（spec §5.3） */
export const PARDON_REFUND = 100;

/**
 * 命运机制（10 种）：以「损耗 / 意外」为基调，但保留 3 张正向牌做波峰
 * （`gift` 补贴 / `advance` 顺风 / `harvest` 分红），避免「抽牌 = 挨罚」的单调节奏。
 */
export type FateKind =
  | 'fine' | 'tax' | 'back' | 'weather' | 'lockup' | 'swap'
  | 'advance' | 'gift' | 'levy' | 'demote' | 'tribute' | 'harvest' | 'toStart' | 'repair';

export interface FateCardDef {
  id: string;
  name: string;
  kind: FateKind;
  amount?: number;
  steps?: number;
  /** `levy` 专用：按净资产的百分比缴税（10 = 缴 10%） */
  percent?: number;
  text: string;
}

export const FATE_DECK: FateCardDef[] = [
  /* —— 原 6 张（保留 id 与文案，既有用例逐值不变） —— */
  { id: 'f-fine', name: '违规罚金', kind: 'fine', amount: 150, text: '摊位违规，罚金 ￥150' },
  { id: 'f-tax', name: '卫生摊派', kind: 'tax', amount: 200, text: '市场整治，摊派 ￥200' },
  { id: 'f-back', name: '走错路口', kind: 'back', steps: 3, text: '退后 3 格' },
  { id: 'f-weather', name: '天气停业', kind: 'weather', text: '恶劣天气，停业 1 回合' },
  { id: 'f-lockup', name: '临时看管', kind: 'lockup', text: '被带往监狱' },
  { id: 'f-swap', name: '铺位调换', kind: 'swap', text: '与随机一位玩家互换位置' },

  /* —— 罚金 / 摊派（金额档位拉开） —— */
  { id: 'f-fine-2', name: '超载罚款', kind: 'fine', amount: 80, text: '货运超载，罚金 ￥80' },
  { id: 'f-tax-2', name: '检疫摊派', kind: 'tax', amount: 120, text: '检疫摊派 ￥120' },

  /* —— 走位类 —— */
  { id: 'f-back-5', name: '迷失林道', kind: 'back', steps: 5, text: '退后 5 格' },
  { id: 'f-advance-3', name: '顺风赶路', kind: 'advance', steps: 3, text: '前进 3 格' },
  { id: 'f-advance-6', name: '借道同行', kind: 'advance', steps: 6, text: '前进 6 格' },
  { id: 'f-toStart', name: '拾级回程', kind: 'toStart', text: '回到起点，并领取过路津贴' },

  /* —— 正向波峰 —— */
  { id: 'f-gift', name: '惠农补贴', kind: 'gift', amount: 250, text: '领取惠农补贴 ￥250' },
  { id: 'f-gift-2', name: '意外分红', kind: 'gift', amount: 150, text: '意外分红 ￥150' },
  { id: 'f-harvest', name: '联营分红', kind: 'harvest', amount: 80, text: '向每位对手收取 ￥80' },

  /* —— 按资产比例 / 按地块数 —— */
  { id: 'f-levy', name: '财产清查', kind: 'levy', percent: 10, text: '按净资产的 10% 缴税' },
  { id: 'f-levy-2', name: '摊丁入亩', kind: 'levy', percent: 5, text: '按净资产的 5% 缴税' },
  { id: 'f-repair', name: '圈舍维修', kind: 'repair', amount: 40, text: '自有每级地块维修 ￥40' },
  { id: 'f-demote', name: '房屋整修', kind: 'demote', text: '自有最高级地块降 1 级' },
  { id: 'f-tribute', name: '打点人情', kind: 'tribute', amount: 60, text: '向每位对手支付 ￥60' },
];

/**
 * 机会机制（10 种）：以「收益 / 加速」为基调，配 2 张中性牌（`stockTip` / `grantItem`）
 * 保持节奏起伏；`grantItem` 指定道具（不随机），让「抽到哪张 → 拿到什么」可预读。
 */
export type ChanceKind =
  | 'bonus' | 'refund' | 'freeUpgrade' | 'rollAgain' | 'drawItem' | 'stockTip'
  | 'advance' | 'toStart' | 'collect' | 'grantItem';

export interface ChanceCardDef {
  id: string;
  name: string;
  kind: ChanceKind;
  amount?: number;
  steps?: number;
  item?: ItemCardKind;
  text: string;
}

export const CHANCE_DECK: ChanceCardDef[] = [
  /* —— 原 6 张（保留 id 与文案，既有用例逐值不变） —— */
  { id: 'c-bonus', name: '邻里扶持金', kind: 'bonus', amount: 300, text: '领取扶持金 ￥300' },
  { id: 'c-refund', name: '消费返现', kind: 'refund', amount: 120, text: '返现 ￥120' },
  { id: 'c-freeUpgrade', name: '免费升级', kind: 'freeUpgrade', text: '随机自有地块升 1 级（无则折现 ￥180）' },
  { id: 'c-rollAgain', name: '再掷一次', kind: 'rollAgain', text: '本回合额外再掷一次' },
  { id: 'c-drawItem', name: '抽道具卡', kind: 'drawItem', text: '随机获得 1 张道具卡（手牌满则折现 ￥100）' },
  { id: 'c-stockTip', name: '内幕消息', kind: 'stockTip', text: '随机一支股票下次必涨' },

  /* —— 收益类（金额档位拉开） —— */
  { id: 'c-bonus-2', name: '产业奖补', kind: 'bonus', amount: 500, text: '领取产业奖补 ￥500' },
  { id: 'c-bonus-3', name: '带货分成', kind: 'bonus', amount: 200, text: '电商带货分成 ￥200' },
  { id: 'c-refund-2', name: '物流退费', kind: 'refund', amount: 60, text: '物流退费 ￥60' },
  { id: 'c-refund-3', name: '税费减免', kind: 'refund', amount: 180, text: '税费减免 ￥180' },
  { id: 'c-collect', name: '联合促销', kind: 'collect', amount: 50, text: '向每位对手收取 ￥50' },
  { id: 'c-collect-2', name: '品牌联名', kind: 'collect', amount: 30, text: '向每位对手收取 ￥30' },

  /* —— 走位类 —— */
  { id: 'c-advance-3', name: '一路顺风', kind: 'advance', steps: 3, text: '前进 3 格' },
  { id: 'c-advance-5', name: '搭车同行', kind: 'advance', steps: 5, text: '前进 5 格' },
  { id: 'c-toStart', name: '班车回程', kind: 'toStart', text: '回到起点，并领取过路津贴' },

  /* —— 指定道具（按持有状态可能折现） —— */
  { id: 'c-grant-barrier', name: '备货路障', kind: 'grantItem', item: 'barrier', text: '获得「路障」（已持有则折现 ￥100）' },
  { id: 'c-grant-bomb', name: '清障爆破', kind: 'grantItem', item: 'bomb', text: '获得「炸弹」（已持有则折现 ￥100）' },
  { id: 'c-grant-teleport', name: '便捷迁点', kind: 'grantItem', item: 'teleport', text: '获得「迁点」（已持有则折现 ￥100）' },
  { id: 'c-grant-double', name: '旺季行情', kind: 'grantItem', item: 'doubleRent', text: '获得「租金翻倍」（已持有则折现 ￥100）' },
  { id: 'c-grant-pardon', name: '平安符', kind: 'grantItem', item: 'pardon', text: '获得「免罚」（已持有则折现 ￥100）' },
];

/** 免费升级无地可升时的折现额（spec §5.3 `c-freeUpgrade`） */
export const FREE_UPGRADE_REFUND = 180;