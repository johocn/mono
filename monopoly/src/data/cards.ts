/**
 * 卡牌数据唯一真源（spec §5.3）：5 种常驻手牌道具 + 命运牌堆 6 张 + 机会牌堆 6 张。
 *
 * 牌堆张数与棋盘格数**解耦**（M5 全局契约 ②）：棋盘上只有 5 个 `fate` 格与 5 个 `chance` 格
 * （见 `board.ts`），但牌堆各 6 张；落到任意一个 `fate`/`chance` 格都从对应 6 张牌堆里抽 1 张，
 * 抽空即整堆洗牌重来。格数是「触发点」，张数是「内容表」，两者生命周期不同，故分别定义。
 */

export type ItemCardKind = 'bomb' | 'barrier' | 'pardon' | 'teleport' | 'doubleRent';

export interface ItemCardDef {
  kind: ItemCardKind;
  name: string;
  desc: string;
  target: 'none' | 'tile' | 'foe' | 'self';
}

export const ITEM_CARDS: ItemCardDef[] = [
  { kind: 'bomb', name: '炸弹', desc: '拆对手目标地块 1 级（L1 炸回无主）', target: 'foe' },
  { kind: 'barrier', name: '路障', desc: '在前方 1–6 格内设障，拦停下一位经过者', target: 'tile' },
  { kind: 'pardon', name: '免罚', desc: '自动抵消一次应付租金或一次入狱', target: 'none' },
  { kind: 'teleport', name: '迁点', desc: '本回合以迁点取代移动，落到任意指定格', target: 'tile' },
  { kind: 'doubleRent', name: '租金翻倍', desc: '本人下一次收租翻倍，收完消耗', target: 'self' },
];

/** 手牌槽位（5 种道具各持 1 张，去重） */
export const HAND_SIZE = 5;

/** 命运 / 机会牌堆张数（与棋盘 5+5 格解耦） */
export const DECK_SIZE = 6;

/** 路障可设立的最远格数（前方 1–6 格） */
export const BARRIER_RANGE = 6;

/** 炸弹固定只降 1 级（卡面口径） */
export const BOMB_RANGE = 1;

/** 手牌已满时抽到道具卡的折算现金（spec §5.3） */
export const PARDON_REFUND = 100;

export type FateKind = 'fine' | 'tax' | 'back' | 'weather' | 'lockup' | 'swap';

export interface FateCardDef {
  id: string;
  name: string;
  kind: FateKind;
  amount?: number;
  steps?: number;
  text: string;
}

export const FATE_DECK: FateCardDef[] = [
  { id: 'f-fine', name: '违规罚金', kind: 'fine', amount: 150, text: '摊位违规，罚金 ￥150' },
  { id: 'f-tax', name: '卫生摊派', kind: 'tax', amount: 200, text: '市场整治，摊派 ￥200' },
  { id: 'f-back', name: '走错路口', kind: 'back', steps: 3, text: '退后 3 格' },
  { id: 'f-weather', name: '天气停业', kind: 'weather', text: '恶劣天气，停业 1 回合' },
  { id: 'f-lockup', name: '临时看管', kind: 'lockup', text: '被带往监狱' },
  { id: 'f-swap', name: '铺位调换', kind: 'swap', text: '与随机一位玩家互换位置' },
];

export type ChanceKind = 'bonus' | 'refund' | 'freeUpgrade' | 'rollAgain' | 'drawItem' | 'stockTip';

export interface ChanceCardDef {
  id: string;
  name: string;
  kind: ChanceKind;
  amount?: number;
  item?: ItemCardKind;
  text: string;
}

export const CHANCE_DECK: ChanceCardDef[] = [
  { id: 'c-bonus', name: '邻里扶持金', kind: 'bonus', amount: 300, text: '领取扶持金 ￥300' },
  { id: 'c-refund', name: '消费返现', kind: 'refund', amount: 120, text: '返现 ￥120' },
  { id: 'c-freeUpgrade', name: '免费升级', kind: 'freeUpgrade', text: '随机自有地块升 1 级（无则折现 ￥180）' },
  { id: 'c-rollAgain', name: '再掷一次', kind: 'rollAgain', text: '本回合额外再掷一次' },
  { id: 'c-drawItem', name: '抽道具卡', kind: 'drawItem', text: '随机获得 1 张道具卡（手牌满则折现 ￥100）', item: undefined },
  { id: 'c-stockTip', name: '内幕消息', kind: 'stockTip', text: '随机一支股票下次必涨' },
];

/** 免费升级无地可升时的折现额（spec §5.3 `c-freeUpgrade`） */
export const FREE_UPGRADE_REFUND = 180;