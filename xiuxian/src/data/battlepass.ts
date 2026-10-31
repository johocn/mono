/**
 * 战令 / 月卡 / 签到（数据驱动）。
 * 战令档位按「活跃天数 = 签到天数」解锁；签到每日发基础奖励，每 7 天额外；
 * 月卡激活后 30 天每日可领灵石。全部走 Player 纯方法 + 确定性奖励，无后端依赖。
 */
export interface BpReward {
  stones?: number;
  exp?: number;
  item?: string;
  itemN?: number;
}

export interface BattlePassTier {
  tier: number;
  desc: string;
  reward: BpReward;
}

export const BP_SEASON = 1;
export const BP_TIERS: BattlePassTier[] = buildTiers();
export const SIGNIN_BASE = { stones: 50, exp: 30 };
export const MONTH_CARD_DAYS = 30;
export const MONTH_CARD_STONES = 120;

function buildTiers(): BattlePassTier[] {
  const arr: BattlePassTier[] = [];
  for (let i = 1; i <= 30; i++) {
    const stones = 30 + i * 10;
    const exp = 20 + i * 5;
    arr.push({ tier: i, desc: `第 ${i} 天档位`, reward: { stones, exp } });
  }
  return arr;
}

export function getTier(tier: number): BattlePassTier | undefined {
  return BP_TIERS.find((t) => t.tier === tier);
}

/** 战令档位解锁：活跃天数（签到数）达标 */
export function tierUnlocked(tier: number, activeDays: number): boolean {
  return activeDays >= tier;
}

/** 签到奖励（确定性，按签到序号；每 7 天额外灵石） */
export function signinRewardOf(dayIndex: number): { stones: number; exp: number } {
  const r = { stones: SIGNIN_BASE.stones, exp: SIGNIN_BASE.exp };
  if (dayIndex > 0 && dayIndex % 7 === 0) r.stones += 100;
  return r;
}
