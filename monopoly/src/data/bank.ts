/**
 * 银行信贷数值真源（M20.2 · spec §3.2 / 决策 M20.2-D2）。
 * 三条产品线：存款（+3%/轮复利）/ 信用贷款（6%·8 轮·额度 min(￥2000, 净资产×30%)）/
 * 抵押贷款（4%·6 轮·变卖价×80%）；两条违约链常量（罚息 +50% / 逾期满 3 轮强执）。
 * 裸值只在此处定义，core / ui / render 一律引用本文件，禁止各处硬编码。
 */

/** 鹿乡银行所在地块序号（办理信用贷款 / 抵押贷款须站此格；spec §3.2） */
export const BANK_TILE_INDEX = 9;
/** 存款利率 +3%/轮（轮末复利，spec §3.3） */
export const DEPOSIT_RATE = 0.03;
/** 信用贷款利率 6%/轮（轮末复利） */
export const LOAN_RATE = 0.06;
/** 信用贷款期限 8 轮（`state.round > due` 即逾期） */
export const LOAN_TERM = 8;
/** 信用贷款额度上限 ￥2000 */
export const LOAN_CAP = 2000;
/** 信用贷款额度基数比例 = 净资产 30%（spec §3.2 要点，基数不扣既有债务） */
export const LOAN_NET_RATIO = 0.3;
/** 抵押贷款利率 4%/轮（轮末复利） */
export const MORTGAGE_RATE = 0.04;
/** 抵押贷款期限 6 轮 */
export const MORTGAGE_TERM = 6;
/** 抵押贷款成数 = 地块变卖价 × 80% */
export const MORTGAGE_LTV = 0.8;
/** 逾期付租罚息 +50%（直冲欠款本金，不给地主；决策 D5） */
export const RENT_PENALTY = 0.5;
/** 连续逾期满 3 轮 → 强制执行（拍卖其 1 块地产；决策 D6） */
export const OVERDUE_SEIZE_ROUNDS = 3;
/** 落银行格的存款红包 = 存款 × 5%（决策 D8/D22） */
export const BANK_DEPOSIT_BONUS = 0.05;
