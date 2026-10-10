/**
 * 积分规则 — 换装花园皮肤兑换的获取途径与额度
 *
 * 集中配置便于运营调整；数值均为「单次」额度。
 * 积分只用于换装花园兑换皮肤，与人民币购买并行（双货币）。
 */

export const POINTS_RULES = {
  /** 通关一关 */
  passLevel: 10,
  /** 三星额外奖励（在通关分之上叠加） */
  threeStars: 5,
  /** 每日登录礼 */
  dailyGift: 5,
  /** 看完一次激励广告 */
  adReward: 3,
  /** 成功分享一次 */
  share: 8,
} as const;

export type PointsReason = keyof typeof POINTS_RULES;
