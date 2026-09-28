/** 骰子面数 */
export const DICE_FACES = 6;
/** 每回合掷两颗（spec §5.1） */
export const DICE_COUNT = 2;

export interface DiceRoll {
  d1: number;
  d2: number;
  total: number;
}

export interface Dice {
  roll(): DiceRoll;
}

/**
 * mulberry32：32 位确定性伪随机（返回值落在 [0,1)，用法同 Math.random）。
 * 同 seed → 同序列：① 单测可断言分布与众数；② `?seed=` 让验收截图与线上回归完全可复现。
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 建一副双骰：不传 seed 走当前时间（真实对局），传 seed 走确定性序列（测试 / 回放） */
export function createDice(seed?: number): Dice {
  const rnd = makeRng(seed ?? (Date.now() & 0xffffffff));
  const face = (): number => 1 + Math.floor(rnd() * DICE_FACES);
  return {
    roll: (): DiceRoll => {
      const d1 = face();
      const d2 = face();
      return { d1, d2, total: d1 + d2 };
    },
  };
}